"""cTrader accounts through Spotware's official cTrader Open API (help.ctrader.com/open-api), read only:
the trader signs in with their cTrader ID and allows TradePilot to *view* their accounts (scope
"accounts": no trading), and the site reads each account's balance, open positions with their
floating P&L, and its whole deal history.

Sign-in (OAuth): the browser goes to cTrader's grant page (`auth_url`), which sends it back to
CTRADER_REDIRECT_URI (the site's /analytics/ctrader page) with a one-minute `code`; the page hands
it to the backend, which trades it for an access token (30 days) and a refresh token (kept
encrypted, never sent to the browser) and lists the accounts the trader allowed.

The API itself: JSON messages over a WebSocket (wss://live|demo.ctraderapi.com:5036), each
{"clientMsgId", "payloadType", "payload"}: the application signs in (ProtoOAApplicationAuthReq),
then each account (ProtoOAAccountAuthReq), then requests. Money comes as integers × 10^moneyDigits,
volumes in cents of a unit (100 = 1 unit).

Needs CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET (an application registered at openapi.ctrader.com)
and CTRADER_REDIRECT_URI (that application's redirect URI). CTRADER_FAKE uses a stand-in account
(tests, and trying the site without an application)."""

import itertools
import json
import time
from urllib.parse import urlencode

import requests
from django.conf import settings

AUTH_URL = "https://id.ctrader.com/my/settings/openapi/grantingaccess/"
TOKEN_URL = "https://openapi.ctrader.com/apps/token"
HOSTS = {True: "wss://live.ctraderapi.com:5036", False: "wss://demo.ctraderapi.com:5036"}

# ProtoOAPayloadType (help.ctrader.com/open-api/model-messages)
APP_AUTH, APP_AUTH_RES = 2100, 2101
ACCOUNT_AUTH, ACCOUNT_AUTH_RES = 2102, 2103
ASSETS, ASSETS_RES = 2112, 2113
SYMBOLS, SYMBOLS_RES = 2114, 2115
TRADER, TRADER_RES = 2121, 2122
RECONCILE, RECONCILE_RES = 2124, 2125
DEALS, DEALS_RES = 2133, 2134
OA_ERROR, COMMON_ERROR, HEARTBEAT = 2142, 50, 51
ACCOUNTS_BY_TOKEN, ACCOUNTS_BY_TOKEN_RES = 2149, 2150
UNREALIZED, UNREALIZED_RES = 2187, 2188
BUY, SELL = 1, 2
FILLED, PARTIALLY_FILLED = 2, 3
WEEK_MS = 7 * 86400 * 1000


class CtraderError(Exception):
    def __init__(self, message, code=502):
        super().__init__(message)
        self.message, self.code = message, code


def configured():
    return bool(settings.CTRADER_FAKE or (settings.CTRADER_CLIENT_ID and settings.CTRADER_CLIENT_SECRET and settings.CTRADER_REDIRECT_URI))


def auth_url(state=""):
    """cTrader's page where the trader allows TradePilot to view their accounts"""
    q = {"client_id": settings.CTRADER_CLIENT_ID, "redirect_uri": settings.CTRADER_REDIRECT_URI, "scope": "accounts", "product": "web"}
    if state:
        q["state"] = state
    return f"{AUTH_URL}?{urlencode(q)}"


def _token(resp):
    try:
        d = resp.json()
    except ValueError:
        raise CtraderError(f"cTrader didn't answer the sign-in ({resp.status_code})")
    if d.get("errorCode") or not d.get("accessToken"):
        raise CtraderError(d.get("description") or d.get("errorCode") or "cTrader refused the sign-in: try connecting again", 400)
    return {"access": d["accessToken"], "refresh": d.get("refreshToken") or "", "expires_in": int(d.get("expiresIn") or 2628000)}


def exchange_code(code):
    """The one-minute code from the redirect → {access, refresh, expires_in}"""
    if settings.CTRADER_FAKE:
        if code != "fake-code":
            raise CtraderError("cTrader refused the sign-in: try connecting again", 400)
        return {"access": "fake-access", "refresh": "fake-refresh", "expires_in": 2628000}
    q = {"grant_type": "authorization_code", "code": code, "redirect_uri": settings.CTRADER_REDIRECT_URI,
         "client_id": settings.CTRADER_CLIENT_ID, "client_secret": settings.CTRADER_CLIENT_SECRET}
    return _token(requests.get(TOKEN_URL, params=q, timeout=20))


