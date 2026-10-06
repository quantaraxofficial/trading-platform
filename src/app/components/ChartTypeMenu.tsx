"use client";
// TradingView's chart type button and menu: the current type's glyph in the top bar; the menu
// lists every type in its groups, the current one highlighted; hovering a row shows a "?" (what
// the type is) and a star that adds it to the favorites, which then get their own buttons next
// to this one.
import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tip } from "../trading/ui";
import { useEscapeClose } from "../lib/useEscapeClose";
import { CHART_TYPE_GROUPS, chartTypeInfo, chartTypeStore, useChartType, setChartType, toggleFavoriteChartType, DRAWN_TYPES, type ChartType } from "../lib/chartType";
import { CHART_TYPE_ICONS } from "../lib/chartTypeIcons";

export const ChartTypeIcon = ({ type }: { type: ChartType }) => (
  <span aria-hidden style={{ display: "inline-flex", width: 28, height: 28 }} dangerouslySetInnerHTML={{ __html: CHART_TYPE_ICONS[type] || CHART_TYPE_ICONS.candle }} />
);

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 18 18" width="18" height="18" fill={filled ? "#f7a600" : "none"} aria-hidden>
    <path stroke={filled ? "#f7a600" : "currentColor"} d="M9 2.13l1.903 3.855.116.236.26.038 4.255.618-3.079 3.001-.188.184.044.259.727 4.237-3.805-2L9 12.434l-.233.122-3.805 2.001.727-4.237.044-.26-.188-.183-3.079-3.001 4.255-.618.26-.038.116-.236L9 2.13z" />
  </svg>
);
const HelpIcon = () => (
  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden><path fill="currentColor" fillRule="evenodd" d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16Zm-1-4a1 1 0 1 0 2 0 1 1 0 0 0-2 0Zm2.83-3.52c-.49.43-.97.85-1.06 1.52H8.26c.08-1.18.74-1.69 1.32-2.13.49-.38.92-.71.92-1.37C10.5 6.67 9.82 6 9 6s-1.5.67-1.5 1.5V8H6v-.5a3 3 0 1 1 6 0c0 .96-.6 1.48-1.17 1.98Z" /></svg>
);

export default function ChartTypeMenu() {
  const { favorites } = chartTypeStore.useValue();
  const type = useChartType();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<ChartType | null>(null);
  const [about, setAbout] = useState<ChartType | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEscapeClose(() => setOpen(false), open && !about);
  const info = chartTypeInfo(type);
  const r = open ? btnRef.current?.getBoundingClientRect() : null;
  // The volume-profile types need volume by price inside each bar, which this chart's data
  // doesn't have: like TradingView's dialog for types a plan can't show, they explain and leave the
  // chart as it is
  const [unavailable, setUnavailable] = useState(false);
  const pick = (t: ChartType) => {
    setOpen(false);
    if (!DRAWN_TYPES.has(t)) { setUnavailable(true); setAbout(t); return; }
    setChartType(t);
  };

  return (
    <>
      <Tip text={info.name} placement="bottom">
        <button ref={btnRef} type="button" className={`tv-hdr-btn ${open ? "active" : ""}`} aria-label={info.name} aria-haspopup="menu" aria-expanded={open} data-name="chart-type-button"
          onClick={() => setOpen(o => !o)}><ChartTypeIcon type={type} /></button>
      </Tip>
      {/* the favorite types, each a button of its own */}
      {favorites.map(f => (
        <Tip key={f} text={chartTypeInfo(f).name} placement="bottom">
          <button type="button" className={`tv-hdr-btn ${f === type ? "active" : ""}`} aria-label={chartTypeInfo(f).name} aria-pressed={f === type} data-name="chart-type-favorite"
            onClick={() => setChartType(f)}><ChartTypeIcon type={f} /></button>
        </Tip>
      ))}
      {open && r && typeof document !== "undefined" && createPortal(
        <>
          <div onMouseDown={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2990 }} />
          <div role="menu" aria-label="Chart type" style={{ position: "fixed", left: r.left, top: r.bottom + 4, width: 270, maxHeight: `calc(100vh - ${r.bottom + 12}px)`, overflowY: "auto", zIndex: 3000,
            background: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)", borderRadius: 6, boxShadow: "0 2px 12px rgba(0,0,0,0.25)", padding: "4px 6px" }}>
            {CHART_TYPE_GROUPS.map((g, gi) => (
              <React.Fragment key={gi}>
                {gi > 0 && <div role="separator" style={{ height: 1, background: "var(--tv-color-border)", margin: "6px 2px" }} />}
                {g.map(t => {
                  const selected = t.id === type, fav = favorites.includes(t.id), hov = hover === t.id;
                  return (
                    <div key={t.id} role="menuitemradio" aria-checked={selected} aria-label={t.name} data-value={t.id}
                      onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(h => h === t.id ? null : h)}
                      onClick={() => pick(t.id)}
                      style={{ display: "flex", alignItems: "center", height: 40, padding: "0 6px 0 4px", borderRadius: 6, cursor: "pointer", fontSize: 14,
                        background: selected ? "var(--tv-color-text)" : hov ? "var(--tv-color-item-hover)" : "transparent",
                        color: selected ? "var(--tv-color-pane-bg)" : "inherit" }}>
                      <ChartTypeIcon type={t.id} />
                      <span style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                        {hov && (
                          <Tip text="Click here to learn more" placement="top">
                            <span role="button" aria-label={`About ${t.name}`} onClick={e => { e.stopPropagation(); setAbout(t.id); }}
                              style={{ display: "inline-flex", opacity: 0.6, cursor: "pointer" }}><HelpIcon /></span>
                          </Tip>
                        )}
                      </span>
                      <Tip text={fav ? "Remove from favorites" : "Add to favorites"} placement="top">
                        <button type="button" aria-label={fav ? "Remove from favorites" : "Add to favorites"} onClick={e => { e.stopPropagation(); toggleFavoriteChartType(t.id); }}
                          style={{ width: 28, height: 28, border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
                            visibility: hov || fav ? "visible" : "hidden" }}><StarIcon filled={fav} /></button>
                      </Tip>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </>, document.body)}
      {about && <AboutDialog type={about} unavailable={unavailable && !DRAWN_TYPES.has(about)} onClose={() => { setAbout(null); setUnavailable(false); }} />}
    </>
  );
}

// "?" → what the chart type is
function AboutDialog({ type, unavailable, onClose }: { type: ChartType; unavailable?: boolean; onClose: () => void }) {
  useEscapeClose(onClose);
  const t = chartTypeInfo(type);
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 3100, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label={t.name} style={{ width: 420, maxWidth: "100%", background: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "22px 24px", position: "relative" }}>
        <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, border: "none", background: "transparent", color: "inherit", cursor: "pointer" }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 1l16 16M17 1L1 17" /></svg>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 600 }}><ChartTypeIcon type={type} />{t.name}</div>
        <p style={{ fontSize: 14, lineHeight: 1.5, margin: "14px 0 0" }}>{t.about}</p>
        {unavailable && <p style={{ fontSize: 14, lineHeight: 1.5, margin: "10px 0 0", color: "var(--tv-color-text-muted)" }}>It needs the volume traded at each price within the bars, which isn't available for this chart yet, so the chart stays as it is.</p>}
      </div>
    </div>,
    document.body,
  );
}
