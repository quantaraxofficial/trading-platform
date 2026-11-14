// Price-action analysis on the chart's bars, for the voice assistant's "mark …" commands:
// support / resistance, fair value gaps (FVG), inverse fair value gaps (IFVG) and order blocks.
// Pure functions over OHLC bars; a zone's `from` / `to` are bar indices (the chart's logical
// bars). Only zones still in play at the last bar are returned: a filled gap or a broken
// block is history, not something to trade from.
//
// The rules (the common "smart money concepts" definitions):
//   Swing high / low  a bar whose high (low) is the highest (lowest) of the k bars either side
//   Support / resist. swing points clustered by price (within ~0.35 ATR); 2+ touches make a level;
//                     below the last close it's support, above it resistance
//   FVG               three candles where candle 1's high stays below candle 3's low (bullish) or
//                     candle 1's low above candle 3's high (bearish); the gap is the unfilled
//                     space between them. Filled once price trades through its far edge
//   IFVG              an FVG that a candle closed through: a bullish gap closed below turns into
//                     resistance (bearish IFVG), a bearish one closed above into support. Over
//                     once price closes back through it
//   Order block       when a close breaks the last swing high (a bullish break of structure),
//                     the last down candle before the move up is the bullish order block (its
//                     high..low); mirrored for bearish. Broken once a close goes through its far edge

export type Bar = { time: number; open: number; high: number; low: number; close: number };
export type Side = "bull" | "bear";
export type ZoneKind = "sr" | "fvg" | "ifvg" | "ob" | "bos" | "choch";
// A mark: a box (from..to, top..bottom), or a line (from top to bottom: its prices at each end), or a
// label at one bar. More kinds come from ./concepts (POI, liquidity, breakers…)
export type Zone = {
  kind: ZoneKind | string; side: Side; from: number; to: number; top: number; bottom: number; label: string; touches?: number;
  shape?: "box" | "line" | "label" | "position"; dashed?: boolean; extend?: boolean;
  entry?: number; stop?: number; target?: number;   // (a trade: lib/analysis/setups)
  color?: string;                                    // (its own colour, not its kind's)
};

// Average true range at each bar (Wilder's smoothing)
export function atr(bars: Bar[], n = 14): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    prev = i === 0 ? tr : i < n ? (prev * i + tr) / (i + 1) : (prev * (n - 1) + tr) / n;
    out.push(prev);
  }
  return out;
}

// Swing points: a bar is a swing high when no bar within k either side is higher (ties go to the
// first), and only once k bars after it exist (it's confirmed)
export function swings(bars: Bar[], k: number, from = 0, to = bars.length - 1): { highs: number[]; lows: number[] } {
  const highs: number[] = [], lows: number[] = [];
  for (let i = Math.max(from, k); i <= Math.min(to, bars.length - 1 - k); i++) {
    let hi = true, lo = true;
    for (let j = i - k; j <= i + k && (hi || lo); j++) {
      if (j === i) continue;
      if (j < i ? bars[j].high >= bars[i].high : bars[j].high > bars[i].high) hi = false;
      if (j < i ? bars[j].low <= bars[i].low : bars[j].low < bars[i].low) lo = false;
    }
    if (hi) highs.push(i);
    if (lo) lows.push(i);
  }
  return { highs, lows };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
// Swing size for a window of n bars: tighter on few bars, wider on many
export const swingSize = (n: number) => (n > 600 ? 6 : n > 300 ? 5 : n > 120 ? 4 : 3);

// ---- support / resistance ----------------------------------------------------------------------
export function supportResistance(bars: Bar[], from: number, opts: { perSide?: number } = {}): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const perSide = opts.perSide ?? 3;
  const a = atr(bars);
  const unit = mean(a.slice(from)) || (bars[last].high - bars[last].low) || 1;
  const k = swingSize(last - from);
  const { highs, lows } = swings(bars, k, from, last);
  const points = [...highs.map(i => ({ i, p: bars[i].high })), ...lows.map(i => ({ i, p: bars[i].low }))].sort((x, y) => x.p - y.p);
  // Neighbouring prices within the tolerance form one level
  const tol = unit * 0.35;
  const clusters: { i: number; p: number }[][] = [];
  for (const pt of points) {
    const c = clusters[clusters.length - 1];
    if (c && pt.p - mean(c.map(x => x.p)) <= tol) c.push(pt); else clusters.push([pt]);
  }
  const close = bars[last].close;
  const levels = clusters.filter(c => c.length >= 2).map(c => {
    const prices = c.map(x => x.p), lvl = mean(prices);
    const half = Math.max((Math.max(...prices) - Math.min(...prices)) / 2, unit * 0.08);
    const recent = Math.max(...c.map(x => x.i));
    // touches matter most; a level touched lately a little more
    const score = c.length + (recent - from) / Math.max(1, last - from);
    return { lvl, top: lvl + half, bottom: lvl - half, first: Math.min(...c.map(x => x.i)), touches: c.length, score };
  });
  const pick = (side: Side) => levels
    .filter(l => (side === "bull" ? l.lvl < close : l.lvl > close))
    .sort((x, y) => y.score - x.score)
    .slice(0, perSide)
    .map<Zone>(l => ({ kind: "sr", side, from: l.first, to: last, top: l.top, bottom: l.bottom, touches: l.touches,
      label: `${side === "bull" ? "Support" : "Resistance"} · ${l.touches} touches` }));
  return [...pick("bull"), ...pick("bear")];
}

