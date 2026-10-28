from django.test import TestCase
from rest_framework.test import APIClient

from .access import extend
from .models import TraderProfile, UserSession, UserSetting


class SettingsSyncTests(TestCase):
    """/api/users/settings/<uid>/: the settings that follow a user across devices"""

    def setUp(self):
        self.user = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        UserSession.objects.create(user=self.user, session_key="sk1")
        self.client = APIClient()
        self.url = "/api/users/settings/u1/"

    def post(self, settings, key="sk1"):
        return self.client.post(self.url, {"settings": settings}, format="json", HTTP_X_SESSION_KEY=key)

    def test_requires_a_valid_session(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.get(self.url, HTTP_X_SESSION_KEY="wrong").status_code, 401)
        self.assertEqual(self.post({"tv:layouts": {"value": "{}", "updated_at": 1}}, key="wrong").status_code, 401)
        self.assertFalse(UserSetting.objects.exists())

    def test_store_and_read_back(self):
        r = self.post({"tv:layouts": {"value": '{"a":1}', "updated_at": 100}, "tv:theme": {"value": "dark", "updated_at": 100}})
        self.assertEqual(r.status_code, 200)
        got = self.client.get(self.url, HTTP_X_SESSION_KEY="sk1").json()
        self.assertEqual(got["tv:layouts"], {"value": '{"a":1}', "updated_at": 100})
        self.assertEqual(got["tv:theme"]["value"], "dark")

    def test_newer_copy_wins(self):
        self.post({"tv:theme": {"value": "dark", "updated_at": 200}})
        # An older device's copy doesn't overwrite the newer one, and the reply returns what's kept
        r = self.post({"tv:theme": {"value": "light", "updated_at": 100}}).json()
        self.assertEqual(r["tv:theme"], {"value": "dark", "updated_at": 200})
        self.post({"tv:theme": {"value": "light", "updated_at": 300}})
        self.assertEqual(UserSetting.objects.get(key="tv:theme").value, "light")

    def test_bad_input_is_skipped(self):
        r = self.post({"tv:x": {"value": 5, "updated_at": 1}, "tv:y": "nope", "tv:z": {"value": "ok", "updated_at": 1}}).json()
        self.assertEqual(list(r.keys()), ["tv:z"])

    def test_other_users_settings_are_separate(self):
        other = TraderProfile.objects.create(uid="u2", name="B", email="b@example.com")
        UserSession.objects.create(user=other, session_key="sk2")
        self.post({"tv:theme": {"value": "dark", "updated_at": 1}})
        r = self.client.get("/api/users/settings/u2/", HTTP_X_SESSION_KEY="sk2").json()
        self.assertEqual(r, {})
        # u1's session key can't read u2's settings
        self.assertEqual(self.client.get("/api/users/settings/u2/", HTTP_X_SESSION_KEY="sk1").status_code, 401)


from unittest.mock import patch
from django.test import override_settings
from .models import DrawingTemplate, PineScript


