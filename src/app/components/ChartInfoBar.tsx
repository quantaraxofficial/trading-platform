"use client";

import { useMemo } from "react";

interface ChartInfoBarProps {
  symbol: string;
  intervalLabel: string;
  exchange?: string;
  barData?: {
    open: number;
    high: number;
    low: number;
    close: number;
  } | null;
  prevClose?: number;
  volume?: string;
}

export default function ChartInfoBar({ symbol, intervalLabel, exchange = "NASDAQ", barData, prevClose, volume }: ChartInfoBarProps) {
  const formatPrice = (val: number) => {
    if (val >= 1000) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
    if (val >= 100) return val.toFixed(3);
    if (val >= 1) return val.toFixed(4);
    return val.toFixed(5);
  };

  const change = useMemo(() => {
    if (!barData || !prevClose) return null;
    const diff = barData.close - prevClose;
    const pct = (diff / prevClose) * 100;
    return { diff, pct, positive: diff >= 0 };
  }, [barData, prevClose]);

  const changeColor = change ? (change.positive ? "#089981" : "#f23645") : "#787b86";

  // Derive full symbol name
  const symbolName = useMemo(() => {
    const names: Record<string, string> = {
      "AAPL": "Apple Inc.",
      "GOOGL": "Alphabet Inc.",
      "MSFT": "Microsoft Corporation",
      "TSLA": "Tesla, Inc.",
      "AMZN": "Amazon.com, Inc.",
      "META": "Meta Platforms, Inc.",
      "NVDA": "NVIDIA Corporation",
      "SPX": "S&P 500",
      "XAUUSD": "Gold Spot / U.S. Dollar",
      "BTCUSD": "Bitcoin / U.S. Dollar",
      "EURUSD": "Euro / U.S. Dollar",
    };
    return names[symbol] || symbol;
  }, [symbol]);

  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      zIndex: 10,
      padding: "8px 12px",
      pointerEvents: "none",
      userSelect: "none",
      display: "flex",
      flexDirection: "column",
      gap: "2px",
    }}>
      {/* Symbol info line */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
        <span style={{ color: "var(--tv-color-text)", fontWeight: 700, fontSize: "13px" }}>{symbolName}</span>
        <span style={{ color: "var(--tv-color-text-muted)" }}>·</span>
        <span style={{ color: "var(--tv-color-text-muted)" }}>{intervalLabel}</span>
        <span style={{ color: "var(--tv-color-text-muted)" }}>·</span>
        <span style={{ color: "var(--tv-color-text-muted)" }}>{exchange}</span>
      </div>

      {/* OHLC values */}
      {barData && (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", flexWrap: "wrap" }}>
          <span style={{ color: "var(--tv-color-text-muted)" }}>O</span>
          <span style={{ color: changeColor, fontWeight: 500 }}>{formatPrice(barData.open)}</span>

          <span style={{ color: "var(--tv-color-text-muted)", marginLeft: "4px" }}>H</span>
          <span style={{ color: changeColor, fontWeight: 500 }}>{formatPrice(barData.high)}</span>

          <span style={{ color: "var(--tv-color-text-muted)", marginLeft: "4px" }}>L</span>
          <span style={{ color: changeColor, fontWeight: 500 }}>{formatPrice(barData.low)}</span>

          <span style={{ color: "var(--tv-color-text-muted)", marginLeft: "4px" }}>C</span>
          <span style={{ color: changeColor, fontWeight: 500 }}>{formatPrice(barData.close)}</span>

          {change && (
            <>
              <span style={{ color: changeColor, fontWeight: 500, marginLeft: "8px" }}>
                {change.positive ? "+" : ""}{change.diff.toFixed(2)}
              </span>
              <span style={{ color: changeColor, fontWeight: 500 }}>
                ({change.positive ? "+" : ""}{change.pct.toFixed(2)}%)
              </span>
            </>
          )}
        </div>
      )}

      {/* Volume line */}
      {volume && (
        <div style={{ fontSize: "11px", color: "var(--tv-color-text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
          <span>Vol · Ticks</span>
          <span style={{ color: "#089981", fontWeight: 500 }}>{volume}</span>
        </div>
      )}
    </div>
  );
}
