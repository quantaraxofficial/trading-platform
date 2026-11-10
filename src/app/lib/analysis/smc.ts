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
export type ZoneKind = "sr" | "fvg" | "ifvg" | "ob";
export type Zone = { kind: ZoneKind; side: Side; from: number; to: number; top: number; bottom: number; label: string; touches?: number };

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

export function fairValueGaps(bars: Bar[], from: number, opts: { max?: number } = {}): Zone[] {
  const last = bars.length - 1;
  if (last - from < 5) return [];
  const unit = mean(atr(bars).slice(from)) || 1;
  const open: Zone[] = [];
  for (const g of gaps(bars, from, unit * 0.1)) {
    let filled = false;
    for (let j = g.at + 3; j <= last && !filled; j++) {
      // filled once price trades through the gap's far edge
      if (g.side === "bull" ? bars[j].low <= g.bottom : bars[j].high >= g.top) filled = true;
    }
    if (!filled) open.push({ kind: "fvg", side: g.side, from: g.at, to: last, top: g.top, bottom: g.bottom, label: g.side === "bull" ? "Bullish FVG" : "Bearish FVG" });
  }
  return open.slice(-(opts.max ?? 8));
}

export function inverseFairValueGaps(bars: Bar[], from: number, opts: { max?: number } = {}): Zone[] {
  const last = bars.length - 1;
  if (last - from < 5) return [];
  const unit = mean(atr(bars).slice(from)) || 1;
  const live: Zone[] = [];
  for (const g of gaps(bars, from, unit * 0.1)) {
    // the close that goes through the gap the wrong way turns it around
    let flipped = -1;
    for (let j = g.at + 3; j <= last; j++) {
      if (g.side === "bull" ? bars[j].close < g.bottom : bars[j].close > g.top) { flipped = j; break; }
    }
    if (flipped < 0) continue;
    const side: Side = g.side === "bull" ? "bear" : "bull";
    // over once price closes back through it
    let over = false;
    for (let j = flipped + 1; j <= last && !over; j++) {
      if (side === "bear" ? bars[j].close > g.top : bars[j].close < g.bottom) over = true;
    }
    if (!over) live.push({ kind: "ifvg", side, from: flipped, to: last, top: g.top, bottom: g.bottom, label: side === "bull" ? "Bullish IFVG" : "Bearish IFVG" });
  }
  return live.slice(-(opts.max ?? 6));
}

// ---- order blocks --------------------------------------------------------------------------------
export function orderBlocks(bars: Bar[], from: number, opts: { perSide?: number } = {}): Zone[] {
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
  // still in play: no close through the block's far edge since it formed
  const live = blocks.filter(b => {
    for (let j = b.from + 1; j <= last; j++) if (b.side === "bull" ? bars[j].close < b.bottom : bars[j].close > b.top) return false;
    return true;
  });
  const perSide = opts.perSide ?? 3;
  return [...live.filter(b => b.side === "bull").slice(-perSide), ...live.filter(b => b.side === "bear").slice(-perSide)];
}

export type MarkKind = "order_blocks" | "fvg" | "ifvg" | "support_resistance";
export function analyse(kind: MarkKind, bars: Bar[], from: number): Zone[] {
  switch (kind) {
    case "order_blocks": return orderBlocks(bars, from);
    case "fvg": return fairValueGaps(bars, from);
    case "ifvg": return inverseFairValueGaps(bars, from);
    case "support_resistance": return supportResistance(bars, from);
  }
}
