// Backtest sessions: bar replays you come back to (backend core/analytics.py → ReplaySession). Each
// keeps where it is — symbol, timeframe, the bar, the zoom — and its own trading account (balance,
// positions, orders, trades), plus what you're testing and the time spent. The chart resumes one
// exactly where it was left (components/BacktestSessionBar.tsx); Analytics lists and analyses them.

import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";
import type { Account, Book } from "../trading/engine";
import type { ATrade } from "./data";

export type SessionStatus = "active" | "paused" | "completed";
export type LengthUnit = "hours" | "days" | "weeks" | "months" | "years";
export const LENGTH_UNITS: LengthUnit[] = ["hours", "days", "weeks", "months", "years"];
export interface SessionLength { value: number; unit: LengthUnit }
export interface BacktestSession {
  id: number; name: string; symbol: string; interval: string; interval_label: string;
  start_time: number; current_time: number; visible_bars: number | null;   // seconds; bars across the chart
  initial_balance: number; balance: number; trade_count: number; open_count: number; net_pnl: number; wins: number;
  strategy: string; description: string; rules: string[]; tags: string[]; notes: string;
  status: SessionStatus; time_spent: number; created_at: number; updated_at: number;
  on_leaderboard?: boolean;   // shown on the leaderboard's Manual backtests tab
  // How much market time it's meant to cover (optional) and the bar that is (seconds)
  length: SessionLength | null; end_time: number | null;
  account?: Account | null; book?: Book | null;
}
export interface NewSession {
  name: string; symbol: string; interval: string; interval_label: string; start_time: number; initial_balance: number;
  strategy?: string; description?: string; rules?: string[]; tags?: string[];
  account?: Account; book?: Book; current_time?: number; visible_bars?: number | null;
  drawings?: unknown[];   // its own drawings to start with
  length?: SessionLength | null;
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
export const updateSession = (uid: string, id: number, patch: Partial<NewSession> & SessionProgress & { notes?: string; on_leaderboard?: boolean }, keepalive = false) =>
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
  return `/chart?symbol=${encodeURIComponent(s.symbol)}&session=${s.id}`;
}

// The bar `length` after `start` (seconds, UTC), as the server works it out (core/analytics.py
// end_of): a month later is the same day, or the month's last day
export function endOf(start: number, length: SessionLength): number {
  const span: Record<string, number> = { hours: 3600, days: 86400, weeks: 7 * 86400 };
  if (span[length.unit]) return start + length.value * span[length.unit];
  const d = new Date(start * 1000);
  const months = length.value * (length.unit === "years" ? 12 : 1);
  const y = d.getUTCFullYear() + Math.floor((d.getUTCMonth() + months) / 12);
  const m = (d.getUTCMonth() + months) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()) / 1000);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
export const lengthText = (l: SessionLength) => plural(l.value, l.unit.replace(/s$/, ""));

// What's left of a session with a length: market time from the bar it's on to its end, in
// words ("2 months 5 days left"), how far through it is (0..1), and whether it's done
export function timeLeft(s: Pick<BacktestSession, "start_time" | "current_time" | "end_time" | "length">): { text: string; done: boolean; progress: number } | null {
  if (!s.end_time || !s.length) return null;
  const total = Math.max(1, s.end_time - s.start_time);
  const left = s.end_time - s.current_time;
  const progress = Math.min(1, Math.max(0, (s.current_time - s.start_time) / total));
  if (left <= 0) return { text: `Done: all ${lengthText(s.length)} covered`, done: true, progress: 1 };
  const DAY = 86400, MONTH = 30.44 * DAY, YEAR = 365.25 * DAY;
  let words: string;
  if (left >= YEAR) { const y = Math.floor(left / YEAR), mo = Math.floor((left - y * YEAR) / MONTH); words = plural(y, "year") + (mo ? ` ${plural(mo, "month")}` : ""); }
  else if (left >= MONTH) { const mo = Math.floor(left / MONTH), d = Math.floor((left - mo * MONTH) / DAY); words = plural(mo, "month") + (d ? ` ${plural(d, "day")}` : ""); }
  else if (left >= DAY) { const d = Math.floor(left / DAY), h = Math.floor((left - d * DAY) / 3600); words = plural(d, "day") + (h ? ` ${plural(h, "hour")}` : ""); }
  else if (left >= 3600) { const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60); words = plural(h, "hour") + (m ? ` ${m} min` : ""); }
  else words = `${Math.max(1, Math.floor(left / 60))} min`;
  return { text: `${words} left`, done: false, progress };
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
