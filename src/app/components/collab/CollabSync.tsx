"use client";

// Keeps this browser's chart and the collab room in step: the room's drawings, symbol,
// interval and indicators are applied here when anyone changes them, and this user's own
// changes are sent to the room. Also sends this user's crosshair and paper trades, and keeps the
// shared replay in step.

import { useEffect, useRef } from "react";
import { useDrawing, type BaseDrawing } from "../drawing/core/DrawingContext";
import { collab, useCollab, useCollabChartActive, type SharedPine, type TradeLine } from "../../lib/collab/session";
import { alertSymbolKey, conditionMet, desktopNotify, DEFAULT_NOTIFY, type AlertNotify } from "@/context/AlertsContext";
import { setCollabAlertWatchSymbols } from "../../trading/quoteFeed";
import { useReplay } from "../ReplayContext";
import "../../lib/collab/pineDoc";
import { engine } from "../../trading/store";
import { activeBook } from "../../trading/engine";
import { chartPane, logicalToTime } from "../../lib/collab/chartGeometry";

const syncable = (d: BaseDrawing) => d.type !== "measure";

function mergeById(list: BaseDrawing[], incoming: BaseDrawing[]): BaseDrawing[] {
  const at = new Map(list.map((d, i) => [d.id, i]));
  const out = [...list];
  for (const d of incoming) {
    const i = at.get(d.id);
    if (i === undefined) { at.set(d.id, out.length); out.push(d); } else out[i] = d;
  }
  return out;
}

// The drawings: diffed against what the room is known to hold, so only real local changes go
// out (a change that came from the room matches it and isn't sent back)
export function CollabDrawingSync() {
  const { drawings, applyRemoteDrawings, symbol } = useDrawing();
  const active = useCollabChartActive();
  const shadow = useRef(new Map<string, string>());
  const shadowSymbol = useRef<string | null>(null);
  const latest = useRef(drawings);
  latest.current = drawings;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const setShadow = (sym: string, list: BaseDrawing[]) => {
      shadowSymbol.current = sym;
      shadow.current = new Map(list.filter(syncable).map(d => [d.id, JSON.stringify(d)]));
    };
    // The room's drawings replace this symbol's, keeping any local measurements
    const replaceAll = (list: BaseDrawing[]) => (cur: BaseDrawing[]) => [...list, ...cur.filter(d => !syncable(d))];
    return collab.onChart(e => {
      if (e.type === "init") {
        setShadow(e.chart.symbol, e.chart.drawings || []);
        applyRemoteDrawings(replaceAll(e.chart.drawings || []), true);
      } else if (e.type === "chart") {
        if (e.symbol === shadowSymbol.current) return;   // only the interval changed
        setShadow(e.symbol, e.drawings || []);
        applyRemoteDrawings(replaceAll(e.drawings || []), true);
      } else if (e.type !== "indicators" && e.type !== "pine" && e.symbol === shadowSymbol.current) {
        if (e.type === "drawings.upsert") {
          e.drawings.forEach(d => shadow.current.set(d.id, JSON.stringify(d)));
          applyRemoteDrawings(list => mergeById(list, e.drawings));
        } else if (e.type === "drawings.delete") {
          const gone = new Set(e.ids);
          e.ids.forEach(id => shadow.current.delete(id));
          applyRemoteDrawings(list => list.filter(d => !gone.has(d.id)));
        } else if (e.type === "drawings.replace") {
          setShadow(e.symbol, e.drawings);
          applyRemoteDrawings(replaceAll(e.drawings));
        }
      }
    });
  }, [applyRemoteDrawings]);

  useEffect(() => {
    if (!active || timer.current) return;
    // Coalesced: a drag sends its latest position a few times a second, not every frame
    timer.current = setTimeout(() => {
      timer.current = null;
      const sym = shadowSymbol.current;
      if (!collab.live || !sym || symbolRef.current !== sym) return;   // mid symbol switch
      const list = latest.current.filter(syncable);
      if (!collab.canEdit) {
        // View only: put back what the room has
        const roomList = Array.from(shadow.current.values()).map(j => JSON.parse(j) as BaseDrawing);
        const same = list.length === roomList.length && list.every(d => shadow.current.get(d.id) === JSON.stringify(d));
        if (!same) applyRemoteDrawings(cur => [...roomList, ...cur.filter(d => !syncable(d))]);
        return;
      }
      const upserts: BaseDrawing[] = [];
      const seen = new Set<string>();
      for (const d of list) {
        seen.add(d.id);
        const json = JSON.stringify(d);
        if (shadow.current.get(d.id) !== json) { upserts.push(d); shadow.current.set(d.id, json); }
      }
      const deletes = Array.from(shadow.current.keys()).filter(id => !seen.has(id));
      deletes.forEach(id => shadow.current.delete(id));
      collab.sendDrawingsUpsert(sym, upserts);
      collab.sendDrawingsDelete(sym, deletes);
    }, 80);
  }, [drawings, active, applyRemoteDrawings]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return null;
}

