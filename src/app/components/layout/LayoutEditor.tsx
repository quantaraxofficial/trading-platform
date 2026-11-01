"use client";

// Redesign mode: every widget of the site floats with a shining blue border; drag one to move it,
// drag its edge handles to resize it. Edges are magnetic: the screen's and the other widgets'
// (a 4px gap apart, or lined up), with a guide line where it snapped. Done keeps the layout,
// Cancel (or Esc) puts it back, Reset returns to the default grid, and it can be saved as a
// template (also in Settings → Layout).

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { snapEdge, snapMove, WIDGETS, type Guide, type Rect, type WidgetId } from "../../lib/widgetLayout";

export default function LayoutEditor({ rects, visible, W, H, onChange, onDone, onCancel, onReset, onSaveTemplate }: {
  rects: Record<WidgetId, Rect>; visible: Record<WidgetId, boolean>; W: number; H: number;
  onChange: (id: WidgetId, r: Rect) => void; onDone: () => void; onCancel: () => void; onReset: () => void;
  onSaveTemplate: (name: string) => void;
}) {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [active, setActive] = useState<WidgetId | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const latest = useRef(rects);
  latest.current = rects;
  useEscapeClose(() => { if (naming !== null) setNaming(null); else onCancel(); });

  // Dragging: the pointer's moves, at most once a frame
  const drag = useRef<{ id: WidgetId; mode: "move" | "w" | "h" | "wh"; sx: number; sy: number; start: Rect } | null>(null);
  const frame = useRef(0);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const others = WIDGETS.filter(w => w.id !== d.id && visible[w.id]).map(w => latest.current[w.id]);
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        let out: { rect: Rect; guides: Guide[] };
        if (d.mode === "move") out = snapMove({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, others, W, H);
        else {
          let r = d.start, g: Guide[] = [];
          if (d.mode === "w" || d.mode === "wh") { const s = snapEdge("w", r, d.start.x + d.start.w + dx, others, W, H); r = s.rect; g = g.concat(s.guides); }
          if (d.mode === "h" || d.mode === "wh") { const s = snapEdge("h", r, d.start.y + d.start.h + dy, others, W, H); r = s.rect; g = g.concat(s.guides); }
          out = { rect: r, guides: g };
        }
        setGuides(out.guides);
        onChange(d.id, out.rect);
      });
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      setActive(null);
      setGuides([]);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); cancelAnimationFrame(frame.current); };
  }, [W, H, onChange, visible]);

  const begin = (id: WidgetId, mode: "move" | "w" | "h" | "wh") => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, start: latest.current[id] };
    setActive(id);
    document.body.style.cursor = mode === "move" ? "grabbing" : mode === "w" ? "ew-resize" : mode === "h" ? "ns-resize" : "nwse-resize";
  };

  const saveTemplate = () => {
    const name = (naming || "").trim();
    if (!name) return;
    onSaveTemplate(name);
    setNaming(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return createPortal(
    <div data-name="layout-editor" style={{ position: "fixed", inset: 0, zIndex: 20000 }}>
      <style>{`
        @keyframes tv-redesign-glow { 0%,100% { box-shadow: 0 0 0 2px #2962ff, 0 0 10px 1px rgba(41,98,255,.55), inset 0 0 12px rgba(41,98,255,.25); }
          50% { box-shadow: 0 0 0 2px #5b8cff, 0 0 22px 5px rgba(41,98,255,.85), inset 0 0 18px rgba(41,98,255,.35); } }
        .tv-redesign-widget { animation: tv-redesign-glow 1.8s ease-in-out infinite; }
        .tv-redesign-widget.active { animation: none; box-shadow: 0 0 0 2px #82a5ff, 0 0 26px 7px rgba(41,98,255,.9); }
      `}</style>
      {/* the chart behind is dimmed and can't be clicked while redesigning */}
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(10,14,30,.28)" }} />

      {WIDGETS.map(w => {
        const r = rects[w.id];
        const on = visible[w.id];
        return (
          <div key={w.id} data-widget-frame={w.id} className={`tv-redesign-widget${active === w.id ? " active" : ""}`}
            onPointerDown={begin(w.id, "move")}
            style={{
              position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 6, cursor: active === w.id ? "grabbing" : "grab",
              background: on ? "rgba(41,98,255,.10)" : "repeating-linear-gradient(45deg, rgba(41,98,255,.10) 0 8px, rgba(41,98,255,.04) 8px 16px)",
              border: on ? "none" : "1px dashed #5b8cff", touchAction: "none",
            }}>
            <div style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none",
              display: "flex", flexDirection: r.w < 120 ? "column" : "row", alignItems: "center", gap: 6, padding: r.w < 120 ? "6px 4px" : "4px 10px",
              borderRadius: 6, background: "#2962ff", color: "#fff", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              writingMode: r.w < 90 && r.h > 160 ? "vertical-rl" : undefined, boxShadow: "0 2px 8px rgba(0,0,0,.3)",
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M7 1v12M1 7h12M7 1 5 3M7 1l2 2M7 13l-2-2M7 13l2-2M1 7l2-2M1 7l2 2M13 7l-2-2M13 7l-2 2" /></svg>
              <span>{w.label}{on ? "" : " (hidden)"}</span>
              {active === w.id && <span style={{ fontWeight: 400, opacity: .85 }}>{Math.round(r.w)} × {Math.round(r.h)}</span>}
            </div>
            {w.resizeW && <div data-resize="w" onPointerDown={begin(w.id, "w")} title="Drag to resize"
              style={{ position: "absolute", top: 0, right: -5, width: 10, height: "100%", cursor: "ew-resize", touchAction: "none" }}>
              <div style={{ position: "absolute", top: "50%", left: 3, width: 4, height: 28, marginTop: -14, borderRadius: 2, background: "#82a5ff" }} />
            </div>}
            {w.resizeH && <div data-resize="h" onPointerDown={begin(w.id, "h")} title="Drag to resize"
              style={{ position: "absolute", left: 0, bottom: -5, height: 10, width: "100%", cursor: "ns-resize", touchAction: "none" }}>
              <div style={{ position: "absolute", left: "50%", top: 3, height: 4, width: 28, marginLeft: -14, borderRadius: 2, background: "#82a5ff" }} />
            </div>}
            {w.resizeW && w.resizeH && <div onPointerDown={begin(w.id, "wh")} title="Drag to resize"
              style={{ position: "absolute", right: -6, bottom: -6, width: 14, height: 14, borderRadius: 3, background: "#2962ff", border: "2px solid #fff", cursor: "nwse-resize", touchAction: "none" }} />}
          </div>
        );
      })}

      {/* where it snapped */}
      {guides.map((g, i) => (
        <div key={i} aria-hidden style={g.axis === "x"
          ? { position: "absolute", left: g.at - 0.5, top: 0, bottom: 0, width: 1, background: "#5b8cff", boxShadow: "0 0 6px #2962ff" }
          : { position: "absolute", top: g.at - 0.5, left: 0, right: 0, height: 1, background: "#5b8cff", boxShadow: "0 0 6px #2962ff" }} />
      ))}

      {/* the controls */}
      <div data-name="layout-editor-bar" onPointerDown={e => e.stopPropagation()}
        style={{
          position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
          borderRadius: 10, background: "#131722", color: "#d1d4dc", boxShadow: "0 0 0 1px #2962ff, 0 8px 28px rgba(0,0,0,.45)", fontSize: 13,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif", maxWidth: "calc(100vw - 32px)", flexWrap: "wrap",
        }}>
        <span style={{ fontWeight: 600, color: "#fff" }}>Redesign</span>
        <span style={{ color: "#8c8f99", marginRight: 6 }}>Drag widgets anywhere: they snap to the screen edges and to each other</span>
        {naming === null ? (
          <>
            <EditorButton onClick={onReset} name="layout-reset">Reset</EditorButton>
            <EditorButton onClick={() => setNaming("")} name="layout-save-template">{saved ? "Saved" : "Save as template"}</EditorButton>
            <EditorButton onClick={onCancel} name="layout-cancel">Cancel</EditorButton>
            <EditorButton onClick={onDone} primary name="layout-done">Done</EditorButton>
          </>
        ) : (
          <>
            <input autoFocus value={naming} onChange={e => setNaming(e.target.value)} placeholder="Template name" data-name="layout-template-name"
              onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") saveTemplate(); if (e.key === "Escape") setNaming(null); }}
              style={{ height: 30, width: 180, borderRadius: 6, border: "1px solid #434651", background: "#1e222d", color: "#fff", padding: "0 8px", fontSize: 13, outline: "none" }} />
            <EditorButton onClick={saveTemplate} primary name="layout-template-ok">Save</EditorButton>
            <EditorButton onClick={() => setNaming(null)}>Cancel</EditorButton>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function EditorButton({ children, onClick, primary, name }: { children: React.ReactNode; onClick: () => void; primary?: boolean; name?: string }) {
  return (
    <button type="button" onClick={onClick} data-name={name}
      style={{ height: 30, padding: "0 12px", borderRadius: 6, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
        border: primary ? "none" : "1px solid #434651", background: primary ? "#2962ff" : "transparent", color: "#fff" }}>
      {children}
    </button>
  );
}
