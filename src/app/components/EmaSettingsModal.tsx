"use client";

// TradingView's settings dialog for "Moving Average Exponential" (EMA): Inputs (length, source,
// offset, smoothing, timeframe), Style (each plot's colour / line / type, precision, what the
// price scale and status line show) and Visibility (the intervals it shows on). Every change
// shows on the chart at once; Cancel (or Escape / ✕) puts the settings back as they were.

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown } from "lucide-react";
import { DualRangeSlider } from "./drawing/ui/DualRangeSlider";
import { useEscapeClose } from "../lib/useEscapeClose";
import { ColorPickerPopup } from "./drawing/ui/ColorPickerPopup";
import { PlotTypeMenu, PlotTypeIcon, PLOT_TYPES } from "./PlotTypeMenu";
import type { PlotType } from "./chartPrimitives/CandleBodyAwareLine";
import { Tip } from "../trading/ui";
import {
  EMA_SOURCES, SMOOTHING_TYPES, EMA_TIMEFRAMES, EMA_DEFAULTS, saveEmaDefaults, normalizeEma,
  type EmaConfig, type PlotStyle, type VisRange,
} from "../lib/emaCalc";

interface EmaSettingsModalProps {
  onClose: () => void;
  theme: string;
  config: EmaConfig;
  onChangeConfig: (newConfig: EmaConfig) => void;
}

function CheckBox({ checked, onChange, label, disabled, color }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean; color: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1, userSelect: "none" }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
      <span aria-hidden style={{
        width: 18, height: 18, borderRadius: 4, boxSizing: "border-box", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: checked ? "none" : "1px solid #b2b5be", background: checked ? color : "transparent",
      }}>
        {checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--tv-ema-check, #fff)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.4 2.4 4.6-5" /></svg>}
      </span>
      {label !== undefined && <span style={{ fontSize: 14 }}>{label}</span>}
    </label>
  );
}

// A number field that applies each valid value as it's typed (and tidies up on blur)
function NumberField({ value, onChange, min, step = 1, disabled, width = 120, colors, label }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; disabled?: boolean; width?: number; label: string;
  colors: { bg: string; border: string; text: string; disabledBg: string };
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(t => (Number(t) === value ? t : String(value))); }, [value]);
  const apply = (t: string) => {
    const n = Number(t);
    if (t.trim() !== "" && isFinite(n) && (min === undefined || n >= min)) onChange(n);
  };
  return (
    <input type="text" inputMode="decimal" aria-label={label} value={text} disabled={disabled}
      onChange={e => { setText(e.target.value); apply(e.target.value); }}
      onBlur={() => setText(String(value))}
      onKeyDown={e => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); const n = value + (e.key === "ArrowUp" ? step : -step); if (min === undefined || n >= min) onChange(+n.toFixed(6)); }
      }}
      style={{ width, height: 34, boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 6, padding: "0 10px", fontSize: 14, outline: "none",
        background: disabled ? colors.disabledBg : colors.bg, color: colors.text, opacity: disabled ? 0.6 : 1 }} />
  );
}

