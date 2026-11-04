"use client";

// The right toolbar's Backtest sessions panel: your backtest sessions (analytics/sessions.ts) —
// bar replays you come back to with their own account — newest first, each with its status,
// the bar it's at, P&L, trades and time spent. Clicking one opens it in a new tab, carrying on
// where it was left (the chart page resumes /?session=<id>). New ones are made in Analytics.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/context/AuthContext";
import { chartUrlFor, getActiveSession, lengthText, listSessions, spent, subscribeActiveSession, timeLeft, type BacktestSession } from "@/app/analytics/sessions";

export function BacktestSessionsIcon({ size = 28 }: { size?: number }) {
  // A flask with a replay arrow, in the toolbar's 1px line style
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M11.5 5.5h5M12.5 5.5v6.2L7.4 20.6a1.6 1.6 0 0 0 1.4 2.4h10.4a1.6 1.6 0 0 0 1.4-2.4l-5.1-8.9V5.5" />
      <path d="M9.6 17h8.8" />
      <path d="M21.5 9.5a3 3 0 1 1-1-2.2M20.6 5.8v1.6h-1.6" />
    </svg>
  );
}

const STATUS: Record<string, { text: string; color: string }> = {
  active: { text: "Active", color: "#089981" },
  paused: { text: "Paused", color: "#ff9800" },
  completed: { text: "Completed", color: "#787b86" },
};

const money = (v: number, sign = false) =>
  `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (s: number) => new Date(s * 1000).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function BacktestSessionsPanel() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [sessions, setSessions] = useState<BacktestSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openHere = useSyncExternalStore(subscribeActiveSession, getActiveSession, () => null);

  const load = useCallback(() => {
    if (!uid) return;
    listSessions(uid)
      .then(list => { setSessions([...list].sort((a, b) => b.updated_at - a.updated_at)); setError(null); })
      .catch(e => setError(e?.message || "Couldn't load your sessions"));
  }, [uid]);

  // Read when the panel opens, and again when you come back to this tab (a session saved in
  // another tab shows its progress)
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const open = (s: BacktestSession) => window.open(chartUrlFor(s), "_blank", "noopener");

  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 8px" }}>
      <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: "var(--tv-color-text)" }}>Backtest sessions</span>
      {uid && (
        <button type="button" className="tv-icon-btn" title="Refresh" aria-label="Refresh" onClick={load} style={{ width: 28, height: 28 }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M15 9a6 6 0 1 1-1.8-4.3M15 3v3.5h-3.5" /></svg>
        </button>
      )}
      <button type="button" data-name="new-backtest-session" onClick={() => window.open("/analytics?view=backtests", "_blank", "noopener")}
        style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "1px solid var(--tv-color-border)", background: "transparent", color: "var(--tv-color-text)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
        New session
      </button>
    </div>
  );

  const note = (text: React.ReactNode) => (
    <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, lineHeight: "20px", color: "var(--tv-color-text-muted)" }}>{text}</div>
  );

  return (
    <div data-name="backtest-sessions-panel" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--tv-color-pane-bg)" }}>
      {head}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 10px" }}>
        {!uid ? note(<>Sign in to see your backtest sessions.</>)
          : error ? note(<span style={{ color: "#f23645" }}>{error}</span>)
          : sessions === null ? note("Loading…")
          : sessions.length === 0 ? note(<>No sessions yet. Start one with <b>New session</b>, or during a bar replay choose <b>Save as backtest session</b> in the replay menu.</>)
          : sessions.map(s => {
            const st = STATUS[s.status] || STATUS.paused;
            const here = openHere === s.id;
            const left = timeLeft(s);
            return (
              <button key={s.id} type="button" data-name="backtest-session" data-session={s.id} onClick={() => open(s)}
                title={here ? "Open in this tab — click to open it in a new tab too" : "Open in a new tab and carry on"}
                className="tv-bts-row"
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 10px", margin: "2px 0", borderRadius: 6, border: here ? "1px solid #2962ff" : "1px solid transparent", background: "transparent", color: "var(--tv-color-text)", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  {here && <span style={{ fontSize: 11, color: "#2962ff", fontWeight: 600 }}>Open here</span>}
                  <span style={{ fontSize: 11, fontWeight: 600, color: st.color, border: `1px solid ${st.color}`, borderRadius: 10, padding: "0 6px", lineHeight: "16px" }}>{st.text}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--tv-color-text-muted)", marginTop: 2 }}>
                  {s.symbol} · {s.interval_label || s.interval} · at {when(s.current_time)}
                </div>
                {left && (
                  <div data-name="backtest-session-left" style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: left.done ? "#089981" : "var(--tv-color-text)" }}>
                      {left.text}{s.length && !left.done ? <span style={{ fontWeight: 400, color: "var(--tv-color-text-muted)" }}> of {lengthText(s.length)}</span> : null}
                    </div>
                    <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: "var(--tv-color-border)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.round(left.progress * 100)}%`, height: "100%", background: left.done ? "#089981" : "#2962ff" }} />
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, fontSize: 12, marginTop: 6, color: "var(--tv-color-text-muted)" }}>
                  <span>P&amp;L <b style={{ color: s.net_pnl > 0 ? "#089981" : s.net_pnl < 0 ? "#f23645" : "var(--tv-color-text)" }}>{money(s.net_pnl, true)}</b></span>
                  <span>Trades <b style={{ color: "var(--tv-color-text)" }}>{s.trade_count}{s.open_count ? ` +${s.open_count}` : ""}</b></span>
                  <span>Time <b style={{ color: "var(--tv-color-text)" }}>{spent(s.time_spent)}</b></span>
                </div>
              </button>
            );
          })}
      </div>
      <style>{`.tv-bts-row:hover { background: var(--tv-hover-neutral, rgba(120,123,134,0.12)) !important; }`}</style>
    </div>
  );
}
