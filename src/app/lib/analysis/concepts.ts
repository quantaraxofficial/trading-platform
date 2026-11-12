// Every concept the voice assistant can mark (lib/voice/marks): the smart money (SMC) / ICT ones
// and classic price action, worked out from the chart's OHLC bars. Pure functions; a mark's
// `from` / `to` are bar indices. The first five live in ./smc (order blocks, FVG, IFVG,
// support / resistance, BOS / CHoCH); the rest are here. The rules:
//
// SMC / ICT
//   POI               points of interest: the unmitigated zones price is most likely to react
//                     from: live order blocks, open FVGs and supply / demand zones, ranked by
//                     confluence (overlapping another zone of the same side), being on the right
//                     side of the dealing range (demand in discount, supply in premium), the trend
//                     (the last BOS / CHoCH) and nearness to price. The best two each side
//   Liquidity         resting stops: equal highs / lows (two swing points within 0.1 ATR) and the
//                     latest swing high / low, while price hasn't traded through them. Above price
//                     buy-side liquidity (BSL), below it sell-side (SSL)
//   Liquidity sweep   a candle that trades through a swing high (low) but closes back below
//                     (above) it: the stops were taken and price rejected (a stop hunt)
//   Premium/discount  the dealing range (the latest swing high and swing low): above its 50%
//                     (equilibrium) is premium, below it discount; the OTE (optimal trade entry) is
//                     the 62–79% retracement of the leg
//   Breaker block     an order block price closed through: it flips (a broken bullish OB becomes
//                     resistance). Over once price closes back through it
//   BPR               balanced price range: where a bullish and a bearish FVG (formed within 20
//                     bars of each other) overlap
//   Displacement      a strong candle: body at least 2 ATR and 70% of its range
//   Kill zones        ICT's session windows (New York time): Asia 20:00–00:00, London 02:00–05:00,
//                     New York 07:00–10:00, London close 10:00–12:00, over the last three days
//                     (intraday charts)
//   Key levels        the previous day's and week's high and low (PDH / PDL, PWH / PWL), and
//                     today's open (days roll at 17:00 New York, as forex and gold do)
// Price action
//   Swing points      each swing high labelled HH or LH against the one before, each low HL or LL
//   Trend lines       through the latest two rising swing lows (up trend line) or falling swing
//                     highs (down trend line) that no close has broken since
//   Supply / demand   the base (1–3 small candles, body ≤ 0.6 ATR) right before a strong move
//                     (body ≥ 1.5 ATR): demand below a rally, supply above a drop. Live until a
//                     close through its far edge
//   Candle patterns   on the latest 60 bars: engulfing, hammer / shooting star (pin bars), doji,
//                     inside bar, morning / evening star
//   Chart patterns    double tops / bottoms (two swing points within 0.3 ATR with a swing between
//                     them: its level is the neckline) and head and shoulders (three swing highs,
//                     the middle one highest, the shoulders within 0.5 ATR), with their necklines;
//                     "confirmed" once a close breaks the neckline
//   Ranges            consolidation: at least 12 bars inside 2.5 ATR of high-to-low

import {
  atr, swings, swingSize, fairValueGaps, inverseFairValueGaps, marketStructure, orderBlocks, allOrderBlocks, supportResistance,
  type Bar, type Side, type Zone,
} from "./smc";

export type MarkKind =
  | "order_blocks" | "fvg" | "ifvg" | "support_resistance" | "structure"
  | "poi" | "liquidity" | "sweeps" | "premium_discount" | "breakers" | "bpr" | "displacement" | "killzones" | "key_levels"
  | "swing_points" | "trendlines" | "supply_demand" | "candle_patterns" | "chart_patterns" | "ranges";

export const ALL_MARK_KINDS: MarkKind[] = [
  "order_blocks", "fvg", "ifvg", "support_resistance", "structure",
  "poi", "liquidity", "sweeps", "premium_discount", "breakers", "bpr", "displacement", "killzones", "key_levels",
  "swing_points", "trendlines", "supply_demand", "candle_patterns", "chart_patterns", "ranges",
];