def refresh_token(refresh):
    """A new access token (the old one and the old refresh token stop working)"""
    if settings.CTRADER_FAKE:
        return {"access": "fake-access", "refresh": "fake-refresh", "expires_in": 2628000}
    q = {"grant_type": "refresh_token", "refresh_token": refresh,
         "client_id": settings.CTRADER_CLIENT_ID, "client_secret": settings.CTRADER_CLIENT_SECRET}
    # (the docs' table says GET, their example POST: either way the fields are in the query)
    try:
        return _token(requests.post(TOKEN_URL, params=q, timeout=20))
    except CtraderError:
        return _token(requests.get(TOKEN_URL, params=q, timeout=20))


class Client:
    """One connection to cTrader's live or demo servers, the application signed in"""

    def __init__(self, live):
        from websocket import create_connection
        try:
            self.ws = create_connection(HOSTS[bool(live)], timeout=25)
        except Exception as e:
            raise CtraderError(f"Couldn't reach cTrader ({e.__class__.__name__})")
        self.ids = itertools.count(1)
        self.call(APP_AUTH, {"clientId": settings.CTRADER_CLIENT_ID, "clientSecret": settings.CTRADER_CLIENT_SECRET}, APP_AUTH_RES)

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def call(self, ptype, payload, expect, deadline=30):
        mid = f"tp{next(self.ids)}"
        self.ws.send(json.dumps({"clientMsgId": mid, "payloadType": ptype, "payload": payload}))
        end = time.time() + deadline
        while time.time() < end:
            try:
                msg = json.loads(self.ws.recv())
            except Exception as e:
                raise CtraderError(f"The connection to cTrader dropped ({e.__class__.__name__})")
            pt = int(msg.get("payloadType") or 0)
            if pt == HEARTBEAT:
                self.ws.send(json.dumps({"payloadType": HEARTBEAT, "payload": {}}))
                continue
            if msg.get("clientMsgId") != mid:
                continue   # events, other answers
            body = msg.get("payload") or {}
            if pt in (OA_ERROR, COMMON_ERROR):
                code = str(body.get("errorCode") or "")
                if code == "ALREADY_LOGGED_IN":
                    return body
                raise CtraderError(_ERRORS.get(code) or body.get("description") or code or "cTrader refused the request",
                                   401 if code in ("CH_ACCESS_TOKEN_INVALID", "OA_AUTH_TOKEN_EXPIRED", "ACCOUNT_NOT_AUTHORIZED") else 502)
            if pt == expect:
                return body
        raise CtraderError("cTrader didn't answer in time")

    # ---- requests
    def accounts(self, token):
        return self.call(ACCOUNTS_BY_TOKEN, {"accessToken": token}, ACCOUNTS_BY_TOKEN_RES).get("ctidTraderAccount") or []

    def auth_account(self, ctid, token):
        self.call(ACCOUNT_AUTH, {"ctidTraderAccountId": int(ctid), "accessToken": token}, ACCOUNT_AUTH_RES)

    def trader(self, ctid):
        return self.call(TRADER, {"ctidTraderAccountId": int(ctid)}, TRADER_RES).get("trader") or {}

    def currency(self, ctid, asset_id):
        try:
            assets = self.call(ASSETS, {"ctidTraderAccountId": int(ctid)}, ASSETS_RES).get("asset") or []
        except CtraderError:
            return ""
        a = next((a for a in assets if int(a.get("assetId") or 0) == int(asset_id or -1)), None)
        return (a.get("displayName") or a.get("name") or "") if a else ""

    def symbols(self, ctid):
        r = self.call(SYMBOLS, {"ctidTraderAccountId": int(ctid), "includeArchivedSymbols": True}, SYMBOLS_RES)
        out = {int(s["symbolId"]): s.get("symbolName") or str(s["symbolId"]) for s in r.get("symbol") or [] if "symbolId" in s}
        for s in r.get("archivedSymbol") or []:
            if "symbolId" in s:
                out.setdefault(int(s["symbolId"]), s.get("name") or str(s["symbolId"]))
        return out

    def positions(self, ctid):
        return self.call(RECONCILE, {"ctidTraderAccountId": int(ctid)}, RECONCILE_RES).get("position") or []

    def unrealized(self, ctid):
        r = self.call(UNREALIZED, {"ctidTraderAccountId": int(ctid)}, UNREALIZED_RES)
        f = 10 ** int(r.get("moneyDigits") or 2)
        return {int(p["positionId"]): int(p.get("netUnrealizedPnL") or 0) / f for p in r.get("positionUnrealizedPnL") or []}

    def deals(self, ctid, since_ms):
        """Every deal since `since_ms`, newest pages first (hasMore: asked again before the oldest one).
        If the server finds the period too long, it's asked a week at a time."""
        now = int(time.time() * 1000)
        try:
            return self._deals(ctid, since_ms, now)
        except CtraderError as e:
            if "INCORRECT_BOUNDARIES" not in e.message and "period" not in e.message.lower():
                raise
        out, frm = [], since_ms
        while frm < now:
            out += self._deals(ctid, frm, min(frm + WEEK_MS, now))
            frm += WEEK_MS
        return out

    def _deals(self, ctid, frm, to):
        out = []
        while True:
            r = self.call(DEALS, {"ctidTraderAccountId": int(ctid), "fromTimestamp": int(frm), "toTimestamp": int(to), "maxRows": 1000}, DEALS_RES)
            page = r.get("deal") or []
            out += page
            if not r.get("hasMore") or not page:
                return out
            to = min(int(d.get("executionTimestamp") or d.get("createTimestamp") or to) for d in page) - 1


