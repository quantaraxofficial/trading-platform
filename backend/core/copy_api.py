"""Trade copying on the site (core/copier.py, copier_service.py): channels you run, channels you
follow, signals, and what each signal did on each follower's broker account.

- A channel's owner: creates it (name, default risk %, max slippage), shares its join code, turns
  on "copy my MT5 trades" (needs their MT5 linked) and / or sends signals from the site (open with
  SL / TP / risk %, move stops, close all or part), and sees every signal's results per follower.
- A follower: joins with the code, links MT5 ("Trade with your broker"), turns on auto-copy (a
  real-money account confirms it once) and sets their limits: risk per trade (the signal's or
  their own), maximum risk, open copied trades, a daily loss limit, the symbols they take, lots
  for signals without a stop loss.
"""
import secrets
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .models import BrokerAccount, CopierHeartbeat, CopyChannel, CopyExecution, CopySignal, CopySubscription

HEARTBEAT_FRESH = timedelta(seconds=20)


def _code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        c = "".join(secrets.choice(alphabet) for _ in range(8))
        if not CopyChannel.objects.filter(code=c).exists():
            return c


def _copier_status():
    beats = list(CopierHeartbeat.objects.filter(seen__gte=timezone.now() - HEARTBEAT_FRESH))
    return {"running": bool(beats), "terminals": sum(b.terminals for b in beats), "connected": sum(b.connected for b in beats)}


def _num(d, key, lo, hi, default=None):
    v = d.get(key)
    if v in (None, ''):
        v = default   # (left blank: the default, if there is one)
    if v in (None, ''):
        return None
    v = float(v)
    if not (lo <= v <= hi):
        raise ValueError(f"{key} must be between {lo:g} and {hi:g}")
    return v


def _channel_json(c, full=False):
    d = {"id": c.id, "name": c.name, "description": c.description, "code": c.code, "default_risk": c.default_risk,
         "max_slippage": c.max_slippage, "mirror_mt5": c.mirror_mt5, "active": c.active, "owner": c.owner.name,
         "subscribers": c.subscriptions.count(), "copying": c.subscriptions.filter(auto_copy=True).count(),
         "created_at": int(c.created_at.timestamp() * 1000)}
    if full:
        d["signals"] = [_signal_json(s) for s in c.signals.order_by("-id")[:100].annotate(
            filled=Count("executions", filter=Q(executions__status__in=["filled", "modified", "closed"])),
            skipped=Count("executions", filter=Q(executions__status="skipped")),
            failed=Count("executions", filter=Q(executions__status="failed")))]
        d["followers"] = [_sub_json(s, owner_view=True) for s in c.subscriptions.select_related("subscriber")]
    return d


def _signal_json(s):
    return {"id": s.id, "kind": s.kind, "ref": s.ref, "source": s.source, "symbol": s.symbol, "side": s.side, "entry": s.entry, "sl": s.sl,
            "tp": s.tp, "risk_percent": s.risk_percent, "fraction": s.fraction, "created_at": int(s.created_at.timestamp() * 1000),
            **({"filled": s.filled, "skipped": s.skipped, "failed": s.failed} if hasattr(s, "filled") else {})}


def _sub_json(s, owner_view=False):
    acc = BrokerAccount.objects.filter(owner_id=s.subscriber_id, platform='mt5').first()
    d = {"id": s.id, "channel": s.channel_id, "auto_copy": s.auto_copy, "terminal_status": s.terminal_status, "terminal_error": s.terminal_error,
         "broker": {"login": acc.login, "server": acc.server, "mode": acc.mode} if acc else None,
         "created_at": int(s.created_at.timestamp() * 1000)}
    if owner_view:
        last = s.executions.order_by("-id").first()
        d.update(name=s.subscriber.name, last={"status": last.status, "message": last.message, "at": int(last.created_at.timestamp() * 1000)} if last else None)
    else:
        d.update(risk_mode=s.risk_mode, risk_percent=s.risk_percent, max_risk=s.max_risk, no_sl_lots=s.no_sl_lots, max_open=s.max_open,
                 daily_loss_limit=s.daily_loss_limit, symbols=s.symbols, real_confirmed=s.real_confirmed,
                 channel_info={"name": s.channel.name, "owner": s.channel.owner.name, "default_risk": s.channel.default_risk, "active": s.channel.active})
    return d


