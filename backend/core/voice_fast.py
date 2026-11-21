"""The voice assistant's fast path: the everyday commands understood here, at once, without the AI.

"Mark order blocks and FVGs", "switch to 15 minutes", "open gold on the hourly", "add RSI", "dark
mode", "undo"… are matched whole against a small grammar. Only a full match counts: a sentence with
anything more (a second instruction, a question, a date, a name), or in another language, or
answering a question the assistant just asked, goes to the AI as before. So it's instant, needs no AI
call, and keeps working when the AI is down or out of its free tier.
"""
import re

from .community_scripts import match_community_script

# ---- what's said, tidied: lower case, no punctuation, misheard trading words put right, politeness off
_MISHEARD = [
    (r"\bfair value caps?\b", "fair value gap"), (r"\b(fbg|fvd|ffg|fbgs|fvds|ffgs)\b", "fvg"),
    (r"\b(order lock|auto block)s?\b", "order block"), (r"\br s i\b|\bour side\b", "rsi"), (r"\bmac (d|dee)\b", "macd"),
    (r"\be m a\b|\bima\b|\bemma\b", "ema"), (r"\bs m a\b", "sma"), (r"\bv wap\b|\bv w a p\b", "vwap"),
    (r"\bheiken\b|\bheikin\b|\bhikin\b", "heikin"), (r"\bash[ie]?\b", "ashi"),
]
_POLITE_START = re.compile(r"^(?:(?:hey|ok|okay|please|now|so|and|can you|could you|would you|will you|i want you to|i want to|i'd like to|let's|lets)\s+)+")
_POLITE_END = re.compile(r"(?:\s+(?:please|for me|now|right now|thanks|thank you))+$")


def _tidy(text):
    t = (text or "").lower().replace("’", "'").replace("%", " percent ")
    t = re.sub(r"[^\w\s/'&+]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    for pat, rep in _MISHEARD:
        t = re.sub(pat, rep, t)
    t = _POLITE_START.sub("", t)
    t = _POLITE_END.sub("", t)
    return t.strip()


_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "fifteen": 15, "thirty": 30, "forty five": 45, "fourty five": 45, "a": 1, "an": 1}


def _num(s):
    s = (s or "").strip()
    if not s:
        return 1
    if s.isdigit():
        return int(s)
    return _NUM.get(s)


# ---- the chart's marks, as they're said
_KINDS = [
    ("order_blocks", ["order blocks", "order block", "obs", "ob"]),
    ("mitigation_blocks", ["mitigation blocks", "mitigation block"]),
    ("breakers", ["breaker blocks", "breaker block", "breakers", "breaker"]),
    ("ifvg", ["inverse fair value gaps", "inverse fair value gap", "inverse fvgs", "inverse fvg", "ifvgs", "ifvg"]),
    ("fvg", ["fair value gaps", "fair value gap", "fvgs", "fvg", "imbalances", "imbalance"]),
    ("support_resistance", ["support and resistance levels", "support and resistance zones", "support and resistance", "support resistance", "s and r levels", "s and r", "sr levels"]),
    ("structure", ["market structure", "break of structure and change of character", "bos and choch", "bos choch", "break of structure", "change of character", "structure", "choch", "bos"]),
    ("poi", ["points of interest", "point of interest", "pois", "poi"]),
    ("sweeps", ["liquidity sweeps", "liquidity grabs", "stop hunts", "sweeps"]),
    ("session_liquidity", ["session highs and lows", "session liquidity"]),
    ("liquidity_voids", ["liquidity voids", "voids"]),
    ("trendline_liquidity", ["trend line liquidity", "trendline liquidity"]),
    ("draw_on_liquidity", ["draw on liquidity", "erl and irl"]),
    ("liquidity", ["buy side and sell side liquidity", "equal highs and lows", "liquidity pools", "liquidity"]),
    ("premium_discount", ["premium and discount zones", "premium and discount", "premium discount", "optimal trade entry", "ote"]),
    ("bpr", ["balanced price ranges", "balanced price range", "bprs", "bpr"]),
    ("displacement", ["displacement candles", "displacement"]),
    ("killzones", ["kill zones", "killzones", "trading sessions", "sessions"]),
    ("key_levels", ["previous day high and low", "pdh and pdl", "pdh pdl", "key levels"]),
    ("swing_points", ["swing highs and lows", "swing highs and swing lows", "higher highs and higher lows", "swing points"]),
    ("trendlines", ["trend lines", "trendlines", "trend line", "trendline"]),
    ("supply_demand", ["supply and demand zones", "supply and demand", "supply demand zones", "supply demand"]),
    ("candle_patterns", ["candlestick patterns", "candle patterns", "candlestick pattern"]),
    ("chart_patterns", ["chart patterns"]),
    ("inducement", ["inducements", "inducement", "idm"]),
    ("round_numbers", ["psychological levels", "round numbers"]),
    ("ranges", ["consolidations", "consolidation", "ranges"]),
    ("setups", ["trade setups", "trading setups", "setups"]),
    ("msnr_levels", ["a and v levels", "msnr levels"]),
    ("msnr_qm", ["quasimodo", "qml", "qm"]),
]
_KIND_PHRASES = sorted(((p, k) for k, ps in _KINDS for p in ps), key=lambda x: -len(x[0]))
_STATES = {"fresh": "fresh", "untouched": "fresh", "unmitigated": "fresh", "tapped": "tapped", "mitigated": "tapped", "touched": "tapped"}
_STATEFUL = {"order_blocks", "fvg", "ifvg", "poi"}


