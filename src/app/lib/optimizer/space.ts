// The strategy optimizer's search space: the symbols, chart timeframes and input values to try,
// every combination numbered (a mixed-radix number: symbol and timeframe are the most significant
// digits, so combinations that share their bars run one after another), and the order they're
// tested in — all of them, or a random sample fixed by a seed so a paused run continues with the
// same sample.

import type { PineInputMeta } from "../pineScriptEngine";

export const MAX_COMBINATIONS = 100_000;
const MAX_VALUES = 2_000;

export const OPT_INTERVALS: { value: string; label: string }[] = [
  { value: "1min", label: "1m" }, { value: "5min", label: "5m" }, { value: "15min", label: "15m" }, { value: "30min", label: "30m" },
  { value: "45min", label: "45m" }, { value: "1h", label: "1h" }, { value: "2h", label: "2h" }, { value: "4h", label: "4h" },
  { value: "1day", label: "D" }, { value: "1week", label: "W" }, { value: "1month", label: "M" },
];
export const intervalLabel = (v: string) => OPT_INTERVALS.find(i => i.value === v)?.label ?? v;
// A timeframe input's choices (Pine timeframe strings)
export const TF_INPUT_OPTIONS = ["1", "5", "15", "30", "60", "120", "240", "D", "W", "M"];

export interface RangeSpec { key: string; title: string; type: "int" | "float"; on: boolean; from: number; to: number; step: number }
export interface ListSpec { key: string; title: string; type: "bool" | "string" | "timeframe"; on: boolean; values: (string | boolean)[]; options: (string | boolean)[] }
export type ParamSpec = RangeSpec | ListSpec;
export const isRange = (p: ParamSpec): p is RangeSpec => p.type === "int" || p.type === "float";

export type Period = { kind: "chart" } | { kind: "days"; days: number } | { kind: "custom"; from: number; to: number } | { kind: "history" };

export interface OptimizerConfig {
  symbols: string[];
  intervals: string[];
  params: ParamSpec[];
  period: Period;
  capital: number | null;               // null: the script's own initial capital
  search: { mode: "grid" | "random"; samples: number; seed: number };
  pace: "gentle" | "balanced" | "full";
  // What each combination leaves behind besides its metrics: its trades as a CSV in Downloads.
  // (Changes without starting the run over: it doesn't change what's tested.)
  output?: { tradesCsv?: boolean };
}

export interface Combo { symbol: string; interval: string; inputs: Record<string, number | string | boolean> }

// ---- values

const decimalsOf = (n: number) => { const s = String(n); const i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; };

export function rangeValues(type: "int" | "float", from: number, to: number, step: number): number[] {
  if (![from, to, step].every(Number.isFinite) || step <= 0) return [];
  if (to < from) [from, to] = [to, from];
  const dec = type === "int" ? 0 : Math.min(8, Math.max(decimalsOf(from), decimalsOf(step), decimalsOf(to)));
  const out: number[] = [];
  for (let i = 0; ; i++) {
    let v = from + i * step;
    if (v > to + step * 1e-9) break;
    v = type === "int" ? Math.round(v) : Number(v.toFixed(dec));
    if (out[out.length - 1] !== v) out.push(v);
    if (out.length > MAX_VALUES) break;
  }
  return out;
}

export function valuesOf(p: ParamSpec): (number | string | boolean)[] {
  return isRange(p) ? rangeValues(p.type, p.from, p.to, p.step) : p.values;
}

