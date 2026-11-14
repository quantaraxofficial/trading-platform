// Trade setups (the voice assistant's "find setups": lib/voice/marks): the SMC, ICT, price-action and
// MSNR setups traders take, found in the chart's bars as complete trades (entry, stop, target), each
// followed on the bars after it (did it fill, then reach the target or the stop first?). Pure
// functions; bar indices. The rules (u = the average true range, R = entry to stop):
//
// ICT
//   Silver Bullet    an FVG forming in a Silver Bullet hour (New York 03–04, 10–11, 14–15): enter on
//                    the retrace to its near edge, stop beyond the candle that opened it, 2R
//   Unicorn          a breaker block (an order block price closed through) overlapping an FVG of the
//                    same move: enter at the overlap, stop beyond the breaker, 2R
//   Judas swing      in the London (02–05) or New York (07–10) open, a false move through the Asian
//                    range (20–00) that closes back inside within 3 candles: enter at that close,
//                    stop beyond the false move, target the range's other side (else 2R)
//   OTE              after a break of structure, the 62–79% retracement of the leg: enter at 70.5%,
//                    stop beyond the leg's start, target its end
//   Turtle soup      a candle through the previous day's high / low, or a 20-bar extreme made at
//                    least 4 bars before, that closes back inside: enter at the close, stop beyond its
//                    wick, 2R; each level faded once
//   2022 model       a sweep of a swing low (high), then a break of structure the other way within
//                    10 candles with an FVG in it: enter at the FVG, stop beyond the sweep, 2R
// SMC
//   CHoCH + OB       a change of character, then back to the order block that made it: enter at its
//                    edge, stop beyond it, 2R
//   BOS + OB         a break of structure with the trend, then the pullback to its order block
//   Sweep + CHoCH    a liquidity sweep of a swing, then a CHoCH the other way within 15 candles: enter
//                    on the retest of the broken level, stop beyond the sweep, 2R
// Price action
//   Pin bar at S/R   a pin bar (wick ≥ 2× body, two thirds of the range) rejecting a swing level:
//                    enter at its close, stop beyond the wick, 2R
//   Engulfing at S/R an engulfing candle off a swing level: enter at its close, stop beyond the pair, 2R
//   Break & retest   a close through a swing level, then a retest that holds within 20 candles:
//                    enter at the retest's close, stop beyond its wick, 2R
//   Inside bar       an inside bar after a move: a buy (sell) stop past the mother bar's high (low)
//                    in the move's direction, stop at its other end, 2R; 5 candles to trigger
//   False breakout   a wick through a swing level that closes back: enter at the close, stop beyond,
//                    2R; each level faded once
//   Double top / bottom  two swing points within 0.3u, then a close through the neckline: enter at that
//                    close, stop beyond the tops, target the pattern's height (at least 1R, else 2R)
// MSNR
//   Fresh rejection  the first touch of a fresh A (V) level, closing back: enter at the close, stop
//                    beyond the wick, target the next fresh level the other way (else 2R)
//   CP into level    compression into a fresh level: a limit at the level, stop 0.5u beyond it, 2R
//   SBR / RBS retest the first retest of a flipped level that holds: enter at the close, stop beyond
//                    the retest's wick, 2R
//   QM               after the lower low (higher high), a limit at the QM level (the left shoulder),
//                    stop beyond the head, 2R

import { atr, swings, swingSize, marketStructure, allOrderBlocks, type Bar, type Side, type Zone } from "./smc";
import { msnrLevels, msnrCompressionRuns, msnrQmPatterns, type MsnrLevel } from "./msnr";

export type SetupId =
  | "ict_silver_bullet" | "ict_unicorn" | "ict_judas" | "ict_ote" | "ict_turtle_soup" | "ict_2022"
  | "smc_choch_ob" | "smc_bos_ob" | "smc_sweep_choch"
  | "pa_pin_bar" | "pa_engulfing" | "pa_break_retest" | "pa_inside_bar" | "pa_false_break" | "pa_double"
  | "msnr_rejection" | "msnr_cp" | "msnr_flip_retest" | "msnr_qm";

