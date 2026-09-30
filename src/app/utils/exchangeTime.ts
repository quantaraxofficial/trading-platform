// Bar times on the chart come from the data feed's exchange-local datetime strings
// ("2026-09-25 15:45:00", New York time for AAPL) parsed as if they were local time. Anything
// stamped with a real clock (a live quote, a paper-trading fill) has to go through the same
// conversion to land on the right bar: wall-clock time in the symbol's exchange time zone,
// read back as local time.

import { assetClassOf } from "@/app/trading/instruments";

const KEY = "tv:exchangeTz:";
const zones: Record<string, string> = {};

export function rememberExchangeTimezone(symbol: string, tz: string | undefined) {
  if (!tz || zones[symbol] === tz) return;
  zones[symbol] = tz;
  try { localStorage.setItem(KEY + symbol, tz); } catch { /* ignore */ }
}

export function exchangeTimezoneOf(symbol: string): string {
  if (zones[symbol]) return zones[symbol];
  try {
    const saved = localStorage.getItem(KEY + symbol);
    if (saved) { zones[symbol] = saved; return saved; }
  } catch { /* ignore */ }
  // Crypto and forex bars are quoted in UTC; US stocks in New York time
  return assetClassOf(symbol) === "stocks" ? "America/New_York" : "UTC";
}

// A real timestamp (ms) as a chart bar time (seconds)
export function toChartTime(symbol: string, ms: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: exchangeTimezoneOf(symbol), hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find(p => p.type === t)?.value || "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return Math.floor(new Date(`${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`).getTime() / 1000);
  } catch {
    return Math.floor(ms / 1000);
  }
}
