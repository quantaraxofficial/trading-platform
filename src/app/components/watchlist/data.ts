"use client";

// Quotes for the watchlist rows and the details panel, and the daily bars behind the details'
// performance / seasonals / technicals — all from TwelveData, within its free plan (8 requests a
// minute, shared with the chart): rows are fetched one at a time and cached.

import { useEffect, useRef, useState } from "react";
import { rememberFromQuote } from "../../utils/symbolInfo";
import { performance, seasonals, technicalRating, type DailyBar, type SeasonalYear, type TechnicalRating } from "./analytics";
import { feedTimeToUnix } from "../../utils/feedTime";

export interface Quote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  close: number;
  change: number;
  percentChange: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  volume?: number;
  averageVolume?: number;
  week52?: { low: number; high: number };
  lastUpdate?: number;   // unix seconds of the last quote
  isMarketOpen: boolean;
}

// Forex and metals trade Sunday 22:00 to Friday 22:00 UTC, whatever the upstream flag says
// Our own gold (Vantage's, lib/vantageFeed): open by Vantage's hours once our store answers
import { fetchVantageCandles, isVantageSymbol, vantageMarketOpen, vantageServing } from "../../lib/vantageFeed";

function forexOpenNow(): boolean {
  const now = new Date(), day = now.getUTCDay(), hour = now.getUTCHours();
  if (day === 6) return false;
  if (day === 0 && hour < 22) return false;
  if (day === 5 && hour >= 22) return false;
  return true;
}

const num = (v: any) => { const n = parseFloat(v); return isFinite(n) ? n : undefined; };
export function parseQuote(sym: string, d: any): Quote | null {
  const close = num(d?.close);
  if (close === undefined) return null;
  return {
    symbol: d.symbol || sym,
    name: d.name || sym,
    exchange: d.exchange || "",
    currency: d.currency || (sym.includes("/") ? sym.split("/")[1] : "USD"),
    close,
    change: num(d.change) ?? 0,
    percentChange: num(d.percent_change) ?? 0,
    open: num(d.open), high: num(d.high), low: num(d.low), previousClose: num(d.previous_close),
    volume: num(d.volume), averageVolume: num(d.average_volume),
    week52: d.fifty_two_week && num(d.fifty_two_week.low) !== undefined ? { low: num(d.fifty_two_week.low)!, high: num(d.fifty_two_week.high)! } : undefined,
    lastUpdate: num(d.last_quote_at) ?? num(d.timestamp),
    isMarketOpen: isVantageSymbol(sym) && vantageServing(sym) ? vantageMarketOpen(Date.now()) : d.exchange === "Forex" ? forexOpenNow() : !!d.is_market_open,
  };
}

const ROW_KEY = "tv:wlQuote2:";
const TTL = 15 * 60 * 1000;
function cached(sym: string): Quote | null {
  try { const raw = localStorage.getItem(ROW_KEY + sym); if (!raw) return null; const { q, ts } = JSON.parse(raw); return Date.now() - ts > TTL ? null : q; } catch { return null; }
}
function cache(sym: string, q: Quote) { try { localStorage.setItem(ROW_KEY + sym, JSON.stringify({ q, ts: Date.now() })); } catch { /* ignore */ } }

