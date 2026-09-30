"""
Fetches XAUUSD daily OHLC from TradingView's WebSocket (OANDA exchange).
No tvdatafeed package needed — uses the same protocol directly.

Usage:
    pip install websocket-client
    python fetch_oanda_tv.py
"""

import json
import random
import re
import string
import threading
import time

import websocket

# ── helpers ──────────────────────────────────────────────────────────────────

def _rand_session():
    return "".join(random.choices(string.ascii_lowercase, k=12))

def _wrap(func, *args):
    args_str = ",".join(json.dumps(a) for a in args)
    msg = f"~m~{len(func)+len(args_str)+6}~m~~j~{{{json.dumps(func)[1:-1]},{args_str[1:-1]}}}"
    # simpler: just encode directly
    payload = json.dumps({"m": func, "p": list(args)})
    wrapped = f"~m~{len(payload)}~m~{payload}"
    return wrapped

def _send(ws, func, *args):
    payload = json.dumps({"m": func, "p": list(args)})
    msg = f"~m~{len(payload)}~m~{payload}"
    ws.send(msg)

def _parse_packets(raw: str):
    packets = []
    while raw:
        m = re.match(r"~m~(\d+)~m~", raw)
        if not m:
            break
        length = int(m.group(1))
        start  = m.end()
        body   = raw[start : start + length]
        raw    = raw[start + length:]
        try:
            packets.append(json.loads(body))
        except json.JSONDecodeError:
            packets.append(body)  # heartbeat
    return packets

# ── main fetcher ──────────────────────────────────────────────────────────────

def fetch_tv_ohlc(symbol="XAUUSD", exchange="OANDA", interval="1D", n_bars=500):
    """
    Returns list of dicts: [{time, open, high, low, close, volume}, ...]
    sorted oldest → newest.
    """
    chart_session = "cs_" + _rand_session()
    quote_session = "qs_" + _rand_session()
    results       = []
    done          = threading.Event()
    error_msg     = [None]

    TV_SYMBOL = f"{exchange}:{symbol}"

    def on_open(ws):
        _send(ws, "set_auth_token", "unauthorized_user_token")
        _send(ws, "chart_create_session", chart_session, "")
        # bare string format — JSON-object form returns "invalid symbol" on free tier
        _send(ws, "resolve_symbol", chart_session, "symbol_1", TV_SYMBOL)
        _send(ws, "create_series", chart_session, "s1", "s1",
              "symbol_1", interval, n_bars, "")

    def on_message(ws, message):
        for pkt in _parse_packets(message):
            # heartbeat ping
            if isinstance(pkt, str) and pkt.startswith("~h~"):
                ws.send(f"~m~{len(pkt)}~m~{pkt}")
                continue

            if not isinstance(pkt, dict):
                continue

            m = pkt.get("m", "")

            if m in ("timescale_update", "du"):
                try:
                    series = pkt["p"][1].get("s1", {})
                    for b in series.get("s", []):
                        v = b["v"]
                        results.append({
                            "time":   int(v[0]),
                            "open":   v[1],
                            "high":   v[2],
                            "low":    v[3],
                            "close":  v[4],
                            "volume": v[5] if len(v) > 5 else 0,
                        })
                except (KeyError, IndexError, TypeError):
                    pass

            elif m == "series_completed":
                done.set()

            elif m == "critical_error":
                error_msg[0] = str(pkt.get("p", "unknown error"))
                done.set()

    def on_error(ws, err):
        error_msg[0] = str(err)
        done.set()

    def on_close(ws, *args):
        done.set()

    ws = websocket.WebSocketApp(
        "wss://data.tradingview.com/socket.io/websocket",
        header={
            "Origin": "https://data.tradingview.com",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        },
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )

    t = threading.Thread(target=ws.run_forever, kwargs={"ping_interval": 20})
    t.daemon = True
    t.start()

    done.wait(timeout=30)
    ws.close()

    if error_msg[0]:
        raise RuntimeError(f"TradingView WebSocket error: {error_msg[0]}")

    results.sort(key=lambda x: x["time"])
    return results


# ── report ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import csv
    from datetime import datetime, timezone

    print("Connecting to TradingView WebSocket …")
    bars = fetch_tv_ohlc(symbol="XAUUSD", exchange="OANDA", interval="1D", n_bars=500)

    if not bars:
        print("ERROR: no data received. Check your internet connection.")
        raise SystemExit(1)

    print(f"\nReceived {len(bars)} bars")
    print(f"Date range: {datetime.fromtimestamp(bars[0]['time'], tz=timezone.utc).date()} to "
          f"{datetime.fromtimestamp(bars[-1]['time'], tz=timezone.utc).date()}")

    print("\nFirst 5 bars:")
    print(f"{'Date':<12} {'Open':>9} {'High':>9} {'Low':>9} {'Close':>9} {'Volume':>10}")
    print("-" * 62)
    for b in bars[:5]:
        d = datetime.fromtimestamp(b["time"], tz=timezone.utc).date()
        print(f"{str(d):<12} {b['open']:>9.2f} {b['high']:>9.2f} {b['low']:>9.2f} {b['close']:>9.2f} {b['volume']:>10.0f}")

    print("\nLast 5 bars:")
    print(f"{'Date':<12} {'Open':>9} {'High':>9} {'Low':>9} {'Close':>9} {'Volume':>10}")
    print("-" * 62)
    for b in bars[-5:]:
        d = datetime.fromtimestamp(b["time"], tz=timezone.utc).date()
        print(f"{str(d):<12} {b['open']:>9.2f} {b['high']:>9.2f} {b['low']:>9.2f} {b['close']:>9.2f} {b['volume']:>10.0f}")

    # Save CSV
    out = "tradingview_oanda_gold.csv"
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date", "open", "high", "low", "close", "volume"])
        w.writeheader()
        for b in bars:
            d = datetime.fromtimestamp(b["time"], tz=timezone.utc).date()
            w.writerow({"date": d, "open": b["open"], "high": b["high"],
                        "low": b["low"], "close": b["close"], "volume": b["volume"]})
    print(f"\nSaved to {out}")
