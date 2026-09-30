"use client";

// The strategy report's place in the bottom panel (as on TradingView): whether it's expanded or
// collapsed to its tab, its height, maximized, and the report's own choices (Metrics or Trades
// view, the List of trades' columns, the script execution options) — kept across reloads.
// Whether a strategy is on the chart at all is live state, not saved.

import { useSyncExternalStore } from "react";
import { makeStore } from "../../trading/settings";

export type TradeColumn = "dateTime" | "signal" | "price" | "size" | "netPnl" | "return" | "commission" | "fe" | "ae" | "cumPnl" | "duration";

export const TRADE_COLUMNS: { key: TradeColumn; label: string }[] = [
  { key: "dateTime", label: "Date and time" },
  { key: "signal", label: "Signal" },
  { key: "price", label: "Price" },
  { key: "size", label: "Size" },
  { key: "netPnl", label: "Net PnL" },
  { key: "return", label: "Return" },
  { key: "commission", label: "Commission" },
  { key: "fe", label: "Favorable excursion" },
  { key: "ae", label: "Adverse excursion" },
  { key: "cumPnl", label: "Cumulative PnL" },
  { key: "duration", label: "Duration (bars)" },
];
export const DEFAULT_COLUMNS: TradeColumn[] = ["dateTime", "price", "size", "netPnl", "return"];

export interface StrategyDock {
  expanded: boolean;
  height: number;
  maximized: boolean;
  view: "metrics" | "trades";
  columns: TradeColumn[];
  // Script execution: recalculate on every real-time update of the last bar (besides bar close)
  onRealtimeTick: boolean;
}

export const strategyDock = makeStore<StrategyDock>("tv:strategyDock", {
  expanded: true, height: 400, maximized: false, view: "metrics", columns: DEFAULT_COLUMNS, onRealtimeTick: false,
});

// Is a strategy's report available (a strategy on the chart)? And its name, for the tab
let present: { on: boolean; title: string } = { on: false, title: "" };
const listeners = new Set<() => void>();
export const strategyPresence = {
  get: () => present,
  set: (v: { on: boolean; title: string }) => {
    if (v.on === present.on && v.title === present.title) return;
    present = v;
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
const serverPresence = { on: false, title: "" };
export function useStrategyPresence() {
  return useSyncExternalStore(strategyPresence.subscribe, strategyPresence.get, () => serverPresence);
}

export const STRATEGY_HOST_ID = "tv-strategy-bottom-host";
