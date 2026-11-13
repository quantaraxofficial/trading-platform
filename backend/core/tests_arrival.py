"""Where traders came from (core/arrival.py): sorted into a kind and a source, kept once at sign-up,
shown in Django admin"""
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .arrival import classify, clean
from .models import TraderProfile


class ClassifyTests(TestCase):
    def k(self, **a):
        return classify(clean(a))

    def test_kinds(self):
        self.assertEqual(self.k(utm_source="instagram", utm_medium="paid", utm_campaign="diwali"), ("ad", "instagram", "diwali"))
        self.assertEqual(self.k(gclid=True, referrer="https://www.google.com/"), ("ad", "google", ""))
        self.assertEqual(self.k(ref="RAHUL10", utm_source="whatsapp"), ("referral", "RAHUL10", ""))
        self.assertEqual(self.k(utm_source="youtube", utm_medium="video"), ("social", "youtube", ""))
        self.assertEqual(self.k(utm_source="ig", utm_medium="social"), ("social", "ig", ""))
        self.assertEqual(self.k(utm_source="mailchimp", utm_medium="email", utm_campaign="nov"), ("email", "mailchimp", "nov"))
        self.assertEqual(self.k(utm_source="partner_blog"), ("link", "partner_blog", ""))
        self.assertEqual(self.k(referrer="https://www.google.co.in/"), ("search", "google", ""))
        self.assertEqual(self.k(referrer="https://l.instagram.com/"), ("social", "instagram", ""))
        self.assertEqual(self.k(fbclid=True), ("social", "facebook", ""))
        self.assertEqual(self.k(referrer="https://www.forexfactory.com/thread/1"), ("website", "forexfactory.com", ""))
        self.assertEqual(self.k(landing="/chart", at="2026-11-13T10:00:00Z"), ("direct", "", ""))

    def test_clean_keeps_only_known_short_fields(self):
        a = clean({"utm_source": "x" * 500, "evil": "<script>", "gclid": "yes", "fbclid": True, "ref": {"a": 1}})
        self.assertEqual(a, {"utm_source": "x" * 120, "fbclid": True})
        self.assertIsNone(clean("nope"))


@override_settings(ALLOW_UNVERIFIED_SIGNIN=True)
class SignUpTests(TestCase):
    def setUp(self):
        self.c = APIClient()

    def sync(self, uid, arrival):
        return self.c.post("/api/users/sync/", {"uid": uid, "session_key": f"k-{uid}", "email": f"{uid}@test.invalid", "arrival": arrival}, format="json")

    def test_kept_once_at_sign_up(self):
        self.assertEqual(self.sync("a1", {"utm_source": "instagram", "utm_medium": "cpc", "utm_campaign": "nov", "landing": "/"}).status_code, 200)
        p = TraderProfile.objects.get(uid="a1")
        self.assertEqual((p.source_kind, p.source, p.campaign), ("ad", "instagram", "nov"))
        self.assertEqual(p.arrival["landing"], "/")
        # a later sign-in doesn't change it
        self.sync("a1", {"ref": "SOMEONE"})
        p.refresh_from_db()
        self.assertEqual((p.source_kind, p.source), ("ad", "instagram"))

    def test_nothing_sent_is_not_recorded(self):
        self.c.post("/api/users/sync/", {"uid": "a2", "session_key": "k2", "email": "a2@test.invalid"}, format="json")
        self.assertEqual(TraderProfile.objects.get(uid="a2").source_kind, "")

    def test_admin_pages(self):
        self.sync("a3", {"ref": "RAHUL10"})
        self.sync("a4", {"referrer": "https://www.google.com/"})
        TraderProfile.objects.create(uid="old", name="Old", email="old@test.invalid")
        self.client.force_login(User.objects.create_superuser("adm", "adm@test.invalid", "pw"))
        r = self.client.get("/admin/core/tradersource/")
        self.assertEqual(r.status_code, 200)
        page = r.content.decode()
        for text in ("Where traders came from", "Referral", "RAHUL10", "Search", "google", "Not recorded"):
            self.assertIn(text, page)
        r = self.client.get("/admin/core/traderprofile/")
        self.assertContains(r, "Referral · RAHUL10")
        p = TraderProfile.objects.get(uid="a3")
        self.assertContains(self.client.get(f"/admin/core/traderprofile/{p.id}/change/"), "RAHUL10")
        self.assertContains(self.client.get("/admin/core/traderprofile/?source_kind__exact=search"), "a4@test.invalid")
