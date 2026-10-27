// A broker emulator for strategies written in Python or MQL5: it fills their orders against the
// chart's bars and builds the same Strategy Tester report (and trade markers) as Pine strategies
// get, with the same formulas (see buildStrategyReport in pineScriptEngine.ts).
//
// Per bar: beginBar(i) fills what was waiting for this bar (entries queued on the previous bar
// fill at its open; stop-loss / take-profit levels fill where the bar's range reaches them, or
// at its open when it gaps through), the script then acts on the bar (market orders fill at its
// close), and endBar(i) records equity, drawdown and each open trade's excursions.

import type { Bar, PineMarker, PineStrategyReport, PineStrategyTrade } from "../pineScriptEngine";

type Dir = "long" | "short";
interface Position {
  direction: Dir; qty: number; entryPrice: number; entryTime: number; entryBar: number; id: string;
  sl: number | null; tp: number | null; exitId: string;
  maxFavorable: number; maxAdverse: number;
}
interface PendingEntry { id: string; direction: Dir; qty: number; limit: number | null; stop: number | null }
type ClosedTrade = Omit<PineStrategyTrade, "cumulativePnl">;

export interface SimOptions {
  initialCapital: number;
  backtestFrom?: number;
  backtestTo?: number;
  // MQL5 netting accounts add to a position bought the same way; Pine-style strategies don't
  pyramiding?: boolean;
}

export class StrategySim {
  private bars: Bar[];
  private opts: SimOptions;
  private i = 0;
  position: Position | null = null;
  private pending: PendingEntry[] = [];
  private closed: ClosedTrade[] = [];
  private netProfit = 0;
  private peakEquity = 0;
  private maxDrawdown = 0;
  private maxDrawdownPct = 0;
  private equityCurve: { time: number; equity: number; close: number }[] = [];
  markers: PineMarker[] = [];

  constructor(bars: Bar[], opts: SimOptions) {
    this.bars = bars;
    this.opts = opts;
    this.peakEquity = opts.initialCapital;
  }

  private get bar() { return this.bars[this.i]; }
  // "Testing period": the strategy calculates over all bars, orders are taken only inside it
  get acceptingOrders() {
    const t = this.bar.time;
    return !((this.opts.backtestFrom !== undefined && t < this.opts.backtestFrom) || (this.opts.backtestTo !== undefined && t > this.opts.backtestTo));
  }
  get equity() { return this.opts.initialCapital + this.netProfit + this.unrealized(this.bar.close); }
  get balance() { return this.opts.initialCapital + this.netProfit; }
  get closedTrades() { return this.closed.length; }

  private unrealized(price: number) {
    const p = this.position;
    return p ? (p.direction === "long" ? price - p.entryPrice : p.entryPrice - price) * p.qty : 0;
  }

  private mark(time: number, direction: Dir, text: string, opening: boolean) {
    // Entries: an arrow in the trade's direction; exits: the opposite one
    const up = opening ? direction === "long" : direction === "short";
    this.markers.push({ time, position: up ? "belowBar" : "aboveBar", color: up ? "#2962ff" : "#f23645", shape: up ? "arrowUp" : "arrowDown", text });
  }

  private open(direction: Dir, qty: number, price: number, id: string, sl: number | null = null, tp: number | null = null) {
    const bar = this.bar;
    const p = this.position;
    if (p && p.direction === direction) {
      if (!this.opts.pyramiding) return;
      // Netting: one position, at the volume-weighted entry price
      const total = p.qty + qty;
      p.entryPrice = (p.entryPrice * p.qty + price * qty) / total;
      p.qty = total;
      if (sl !== null) p.sl = sl;
      if (tp !== null) p.tp = tp;
      this.mark(bar.time, direction, id, true);
      return;
    }
    // A reversal: the entry's arrow stands for the close too
    if (p) this.closeAt(price, id, false);
    if (!(qty > 0)) return;
    this.position = { direction, qty, entryPrice: price, entryTime: bar.time, entryBar: this.i, id, sl, tp, exitId: "Exit", maxFavorable: 0, maxAdverse: 0 };
    this.mark(bar.time, direction, id, true);
  }

