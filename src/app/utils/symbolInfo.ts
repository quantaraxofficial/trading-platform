"use client";

// What the chart legend's title needs about a symbol — its description ("Apple Inc", "Gold
// Spot / US Dollar"), exchange and whether its market is open — gathered from responses the
// app already fetches (the chart's bars, the quote feed, the watchlist's quote), so the legend
// adds no requests of its own on the rate-limited data plan.

import { useEffect, useState } from "react";

export type SymbolInfo = {
  description?: string;
  exchange?: string;
  type?: string;
  marketOpen?: boolean;
  marketCheckedAt?: number;
};

const KEY = "tv:symbolInfo:";
const EVENT = "tv:symbol-info";
const mem: Record<string, SymbolInfo> = {};

export function getSymbolInfo(symbol: string): SymbolInfo {
  if (mem[symbol]) return mem[symbol];
  try {
    const raw = localStorage.getItem(KEY + symbol);
    if (raw) return (mem[symbol] = JSON.parse(raw));
  } catch { /* ignore */ }
  return {};
}

export function rememberSymbolInfo(symbol: string, patch: SymbolInfo) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== "")) as SymbolInfo;
  if (Object.keys(clean).length === 0) return;
  const next = { ...getSymbolInfo(symbol), ...clean };
  mem[symbol] = next;
  try { localStorage.setItem(KEY + symbol, JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: symbol }));
}

// From a TwelveData time_series "meta": currencies name forex/crypto pairs, stocks give the exchange
export function rememberFromSeriesMeta(symbol: string, meta: any) {
  if (!meta) return;
  const pair = meta.currency_base && meta.currency_quote ? `${meta.currency_base} / ${meta.currency_quote}` : undefined;
  rememberSymbolInfo(symbol, { description: pair, exchange: meta.exchange, type: meta.type });
}

// From a TwelveData quote
export function rememberFromQuote(symbol: string, quote: any, marketOpen?: boolean) {
  if (!quote) return;
  rememberSymbolInfo(symbol, {
    description: quote.name, exchange: quote.exchange,
    marketOpen: marketOpen ?? (typeof quote.is_market_open === "boolean" ? quote.is_market_open : undefined),
    marketCheckedAt: Date.now(),
  });
}

// Forex and metals trade Sunday 22:00 to Friday 22:00 UTC
export function isForexOpenNow(now = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 6) return false;
  if (day === 0 && hour < 22) return false;
  if (day === 5 && hour >= 22) return false;
  return true;
}

// Open/closed right now: forex by the clock; others from the last quote, if it's recent
export function marketOpenNow(info: SymbolInfo): boolean | undefined {
  if (info.exchange === "Forex" || /currency/i.test(info.type || "")) return isForexOpenNow();
  if (info.marketOpen === undefined || !info.marketCheckedAt) return undefined;
  if (Date.now() - info.marketCheckedAt > 30 * 60 * 1000) return undefined;
  return info.marketOpen;
}

export function useSymbolInfo(symbol: string): SymbolInfo {
  const [info, setInfo] = useState<SymbolInfo>({});
  useEffect(() => {
    setInfo(getSymbolInfo(symbol));
    const onChange = (e: Event) => { if ((e as CustomEvent).detail === symbol) setInfo({ ...getSymbolInfo(symbol) }); };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [symbol]);
  return info;
}