export function analyse(kind: MarkKind, bars: Bar[], from: number): Zone[] {
  switch (kind) {
    case "order_blocks": return orderBlocks(bars, from);
    case "fvg": return fairValueGaps(bars, from);
    case "ifvg": return inverseFairValueGaps(bars, from);
    case "support_resistance": return supportResistance(bars, from);
    case "structure": return marketStructure(bars, from);
    case "poi": return pointsOfInterest(bars, from);
    case "liquidity": return liquidity(bars, from);
    case "sweeps": return liquiditySweeps(bars, from);
    case "premium_discount": return premiumDiscount(bars, from);
    case "breakers": return breakerBlocks(bars, from);
    case "bpr": return balancedPriceRanges(bars, from);
    case "displacement": return displacement(bars, from);
    case "killzones": return killZones(bars, from);
    case "key_levels": return keyLevels(bars, from);
    case "swing_points": return swingPoints(bars, from);
    case "trendlines": return trendLines(bars, from);
    case "supply_demand": return supplyDemand(bars, from);
    case "candle_patterns": return candlePatterns(bars, from);
    case "chart_patterns": return chartPatterns(bars, from);
    case "ranges": return ranges(bars, from);
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const unitOf = (bars: Bar[], from: number) => mean(atr(bars).slice(from)) || (bars[bars.length - 1].high - bars[bars.length - 1].low) || 1;
const body = (b: Bar) => Math.abs(b.close - b.open);
const label = (kind: string, side: Side, at: number, price: number, text: string): Zone =>
  ({ kind, side, from: at, to: at, top: price, bottom: price, label: text, shape: "label" });
const line = (kind: string, side: Side, from: number, to: number, p1: number, p2: number, text: string, dashed = false): Zone =>
  ({ kind, side, from, to, top: p1, bottom: p2, label: text, shape: "line", dashed });

// ---- POI ------------------------------------------------------------------------------------
export function pointsOfInterest(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const price = bars[last].close;
  const unit = unitOf(bars, from);
  const cands = [
    ...orderBlocks(bars, from, { perSide: 6 }).map(z => ({ z, what: "OB" })),
    ...fairValueGaps(bars, from, { max: 12 }).map(z => ({ z, what: "FVG" })),
    ...supplyDemand(bars, from).map(z => ({ z, what: z.side === "bull" ? "demand" : "supply" })),
  ];
  const range = dealingRange(bars, from);
  const eq = range ? (range.top + range.bottom) / 2 : price;
  const ms = marketStructure(bars, from);
  const trend = ms.length ? ms[ms.length - 1].side : null;
  const scored = cands
    // (a buy zone below price, a sell zone above it: the ones price is coming back to)
    .filter(({ z }) => (z.side === "bull" ? z.top <= price + unit * 0.2 : z.bottom >= price - unit * 0.2))
    .map(c => {
      const overlaps = cands.filter(o => o !== c && o.z.side === c.z.side && o.z.bottom < c.z.top && o.z.top > c.z.bottom);
      const mid = (c.z.top + c.z.bottom) / 2;
      let score = overlaps.length ? 2 : 0;
      if (c.z.side === "bull" ? mid < eq : mid > eq) score += 1;
      if (trend === c.z.side) score += 1;
      score -= Math.min(2, Math.abs(mid - price) / (unit * 10));
      const with_ = Array.from(new Set(overlaps.map(o => o.what)));
      return { ...c, score, why: [c.what, ...with_.filter(w => w !== c.what)].join(" + ") };
    })
    .sort((a, b) => b.score - a.score);
  const out: Zone[] = [];
  for (const side of ["bull", "bear"] as Side[]) {
    const picked: typeof scored = [];
    for (const c of scored.filter(s => s.z.side === side)) {
      // (not two picks covering the same prices)
      if (picked.some(p => p.z.bottom < c.z.top && p.z.top > c.z.bottom)) continue;
      picked.push(c);
      if (picked.length === 2) break;
    }
    picked.forEach(p => out.push({ ...p.z, kind: "poi", label: `${side === "bull" ? "Buy" : "Sell"} POI · ${p.why}` }));
  }
  return out;
}

// ---- liquidity, sweeps ------------------------------------------------------------------------
export function liquidity(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const unit = unitOf(bars, from);
  const k = swingSize(last - from);
  const { highs, lows } = swings(bars, k, from, last);
  const out: Zone[] = [];
  const untaken = (i: number, side: "high" | "low", level: number) => {
    for (let j = i + 1; j <= last; j++) if (side === "high" ? bars[j].high > level : bars[j].low < level) return false;
    return true;
  };
  for (const side of ["high", "low"] as const) {
    const pts = side === "high" ? highs : lows;
    const px = (i: number) => (side === "high" ? bars[i].high : bars[i].low);
    const found: Zone[] = [];
    // equal highs / lows: two swing points within 0.1 ATR, both still untaken
    for (let b = pts.length - 1; b > 0 && found.length < 3; b--) {
      for (let a = b - 1; a >= 0; a--) {
        if (Math.abs(px(pts[a]) - px(pts[b])) > unit * 0.1) continue;
        const level = side === "high" ? Math.max(px(pts[a]), px(pts[b])) : Math.min(px(pts[a]), px(pts[b]));
        if (!untaken(pts[b], side, level)) break;
        if (found.some(f => Math.abs(f.top - level) < unit * 0.1)) break;
        found.push(line("liq", side === "high" ? "bear" : "bull", pts[a], last, level, level, side === "high" ? "EQH · BSL" : "EQL · SSL", true));
        break;
      }
    }
    // the latest swing point still untaken
    for (let b = pts.length - 1; b >= 0; b--) {
      const level = px(pts[b]);
      if (!untaken(pts[b], side, level)) continue;
      if (!found.some(f => Math.abs(f.top - level) < unit * 0.1)) found.push(line("liq", side === "high" ? "bear" : "bull", pts[b], last, level, level, side === "high" ? "BSL" : "SSL", true));
      break;
    }
    out.push(...found);
  }
  return out;
}

export function liquiditySweeps(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const unit = unitOf(bars, from);
  const k = swingSize(last - from);
  const { highs, lows } = swings(bars, k, Math.max(0, from - 50), last);
  const out: Zone[] = [];
  for (const [pts, side] of [[highs, "high"], [lows, "low"]] as const) {
    for (const i of pts) {
      const level = side === "high" ? bars[i].high : bars[i].low;
      // the first candle through it: a sweep when it closes back inside
      for (let j = i + k; j <= last; j++) {
        const through = side === "high" ? bars[j].high > level : bars[j].low < level;
        if (!through) continue;
        const back = side === "high" ? bars[j].close < level : bars[j].close > level;
        if (back && j >= from) {
          const s: Side = side === "high" ? "bear" : "bull";
          out.push(line("sweep", s, i, j, level, level, "", true));
          out.push(label("sweep", s, j, side === "high" ? bars[j].high + unit * 0.9 : bars[j].low - unit * 0.15, side === "high" ? "BSL sweep" : "SSL sweep"));
        }
        break;
      }
    }
  }
  // the latest ones (a line and its label each)
  return out.sort((a, b) => a.to - b.to).slice(-12);
}

// ---- premium / discount, OTE --------------------------------------------------------------------
function dealingRange(bars: Bar[], from: number): { top: number; bottom: number; hi: number; lo: number } | null {
  const last = bars.length - 1;
  const k = swingSize(last - from);
  const { highs, lows } = swings(bars, k, from, last);
  if (!highs.length || !lows.length) return null;
  let hi = highs[highs.length - 1], lo = lows[lows.length - 1];
  // (price beyond the last swing: the range runs to the extreme since)
  for (let j = Math.min(hi, lo); j <= last; j++) {
    if (bars[j].high > bars[hi].high) hi = j;
    if (bars[j].low < bars[lo].low) lo = j;
  }
  const top = bars[hi].high, bottom = bars[lo].low;
  return top > bottom ? { top, bottom, hi, lo } : null;
}

export function premiumDiscount(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const r = dealingRange(bars, from);
  if (!r) return [];
  const eq = (r.top + r.bottom) / 2, h = r.top - r.bottom, start = Math.min(r.hi, r.lo);
  const up = r.lo < r.hi;   // the leg: low then high is an up leg (buy the retracement)
  const ote = up ? [r.top - 0.62 * h, r.top - 0.79 * h] : [r.bottom + 0.79 * h, r.bottom + 0.62 * h];
  return [
    { kind: "pd", side: "bear", from: start, to: last, top: r.top, bottom: eq, label: "Premium" },
    { kind: "pd", side: "bull", from: start, to: last, top: eq, bottom: r.bottom, label: "Discount" },
    line("eq", "bull", start, last, eq, eq, "Equilibrium 50%", true),
    { kind: "ote", side: up ? "bull" : "bear", from: Math.max(r.hi, r.lo), to: last, top: Math.max(...ote), bottom: Math.min(...ote), label: "OTE 62–79%" },
  ];
}

// ---- breakers, BPR, displacement ----------------------------------------------------------------
export function breakerBlocks(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const out: Zone[] = [];
  for (const b of allOrderBlocks(bars, from)) {
    // the close through its far edge breaks it…
    let broke = -1;
    for (let j = b.from + 1; j <= last; j++) if (b.side === "bull" ? bars[j].close < b.bottom : bars[j].close > b.top) { broke = j; break; }
    if (broke < 0) continue;
    // …and it works the other way until a close back through it
    const side: Side = b.side === "bull" ? "bear" : "bull";
    let over = false;
    for (let j = broke + 1; j <= last && !over; j++) if (side === "bear" ? bars[j].close > b.top : bars[j].close < b.bottom) over = true;
    if (!over) out.push({ ...b, kind: "breaker", side, label: side === "bull" ? "Bullish breaker" : "Bearish breaker" });
  }
  return [...out.filter(z => z.side === "bull").slice(-3), ...out.filter(z => z.side === "bear").slice(-3)];
}

export function balancedPriceRanges(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 10) return [];
  const unit = unitOf(bars, from);
  const gaps: { side: Side; at: number; top: number; bottom: number }[] = [];
  for (let i = Math.max(from, 1); i < last; i++) {
    const a = bars[i - 1], c = bars[i + 1];
    if (c.low > a.high && c.low - a.high >= unit * 0.1) gaps.push({ side: "bull", at: i - 1, top: c.low, bottom: a.high });
    else if (c.high < a.low && a.low - c.high >= unit * 0.1) gaps.push({ side: "bear", at: i - 1, top: a.low, bottom: c.high });
  }
  const out: Zone[] = [];
  for (let x = 0; x < gaps.length; x++) for (let y = x + 1; y < gaps.length && gaps[y].at - gaps[x].at <= 20; y++) {
    const g = gaps[x], h = gaps[y];
    if (g.side === h.side) continue;
    const top = Math.min(g.top, h.top), bottom = Math.max(g.bottom, h.bottom);
    if (top - bottom < unit * 0.05) continue;
    out.push({ kind: "bpr", side: h.side, from: g.at, to: last, top, bottom, label: "BPR" });
  }
  return out.slice(-4);
}

export function displacement(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  const a = atr(bars);
  const out: Zone[] = [];
  for (let i = Math.max(from, 15); i <= last; i++) {
    const b = bars[i], range = b.high - b.low;
    if (body(b) >= 2 * a[i - 1] && range > 0 && body(b) / range >= 0.7) {
      out.push({ kind: "disp", side: b.close > b.open ? "bull" : "bear", from: i, to: i, top: b.high, bottom: b.low, label: "Displacement", extend: false });
    }
  }
  return out.slice(-10);
}

// ---- time: kill zones, key levels ---------------------------------------------------------------
const nyFmt = typeof Intl !== "undefined" ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
function ny(t: number): { day: string; min: number; tradingDay: string } {
  const parts = Object.fromEntries((nyFmt!.formatToParts(new Date(t * 1000))).map(p => [p.type, p.value]));
  const min = Number(parts.hour) * 60 + Number(parts.minute);
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  // (a trading day starts at 17:00 New York)
  const tradingDay = min >= 17 * 60 ? new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day + 1)).toISOString().slice(0, 10) : day;
  return { day, min, tradingDay };
}
const spacing = (bars: Bar[]) => { const n = bars.length; return n > 2 ? (bars[n - 1].time - bars[n - 21 > 0 ? n - 21 : 0].time) / Math.min(20, n - 1) : 0; };

