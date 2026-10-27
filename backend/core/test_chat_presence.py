"""Read receipts, typing and last seen, and the privacy choices that hide them (both ways)"""
from django.test import TestCase
from rest_framework.test import APIClient

from .models import ChatGroup, CollabMember, CollabRoom, TraderProfile, UserSession


class PresenceTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        for u in ("own", "bob", "eve"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")
        own = TraderProfile.objects.get(uid="own")
        room = CollabRoom.objects.create(token="tok", owner=own, name="R", symbol="AAPL", interval="1D")
        for u in ("own", "bob", "eve"):
            CollabMember.objects.create(room=room, profile=TraderProfile.objects.get(uid=u), role="owner" if u == "own" else "editor")

    def api(self, uid, rest, method="get", body=None):
        return getattr(self.c, method)(f"/api/users/collab/{uid}/{rest}?session_key=sk-{uid}", body or {}, format="json")

    def test_private_chat_read_typing_last_seen(self):
        self.api("own", "dms/tok/bob/", "post", {"text": "hi"})
        t = self.api("own", "dms/tok/bob/").json()
        self.assertIs(t["messages"][0]["read"], False)
        self.assertEqual(t["presence"]["online"], False)          # bob hasn't been here
        self.api("bob", "presence/", "post", {"typing": t["key"]})
        self.api("bob", "dms/tok/own/")                              # bob reads it
        t = self.api("own", "dms/tok/bob/").json()
        self.assertIs(t["messages"][0]["read"], True)
        self.assertTrue(t["presence"]["online"])
        self.assertTrue(t["presence"]["typing"])
        # Bob turns everything off: own sees none of it
        self.api("bob", "chat-privacy/", "patch", {"read_receipts": False, "show_typing": False, "show_last_seen": False})
        self.api("bob", "presence/", "post", {"typing": t["key"]})
        t = self.api("own", "dms/tok/bob/").json()
        self.assertIsNone(t["messages"][0]["read"])
        self.assertFalse(t["presence"]["typing"])
        self.assertTrue(t["presence"]["hidden"])
        # ... and bob doesn't see own's either (both ways)
        self.api("own", "presence/", "post", {})
        self.assertTrue(self.api("bob", "dms/tok/own/").json()["presence"]["hidden"])

    def test_group_seen_by_and_typing(self):
        tok = self.api("own", "groups/", "post", {"name": "G", "people": ["bob", "eve"]}).json()["token"]
        self.api("own", f"groups/{tok}/messages/", "post", {"text": "read me"})
        self.api("bob", f"groups/{tok}/")                            # bob reads it
        self.api("eve", "chat-privacy/", "patch", {"read_receipts": False})
        self.api("eve", f"groups/{tok}/")                            # eve reads it, privately
        self.api("bob", "presence/", "post", {"typing": f"group:{tok}"})
        g = self.api("own", f"groups/{tok}/").json()
        mine = [m for m in g["messages"] if m["text"] == "read me"][0]
        self.assertEqual(mine["read_by"], ["bob"])
        self.assertEqual(g["typing"], ["Bob"])
        self.assertTrue(g["presence"]["bob"]["online"])

    def test_privacy_settings_round_trip(self):
        self.assertEqual(self.api("own", "chat-privacy/").json(), {"read_receipts": True, "show_typing": True, "show_last_seen": True})
        self.assertEqual(self.api("own", "chat-privacy/", "patch", {"show_last_seen": False}).json()["show_last_seen"], False)
        self.assertEqual(self.api("bob", "chat-privacy/").json()["show_last_seen"], True)
