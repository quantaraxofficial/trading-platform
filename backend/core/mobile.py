"""The mobile terminal's trading (/m, the MT5-style app; only the accounts with unlimited access).

Each person has a demo account (MobileAccount: 100,000 USD at 1:100). Everything is priced here, on
the server, at the live MT5 bid / ask the collector sends (core.market.LIVE): a market buy fills at
the ask and a sell at the bid, a position closes at the bid (buy) or ask (sell). Stop losses, take
profits and pending orders trigger here too, as each symbol's ticks come in (check_symbol, called
by core.market.ingest), whether or not the app is open.

Profit is in the account currency (USD): the price move × the contract size × the lots, converted
from the symbol's quote currency with the live rates (EURJPY's yen through USDJPY). Margin is the
position's value in USD / the leverage.

  GET  /api/users/m/state/<uid>/                 the account, its open positions and pending orders
  POST /api/users/m/order/<uid>/                  {symbol, kind: buy|sell|buy_limit|…, volume, price?, sl?, tp?}
  POST /api/users/m/position/<uid>/<id>/modify/   {sl, tp}  (null: none)
  POST /api/users/m/position/<uid>/<id>/close/
  POST /api/users/m/order/<uid>/<id>/cancel/
  GET  /api/users/m/history/<uid>/?from=&to=      closed positions, orders, deals (unix s)
"""
import logging
import threading
import time
from datetime import datetime, timezone as dt_tz
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import market
from .access import access_of
from .auth import require_session
from .models import MobileAccount, MobileDeal, MobileOrder, MobilePosition

log = logging.getLogger("core.mobile")

PENDING = ("buy_limit", "sell_limit", "buy_stop", "sell_stop")
QUOTE_MAX_AGE = 120        # s: an older price is no price (the market is closed)
MIN_LOT, MAX_LOT = Decimal("0.01"), Decimal("100")


# ---------------------------------------------------------------- prices

def quote(symbol):
    """(bid, ask) now, or None (no fresh price)"""
    live = market.LIVE.get(symbol)
    if not live or live.get("bid") is None or market.live_age(symbol) is None or market.live_age(symbol) > QUOTE_MAX_AGE:
        return None
    bid, ask = float(live["bid"]), float(live.get("ask") or live["bid"])
    return (bid, max(ask, bid))


def contract_size(symbol):
    return 100 if symbol.startswith("XAU") else 5000 if symbol.startswith("XAG") else 100000


def usd_per(currency):
    """USD for one unit of `currency` now (None: no rate)"""
    if currency == "USD":
        return 1.0
    q = quote(f"{currency}USD")
    if q:
        return (q[0] + q[1]) / 2
    q = quote(f"USD{currency}")
    if q:
        return 2 / (q[0] + q[1])
    return None


def digits(symbol):
    if symbol.endswith("JPY") or symbol.startswith("XAU"):
        return 3 if symbol.endswith("JPY") else 2
    return 5


def money(x):
    return Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def position_profit(p, bid, ask):
    close = bid if p.side == "buy" else ask
    move = (close - p.open_price) * (1 if p.side == "buy" else -1)
    rate = usd_per(p.symbol[3:6]) if len(p.symbol) >= 6 else 1.0
    return move * contract_size(p.symbol) * float(p.volume) * (rate or 0)


def position_margin(p, leverage):
    q = quote(p.symbol)
    price = q[1] if q else p.open_price
    rate = usd_per(p.symbol[3:6]) or 0
    return price * contract_size(p.symbol) * float(p.volume) * rate / max(1, leverage)


# ---------------------------------------------------------------- the account

def account_of(profile):
    acc, _ = MobileAccount.objects.get_or_create(profile=profile)
    return acc


