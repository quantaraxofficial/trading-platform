"use client";

import React, { useSyncExternalStore, useState, useRef, useEffect, useCallback } from "react";
import { useReplay, type ReplayStartMode } from "./ReplayContext";
import ReplayDateDialog from "./ReplayDateDialog";
import { getEarliestBarTime } from "../utils/earliestBar";
import { useEscapeClose } from "../lib/useEscapeClose";
import { getSavedReplay, type SavedReplay } from "../lib/savedReplay";
import { useAuth } from "@/context/AuthContext";
import { getActiveSession, getSessionUi, listSessions, subscribeActiveSession, subscribeSessionUi, OPEN_SESSION_EVENT, type BacktestSession } from "../analytics/sessions";
import { collab, useCollab } from "../lib/collab/session";

const SPEED_OPTIONS = [
  { label: "10x", desc: "10 upd per 1 sec", value: 10 },
  { label: "7x", desc: "7 upd per 1 sec", value: 7 },
  { label: "5x", desc: "5 upd per 1 sec", value: 5 },
  { label: "3x", desc: "3 upd per 1 sec", value: 3 },
  { label: "1x", desc: "1 upd per 1 sec", value: 1 },
  { label: "0.5x", desc: "1 upd per 2 sec", value: 0.5 },
  { label: "0.3x", desc: "1 upd per 3 sec", value: 0.3 },
  { label: "0.2x", desc: "1 upd per 5 sec", value: 0.2 },
  { label: "0.1x", desc: "1 upd per 10 sec", value: 0.1 },
];

// TradingView's "Select starting point" modes: the main button shows the current one and repeats
// it; the arrow beside it opens the menu
const START_MODES: { id: ReplayStartMode; menu: string; label: string; icon: (size: number) => React.ReactNode }[] = [
  { id: "bar", menu: "Bar", label: "Select bar", icon: s => <BarIcon size={s} /> },
  { id: "date", menu: "Date…", label: "Select date", icon: s => <DateIcon size={s} /> },
  { id: "first", menu: "First available date", label: "Select first available date", icon: s => <FlagIcon size={s} /> },
  { id: "random", menu: "Random bar", label: "Select random bar", icon: s => <DiceIcon size={s} /> },
];

