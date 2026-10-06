"use client";
// The Data window: the date and time of the bar under the crosshair (the last bar when the mouse
// is off the chart), the symbol's open / high / low / close and changes, then each indicator's
// values — following the crosshair, as TradingView's does
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { chartObjects } from "../../lib/chartObjects";
import { MainSeriesIcon, IndicatorIcon, StrategyIcon } from "./treeIcons";

const noop = () => () => {};
export default function DataWindow() {
  const { dataWindow, hover } = chartObjects.useValue();
  // re-read on every crosshair move, and every second for the live last bar
  useSyncExternalStore(hover ? hover.subscribe : noop, () => (hover as any)?.get?.() ?? null, () => null);
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  const data = dataWindow ? dataWindow() : null;
  const line = (label: string, value: string, color?: string, key?: string) => (
    <div key={key ?? label} data-dw-row={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 26, fontSize: 13 }}>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--tv-color-text)" }}>{label}</span>
      <span style={{ whiteSpace: "nowrap", color: color || "var(--tv-color-text)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
  if (!data) return <div style={{ padding: 16, fontSize: 13, color: "var(--tv-color-text-muted)" }}>No data</div>;
  return (
    <div role="tabpanel" aria-label="Data window" style={{ flex: 1, overflowY: "auto", padding: "4px 16px 16px" }}>
      {line("Date", data.date)}
      {data.time && line("Time", data.time)}
      {data.sections.map(s => (
        <div key={s.id} data-dw-section={s.id} style={{ borderTop: "1px solid var(--tv-color-border)", marginTop: 8, paddingTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 32, fontSize: 14, fontWeight: 600 }}>
            <span style={{ width: 28, height: 28, flexShrink: 0, marginLeft: -6 }}>{s.kind === "main" ? <MainSeriesIcon /> : s.kind === "strategy" ? <StrategyIcon /> : <IndicatorIcon />}</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
          </div>
          {s.rows.map((r, i) => line(r.label, r.value, s.kind === "main" ? undefined : r.color, `${s.id}:${i}`))}
        </div>
      ))}
    </div>
  );
}
