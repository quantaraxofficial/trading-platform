"""Trade copying: one signal applied to one subscriber's MetaTrader 5 account.

The copier service (copier_service.py) runs an always-logged-in MT5 terminal per subscriber and
hands each signal to all of them at once; this is what each one does with it:

- open: the broker's own symbol name; the subscriber's limits (copying on, symbols, open copied
  trades, the daily loss limit); the price now vs the provider's entry (a copy too late — more
  than the channel's slippage, as a % of the stop distance — is skipped, not chased); the stop
  loss / take profit at the same distances from this fill as the provider's were from theirs; and
  the lots that risk the chosen % of the subscriber's own equity at that stop, by the broker's tick
  value, rounded down to its lot step (never above the subscriber's maximum risk).
- modify: the copy's stops moved the way the provider's were (same offsets).
- close: all of the copy, or the same fraction the provider closed.

Copied orders carry the channel's magic number and "TP copy #<signal>", so only they are counted,
changed or closed — never the subscriber's own trades.
"""
import math
import time

from rest_framework import status

from .broker_mt5 import BrokerError, _check_can_trade, _filling, _send, _server_offset, _symbol, _volume, close_position, modify_position

COPY_MAGIC = 26300000


def magic_for(channel_id):
    return COPY_MAGIC + int(channel_id)


class Skip(Exception):
    """The copy isn't placed, on purpose (a limit, too late, too small…): logged as skipped"""
    def __init__(self, message):
        super().__init__(message)
        self.message = message


def _bare(name):
    """A symbol without its separators / broker suffix, for matching: XAU/USD, XAUUSD+ → XAUUSD"""
    return ''.join(ch for ch in str(name).upper() if ch.isalnum())[:6]


def lots_for_risk(info, equity, risk_pct, entry, sl):
    """Lots that lose `risk_pct` % of `equity` if the stop at `sl` is hit, by the symbol's tick
    value; rounded down to the lot step. Skip when even the minimum lot would risk more."""
    tick_size = getattr(info, 'trade_tick_size', 0) or 0
    tick_value = getattr(info, 'trade_tick_value', 0) or 0
    distance = abs(entry - sl)
    if tick_size <= 0 or tick_value <= 0 or distance <= 0:
        raise Skip("The broker doesn't give this symbol's tick value, so the lot size can't be worked out")
    loss_per_lot = distance / tick_size * tick_value
    money = equity * risk_pct / 100.0
    step = info.volume_step or 0.01
    lots = math.floor(money / loss_per_lot / step + 1e-9) * step
    lots = round(lots, 8)
    if lots < info.volume_min:
        need = info.volume_min * loss_per_lot / equity * 100 if equity else 0
        raise Skip(f"{risk_pct:g}% risk is less than {info.name}'s minimum lot ({info.volume_min}), which would risk {need:.2f}% here")
    return min(lots, info.volume_max)


def provider_risk(info, equity, entry, sl, volume):
    """What a provider's position risks, as % of their equity (for mirrored MT5 trades)"""
    if not sl or not equity:
        return None
    tick_size, tick_value = getattr(info, 'trade_tick_size', 0), getattr(info, 'trade_tick_value', 0)
    if not tick_size or not tick_value:
        return None
    return round(abs(entry - sl) / tick_size * tick_value * volume / equity * 100, 3)


def _copied_positions(mt5, magic):
    return [p for p in (mt5.positions_get() or []) if getattr(p, 'magic', 0) == magic]


def _today_result(mt5, magic):
    """Today's result (UTC day) of this channel's copies: closed deals plus what's open now"""
    off = _server_offset(mt5)
    now = int(time.time())
    day = now - now % 86400
    deals = mt5.history_deals_get(day + off, now + off + 60) or []
    closed = sum(d.profit + getattr(d, 'commission', 0) + getattr(d, 'swap', 0) for d in deals if getattr(d, 'magic', 0) == magic)
    return closed + sum(p.profit + getattr(p, 'swap', 0) for p in _copied_positions(mt5, magic))


