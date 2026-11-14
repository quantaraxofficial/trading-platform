"""Live Vantage prices for the site: reads new ticks from the MetaTrader 5 terminal four times a
second and posts them to the backend (core.market.ingest), which relays them to every open chart
over the ticks WebSocket and stores each finished 30-second bar in ClickHouse, and each finished
15-second bar in its own table (the 15-second charts; they can't be made from 30-second bars).

On start it first fills the gap since the newest stored bar (up to a week back; older gaps are
the backfill's job), so the history has no hole where the collector was off.

Runs on the Windows machine with the terminal logged into the Vantage account. Read-only: it
never trades or changes the terminal. The ingest token comes from the environment
(LIVE_INGEST_TOKEN) and is never written anywhere.

Several symbols stream from one process (--symbols XAUUSD,EURUSD,…): one MT5 connection, one
loop. Gold (--fast) posts on every read; the others at most once a second, which is plenty for
their charts and keeps the requests to the server down.

  set LIVE_INGEST_TOKEN=…
  python -m pipeline.live_collector --login 26417543 --url https://34-93-138-162.sslip.io
  python -m pipeline.live_collector --login 26417543 --url … --symbols XAUUSD,EURUSD,GBPUSD
"""
import argparse
import logging
import os
import sys
import time
from collections import deque
from datetime import datetime, timedelta, timezone

import requests

from .backfill import BAR_MS, bars_from_ticks, server_offset_hours

log = logging.getLogger("pipeline.live")
POLL_S = 0.25
HEARTBEAT_S = 5.0
CATCHUP_MAX_DAYS = 7
BAR15_MS = 15_000


def offset_now() -> int:
    """The server clock's current UTC offset (hours)"""
    now = datetime.now(timezone.utc)
    return server_offset_hours(now + timedelta(hours=2))


class Bars:
    """Bars of one length built from the ticks: the one being built and the finished ones the
    server hasn't accepted yet"""
    def __init__(self, bar_ms: int) -> None:
        self.bar_ms = bar_ms
        self.closed: deque = deque(maxlen=200_000)
        self.bar: list | None = None                  # [t_ms, o, h, l, c, n]

    def add(self, t_ms: int, bid: float) -> bool:
        b = t_ms // self.bar_ms * self.bar_ms
        if self.bar and b != self.bar[0]:
            if b < self.bar[0]:
                return False                          # out of order: already past that bar
            self.closed.append(self.bar)
            self.bar = None
        if self.bar is None:
            self.bar = [b, bid, bid, bid, bid, 1]
        else:
            self.bar[2] = max(self.bar[2], bid)
            self.bar[3] = min(self.bar[3], bid)
            self.bar[4] = bid
            self.bar[5] += 1
        return True


class Feed:
    def __init__(self, url: str, token: str, symbol: str) -> None:
        self.url = url.rstrip("/") + "/api/users/live/ingest/"
        self.symbol = symbol
        self.s = requests.Session()
        self.s.headers["X-Ingest-Token"] = token
        self.b30 = Bars(BAR_MS)
        self.b15 = Bars(BAR15_MS)
        self.ticks: list = []
        self.last_post = 0.0

    @property
    def closed(self) -> deque:
        return self.b30.closed

    def pending(self) -> int:
        return len(self.b30.closed) + len(self.b15.closed)

    def last_stored_ms(self, res: int = 30) -> int:
        r = self.s.get(self.url, params={"symbol": self.symbol, "res": res}, timeout=15)
        r.raise_for_status()
        return int(r.json().get("last_ts") or 0)

    def add_tick(self, t_ms: int, bid: float, ask: float) -> None:
        if bid <= 0:
            return
        self.b15.add(t_ms, bid)
        if self.b30.add(t_ms, bid):
            self.ticks.append([t_ms, bid, ask])

    def post(self, force: bool = False) -> None:
        if not (self.ticks or self.pending() or force):
            return
        closed = list(self.b30.closed)[:10000]
        closed15 = list(self.b15.closed)[:10000]
        body = {"symbol": self.symbol, "ticks": self.ticks[-5000:], "bar": self.b30.bar, "closed": closed,
                "bar15": self.b15.bar, "closed15": closed15}
        try:
            r = self.s.post(self.url, json=body, timeout=10)
            if r.status_code == 403:
                sys.exit("The server refused the ingest token")
            r.raise_for_status()
            for _ in closed:
                self.b30.closed.popleft()
            for _ in closed15:
                self.b15.closed.popleft()
        except requests.RequestException as e:
            log.warning("post failed (%s); %d finished bars kept for the next try", e, self.pending())
        self.ticks = []                               # live ticks are only worth sending now
        self.last_post = time.time()


class Stream:
    """One symbol being streamed: its feed, where its ticks were read up to (server-time ms, and
    how many ticks at exactly that ms were already taken), how often it posts"""
    def __init__(self, feed: Feed, post_every: float) -> None:
        self.feed = feed
        self.post_every = post_every
        self.last_msc = 0
        self.seen = 0
        self.sent = 0


