"use client";

import { useState, useEffect } from "react";
import { Plus, MoreHorizontal, Grid3x3, ExternalLink, X } from "lucide-react";
import SymbolSearch from "./SymbolSearch";

interface RightToolbarProps {
  symbol?: string;
  onSymbolChange?: (symbol: string) => void;
}

interface Quote {
  symbol: string;
  name: string;
  exchange: string;
  close: string;
  change: string;
  percent_change: string;
  is_market_open: boolean;
}

// TwelveData's `is_market_open` reflects whatever real-world clock their own
// server is running on — if this app's system clock is skewed from that (e.g.
// a demo/dev machine set to a different date), the two can disagree about
// something as basic as "is it currently the weekend". Forex/commodity CFDs
// close Fri 22:00 UTC through Sun 22:00 UTC regardless of any upstream flag,
// so recompute it locally against THIS app's own clock for that asset class
// rather than trusting a value that may have been computed against a
// different day entirely. Stocks/crypto still use the upstream flag as-is —
// replicating exact per-exchange holiday calendars is out of scope here.
function resolveIsMarketOpen(exchange: string | undefined, upstreamOpen: boolean): boolean {
  if (exchange !== "Forex") return upstreamOpen;
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getUTCHours();
  if (day === 6) return false; // all day Saturday
  if (day === 0 && hour < 22) return false; // Sunday before 22:00 UTC
  if (day === 5 && hour >= 22) return false; // Friday from 22:00 UTC
  return true;
}

interface PerformanceEntry {
  period: string;
  value: string;
  positive: boolean;
}

const QUOTE_CACHE_PREFIX = "tv:quoteCache:";
const QUOTE_CACHE_TTL_MS = 5 * 60 * 1000;

