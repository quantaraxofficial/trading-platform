"use client";

import React from "react";
import { useEscapeClose } from "../lib/useEscapeClose";
import type { PlotType } from "./chartPrimitives/CandleBodyAwareLine";

// TradingView's plot-type menu (indicator settings → Style, the button beside the plot's
// colour): a "Price line" switch, then the plot styles, each with its icon.

const dashed = { strokeDasharray: "1.5 1.5" };
const ICONS: Record<PlotType, React.ReactNode> = {
  line: <path d="M5 16c2-3 4-3.5 6-1.5s4.5 2.5 6.5.5 3-2 5-2.5" />,
  lineBreaks: <><path d="M5 17l4-3M17.5 16l5-4" /><path d="M13.5 8v13" {...dashed} /></>,
  step: <path d="M5.5 21.5H8V9.5h3.5v8h3V8.5h3.5v9" />,
  stepBreaks: <><path d="M5.5 21.5H8V9.5h3.5v8" /><path d="M14 8v14" {...dashed} /><path d="M16.5 8.5H19v9" /></>,
  stepDiamonds: <><path d="M5.5 21.5H9V9.7M10.7 8H13v12.5h3.6" /><path d="M9 6.3l1.7 1.7L9 9.7 7.3 8zM18.3 18.8l1.7 1.7-1.7 1.7-1.7-1.7z" /></>,
  histogram: <path d="M5.5 21.5v-4M8.5 21.5v-7M11.5 21.5v-10M14.5 21.5v-6M17.5 21.5v-9M20.5 21.5v-7" />,
  cross: <path d="M5 16h5M7.5 13.5v5M10.5 20h5M13 17.5v5M17.5 11h5M20 8.5v5" />,
  area: <path d="M5.5 21.5V15l4-3 5 3.5 4-2 4-4v12z" />,
  areaBreaks: <><path d="M11.5 21.5h-6V15l4-3 2 1.4" /><path d="M13.5 8v14" {...dashed} /><path d="M15.5 14.3l3-1.3 4-4v12.5h-7" /></>,
  columns: <path d="M5.5 15h3v6.5h-3zM11.5 10.5h3v11h-3zM17.5 17h3v4.5h-3z" />,
  circles: <><circle cx="8" cy="17" r="2" /><circle cx="13" cy="21" r="2" /><circle cx="19.5" cy="11" r="2" /></>,
};

export const PLOT_TYPES: { id: PlotType; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "lineBreaks", label: "Line with breaks" },
  { id: "step", label: "Step line" },
  { id: "stepBreaks", label: "Step line with breaks" },
  { id: "stepDiamonds", label: "Step line with diamonds" },
  { id: "histogram", label: "Histogram" },
  { id: "cross", label: "Cross" },
  { id: "area", label: "Area" },
  { id: "areaBreaks", label: "Area with breaks" },
  { id: "columns", label: "Columns" },
  { id: "circles", label: "Circles" },
];

export function PlotTypeIcon({ type, size = 28 }: { type: PlotType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      {ICONS[type] ?? ICONS.line}
    </svg>
  );
}

export function PlotTypeMenu({ value, priceLine, onSelect, onPriceLine, onClose, isDark, style }: {
  value: PlotType;
  priceLine: boolean;
  onSelect: (t: PlotType) => void;
  onPriceLine: (on: boolean) => void;
  onClose: () => void;
  isDark: boolean;
  style?: React.CSSProperties;
}) {
  useEscapeClose(onClose);
  const text = isDark ? "#d1d4dc" : "#0f0f0f";
  const hover = isDark ? "#2a2e39" : "#f2f2f2";
  return (
    <div role="menu" aria-label="Plot type"
      style={{
        width: 205, padding: "4px 0", borderRadius: 6, background: isDark ? "#1e222d" : "#ffffff", color: text,
        boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.2)", fontSize: 14,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif', ...style,
      }}>
      <div role="menuitemcheckbox" aria-checked={priceLine} tabIndex={0} onClick={() => onPriceLine(!priceLine)}
        onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onPriceLine(!priceLine); } }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 40, padding: "0 10px 0 12px", cursor: "pointer" }}>
        Price line
        <span style={{ position: "relative", width: 38, height: 20, borderRadius: 10, transition: "background .15s",
          background: priceLine ? "#2962ff" : isDark ? "#50535e" : "#a3a3a3" }}>
          <span style={{ position: "absolute", top: 3, left: priceLine ? 21 : 3, width: 14, height: 14, borderRadius: "50%", background: "#ffffff", transition: "left .15s" }} />
        </span>
      </div>
      <div style={{ height: 1, margin: "2px 0 6px", background: isDark ? "#363a45" : "#dbdbdb" }} />
      {PLOT_TYPES.map(t => {
        const on = t.id === value;
        return (
          <div key={t.id} role="menuitemradio" aria-checked={on} tabIndex={0}
            onClick={() => onSelect(t.id)}
            onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onSelect(t.id); } }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.background = hover; }}
            onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}
            style={{
              display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 8px", cursor: "pointer",
              background: on ? (isDark ? "#d1d4dc" : "#2e2e2e") : "transparent",
              color: on ? (isDark ? "#131722" : "#ffffff") : text,
            }}>
            <PlotTypeIcon type={t.id} />
            {t.label}
          </div>
        );
      })}
    </div>
  );
}
