"""News for the symbol details panel (as TradingView's "News" card and its "More events" list):
recent headlines about a symbol from Google News' public search feed (RSS), each with its source,
time and a link to the original story. Only headlines and links are shown (the stories stay on
their publishers' sites).

Each symbol has a search (gold → "gold price", EURUSD → "EUR/USD", AAPL → "AAPL stock"…). Feeds
are fetched at most every 10 minutes per symbol, in the server; a failed fetch serves the last
good copy."""

import hashlib
import html
import re
import threading
import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

import requests
from rest_framework.decorators import api_view
from rest_framework.response import Response

FEED = "https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
TTL = 600
MAX_ITEMS = 40
_cache: dict = {}
_lock = threading.Lock()

# what a symbol is searched as
SEARCHES = {
    "XAUUSD": "gold price", "XAGUSD": "silver price", "XPTUSD": "platinum price", "XPDUSD": "palladium price",
    "BTCUSD": "bitcoin price", "ETHUSD": "ethereum price", "SOLUSD": "solana price", "XRPUSD": "XRP price",
    "USOIL": "crude oil price", "UKOIL": "brent oil price", "US30": "Dow Jones", "US500": "S&P 500", "US100": "Nasdaq 100",
    "DXY": "US dollar index",
}
CURRENCIES = {"USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNH", "INR", "SGD", "HKD", "ZAR", "MXN", "TRY", "SEK", "NOK"}
# words in a headline that mean a symbol (the story's related symbols)
RELATED = [(r"\bgold\b|\bxau", "XAUUSD"), (r"\bsilver\b|\bxag", "XAGUSD"), (r"\bplatinum\b", "XPTUSD"), (r"\bpalladium\b", "XPDUSD"),
           (r"\bbitcoin\b|\bbtc\b", "BTCUSD"), (r"\bether(eum)?\b", "ETHUSD"), (r"\b(crude|oil|wti|brent)\b", "USOIL"),
           (r"\beuro\b|\beur/usd\b", "EURUSD"), (r"\byen\b|\busd/jpy\b", "USDJPY"), (r"\bsterling\b|\bpound\b|\bgbp/usd\b", "GBPUSD"),
           (r"\bdollar\b", "DXY"), (r"\bs&p 500\b", "US500"), (r"\bnasdaq\b", "US100"), (r"\bdow\b", "US30")]


def search_of(symbol: str) -> str:
    s = re.sub(r"[^A-Z0-9]", "", symbol.split(":")[-1].upper())
    if s in SEARCHES:
        return SEARCHES[s]
    if len(s) == 6 and s[:3] in CURRENCIES and s[3:] in CURRENCIES:
        return f"{s[:3]}/{s[3:]}"
    return f"{s} stock"


def _parse(xml_text: str, symbol: str) -> list:
    out = []
    root = ET.fromstring(xml_text)
    for it in root.iter("item"):
        title = html.unescape((it.findtext("title") or "").strip())
        src_el = it.find("source")
        source = (src_el.text or "").strip() if src_el is not None else ""
        # (Google puts " - Source" at the end of the headline)
        if source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3].strip()
        link = (it.findtext("link") or "").strip()
        try:
            at = int(parsedate_to_datetime(it.findtext("pubDate") or "").timestamp())
        except (TypeError, ValueError):
            at = None
        if not title or not link.startswith("https://"):
            continue
        low = title.lower()
        related = []
        for pat, sym in RELATED:
            if re.search(pat, low) and sym not in related:
                related.append(sym)
        if symbol not in related:
            related.insert(0, symbol)
        out.append({"id": hashlib.md5(link.encode()).hexdigest()[:16], "title": title, "source": source or "News", "link": link,
                    "source_url": (src_el.get("url") if src_el is not None else "") or "", "at": at, "related": related[:5]})
    out.sort(key=lambda x: x["at"] or 0, reverse=True)
    return out[:MAX_ITEMS]


def news_for(symbol: str) -> list:
    key = symbol.upper()
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < TTL:
            return hit[1]
    try:
        r = requests.get(FEED.format(q=quote_plus(search_of(key))), timeout=12, headers={"User-Agent": "Mozilla/5.0 (news reader)"})
        r.raise_for_status()
        items = _parse(r.text, key)
    except Exception:
        return hit[1] if hit else []
    with _lock:
        _cache[key] = (now, items)
    return items


@api_view(["GET"])
def symbol_news(request):
    """?symbol=XAUUSD: its latest headlines, newest first"""
    sym = str(request.query_params.get("symbol") or "").strip()[:30]
    if not sym:
        return Response({"items": []})
    return Response({"symbol": sym, "search": search_of(sym), "items": news_for(sym)})
