// Analytics' trades, whichever account they come from, in one shape: paper trading's (each paper
// account, from the engine), the linked MetaTrader 5 account's closed trades (backend
// broker_mt5.mt5_history) and strategy backtests saved from the Strategy Tester (backend
// core/analytics.py). Also each trade's journal entry.

import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";
import type { EngineState } from "../trading/engine";
import type { PineStrategyReport } from "../lib/pineScriptEngine";

export type Source = "paper" | "mt5" | "backtest" | "session";

export interface ATrade {
  key: string;                 // unique within its source (journal entries are keyed by it)
  source: Source;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entryTime: number;           // ms
  exitTime: number | null;     // ms; null while open
  entryPrice: number;
  exitPrice: number | null;
  pnl: number;                 // net: after commission and swap
  commission: number;
  swap: number;
  runUp?: number;              // best open profit reached (money)
  drawdown?: number;           // worst open loss reached (money, <= 0)
  open: boolean;
  signal?: string;             // a backtest's entry / exit order names
}

export interface Journal {
  source: Source; trade_key: string; symbol?: string;
  pre_trade?: string; post_trade?: string; emotions?: string; lessons?: string; rr_notes?: string;
  tags?: string[]; checklist?: Partial<Record<ChecklistKey, boolean>>; rating?: number | null; updated_at?: number;
}
export type ChecklistKey = "followed_plan" | "proper_risk" | "good_entry" | "patient_exit";
export const CHECKLIST: { key: ChecklistKey; label: string }[] = [
  { key: "followed_plan", label: "Followed trading plan" },
  { key: "proper_risk", label: "Proper risk management" },
  { key: "good_entry", label: "Good entry point" },
  { key: "patient_exit", label: "Patient exit" },
];

export interface SavedBacktest {
  id: number; name: string; script: string; language: string; symbol: string; timeframe: string;
  initial_capital: number; net_profit: number; trade_count: number; period_from: number | null; period_to: number | null;
  notes: string; created_at: number; trades?: BacktestTradeRow[];
}
type BacktestTradeRow = {
  type: "Long" | "Short"; entryTime: number; entryPrice?: number; exitTime?: number; exitPrice?: number; qty?: number;
  netPnl: number; commission?: number; favorableExcursion?: number; adverseExcursion?: number; entrySignal?: string; exitSignal?: string;
};

const ms = (t: number) => (t < 1e11 ? t * 1000 : t);

async function api<T>(uid: string, path: string, init?: { method?: string; body?: unknown; query?: string }): Promise<T> {
  const res = await fetch(`${BACKEND}/api/users/${path.replace("{uid}", encodeURIComponent(uid))}?session_key=${encodeURIComponent(sessionKey())}${init?.query || ""}`, {
    method: init?.method || "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

// ---- paper trading: every paper account's trades (open ones too)
export function paperTrades(state: EngineState, accountId: string): ATrade[] {
  const book = state.books[accountId];
  if (!book) return [];
  return book.trades.map(t => {
    const open = t.exitTime == null;
    return {
      key: `${accountId}:${t.id}`, source: "paper" as const, symbol: t.symbol, side: t.side === "buy" ? "long" as const : "short" as const,
      qty: t.qty, entryTime: t.entryTime, exitTime: open ? null : t.exitTime!, entryPrice: t.entryPrice, exitPrice: open ? null : t.exitPrice ?? null,
      pnl: open ? 0 : t.pnl ?? 0, commission: 0, swap: 0, runUp: t.runUp, drawdown: t.drawdown, open,
    };
  });
}

// ---- the linked MT5 account's closed trades over the last `days`
export interface Mt5History { trades: ATrade[]; currency: string; balance: number | null }
export async function mt5Trades(uid: string, login: number, days: number): Promise<Mt5History> {
  const d = await api<{ trades: any[]; currency: string; balance: number | null }>(uid, "broker/{uid}/mt5/history/", { query: `&days=${days}` });
  return {
    currency: d.currency, balance: d.balance,
    trades: d.trades.map(t => ({
      key: `${login}:${t.ticket}`, source: "mt5" as const, symbol: t.symbol, side: t.side, qty: t.volume,
      entryTime: t.entry_time, exitTime: t.exit_time, entryPrice: t.entry_price, exitPrice: t.exit_price,
      pnl: Math.round((t.profit + t.commission + t.swap) * 100) / 100, commission: t.commission, swap: t.swap, open: false,
      signal: t.comment || undefined,
    })),
  };
}

// ---- saved backtests
export const listBacktests = (uid: string) => api<{ backtests: SavedBacktest[] }>(uid, "analytics/{uid}/backtests/").then(d => d.backtests);
export const getBacktest = (uid: string, id: number) => api<{ backtest: SavedBacktest }>(uid, `analytics/{uid}/backtests/${id}/`).then(d => d.backtest);
export const renameBacktest = (uid: string, id: number, name: string) => api(uid, `analytics/{uid}/backtests/${id}/`, { method: "PATCH", body: { name } });
export const deleteBacktest = (uid: string, id: number) => api(uid, `analytics/{uid}/backtests/${id}/`, { method: "DELETE" });
export function backtestTrades(b: SavedBacktest): ATrade[] {
  return (b.trades || []).map((t, i) => ({
    key: `${b.id}:${i}`, source: "backtest" as const, symbol: b.symbol, side: t.type === "Long" ? "long" as const : "short" as const,
    qty: t.qty ?? 0, entryTime: ms(t.entryTime), exitTime: t.exitTime != null ? ms(t.exitTime) : null,
    entryPrice: t.entryPrice ?? 0, exitPrice: t.exitPrice ?? null, pnl: t.netPnl, commission: t.commission ?? 0, swap: 0,
    runUp: t.favorableExcursion, drawdown: t.adverseExcursion, open: false,
    signal: [t.entrySignal, t.exitSignal].filter(Boolean).join(" → ") || undefined,
  }));
}
// From the Strategy Tester: its closed trades, saved for Analytics
export function saveBacktest(uid: string, run: { name: string; script: string; language: string; symbol: string; timeframe: string; report: PineStrategyReport }) {
  return api<{ backtest: SavedBacktest }>(uid, "analytics/{uid}/backtests/", { method: "POST", body: {
    name: run.name, script: run.script, language: run.language, symbol: run.symbol, timeframe: run.timeframe,
    initial_capital: run.report.initialCapital,
    trades: run.report.trades.map(t => ({
      type: t.type, entryTime: t.entryTime, entryPrice: t.entryPrice, exitTime: t.exitTime, exitPrice: t.exitPrice, qty: t.qty,
      netPnl: t.netPnl, commission: t.commission, favorableExcursion: t.favorableExcursion, adverseExcursion: t.adverseExcursion,
      entrySignal: t.entrySignal, exitSignal: t.exitSignal,
    })),
  } }).then(d => d.backtest);
}

// ---- journal
export const loadJournal = (uid: string, source: Source) =>
  api<{ entries: Journal[] }>(uid, "analytics/{uid}/journal/", { query: `&source=${source}` }).then(d => d.entries);
export const saveJournal = (uid: string, j: Journal) => api<{ entry: Journal }>(uid, "analytics/{uid}/journal/", { method: "PUT", body: j }).then(d => d.entry);
export const clearJournal = (uid: string, source: Source, key: string) =>
  api(uid, "analytics/{uid}/journal/", { method: "DELETE", query: `&source=${source}&trade_key=${encodeURIComponent(key)}` });
