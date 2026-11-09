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
import { useDialogDrag } from "../lib/useDialogDrag";
import { PaletteInput } from "./drawing/ui/PaletteInput";
import TvSelect from "@/app/components/ui/TvSelect";
import { CheckBox, NumberField, Select, Info } from "./EmaSettingsModal";
import {
  scriptTemplatesStore, saveScriptTemplate, deleteScriptTemplate, saveScriptDefault, type ScriptTemplateValues,
} from "../lib/scriptTemplates";

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
  // Where the script lives on the site (lib/scriptTemplates): its settings templates are kept under
  // this. null = not saved on the site yet, so it can't have templates
  templateKey?: string | null;
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
  plots, onApply, onClose, templateKey = null,
}: PineSettingsModalProps) {
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

  // Changes apply as they're made (the chart and the Strategy Tester report re-run behind the
  // dialog, which stays open); a short pause first, so typing a number doesn't re-run the backtest
  // for every keystroke. Cancel / Esc / the close button put back what the dialog opened with;
  // Ok keeps the changes.
  const initialRef = useRef({ draft, capital, plotColors });
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const appliedRef = useRef(false);          // something other than the opening settings is applied
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRef = useRef(true);
  const latestRef = useRef({ draft, capital, plotColors });
  latestRef.current = { draft, capital, plotColors };
  const applyNow = () => {
    if (pendingRef.current) { clearTimeout(pendingRef.current); pendingRef.current = null; }
    const { draft: d, capital: c, plotColors: pc } = latestRef.current;
    onApplyRef.current(d, c > 0 ? c : initialCapital, pc);
    appliedRef.current = true;
  };
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    if (pendingRef.current) clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(applyNow, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, capital, plotColors]);
  useEffect(() => () => { if (pendingRef.current) clearTimeout(pendingRef.current); }, []);
  const cancel = () => {
    if (pendingRef.current) { clearTimeout(pendingRef.current); pendingRef.current = null; }
    if (appliedRef.current) {
      const i = initialRef.current;
      onApplyRef.current(i.draft, i.capital > 0 ? i.capital : initialCapital, i.plotColors);
    }
    onClose();
  };
  useEscapeClose(cancel);

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

  // Ok: the changes are already applied (one still waiting out its pause goes now)
  function handleOk() {
    if (pendingRef.current) applyNow();
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

  // --- Settings templates (Defaults menu): the current values, a saved set applied, saving
  const currentValues = (): ScriptTemplateValues => ({ inputs: { ...draft }, capital: showProperties ? capital : undefined, plotColors: { ...plotColors } });
  function applyValues(v: ScriptTemplateValues) {
    const d: Record<string, any> = {};
    for (const m of inputsMeta) d[m.varName] = v.inputs && Object.prototype.hasOwnProperty.call(v.inputs, m.varName) ? v.inputs[m.varName] : m.value;
    setDraft(d);
    if (showProperties && typeof v.capital === "number" && v.capital > 0) setCapital(v.capital);
    if (v.plotColors) setPlotColors((cur) => ({ ...cur, ...v.plotColors }));
  }
  const allTemplates = scriptTemplatesStore.useValue().byScript;
  const entry = templateKey ? allTemplates[templateKey] : undefined;
  const templates = entry?.templates || [];
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  useEffect(() => { if (!savedNote) return; const t = setTimeout(() => setSavedNote(null), 2200); return () => clearTimeout(t); }, [savedNote]);

  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const defaultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!defaultsOpen) return;
    const onDown = (e: MouseEvent) => { if (!defaultsRef.current?.contains(e.target as Node)) setDefaultsOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [defaultsOpen]);

  const menuItem = (label: string, run: () => void, disabled = false) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => { if (disabled) return; run(); setDefaultsOpen(false); }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = isDark ? "#2a2e39" : "#f0f3fa"; }} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", border: "none", background: "transparent", color: textColor, fontSize: 14, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}>
      {label}
    </button>
  );

  const tabs: Tab[] = showProperties ? ["Inputs", "Properties", "Style"] : ["Inputs", "Style"];
  // Moved by its title bar, as on TradingView
  const drag = useDialogDrag();

  // Rendered on the page body and above the panels (the bottom panel is z-index 2000-2003):
  // inside the chart, or below that, the Strategy Tester panel covered its lower half
  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div role="dialog" aria-label={`${scriptName} settings`} ref={drag.ref}
        style={{ ...drag.style, width: 454, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)", backgroundColor: bgColor, borderRadius: 8, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.18)",
          border: `1px solid ${borderColor}`, pointerEvents: "auto", display: "flex", flexDirection: "column", color: textColor, position: "relative",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif' }}
        onClick={(e) => e.stopPropagation()}>
        <div onPointerDown={drag.handle.onPointerDown} style={{ ...drag.handle.style, padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scriptName}</h2>
          <button type="button" aria-label="Close menu" onClick={cancel} style={{ border: "none", background: "transparent", color: textColor, cursor: "pointer", display: "flex", padding: 4, flexShrink: 0 }}><X size={20} /></button>
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
              <div role="menu" style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, width: 260, maxHeight: 360, overflowY: "auto", background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", padding: "4px 0", zIndex: 2 }}>
                {menuItem("Reset settings", () => resetSettings())}
                {menuItem("Save as default", () => { if (templateKey) { saveScriptDefault(templateKey, currentValues()); setSavedNote("Saved as this script's default"); } }, !templateKey)}
                <div style={{ height: 1, background: borderColor, margin: "4px 0" }} />
                {menuItem("Save as…", () => setSaveAsOpen(true), !templateKey)}
                {!templateKey && (
                  <div style={{ padding: "6px 14px 8px", fontSize: 12, lineHeight: 1.45, color: muted }}>Save this script on the site first (Pine Editor → Save script), or publish it publicly or privately, to keep settings templates for it.</div>
                )}
                {templates.length > 0 && <div style={{ height: 1, background: borderColor, margin: "4px 0" }} />}
                {templates.map((t) => (
                  <div key={t.name} role="menuitem" tabIndex={0}
                    onClick={() => { applyValues(t.values); setDefaultsOpen(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { applyValues(t.values); setDefaultsOpen(false); } }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? "#2a2e39" : "#f0f3fa")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 14px", cursor: "pointer", fontSize: 14 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    <button type="button" aria-label={`Delete template ${t.name}`} title="Delete"
                      onClick={(e) => { e.stopPropagation(); if (templateKey) deleteScriptTemplate(templateKey, t.name); }}
                      style={{ border: "none", background: "transparent", color: muted, cursor: "pointer", display: "flex", padding: 2 }}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            {savedNote && <div role="status" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, whiteSpace: "nowrap", fontSize: 12, padding: "4px 8px", borderRadius: 4, background: isDark ? "#2a2e39" : "#131722", color: "#ffffff" }}>{savedNote}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={cancel} style={{ height: 34, padding: "0 14px", borderRadius: 6, border: `1px solid ${fieldBorder}`, backgroundColor: "transparent", color: textColor, cursor: "pointer", fontSize: 14 }}>Cancel</button>
            <button type="button" onClick={handleOk} style={{ height: 34, padding: "0 18px", borderRadius: 6, border: "none", backgroundColor: isDark ? "#ffffff" : "#131722", color: isDark ? "#131722" : "#ffffff", cursor: "pointer", fontSize: 14 }}>Ok</button>
          </div>
        </div>
        {saveAsOpen && templateKey && (
          <SaveAsBox existing={templates.map((t) => t.name)} isDark={isDark} colors={{ bg: bgColor, text: textColor, border: borderColor, field: fieldBorder, muted }}
            onClose={() => setSaveAsOpen(false)}
            onSave={(name) => { saveScriptTemplate(templateKey, name, currentValues()); setSaveAsOpen(false); setSavedNote(`Saved "${name.trim()}"`); }} />
        )}
      </div>
    </div>
  , document.body);
}

// "Save as…": a name for the current settings (saving under an existing name replaces that template)
function SaveAsBox({ existing, isDark, colors, onSave, onClose }: {
  existing: string[]; isDark: boolean; colors: { bg: string; text: string; border: string; field: string; muted: string };
  onSave: (name: string) => void; onClose: () => void;
}) {
  useEscapeClose(onClose);
  const [name, setName] = useState("");
  const clean = name.trim();
  const replaces = !!clean && existing.some((n) => n.toLowerCase() === clean.toLowerCase());
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="Save settings template" style={{ width: 320, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 20, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.18)" }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>Save as</div>
        <input autoFocus aria-label="Template name" value={name} placeholder="Template name" onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && clean) onSave(clean); }}
          style={{ width: "100%", height: 34, boxSizing: "border-box", border: `1px solid ${colors.field}`, borderRadius: 6, padding: "0 10px", fontSize: 14, outline: "none", background: colors.bg, color: colors.text }} />
        {replaces && <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>A template with this name will be replaced.</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ height: 34, padding: "0 14px", borderRadius: 6, border: `1px solid ${colors.field}`, background: "transparent", color: colors.text, cursor: "pointer", fontSize: 14 }}>Cancel</button>
          <button type="button" disabled={!clean} onClick={() => clean && onSave(clean)}
            style={{ height: 34, padding: "0 18px", borderRadius: 6, border: "none", background: isDark ? "#ffffff" : "#131722", color: isDark ? "#131722" : "#ffffff", cursor: clean ? "pointer" : "default", opacity: clean ? 1 : 0.5, fontSize: 14 }}>Save</button>
        </div>
      </div>
    </div>
  );
}
