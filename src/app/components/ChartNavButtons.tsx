"use client";

import React, { useEffect, useRef, useState } from "react";
import { Tip } from "@/app/trading/ui";

// TradingView's navigation buttons: with the mouse near the bottom middle of the chart, five
// small dark buttons fade in — Zoom out, Zoom in | Scroll to the left, Scroll to the right |
// Reset chart view. Zoom keeps the right edge where it is; the scroll arrows keep going while held.

const BTN = 24, GAP = 8, GROUP_GAP = 16;

const ICONS = {
  zoomOut: <path fill="currentColor" d="M14 10H4V8.5h10V10Z" />,
  zoomIn: <><path fill="currentColor" d="M8.25 13.75v-9.5h1.5v9.5h-1.5Z" /><path fill="currentColor" d="M13.75 9.75h-9.5v-1.5h9.5v1.5Z" /></>,
  right: <path fill="currentColor" d="M7.83 3.92 12.28 9l-4.45 5.08-1.13-1L10.29 9l-3.6-4.09 1.14-.99Z" />,
  reset: <path fill="currentColor" d="M10 6.38V8L6 5.5 10 3v1.85A5.25 5.25 0 1 1 3.75 10a.75.75 0 0 1 1.5 0A3.75 3.75 0 1 0 10 6.38Z" />,
};

export default function ChartNavButtons({ chart, container, onReset }: { chart: any; container: HTMLElement | null; onReset: () => void }) {
  const [show, setShow] = useState(false);
  const holdRef = useRef<{ timer?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({});

  // Shown while the mouse is in the bottom-middle of the chart pane (or on the buttons themselves)
  useEffect(() => {
    if (!container || !chart) return;
    const onMove = (e: MouseEvent) => {
      const r = container.getBoundingClientRect();
      let paneW = r.width, paneH = r.height;
      try { const s = chart.paneSize(); paneW = s.width; paneH = s.height; } catch { /* not laid out */ }
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const near = x >= 0 && x <= paneW && y <= paneH && y >= paneH - 110 && Math.abs(x - paneW / 2) <= 240;
      setShow(prev => (prev === near ? prev : near));
    };
    const onLeave = () => setShow(false);
    window.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);
    return () => { window.removeEventListener("mousemove", onMove); container.removeEventListener("mouseleave", onLeave); };
  }, [container, chart]);

  const stopHold = () => { clearTimeout(holdRef.current.timer); clearInterval(holdRef.current.interval); };
  useEffect(() => stopHold, []);

  if (!chart) return null;
  let paneW = 0, paneH = 0;
  try { const s = chart.paneSize(); paneW = s.width; paneH = s.height; } catch { return null; }

  const ts = () => chart.timeScale();
  const zoom = (factor: number) => {
    const spacing = ts().options().barSpacing;
    ts().applyOptions({ barSpacing: Math.max(0.5, Math.min(50, spacing * factor)) });
    window.dispatchEvent(new Event("tv-price-scale-changed"));
  };
  // Each step moves the chart by a tenth of what's in view
  const scroll = (dir: -1 | 1) => {
    const r = ts().getVisibleLogicalRange();
    const bars = r ? Math.max(1, Math.round((r.to - r.from) / 10)) : 5;
    ts().scrollToPosition(ts().scrollPosition() + dir * bars, false);
  };
  const holdScroll = (dir: -1 | 1) => {
    stopHold();
    scroll(dir);
    holdRef.current.timer = setTimeout(() => { holdRef.current.interval = setInterval(() => scroll(dir), 60); }, 350);
  };

  const button = (key: string, tip: string, icon: React.ReactNode, props: React.ButtonHTMLAttributes<HTMLButtonElement>, mirror = false) => (
    <Tip key={key} text={tip} placement="top">
      <button type="button" aria-label={tip} {...props}
        style={{
          width: BTN, height: BTN, padding: 0, border: "none", borderRadius: 4, background: "#2e2e2e", color: "#ffffff",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
        <svg viewBox="0 0 18 18" width={18} height={18} style={mirror ? { transform: "scaleX(-1)" } : undefined} aria-hidden>{icon}</svg>
      </button>
    </Tip>
  );

  const total = BTN * 5 + GAP * 2 + GROUP_GAP * 2;
  return (
    <div
      data-chart-nav
      onMouseEnter={() => setShow(true)}
      style={{
        position: "absolute", left: Math.round(paneW / 2 - total / 2), top: paneH - 32 - BTN, zIndex: 12,
        display: "flex", alignItems: "center", opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none",
        transition: "opacity 0.2s",
      }}
    >
      {button("zout", "Zoom out", ICONS.zoomOut, { onClick: () => zoom(1 / 1.25) })}
      <span style={{ width: GAP }} />
      {button("zin", "Zoom in", ICONS.zoomIn, { onClick: () => zoom(1.25) })}
      <span style={{ width: GROUP_GAP }} />
      {button("left", "Scroll to the left", ICONS.right, { onMouseDown: () => holdScroll(-1), onMouseUp: stopHold, onMouseLeave: stopHold }, true)}
      <span style={{ width: GAP }} />
      {button("right", "Scroll to the right", ICONS.right, { onMouseDown: () => holdScroll(1), onMouseUp: stopHold, onMouseLeave: stopHold })}
      <span style={{ width: GROUP_GAP }} />
      {button("reset", "Reset chart view", ICONS.reset, { onClick: onReset })}
    </div>
  );
}
