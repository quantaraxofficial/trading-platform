"""Accounts sold by hand: the admin's Create account (Firebase mocked), extending and ending a
subscription, and the features locked once it's ended (collab over REST and the WebSocket)."""
from datetime import timedelta
from unittest import mock

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import access
from .models import CollabMember, CollabRoom, LockedFeature, PlanSettings, Subscription, TraderProfile, UserSession
from .routing import websocket_urlpatterns


def seed_features():
    # (TransactionTestCase empties the tables the data migration filled)
    LockedFeature.objects.get_or_create(key='collab', defaults={"label": "Collab"})
    LockedFeature.objects.get_or_create(key='replay', defaults={"label": "Bar replay"})
    PlanSettings.objects.get_or_create(id=1)


class FakeFirebase:
    """Stands in for requests.post to the identity toolkit"""
    def __init__(self, fail=None):
        self.calls = []
        self.fail = fail

    def __call__(self, url, json=None, timeout=None):
        self.calls.append((url.split('/v1/')[1].split('?')[0], json))
        r = mock.Mock()
        if self.fail:
            r.status_code, r.content = 400, b'x'
            r.json.return_value = {"error": {"message": self.fail}}
        else:
            r.status_code, r.content = 200, b'x'
            r.json.return_value = {"localId": "fb-uid-1", "idToken": "tok"}
        return r


class AccessTests(TestCase):
    def setUp(self):
        seed_features()
        self.p = TraderProfile.objects.create(uid="u1", name="Buyer", email="buyer@example.com")

    def test_no_subscription_is_locked(self):
        a = access.access_of(self.p)
        self.assertFalse(a["active"])
        self.assertIsNone(a["until"])
        self.assertEqual(sorted(a["locked"]), ["collab", "replay"])

    def test_extend_stacks_and_end_now(self):
        access.extend(self.p, months=1)
        a = access.access_of(self.p)
        self.assertTrue(a["active"])
        self.assertEqual(a["days_left"], 30)
        self.assertEqual(a["locked"], [])
        self.assertEqual(a["features"], {"collab": "Collab", "replay": "Bar replay"})
        # A renewal before the end adds after what's left
        access.extend(self.p, days=5)
        self.assertEqual(access.access_of(self.p)["days_left"], 35)
        access.end_now(self.p)
        a = access.access_of(self.p)
        self.assertFalse(a["active"])
        self.assertIn("collab", a["locked"])
        # Once ended, a renewal counts from now
        access.extend(self.p, months=3)
        self.assertEqual(access.access_of(self.p)["days_left"], 90)

    def test_expired_and_unlocked_feature(self):
        Subscription.objects.create(profile=self.p, starts_at=timezone.now() - timedelta(days=40),
                                    ends_at=timezone.now() - timedelta(days=10), months=1)
        self.assertTrue(access.is_locked(self.p, "collab"))
        LockedFeature.objects.filter(key="collab").update(locked=False)
        self.assertFalse(access.is_locked(self.p, "collab"))
        self.assertTrue(access.is_locked(self.p, "replay"))

    def test_user_data_carries_access(self):
        UserSession.objects.create(user=self.p, session_key="sk")
        r = APIClient().get("/api/users/user/u1/?session_key=sk")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["access"]["active"])
        self.assertIn("replay", r.json()["access"]["locked"])

    def test_password_is_readable(self):
        for _ in range(50):
            pw = access.new_password()
            self.assertEqual(len(pw), 12)
            self.assertFalse(set(pw) & set("0O1lI"))


class CollabLockedTests(TestCase):
    def setUp(self):
        seed_features()
        self.c = APIClient()
        self.own = TraderProfile.objects.create(uid="own", name="Own", email="own@example.com")
        self.bob = TraderProfile.objects.create(uid="bob", name="Bob", email="bob@example.com")
        for p in (self.own, self.bob):
            UserSession.objects.create(user=p, session_key=f"sk-{p.uid}")
        access.extend(self.own, months=1)
        self.room = CollabRoom.objects.create(token="tok", owner=self.own, name="R", symbol="AAPL", interval="1D", link_access="edit")
        CollabMember.objects.create(room=self.room, profile=self.own, role="owner")

    def url(self, uid, path):
        return f"/api/users/collab/{uid}/{path}?session_key=sk-{uid}"

    def test_ended_plan_cant_create_open_or_ask(self):
        r = self.c.post(self.url("bob", "rooms/"), {"name": "X", "symbol": "AAPL", "interval": "1D"}, format="json")
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json()["locked"], "collab")
        self.assertIn("Contact us to renew", r.json()["error"])
        self.assertEqual(self.c.get(self.url("bob", "room/tok/")).status_code, 402)
        self.assertFalse(CollabMember.objects.filter(room=self.room, profile=self.bob).exists())
        self.assertEqual(self.c.post(self.url("bob", "room/tok/request/"), {}, format="json").status_code, 402)
        # Their list of collabs still loads (nothing is taken away, it just won't open)
        self.assertEqual(self.c.get(self.url("bob", "rooms/")).status_code, 200)

    def test_active_plan_opens(self):
        access.extend(self.bob, months=1)
        self.assertEqual(self.c.get(self.url("bob", "room/tok/")).status_code, 200)

    def test_owner_whose_plan_ended(self):
        access.end_now(self.own)
        self.assertEqual(self.c.get(self.url("own", "room/tok/")).status_code, 402)
        # Their settings stay reachable (peek), so they can still end or delete it
        self.assertEqual(self.c.get(self.url("own", "room/tok/") + "&peek=1").status_code, 200)


