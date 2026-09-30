"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, X, Undo2, Redo2, Trash2, Lock, Unlock, Eye, EyeOff, Magnet, ZoomIn } from "lucide-react";
import { useDrawing } from "./drawing/core/DrawingContext";
import { DRAWING_TOOLS } from "./drawing/toolCatalog";
import { useEscapeClose } from "../lib/useEscapeClose";

export interface QuickAction {
  id: string;
  label: string;
  section: "FUNCTIONS" | "SETTINGS";
  icon?: React.ReactNode;
  shortcut?: string[];
  keywords?: string[];
  run: () => void;
}

interface Row {
  key: string;
  section: "DRAWINGS" | "FUNCTIONS" | "SETTINGS";
  label: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  haystack: string;
  drawingType?: string;
  run: () => void;
}

const SECTION_ORDER: Row["section"][] = ["DRAWINGS", "FUNCTIONS", "SETTINGS"];

// Every query word must appear somewhere in the row's label or keywords; an exact label match
// ranks first (so "arrow" puts Arrow above Arrow cursor), then labels starting with the query,
// then rows with a word starting with it.
function rank(row: Row, words: string[], query: string): number {
  if (!words.every(w => row.haystack.includes(w))) return -1;
  const label = row.label.toLowerCase();
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.split(/\s+/).some(w => w.startsWith(words[0]))) return 2;
  return 3;
}

