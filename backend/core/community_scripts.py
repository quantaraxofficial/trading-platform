# The community scripts in the Indicators dialog's Editors' picks (src/app/lib/communityScripts.ts), which the
# voice assistant can add by name. Keep in step with that file.
COMMUNITY_SCRIPTS = [
    "Adaptive Trend Classification: Moving Averages [InvestorUnknown]",
    "Breakout Volume Delta | Flux Charts",
    "Bull Vs. Bear Market Intraday Sessions [Kioseff Trading]",
    "Central Bank Liquidity Gap Indicator",
    "Chess",
    "Confluence Profile",
    "CVD Profiles [TradingIQ]",
    "Delta Ladder [Kioseff Trading]",
    "FlowScope [Hapharmonic]",
    "Focus Bars [Kioseff Trading]",
    "Innovation Adaptive Kalman Filter Oscillator",
    "Intrabar Profile [Kioseff Trading]",
    "Intraday Spark Chart [AstrideUnicorn]",
    "Kalman D7",
    "Kinetic Slippage Index (KSI)",
    "MACD with HTF Panels [theUltimator5]",
    "Machine Learning Pivot Points (KNN) [SS]",
    "Market Cap Landscape 3D",
    "Market Structure Dashboard | Flux Charts",
    "Market Structure Volume Profiles [Kioseff Trading]",
    "Markov Chain [3D] | Fractalyst",
    "Match Finder [theUltimator5]",
    "Multi Timeframe Volume Profiles [TradingIQ]",
    "Multi-Ticker Anchored Candles",
    "Options Max Pain Calculator [BackQuant]",
    "Pong",
    "Pumori",
    "RedK DualTF Volume-Accelerated CCI",
    "RedK Indicator Amplifier v1.0",
    "RedK Multi-Modal TrailingStop v1.0",
    "RSI Radar Multi Time Frame",
    "Session Edge Profiler | Flux Charts",
    "Simplified Percentile Clustering",
    "Smooth Theil-Sen",
    "Stop Loss Clustering (Breakouts) [Kioseff Trading]",
    "Swing Structure Forecast [BOSWaves]",
    "T-Virus Sentiment [hapharmonic]",
    "Tick CVD [Kioseff Trading]",
    "Time & Sales (Tape) [By MUQWISHI]",
    "Trend Target Ribbon [BOSWaves]",
    "Vdubus Pattern Gen V2 [Restored & Refined]",
    "Vol-Control Fund Positioning",
    "Volatility Risk Premium",
    "Volume Spread Analysis IQ [TradingIQ]",
    "VWAP Price Channel",
    "Whale Liquidity and Absorption Profile [AlgoAlpha]",
    "Wyckoff Schematic by Kingshuk Ghosh",
]

import re

_FILLER = {"the", "a", "an", "indicator", "script", "by", "of", "and", "on", "my", "chart", "to"}


def _words(text):
    """The words of a name or of what was said, lower case, without punctuation"""
    return [w for w in re.sub(r"[^a-z0-9]+", " ", text.lower()).split() if w not in _FILLER]


def match_community_script(said, strict=False):
    """The Editors' pick a spoken name means, or None. strict: every word said is in the name (the fast
    path, so "add chess" finds Chess but "add volume" never takes a community script); else most of
    them (a name the AI passed on, maybe shortened)"""
    if not isinstance(said, str) or not said.strip():
        return None
    for name in COMMUNITY_SCRIPTS:
        if name.lower() == said.strip().lower():
            return name
    wanted = set(_words(said))
    if not wanted:
        return None
    best, best_key = None, None
    for name in COMMUNITY_SCRIPTS:
        have = set(_words(name))
        hits = len(wanted & have)
        if not hits:
            continue
        ratio = hits / len(wanted)
        if (strict and ratio < 1) or ratio < 0.6:
            continue
        # (on the fast path one word has to be most of the name: "chess", "pong", not "volume")
        if strict and hits < 2 and hits / len(have) < 0.5:
            continue
        # most words matched, then the name covered best, then the shorter name
        key = (hits, hits / len(have), -len(name))
        if best_key is None or key > best_key:
            best, best_key = name, key
    return best
