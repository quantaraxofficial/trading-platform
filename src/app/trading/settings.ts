// Trading preferences (chart settings → Trading tab) and the order ticket's remembered
// choices, stored in localStorage with a tiny subscribe API for React.

import { useSyncExternalStore } from "react";

export type PnlMode = "Money" | "Ticks" | "Percentage";
export type QtyMode = "units" | "usdMargin" | "pctBalance" | "riskUsd" | "riskPct";
export type ExitMode = "price" | "ticks" | "pctPrice" | "money" | "pctBalance";

export interface TradingSettings {
  buySellButtons: boolean;
  oneClickTrading: boolean;
  executionSound: boolean;
  executionSoundVolume: number;
  executionSoundName: string;
  onlyRejectionNotifications: boolean;
  positionsAndOrders: boolean;
  reversePositionButton: boolean;
  projectOrderForMarket: boolean;
  pnlValue: boolean;
  pnlPositions: boolean;
  pnlPositionsMode: PnlMode;
  pnlBrackets: boolean;
  pnlBracketsMode: PnlMode;
  executionMarks: boolean;
  executionLabels: boolean;
  extendedPriceLines: boolean;
  alignment: "Left" | "Right";
  tradesInSnapshots: boolean;
}

export interface OrderPreset {
  id: string;
  name: string;
  type: "market" | "limit" | "stop";
  tpTicks?: number;
  slTicks?: number;
}

export interface TicketPrefs {
  qtyBySymbol: Record<string, number>;
  qtyMode: QtyMode;
  qtySecondary: QtyMode;
  riskUsd: number;
  riskPct: number;
  tpMode: ExitMode;
  slMode: ExitMode;
  tpSecondary: ExitMode;
  slSecondary: ExitMode;
  tpTicks: number | null;       // last used distances (null → derived from volatility)
  slTicks: number | null;
  exitsOpen: boolean;
  extraOpen: boolean;
  docked: boolean;
  slEnablesRiskQty: boolean;
  presets: OrderPreset[];
  floatingPos: { x: number; y: number } | null;
  defaultRiskPct: number | null;     // "Set as default risk %": new tickets size by this risk
  domShowZeroVolume: boolean;        // DOM panel settings
  domShowInsideSpread: boolean;
  domDetailsOpen: boolean;
  domTif: "Day" | "Week" | "Month" | "GTD";
}

export const DEFAULT_SETTINGS: TradingSettings = {
  buySellButtons: true,
  oneClickTrading: false,
  executionSound: false,
  executionSoundVolume: 60,
  executionSoundName: "Alarm Clock",
  onlyRejectionNotifications: false,
  positionsAndOrders: true,
  reversePositionButton: true,
  projectOrderForMarket: false,
  pnlValue: true,
  pnlPositions: true,
  pnlPositionsMode: "Money",
  pnlBrackets: true,
  pnlBracketsMode: "Money",
  executionMarks: true,
  executionLabels: false,
  extendedPriceLines: true,
  alignment: "Right",
  tradesInSnapshots: false,
};

export const DEFAULT_TICKET: TicketPrefs = {
  qtyBySymbol: {},
  qtyMode: "units",
  qtySecondary: "usdMargin",
  riskUsd: 25,
  riskPct: 0.5,
  tpMode: "price",
  slMode: "price",
  tpSecondary: "ticks",
  slSecondary: "ticks",
  tpTicks: null,
  slTicks: null,
  exitsOpen: true,
  extraOpen: true,
  docked: false,
  slEnablesRiskQty: false,
  presets: [],
  floatingPos: null,
  defaultRiskPct: null,
  domShowZeroVolume: true,
  domShowInsideSpread: true,
  domDetailsOpen: false,
  domTif: "Day",
};

export function makeStore<T extends object>(key: string, defaults: T, migrate?: (apply: (v: Partial<T>) => void) => void) {
  let value: T = defaults;
  let loaded = false;
  const listeners = new Set<() => void>();
  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) value = { ...defaults, ...JSON.parse(raw) };
      migrate?.(v => { value = { ...value, ...v }; });
    } catch { /* ignore */ }
  };
  const get = () => { load(); return value; };
  const set = (patch: Partial<T> | ((prev: T) => Partial<T>)) => {
    load();
    const p = typeof patch === "function" ? patch(value) : patch;
    value = { ...value, ...p };
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    listeners.forEach(l => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    // Other tabs
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try { value = e.newValue ? { ...defaults, ...JSON.parse(e.newValue) } : defaults; } catch { /* ignore */ }
      l();
    };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
  };
  const useValue = () => useSyncExternalStore(subscribe, get, () => defaults);
  return { get, set, subscribe, useValue };
}

export const tradingSettings = makeStore<TradingSettings>("tv:tradingSettings", DEFAULT_SETTINGS);
export const ticketPrefs = makeStore<TicketPrefs>("tv:orderTicket", DEFAULT_TICKET, apply => {
  // The earlier order panel kept its default risk % under its own key
  const legacy = localStorage.getItem("tv_default_risk_percent");
  if (legacy !== null) {
    const v = parseFloat(legacy);
    if (v > 0) apply({ defaultRiskPct: v } as Partial<TicketPrefs>);
    localStorage.removeItem("tv_default_risk_percent");
    try { localStorage.setItem("tv:orderTicket", JSON.stringify({ ...JSON.parse(localStorage.getItem("tv:orderTicket") || "{}"), defaultRiskPct: v > 0 ? v : null })); } catch { /* ignore */ }
  }
});

export const useTradingSettings = tradingSettings.useValue;
export const useTicketPrefs = ticketPrefs.useValue;
