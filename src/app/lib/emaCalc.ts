// TradingView's "Moving Average Exponential" (EMA) indicator: its inputs, style and visibility
// settings and the values it plots — the EMA, and with Smoothing on an "EMA-based MA" (plus
// Bollinger Bands around it), optionally calculated on a higher timeframe than the chart's.

export type EmaSource = "Open" | "High" | "Low" | "Close" | "Volume" | "(H + L)/2" | "(H + L + C)/3" | "(O + H + L + C)/4" | "(H + L + C + C)/4" | "Vol: Volume" | "Vol: Volume MA";
export const EMA_SOURCES: EmaSource[] = ["Open", "High", "Low", "Close", "Volume", "(H + L)/2", "(H + L + C)/3", "(O + H + L + C)/4", "(H + L + C + C)/4", "Vol: Volume", "Vol: Volume MA"];
export type SmoothingType = "None" | "SMA" | "SMA + Bollinger Bands" | "EMA" | "SMMA (RMA)" | "WMA" | "VWMA";
export const SMOOTHING_TYPES: SmoothingType[] = ["None", "SMA", "SMA + Bollinger Bands", "EMA", "SMMA (RMA)", "WMA", "VWMA"];
export const EMA_TIMEFRAMES = ["Chart", "1 tick", "10 ticks", "100 ticks", "1000 ticks", "1 second", "5 seconds", "10 seconds", "15 seconds", "30 seconds", "45 seconds",
  "1 minute", "2 minutes", "3 minutes", "5 minutes", "10 minutes", "15 minutes", "30 minutes", "45 minutes", "1 hour", "2 hours", "3 hours", "4 hours",
  "1 day", "1 week", "1 month", "3 months", "6 months", "12 months"];

export type PlotStyle = { visible: boolean; color: string; lineWidth: number; lineStyle: string };
export type VisRange = { enabled: boolean; from: number; to: number };
export interface EmaConfig {
  length: number; source: EmaSource | string; offset: number;
  smoothingType: SmoothingType; smoothingLength: number; bbStdDev: number;
  timeframe: string; waitForClose: boolean;
  // the EMA plot (the eye in the legend hides the whole indicator; this hides just the line)
  plotVisible: boolean; color: string; lineWidth: number; lineStyle: string; plotType?: any; priceLine?: boolean;
  maPlot: PlotStyle; upperPlot: PlotStyle; lowerPlot: PlotStyle; bbFill: { visible: boolean; color: string };
  precision: string; labelsOnScale: boolean; valuesInStatusLine: boolean; inputsInStatusLine: boolean;
  visibility: { ticks: boolean; seconds: VisRange; minutes: VisRange; hours: VisRange; days: VisRange; weeks: VisRange; months: VisRange; ranges: boolean };
}

export const EMA_DEFAULTS: EmaConfig = {
  length: 9, source: "Close", offset: 0,
  smoothingType: "None", smoothingLength: 14, bbStdDev: 2,
  timeframe: "Chart", waitForClose: true,
  plotVisible: true, color: "#2962ff", lineWidth: 1, lineStyle: "Solid", plotType: "line", priceLine: false,
  maPlot: { visible: true, color: "#FFEB3B", lineWidth: 1, lineStyle: "Solid" },
  upperPlot: { visible: true, color: "#4CAF50", lineWidth: 1, lineStyle: "Solid" },
  lowerPlot: { visible: true, color: "#4CAF50", lineWidth: 1, lineStyle: "Solid" },
  bbFill: { visible: true, color: "rgba(76, 175, 80, 0.1)" },
  precision: "Default", labelsOnScale: true, valuesInStatusLine: true, inputsInStatusLine: true,
  visibility: {
    ticks: true, ranges: true,
    seconds: { enabled: true, from: 1, to: 59 }, minutes: { enabled: true, from: 1, to: 59 }, hours: { enabled: true, from: 1, to: 24 },
    days: { enabled: true, from: 1, to: 366 }, weeks: { enabled: true, from: 1, to: 52 }, months: { enabled: true, from: 1, to: 12 },
  },
};

