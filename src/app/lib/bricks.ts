// The chart types built from their own bars instead of time bars (TradingView's Renko, Line
// break, Kagi, Point & figure and Range), from their Settings → Symbol inputs (lib/seriesStyles;
// TradingView's defaults: Renko box = ATR(14), Line break of 3 lines, Kagi reversal = ATR(14),
// Point & figure box = ATR(14) with a 3-box reversal; Range = 100 ticks). Built from the chart's
// time bars; each new bar takes the time of the bar it completed in (a second later for each
// further one in that bar, so the times stay distinct and increasing). Bars built on a time bar
// that's still open are `projection`s, drawn in the projection colours until it closes. Every
// built bar is marked `brick` so it isn't built again.
import type { ChartType } from "./chartType";

export type SrcBar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
export type Brick = SrcBar & { brick: true; up: boolean; kind?: "x" | "o"; boxes?: number; box?: number; thick?: boolean; prevLevel?: number; projection?: boolean };
export type BrickParams = { method?: string; atrLength?: number; boxSize?: number; percentage?: number; reversal?: number; lines?: number; source?: string; oneStepBack?: boolean };

export const isBrick = (b: any): b is Brick => !!b && b.brick === true;

// Average true range (Wilder's RMA) at the last bar
export function atr(bars: SrcBar[], length = 14): number {
  if (bars.length < 2) return bars.length ? bars[0].high - bars[0].low : 0;
  let rma = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], pc = bars[i - 1].close;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
    rma = i <= length ? rma + (tr - rma) / i : rma + (tr - rma) / length;
  }
  return rma;
}

const round = (v: number, tick: number) => Math.round(v / tick) * tick;

function stamp(out: Brick[], time: number): number {
  const last = out[out.length - 1];
  return last && last.time >= time ? last.time + 1 : time;
}

// The box size (Renko, Point & figure) or reversal (Kagi) by the chosen method: the ATR, a fixed
// amount (Traditional), or a percentage of the last price (Percentage LTP)
function amount(src: SrcBar[], p: BrickParams, fixed: number | undefined, tick: number): number {
  const v = p.method === "Traditional" ? (fixed ?? 1)
    : p.method === "Percentage LTP" ? src[src.length - 1].close * (p.percentage ?? 1) / 100
    : atr(src, p.atrLength ?? 14);
  return Math.max(tick, round(v, tick) || tick);
}

export function buildBricks(type: ChartType, bars: SrcBar[], tick: number, p: BrickParams = {}, lastOpen = false): Brick[] {
  const src = bars.filter(b => typeof b.close === "number" && !isBrick(b));
  if (src.length < 2) return [];
  let out: Brick[];
  switch (type) {
    case "renko": out = renko(src, amount(src, p, p.boxSize, tick), p.source === "OHLC"); break;
    case "pb": out = lineBreak(src, Math.max(1, p.lines ?? 3)); break;
    case "kagi": out = kagi(src, amount(src, p, p.reversal, tick)); break;
    case "pnf": out = pointFigure(src, amount(src, p, p.boxSize, tick), p.oneStepBack ? 1 : Math.max(1, p.reversal ?? 3), p.source !== "Close"); break;
    case "range": out = rangeBars(src, tick * 100); break;
    default: return [];
  }
  // what the bar still open has built so far is a projection
  if (lastOpen && out.length) {
    const t = src[src.length - 1].time;
    for (let i = out.length - 1; i >= 0 && out[i].time >= t; i--) out[i].projection = true;
  }
  return out;
}

function renko(src: SrcBar[], box: number, ohlc = false): Brick[] {
  const out: Brick[] = [];
  let top = Math.floor(src[0].close / box) * box + box, bottom = top - box;
  let lo = Infinity, hi = -Infinity, vol = 0;
  for (const bar of src) {
    lo = Math.min(lo, bar.low); hi = Math.max(hi, bar.high); vol += bar.volume || 0;
    // Close: the closes alone; OHLC: open → nearer of high / low → the other → close
    const path = !ohlc ? [bar.close] : bar.close >= bar.open ? [bar.open, bar.low, bar.high, bar.close] : [bar.open, bar.high, bar.low, bar.close];
    for (const price of path) {
    const b = { ...bar, close: price };
    while (b.close >= top + box) {
      const t = stamp(out, b.time);
      out.push({ time: t, open: top, close: top + box, high: top + box, low: Math.min(top, lo), volume: vol, brick: true, up: true });
      bottom = top; top += box; lo = Infinity; hi = -Infinity; vol = 0;
    }
    while (b.close <= bottom - box) {
      const t = stamp(out, b.time);
      out.push({ time: t, open: bottom, close: bottom - box, high: Math.max(bottom, hi), low: bottom - box, volume: vol, brick: true, up: false });
      top = bottom; bottom -= box; lo = Infinity; hi = -Infinity; vol = 0;
    }
    }
  }
  return out;
}

function lineBreak(src: SrcBar[], n: number): Brick[] {
  const out: Brick[] = [];
  let vol = 0;
  for (let i = 0; i < src.length; i++) {
    const b = src[i];
    vol += b.volume || 0;
    if (!out.length) {
      if (i === 0) continue;
      const prev = src[0].close;
      if (b.close === prev) continue;
      out.push({ time: b.time, open: prev, close: b.close, high: Math.max(prev, b.close), low: Math.min(prev, b.close), volume: vol, brick: true, up: b.close > prev });
      vol = 0;
      continue;
    }
    const last = out[out.length - 1];
    const recent = out.slice(-n);
    const hi = Math.max(...recent.map(l => Math.max(l.open, l.close)));
    const lo = Math.min(...recent.map(l => Math.min(l.open, l.close)));
    let from: number | null = null;
    if (last.up) {
      if (b.close > last.close) from = last.close;
      else if (b.close < lo) from = last.open;   // a reversal: breaks the last n lines
    } else {
      if (b.close < last.close) from = last.close;
      else if (b.close > hi) from = last.open;
    }
    if (from === null) continue;
    out.push({ time: stamp(out, b.time), open: from, close: b.close, high: Math.max(from, b.close), low: Math.min(from, b.close), volume: vol, brick: true, up: b.close > from });
    vol = 0;
  }
  return out;
}

