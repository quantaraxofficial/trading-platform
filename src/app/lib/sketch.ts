// The sketch board: a chart of made-up candles for explaining (lib/analysis/sketchCandles makes
// them). It's the symbol SKETCH: the chart loads its candles from here instead of a market (at the
// chart's own timeframe, the newest one now), so every drawing tool and every analysis works on it;
// a new sketch bumps `rev` and the chart reloads it.

import type { SketchBar } from "./analysis/sketchCandles";

export const SKETCH_SYMBOL = "SKETCH";
export const isSketch = (symbol: string | null | undefined) => (symbol ?? "").toUpperCase() === SKETCH_SYMBOL;

let bars: SketchBar[] = [];
let rev = 0;
let previous: string | null = null;           // the market shown before the sketch (to go back to)
const listeners = new Set<() => void>();

export function setSketch(next: SketchBar[], from?: string | null) {
  bars = next;
  rev++;
  if (from && !isSketch(from)) previous = from;
  listeners.forEach(l => l());
}
export const sketchRev = () => rev;
export const sketchPrevious = () => previous;
export function subscribeSketch(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

const SECONDS: Record<string, number> = { min: 60, h: 3600, day: 86400, week: 604800, month: 2592000 };
function intervalSeconds(interval: string): number {
  const m = /^(\d+)(min|h|day|week|month)$/.exec(interval || "");
  return m ? parseInt(m[1], 10) * SECONDS[m[2]] : 3600;
}

// The sketch's candles at a timeframe, the newest one now. A request up to a date (the chart
// refreshing its view) gets those before it; one for the history before the first candle, none.
export function sketchCandles(interval: string, endDate?: string): { time: number; open: number; high: number; low: number; close: number; volume: number }[] {
  if (!bars.length) return [];
  const sec = intervalSeconds(interval);
  const end = Math.floor(Date.now() / 1000 / sec) * sec;
  // (on weekdays only: the chart drops weekend candles as a feed's artefacts)
  const weekend = (t: number) => { const d = new Date(t * 1000).getUTCDay(); return d === 0 || d === 6; };
  const times: number[] = [];
  for (let t = end; times.length < bars.length; t -= sec) if (sec >= 604800 || !weekend(t)) times.unshift(t);
  const all = bars.map((b, i) => ({ time: times[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: 0 }));
  if (!endDate) return all;
  const until = Date.parse(endDate.replace(" ", "T") + (endDate.length <= 10 ? "T00:00:00Z" : "Z")) / 1000;
  if (!Number.isFinite(until) || until >= end - sec) return all;
  return all.filter(b => b.time < until);
}
