"""A copy channel's signals posted to Telegram, Discord, WhatsApp and chats here (copy_share.py), with
every platform faked: connecting (checked with the platform), what's posted, replies on Telegram,
WhatsApp templates, failures kept per connection, and the tokens never sent back."""
import json
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import copy_share
from .models import (ChatGroup, ChatGroupMember, ChatGroupMessage, CollabMember, CollabMessage, CollabRoom, CopyChannel, CopyConnection,
                     CopyPost, TraderProfile, UserSession)

TG_TOKEN = "123456789:AAH" + "x" * 32
HOOK = "https://discord.com/api/webhooks/1234567890/abcDEF_-token"


class FakeNet:
    """requests.get / requests.post for the three platforms; remembers every call"""
    def __init__(self):
        self.calls = []
        self.tg_next = 100
        self.fail = {}   # url part → (status, json)

    def _resp(self, code, data):
        r = mock.Mock()
        r.status_code = code
        r.json.return_value = data
        return r

    def __call__(self, method, url, json=None, headers=None, timeout=None):
        self.calls.append({"method": method, "url": url, "json": json, "headers": headers})
        for part, (code, data) in self.fail.items():
            if part in url:
                return self._resp(code, data)
        if "api.telegram.org" in url:
            m = url.rsplit("/", 1)[-1]
            if m == "getMe":
                return self._resp(200, {"ok": True, "result": {"username": "signals_bot"}})
            if m == "getChat":
                return self._resp(200, {"ok": True, "result": {"id": -1001234567890, "title": "Gold Calls"}})
            self.tg_next += 1
            return self._resp(200, {"ok": True, "result": {"message_id": self.tg_next}})
        if "discord.com" in url:
            if method == "get":
                return self._resp(200, {"name": "Signals hook", "channel_id": "555"})
            return self._resp(200, {"id": "9001"})
        if "graph.facebook.com" in url:
            if method == "get":
                return self._resp(200, {"verified_name": "Gold Desk", "display_phone_number": "+91 98765 43210"})
            return self._resp(200, {"messages": [{"id": "wamid.1"}]})
        raise AssertionError(url)

    def sent(self, part):
        return [c for c in self.calls if c["method"] == "post" and part in c["url"]]


