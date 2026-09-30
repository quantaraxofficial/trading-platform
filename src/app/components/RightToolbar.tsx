"use client";

// The right panel: the watchlist above the chart symbol's details, split by a draggable divider
// (the split is remembered), as on TradingView.

import { useRef } from "react";
import Watchlist from "./watchlist/Watchlist";
import SymbolDetails from "./watchlist/SymbolDetails";
import { watchlists, wl, activeList, listSymbols } from "./watchlist/store";
import { useWatchQuotes, useDetailsQuote } from "./watchlist/data";

interface RightToolbarProps {
  symbol?: string;
  onSymbolChange?: (symbol: string) => void;
}

export default function RightToolbar({ symbol = "AAPL", onSymbolChange }: RightToolbarProps) {
  const state = watchlists.useValue();
  const symbols = listSymbols(activeList(state));
  const quotes = useWatchQuotes(symbols, symbol);
  const detailsQuote = useDetailsQuote(symbol, quotes);
  const boxRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => wl.setSplit((ev.clientY - box.top) / box.height);
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <div ref={boxRef} style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      <div style={{ flex: `0 0 ${state.split * 100}%`, minHeight: 0, overflow: "hidden" }}>
        <Watchlist symbol={symbol} onSymbolChange={onSymbolChange} quotes={quotes} />
      </div>
      <div role="separator" aria-orientation="horizontal" aria-label="Resize watchlist and details" onPointerDown={startResize}
        onDoubleClick={() => wl.setSplit(0.5)}
        style={{ flex: "0 0 4px", cursor: "row-resize", background: "var(--tv-color-border)", touchAction: "none" }} />
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <SymbolDetails symbol={symbol} quote={detailsQuote} />
      </div>
    </div>
  );
}
