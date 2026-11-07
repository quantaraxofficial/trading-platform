"""The voice assistant's AI endpoint (the AI providers are replaced by fakes here)"""
import json
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import TraderProfile, UserSession
from .voice import clean_action


class FakeResponse:
    def __init__(self, code, body=None):
        self.status_code, self._body = code, body

    def json(self):
        if self._body is None:
            raise ValueError("no body")
        return self._body


def answer(obj):
    return FakeResponse(200, {"choices": [{"message": {"content": obj if isinstance(obj, str) else json.dumps(obj)}}]})


@override_settings(GROQ_API_KEY="groq-key", GROQ_MODEL="g-model", GEMINI_API_KEY="gem-key", GEMINI_MODEL="m-model", VOICE_AI_DAILY_LIMIT=3)
class VoiceAskTests(TestCase):
    def setUp(self):
        cache.clear()
        me = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        UserSession.objects.create(user=me, session_key="sk1")
        self.c = APIClient()
        self.calls = []
        self.replies = []
        patcher = mock.patch("core.voice.requests.post", side_effect=self.fake_post)
        patcher.start()
        self.addCleanup(patcher.stop)

    def fake_post(self, url, headers=None, json=None, timeout=None):
        self.calls.append((url, headers, json))
        return self.replies.pop(0)

    def ask(self, text="what is a pip", key="sk1", **extra):
        return self.c.post(f"/api/users/voice/ask/u1/?session_key={key}", {"text": text, **extra}, format="json")

    def test_needs_the_users_session(self):
        self.assertEqual(self.ask(key="wrong").status_code, 401)
        self.assertEqual(self.calls, [])

    def test_a_question_gets_a_spoken_reply(self):
        self.replies = [answer({"reply": "A pip is the smallest usual price step.", "action": None})]
        r = self.ask(context={"symbol": "XAU/USD", "interval": "15min", "price": 2650.5},
                     history=[{"from": "user", "text": "hi"}, {"from": "assistant", "text": "Hi!"}])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["reply"], "A pip is the smallest usual price step.")
        self.assertIsNone(r.data["action"])
        self.assertEqual(r.data["provider"], "groq")
        url, headers, body = self.calls[0]
        self.assertIn("api.groq.com", url)
        self.assertEqual(headers["Authorization"], "Bearer groq-key")
        self.assertEqual(body["model"], "g-model")
        # the chart's context and the conversation go along
        self.assertIn("XAU/USD", body["messages"][0]["content"])
        self.assertIn("2650.5", body["messages"][0]["content"])
        self.assertEqual([m["role"] for m in body["messages"]], ["system", "user", "assistant", "user"])

    def test_an_action_comes_back_checked(self):
        self.replies = [answer({"reply": "Opening gold.", "action": {"type": "symbol", "symbol": "xau/usd", "interval": "15min"}})]
        r = self.ask("could you bring up gold, fifteen please")
        self.assertEqual(r.data["action"], {"type": "symbol", "symbol": "XAU/USD", "interval": "15min"})

    def test_gemini_answers_when_groq_fails(self):
        self.replies = [FakeResponse(429, {"error": "rate limited"}), answer({"reply": "Hello!", "action": None})]
        r = self.ask("hello there")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["provider"], "gemini")
        self.assertIn("generativelanguage.googleapis.com", self.calls[1][0])
        self.assertEqual(self.calls[1][1]["Authorization"], "Bearer gem-key")

    def test_both_failing_is_reported(self):
        self.replies = [FakeResponse(500), FakeResponse(503)]
        r = self.ask()
        self.assertEqual(r.status_code, 502)
        self.assertIn("groq", r.data["detail"])
        self.assertIn("gemini", r.data["detail"])

    def test_a_reply_that_isnt_json_is_still_spoken(self):
        self.replies = [answer('Sure! {"reply": "Here you go.", "action": {"type": "pine", "open": true}} done')]
        r = self.ask("pine thing please")
        self.assertEqual(r.data["reply"], "Here you go.")
        self.assertEqual(r.data["action"], {"type": "pine", "open": True})

    def test_daily_limit(self):
        self.replies = [answer({"reply": "ok", "action": None}) for _ in range(3)]
        for _ in range(3):
            self.assertEqual(self.ask().status_code, 200)
        r = self.ask()
        self.assertEqual(r.status_code, 429)
        self.assertEqual(r.data["error"], "daily_limit")
        self.assertEqual(len(self.calls), 3)

    @override_settings(GROQ_API_KEY="", GEMINI_API_KEY="")
    def test_without_keys(self):
        r = self.ask()
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.data["error"], "not_configured")


class CleanActionTests(TestCase):
    def test_only_the_sites_actions(self):
        self.assertEqual(clean_action({"type": "interval", "interval": "4h"}), {"type": "interval", "interval": "4h"})
        self.assertIsNone(clean_action({"type": "interval", "interval": "3h"}))
        self.assertEqual(clean_action({"type": "panel", "panel": "alerts"}), {"type": "panel", "panel": "alerts"})
        self.assertIsNone(clean_action({"type": "panel", "panel": "admin"}))
        self.assertIsNone(clean_action({"type": "place_order", "symbol": "XAU/USD"}))
        self.assertIsNone(clean_action({"type": "symbol", "symbol": "<script>"}))
        self.assertEqual(clean_action({"type": "symbol", "symbol": "eur/usd", "interval": "2min"}), {"type": "symbol", "symbol": "EUR/USD"})
        self.assertIsNone(clean_action("open gold"))