// ---- fair value gaps, and their inversions ---------------------------------------------------------
type Gap = { side: Side; at: number; top: number; bottom: number };

function gaps(bars: Bar[], from: number, minSize: number): Gap[] {
  const out: Gap[] = [];
  for (let i = Math.max(from, 1); i < bars.length - 1; i++) {
    const a = bars[i - 1], c = bars[i + 1];
    if (c.low > a.high && c.low - a.high >= minSize) out.push({ side: "bull", at: i - 1, top: c.low, bottom: a.high });
    else if (c.high < a.low && a.low - c.high >= minSize) out.push({ side: "bear", at: i - 1, top: a.low, bottom: c.high });
  }
  return out;
}

export function fairValueGaps(bars: Bar[], from: number, opts: { max?: number; state?: ZoneState } = {}): Zone[] {
  const last = bars.length - 1;
  if (last - from < 5) return [];
  const unit = mean(atr(bars).slice(from)) || 1;
  const state = opts.state ?? "live";
  const out: Zone[] = [];
  for (const g of gaps(bars, from, unit * 0.1)) {
    // (the third candle left it already: every return into it is a tap; filled once price trades through it)
    const life = zoneLife(bars, g, g.at + 3, "trade", true);
    if (!wanted(life, state)) continue;
    out.push({ kind: life.used >= 0 ? "zone_used" : life.taps ? "fvg_tapped" : "fvg", side: g.side, from: g.at, to: life.used >= 0 ? life.used : last,
      top: g.top, bottom: g.bottom, extend: life.used < 0, label: `${g.side === "bull" ? "Bullish FVG" : "Bearish FVG"} · ${stateText(life, "filled")}` });
  }
  return out.slice(-(opts.max ?? (state === "all" ? 12 : 8)));
}

export function inverseFairValueGaps(bars: Bar[], from: number, opts: { max?: number; state?: ZoneState } = {}): Zone[] {
  const last = bars.length - 1;
  if (last - from < 5) return [];
  const unit = mean(atr(bars).slice(from)) || 1;
  const state = opts.state ?? "live";
  const live: Zone[] = [];
  for (const g of gaps(bars, from, unit * 0.1)) {
    // the close that goes through the gap the wrong way turns it around
    let flipped = -1;
    for (let j = g.at + 3; j <= last; j++) {
      if (g.side === "bull" ? bars[j].close < g.bottom : bars[j].close > g.top) { flipped = j; break; }
    }
    if (flipped < 0) continue;
    const side: Side = g.side === "bull" ? "bear" : "bull";
    // after the flip: once price has left it, each return is a tap; over once price closes back through it
    const life = zoneLife(bars, { side, top: g.top, bottom: g.bottom }, flipped + 1, "close");
    if (!wanted(life, state)) continue;
    // (drawn from the gap itself, where it formed, on to the latest bar, or to the close that ended it)
    live.push({ kind: life.used >= 0 ? "zone_used" : life.taps ? "ifvg_tapped" : "ifvg", side, from: g.at, to: life.used >= 0 ? life.used : last,
      top: g.top, bottom: g.bottom, extend: life.used < 0, label: `${side === "bull" ? "Bullish IFVG" : "Bearish IFVG"} · ${stateText(life, "broken")}` });
  }
  return live.slice(-(opts.max ?? (state === "all" ? 10 : 6)));
}