// "Defaults → Save as default" (used for every new EMA)
const DEFAULTS_KEY = "tv:emaDefaults";
export function savedEmaDefaults(): EmaConfig {
  try { const raw = localStorage.getItem(DEFAULTS_KEY); if (raw) return normalizeEma(JSON.parse(raw)); } catch { /* ignore */ }
  return normalizeEma({});
}
export function saveEmaDefaults(cfg: EmaConfig) {
  try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

// Older saved configs only had length / source / colour…: fill in the rest
export function normalizeEma(c: any): EmaConfig {
  const d = EMA_DEFAULTS;
  const src = typeof c?.source === "string" ? (EMA_SOURCES.find(s => s.toLowerCase() === c.source.toLowerCase()) || "Close") : d.source;
  return {
    ...d, ...c, source: src,
    maPlot: { ...d.maPlot, ...(c?.maPlot || {}) }, upperPlot: { ...d.upperPlot, ...(c?.upperPlot || {}) }, lowerPlot: { ...d.lowerPlot, ...(c?.lowerPlot || {}) },
    bbFill: { ...d.bbFill, ...(c?.bbFill || {}) },
    visibility: {
      ...d.visibility, ...(c?.visibility || {}),
      seconds: { ...d.visibility.seconds, ...(c?.visibility?.seconds || {}) }, minutes: { ...d.visibility.minutes, ...(c?.visibility?.minutes || {}) },
      hours: { ...d.visibility.hours, ...(c?.visibility?.hours || {}) }, days: { ...d.visibility.days, ...(c?.visibility?.days || {}) },
      weeks: { ...d.visibility.weeks, ...(c?.visibility?.weeks || {}) }, months: { ...d.visibility.months, ...(c?.visibility?.months || {}) },
    },
  };
}

type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type Pt = { time: number; value: number };

function sourceValues(bars: Bar[], source: string): number[] {
  const vol = bars.map(b => b.volume ?? 0);
  switch (source) {
    case "Open": return bars.map(b => b.open);
    case "High": return bars.map(b => b.high);
    case "Low": return bars.map(b => b.low);
    case "Volume": case "Vol: Volume": return vol;
    case "Vol: Volume MA": return sma(vol, 20);
    case "(H + L)/2": return bars.map(b => (b.high + b.low) / 2);
    case "(H + L + C)/3": return bars.map(b => (b.high + b.low + b.close) / 3);
    case "(O + H + L + C)/4": return bars.map(b => (b.open + b.high + b.low + b.close) / 4);
    case "(H + L + C + C)/4": return bars.map(b => (b.high + b.low + 2 * b.close) / 4);
    default: return bars.map(b => b.close);
  }
}

// Pine's ta.ema (as its reference implementation): seeded with the first value
export function ema(src: number[], len: number): number[] {
  const out = new Array(src.length).fill(NaN);
  const k = 2 / (len + 1);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!isFinite(v)) { out[i] = prev; continue; }
    prev = isNaN(prev) ? v : (v - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}
export function sma(src: number[], len: number): number[] {
  const out = new Array(src.length).fill(NaN);
  let sum = 0, n = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!isFinite(v)) { sum = 0; n = 0; continue; }
    sum += v; n++;
    if (n > len) { sum -= src[i - len]; n = len; }
    if (n === len) out[i] = sum / len;
  }
  return out;
}
function rma(src: number[], len: number): number[] {
  const out = new Array(src.length).fill(NaN);
  let prev = NaN, sum = 0, n = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!isFinite(v)) continue;
    if (isNaN(prev)) { sum += v; n++; if (n === len) { prev = sum / len; out[i] = prev; } continue; }
    prev = (prev * (len - 1) + v) / len; out[i] = prev;
  }
  return out;
}
function wma(src: number[], len: number): number[] {
  const out = new Array(src.length).fill(NaN);
  const den = (len * (len + 1)) / 2;
  for (let i = len - 1; i < src.length; i++) {
    let s = 0, ok = true;
    for (let j = 0; j < len; j++) { const v = src[i - j]; if (!isFinite(v)) { ok = false; break; } s += v * (len - j); }
    if (ok) out[i] = s / den;
  }
  return out;
}
function vwma(src: number[], vol: number[], len: number): number[] {
  const a = sma(src.map((v, i) => v * vol[i]), len), b = sma(vol, len);
  return a.map((v, i) => (b[i] ? v / b[i] : NaN));
}
function stdev(src: number[], len: number): number[] {
  const m = sma(src, len);
  return src.map((_, i) => {
    if (!isFinite(m[i])) return NaN;
    let s = 0;
    for (let j = 0; j < len; j++) { const d = src[i - j] - m[i]; s += d * d; }
    return Math.sqrt(s / len);
  });
}

