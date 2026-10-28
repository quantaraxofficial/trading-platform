"""MetaTrader 5 broker accounts: linking your MT5 account to the site ("Trade with your broker" →
MetaTrader 5), reading it live — balance, equity, margin, open positions, pending orders and
the last 24 hours' deals — and trading on it: market and pending orders with stop loss / take profit,
closing positions (all or part), changing stops, moving and cancelling pending orders.

Orders are sized and priced by the broker's rules for the symbol (its own name for it, lot
minimum / step / maximum, price digits, the fill mode it accepts); the broker's answer comes back
as is (placed, rejected, market closed, not enough money…). On a real-money account each order
needs `confirm_real`; demo accounts trade straight away. The terminal's "Algo Trading" button
must be on for orders from outside it.

The site talks to your broker through the MetaTrader 5 terminal installed on the server's
machine, with MetaQuotes' `MetaTrader5` Python package: it logs into the account you link (account
number, password, server — as in MT5's own login window) and reads it. The password is stored
encrypted (a key derived from SECRET_KEY) and never sent back to the browser. With MT5's
read-only investor password the account can be seen but not traded.

The package drives one terminal per process, logged into one account at a time, so every call
goes through one lock, switching accounts when needed. MT5_TERMINAL_PATH (settings / env) picks
which terminal64.exe to use; empty: the one already running. MT5_FAKE uses a stand-in account
(tests, and trying the site without a terminal).
"""
import base64
import hashlib
import threading
import time

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .models import BrokerAccount

TRADE_MODES = {0: "demo", 1: "contest", 2: "real"}
ORDER_TYPES = {0: "buy", 1: "sell", 2: "buy limit", 3: "sell limit", 4: "buy stop", 5: "sell stop", 6: "buy stop limit", 7: "sell stop limit"}
DEAL_TYPES = {0: "buy", 1: "sell", 2: "balance", 3: "credit", 4: "charge", 5: "correction", 6: "bonus", 7: "commission"}


# ---------- the password, encrypted ----------

def _fernet():
    key = base64.urlsafe_b64encode(hashlib.sha256(f"mt5-password:{settings.SECRET_KEY}".encode()).digest())
    return Fernet(key)


def encrypt_password(p):
    return _fernet().encrypt(p.encode()).decode()


def decrypt_password(blob):
    try:
        return _fernet().decrypt(blob.encode()).decode()
    except (InvalidToken, ValueError):
        return None


# ---------- the terminal ----------

class BrokerError(Exception):
    def __init__(self, message, code=status.HTTP_502_BAD_GATEWAY):
        super().__init__(message)
        self.message, self.code = message, code


