// Python indicators and strategies: real CPython (Pyodide, with NumPy) in a Web Worker, so a
// script never blocks the chart. The script gets the chart's bars as NumPy arrays and an API
// modelled on Pine's — indicator() / strategy(), input.int(…), ta.sma(…), plot(…), hline(…),
// plotshape(…), strategy.entry(…) — and works on whole series at once, the NumPy way.
//
// The worker downloads Pyodide once (cached by the browser), then gives up its network access
// (fetch, XHR, WebSocket, importScripts) before any script runs, and a run that takes too long
// is stopped by terminating the worker.

import type { Bar, PineFill, PineHline, PineInputMeta, PineMarker, PinePlotResult, PineRunResult } from "../pineScriptEngine";
import { StrategySim } from "./strategySim";

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const RUN_TIMEOUT_MS = 15_000;
const BOOT_TIMEOUT_MS = 120_000;

const PRELUDE = String.raw`
import json as _json, sys as _sys, io as _io, traceback as _tb, math
import numpy as np
_nan = float("nan")
na = _nan
nan = _nan

class _State:
    def __init__(self, n, ov_index, ov_title):
        self.n = n
        self.meta = {"title": "", "isStrategy": False, "overlay": False, "initialCapital": 100000.0}
        self.plots = []; self.hlines = []; self.fills = []; self.markers = []; self.orders = []; self.legend = []
        self.input_i = 0; self.ov_index = ov_index; self.ov_title = ov_title
        self.sources = {}; self.default_qty = 1.0

_st = None

def _series(x, what="series"):
    n = _st.n
    if isinstance(x, np.ndarray):
        a = x if x.dtype == np.float64 else x.astype(np.float64)
        if a.ndim == 0:
            return np.full(n, float(a))
        if a.ndim != 1 or a.shape[0] != n:
            raise ValueError(what + " has " + str(a.shape[0]) + " values but the chart has " + str(n) + " bars")
        return a
    if isinstance(x, (list, tuple)):
        return _series(np.asarray(x, dtype=np.float64), what)
    if x is None:
        return np.full(n, _nan)
    return np.full(n, float(x))

def _bools(x):
    if isinstance(x, (np.ndarray, list, tuple)):
        a = np.asarray(x)
        if a.dtype != np.bool_:
            a = a.astype(np.float64)
            a = (a != 0) & ~np.isnan(a)
        if a.ndim != 1 or a.shape[0] != _st.n:
            raise ValueError("a condition has " + str(a.shape[0] if a.ndim else 1) + " values but the chart has " + str(_st.n) + " bars")
        return a
    return bool(x)

def _shift(a, k=1):
    out = np.full(a.shape[0], _nan)
    if k <= 0:
        return a.copy()
    if k < a.shape[0]:
        out[k:] = a[:-k]
    return out

def _list(a):
    a = _series(a)
    return np.where(np.isfinite(a), a, None).tolist()

def _opt(x):
    if x is None:
        return None
    if isinstance(x, (np.ndarray, list, tuple)):
        return _list(x)
    v = float(x)
    return v if math.isfinite(v) else None

def _when(x):
    b = _bools(x)
    if isinstance(b, bool):
        return b
    return b.astype(np.int8).tolist()

def nz(x, replacement=0.0):
    if isinstance(x, np.ndarray):
        return np.where(np.isnan(x), replacement, x)
    return replacement if x is None or (isinstance(x, float) and x != x) else x

def isna(x):
    if isinstance(x, np.ndarray):
        return np.isnan(x)
    return x is None or (isinstance(x, float) and x != x)

# --- Colours (Pine's palette) ---
class _Color:
    red = "#F23645"; green = "#089981"; blue = "#2962FF"; orange = "#FF9800"; purple = "#9C27B0"; yellow = "#FDD835"
    lime = "#00E676"; aqua = "#00BCD4"; fuchsia = "#E040FB"; gray = "#787B86"; white = "#FFFFFF"; black = "#363A45"
    teal = "#00897B"; maroon = "#880E4F"; navy = "#311B92"; olive = "#808000"; silver = "#B2B5BE"
    def new(self, c, transp=0):
        a = max(0, min(255, int(round(255 * (100 - float(transp)) / 100))))
        return str(c)[:7] + format(a, "02x")
    def rgb(self, r, g, b, transp=0):
        return self.new("#" + format(int(r), "02x") + format(int(g), "02x") + format(int(b), "02x"), transp)
color = _Color()
_PALETTE = ["#2962FF", "#FF6D00", "#00897B", "#AB47BC", "#F23645", "#00BCD4"]
def _col(c, i):
    return str(c) if c else _PALETTE[i % len(_PALETTE)]

# --- Declarations ---
def indicator(title="My script", shorttitle=None, overlay=False, **kwargs):
    _st.meta.update({"title": str(title), "shortTitle": shorttitle, "overlay": bool(overlay), "isStrategy": False})

class _Strategy:
    long = "long"
    short = "short"
    def __call__(self, title="My strategy", shorttitle=None, overlay=True, initial_capital=100000, default_qty_value=1, **kwargs):
        _st.meta.update({"title": str(title), "shortTitle": shorttitle, "overlay": bool(overlay), "isStrategy": True, "initialCapital": float(initial_capital)})
        _st.default_qty = float(default_qty_value)
    def _dir(self, d):
        if d in ("long", "buy", True, 1):
            return "long"
        if d in ("short", "sell", False, -1):
            return "short"
        raise ValueError("direction must be strategy.long or strategy.short")
    def _check(self):
        if not _st.meta["isStrategy"]:
            raise RuntimeError("call strategy(...) first: strategy orders need a strategy script")
    def entry(self, id, direction, when=True, qty=None, limit=None, stop=None, comment=None, **kwargs):
        self._check()
        _st.orders.append({"op": "entry", "id": str(id), "dir": self._dir(direction), "when": _when(when),
                           "qty": _opt(qty if qty is not None else _st.default_qty), "limit": _opt(limit), "stop": _opt(stop)})
    def exit(self, id, from_entry=None, when=True, stop=None, limit=None, comment=None, **kwargs):
        self._check()
        _st.orders.append({"op": "exit", "id": str(id), "when": _when(when), "stop": _opt(stop), "limit": _opt(limit)})
    def close(self, id=None, when=True, comment=None, **kwargs):
        self._check()
        _st.orders.append({"op": "close", "id": None if id is None else str(id), "when": _when(when), "comment": comment})
    def close_all(self, when=True, comment=None, **kwargs):
        self._check()
        _st.orders.append({"op": "close_all", "when": _when(when), "comment": comment})
    def cancel(self, id=None, when=True, **kwargs):
        _st.orders.append({"op": "cancel", "id": None if id is None else str(id), "when": _when(when)})
strategy = _Strategy()

# --- Inputs (shown in the script's settings; the nth input call is the nth row there) ---
class _Input:
    def _take(self, defval, title):
        i = _st.input_i
        _st.input_i += 1
        if title is not None and str(title) in _st.ov_title:
            return _st.ov_title[str(title)]
        if str(i) in _st.ov_index:
            return _st.ov_index[str(i)]
        return defval
    def __call__(self, defval, title=None, **kwargs):
        if isinstance(defval, bool):
            return self.bool(defval, title)
        if isinstance(defval, int):
            return self.int(defval, title, **kwargs)
        if isinstance(defval, float):
            return self.float(defval, title, **kwargs)
        if isinstance(defval, np.ndarray):
            return self.source(defval, title)
        return self.string(defval, title, **kwargs)
    def int(self, defval, title=None, minval=None, maxval=None, step=None, **kwargs):
        v = int(round(float(self._take(defval, title))))
        if minval is not None: v = max(v, int(minval))
        if maxval is not None: v = min(v, int(maxval))
        _st.legend.append(str(v))
        return v
    def float(self, defval, title=None, minval=None, maxval=None, step=None, **kwargs):
        v = float(self._take(defval, title))
        if minval is not None: v = max(v, float(minval))
        if maxval is not None: v = min(v, float(maxval))
        _st.legend.append(("%g" % v))
        return v
    def bool(self, defval, title=None, **kwargs):
        v = self._take(defval, title)
        return v if isinstance(v, bool) else str(v).lower() == "true"
    def string(self, defval, title=None, options=None, **kwargs):
        v = str(self._take(defval, title))
        _st.legend.append(v)
        return v
    def color(self, defval, title=None, **kwargs):
        return str(self._take(defval, title))
    def source(self, defval=None, title=None, **kwargs):
        name = defval if isinstance(defval, str) else None
        if name is None:
            for k, a in _st.sources.items():
                if a is defval:
                    name = k
                    break
        name = name or "close"
        v = self._take(name, title)
        name = v if v in _st.sources else name
        _st.legend.append(name)
        return _st.sources[name]
input = _Input()
input_int = input.int; input_float = input.float; input_bool = input.bool; input_string = input.string; input_source = input.source; input_color = input.color

# --- Indicator maths (whole series in, whole series out; NaN where not available yet) ---
def _window(s, L):
    return np.lib.stride_tricks.sliding_window_view(s, L)

class _TA:
    def sma(self, source, length):
        s = _series(source); L = int(length); n = s.shape[0]; out = np.full(n, _nan)
        if L < 1 or L > n:
            return out
        bad = np.isnan(s)
        c = np.concatenate(([0.0], np.cumsum(np.where(bad, 0.0, s))))
        k = np.concatenate(([0], np.cumsum(bad)))
        out[L - 1:] = np.where(k[L:] - k[:-L] > 0, _nan, (c[L:] - c[:-L]) / L)
        return out
    def _rec(self, s, L, alpha):
        vals = s.tolist(); out = [_nan] * len(vals); prev = _nan; acc = 0.0; cnt = 0
        for i, v in enumerate(vals):
            if v != v:
                continue
            if prev != prev:
                acc += v; cnt += 1
                if cnt == L:
                    prev = acc / L; out[i] = prev
            else:
                prev = alpha * v + (1.0 - alpha) * prev; out[i] = prev
        return np.array(out)
    def ema(self, source, length):
        L = int(length); return self._rec(_series(source), L, 2.0 / (L + 1))
    def rma(self, source, length):
        L = int(length); return self._rec(_series(source), L, 1.0 / L)
    def wma(self, source, length):
        s = _series(source); L = int(length); n = s.shape[0]; out = np.full(n, _nan)
        if L < 1 or L > n:
            return out
        w = np.arange(L, 0, -1, dtype=np.float64)
        out[L - 1:] = np.convolve(s, w, "valid") / w.sum()
        return out
    def vwma(self, source, length):
        v = _st.sources["volume"]; s = _series(source)
        with np.errstate(all="ignore"):
            return self.sma(s * v, length) / self.sma(v, length)
    def stdev(self, source, length):
        s = _series(source); m = self.sma(s, length)
        return np.sqrt(np.maximum(self.sma(s * s, length) - m * m, 0.0))
    def highest(self, source, length=None):
        if length is None:
            source, length = _st.sources["high"], source
        s = _series(source); L = int(length); n = s.shape[0]; out = np.full(n, _nan)
        if 1 <= L <= n:
            out[L - 1:] = _window(s, L).max(axis=1)
        return out
    def lowest(self, source, length=None):
        if length is None:
            source, length = _st.sources["low"], source
        s = _series(source); L = int(length); n = s.shape[0]; out = np.full(n, _nan)
        if 1 <= L <= n:
            out[L - 1:] = _window(s, L).min(axis=1)
        return out
    def change(self, source, length=1):
        s = _series(source); return s - _shift(s, int(length))
    def mom(self, source, length):
        return self.change(source, length)
    def roc(self, source, length):
        s = _series(source); p = _shift(s, int(length))
        with np.errstate(all="ignore"):
            return 100.0 * (s - p) / p
    def tr(self, handle_na=True):
        h, l, c = _st.sources["high"], _st.sources["low"], _st.sources["close"]
        pc = _shift(c, 1)
        t = np.fmax(h - l, np.fmax(np.abs(h - pc), np.abs(l - pc)))
        return t
    def atr(self, length):
        return self.rma(self.tr(), length)
    def rsi(self, source, length):
        s = _series(source); d = s - _shift(s, 1); bad = np.isnan(d)
        up = np.where(d > 0, d, 0.0); dn = np.where(d < 0, -d, 0.0); up[bad] = _nan; dn[bad] = _nan
        au = self.rma(up, length); ad = self.rma(dn, length)
        with np.errstate(all="ignore"):
            r = 100.0 - 100.0 / (1.0 + au / ad)
        r = np.where(ad == 0, 100.0, np.where(au == 0, 0.0, r))
        r[np.isnan(au) | np.isnan(ad)] = _nan
        return r
    def macd(self, source, fastlen=12, slowlen=26, siglen=9):
        m = self.ema(source, fastlen) - self.ema(source, slowlen)
        sig = self.ema(m, siglen)
        return m, sig, m - sig
    def bb(self, source, length=20, mult=2.0):
        b = self.sma(source, length); d = mult * self.stdev(source, length)
        return b, b + d, b - d
    def crossover(self, a, b):
        a = _series(a); b = _series(b)
        return (a > b) & (_shift(a) <= _shift(b))
    def crossunder(self, a, b):
        a = _series(a); b = _series(b)
        return (a < b) & (_shift(a) >= _shift(b))
    def cross(self, a, b):
        return self.crossover(a, b) | self.crossunder(a, b)
    def cci(self, source, length):
        s = _series(source); L = int(length); n = s.shape[0]; m = self.sma(s, L); md = np.full(n, _nan)
        if 1 <= L <= n:
            w = _window(s, L); md[L - 1:] = np.abs(w - w.mean(axis=1, keepdims=True)).mean(axis=1)
        with np.errstate(all="ignore"):
            return (s - m) / (0.015 * md)
    def stoch(self, source, high, low, length):
        s = _series(source); hh = self.highest(high, length); ll = self.lowest(low, length)
        with np.errstate(all="ignore"):
            return 100.0 * (s - ll) / (hh - ll)
    def obv(self):
        c = _st.sources["close"]; d = np.sign(c - _shift(c)); d[0] = 0.0
        return np.cumsum(np.nan_to_num(d) * _st.sources["volume"])
    def cum(self, source):
        return np.nancumsum(_series(source))
    def sum(self, source, length):
        return self.sma(source, length) * int(length)
    def barssince(self, condition):
        b = _bools(condition); out = np.full(_st.n, _nan); last = -1
        for i, v in enumerate((b if not isinstance(b, bool) else np.full(_st.n, b)).tolist()):
            if v:
                last = i
            if last >= 0:
                out[i] = i - last
        return out
    def valuewhen(self, condition, source, occurrence=0):
        b = _bools(condition); s = _series(source); out = np.full(_st.n, _nan); hits = []
        for i, v in enumerate((b if not isinstance(b, bool) else np.full(_st.n, b)).tolist()):
            if v:
                hits.append(s[i])
            if len(hits) > occurrence:
                out[i] = hits[-1 - occurrence]
        return out
    def vwap(self, source=None):
        s = _series(source if source is not None else _st.sources["hlc3"]); v = _st.sources["volume"]
        day = (_st.time // 86400).astype(np.int64)
        out = np.full(_st.n, _nan); pv = 0.0; vv = 0.0; prev = None
        for i in range(_st.n):
            if day[i] != prev:
                pv = 0.0; vv = 0.0; prev = day[i]
            pv += s[i] * v[i]; vv += v[i]
            out[i] = pv / vv if vv else s[i]
        return out
    def supertrend(self, factor, atrPeriod):
        h, l, c = _st.sources["high"], _st.sources["low"], _st.sources["close"]
        src = (h + l) / 2.0; a = self.atr(atrPeriod)
        upper = (src + factor * a).tolist(); lower = (src - factor * a).tolist(); cl = c.tolist(); av = a.tolist()
        n = _st.n; st = [_nan] * n; dr = [_nan] * n
        pu = pl = pst = _nan
        for i in range(n):
            u, lo = upper[i], lower[i]
            if u != u:
                continue
            if pl == pl:
                lo = lo if (lo > pl or cl[i - 1] < pl) else pl
                u = u if (u < pu or cl[i - 1] > pu) else pu
            if i == 0 or av[i - 1] != av[i - 1]:
                d = 1
            elif pst == pu:
                d = -1 if cl[i] > u else 1
            else:
                d = 1 if cl[i] < lo else -1
            st[i] = lo if d == -1 else u; dr[i] = d
            pu, pl, pst = u, lo, st[i]
        return np.array(st), np.array(dr)
ta = _TA()

# --- Output ---
class _Handle:
    def __init__(self, kind, index):
        self.kind = kind; self.index = index

_STYLES = {"line", "stepline", "histogram", "columns", "circles", "cross", "area", "linebr", "areabr", "steplinebr"}
def plot(series, title=None, color=None, linewidth=1, style="line", display=True, **kwargs):
    i = len(_st.plots)
    st = str(style).replace("plot.style_", "")
    _st.plots.append({"title": str(title) if title is not None else "Plot " + str(i + 1), "color": _col(color, i), "values": _list(series),
                      "lineWidth": int(linewidth), "style": st if st in _STYLES else "line", "hidden": not display})
    return _Handle("plot", i)
for _s in _STYLES:
    setattr(plot, "style_" + _s, _s)

def hline(price, title=None, color="#787B86", linestyle="dashed", linewidth=1, **kwargs):
    i = len(_st.hlines)
    _st.hlines.append({"id": i, "price": float(price), "title": str(title) if title is not None else str(price), "color": str(color),
                       "lineStyle": str(linestyle).replace("hline.style_", ""), "lineWidth": int(linewidth)})
    return _Handle("hline", i)
hline.style_solid = "solid"; hline.style_dashed = "dashed"; hline.style_dotted = "dotted"

def fill(a, b, color=None, title=None, **kwargs):
    if not isinstance(a, _Handle) or not isinstance(b, _Handle):
        raise TypeError("fill() takes two values returned by plot() or hline()")
    _st.fills.append({"a": {"kind": a.kind, "index": a.index}, "b": {"kind": b.kind, "index": b.index}, "title": str(title or "Fill"), "color": color})

class _Shape:
    arrowup = "arrowUp"; arrowdown = "arrowDown"; triangleup = "arrowUp"; triangledown = "arrowDown"; labelup = "arrowUp"; labeldown = "arrowDown"
    circle = "circle"; square = "square"; diamond = "square"; cross = "square"; xcross = "square"; flag = "square"
shape = _Shape()
class _Location:
    abovebar = "aboveBar"; belowbar = "belowBar"; top = "aboveBar"; bottom = "belowBar"; absolute = "atPriceMiddle"
location = _Location()

def plotshape(series, title=None, location="aboveBar", color=None, style="circle", text="", textcolor=None, **kwargs):
    loc = {"abovebar": "aboveBar", "belowbar": "belowBar", "absolute": "atPriceMiddle", "top": "aboveBar", "bottom": "belowBar"}.get(str(location).lower(), str(location))
    shp = getattr(shape, str(style).replace("shape.", "").lower(), str(style))
    if shp not in ("arrowUp", "arrowDown", "circle", "square"):
        shp = "circle"
    c = str(color) if color else ("#089981" if loc == "belowBar" else "#F23645")
    if loc == "atPriceMiddle":
        vals = _series(series)
        hits = np.where(np.isfinite(vals))[0]
    else:
        b = _bools(series)
        hits = np.where(b)[0] if not isinstance(b, bool) else (np.arange(_st.n) if b else np.array([], dtype=np.int64))
    for i in hits.tolist()[-2000:]:
        m = {"i": int(i), "position": loc, "color": c, "shape": shp, "text": str(text)}
        if loc == "atPriceMiddle":
            m["price"] = float(vals[i])
        if textcolor:
            m["textColor"] = str(textcolor)
        _st.markers.append(m)
def plotchar(series, title=None, char="•", location="aboveBar", color=None, **kwargs):
    plotshape(series, title, location, color, "circle", char)

_API = {k: v for k, v in dict(globals()).items() if not k.startswith("_") or k in ()}
for _k in ("json",):
    _API.pop(_k, None)

def __tp_run(payload):
    global _st
    p = _json.loads(payload)
    n = len(p["close"])
    _st = _State(n, p.get("ovIndex") or {}, p.get("ovTitle") or {})
    a = {k: np.asarray(p[k], dtype=np.float64) for k in ("open", "high", "low", "close", "volume", "time")}
    src = {"open": a["open"], "high": a["high"], "low": a["low"], "close": a["close"], "volume": a["volume"]}
    src["hl2"] = (a["high"] + a["low"]) / 2.0
    src["hlc3"] = (a["high"] + a["low"] + a["close"]) / 3.0
    src["ohlc4"] = (a["open"] + a["high"] + a["low"] + a["close"]) / 4.0
    src["hlcc4"] = (a["high"] + a["low"] + 2.0 * a["close"]) / 4.0
    _st.sources = src
    _st.time = a["time"]
    ns = {"__name__": "__script__", "__builtins__": __builtins__}
    ns.update(_API)
    ns.update(src)
    ns.update({"time": a["time"], "bar_index": np.arange(n, dtype=np.float64), "symbol": p.get("symbol", ""), "timeframe": p.get("tf", "")})
    out = _io.StringIO(); old = _sys.stdout; _sys.stdout = out
    err = None
    try:
        exec(compile(p["code"], "<script>", "exec"), ns)
    except SyntaxError as e:
        err = {"message": "SyntaxError: " + str(e.msg), "line": e.lineno or 1}
    except BaseException as e:
        line = 1
        for fr in _tb.extract_tb(e.__traceback__):
            if fr.filename == "<script>":
                line = fr.lineno
        err = {"message": type(e).__name__ + ": " + str(e), "line": line}
    finally:
        _sys.stdout = old
    logs = out.getvalue().splitlines()[-1000:]
    res = {"meta": _st.meta, "plots": _st.plots, "hlines": _st.hlines, "fills": _st.fills, "markers": _st.markers,
           "orders": _st.orders, "legend": _st.legend, "logs": logs, "error": err}
    try:
        return _json.dumps(res, allow_nan=False, default=str)
    except ValueError:
        return _json.dumps({"meta": _st.meta, "plots": [], "hlines": [], "fills": [], "markers": [], "orders": [], "legend": [], "logs": logs,
                            "error": {"message": "ValueError: a value passed to plot() or strategy isn't a finite number", "line": 1}}, default=str)
`;

