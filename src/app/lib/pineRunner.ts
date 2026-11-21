// Runs a Pine script in a background worker (pineWorker.ts) and resolves with its result; where
// workers aren't available it runs in place. The libraries it imports and the other timeframes it
// requests (request.security / request.security_lower_tf) are fetched here first, on the page,
// and handed to the run.
import { getPineRequestTimeframes, loadPineLibraries, runPineScript, type Bar, type PineRunResult } from "./pineScriptEngine";
import { fetchPineTimeframeData } from "./pineDataFetch";

type RunOpts = { symbol?: string; pineTf?: string; inputOverrides?: Record<string, any>; calcBarsCount?: number };

// Other timeframes' bars, kept a short while: live re-runs (every new tick) reuse them instead of
// downloading them again, yet the current bar's finer bars still catch up within seconds
const TF_TTL_MS = 15000;
const tfCache = new Map<string, { at: number; bars: Promise<Bar[]> }>();
function timeframeBars(symbol: string, tf: string): Promise<Bar[]> {
  const key = `${symbol}|${tf}`;
  const hit = tfCache.get(key);
  if (hit && Date.now() - hit.at < TF_TTL_MS) return hit.bars;
  const bars = fetchPineTimeframeData(tf, symbol).catch(() => [] as Bar[]);
  tfCache.set(key, { at: Date.now(), bars });
  return bars;
}

async function prepare(code: string, opts: RunOpts): Promise<Record<string, Bar[]>> {
  await loadPineLibraries(code);
  const tfs = opts.symbol ? getPineRequestTimeframes(code, opts.inputOverrides) : [];
  const mtfData: Record<string, Bar[]> = {};
  await Promise.all(tfs.map(async (tf) => { mtfData[tf] = await timeframeBars(opts.symbol!, tf); }));
  return mtfData;
}

const plain = (bars: Bar[]) => bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));

// In place: the libraries and timeframes first, then the run
const runHere = async (code: string, bars: Bar[], opts: RunOpts) => runPineScript(code, bars, { ...opts, mtfData: await prepare(code, opts) });

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

export async function runPineOffThread(code: string, bars: Bar[], opts: RunOpts): Promise<PineRunResult> {
  const w = getWorker();
  if (!w) return runHere(code, bars, opts);
  const mtfData = await prepare(code, opts);
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, (r) => (r ? resolve(r) : runHere(code, bars, opts).then(resolve)));
    // Bars go over as plain objects (no chart-library extras)
    const tfs: Record<string, Bar[]> = {};
    for (const tf in mtfData) tfs[tf] = plain(mtfData[tf]);
    w.postMessage({ id, code, bars: plain(bars), opts: { ...opts, mtfData: tfs } });
  });
}
