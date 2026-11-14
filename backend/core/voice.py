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
from .models import VoiceRequest

TIMEOUT = 20
MAX_TEXT = 500
MAX_HISTORY = 8
MAX_ACTIONS = 8          # instructions given in one go, done one after another

INTERVALS = {"1min", "5min", "15min", "30min", "45min", "1h", "2h", "4h", "1day", "1week", "1month"}
PANELS = {"watchlist", "alerts", "object_tree", "collab", "chats", "notifications", "backtest_sessions"}
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
MARKS = {"order_blocks", "fvg", "ifvg", "support_resistance", "structure",
         "poi", "liquidity", "sweeps", "premium_discount", "breakers", "bpr", "displacement", "killzones", "key_levels",
         "swing_points", "trendlines", "supply_demand", "candle_patterns", "chart_patterns", "ranges",
         "msnr_levels", "msnr_gaps", "msnr_flips", "msnr_qm", "msnr_compression", "setups",
         "session_liquidity", "inducement", "trendline_liquidity", "liquidity_voids", "round_numbers", "draw_on_liquidity",
         "mitigation_blocks"}
ZONE_STATES = {"fresh", "tapped", "all"}
# The trade setups the chart can find (src/app/lib/analysis/setups.ts), and their families
SETUPS = {"ict_silver_bullet", "ict_unicorn", "ict_judas", "ict_ote", "ict_turtle_soup", "ict_2022", "smc_choch_ob", "smc_bos_ob",
          "smc_sweep_choch", "pa_pin_bar", "pa_engulfing", "pa_break_retest", "pa_inside_bar", "pa_false_break", "pa_double",
          "msnr_rejection", "msnr_cp", "msnr_flip_retest", "msnr_qm",
          "liq_eq_sweep", "liq_idm_poi", "liq_session_sweep", "pa_orb", "pa_flag", "pa_wyckoff"}
SETUP_FAMILIES = {"ict", "smc", "price_action", "msnr", "liquidity"}
# The candle patterns the chart can find (src/app/lib/analysis/candles.ts), for "mark the dojis"
CANDLE_PATTERNS = {"doji", "dragonfly_doji", "gravestone_doji", "long_legged_doji", "hammer", "hanging_man", "inverted_hammer",
                   "shooting_star", "spinning_top", "marubozu", "belt_hold", "engulfing", "harami", "harami_cross", "piercing_line",
                   "dark_cloud_cover", "tweezer", "kicker", "inside_bar", "outside_bar", "morning_star", "evening_star", "doji_star",
                   "abandoned_baby", "three_white_soldiers", "three_black_crows", "three_inside", "three_outside", "three_methods"}
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
import logging
log = logging.getLogger('core.voice')

