"""Backfill Vantage history into ClickHouse, newest day first: today, then yesterday, and so on,
until the broker has no more ticks (several weekdays in a row come back empty).

Runs on the Windows machine with the MetaTrader 5 terminal (logged into the Vantage account),
reading ticks with the official MetaTrader5 package (read-only: no orders) and writing 30-second
bars (open/high/low/close of the bid, tick count) into ClickHouse's ticks.tick_bars, in UTC.
ClickHouse is reached over an SSH tunnel (CLICKHOUSE_HOST/PORT point at the tunnel).

Vantage's server clock is New York time + 7 h (UTC+2 in northern winter, UTC+3 in summer,
switching with US daylight saving) — checked against OANDA's bars on TradingView — so a tick's
server time minus that offset is UTC.

Resumable: it starts from the oldest day already in ClickHouse for the symbol (or today), and
re-running only adds what's missing (the table keeps one row per symbol and bar time).

  python -m pipeline.backfill --symbol XAUUSD --terminal G:\\MT5\\terminal64.exe --login 26417543
"""
import argparse
import logging
import sys
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

from .config import CONFIG

log = logging.getLogger("pipeline.backfill")
NY = ZoneInfo("America/New_York")
BAR_MS = 30_000


def server_offset_hours(server_day: datetime) -> int:
    """Vantage server clock = New York + 7 h: UTC+3 while New York is on daylight time, else +2"""
    noon_utc = server_day.replace(hour=12) - timedelta(hours=2)
    return 3 if noon_utc.astimezone(NY).dst() else 2


class ClickHouse:
    def __init__(self) -> None:
        self.base = f"http://{CONFIG.CH_HOST}:{CONFIG.CH_PORT}/"
        self.s = requests.Session()
        self.s.auth = (CONFIG.CH_USER, CONFIG.CH_PASSWORD)

    def run(self, sql: str, body: bytes | None = None) -> str:
        params = {"database": CONFIG.CH_DATABASE} if body is not None else {}
        if body is None:
            r = self.s.post(self.base, params=params, data=sql.encode(), timeout=60)
        else:
            r = self.s.post(self.base, params={**params, "query": sql}, data=body, timeout=120)
        if r.status_code // 100 != 2:
            raise RuntimeError(f"ClickHouse {r.status_code}: {r.text[:300]}")
        return r.text

    def ensure_schema(self) -> None:
        # One statement per request (ClickHouse's HTTP interface takes one at a time). No TTL:
        # 30-second bars are small (~1 M rows a year per symbol) and the history is the point.
        self.run(f"CREATE DATABASE IF NOT EXISTS {CONFIG.CH_DATABASE}")
        self.run(
            f"CREATE TABLE IF NOT EXISTS {CONFIG.CH_DATABASE}.tick_bars ("
            " symbol LowCardinality(String),"
            " ts DateTime64(3, 'UTC') CODEC(Delta, ZSTD(3)),"
            " open Float64, high Float64, low Float64, close Float64,"
            " ticks UInt32)"
            " ENGINE = ReplacingMergeTree() ORDER BY (symbol, ts)"
            " SETTINGS index_granularity = 8192")
        self.run(
            f"CREATE TABLE IF NOT EXISTS {CONFIG.CH_DATABASE}.backfill_days ("
            " symbol LowCardinality(String), day Date, bars UInt32, ticks UInt64, done_at DateTime DEFAULT now())"
            " ENGINE = ReplacingMergeTree(done_at) ORDER BY (symbol, day)")

    def done_days(self, symbol: str) -> set[str]:
        txt = self.run(f"SELECT toString(day) FROM {CONFIG.CH_DATABASE}.backfill_days FINAL WHERE symbol = '{symbol}' FORMAT TabSeparated")
        return set(x for x in txt.split("\n") if x)

    def insert(self, symbol: str, rows: list[tuple]) -> None:
        body = "\n".join(f"{symbol}\t{ts / 1000:.3f}\t{o}\t{h}\t{l}\t{c}\t{n}" for ts, o, h, l, c, n in rows) + "\n"
        self.run(f"INSERT INTO {CONFIG.CH_DATABASE}.tick_bars FORMAT TabSeparated", body.encode())

    def mark(self, symbol: str, day: str, bars: int, ticks: int) -> None:
        self.run(f"INSERT INTO {CONFIG.CH_DATABASE}.backfill_days (symbol, day, bars, ticks) FORMAT TabSeparated",
                 f"{symbol}\t{day}\t{bars}\t{ticks}\n".encode())


