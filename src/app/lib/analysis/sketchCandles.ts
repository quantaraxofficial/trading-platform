// Candles drawn to explain, not a market: a teacher's sketch. From a recipe — candles one by one
// (green / red, small … huge, their wicks), or a number of them in a trend with one colour bigger,
// and / or a pattern (a doji, an engulfing, a double top, a head and shoulders, a flag, a liquidity
// sweep, a fair value gap, an order block, a break of structure…) — real candles are made (each
// opening where the last closed), with the pattern's parts labelled for the lesson: its neckline,
// its sweep, its gap, its block.

import type { Zone } from "./smc";

export type CandleSize = "tiny" | "small" | "medium" | "big" | "huge";
export type CandleWick = "none" | "short" | "long" | "long_top" | "long_bottom";
export type SketchCandle = { color: "green" | "red"; size?: CandleSize; wick?: CandleWick };
export const SKETCH_PATTERNS = [
  "doji", "hammer", "shooting_star", "pin_bar", "bullish_engulfing", "bearish_engulfing", "morning_star", "evening_star",
  "three_white_soldiers", "three_black_crows", "inside_bar", "double_top", "double_bottom", "head_and_shoulders",
  "inverse_head_and_shoulders", "ascending_triangle", "descending_triangle", "bull_flag", "bear_flag", "liquidity_sweep",
  "bearish_liquidity_sweep", "bullish_fvg", "bearish_fvg", "bullish_order_block", "bearish_order_block", "bullish_bos",
  "bearish_bos", "bullish_choch", "bearish_choch", "range", "breakout", "v_reversal", "support", "resistance",
] as const;
export type SketchPattern = typeof SKETCH_PATTERNS[number];
export type SketchSpec = {
  candles?: SketchCandle[];            // exactly these, in order
  count?: number;                      // else this many (default 24)
  trend?: "up" | "down" | "sideways";
  bigger?: "green" | "red" | "equal";  // which colour's candles are bigger
  pattern?: SketchPattern;             // drawn after them
  start?: number;                      // the price it starts at (default 100)
};
export type SketchBar = { open: number; high: number; low: number; close: number };
export type Sketch = { bars: SketchBar[]; marks: Zone[]; caption: string };

const SIZE: Record<CandleSize, number> = { tiny: 0.25, small: 0.6, medium: 1, big: 1.8, huge: 3 };
const GREEN = "#089981", RED = "#f23645", BLUE = "#2962ff", GREY = "#787b86", ORANGE = "#ff9800";

// a steady pseudo-random series (the same recipe, the same sketch)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

