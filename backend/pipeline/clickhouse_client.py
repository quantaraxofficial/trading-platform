"""Thin ClickHouse HTTP client for the tick pipeline.

We use the plain HTTP interface (port 8123) instead of the native TCP client so
there's exactly one dependency to install (`requests`) and no native binary to
compile on the VM. Batches are sent as a single INSERT with a CSV block, which
is the fastest path and keeps the in-flight payload tiny.
"""
import time
import logging
from dataclasses import dataclass
from typing import Iterable, Optional

import requests

from .config import CONFIG

logger = logging.getLogger("pipeline.clickhouse")

# One table per symbol is wasteful for <= 10 symbols; a single table with a
# `symbol` LowCardinality column + TTL is cleaner and lets one query span all
# symbols. The engine is Replacing for the resampled-bar table so that if the
# collector ever re-delivers a bar (restart overlap) the newest copy wins.
SCHEMA_SQL = """
CREATE DATABASE IF NOT EXISTS {db};

-- Raw 30-second resampled tick bars.
CREATE TABLE IF NOT EXISTS {db}.tick_bars (
    symbol     LowCardinality(String),
    ts         DateTime64(3, 'UTC')   -- bar-open time (resample boundary)
                CODEC(Delta, ZSTD(3)),
    open       Float64,
    high       Float64,
    low        Float64,
    close      Float64,
    ticks      UInt32                  -- number of raw ticks inside the bar
)
ENGINE = ReplacingMergeTree()
ORDER BY (symbol, ts)
TTL ts + toIntervalDay({ttl})
SETTINGS index_granularity = 8192;

-- Collection provenance: lets us see gaps (a missing 30-second bar = the
-- collector was down, a feed hiccup, or the terminal wasn't connected).
CREATE TABLE IF NOT EXISTS {db}.collector_heartbeat (
    ts         DateTime64(6, 'UTC'),
    symbol     LowCardinality(String),
    last_tick_ts DateTime64(3, 'UTC'),
    lag_seconds Float64
)
ENGINE = MergeTree()
ORDER BY (ts, symbol)
TTL ts + toIntervalDay(90);

-- The raw-tick table is optional and storage-heavy; only create it if the
-- operator explicitly wants raw ticks (PIPELINE_RESAMPLE_SECONDS = 1).
""".format(db="{db}", ttl="{ttl}")


@dataclass
class TickBar:
    symbol: str
    ts: int          # epoch ms of the bar-open
    open: float
    high: float
    low: float
    close: float
    ticks: int


class ClickHouseClient:
    def __init__(self) -> None:
        self._base = f"http://{CONFIG.CH_HOST}:{CONFIG.CH_PORT}"
        self._auth = (CONFIG.CH_USER, CONFIG.CH_PASSWORD)
        self._session = requests.Session()
        self._session.auth = self._auth

    # ------------------------------------------------------------------ setup
    def ensure_schema(self) -> None:
        sql = (
            f"CREATE DATABASE IF NOT EXISTS {CONFIG.CH_DATABASE}"
            f";"
            f"CREATE TABLE IF NOT EXISTS {CONFIG.CH_DATABASE}.tick_bars ("
            f" symbol LowCardinality(String),"
            f" ts DateTime64(3, 'UTC') CODEC(Delta, ZSTD(3)),"
            f" open Float64, high Float64, low Float64, close Float64,"
            f" ticks UInt32)"
            f" ENGINE = ReplacingMergeTree() ORDER BY (symbol, ts)"
            f" TTL ts + toIntervalDay({CONFIG.DATA_TTL_DAYS})"
            f" SETTINGS index_granularity = 8192;"
            f"CREATE TABLE IF NOT EXISTS {CONFIG.CH_DATABASE}.collector_heartbeat ("
            f" ts DateTime64(6, 'UTC'),"
            f" symbol LowCardinality(String),"
            f" last_tick_ts DateTime64(3, 'UTC'),"
            f" lag_seconds Float64)"
            f" ENGINE = MergeTree() ORDER BY (ts, symbol)"
            f" TTL ts + toIntervalDay(90);"
        )
        self._post_sql(sql)

    # ------------------------------------------------------------- write path
    def insert_bars(self, bars: Iterable[TickBar]) -> int:
        """Batch-INSERT a block of resampled bars. Returns row count.

        Bars are encoded as a single TSV block over the HTTP interface:
        one HTTP POST per call = one merge-tree granule batch, which is what
        we want on a 4 GB box (no high-frequency small writes).
        """
        rows = [
            f"{b.symbol}\t{b.ts // 1000}.{(b.ts % 1000):03d}\t{b.open:.5f}\t"
            f"{b.high:.5f}\t{b.low:.5f}\t{b.close:.5f}\t{b.ticks}"
            for b in bars
        ]
        if not rows:
            return 0
        body = "\n".join(rows)
        table = f"{CONFIG.CH_DATABASE}.tick_bars"
        resp = self._post(
            f"/?database={CONFIG.CH_DATABASE}",
            body=f"INSERT INTO {table} FORMAT TabSeparated\n{body}\n",
        )
        return len(rows)

    def insert_heartbeat(self, symbol: str, last_tick_ts_ms: int, lag_seconds: float) -> None:
        ts = time.time()
        body = (
            f"{int(ts * 1000)}.{int(ts * 1000) % 1000:03d}\t{symbol}\t"
            f"{last_tick_ts_ms // 1000}.{(last_tick_ts_ms % 1000):03d}\t{lag_seconds:.3f}"
        )
        table = f"{CONFIG.CH_DATABASE}.collector_heartbeat"
        self._post(
            f"/?database={CONFIG.CH_DATABASE}",
            body=f"INSERT INTO {table} FORMAT TabSeparated\n{body}\n",
        )

    # -------------------------------------------------------------- read path
    def query(self, sql: str) -> list[dict]:
        """Run a SELECT and return a list of row-dicts. For the admin dashboard /
        the Django admin's "data health" view."""
        resp = self._get(f"/?database={CONFIG.CH_DATABASE}", body=sql)
        return _parse_tsv(resp.text)

    # ----------------------------------------------------------------- lowlvl
    def _post(self, path: str, body: str) -> requests.Response:
        r = self._session.post(
            f"{self._base}{path}",
            data=body.encode("utf-8"),
            headers={"Content-Type": "text/tab-separated-values"},
            timeout=30,
        )
        if r.status_code // 100 != 2:
            logger.error("ClickHouse write failed (%s): %s", r.status_code, r.text[:300])
        return r

    def _post_sql(self, sql: str) -> None:
        self._post("/?database=system", sql)

    def _get(self, path: str, body: str) -> requests.Response:
        r = self._session.get(
            f"{self._base}{path}",
            data=body.encode("utf-8"),
            timeout=60,
        )
        r.raise_for_status()
        return r


def _parse_tsv(text: str) -> list[dict]:
    lines = [ln for ln in text.split("\n") if ln]
    if len(lines) < 2:
        return []
    cols = lines[0].split("\t")
    return [dict(zip(cols, ln.split("\t"))) for ln in lines[1:]]