// Symbol, interval and indicators: applied from the room, and sent when this user changes them.
// What the user had before joining comes back when they leave.
export function CollabChartSync({ symbol, interval, indicators, setSymbol, setInterval, setIndicators }: {
  symbol: string; interval: string; indicators: any[];
  setSymbol: (s: string) => void; setInterval: (i: string) => void; setIndicators: (list: any[]) => void;
}) {
  const active = useCollabChartActive();
  const remote = useRef<{ symbol: string; interval: string; indicators: string } | null>(null);
  const before = useRef<{ symbol: string; interval: string; indicators: any[] } | null>(null);
  const cur = useRef({ symbol, interval, indicators });
  cur.current = { symbol, interval, indicators };
  const setters = useRef({ setSymbol, setInterval, setIndicators });
  setters.current = { setSymbol, setInterval, setIndicators };

  useEffect(() => collab.onChart(e => {
    const s = setters.current;
    if (e.type === "init") {
      if (!before.current) before.current = { ...cur.current };
      remote.current = { symbol: e.chart.symbol, interval: e.chart.interval, indicators: JSON.stringify(e.chart.indicators || []) };
      if (e.chart.symbol !== cur.current.symbol) s.setSymbol(e.chart.symbol);
      if (e.chart.interval !== cur.current.interval) s.setInterval(e.chart.interval);
      s.setIndicators(e.chart.indicators || []);
    } else if (e.type === "chart" && remote.current) {
      remote.current = { ...remote.current, symbol: e.symbol, interval: e.interval };
      if (e.symbol !== cur.current.symbol) s.setSymbol(e.symbol);
      if (e.interval !== cur.current.interval) s.setInterval(e.interval);
    } else if (e.type === "indicators" && remote.current) {
      remote.current = { ...remote.current, indicators: JSON.stringify(e.indicators) };
      s.setIndicators(e.indicators);
    }
  }), []);

  // Leaving: back to this user's own chart
  useEffect(() => {
    if (active || !before.current) return;
    const b = before.current;
    before.current = null;
    remote.current = null;
    setters.current.setSymbol(b.symbol);
    setters.current.setInterval(b.interval);
    setters.current.setIndicators(b.indicators);
  }, [active]);

  useEffect(() => {
    const r = remote.current;
    if (!active || !r || !collab.live) return;
    if (symbol === r.symbol && interval === r.interval) return;
    if (!collab.canEdit) { setters.current.setSymbol(r.symbol); setters.current.setInterval(r.interval); return; }
    remote.current = { ...r, symbol, interval };
    collab.sendChart(symbol, interval);
  }, [symbol, interval, active]);

  useEffect(() => {
    const r = remote.current;
    if (!active || !r || !collab.live) return;
    const json = JSON.stringify(indicators);
    if (json === r.indicators) return;
    if (!collab.canEdit) { setters.current.setIndicators(JSON.parse(r.indicators)); return; }
    remote.current = { ...r, indicators: json };
    collab.sendIndicators(indicators);
  }, [indicators, active]);

  return null;
}

