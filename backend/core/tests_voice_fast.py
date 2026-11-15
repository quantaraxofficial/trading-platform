"""The voice assistant's fast path: everyday commands understood without the AI; anything more, not"""
from types import SimpleNamespace

from django.test import SimpleTestCase

from .voice import _fast_answer
from .voice_fast import fast_actions


class FastPathTests(SimpleTestCase):
    def check(self, said, *actions):
        self.assertEqual(fast_actions(said), list(actions), said)

    def test_marks(self):
        self.check("Mark order blocks", {"type": "mark", "what": ["order_blocks"]})
        self.check("mark the order blocks and FVGs", {"type": "mark", "what": ["order_blocks", "fvg"]})
        self.check("highlight liquidity sweeps and the poi", {"type": "mark", "what": ["sweeps", "poi"]})
        self.check("please mark support and resistance", {"type": "mark", "what": ["support_resistance"]})
        self.check("show me fresh order blocks", {"type": "mark", "what": ["order_blocks"], "state": "fresh"})
        self.check("any setups?", {"type": "mark", "what": ["setups"]})
        self.check("clear the fvgs", {"type": "clear_marks", "what": ["fvg"]})
        # (misheard: "fair value caps", "order lock")
        self.check("mark the fair value caps", {"type": "mark", "what": ["fvg"]})

    def test_chart(self):
        self.check("switch to 15 minutes", {"type": "interval", "interval": "15min"})
        self.check("4 hour chart", {"type": "interval", "interval": "4h"})
        self.check("daily", {"type": "interval", "interval": "1day"})
        self.check("open gold", {"type": "symbol", "symbol": "XAU/USD"})
        self.check("show me euro dollar on the 15 minute chart", {"type": "symbol", "symbol": "EUR/USD", "interval": "15min"})
        self.check("open eurjpy", {"type": "symbol", "symbol": "EUR/JPY"})
        self.check("add RSI", {"type": "indicator", "name": "Relative Strength Index"})
        self.check("remove the ema", {"type": "indicator", "name": "Moving Average Exponential", "remove": True})
        self.check("switch to heikin ashi", {"type": "chart_type", "chart_type": "ha"})
        self.check("dark mode", {"type": "theme", "theme": "classic-dark"})
        self.check("undo", {"type": "command", "id": "drawings-undo"})
        self.check("what's the price?", {"type": "price"})

    def test_anything_more_goes_to_the_ai(self):
        for said in ["mark order blocks and then switch to 15 minutes", "what is an order block?", "open gold from 1 march",
                     "add rsi with length 21", "how did gold do last week", "show me a double top", "mark the dojis",
                     "switch to 3 minutes", "make my chart look like this", "hello", "analyse the last hour and predict the next"]:
            self.assertIsNone(fast_actions(said), said)


class FastAnswerTests(SimpleTestCase):
    """At the endpoint: English only, not an answer to its own question, every action allowed"""

    def req(self, text, language="English", history=None, commands=None):
        return SimpleNamespace(data={"text": text, "history": history or [], "context": {"language": language, "commands": commands or []}})

    def test_fast(self):
        r = _fast_answer(self.req("mark order blocks"), "mark order blocks")
        self.assertEqual((r["provider"], r["actions"][0]["what"]), ("fast", ["order_blocks"]))

    def test_not_in_another_language_or_after_its_question(self):
        self.assertIsNone(_fast_answer(self.req("15 minutes", language="Hindi"), "15 minutes"))
        asked = [{"from": "assistant", "text": "Which timeframe should the backtest use?"}]
        self.assertIsNone(_fast_answer(self.req("15 minutes", history=asked), "15 minutes"))

    def test_a_site_command_the_page_doesnt_have_goes_to_the_ai(self):
        self.assertIsNone(_fast_answer(self.req("undo", commands=[]), "undo"))
        self.assertEqual(_fast_answer(self.req("undo", commands=["drawings-undo"]), "undo")["actions"][0]["id"], "drawings-undo")
