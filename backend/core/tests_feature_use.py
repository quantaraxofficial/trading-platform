"""Features used (core/feature_use.py): counted from the presence ping, a trader profile's page in
Django Admin (sessions, saved replays, failed requests, the pies), and Site analytics"""
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from . import presence
from .feature_use import pie, totals
from .models import FailedRequest, FeatureUse, ReplaySession, SavedReplay, TraderProfile


class FeatureUseTests(TestCase):
    def setUp(self):
        self.p = TraderProfile.objects.create(uid="f1", name="Ravi", email="f1@test.invalid")

    def ping(self, body):
        with mock.patch.object(presence, "require_session", return_value=(self.p, None)):
            return presence.ping(APIRequestFactory().post("/x/", body, format="json"), self.p.uid)

    def test_ping_counts_known_features_only(self):
        self.ping({"where": "/chart", "features": {"drawing": 3, "voice": 1, "hack": 5, "alert": 999, "pine": "x"}})
        self.ping({"only_features": True, "features": {"drawing": 2}})
        got = dict(FeatureUse.objects.values_list("feature", "count"))
        self.assertEqual(got, {"drawing": 5, "voice": 1})
        self.p.refresh_from_db()
        self.assertEqual(self.p.last_where, "/chart")   # (the features-only one isn't presence)

    def test_totals_and_pie(self):
        self.ping({"features": {"drawing": 3, "voice": 1}})
        rows = totals(FeatureUse.objects.all())
        self.assertEqual(rows, [("Drawing tools", 3, 75.0), ("Voice assistant", 1, 25.0)])
        p = pie(rows)
        self.assertEqual((p["total"], p["kinds"]), (4, 2))
        self.assertEqual(p["svg"].count("<path"), 2)

    def test_trader_page_shows_activity(self):
        ReplaySession.objects.create(owner=self.p, name="Gold March", symbol="XAUUSD", interval="15min", start_time=1700000000, current_time=1700003600)
        SavedReplay.objects.create(owner=self.p, symbol="EURUSD", interval="1h", time=1700000000, saved_at=1700000000000)
        FailedRequest.objects.create(user=self.p, path="/api/users/drawings/f1/", method="POST", status_code=500, reason_code="server_error")
        self.ping({"features": {"drawing": 2, "replay": 1}})
        self.client.force_login(User.objects.create_superuser("adm", "adm@test.invalid", "pw"))
        html = self.client.get(f"/admin/core/traderprofile/{self.p.pk}/change/").content.decode()
        for want in ('data-name="features-used"', "2 of 18 features used", "Drawing tools", "Gold March", "EURUSD",
                     "/api/users/drawings/f1/", "server_error", "What they've made", "Backtest sessions"):
            self.assertIn(want, html)
        self.assertIn("<svg", html)

    def test_site_analytics_report(self):
        from . import site_analytics
        self.ping({"features": {"collab": 1, "alert": 3}})
        r = site_analytics.report(30)
        self.assertEqual(r["feature_use"], [["Alerts", 3], ["Collab", 1]])
        self.assertEqual(r["feature_people"], 1)


class TraderTimeTests(TestCase):
    def test_trader_page_time_and_picked_day(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import SiteTime
        p = TraderProfile.objects.create(uid="t9", name="Kiran", email="t9@test.invalid")
        today = timezone.now().astimezone(presence.IST).date()
        SiteTime.objects.create(profile=p, day=today, seconds=1800, active_seconds=600)
        SiteTime.objects.create(profile=p, day=today - timedelta(days=40), seconds=3600, active_seconds=3000)
        self.client.force_login(User.objects.create_superuser("adm3", "adm3@test.invalid", "pw"))
        day = (today - timedelta(days=40)).isoformat()
        html = self.client.get(f"/admin/core/traderprofile/{p.pk}/change/?day={day}").content.decode()
        for want in ('data-name="trader-time"', "30 min", "active 10 min", "only open 20 min", 'data-name="trader-time-picked"',
                     "1 h 0 min on the site", "83% active", "The last 30 days", "2 days on it"):
            self.assertIn(want, html)
        self.assertIn('aria-label="Time on the site, the last 30 days"', html)
