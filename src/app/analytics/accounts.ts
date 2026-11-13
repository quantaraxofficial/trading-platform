// Connected accounts (backend core/stats_accounts.py): MT5 and cTrader accounts at any broker or prop
// firm, read only, for Analytics (their trades), their live state, prop-firm rules and the leaderboard.

import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";
import type { ATrade } from "./data";

export type Platform = "mt5" | "ctrader";
export interface Rules {
  firm: string; phase: string; account_size: number | null; profit_target_pct: number | null; daily_loss_pct: number | null;
  max_loss_pct: number | null; max_loss_trailing: boolean; min_trading_days: number;
}
export interface Progress {
  error?: string;
  size: number; balance: number; equity: number; profit: number; profit_pct: number;
  target: { pct: number; amount: number; progress: number; reached: boolean } | null;
  daily: { pct: number; day_start: number; floor: number; used: number; left: number; used_pct: number } | null;
  max: { pct: number; trailing: boolean; floor: number; left: number; used_pct: number } | null;
  days: { traded: number; min: number; met: boolean };
  breach: { rule: "daily" | "max"; at: number; balance: number; live?: boolean } | null;
  status: "active" | "passed" | "breached";
}
export interface RawTrade {
  ticket: number; symbol: string; side: "long" | "short"; volume: number; entry_time: number; entry_price: number;
  exit_time: number; exit_price: number; profit: number; commission: number; swap: number; pnl: number; comment?: string;
}
export interface StatsAccount {
  id: number; platform: Platform; label: string; login: number; server: string; broker: string; currency: string; mode: string;
  show_live: boolean; on_leaderboard: boolean; rules: Rules; initial_balance: number | null; balance: number | null;
  synced_at: string | null; last_error: string; trade_count: number; trades?: RawTrade[]; progress: Progress | null;
}
export interface LivePosition { ticket: number; symbol: string; side: "buy" | "sell"; volume: number; open_price: number; sl: number | null; tp: number | null; profit: number; swap: number; time: number }
export interface LiveState {
  account: { login: number; broker: string; currency: string; balance: number; equity: number; floating: number; margin?: number; free_margin?: number; leverage: number; mode: string };
  positions: LivePosition[]; at: number; progress: Progress | null;
}
export interface PresetPhase { id: string; label: string; target: number | null; daily: number; max: number; trailing: boolean; min_days: number }
export interface Preset { id: string; firm: string; name: string; phases: PresetPhase[] }

async function call<T>(path: string, init?: { method?: string; body?: unknown; query?: string }): Promise<T> {
  const res = await fetch(`${BACKEND}/api/users/${path}?session_key=${encodeURIComponent(sessionKey())}${init?.query || ""}`, {
    method: init?.method || "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}
const u = (uid: string) => `stats/${encodeURIComponent(uid)}`;

export const listAccounts = (uid: string) => call<{ accounts: StatsAccount[]; ctrader: boolean }>(`${u(uid)}/accounts/`);
export const getAccount = (uid: string, id: number) => call<{ account: StatsAccount }>(`${u(uid)}/accounts/${id}/`).then(d => d.account);
export const connectMt5 = (uid: string, body: { login: string; password: string; server: string; label?: string }) =>
  call<{ account: StatsAccount }>(`${u(uid)}/accounts/`, { method: "POST", body }).then(d => d.account);
export const updateAccount = (uid: string, id: number, body: Partial<Rules> & { label?: string; show_live?: boolean; on_leaderboard?: boolean; keep_rules?: boolean }) =>
  call<{ account: StatsAccount }>(`${u(uid)}/accounts/${id}/`, { method: "PATCH", body }).then(d => d.account);
export const removeAccount = (uid: string, id: number) => call(`${u(uid)}/accounts/${id}/`, { method: "DELETE" });
export const syncAccount = (uid: string, id: number) => call<{ account: StatsAccount; live: LiveState }>(`${u(uid)}/accounts/${id}/sync/`, { method: "POST" });
export const liveState = (uid: string, id: number) => call<LiveState>(`${u(uid)}/accounts/${id}/live/`);
export const ctraderUrl = (uid: string, state: string) => call<{ url: string }>(`${u(uid)}/ctrader/`, { query: `&state=${encodeURIComponent(state)}` }).then(d => d.url);
export const ctraderConnect = (uid: string, code: string) => call<{ accounts: StatsAccount[] }>(`${u(uid)}/ctrader/`, { method: "POST", body: { code } }).then(d => d.accounts);
export const loadPresets = () => call<{ presets: Preset[] }>("stats/presets/").then(d => d.presets);

export function accountTrades(a: StatsAccount): ATrade[] {
  return (a.trades || []).map(t => ({
    key: `${a.id}:${t.ticket}`, source: "account" as const, symbol: t.symbol, side: t.side, qty: t.volume,
    entryTime: t.entry_time, exitTime: t.exit_time, entryPrice: t.entry_price, exitPrice: t.exit_price,
    pnl: t.pnl, commission: t.commission, swap: t.swap, open: false, signal: t.comment || undefined,
  }));
}
export const accountName = (a: StatsAccount) => a.label || `${a.platform === "mt5" ? "MT5" : "cTrader"} · ${a.login}`;

// ---- the leaderboard (public)
export type LbPeriod = "7d" | "30d" | "90d" | "1y" | "all";
export type LbSort = "return" | "profit_factor" | "win_rate" | "net";
export interface LbRow {
  rank: number; id: number; name: string; username: string; platform: Platform; broker: string; mode: string; currency: string; label: string; prop: string;
  return_pct: number; net: number; trades: number; win_rate: number; profit_factor: number | null; max_dd_pct: number; days: number; synced_at: string | null;
}
export interface LbBacktestRow {
  rank: number; id: number; name: string; username: string; strategy: string; script: string; language: string; symbol: string; timeframe: string; capital: number;
  period_from: number | null; period_to: number | null; return_pct: number; net: number; trades: number; win_rate: number; profit_factor: number | null; max_dd_pct: number;
  published: "public" | "private"; script_id: number | null;
}
export interface LbManualRow {
  rank: number; id: number; name: string; username: string; session: string; strategy: string; symbol: string; timeframe: string; capital: number; status: string;
  period_from: number; period_to: number; time_spent: number; return_pct: number; net: number; trades: number; win_rate: number; profit_factor: number | null; max_dd_pct: number;
}
export const leaderboard = (q: { period: LbPeriod; sort: LbSort; platform?: string; mode?: string }) =>
  fetch(`${BACKEND}/api/users/stats/leaderboard/?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`)
    .then(r => r.json() as Promise<{ rows: LbRow[]; min_trades: number }>);
export const manualLeaderboard = (q: { sort: LbSort; symbol?: string }) =>
  fetch(`${BACKEND}/api/users/stats/leaderboard/manual/?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`)
    .then(r => r.json() as Promise<{ rows: LbManualRow[]; min_trades: number }>);
export const backtestLeaderboard = (q: { sort: LbSort; symbol?: string }) =>
  fetch(`${BACKEND}/api/users/stats/leaderboard/backtests/?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`)
    .then(r => r.json() as Promise<{ rows: LbBacktestRow[]; min_trades: number }>);