class FakeMt5:
    """A stand-in for the MetaTrader5 package: one demo account that keeps positions and orders"""
    ACCOUNTS = {(5012345, "Demo-Server"): "demo-pass"}
    ORDER_TYPE_BUY, ORDER_TYPE_SELL, ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_SELL_LIMIT, ORDER_TYPE_BUY_STOP, ORDER_TYPE_SELL_STOP = 0, 1, 2, 3, 4, 5
    TRADE_ACTION_DEAL, TRADE_ACTION_PENDING, TRADE_ACTION_SLTP, TRADE_ACTION_MODIFY, TRADE_ACTION_REMOVE = 1, 5, 6, 7, 8
    ORDER_FILLING_FOK, ORDER_FILLING_IOC, ORDER_FILLING_RETURN = 0, 1, 2
    ORDER_TIME_GTC = 0
    PRICES = {"XAUUSD+": (3998.5, 3998.7, 2), "EURUSD+": (1.0850, 1.0851, 5)}

    def __init__(self):
        self._login = None
        self._error = (1, "Success")
        self._ticket = 1000
        now = int(time.time())
        self.positions = [_Obj(ticket=101, symbol="XAUUSD+", type=0, volume=0.05, price_open=3990.1, price_current=3998.6, sl=3970.0, tp=4030.0,
                               profit=42.5, swap=0.0, time=now - 3600, comment="", magic=0)]
        self.orders = [_Obj(ticket=202, symbol="EURUSD+", type=2, volume_current=0.1, price_open=1.0812, sl=1.075, tp=1.09, time_setup=now - 600, comment="")]

    def initialize(self, *args, login=None, password=None, server=None, **kw):
        return self.login(login, password=password, server=server) if login else True

    def login(self, login, password=None, server=None, timeout=None):
        if self.ACCOUNTS.get((int(login), server)) == password:
            self._login = int(login)
            return True
        self._error = (-6, "Terminal: Authorization failed")
        return False

    def last_error(self):
        return self._error

    def terminal_info(self):
        return _Obj(trade_allowed=True, connected=True)

    def account_info(self):
        if not self._login:
            return None
        profit = round(sum(p.profit for p in self.positions), 2)
        return _Obj(login=self._login, name="Demo Trader", server="Demo-Server", company="Demo Broker Ltd", currency="USD",
                    leverage=500, balance=10000.0, equity=10000.0 + profit, margin=105.3, margin_free=9937.2, margin_level=9537.0,
                    profit=profit, trade_mode=0, trade_allowed=True)

    def positions_get(self, ticket=None):
        return [p for p in self.positions if ticket is None or p.ticket == ticket]

    def orders_get(self, ticket=None):
        return [o for o in self.orders if ticket is None or o.ticket == ticket]

    def history_deals_get(self, date_from, date_to):
        return [_Obj(ticket=303, order=301, symbol="XAUUSD+", type=0, entry=0, volume=0.05, price=3990.1, profit=0.0,
                     commission=-0.35, swap=0.0, time=int(time.time()) - 3600, comment="")]

    def symbol_info(self, name):
        if name not in self.PRICES:
            return None
        bid, ask, digits = self.PRICES[name]
        return _Obj(name=name, visible=True, digits=digits, volume_min=0.01, volume_max=50.0, volume_step=0.01, filling_mode=2,
                    trade_mode=4, trade_contract_size=100.0 if name.startswith("XAU") else 100000.0, bid=bid, ask=ask,
                    trade_stops_level=0, currency_profit="USD", description=name)

    def symbols_get(self, group=None):
        pattern = (group or "*").strip("*")
        return [self.symbol_info(n) for n in self.PRICES if pattern in n]

    def symbol_select(self, name, enable=True):
        return name in self.PRICES

    def symbol_info_tick(self, name):
        if name not in self.PRICES:
            return None
        bid, ask, _ = self.PRICES[name]
        return _Obj(bid=bid, ask=ask, time=int(time.time()))

    def order_send(self, req):
        self._ticket += 1
        t = self._ticket
        done = _Obj(retcode=10009, order=t, deal=t, volume=req.get("volume", 0), price=req.get("price", 0), comment="Request executed")
        a = req["action"]
        if a == self.TRADE_ACTION_DEAL:
            if req.get("position"):
                p = next((p for p in self.positions if p.ticket == req["position"]), None)
                if not p:
                    return _Obj(retcode=10013, comment="Invalid request")
                if req["volume"] >= p.volume:
                    self.positions.remove(p)
                else:
                    p.volume = round(p.volume - req["volume"], 2)
                return done
            if req["volume"] > 10:
                return _Obj(retcode=10019, comment="No money")
            self.positions.append(_Obj(ticket=t, symbol=req["symbol"], type=req["type"], volume=req["volume"], price_open=req["price"],
                                       price_current=req["price"], sl=req.get("sl", 0.0), tp=req.get("tp", 0.0), profit=0.0, swap=0.0,
                                       time=int(time.time()), comment=req.get("comment", ""), magic=req.get("magic", 0)))
            return done
        if a == self.TRADE_ACTION_PENDING:
            self.orders.append(_Obj(ticket=t, symbol=req["symbol"], type=req["type"], volume_current=req["volume"], price_open=req["price"],
                                    sl=req.get("sl", 0.0), tp=req.get("tp", 0.0), time_setup=int(time.time()), comment=req.get("comment", "")))
            return _Obj(retcode=10008, order=t, deal=0, volume=req["volume"], price=req["price"], comment="Request placed")
        if a == self.TRADE_ACTION_SLTP:
            p = next((p for p in self.positions if p.ticket == req["position"]), None)
            if not p:
                return _Obj(retcode=10013, comment="Invalid request")
            p.sl, p.tp = req.get("sl", 0.0), req.get("tp", 0.0)
            return done
        if a in (self.TRADE_ACTION_MODIFY, self.TRADE_ACTION_REMOVE):
            o = next((o for o in self.orders if o.ticket == req["order"]), None)
            if not o:
                return _Obj(retcode=10013, comment="Invalid request")
            if a == self.TRADE_ACTION_REMOVE:
                self.orders.remove(o)
            else:
                o.price_open, o.sl, o.tp = req["price"], req.get("sl", 0.0), req.get("tp", 0.0)
            return done
        return _Obj(retcode=10013, comment="Invalid request")


