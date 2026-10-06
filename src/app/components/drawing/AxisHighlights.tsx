"use client";

// What TradingView shows on the axes for drawings:
//  • the selected drawing: a label at each of its points on the price axis and the time axis, in
//    blue, with a light blue band spanning its range on each axis;
//  • Long / Short positions: their target, entry and stop prices always labelled on the price
//    axis (green, grey, red); selected, they get the bands and the start/end time labels too;
//  • Horizontal / Vertical / Cross lines: their price and/or time always labelled, in the
//    line's colour (TradingView's "Show price" / "Show time", on by default).

import React, { useEffect, useState } from "react";
import { useChartTick } from "./core/useChartTick";
import { paneGeometry } from "../../lib/priceScaleSide";

const BLUE = "#2962ff";
const BAND = "rgba(41, 98, 255, 0.25)";
const TARGET = "#089981";
const ENTRY = "#787b86";
const STOP = "#f23645";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const INTERVAL_SEC: Record<string, number> = { min: 60, h: 3600, day: 86400, week: 604800, month: 2629746 };
function intervalSeconds(interval: string): number {
  const m = interval.match(/^(\d+)(min|h|day|week|month)$/);
  return m ? Number(m[1]) * INTERVAL_SEC[m[2]] : 86400;
}

// The time at a logical bar index: the bar's own time, or extrapolated past either end of the data
function timeAtLogical(logical: number): number | null {
  const bars: { time: number }[] = (window as any).__chartFullData || [];
  if (!bars.length) return null;
  const i = Math.round(logical);
  if (i >= 0 && i < bars.length) return bars[i].time;
  const step = intervalSeconds((window as any).__chartInterval || "1day");
  return i < 0 ? bars[0].time + i * step : bars[bars.length - 1].time + (i - (bars.length - 1)) * step;
}

