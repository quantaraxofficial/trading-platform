"use client";

import React, { useState } from "react";
import { useEscapeClose } from "../lib/useEscapeClose";

// TradingView's "Leave current replay?" — pressing Replay during a replay asks first.
// Stay (or ✕ / Esc) keeps replaying; Leave exits, saving the replay if the box is ticked.
export default function ReplayLeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: (save: boolean) => void }) {
  useEscapeClose(onStay);
  const [save, setSave] = useState(true);
  return (
    <div onMouseDown={onStay} style={{ position: "fixed", inset: 0, zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)" }}>
      <div
        role="dialog"
        aria-label="Leave current replay?"
        onMouseDown={e => e.stopPropagation()}
        style={{
          position: "relative", width: 480, boxSizing: "border-box", padding: "40px 40px 40px 40px", borderRadius: 8,
          background: "var(--tv-color-pane-bg, #ffffff)", color: "var(--tv-hdr-text, #131722)", boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        }}
      >
        <button type="button" aria-label="Close" onClick={onStay}
          style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M1 1l16 16M17 1L1 17" /></svg>
        </button>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: "28px", marginBottom: 16 }}>Leave current replay?</div>
        <div style={{ fontSize: 15, lineHeight: "22px", marginBottom: 18 }}>You can continue this replay later by saving it.</div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, cursor: "pointer", userSelect: "none" }}>
          <span role="checkbox" aria-checked={save} tabIndex={0}
            onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setSave(s => !s); } }}
            style={{ width: 18, height: 18, borderRadius: 4, boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: save ? "var(--tv-hdr-text, #131722)" : "transparent", border: save ? "none" : "1px solid currentColor", color: "var(--tv-color-pane-bg, #ffffff)" }}>
            {save && <svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 5l3.5 3.5L11 1" /></svg>}
          </span>
          <input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} style={{ display: "none" }} />
          Save this replay
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 36 }}>
          <button type="button" onClick={onStay}
            style={{ height: 34, padding: "0 11px", borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: "pointer", background: "transparent", color: "inherit", border: "1px solid var(--tv-color-border, #dbdbdb)" }}>
            Stay
          </button>
          <button type="button" onClick={() => onLeave(save)}
            style={{ height: 34, padding: "0 12px", borderRadius: 6, fontSize: 15, fontWeight: 500, cursor: "pointer", border: "none",
              background: "var(--tv-hdr-text, #131722)", color: "var(--tv-color-pane-bg, #ffffff)" }}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
