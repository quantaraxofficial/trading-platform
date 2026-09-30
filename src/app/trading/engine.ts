// Paper-trading engine: accounts, orders (with TP/SL brackets and multiple exit levels),
// netted positions, fills against a simulated bid/ask, margin, balance history, activity log,
// round-trip trades and execution marks. Pure TypeScript with a subscribe API so React (and
// persistence) can sit on top; every mutation works on a cloned draft and commits atomically.

import { simulatedQuote } from "@/app/utils/pricePrecision";
import {
  AssetClass, assetClassOf, DEFAULT_LEVERAGE, defaultPrecisionOf, formatPrice, formatQty, qtyStepOf, roundToTick,
} from "./instruments";

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop";
export type OrderRole = "entry" | "tp" | "sl";
export type OrderStatus = "working" | "inactive" | "filled" | "cancelled" | "rejected";
export type TimeInForce = "Day" | "Week" | "Month" | "GTD";

export interface ExitLevel { qty: number; tp?: number; sl?: number }

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  role: OrderRole;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  fillPrice?: number;
  levels?: ExitLevel[];      // entry orders: the exits attached once it fills
  parentId?: string;         // brackets: the entry order they belong to
  levelId?: number;          // brackets: exit level number when there is more than one
  ocoId?: string;            // brackets: TP and SL of one level cancel each other
  status: OrderStatus;
  tif?: TimeInForce;
  expiresAt?: number;
  placedAt: number;
  closedAt?: number;
  leverage: number;
  rejectReason?: string;
}

export interface Position { symbol: string; side: Side; qty: number; avgPrice: number; openedAt: number }
export interface BalanceEntry { time: number; before: number; after: number; pnl: number; action: string }
export interface ActivityEntry { time: number; text: string }
export interface Trade {
  id: string; symbol: string; side: Side; qty: number;
  entryOrderId: string; entryTime: number; entryPrice: number;
  exitOrderId?: string; exitTime?: number; exitPrice?: number; pnl?: number;
  runUp: number; drawdown: number;
}
export interface Execution { id: string; symbol: string; side: Side; qty: number; price: number; time: number; orderId: string }
export interface Account {
  id: string; name: string; currency: "USD"; initialBalance: number; balance: number;
  leverage: Record<AssetClass, number>; createdAt: number;
}
export interface Book {
  positions: Position[]; orders: Order[]; balanceHistory: BalanceEntry[]; activity: ActivityEntry[];
  trades: Trade[]; executions: Execution[]; nextOrderId: number;
}
export interface Quote { price: number; time: number }
export interface EngineState {
  version: 1;
  connected: boolean;
  accounts: Account[];
  activeAccountId: string;
  books: Record<string, Book>;
  quotes: Record<string, Quote>;
  precision: Record<string, number>;
}

export type NoticeKind = "placed" | "executed" | "modified" | "cancelled" | "rejected";
export interface TradeNotice {
  id: string; kind: NoticeKind; orderLabel: string; symbol: string; side: Side; qty: number;
  price?: number; precision: number; reason?: string; time: number;
}

export interface OrderRequest {
  symbol: string; side: Side; type: OrderType; qty: number;
  price?: number;             // limit / stop price
  levels?: ExitLevel[];       // exits; quantities add up to qty
  tif?: TimeInForce; expiresAt?: number;
}
export interface OrderResult { ok: boolean; orderId?: string; error?: string }

const MAX_LOG = 1000;
const EPS = 1e-9;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const DEFAULT_BALANCE = 100000;

export function createAccount(name: string, balance = DEFAULT_BALANCE): Account {
  return { id: uid(), name, currency: "USD", initialBalance: balance, balance, leverage: { ...DEFAULT_LEVERAGE }, createdAt: Date.now() };
}

function createBook(): Book {
  // TradingView-style 10-digit order numbers
  return { positions: [], orders: [], balanceHistory: [], activity: [], trades: [], executions: [], nextOrderId: 3000000000 + Math.floor(Math.random() * 600000000) };
}

export function createInitialState(accountName = "Paper Trading"): EngineState {
  const acc = createAccount(accountName);
  return { version: 1, connected: false, accounts: [acc], activeAccountId: acc.id, books: { [acc.id]: createBook() }, quotes: {}, precision: {} };
}

// Accepts anything that looks like a saved state; falls back to a fresh one
export function normalizeState(raw: any): EngineState {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.accounts) || raw.accounts.length === 0) return createInitialState();
  const state: EngineState = {
    version: 1,
    connected: !!raw.connected,
    accounts: raw.accounts.map((a: any) => ({ ...a, leverage: { ...DEFAULT_LEVERAGE, ...(a.leverage || {}) } })),
    activeAccountId: raw.activeAccountId,
    books: raw.books || {},
    quotes: raw.quotes || {},
    precision: raw.precision || {},
  };
  if (!state.accounts.some(a => a.id === state.activeAccountId)) state.activeAccountId = state.accounts[0].id;
  for (const a of state.accounts) {
    const b = state.books[a.id];
    state.books[a.id] = b ? { ...createBook(), ...b } : createBook();
  }
  return state;
}

// ---------- read helpers (pure, usable from UI) ----------