  private closeAt(price: number, signal: string, mark = true) {
    const p = this.position;
    if (!p) return;
    const sign = p.direction === "long" ? 1 : -1;
    const netPnl = sign * (price - p.entryPrice) * p.qty;
    const notional = p.entryPrice * p.qty;
    this.closed.push({
      num: this.closed.length + 1, type: p.direction === "long" ? "Long" : "Short",
      entryTime: p.entryTime, entryPrice: p.entryPrice, exitTime: this.bar.time, exitPrice: price,
      entrySignal: p.id, exitSignal: signal, entryBar: p.entryBar, exitBar: this.i, commission: 0,
      qty: p.qty, netPnl, returnPct: notional > 0 ? (netPnl / notional) * 100 : 0,
      favorableExcursion: Math.max(p.maxFavorable, netPnl, 0), adverseExcursion: Math.min(p.maxAdverse, netPnl, 0),
    });
    this.netProfit += netPnl;
    this.position = null;
    if (mark) this.mark(this.bar.time, p.direction, signal, false);
  }

  beginBar(i: number) {
    this.i = i;
    const bar = this.bar;
    const p = this.position;
    if (this.opts.backtestTo !== undefined && bar.time > this.opts.backtestTo) {
      if (p) this.closeAt(bar.open, "Close position order");
      this.pending = [];
      return;
    }
    // Stop-loss first when both could have hit inside one bar (TradingView's pessimistic default)
    if (p && (p.sl !== null || p.tp !== null)) {
      let fill: number | null = null;
      let signal = p.exitId;
      if (p.direction === "long") {
        if (p.sl !== null && bar.low <= p.sl) { fill = bar.open <= p.sl ? bar.open : p.sl; signal = p.exitId === "Exit" ? "SL" : p.exitId; }
        else if (p.tp !== null && bar.high >= p.tp) { fill = bar.open >= p.tp ? bar.open : p.tp; signal = p.exitId === "Exit" ? "TP" : p.exitId; }
      } else {
        if (p.sl !== null && bar.high >= p.sl) { fill = bar.open >= p.sl ? bar.open : p.sl; signal = p.exitId === "Exit" ? "SL" : p.exitId; }
        else if (p.tp !== null && bar.low <= p.tp) { fill = bar.open <= p.tp ? bar.open : p.tp; signal = p.exitId === "Exit" ? "TP" : p.exitId; }
      }
      if (fill !== null) this.closeAt(fill, signal);
    }
    // Entries queued on the previous bar: the first that fills opens (or reverses) the position
    for (const o of this.pending) {
      if (this.position && this.position.direction === o.direction && !this.opts.pyramiding) continue;
      let fill: number | null = null;
      if (o.limit !== null) {
        if (o.direction === "long") { if (bar.low <= o.limit) fill = bar.open <= o.limit ? bar.open : o.limit; }
        else if (bar.high >= o.limit) fill = bar.open >= o.limit ? bar.open : o.limit;
      } else if (o.stop !== null) {
        if (o.direction === "long") { if (bar.high >= o.stop) fill = bar.open >= o.stop ? bar.open : o.stop; }
        else if (bar.low <= o.stop) fill = bar.open <= o.stop ? bar.open : o.stop;
      } else fill = bar.open;
      if (fill !== null) { this.open(o.direction, o.qty, fill, o.id); break; }
    }
    this.pending = [];
  }

  // --- Orders the script places on the current bar ---

  // Fills at the next bar's open (or at a limit / stop level), like Pine's strategy.entry
  queueEntry(id: string, direction: Dir, qty: number, limit: number | null = null, stop: number | null = null) {
    if (!this.acceptingOrders) return;
    this.pending = this.pending.filter(o => o.id !== id);
    this.pending.push({ id, direction, qty: Math.abs(qty), limit, stop });
  }
  // Fills now, at the bar's close (an MQL5 market order; Bid / Ask are the close)
  marketOrder(id: string, direction: Dir, qty: number, sl: number | null = null, tp: number | null = null) {
    if (!this.acceptingOrders) return false;
    this.open(direction, Math.abs(qty), this.bar.close, id, sl, tp);
    return true;
  }
  setExit(id: string, stop: number | null, limit: number | null) {
    if (!this.position) return;
    this.position.sl = stop;
    this.position.tp = limit;
    this.position.exitId = id || "Exit";
  }
  modify(sl: number | null, tp: number | null) {
    if (!this.position) return false;
    this.position.sl = sl;
    this.position.tp = tp;
    return true;
  }
  close(signal: string) {
    if (!this.position) return false;
    this.closeAt(this.bar.close, signal);
    return true;
  }
  cancel(id?: string) { this.pending = id === undefined ? [] : this.pending.filter(o => o.id !== id); }

