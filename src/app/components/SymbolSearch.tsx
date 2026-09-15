"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

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

const CATEGORIES = ["All", "Stocks", "Funds", "Futures", "Forex", "Crypto", "Indices", "Bonds", "Economy", "Options"];

interface SymbolSearchProps {
  onClose: () => void;
  onSelect: (symbol: string) => void;
  initialSearch?: string;
}

export default function SymbolSearch({ onClose, onSelect, initialSearch = "" }: SymbolSearchProps) {
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

  const filteredSymbols = SYMBOLS.filter(s => {
    const matchesSearch = s.symbol.toLowerCase().includes(search.toLowerCase()) || 
                         s.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || 
                           (activeCategory === "Stocks" && s.type === "stock") ||
                           (activeCategory === "Crypto" && s.type.includes("crypto")) ||
                           (activeCategory === "Futures" && s.type === "futures");
    return matchesSearch && matchesCategory;
  });

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
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 20px" }}>
          {filteredSymbols.map((s, i) => (
            <div
              key={s.symbol + i}
              onClick={() => onSelect(s.symbol)}
              style={{
                display: "flex", alignItems: "center", padding: "10px 20px",
                cursor: "pointer", transition: "background-color 0.1s",
                borderBottom: "1px solid var(--tv-color-border)"
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
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
