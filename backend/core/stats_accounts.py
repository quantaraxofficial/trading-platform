"""Connected accounts: a trader's MT5 and cTrader accounts at any broker or prop firm, read only, for
their stats (Analytics), their live state, prop-firm rules (core/prop_rules.py) and the leaderboard.

- MT5: the account number, its server and its *investor* (read-only) password, read through the
  MetaTrader 5 terminal as the trading link does (core/broker_mt5.py: one terminal, one lock).
- cTrader: signed in with cTrader, view-only permission (core/ctrader_api.py).
Every trade on the account counts, wherever it was placed (TradePilot, the broker's platform, a
phone, an EA). The whole history is read on "Refresh" and kept; the live state (balance, equity,
open positions and their floating P&L) is read when shown, and only if the trader shows it.

The leaderboard: accounts their traders put on it, ranked by return over the period (also by
profit factor, win rate or net profit), from the trades read from the broker — verified figures,
not typed ones; at least 5 closed trades in the period."""

import time
from datetime import datetime, timedelta, timezone as dt_tz

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import broker_mt5 as mt
from . import ctrader_api as ct
from . import prop_rules
from .auth import require_session
from .models import StatsAccount

MAX_ACCOUNTS = 20
LEADERBOARD_MIN_TRADES = 5
RULE_FIELDS = ("firm", "phase", "account_size", "profit_target_pct", "daily_loss_pct", "max_loss_pct", "max_loss_trailing", "min_trading_days")


class ReadError(Exception):
    def __init__(self, message, code=502):
        super().__init__(message)
        self.message, self.code = message, code


# ---------------------------------------------------------------- reading the broker

def _mt5_read(acc, history):
    password = mt.decrypt_password(acc.password)
    if not password:
        raise ReadError("Connect the account again (its saved password can't be read)", 409)
    try:
        with mt._lock:
            m = mt._login(acc.login, password, acc.server)
            snap = mt._snapshot(m)
            out = {"account": {
                "login": acc.login, "broker": snap["account"]["company"], "currency": snap["account"]["currency"],
                "balance": snap["account"]["balance"], "equity": snap["account"]["equity"], "floating": snap["account"]["profit"],
                "margin": snap["account"]["margin"], "free_margin": snap["account"]["free_margin"],
                "leverage": snap["account"]["leverage"], "mode": snap["account"]["mode"]},
                "positions": [{k: p[k] for k in ("ticket", "symbol", "side", "volume", "open_price", "sl", "tp", "profit", "swap", "time")}
                              for p in snap["positions"]]}
            if history:
                trades = [{**t, "pnl": round(t["profit"] + t["commission"] + t["swap"], 2)} for t in mt.closed_trades(m, 7300)]
                # the first deposit is the starting balance (else: today's balance less every trade's result)
                now, off = int(time.time()), mt._server_offset(m)
                deposits = sorted((d for d in (m.history_deals_get(0, now + off + 60) or []) if d.type == 2), key=lambda d: d.time)
                out["trades"] = trades
                out["initial_balance"] = round(deposits[0].profit, 2) if deposits and deposits[0].profit > 0 \
                    else round(out["account"]["balance"] - sum(t["pnl"] for t in trades), 2)
            return out
    except mt.BrokerError as e:
        raise ReadError(e.message, e.code)


def _ctrader_token(acc):
    """The account's access token, renewed when it's about to run out"""
    token = mt.decrypt_password(acc.access_token)
    if not token:
        raise ReadError("Connect cTrader again (its saved permission can't be read)", 409)
    if acc.token_expires_at and acc.token_expires_at - timezone.now() < timedelta(days=2):
        t = ct.refresh_token(mt.decrypt_password(acc.refresh_token))
        StatsAccount.objects.filter(owner=acc.owner, platform='ctrader', access_token=acc.access_token).update(
            access_token=mt.encrypt_password(t["access"]), refresh_token=mt.encrypt_password(t["refresh"]),
            token_expires_at=timezone.now() + timedelta(seconds=t["expires_in"]))
        # (and on this one, so saving it doesn't put the old, now dead tokens back)
        acc.access_token, acc.refresh_token = mt.encrypt_password(t["access"]), mt.encrypt_password(t["refresh"])
        acc.token_expires_at = timezone.now() + timedelta(seconds=t["expires_in"])
        token = t["access"]
    return token