  endBar() {
    const bar = this.bar;
    const u = this.unrealized(bar.close);
    if (this.position) {
      this.position.maxFavorable = Math.max(this.position.maxFavorable, u);
      this.position.maxAdverse = Math.min(this.position.maxAdverse, u);
    }
    const equity = this.opts.initialCapital + this.netProfit + u;
    this.equityCurve.push({ time: bar.time, equity, close: bar.close });
    this.peakEquity = Math.max(this.peakEquity, equity);
    const dd = this.peakEquity - equity;
    this.maxDrawdown = Math.max(this.maxDrawdown, dd);
    if (this.peakEquity > 0) this.maxDrawdownPct = Math.max(this.maxDrawdownPct, (dd / this.peakEquity) * 100);
  }

  report(): PineStrategyReport {
    const trades = this.closed;
    const from = this.opts.backtestFrom;
    const curve = from !== undefined ? this.equityCurve.filter(p => p.time >= from) : this.equityCurve;
    const wins = trades.filter(t => t.netPnl > 0);
    const losses = trades.filter(t => t.netPnl < 0);
    const grossProfit = wins.reduce((a, t) => a + t.netPnl, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.netPnl, 0));
    const cap = this.opts.initialCapital || 1;
    let running = 0;
    const withCum: PineStrategyTrade[] = trades.map(t => { running += t.netPnl; return { ...t, cumulativePnl: running }; });
    let openTrade: PineStrategyTrade | null = null;
    const p = this.position;
    if (p && this.bars.length) {
      const last = this.bars[this.bars.length - 1];
      const pnl = (p.direction === "long" ? 1 : -1) * (last.close - p.entryPrice) * p.qty;
      const notional = p.entryPrice * p.qty;
      openTrade = {
        num: trades.length + 1, type: p.direction === "long" ? "Long" : "Short",
        entryTime: p.entryTime, entryPrice: p.entryPrice, exitTime: last.time, exitPrice: last.close,
        entrySignal: p.id, exitSignal: "Open", entryBar: p.entryBar, exitBar: this.bars.length - 1, commission: 0,
        qty: p.qty, netPnl: pnl, returnPct: notional > 0 ? (pnl / notional) * 100 : 0, cumulativePnl: running + pnl,
        favorableExcursion: Math.max(p.maxFavorable, pnl, 0), adverseExcursion: Math.min(p.maxAdverse, pnl, 0),
      };
    }
    return {
      initialCapital: this.opts.initialCapital,
      netProfit: this.netProfit, netProfitPct: (this.netProfit / cap) * 100,
      maxDrawdown: this.maxDrawdown, maxDrawdownPct: this.maxDrawdownPct,
      profitableCount: wins.length, totalCount: trades.length,
      profitablePct: trades.length ? (wins.length / trades.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
      grossProfit, grossProfitPct: (grossProfit / cap) * 100,
      grossLoss, grossLossPct: (grossLoss / cap) * 100,
      longPnl: trades.filter(t => t.type === "Long").reduce((a, t) => a + t.netPnl, 0),
      shortPnl: trades.filter(t => t.type === "Short").reduce((a, t) => a + t.netPnl, 0),
      winCount: wins.length, lossCount: losses.length, breakevenCount: trades.length - wins.length - losses.length,
      trades: withCum,
      openTrade,
      equityCurve: curve,
    };
  }
}

// How many units one lot is, as MetaTrader's contract size: 100,000 for currency pairs, 100 oz
// for gold, 5,000 oz for silver, one unit for everything else (crypto, stocks, indices)
const CRYPTO = new Set(["BTC", "ETH", "SOL", "XRP", "LTC", "DOGE", "BNB", "ADA", "DOT", "AVAX", "LINK", "MATIC", "TRX", "SHIB", "BCH", "XLM", "ATOM", "UNI", "ETC", "TON", "NEAR", "APT", "ARB", "OP", "PEPE", "SUI"]);
export function contractSize(symbol: string): number {
  const s = (symbol || "").toUpperCase().replace(/^[A-Z]+:/, "");
  const m = s.match(/^([A-Z]{3,5})\/?([A-Z]{3,4})$/);
  if (!m) return 1;
  if (m[1] === "XAU") return 100;
  if (m[1] === "XAG") return 5000;
  if (CRYPTO.has(m[1]) || CRYPTO.has(m[2]) || m[2] === "USDT") return 1;
  return m[1].length === 3 && m[2].length === 3 ? 100000 : 1;
}
