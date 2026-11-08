"""Feedback / bug reports (the chart's Send feedback button, and the voice assistant)"""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .models import FeedbackMessage, TraderProfile, UserSession


class FeedbackTests(TestCase):
    def setUp(self):
        cache.clear()
        self.me = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        UserSession.objects.create(user=self.me, session_key="sk1")
        self.c = APIClient()

    def test_a_signed_in_report_is_kept_with_its_context(self):
        r = self.c.post("/api/users/feedback/?session_key=sk1", {"message": "The replay skips a bar", "symbol": "XAU/USD", "interval": "15min", "page_url": "/"})
        self.assertEqual(r.status_code, 200)
        fb = FeedbackMessage.objects.get(id=r.data["id"])
        self.assertEqual((fb.user, fb.message, fb.symbol, fb.interval), (self.me, "The replay skips a bar", "XAU/USD", "15min"))

    def test_anonymous_reports_are_allowed_but_limited(self):
        for _ in range(10):
            self.assertEqual(self.c.post("/api/users/feedback/", {"message": "hi"}).status_code, 200)
        self.assertEqual(self.c.post("/api/users/feedback/", {"message": "hi"}).status_code, 429)
        self.assertIsNone(FeedbackMessage.objects.first().user)

    def test_a_message_is_needed(self):
        self.assertEqual(self.c.post("/api/users/feedback/", {"message": "  "}).status_code, 400)