// ---- market structure: breaks of structure and changes of character ---------------------------------
// The swing highs and lows (a swing counts once it's confirmed: k bars after it). A candle that closes
// beyond the latest unbroken swing breaks it: in the trend's direction that's a break of structure
// (BOS), against it a change of character (CHoCH), and the trend turns. Each is a level from the swing
// to the candle that broke it (top = bottom = the swing's price).
export function marketStructure(bars: Bar[], from: number, opts: { max?: number } = {}): Zone[] {
  const last = bars.length - 1;
  if (last - from < 10) return [];
  const k = swingSize(last - from);
  // (a little before the window, so the trend is known when it starts)
  const start = Math.max(0, from - 100);
  const { highs, lows } = swings(bars, k, start);
  const out: Zone[] = [];
  let trend: Side | null = null;
  let hi = 0, lo = 0;
  let swingHigh: number | null = null, swingLow: number | null = null;
  for (let i = start; i <= last; i++) {
    while (hi < highs.length && highs[hi] + k <= i) swingHigh = highs[hi++];
    while (lo < lows.length && lows[lo] + k <= i) swingLow = lows[lo++];
    if (swingHigh !== null && bars[i].close > bars[swingHigh].high) {
      const kind: ZoneKind = trend === "bear" ? "choch" : "bos";
      const level = bars[swingHigh].high;
      out.push({ kind, side: "bull", from: swingHigh, to: i, top: level, bottom: level, label: kind === "choch" ? "CHoCH" : "BOS" });
      swingHigh = null;
      trend = "bull";
    } else if (swingLow !== null && bars[i].close < bars[swingLow].low) {
      const kind: ZoneKind = trend === "bull" ? "choch" : "bos";
      const level = bars[swingLow].low;
      out.push({ kind, side: "bear", from: swingLow, to: i, top: level, bottom: level, label: kind === "choch" ? "CHoCH" : "BOS" });
      swingLow = null;
      trend = "bear";
    }
  }
  return out.filter(z => z.to >= from).slice(-(opts.max ?? 16));
}

// ---- order blocks --------------------------------------------------------------------------------
// Which zones to show: live (fresh and tapped: the default), only fresh, only tapped, or all (with the
// used ones: an OB closed through, an FVG traded through)
export type ZoneState = "live" | "fresh" | "tapped" | "all";
export type ZoneLife = { taps: number; firstTap: number; deepest: number; used: number };

// A zone's life after it formed: once price has left it, each return into it is a tap (how deep: 0.5 =
// its middle, the CE); `used` the candle that ended it: a close through its far edge (an order block's
// end) or any trade through it (an FVG filled)
export function zoneLife(bars: Bar[], z: { side: Side; top: number; bottom: number }, start: number, end: "close" | "trade", leftAlready = false): ZoneLife {
  const bull = z.side === "bull", h = Math.max(z.top - z.bottom, 1e-9);
  let left = leftAlready, inside = false, taps = 0, firstTap = -1, deepest = 0, used = -1;
  for (let j = start; j < bars.length; j++) {
    const b = bars[j];
    const through = end === "close" ? (bull ? b.close < z.bottom : b.close > z.top) : (bull ? b.low <= z.bottom : b.high >= z.top);
    if (left && through) { used = j; break; }
    if (!left) { if (bull ? b.low > z.top : b.high < z.bottom) left = true; continue; }
    const enters = bull ? b.low <= z.top : b.high >= z.bottom;
    if (enters) {
      if (!inside) { taps++; if (firstTap < 0) firstTap = j; }
      inside = true;
      deepest = Math.max(deepest, Math.min(1, bull ? (z.top - Math.max(b.low, z.bottom)) / h : (Math.min(b.high, z.top) - z.bottom) / h));
    } else inside = false;
  }
  return { taps, firstTap, deepest, used };
}

