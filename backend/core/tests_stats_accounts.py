"""Connected accounts (core/stats_accounts.py): MT5 and cTrader accounts read only, their history and
live state, prop-firm rules (core/prop_rules.py) and the leaderboard. With the stand-in MT5
terminal and cTrader servers (MT5_FAKE, CTRADER_FAKE)."""
import time
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import broker_mt5, ctrader_api, prop_rules
from .models import StatsAccount, TraderProfile, UserSession

H, D = 3600 * 1000, 86400 * 1000


@override_settings(MT5_FAKE=True, CTRADER_FAKE=True)
class StatsAccountTests(TestCase):
    def setUp(self):
        broker_mt5._mt5 = None
        broker_mt5._current = None
        broker_mt5._started = False
        self.c = APIClient()
        self.me = TraderProfile.objects.create(uid="s1", name="Asha", email="s1@test.invalid")
        UserSession.objects.create(user=self.me, session_key="sk")
        self.base = "/api/users/stats/s1/"

    def get(self, path, **q):
        return self.c.get(self.base + path, {**q, "session_key": "sk"})

    def send(self, method, path, body=None):
        return getattr(self.c, method)(self.base + path + "?session_key=sk", body or {}, format="json")

    def test_mt5_connect_reads_history_and_live(self):
        r = self.send("post", "accounts/", {"login": "5012345", "password": "wrong", "server": "Demo-Server"})
        self.assertNotEqual(r.status_code, 201)
        r = self.send("post", "accounts/", {"login": "5012345", "password": "demo-pass", "server": "Demo-Server", "label": "FTMO 100k"})
        self.assertEqual(r.status_code, 201, r.content)
        a = r.json()["account"]
        self.assertEqual((a["platform"], a["label"], a["broker"], a["currency"]), ("mt5", "FTMO 100k", "Demo Broker Ltd", "USD"))
        self.assertEqual(len(a["trades"]), 2)                         # the two closed trades, every one on the account
        self.assertEqual(sum(1 for t in a["trades"] if t["pnl"] > 0), 1)
        # the password is kept encrypted, never sent back
        acc = StatsAccount.objects.get(id=a["id"])
        self.assertNotIn("demo-pass", acc.password)
        self.assertNotIn("password", a)
        live = self.get(f"accounts/{a['id']}/live/").json()
        self.assertEqual(live["account"]["balance"], 10000.0)
        self.assertEqual(len(live["positions"]), 1)
        # hidden: no live view
        self.send("patch", f"accounts/{a['id']}/", {"show_live": False})
        self.assertEqual(self.get(f"accounts/{a['id']}/live/").status_code, 403)

    def test_ctrader_connect(self):
        self.assertIn("id.ctrader.com", self.get("ctrader/").json()["url"])
        self.assertEqual(self.send("post", "ctrader/", {"code": "bad"}).status_code, 400)
        r = self.send("post", "ctrader/", {"code": "fake-code"})
        self.assertEqual(r.status_code, 201, r.content)
        a = r.json()["accounts"][0]
        self.assertEqual((a["platform"], a["login"], a["broker"], a["mode"]), ("ctrader", 7712345, "Demo Broker", "demo"))
        full = self.get(f"accounts/{a['id']}/").json()["account"]
        self.assertEqual([t["pnl"] for t in full["trades"]], [295.0, -245.0])   # net of swap and commission
        self.assertEqual(full["trades"][0]["side"], "long")
        self.assertEqual(full["initial_balance"], 10000.0)
        live = self.get(f"accounts/{a['id']}/live/").json()
        self.assertEqual((live["account"]["balance"], live["account"]["equity"]), (10050.0, 10062.5))
        self.assertEqual(live["positions"][0]["symbol"], "XAUUSD")
        # connecting again updates it, not a second copy
        self.send("post", "ctrader/", {"code": "fake-code"})
        self.assertEqual(StatsAccount.objects.filter(owner=self.me, platform="ctrader").count(), 1)
        acc = StatsAccount.objects.get(id=a["id"])
        self.assertNotIn("fake-access", acc.access_token)

    def test_prop_rules_from_a_preset(self):
        aid = self.send("post", "ctrader/", {"code": "fake-code"}).json()["accounts"][0]["id"]
        r = self.send("patch", f"accounts/{aid}/", {"firm": "ftmo_2step", "phase": "phase1", "account_size": 10000})
        p = r.json()["account"]["progress"]
        self.assertEqual((p["target"]["pct"], p["daily"]["pct"], p["max"]["pct"], p["days"]["min"]), (10, 5, 10, 4))
        self.assertEqual(p["profit"], 50.0)
        self.assertEqual(p["max"]["floor"], 9000.0)
        self.assertEqual(p["status"], "active")
        self.assertEqual(self.send("patch", f"accounts/{aid}/", {"firm": "nope"}).status_code, 400)
        self.assertEqual(self.send("patch", f"accounts/{aid}/", {"daily_loss_pct": 400}).status_code, 400)
        self.assertEqual(self.c.get("/api/users/stats/presets/").json()["presets"][0]["firm"], "FTMO")

    def test_only_your_own_accounts(self):
        aid = self.send("post", "ctrader/", {"code": "fake-code"}).json()["accounts"][0]["id"]
        other = TraderProfile.objects.create(uid="s2", name="B", email="s2@test.invalid")
        UserSession.objects.create(user=other, session_key="sk2")
        self.assertEqual(self.c.get(f"/api/users/stats/s2/accounts/{aid}/", {"session_key": "sk2"}).status_code, 404)
        self.assertEqual(self.c.get(f"/api/users/stats/s1/accounts/{aid}/", {"session_key": "sk2"}).status_code, 401)


