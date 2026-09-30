"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudUpload, Folder, Search, Trash2, X } from "lucide-react";
import { TVIndicatorTemplatesIcon } from "./icons/TVIcons";
import { useEscapeClose } from "../lib/useEscapeClose";
import { placeBelow, useCloseOnAnchorScroll } from "../lib/anchoredPopup";
import {
  IndicatorTemplate,
  loadIndicatorTemplates,
  saveIndicatorTemplate,
  deleteIndicatorTemplate,
} from "@/app/utils/indicatorTemplates";

interface ActiveIndicator { id: string; name: string; visible?: boolean }

interface IndicatorTemplatesMenuProps {
  activeIndicators: ActiveIndicator[];
  symbol: string;
  interval: string;
  intervalLabel: string;
  onApply: (template: IndicatorTemplate) => void;
}

// TopBar's "Indicator templates" button (right of Indicators): save the chart's current
// indicators — with their settings, and optionally the symbol/interval — under a name,
// and bring a saved set back later. Quick search can also open either dialog through the
// "tv:indicator-templates" event (detail "save" | "open").
export default function IndicatorTemplatesMenu({ activeIndicators, symbol, interval, intervalLabel, onApply }: IndicatorTemplatesMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"save" | "open" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEscapeClose(closeMenu, menuOpen);
  useCloseOnAnchorScroll(menuRef, menuOpen, closeMenu);
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    const open = (e: Event) => {
      const which = (e as CustomEvent).detail;
      if (which === "save" || which === "open") { setMenuOpen(false); setDialog(which); }
    };
    window.addEventListener("tv:indicator-templates", open);
    return () => window.removeEventListener("tv:indicator-templates", open);
  }, []);

  const menuItem = (icon: React.ReactNode, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "0 14px", height: "40px",
        border: "none", background: "transparent", color: "var(--tv-color-text)", cursor: "pointer",
        fontSize: "14px", textAlign: "left", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="tv-tooltip-container" style={{ position: "relative" }} ref={menuRef}>
      <button
        className={`tv-hdr-btn ${menuOpen ? "active" : ""}`}
        onClick={() => setMenuOpen(o => !o)}
      >
        <TVIndicatorTemplatesIcon size={28} />
      </button>
      {!menuOpen && !dialog && (
        <div className="tv-tooltip" style={{ top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: "6px" }}>
          Indicator templates
        </div>
      )}
      {menuOpen && (
        <div ref={el => placeBelow(el, menuRef.current)} style={{
          position: "absolute", top: "100%", left: 0, marginTop: "4px", padding: "4px 0",
          backgroundColor: "var(--tv-color-pane-bg)", border: "1px solid var(--tv-color-border)",
          borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 9999, minWidth: "210px",
        }}>
          {menuItem(<CloudUpload size={18} strokeWidth={1.25} />, "Save indicator template…", () => { setMenuOpen(false); setDialog("save"); })}
          {menuItem(<Folder size={18} strokeWidth={1.25} />, "Open template…", () => { setMenuOpen(false); setDialog("open"); })}
        </div>
      )}

      {dialog === "save" && (
        <SaveIndicatorTemplateDialog
          activeIndicators={activeIndicators}
          symbol={symbol}
          interval={interval}
          intervalLabel={intervalLabel}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "open" && (
        <OpenIndicatorTemplateDialog
          onApply={(t) => { onApply(t); setDialog(null); }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 10005, backgroundColor: "rgba(0,0,0,0.4)",
};

const panelStyle: React.CSSProperties = {
  backgroundColor: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)",
  border: "1px solid var(--tv-color-border)", borderRadius: "8px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
};

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 16px" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>{title}</h2>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--tv-color-text)", cursor: "pointer", display: "flex" }}>
        <X size={20} />
      </button>
    </div>
  );
}

// "15min" → "15m", "1h" → "1h", "1day" → "D" — the interval as the toolbar shows it
function shortInterval(interval: string) {
  const named: Record<string, string> = { "1day": "D", "1week": "W", "1month": "M" };
  if (named[interval]) return named[interval];
  const m = interval.match(/^(\d+)(min|month)$/);
  return m ? `${m[1]}${m[2] === "min" ? "m" : "M"}` : interval;
}

function describe(t: IndicatorTemplate) {
  const names = t.indicators.map(i => {
    const len = i.config?.length;
    return i.name === "Moving Average Exponential" && len ? `EMA ${len}` : i.name;
  });
  return names.join(", ") || "No indicators";
}

