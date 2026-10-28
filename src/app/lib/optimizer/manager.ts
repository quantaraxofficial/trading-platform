// Runs one optimization in this window: claims it, loads each symbol / timeframe's bars, backtests
// every combination from where it left off (in the optimizer worker; Python in its own), and sends
// the results in batches, which also tells the backend this window is still on it. Pausing finishes
// the combination under way and saves; closing the window sends what's done (the rest of that
// combination is tested again on Continue). It keeps going with the dialog closed, while the page
// is open.

import { useSyncExternalStore } from "react";
import { appIntervalToPineTf, type Bar } from "../pineScriptEngine";
import { fetchPineTimeframeData } from "../pineDataFetch";
import { runScriptAsync, type ScriptLanguage } from "../scripting";
import { ApiError, claimRun, patchRun, resultsUrl, sendResults, type OptRun } from "./api";
import { backtestWindow, DataLimitError, keepOnly, loadBars } from "./data";
import { computeMetrics, type Metrics } from "./metrics";
import { decode, orderOf, type Combo, type OptimizerConfig } from "./space";

export type Phase = "idle" | "starting" | "loading" | "running" | "pausing" | "waiting";
export interface OptimizerState {
  runId: number | null; phase: Phase; message: string; cursor: number; total: number;
  rate: number;             // combinations a second, this session
  sessionMs: number;        // running time this session
  error: string | null;     // why it stopped
  stoppedBy: "done" | "paused" | "elsewhere" | "error" | null;
}

const IDLE: OptimizerState = { runId: null, phase: "idle", message: "", cursor: 0, total: 0, rate: 0, sessionMs: 0, error: null, stoppedBy: null };
let state: OptimizerState = IDLE;
const subs = new Set<() => void>();
const set = (p: Partial<OptimizerState>) => { state = { ...state, ...p }; subs.forEach(f => f()); };
export const getOptimizerState = () => state;
export function useOptimizer(): OptimizerState {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => IDLE);
}

// This window, to the backend (one window runs an optimization at a time)
const RUNNER = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 36) : `w${Date.now()}${Math.random()}`.slice(0, 36);
export const thisWindow = () => RUNNER;

// ---- the worker

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (m: any) => void>();
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url));
    worker.onmessage = async (e) => {
      const m = e.data || {};
      if (m.type === "need") {
        let bars: Bar[] = [];
        try { bars = await fetchPineTimeframeData(m.tf, m.symbol); } catch { /* none */ }
        worker?.postMessage({ type: "tf", ask: m.ask, bars });
        return;
      }
      const done = pending.get(m.id); pending.delete(m.id); done?.(m);
    };
  }
  return worker;
}
const ask = (msg: Record<string, unknown>) => new Promise<any>(resolve => { const id = ++seq; pending.set(id, resolve); getWorker().postMessage({ ...msg, id }); });
const REST = { gentle: 3, balanced: 1, full: 0 } as const;

// ---- running

let stopWanted = false;
let active: Promise<void> | null = null;
type Row = { index: number; params: Combo; metrics?: Metrics; error?: string };
let unsent: Row[] = [];
let unsentMs = 0;
let current: { uid: string; id: number; pos: number } | null = null;

async function flush(uid: string, id: number, cursor: number): Promise<"ok" | "stopped"> {
  const results = unsent; const elapsed = unsentMs;
  unsent = []; unsentMs = 0;
  try {
    const r = await sendResults(uid, id, { runner: RUNNER, cursor, elapsed_ms: Math.round(elapsed), results });
    return r.status === "running" || r.status === "done" ? "ok" : "stopped";
  } catch (e) {
    if (e instanceof ApiError && e.data?.stopped) return "stopped";
    unsent = results.concat(unsent); unsentMs += elapsed;   // offline for a moment: sent with the next batch
    return "ok";
  }
}

// Closing the window: what's done so far goes with it
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (!current || (!unsent.length && !unsentMs)) return;
    const body = JSON.stringify({ runner: RUNNER, cursor: current.pos, elapsed_ms: Math.round(unsentMs), results: unsent });
    try { navigator.sendBeacon(resultsUrl(current.uid, current.id), new Blob([body], { type: "application/json" })); } catch { /* ignore */ }
    unsent = []; unsentMs = 0;
  });
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export function isRunningHere(runId: number) {
  return state.runId === runId && state.phase !== "idle";
}

// Starts (or continues) a run in this window. force: take it over from another window.
export async function startRun(uid: string, run: OptRun, code: string, force = false): Promise<void> {
  if (active) {
    if (state.runId === run.id) return;
    throw new Error("Another optimization is running in this window: pause it first");
  }
  stopWanted = false;
  set({ ...IDLE, runId: run.id, phase: "starting", cursor: run.cursor, total: run.total, message: "Starting…" });
  let claimed: OptRun;
  try {
    claimed = await claimRun(uid, run.id, RUNNER, force);
  } catch (e: any) {
    set({ ...IDLE, runId: run.id, cursor: run.cursor, total: run.total, error: e.message, stoppedBy: e?.data?.elsewhere ? "elsewhere" : "error" });
    throw e;
  }
  active = loop(uid, claimed, code).finally(() => { active = null; current = null; });
}