// After the data plan's per-minute limit is hit, row fetches wait a minute
let limitedUntil = 0;
export async function fetchQuote(sym: string): Promise<Quote | null> {
  // Our own gold (Vantage's, the chart's prices): its price, change and day from our own candles; the
  // other feed's quote only for its name and exchange (when it answers)
  // (where the store isn't set up, the other feed's quote as before)
  if (isVantageSymbol(sym)) {
    let meta: any = null;
    if (Date.now() >= limitedUntil) {
      try {
        const d = await (await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`)).json();
        if (!d.error) meta = d;
        else if (/limit|credits/i.test(String(d.error))) limitedUntil = Date.now() + 60000;
      } catch { /* name only */ }
    }
    const q = await vantageQuote(sym, meta);
    if (q) { cache(sym, q); if (meta) rememberFromQuote(sym, meta, q.isMarketOpen); }
    return q;
  }
  try {
    const d = await (await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`)).json();
    if (d.error) { if (/limit|credits/i.test(String(d.error))) limitedUntil = Date.now() + 60000; return null; }
    const q = parseQuote(sym, d);
    if (q) { cache(sym, q); rememberFromQuote(sym, d, q.isMarketOpen); }
    return q;
  } catch { return null; }
}

// A quote from our own candles: the last price, the change from the previous day's close, the day's
// open / high / low and its tick volume, the 52-week range, and when the last price came (the end of
// the last minute with prices)
async function vantageQuote(sym: string, meta: any): Promise<Quote | null> {
  const days = await fetchVantageCandles(sym, "1day");
  if (!days || !days.length) return meta ? parseQuote(sym, meta) : null;
  const day = days[days.length - 1], prev = days.length > 1 ? days[days.length - 2] : null;
  // (the last day's minutes only: a daily bar is labelled with its date at 00:00 UTC)
  const mins = await fetchVantageCandles(sym, "1min", undefined, new Date(day.time * 1000).toISOString().slice(0, 10));
  const lastMin = mins && mins.length ? mins[mins.length - 1] : null;
  const close = lastMin ? lastMin.close : day.close;
  const year = days.slice(-260);
  const base = meta ? parseQuote(sym, meta) : null;
  return {
    symbol: base?.symbol || sym, name: base?.name || sym, exchange: base?.exchange || "", currency: base?.currency || "USD",
    close,
    change: prev ? close - prev.close : 0,
    percentChange: prev && prev.close ? ((close - prev.close) / prev.close) * 100 : 0,
    open: day.open, high: Math.max(day.high, close), low: Math.min(day.low, close), previousClose: prev?.close,
    volume: day.volume, averageVolume: base?.averageVolume,
    week52: { low: Math.min(...year.map(b => b.low)), high: Math.max(...year.map(b => b.high)) },
    lastUpdate: lastMin ? lastMin.time + 60 : base?.lastUpdate,
    isMarketOpen: vantageMarketOpen(Date.now()),
  };
}

// Row quotes, one request at a time (at most 3 a minute), refreshed after 15 minutes. The chart's
// own symbol gets priority.
const SPACING = 20000, START = 10000, RECHECK = 60000;
export function useWatchQuotes(symbols: string[], priority?: string) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const busy = useRef<Set<string>>(new Set());
  const fetchedAt = useRef<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), RECHECK);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    // Anything cached shows at once
    const add: Record<string, Quote> = {};
    symbols.forEach(s => { if (!quotes[s]) { const c = cached(s); if (c) { add[s] = c; fetchedAt.current[s] = Date.now(); } } });
    if (Object.keys(add).length) setQuotes(prev => ({ ...prev, ...add }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join("|")]);
  useEffect(() => {
    const now = Date.now();
    const missing = symbols.filter(s => !busy.current.has(s) && now - (fetchedAt.current[s] || 0) > TTL);
    if (priority) missing.sort((a, b) => (a === priority ? -1 : b === priority ? 1 : 0));
    if (!missing.length) return;
    let cancelled = false;
    const timers = missing.map((s, i) => {
      busy.current.add(s);
      return setTimeout(async () => {
        if (Date.now() < limitedUntil) { busy.current.delete(s); return; }   // retried on the next recheck
        // (the details panel may have fetched it meanwhile)
        const q = cached(s) ?? await fetchQuote(s);
        busy.current.delete(s);
        if (cancelled || !q) return;
        fetchedAt.current[s] = Date.now();
        setQuotes(prev => ({ ...prev, [s]: q }));
      }, START + i * SPACING);
    });
    return () => { cancelled = true; timers.forEach(clearTimeout); missing.forEach(s => busy.current.delete(s)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join("|"), tick]);
  // Quotes the paper-trading feed already fetches (the chart's symbol, open positions) keep the
  // rows current too, and count as this hook's own fetch
  const watched = useRef(symbols);
  watched.current = symbols;
  useEffect(() => {
    const onLive = (e: Event) => {
      const { symbol, price, raw } = (e as CustomEvent).detail || {};
      if (!symbol || typeof price !== "number") return;
      const key = watched.current.find(k => k.replace("/", "").toLowerCase() === String(symbol).replace("/", "").toLowerCase());
      if (!key) return;
      const full = raw ? parseQuote(key, raw) : null;
      if (full) { cache(key, full); fetchedAt.current[key] = Date.now(); }
      setQuotes(prev => {
        if (full) return { ...prev, [key]: full };
        const q = prev[key];
        if (!q) return prev;
        const base = q.previousClose ?? q.close - q.change;
        return { ...prev, [key]: { ...q, close: price, change: price - base, percentChange: base ? ((price - base) / base) * 100 : q.percentChange } };
      });
    };
    window.addEventListener("tv:live-price", onLive);
    return () => window.removeEventListener("tv:live-price", onLive);
  }, []);
  return quotes;
}

// The details panel's quote for the chart symbol
// (a symbol not in the list is fetched on its own, at most once a minute)
export function useDetailsQuote(symbol: string, rows: Record<string, Quote>): Quote | null {
  const [q, setQ] = useState<Quote | null>(null);
  const tried = useRef<Record<string, number>>({});
  const current = useRef(symbol);
  current.current = symbol;
  useEffect(() => {
    const row = Object.entries(rows).find(([k]) => k.replace("/", "").toLowerCase() === symbol.replace("/", "").toLowerCase())?.[1];
    if (row) { setQ(row); return; }
    const c = cached(symbol);
    if (c) { setQ(c); return; }
    setQ(prev => (prev && prev.symbol === symbol ? prev : null));
    if (Date.now() - (tried.current[symbol] || 0) < 60000) return;
    tried.current[symbol] = Date.now();
    fetchQuote(symbol).then(r => { if (r && current.current === symbol) setQ(r); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, rows]);
  // The paper-trading feed polls the chart's symbol each minute: its quotes keep this current
  useEffect(() => {
    const onLive = (e: Event) => {
      const { symbol: s, raw } = (e as CustomEvent).detail || {};
      if (!raw || !s || String(s).replace("/", "").toLowerCase() !== current.current.replace("/", "").toLowerCase()) return;
      const full = parseQuote(current.current, raw);
      if (full) setQ(full);
    };
    window.addEventListener("tv:live-price", onLive);
    return () => window.removeEventListener("tv:live-price", onLive);
  }, []);
  return q;
}

// Daily bars → performance, seasonals and technical rating (computed once, cached 30 minutes)
export type DetailsAnalytics = { perf: { period: string; pct: number }[] | null; seasonals: SeasonalYear[]; rating: TechnicalRating | null; avgVolume30?: number; dayVolume?: number };
const AN_KEY = "tv:wlAnalytics:";
export function useDetailsAnalytics(symbol: string): DetailsAnalytics | null {
  const [a, setA] = useState<DetailsAnalytics | null>(null);
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(AN_KEY + symbol);
      if (raw) { const { v, ts } = JSON.parse(raw); if (Date.now() - ts < 30 * 60 * 1000) { setA(v); return; } }
    } catch { /* ignore */ }
    setA(null);
    (async () => {
      try {
        // Our own gold and forex pairs (Vantage): the same daily bars their chart shows, from our own
        // store; the rest (and these where the store isn't set up) from TwelveData
        const own = isVantageSymbol(symbol) ? await fetchVantageCandles(symbol, "1day") : null;
        let bars: DailyBar[];
        if (own && own.length) {
          bars = own.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
        } else {
          const d = await (await fetch(`/api/stock-data?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=800`)).json();
          if (cancelled || !Array.isArray(d.values)) return;
          bars = d.values.map((x: any) => ({
            time: feedTimeToUnix(x.datetime), open: +x.open, high: +x.high, low: +x.low, close: +x.close,
            volume: x.volume != null ? +x.volume : undefined,
          })).reverse();
        }
        if (cancelled) return;
        const vols = bars.slice(-30).map(b => b.volume).filter((x): x is number => x != null && x > 0);
        const v: DetailsAnalytics = {
          perf: performance(bars), seasonals: seasonals(bars), rating: technicalRating(bars),
          avgVolume30: vols.length === Math.min(30, bars.length) && vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : undefined,
          // the latest session's volume (our gold's: its ticks, as OANDA's on TradingView), for quotes without one
          dayVolume: bars.length && bars[bars.length - 1].volume ? bars[bars.length - 1].volume : undefined,
        };
        // Seasonals are thinned for the cache (one point in three is plenty for the small chart)
        const slim = { ...v, seasonals: v.seasonals.map(y => ({ ...y, points: y.points.filter((_, i, arr) => i % 3 === 0 || i === arr.length - 1) })) };
        try { localStorage.setItem(AN_KEY + symbol, JSON.stringify({ v: slim, ts: Date.now() })); } catch { /* ignore */ }
        setA(v);
      } catch { /* offline / rate limited: the sections wait */ }
    })();
    return () => { cancelled = true; };
  }, [symbol]);
  return a;
}
