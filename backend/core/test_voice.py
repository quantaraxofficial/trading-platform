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


class ComplexActionTests(TestCase):
    def test_marks(self):
        self.assertEqual(clean_action({"type": "mark", "what": ["order_blocks", "fvg", "fvg", "hack"]}), {"type": "mark", "what": ["order_blocks", "fvg"]})
        self.assertIsNone(clean_action({"type": "mark", "what": ["nothing"]}))
        self.assertEqual(clean_action({"type": "clear_marks"}), {"type": "clear_marks", "what": []})

    def test_indicators_chart_types_themes(self):
        self.assertEqual(clean_action({"type": "indicator", "name": "MACD"}), {"type": "indicator", "name": "MACD", "remove": False})
        self.assertIsNone(clean_action({"type": "indicator", "name": "Secret Sauce"}))
        self.assertEqual(clean_action({"type": "chart_type", "chart_type": "ha"}), {"type": "chart_type", "chart_type": "ha", "label": "Heikin Ashi"})
        self.assertIsNone(clean_action({"type": "chart_type", "chart_type": "3d"}))
        self.assertEqual(clean_action({"type": "theme", "theme": "sepia"}), {"type": "theme", "id": "sepia", "base": "light", "label": "Sepia"})
        self.assertEqual(clean_action({"type": "theme", "theme": "classic-dark"})["base"], "dark")
        self.assertIsNone(clean_action({"type": "theme", "theme": "neon"}))

    def test_replay_and_alert(self):
        self.assertEqual(clean_action({"type": "replay", "date": "2024-03-01"}), {"type": "replay", "date": "2024-03-01"})
        # a future or impossible date isn't a replay date
        self.assertEqual(clean_action({"type": "replay", "date": "2999-01-01"}), {"type": "replay", "random": False})
        self.assertEqual(clean_action({"type": "replay", "date": "2024-02-31"}), {"type": "replay", "random": False})
        self.assertEqual(clean_action({"type": "alert", "price": 2650.5}), {"type": "alert", "price": 2650.5})
        self.assertEqual(clean_action({"type": "alert", "price": "lots"}), {"type": "alert"})

    def test_backtest_session(self):
        a = clean_action({"type": "backtest_new", "symbol": "xau/usd", "interval": "15min", "start_date": "2024-03-01", "balance": 10000,
                          "length": {"value": 2, "unit": "weeks"}})
        self.assertEqual(a, {"type": "backtest_new", "symbol": "XAU/USD", "interval": "15min", "start_date": "2024-03-01", "balance": 10000.0,
                             "length": {"value": 2, "unit": "weeks"}})
        # anything out of range is left out, not passed on
        b = clean_action({"type": "backtest_new", "interval": "3min", "start_date": "2999-01-01", "balance": -5, "length": {"value": 2, "unit": "eons"}})
        self.assertEqual(b, {"type": "backtest_new"})


class BusyAndLengthTests(TestCase):
    def test_length_in_other_forms(self):
        a = clean_action({"type": "backtest_new", "start_date": "2024-03-01", "length": {"value": "1", "unit": "month"}})
        self.assertEqual(a["length"], {"value": 1, "unit": "months"})


@override_settings(GROQ_API_KEY="groq-key", GROQ_MODEL="openai/gpt-oss-120b", GEMINI_API_KEY="", VOICE_AI_DAILY_LIMIT=5)
class BusyTests(TestCase):
    def setUp(self):
        cache.clear()
        me = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        UserSession.objects.create(user=me, session_key="sk1")
        self.bodies = []

    def test_rate_limited_is_busy_and_gpt_oss_thinks_less(self):
        def post(url, headers=None, json=None, timeout=None):
            self.bodies.append(json)
            return FakeResponse(429, {"error": "rate limited"})
        with mock.patch("core.voice.requests.post", side_effect=post):
            r = APIClient().post("/api/users/voice/ask/u1/?session_key=sk1", {"text": "hello"}, format="json")
        self.assertEqual(r.status_code, 429)
        self.assertEqual(r.data["error"], "busy")
        self.assertEqual(self.bodies[0]["reasoning_effort"], "low")


