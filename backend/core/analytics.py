"""Analytics: strategy backtests saved from the chart's Strategy Tester, backtest sessions (bar
replays you come back to, with their own account), and your journal for each trade (paper, MT5,
backtest or session). The statistics themselves are worked out in the browser from the
trades (paper trading's own, the linked MT5 account's closed trades — broker_mt5.mt5_history —
and these saved backtests), so the same numbers show wherever the trades come from.
"""
import json

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .models import BacktestRun, ReplaySession, SavedReplay, TradeJournal

MAX_TRADES = 20000
TRADE_FIELDS = {   # what's kept of each backtest trade (the report's own names)
    "type": str, "entryTime": float, "entryPrice": float, "exitTime": float, "exitPrice": float, "qty": float,
    "netPnl": float, "commission": float, "favorableExcursion": float, "adverseExcursion": float,
    "entrySignal": str, "exitSignal": str,
}
SOURCES = ("paper", "mt5", "backtest", "session")
TEXT_FIELDS = ("pre_trade", "post_trade", "emotions", "lessons", "rr_notes")
CHECKS = ("followed_plan", "proper_risk", "good_entry", "patient_exit")


def _clean_trade(t):
    if not isinstance(t, dict):
        return None
    out = {}
    for k, kind in TRADE_FIELDS.items():
        v = t.get(k)
        if v is None:
            continue
        try:
            out[k] = str(v)[:60] if kind is str else float(v)
        except (TypeError, ValueError):
            return None
    if out.get("type") not in ("Long", "Short") or "entryTime" not in out or "netPnl" not in out:
        return None
    return out


def _run_json(r, with_trades=False):
    d = {"id": r.id, "name": r.name, "script": r.script, "language": r.language, "symbol": r.symbol, "timeframe": r.timeframe,
         "initial_capital": r.initial_capital, "net_profit": r.net_profit, "trade_count": r.trade_count,
         "period_from": r.period_from, "period_to": r.period_to, "notes": r.notes, "created_at": int(r.created_at.timestamp() * 1000)}
    if with_trades:
        d["trades"] = r.trades
    return d


