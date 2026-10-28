// Backtests one optimizer combination at a time off the page's main thread (Pine and MQL5; Python
// has its own worker), and answers with just its metrics. A script asking for another timeframe
// (request.security) gets its bars from the page. The pace's rest between runs happens here too,
// where a background tab doesn't slow timers down.

import { runPineScriptAsync, type Bar } from "../pineScriptEngine";
import { runMql5 } from "../scripting/mql5Runtime";
import { computeMetrics } from "./metrics";

const bars = new Map<string, Bar[]>();
const waiting = new Map<number, (b: Bar[]) => void>();
let nextAsk = 0;

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

function fetchTimeframe(tf: string, symbol: string): Promise<Bar[]> {
  const ask = ++nextAsk;
  return new Promise(resolve => { waiting.set(ask, resolve); post({ type: "need", ask, tf, symbol }); });
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data || {};
  if (m.type === "bars") { bars.clear(); bars.set(m.key, m.bars); return; }
  if (m.type === "tf") { const done = waiting.get(m.ask); waiting.delete(m.ask); done?.(m.bars || []); return; }
  if (m.type === "sleep") { setTimeout(() => post({ type: "slept", id: m.id }), m.ms); return; }
  if (m.type !== "run") return;
  const t0 = performance.now();
  let out: { metrics?: unknown; error?: string };
  try {
    const data = bars.get(m.key) || [];
    const opts = { ...m.opts, fetchTimeframe };
    const result = m.language === "mql5" ? await runMql5(m.code, data, opts) : await runPineScriptAsync(m.code, data, opts);
    if (result.errors.length) out = { error: `Script error: ${result.errors[0].message}`.slice(0, 280) };
    else if (!result.strategyReport) out = { error: "No strategy results (is it a strategy?)" };
    else out = { metrics: computeMetrics(result.strategyReport) };
  } catch (err: any) {
    out = { error: `Failed: ${String(err?.message || err)}`.slice(0, 280) };
  }
  const ms = performance.now() - t0;
  // The pace: rest in proportion to how long the run took (gentle 3×, balanced 1×, full speed none)
  const rest = Math.min(5000, ms * (m.restFactor || 0));
  setTimeout(() => post({ type: "done", id: m.id, ms, ...out }), rest);
};
