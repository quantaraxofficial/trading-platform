"""Chart strategies auto-trading the linked MT5 account (the stand-in terminal)"""
import time

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import broker_mt5
from .broker_algo import magic_of
from .models import AlgoLog, AlgoStrategy, TraderProfile, UserSession

KEY = "Golden cross|XAU/USD|1h"


@override_settings(MT5_FAKE=True)
class AlgoTests(TestCase):
    def setUp(self):
        broker_mt5._mt5 = None
        broker_mt5._current = None
        broker_mt5._started = False
        self.c = APIClient()
        for u in ("own", "bob"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")
        self.c.post("/api/users/broker/own/mt5/?session_key=sk-own", {"login": "5012345", "password": "demo-pass", "server": "Demo-Server"}, format="json")

    def api(self, rest="", method="post", body=None, uid="own"):
        return getattr(self.c, method)(f"/api/users/broker/{uid}/mt5/algo/{rest}?session_key=sk-{uid}", body or {}, format="json")

    def switch_on(self, position=None, lots="0.02", **extra):
        return self.api(body={"key": KEY, "name": "Golden cross", "symbol": "XAU/USD", "timeframe": "1h", "lots": lots,
                              "enabled": True, "position": position, **extra})

    def sync(self, position):
        return self.api("sync/", body={"key": KEY, "position": position, "bar_seconds": 3600})

    def mine(self):
        s = AlgoStrategy.objects.get(key=KEY)
        return [p for p in broker_mt5._mt5.positions if p.magic == magic_of(s)]

    def test_follows_the_strategy_once_per_signal(self):
        r = self.switch_on()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["strategy"]["lots"], 0.02)
        now = int(time.time())
        long_ = {"dir": 1, "entry_time": now - 60}
        r = self.sync(long_)
        self.assertEqual(r.json()["action"], "traded", r.content)
        self.assertEqual([(p.type, p.volume, p.symbol) for p in self.mine()], [(0, 0.02, "XAUUSD+")])
        # The same report again (another tab, a re-run): nothing more
        self.assertEqual(self.sync(long_).json()["action"], "none")
        self.assertEqual(self.sync({"dir": 1, "entry_time": (now - 60) * 1000}).json()["action"], "none")   # ms, same entry
        self.assertEqual(len(self.mine()), 1)
        # Reversal: the long is closed and a short opened
        self.assertEqual(self.sync({"dir": -1, "entry_time": now}).json()["action"], "traded")
        self.assertEqual([p.type for p in self.mine()], [1])
        # Flat: closed. The manual position (ticket 101) is never touched
        self.assertEqual(self.sync(None).json()["action"], "traded")
        self.assertEqual(self.mine(), [])
        self.assertTrue(any(p.ticket == 101 for p in broker_mt5._mt5.positions))
        log = self.api(method="get").json()["log"]
        self.assertEqual([e["action"] for e in log], ["close", "open", "close", "open", "on"])
        self.assertIn("Sold 0.02 XAUUSD+", log[1]["message"])

    def test_a_position_held_before_switching_on_isnt_copied(self):
        held = {"dir": 1, "entry_time": int(time.time()) - 50000}
        self.switch_on(position=held)
        self.assertIn("trades from the next signal", self.api(method="get").json()["log"][0]["message"])
        self.assertEqual(self.sync(held).json()["action"], "none")
        self.assertEqual(self.mine(), [])
        self.assertEqual(self.sync(None).json()["action"], "none")   # its exit: nothing of ours to close

    def test_an_old_entry_is_skipped(self):
        self.switch_on()
        r = self.sync({"dir": 1, "entry_time": int(time.time()) - 3 * 3600})
        self.assertEqual(r.json()["action"], "skipped")
        self.assertEqual(self.mine(), [])
        self.assertIn("Skipped the long entry", AlgoLog.objects.first().message)

    def test_off_and_errors(self):
        self.switch_on()
        self.api(body={"key": KEY, "symbol": "XAU/USD", "enabled": False})
        self.assertEqual(self.sync({"dir": 1, "entry_time": int(time.time())}).json()["action"], "off")
        self.assertEqual(self.mine(), [])
        # Back on with too many lots: the broker refuses, it's logged, retried at most once a minute
        self.assertEqual(self.switch_on(lots="20").status_code, 201)
        pos = {"dir": 1, "entry_time": int(time.time())}
        r = self.sync(pos)
        self.assertEqual(r.status_code, 400)
        self.assertIn("Not enough money", r.json()["error"])
        self.assertEqual(self.sync(pos).json()["action"], "wait")
        self.assertEqual(AlgoLog.objects.filter(action="error").count(), 1)
        # Bad lots / symbol when switching on; someone else's session
        self.assertEqual(self.switch_on(lots="0.001").status_code, 400)
        self.assertEqual(self.api(body={"key": KEY, "symbol": "NOPE", "enabled": True, "lots": 0.01}).status_code, 400)
        self.assertEqual(self.c.post(f"/api/users/broker/own/mt5/algo/sync/?session_key=sk-bob", {"key": KEY}, format="json").status_code, 401)
        self.assertEqual(self.api("sync/", uid="bob", body={"key": KEY, "position": pos}).json()["action"], "off")

    def test_real_accounts_need_confirming(self):
        orig = broker_mt5.FakeMt5.account_info
        def real(self_):
            a = orig(self_)
            a.trade_mode = 2
            return a
        broker_mt5.FakeMt5.account_info = real
        try:
            self.assertEqual(self.switch_on().status_code, 428)
            self.assertEqual(self.switch_on(confirm_real=True).status_code, 201)
            self.assertEqual(self.sync({"dir": 1, "entry_time": int(time.time())}).json()["action"], "traded")
        finally:
            broker_mt5.FakeMt5.account_info = orig

    def test_forget(self):
        self.switch_on()
        sid = AlgoStrategy.objects.get().id
        self.assertEqual(self.api(f"{sid}/", "delete", uid="bob").status_code, 204)   # not bob's: nothing happens
        self.assertTrue(AlgoStrategy.objects.exists())
        self.api(f"{sid}/", "delete")
        self.assertFalse(AlgoStrategy.objects.exists())

