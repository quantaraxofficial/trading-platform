"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useEscapeClose } from "../lib/useEscapeClose";

interface SymbolItem {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  icon?: string;
  color?: string;
}

const SYMBOLS: SymbolItem[] = [
  { symbol: "XAU/USD", name: "Gold", type: "commodity cfd", exchange: "OANDA", color: "#f7b500" },
  { symbol: "NQ", name: "E-mini Nasdaq-100 Futures", type: "futures", exchange: "CME", color: "#00a3e0" },
  { symbol: "ES", name: "E-mini S&P 500 Futures", type: "futures", exchange: "CME", color: "#e31d1a" },
  { symbol: "AAPL", name: "Apple Inc.", type: "stock", exchange: "NASDAQ", color: "#000000" },
  { symbol: "TSLA", name: "Tesla, Inc.", type: "stock", exchange: "NASDAQ", color: "#e31d1a" },
  { symbol: "BTC/USD", name: "Bitcoin / U.S. dollar", type: "spot crypto", exchange: "Bitstamp", color: "#f7931a" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF TRUST", type: "fund etf", exchange: "NYSE Arca", color: "#000000" },
  { symbol: "NVDA", name: "NVIDIA Corporation", type: "stock", exchange: "NASDAQ", color: "#76b900" },
  { symbol: "MSFT", name: "Microsoft Corporation", type: "stock", exchange: "NASDAQ", color: "#00a4ef" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", type: "stock", exchange: "NASDAQ", color: "#ff9900" },
  { symbol: "GOOGL", name: "Alphabet Inc.", type: "stock", exchange: "NASDAQ", color: "#4285f4" },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// The provider's instrument types, as the dialog's categories
function categoryOf(type: string): string {
  const t = type.toLowerCase();
  if (/etf|fund|trust/.test(t)) return "Funds";
  if (/stock|share|depositary|reit/.test(t)) return "Stocks";
  if (/future/.test(t)) return "Futures";
  if (/currency|forex|precious metal|commodity/.test(t)) return "Forex";
  if (/digital|crypto/.test(t)) return "Crypto";
  if (/index/.test(t)) return "Indices";
  if (/bond/.test(t)) return "Bonds";
  if (/option/.test(t)) return "Options";
  return "All";
}

const CATEGORIES = ["All", "Stocks", "Funds", "Futures", "Forex", "Crypto", "Indices", "Bonds", "Economy", "Options"];

interface SymbolSearchProps {
  onClose: () => void;
  onSelect: (symbol: string) => void;
  initialSearch?: string;
}

export default function SymbolSearch({ onClose, onSelect, initialSearch = "" }: SymbolSearchProps) {
  useEscapeClose(onClose);
  const [search, setSearch] = useState(initialSearch);
  const [activeCategory, setActiveCategory] = useState("All");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Move cursor to end of initial text
    const len = initialSearch.length;
    if (len > 0) {
      setTimeout(() => inputRef.current?.setSelectionRange(len, len), 0);
    }
  }, []);

  // Matching ignores "/", spaces and case: "xauusd" finds XAU/USD, "eur usd" EUR/USD
  const q = search.trim();
  const nq = norm(q);
  const local = SYMBOLS
    .map(s => ({ s, rank: !nq ? 2 : norm(s.symbol) === nq ? 0 : norm(s.symbol).startsWith(nq) ? 1 : norm(s.symbol).includes(nq) || s.name.toLowerCase().includes(q.toLowerCase()) ? 2 : -1 }))
    .filter(x => x.rank >= 0).sort((a, b) => a.rank - b.rank).map(x => x.s);
  // …plus everything the data provider knows (any symbol), fetched as you type
  const [remote, setRemote] = useState<{ q: string; items: SymbolItem[] }>({ q: "", items: [] });
  const searchRemote = useCallback(async (query: string): Promise<SymbolItem[]> => {
    try {
      const d = await (await fetch(`/api/symbol-search?q=${encodeURIComponent(query)}`)).json();
      const items: SymbolItem[] = (d.data || []).map((h: any) => ({ symbol: h.symbol, name: h.name, type: String(h.type || "").toLowerCase(), exchange: h.exchange }));
      setRemote({ q: query, items });
      return items;
    } catch { return []; }
  }, []);
  useEffect(() => {
    if (!q) { setRemote({ q: "", items: [] }); return; }
    const t = setTimeout(() => { searchRemote(q); }, 250);
    return () => clearTimeout(t);
  }, [q, searchRemote]);
  const merged = [...local, ...(remote.q === q ? remote.items.filter(r => !local.some(l => norm(l.symbol) === norm(r.symbol))) : [])];
  const filteredSymbols = merged.filter(s => activeCategory === "All" || categoryOf(s.type) === activeCategory);

  // ↑ / ↓ move the highlight, Enter opens it — with nothing listed yet, the provider's best match
  const [active, setActive] = useState(0);
  useEffect(() => { setActive(0); }, [q, activeCategory]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  const onKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(filteredSymbols.length - 1, i + 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); return; }
    if (e.key !== "Enter" || !q) return;
    e.preventDefault();
    const pick = filteredSymbols[active] && (active > 0 || norm(filteredSymbols[active].symbol) === nq || remote.q === q) ? filteredSymbols[active] : null;
    if (pick) { onSelect(pick.symbol); return; }
    const exact = merged.find(s => norm(s.symbol) === nq);
    if (exact) { onSelect(exact.symbol); return; }
    const items = await searchRemote(q);
    const best = items.find(s => norm(s.symbol) === nq) || items[0] || filteredSymbols[0];
    onSelect(best ? best.symbol : q.toUpperCase());
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10000,
    }} onClick={onClose}>
      <div
        style={{
          width: "700px", maxHeight: "85vh",
          backgroundColor: "var(--tv-color-pane-bg)", borderRadius: "8px",
          display: "flex", flexDirection: "column",
          overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.24)"
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--tv-color-border)" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "var(--tv-color-text)" }}>Symbol search</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tv-color-text)" }}>
            <X size={24} />
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: "12px 20px" }}>
          <div style={{
            position: "relative", display: "flex", alignItems: "center",
            border: "2px solid var(--tv-color-accent)", borderRadius: "6px",
            backgroundColor: "var(--tv-color-pane-bg)", padding: "0 12px"
          }}>
            <Search size={20} color="var(--tv-color-text-muted)" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Symbol, ISIN, or CUSIP"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Symbol search"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                padding: "12px", fontSize: "16px", color: "var(--tv-color-text)"
              }}
            />
          </div>
        </div>

        {/* Categories */}
        <div style={{
          padding: "0 20px 12px", display: "flex", gap: "8px",
          overflowX: "auto", whiteSpace: "nowrap", scrollbarWidth: "none"
        }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: "6px 16px", borderRadius: "20px", border: "none",
                fontSize: "14px", fontWeight: 600, cursor: "pointer",
                backgroundColor: activeCategory === cat ? "var(--tv-color-text)" : "var(--tv-color-item-hover)",
                color: activeCategory === cat ? "var(--tv-color-pane-bg)" : "var(--tv-color-text)",
                transition: "background-color 0.2s"
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div ref={listRef} role="listbox" aria-label="Symbols" style={{ flex: 1, overflowY: "auto", padding: "0 0 20px" }}>
          {filteredSymbols.length === 0 && q && (
            <div style={{ padding: "24px 20px", textAlign: "center", color: "var(--tv-color-text-muted)", fontSize: 14 }}>
              {remote.q === q ? "No symbols match your criteria" : "Searching…"}
            </div>
          )}
          {filteredSymbols.map((s, i) => (
            <div
              key={s.symbol + s.exchange + i}
              role="option"
              aria-selected={i === active}
              data-index={i}
              onClick={() => onSelect(s.symbol)}
              style={{
                display: "flex", alignItems: "center", padding: "10px 20px",
                cursor: "pointer", transition: "background-color 0.1s",
                borderBottom: "1px solid var(--tv-color-border)",
                backgroundColor: i === active ? "var(--tv-color-item-hover)" : "transparent",
              }}
              onMouseEnter={() => setActive(i)}
            >
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                backgroundColor: s.color || "var(--tv-color-text)", color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "12px", marginRight: "12px",
                flexShrink: 0
              }}>
                {s.symbol.substring(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--tv-color-text)" }}>{s.symbol}</span>
                  <span style={{ fontSize: "14px", color: "var(--tv-color-text)", opacity: 0.8 }}>{s.name}</span>
                </div>
              </div>
              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "12px", color: "var(--tv-color-text-muted)", textTransform: "lowercase" }}>{s.type}</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--tv-color-text)" }}>{s.exchange}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px", textAlign: "center", borderTop: "1px solid var(--tv-color-border)", fontSize: "12px", color: "var(--tv-color-text-muted)" }}>
          Search using ISIN and CUSIP codes
        </div>
      </div>
    </div>
  );
}
