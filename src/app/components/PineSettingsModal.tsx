"use client";

import { useState } from "react";
import { X, Info } from "lucide-react";
import type { PineInputMeta } from "../lib/pineScriptEngine";
import { useEscapeClose } from "../lib/useEscapeClose";
import { PaletteInput } from "./drawing/ui/PaletteInput";

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

export default function PineSettingsModal({
  theme = "dark", scriptName, inputsMeta, currentOverrides, initialCapital, pyramiding, defaultQtyValue, defaultQtyType,
  plots, onApply, onClose,
}: PineSettingsModalProps) {
  useEscapeClose(onClose);
  const [tab, setTab] = useState<"inputs" | "properties" | "style">("inputs");
  const [draft, setDraft] = useState<Record<string, any>>(() => {
    const d: Record<string, any> = {};
    for (const m of inputsMeta) d[m.varName] = Object.prototype.hasOwnProperty.call(currentOverrides, m.varName) ? currentOverrides[m.varName] : m.value;
    return d;
  });
  const [capitalDraft, setCapitalDraft] = useState(String(initialCapital));
  const [plotColors, setPlotColors] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    plots.forEach((p) => { d[p.title] = p.color; });
    return d;
  });

  const isDark = theme === "dark";
  const bg = isDark ? "#1e222d" : "#ffffff";
  const border = isDark ? "#2a2e39" : "#e0e3eb";
  const text = isDark ? "#d1d4dc" : "#131722";
  const muted = "#787b86";
  const inputBg = isDark ? "#131722" : "#ffffff";

  const set = (varName: string, value: any) => setDraft((d) => ({ ...d, [varName]: value }));

  const inputStyle: React.CSSProperties = {
    padding: "6px 8px", border: `1px solid ${border}`, borderRadius: "4px",
    background: inputBg, color: text, fontSize: "13px", width: "100%",
  };

  // Groups render in first-seen order, matching the script's own declaration order.
  const groups: { name: string; items: PineInputMeta[] }[] = [];
  for (const m of inputsMeta) {
    const g = m.group || "";
    let bucket = groups.find((b) => b.name === g);
    if (!bucket) { bucket = { name: g, items: [] }; groups.push(bucket); }
    bucket.items.push(m);
  }

  function renderControl(m: PineInputMeta) {
    const v = draft[m.varName];
    switch (m.type) {
      case "bool":
        return (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input type="checkbox" checked={!!v} onChange={(e) => set(m.varName, e.target.checked)} style={{ width: "16px", height: "16px" }} />
            <span style={{ color: text }}>{m.title}</span>
            {m.tooltip && <Info size={13} color={muted} title={m.tooltip} />}
          </label>
        );
      case "timeframe": {
        const known = TIMEFRAME_OPTIONS.some((o) => o.value === v);
        return (
          <select value={v} onChange={(e) => set(m.varName, e.target.value)} style={inputStyle}>
            {!known && <option value={v}>{v}</option>}
            {TIMEFRAME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      }
      case "string":
        if (m.options && m.options.length) {
          return (
            <select value={v} onChange={(e) => set(m.varName, e.target.value)} style={inputStyle}>
              {m.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          );
        }
        return <input type="text" value={v ?? ""} onChange={(e) => set(m.varName, e.target.value)} style={inputStyle} />;
      case "color":
        return (
          <PaletteInput
            value={typeof v === "string" && /^#/.test(v) ? v : "#2962ff"}
            onChange={(e) => set(m.varName, e.target.value)}
            style={{ width: "36px", height: "26px", padding: 0, border: `1px solid ${border}`, borderRadius: "4px", background: "none", cursor: "pointer" }}
          />
        );
      case "int":
      case "float":
        return (
          <input
            type="number"
            value={v ?? 0}
            min={m.minval} max={m.maxval} step={m.step ?? (m.type === "int" ? 1 : 0.01)}
            onChange={(e) => set(m.varName, m.type === "int" ? parseInt(e.target.value, 10) : parseFloat(e.target.value))}
            style={inputStyle}
          />
        );
      default:
        return <input type="text" value={v ?? ""} onChange={(e) => set(m.varName, e.target.value)} style={inputStyle} />;
    }
  }

  function handleApply() {
    const capital = parseFloat(capitalDraft.replace(/,/g, "")) || initialCapital;
    onApply(draft, capital, plotColors);
    onClose();
  }

  function resetDefaults() {
    const d: Record<string, any> = {};
    for (const m of inputsMeta) d[m.varName] = m.value;
    setDraft(d);
    setCapitalDraft(String(initialCapital));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "440px", maxHeight: "82vh", background: bg, borderRadius: "8px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", color: text, fontSize: "13px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0" }}>
          <div style={{ fontSize: "17px", fontWeight: 700 }}>{scriptName}</div>
          <X size={18} style={{ cursor: "pointer", color: muted }} onClick={onClose} />
        </div>

        <div style={{ display: "flex", gap: "20px", padding: "14px 20px 0", borderBottom: `1px solid ${border}` }}>
          {(["inputs", "properties", "style"] as const).map((t) => (
            <div
              key={t}
              onClick={() => setTab(t)}
              style={{
                paddingBottom: "10px", cursor: "pointer", textTransform: "capitalize",
                color: tab === t ? text : muted, fontWeight: tab === t ? 600 : 400,
                borderBottom: tab === t ? "2px solid #2962ff" : "2px solid transparent",
              }}
            >
              {t}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {tab === "inputs" && (
            inputsMeta.length === 0 ? (
              <div style={{ color: muted }}>This script declares no inputs.</div>
            ) : (
              groups.map((g) => (
                <div key={g.name} style={{ marginBottom: "18px" }}>
                  {g.name && <div style={{ fontSize: "11px", fontWeight: 600, color: muted, letterSpacing: "0.04em", marginBottom: "10px" }}>{g.name.toUpperCase()}</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {g.items.map((m) => (
                      <div key={m.varName}>
                        {m.type !== "bool" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", color: text }}>
                            {m.title}
                            {m.tooltip && <Info size={13} color={muted} title={m.tooltip} />}
                          </div>
                        )}
                        {renderControl(m)}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )
          )}

          {tab === "properties" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: muted, letterSpacing: "0.04em" }}>GENERAL</div>
              <div>
                <div style={{ marginBottom: "4px" }}>Initial capital</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="text" inputMode="decimal" value={capitalDraft} onChange={(e) => setCapitalDraft(e.target.value)} style={inputStyle} />
                  <div style={{ padding: "6px 10px", border: `1px solid ${border}`, borderRadius: "4px", color: muted }}>USD</div>
                </div>
              </div>
              {defaultQtyValue !== undefined && (
                <div>
                  <div style={{ color: muted, marginBottom: "2px" }}>Default order size</div>
                  <div>{defaultQtyValue} {defaultQtyType || ""}</div>
                </div>
              )}
              {pyramiding !== undefined && (
                <div>
                  <div style={{ color: muted, marginBottom: "2px" }}>Pyramiding</div>
                  <div>{pyramiding}</div>
                </div>
              )}
              <div style={{ fontSize: "11px", fontWeight: 600, color: muted, letterSpacing: "0.04em", marginTop: "6px" }}>DETALIZATION AND EXECUTION</div>
              <div>
                <div style={{ color: muted, marginBottom: "2px" }}>Bar detalization</div>
                <div>Default (4 ticks per bar)</div>
              </div>
              <div>
                <div style={{ color: muted, marginBottom: "2px" }}>Script execution</div>
                <div>On bar close</div>
              </div>
              <div style={{ color: muted, fontSize: "12px", marginTop: "6px", lineHeight: 1.5 }}>
                Commission, leverage, slippage and order-fill delay aren't simulated by this backtester yet, so they're left out here rather than shown as settings that wouldn't do anything.
              </div>
            </div>
          )}

          {tab === "style" && (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: muted, letterSpacing: "0.04em", marginBottom: "10px" }}>PLOTS</div>
              {plots.length === 0 ? (
                <div style={{ color: muted }}>This script has no plots to style.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {plots.map((p) => (
                    <div key={p.title} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <PaletteInput
                        value={plotColors[p.title] || p.color}
                        onChange={(e) => setPlotColors((c) => ({ ...c, [p.title]: e.target.value }))}
                        style={{ width: "30px", height: "24px", padding: 0, border: `1px solid ${border}`, borderRadius: "4px", background: "none", cursor: "pointer" }}
                      />
                      <span>{p.title}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ color: muted, fontSize: "12px", marginTop: "14px", lineHeight: 1.5 }}>
                Line style/width and marker shapes aren't editable yet — only color, which is what actually re-renders on the chart.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: `1px solid ${border}` }}>
          <button onClick={resetDefaults} style={{ padding: "7px 14px", borderRadius: "4px", border: `1px solid ${border}`, background: "none", color: text, cursor: "pointer" }}>
            Defaults
          </button>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: "4px", border: `1px solid ${border}`, background: "none", color: text, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleApply} style={{ padding: "7px 16px", borderRadius: "4px", border: "none", background: isDark ? "#2a2e39" : "#131722", color: "#fff", cursor: "pointer" }}>
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