// A sensible starting range around an input's default (about 5–10 values)
export function defaultSpec(m: PineInputMeta): ParamSpec | null {
  if (m.type === "int" || m.type === "float") {
    const def = Number(m.value);
    if (!Number.isFinite(def)) return null;
    const lo = m.minval ?? (def > 0 ? 0 : -Infinity), hi = m.maxval ?? Infinity;
    let from: number, to: number;
    if (def === 0) { from = 0; to = m.type === "int" ? 10 : 1; } else { from = def / 2; to = def * 1.5; if (from > to) [from, to] = [to, from]; }
    from = Math.max(lo, from); to = Math.min(hi, to);
    let step: number;
    if (m.type === "int") {
      from = Math.round(from); to = Math.round(to);
      step = Math.max(m.step && m.step >= 1 ? Math.round(m.step) : 1, Math.ceil((to - from) / 8));
    } else {
      const raw = (to - from) / 6 || Math.abs(def) / 10 || 0.1;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      step = Number((Math.ceil(raw / mag) * mag).toPrecision(2));
      if (m.step && m.step > step) step = m.step;
      const d = decimalsOf(step);
      from = Number(from.toFixed(d)); to = Number(to.toFixed(d));
    }
    return { key: m.varName, title: m.title, type: m.type, on: true, from, to, step };
  }
  if (m.type === "bool") return { key: m.varName, title: m.title, type: "bool", on: false, values: [!!m.value], options: [true, false] };
  if (m.type === "string" && m.options?.length) return { key: m.varName, title: m.title, type: "string", on: false, values: [String(m.value)], options: m.options };
  if (m.type === "timeframe") {
    const cur = String(m.value ?? "");
    const opts = TF_INPUT_OPTIONS.includes(cur) || !cur ? TF_INPUT_OPTIONS : [cur, ...TF_INPUT_OPTIONS];
    return { key: m.varName, title: m.title, type: "timeframe", on: false, values: [cur], options: opts };
  }
  return null;   // colours, sources, symbols, text: not varied
}

// ---- the space

export interface Dim { key: string; values: (number | string | boolean)[] }

export function dimsOf(c: OptimizerConfig): Dim[] {
  return [
    { key: "symbol", values: c.symbols },
    { key: "interval", values: c.intervals },
    ...c.params.filter(p => p.on).map(p => ({ key: `input:${p.key}`, values: valuesOf(p) })),
  ];
}

export function spaceSize(c: OptimizerConfig): number {
  return dimsOf(c).reduce((n, d) => n * d.values.length, 1);
}

export function totalOf(c: OptimizerConfig): number {
  const size = spaceSize(c);
  return c.search.mode === "random" ? Math.min(size, Math.max(1, Math.floor(c.search.samples))) : size;
}

export function decode(c: OptimizerConfig, index: number): Combo {
  const dims = dimsOf(c);
  const out: Combo = { symbol: "", interval: "", inputs: {} };
  const picked: (number | string | boolean)[] = [];
  let rest = index;
  for (let i = dims.length - 1; i >= 0; i--) {
    const n = dims[i].values.length;
    picked[i] = dims[i].values[rest % n];
    rest = Math.floor(rest / n);
  }
  // (inputs in the script's own order, for file names and how settings read)
  dims.forEach((d, i) => {
    if (d.key === "symbol") out.symbol = String(picked[i]);
    else if (d.key === "interval") out.interval = String(picked[i]);
    else out.inputs[d.key.slice(6)] = picked[i];
  });
  return out;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The combination numbers in the order they're tested: all in order, or the random sample sorted
// (so each symbol / timeframe's bars are loaded once). The same config always gives the same order.
export function orderOf(c: OptimizerConfig): number[] | null {
  const size = spaceSize(c);
  const total = totalOf(c);
  if (c.search.mode !== "random" || total >= size) return null;
  const rand = mulberry32(c.search.seed || 1);
  const picked = new Set<number>();
  while (picked.size < total) picked.add(Math.floor(rand() * size));
  return Array.from(picked).sort((a, b) => a - b);
}

export function problemsOf(c: OptimizerConfig): string | null {
  if (!c.symbols.length) return "Add at least one symbol";
  if (!c.intervals.length) return "Pick at least one timeframe";
  for (const p of c.params.filter(p => p.on)) {
    const n = valuesOf(p).length;
    if (!n) return `${p.title}: give a range (from, to, and a step above 0)`;
    if (n > MAX_VALUES) return `${p.title}: too many values (${MAX_VALUES.toLocaleString()} at most): use a bigger step`;
  }
  if (c.period.kind === "custom" && !(c.period.from < c.period.to)) return "The testing period's start must be before its end";
  if (c.period.kind === "days" && !(c.period.days > 0)) return "How many days to test?";
  const total = totalOf(c);
  if (total > MAX_COMBINATIONS) return `${total.toLocaleString()} combinations is too many: at most ${MAX_COMBINATIONS.toLocaleString()}. Narrow the ranges, or test a random sample.`;
  return null;
}
