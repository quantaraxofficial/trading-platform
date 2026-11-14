// Malaysian support and resistance (MSNR), worked out from the chart's OHLC bars for the voice
// assistant's marks (lib/voice/marks). Pure functions; a mark's `from` / `to` are bar indices.
//
// MSNR draws its levels from candle BODIES, on the line chart (the closes), never from wicks:
//   A level      resistance: a peak of the line chart, where the closes turn down (a bullish close,
//                then the next candle opens and closes lower). Shaped like the letter A. Its price is
//                that close (the next open, when they differ, makes it a gap level)
//   V level      support: a trough of the line chart, where the closes turn up. Shaped like a V
//   Gap level    a candle's close and the next candle's open apart (an open-close gap, at A / V
//                turns and anywhere notable): the zone between them is the level
//   Fresh        no wick has come back to the level since it formed: the strongest. A wick touching
//                it (with no close beyond) makes it unfresh; each touch weakens it. A candle body
//                CLOSING beyond it breaks it (a wick through it doesn't)
//   SBR / RBS    a broken level flips (role reversal): broken support becomes resistance (SBR),
//                broken resistance becomes support (RBS); valid until price closes back through it.
//                "Retested" once price came back to it from the other side and held
//   QM (QML)     Quasimodo: high, low, higher high, then a lower low that breaks the low (bearish),
//                or low, high, lower low, then a higher high (bullish). The level is the left
//                shoulder (the first high / low): price returning there is the entry. Over once
//                price closes beyond the head
//   Compression  CP: price drifting into a fresh level in small, overlapping candles (small bodies,
//                each pushing a little further): it builds liquidity in front of the level, and the
//                reaction there is usually sharp
// Levels on higher timeframes outrank the ones below them (the "storyline": trade a lower-timeframe
// fresh level in the direction of the higher timeframe's).

import { atr, swingSize, type Bar, type Side, type Zone } from "./smc";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const bodyTop = (b: Bar) => Math.max(b.open, b.close);
const bodyBottom = (b: Bar) => Math.min(b.open, b.close);

export type MsnrLevel = {
  type: "A" | "V"; at: number;            // the turning candle
  top: number; bottom: number;            // the level (a gap level: the gap between close and next open)
  gap: boolean;
  touches: number; firstTouch: number | null;
  broken: number | null;                  // the candle whose body closed beyond it
};

function unitOf(bars: Bar[], from: number): number {
  const last = bars.length - 1;
  return mean(atr(bars).slice(from)) || (bars[last].high - bars[last].low) || 1;
}

// Peaks (A) and troughs (V) of the line chart: a close the k closes either side don't pass
function lineTurns(bars: Bar[], from: number, k: number): { a: number[]; v: number[] } {
  const a: number[] = [], v: number[] = [];
  const last = bars.length - 1;
  for (let i = Math.max(from, k); i <= last - 1; i++) {
    const c = bars[i].close;
    let peak = true, trough = true;
    for (let j = i - k; j <= Math.min(last, i + k); j++) {
      if (j === i) continue;
      const cj = bars[j].close;
      if (cj > c || (cj === c && j < i)) peak = false;
      if (cj < c || (cj === c && j < i)) trough = false;
      if (!peak && !trough) break;
    }
    // (confirmed: at least one close after it turned away)
    if (peak && bars[i + 1].close < c) a.push(i);
    if (trough && bars[i + 1].close > c) v.push(i);
  }
  return { a, v };
}

// A level's life after it formed: wick touches (unfresh) until a body closes beyond it (broken)
function follow(bars: Bar[], lvl: Omit<MsnrLevel, "touches" | "firstTouch" | "broken">): MsnrLevel {
  let touches = 0, firstTouch: number | null = null, broken: number | null = null;
  for (let j = lvl.at + 2; j < bars.length; j++) {
    const b = bars[j];
    if (lvl.type === "A") {
      if (b.close > lvl.top) { broken = j; break; }
      if (b.high >= lvl.bottom) { touches++; firstTouch ??= j; }
    } else {
      if (b.close < lvl.bottom) { broken = j; break; }
      if (b.low <= lvl.top) { touches++; firstTouch ??= j; }
    }
  }
  return { ...lvl, touches, firstTouch, broken };
}

// Every A / V level (and the gap levels at those turns) with its state
export function msnrLevels(bars: Bar[], from: number): MsnrLevel[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const unit = unitOf(bars, from);
  const k = Math.max(2, swingSize(last - from) - 1);
  const { a, v } = lineTurns(bars, from, k);
  const gapTol = unit * 0.05;
  const make = (type: "A" | "V", i: number): MsnrLevel => {
    const c = bars[i].close, o = bars[i + 1].open;
    const gap = Math.abs(o - c) > gapTol;
    return follow(bars, { type, at: i, top: Math.max(c, gap ? o : c), bottom: Math.min(c, gap ? o : c), gap });
  };
  return [...a.map(i => make("A", i)), ...v.map(i => make("V", i))];
}

// (short, as MSNR traders write them on the chart: "A · fresh", "V · unfresh ×3")
const state = (l: MsnrLevel) => (l.broken !== null ? "broken" : l.touches === 0 ? "fresh" : `unfresh ×${l.touches}`);