export function precisionOf(s: EngineState, symbol: string): number {
  return s.precision[symbol] ?? defaultPrecisionOf(symbol);
}

export function quoteOf(s: EngineState, symbol: string): { last: number; bid: number; ask: number; time: number } | null {
  const q = s.quotes[symbol];
  if (!q || !isFinite(q.price)) return null;
  const prec = precisionOf(s, symbol);
  const { bid, ask } = simulatedQuote(q.price, prec);
  return { last: q.price, bid: roundToTick(bid, prec), ask: roundToTick(ask, prec), time: q.time };
}

export function activeAccount(s: EngineState): Account {
  return s.accounts.find(a => a.id === s.activeAccountId) || s.accounts[0];
}
export function activeBook(s: EngineState): Book {
  return s.books[activeAccount(s).id];
}
export function leverageFor(acc: Account, symbol: string): number {
  return acc.leverage[assetClassOf(symbol)] || 1;
}

export function orderLabel(o: Pick<Order, "role" | "type">): string {
  if (o.role === "tp") return "Take Profit";
  if (o.role === "sl") return "Stop Loss";
  return o.type === "market" ? "Market" : o.type === "limit" ? "Limit" : "Stop";
}

export function orderPrice(o: Order): number | undefined {
  return o.type === "limit" ? o.limitPrice : o.type === "stop" ? o.stopPrice : undefined;
}

const dir = (side: Side) => (side === "buy" ? 1 : -1);
const opposite = (side: Side): Side => (side === "buy" ? "sell" : "buy");

export interface PositionView extends Position {
  last: number; pnl: number; pnlPct: number; tradeValue: number; marketValue: number; leverage: number; margin: number;
  tpOrders: Order[]; slOrders: Order[];
}

export function positionViews(s: EngineState, accountId = s.activeAccountId): PositionView[] {
  const acc = s.accounts.find(a => a.id === accountId)!;
  const b = s.books[accountId];
  if (!acc || !b) return [];
  return b.positions.map(p => {
    const last = quoteOf(s, p.symbol)?.last ?? p.avgPrice;
    const pnl = (last - p.avgPrice) * p.qty * dir(p.side);
    const tradeValue = p.avgPrice * p.qty;
    const marketValue = last * p.qty;
    const leverage = leverageFor(acc, p.symbol);
    const brackets = b.orders.filter(o => o.symbol === p.symbol && o.status === "working" && o.role !== "entry");
    return {
      ...p, last, pnl, pnlPct: tradeValue ? (pnl / tradeValue) * 100 : 0, tradeValue, marketValue, leverage,
      margin: marketValue / leverage,
      tpOrders: brackets.filter(o => o.role === "tp").sort((a, b2) => (a.levelId || 0) - (b2.levelId || 0)),
      slOrders: brackets.filter(o => o.role === "sl").sort((a, b2) => (a.levelId || 0) - (b2.levelId || 0)),
    };
  });
}

export interface AccountMetrics {
  balance: number; equity: number; realizedPnL: number; unrealizedPnL: number;
  accountMargin: number; ordersMargin: number; availableFunds: number; marginBuffer: number;
}

export function accountMetrics(s: EngineState, accountId = s.activeAccountId): AccountMetrics {
  const acc = s.accounts.find(a => a.id === accountId)!;
  const b = s.books[accountId];
  const views = positionViews(s, accountId);
  const unrealizedPnL = views.reduce((sum, v) => sum + v.pnl, 0);
  const accountMargin = views.reduce((sum, v) => sum + v.margin, 0);
  let ordersMargin = 0;
  for (const o of b.orders) {
    if (o.status !== "working" || o.role !== "entry" || o.type === "market") continue;
    ordersMargin += (orderPrice(o) || 0) * exposureIncrease(b, o.symbol, o.side, o.qty) / leverageFor(acc, o.symbol);
  }
  const equity = acc.balance + unrealizedPnL;
  const availableFunds = equity - accountMargin - ordersMargin;
  const realizedPnL = b.balanceHistory.reduce((sum, e) => sum + e.pnl, 0);
  return {
    balance: acc.balance, equity, realizedPnL, unrealizedPnL, accountMargin, ordersMargin, availableFunds,
    marginBuffer: equity > 0 ? (availableFunds / equity) * 100 : 0,
  };
}

// How much of an order adds exposure (the rest just reduces an opposite position)
function exposureIncrease(b: Book, symbol: string, side: Side, qty: number): number {
  const pos = b.positions.find(p => p.symbol === symbol);
  if (!pos || pos.side === side) return qty;
  return Math.max(0, qty - pos.qty);
}

// Whether a limit/stop price is on the right side of the market
export function isValidOrderPrice(side: Side, type: OrderType, price: number, bid: number, ask: number): boolean {
  if (!isFinite(price) || price <= 0) return false;
  if (type === "stop") return side === "buy" ? price >= ask : price <= bid;
  return true;
}

// TP must be beyond the entry in the profit direction, SL in the loss direction
export function isValidExit(side: Side, role: "tp" | "sl", price: number, entry: number): boolean {
  if (!isFinite(price) || price <= 0) return false;
  const profitUp = side === "buy";
  if (role === "tp") return profitUp ? price > entry : price < entry;
  return profitUp ? price < entry : price > entry;
}

