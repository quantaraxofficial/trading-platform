"""Time on the site (core/presence.py, core/sitetime.py), the dot on Trader profiles, the admin's look"""
from datetime import datetime, timedelta, timezone as dt_timezone
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from . import presence, sitetime
from .models import SiteTime, TraderProfile


class SiteTimeTests(TestCase):
    def setUp(self):
        self.p = TraderProfile.objects.create(uid="t1", name="Ravi", email="t1@test.invalid")

    def ping_at(self, when):
        self.p.refresh_from_db()
        with mock.patch.object(presence, "require_session", return_value=(self.p, None)), mock.patch.object(presence.timezone, "now", return_value=when):
            presence.ping(APIRequestFactory().post("/x/", {"where": "/chart"}, format="json"), self.p.uid)

    def test_minutes_add_up_and_gaps_dont(self):
        t = datetime(2026, 11, 12, 6, 0, tzinfo=dt_timezone.utc)       # 11:30 in India
        for i in range(6):                                              # open for 5 minutes
            self.ping_at(t + timedelta(minutes=i))
        self.ping_at(t + timedelta(minutes=40))                         # hidden / closed in between: not counted
        self.ping_at(t + timedelta(minutes=41))
        self.assertEqual(SiteTime.objects.get(profile=self.p).seconds, 6 * 60)

    def test_report_and_pages(self):
        today = timezone.now().astimezone(presence.IST).date()
        SiteTime.objects.create(profile=self.p, day=today, seconds=3600)
        SiteTime.objects.create(profile=self.p, day=today - timedelta(days=400), seconds=600)
        r = sitetime.report()
        self.assertEqual(r["cards"][0]["time"], "1 h 0 min")
        self.assertEqual(r["cards"][5]["time"], "1 h 10 min")   # (all time)
        TraderProfile.objects.filter(pk=self.p.pk).update(last_seen=timezone.now())
        TraderProfile.objects.create(uid="t2", name="Asha", email="t2@test.invalid")
        self.client.force_login(User.objects.create_superuser("adm", "adm@test.invalid", "pw"))
        page = self.client.get("/admin/core/timeonsite/")
        self.assertContains(page, "Per trader")
        self.assertContains(page, "Ravi")
        lst = self.client.get("/admin/core/traderprofile/")
        self.assertContains(lst, 'class="tp-dot on"', count=1)       # Ravi
        self.assertContains(lst, 'class="tp-dot off"', count=1)      # Asha
        self.assertContains(lst, "TradePilot")                        # the admin in the site's look
        self.assertContains(lst, "--tp-gradient")


class ActiveTimeTests(TestCase):
    """Yesterday, a picked day, and active (used) vs only open"""
    def setUp(self):
        self.p = TraderProfile.objects.create(uid="a1", name="Meera", email="a1@test.invalid")

    def ping_at(self, when, **body):
        self.p.refresh_from_db()
        with mock.patch.object(presence, "require_session", return_value=(self.p, None)), mock.patch.object(presence.timezone, "now", return_value=when):
            presence.ping(APIRequestFactory().post("/x/", {"where": "/chart", **body}, format="json"), self.p.uid)

    def test_active_vs_open(self):
        t = datetime(2026, 11, 12, 6, 0, tzinfo=dt_timezone.utc)
        self.ping_at(t)
        self.ping_at(t + timedelta(minutes=1), active=True)
        self.ping_at(t + timedelta(minutes=2))                                  # open, untouched
        self.ping_at(t + timedelta(minutes=3), features={"drawing": 1})         # a feature used: active
        row = SiteTime.objects.get(profile=self.p)
        self.assertEqual((row.seconds, row.active_seconds), (180, 120))

    def test_yesterday_and_picked_day(self):
        today = timezone.now().astimezone(presence.IST).date()
        SiteTime.objects.create(profile=self.p, day=today - timedelta(days=1), seconds=3600, active_seconds=900)
        SiteTime.objects.create(profile=self.p, day=today - timedelta(days=10), seconds=1200, active_seconds=600)
        r = sitetime.report(picked=today - timedelta(days=10), sort="picked")
        cards = {c["key"]: c for c in r["cards"]}
        self.assertEqual((cards["yesterday"]["time"], cards["yesterday"]["active"], cards["yesterday"]["idle"], cards["yesterday"]["pct"]), ("1 h 0 min", "15 min", "45 min", 25))
        self.assertEqual((cards["picked"]["time"], cards["picked"]["pct"]), ("20 min", 50))
        self.assertEqual(r["sort"], "picked")
        self.client.force_login(User.objects.create_superuser("adm2", "adm2@test.invalid", "pw"))
        day = (today - timedelta(days=10)).isoformat()
        html = self.client.get(f"/admin/core/timeonsite/?day={day}").content.decode()
        for want in ('data-name="time-day-picker"', f'value="{day}"', "Yesterday", "only open 45 min", "tos-picked"):
            self.assertIn(want, html)
        # picking yesterday: its own column, not a second one
        r = sitetime.report(picked=today - timedelta(days=1), sort="picked")
        self.assertEqual((r["sort"], r["picked"]), ("yesterday", None))