export function stateText(life: ZoneLife, usedWord: string): string {
  if (life.used >= 0) return usedWord;
  if (!life.taps) return "fresh";
  return `tapped ×${life.taps}${life.deepest >= 0.5 ? " (past 50%)" : ""}`;
}

const wanted = (life: ZoneLife, state: ZoneState) =>
  state === "all" ? true : life.used >= 0 ? false : state === "fresh" ? life.taps === 0 : state === "tapped" ? life.taps > 0 : true;

export function orderBlocks(bars: Bar[], from: number, opts: { perSide?: number; state?: ZoneState } = {}): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const state = opts.state ?? "live";
  const blocks = allOrderBlocks(bars, from).map(b => {
    const life = zoneLife(bars, b, b.from + 1, "close");
    const name = b.side === "bull" ? "Bullish OB" : "Bearish OB";
    return { b, life, z: { ...b, kind: life.used >= 0 ? "zone_used" : life.taps ? "ob_tapped" : "ob", label: `${name} · ${stateText(life, "broken")}`,
      to: life.used >= 0 ? life.used : last, extend: life.used < 0 } as Zone };
  }).filter(x => wanted(x.life, state));
  const perSide = opts.perSide ?? (state === "all" ? 5 : 3);
  return [...blocks.filter(x => x.b.side === "bull").slice(-perSide), ...blocks.filter(x => x.b.side === "bear").slice(-perSide)].map(x => x.z);
}

// Every order block formed in the window, broken or not (breaker blocks are the broken ones)
export function allOrderBlocks(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const k = Math.max(3, swingSize(last - from) + 1);
  // swings over all the bars up to the window (a break inside it may use an older swing)
  const { highs, lows } = swings(bars, k, Math.max(0, from - 200), last);
  const blocks: Zone[] = [];
  let hi = -1, lo = -1;           // index into highs / lows of the latest confirmed swing
  let hiUsed = false, loUsed = false;
  for (let i = from; i <= last; i++) {
    // swings confirmed by bar i (k bars after them)
    while (hi + 1 < highs.length && highs[hi + 1] + k <= i) { hi++; hiUsed = false; }
    while (lo + 1 < lows.length && lows[lo + 1] + k <= i) { lo++; loUsed = false; }
    const c = bars[i].close;
    if (hi >= 0 && !hiUsed && c > bars[highs[hi]].high) {
      hiUsed = true;
      // the last down candle before the move up (the lowest one if several), else the lowest bar
      let pick = -1;
      for (let j = i - 1; j >= highs[hi]; j--) if (bars[j].close < bars[j].open && (pick < 0 || bars[j].low < bars[pick].low)) pick = j;
      if (pick < 0) { pick = highs[hi]; for (let j = highs[hi]; j < i; j++) if (bars[j].low < bars[pick].low) pick = j; }
      blocks.push({ kind: "ob", side: "bull", from: pick, to: last, top: bars[pick].high, bottom: bars[pick].low, label: "Bullish OB" });
    }
    if (lo >= 0 && !loUsed && c < bars[lows[lo]].low) {
      loUsed = true;
      let pick = -1;
      for (let j = i - 1; j >= lows[lo]; j--) if (bars[j].close > bars[j].open && (pick < 0 || bars[j].high > bars[pick].high)) pick = j;
      if (pick < 0) { pick = lows[lo]; for (let j = lows[lo]; j < i; j++) if (bars[j].high > bars[pick].high) pick = j; }
      blocks.push({ kind: "ob", side: "bear", from: pick, to: last, top: bars[pick].high, bottom: bars[pick].low, label: "Bearish OB" });
    }
  }
  return blocks;
}

export type MarkKind = "order_blocks" | "fvg" | "ifvg" | "support_resistance" | "structure";
export function analyse(kind: MarkKind, bars: Bar[], from: number): Zone[] {
  switch (kind) {
    case "order_blocks": return orderBlocks(bars, from);
    case "fvg": return fairValueGaps(bars, from);
    case "ifvg": return inverseFairValueGaps(bars, from);
    case "support_resistance": return supportResistance(bars, from);
    case "structure": return marketStructure(bars, from);
  }
}
