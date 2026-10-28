"""Auto-trading chart strategies on your linked MetaTrader 5 account.

A strategy on the chart (Pine, Python or MQL5) is switched on for auto-trading with the lots it
trades. From then on the chart reports the strategy's position whenever the strategy recalculates
(each bar close, and each tick with "On realtime bar tick"), and the account follows it: the
strategy goes long → a market buy; short → a market sell; flat → its position is closed; a
reversal closes one and opens the other. Each strategy's orders carry their own magic number
(ALGO_MAGIC + its id) and the comment "TradePilot algo #<id>", so it only ever touches its own
positions — never your manual trades or another strategy's.

The same report arriving twice (two tabs, a reconnect, a re-run) changes nothing: the server keeps
the strategy position it last acted on ("long@<entry time>", "short@…", "flat") and trades only
when that changes, under the terminal's one lock. A position the strategy entered before
auto-trading was switched on is left alone (it trades from the next signal), and an entry that's
already older than a bar (the chart wasn't open when it happened) is skipped rather than chased.
A rejected order is retried at most once a minute. Real-money accounts need "I understand" when
switching on. Everything done is in the strategy's log.
"""
import time
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .broker_mt5 import BrokerError, _check_can_trade, _guard, _login, _session, _symbol, _volume, close_position, place_order
from .models import AlgoLog, AlgoStrategy

ALGO_MAGIC = 26100000
RETRY_SECONDS = 60


def magic_of(strat):
    return ALGO_MAGIC + strat.id


def _strategy_json(s):
    return {"id": s.id, "key": s.key, "name": s.name, "symbol": s.symbol, "timeframe": s.timeframe, "lots": s.lots,
            "enabled": s.enabled, "real_confirmed": s.real_confirmed, "last_key": s.last_key, "magic": magic_of(s),
            "comment": f"TradePilot algo #{s.id}"}


def _log_json(e):
    return {"id": e.id, "strategy": e.strategy_id, "name": e.strategy.name, "at": int(e.at.timestamp() * 1000),
            "action": e.action, "message": e.message, "ok": e.ok}


def _log(strat, action, message, ok=True):
    return AlgoLog.objects.create(strategy=strat, action=action, message=message[:300], ok=ok)


def _position_key(pos):
    """The strategy's position as reported by the chart ({dir: 1 | -1, entry_time} or null) → its key"""
    if not pos or not pos.get('dir'):
        return "flat", 0, 0
    try:
        direction = 1 if float(pos['dir']) > 0 else -1
        entry = int(float(pos.get('entry_time') or 0))
    except (TypeError, ValueError):
        raise BrokerError("The strategy's position isn't readable", status.HTTP_400_BAD_REQUEST)
    if entry > 10 ** 11:   # milliseconds
        entry //= 1000
    return f"{'long' if direction > 0 else 'short'}@{entry}", direction, entry


def _when(ts):
    return time.strftime('%d %b %H:%M UTC', time.gmtime(ts))


def sync(mt5, strat, pos, bar_seconds, now=None):
    """Brings the strategy's own positions at the broker to the strategy's position; returns what it did"""
    key, direction, entry = _position_key(pos)
    if key == strat.last_key:
        return "none", []
    now = now or time.time()
    _check_can_trade(mt5, {"confirm_real": strat.real_confirmed})
    name, info = _symbol(mt5, strat.symbol)
    magic, done = magic_of(strat), []
    mine = [p for p in (mt5.positions_get() or []) if getattr(p, 'magic', 0) == magic and p.symbol == name]
    want = None if direction == 0 else (0 if direction > 0 else 1)   # MT5 position type: 0 buy, 1 sell
    for p in mine:
        if p.type != want:
            r = close_position(mt5, p.ticket, magic=magic, comment=f"TradePilot algo #{strat.id}")
            side = "buy" if p.type == 0 else "sell"
            done.append(_log(strat, "close", f"Closed the {side} {p.volume} {name} at {r['price']} (strategy {'went flat' if want is None else 'reversed'})"))
    if want is not None and not any(p.type == want for p in mine):
        age = now - entry
        if entry and age > bar_seconds + 120:
            done.append(_log(strat, "skip", f"Skipped the {'long' if direction > 0 else 'short'} entry of {_when(entry)}: it's "
                                            f"{int(age // 60)} min old (the chart wasn't running then), so it waits for the next signal", ok=False))
        else:
            side = "buy" if direction > 0 else "sell"
            r = place_order(mt5, {"symbol": name, "side": side, "type": "market", "volume": _volume(info, strat.lots)},
                            magic=magic, comment=f"TradePilot algo #{strat.id}")
            done.append(_log(strat, "open", f"{'Bought' if side == 'buy' else 'Sold'} {r['volume'] or strat.lots} {name} at {r['price']} "
                                            f"(strategy went {'long' if direction > 0 else 'short'})"))
    strat.last_key, strat.failed_key, strat.failed_at = key, '', None
    strat.save(update_fields=['last_key', 'failed_key', 'failed_at', 'updated_at'])
    return ("traded" if any(e.ok for e in done) else "skipped" if done else "none"), done