export function killZones(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (!nyFmt || last < 10 || spacing(bars) > 3600 + 1) return [];
  const SESSIONS = [
    { name: "Asia", start: 20 * 60, end: 24 * 60, side: "bull" as Side },
    { name: "London", start: 2 * 60, end: 5 * 60, side: "bull" as Side },
    { name: "New York", start: 7 * 60, end: 10 * 60, side: "bear" as Side },
    { name: "London close", start: 10 * 60, end: 12 * 60, side: "bear" as Side },
  ];
  const out: Zone[] = [];
  let cur: { s: typeof SESSIONS[number]; day: string; first: number; lastI: number; hi: number; lo: number } | null = null;
  const flush = () => { if (cur) out.push({ kind: "kz", side: cur.s.side, from: cur.first, to: cur.lastI, top: cur.hi, bottom: cur.lo, label: cur.s.name, extend: false }); cur = null; };
  for (let i = Math.max(0, from - 200); i <= last; i++) {
    const t = ny(bars[i].time);
    const s = SESSIONS.find(x => t.min >= x.start && t.min < x.end);
    if (!s) { flush(); continue; }
    if (cur && (cur.s !== s || cur.day !== t.tradingDay)) flush();
    if (!cur) cur = { s, day: t.tradingDay, first: i, lastI: i, hi: bars[i].high, lo: bars[i].low };
    else { cur.lastI = i; cur.hi = Math.max(cur.hi, bars[i].high); cur.lo = Math.min(cur.lo, bars[i].low); }
  }
  flush();
  // the last three trading days' sessions
  const days = Array.from(new Set(out.map(z => ny(bars[z.from].time).tradingDay))).slice(-3);
  return out.filter(z => days.includes(ny(bars[z.from].time).tradingDay));
}

