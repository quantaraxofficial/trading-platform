"""Vantage market data for the chart: candles on any timeframe from ClickHouse's 30-second bars,
and the live feed (the MT5 collector posts ticks here; they are relayed to open charts over the
ticks WebSocket in consumers.py).

Bars start where TradingView's OANDA bars start: each trading day opens at 17:00 New York, which
is 00:00 on Vantage's server clock (New York + 7 h), so intraday bars count from there, daily
bars are labelled with the server date, weeks start on Monday (the Sunday-evening open) and
months are calendar months.

The bar being built right now (inside the current 30 seconds) lives in memory only: closed
30-second bars go to ClickHouse, and each candles reply adds the open one on top.

15 and 45 seconds can't be made from 30-second bars: the collector also stores 15-second bars, in
tick_bars_15s (from when it started doing so, plus the week it catches up on), and those charts
are built from them.
"""
import hmac
import json
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

NY = ZoneInfo("America/New_York")
SERVER_SHIFT = 7 * 3600          # Vantage server clock = New York + 7 h
SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9._-]{0,23}$")
INTERVAL_RE = re.compile(r"^(\d{1,4})(s|min|h|day|week|month)$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$")
MAX_BARS = 5000
MAX_TICKS_PER_POST = 5000
MAX_CLOSED_PER_POST = 20000

# symbol -> {"bar": [t_ms, o, h, l, c, n], "bid", "ask", "t": last tick ms (UTC), "rx": receive time}
LIVE: dict[str, dict] = {}
_lock = threading.Lock()
_cache: dict[tuple, tuple[float, list]] = {}


def group_of(symbol: str) -> str:
    return f"ticks.{symbol}"


def _ch():
    from pipeline.clickhouse_client import ClickHouseClient
    return ClickHouseClient()


def _db() -> str:
    from pipeline.config import CONFIG
    return CONFIG.CH_DATABASE


# ------------------------------------------------------------------ bar boundaries

def _server_secs(utc_s: float) -> int:
    """UTC seconds -> seconds on Vantage's server clock (New York + 7 h)"""
    off = datetime.fromtimestamp(utc_s, NY).utcoffset().total_seconds()
    return int(utc_s + SERVER_SHIFT + off)


def parse_interval(interval: str):
    """("intraday", seconds) | ("day"|"week"|"month", n) | None"""
    m = INTERVAL_RE.match(interval or "")
    if not m:
        return None
    n, unit = int(m.group(1)), m.group(2)
    if n <= 0:
        return None
    if unit in ("s", "min", "h"):
        secs = n * {"s": 1, "min": 60, "h": 3600}[unit]
        # Built from 30-second bars, or 15-second ones for 15 s / 45 s: other lengths can't be made
        if secs % 15 or secs > 86400:
            return None
        return ("intraday", secs)
    return (unit, n)


def _bucket_sql(kind: str, n: int) -> str:
    """ClickHouse expression for the bar label (unix seconds) of a 30-second row, given u (UTC
    seconds) and s (server-clock seconds). Intraday bars restart at each server midnight."""
    if kind == "intraday":
        return f"(intDiv(s, 86400) * 86400 + intDiv(s % 86400, {n}) * {n}) - (s - u)"
    day = "toDate(toDateTime(intDiv(s, 86400) * 86400, 'UTC'))"
    if kind == "day":
        date = day if n == 1 else f"toDate(toDateTime(intDiv(intDiv(s, 86400), {n}) * {n} * 86400, 'UTC'))"
    elif kind == "week":
        # Monday-based weeks (1970-01-05 was a Monday: day 4)
        date = f"toDate(toDateTime((4 + intDiv(intDiv(s, 86400) - 4, {7 * n}) * {7 * n}) * 86400, 'UTC'))"
    else:
        mon = f"(toYear({day}) * 12 + toMonth({day}) - 1)"
        date = f"makeDate(intDiv(intDiv({mon}, {n}) * {n}, 12), (intDiv({mon}, {n}) * {n}) % 12 + 1, 1)"
    return f"toUnixTimestamp(toDateTime({date}, 'UTC'))"