const WORKER_SRC = `
let py = null, ready = null;
const PRELUDE = ${JSON.stringify(PRELUDE)};
async function boot(indexURL) {
  importScripts(indexURL + "pyodide.js");
  py = await loadPyodide({ indexURL });
  await py.loadPackage("numpy");
  py.runPython(PRELUDE);
  // From here on the worker can't reach the network: scripts only get the bars they're given
  for (const k of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "BroadcastChannel", "Worker", "SharedWorker", "WebTransport"]) {
    try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch (e) { try { self[k] = undefined; } catch (e2) {} }
  }
  self.postMessage({ type: "booted" });
}
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (!ready) ready = boot(m.indexURL);
    await ready;
    py.globals.set("__tp_payload", m.payload);
    const out = py.runPython("__tp_run(__tp_payload)");
    self.postMessage({ type: "result", id: m.id, out });
  } catch (err) {
    self.postMessage({ type: "result", id: m.id, fatal: String((err && err.message) || err) });
  }
};
`;

type Pending = { resolve: (v: any) => void; timer: ReturnType<typeof setTimeout> | null; payload: string };
let worker: Worker | null = null;
let booted = false;
let seq = 0;
const pending = new Map<number, Pending>();
const statusListeners = new Set<(s: string) => void>();
export function onPythonStatus(f: (s: string) => void) { statusListeners.add(f); return () => { statusListeners.delete(f); }; }
export const pythonReady = () => booted;