export default function ReplayBar({ intervalLabel = "5m", interval = "", symbol = "" }: { intervalLabel?: string; interval?: string; symbol?: string }) {
  const {
    mode, isPlaying, replaySpeed, hasStarted, startMode, setStartMode,
    stopReplay, togglePlay, stepForward, skipToEnd, setSpeed, reSelectBar
  } = useReplay();
  // In a collab: the replay everyone follows, and whether this person is driving or following it
  const { status: collabStatus, replay: shared, replayDetached, you } = useCollab();
  const inCollab = collabStatus === "live";
  const isDriver = inCollab && !!shared && shared.driver === you;
  const following = inCollab && !!shared && !isDriver && !replayDetached;

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const [showStartMenu, setShowStartMenu] = useState(false);
  const startMenuRef = useRef<HTMLDivElement>(null);
  const [showDateDialog, setShowDateDialog] = useState(false);
  // A replay of this symbol saved via "Leave current replay?" can be continued from the menu
  const [saved, setSaved] = useState<SavedReplay | null>(null);
  useEffect(() => {
    const read = () => setSaved(symbol ? getSavedReplay(symbol) : null);
    read();
    window.addEventListener("tv:saved-replay-changed", read);
    return () => window.removeEventListener("tv:saved-replay-changed", read);
  }, [symbol]);
  // Backtest sessions on this symbol (analytics/sessions.ts), to continue; and the replay under way,
  // to keep as one
  const { user } = useAuth();
  const [sessions, setSessions] = useState<BacktestSession[]>([]);
  const [activeSession, setActive] = useState<number | null>(getActiveSession());
  useEffect(() => subscribeActiveSession(() => setActive(getActiveSession())), []);
  useEffect(() => {
    if (!showStartMenu || !user?.uid) return;
    let gone = false;
    listSessions(user.uid).then(l => { if (!gone) setSessions(l.filter(s => s.symbol === symbol && s.status !== "completed").slice(0, 4)); }, () => {});
    return () => { gone = true; };
  }, [showStartMenu, user?.uid, symbol]);
  const sessionUi = useSyncExternalStore(subscribeSessionUi, getSessionUi, () => null);
  const continueSession = (id: number) => { setShowStartMenu(false); window.dispatchEvent(new CustomEvent(OPEN_SESSION_EVENT, { detail: { id } })); };
  const saveAsSession = () => { setShowStartMenu(false); window.dispatchEvent(new CustomEvent("tv:save-replay-as-session")); };
  const continueSaved = () => {
    setShowStartMenu(false);
    if (saved) window.dispatchEvent(new CustomEvent("tv:replay-start", { detail: { kind: "saved", at: saved.time } }));
  };
  const [firstDay, setFirstDay] = useState<string | null>(null);
  const intraday = !/day|week|month/.test(interval);
  const closeStartMenu = useCallback(() => setShowStartMenu(false), []);
  useEscapeClose(closeStartMenu, showStartMenu);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) setShowSpeedMenu(false);
      if (startMenuRef.current && !startMenuRef.current.contains(e.target as Node)) setShowStartMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // The first day with data, for the date dialog (the provider's first bar, fetched once)
  useEffect(() => {
    if (!showDateDialog || !symbol) return;
    let cancelled = false;
    setFirstDay(null);
    getEarliestBarTime(symbol, interval).then(t => {
      if (cancelled || t === null) return;
      const d = new Date(t * 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setFirstDay(intraday
        ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        : d.toISOString().slice(0, 10));
    });
    return () => { cancelled = true; };
  }, [showDateDialog, symbol, interval, intraday]);

  if (mode === 'idle' && !following) return null;

  const speedLabel = SPEED_OPTIONS.find(s => s.value === replaySpeed)?.label ?? "1x";
  const current = START_MODES.find(m => m.id === startMode) ?? START_MODES[0];
  const runStartMode = (m: ReplayStartMode) => {
    if (m === "bar") { if (mode !== "selecting") reSelectBar(); return; }
    if (m === "date") { setShowDateDialog(true); return; }
    window.dispatchEvent(new CustomEvent("tv:replay-start", { detail: { kind: m } }));
  };
  const chooseStartMode = (m: ReplayStartMode) => { setStartMode(m); setShowStartMenu(false); runStartMode(m); };
  // Play, step and jump work once a starting point has been set
  const controlsOn = hasStarted;

  const barStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: "100%",
    height: "38px",
    backgroundColor: "var(--tv-color-pane-bg)",
    borderTop: "1px solid var(--tv-color-border)",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    color: "var(--tv-hdr-text)",
    fontSize: "13px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif",
    zIndex: 1000,
    boxSizing: "border-box",
    userSelect: "none",
  };

  const separatorStyle: React.CSSProperties = {
    width: "1px",
    height: "24px",
    backgroundColor: "var(--tv-color-border)",
    margin: "0 12px",
  };

  if (following && shared) {
    const when = new Date(shared.time * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const speed = SPEED_OPTIONS.find(o => o.value === shared.speed)?.label ?? `${shared.speed}x`;
    return (
      <div style={barStyle} data-name="collab-replay-bar">
        <div style={{ width: "30px" }} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {mode === "idle" ? (
              <>Joining {shared.driver_name}&apos;s replay…</>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  {shared.playing ? <path d="M10 5h1v14h-1zM14 5h1v14h-1z" /> : <path d="M7 5l10 7-10 7V5z" />}
                </svg>
                {shared.driver ? <>Replaying with <b style={{ fontWeight: 600 }}>{shared.driver_name}</b></> : <>Replay paused · {shared.driver_name} left</>}
                <span style={{ color: "var(--tv-legend-args)" }}>· {speed} · {intervalLabel} · {when}</span>
              </>
            )}
          </span>
          <div style={separatorStyle} />
          {collab.canReplay && (
            <button type="button" className="tv-bb-btn" style={{ padding: "0 10px", fontSize: 14 }}
              title="Drive the replay: everyone follows you"
              onClick={() => collab.sendReplay(shared.time, false, shared.speed, true)}>
              Take control
            </button>
          )}
          <button type="button" className="tv-bb-btn" style={{ padding: "0 10px", fontSize: 14 }}
            title="Keep replaying from here without following the group"
            onClick={() => collab.setReplayDetached(true)}>
            Replay on my own
          </button>
        </div>
        <IconButton onClick={() => { collab.setReplayDetached(true); if (mode !== "idle") stopReplay(); }} title="Exit Replay">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </IconButton>
      </div>
    );
  }

  // Who sees this replay, in a collab
  const collabNote = !inCollab ? null
    : isDriver ? "Everyone in the collab follows your replay"
    : shared && replayDetached ? null
    : !collab.canReplay ? "Only you see this replay" : null;

  return (
    <div style={barStyle}>
      {/* The backtest session being replayed: its P&L, when it was saved, Save / Complete (the ✕ pauses it) */}
      {sessionUi && !collabNote && !(inCollab && shared && replayDetached) && (
        <div data-testid="bt-session-chip" title={`Backtest session: ${sessionUi.name} · equity $${sessionUi.equity.toFixed(2)} · ${sessionUi.spent} spent`}
          style={{ position: "absolute", left: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 12, pointerEvents: "auto", maxWidth: "calc(50% - 190px)", minWidth: 0 }}>
          <span style={{ padding: "2px 6px", borderRadius: 5, background: "linear-gradient(90deg,#7c3aed,#4f46e5)", color: "#fff", fontSize: 10, fontWeight: 700, flex: "none" }}>BT</span>
          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{sessionUi.name}</span>
          <span data-testid="bt-session-pnl" style={{ fontWeight: 600, flex: "none", color: sessionUi.pnl > 0.004 ? "#089981" : sessionUi.pnl < -0.004 ? "#f23645" : undefined }}>
            {sessionUi.pnl >= 0 ? "+" : "-"}${Math.abs(sessionUi.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span data-testid="bt-session-saved" style={{ color: sessionUi.error ? "#f23645" : "var(--tv-legend-args)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{sessionUi.error || sessionUi.saved}</span>
          <button type="button" className="tv-bb-btn" data-testid="bt-session-save" onClick={sessionUi.save} style={{ padding: "0 8px", height: 26, fontSize: 12, flex: "none" }}>Save</button>
          <button type="button" className="tv-bb-btn" data-testid="bt-session-complete" onClick={sessionUi.complete} style={{ padding: "0 8px", height: 26, fontSize: 12, flex: "none" }}>Complete</button>
        </div>
      )}
      {(collabNote || (inCollab && shared && replayDetached)) && (
        <div style={{ position: "absolute", left: 12, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--tv-legend-args)", pointerEvents: "auto" }}>
          {collabNote}
          {inCollab && shared && replayDetached && (
            <button type="button" className="tv-bb-btn" style={{ padding: "0 10px", fontSize: 13, height: 26 }}
              title={`Go back to following ${shared.driver_name}'s replay`}
              onClick={() => collab.setReplayDetached(false)}>
              Rejoin {shared.driver_name}
            </button>
          )}
        </div>
      )}
      {/* Left spacer (matches close button width for perfect centering) */}
      <div style={{ width: "30px" }} />

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0px" }}>
        {/* Starting point: the current mode, and the menu to change it */}
        <div ref={startMenuRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
          <button
            type="button"
            className={`tv-bb-btn ${mode === "selecting" && startMode === "bar" ? "active" : ""}`}
            style={{ gap: 6, padding: "0 8px", fontSize: 14 }}
            title={mode === "selecting" && startMode === "bar" ? "Click on the chart to choose the bar the replay starts from" : current.label}
            onClick={() => runStartMode(startMode)}
          >
            {current.icon(22)}
            {current.label}
          </button>
          <button
            type="button"
            aria-label="Select starting point"
            aria-expanded={showStartMenu}
            className={`tv-bb-btn ${showStartMenu ? "active" : ""}`}
            style={{ width: 22, minWidth: 22, height: 28, padding: 0 }}
            onClick={() => setShowStartMenu(v => !v)}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
              <path d={showStartMenu ? "M1.5 6.5L5 3l3.5 3.5" : "M1.5 3.5L5 7l3.5-3.5"} />
            </svg>
          </button>
          {showStartMenu && (
            <div role="menu" aria-label="Select starting point" style={{
              position: "absolute", bottom: "100%", left: 0, marginBottom: 8, minWidth: 230, padding: "6px 0",
              background: "var(--tv-color-pane-bg)", border: "1px solid var(--tv-color-border)", borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 1001,
            }}>
              {(sessions.filter(s => s.id !== activeSession).length > 0 || (mode === "active" && hasStarted && !activeSession && user)) && (
                <>
                  <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", color: "var(--tv-legend-args)" }}>BACKTEST SESSIONS</div>
                  {sessions.filter(s => s.id !== activeSession).map(s => (
                    <button key={s.id} type="button" role="menuitem" onClick={() => continueSession(s.id)} className="tv-bb-btn" data-session={s.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", height: 42, padding: "0 12px", border: "none", borderRadius: 0,
                        justifyContent: "flex-start", fontSize: 14, fontFamily: "inherit", cursor: "pointer", color: "var(--tv-hdr-text)" }}>
                      <span aria-hidden style={{ width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>BT</span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: "16px", minWidth: 0 }}>
                        <span style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Continue: {s.name}</span>
                        <span style={{ fontSize: 11, color: "var(--tv-legend-args)" }}>{s.interval_label || s.interval} · {new Date(s.current_time * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                      </span>
                    </button>
                  ))}
                  {mode === "active" && hasStarted && !activeSession && user && (
                    <button type="button" role="menuitem" onClick={saveAsSession} className="tv-bb-btn" data-name="save-as-session"
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", height: 38, padding: "0 12px", border: "none", borderRadius: 0,
                        justifyContent: "flex-start", fontSize: 14, fontFamily: "inherit", cursor: "pointer", color: "var(--tv-hdr-text)" }}>
                      <svg width="24" height="24" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M7.5 6.5h10l3 3v12h-13z" /><path d="M10.5 6.5v5h6v-5M10.5 21.5v-5h7v5" /></svg>
                      Save as backtest session
                    </button>
                  )}
                  <div style={{ height: 1, margin: "6px 0", background: "var(--tv-color-border)" }} />
                </>
              )}
              {saved && (
                <>
                  <button type="button" role="menuitem" onClick={continueSaved} className="tv-bb-btn"
                    title={`Saved ${new Date(saved.savedAt).toLocaleString()}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", height: 38, padding: "0 12px", border: "none", borderRadius: 0,
                      justifyContent: "flex-start", fontSize: 14, fontFamily: "inherit", cursor: "pointer", color: "var(--tv-hdr-text)",
                    }}>
                    <svg width="24" height="24" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                      <path d="M6.5 14a7.5 7.5 0 1 0 2.2-5.3M6.5 5.5v3.7h3.7" /><path d="M12.5 10.5v7l5-3.5-5-3.5z" />
                    </svg>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: "16px" }}>
                      Continue saved replay
                      <span style={{ fontSize: 11, color: "var(--tv-legend-args)" }}>{new Date(saved.time * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                    </span>
                  </button>
                  <div style={{ height: 1, margin: "6px 0", background: "var(--tv-color-border)" }} />
                </>
              )}
              <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", color: "var(--tv-legend-args)" }}>SELECT STARTING POINT</div>
              {START_MODES.map(m => {
                const on = m.id === startMode;
                return (
                  <button key={m.id} type="button" role="menuitemradio" aria-checked={on} onClick={() => chooseStartMode(m.id)}
                    className={on ? undefined : "tv-bb-btn"}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", height: 38, padding: "0 12px", border: "none", borderRadius: 0,
                      justifyContent: "flex-start", fontSize: 14, fontFamily: "inherit", cursor: "pointer",
                      background: on ? "var(--tv-hdr-text)" : undefined, color: on ? "var(--tv-color-pane-bg)" : "var(--tv-hdr-text)",
                    }}>
                    {m.icon(24)}
                    {m.menu}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={separatorStyle} />

        {/* Play/Pause and Step Forward */}
        <IconButton onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} disabled={!controlsOn}>
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 5h1v14h-1zM14 5h1v14h-1z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7 5l10 7-10 7V5z" />
            </svg>
          )}
        </IconButton>

        <IconButton onClick={stepForward} title="Forward (Step)" disabled={!controlsOn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 5l10 7-10 7V5zM17 5v14" />
          </svg>
        </IconButton>

        {/* Speed Label */}
        <div ref={speedMenuRef} style={{ position: "relative", marginLeft: "12px" }}>
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            style={{ background: "none", border: "none", color: "var(--tv-hdr-text)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: "4px 8px" }}
          >
            {speedLabel}
          </button>
          {showSpeedMenu && (
            <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", backgroundColor: "var(--tv-color-pane-bg)", border: "1px solid var(--tv-color-border)", borderRadius: "6px", marginBottom: "8px", overflow: "hidden", zIndex: 1001, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", minWidth: "200px" }}>
              <div style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 700, color: "#787b86", textTransform: "uppercase", borderBottom: "1px solid var(--tv-color-border)" }}>
                Replay Speed
              </div>
              {SPEED_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  onClick={() => { setSpeed(opt.value); setShowSpeedMenu(false); }}
                  style={{
                    padding: "10px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                    backgroundColor: replaySpeed === opt.value ? "var(--tv-hdr-text)" : "transparent",
                    color: replaySpeed === opt.value ? "var(--tv-color-pane-bg)" : "var(--tv-hdr-text)",
                    fontSize: "14px",
                  }}
                  onMouseEnter={e => {
                    if (replaySpeed !== opt.value) e.currentTarget.style.backgroundColor = "var(--tv-hover-neutral)";
                  }}
                  onMouseLeave={e => {
                    if (replaySpeed !== opt.value) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{opt.label}</span>
                  <span style={{ opacity: 0.8, fontSize: "13px" }}>{opt.desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interval Label */}
        <div style={{ color: "var(--tv-hdr-text)", fontSize: "14px", fontWeight: 600, marginLeft: "8px", padding: "0 8px" }}>
          {intervalLabel}
        </div>

        <div style={separatorStyle} />

        {/* Jump to Real Time */}
        <IconButton onClick={skipToEnd} title="Jump to real time" disabled={!controlsOn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 5l10 7-10 7V5zM17 5v14M20 5v14" />
          </svg>
        </IconButton>
      </div>

      {/* Close Button (pinned right) */}
      <IconButton onClick={stopReplay} title="Exit Replay">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </IconButton>

      {showDateDialog && (
        <ReplayDateDialog
          intraday={intraday}
          firstDay={firstDay}
          onCancel={() => setShowDateDialog(false)}
          onSelect={(date, time) => {
            setShowDateDialog(false);
            window.dispatchEvent(new CustomEvent("tv:replay-start", { detail: { kind: "date", date, time } }));
          }}
        />
      )}
    </div>
  );
}

// Starting-point icons (TradingView's: bar with arrow, calendar, flag, dice)
const svgProps = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.2, "aria-hidden": true } as const);
const BarIcon = ({ size }: { size: number }) => (
  <svg {...svgProps(size)}><path d="M5.5 4v16M9 4v16M20 12H12.5M12.5 12l3.5-3.5M12.5 12l3.5 3.5" /></svg>
);
const DateIcon = ({ size }: { size: number }) => (
  <svg {...svgProps(size)}><path d="M4.5 6.5h15v13h-15zM4.5 10h15M8.5 4.5v3M15.5 4.5v3M16 15H9.5M9.5 15l2.2-2.2M9.5 15l2.2 2.2" /></svg>
);
const FlagIcon = ({ size }: { size: number }) => (
  <svg {...svgProps(size)}><path d="M7.5 18V4.5h10.5l-2.5 3.5 2.5 3.5H7.5" /><circle cx="7.5" cy="19.5" r="1.5" /></svg>
);
const DiceIcon = ({ size }: { size: number }) => (
  <svg {...svgProps(size)}>
    <rect x="3.5" y="7.5" width="12" height="12" rx="2.5" />
    <circle cx="7" cy="11" r="0.9" fill="currentColor" /><circle cx="12" cy="16" r="0.9" fill="currentColor" /><circle cx="9.5" cy="13.5" r="0.9" fill="currentColor" />
    <path d="M18.5 3v4M16.5 5h4M20 9.5v2M19 10.5h2" />
  </svg>
);

function IconButton({ children, onClick, title, disabled }: { children: React.ReactNode, onClick: () => void, title: string, disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        background: "none", border: "none", color: "var(--tv-hdr-text)",
        padding: "6px", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", transition: "background 0.2s", borderRadius: "4px", opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.backgroundColor = "var(--tv-hover-neutral)"; }}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
    >
      {children}
    </button>
  );
}
