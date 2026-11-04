// Backtest sessions: bar replays you come back to (backend core/analytics.py → ReplaySession). Each
// keeps where it is — symbol, timeframe, the bar, the zoom — and its own trading account (balance,
// positions, orders, trades), plus what you're testing and the time spent. The chart resumes one
// exactly where it was left (components/BacktestSessionBar.tsx); Analytics lists and analyses them.

import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";
import type { Account, Book } from "../trading/engine";
import type { ATrade } from "./data";

export type SessionStatus = "active" | "paused" | "completed";
export interface BacktestSession {
  id: number; name: string; symbol: string; interval: string; interval_label: string;
  start_time: number; current_time: number; visible_bars: number | null;   // seconds; bars across the chart
  initial_balance: number; balance: number; trade_count: number; open_count: number; net_pnl: number; wins: number;
  strategy: string; description: string; rules: string[]; tags: string[]; notes: string;
  status: SessionStatus; time_spent: number; created_at: number; updated_at: number;
  account?: Account | null; book?: Book | null;
}
export interface NewSession {
  name: string; symbol: string; interval: string; interval_label: string; start_time: number; initial_balance: number;
  strategy?: string; description?: string; rules?: string[]; tags?: string[];
  account?: Account; book?: Book; current_time?: number; visible_bars?: number | null;
  drawings?: unknown[];   // its own drawings to start with
}
export interface SessionProgress {
  current_time?: number; interval?: string; interval_label?: string; visible_bars?: number | null;
  account?: Account; book?: Book; add_time_spent?: number; status?: SessionStatus;
}

function url(uid: string, rest = "") {
  return `${BACKEND}/api/users/analytics/${encodeURIComponent(uid)}/sessions/${rest}?session_key=${encodeURIComponent(sessionKey())}`;
}
async function call<T>(uid: string, rest: string, method = "GET", body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(url(uid, rest), {
    method, keepalive, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export const listSessions = (uid: string) => call<{ sessions: BacktestSession[] }>(uid, "").then(d => d.sessions);
export const getSession = (uid: string, id: number) => call<{ session: BacktestSession }>(uid, `${id}/`).then(d => d.session);
export const createSession = (uid: string, s: NewSession) => call<{ session: BacktestSession }>(uid, "", "POST", s).then(d => d.session);
export const updateSession = (uid: string, id: number, patch: Partial<NewSession> & SessionProgress & { notes?: string }, keepalive = false) =>
  call<{ session: BacktestSession }>(uid, `${id}/`, "PATCH", patch, keepalive).then(d => d?.session);
export const deleteSession = (uid: string, id: number) => call(uid, `${id}/`, "DELETE");

// A fresh account for a new session (the paper engine's shape)
export function freshAccount(name: string, balance: number): Account {
  return { id: `bt${Date.now().toString(36)}`, name, currency: "USD", initialBalance: balance, balance, leverage: {} as Account["leverage"], createdAt: Date.now() };
}

// The session's trades, for Analytics
export function sessionTrades(s: BacktestSession): ATrade[] {
  return (s.book?.trades || []).map(t => {
    const open = t.exitTime == null;
    return {
      key: `${s.id}:${t.id}`, source: "session" as const, symbol: t.symbol, side: t.side === "buy" ? "long" as const : "short" as const, qty: t.qty,
      entryTime: t.entryTime, exitTime: open ? null : t.exitTime!, entryPrice: t.entryPrice, exitPrice: open ? null : t.exitPrice ?? null,
      pnl: open ? 0 : t.pnl ?? 0, commission: 0, swap: 0, runUp: t.runUp, drawdown: t.drawdown, open,
    };
  });
}

// Opening one on the chart: the chart page resumes it (as /?session=<id> does)
export const OPEN_SESSION_EVENT = "tv:open-backtest-session";
export function chartUrlFor(s: Pick<BacktestSession, "id" | "symbol">) {
  return `/?symbol=${encodeURIComponent(s.symbol)}&session=${s.id}`;
}

export function spent(seconds: number) {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// The session the chart is running now (the replay menu offers "Save as backtest session" only without one)
let activeId: number | null = null;
const activeSubs = new Set<() => void>();
export function setActiveSession(id: number | null) { if (id !== activeId) { activeId = id; activeSubs.forEach(f => f()); } }
export const getActiveSession = () => activeId;
export function subscribeActiveSession(f: () => void) { activeSubs.add(f); return () => { activeSubs.delete(f); }; }

// What the replay bar shows of the running session, and its buttons (BacktestSessionBar publishes it)
export interface SessionUi {
  id: number; name: string; equity: number; pnl: number; spent: string; saved: string; error: string | null;
  save: () => void; complete: () => void;
}
let ui: SessionUi | null = null;
const uiSubs = new Set<() => void>();
export function setSessionUi(next: SessionUi | null) { ui = next; uiSubs.forEach(f => f()); }
export const getSessionUi = () => ui;
export function subscribeSessionUi(f: () => void) { uiSubs.add(f); return () => { uiSubs.delete(f); }; }

// ---- each session's own drawings: while one is open, the chart draws into it instead of the
// symbol's drawings (components/drawing/core/DrawingContext.tsx)
export const getSessionDrawings = (uid: string, id: number) => call<{ drawings: any[] }>(uid, `${id}/drawings/`).then(d => d.drawings || []);
export const saveSessionDrawings = (uid: string, id: number, drawings: unknown[], keepalive = false) =>
  call(uid, `${id}/drawings/`, "PUT", { drawings }, keepalive);
let drawingSession: number | null = null;
const drawingSubs = new Set<() => void>();
export function setDrawingSession(id: number | null) { if (id !== drawingSession) { drawingSession = id; drawingSubs.forEach(f => f()); } }
export const getDrawingSession = () => drawingSession;
export function subscribeDrawingSession(f: () => void) { drawingSubs.add(f); return () => { drawingSubs.delete(f); }; }
// What's drawn on the chart now ("Save as backtest session" starts the session with it)
let drawingsGetter: () => unknown[] = () => [];
export function registerDrawingsGetter(get: () => unknown[]) { drawingsGetter = get; }
export const currentDrawings = () => drawingsGetter();