@api_view(['GET', 'POST'])
def backtests(request, uid):
    """GET: your saved backtests (without their trades). POST {name, script, language, symbol,
    timeframe, initial_capital, trades}: saves one (its closed trades)."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        return Response({"backtests": [_run_json(r) for r in BacktestRun.objects.filter(owner=me)]})
    d = request.data
    raw = d.get('trades')
    if not isinstance(raw, list) or not raw:
        return Response({"error": "This backtest has no closed trades to save"}, status=status.HTTP_400_BAD_REQUEST)
    if len(raw) > MAX_TRADES:
        return Response({"error": f"At most {MAX_TRADES} trades can be saved"}, status=status.HTTP_400_BAD_REQUEST)
    trades = [t for t in (_clean_trade(t) for t in raw) if t]
    if not trades:
        return Response({"error": "The trades aren't readable"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        capital = float(d.get('initial_capital') or 0)
    except (TypeError, ValueError):
        capital = 0.0
    times = [t["entryTime"] for t in trades] + [t["exitTime"] for t in trades if "exitTime" in t]
    ms = lambda v: int(v * 1000) if v < 1e11 else int(v)
    r = BacktestRun.objects.create(
        owner=me, name=str(d.get('name') or d.get('script') or 'Backtest')[:120], script=str(d.get('script') or '')[:120],
        language=str(d.get('language') or 'pine')[:10], symbol=str(d.get('symbol') or '')[:40], timeframe=str(d.get('timeframe') or '')[:20],
        initial_capital=capital, net_profit=round(sum(t["netPnl"] for t in trades), 2), trade_count=len(trades),
        period_from=ms(min(times)), period_to=ms(max(times)), trades=trades,
    )
    return Response({"backtest": _run_json(r)}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
def backtest(request, uid, bid):
    """GET: one saved backtest with its trades. PATCH {name?, notes?}. DELETE: removes it (and its trades' journals)."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    r = BacktestRun.objects.filter(owner=me, id=bid).first()
    if not r:
        return Response({"error": "That backtest isn't there any more"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        TradeJournal.objects.filter(owner=me, source='backtest', trade_key__startswith=f"{r.id}:").delete()
        r.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == 'PATCH':
        if 'name' in request.data:
            r.name = str(request.data.get('name') or r.name)[:120]
        if 'notes' in request.data:
            r.notes = str(request.data.get('notes') or '')[:5000]
        r.save(update_fields=['name', 'notes'])
    return Response({"backtest": _run_json(r, with_trades=True)})


def _journal_json(j):
    return {"source": j.source, "trade_key": j.trade_key, "symbol": j.symbol, **{f: getattr(j, f) for f in TEXT_FIELDS},
            "tags": j.tags, "checklist": j.checklist, "rating": j.rating, "updated_at": int(j.updated_at.timestamp() * 1000)}


@api_view(['GET', 'PUT', 'DELETE'])
def journal(request, uid):
    """GET ?source=: your journal entries (of one source, or all). PUT {source, trade_key, symbol?,
    pre_trade?, post_trade?, emotions?, lessons?, rr_notes?, tags?, checklist?, rating?}: saves one
    trade's entry. DELETE ?source=&trade_key=: clears it."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        qs = TradeJournal.objects.filter(owner=me)
        src = request.query_params.get('source')
        if src:
            qs = qs.filter(source=src)
        return Response({"entries": [_journal_json(j) for j in qs]})
    params = request.query_params if request.method == 'DELETE' else request.data
    source, key = str(params.get('source') or ''), str(params.get('trade_key') or '')[:120]
    if source not in SOURCES or not key:
        return Response({"error": "Which trade?"}, status=status.HTTP_400_BAD_REQUEST)
    if request.method == 'DELETE':
        TradeJournal.objects.filter(owner=me, source=source, trade_key=key).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    d = request.data
    fields = {f: str(d.get(f) or '')[:5000] for f in TEXT_FIELDS if f in d}
    if 'symbol' in d:
        fields['symbol'] = str(d.get('symbol') or '')[:40]
    if 'tags' in d:
        tags = d.get('tags') if isinstance(d.get('tags'), list) else []
        fields['tags'] = list(dict.fromkeys(str(t).strip()[:30] for t in tags if str(t).strip()))[:20]
    if 'checklist' in d:
        c = d.get('checklist') if isinstance(d.get('checklist'), dict) else {}
        fields['checklist'] = {k: c.get(k) is True for k in CHECKS}
    if 'rating' in d:
        try:
            r = int(d.get('rating')) if d.get('rating') not in (None, '') else None
        except (TypeError, ValueError):
            r = None
        fields['rating'] = min(max(r, 1), 10) if r is not None else None
    j, _ = TradeJournal.objects.update_or_create(owner=me, source=source, trade_key=key, defaults=fields)
    return Response({"entry": _journal_json(j)})


# ---------- backtest sessions ----------

MAX_STATE_BYTES = 3_000_000   # a session's account + book


def _session_json(r, full=False):
    trades = [t for t in ((r.book or {}).get("trades") or []) if isinstance(t, dict)]
    closed = [t for t in trades if t.get("exitTime") is not None]
    d = {"id": r.id, "name": r.name, "symbol": r.symbol, "interval": r.interval, "interval_label": r.interval_label,
         "start_time": r.start_time, "current_time": r.current_time, "visible_bars": r.visible_bars,
         "initial_balance": r.initial_balance, "balance": (r.account or {}).get("balance", r.initial_balance),
         "trade_count": len(closed), "open_count": len(trades) - len(closed),
         "net_pnl": round(sum(float(t.get("pnl") or 0) for t in closed), 2),
         "wins": sum(1 for t in closed if float(t.get("pnl") or 0) > 0),
         "strategy": r.strategy, "description": r.description, "rules": r.rules, "tags": r.tags, "notes": r.notes,
         "status": r.status, "time_spent": r.time_spent,
         "created_at": int(r.created_at.timestamp() * 1000), "updated_at": int(r.updated_at.timestamp() * 1000)}
    if full:
        d.update(account=r.account, book=r.book)
    return d


def _str_list(v, n=30, size=200):
    return [str(x).strip()[:size] for x in v if str(x).strip()][:n] if isinstance(v, list) else []


def _apply(r, d, creating=False):
    """Fills a session from a request (what's in it); returns an error message or None"""
    for f, size in (("name", 120), ("strategy", 120), ("interval_label", 20)):
        if f in d:
            setattr(r, f, str(d.get(f) or '')[:size])
    for f in ("description", "notes"):
        if f in d:
            setattr(r, f, str(d.get(f) or '')[:10000])
    if "rules" in d:
        r.rules = _str_list(d.get("rules"))
    if "tags" in d:
        r.tags = _str_list(d.get("tags"), 20, 30)
    if creating or "symbol" in d:
        r.symbol = str(d.get("symbol") or '').strip()[:40]
    if creating or "interval" in d:
        r.interval = str(d.get("interval") or '').strip()[:20]
    if not r.symbol or not r.interval:
        return "Pick the symbol and timeframe"
    try:
        if creating or "start_time" in d:
            r.start_time = int(float(d.get("start_time")))
        if creating or "current_time" in d:
            r.current_time = int(float(d.get("current_time", r.start_time)))
        if "visible_bars" in d:
            r.visible_bars = int(d.get("visible_bars")) if d.get("visible_bars") not in (None, '') else None
        if creating or "initial_balance" in d:
            r.initial_balance = float(d.get("initial_balance") or 10000)
        if "add_time_spent" in d:
            r.time_spent += max(0, min(int(float(d.get("add_time_spent") or 0)), 3600))   # one save's worth at most
    except (TypeError, ValueError):
        return "Some of the session's numbers aren't readable"
    if r.start_time <= 0 or r.current_time <= 0:
        return "Pick the date the session starts from"
    if not (0 < r.initial_balance <= 1e12):
        return "The starting balance must be above 0"
    if "status" in d:
        if d.get("status") not in dict(ReplaySession.STATUSES):
            return "Status is active, paused or completed"
        r.status = d.get("status")
    if "drawings" in d:
        if not isinstance(d.get("drawings"), list) or len(json.dumps(d.get("drawings"))) > MAX_STATE_BYTES:
            return "The drawings aren't readable"
        r.drawings = d.get("drawings")
    if "account" in d or "book" in d:
        acc, book = d.get("account"), d.get("book")
        if not isinstance(acc, dict) or not isinstance(book, dict):
            return "The session's account isn't readable"
        if len(json.dumps(acc)) + len(json.dumps(book)) > MAX_STATE_BYTES:
            return "This session has grown too large to save"
        r.account, r.book = acc, book
    return None


@api_view(['GET', 'POST'])
def sessions(request, uid):
    """GET: your backtest sessions (without their accounts). POST {name, symbol, interval,
    interval_label?, start_time, initial_balance, strategy?, description?, rules?, tags?}: a new one."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        return Response({"sessions": [_session_json(r) for r in ReplaySession.objects.filter(owner=me)]})
    r = ReplaySession(owner=me)
    err = _apply(r, request.data, creating=True)
    if err:
        return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
    if not r.name:
        r.name = f"{r.symbol} backtest"
    r.save()
    return Response({"session": _session_json(r, full=True)}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
def session(request, uid, sid):
    """GET: one session, with its account. PATCH: saves its progress (current_time, interval,
    visible_bars, account + book, add_time_spent, status) or its details. DELETE: removes it."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    r = ReplaySession.objects.filter(owner=me, id=sid).first()
    if not r:
        return Response({"error": "That backtest session isn't there any more"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        TradeJournal.objects.filter(owner=me, source='session', trade_key__startswith=f"{r.id}:").delete()
        r.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == 'PATCH':
        err = _apply(r, request.data)
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        r.save()
    return Response({"session": _session_json(r, full=True)})


@api_view(['GET', 'PUT'])
def session_drawings(request, uid, sid):
    """A backtest session's own drawings (the chart shows these instead of the symbol's while it
    runs). GET: them. PUT {drawings}: replaces them."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    r = ReplaySession.objects.filter(owner=me, id=sid).first()
    if not r:
        return Response({"error": "That backtest session isn't there any more"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'PUT':
        drawings = request.data.get('drawings')
        if not isinstance(drawings, list) or len(json.dumps(drawings)) > MAX_STATE_BYTES:
            return Response({"error": "The drawings aren't readable"}, status=status.HTTP_400_BAD_REQUEST)
        r.drawings = drawings
        r.save(update_fields=['drawings', 'updated_at'])
    return Response({"drawings": r.drawings})


# ---------- bar replay's "Save this replay" ----------

def _replay_json(r):
    return {"symbol": r.symbol, "interval": r.interval, "time": r.time, "savedAt": r.saved_at}


@api_view(['GET', 'PUT', 'DELETE'])
def saved_replays(request, uid):
    """GET: your saved replays (one per symbol). PUT {symbol, interval, time, savedAt?}: saves one
    (an older save than the one kept is ignored, so a late upload never undoes a newer one).
    DELETE ?symbol=: forgets it."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        return Response({"replays": [_replay_json(r) for r in SavedReplay.objects.filter(owner=me)]})
    if request.method == 'DELETE':
        SavedReplay.objects.filter(owner=me, symbol=str(request.query_params.get('symbol') or '')[:40]).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    d = request.data
    symbol, interval = str(d.get('symbol') or '').strip()[:40], str(d.get('interval') or '').strip()[:20]
    try:
        t = int(float(d.get('time')))
        saved_at = int(float(d.get('savedAt') or 0)) or int(timezone.now().timestamp() * 1000)
    except (TypeError, ValueError):
        return Response({"error": "Which bar?"}, status=status.HTTP_400_BAD_REQUEST)
    if not symbol or not interval or t <= 0:
        return Response({"error": "Which symbol, timeframe and bar?"}, status=status.HTTP_400_BAD_REQUEST)
    r = SavedReplay.objects.filter(owner=me, symbol=symbol).first()
    if r and r.saved_at > saved_at:
        return Response({"replay": _replay_json(r)})
    r, _ = SavedReplay.objects.update_or_create(owner=me, symbol=symbol, defaults={"interval": interval, "time": t, "saved_at": saved_at})
    return Response({"replay": _replay_json(r)})
