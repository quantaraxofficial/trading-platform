// Candlestick patterns, for the voice assistant ("mark the candle patterns", "mark the dojis",
// "mark harami and tweezers"): every common single, two, three and five candle pattern, worked
// out from the bars. A pattern is labelled on its last candle (bullish ones below it, bearish
// above). Patterns that mean something only after a move (a hammer after a fall, a hanging man after
// a rise) look at the trend before them: the close 5 bars back against the last one, at least half
// an ATR apart.
//
// The rules (body = |close - open|, range = high - low, wicks above / below the body; "big" = a
// body of at least 0.6 ATR, "small" = at most 0.3 ATR):
//   Doji               body ≤ 10% of the range
//     dragonfly         … no upper wick (≤ 10%), long lower wick (≥ 60%)
//     gravestone        … no lower wick, long upper wick
//     long-legged       … both wicks ≥ 30% and the range ≥ 1 ATR
//   Hammer / hanging man   lower wick ≥ 2× body, upper wick ≤ 10% of the range: after a fall a
//                     hammer (bullish), after a rise a hanging man (bearish)
//   Inverted hammer / shooting star   the same upside down: after a fall an inverted hammer,
//                     after a rise a shooting star
//   Spinning top      body ≤ 30% of the range, both wicks longer than the body
//   Marubozu          body ≥ 95% of the range, range ≥ 0.8 ATR
//   Belt hold         a big candle opening at its extreme (wick ≤ 5%) against the trend before it
//   Engulfing         this body covers the last one's, the other colour
//   Harami (cross)    a small body (a doji: cross) inside the last big body, the other colour
//   Piercing line     after a big down candle, an up candle opening at / below its close and
//                     closing above its middle (but below its open); dark cloud cover mirrored
//   Tweezer bottom / top   two lows (highs) within 0.05 ATR, down then up (up then down), after
//                     a fall (rise)
//   Kicker            an up candle opening at / above the last down candle's open (or mirrored)
//   Inside bar        the range inside the last one's;   Outside bar: beyond it both ways
//   Morning / evening star   big candle, small middle, then a candle closing past the first's
//                     middle the other way (a doji middle: doji star; one clear of both neighbours'
//                     ranges: abandoned baby)
//   Three white soldiers / black crows   three big candles of one colour, each closing further,
//                     each opening inside the last body, small wicks where they close
//   Three inside up / down   a harami, then a candle closing past the first's open
//   Three outside up / down  an engulfing, then a candle closing further
//   Rising / falling three methods   a big candle, three small ones inside its range, then a big
//                     one closing beyond the first's close

import { atr, type Bar, type Side, type Zone } from "./smc";

export type CandlePattern = { id: string; name: string; bars: number };
export const CANDLE_PATTERNS: CandlePattern[] = [
  { id: "doji", name: "Doji", bars: 1 }, { id: "dragonfly_doji", name: "Dragonfly doji", bars: 1 },
  { id: "gravestone_doji", name: "Gravestone doji", bars: 1 }, { id: "long_legged_doji", name: "Long-legged doji", bars: 1 },
  { id: "hammer", name: "Hammer", bars: 1 }, { id: "hanging_man", name: "Hanging man", bars: 1 },
  { id: "inverted_hammer", name: "Inverted hammer", bars: 1 }, { id: "shooting_star", name: "Shooting star", bars: 1 },
  { id: "spinning_top", name: "Spinning top", bars: 1 }, { id: "marubozu", name: "Marubozu", bars: 1 }, { id: "belt_hold", name: "Belt hold", bars: 1 },
  { id: "engulfing", name: "Engulfing", bars: 2 }, { id: "harami", name: "Harami", bars: 2 }, { id: "harami_cross", name: "Harami cross", bars: 2 },
  { id: "piercing_line", name: "Piercing line", bars: 2 }, { id: "dark_cloud_cover", name: "Dark cloud cover", bars: 2 },
  { id: "tweezer", name: "Tweezer", bars: 2 }, { id: "kicker", name: "Kicker", bars: 2 },
  { id: "inside_bar", name: "Inside bar", bars: 2 }, { id: "outside_bar", name: "Outside bar", bars: 2 },
  { id: "morning_star", name: "Morning star", bars: 3 }, { id: "evening_star", name: "Evening star", bars: 3 },
  { id: "doji_star", name: "Doji star", bars: 3 }, { id: "abandoned_baby", name: "Abandoned baby", bars: 3 },
  { id: "three_white_soldiers", name: "Three white soldiers", bars: 3 }, { id: "three_black_crows", name: "Three black crows", bars: 3 },
  { id: "three_inside", name: "Three inside up / down", bars: 3 }, { id: "three_outside", name: "Three outside up / down", bars: 3 },
  { id: "three_methods", name: "Rising / falling three methods", bars: 5 },
];
export const CANDLE_PATTERN_IDS = CANDLE_PATTERNS.map(p => p.id);

