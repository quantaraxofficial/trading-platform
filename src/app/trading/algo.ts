// Chart strategies (Pine, Python, MQL5) auto-trading the linked MT5 account (backend
// core/broker_algo.py). Each chart reports its strategy's position whenever the strategy
// recalculates (each bar close, and each tick with "On realtime bar tick"); for a strategy that's
// switched on, the position goes to the server, which trades the account to match — once per
// change, however many tabs or re-runs report it. While one is on, the broker's own price moves
// that chart's live candle every few seconds, so its bars close (and the strategy recalculates)
// on time. It runs from the open chart: closing the page stops it.

import { useSyncExternalStore } from "react";
import { call, getBroker, mt5Symbol, subscribeBroker } from "./broker";

export interface AlgoPosition { dir: 1 | -1; entryTime: number }
// A chart's strategy as it stands now (live: the chart is on real-time data, not a replay or a past testing period)
export interface ChartStrategy { key: string; name: string; symbol: string; timeframe: string; barSeconds: number; position: AlgoPosition | null; live: boolean }
export interface AlgoStrategy {
  id: number; key: string; name: string; symbol: string; timeframe: string; lots: number;
  enabled: boolean; real_confirmed: boolean; last_key: string; magic: number; comment: string;
}
export interface AlgoLogEntry { id: number; strategy: number; name: string; at: number; action: string; message: string; ok: boolean }

interface AlgoState { uid: string | null; loaded: boolean; strategies: AlgoStrategy[]; log: AlgoLogEntry[]; charts: Record<string, ChartStrategy> }

const PRICE_MS = 5000;     // the broker's price for the chart, while a strategy trades
const RETRY_MS = 30000;    // another go at a report the server couldn't act on yet

let state: AlgoState = { uid: null, loaded: false, strategies: [], log: [], charts: {} };
const subs = new Set<() => void>();
const set = (patch: Partial<AlgoState>) => { state = { ...state, ...patch }; subs.forEach(f => f()); };

export const strategyKey = (name: string, symbol: string, timeframe: string) => `${name}|${symbol}|${timeframe}`;
export function positionKey(p: AlgoPosition | null) {
  if (!p) return "flat";
  const t = p.entryTime > 1e11 ? Math.floor(p.entryTime / 1000) : Math.floor(p.entryTime);
  return `${p.dir > 0 ? "long" : "short"}@${t}`;
}
const enabledFor = (key: string) => state.strategies.find(s => s.key === key && s.enabled);
const canTrade = () => { const b = getBroker(); return !!(b.uid && b.linked); };

export async function loadAlgo() {
  if (!canTrade()) { set({ strategies: [], log: [], loaded: true }); return; }
  try {
    const d = await call<{ strategies: AlgoStrategy[]; log: AlgoLogEntry[] }>("mt5/algo/");
    set({ strategies: d.strategies, log: d.log, loaded: true });
  } catch { set({ loaded: true }); }
  tick();
}

// ---- following the charts
const acked: Record<string, string> = {};                       // strategy → the position the server has dealt with
const tried: Record<string, { pk: string; at: number }> = {};
const inflight = new Set<string>();

async function follow(c: ChartStrategy) {
  if (!c.live || !canTrade()) return;
  const s = enabledFor(c.key);
  if (!s) return;
  const pk = positionKey(c.position);
  if (pk === s.last_key || acked[c.key] === pk || inflight.has(c.key)) return;
  const t = tried[c.key];
  if (t && t.pk === pk && Date.now() - t.at < RETRY_MS - 1000) return;
  inflight.add(c.key);
  tried[c.key] = { pk, at: Date.now() };
  try {
    const r = await call<{ action: string }>("mt5/algo/sync/", { method: "POST", body: {
      key: c.key, bar_seconds: c.barSeconds,
      position: c.position ? { dir: c.position.dir, entry_time: c.position.entryTime } : null,
    } });
    if (r.action === "none" || r.action === "traded" || r.action === "skipped") acked[c.key] = pk;
    if (r.action !== "none" && r.action !== "wait") await loadAlgo();
  } catch {
    await loadAlgo();   // what went wrong is in the strategy's log
  } finally {
    inflight.delete(c.key);
  }
}

// A chart's strategy now (null: the chart has no strategy any more)
export function reportStrategy(chartId: string, c: ChartStrategy | null) {
  const charts = { ...state.charts };
  if (c) charts[chartId] = c; else delete charts[chartId];
  set({ charts });
  tick();
  if (c) follow(c);
}

// Switches a chart's strategy on (lots; confirmReal on a real-money account) or off
export async function setAutoTrade(c: ChartStrategy, opts: { enabled: boolean; lots?: number; confirmReal?: boolean }) {
  await call("mt5/algo/", { method: "POST", body: {
    key: c.key, name: c.name, symbol: c.symbol, timeframe: c.timeframe, lots: opts.lots, enabled: opts.enabled,
    confirm_real: opts.confirmReal === true,
    position: c.position ? { dir: c.position.dir, entry_time: c.position.entryTime } : null,
  } });
  delete acked[c.key];
  delete tried[c.key];
  await loadAlgo();
}

export async function forgetAlgo(id: number) {
  await call(`mt5/algo/${id}/`, { method: "DELETE" });
  await loadAlgo();
}

// ---- the broker's price on the traded charts, and retries
let priceTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let pricing = false;

function traded(): ChartStrategy[] {
  return Object.values(state.charts).filter(c => c.live && enabledFor(c.key));
}

async function pushPrices() {
  if (pricing || !canTrade()) return;
  pricing = true;
  try {
    const symbols = Array.from(new Set(traded().map(c => c.symbol)));
    for (const symbol of symbols) {
      try {
        const q = await mt5Symbol(symbol);
        // Only a price that's moving (an old one: the market's closed — no new bars from it)
        if (q.bid && q.tick_time && Date.now() - q.tick_time < 120000)
          window.dispatchEvent(new CustomEvent("tv:broker-price", { detail: { symbol, price: q.bid, time: Date.now(), marketOpen: true } }));
      } catch { /* the broker's unreachable: the panel says so */ }
    }
  } finally { pricing = false; }
}

function tick() {
  if (typeof window === "undefined") return;
  const on = traded().length > 0;
  if (on && !priceTimer) {
    priceTimer = setInterval(pushPrices, PRICE_MS);
    retryTimer = setInterval(() => Object.values(state.charts).forEach(follow), RETRY_MS);
  } else if (!on && priceTimer) {
    clearInterval(priceTimer); priceTimer = null;
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
  }
}

// The signed-in user's strategies, again whenever the account changes
let seen = "";
subscribeBroker(() => {
  const b = getBroker();
  const id = `${b.uid}|${b.linked?.login ?? ""}|${b.loaded}`;
  if (id === seen) return;
  seen = id;
  set({ uid: b.uid });
  if (b.loaded) loadAlgo();
});

export function useAlgo(): AlgoState {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => state);
}
export const getAlgo = () => state;