@override_settings(GROQ_API_KEY="groq-key", GROQ_MODEL="g", GEMINI_API_KEY="", VOICE_AI_DAILY_LIMIT=5)
class SeveralActionsTests(TestCase):
    def setUp(self):
        cache.clear()
        me = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        UserSession.objects.create(user=me, session_key="sk1")

    def test_up_to_three_checked_actions(self):
        content = {"reply": "Done.", "actions": [{"type": "chart_type", "chart_type": "ha"}, {"type": "theme", "theme": "sepia"},
                                                  {"type": "nonsense"}, {"type": "reset_view"}, {"type": "price"}]}
        with mock.patch("core.voice.requests.post", return_value=answer(content)):
            r = APIClient().post("/api/users/voice/ask/u1/?session_key=sk1", {"text": "x"}, format="json")
        # the first three looked at, the unknown one dropped
        self.assertEqual([a["type"] for a in r.data["actions"]], ["chart_type", "theme"])
        self.assertEqual(r.data["action"]["type"], "chart_type")


@override_settings(GROQ_API_KEY="groq-key", GROQ_MODEL="g", GEMINI_API_KEY="", VOICE_AI_DAILY_LIMIT=5)
class QuestionTests(TestCase):
    def setUp(self):
        cache.clear()
        me = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        UserSession.objects.create(user=me, session_key="sk1")

    def ask(self, content):
        with mock.patch("core.voice.requests.post", return_value=answer(content)) as post:
            r = APIClient().post("/api/users/voice/ask/u1/?session_key=sk1", {"text": "x", "context": {"symbol": "XAUUSD", "interval": "15min"}}, format="json")
        return r, post.call_args.kwargs["json"]["messages"][0]["content"]

    def test_a_question_comes_back_as_one(self):
        r, prompt = self.ask({"reply": "From which date should it start?", "actions": [], "question": True})
        self.assertTrue(r.data["question"])
        self.assertEqual(r.data["actions"], [])
        # the prompt tells it to ask, and the chart's timeframe goes along
        self.assertIn('"question": true', prompt)
        self.assertIn("timeframe 15min", prompt)

    def test_with_actions_it_isnt_a_question(self):
        r, _ = self.ask({"reply": "Okay.", "actions": [{"type": "stop"}], "question": True})
        self.assertFalse(r.data["question"])
        self.assertEqual(r.data["actions"], [{"type": "stop"}])


class SiteSymbolTests(TestCase):
    def test_pairs_get_their_slash(self):
        self.assertEqual(clean_action({"type": "symbol", "symbol": "eurusd"})["symbol"], "EUR/USD")
        self.assertEqual(clean_action({"type": "backtest_new", "symbol": "XAUUSD", "start_date": "2024-03-01"})["symbol"], "XAU/USD")
        self.assertEqual(clean_action({"type": "symbol", "symbol": "AAPL"})["symbol"], "AAPL")
        self.assertEqual(clean_action({"type": "symbol", "symbol": "NVDAUS"})["symbol"], "NVDAUS")   # not two currencies


class SiteCommandTests(TestCase):
    def test_commands_must_be_the_pages_own(self):
        cmds = ["replay-play", "layout-save"]
        self.assertEqual(clean_action({"type": "command", "id": "replay-play"}, cmds), {"type": "command", "id": "replay-play"})
        self.assertIsNone(clean_action({"type": "command", "id": "delete-account"}, cmds))
        self.assertIsNone(clean_action({"type": "command", "id": "replay-play"}))

    def test_drawing_tools_and_collabs(self):
        self.assertEqual(clean_action({"type": "drawing_tool", "name": "Fib retracement <b>"}), {"type": "drawing_tool", "name": "Fib retracement b"})
        a = clean_action({"type": "collab_start", "name": "Gold scalping", "invite": [{"who": "Rahul", "role": "viewer"}, {"who": "priya@x.com", "role": "admin"}, {"who": ""}],
                          "ask_to_join": False})
        self.assertEqual(a, {"type": "collab_start", "name": "Gold scalping", "invite": [{"who": "Rahul", "role": "viewer"}, {"who": "priya@x.com", "role": "editor"}], "ask_to_join": False})
        self.assertIsNone(clean_action({"type": "collab_invite", "invite": []}))
        self.assertEqual(clean_action({"type": "collab_link"}), {"type": "collab_link"})


