"use client";

import React, { useRef, useState } from "react";
import { Tip, Popover } from "../trading/ui";
import { LAYOUT_ROWS, LAYOUTS } from "../lib/chartLayouts";
import { layoutStore, layouts, type LayoutSync } from "../lib/layoutStore";

// The header's "Layout setup" (TradingView's): how many charts the layout shows and how they're
// arranged — a row of arrangements for each count, 1 to 16 — and "Sync in layout".

const SYNC: { key: keyof LayoutSync; label: string; tip: string }[] = [
  { key: "symbol", label: "Symbol", tip: "Symbol changes on all charts within the layout" },
  { key: "interval", label: "Interval", tip: "Interval changes on all charts within the layout" },
  { key: "crosshair", label: "Crosshair", tip: "Crosshair is synced across all charts within the layout" },
  { key: "time", label: "Time", tip: "When a chart is clicked, all charts within the layout display the same point of time" },
  { key: "dateRange", label: "Date range", tip: "Date range changes on all charts within the layout" },
];

export function LayoutIcon({ id, size = 21 }: { id: string; size?: number }) {
  const l = LAYOUTS[id] || LAYOUTS["1a"];
  // The icons came without their outer <svg>'s fill: outlined (stroke-only) rects get no fill,
  // everything else is drawn in the text colour
  const html = l.icon.replace(/<rect(?![^>]*\sfill=)([^>]*\sstroke="currentColor")/g, '<rect fill="none"$1');
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 21 19" width={size} height={size * 19 / 21} fill="currentColor" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ position: "relative", width: 38, height: 20, borderRadius: 10, border: "none", padding: 0, cursor: "pointer", background: on ? "var(--tv-hdr-text)" : "var(--tv-color-border)" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 14, height: 14, borderRadius: "50%", background: "var(--tv-color-pane-bg)", transition: "left .15s" }} />
    </button>
  );
}

export default function LayoutSetupMenu() {
  const s = layoutStore.useValue();
  const w = s.working;
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const grid = w?.grid || "1a";

  const choose = (id: string) => {
    const charts = LAYOUTS[id].charts;
    layouts.update(l => {
      const cells = [...l.cells];
      // new charts start as copies of the active chart; extra ones beyond the count are dropped
      while (cells.length < charts) cells.push({ ...cells[l.active] });
      return { grid: id, cells: cells.slice(0, charts), active: Math.min(l.active, charts - 1) };
    });
  };

  return (
    <>
      <Tip text="Layout setup" placement="bottom">
        <button ref={btnRef} type="button" aria-label="Layout setup" className={`tv-hdr-btn ${open ? "active" : ""}`} onClick={() => setOpen(o => !o)} style={{ width: 38, padding: 0 }}>
          <LayoutIcon id={grid} />
        </button>
      </Tip>
      <Popover anchor={btnRef.current} open={open} onClose={() => setOpen(false)} align="right" width={428}>
        <div role="menu" aria-label="Layout setup" style={{ padding: "4px 0" }}>
          {LAYOUT_ROWS.map(row => (
            <div key={row.charts} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 12px", borderBottom: "1px solid var(--tv-color-border)" }}>
              <span style={{ width: 22, fontSize: 12, color: "var(--tv-color-text-muted)" }}>{row.charts}</span>
              {row.layouts.map(l => (
                <button key={l.id} type="button" role="menuitemradio" aria-checked={grid === l.id} aria-label={`${l.charts} chart${l.charts > 1 ? "s" : ""} (${l.id})`}
                  onClick={() => choose(l.id)}
                  style={{
                    width: 35, height: 35, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 6, cursor: "pointer",
                    background: grid === l.id ? "var(--tv-active-neutral)" : "transparent", color: "var(--tv-hdr-text)",
                  }}
                  onMouseEnter={e => { if (grid !== l.id) e.currentTarget.style.background = "var(--tv-hover-neutral)"; }}
                  onMouseLeave={e => { if (grid !== l.id) e.currentTarget.style.background = "transparent"; }}>
                  <LayoutIcon id={l.id} />
                </button>
              ))}
            </div>
          ))}
          <div style={{ padding: "14px 12px 6px", fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: "var(--tv-color-text-muted)" }}>SYNC IN LAYOUT</div>
          {SYNC.map(o => (
            <div key={o.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                {o.label}
                <Tip text={o.tip} placement="top" maxWidth={260}>
                  <span aria-label={o.tip} style={{ display: "inline-flex", width: 14, height: 14, borderRadius: "50%", background: "var(--tv-color-text-muted)", color: "var(--tv-color-pane-bg)", fontSize: 10, fontWeight: 700, alignItems: "center", justifyContent: "center", cursor: "default" }}>i</span>
                </Tip>
              </span>
              <Toggle on={!!w?.sync?.[o.key]} label={o.label} onChange={v => layouts.update(l => ({ sync: { ...l.sync, [o.key]: v } }))} />
            </div>
          ))}
        </div>
      </Popover>
    </>
  );
}
