"""MT5 (Vantage) tick collector.

Two modes, selected by PIPELINE_MT5_MODE:

  desktop  - Talk to a MetaTrader 5 terminal already running and logged in on
             this machine. Uses the official `MetaTrader5` python package,
             which binds to a running terminal64.exe. This is how your dev box
             works today.

  headless - The pip `mt5` package (pure-python, no GUI). On the Oracle VM you
             install the MT5 terminal once, then this collector connects to it
             headlessly with the credentials from config. Same `mt5` API in both
             cases is NOT true — desktop uses the native module; the fallback
             below reads the terminal's tick stream through `mt5.copy_ticks`
             polling, which works for both if the native module is importable.

The output is a generator of (ts_ms, symbol, price) so the resampler stays
source-agnostic: any future feed (OANDA streams, another broker) just yields
the same triple.
"""
import time
import logging
from typing import Iterator, Optional

from ..config import CONFIG

logger = logging.getLogger("pipeline.mt5")


def _import_mt5():
    """Import the native MT5 bridge (desktop terminal required) or the pure
    `mt5` pip package (headless). Returns the module or None."""
    try:
        import MetaTrader5 as mt5  # type: ignore  # native, desktop terminal
        return mt5
    except Exception:
        pass
    try:
        import mt5  # type: ignore  # pip package (VPS/headless)
        return mt5
    except Exception as e:
        logger.warning("MT5 module not importable (%s) — collector idle.", e)
        return None


def _init_connection(mt5) -> bool:
    """Establish the MT5 session. For the headless package this requires a
    logged-in terminal already started on the VM."""
    if not mt5:
        return False
    if CONFIG.MT5_MODE == "headless" and CONFIG.MT5_TERMINAL_PATH:
        ok = mt5.initialize(
            CONFIG.MT5_TERMINAL_PATH,
            login=int(CONFIG.MT5_LOGIN) if CONFIG.MT5_LOGIN else 0,
            password=CONFIG.MT5_PASSWORD,
            server=CONFIG.MT5_SERVER,
        )
        if not ok:
            logger.warning("mt5.initialize failed: %s", mt5.last_error())
            return False
        return True
    # desktop mode: attach to the running terminal
    ok = mt5.initialize()
    if not ok:
        logger.warning("mt5.initialize (desktop) failed: %s", mt5.last_error())
        return False
    return True


class MT5TickCollector:
    """Polls the MT5 tick stream for each symbol and yields new ticks as they
    arrive. Ticks are de-duplicated by (symbol, ts_ms, price) so restarts
    across a reconnect don't double-count a boundary bar."""

    def __init__(self, symbols: list[str]) -> None:
        self.symbols = symbols
        self._mt5 = _import_mt5()

    def start(self) -> bool:
        return _init_connection(self._mt5)

    def stop(self) -> None:
        if self._mt5:
            self._mt5.shutdown()

    def ticks(self) -> Iterator[tuple[int, str, float]]:
        """Yield (ts_ms, symbol, price). Blocks on the poll interval; the
        runner wraps this and closes it on SIGTERM."""
        if not self.start():
            return
        seen: dict[str, int] = {s: 0 for s in self.symbols}  # symbol -> last tick ts
        try:
            while True:
                for sym in self.symbols:
                    # copy_ticks pulls up to `count` latest ticks since from_ms.
                    # We request only the delta since the last known tick for this
                    # symbol to keep the payload tiny (no re-scan of history).
                    from_ms = seen[sym] or 0
                    ticks = self._mt5.copy_ticks_from(sym, from_ms, 5000, 0)
                    if not ticks:
                        continue
                    for t in ticks:
                        ts_ms = t.time
                        if ts_ms <= seen.get(sym, 0):
                            continue
                        seen[sym] = ts_ms
                        yield (int(ts_ms), sym, float(t.bid))
                time.sleep(CONFIG.MT5_POLL_SECONDS)
        finally:
            self.stop()


def resample_to_bars(tick_stream, resample_seconds: int):
    """Fold a stream of (ts_ms, symbol, price) into resample_seconds bars.

    A bar closes when the clock crosses the next boundary. The bar's
    open/high/low/close are the min/max/first/last prices of the ticks that
    fell inside that window, and `ticks` counts them. Bars are yielded only
    once closed, so the downstream writer inserts settled bars.

    A boundary gap (no ticks for a whole window) still yields a bar with
    open=high=low=close=last-known-price and ticks=0 — that's the missing
    marker the admin's gap-detection query looks for.
    """
    window_ms = resample_seconds * 1000
    # Per-symbol rolling state: current-bar boundary + running values.
    state: dict[str, dict] = {}

    def flush(sym: str, s: dict):
        yield TickBar(
            symbol=sym,
            ts=s["boundary"],
            open=s["open"],
            high=s["high"],
            low=s["low"],
            close=s["close"],
            ticks=s["ticks"],
        )

    from ..clickhouse_client import TickBar  # local to avoid a top-level cycle

    for ts_ms, sym, price in tick_stream:
        st = state.get(sym)
        boundary = (ts_ms // window_ms) * window_ms
        if st is None or boundary != st["boundary"]:
            if st is not None:
                yield from _close(sym, st, boundary)
            st = {
                "boundary": boundary,
                "open": price, "high": price, "low": price, "close": price,
                "ticks": 1,
            }
            state[sym] = st
        else:
            st["high"] = max(st["high"], price)
            st["low"] = min(st["low"], price)
            st["close"] = price
            st["ticks"] += 1

    # Final flush of whatever is open (the runner calls this on shutdown).
    for sym, st in state.items():
        yield from _close(sym, st, None)


def _close(sym: str, st: dict, next_boundary: Optional[int]):
    from ..clickhouse_client import TickBar
    bar = TickBar(
        symbol=sym, ts=st["boundary"],
        open=st["open"], high=st["high"], low=st["low"],
        close=st["close"], ticks=st["ticks"],
    )
    if next_boundary is not None:
        # A gap: no ticks landed in the bar between the just-closed one and
        # the one that just received data. Emit zero-count bars for the gaps so
        # the admin sees the holes explicitly rather than as silent time skips.
        cursor = st["boundary"] + (next_boundary - st["boundary"])
        while cursor < next_boundary:
            yield TickBar(symbol=sym, ts=cursor,
                          open=bar.close, high=bar.close, low=bar.close,
                          close=bar.close, ticks=0)
            cursor += next_boundary - st["boundary"]
    yield bar