function armTimer(id: number) {
  const p = pending.get(id);
  if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    // A runaway script: stop the worker (the next run starts a fresh one)
    worker?.terminate();
    worker = null;
    booted = false;
    pending.forEach((q, qid) => { if (q.timer) clearTimeout(q.timer); q.resolve({ fatal: qid === id ? `The script took longer than ${RUN_TIMEOUT_MS / 1000} seconds and was stopped` : "Python was restarted; run the script again" }); });
    pending.clear();
  }, booted ? RUN_TIMEOUT_MS : BOOT_TIMEOUT_MS);
}

function getWorker(): Worker {
  if (worker) return worker;
  const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  const w = new Worker(url);
  URL.revokeObjectURL(url);
  w.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m?.type === "booted") {
      booted = true;
      statusListeners.forEach(f => f("ready"));
      pending.forEach((_, id) => armTimer(id));
      return;
    }
    if (m?.type !== "result") return;
    const p = pending.get(m.id);
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    pending.delete(m.id);
    p.resolve(m);
  };
  w.onerror = (e) => {
    const text = e.message || "Python couldn't start (is the internet connection available for the first download?)";
    pending.forEach(q => { if (q.timer) clearTimeout(q.timer); q.resolve({ fatal: text }); });
    pending.clear();
    w.terminate();
    worker = null;
    booted = false;
  };
  worker = w;
  return w;
}

