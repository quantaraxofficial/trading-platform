// Chart intervals as the app writes them ("30s", "15min", "4h", "1day", "2week", "3month", "10r",
// "100t"), with TradingView's names for them ("15 minutes", "15m"), their length, the interval
// menu's standard sections and the user's custom intervals (TradingView's "Add custom interval").

export type IntervalUnit = "t" | "s" | "min" | "h" | "day" | "week" | "month" | "r";

export interface ParsedInterval { n: number; unit: IntervalUnit }

const UNIT_RE = /^(\d+)(t|s|min|h|day|week|month|r)$/;

export function parseInterval(v: string): ParsedInterval | null {
  const m = UNIT_RE.exec(v || "");
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 ? { n, unit: m[2] as IntervalUnit } : null;
}

const NAMES: Record<IntervalUnit, [string, string]> = {
  t: ["tick", "ticks"], s: ["second", "seconds"], min: ["minute", "minutes"], h: ["hour", "hours"],
  day: ["day", "days"], week: ["week", "weeks"], month: ["month", "months"], r: ["range", "ranges"],
};

// "15 minutes", "1 day", "10 ranges"
export function intervalName(v: string): string {
  const p = parseInterval(v);
  if (!p) return v;
  return `${p.n} ${NAMES[p.unit][p.n === 1 ? 0 : 1]}`;
}

// TradingView's short form in the header and on the chart: 15m, 4h, D, 2D, W, M, 3M, 30s, 10R, 100T
export function intervalShort(v: string): string {
  const p = parseInterval(v);
  if (!p) return v;
  switch (p.unit) {
    case "t": return `${p.n}T`;
    case "s": return `${p.n}s`;
    case "min": return `${p.n}m`;
    case "h": return `${p.n}h`;
    case "day": return p.n === 1 ? "D" : `${p.n}D`;
    case "week": return p.n === 1 ? "W" : `${p.n}W`;
    case "month": return p.n === 1 ? "M" : `${p.n}M`;
    case "r": return `${p.n}R`;
  }
}

const UNIT_SEC: Record<IntervalUnit, number> = { t: 0, s: 1, min: 60, h: 3600, day: 86400, week: 7 * 86400, month: 30 * 86400, r: 0 };

// Length of one bar in seconds (months approximate; ticks and ranges have no fixed length)
export function intervalSeconds(v: string): number {
  const p = parseInterval(v);
  return p ? p.n * UNIT_SEC[p.unit] : 0;
}

// Sort order: ticks, then by length, then ranges (TradingView's sortResolutions)
const UNIT_ORDER: Record<IntervalUnit, number> = { t: 0, s: 1, min: 1, h: 1, day: 1, week: 1, month: 1, r: 2 };
export function compareIntervals(a: string, b: string): number {
  const pa = parseInterval(a), pb = parseInterval(b);
  if (!pa || !pb) return 0;
  if (UNIT_ORDER[pa.unit] !== UNIT_ORDER[pb.unit]) return UNIT_ORDER[pa.unit] - UNIT_ORDER[pb.unit];
  const la = UNIT_ORDER[pa.unit] === 1 ? intervalSeconds(a) : pa.n;
  const lb = UNIT_ORDER[pb.unit] === 1 ? intervalSeconds(b) : pb.n;
  return la - lb;
}
export const sortIntervals = (list: string[]) => [...list].sort(compareIntervals);

// The interval menu's sections, in TradingView's order and with its standard rows
export type SectionId = "ticks" | "seconds" | "minutes" | "hours" | "days" | "ranges";
export const SECTIONS: { id: SectionId; title: string; standard: string[] }[] = [
  { id: "ticks", title: "Ticks", standard: ["1t", "10t", "100t", "1000t"] },
  { id: "seconds", title: "Seconds", standard: ["1s", "5s", "10s", "15s", "30s", "45s"] },
  { id: "minutes", title: "Minutes", standard: ["1min", "3min", "5min", "15min", "30min", "45min"] },
  { id: "hours", title: "Hours", standard: ["1h", "2h", "3h", "4h"] },
  { id: "days", title: "Days", standard: ["1day", "1week", "1month", "3month", "6month", "12month"] },
  { id: "ranges", title: "Ranges", standard: ["1r", "10r", "100r", "1000r"] },
];
const STANDARD = new Set(SECTIONS.flatMap(s => s.standard));
export const isStandardInterval = (v: string) => STANDARD.has(v);

