"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, BarSeries, AreaSeries, BaselineSeries, ColorType, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { fetchStockData, legendIntervalLabel, remapDrawingPoints } from "./ChartContainer";
import DrawingLayer from "./drawing/DrawingLayer";
import { useDrawing } from "./drawing/core/DrawingContext";
import { chartSettings } from "../lib/chartSettings";
import { applyScaleSide, paneGeometry, sideOfPlacement } from "../lib/priceScaleSide";
import { volumeHistogram } from "../utils/volume";
import { detectPrecision } from "../utils/pricePrecision";
import { attachLayoutSync } from "../lib/layoutSync";
import { useSymbolInfo } from "../utils/symbolInfo";
import { StyleLayer, styleBars, overlayKind, overlayOptions, overlayPoint, labelColor, styleOf } from "./chartPrimitives/ChartStyles";
import { DRAWN_TYPES, BRICK_TYPES, type ChartType } from "../lib/chartType";
import { buildBricks } from "../lib/bricks";
import { quietChartUpdates } from "./drawing/core/chartFrame";
import { mainScaleSide } from "../lib/priceScaleSide";

// seconds in an interval ("15min", "1h", "1day"…)
const intervalSeconds = (iv: string) => { const m = /^(\d+)(min|h|day|week|month)$/.exec(iv); if (!m) return 60; return +m[1] * ({ min: 60, h: 3600, day: 86400, week: 604800, month: 2592000 } as any)[m[2]]; };

// A chart in a multi-chart layout that isn't the active one: its own symbol and interval, candles
// and volume, legend, pan / zoom and the layout's sync. Clicking it makes it the active chart
// (which then gets the full toolbar, drawings, indicators and trading). Drawings are synced in the
// layout: a chart showing the active chart's symbol shows its drawings too (read-only here).

type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

