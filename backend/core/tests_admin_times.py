"""Django admin: a backtest session's times edited as India dates (h:mm:ss for time spent) and saved
back as the same unix numbers"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import ReplaySession, SavedReplay, TraderProfile


class AdminTimesTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser("boss", "boss@example.com", "pw-123456789")
        self.client.force_login(self.admin)
        self.owner = TraderProfile.objects.create(uid="u1", name="Aditya Singh", email="a@example.com")
        self.s = ReplaySession.objects.create(owner=self.owner, name="XAUUSD", symbol="XAU/USD", interval="1min",
                                              start_time=1788633000, current_time=1794407820, time_spent=13811,
                                              drawings=[{"id": "d1", "type": "trendline", "points": [{"time": 1788633000, "price": 3500.5}]}])
        self.r = SavedReplay.objects.create(owner=self.owner, symbol="XAU/USD", interval="4h", time=1733407200, saved_at=1794593203419)

    def test_session_page_and_round_trip(self):
        url = reverse("admin:core_replaysession_change", args=[self.s.id])
        page = self.client.get(url).content.decode()
        self.assertIn("XAUUSD (Aditya Singh)", page)            # the title, not "object (n)"
        self.assertIn("2026-09-06", page)                        # 1788633000 → 6 Sep 2026, 00:00 India
        self.assertIn('value="00:00:00"', page)
        self.assertIn("03:50:11", page)                          # 13811 s
        self.assertNotIn("1788633000", page)                     # nowhere: the drawings' times too
        self.assertIn("06 Sep 2026, 00:00 IST", page)
        form = {"owner": self.owner.id, "name": "XAUUSD", "symbol": "XAU/USD", "interval": "1min", "interval_label": "1m",
                "start_time_0": "2026-09-06", "start_time_1": "00:00:00",
                "current_time_0": "2026-11-11", "current_time_1": "20:07:00",
                "end_time_0": "", "end_time_1": "", "visible_bars": "", "length_value": "", "length_unit": "",
                "initial_balance": "10000", "strategy": "", "description": "", "rules": "[]",
                "tags": "[]", "notes": "", "status": "active", "time_spent": "03:50:11"}
        r = self.client.post(url, form)
        self.assertEqual(r.status_code, 302, r.context and r.context["adminform"].form.errors.as_text())
        self.s.refresh_from_db()
        self.assertEqual((self.s.start_time, self.s.current_time, self.s.end_time, self.s.time_spent),
                         (1788633000, 1794407820, None, 13811))
        self.assertEqual(self.s.drawings[0]["points"][0]["time"], 1788633000)   # kept as it was

    def test_saved_replay_page(self):
        page = self.client.get(reverse("admin:core_savedreplay_change", args=[self.r.id])).content.decode()
        self.assertIn("2024-12-05", page)
        self.assertIn("2026-11-13", page)                        # saved_at is milliseconds
        self.assertNotIn("1794593203419", page)
        self.assertNotIn("1733407200", page)
        listing = self.client.get(reverse("admin:core_savedreplay_changelist")).content.decode()
        self.assertIn("05 Dec 2024, 19:30", listing)