export function keyLevels(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (!nyFmt || last < 5) return [];
  const daily = spacing(bars) >= 86400 - 1;
  // each bar's trading day and week (a daily bar is its own day)
  const dayOf = (i: number) => (daily ? new Date(bars[i].time * 1000).toISOString().slice(0, 10) : ny(bars[i].time).tradingDay);
  const weekOf = (d: string) => { const t = Date.parse(d + "T00:00:00Z") / 86400000; return Math.floor((t + 3) / 7); };   // (weeks from Monday)
  const groups = (key: (i: number) => string | number) => {
    const m = new Map<string | number, { first: number; hi: number; lo: number; open: number }>();
    for (let i = Math.max(0, last - 3000); i <= last; i++) {
      const g = key(i), b = bars[i], cur = m.get(g);
      if (!cur) m.set(g, { first: i, hi: b.high, lo: b.low, open: b.open }); else { cur.hi = Math.max(cur.hi, b.high); cur.lo = Math.min(cur.lo, b.low); }
    }
    return Array.from(m.values());
  };
  const out: Zone[] = [];
  const days = groups(dayOf), weeks = groups(i => weekOf(dayOf(i)));
  const today = days[days.length - 1], prevDay = days[days.length - 2];
  const prevWeek = weeks[weeks.length - 2];
  if (prevDay) {
    out.push(line("key", "bear", prevDay.first, last, prevDay.hi, prevDay.hi, "PDH"));
    out.push(line("key", "bull", prevDay.first, last, prevDay.lo, prevDay.lo, "PDL"));
  }
  if (prevWeek) {
    out.push(line("key", "bear", prevWeek.first, last, prevWeek.hi, prevWeek.hi, "PWH", true));
    out.push(line("key", "bull", prevWeek.first, last, prevWeek.lo, prevWeek.lo, "PWL", true));
  }
  if (today && !daily) out.push(line("key", "bull", today.first, last, today.open, today.open, "Daily open", true));
  return out;
}

