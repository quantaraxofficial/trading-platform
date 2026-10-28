"""Linking a MetaTrader 5 account (with the stand-in terminal) and reading it"""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import broker_mt5
from .models import BrokerAccount, TraderProfile, UserSession


@override_settings(MT5_FAKE=True)
class Mt5LinkTests(TestCase):
    def setUp(self):
        broker_mt5._mt5 = None       # a fresh stand-in terminal for each test
        broker_mt5._current = None
        broker_mt5._started = False
        self.c = APIClient()
        for u in ("own", "bob"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")

    def api(self, uid, rest="", method="get", body=None, key=None):
        return getattr(self.c, method)(f"/api/users/broker/{uid}/mt5/{rest}?session_key={key or 'sk-' + uid}", body or {}, format="json")

    def test_link_read_unlink(self):
        self.assertIsNone(self.api("own").json()["linked"])
        bad = self.api("own", method="post", body={"login": "5012345", "password": "wrong", "server": "Demo-Server"})
        self.assertEqual(bad.status_code, 400)
        self.assertIn("didn't accept", bad.json()["error"])
        r = self.api("own", method="post", body={"login": "5012345", "password": "demo-pass", "server": "Demo-Server"})
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        self.assertEqual((d["linked"]["login"], d["linked"]["mode"], d["account"]["balance"]), (5012345, "demo", 10000.0))
        self.assertEqual(d["positions"][0]["symbol"], "XAUUSD+")
        self.assertNotIn("demo-pass", r.content.decode())
        acc = BrokerAccount.objects.get(owner__uid="own")
        self.assertNotIn("demo-pass", acc.password)                 # encrypted
        self.assertEqual(broker_mt5.decrypt_password(acc.password), "demo-pass")
        live = self.api("own", "live/").json()
        self.assertEqual((live["account"]["equity"], live["orders"][0]["type"], live["deals"][0]["symbol"]), (10042.5, "buy limit", "XAUUSD+"))
        self.assertNotIn("demo-pass", self.api("own").content.decode())
        # Someone else's session, or someone without a linked account
        self.assertEqual(self.api("own", "live/", key="sk-bob").status_code, 401)
        self.assertEqual(self.api("bob", "live/").status_code, 404)
        self.api("own", method="delete")
        self.assertFalse(BrokerAccount.objects.exists())

    def test_bad_input(self):
        self.assertEqual(self.api("own", method="post", body={"login": "abc", "password": "x", "server": "S"}).status_code, 400)
        self.assertEqual(self.api("own", method="post", body={"login": "123", "password": "", "server": "S"}).status_code, 400)


    def test_linking_always_checks_the_password(self):
        """Even with the terminal already logged into that account (someone else linked it)"""
        self.assertEqual(self.api("own", method="post", body={"login": "5012345", "password": "demo-pass", "server": "Demo-Server"}).status_code, 201)
        r = self.api("bob", method="post", body={"login": "5012345", "password": "guess", "server": "Demo-Server"})
        self.assertEqual(r.status_code, 400)
        self.assertFalse(BrokerAccount.objects.filter(owner__uid="bob").exists())


@override_settings(MT5_FAKE=True)
class Mt5TradingTests(TestCase):
    """Placing, changing and closing orders on the linked account (the stand-in terminal)"""

    def setUp(self):
        broker_mt5._mt5 = None
        broker_mt5._current = None
        broker_mt5._started = False
        self.c = APIClient()
        p = TraderProfile.objects.create(uid="own", name="Own", email="own@example.com")
        UserSession.objects.create(user=p, session_key="sk-own")
        self.c.post("/api/users/broker/own/mt5/?session_key=sk-own", {"login": "5012345", "password": "demo-pass", "server": "Demo-Server"}, format="json")

    def api(self, rest, method="post", body=None, query=""):
        return getattr(self.c, method)(f"/api/users/broker/own/mt5/{rest}?session_key=sk-own{query}", body or {}, format="json")

    def test_market_order_finds_the_brokers_symbol_and_closes(self):
        info = self.c.get("/api/users/broker/own/mt5/symbol/?session_key=sk-own&symbol=XAU/USD").json()
        self.assertEqual((info["symbol"], info["volume_min"], info["digits"]), ("XAUUSD+", 0.01, 2))
        r = self.api("order/", body={"symbol": "XAU/USD", "side": "buy", "type": "market", "volume": "0.013", "sl": "3950.123", "tp": "4100"})
        self.assertEqual(r.status_code, 201, r.content)
        d = r.json()
        self.assertEqual((d["result"]["symbol"], d["result"]["volume"]), ("XAUUSD+", 0.01))   # rounded to the lot step
        mine = [p for p in d["positions"] if p["ticket"] == d["result"]["order"]][0]
        self.assertEqual((mine["side"], mine["open_price"], mine["sl"], mine["tp"]), ("buy", 3998.7, 3950.12, 4100.0))   # at the ask; stops to 2 digits
        # Change its stops, then close it
        r = self.api(f"position/{mine['ticket']}/", "patch", {"sl": "3960", "tp": "4050"})
        self.assertEqual([p["sl"] for p in r.json()["positions"] if p["ticket"] == mine["ticket"]], [3960.0])
        r = self.api(f"position/{mine['ticket']}/", "delete")
        self.assertFalse(any(p["ticket"] == mine["ticket"] for p in r.json()["positions"]))

    def test_pending_orders_and_the_brokers_refusals(self):
        r = self.api("order/", body={"symbol": "EURUSD", "side": "sell", "type": "limit", "volume": "0.1", "price": "1.09"})
        self.assertEqual(r.json()["result"]["message"], "Placed")
        t = r.json()["result"]["order"]
        self.assertEqual([o["type"] for o in r.json()["orders"] if o["ticket"] == t], ["sell limit"])
        r = self.api(f"pending/{t}/", "patch", {"price": "1.095"})
        self.assertEqual([o["price"] for o in r.json()["orders"] if o["ticket"] == t], [1.095])
        r = self.api(f"pending/{t}/", "delete")
        self.assertFalse(any(o["ticket"] == t for o in r.json()["orders"]))
        # The broker says no: not enough money; a volume below the minimum; a symbol not traded here
        self.assertIn("Not enough money", self.api("order/", body={"symbol": "XAUUSD", "side": "buy", "volume": "20"}).json()["error"])
        self.assertIn("0.01 to 50.0", self.api("order/", body={"symbol": "XAUUSD", "side": "buy", "volume": "0.001"}).json()["error"])
        self.assertIn("isn't traded", self.api("order/", body={"symbol": "BTCUSD", "side": "buy", "volume": "1"}).json()["error"])
        self.assertEqual(self.api("order/", body={"symbol": "XAUUSD", "side": "buy", "type": "limit", "volume": "0.1"}).status_code, 400)   # no price

    def test_real_accounts_need_confirmation(self):
        fake = broker_mt5._module()
        original = fake.account_info
        fake.account_info = lambda: (lambda a: (setattr(a, "trade_mode", 2), a)[1])(original())
        try:
            r = self.api("order/", body={"symbol": "XAUUSD", "side": "buy", "volume": "0.01"})
            self.assertEqual(r.status_code, 428)
            r = self.api("order/", body={"symbol": "XAUUSD", "side": "buy", "volume": "0.01", "confirm_real": True})
            self.assertEqual(r.status_code, 201)
        finally:
            fake.account_info = original
