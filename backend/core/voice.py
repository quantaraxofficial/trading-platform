"""The voice assistant's AI (api/users/voice/ask/<uid>/).

The site's plain command rules (src/app/lib/voice/commands.ts) handle the common commands in the
browser at no cost. What they don't understand comes here: free conversation, unusual
phrasings, questions. An AI model answers with a short reply to speak and, when the trader asked
for something the site can do, one of the site's own actions. The action is checked against the
same list the rules use, so the AI can't make the site do anything a click couldn't.

Providers: Groq first (fast, which matters when the answer is spoken), Gemini when Groq has no
key, is out of requests or fails. Both speak the OpenAI chat format. Keys stay here on the
server. Each user gets VOICE_AI_DAILY_LIMIT requests a day (a free tier's allowance is shared by
the whole site).
"""
import json
import re

import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session

TIMEOUT = 20
MAX_TEXT = 500
MAX_HISTORY = 8

INTERVALS = {"1min", "5min", "15min", "30min", "45min", "1h", "2h", "4h", "1day", "1week", "1month"}
PANELS = {"watchlist", "alerts", "object_tree", "collab", "chats", "notifications", "backtest_sessions"}
SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9./:-]{0,19}$")
# Forex, metals and crypto are BASE/QUOTE on the site; "EURUSD" from the AI becomes "EUR/USD"
CURRENCIES = {"USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "XAU", "XAG", "BTC", "ETH", "SGD", "HKD", "INR", "CNH", "ZAR", "MXN", "TRY", "SEK", "NOK"}


def _site_symbol(raw):
    sym = str(raw or "").strip().upper()
    if len(sym) == 6 and sym[:3] in CURRENCIES and sym[3:] in CURRENCIES:
        sym = f"{sym[:3]}/{sym[3:]}"
    return sym if SYMBOL.match(sym) else None
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# What the chart can mark (src/app/lib/analysis/smc.ts), add, switch to: the same lists as the browser
MARKS = {"order_blocks", "fvg", "ifvg", "support_resistance"}
INDICATORS = {"Relative Strength Index", "MACD", "Average True Range", "Moving Average Exponential", "Moving Average Simple",
              "Volume Weighted Average Price", "Ichimoku Cloud", "Pivot Points Standard", "Volume Profile Visible Range",
              "Donchian Channels", "Momentum", "Williams %R", "Awesome Oscillator", "Bull Bear Power", "Rate Of Change",
              "Price Channel", "FXN - Asian Session Range", "Volume"}
CHART_TYPES = {"candle": "candles", "hollowCandle": "hollow candles", "volCandles": "volume candles", "bar": "bars", "line": "line",
               "lineWithMarkers": "line with markers", "stepline": "step line", "area": "area", "hlcArea": "HLC area",
               "baseline": "baseline", "column": "columns", "hilo": "high-low", "ha": "Heikin Ashi", "renko": "Renko",
               "pb": "line break", "kagi": "Kagi", "pnf": "point and figure", "range": "range"}
THEMES = {"classic-light": ("classic", "light", "Classic light"), "classic-dark": ("classic", "dark", "Classic dark"),
          "midnight": ("midnight", "dark", "Midnight"), "ocean": ("ocean", "dark", "Ocean"), "forest": ("forest", "dark", "Forest"),
          "sunset": ("sunset", "dark", "Sunset"), "graphite": ("graphite", "dark", "Graphite"), "contrast": ("contrast", "dark", "High contrast"),
          "sepia": ("sepia", "light", "Sepia"), "arctic": ("arctic", "light", "Arctic")}
LENGTH_UNITS = {"hours", "days", "weeks", "months", "years"}

# (kept short: the free tier counts tokens per minute and per day, and this goes with every request)
SYSTEM_PROMPT = """You are the voice assistant of TradePilot, a TradingView-like charting site. Your reply is spoken aloud and subtitled.
Answer with JSON only: {"reply": "...", "actions": [{"type": ..., fields}, ...]} (no actions: []; at most 3, done in order).
reply: one or two short plain spoken sentences, no markdown or emoji. With an action, say what you're doing ("Marking the order blocks.").
You are the site's only way of understanding the trader: every request comes to you. If something you need is missing or could mean different things, ask one short question instead of guessing: put it in reply, actions [], and "question": true; their answer comes next with this conversation, so then do what they asked. Don't ask about what has a default: the chart's symbol and timeframe, a 10,000 balance, a backtest without an end. A backtest needs a start date: ask for it. Asked what you can do: name a few things briefly.
Actions:
symbol {symbol, interval?} open a chart | interval {interval} | mark {what: [kinds]} analyse the bars and mark them | clear_marks {what?: [kinds]} remove your marks (no what: all) | indicator {name, remove?} | chart_type {chart_type} | theme {theme} | replay {date} or {random: true} | alert {price} opens a new alert to confirm | backtest_new {symbol?, interval?, start_date, balance?, length?: {value, unit}} creates and opens a session (the site asks the trader to confirm) | snapshot {copy?} chart image | reset_view | pine {open} Pine Editor | panel {panel} | price reads the chart's price | stop stops listening
kinds: order_blocks fvg ifvg support_resistance (the site works them out from the bars: never state levels yourself). Order block: the last opposite candle before a move that breaks structure. FVG: a three-candle gap where candle 1 and 3 don't overlap. IFVG: an FVG that price closed through, now acting the other way (a bullish gap broken below becomes resistance).
symbol: BASE/QUOTE for forex, metals, crypto (gold XAU/USD); ticker for stocks (AAPL)
interval: 1min 5min 15min 30min 45min 1h 2h 4h 1day 1week 1month
indicator name, exactly one of: """ + "; ".join(sorted(INDICATORS)) + """
chart_type: """ + " ".join(k if v.lower() == k.lower() else f"{k} ({v})" for k, v in CHART_TYPES.items()) + """
theme: """ + " ".join(THEMES) + """
panel: watchlist alerts object_tree collab chats notifications backtest_sessions
length unit: hours days weeks months years. Dates YYYY-MM-DD, in the past; today is {today}.
You can't place orders or see the trader's account. Explain trading briefly; never promise profits or say what to buy or sell; don't guess news or prices you don't have."""


class ProviderError(Exception):
    def __init__(self, message, busy=False):
        super().__init__(message)
        self.busy = busy          # rate limited: try again in a minute


def _providers():
    out = []
    if settings.GROQ_API_KEY:
        out.append(("groq", "https://api.groq.com/openai/v1/chat/completions", settings.GROQ_API_KEY, settings.GROQ_MODEL))
    if settings.GEMINI_API_KEY:
        out.append(("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", settings.GEMINI_API_KEY, settings.GEMINI_MODEL))
    return out


def _complete(url, key, model, messages):
    body = {"model": model, "messages": messages, "temperature": 0.3, "max_tokens": 500, "response_format": {"type": "json_object"}}
    # (gpt-oss thinks before it answers, and the thinking counts against the free tier's tokens)
    if "gpt-oss" in model:
        body["reasoning_effort"] = "low"
    try:
        r = requests.post(url, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json=body, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise ProviderError(f"unreachable ({e.__class__.__name__})")
    if r.status_code == 429:
        raise ProviderError("HTTP 429", busy=True)
    if r.status_code != 200:
        raise ProviderError(f"HTTP {r.status_code}")
    try:
        return r.json()["choices"][0]["message"]["content"] or ""
    except (ValueError, KeyError, IndexError, TypeError):
        raise ProviderError("unreadable answer")


def _parse(content):
    """The model's JSON (leniently: the first {...} in what it wrote)"""
    try:
        return json.loads(content)
    except (ValueError, TypeError):
        m = re.search(r"\{.*\}", content or "", re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except ValueError:
                pass
    return {"reply": (content or "").strip()[:400], "action": None}


def clean_action(a):
    """Only the site's own actions, with values from its own lists (anything else is dropped)"""
    if not isinstance(a, dict):
        return None
    t = a.get("type")
    if t == "symbol":
        sym = _site_symbol(a.get("symbol"))
        if not sym:
            return None
        out = {"type": "symbol", "symbol": sym}
        if a.get("interval") in INTERVALS:
            out["interval"] = a["interval"]
        return out
    if t == "interval" and a.get("interval") in INTERVALS:
        return {"type": "interval", "interval": a["interval"]}
    if t == "pine":
        return {"type": "pine", "open": bool(a.get("open", True))}
    if t in ("price", "reset_view", "stop"):
        return {"type": t}
    if t == "panel" and a.get("panel") in PANELS:
        return {"type": "panel", "panel": a["panel"]}
    if t in ("mark", "clear_marks"):
        what = [w for w in (a.get("what") if isinstance(a.get("what"), list) else []) if w in MARKS]
        if t == "mark" and not what:
            return None
        return {"type": t, "what": list(dict.fromkeys(what))}
    if t == "indicator" and a.get("name") in INDICATORS:
        return {"type": "indicator", "name": a["name"], "remove": bool(a.get("remove", False))}
    if t == "chart_type" and a.get("chart_type") in CHART_TYPES:
        return {"type": "chart_type", "chart_type": a["chart_type"], "label": CHART_TYPES[a["chart_type"]]}
    if t == "theme" and a.get("theme") in THEMES:
        tid, base, label = THEMES[a["theme"]]
        return {"type": "theme", "id": tid, "base": base, "label": label}
    if t == "replay":
        if _past_date(a.get("date")):
            return {"type": "replay", "date": a["date"]}
        return {"type": "replay", "random": bool(a.get("random", False))}
    if t == "alert":
        price = a.get("price")
        ok = isinstance(price, (int, float)) and not isinstance(price, bool) and 0 < price < 1e9
        return {"type": "alert", "price": float(price)} if ok else {"type": "alert"}
    if t == "snapshot":
        return {"type": "snapshot", "copy": bool(a.get("copy", False))}
    if t == "backtest_new":
        out = {"type": "backtest_new"}
        sym = _site_symbol(a.get("symbol"))
        if sym:
            out["symbol"] = sym
        if a.get("interval") in INTERVALS:
            out["interval"] = a["interval"]
        if _past_date(a.get("start_date")):
            out["start_date"] = a["start_date"]
        bal = a.get("balance")
        if isinstance(bal, (int, float)) and not isinstance(bal, bool) and 0 < bal <= 1e9:
            out["balance"] = float(bal)
        ln = a.get("length")
        if isinstance(ln, dict):
            try:
                value = int(str(ln.get("value")).strip())
            except ValueError:
                value = 0
            unit = str(ln.get("unit") or "").strip().lower()
            unit = unit if unit.endswith("s") else unit + "s"
            if 0 < value <= 1000 and unit in LENGTH_UNITS:
                out["length"] = {"value": value, "unit": unit}
        return out
    return None


def _past_date(v):
    """A real YYYY-MM-DD date before today"""
    if not isinstance(v, str) or not DATE.match(v):
        return False
    try:
        from datetime import date
        return date.fromisoformat(v) < timezone.now().date()
    except ValueError:
        return False


def _clean_history(history):
    out = []
    for m in (history if isinstance(history, list) else [])[-MAX_HISTORY:]:
        if not isinstance(m, dict):
            continue
        role = "assistant" if m.get("from") == "assistant" else "user"
        text = str(m.get("text") or "").strip()[:MAX_TEXT]
        if text:
            out.append({"role": role, "content": text})
    return out


@api_view(["POST"])
def ask(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied
    text = str(request.data.get("text") or "").strip()[:MAX_TEXT]
    if not text:
        return Response({"error": "text is required"}, status=status.HTTP_400_BAD_REQUEST)
    providers = _providers()
    if not providers:
        return Response({"error": "not_configured"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    # (a day's count per user; the cache entry lapses with the day)
    day_key = f"voice_ai:{profile.uid}:{timezone.now().date().isoformat()}"
    used = cache.get(day_key, 0)
    if used >= settings.VOICE_AI_DAILY_LIMIT:
        return Response({"error": "daily_limit", "limit": settings.VOICE_AI_DAILY_LIMIT}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    cache.set(day_key, used + 1, 60 * 60 * 26)

    ctx = request.data.get("context") if isinstance(request.data.get("context"), dict) else {}
    context_line = "The chart now: symbol {sym}, timeframe {tf}{price}.".format(
        sym=str(ctx.get("symbol") or "unknown")[:20], tf=str(ctx.get("interval") or "unknown")[:10],
        price=f", last price {ctx['price']}" if isinstance(ctx.get("price"), (int, float)) else "")
    prompt = SYSTEM_PROMPT.replace("{today}", timezone.now().date().isoformat())
    messages = [{"role": "system", "content": prompt + "\n\n" + context_line}, *_clean_history(request.data.get("history")),
                {"role": "user", "content": text}]

    failures = []
    busy = []
    for name, url, key, model in providers:
        try:
            data = _parse(_complete(url, key, model, messages))
        except ProviderError as e:
            failures.append(f"{name}: {e}")
            busy.append(e.busy)
            continue
        reply = str(data.get("reply") or "").strip()[:600]
        raw = data.get("actions") if isinstance(data.get("actions"), list) else [data.get("action")]
        actions = [x for x in (clean_action(r) for r in raw[:3]) if x]
        if not reply and not actions:
            failures.append(f"{name}: empty answer")
            continue
        # (a question waits for the trader's answer: no actions with it)
        question = bool(data.get("question")) and not actions
        return Response({"reply": reply, "actions": actions, "action": actions[0] if actions else None, "question": question, "provider": name, "remaining": max(0, settings.VOICE_AI_DAILY_LIMIT - used - 1)})
    if busy and all(busy):
        return Response({"error": "busy", "detail": "; ".join(failures)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    return Response({"error": "unavailable", "detail": "; ".join(failures)}, status=status.HTTP_502_BAD_GATEWAY)
