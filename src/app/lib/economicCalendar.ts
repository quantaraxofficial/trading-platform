"use client";

// The economic calendar's data (backend core/econ_calendar: Forex Factory's weekly feed, kept as a
// growing history) for the Economic calendar panel and the chart's event marks. Requests are
// cached for a few minutes and shared, so the panel and the chart don't both fetch.

import { makeStore } from "../trading/settings";
// (this branch has no shared backend URL module: the deployment overrides it, as FeedbackPanel does)
const BACKEND_URL = ((typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL) || "http://localhost:8000").replace(/\/$/, "");

export type Impact = "high" | "medium" | "low" | "holiday";
export type EconEvent = {
  id: string; title: string; currency: string; time: number;   // unix seconds, UTC
  all_day: boolean; tentative: boolean; impact: Impact;
  actual: string; forecast: string; previous: string; url: string;
};
export type EconResult = { events: EconEvent[]; coverage: { from: number | null; to: number | null }; updated: number | null; source: string };

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; p: Promise<EconResult> }>();

export function fetchEconomicEvents(from: number, to: number, force = false): Promise<EconResult> {
  const key = `${from}:${to}`;
  const hit = cache.get(key);
  if (hit && !force && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = fetch(`${BACKEND_URL}/api/users/calendar/economic/?from=${from}&to=${to}`)
    .then(r => { if (!r.ok) throw new Error(`The calendar couldn't be loaded (${r.status})`); return r.json() as Promise<EconResult>; });
  cache.set(key, { at: Date.now(), p });
  p.catch(() => cache.delete(key));
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
  return p;
}

export const CURRENCY_NAMES: Record<string, string> = {
  USD: "United States", EUR: "Euro Area", GBP: "United Kingdom", JPY: "Japan", AUD: "Australia",
  NZD: "New Zealand", CAD: "Canada", CHF: "Switzerland", CNY: "China", ALL: "Global",
};
export const CALENDAR_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNY", "ALL"];
export const IMPACT_LABEL: Record<Impact, string> = { high: "High importance", medium: "Medium importance", low: "Low importance", holiday: "Bank holiday" };
export const IMPACT_COLOR: Record<Impact, string> = { high: "#f23645", medium: "#ff9800", low: "#787b86", holiday: "#787b86" };

// The currencies a chart symbol moves with: XAU/USD → USD, EURJPY → EUR and JPY, BTCUSD → USD
export function symbolCurrencies(symbol: string): string[] {
  const s = symbol.toUpperCase().replace(/^[A-Z]+:/, "").replace(/[^A-Z]/g, "");
  const out = new Set<string>();
  if (s.length >= 6) { out.add(s.slice(0, 3)); out.add(s.slice(3, 6)); }
  return Array.from(out).filter(c => c !== "ALL" && c in CURRENCY_NAMES);
}

// ---- the Calendar window, as TradingView's: an overlay over the right of the window or a split
// view beside the whole layout (like the Pine Editor), its width, and whether it's collapsed
export type CalendarDock = { open: boolean; collapsed: boolean; mode: "overlay" | "split"; width: number; maximized: boolean; headerCollapsed: boolean };
export const calendarDock = makeStore<CalendarDock>("tv:calendarDock", { open: false, collapsed: false, mode: "overlay", width: 0, maximized: false, headerCollapsed: false });
export const defaultCalendarWidth = () => (typeof window === "undefined" ? 720 : Math.round(window.innerWidth / 2));
export const clampCalendarWidth = (w: number) => Math.max(420, Math.min(w, (typeof window === "undefined" ? 1440 : window.innerWidth) - 240));
export const openCalendar = () => calendarDock.set(d => ({ open: true, collapsed: false, width: d.width || defaultCalendarWidth() }));
export const toggleCalendar = () => { const d = calendarDock.get(); if (d.open && !d.collapsed) calendarDock.set({ collapsed: true }); else openCalendar(); };

// ---- its settings (this viewer's own: kept in the browser)
export type CalendarTimezone = "chart" | "local" | "UTC";
export type CalendarSettings = { countries: string[]; highOnly: boolean; category: string; timezone: CalendarTimezone };
export const calendarSettings = makeStore<CalendarSettings>("tv:calendarSettings", { countries: CALENDAR_CURRENCIES, highOnly: false, category: "all", timezone: "chart" });
export function resolveTimezone(tz: CalendarTimezone): string {
  if (tz === "UTC") return "UTC";
  if (tz === "local") { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } }
  return calendarTimezone();
}
// "UTC+5:30", "UTC−4", "UTC"
export function utcOffsetLabel(tz: string, at = Date.now()): string {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date(at)).find(p => p.type === "timeZoneName")?.value || "GMT";
    return name.replace("GMT", "UTC").replace("-", "−");
  } catch { return "UTC"; }
}

