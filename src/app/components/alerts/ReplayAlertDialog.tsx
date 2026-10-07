"use client";

// What TradingView shows instead of the alert dialog while Bar Replay is on: alerts run on
// live prices, so they can't be created (or edited) against replayed bars. No backdrop;
// ✕, "Got it", Escape or a click outside closes it.

import React, { useEffect, useRef } from "react";
import { useEscapeClose } from "../../lib/useEscapeClose";

export default function ReplayAlertDialog({ theme, onClose }: { theme?: string; onClose: () => void }) {
  useEscapeClose(onClose);
  const ref = useRef<HTMLDivElement>(null);
  const dark = theme === "dark";

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    // After the click that opened it
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDown); };
  }, [onClose]);

  const c = dark
    ? { bg: "#1e222d", text: "#d1d4dc", btnBg: "#f2f2f2", btnText: "#0f0f0f", hover: "rgba(255,255,255,0.08)" }
    : { bg: "#ffffff", text: "#131722", btnBg: "#0f0f0f", btnText: "#ffffff", hover: "rgba(0,0,0,0.06)" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10005, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div ref={ref} role="dialog" aria-modal="false" aria-labelledby="replay-alert-title"
        style={{ pointerEvents: "auto", position: "relative", width: 480, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", background: c.bg, color: c.text, borderRadius: 6, boxShadow: "0 2px 4px rgba(0, 0, 0, 0.4)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif" }}>
        <div style={{ margin: "40px 40px 40px 40px" }}>
          <div id="replay-alert-title" style={{ fontSize: 20, lineHeight: "24px", fontWeight: 600, marginBottom: 8, paddingRight: 24 }}>Oops. This is replay mode</div>
          <div style={{ fontSize: 16, lineHeight: "24px", padding: "8px 0" }}>Alerts are not currently available in replay mode.</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" onClick={onClose} autoFocus
              style={{ height: 34, padding: "0 11px", borderRadius: 8, border: `1px solid ${c.btnBg}`, background: c.btnBg, color: c.btnText, fontSize: 16, lineHeight: "24px", cursor: "pointer", fontFamily: "inherit" }}>
              Got it
            </button>
          </div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose}
          onMouseEnter={e => (e.currentTarget.style.background = c.hover)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          style={{ position: "absolute", top: 8, right: 8, width: 34, height: 34, padding: 8, border: "none", borderRadius: 8, background: "transparent", color: c.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17" width="17" height="17" fill="currentColor"><path d="m.58 1.42.82-.82 15 15-.82.82z" /><path d="m.58 15.58 15-15 .82.82-15 15z" /></svg>
        </button>
      </div>
    </div>
  );
}