export default function SecondaryChart({ index, symbol, intervalLabel, interval, theme, onActivate, showVolume = false, chartType = "candle" }: {
  index: number; symbol: string; interval: string; intervalLabel: string; theme: string; onActivate: (index: number) => void; showVolume?: boolean;
  chartType?: ChartType;   // this chart's own type (each chart of a layout keeps its own, as on TradingView)
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<Bar[]>([]);          // the bars shown (built ones for Renko etc.)
  const rawRef = useRef<Bar[]>([]);           // the time bars
  const volumeRef = useRef<any>(null);
  const layerRef = useRef<StyleLayer | null>(null);
  const overlayRef = useRef<{ kind: string; api: any; baseLine?: any } | null>(null);
  const [rawVersion, setRawVersion] = useState(0);
  const seriesStyles = chartSettings.useValue().series;
  const [hover, setHover] = useState<Bar | null>(null);
  const [last, setLast] = useState<Bar | null>(null);
  const [prec, setPrec] = useState(2);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");
  const info = useSymbolInfo(symbol);
  const [api, setApi] = useState<{ chart: IChartApi; series: ISeriesApi<"Candlestick"> } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [barsVersion, setBarsVersion] = useState(0);
  const side = sideOfPlacement(chartSettings.useValue().scalesPlacement);
  const { drawings, symbol: drawingSymbol } = useDrawing();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const dark = theme === "dark";
    const colors = (window as any).__chartColors || {};
    const canvas = colors.canvas || {};
    const candle = colors.candle || {};
    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: canvas.background || (dark ? "#131722" : "#ffffff") }, textColor: canvas.text || (dark ? "#d1d4dc" : "#131722"), attributionLogo: false },
      grid: { vertLines: { color: canvas.gridVert || (dark ? "#1e222d" : "#f0f3fa") }, horzLines: { color: canvas.gridHorz || (dark ? "#1e222d" : "#f0f3fa") } },
      width: el.clientWidth, height: el.clientHeight,
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: canvas.lines || (dark ? "#2a2e39" : "#e0e3eb") },
      rightPriceScale: { borderColor: canvas.lines || (dark ? "#2a2e39" : "#e0e3eb") },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: candle.upColor || "#089981", downColor: candle.downColor || "#f23645",
      borderUpColor: candle.borderUpColor || candle.upColor || "#089981", borderDownColor: candle.borderDownColor || candle.downColor || "#f23645",
      wickUpColor: candle.wickUpColor || candle.upColor || "#089981", wickDownColor: candle.wickDownColor || candle.downColor || "#f23645",
    });
    // Volume (when the Volume indicator is on), as the main chart draws it: an overlay in the bottom fifth
    const volume = showVolume ? chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false }) : null;
    volume?.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeRef.current = volume;
    const layer = new StyleLayer(() => barsRef.current as any, () => undefined);
    series.attachPrimitive(layer as any);
    layerRef.current = layer;
    overlayRef.current = null;
    let alive = true;
    setStatus("loading");
    fetchStockData(symbol, interval).then((data: Bar[]) => {
      if (!alive) return;
      const bars = [...data].sort((a, b) => a.time - b.time).filter((b, i, a) => i === 0 || b.time !== a[i - 1].time);
      rawRef.current = bars;
      barsRef.current = bars;
      if (!bars.length) { setStatus("empty"); return; }
      const p = detectPrecision(bars, symbol);
      setPrec(p);
      series.applyOptions({ priceFormat: { type: "price", precision: p, minMove: Math.pow(10, -p) } });
      setStatus("ready");
      setRawVersion(v => v + 1);   // drawn per the chart type below
    }).catch(() => { if (alive) setStatus("empty"); });
    chart.subscribeCrosshairMove((param: any) => {
      const d = param?.seriesData?.get?.(series);
      setHover(d && typeof d.open === "number" ? d : null);
    });
    const detach = attachLayoutSync(chart, series, () => barsRef.current, `cell-${index}`);
    // read-only, for checks (like window.__chartInstance)
    const reg = ((window as any).__secondaryCharts ||= {});
    reg[index] = { chart, series };
    const ro = new ResizeObserver(() => { chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }); setSize({ width: el.clientWidth, height: el.clientHeight }); });
    ro.observe(el);
    setApi({ chart, series });
    // (removed a tick later: the drawings shown on it unsubscribe from it in their own cleanups,
    // which React runs after this one)
    return () => { alive = false; detach(); ro.disconnect(); setApi(null); if (reg[index]?.chart === chart) delete reg[index]; setTimeout(() => chart.remove(), 0); };
  }, [symbol, interval, theme, index, showVolume]);

  // This chart's type, drawn as the active chart draws it (chartPrimitives/ChartStyles): the bars
  // reshaped or built, an extra series where the type needs one, the style layer
  const styleKey = JSON.stringify(styleOf(seriesStyles, chartType));
  useEffect(() => quietChartUpdates(() => {
    if (!api || !rawRef.current.length) return;
    const { chart, series } = api;
    const type = DRAWN_TYPES.has(chartType) ? chartType : "candle";
    const st = styleOf(seriesStyles, type);
    const raw = rawRef.current;
    const last = raw[raw.length - 1];
    const lastOpen = Date.now() / 1000 < last.time + intervalSeconds(interval);
    const shown: Bar[] = BRICK_TYPES.has(type) ? buildBricks(type, raw, Math.pow(10, -prec), st, lastOpen) : raw;
    barsRef.current = shown;
    series.setData(styleBars(type, st, shown) as any);
    volumeRef.current?.setData(volumeHistogram(shown, "rgba(8, 153, 129, 0.5)", "rgba(242, 54, 69, 0.5)") as any);
    // the extra series
    const kind = overlayKind(type, st);
    if (overlayRef.current && overlayRef.current.kind !== kind) { try { chart.removeSeries(overlayRef.current.api); } catch { /* gone */ } overlayRef.current = null; }
    if (kind && !overlayRef.current) {
      const Ctor: any = kind === "bar" ? BarSeries : kind === "area" ? AreaSeries : kind === "baseline" ? BaselineSeries : LineSeries;
      overlayRef.current = { kind, api: chart.addSeries(Ctor, { priceScaleId: mainScaleSide(chart), priceFormat: series.options().priceFormat } as any) };
    }
    const o = overlayRef.current;
    if (o) {
      o.api.applyOptions(overlayOptions(type, st));
      o.api.setData(shown.map((b, i) => overlayPoint(type, st, b, i > 0 ? shown[i - 1] : null)));
      if (kind === "label") o.api.applyOptions({ color: labelColor(type, st, shown[shown.length - 1], shown[shown.length - 2]) });
    }
    const clear = "transparent";
    const candle = ((window as any).__chartColors || {}).candle || {};
    if (o && type !== "ha") series.applyOptions({ upColor: clear, downColor: clear, borderUpColor: clear, borderDownColor: clear, wickUpColor: clear, wickDownColor: clear, lastValueVisible: false, priceLineVisible: false });
    else series.applyOptions({
      upColor: candle.upColor || "#089981", downColor: candle.downColor || "#f23645",
      borderUpColor: candle.borderUpColor || candle.upColor || "#089981", borderDownColor: candle.borderDownColor || candle.downColor || "#f23645",
      wickUpColor: candle.wickUpColor || candle.upColor || "#089981", wickDownColor: candle.wickDownColor || candle.downColor || "#f23645",
      lastValueVisible: !o, priceLineVisible: !o,
    });
    layerRef.current?.setType(type, st);
    setLast(shown[shown.length - 1] || null);
    setBarsVersion(v => v + 1);
    // Baseline: the base level at its percentage of the visible prices
    if (type !== "baseline" || !o) return;
    let raf = 0;
    const place = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vr = series.priceScale().getVisibleRange?.() ?? null;
        if (!vr) return;
        const base = vr.from + (vr.to - vr.from) * ((st.level ?? 50) / 100);
        o.api.applyOptions({ baseValue: { type: "price", price: base } });
        if (o.baseLine) o.api.removePriceLine(o.baseLine);
        o.baseLine = o.api.createPriceLine({ price: base, color: "#8C8C8C", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      });
    };
    place();
    chart.timeScale().subscribeVisibleLogicalRangeChange(place);
    return () => { cancelAnimationFrame(raf); try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(place); } catch { /* removed */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [api, chartType, styleKey, rawVersion, prec]);

  // The price scale's side follows Scales placement, as on the active chart
  const [, setLaidOut] = useState(0);
  useEffect(() => {
    if (!api) return;
    applyScaleSide(api.chart, side);
    const raf = requestAnimationFrame(() => setLaidOut(n => n + 1));
    return () => cancelAnimationFrame(raf);
  }, [api, side]);
  const leftScaleW = side === "left" && api ? paneGeometry(api.chart).scaleW : 0;

  // The active chart's drawings, when this chart shows the same symbol — placed by their times on
  // this chart's own bars (its interval may differ)
  const mirrored = useMemo(() => {
    if (symbol !== drawingSymbol || !drawings.length || !barsRef.current.length) return null;
    return remapDrawingPoints(drawings, barsRef.current, symbol, (window as any).__chartFullData || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, drawingSymbol, symbol, barsVersion]);

  const bar = hover || last;
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: prec, maximumFractionDigits: prec });
  const up = bar ? bar.close >= bar.open : true;
  const valColor = up ? "#089981" : "#f23645";
  const ink = theme === "dark" ? "#d1d4dc" : "#131722";
  return (
    // Made active once the click is over (this chart is replaced by the full one then; doing it on
    // mousedown removed it while lightweight-charts was still handling that mousedown)
    <div onClickCapture={() => setTimeout(() => onActivate(index), 0)} style={{ position: "absolute", inset: 0 }} data-secondary-chart={index}>
      <div ref={boxRef} style={{ position: "absolute", inset: 0 }} />
      {api && mirrored && size.width > 0 && (
        <DrawingLayer chart={api.chart} series={api.series} width={size.width} height={size.height} theme={theme}
          readOnly drawingsOverride={mirrored} barsOf={() => barsRef.current} />
      )}
      <div style={{ position: "absolute", left: 10 + leftScaleW, top: 6, zIndex: 11, display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, color: ink, pointerEvents: "none", whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 600 }}>{info.description || symbol}</span>
        <span>· {legendIntervalLabel(interval)}{info.exchange ? ` · ${info.exchange}` : ""}</span>
        {bar && (
          <span style={{ fontSize: 12 }}>
            O<span style={{ color: valColor }}>{fmt(bar.open)}</span> H<span style={{ color: valColor }}>{fmt(bar.high)}</span>{" "}
            L<span style={{ color: valColor }}>{fmt(bar.low)}</span> C<span style={{ color: valColor }}>{fmt(bar.close)}</span>
          </span>
        )}
      </div>
      {status !== "ready" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tv-color-text-muted)", fontSize: 13, pointerEvents: "none" }}>
          {status === "loading" ? "Loading…" : "No data"}
        </div>
      )}
    </div>
  );
}