SYSTEM_PROMPT = """You are the voice assistant of TradePilot, a TradingView-like charting site. Your reply is spoken aloud and subtitled.
Answer with JSON only: {"reply": "...", "actions": [{"type": ..., fields}, ...]} (no actions: []; up to 8, done in order: do every instruction given, in the order given).
reply: one or two short plain spoken sentences, no markdown or emoji. With an action, say what you're doing ("Marking the order blocks.").
You are the site's only way of understanding the trader: every request comes to you. If something you need is missing or could mean different things, ask one short question instead of guessing: put it in reply, actions [], and "question": true; their answer comes next with this conversation, so then do what they asked. Don't ask about what has a default: the chart's symbol and timeframe, a 10,000 balance, a backtest without an end. A backtest needs a start date: ask for it. Asked what you can do: name a few things briefly.
Actions:
symbol {symbol, interval?} open a chart | interval {interval} | mark {what: [kinds]} analyse the bars and mark them | clear_marks {what?: [kinds]} remove your marks (no what: all; "bias" its drawings) | theme_from_image {parts?: [chart (background, grid, scale text and lines) | candles (body, border, wick colours) | page (the light / dark theme) | drawings (the picture's Fibs, trend lines, horizontal / vertical / cross lines, rays, rectangles, triangles, circles, ellipses, long / short positions, parallel channels, arrows, paths, brush strokes, price / date ranges and arrow marks placed on this chart at the same bars and prices, in their colours, and their looks made the tools' defaults)]} copies a chart screenshot the trader sent (TradingView's or any) onto this site's chart, read from the picture's pixels: "make my chart look like this", "use this theme", "same colours as my TradingView", "copy my drawings / my fib" (parts: drawings); none: all of it; only when the context says a picture came with this message (or earlier), else ask them to send a screenshot with the picture button by the text box, or to paste it | bias {window: {value, unit: minute|hour|day|week}, horizon?: {value, unit}} reads the last window of candles and gives the lean for the next horizon, tested on the market's own recent history: "analyse the last hour and predict the next hour" = window 1 hour, horizon 1 hour; "what's the bias for the next 4 hours" = window 4 hours, horizon 4 hours; "today's bias" = 1 day; the site works it out, draws it and says it with how often such reads were right (never claim more: your reply only "Reading the last 4 hours.") | indicator {name, remove?} | chart_type {chart_type} | theme {theme} | replay {date} or {random: true} | alert {price} opens a new alert to confirm | backtest_new {symbol?, interval?, start_date, balance?, length?: {value, unit}} creates and opens a session (the site asks the trader to confirm) | snapshot {copy?} chart image | reset_view | pine {open} Pine Editor | panel {panel} | price reads the chart's price | stop stops listening | command {id} one of the site's commands listed below | drawing_tool {name} picks a drawing tool by name (\"trend line\", \"fib retracement\") | collab_start {name?, invite?: [{who, role: editor|viewer}], ask_to_join?, everyone_mic?} shares the chart live with others (the site asks the trader to confirm) | collab_invite {invite: [{who, role}]} to the open collab | collab_link copies the open collab's link | call {fn, args} one of the site functions listed below, e.g. {\"type\": \"call\", \"fn\": \"watchlist_add\", \"args\": {\"symbol\": \"EUR/USD\"}} (ask for what it needs)
kinds (the site works them all out from the bars: never state levels or prices yourself; mark several at once when asked, e.g. "mark all SMC concepts"): SMC / ICT: order_blocks (OB: the last opposite candle before a move that breaks structure) | fvg (fair value gap / imbalance: a three-candle gap) | ifvg (inverse FVG: an FVG price closed through, now acting the other way) | structure (BOS break of structure and CHoCH change of character, "choch", "market structure shift", MSS) | poi (points of interest, POI: the best unmitigated zones to trade from, OB / FVG / supply-demand ranked by confluence, premium-discount and trend) | liquidity (buy-side / sell-side liquidity, BSL / SSL, equal highs / lows, EQH / EQL, liquidity pools, resting stops) | sweeps (liquidity sweeps / grabs, stop hunts, raids, turtle soup: a wick through a swing that closes back) | premium_discount (premium and discount zones, equilibrium / 50%, the dealing range, OTE optimal trade entry 62-79%, "fib OTE") | breakers (breaker blocks: order blocks that failed after taking liquidity, a higher high / lower low, then flipped) | mitigation_blocks (mitigation blocks: order blocks that failed without taking liquidity, after a lower high / higher low) | bpr (balanced price range: overlapping bullish and bearish FVGs) | displacement (strong impulsive candles) | killzones (ICT kill zones / sessions: Asia, London, New York, London close; "session highs and lows") | key_levels (PDH / PDL previous day high and low, PWH / PWL previous week high and low, the daily open). Price action: support_resistance (support and resistance, S/R, key levels where price turned) | swing_points (swing highs and lows labelled HH HL LH LL, higher highs, lower lows) | trendlines (trend lines, rising / falling) | supply_demand (supply and demand zones: the base before a strong move) | candle_patterns (candlestick patterns: every common one, or only the ones named: add "patterns": [ids] from: """ + " ".join(sorted(CANDLE_PATTERNS)) + """; e.g. "mark the dojis" -> patterns [doji, dragonfly_doji, gravestone_doji, long_legged_doji]; pin bar -> hammer hanging_man inverted_hammer shooting_star; bullish and bearish versions are the same id) | chart_patterns (double top / bottom, head and shoulders and inverse, with necklines) | ranges (consolidation, ranges, accumulation boxes). "All SMC / ICT concepts" = order_blocks fvg ifvg structure poi liquidity sweeps premium_discount breakers; "all price action" = support_resistance swing_points trendlines supply_demand candle_patterns chart_patterns ranges. MSNR (Malaysian SNR, "Malaysian support and resistance"): msnr_levels (A and V levels: body / line-chart peaks and troughs, fresh or unfresh, "A level", "V level", "fresh levels", "classic SNR") | msnr_gaps (gap levels: open-close gaps, "OC gap") | msnr_flips (SBR / RBS: broken levels flipped, role reversal) | msnr_qm (QM, QML, Quasimodo, over and under) | msnr_compression (compression, CP, price compressing into a level). "All MSNR" / "mark Malaysian SNR" = msnr_levels msnr_gaps msnr_flips msnr_qm msnr_compression. order_blocks, fvg, ifvg and poi are marked with their state (fresh: untouched; tapped ×n: price came back into it, "past 50%" beyond its middle; broken / filled: used); add "state": "fresh" (only untouched ones), "tapped" (tapped, mitigated, "touched", "used once") or "all" (including broken / filled ones, "every OB ever"); none: the ones still valid. Liquidity: session_liquidity (Asia / London / New York session highs and lows, previous month high / low PMH PML, resting or taken) | inducement (IDM, inducement, "trap") | trendline_liquidity (trend line liquidity: lines touched 3+ times) | liquidity_voids (voids, thin price, imbalance runs) | round_numbers (psychological levels, big figures, "double zeros") | draw_on_liquidity (draw on liquidity, DOL, ERL / IRL, external / internal range liquidity, "where is price going"); "all liquidity" = liquidity sweeps session_liquidity inducement trendline_liquidity liquidity_voids round_numbers draw_on_liquidity key_levels. Trade setups: setups ("find setups", "any trades?", "show me Silver Bullets", "MSNR setups"): complete trades found in the bars, each drawn as a long / short position with entry, stop and target and followed to now (won, lost, in trade, waiting for entry, missed); add "setups": [ids or families] for only some, from: """ + " ".join(sorted(SETUPS | SETUP_FAMILIES)) + """ (no "setups": every one). It reports how they went; never invent setups, prices or results yourself.
symbol: BASE/QUOTE for forex, metals, crypto (gold XAU/USD); ticker for stocks (AAPL)
interval: 1min 5min 15min 30min 45min 1h 2h 4h 1day 1week 1month
indicator name, exactly one of: """ + "; ".join(sorted(INDICATORS)) + """
chart_type: """ + " ".join(k if v.lower() == k.lower() else f"{k} ({v})" for k, v in CHART_TYPES.items()) + """
theme: """ + " ".join(THEMES) + """
panel: watchlist alerts object_tree collab chats notifications backtest_sessions
Before collab_start, ask for its name and who to invite (as editor or viewer), saying they can say \"defaults\" (named after the symbol, nobody invited, people may ask to join, everyone's mic on); don't ask what they already said; if they say defaults, send collab_start at once with nothing else. Everything else: do the obvious thing without asking. Asked to write a script or strategy: pine_write with the whole code (Pine Script v6), not just opening the editor.
length unit: hours days weeks months years. Dates YYYY-MM-DD, in the past; today is {today}.
What they say comes through speech recognition, which mishears words: read every word as what they most likely meant on a trading chart (fbg, fvd, ffg, "fair value cap" → FVG; "order lock", "auto block" → order block; "m s n r", "msn r", "m snr", "malaysian s and r", "malaysian snr", "s n r" → MSNR / SNR; "a level", "hey level" → A level; "v level", "we level" → V level; "q m l", "kazi modo", "quasi mode" → QM; "e m a", "ima", "emma" → EMA; "r s i", "our side" → RSI; "mac d", "mac dee" → MACD; "gold" → XAU/USD; numbers said as words → numbers), using the alternatives when given. Act on the obvious meaning without asking about the mishearing.
Stay on topic: trading, markets, charts, analysis, strategies, Pine Script and this site. Anything else (general knowledge, other subjects, personal chat, coding unrelated to trading): don't answer it; say briefly that you only help with trading and the site, with actions [].
Can't do it yet: when the trader asks for something about trading or this site that none of the actions, commands or functions above can do (all of it or a part), never pretend or make something up: do the parts you can, say in reply that you can't do that yet and that it has been noted for the team, and add "unsupported": "<that task in a few words>" to the JSON. (Off-topic requests are declined as above, never noted.)
You know every candlestick and chart pattern and every SMC / ICT and price-action concept: explain any of them briefly when asked (what it looks like, what it suggests, how traders use it), and mark it when asked.
You also know MSNR (Malaysian SNR), every trade setup (SMC, ICT, price action, MSNR, liquidity) and every liquidity concept in depth: the details are given below when they come up.
Risk: stop beyond the structure that would prove the idea wrong, target at least 1.5-2R or the next opposing level; the site's results are on the visible bars only, not a promise.
You can't place orders or see the trader's account. Explain trading briefly; never promise profits or say what to buy or sell; don't guess news or prices you don't have."""


