"use client";

// A backtest session on the chart (analytics/sessions.ts). Opening one (/?session=<id>, Analytics'
// "Resume", or the replay menu) switches to its symbol and timeframe, then starts bar replay on the
// exact bar it was left on, at its zoom, trading in its own saved account. While it runs, its
// progress — the bar, timeframe, zoom, account, trades and time spent — is saved every few seconds,
// when the page is hidden or closed, and when the replay is left. A replay under way can also be
// kept as a new session ("Save as backtest session" in the replay menu).

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useReplay } from "./ReplayContext";
import { engine, useEngineState } from "@/app/trading/store";
import { accountMetrics } from "@/app/trading/engine";
import {
  createSession, currentDrawings, freshAccount, getSession, updateSession, OPEN_SESSION_EVENT, setActiveSession, setDrawingSession, setSessionUi, spent,
  type BacktestSession, type SessionProgress,
} from "@/app/analytics/sessions";

const AUTOSAVE_MS = 15000;
type Phase = "idle" | "loading" | "waiting" | "starting" | "running";

export default function BacktestSessionBar({ symbol, interval, intervalLabel, onSymbol, onInterval }: {
  symbol: string; interval: string; intervalLabel: string; onSymbol: (s: string) => void; onInterval: (interval: string, label: string) => void;
}) {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const { mode, replayIndex, getReplayTime, stopReplay } = useReplay();
  const engineState = useEngineState();
  const [session, setSession] = useState<BacktestSession | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const sessionRef = useRef<BacktestSession | null>(null);
  sessionRef.current = session;
  const lastBarRef = useRef<number | null>(null);
  const snapRef = useRef<ReturnType<typeof engine.replaySnapshot>>(null);
  const countedRef = useRef<number>(Date.now());     // time spent is counted from here (while visible)
  const statusRef = useRef<"paused" | "completed">("paused");
  const live = useRef({ symbol, interval, intervalLabel });
  live.current = { symbol, interval, intervalLabel };

  useEffect(() => { setActiveSession(session && phase === "running" ? session.id : null); }, [session, phase]);
  // The chart shows (and draws into) the session's own drawings from the moment it opens
  useEffect(() => { setDrawingSession(session && phase !== "idle" ? session.id : null); }, [session, phase]);
  useEffect(() => () => { setActiveSession(null); setDrawingSession(null); }, []);

  // Where the replay is, and its account, kept as they change (they're gone once the replay ends)
  useEffect(() => { if (mode === "active") { const t = getReplayTime(); if (t !== null) lastBarRef.current = t; } }, [mode, replayIndex, getReplayTime]);
  useEffect(() => engine.subscribe(() => { if (engine.inReplay()) snapRef.current = engine.replaySnapshot(); }), []);

  const progress = useCallback((extra: SessionProgress = {}): SessionProgress => {
    const now = Date.now();
    const add = document.visibilityState === "visible" ? Math.round((now - countedRef.current) / 1000) : 0;
    countedRef.current = now;
    const vb = (window as any).__chartVisibleBars?.();
    return {
      ...(lastBarRef.current ? { current_time: lastBarRef.current } : {}),
      interval: live.current.interval, interval_label: live.current.intervalLabel,
      ...(typeof vb === "number" && vb > 0 ? { visible_bars: vb } : {}),
      ...(snapRef.current ? { account: snapRef.current.account, book: snapRef.current.book } : {}),
      add_time_spent: add, ...extra,
    };
  }, []);

  const save = useCallback(async (extra: SessionProgress = {}, keepalive = false) => {
    const s = sessionRef.current;
    if (!uid || !s) return;
    setSaving(true);
    try {
      const updated = await updateSession(uid, s.id, progress(extra), keepalive);
      if (updated && sessionRef.current?.id === s.id) setSession(prev => (prev ? { ...prev, ...updated, account: undefined, book: undefined } : prev));
      setSavedAt(Date.now());
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't save the session");
    } finally { setSaving(false); }
  }, [uid, progress]);

  // ---- opening one
  const open = useCallback(async (id: number) => {
    if (!uid) return;
    if (sessionRef.current && phase === "running") await save();
    setPhase("loading");
    setError(null);
    try {
      const s = await getSession(uid, id);
      if (mode !== "idle") stopReplay();
      lastBarRef.current = s.current_time;
      snapRef.current = null;
      setSession(s);
      setPhase("waiting");
      if (live.current.symbol !== s.symbol) onSymbol(s.symbol);
      if (live.current.interval !== s.interval) onInterval(s.interval, s.interval_label || s.interval);
    } catch (e: any) {
      setPhase("idle");
      setError(e?.message || "Couldn't open the session");
    }
  }, [uid, mode, phase, save, stopReplay, onSymbol, onInterval]);

  // From the address (/?session=<id>) once signed in, and from the replay menu / Analytics
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (!uid || openedFromUrl.current) return;
    const id = Number(new URLSearchParams(window.location.search).get("session"));
    if (id > 0) { openedFromUrl.current = true; open(id); }
  }, [uid, open]);
  useEffect(() => {
    const onOpen = (e: Event) => { const id = (e as CustomEvent).detail?.id; if (id) open(id); };
    window.addEventListener(OPEN_SESSION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SESSION_EVENT, onOpen);
  }, [open]);

  // Once the chart has the session's bars: replay from its bar, in its own account
  useEffect(() => {
    if (phase !== "waiting" || !session) return;
    const timer = setInterval(() => {
      const w = window as any;
      if (mode === "active" || w.__chartDataKey !== `${session.symbol}|${session.interval}` || !(w.__chartFullData?.length > 0)) return;
      clearInterval(timer);
      engine.seedReplaySession({ account: session.account || freshAccount(`Backtest · ${session.name}`, session.initial_balance), book: (session.book || {}) as any });
      setPhase("starting");
      window.dispatchEvent(new CustomEvent("tv:replay-start", { detail: { kind: "saved", at: session.current_time, visibleBars: session.visible_bars || undefined } }));
    }, 400);
    return () => clearInterval(timer);
  }, [phase, session, mode]);
  useEffect(() => {
    if (phase === "starting" && mode === "active") {
      setPhase("running");
      countedRef.current = Date.now();
      statusRef.current = "paused";
      if (session?.status !== "active") save({ status: "active" });
      return;
    }
    if (phase !== "starting") return;
    // The replay didn't start (e.g. that history couldn't be fetched): don't leave the account waiting
    const t = setTimeout(() => { engine.seedReplaySession(null); setPhase("idle"); setError("The replay couldn't start at the session's bar. Try again in a minute."); }, 25000);
    return () => clearTimeout(t);
  }, [phase, mode, session, save]);

  // ---- while it runs: autosave, and save when the page is hidden or closed
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => save(), AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") save({}, true);
      else countedRef.current = Date.now();   // time away isn't counted
    };
    const onLeavePage = () => save({}, true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeavePage);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onLeavePage); };
  }, [phase, save]);

  // Leaving the replay (Exit, Replay, another bar, another symbol) ends it here, saved
  useEffect(() => {
    if (phase === "running" && mode !== "active") {
      save({ status: statusRef.current }).finally(() => {
        setPhase("idle");
        setSession(null);
        const u = new URL(window.location.href);
        if (u.searchParams.has("session")) { u.searchParams.delete("session"); window.history.replaceState(null, "", u.toString()); }
      });
    }
  }, [mode, phase, save]);

  // ---- a replay under way, kept as a new session
  useEffect(() => {
    const onSaveAs = async () => {
      if (!uid || mode !== "active" || sessionRef.current) return;
      const at = getReplayTime();
      const snap = engine.replaySnapshot();
      if (at === null) return;
      try {
        const vb = (window as any).__chartVisibleBars?.();
        const s = await createSession(uid, {
          name: `${live.current.symbol} ${live.current.intervalLabel} backtest`, symbol: live.current.symbol, interval: live.current.interval,
          interval_label: live.current.intervalLabel, start_time: at, current_time: at, initial_balance: snap?.account.initialBalance || 10000,
          ...(snap ? { account: snap.account, book: snap.book } : {}), visible_bars: typeof vb === "number" ? vb : null,
          drawings: currentDrawings(),   // what's drawn so far carries into the session
        });
        lastBarRef.current = at;
        snapRef.current = snap;
        countedRef.current = Date.now();
        statusRef.current = "paused";
        setSession(s);
        setPhase("running");
        setSavedAt(Date.now());
        const u = new URL(window.location.href);
        u.searchParams.set("session", String(s.id));
        window.history.replaceState(null, "", u.toString());
      } catch (e: any) { setError(e?.message || "Couldn't save the session"); }
    };
    window.addEventListener("tv:save-replay-as-session", onSaveAs);
    return () => window.removeEventListener("tv:save-replay-as-session", onSaveAs);
  }, [uid, mode, getReplayTime]);

  // While it runs, the replay bar shows it (ReplayBar → SessionChip); this bar only while opening, or for an error
  const acc0 = engineState.accounts[0];
  const runM = phase === "running" && engine.inReplay() && acc0 ? accountMetrics(engineState, acc0.id) : null;
  const savedText = saving ? "Saving…" : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "";
  useEffect(() => {
    if (phase !== "running" || !session) { setSessionUi(null); return; }
    setSessionUi({
      id: session.id, name: session.name, equity: runM?.equity ?? session.balance, pnl: (runM?.equity ?? session.balance) - session.initial_balance,
      spent: spent(session.time_spent), saved: savedText, error,
      save: () => save(), complete: () => { statusRef.current = "completed"; stopReplay(); },
    });
  }, [phase, session, runM?.equity, savedText, error, save, stopReplay]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setSessionUi(null), []);

  if (!session && !error) return null;
  if (session && phase === "running") return null;
  if (!session && error) {
    return (
      <div role="alert" style={barStyle} data-testid="bt-session-error">
        <Badge /> <span style={{ color: "#f23645" }}>{error}</span>
        <button style={btn} onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }
  const s = session!;
  return (
    <div style={barStyle} data-testid="bt-session-bar">
      <Badge />
      <span style={{ fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.name}>{s.name}</span>
      <span style={{ color: "var(--tv-legend-args)" }}>{phase === "waiting" ? `Loading ${s.symbol}…` : "Opening…"}</span>
    </div>
  );
}
const barStyle: React.CSSProperties = {
  position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)", zIndex: 60, display: "flex", alignItems: "center", gap: 10,
  padding: "6px 8px 6px 6px", borderRadius: 10, background: "var(--tv-color-pane-bg, #fff)", color: "var(--tv-hdr-text, #131722)",
  border: "1px solid var(--tv-color-border, #e0e3eb)", boxShadow: "0 4px 18px rgba(0,0,0,0.18)", fontSize: 13, whiteSpace: "nowrap", maxWidth: "calc(100vw - 32px)",
};
const btn: React.CSSProperties = {
  height: 26, padding: "0 10px", borderRadius: 6, border: "1px solid var(--tv-color-border, #e0e3eb)", background: "transparent",
  color: "inherit", cursor: "pointer", fontSize: 12, fontFamily: "inherit", display: "inline-flex", alignItems: "center",
};
const Badge = () => (
  <span style={{ padding: "3px 8px", borderRadius: 6, background: "linear-gradient(90deg,#7c3aed,#4f46e5)", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>
    BACKTEST SESSION
  </span>
);