# ---------- endpoints ----------

@api_view(['GET', 'POST'])
def algo_strategies(request, uid):
    """GET: your auto-traded strategies and their recent log. POST {key, name, symbol, timeframe,
    lots, enabled, confirm_real?, position}: switches one on (checking the account can trade it,
    and taking the strategy's current position as already handled) or off, or changes its lots."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        strategies = AlgoStrategy.objects.filter(owner=me).order_by('-updated_at')
        log = AlgoLog.objects.filter(strategy__owner=me).select_related('strategy')[:100]
        return Response({"strategies": [_strategy_json(s) for s in strategies], "log": [_log_json(e) for e in log]})

    data = request.data
    key = str(data.get('key') or '').strip()[:200]
    sym = str(data.get('symbol') or '').strip()[:40]
    if not key or not sym:
        return Response({"error": "Which strategy?"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        lots = float(data.get('lots') or 0.01)
    except (TypeError, ValueError):
        return Response({"error": "Enter the lots to trade"}, status=status.HTTP_400_BAD_REQUEST)
    enable = data.get('enabled') is True
    strat = AlgoStrategy.objects.filter(owner=me, key=key).first()

    if not enable:
        if strat and strat.enabled:
            strat.enabled = False
            strat.save(update_fields=['enabled', 'updated_at'])
            _log(strat, "off", "Auto-trade off: its open position (if any) stays as it is")
        return Response({"strategy": _strategy_json(strat) if strat else None})

    found, denied = _session(request, uid)
    if denied:
        return denied
    acc, password = found

    def go():
        mt5 = _login(acc.login, password, acc.server)
        _check_can_trade(mt5, {"confirm_real": data.get('confirm_real')})
        name, info = _symbol(mt5, sym)
        vol = _volume(info, lots)
        pos_key = _position_key(data.get('position'))[0]
        was_on = bool(strat and strat.enabled)
        s, _ = AlgoStrategy.objects.update_or_create(owner=me, key=key, defaults={
            "name": str(data.get('name') or 'Strategy')[:100], "symbol": sym, "timeframe": str(data.get('timeframe') or '')[:20],
            "lots": vol, "enabled": True, "real_confirmed": data.get('confirm_real') is True,
        })
        if not was_on:
            # What the strategy holds right now was decided before it was on: it trades from the next signal
            s.last_key, s.failed_key, s.failed_at = pos_key, '', None
            s.save(update_fields=['last_key', 'failed_key', 'failed_at'])
            held = "" if pos_key == "flat" else f" Its current {pos_key.split('@')[0]} (entered before) isn't copied: it trades from the next signal."
            _log(s, "on", f"Auto-trade on: {vol} lots of {name} on {acc.server} ({acc.login}).{held}")
        else:
            _log(s, "lots", f"Now trades {vol} lots of {name}")
        return Response({"strategy": _strategy_json(s)}, status=status.HTTP_201_CREATED)
    return _guard(go)


@api_view(['DELETE'])
def algo_strategy(request, uid, sid):
    """Forgets a strategy and its log (its open position, if any, stays at the broker)"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    AlgoStrategy.objects.filter(owner=me, id=sid).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
def algo_sync(request, uid):
    """{key, position: {dir, entry_time} | null, bar_seconds}: the strategy's position as the chart
    has it now; the account follows it (once per change)"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    strat = AlgoStrategy.objects.filter(owner=me, key=str(request.data.get('key') or '')[:200]).first()
    if not strat or not strat.enabled:
        return Response({"action": "off"})
    try:
        key = _position_key(request.data.get('position'))[0]
        bar_seconds = min(max(int(float(request.data.get('bar_seconds') or 60)), 60), 31 * 86400)
    except (BrokerError, TypeError, ValueError):
        return Response({"error": "The strategy's position isn't readable"}, status=status.HTTP_400_BAD_REQUEST)
    if key == strat.last_key:
        return Response({"action": "none"})
    if strat.failed_key == key and strat.failed_at and timezone.now() - strat.failed_at < timedelta(seconds=RETRY_SECONDS):
        return Response({"action": "wait"})
    found, denied = _session(request, uid)
    if denied:
        return denied
    acc, password = found

    def go():
        strat.refresh_from_db()   # another request may have handled it while this one waited for the lock
        if not strat.enabled:
            return Response({"action": "off"})
        try:
            mt5 = _login(acc.login, password, acc.server)
            action, done = sync(mt5, strat, request.data.get('position'), bar_seconds)
        except BrokerError as e:
            strat.failed_key, strat.failed_at = key, timezone.now()
            strat.save(update_fields=['failed_key', 'failed_at'])
            _log(strat, "error", f"Couldn't follow the strategy ({key.split('@')[0]}): {e.message}", ok=False)
            raise
        return Response({"action": action, "log": [_log_json(e) for e in done]})
    return _guard(go)