class PropRulesTests(TestCase):
    rules = {"firm": "custom", "phase": "", "size": 10000, "target": 10, "daily": 5, "max": 10, "trailing": False, "min_days": 2, "tz": "UTC"}

    def t(self, day, pnl):
        at = int(time.time() * 1000) - day * D
        return {"entry_time": at - H, "exit_time": at, "pnl": pnl}

    def test_passed(self):
        p = prop_rules.progress(self.rules, [self.t(3, 600), self.t(2, 500)], 10000)
        self.assertEqual((p["status"], p["target"]["reached"], p["days"]["traded"]), ("passed", True, 2))

    def test_daily_breach_in_history(self):
        p = prop_rules.progress(self.rules, [self.t(3, 200), self.t(2, -300), self.t(2, -300)], 10000)
        self.assertEqual(p["breach"]["rule"], "daily")
        self.assertEqual(p["status"], "breached")

    def test_live_equity_breach(self):
        p = prop_rules.progress(self.rules, [self.t(3, 100)], 10000, live={"balance": 10100, "equity": 8900})
        self.assertEqual(p["breach"]["rule"], "max")
        self.assertTrue(p["breach"]["live"])

    def test_trailing_max_loss(self):
        p = prop_rules.progress({**self.rules, "trailing": True, "target": None}, [self.t(3, 500)], 10000)
        self.assertEqual(p["max"]["floor"], 9500.0)   # 10,500 high − 1,000
        p = prop_rules.progress({**self.rules, "trailing": True}, [self.t(3, 1500)], 10000)
        self.assertEqual(p["max"]["floor"], 10000.0)  # never above the account size


@override_settings(CTRADER_FAKE=True)
class LeaderboardTests(TestCase):
    def make(self, uid, pnls, on=True, mode="real"):
        p = TraderProfile.objects.create(uid=uid, name=uid.upper(), email=f"{uid}@test.invalid")
        now = int(time.time() * 1000)
        trades = [{"entry_time": now - (len(pnls) - i) * D - H, "exit_time": now - (len(pnls) - i) * D, "pnl": v} for i, v in enumerate(pnls)]
        return StatsAccount.objects.create(owner=p, platform="mt5", login=1, on_leaderboard=on, mode=mode, trades=trades,
                                           initial_balance=10000, synced_at=timezone.now())

    def test_ranked_by_return_opted_in_only_with_enough_trades(self):
        self.make("a", [100, 100, -50, 100, 100])        # +3.5%
        self.make("b", [500, 300, -100, 200, 100])       # +10%
        self.make("c", [900, 900, 900, 900, 900], on=False)
        self.make("d", [900, 900])                       # too few trades
        rows = APIClient().get("/api/users/stats/leaderboard/", {"period": "30d"}).json()["rows"]
        self.assertEqual([r["name"] for r in rows], ["B", "A"])
        self.assertEqual((rows[0]["rank"], rows[0]["return_pct"], rows[0]["win_rate"], rows[0]["profit_factor"]), (1, 10.0, 80.0, 11.0))
        rows = APIClient().get("/api/users/stats/leaderboard/", {"period": "30d", "sort": "win_rate", "mode": "demo"}).json()["rows"]
        self.assertEqual(rows, [])