export const SETUP_NAMES: Record<SetupId, string> = {
  ict_silver_bullet: "Silver Bullet", ict_unicorn: "Unicorn", ict_judas: "Judas swing", ict_ote: "OTE", ict_turtle_soup: "Turtle soup",
  ict_2022: "ICT 2022 model", smc_choch_ob: "CHoCH + OB", smc_bos_ob: "BOS + OB pullback", smc_sweep_choch: "Sweep + CHoCH",
  pa_pin_bar: "Pin bar at S/R", pa_engulfing: "Engulfing at S/R", pa_break_retest: "Break & retest", pa_inside_bar: "Inside bar breakout",
  pa_false_break: "False breakout", pa_double: "Double top / bottom",
  msnr_rejection: "MSNR fresh rejection", msnr_cp: "MSNR CP into level", msnr_flip_retest: "MSNR SBR / RBS retest", msnr_qm: "MSNR QM",
};
export const SETUP_IDS = Object.keys(SETUP_NAMES) as SetupId[];
export const SETUP_FAMILIES: Record<string, SetupId[]> = {
  ict: ["ict_silver_bullet", "ict_unicorn", "ict_judas", "ict_ote", "ict_turtle_soup", "ict_2022"],
  smc: ["smc_choch_ob", "smc_bos_ob", "smc_sweep_choch"],
  price_action: ["pa_pin_bar", "pa_engulfing", "pa_break_retest", "pa_inside_bar", "pa_false_break", "pa_double"],
  msnr: ["msnr_rejection", "msnr_cp", "msnr_flip_retest", "msnr_qm"],
};

type Entry = "market" | "limit" | "stop";
type Trade = { id: SetupId; side: Side; signal: number; entry: number; stop: number; target: number; type: Entry; why: string; fillWithin?: number };
export type SetupResult = Trade & { outcome: "won" | "lost" | "open" | "waiting" | "missed"; filled: number | null; exit: number | null; r: number };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const body = (b: Bar) => Math.abs(b.close - b.open);
const top = (b: Bar) => Math.max(b.open, b.close), bot = (b: Bar) => Math.min(b.open, b.close);

type Ctx = {
  bars: Bar[]; from: number; last: number; u: number; k: number;
  highs: number[]; lows: number[];
  structure: Zone[]; obs: Zone[]; fvgs: { side: Side; at: number; top: number; bottom: number }[];
  levels: MsnrLevel[];
};

function context(bars: Bar[], from: number): Ctx {
  const last = bars.length - 1;
  const u = mean(atr(bars).slice(from)) || (bars[last].high - bars[last].low) || 1;
  const k = swingSize(last - from);
  const start = Math.max(0, from - 200);
  const { highs, lows } = swings(bars, k, start, last);
  const fvgs: Ctx["fvgs"] = [];
  for (let i = Math.max(start, 1); i < last; i++) {
    const a = bars[i - 1], c = bars[i + 1];
    if (c.low > a.high && c.low - a.high >= u * 0.1) fvgs.push({ side: "bull", at: i - 1, top: c.low, bottom: a.high });
    else if (c.high < a.low && a.low - c.high >= u * 0.1) fvgs.push({ side: "bear", at: i - 1, top: a.low, bottom: c.high });
  }
  return { bars, from, last, u, k, highs, lows, structure: marketStructure(bars, Math.max(0, from - 50), { max: 400 }),
    obs: allOrderBlocks(bars, Math.max(0, from - 100)), fvgs, levels: msnrLevels(bars, Math.max(0, from - 100)) };
}

// the 2R target (or a given one when it's at least 1.5R away)
function withTarget(t: Omit<Trade, "target">, preferred?: number): Trade | null {
  const risk = Math.abs(t.entry - t.stop);
  if (!(risk > 0)) return null;
  const dir = t.side === "bull" ? 1 : -1;
  const twoR = t.entry + dir * 2 * risk;
  // (a target from the chart: at least 1.5R away, and no further than 5R)
  const ok = preferred !== undefined && (preferred - t.entry) * dir >= 1.5 * risk && (preferred - t.entry) * dir <= 5 * risk;
  return { ...t, target: ok ? preferred! : twoR };
}

// the swing points confirmed by bar i (k bars after them)
const confirmed = (c: Ctx, list: number[], i: number) => list.filter(s => s + c.k <= i);

// New York time
const nyFmt = typeof Intl !== "undefined" ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit" }) : null;
function ny(t: number): { min: number; day: string } {
  const p = Object.fromEntries(nyFmt!.formatToParts(new Date(t * 1000)).map(x => [x.type, x.value]));
  return { min: Number(p.hour) * 60 + Number(p.minute), day: `${p.year}-${p.month}-${p.day}` };
}
const spacing = (bars: Bar[]) => { const n = bars.length; return n > 21 ? (bars[n - 1].time - bars[n - 21].time) / 20 : 0; };