// ---- A / V levels: the unbroken ones nearest price, fresh solid, unfresh dashed
export function msnrAV(bars: Bar[], from: number, perSide = 5): Zone[] {
  const last = bars.length - 1;
  const price = bars[last].close;
  const live = msnrLevels(bars, from).filter(l => l.broken === null);
  // Levels of a kind within 0.2 ATR of each other are one level: the freshest of them is drawn
  // ("+2 nearby"), so a cluster doesn't stack its lines and labels
  const tol = unitOf(bars, from) * 0.2;
  const mid = (l: MsnrLevel) => (l.top + l.bottom) / 2;
  const nearby = new Map<MsnrLevel, number>();
  const pick = (type: "A" | "V") => {
    const kept: MsnrLevel[] = [];
    const byFreshness = live.filter(l => l.type === type).sort((x, y) => x.touches - y.touches || Math.abs(mid(x) - price) - Math.abs(mid(y) - price));
    for (const l of byFreshness) {
      const near = kept.find(k => Math.abs(mid(k) - mid(l)) <= tol);
      if (near) nearby.set(near, (nearby.get(near) || 0) + 1); else kept.push(l);
    }
    return kept.sort((x, y) => Math.abs(mid(x) - price) - Math.abs(mid(y) - price)).slice(0, perSide);
  };
  return [...pick("A"), ...pick("V")].map<Zone>(l => {
    const side: Side = l.type === "A" ? "bear" : "bull";
    const more = nearby.get(l);
    const name = `${l.type}${l.gap ? " gap" : ""} · ${state(l)}${more ? ` (+${more})` : ""}`;
    return l.gap
      ? { kind: l.touches ? "msnr_old" : "msnr", side, from: l.at, to: last, top: l.top, bottom: l.bottom, label: name, touches: l.touches }
      : { kind: l.touches ? "msnr_old" : "msnr", side, from: l.at, to: last, top: l.top, bottom: l.bottom, label: name, shape: "line", dashed: l.touches > 0, touches: l.touches };
  });
}

// ---- gap levels: notable open-close gaps (a candle's close and the next one's open apart), live
// until a body closes beyond the gap's far side
export function msnrGaps(bars: Bar[], from: number, perSide = 4): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const unit = unitOf(bars, from);
  const price = bars[last].close;
  const out: { z: Zone; d: number }[] = [];
  for (let i = Math.max(from, 0); i < last; i++) {
    const c = bars[i].close, o = bars[i + 1].open;
    if (Math.abs(o - c) < unit * 0.15) continue;
    const top = Math.max(c, o), bottom = Math.min(c, o);
    // above price it's resistance (A side), below support (V side); its life from the next candle on
    const above = bottom > price;
    let touches = 0, broken = false;
    for (let j = i + 2; j <= last; j++) {
      const b = bars[j];
      if (above ? b.close > top : b.close < bottom) { broken = true; break; }
      if (above ? b.high >= bottom : b.low <= top) touches++;
    }
    if (broken || (price >= bottom && price <= top)) continue;
    const side: Side = above ? "bear" : "bull";
    out.push({ d: Math.abs((top + bottom) / 2 - price), z: { kind: touches ? "msnr_old" : "msnr_gap", side, from: i, to: last, top, bottom, touches,
      label: `Gap · ${touches ? `unfresh ×${touches}` : "fresh"}`, extend: true } });
  }
  const pick = (side: Side) => out.filter(x => x.z.side === side).sort((x, y) => x.d - y.d).slice(0, perSide).map(x => x.z);
  return [...pick("bull"), ...pick("bear")];
}

// ---- SBR / RBS: broken levels that flipped and haven't been closed back through
export function msnrFlips(bars: Bar[], from: number, perSide = 3): Zone[] {
  const last = bars.length - 1;
  const price = bars[last].close;
  const out: { z: Zone; d: number }[] = [];
  for (const l of msnrLevels(bars, from)) {
    if (l.broken === null || l.broken >= last) continue;
    // A broken (closed above): resistance → support (RBS); V broken: support → resistance (SBR)
    const rbs = l.type === "A";
    let retests = 0, failed = false;
    for (let j = l.broken + 1; j <= last; j++) {
      const b = bars[j];
      if (rbs ? b.close < l.bottom : b.close > l.top) { failed = true; break; }
      if (rbs ? b.low <= l.top : b.high >= l.bottom) retests++;
    }
    if (failed) continue;
    const side: Side = rbs ? "bull" : "bear";
    const text = `${rbs ? "RBS" : "SBR"} · ${retests ? `retested ×${retests}` : "fresh"}`;
    out.push({ d: Math.abs((l.top + l.bottom) / 2 - price), z: l.gap
      ? { kind: "msnr_flip", side, from: l.at, to: last, top: l.top, bottom: l.bottom, label: text }
      : { kind: "msnr_flip", side, from: l.at, to: last, top: l.top, bottom: l.bottom, label: text, shape: "line", dashed: retests > 0 } });
  }
  const pick = (side: Side) => out.filter(x => x.z.side === side).sort((x, y) => x.d - y.d).slice(0, perSide).map(x => x.z);
  return [...pick("bull"), ...pick("bear")];
}

