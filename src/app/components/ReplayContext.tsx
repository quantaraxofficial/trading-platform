"use client";

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { requireFeature, useAccess } from "@/lib/access";
import { LiveReplayFeed, liveReplaySupported, ticksFrom, type ReplayStep } from "../lib/replayLive";
import { getChartInfo } from "../lib/chartBars";

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ReplayMode = 'idle' | 'selecting' | 'active';
// TradingView's "Select starting point": pick a bar on the chart, a date, the first available
// bar, or a random bar. The replay bar's main button repeats the last one chosen.
export type ReplayStartMode = 'bar' | 'date' | 'first' | 'random';
const START_MODE_KEY = 'tv:replayStartMode';

interface ReplayContextType {
  mode: ReplayMode;
  isPlaying: boolean;
  replayIndex: number;
  replaySpeed: number;
  fullData: CandleData[];
  // Hover state (for the vertical line in select mode)
  hoverX: number | null;
  setHoverX: (x: number | null) => void;
  // Actions
  enterSelectMode: () => void;
  // `continuing`: the same replay on new bars (a new timeframe): its mode stays and nothing is asked
  startReplayAt: (index: number, data: CandleData[], series: any, chart: any, opts?: { continuing?: boolean }) => void;
  getReplayTime: () => number | null;
  stopReplay: (nextData?: CandleData[]) => void;
  togglePlay: () => void;
  stepBack: () => void;
  stepForward: () => void;
  skipToEnd: () => void;
  // Shows the replay up to the bar at or before this time (a collab's shared replay, followed
  // from whoever drives it); stops this chart's own playback
  seekToTime: (time: number) => void;
  setSpeed: (speed: number) => void;
  updateReplayData: (newData: CandleData[]) => void;
  reSelectBar: () => void;
  // Right-click while picking a bar: picking again during a replay goes back to that replay;
  // picking the first start point closes replay
  cancelSelect: () => void;
  startMode: ReplayStartMode;
  setStartMode: (m: ReplayStartMode) => void;
  // True once a replay has been started (until it's exited): Play and the other controls work
  hasStarted: boolean;
  // "Like the live market" (premium accounts, lib/replayLive): candles form as they did at the time,
  // at the market's pace (speed = × real time). `askLive`: the choice is being asked (a replay that
  // has just started); `liveLoading`: its data is on the way
  live: boolean;
  askLive: boolean;
  liveLoading: boolean;
  liveError: string | null;
  setLive: (on: boolean) => void;
  dismissAskLive: () => void;
}

// Replay speeds "like the live market": multiples of real time
export const LIVE_SPEEDS = [1, 2, 5, 10, 30, 60, 120, 300];
// …and bar by bar: bars per second
const LEGACY_SPEEDS = [10, 7, 5, 3, 1, 0.5, 0.3, 0.2, 0.1];

const ReplayContext = createContext<ReplayContextType | undefined>(undefined);

