// The MT5→ClickHouse live source. The chart uses it when (a) it's been told
// live data is on for this session, and (b) the last successful live poll had
// bars for the requested symbol. The TwelveData source is the fallback.
//
// This file is the single place that knows the live source's URL shape and how
// to gate it; ChartContainer just calls `tryMt5Live(...)` and uses the result.

export const MT5_LIVE_URL = "/api/live-candles";
export const MT5_LIVE_SYMBOLS_URL = "/api/live";

// A module flag: the app turns live MT5 on when the user's account/session
// opts in (or always-on for a "live" deployment build). The default here is
// ON when the backend reports it's collecting the symbol — see `liveMode`.
let liveModeOn: boolean | null = null;   // null = "ask the backend whether it's live"

export function setLiveMode(on: boolean) { liveModeOn = on; }
export function liveMode() { return liveModeOn ?? true; } // assume live until told otherwise

// Map the app's symbol casing (e.g. "XAU/USD", "AAPL") to the MT5 symbol the
// pipeline is actually collecting ("XAUUSD"). The pipeline config lists its
// own symbols; the match is case-insensitive after stripping the "/".
export function toMt5Symbol(symbol: string): string {
  return symbol.toUpperCase().replace(/\//g, "");
}

// Fetch a fresh 30-second bar series for a symbol from the live source.
// Returns null when the live source has no data for this symbol yet — the
// caller then falls through to the existing TwelveData path.
export async function fetchMt5LiveCandles(
  symbol: string,
  limit = 500,
): Promise<{ time: number; open: number; high: number; low: number; close: number; volume?: number }[] | null> {
  if (!liveMode()) return null;
  try {
    const url = `${MT5_LIVE_URL}?symbol=${encodeURIComponent(toMt5Symbol(symbol))}&limit=${limit}`;
    const resp = await fetch(url, { cache: "no-store" });
    const data = await resp.json();
    if (!resp.ok || data.error) return null;
    if (!data.values || !Array.isArray(data.values) || data.values.length === 0) return null;
    // Same shape /api/stock-data returns: newest-first, datetime + ohlc.
    const bars = data.values.map((v: any) => ({
      time: Math.floor(Date.parse(`${v.datetime}Z`) / 1000) || 0,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume ? Number(v.volume) : undefined,
    })).reverse();
    // Drop any bar whose time didn't parse (UTC parse of the backend's dt)
    return bars.length ? bars : null;
  } catch {
    return null;
  }
}

// Poll the last-price for the live-tick handler: returns the most recent
// price + its bar timestamp, or null when the symbol isn't being collected.
export async function fetchMt5LivePrice(symbol: string): Promise<{ price: number; time: number } | null> {
  if (!liveMode()) return null;
  try {
    const url = `${MT5_LIVE_SYMBOLS_URL}?symbols=${encodeURIComponent(toMt5Symbol(symbol))}`;
    const resp = await fetch(url, { cache: "no-store" });
    const data = await resp.json();
    if (!resp.ok) return null;
    const v = (data as any)[toMt5Symbol(symbol)];
    if (!v || typeof v.close !== "number") return null;
    // v.ts is ms; convert to unix seconds the chart's live handler expects
    const tSec = typeof v.ts === "number" ? v.ts / 1000 : Date.now() / 1000;
    return { price: v.close, time: tSec };
  } catch {
    return null;
  }
}