def _read(acc, history):
    try:
        if acc.platform == 'mt5':
            return _mt5_read(acc, history)
        return ct.read_account(_ctrader_token(acc), acc.ctid_account_id, acc.is_live, history=history)
    except ct.CtraderError as e:
        raise ReadError(e.message, e.code)


# ---------------------------------------------------------------- JSON

def _account_json(acc, with_trades=False, live=None):
    out = {
        "id": acc.id, "platform": acc.platform, "label": acc.label, "login": acc.login, "server": acc.server, "broker": acc.broker,
        "currency": acc.currency or "USD", "mode": acc.mode, "show_live": acc.show_live, "on_leaderboard": acc.on_leaderboard,
        "rules": {f: getattr(acc, f) for f in RULE_FIELDS}, "initial_balance": acc.initial_balance, "balance": acc.balance,
        "synced_at": acc.synced_at.isoformat() if acc.synced_at else None, "last_error": acc.last_error,
        "trade_count": len(acc.trades or []),
    }
    if with_trades:
        out["trades"] = acc.trades or []
    out["progress"] = prop_rules.progress(prop_rules.rules_of(acc), acc.trades or [], acc.initial_balance,
                                          live=live["account"] if live else None)
    return out


def _owned(request, uid, aid):
    me, denied = require_session(request, uid)
    if denied:
        return None, denied
    acc = StatsAccount.objects.filter(owner=me, id=aid).first()
    if not acc:
        return None, Response({"error": "No such account"}, status=status.HTTP_404_NOT_FOUND)
    return acc, None


def _sync(acc):
    """Reads the whole history and keeps it"""
    data = _read(acc, history=True)
    a = data["account"]
    acc.trades, acc.initial_balance, acc.balance = data["trades"], data["initial_balance"], a["balance"]
    acc.broker, acc.currency, acc.mode = (a.get("broker") or acc.broker)[:100], (a.get("currency") or acc.currency)[:10], (a.get("mode") or acc.mode)[:10]
    acc.synced_at, acc.last_error = timezone.now(), ""
    acc.save()
    return data


# ---------------------------------------------------------------- endpoints