export async function pauseRun(uid: string, runId: number): Promise<void> {
  if (state.runId === runId && active) {
    stopWanted = true;
    set({ phase: "pausing", message: "Finishing the combination under way…" });
    await active;
  }
  try { await patchRun(uid, runId, { status: "paused" }); } catch { /* it's stopped here anyway */ }
  if (state.runId === runId) set({ phase: "idle", stoppedBy: state.stoppedBy || "paused" });
}

async function loop(uid: string, run: OptRun, code: string) {
  const cfg: OptimizerConfig = run.config;
  const language = run.language as ScriptLanguage;
  const order = orderOf(cfg);
  const total = run.total;
  let pos = run.cursor;
  current = { uid, id: run.id, pos };
  let loadedKey = "";
  let bars: Bar[] = [];
  let lastFlush = Date.now();
  const t0 = performance.now();
  let doneHere = 0;
  set({ phase: "loading", cursor: pos, total, message: "" });
  try {
    while (pos < total && !stopWanted) {
      const index = order ? order[pos] : pos;
      const combo = decode(cfg, index);
      const key = `${combo.symbol}|${combo.interval}`;
      if (key !== loadedKey) {
        // Load this symbol / timeframe's bars (waiting out the data provider's per-minute limit)
        set({ phase: "loading", message: `Loading ${combo.symbol} · ${combo.interval} bars…` });
        keepOnly(combo.symbol, combo.interval);
        for (;;) {
          try { bars = await loadBars(combo.symbol, combo.interval, cfg.period); break; } catch (e) {
            if (e instanceof DataLimitError && e.scope === "minute" && !stopWanted) {
              set({ phase: "waiting", message: "Waiting a minute for the market data provider's limit…" });
              if ((await flush(uid, run.id, pos)) === "stopped") { set({ stoppedBy: "elsewhere", error: "Another window took this optimization over" }); return; }
              lastFlush = Date.now();
              await wait(61_000);
              continue;
            }
            throw e;
          }
        }
        if (stopWanted) break;
        loadedKey = key;
        if (language !== "python") getWorker().postMessage({ type: "bars", key, bars: bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })) });
        set({ phase: "running", message: "" });
      }
      // One combination
      const t = performance.now();
      let row: Row;
      if (!bars.length) {
        row = { index, params: combo, error: `No ${combo.interval} data for ${combo.symbol}` };
      } else {
        const opts = { symbol: combo.symbol, pineTf: appIntervalToPineTf(combo.interval), initialCapital: cfg.capital ?? undefined, inputOverrides: combo.inputs, ...backtestWindow(cfg.period, bars) };
        if (language === "python") {
          try {
            const res = await runScriptAsync("python", code, bars, { ...opts, fetchTimeframe: fetchPineTimeframeData });
            row = res.errors.length ? { index, params: combo, error: `Script error: ${res.errors[0].message}`.slice(0, 280) }
              : res.strategyReport ? { index, params: combo, metrics: computeMetrics(res.strategyReport) } : { index, params: combo, error: "No strategy results (is it a strategy?)" };
          } catch (e: any) { row = { index, params: combo, error: `Failed: ${e?.message || e}`.slice(0, 280) }; }
          const rest = REST[cfg.pace] * (performance.now() - t);
          if (rest > 0) await ask({ type: "sleep", ms: Math.min(5000, rest) });
        } else {
          const m = await ask({ type: "run", language, code, key, opts, restFactor: REST[cfg.pace] });
          row = m.error ? { index, params: combo, error: m.error } : { index, params: combo, metrics: m.metrics };
        }
      }
      unsent.push(row);
      unsentMs += performance.now() - t;
      pos++; doneHere++;
      current.pos = pos;
      const sessionMs = performance.now() - t0;
      set({ cursor: pos, sessionMs, rate: doneHere / (sessionMs / 1000) });
      if (unsent.length >= 100 || Date.now() - lastFlush > 3000) {
        lastFlush = Date.now();
        if ((await flush(uid, run.id, pos)) === "stopped") {
          set({ phase: "idle", stoppedBy: "elsewhere", error: "Another window took this optimization over (or it was paused there)" });
          return;
        }
      }
    }
    const res = await flush(uid, run.id, pos);
    if (res === "stopped") { set({ phase: "idle", stoppedBy: "elsewhere", error: "Another window took this optimization over" }); return; }
    set({ phase: "idle", stoppedBy: pos >= total ? "done" : "paused", message: "" });
  } catch (e: any) {
    await flush(uid, run.id, pos).catch(() => {});
    try { await patchRun(uid, run.id, { status: "paused" }); } catch { /* ignore */ }
    const msg = e instanceof DataLimitError ? `${e.message}: continue tomorrow (it picks up where it stopped)` : `Stopped: ${e?.message || e}`;
    set({ phase: "idle", stoppedBy: "error", error: msg });
  }
}