def _kinds(s):
    """'order blocks, fvgs and liquidity' → [order_blocks, fvg, liquidity] (only when every word is one)"""
    out, rest = [], s.strip()
    while rest:
        rest = re.sub(r"^(?:(?:and|&|plus|also|the|all|,)\s*)+", "", rest).strip()
        if not rest:
            break
        for phrase, kind in _KIND_PHRASES:
            if rest == phrase or rest.startswith(phrase + " ") or rest.startswith(phrase + ","):
                if kind not in out:
                    out.append(kind)
                rest = rest[len(phrase):].strip()
                break
        else:
            return None
    return out or None


# ---- timeframes
_TF = re.compile(r"^(?:(\d+|one|two|three|four|five|fifteen|thirty|forty five|fourty five|a|an)\s*)?"
                 r"(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|hourly|d|day|days|daily|w|week|weeks|weekly|month|months|monthly)$")
_TF_VALUES = {("minute", 1): "1min", ("minute", 5): "5min", ("minute", 15): "15min", ("minute", 30): "30min", ("minute", 45): "45min",
              ("hour", 1): "1h", ("hour", 2): "2h", ("hour", 4): "4h", ("day", 1): "1day", ("week", 1): "1week", ("month", 1): "1month"}


def _interval(s):
    m = _TF.match(re.sub(r"\s*(?:chart|timeframe|time frame|candles?|tf)$", "", s.strip()).strip())
    if not m:
        return None
    n, unit = _num(m.group(1)), m.group(2)
    if n is None:
        return None
    unit = ("minute" if unit[0] == "m" and not unit.startswith("mo") else "hour" if unit[0] == "h" else "day" if unit[0] == "d"
            else "week" if unit[0] == "w" else "month")
    return _TF_VALUES.get((unit, n))


