"use client";

// News in the symbol details panel, as on TradingView: a card with the latest headline about the
// chart symbol ("News · 5 hours ago", "More events ›"); "More events" opens the News list over the
// chart (time, related symbols, headline, source), and a headline opens the story view (source,
// title, time, related symbols, ‹ › through the stories, a link to the full story on its publisher's
// site). Headlines come from the backend (core/news.py, Google News' public search feed): only the
// headline and a link — the stories stay on their publishers' sites. Escape closes either view.

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BACKEND } from "../../lib/collab/session";
import { SymbolAvatar } from "../../trading/ui";
import { displaySymbol } from "@/app/lib/symbolDisplay";

export interface NewsItem { id: string; title: string; source: string; link: string; source_url: string; at: number | null; related: string[] }

const cache = new Map<string, { at: number; items: NewsItem[] }>();
export function useSymbolNews(symbol: string): NewsItem[] | null {
  const key = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const [items, setItems] = useState<NewsItem[] | null>(() => cache.get(key)?.items ?? null);
  useEffect(() => {
    let gone = false;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) { setItems(hit.items); return; }
    setItems(hit?.items ?? null);
    fetch(`${BACKEND}/api/users/news/?symbol=${encodeURIComponent(key)}`).then(r => r.json()).then(d => {
      const list: NewsItem[] = Array.isArray(d?.items) ? d.items : [];
      cache.set(key, { at: Date.now(), items: list });
      if (!gone) setItems(list);
    }, () => { if (!gone) setItems(hit?.items ?? []); });
    return () => { gone = true; };
  }, [key]);
  return items;
}

