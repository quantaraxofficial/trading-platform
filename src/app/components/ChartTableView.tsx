"use client";

// "Table view" from the chart's right-click menu: the chart's bars as a table (newest first)
// over the chart pane — date, OHLC, change and volume — as TradingView switches the chart to a
// table. Only the rows in view are rendered, so long histories stay light. Esc or × closes it.

import React, { useMemo, useRef, useState } from "react";
import { useEscapeClose } from "../lib/useEscapeClose";

type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
const ROW = 28;

function fmtTime(sec: number, tz: string) {
  const d = new Date(sec * 1000);
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz && tz !== "exchange" ? tz : undefined, year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}
function fmtVol(v?: number) {
  if (v === undefined || v === null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  for (const [s, u] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]] as [number, string][]) if (a >= s) return `${(v / s).toFixed(2)}${u}`;
  return String(Math.round(v));
}

export default function ChartTableView({ bars, precision, theme, tz, onClose }: { bars: Bar[]; precision: number; theme: string; tz: string; onClose: () => void }) {
  useEscapeClose(onClose);
  const dark = theme === "dark";
  const c = dark
    ? { bg: "#131722", text: "#d1d4dc", muted: "#787b86", border: "#2a2e39", head: "#1e222d", up: "#089981", down: "#f23645", hover: "#2a2e39" }
    : { bg: "#ffffff", text: "#0f0f0f", muted: "#787b86", border: "#ebebeb", head: "#f8f9fd", up: "#089981", down: "#f23645", hover: "#f2f2f2" };
  const rows = useMemo(() => [...bars].reverse(), [bars]);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const first = Math.max(0, Math.floor(scrollTop / ROW) - 5);
  const last = Math.min(rows.length, first + Math.ceil(height / ROW) + 10);
  const cols = "minmax(150px, 1.4fr) repeat(4, minmax(80px, 1fr)) minmax(80px, 1fr) minmax(80px, 1fr) minmax(80px, 1fr)";
  const f = (n: number) => n.toFixed(precision);

  return (
    <div role="region" aria-label="Table view" data-testid="chart-table-view"
      style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", background: c.bg, color: c.text, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 38, padding: "0 8px 0 16px", borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Table view <span style={{ color: c.muted, fontWeight: 400 }}>· {rows.length.toLocaleString()} bars</span></span>
        <button type="button" aria-label="Close table view" title="Back to chart" onClick={onClose}
          style={{ width: 28, height: 28, border: "none", borderRadius: 4, background: "transparent", color: c.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M4 4l10 10M14 4L4 14" /></svg>
        </button>
      </div>
      <div role="row" style={{ display: "grid", gridTemplateColumns: cols, height: 32, alignItems: "center", padding: "0 16px", background: c.head, color: c.muted, fontSize: 12, borderBottom: `1px solid ${c.border}`, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {["Date", "Open", "High", "Low", "Close", "Change", "Change %", "Volume"].map((h, i) => <span key={h} role="columnheader" style={{ textAlign: i ? "right" : "left" }}>{h}</span>)}
      </div>
      <div ref={el => { scroller.current = el; if (el && el.clientHeight && el.clientHeight !== height) setHeight(el.clientHeight); }}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div role="rowgroup" style={{ height: rows.length * ROW, position: "relative" }}>
          {rows.slice(first, last).map((b, k) => {
            const i = first + k;
            const prev = rows[i + 1];
            const ch = prev ? b.close - prev.close : 0;
            const pct = prev && prev.close ? (ch / prev.close) * 100 : 0;
            const col = ch > 0 ? c.up : ch < 0 ? c.down : c.text;
            return (
              <div key={b.time} role="row" style={{ position: "absolute", top: i * ROW, left: 0, right: 0, height: ROW, display: "grid", gridTemplateColumns: cols, alignItems: "center", padding: "0 16px", borderBottom: `1px solid ${c.border}`, fontVariantNumeric: "tabular-nums" }}
                onMouseEnter={e => { e.currentTarget.style.background = c.hover; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                <span>{fmtTime(b.time, tz)}</span>
                <span style={{ textAlign: "right" }}>{f(b.open)}</span>
                <span style={{ textAlign: "right" }}>{f(b.high)}</span>
                <span style={{ textAlign: "right" }}>{f(b.low)}</span>
                <span style={{ textAlign: "right" }}>{f(b.close)}</span>
                <span style={{ textAlign: "right", color: col }}>{prev ? `${ch > 0 ? "+" : ch < 0 ? "−" : ""}${f(Math.abs(ch))}` : "—"}</span>
                <span style={{ textAlign: "right", color: col }}>{prev ? `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%` : "—"}</span>
                <span style={{ textAlign: "right" }}>{fmtVol(b.volume)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
