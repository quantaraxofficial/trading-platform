"use client";

// The right toolbar's Economic calendar panel, as on TradingView: the period (Yesterday … Next
// week), filters for importance and currencies (or just the chart symbol's), and the events of
// each day with their time, flag, importance, and actual / forecast / prior values. Past events
// are dimmed, a line marks now, and the next event counts down. A row opens to its details.
// Times are in the chart's timezone. Data: lib/economicCalendar (backend core/econ_calendar).

import { useEffect, useMemo, useRef, useState } from "react";
import { CurrencyFlag } from "../trading/symbolLogos";
import { useEscapeClose } from "../lib/useEscapeClose";
import {
  CALENDAR_CURRENCIES, CURRENCY_NAMES, IMPACT_COLOR, IMPACT_LABEL, PERIODS, calendarTimezone, fetchEconomicEvents, fmtDayHeading, fmtIn, fmtTime,
  passesFilters, periodRange, resetCalendarFilters, setCalendarFilters, symbolCurrencies, useCalendarFilters,
  type EconEvent, type EconResult, type Impact, type Period,
} from "../lib/economicCalendar";

export function EconomicCalendarIcon({ size = 28 }: { size?: number }) {
  // A calendar page with a small rising bar chart, in the toolbar's 1px line style
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <rect x="5.5" y="7.5" width="17" height="15" rx="1.5" />
      <path d="M5.5 11.5h17M10 5.5v4M18 5.5v4" />
      <path d="M10.5 19.5v-2M14 19.5v-4M17.5 19.5v-5.5" />
    </svg>
  );
}

const PERIOD_KEY = "tv:econCalendarPeriod";
const readPeriod = (): Period => { try { const v = localStorage.getItem(PERIOD_KEY); if (PERIODS.some(p => p.id === v)) return v as Period; } catch { /* unavailable */ } return "today"; };

function ImpactBars({ impact }: { impact: Impact }) {
  const n = impact === "high" ? 3 : impact === "medium" ? 2 : impact === "low" ? 1 : 0;
  const color = IMPACT_COLOR[impact];
  return (
    <span title={IMPACT_LABEL[impact]} aria-label={IMPACT_LABEL[impact]} style={{ display: "inline-flex", alignItems: "flex-end", gap: 1.5, height: 10, flexShrink: 0 }}>
      {impact === "holiday"
        ? <span style={{ fontSize: 10, lineHeight: "10px", color: "var(--tv-color-text-muted)" }}>Holiday</span>
        : [0, 1, 2].map(i => <span key={i} style={{ width: 3, height: 4 + i * 3, borderRadius: 1, background: i < n ? color : "var(--tv-color-border, #e0e3eb)" }} />)}
    </span>
  );
}