// ---------------------------------------------------------------------------------------------- ICT
function silverBullet(c: Ctx): Trade[] {
  if (!nyFmt || spacing(c.bars) > 3600 + 1) return [];
  const HOURS = [[180, 240], [600, 660], [840, 900]];
  const out: Trade[] = [];
  for (const g of c.fvgs) {
    if (g.at < c.from) continue;
    const m = ny(c.bars[g.at + 1].time).min;
    if (!HOURS.some(([a, b]) => m >= a && m < b)) continue;
    const first = c.bars[g.at];
    const t = withTarget({ id: "ict_silver_bullet", side: g.side, signal: g.at + 2, type: "limit", fillWithin: 12,
      entry: g.side === "bull" ? g.top : g.bottom, stop: g.side === "bull" ? first.low - c.u * 0.05 : first.high + c.u * 0.05,
      why: "an FVG in the Silver Bullet hour" });
    if (t) out.push(t);
  }
  return out;
}

function unicorn(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (const ob of c.obs) {
    // broken: a close through its far edge (bull OB closed below: a bearish breaker)
    let brk = -1;
    for (let j = ob.from + 1; j <= c.last; j++) if (ob.side === "bull" ? c.bars[j].close < ob.bottom : c.bars[j].close > ob.top) { brk = j; break; }
    if (brk < 0) continue;
    const side: Side = ob.side === "bull" ? "bear" : "bull";
    const g = c.fvgs.find(f => f.side === side && f.at >= ob.from && f.at <= brk + 1 && f.top > ob.bottom && f.bottom < ob.top);
    if (!g) continue;
    const lo = Math.max(g.bottom, ob.bottom), hi = Math.min(g.top, ob.top);
    if (hi <= lo) continue;
    const t = withTarget({ id: "ict_unicorn", side, signal: Math.max(brk, g.at + 2), type: "limit", fillWithin: 30,
      entry: side === "bull" ? hi : lo, stop: side === "bull" ? ob.bottom - c.u * 0.05 : ob.top + c.u * 0.05, why: "a breaker block overlapping an FVG" });
    if (t) out.push(t);
  }
  return out;
}

function judas(c: Ctx): Trade[] {
  if (!nyFmt || spacing(c.bars) > 3600 + 1) return [];
  const out: Trade[] = [];
  // the Asian range of each night (New York 20:00–24:00), then the London and New York opens after it
  let asia: { hi: number; lo: number; day: string } | null = null;
  let building: { hi: number; lo: number; day: string } | null = null;
  const used = new Set<string>();
  for (let i = Math.max(1, c.from - 50); i <= c.last; i++) {
    const b = c.bars[i], t = ny(b.time);
    if (t.min >= 20 * 60) {
      if (!building || building.day !== t.day) building = { hi: b.high, lo: b.low, day: t.day };
      else { building.hi = Math.max(building.hi, b.high); building.lo = Math.min(building.lo, b.low); }
      continue;
    }
    if (building) { asia = building; building = null; }
    if (!asia || i < c.from) continue;
    const open = (t.min >= 120 && t.min < 300) || (t.min >= 420 && t.min < 600);
    if (!open) continue;
    for (const side of ["bear", "bull"] as Side[]) {
      const key = `${asia.day}-${side}`;
      if (used.has(key)) continue;
      // the false move through the range, closing back inside within 3 candles
      const through = side === "bear" ? b.high > asia.hi : b.low < asia.lo;
      if (!through) continue;
      for (let j = i; j <= Math.min(c.last, i + 3); j++) {
        const back = side === "bear" ? c.bars[j].close < asia.hi : c.bars[j].close > asia.lo;
        if (!back) continue;
        const extreme = side === "bear" ? Math.max(...c.bars.slice(i, j + 1).map(x => x.high)) : Math.min(...c.bars.slice(i, j + 1).map(x => x.low));
        const tr = withTarget({ id: "ict_judas", side, signal: j, type: "market", entry: c.bars[j].close,
          stop: side === "bear" ? extreme + c.u * 0.05 : extreme - c.u * 0.05, why: "a false move through the Asian range" }, side === "bear" ? asia.lo : asia.hi);
        if (tr) { out.push(tr); used.add(key); }
        break;
      }
    }
  }
  return out;
}