export function ago(at: number | null): string {
  if (!at) return "";
  const s = Math.max(0, Date.now() / 1000 - at);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} minute${Math.floor(s / 60) === 1 ? "" : "s"} ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) === 1 ? "" : "s"} ago`;
  const d = Math.floor(s / 86400);
  return d < 7 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fullTime(at: number | null) {
  if (!at) return "";
  const d = new Date(at * 1000);
  const off = -d.getTimezoneOffset(), h = Math.floor(Math.abs(off) / 60), m = Math.abs(off) % 60;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} GMT${off >= 0 ? "+" : "-"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

// Escape closes the top view only (the story over the list: the story)
const open: number[] = [];
let seq = 0;
function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const id = ++seq;
    open.push(id);
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || open[open.length - 1] !== id) return;
      e.stopPropagation();
      ref.current();
    };
    window.addEventListener("keydown", k, true);
    return () => { window.removeEventListener("keydown", k, true); const i = open.indexOf(id); if (i >= 0) open.splice(i, 1); };
  }, []);
}

const muted = "var(--tv-legend-args)";

// ---------------------------------------------------------------- the card in the details panel

export function NewsCard({ symbol }: { symbol: string }) {
  const items = useSymbolNews(symbol);
  const [list, setList] = useState(false);
  const [story, setStory] = useState<number | null>(null);
  if (!items?.length) return null;
  const top = items[0];
  return (
    <>
      <div data-testid="details-news" style={{ marginTop: 14, borderRadius: 8, padding: "10px 12px", background: "rgba(124, 77, 255, 0.14)", border: "1px solid rgba(124, 77, 255, 0.25)" }}>
        <div style={{ fontSize: 12, lineHeight: "16px" }}><b style={{ color: "#a78bfa" }}>News</b><span style={{ color: muted }}> · {ago(top.at)}</span></div>
        <button type="button" onClick={() => setStory(0)} data-testid="details-news-headline"
          style={{ all: "unset", cursor: "pointer", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 4, fontSize: 13, lineHeight: "18px", color: "var(--tv-hdr-text)" }}>
          {top.title}
        </button>
        <button type="button" onClick={() => setList(true)} data-testid="details-news-more"
          style={{ all: "unset", cursor: "pointer", display: "block", marginTop: 6, fontSize: 12, color: muted }}>More events ›</button>
      </div>
      {list && <NewsList symbol={symbol} items={items} onClose={() => setList(false)} onOpen={i => setStory(i)} />}
      {story !== null && <NewsStory items={items} index={story} onIndex={setStory} onClose={() => setStory(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- "More events": the list over the chart

function NewsList({ symbol, items, onClose, onOpen }: { symbol: string; items: NewsItem[]; onClose: () => void; onOpen: (i: number) => void }) {
  useEscape(onClose);
  // (over the chart, as TradingView's: the area left of the watchlist panel)
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const place = () => {
      const chart = document.querySelector("[data-active-chart]") || document.querySelector(".tv-lightweight-charts");
      const r = chart?.getBoundingClientRect();
      setBox(r && r.width > 300 ? { left: r.left, top: r.top, width: r.width, height: r.height } : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);
  if (!box || typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-label={`${displaySymbol(symbol)} news`} data-testid="news-list"
      style={{ position: "fixed", ...box, zIndex: 900, background: "var(--tv-color-pane-bg, #131722)", color: "var(--tv-hdr-text)", display: "flex", flexDirection: "column", borderRight: "1px solid var(--tv-color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 50, padding: "0 16px 0 20px", borderBottom: "1px solid var(--tv-color-border)", flexShrink: 0 }}>
        <SymbolAvatar symbol={symbol} size={20} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>{items.length ? displaySymbol(symbol) : symbol}</span>
        <span style={{ color: muted, fontSize: 15 }}>• News</span>
        <button type="button" aria-label="Close" onClick={onClose} className="tv-bb-btn" style={{ marginLeft: "auto", width: 32, padding: 0 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M4 4l10 10M14 4L4 14" /></svg>
        </button>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {items.map((n, i) => (
          <button type="button" key={n.id} onClick={() => onOpen(i)} data-testid="news-row"
            style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "grid", gridTemplateColumns: "120px 90px 1fr auto", alignItems: "center", gap: 12,
              width: "100%", minHeight: 40, padding: "6px 20px", borderBottom: "1px solid var(--tv-color-border)", fontSize: 14 }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--tv-color-hover, rgba(127,127,127,0.08))")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <span style={{ color: muted, fontSize: 13, whiteSpace: "nowrap" }}>{ago(n.at)}</span>
            <span style={{ display: "flex" }}>{n.related.slice(0, 4).map((s, k) => <span key={s} style={{ marginLeft: k ? -6 : 0 }}><SymbolAvatar symbol={s} size={18} /></span>)}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
            <span style={{ color: muted, fontSize: 13, whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{n.source}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- a story

function NewsStory({ items, index, onIndex, onClose }: { items: NewsItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  useEscape(onClose);
  const n = items[index];
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [index, items.length, onIndex]);
  if (!n || typeof document === "undefined") return null;
  const arrow = (dir: -1 | 1) => {
    const to = index + dir;
    const ok = to >= 0 && to < items.length;
    return (
      <button type="button" aria-label={dir < 0 ? "Previous story" : "Next story"} disabled={!ok} onClick={() => ok && onIndex(to)} className="tv-bb-btn"
        style={{ position: "absolute", top: "50%", [dir < 0 ? "left" : "right"]: 16, width: 40, height: 40, padding: 0, opacity: ok ? 1 : 0.3 }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d={dir < 0 ? "M11 3L5 9l6 6" : "M7 3l6 6-6 6"} /></svg>
      </button>
    );
  };
  return createPortal(
    <div role="dialog" aria-label={n.title} data-testid="news-story"
      style={{ position: "fixed", inset: 0, zIndex: 9500, background: "var(--tv-color-pane-bg, #131722)", color: "var(--tv-hdr-text)", overflowY: "auto" }}>
      <button type="button" aria-label="Close" onClick={onClose} className="tv-bb-btn" style={{ position: "fixed", top: 14, right: 16, width: 36, padding: 0, zIndex: 1 }}>
        <svg width="20" height="20" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M4 4l10 10M14 4L4 14" /></svg>
      </button>
      {arrow(-1)}{arrow(1)}
      <article style={{ maxWidth: 680, margin: "0 auto", padding: "80px 24px 60px" }}>
        <div style={{ fontSize: 13, color: muted, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>News</span><span>/</span><span>{n.source}</span><span>/</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{n.title}</span>
        </div>
        <div style={{ marginTop: 26, fontSize: 18, fontWeight: 700, letterSpacing: 0.3 }}>{n.source}</div>
        <h1 style={{ margin: "14px 0 0", fontSize: 40, lineHeight: 1.15, fontWeight: 700 }}>{n.title}</h1>
        <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: muted }}>{fullTime(n.at)} · {n.source}</span>
          <button type="button" aria-label="Copy link" title={copied ? "Copied" : "Copy link"} className="tv-bb-btn"
            onClick={() => { navigator.clipboard?.writeText(n.link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {}); }}
            style={{ marginLeft: "auto", width: 34, height: 30, padding: 0, border: "1px solid var(--tv-color-border)", borderRadius: 6 }}>
            {copied ? "✓" : <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M7.5 10.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-.9.9M10.5 7.5a3 3 0 00-4.2 0L3.7 10.1a3 3 0 004.2 4.2l.9-.9" /></svg>}
          </button>
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {n.related.map(s => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 6px", borderRadius: 16, background: "var(--tv-color-hover, rgba(127,127,127,0.12))", fontSize: 13 }}>
              <SymbolAvatar symbol={s} size={16} />{displaySymbol(s)}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 34, border: "1px solid var(--tv-color-border)", borderRadius: 10, padding: "26px 24px", textAlign: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Read the full story</div>
          <div style={{ marginTop: 6, fontSize: 14, color: muted }}>It's published by {n.source}: open it on their site.</div>
          <a href={n.link} target="_blank" rel="noopener noreferrer nofollow" data-testid="news-read"
            style={{ display: "inline-block", marginTop: 16, padding: "8px 18px", borderRadius: 8, background: "var(--tv-hdr-text)", color: "var(--tv-color-pane-bg, #131722)", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
            Read on {n.source}</a>
        </div>
        <div style={{ marginTop: 18, fontSize: 12, color: muted, textAlign: "center" }}>{index + 1} of {items.length} · ← → for the previous / next story</div>
      </article>
    </div>,
    document.body,
  );
}
