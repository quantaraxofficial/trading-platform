"use client";

// The Calendar window, as TradingView's (right toolbar → Calendars): over the right of the window
// (or a split view beside the whole layout, like the Pine Editor), resizable from its left edge.
//   - toolbar: Today, a week picker, the previous / next week, the week ("Nov 9 — 15"); calendar
//     settings (countries, timezone) and Collapse header
//   - the week's days as cards with their event counts; clicking one scrolls to it, the one at the
//     top of the list is highlighted, today's date is underlined
//   - Economic; the High importance toggle and the categories menu
//   - the week's events as one table under a sticky day header (Actual / Forecast / Prior): time
//     (once per time), flag (once per country within a time), importance, name, values. The next
//     events have a red time and "Coming in mm:ss" (within the hour) or "Coming soon"; a red line
//     marks now; past values are filled with "—" and the actual is bold. A "Coming soon" button
//     scrolls back to the next events when they're out of view.
// Data: lib/economicCalendar (backend core/econ_calendar, Forex Factory's weekly feed).

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CurrencyFlag } from "../trading/symbolLogos";
import { useEscapeClose } from "../lib/useEscapeClose";
import * as Ic from "./pine/pineIcons";
import {
  CALENDAR_CURRENCIES, CATEGORY_MENU, CURRENCY_NAMES, IMPACT_LABEL, calendarDock, calendarSettings, categoryOf, clampCalendarWidth,
  dayParts, defaultCalendarWidth, fetchEconomicEvents, fmtTime, resolveTimezone, utcOffsetLabel, weekDays,
  type CalendarTimezone, type EconEvent, type EconResult, type Impact,
} from "../lib/economicCalendar";

const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
function palette(dark: boolean) {
  return dark ? {
    bg: "#0f0f0f", text: "#dbdbdb", muted: "#8c8c8c", border: "#3d3d3d", line: "#2e2e2e", card: "#2e2e2e", sep: "#1a1a1a",
    hover: "#2e2e2e", pillOn: "#ffffff", pillOnText: "#000000", blue: "#3179f5", red: "#f23645", barOff: "#4a4a4a",
    menu: "#1f1f1f", shadow: "0 2px 12px rgba(0,0,0,.6)", grip: "#4a4a4a",
  } : {
    bg: "#ffffff", text: "#000000", muted: "#707070", border: "#ebebeb", line: "#f2f2f2", card: "#f2f2f2", sep: "#f9f9f9",
    hover: "#f2f2f2", pillOn: "#222222", pillOnText: "#ffffff", blue: "#2962ff", red: "#f23645", barOff: "#dbdbdb",
    menu: "#ffffff", shadow: "0 2px 12px rgba(0,0,0,.18)", grip: "#9c9c9c",
  };
}
type Pal = ReturnType<typeof palette>;

// --- small pieces
function Tip({ text, children }: { text: string; children: React.ReactElement<any> }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      {React.cloneElement(children, {
        onMouseEnter: (e: React.MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); clearTimeout(timer.current); timer.current = setTimeout(() => setPos({ x: r.left + r.width / 2, y: r.bottom + 6 }), 500); },
        onMouseLeave: () => { clearTimeout(timer.current); setPos(null); },
        onMouseDown: () => { clearTimeout(timer.current); setPos(null); },
      })}
      {pos && createPortal(
        <div role="tooltip" style={{ position: "fixed", left: pos.x, top: pos.y, transform: "translateX(-50%)", zIndex: 3300, pointerEvents: "none", height: 24, lineHeight: "24px", padding: "0 8px", borderRadius: 2, background: "#2e2e2e", color: "#f2f2f2", fontSize: 13, whiteSpace: "nowrap", fontFamily: FONT }}>{text}</div>,
        document.body)}
    </>
  );
}