# ---- symbols, as they're said
_SYMBOLS = {
    "gold": "XAU/USD", "xauusd": "XAU/USD", "xau usd": "XAU/USD", "xau": "XAU/USD", "silver": "XAG/USD", "xagusd": "XAG/USD",
    "bitcoin": "BTC/USD", "btc": "BTC/USD", "btcusd": "BTC/USD", "ethereum": "ETH/USD", "ether": "ETH/USD", "eth": "ETH/USD",
    "euro dollar": "EUR/USD", "euro": "EUR/USD", "eur usd": "EUR/USD", "fiber": "EUR/USD",
    "pound dollar": "GBP/USD", "pound": "GBP/USD", "cable": "GBP/USD", "gbp usd": "GBP/USD",
    "dollar yen": "USD/JPY", "yen": "USD/JPY", "usd jpy": "USD/JPY", "aussie": "AUD/USD", "aud usd": "AUD/USD",
    "apple": "AAPL", "tesla": "TSLA", "netflix": "NFLX", "nvidia": "NVDA", "microsoft": "MSFT", "amazon": "AMZN", "google": "GOOGL",
}
_CCY = {"USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "XAU", "XAG"}


def _symbol(s):
    s = re.sub(r"\s*chart$", "", s.strip()).strip()
    if s in _SYMBOLS:
        return _SYMBOLS[s]
    c = s.replace(" ", "").replace("/", "").upper()
    if len(c) == 6 and c[:3] in _CCY and c[3:] in _CCY:
        return f"{c[:3]}/{c[3:]}"
    return None


# ---- indicators and chart types
_INDICATORS = [
    ("Relative Strength Index", ["relative strength index", "rsi"]), ("MACD", ["macd"]),
    ("Average True Range", ["average true range", "atr"]),
    ("Moving Average Exponential", ["exponential moving average", "moving average exponential", "ema"]),
    ("Moving Average Simple", ["simple moving average", "moving average simple", "moving average", "sma"]),
    ("Volume Weighted Average Price", ["volume weighted average price", "vwap"]),
    ("Volume Profile Visible Range", ["volume profile visible range", "volume profile"]), ("Volume", ["volume"]),
    ("Ichimoku Cloud", ["ichimoku cloud", "ichimoku"]), ("Donchian Channels", ["donchian channels", "donchian channel", "donchian"]),
    ("Pivot Points Standard", ["pivot points standard", "pivot points", "pivots"]), ("Williams %R", ["williams percent r", "williams r", "williams"]),
    ("Momentum", ["momentum"]), ("Rate Of Change", ["rate of change", "roc"]), ("Awesome Oscillator", ["awesome oscillator"]),
    ("Bull Bear Power", ["bull bear power"]), ("Price Channel", ["price channel"]),
    ("FXN - Asian Session Range", ["asian session range", "asian range"]),
]
_IND_PHRASES = {p: n for n, ps in _INDICATORS for p in ps}
_CHART_TYPES = {"candles": "candle", "candlesticks": "candle", "candlestick": "candle", "hollow candles": "hollowCandle",
                "volume candles": "volCandles", "bars": "bar", "bar": "bar", "line": "line", "line with markers": "lineWithMarkers",
                "step line": "stepline", "area": "area", "hlc area": "hlcArea", "baseline": "baseline", "columns": "column",
                "high low": "hilo", "heikin ashi": "ha", "renko": "renko", "line break": "pb", "kagi": "kagi",
                "point and figure": "pnf", "range": "range"}
# (said alone, these can only mean the chart type)
_CHART_TYPES_ALONE = {"heikin ashi", "renko", "kagi", "hollow candles", "point and figure", "line break", "volume candles", "baseline"}

_PANELS = {"watchlist": "watchlist", "watch list": "watchlist", "alerts": "alerts", "alert list": "alerts", "object tree": "object_tree",
           "collab": "collab", "collaboration": "collab", "backtest sessions": "backtest_sessions", "backtesting sessions": "backtest_sessions"}

_MARK_VERB = r"(?:mark|show me|show|draw|find|highlight|plot|display|identify|detect|spot|point out|give me)"
_OPEN_VERB = r"(?:open|show me|show|switch to|change to|go to|load|pull up|bring up|take me to)"


def _one(t):
    """One command, the whole sentence, or None"""
    # marks: "mark order blocks and fvgs", "show me the fresh order blocks", "find setups"
    m = re.match(rf"^{_MARK_VERB}(?: me)?(?: all)?(?: the| any| some)?\s+(fresh|untouched|unmitigated|tapped|mitigated|touched)?\s*(.+?)(?: on (?:the|this|my) chart| here)?$", t)
    if m:
        kinds = _kinds(m.group(2))
        if kinds:
            a = {"type": "mark", "what": kinds}
            if m.group(1) and set(kinds) <= _STATEFUL:
                a["state"] = _STATES[m.group(1)]
            elif m.group(1):
                return None
            return a
    if re.match(r"^(?:any|find|show|look for|are there any) (?:trade )?(?:setups|trades)(?: here| now)?$", t):
        return {"type": "mark", "what": ["setups"]}
    # clearing marks
    if re.match(r"^(?:clear|remove|delete|erase|wipe)(?: all)?(?: of)?(?: the| your| my| those)? (?:marks|markings|marked stuff|analysis)$", t):
        return {"type": "clear_marks", "what": []}
    m = re.match(r"^(?:clear|remove|erase|wipe)(?: the| your| those)? (.+?)(?: marks)?$", t)
    if m:
        kinds = _kinds(m.group(1))
        if kinds:
            return {"type": "clear_marks", "what": kinds}
    # timeframe: "switch to 15 minutes", "1 hour chart", "daily"
    m = re.match(r"^(?:(?:switch|change|go|move|set|put)(?: the)?(?: chart| timeframe| time frame)?(?: to| on)?(?: the| a)?\s+)?(.+)$", t)
    if m:
        iv = _interval(m.group(1))
        if iv:
            return {"type": "interval", "interval": iv}
    # symbol (and timeframe): "open gold", "show me euro dollar on the 15 minute chart"
    m = re.match(rf"^{_OPEN_VERB}(?: the)? (.+?)(?: on(?: the| a)? (.+))?$", t)
    if m:
        sym = _symbol(m.group(1))
        if sym:
            a = {"type": "symbol", "symbol": sym}
            if m.group(2):
                iv = _interval(m.group(2))
                if not iv:
                    return None
                a["interval"] = iv
            return a
    # indicators: "add rsi", "remove the macd"
    m = re.match(r"^(?:add|put|apply|insert|load|plot)(?: the| an| a)? (.+?)(?: indicator)?(?: to| on)?(?: the| my| this)?(?: chart)?$", t)
    if m and m.group(1) in _IND_PHRASES:
        return {"type": "indicator", "name": _IND_PHRASES[m.group(1)]}
    # (an Editors' pick, every word said in its name: "add chess", "add the stop loss clustering")
    if m and match_community_script(m.group(1), strict=True):
        return {"type": "indicator", "name": match_community_script(m.group(1), strict=True)}
    m = re.match(r"^(?:remove|delete|hide|take off|turn off|get rid of)(?: the)? (.+?)(?: indicator)?(?: from(?: the| my)? chart)?$", t)
    if m and m.group(1) in _IND_PHRASES:
        return {"type": "indicator", "name": _IND_PHRASES[m.group(1)], "remove": True}
    if m and match_community_script(m.group(1), strict=True):
        return {"type": "indicator", "name": match_community_script(m.group(1), strict=True), "remove": True}
    # chart type: "switch to heikin ashi", "line chart"
    m = re.match(r"^(?:(?:switch|change|go)(?: the chart)?(?: to)?|use|show)?\s*(?:a |the )?(.+?)( chart| candles)?$", t)
    if m and m.group(1) in _CHART_TYPES and (m.group(2) or m.group(1) in _CHART_TYPES_ALONE or re.match(r"^(?:switch|change|go|use)", t)):
        return {"type": "chart_type", "chart_type": _CHART_TYPES[m.group(1)]}
    # theme
    m = re.match(r"^(?:switch to |change to |turn on |use |go |enable |set )?(?:the )?(dark|light|night|day)(?: mode| theme)(?: on)?$", t)
    if m:
        return {"type": "theme", "theme": "classic-dark" if m.group(1) in ("dark", "night") else "classic-light"}
    # panels, the Pine Editor
    m = re.match(r"^(?:open|show|show me)(?: the| my)? (.+?)(?: panel)?$", t)
    if m and m.group(1) in _PANELS:
        return {"type": "panel", "panel": _PANELS[m.group(1)]}
    if re.match(r"^(?:open|show)(?: the)? pine(?: script)? editor$", t):
        return {"type": "pine", "open": True}
    if re.match(r"^(?:close|hide)(?: the)? pine(?: script)? editor$", t):
        return {"type": "pine", "open": False}
    # the rest
    simple = [
        (r"^(?:take a |take |capture )?(?:snapshot|screenshot)(?: of the chart)?$", {"type": "snapshot"}),
        (r"^copy(?: the)? chart(?: image| picture)?$", {"type": "snapshot", "copy": True}),
        (r"^reset(?: the)? (?:chart|view|chart view|zoom)$", {"type": "reset_view"}),
        (r"^(?:what is|what's|whats|tell me)(?: the)? (?:current )?price(?: now)?$|^price$", {"type": "price"}),
        (r"^(?:stop|stop listening|be quiet|go to sleep|that's all|thats all)$", {"type": "stop"}),
        (r"^undo(?: that| it| the last drawing)?$", {"type": "command", "id": "drawings-undo"}),
        (r"^redo(?: that| it)?$", {"type": "command", "id": "drawings-redo"}),
        (r"^(?:remove|delete|clear) all(?: the| my)? drawings$", {"type": "command", "id": "drawings-remove-all"}),
        (r"^lock all(?: the| my)? drawings$", {"type": "command", "id": "drawings-lock-all"}),
        (r"^unlock all(?: the| my)? drawings$", {"type": "command", "id": "drawings-unlock-all"}),
        (r"^hide all(?: the| my)? drawings$", {"type": "command", "id": "drawings-hide-all"}),
        (r"^show all(?: the| my)? drawings$", {"type": "command", "id": "drawings-show-all"}),
        (r"^(?:turn )?(?:the )?magnet off$|^(?:turn off|disable)(?: the)? magnet$", {"type": "command", "id": "magnet-off"}),
        (r"^(?:weak magnet|magnet weak)$", {"type": "command", "id": "magnet-weak"}),
        (r"^(?:strong magnet|magnet strong|(?:turn on|enable)(?: the)? magnet|magnet on)$", {"type": "command", "id": "magnet-strong"}),
        (r"^(?:back to the chart|back to the market|close the sketch|leave the sketch|exit the sketch)$", {"type": "sketch_exit"}),
        (r"^(?:guide me|give me a tour|show me around|take me (?:on a tour|around)|walk me through|tour)"
         r"(?: (?:through|of|around|on|to|in))?(?: (?:your|the|this))?(?: (?:website|web site|site|app|platform|features|tradepilot))?$", {"type": "site_tour"}),
    ]
    for pat, a in simple:
        if re.match(pat, t):
            return dict(a)
    return None


def fast_actions(text):
    """The actions for an everyday command, or None (for the AI)"""
    t = _tidy(text)
    # (a question is for the AI, unless it's a command put as one: "any setups?", "what's the price?")
    asks = "?" in (text or "") and not re.match(r"^(?:(?:what is|what's|whats)(?: the)? (?:current )?price|(?:any|are there any) (?:trade )?(?:setups|trades))", t)
    if not t or len(t) > 90 or asks:
        return None
    a = _one(t)
    return [a] if a else None
