// The app-wide paper-trading engine instance and the transient trading UI state shared by the
// chart overlay, the order ticket, the account manager and the dialogs.

import { useSyncExternalStore } from "react";
import { PaperTradingEngine, EngineState, Side, OrderType, TimeInForce, quoteOf, activeBook } from "./engine";
import { tradingSettings, ticketPrefs } from "./settings";
import { defaultQtyOf } from "./instruments";

export const engine = new PaperTradingEngine();

export function useEngineState(): EngineState {
  return useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
}

// ---------- UI state ----------

export interface TicketRequest {
  open: boolean;
  symbol: string;
  side: Side;
  type: OrderType;
  price?: number;            // initial limit/stop price (chart menus, Shift+T)
  qty?: number;              // initial quantity (the DOM's)
  tif?: TimeInForce;         // initial time in force (the DOM's)
  modifyOrderId?: string;    // modifying a working order
  floating?: boolean;        // float over the chart even when the panel is docked (DOM clicks)
  nonce: number;             // changes whenever the ticket should re-initialize
}

// An order drawn on the chart before it's sent: the open ticket's limit/stop (or market, when
// "Project order for market orders" is on), or one created from the chart's menus
export interface ProjectOrder {
  source: "ticket" | "chart";
  symbol: string;
  side: Side;
  type: OrderType;
  price: number;
  qty: number;
  tp?: number;
  sl?: number;
  valid: boolean;
}

// A chart drag waiting for Confirm/Discard (when one-click trading is off)
export interface PendingEdit {
  symbol: string;
  kind: "exit" | "order";
  orderId?: string;          // the order being moved (existing exit or working order)
  role?: "tp" | "sl";        // new or moved exit
  price: number;
}

export type TradingDialog =
  | { kind: "broker"; then?: { side: Side; symbol: string } }
  | { kind: "connect"; then?: { side: Side; symbol: string } }
  | { kind: "close"; symbol: string }
  | { kind: "reverse"; symbol: string }
  | { kind: "position"; symbol: string }
  | { kind: "createAccount" }
  | { kind: "accountSettings"; accountId: string };

export interface TradingUiState {
  chartSymbol: string;
  ticket: TicketRequest;
  project: ProjectOrder | null;
  // Chart drags of the ticket's projected lines, applied by the ticket
  projectPatch: { price?: number; tp?: number; sl?: number; nonce: number } | null;
  pending: PendingEdit | null;
  dialog: TradingDialog | null;
  panelRequest: number;      // bumps to open the account manager
  dock: { open: boolean; tab: "order" | "dom" };   // the order panel docked to the right
}

let ui: TradingUiState = {
  chartSymbol: "",
  ticket: { open: false, symbol: "", side: "buy", type: "market", nonce: 0 },
  project: null,
  projectPatch: null,
  pending: null,
  dialog: null,
  panelRequest: 0,
  dock: { open: false, tab: "order" },
};
const uiListeners = new Set<() => void>();

export const tradingUi = {
  get: () => ui,
  set(patch: Partial<TradingUiState> | ((prev: TradingUiState) => Partial<TradingUiState>)) {
    const p = typeof patch === "function" ? patch(ui) : patch;
    ui = { ...ui, ...p };
    uiListeners.forEach(l => l());
  },
  subscribe(l: () => void) { uiListeners.add(l); return () => { uiListeners.delete(l); }; },
};

export function useTradingUi(): TradingUiState {
  return useSyncExternalStore(tradingUi.subscribe, tradingUi.get, tradingUi.get);
}

// ---------- actions ----------

export function openTicket(req: { symbol: string; side: Side; type?: OrderType; price?: number; qty?: number; tif?: TimeInForce; modifyOrderId?: string; floating?: boolean }) {
  const docked = ticketPrefs.get().docked && !req.floating;
  tradingUi.set(prev => ({
    ticket: {
      open: true, symbol: req.symbol, side: req.side, type: req.type || "market", price: req.price, qty: req.qty, tif: req.tif,
      modifyOrderId: req.modifyOrderId, floating: !!req.floating, nonce: prev.ticket.nonce + 1,
    },
    project: prev.project?.source === "chart" ? null : prev.project,
    dock: docked ? { open: true, tab: "order" } : prev.dock,
  }));
}