// ---- swing points, trend lines ------------------------------------------------------------------
export function swingPoints(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 15) return [];
  const unit = unitOf(bars, from);
  const k = swingSize(last - from);
  const { highs, lows } = swings(bars, k, Math.max(0, from - 30), last);
  const out: Zone[] = [];
  highs.forEach((i, n) => {
    if (n === 0 || i < from) return;
    const hh = bars[i].high > bars[highs[n - 1]].high;
    out.push(label("swing", hh ? "bull" : "bear", i, bars[i].high + unit * 0.9, hh ? "HH" : "LH"));
  });
  lows.forEach((i, n) => {
    if (n === 0 || i < from) return;
    const hl = bars[i].low > bars[lows[n - 1]].low;
    out.push(label("swing", hl ? "bull" : "bear", i, bars[i].low - unit * 0.15, hl ? "HL" : "LL"));
  });
  return out.sort((a, b) => a.from - b.from).slice(-24);
}

export function trendLines(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const unit = unitOf(bars, from);
  const k = swingSize(last - from);
  const { highs, lows } = swings(bars, k, from, last);
  const out: Zone[] = [];
  const find = (pts: number[], up: boolean) => {
    const px = (i: number) => (up ? bars[i].low : bars[i].high);
    for (let b = pts.length - 1; b > 0; b--) for (let a = b - 1; a >= 0; a--) {
      const i = pts[a], j = pts[b];
      if (up ? px(j) <= px(i) : px(j) >= px(i)) continue;
      const slope = (px(j) - px(i)) / (j - i);
      // unbroken: no close beyond the line (a little slack) from the first point on
      let ok = true;
      for (let x = i; x <= last && ok; x++) {
        const at = px(i) + slope * (x - i);
        if (up ? bars[x].close < at - unit * 0.2 : bars[x].close > at + unit * 0.2) ok = false;
      }
      if (ok) return line("trend", up ? "bull" : "bear", i, last, px(i), px(i) + slope * (last - i), up ? "Up trend line" : "Down trend line");
    }
    return null;
  };
  const upL = find(lows, true), dnL = find(highs, false);
  if (upL) out.push(upL);
  if (dnL) out.push(dnL);
  return out;
}