class BacktestLeaderboardTests(TestCase):
    def make(self, uid, pnls, on=True, capital=10000):
        from .models import BacktestRun
        p = TraderProfile.objects.create(uid=uid, name=uid.upper(), email=f"{uid}@test.invalid")
        trades = [{"type": "Long", "entryTime": 1_700_000_000_000 + i * D, "exitTime": 1_700_000_000_000 + i * D + H, "netPnl": v} for i, v in enumerate(pnls)]
        return BacktestRun.objects.create(owner=p, name=f"{uid} strategy", symbol="XAUUSD", timeframe="15", initial_capital=capital,
                                          trades=trades, trade_count=len(trades), on_leaderboard=on)

    def publish(self, run, visibility="public"):
        from .models import PublishedScript
        return PublishedScript.objects.create(owner=run.owner, source_key=f"k{run.id}", name=run.script, kind="strategy", code="//", visibility=visibility)

    def test_shared_published_backtests_ranked(self):
        x = self.make("x", [100] * 8 + [-50] * 4)        # +6%, published privately
        y = self.make("y", [300] * 10 + [-100] * 2)      # +28%, published publicly
        self.make("u", [500] * 12)                       # shared but its strategy isn't published
        z = self.make("z", [900] * 12, on=False)         # not shared
        w = self.make("w", [900] * 5)                    # too few trades
        self.publish(x, "private"); self.publish(y); self.publish(z); self.publish(w)
        d = APIClient().get("/api/users/stats/leaderboard/backtests/").json()
        self.assertEqual([r["strategy"] for r in d["rows"]], ["y strategy", "x strategy"])
        self.assertEqual((d["rows"][0]["return_pct"], d["rows"][0]["win_rate"], d["rows"][0]["profit_factor"]), (28.0, 83.3, 15.0))
        self.assertEqual([r["published"] for r in d["rows"]], ["public", "private"])
        self.assertIsNone(d["rows"][1]["script_id"])     # a private one isn't linked

    def test_owner_shares_it_once_published(self):
        r = self.make("v", [10] * 12, on=False)
        UserSession.objects.create(user=r.owner, session_key="kv")
        c = APIClient()
        url = f"/api/users/analytics/v/backtests/{r.id}/?session_key=kv"
        self.assertEqual(c.patch(url, {"on_leaderboard": True}, format="json").status_code, 400)
        self.publish(r, "private")
        res = c.patch(url, {"on_leaderboard": True}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.json()["backtest"]["on_leaderboard"], res.json()["backtest"]["published"]), (True, "private"))
        self.assertEqual(len(c.get("/api/users/stats/leaderboard/backtests/").json()["rows"]), 1)

    def test_manual_backtests(self):
        from .models import ReplaySession
        def sess(uid, pnls, on=True):
            p = TraderProfile.objects.create(uid=uid, name=uid.upper(), email=f"{uid}@test.invalid")
            book = {"trades": [{"id": str(i), "symbol": "XAUUSD", "side": "buy", "entryTime": 1000 + i, "exitTime": 2000 + i, "pnl": v} for i, v in enumerate(pnls)]
                    + [{"id": "open", "symbol": "XAUUSD", "side": "buy", "entryTime": 5000, "exitTime": None, "pnl": 0}]}
            return ReplaySession.objects.create(owner=p, name=f"{uid} replay", symbol="XAUUSD", interval="15min", start_time=1, current_time=2,
                                                initial_balance=10000, book=book, on_leaderboard=on)
        sess("m1", [100] * 10)                             # +10%
        sess("m2", [200] * 10 + [-100] * 2)                # +18%
        sess("m3", [900] * 12, on=False)
        s4 = sess("m4", [10] * 12, on=False)
        rows = APIClient().get("/api/users/stats/leaderboard/manual/").json()["rows"]
        self.assertEqual([(r["session"], r["return_pct"], r["trades"]) for r in rows], [("m2 replay", 18.0, 12), ("m1 replay", 10.0, 10)])
        # its owner shares it from Analytics
        UserSession.objects.create(user=s4.owner, session_key="k4")
        res = APIClient().patch(f"/api/users/analytics/m4/sessions/{s4.id}/?session_key=k4", {"on_leaderboard": True}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()["session"]["on_leaderboard"])
        self.assertEqual(len(APIClient().get("/api/users/stats/leaderboard/manual/").json()["rows"]), 3)


