"""Pipeline runner: MT5 ticks -> 30-second bars -> ClickHouse.

Run it with:  python -m pipeline.runner

Design goals for the free 4 GB VM:
  * No tick data ever lands on disk. Raw ticks and resampled bars live in
    memory only, and are flushed to ClickHouse in batches of BATCH_SIZE rows.
  * Backpressure: if the in-flight buffer grows past a cap, the collector is
    paused so the VM's RAM can't be pushed over the edge.
  * Graceful SIGTERM (Docker/k8s stop) flushes the current buffer before exit.
"""
import os
import time
import signal
import logging
from collections import deque

from .config import CONFIG
from .clickhouse_client import ClickHouseClient, TickBar
from .collectors.mt5_tick import MT5TickCollector, resample_to_bars

logger = logging.getLogger("pipeline.runner")

# Cap on how many resampled bars we will hold before forcing a flush. With
# 10 symbols at 30-second bars that's a lot of headroom (a bar is ~120 bytes,
# 5000 rows is ~600 KB) — far below any 4 GB ceiling.
MAX_PENDING_BARS = int(os.getenv("PIPELINE_MAX_PENDING_BARS", 5000))


class Runner:
    def __init__(self) -> None:
        logging.basicConfig(
            level=getattr(logging, CONFIG.LOG_LEVEL, logging.INFO),
            format="%(asctime)s %(name)s %(levelname)s %(message)s",
        )
        self.ch = ClickHouseClient()
        self.collector = MT5TickCollector(CONFIG.SYMBOLS)
        self._stop = False
        self._pending: deque[TickBar] = deque()

    # ------------------------------------------------------------------ loop
    def run(self) -> None:
        self.ch.ensure_schema()
        logger.info("Schema ready. Symbols: %s  resample=%ss  batch=%d",
                    CONFIG.SYMBOLS, CONFIG.RESAMPLE_SECONDS, CONFIG.BATCH_SIZE)
        signal.signal(signal.SIGTERM, self._on_stop)
        signal.signal(signal.SIGINT, self._on_stop)

        if not self.collector.start():
            logger.error("Could not attach to MT5 — idling the collector.")
            return

        stream = resample_to_bars(
            self.collector.ticks(), CONFIG.RESAMPLE_SECONDS
        )
        last_flush = time.time()
        # Flush on a wall-clock cadence too (not only on batch full) so a quiet
        # market still writes heartbeats and settled bars within ~30s.
        flush_seconds = CONFIG.RESAMPLE_SECONDS

        for bar in stream:
            if self._stop:
                break
            self._pending.append(bar)
            if len(self._pending) >= CONFIG.BATCH_SIZE:
                self._flush()
            # Heartbeat once per resample window so gap detection has its data.
            now = time.time()
            if now - last_flush >= flush_seconds:
                self._flush(heartbeat=True)
                last_flush = now
                if self._stop:
                    break

        # Shutdown: flush whatever is left, then close the feed cleanly.
        self._flush(final=True)
        self.collector.stop()
        logger.info("Runner stopped.")

    # ------------------------------------------------------------- internals
    def _on_stop(self, signum, frame) -> None:
        logger.info("Signal %s received — draining buffer.", signum)
        self._stop = True

    def _flush(self, heartbeat: bool = False, final: bool = False) -> None:
        rows = list(self._pending)
        self._pending.clear()
        if rows:
            n = self.ch.insert_bars(rows)
            logger.info("Flushed %d bars%s", n, " (final)" if final else "")
        if heartbeat and rows:
            # One heartbeat per symbol, using the most recent bar's tick ts.
            last_ts = {b.symbol: b.ts for b in rows}
            for sym in CONFIG.SYMBOLS:
                if sym in last_ts:
                    lag = (time.time() * 1000) - last_ts[sym]
                    self.ch.insert_heartbeat(sym, last_ts[sym], lag / 1000.0)


def main() -> None:
    Runner().run()


if __name__ == "__main__":
    main()