def snapshot(acc):
    """The account now: balance, equity, margin, free margin, margin level, positions, orders"""
    pos = list(acc.positions.filter(close_time__isnull=True).order_by("open_time"))
    out_pos, floating, margin = [], 0.0, 0.0
    for p in pos:
        q = quote(p.symbol)
        profit = position_profit(p, *q) if q else 0.0
        floating += profit
        margin += position_margin(p, acc.leverage)
        out_pos.append({"id": p.id, "symbol": p.symbol, "side": p.side, "volume": float(p.volume), "open_price": p.open_price,
                        "price": (q[0] if p.side == "buy" else q[1]) if q else None, "sl": p.sl, "tp": p.tp,
                        "open_time": int(p.open_time.timestamp()), "profit": round(profit, 2), "digits": digits(p.symbol)})
    orders = [{"id": o.id, "symbol": o.symbol, "kind": o.kind, "volume": float(o.volume), "price": o.price, "sl": o.sl, "tp": o.tp,
               "time": int(o.created_at.timestamp()), "digits": digits(o.symbol)}
              for o in acc.orders.filter(status="placed").order_by("created_at")]
    balance = float(acc.balance)
    equity = balance + floating
    return {"balance": round(balance, 2), "equity": round(equity, 2), "profit": round(floating, 2), "margin": round(margin, 2),
            "free_margin": round(equity - margin, 2), "margin_level": round(equity / margin * 100, 2) if margin > 0 else None,
            "currency": acc.currency, "leverage": acc.leverage, "positions": out_pos, "orders": orders}


# ---------------------------------------------------------------- trading

class TradeError(Exception):
    pass


def _check_stops(side, ref, sl, tp):
    """A buy's SL below and TP above the price it'd close at (the bid), a sell's the other way"""
    if sl is not None and ((side == "buy" and sl >= ref) or (side == "sell" and sl <= ref)):
        raise TradeError("Invalid stops: the stop loss is on the wrong side of the price.")
    if tp is not None and ((side == "buy" and tp <= ref) or (side == "sell" and tp >= ref)):
        raise TradeError("Invalid stops: the take profit is on the wrong side of the price.")


def _open(acc, symbol, side, volume, sl, tp, order=None, reason="client"):
    q = quote(symbol)
    if not q:
        raise TradeError("Market closed: there's no live price for this symbol.")
    bid, ask = q
    price = ask if side == "buy" else bid
    _check_stops(side, bid if side == "buy" else ask, sl, tp)
    now = timezone.now()
    pos = MobilePosition(account=acc, symbol=symbol, side=side, volume=volume, open_price=price, sl=sl, tp=tp, open_time=now)
    # (enough free margin for it, after it)
    need = position_margin(pos, acc.leverage)
    snap = snapshot(acc)
    if snap["free_margin"] < need:
        raise TradeError("Not enough money: the free margin doesn't cover this position.")
    pos.save()
    if order is None:
        order = MobileOrder.objects.create(account=acc, symbol=symbol, kind=side, volume=volume, price=price, sl=sl, tp=tp,
                                           status="filled", created_at=now, done_at=now, position=pos)
    else:
        order.status, order.done_at, order.position = "filled", now, pos
        order.save(update_fields=["status", "done_at", "position"])
    MobileDeal.objects.create(account=acc, symbol=symbol, side=side, volume=volume, price=price, entry="in", position=pos,
                              order=order, reason=reason, time=now)
    invalidate()
    return pos


def _close(pos, reason="client"):
    q = quote(pos.symbol)
    if not q:
        raise TradeError("Market closed: there's no live price for this symbol.")
    bid, ask = q
    close = bid if pos.side == "buy" else ask
    profit = money(position_profit(pos, bid, ask))
    now = timezone.now()
    acc = pos.account
    MobileAccount.objects.filter(pk=acc.pk).update(balance=F("balance") + profit)
    pos.close_time, pos.close_price, pos.close_reason, pos.profit = now, close, reason, profit
    pos.save(update_fields=["close_time", "close_price", "close_reason", "profit"])
    out_side = "sell" if pos.side == "buy" else "buy"
    order = MobileOrder.objects.create(account=acc, symbol=pos.symbol, kind=out_side, volume=pos.volume, price=close,
                                       status="filled", created_at=now, done_at=now, position=pos)
    MobileDeal.objects.create(account=acc, symbol=pos.symbol, side=out_side, volume=pos.volume, price=close, entry="out",
                              profit=profit, position=pos, order=order, reason=reason, time=now)
    invalidate()
    return pos


# ---------------------------------------------------------------- triggers (from the ticks)

_watch_lock = threading.Lock()
_watched = None          # symbols with stops or pending orders (None: to be read again)
_last_check = {}


def invalidate():
    global _watched
    _watched = None


def _watched_symbols():
    global _watched
    if _watched is None:
        syms = set(MobilePosition.objects.filter(close_time__isnull=True).exclude(sl__isnull=True, tp__isnull=True)
                   .values_list("symbol", flat=True))
        syms |= set(MobileOrder.objects.filter(status="placed").values_list("symbol", flat=True))
        _watched = syms
    return _watched


