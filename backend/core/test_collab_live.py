"""The live side of collab access: what people connected to a room are told when someone asks to
join, when they're kicked out, and when the owner turns mics off."""
from asgiref.sync import sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from .models import CollabMember, CollabRoom, TraderProfile, UserSession
from .routing import websocket_urlpatterns


class CollabLiveTests(TransactionTestCase):
    def setUp(self):
        for u in ("own", "bob", "eve"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")
        self.room = CollabRoom.objects.create(token="tok", owner=TraderProfile.objects.get(uid="own"), name="R",
                                              symbol="AAPL", interval="1D", link_access="restricted")
        CollabMember.objects.create(room=self.room, profile=TraderProfile.objects.get(uid="own"), role="owner")
        CollabMember.objects.create(room=self.room, profile=TraderProfile.objects.get(uid="bob"), role="editor")
        self.api = APIClient()

    def call(self, uid, path, method="post", body=None):
        sep = "&" if "?" in path else "?"
        fn = getattr(self.api, method)
        return sync_to_async(fn)(f"/api/users/collab/{uid}/room/tok/{path}{sep}session_key=sk-{uid}", body or {}, format="json")

    async def connect(self, uid):
        ws = WebsocketCommunicator(URLRouter(websocket_urlpatterns), f"/ws/collab/tok/?uid={uid}&session_key=sk-{uid}")
        ok, _ = await ws.connect()
        self.assertTrue(ok)
        init = await ws.receive_json_from()
        self.assertEqual(init["type"], "init")
        return ws

    async def until(self, ws, kind, timeout=3):
        while True:
            msg = await ws.receive_json_from(timeout=timeout)
            if msg["type"] == kind:
                return msg

    async def test_owner_hears_a_request_to_join(self):
        own = await self.connect("own")
        bob = await self.connect("bob")
        await self.until(own, "peer.joined")
        r = await self.call("eve", "request/")
        self.assertEqual(r.status_code, 201)
        req = await self.until(own, "join.request")
        self.assertEqual(req["request"]["uid"], "eve")
        room = await self.until(own, "room")
        self.assertEqual([q["uid"] for q in room["room"]["requests"]], ["eve"])
        # An editor who can't add people isn't told
        while not await bob.receive_nothing(timeout=0.3):
            self.assertNotEqual((await bob.receive_json_from())["type"], "join.request")
        await own.disconnect()
        await bob.disconnect()

    async def test_kicked_out_is_told_and_disconnected(self):
        own = await self.connect("own")
        bob = await self.connect("bob")
        r = await self.call("own", "member/bob/?kick=1", "delete")
        self.assertEqual(r.status_code, 200)
        msg = await self.until(bob, "removed")
        self.assertTrue(msg["kicked"])
        await bob.disconnect()   # a browser answers the server's close; the test client has to be told
        left = await self.until(own, "peer.left")
        self.assertEqual(left["uid"], "bob")
        await own.disconnect()

    async def test_mic_turned_off_keeps_them_listening(self):
        own = await self.connect("own")
        bob = await self.connect("bob")
        await bob.send_json_to({"type": "voice", "voice": True, "muted": False})
        joined = await self.until(own, "peer.updated")
        self.assertTrue(joined["peer"]["voice"])
        self.assertFalse(joined["peer"]["muted"])
        await self.call("own", "", "patch", {"allow_voice": False})
        revoked = await self.until(bob, "voice.revoked")
        self.assertIn("mic", revoked["error"])
        upd = await self.until(own, "peer.updated")
        self.assertTrue(upd["peer"]["voice"])       # still in the call
        self.assertTrue(upd["peer"]["muted"])
        self.assertFalse(upd["peer"]["perms"]["voice"])
        # Unmuting without permission stays muted
        await bob.send_json_to({"type": "voice", "voice": True, "muted": False})
        upd = await self.until(own, "peer.updated")
        self.assertTrue(upd["peer"]["muted"])
        await own.disconnect()
        await bob.disconnect()

    async def test_private_messages_reach_only_their_two_people(self):
        await sync_to_async(CollabMember.objects.create)(room=self.room, profile=await sync_to_async(TraderProfile.objects.get)(uid="eve"), role="viewer")
        own = await self.connect("own")
        bob = await self.connect("bob")
        eve = await self.connect("eve")
        await own.send_json_to({"type": "chat", "text": "just between us", "to": "bob", "client_id": "c1"})
        got_own = await self.until(own, "chat")
        got_bob = await self.until(bob, "chat")
        self.assertEqual((got_own["message"]["to"], got_bob["message"]["to"]), ("bob", "bob"))
        self.assertEqual(got_bob["message"]["text"], "just between us")
        # Eve gets nothing of it
        while not await eve.receive_nothing(timeout=0.4):
            self.assertNotEqual((await eve.receive_json_from()).get("type"), "chat")
        # Group messages still reach everyone
        await bob.send_json_to({"type": "chat", "text": "hello all"})
        self.assertIsNone((await self.until(eve, "chat"))["message"]["to"])
        # Someone outside the collab can't be messaged
        await own.send_json_to({"type": "chat", "text": "x", "to": "nobody"})
        self.assertIn("only people in this collab", (await self.until(own, "error"))["error"])
        # History: the private one only for its two people
        for ws in (own, bob, eve):
            await ws.disconnect()
        eve2 = await self.connect_init("eve")
        self.assertEqual([m["text"] for m in eve2["messages"]], ["hello all"])
        bob2 = await self.connect_init("bob")
        self.assertEqual([m["text"] for m in bob2["messages"]], ["just between us", "hello all"])

    async def connect_init(self, uid):
        ws = WebsocketCommunicator(URLRouter(websocket_urlpatterns), f"/ws/collab/tok/?uid={uid}&session_key=sk-{uid}")
        ok, _ = await ws.connect()
        self.assertTrue(ok)
        init = await ws.receive_json_from()
        await ws.disconnect()
        return init
