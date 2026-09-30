// Conversions behind the order ticket: quantity modes (units, margin, % balance, risk) and
// TP/SL modes (price, ticks, % price, money, % balance).

import type { Side } from "./engine";
import type { ExitMode, QtyMode } from "./settings";

export interface TicketCtx {
  side: Side;
  entry: number;       // expected fill: ask/bid for market, the order price otherwise
  leverage: number;
  equity: number;
  available: number;   // available funds
  precision: number;
}

export const QTY_MODE_LABEL: Record<QtyMode, string> = {
  units: "Units",
  usdMargin: "USD margin",
  pctBalance: "% balance",
  riskUsd: "Risk, USD",
  riskPct: "Risk, % balance",
};

export const QTY_MODE_INFO: Partial<Record<QtyMode, string>> = {
  usdMargin: "Order size in cash equivalent, adjusted for leverage",
  pctBalance: "Order size in equity percentage equivalent",
  riskUsd: "Order size equivalent to the risk amount in cash, based on the set stop loss price. Changing the risk amount or stop loss price changes the quantity.",
  riskPct: "Order size equivalent to the equity percentage based on the set stop loss price. Changing the risk percentage or stop loss price changes the quantity.",
};

export const isRiskMode = (m: QtyMode) => m === "riskUsd" || m === "riskPct";

export function qtyFromAnchor(mode: QtyMode, anchor: number, c: TicketCtx, slPrice: number | null): number {
  if (!isFinite(anchor) || anchor <= 0 || !(c.entry > 0)) return 0;
  switch (mode) {
    case "units": return anchor;
    case "usdMargin": return (anchor * c.leverage) / c.entry;
    case "pctBalance": return ((anchor / 100) * c.equity * c.leverage) / c.entry;
    case "riskUsd": {
      const dist = slPrice !== null ? Math.abs(c.entry - slPrice) : 0;
      return dist > 0 ? anchor / dist : 0;
    }
    case "riskPct": {
      const dist = slPrice !== null ? Math.abs(c.entry - slPrice) : 0;
      return dist > 0 ? ((anchor / 100) * c.equity) / dist : 0;
    }
  }
}

export function anchorFromQty(mode: QtyMode, qty: number, c: TicketCtx, slPrice: number | null): number {
  if (!isFinite(qty) || qty <= 0) return 0;
  const margin = (qty * c.entry) / c.leverage;
  const risk = slPrice !== null ? qty * Math.abs(c.entry - slPrice) : NaN;
  switch (mode) {
    case "units": return qty;
    case "usdMargin": return margin;
    case "pctBalance": return c.equity > 0 ? (margin / c.equity) * 100 : 0;
    case "riskUsd": return risk;
    case "riskPct": return c.equity > 0 ? (risk / c.equity) * 100 : NaN;
  }
}

export function formatAnchor(mode: QtyMode, value: number, qtyDecimals: number): string {
  if (!isFinite(value)) return "—";
  if (mode === "units") return String(Math.round(value * Math.pow(10, qtyDecimals)) / Math.pow(10, qtyDecimals));
  return value.toFixed(2);
}

// ---- exits ----

export const EXIT_MODE_NAME: Record<ExitMode, string> = {
  price: "Price",
  ticks: "Ticks",
  pctPrice: "% price",
  money: "USD",
  pctBalance: "% balance",
};

export function exitModeName(mode: ExitMode, role: "tp" | "sl"): string {
  if (mode === "money") return role === "tp" ? "Reward, USD" : "Risk, USD";
  if (mode === "pctBalance") return role === "tp" ? "Reward, % balance" : "Risk, % balance";
  return EXIT_MODE_NAME[mode];
}

// "Take profit, price" / "Stop loss, ticks" / "Reward, USD"
export function exitLabel(mode: ExitMode, role: "tp" | "sl"): string {
  if (mode === "money" || mode === "pctBalance") return exitModeName(mode, role);
  return `${role === "tp" ? "Take profit" : "Stop loss"}, ${EXIT_MODE_NAME[mode].toLowerCase()}`;
}

export const EXIT_MODE_INFO: Partial<Record<ExitMode, string>> = {
  ticks: "Distance from the entry price in ticks, the minimum price movement of the symbol",
  pctPrice: "Distance from the entry price as a percentage of that price",
  money: "Profit or loss in cash if this level is reached",
  pctBalance: "Profit or loss as a percentage of the account equity if this level is reached",
};

// +1 when the level is above the entry
function exitDir(side: Side, role: "tp" | "sl") {
  const up = side === "buy" ? role === "tp" : role === "sl";
  return up ? 1 : -1;
}

export function exitValue(mode: ExitMode, price: number, role: "tp" | "sl", qty: number, c: TicketCtx): number {
  const tick = Math.pow(10, -c.precision);
  const dist = (price - c.entry) * exitDir(c.side, role);
  switch (mode) {
    case "price": return price;
    case "ticks": return Math.round(dist / tick);
    case "pctPrice": return c.entry > 0 ? (dist / c.entry) * 100 : 0;
    case "money": return dist * qty;
    case "pctBalance": return c.equity > 0 ? ((dist * qty) / c.equity) * 100 : 0;
  }
}

export function exitPriceFrom(mode: ExitMode, value: number, role: "tp" | "sl", qty: number, c: TicketCtx): number {
  const tick = Math.pow(10, -c.precision);
  let dist: number;
  switch (mode) {
    case "price": return value;
    case "ticks": dist = value * tick; break;
    case "pctPrice": dist = (value / 100) * c.entry; break;
    case "money": dist = qty > 0 ? value / qty : 0; break;
    case "pctBalance": dist = qty > 0 ? ((value / 100) * c.equity) / qty : 0; break;
  }
  const f = Math.pow(10, c.precision);
  return Math.round((c.entry + dist * exitDir(c.side, role)) * f) / f;
}

export function formatExitValue(mode: ExitMode, value: number, precision: number): string {
  if (!isFinite(value)) return "—";
  if (mode === "price") return value.toFixed(precision);
  if (mode === "ticks") return String(Math.round(value));
  return value.toFixed(2);
}

// Default TP/SL distances in ticks from the chart's recent volatility (average true range):
// TP three ranges away, SL one
export function defaultExitTicks(symbol: string, precision: number): { tp: number; sl: number } {
  const tick = Math.pow(10, -precision);
  let atr = 0;
  try {
    const w = window as any;
    const bars: any[] = w.__chartFullData || [];
    if (bars.length > 15) {
      const recent = bars.slice(-15);
      let sum = 0;
      for (let i = 1; i < recent.length; i++) {
        const b = recent[i], p = recent[i - 1];
        sum += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
      }
      atr = sum / (recent.length - 1);
    }
  } catch { /* no chart data */ }
  if (!(atr > 0)) {
    const last = (() => { try { const b = (window as any).__chartFullData; return b?.[b.length - 1]?.close || 0; } catch { return 0; } })();
    atr = last > 0 ? last * 0.002 : tick * 20;
  }
  void symbol;
  const sl = Math.max(1, Math.round(atr / tick));
  return { tp: sl * 3, sl };
}
