"use client";

// Other people in the collab, drawn over the main chart: each one's crosshair as a dot with
// their name, and their paper-trading positions and working orders as lines in their colour.

import { useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { useCollab } from "../../lib/collab/session";
import { chartPane, timeToLogical } from "../../lib/collab/chartGeometry";

const CURSOR_TTL = 15000;

function fmt(price: number): string {
  const abs = Math.abs(price);
  return price.toFixed(abs >= 1000 ? 2 : abs >= 10 ? 3 : abs >= 1 ? 4 : 6);
}

export default function CollabOverlay({ symbol }: { symbol: string }) {
  const { status, you, uid, cursors, trades, peers } = useCollab();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const chartRef = useRef<any>(null);
  const live = status === "live";
  const now = Date.now();
  const shownCursors = Object.values(cursors).filter(c => c.id !== you && c.symbol === symbol && c.time != null && c.price != null && now - c.at < CURSOR_TTL);
  const shownTrades = Object.entries(trades).filter(([who, t]) => who !== uid && t.symbol === symbol && t.lines?.length);
  const hasContent = live && (shownCursors.length > 0 || shownTrades.length > 0);

  // Follows the chart's scrolling, zooming and resizing while there's something to show
  useEffect(() => {
    if (!hasContent) return;
    let chart: any = null;
    let raf = 0;
    const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw(); }); };
    const attach = () => {
      const c = (window as any).__chartInstance;
      if (c === chart) return;
      try { chart?.timeScale().unsubscribeVisibleLogicalRangeChange(kick); chart?.unsubscribeCrosshairMove(kick); } catch { /* disposed */ }
      chart = c;
      chartRef.current = c;
      try { chart?.timeScale().subscribeVisibleLogicalRangeChange(kick); chart?.subscribeCrosshairMove(kick); } catch { chart = null; }
      kick();
    };
    attach();
    const poll = setInterval(attach, 1000);
    // Cursors fade out when someone stops moving
    const expiry = setInterval(redraw, 2000);
    window.addEventListener("resize", kick);
    return () => {
      clearInterval(poll);
      clearInterval(expiry);
      window.removeEventListener("resize", kick);
      if (raf) cancelAnimationFrame(raf);
      try { chart?.timeScale().unsubscribeVisibleLogicalRangeChange(kick); chart?.unsubscribeCrosshairMove(kick); } catch { /* disposed */ }
    };
  }, [hasContent]);

  useLayoutEffect(() => { chartRef.current = (window as any).__chartInstance; });

  if (!hasContent) return null;
  const chart = chartRef.current || (window as any).__chartInstance;
  const series = (window as any).__chartSeries;
  const pane = chartPane();
  if (!chart || !series || !pane) return null;
  const paneWidth = pane.width, paneHeight = pane.height;

  const nameOf = (id: string, fallback: string) => peers.find(p => p.id === id)?.name ?? fallback;
  const colorOf = (id: string) => peers.find(p => p.id === id)?.color ?? "#2962ff";

  return (
    <div aria-hidden data-name="collab-overlay" style={{ position: "fixed", left: pane.left, top: pane.top, width: paneWidth, height: paneHeight, pointerEvents: "none", overflow: "hidden", zIndex: 40 }}>
      {shownTrades.map(([who, t]) => t.lines.map((line, i) => {
        let y: number | null = null;
        try { y = series.priceToCoordinate(line.price); } catch { y = null; }
        if (y == null || y < 0 || y > paneHeight) return null;
        const label = `${t.name} · ${line.kind === "position" ? (line.side === "buy" ? "Long" : "Short") : `${line.side === "buy" ? "Buy" : "Sell"} ${line.kind}`} ${line.qty} @ ${fmt(line.price)}`;
        return (
          <div key={`${who}-${i}`} style={{ position: "absolute", left: 0, right: 0, top: y, height: 0, borderTop: `1px ${line.kind === "position" ? "solid" : "dashed"} ${t.color}`, opacity: 0.85 }}>
            <span style={{ position: "absolute", left: 8, top: -10, height: 18, lineHeight: "18px", padding: "0 6px", borderRadius: 4, background: t.color, color: "#fff", fontSize: 11, whiteSpace: "nowrap" }}>{label}</span>
          </div>
        );
      }))}
      {shownCursors.map(c => {
        const logical = timeToLogical(c.time);
        let x: number | null = null, y: number | null = null;
        try {
          x = logical != null ? chart.timeScale().logicalToCoordinate(logical) : null;
          y = series.priceToCoordinate(c.price);
        } catch { x = null; }
        if (x == null || y == null) return null;
        const color = colorOf(c.id);
        // Someone looking at a part of the chart outside this view: pinned to the edge, with an
        // arrow pointing to where they are
        const EDGE = 8;
        const off = x < 0 || x > paneWidth || y < 0 || y > paneHeight;
        const arrow = x < 0 ? "←" : x > paneWidth ? "→" : y < 0 ? "↑" : y > paneHeight ? "↓" : "";
        const cx = Math.min(Math.max(x, EDGE), paneWidth - EDGE), cy = Math.min(Math.max(y, EDGE), paneHeight - EDGE);
        const labelLeft = cx > paneWidth - 140 ? undefined : 8;
        const labelRight = labelLeft === undefined ? 8 : undefined;
        const labelTop = cy > paneHeight - 30 ? -24 : 6;
        return (
          <div key={c.id} style={{ position: "absolute", left: cx, top: cy, transition: "left 60ms linear, top 60ms linear", opacity: off ? 0.8 : 1 }} title={off ? "Looking at another part of the chart" : undefined}>
            {!off && <span style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: "0 0 0 2px var(--tv-color-pane-bg)" }} />}
            <span style={{ position: "absolute", left: labelLeft, right: labelRight, top: labelTop, display: "inline-flex", gap: 4, height: 18, lineHeight: "18px", padding: "0 6px", borderRadius: 4, background: color, color: "#fff", fontSize: 11, whiteSpace: "nowrap" }}>
              {off && <span aria-hidden>{arrow}</span>}
              <span>{nameOf(c.id, "Guest")}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
