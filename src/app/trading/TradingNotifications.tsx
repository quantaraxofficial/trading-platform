"use client";

// Order notifications, bottom-left like TradingView's: "Market order placed on AAPL",
// "Take Profit order executed on …", "Stop Loss order cancelled on …", rejections with the
// reason. Stacked when there are several, with "Show more / Show less".

import React, { useEffect, useRef, useState } from "react";
import { engine } from "./store";
import type { TradeNotice } from "./engine";
import { tradingSettings } from "./settings";
import { formatPrice, formatQty } from "./instruments";
import { C, SymbolAvatar } from "./ui";

const AUTO_HIDE_MS = 30000;
const MAX_KEPT = 20;

export default function TradingNotifications() {
  const [notices, setNotices] = useState<TradeNotice[]>([]);
  const [expanded, setExpanded] = useState(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => engine.onNotice(n => {
    if (tradingSettings.get().onlyRejectionNotifications && n.kind !== "rejected") return;
    setNotices(prev => [...prev, n].slice(-MAX_KEPT));
    timers.current.set(n.id, setTimeout(() => dismiss(n.id), AUTO_HIDE_MS));
  }), []);
  useEffect(() => () => { timers.current.forEach(t => clearTimeout(t)); }, []);
  useEffect(() => { if (notices.length <= 1) setExpanded(false); }, [notices.length]);

  function dismiss(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setNotices(prev => prev.filter(n => n.id !== id));
  }
  const dismissAll = () => { timers.current.forEach(t => clearTimeout(t)); timers.current.clear(); setNotices([]); };
  // Hovering keeps them up
  const pause = () => { timers.current.forEach(t => clearTimeout(t)); timers.current.clear(); };
  const resume = () => { for (const n of notices) if (!timers.current.has(n.id)) timers.current.set(n.id, setTimeout(() => dismiss(n.id), AUTO_HIDE_MS)); };

  if (notices.length === 0) return null;
  const shown = expanded ? notices : notices.slice(-1);
  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      aria-live="polite"
      style={{
        position: "fixed", left: "calc(var(--tv-left-toolbar-width) + 12px)", bottom: "calc(var(--tv-bottom-toolbar-height) + 12px)",
        width: 400, maxWidth: "calc(100vw - 24px)", zIndex: 2500, display: "flex", flexDirection: "column", gap: 8,
        maxHeight: "calc(100vh - var(--tv-bottom-toolbar-height) - 120px)",
      }}
    >
      {notices.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, fontSize: 13, color: C.text }}>
          <button type="button" onClick={() => setExpanded(e => !e)} style={{ border: "none", background: "transparent", color: C.text, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
            {expanded ? "Show less" : "Show more"}
            <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: "var(--tv-trade-toggle-on)", color: "var(--tv-trade-panel-bg)", fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{notices.length}</span>
          </button>
          <button type="button" aria-label="Dismiss all notifications" onClick={dismissAll} style={{ border: "none", background: "transparent", color: C.text, cursor: "pointer", display: "flex", padding: 2 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.3"><path d="M2.5 2.5l9 9M11.5 2.5l-9 9" /></svg>
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: expanded ? "auto" : "visible", position: "relative" }}>
        {shown.map((n, i) => <NoticeCard key={n.id} n={n} onClose={() => dismiss(n.id)} stacked={!expanded && notices.length > 1 && i === shown.length - 1} />)}
      </div>
    </div>
  );
}

function NoticeCard({ n, onClose, stacked }: { n: TradeNotice; onClose: () => void; stacked: boolean }) {
  const buy = n.side === "buy";
  const icon = n.kind === "placed"
    ? { bg: buy ? "rgba(41,98,255,0.12)" : "rgba(242,54,69,0.12)", fg: buy ? C.buy : C.sell, glyph: buy ? <path d="M5 12l5-5 5 5" /> : <path d="M5 8l5 5 5-5" /> }
    : n.kind === "cancelled"
      ? { bg: "rgba(120,123,134,0.14)", fg: "#787b86", glyph: <path d="M7 7l6 6M13 7l-6 6" /> }
      : n.kind === "rejected"
        ? { bg: "rgba(242,54,69,0.12)", fg: C.sell, glyph: <path d="M10 5.5v6M10 14.2v.3" /> }
        : { bg: "rgba(8,153,129,0.12)", fg: C.tp, glyph: <path d="M6.5 10.2l2.4 2.4 4.8-5.2" /> };
  return (
    <div style={{ position: "relative" }}>
      {stacked && (
        <>
          <div style={{ position: "absolute", left: 8, right: 8, bottom: -8, height: 20, borderRadius: 8, background: C.panel, boxShadow: C.shadow, opacity: 0.7 }} />
          <div style={{ position: "absolute", left: 4, right: 4, bottom: -4, height: 20, borderRadius: 8, background: C.panel, boxShadow: C.shadow, opacity: 0.85 }} />
        </>
      )}
      <div role="status" style={{ position: "relative", display: "flex", minHeight: 96, background: C.panel, color: C.text, borderRadius: 8, boxShadow: C.shadow, overflow: "hidden" }}>
        <div style={{ width: 48, background: icon.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: n.kind === "placed" ? "transparent" : icon.fg, color: n.kind === "placed" ? icon.fg : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={n.kind === "placed" ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">{icon.glyph}</svg>
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: "12px 12px 12px 12px" }}>
          <div style={{ fontSize: 15, lineHeight: "20px", paddingRight: 20 }}>{n.orderLabel} order {n.kind} on</div>
          <div style={{ marginTop: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.seg, borderRadius: 4, padding: "2px 6px", fontSize: 13 }}>
              <SymbolAvatar symbol={n.symbol} size={16} />{n.symbol}
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ background: buy ? "rgba(41,98,255,0.1)" : "rgba(242,54,69,0.1)", color: buy ? C.buy : C.sell, borderRadius: 4, padding: "1px 5px" }}>
              {buy ? "Buy" : "Sell"} {formatQty(n.qty)}
            </span>
            {n.price !== undefined && <span>at {formatPrice(n.price, n.precision)}</span>}
          </div>
          {n.reason && <div style={{ marginTop: 6, fontSize: 13, color: C.sell }}>{n.reason}</div>}
        </div>
        <button type="button" aria-label="Dismiss notification" onClick={onClose} style={{ position: "absolute", top: 10, right: 10, border: "none", background: "transparent", color: C.text, cursor: "pointer", display: "flex", padding: 2 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.3"><path d="M2.5 2.5l9 9M11.5 2.5l-9 9" /></svg>
        </button>
      </div>
    </div>
  );
}
