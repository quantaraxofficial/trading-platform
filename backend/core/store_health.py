"""Django Admin → Site analytics: the data store and the price collector (refreshed every 30 s).

- ClickHouse: does it answer and how fast, the disk (used / free), each table's rows and size, and its
  query times (system.query_log: the last 24 hours by hour, and the slowest kinds of query)
- the MT5 collector: per symbol, how long since it last posted, how old its last price is, and how far
  the stored 30-second bars are behind (core/market.py keeps what it last posted in memory)
Anything that can't be read (no ClickHouse here, query_log off) is shown as not available."""
import time

from django.utils import timezone


def _num(v, cast=float):
    try:
        return cast(v)
    except (TypeError, ValueError):
        return None


def clickhouse():
    try:
        from pipeline.clickhouse_client import ClickHouseClient
        from pipeline.config import CONFIG
    except Exception as e:   # (the pipeline isn't installed here)
        return {"ok": False, "error": str(e)[:200]}
    ch = ClickHouseClient()
    out = {"ok": False, "db": CONFIG.CH_DATABASE}
    try:
        t0 = time.perf_counter()
        ch._session.get(f"{ch._base}/ping", timeout=3).raise_for_status()
        out["ping_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        t0 = time.perf_counter()
        ch.query("SELECT 1 AS x")
        out["query_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        out["ok"] = True
    except Exception as e:
        out["error"] = "not reachable" if "connect" in str(e).lower() else str(e)[:200]
        return out
    try:
        disks = ch.query("SELECT name, free_space, total_space FROM system.disks")
        free = sum(_num(d["free_space"], int) or 0 for d in disks)
        total = sum(_num(d["total_space"], int) or 0 for d in disks)
        out["disk"] = {"free_gb": round(free / 1e9, 1), "total_gb": round(total / 1e9, 1),
                       "used_pct": round(100 * (1 - free / total), 1) if total else None}
    except Exception as e:
        out["disk_error"] = str(e)[:200]
    try:
        rows = ch.query(f"SELECT table, sum(rows) AS rows, sum(bytes_on_disk) AS bytes, max(modification_time) AS changed "
                        f"FROM system.parts WHERE active AND database = '{CONFIG.CH_DATABASE}' GROUP BY table ORDER BY bytes DESC")
        out["tables"] = [{"table": r["table"], "rows": _num(r["rows"], int), "mb": round((_num(r["bytes"], int) or 0) / 1e6, 1),
                          "changed": r["changed"]} for r in rows]
        out["data_mb"] = round(sum(t["mb"] for t in out["tables"]), 1)
    except Exception as e:
        out["tables_error"] = str(e)[:200]
    try:
        hours = ch.query("SELECT toStartOfHour(event_time) AS h, count() AS n, avg(query_duration_ms) AS avg_ms, "
                         "quantile(0.95)(query_duration_ms) AS p95_ms, max(query_duration_ms) AS max_ms FROM system.query_log "
                         "WHERE type = 'QueryFinish' AND query_kind = 'Select' AND event_time > now() - INTERVAL 24 HOUR "
                         "AND current_database != 'system' GROUP BY h ORDER BY h")
        out["query_hours"] = [{"t": r["h"], "n": _num(r["n"], int), "avg_ms": round(_num(r["avg_ms"]) or 0, 1),
                               "p95_ms": round(_num(r["p95_ms"]) or 0, 1), "max_ms": _num(r["max_ms"], int)} for r in hours]
        slow = ch.query("SELECT normalized_query_hash AS q, any(substring(query, 1, 140)) AS sample, count() AS n, "
                        "avg(query_duration_ms) AS avg_ms, max(query_duration_ms) AS max_ms, sum(read_rows) AS read_rows FROM system.query_log "
                        "WHERE type = 'QueryFinish' AND query_kind = 'Select' AND event_time > now() - INTERVAL 24 HOUR "
                        "AND current_database != 'system' GROUP BY q ORDER BY avg_ms * n DESC LIMIT 8")
        out["slow_queries"] = [{"sample": r["sample"].replace("\\n", " "), "n": _num(r["n"], int), "avg_ms": round(_num(r["avg_ms"]) or 0, 1),
                                "max_ms": _num(r["max_ms"], int), "read_rows": _num(r["read_rows"], int)} for r in slow]
    except Exception as e:
        out["query_log_error"] = str(e)[:200]
    return out


def collector():
    """Per symbol: seconds since the collector last posted, the age of its last price, and the newest
    stored 30-second bar"""
    try:
        from . import market
    except Exception as e:
        return {"ok": False, "error": str(e)[:200], "symbols": []}
    now = time.time()
    rows = {}
    for sym, live in list(market.LIVE.items()):
        rx, t = live.get("rx") or 0, live.get("t") or 0
        rows[sym] = {"symbol": sym, "posted_ago": round(now - rx, 1) if rx else None,
                     "price_age": round(now - t / 1000, 1) if t else None, "bid": live.get("bid")}
    try:
        from pipeline.clickhouse_client import ClickHouseClient
        from pipeline.config import CONFIG
        stored = ClickHouseClient().query(f"SELECT symbol, toUnixTimestamp64Milli(max(ts)) AS last FROM {CONFIG.CH_DATABASE}.tick_bars "
                                          "WHERE ts > now() - INTERVAL 7 DAY GROUP BY symbol")
        for r in stored:
            last = _num(r["last"], int)
            row = rows.setdefault(r["symbol"], {"symbol": r["symbol"], "posted_ago": None, "price_age": None, "bid": None})
            row["stored_behind"] = round(now - last / 1000, 1) if last else None
    except Exception:
        pass
    # Vantage trades Monday 01:00 to Friday 23:57 on its server clock (New York + 7 h), with a daily
    # break 23:57 → 01:00: a quiet collector then is expected
    from datetime import datetime, timezone as dt_timezone
    s = market._server_secs(now)
    day, mins = datetime.fromtimestamp(s, tz=dt_timezone.utc).weekday(), (s % 86400) // 60
    market_open = day < 5 and 60 <= mins < 23 * 60 + 57
    for row in rows.values():
        a = row.get("posted_ago")
        row["status"] = ("streaming" if a is not None and a < 30 else "slow" if a is not None and a < 120
                         else "stopped" if market_open else "market closed")
    return {"ok": True, "market_open": market_open, "symbols": sorted(rows.values(), key=lambda r: r["symbol"])}


def report():
    return {"at": int(timezone.now().timestamp() * 1000), "clickhouse": clickhouse(), "collector": collector()}