class _Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


_lock = threading.Lock()
_mt5 = None
_current = None   # (login, server) the terminal is logged into


def _module():
    """The MetaTrader5 package (or the stand-in); the terminal itself starts at the first login"""
    global _mt5
    if _mt5 is None:
        if getattr(settings, 'MT5_FAKE', False):
            _mt5 = FakeMt5()
        else:
            try:
                import MetaTrader5 as mt5   # MetaQuotes' package: needs the MT5 terminal on this machine
            except Exception:
                raise BrokerError("MetaTrader 5 isn't installed on the server, so MT5 accounts can't be linked here.", status.HTTP_503_SERVICE_UNAVAILABLE)
            _mt5 = mt5
    return _mt5


_started = False   # the terminal is running and attached


def _login(login, password, server, verify=False):
    """Logs the terminal into the account (unless it already is; verify: always, so the broker
    checks the password — linking must never pass on the strength of an earlier login);
    errors as the broker gives them"""
    global _current, _started
    mt5 = _module()
    if not verify and _started and _current == (login, server) and mt5.account_info() is not None:
        return mt5
    if not _started:
        # Started straight into this account (not whichever one the terminal used last)
        path = getattr(settings, 'MT5_TERMINAL_PATH', '') or None
        args = (path,) if path else ()
        ok = mt5.initialize(*args, login=login, password=password, server=server, timeout=60000)
        _started = bool(ok)
    else:
        ok = mt5.login(login, password=password, server=server, timeout=20000)
    if not ok:
        code, msg = mt5.last_error()
        _current = None
        if code == -6 or 'Authorization' in str(msg):
            raise BrokerError("The broker didn't accept that login: check the account number, password and server.", status.HTTP_400_BAD_REQUEST)
        raise BrokerError(f"Couldn't reach the broker's server ({msg}).")
    _current = (login, server)
    return mt5


def _account_json(a):
    return {
        "login": a.login, "name": a.name, "server": a.server, "company": a.company, "currency": a.currency, "leverage": a.leverage,
        "balance": a.balance, "equity": a.equity, "margin": a.margin, "free_margin": a.margin_free,
        "margin_level": a.margin_level, "profit": a.profit, "mode": TRADE_MODES.get(a.trade_mode, "real"),
        "trade_allowed": bool(a.trade_allowed),
    }


def _server_offset(mt5, symbols=()):
    """How far the broker's clock is from UTC, in seconds (MT5 gives times in server time, as if
    it were UTC): from a live tick's time, to the nearest half hour"""
    for name in list(symbols) + ["EURUSD", "XAUUSD"]:
        try:
            tick = mt5.symbol_info_tick(name)
        except Exception:
            tick = None
        if tick and getattr(tick, 'time', 0):
            return round((tick.time - time.time()) / 1800) * 1800
    return 0