function callWorker(payload: string): Promise<{ out?: string; fatal?: string }> {
  return new Promise(resolve => {
    const id = ++seq;
    const w = getWorker();
    if (!booted) statusListeners.forEach(f => f("loading"));
    pending.set(id, { resolve, timer: null, payload });
    armTimer(id);
    w.postMessage({ id, payload, indexURL: PYODIDE_URL });
  });
}

// Inputs as the settings dialog shows them, read without running the script: every
// input(…) / input.int(…) / input_int(…) call, in order
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0, q: string | null = null, cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === "\\") { cur += s[++i] ?? ""; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function pyLiteral(s: string): any {
  const t = s.trim();
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?(\d+\.\d*|\.\d+|\d+)(e[+-]?\d+)?$/i.test(t)) return parseFloat(t);
  if (t === "True") return true;
  if (t === "False") return false;
  if (t === "None") return null;
  const m = t.match(/^[rbuf]?(["'])([\s\S]*)\1$/i);
  if (m) return m[2];
  if (t.startsWith("[") || t.startsWith("(")) return splitArgs(t.slice(1, -1)).map(pyLiteral);
  return { ident: t };
}
export interface PyInput extends PineInputMeta { explicitTitle: boolean }
export function scanPythonInputs(code: string): PyInput[] {
  // Comments and strings out of the way (kept the same length, so positions still match)
  const clean = code.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|#[^\n]*)/g, m => (m.startsWith("#") ? " ".repeat(m.length) : m));
  const res: PyInput[] = [];
  const re = /(^|[^\w.])input(?:[._](int|float|bool|string|source|color))?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const open = m.index + m[0].length - 1;
    let depth = 0, i = open, q: string | null = null;
    for (; i < clean.length; i++) {
      const c = clean[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) break; }
    }
    const args = splitArgs(clean.slice(open + 1, i));
    const pos: any[] = [], kw: Record<string, any> = {};
    for (const a of args) {
      const km = a.match(/^(\w+)\s*=(?!=)\s*([\s\S]*)$/);
      if (km) kw[km[1]] = pyLiteral(km[2]); else pos.push(pyLiteral(a));
    }
    const defval = kw.defval ?? pos[0];
    const titleArg = kw.title ?? pos[1];
    const lineStart = clean.lastIndexOf("\n", m.index) + 1;
    const before = clean.slice(lineStart, m.index + m[1].length);
    const varName = (before.match(/([A-Za-z_]\w*)\s*=\s*$/) || [])[1] || `input${res.length + 1}`;
    let type = (m[2] || "") as PineInputMeta["type"] | "";
    if (!type) type = typeof defval === "boolean" ? "bool" : typeof defval === "number" ? (Number.isInteger(defval) && !/\./.test(String(pos[0] ?? "")) ? "int" : "float") : defval && typeof defval === "object" && "ident" in defval ? "source" : "string";
    const value = type === "source" ? (typeof defval === "string" ? defval : defval?.ident || "close") : defval;
    const meta: PyInput = { varName, type: type as PineInputMeta["type"], title: typeof titleArg === "string" ? titleArg : varName, explicitTitle: typeof titleArg === "string", value };
    if (typeof kw.group === "string") meta.group = kw.group;
    if (typeof kw.tooltip === "string") meta.tooltip = kw.tooltip;
    if (typeof kw.minval === "number") meta.minval = kw.minval;
    if (typeof kw.maxval === "number") meta.maxval = kw.maxval;
    if (typeof kw.step === "number") meta.step = kw.step;
    if (Array.isArray(kw.options)) meta.options = kw.options.map(String);
    res.push(meta);
    re.lastIndex = i;
  }
  return res;
}
export const getPythonInputsMeta = (code: string): PineInputMeta[] => scanPythonInputs(code).map(({ explicitTitle: _e, ...m }) => m);

export interface PythonRunOpts { symbol: string; pineTf: string; initialCapital?: number; inputOverrides?: Record<string, any>; backtestFrom?: number; backtestTo?: number }

export async function runPython(code: string, bars: Bar[], opts: PythonRunOpts): Promise<PineRunResult> {
  const t0 = performance.now();
  const meta: PineRunResult["meta"] = { title: "", isStrategy: false, overlay: false, initialCapital: opts.initialCapital ?? 100000 };
  const result: PineRunResult = { plots: [], hlines: [], fills: [], markers: [], tables: [], strategyReport: null, inputs: [], logs: [], warnings: [], errors: [], meta, execMs: 0 };
  if (typeof Worker === "undefined") { result.errors.push({ message: "Python needs a browser with Web Workers", code: "PY", line: 1 }); return result; }

  // Settings overrides, by input position (and by title when the script gives one)
  const inputs = scanPythonInputs(code);
  const ovIndex: Record<string, any> = {}, ovTitle: Record<string, any> = {};
  inputs.forEach((m, k) => {
    const v = opts.inputOverrides?.[m.varName];
    if (v === undefined) return;
    ovIndex[String(k)] = v;
    if (m.explicitTitle) ovTitle[m.title] = v;
  });
  const payload = JSON.stringify({
    code, symbol: opts.symbol, tf: opts.pineTf, ovIndex, ovTitle,
    time: bars.map(b => b.time), open: bars.map(b => b.open), high: bars.map(b => b.high), low: bars.map(b => b.low), close: bars.map(b => b.close), volume: bars.map(b => b.volume ?? 0),
  });
  const reply = await callWorker(payload);
  if (reply.fatal || !reply.out) {
    result.errors.push({ message: reply.fatal || "Python stopped unexpectedly", code: "PY", line: 1 });
    result.execMs = performance.now() - t0;
    return result;
  }
  const r = JSON.parse(reply.out);
  Object.assign(meta, r.meta, { initialCapital: opts.initialCapital ?? r.meta.initialCapital ?? 100000 });
  if (!meta.shortTitle) delete meta.shortTitle;
  result.logs = r.logs || [];
  result.inputs = r.legend || [];
  if (r.error) {
    result.errors.push({ message: r.error.message, code: "PY", line: r.error.line || 1 });
    result.execMs = performance.now() - t0;
    return result;
  }
  const times = bars.map(b => b.time);
  result.plots = (r.plots as any[]).map((p): PinePlotResult => ({
    title: p.title, color: p.color, lineWidth: p.lineWidth, style: p.style, hidden: p.hidden || undefined,
    values: (p.values as (number | null)[]).reduce<{ time: number; value: number }[]>((acc, v, i) => { if (v !== null && i < times.length) acc.push({ time: times[i], value: v }); return acc; }, []),
  }));
  result.hlines = r.hlines as PineHline[];
  result.fills = (r.fills as any[]).map((f): PineFill => ({ a: f.a, b: f.b, title: f.title, color: f.color || undefined }));
  const markers: PineMarker[] = (r.markers as any[]).filter(m => m.i < times.length).map(m => ({ time: times[m.i], position: m.position, color: m.color, shape: m.shape, text: m.text, price: m.price, textColor: m.textColor }));

  if (meta.isStrategy) {
    const orders = r.orders as any[];
    const at = (v: any, i: number) => (Array.isArray(v) ? v[i] : v);
    const sim = new StrategySim(bars, { initialCapital: meta.initialCapital, backtestFrom: opts.backtestFrom, backtestTo: opts.backtestTo });
    for (let i = 0; i < bars.length; i++) {
      sim.beginBar(i);
      for (const o of orders) {
        if (!at(o.when, i)) continue;
        switch (o.op) {
          case "entry": { const q = at(o.qty, i); sim.queueEntry(o.id, o.dir, q == null ? 1 : q, at(o.limit, i) ?? null, at(o.stop, i) ?? null); break; }
          case "exit": sim.setExit(o.id, at(o.stop, i) ?? null, at(o.limit, i) ?? null); break;
          case "close": if (sim.position && (o.id == null || sim.position.id === o.id)) sim.close(o.comment || `Close entry(s) order ${o.id ?? sim.position.id}`); break;
          case "close_all": sim.close(o.comment || "Close position order"); break;
          case "cancel": sim.cancel(o.id ?? undefined); break;
        }
      }
      sim.endBar();
    }
    result.strategyReport = sim.report();
    markers.push(...sim.markers);
  }
  result.markers = markers.sort((a, b) => a.time - b.time);
  result.execMs = performance.now() - t0;
  return result;
}
