"use client";

// "Like the live market" replay (premium accounts): instead of whole bars appearing one at a time,
// each candle forms the way it did at the time, from the 15-second bars the backend stores (or the
// 30-second ones where there are no 15-second bars yet). Every stored bar is played as four price
// steps spread over its time: its open, the extreme it reached first (the low for a rising bar, the
// high for a falling one), the other extreme, and its close. The time runs at the market's own pace
// (1× is real time) and skips the gaps when the market was closed.
//
// This module is the data: the steps from a moment on, fetched in windows as the replay moves.
// ReplayContext plays them.

import { fetchVantageCandles, isVantageSymbol } from "./vantageFeed";

export type ReplayStep = { t: number; p: number };   // a price (p) at a moment (t, unix seconds)

export const liveReplaySupported = (symbol: string) => !!symbol && isVantageSymbol(symbol);

const utc = (t: number) => new Date(t * 1000).toISOString().slice(0, 19).replace("T", " ");

// One stored bar → its four steps
function stepsOf(bar: { time: number; open: number; high: number; low: number; close: number }, secs: number): ReplayStep[] {
  const up = bar.close >= bar.open;
  const q = secs / 4;
  return [
    { t: bar.time, p: bar.open },
    { t: bar.time + q, p: up ? bar.low : bar.high },
    { t: bar.time + 2 * q, p: up ? bar.high : bar.low },
    { t: bar.time + 3 * q, p: bar.close },
  ];
}

export class LiveReplayFeed {
  steps: ReplayStep[] = [];
  i = 0;                      // the next step to play
  private loadedTo = 0;       // unix s: everything before this is loaded
  private sub: 15 | 30 | null = null;
  private loading: Promise<void> | null = null;
  done = false;               // nothing after loadedTo (the present reached)

  constructor(readonly symbol: string) {}

  // One window of stored bars from `from` (at most what one request returns), as steps
  private async window(from: number): Promise<ReplayStep[] | null> {
    const tryOne = async (secs: 15 | 30) => {
      const span = secs === 15 ? 20 * 3600 : 40 * 3600;   // ≤ 4,800 bars: under the endpoint's 5,000
      const bars = await fetchVantageCandles(this.symbol, `${secs}s`, utc(from + span - 1), utc(from));
      return bars ? { bars, span } : null;
    };
    // 15-second bars where they exist (the live collector's), else 30-second ones (all the history)
    let got = this.sub !== 30 ? await tryOne(15) : null;
    if (got && got.bars.length) this.sub = 15;
    else { got = await tryOne(30); if (got && got.bars.length && this.sub === null) this.sub = 30; }
    if (!got) return null;
    this.loadedTo = from + got.span;
    const secs = this.sub ?? 30;
    return got.bars.filter(b => b.time >= from).flatMap(b => stepsOf(b, secs));
  }

  // Loads windows from `from` until some steps come (weekends and holidays have none), or the
  // present is reached
  private async fill(from: number): Promise<ReplayStep[]> {
    let t = from;
    for (let guard = 0; guard < 12; guard++) {
      if (t > Date.now() / 1000) { this.done = true; return []; }
      const got = await this.window(t);
      if (got === null) { this.done = true; return []; }   // the backend has nothing for it
      if (got.length) return got;
      t = this.loadedTo;
    }
    return [];
  }

  // Starts over at `from`: the steps from then on
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
    this.steps = await this.fill(from);
  }

  // More steps after the loaded ones (once at a time)
  more(): Promise<void> {
    if (this.done) return Promise.resolve();
    if (!this.loading) {
      this.loading = this.fill(this.loadedTo).then(next => {
        // (keep a little of what's been played, so a step back nearby doesn't refetch)
        const keepFrom = Math.max(0, this.i - 4000);
        this.steps = [...this.steps.slice(keepFrom), ...next];
        this.i -= keepFrom;
      }).finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  get remaining() { return this.steps.length - this.i; }
  get busy() { return !!this.loading; }
}