def _snapshot(mt5):
    """The account now: its figures, open positions, pending orders and the last 24 hours' deals
    (times in real UTC, whatever the broker's server clock is)"""
    a = mt5.account_info()
    if a is None:
        raise BrokerError("The terminal lost the connection to the broker.")
    positions = mt5.positions_get() or []
    off = _server_offset(mt5, [p.symbol for p in positions])
    now = int(time.time())
    deals = mt5.history_deals_get(now - 86400 + off, now + off + 60) or []
    ms = lambda t: (int(t) - off) * 1000
    return {
        "account": _account_json(a),
        "positions": [{
            "ticket": p.ticket, "symbol": p.symbol, "side": "buy" if p.type == 0 else "sell", "volume": p.volume,
            "open_price": p.price_open, "price": p.price_current, "sl": p.sl or None, "tp": p.tp or None,
            "profit": p.profit, "swap": p.swap, "time": ms(p.time), "comment": p.comment,
        } for p in positions],
        "orders": [{
            "ticket": o.ticket, "symbol": o.symbol, "type": ORDER_TYPES.get(o.type, str(o.type)), "volume": o.volume_current,
            "price": o.price_open, "sl": o.sl or None, "tp": o.tp or None, "time": ms(o.time_setup), "comment": o.comment,
        } for o in (mt5.orders_get() or [])],
        "deals": [{
            "ticket": d.ticket, "order": d.order, "symbol": d.symbol, "type": DEAL_TYPES.get(d.type, str(d.type)),
            "entry": {0: "in", 1: "out", 2: "in/out", 3: "out by"}.get(d.entry, ""), "volume": d.volume, "price": d.price,
            "profit": d.profit, "commission": d.commission, "swap": d.swap, "time": ms(d.time), "comment": d.comment,
        } for d in sorted(deals, key=lambda d: d.time, reverse=True)],
        "at": int(time.time() * 1000),
    }


# What the broker's answer codes mean (MetaQuotes' TRADE_RETCODE_*)
RETCODES = {
    10004: "The price changed (requote): try again", 10006: "The broker rejected the order", 10007: "Cancelled",
    10010: "Only part of the order was filled", 10011: "The broker couldn't process the order", 10012: "The order timed out",
    10013: "The broker found the order invalid", 10014: "That volume isn't allowed for this symbol", 10015: "That price isn't valid",
    10016: "The stop loss / take profit are too close or on the wrong side", 10017: "Trading is disabled on this account",
    10018: "The market is closed", 10019: "Not enough money for this order", 10020: "Prices moved: try again",
    10021: "No prices right now", 10024: "Too many requests: wait a moment", 10026: "The broker has trading disabled for this account",
    10027: "Turn on \"Algo Trading\" in MetaTrader 5 (its toolbar button) so the site can place orders",
    10030: "This fill type isn't supported for the symbol", 10031: "No connection to the broker's server",
    10033: "Too many pending orders", 10034: "Volume limit reached for this symbol",
}
DONE = (10008, 10009, 10010)


def _symbol(mt5, name):
    """The broker's own name for a chart symbol (XAU/USD → XAUUSD, or XAUUSD+, XAUUSD., …), shown
    in Market Watch so it has prices"""
    base = str(name or '').replace('/', '').replace(' ', '').upper()
    if not base:
        raise BrokerError("Pick a symbol", status.HTTP_400_BAD_REQUEST)
    found = None
    for cand in (name, base):
        if cand and mt5.symbol_info(cand) is not None:
            found = cand
            break
    if not found:
        matches = [s.name for s in (mt5.symbols_get(f"*{base}*") or []) if s.name.upper().startswith(base)]
        if matches:
            found = sorted(matches, key=len)[0]
    if not found:
        raise BrokerError(f"{base} isn't traded on this account", status.HTTP_400_BAD_REQUEST)
    mt5.symbol_select(found, True)
    return found, mt5.symbol_info(found)


def _volume(info, volume):
    try:
        v = float(volume)
    except (TypeError, ValueError):
        raise BrokerError("Enter the volume in lots", status.HTTP_400_BAD_REQUEST)
    step = info.volume_step or 0.01
    v = round(round(v / step) * step, 8)
    if v < info.volume_min or v > info.volume_max:
        raise BrokerError(f"{info.name} trades {info.volume_min} to {info.volume_max} lots, in steps of {step}", status.HTTP_400_BAD_REQUEST)
    return v


def _price(info, value, what="price"):
    if value in (None, '', 0, '0'):
        return 0.0
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise BrokerError(f"That {what} isn't a number", status.HTTP_400_BAD_REQUEST)
    return round(v, info.digits)


def _filling(mt5, info):
    """The fill mode the symbol accepts (its filling_mode flags: 1 fill or kill, 2 immediate or cancel)"""
    fm = getattr(info, 'filling_mode', 0) or 0
    if fm & 1:
        return mt5.ORDER_FILLING_FOK
    if fm & 2:
        return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN


