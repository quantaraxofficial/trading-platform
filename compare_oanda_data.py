"""
Compares XAUUSD OHLC data from:
  1. TradingView via tvdatafeed (OANDA exchange)
  2. TwelveData REST API (same symbol)

Run:
    pip install tvdatafeed pandas requests
    python compare_oanda_data.py
"""

import os
import pandas as pd
import requests
from datetime import datetime

# ── Config ───────────────────────────────────────────────────────────────────
TWELVEDATA_KEY = os.environ.get("TWELVEDATA_API_KEY", "")
N_BARS         = 500   # daily bars to fetch from both sources
# ─────────────────────────────────────────────────────────────────────────────


def fetch_tvdatafeed() -> pd.DataFrame:
    """Pull N_BARS daily XAUUSD candles from TradingView / OANDA."""
    try:
        from tvdatafeed import TvDatafeed, Interval
    except ImportError:
        raise SystemExit("Install tvdatafeed first:  pip install tvdatafeed")

    print("Fetching from TradingView (OANDA) …")
    tv = TvDatafeed()
    df = tv.get_history(
        symbol="XAUUSD",
        exchange="OANDA",
        interval=Interval.in_daily,
        n_bars=N_BARS,
    )
    df.index = pd.to_datetime(df.index).normalize()   # date-only index
    df = df[["open", "high", "low", "close", "volume"]].rename(
        columns={"open": "tv_open", "high": "tv_high",
                 "low": "tv_low",  "close": "tv_close",
                 "volume": "tv_volume"}
    )
    df.sort_index(inplace=True)
    print(f"  TradingView rows : {len(df)}")
    print(df.tail(3).to_string())
    return df


def fetch_twelvedata() -> pd.DataFrame:
    """Pull N_BARS daily XAUUSD candles from TwelveData."""
    print("\nFetching from TwelveData …")
    url = (
        "https://api.twelvedata.com/time_series"
        f"?symbol=XAU/USD&interval=1day&outputsize={N_BARS}"
        f"&apikey={TWELVEDATA_KEY}"
    )
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()

    if data.get("status") == "error":
        raise SystemExit(f"TwelveData error: {data.get('message')}")

    rows = []
    for v in data["values"]:
        rows.append({
            "date":     pd.to_datetime(v["datetime"]).normalize(),
            "td_open":  float(v["open"]),
            "td_high":  float(v["high"]),
            "td_low":   float(v["low"]),
            "td_close": float(v["close"]),
        })

    df = pd.DataFrame(rows).set_index("date").sort_index()
    print(f"  TwelveData rows  : {len(df)}")
    print(df.tail(3).to_string())
    return df


def compare(tv_df: pd.DataFrame, td_df: pd.DataFrame):
    """Merge on date and compute per-field differences."""
    merged = tv_df.join(td_df, how="inner")
    n = len(merged)
    print(f"\n{'='*60}")
    print(f"Matching dates: {n}  (TV={len(tv_df)}, TD={len(td_df)})")
    if n == 0:
        print("No overlapping dates — cannot compare.")
        return

    for field in ("open", "high", "low", "close"):
        tv_col = f"tv_{field}"
        td_col = f"td_{field}"
        diff   = (merged[tv_col] - merged[td_col]).abs()
        pct    = (diff / merged[td_col].abs() * 100)
        print(f"\n  {field.upper():5s}  |  max Δ = {diff.max():.4f}  "
              f"({pct.max():.4f}%)  |  mean Δ = {diff.mean():.4f}  "
              f"({pct.mean():.4f}%)")

    # Show the 5 dates with the biggest close divergence
    merged["close_diff"] = (merged["tv_close"] - merged["td_close"]).abs()
    top5 = merged.nlargest(5, "close_diff")[
        ["tv_close", "td_close", "close_diff"]
    ]
    print(f"\nTop-5 close divergences:\n{top5.to_string()}")

    # Overall verdict
    max_pct = ((merged["tv_close"] - merged["td_close"]).abs() / merged["td_close"].abs() * 100).max()
    print(f"\n{'='*60}")
    if max_pct < 0.05:
        print(f"RESULT: data is VIRTUALLY IDENTICAL  (max close diff {max_pct:.4f}%)")
    elif max_pct < 0.5:
        print(f"RESULT: data is VERY CLOSE  (max close diff {max_pct:.4f}%)")
    else:
        print(f"RESULT: data DIVERGES — max close diff {max_pct:.4f}%")
    print(f"{'='*60}\n")

    # Save merged CSV for manual inspection
    out = "oanda_comparison.csv"
    merged.to_csv(out)
    print(f"Full comparison saved to: {out}")


if __name__ == "__main__":
    tv_df = fetch_tvdatafeed()
    td_df = fetch_twelvedata()
    compare(tv_df, td_df)