@override_settings(GROQ_API_KEY="groq-key", GROQ_MODEL="g", GEMINI_API_KEY="", VOICE_AI_DAILY_LIMIT=5)
class CommandContextTests(TestCase):
    def setUp(self):
        cache.clear()
        me = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        UserSession.objects.create(user=me, session_key="sk1")

    def test_the_pages_commands_go_to_the_ai_grouped(self):
        content = {"reply": "Playing.", "actions": [{"type": "command", "id": "replay-play"}, {"type": "command", "id": "rm-rf"}]}
        with mock.patch("core.voice.requests.post", return_value=answer(content)) as post:
            r = APIClient().post("/api/users/voice/ask/u1/?session_key=sk1", {"text": "play", "context": {
                "symbol": "XAU/USD", "commands": ["replay-play", "replay-pause", "range-1d", "indicators"], "collab": {"name": "Gold", "role": "owner"}}}, format="json")
        system = post.call_args.kwargs["json"]["messages"][0]["content"]
        self.assertIn("Site commands (use the id exactly): replay-play replay-pause range-1d indicators", system)
        self.assertIn("In the collab 'Gold' as owner.", system)
        self.assertEqual(r.data["actions"], [{"type": "command", "id": "replay-play"}])


class ShortCommandIdTests(TestCase):
    def test_a_unique_ending_is_enough(self):
        cmds = ["replay-speed-3x", "replay-play", "range-1d", "drawings-lock-all", "drawings-unlock-all"]
        self.assertEqual(clean_action({"type": "command", "id": "speed-3x"}, cmds)["id"], "replay-speed-3x")
        self.assertEqual(clean_action({"type": "command", "id": "lock-all"}, cmds)["id"], "drawings-lock-all")
        # "all" ends two of them: not guessed
        self.assertIsNone(clean_action({"type": "command", "id": "all"}, cmds))


class CommandAsTypeTests(TestCase):
    def test_a_command_written_as_the_type(self):
        cmds = ["drawings-lock-all", "magnet-strong"]
        self.assertEqual(clean_action({"type": "drawings-lock-all"}, cmds), {"type": "command", "id": "drawings-lock-all"})
        self.assertEqual(clean_action({"type": "strong"}, cmds), {"type": "command", "id": "magnet-strong"})
        self.assertIsNone(clean_action({"type": "format-disk"}, cmds))


class FunctionCallTests(TestCase):
    def test_only_listed_functions_with_clean_inputs(self):
        fns = ["watchlist_add", "pine_write"]
        a = clean_action({"type": "call", "fn": "watchlist_add", "args": {"symbol": "XAU/USD", "list": "Gold", "Bad Key": 1, "n": float("nan")}}, (), fns)
        self.assertEqual(a, {"type": "call", "fn": "watchlist_add", "args": {"symbol": "XAU/USD", "list": "Gold"}})
        self.assertIsNone(clean_action({"type": "call", "fn": "delete_everything", "args": {}}, (), fns))
        code = "x" * 9000
        self.assertEqual(len(clean_action({"type": "call", "fn": "pine_write", "args": {"code": code, "name": "y" * 900}}, (), fns)["args"]["code"]), 8000)


@override_settings(GROQ_API_KEY="groq-key", GROQ_MODEL="g", GEMINI_API_KEY="", VOICE_AI_DAILY_LIMIT=5)
class FunctionContextTests(TestCase):
    def setUp(self):
        cache.clear()
        me = TraderProfile.objects.create(uid="u1", name="A", email="a@example.com")
        UserSession.objects.create(user=me, session_key="sk1")

    def test_signatures_go_to_the_ai_and_calls_come_back(self):
        content = {"reply": "Adding it.", "actions": [{"type": "call", "fn": "watchlist_add", "args": {"symbol": "EUR/USD"}}]}
        with mock.patch("core.voice.requests.post", return_value=answer(content)) as post:
            r = APIClient().post("/api/users/voice/ask/u1/?session_key=sk1", {"text": "x", "context": {
                "functions": ["watchlist_add(symbol?, list?) adds a symbol", "not a signature!"]}}, format="json")
        system = post.call_args.kwargs["json"]["messages"][0]["content"]
        self.assertIn("Site functions: watchlist_add(symbol?, list?) adds a symbol", system)
        self.assertNotIn("not a signature", system)
        self.assertEqual(r.data["actions"], [{"type": "call", "fn": "watchlist_add", "args": {"symbol": "EUR/USD"}}])


class FunctionAsTypeTests(TestCase):
    def test_a_function_written_as_the_type(self):
        fns = ["watchlist_add", "go_to_date"]
        self.assertEqual(clean_action({"type": "watchlist_add", "symbol": "EUR/USD"}, (), fns), {"type": "call", "fn": "watchlist_add", "args": {"symbol": "EUR/USD"}})
        self.assertEqual(clean_action({"type": "go_to_date", "args": {"date": "2025-03-03", "time": "14:00"}}, (), fns)["args"], {"date": "2025-03-03", "time": "14:00"})