def _check_can_trade(mt5, data):
    a = mt5.account_info()
    t = mt5.terminal_info()
    if a is None:
        raise BrokerError("The terminal lost the connection to the broker.")
    if not a.trade_allowed:
        raise BrokerError("This account was linked with its investor (read-only) password: it can't be traded on. Link it with the main password to trade.", status.HTTP_403_FORBIDDEN)
    if t is not None and not t.trade_allowed:
        raise BrokerError(RETCODES[10027], status.HTTP_409_CONFLICT)
    if a.trade_mode == 2 and data.get('confirm_real') is not True:
        raise BrokerError("This is a real-money account: confirm the order to send it.", status.HTTP_428_PRECONDITION_REQUIRED)


def _send(mt5, req):
    res = mt5.order_send(req)
    if res is None:
        code, msg = mt5.last_error()
        raise BrokerError(f"The terminal couldn't send the order ({msg}).")
    if res.retcode not in DONE:
        raise BrokerError(RETCODES.get(res.retcode, f"The broker answered {res.retcode}: {getattr(res, 'comment', '')}"), status.HTTP_400_BAD_REQUEST)
    return {"retcode": res.retcode, "order": getattr(res, 'order', 0), "deal": getattr(res, 'deal', 0),
            "volume": getattr(res, 'volume', 0), "price": getattr(res, 'price', 0), "message": "Placed" if res.retcode == 10008 else "Done"}


MAGIC = 26092026   # marks orders sent from the site
SIDES = {"buy": 0, "sell": 1}
PENDING = {("buy", "limit"): "ORDER_TYPE_BUY_LIMIT", ("sell", "limit"): "ORDER_TYPE_SELL_LIMIT",
           ("buy", "stop"): "ORDER_TYPE_BUY_STOP", ("sell", "stop"): "ORDER_TYPE_SELL_STOP"}


def place_order(mt5, data, magic=MAGIC, comment="TradePilot"):
    """{symbol, side: buy|sell, type: market|limit|stop, volume, price (pending), sl?, tp?}; magic /
    comment tag the order (the site's own, or an auto-traded strategy's)"""
    side, kind = data.get('side'), data.get('type') or 'market'
    if side not in SIDES or kind not in ('market', 'limit', 'stop'):
        raise BrokerError("side must be buy or sell, and type market, limit or stop", status.HTTP_400_BAD_REQUEST)
    name, info = _symbol(mt5, data.get('symbol'))
    volume = _volume(info, data.get('volume'))
    sl, tp = _price(info, data.get('sl'), "stop loss"), _price(info, data.get('tp'), "take profit")
    req = {"symbol": name, "volume": volume, "sl": sl, "tp": tp, "magic": magic, "comment": comment,
           "type_time": mt5.ORDER_TIME_GTC}
    if kind == 'market':
        tick = mt5.symbol_info_tick(name)
        if tick is None:
            raise BrokerError(RETCODES[10021])
        req.update(action=mt5.TRADE_ACTION_DEAL, type=mt5.ORDER_TYPE_BUY if side == 'buy' else mt5.ORDER_TYPE_SELL,
                   price=tick.ask if side == 'buy' else tick.bid, deviation=20, type_filling=_filling(mt5, info))
    else:
        price = _price(info, data.get('price'))
        if not price:
            raise BrokerError("Enter the order's price", status.HTTP_400_BAD_REQUEST)
        req.update(action=mt5.TRADE_ACTION_PENDING, type=getattr(mt5, PENDING[(side, kind)]), price=price, type_filling=mt5.ORDER_FILLING_RETURN)
    return {**_send(mt5, req), "symbol": name}


def close_position(mt5, ticket, volume=None, magic=MAGIC, comment="TradePilot close"):
    p = next(iter(mt5.positions_get(ticket=ticket) or []), None)
    if not p:
        raise BrokerError("That position isn't open any more", status.HTTP_404_NOT_FOUND)
    info = mt5.symbol_info(p.symbol)
    vol = _volume(info, volume) if volume not in (None, '') else p.volume
    tick = mt5.symbol_info_tick(p.symbol)
    sell = p.type == 0   # closing a buy sells
    return _send(mt5, {"action": mt5.TRADE_ACTION_DEAL, "symbol": p.symbol, "volume": min(vol, p.volume), "position": p.ticket,
                       "type": mt5.ORDER_TYPE_SELL if sell else mt5.ORDER_TYPE_BUY, "price": tick.bid if sell else tick.ask,
                       "deviation": 20, "magic": magic, "comment": comment, "type_filling": _filling(mt5, info),
                       "type_time": mt5.ORDER_TIME_GTC})


