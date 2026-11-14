// The drawings on a chart screenshot, copied onto this chart (lib/analysis/drawingsImage finds them;
// this places them): each Fib, trend line, horizontal line / ray, vertical line and rectangle at the
// same bars and prices, in its colours, and their looks made the tools' defaults (new Fibs come out
// like the picture's). The picture's candles are lined up with this chart's bars; when they don't
// match this timeframe, the chart's symbol is tried on the others and the chart switched to the
// one that matches. All of it can be put back (the drawings removed, the defaults as they were).

import type { ChartScan } from "../analysis/themeImage";
import { findDrawings, alignCandles, barAt, priceAt, type FoundDrawing, type Alignment, type Bar } from "../analysis/drawingsImage";
import { getChartBars, getChartInfo } from "../chartBars";
import { fetchPineTimeframeData } from "../pineDataFetch";
import { DEFAULT_FIB_LEVELS, DEFAULT_FIB_STYLE } from "../../components/drawing/ui/FibonacciSettingsModal";
import { intervalByValue } from "./commands";

const TIMEFRAMES: [string, string][] = [["1", "1min"], ["5", "5min"], ["15", "15min"], ["30", "30min"], ["60", "1h"], ["120", "2h"], ["240", "4h"], ["D", "1day"]];
const GROUP_PREFIX = "picture-drawings-";

export type DrawingsCopy = { found: number; placed: number; summary: string; switchedTo?: string; undo: () => void };

const fmt = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: p >= 100 ? 2 : 4, maximumFractionDigits: p >= 100 ? 2 : 5 });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// Where the picture sits: on the chart's own bars, else on this symbol's other timeframes (the chart
// switched to it). → a bar index (fractional) on the chart for a picture's x, and its time
async function locate(scan: ChartScan): Promise<{ al: Alignment; logical: (i: number) => number; time: (i: number) => number; switchedTo?: string } | null> {
  const chart = getChartBars() as Bar[];
  const own = alignCandles(scan, chart);
  const sec = (bars: Bar[]) => (bars.length > 1 ? bars[bars.length - 1].time - bars[bars.length - 2].time : 60);
  const timeOf = (bars: Bar[]) => (i: number) => { const j = Math.max(0, Math.min(bars.length - 1, Math.round(i))); return bars[j].time + (i - j) * sec(bars); };
  if (own) return { al: own, logical: i => i, time: timeOf(chart) };
  const info = getChartInfo();
  if (!info) return null;
  const order = [...TIMEFRAMES].sort((a, b) => (b[1] === info.interval ? 1 : 0) - (a[1] === info.interval ? 1 : 0));
  for (const [pine, value] of order) {
    const bars = (await fetchPineTimeframeData(pine, info.symbol).catch(() => [])) as Bar[];
    if (bars.length < 30) continue;
    const al = alignCandles(scan, bars);
    if (!al) continue;
    let switchedTo: string | undefined;
    if (value !== info.interval) {
      window.dispatchEvent(new CustomEvent("tv:set-interval", { detail: { interval: value } }));
      switchedTo = value;
      // (the chart on the new timeframe, its bars loaded)
      let last = -1, stable = 0;
      for (let t = 0; t < 60 && stable < 3; t++) {
        await wait(150);
        const n = getChartBars().length;
        stable = getChartInfo()?.interval === value && n > 0 && n === last ? stable + 1 : 0;
        last = n;
      }
    }
    // the fetched bars' times onto the chart's bars (older than the chart's first: counted back from it)
    const now = getChartBars() as Bar[];
    const byTime = new Map(now.map((b, i) => [b.time, i]));
    const firstAt = now.length ? bars.findIndex(b => b.time === now[0].time) : -1;
    const logical = (i: number) => {
      const j = Math.max(0, Math.min(bars.length - 1, Math.round(i)));
      const c = byTime.get(bars[j].time);
      if (c !== undefined) return c + (i - j);
      if (firstAt >= 0) return i - firstAt;
      return i - (bars.length - now.length);
    };
    return { al, logical, time: timeOf(bars), switchedTo };
  }
  return null;
}

type Placed = { type: string; points: { logical: number; price: number; time: number }[]; style: Record<string, unknown>; said: string };

function place(found: FoundDrawing[], scan: ChartScan, loc: NonNullable<Awaited<ReturnType<typeof locate>>>): Placed[] {
  const { al } = loc;
  const pt = (x: number, y: number) => { const i = barAt(al, x); return { logical: loc.logical(i), price: priceAt(al, y), time: loc.time(i) }; };
  const out: Placed[] = [];
  for (const d of found) {
    if (d.kind === "fib") {
      const p1 = pt(d.firstLeft ? d.x0 : d.x1, d.y1), p2 = pt(d.firstLeft ? d.x1 : d.x0, d.y0);
      out.push({ type: "fibonacci", points: [p1, p2], style: fibStyle(d, scan), said: `a Fib retracement from ${fmt(p1.price)} to ${fmt(p2.price)} (${d.levels.length} levels)` });
    } else if (d.kind === "hline") {
      const style = { stroke: d.color, strokeWidth: d.width, lineStyle: d.style };
      if (d.left && d.right) out.push({ type: "horizontal_line", points: [pt((d.x0 + d.x1) / 2, d.y)], style, said: `a horizontal line at ${fmt(priceAt(al, d.y))}` });
      else if (d.right) out.push({ type: "horizontal_ray", points: [pt(d.x0, d.y)], style, said: `a horizontal ray at ${fmt(priceAt(al, d.y))}` });
      else out.push({ type: "trendline", points: [pt(d.x0, d.y), pt(d.x1, d.y)], style, said: `a level at ${fmt(priceAt(al, d.y))}` });
    } else if (d.kind === "vline") {
      out.push({ type: "vertical_line", points: [pt(d.x, (scan.plot.y0 + scan.plot.y1) / 2)], style: { stroke: d.color, strokeWidth: d.width, lineStyle: d.style }, said: "a vertical line" });
    } else if (d.kind === "line") {
      out.push({ type: "trendline", points: [pt(d.a.x, d.a.y), pt(d.b.x, d.b.y)],
        style: { stroke: d.color, strokeWidth: d.width, lineStyle: d.style, extendLeft: d.left, extendRight: d.right },
        said: `a trend line from ${fmt(priceAt(al, d.a.y))} to ${fmt(priceAt(al, d.b.y))}` });
    } else if (d.kind === "rect") {
      out.push({ type: "rectangle", points: [pt(d.x0, d.y0), pt(d.x1, d.y1)],
        style: { stroke: d.border, strokeWidth: d.width, fill: d.fill ?? "rgba(0, 0, 0, 0)", backgroundVisible: !!d.fill },
        said: `a rectangle from ${fmt(priceAt(al, d.y0))} to ${fmt(priceAt(al, d.y1))}` });
    }
  }
  return out;
}

