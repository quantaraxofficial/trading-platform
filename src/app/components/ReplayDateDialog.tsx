"use client";

// Replay → "Select starting point" → Date…: TradingView's "Select date" dialog. A date field
// (and a time field on intraday charts), a month calendar limited to the days that have data
// (from the first bar the provider has up to today), "Select the first available day", and
// Cancel / Select.

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../lib/useEscapeClose";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayStr = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); };
function parseDate(s: string): { y: number; m: number; d: number } | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const dt = new Date(Date.UTC(y, mo, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}
const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s.trim());

export default function ReplayDateDialog({ intraday, firstDay, onCancel, onSelect }: {
  intraday: boolean;
  firstDay: string | null;   // YYYY-MM-DD of the first bar with data, once known
  onCancel: () => void;
  onSelect: (date: string, time: string) => void;
}) {
  useEscapeClose(onCancel);
  const today = todayStr();
  const [dateText, setDateText] = useState(today);
  const [lastValid, setLastValid] = useState(today);
  const [timeText, setTimeText] = useState("00:00");
  const initial = parseDate(today)!;
  const [view, setView] = useState({ y: initial.y, m: initial.m });

  const inRange = (s: string) => s <= today && (!firstDay || s >= firstDay);
  const dateOk = !!parseDate(dateText) && inRange(dateText);
  const timeOk = !intraday || validTime(timeText);

  const pick = (s: string) => {
    const p = parseDate(s);
    if (!p || !inRange(s)) return;
    setDateText(s);
    setLastValid(s);
    setView({ y: p.y, m: p.m });
  };
  // Typing a full valid date moves the calendar to it
  useEffect(() => {
    const p = parseDate(dateText);
    if (p && inRange(dateText)) { setLastValid(dateText); setView({ y: p.y, m: p.m }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateText]);

  const first = firstDay ? parseDate(firstDay) : null;
  const canPrev = !first || view.y > first.y || (view.y === first.y && view.m > first.m);
  const canNext = view.y < initial.y || (view.y === initial.y && view.m < initial.m);
  const step = (dir: number) => setView(v => {
    const m = v.m + dir;
    return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });

  const cells = useMemo(() => {
    const firstWeekday = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7; // Monday = 0
    const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const out: (number | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= days; d++) out.push(d);
    return out;
  }, [view]);

  const submit = () => { if (dateOk && timeOk) onSelect(dateText, intraday ? timeText.trim() : "00:00"); };

  const field: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 8px 0 10px", borderRadius: 6,
    border: "1px solid var(--tv-color-border)", background: "transparent", boxSizing: "border-box",
  };
  const input: React.CSSProperties = { flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "inherit", fontSize: 14, fontFamily: "inherit" };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div role="dialog" aria-label="Select date" onKeyDown={e => { if (e.key === "Enter") submit(); }}
        style={{ width: 300, background: "var(--tv-color-pane-bg)", color: "var(--tv-hdr-text)", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.25)", border: "1px solid var(--tv-color-border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 16px 14px 20px" }}>
          <span style={{ fontSize: 20, fontWeight: 600 }}>Select date</span>
          <button type="button" aria-label="Close" onClick={onCancel} className="tv-legend-btn" style={{ width: 28, height: 28 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M3.5 3.5l11 11M14.5 3.5l-11 11" /></svg>
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, padding: "4px 20px 12px" }}>
          <label style={{ ...field, flex: 1.5, borderColor: parseDate(dateText) && !dateOk ? "var(--tv-color-bear, #f23645)" : "var(--tv-color-accent)" }}>
            <input aria-label="Date" value={dateText} autoFocus placeholder="YYYY-MM-DD" style={input}
              onChange={e => setDateText(e.target.value)}
              onBlur={() => { if (!dateOk) setDateText(lastValid); }} />
            <CalendarIcon />
          </label>
          <label style={{ ...field, flex: 1, opacity: intraday ? 1 : 0.5 }}>
            <input aria-label="Time" value={intraday ? timeText : "00:00"} disabled={!intraday} placeholder="HH:MM" style={input}
              onChange={e => setTimeText(e.target.value)} />
            <ClockIcon />
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 12px" }}>
          <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => step(-1)} className="tv-legend-btn" style={{ width: 30, height: 30, opacity: canPrev ? 1 : 0.35 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M10 3L5 8l5 5" /></svg>
          </button>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{MONTHS[view.m]} {view.y}</span>
          <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => step(1)} className="tv-legend-btn" style={{ width: 30, height: 30, opacity: canNext ? 1 : 0.35 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden><path d="M6 3l5 5-5 5" /></svg>
          </button>
        </div>

        <div style={{ padding: "4px 20px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderRadius: 4, background: "var(--tv-hover-neutral)", marginBottom: 6 }}>
            {WEEKDAYS.map(w => <span key={w} style={{ textAlign: "center", fontSize: 13, lineHeight: "24px", color: "var(--tv-legend-args)" }}>{w}</span>)}
          </div>
          <div role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 4, minHeight: 6 * 38 }}>
            {cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} />;
              const s = ymd(view.y, view.m, d);
              const enabled = inRange(s);
              const selected = s === dateText;
              return (
                <button key={s} type="button" role="gridcell" aria-label={s} aria-selected={selected} disabled={!enabled} onClick={() => pick(s)}
                  className={enabled && !selected ? "tv-legend-btn" : undefined}
                  style={{
                    height: 34, margin: "0 2px", borderRadius: 6, border: "none", fontSize: 14, fontFamily: "inherit",
                    fontWeight: selected || s === today ? 700 : 400, cursor: enabled ? "pointer" : "default",
                    background: selected ? "var(--tv-hdr-text)" : "transparent",
                    color: selected ? "var(--tv-color-pane-bg)" : enabled ? "var(--tv-hdr-text)" : "var(--tv-legend-muted)",
                    textDecoration: s === today && !selected ? "underline" : undefined,
                  }}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "12px 20px 16px" }}>
          <button type="button" disabled={!firstDay} onClick={() => firstDay && pick(firstDay)}
            style={{ width: "100%", height: 36, borderRadius: 6, border: "none", background: "var(--tv-hover-neutral)", color: "var(--tv-hdr-text)", fontSize: 14, fontFamily: "inherit", cursor: firstDay ? "pointer" : "default", opacity: firstDay ? 1 : 0.5 }}>
            {firstDay ? "Select the first available day" : "Finding the first available day…"}
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 20px 16px", borderTop: "1px solid var(--tv-color-border)" }}>
          <button type="button" onClick={onCancel}
            style={{ height: 34, padding: "0 14px", borderRadius: 6, border: "1px solid var(--tv-hdr-text)", background: "transparent", color: "var(--tv-hdr-text)", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Cancel</button>
          <button type="button" disabled={!dateOk || !timeOk} onClick={submit}
            style={{ height: 34, padding: "0 14px", borderRadius: 6, border: "none", background: "var(--tv-hdr-text)", color: "var(--tv-color-pane-bg)", cursor: dateOk && timeOk ? "pointer" : "default", opacity: dateOk && timeOk ? 1 : 0.5, fontSize: 14, fontFamily: "inherit" }}>Select</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden style={{ flexShrink: 0, opacity: 0.8 }}>
    <path d="M3.5 5.5h13v11h-13zM3.5 8.5h13M7 3.5v3M13 3.5v3" />
    <path d="M7 11.5h1M9.5 11.5h1M12 11.5h1M7 14h1M9.5 14h1" />
  </svg>
);
const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden style={{ flexShrink: 0, opacity: 0.8 }}>
    <circle cx="10" cy="10" r="7" /><path d="M10 6v4.5l2.5 1.5" />
  </svg>
);