def modify_position(mt5, ticket, data):
    p = next(iter(mt5.positions_get(ticket=ticket) or []), None)
    if not p:
        raise BrokerError("That position isn't open any more", status.HTTP_404_NOT_FOUND)
    info = mt5.symbol_info(p.symbol)
    return _send(mt5, {"action": mt5.TRADE_ACTION_SLTP, "symbol": p.symbol, "position": p.ticket,
                       "sl": _price(info, data.get('sl'), "stop loss"), "tp": _price(info, data.get('tp'), "take profit"), "magic": MAGIC})


def modify_order(mt5, ticket, data):
    o = next(iter(mt5.orders_get(ticket=ticket) or []), None)
    if not o:
        raise BrokerError("That order isn't pending any more", status.HTTP_404_NOT_FOUND)
    info = mt5.symbol_info(o.symbol)
    price = _price(info, data.get('price')) or o.price_open
    return _send(mt5, {"action": mt5.TRADE_ACTION_MODIFY, "order": o.ticket, "symbol": o.symbol, "price": price,
                       "sl": _price(info, data.get('sl'), "stop loss"), "tp": _price(info, data.get('tp'), "take profit"),
                       "type_time": mt5.ORDER_TIME_GTC})


def cancel_order(mt5, ticket):
    o = next(iter(mt5.orders_get(ticket=ticket) or []), None)
    if not o:
        raise BrokerError("That order isn't pending any more", status.HTTP_404_NOT_FOUND)
    return _send(mt5, {"action": mt5.TRADE_ACTION_REMOVE, "order": o.ticket})


def _linked_json(acc):
    return {
        "platform": "mt5", "login": acc.login, "server": acc.server, "name": acc.name, "company": acc.company,
        "currency": acc.currency, "leverage": acc.leverage, "mode": acc.mode, "linked_at": acc.created_at.isoformat(),
    }


def _session(request, uid):
    """The caller's linked MT5 account, logged in (or the answer saying why not)"""
    me, denied = require_session(request, uid)
    if denied:
        return None, denied
    acc = BrokerAccount.objects.filter(owner=me, platform='mt5').first()
    if not acc:
        return None, Response({"error": "No MetaTrader 5 account is linked"}, status=status.HTTP_404_NOT_FOUND)
    password = decrypt_password(acc.password)
    if not password:
        return None, Response({"error": "Link the account again (its saved password can't be read)"}, status=status.HTTP_409_CONFLICT)
    return (acc, password), None


def _guard(fn):
    try:
        with _lock:
            return fn()
    except BrokerError as e:
        return Response({"error": e.message}, status=e.code)


# ---------- endpoints ----------

