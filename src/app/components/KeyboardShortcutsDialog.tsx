"use client";

import React, { useState } from "react";
import { Search, X } from "lucide-react";
import { useEscapeClose } from "../lib/useEscapeClose";

// Every shortcut the app actually handles (page.tsx and the drawing context's key handlers).
// Keep this list in step with those handlers.
const SHORTCUT_GROUPS: { title: string; items: [string, string[]][] }[] = [
  {
    title: "General",
    items: [
      ["Quick search", ["Ctrl", "K"]],
      ["Keyboard shortcuts", ["Ctrl", "/"]],
      ["Indicators, metrics, and strategies", ["/"]],
      ["Change interval", ["0–9"]],
      ["Change symbol", ["A–Z"]],
      ["Go to date", ["Alt", "G"]],
      ["Reset chart view", ["Alt", "R"]],
      ["Hide or show panels", ["Shift", "F"]],
      ["Close dialog / show panels", ["Esc"]],
    ],
  },
  {
    title: "Alerts and trading",
    items: [
      ["Create alert", ["Alt", "A"]],
      ["Add symbol to watchlist", ["Alt", "W"]],
      ["Open watchlist", ["Shift", "W"]],
      ["Market buy", ["Shift", "B"]],
      ["Market sell", ["Shift", "S"]],
    ],
  },
  {
    title: "Chart snapshot",
    items: [
      ["Download chart image", ["Ctrl", "Alt", "S"]],
      ["Copy chart image", ["Ctrl", "Shift", "S"]],
      ["Copy link to the chart image", ["Alt", "S"]],
    ],
  },
  {
    title: "Drawings",
    items: [
      ["Trend line", ["Alt", "T"]],
      ["Horizontal line", ["Alt", "H"]],
      ["Horizontal ray", ["Alt", "J"]],
      ["Cross", ["Alt", "C"]],
      ["Fibonacci retracement", ["Alt", "F"]],
      ["Brush", ["Alt", "B"]],
      ["Eraser", ["Alt", "E"]],
      ["Rectangle", ["Alt", "Shift", "R"]],
      ["Undo", ["Ctrl", "Z"]],
      ["Redo", ["Ctrl", "Y"]],
      ["Select all drawings", ["Ctrl", "A"]],
      ["Copy drawings", ["Ctrl", "C"]],
      ["Paste drawings", ["Ctrl", "V"]],
      ["Remove selected drawings", ["Delete"]],
      ["Hide all drawings", ["Ctrl", "Alt", "H"]],
    ],
  },
];

export default function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEscapeClose(onClose);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = SHORTCUT_GROUPS
    .map(g => ({ ...g, items: g.items.filter(([label, keys]) => !q || label.toLowerCase().includes(q) || keys.join(" ").toLowerCase().includes(q)) }))
    .filter(g => g.items.length > 0);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10005, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "560px", maxWidth: "calc(100vw - 32px)", height: "640px", maxHeight: "calc(100vh - 64px)",
        display: "flex", flexDirection: "column", backgroundColor: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)",
        border: "1px solid var(--tv-color-border)", borderRadius: "8px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: "64px", flexShrink: 0 }}>
          <span style={{ fontSize: "20px", fontWeight: 600 }}>Keyboard shortcuts</span>
          <button onClick={onClose} className="tv-icon-btn" style={{ width: "28px", height: "28px", color: "var(--tv-color-text)" }} aria-label="Close">
            <X size={22} strokeWidth={1.25} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", height: "42px", padding: "0 20px", flexShrink: 0, borderTop: "1px solid var(--tv-color-border)", borderBottom: "1px solid var(--tv-color-border)" }}>
          <Search size={18} strokeWidth={1.25} style={{ color: "var(--tv-color-text-muted)", flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search"
            autoFocus
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--tv-color-text)", fontSize: "15px" }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 12px" }}>
          {groups.length === 0 && (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--tv-color-text-muted)", fontSize: "14px" }}>No shortcuts match “{query}”</div>
          )}
          {groups.map(g => (
            <div key={g.title}>
              <div style={{ padding: "16px 20px 6px", fontSize: "11px", color: "var(--tv-color-text-muted)", letterSpacing: "0.4px", textTransform: "uppercase" }}>{g.title}</div>
              {g.items.map(([label, keys]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "0 20px", minHeight: "34px", fontSize: "14px" }}>
                  <span>{label}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", flexShrink: 0, color: "var(--tv-color-text-muted)", fontSize: "12px" }}>
                    {keys.map((k, i) => (
                      <React.Fragment key={k}>
                        {i > 0 && "+"}
                        <span style={{ padding: "1px 6px", borderRadius: "4px", border: "1px solid var(--tv-color-border)", color: "var(--tv-color-text)", fontWeight: 600, lineHeight: "18px" }}>{k}</span>
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
