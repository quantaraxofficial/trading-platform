"use client";

// The mobile terminal's data (/m): live quotes for the symbols the MT5 collector streams, the
// day's change / low / high from their daily bars, and the trading account on the server
// (core/mobile.py: positions, orders and fills live there, priced at the live bid / ask).

import { useSyncExternalStore } from "react";
import { BACKEND_URL, backendFetch } from "@/lib/backend";
import { VANTAGE_SYMBOLS, fetchVantageCandles, watchVantageSymbols } from "../lib/vantageFeed";

// ---------------------------------------------------------------- symbols

export const SYMBOL_NAMES: Record<string, string> = {
  EURUSD: "Euro vs US Dollar", GBPUSD: "Great Britain Pound vs US Dollar", USDJPY: "US Dollar vs Japanese Yen",
  USDCHF: "US Dollar vs Swiss Franc", USDCAD: "US Dollar vs Canadian Dollar", AUDUSD: "Australian Dollar vs US Dollar",
  NZDUSD: "New Zealand Dollar vs US Dollar", EURJPY: "Euro vs Japanese Yen", GBPJPY: "Great Britain Pound vs Japanese Yen",
  EURGBP: "Euro vs Great Britain Pound", AUDJPY: "Australian Dollar vs Japanese Yen", EURAUD: "Euro vs Australian Dollar",
  USDINR: "US Dollar vs Indian Rupee", USDMXN: "US Dollar vs Mexican Peso", XAUUSD: "Gold vs US Dollar", XAGUSD: "Silver vs US Dollar",
};
export const SYMBOLS = Array.from(VANTAGE_SYMBOLS);
export const digitsOf = (s: string) => (s.startsWith("XAU") ? 2 : s.endsWith("JPY") || s.startsWith("XAG") ? 3 : s.endsWith("INR") || s.endsWith("MXN") ? 4 : 5);
export const pointOf = (s: string) => Math.pow(10, -digitsOf(s));
export const contractOf = (s: string) => (s.startsWith("XAU") ? 100 : s.startsWith("XAG") ? 5000 : 100000);
// (the site's symbol for the chart feed: "EUR/USD")
export const feedSymbol = (s: string) => (s.length === 6 ? `${s.slice(0, 3)}/${s.slice(3)}` : s);

// ---------------------------------------------------------------- quotes

export type Quote = { bid: number; ask: number; time: number; dir: 1 | -1 | 0; open?: number; low?: number; high?: number; prevClose?: number };
let quotes: Record<string, Quote> = {};
const qListeners = new Set<() => void>();
const emitQ = () => qListeners.forEach(l => l());
let started = false;

function onLivePrice(e: Event) {
  const d = (e as CustomEvent).detail;
  const s = String(d?.symbol || "").replace("/", "").toUpperCase();
  if (!s || !(d.price > 0)) return;
  const prev = quotes[s];
  const bid = d.price, ask = d.ask > 0 ? d.ask : d.price;
  const low = prev?.low !== undefined ? Math.min(prev.low, bid) : bid;
  const high = prev?.high !== undefined ? Math.max(prev.high, bid) : bid;
  quotes = { ...quotes, [s]: { ...prev, bid, ask, time: d.time || Date.now(), dir: prev ? (bid > prev.bid ? 1 : bid < prev.bid ? -1 : prev.dir) : 0, low, high } };
  emitQ();
}

// Starts the live feed for every symbol, and reads each one's day (open, low, high, previous close)
export function startQuotes() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("tv:live-price", onLivePrice);
  watchVantageSymbols(SYMBOLS.map(feedSymbol));
  SYMBOLS.forEach(async s => {
    const bars = await fetchVantageCandles(feedSymbol(s), "1day").catch(() => null);
    if (!bars?.length) return;
    const today = bars[bars.length - 1], prev = bars[bars.length - 2];
    const q = quotes[s];
    quotes = { ...quotes, [s]: { bid: q?.bid ?? today.close, ask: q?.ask ?? today.close, time: q?.time ?? today.time * 1000, dir: q?.dir ?? 0,
      open: today.open, low: Math.min(today.low, q?.low ?? Infinity), high: Math.max(today.high, q?.high ?? -Infinity), prevClose: prev?.close } };
    emitQ();
  });
}
export function useQuotes(): Record<string, Quote> {
  return useSyncExternalStore(l => { qListeners.add(l); return () => qListeners.delete(l); }, () => quotes, () => quotes);
}
export const getQuote = (s: string) => quotes[s];

