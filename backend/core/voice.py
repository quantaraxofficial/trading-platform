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

SYSTEM_PROMPT = """You are the voice assistant of TradePilot, a charting and trading website like TradingView. \
Traders talk to you; your reply is spoken aloud and shown as subtitles.

Reply with JSON only: {"reply": "...", "action": null or an action}.
- "reply": what to say. One or two short sentences, plain spoken English: no markdown, lists, \
emoji or symbols that don't read aloud. Friendly and direct.
- "action": when the trader asks for something the site can do, exactly one of:
  {"type": "symbol", "symbol": "XAU/USD", "interval": "15min"}   open a chart (interval optional)
  {"type": "interval", "interval": "1h"}                          change the chart's timeframe
  {"type": "pine", "open": true}                                  open (true) or close (false) the Pine Editor
  {"type": "backtest_new"}                                        start a new backtest session
  {"type": "panel", "panel": "alerts"}                            open a panel on the right
  {"type": "price"}                                               read the current chart's price
  Otherwise null.
- Symbols: forex, metals and crypto as BASE/QUOTE (XAU/USD for gold, EUR/USD, BTC/USD); stocks \
and ETFs by ticker (AAPL, SPY).
- Intervals: 1min 5min 15min 30min 45min 1h 2h 4h 1day 1week 1month.
- Panels: watchlist alerts object_tree collab chats notifications backtest_sessions.

You can't place orders, draw on the chart or read the trader's account yet: say so plainly when \
asked. Trading questions: explain clearly and briefly; never promise profits or tell the trader \
what to buy or sell. If you don't know something current (news, prices other than the chart's), \
say you don't have it rather than guessing."""


class ProviderError(Exception):
    def __init__(self, message, retry_other=True):
        super().__init__(message)
        self.retry_other = retry_other


def _providers():
    out = []
    if settings.GROQ_API_KEY:
        out.append(("groq", "https://api.groq.com/openai/v1/chat/completions", settings.GROQ_API_KEY, settings.GROQ_MODEL))
    if settings.GEMINI_API_KEY:
        out.append(("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", settings.GEMINI_API_KEY, settings.GEMINI_MODEL))
    return out


def _complete(url, key, model, messages):
    try:
        r = requests.post(url, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                          json={"model": model, "messages": messages, "temperature": 0.3, "max_tokens": 400,
                                "response_format": {"type": "json_object"}},
                          timeout=TIMEOUT)
    except requests.RequestException as e:
        raise ProviderError(f"unreachable ({e.__class__.__name__})")
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
        sym = str(a.get("symbol") or "").strip().upper()
        if not SYMBOL.match(sym):
            return None
        out = {"type": "symbol", "symbol": sym}
        if a.get("interval") in INTERVALS:
            out["interval"] = a["interval"]
        return out
    if t == "interval" and a.get("interval") in INTERVALS:
        return {"type": "interval", "interval": a["interval"]}
    if t == "pine":
        return {"type": "pine", "open": bool(a.get("open", True))}
    if t in ("backtest_new", "price"):
        return {"type": t}
    if t == "panel" and a.get("panel") in PANELS:
        return {"type": "panel", "panel": a["panel"]}
    return None


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
    messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n" + context_line}, *_clean_history(request.data.get("history")),
                {"role": "user", "content": text}]

    failures = []
    for name, url, key, model in providers:
        try:
            data = _parse(_complete(url, key, model, messages))
        except ProviderError as e:
            failures.append(f"{name}: {e}")
            continue
        reply = str(data.get("reply") or "").strip()[:600]
        action = clean_action(data.get("action"))
        if not reply and not action:
            failures.append(f"{name}: empty answer")
            continue
        return Response({"reply": reply, "action": action, "provider": name, "remaining": max(0, settings.VOICE_AI_DAILY_LIMIT - used - 1)})
    return Response({"error": "unavailable", "detail": "; ".join(failures)}, status=status.HTTP_502_BAD_GATEWAY)