// Which section an interval belongs in (days, weeks and months share "Days", as on TradingView)
export function sectionOf(v: string): SectionId | null {
  const p = parseInterval(v);
  if (!p) return null;
  switch (p.unit) {
    case "t": return "ticks";
    case "s": return "seconds";
    case "min": return "minutes";
    case "h": return "hours";
    case "day": case "week": case "month": return "days";
    case "r": return "ranges";
  }
}

// Whether this app's data can draw the interval. Bars come from TwelveData (any length of minutes,
// hours, days, weeks or months, resampled on the server from its native bars) and the MT5 feed
// (30-second bars); there is no tick-by-tick feed, so tick and range bars and the other second
// intervals can't be built.
export function isIntervalAvailable(v: string): boolean {
  const p = parseInterval(v);
  if (!p) return false;
  if (p.unit === "t" || p.unit === "r") return false;
  if (p.unit === "s") return p.n === 30;
  return true;
}

// ---------------------------------------------------------------- custom intervals

// The "Add custom interval" dialog's types and their largest values (TradingView's limits)
export const CUSTOM_TYPES: { id: "min" | "h" | "day" | "week" | "month" | "r"; label: string; max: number }[] = [
  { id: "min", label: "minutes", max: 1440 },
  { id: "h", label: "hours", max: 24 },
  { id: "day", label: "days", max: 365 },
  { id: "week", label: "weeks", max: 52 },
  { id: "month", label: "months", max: 12 },
  { id: "r", label: "range", max: 1000000 },
];

// How an entered value is stored. A whole number of hours entered as minutes is kept as hours
// ("120 minutes" is the standard "2 hours"), so the same interval can't be added twice.
export function normalizeCustom(n: number, type: string): string {
  if (type === "min" && n % 60 === 0) return `${n / 60}h`;
  return `${n}${type}`;
}

const CUSTOM_KEY = "tv:customIntervals";
// 2 and 10 minutes aren't standard TradingView rows; the menu offered them before custom
// intervals existed, so they start out as custom ones (removable with the row's bin)
const DEFAULT_CUSTOM = ["2min", "10min"];
const listeners = new Set<() => void>();

export function getCustomIntervals(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw === null) return DEFAULT_CUSTOM;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!parseInterval(x)) : [];
  } catch { return []; }
}
function setCustomIntervals(list: string[]) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(sortIntervals(list))); } catch { /* storage unavailable */ }
  listeners.forEach(l => l());
}
export function subscribeCustomIntervals(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === CUSTOM_KEY) l(); };
  window.addEventListener("storage", onStorage);
  // Cloud sync writes the key without a storage event in this tab
  const onSync = (e: Event) => { if ((e as CustomEvent).detail?.keys?.includes(CUSTOM_KEY)) l(); };
  window.addEventListener("tv:cloud-sync", onSync);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); window.removeEventListener("tv:cloud-sync", onSync); };
}

// Adds a custom interval; null when it's out of range or already in the menu
export function addCustomInterval(n: number, type: string): string | null {
  const t = CUSTOM_TYPES.find(x => x.id === type);
  if (!t || !(n >= 1) || n > t.max) return null;
  const v = normalizeCustom(n, type);
  const list = getCustomIntervals();
  if (isStandardInterval(v) || list.includes(v)) return null;
  setCustomIntervals([...list, v]);
  return v;
}
export function removeCustomInterval(v: string) {
  setCustomIntervals(getCustomIntervals().filter(x => x !== v));
}

// The dialog's check of a value: null when it can be added
export function customIntervalError(value: string, type: string): "invalid" | "already_exists" | null {
  const n = Number(value);
  if (!n) return null;
  const t = CUSTOM_TYPES.find(x => x.id === type);
  if (!t || n > t.max) return "invalid";
  const v = normalizeCustom(n, type);
  return isStandardInterval(v) || getCustomIntervals().includes(v) ? "already_exists" : null;
}
