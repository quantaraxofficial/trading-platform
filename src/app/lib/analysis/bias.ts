// The bias for the next hour / 4 hours / day: what the last window of candles did, read the way a
// trader would (the move, where it closed, a sweep of the previous window's high or low, a break out
// of it, the lower and higher timeframe structure, premium / discount), and how each of those has
// actually played out on this market lately. Every past window is read the same way using only the
// candles before it; each reading's track record (how often the next window moved its way) gives it
// its weight, so a market where sweeps reverse and one where they run are read differently. The
// call is tested walk-forward on that history (each past call made only with what was known then),
// so the hit rate said with it is an honest one, not a promise.

import { swings, type Bar, type Side } from "./smc";

export type BiasFactorId = "momentum" | "close" | "sweep" | "breakout" | "structure" | "htf_trend" | "htf_zone";
export const FACTOR_IDS: BiasFactorId[] = ["momentum", "close", "sweep", "breakout", "structure", "htf_trend", "htf_zone"];

export type BiasFactor = {
  id: BiasFactorId;
  value: number;      // -1..1: which way it points now (+ up) and how much
  text: string;       // what it is, said plainly
  n: number;          // past windows where it pointed clearly
  hit: number;        // how often the next window then moved its way (0..1)
  weight: number;     // its weight now: its edge, shrunk while it has few samples (negative: it has worked the other way)
};

export type BiasResult = {
  side: Side | "neutral";
  strength: "strong" | "moderate" | "weak" | "none";
  score: number;
  factors: BiasFactor[];            // by how much each pushed the call (most first)
  window: { start: number; end: number; open: number; high: number; low: number; close: number; prevHigh: number; prevLow: number };
  target?: { price: number; why: string };
  invalidation?: { price: number; why: string };
  typicalMove: number;              // the median size of the next window's move (either way)
  upShare: number;                  // how often the next window closed higher, all windows
  tested: { calls: number; right: number; sameCalls: number; sameRight: number; samples: number; fromTime: number };
  // whether the calls' record beats a coin flip clearly (one-sided, 95%): without it the call is only a lean
  edge: boolean;
};

const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
export const priceDigits = (p: number) => (p >= 100 ? 2 : p >= 1 ? 4 : 5);
export const fmtPrice = (p: number, ref = p) => p.toFixed(priceDigits(Math.abs(ref)));
// "the previous hour's", "the previous 4 hours'"
export const possessive = (s: string) => (s.endsWith("s") ? `${s}'` : `${s}'s`);

// The trend at each bar from its structure: up after a close above the last confirmed swing high,
// down after one below the last swing low (a swing counts k bars after it: nothing from the future)
function structureTrend(bars: Bar[], k: number): number[] {
  const { highs, lows } = swings(bars, k);
  const out: number[] = new Array(bars.length).fill(0);
  let hi = 0, lo = 0, swingHigh = -1, swingLow = -1, trend = 0;
  for (let i = 0; i < bars.length; i++) {
    while (hi < highs.length && highs[hi] + k <= i) swingHigh = highs[hi++];
    while (lo < lows.length && lows[lo] + k <= i) swingLow = lows[lo++];
    if (swingHigh >= 0 && bars[i].close > bars[swingHigh].high) { trend = 1; swingHigh = -1; }
    else if (swingLow >= 0 && bars[i].close < bars[swingLow].low) { trend = -1; swingLow = -1; }
    out[i] = trend;
  }
  return out;
}

type Reading = { values: number[]; texts: string[]; tr: number; o: number; h: number; l: number; c: number; pH: number; pL: number; hi30: number; lo30: number };