function loadQuoteCache(symbol: string): { quote: Quote; performance: PerformanceEntry[] } | null {
  try {
    const raw = localStorage.getItem(QUOTE_CACHE_PREFIX + symbol);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > QUOTE_CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function saveQuoteCache(symbol: string, data: { quote: Quote; performance: PerformanceEntry[] }) {
  try {
    localStorage.setItem(QUOTE_CACHE_PREFIX + symbol, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // localStorage unavailable — just skip caching
  }
}

// Computes 1W/1M/3M/6M/YTD/1Y % change from a symbol's daily candles (newest first, TwelveData format)
function computePerformance(dailyValues: { datetime: string; close: string }[], currentPrice: number): PerformanceEntry[] | null {
  if (!dailyValues || dailyValues.length === 0) return null;
  const ascending = [...dailyValues].reverse().map(v => ({ time: new Date(v.datetime).getTime(), close: parseFloat(v.close) }));
  const now = ascending[ascending.length - 1].time;
  const DAY = 86400_000;
  const startOfYear = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);

  const findCloseAtOrBefore = (targetTime: number) => {
    let result = ascending[0].close;
    for (const c of ascending) {
      if (c.time <= targetTime) result = c.close;
      else break;
    }
    return result;
  };

  const periods = [
    { period: "1W", target: now - 7 * DAY },
    { period: "1M", target: now - 30 * DAY },
    { period: "3M", target: now - 91 * DAY },
    { period: "6M", target: now - 182 * DAY },
    { period: "YTD", target: startOfYear },
    { period: "1Y", target: now - 365 * DAY },
  ];

  return periods.map(({ period, target }) => {
    const pastClose = findCloseAtOrBefore(target);
    const pct = pastClose ? ((currentPrice - pastClose) / pastClose) * 100 : 0;
    return { period, value: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, positive: pct >= 0 };
  });
}

const WATCHLIST_EXTRAS_KEY = "tv:watchlistExtras";
const AVATAR_COLORS = ["#8c7ae6", "#2962ff", "#00bcd4", "#e91e63", "#ff9800", "#4caf50", "#f23645", "#9c27b0", "#10b981", "#3b82f6"];

function loadWatchlistExtras(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_EXTRAS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(v => typeof v === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function saveWatchlistExtras(symbols: string[]) {
  try {
    localStorage.setItem(WATCHLIST_EXTRAS_KEY, JSON.stringify(symbols));
  } catch {
    // localStorage unavailable — the added symbols just won't persist across reloads
  }
}

function colorForSymbol(sym: string): string {
  let hash = 0;
  for (let i = 0; i < sym.length; i++) hash = (hash * 31 + sym.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function RightToolbar({ symbol = "AAPL", onSymbolChange }: RightToolbarProps) {
  const watchlist = [
    { symbol: "NIFTY", last: "23,622.90", chg: "+461.30", chgPct: "1.99%", color: "#f59e0b", positive: true, category: "" },
    { symbol: "BANKNIFTY", last: "56,814.80", chg: "+1,638.05", chgPct: "2.97%", color: "#3b82f6", positive: true, category: "" },
    { symbol: "SENSEX", last: "75,527.95", chg: "+1,695.40", chgPct: "2.30%", color: "#ef4444", positive: true, category: "" },
    { symbol: "CNXIT", last: "27,795.75", chg: "-25.25", chgPct: "0.09%", color: "#8b5cf6", positive: false, category: "" },
    { symbol: "SPX", last: "7,431.45", chg: "+37.14", chgPct: "0.50%", color: "#ef4444", positive: true, category: "" },
    { symbol: "RELIA", last: "1,293.00", chg: "+30.00", chgPct: "2.38%", color: "#10b981", positive: true, category: "STOCKS" },
    { symbol: "AXISB", last: "1,356.30", chg: "+39.00", chgPct: "2.96%", color: "#f43f5e", positive: true, category: "" },
    { symbol: "HDFCB", last: "772.45", chg: "+27.85", chgPct: "3.74%", color: "#3b82f6", positive: true, category: "" },
    { symbol: "ICICIB", last: "1,340.80", chg: "+23.80", chgPct: "1.81%", color: "#f97316", positive: true, category: "" },
    { symbol: "BAJFI", last: "918.30", chg: "+47.75", chgPct: "5.49%", color: "#06b6d4", positive: true, category: "" },
  ];

  // Find details for active symbol (used only as a placeholder color/avatar and a last-resort fallback)
  const staticItem = watchlist.find(item => item.symbol.toLowerCase() === symbol.replace('/', '').toLowerCase()) || {
    symbol: symbol,
    last: "—",
    chg: "0.00",
    chgPct: "0.00%",
    color: "#787b86",
    positive: true,
    category: ""
  };

  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [performance, setPerformance] = useState<PerformanceEntry[] | null>(null);

  // User-added watchlist symbols (persisted), plus their live quotes
  const [extraSymbols, setExtraSymbols] = useState<string[]>([]);
  const [extraQuotes, setExtraQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    setExtraSymbols(loadWatchlistExtras());
  }, []);

  // Fetch a live quote for any added symbol we don't already have
  useEffect(() => {
    const missing = extraSymbols.filter(s => !extraQuotes[s]);
    if (missing.length === 0) return;
    missing.forEach(s => {
      fetch(`/api/quote?symbol=${encodeURIComponent(s)}`)
        .then(r => r.json())
        .then(data => {
          if (data.error || !data.close) return;
          setExtraQuotes(prev => ({
            ...prev,
            [s]: {
              symbol: data.symbol || s,
              name: data.name || s,
              exchange: data.exchange || "",
              close: data.close,
              change: data.change,
              percent_change: data.percent_change,
              is_market_open: resolveIsMarketOpen(data.exchange, !!data.is_market_open),
            },
          }));
        })
        .catch(() => {});
    });
  }, [extraSymbols, extraQuotes]);

  const isAlreadyWatched = (sym: string) => {
    const normalized = sym.replace('/', '').toLowerCase();
    return watchlist.some(w => w.symbol.toLowerCase() === normalized) ||
      extraSymbols.some(e => e.replace('/', '').toLowerCase() === normalized);
  };

  const addToWatchlist = (sym: string) => {
    if (isAlreadyWatched(sym)) return;
    setExtraSymbols(prev => {
      const next = [...prev, sym];
      saveWatchlistExtras(next);
      return next;
    });
  };

  // Alt+W dispatches this from the global keyboard handler in page.tsx
  useEffect(() => {
    const handler = (e: Event) => {
      const sym = (e as CustomEvent).detail || symbol;
      addToWatchlist(sym);
    };
    window.addEventListener('tv:add-to-watchlist', handler);
    return () => window.removeEventListener('tv:add-to-watchlist', handler);
  }, [symbol, extraSymbols]);

  const removeFromWatchlist = (sym: string) => {
    setExtraSymbols(prev => {
      const next = prev.filter(s => s !== sym);
      saveWatchlistExtras(next);
      return next;
    });
    setExtraQuotes(prev => {
      const next = { ...prev };
      delete next[sym];
      return next;
    });
  };

  // Fetch live quote + compute real performance whenever the active symbol changes
  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    setPerformance(null);

    const cached = loadQuoteCache(symbol);
    if (cached) {
      // Recompute rather than trust whatever was baked into the cache entry —
      // open/closed can flip (e.g. crossing a weekend boundary) well within
      // this cache's TTL, and older entries may predate this recomputation
      // existing at all.
      setQuote({ ...cached.quote, is_market_open: resolveIsMarketOpen(cached.quote.exchange, cached.quote.is_market_open) });
      setPerformance(cached.performance);
      return;
    }

    (async () => {
      try {
        const [quoteRes, dailyRes] = await Promise.all([
          fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`).then(r => r.json()),
          fetch(`/api/stock-data?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=400`).then(r => r.json()),
        ]);
        if (cancelled) return;
        if (quoteRes.error || !quoteRes.close) return;

        const nextQuote: Quote = {
          symbol: quoteRes.symbol || symbol,
          name: quoteRes.name || symbol,
          exchange: quoteRes.exchange || "",
          close: quoteRes.close,
          change: quoteRes.change,
          percent_change: quoteRes.percent_change,
          is_market_open: resolveIsMarketOpen(quoteRes.exchange, !!quoteRes.is_market_open),
        };
        const nextPerformance = computePerformance(dailyRes.values, parseFloat(quoteRes.close));

        setQuote(nextQuote);
        setPerformance(nextPerformance);
        if (nextPerformance) saveQuoteCache(symbol, { quote: nextQuote, performance: nextPerformance });
      } catch {
        // Network/API failure — the UI below falls back to static placeholders
      }
    })();

    return () => { cancelled = true; };
  }, [symbol]);

  const activeItem = quote
    ? {
        ...staticItem,
        last: parseFloat(quote.close).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        chg: quote.change,
        chgPct: `${Math.abs(parseFloat(quote.percent_change || "0")).toFixed(2)}%`,
        positive: parseFloat(quote.change || "0") >= 0,
      }
    : staticItem;

  // Asset-type classification (Stock / Commodity / Crypto / Index) — TwelveData's quote
  // endpoint doesn't reliably return instrument type, so this stays a symbol-pattern heuristic.
  const getAssetCategory = () => {
    if (symbol.includes("USD") && !symbol.includes("BTC")) return "TradePilot";
    if (symbol.includes("BTC") || symbol.includes("ETH")) return "CRYPTO";
    if (["SPX", "IXIC", "DJI", "VIX", "DXY", "US10Y", "NIFTY", "BANKNIFTY", "SENSEX", "CNXIT"].includes(symbol)) return "INDEX";
    return "NASDAQ";
  };

  // Real exchange name from the live quote when available, else the same heuristic as before
  const displayExchange = quote?.exchange || getAssetCategory();

  const getFullName = () => {
    if (quote?.name) return quote.name;
    const names: Record<string, string> = {
      "AAPL": "Apple Inc.", "GOOGL": "Alphabet Inc.", "MSFT": "Microsoft Corporation",
      "TSLA": "Tesla, Inc.", "AMZN": "Amazon.com, Inc.", "NVDA": "NVIDIA Corporation",
      "XAUUSD": "Gold Spot / U.S. Dollar", "BTCUSD": "Bitcoin / U.S. Dollar",
      "NIFTY": "Nifty 50", "BANKNIFTY": "Bank Nifty", "SENSEX": "S&P BSE Sensex",
      "SPX": "S&P 500 Index",
    };
    return names[symbol] || symbol;
  };

  const performanceData = performance || [
    { period: "1W", value: "—", positive: true },
    { period: "1M", value: "—", positive: true },
    { period: "3M", value: "—", positive: true },
    { period: "6M", value: "—", positive: true },
    { period: "YTD", value: "—", positive: true },
    { period: "1Y", value: "—", positive: true },
  ];

  let lastCategory = "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* Watchlist Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--tv-color-border)" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, letterSpacing: "-0.2px" }}>Watchlist</h3>
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }} onClick={() => setShowSymbolSearch(true)}><Plus size={16} strokeWidth={1.5} /></button>
          <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }}><Grid3x3 size={16} strokeWidth={1.5} /></button>
          <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }}><MoreHorizontal size={16} strokeWidth={1.5} /></button>
        </div>
      </div>

      {/* Column Headers */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr", padding: "6px 12px", fontSize: "11px", color: "var(--tv-color-text-muted)", fontWeight: 400, borderBottom: "1px solid var(--tv-color-border)" }}>
        <div>Symbol</div>
        <div style={{ textAlign: "right" }}>Last</div>
        <div style={{ textAlign: "right" }}>Chg</div>
        <div style={{ textAlign: "right" }}>Chg%</div>
      </div>

      {/* Symbol List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {watchlist.map((item, i) => {
          const showCategory = item.category && item.category !== lastCategory;
          if (item.category) lastCategory = item.category;
          const color = item.positive ? "var(--tv-color-bull)" : "var(--tv-color-bear)";
          
          return (
            <div key={i}>
              {showCategory && (
                <div style={{ padding: "8px 12px 4px", fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", letterSpacing: "0.3px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <ChevronIcon /> {item.category}
                </div>
              )}
              <div 
                onClick={() => onSymbolChange?.(item.symbol)}
                style={{ 
                  display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr", 
                  padding: "5px 12px", fontSize: "12px", cursor: "pointer",
                  alignItems: "center",
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ 
                    width: "18px", height: "18px", borderRadius: "50%", 
                    backgroundColor: item.color, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "8px", fontWeight: 700, color: "white", flexShrink: 0
                  }}>
                    {item.symbol.substring(0, 2)}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: "12px" }}>{item.symbol}</span>
                  <span style={{ 
                    width: "5px", height: "5px", borderRadius: "50%", 
                    backgroundColor: item.positive ? "#089981" : "#787b86",
                    flexShrink: 0
                  }} />
                </div>
                <div style={{ textAlign: "right", fontWeight: 500, fontSize: "12px" }}>{item.last}</div>
                <div style={{ textAlign: "right", color, fontSize: "12px" }}>{item.positive ? "+" : ""}{item.chg}</div>
                <div style={{ 
                  textAlign: "right", color, fontWeight: 500, fontSize: "11px",
                  backgroundColor: item.positive ? "rgba(8,153,129,0.1)" : "rgba(242,54,69,0.1)", 
                  borderRadius: "3px", padding: "1px 4px", marginLeft: "auto", width: "fit-content" 
                }}>
                  {item.positive ? "" : "-"}{item.chgPct}
                </div>
              </div>
            </div>
          );
        })}
        {extraSymbols.map(sym => (
          <WatchlistExtraRow
            key={sym}
            symbol={sym}
            quote={extraQuotes[sym]}
            onSelect={() => onSymbolChange?.(sym)}
            onRemove={() => removeFromWatchlist(sym)}
          />
        ))}
      </div>

      {/* Resizer */}
      <div style={{ height: "3px", cursor: "ns-resize", backgroundColor: "var(--tv-color-border)" }} />

      {/* Details Panel */}
      <div style={{ padding: "12px", height: "auto", minHeight: "240px", display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto" }}>
        {/* Symbol header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ 
              width: "32px", height: "32px", borderRadius: "50%", 
              backgroundColor: activeItem.color || "#f59e0b", 
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, color: "white", fontSize: "11px"
            }}>
              {activeItem.symbol.substring(0, 2)}
            </div>
            <div style={{ fontWeight: 700, fontSize: "16px", letterSpacing: "-0.3px" }}>{activeItem.symbol}</div>
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }}><Grid3x3 size={14} /></button>
            <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }}><ExternalLink size={14} /></button>
            <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }}><MoreHorizontal size={14} /></button>
          </div>
        </div>

        {/* Full name + exchange */}
        <div>
          <div style={{ fontSize: "12px", color: "var(--tv-color-text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
            {getFullName()} <ExternalLink size={10} /> · {displayExchange}
          </div>
          <div style={{ fontSize: "11px", color: "var(--tv-color-text-muted)" }}>
            {getAssetCategory() === "NASDAQ" ? "Stock" : getAssetCategory() === "TradePilot" ? "Commodity · Cfd" : getAssetCategory() === "CRYPTO" ? "Cryptocurrency" : "Index"}
          </div>
        </div>

        {/* Big Price */}
        <div>
          <div style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-1px", lineHeight: 1.1 }}>
            {activeItem.last} <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--tv-color-text-muted)" }}>USD</span>
          </div>
          <div style={{
            fontSize: "13px", fontWeight: 500, marginTop: "2px",
            color: activeItem.positive ? "var(--tv-color-bull)" : "var(--tv-color-bear)"
          }}>
            {activeItem.positive ? "+" : ""}{activeItem.chg} {activeItem.positive ? "+" : "-"}{activeItem.chgPct}
          </div>
          <div style={{ fontSize: "11px", color: "var(--tv-color-text-muted)", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: quote?.is_market_open ? "#089981" : "#787b86", display: "inline-block" }} />
            {quote ? (quote.is_market_open ? "Market open" : "Market closed") : "Market closed"}
          </div>
        </div>

        {/* Performance */}
        <div>
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Performance</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
            {performanceData.map((p, i) => (
              <div key={i} style={{ 
                textAlign: "center", padding: "4px 2px", borderRadius: "4px",
                backgroundColor: p.positive ? "rgba(8,153,129,0.1)" : "rgba(242,54,69,0.1)",
              }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: p.positive ? "var(--tv-color-bull)" : "var(--tv-color-bear)" }}>
                  {p.value}
                </div>
                <div style={{ fontSize: "10px", color: "var(--tv-color-text-muted)" }}>{p.period}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showSymbolSearch && (
        <SymbolSearch
          onClose={() => setShowSymbolSearch(false)}
          onSelect={(s) => {
            addToWatchlist(s);
            onSymbolChange?.(s);
            setShowSymbolSearch(false);
          }}
        />
      )}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 3l5 5-5 5" stroke="currentColor" fill="none" strokeWidth="2" />
    </svg>
  );
}

function WatchlistExtraRow({ symbol, quote, onSelect, onRemove }: { symbol: string; quote?: Quote; onSelect: () => void; onRemove: () => void }) {
  const [hover, setHover] = useState(false);
  const positive = quote ? parseFloat(quote.change || "0") >= 0 : true;
  const color = positive ? "var(--tv-color-bull)" : "var(--tv-color-bear)";
  const last = quote ? parseFloat(quote.close).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "…";
  const chg = quote ? quote.change : "0.00";
  const chgPct = quote ? `${Math.abs(parseFloat(quote.percent_change || "0")).toFixed(2)}%` : "0.00%";

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr",
        padding: "5px 12px", fontSize: "12px", cursor: "pointer",
        alignItems: "center",
        backgroundColor: hover ? "var(--tv-color-item-hover)" : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <div style={{
          width: "18px", height: "18px", borderRadius: "50%",
          backgroundColor: colorForSymbol(symbol), display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "8px", fontWeight: 700, color: "white", flexShrink: 0
        }}>
          {symbol.substring(0, 2)}
        </div>
        <span style={{ fontWeight: 600, fontSize: "12px" }}>{symbol}</span>
        <span style={{
          width: "5px", height: "5px", borderRadius: "50%",
          backgroundColor: positive ? "#089981" : "#787b86",
          flexShrink: 0
        }} />
      </div>
      <div style={{ textAlign: "right", fontWeight: 500, fontSize: "12px" }}>{last}</div>
      <div style={{ textAlign: "right", color, fontSize: "12px" }}>{chg}</div>
      <div style={{
        textAlign: "right", color, fontWeight: 500, fontSize: "11px",
        backgroundColor: positive ? "rgba(8,153,129,0.1)" : "rgba(242,54,69,0.1)",
        borderRadius: "3px", padding: "1px 4px", marginLeft: "auto", width: "fit-content"
      }}>
        {chgPct}
      </div>
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            position: "absolute", right: "4px", top: "50%", transform: "translateY(-50%)",
            background: "var(--tv-color-item-hover)", border: "none", cursor: "pointer", padding: "2px",
            color: "var(--tv-color-text-muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          title="Remove from watchlist"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