// Kagi: each segment is a vertical line from the previous turning level; it's thick (yang) once
// it rises above the last shoulder, thin (yin) once it falls below the last waist
function kagi(src: SrcBar[], reversal: number): Brick[] {
  const out: Brick[] = [];
  let level = src[0].close, dir = 0, thick = true;
  let shoulder = -Infinity, waist = Infinity, vol = 0;
  let extreme = level;
  for (const b of src) {
    vol += b.volume || 0;
    const c = b.close;
    if (dir >= 0 && c > extreme) { extreme = c; if (dir === 0 && c - level >= reversal) dir = 1; }
    else if (dir <= 0 && c < extreme) { extreme = c; if (dir === 0 && level - c >= reversal) dir = -1; }
    if (dir === 1 && extreme - c >= reversal) {
      if (extreme > shoulder) thick = true;
      out.push(seg(out, b.time, level, extreme, true, thick, vol)); vol = 0;
      shoulder = extreme; level = extreme; extreme = c; dir = -1;
      if (c < waist) thick = false;
    } else if (dir === -1 && c - extreme >= reversal) {
      if (extreme < waist) thick = false;
      out.push(seg(out, b.time, level, extreme, false, thick, vol)); vol = 0;
      waist = extreme; level = extreme; extreme = c; dir = 1;
      if (c > shoulder) thick = true;
    }
  }
  // the line still being drawn
  if (dir !== 0 && extreme !== level) {
    const up = extreme > level;
    const t = src[src.length - 1].time;
    out.push(seg(out, t, level, extreme, up, up ? (extreme > shoulder || thick) : !(extreme < waist) && thick, vol));
  }
  return out;
}
function seg(out: Brick[], time: number, from: number, to: number, up: boolean, thick: boolean, volume: number): Brick {
  return { time: stamp(out, time), open: from, close: to, high: Math.max(from, to), low: Math.min(from, to), volume, brick: true, up, thick, prevLevel: from };
}

// Point & figure: columns of X (rising) or O (falling) boxes; a new column after the price
// reverses by `rev` boxes
function pointFigure(input: SrcBar[], box: number, rev: number, hl = true): Brick[] {
  const src = hl ? input : input.map(b => ({ ...b, high: b.close, low: b.close }));
  const out: Brick[] = [];
  let colTop = Math.floor(src[0].close / box) * box, colBottom = colTop, up: boolean | null = null, colTime = src[0].time, vol = 0;
  const push = () => { if (up === null) return; const t = stamp(out, colTime); out.push({ time: t, open: up ? colBottom : colTop, close: up ? colTop : colBottom, high: colTop, low: colBottom, volume: vol, brick: true, up, kind: up ? "x" : "o", box, boxes: Math.round((colTop - colBottom) / box) }); vol = 0; };
  for (const b of src) {
    vol += b.volume || 0;
    if (up === null) {
      if (b.high >= colTop + box) { up = true; colTop = Math.floor(b.high / box) * box; colTime = b.time; }
      else if (b.low <= colBottom - box) { up = false; colBottom = Math.ceil(b.low / box) * box; colTime = b.time; }
      continue;
    }
    if (up) {
      if (b.high >= colTop + box) colTop = Math.floor(b.high / box) * box;
      else if (b.low <= colTop - rev * box) { push(); up = false; colBottom = Math.ceil(b.low / box) * box; colTop = colTop - box; colTime = b.time; }
    } else {
      if (b.low <= colBottom - box) colBottom = Math.ceil(b.low / box) * box;
      else if (b.high >= colBottom + rev * box) { push(); up = true; colTop = Math.floor(b.high / box) * box; colBottom = colBottom + box; colTime = b.time; }
    }
  }
  push();
  return out;
}

// Range bars: each spans `range` from low to high; walking each source bar open → nearer of
// high / low → the other → close
function rangeBars(src: SrcBar[], range: number): Brick[] {
  const out: Brick[] = [];
  let cur: Brick | null = null;
  const tickTo = (p: number, time: number, vol: number) => {
    if (!cur) { cur = { time: stamp(out, time), open: p, high: p, low: p, close: p, volume: 0, brick: true, up: true }; }
    while (true) {
      const c: Brick = cur!;
      if (p > c.low + range) {
        c.high = c.low + range; c.close = c.high; c.up = c.close >= c.open; out.push(c);
        cur = { time: stamp(out, time), open: c.close, high: c.close, low: c.close, close: c.close, volume: 0, brick: true, up: true };
      } else if (p < c.high - range) {
        c.low = c.high - range; c.close = c.low; c.up = c.close >= c.open; out.push(c);
        cur = { time: stamp(out, time), open: c.close, high: c.close, low: c.close, close: c.close, volume: 0, brick: true, up: false };
      } else { c.high = Math.max(c.high, p); c.low = Math.min(c.low, p); c.close = p; c.up = c.close >= c.open; c.volume = (c.volume || 0) + vol; return; }
    }
  };
  for (const b of src) {
    const path = b.close >= b.open ? [b.open, b.low, b.high, b.close] : [b.open, b.high, b.low, b.close];
    path.forEach((p, i) => tickTo(p, b.time, i === 3 ? b.volume || 0 : 0));
  }
  if (cur) out.push(cur);
  return out;
}