def check_symbol(symbol, bid, ask):
    """A tick for `symbol`: stops hit close their positions, pending orders reached fill. At most
    every quarter second per symbol; never raises (it's on the collector's path)."""
    try:
        now = time.time()
        if now - _last_check.get(symbol, 0) < 0.25:
            return
        _last_check[symbol] = now
        with _watch_lock:
            if symbol not in _watched_symbols():
                return
        for p in MobilePosition.objects.filter(symbol=symbol, close_time__isnull=True).select_related("account"):
            if p.side == "buy":
                hit = ("sl", p.sl) if p.sl is not None and bid <= p.sl else ("tp", p.tp) if p.tp is not None and bid >= p.tp else None
            else:
                hit = ("sl", p.sl) if p.sl is not None and ask >= p.sl else ("tp", p.tp) if p.tp is not None and ask <= p.tp else None
            if hit:
                with transaction.atomic():
                    _close(p, reason=hit[0])
        for o in MobileOrder.objects.filter(symbol=symbol, status="placed").select_related("account"):
            reached = (o.kind == "buy_limit" and ask <= o.price) or (o.kind == "buy_stop" and ask >= o.price) \
                or (o.kind == "sell_limit" and bid >= o.price) or (o.kind == "sell_stop" and bid <= o.price)
            if not reached:
                continue
            try:
                with transaction.atomic():
                    _open(o.account, o.symbol, "buy" if o.kind.startswith("buy") else "sell", o.volume, o.sl, o.tp, order=o, reason="pending")
            except TradeError as e:
                o.status, o.done_at = "cancelled", timezone.now()
                o.save(update_fields=["status", "done_at"])
                log.info("pending order %s cancelled: %s", o.id, e)
                invalidate()
    except Exception:
        log.exception("mobile: checking %s failed", symbol)


# ---------------------------------------------------------------- the API

def _allowed(request, uid):
    """The person, if this is theirs and their access is unlimited (else a refusal, as a 404)"""
    profile, denied = require_session(request, uid)
    if denied:
        return None, denied
    if not access_of(profile).get("unlimited"):
        return None, Response({"error": "not_found"}, status=status.HTTP_404_NOT_FOUND)
    return profile, None


def _num(v):
    if v in (None, "", 0, "0"):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise TradeError("Not a number.")
    return f if f > 0 else None


def _volume(v):
    try:
        vol = Decimal(str(v)).quantize(Decimal("0.01"))
    except Exception:
        raise TradeError("Invalid volume.")
    if vol < MIN_LOT or vol > MAX_LOT:
        raise TradeError(f"Invalid volume: from {MIN_LOT} to {MAX_LOT} lots.")
    return vol


@api_view(["GET"])
def state(request, uid):
    profile, denied = _allowed(request, uid)
    if denied:
        return denied
    return Response(snapshot(account_of(profile)))


@api_view(["POST"])
def place(request, uid):
    profile, denied = _allowed(request, uid)
    if denied:
        return denied
    d = request.data
    symbol = str(d.get("symbol") or "").upper().replace("/", "")
    kind = str(d.get("kind") or "")
    try:
        if not market.SYMBOL_RE.match(symbol):
            raise TradeError("Unknown symbol.")
        volume, sl, tp = _volume(d.get("volume")), _num(d.get("sl")), _num(d.get("tp"))
        acc = account_of(profile)
        with transaction.atomic():
            if kind in ("buy", "sell"):
                pos = _open(acc, symbol, kind, volume, sl, tp)
                done = {"position": pos.id, "price": pos.open_price}
            elif kind in PENDING:
                price = _num(d.get("price"))
                q = quote(symbol)
                if not price:
                    raise TradeError("Set the order's price.")
                if not q:
                    raise TradeError("Market closed: there's no live price for this symbol.")
                bid, ask = q
                ok = {"buy_limit": price < ask, "buy_stop": price > ask, "sell_limit": price > bid, "sell_stop": price < bid}[kind]
                if not ok:
                    raise TradeError("Invalid price for this order type.")
                _check_stops("buy" if kind.startswith("buy") else "sell", price, sl, tp)
                o = MobileOrder.objects.create(account=acc, symbol=symbol, kind=kind, volume=volume, price=price, sl=sl, tp=tp,
                                               status="placed", created_at=timezone.now())
                invalidate()
                done = {"order": o.id, "price": price}
            else:
                raise TradeError("Unknown order type.")
    except TradeError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"ok": True, **done, "state": snapshot(acc)})


