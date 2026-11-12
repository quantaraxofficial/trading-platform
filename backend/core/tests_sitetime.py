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
        self.assertEqual(r["cards"][4]["time"], "1 h 10 min")
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