function Select({ value, options, onChange, width = 120, disabled, colors, label }: {
  value: string; options: readonly string[]; onChange: (v: string) => void; width?: number; disabled?: boolean; label: string;
  colors: { bg: string; border: string; text: string; disabledBg: string };
}) {
  return (
    <div style={{ position: "relative", width }}>
      <select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", height: 34, appearance: "none", border: `1px solid ${colors.border}`, borderRadius: 6, background: disabled ? colors.disabledBg : colors.bg,
          color: colors.text, fontSize: 14, padding: "0 28px 0 10px", outline: "none", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={14} color="#787b86" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

const Info = ({ text, mark = "i", bg, fg }: { text: string; mark?: string; bg: string; fg: string }) => (
  <Tip text={text} placement="top" maxWidth={260}>
    <span aria-label={text} style={{ width: 16, height: 16, borderRadius: "50%", background: bg, color: fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, cursor: "default" }}>{mark}</span>
  </Tip>
);

const dash = (ls: string, lw: number) => (ls === "Dashed" ? "4 3" : ls === "Dotted" ? `${lw} ${lw * 2}` : undefined);

export default function EmaSettingsModal({ onClose, theme, config, onChangeConfig }: EmaSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"Inputs" | "Style" | "Visibility">("Inputs");
  const [cfg, setCfg] = useState<EmaConfig>(() => normalizeEma(config));
  // what Cancel restores
  const initialRef = useRef<EmaConfig>(normalizeEma(config));
  const cfgRef = useRef(cfg);
  const set = (patch: Partial<EmaConfig>) => { const next = { ...cfgRef.current, ...patch }; cfgRef.current = next; setCfg(next); onChangeConfig(next); };
  const cancel = () => { onChangeConfig(initialRef.current); onClose(); };
  useEscapeClose(cancel);

  const isDark = theme === "dark";
  const bgColor = isDark ? "#1e222d" : "#ffffff";
  const textColor = isDark ? "#d1d4dc" : "#131722";
  const borderColor = isDark ? "#2a2e39" : "#e0e3eb";
  const fieldBorder = isDark ? "#434651" : "#d1d4dc";
  const muted = "#787b86";
  const accent = isDark ? "#d1d4dc" : "#131722";      // TradingView's checkboxes are the text colour
  const field = { bg: isDark ? "#1e222d" : "#ffffff", border: fieldBorder, text: textColor, disabledBg: isDark ? "#2a2e39" : "#f0f3fa" };
  const section = (t: string) => <div style={{ marginTop: 8, fontSize: 11, color: muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{t}</div>;
  const row = (label: React.ReactNode, control: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", minHeight: 34 }}>
      <span style={{ width: 140, fontSize: 14, flexShrink: 0 }}>{label}</span>
      {control}
    </div>
  );

  // Floating pickers (the dialog body scrolls and would clip them)
  const [picker, setPicker] = useState<null | { key: string; top: number; left: number }>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (pickerRef.current?.contains(t) || t.closest?.(`[data-picker-anchor="${picker.key}"]`)) return;
      setPicker(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [picker]);
  const openPicker = (key: string, e: React.MouseEvent) => {
    if (picker?.key === key) { setPicker(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPicker({ key, top: Math.min(r.bottom + 4, window.innerHeight - 420), left: Math.min(r.left, window.innerWidth - 300) });
  };

  const plotButton = (key: string, st: { color: string; lineWidth: number; lineStyle: string }, label: string) => (
    <button type="button" aria-label={label} data-picker-anchor={key} onClick={e => openPicker(key, e)}
      style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 8px 0 4px", borderRadius: 6, cursor: "pointer", boxSizing: "border-box",
        border: `1px solid ${picker?.key === key ? "#2962ff" : fieldBorder}`, background: "transparent" }}>
      <span style={{ width: 24, height: 24, borderRadius: 4, background: st.color, boxSizing: "border-box", border: /^#?f{6}$/i.test(st.color.replace("#", "")) ? "1px solid #dbdbdb" : "none" }} />
      <svg width="30" height="6" viewBox="0 0 30 6" aria-hidden><line x1="0" y1="3" x2="30" y2="3" stroke={st.color} strokeWidth={st.lineWidth} strokeDasharray={dash(st.lineStyle, st.lineWidth)} /></svg>
    </button>
  );
  const colorOnlyButton = (key: string, color: string, label: string) => (
    <button type="button" aria-label={label} data-picker-anchor={key} onClick={e => openPicker(key, e)}
      style={{ width: 34, height: 34, padding: 4, borderRadius: 6, cursor: "pointer", boxSizing: "border-box", border: `1px solid ${picker?.key === key ? "#2962ff" : fieldBorder}`, background: "transparent" }}>
      <span style={{ display: "block", width: "100%", height: "100%", borderRadius: 4, background: color }} />
    </button>
  );
  const plotType: PlotType = (cfg.plotType ?? "line") as PlotType;
  const extraPlots: { key: "maPlot" | "upperPlot" | "lowerPlot"; label: string }[] = [
    ...(cfg.smoothingType !== "None" ? [{ key: "maPlot" as const, label: "EMA-based MA" }] : []),
    ...(cfg.smoothingType === "SMA + Bollinger Bands" ? [{ key: "upperPlot" as const, label: "Upper Bollinger Band" }, { key: "lowerPlot" as const, label: "Lower Bollinger Band" }] : []),
  ];
  const setPlot = (key: "maPlot" | "upperPlot" | "lowerPlot", patch: Partial<PlotStyle>) => set({ [key]: { ...cfg[key], ...patch } } as Partial<EmaConfig>);
  const setVis = (key: keyof EmaConfig["visibility"], patch: any) =>
    set({ visibility: { ...cfg.visibility, [key]: typeof cfg.visibility[key] === "object" ? { ...(cfg.visibility[key] as VisRange), ...patch } : patch } });

  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const defaultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!defaultsOpen) return;
    const onDown = (e: MouseEvent) => { if (!defaultsRef.current?.contains(e.target as Node)) setDefaultsOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [defaultsOpen]);

  // The open picker
  let pickerEl: React.ReactNode = null;
  if (picker) {
    const pos: React.CSSProperties = { position: "fixed", top: picker.top, left: picker.left, zIndex: 100001 };
    if (picker.key === "ema") pickerEl = (
      <ColorPickerPopup colorStr={cfg.color} onChange={c => set({ color: c })} onClose={() => setPicker(null)}
        thickness={cfg.lineWidth} onThicknessChange={w => set({ lineWidth: w })} lineStyle={cfg.lineStyle} onLineStyleChange={v => set({ lineStyle: v })} style={pos} />
    );
    else if (picker.key === "type") pickerEl = (
      <div style={pos}>
        <PlotTypeMenu value={plotType} priceLine={!!cfg.priceLine} isDark={isDark}
          onSelect={t => { set({ plotType: t }); setPicker(null); }} onPriceLine={on => set({ priceLine: on })} onClose={() => setPicker(null)} />
      </div>
    );
    else if (picker.key === "fill") pickerEl = (
      <ColorPickerPopup colorStr={cfg.bbFill.color} onChange={c => set({ bbFill: { ...cfg.bbFill, color: c } })} onClose={() => setPicker(null)} style={pos} />
    );
    else {
      const k = picker.key as "maPlot" | "upperPlot" | "lowerPlot";
      pickerEl = (
        <ColorPickerPopup colorStr={cfg[k].color} onChange={c => setPlot(k, { color: c })} onClose={() => setPicker(null)}
          thickness={cfg[k].lineWidth} onThicknessChange={w => setPlot(k, { lineWidth: w })} lineStyle={cfg[k].lineStyle} onLineStyleChange={v => setPlot(k, { lineStyle: v })} style={pos} />
      );
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div role="dialog" aria-label="EMA settings"
        style={{ width: 454, maxWidth: "calc(100vw - 32px)", backgroundColor: bgColor, borderRadius: 8, boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.18)",
          border: `1px solid ${borderColor}`, pointerEvents: "auto", display: "flex", flexDirection: "column", color: textColor,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>EMA</h2>
          <button type="button" aria-label="Close menu" onClick={cancel} style={{ border: "none", background: "transparent", color: textColor, cursor: "pointer", display: "flex", padding: 4 }}><X size={20} /></button>
        </div>

        <div role="tablist" style={{ display: "flex", margin: "14px 20px 0", borderBottom: `2px solid ${borderColor}`, gap: 24 }}>
          {(["Inputs", "Style", "Visibility"] as const).map(tab => (
            <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)}
              style={{ padding: "0 0 8px", fontSize: 15, fontWeight: 600, color: activeTab === tab ? textColor : muted, cursor: "pointer", border: "none", background: "transparent",
                borderBottom: activeTab === tab ? `2px solid ${textColor}` : "2px solid transparent", marginBottom: -2 }}>
              {tab}
            </button>
          ))}
        </div>

        <div style={{ padding: 20, maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {activeTab === "Inputs" && (<>
            {row("Length", <NumberField label="Length" value={cfg.length} min={1} onChange={v => set({ length: Math.max(1, Math.round(v)) })} colors={field} />)}
            {row("Source", <Select label="Source" value={String(cfg.source)} options={EMA_SOURCES} onChange={v => set({ source: v })} width={160} colors={field} />)}
            {row("Offset", <NumberField label="Offset" value={cfg.offset} onChange={v => set({ offset: Math.round(v) })} colors={field} />)}
            {section("Smoothing")}
            {row("Type", <Select label="Smoothing type" value={cfg.smoothingType} options={SMOOTHING_TYPES} onChange={v => set({ smoothingType: v as any })} width={200} colors={field} />)}
            {row("Length", <NumberField label="Smoothing length" value={cfg.smoothingLength} min={1} disabled={cfg.smoothingType === "None"} onChange={v => set({ smoothingLength: Math.max(1, Math.round(v)) })} colors={field} />)}
            {row("BB StdDev", <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <NumberField label="BB StdDev" value={cfg.bbStdDev} min={0.001} step={0.5} disabled={cfg.smoothingType !== "SMA + Bollinger Bands"} onChange={v => set({ bbStdDev: v })} colors={field} />
              <Info text="Only applies when the smoothing type is SMA + Bollinger Bands" bg={muted} fg={bgColor} />
            </span>)}
            {section("Calculation")}
            {row("Timeframe", <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Select label="Timeframe" value={cfg.timeframe} options={EMA_TIMEFRAMES} onChange={v => set({ timeframe: v })} width={160} colors={field} />
              <Info mark="?" text="The indicator is calculated on this timeframe's bars instead of the chart's (a timeframe lower than the chart's uses the chart's)" bg={muted} fg={bgColor} />
            </span>)}
            <CheckBox color={accent} checked={cfg.waitForClose} onChange={v => set({ waitForClose: v })} label="Wait for timeframe closes" />
          </>)}

          {activeTab === "Style" && (<>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <CheckBox color={accent} checked={cfg.plotVisible} onChange={v => set({ plotVisible: v })} label="EMA" />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {plotButton("ema", cfg, "EMA color and line")}
                <button type="button" aria-label="Plot type" title={PLOT_TYPES.find(t => t.id === plotType)?.label} data-picker-anchor="type" onClick={e => openPicker("type", e)}
                  style={{ width: 34, height: 34, padding: 0, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
                    border: `1px solid ${picker?.key === "type" ? "#2962ff" : fieldBorder}`, background: "transparent", color: textColor }}>
                  <PlotTypeIcon type={plotType} />
                </button>
              </div>
            </div>
            {extraPlots.map(p => (
              <div key={p.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <CheckBox color={accent} checked={cfg[p.key].visible} onChange={v => setPlot(p.key, { visible: v })} label={p.label} />
                <div style={{ marginRight: 42 }}>{plotButton(p.key, cfg[p.key], `${p.label} color and line`)}</div>
              </div>
            ))}
            {cfg.smoothingType === "SMA + Bollinger Bands" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <CheckBox color={accent} checked={cfg.bbFill.visible} onChange={v => set({ bbFill: { ...cfg.bbFill, visible: v } })} label="Bollinger Bands Background Fill" />
                <div style={{ marginRight: 42 }}>{colorOnlyButton("fill", cfg.bbFill.color, "Background fill color")}</div>
              </div>
            )}
            {section("Output values")}
            {row("Precision", <Select label="Precision" value={cfg.precision} options={["Default", "0", "1", "2", "3", "4", "5", "6", "7", "8"]} onChange={v => set({ precision: v })} colors={field} />)}
            <CheckBox color={accent} checked={cfg.labelsOnScale} onChange={v => set({ labelsOnScale: v })} label="Labels on price scale" />
            <CheckBox color={accent} checked={cfg.valuesInStatusLine} onChange={v => set({ valuesInStatusLine: v })} label="Values in status line" />
            {section("Input values")}
            <CheckBox color={accent} checked={cfg.inputsInStatusLine} onChange={v => set({ inputsInStatusLine: v })} label="Inputs in status line" />
          </>)}

          {activeTab === "Visibility" && (<>
            <CheckBox color={accent} checked={cfg.visibility.ticks} onChange={v => setVis("ticks", v)} label="Ticks" />
            {([
              { id: "seconds", label: "Seconds", min: 1, max: 59 }, { id: "minutes", label: "Minutes", min: 1, max: 59 },
              { id: "hours", label: "Hours", min: 1, max: 24 }, { id: "days", label: "Days", min: 1, max: 366 },
              { id: "weeks", label: "Weeks", min: 1, max: 52 }, { id: "months", label: "Months", min: 1, max: 12 },
            ] as const).map(r => {
              const v = cfg.visibility[r.id];
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 100 }}><CheckBox color={accent} checked={v.enabled} onChange={on => setVis(r.id, { enabled: on })} label={r.label} /></div>
                  <NumberField label={`${r.label} from`} value={v.from} min={r.min} width={64} disabled={!v.enabled} colors={field}
                    onChange={n => setVis(r.id, { from: Math.min(Math.max(r.min, Math.round(n)), v.to) })} />
                  <div style={{ flex: 1, opacity: v.enabled ? 1 : 0.4, pointerEvents: v.enabled ? "auto" : "none" }}>
                    <DualRangeSlider min={r.min} max={r.max} from={v.from} to={v.to} onChange={(from: number, to: number) => setVis(r.id, { from, to })} />
                  </div>
                  <NumberField label={`${r.label} to`} value={v.to} min={r.min} width={64} disabled={!v.enabled} colors={field}
                    onChange={n => setVis(r.id, { to: Math.max(Math.min(r.max, Math.round(n)), v.from) })} />
                </div>
              );
            })}
            <CheckBox color={accent} checked={cfg.visibility.ranges} onChange={v => setVis("ranges", v)} label="Ranges" />
          </>)}
        </div>

        <div style={{ padding: "16px 20px", borderTop: `1px solid ${borderColor}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div ref={defaultsRef} style={{ position: "relative" }}>
            <button type="button" aria-haspopup="menu" aria-expanded={defaultsOpen} onClick={() => setDefaultsOpen(o => !o)}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", border: `1px solid ${defaultsOpen ? "#2962ff" : fieldBorder}`, borderRadius: 6, cursor: "pointer", fontSize: 14, background: "transparent", color: textColor }}>
              Defaults <ChevronDown size={14} style={{ transform: defaultsOpen ? "rotate(180deg)" : undefined }} />
            </button>
            {defaultsOpen && (
              <div role="menu" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: 160, background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", padding: "4px 0", zIndex: 2 }}>
                {[
                  { label: "Reset settings", run: () => { const d = normalizeEma(EMA_DEFAULTS); cfgRef.current = d; setCfg(d); onChangeConfig(d); } },
                  { label: "Save as default", run: () => saveEmaDefaults(cfg) },
                ].map(it => (
                  <button key={it.label} type="button" role="menuitem" onClick={() => { it.run(); setDefaultsOpen(false); }}
                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? "#2a2e39" : "#f0f3fa")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", border: "none", background: "transparent", color: textColor, fontSize: 14, cursor: "pointer" }}>
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={cancel} style={{ height: 34, padding: "0 14px", borderRadius: 6, border: `1px solid ${fieldBorder}`, backgroundColor: "transparent", color: textColor, cursor: "pointer", fontSize: 14 }}>Cancel</button>
            <button type="button" onClick={onClose} style={{ height: 34, padding: "0 18px", borderRadius: 6, border: "none", backgroundColor: isDark ? "#ffffff" : "#131722", color: isDark ? "#131722" : "#ffffff", cursor: "pointer", fontSize: 14 }}>Ok</button>
          </div>
        </div>
      </div>
      {pickerEl && createPortal(<div ref={pickerRef} style={{ pointerEvents: "auto" }}>{pickerEl}</div>, document.body)}
    </div>
  );
}