class AccessTests(TestCase):
    """Every per-user endpoint needs that user's session; sign-in needs their Firebase token"""

    def setUp(self):
        self.a = TraderProfile.objects.create(uid="ua", name="A", email="ua@example.com")
        self.b = TraderProfile.objects.create(uid="ub", name="B", email="ub@example.com")
        UserSession.objects.create(user=self.a, session_key="ska")
        UserSession.objects.create(user=self.b, session_key="skb")
        self.c = APIClient()

    def test_endpoints_refuse_missing_or_foreign_sessions(self):
        for url in ["/api/users/drawings/ua/?symbol=AAPL", "/api/users/chart_state/ua/", "/api/users/templates/ua/",
                    "/api/users/pinescripts/ua/", "/api/users/user/ua/", "/api/users/settings/ua/"]:
            self.assertEqual(self.c.get(url).status_code, 401, url)
            self.assertEqual(self.c.get(url + ("&" if "?" in url else "?") + "session_key=skb").status_code, 401, url)
            self.assertEqual(self.c.get(url + ("&" if "?" in url else "?") + "session_key=ska").status_code, 200, url)
        r = self.c.post("/api/users/drawings/ua/?session_key=skb", {"symbol": "AAPL", "drawings": [1]}, format="json")
        self.assertEqual(r.status_code, 401)

    def test_delete_only_own_items(self):
        t = DrawingTemplate.objects.create(owner=self.a, name="t", tool_type="line", settings={})
        s = PineScript.objects.create(owner=self.a, name="s")
        self.assertEqual(self.c.delete(f"/api/users/templates/delete/{t.id}/").status_code, 401)
        self.assertEqual(self.c.delete(f"/api/users/templates/delete/{t.id}/?session_key=skb").status_code, 404)
        self.assertEqual(self.c.delete(f"/api/users/pinescripts/delete/{s.id}/?session_key=skb").status_code, 404)
        self.assertTrue(DrawingTemplate.objects.filter(id=t.id).exists() and PineScript.objects.filter(id=s.id).exists())
        self.assertEqual(self.c.delete(f"/api/users/templates/delete/{t.id}/?session_key=ska").status_code, 200)
        self.assertEqual(self.c.delete(f"/api/users/pinescripts/delete/{s.id}/?session_key=ska").status_code, 200)

    def test_sign_in_needs_the_users_token(self):
        body = {"uid": "ua", "session_key": "evil", "force": True, "email": "ua@example.com"}
        self.assertEqual(self.c.post("/api/users/sync/", body, format="json").status_code, 401)
        with patch("core.views.verified_uid", return_value="ub"):   # someone else's token
            self.assertEqual(self.c.post("/api/users/sync/", {**body, "id_token": "x"}, format="json").status_code, 401)
        self.assertFalse(UserSession.objects.filter(session_key="evil").exists())
        with patch("core.views.verified_uid", return_value="ua"):
            self.assertEqual(self.c.post("/api/users/sync/", {**body, "id_token": "x"}, format="json").status_code, 200)
        self.assertTrue(UserSession.objects.filter(user=self.a, session_key="evil").exists())

    @override_settings(ALLOW_UNVERIFIED_SIGNIN=True)
    def test_unverified_sign_in_only_when_allowed(self):
        r = self.c.post("/api/users/sync/", {"uid": "ua", "session_key": "dev", "email": "ua@example.com"}, format="json")
        self.assertEqual(r.status_code, 200)