// ---- supply / demand ----------------------------------------------------------------------------
export function supplyDemand(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const a = atr(bars);
  const zones: (Zone & { move: number })[] = [];
  for (let i = Math.max(from, 16); i <= last; i++) {
    const b = bars[i];
    if (body(b) < 1.5 * a[i - 1]) continue;
    // the base: up to 3 small candles right before the move
    let s = i - 1;
    while (s >= i - 3 && s > 0 && body(bars[s]) <= 0.6 * a[s]) s--;
    if (s === i - 1) continue;
    const base = bars.slice(s + 1, i);
    const up = b.close > b.open;
    const top = up ? Math.max(...base.map(x => Math.max(x.open, x.close))) : Math.max(...base.map(x => x.high));
    const bottom = up ? Math.min(...base.map(x => x.low)) : Math.min(...base.map(x => Math.min(x.open, x.close)));
    zones.push({ kind: "sd", side: up ? "bull" : "bear", from: s + 1, to: last, top, bottom, label: up ? "Demand" : "Supply", move: i });
  }
  // still in play: no close through its far edge since the move
  const live: Zone[] = zones.filter(z => {
    for (let j = z.move + 1; j <= last; j++) if (z.side === "bull" ? bars[j].close < z.bottom : bars[j].close > z.top) return false;
    return true;
  }).map(({ move, ...z }) => { void move; return z; });
  return [...live.filter(z => z.side === "bull").slice(-3), ...live.filter(z => z.side === "bear").slice(-3)];
}

// ---- candle patterns ----------------------------------------------------------------------------
export function candlePatterns(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last < 3) return [];
  const unit = unitOf(bars, Math.max(0, from));
  const out: Zone[] = [];
  const at = (i: number, side: Side, text: string) =>
    out.push(label("candle", side, i, side === "bull" ? bars[i].low - unit * 0.15 : bars[i].high + unit * 0.9, text));
  for (let i = Math.max(2, last - 59, from); i <= last; i++) {
    const b = bars[i], p = bars[i - 1], q = bars[i - 2];
    const range = b.high - b.low || 1e-9, bd = body(b);
    const upper = b.high - Math.max(b.open, b.close), lower = Math.min(b.open, b.close) - b.low;
    if (b.close > b.open && p.close < p.open && b.close >= p.open && b.open <= p.close && bd > body(p)) at(i, "bull", "Bullish engulfing");
    else if (b.close < b.open && p.close > p.open && b.open >= p.close && b.close <= p.open && bd > body(p)) at(i, "bear", "Bearish engulfing");
    else if (q.close < q.open && body(q) > unit * 0.6 && body(p) < body(q) * 0.4 && b.close > b.open && b.close > (q.open + q.close) / 2) at(i, "bull", "Morning star");
    else if (q.close > q.open && body(q) > unit * 0.6 && body(p) < body(q) * 0.4 && b.close < b.open && b.close < (q.open + q.close) / 2) at(i, "bear", "Evening star");
    else if (lower >= 2 * bd && lower >= 0.6 * range && upper <= 0.2 * range && range > unit * 0.5) at(i, "bull", "Hammer");
    else if (upper >= 2 * bd && upper >= 0.6 * range && lower <= 0.2 * range && range > unit * 0.5) at(i, "bear", "Shooting star");
    else if (bd <= 0.1 * range && range > unit * 0.3) at(i, b.close >= p.close ? "bull" : "bear", "Doji");
    else if (b.high < p.high && b.low > p.low) at(i, b.close >= b.open ? "bull" : "bear", "Inside bar");
  }
  return out.slice(-14);
}

