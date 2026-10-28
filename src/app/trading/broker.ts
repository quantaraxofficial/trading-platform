// A real broker account linked to the site: MetaTrader 5 (backend core/broker_mt5.py). Linking
// needs the account number, password and server; then, while it's the connected broker, its
// live figures (balance, equity, margin), positions, pending orders and today's deals refresh
// every few seconds. Paper Trading and MT5 are the two brokers: connecting one disconnects the
// other.

import { useSyncExternalStore } from "react";
import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";

export interface Mt5Linked { platform: "mt5"; login: number; server: string; name: string; company: string; currency: string; leverage: number; mode: "demo" | "contest" | "real"; linked_at: string }
export interface Mt5Account {
  login: number; name: string; server: string; company: string; currency: string; leverage: number;
  balance: number; equity: number; margin: number; free_margin: number; margin_level: number; profit: number;
  mode: "demo" | "contest" | "real"; trade_allowed: boolean;
}
export interface Mt5Position { ticket: number; symbol: string; side: "buy" | "sell"; volume: number; open_price: number; price: number; sl: number | null; tp: number | null; profit: number; swap: number; time: number; comment: string }
export interface Mt5Order { ticket: number; symbol: string; type: string; volume: number; price: number; sl: number | null; tp: number | null; time: number; comment: string }
export interface Mt5Deal { ticket: number; order: number; symbol: string; type: string; entry: string; volume: number; price: number; profit: number; commission: number; swap: number; time: number; comment: string }
export interface Mt5Live { account: Mt5Account; positions: Mt5Position[]; orders: Mt5Order[]; deals: Mt5Deal[]; at: number }

interface BrokerState { uid: string | null; linked: Mt5Linked | null; loaded: boolean; active: boolean; live: Mt5Live | null; error: string | null }
const ACTIVE_KEY = "tv:brokerActive";
const POLL_MS = 3000;

let state: BrokerState = { uid: null, linked: null, loaded: false, active: false, live: null, error: null };
const subs = new Set<() => void>();
const set = (patch: Partial<BrokerState>) => { state = { ...state, ...patch }; subs.forEach(f => f()); };
let timer: ReturnType<typeof setInterval> | null = null;

export async function call<T>(path: string, init?: { method?: string; body?: any }): Promise<T> {
  const [p, q] = path.split("__Q__");
  const res = await fetch(`${BACKEND}/api/users/broker/${encodeURIComponent(state.uid || "")}/${p}?session_key=${encodeURIComponent(sessionKey())}${q ? `&${q}` : ""}`, {
    method: init?.method || "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

async function refresh() {
  if (!state.uid || !state.active || !state.linked) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try { set({ live: await call<Mt5Live>("mt5/live/"), error: null }); }
  catch (e: any) { set({ error: e?.message || "Couldn't reach the broker" }); }
}
function schedule() {
  if (timer) clearInterval(timer);
  timer = state.uid && state.active && state.linked ? setInterval(refresh, POLL_MS) : null;
}

// Signed in as this user (null: signed out): their linked account, and whether it was the broker in use
export async function setBrokerUser(uid: string | null) {
  if (uid === state.uid) return;
  let active = false;
  try { active = !!uid && localStorage.getItem(ACTIVE_KEY) === "mt5"; } catch { /* storage off */ }
  set({ uid, linked: null, loaded: false, live: null, error: null, active: false });
  schedule();
  if (!uid) return;
  try {
    const d = await call<{ linked: Mt5Linked | null }>("mt5/");
    set({ linked: d.linked, loaded: true, active: active && !!d.linked });
  } catch { set({ loaded: true }); }
  schedule();
  refresh();
}

export async function linkMt5(login: string, password: string, server: string) {
  const d = await call<{ linked: Mt5Linked } & Mt5Live>("mt5/", { method: "POST", body: { login, password, server } });
  const { linked, ...live } = d;
  set({ linked, live, error: null });
  return linked;
}

export async function unlinkMt5() {
  await call("mt5/", { method: "DELETE" });
  setMt5Active(false);
  set({ linked: null, live: null });
}

// MT5 as the connected broker (the trading panel shows it), or not
export function setMt5Active(active: boolean) {
  try { localStorage.setItem(ACTIVE_KEY, active ? "mt5" : ""); } catch { /* storage off */ }
  set({ active: active && !!state.linked, ...(active ? {} : { live: null }) });
  schedule();
  if (active) refresh();
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { refresh(); });

// ---- trading on it (each answer carries the account right after, shown at once)
export interface Mt5SymbolInfo { symbol: string; tick_time?: number | null; digits: number; volume_min: number; volume_max: number; volume_step: number; contract_size: number; bid: number | null; ask: number | null }
export interface Mt5OrderInput { symbol: string; side: "buy" | "sell"; type: "market" | "limit" | "stop"; volume: string; price?: string; sl?: string; tp?: string; confirm_real?: boolean }
export interface Mt5Result { retcode: number; order: number; deal: number; volume: number; price: number; message: string; symbol?: string }

async function trade(path: string, method: string, body?: any): Promise<Mt5Result> {
  const d = await call<{ result: Mt5Result } & Mt5Live>(path, { method, body });
  const { result, ...live } = d;
  set({ live, error: null });
  return result;
}
// (__Q__ marks where a path's own query starts: call() joins it to the session key)
export const mt5Symbol = (symbol: string) => call<Mt5SymbolInfo>(`mt5/symbol/__Q__symbol=${encodeURIComponent(symbol)}`);
export const placeMt5Order = (o: Mt5OrderInput) => trade("mt5/order/", "POST", o);
export const closeMt5Position = (ticket: number, confirmReal = false) => trade(`mt5/position/${ticket}/${confirmReal ? "__Q__confirm_real=true" : ""}`, "DELETE");
export const modifyMt5Position = (ticket: number, sl: string, tp: string, confirmReal = false) =>
  trade(`mt5/position/${ticket}/`, "PATCH", { sl, tp, confirm_real: confirmReal });
export const cancelMt5Order = (ticket: number, confirmReal = false) => trade(`mt5/pending/${ticket}/${confirmReal ? "__Q__confirm_real=true" : ""}`, "DELETE");
export const modifyMt5Order = (ticket: number, price: string, sl: string, tp: string, confirmReal = false) =>
  trade(`mt5/pending/${ticket}/`, "PATCH", { price, sl, tp, confirm_real: confirmReal });

export function useBroker(): BrokerState {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => state);
}
export const getBroker = () => state;
export function subscribeBroker(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