function ImportanceIcon({ impact, p }: { impact: Impact; p: Pal }) {
  const n = impact === "high" ? 3 : impact === "medium" ? 2 : 1;
  const c = (i: number) => (i < n ? p.blue : p.barOff);
  return (
    <span role="img" title={impact === "holiday" ? "Bank holiday" : IMPACT_LABEL[impact]} style={{ display: "inline-flex", width: 18, height: 18 }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden>
        <rect x="3" y="9" width="3" height="6" rx="1" fill={c(0)} />
        <rect x="7" y="6" width="3" height="9" rx="1" fill={c(1)} />
        <rect x="11" y="3" width="3" height="12" rx="1" fill={c(2)} />
      </svg>
    </span>
  );
}

const I = (d: React.ReactNode) => (props: React.SVGProps<SVGSVGElement>) =>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={28} height={28} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props} style={{ flexShrink: 0, ...props.style }}>{d}</svg>;
const CalendarPickIcon = I(<><rect x="6.5" y="7.5" width="15" height="14" rx="2" /><path d="M6.5 11.5h15M10.5 5.5v3M17.5 5.5v3" /></>);
const ChevronLeft = I(<path d="M16.5 8.5 11 14l5.5 5.5" />);
const ChevronRight = I(<path d="M11.5 8.5 17 14l-5.5 5.5" />);
const ChevronUp = I(<path d="M8.5 16.5 14 11l5.5 5.5" />);
const SettingsIcon = I(<><path d="M14 5.5 21.4 9.75v8.5L14 22.5l-7.4-4.25v-8.5z" /><circle cx="14" cy="14" r="3" /></>);
const StatsIcon = I(<><rect x="7.5" y="14.5" width="3" height="6" rx="1" /><rect x="12.5" y="10.5" width="3" height="10" rx="1" /><rect x="17.5" y="6.5" width="3" height="14" rx="1" /></>);
const StatsIconOn = I(<><rect x="7" y="14" width="4" height="7" rx="1" fill="currentColor" stroke="none" /><rect x="12" y="10" width="4" height="11" rx="1" fill="currentColor" stroke="none" /><rect x="17" y="6" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>);
const ListIcon = I(<><path d="M11.5 9.5h10M11.5 14h10M11.5 18.5h10" /><circle cx="7.5" cy="9.5" r=".9" fill="currentColor" /><circle cx="7.5" cy="14" r=".9" fill="currentColor" /><circle cx="7.5" cy="18.5" r=".9" fill="currentColor" /></>);
const Caret = ({ up }: { up?: boolean }) => <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? "rotate(180deg)" : undefined }} aria-hidden><path d="m5.5 7.5 3.5 3.5 3.5-3.5" /></svg>;
const GlobeIcon = I(<><circle cx="14" cy="14" r="7.5" /><path d="M6.5 14h15M14 6.5c2.2 2.1 3.2 4.6 3.2 7.5s-1 5.4-3.2 7.5c-2.2-2.1-3.2-4.6-3.2-7.5s1-5.4 3.2-7.5z" /></>);
const ClockIcon = I(<><circle cx="14" cy="14" r="7.5" /><path d="M14 9.5V14l3 2" /></>);
const ArrowDown = ({ up }: { up?: boolean }) => <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? "rotate(180deg)" : undefined }} aria-hidden><path d="M9 3.5v11M4.5 10 9 14.5 13.5 10" /></svg>;

