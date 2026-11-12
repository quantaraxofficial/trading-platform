"""Who's active now (core/presence.py) and the admin list showing it"""
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from . import presence
from .models import TraderProfile


class PresenceTests(TestCase):
    def setUp(self):
        self.a = TraderProfile.objects.create(uid="pa", name="Asha", email="a@test.invalid")
        self.b = TraderProfile.objects.create(uid="pb", name="Bala", email="b@test.invalid")
        TraderProfile.objects.filter(pk=self.b.pk).update(last_seen=timezone.now() - timedelta(minutes=10))

    def test_ping_marks_active_now(self):
        with mock.patch.object(presence, "require_session", return_value=(self.a, None)):
            r = presence.ping(APIRequestFactory().post("/x/", {"where": "/chart"}, format="json"), "pa")
        self.assertEqual(r.status_code, 200)
        self.assertEqual([p.name for p in presence.active_now()], ["Asha"])
        self.assertEqual(presence.active_now()[0].last_where, "/chart")

    def test_admin_shows_count_and_filter(self):
        TraderProfile.objects.filter(pk=self.a.pk).update(last_seen=timezone.now(), last_where="/m")
        self.client.force_login(User.objects.create_superuser("adm", "adm@test.invalid", "pw"))
        r = self.client.get("/admin/core/traderprofile/")
        self.assertContains(r, "Active now: 1 — Asha (/m)")
        r = self.client.get("/admin/core/traderprofile/?online=now")
        self.assertContains(r, "Asha"); self.assertNotContains(r, ">Bala<")
