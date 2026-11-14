"""Past ticks for the replay "like the live market": reads a symbol's ticks (bid / ask, to the
millisecond) for a period from the MT5 terminal and posts them to the backend, which stores them in
the raw ticks' table (core.market.ingest with "backfill": they don't reach the charts as live).
From the moment the backend stores ticks, the live collector's are kept as they come; this fills in
what came before.

Runs on the Windows machine with the terminal logged into the Vantage account. Read-only on the
terminal. The ingest token comes from the environment (LIVE_INGEST_TOKEN) and is never printed.

  set LIVE_INGEST_TOKEN=…
  python -m pipeline.tick_backfill --login 26417543 --url https://34-93-138-162.sslip.io --from "2026-11-10 13:15"
  python -m pipeline.tick_backfill --login 26417543 --url … --symbol XAUUSD --from "2026-11-03" --to "2026-11-10"
"""
import argparse
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

from .backfill import server_offset_hours

CHUNK = 5000           # ticks per post (the backend's limit)
DAY = timedelta(days=1)


def parse_utc(s: str) -> datetime:
    s = s.strip()
    fmt = "%Y-%m-%d %H:%M" if len(s) > 10 else "%Y-%m-%d"
    return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", default="XAUUSD")
    ap.add_argument("--from", dest="frm", required=True, help='UTC: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM"')
    ap.add_argument("--to", default="", help="UTC, default now")
    ap.add_argument("--terminal", default=r"G:\MT5\terminal64.exe")
    ap.add_argument("--login", type=int, required=True, help="the MT5 account it must be logged into (checked, never changed)")
    ap.add_argument("--url", required=True)
    args = ap.parse_args()
    token = os.environ.get("LIVE_INGEST_TOKEN", "")
    if not token:
        sys.exit("Set LIVE_INGEST_TOKEN first (the same as the live collector's).")
    start = parse_utc(args.frm)
    end = parse_utc(args.to) if args.to else datetime.now(timezone.utc)

    import MetaTrader5 as mt5
    if not mt5.initialize(path=args.terminal, timeout=60000):
        sys.exit(f"MT5 initialize failed: {mt5.last_error()}")
    try:
        acc = mt5.account_info()
        if not acc or acc.login != args.login:
            sys.exit(f"The terminal is logged into {acc.login if acc else 'nothing'}, not {args.login}.")
        if not mt5.symbol_select(args.symbol, True):
            sys.exit(f"{args.symbol} isn't available in the terminal.")
        url = args.url.rstrip("/") + "/api/users/live/ingest/"
        s = requests.Session()
        s.headers["X-Ingest-Token"] = token
        total = 0
        day = start
        # a day at a time (the terminal's clock offset is per day; a day's ticks fit in memory)
        while day < end:
            nxt = min(end, (day + DAY).replace(hour=0, minute=0, second=0, microsecond=0))
            off = server_offset_hours(day + timedelta(hours=2))
            ticks = mt5.copy_ticks_range(args.symbol, day + timedelta(hours=off), nxt + timedelta(hours=off), mt5.COPY_TICKS_ALL)
            rows = []
            if ticks is not None:
                off_ms = off * 3600 * 1000
                rows = [[int(t) - off_ms, float(b), float(a)] for t, b, a in zip(ticks["time_msc"], ticks["bid"], ticks["ask"]) if b > 0]
            for i in range(0, len(rows), CHUNK):
                for attempt in range(5):
                    r = s.post(url, json={"symbol": args.symbol, "ticks": rows[i:i + CHUNK], "backfill": True}, timeout=60)
                    if r.status_code == 200:
                        break
                    time.sleep(2 + attempt * 3)
                else:
                    sys.exit(f"The backend refused the ticks: {r.status_code} {r.text[:200]}")
            total += len(rows)
            print(f"{day:%Y-%m-%d %H:%M} → {nxt:%Y-%m-%d %H:%M} UTC: {len(rows)} ticks", flush=True)
            day = nxt
        print(f"Done: {total} {args.symbol} ticks stored.")
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
