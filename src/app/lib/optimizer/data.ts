// Bars for the optimizer: a symbol on a timeframe, back to the start of the testing period, through
// the same /api/stock-data proxy and the same paging back in time as the chart's own "Testing
// period" (so a combination's backtest matches what the Strategy Tester would show for it).
// The data provider's per-minute limit is waited out; its daily limit stops the run.

import { barVolume } from "../../utils/volume";
import { feedTimeToUnix } from "../../utils/feedTime";
import type { Bar } from "../pineScriptEngine";
import type { Period } from "./space";

export class DataLimitError extends Error {
  constructor(public scope: "minute" | "day") { super(scope === "day" ? "The market data provider's daily limit is used up" : "The market data provider's per-minute limit"); }
}

const MAX_PAGES = 40;
const cache = new Map<string, { bars: Bar[]; from: number | null }>();

async function page(symbol: string, interval: string, endDate?: string, startDate?: string): Promise<Bar[]> {
  let url = `/api/stock-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`;
  if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
  if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data?.error && /limit/i.test(String(data.error))) throw new DataLimitError(/\bday\b|daily/i.test(data.error) ? "day" : "minute");
  if (data?.error || !Array.isArray(data?.values)) return [];
  return data.values.map((v: any) => ({
    time: feedTimeToUnix(v.datetime), open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close), volume: barVolume(v),
  })).reverse();
}

const weekday = (b: Bar) => { const d = new Date(b.time * 1000).getUTCDay(); return d !== 0 && d !== 6; };
const day = (t: number) => new Date(t * 1000).toISOString().split("T")[0];

// The period's first bar time (null: whatever one load of the chart gives)
export function neededFrom(period: Period, lastBarTime: number): number | null {
  if (period.kind === "days") return lastBarTime - period.days * 86400;
  if (period.kind === "custom") return period.from;
  if (period.kind === "history") return 1;
  return null;
}

export async function loadBars(symbol: string, interval: string, period: Period): Promise<Bar[]> {
  const key = `${symbol}|${interval}`;
  let entry = cache.get(key);
  if (!entry) {
    const first = (await page(symbol, interval)).filter(weekday);
    entry = { bars: first, from: first.length ? first[0].time : null };
    cache.set(key, entry);
  }
  let all = entry.bars;
  if (!all.length) return all;
  const from = neededFrom(period, all[all.length - 1].time);
  for (let i = 0; from !== null && all.length && all[0].time > from && i < MAX_PAGES; i++) {
    const oldest = all[0];
    const more = await page(symbol, interval, day(oldest.time), day(Math.max(from, 86400)));
    if (!more.length) break;
    const byTime = new Map<number, Bar>();
    more.forEach(b => byTime.set(b.time, b));
    all.forEach(b => byTime.set(b.time, b));
    const merged = Array.from(byTime.values()).filter(weekday).sort((a, b) => a.time - b.time);
    if (merged.length <= all.length || merged[0].time >= oldest.time) break;   // no older bars there
    all = merged;
    entry.bars = all;
  }
  return all;
}

// Only the bars of what's being tested now stay in memory
export function keepOnly(symbol: string, interval: string) {
  const key = `${symbol}|${interval}`;
  Array.from(cache.keys()).forEach(k => { if (k !== key) cache.delete(k); });
}

// The period as the engine's trade window (orders only inside it; the bars before warm the script up)
export function backtestWindow(period: Period, bars: Bar[]): { backtestFrom?: number; backtestTo?: number } {
  if (!bars.length) return {};
  if (period.kind === "days") return { backtestFrom: bars[bars.length - 1].time - period.days * 86400 };
  if (period.kind === "custom") return { backtestFrom: period.from, backtestTo: period.to };
  return {};
}