const fmtMonthDay = (t: number, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(t * 1000));
const fmtWeekTitle = (from: number, to: number, tz: string) => {
  const a = dayParts(from, tz), b = dayParts(to - 1, tz);
  return a.m === b.m ? `${fmtMonthDay(from, tz)} — ${b.d}` : `${fmtMonthDay(from, tz)} — ${fmtMonthDay(to - 1, tz)}`;
};
const fmtDayLong = (t: number, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(t * 1000));
const fmtCard = (t: number, tz: string) => { const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(t * 1000)); return `${s} ${dayParts(t, tz).d}`; };
const fmtFull = (t: number, tz: string) => `${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t * 1000))} ${utcOffsetLabel(tz, t * 1000).replace("UTC", "GMT")}`;
const mmss = (s: number) => { const v = Math.max(0, Math.floor(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };
// "−3.1%" for "-3.1%": TradingView's minus sign
const showValue = (v: string) => v.replace(/^-/, "−");

// A popup under a button: closes on Escape and on a click outside it
function Popover({ anchor, onClose, children, p, align = "left", width }: { anchor: DOMRect; onClose: () => void; children: React.ReactNode; p: Pal; align?: "left" | "right"; width?: number }) {
  useEscapeClose(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const id = window.setTimeout(() => document.addEventListener("mousedown", down), 0);
    return () => { window.clearTimeout(id); document.removeEventListener("mousedown", down); };
  }, [onClose]);
  const style: React.CSSProperties = {
    position: "fixed", top: anchor.bottom + 4, zIndex: 3200, width, maxHeight: `calc(100vh - ${anchor.bottom + 16}px)`, overflowY: "auto",
    background: p.menu, color: p.text, borderRadius: 6, boxShadow: p.shadow, fontFamily: FONT, padding: "6px 0",
    ...(align === "right" ? { right: window.innerWidth - anchor.right } : { left: anchor.left }),
  };
  return createPortal(<div ref={ref} role="menu" style={style}>{children}</div>, document.body);
}

type Row = { e: EconEvent; showTime: boolean; showFlag: boolean; next: boolean; nowLine: boolean };
type DayBlock = { start: number; end: number; rows: Row[] };
type MenuName = "categories" | "settings" | "week" | "countries" | "timezone";

export default function EconomicCalendarPanel({ theme, onClose }: { theme: "light" | "dark"; onClose: () => void }) {
  const dark = theme === "dark";
  const p = palette(dark);
  const dock = calendarDock.useValue();
  const settings = calendarSettings.useValue();
  const [chartTzTick, setChartTzTick] = useState(0);
  const tz = useMemo(() => resolveTimezone(settings.timezone), [settings.timezone, chartTzTick]);  // eslint-disable-line react-hooks/exhaustive-deps
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [weekOf, setWeekOf] = useState(() => Date.now() / 1000);
  const days = useMemo(() => weekDays(weekOf, tz), [weekOf, tz]);
  const from = days[0], to = days[7];
  const [data, setData] = useState<EconResult | null>(null);
  const [dataFor, setDataFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<null | { which: MenuName; rect: DOMRect }>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const listRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const [topDay, setTopDay] = useState(0);
  const [jump, setJump] = useState<null | "up" | "down">(null);
  const scrolledFor = useRef("");

  useEscapeClose(onClose, !menu && !dock.collapsed);

  // the clock: every second while an event is within the hour (its countdown), else every 30 s
  const soon = useMemo(() => (data?.events ?? []).some(e => e.time > now && e.time - now < 3600), [data, now]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now() / 1000), soon ? 1000 : 30_000); return () => window.clearInterval(id); }, [soon]);
  useEffect(() => {
    const on = () => setChartTzTick(t => t + 1);
    window.addEventListener("tv:timezone-changed", on);
    return () => window.removeEventListener("tv:timezone-changed", on);
  }, []);

  const load = useCallback((force = false) => {
    setLoading(true);
    fetchEconomicEvents(from, to, force)
      .then(r => { setData(r); setDataFor(`${from}:${to}`); setError(null); })
      .catch(e => setError(e?.message || "The calendar couldn't be loaded"))
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(() => { load(); const id = window.setInterval(() => load(true), 10 * 60_000); return () => window.clearInterval(id); }, [load]);

  // The week's events (after the filters), by day, with what TradingView shows on each row
  const events = useMemo(() => (data?.events ?? []).filter(e =>
    e.time >= from && e.time < to && settings.countries.includes(e.currency) && (!settings.highOnly || e.impact === "high")
    && (settings.category === "all" || categoryOf(e) === settings.category)), [data, from, to, settings]);
  const counts = useMemo(() => days.slice(0, 7).map((d, i) => (data?.events ?? []).filter(e => e.time >= d && e.time < days[i + 1] && settings.countries.includes(e.currency)).length), [data, days, settings.countries]);
  const nextTime = useMemo(() => events.find(e => e.time > now && !e.all_day)?.time ?? null, [events, now]);
  const blocks: DayBlock[] = useMemo(() => {
    let nowLineDone = false;
    return days.slice(0, 7).map((d, i) => {
      const list = events.filter(e => e.time >= d && e.time < days[i + 1]);
      const rows: Row[] = list.map((e, j) => {
        const prev = list[j - 1];
        const showTime = !prev || prev.time !== e.time || prev.all_day !== e.all_day;
        const showFlag = showTime || prev.currency !== e.currency;
        const upcoming = e.time > now && !e.all_day;
        const nowLine = upcoming && !nowLineDone && j > 0;
        if (upcoming) nowLineDone = true;
        return { e, showTime, showFlag, next: e.time === nextTime, nowLine };
      });
      return { start: d, end: days[i + 1], rows };
    });
  }, [events, days, now, nextTime]);
  const anyRows = blocks.some(b => b.rows.length);

  // The day at the top of the list (the sticky header's, and the highlighted card), and whether the
  // next events are out of view (the "Coming soon" button)
  const onScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const top = list.scrollTop + 41;
    const seps = Array.from(list.querySelectorAll<HTMLElement>("[data-day]"));
    let idx = seps.length ? Number(seps[0].dataset.day) : 0;
    seps.forEach(el => { if (el.offsetTop <= top) idx = Number(el.dataset.day); });
    setTopDay(idx);
    const next = list.querySelector<HTMLElement>("[data-next='1']");
    if (!next) { setJump(null); return; }
    const y = next.offsetTop - list.scrollTop;
    setJump(y < 40 ? "up" : y > list.clientHeight - 41 ? "down" : null);
  }, []);
  const scrollToNext = useCallback((smooth: boolean) => {
    const list = listRef.current;
    if (!list) return;
    const next = list.querySelector<HTMLElement>("[data-next='1']");
    if (next) { list.scrollTo({ top: Math.max(0, next.offsetTop - 40 - 41 * 2), behavior: smooth ? "smooth" : "auto" }); return; }
    const todayIdx = days.findIndex((d, i) => i < 7 && now >= d && now < days[i + 1]);
    const el = todayIdx >= 0 ? list.querySelector<HTMLElement>(`[data-day="${todayIdx}"]`) : null;
    list.scrollTo({ top: el ? el.offsetTop : 0, behavior: smooth ? "smooth" : "auto" });
  }, [days, now]);
  const scrollToDay = (i: number) => {
    const list = listRef.current, el = list?.querySelector<HTMLElement>(`[data-day="${i}"]`);
    if (list && el) list.scrollTo({ top: el.offsetTop, behavior: "smooth" });
  };
  // A newly loaded week opens at its next events (this week) or its start
  useLayoutEffect(() => {
    if (!data || dataFor !== `${from}:${to}`) return;
    const key = `${from}:${settings.highOnly}:${settings.category}:${settings.countries.length}`;
    if (scrolledFor.current !== key) {
      scrolledFor.current = key;
      if (now >= from && now < to) scrollToNext(false); else listRef.current?.scrollTo({ top: 0 });
    }
    onScroll();
  }, [data, dataFor, from, to, settings, blocks]);  // eslint-disable-line react-hooks/exhaustive-deps

  // the film strip keeps the highlighted card in view, and shows arrows where it's cut off
  const [filmEdges, setFilmEdges] = useState({ left: false, right: false });
  const onFilmScroll = useCallback(() => {
    const s = filmRef.current;
    if (s) setFilmEdges({ left: s.scrollLeft > 2, right: s.scrollLeft + s.clientWidth < s.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const strip = filmRef.current, card = strip?.querySelector<HTMLElement>(`[data-card="${topDay}"]`);
    if (!strip || !card) return;
    if (card.offsetLeft < strip.scrollLeft) strip.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
    else if (card.offsetLeft + card.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: card.offsetLeft + card.offsetWidth - strip.clientWidth, behavior: "smooth" });
  }, [topDay]);
  useEffect(() => {
    onFilmScroll();
    const s = filmRef.current;
    if (!s || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(onFilmScroll); ro.observe(s);
    return () => ro.disconnect();
  }, [onFilmScroll, dock.headerCollapsed]);

  // --- dock: width, split view, collapse
  const split = dock.mode === "split";
  const full = split && dock.maximized;
  const width = dock.width || defaultCalendarWidth();
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    document.body.style.cursor = "ew-resize";
    let frame = 0;
    const move = (ev: MouseEvent) => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => calendarDock.set({ width: clampCalendarWidth(startW + startX - ev.clientX) })); };
    const up = () => { cancelAnimationFrame(frame); document.body.style.cursor = ""; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const openMenu = (which: MenuName, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu(m => (m?.which === which ? null : { which, rect }));
  };
  const subMenu = (which: MenuName) => (e: React.MouseEvent) => setMenu({ which, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() });
  const thisWeek = now >= from && now < to;
  const isToday = (i: number) => now >= days[i] && now < days[i + 1];
  const iconBtn: React.CSSProperties = { width: 34, height: 34, color: p.text, flexShrink: 0 };
  const bordered: React.CSSProperties = { ...iconBtn, border: `1px solid ${p.border}`, boxSizing: "border-box" };
  const empty = !loading && !error && !anyRows
    ? (data?.coverage.to != null && from > data.coverage.to
      ? "This week's events aren't published yet. They appear at the end of the week before."
      : data?.coverage.from != null && to <= data.coverage.from
        ? `There are no events this far back: the calendar's history starts ${fmtMonthDay(data.coverage.from, tz)}, ${dayParts(data.coverage.from, tz).y}.`
        : (data?.events.length ?? 0) > 0 ? "No events match the filters." : "No events this week.")
    : null;
  const catLabel = settings.category === "all" ? "All categories" : CATEGORY_MENU.find(c => c.id === settings.category)?.label ?? "All categories";

  const valueCols = (r: Row | null) => {
    const cell = (content: React.ReactNode, key: string, extra?: React.CSSProperties) => (
      <span key={key} style={{ flex: "1 1 0", minWidth: 0, textAlign: "right", padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...extra }}>{content}</span>
    );
    if (!r) return [cell("Actual", "a", { color: p.muted }), cell("Forecast", "f", { color: p.muted }), cell("Prior", "p", { color: p.muted })];
    const e = r.e;
    const past = e.time <= now;
    const actual = e.actual
      ? <b style={{ fontWeight: 600 }}>{showValue(e.actual)}</b>
      : r.next ? <b style={{ fontWeight: 600, color: p.red }}>{e.time - now < 3600 ? `Coming in ${mmss(e.time - now)}` : "Coming soon"}</b>
        : past ? "—" : "";
    return [cell(actual, "a"), cell(e.forecast ? showValue(e.forecast) : past ? "—" : "", "f"), cell(e.previous ? showValue(e.previous) : past ? "—" : "", "p")];
  };
  const separator = (b: DayBlock, i: number, sticky: boolean) => {
    const pastDay = b.end <= now, today = now >= b.start && now < b.end;
    return (
      <div key={sticky ? "sticky" : `sep${i}`} data-day={sticky ? undefined : i} data-testid={sticky ? "calendar-sticky-day" : undefined}
        style={{ display: "flex", alignItems: "center", height: 40, background: p.sep, position: sticky ? "sticky" : "relative", top: sticky ? 0 : undefined, zIndex: sticky ? 3 : undefined }}>
        {today && <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: p.text }} />}
        <span style={{ width: "50%", paddingLeft: 20, fontSize: 14, lineHeight: "18px", fontWeight: 600, color: pastDay ? p.muted : p.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}>{fmtDayLong(b.start, tz)}</span>
        {sticky && <span style={{ width: "50%", display: "flex", fontSize: 14 }}>{valueCols(null)}</span>}
      </div>
    );
  };

  return (
    <div data-testid="economic-calendar" data-dock={dock.mode} role="dialog" aria-label="Calendar"
      style={{
        position: "fixed", top: 0, bottom: 0, right: 0, width: full ? "100vw" : width, maxWidth: "100vw",
        display: dock.collapsed ? "none" : "flex", flexDirection: "column", background: p.bg, color: p.text, zIndex: 2150,
        boxShadow: split ? "none" : dark ? "-1px 0 0 #2a2e39" : "-1px 0 0 #ebebeb",
        borderLeft: split ? "4px solid var(--tv-color-gap)" : "none", fontFamily: FONT,
      }}>
      <style>{`
        .tvcal-btn { display: flex; align-items: center; justify-content: center; border: none; background: transparent; border-radius: 8px; cursor: pointer; padding: 0; font-family: inherit; }
        .tvcal-btn:hover { background: ${p.hover}; }
        .tvcal-row:hover { background: ${p.hover}; }
        .tvcal-card:hover { background: ${p.hover}; }
        .tvcal-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px; padding: 0 16px; border: none; background: transparent; color: inherit; font: inherit; font-size: 14px; cursor: pointer; text-align: left; box-sizing: border-box; }
        .tvcal-item:hover { background: ${p.hover}; }
        .tvcal-film::-webkit-scrollbar { display: none; }
      `}</style>
      {!full && (
        <div data-name="calendar-resize" onMouseDown={startResize} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 16, cursor: "ew-resize", zIndex: 5 }}>
          <div style={{ position: "absolute", left: 12, top: "50%", width: 4, height: 76, marginTop: -38, borderRadius: 3, background: p.grip }} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "0 20px 0 36px" }}>
        {/* Title bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, height: 34, marginTop: 16, flexShrink: 0 }}>
          <Tip text={split ? "Move split-view to overlay" : "Move overlay to split-view"}>
            <button type="button" aria-label={split ? "Move split-view to overlay" : "Move overlay to split-view"} className="tvcal-btn" style={iconBtn}
              onClick={() => calendarDock.set({ mode: split ? "overlay" : "split", maximized: false })}>
              <Ic.SplitViewIcon style={split ? { transform: "scaleX(-1)" } : undefined} />
            </button>
          </Tip>
          <span style={{ fontSize: 14, lineHeight: "18px" }}>Calendar</span>
          <span style={{ flex: 1 }} />
          {split && (
            <Tip text={full ? "Restore panel" : "Maximize panel"}>
              <button type="button" aria-label={full ? "Restore panel" : "Maximize panel"} className="tvcal-btn" style={iconBtn} onClick={() => calendarDock.set(d => ({ maximized: !d.maximized }))}>
                {full ? <Ic.RestoreIcon /> : <Ic.MaximizeIcon />}
              </button>
            </Tip>
          )}
          <Tip text="Collapse panel">
            <button type="button" aria-label="Collapse panel" className="tvcal-btn" style={{ ...iconBtn, marginRight: 4 }} onClick={() => calendarDock.set({ collapsed: true })}><Ic.CollapseIcon /></button>
          </Tip>
          <Tip text="Close">
            <button type="button" aria-label="Close" className="tvcal-btn" style={iconBtn} onClick={onClose}><Ic.CloseIcon /></button>
          </Tip>
        </div>

        {/* Week controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, marginTop: 12, flexShrink: 0 }}>
          <Tip text="Open today">
            <button type="button" aria-label="Open today" className="tvcal-btn" style={{ ...bordered, width: "auto", padding: "0 12px", fontSize: 16, lineHeight: "24px" }}
              onClick={() => { if (thisWeek) scrollToNext(true); else { scrolledFor.current = ""; setWeekOf(Date.now() / 1000); } }}>Today</button>
          </Tip>
          <Tip text="Select week">
            <button type="button" aria-label="Select week" className="tvcal-btn" style={{ ...bordered, background: menu?.which === "week" ? p.hover : undefined }} onClick={e => openMenu("week", e)}><CalendarPickIcon /></button>
          </Tip>
          <Tip text="Previous week">
            <button type="button" aria-label="Previous week" className="tvcal-btn" style={iconBtn} onClick={() => setWeekOf(from - 3 * 86400)}><ChevronLeft /></button>
          </Tip>
          <Tip text="Next week">
            <button type="button" aria-label="Next week" className="tvcal-btn" style={iconBtn} onClick={() => setWeekOf(to + 3 * 86400)}><ChevronRight /></button>
          </Tip>
          <span data-testid="calendar-week" style={{ fontSize: 20, lineHeight: "24px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtWeekTitle(from, to, tz)}</span>
          <span style={{ flex: 1 }} />
          <Tip text="Calendar settings">
            <button type="button" aria-label="Calendar settings" className="tvcal-btn" style={{ ...bordered, background: menu && ["settings", "countries", "timezone"].includes(menu.which) ? p.hover : undefined }} onClick={e => openMenu("settings", e)}><SettingsIcon /></button>
          </Tip>
          <Tip text={dock.headerCollapsed ? "Expand header" : "Collapse header"}>
            <button type="button" aria-label={dock.headerCollapsed ? "Expand header" : "Collapse header"} className="tvcal-btn" style={bordered} onClick={() => calendarDock.set(d => ({ headerCollapsed: !d.headerCollapsed }))}>
              <ChevronUp style={dock.headerCollapsed ? { transform: "rotate(180deg)" } : undefined} />
            </button>
          </Tip>
        </div>

        {/* The week's days */}
        {!dock.headerCollapsed && (
          <div style={{ position: "relative", marginTop: 20, flexShrink: 0 }}>
            <div ref={filmRef} className="tvcal-film" onScroll={onFilmScroll} style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
              {days.slice(0, 7).map((d, i) => (
                <button key={i} type="button" data-card={i} className={topDay === i && anyRows ? undefined : "tvcal-card"} onClick={() => scrollToDay(i)}
                  style={{ flex: "0 0 100px", boxSizing: "border-box", padding: 12, borderRadius: 12, border: `1px solid ${p.card}`, background: topDay === i && anyRows ? p.card : "transparent", color: p.text, textAlign: "left", cursor: "pointer", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
                  <span style={{ display: "inline-block", position: "relative", fontSize: 16, lineHeight: "24px", fontWeight: 500, alignSelf: "flex-start" }}>
                    {fmtCard(d, tz)}
                    {isToday(i) && <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: -3, height: 3, borderRadius: 4, background: p.text }} />}
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", width: "100%", marginTop: 8, fontSize: 12, lineHeight: "16px" }}>
                    <span style={{ color: p.muted }}>Economic</span><span>{data ? counts[i] : "…"}</span>
                  </span>
                </button>
              ))}
            </div>
            {(["left", "right"] as const).map(side => filmEdges[side] && (
              <button key={side} type="button" aria-label={side === "left" ? "Scroll left" : "Scroll right"} className="tvcal-btn"
                onClick={() => filmRef.current?.scrollBy({ left: side === "left" ? -216 : 216, behavior: "smooth" })}
                style={{ position: "absolute", top: "50%", [side]: -8, marginTop: -20, width: 40, height: 40, borderRadius: 20, background: p.bg, color: p.text, boxShadow: p.shadow }}>
                {side === "left" ? <ChevronLeft /> : <ChevronRight />}
              </button>
            ))}
          </div>
        )}

        {/* Economic, the importance toggle and the categories */}
        <div style={{ display: "flex", gap: 8, marginTop: dock.headerCollapsed ? 20 : 24, flexShrink: 0 }}>
          <button type="button" aria-pressed="true" style={{ height: 34, padding: "0 15px", borderRadius: 17, border: `1px solid ${p.pillOn}`, background: p.pillOn, color: p.pillOnText, fontSize: 16, lineHeight: "24px", fontFamily: FONT, cursor: "default" }}>Economic</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", height: 34, marginTop: 16, marginBottom: 12, flexShrink: 0 }}>
          <Tip text="High importance">
            <button type="button" aria-label="High importance" aria-pressed={settings.highOnly} className="tvcal-btn"
              style={{ ...iconBtn, background: settings.highOnly ? (dark ? "#ffffff" : "#3d3d3d") : undefined, color: settings.highOnly ? (dark ? "#000" : "#fff") : p.text }}
              onClick={() => calendarSettings.set(s => ({ highOnly: !s.highOnly }))}>
              {settings.highOnly ? <StatsIconOn /> : <StatsIcon />}
            </button>
          </Tip>
          <span style={{ width: 1, height: 28, background: p.border, margin: "0 16px", flexShrink: 0 }} />
          <button type="button" aria-label="Categories" aria-haspopup="menu" className="tvcal-btn" onClick={e => openMenu("categories", e)}
            style={{ height: 34, padding: "0 6px 0 8px", gap: 4, color: p.text, fontSize: 16, background: menu?.which === "categories" ? p.hover : undefined }}>
            <ListIcon /><span style={{ padding: "0 4px", whiteSpace: "nowrap" }}>{catLabel}</span><Caret up={menu?.which === "categories"} />
          </button>
        </div>

        {/* The week's events */}
        <div style={{ position: "relative", flex: 1, minHeight: 0, marginRight: -20 }}>
          <div ref={listRef} onScroll={onScroll} data-testid="calendar-list" style={{ position: "absolute", inset: 0, overflowY: "auto", paddingRight: 20 }}>
            {anyRows && blocks[topDay] && separator(blocks[topDay], topDay, true)}
            <div style={{ marginTop: anyRows ? -40 : 0 }}>
              {anyRows && blocks.map((b, i) => (
                <React.Fragment key={i}>
                  {b.rows.length > 0 && separator(b, i, false)}
                  {b.rows.map(r => {
                    const e = r.e;
                    const lineLeft = r.showTime ? 0 : r.showFlag ? 78 : 134;
                    return (
                      <div key={e.id} data-event={e.id} data-next={r.next && r.showTime ? "1" : undefined} className="tvcal-row"
                        style={{ display: "flex", alignItems: "center", height: 41, position: "relative", fontSize: 14, lineHeight: "18px" }}>
                        <span aria-hidden style={{ position: "absolute", top: 0, right: 0, left: r.nowLine ? 0 : lineLeft, height: 1, background: r.nowLine ? p.red : p.line }} />
                        <span title={r.showTime ? fmtFull(e.time, tz) : undefined} style={{ width: 78, flexShrink: 0, paddingLeft: 16, boxSizing: "border-box", whiteSpace: "nowrap" }}>
                          {r.showTime && (r.next
                            ? <span style={{ display: "inline-block", height: 22, lineHeight: "22px", padding: "0 6px", borderRadius: 6, background: p.red, color: "#fff" }}>{fmtTime(e.time, tz)}</span>
                            : <span style={{ padding: "2px 4px", color: p.muted }}>{e.all_day ? "All day" : e.tentative ? "Tent." : fmtTime(e.time, tz)}</span>)}
                        </span>
                        <span style={{ width: 56, flexShrink: 0, display: "flex", paddingLeft: 16, boxSizing: "border-box" }} title={r.showFlag ? CURRENCY_NAMES[e.currency] ?? e.currency : undefined}>
                          {r.showFlag && <CurrencyFlag code={e.currency} size={24} />}
                        </span>
                        <span style={{ width: 50, flexShrink: 0, display: "flex", paddingLeft: 16, boxSizing: "border-box" }}><ImportanceIcon impact={e.impact} p={p} /></span>
                        <span title={e.title} style={{ flex: 1, minWidth: 0, paddingLeft: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                        <span style={{ width: "50%", flexShrink: 0, display: "flex" }}>{valueCols(r)}</span>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
              {error && <div style={{ padding: "24px 20px", color: p.muted, fontSize: 14 }}>{error}. <button type="button" onClick={() => load(true)} style={{ color: p.blue, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}>Try again</button></div>}
              {loading && !data && <div style={{ padding: "64px 20px", color: p.muted, fontSize: 14, textAlign: "center" }}>Loading…</div>}
              {empty && <div data-testid="calendar-empty" style={{ padding: "64px 20px", color: p.muted, fontSize: 14, textAlign: "center", lineHeight: 1.5 }}>{empty}</div>}
              <div style={{ padding: "16px 20px 24px", color: p.muted, fontSize: 12 }}>Source: {data?.source ?? "Forex Factory"}{data?.updated ? `, updated ${fmtTime(data.updated, tz)}` : ""} · Times in {utcOffsetLabel(tz)}</div>
            </div>
          </div>
          {jump && (
            <button type="button" onClick={() => scrollToNext(true)}
              style={{ position: "absolute", left: "50%", bottom: 16, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px 0 12px", borderRadius: 19, border: "none", background: dark ? "#ffffff" : "#222222", color: dark ? "#000" : "#fff", fontSize: 16, fontFamily: FONT, cursor: "pointer", boxShadow: p.shadow, zIndex: 4 }}>
              <ArrowDown up={jump === "up"} /> Coming soon
            </button>
          )}
        </div>
      </div>

      {/* Menus */}
      {menu?.which === "categories" && (
        <Popover anchor={menu.rect} onClose={closeMenu} p={p} width={120}>
          {[{ id: "all", label: "All categories" }, ...CATEGORY_MENU].map(c => (
            <button key={c.id} type="button" role="menuitemradio" aria-checked={settings.category === c.id} className="tvcal-item"
              style={settings.category === c.id ? { background: p.pillOn, color: p.pillOnText, padding: "0 12px" } : { padding: "0 12px" }}
              onClick={() => { calendarSettings.set({ category: c.id }); closeMenu(); }}>{c.label}</button>
          ))}
        </Popover>
      )}
      {menu?.which === "settings" && (
        <Popover anchor={menu.rect} onClose={closeMenu} p={p} align="right" width={240}>
          <button type="button" className="tvcal-item" onClick={subMenu("countries")}>
            <GlobeIcon /><span style={{ flex: 1 }}>Countries…</span><span style={{ color: p.muted }}>{settings.countries.length === CALENDAR_CURRENCIES.length ? "All" : settings.countries.length}</span>
          </button>
          <button type="button" className="tvcal-item" onClick={subMenu("timezone")}>
            <ClockIcon /><span style={{ flex: 1 }}>Timezone</span><span style={{ color: p.muted }}>{utcOffsetLabel(tz)}</span><ChevronRight width={18} height={18} />
          </button>
        </Popover>
      )}
      {menu?.which === "countries" && (
        <Popover anchor={menu.rect} onClose={closeMenu} p={p} align="right" width={250}>
          <div style={{ display: "flex", gap: 16, padding: "6px 16px 8px", fontSize: 13 }}>
            <button type="button" onClick={() => calendarSettings.set({ countries: CALENDAR_CURRENCIES })} style={{ background: "none", border: "none", padding: 0, color: p.blue, cursor: "pointer", font: "inherit" }}>Select all</button>
            <button type="button" onClick={() => calendarSettings.set({ countries: [] })} style={{ background: "none", border: "none", padding: 0, color: p.blue, cursor: "pointer", font: "inherit" }}>Clear</button>
          </div>
          {CALENDAR_CURRENCIES.map(c => {
            const on = settings.countries.includes(c);
            return (
              <label key={c} className="tvcal-item">
                <input type="checkbox" checked={on} onChange={() => calendarSettings.set(s => ({ countries: on ? s.countries.filter(x => x !== c) : [...s.countries, c] }))} />
                <CurrencyFlag code={c} size={20} /><span style={{ flex: 1 }}>{CURRENCY_NAMES[c]}</span><span style={{ color: p.muted, fontSize: 12 }}>{c === "ALL" ? "" : c}</span>
              </label>
            );
          })}
        </Popover>
      )}
      {menu?.which === "timezone" && (
        <Popover anchor={menu.rect} onClose={closeMenu} p={p} align="right" width={250}>
          {([["chart", "Same as the chart"], ["local", "This device's"], ["UTC", "UTC"]] as [CalendarTimezone, string][]).map(([id, label]) => (
            <button key={id} type="button" role="menuitemradio" aria-checked={settings.timezone === id} className="tvcal-item"
              style={settings.timezone === id ? { fontWeight: 600 } : undefined} onClick={() => { calendarSettings.set({ timezone: id }); closeMenu(); }}>
              <span style={{ flex: 1 }}>{label}</span><span style={{ color: p.muted }}>{utcOffsetLabel(resolveTimezone(id))}</span>
            </button>
          ))}
        </Popover>
      )}
      {menu?.which === "week" && (
        <Popover anchor={menu.rect} onClose={closeMenu} p={p} width={290}>
          <WeekPicker p={p} tz={tz} selectedFrom={from} now={now} onPick={t => { setWeekOf(t); closeMenu(); }} />
        </Popover>
      )}
    </div>
  );
}

// A month with its weeks; the selected week's days filled, today underlined; a day picks its week
function WeekPicker({ p, tz, selectedFrom, now, onPick }: { p: Pal; tz: string; selectedFrom: number; now: number; onPick: (t: number) => void }) {
  const sel = dayParts(selectedFrom + 3600, tz);
  const [month, setMonth] = useState({ y: sel.y, m: sel.m });
  const today = dayParts(now, tz);
  const first = new Date(Date.UTC(month.y, month.m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(month.y, month.m - 1, 1 - lead + i)));
  const selKeys = new Set(Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(sel.y, sel.m - 1, sel.d + i)).toISOString().slice(0, 10)));
  const [hoverWeek, setHoverWeek] = useState<number | null>(null);
  const shift = (n: number) => setMonth(m => { const d = new Date(Date.UTC(m.y, m.m - 1 + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; });
  return (
    <div style={{ padding: "6px 12px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 34, marginBottom: 6 }}>
        <button type="button" aria-label="Previous month" className="tvcal-btn" style={{ width: 34, height: 34, color: p.text }} onClick={() => shift(-1)}><ChevronLeft /></button>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <button type="button" aria-label="Next month" className="tvcal-btn" style={{ width: 34, height: 34, color: p.text }} onClick={() => shift(1)}><ChevronRight /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 4, textAlign: "center", fontSize: 14 }}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => <span key={d} style={{ color: p.muted, height: 30, lineHeight: "30px" }}>{d}</span>)}
        {cells.map((d, i) => {
          const key = d.toISOString().slice(0, 10);
          const inMonth = d.getUTCMonth() === month.m - 1;
          const selected = selKeys.has(key), week = Math.floor(i / 7);
          const isToday = d.getUTCFullYear() === today.y && d.getUTCMonth() + 1 === today.m && d.getUTCDate() === today.d;
          return (
            <button key={key} type="button" onMouseEnter={() => setHoverWeek(week)} onMouseLeave={() => setHoverWeek(null)}
              onClick={() => onPick(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12) / 1000)}
              style={{
                height: 30, margin: "0 2px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: FONT, fontSize: 14, position: "relative",
                background: selected ? p.pillOn : hoverWeek === week ? p.hover : "transparent",
                color: selected ? p.pillOnText : inMonth ? p.text : p.muted,
              }}>
              {d.getUTCDate()}
              {isToday && <span aria-hidden style={{ position: "absolute", left: "30%", right: "30%", bottom: 3, height: 2, borderRadius: 2, background: selected ? p.pillOnText : p.text }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