// ltf: the candles the windows are read from (5 min for an hour…); htf: the higher timeframe's (1 h for
// an hour…), both oldest first, nothing later than now. w: candles per window read; hz: per window ahead.
export function biasRead(ltf: Bar[], htf: Bar[], ltfSec: number, htfSec: number, w: number, hz: number,
  names: { window: string; ltf: string; htf: string } = { window: "window", ltf: "lower timeframe", htf: "higher timeframe" }): BiasResult | null {
  const last = ltf.length - 1;
  const win = possessive(names.window);
  w = Math.max(2, Math.round(w)); hz = Math.max(1, Math.round(hz));
  // (21 windows behind it: 20 to know a usual window's range, and the one before)
  const first = 21 * w;
  if (last < first + 1) return null;

  const trendL = structureTrend(ltf, 3);
  const trendH = structureTrend(htf, 2);
  // the higher timeframe's last closed bar at each ltf bar
  const htfAt: number[] = new Array(ltf.length).fill(-1);
  for (let i = 0, j = -1; i <= last; i++) {
    const end = ltf[i].time + ltfSec;
    while (j + 1 < htf.length && htf[j + 1].time + htfSec <= end) j++;
    htfAt[i] = j;
  }
  // each window's range (ending at i)
  const range: number[] = new Array(ltf.length).fill(0);
  for (let i = w - 1; i <= last; i++) {
    let h = -Infinity, l = Infinity;
    for (let j = i - w + 1; j <= i; j++) { h = Math.max(h, ltf[j].high); l = Math.min(l, ltf[j].low); }
    range[i] = h - l;
  }

  const read = (i: number): Reading | null => {
    const j = htfAt[i];
    if (j < 30) return null;
    const past: number[] = [];
    for (let m = 1; m <= 20; m++) past.push(range[i - m * w]);
    const tr = median(past) || range[i] || 1e-9;
    let h = -Infinity, l = Infinity, pH = -Infinity, pL = Infinity;
    for (let k = i - w + 1; k <= i; k++) { h = Math.max(h, ltf[k].high); l = Math.min(l, ltf[k].low); }
    for (let k = i - 2 * w + 1; k <= i - w; k++) { pH = Math.max(pH, ltf[k].high); pL = Math.min(pL, ltf[k].low); }
    const o = ltf[i - w + 1].open, c = ltf[i].close;
    let hi30 = -Infinity, lo30 = Infinity;
    for (let k = j - 29; k <= j; k++) { hi30 = Math.max(hi30, htf[k].high); lo30 = Math.min(lo30, htf[k].low); }
    hi30 = Math.max(hi30, h); lo30 = Math.min(lo30, l);
    const pos = hi30 > lo30 ? (c - lo30) / (hi30 - lo30) : 0.5;
    const sweptHigh = h > pH && c < pH, sweptLow = l < pL && c > pL;
    const move = c - o;
    const clv = h > l ? (2 * (c - l)) / (h - l) - 1 : 0;
    const values = [
      clamp(move / tr),
      clv,
      (sweptLow ? 1 : 0) - (sweptHigh ? 1 : 0),
      c > pH ? 1 : c < pL ? -1 : 0,
      trendL[i],
      trendH[j],
      clamp(1 - 2 * pos),
    ];
    const pct = o ? Math.abs(move / o) * 100 : 0;
    const texts = [
      `the last ${names.window} ${move >= 0 ? "rose" : "fell"} ${fmtPrice(Math.abs(move), c)} (${pct.toFixed(2)}%)`,
      clv > 0.5 ? "it closed near its high" : clv < -0.5 ? "it closed near its low" : "it closed mid-range",
      sweptLow && sweptHigh ? `it took both the previous ${win} high and low` : sweptLow ? `it took the previous ${win} low (${fmtPrice(pL)}) and closed back above it`
        : sweptHigh ? `it took the previous ${win} high (${fmtPrice(pH)}) and closed back below it` : `no sweep of the previous ${win} high or low`,
      c > pH ? `it closed above the previous ${win} high (${fmtPrice(pH)})` : c < pL ? `it closed below the previous ${win} low (${fmtPrice(pL)})` : `it closed inside the previous ${win} range`,
      `the ${names.ltf} structure is ${trendL[i] > 0 ? "bullish" : trendL[i] < 0 ? "bearish" : "unclear"}`,
      `the ${names.htf} structure is ${trendH[j] > 0 ? "bullish" : trendH[j] < 0 ? "bearish" : "unclear"}`,
      pos > 0.5 ? `price is in the premium (upper ${Math.round(pos * 100)}%) of the recent ${names.htf} range` : `price is in the discount (lower ${Math.round(pos * 100)}%) of the recent ${names.htf} range`,
    ];
    return { values, texts, tr, o, h, l, c, pH, pL, hi30, lo30 };
  };

  // The windows on a grid ending now, one window ahead apart: each earlier one's outcome is known
  // before the next is read (walk-forward)
  const grid: number[] = [];
  for (let i = last; i >= first; i -= hz) grid.unshift(i);
  const F = FACTOR_IDS.length;
  const n = new Array(F).fill(0), agree = new Array(F).fill(0);
  const weightOf = (f: number) => (n[f] ? (agree[f] / n[f] - 0.5) * (n[f] / (n[f] + 30)) : 0);
  const pastScores: number[] = [];
  const calls: { s: number; right: boolean }[] = [];
  const moves: number[] = [];
  let ups = 0, outcomes = 0, fromTime = 0;
  let now: { r: Reading; score: number; weights: number[] } | null = null;

  for (const i of grid) {
    const r = read(i);
    if (!r) continue;
    const weights = FACTOR_IDS.map((_, f) => weightOf(f));
    const score = r.values.reduce((a, v, f) => a + v * weights[f], 0);
    if (i === last) { now = { r, score, weights }; break; }
    if (!fromTime) fromTime = ltf[i].time;
    const d = ltf[i + hz].close - ltf[i].close;
    const y = Math.abs(d) < 0.05 * r.tr ? 0 : sign(d);
    moves.push(Math.abs(d));
    if (y) { outcomes++; if (y > 0) ups++; }
    // (a call once there's a record to weigh the readings by)
    if (pastScores.length >= 30 && y) {
      const cut = quantile(pastScores, 0.25);
      if (Math.abs(score) >= cut && score !== 0) calls.push({ s: Math.abs(score), right: sign(score) === y });
    }
    pastScores.push(Math.abs(score));
    if (y) r.values.forEach((v, f) => { if (Math.abs(v) >= 0.25) { n[f]++; if (sign(v) === y) agree[f]++; } });
  }
  if (!now) return null;

  const { r, score, weights } = now;
  const q25 = quantile(pastScores, 0.25), q60 = quantile(pastScores, 0.6), q85 = quantile(pastScores, 0.85);
  const abs = Math.abs(score);
  const enough = pastScores.length >= 30;
  const strength: BiasResult["strength"] = !enough || abs < q25 || score === 0 ? "none" : abs >= q85 ? "strong" : abs >= q60 ? "moderate" : "weak";
  const side: BiasResult["side"] = strength === "none" ? "neutral" : score > 0 ? "bull" : "bear";
  const bucket = (s: number) => (s >= q85 ? 2 : s >= q60 ? 1 : 0);
  const same = calls.filter(c => bucket(c.s) === bucket(abs));

  const factors: BiasFactor[] = FACTOR_IDS.map((id, f) => ({ id, value: r.values[f], text: r.texts[f], n: n[f], hit: n[f] ? agree[f] / n[f] : 0.5, weight: weights[f] }))
    .sort((a, b) => Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight));

  // where it would go and where it's wrong: the nearest liquidity its way (the windows' highs / lows,
  // the higher timeframe's range edge), and the far side of the window just read
  const above = [[r.pH, `the previous ${win} high`], [r.h, `this ${win} high`], [r.hi30, `the recent ${names.htf} high`]] as [number, string][];
  const below = [[r.pL, `the previous ${win} low`], [r.l, `this ${win} low`], [r.lo30, `the recent ${names.htf} low`]] as [number, string][];
  const typical = median(moves) || r.tr / 2;
  const near = (list: [number, string][], up: boolean) => list.filter(([p]) => (up ? p > r.c : p < r.c) && Math.abs(p - r.c) >= 0.15 * typical)
    .sort((a, b) => Math.abs(a[0] - r.c) - Math.abs(b[0] - r.c))[0];
  let target: BiasResult["target"], invalidation: BiasResult["invalidation"];
  if (side !== "neutral") {
    const t = near(side === "bull" ? above : below, side === "bull");
    target = t ? { price: t[0], why: t[1] } : { price: r.c + (side === "bull" ? typical : -typical), why: `a usual ${win} move` };
    const inv = side === "bull" ? r.l : r.h;
    invalidation = { price: inv, why: `this ${win} ${side === "bull" ? "low" : "high"}` };
  }

  const right = calls.filter(c => c.right).length;
  const edge = calls.length >= 30 && (right / calls.length - 0.5) / Math.sqrt(0.25 / calls.length) >= 1.645;
  return {
    side, strength, score, factors, edge,
    window: { start: last - w + 1, end: last, open: r.o, high: r.h, low: r.l, close: r.c, prevHigh: r.pH, prevLow: r.pL },
    target, invalidation, typicalMove: typical, upShare: outcomes ? ups / outcomes : 0.5,
    tested: { calls: calls.length, right, sameCalls: same.length, sameRight: same.filter(c => c.right).length, samples: pastScores.length, fromTime },
  };
}

function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
