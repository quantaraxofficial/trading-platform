"""A backtest session's "Long / Short Position drawings place orders" (positions_as_orders): set
when it's made, switched later, off by default (core/analytics.py)"""
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from . import analytics
from .models import ReplaySession, TraderProfile


class PositionsAsOrdersTests(TestCase):
    def setUp(self):
        self.p = TraderProfile.objects.create(uid="so1", name="Neha", email="so1@test.invalid")
        self.f = APIRequestFactory()

    def call(self, view, method, data=None, *args):
        req = getattr(self.f, method)("/x/", data or {}, format="json")
        with mock.patch.object(analytics, "require_session", return_value=(self.p, None)):
            return view(req, self.p.uid, *args)

    def test_made_with_it_and_switched(self):
        r = self.call(analytics.sessions, "post", {"name": "Gold", "symbol": "XAU/USD", "interval": "15min", "start_time": 1700000000,
                                                   "initial_balance": 10000, "positions_as_orders": True})
        self.assertEqual(r.status_code, 201, r.data)
        sid = r.data["session"]["id"]
        self.assertTrue(r.data["session"]["positions_as_orders"])
        r = self.call(analytics.session, "patch", {"positions_as_orders": False}, sid)
        self.assertFalse(r.data["session"]["positions_as_orders"])
        self.assertFalse(ReplaySession.objects.get(pk=sid).positions_as_orders)

    def test_off_by_default_and_only_true_turns_it_on(self):
        r = self.call(analytics.sessions, "post", {"name": "EU", "symbol": "EUR/USD", "interval": "1h", "start_time": 1700000000, "initial_balance": 5000})
        sid = r.data["session"]["id"]
        self.assertFalse(r.data["session"]["positions_as_orders"])
        r = self.call(analytics.session, "patch", {"positions_as_orders": "yes"}, sid)
        self.assertFalse(r.data["session"]["positions_as_orders"])
