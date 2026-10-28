"""Trade copying: sizing and guards on one account, the copier service end to end (stand-in MT5,
terminals run inline), mirroring a provider's MT5, and the site's API"""
import time

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import broker_mt5, copier
from .copier_service import Supervisor
from .models import BrokerAccount, CopyChannel, CopyExecution, CopySignal, CopySubscription, TraderProfile, UserSession

SUB = {"symbols": [], "real_confirmed": False, "max_open": 5, "daily_loss_limit": 5, "risk_mode": "signal", "risk_percent": 1,
       "max_risk": 2, "no_sl_lots": 0, "max_slippage": 25}


def fake():
    m = broker_mt5.FakeMt5()
    m.initialize(login=5012345, password="demo-pass", server="Demo-Server")
    return m


class SizingAndGuards(TestCase):
    def test_lots_for_risk(self):
        m = fake()
        xau, eur = m.symbol_info("XAUUSD+"), m.symbol_info("EURUSD+")
        self.assertEqual(copier.lots_for_risk(xau, 10000, 1, 4000, 3990), 0.1)       # $10 stop × 100 oz = $1000/lot → $100
        self.assertEqual(copier.lots_for_risk(eur, 10000, 1, 1.0850, 1.0800), 0.2)   # 50 pips = $500/lot → $100
        self.assertEqual(copier.lots_for_risk(eur, 10000, 0.33, 1.0850, 1.0800), 0.06)   # rounded down, never over the risk
        with self.assertRaises(copier.Skip):
            copier.lots_for_risk(xau, 10000, 0.05, 4000, 3990)                       # less than the minimum lot

    def test_open_at_the_providers_distances(self):
        m = fake()
        sig = {"id": 7, "channel": 3, "kind": "open", "symbol": "XAU/USD", "side": "buy", "entry": 3998.0, "sl": 3988.0, "tp": 4018.0, "risk_percent": 1}
        out = copier.apply(m, sig, SUB)
        self.assertEqual(out["status"], "filled", out)
        self.assertEqual((out["symbol"], out["price"], out["sl"], out["tp"], out["volume"]), ("XAUUSD+", 3998.7, 3988.7, 4018.7, 0.1))
        pos = [p for p in m.positions if p.magic == copier.magic_for(3)][0]
        self.assertEqual((pos.comment, pos.sl, pos.tp), ("TP copy #7", 3988.7, 4018.7))
        # Move the stops, then close half, then the rest
        opened = {"ticket": out["ticket"], "price": out["price"], "entry": 3998.0}
        mod = copier.apply(m, {"id": 8, "channel": 3, "kind": "modify", "sl": 3998.0, "tp": 4030.0}, SUB, opened)
        self.assertEqual((mod["status"], mod["sl"], mod["tp"]), ("modified", 3998.7, 4030.7))   # breakeven at this account's own fill
        half = copier.apply(m, {"id": 9, "channel": 3, "kind": "close", "fraction": 0.5}, SUB, opened)
        self.assertEqual((half["status"], half["volume"]), ("closed", 0.05))
        rest = copier.apply(m, {"id": 10, "channel": 3, "kind": "close", "fraction": 1}, SUB, opened)
        self.assertEqual((rest["status"], rest["volume"]), ("closed", 0.05))
        self.assertEqual(copier.apply(m, {"id": 11, "channel": 3, "kind": "close", "fraction": 1}, SUB, opened)["status"], "skipped")
        self.assertTrue(any(p.ticket == 101 for p in m.positions))   # the account's own trade is untouched

    def test_skips(self):
        m = fake()
        base = {"id": 1, "channel": 3, "kind": "open", "symbol": "XAUUSD", "side": "buy", "entry": 3998.0, "sl": 3988.0, "tp": 4018.0, "risk_percent": 1}
        late = copier.apply(m, {**base, "entry": 3990.0, "sl": 3980.0}, SUB)                          # 8.7 past entry, 2.5 allowed
        self.assertEqual(late["status"], "skipped")
        self.assertIn("Too late", late["message"])
        self.assertIn("isn't one of the symbols", copier.apply(m, base, {**SUB, "symbols": ["EURUSD"]})["message"])
        self.assertIn("no stop loss", copier.apply(m, {**base, "sl": None}, SUB)["message"])
        self.assertEqual(copier.apply(m, {**base, "sl": None}, {**SUB, "no_sl_lots": 0.03})["volume"], 0.03)
        self.assertEqual(copier.apply(m, {**base, "risk_percent": 9}, SUB)["volume"], 0.2)             # capped at the max risk (2%)
        self.assertIn("past the stop loss", copier.apply(m, {**base, "entry": None, "sl": 3999.0}, SUB)["message"])
        for _ in range(3):
            copier.apply(m, base, SUB)
        self.assertIn("copied trades open", copier.apply(m, base, {**SUB, "max_open": 5})["message"])  # 5 open now (2 earlier + 3)
        self.assertEqual(copier.apply(m, {**base, "side": "up"}, SUB)["status"], "skipped")