// ---------- engine ----------

type Listener = () => void;
type NoticeListener = (n: TradeNotice) => void;

interface Draft { s: EngineState; notices: TradeNotice[]; now: number }

export class PaperTradingEngine {
  private state: EngineState;
  private listeners = new Set<Listener>();
  private noticeListeners = new Set<NoticeListener>();
  private revision = 0;

  constructor(initial?: EngineState) {
    this.state = initial ? normalizeState(initial) : createInitialState();
  }

  getState = () => this.state;
  // Bumps on changes worth saving (orders, positions, accounts) but not on quote-only updates
  getRevision = () => this.revision;

  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  onNotice = (l: NoticeListener) => { this.noticeListeners.add(l); return () => { this.noticeListeners.delete(l); }; };

  replaceState(next: EngineState) {
    // Keep the live quotes/precision across account data loads
    const prev = this.state;
    const s = normalizeState(next);
    s.quotes = { ...s.quotes, ...prev.quotes };
    s.precision = { ...s.precision, ...prev.precision };
    this.state = s;
    this.listeners.forEach(l => l());
  }

  private run<T>(fn: (d: Draft) => T, structural = true): T {
    const d: Draft = { s: structuredClone(this.state), notices: [], now: Date.now() };
    const result = fn(d);
    for (const id of Object.keys(d.s.books)) trimBook(d.s.books[id]);
    this.state = d.s;
    if (structural || d.notices.length) this.revision++;
    this.listeners.forEach(l => l());
    d.notices.forEach(n => this.noticeListeners.forEach(l => l(n)));
    return result;
  }

  // ----- market data -----

  setPrecision(symbol: string, precision: number) {
    if (this.state.precision[symbol] === precision) return;
    this.run(d => { d.s.precision[symbol] = precision; }, false);
  }

  // A new price for a symbol: triggers working orders and tracks open trades' excursions
  setQuote(symbol: string, price: number, time = Date.now()) {
    if (!isFinite(price) || price <= 0) return;
    const prev = this.state.quotes[symbol];
    if (prev && prev.price === price && time <= prev.time) return;
    this.run(d => {
      d.s.quotes[symbol] = { price, time: Math.max(time, prev?.time || 0) };
      for (const accId of Object.keys(d.s.books)) {
        expireOrders(d, accId);
        processSymbol(d, accId, symbol);
        trackExcursions(d, accId, symbol, price);
      }
    }, false);
  }

  // Periodic housekeeping (order expiry) when no quotes arrive
  tick() {
    const now = Date.now();
    const due = Object.values(this.state.books).some(b => b.orders.some(o => o.status === "working" && o.expiresAt && o.expiresAt <= now));
    if (due) this.run(d => { for (const accId of Object.keys(d.s.books)) expireOrders(d, accId); });
  }

  // ----- connection & accounts -----

  setConnected(connected: boolean) {
    this.run(d => { d.s.connected = connected; });
  }

  createAccount(name: string, balance: number) {
    return this.run(d => {
      const acc = createAccount(name.trim() || "Paper Trading", balance);
      d.s.accounts.push(acc);
      d.s.books[acc.id] = createBook();
      d.s.activeAccountId = acc.id;
      return acc.id;
    });
  }

  switchAccount(id: string) {
    this.run(d => { if (d.s.accounts.some(a => a.id === id)) d.s.activeAccountId = id; });
  }

  updateAccount(id: string, changes: { name?: string; leverage?: Partial<Record<AssetClass, number>> }) {
    this.run(d => {
      const acc = d.s.accounts.find(a => a.id === id);
      if (!acc) return;
      if (changes.name !== undefined && changes.name.trim()) acc.name = changes.name.trim();
      if (changes.leverage) {
        for (const [k, v] of Object.entries(changes.leverage)) {
          if (typeof v === "number" && v >= 1) acc.leverage[k as AssetClass] = v;
        }
      }
    });
  }

  // Wipes the account's positions, orders and history and starts again from a balance
  resetAccount(id: string, balance: number) {
    this.run(d => {
      const acc = d.s.accounts.find(a => a.id === id);
      if (!acc) return;
      acc.initialBalance = balance;
      acc.balance = balance;
      d.s.books[id] = createBook();
    });
  }

  deleteAccount(id: string) {
    this.run(d => {
      if (d.s.accounts.length <= 1) return;
      d.s.accounts = d.s.accounts.filter(a => a.id !== id);
      delete d.s.books[id];
      if (d.s.activeAccountId === id) d.s.activeAccountId = d.s.accounts[0].id;
    });
  }

  // ----- orders -----

  placeOrder(req: OrderRequest): OrderResult {
    return this.run(d => placeOrderIn(d, d.s.activeAccountId, req));
  }

  cancelOrder(orderId: string) {
    this.run(d => {
      const b = d.s.books[d.s.activeAccountId];
      const o = b.orders.find(x => x.id === orderId);
      if (!o || (o.status !== "working" && o.status !== "inactive")) return;
      log(d, b, `Call to cancel order ${o.id}`);
      cancelOrderIn(d, d.s.activeAccountId, o, "cancelled");
      if (o.role === "entry") {
        for (const br of b.orders.filter(x => x.parentId === o.id && (x.status === "inactive" || x.status === "working"))) {
          cancelOrderIn(d, d.s.activeAccountId, br, "cancelled");
        }
      }
    });
  }

