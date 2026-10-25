// Live prices for paper trading. The data plan has no streaming quotes and
// allows 8 requests a minute (shared with the chart and the watchlist), so
// this polls once a minute, only while the page is visible, and only the
// symbols that matter: the chart's and any symbol with an open position or
// working order (or an active alert), one request every few seconds. Each
// price goes to the engine (fills, P&L), to the chart (live last candle) and
// to the watchlist.
//
// Source priority: the MT5→ClickHouse live endpoint when it's on and has the
// symbol; otherwise the TwelveData quote. Both feed the same "tv:live-price"
// event the chart already listens for, so the live last-candle logic is shared.

import { engine, tradingUi } from "./store";
import { rememberFromQuote } from "../utils/symbolInfo";
import { fetchMt5LivePrice } from "../lib/mt5Live";

const POLL_MS = 60000;
const SPACING_MS = 7000;
const FIRST_POLL_MS = 20000;   // let the chart make its own first requests
const BACKOFF_MS = 3 * 60000;  // after hitting the rate limit

function isForexOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 6) return false;
  if (day === 0 && hour < 22) return false;
  if (day === 5 && hour >= 22) return false;
  return true;
}

// Symbols with an active alert (AlertsContext), so their alerts fire without being on the chart
let alertSymbols: string[] = [];
export function setAlertWatchSymbols(symbols: string[]) { alertSymbols = symbols; }

function symbolsToWatch(): string[] {
  const set = new Set<string>();
  const chart = tradingUi.get().chartSymbol;
  if (chart) set.add(chart);
  const s = engine.getState();
  for (const b of Object.values(s.books)) {
    b.positions.forEach(p => set.add(p.symbol));
    b.orders.forEach(o => { if (o.status === "working") set.add(o.symbol); });
  }
  alertSymbols.forEach(sym => set.add(sym));
  return Array.from(set);
}

export function startQuoteFeed(): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let backoffUntil = 0;

  const sleep = (ms: number) => new Promise<void>(res => { timer = setTimeout(res, ms); });

  const fetchOne = async (symbol: string) => {
    // 1) Try the MT5→ClickHouse live price first. If it returns one, we're
    //    done — no TwelveData rate-limit spend for a symbol we already stream.
    const mt5 = await fetchMt5LivePrice(symbol);
    if (mt5 && isFinite(mt5.price) && mt5.price > 0) {
      const marketOpen = true; // MT5 feed is live; trust it over the calendar heuristic
      engine.setQuote(symbol, mt5.price, mt5.time * 1000);
      rememberFromQuote(symbol, { symbol, close: mt5.price, source: "mt5-clickhouse" }, marketOpen);
      window.dispatchEvent(new CustomEvent("tv:live-price", {
        detail: { symbol, price: mt5.price, time: mt5.time * 1000, marketOpen, raw: { source: "mt5-clickhouse", ts: mt5.time } },
      }));
      return;
    }

    // 2) Fall back to the TwelveData quote (the original path).
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        if (res.status === 429 || /limit|credits/i.test(String(data.error || ""))) backoffUntil = Date.now() + BACKOFF_MS;
        return;
      }
      const price = parseFloat(data.close);
      if (!isFinite(price) || price <= 0) return;
      const marketOpen = data.exchange === "Forex" ? isForexOpen() : !!data.is_market_open;
      engine.setQuote(symbol, price, Date.now());
      rememberFromQuote(symbol, data, marketOpen);
      // The raw quote rides along so the watchlist can show it without fetching it again
      window.dispatchEvent(new CustomEvent("tv:live-price", { detail: { symbol, price, time: Date.now(), marketOpen, raw: data } }));
    } catch { /* offline: try again next round */ }
  };

  const loop = async () => {
    await sleep(FIRST_POLL_MS);
    while (!stopped) {
      if (document.visibilityState === "visible" && Date.now() >= backoffUntil) {
        for (const sym of symbolsToWatch()) {
          if (stopped || Date.now() < backoffUntil) break;
          await fetchOne(sym);
          await sleep(SPACING_MS);
        }
      }
      await sleep(POLL_MS);
    }
  };
  loop();

  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