@override_settings(MT5_FAKE=True)
class CopierService(TestCase):
    def setUp(self):
        broker_mt5._mt5 = None
        broker_mt5._current = None
        broker_mt5._started = False
        self.c = APIClient()
        self.users = {}
        for u in ("pro", "ann", "ben", "cat"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")
            self.users[u] = p
        for u in ("pro", "ann", "ben"):   # cat has no broker linked
            BrokerAccount.objects.create(owner=self.users[u], login=5012345, server="Demo-Server", password=broker_mt5.encrypt_password("demo-pass"), mode="demo")

    def api(self, uid, rest, method="post", body=None):
        return getattr(self.c, method)(f"/api/users/copy/{uid}/{rest}?session_key=sk-{uid}", body or {}, format="json")

    def make_channel(self):
        ch = self.api("pro", "channels/", body={"name": "Gold signals", "default_risk": 1, "max_slippage": 25}).json()["channel"]
        for u in ("ann", "ben"):
            sid = self.api(u, "join/", body={"code": ch["code"]}).json()["subscription"]["id"]
            r = self.api(u, f"subscriptions/{sid}/", "patch", {"auto_copy": True, "max_risk": 2})
            self.assertEqual(r.status_code, 200, r.content)
        return ch

    def test_site_signals_reach_every_follower(self):
        ch = self.make_channel()
        ben = CopySubscription.objects.get(subscriber__uid="ben")
        self.api("ben", f"subscriptions/{ben.id}/", "patch", {"symbols": ["EURUSD"]})
        sup = Supervisor(fake=True, inline=True)
        sup.sync()
        sup.step()   # (signals from before the service started aren't replayed)
        self.assertEqual(CopySubscription.objects.get(subscriber__uid="ann").terminal_status, "connected")
        r = self.api("pro", f"channels/{ch['id']}/signals/", body={"kind": "open", "symbol": "XAU/USD", "side": "buy", "sl": 3988.7, "tp": 4018.7, "risk_percent": 1.5})
        self.assertEqual(r.status_code, 201, r.content)
        ref = r.json()["signal"]["ref"]
        sup.step()
        res = {e.subscription.subscriber.uid: e for e in CopyExecution.objects.select_related("subscription__subscriber")}
        self.assertEqual((res["ann"].status, res["ann"].volume, res["ann"].sl), ("filled", 0.15, 3988.7))   # 1.5% of ~$10,042 at a $10 stop
        self.assertEqual(res["ben"].status, "skipped")                                                      # not a symbol ben copies
        self.assertIsNotNone(res["ann"].latency_ms)
        self.api("pro", f"channels/{ch['id']}/signals/", body={"kind": "modify", "ref": ref, "sl": 3995, "tp": 4030})
        sup.step()
        self.assertEqual(CopyExecution.objects.filter(signal__kind="modify").get().status, "modified")
        self.api("pro", f"channels/{ch['id']}/signals/", body={"kind": "close", "ref": ref})
        sup.step()
        closes = CopyExecution.objects.filter(signal__kind="close")
        self.assertEqual([e.status for e in closes], ["closed"])   # only ann had copied it
        # The owner sees each signal's results; a follower sees their own log
        detail = self.api("pro", f"channels/{ch['id']}/", "get").json()["channel"]
        self.assertEqual([(s["kind"], s["filled"], s["skipped"]) for s in detail["signals"]][-1], ("open", 1, 1))
        ann = CopySubscription.objects.get(subscriber__uid="ann")
        log = self.api("ann", f"subscriptions/{ann.id}/log/", "get").json()["executions"]
        self.assertEqual([e["status"] for e in log], ["closed", "modified", "filled"])

    def test_mirrors_the_providers_mt5(self):
        ch = self.make_channel()
        r = self.api("pro", f"channels/{ch['id']}/", "patch", {"mirror_mt5": True})
        self.assertEqual(r.status_code, 200, r.content)
        sup = Supervisor(fake=True, inline=True)
        sup.sync()
        sup.step()
        sup.step()
        self.assertFalse(CopySignal.objects.exists())   # the position already open (ticket 101) isn't copied
        time.sleep(1.05)
        pro = sup.terminals[f"watch{ch['id']}"].mt5
        res = pro.order_send({"action": pro.TRADE_ACTION_DEAL, "symbol": "XAUUSD+", "volume": 0.2, "type": pro.ORDER_TYPE_SELL, "price": 3998.5,
                              "sl": 4008.5, "tp": 3978.5, "magic": 0, "comment": ""})
        sup.step()
        sig = CopySignal.objects.get(kind="open")
        self.assertEqual((sig.source, sig.side, sig.entry, sig.sl, sig.volume, sig.risk_percent), ("mt5", "sell", 3998.5, 4008.5, 0.2, 1.992))   # $200 at risk of $10,042.50
        self.assertEqual(sorted(e.status for e in CopyExecution.objects.all()), ["filled", "filled"])
        self.assertEqual(CopyExecution.objects.first().volume, 0.2)   # each follower: the provider's 1.992% (under their 2% max) of their own equity
        # The provider moves the stop, then closes half, then the rest
        p = [x for x in pro.positions if x.ticket == res.order][0]
        p.sl = 3998.5
        sup.step()
        self.assertEqual(CopySignal.objects.filter(kind="modify").count(), 1)
        pro.order_send({"action": pro.TRADE_ACTION_DEAL, "symbol": "XAUUSD+", "volume": 0.1, "position": res.order, "type": pro.ORDER_TYPE_BUY, "price": 3998.7})
        sup.step()
        half = CopySignal.objects.filter(kind="close").get()
        self.assertEqual(half.fraction, 0.5)
        pro.order_send({"action": pro.TRADE_ACTION_DEAL, "symbol": "XAUUSD+", "volume": 0.1, "position": res.order, "type": pro.ORDER_TYPE_BUY, "price": 3998.7})
        sup.step()
        self.assertEqual(CopySignal.objects.filter(kind="close").count(), 2)
        self.assertEqual(sorted(e.status for e in CopyExecution.objects.filter(signal__kind="close")), ["closed"] * 4)
        sup.step()
        self.assertEqual(CopySignal.objects.count(), 4)   # nothing more once it's gone

    def test_api_rules(self):
        ch = self.api("pro", "channels/", body={"name": "Gold"}).json()["channel"]
        self.assertEqual(self.api("pro", "join/", body={"code": ch["code"]}).status_code, 400)        # own channel
        self.assertEqual(self.api("cat", "join/", body={"code": "NOPE1234"}).status_code, 404)
        sid = self.api("cat", "join/", body={"code": ch["code"].lower()}).json()["subscription"]["id"]
        self.assertEqual(self.api("cat", f"subscriptions/{sid}/", "patch", {"auto_copy": True}).status_code, 409)   # no broker linked
        sid2 = self.api("ann", "join/", body={"code": ch["code"]}).json()["subscription"]["id"]
        BrokerAccount.objects.filter(owner__uid="ann").update(mode="real")
        self.assertEqual(self.api("ann", f"subscriptions/{sid2}/", "patch", {"auto_copy": True}).status_code, 428)    # real money: confirm
        self.assertEqual(self.api("ann", f"subscriptions/{sid2}/", "patch", {"auto_copy": True, "real_confirmed": True}).status_code, 200)
        self.assertEqual(self.api("ann", f"subscriptions/{sid2}/", "patch", {"max_risk": 50}).status_code, 400)
        self.assertEqual(self.api("cat", f"channels/{ch['id']}/signals/", body={"kind": "open"}).status_code, 404)     # not cat's channel
        self.assertEqual(self.api("pro", f"channels/{ch['id']}/signals/", body={"kind": "close", "ref": "nope"}).status_code, 400)
        self.assertEqual(self.api("cat", f"channels/{ch['id']}/", "patch", {"mirror_mt5": True}).status_code, 404)
        self.assertEqual(self.api("cat", "", "get").json()["following"][0]["channel_info"]["name"], "Gold")
        sig = self.api("pro", f"channels/{ch['id']}/signals/", body={"kind": "open", "symbol": "XAUUSD", "side": "buy", "sl": 3990, "risk_percent": None}).json()["signal"]
        self.assertEqual(sig["risk_percent"], 1.0)   # left blank: the channel's default