  // Changes a working order: price, quantity, type (limit ↔ stop), exits, time in force
  modifyOrder(orderId: string, changes: { price?: number; qty?: number; type?: "limit" | "stop"; levels?: ExitLevel[]; tif?: TimeInForce; expiresAt?: number }): OrderResult {
    return this.run(d => {
      const accId = d.s.activeAccountId;
      const b = d.s.books[accId];
      const o = b.orders.find(x => x.id === orderId);
      if (!o || (o.status !== "working" && o.status !== "inactive")) return { ok: false, error: "Order is no longer active" };
      const q = quoteOf(d.s, o.symbol);
      const prec = precisionOf(d.s, o.symbol);
      const type = changes.type && o.role === "entry" ? changes.type : o.type;
      const price = changes.price !== undefined ? roundToTick(changes.price, prec) : orderPrice(o);
      if (price !== undefined && q && o.role === "entry" && !isValidOrderPrice(o.side, type, price, q.bid, q.ask)) {
        return { ok: false, error: "Selected price isn't valid for this order type" };
      }
      if (o.role !== "entry" && price !== undefined) {
        // An active exit is checked against where the position would exit now (bid for a long,
        // ask for a short); one still waiting on its entry, against the entry price
        const posSide = opposite(o.side);
        const parent = o.parentId ? b.orders.find(x => x.id === o.parentId) : undefined;
        const ref = o.status === "inactive" && parent ? (orderPrice(parent) ?? q?.last) : q ? (posSide === "buy" ? q.bid : q.ask) : undefined;
        if (ref !== undefined && !isValidExit(posSide, o.role, price, ref)) {
          return { ok: false, error: o.role === "tp" ? "Take profit price isn't valid" : "Stop loss price isn't valid" };
        }
      }
      log(d, b, `Call to modify order ${o.id}`);
      if (changes.qty !== undefined && changes.qty > 0) o.qty = changes.qty;
      if (o.role === "entry") {
        o.type = type;
        if (type === "limit") { o.limitPrice = price; delete o.stopPrice; } else if (type === "stop") { o.stopPrice = price; delete o.limitPrice; }
        if (changes.tif) { o.tif = changes.tif; o.expiresAt = changes.expiresAt ?? tifExpiry(changes.tif, d.now); }
        if (changes.levels) {
          for (const br of b.orders.filter(x => x.parentId === o.id && x.status === "inactive")) cancelOrderIn(d, accId, br, "cancelled", true);
          o.levels = changes.levels;
          createBrackets(d, accId, o, "inactive");
        }
      } else if (price !== undefined) {
        if (o.role === "tp") o.limitPrice = price; else o.stopPrice = price;
      }
      log(d, b, `Order ${o.id} successfully modified`);
      notify(d, accId, "modified", o, orderPrice(o));
      processSymbol(d, accId, o.symbol);
      return { ok: true, orderId: o.id };
    });
  }

  // Closes all or part of a symbol's position with a market order
  closePosition(symbol: string, qty?: number): OrderResult {
    return this.run(d => {
      const b = d.s.books[d.s.activeAccountId];
      const pos = b.positions.find(p => p.symbol === symbol);
      if (!pos) return { ok: false, error: "No open position" };
      const closeQty = Math.min(pos.qty, qty && qty > 0 ? qty : pos.qty);
      if (!quoteOf(d.s, symbol)) return rejectOrder(d, d.s.activeAccountId, { symbol, side: opposite(pos.side), type: "market", qty: closeQty }, `No market data for ${symbol}`);
      // A full close takes the position's exits down first, then sends the closing order
      if (closeQty >= pos.qty - EPS) cancelAttachedExits(d, d.s.activeAccountId, symbol);
      return placeOrderIn(d, d.s.activeAccountId, { symbol, side: opposite(pos.side), type: "market", qty: closeQty });
    });
  }

  // Flips the position to the same size on the other side
  reversePosition(symbol: string): OrderResult {
    return this.run(d => {
      const b = d.s.books[d.s.activeAccountId];
      const pos = b.positions.find(p => p.symbol === symbol);
      if (!pos) return { ok: false, error: "No open position" };
      if (!quoteOf(d.s, symbol)) return rejectOrder(d, d.s.activeAccountId, { symbol, side: opposite(pos.side), type: "market", qty: pos.qty * 2 }, `No market data for ${symbol}`);
      cancelAttachedExits(d, d.s.activeAccountId, symbol);
      return placeOrderIn(d, d.s.activeAccountId, { symbol, side: opposite(pos.side), type: "market", qty: pos.qty * 2 });
    });
  }

