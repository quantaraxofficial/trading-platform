"use client";

// The details panel under the watchlist, as on TradingView: the chart symbol's name, exchange and
// type, its price and change, market status and last update time, then the sections chosen in
// the "…" menu — price ranges, notes, key stats, performance, seasonals and technicals.

import React, { useEffect, useRef, useState } from "react";
import { Popover, Tip, SymbolAvatar } from "../../trading/ui";
import { useSymbolInfo } from "../../utils/symbolInfo";
import { watchlists, wl, assetKind, type DetailsSection } from "./store";
import { useDetailsAnalytics, type Quote } from "./data";
import type { SeasonalYear, TechnicalRating } from "./analytics";
import { fmtPrice, fmtVolume, priceDecimals, CheckRow, MenuHeading } from "./Watchlist";

const BULL = "var(--tv-color-bull, #089981)", BEAR = "var(--tv-color-bear, #f23645)";
const SECTIONS: [DetailsSection, string][] = [
  ["priceRanges", "Price ranges"], ["notes", "Notes"], ["keyStats", "Key stats"],
  ["performance", "Performance"], ["seasonals", "Seasonals"], ["technicals", "Technicals"],
];

// "Sep 26, 01:29 GMT+5:30" in the viewer's own time zone
function fmtUpdate(unix: number) {
  const d = new Date(unix * 1000);
  const off = -d.getTimezoneOffset(), h = Math.floor(Math.abs(off) / 60), m = Math.abs(off) % 60;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}, ${time} GMT${off >= 0 ? "+" : "-"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

function typeLine(symbol: string, type?: string) {
  const t = type || "";
  if (/stock|equity|etf|fund/i.test(t)) return /etf/i.test(t) ? "Fund · ETF" : "Stock";
  if (/index/i.test(t)) return "Index";
  return { stock: "Stock", commodity: "Commodity · Spot", forex: "Forex · Spot", crypto: "Crypto · Spot" }[assetKind(symbol)];
}

export default function SymbolDetails({ symbol, quote }: { symbol: string; quote: Quote | null }) {
  const state = watchlists.useValue();
  const shown = state.details;
  const analytics = useDetailsAnalytics(symbol);
  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [focusNote, setFocusNote] = useState(0);

  // "Add note for X" in the watchlist's right-click menu
  useEffect(() => {
    const on = () => setFocusNote(n => n + 1);
    window.addEventListener("tv:edit-note", on);
    return () => window.removeEventListener("tv:edit-note", on);
  }, []);
  useEffect(() => {
    if (!focusNote) return;
    const id = requestAnimationFrame(() => { noteRef.current?.focus(); noteRef.current?.scrollIntoView({ block: "nearest" }); });
    return () => cancelAnimationFrame(id);
  }, [focusNote]);

  // (read after mounting: the server has no stored symbol info, so reading it while rendering
  // made the first client render differ from the server's)
  const info = useSymbolInfo(symbol);
  const name = quote?.name && quote.name !== symbol ? quote.name : info.description || symbol;
  const exchange = quote?.exchange || info.exchange || "";
  const up = (quote?.change ?? 0) >= 0;
  const price = quote ? fmtPrice(symbol, quote.close) : "";
  const decimals = quote ? priceDecimals(symbol, quote.close) : 2;
  const volume = quote?.volume && quote.volume > 0 ? quote.volume : undefined;
  const avgVolume = analytics?.avgVolume30;

  return (
    <div style={{ height: "100%", minHeight: 0, overflowY: "auto", color: "var(--tv-hdr-text)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 6px 0 12px" }}>
        <SymbolAvatar symbol={symbol} size={24} />
        <span style={{ fontSize: 16, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{symbol}</span>
        <Tip text="Add note" placement="bottom">
          <button type="button" className="tv-bb-btn" aria-label="Add note" style={{ width: 32, padding: 0 }}
            onClick={() => { wl.setDetails({ notes: true }); setFocusNote(n => n + 1); }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden><path d="M4.5 17.5l1-4 9-9 3 3-9 9zM13 6l3 3" /></svg>
          </button>
        </Tip>
        <Tip text="More" placement="bottom">
          <button ref={menuBtn} type="button" className={`tv-bb-btn ${menu ? "active" : ""}`} aria-label="Details settings" style={{ width: 32, padding: 0 }} onClick={() => setMenu(o => !o)}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden><circle cx="5.5" cy="11" r="1.4" /><circle cx="11" cy="11" r="1.4" /><circle cx="16.5" cy="11" r="1.4" /></svg>
          </button>
        </Tip>
      </div>
      <Popover anchor={menuBtn.current} open={menu} onClose={() => setMenu(false)} align="right" width={220}>
        <MenuHeading>Sections</MenuHeading>
        {SECTIONS.map(([id, label]) => <CheckRow key={id} label={label} on={shown[id]} onToggle={() => wl.setDetails({ [id]: !shown[id] })} />)}
      </Popover>

      <div style={{ padding: "0 12px 16px" }}>
        {/* Name, exchange and type */}
        <div style={{ fontSize: 14, lineHeight: "20px" }}>{name}{exchange ? <span style={{ color: "var(--tv-legend-args)" }}> · {exchange}</span> : null}</div>
        <div style={{ fontSize: 13, lineHeight: "18px", color: "var(--tv-legend-args)" }}>{typeLine(symbol, info.type)}</div>

        {/* Price */}
        <div data-testid="details-price" style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 28, fontWeight: 600, lineHeight: "34px", fontVariantNumeric: "tabular-nums" }}>
            {quote ? (decimals >= 3 ? <>{price.slice(0, -1)}<sup style={{ fontSize: 16 }}>{price.slice(-1)}</sup></> : price) : "—"}
          </span>
          {quote && <span style={{ fontSize: 13, color: "var(--tv-legend-args)" }}>{quote.currency}</span>}
          {quote && (
            <span style={{ fontSize: 16, color: up ? BULL : BEAR, fontVariantNumeric: "tabular-nums" }}>
              {`${up ? "+" : "−"}${fmtPrice(symbol, Math.abs(quote.change))}`}&nbsp;&nbsp;{`${quote.percentChange >= 0 ? "+" : "−"}${Math.abs(quote.percentChange).toFixed(2)}%`}
            </span>
          )}
        </div>
        {quote && (
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: "18px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: quote.isMarketOpen ? BULL : "var(--tv-legend-args)" }}>
              {quote.isMarketOpen
                ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#089981" }} />
                : <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><circle cx="7" cy="7" r="5.5" /><path d="M4.5 7h5" /></svg>}
              {quote.isMarketOpen ? "Market open" : "Market closed"}
            </span>
            {quote.lastUpdate ? <div style={{ color: "var(--tv-legend-args)", marginTop: 2 }}>Last update at {fmtUpdate(quote.lastUpdate)}</div> : null}
          </div>
        )}

        {shown.priceRanges && quote && (
          <Section title="Price ranges">
            {quote.low != null && quote.high != null && <RangeBar sym={symbol} low={quote.low} high={quote.high} value={quote.close} caption="Day's range" />}
            {quote.week52 && <RangeBar sym={symbol} low={Math.min(quote.week52.low, quote.close)} high={Math.max(quote.week52.high, quote.close)} value={quote.close} caption="52 wk range" />}
          </Section>
        )}

        {shown.notes && <Notes symbol={symbol} inputRef={noteRef} />}

        {shown.keyStats && (volume != null || avgVolume != null) && (
          <Section title="Key stats">
            {volume != null && <Stat label="Volume" value={fmtVolume(volume)} />}
            {avgVolume != null && <Stat label="Average Volume (30D)" value={fmtVolume(avgVolume)} />}
          </Section>
        )}

        {shown.performance && (
          <Section title="Performance">
            {analytics?.perf ? <Performance perf={analytics.perf} /> : <Pending />}
          </Section>
        )}

        {shown.seasonals && (
          <Section title="Seasonals">
            {analytics ? (analytics.seasonals.length ? <Seasonals years={analytics.seasonals} /> : <Empty />) : <Pending />}
          </Section>
        )}

        {shown.technicals && (
          <Section title="Technicals">
            {analytics ? (analytics.rating ? <Gauge rating={analytics.rating} /> : <Empty />) : <Pending />}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} style={{ marginTop: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: "24px", marginBottom: 8 }}>{title}</div>
      {children}
    </section>
  );
}
const Pending = () => <div style={{ height: 40, fontSize: 13, color: "var(--tv-legend-args)" }}>Loading…</div>;
const Empty = () => <div style={{ fontSize: 13, color: "var(--tv-legend-args)" }}>No data</div>;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, lineHeight: "28px" }}>
      <span style={{ color: "var(--tv-legend-args)" }}>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function RangeBar({ sym, low, high, value, caption }: { sym: string; low: number; high: number; value: number; caption: string }) {
  const f = high > low ? Math.max(0, Math.min(1, (value - low) / (high - low))) : 0.5;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
        <span>{fmtPrice(sym, low)}</span><span>{fmtPrice(sym, high)}</span>
      </div>
      <div style={{ position: "relative", height: 4, borderRadius: 2, background: "var(--tv-active-neutral)", margin: "6px 0 4px" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${f * 100}%`, borderRadius: 2, background: "var(--tv-legend-args)" }} />
        <div aria-hidden style={{ position: "absolute", left: `${f * 100}%`, top: 6, marginLeft: -4, width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "5px solid var(--tv-hdr-text)" }} />
      </div>
      <div style={{ fontSize: 11, letterSpacing: "0.4px", textTransform: "uppercase", color: "var(--tv-legend-args)", textAlign: "center", marginTop: 8 }}>{caption}</div>
    </div>
  );
}

function Notes({ symbol, inputRef }: { symbol: string; inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const saved = watchlists.useValue().notes[symbol] || "";
  const [text, setText] = useState(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ symbol, text });
  latest.current = { symbol, text };
  // Another symbol's note, or this one changed elsewhere
  useEffect(() => { setText(saved); }, [symbol, saved]);
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  const save = () => { clearTimeout(timer.current); if (latest.current.text !== saved) wl.setNote(latest.current.symbol, latest.current.text); };
  return (
    <Section title="Notes">
      <textarea ref={inputRef} aria-label={`Note for ${symbol}`} value={text} placeholder="Add note"
        onChange={e => { setText(e.target.value); clearTimeout(timer.current); const v = e.target.value; timer.current = setTimeout(() => wl.setNote(symbol, v), 600); }}
        onBlur={save}
        style={{
          width: "100%", boxSizing: "border-box", minHeight: 64, resize: "vertical", padding: "8px 10px", borderRadius: 6, fontSize: 14, lineHeight: "20px",
          fontFamily: "inherit", color: "inherit", background: "transparent", border: "1px solid var(--tv-color-border)", outline: "none",
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--tv-color-accent)"; }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = "var(--tv-color-border)"; }} />
    </Section>
  );
}

function Performance({ perf }: { perf: { period: string; pct: number }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
      {perf.map(p => {
        const pos = p.pct >= 0;
        const a = 0.08 + Math.min(Math.abs(p.pct) / 25, 1) * 0.22;
        return (
          <div key={p.period} data-perf={p.period} style={{ borderRadius: 6, padding: "8px 4px", textAlign: "center", background: pos ? `rgba(8,153,129,${a})` : `rgba(242,54,69,${a})` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: pos ? BULL : BEAR, fontVariantNumeric: "tabular-nums" }}>{`${pos ? "" : "−"}${Math.abs(p.pct).toFixed(2)}%`}</div>
            <div style={{ fontSize: 12, color: "var(--tv-legend-args)", marginTop: 2 }}>{p.period}</div>
          </div>
        );
      })}
    </div>
  );
}

const YEAR_COLORS = ["#2962ff", "#00c853", "#ff9800"];
function Seasonals({ years }: { years: SeasonalYear[] }) {
  const W = 290, H = 140, padR = 40, padT = 8, padB = 20;
  const all = years.flatMap(y => y.points.map(p => p.pct));
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  const x = (day: number) => (day / 366) * (W - padR);
  const y = (pct: number) => padT + (1 - (pct - lo) / (hi - lo)) * (H - padT - padB);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => (hi - lo) / s <= 4) ?? 1000;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const months = [["Jan", 0], ["Apr", 90], ["Jul", 181], ["Oct", 273]] as const;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Seasonals" style={{ display: "block", overflow: "visible" }}>
        {months.map(([m, d]) => (
          <g key={m}>
            <line x1={x(d)} x2={x(d)} y1={padT} y2={H - padB} stroke="var(--tv-active-neutral)" strokeDasharray="3 3" />
            <text x={x(d) + 2} y={H - 5} fontSize="11" fill="var(--tv-legend-args)">{m}</text>
          </g>
        ))}
        {ticks.map(t => (
          <g key={t}>
            <line x1={0} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--tv-legend-args)" : "var(--tv-active-neutral)"} strokeDasharray={t === 0 ? undefined : "3 3"} strokeWidth={t === 0 ? 0.8 : 1} />
            <text x={W - padR + 6} y={y(t) + 4} fontSize="11" fill="var(--tv-legend-args)">{`${t > 0 ? "+" : t < 0 ? "−" : ""}${Math.abs(t)}%`}</text>
          </g>
        ))}
        {[...years].reverse().map(yr => {
          const i = years.indexOf(yr);
          const d = yr.points.map((p, k) => `${k ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.pct).toFixed(1)}`).join("");
          const last = yr.points[yr.points.length - 1];
          return (
            <g key={yr.year} data-year={yr.year}>
              <path d={d} fill="none" stroke={YEAR_COLORS[i]} strokeWidth={i === 0 ? 2 : 1.2} strokeLinejoin="round" />
              {i === 0 && last && <circle cx={x(last.day)} cy={y(last.pct)} r={3} fill={YEAR_COLORS[0]} />}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 13 }}>
        {years.map((yr, i) => (
          <span key={yr.year} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: YEAR_COLORS[i] }} />{yr.year}
          </span>
        ))}
      </div>
    </div>
  );
}

// TradingView's rating gauge: five equal bands (Strong sell … Strong buy), the needle at the
// summary rating, placed within its band so the needle and the label always agree
const BANDS = [-1, -0.5, -0.1, 0.1, 0.5, 1];
const LABELS = ["Strong sell", "Sell", "Neutral", "Buy", "Strong buy"];
function bandPos(v: number) {
  const c = Math.max(-1, Math.min(1, v));
  for (let i = 0; i < 5; i++) if (c <= BANDS[i + 1] || i === 4) return (i + (c - BANDS[i]) / (BANDS[i + 1] - BANDS[i])) / 5;
  return 0.5;
}
function Gauge({ rating }: { rating: TechnicalRating }) {
  const cx = 145, cy = 112, r = 78;
  const active = LABELS.indexOf(rating.label);
  const tone = (i: number) => (i < 2 ? "#f23645" : i > 2 ? "#2962ff" : "var(--tv-legend-args)");
  const pt = (f: number, rad: number) => { const a = Math.PI * (1 - f); return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)]; };
  const arc = (f0: number, f1: number) => {
    const [x0, y0] = pt(f0, r), [x1, y1] = pt(f1, r);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };
  const f = bandPos(rating.value);
  const [nx, ny] = pt(f, r - 14);
  return (
    <div>
      <svg viewBox="0 0 290 130" width="100%" role="img" aria-label={`Technical rating: ${rating.label}`} style={{ display: "block" }}>
        {LABELS.map((_, i) => (
          <path key={i} d={arc(i / 5 + 0.008, (i + 1) / 5 - 0.008)} fill="none" strokeWidth={6} strokeLinecap="butt"
            stroke={i === active ? tone(i) : "var(--tv-active-neutral)"} />
        ))}
        {LABELS.map((l, i) => {
          const [lx, ly] = pt((i + 0.5) / 5, r + 16);
          const anchor = i < 2 ? "end" : i > 2 ? "start" : "middle";
          return <text key={l} x={lx} y={ly + 4} fontSize="12" textAnchor={anchor} fill={i === active ? tone(i) : "var(--tv-legend-args)"} fontWeight={i === active ? 600 : 400}>{l}</text>;
        })}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--tv-hdr-text)" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill="var(--tv-hdr-text)" />
      </svg>
      <div data-testid="technical-rating" style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: tone(active), marginTop: 2 }}>{rating.label}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 6, fontSize: 12, color: "var(--tv-legend-args)" }}>
        <span>Sell <b style={{ color: "var(--tv-hdr-text)" }}>{rating.counts.sell}</b></span>
        <span>Neutral <b style={{ color: "var(--tv-hdr-text)" }}>{rating.counts.neutral}</b></span>
        <span>Buy <b style={{ color: "var(--tv-hdr-text)" }}>{rating.counts.buy}</b></span>
      </div>
    </div>
  );
}
