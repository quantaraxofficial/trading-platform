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

On this site the assistant is for premium accounts (an active subscription, core/access.py): the
chart shows its button only to them, and this refuses everyone else.
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

from .access import access_of
from .auth import require_session

TIMEOUT = 20
MAX_TEXT = 500
MAX_HISTORY = 8
MAX_ACTIONS = 8          # instructions given in one go, done one after another

INTERVALS = {"1min", "5min", "15min", "30min", "45min", "1h", "2h", "4h", "1day", "1week", "1month"}
PANELS = {"watchlist", "alerts", "object_tree", "collab", "backtest_sessions"}
SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9./:-]{0,19}$")
LANGUAGE = re.compile(r"^[A-Za-z ()]{2,40}$")
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
THEMES = {"classic-light": ("classic", "light", "Light"), "classic-dark": ("classic", "dark", "Dark")}
LENGTH_UNITS = {"hours", "days", "weeks", "months", "years"}

# (kept short: the free tier counts tokens per minute and per day, and this goes with every request)
SYSTEM_PROMPT = """You are the voice assistant of TradePilot, a TradingView-like charting site. Your reply is spoken aloud and subtitled.
Answer with JSON only: {"reply": "...", "actions": [{"type": ..., fields}, ...]} (no actions: []; up to 8, done in order: do every instruction given, in the order given).
reply: one or two short plain spoken sentences, no markdown or emoji. With an action, say what you're doing ("Marking the order blocks.").
You are the site's only way of understanding the trader: every request comes to you. If something you need is missing or could mean different things, ask one short question instead of guessing: put it in reply, actions [], and "question": true; their answer comes next with this conversation, so then do what they asked. Don't ask about what has a default: the chart's symbol and timeframe, a 10,000 balance, a backtest without an end. A backtest needs a start date: ask for it. Asked what you can do: name a few things briefly.
Actions:
symbol {symbol, interval?} open a chart | interval {interval} | mark {what: [kinds]} analyse the bars and mark them | clear_marks {what?: [kinds]} remove your marks (no what: all) | indicator {name, remove?} | chart_type {chart_type} | theme {theme} | replay {date} or {random: true} | alert {price} opens a new alert to confirm | backtest_new {symbol?, interval?, start_date, balance?, length?: {value, unit}} creates and opens a session (the site asks the trader to confirm) | snapshot {copy?} chart image | reset_view | pine {open} Pine Editor | panel {panel} | price reads the chart's price | stop stops listening | command {id} one of the site's commands listed below | drawing_tool {name} picks a drawing tool by name (\"trend line\", \"fib retracement\") | collab_start {name?, invite?: [{who, role: editor|viewer}], ask_to_join?, everyone_mic?} shares the chart live with others (the site asks the trader to confirm) | collab_invite {invite: [{who, role}]} to the open collab | collab_link copies the open collab's link | call {fn, args} one of the site functions listed below, e.g. {\"type\": \"call\", \"fn\": \"watchlist_add\", \"args\": {\"symbol\": \"EUR/USD\"}} (ask for what it needs)
kinds: order_blocks fvg ifvg support_resistance (the site works them out from the bars: never state levels yourself). Order block: the last opposite candle before a move that breaks structure. FVG: a three-candle gap where candle 1 and 3 don't overlap. IFVG: an FVG that price closed through, now acting the other way (a bullish gap broken below becomes resistance).
symbol: BASE/QUOTE for forex, metals, crypto (gold XAU/USD); ticker for stocks (AAPL)
interval: 1min 5min 15min 30min 45min 1h 2h 4h 1day 1week 1month
indicator name, exactly one of: """ + "; ".join(sorted(INDICATORS)) + """
chart_type: """ + " ".join(k if v.lower() == k.lower() else f"{k} ({v})" for k, v in CHART_TYPES.items()) + """
theme: """ + " ".join(THEMES) + """
panel: watchlist alerts object_tree collab backtest_sessions
Before collab_start, ask for its name and who to invite (as editor or viewer), saying they can say \"defaults\" (named after the symbol, nobody invited, people may ask to join, everyone's mic on); don't ask what they already said; if they say defaults, send collab_start at once with nothing else. Everything else: do the obvious thing without asking. Asked to write a script or strategy: pine_write with the whole code (Pine Script v6), not just opening the editor.
length unit: hours days weeks months years. Dates YYYY-MM-DD, in the past; today is {today}.
What they say comes through speech recognition, which mishears words: read every word as what they most likely meant on a trading chart (fbg, fvd, ffg, "fair value cap" → FVG; "order lock", "auto block" → order block; "e m a", "ima", "emma" → EMA; "r s i", "our side" → RSI; "mac d", "mac dee" → MACD; "gold" → XAU/USD; numbers said as words → numbers), using the alternatives when given. Act on the obvious meaning without asking about the mishearing.
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
    body = {"model": model, "messages": messages, "temperature": 0.3, "max_tokens": 1200, "response_format": {"type": "json_object"}}
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


COMMAND_ID = re.compile(r"^[a-z0-9][a-z0-9._:-]{0,48}$")
ACTION_TYPES = {"symbol", "interval", "pine", "price", "reset_view", "stop", "panel", "mark", "clear_marks", "indicator", "chart_type", "theme",
                "replay", "alert", "snapshot", "backtest_new", "command", "drawing_tool", "collab_start", "collab_invite", "collab_link", "call"}
FN_NAME = re.compile(r"^[a-z][a-z0-9_]{0,40}$")
ARG_KEY = re.compile(r"^[a-z][a-z0-9_]{0,24}$")


def _fn_name(signature):
    return signature.split("(", 1)[0].strip()


def _args(v):
    """A function's inputs: a few named values, short text (a script's code may be long)"""
    out = {}
    for k, val in (list(v.items()) if isinstance(v, dict) else [])[:8]:
        if not isinstance(k, str) or not ARG_KEY.match(k) or val is None:
            continue
        if isinstance(val, bool):
            out[k] = val
        elif isinstance(val, (int, float)):
            if val == val and abs(val) < 1e12:
                out[k] = val
        elif isinstance(val, str):
            out[k] = val[: 8000 if k == "code" else 500]
    return out
ROLES = {"editor", "viewer"}


def _invitees(v):
    out = []
    for x in (v if isinstance(v, list) else [])[:10]:
        who = str((x or {}).get("who") or "").strip()[:120] if isinstance(x, dict) else ""
        if who:
            out.append({"who": who, "role": x.get("role") if x.get("role") in ROLES else "editor"})
    return out


def clean_action(a, commands=(), functions=()):
    """Only the site's own actions, with values from its own lists (anything else is dropped)"""
    if not isinstance(a, dict):
        return None
    t = a.get("type")
    # (a site function or command written as the type itself, inputs alongside:
    # {"type": "watchlist_add", "symbol": "EUR/USD"}, {"type": "drawings-lock-all"})
    if isinstance(t, str) and t not in ACTION_TYPES and t in functions:
        flat = a.get("args") if isinstance(a.get("args"), dict) else {k: v for k, v in a.items() if k != "type"}
        return clean_action({"type": "call", "fn": t, "args": flat}, commands, functions)
    if isinstance(t, str) and t not in ACTION_TYPES and commands:
        return clean_action({"type": "command", "id": t}, commands, functions)
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
    if t == "command":
        cid = str(a.get("id") or "").strip().lower()
        if not COMMAND_ID.match(cid):
            return None
        if cid not in commands:
            # (written short: "speed-3x" for "replay-speed-3x", when only one command ends like that)
            ends = [c for c in commands if c.endswith("-" + cid)]
            if len(ends) != 1:
                return None
            cid = ends[0]
        return {"type": "command", "id": cid}
    if t == "drawing_tool":
        name = re.sub(r"[^A-Za-z0-9 %&/-]", "", str(a.get("name") or "")).strip()[:60]
        return {"type": "drawing_tool", "name": name} if name else None
    if t == "collab_start":
        out = {"type": "collab_start", "invite": _invitees(a.get("invite"))}
        name = str(a.get("name") or "").strip()[:120]
        if name:
            out["name"] = name
        for k in ("ask_to_join", "everyone_mic"):
            if isinstance(a.get(k), bool):
                out[k] = a[k]
        return out
    if t == "collab_invite":
        inv = _invitees(a.get("invite"))
        return {"type": "collab_invite", "invite": inv} if inv else None
    if t == "call":
        fn = str(a.get("fn") or a.get("name") or "").strip()
        if not FN_NAME.match(fn) or fn not in functions:
            return None
        return {"type": "call", "fn": fn, "args": _args(a.get("args"))}
    if t == "collab_link":
        return {"type": "collab_link"}
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
    if not access_of(profile).get("active"):
        return Response({"error": "premium_only"}, status=status.HTTP_403_FORBIDDEN)
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
    commands = [c for c in (ctx.get("commands") if isinstance(ctx.get("commands"), list) else []) if isinstance(c, str) and COMMAND_ID.match(c)][:200]
    signatures = [sig.strip()[:300] for sig in (ctx.get("functions") if isinstance(ctx.get("functions"), list) else []) if isinstance(sig, str) and FN_NAME.match(_fn_name(sig))][:40]
    functions = [_fn_name(sig) for sig in signatures]
    room = ctx.get("collab") if isinstance(ctx.get("collab"), dict) else None
    context_line = "The chart now: symbol {sym}, timeframe {tf}{price}.".format(
        sym=str(ctx.get("symbol") or "unknown")[:20], tf=str(ctx.get("interval") or "unknown")[:10],
        price=f", last price {ctx['price']}" if isinstance(ctx.get("price"), (int, float)) else "")
    context_line += " " + (f"In the collab {str(room.get('name'))[:80]!r} as {str(room.get('role'))[:10]}." if room else "Not in a collab.")
    # The language they speak (the panel's choice): the reply in it, the actions as listed
    language = str(ctx.get("language") or "").strip()
    if language and LANGUAGE.match(language) and language != "English":
        context_line += (f"\nThe trader speaks {language}: write reply (and any question) in {language}, in its own script, as a native"
                         " speaker would say it aloud; keep action types, ids, names, symbols and dates exactly as listed (English).")
    if commands:
        context_line += "\nSite commands (use the id exactly): " + " ".join(commands)
    if signatures:
        context_line += "\nSite functions: " + " | ".join(signatures)
    prompt = SYSTEM_PROMPT.replace("{today}", timezone.now().date().isoformat())
    # What speech recognition also thought it heard (it mishears names and trading words)
    alts = [str(x).strip()[:MAX_TEXT] for x in (request.data.get("alternatives") if isinstance(request.data.get("alternatives"), list) else [])[:3] if str(x).strip()]
    heard = text + (("\n(speech recognition also heard: " + " | ".join(f'"{x}"' for x in alts) + ")") if alts else "")
    messages = [{"role": "system", "content": prompt + "\n\n" + context_line}, *_clean_history(request.data.get("history")),
                {"role": "user", "content": heard}]

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
        actions = [x for x in (clean_action(r, commands, functions) for r in raw[:MAX_ACTIONS]) if x]
        if not reply and not actions:
            failures.append(f"{name}: empty answer")
            continue
        # (a question waits for the trader's answer: no actions with it)
        question = bool(data.get("question")) and not actions
        return Response({"reply": reply, "actions": actions, "action": actions[0] if actions else None, "question": question, "provider": name, "remaining": max(0, settings.VOICE_AI_DAILY_LIMIT - used - 1)})
    if busy and all(busy):
        return Response({"error": "busy", "detail": "; ".join(failures)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    return Response({"error": "unavailable", "detail": "; ".join(failures)}, status=status.HTTP_502_BAD_GATEWAY)