// ---- QM (Quasimodo): on the line chart's turns, H L HH LL (bearish) or L H LL HH (bullish); the
// level is the left shoulder, live until a close beyond the head
export function msnrQuasimodo(bars: Bar[], from: number, perSide = 2): Zone[] {
  const last = bars.length - 1;
  if (last - from < 30) return [];
  const k = swingSize(last - from);
  const { a, v } = lineTurns(bars, from, k);
  const turns = [...a.map(i => ({ i, hi: true })), ...v.map(i => ({ i, hi: false }))].sort((x, y) => x.i - y.i);
  // alternate: of two highs (lows) in a row keep the higher (lower)
  const alt: { i: number; hi: boolean }[] = [];
  for (const t of turns) {
    const prev = alt[alt.length - 1];
    if (prev && prev.hi === t.hi) {
      if (t.hi ? bars[t.i].close > bars[prev.i].close : bars[t.i].close < bars[prev.i].close) alt[alt.length - 1] = t;
    } else alt.push(t);
  }
  const c = (i: number) => bars[i].close;
  const found: { side: Side; line: Zone; head: Zone }[] = [];
  for (let n = 0; n + 3 < alt.length; n++) {
    const [p1, p2, p3, p4] = alt.slice(n, n + 4);
    const bearish = p1.hi && c(p3.i) > c(p1.i) && c(p4.i) < c(p2.i);    // H, L, HH, LL
    const bullish = !p1.hi && c(p3.i) < c(p1.i) && c(p4.i) > c(p2.i);   // L, H, LL, HH
    if (!bearish && !bullish) continue;
    const level = c(p1.i), head = c(p3.i);
    let touches = 0, over = false;
    for (let j = p4.i + 1; j <= last; j++) {
      const b = bars[j];
      if (bearish ? b.close > head : b.close < head) { over = true; break; }
      if (bearish ? b.high >= level : b.low <= level) touches++;
    }
    if (over) continue;
    const side: Side = bearish ? "bear" : "bull";
    found.push({
      side,
      line: { kind: "msnr_qm", side, from: p1.i, to: last, top: level, bottom: level, shape: "line", dashed: touches > 0,
        label: `QML ${bearish ? "sell" : "buy"} · ${touches ? `touched ×${touches}` : "fresh"}` },
      head: { kind: "msnr_qm", side, from: p3.i, to: p3.i, top: head, bottom: head, shape: "label", label: bearish ? "QM HH" : "QM LL" },
    });
  }
  // the latest few each side, each with its head
  const pick = (side: Side) => found.filter(f => f.side === side).slice(-perSide).flatMap(f => [f.line, f.head]);
  return [...pick("bull"), ...pick("bear")];
}

// ---- compression (CP): small, overlapping candles drifting into a fresh level
export function msnrCompression(bars: Bar[], from: number, max = 4): Zone[] {
  const last = bars.length - 1;
  if (last - from < 30) return [];
  const a = atr(bars);
  const levels = msnrLevels(bars, from);
  const out: Zone[] = [];
  const MIN = 6;
  let i = Math.max(from + 1, last - 400);
  while (i <= last - MIN + 1) {
    // grow a run of small, overlapping candles
    let j = i;
    while (j + 1 <= last) {
      const b = bars[j + 1], p = bars[j];
      const small = Math.abs(b.close - b.open) <= a[j + 1] * 0.6;
      const overlap = b.low <= p.high && b.high >= p.low;
      if (!small || !overlap) break;
      j++;
    }
    const n = j - i + 1;
    if (n >= MIN) {
      const run = bars.slice(i, j + 1);
      const up = run[run.length - 1].close - run[0].open;
      const unit = a[j] || 1;
      const steps = run.slice(1).filter((b, x) => (up > 0 ? b.low >= run[x].low : b.high <= run[x].high)).length / (n - 1);
      if (Math.abs(up) >= unit * 1.0 && steps >= 0.6) {
        // into a fresh level ahead of it (resistance above for a drift up, support below for a drift down)
        const end = run[run.length - 1];
        const target = levels.filter(l => l.at < i && (l.firstTouch === null || l.firstTouch >= j))
          .filter(l => (up > 0 ? l.type === "A" && l.bottom >= bodyTop(end) - unit * 0.2 && l.bottom - end.high <= unit * 1.2
            : l.type === "V" && l.top <= bodyBottom(end) + unit * 0.2 && end.low - l.top <= unit * 1.2))
          .sort((x, y) => Math.abs(x.bottom - end.close) - Math.abs(y.bottom - end.close))[0];
        if (target) {
          const hi = Math.max(...run.map(b => b.high)), lo = Math.min(...run.map(b => b.low));
          out.push({ kind: "msnr_cp", side: up > 0 ? "bear" : "bull", from: i, to: j, top: hi, bottom: lo, extend: false,
            label: `CP → ${target.type}` });
        }
      }
      i = j + 1;
    } else i++;
  }
  return out.slice(-max);
}