function ote(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (const s of c.structure) {
    if (s.kind !== "bos" || s.to < c.from) continue;
    const brk = s.to, sw = s.from;
    const bull = s.side === "bull";
    // the leg: from its start (the extreme between the swing and the break) to its end (the extreme of
    // the k bars after the break)
    const startSeg = c.bars.slice(sw, brk + 1);
    const origin = bull ? Math.min(...startSeg.map(b => b.low)) : Math.max(...startSeg.map(b => b.high));
    const endIdx = Math.min(c.last, brk + c.k);
    const endSeg = c.bars.slice(brk, endIdx + 1);
    const ext = bull ? Math.max(...endSeg.map(b => b.high)) : Math.min(...endSeg.map(b => b.low));
    const leg = Math.abs(ext - origin);
    if (leg < c.u * 1.5) continue;
    const entry = bull ? ext - 0.705 * leg : ext + 0.705 * leg;
    const t = withTarget({ id: "ict_ote", side: s.side, signal: endIdx, type: "limit", fillWithin: 40, entry,
      stop: bull ? origin - c.u * 0.05 : origin + c.u * 0.05, why: "the 62–79% retracement after a break of structure" }, ext);
    if (t) out.push(t);
  }
  return out;
}

// a wick through a level that closes back inside: turtle soup (previous day / 20-bar extremes) and the
// false breakout (swing levels)
function fades(c: Ctx, id: "ict_turtle_soup" | "pa_false_break"): Trade[] {
  const out: Trade[] = [];
  const daily = spacing(c.bars) >= 86400 - 1;
  const days = new Map<string, { hi: number; lo: number }>();
  let prevDay: { hi: number; lo: number } | null = null, curKey = "";
  const faded = new Set<string>();         // (each level is faded once)
  for (let i = Math.max(20, c.from - 50); i <= c.last; i++) {
    const b = c.bars[i];
    let levels: { p: number; side: Side; name: string }[] = [];
    if (id === "ict_turtle_soup") {
      if (nyFmt && !daily) {
        const t = ny(b.time);
        const key = t.min >= 17 * 60 ? `${t.day}+` : t.day;
        if (key !== curKey) { if (curKey) prevDay = days.get(curKey) || null; curKey = key; }
        const d = days.get(key);
        if (!d) days.set(key, { hi: b.high, lo: b.low }); else { d.hi = Math.max(d.hi, b.high); d.lo = Math.min(d.lo, b.low); }
        if (prevDay) levels.push({ p: prevDay.hi, side: "bear", name: "the previous day's high" }, { p: prevDay.lo, side: "bull", name: "the previous day's low" });
      }
      // the 20-bar extreme, when it was made at least 4 bars before (not the move that's running)
      let hiI = i - 20, loI = i - 20;
      for (let j = i - 20; j < i; j++) { if (c.bars[j].high > c.bars[hiI].high) hiI = j; if (c.bars[j].low < c.bars[loI].low) loI = j; }
      if (hiI <= i - 4) levels.push({ p: c.bars[hiI].high, side: "bear", name: "the 20-bar high" });
      if (loI <= i - 4) levels.push({ p: c.bars[loI].low, side: "bull", name: "the 20-bar low" });
    } else {
      levels = [...confirmed(c, c.highs, i).slice(-3).map(s => ({ p: c.bars[s].high, side: "bear" as Side, name: "a swing high" })),
        ...confirmed(c, c.lows, i).slice(-3).map(s => ({ p: c.bars[s].low, side: "bull" as Side, name: "a swing low" }))];
    }
    if (i < c.from) continue;
    for (const L of levels) {
      const key = `${L.side}${L.p.toFixed(5)}`;
      if (faded.has(key)) continue;
      const fade = L.side === "bear" ? b.high > L.p + c.u * 0.05 && b.close < L.p : b.low < L.p - c.u * 0.05 && b.close > L.p;
      if (!fade) continue;
      faded.add(key);
      const t = withTarget({ id, side: L.side, signal: i, type: "market", entry: b.close,
        stop: L.side === "bear" ? b.high + c.u * 0.05 : b.low - c.u * 0.05, why: `a wick through ${L.name} that closed back` });
      if (t) { out.push(t); break; }
    }
  }
  return out;
}