// ---- chart patterns -----------------------------------------------------------------------------
export function chartPatterns(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 30) return [];
  const unit = unitOf(bars, from);
  const k = swingSize(last - from);
  const { highs, lows } = swings(bars, k, from, last);
  const out: Zone[] = [];
  // the candle that closed through a neckline (-1: none yet)
  const breakAt = (i: number, level: (x: number) => number, down: boolean) => { for (let j = i + 1; j <= last; j++) if (down ? bars[j].close < level(j) : bars[j].close > level(j)) return j; return -1; };
  // double tops / bottoms
  for (const [pts, top] of [[highs, true], [lows, false]] as const) {
    const px = (i: number) => (top ? bars[i].high : bars[i].low);
    const others = top ? lows : highs;
    let found = 0;
    for (let b = pts.length - 1; b > 0 && found < 2; b--) {
      const a = b - 1, i = pts[a], j = pts[b];
      if (j - i < 5 || Math.abs(px(i) - px(j)) > unit * 0.3) continue;
      const mids = others.filter(m => m > i && m < j);
      if (!mids.length) continue;
      const neck = top ? Math.min(...mids.map(m => bars[m].low)) : Math.max(...mids.map(m => bars[m].high));
      // (the tops must stand clear of the neckline)
      if (Math.abs(px(i) - neck) < unit) continue;
      const brk = breakAt(j, () => neck, top);
      const name = top ? "Double top" : "Double bottom";
      out.push(line("pattern", top ? "bear" : "bull", i, j, px(i), px(j), brk >= 0 ? `${name} · confirmed` : `${name} · neckline not broken yet`));
      // (a finished pattern's neckline stops at the break)
      out.push(line("neck", top ? "bear" : "bull", i, brk >= 0 ? brk : last, neck, neck, "Neckline", true));
      found++;
    }
  }
  // head and shoulders (and the inverse)
  for (const [pts, top] of [[highs, true], [lows, false]] as const) {
    const px = (i: number) => (top ? bars[i].high : bars[i].low);
    const others = top ? lows : highs;
    for (let c = pts.length - 1; c >= 2; c--) {
      const l = pts[c - 2], h = pts[c - 1], r = pts[c];
      const headBeyond = top ? px(h) > px(l) && px(h) > px(r) : px(h) < px(l) && px(h) < px(r);
      if (!headBeyond || Math.abs(px(l) - px(r)) > unit * 0.5 || Math.abs(px(h) - px(l)) < unit * 0.8) continue;
      const n1 = others.filter(m => m > l && m < h), n2 = others.filter(m => m > h && m < r);
      if (!n1.length || !n2.length) continue;
      const pick = (ms: number[]) => ms.reduce((x, y) => ((top ? bars[y].low < bars[x].low : bars[y].high > bars[x].high) ? y : x));
      const a = pick(n1), b = pick(n2);
      const pa = top ? bars[a].low : bars[a].high, pb = top ? bars[b].low : bars[b].high;
      const slope = (pb - pa) / (b - a);
      const neckAt = (x: number) => pa + slope * (x - a);
      const brk = breakAt(r, neckAt, top);
      const name = top ? "Head and shoulders" : "Inverse head and shoulders";
      const end = brk >= 0 ? brk : last;
      out.push(label("pattern", top ? "bear" : "bull", h, top ? px(h) + unit * 0.9 : px(h) - unit * 0.15, brk >= 0 ? `${name} · confirmed` : name));
      out.push(line("neck", top ? "bear" : "bull", a, end, pa, neckAt(end), "Neckline", true));
      break;
    }
  }
  return out;
}

// ---- ranges -------------------------------------------------------------------------------------
export function ranges(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const unit = unitOf(bars, from);
  const out: Zone[] = [];
  let i = from;
  while (i < last) {
    let hi = bars[i].high, lo = bars[i].low, j = i;
    while (j + 1 <= last && Math.max(hi, bars[j + 1].high) - Math.min(lo, bars[j + 1].low) <= unit * 2.5) {
      j++; hi = Math.max(hi, bars[j].high); lo = Math.min(lo, bars[j].low);
    }
    if (j - i + 1 >= 12) {
      out.push({ kind: "range", side: bars[j].close >= (hi + lo) / 2 ? "bull" : "bear", from: i, to: j, top: hi, bottom: lo, label: `Range · ${j - i + 1} bars`, extend: false });
      i = j + 1;
    } else i++;
  }
  return out.slice(-4);
}