class CollabAccessTests(TestCase):
    """Collab rooms: asking to join, kicking out, and the owner's settings after starting one"""

    def setUp(self):
        from .models import CollabRoom
        self.c = APIClient()
        for u in ("own", "bob", "eve"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")
            extend(p, months=1)   # subscribers: collab needs an active plan
        r = self.call("own", "rooms/", "post", {"name": "R", "symbol": "AAPL", "interval": "1D", "link_access": "restricted", "allow_requests": True})
        self.assertEqual(r.status_code, 201)
        self.token = r.json()["token"]
        self.room = CollabRoom.objects.get(token=self.token)

    def call(self, uid, path, method="get", body=None):
        url = f"/api/users/collab/{uid}/{path}{'&' if '?' in path else '?'}session_key=sk-{uid}"
        return getattr(self.c, method)(url, body, format="json") if body is not None else getattr(self.c, method)(url)

    def room_path(self, rest=""):
        return f"room/{self.token}/{rest}"

    def test_not_invited_can_ask_and_be_let_in(self):
        r = self.call("bob", self.room_path())
        self.assertEqual(r.status_code, 403)
        self.assertTrue(r.json()["not_invited"])
        self.assertTrue(r.json()["can_request"])
        self.assertIsNone(r.json()["request"])
        self.assertEqual(self.call("bob", self.room_path("request/"), "post", {}).status_code, 201)
        self.assertEqual(self.call("bob", self.room_path()).json()["request"], "pending")
        # The owner sees it, a stranger can't answer it
        self.assertEqual([q["uid"] for q in self.call("own", self.room_path()).json()["requests"]], ["bob"])
        self.assertEqual(self.call("eve", self.room_path("requests/bob/"), "post", {"action": "approve"}).status_code, 403)
        r = self.call("own", self.room_path("requests/bob/"), "post", {"action": "approve", "role": "viewer"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["requests"], [])
        got = self.call("bob", self.room_path())
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["role"], "viewer")

    def test_declined_and_requests_turned_off(self):
        self.call("bob", self.room_path("request/"), "post", {})
        self.call("own", self.room_path("requests/bob/"), "post", {"action": "decline"})
        self.assertEqual(self.call("bob", self.room_path()).json()["request"], "declined")
        self.call("own", self.room_path(), "patch", {"allow_requests": False})
        r = self.call("eve", self.room_path())
        self.assertFalse(r.json()["can_request"])
        self.assertEqual(self.call("eve", self.room_path("request/"), "post", {}).status_code, 403)

    def test_kicked_out_stays_out_until_added_again(self):
        self.call("own", self.room_path(), "patch", {"link_access": "edit"})
        self.assertEqual(self.call("bob", self.room_path()).status_code, 200)   # joins through the link
        self.assertEqual(self.call("own", self.room_path("member/bob/?kick=1"), "delete").status_code, 200)
        r = self.call("bob", self.room_path())
        self.assertEqual(r.status_code, 403)
        self.assertTrue(r.json()["kicked"])
        self.assertEqual(self.call("bob", self.room_path("request/"), "post", {}).status_code, 403)
        self.assertEqual([k["uid"] for k in self.call("own", self.room_path()).json()["kicked"]], ["bob"])
        self.call("own", self.room_path("kicked/bob/"), "delete")
        self.assertEqual(self.call("bob", self.room_path()).status_code, 200)

    def test_plain_remove_lets_them_back_through_the_link(self):
        self.call("own", self.room_path(), "patch", {"link_access": "view"})
        self.call("bob", self.room_path())
        self.call("own", self.room_path("member/bob/"), "delete")
        self.assertEqual(self.call("bob", self.room_path()).status_code, 200)

    def test_mics_for_everyone_and_for_some(self):
        self.call("own", self.room_path(), "patch", {"link_access": "edit"})
        self.call("bob", self.room_path())
        self.call("eve", self.room_path())
        r = self.call("own", self.room_path("members/"), "patch", {"uids": ["bob"], "can_voice": False})
        voice = {m["uid"]: m["perms"]["voice"] for m in r.json()["members"]}
        self.assertEqual(voice, {"own": True, "bob": False, "eve": True})
        r = self.call("own", self.room_path(), "patch", {"allow_voice": False})
        voice = {m["uid"]: m["perms"]["voice"] for m in r.json()["members"]}
        self.assertEqual(voice, {"own": True, "bob": False, "eve": False})
        r = self.call("own", self.room_path("members/"), "patch", {"uids": "all", "role": "viewer"})
        self.assertEqual({m["uid"]: m["role"] for m in r.json()["members"]}, {"own": "owner", "bob": "viewer", "eve": "viewer"})
        # Only the owner
        self.assertEqual(self.call("bob", self.room_path("members/"), "patch", {"uids": "all", "can_voice": True}).status_code, 403)


    def test_peek_reads_without_opening(self):
        from .models import CollabMember, CollabMessage
        bob = TraderProfile.objects.get(uid="bob")
        CollabMember.objects.create(room=self.room, profile=bob, role="viewer")
        before = CollabMessage.objects.count()
        r = self.call("bob", self.room_path() + "?peek=1")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["role"], "viewer")
        self.assertIsNone(CollabMember.objects.get(room=self.room, profile=bob).last_seen)   # still an unopened invite
        self.assertEqual(CollabMessage.objects.count(), before)                            # nobody told "Bob joined"
        self.assertEqual(self.call("eve", self.room_path() + "?peek=1").status_code, 403)

    def test_owner_deletes_with_a_summary_first(self):
        from .models import CollabMember, CollabMessage, CollabRoom
        self.room.drawings = {"AAPL": [{"id": "d1"}, {"id": "d2"}], "MSFT": [{"id": "d3"}]}
        self.room.indicators = [{"name": "EMA"}]
        self.room.alerts = [{"id": "a1"}]
        self.room.save()
        CollabMember.objects.create(room=self.room, profile=TraderProfile.objects.get(uid="bob"), role="editor")
        CollabMessage.objects.create(room=self.room, kind="text", text="hi")
        self.assertEqual(self.call("bob", self.room_path("summary/")).status_code, 403)
        s = self.call("own", self.room_path("summary/")).json()
        self.assertEqual((s["drawings"], s["drawing_symbols"], s["indicators"], s["alerts"], s["messages"], s["members"]), (3, 2, 1, 1, 1, 1))
        self.assertEqual(self.call("bob", self.room_path(), "delete").status_code, 403)   # only the owner
        r = self.call("own", self.room_path(), "delete")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(CollabRoom.objects.filter(token=self.token).exists())
        self.assertFalse(CollabMessage.objects.filter(text="hi").exists())
        self.assertEqual(self.call("own", "rooms/").json()["rooms"], [])