type Hit = { id: string; side: Side; text: string };

export function candlePatterns(bars: Bar[], from: number, opts: { patterns?: string[]; max?: number } = {}): Zone[] {
  const last = bars.length - 1;
  if (last < 6) return [];
  const want = opts.patterns?.length ? new Set(opts.patterns) : null;
  const a = atr(bars);
  const out: Zone[] = [];
  // (asked for one pattern: look further back for it; all of them: the latest 80 bars)
  const start = Math.max(6, want ? from : Math.max(from, last - 79));
  for (let i = start; i <= last; i++) {
    const hits = detect(bars, i, a[i - 1] || a[i] || 1).filter(h => !want || want.has(h.id));
    if (!hits.length) continue;
    // the most telling one on this candle (the longest pattern; listed first among equals)
    const h = hits[0];
    const unit = a[i] || 1;
    out.push({ kind: "candle", side: h.side, from: i, to: i, top: h.side === "bull" ? bars[i].low - unit * 0.15 : bars[i].high + unit * 0.9, bottom: 0,
      label: h.text, shape: "label" });
    out[out.length - 1].bottom = out[out.length - 1].top;
  }
  return out.slice(-(opts.max ?? (want ? 30 : 20)));
}

function detect(bars: Bar[], i: number, unit: number): Hit[] {
  const b = bars[i], p = bars[i - 1], q = bars[i - 2];
  const up = (x: Bar) => x.close > x.open, down = (x: Bar) => x.close < x.open;
  const body = (x: Bar) => Math.abs(x.close - x.open), range = (x: Bar) => Math.max(x.high - x.low, 1e-9);
  const top = (x: Bar) => Math.max(x.open, x.close), bot = (x: Bar) => Math.min(x.open, x.close);
  const upper = (x: Bar) => x.high - top(x), lower = (x: Bar) => bot(x) - x.low;
  const big = (x: Bar) => body(x) >= unit * 0.6, small = (x: Bar) => body(x) <= unit * 0.3;
  const isDoji = (x: Bar) => body(x) <= range(x) * 0.1;
  // the move before candle j (its 5 bars)
  const trend = (j: number): Side | null => {
    const d = bars[j - 1].close - bars[Math.max(0, j - 6)].close;
    return d > unit * 0.5 ? "bull" : d < -unit * 0.5 ? "bear" : null;
  };
  const before = trend(i), before2 = trend(i - 1);
  const hits: Hit[] = [];
  const add = (id: string, side: Side, text: string) => hits.push({ id, side, text });

  // ---- five candles
  if (i >= 4) {
    const f = bars[i - 4], mid = [bars[i - 3], bars[i - 2], bars[i - 1]];
    const inside = mid.every(m => m.high <= f.high && m.low >= f.low && body(m) < body(f) * 0.6);
    if (inside && big(f) && big(b)) {
      if (up(f) && up(b) && b.close > f.close) add("three_methods", "bull", "Rising three methods");
      else if (down(f) && down(b) && b.close < f.close) add("three_methods", "bear", "Falling three methods");
    }
  }
  // ---- three candles
  const qMid = (q.open + q.close) / 2;
  if (big(q) && small(p)) {
    const clear = p.high < Math.min(q.low, b.low) || p.low > Math.max(q.high, b.high);
    if (down(q) && up(b) && b.close > qMid) {
      if (isDoji(p) && clear) add("abandoned_baby", "bull", "Bullish abandoned baby");
      else if (isDoji(p)) add("doji_star", "bull", "Morning doji star");
      else add("morning_star", "bull", "Morning star");
    } else if (up(q) && down(b) && b.close < qMid) {
      if (isDoji(p) && clear) add("abandoned_baby", "bear", "Bearish abandoned baby");
      else if (isDoji(p)) add("doji_star", "bear", "Evening doji star");
      else add("evening_star", "bear", "Evening star");
    }
  }
  const three = [q, p, b];
  if (three.every(x => up(x) && body(x) >= unit * 0.5 && upper(x) <= body(x) * 0.35)
    && p.close > q.close && b.close > p.close && p.open >= bot(q) && p.open <= top(q) && b.open >= bot(p) && b.open <= top(p)) add("three_white_soldiers", "bull", "Three white soldiers");
  if (three.every(x => down(x) && body(x) >= unit * 0.5 && lower(x) <= body(x) * 0.35)
    && p.close < q.close && b.close < p.close && p.open >= bot(q) && p.open <= top(q) && b.open >= bot(p) && b.open <= top(p)) add("three_black_crows", "bear", "Three black crows");
  const haramiAt = (x: Bar, y: Bar) => big(x) && top(y) <= top(x) && bot(y) >= bot(x) && body(y) < body(x) * 0.6;
  if (haramiAt(q, p) && down(q) && up(p) && up(b) && b.close > q.open) add("three_inside", "bull", "Three inside up");
  if (haramiAt(q, p) && up(q) && down(p) && down(b) && b.close < q.open) add("three_inside", "bear", "Three inside down");
  const engulfAt = (x: Bar, y: Bar) => top(y) >= top(x) && bot(y) <= bot(x) && body(y) > body(x);
  if (down(q) && up(p) && engulfAt(q, p) && up(b) && b.close > p.close) add("three_outside", "bull", "Three outside up");
  if (up(q) && down(p) && engulfAt(q, p) && down(b) && b.close < p.close) add("three_outside", "bear", "Three outside down");

  // ---- two candles
  if (down(p) && up(b) && engulfAt(p, b)) add("engulfing", "bull", "Bullish engulfing");
  if (up(p) && down(b) && engulfAt(p, b)) add("engulfing", "bear", "Bearish engulfing");
  if (haramiAt(p, b)) {
    if (isDoji(b)) add("harami_cross", down(p) ? "bull" : "bear", down(p) ? "Bullish harami cross" : "Bearish harami cross");
    else if (down(p) && up(b)) add("harami", "bull", "Bullish harami");
    else if (up(p) && down(b)) add("harami", "bear", "Bearish harami");
  }
  const pMid = (p.open + p.close) / 2;
  if (down(p) && big(p) && up(b) && b.open <= p.close && b.close > pMid && b.close < p.open) add("piercing_line", "bull", "Piercing line");
  if (up(p) && big(p) && down(b) && b.open >= p.close && b.close < pMid && b.close > p.open) add("dark_cloud_cover", "bear", "Dark cloud cover");
  if (Math.abs(p.low - b.low) <= unit * 0.05 && down(p) && up(b) && before2 === "bear") add("tweezer", "bull", "Tweezer bottom");
  if (Math.abs(p.high - b.high) <= unit * 0.05 && up(p) && down(b) && before2 === "bull") add("tweezer", "bear", "Tweezer top");
  if (down(p) && up(b) && b.open >= p.open && big(b)) add("kicker", "bull", "Bullish kicker");
  if (up(p) && down(b) && b.open <= p.open && big(b)) add("kicker", "bear", "Bearish kicker");
  if (b.high < p.high && b.low > p.low) add("inside_bar", up(b) ? "bull" : "bear", "Inside bar");
  if (b.high > p.high && b.low < p.low && !engulfAt(p, b)) add("outside_bar", up(b) ? "bull" : "bear", "Outside bar");

  // ---- one candle
  const r = range(b), bd = body(b);
  if (isDoji(b) && r > unit * 0.25) {
    if (upper(b) <= r * 0.1 && lower(b) >= r * 0.6) add("dragonfly_doji", "bull", "Dragonfly doji");
    else if (lower(b) <= r * 0.1 && upper(b) >= r * 0.6) add("gravestone_doji", "bear", "Gravestone doji");
    else if (upper(b) >= r * 0.3 && lower(b) >= r * 0.3 && r >= unit) add("long_legged_doji", before === "bull" ? "bear" : "bull", "Long-legged doji");
    else add("doji", before === "bull" ? "bear" : "bull", "Doji");
  } else if (r > unit * 0.4) {
    if (lower(b) >= 2 * bd && upper(b) <= r * 0.1) {
      if (before === "bear") add("hammer", "bull", "Hammer");
      else if (before === "bull") add("hanging_man", "bear", "Hanging man");
    }
    if (upper(b) >= 2 * bd && lower(b) <= r * 0.1) {
      if (before === "bear") add("inverted_hammer", "bull", "Inverted hammer");
      else if (before === "bull") add("shooting_star", "bear", "Shooting star");
    }
    if (bd <= r * 0.3 && upper(b) > bd && lower(b) > bd) add("spinning_top", up(b) ? "bull" : "bear", "Spinning top");
    if (bd >= r * 0.95 && r >= unit * 0.8) add("marubozu", up(b) ? "bull" : "bear", up(b) ? "Bullish marubozu" : "Bearish marubozu");
    else if (big(b) && up(b) && lower(b) <= r * 0.05 && before === "bear") add("belt_hold", "bull", "Bullish belt hold");
    else if (big(b) && down(b) && upper(b) <= r * 0.05 && before === "bull") add("belt_hold", "bear", "Bearish belt hold");
  }
  return hits;
}
