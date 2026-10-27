"""Images and documents shared in a collab's chat: who can share and fetch them, what's accepted"""
import io
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from .models import CollabMember, CollabMessage, CollabRoom, TraderProfile, UserSession

TMP = tempfile.mkdtemp(prefix="collab-files-test-")


def png_bytes(w=40, h=30):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (255, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


@override_settings(COLLAB_FILES_ROOT=TMP)
class CollabFileTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP, ignore_errors=True)

    def setUp(self):
        self.c = APIClient()
        for u in ("own", "bob", "eve"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")
        own = TraderProfile.objects.get(uid="own")
        self.room = CollabRoom.objects.create(token="tok", owner=own, name="R", symbol="AAPL", interval="1D")
        CollabMember.objects.create(room=self.room, profile=own, role="owner")
        CollabMember.objects.create(room=self.room, profile=TraderProfile.objects.get(uid="bob"), role="viewer")

    def upload(self, uid, name, data, content_type="application/octet-stream", text=""):
        f = SimpleUploadedFile(name, data, content_type=content_type)
        return self.c.post(f"/api/users/collab/{uid}/room/tok/upload/?session_key=sk-{uid}", {"file": f, "text": text}, format="multipart")

    def fetch(self, uid, msg_id, extra=""):
        return self.c.get(f"/api/users/collab/{uid}/room/tok/file/{msg_id}/?session_key=sk-{uid}{extra}")

    def test_share_a_picture(self):
        r = self.upload("bob", "chart shot.png", png_bytes(), "image/png", text="look at this")   # viewers can share too
        self.assertEqual(r.status_code, 201, r.content)
        m = r.json()
        self.assertEqual(m["kind"], "file")
        self.assertEqual(m["text"], "look at this")
        self.assertEqual(m["attachment"], {"name": "chart shot.png", "size": len(png_bytes()), "type": "image/png", "image": True, "width": 40, "height": 30})
        got = self.fetch("own", m["id"])
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got["Content-Type"], "image/png")
        self.assertNotIn("attachment", got.get("Content-Disposition", ""))
        self.assertEqual(got["X-Content-Type-Options"], "nosniff")
        self.assertEqual(b"".join(got.streaming_content), png_bytes())
        self.assertIn("attachment", self.fetch("own", m["id"], "&download=1")["Content-Disposition"])

    def test_share_a_document(self):
        r = self.upload("own", "plan.pdf", b"%PDF-1.4 test", "application/pdf")
        self.assertEqual(r.status_code, 201)
        got = self.fetch("bob", r.json()["id"])
        self.assertIn('attachment; filename="plan.pdf"', got["Content-Disposition"])
        self.assertEqual(got["Content-Type"], "application/pdf")

    def test_only_people_in_the_collab(self):
        self.assertEqual(self.upload("eve", "x.png", png_bytes(), "image/png").status_code, 403)
        mid = self.upload("own", "x.png", png_bytes(), "image/png").json()["id"]
        self.assertEqual(self.fetch("eve", mid).status_code, 403)
        self.assertEqual(self.c.get(f"/api/users/collab/own/room/tok/file/{mid}/").status_code, 401)

    def test_what_is_refused(self):
        for name in ("evil.html", "evil.svg", "run.exe", "page.js", "noext"):
            self.assertEqual(self.upload("own", name, b"<script>alert(1)</script>").status_code, 400, name)
        # A "picture" that isn't one
        self.assertEqual(self.upload("own", "fake.png", b"<html>not a picture</html>", "image/png").status_code, 400)
        from . import collab_files
        old = collab_files.MAX_FILE_BYTES
        collab_files.MAX_FILE_BYTES = 10
        try:
            self.assertEqual(self.upload("own", "big.txt", b"x" * 11, "text/plain").status_code, 400)
        finally:
            collab_files.MAX_FILE_BYTES = old
        self.assertFalse(CollabMessage.objects.filter(kind="file").exists())

    def test_names_are_cleaned_and_files_go_with_their_message(self):
        r = self.upload("own", "..\\..\\secret plan.txt", b"hello", "text/plain")
        self.assertEqual(r.json()["attachment"]["name"], "secret plan.txt")
        msg = CollabMessage.objects.get(id=r.json()["id"])
        from .collab_files import storage
        self.assertTrue(storage().exists(msg.attachment["path"]))
        msg.delete()
        self.assertFalse(storage().exists(msg.attachment["path"]))


class VoiceMessageTests(CollabFileTests):
    """Voice messages: audio accepted (and checked), its length kept, played in the page"""

    def test_voice_message(self):
        webm = b"\x1aE\xdf\xa3" + b"\x00" * 60
        f = SimpleUploadedFile("voice-message-1.webm", webm, content_type="audio/webm")
        r = self.c.post("/api/users/collab/own/room/tok/upload/?session_key=sk-own", {"file": f, "duration": "7.4"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)
        a = r.json()["attachment"]
        self.assertEqual((a["audio"], a["duration"], a["type"]), (True, 7.4, "audio/webm"))
        got = self.fetch("bob", r.json()["id"])
        self.assertEqual(got["Content-Type"], "audio/webm")
        self.assertNotIn("attachment", got.get("Content-Disposition", ""))   # plays in the page
        # Something that isn't audio, named as audio
        f2 = SimpleUploadedFile("fake.webm", b"<html>no</html>", content_type="audio/webm")
        self.assertEqual(self.c.post("/api/users/collab/own/room/tok/upload/?session_key=sk-own", {"file": f2}, format="multipart").status_code, 400)