  // Replaces a position's TP/SL with the given exit levels (the position dialog and chart drags)
  setPositionExits(symbol: string, levels: ExitLevel[]): OrderResult {
    return this.run(d => {
      const accId = d.s.activeAccountId;
      const b = d.s.books[accId];
      const pos = b.positions.find(p => p.symbol === symbol);
      if (!pos) return { ok: false, error: "No open position" };
      const q = quoteOf(d.s, symbol);
      for (const lv of levels) {
        if (lv.tp !== undefined && !isValidExit(pos.side, "tp", lv.tp, q ? (pos.side === "buy" ? q.bid : q.ask) : pos.avgPrice)) return { ok: false, error: "Take profit price isn't valid" };
        if (lv.sl !== undefined && !isValidExit(pos.side, "sl", lv.sl, q ? (pos.side === "buy" ? q.bid : q.ask) : pos.avgPrice)) return { ok: false, error: "Stop loss price isn't valid" };
      }
      const existing = b.orders.filter(o => o.symbol === symbol && o.status === "working" && o.role !== "entry");
      const tps = existing.filter(o => o.role === "tp").sort((a, c) => (a.levelId || 0) - (c.levelId || 0));
      const sls = existing.filter(o => o.role === "sl").sort((a, c) => (a.levelId || 0) - (c.levelId || 0));
      const singleSame = levels.length <= 1 && tps.length <= 1 && sls.length <= 1;
      if (singleSame) {
        // One level: modify the existing orders in place (what TradingView reports as "modified")
        const lv = levels[0] || { qty: pos.qty };
        const prec = precisionOf(d.s, symbol);
        const ocoId = tps[0]?.ocoId || sls[0]?.ocoId || `${symbol}-${d.now}`;
        const apply = (role: "tp" | "sl", current: Order | undefined, price: number | undefined) => {
          if (price === undefined) {
            if (current) { log(d, b, `Call to cancel order ${current.id}`); cancelOrderIn(d, accId, current, "cancelled"); }
            return;
          }
          const rounded = roundToTick(price, prec);
          if (current) {
            if (orderPrice(current) === rounded && current.qty === pos.qty) return;
            log(d, b, `Call to modify order ${current.id}`);
            if (role === "tp") current.limitPrice = rounded; else current.stopPrice = rounded;
            current.qty = pos.qty;
            log(d, b, `Order ${current.id} successfully modified`);
            notify(d, accId, "modified", current, rounded);
          } else {
            const o = newBracket(d, accId, symbol, opposite(pos.side), role, pos.qty, rounded, undefined, undefined, ocoId, "working");
            log(d, b, `Order ${o.id} successfully placed`);
            notify(d, accId, "placed", o, rounded);
          }
        };
        apply("sl", sls[0], lv.sl);
        apply("tp", tps[0], lv.tp);
      } else {
        for (const o of existing) cancelOrderIn(d, accId, o, "cancelled");
        levels.forEach((lv, i) => {
          const ocoId = `${symbol}-${d.now}-L${i + 1}`;
          const levelId = levels.length > 1 ? i + 1 : undefined;
          const prec = precisionOf(d.s, symbol);
          if (lv.sl !== undefined) {
            const o = newBracket(d, accId, symbol, opposite(pos.side), "sl", lv.qty, roundToTick(lv.sl, prec), undefined, levelId, ocoId, "working");
            log(d, b, `Order ${o.id} successfully placed`);
            notify(d, accId, "placed", o, o.stopPrice);
          }
          if (lv.tp !== undefined) {
            const o = newBracket(d, accId, symbol, opposite(pos.side), "tp", lv.qty, roundToTick(lv.tp, prec), undefined, levelId, ocoId, "working");
            log(d, b, `Order ${o.id} successfully placed`);
            notify(d, accId, "placed", o, o.limitPrice);
          }
        });
      }
      processSymbol(d, accId, symbol);
      return { ok: true };
    });
  }
}

// ---------- internals (operate on a draft) ----------

function log(d: Draft, b: Book, text: string) {
  b.activity.unshift({ time: d.now, text });
}

function notify(d: Draft, accId: string, kind: NoticeKind, o: Order, price?: number, reason?: string) {
  if (accId !== d.s.activeAccountId) return;
  d.notices.push({
    id: uid(), kind, orderLabel: orderLabel(o), symbol: o.symbol, side: o.side, qty: o.qty,
    price, precision: precisionOf(d.s, o.symbol), reason, time: d.now,
  });
}

function trimBook(b: Book) {
  if (b.activity.length > MAX_LOG) b.activity.length = MAX_LOG;
  if (b.balanceHistory.length > MAX_LOG) b.balanceHistory.length = MAX_LOG;
  if (b.executions.length > MAX_LOG * 2) b.executions.splice(0, b.executions.length - MAX_LOG * 2);
  const closedTrades = b.trades.filter(t => t.exitTime !== undefined);
  if (closedTrades.length > MAX_LOG) {
    const drop = new Set(closedTrades.slice(0, closedTrades.length - MAX_LOG).map(t => t.id));
    b.trades = b.trades.filter(t => !drop.has(t.id));
  }
  const done = b.orders.filter(o => o.status !== "working" && o.status !== "inactive");
  if (done.length > MAX_LOG) {
    const drop = new Set(done.sort((a, c) => (a.closedAt || 0) - (c.closedAt || 0)).slice(0, done.length - MAX_LOG).map(o => o.id));
    b.orders = b.orders.filter(o => !drop.has(o.id));
  }
}