class MarketTests(TestCase):
    """The boards on one market (a symbol, or a group), and the Most followed board"""
    def test_symbols_and_groups(self):
        from .symbol_groups import group_of, normalize
        cases = {"XAUUSD+": ("XAUUSD", "metals"), "XAU/USD": ("XAUUSD", "metals"), "OANDA:XAUUSD": ("XAUUSD", "metals"), "GOLD": ("XAUUSD", "metals"),
                 "EURUSD.r": ("EURUSD", "forex"), "EUR/USD": ("EURUSD", "forex"), "gbpjpym": ("GBPJPY", "forex"), "BTCUSDT": ("BTCUSD", "crypto"),
                 "US30.cash": ("US30", "indices"), "NAS100": ("US100", "indices"), "USOIL": ("USOIL", "energies"), "AAPL": ("AAPL", "other")}
        for raw, (sym, grp) in cases.items():
            self.assertEqual((normalize(raw), group_of(raw)), (sym, grp), raw)

    def test_accounts_on_a_market(self):
        now = int(time.time() * 1000)
        p = TraderProfile.objects.create(uid="mk", name="MK", email="mk@test.invalid")
        trades = [{"symbol": "XAUUSD+" if i % 2 else "EURUSD.r", "entry_time": now - (20 - i) * D - H, "exit_time": now - (20 - i) * D,
                   "pnl": 100 if i % 2 else -50} for i in range(14)]
        StatsAccount.objects.create(owner=p, platform="mt5", login=1, on_leaderboard=True, mode="real", trades=trades, initial_balance=10000)
        get = lambda **q: APIClient().get("/api/users/stats/leaderboard/", {"period": "30d", **q}).json()["rows"]
        self.assertEqual((get()[0]["trades"], get()[0]["net"]), (14, 350.0))
        gold = get(market="metals")[0]
        self.assertEqual((gold["trades"], gold["net"], gold["win_rate"], gold["symbols"]), (7, 700.0, 100.0, ["XAUUSD"]))
        self.assertEqual(get(market="XAU/USD")[0]["net"], 700.0)          # the symbol, however it's written
        self.assertEqual(get(market="forex")[0]["net"], -350.0)
        self.assertEqual(get(market="crypto"), [])
        mk = APIClient().get("/api/users/stats/leaderboard/markets/").json()
        self.assertEqual({x["symbol"]: x["group"] for x in mk["symbols"]}, {"XAUUSD": "metals", "EURUSD": "forex"})
        self.assertIn({"id": "forex", "label": "Forex (currencies)"}, mk["groups"])

    def test_manual_on_a_market(self):
        from .models import ReplaySession
        p = TraderProfile.objects.create(uid="ms", name="MS", email="ms@test.invalid")
        book = {"trades": [{"id": str(i), "symbol": "XAUUSD" if i < 12 else "EURUSD", "exitTime": 2000 + i, "pnl": 50} for i in range(15)]}
        ReplaySession.objects.create(owner=p, name="mixed", symbol="XAUUSD", interval="15min", start_time=1, current_time=2, initial_balance=10000, book=book, on_leaderboard=True)
        get = lambda **q: APIClient().get("/api/users/stats/leaderboard/manual/", q).json()["rows"]
        self.assertEqual(get(market="metals")[0]["trades"], 12)
        self.assertEqual(get(market="forex"), [])   # 3 trades: under the 10 needed

    def test_most_followed(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import Follow
        ps = {u: TraderProfile.objects.create(uid=u, name=u.upper(), email=f"{u}@test.invalid", username=u) for u in ("aa", "bb", "cc", "dd")}
        for f in ("bb", "cc", "dd"):
            Follow.objects.create(follower=ps[f], following=ps["aa"])                 # aa: 3 followers
        for f in ("aa", "cc"):
            Follow.objects.create(follower=ps[f], following=ps["bb"])                 # bb: 2
        Follow.objects.filter(following=ps["aa"]).update(created_at=timezone.now() - timedelta(days=60))   # aa's are old
        rows = APIClient().get("/api/users/stats/leaderboard/followers/").json()["rows"]
        self.assertEqual([(r["username"], r["followers"]) for r in rows], [("aa", 3), ("bb", 2)])
        rows = APIClient().get("/api/users/stats/leaderboard/followers/", {"period": "30d", "sort": "gained"}).json()["rows"]
        self.assertEqual([(r["username"], r["gained"]) for r in rows], [("bb", 2), ("aa", 0)])