@override_settings(COPY_SHARE_SYNC=True)
class CopyShareTests(TestCase):
    def setUp(self):
        self.net = FakeNet()
        p1 = mock.patch("core.copy_share.requests.post", lambda url, **kw: self.net("post", url, **kw))
        p2 = mock.patch("core.copy_share.requests.get", lambda url, **kw: self.net("get", url, **kw))
        p1.start(); p2.start()
        self.addCleanup(p1.stop); self.addCleanup(p2.stop)
        self.c = APIClient()
        for u in ("own", "bob"):
            p = TraderProfile.objects.create(uid=u, name=u.title(), email=f"{u}@example.com")
            UserSession.objects.create(user=p, session_key=f"sk-{u}")
        self.own = TraderProfile.objects.get(uid="own")
        self.bob = TraderProfile.objects.get(uid="bob")
        self.ch = CopyChannel.objects.create(owner=self.own, name="Gold *Calls*", code="GOLD2345", default_risk=1.0)

    def api(self, uid, rest, method="post", body=None):
        return getattr(self.c, method)(f"/api/users/copy/{uid}/{rest}?session_key=sk-{uid}", body or {}, format="json")

    def connect(self, body):
        r = self.api("own", f"channels/{self.ch.id}/connections/", body=body)
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["connection"]

    def signal(self, body):
        r = self.api("own", f"channels/{self.ch.id}/signals/", body=body)
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["signal"]

    # ---- connecting

    def test_connect_checks_with_each_platform(self):
        tg = self.connect({"kind": "telegram", "token": TG_TOKEN, "chat": "https://t.me/goldcalls"})
        self.assertEqual(tg["label"], "Gold Calls (via @signals_bot)")
        self.assertEqual(tg["target"], "-1001234567890")
        getchat = [c for c in self.net.calls if c["url"].endswith("getChat")][0]
        self.assertEqual(getchat["json"]["chat_id"], "@goldcalls")
        dc = self.connect({"kind": "discord", "webhook": HOOK})
        self.assertEqual(dc["label"], "Webhook “Signals hook”")
        wa = self.connect({"kind": "whatsapp", "number_id": "1098765", "token": "EAAG-token", "recipients": "+91 98765 43210, 447700900123"})
        self.assertEqual(wa["recipients"], ["919876543210", "447700900123"])
        self.assertEqual(wa["label"], "Gold Desk (+91 98765 43210)")
        # The tokens are kept encrypted and never come back
        listed = json.dumps(self.api("own", f"channels/{self.ch.id}/connections/", "get").json())
        for secret in (TG_TOKEN, "abcDEF_-token", "EAAG-token"):
            self.assertNotIn(secret, listed)
            self.assertFalse(CopyConnection.objects.filter(secret__contains=secret).exists())
        self.assertEqual(copy_share.unseal(CopyConnection.objects.get(kind="telegram").secret)["token"], TG_TOKEN)

    def test_bad_input_is_refused(self):
        bad = [({"kind": "telegram", "token": "nope", "chat": "@goldcalls"}, "bot token"),
               ({"kind": "telegram", "token": TG_TOKEN, "chat": "gold calls"}, "@name"),
               ({"kind": "discord", "webhook": "https://evil.example/api/webhooks/1/x"}, "webhook URL"),
               ({"kind": "whatsapp", "number_id": "1", "token": "t", "recipients": "12345"}, "country code"),
               ({"kind": "group", "token": "nope"}, "not in that chat"),
               ({"kind": "sms"}, "Connect")]
        for body, says in bad:
            r = self.api("own", f"channels/{self.ch.id}/connections/", body=body)
            self.assertEqual(r.status_code, 400, body)
            self.assertIn(says, r.json()["error"])
        self.assertFalse([c for c in self.net.calls if "evil" in c["url"]])
        self.net.fail["getChat"] = (400, {"ok": False, "description": "Bad Request: chat not found"})
        r = self.api("own", f"channels/{self.ch.id}/connections/", body={"kind": "telegram", "token": TG_TOKEN, "chat": "@goldcalls"})
        self.assertIn("add the bot to it", r.json()["error"])
        # Someone else's channel
        r = self.api("bob", f"channels/{self.ch.id}/connections/", body={"kind": "discord", "webhook": HOOK})
        self.assertEqual(r.status_code, 404)

    # ---- posting

    def test_signals_go_out_everywhere(self):
        self.connect({"kind": "telegram", "token": TG_TOKEN, "chat": "@goldcalls"})
        self.connect({"kind": "discord", "webhook": HOOK, "show_code": True})
        self.connect({"kind": "whatsapp", "number_id": "1098765", "token": "EAAG-token", "recipients": "919876543210", "template": "trade_signal", "language": "en"})
        s = self.signal({"kind": "open", "symbol": "XAUUSD", "side": "buy", "sl": 2340, "tp": 2370.5, "risk_percent": 1.5})
        tg = self.net.sent("sendMessage")[-1]["json"]
        self.assertEqual(tg["parse_mode"], "HTML")
        self.assertIn("🟢 <b>BUY XAUUSD</b>", tg["text"])
        self.assertIn("SL 2340 · TP 2370.5", tg["text"])
        self.assertIn("Risk 1.5% of equity", tg["text"])
        self.assertNotIn("join code", tg["text"])
        dc = self.net.sent("discord.com")[-1]
        self.assertTrue(dc["url"].endswith("?wait=true"))
        self.assertIn("**BUY XAUUSD**", dc["json"]["content"])
        self.assertIn(r"Gold \*Calls\*", dc["json"]["content"])
        self.assertIn("join code **GOLD2345**", dc["json"]["content"])
        self.assertEqual(dc["json"]["allowed_mentions"], {"parse": []})
        wa = self.net.sent("graph.facebook.com")[-1]["json"]
        self.assertEqual(wa["type"], "template")
        self.assertEqual(wa["template"]["name"], "trade_signal")
        param = wa["template"]["components"][0]["parameters"][0]["text"]
        self.assertNotIn("\n", param)
        self.assertIn("*BUY XAUUSD* · Entry market", param)
        self.assertEqual(self.net.sent("graph.facebook.com")[-1]["headers"]["Authorization"], "Bearer EAAG-token")
        self.assertEqual(CopyPost.objects.filter(signal_id=s["id"], ok=True).count(), 3)
        # A stop move and a partial close: replies to the trade's first post on Telegram
        first_id = int(CopyPost.objects.get(signal_id=s["id"], connection__kind="telegram").external_id)
        self.signal({"kind": "modify", "ref": s["ref"], "sl": 2350, "tp": 2380})
        tg = self.net.sent("sendMessage")[-1]["json"]
        self.assertIn("stops moved", tg["text"])
        self.assertIn("XAUUSD BUY", tg["text"])
        self.assertEqual(tg["reply_parameters"]["message_id"], first_id)
        self.signal({"kind": "close", "ref": s["ref"], "fraction": 0.5})
        self.assertIn("🔸 <b>50% closed</b> XAUUSD BUY", self.net.sent("sendMessage")[-1]["json"]["text"])
        self.signal({"kind": "close", "ref": s["ref"]})
        self.assertIn("✅ <b>Closed</b> XAUUSD BUY", self.net.sent("sendMessage")[-1]["json"]["text"])
        # The channel's signals show what was posted
        sigs = self.api("own", f"channels/{self.ch.id}/", "get").json()["channel"]["signals"]
        self.assertEqual([(x["posted"], x["post_failed"]) for x in sigs], [(3, 0)] * 4)

    def test_choices_and_failures(self):
        tg = self.connect({"kind": "telegram", "token": TG_TOKEN, "chat": "@goldcalls"})
        dc = self.connect({"kind": "discord", "webhook": HOOK})
        self.api("own", f"channels/{self.ch.id}/connections/{dc['id']}/", "patch", {"post_modify": False})
        s = self.signal({"kind": "open", "symbol": "EURUSD", "side": "sell", "sl": 1.0912})
        n = len(self.net.sent("discord.com"))
        self.signal({"kind": "modify", "ref": s["ref"], "sl": 1.09})
        self.assertEqual(len(self.net.sent("discord.com")), n)   # Discord doesn't take stop moves now
        # Telegram refusing: kept as failed, Discord still posted
        self.net.fail["sendMessage"] = (403, {"ok": False, "description": "Forbidden: bot is not a member of the channel chat"})
        s2 = self.signal({"kind": "open", "symbol": "EURUSD", "side": "buy", "sl": 1.08})
        posts = {p.connection.kind: p for p in CopyPost.objects.filter(signal_id=s2["id"])}
        self.assertFalse(posts["telegram"].ok)
        self.assertIn("make it an admin", posts["telegram"].error)
        self.assertTrue(posts["discord"].ok)
        conn = [c for c in self.api("own", f"channels/{self.ch.id}/connections/", "get").json()["connections"] if c["id"] == tg["id"]][0]
        self.assertIs(conn["last_ok"], False)
        self.assertIn("make it an admin", conn["last_error"])
        # Turned off: nothing is posted there
        self.api("own", f"channels/{self.ch.id}/connections/{dc['id']}/", "patch", {"enabled": False})
        n = len(self.net.sent("discord.com"))
        self.signal({"kind": "open", "symbol": "EURUSD", "side": "buy", "sl": 1.08})
        self.assertEqual(len(self.net.sent("discord.com")), n)
        # Disconnecting deletes it
        self.assertEqual(self.api("own", f"channels/{self.ch.id}/connections/{dc['id']}/", "delete").status_code, 204)
        self.assertFalse(CopyConnection.objects.filter(id=dc["id"]).exists())

    def test_whatsapp_plain_and_partly_failed(self):
        self.connect({"kind": "whatsapp", "number_id": "1098765", "token": "EAAG-token", "recipients": "919876543210\n447700900123"})
        self.net.fail["/messages"] = (400, {"error": {"message": "Re-engagement message", "error_user_msg": "More than 24 hours have passed"}})
        s = self.signal({"kind": "open", "symbol": "XAUUSD", "side": "sell", "sl": 2400})
        body = self.net.sent("graph.facebook.com")[-1]["json"]
        self.assertEqual(body["type"], "text")
        self.assertIn("🔴 *SELL XAUUSD*", body["text"]["body"])
        p = CopyPost.objects.get(signal_id=s["id"])
        self.assertFalse(p.ok)
        self.assertIn("0 of 2 sent", p.error)
        self.assertIn("24 hours", p.error)

    def test_test_button(self):
        tg = self.connect({"kind": "telegram", "token": TG_TOKEN, "chat": "@goldcalls"})
        r = self.api("own", f"channels/{self.ch.id}/connections/{tg['id']}/test/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("is connected", self.net.sent("sendMessage")[-1]["json"]["text"])
        self.assertTrue(r.json()["connection"]["last_ok"])
        self.net.fail["sendMessage"] = (400, {"ok": False, "description": "Bad Request: chat not found"})
        r = self.api("own", f"channels/{self.ch.id}/connections/{tg['id']}/test/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("can't find that chat", r.json()["error"])

    # ---- chats here

    def test_group_personal_chat_and_collab(self):
        group = ChatGroup.objects.create(token="grp1", name="Traders", created_by=self.own)
        dm = ChatGroup.objects.create(token="dm1", name="", direct_key="bob|own")
        for g in (group, dm):
            ChatGroupMember.objects.create(group=g, profile=self.own, role="admin")
            ChatGroupMember.objects.create(group=g, profile=self.bob)
        room = CollabRoom.objects.create(token="room1", owner=self.own, name="Gold desk", symbol="XAUUSD", interval="1h")
        CollabMember.objects.create(room=room, profile=self.own, role="owner")
        CollabMember.objects.create(room=room, profile=self.bob, role="viewer")
        targets = self.api("own", "share-targets/", "get").json()["targets"]
        self.assertEqual({(t["kind"], t["name"], t["personal"]) for t in targets},
                         {("group", "Traders", False), ("group", "Chat with Bob", True), ("collab", "Gold desk", False)})
        for kind, token in (("group", "grp1"), ("group", "dm1"), ("collab", "room1")):
            self.connect({"kind": kind, "token": token})
        r = self.api("own", f"channels/{self.ch.id}/connections/", body={"kind": "group", "token": "grp1"})
        self.assertEqual(r.status_code, 409)
        with mock.patch("core.collab.notify_room") as pushed:
            s = self.signal({"kind": "open", "symbol": "XAUUSD", "side": "buy", "sl": 2340, "tp": 2370})
        for g in (group, dm):
            m = ChatGroupMessage.objects.get(group=g, kind="signal")
            self.assertEqual(m.author, self.own)
            self.assertIn("BUY XAUUSD", m.text)
        cm = CollabMessage.objects.get(room=room, kind="signal")
        self.assertEqual(pushed.call_args[0][1]["message"]["signal"]["channel"]["code"], "GOLD2345")
        # Bob reads the card in the group and follows the channel from it
        from .chat_groups import message_json as group_json
        card = group_json(ChatGroupMessage.objects.get(group=group, kind="signal"))
        self.assertEqual(card["signal"]["symbol"], "XAUUSD")
        self.assertNotIn("attachment", card)
        self.assertEqual(card["signal"]["signal"], s["id"])
        r = self.api("bob", "join/", body={"code": card["signal"]["channel"]["code"]})
        self.assertEqual(r.status_code, 201)
        # Left the chat: that connection's post fails, the others still go out
        ChatGroupMember.objects.filter(group=group, profile=self.own).delete()
        s2 = self.signal({"kind": "open", "symbol": "XAUUSD", "side": "sell", "sl": 2400})
        posts = {p.connection.target: p for p in CopyPost.objects.filter(signal_id=s2["id"])}
        self.assertFalse(posts["grp1"].ok)
        self.assertIn("not in this chat", posts["grp1"].error)
        self.assertTrue(posts["dm1"].ok and posts["room1"].ok)
        self.assertEqual(cm.room_id, room.id)
