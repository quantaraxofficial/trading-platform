"use client";

// Settings for a Pine script on the chart (an indicator's or a strategy's): Inputs, Properties
// (strategies) and Style, built from the script's own declared inputs. Laid out like the chart's
// other settings dialogs (EMA, Volume), as on TradingView: label on the left, control on the right,
// grey upper-case group headings, a "Defaults" menu, Cancel / Ok.

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown } from "lucide-react";
import type { PineInputMeta } from "../lib/pineScriptEngine";
import { useEscapeClose } from "../lib/useEscapeClose";
import { PaletteInput } from "./drawing/ui/PaletteInput";
import TvSelect from "@/app/components/ui/TvSelect";
import { CheckBox, NumberField, Select, Info } from "./EmaSettingsModal";

interface PineSettingsModalProps {
  theme?: string;
  scriptName: string;
  inputsMeta: PineInputMeta[];
  currentOverrides: Record<string, any>;
  initialCapital: number;
  pyramiding?: number;
  defaultQtyValue?: number;
  defaultQtyType?: string;
  plots: { title: string; color: string }[];
  onApply: (overrides: Record<string, any>, capital: number, plotColors: Record<string, string>) => void;
  onClose: () => void;
  showProperties?: boolean;   // strategies' Properties tab (initial capital); indicators have none
}

// A curated set of Pine timeframe strings for the dropdown — this is just a
// convenience list of common choices; any value the script already has
// (even one not in this list, e.g. a custom "45") still round-trips fine
// since the control falls back to showing the raw value.
const TIMEFRAME_OPTIONS: { label: string; value: string }[] = [
  { label: "1 minute", value: "1" }, { label: "3 minutes", value: "3" }, { label: "5 minutes", value: "5" },
  { label: "15 minutes", value: "15" }, { label: "30 minutes", value: "30" }, { label: "45 minutes", value: "45" },
  { label: "1 hour", value: "60" }, { label: "2 hours", value: "120" }, { label: "3 hours", value: "180" }, { label: "4 hours", value: "240" },
  { label: "1 day", value: "D" }, { label: "1 week", value: "W" }, { label: "1 month", value: "M" },
  { label: "3 months", value: "3M" }, { label: "6 months", value: "6M" }, { label: "12 months", value: "12M" },
];

type Tab = "Inputs" | "Properties" | "Style";

