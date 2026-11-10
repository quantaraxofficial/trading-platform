"""The mobile terminal's trading engine (core/mobile.py), with prices set by the test"""
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from . import market, mobile
from .models import MobileAccount, MobileDeal, MobileOrder, MobilePosition, Subscription, TraderProfile


def prices(**quotes):
    """market.LIVE for these symbols: {"EURUSD": (bid, ask), …}"""
    return {s: {"bid": b, "ask": a, "t": 0, "rx": 0} for s, (b, a) in quotes.items()}


class MobileEngineTests(TestCase):
    def setUp(self):
        self.p = TraderProfile.objects.create(uid="m-test", name="T", email="m@test.invalid")
        Subscription.objects.create(profile=self.p, starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=36500))
        self.acc = mobile.account_of(self.p)
        self.live = prices(EURUSD=(1.10000, 1.10010), USDJPY=(150.000, 150.010), EURJPY=(165.000, 165.020), XAUUSD=(4000.00, 4000.20))
        self.patches = [mock.patch.object(market, "LIVE", self.live), mock.patch.object(market, "live_age", return_value=1.0)]
        for x in self.patches:
            x.start()
        mobile.invalidate()

    def tearDown(self):
        for x in self.patches:
            x.stop()

    def test_market_buy_fills_at_ask_and_profit_in_usd(self):
        pos = mobile._open(self.acc, "EURUSD", "buy", mobile.Decimal("1.00"), None, None)
        self.assertAlmostEqual(pos.open_price, 1.10010)
        self.live["EURUSD"].update(bid=1.10110, ask=1.10120)
        s = mobile.snapshot(self.acc)
        self.assertAlmostEqual(s["positions"][0]["profit"], 100.0, places=2)      # 10 pips × 100k × 1 lot
        self.assertAlmostEqual(s["margin"], 1.10120 * 100000 / 100, places=2)

    def test_yen_cross_profit_converted_through_usdjpy(self):
        pos = mobile._open(self.acc, "EURJPY", "sell", mobile.Decimal("0.10"), None, None)
        self.assertAlmostEqual(pos.open_price, 165.000)
        self.live["EURJPY"].update(bid=164.880, ask=164.900)                       # 0.1 JPY in the seller's favour
        profit = mobile.snapshot(self.acc)["positions"][0]["profit"]
        self.assertAlmostEqual(profit, 0.1 * 100000 * 0.1 / 150.005, places=2)

    def test_close_books_profit_and_deals(self):
        pos = mobile._open(self.acc, "XAUUSD", "buy", mobile.Decimal("0.10"), None, None)
        self.live["XAUUSD"].update(bid=4010.20, ask=4010.40)
        mobile._close(pos)
        self.acc.refresh_from_db()
        self.assertEqual(self.acc.balance, mobile.Decimal("100100.00"))            # 10.00 × 100 oz × 0.1
        self.assertEqual(MobileDeal.objects.filter(account=self.acc).count(), 2)
        self.assertEqual(mobile.snapshot(self.acc)["positions"], [])

    def test_stop_loss_and_take_profit_trigger_on_ticks(self):
        buy = mobile._open(self.acc, "EURUSD", "buy", mobile.Decimal("0.10"), 1.09900, 1.10200)
        sell = mobile._open(self.acc, "XAUUSD", "sell", mobile.Decimal("0.01"), 4010.00, 3990.00)
        mobile._last_check.clear()
        mobile.check_symbol("EURUSD", 1.09890, 1.09900)                            # bid at the buy's SL
        mobile.check_symbol("XAUUSD", 3989.80, 3990.00)                            # ask at the sell's TP
        buy.refresh_from_db(); sell.refresh_from_db()
        self.assertEqual((buy.close_reason, sell.close_reason), ("sl", "tp"))

    def test_pending_buy_limit_fills_when_reached(self):
        o = MobileOrder.objects.create(account=self.acc, symbol="EURUSD", kind="buy_limit", volume=mobile.Decimal("0.10"),
                                       price=1.09950, status="placed", created_at=timezone.now())
        mobile.invalidate(); mobile._last_check.clear()
        mobile.check_symbol("EURUSD", 1.09990, 1.10000)                            # not yet
        o.refresh_from_db(); self.assertEqual(o.status, "placed")
        self.live["EURUSD"].update(bid=1.09940, ask=1.09950)
        mobile._last_check.clear()
        mobile.check_symbol("EURUSD", 1.09940, 1.09950)
        o.refresh_from_db()
        self.assertEqual(o.status, "filled")
        self.assertEqual(o.position.open_price, 1.09950)

    def test_wrong_side_stops_and_margin_are_refused(self):
        with self.assertRaises(mobile.TradeError):
            mobile._open(self.acc, "EURUSD", "buy", mobile.Decimal("1.00"), 1.10100, None)     # SL above the bid
        with self.assertRaises(mobile.TradeError):
            mobile._open(self.acc, "XAUUSD", "buy", mobile.Decimal("30.00"), None, None)      # 30 lots of gold: 1.2M margin

    def test_api_only_for_unlimited_access(self):
        f = APIRequestFactory()
        with mock.patch.object(mobile, "require_session", return_value=(self.p, None)):
            r = mobile.place(f.post("/x/", {"symbol": "EURUSD", "kind": "buy", "volume": 0.01}, format="json"), self.p.uid)
            self.assertEqual(r.status_code, 200)
            self.assertEqual(len(r.data["state"]["positions"]), 1)
        other = TraderProfile.objects.create(uid="m-free", name="F", email="f@test.invalid")
        Subscription.objects.create(profile=other, starts_at=timezone.now(), ends_at=timezone.now() + timedelta(days=30))
        with mock.patch.object(mobile, "require_session", return_value=(other, None)):
            r = mobile.state(f.get("/x/"), other.uid)
            self.assertEqual(r.status_code, 404)
