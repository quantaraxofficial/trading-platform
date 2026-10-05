"use client";

import React, { useEffect, useRef, useState } from "react";
import { useEscapeClose } from "../../../lib/useEscapeClose";

// Asks for the link a Post (X post) or Idea (TradingView idea) drawing shows; Esc / Cancel drops it
export function LinkPromptDialog({ kind, onSubmit, onCancel }: { kind: "post" | "idea"; onSubmit: (url: string) => void; onCancel: () => void }) {
  useEscapeClose(onCancel);
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // focused once the click that placed the drawing has finished (its mouseup would take focus back)
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 60); return () => clearTimeout(t); }, []);
  const ok = kind === "post" ? /(x|twitter)\.com\/.+/i.test(url) : /tradingview\.com\/.+/i.test(url);
  const submit = () => { if (ok) onSubmit(url.trim()); };
  return (
    <div onMouseDown={onCancel} style={{ position: "fixed", inset: 0, zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)" }}>
      <div role="dialog" aria-label={kind === "post" ? "Add post" : "Add idea"} onMouseDown={e => e.stopPropagation()}
        style={{ width: 420, padding: 24, borderRadius: 8, background: "var(--tv-color-pane-bg, #fff)", color: "var(--tv-hdr-text, #131722)", boxShadow: "0 2px 12px rgba(0,0,0,0.3)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif" }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>{kind === "post" ? "Add post" : "Add idea"}</div>
        <div style={{ fontSize: 13, marginBottom: 8, color: "var(--tv-legend-args, #787b86)" }}>
          {kind === "post" ? "Paste the link to a post on X" : "Paste the link to an idea on TradingView"}
        </div>
        <input ref={inputRef} autoFocus value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder={kind === "post" ? "https://x.com/…/status/…" : "https://www.tradingview.com/chart/…"}
          style={{ width: "100%", boxSizing: "border-box", height: 36, padding: "0 10px", fontSize: 14, borderRadius: 6, border: "1px solid var(--tv-color-border, #dbdbdb)", background: "transparent", color: "inherit", outline: "none" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onCancel} style={{ height: 34, padding: "0 14px", borderRadius: 6, border: "1px solid var(--tv-color-border, #dbdbdb)", background: "transparent", color: "inherit", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={submit} disabled={!ok} style={{ height: 34, padding: "0 16px", borderRadius: 6, border: "none", background: ok ? "var(--tv-hdr-text, #131722)" : "#b2b5be", color: "var(--tv-color-pane-bg, #fff)", fontSize: 14, cursor: ok ? "pointer" : "default" }}>Add</button>
        </div>
      </div>
    </div>
  );
}