export function tifExpiry(tif: TimeInForce, now: number, gtd?: number): number {
  const d = new Date(now);
  if (tif === "Day") return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  if (tif === "Week") {
    const daysToSunday = (7 - d.getDay()) % 7;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToSunday, 23, 59, 59, 999).getTime();
  }
  if (tif === "Month") return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  return gtd ?? now + 86400000;
}

function fmtLogPrice(d: Draft, symbol: string, price: number) {
  return price.toFixed(precisionOf(d.s, symbol)).replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
}

function rejectOrder(d: Draft, accId: string, req: OrderRequest, reason: string): OrderResult {
  const b = d.s.books[accId];
  const acc = d.s.accounts.find(a => a.id === accId)!;
  const o: Order = {
    id: String(b.nextOrderId++), symbol: req.symbol, side: req.side, type: req.type, role: "entry", qty: req.qty,
    limitPrice: req.type === "limit" ? req.price : undefined, stopPrice: req.type === "stop" ? req.price : undefined,
    status: "rejected", placedAt: d.now, closedAt: d.now, leverage: leverageFor(acc, req.symbol), rejectReason: reason,
  };
  b.orders.push(o);
  log(d, b, `Order ${o.id} rejected: ${reason}`);
  notify(d, accId, "rejected", o, orderPrice(o), reason);
  return { ok: false, orderId: o.id, error: reason };
}

function placeOrderIn(d: Draft, accId: string, req: OrderRequest): OrderResult {
  const b = d.s.books[accId];
  const acc = d.s.accounts.find(a => a.id === accId)!;
  const prec = precisionOf(d.s, req.symbol);
  const q = quoteOf(d.s, req.symbol);
  const step = qtyStepOf(req.symbol);
  if (!q) return rejectOrder(d, accId, req, `No market data for ${req.symbol}`);
  if (!(req.qty >= step - EPS)) return rejectOrder(d, accId, req, `Quantity must be at least ${step}`);
  const price = req.type === "market" ? undefined : roundToTick(req.price ?? NaN, prec);
  if (req.type !== "market" && !isValidOrderPrice(req.side, req.type, price!, q.bid, q.ask)) {
    return rejectOrder(d, accId, req, "Selected price isn't valid for this order type");
  }
  const ref = req.type === "market" ? (req.side === "buy" ? q.ask : q.bid) : price!;
  const levels = (req.levels || []).filter(l => l.qty > EPS && (l.tp !== undefined || l.sl !== undefined))
    .map(l => ({ qty: l.qty, tp: l.tp !== undefined ? roundToTick(l.tp, prec) : undefined, sl: l.sl !== undefined ? roundToTick(l.sl, prec) : undefined }));
  for (const lv of levels) {
    if (lv.tp !== undefined && !isValidExit(req.side, "tp", lv.tp, ref)) return rejectOrder(d, accId, req, "Take profit price isn't valid");
    if (lv.sl !== undefined && !isValidExit(req.side, "sl", lv.sl, ref)) return rejectOrder(d, accId, req, "Stop loss price isn't valid");
  }
  const leverage = leverageFor(acc, req.symbol);
  const needed = exposureIncrease(b, req.symbol, req.side, req.qty) * ref / leverage;
  if (needed > EPS && needed > accountMetrics(d.s, accId).availableFunds + EPS) {
    return rejectOrder(d, accId, req, "Not enough available funds");
  }

  const o: Order = {
    id: String(b.nextOrderId++), symbol: req.symbol, side: req.side, type: req.type, role: "entry", qty: req.qty,
    limitPrice: req.type === "limit" ? price : undefined, stopPrice: req.type === "stop" ? price : undefined,
    levels: levels.length ? levels : undefined, status: "working", placedAt: d.now, leverage,
  };
  if (req.type !== "market") {
    o.tif = req.tif || "Day";
    o.expiresAt = req.expiresAt ?? tifExpiry(o.tif, d.now);
  }
  const exits = levels.length === 1
    ? `${levels[0].sl !== undefined ? ` with SL ${fmtLogPrice(d, req.symbol, levels[0].sl)}` : ""}${levels[0].tp !== undefined ? `${levels[0].sl !== undefined ? " and" : " with"} TP ${fmtLogPrice(d, req.symbol, levels[0].tp)}` : ""}`
    : levels.length > 1 ? ` with ${levels.length} exit levels` : "";
  const at = price !== undefined ? ` at price ${fmtLogPrice(d, req.symbol, price)}` : "";
  log(d, b, `Call to place ${req.type} order to ${req.side} ${formatQty(req.qty)} units of symbol ${req.symbol}${at}${exits}`);
  b.orders.push(o);
  log(d, b, `Order ${o.id} successfully placed`);
  notify(d, accId, "placed", o, price);
  createBrackets(d, accId, o, "inactive");

  if (req.type === "market") fillOrder(d, accId, o, ref);
  else processSymbol(d, accId, req.symbol);
  return { ok: true, orderId: o.id };
}

