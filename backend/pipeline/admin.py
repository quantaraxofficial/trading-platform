"""Data-health queries for a dashboard / Django admin view.

Gives the operator the answers to "is my tick feed healthy?": last seen bar,
row counts, and a gap list (30-second windows with zero ticks = the collector
was down or the feed hiccuped). All read-only, all against ClickHouse.
"""
from typing import Optional

from .clickhouse_client import ClickHouseClient
from .config import CONFIG


def feed_health(client: Optional[ClickHouseClient] = None) -> dict:
    ch = client or ClickHouseClient()
    out: dict = {"db": CONFIG.CH_DATABASE}

    # Latest bar per symbol.
    try:
        rows = ch.query(
            "SELECT symbol, max(ts) AS last_ts, count(*) AS bars "
            f"FROM {CONFIG.CH_DATABASE}.tick_bars "
            "GROUP BY symbol ORDER BY last_ts DESC"
        )
        out["symbols"] = rows
    except Exception as e:
        out["symbols"] = []
        out["symbols_error"] = str(e)

    # Total rows + rough size (for the "will this fill 200 GB" question).
    try:
        size = ch.query(
            "SELECT formatReadableSize(sum(object_size)) "
            "FROM system.parts WHERE database = %(db)s AND active" % {"db": CONFIG.CH_DATABASE}
        )
        out["data_size"] = size[0]["formatReadableSize(sum(object_size)"] if size else "?"
    except Exception:
        out["data_size"] = "?"

    # Gaps: 30-second windows where a symbol logged a zero-tick bar — the
    # explicit missing marker the collector emits when it detects a hole.
    try:
        gaps = ch.query(
            "SELECT symbol, count(*) AS gaps, min(ts) AS first, max(ts) AS last "
            f"FROM {CONFIG.CH_DATABASE}.tick_bars WHERE ticks = 0 "
            "GROUP BY symbol HAVING gaps > 0"
        )
        out["zero_tick_windows"] = gaps
    except Exception:
        out["zero_tick_windows"] = []

    return out


if __name__ == "__main__":
    import json
    print(json.dumps(feed_health(), indent=2, default=str))