@api_view(['GET', 'POST'])
def accounts(request, uid):
    """GET: your connected accounts. POST {login, password, server, label?}: connects an MT5 account
    (with its investor password: read only) after the broker accepts it, and reads its history."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        return Response({"accounts": [_account_json(a) for a in StatsAccount.objects.filter(owner=me)],
                         "ctrader": ct.configured()})
    if StatsAccount.objects.filter(owner=me).count() >= MAX_ACCOUNTS:
        return Response({"error": f"At most {MAX_ACCOUNTS} accounts"}, status=status.HTTP_400_BAD_REQUEST)
    d = request.data
    try:
        login = int(str(d.get('login') or '').strip())
    except ValueError:
        return Response({"error": "The account number is the number MT5 shows for your account"}, status=status.HTTP_400_BAD_REQUEST)
    password, server = str(d.get('password') or ''), str(d.get('server') or '').strip()[:100]
    if login <= 0 or not password or not server:
        return Response({"error": "Enter the account number, its investor password and the server"}, status=status.HTTP_400_BAD_REQUEST)
    acc = StatsAccount.objects.filter(owner=me, platform='mt5', login=login, server=server).first() or StatsAccount(owner=me, platform='mt5', login=login, server=server)
    acc.password, acc.label = mt.encrypt_password(password), str(d.get('label') or acc.label or '')[:100]
    try:
        with mt._lock:
            mt._login(login, password, server, verify=True)
    except mt.BrokerError as e:
        return Response({"error": e.message}, status=e.code)
    acc.save()
    try:
        _sync(acc)
    except ReadError as e:
        acc.last_error = e.message[:300]
        acc.save(update_fields=['last_error'])
    return Response({"account": _account_json(acc, with_trades=True)}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
def account(request, uid, aid):
    """GET: the account and its kept trades. PATCH: its name, live view, leaderboard, prop rules
    (a preset's firm + phase fill the rules in). DELETE: disconnects it (its password / tokens go)."""
    acc, denied = _owned(request, uid, aid)
    if denied:
        return denied
    if request.method == 'GET':
        return Response({"account": _account_json(acc, with_trades=True)})
    if request.method == 'DELETE':
        acc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    d = request.data
    if 'label' in d:
        acc.label = str(d.get('label') or '')[:100]
    for f in ('show_live', 'on_leaderboard', 'max_loss_trailing'):
        if f in d:
            setattr(acc, f, bool(d.get(f)))
    if 'firm' in d:
        firm, phase = str(d.get('firm') or '')[:40], str(d.get('phase') or '')[:20]
        if firm and firm != 'custom' and firm not in prop_rules.PRESETS:
            return Response({"error": "Unknown firm"}, status=status.HTTP_400_BAD_REQUEST)
        acc.firm, acc.phase = firm, phase
        p = prop_rules.PRESETS.get(firm, {}).get("phases", {}).get(phase)
        if p and not d.get('keep_rules'):
            acc.profit_target_pct, acc.daily_loss_pct, acc.max_loss_pct = p["target"], p["daily"], p["max"]
            acc.max_loss_trailing, acc.min_trading_days = p["trailing"], p["min_days"]
    for f in ('account_size', 'profit_target_pct', 'daily_loss_pct', 'max_loss_pct'):
        if f in d:
            v = d.get(f)
            try:
                v = None if v in (None, '') else float(v)
            except (TypeError, ValueError):
                return Response({"error": "Rules are numbers"}, status=status.HTTP_400_BAD_REQUEST)
            if v is not None and (v < 0 or (f != 'account_size' and v > 100)):
                return Response({"error": "Rules are percentages from 0 to 100"}, status=status.HTTP_400_BAD_REQUEST)
            setattr(acc, f, v)
    if 'min_trading_days' in d:
        try:
            acc.min_trading_days = max(0, min(365, int(d.get('min_trading_days') or 0)))
        except (TypeError, ValueError):
            return Response({"error": "Rules are numbers"}, status=status.HTTP_400_BAD_REQUEST)
    acc.save()
    return Response({"account": _account_json(acc)})


@api_view(['POST'])
def sync(request, uid, aid):
    """Reads the account's whole history again (and its state now)"""
    acc, denied = _owned(request, uid, aid)
    if denied:
        return denied
    try:
        data = _sync(acc)
    except ReadError as e:
        StatsAccount.objects.filter(id=acc.id).update(last_error=e.message[:300])
        return Response({"error": e.message}, status=e.code)
    return Response({"account": _account_json(acc, with_trades=True, live=data), "live": {k: data[k] for k in ("account", "positions")}})


@api_view(['GET'])
def live(request, uid, aid):
    """The account now: balance, equity, floating P&L, open positions; and its prop rules against the equity now"""
    acc, denied = _owned(request, uid, aid)
    if denied:
        return denied
    if not acc.show_live:
        return Response({"error": "The live view of this account is off"}, status=status.HTTP_403_FORBIDDEN)
    try:
        data = _read(acc, history=False)
    except ReadError as e:
        return Response({"error": e.message}, status=e.code)
    data["at"] = int(time.time() * 1000)
    data["progress"] = prop_rules.progress(prop_rules.rules_of(acc), acc.trades or [], acc.initial_balance, live=data["account"])
    StatsAccount.objects.filter(id=acc.id).update(balance=data["account"]["balance"])
    return Response(data)


@api_view(['GET', 'POST'])
def ctrader(request, uid):
    """GET: the address of cTrader's page to allow TradePilot to view your accounts. POST {code}: the
    code cTrader sent back: every account allowed is connected and its history read."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if not ct.configured():
        return Response({"error": "cTrader isn't set up on this site yet"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if request.method == 'GET':
        return Response({"url": ct.auth_url(str(request.query_params.get('state') or '')[:64])})
    code = str(request.data.get('code') or '')[:500]
    if not code:
        return Response({"error": "No code from cTrader"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        tok = ct.exchange_code(code)
        found = ct.list_accounts(tok["access"])
    except ct.CtraderError as e:
        return Response({"error": e.message}, status=e.code)
    if not found:
        return Response({"error": "cTrader gave no accounts: allow at least one"}, status=status.HTTP_400_BAD_REQUEST)
    out = []
    for f in found:
        acc = StatsAccount.objects.filter(owner=me, platform='ctrader', ctid_account_id=f["ctid"]).first()
        if not acc:
            if StatsAccount.objects.filter(owner=me).count() >= MAX_ACCOUNTS:
                break
            acc = StatsAccount(owner=me, platform='ctrader', ctid_account_id=f["ctid"])
        acc.login, acc.is_live, acc.broker = f["login"], f["live"], f["broker"][:100]
        acc.mode = "real" if f["live"] else "demo"
        acc.access_token, acc.refresh_token = mt.encrypt_password(tok["access"]), mt.encrypt_password(tok["refresh"])
        acc.token_expires_at = timezone.now() + timedelta(seconds=tok["expires_in"])
        acc.save()
        try:
            _sync(acc)
        except ReadError as e:
            acc.last_error = e.message[:300]
            acc.save(update_fields=['last_error'])
        out.append(_account_json(acc))
    return Response({"accounts": out}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def presets(request):
    return Response({"presets": prop_rules.presets_json()})


# ---------------------------------------------------------------- the leaderboard

PERIODS = {"7d": 7, "30d": 30, "90d": 90, "1y": 365, "all": None}


def metrics(acc, since_ms):
    """The account's results over the period: return on its balance at the period's start, net,
    win rate, profit factor, the largest drop from a high (% of that high), trades, trading days"""
    trades = sorted((t for t in acc.trades or [] if t.get("exit_time")), key=lambda t: t["exit_time"])
    start = (acc.initial_balance or 0) + sum(t["pnl"] for t in trades if since_ms and t["exit_time"] < since_ms)
    period = [t for t in trades if not since_ms or t["exit_time"] >= since_ms]
    if not period or start <= 0:
        return None
    wins = [t["pnl"] for t in period if t["pnl"] > 0]
    losses = [t["pnl"] for t in period if t["pnl"] < 0]
    bal, peak, dd = start, start, 0.0
    for t in period:
        bal += t["pnl"]
        peak = max(peak, bal)
        dd = max(dd, (peak - bal) / peak * 100 if peak > 0 else 0)
    net = sum(t["pnl"] for t in period)
    return {"return_pct": round(net / start * 100, 2), "net": round(net, 2), "trades": len(period),
            "win_rate": round(len(wins) / len(period) * 100, 1),
            "profit_factor": round(sum(wins) / -sum(losses), 2) if losses else None,
            "max_dd_pct": round(dd, 2), "days": len({datetime.fromtimestamp(t["exit_time"] / 1000, dt_tz.utc).date() for t in period})}


@api_view(['GET'])
def leaderboard(request):
    """?period=7d|30d|90d|1y|all (30d) &sort=return|profit_factor|win_rate|net &platform=mt5|ctrader &mode=real|demo:
    the ranked accounts (public: the traders chose to show them)"""
    from .social import username_of
    period = request.query_params.get('period') or '30d'
    days = PERIODS.get(period, 30)
    since = int((time.time() - days * 86400) * 1000) if days else None
    sort = request.query_params.get('sort') or 'return'
    qs = StatsAccount.objects.filter(on_leaderboard=True).select_related('owner')
    if request.query_params.get('platform') in ('mt5', 'ctrader'):
        qs = qs.filter(platform=request.query_params['platform'])
    if request.query_params.get('mode') in ('real', 'demo'):
        qs = qs.filter(mode=request.query_params['mode'])
    rows = []
    for acc in qs:
        m = metrics(acc, since)
        if not m or m["trades"] < LEADERBOARD_MIN_TRADES:
            continue
        preset = prop_rules.PRESETS.get(acc.firm)
        phase = (preset or {}).get("phases", {}).get(acc.phase, {})
        rows.append({
            **m, "id": acc.id, "name": acc.owner.name, "username": username_of(acc.owner), "platform": acc.platform,
            "broker": acc.broker, "mode": acc.mode, "currency": acc.currency or "USD", "label": acc.label,
            "prop": f"{preset['name']} · {phase.get('label', '')}".rstrip(" ·") if preset else ("Prop firm account" if acc.firm == "custom" else ""),
            "synced_at": acc.synced_at.isoformat() if acc.synced_at else None,
        })
    key = {"return": "return_pct", "profit_factor": "profit_factor", "win_rate": "win_rate", "net": "net"}.get(sort, "return_pct")
    rows.sort(key=lambda r: (r[key] is not None, r[key] if r[key] is not None else 0, r["trades"]), reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return Response({"period": period if period in PERIODS else "30d", "sort": sort, "min_trades": LEADERBOARD_MIN_TRADES, "rows": rows[:100]})


BACKTEST_MIN_TRADES = 10


def _results(pnls, capital):
    """Results of closed trades' P&Ls in order, on a starting capital: return, net, win rate, profit
    factor, the largest drop from a high (% of it), trades"""
    if len(pnls) < BACKTEST_MIN_TRADES or capital <= 0:
        return None
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    bal = peak = capital
    dd = 0.0
    for p in pnls:
        bal += p
        peak = max(peak, bal)
        dd = max(dd, (peak - bal) / peak * 100 if peak > 0 else 0)
    net = sum(pnls)
    return {"return_pct": round(net / capital * 100, 2), "net": round(net, 2), "trades": len(pnls),
            "win_rate": round(len(wins) / len(pnls) * 100, 1), "profit_factor": round(sum(wins) / -sum(losses), 2) if losses else None,
            "max_dd_pct": round(dd, 2)}


def backtest_metrics(r):
    """A saved Strategy Tester report's results"""
    trades = sorted((t for t in r.trades or [] if "netPnl" in t), key=lambda t: t.get("exitTime") or t.get("entryTime") or 0)
    return _results([float(t["netPnl"]) for t in trades], r.initial_capital)


def session_metrics(r):
    """A manual backtest's (bar replay session's) results: its own account's closed trades"""
    trades = [t for t in ((r.book or {}).get("trades") or []) if isinstance(t, dict) and t.get("exitTime") is not None]
    trades.sort(key=lambda t: t.get("exitTime") or 0)
    return _results([float(t.get("pnl") or 0) for t in trades], r.initial_balance)


def _ranked(rows, sort):
    key = {"return": "return_pct", "profit_factor": "profit_factor", "win_rate": "win_rate", "net": "net"}.get(sort, "return_pct")
    rows.sort(key=lambda x: (x[key] is not None, x[key] if x[key] is not None else 0, x["trades"]), reverse=True)
    for i, x in enumerate(rows):
        x["rank"] = i + 1
    return rows[:100]


@api_view(['GET'])
def backtest_leaderboard(request):
    """?sort=return|profit_factor|win_rate|net &symbol=: algo backtests (the Strategy Tester's, saved to
    Analytics) their owners put on the leaderboard, of strategies they published, privately or publicly
    (a private one: its name and results, not its code); at least 10 trades"""
    from .models import BacktestRun, PublishedScript
    from .social import username_of
    sort = request.query_params.get('sort') or 'return'
    qs = BacktestRun.objects.filter(on_leaderboard=True).select_related('owner')
    sym = str(request.query_params.get('symbol') or '').strip()
    if sym:
        qs = qs.filter(symbol__icontains=sym[:40])
    published = {(p.owner_id, p.name.strip().lower()): p for p in PublishedScript.objects.filter(owner__in=qs.values('owner'))}
    rows = []
    for r in qs:
        pub = published.get((r.owner_id, (r.script or '').strip().lower()))
        m = backtest_metrics(r) if pub else None
        if not m:
            continue
        rows.append({**m, "id": r.id, "name": r.owner.name, "username": username_of(r.owner), "strategy": r.name, "script": r.script,
                     "language": r.language, "symbol": r.symbol, "timeframe": r.timeframe, "capital": r.initial_capital,
                     "period_from": r.period_from, "period_to": r.period_to, "published": pub.visibility,
                     "script_id": pub.id if pub.visibility == 'public' else None})
    return Response({"sort": sort, "min_trades": BACKTEST_MIN_TRADES, "rows": _ranked(rows, sort)})


@api_view(['GET'])
def manual_leaderboard(request):
    """?sort=return|profit_factor|win_rate|net &symbol=: manual backtests (bar replay sessions, traded by
    hand) their owners put on the leaderboard, ranked on their own account's closed trades; at least 10"""
    from .models import ReplaySession
    from .social import username_of
    sort = request.query_params.get('sort') or 'return'
    qs = ReplaySession.objects.filter(on_leaderboard=True).select_related('owner')
    sym = str(request.query_params.get('symbol') or '').strip()
    if sym:
        qs = qs.filter(symbol__icontains=sym[:40])
    rows = []
    for r in qs:
        m = session_metrics(r)
        if not m:
            continue
        rows.append({**m, "id": r.id, "name": r.owner.name, "username": username_of(r.owner), "session": r.name, "strategy": r.strategy,
                     "symbol": r.symbol, "timeframe": r.interval_label or r.interval, "capital": r.initial_balance, "status": r.status,
                     "period_from": r.start_time * 1000, "period_to": r.current_time * 1000, "time_spent": r.time_spent})
    return Response({"sort": sort, "min_trades": BACKTEST_MIN_TRADES, "rows": _ranked(rows, sort)})