def open_copy(mt5, sig, sub):
    """sig: {id, channel, symbol, side, entry?, sl?, tp?, risk_percent?}; sub: the subscription's
    settings. Returns the fill, or raises Skip / BrokerError."""
    side = sig['side']
    if side not in ('buy', 'sell'):
        raise Skip("The signal has no side")
    allowed = [_bare(s) for s in (sub.get('symbols') or [])]
    if allowed and _bare(sig['symbol']) not in allowed:
        raise Skip(f"{sig['symbol']} isn't one of the symbols you copy")
    _check_can_trade(mt5, {"confirm_real": sub.get('real_confirmed')})
    magic = magic_for(sig['channel'])
    if len(_copied_positions(mt5, magic)) >= int(sub.get('max_open') or 0):
        raise Skip(f"Already {sub.get('max_open')} copied trades open (your limit)")
    acc = mt5.account_info()
    limit = float(sub.get('daily_loss_limit') or 0)
    if limit > 0 and _today_result(mt5, magic) <= -acc.balance * limit / 100:
        raise Skip(f"Today's copied trades have hit your {limit:g}% daily loss limit")
    name, info = _symbol(mt5, sig['symbol'])
    tick = mt5.symbol_info_tick(name)
    if tick is None or not tick.bid:
        raise BrokerError("No prices right now (the market may be closed)")
    buy = side == 'buy'
    price = tick.ask if buy else tick.bid
    entry, sl, tp = sig.get('entry'), sig.get('sl'), sig.get('tp')

    # Too late? (how far the price has gone against the copy, vs the stop distance)
    if entry and sl:
        stop_dist = abs(entry - sl)
        late = (price - entry) if buy else (entry - price)
        allowed_late = stop_dist * float(sub.get('max_slippage') or 0) / 100
        if late > allowed_late:
            raise Skip(f"Too late: the price is {late:.{info.digits}f} past the provider's entry {entry} (allowed {allowed_late:.{info.digits}f})")
    # Stops: at the provider's distances from this fill (or as given, for a signal without an entry)
    if entry:
        sl_here = round(price - (entry - sl), info.digits) if sl else 0.0
        tp_here = round(price - (entry - tp), info.digits) if tp else 0.0
    else:
        sl_here, tp_here = round(sl or 0.0, info.digits), round(tp or 0.0, info.digits)
    if sl_here and ((buy and sl_here >= price) or (not buy and sl_here <= price)):
        raise Skip("The price is already past the stop loss")
    if tp_here and ((buy and tp_here <= price) or (not buy and tp_here >= price)):
        raise Skip("The price is already past the take profit")

    # Size
    risk = sig.get('risk_percent') if sub.get('risk_mode') == 'signal' and sig.get('risk_percent') else sub.get('risk_percent')
    risk = min(float(risk or 0), float(sub.get('max_risk') or 0))
    if sl_here:
        if risk <= 0:
            raise Skip("Risk per trade is 0")
        volume = lots_for_risk(info, acc.equity, risk, price, sl_here)
    elif float(sub.get('no_sl_lots') or 0) > 0:
        volume = _volume(info, sub['no_sl_lots'])
    else:
        raise Skip("The signal has no stop loss, so the risk can't be sized (set lots for signals without a stop to copy them)")

    res = _send(mt5, {
        "action": mt5.TRADE_ACTION_DEAL, "symbol": name, "volume": volume, "type": mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL,
        "price": price, "sl": sl_here, "tp": tp_here, "deviation": 20, "magic": magic, "comment": f"TP copy #{sig['id']}",
        "type_filling": _filling(mt5, info), "type_time": mt5.ORDER_TIME_GTC,
    })
    return {"status": "filled", "ticket": res["order"], "symbol": name, "volume": res["volume"] or volume,
            "price": res["price"] or price, "sl": sl_here or None, "tp": tp_here or None,
            "message": f"{'Bought' if buy else 'Sold'} {res['volume'] or volume} {name} at {res['price'] or price} risking {risk:g}%"}