// ---- categories, as TradingView sorts economic events (from the event's name)
export const CATEGORIES: { id: string; label: string; re: RegExp }[] = [
  { id: "taxes", label: "Taxes", re: /\btax/i },
  { id: "bonds", label: "Bonds", re: /auction|\bbond|\bbill\b|gilt|\bbtp|bund|yield|\bnotes?\b|\bjgb/i },
  { id: "gdp", label: "GDP", re: /\bgdp\b|gross domestic/i },
  { id: "labor", label: "Labor", re: /employ|jobless|payroll|\bnfp\b|claimant|labou?r|\bjobs?\b|\bjolts\b|\badp\b|wage|earnings|hours worked/i },
  { id: "prices", label: "Prices", re: /\bcpi\b|\bppi\b|\bpce\b|inflation|price|deflator|\bhicp\b|\brpi\b|\btrimmed mean\b/i },
  { id: "housing", label: "Housing", re: /hous|home|building|mortgage|construction|\bhpi\b|pending|dwelling/i },
  { id: "trade", label: "Trade", re: /trade|export|import|current account|tourist/i },
  { id: "money", label: "Money", re: /rate statement|cash rate|interest rate|bank rate|policy rate|monetary|\bm[0-3]\b|money supply|loans|lending|credit|reserves|financing|speaks|testif|\bfomc\b|\becb\b|\bboe\b|\bboj\b|\brba\b|\brbnz\b|\bsnb\b|\bboc\b|\bpboc\b|\bfed\b|press conference|minutes/i },
  { id: "government", label: "Government", re: /budget|government|treasury|election|summit|meeting|\bg7\b|\bg20\b|president|parliament|vote|fiscal|holiday|minister/i },
  { id: "business", label: "Business", re: /pmi|manufactur|industrial|production|business|\bism\b|factory|capex|orders|sentix|\bzew\b|\bifo\b|nfib|inventor|empire state|philly|tankan|durable|leading/i },
  { id: "consumer", label: "Consumer", re: /retail|consumer|sentiment|spending|confidence|sales|\bcar\b|vehicle/i },
  { id: "health", label: "Health", re: /covid|health|pandemic/i },
];
export function categoryOf(e: EconEvent): string {
  if (/covid|health|pandemic/i.test(e.title)) return "health";
  for (const c of CATEGORIES) if (c.id !== "health" && c.re.test(e.title)) return c.id;
  return "business";
}
// The categories menu, in TradingView's order
export const CATEGORY_MENU = ["bonds", "business", "consumer", "gdp", "government", "health", "housing", "labor", "money", "prices", "trade", "taxes"]
  .map(id => CATEGORIES.find(c => c.id === id)!);
// The week (Monday to Sunday, in `tz`) a moment falls in: its seven days' starts and the end
export function weekDays(t: number, tz: string): number[] {
  const p = dayParts(t, tz);
  const monday = -((p.wd + 6) % 7);
  return Array.from({ length: 8 }, (_, i) => { const u = new Date(Date.UTC(p.y, p.m - 1, p.d + monday + i)); return zonedToUtc(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate(), tz); });
}

// ---- periods, as TradingView's calendar offers them, in a timezone's days
export type Period = "yesterday" | "today" | "tomorrow" | "this_week" | "next_week";
export const PERIODS: { id: Period; label: string }[] = [
  { id: "yesterday", label: "Yesterday" }, { id: "today", label: "Today" }, { id: "tomorrow", label: "Tomorrow" },
  { id: "this_week", label: "This week" }, { id: "next_week", label: "Next week" },
];

// The UTC instant a wall-clock date-time in `tz` is
export function zonedToUtc(y: number, m: number, d: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d);
  const off = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(new Date(t)).map(x => [x.type, Number(x.value)]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  return (guess - off(guess - off(guess))) / 1000;
}
export function dayParts(t: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short" })
    .formatToParts(new Date(t * 1000)).map(x => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
// [from, to) in unix seconds; weeks run Monday to Sunday
export function periodRange(period: Period, tz: string, now = Date.now() / 1000): [number, number] {
  const t = dayParts(now, tz);
  const day = (offset: number) => { const u = new Date(Date.UTC(t.y, t.m - 1, t.d + offset)); return zonedToUtc(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate(), tz); };
  const monday = -((t.wd + 6) % 7);
  switch (period) {
    case "yesterday": return [day(-1), day(0)];
    case "today": return [day(0), day(1)];
    case "tomorrow": return [day(1), day(2)];
    case "this_week": return [day(monday), day(monday + 7)];
    case "next_week": return [day(monday + 7), day(monday + 14)];
  }
}

// The chart's timezone (ChartContainer publishes it), else the browser's
export function calendarTimezone(): string {
  const tz = typeof window !== "undefined" ? (window as any).__chartTimezone : null;
  if (typeof tz === "string" && tz && tz !== "exchange") return tz;
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

export const fmtTime = (t: number, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t * 1000));
export const fmtDayHeading = (t: number, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" }).format(new Date(t * 1000));
export function fmtIn(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m` : "now";
}