// TradingView's Quick search (Ctrl+K): one box that finds drawing tools, chart functions and
// settings, and runs the picked one. Drawing tools and drawing-related actions come from the
// drawing context; everything else is passed in by the page that owns that state.
export default function QuickSearchDialog({ actions, onClose }: { actions: QuickAction[]; onClose: () => void }) {
  useEscapeClose(onClose);
  const {
    setActiveTool, favoriteTools, toggleFavoriteTool, undo, redo, canUndo, canRedo, clearDrawings,
    allDrawingsLocked, toggleLockAllDrawings, allDrawingsHidden, toggleHideAllDrawings,
    magnetMode, setMagnetMode, isFavoritesToolbarVisible, setIsFavoritesToolbarVisible,
  } = useDrawing();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const hay = (label: string, keywords?: string[]) => [label, ...(keywords || [])].join(" ").toLowerCase();
    const drawingRows: Row[] = DRAWING_TOOLS.map(t => ({
      key: `d-${t.type}`, section: "DRAWINGS", label: t.label, icon: t.icon(), drawingType: t.type,
      shortcut: t.shortcut?.split("+"), haystack: hay(t.label, ["drawing", "tool", ...(t.keywords || [])]),
      run: () => setActiveTool(t.type),
    }));
    const drawingActions: QuickAction[] = [
      { id: "undo", label: "Undo", section: "FUNCTIONS", shortcut: ["Ctrl", "Z"], icon: <Undo2 size={18} strokeWidth={1.5} />, run: () => { if (canUndo) undo(); } },
      { id: "redo", label: "Redo", section: "FUNCTIONS", shortcut: ["Ctrl", "Y"], icon: <Redo2 size={18} strokeWidth={1.5} />, run: () => { if (canRedo) redo(); } },
      { id: "remove-drawings", label: "Remove drawings", section: "FUNCTIONS", keywords: ["delete", "clear", "all"], icon: <Trash2 size={18} strokeWidth={1.5} />, run: clearDrawings },
      { id: "lock-drawings", label: allDrawingsLocked ? "Unlock all drawings" : "Lock all drawings", section: "FUNCTIONS", keywords: ["drawing"], icon: allDrawingsLocked ? <Unlock size={18} strokeWidth={1.5} /> : <Lock size={18} strokeWidth={1.5} />, run: toggleLockAllDrawings },
      { id: "hide-drawings", label: allDrawingsHidden ? "Show all drawings" : "Hide all drawings", section: "FUNCTIONS", keywords: ["drawing", "visibility"], icon: allDrawingsHidden ? <Eye size={18} strokeWidth={1.5} /> : <EyeOff size={18} strokeWidth={1.5} />, run: toggleHideAllDrawings },
      { id: "zoom-in", label: "Zoom in", section: "FUNCTIONS", keywords: ["zoom", "area"], icon: <ZoomIn size={18} strokeWidth={1.5} />, run: () => setActiveTool("zoom_in") },
      ...(["weak", "strong", "off"] as const).filter(m => m !== magnetMode).map<QuickAction>(m => ({
        id: `magnet-${m}`, label: m === "off" ? "Turn magnet off" : `${m === "weak" ? "Weak" : "Strong"} magnet`, section: "SETTINGS",
        keywords: ["magnet", "snap", "ohlc"], icon: <Magnet size={18} strokeWidth={1.5} />, run: () => setMagnetMode(m),
      })),
      { id: "favorites-toolbar", label: isFavoritesToolbarVisible ? "Hide favorites toolbar" : "Show favorites toolbar", section: "SETTINGS", keywords: ["favorite", "drawing", "toolbar"], icon: <Star size={18} strokeWidth={1.5} />, run: () => setIsFavoritesToolbarVisible(!isFavoritesToolbarVisible) },
    ];
    const actionRows: Row[] = [...actions, ...drawingActions].map(a => ({
      key: `a-${a.id}`, section: a.section, label: a.label, icon: a.icon, shortcut: a.shortcut,
      haystack: hay(a.label, a.keywords), run: a.run,
    }));
    return [...drawingRows, ...actionRows];
  }, [actions, setActiveTool, undo, redo, canUndo, canRedo, clearDrawings, allDrawingsLocked, toggleLockAllDrawings,
      allDrawingsHidden, toggleHideAllDrawings, magnetMode, setMagnetMode, isFavoritesToolbarVisible, setIsFavoritesToolbarVisible]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const words = q.split(/\s+/);
    const scored = rows.map(r => ({ r, score: rank(r, words, q) })).filter(x => x.score >= 0);
    // Grouped by section (in TradingView's order), best matches first within each group
    return SECTION_ORDER.flatMap(section =>
      scored.filter(x => x.r.section === section).sort((a, b) => a.score - b.score).map(x => x.r)
    );
  }, [rows, q]);

  useEffect(() => { setSelected(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const runRow = (row: Row) => {
    onClose();
    row.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => (s + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => (s - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); runRow(results[selected]); }
  };

  let lastSection: string | null = null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10005, display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "484px", maxWidth: "calc(100vw - 32px)", height: "687px", maxHeight: "calc(100vh - 80px)",
        display: "flex", flexDirection: "column", backgroundColor: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)",
        border: "1px solid var(--tv-color-border)", borderRadius: "6px", boxShadow: "0 2px 16px rgba(0,0,0,0.2)", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: "68px", flexShrink: 0 }}>
          <span style={{ fontSize: "20px", fontWeight: 600 }}>Search tool or function</span>
          <button onClick={onClose} className="tv-icon-btn" style={{ width: "28px", height: "28px", color: "var(--tv-color-text)" }}>
            <X size={22} strokeWidth={1.25} />
          </button>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: "10px", height: "42px", padding: "0 20px", flexShrink: 0,
          borderTop: "1px solid var(--tv-color-border)", borderBottom: "1px solid var(--tv-color-border)",
        }}>
          <Search size={20} strokeWidth={1.25} style={{ color: "var(--tv-color-text-muted)", flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            spellCheck={false}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--tv-color-text)", fontSize: "16px" }}
          />
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", paddingBottom: "8px" }}>
          {!q ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", padding: "0 20px", textAlign: "center" }}>
              Type to search for drawings, functions and settings
            </div>
          ) : results.length === 0 ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", color: "var(--tv-color-text-muted)", padding: "0 20px", textAlign: "center" }}>
              No results found
            </div>
          ) : results.map((row, i) => {
            const header = row.section !== lastSection ? row.section : null;
            lastSection = row.section;
            const isFav = row.drawingType ? favoriteTools.includes(row.drawingType as any) : false;
            return (
              <React.Fragment key={row.key}>
                {header && (
                  <div style={{ padding: "16px 20px 8px", fontSize: "11px", color: "var(--tv-color-text-muted)", letterSpacing: "0.4px" }}>{header}</div>
                )}
                <div
                  data-row-index={i}
                  onClick={() => runRow(row)}
                  onMouseMove={() => { if (selected !== i) setSelected(i); }}
                  style={{
                    display: "flex", alignItems: "center", height: "36px", padding: "0 20px 0 14px", cursor: "pointer",
                    backgroundColor: i === selected ? "var(--tv-color-item-hover)" : "transparent",
                  }}
                >
                  <span style={{ width: "24px", display: "flex", justifyContent: "center", flexShrink: 0 }}>
                    {row.drawingType && (
                      <button
                        title={isFav ? "Remove from favorites" : "Add to favorites"}
                        onClick={e => { e.stopPropagation(); toggleFavoriteTool(row.drawingType as any); }}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", color: isFav ? "var(--tv-color-text)" : "var(--tv-color-text-muted)", visibility: isFav || i === selected ? "visible" : "hidden" }}
                      >
                        <Star size={16} strokeWidth={1.5} fill={isFav ? "currentColor" : "none"} />
                      </button>
                    )}
                  </span>
                  <span style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, margin: "0 8px 0 4px" }}>
                    {row.icon}
                  </span>
                  <span style={{ flex: 1, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                  {row.shortcut && (
                    <span style={{ fontSize: "12px", color: "var(--tv-color-text-muted)", marginLeft: "12px", whiteSpace: "nowrap" }}>
                      {row.shortcut.join(" + ")}
                    </span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