# The long knowledge goes with a request only when the conversation is about it (the free tier counts
# tokens per minute and per day): MSNR, the setups and how they're traded, liquidity. Matched on what
# was said (and misheard) and the last few messages
KNOWLEDGE = [
    (re.compile(r"msnr|snr|s n r|malays|\b[av] level|hey level|we level|fresh|unfresh|\bsbr\b|\brbs\b|quasi|kazi|\bqml?\b|q m l|storyline|story line|compress|\bcp\b|gap level|role reversal|flip", re.I),
     """You know MSNR (Malaysian SNR) fully. Levels come from candle BODIES on the line chart (closes), never wicks: an A level (resistance) is a line-chart peak, a bullish close followed by a lower open and close, shaped like A; a V level (support) is a trough, shaped like V. When a close and the next open differ it is a gap level (the gap is the zone). Fresh: no wick has touched the level since it formed (the strongest, the ones to trade); a wick touching it makes it unfresh (weaker with each touch); only a candle BODY closing beyond it breaks it, a wick through it does not. A broken level flips (role reversal): support becomes resistance (SBR), resistance becomes support (RBS); retesting it from the other side and holding confirms it. QM / Quasimodo (over and under): high, low, higher high, then a lower low breaking the low (bearish; mirror for bullish); the entry is at the left shoulder (QML) when price returns; invalid on a close beyond the head. Compression (CP): small overlapping candles drifting into a fresh level, building liquidity, usually followed by a sharp reaction at the level. Storyline: higher-timeframe levels outrank lower ones; take lower-timeframe fresh levels in the higher timeframe's direction (top-down: e.g. daily or 4h for the story, 1h or 15m to enter). Typical use: wait for price at a fresh level (best with compression into it), enter on rejection or a lower-timeframe flip, stop beyond the level's candle wick, target the next opposite fresh level; skip unfresh levels and levels against the storyline."""),
    (re.compile(r"setup|set up|trade idea|entr(y|ies)|stop loss|take profit|target|strateg|how (do|to|would) (i |you )?(trade|enter)|silver bullet|unicorn|judas|\bote\b|turtle|2022|model|choch|\bbos\b|pin ?bar|engulf|retest|inside bar|false break|fake ?out|double (top|bottom)|\borb\b|opening range|flag|pennant|wyckoff|spring|upthrust|mmxm|market maker|cbdr|power of (3|three)|\bamd\b|breaker|mitigation|poi|head and shoulders|triangle|wedge|three drives|cup and handle|vwap|crossover|gap and go|msnr|snr|liquidity", re.I),
     """Setups you know and how they are traded (the site finds the ones with an id; explain any of them when asked; for one without an id say you can explain it but can't find it on the chart yet). ICT: Silver Bullet (ict_silver_bullet: an FVG formed in the 03-04, 10-11 or 14-15 New York hour, toward liquidity; enter on the retrace to the FVG, stop beyond the candle that opened it, target the nearest liquidity or 2R); Unicorn (ict_unicorn: a breaker block overlapping an FVG; enter in the overlap, stop beyond the breaker); Judas swing (ict_judas: in the London or New York open a false move through the Asian range that closes back inside; enter at the close, stop beyond the false move, target the range's other side); OTE (ict_ote: after a break of structure, the 62-79% retracement of the leg, entry 70.5%, stop beyond the leg's start, target its end or the -27% extension); Turtle soup (ict_turtle_soup: a run through the previous day's or a 20-bar high / low that closes back; fade it, stop beyond the wick); 2022 model (ict_2022: liquidity sweep, then a market structure shift with displacement leaving an FVG; enter at the FVG, stop beyond the sweep, target the opposite liquidity); Power of 3 / AMD (accumulation in Asia, manipulation through it at the open, distribution the other way: the Judas swing is its entry); breaker and mitigation block entries; NWOG / NDOG gap fills. SMC: CHoCH + OB (smc_choch_ob: a change of character, enter on the return to the order block that caused it, stop beyond it); BOS + OB pullback (smc_bos_ob: continuation, the pullback to the order block or FVG of the breaking leg); Sweep + CHoCH (smc_sweep_choch: a sweep of a swing, then CHoCH the other way, enter on the retest of the broken level, stop beyond the sweep); POI to POI (enter at a premium / discount POI, target the next). Price action: pin bar at S/R (pa_pin_bar), engulfing at S/R (pa_engulfing), break and retest (pa_break_retest), inside bar breakout (pa_inside_bar: a stop order past the mother bar in the trend's direction), false breakout / fakeout (pa_false_break), double top / bottom (pa_double: neckline break, target the pattern's height), head and shoulders neckline break, range trading (buy support, sell resistance, stop outside the range), trend pullback to a trend line or moving average. MSNR: fresh level rejection (msnr_rejection: first touch of a fresh A / V level rejected, stop beyond the wick, target the next opposite fresh level); compression into a fresh level (msnr_cp: limit at the level, stop beyond it); SBR / RBS retest (msnr_flip_retest: the first retest of a flipped level holding); QM (msnr_qm: limit at the left shoulder after the lower low / higher high, stop beyond the head); storyline entries (a higher-timeframe fresh level, entered on a lower-timeframe flip or rejection)."""),
    (re.compile(r"liquid|\bbsl\b|\bssl\b|buy ?side|sell ?side|sweep|grab|raid|stop hunt|stops|inducement|\bidm\b|\berl\b|\birl\b|external range|internal range|draw on|\bdol\b|void|round number|big figure|equal (high|low)|\beq[hl]\b|session (high|low)|asia|london|new york|turtle|\bsfp\b|swing failure|judas|\bpdh\b|\bpdl\b|previous (day|week|month)", re.I),
     """Liquidity (you know it fully): liquidity is resting orders, mostly stops: buy-side (BSL) above highs, sell-side (SSL) below lows; equal highs / lows (EQH / EQL) are engineered liquidity, a magnet; external range liquidity (ERL: the dealing range's swing high / low) and internal range liquidity (IRL: FVGs, OBs inside it): price runs ERL then rebalances into IRL, or from IRL to ERL; the draw on liquidity (DOL) is the pool price is most likely heading for (by the higher timeframe's structure); sweep (a wick through, closing back) vs run (closing beyond: liquidity taken, continuation); stop hunts / raids / grabs, the Judas swing; inducement (IDM: the first pullback that traps early traders before the real POI); trend line liquidity (stops along a line touched 3+ times); session highs / lows (Asia, London, New York), previous day / week / month highs and lows, the opening prices (midnight, NY 08:30 / 09:30); liquidity voids (thin price from fast moves, often refilled); old highs / lows, relative equal levels, double tops / bottoms and range edges as pools; round numbers; the swing failure pattern (SFP: a failed break of a swing). Liquidity setups: EQH / EQL sweep (liq_eq_sweep: a sweep of equal highs / lows closing back, target the opposite liquidity); IDM + POI (liq_idm_poi: the inducement taken, then a limit at the leg's order block); London sweep in the New York open (liq_session_sweep); Asian range Judas (ict_judas); turtle soup and the SFP (ict_turtle_soup, pa_false_break); sweep + CHoCH (smc_sweep_choch); ERL to IRL and IRL to ERL plays; trend line liquidity runs into a POI. More setups: opening range breakout (pa_orb: the 09:30-10:00 New York range, a stop order past the side broken first); flags and pennants (pa_flag: a pole, a tight flag, a stop order past it, target the pole's length); Wyckoff spring / upthrust (pa_wyckoff: a false break of a range closing back, target the other side); Wyckoff accumulation / distribution phases; Market Maker Buy / Sell Model (MMXM: consolidation, a run to a POI, smart money reversal, then the other side); CBDR / Asian range standard deviations; NWOG / NDOG; triangles, wedges, three drives, cup and handle, head and shoulders; VWAP reversion; moving average crossovers and trend pullbacks; gap and go."""),
]


