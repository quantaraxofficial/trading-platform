"use client";

// TradingView's Alerts panel: an Alerts tab (each alert's message, symbol and status, with
// restart / stop, edit and delete on hover and its details in a tooltip) and a Log tab of
// triggered alerts grouped by day, unread ones highlighted, with an unread count on the tab.

import React, { useEffect, useRef, useState } from "react";
import { Plus, Play, Square, Settings, Trash2, CheckCheck, Brush } from "lucide-react";
import { useAlerts, Alert } from "@/context/AlertsContext";
import { useEscapeClose } from "../lib/useEscapeClose";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (t: number) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
// "Wed 07 Oct '26   00:40:12"
const stamp = (t: number) => { const d = new Date(t); return `${DAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}   ${clock(t)}`; };
const dayKey = (t: number) => { const d = new Date(t); return `${LONG_MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ""}`; };

export const alertStatusText = (a: Alert) =>
  a.status === "active" ? "Active" : a.status === "triggered" ? "Stopped — Triggered" : a.status === "expired" ? "Stopped — Expired" : "Stopped — Manually";
const statusColor = (a: Alert) => (a.status === "active" ? "#089981" : "#ff9800");

const shortSymbol = (s: string) => s.split(":").pop() || s;

export default function AlertsSidebar() {
  const { alerts, log, unread, removeAlert, restartAlert, stopAlert, markLogRead, clearLog } = useAlerts();
  const [tab, setTab] = useState<"alerts" | "log">("alerts");
  const [confirm, setConfirm] = useState<Alert | null>(null);
  const [hover, setHover] = useState<{ alert: Alert; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Entries stay highlighted while the Log is open and count as read once you leave it
  const tabRef = useRef(tab);
  useEffect(() => {
    if (tabRef.current === "log" && tab !== "log") markLogRead();
    tabRef.current = tab;
  }, [tab, markLogRead]);
  useEffect(() => () => { if (tabRef.current === "log") markLogRead(); }, [markLogRead]);

  const tabBtn = (id: "alerts" | "log", text: string, badge?: number) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      style={{ flex: 1, height: 32, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        background: tab === id ? "var(--tv-color-bg-hover, rgba(120,123,134,0.2))" : "transparent", color: "var(--tv-color-text)" }}>
      {text}
      {!!badge && <span aria-label={`${badge} unread`} style={{ minWidth: 16, height: 16, padding: "0 4px", boxSizing: "border-box", borderRadius: 8, background: "#f23645", color: "#fff", fontSize: 11, lineHeight: "16px", fontWeight: 600 }}>{badge > 99 ? "99+" : badge}</span>}
    </button>
  );

  const iconBtn = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" className="tv-icon-btn" aria-label={label} title={label} onClick={onClick} style={{ width: 28, height: 28 }}>{icon}</button>
  );

  // Log entries grouped by day, newest first
  const groups: { day: string; entries: typeof log }[] = [];
  for (const e of log) {
    const day = dayKey(e.time);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.entries.push(e); else groups.push({ day, entries: [e] });
  }

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", position: "relative" }}>
      <div role="tablist" style={{ display: "flex", gap: 2, margin: "8px 12px 4px", padding: 2, borderRadius: 8, background: "var(--tv-color-bg-subtle, rgba(120,123,134,0.1))" }}>
        {tabBtn("alerts", "Alerts")}
        {tabBtn("log", "Log", unread)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 8px", borderBottom: "1px solid var(--tv-color-border)" }}>
        {tab === "alerts"
          ? iconBtn("Create alert", <Plus size={18} strokeWidth={1.5} />, () => window.dispatchEvent(new CustomEvent("tv:create-alert", { detail: {} })))
          : <>
              {iconBtn("Clear log", <Brush size={16} strokeWidth={1.5} />, clearLog)}
              {iconBtn("Mark all as read", <CheckCheck size={16} strokeWidth={1.5} />, markLogRead)}
            </>}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }} onScroll={() => setHover(null)}>
        {tab === "alerts" ? (
          alerts.length === 0 ? (
            <Empty title="No alerts yet" text="Create an alert with Alt + A or the + button above." />
          ) : alerts.map(a => (
            <div key={a.id} className="hover-bg-subtle" data-testid="alert-row"
              onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); const top = r.top - (rootRef.current?.getBoundingClientRect().top ?? 0); setHover({ alert: a, top }); }}
              onMouseLeave={() => setHover(null)}
              style={{ position: "relative", padding: "9px 12px", borderBottom: "1px solid var(--tv-color-border)", cursor: "default" }}>
              <div style={{ fontSize: 14, lineHeight: "20px", paddingRight: hover?.alert.id === a.id ? 76 : 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: a.status === "active" ? "var(--tv-color-text)" : "var(--tv-color-text-muted)" }}>{a.message}</div>
              <div style={{ fontSize: 12, lineHeight: "18px", color: "var(--tv-color-text-muted)" }}>
                {shortSymbol(a.symbol)} <span style={{ margin: "0 3px" }}>•</span> <span style={{ color: statusColor(a) }}>{alertStatusText(a)}</span>
              </div>
              {hover?.alert.id === a.id && (
                <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 2 }}>
                  {a.status === "active"
                    ? iconBtn("Stop", <Square size={13} strokeWidth={1.5} />, () => stopAlert(a.id))
                    : iconBtn("Restart", <Play size={14} strokeWidth={1.5} />, () => restartAlert(a.id))}
                  {iconBtn("Edit", <Settings size={15} strokeWidth={1.5} />, () => window.dispatchEvent(new CustomEvent("tv:edit-alert", { detail: { id: a.id } })))}
                  {iconBtn("Delete", <Trash2 size={15} strokeWidth={1.5} />, () => setConfirm(a))}
                </div>
              )}
            </div>
          ))
        ) : log.length === 0 ? (
          <Empty title="No alerts triggered yet!" text="You will see a list here when they do." />
        ) : groups.map(g => (
          <div key={g.day}>
            <div style={{ padding: "12px 12px 6px", fontSize: 11, letterSpacing: 0.4, color: "var(--tv-color-text-muted)" }}>{g.day}</div>
            {g.entries.map(e => (
              <div key={e.id} data-testid="alert-log-row" style={{ padding: "9px 12px", borderBottom: "1px solid var(--tv-color-border)", background: e.read ? "transparent" : "var(--tv-alert-unread, rgba(41,98,255,0.18))" }}>
                <div style={{ fontSize: 14, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.message}</div>
                <div style={{ fontSize: 12, lineHeight: "18px", color: "var(--tv-color-text-muted)" }}>{shortSymbol(e.symbol)} <span style={{ margin: "0 3px" }}>•</span> {clock(e.time)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Details tooltip, left of the panel like TradingView's */}
      {hover && (
        <div role="tooltip" style={{ position: "fixed", zIndex: 10002, pointerEvents: "none", right: (typeof window !== "undefined" && rootRef.current ? window.innerWidth - rootRef.current.getBoundingClientRect().left + 4 : 0), top: (rootRef.current?.getBoundingClientRect().top ?? 0) + hover.top, background: "#131722", color: "#d1d4dc", borderRadius: 6, padding: "8px 12px", fontSize: 13, lineHeight: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>
          <div>{shortSymbol(hover.alert.symbol)} <span style={{ color: "#ff9800" }}>{hover.alert.condition}</span> {hover.alert.value}</div>
          <div>{hover.alert.symbol} • <span style={{ color: statusColor(hover.alert) }}>{alertStatusText(hover.alert)}</span></div>
          <div>Created: {stamp(hover.alert.createdAt)}</div>
          {hover.alert.lastTriggeredAt && <div>Last triggered: {stamp(hover.alert.lastTriggeredAt)}</div>}
          {hover.alert.status === "active" && hover.alert.expiration > 0 && <div>Expires: {stamp(hover.alert.expiration)}</div>}
        </div>
      )}

      {confirm && <DeleteAlertDialog alert={confirm} onCancel={() => setConfirm(null)} onDelete={() => { removeAlert(confirm.id); setConfirm(null); setHover(null); }} />}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", fontSize: 15, lineHeight: "24px", color: "var(--tv-color-text)" }}>
      <div>{title}</div>
      <div>{text}</div>
    </div>
  );
}

function DeleteAlertDialog({ alert, onCancel, onDelete }: { alert: Alert; onCancel: () => void; onDelete: () => void }) {
  useEscapeClose(onCancel);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10006, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-label="Delete this alert?" style={{ position: "relative", width: 480, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", padding: 40, borderRadius: 6, background: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)", boxShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
        <div style={{ fontSize: 20, lineHeight: "24px", fontWeight: 600, marginBottom: 16 }}>Delete this alert?</div>
        <div style={{ fontSize: 16, lineHeight: "24px" }}>Doing this will permanently delete your &quot;{alert.message}&quot; alert.</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          <button type="button" onClick={onCancel} style={{ height: 34, padding: "0 11px", borderRadius: 8, border: "1px solid var(--tv-color-border)", background: "transparent", color: "inherit", fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button type="button" autoFocus onClick={onDelete} style={{ height: 34, padding: "0 11px", borderRadius: 8, border: "none", background: "#f23645", color: "#fff", fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
        </div>
        <button type="button" aria-label="Close" onClick={onCancel} style={{ position: "absolute", top: 8, right: 8, width: 34, height: 34, border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 20 }}>×</button>
      </div>
    </div>
  );
}
