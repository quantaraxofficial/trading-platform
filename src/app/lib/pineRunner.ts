// Runs a Pine script in a background worker (pineWorker.ts) and resolves with its result; where
// workers aren't available it runs in place.
import { runPineScript, type Bar, type PineRunResult } from "./pineScriptEngine";

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const pending = new Map<number, (r: PineRunResult) => void>();

function getWorker(): Worker | null {
  if (broken || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./pineWorker.ts", import.meta.url));
      worker.onmessage = (e) => { const { id, result } = e.data || {}; const done = pending.get(id); pending.delete(id); done?.(result); };
      worker.onerror = () => {
        // A worker that can't start: everything still pending, and from now on, runs in place
        broken = true; worker = null;
        const waiting = Array.from(pending.values()); pending.clear();
        waiting.forEach((done) => done(null as any));
      };
    } catch { broken = true; return null; }
  }
  return worker;
}

export function runPineOffThread(code: string, bars: Bar[], opts: { symbol?: string; pineTf?: string; inputOverrides?: Record<string, any> }): Promise<PineRunResult> {
  const w = getWorker();
  if (!w) return Promise.resolve(runPineScript(code, bars, opts));
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, (r) => resolve(r || runPineScript(code, bars, opts)));
    // Bars go over as plain objects (no chart-library extras)
    w.postMessage({ id, code, bars: bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })), opts });
  });
}
