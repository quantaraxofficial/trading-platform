// Bar times on the chart are real UTC timestamps (see feedTime); the chart's timezone setting
// formats them. A symbol's exchange time zone is still known, for the "Exchange" timezone option.

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

// A real timestamp (ms) as a chart bar time (seconds): bars are real timestamps, so it is just seconds
export function toChartTime(_symbol: string, ms: number): number {
  return Math.floor(ms / 1000);
}