export default function EconomicCalendarPanel({ symbol }: { symbol: string }) {
  const [period, setPeriodState] = useState<Period>(() => readPeriod());
  const setPeriod = (p: Period) => { setPeriodState(p); try { localStorage.setItem(PERIOD_KEY, p); } catch { /* unavailable */ } };
  const filters = useCalendarFilters();
  const [tz, setTz] = useState(() => calendarTimezone());
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [data, setData] = useState<EconResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string>("");

  // the clock (past / upcoming, countdown) and the chart's timezone
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() / 1000), 30_000);
    const onTz = () => setTz(calendarTimezone());
    window.addEventListener("tv:timezone-changed", onTz);
    return () => { window.clearInterval(id); window.removeEventListener("tv:timezone-changed", onTz); };
  }, []);

  const [from, to] = useMemo(() => periodRange(period, tz, now), [period, tz, Math.floor(now / 3600)]);  // eslint-disable-line react-hooks/exhaustive-deps
  const load = (force = false) => {
    setLoading(true);
    fetchEconomicEvents(from, to, force)
      .then(r => { setData(r); setError(null); })
      .catch(e => setError(e?.message || "The calendar couldn't be loaded"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); const id = window.setInterval(() => load(true), 10 * 60_000); return () => window.clearInterval(id); }, [from, to]);  // eslint-disable-line react-hooks/exhaustive-deps

  const chartCurrencies = useMemo(() => symbolCurrencies(symbol), [symbol]);
  const events = useMemo(() => (data?.events ?? []).filter(e => e.time >= from && e.time < to && passesFilters(e, filters, chartCurrencies)), [data, from, to, filters, chartCurrencies]);
  const nextId = events.find(e => e.time > now && !e.all_day)?.id ?? null;

  const days = useMemo(() => {
    const out: { key: string; label: string; events: EconEvent[] }[] = [];
    const today = fmtDayHeading(now, tz), tomorrow = fmtDayHeading(now + 86400, tz), yesterday = fmtDayHeading(now - 86400, tz);
    for (const e of events) {
      const key = fmtDayHeading(e.time, tz);
      if (out[out.length - 1]?.key !== key) {
        const rel = key === today ? "Today" : key === tomorrow ? "Tomorrow" : key === yesterday ? "Yesterday" : "";
        out.push({ key, label: rel ? `${rel}, ${key}` : key, events: [] });
      }
      out[out.length - 1].events.push(e);
    }
    return out;
  }, [events, tz, Math.floor(now / 3600)]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Opening a period with events still to come scrolls to the next one
  useEffect(() => {
    const k = `${period}:${from}`;
    if (!nextId || scrolledFor.current === k || !listRef.current) return;
    scrolledFor.current = k;
    const row = listRef.current.querySelector<HTMLElement>(`[data-event="${nextId}"]`);
    if (row) listRef.current.scrollTop = Math.max(0, row.offsetTop - listRef.current.offsetTop - 60);
  }, [nextId, period, from]);

  // Why a period is empty: nothing published that far ahead yet, or before the stored history
  const cov = data?.coverage;
  const empty = !loading && !error && events.length === 0
    ? (cov?.to != null && from > cov.to
      ? "Next week's events aren't published yet. They appear at the end of this week."
      : cov?.from != null && to <= cov.from
        ? `The calendar's history starts ${new Date(cov.from * 1000).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}.`
        : (data?.events.length ?? 0) > 0 ? "No events match the filters." : "No events in this period.")
    : null;

  const filtered = filters.chartOnly || filters.impacts.length < 4 || filters.currencies.length < CALENDAR_CURRENCIES.length;
  const muted = "var(--tv-color-text-muted, #787b86)";
  const text = "var(--tv-color-text, #131722)";
  const border = "var(--tv-color-border, #e0e3eb)";

  return (
    <div data-testid="economic-calendar" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, color: text, fontSize: 13, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 8px" }}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Economic calendar</span>
        <button type="button" className="tv-rt-btn" aria-label="Filters" aria-pressed={showFilters} onClick={() => setShowFilters(v => !v)}
          title="Filters" style={{ width: 28, height: 28, position: "relative", color: filtered ? "#2962ff" : undefined }}>
          <svg viewBox="0 0 18 18" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden><path d="M2.5 4h13l-5 6v4.5l-3-1.5v-3z" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 12px 8px" }}>
        {PERIODS.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}
            style={{
              border: "none", borderRadius: 4, padding: "4px 7px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              background: period === p.id ? "var(--tv-color-text, #131722)" : "var(--tv-color-item-hover, #f0f3fa)",
              color: period === p.id ? "var(--tv-color-pane-bg, #ffffff)" : text,
            }}>{p.label}</button>
        ))}
      </div>

      {showFilters && <FiltersPopover chartCurrencies={chartCurrencies} symbol={symbol} onClose={() => setShowFilters(false)} />}

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: `1px solid ${border}` }}>
        {error && (
          <div style={{ padding: 16, color: muted }}>
            {error}. <button type="button" onClick={() => load(true)} style={{ color: "#2962ff", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Try again</button>
          </div>
        )}
        {loading && !data && <div style={{ padding: 16, color: muted }}>Loading events…</div>}
        {empty && <div style={{ padding: "24px 16px", color: muted, textAlign: "center", lineHeight: 1.5 }}>{empty}</div>}
        {days.map(day => {
          let nowLineShown = false;
          return (
            <div key={day.key}>
              <div style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--tv-color-pane-bg, #ffffff)", padding: "10px 12px 6px", fontSize: 12, fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${border}` }}>
                {day.label}
              </div>
              {day.events.map(e => {
                const past = e.time <= now && !(e.all_day && e.time + 86400 > now);
                const showNow = !nowLineShown && e.id === nextId;
                if (showNow) nowLineShown = true;
                const expanded = open === e.id;
                return (
                  <div key={e.id}>
                    {showNow && (
                      <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", height: 14 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#f23645" }}>NOW</span>
                        <span style={{ flex: 1, height: 1, background: "#f23645" }} />
                      </div>
                    )}
                    <button type="button" data-event={e.id} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : e.id)}
                      className="tv-econ-row"
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: expanded ? "var(--tv-color-item-hover, #f0f3fa)" : "transparent", padding: "8px 12px", cursor: "pointer", color: text, opacity: past ? 0.6 : 1, borderBottom: `1px solid ${border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums", color: muted, fontSize: 12 }}>
                          {e.all_day ? "All day" : e.tentative ? "Tent." : fmtTime(e.time, tz)}
                        </span>
                        <CurrencyFlag code={e.currency} size={18} />
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap", fontWeight: e.impact === "high" ? 600 : 400 }} title={e.title}>{e.title}</span>
                        {e.id === nextId && <span style={{ flexShrink: 0, fontSize: 12, color: "#2962ff", fontWeight: 500 }}>in {fmtIn(e.time - now)}</span>}
                        <ImpactBars impact={e.impact} />
                      </div>
                      {(e.actual || e.forecast || e.previous) && (
                        <div style={{ display: "flex", gap: 12, marginTop: 4, paddingLeft: 52, fontSize: 12, color: muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden" }}>
                          <span>Actual <b style={{ color: text, fontWeight: 500 }}>{e.actual || "—"}</b></span>
                          <span>Forecast <b style={{ color: text, fontWeight: 500 }}>{e.forecast || "—"}</b></span>
                          <span>Prior <b style={{ color: text, fontWeight: 500 }}>{e.previous || "—"}</b></span>
                        </div>
                      )}
                      {expanded && (
                        <div style={{ marginTop: 8, paddingLeft: 52, fontSize: 12, color: muted, lineHeight: 1.6 }}>
                          <div>{CURRENCY_NAMES[e.currency] ?? e.currency} · {e.currency}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><ImpactBars impact={e.impact} /> {IMPACT_LABEL[e.impact]}</div>
                          <div>{new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric", ...(e.all_day ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }) }).format(new Date(e.time * 1000))}{e.tentative ? " (time not confirmed)" : ""}</div>
                          {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} style={{ color: "#2962ff" }}>Event details ↗</a>}
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "6px 12px", fontSize: 11, color: muted, borderTop: `1px solid ${border}` }}>
        Times in {tz.replace(/_/g, " ")} · Source: {data?.source ?? "Forex Factory"}
        {data?.updated ? `, updated ${fmtTime(data.updated, tz)}` : ""}
      </div>
    </div>
  );
}

function FiltersPopover({ chartCurrencies, symbol, onClose }: { chartCurrencies: string[]; symbol: string; onClose: () => void }) {
  const f = useCalendarFilters();
  useEscapeClose(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { const el = e.target as HTMLElement; if (ref.current && !ref.current.contains(el) && !el.closest('[aria-label="Filters"]')) onClose(); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [onClose]);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const row = { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", fontSize: 13 } as const;
  const head = { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--tv-color-text-muted, #787b86)", margin: "8px 0 2px" } as const;
  return (
    <div ref={ref} role="dialog" aria-label="Calendar filters"
      style={{ position: "absolute", top: 46, right: 8, zIndex: 20, width: 240, maxHeight: "70%", overflowY: "auto", padding: "8px 14px 12px", borderRadius: 6, background: "var(--tv-color-pane-bg, #ffffff)", color: "var(--tv-color-text, #131722)", boxShadow: "0 2px 12px rgba(0,0,0,0.25)", border: "1px solid var(--tv-color-border, #e0e3eb)" }}>
      <div style={head}>Importance</div>
      {(["high", "medium", "low", "holiday"] as Impact[]).map(i => (
        <label key={i} style={row}>
          <input type="checkbox" checked={f.impacts.includes(i)} onChange={() => setCalendarFilters({ impacts: toggle(f.impacts, i) })} />
          <ImpactBars impact={i} /> {i === "holiday" ? "Bank holidays" : IMPACT_LABEL[i].replace(" importance", "")}
        </label>
      ))}
      <div style={head}>Currencies</div>
      <label style={row} title={chartCurrencies.length ? chartCurrencies.join(", ") : "The chart's symbol has no currency pair"}>
        <input type="checkbox" checked={f.chartOnly} onChange={() => setCalendarFilters({ chartOnly: !f.chartOnly })} />
        Only {symbol.replace(/^[A-Z]+:/, "")}'s ({chartCurrencies.join(", ") || "none"})
      </label>
      {CALENDAR_CURRENCIES.map(c => (
        <label key={c} style={{ ...row, opacity: f.chartOnly ? 0.45 : 1 }}>
          <input type="checkbox" disabled={f.chartOnly} checked={f.currencies.includes(c)} onChange={() => setCalendarFilters({ currencies: toggle(f.currencies, c) })} />
          <CurrencyFlag code={c} size={16} /> {CURRENCY_NAMES[c]} <span style={{ marginLeft: "auto", color: "var(--tv-color-text-muted, #787b86)", fontSize: 12 }}>{c === "ALL" ? "" : c}</span>
        </label>
      ))}
      <button type="button" onClick={resetCalendarFilters} style={{ marginTop: 8, background: "none", border: "none", color: "#2962ff", cursor: "pointer", padding: 0, fontSize: 13 }}>Reset filters</button>
    </div>
  );
}
