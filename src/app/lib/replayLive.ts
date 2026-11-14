"use client";

// "Like the live market" replay: instead of whole bars appearing one at a time,
// each candle forms from the real ticks of the time — every price change, to the millisecond, in
// its own order — at the market's pace (1× is real time), skipping when the market was closed.
// Ticks only: where none are stored for a time, there's no live replay of it (it replays bar by bar).
// The backend keeps every tick the live collector sends (core.market, raw ticks' table); earlier
// periods are filled from MT5 by pipeline/tick_backfill.py.
//
// This module is the data: the ticks from a moment on, fetched in windows as the replay moves.
// ReplayContext plays them.

import { BACKEND_URL } from "@/lib/backend";
import { isVantageSymbol, vantageServing } from "./vantageFeed";

export type ReplayStep = { t: number; p: number };   // a price (p, the bid) at a moment (t, unix seconds)

// (our own feed's symbols, where the store answers: lib/vantageFeed)
export const liveReplaySupported = (symbol: string) => !!symbol && isVantageSymbol(symbol) && vantageServing(symbol);

const norm = (symbol: string) => symbol.toUpperCase().replace(/\//g, "");

type TickAnswer = { ticks: [number, number][]; to: number; next: number | null };
async function fetchTicks(symbol: string, start: number, end?: number): Promise<TickAnswer | null> {
  try {
    const r = await fetch(`${BACKEND_URL}/api/users/live/ticks/?symbol=${encodeURIComponent(norm(symbol))}&start=${start}${end ? `&end=${end}` : ""}`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d?.ticks) ? d as TickAnswer : null;
  } catch { return null; }
}

// When the stored ticks nearest after `t` begin (null: none after it)
export async function ticksFrom(symbol: string, t: number): Promise<number | null> {
  const a = await fetchTicks(symbol, t, t + 1);
  return a?.next ?? null;
}

export class LiveReplayFeed {
  steps: ReplayStep[] = [];
  i = 0;                      // the next step to play
  private loadedTo = 0;       // unix s: everything before this is loaded
  private loading: Promise<void> | null = null;
  done = false;               // no more ticks after loadedTo
  firstAfter: number | null = null;   // where ticks begin after the requested time, when none were there

  constructor(readonly symbol: string) {}

  // The ticks from `from`; across a stretch without ticks (the market closed), on from where they resume
  private async fill(from: number): Promise<ReplayStep[]> {
    let t = from;
    for (let guard = 0; guard < 6; guard++) {
      const a = await fetchTicks(this.symbol, t);
      if (!a) { this.done = true; return []; }
      this.loadedTo = a.to;
      if (a.ticks.length) return a.ticks.map(([ms, p]) => ({ t: ms / 1000, p }));
      if (a.next === null || a.next <= t) { this.done = true; return []; }
      t = a.next;
    }
    return [];
  }

  // Starts over at `from`: the ticks from then on. No ticks within the hour after it: none (firstAfter
  // says where they begin)
  async seek(from: number): Promise<void> {
    if (this.steps.length && from >= this.steps[0].t && from < this.loadedTo) {
      let lo = 0, hi = this.steps.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (this.steps[mid].t < from) lo = mid + 1; else hi = mid; }
      this.i = lo;
      return;
    }
    this.done = false;
    this.steps = [];
    this.i = 0;
    this.firstAfter = null;
    const a = await fetchTicks(this.symbol, from);
    if (!a) { this.done = true; return; }
    this.loadedTo = a.to;
    if (a.ticks.length && a.ticks[0][0] / 1000 - from < 3600) { this.steps = a.ticks.map(([ms, p]) => ({ t: ms / 1000, p })); return; }
    this.firstAfter = a.ticks.length ? a.ticks[0][0] / 1000 : a.next;
    this.done = true;
  }

  // More ticks after the loaded ones (once at a time)
  more(): Promise<void> {
    if (this.done) return Promise.resolve();
    if (!this.loading) {
      this.loading = this.fill(this.loadedTo).then(next => {
        // (keep some of what's been played, so a step back nearby doesn't refetch)
        const keepFrom = Math.max(0, this.i - 20000);
        this.steps = [...this.steps.slice(keepFrom), ...next];
        this.i -= keepFrom;
      }).finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  get remaining() { return this.steps.length - this.i; }
  get busy() { return !!this.loading; }
}