def bars_from_ticks(ticks, offset_h: int, bar_ms: int = BAR_MS) -> list[tuple]:
    """30-second (or bar_ms) bars (UTC bar-open ms, o, h, l, c, count) from MT5 ticks (bid prices)"""
    import numpy as np
    t = ticks["time_msc"].astype("int64") - offset_h * 3_600_000
    bid = ticks["bid"].astype("float64")
    keep = bid > 0
    t, bid = t[keep], bid[keep]
    if not len(t):
        return []
    order = np.argsort(t, kind="stable")
    t, bid = t[order], bid[order]
    b = (t // bar_ms) * bar_ms
    starts = np.flatnonzero(np.r_[True, b[1:] != b[:-1]])
    ends = np.r_[starts[1:], len(b)]
    out = []
    for s, e in zip(starts, ends):
        seg = bid[s:e]
        out.append((int(b[s]), float(seg[0]), float(seg.max()), float(seg.min()), float(seg[-1]), int(e - s)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", default="XAUUSD")
    ap.add_argument("--terminal", default=r"G:\MT5\terminal64.exe")
    ap.add_argument("--login", type=int, required=True, help="the MT5 account it must be logged into (checked, never changed)")
    ap.add_argument("--start", default="", help="newest server day to fetch (YYYY-MM-DD); default today")
    ap.add_argument("--stop-after-empty", type=int, default=15, help="weekdays in a row without ticks = history exhausted")
    ap.add_argument("--max-days", type=int, default=100000)
    ap.add_argument("--pause", type=float, default=0.3, help="seconds between days (keeps the PC responsive)")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", stream=sys.stdout)

    import MetaTrader5 as mt5
    ch = ClickHouse()
    ch.ensure_schema()
    if not mt5.initialize(path=args.terminal, timeout=60000):
        sys.exit(f"MT5 initialize failed: {mt5.last_error()}")
    try:
        acc = mt5.account_info()
        if not acc or acc.login != args.login:
            sys.exit(f"The terminal is logged into {acc.login if acc else None}, not {args.login}: nothing read")
        if not mt5.symbol_select(args.symbol, True):
            sys.exit(f"No symbol {args.symbol} on {acc.server}")
        done = ch.done_days(args.symbol)
        today = datetime.now(timezone.utc) + timedelta(hours=server_offset_hours(datetime.now(timezone.utc)))
        day = (datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc) if args.start
               else today.replace(hour=0, minute=0, second=0, microsecond=0))
        log.info("Backfilling %s from %s backwards (account %s, %s); %d days already done",
                 args.symbol, day.date(), acc.login, acc.server, len(done))
        empty_run, total_bars, n = 0, 0, 0
        while n < args.max_days:
            n += 1
            key = day.date().isoformat()
            is_today = day.date() >= today.date()
            if key in done and not is_today:
                day -= timedelta(days=1)
                continue
            if day.weekday() >= 5:    # server Saturday / Sunday: gold is closed
                day -= timedelta(days=1)
                continue
            off = server_offset_hours(day)
            ticks = mt5.copy_ticks_range(args.symbol, day, day + timedelta(days=1), mt5.COPY_TICKS_ALL)
            if ticks is None or len(ticks) == 0:
                time.sleep(1.0)       # the terminal may still be downloading that day: ask once more
                ticks = mt5.copy_ticks_range(args.symbol, day, day + timedelta(days=1), mt5.COPY_TICKS_ALL)
            count = 0 if ticks is None else len(ticks)
            if count == 0:
                empty_run += 1
                log.info("%s: no ticks (%d weekday(s) in a row)", key, empty_run)
                if empty_run >= args.stop_after_empty:
                    log.info("History exhausted before %s: done", key)
                    break
                day -= timedelta(days=1)
                continue
            empty_run = 0
            bars = bars_from_ticks(ticks, off)
            for i in range(0, len(bars), 20000):
                ch.insert(args.symbol, bars[i:i + 20000])
            if not is_today:
                ch.mark(args.symbol, key, len(bars), count)
            total_bars += len(bars)
            log.info("%s: %d ticks -> %d bars (server UTC+%d) | total %d bars", key, count, len(bars), off, total_bars)
            day -= timedelta(days=1)
            time.sleep(args.pause)
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
