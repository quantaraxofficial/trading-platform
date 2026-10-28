"""People search, profiles (what they show, privacy), follow + notifications, one-to-one chats,
collab invites from a profile, and publishing scripts publicly / privately"""
from django.test import TestCase
from rest_framework.test import APIClient

from .models import BacktestRun, ChatGroupMember, CollabMember, CollabRoom, Follow, Notification, PublishedScript, TraderProfile, UserSession

CODE = "//@version=5\nindicator('My RSI')\nplot(ta.rsi(close, 14))\n"


class SocialTests(TestCase):
    def setUp(self):
        self.c = APIClient()
        for uid, name in (("asha", "Asha Rao"), ("ben", "Ben Cole"), ("cara", "Cara Diaz"), ("asha2", "Asha Rao")):
            p = TraderProfile.objects.create(uid=uid, name=name, email=f"{uid}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{uid}")

    def api(self, uid, rest, method="get", body=None, query=""):
        return getattr(self.c, method)(f"/api/users/social/{uid}/{rest}?session_key=sk-{uid}{query}", body or {}, format="json")

    def test_search_and_usernames(self):
        r = self.api("ben", "search/", query="&q=asha").json()["people"]
        self.assertEqual(sorted(p["username"] for p in r), ["asha_rao", "asha_rao2"])   # made from their names, unique
        self.assertNotIn("email", r[0])
        self.assertNotIn("uid", r[0])
        self.assertEqual(self.api("ben", "search/", query="&q=@asha_rao2").json()["people"][0]["name"], "Asha Rao")
        self.assertEqual(self.api("asha", "me/", "patch", {"username": "Asha_Trades"}).status_code, 200)
        self.assertEqual(self.api("ben", "me/", "patch", {"username": "asha_trades"}).status_code, 409)   # taken
        self.assertEqual(self.api("ben", "me/", "patch", {"username": "a!"}).status_code, 400)
        self.assertEqual(self.api("ben", "people/asha_trades/", ).json()["profile"]["name"], "Asha Rao")

    def test_profile_shows_only_what_they_turned_on(self):
        asha = TraderProfile.objects.get(uid="asha")
        BacktestRun.objects.create(owner=asha, name="SMA", symbol="XAU/USD", timeframe="1h", initial_capital=10000, net_profit=500, trade_count=12, trades=[])
        self.api("asha", "me/stats/", "put", {"label": "Paper Trading", "metrics": {"totalPnl": 1234.5, "winRate": 61.2, "bad": "x"}, "equity": [[1, 100], [2, "nope"]]})
        self.api("asha", "me/", "patch", {"username": "asha"})
        p = self.api("ben", "people/asha/").json()["profile"]
        self.assertNotIn("stats", p)
        self.assertNotIn("backtests", p)
        self.api("asha", "me/", "patch", {"show_trading_stats": True, "show_backtests": True})
        p = self.api("ben", "people/asha/").json()["profile"]
        self.assertEqual(p["stats"]["metrics"], {"totalPnl": 1234.5, "winRate": 61.2})
        self.assertEqual(p["stats"]["equity"], [[1, 100.0]])
        self.assertEqual((p["backtests"]["items"][0]["name"], p["backtests"]["items"][0]["return_pct"]), ("SMA", 5.0))
        self.assertNotIn("sessions", p)
        own = self.api("asha", "people/asha/").json()["profile"]
        self.assertIn("sessions", own)   # you always see your own (marked whether it's shown)

    def test_follow_and_publish_notifications(self):
        self.api("asha", "me/", "patch", {"username": "asha"})
        self.api("ben", "me/", "patch", {"username": "ben"})
        self.api("cara", "me/", "patch", {"username": "cara"})
        self.assertTrue(self.api("ben", "people/asha/follow/", "post").json()["i_follow"])
        self.assertEqual(self.api("asha", "notifications/").json()["items"][0]["text"], "Ben Cole started following you")
        # A public indicator: followers are told, everyone finds it with its author
        r = self.api("asha", "scripts/publish/", "post", {"source_key": "s1", "name": "My RSI", "kind": "indicator", "code": CODE, "description": "RSI", "visibility": "public"})
        self.assertEqual(r.status_code, 201, r.content)
        sid = r.json()["script"]["id"]
        n = self.api("ben", "notifications/").json()
        self.assertEqual((n["unread"], n["items"][0]["text"], n["items"][0]["data"]["script"]), (1, "Asha Rao published a new indicator: My RSI", sid))
        self.assertEqual(self.api("cara", "notifications/").json()["unread"], 0)   # cara doesn't follow her
        found = self.api("cara", "scripts/", query="&q=rsi&kind=indicator").json()["scripts"]
        self.assertEqual((found[0]["name"], found[0]["author"]["username"]), ("My RSI", "asha"))
        self.assertIsNone(found[0]["source_key"])
        self.assertEqual(self.api("cara", f"scripts/{sid}/", query="&use=1").json()["script"]["code"], CODE)
        self.assertEqual(PublishedScript.objects.get().uses, 1)
        # Republishing: a new version, and followers hear of it too
        r = self.api("asha", "scripts/publish/", "post", {"source_key": "s1", "name": "My RSI", "kind": "indicator", "code": CODE + "//v2", "visibility": "public"})
        self.assertEqual(r.json()["script"]["version"], 2)
        n = self.api("ben", "notifications/").json()
        self.assertEqual((n["unread"], n["items"][0]["text"], n["items"][0]["data"]["version"]), (2, "Asha Rao published version 2 of the indicator My RSI", 2))
        self.api("ben", "notifications/", "post")
        self.assertEqual(self.api("ben", "notifications/").json()["unread"], 0)
        # A private strategy shared with cara only
        r = self.api("asha", "scripts/publish/", "post", {"source_key": "s2", "name": "Secret edge", "kind": "strategy", "code": CODE, "visibility": "private", "invite": ["cara"]})
        pid = r.json()["script"]["id"]
        self.assertEqual(self.api("cara", "notifications/").json()["items"][0]["text"], "Asha Rao shared the private strategy Secret edge with you")
        self.assertEqual(self.api("ben", "notifications/").json()["unread"], 0)            # followers aren't told of a private one
        self.assertEqual(self.api("ben", f"scripts/{pid}/").status_code, 404)
        self.assertEqual(self.api("cara", f"scripts/{pid}/").status_code, 200)
        self.assertEqual([s["name"] for s in self.api("cara", "scripts/", query="&scope=shared").json()["scripts"]], ["Secret edge"])
        self.assertEqual([s["name"] for s in self.api("ben", "people/asha/").json()["profile"]["scripts"]], ["My RSI"])
        self.assertEqual(len(self.api("cara", "people/asha/").json()["profile"]["scripts"]), 2)
        self.assertEqual([s["name"] for s in self.api("ben", "scripts/", query="&scope=following").json()["scripts"]], ["My RSI"])
        # A new version of the private one: cara (invited) hears of it, ben doesn't
        self.api("asha", "scripts/publish/", "post", {"source_key": "s2", "name": "Secret edge", "kind": "strategy", "code": CODE + "//2", "visibility": "private", "invite": ["cara"]})
        self.assertEqual(self.api("cara", "notifications/").json()["items"][0]["text"], "Asha Rao published version 2 of the private strategy Secret edge")
        self.assertEqual(self.api("ben", "notifications/").json()["unread"], 0)
        # Made public later: followers are told then
        self.api("asha", f"scripts/{pid}/", "patch", {"visibility": "public"})
        self.assertEqual(self.api("ben", "notifications/").json()["items"][0]["text"], "Asha Rao published a new strategy: Secret edge")
        self.assertEqual(self.api("ben", f"scripts/{pid}/", "delete").status_code, 403)
        self.api("ben", "people/asha/follow/", "delete")
        self.assertFalse(Follow.objects.exists())

    def test_message_and_invite_follow_privacy(self):
        self.api("asha", "me/", "patch", {"username": "asha", "allow_messages": "following", "allow_invites": "nobody"})
        self.api("ben", "me/", "patch", {"username": "ben"})
        self.assertEqual(self.api("ben", "people/asha/message/", "post").status_code, 403)   # she only takes messages from people she follows
        self.api("asha", "people/ben/follow/", "post")
        t1 = self.api("ben", "people/asha/message/", "post").json()["token"]
        t2 = self.api("asha", "people/ben/message/", "post").json()["token"]
        self.assertEqual(t1, t2)   # one conversation between them
        self.assertEqual(ChatGroupMember.objects.filter(group__token=t1).count(), 2)
        # Invites: asha takes none; ben does
        ben = TraderProfile.objects.get(uid="ben")
        room = CollabRoom.objects.create(token="room1", owner=TraderProfile.objects.get(uid="asha"), name="Gold desk")
        CollabMember.objects.create(room=room, profile=room.owner, role="owner")
        self.assertEqual(self.api("ben", "people/asha/invite/").json()["allowed"], False)
        opts = self.api("asha", "people/ben/invite/").json()
        self.assertEqual([c["name"] for c in opts["collabs"]], ["Gold desk"])
        r = self.api("asha", "people/ben/invite/", "post", {"token": "room1", "role": "editor"})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(CollabMember.objects.get(room=room, profile=ben).role, "editor")
        self.assertEqual(Notification.objects.filter(recipient=ben, kind="invite").count(), 1)
        self.assertEqual(self.api("asha", "people/ben/invite/", "post", {"token": "room1"}).status_code, 409)
        self.assertEqual(self.api("ben", "people/asha/invite/", "post", {"token": "room1"}).status_code, 403)

    def test_hidden_code(self):
        for u in ("asha", "ben", "cara"):
            self.api(u, "me/", "patch", {"username": u})
        compiled = {"format": "pine-ast-1", "stmts": [{"type": "expr", "line": 2, "expr": {"type": "call", "name": "plot", "args": [], "namedArgs": {}, "id": 0}}], "meta": {"title": "Edge"}}
        r = self.api("asha", "scripts/publish/", "post", {"source_key": "h1", "name": "Edge", "kind": "indicator", "code": CODE, "visibility": "public",
                                                          "code_access": "hidden", "compiled": compiled})
        self.assertEqual(r.status_code, 201, r.content)
        sid = r.json()["script"]["id"]
        got = self.api("ben", f"scripts/{sid}/").json()["script"]
        self.assertEqual((got["code_access"], got["can_view_code"], "code" in got, got["compiled"]), ("hidden", False, False, compiled))   # usable, code never sent
        mine = self.api("asha", f"scripts/{sid}/").json()["script"]
        self.assertEqual((mine["code"], "compiled" in mine), (CODE, False))                                                            # the author gets the code
        # Only allowed people: cara may read it, ben still may not
        self.api("asha", f"scripts/{sid}/", "patch", {"code_access": "allowed", "code_viewers": ["@cara"]})
        self.assertEqual(self.api("cara", f"scripts/{sid}/").json()["script"]["code"], CODE)
        self.assertNotIn("code", self.api("ben", f"scripts/{sid}/").json()["script"])
        self.assertEqual([p["username"] for p in self.api("asha", f"scripts/{sid}/").json()["script"]["code_viewers"]], ["cara"])
        self.api("asha", f"scripts/{sid}/", "patch", {"code_access": "open"})
        self.assertEqual(self.api("ben", f"scripts/{sid}/").json()["script"]["code"], CODE)
        # Hidden needs a compiled Pine script; MQL5 / Python can't hide; a bad compiled form is refused
        self.assertEqual(self.api("asha", "scripts/publish/", "post", {"source_key": "h2", "name": "X", "code": CODE, "code_access": "hidden"}).status_code, 400)
        self.assertEqual(self.api("asha", "scripts/publish/", "post", {"source_key": "py", "name": "Py", "language": "python", "code": "x=1", "code_access": "hidden", "compiled": compiled}).status_code, 400)
        self.assertEqual(self.api("asha", "scripts/publish/", "post", {"source_key": "mq", "name": "Mq", "language": "mql5", "code": "x", "code_access": "hidden", "compiled": compiled}).status_code, 400)
        self.assertEqual(self.api("asha", "scripts/publish/", "post", {"source_key": "h3", "name": "X", "code": CODE, "compiled": {"format": "js", "stmts": []}}).status_code, 400)
        py = self.api("asha", "scripts/publish/", "post", {"source_key": "py2", "name": "Py", "language": "python", "code": "x=1"}).json()["script"]["id"]
        self.assertEqual(self.api("asha", f"scripts/{py}/", "patch", {"code_access": "hidden"}).status_code, 400)
