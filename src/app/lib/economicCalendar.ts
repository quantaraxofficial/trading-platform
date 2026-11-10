"use client";

// The economic calendar's data (backend core/econ_calendar: Forex Factory's weekly feed, kept as a
// growing history) for the Economic calendar panel and the chart's event marks. Requests are
// cached for a few minutes and shared, so the panel and the chart don't both fetch.

import { useSyncExternalStore } from "react";
import { BACKEND_URL } from "@/lib/backend";

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

// ---- the panel's filters (this viewer's own: kept in the browser)
export type CalendarFilters = { impacts: Impact[]; currencies: string[]; chartOnly: boolean };
const FILTERS_KEY = "tv:econCalendarFilters";
const DEFAULT_FILTERS: CalendarFilters = { impacts: ["high", "medium", "low", "holiday"], currencies: CALENDAR_CURRENCIES, chartOnly: false };
let filters: CalendarFilters = DEFAULT_FILTERS;
let filtersRead = false;
const listeners = new Set<() => void>();
function readFilters(): CalendarFilters {
  if (!filtersRead && typeof window !== "undefined") {
    filtersRead = true;
    try { const v = JSON.parse(localStorage.getItem(FILTERS_KEY) || "null"); if (v && Array.isArray(v.impacts) && Array.isArray(v.currencies)) filters = { ...DEFAULT_FILTERS, ...v }; } catch { /* unavailable */ }
  }
  return filters;
}
export function setCalendarFilters(patch: Partial<CalendarFilters>) {
  filters = { ...readFilters(), ...patch };
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch { /* unavailable */ }
  listeners.forEach(l => l());
}
export const resetCalendarFilters = () => setCalendarFilters(DEFAULT_FILTERS);
export function useCalendarFilters(): CalendarFilters {
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, readFilters, () => DEFAULT_FILTERS);
}
export function passesFilters(e: EconEvent, f: CalendarFilters, chartCurrencies: string[]): boolean {
  if (!f.impacts.includes(e.impact)) return false;
  if (f.chartOnly) return chartCurrencies.includes(e.currency);
  return f.currencies.includes(e.currency);
}

// ---- periods, as TradingView's calendar offers them, in a timezone's days
export type Period = "yesterday" | "today" | "tomorrow" | "this_week" | "next_week";
export const PERIODS: { id: Period; label: string }[] = [
  { id: "yesterday", label: "Yesterday" }, { id: "today", label: "Today" }, { id: "tomorrow", label: "Tomorrow" },
  { id: "this_week", label: "This week" }, { id: "next_week", label: "Next week" },
];

// The UTC instant a wall-clock date-time in `tz` is
function zonedToUtc(y: number, m: number, d: number, tz: string): number {
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