@api_view(['GET', 'POST', 'DELETE'])
def mt5_account(request, uid):
    """GET: your linked MT5 account (or none). POST {login, password, server}: links it, after the
    broker accepts the login. DELETE: unlinks it (the site forgets the password)."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    acc = BrokerAccount.objects.filter(owner=me, platform='mt5').first()
    if request.method == 'GET':
        return Response({"linked": _linked_json(acc) if acc else None})
    if request.method == 'DELETE':
        BrokerAccount.objects.filter(owner=me, platform='mt5').delete()
        return Response({"linked": None})

    data = request.data
    try:
        login = int(str(data.get('login') or '').strip())
    except ValueError:
        return Response({"error": "The account number is the number MT5 shows for your account"}, status=status.HTTP_400_BAD_REQUEST)
    password = str(data.get('password') or '')
    server = str(data.get('server') or '').strip()[:100]
    if not password or not server or login <= 0:
        return Response({"error": "Enter the account number, password and server"}, status=status.HTTP_400_BAD_REQUEST)

    def link():
        mt5 = _login(login, password, server, verify=True)
        a = mt5.account_info()
        info = _account_json(a)
        obj, _ = BrokerAccount.objects.update_or_create(owner=me, platform='mt5', defaults={
            "login": login, "server": server, "password": encrypt_password(password),
            "name": str(info["name"] or '')[:100], "company": str(info["company"] or '')[:100], "currency": str(info["currency"] or '')[:10],
            "leverage": int(info["leverage"] or 0), "mode": info["mode"], "last_connected_at": timezone.now(),
        })
        return Response({"linked": _linked_json(obj), **_snapshot(mt5)}, status=status.HTTP_201_CREATED)
    return _guard(link)


@api_view(['GET'])
def mt5_live(request, uid):
    """Your linked MT5 account now: balance, equity, margin, positions, pending orders, the last day's deals"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    acc = BrokerAccount.objects.filter(owner=me, platform='mt5').first()
    if not acc:
        return Response({"error": "No MetaTrader 5 account is linked"}, status=status.HTTP_404_NOT_FOUND)
    password = decrypt_password(acc.password)
    if not password:
        return Response({"error": "Link the account again (its saved password can't be read)"}, status=status.HTTP_409_CONFLICT)

    def live():
        snap = _snapshot(_login(acc.login, password, acc.server))
        BrokerAccount.objects.filter(id=acc.id).update(last_connected_at=timezone.now(), mode=snap["account"]["mode"])
        return Response(snap)
    return _guard(live)


@api_view(['POST'])
def mt5_order(request, uid):
    """{symbol, side, type, volume, price?, sl?, tp?, confirm_real?}: places an order on the linked
    account; the reply has the broker's answer and the account right after"""
    found, denied = _session(request, uid)
    if denied:
        return denied
    acc, password = found

    def go():
        mt5 = _login(acc.login, password, acc.server)
        _check_can_trade(mt5, request.data)
        result = place_order(mt5, request.data)
        return Response({"result": result, **_snapshot(mt5)}, status=status.HTTP_201_CREATED)
    return _guard(go)


@api_view(['PATCH', 'DELETE'])
def mt5_position(request, uid, ticket):
    """PATCH {sl, tp}: changes an open position's stops. DELETE ?volume=: closes it (or that much)."""
    found, denied = _session(request, uid)
    if denied:
        return denied
    acc, password = found

    def go():
        mt5 = _login(acc.login, password, acc.server)
        _check_can_trade(mt5, request.data if request.method == 'PATCH' else request.query_params)
        if request.method == 'PATCH':
            result = modify_position(mt5, int(ticket), request.data)
        else:
            result = close_position(mt5, int(ticket), request.query_params.get('volume'))
        return Response({"result": result, **_snapshot(mt5)})
    return _guard(go)


@api_view(['PATCH', 'DELETE'])
def mt5_pending(request, uid, ticket):
    """PATCH {price?, sl, tp}: moves a pending order. DELETE: cancels it."""
    found, denied = _session(request, uid)
    if denied:
        return denied
    acc, password = found

    def go():
        mt5 = _login(acc.login, password, acc.server)
        _check_can_trade(mt5, request.data if request.method == 'PATCH' else request.query_params)
        result = modify_order(mt5, int(ticket), request.data) if request.method == 'PATCH' else cancel_order(mt5, int(ticket))
        return Response({"result": result, **_snapshot(mt5)})
    return _guard(go)


@api_view(['GET'])
def mt5_symbol(request, uid):
    """?symbol=: the broker's name for it, its prices and its lot / price rules (for the order form)"""
    found, denied = _session(request, uid)
    if denied:
        return denied
    acc, password = found

    def go():
        mt5 = _login(acc.login, password, acc.server)
        name, info = _symbol(mt5, request.query_params.get('symbol'))
        tick = mt5.symbol_info_tick(name)
        return Response({"symbol": name, "digits": info.digits, "volume_min": info.volume_min, "volume_max": info.volume_max,
                         "volume_step": info.volume_step, "contract_size": info.trade_contract_size,
                         "bid": tick.bid if tick else None, "ask": tick.ask if tick else None,
                         # when the price last changed, in real UTC ms (old: the market's closed)
                         "tick_time": (int(tick.time) - _server_offset(mt5, [name])) * 1000 if tick and getattr(tick, 'time', 0) else None})
    return _guard(go)