// "Tue 01 Apr '25" on daily and longer bars (which sit at UTC midnight), with the time on intraday
function formatAxisTime(t: number): string {
  const daily = /day|week|month/.test((window as any).__chartInterval || "1day");
  const d = new Date(t * 1000);
  // intraday times in the chart's timezone (bars are real UTC timestamps)
  const zoned = (() => {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: (window as any).__chartTimezone || undefined, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
      return [WEEKDAYS.indexOf(p.weekday), +p.day, +p.month - 1, +p.year, +p.hour % 24, +p.minute];
    } catch { return [d.getDay(), d.getDate(), d.getMonth(), d.getFullYear(), d.getHours(), d.getMinutes()]; }
  })();
  const [wd, day, mon, yr, h, mi] = daily
    ? [d.getUTCDay(), d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear(), d.getUTCHours(), d.getUTCMinutes()]
    : zoned;
  const base = `${WEEKDAYS[wd]} ${String(day).padStart(2, "0")} ${MONTHS[mon]} '${String(yr).slice(-2)}`;
  return daily ? base : `${base}  ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

type Drawing = { id: string; type: string; points: { logical: number; price: number }[]; stroke?: string; showPrice?: boolean; showTime?: boolean };
const INFINITE_LINES = ["horizontal_line", "vertical_line", "cross_line"];
type PriceLabel = { price: number; color: string };
type TimeLabel = { logical: number; color: string };

// The price and time labels a drawing puts on the axes
function axisPoints(d: Drawing): { prices: PriceLabel[]; times: number[]; timeColor?: string } {
  const pts = d.points || [];
  if (INFINITE_LINES.includes(d.type)) {
    if (!pts.length) return { prices: [], times: [] };
    const color = d.stroke || BLUE;
    return {
      prices: d.type !== "vertical_line" && d.showPrice !== false ? [{ price: pts[0].price, color }] : [],
      times: d.type !== "horizontal_line" && d.showTime !== false ? [pts[0].logical] : [],
      timeColor: color,
    };
  }
  if (d.type === "long_position" || d.type === "short_position") {
    if (pts.length < 4) return { prices: [], times: [] };
    return {
      prices: [{ price: pts[2].price, color: TARGET }, { price: pts[0].price, color: ENTRY }, { price: pts[3].price, color: STOP }],
      times: [pts[0].logical, pts[1].logical],
    };
  }
  if (d.type === "measure" || pts.length === 0) return { prices: [], times: [] };
  // Freehand shapes (brush, path…) have many points: their extremes stand for them
  if (pts.length > 4) {
    const ps = pts.map(p => p.price), ls = pts.map(p => p.logical);
    return { prices: [{ price: Math.max(...ps), color: BLUE }, { price: Math.min(...ps), color: BLUE }], times: [Math.min(...ls), Math.max(...ls)] };
  }
  const prices = pts.map(p => ({ price: p.price, color: BLUE }));
  const times = d.type === "horizontal_line" ? [] : pts.map(p => p.logical);
  return { prices, times };
}

export default function AxisHighlights({ chart, series, drawings, selectedIds, width, height }: {
  chart: any; series: any; drawings: Drawing[]; selectedIds: string[]; width: number; height: number;
}) {
  useChartTick(chart, series);
  // Vertical scrolling / autoscale moves prices without moving the time scale
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener("tv-price-scale-changed", bump);
    const onWheel = () => requestAnimationFrame(bump);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => { window.removeEventListener("tv-price-scale-changed", bump); window.removeEventListener("wheel", onWheel); };
  }, []);
  if (!chart || !series) return null;

  let psW = 0, tsH = 0, side = "right", paneLeft = 0;
  try { ({ scaleW: psW, side, paneLeft } = paneGeometry(chart)); tsH = chart.timeScale().height(); } catch { return null; }
  if (!psW || !tsH) return null;
  const paneW = width - psW;
  const paneH = height - tsH;
  const prec: number = (window as any).__pricePrecision ?? 2;
  const fmtPrice = (p: number) => p.toLocaleString("en-US", { minimumFractionDigits: prec, maximumFractionDigits: prec });
  const yOf = (p: number): number | null => { const y = series.priceToCoordinate(p); return y === null ? null : y; };
  const xOf = (l: number): number | null => { const x = chart.timeScale().logicalToCoordinate(l); return x === null ? null : x; };

  const priceLabels: { y: number; text: string; color: string; key: string }[] = [];
  const timeLabels: { x: number; text: string; key: string; color: string }[] = [];
  const priceBands: { top: number; bottom: number; key: string }[] = [];
  const timeBands: { left: number; right: number; key: string }[] = [];

  for (const d of drawings) {
    const selected = selectedIds.includes(d.id);
    const isPosition = d.type === "long_position" || d.type === "short_position";
    const isInfinite = INFINITE_LINES.includes(d.type);
    if (!selected && !isPosition && !isInfinite) continue;
    const { prices, times, timeColor } = axisPoints(d);
    const ys = prices.map(p => yOf(p.price)).filter((y): y is number => y !== null);
    prices.forEach((p, i) => {
      const y = yOf(p.price);
      if (y !== null) priceLabels.push({ y, text: fmtPrice(p.price), color: p.color, key: `${d.id}-p${i}` });
    });
    if (isInfinite) {
      // always-on time label, no bands
      times.forEach((l, i) => {
        const x = xOf(l);
        const t = timeAtLogical(l);
        if (x !== null && t !== null) timeLabels.push({ x, text: formatAxisTime(t), key: `${d.id}-t${i}`, color: timeColor || BLUE });
      });
      continue;
    }
    if (!selected) continue;
    if (ys.length >= 2) priceBands.push({ top: Math.min(...ys), bottom: Math.max(...ys), key: `${d.id}-pb` });
    const xs: number[] = [];
    times.forEach((l, i) => {
      const x = xOf(l);
      const t = timeAtLogical(l);
      if (x === null || t === null) return;
      xs.push(x);
      timeLabels.push({ x, text: formatAxisTime(t), key: `${d.id}-t${i}`, color: BLUE });
    });
    if (xs.length >= 2) timeBands.push({ left: Math.min(...xs), right: Math.max(...xs), key: `${d.id}-tb` });
  }
  if (!priceLabels.length && !timeLabels.length) return null;

  const labelFont: React.CSSProperties = { fontSize: 12, lineHeight: "20px", color: "#ffffff", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  return (
    <>
      <div aria-hidden style={{ position: "absolute", left: side === "left" ? 0 : paneW, top: 0, width: psW, height: paneH, pointerEvents: "none", overflow: "hidden", zIndex: 11 }}>
        {priceBands.map(b => <div key={b.key} style={{ position: "absolute", left: 0, right: 0, top: b.top, height: b.bottom - b.top, background: BAND }} />)}
        {priceLabels.map(l => (
          <div key={l.key} data-axis-label="price" style={{ ...labelFont, position: "absolute", left: 0, width: psW, top: Math.round(l.y - 10), height: 20, padding: "0 6px", boxSizing: "border-box", background: l.color, borderRadius: 2 }}>
            {l.text}
          </div>
        ))}
      </div>
      {(timeBands.length > 0 || timeLabels.length > 0) && (
        <div aria-hidden style={{ position: "absolute", left: paneLeft, top: paneH, width: paneW, height: tsH, pointerEvents: "none", overflow: "hidden", zIndex: 11 }}>
          {timeBands.map(b => <div key={b.key} style={{ position: "absolute", top: 0, bottom: 0, left: b.left, width: b.right - b.left, background: BAND }} />)}
          {timeLabels.map(l => (
            <div key={l.key} data-axis-label="time" style={{ ...labelFont, position: "absolute", top: Math.max(0, Math.round((tsH - 22) / 2)), left: l.x, transform: "translateX(-50%)", height: 22, lineHeight: "22px", padding: "0 8px", background: l.color, borderRadius: 3 }}>
              {l.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