def modify_copy(mt5, sig, opened):
    """New stops for the copy (`opened`: its open signal's entry and the copy's ticket / fill)"""
    ticket = opened['ticket']
    p = next(iter(mt5.positions_get(ticket=ticket) or []), None)
    if not p:
        raise Skip("The copied position isn't open any more")
    info = mt5.symbol_info(p.symbol)
    entry, fill = opened.get('entry'), opened.get('price') or p.price_open
    move = (lambda v: round(fill + (v - entry), info.digits)) if entry else (lambda v: round(v, info.digits))
    sl = move(sig['sl']) if sig.get('sl') else 0.0
    tp = move(sig['tp']) if sig.get('tp') else 0.0
    modify_position(mt5, ticket, {"sl": sl, "tp": tp})
    return {"status": "modified", "ticket": ticket, "symbol": p.symbol, "sl": sl or None, "tp": tp or None,
            "message": f"Stops moved: SL {sl or '—'} / TP {tp or '—'}"}


def close_copy(mt5, sig, opened):
    """Closes the copy, or the same fraction of it the provider closed"""
    ticket = opened['ticket']
    p = next(iter(mt5.positions_get(ticket=ticket) or []), None)
    if not p:
        raise Skip("The copied position was already closed")
    info = mt5.symbol_info(p.symbol)
    fraction = float(sig.get('fraction') or 1)
    volume = p.volume
    if fraction < 0.999:
        step = info.volume_step or 0.01
        volume = round(max(info.volume_min, math.floor(p.volume * fraction / step + 1e-9) * step), 8)
        if p.volume - volume < info.volume_min - 1e-9:
            volume = p.volume   # what would be left is below the minimum: close it all
    res = close_position(mt5, ticket, volume, magic=getattr(p, 'magic', 0), comment=f"TP copy #{sig['id']} close")
    whole = volume >= p.volume - 1e-9
    return {"status": "closed", "ticket": ticket, "symbol": p.symbol, "volume": volume, "price": res["price"],
            "message": f"{'Closed' if whole else 'Partly closed'} {volume} {p.symbol} at {res['price']}"}


def apply(mt5, sig, sub, opened=None):
    """A signal on one account: the result dict, never raising (a skip or a refusal is a result)"""
    started = time.time()
    try:
        if sig['kind'] == 'open':
            out = open_copy(mt5, sig, sub)
        elif not opened or not opened.get('ticket'):
            raise Skip("This account didn't copy the trade being changed")
        elif sig['kind'] == 'modify':
            out = modify_copy(mt5, sig, opened)
        else:
            out = close_copy(mt5, sig, opened)
    except Skip as e:
        out = {"status": "skipped", "message": e.message}
    except BrokerError as e:
        out = {"status": "failed", "message": e.message}
    except Exception as e:   # a terminal hiccup shouldn't stop the others
        out = {"status": "failed", "message": f"Unexpected error: {e}"}
    out["took_ms"] = int((time.time() - started) * 1000)
    return out


def snapshot(mt5):
    """The provider's account for mirroring: equity, and each open position (ticket, symbol, side,
    lots, entry, SL, TP, open time in UTC ms, and the % of equity it risks)"""
    acc = mt5.account_info()
    if acc is None:
        raise BrokerError("The provider's terminal lost the connection")
    off = _server_offset(mt5)
    out = []
    for p in mt5.positions_get() or []:
        if p.type not in (0, 1):
            continue
        info = mt5.symbol_info(p.symbol)
        out.append({"ticket": p.ticket, "symbol": p.symbol, "side": "buy" if p.type == 0 else "sell", "volume": p.volume,
                    "entry": p.price_open, "sl": p.sl or None, "tp": p.tp or None, "time": (int(p.time) - off) * 1000,
                    "risk": provider_risk(info, acc.equity, p.price_open, p.sl, p.volume) if info else None})
    return {"equity": acc.equity, "positions": out}
