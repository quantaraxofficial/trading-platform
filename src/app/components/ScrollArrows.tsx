"use client";

// Arrows on a toolbar that's taller than the window (the drawing toolbar, the right icon bar): a
// ˄ at the top when tools are hidden above, a ˅ at the bottom when they're hidden below, as
// TradingView shows them. Clicking one scrolls the toolbar; the wheel and swipes still work.
// Put it as the first child of the scrolling element: the arrows stick to its edges.

import React, { useEffect, useRef, useState } from "react";

export default function ScrollArrows() {
  const top = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ up: false, down: false });

  useEffect(() => {
    const box = top.current?.parentElement;
    if (!box) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const up = box.scrollTop > 2, down = box.scrollTop + box.clientHeight < box.scrollHeight - 2;
        setEdges(e => (e.up === up && e.down === down ? e : { up, down }));
      });
    };
    check();
    box.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(box);
    Array.from(box.children).forEach(c => ro.observe(c));
    return () => { cancelAnimationFrame(frame); box.removeEventListener("scroll", check); ro.disconnect(); };
  }, []);

  const scroll = (dir: 1 | -1) => {
    const box = top.current?.parentElement;
    box?.scrollBy({ top: dir * Math.max(80, box.clientHeight * 0.6), behavior: "smooth" });
  };
  const arrow = (dir: 1 | -1): React.CSSProperties => ({
    position: "sticky", [dir < 0 ? "top" : "bottom"]: 0, zIndex: 2, width: "100%", height: 22, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", border: "none", padding: 0, cursor: "pointer",
    color: "var(--tv-hdr-text)", background: "var(--tv-color-bg)",
    boxShadow: dir < 0 ? "0 4px 6px -4px rgba(0,0,0,0.25)" : "0 -4px 6px -4px rgba(0,0,0,0.25)",
  });
  const chevron = (d: string) => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d={d} /></svg>;

  return (
    <>
      <div ref={top} style={{ display: "contents" }} />
      {edges.up && <button type="button" aria-label="Scroll up" onClick={() => scroll(-1)} style={{ ...arrow(-1), marginBottom: -22 }}>{chevron("M5 11l4-4 4 4")}</button>}
      {edges.down && <button type="button" aria-label="Scroll down" onClick={() => scroll(1)} style={{ ...arrow(1), order: 9999, marginTop: "auto" }}>{chevron("M5 7l4 4 4-4")}</button>}
    </>
  );
}
