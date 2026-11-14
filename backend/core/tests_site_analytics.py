"""Django Admin → Site analytics: traffic recorded (people per 5 minutes, the server per minute, live
connections), the report's numbers, the live part, and the page only for staff"""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from . import site_analytics, traffic
from .models import ServerMinute, SiteTime, TraderProfile, TrafficSlot, UserSession


class TrafficTests(TestCase):
    def test_presence_notes_the_slot_once(self):
        p = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        now = traffic.slot_of(timezone.now()) + timedelta(seconds=10)   # (both pings inside one slot)
        traffic.note_presence(p, now, "/chart")
        traffic.note_presence(p, now + timedelta(seconds=30), "/chart")
        self.assertEqual(TrafficSlot.objects.filter(profile=p).count(), 1)
        self.assertEqual(TrafficSlot.objects.get().slot.timestamp() % 300, 0)

    def test_requests_are_written_per_minute(self):
        import time
        from datetime import datetime, timezone as dt_timezone
        base = int(time.time() // 60) - 10
        traffic._minute = None   # (other tests' requests counted in this process)
        traffic._buf.update(requests=0, errors=0, ms_total=0.0, ms_max=0.0)
        with patch("core.traffic.time.time", return_value=base * 60 + 5):
            traffic.note_request(20, 200)
            traffic.note_request(40, 500)
        with patch("core.traffic.time.time", return_value=(base + 1) * 60 + 1):
            traffic.note_request(10, 200)   # the next minute: the last one is written
        row = ServerMinute.objects.get(minute=datetime.fromtimestamp(base * 60, tz=dt_timezone.utc))
        self.assertEqual((row.requests, row.errors, row.avg_ms, row.max_ms), (2, 1, 30.0, 40.0))

    def test_live_connections_counted(self):
        before = dict(traffic.WS)
        traffic.ws_opened("collab")
        traffic.ws_opened("ticks")
        traffic.ws_closed("ticks")
        traffic.ws_closed("ticks")   # (never below zero)
        self.assertEqual(traffic.WS["collab"], before.get("collab", 0) + 1)
        self.assertEqual(traffic.WS["ticks"], max(0, before.get("ticks", 0) - 1) if before.get("ticks") else 0)
        traffic.ws_closed("collab")


class ReportTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.people = [TraderProfile.objects.create(uid=f"u{i}", name=f"P{i}", email=f"p{i}@example.com") for i in range(4)]
        today = self.now.astimezone(site_analytics.IST).date()
        for i, p in enumerate(self.people):
            SiteTime.objects.create(profile=p, day=today, seconds=600 * (i + 1))
            SiteTime.objects.create(profile=p, day=today - timedelta(days=1), seconds=300)
        # 3 people on at once an hour ago, 1 two hours ago; the server busier with more people
        hour_ago = traffic.slot_of(self.now - timedelta(hours=1))
        for p in self.people[:3]:
            TrafficSlot.objects.create(slot=hour_ago, profile=p, where="/chart")
        TrafficSlot.objects.create(slot=traffic.slot_of(self.now - timedelta(hours=2)), profile=self.people[3], where="/analytics")
        for h in range(1, 9):
            m = (self.now - timedelta(hours=h)).replace(second=0, microsecond=0)
            ServerMinute.objects.create(minute=m, requests=30 * h, errors=1 if h == 2 else 0, avg_ms=40, max_ms=200, load_pct=10 + h, mem_pct=50)
        UserSession.objects.create(user=self.people[0], session_key="k1", device_info="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari Mobile")
        UserSession.objects.create(user=self.people[1], session_key="k2", device_info="Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")

    def test_report(self):
        r = site_analytics.report(30, now=self.now)
        self.assertEqual(r["kpis"]["peak_concurrent"], 3)
        self.assertEqual(r["kpis"]["dau"], 4)
        self.assertEqual(r["kpis"]["users"], 4)
        self.assertEqual(sum(v > 0 for row in r["heatmap"] for v in row), 2)   # two different hours
        self.assertEqual(r["busiest"][0]["peak"], 3)
        self.assertEqual(dict(r["devices"]), {"Mobile": 1, "Desktop": 1})
        self.assertEqual(dict(r["pages"])["/chart"], 0.2)   # 3 five-minute slots = 0.25 h → 0.2 rounded
        self.assertTrue(any(i["kind"] == "traffic" for i in r["insights"]))
        self.assertEqual(r["funnel"][0][1], 4)
        self.assertEqual(r["kpis"]["requests"], sum(30 * h for h in range(1, 9)))
        self.assertEqual(len(r["daily"]), 30)

    def test_live(self):
        TraderProfile.objects.filter(pk=self.people[0].pk).update(last_seen=self.now - timedelta(seconds=20), last_where="/chart")
        d = site_analytics.live(now=self.now)
        self.assertEqual(d["active_now"], 1)
        self.assertEqual(d["pages_now"], [["/chart", 1]] if isinstance(d["pages_now"][0], list) else [("/chart", 1)])
        self.assertEqual(len(d["per_minute"]), 60)

    def test_capacity_fit(self):
        cap = site_analytics._capacity([[1, 12], [2, 14], [3, 16], [4, 18], [5, 20], [6, 22]], 4)
        self.assertEqual((cap["base"], cap["per_user"], cap["users_at_70"]), (10.0, 2.0, 30))


class PageTests(TestCase):
    def test_staff_only(self):
        url = reverse("admin:core_siteanalytics_report")
        self.assertIn(self.client.get(url).status_code, (302, 403))
        admin = get_user_model().objects.create_superuser("boss", "boss@example.com", "pw-123456789")
        self.client.force_login(admin)
        self.assertEqual(self.client.get(reverse("admin:core_siteanalytics_changelist")).status_code, 200)
        self.assertEqual(self.client.get(url + "?days=7").json()["days"], 7)
        self.assertIn("active_now", self.client.get(reverse("admin:core_siteanalytics_live")).json())


class VisitorTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()

    def test_visit_ping(self):
        from .models import Visitor, VisitorSlot
        c = self.client
        self.assertEqual(c.post("/api/users/visit/", {"vid": "bad id!"}, content_type="application/json").status_code, 400)
        r = c.post("/api/users/visit/", {"vid": "abcd1234efgh", "where": "/", "ref": "https://www.google.com/search?q=gold"},
                   content_type="application/json", HTTP_USER_AGENT="Mozilla/5.0 (iPhone) Mobile")
        self.assertEqual(r.status_code, 200)
        v = Visitor.objects.get()
        self.assertEqual((v.referrer, v.first_path), ("google.com", "/"))   # only the other site's name
        c.post("/api/users/visit/", {"vid": "abcd1234efgh", "where": "/login", "ref": "http://testserver/x"}, content_type="application/json")
        self.assertEqual(Visitor.objects.get().referrer, "google.com")
        self.assertEqual(VisitorSlot.objects.count(), 1)   # the same 5 minutes

    def test_sign_up_links_the_visitor(self):
        from django.test import override_settings
        from .models import Visitor
        Visitor.objects.create(vid="vvvv1111", last_seen=timezone.now(), first_path="/")
        Visitor.objects.create(vid="vvvv2222", last_seen=timezone.now(), first_path="/")
        TraderProfile.objects.create(uid="old", name="Old", email="old@example.com")
        with override_settings(ALLOW_UNVERIFIED_SIGNIN=True):
            self.client.post("/api/users/sync/", {"uid": "new1", "name": "New", "email": "n@example.com", "visitor_id": "vvvv1111"}, content_type="application/json")
            self.client.post("/api/users/sync/", {"uid": "old", "name": "Old", "email": "old@example.com", "visitor_id": "vvvv2222"}, content_type="application/json")
        a, b = Visitor.objects.get(vid="vvvv1111"), Visitor.objects.get(vid="vvvv2222")
        self.assertEqual(a.profile.uid, "new1")
        self.assertIsNotNone(a.signed_up_at)      # a new account: a sign-up
        self.assertEqual(b.profile.uid, "old")
        self.assertIsNone(b.signed_up_at)         # an existing one signing in: not a sign-up


class EndpointAndPeopleTests(TestCase):
    def test_endpoint_times_by_route(self):
        import time as _t
        from datetime import datetime, timezone as dt_timezone
        from .models import EndpointMinute
        base = int(_t.time() // 60) - 5
        traffic._minute = None
        traffic._routes.clear()
        with patch("core.traffic.time.time", return_value=base * 60 + 1):
            traffic.note_request(100, 200, "api/users/user/<str:uid>/", "GET")
            traffic.note_request(1500, 500, "api/users/user/<str:uid>/", "GET")
        with patch("core.traffic.time.time", return_value=(base + 1) * 60 + 1):
            traffic.note_request(5, 200, "api/users/visit/", "POST")
        row = EndpointMinute.objects.get(minute=datetime.fromtimestamp(base * 60, tz=dt_timezone.utc))
        self.assertEqual((row.count, row.total_ms, row.max_ms, row.slow, row.errors), (2, 1600.0, 1500.0, 1, 1))
        ep = site_analytics._endpoints(timezone.now() - timedelta(days=1))
        self.assertEqual(ep[0]["route"], "/api/users/user/<str:uid>/")
        self.assertEqual(ep[0]["avg_ms"], 800.0)

    def test_at_risk_and_not_premium(self):
        from .models import Payment
        today = timezone.now().astimezone(site_analytics.IST).date()
        gone = TraderProfile.objects.create(uid="g", name="Gone", email="g@example.com", phone="99999")
        here = TraderProfile.objects.create(uid="h", name="Here", email="h@example.com")
        once = TraderProfile.objects.create(uid="o", name="Once", email="o@example.com")
        for d in range(20, 26):   # came 6 days, last 20 days ago
            SiteTime.objects.create(profile=gone, day=today - timedelta(days=d), seconds=1200)
        for d in range(0, 6):
            SiteTime.objects.create(profile=here, day=today - timedelta(days=d), seconds=600)
        SiteTime.objects.create(profile=once, day=today - timedelta(days=30), seconds=60)   # came once: not "often"
        risk = site_analytics._at_risk(today)
        self.assertEqual([p["name"] for p in risk["people"]], ["Gone"])
        self.assertEqual((risk["people"][0]["away"], risk["people"][0]["days_before"], risk["people"][0]["phone"]), (20, 6, "99999"))
        now = timezone.now()
        Payment.objects.create(profile=here, amount=999, paid_at=now - timedelta(days=1))   # (merge: paid in the last 31 days)
        np = site_analytics._not_premium(now)
        self.assertEqual((np["total"], np["premium"], np["not_premium"]), (3, 1, 2))
        self.assertNotIn("Here", [p["name"] for p in np["people"]])

    def test_store_health_without_clickhouse(self):
        from . import store_health
        with patch("pipeline.clickhouse_client.ClickHouseClient.query", side_effect=ConnectionError("refused")), \
             patch("requests.Session.get", side_effect=ConnectionError("refused")):
            d = store_health.report()
        self.assertFalse(d["clickhouse"]["ok"])
        self.assertIn("symbols", d["collector"])