// This user's crosshair (bar time + price) and their paper-trading positions and working orders
// on the shared symbol, for everyone else's chart
export function CollabPresenceSync({ symbol }: { symbol: string }) {
  const active = useCollabChartActive();
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  // Followed on the window rather than through the chart's crosshair, which stops reporting
  // while a drawing tool has the mouse
  useEffect(() => {
    if (!active) return;
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let lastSent: { time: number | null; price: number | null } = { time: null, price: null };
    const send = (time: number | null, price: number | null) => {
      if (time === lastSent.time && price === lastSent.price) return;
      lastSent = { time, price };
      last = Date.now();
      collab.sendCursor(symbolRef.current, time, price);
    };
    const onMove = (e: PointerEvent) => {
      const pane = chartPane();
      const chart = (window as any).__chartInstance;
      const series = (window as any).__chartSeries;
      let time: number | null = null, price: number | null = null;
      if (pane && chart && series) {
        const x = e.clientX - pane.left, y = e.clientY - pane.top;
        if (x >= 0 && y >= 0 && x <= pane.width && y <= pane.height) {
          try {
            const logical = chart.timeScale().coordinateToLogical(x);
            time = logical != null ? logicalToTime(logical) : null;
            price = time != null ? series.coordinateToPrice(y) : null;
          } catch { time = null; price = null; }
        }
      }
      if (time == null || price == null) { time = null; price = null; }
      if (pending) clearTimeout(pending);
      const wait = 60 - (Date.now() - last);
      if (wait <= 0) send(time, price);
      else pending = setTimeout(() => send(time, price), wait);
    };
    window.addEventListener("pointermove", onMove, { passive: true, capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true } as any);
      if (pending) clearTimeout(pending);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let lastJson = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const push = () => {
      timer = null;
      const s = engine.getState();
      const sym = symbolRef.current;
      const lines: TradeLine[] = [];
      if (s.connected) {
        const book = activeBook(s);
        for (const p of book?.positions || []) {
          if (p.symbol === sym) lines.push({ kind: "position", side: p.side, qty: p.qty, price: p.avgPrice });
        }
        for (const o of book?.orders || []) {
          if (o.symbol !== sym || o.status !== "working") continue;
          const price = o.type === "stop" ? o.stopPrice : o.limitPrice ?? o.stopPrice;
          if (price != null && (o.type === "limit" || o.type === "stop")) lines.push({ kind: o.type, side: o.side, qty: o.qty, price });
        }
      }
      const json = JSON.stringify([sym, lines]);
      if (json === lastJson || !collab.live) return;
      lastJson = json;
      collab.sendTrades(sym, lines);
    };
    const schedule = () => { if (!timer) timer = setTimeout(push, 400); };
    const unsub = engine.subscribe(schedule);
    // After a reconnect the room no longer has them: send again
    let wasLive = collab.live;
    const unsubCollab = collab.subscribe(() => {
      if (collab.live && !wasLive) { lastJson = ""; schedule(); }
      wasLive = collab.live;
    });
    schedule();
    return () => { unsub(); unsubCollab(); if (timer) clearTimeout(timer); };
  }, [active, symbol]);

  return null;
}

