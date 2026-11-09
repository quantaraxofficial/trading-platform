// Vantage (MT5) market data, served by our own backend: candles on every timeframe from the
// ClickHouse history, and live ticks over a WebSocket (ws/ticks/<symbol>/) that the MT5 collector
// feeds. For these symbols the chart uses nothing else; every other symbol stays on TwelveData.
//
// Bars start where TradingView's OANDA bars start: the trading day opens at 17:00 New York (00:00
// on Vantage's server clock, New York + 7 h), intraday bars count from there, daily bars carry
// the server date (at 00:00 UTC, like the other feed's daily bars), weeks start on Monday.

import { BACKEND_URL } from "@/lib/backend";
import { engine } from "../trading/store";

// Gold and the forex pairs whose full history is stored (pipeline/start_backfill.ps1) and which the
// live collector streams (pipeline/start_live_collector.ps1). A pair joins this list only once its
// backfill is done: before that its charts would show just the collector's last few days.
// Still to join when their backfill finishes: NZDUSD, EURJPY, GBPJPY, EURGBP, AUDJPY, USDINR,
// USDMXN, EURAUD. NEXT_PUBLIC_VANTAGE_SYMBOLS, when set at build time, replaces the list.
const DEFAULT_VANTAGE_SYMBOLS = "XAUUSD,EURUSD,GBPUSD,USDJPY,USDCHF,USDCAD,AUDUSD";
export const VANTAGE_SYMBOLS = new Set(
  (process.env.NEXT_PUBLIC_VANTAGE_SYMBOLS || DEFAULT_VANTAGE_SYMBOLS).split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
);

const norm = (symbol: string) => symbol.toUpperCase().replace(/\//g, "");
export const isVantageSymbol = (symbol: string) => VANTAGE_SYMBOLS.has(norm(symbol));

type Spec = { kind: "intraday" | "day" | "week" | "month"; n: number };

// "30s", "15min", "4h", "1day", "1week", "3month" → how the backend builds it; null when it can't
// be made from the stored 30- or 15-second bars (other seconds, range / tick charts)
export function vantageInterval(interval: string): Spec | null {
  const m = /^(\d+)(s|min|h|day|week|month)$/.exec(interval);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!(n > 0)) return null;
  if (m[2] === "s" || m[2] === "min" || m[2] === "h") {
    const secs = n * (m[2] === "s" ? 1 : m[2] === "min" ? 60 : 3600);
    // (15 s / 45 s come from the 15-second bars the server keeps too)
    return secs % 15 === 0 && secs <= 86400 ? { kind: "intraday", n: secs } : null;
  }
  return { kind: m[2] as Spec["kind"], n };
}

// New York's UTC offset (seconds) at a moment, cached per hour
const nyFmt = typeof Intl !== "undefined"
  ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
  : null;
const offsetCache = new Map<number, number>();
function nyOffset(utcS: number): number {
  const hour = Math.floor(utcS / 3600);
  const hit = offsetCache.get(hour);
  if (hit !== undefined) return hit;
  let off = -5 * 3600;
  if (nyFmt) {
    const p: Record<string, number> = {};
    for (const x of nyFmt.formatToParts(new Date(hour * 3600 * 1000))) if (x.type !== "literal") p[x.type] = parseInt(x.value, 10);
    off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - hour * 3600;
  }
  if (offsetCache.size > 500) offsetCache.clear();
  offsetCache.set(hour, off);
  return off;
}

// The time (unix s) of the bar a moment belongs to: the same rule the backend uses
export function vantageBarTime(interval: string, tMs: number): number | null {
  const spec = vantageInterval(interval);
  if (!spec) return null;
  const u = Math.floor(tMs / 1000);
  const s = u + 7 * 3600 + nyOffset(u);
  const { kind, n } = spec;
  if (kind === "intraday") return Math.floor(s / 86400) * 86400 + Math.floor((s % 86400) / n) * n - (s - u);
  const d = Math.floor(s / 86400);
  if (kind === "day") return Math.floor(d / n) * n * 86400;
  if (kind === "week") return (4 + Math.floor((d - 4) / (7 * n)) * 7 * n) * 86400;
  const dt = new Date(d * 86400 * 1000);
  const mon = Math.floor((dt.getUTCFullYear() * 12 + dt.getUTCMonth()) / n) * n;
  return Date.UTC(Math.floor(mon / 12), mon % 12, 1) / 1000;
}

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