def _exec_json(e):
    sig = e.signal
    return {"id": e.id, "signal": sig.id, "kind": sig.kind, "signal_symbol": sig.symbol, "side": sig.side, "status": e.status, "ticket": e.ticket,
            "symbol": e.symbol, "volume": e.volume, "price": e.price, "sl": e.sl, "tp": e.tp, "message": e.message, "latency_ms": e.latency_ms,
            "at": int(e.created_at.timestamp() * 1000)}


@api_view(['GET'])
def overview(request, uid):
    """Your channels, the channels you follow, and whether the copier service is running"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    return Response({
        "channels": [_channel_json(c) for c in CopyChannel.objects.filter(owner=me).order_by("-id")],
        "following": [_sub_json(s) for s in CopySubscription.objects.filter(subscriber=me).select_related("channel", "channel__owner").order_by("-id")],
        "copier": _copier_status(),
        "mt5_linked": BrokerAccount.objects.filter(owner=me, platform='mt5').exists(),
    })


@api_view(['POST'])
def create_channel(request, uid):
    me, denied = require_session(request, uid)
    if denied:
        return denied
    d = request.data
    name = str(d.get('name') or '').strip()[:100]
    if not name:
        return Response({"error": "Give the channel a name"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        risk = _num(d, 'default_risk', 0.01, 10, 1.0)
        slip = _num(d, 'max_slippage', 0, 100, 25.0)
    except (TypeError, ValueError) as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    c = CopyChannel.objects.create(owner=me, name=name, description=str(d.get('description') or '')[:2000], code=_code(), default_risk=risk, max_slippage=slip)
    return Response({"channel": _channel_json(c, full=True)}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
def channel(request, uid, cid):
    """Your channel: its signals with their results, and its followers. PATCH: name, description,
    default_risk, max_slippage, active, mirror_mt5. DELETE: removes it (followers stop copying)."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    c = CopyChannel.objects.filter(owner=me, id=cid).first()
    if not c:
        return Response({"error": "That channel isn't yours, or isn't there any more"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        c.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == 'PATCH':
        d = request.data
        try:
            if 'default_risk' in d:
                c.default_risk = _num(d, 'default_risk', 0.01, 10)
            if 'max_slippage' in d:
                c.max_slippage = _num(d, 'max_slippage', 0, 100)
        except (TypeError, ValueError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        if 'name' in d and str(d['name']).strip():
            c.name = str(d['name']).strip()[:100]
        if 'description' in d:
            c.description = str(d.get('description') or '')[:2000]
        if 'active' in d:
            c.active = d.get('active') is True
        if 'mirror_mt5' in d:
            on = d.get('mirror_mt5') is True
            if on and not BrokerAccount.objects.filter(owner=me, platform='mt5').exists():
                return Response({"error": "Link your MT5 account first (Trade with your broker → MetaTrader 5)"}, status=status.HTTP_409_CONFLICT)
            if on and not c.mirror_mt5:
                c.mirror_since = timezone.now().replace(microsecond=0)   # what's already open isn't copied (MT5 times are whole seconds)
            c.mirror_mt5 = on
        c.save()
    return Response({"channel": _channel_json(c, full=True), "copier": _copier_status()})


@api_view(['POST'])
def send_signal(request, uid, cid):
    """A signal from the site. {kind: open, symbol, side, sl, tp?, risk_percent?} (at the market; its
    ref comes back), {kind: modify, ref, sl?, tp?} or {kind: close, ref, fraction?}"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    c = CopyChannel.objects.filter(owner=me, id=cid, active=True).first()
    if not c:
        return Response({"error": "That channel isn't yours, or it's paused"}, status=status.HTTP_404_NOT_FOUND)
    d = request.data
    kind = d.get('kind')
    try:
        sl, tp = _num(d, 'sl', 0, 1e9), _num(d, 'tp', 0, 1e9)
        if kind == 'open':
            side = d.get('side')
            symbol = str(d.get('symbol') or '').strip()[:40]
            if side not in ('buy', 'sell') or not symbol:
                return Response({"error": "Pick the symbol and buy or sell"}, status=status.HTTP_400_BAD_REQUEST)
            risk = _num(d, 'risk_percent', 0.01, 10, c.default_risk)
            s = CopySignal.objects.create(channel=c, kind='open', ref='pending', source='site', symbol=symbol, side=side, sl=sl, tp=tp, risk_percent=risk)
            s.ref = f"s{s.id}"
            s.save(update_fields=['ref'])
        elif kind in ('modify', 'close'):
            ref = str(d.get('ref') or '')
            opened = CopySignal.objects.filter(channel=c, kind='open', ref=ref).first()
            if not opened:
                return Response({"error": "Which trade? (its signal isn't in this channel)"}, status=status.HTTP_400_BAD_REQUEST)
            if kind == 'modify':
                s = CopySignal.objects.create(channel=c, kind='modify', ref=ref, source='site', symbol=opened.symbol, sl=sl, tp=tp)
            else:
                fraction = _num(d, 'fraction', 0.01, 1, 1.0)
                s = CopySignal.objects.create(channel=c, kind='close', ref=ref, source='site', symbol=opened.symbol, fraction=fraction)
        else:
            return Response({"error": "kind is open, modify or close"}, status=status.HTTP_400_BAD_REQUEST)
    except (TypeError, ValueError) as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"signal": _signal_json(s), "copier": _copier_status()}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def signal_results(request, uid, cid, sid):
    """One signal's result on each follower's account (the channel owner's view)"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    sig = CopySignal.objects.filter(channel__owner=me, channel_id=cid, id=sid).first()
    if not sig:
        return Response({"error": "That signal isn't there"}, status=status.HTTP_404_NOT_FOUND)
    return Response({"signal": _signal_json(sig), "results": [
        {**_exec_json(e), "follower": e.subscription.subscriber.name} for e in sig.executions.select_related("subscription__subscriber", "signal")]})


@api_view(['POST'])
def join(request, uid):
    """{code}: follow that channel (copying stays off until you switch it on)"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    c = CopyChannel.objects.filter(code=str(request.data.get('code') or '').strip().upper(), active=True).first()
    if not c:
        return Response({"error": "No active channel has that code"}, status=status.HTTP_404_NOT_FOUND)
    if c.owner_id == me.id:
        return Response({"error": "That's your own channel"}, status=status.HTTP_400_BAD_REQUEST)
    s, _ = CopySubscription.objects.get_or_create(channel=c, subscriber=me, defaults={"risk_percent": c.default_risk})
    return Response({"subscription": _sub_json(s)}, status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
def subscription(request, uid, sid):
    """Your copying settings for a channel you follow. DELETE: stop following it."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    s = CopySubscription.objects.filter(subscriber=me, id=sid).select_related("channel", "channel__owner").first()
    if not s:
        return Response({"error": "You don't follow that channel"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        s.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    d = request.data
    try:
        for key, lo, hi in (("risk_percent", 0.01, 10), ("max_risk", 0.01, 10), ("no_sl_lots", 0, 100), ("daily_loss_limit", 0, 100)):
            if key in d:
                setattr(s, key, _num(d, key, lo, hi) or 0)
        if 'max_open' in d:
            s.max_open = int(_num(d, 'max_open', 1, 100))
    except (TypeError, ValueError) as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    if 'risk_mode' in d:
        if d['risk_mode'] not in ('signal', 'fixed'):
            return Response({"error": "risk_mode is signal or fixed"}, status=status.HTTP_400_BAD_REQUEST)
        s.risk_mode = d['risk_mode']
    if 'symbols' in d:
        s.symbols = [str(x).strip().upper()[:20] for x in (d.get('symbols') or []) if str(x).strip()][:50]
    if 'real_confirmed' in d:
        s.real_confirmed = d.get('real_confirmed') is True
    if 'auto_copy' in d:
        on = d.get('auto_copy') is True
        if on:
            acc = BrokerAccount.objects.filter(owner=me, platform='mt5').first()
            if not acc:
                return Response({"error": "Link your MT5 account first (on the chart: Trade with your broker → MetaTrader 5)"}, status=status.HTTP_409_CONFLICT)
            if acc.mode == 'real' and not (d.get('real_confirmed') is True or s.real_confirmed):
                return Response({"error": "This is a real-money account: confirm that copied trades will be placed on it"}, status=status.HTTP_428_PRECONDITION_REQUIRED)
        s.auto_copy = on
        if not on:
            s.terminal_status = 'off'
    s.save()
    return Response({"subscription": _sub_json(s), "copier": _copier_status()})


@api_view(['GET'])
def subscription_log(request, uid, sid):
    """What each of the channel's signals did on your account"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    s = CopySubscription.objects.filter(subscriber=me, id=sid).first()
    if not s:
        return Response({"error": "You don't follow that channel"}, status=status.HTTP_404_NOT_FOUND)
    return Response({"executions": [_exec_json(e) for e in s.executions.select_related("signal")[:200]]})