function newBracket(d: Draft, accId: string, symbol: string, side: Side, role: "tp" | "sl", qty: number, price: number,
  parentId: string | undefined, levelId: number | undefined, ocoId: string, status: OrderStatus): Order {
  const b = d.s.books[accId];
  const acc = d.s.accounts.find(a => a.id === accId)!;
  const o: Order = {
    id: String(b.nextOrderId++), symbol, side, type: role === "tp" ? "limit" : "stop", role, qty,
    limitPrice: role === "tp" ? price : undefined, stopPrice: role === "sl" ? price : undefined,
    parentId, levelId, ocoId, status, placedAt: d.now, leverage: leverageFor(acc, symbol),
  };
  b.orders.push(o);
  return o;
}

// An entry's exits become (inactive) TP/SL orders right away; they activate when it fills
function createBrackets(d: Draft, accId: string, entry: Order, status: OrderStatus) {
  const b = d.s.books[accId];
  const levels = entry.levels || [];
  levels.forEach((lv, i) => {
    const ocoId = `${entry.id}-L${i + 1}`;
    const levelId = levels.length > 1 ? i + 1 : undefined;
    if (lv.sl !== undefined) {
      const o = newBracket(d, accId, entry.symbol, opposite(entry.side), "sl", lv.qty, lv.sl, entry.id, levelId, ocoId, status);
      log(d, b, `Order ${o.id} successfully placed`);
      notify(d, accId, "placed", o, lv.sl);
    }
    if (lv.tp !== undefined) {
      const o = newBracket(d, accId, entry.symbol, opposite(entry.side), "tp", lv.qty, lv.tp, entry.id, levelId, ocoId, status);
      log(d, b, `Order ${o.id} successfully placed`);
      notify(d, accId, "placed", o, lv.tp);
    }
  });
}

function cancelOrderIn(d: Draft, accId: string, o: Order, status: "cancelled", silent = false) {
  const b = d.s.books[accId];
  o.status = status;
  o.closedAt = d.now;
  if (!silent) {
    log(d, b, `Order ${o.id} cancelled`);
    notify(d, accId, "cancelled", o, orderPrice(o));
  }
}

function cancelAttachedExits(d: Draft, accId: string, symbol: string) {
  const b = d.s.books[accId];
  for (const o of b.orders.filter(x => x.symbol === symbol && x.role !== "entry" && x.status === "working")) {
    log(d, b, `Call to cancel order ${o.id}`);
    cancelOrderIn(d, accId, o, "cancelled");
  }
}

function expireOrders(d: Draft, accId: string) {
  const b = d.s.books[accId];
  for (const o of b.orders) {
    if (o.status === "working" && o.role === "entry" && o.expiresAt && o.expiresAt <= d.now) {
      o.status = "cancelled";
      o.closedAt = d.now;
      log(d, b, `Order ${o.id} expired`);
      notify(d, accId, "cancelled", o, orderPrice(o));
      for (const br of b.orders.filter(x => x.parentId === o.id && x.status === "inactive")) cancelOrderIn(d, accId, br, "cancelled");
    }
  }
}

// Price a working order fills at given the market, or null if it doesn't trigger
function triggerPrice(o: Order, bid: number, ask: number): number | null {
  if (o.type === "limit" && o.limitPrice !== undefined) {
    if (o.side === "buy" && ask <= o.limitPrice) return Math.min(ask, o.limitPrice);
    if (o.side === "sell" && bid >= o.limitPrice) return Math.max(bid, o.limitPrice);
  }
  if (o.type === "stop" && o.stopPrice !== undefined) {
    if (o.side === "buy" && ask >= o.stopPrice) return Math.max(ask, o.stopPrice);
    if (o.side === "sell" && bid <= o.stopPrice) return Math.min(bid, o.stopPrice);
  }
  return null;
}

function processSymbol(d: Draft, accId: string, symbol: string) {
  const q = quoteOf(d.s, symbol);
  if (!q) return;
  const b = d.s.books[accId];
  const candidates = b.orders.filter(o => o.symbol === symbol && o.status === "working").sort((a, c) => a.placedAt - c.placedAt);
  for (const o of candidates) {
    if (o.status !== "working") continue; // cancelled by an earlier fill (OCO)
    const px = triggerPrice(o, q.bid, q.ask);
    if (px !== null) fillOrder(d, accId, o, roundToTick(px, precisionOf(d.s, symbol)));
  }
}

function trackExcursions(d: Draft, accId: string, symbol: string, price: number) {
  for (const t of d.s.books[accId].trades) {
    if (t.symbol !== symbol || t.exitTime !== undefined) continue;
    const ex = (price - t.entryPrice) * t.qty * dir(t.side);
    if (ex > t.runUp) t.runUp = ex;
    if (ex < t.drawdown) t.drawdown = ex;
  }
}