_ERRORS = {
    "CH_ACCESS_TOKEN_INVALID": "cTrader's permission ran out: connect cTrader again",
    "OA_AUTH_TOKEN_EXPIRED": "cTrader's permission ran out: connect cTrader again",
    "CH_CLIENT_AUTH_FAILURE": "TradePilot's cTrader application was refused (its ID / secret)",
    "CH_CTID_TRADER_ACCOUNT_NOT_FOUND": "cTrader no longer has this account",
    "REQUEST_FREQUENCY_EXCEEDED": "cTrader is asked too often: try again in a minute",
    "BLOCKED_PAYLOAD_TYPE": "cTrader is asked too often: try again in a minute",
    "SERVER_IS_UNDER_MAINTENANCE": "cTrader is under maintenance: try again later",
}


# ---------------------------------------------------------------- reading an account

def _money(v, digits):
    return int(v or 0) / (10 ** int(digits if digits is not None else 2))


def to_trades(deals, names):
    """Closed trades from deals: each closing deal (a whole or partial close) with its position's
    opening deal; profit net of swap, commission and conversion fee; the balance after it"""
    opens = {}
    for d in deals:
        if d.get("closePositionDetail") or int(d.get("dealStatus") or 0) not in (FILLED, PARTIALLY_FILLED):
            continue
        pid = int(d.get("positionId") or 0)
        if pid not in opens or int(d.get("executionTimestamp") or 0) < int(opens[pid].get("executionTimestamp") or 0):
            opens[pid] = d
    trades = []
    for d in deals:
        c = d.get("closePositionDetail")
        if not c or int(d.get("dealStatus") or 0) not in (FILLED, PARTIALLY_FILLED):
            continue
        md = c.get("moneyDigits", d.get("moneyDigits", 2))
        gross, swap = _money(c.get("grossProfit"), md), _money(c.get("swap"), md)
        comm = -abs(_money(c.get("commission"), md)) - abs(_money(c.get("pnlConversionFee"), md))
        pid = int(d.get("positionId") or 0)
        op = opens.get(pid)
        trades.append({
            "ticket": int(d.get("dealId") or 0), "position": pid, "symbol": names.get(int(d.get("symbolId") or 0), str(d.get("symbolId"))),
            # (a sell closes a long)
            "side": "long" if int(d.get("tradeSide") or 0) == SELL else "short",
            "volume": round(int(c.get("closedVolume") or d.get("filledVolume") or d.get("volume") or 0) / 100, 2),
            "entry_time": int(op.get("executionTimestamp")) if op else None, "entry_price": float(c.get("entryPrice") or 0),
            "exit_time": int(d.get("executionTimestamp") or d.get("createTimestamp") or 0), "exit_price": float(d.get("executionPrice") or 0),
            "profit": round(gross, 2), "commission": round(comm, 2), "swap": round(swap, 2),
            "pnl": round(gross + swap + comm, 2), "balance_after": round(_money(c.get("balance"), md), 2), "comment": d.get("comment") or "",
            # (a cBot's label on its trades: the algo leaderboard's name for it)
            "label": (d.get("label") or (op.get("label") if op else "") or "")[:100],
        })
    trades.sort(key=lambda t: t["exit_time"])
    for t in trades:
        if not t["entry_time"]:
            t["entry_time"] = t["exit_time"]
    return trades


