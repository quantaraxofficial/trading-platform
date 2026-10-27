"""Group chats (the Chats panel): making one, admins, members, messages, files, theme, leaving"""
import base64
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import ChatGroup, ChatGroupMember, CollabMember, CollabRoom, TraderProfile, UserSession

TMP = tempfile.mkdtemp(prefix="chat-groups-test-")


@override_settings(COLLAB_FILES_ROOT=TMP)
class ChatGroupTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP, ignore_errors=True)

    def setUp(self):
        self.c = APIClient()
        for u in ("own", "bob", "eve", "zed"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")
        own = TraderProfile.objects.get(uid="own")
        room = CollabRoom.objects.create(token="tok", owner=own, name="R", symbol="AAPL", interval="1D")
        for u, role in (("own", "owner"), ("bob", "editor"), ("eve", "viewer")):
            CollabMember.objects.create(room=room, profile=TraderProfile.objects.get(uid=u), role=role)

    def api(self, uid, rest="", method="get", body=None, **kw):
        url = f"/api/users/collab/{uid}/groups/{rest}?session_key=sk-{uid}"
        return getattr(self.c, method)(url, body if body is not None else {}, format=kw.get("format", "json"))

    def make(self):
        r = self.api("own", method="post", body={"name": "Gold traders", "people": ["bob", "eve"]})
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["token"]

    def test_make_a_group_and_talk(self):
        self.assertEqual([p["uid"] for p in self.api("own", "contacts/").json()["people"]], ["bob", "eve"])
        # Only people from your collabs / groups
        self.assertEqual(self.api("own", method="post", body={"name": "x", "people": ["zed"]}).status_code, 400)
        tok = self.make()
        g = self.api("own", f"{tok}/").json()
        self.assertEqual(g["role"], "admin")
        self.assertEqual({m["uid"]: m["role"] for m in g["members"]}, {"own": "admin", "bob": "member", "eve": "member"})
        self.api("bob", f"{tok}/messages/", "post", {"text": "hello group"})
        lst = self.api("eve").json()
        self.assertEqual((lst["groups"][0]["name"], lst["unread"]), ("Gold traders", 2))   # the notice + bob's message
        self.assertEqual(self.api("eve", f"{tok}/").json()["messages"][-1]["text"], "hello group")
        self.assertEqual(self.api("eve").json()["unread"], 0)
        # Outsiders can't read it
        self.assertEqual(self.api("zed", f"{tok}/").status_code, 404)

    def test_admins_manage_members_name_theme(self):
        tok = self.make()
        self.assertEqual(self.api("bob", f"{tok}/", "patch", {"name": "Mine now"}).status_code, 403)
        self.assertEqual(self.api("own", f"{tok}/", "patch", {"name": "Gold desk"}).json()["name"], "Gold desk")
        png = "data:image/png;base64," + base64.b64encode(b"\x89PNG x").decode()
        t = self.api("own", f"{tok}/", "patch", {"theme": {"name": "Night", "background": "#101820", "font": "classic", "fontSize": 16, "imageDim": 30, "image": png}}).json()["theme"]
        self.assertEqual((t["font"], t["fontSize"], bool(t["image_v"])), ("classic", 16, True))
        img = self.c.get(f"/api/users/collab/eve/groups/{tok}/theme-image/?session_key=sk-eve")
        self.assertEqual((img.status_code, img.content), (200, b"\x89PNG x"))
        # Make bob an admin; he removes eve
        self.api("own", f"{tok}/members/bob/", "patch", {"role": "admin"})
        self.assertEqual(self.api("bob", f"{tok}/members/eve/", "delete").status_code, 200)
        self.assertFalse(ChatGroupMember.objects.filter(group__token=tok, profile__uid="eve").exists())
        # eve can't add herself back; an admin can add her
        self.assertEqual(self.api("eve", f"{tok}/").status_code, 404)
        self.api("bob", f"{tok}/members/", "post", {"people": ["eve"]})
        self.assertTrue(ChatGroupMember.objects.filter(group__token=tok, profile__uid="eve").exists())

    def test_leaving_hands_admin_on_and_last_one_out_deletes(self):
        tok = self.make()
        self.assertTrue(self.api("own", f"{tok}/members/own/", "delete").json()["left"])
        self.assertEqual(ChatGroupMember.objects.get(group__token=tok, profile__uid="bob").role, "admin")   # longest-standing
        self.api("bob", f"{tok}/members/bob/", "delete")
        self.api("eve", f"{tok}/members/eve/", "delete")
        self.assertFalse(ChatGroup.objects.filter(token=tok).exists())

    def test_files_and_delete(self):
        tok = self.make()
        f = SimpleUploadedFile("plan.pdf", b"%PDF-1.4 x", content_type="application/pdf")
        r = self.c.post(f"/api/users/collab/bob/groups/{tok}/upload/?session_key=sk-bob", {"file": f, "text": "read this"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        mid = r.json()["id"]
        self.assertEqual(self.c.get(f"/api/users/collab/eve/groups/{tok}/file/{mid}/?session_key=sk-eve").status_code, 200)
        self.assertEqual(self.c.get(f"/api/users/collab/zed/groups/{tok}/file/{mid}/?session_key=sk-zed").status_code, 404)
        self.assertEqual(self.api("bob", f"{tok}/", "delete").status_code, 403)   # only admins
        self.assertEqual(self.api("own", f"{tok}/", "delete").status_code, 200)
        self.assertFalse(ChatGroup.objects.filter(token=tok).exists())