function fillOrder(d: Draft, accId: string, o: Order, price: number) {
  const b = d.s.books[accId];
  o.status = "filled";
  o.fillPrice = price;
  o.closedAt = d.now;
  b.executions.push({ id: uid(), symbol: o.symbol, side: o.side, qty: o.qty, price, time: d.now, orderId: o.id });
  log(d, b, `Order ${o.id} for symbol ${o.symbol} has been executed at price ${fmtLogPrice(d, o.symbol, price)} for ${formatQty(o.qty)} units`);
  notify(d, accId, "executed", o, price);

  applyFill(d, accId, o, price);
  const pos = b.positions.find(p => p.symbol === o.symbol);

  if (o.role === "entry") {
    const brackets = b.orders.filter(x => x.parentId === o.id && x.status === "inactive");
    if (!pos || pos.side !== o.side) {
      // The entry only reduced an opposite position: its exits have nothing to protect
      for (const br of brackets) cancelOrderIn(d, accId, br, "cancelled");
    } else {
      for (const br of brackets) {
        br.status = "working";
        log(d, b, `Order ${br.id} activated at price ${fmtLogPrice(d, br.symbol, orderPrice(br)!)}`);
        notify(d, accId, "modified", br, orderPrice(br));
      }
    }
  } else if (o.ocoId) {
    for (const sib of b.orders.filter(x => x.ocoId === o.ocoId && x.id !== o.id && x.status === "working")) {
      cancelOrderIn(d, accId, sib, "cancelled");
    }
  }

  // Exits attached to the position go when it's flat; the rest shrink to the position size
  const attached = b.orders.filter(x => x.symbol === o.symbol && x.role !== "entry" && x.status === "working");
  if (!pos) {
    for (const x of attached) cancelOrderIn(d, accId, x, "cancelled");
  } else {
    for (const x of attached) if (x.side === pos.side) cancelOrderIn(d, accId, x, "cancelled");
    for (const role of ["tp", "sl"] as const) {
      const list = attached.filter(x => x.role === role && x.status === "working").sort((a, c) => (a.levelId || 0) - (c.levelId || 0));
      let excess = list.reduce((sum, x) => sum + x.qty, 0) - pos.qty;
      for (let i = list.length - 1; i >= 0 && excess > EPS; i--) {
        const cut = Math.min(list[i].qty, excess);
        list[i].qty = Math.round((list[i].qty - cut) * 1e8) / 1e8;
        excess -= cut;
        if (list[i].qty <= EPS) cancelOrderIn(d, accId, list[i], "cancelled");
      }
    }
  }
}

// Nets a fill into the symbol's position, realizing P&L on the part that reduces it
function applyFill(d: Draft, accId: string, o: Order, price: number) {
  const b = d.s.books[accId];
  const acc = d.s.accounts.find(a => a.id === accId)!;
  const sym = o.symbol;
  const pos = b.positions.find(p => p.symbol === sym);
  const openLot = (qty: number, side: Side) => b.trades.push({
    id: uid(), symbol: sym, side, qty, entryOrderId: o.id, entryTime: d.now, entryPrice: price, runUp: 0, drawdown: 0,
  });

  if (!pos) {
    b.positions.push({ symbol: sym, side: o.side, qty: o.qty, avgPrice: price, openedAt: d.now });
    openLot(o.qty, o.side);
    return;
  }
  if (pos.side === o.side) {
    const qty = pos.qty + o.qty;
    pos.avgPrice = (pos.avgPrice * pos.qty + price * o.qty) / qty;
    pos.qty = Math.round(qty * 1e8) / 1e8;
    openLot(o.qty, o.side);
    return;
  }

  const closeQty = Math.min(o.qty, pos.qty);
  const realized = (price - pos.avgPrice) * closeQty * dir(pos.side);
  const before = acc.balance;
  acc.balance = before + realized;
  b.balanceHistory.unshift({
    time: d.now, before, after: acc.balance, pnl: realized,
    action: `Close ${pos.side === "buy" ? "long" : "short"} position for symbol ${sym} at price ${fmtLogPrice(d, sym, price)} for ${formatQty(closeQty)} units. Position AVG Price was ${pos.avgPrice.toFixed(6)}, currency: USD, rate: 1.000000, point value: 1.000000`,
  });

  // Close round-trip lots first in, first out
  let remaining = closeQty;
  for (const t of b.trades) {
    if (remaining <= EPS) break;
    if (t.symbol !== sym || t.exitTime !== undefined) continue;
    const take = Math.min(t.qty, remaining);
    const pnl = (price - t.entryPrice) * take * dir(t.side);
    if (take < t.qty - EPS) {
      b.trades.push({ ...t, id: uid(), qty: take, exitOrderId: o.id, exitTime: d.now, exitPrice: price, pnl });
      t.qty = Math.round((t.qty - take) * 1e8) / 1e8;
    } else {
      Object.assign(t, { exitOrderId: o.id, exitTime: d.now, exitPrice: price, pnl });
    }
    remaining -= take;
  }

  const left = Math.round((pos.qty - closeQty) * 1e8) / 1e8;
  if (left > EPS) {
    pos.qty = left;
  } else {
    b.positions = b.positions.filter(p => p.symbol !== sym);
    const flip = Math.round((o.qty - closeQty) * 1e8) / 1e8;
    if (flip > EPS) {
      b.positions.push({ symbol: sym, side: o.side, qty: flip, avgPrice: price, openedAt: d.now });
      openLot(flip, o.side);
    }
  }
}

// Human text for an order's price column etc.
export function describeOrderPrice(s: EngineState, o: Order): string {
  const p = orderPrice(o);
  return p === undefined ? "" : formatPrice(p, precisionOf(s, o.symbol));
}
