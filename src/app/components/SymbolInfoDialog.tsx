"use client";

import React from "react";
import { useEscapeClose } from "../lib/useEscapeClose";
import { useSymbolInfo } from "../utils/symbolInfo";

// TradingView's "Symbol info" dialog (a candle's right-click menu): the symbol's identity, type,
// exchange, currency and tick size, and today's trading session drawn on a 24-hour bar in the
// exchange's timezone with a marker at the current time.

type Session = { tz: string; tzLabel: string; open: number | null; close: number | null; label: string } // minutes from midnight

function sessionFor(kind: "crypto" | "forex" | "stock", now: Date): Session {
  if (kind === "crypto") return { tz: "UTC", tzLabel: "UTC", open: 0, close: 1440, label: "24/7" };
  if (kind === "forex") {
    // Sunday 22:00 to Friday 22:00 UTC
    const d = now.getUTCDay();
    if (d === 6) return { tz: "UTC", tzLabel: "UTC", open: null, close: null, label: "Closed" };
    if (d === 0) return { tz: "UTC", tzLabel: "UTC", open: 22 * 60, close: 1440, label: "22:00–24:00" };
    if (d === 5) return { tz: "UTC", tzLabel: "UTC", open: 0, close: 22 * 60, label: "00:00–22:00" };
    return { tz: "UTC", tzLabel: "UTC", open: 0, close: 1440, label: "24h" };
  }
  // US stocks: 09:30–16:00 New York time, weekdays
  const dayNY = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
  if (dayNY === 0 || dayNY === 6) return { tz: "America/New_York", tzLabel: "America/New_York", open: null, close: null, label: "Closed" };
  return { tz: "America/New_York", tzLabel: "America/New_York", open: 9 * 60 + 30, close: 16 * 60, label: "09:30–16:00" };
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default function SymbolInfoDialog({ symbol, precision, onClose }: { symbol: string; precision: number; onClose: () => void }) {
  useEscapeClose(onClose);
  const info = useSymbolInfo(symbol);
  const isPair = symbol.includes("/");
  const t = (info.type || "").toLowerCase();
  const kind: "crypto" | "forex" | "stock" = /digital|crypto/.test(t) || /^(BTC|ETH|SOL|XRP|DOGE|ADA|BNB|LTC)\//i.test(symbol) ? "crypto" : isPair || /currency|forex|metal/.test(t) || info.exchange === "Forex" ? "forex" : "stock";
  const exchange = info.exchange || (kind === "crypto" ? "CRYPTO" : kind === "forex" ? "FOREX" : "NASDAQ");
  const ticker = `${exchange.toUpperCase()}:${symbol.replace("/", "")}`;
  const quote = isPair ? symbol.split("/")[1] : "USD";
  const typeText = kind === "crypto" ? "Spot crypto" : kind === "forex" ? (/^X(AU|AG|PT|PD)/i.test(symbol) ? "Commodity" : "Forex") : (/etf/.test(t) ? "Fund" : "Stock");
  const now = new Date();
  const ses = sessionFor(kind, now);
  const local = new Date(now.toLocaleString("en-US", { timeZone: ses.tz }));
  const nowMin = local.getHours() * 60 + local.getMinutes();

  const muted = "var(--tv-legend-args, #787b86)";
  const field = (label: string, value: React.ReactNode) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
  const grid = (children: React.ReactNode) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 24, rowGap: 16 }}>{children}</div>;
  const rule = <div style={{ height: 1, background: "var(--tv-color-border, #e0e3eb)", margin: "16px 0" }} />;

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div role="dialog" aria-label="Symbol info" data-name="symbol-info-dialog" onMouseDown={e => e.stopPropagation()}
        style={{ width: 480, borderRadius: 8, background: "var(--tv-color-pane-bg, #fff)", color: "var(--tv-hdr-text, #131722)", boxShadow: "0 2px 16px rgba(0,0,0,0.3)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 16px", borderBottom: "1px solid var(--tv-color-border, #e0e3eb)" }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Symbol info</div>
          <button type="button" aria-label="Close menu" onClick={onClose} style={{ width: 32, height: 32, border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M1 1l16 16M17 1L1 17" /></svg>
          </button>
        </div>
        <div style={{ padding: "18px 20px 20px" }}>
          {grid(<>{field("Symbol", ticker)}{field("Name", info.description || symbol)}</>)}
          {rule}
          {grid(<>
            {field("Type", typeText)}{field("Point value", "1")}
            {field("Listed exchange", exchange.toUpperCase())}{field("Exchange", exchange.toUpperCase())}
            {field("Currency", quote)}{field("Tick size", (1 / Math.pow(10, precision)).toFixed(precision))}
          </>)}
          {rule}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Session</div>
            <div style={{ fontSize: 13, color: muted }}>{ses.label}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, fontSize: 11, color: muted }}>{DAYS[local.getDay()]}</div>
            <div style={{ position: "relative", flex: 1, height: 8, borderRadius: 4, background: "var(--tv-color-border, #e0e3eb)" }}>
              {ses.open !== null && ses.close !== null && (
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(ses.open / 1440) * 100}%`, width: `${((ses.close - ses.open) / 1440) * 100}%`, borderRadius: 4, background: "#26a69a" }} />
              )}
              <div aria-label="Now" style={{ position: "absolute", top: -3, bottom: -3, width: 2, left: `calc(${(nowMin / 1440) * 100}% - 1px)`, background: "var(--tv-hdr-text, #131722)" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 0 40px", fontSize: 11, color: muted }}>
            <span>00:00</span>
            <span>24:00</span>
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: muted, marginTop: 10 }}>Exchange timezone: {ses.tzLabel}</div>
        </div>
      </div>
    </div>
  );
}