def bucket_of(kind: str, n: int, t_ms: int) -> int:
    """The same label in Python, for the live bar"""
    u = t_ms // 1000
    s = _server_secs(u)
    if kind == "intraday":
        return (s // 86400 * 86400 + (s % 86400) // n * n) - (s - u)
    d = s // 86400
    if kind == "day":
        return d // n * n * 86400
    if kind == "week":
        return (4 + (d - 4) // (7 * n) * (7 * n)) * 86400
    dt = datetime.fromtimestamp(d * 86400, timezone.utc)
    mon = (dt.year * 12 + dt.month - 1) // n * n
    return int(datetime(mon // 12, mon % 12 + 1, 1, tzinfo=timezone.utc).timestamp())


def _table(kind: str, n: int) -> str:
    """The stored bars a timeframe is built from"""
    return "tick_bars_15s" if kind == "intraday" and n % 30 else "tick_bars"


_bars15_ready = False


def _ensure_bars15(ch) -> None:
    """The 15-second bars' table (made the first time it's needed), like tick_bars"""
    global _bars15_ready
    if _bars15_ready:
        return
    from pipeline.config import CONFIG
    sql = (f"CREATE TABLE IF NOT EXISTS {_db()}.tick_bars_15s ("
           " symbol LowCardinality(String), ts DateTime64(3, 'UTC') CODEC(Delta, ZSTD(3)),"
           " open Float64, high Float64, low Float64, close Float64, ticks UInt32)"
           " ENGINE = ReplacingMergeTree() ORDER BY (symbol, ts)"
           f" TTL toDateTime(ts) + toIntervalDay({CONFIG.DATA_TTL_DAYS}) SETTINGS index_granularity = 8192")
    r = ch._session.post(f"{ch._base}/", params={"database": _db()}, data=sql.encode(), timeout=30)
    r.raise_for_status()
    _bars15_ready = True


def _span(kind: str, n: int) -> int:
    return {"intraday": n, "day": 86400 * n, "week": 7 * 86400 * n, "month": 31 * 86400 * n}[kind]


def _parse_dt(value: str, end: bool) -> int | None:
    """'YYYY-MM-DD' (the whole day when it's an end) or 'YYYY-MM-DD HH:MM[:SS]', UTC -> unix s"""
    if not value or not DATE_RE.match(value):
        return None
    if len(value) == 10:
        t = int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp())
        return t + 86399 if end else t
    return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp())


# ------------------------------------------------------------------ candles

def query_bars(symbol: str, kind: str, n: int, end: int | None, start: int | None, limit: int) -> list:
    span = _span(kind, n)
    where = [f"symbol = '{symbol}'"]
    having = []
    if end is not None:
        where.append(f"ts < toDateTime64({end + span + 86400}, 3, 'UTC')")
        having.append(f"k <= {end}")
    if start is not None:
        where.append(f"ts >= toDateTime64({start - span}, 3, 'UTC')")
        having.append(f"k >= {start}")
    elif kind == "intraday":
        # Enough raw rows for `limit` bars across weekends and holidays
        upto = end if end is not None else int(time.time())
        where.append(f"ts >= toDateTime64({upto - limit * n * 2 - 5 * 86400}, 3, 'UTC')")
    sql = (
        "SELECT k, argMin(open, ts) AS o, max(high) AS h, min(low) AS l, argMax(close, ts) AS c, "
        "sum(ticks) AS v FROM ("
        f"SELECT ts, open, high, low, close, ticks, toUnixTimestamp(ts) AS u, "
        f"u + {SERVER_SHIFT} + timeZoneOffset(toTimeZone(ts, 'America/New_York')) AS s, "
        f"{_bucket_sql(kind, n)} AS k FROM {_db()}.{_table(kind, n)} WHERE {' AND '.join(where)}"
        f") GROUP BY k {'HAVING ' + ' AND '.join(having) if having else ''} "
        f"ORDER BY k DESC LIMIT {limit} FORMAT JSONCompact"
    )
    ch = _ch()
    if _table(kind, n) == "tick_bars_15s":
        _ensure_bars15(ch)
    r = ch._session.post(f"{ch._base}/", params={"database": _db()}, data=sql.encode(), timeout=20)
    r.raise_for_status()
    rows = json.loads(r.text)["data"]
    rows.reverse()
    return [[int(k), float(o), float(h), float(l), float(c), int(v)] for k, o, h, l, c, v in rows]


def _with_live(symbol: str, kind: str, n: int, bars: list) -> list:
    live = LIVE.get(symbol)
    # (the open 15-second bar for timeframes built from 15-second bars)
    open_bar = live and live.get("bar15" if _table(kind, n) == "tick_bars_15s" else "bar")
    if not open_bar:
        return bars
    t, o, h, l, c, cnt = open_bar
    k = bucket_of(kind, n, t)
    if bars and bars[-1][0] == k:
        last = bars[-1]
        bars[-1] = [k, last[1], max(last[2], h), min(last[3], l), c, last[5] + cnt]
    elif not bars or k > bars[-1][0]:
        bars.append([k, o, h, l, c, cnt])
    return bars


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def candles(request):
    """?symbol=XAUUSD&interval=4h[&end_date=…][&start_date=…][&limit=5000]
    -> {"bars": [[unix_s, o, h, l, c, ticks], …] oldest first, "meta": {…}}. Daily and longer
    bars are labelled with their date at 00:00 UTC, as the chart's other feed does."""
    sym = (request.query_params.get("symbol") or "").strip().upper().replace("/", "")
    if not SYMBOL_RE.match(sym):
        return Response({"error": "bad symbol"}, status=status.HTTP_400_BAD_REQUEST)
    spec = parse_interval(request.query_params.get("interval") or "30s")
    if not spec:
        return Response({"error": "unsupported interval"}, status=status.HTTP_400_BAD_REQUEST)
    kind, n = spec
    try:
        limit = max(1, min(int(request.query_params.get("limit") or MAX_BARS), MAX_BARS))
    except ValueError:
        limit = MAX_BARS
    end_raw = (request.query_params.get("end_date") or "").strip()
    start_raw = (request.query_params.get("start_date") or "").strip()
    end, start = _parse_dt(end_raw, True), _parse_dt(start_raw, False)
    if (end_raw and end is None) or (start_raw and start is None):
        return Response({"error": "dates are YYYY-MM-DD[ HH:MM[:SS]] (UTC)"}, status=status.HTTP_400_BAD_REQUEST)
    if end is not None and end > time.time():
        end = None    # "up to the future" is the latest window

    key = (sym, kind, n, end, start, limit)
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        bars = [b[:] for b in hit[1]]
    else:
        try:
            bars = query_bars(sym, kind, n, end, start, limit)
        except Exception as e:
            import logging
            logging.getLogger("core.market").warning("candles unavailable for %s: %s", sym, e)
            # A failure, not "no bars": the chart retries instead of taking it as an empty store
            return Response({"error": "candles unavailable", "meta": {"symbol": sym, "source": "unavailable"}},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if len(_cache) > 300:
            _cache.clear()
        # The latest window is re-read every few seconds; older windows don't change
        _cache[key] = (now + (5 if end is None else 600), [b[:] for b in bars])
    if end is None:
        bars = _with_live(sym, kind, n, bars)
    return Response({"bars": bars, "meta": {"symbol": sym, "interval": request.query_params.get("interval") or "30s",
                                            "source": "vantage", "live": live_age(sym) is not None}})


def live_age(symbol: str) -> float | None:
    """Seconds since the collector last posted for the symbol, None when it isn't streaming"""
    live = LIVE.get(symbol)
    if not live:
        return None
    age = time.time() - live["rx"]
    return age if age < 120 else None


def live_snapshot(symbol: str) -> dict | None:
    live = LIVE.get(symbol)
    if not live or live_age(symbol) is None:
        return None
    return {"type": "tick", "s": symbol, "t": live["t"], "p": live["bid"], "a": live["ask"],
            "h": live["bid"], "l": live["bid"], "n": 0}


# ------------------------------------------------------------------ ingest (from the collector)

def _authorized(request) -> bool:
    token = os.environ.get("LIVE_INGEST_TOKEN", "")
    given = request.headers.get("X-Ingest-Token", "")
    return len(token) >= 32 and hmac.compare_digest(token.encode(), given.encode())


def _num(x) -> float:
    v = float(x)
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError("not a number")
    return v


def _bar(row) -> list:
    t, o, h, l, c, n = row
    return [int(t), _num(o), _num(h), _num(l), _num(c), int(n)]


@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])
def ingest(request):
    """The MT5 collector's endpoint (header X-Ingest-Token).
    GET ?symbol=[&res=15] -> {"last_ts": ms of the newest stored 30-second (15-second) bar}
    (where to resume from).
    POST {"symbol", "ticks": [[t_ms, bid, ask], …], "bar": [t_ms, o, h, l, c, n] (open bar),
          "closed": [[t_ms, o, h, l, c, n], …], "bar15", "closed15" (the same for 15-second bars)}
    -> closed bars to ClickHouse, ticks to the charts."""
    if not _authorized(request):
        return Response({"error": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "GET":
        sym = (request.query_params.get("symbol") or "").upper()
        if not SYMBOL_RE.match(sym):
            return Response({"error": "bad symbol"}, status=status.HTTP_400_BAD_REQUEST)
        ch = _ch()
        table = "tick_bars"
        if request.query_params.get("res") == "15":
            _ensure_bars15(ch)
            table = "tick_bars_15s"
        rows = ch.query(f"SELECT toUnixTimestamp64Milli(max(ts)) AS t FROM {_db()}.{table} WHERE symbol = '{sym}'")
        return Response({"last_ts": int(rows[0]["t"]) if rows and rows[0].get("t") not in (None, "") else 0})

    d = request.data if isinstance(request.data, dict) else {}
    sym = str(d.get("symbol") or "").upper()
    if not SYMBOL_RE.match(sym):
        return Response({"error": "bad symbol"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        ticks = [(int(t), _num(b), _num(a)) for t, b, a in (d.get("ticks") or [])[:MAX_TICKS_PER_POST]]
        closed = [_bar(r) for r in (d.get("closed") or [])[:MAX_CLOSED_PER_POST]]
        bar = _bar(d["bar"]) if d.get("bar") else None
        closed15 = [_bar(r) for r in (d.get("closed15") or [])[:MAX_CLOSED_PER_POST]]
        bar15 = _bar(d["bar15"]) if d.get("bar15") else None
    except (TypeError, ValueError, KeyError):
        return Response({"error": "bad payload"}, status=status.HTTP_400_BAD_REQUEST)

    for table, rows in (("tick_bars", closed), ("tick_bars_15s", closed15)):
        if not rows:
            continue
        body = "\n".join(f"{sym}\t{t / 1000:.3f}\t{o}\t{h}\t{l}\t{c}\t{n}" for t, o, h, l, c, n in rows) + "\n"
        ch = _ch()
        if table == "tick_bars_15s":
            _ensure_bars15(ch)
        r = ch._session.post(f"{ch._base}/", params={"database": _db(), "query": f"INSERT INTO {_db()}.{table} FORMAT TabSeparated"},
                             data=body.encode(), timeout=30)
        if r.status_code // 100 != 2:
            return Response({"error": "store failed"}, status=status.HTTP_502_BAD_GATEWAY)
        _cache.clear()

    with _lock:
        live = LIVE.setdefault(sym, {"bar": None, "bid": None, "ask": None, "t": 0, "rx": 0})
        live["rx"] = time.time()
        if bar:
            live["bar"] = bar
        if bar15:
            live["bar15"] = bar15
        if ticks:
            t, bid, ask = ticks[-1]
            live.update(t=t, bid=bid, ask=ask)
    if ticks:
        bids = [b for _, b, _ in ticks]
        msg = {"type": "tick", "s": sym, "t": ticks[-1][0], "o": ticks[0][1], "p": ticks[-1][1], "a": ticks[-1][2],
               "h": max(bids), "l": min(bids), "n": len(ticks)}
        layer = get_channel_layer()
        if layer is not None:
            async_to_sync(layer.group_send)(group_of(sym), {"type": "tick.message", "data": msg})
    return Response({"ok": True, "stored": len(closed), "stored15": len(closed15)})