// A Fib's look: TradingView's levels with the picture's colours (a level the picture shows off is off,
// one beyond its edges keeps its default), its shading, line width and trend line
function fibStyle(d: Extract<FoundDrawing, { kind: "fib" }>, scan: ChartScan) {
  const D = d.y1 - d.y0;
  const fibLevels = DEFAULT_FIB_LEVELS.map(l => {
    const hit = d.levels.find(f => Math.abs(f.value - l.value) < 0.001);
    if (hit) return { ...l, enabled: true, color: hit.color };
    const y = d.y0 + l.value * D;
    const onScreen = y > scan.plot.y0 + 2 && y < scan.plot.y1 - 2;
    return { ...l, enabled: onScreen ? false : l.enabled };
  });
  return {
    ...DEFAULT_FIB_STYLE, fibLevels, levelsLineWidth: Math.max(1, Math.min(4, d.width)),
    showBackground: d.background, backgroundOpacity: d.background ? Math.round(d.backgroundAlpha * 100) / 100 : DEFAULT_FIB_STYLE.backgroundOpacity,
    showTrendLine: !!d.trend, ...(d.trend ? { trendLineColor: d.trend.color, trendLineStyle: d.trend.style } : {}),
    extendLeft: d.left, extendRight: d.right,
  };
}

// The tools' default looks from what was found (the first of each kind)
function defaultsOf(placed: Placed[]): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const p of placed) {
    if (out[p.type]) continue;
    const { extendLeft, extendRight, ...look } = p.style as any;
    void extendLeft; void extendRight;
    out[p.type] = p.type === "fibonacci" ? { ...(p.style as any), extendLeft: false, extendRight: false } : look;
  }
  return out;
}

export async function copyImageDrawings(scan: ChartScan): Promise<DrawingsCopy | null> {
  const found = findDrawings(scan);
  if (!found.length) return null;
  const stamp = Date.now().toString(36);
  const group = { id: `${GROUP_PREFIX}${stamp}`, name: "From your picture" };
  const intervalBefore = getChartInfo()?.interval;
  const loc = await locate(scan);
  const placed = loc ? place(found, scan, loc) : [];
  // placed as ordinary drawings, in one group (one undo takes them back)
  if (placed.length) {
    const drawings = placed.map((p, i) => ({ id: `${group.id}-${i}`, type: p.type, visible: true, locked: false, group, points: p.points, ...p.style }));
    window.dispatchEvent(new CustomEvent("tv:add-drawings", { detail: { drawings } }));
  }
  // the looks as the tools' defaults (even when the picture couldn't be placed)
  const looks = defaultsOf(placed.length ? placed : place(found, scan, { al: { k: 0, x0: 0, step: 1, a: -1, b: 0, log: false, rms: 0, agree: 1, candles: 0 }, logical: i => i, time: () => 0 }));
  const before = JSON.parse(JSON.stringify((window as any).__drawingDefaults || {}));
  const prev: Record<string, unknown> = {};
  for (const t of Object.keys(looks)) prev[t] = before[t] ?? null;
  window.dispatchEvent(new CustomEvent("tv:set-tool-defaults", { detail: { defaults: looks } }));

  const kinds: Record<string, string> = { fibonacci: "Fibs", trendline: "trend lines", horizontal_line: "horizontal lines", horizontal_ray: "horizontal rays", vertical_line: "vertical lines", rectangle: "rectangles" };
  const lookText = Object.keys(looks).map(t => kinds[t]).filter(Boolean);
  const iv = loc?.switchedTo ? intervalByValue(loc.switchedTo) : undefined;
  const summary = placed.length
    ? `${placed.map(p => p.said).join(", ")}${iv ? ` (your picture is the ${iv.spoken} chart: switched to it)` : ""}; new ${lookText.join(", ")} will look the same`
    : `${found.length} drawing${found.length === 1 ? "" : "s"} I couldn't place: the picture's candles don't line up with ${getChartInfo()?.symbol ?? "this chart"} on any timeframe (open the symbol the picture is of, then ask again); their looks are now the defaults for new ${lookText.join(", ")}`;
  return {
    found: found.length, placed: placed.length, summary, switchedTo: loc?.switchedTo,
    undo: () => {
      window.dispatchEvent(new CustomEvent("tv:remove-drawings", { detail: { groupPrefix: group.id } }));
      if (loc?.switchedTo && intervalBefore) window.dispatchEvent(new CustomEvent("tv:set-interval", { detail: { interval: intervalBefore } }));
      window.dispatchEvent(new CustomEvent("tv:set-tool-defaults", { detail: { defaults: prev, replace: true } }));
    },
  };
}