// ---- timeframes
const UNIT_SEC: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000 };
export function timeframeSeconds(tf: string): number | null {
  const m = /^(\d+)\s+(tick|second|minute|hour|day|week|month)s?$/.exec(tf);
  if (!m || m[2] === "tick") return null;
  return +m[1] * UNIT_SEC[m[2]];
}
export function chartIntervalSeconds(iv: string): number {
  const m = /^(\d+)(min|h|day|week|month)$/.exec(iv);
  if (!m) return 60;
  const n = +m[1];
  return m[2] === "min" ? n * 60 : m[2] === "h" ? n * 3600 : m[2] === "day" ? n * 86400 : m[2] === "week" ? n * 604800 : n * 2592000;
}
// The start of the higher-timeframe bar that `t` falls in
function bucketOf(t: number, tf: string): number {
  const m = /^(\d+)\s+(second|minute|hour|day|week|month)s?$/.exec(tf)!;
  const n = +m[1], unit = m[2];
  if (unit === "month") { const d = new Date(t * 1000); const mi = d.getUTCFullYear() * 12 + d.getUTCMonth(); return mi - (mi % n); }
  if (unit === "week") { const monday = Math.floor((t - 4 * 86400) / 604800); return monday - (monday % n); }   // epoch was a Thursday
  const sec = n * UNIT_SEC[unit];
  return Math.floor(t / sec) * sec;
}

export type EmaOutput = { ema: Pt[]; ma?: Pt[]; upper?: Pt[]; lower?: Pt[] };

function smoothing(cfg: EmaConfig, out: number[], vol: number[]): { ma?: number[]; upper?: number[]; lower?: number[] } {
  if (cfg.smoothingType === "None") return {};
  const len = Math.max(1, Math.round(cfg.smoothingLength) || 14);
  const t = cfg.smoothingType;
  const ma = t === "SMA" || t === "SMA + Bollinger Bands" ? sma(out, len) : t === "EMA" ? ema(out, len) : t === "SMMA (RMA)" ? rma(out, len) : t === "WMA" ? wma(out, len) : vwma(out, vol, len);
  if (t !== "SMA + Bollinger Bands") return { ma };
  const sd = stdev(out, len), mult = cfg.bbStdDev || 2;
  return { ma, upper: ma.map((v, i) => v + sd[i] * mult), lower: ma.map((v, i) => v - sd[i] * mult) };
}

