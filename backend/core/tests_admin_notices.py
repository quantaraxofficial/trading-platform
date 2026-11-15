"""The Contact page's form (core/contact.py) and the admin's notifications: the bell's counts, opening
one or a kind (seen), mark all, per admin (core/admin_notices.py)"""
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from .models import AdminSeen, ContactMessage, FailedRequest, FeedbackMessage


class ContactFormTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_saved(self):
        r = self.client.post("/api/users/contact/", {"name": "Asha", "email": "asha@test.invalid", "message": "Do you have a mobile app?"}, content_type="application/json")
        self.assertEqual(r.status_code, 200)
        m = ContactMessage.objects.get()
        self.assertEqual((m.name, m.email, m.is_read), ("Asha", "asha@test.invalid", False))

    def test_checked(self):
        r = self.client.post("/api/users/contact/", {"name": "", "email": "nope", "message": ""}, content_type="application/json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(set(r.json()["errors"]), {"name", "email", "message"})
        self.assertFalse(ContactMessage.objects.exists())


class AdminNoticesTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("adm", "adm@test.invalid", "pw")
        self.client.force_login(self.admin)
        FailedRequest.objects.create(path="/api/users/drawings/x/", method="POST", status_code=500, reason_code="server_error")
        FailedRequest.objects.create(path="/api/users/settings/x/", method="GET", status_code=0, reason_code="cloud_sync_failed")
        self.contact = ContactMessage.objects.create(name="Asha", email="asha@test.invalid", message="Hello")
        self.old = FeedbackMessage.objects.create(message="old one")
        FeedbackMessage.objects.filter(pk=self.old.pk).update(created_at=timezone.now() - timedelta(days=30))
        self.feedback = FeedbackMessage.objects.create(message="The alerts panel is slow")

    def state(self):
        return self.client.get("/admin/notices/").json()

    def test_counts(self):
        st = self.state()
        counts = {k["kind"]: k["count"] for k in st["kinds"]}
        self.assertEqual(counts, {"errors": 2, "contact": 1, "feedback": 1})   # (the month-old one isn't new)
        self.assertEqual(st["total"], 4)
        contact = next(k for k in st["kinds"] if k["kind"] == "contact")
        self.assertEqual(contact["items"][0]["title"], "Asha <asha@test.invalid>")

    def test_open_one_and_a_kind(self):
        r = self.client.get(f"/admin/notices/open/contact/{self.contact.pk}/")
        self.assertRedirects(r, f"/admin/core/contactmessage/{self.contact.pk}/change/", fetch_redirect_response=False)
        self.contact.refresh_from_db()
        self.assertTrue(self.contact.is_read)
        r = self.client.get("/admin/notices/open/errors/")
        self.assertTrue(r["Location"].startswith("/admin/core/failedrequest/?created_at__gte="))
        self.assertEqual(self.client.get(r["Location"]).status_code, 200)   # (the list opens with that filter)
        counts = {k["kind"]: k["count"] for k in self.state()["kinds"]}
        self.assertEqual(counts, {"errors": 0, "contact": 0, "feedback": 1})
        FailedRequest.objects.create(path="/api/users/x/", method="GET", status_code=502, reason_code="bad_gateway")
        self.assertEqual({k["kind"]: k["count"] for k in self.state()["kinds"]}["errors"], 1)

    def test_mark_all_and_per_admin(self):
        self.assertEqual(self.client.post("/admin/notices/seen/").json()["total"], 0)
        other = User.objects.create_superuser("adm2", "adm2@test.invalid", "pw")
        self.client.force_login(other)
        self.assertEqual(self.state()["total"], 4)
        self.assertEqual(AdminSeen.objects.filter(user=self.admin).count(), 3)

    def test_bell_on_admin_pages_only_for_staff(self):
        html = self.client.get("/admin/").content.decode()
        self.assertIn('data-name="admin-bell"', html)
        self.client.logout()
        self.assertNotIn('data-name="admin-bell"', self.client.get("/admin/login/").content.decode())
        self.assertEqual(self.client.get("/admin/notices/").status_code, 302)   # (to the sign-in)