// The shared replay. Whoever starts a replay (with replay permission) drives it: every bar they
// show, and play / pause / speed, go to the room. Everyone else follows: their chart enters
// replay at the same bar and moves with the driver. Someone can step out to replay on their own
// (leaving replay while following does that too) and rejoin later.
export function CollabReplaySync() {
  const { mode, replayIndex, isPlaying, replaySpeed, hasStarted, getReplayTime, seekToTime, stopReplay, setSpeed } = useReplay();
  const { replay, replayDetached, you, status } = useCollab();
  const live = status === "live";
  const isDriver = !!replay && replay.driver === you;
  const following = live && !!replay && !isDriver && !replayDetached;
  const startedAt = useRef(0);
  const prevMode = useRef(mode);
  const prevReplay = useRef(replay);

  // Leaving replay while following = stepping out of the shared one
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = mode;
    if (was !== "idle" && mode === "idle" && following && Date.now() - startedAt.current > 1500) collab.setReplayDetached(true);
  }, [mode, following]);

  // Driving: this chart's replay goes to everyone
  useEffect(() => {
    if (!live || following) return;
    const r = collab.get().replay;
    const mine = !!r && r.driver === collab.get().you;
    if (mode === "active" && hasStarted) {
      if (r && !mine && collab.get().replayDetached) return;   // replaying on my own
      if (!collab.canReplay) return;                            // no permission: a private replay
      const t = getReplayTime();
      if (t == null) return;
      if (!r || mine) collab.sendReplay(t, isPlaying, replaySpeed);
    } else if (mode === "idle" && mine) {
      collab.stopSharedReplay();
    }
  }, [live, following, mode, hasStarted, replayIndex, isPlaying, replaySpeed, getReplayTime]);

  // Following: start, move and stop with the driver
  useEffect(() => {
    const before = prevReplay.current;
    prevReplay.current = replay;
    if (!live) return;
    if (!replay) {
      // The shared replay ended: so does this chart's, if it was following it
      if (before && before.driver !== you && !replayDetached && mode !== "idle") stopReplay();
      return;
    }
    if (!following || collab.get().replayDetached) return;
    if (mode === "idle") {
      // Enter replay at the driver's bar (older history is fetched if it isn't loaded); tried
      // again after a while if the data provider was busy
      if (Date.now() - startedAt.current < 8000) return;
      startedAt.current = Date.now();
      window.dispatchEvent(new CustomEvent("tv:replay-start", { detail: { kind: "saved", at: replay.time } }));
      return;
    }
    if (mode === "active") {
      seekToTime(replay.time);
      if (replay.speed !== replaySpeed) setSpeed(replay.speed);
    }
  }, [live, replay, following, mode, you, replayDetached, replaySpeed, seekToTime, setSpeed, stopReplay]);

  return null;
}

const pineEvent = (pine: SharedPine | null) => window.dispatchEvent(new CustomEvent("tv:collab-pine", { detail: { pine } }));

// The Pine script on the shared chart: one added, re-set or removed by someone with edit access
// goes to everyone, whose charts run the same code on their own bars. The script the user had
// before joining comes back when they leave.
export function CollabPineSync() {
  const active = useCollabChartActive();
  const before = useRef<{ code: string; scriptName: string } | null | undefined>(undefined);
  const room = useRef<SharedPine | null>(null);

  useEffect(() => collab.onChart(e => {
    if (e.type === "init") {
      if (before.current === undefined) before.current = (window as any).__pineScript ?? null;
      room.current = e.chart.pine ?? null;
      pineEvent(room.current);
    } else if (e.type === "pine") {
      room.current = e.pine;
      pineEvent(e.pine);
    }
  }), []);

  useEffect(() => {
    if (active || before.current === undefined) return;
    const b = before.current;
    before.current = undefined;
    room.current = null;
    pineEvent(b ? { code: b.code, scriptName: b.scriptName, overrides: {}, colors: {}, capital: null } : null);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    // Without edit access the chart keeps the room's script
    const revert = () => pineEvent(room.current);
    const onRun = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.code || d.remote || !collab.live) return;
      if (!collab.canEdit) { revert(); return; }
      room.current = { code: d.code, scriptName: d.scriptName || "Script", overrides: {}, colors: {}, capital: null };
      collab.sendPine(room.current);
    };
    const onClear = (e: Event) => {
      if ((e as CustomEvent).detail?.remote || !collab.live) return;
      if (!collab.canEdit) { revert(); return; }
      room.current = null;
      collab.sendPine(null);
    };
    const onSettings = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!room.current || !collab.live) return;
      if (!collab.canEdit) { revert(); return; }
      room.current = { ...room.current, overrides: d.overrides || {}, colors: d.colors || {}, capital: typeof d.capital === "number" ? d.capital : null };
      collab.sendPine(room.current);
    };
    window.addEventListener("tv:run-pine-script", onRun);
    window.addEventListener("tv:clear-pine-script", onClear);
    window.addEventListener("tv:pine-settings-changed", onSettings);
    return () => {
      window.removeEventListener("tv:run-pine-script", onRun);
      window.removeEventListener("tv:clear-pine-script", onClear);
      window.removeEventListener("tv:pine-settings-changed", onSettings);
    };
  }, [active]);

  return null;
}