def read_account(token, ctid, live, history=True):
    """{account, positions, trades?, initial_balance?} of one cTrader account"""
    cli = FakeClient() if settings.CTRADER_FAKE else Client(live)
    with cli:
        cli.auth_account(ctid, token)
        tr = cli.trader(ctid)
        md = tr.get("moneyDigits", 2)
        balance = _money(tr.get("balance"), md)
        names = cli.symbols(ctid)
        pnl = cli.unrealized(ctid)
        positions = []
        for p in cli.positions(ctid):
            td = p.get("tradeData") or {}
            pid = int(p.get("positionId") or 0)
            pmd = p.get("moneyDigits", md)
            positions.append({
                "ticket": pid, "symbol": names.get(int(td.get("symbolId") or 0), str(td.get("symbolId"))),
                "side": "buy" if int(td.get("tradeSide") or 0) == BUY else "sell", "volume": round(int(td.get("volume") or 0) / 100, 2),
                "open_price": float(p.get("price") or 0), "sl": p.get("stopLoss"), "tp": p.get("takeProfit"),
                "profit": round(pnl.get(pid, 0.0), 2), "swap": round(_money(p.get("swap"), pmd), 2), "time": int(td.get("openTimestamp") or 0),
            })
        account = {
            "login": int(tr.get("traderLogin") or 0), "broker": tr.get("brokerName") or "", "currency": cli.currency(ctid, tr.get("depositAssetId")),
            "balance": round(balance, 2), "equity": round(balance + sum(pnl.values()), 2), "floating": round(sum(pnl.values()), 2),
            "leverage": int(tr.get("leverageInCents") or 0) // 100, "mode": "real" if live else "demo",
        }
        out = {"account": account, "positions": positions}
        if history:
            since = int(tr.get("registrationTimestamp") or 0) or int((time.time() - 3 * 365 * 86400) * 1000)
            trades = to_trades(cli.deals(ctid, since), names)
            out["trades"] = trades
            out["initial_balance"] = round(trades[0]["balance_after"] - trades[0]["pnl"], 2) if trades else round(balance, 2)
        return out


def list_accounts(token):
    """The accounts the trader allowed: [{ctid, login, live, broker}]"""
    cli = FakeClient() if settings.CTRADER_FAKE else Client(True)
    with cli:
        return [{"ctid": int(a["ctidTraderAccountId"]), "login": int(a.get("traderLogin") or 0), "live": bool(a.get("isLive")),
                 "broker": a.get("brokerTitleShort") or ""} for a in cli.accounts(token)]


class FakeClient:
    """A stand-in for cTrader's servers: one demo account (balance 10,000 USD), a won and a lost
    trade, and one open position"""

    def __init__(self, *a):
        now = int(time.time() * 1000)
        self.now = now

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def close(self):
        pass

    def accounts(self, token):
        if token != "fake-access":
            raise CtraderError("cTrader's permission ran out: connect cTrader again", 401)
        return [{"ctidTraderAccountId": 3001, "traderLogin": 7712345, "isLive": False, "brokerTitleShort": "Demo Broker"}]

    def auth_account(self, ctid, token):
        if token != "fake-access" or int(ctid) != 3001:
            raise CtraderError("cTrader's permission ran out: connect cTrader again", 401)

    def trader(self, ctid):
        return {"ctidTraderAccountId": 3001, "balance": 1005000, "moneyDigits": 2, "depositAssetId": 1, "traderLogin": 7712345,
                "brokerName": "Demo Broker", "leverageInCents": 50000, "registrationTimestamp": self.now - 30 * 86400 * 1000}

    def currency(self, ctid, asset_id):
        return "USD"

    def symbols(self, ctid):
        return {1: "EURUSD", 41: "XAUUSD"}

    def unrealized(self, ctid):
        return {9003: 12.5}

    def positions(self, ctid):
        return [{"positionId": 9003, "tradeData": {"symbolId": 41, "volume": 100, "tradeSide": BUY, "openTimestamp": self.now - 3600 * 1000},
                 "price": 3990.0, "swap": 0, "moneyDigits": 2, "stopLoss": 3970.0}]

    def deals(self, ctid, since_ms):
        n, h, d = self.now, 3600 * 1000, 86400 * 1000
        deal = lambda did, pid, side, sym, at, price, close=None: {
            "dealId": did, "orderId": did, "positionId": pid, "symbolId": sym, "tradeSide": side, "dealStatus": FILLED,
            "volume": 10000000, "filledVolume": 10000000, "createTimestamp": at, "executionTimestamp": at, "executionPrice": price,
            **({"closePositionDetail": close} if close else {})}
        return [
            deal(1, 9001, BUY, 1, n - 3 * d, 1.0800),
            deal(2, 9001, SELL, 1, n - 3 * d + 2 * h, 1.0830, {"entryPrice": 1.0800, "grossProfit": 30000, "swap": -100, "commission": -400,
                                                                "balance": 1029500, "closedVolume": 10000000, "moneyDigits": 2}),
            deal(3, 9002, SELL, 41, n - 2 * d, 3980.0),
            deal(4, 9002, BUY, 41, n - 2 * d + h, 3992.0, {"entryPrice": 3980.0, "grossProfit": -24000, "swap": 0, "commission": -500,
                                                           "balance": 1005000, "closedVolume": 100, "moneyDigits": 2}),
            deal(5, 9003, BUY, 41, n - h, 3990.0),
        ]