function ict2022(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (const s of c.structure) {
    if (s.to < c.from) continue;
    const brk = s.to, bull = s.side === "bull";
    // a sweep of a swing on the other side in the 10 candles before the break
    let sweep = -1, extreme = 0;
    for (let i = Math.max(1, brk - 10); i < brk; i++) {
      const sw = confirmed(c, bull ? c.lows : c.highs, i).slice(-1)[0];
      if (sw === undefined) continue;
      const lvl = bull ? c.bars[sw].low : c.bars[sw].high, b = c.bars[i];
      if (bull ? b.low < lvl && b.close > lvl - c.u * 0.5 : b.high > lvl && b.close < lvl + c.u * 0.5) {
        if (sweep < 0 || (bull ? b.low < extreme : b.high > extreme)) { sweep = i; extreme = bull ? b.low : b.high; }
      }
    }
    if (sweep < 0) continue;
    const g = c.fvgs.find(f => f.side === s.side && f.at >= sweep && f.at <= brk);
    if (!g) continue;
    const t = withTarget({ id: "ict_2022", side: s.side, signal: brk, type: "limit", fillWithin: 25, entry: bull ? g.top : g.bottom,
      stop: bull ? extreme - c.u * 0.05 : extreme + c.u * 0.05, why: "a sweep, then a break of structure with an FVG" });
    if (t) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- SMC
function structureOb(c: Ctx, kind: "choch" | "bos"): Trade[] {
  const out: Trade[] = [];
  for (const s of c.structure) {
    if (s.kind !== kind || s.to < c.from) continue;
    const ob = c.obs.filter(o => o.side === s.side && o.from < s.to && o.from >= s.to - 40).pop();
    if (!ob) continue;
    const bull = s.side === "bull";
    const t = withTarget({ id: kind === "choch" ? "smc_choch_ob" : "smc_bos_ob", side: s.side, signal: s.to, type: "limit", fillWithin: 40,
      entry: bull ? ob.top : ob.bottom, stop: bull ? ob.bottom - c.u * 0.05 : ob.top + c.u * 0.05,
      why: kind === "choch" ? "a change of character, back to its order block" : "a break of structure, the pullback to its order block" });
    if (t) out.push(t);
  }
  return out;
}

function sweepChoch(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (const s of c.structure) {
    if (s.kind !== "choch" || s.to < c.from) continue;
    const bull = s.side === "bull", brk = s.to;
    let sweep = -1, extreme = 0;
    for (let i = Math.max(1, brk - 15); i < brk; i++) {
      const sw = confirmed(c, bull ? c.lows : c.highs, i).slice(-1)[0];
      if (sw === undefined) continue;
      const lvl = bull ? c.bars[sw].low : c.bars[sw].high, b = c.bars[i];
      if (bull ? b.low < lvl && b.close > lvl : b.high > lvl && b.close < lvl) { sweep = i; extreme = bull ? b.low : b.high; }
    }
    if (sweep < 0) continue;
    const t = withTarget({ id: "smc_sweep_choch", side: s.side, signal: brk, type: "limit", fillWithin: 20, entry: s.top,
      stop: bull ? extreme - c.u * 0.05 : extreme + c.u * 0.05, why: "a liquidity sweep, then a change of character" });
    if (t) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------------------- price action
function nearLevel(c: Ctx, i: number, side: Side, price: number): boolean {
  const list = side === "bull" ? confirmed(c, c.lows, i).slice(-6).map(s => c.bars[s].low) : confirmed(c, c.highs, i).slice(-6).map(s => c.bars[s].high);
  return list.some(p => Math.abs(p - price) <= c.u * 0.3);
}

function pinBars(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (let i = Math.max(c.from, 10); i <= c.last; i++) {
    const b = c.bars[i], range = b.high - b.low;
    if (range < c.u * 0.6) continue;
    const lowerWick = bot(b) - b.low, upperWick = b.high - top(b);
    const bullPin = lowerWick >= 2 * body(b) && lowerWick >= range * 0.6 && nearLevel(c, i, "bull", b.low);
    const bearPin = upperWick >= 2 * body(b) && upperWick >= range * 0.6 && nearLevel(c, i, "bear", b.high);
    if (!bullPin && !bearPin) continue;
    const side: Side = bullPin ? "bull" : "bear";
    const t = withTarget({ id: "pa_pin_bar", side, signal: i, type: "market", entry: b.close,
      stop: side === "bull" ? b.low - c.u * 0.05 : b.high + c.u * 0.05, why: `a pin bar off ${side === "bull" ? "support" : "resistance"}` });
    if (t) out.push(t);
  }
  return out;
}

function engulfings(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (let i = Math.max(c.from, 10); i <= c.last; i++) {
    const b = c.bars[i], p = c.bars[i - 1];
    const bull = b.close > b.open && p.close < p.open && b.close >= p.open && b.open <= p.close && body(b) > body(p) && nearLevel(c, i, "bull", Math.min(b.low, p.low));
    const bear = b.close < b.open && p.close > p.open && b.close <= p.open && b.open >= p.close && body(b) > body(p) && nearLevel(c, i, "bear", Math.max(b.high, p.high));
    if (!bull && !bear) continue;
    const side: Side = bull ? "bull" : "bear";
    const t = withTarget({ id: "pa_engulfing", side, signal: i, type: "market", entry: b.close,
      stop: bull ? Math.min(b.low, p.low) - c.u * 0.05 : Math.max(b.high, p.high) + c.u * 0.05, why: `an engulfing candle off ${bull ? "support" : "resistance"}` });
    if (t) out.push(t);
  }
  return out;
}

function breakRetest(c: Ctx): Trade[] {
  const out: Trade[] = [];
  const used = new Set<number>();
  for (let i = Math.max(c.from, 10); i <= c.last; i++) {
    for (const side of ["bull", "bear"] as Side[]) {
      const sw = confirmed(c, side === "bull" ? c.highs : c.lows, i).slice(-1)[0];
      if (sw === undefined || used.has(sw)) continue;
      const lvl = side === "bull" ? c.bars[sw].high : c.bars[sw].low;
      const broke = side === "bull" ? c.bars[i].close > lvl && c.bars[i - 1].close <= lvl : c.bars[i].close < lvl && c.bars[i - 1].close >= lvl;
      if (!broke) continue;
      used.add(sw);
      for (let r = i + 1; r <= Math.min(c.last, i + 20); r++) {
        const b = c.bars[r];
        if (side === "bull" ? b.close < lvl - c.u * 0.1 : b.close > lvl + c.u * 0.1) break;   // back through: failed
        const retest = side === "bull" ? b.low <= lvl + c.u * 0.15 && b.close > lvl : b.high >= lvl - c.u * 0.15 && b.close < lvl;
        if (!retest) continue;
        const t = withTarget({ id: "pa_break_retest", side, signal: r, type: "market", entry: b.close,
          stop: side === "bull" ? Math.min(b.low, lvl) - c.u * 0.1 : Math.max(b.high, lvl) + c.u * 0.1, why: `a break of a swing ${side === "bull" ? "high" : "low"} and its retest` });
        if (t) out.push(t);
        break;
      }
    }
  }
  return out;
}

function insideBars(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (let i = Math.max(c.from, 12); i <= c.last; i++) {
    const m = c.bars[i - 1], b = c.bars[i];
    if (!(b.high < m.high && b.low > m.low) || m.high - m.low < c.u * 0.8) continue;
    const move = m.close - c.bars[i - 11].close;
    if (Math.abs(move) < c.u * 1.5) continue;
    const side: Side = move > 0 ? "bull" : "bear";
    const t = withTarget({ id: "pa_inside_bar", side, signal: i, type: "stop", fillWithin: 5,
      entry: side === "bull" ? m.high + c.u * 0.02 : m.low - c.u * 0.02, stop: side === "bull" ? m.low - c.u * 0.02 : m.high + c.u * 0.02,
      why: `an inside bar after a move ${side === "bull" ? "up" : "down"}` });
    if (t) out.push(t);
  }
  return out;
}

function doubles(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (const side of ["bear", "bull"] as Side[]) {
    const pts = side === "bear" ? c.highs : c.lows;
    for (let n = 1; n < pts.length; n++) {
      const a = pts[n - 1], b = pts[n];
      const pa = side === "bear" ? c.bars[a].high : c.bars[a].low, pb = side === "bear" ? c.bars[b].high : c.bars[b].low;
      if (Math.abs(pa - pb) > c.u * 0.3 || b - a < 5) continue;
      const between = c.bars.slice(a, b + 1);
      const neck = side === "bear" ? Math.min(...between.map(x => x.low)) : Math.max(...between.map(x => x.high));
      for (let i = b + 1; i <= Math.min(c.last, b + 30); i++) {
        const x = c.bars[i];
        if (side === "bear" ? x.high > Math.max(pa, pb) : x.low < Math.min(pa, pb)) break;   // a new extreme: no pattern
        if (side === "bear" ? x.close < neck : x.close > neck) {
          if (i < c.from) break;
          const height = Math.abs((side === "bear" ? Math.max(pa, pb) : Math.min(pa, pb)) - neck);
          const t = withTarget({ id: "pa_double", side, signal: i, type: "market", entry: x.close,
            stop: side === "bear" ? Math.max(pa, pb) + c.u * 0.05 : Math.min(pa, pb) - c.u * 0.05,
            why: side === "bear" ? "a double top's neckline broken" : "a double bottom's neckline broken" }, side === "bear" ? neck - height : neck + height);
          if (t) out.push(t);
          break;
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- MSNR
function msnrRejection(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (const l of c.levels) {
    const j = l.firstTouch;
    if (j === null || j < c.from) continue;
    const b = c.bars[j];
    const short = l.type === "A";
    // touched with a wick and closed back (no body beyond: that's what a touch is), with the wick showing
    if (short ? b.high - top(b) < body(b) * 0.5 : bot(b) - b.low < body(b) * 0.5) continue;
    // the next fresh level the other way (fresh at the time)
    const opp = c.levels.filter(o => o.type !== l.type && o.at < j && (o.firstTouch === null || o.firstTouch > j) && (o.broken === null || o.broken > j))
      .filter(o => (short ? o.top < b.close : o.bottom > b.close))
      .sort((x, y) => Math.abs(x.top - b.close) - Math.abs(y.top - b.close))[0];
    const t = withTarget({ id: "msnr_rejection", side: short ? "bear" : "bull", signal: j, type: "market", entry: b.close,
      stop: short ? b.high + c.u * 0.05 : b.low - c.u * 0.05, why: `the first touch of a fresh ${l.type} level, rejected` },
      opp ? (short ? opp.top : opp.bottom) : undefined);
    if (t) out.push(t);
  }
  return out;
}

function msnrCp(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (const r of msnrCompressionRuns(c.bars, Math.max(0, c.from - 50))) {
    if (r.to < c.from) continue;
    const short = r.level.type === "A";
    const lvl = short ? r.level.bottom : r.level.top;
    const t = withTarget({ id: "msnr_cp", side: short ? "bear" : "bull", signal: r.to, type: "limit", fillWithin: 15, entry: lvl,
      stop: short ? r.level.top + c.u * 0.5 : r.level.bottom - c.u * 0.5, why: `compression into a fresh ${r.level.type} level` },
      short ? r.lo : r.hi);
    if (t) out.push(t);
  }
  return out;
}

function msnrFlipRetest(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (const l of c.levels) {
    if (l.broken === null || l.broken < c.from - 30) continue;
    const rbs = l.type === "A";      // resistance broken upward: now support
    for (let r = l.broken + 1; r <= Math.min(c.last, l.broken + 40); r++) {
      const b = c.bars[r];
      if (rbs ? b.close < l.bottom : b.close > l.top) break;
      const retest = rbs ? b.low <= l.top : b.high >= l.bottom;
      if (!retest) continue;
      if (r < c.from) break;
      const t = withTarget({ id: "msnr_flip_retest", side: rbs ? "bull" : "bear", signal: r, type: "market", entry: b.close,
        stop: rbs ? Math.min(b.low, l.bottom) - c.u * 0.1 : Math.max(b.high, l.top) + c.u * 0.1, why: `the first retest of ${rbs ? "an RBS" : "an SBR"} level` });
      if (t) out.push(t);
      break;
    }
  }
  return out;
}

function msnrQm(c: Ctx): Trade[] {
  const out: Trade[] = [];
  for (const q of msnrQmPatterns(c.bars, Math.max(0, c.from - 100))) {
    if (q.p4 < c.from - 40) continue;
    const short = q.side === "bear";
    const t = withTarget({ id: "msnr_qm", side: q.side, signal: q.p4, type: "limit", fillWithin: 60, entry: q.level,
      stop: short ? q.head + c.u * 0.1 : q.head - c.u * 0.1, why: "back to the QM level (the left shoulder)" });
    if (t && t.signal >= c.from) out.push(t);
  }
  return out;
}

const DETECT: Record<SetupId, (c: Ctx) => Trade[]> = {
  ict_silver_bullet: silverBullet, ict_unicorn: unicorn, ict_judas: judas, ict_ote: ote, ict_turtle_soup: c => fades(c, "ict_turtle_soup"), ict_2022: ict2022,
  smc_choch_ob: c => structureOb(c, "choch"), smc_bos_ob: c => structureOb(c, "bos"), smc_sweep_choch: sweepChoch,
  pa_pin_bar: pinBars, pa_engulfing: engulfings, pa_break_retest: breakRetest, pa_inside_bar: insideBars, pa_false_break: c => fades(c, "pa_false_break"), pa_double: doubles,
  msnr_rejection: msnrRejection, msnr_cp: msnrCp, msnr_flip_retest: msnrFlipRetest, msnr_qm: msnrQm,
};

// How a trade went on the bars after its signal: filled (market at once; a limit when price comes
// back to it; a stop when price runs through it) within its window, then the target or the stop
// first (both in one candle: the stop, to be safe)
function follow(c: Ctx, t: Trade): SetupResult {
  const bull = t.side === "bull";
  const risk = Math.abs(t.entry - t.stop);
  let filled: number | null = t.type === "market" ? t.signal : null;
  if (filled === null) {
    const until = Math.min(c.last, t.signal + (t.fillWithin ?? 20));
    for (let j = t.signal + 1; j <= until; j++) {
      const b = c.bars[j];
      // (gone to the target first: the trade was missed)
      if (bull ? b.high >= t.target : b.low <= t.target) return { ...t, outcome: "missed", filled: null, exit: j, r: 0 };
      const hit = t.type === "limit" ? (bull ? b.low <= t.entry : b.high >= t.entry) : (bull ? b.high >= t.entry : b.low <= t.entry);
      if (hit) { filled = j; break; }
    }
    if (filled === null) return { ...t, outcome: until >= c.last && c.last < t.signal + (t.fillWithin ?? 20) ? "waiting" : "missed", filled: null, exit: null, r: 0 };
  }
  for (let j = filled + (t.type === "market" ? 1 : 0); j <= c.last; j++) {
    const b = c.bars[j];
    const stopHit = bull ? b.low <= t.stop : b.high >= t.stop;
    const targetHit = bull ? b.high >= t.target : b.low <= t.target;
    if (stopHit) return { ...t, outcome: "lost", filled, exit: j, r: -1 };
    if (targetHit) return { ...t, outcome: "won", filled, exit: j, r: Math.round((Math.abs(t.target - t.entry) / risk) * 10) / 10 };
  }
  return { ...t, outcome: "open", filled, exit: null, r: 0 };
}

// Every setup asked for (all, a family's or some ids) in the bars from `from` on, followed to now
export function findSetups(bars: Bar[], from: number, only?: SetupId[]): SetupResult[] {
  const last = bars.length - 1;
  if (last - from < 30) return [];
  const c = context(bars, from);
  const ids = only && only.length ? only : SETUP_IDS;
  const out: SetupResult[] = [];
  for (const id of ids) {
    const seen = new Set<string>();
    for (const t of DETECT[id](c)) {
      const risk = Math.abs(t.entry - t.stop);
      // (a stop too tight or too wide for the market isn't a real trade)
      if (t.signal < from || risk < c.u * 0.1 || risk > c.u * 5) continue;
      const key = `${t.signal}-${t.side}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(follow(c, t));
    }
  }
  return out.sort((a, b) => a.signal - b.signal);
}

const OUTCOME: Record<SetupResult["outcome"], string> = { won: "won", lost: "lost", open: "in trade", waiting: "waiting for entry", missed: "missed" };

// The chart marks: each trade as a long / short position (entry, stop, target) with its name, why and
// how it went. Setups on the same side within a candle of each other are one trade (confluence: its
// label names them all). The live ones (waiting, in trade) always, then the latest finished, `max` in all
export function setupMarks(bars: Bar[], from: number, only?: SetupId[], max = 6): { zones: Zone[]; results: SetupResult[] } {
  const all = findSetups(bars, from, only);
  const groups: { lead: SetupResult; names: string[] }[] = [];
  for (const r of all) {
    const g = groups.find(x => x.lead.side === r.side && Math.abs(x.lead.signal - r.signal) <= 1);
    if (g) { if (!g.names.includes(SETUP_NAMES[r.id])) g.names.push(SETUP_NAMES[r.id]); }
    else groups.push({ lead: r, names: [SETUP_NAMES[r.id]] });
  }
  const isLive = (r: SetupResult) => r.outcome === "waiting" || r.outcome === "open";
  // the live ones (the latest 3), then finished ones back through the chart, 12 candles apart at
  // least, so they don't stack on one another
  const shownGroups = groups.filter(g => isLive(g.lead)).slice(-3);
  const GAP = 12;
  for (const g of groups.filter(x => !isLive(x.lead)).reverse()) {
    if (shownGroups.length >= max) break;
    if (shownGroups.every(x => Math.abs(x.lead.signal - g.lead.signal) >= GAP)) shownGroups.push(g);
  }
  const shown = shownGroups.sort((a, b) => a.lead.signal - b.lead.signal);
  const last = bars.length - 1;
  const zones: Zone[] = [];
  for (const { lead: r, names } of shown) {
    const end = r.exit ?? Math.min(last + 10, r.signal + 25);
    const result = r.outcome === "won" ? `won +${r.r}R` : r.outcome === "lost" ? "lost −1R" : OUTCOME[r.outcome];
    const name = names.join(" + ");
    zones.push({ kind: "setup", side: r.side, from: r.filled ?? r.signal, to: Math.max(end, (r.filled ?? r.signal) + 3), top: r.entry, bottom: r.entry,
      shape: "position", entry: r.entry, stop: r.stop, target: r.target, label: `${name} · ${result}` });
    zones.push({ kind: "setup", side: r.side, from: r.signal, to: r.signal, top: r.stop, bottom: r.stop,
      shape: "label", label: `${name} ${r.side === "bull" ? "long" : "short"} · ${result}` });
  }
  return { zones, results: all };
}
