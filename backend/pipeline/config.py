"""Pipeline configuration.

Everything is environment-driven so the same code runs on your dev box (MT5
desktop, SQLite/ClickHouse-Local fallback) and on the Oracle A1 VM (MT5 via
the headless `mt5` python package, ClickHouse server in Docker).

The one invariant we are protecting: **tick data is never kept on the VM's
filesystem except as a transient in-memory buffer**. It goes straight from
the MT5 collector into ClickHouse via batched INSERTs. Disk only holds
code, logs and the OS image.
"""
import os


def _env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


class Config:
    # --- Symbols to collect. Keep this list small (<= 10). Gold at 30-second
    # --- aggregation is ~0.5 MB/day/symbol, so 10 symbols is ~15 GB/year —
    # --- comfortably inside the 200 GB Oracle free block-storage cap.
    SYMBOLS: list = [s.strip() for s in os.getenv("PIPELINE_SYMBOLS", "XAUUSD").split(",") if s.strip()]

    # Resample ticks into bars of this many seconds before inserting. 30 = the
    # target granularity. 1 = keep raw ticks (do NOT set this on the free VM).
    RESAMPLE_SECONDS: int = _env_int("PIPELINE_RESAMPLE_SECONDS", 30)

    # --- MT5 collector -------------------------------------------------------
    # "desktop" = talk to a logged-in MetaTrader 5 terminal on this machine via
    # the native bridge (your dev box). "headless" = the pip `mt5` package,
    # requires an MT5 install on the VM.
    MT5_MODE: str = os.getenv("PIPELINE_MT5_MODE", "desktop")
    MT5_LOGIN: str = os.getenv("PIPELINE_MT5_LOGIN", "")
    MT5_PASSWORD: str = os.getenv("PIPELINE_MT5_PASSWORD", "")
    MT5_SERVER: str = os.getenv("PIPELINE_MT5_SERVER", "")  # e.g. "Vantage-Demo"
    MT5_TERMINAL_PATH: str = os.getenv("PIPELINE_MT5_TERMINAL_PATH", "")  # path to terminal64.exe
    # Poll interval for the collector loop, seconds.
    MT5_POLL_SECONDS: int = _env_int("PIPELINE_MT5_POLL_SECONDS", 5)

    # --- ClickHouse ----------------------------------------------------------
    CH_HOST: str = os.getenv("CLICKHOUSE_HOST", "127.0.0.1")
    CH_PORT: int = _env_int("CLICKHOUSE_PORT", 8123)
    CH_TCP_PORT: int = _env_int("CLICKHOUSE_TCP_PORT", 9000)
    CH_DATABASE: str = os.getenv("CLICKHOUSE_DATABASE", "ticks")
    CH_USER: str = os.getenv("CLICKHOUSE_USER", "default")
    CH_PASSWORD: str = os.getenv("CLICKHOUSE_PASSWORD", "")
    # Rows held in memory before a batch INSERT. Larger = fewer round-trips,
    # more RAM. ~20k rows * ~120 B ≈ 2.4 MB — negligible on 4 GB.
    BATCH_SIZE: int = _env_int("PIPELINE_BATCH_SIZE", 20000)

    # TTL: drop tick rows older than this. Keeps the data dir bounded even if
    # you keep running for years. Default 730 days (2 years).
    DATA_TTL_DAYS: int = _env_int("PIPELINE_DATA_TTL_DAYS", 730)

    # --- Logging / output ----------------------------------------------------
    LOG_LEVEL: str = os.getenv("PIPELINE_LOG_LEVEL", "INFO")

    @classmethod
    def ch_url(cls, database: str | None = None) -> str:
        db = database or cls.CH_DATABASE
        return f"http://{cls.CH_HOST}:{cls.CH_PORT}/{db}"


CONFIG = Config()