def catch_up(mt5, s: Stream) -> None:
    """Fill the gap since the symbol's newest stored bar (that bar too: it may have been cut short)"""
    feed = s.feed
    off = offset_now()
    now_srv = datetime.now(timezone.utc) + timedelta(hours=off)
    # (each length from its own newest stored bar: the 15-second table starts empty)
    floor = int((time.time() - CATCHUP_MAX_DAYS * 86400) * 1000)
    last30 = max(feed.last_stored_ms(30), floor)
    last15 = max(feed.last_stored_ms(15), floor)
    start_utc = min(last30, last15)
    frm = datetime.fromtimestamp(start_utc / 1000, timezone.utc) + timedelta(hours=off)
    ticks = mt5.copy_ticks_range(feed.symbol, frm, now_srv + timedelta(minutes=5), mt5.COPY_TICKS_ALL)
    if ticks is not None and len(ticks):
        for bars_of, since in ((feed.b30, last30), (feed.b15, last15)):
            bars = [b for b in bars_from_ticks(ticks, off, bars_of.bar_ms) if b[0] >= since // bars_of.bar_ms * bars_of.bar_ms]
            if bars:
                bars_of.bar = list(bars[-1])
                bars_of.closed.extend(list(b) for b in bars[:-1])
        s.last_msc = int(ticks["time_msc"][-1])
        s.seen = int((ticks["time_msc"] == s.last_msc).sum())
    del ticks
    log.info("%s: catch-up from %s UTC, %d finished 30 s bars and %d 15 s bars to send", feed.symbol,
             datetime.fromtimestamp(start_utc / 1000, timezone.utc), len(feed.b30.closed), len(feed.b15.closed))
    while feed.pending():
        before = feed.pending()
        feed.post(force=True)
        if feed.pending() == before:
            time.sleep(5)
    if not s.last_msc:
        s.last_msc = int((time.time() + off * 3600) * 1000)


def read_new(mt5, s: Stream, off_ms: int) -> None:
    """The symbol's ticks since the last read, into its bars"""
    ticks = mt5.copy_ticks_from(s.feed.symbol, datetime.fromtimestamp(s.last_msc // 1000, timezone.utc), 5000, mt5.COPY_TICKS_ALL)
    if ticks is None or not len(ticks):
        return
    msc = ticks["time_msc"].astype("int64")
    skip_same = s.seen
    for i in range(len(ticks)):
        m = int(msc[i])
        if m < s.last_msc:
            continue
        if m == s.last_msc:
            if skip_same > 0:
                skip_same -= 1
                continue
            s.seen += 1
        else:
            s.last_msc, s.seen = m, 1
            skip_same = 0
        s.feed.add_tick(m - off_ms, float(ticks["bid"][i]), float(ticks["ask"][i]))
        s.sent += 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", default="XAUUSD", help="one symbol (--symbols for several)")
    ap.add_argument("--symbols", default="", help="several, comma-separated (e.g. XAUUSD,EURUSD,GBPUSD): one MT5 connection, one loop")
    ap.add_argument("--fast", default="XAUUSD", help="symbols posted on every read (4 a second); the others at most every --slow-every seconds")
    ap.add_argument("--slow-every", type=float, default=1.0)
    ap.add_argument("--terminal", default=r"G:\MT5\terminal64.exe")
    ap.add_argument("--login", type=int, required=True, help="the MT5 account it must be logged into (checked, never changed)")
    ap.add_argument("--url", required=True, help="the site, e.g. https://34-93-138-162.sslip.io")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", stream=sys.stdout)
    token = os.environ.get("LIVE_INGEST_TOKEN", "")
    if len(token) < 32:
        sys.exit("LIVE_INGEST_TOKEN is not set")
    wanted = [x.strip().upper() for x in (args.symbols or args.symbol).split(",") if x.strip()]
    fast = {x.strip().upper() for x in args.fast.split(",") if x.strip()}

    import MetaTrader5 as mt5
    if not mt5.initialize(path=args.terminal, timeout=60000):
        sys.exit(f"MT5 initialize failed: {mt5.last_error()}")
    try:
        acc = mt5.account_info()
        if not acc or acc.login != args.login:
            sys.exit(f"The terminal is logged into {acc.login if acc else None}, not {args.login}: nothing read")
        streams: list[Stream] = []
        for sym in dict.fromkeys(wanted):
            # (a symbol the broker doesn't have is skipped, the rest still stream)
            if not mt5.symbol_select(sym, True):
                log.warning("No symbol %s on %s: skipped", sym, acc.server)
                continue
            streams.append(Stream(Feed(args.url, token, sym), 0.0 if sym in fast else args.slow_every))
        if not streams:
            sys.exit("None of the symbols are on this server")

        # 1) Each symbol's gap since its newest stored bar
        for s in streams:
            catch_up(mt5, s)

        # 2) Live: every symbol's new ticks four times a second; fast ones posted each time, the
        # others at most every --slow-every seconds (their ticks wait in the feed meanwhile)
        log.info("Streaming %s from %s (%s) to %s", ", ".join(s.feed.symbol for s in streams), acc.login, acc.server, args.url)
        report_at = time.time() + 60
        while True:
            t0 = time.time()
            off_ms = offset_now() * 3_600_000
            for s in streams:
                read_new(mt5, s, off_ms)
                since = time.time() - s.feed.last_post
                if since >= s.post_every:
                    s.feed.post(force=since > HEARTBEAT_S)
            if time.time() > report_at:
                term = mt5.terminal_info()
                log.info("Ticks in the last minute: %s%s", ", ".join(f"{s.feed.symbol} {s.sent}" for s in streams),
                         "" if term and term.connected else " (terminal NOT connected to the broker)")
                for s in streams:
                    s.sent = 0
                report_at = time.time() + 60
            time.sleep(max(0.0, POLL_S - (time.time() - t0)))
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
