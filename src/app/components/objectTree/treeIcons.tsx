"use client";
// TradingView's Object tree glyphs (copied from its panel): the symbol's candles, an indicator,
// a strategy, the toolbar's buttons, and the rows' lock / eye / trash buttons
import React from "react";
import { DRAWING_TOOL_BY_TYPE } from "../drawing/toolCatalog";

export const MainSeriesIcon = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="currentColor" aria-hidden><path d="M17 11v6h3v-6h-3zm-.5-1h4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5z" /><path d="M18 7h1v3.5h-1zm0 10.5h1V21h-1z" /><path d="M9 8v12h3V8H9zm-.5-1h4a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z" /><path d="M10 4h1v3.5h-1zm0 16.5h1V24h-1z" /></svg>
);
export const IndicatorIcon = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden><path stroke="currentColor" d="M5.5 16.5l4.586-4.586a2 2 0 0 1 2.828 0l3.172 3.172a2 2 0 0 0 2.828 0L23.5 10.5" /></svg>
);
export const StrategyIcon = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden><path stroke="currentColor" d="M4.5 12.5l4.59-4.59a2 2 0 0 1 2.83 0l3.17 3.17a2 2 0 0 0 2.83 0L22.5 6.5m-8 9.5v5.5M12 19l2.5 2.5L17 19m4.5 3v-5.5M19 19l2.5-2.5L24 19" /></svg>
);
export const FolderIcon = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden><path stroke="currentColor" d="M5.5 6.5h4l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM4.5 11.5h17" /></svg>
);
export const GroupButtonIcon = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden><path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M5.5 6C4.67 6 4 6.67 4 7.5V20.5c0 .83.67 1.5 1.5 1.5H16v-1H5.5a.5.5 0 0 1-.5-.5V12h16v1h1V9.5c0-.83-.67-1.5-1.5-1.5h-8.8L9.86 6.15 9.71 6H5.5zM21 11H5V7.5c0-.28.22-.5.5-.5h3.8l1.85 1.85.14.15h9.21c.28 0 .5.22.5.5V11zm1 11v-3h3v-1h-3v-3h-1v3h-3v1h3v3h1z" /></svg>
);
export const CloneCopyIcon = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden><path stroke="currentColor" d="M8 9.5H6.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V20m-8-1.5h11a1 1 0 0 0 1-1v-11a1 1 0 0 0-1-1h-11a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1z" /></svg>
);
export const MoveToIcon = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden><path stroke="currentColor" d="M21.106 12.5H6.894a.5.5 0 0 1-.318-.886L14 5.5l7.424 6.114a.5.5 0 0 1-.318.886zM21.106 16.5H6.894a.5.5 0 0 0-.318.886L14 23.5l7.424-6.114a.5.5 0 0 0-.318-.886z" /></svg>
);
export const ManageDrawingsIcon = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden><path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M4 6.5C4 5.67 4.67 5 5.5 5h4.2l.15.15L11.71 7h8.79c.83 0 1.5.67 1.5 1.5V11H5V20.5c0 .28.22.5.5.5H9v1H5.5A1.5 1.5 0 0 1 4 20.5V6.5zM5 10h16V8.5a.5.5 0 0 0-.5-.5h-9.2l-.15-.15L9.29 6H5.5a.5.5 0 0 0-.5.5V10z" /><path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M14.85 16.85l3.5-3.5-.7-.7-3.5 3.5a1.5 1.5 0 1 0 0 2.7l1.64 1.65-1.64 1.65a1.5 1.5 0 1 0 .7.7l1.65-1.64 1.65 1.64a1.5 1.5 0 1 0 2.7 0l3.5-3.5-.7-.7-3.5 3.5a1.5 1.5 0 0 0-1.3 0l-1.64-1.65 4.14-4.15-.7-.7-4.15 4.14-1.65-1.64a1.5 1.5 0 0 0 0-1.3zm-.85.65a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm6 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm-6.5.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z" /></svg>
);
export const EyeIcon = ({ off }: { off?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
    <path d="M1.5 9c1.9-3.3 4.4-5 7.5-5s5.6 1.7 7.5 5c-1.9 3.3-4.4 5-7.5 5S3.4 12.3 1.5 9z" /><circle cx="9" cy="9" r="2.5" />
    {off && <path d="M3 15L15 3" />}
  </svg>
);
export const LockIcon = ({ locked }: { locked?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
    <rect x="4.5" y="8.5" width="9" height="7" rx="1" />
    <path d={locked ? "M6.5 8.5v-2a2.5 2.5 0 0 1 5 0v2" : "M6.5 8.5v-2a2.5 2.5 0 0 1 5 0"} />
  </svg>
);
export const TrashIcon = () => (
  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden><path fill="currentColor" d="M12 4h3v1h-1.04l-.88 9.64a1.5 1.5 0 0 1-1.5 1.36H6.42a1.5 1.5 0 0 1-1.5-1.36L4.05 5H3V4h3v-.5C6 2.67 6.67 2 7.5 2h3c.83 0 1.5.67 1.5 1.5V4ZM7.5 3a.5.5 0 0 0-.5.5V4h4v-.5a.5.5 0 0 0-.5-.5h-3ZM5.05 5l.87 9.55a.5.5 0 0 0 .5.45h5.17a.5.5 0 0 0 .5-.45L12.94 5h-7.9Z" /></svg>
);
export const Chevron = ({ open }: { open: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .1s" }}><path d="M2 3.5l3 3 3-3" /></svg>
);

// A drawing as the tree names it (TradingView's object names, not the toolbar's)
const TREE_NAMES: Record<string, string> = {
  trendline: "Trendline", fibonacci: "Fib retracement", long_position: "Long position", short_position: "Short position",
  text: "Text", measure: "Measure",
};
export function drawingTreeName(type: string): string {
  if (TREE_NAMES[type]) return TREE_NAMES[type];
  const label = DRAWING_TOOL_BY_TYPE[type]?.label;
  if (!label) return type.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
  return label.charAt(0) + label.slice(1).replace(/\b([A-Z])([a-z])/g, (_, a, b) => a.toLowerCase() + b);
}
export function DrawingIcon({ type }: { type: string }) {
  const t = DRAWING_TOOL_BY_TYPE[type];
  return <>{t ? t.icon() : <IndicatorIcon />}</>;
}

// "Oct 6, 2026 00:33 GMT+5:30", as the tree's tooltip and Manage layout drawings write it
export function formatModified(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const off = -d.getTimezoneOffset();
  const gmt = `GMT${off >= 0 ? "+" : "-"}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? `:${String(Math.abs(off) % 60).padStart(2, "0")}` : ""}`;
  return `${date} ${time} ${gmt}`;
}