@api_view(["POST"])
def modify_position(request, uid, pid):
    profile, denied = _allowed(request, uid)
    if denied:
        return denied
    acc = account_of(profile)
    pos = acc.positions.filter(pk=pid, close_time__isnull=True).first()
    if not pos:
        return Response({"error": "No such open position."}, status=status.HTTP_404_NOT_FOUND)
    try:
        sl, tp = _num(request.data.get("sl")), _num(request.data.get("tp"))
        q = quote(pos.symbol)
        if q:
            _check_stops(pos.side, q[0] if pos.side == "buy" else q[1], sl, tp)
    except TradeError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    pos.sl, pos.tp = sl, tp
    pos.save(update_fields=["sl", "tp"])
    invalidate()
    return Response({"ok": True, "state": snapshot(acc)})


@api_view(["POST"])
def close_position(request, uid, pid):
    profile, denied = _allowed(request, uid)
    if denied:
        return denied
    acc = account_of(profile)
    pos = acc.positions.filter(pk=pid, close_time__isnull=True).first()
    if not pos:
        return Response({"error": "No such open position."}, status=status.HTTP_404_NOT_FOUND)
    try:
        with transaction.atomic():
            _close(pos)
    except TradeError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    acc.refresh_from_db()
    return Response({"ok": True, "price": pos.close_price, "profit": float(pos.profit), "state": snapshot(acc)})


@api_view(["POST"])
def cancel_order(request, uid, oid):
    profile, denied = _allowed(request, uid)
    if denied:
        return denied
    acc = account_of(profile)
    o = acc.orders.filter(pk=oid, status="placed").first()
    if not o:
        return Response({"error": "No such pending order."}, status=status.HTTP_404_NOT_FOUND)
    o.status, o.done_at = "cancelled", timezone.now()
    o.save(update_fields=["status", "done_at"])
    invalidate()
    return Response({"ok": True, "state": snapshot(acc)})


@api_view(["GET"])
def history(request, uid):
    profile, denied = _allowed(request, uid)
    if denied:
        return denied
    acc = account_of(profile)
    now = time.time()
    try:
        frm = float(request.query_params.get("from") or now - 30 * 86400)
        to = float(request.query_params.get("to") or now + 60)
    except ValueError:
        return Response({"error": "from / to are unix seconds"}, status=status.HTTP_400_BAD_REQUEST)
    f, t = datetime.fromtimestamp(frm, dt_tz.utc), datetime.fromtimestamp(to, dt_tz.utc)
    ts = lambda d: int(d.timestamp()) if d else None
    positions = [{"id": p.id, "symbol": p.symbol, "side": p.side, "volume": float(p.volume), "open_price": p.open_price,
                  "close_price": p.close_price, "open_time": ts(p.open_time), "close_time": ts(p.close_time), "sl": p.sl, "tp": p.tp,
                  "profit": float(p.profit or 0), "reason": p.close_reason, "digits": digits(p.symbol)}
                 for p in acc.positions.filter(close_time__gte=f, close_time__lt=t)]
    orders = [{"id": o.id, "symbol": o.symbol, "kind": o.kind, "volume": float(o.volume), "price": o.price, "sl": o.sl, "tp": o.tp,
               "status": o.status, "time": ts(o.created_at), "done": ts(o.done_at), "digits": digits(o.symbol)}
              for o in acc.orders.exclude(status="placed").filter(created_at__gte=f, created_at__lt=t)]
    deals = [{"id": x.id, "symbol": x.symbol, "side": x.side, "volume": float(x.volume), "price": x.price, "entry": x.entry,
              "profit": float(x.profit), "position": x.position_id, "reason": x.reason, "time": ts(x.time), "digits": digits(x.symbol)}
             for x in acc.deals.filter(time__gte=f, time__lt=t)]
    profit = round(sum(p["profit"] for p in positions), 2)
    return Response({"positions": positions, "orders": orders, "deals": deals,
                     "summary": {"profit": profit, "deposit": float(acc.deposit), "balance": float(acc.balance), "swap": 0, "commission": 0}})