export default function PineSettingsModal({
  theme = "dark", scriptName, inputsMeta, currentOverrides, initialCapital, pyramiding, defaultQtyValue, defaultQtyType, showProperties = true,
  plots, onApply, onClose,
}: PineSettingsModalProps) {
  useEscapeClose(onClose);
  const [tab, setTab] = useState<Tab>("Inputs");
  const [draft, setDraft] = useState<Record<string, any>>(() => {
    const d: Record<string, any> = {};
    for (const m of inputsMeta) d[m.varName] = Object.prototype.hasOwnProperty.call(currentOverrides, m.varName) ? currentOverrides[m.varName] : m.value;
    return d;
  });
  const [capital, setCapital] = useState<number>(initialCapital);
  const [plotColors, setPlotColors] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    plots.forEach((p) => { d[p.title] = p.color; });
    return d;
  });

  // The same colours and measurements as the EMA / Volume dialogs
  const isDark = theme === "dark";
  const bgColor = isDark ? "#1e222d" : "#ffffff";
  const textColor = isDark ? "#d1d4dc" : "#131722";
  const borderColor = isDark ? "#2a2e39" : "#e0e3eb";
  const fieldBorder = isDark ? "#434651" : "#d1d4dc";
  const muted = "#787b86";
  const accent = isDark ? "#d1d4dc" : "#131722";      // TradingView's checkboxes are the text colour
  const field = { bg: isDark ? "#1e222d" : "#ffffff", border: fieldBorder, text: textColor, disabledBg: isDark ? "#2a2e39" : "#f0f3fa" };
  const section = (t: string, first = false) => <div style={{ marginTop: first ? 0 : 8, fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{t}</div>;
  const row = (label: React.ReactNode, control: React.ReactNode, key?: string) => (
    <div key={key} style={{ display: "flex", alignItems: "center", minHeight: 34, gap: 8 }}>
      <span style={{ width: 140, fontSize: 14, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>{control}</div>
    </div>
  );
  const info = (text?: string) => (text ? <Info text={text} bg={muted} fg={bgColor} /> : null);
  const textInput = (value: string, onChange: (v: string) => void, label: string) => (
    <input type="text" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", height: 34, boxSizing: "border-box", border: `1px solid ${fieldBorder}`, borderRadius: 6, padding: "0 10px", fontSize: 14, outline: "none", background: field.bg, color: textColor }} />
  );
  // The colour box as in the EMA dialog; the palette's (invisible) button lies over it and opens
  // TradingView's colour picker
  const swatch = (value: string, onChange: (v: string) => void, label: string) => {
    const c = /^#|^rgb/i.test(value) ? value : "#2962ff";
    return (
      <span style={{ position: "relative", display: "inline-block", width: 34, height: 34, padding: 4, boxSizing: "border-box", border: `1px solid ${fieldBorder}`, borderRadius: 6, flexShrink: 0 }}>
        <span style={{ display: "block", width: "100%", height: "100%", borderRadius: 4, background: c, boxSizing: "border-box", border: /^#?f{6}$/i.test(c.replace("#", "")) ? "1px solid #dbdbdb" : "none" }} />
        <PaletteInput aria-label={label} value={c} onChange={(e) => onChange(e.target.value)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer" }} />
      </span>
    );
  };

  const set = (varName: string, value: any) => setDraft((d) => ({ ...d, [varName]: value }));

  // Groups render in first-seen order, matching the script's own declaration order.
  const groups: { name: string; items: PineInputMeta[] }[] = [];
  for (const m of inputsMeta) {
    const g = m.group || "";
    let bucket = groups.find((b) => b.name === g);
    if (!bucket) { bucket = { name: g, items: [] }; groups.push(bucket); }
    bucket.items.push(m);
  }

  function renderInput(m: PineInputMeta) {
    const v = draft[m.varName];
    switch (m.type) {
      case "bool":
        return (
          <div key={m.varName} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 34 }}>
            <CheckBox color={accent} checked={!!v} onChange={(on) => set(m.varName, on)} label={m.title} />
            {info(m.tooltip)}
          </div>
        );
      case "timeframe": {
        const known = TIMEFRAME_OPTIONS.some((o) => o.value === v);
        return row(<>{m.title}</>, <>
          <div style={{ position: "relative", width: 200 }}>
            <TvSelect aria-label={m.title} value={v} onChange={(e) => set(m.varName, e.target.value)}
              style={{ width: "100%", height: 34, appearance: "none", border: `1px solid ${fieldBorder}`, borderRadius: 6, background: field.bg, color: textColor, fontSize: 14, padding: "0 28px 0 10px", outline: "none", cursor: "pointer" }}>
              {!known && <option value={v}>{v}</option>}
              {TIMEFRAME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </TvSelect>
          </div>
          {info(m.tooltip)}
        </>, m.varName);
      }
      case "string":
        if (m.options && m.options.length) {
          return row(m.title, <><Select label={m.title} value={String(v)} options={m.options} onChange={(x) => set(m.varName, x)} width={200} colors={field} />{info(m.tooltip)}</>, m.varName);
        }
        return row(m.title, <>{textInput(v ?? "", (x) => set(m.varName, x), m.title)}{info(m.tooltip)}</>, m.varName);
      case "color":
        return row(m.title, <>{swatch(typeof v === "string" ? v : "#2962ff", (x) => set(m.varName, x), m.title)}{info(m.tooltip)}</>, m.varName);
      case "int":
      case "float": {
        const step = m.step ?? (m.type === "int" ? 1 : 0.1);
        const clamp = (n: number) => {
          let x = m.type === "int" ? Math.round(n) : n;
          if (m.minval !== undefined) x = Math.max(m.minval, x);
          if (m.maxval !== undefined) x = Math.min(m.maxval, x);
          return x;
        };
        return row(m.title, <>
          <NumberField label={m.title} value={Number(v ?? 0)} min={m.minval} step={step} onChange={(n) => set(m.varName, clamp(n))} colors={field} />
          {info(m.tooltip)}
        </>, m.varName);
      }
      default:
        return row(m.title, <>{textInput(v ?? "", (x) => set(m.varName, x), m.title)}{info(m.tooltip)}</>, m.varName);
    }
  }

  function handleApply() {
    onApply(draft, capital > 0 ? capital : initialCapital, plotColors);
    onClose();
  }

  function resetSettings() {
    const d: Record<string, any> = {};
    for (const m of inputsMeta) d[m.varName] = m.value;
    setDraft(d);
    setCapital(initialCapital);
    const c: Record<string, string> = {};
    plots.forEach((p) => { c[p.title] = p.color; });
    setPlotColors(c);
  }

  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const defaultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!defaultsOpen) return;
    const onDown = (e: MouseEvent) => { if (!defaultsRef.current?.contains(e.target as Node)) setDefaultsOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [defaultsOpen]);

  const tabs: Tab[] = showProperties ? ["Inputs", "Properties", "Style"] : ["Inputs", "Style"];

  // Rendered on the page body and above the panels (the bottom panel is z-index 2000-2003):
  // inside the chart, or below that, the Strategy Tester panel covered its lower half
  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div role="dialog" aria-label={`${scriptName} settings`}
        style={{ width: 454, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)", backgroundColor: bgColor, borderRadius: 8, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.18)",
          border: `1px solid ${borderColor}`, pointerEvents: "auto", display: "flex", flexDirection: "column", color: textColor,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scriptName}</h2>
          <button type="button" aria-label="Close menu" onClick={onClose} style={{ border: "none", background: "transparent", color: textColor, cursor: "pointer", display: "flex", padding: 4, flexShrink: 0 }}><X size={20} /></button>
        </div>

        <div role="tablist" style={{ display: "flex", margin: "14px 20px 0", borderBottom: `2px solid ${borderColor}`, gap: 24 }}>
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              style={{ padding: "0 0 8px", fontSize: 15, fontWeight: 600, color: tab === t ? textColor : muted, cursor: "pointer", border: "none", background: "transparent",
                borderBottom: tab === t ? `2px solid ${textColor}` : "2px solid transparent", marginBottom: -2 }}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: 20, maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {tab === "Inputs" && (
            inputsMeta.length === 0 ? (
              <div style={{ color: muted, fontSize: 14 }}>This script declares no inputs.</div>
            ) : (
              groups.map((g, gi) => (
                <React.Fragment key={g.name || `_${gi}`}>
                  {g.name && section(g.name, gi === 0)}
                  {g.items.map(renderInput)}
                </React.Fragment>
              ))
            )
          )}

          {tab === "Properties" && (<>
            {section("General", true)}
            {row("Initial capital", <>
              <NumberField label="Initial capital" value={capital} min={1} step={1000} onChange={(n) => setCapital(n)} colors={field} width={160} />
              <span style={{ fontSize: 14, color: muted }}>USD</span>
            </>)}
            {defaultQtyValue !== undefined && row("Order size", <span style={{ fontSize: 14 }}>{defaultQtyValue} {defaultQtyType || ""}</span>)}
            {pyramiding !== undefined && row("Pyramiding", <span style={{ fontSize: 14 }}>{pyramiding} {pyramiding === 1 ? "order" : "orders"}</span>)}
            {section("Detalization and execution")}
            {row("Bar detalization", <span style={{ fontSize: 14 }}>Default (4 ticks per bar)</span>)}
            {row("Script execution", <span style={{ fontSize: 14 }}>On bar close</span>)}
            <div style={{ color: muted, fontSize: 12, lineHeight: 1.5 }}>
              Commission, leverage, slippage and order-fill delay aren&apos;t simulated by this backtester yet, so they&apos;re left out here rather than shown as settings that wouldn&apos;t do anything.
            </div>
          </>)}

          {tab === "Style" && (<>
            {section("Plots", true)}
            {plots.length === 0 ? (
              <div style={{ color: muted, fontSize: 14 }}>This script has no plots to style.</div>
            ) : plots.map((p) => row(p.title, swatch(plotColors[p.title] || p.color, (c) => setPlotColors((cur) => ({ ...cur, [p.title]: c })), `${p.title} colour`), p.title))}
            <div style={{ color: muted, fontSize: 12, lineHeight: 1.5 }}>
              Line style and width and marker shapes aren&apos;t editable yet: only the colour, which is what re-renders on the chart.
            </div>
          </>)}
        </div>

        <div style={{ padding: "16px 20px", borderTop: `1px solid ${borderColor}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div ref={defaultsRef} style={{ position: "relative" }}>
            <button type="button" aria-haspopup="menu" aria-expanded={defaultsOpen} onClick={() => setDefaultsOpen((o) => !o)}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", border: `1px solid ${defaultsOpen ? "#2962ff" : fieldBorder}`, borderRadius: 6, cursor: "pointer", fontSize: 14, background: "transparent", color: textColor }}>
              Defaults <ChevronDown size={14} style={{ transform: defaultsOpen ? "rotate(180deg)" : undefined }} />
            </button>
            {defaultsOpen && (
              <div role="menu" style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, minWidth: 160, background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", padding: "4px 0", zIndex: 2 }}>
                <button type="button" role="menuitem" onClick={() => { resetSettings(); setDefaultsOpen(false); }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? "#2a2e39" : "#f0f3fa")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", border: "none", background: "transparent", color: textColor, fontSize: 14, cursor: "pointer" }}>
                  Reset settings
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ height: 34, padding: "0 14px", borderRadius: 6, border: `1px solid ${fieldBorder}`, backgroundColor: "transparent", color: textColor, cursor: "pointer", fontSize: 14 }}>Cancel</button>
            <button type="button" onClick={handleApply} style={{ height: 34, padding: "0 18px", borderRadius: 6, border: "none", backgroundColor: isDark ? "#ffffff" : "#131722", color: isDark ? "#131722" : "#ffffff", cursor: "pointer", fontSize: 14 }}>Ok</button>
          </div>
        </div>
      </div>
    </div>
  , document.body);
}