export function ReplayProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ReplayMode>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeedState] = useState(1);
  const [fullData, setFullData] = useState<CandleData[]>([]);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [startMode, setStartModeState] = useState<ReplayStartMode>('bar');
  const [hasStarted, setHasStarted] = useState(false);
  useEffect(() => {
    try {
      const m = localStorage.getItem(START_MODE_KEY);
      if (m === 'bar' || m === 'date' || m === 'first' || m === 'random') setStartModeState(m);
    } catch { /* ignore */ }
  }, []);
  const setStartMode = useCallback((m: ReplayStartMode) => {
    setStartModeState(m);
    try { localStorage.setItem(START_MODE_KEY, m); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    console.log("[Replay] ReplayProvider mounted and system is ready.");
  }, []);

  const seriesRef = useRef<any>(null);
  const chartRef = useRef<any>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayIndexRef = useRef(0);
  const fullDataRef = useRef<CandleData[]>([]);
  const speedRef = useRef(1);

  const stopInterval = () => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  };

  const applyDataUpToIndex = useCallback((index: number) => {
    if (!seriesRef.current || fullDataRef.current.length === 0) return;
    const slice = fullDataRef.current.slice(0, index + 1);
    seriesRef.current.setData(slice);
  }, []);

  // ---- "Like the live market" (lib/replayLive) ------------------------------------------------
  // The candle after the replay's last bar forms from the stored 15 / 30-second bars, step by step
  // at the market's pace: replayIndex stays the last *finished* bar (indicators and saved progress
  // never see the forming one's future), the forming candle is drawn on top, and each step's price
  // goes to replay paper trading (tv:replay-ticks, a frame's at a time)
  const { active: premium } = useAccess();
  const premiumRef = useRef(premium);
  premiumRef.current = premium;
  const [live, setLiveState] = useState(false);
  const liveRef = useRef(false);
  const [askLive, setAskLive] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const feedRef = useRef<LiveReplayFeed | null>(null);
  const clockRef = useRef(0);                                             // the replay's market time, unix s
  const formingRef = useRef<{ index: number; bar: CandleData } | null>(null);
  const LIVE_TICK_MS = 250;                                               // (four chart updates a second at most)
  const setLiveFlag = (on: boolean) => { liveRef.current = on; (window as any).__replayLive = on; setLiveState(on); };

  // The chart bar a moment falls in (the last one starting at or before it); -1 before the first
  const barAt = (t: number) => {
    const d = fullDataRef.current;
    if (!d.length || t < d[0].time) return -1;
    let lo = 0, hi = d.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (d[mid].time <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };
  // The forming candle finished: drawn as the stored bar, and counted as played
  const finishForming = () => {
    const f = formingRef.current;
    if (!f) return;
    formingRef.current = null;
    const bar = fullDataRef.current[f.index];
    if (bar && seriesRef.current) { try { seriesRef.current.update(bar); } catch { applyDataUpToIndex(f.index); } }
    replayIndexRef.current = f.index;
    setReplayIndex(f.index);
  };
  const playStep = (s: ReplayStep) => {
    const data = fullDataRef.current;
    const p = barAt(s.t);
    if (p < 0 || (p <= replayIndexRef.current && formingRef.current?.index !== p)) return;   // already played
    if (formingRef.current && formingRef.current.index !== p) finishForming();
    // bars with no stored steps in between (gaps in the data): shown whole
    for (let k = replayIndexRef.current + 1; k < p; k++) {
      try { seriesRef.current?.update(data[k]); } catch { /* redrawn below */ }
      replayIndexRef.current = k;
    }
    const f = formingRef.current;
    if (!f) formingRef.current = { index: p, bar: { time: data[p].time, open: s.p, high: s.p, low: s.p, close: s.p } };
    else { f.bar.high = Math.max(f.bar.high, s.p); f.bar.low = Math.min(f.bar.low, s.p); f.bar.close = s.p; }
    tickBatchRef.current.push({ price: s.p, time: s.t });
  };
  // (a frame's ticks go out together: tv:replay-ticks { ticks: [{ price, time }…] })
  const tickBatchRef = useRef<{ price: number; time: number }[]>([]);
  const flushTicks = () => {
    if (!tickBatchRef.current.length) return;
    const ticks = tickBatchRef.current.splice(0);
    window.dispatchEvent(new CustomEvent("tv:replay-ticks", { detail: { ticks } }));
  };
  const liveTick = () => {
    const feed = feedRef.current;
    if (!feed) return;
    let next = feed.steps[feed.i];
    if (!next) {
      if (feed.done) {
        // the present reached
        finishForming();
        stopInterval();
        setIsPlaying(false);
      } else if (!feed.busy) void feed.more();
      return;
    }
    clockRef.current += (LIVE_TICK_MS / 1000) * speedRef.current;
    // the market was closed (a weekend, a holiday, the daily break): straight on to when it opened
    if (next.t - clockRef.current > 120) clockRef.current = next.t;
    (window as any).__replayNow = clockRef.current;
    let played = false;
    while (next && next.t <= clockRef.current) { playStep(next); feed.i++; played = true; next = feed.steps[feed.i]; }
    flushTicks();
    if (played) {
      const f = formingRef.current;
      if (f && seriesRef.current) { try { seriesRef.current.update({ ...f.bar }); } catch { /* the series is being replaced */ } }
      setReplayIndex(replayIndexRef.current);
    }
    if (feed.remaining < 5000 && !feed.done && !feed.busy) void feed.more();
  };
  const liveTickRef = useRef(liveTick);
  liveTickRef.current = liveTick;
  // Puts the live replay just after bar `index`: the next candle forms from there
  const positionLive = async (index: number) => {
    const feed = feedRef.current;
    if (!feed) return;
    formingRef.current = null;
    const data = fullDataRef.current;
    const from = data[index + 1]?.time ?? (data[index]?.time ?? 0) + 1;
    clockRef.current = from;
    (window as any).__replayNow = from;
    setLiveLoading(true);
    try { await feed.seek(from); } catch { /* shown below */ } finally { setLiveLoading(false); }
  };

  // Back to a moment of the live replay on new bars: the ticks from the bar after `index` up to
  // `clock` are played at once into its forming candle, and the replay carries on from there
  const resumeLiveAt = async (index: number, clock: number) => {
    await positionLive(index);
    const feed = feedRef.current;
    if (!feed) return;
    while (feed.i < feed.steps.length && feed.steps[feed.i].t <= clock) { playStep(feed.steps[feed.i]); feed.i++; }
    flushTicks();
    clockRef.current = Math.max(clockRef.current, clock);
    (window as any).__replayNow = clockRef.current;
    const f = formingRef.current;
    if (f && seriesRef.current) { try { seriesRef.current.update({ ...f.bar }); } catch { /* being replaced */ } }
    setReplayIndex(replayIndexRef.current);
  };

  const startInterval = useCallback(() => {
    stopInterval();
    if (liveRef.current) {
      playIntervalRef.current = setInterval(() => liveTickRef.current(), LIVE_TICK_MS);
      return;
    }
    // Speed refers to "updates per second"
    const ms = Math.max(16, Math.round(1000 / speedRef.current));
    playIntervalRef.current = setInterval(() => {
      const next = replayIndexRef.current + 1;
      if (next >= fullDataRef.current.length) {
        console.log(`[Replay] Reached end of data at index ${next}`);
        stopInterval();
        setIsPlaying(false);
        return;
      }
      
      const nextCandle = fullDataRef.current[next];
      
      // Safety check: ensure nextCandle.time is valid and greater than the last applied bar
      // This prevents the "Cannot update oldest data" error in lightweight-charts
      const lastAppliedIndex = replayIndexRef.current;
      const lastCandle = fullDataRef.current[lastAppliedIndex];
      
      if (nextCandle.time <= lastCandle.time) {
        console.warn(`[Replay] Skipping bar at index ${next} due to non-increasing time: ${nextCandle.time} <= ${lastCandle.time}`);
        replayIndexRef.current = next;
        setReplayIndex(next);
        return;
      }

      replayIndexRef.current = next;
      setReplayIndex(next);
      
      if (seriesRef.current) {
        try {
          seriesRef.current.update(nextCandle);
        } catch (err) {
          console.error(`[Replay] Error updating series at index ${next}:`, err);
          // Fallback to setData if update fails for some reason
          applyDataUpToIndex(next);
        }
      }
    }, ms);
  }, [applyDataUpToIndex]);

  const reSelectBar = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
    // Go back to selecting mode but keep the current chart position intact
    // Don't restore full data — user sees the same rewound view while picking a new start point
    setMode('selecting');
  }, []);

  const cancelSelectRef = useRef<() => void>(() => {});

  const startReplayAt = useCallback((index: number, data: CandleData[], series: any, chart: any, opts?: { continuing?: boolean }) => {
    if (!requireFeature('replay')) return;   // (a saved replay or a collab's replay starts here directly)
    stopInterval();
    seriesRef.current = series;
    chartRef.current = chart;
    fullDataRef.current = data;
    setFullData(data);

    const clamped = Math.max(0, Math.min(data.length - 1, index));
    // Set at once (React's mode follows a render later): the chart's live ticks must not touch
    // the replay's bars in between — one appended today's candle after the replay's last bar
    (window as any).__replayActive = true;
    replayIndexRef.current = clamped;
    setReplayIndex(clamped);
    setMode('active');
    setHasStarted(true);
    setIsPlaying(false);
    formingRef.current = null;
    // The same replay on another timeframe: it stays as it was (live or bar by bar), unasked. Live,
    // the new timeframe's forming candle is built from the ticks up to the replay's moment
    if (opts?.continuing) {
      applyDataUpToIndex(clamped);
      setAskLive(false);
      if (liveRef.current && feedRef.current) void resumeLiveAt(clamped, clockRef.current);
      return;
    }
    feedRef.current = null;
    setLiveFlag(false);
    setLiveError(null);
    if (!LEGACY_SPEEDS.includes(speedRef.current)) { speedRef.current = 1; setReplaySpeedState(1); }
    applyDataUpToIndex(clamped);
    // Asked when there are ticks to replay from here (the replay "like the live market" is ticks only)
    setAskLive(false);
    const sym = getChartInfo()?.symbol || "";
    const from = data[clamped + 1]?.time;
    if (premiumRef.current && liveReplaySupported(sym) && from) {
      void ticksFrom(sym, from).then(next => { if (next !== null && next - from < 3600 && (window as any).__replayActive) setAskLive(true); });
    }
  }, [applyDataUpToIndex]);

  // `nextData`: the chart's data when it changed under the replay (a new timeframe or symbol), so
  // leaving replay shows that instead of the replay's copy of the old bars
  const stopReplay = useCallback((nextData?: CandleData[]) => {
    stopInterval();
    (window as any).__replayActive = false;
    formingRef.current = null;
    feedRef.current = null;
    setLiveFlag(false);
    setAskLive(false);
    setLiveError(null);
    if (Array.isArray(nextData)) { fullDataRef.current = nextData; setFullData(nextData); }
    setMode('idle');
    setHasStarted(false);
    setIsPlaying(false);
    setHoverX(null);
    if (seriesRef.current && fullDataRef.current.length > 0) {
      // Save current visible range before restoring full data
      let savedRange = null;
      if (chartRef.current) {
        try {
          savedRange = chartRef.current.timeScale().getVisibleLogicalRange();
        } catch (e) { /* ignore */ }
      }
      seriesRef.current.setData(fullDataRef.current);
      if (chartRef.current && savedRange) {
        // Restore the same visible position instead of fitting all content
        chartRef.current.timeScale().setVisibleLogicalRange(savedRange);
      }
    }
    setReplayIndex(0);
    replayIndexRef.current = 0;
  }, []);

  // The Replay button toggles: a second press leaves replay exactly like "Exit Replay",
  // keeping the chart where it is (fitting all content made it jump)
  cancelSelectRef.current = () => {
    if (hasStarted) { setHoverX(null); setMode('active'); }
    else stopReplay();
  };
  const cancelSelect = useCallback(() => cancelSelectRef.current(), []);

  const enterSelectMode = useCallback(() => {
    if (mode !== 'idle') { stopReplay(); return; }
    if (!requireFeature('replay')) return;   // (a subscription that's ended)
    setMode('selecting');
  }, [mode, stopReplay]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      if (prev) { stopInterval(); return false; }
      startInterval();
      return true;
    });
  }, [startInterval]);

  const stepBack = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
    formingRef.current = null;
    const next = Math.max(0, replayIndexRef.current - 1);
    replayIndexRef.current = next;
    setReplayIndex(next);
    applyDataUpToIndex(next);
    if (liveRef.current) void positionLive(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyDataUpToIndex]);

  const stepForward = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
    // live: the forming candle finishes at once (the next one forms from its end)
    if (liveRef.current && formingRef.current) {
      finishForming();
      void positionLive(replayIndexRef.current);
      return;
    }
    const next = Math.min(fullDataRef.current.length - 1, replayIndexRef.current + 1);
    replayIndexRef.current = next;
    setReplayIndex(next);
    applyDataUpToIndex(next);
    if (liveRef.current) void positionLive(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyDataUpToIndex]);

  const skipToEnd = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
    formingRef.current = null;
    const last = fullDataRef.current.length - 1;
    replayIndexRef.current = last;
    setReplayIndex(last);
    applyDataUpToIndex(last);
  }, [applyDataUpToIndex]);

  const seekToTime = useCallback((time: number) => {
    stopInterval();
    setIsPlaying(false);
    const data = fullDataRef.current;
    if (!data.length) return;
    let idx = 0;
    if (time >= data[0].time) {
      let lo = 0, hi = data.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (data[mid].time <= time) lo = mid; else hi = mid - 1;
      }
      idx = lo;
    }
    const cur = replayIndexRef.current;
    if (idx === cur && !formingRef.current) return;
    formingRef.current = null;
    replayIndexRef.current = idx;
    setReplayIndex(idx);
    if (liveRef.current) { applyDataUpToIndex(idx); void positionLive(idx); return; }
    // One bar on: add it (the chart keeps its scroll); otherwise redraw up to it
    if (idx === cur + 1 && seriesRef.current) {
      try { seriesRef.current.update(data[idx]); return; } catch { /* fall back to a redraw */ }
    }
    applyDataUpToIndex(idx);
  }, [applyDataUpToIndex]);

  const setSpeed = useCallback((speed: number) => {
    console.log(`[Replay] Speed changed to: ${speed}x`);
    speedRef.current = speed;
    setReplaySpeedState(speed);
    if (playIntervalRef.current) startInterval();
  }, [startInterval]);

  const updateReplayData = useCallback((newData: CandleData[]) => {
    if (mode === 'idle') return;
    
    // Calculate how many bars were added to the BEGINNING
    const oldFirstTime = fullDataRef.current.length > 0 ? fullDataRef.current[0].time : null;
    let shift = 0;
    if (oldFirstTime !== null) {
      const newIdx = newData.findIndex(d => d.time === oldFirstTime);
      if (newIdx > 0) shift = newIdx;
    }
    
    const wasPlaying = isPlaying;
    if (wasPlaying) stopInterval();

    console.log(`[Replay] Data expanded. Shifting index by ${shift}`);
    
    fullDataRef.current = newData;
    setFullData(newData);
    
    const newIndex = replayIndexRef.current + shift;
    if (formingRef.current) formingRef.current.index += shift;
    replayIndexRef.current = newIndex;
    setReplayIndex(newIndex);
    
    // Refresh chart series to include new historical data + current replay progress
    applyDataUpToIndex(newIndex);

    if (wasPlaying) startInterval();
  }, [mode, isPlaying, applyDataUpToIndex, startInterval]);

  // Live market on / off (the choice asked at the start, or the replay bar's switch)
  const setLive = useCallback(async (on: boolean) => {
    setAskLive(false);
    setLiveError(null);
    const wasPlaying = !!playIntervalRef.current;
    stopInterval();
    if (!on) {
      formingRef.current = null;
      feedRef.current = null;
      setLiveFlag(false);
      applyDataUpToIndex(replayIndexRef.current);
      if (!LEGACY_SPEEDS.includes(speedRef.current)) { speedRef.current = 1; setReplaySpeedState(1); }
      if (wasPlaying) startInterval();
      return;
    }
    const sym = getChartInfo()?.symbol || "";
    if (!premiumRef.current) { setLiveError("Replay like the live market is for premium accounts."); return; }
    if (!liveReplaySupported(sym)) { setLiveError("This symbol has no tick data: it replays bar by bar."); return; }
    feedRef.current = new LiveReplayFeed(sym);
    setLiveFlag(true);
    if (!LIVE_SPEEDS.includes(speedRef.current)) { speedRef.current = 10; setReplaySpeedState(10); }
    await positionLive(replayIndexRef.current);
    if (!feedRef.current?.steps.length) {
      const first = feedRef.current?.firstAfter ?? null;
      feedRef.current = null;
      setLiveFlag(false);
      setLiveError(first
        ? `No tick data at this point: tick-by-tick replay is available from ${new Date(first * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
        : "No tick data at this point: it replays bar by bar.");
      if (!LEGACY_SPEEDS.includes(speedRef.current)) { speedRef.current = 1; setReplaySpeedState(1); }
    }
    if (wasPlaying) startInterval();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyDataUpToIndex, startInterval]);
  const dismissAskLive = useCallback(() => setAskLive(false), []);
  // (a message about live replay goes after a while)
  useEffect(() => {
    if (!liveError) return;
    const id = setTimeout(() => setLiveError(null), 7000);
    return () => clearTimeout(id);
  }, [liveError]);

  // The replay's "now" (unix s), for what counts down to it (the news countdown on the time scale):
  // the live replay's clock, or bar by bar the end of the last bar shown
  useEffect(() => {
    if (mode !== 'active') { delete (window as any).__replayNow; return; }
    if (live) return;   // (the live clock sets it as it runs)
    const d = fullDataRef.current;
    const i = replayIndex;
    if (!d[i]) return;
    (window as any).__replayNow = d[i + 1]?.time ?? d[i].time + (i > 0 ? d[i].time - d[i - 1].time : 60);
  }, [mode, replayIndex, live]);

  const getReplayTime = useCallback(() => {
    if (fullDataRef.current.length > 0 && replayIndexRef.current >= 0 && replayIndexRef.current < fullDataRef.current.length) {
      return fullDataRef.current[replayIndexRef.current].time;
    }
    return null;
  }, []);

  return (
    <ReplayContext.Provider value={{
      mode, isPlaying, replayIndex, replaySpeed, fullData, hoverX, setHoverX,
      enterSelectMode, startReplayAt, getReplayTime, stopReplay, togglePlay,
      stepBack, stepForward, skipToEnd, seekToTime, setSpeed, updateReplayData, reSelectBar, cancelSelect,
      startMode, setStartMode, hasStarted,
      live, askLive, liveLoading, liveError, setLive, dismissAskLive,
    }}>
      {children}
    </ReplayContext.Provider>
  );
}

export function useReplay() {
  const ctx = useContext(ReplayContext);
  if (!ctx) throw new Error("useReplay must be used within ReplayProvider");
  return ctx;
}
