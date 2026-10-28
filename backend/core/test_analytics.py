"""Analytics: saved backtests, trade journals, and the linked MT5 account's closed trades"""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import broker_mt5
from .models import BacktestRun, TradeJournal, TraderProfile, UserSession

TRADES = [
    {"type": "Long", "entryTime": 1790000000, "entryPrice": 100, "exitTime": 1790003600, "exitPrice": 110, "qty": 1, "netPnl": 10,
     "commission": 0, "favorableExcursion": 12, "adverseExcursion": -2, "entrySignal": "L", "exitSignal": "TP"},
    {"type": "Short", "entryTime": 1790007200, "entryPrice": 110, "exitTime": 1790010800, "exitPrice": 114, "qty": 1, "netPnl": -4},
    {"type": "Sideways", "entryTime": 1, "netPnl": 1},   # not a trade: dropped
]


class AnalyticsTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        for u in ("own", "bob"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")

    def api(self, rest="", method="get", body=None, uid="own", query=""):
        return getattr(self.c, method)(f"/api/users/analytics/{uid}/{rest}?session_key=sk-{uid}{query}", body or {}, format="json")

    def test_backtests_save_list_read_delete(self):
        r = self.api("backtests/", "post", {"name": "SMA cross", "script": "SMA cross", "symbol": "XAU/USD", "timeframe": "1h",
                                            "initial_capital": 10000, "trades": TRADES})
        self.assertEqual(r.status_code, 201, r.content)
        b = r.json()["backtest"]
        self.assertEqual((b["trade_count"], b["net_profit"], b["period_from"], b["period_to"]), (2, 6.0, 1790000000000, 1790010800000))
        lst = self.api("backtests/").json()["backtests"]
        self.assertEqual(len(lst), 1)
        self.assertNotIn("trades", lst[0])
        full = self.api(f"backtests/{b['id']}/").json()["backtest"]
        self.assertEqual([t["type"] for t in full["trades"]], ["Long", "Short"])
        self.assertEqual(self.api(f"backtests/{b['id']}/", uid="bob").status_code, 404)   # not bob's
        self.assertEqual(self.api(f"backtests/{b['id']}/", "patch", {"name": "Renamed"}).json()["backtest"]["name"], "Renamed")
        self.api("journal/", "put", {"source": "backtest", "trade_key": f"{b['id']}:0", "lessons": "x"})
        self.api(f"backtests/{b['id']}/", "delete")
        self.assertFalse(BacktestRun.objects.exists())
        self.assertFalse(TradeJournal.objects.exists())   # its trades' journals go with it
        self.assertEqual(self.api("backtests/", "post", {"name": "x", "trades": []}).status_code, 400)
        self.assertEqual(self.api("backtests/", uid="own", query="").status_code, 200)
        self.assertEqual(self.c.get("/api/users/analytics/own/backtests/?session_key=sk-bob").status_code, 401)

    def test_journal(self):
        r = self.api("journal/", "put", {"source": "paper", "trade_key": "acc1:T7", "symbol": "EUR/USD", "pre_trade": "Breakout",
                                         "tags": ["breakout", "breakout", " ", "london"], "checklist": {"followed_plan": True, "good_entry": "yes"},
                                         "rating": 14})
        self.assertEqual(r.status_code, 200, r.content)
        e = r.json()["entry"]
        self.assertEqual((e["tags"], e["checklist"]["followed_plan"], e["checklist"]["good_entry"], e["rating"]), (["breakout", "london"], True, False, 10))
        self.api("journal/", "put", {"source": "paper", "trade_key": "acc1:T7", "lessons": "Wait for the close"})
        e = self.api("journal/", query="&source=paper").json()["entries"][0]
        self.assertEqual((e["pre_trade"], e["lessons"]), ("Breakout", "Wait for the close"))   # a partial save keeps the rest
        self.assertEqual(self.api("journal/", uid="bob").json()["entries"], [])
        self.assertEqual(self.api("journal/", "put", {"source": "elsewhere", "trade_key": "1"}).status_code, 400)
        self.api("journal/", "delete", query="&source=paper&trade_key=acc1:T7")
        self.assertFalse(TradeJournal.objects.exists())


@override_settings(MT5_FAKE=True)
class Mt5HistoryTests(TestCase):
    def setUp(self):
        broker_mt5._mt5 = None
        broker_mt5._current = None
        broker_mt5._started = False
        self.c = APIClient()
        p = TraderProfile.objects.create(uid="own", name="Own", email="own@example.com")
        UserSession.objects.create(user=p, session_key="sk-own")
        self.c.post("/api/users/broker/own/mt5/?session_key=sk-own", {"login": "5012345", "password": "demo-pass", "server": "Demo-Server"}, format="json")

    def test_closed_trades_pair_entries_and_exits(self):
        d = self.c.get("/api/users/broker/own/mt5/history/?session_key=sk-own&days=30").json()
        self.assertEqual([(t["symbol"], t["side"], t["profit"], t["commission"]) for t in d["trades"]],
                         [("XAUUSD+", "long", 200.0, -0.7), ("EURUSD+", "short", -150.0, -0.7)])   # the open position isn't one
        self.assertEqual((d["trades"][0]["entry_price"], d["trades"][0]["exit_price"]), (3950.0, 3970.0))
        # A trade placed and closed now joins them
        o = self.c.post("/api/users/broker/own/mt5/order/?session_key=sk-own", {"symbol": "XAUUSD", "side": "sell", "type": "market", "volume": "0.02"}, format="json").json()
        self.c.delete(f"/api/users/broker/own/mt5/position/{o['result']['order']}/?session_key=sk-own")
        last = self.c.get("/api/users/broker/own/mt5/history/?session_key=sk-own").json()["trades"][-1]
        self.assertEqual((last["side"], last["volume"]), ("short", 0.02))
        self.assertEqual(len(self.c.get("/api/users/broker/own/mt5/history/?session_key=sk-own&days=1").json()["trades"]), 1)


class SessionTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        for u in ("own", "bob"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")

    def api(self, rest="", method="get", body=None, uid="own"):
        return getattr(self.c, method)(f"/api/users/analytics/{uid}/sessions/{rest}?session_key=sk-{uid}", body or {}, format="json")

    def test_create_save_progress_resume_delete(self):
        r = self.api("", "post", {"name": "Gold London breakouts", "symbol": "XAU/USD", "interval": "15min", "interval_label": "15m",
                                  "start_time": 1756684800, "initial_balance": 25000, "rules": ["Break of Asian high", " "], "tags": ["gold"]})
        self.assertEqual(r.status_code, 201, r.content)
        s = r.json()["session"]
        self.assertEqual((s["current_time"], s["status"], s["balance"], s["rules"]), (1756684800, "active", 25000, ["Break of Asian high"]))
        book = {"positions": [], "orders": [], "trades": [
            {"id": "a", "symbol": "XAU/USD", "side": "buy", "qty": 1, "entryTime": 1, "entryPrice": 3300, "exitTime": 2, "exitPrice": 3310, "pnl": 10},
            {"id": "b", "symbol": "XAU/USD", "side": "sell", "qty": 1, "entryTime": 3, "entryPrice": 3310}]}
        r = self.api(f"{s['id']}/", "patch", {"current_time": 1757030400, "visible_bars": 140, "account": {"id": "x", "balance": 25010},
                                              "book": book, "add_time_spent": 95, "status": "paused"})
        self.assertEqual(r.status_code, 200, r.content)
        self.api(f"{s['id']}/", "patch", {"add_time_spent": 99999})   # capped per save
        got = self.api(f"{s['id']}/").json()["session"]
        self.assertEqual((got["current_time"], got["visible_bars"], got["balance"], got["trade_count"], got["open_count"], got["net_pnl"], got["time_spent"], got["status"]),
                         (1757030400, 140, 25010, 1, 1, 10.0, 95 + 3600, "paused"))
        self.assertEqual(got["book"]["trades"][0]["id"], "a")
        lst = self.api().json()["sessions"]
        self.assertNotIn("book", lst[0])
        self.assertEqual(self.api(f"{s['id']}/", uid="bob").status_code, 404)
        self.assertEqual(self.api(f"{s['id']}/", "patch", {"status": "sleeping"}).status_code, 400)
        self.assertEqual(self.api(f"{s['id']}/", "patch", {"account": "x", "book": {}}).status_code, 400)
        self.api("../journal/", "put", {"source": "session", "trade_key": f"{s['id']}:a", "lessons": "x"})
        self.api(f"{s['id']}/", "delete")
        self.assertFalse(TradeJournal.objects.exists())

    def test_needs_symbol_and_start(self):
        self.assertEqual(self.api("", "post", {"symbol": "", "interval": "1h", "start_time": 1}).status_code, 400)
        self.assertEqual(self.api("", "post", {"symbol": "EUR/USD", "interval": "1h"}).status_code, 400)
        self.assertEqual(self.api("", "post", {"symbol": "EUR/USD", "interval": "1h", "start_time": 1756684800, "initial_balance": -5}).status_code, 400)

    def test_each_session_has_its_own_drawings(self):
        mk = lambda name: self.api("", "post", {"name": name, "symbol": "XAU/USD", "interval": "1h", "start_time": 1756684800}).json()["session"]["id"]
        a, b = mk("A"), mk("B")
        line = {"id": "d1", "type": "trendline", "points": [{"time": 1756684800, "price": 3400}, {"time": 1756688400, "price": 3410}]}
        self.assertEqual(self.api(f"{a}/drawings/", "put", {"drawings": [line]}).json()["drawings"], [line])
        self.assertEqual(self.api(f"{a}/drawings/").json()["drawings"], [line])
        self.assertEqual(self.api(f"{b}/drawings/").json()["drawings"], [])          # B's stay apart
        self.assertEqual(self.api(f"{a}/drawings/", uid="bob").status_code, 404)
        self.assertEqual(self.api(f"{a}/drawings/", "put", {"drawings": "x"}).status_code, 400)
        c = self.api("", "post", {"name": "C", "symbol": "XAU/USD", "interval": "1h", "start_time": 1756684800, "drawings": [line]}).json()["session"]["id"]
        self.assertEqual(self.api(f"{c}/drawings/").json()["drawings"], [line])     # copied in when created


class SavedReplayTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        for u in ("own", "bob"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")

    def api(self, method="get", body=None, uid="own", query=""):
        return getattr(self.c, method)(f"/api/users/analytics/{uid}/replays/?session_key=sk-{uid}{query}", body or {}, format="json")

    def test_one_per_symbol_newest_wins(self):
        r = self.api("put", {"symbol": "XAU/USD", "interval": "1h", "time": 1757062800, "savedAt": 2000})
        self.assertEqual(r.status_code, 200, r.content)
        self.api("put", {"symbol": "XAU/USD", "interval": "15min", "time": 1757100000, "savedAt": 3000})   # replaces it
        self.api("put", {"symbol": "XAU/USD", "interval": "1day", "time": 1, "savedAt": 1000})               # older: ignored
        self.api("put", {"symbol": "EUR/USD", "interval": "1h", "time": 1757000000})
        got = {r["symbol"]: r for r in self.api().json()["replays"]}
        self.assertEqual((got["XAU/USD"]["interval"], got["XAU/USD"]["time"]), ("15min", 1757100000))
        self.assertEqual(len(got), 2)
        self.assertEqual(self.api(uid="bob").json()["replays"], [])
        self.assertEqual(self.api("put", {"symbol": "", "interval": "1h", "time": 5}).status_code, 400)
        self.api("delete", query="&symbol=EUR/USD")
        self.assertEqual([r["symbol"] for r in self.api().json()["replays"]], ["XAU/USD"])
