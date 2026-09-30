"use client";

// The strategy report's charts. The performance chart is a lightweight-charts chart (as on
// TradingView): cumulative P&L as a baseline series with a marker per trade, each trade's
// favorable/adverse excursion and result as columns, the buy-and-hold P&L, and the run-up /
// drawdown periods as a band along the bottom. The category charts (P&L per day, returns
// distribution, streaks, results by time, ...) and the donut are drawn as SVG.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createChart, BaselineSeries, HistogramSeries, LineSeries, ColorType, CrosshairMode, TickMarkType,
  type IChartApi, type ISeriesApi, type UTCTimestamp, type Time,
} from "lightweight-charts";
import type { PineStrategyReport, PineStrategyTrade } from "../../lib/pineScriptEngine";
import { fmtNum, zoned, growthEpisodes } from "./stats";

// Current value of one of the report's CSS color tokens
export function cssVar(name: string): string {
  if (typeof document === "undefined") return "#000";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// Bumps whenever the page's theme attribute changes: the canvas chart reads its colors from the CSS
// tokens, which only hold the new theme's values once the attribute is set
export function useThemeVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setV((x) => x + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return v;
}

// ---------------------------------------------------------------- performance chart

export interface PerfVisibility { cum: boolean; bh: boolean; exc: boolean; runs: boolean }

export interface PerfChartHandle { screenshot: () => HTMLCanvasElement | null }

export function PerformanceChart({
  report, visible, percent, height, tz, theme, onClickTrade, handleRef,
}: {
  report: PineStrategyReport; visible: PerfVisibility; percent: boolean; height: number; tz: string; theme: string;
  onClickTrade?: (t: PineStrategyTrade) => void;
  handleRef?: React.MutableRefObject<PerfChartHandle | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{ cum?: ISeriesApi<"Baseline">; fe?: ISeriesApi<"Histogram">; ae?: ISeriesApi<"Histogram">; net?: ISeriesApi<"Histogram">; bh?: ISeriesApi<"Line">; band?: ISeriesApi<"Line"> }>({});
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const themeVersion = useThemeVersion();
  const trades = report.trades;
  const cap = report.initialCapital || 1;
  const conv = (v: number) => (percent ? (v / cap) * 100 : v);

  // One point per trade, at its exit (bumped a second when two trades close on the same bar)
  const times = useMemo(() => {
    const out: number[] = [];
    let last = -Infinity;
    for (const t of trades) { const v = Math.max(t.exitTime, last + 1); out.push(v); last = v; }
    return out;
  }, [trades]);

  const tzRef = useRef(tz); tzRef.current = tz;
  const percentRef = useRef(percent); percentRef.current = percent;
  const clickRef = useRef(onClickTrade); clickRef.current = onClickTrade;
  const tradesRef = useRef(trades); tradesRef.current = trades;

  // Build the chart once
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth, height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: cssVar("--st-text"), fontSize: 12, fontFamily: FONT, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: cssVar("--st-chart-grid") } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.1 }, minimumWidth: 80 },
      timeScale: {
        borderVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true, timeVisible: true, secondsVisible: false,
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const z = zoned(time as number, tzRef.current);
          if (type === TickMarkType.Year) return String(z.y);
          if (type === TickMarkType.Month) return MONTHS[z.m];
          if (type === TickMarkType.DayOfMonth) return String(z.d);
          return `${String(z.h).padStart(2, "0")}:${String(z.min).padStart(2, "0")}`;
        },
      },
      crosshair: { mode: CrosshairMode.Magnet, vertLine: { visible: false, labelVisible: false }, horzLine: { visible: false, labelVisible: false } },
      handleScroll: false, handleScale: false,
      localization: { priceFormatter: (p: number) => (percentRef.current ? `${fmtNum(p)}%` : fmtNum(p)) },
    });
    chartRef.current = chart;
    const s = seriesRef.current;
    const common = { priceLineVisible: false, lastValueVisible: false, base: 0 } as const;
    s.fe = chart.addSeries(HistogramSeries, { ...common });
    s.ae = chart.addSeries(HistogramSeries, { ...common });
    s.net = chart.addSeries(HistogramSeries, { ...common });
    s.bh = chart.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false });
    s.cum = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 }, lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 3,
      priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 5,
    });
    s.band = chart.addSeries(LineSeries, { priceScaleId: "band", lineWidth: 4, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    chart.priceScale("band").applyOptions({ visible: false, scaleMargins: { top: 0.975, bottom: 0.005 } });

    chart.subscribeCrosshairMove((param) => {
      const logical = param.logical;
      if (!param.point || logical === undefined || logical === null) { setHover(null); return; }
      const i = Math.round(logical as number);
      const n = seriesRef.current.cum?.data().length ?? 0;
      if (i < 0 || i >= n) { setHover(null); return; }
      setHover({ i, x: param.point.x, y: param.point.y });
    });
    chart.subscribeClick((param) => {
      if (param.logical === undefined || param.logical === null) return;
      const i = Math.round(param.logical as number);
      const tr = tradesRef.current[i];
      if (tr) clickRef.current?.(tr);
    });
    const ro = new ResizeObserver(() => { chart.applyOptions({ width: el.clientWidth }); chart.timeScale().fitContent(); });
    ro.observe(el);
    if (handleRef) handleRef.current = { screenshot: () => { try { return chart.takeScreenshot(); } catch { return null; } } };
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = {}; if (handleRef) handleRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { chartRef.current?.applyOptions({ height }); chartRef.current?.timeScale().fitContent(); }, [height]);

  // Colors follow the theme
  useEffect(() => {
    const chart = chartRef.current, s = seriesRef.current;
    if (!chart || !s.cum) return;
    chart.applyOptions({ layout: { textColor: cssVar("--st-text") }, grid: { horzLines: { color: cssVar("--st-chart-grid") } } });
    s.cum.applyOptions({
      topLineColor: cssVar("--st-line-green"), bottomLineColor: cssVar("--st-line-red"),
      topFillColor1: cssVar("--st-area-green"), topFillColor2: cssVar("--st-area-green"),
      bottomFillColor1: cssVar("--st-area-red"), bottomFillColor2: cssVar("--st-area-red"),
    });
    s.fe?.applyOptions({ color: cssVar("--st-exc-green-soft") });
    s.ae?.applyOptions({ color: cssVar("--st-exc-red-soft") });
    s.bh?.applyOptions({ color: cssVar("--st-bench-gray") });
  }, [theme, themeVersion]);

  // Data
  useEffect(() => {
    const s = seriesRef.current, chart = chartRef.current;
    if (!chart || !s.cum) return;
    const T = (i: number) => times[i] as UTCTimestamp;
    const green = cssVar("--st-exc-green"), red = cssVar("--st-exc-red");
    s.cum.setData(trades.map((t, i) => ({ time: T(i), value: conv(t.cumulativePnl) })));
    s.fe!.setData(trades.map((t, i) => ({ time: T(i), value: conv(t.favorableExcursion) })));
    s.ae!.setData(trades.map((t, i) => ({ time: T(i), value: conv(t.adverseExcursion) })));
    s.net!.setData(trades.map((t, i) => ({ time: T(i), value: conv(t.netPnl), color: t.netPnl >= 0 ? green : red })));
    // Buy and hold: what the initial capital put into the symbol at the window's start would show
    const eq = report.equityCurve;
    const c0 = eq.length ? eq[0].close : 0;
    let j = 0;
    s.bh!.setData(trades.map((t, i) => {
      while (j + 1 < eq.length && eq[j + 1].time <= t.exitTime) j++;
      const close = eq.length ? eq[j].close : c0;
      return { time: T(i), value: conv(c0 > 0 ? cap * (close / c0 - 1) : 0) };
    }));
    // Run-ups (green) and drawdowns (red) along the bottom
    const eps = growthEpisodes(report);
    const bandGreen = cssVar("--st-band-green"), bandRed = cssVar("--st-band-red");
    s.band!.setData(trades.map((t, i) => {
      const ep = eps.find((e) => t.exitTime > e.start && t.exitTime <= e.end) || eps.find((e) => t.exitTime >= e.start && t.exitTime <= e.end)
        || (eps.length && t.exitTime > eps[eps.length - 1].end ? eps[eps.length - 1] : undefined);
      return { time: T(i), value: 0, color: ep?.kind === "drawdown" ? bandRed : bandGreen };
    }));
    chart.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, times, percent, theme, themeVersion, report]);

  useEffect(() => {
    const s = seriesRef.current;
    s.cum?.applyOptions({ visible: visible.cum });
    s.bh?.applyOptions({ visible: visible.bh });
    s.fe?.applyOptions({ visible: visible.exc });
    s.ae?.applyOptions({ visible: visible.exc });
    s.net?.applyOptions({ visible: visible.exc });
    s.band?.applyOptions({ visible: visible.runs });
  }, [visible]);

  useEffect(() => { chartRef.current?.applyOptions({ localization: { priceFormatter: (p: number) => (percent ? `${fmtNum(p)}%` : fmtNum(p)) } }); }, [percent]);

  const t = hover ? trades[hover.i] : null;
  const unit = percent ? "%" : "USD";
  const val = (v: number) => (percent ? fmtNum((v / cap) * 100) : fmtNum(v));
  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", height, cursor: hover ? "pointer" : "default" }} onMouseLeave={() => setHover(null)}>
      {t && hover && (
        <div style={{
          position: "absolute", zIndex: 6, pointerEvents: "none",
          left: Math.min(Math.max(hover.x + 16, 0), (boxRef.current?.clientWidth ?? 0) - 240),
          top: Math.max(0, Math.min(hover.y - 60, height - 140)),
          background: "var(--st-tooltip-bg)", color: "#fff", borderRadius: 6, padding: "8px 12px", fontSize: 13, lineHeight: "20px", minWidth: 228,
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}>
          <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>Trade {t.num} {t.type.toLowerCase()}</div>
          {[
            ["var(--st-line-green)", "Cumulative PnL", t.cumulativePnl, visible.cum],
            ["var(--st-exc-green-soft)", "Favorable excursion", t.favorableExcursion, visible.exc],
            ["var(--st-exc-red-soft)", "Adverse excursion", t.adverseExcursion, visible.exc],
          ].filter((r) => r[3]).map(([c, label, v]) => (
            <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: c as string, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{label as string}</span>
              <span>{val(v as number)}<span style={{ fontSize: 10, marginLeft: 2 }}>{unit === "%" ? "%" : " USD"}</span></span>
            </div>
          ))}
          <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{fmtTip(t.exitTime, tz)}</div>
          {onClickTrade && <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>Click to show on chart</div>}
        </div>
      )}
    </div>
  );
}
function fmtTip(t: number, tz: string) {
  const z = zoned(t, tz);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][z.wd];
  return `${wd}, ${MONTHS[z.m]} ${z.d}, ${z.y}, ${String(z.h).padStart(2, "0")}:${String(z.min).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- category bar charts (SVG)

export interface BarLayer { values: (number | null)[]; color: string | ((v: number, i: number) => string); label?: string }
export interface VLine { at: number; color: string } // `at` in category units (0 = left edge of the first slot)

function niceTicks(min: number, max: number, count = 4, integer = false): number[] {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const mag = Math.max(integer ? 1 : 0, Math.pow(10, Math.floor(Math.log10(raw))));
  const step = (integer ? [1, 2, 4, 5, 10] : [1, 2, 2.5, 5, 10]).map((f) => f * mag).find((s) => s >= raw) || raw;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// Bars per category. `groups` are drawn side by side in each slot; the layers of a group overlap
// (drawn in order, e.g. a faint excursion behind the solid result).
export function CategoryBarChart({
  labels, groups, height, yFormat, edgeLabels, vlines, tooltip, integerTicks,
}: {
  labels: string[]; groups: BarLayer[][]; height: number; yFormat: (v: number) => string;
  edgeLabels?: string[]; vlines?: VLine[]; tooltip?: (i: number) => React.ReactNode; integerTicks?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const width = useWidth(boxRef);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const n = Math.max(labels.length, 1);
  let min = 0, max = 0;
  for (const g of groups) for (const l of g) for (const v of l.values) if (v !== null && isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
  const ticks = niceTicks(min, max, 4, integerTicks);
  const lo = Math.min(ticks[0], min), hi = Math.max(ticks[ticks.length - 1], max);
  const axisW = Math.max(34, Math.max(...ticks.map((v) => yFormat(v).length)) * 7 + 16);
  const plotW = Math.max(10, width - axisW);
  const plotTop = 8, plotH = Math.max(10, height - 28 - plotTop);
  const y = (v: number) => plotTop + ((hi - v) / (hi - lo || 1)) * plotH;
  const slot = plotW / n;
  const gcount = groups.length;
  const groupW = gcount > 1 ? (slot * 0.84) / gcount : slot * 0.92;
  const gap = gcount > 1 ? 2 : 0;
  const barW = Math.max(1, groupW - gap);
  // label thinning so category labels don't collide
  const lblW = Math.max(...(edgeLabels ?? labels).map((l) => l.length)) * 7 + 12;
  const every = Math.max(1, Math.ceil(lblW / slot));
  const text = "var(--st-text)";
  const color = (l: BarLayer, v: number, i: number) => (typeof l.color === "function" ? l.color(v, i) : l.color);
  const barPath = (x: number, v: number, w: number) => {
    const y0 = y(0), y1 = y(v);
    const top = Math.min(y0, y1), h = Math.abs(y1 - y0);
    if (h < 0.5) return "";
    const r = Math.min(2, w / 2, h);
    if (v >= 0) return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`;
    return `M${x},${top}V${top + h - r}Q${x},${top + h} ${x + r},${top + h}H${x + w - r}Q${x + w},${top + h} ${x + w},${top + h - r}V${top}Z`;
  };
  const bars = useMemo(() => groups.map((g, gi) => g.map((l, li) => l.values.map((v, i) => {
    if (v === null || !isFinite(v) || v === 0) return null;
    const x = i * slot + (slot - groupW * gcount) / 2 + gi * groupW + gap / 2;
    return <path key={`${gi}-${li}-${i}`} d={barPath(x, v, barW)} fill={color(l, v, i)} />;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }))), [groups, width, height, lo, hi]);
  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: "block", fontFamily: FONT }}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const x = e.clientX - r.left;
            const i = Math.floor(x / slot);
            setHover(x < plotW && i >= 0 && i < labels.length ? { i, x, y: e.clientY - r.top } : null);
          }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--st-chart-zero)" : "var(--st-chart-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={plotW + 8} y={y(v) + 4} fontSize={12} fill={text}>{yFormat(v)}</text>
            </g>
          ))}
          {hover && <rect x={hover.i * slot} y={plotTop} width={slot} height={plotH} fill="var(--st-fill)" opacity={0.6} />}
          {bars}
          {!ticks.includes(0) && <line x1={0} x2={plotW} y1={y(0)} y2={y(0)} stroke="var(--st-chart-zero)" shapeRendering="crispEdges" />}
          {vlines?.map((vl, k) => (
            <line key={k} x1={vl.at * slot} x2={vl.at * slot} y1={plotTop - 4} y2={plotTop + plotH} stroke={vl.color} strokeWidth={2} strokeDasharray="3 1.5" />
          ))}
          {(edgeLabels ?? labels).map((l, i, all) => {
            if (i % every !== 0) return null;
            const x = edgeLabels ? i * slot : i * slot + slot / 2;
            // labels on the plot's edges stay inside it
            const anchor = edgeLabels && i === 0 ? "start" : edgeLabels && i === all.length - 1 ? "end" : "middle";
            return <text key={i} x={x} y={height - 8} fontSize={11} fill={text} textAnchor={anchor}>{l}</text>;
          })}
        </svg>
      )}
      {hover && tooltip && (
        <div style={{
          position: "absolute", zIndex: 6, pointerEvents: "none", left: Math.min(hover.x + 14, width - 200), top: Math.max(0, hover.y - 40),
          background: "var(--st-tooltip-bg)", color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12, lineHeight: "18px", whiteSpace: "nowrap",
        }}>{tooltip(hover.i)}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- donut

export function Donut({ parts, size = 180, center }: { parts: { value: number; color: string }[]; size?: number; center: React.ReactNode }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const arcs: { d: string; color: string }[] = [];
  if (total > 0) {
    let a0 = 0;
    const pt = (r: number, a: number) => `${(50 + r * Math.sin(a)).toFixed(3)},${(50 - r * Math.cos(a)).toFixed(3)}`;
    for (const p of parts) {
      if (p.value <= 0) continue;
      const frac = p.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      if (frac >= 0.9999) {
        arcs.push({ d: "M50,0A50,50 0 1,1 49.99,0ZM50,15A35,35 0 1,0 50.01,15Z", color: p.color });
      } else {
        const large = a1 - a0 > Math.PI ? 1 : 0;
        arcs.push({ d: `M${pt(35, a0)}A35,35 0,${large},1 ${pt(35, a1)}L${pt(50, a1)}A50,50 0,${large},0 ${pt(50, a0)}z`, color: p.color });
      }
      a0 = a1;
    }
  }
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", width: size * 0.7, height: size * 0.7, borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{center}</div>
      <svg width={size} height={size} viewBox="0 0 100 100" fillRule="evenodd">
        {total > 0 ? arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} />) : <path d="M50,0A50,50 0 1,1 49.99,0ZM50,15A35,35 0 1,0 50.01,15Z" fill="var(--st-fill)" />}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- legend

export function ChartLegend({ items, justify = "center" }: { items: { color: string; label: string; dashed?: boolean; value?: string }[]; justify?: React.CSSProperties["justifyContent"] }) {
  return (
    <div style={{ display: "flex", justifyContent: justify, gap: 16, flexWrap: "wrap" }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {it.dashed
            ? <svg width={12} height={18} viewBox="0 0 12 18" fill="none" style={{ color: it.color }}><line stroke="currentColor" strokeDasharray="3 1.5" strokeWidth={2} x1={0} x2={12} y1={10} y2={10} /></svg>
            : <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.color }} />}
          <span style={{ color: "var(--st-text-secondary)", fontSize: 12, lineHeight: "16px", whiteSpace: "nowrap" }}>{it.label}</span>
          {it.value && <span style={{ fontSize: 12, fontWeight: 600, lineHeight: "16px", whiteSpace: "nowrap" }}>{it.value}</span>}
        </div>
      ))}
    </div>
  );
}