class CollabSocketLockedTests(TransactionTestCase):
    def setUp(self):
        seed_features()
        self.own = TraderProfile.objects.create(uid="own", name="Own", email="own@example.com")
        UserSession.objects.create(user=self.own, session_key="sk-own")
        self.room = CollabRoom.objects.create(token="tok", owner=self.own, name="R", symbol="AAPL", interval="1D")
        CollabMember.objects.create(room=self.room, profile=self.own, role="owner")

    async def test_socket_refused_with_4402(self):
        ws = WebsocketCommunicator(URLRouter(websocket_urlpatterns), "/ws/collab/tok/?uid=own&session_key=sk-own")
        ok, code = await ws.connect()
        self.assertFalse(ok)
        self.assertEqual(code, 4402)


@override_settings(FIREBASE_WEB_API_KEY="test-key")
class CreateAccountAdminTests(TestCase):
    def setUp(self):
        seed_features()
        self.admin = User.objects.create_superuser("boss", "boss@example.com", "pw-for-test-only")
        self.client.force_login(self.admin)
        self.url = "/admin/core/traderprofile/create-account/"

    def test_creates_login_profile_and_subscription(self):
        fb = FakeFirebase()
        with mock.patch("core.access.requests.post", fb):
            r = self.client.post(self.url, {"name": "Ravi K", "email": "Ravi@Example.com", "months": 3, "days": 2, "amount": "4500 UPI"})
        self.assertEqual(r.status_code, 200)
        created = r.context["created"]
        self.assertEqual(created["email"], "ravi@example.com")
        self.assertContains(r, created["password"])
        self.assertEqual([c[0] for c in fb.calls], ["accounts:signUp", "accounts:update"])
        self.assertEqual(fb.calls[0][1]["password"], created["password"])
        self.assertEqual(fb.calls[1][1]["displayName"], "Ravi K")
        p = TraderProfile.objects.get(uid="fb-uid-1")
        self.assertEqual(access.access_of(p)["days_left"], 92)
        self.assertEqual(p.subscriptions.get().amount, "4500 UPI")

    def test_existing_email_and_firebase_refusal(self):
        TraderProfile.objects.create(uid="x", name="X", email="taken@example.com")
        fb = FakeFirebase()
        with mock.patch("core.access.requests.post", fb):
            r = self.client.post(self.url, {"name": "T", "email": "TAKEN@example.com", "months": 1})
        self.assertContains(r, "already exists")
        self.assertEqual(fb.calls, [])
        with mock.patch("core.access.requests.post", FakeFirebase(fail="EMAIL_EXISTS")):
            r = self.client.post(self.url, {"name": "N", "email": "new@example.com", "months": 1})
        self.assertContains(r, "extend its subscription instead")
        self.assertFalse(TraderProfile.objects.filter(email="new@example.com").exists())

    def test_needs_some_time(self):
        r = self.client.post(self.url, {"name": "N", "email": "n@example.com", "months": 0, "days": 0})
        self.assertContains(r, "Give at least some months or days")

    def test_list_actions(self):
        p = TraderProfile.objects.create(uid="p", name="P", email="p@example.com")
        cl = "/admin/core/traderprofile/"
        self.client.post(cl, {"action": "extend_6", "_selected_action": [p.id]})
        self.assertEqual(access.access_of(p)["days_left"], 180)
        self.client.post(cl, {"action": "end_access", "_selected_action": [p.id]})
        self.assertFalse(access.access_of(p)["active"])
        r = self.client.get(cl + "?access=ended")
        self.assertContains(r, "p@example.com")
        self.assertContains(self.client.get(cl), "Create account (after a payment)")
