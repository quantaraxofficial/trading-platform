"""Pushing and pulling scripts with GitHub (GitHub's API is replaced by a fake here)"""
import base64
import json
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from .models import GitHubLink, PineScript, TraderProfile, UserSession


class FakeResponse:
    def __init__(self, code, body=None, headers=None):
        self.status_code, self._body, self.headers = code, body, headers or {}
        self.content = b"" if body is None else json.dumps(body).encode()

    def json(self):
        return self._body


class FakeGitHub:
    """Just enough of GitHub: one user, one repo with one branch, files by path"""

    def __init__(self):
        self.files = {"scripts/rsi.pine": ("//@version=6\nindicator('RSI')\nplot(ta.rsi(close, 14))\n", "sha1")}
        self.calls = []

    def __call__(self, method, url, headers=None, params=None, json=None, timeout=None):
        path = url.replace("https://api.github.com", "")
        self.calls.append((method, path, json))
        if headers.get("Authorization") != "Bearer good-token":
            return FakeResponse(401, {"message": "Bad credentials"})
        if path == "/user":
            return FakeResponse(200, {"login": "octo", "avatar_url": "https://a/x.png"})
        if path == "/user/repos":
            return FakeResponse(200, [{"full_name": "octo/strats", "private": True, "default_branch": "main", "permissions": {"push": True}}])
        if path == "/repos/octo/strats/branches":
            return FakeResponse(200, [{"name": "main"}])
        if path == "/repos/octo/strats/git/trees/main":
            return FakeResponse(200, {"tree": [{"path": p, "type": "blob", "size": len(c)} for p, (c, _) in self.files.items()] + [{"path": "README.md", "type": "blob"}]})
        if path.startswith("/repos/octo/strats/contents/"):
            fp = path[len("/repos/octo/strats/contents/"):]
            if method == "GET":
                if fp not in self.files:
                    return FakeResponse(404, {"message": "Not Found"})
                c, sha = self.files[fp]
                return FakeResponse(200, {"type": "file", "sha": sha, "size": len(c), "encoding": "base64", "content": base64.b64encode(c.encode()).decode()})
            if method == "PUT":
                current = self.files.get(fp)
                if current and json.get("sha") != current[1]:
                    return FakeResponse(409, {"message": f"{fp} does not match {json.get('sha')}"})
                new_sha = f"sha{len(self.calls)}"
                self.files[fp] = (base64.b64decode(json["content"]).decode(), new_sha)
                return FakeResponse(200, {"content": {"sha": new_sha, "html_url": f"https://github.com/octo/strats/blob/main/{fp}"},
                                          "commit": {"sha": "c0ffee", "html_url": "https://github.com/octo/strats/commit/c0ffee"}})
        return FakeResponse(404, {"message": "Not Found"})


class GitHubTests(TestCase):
    def setUp(self):
        self.me = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        UserSession.objects.create(user=self.me, session_key="sk1")
        TraderProfile.objects.create(uid="u2", name="B", email="b@example.com")
        UserSession.objects.create(user=TraderProfile.objects.get(uid="u2"), session_key="sk2")
        self.c = APIClient()
        self.fake = FakeGitHub()
        patcher = mock.patch("core.github.requests.request", side_effect=self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def call(self, endpoint, method="get", body=None, uid="u1", key="sk1", **params):
        url = f"/api/users/github/{uid}/{endpoint}"
        if method == "get":
            return self.c.get(url, {**params, "session_key": key})
        return getattr(self.c, method)(f"{url}?session_key={key}", body or {}, format="json")

    def connect(self):
        return self.call("account/", "post", {"token": "good-token"})

    def test_connect_keeps_the_token_secret(self):
        self.assertEqual(self.call("account/").json(), {"connected": False})
        self.assertEqual(self.call("account/", "post", {"token": "bad-token"}).status_code, 401)
        r = self.connect()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["login"], "octo")
        self.assertNotIn("good-token", r.content.decode())
        self.assertNotIn("good-token", GitHubLink.objects.get(owner=self.me).token)   # encrypted at rest
        self.assertNotIn("good-token", self.call("account/").content.decode())
        # Someone else's session can't use it
        self.assertEqual(self.call("repos/", key="sk2").status_code, 401)
        self.assertEqual(self.call("repos/", uid="u2", key="sk2").status_code, 400)
        self.call("account/", "delete")
        self.assertFalse(GitHubLink.objects.exists())

    def test_browse_and_pull(self):
        self.connect()
        self.assertEqual(self.call("repos/").json()["repos"][0]["full_name"], "octo/strats")
        self.assertEqual(self.call("branches/", repo="octo/strats").json()["branches"], ["main"])
        files = self.call("files/", repo="octo/strats", ref="main").json()["files"]
        self.assertEqual([f["path"] for f in files], ["scripts/rsi.pine"])   # scripts only
        f = self.call("file/", repo="octo/strats", ref="main", path="scripts/rsi.pine").json()
        self.assertIn("indicator('RSI')", f["content"])
        self.assertEqual(f["sha"], "sha1")
        self.assertEqual(self.call("file/", repo="../etc", ref="main", path="x").status_code, 400)
        self.assertEqual(self.call("file/", repo="octo/strats", ref="main", path="a/../b").status_code, 400)

    def test_push_new_then_update_then_conflict(self):
        self.connect()
        r = self.call("file/", "put", {"repo": "octo/strats", "branch": "main", "path": "py/ema.py", "content": "print(1)\n", "message": "Add EMA"})
        self.assertEqual(r.status_code, 200, r.content)
        sha = r.json()["sha"]
        self.assertEqual(self.fake.files["py/ema.py"][0], "print(1)\n")
        self.assertEqual(r.json()["commit"]["sha"], "c0ffee")
        # Update from the version pushed
        r = self.call("file/", "put", {"repo": "octo/strats", "branch": "main", "path": "py/ema.py", "content": "print(2)\n", "sha": sha})
        self.assertEqual(r.status_code, 200)
        # A stale version: changed on GitHub since
        r = self.call("file/", "put", {"repo": "octo/strats", "branch": "main", "path": "py/ema.py", "content": "print(3)\n", "sha": sha})
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.json()["changed"])
        self.assertEqual(self.fake.files["py/ema.py"][0], "print(2)\n")
        # Overwrite on purpose
        r = self.call("file/", "put", {"repo": "octo/strats", "branch": "main", "path": "py/ema.py", "content": "print(3)\n", "force": True})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.fake.files["py/ema.py"][0], "print(3)\n")

    def test_unlinked_push_onto_an_existing_file_asks_first(self):
        self.connect()
        r = self.call("file/", "put", {"repo": "octo/strats", "branch": "main", "path": "scripts/rsi.pine", "content": "x"})
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.json()["exists"])
        self.assertIn("RSI", self.fake.files["scripts/rsi.pine"][0])

    def test_saved_script_remembers_its_link(self):
        link = {"repo": "octo/strats", "branch": "main", "path": "scripts/rsi.pine", "sha": "sha1"}
        r = self.c.post("/api/users/pinescripts/u1/?session_key=sk1", {"name": "RSI", "code": "x", "github": link}, format="json")
        sid = r.json()["id"]
        self.assertEqual(PineScript.objects.get(id=sid).github, link)
        got = self.c.get("/api/users/pinescripts/u1/?session_key=sk1").json()
        self.assertEqual(got[0]["github"], link)
        self.c.post("/api/users/pinescripts/u1/?session_key=sk1", {"id": sid, "github": None}, format="json")
        self.assertEqual(PineScript.objects.get(id=sid).github, {})