// History for the chart (oldest first), in the shape the TwelveData path returns. Dates are what
// the chart already passes for paging ("YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS", UTC).
// null = not a Vantage symbol / interval, or the backend has nothing: the caller falls back.
export async function fetchVantageCandles(symbol: string, interval: string, endDate?: string, startDate?: string): Promise<Bar[] | null> {
  if (!isVantageSymbol(symbol) || !vantageInterval(interval)) return null;
  let url = `${BACKEND_URL}/api/users/live/candles/?symbol=${encodeURIComponent(norm(symbol))}&interval=${encodeURIComponent(interval)}`;
  if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
  if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data?.bars)) return null;
    // An empty page further back is a real answer (no older history); an empty latest window
    // means the store is empty, so the other feed is better than nothing
    if (!data.bars.length && !endDate && !startDate) return null;
    return data.bars.map((b: number[]) => ({ time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5] }));
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ live ticks

type Tick = { s: string; t: number; o?: number; p: number; a?: number; h: number; l: number; n: number };

// Keyed by the feed's symbol ("XAUUSD"); names = how the app spells it where it's watched
const sockets = new Map<string, { ws: WebSocket | null; closed: boolean; retry: number; names: Set<string>; timer?: ReturnType<typeof setTimeout> }>();
const pending = new Map<string, { t: number; o: number; p: number; h: number; l: number; a?: number; n: number }>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
const FLUSH_MS = 250;   // at most four chart updates a second, however fast the ticks come

function wsUrl(symbol: string): string {
  const base = BACKEND_URL.replace(/^http/, "ws");
  return `${base}/ws/ticks/${encodeURIComponent(symbol)}/`;
}

function flush() {
  flushTimer = undefined;
  pending.forEach((q, feed) => {
    sockets.get(feed)?.names.forEach(symbol => {
      engine.setQuote(symbol, q.p, q.t);
      window.dispatchEvent(new CustomEvent("tv:live-price", {
        detail: { symbol, price: q.p, open: q.o, high: q.h, low: q.l, ticks: q.n, time: q.t, marketOpen: true, source: "vantage", ask: q.a },
      }));
    });
  });
  pending.clear();
}

function onTick(symbol: string, m: Tick) {
  if (!(m.p > 0) || !(m.t > 0)) return;
  const q = pending.get(symbol);
  if (q) {
    q.t = m.t; q.p = m.p; q.a = m.a; q.h = Math.max(q.h, m.h); q.l = Math.min(q.l, m.l); q.n += m.n;
  } else {
    pending.set(symbol, { t: m.t, o: m.o ?? m.p, p: m.p, a: m.a, h: m.h, l: m.l, n: m.n });
  }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

function connect(symbol: string) {
  const entry = sockets.get(symbol);
  if (!entry || entry.closed) return;
  let ws: WebSocket;
  try { ws = new WebSocket(wsUrl(symbol)); } catch { return; }
  entry.ws = ws;
  ws.onopen = () => { entry.retry = 0; };
  ws.onmessage = ev => {
    try {
      const m = JSON.parse(ev.data);
      if (m?.type === "tick") onTick(symbol, m);
    } catch { /* ignore a bad frame */ }
  };
  ws.onclose = () => {
    entry.ws = null;
    if (entry.closed) return;
    // Back off 1 s, 2 s, 4 s … up to 30 s
    const wait = Math.min(30000, 1000 * 2 ** entry.retry++);
    entry.timer = setTimeout(() => connect(symbol), wait);
  };
}

// Keep a live socket open for exactly these symbols (the Vantage ones among them)
export function watchVantageSymbols(symbols: string[]) {
  const want = new Map<string, Set<string>>();
  for (const name of symbols) {
    const s = norm(name);
    if (!VANTAGE_SYMBOLS.has(s)) continue;
    if (!want.has(s)) want.set(s, new Set());
    want.get(s)!.add(name);
  }
  Array.from(sockets.entries()).forEach(([s, e]) => {
    if (want.has(s)) return;
    e.closed = true;
    if (e.timer) clearTimeout(e.timer);
    try { e.ws?.close(); } catch { /* already closed */ }
    sockets.delete(s);
  });
  want.forEach((names, s) => {
    const e = sockets.get(s);
    if (e) { e.names = names; return; }
    sockets.set(s, { ws: null, closed: false, retry: 0, names });
    connect(s);
  });
}
