// Runs Pine scripts off the page's main thread, so a long script never freezes the chart
import { runPineScript } from "./pineScriptEngine";

self.onmessage = (e: MessageEvent) => {
  const { id, code, bars, opts } = e.data || {};
  let result: any;
  try {
    result = runPineScript(code, bars, opts);
  } catch (err: any) {
    result = { plots: [], markers: [], tables: [], strategyReport: null, inputs: [], logs: [], warnings: [], errors: [{ message: String(err?.message || err), code: "CE99999", line: 1 }], meta: { title: "", isStrategy: false, overlay: true, initialCapital: 0 }, execMs: 0 };
  }
  (self as any).postMessage({ id, result });
};