def knowledge_for(texts):
    """The knowledge sections the conversation calls for"""
    joined = " ".join(t for t in texts if t)
    return [k for pat, k in KNOWLEDGE if pat.search(joined)]


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
                "replay", "alert", "snapshot", "backtest_new", "command", "drawing_tool", "collab_start", "collab_invite", "collab_link", "call", "bias", "theme_from_image"}
THEME_PARTS = {"chart", "candles", "page", "drawings"}
# The bias's spans: the window read and the one ahead (15 minutes … a week)
SPAN_UNITS = {"minute": 60, "hour": 3600, "day": 86400, "week": 604800}


def _span(v):
    if not isinstance(v, dict):
        return None
    try:
        value = int(float(str(v.get("value")).strip()))
    except ValueError:
        return None
    unit = str(v.get("unit") or "").strip().lower().rstrip("s")
    unit = {"min": "minute", "hr": "hour", "h": "hour", "d": "day"}.get(unit, unit)
    if unit not in SPAN_UNITS or not (15 * 60 <= value * SPAN_UNITS[unit] <= 7 * 86400):
        return None
    return {"value": value, "unit": unit}
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
    if t == "theme_from_image":
        parts = [x for x in (a.get("parts") if isinstance(a.get("parts"), list) else []) if x in THEME_PARTS]
        return {"type": "theme_from_image", "parts": list(dict.fromkeys(parts))} if parts else {"type": "theme_from_image"}
    if t == "bias":
        # (one given: the other the same; none: the last hour, the next hour)
        window, horizon = _span(a.get("window")), _span(a.get("horizon"))
        window = window or horizon or {"value": 1, "unit": "hour"}
        return {"type": "bias", "window": window, "horizon": horizon or window}
    if t in ("mark", "clear_marks"):
        # (the bias's drawings clear like the marks)
        what = [w for w in (a.get("what") if isinstance(a.get("what"), list) else []) if w in MARKS or (t == "clear_marks" and w == "bias")]
        if t == "mark" and not what:
            return None
        out = {"type": t, "what": list(dict.fromkeys(what))}
        patterns = [x for x in (a.get("patterns") if isinstance(a.get("patterns"), list) else []) if x in CANDLE_PATTERNS]
        if t == "mark" and patterns and "candle_patterns" in out["what"]:
            out["patterns"] = list(dict.fromkeys(patterns))
        # (which setups: ids or families; none named: all of them)
        setups = [x for x in (a.get("setups") if isinstance(a.get("setups"), list) else []) if x in SETUPS or x in SETUP_FAMILIES]
        if t == "mark" and setups and "setups" in out["what"]:
            out["setups"] = list(dict.fromkeys(setups))
        # (which order blocks, FVGs, IFVGs and POIs: fresh, tapped or all)
        if t == "mark" and a.get("state") in ZONE_STATES and set(out["what"]) & {"order_blocks", "fvg", "ifvg", "poi"}:
            out["state"] = a["state"]
        return out
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
    commands = [c for c in (ctx.get("commands") if isinstance(ctx.get("commands"), list) else []) if isinstance(c, str) and COMMAND_ID.match(c)][:200]
    signatures = [sig.strip()[:300] for sig in (ctx.get("functions") if isinstance(ctx.get("functions"), list) else []) if isinstance(sig, str) and FN_NAME.match(_fn_name(sig))][:40]
    functions = [_fn_name(sig) for sig in signatures]
    room = ctx.get("collab") if isinstance(ctx.get("collab"), dict) else None
    context_line = "The chart now: symbol {sym}, timeframe {tf}{price}.".format(
        sym=str(ctx.get("symbol") or "unknown")[:20], tf=str(ctx.get("interval") or "unknown")[:10],
        price=f", last price {ctx['price']}" if isinstance(ctx.get("price"), (int, float)) else "")
    # (a picture sent with this message, or earlier in the chat: the site reads it, not you)
    if ctx.get("image") is True:
        context_line += " A picture came with this message (you can't see it; the site reads it)."
    elif ctx.get("image_earlier") is True:
        context_line += " A picture was sent earlier in this chat (you can't see it; the site reads it)."
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
    # the knowledge this conversation is about (MSNR, setups, liquidity), only then
    recent = [m["content"] for m in _clean_history(request.data.get("history"))[-4:] if isinstance(m.get("content"), str)]
    extra = knowledge_for([text, *alts, *recent])
    if extra:
        prompt += "\n" + "\n".join(extra)
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
        # Asked for something it can't do yet: kept to be taught later (Django Admin)
        task = str(data.get("unsupported") or "").strip()[:300] if isinstance(data.get("unsupported"), str) else ""
        if task:
            try:
                VoiceRequest.objects.create(profile=profile, said=text, task=task, reply=reply)
            except Exception:
                log.exception("voice: noting an unsupported request failed")
        return Response({"reply": reply, "actions": actions, "action": actions[0] if actions else None, "question": question, "provider": name, "remaining": max(0, settings.VOICE_AI_DAILY_LIMIT - used - 1)})
    if busy and all(busy):
        return Response({"error": "busy", "detail": "; ".join(failures)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    return Response({"error": "unavailable", "detail": "; ".join(failures)}, status=status.HTTP_502_BAD_GATEWAY)