function SaveIndicatorTemplateDialog({ activeIndicators, symbol, interval, intervalLabel, onClose }: {
  activeIndicators: ActiveIndicator[]; symbol: string; interval: string; intervalLabel: string; onClose: () => void;
}) {
  useEscapeClose(onClose);
  const [name, setName] = useState("");
  const [rememberSymbol, setRememberSymbol] = useState(false);
  const [rememberInterval, setRememberInterval] = useState(false);
  const existing = useMemo(() => loadIndicatorTemplates(), []);
  const trimmed = name.trim();
  const replaces = trimmed && existing.some(t => t.name.toLowerCase() === trimmed.toLowerCase());
  const canSave = !!trimmed && activeIndicators.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const settings = (window as any).__indicatorSettings?.get?.() ?? {};
    saveIndicatorTemplate({
      name: trimmed,
      indicators: activeIndicators.map(i => ({ name: i.name, visible: i.visible, config: settings.ema?.[i.id] })),
      volumeConfig: activeIndicators.some(i => i.name === "Volume") ? settings.volume : undefined,
      symbol: rememberSymbol ? symbol : undefined,
      interval: rememberInterval ? interval : undefined,
    });
    onClose();
  };

  const checkbox = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer", userSelect: "none" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--tv-color-accent)", cursor: "pointer" }} />
      {label}
    </label>
  );

  return (
    <div style={overlayStyle} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...panelStyle, width: "420px", maxWidth: "calc(100vw - 32px)" }}>
        <DialogHeader title="Save indicator template" onClose={onClose} />
        <div style={{ padding: "0 20px" }}>
          <label style={{ display: "block", fontSize: "13px", color: "var(--tv-color-text-muted)", marginBottom: "8px" }}>Template name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            autoFocus
            style={{
              width: "100%", padding: "8px 12px", borderRadius: "6px", border: "2px solid var(--tv-color-accent)",
              backgroundColor: "transparent", color: "var(--tv-color-text)", outline: "none", fontSize: "14px",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "16px 0 4px" }}>
            {checkbox(rememberSymbol, setRememberSymbol, `Remember symbol (${symbol})`)}
            {checkbox(rememberInterval, setRememberInterval, `Remember interval (${intervalLabel})`)}
          </div>
          <div style={{ fontSize: "12px", color: "var(--tv-color-text-muted)", margin: "14px 0 0", lineHeight: 1.5 }}>
            {activeIndicators.length === 0
              ? "There are no indicators on the chart to save."
              : `Includes: ${activeIndicators.map(i => i.name).join(", ")}`}
          </div>
          {replaces && (
            <div style={{ fontSize: "12px", color: "#f7a600", marginTop: "6px" }}>
              A template with this name already exists — saving will replace it.
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", padding: "20px" }}>
          <button onClick={onClose} style={{
            padding: "8px 20px", borderRadius: "6px", border: "1px solid var(--tv-color-border)",
            background: "transparent", color: "var(--tv-color-text)", cursor: "pointer", fontSize: "14px",
          }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!canSave} style={{
            padding: "8px 20px", borderRadius: "6px", border: "none", fontSize: "14px",
            background: canSave ? "var(--tv-color-accent)" : "var(--tv-color-item-hover)",
            color: canSave ? "#fff" : "var(--tv-color-text-muted)", cursor: canSave ? "pointer" : "not-allowed",
          }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function OpenIndicatorTemplateDialog({ onApply, onClose }: { onApply: (t: IndicatorTemplate) => void; onClose: () => void }) {
  useEscapeClose(onClose);
  const [templates, setTemplates] = useState<IndicatorTemplate[]>(() => loadIndicatorTemplates());
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = templates
    .filter(t => !q || t.name.toLowerCase().includes(q) || describe(t).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={overlayStyle} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...panelStyle, width: "460px", maxWidth: "calc(100vw - 32px)", height: "520px", maxHeight: "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}>
        <DialogHeader title="Indicator templates" onClose={onClose} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 20px 12px", borderBottom: "1px solid var(--tv-color-border)" }}>
          <Search size={18} strokeWidth={1.5} style={{ color: "var(--tv-color-text-muted)", flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search"
            autoFocus
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--tv-color-text)", fontSize: "14px" }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {templates.length === 0 ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 40px", fontSize: "14px", color: "var(--tv-color-text-muted)" }}>
              You have no saved indicator templates yet. Use “Save indicator template…” to save the indicators on your chart.
            </div>
          ) : shown.length === 0 ? (
            <div style={{ padding: "24px 20px", fontSize: "14px", color: "var(--tv-color-text-muted)", textAlign: "center" }}>No templates match “{query}”</div>
          ) : shown.map(t => (
            <div
              key={t.id}
              onClick={() => onApply(t)}
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: "flex", alignItems: "center", gap: "12px", padding: "8px 20px", cursor: "pointer",
                backgroundColor: hoveredId === t.id ? "var(--tv-color-item-hover)" : "transparent",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ fontSize: "12px", color: "var(--tv-color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {describe(t)}{t.symbol ? ` · ${t.symbol}` : ""}{t.interval ? ` · ${shortInterval(t.interval)}` : ""}
                </div>
              </div>
              <button
                title="Remove template"
                onClick={e => { e.stopPropagation(); setTemplates(deleteIndicatorTemplate(t.id)); }}
                style={{
                  visibility: hoveredId === t.id ? "visible" : "hidden", background: "none", border: "none",
                  color: "var(--tv-color-text-muted)", cursor: "pointer", display: "flex", padding: "4px",
                }}
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
