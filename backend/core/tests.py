from django.test import TestCase
from rest_framework.test import APIClient

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


import base64
from pycrdt import Doc, Map, Text
from .collab import clean_pine
from .consumers import RoomState
from .models import CollabRoom


class ScriptLanguageTests(TestCase):
    """Scripts in Pine Script, Python or MQL5: saved with their language, and collabs carry it"""

    def setUp(self):
        self.a = TraderProfile.objects.create(uid="ua", name="A", email="ua@example.com")
        UserSession.objects.create(user=self.a, session_key="ska")
        self.c = APIClient()

    def post(self, url, body):
        return self.c.post(url, body, format="json", HTTP_X_SESSION_KEY="ska")

    @staticmethod
    def doc_of(b64):
        doc = Doc()
        doc.apply_update(base64.b64decode(b64))
        return str(doc.get('code', type=Text)), doc.get('meta', type=Map).to_py()

    def test_saved_script_keeps_its_language(self):
        url = "/api/users/pinescripts/ua/"
        sid = self.post(url, {"name": "Py", "code": "indicator('x')", "language": "python"}).json()["id"]
        self.post(url, {"name": "Plain", "code": "//@version=6"})
        got = {s["name"]: s["language"] for s in self.c.get(url, HTTP_X_SESSION_KEY="ska").json()}
        self.assertEqual(got, {"Py": "python", "Plain": "pine"})
        self.post(url, {"id": sid, "language": "mql5"})
        self.assertEqual(PineScript.objects.get(id=sid).language, "mql5")
        self.post(url, {"id": sid, "language": "javascript"})   # not one of the languages: unchanged
        self.assertEqual(PineScript.objects.get(id=sid).language, "mql5")

    def test_shared_script_language_is_cleaned(self):
        self.assertEqual(clean_pine({"code": "x", "language": "python"})["language"], "python")
        self.assertEqual(clean_pine({"code": "x", "language": "<script>"})["language"], "pine")
        self.assertEqual(clean_pine({"code": "x"})["language"], "pine")

    def test_script_only_collab_starts_in_the_scripts_language(self):
        code = "void OnTick() {}\n"
        r = self.post("/api/users/collab/ua/rooms/", {"kind": "pine", "pine": {"code": code, "scriptName": "EA", "language": "mql5"}})
        self.assertEqual(r.status_code, 201, r.content)
        room = CollabRoom.objects.get(token=r.json()["token"])
        self.assertEqual(self.doc_of(room.pine_doc), (code, {"language": "mql5"}))
        # The live room serves the same document
        self.assertEqual(self.doc_of(RoomState(room).pine_doc_state()), (code, {"language": "mql5"}))

    def test_chart_collab_runs_the_script_in_its_language(self):
        code = "indicator('Shared', overlay=True)\nplot(close)\n"
        r = self.post("/api/users/collab/ua/rooms/", {"symbol": "XAU/USD", "interval": "1h", "indicators": [], "drawings": [],
                                                     "pine": {"code": code, "scriptName": "Shared", "language": "python"}})
        self.assertEqual(r.status_code, 201, r.content)
        room = CollabRoom.objects.get(token=r.json()["token"])
        self.assertEqual(room.pine["language"], "python")
        state = RoomState(room)
        self.assertEqual(state.chart()["pine"]["language"], "python")
        self.assertEqual(self.doc_of(state.pine_doc_state()), (code, {"language": "python"}))

    def test_switching_language_is_an_ordinary_document_update(self):
        room_doc = Doc()
        room_doc.get('code', type=Text).insert(0, "x = 1")
        client = Doc()
        client.apply_update(room_doc.get_update())
        before = client.get_state()
        client.get('meta', type=Map)['language'] = 'python'
        room_doc.apply_update(client.get_update(before))   # what the consumer does with a pinedoc.update
        self.assertEqual(room_doc.get('meta', type=Map).to_py(), {"language": "python"})
