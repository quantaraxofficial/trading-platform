"use client";
// "Manage layout drawings": every symbol that has drawings, with how many, opening to the list of
// them (newest first) and a button to remove all of a symbol's drawings — TradingView's dialog
// from the Object tree's toolbar. Drawings here are synced in the layout (a chart shows the
// drawings of its symbol), so the other two sync filters list nothing.
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDrawing } from "../drawing/core/DrawingContext";
import { useAuth } from "@/context/AuthContext";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { layoutStore } from "../../lib/layoutStore";
import { readDrawingIndex, writeDrawingIndex, type IndexedDrawing } from "../../lib/drawingIndex";
import { DrawingIcon, drawingTreeName, formatModified, TrashIcon, Chevron } from "./treeIcons";

type Filter = "global" | "layout" | "none";

export default function ManageDrawingsDialog({ onClose }: { onClose: () => void }) {
  useEscapeClose(onClose);
  const { drawings, symbol, deleteMultipleDrawings } = useDrawing();
  const { user } = useAuth() as any;
  const layoutName = layoutStore.useValue().working?.name || "Unnamed";
  const [filter, setFilter] = useState<Filter>("layout");
  const [others, setOthers] = useState<Record<string, IndexedDrawing[]>>(() => readDrawingIndex());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  // Signed in: the saved drawings of every symbol
  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    fetch(`http://localhost:8000/api/users/drawings/${user.uid}/`).then(r => r.ok ? r.json() : null).then(list => {
      if (!alive || !Array.isArray(list)) return;
      const next: Record<string, IndexedDrawing[]> = {};
      for (const e of list) if (e?.symbol && Array.isArray(e.drawings) && e.drawings.length) next[e.symbol] = e.drawings.map((d: any) => ({ id: d.id, type: d.type, modifiedAt: d.modifiedAt }));
      setOthers(prev => ({ ...prev, ...next }));
    }).catch(() => { /* backend down: the local index */ });
    return () => { alive = false; };
  }, [user?.uid]);

  const groups = useMemo(() => {
    const map: Record<string, IndexedDrawing[]> = { ...others };
    const live = drawings.filter(d => d.type !== "measure").map(d => ({ id: d.id, type: d.type, modifiedAt: d.modifiedAt }));
    if (symbol) { if (live.length) map[symbol] = live; else delete map[symbol]; }
    return Object.entries(map).filter(([, l]) => l.length > 0)
      .map(([sym, list]) => ({ symbol: sym, list: list.slice().sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0)) }))
      .sort((a, b) => b.list.length - a.list.length || a.symbol.localeCompare(b.symbol));
  }, [others, drawings, symbol]);
  const shown = filter === "layout" ? groups : [];

  const removeAll = async (sym: string) => {
    if (sym === symbol) deleteMultipleDrawings(drawings.filter(d => d.type !== "measure").map(d => d.id));
    else if (user?.uid) {
      try { await fetch(`http://localhost:8000/api/users/drawings/${user.uid}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: sym, drawings: [] }) }); } catch { /* offline */ }
    }
    writeDrawingIndex(sym, []);
    setOthers(prev => { const n = { ...prev }; delete n[sym]; return n; });
  };

  const pill = (id: Filter, label: string) => (
    <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
      style={{ height: 30, padding: "0 12px", borderRadius: 16, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14,
        background: filter === id ? "var(--tv-color-text)" : "var(--tv-color-item-hover)", color: filter === id ? "var(--tv-color-pane-bg)" : "var(--tv-color-text)" }}>{label}</button>
  );
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label="Manage layout drawings" style={{ width: 480, maxWidth: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ position: "relative", padding: "20px 20px 18px", borderBottom: "1px solid var(--tv-color-border)" }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Manage layout drawings</div>
          <div style={{ fontSize: 16, marginTop: 10, color: "var(--tv-color-text)" }}>{layoutName}</div>
          <button type="button" aria-label="Close menu" onClick={onClose} style={{ position: "absolute", top: 18, right: 16, width: 30, height: 30, border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 1l16 16M17 1L1 17" /></svg>
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "14px 20px 10px" }}>
          {pill("global", "Synced globally")}{pill("layout", "Synced in layout")}{pill("none", "Not synced")}
        </div>
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          {shown.length === 0 && <div style={{ padding: "28px 20px", textAlign: "center", fontSize: 14, color: "var(--tv-color-text-muted)" }}>No drawings yet</div>}
          {shown.map(g => {
            const isOpen = open.has(g.symbol);
            return (
              <div key={g.symbol} data-symbol={g.symbol}>
                <div role="button" aria-expanded={isOpen} onClick={() => setOpen(p => { const n = new Set(p); if (n.has(g.symbol)) n.delete(g.symbol); else n.add(g.symbol); return n; })}
                  onMouseEnter={() => setHovered(g.symbol)} onMouseLeave={() => setHovered(h => h === g.symbol ? null : h)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", cursor: "pointer", background: hovered === g.symbol ? "var(--tv-color-item-hover)" : "transparent" }}>
                  <span style={{ color: "var(--tv-color-text-muted)", display: "inline-flex" }}><Chevron open={isOpen} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{g.symbol}</div>
                    <div style={{ fontSize: 12, color: "var(--tv-color-text-muted)" }}>{g.list.length} {g.list.length === 1 ? "drawing" : "drawings"}</div>
                  </span>
                  <span role="button" aria-label="Remove all drawings for this symbol" title="Remove all drawings for this symbol"
                    onClick={e => { e.stopPropagation(); setConfirm(g.symbol); }}
                    style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, visibility: hovered === g.symbol ? "visible" : "hidden", cursor: "pointer" }}><TrashIcon /></span>
                </div>
                {isOpen && g.list.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 20px 6px 40px" }}>
                    <span style={{ width: 28, height: 28, flexShrink: 0 }}><DrawingIcon type={d.type} /></span>
                    <span style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14 }}>{drawingTreeName(d.type)}</div>
                      {d.modifiedAt && <div style={{ fontSize: 12, color: "var(--tv-color-text-muted)" }}>{formatModified(d.modifiedAt)}</div>}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {confirm && (
          <div role="alertdialog" aria-label="Remove drawings" style={{ borderTop: "1px solid var(--tv-color-border)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, fontSize: 14 }}>Remove all drawings for {confirm}?</span>
            <button type="button" onClick={() => setConfirm(null)} style={{ height: 32, padding: "0 14px", borderRadius: 6, border: "1px solid var(--tv-color-border)", background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button type="button" onClick={() => { const s = confirm; setConfirm(null); removeAll(s); }} style={{ height: 32, padding: "0 14px", borderRadius: 6, border: "none", background: "var(--tv-color-accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