export function closeTicket() {
  tradingUi.set(prev => {
    const dockedTicket = ticketPrefs.get().docked && !prev.ticket.floating && prev.dock.tab === "order";
    return {
      ticket: { ...prev.ticket, open: false },
      project: prev.project?.source === "ticket" ? null : prev.project,
      dock: dockedTicket ? { ...prev.dock, open: false } : prev.dock,
    };
  });
}

// The docked panel's Order | DOM switch
export function showDockTab(tab: "order" | "dom") {
  const ui = tradingUi.get();
  if (tab === "order") {
    if (ui.ticket.open && !ui.ticket.floating) tradingUi.set({ dock: { open: true, tab: "order" } });
    else openTicket({ symbol: ui.chartSymbol, side: "buy", type: "market" });
  } else {
    tradingUi.set(prev => ({
      dock: { open: true, tab: "dom" },
      // The docked ticket gives way to the DOM; a floating one stays
      ticket: prev.ticket.floating ? prev.ticket : { ...prev.ticket, open: false },
      project: !prev.ticket.floating && prev.project?.source === "ticket" ? null : prev.project,
    }));
  }
}

export function closeDock() {
  tradingUi.set(prev => ({
    dock: { ...prev.dock, open: false },
    ticket: prev.ticket.floating ? prev.ticket : { ...prev.ticket, open: false },
    project: !prev.ticket.floating && prev.project?.source === "ticket" ? null : prev.project,
  }));
}

// "Dock to right" / "Undock order panel"
export function setDocked(docked: boolean) {
  ticketPrefs.set({ docked });
  tradingUi.set(prev => ({
    ticket: { ...prev.ticket, floating: false },
    dock: docked ? { open: prev.ticket.open, tab: "order" } : { ...prev.dock, open: false },
  }));
}

export function lastQtyFor(symbol: string): number {
  return ticketPrefs.get().qtyBySymbol[symbol] ?? defaultQtyOf(symbol);
}

// The chart's Buy/Sell buttons, Shift+B/S: needs a connected broker; with one-click trading a
// market order goes straight out at the last ticket quantity, otherwise the ticket opens
export function requestTrade(side: Side, symbol: string) {
  const s = engine.getState();
  if (!s.connected) {
    tradingUi.set({ dialog: { kind: "broker", then: { side, symbol } } });
    return;
  }
  if (tradingSettings.get().oneClickTrading) {
    engine.placeOrder({ symbol, side, type: "market", qty: lastQtyFor(symbol) });
    return;
  }
  openTicket({ symbol, side, type: "market" });
}

// "Buy 1 AAPL @ 180.00 limit" from the chart menus: a projected order on the chart to send
// with its Buy/Sell button (placed straight away with one-click trading)
export function projectChartOrder(symbol: string, side: Side, type: "limit" | "stop", price: number) {
  const s = engine.getState();
  if (!s.connected) {
    tradingUi.set({ dialog: { kind: "broker", then: { side, symbol } } });
    return;
  }
  const qty = lastQtyFor(symbol);
  if (tradingSettings.get().oneClickTrading) {
    engine.placeOrder({ symbol, side, type, qty, price });
    return;
  }
  closeTicket();
  tradingUi.set({ project: { source: "chart", symbol, side, type, price, qty, valid: true } });
}

// Limit when the price is on the favourable side of the market, stop otherwise
export function orderTypeAt(symbol: string, side: Side, price: number): "limit" | "stop" {
  const q = quoteOf(engine.getState(), symbol);
  if (!q) return "limit";
  return side === "buy" ? (price <= q.ask ? "limit" : "stop") : (price >= q.bid ? "limit" : "stop");
}

export function sendChartProject() {
  const p = tradingUi.get().project;
  if (!p || p.source !== "chart") return;
  const levels = p.tp !== undefined || p.sl !== undefined ? [{ qty: p.qty, tp: p.tp, sl: p.sl }] : undefined;
  const r = engine.placeOrder({ symbol: p.symbol, side: p.side, type: p.type, qty: p.qty, price: p.type === "market" ? undefined : p.price, levels });
  if (r.ok) tradingUi.set({ project: null });
}

export function hasOpenPosition(symbol: string): boolean {
  return activeBook(engine.getState()).positions.some(p => p.symbol === symbol);
}

export function openAccountManager() {
  tradingUi.set(prev => ({ panelRequest: prev.panelRequest + 1 }));
  window.dispatchEvent(new CustomEvent("tv:open-trading-panel"));
}