// Shared alerts: every open chart in the collab checks them against the prices it gets (the
// chart's ticks and the quote feed) and reports a hit; the room fires it once, for everyone,
// with a toast, the sound and desktop notification as each person last chose, and a line in
// the group chat.
export function CollabAlertsSync() {
  const { status, alerts } = useCollab();
  const live = status === "live";
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  useEffect(() => {
    setCollabAlertWatchSymbols(live ? Array.from(new Set(alerts.filter(a => a.status === "active").map(a => a.symbol))) : []);
  }, [live, alerts]);
  useEffect(() => () => setCollabAlertWatchSymbols([]), []);

  useEffect(() => {
    if (!live) return;
    const prices: Record<string, number> = {};
    const reported: Record<string, number> = {};
    const onPrice = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.symbol || typeof d.price !== "number" || !isFinite(d.price)) return;
      const key = alertSymbolKey(d.symbol);
      const prev = prices[key];
      prices[key] = d.price;
      const now = Date.now();
      for (const a of alertsRef.current) {
        if (a.status !== "active" || alertSymbolKey(a.symbol) !== key) continue;
        if (a.expiration && a.expiration < now) continue;
        if (reported[a.id] && now - reported[a.id] < 10000) continue;
        if (conditionMet(a.condition, a.value, prev, d.price)) {
          reported[a.id] = now;
          collab.reportAlertFired(a.id, d.price);
        }
      }
    };
    window.addEventListener("tv:live-price", onPrice);
    window.addEventListener("tv:chart-price", onPrice);
    return () => {
      window.removeEventListener("tv:live-price", onPrice);
      window.removeEventListener("tv:chart-price", onPrice);
    };
  }, [live]);

  useEffect(() => {
    const onFired = (e: Event) => {
      const { alert: a, price, time } = (e as CustomEvent).detail || {};
      if (!a) return;
      let notify: AlertNotify = DEFAULT_NOTIFY;
      try { notify = { ...DEFAULT_NOTIFY, ...JSON.parse(localStorage.getItem("tv:alert-notify") || "{}"), webhook: false }; } catch { /* the defaults */ }
      const message = a.message || `${a.symbol} ${a.condition} ${a.value}`;
      if (notify.app) desktopNotify(`Collab alert on ${a.symbol}`, `${message} (set by ${a.created_by_name})`);
      window.dispatchEvent(new CustomEvent("tv:alert-fired", {
        detail: {
          alert: { id: a.id, symbol: a.symbol, condition: a.condition, value: a.value, trigger: a.trigger, expiration: a.expiration || 0, message, createdAt: a.created_at, status: a.status, notify },
          logId: `collab-${a.id}-${time}`, time, price, sharedBy: a.created_by_name,
        },
      }));
    };
    window.addEventListener("tv:collab-alert-fired", onFired);
    return () => window.removeEventListener("tv:collab-alert-fired", onFired);
  }, []);

  return null;
}