export function sketchCandles(spec: SketchSpec): Sketch {
  const start = spec.start && spec.start > 0 ? spec.start : 100;
  const u = start * 0.004;                     // one "unit" of candle body
  const rand = rng(hash(JSON.stringify(spec)));
  const bars: SketchBar[] = [];
  const marks: Zone[] = [];
  let price = start;
  const last = () => bars.length - 1;
  // one candle from here: its body (signed, in units) and its wicks (in units)
  const candle = (body: number, top = 0.25, bottom = 0.25, openAt = price) => {
    const o = openAt, c = o + body * u;
    bars.push({ open: o, close: c, high: Math.max(o, c) + top * u, low: Math.min(o, c) - bottom * u });
    price = c;
  };
  const wickOf = (w: CandleWick | undefined): [number, number] => {
    const r = () => 0.1 + rand() * 0.35;
    switch (w) {
      case "none": return [0, 0];
      case "long": return [1.2 + rand() * 0.4, 1.2 + rand() * 0.4];
      case "long_top": return [1.5 + rand() * 0.5, r() * 0.5];
      case "long_bottom": return [r() * 0.5, 1.5 + rand() * 0.5];
      case "short": return [r() * 0.5, r() * 0.5];
      default: return [r(), r()];
    }
  };
  // a walk: over n candles, about `move` units in all (some candles against it, as markets do)
  const walk = (n: number, move: number, sizeMul = 1) => {
    const target = price + move * u;
    for (let i = 0; i < n; i++) {
      const left = n - i, need = (target - price) / u / left;
      let body = need + (rand() - 0.5) * 0.8 * sizeMul;
      if (Math.abs(body) < 0.15) body = body >= 0 ? 0.2 : -0.2;
      if (i === n - 1) body = (target - price) / u || 0.2;
      const [t, b] = wickOf(undefined);
      candle(body, t, b);
    }
  };
  const label = (i: number, at: number, text: string, color: string, below = false) =>
    marks.push({ kind: "label", side: below ? "bull" : "bear", from: i, to: i, top: at + (below ? -0.55 : 0.55) * u, bottom: at, label: text, shape: "label", color } as Zone);
  const level = (from: number, to: number, at: number, text: string, color: string, dashed = true) =>
    marks.push({ kind: "line", side: "bull", from, to, top: at, bottom: at, label: text, shape: "line", dashed, color, extend: false } as Zone);
  const box = (from: number, to: number, top: number, bottom: number, text: string, color: string) =>
    marks.push({ kind: "box", side: "bull", from, to, top, bottom, label: text, color, extend: false } as Zone);
  const hi = (i: number) => bars[i].high, lo = (i: number) => bars[i].low;
  const hiOf = (a: number, b: number) => { let k = a; for (let i = a; i <= b; i++) if (bars[i].high > bars[k].high) k = i; return k; };
  const loOf = (a: number, b: number) => { let k = a; for (let i = a; i <= b; i++) if (bars[i].low < bars[k].low) k = i; return k; };

  // ---- the lead-in: the candles asked for, or a trend with one colour bigger
  const pattern = spec.pattern;
  const bearishSetup = pattern && /^(shooting_star|bearish|evening_star|three_black_crows|double_top|head_and_shoulders|descending|bear_|resistance)/.test(pattern);
  const bullishSetup = pattern && /^(hammer|pin_bar|bullish|morning_star|three_white|double_bottom|inverse_head|support|v_reversal)/.test(pattern);
  const trend = spec.trend ?? (bullishSetup ? "down" : bearishSetup ? "up" : "sideways");
  if (spec.candles?.length) {
    for (const c of spec.candles.slice(0, 120)) {
      const [t, b] = wickOf(c.wick);
      const s = SIZE[c.size ?? "medium"] * (0.85 + rand() * 0.3);
      candle(c.color === "green" ? s : -s, t, b);
    }
  } else {
    const n = Math.max(3, Math.min(150, spec.count ?? (pattern ? 12 : 24)));
    // (in a trend, two in three candles go its way, the ones against it smaller; which colour is
    // bigger when asked; sideways, pulled back towards where it began)
    const against = trend === "sideways" ? 1 : 0.65;
    const greenMul = (spec.bigger === "green" ? 1.8 : spec.bigger === "red" ? 0.7 : 1) * (trend === "down" ? against : 1);
    const redMul = (spec.bigger === "red" ? 1.8 : spec.bigger === "green" ? 0.7 : 1) * (trend === "up" ? against : 1);
    // (the bigger candles against the trend: more candles its way, so the trend still shows)
    const share = (spec.bigger === "red" && trend === "up") || (spec.bigger === "green" && trend === "down") ? 0.8 : 0.67;
    const greens = trend === "up" ? Math.round(n * share) : trend === "down" ? Math.round(n * (1 - share)) : Math.round(n / 2);
    const colours = Array.from({ length: n }, (_, i) => i < greens);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [colours[i], colours[j]] = [colours[j], colours[i]]; }
    for (let i = 0; i < n; i++) {
      let green = colours[i];
      if (trend === "sideways" && Math.abs(price - start) > 3 * u) green = price < start;
      const s = (0.6 + rand() * 0.8) * (green ? greenMul : redMul);
      const [t, b] = wickOf(undefined);
      candle(green ? s : -s, t, b);
    }
  }

  const leadN = bars.length;

  // ---- the pattern, after the lead-in, its parts labelled
  let caption = "";
  const P = () => price;
  switch (pattern) {
    case "doji": { const i = bars.length; candle(0.02, 1.1, 1.1); label(i, hi(i), "Doji", GREY); caption = "a doji: it opened and closed at about the same price, with wicks both ways: indecision"; break; }
    case "hammer": case "pin_bar": { const i = bars.length; candle(0.3, 0.05, 1.6); label(i, lo(i), pattern === "pin_bar" ? "Pin bar" : "Hammer", GREEN, true); walk(4, 2.5); caption = `a ${pattern === "pin_bar" ? "bullish pin bar" : "hammer"} after a fall: a small body on top and a long lower wick, sellers pushed down and buyers pushed back, then price rose`; break; }
    case "shooting_star": { const i = bars.length; candle(-0.3, 1.6, 0.05); label(i, hi(i), "Shooting star", RED); walk(4, -2.5); caption = "a shooting star after a rise: a small body at the bottom and a long upper wick, buyers rejected, then price fell"; break; }
    case "bullish_engulfing": { const i = bars.length; candle(-0.6, 0.2, 0.2); candle(1.6, 0.25, 0.15, price - 0.1 * u); box(i, i + 1, Math.max(hi(i), hi(i + 1)), Math.min(lo(i), lo(i + 1)), "Bullish engulfing", GREEN); walk(4, 2.5); caption = "a bullish engulfing: a small red candle, then a green one whose body swallows it whole, buyers taking over"; break; }
    case "bearish_engulfing": { const i = bars.length; candle(0.6, 0.2, 0.2); candle(-1.6, 0.15, 0.25, price + 0.1 * u); box(i, i + 1, Math.max(hi(i), hi(i + 1)), Math.min(lo(i), lo(i + 1)), "Bearish engulfing", RED); walk(4, -2.5); caption = "a bearish engulfing: a small green candle, then a red one whose body swallows it, sellers taking over"; break; }
    case "morning_star": { const i = bars.length; candle(-1.8); candle(0.05, 0.4, 0.4, price - 0.3 * u); candle(1.8, 0.2, 0.2, price + 0.2 * u); box(i, i + 2, hi(hiOf(i, i + 2)), lo(loOf(i, i + 2)), "Morning star", GREEN); walk(3, 2); caption = "a morning star: a big red candle, a small one below it, then a big green one closing well into the first: a turn up"; break; }
    case "evening_star": { const i = bars.length; candle(1.8); candle(-0.05, 0.4, 0.4, price + 0.3 * u); candle(-1.8, 0.2, 0.2, price - 0.2 * u); box(i, i + 2, hi(hiOf(i, i + 2)), lo(loOf(i, i + 2)), "Evening star", RED); walk(3, -2); caption = "an evening star: a big green candle, a small one above it, then a big red one closing well into the first: a turn down"; break; }
    case "three_white_soldiers": { const i = bars.length; for (let k = 0; k < 3; k++) candle(1.5, 0.15, 0.15, k ? price - 0.4 * u : price); box(i, i + 2, hi(hiOf(i, i + 2)), lo(loOf(i, i + 2)), "Three white soldiers", GREEN); caption = "three white soldiers: three strong green candles in a row, each closing higher"; break; }
    case "three_black_crows": { const i = bars.length; for (let k = 0; k < 3; k++) candle(-1.5, 0.15, 0.15, k ? price + 0.4 * u : price); box(i, i + 2, hi(hiOf(i, i + 2)), lo(loOf(i, i + 2)), "Three black crows", RED); caption = "three black crows: three strong red candles in a row, each closing lower"; break; }
    case "inside_bar": { const i = bars.length; candle(2.2, 0.4, 0.4); candle(-0.5, 0.2, 0.2, price - 0.6 * u); box(i, i + 1, hi(i), lo(i), "Inside bar", BLUE); walk(3, 2.5); caption = "an inside bar: a small candle inside the one before it, a pause, then a breakout"; break; }
    case "double_top": case "double_bottom": {
      const s = pattern === "double_top" ? 1 : -1, a = bars.length;
      walk(5, 4 * s); const t1 = s > 0 ? hiOf(a, last()) : loOf(a, last());
      const b = bars.length; walk(4, -2 * s); const n = s > 0 ? loOf(b, last()) : hiOf(b, last());
      const c = bars.length; walk(4, 2 * s); const t2 = s > 0 ? hiOf(c, last()) : loOf(c, last());
      walk(5, -3.5 * s);
      const top = s > 0 ? hi(t1) : lo(t1), neck = s > 0 ? lo(n) : hi(n);
      label(t1, top, s > 0 ? "Top 1" : "Bottom 1", s > 0 ? RED : GREEN, s < 0); label(t2, s > 0 ? hi(t2) : lo(t2), s > 0 ? "Top 2" : "Bottom 2", s > 0 ? RED : GREEN, s < 0);
      level(t1, last(), neck, "Neckline", GREY);
      caption = s > 0 ? "a double top: two highs at about the same level, the second one fails, then price breaks below the neckline" : "a double bottom: two lows at about the same level, the second holds, then price breaks above the neckline";
      break;
    }
    case "head_and_shoulders": case "inverse_head_and_shoulders": {
      const s = pattern === "head_and_shoulders" ? 1 : -1;
      const ext = (a: number) => (s > 0 ? hiOf(a, last()) : loOf(a, last())), dip = (a: number) => (s > 0 ? loOf(a, last()) : hiOf(a, last()));
      let a = bars.length; walk(4, 3 * s); const ls = ext(a);
      a = bars.length; walk(3, -2 * s); const n1 = dip(a);
      a = bars.length; walk(4, 3.5 * s); const head = ext(a);
      a = bars.length; walk(4, -3.5 * s); const n2 = dip(a);
      a = bars.length; walk(3, 2.5 * s); const rs = ext(a);
      walk(4, -3.5 * s);
      const at = (i: number) => (s > 0 ? hi(i) : lo(i)), neck = (s > 0 ? Math.min(lo(n1), lo(n2)) : Math.max(hi(n1), hi(n2)));
      label(ls, at(ls), "Left shoulder", GREY, s < 0); label(head, at(head), "Head", s > 0 ? RED : GREEN, s < 0); label(rs, at(rs), "Right shoulder", GREY, s < 0);
      level(ls, last(), neck, "Neckline", GREY);
      caption = s > 0 ? "a head and shoulders: a high, a higher high (the head), a lower high, then a break below the neckline" : "an inverse head and shoulders: a low, a lower low (the head), a higher low, then a break above the neckline";
      break;
    }
    case "ascending_triangle": case "descending_triangle": {
      const s = pattern === "ascending_triangle" ? 1 : -1, a = bars.length, R = P() + 3 * u * s;
      for (const back of [2.6, 1.7, 0.9]) { walk(3, (R - P()) / u); walk(3, -back * s); }
      walk(2, (R - P()) / u); const b = last(); walk(3, 2.5 * s);
      level(a, b, R, s > 0 ? "Resistance" : "Support", s > 0 ? RED : GREEN, false);
      label(b + 2, s > 0 ? hi(b + 2) : lo(b + 2), "Breakout", s > 0 ? GREEN : RED, s < 0);
      caption = s > 0 ? "an ascending triangle: a flat top with higher and higher lows pressing into it, then a breakout up" : "a descending triangle: a flat floor with lower and lower highs pressing into it, then a breakdown";
      break;
    }
    case "bull_flag": case "bear_flag": {
      const s = pattern === "bull_flag" ? 1 : -1, a = bars.length;
      for (let k = 0; k < 4; k++) candle(1.4 * s, 0.15, 0.15);
      const f = bars.length; walk(6, -1.4 * s, 0.5); const g = last();
      walk(3, 3 * s, 1.2);
      label(a + 1, s > 0 ? hi(a + 1) : lo(a + 1), "Pole", s > 0 ? GREEN : RED, s < 0);
      box(f, g, hi(hiOf(f, g)), lo(loOf(f, g)), "Flag", BLUE);
      label(g + 2, s > 0 ? hi(g + 2) : lo(g + 2), "Breakout", s > 0 ? GREEN : RED, s < 0);
      caption = s > 0 ? "a bull flag: a strong rise (the pole), a small drift down (the flag), then a breakout up" : "a bear flag: a strong fall (the pole), a small drift up (the flag), then a breakdown";
      break;
    }
    case "liquidity_sweep": case "bearish_liquidity_sweep": {
      const s = pattern === "liquidity_sweep" ? 1 : -1, a = bars.length, L = P() - 2 * u * s;
      walk(3, (L - P()) / u); const e1 = last(); walk(3, 1.6 * s); walk(3, (L - P()) / u + 0.05 * s); const e2 = last();
      walk(2, 1.1 * s);
      const sw = bars.length;
      // (the sweep: a wick through the equal lows / highs, closing back inside)
      const o = P(), c = o + (s > 0 ? 0.8 : -0.8) * u;
      bars.push({ open: o, close: c, high: s > 0 ? Math.max(o, c) + 0.2 * u : L + 1 * u, low: s > 0 ? L - 1 * u : Math.min(o, c) - 0.2 * u }); price = c;
      walk(5, 3.5 * s);
      level(a, sw, L, s > 0 ? "Equal lows: sell-side liquidity" : "Equal highs: buy-side liquidity", ORANGE);
      label(sw, s > 0 ? lo(sw) : hi(sw), "Sweep", s > 0 ? GREEN : RED, s > 0);
      void e1; void e2;
      caption = s > 0 ? "a liquidity sweep: equal lows hold the stops below them, a wick dips through and closes back above, then price rallies" : "a liquidity sweep: equal highs hold the stops above them, a wick spikes through and closes back below, then price drops";
      break;
    }
    case "bullish_fvg": case "bearish_fvg": {
      const s = pattern === "bullish_fvg" ? 1 : -1, i = bars.length;
      candle(0.8 * s, 0.2, 0.2); candle(3 * s, 0.1, 0.1); candle(0.7 * s, 0.2, 0.2, price + 0.2 * s * u);
      const top = s > 0 ? lo(i + 2) : lo(i), bottom = s > 0 ? hi(i) : hi(i + 2);
      walk(2, 1 * s); walk(3, -((s > 0 ? P() - (top + bottom) / 2 : (top + bottom) / 2 - P()) / u) * 1, 0.6); walk(4, 3 * s);
      box(i, last(), top, bottom, s > 0 ? "Bullish FVG" : "Bearish FVG", s > 0 ? BLUE : ORANGE);
      caption = s > 0 ? "a bullish fair value gap: a strong candle leaves a gap between the first candle's high and the third candle's low; price later comes back into it, then carries on up" : "a bearish fair value gap: a strong candle leaves a gap between the first candle's low and the third candle's high; price later comes back into it, then carries on down";
      break;
    }
    case "bullish_order_block": case "bearish_order_block": {
      const s = pattern === "bullish_order_block" ? 1 : -1, a = bars.length;
      walk(3, 2 * s); const sh = s > 0 ? hiOf(a, last()) : loOf(a, last());
      walk(3, -2 * s);
      const ob = bars.length; candle(-0.9 * s, 0.2, 0.3);
      for (let k = 0; k < 3; k++) candle(1.6 * s, 0.1, 0.1);
      walk(3, -1.6 * s, 0.6); walk(4, 3 * s);
      box(ob, last(), hi(ob), lo(ob), s > 0 ? "Bullish order block" : "Bearish order block", s > 0 ? GREEN : RED);
      level(sh, ob + 3, s > 0 ? hi(sh) : lo(sh), "BOS", s > 0 ? GREEN : RED, false);
      caption = s > 0 ? "a bullish order block: the last red candle before a strong move up that breaks structure; price later returns to it and bounces" : "a bearish order block: the last green candle before a strong move down that breaks structure; price later returns to it and drops";
      break;
    }
    case "bullish_bos": case "bearish_bos": case "bullish_choch": case "bearish_choch": {
      const bull = pattern.startsWith("bullish"), choch = pattern.endsWith("choch"), s = bull ? 1 : -1, d = choch ? -s : s;
      const a = bars.length; walk(4, 3 * d); const p1 = d > 0 ? hiOf(a, last()) : loOf(a, last());
      const b = bars.length; walk(3, -1.6 * d); const p2 = d > 0 ? loOf(b, last()) : hiOf(b, last());
      const c = bars.length; walk(4, 2.8 * d); const p3 = d > 0 ? hiOf(c, last()) : loOf(c, last());
      const e = bars.length; walk(3, -1.6 * d); const p4 = d > 0 ? loOf(e, last()) : hiOf(e, last());
      // the swing broken: in the trend's way (BOS), or the last swing against it (CHoCH)
      const brk = choch ? p4 : p3, at = s > 0 ? hi(brk) : lo(brk);
      walk(4, ((at - P()) / u) + 1.4 * s);
      label(p1, d > 0 ? hi(p1) : lo(p1), d > 0 ? "HH" : "LL", GREY, d < 0); label(p2, d > 0 ? lo(p2) : hi(p2), d > 0 ? "HL" : "LH", GREY, d > 0);
      label(p3, d > 0 ? hi(p3) : lo(p3), d > 0 ? "HH" : "LL", GREY, d < 0); label(p4, d > 0 ? lo(p4) : hi(p4), d > 0 ? "HL" : "LH", GREY, d > 0);
      level(brk, last(), at, choch ? "CHoCH" : "BOS", s > 0 ? GREEN : RED, choch);
      caption = choch ? `a change of character (CHoCH): a ${bull ? "down" : "up"}trend's ${bull ? "lower highs" : "higher lows"}, then price breaks its last ${bull ? "lower high" : "higher low"}: the trend may be turning ${bull ? "up" : "down"}`
        : `a break of structure (BOS): ${bull ? "higher highs and higher lows" : "lower lows and lower highs"}, and price breaks the last ${bull ? "high" : "low"}: the ${bull ? "up" : "down"}trend continues`;
      break;
    }
    case "range": case "breakout": {
      const a = bars.length, mid = P(), R = mid + 2 * u, S = mid - 2 * u;
      for (let k = 0; k < 3; k++) { walk(3, (R - P()) / u - 0.1); walk(3, (S - P()) / u + 0.1); }
      const b = last();
      if (pattern === "breakout") { walk(4, (R - P()) / u + 3); label(b + 3, hi(b + 3), "Breakout", GREEN); }
      box(a, b, R + 0.3 * u, S - 0.3 * u, "Range", BLUE);
      caption = pattern === "breakout" ? "a breakout: price bounces between support and resistance, then closes out above the range" : "a range: price bounces between a ceiling (resistance) and a floor (support)";
      break;
    }
    case "v_reversal": { const a = bars.length; walk(6, -5); const v = loOf(a, last()); walk(6, 5); label(v, lo(v), "V", GREEN, true); caption = "a V reversal: a sharp fall, then an equally sharp recovery"; break; }
    case "support": case "resistance": {
      const s = pattern === "support" ? 1 : -1, a = bars.length, L = P() - 2 * u * s;
      for (let k = 0; k < 3; k++) { walk(3, (L - P()) / u); walk(3, 2 * s); }
      level(a, last(), L, s > 0 ? "Support" : "Resistance", s > 0 ? GREEN : RED, false);
      caption = s > 0 ? "support: a level where buyers step in, price falls to it and bounces again and again" : "resistance: a level where sellers step in, price rises to it and turns down again and again";
      break;
    }
  }

  // what it shows, in words
  const lead = spec.candles?.length ? `${spec.candles.length} candles as asked` : `${leadN} candles${trend !== "sideways" ? ` in an ${trend}trend` : " moving sideways"}${spec.bigger && spec.bigger !== "equal" ? `, the ${spec.bigger} ones bigger` : ""}`;
  return { bars, marks, caption: caption ? `${lead}, then ${caption}` : lead };
}
