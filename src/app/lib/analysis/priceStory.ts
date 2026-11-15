// What a market did over a period, from its candles: where it opened and closed, its high and low and
// when, the change, the path it took (its legs: rises and falls of note, found as a zigzag), the
// biggest single moves, how volatile it was against its own usual, and the crowd behind it — volume
// against the usual, how much of it came on rising bars and how much on falling ones (who was in
// control), and the bars where it spiked. "The usual" is the same length of time just before.

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
export type Leg = { from: number; to: number; fromPrice: number; toPrice: number; pct: number };
export type Story = {
  open: number; close: number; change: number; pct: number;
  high: number; highAt: number; low: number; lowAt: number;
  rangePct: number;
  trend: "up" | "down" | "sideways"; steadiness: number;      // steadiness: how straight (R², 0..1)
  shape: string;                                              // "a steady rise", "a fall, then a recovery"…
  legs: Leg[];
  bigUp: { time: number; pct: number } | null; bigDown: { time: number; pct: number } | null;
  upBars: number; downBars: number; bars: number;
  volatility: number | null;                                  // the bars' size against the usual (1: usual)
  volume: null | {
    vsUsual: number | null;                                   // the period's volume against the usual (1: usual)
    upShare: number;                                          // of it, on rising bars (0..1)
    spikes: { time: number; times: number; pct: number }[];   // the heaviest bars: how many times the period's average, and their move
    trend: "rising" | "falling" | "flat";                     // through the period
  };
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

// The period's bars (from..to) and, when given, those just before it (the usual)
export function priceStory(bars: Bar[], before: Bar[] = []): Story | null {
  if (bars.length < 2) return null;
  const open = bars[0].open, close = bars[bars.length - 1].close;
  let hi = 0, lo = 0;
  bars.forEach((b, i) => { if (b.high > bars[hi].high) hi = i; if (b.low < bars[lo].low) lo = i; });
  const high = bars[hi].high, low = bars[lo].low;
  const change = close - open, pct = open ? (change / open) * 100 : 0;
  const rangePct = low ? ((high - low) / low) * 100 : 0;

  // the straight line through the closes: which way, and how straight
  const n = bars.length, xs = bars.map((_, i) => i), ys = bars.map(b => b.close);
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  const steadiness = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
  const trend: Story["trend"] = Math.abs(pct) < Math.max(0.15, rangePct * 0.2) ? "sideways" : pct > 0 ? "up" : "down";

  // the legs: swings of at least a quarter of the range (at least 0.3 %), as a zigzag
  const legs: Leg[] = [];
  const minMove = Math.max((high - low) * 0.25, open * 0.003);
  const leg = (fi: number, fp: number, ti: number, tp: number) => legs.push({ from: bars[fi].time, to: bars[ti].time, fromPrice: fp, toPrice: tp, pct: ((tp - fp) / fp) * 100 });
  let dir = 0, pivotI = 0, pivotP = open, extI = 0, extP = open;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (dir === 0) {
      if (b.high - open >= minMove) { dir = 1; extI = i; extP = b.high; }
      else if (open - b.low >= minMove) { dir = -1; extI = i; extP = b.low; }
      continue;
    }
    if (dir === 1) {
      if (b.high >= extP) { extI = i; extP = b.high; }
      else if (extP - b.low >= minMove) { leg(pivotI, pivotP, extI, extP); pivotI = extI; pivotP = extP; dir = -1; extI = i; extP = b.low; }
    } else {
      if (b.low <= extP) { extI = i; extP = b.low; }
      else if (b.high - extP >= minMove) { leg(pivotI, pivotP, extI, extP); pivotI = extI; pivotP = extP; dir = 1; extI = i; extP = b.high; }
    }
  }
  if (dir !== 0) {
    leg(pivotI, pivotP, extI, extP);
    // (and the way back from that last extreme, when it's a move of note)
    if (Math.abs(close - extP) >= minMove * 0.6 && extI < n - 1) leg(extI, extP, n - 1, close);
  }

  // its shape, in words
  const shape = (() => {
    if (legs.length <= 1) {
      if (trend === "sideways") return "a sideways drift";
      return `${steadiness >= 0.7 ? "a steady" : "a choppy"} ${trend === "up" ? "rise" : "fall"}`;
    }
    if (legs.length === 2) {
      const [a, b] = legs;
      const r = Math.abs(b.pct) / Math.max(0.0001, Math.abs(a.pct));
      if (a.pct < 0 && b.pct > 0) return r >= 1.5 ? "a dip, then a much bigger rise" : r >= 0.8 ? "a fall, then a full recovery (a V)" : "a fall, then a partial recovery";
      if (a.pct > 0 && b.pct < 0) return r >= 1.5 ? "a brief rise, then a much bigger fall" : r >= 0.8 ? "a rise, then a full give-back (an inverted V)" : "a rise, then a pullback";
    }
    if (trend === "sideways") return `a range, back and forth ${legs.length} times`;
    return `a ${trend === "up" ? "rise" : "fall"} in ${legs.filter(l => (l.pct > 0) === (trend === "up")).length} legs, with ${legs.filter(l => (l.pct > 0) !== (trend === "up")).length} pullbacks`;
  })();

  // the biggest single moves
  let bigUp: Story["bigUp"] = null, bigDown: Story["bigDown"] = null;
  for (const b of bars) {
    const m = b.open ? ((b.close - b.open) / b.open) * 100 : 0;
    if (m > 0 && (!bigUp || m > bigUp.pct)) bigUp = { time: b.time, pct: m };
    if (m < 0 && (!bigDown || m < bigDown.pct)) bigDown = { time: b.time, pct: m };
  }
  const upBars = bars.filter(b => b.close > b.open).length, downBars = bars.filter(b => b.close < b.open).length;

  // how volatile against the usual (the bars' size)
  const size = (bs: Bar[]) => mean(bs.map(b => (b.low ? (b.high - b.low) / b.low : 0)));
  const volatility = before.length >= 5 && size(before) > 0 ? size(bars) / size(before) : null;

  // the crowd: volume against the usual, on which bars, its spikes
  const hasVol = bars.filter(b => (b.volume ?? 0) > 0).length >= bars.length * 0.6;
  let volume: Story["volume"] = null;
  if (hasVol) {
    const v = (b: Bar) => b.volume ?? 0;
    const total = bars.reduce((s, b) => s + v(b), 0), avg = total / bars.length;
    const beforeVol = before.filter(b => v(b) > 0);
    const vsUsual = beforeVol.length >= 5 ? avg / mean(beforeVol.map(v)) : null;
    const up = bars.filter(b => b.close > b.open).reduce((s, b) => s + v(b), 0), down = bars.filter(b => b.close < b.open).reduce((s, b) => s + v(b), 0);
    const spikes = bars.filter(b => v(b) >= avg * 2.2).sort((a, b) => v(b) - v(a)).slice(0, 3)
      .map(b => ({ time: b.time, times: v(b) / avg, pct: b.open ? ((b.close - b.open) / b.open) * 100 : 0 }));
    const half = Math.floor(bars.length / 2), first = mean(bars.slice(0, half).map(v)), second = mean(bars.slice(half).map(v));
    volume = { vsUsual, upShare: up + down ? up / (up + down) : 0.5, spikes, trend: second > first * 1.25 ? "rising" : second < first * 0.8 ? "falling" : "flat" };
  }

  return { open, close, change, pct, high, highAt: bars[hi].time, low, lowAt: bars[lo].time, rangePct, trend, steadiness, shape, legs,
    bigUp, bigDown, upBars, downBars, bars: n, volatility, volume };
}
