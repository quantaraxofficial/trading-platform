"""Earnings (core/earnings.py and its admin page), from the payments entered in admin"""
from datetime import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase

from . import earnings
from .models import Payment, TraderProfile


class EarningsTests(TestCase):
    def test_report_and_page(self):
        p = TraderProfile.objects.create(uid="e1", name="Ravi", email="e@test.invalid")
        now = datetime(2026, 11, 12, 15, 0, tzinfo=earnings.IST)
        pay = lambda amount, cur, when: Payment.objects.create(profile=p, amount=Decimal(amount), currency=cur, paid_at=when, method="UPI")
        pay("1500", "INR", datetime(2026, 11, 3, 10, tzinfo=earnings.IST))
        pay("999", "INR", datetime(2026, 10, 20, tzinfo=earnings.IST))
        pay("20", "USD", datetime(2026, 11, 5, tzinfo=earnings.IST))
        pay("500", "INR", datetime(2025, 12, 31, tzinfo=earnings.IST))
        r = earnings.report(now=now)
        cards = {c[0]: c[1] for c in r["cards"]}
        self.assertEqual(cards["This month (Nov)"], {"INR": Decimal("1500"), "USD": Decimal("20")})
        self.assertEqual(cards["Last month (Oct)"], {"INR": Decimal("999")})
        self.assertEqual(cards["This year (2026)"], {"INR": Decimal("2499"), "USD": Decimal("20")})
        self.assertEqual(cards["All time"]["INR"], Decimal("2999"))
        self.client.force_login(User.objects.create_superuser("adm", "adm@test.invalid", "pw"))
        page = self.client.get("/admin/core/earning/")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "Month by month")
        self.assertContains(page, "5 Nov, 00:00")                     # (Indian time)
        self.assertEqual(self.client.get("/admin/core/payment/add/").status_code, 200)