// USD for one unit of a currency, from the live quotes
export function usdPer(cur: string): number | null {
  if (cur === "USD") return 1;
  const a = quotes[`${cur}USD`]; if (a) return (a.bid + a.ask) / 2;
  const b = quotes[`USD${cur}`]; if (b) return 2 / (b.bid + b.ask);
  return null;
}

// ---------------------------------------------------------------- the account

export type Position = { id: number; symbol: string; side: "buy" | "sell"; volume: number; open_price: number; price: number | null; sl: number | null; tp: number | null; open_time: number; profit: number; digits: number };
export type Order = { id: number; symbol: string; kind: string; volume: number; price: number; sl: number | null; tp: number | null; time: number; digits: number };
export type Account = { balance: number; equity: number; profit: number; margin: number; free_margin: number; margin_level: number | null; currency: string; leverage: number; positions: Position[]; orders: Order[] };

let account: Account | null = null;
let uidNow: string | null = null;
const aListeners = new Set<() => void>();
const emitA = () => aListeners.forEach(l => l());
const api = (path: string) => `${BACKEND_URL}/api/users/m/${path}`;

export async function refreshAccount(uid: string) {
  uidNow = uid;
  const r = await backendFetch(api(`state/${encodeURIComponent(uid)}/`));
  if (r.ok) { account = await r.json(); emitA(); }
  return r.ok;
}
export function useAccount(): Account | null {
  return useSyncExternalStore(l => { aListeners.add(l); return () => aListeners.delete(l); }, () => account, () => null);
}

// A position's profit now, from the live quote (the server's between its updates)
export function liveProfit(p: Position, q?: Quote): number {
  if (!q) return p.profit;
  const close = p.side === "buy" ? q.bid : q.ask;
  const rate = usdPer(p.symbol.slice(3, 6));
  if (rate === null) return p.profit;
  return (close - p.open_price) * (p.side === "buy" ? 1 : -1) * contractOf(p.symbol) * p.volume * rate;
}
// The account's figures now (equity, free margin and level move with the prices)
export function liveAccount(a: Account, qs: Record<string, Quote>) {
  const profit = a.positions.reduce((t, p) => t + liveProfit(p, qs[p.symbol]), 0);
  const equity = a.balance + profit;
  return { ...a, profit, equity, free_margin: equity - a.margin, margin_level: a.margin > 0 ? (equity / a.margin) * 100 : null };
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  const r = await backendFetch(api(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await r.json().catch(() => ({}));
  if (r.ok && data?.state) { account = data.state; emitA(); }
  return { ok: r.ok, data };
}
const need = () => { if (!uidNow) throw new Error("Not signed in"); return encodeURIComponent(uidNow); };
export const placeOrder = (o: { symbol: string; kind: string; volume: number; price?: number; sl?: number | null; tp?: number | null }) => post(`order/${need()}/`, o);
export const modifyPosition = (id: number, sl: number | null, tp: number | null) => post(`position/${need()}/${id}/modify/`, { sl, tp });
export const closePosition = (id: number) => post(`position/${need()}/${id}/close/`, {});
export const cancelOrder = (id: number) => post(`order/${need()}/${id}/cancel/`, {});
export async function loadHistory(from: number, to: number) {
  const r = await backendFetch(api(`history/${need()}/?from=${Math.floor(from)}&to=${Math.ceil(to)}`));
  return r.ok ? r.json() : null;
}

// ---------------------------------------------------------------- formatting

// MT5's price: the leading digits, the two before the last large, the last one raised
export function splitPrice(v: number, d: number): [string, string, string] {
  const s = v.toFixed(d);
  if (d === 0) return [s.slice(0, -2), s.slice(-2), ""];
  if (d <= 2) return [s.slice(0, -2), s.slice(-2), ""];
  return [s.slice(0, -3), s.slice(-3, -1), s.slice(-1)];
}
// "104 192.00": thousands with a space, as MT5 shows money
export const fmtMoney = (v: number) => {
  const [i, f] = Math.abs(v).toFixed(2).split(".");
  return `${v < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${f}`;
};
export const kindLabel = (k: string) => k.replace("_", " ");
