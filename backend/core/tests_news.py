"""News for the symbol details panel (core/news.py): the feed read into headlines, sources, times, related symbols"""
from unittest import mock

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from . import news

FEED = """<?xml version="1.0"?><rss><channel>
<item><title>Gold rebounds as dollar slips - Reuters</title><link>https://news.google.com/rss/articles/abc</link>
<pubDate>Fri, 13 Nov 2026 20:00:00 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item>
<item><title>Silver and oil slide &amp; bitcoin holds - Kitco</title><link>https://news.google.com/rss/articles/def</link>
<pubDate>Fri, 13 Nov 2026 21:00:00 GMT</pubDate><source url="https://www.kitco.com">Kitco</source></item>
<item><title>no link here</title><pubDate>Fri, 13 Nov 2026 21:00:00 GMT</pubDate></item>
</channel></rss>"""


class NewsTests(SimpleTestCase):
    def setUp(self):
        news._cache.clear()

    def test_searches(self):
        self.assertEqual([news.search_of(s) for s in ("XAUUSD", "EURUSD", "AAPL", "OANDA:XAUUSD")],
                         ["gold price", "EUR/USD", "AAPL stock", "gold price"])

    def test_feed_read(self):
        resp = mock.Mock(text=FEED, raise_for_status=lambda: None)
        with mock.patch.object(news.requests, "get", return_value=resp) as get:
            d = APIClient().get("/api/users/news/", {"symbol": "XAUUSD"}).json()
            APIClient().get("/api/users/news/", {"symbol": "XAUUSD"})       # (cached: fetched once)
        self.assertEqual(get.call_count, 1)
        self.assertIn("q=gold+price", get.call_args[0][0])
        items = d["items"]
        self.assertEqual([i["title"] for i in items], ["Silver and oil slide & bitcoin holds", "Gold rebounds as dollar slips"])   # newest first, source cut off
        self.assertEqual((items[1]["source"], items[1]["at"]), ("Reuters", 1794600000))
        self.assertEqual(items[0]["related"], ["XAUUSD", "XAGUSD", "BTCUSD", "USOIL"])
        self.assertEqual(items[1]["related"], ["XAUUSD", "DXY"])

    def test_a_failed_fetch_keeps_the_last_headlines(self):
        resp = mock.Mock(text=FEED, raise_for_status=lambda: None)
        with mock.patch.object(news.requests, "get", return_value=resp):
            first = news.news_for("XAUUSD")
        news._cache["XAUUSD"] = (0, first)   # (stale)
        with mock.patch.object(news.requests, "get", side_effect=OSError("down")):
            self.assertEqual(news.news_for("XAUUSD"), first)