export function computeEma(bars: Bar[], cfg: EmaConfig, chartInterval: string): EmaOutput {
  if (!bars.length) return { ema: [] };
  const len = Math.max(1, Math.round(cfg.length) || 9);
  const tfSec = cfg.timeframe === "Chart" ? null : timeframeSeconds(cfg.timeframe);
  let main: number[], extra: { ma?: number[]; upper?: number[]; lower?: number[] };
  if (tfSec && tfSec > chartIntervalSeconds(chartInterval)) {
    // Higher timeframe: build its bars from the chart's, calculate there, and show each chart
    // bar the value of its higher-timeframe bar — "Wait for timeframe closes" shows a bar's
    // value only once it has closed (the previous one's until then)
    const htf: Bar[] = []; const idxOf: number[] = []; let key = NaN;
    bars.forEach((b, i) => {
      const k = bucketOf(b.time, cfg.timeframe);
      if (k !== key) { key = k; htf.push({ ...b }); }
      else { const h = htf[htf.length - 1]; h.high = Math.max(h.high, b.high); h.low = Math.min(h.low, b.low); h.close = b.close; h.volume = (h.volume ?? 0) + (b.volume ?? 0); }
      idxOf[i] = htf.length - 1;
    });
    const hSrc = sourceValues(htf, cfg.source);
    const hOut = ema(hSrc, len);
    const hExtra = smoothing(cfg, hOut, htf.map(b => b.volume ?? 0));
    // a chart bar is the last of its higher-timeframe bar when the next one starts a new bucket
    const pick = (arr: number[]) => bars.map((_, i) => {
      const h = idxOf[i];
      const closedHere = i === bars.length - 1 ? false : idxOf[i + 1] !== h;
      if (!cfg.waitForClose) {
        // intrabar: the higher-timeframe value as it stood at this chart bar's close
        return arr[h];
      }
      return closedHere ? arr[h] : (h > 0 ? arr[h - 1] : NaN);
    });
    if (!cfg.waitForClose) {
      // recompute the forming higher-timeframe bar at each chart bar so history doesn't peek ahead
      const partial: number[] = new Array(bars.length).fill(NaN);
      const k = 2 / (len + 1);
      bars.forEach((b, i) => {
        const h = idxOf[i];
        const prev = h > 0 ? hOut[h - 1] : NaN;
        const s = sourceValues([{ ...htf[h], close: b.close, high: Math.max(htf[h].open, b.high), low: Math.min(htf[h].open, b.low) }], cfg.source)[0];
        partial[i] = isFinite(prev) ? (s - prev) * k + prev : hOut[h];
      });
      main = partial;
    } else main = pick(hOut);
    extra = { ma: hExtra.ma && pick(hExtra.ma), upper: hExtra.upper && pick(hExtra.upper), lower: hExtra.lower && pick(hExtra.lower) };
  } else {
    main = ema(sourceValues(bars, cfg.source), len);
    extra = smoothing(cfg, main, bars.map(b => b.volume ?? 0));
  }
  // Offset moves the plots by whole bars (right for positive)
  const off = Math.round(cfg.offset) || 0;
  const toPts = (arr?: number[]) => {
    if (!arr) return undefined;
    const pts: Pt[] = [];
    for (let i = 0; i < bars.length; i++) {
      const j = i - off;
      if (j < 0 || j >= arr.length) continue;
      const v = arr[j];
      if (isFinite(v)) pts.push({ time: bars[i].time, value: v });
    }
    return pts;
  };
  return { ema: toPts(main)!, ma: toPts(extra.ma), upper: toPts(extra.upper), lower: toPts(extra.lower) };
}

// Visibility tab: whether the indicator shows on this chart interval
export function emaVisibleOnInterval(cfg: EmaConfig, chartInterval: string): boolean {
  const m = /^(\d+)(min|h|day|week|month)$/.exec(chartInterval);
  if (!m) return true;
  const n = +m[1];
  const key = m[2] === "min" ? "minutes" : m[2] === "h" ? "hours" : m[2] === "day" ? "days" : m[2] === "week" ? "weeks" : "months";
  const r = (cfg.visibility as any)[key] as VisRange;
  return !!r && r.enabled && n >= r.from && n <= r.to;
}

// The legend's input values ("9 close"), as TradingView writes them
export function emaInputsText(cfg: EmaConfig): string {
  const src = String(cfg.source).replace(/^Vol: /, "").toLowerCase();
  const parts = [String(cfg.length), src];
  if (cfg.offset) parts.push(String(cfg.offset));
  if (cfg.timeframe !== "Chart") {
    const m = /^(\d+) (\w+?)s?$/.exec(cfg.timeframe);
    const suffix: Record<string, string> = { tick: "T", second: "S", minute: "", hour: "H", day: "D", week: "W", month: "M" };
    if (m) parts.push(m[2] === "hour" ? String(+m[1] * 60) : `${m[1]}${suffix[m[2]] ?? ""}`);
  }
  return parts.join(" ");
}
