"""Security hardening: sign-in (verified email, server-issued session keys, idle expiry), injection
into the live-data queries, feedback uploads, request limits and forged client IPs."""
import io
from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .middleware import get_client_ip
from .models import FeedbackMessage, TraderProfile, UserSession


def png_bytes():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), (200, 10, 10)).save(buf, "PNG")
    return buf.getvalue()


class SignInTests(TestCase):
    def setUp(self):
        cache.clear()
        self.c = APIClient()

    def sync(self, body, claims):
        with mock.patch("core.views.verified_claims", return_value=claims):
            return self.c.post("/api/users/sync/", {"id_token": "x", **body}, format="json")

    def test_email_comes_from_the_token_and_keys_from_the_server(self):
        r = self.sync({"uid": "u1", "email": "boss@bank.example", "name": "Asha", "session_key": "chosen-by-browser"},
                      {"user_id": "u1", "email": "asha@example.com"})
        self.assertEqual(r.status_code, 200)
        p = TraderProfile.objects.get(uid="u1")
        self.assertEqual(p.email, "asha@example.com")       # not the email the request claimed
        key = r.json()["session_key"]
        self.assertGreaterEqual(len(key), 40)
        self.assertNotEqual(key, "chosen-by-browser")
        self.assertFalse(UserSession.objects.filter(session_key="chosen-by-browser").exists())
        # Signing in again with that key keeps it
        r2 = self.sync({"uid": "u1", "session_key": key}, {"user_id": "u1", "email": "asha@example.com"})
        self.assertEqual(r2.json()["session_key"], key)
        self.assertEqual(UserSession.objects.filter(user=p).count(), 1)

    def test_device_limit_and_force(self):
        claims = {"user_id": "u1", "email": "a@example.com"}
        k1 = self.sync({"uid": "u1"}, claims).json()["session_key"]
        k2 = self.sync({"uid": "u1"}, claims).json()["session_key"]
        self.assertTrue(self.sync({"uid": "u1"}, claims).json()["limit_reached"])
        k3 = self.sync({"uid": "u1", "force": True}, claims).json()["session_key"]
        keys = set(UserSession.objects.filter(user__uid="u1").values_list("session_key", flat=True))
        self.assertEqual(keys, {k2, k3})
        self.assertNotIn(k1, keys)

    def test_idle_session_ends_and_unknown_users_look_the_same(self):
        p = TraderProfile.objects.create(uid="u2", name="B", email="b@example.com")
        s = UserSession.objects.create(user=p, session_key="k" * 43)
        self.assertEqual(self.c.get(f"/api/users/user/u2/?session_key={'k' * 43}").status_code, 200)
        UserSession.objects.filter(id=s.id).update(last_active=timezone.now() - timedelta(days=31))
        self.assertEqual(self.c.get(f"/api/users/user/u2/?session_key={'k' * 43}").status_code, 401)
        self.assertFalse(UserSession.objects.filter(id=s.id).exists())
        # A user that doesn't exist answers exactly like a wrong key (no probing for accounts)
        r = self.c.get("/api/users/user/nobody/?session_key=whatever")
        self.assertEqual((r.status_code, r.json()), (401, {"error": "Session expired or logged out from another device"}))

    def test_token_issuer_is_checked(self):
        from .auth import verified_claims
        fake = {"user_id": "u1", "iss": "https://securetoken.google.com/someone-elses-project", "aud": "quantarax"}
        with mock.patch("google.oauth2.id_token.verify_firebase_token", return_value=fake):
            self.assertIsNone(verified_claims("a.b.c"))
        good = {**fake, "iss": "https://securetoken.google.com/quantarax"}
        with mock.patch("google.oauth2.id_token.verify_firebase_token", return_value=good):
            self.assertEqual(verified_claims("a.b.c")["user_id"], "u1")

    @override_settings(REST_FRAMEWORK={"DEFAULT_THROTTLE_CLASSES": ["core.throttles.ApiThrottle"],
                                       "DEFAULT_THROTTLE_RATES": {"api": "1000/min", "signin": "3/min", "report": "100/min", "feedback": "10/hour", "upload": "10/hour"}})
    def test_sign_in_is_rate_limited(self):
        from rest_framework.settings import api_settings
        api_settings.reload()
        try:
            from .throttles import SignInThrottle
            SignInThrottle.THROTTLE_RATES = api_settings.DEFAULT_THROTTLE_RATES
            codes = [self.c.post("/api/users/sync/", {"uid": "u9", "id_token": "bad"}, format="json").status_code for _ in range(5)]
        finally:
            api_settings.reload()
            SignInThrottle.THROTTLE_RATES = api_settings.DEFAULT_THROTTLE_RATES
        self.assertEqual(codes, [401, 401, 401, 429, 429])


class LiveDataInjectionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.c = APIClient()

    def test_candles_refuse_anything_but_a_symbol(self):
        # (candles come from core.market since the live Vantage feed)
        ch = mock.Mock()
        ch._session.post.return_value.text = '{"data": []}'
        with mock.patch("core.market._ch", return_value=ch), mock.patch("core.market._db", return_value="ticks"):
            for evil in ["XAUUSD' OR 1=1 --", "x\\' UNION SELECT", 'A"B', "AAPL;DROP TABLE x", "a" * 40]:
                r = self.c.get("/api/users/live/candles/", {"symbol": evil, "interval": "1min"})
                self.assertEqual(r.status_code, 400, evil)
            for evil in ["1min' OR 1=1", "7x", "45s"]:
                r = self.c.get("/api/users/live/candles/", {"symbol": "XAUUSD", "interval": evil})
                self.assertEqual(r.status_code, 400, evil)
            self.assertEqual(ch._session.post.call_count, 0)
            self.assertEqual(self.c.get("/api/users/live/candles/", {"symbol": "xau/usd", "interval": "1min", "limit": "abc"}).status_code, 200)
            sql = ch._session.post.call_args[1]["data"].decode()
            self.assertIn("WHERE symbol = 'XAUUSD'", sql)
            self.assertIn("LIMIT 5000", sql)

    def test_last_prices_drop_bad_symbols(self):
        with mock.patch("core.views._ch_read", return_value=[]) as read, mock.patch("core.views._ch_client"):
            self.c.get("/api/users/live/last-prices/", {"symbols": "XAUUSD,EVIL' OR '1'='1,EURUSD"})
            sql = read.call_args[0][1]
        self.assertIn("IN ('XAUUSD','EURUSD')", sql)
        self.assertNotIn("EVIL", sql)


class FeedbackUploadTests(TestCase):
    def setUp(self):
        cache.clear()
        self.c = APIClient()

    def test_only_real_pictures_are_kept(self):
        files = [SimpleUploadedFile("shot.png", png_bytes(), content_type="image/png"),
                 SimpleUploadedFile("evil.png", b"<script>alert(1)</script>", content_type="image/png"),
                 SimpleUploadedFile("page.html", b"<html></html>", content_type="text/html")]
        with mock.patch("core.views.default_storage.save", side_effect=lambda name, f: name) as save:
            r = self.c.post("/api/users/feedback/", {"message": "bug", "images": files}, format="multipart")
        self.assertEqual(r.status_code, 200)
        fb = FeedbackMessage.objects.get(id=r.json()["id"])
        self.assertEqual(len(fb.images), 1)
        self.assertRegex(fb.images[0], r"^/media/feedback/fb_[0-9a-f]{24}\.png$")
        self.assertEqual(save.call_count, 1)

    def test_at_most_five_and_not_too_big(self):
        files = [SimpleUploadedFile(f"s{i}.png", png_bytes(), content_type="image/png") for i in range(8)]
        big = SimpleUploadedFile("big.png", png_bytes() + b"\0" * (6 * 1024 * 1024), content_type="image/png")
        with mock.patch("core.views.default_storage.save", side_effect=lambda name, f: name):
            r = self.c.post("/api/users/feedback/", {"message": "bug", "images": [big] + files}, format="multipart")
        self.assertEqual(len(FeedbackMessage.objects.get(id=r.json()["id"]).images), 4)   # 5 looked at, the big one dropped


class ClientIpTests(TestCase):
    def test_forwarded_for_only_behind_a_trusted_proxy(self):
        rf = RequestFactory()
        req = rf.get("/", HTTP_X_FORWARDED_FOR="6.6.6.6, 10.0.0.9", REMOTE_ADDR="10.0.0.1")
        with override_settings(TRUSTED_PROXY_COUNT=0):
            self.assertEqual(get_client_ip(req), "10.0.0.1")     # a forged header is ignored
        with override_settings(TRUSTED_PROXY_COUNT=1):
            self.assertEqual(get_client_ip(req), "10.0.0.9")     # the hop the proxy added


class AdminCookieTests(TestCase):
    """Someone signed in to Django admin on the same site: the app's own saves still work (the API
    signs people in with its session keys, never Django's cookie, so no CSRF check applies)"""
    def test_saves_work_with_an_admin_session_cookie(self):
        from django.contrib.auth.models import User
        c = APIClient(enforce_csrf_checks=True)
        c.force_login(User.objects.create_superuser("boss", "boss@example.com", "pw-for-test-only"))
        p = TraderProfile.objects.create(uid="u7", name="T", email="t7@example.com")
        UserSession.objects.create(user=p, session_key="s" * 43)
        r = c.post(f"/api/users/chart_state/u7/?session_key={'s' * 43}", {"symbol": "XAUUSD", "interval": "1min", "bar_spacing": 12.5}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        r = c.post(f"/api/users/collab/u7/rooms/?session_key={'s' * 43}", {"name": "Test", "symbol": "XAUUSD", "interval": "1min"}, format="json")
        self.assertIn(r.status_code, (200, 201), r.content)
