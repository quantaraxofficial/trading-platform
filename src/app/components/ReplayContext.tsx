"use client";

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ReplayMode = 'idle' | 'selecting' | 'active';

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
  startReplayAt: (index: number, data: CandleData[], series: any, chart: any) => void;
  getReplayTime: () => number | null;
  stopReplay: () => void;
  togglePlay: () => void;
  stepBack: () => void;
  stepForward: () => void;
  skipToEnd: () => void;
  setSpeed: (speed: number) => void;
  updateReplayData: (newData: CandleData[]) => void;
  reSelectBar: () => void;
}

const ReplayContext = createContext<ReplayContextType | undefined>(undefined);

export function ReplayProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ReplayMode>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeedState] = useState(1);
  const [fullData, setFullData] = useState<CandleData[]>([]);
  const [hoverX, setHoverX] = useState<number | null>(null);

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

  const startInterval = useCallback(() => {
    stopInterval();
    // Speed refers to "updates per second"
    const ms = Math.max(16, Math.round(1000 / speedRef.current));
    console.log(`[Replay] Starting interval with speed: ${speedRef.current}x (delay: ${ms}ms)`);
    
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

      console.log(`[Replay] Updating bar at index ${next}, time:`, nextCandle.time);
      
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

  const enterSelectMode = useCallback(() => {
    // Toggle off if already active
    if (mode !== 'idle') {
      stopInterval();
      setIsPlaying(false);
      setMode('idle');
      // Restore full data
      if (seriesRef.current && fullDataRef.current.length > 0) {
        seriesRef.current.setData(fullDataRef.current);
        if (chartRef.current) chartRef.current.timeScale().fitContent();
      }
      return;
    }
    setMode('selecting');
  }, [mode]);

  const reSelectBar = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
    // Go back to selecting mode but keep the current chart position intact
    // Don't restore full data — user sees the same rewound view while picking a new start point
    setMode('selecting');
  }, []);

  const startReplayAt = useCallback((index: number, data: CandleData[], series: any, chart: any) => {
    stopInterval();
    seriesRef.current = series;
    chartRef.current = chart;
    fullDataRef.current = data;
    setFullData(data);

    const clamped = Math.max(0, Math.min(data.length - 1, index));
    replayIndexRef.current = clamped;
    setReplayIndex(clamped);
    setMode('active');
    setIsPlaying(false);
    applyDataUpToIndex(clamped);
  }, [applyDataUpToIndex]);

  const stopReplay = useCallback(() => {
    stopInterval();
    setMode('idle');
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
    const next = Math.max(0, replayIndexRef.current - 1);
    replayIndexRef.current = next;
    setReplayIndex(next);
    applyDataUpToIndex(next);
  }, [applyDataUpToIndex]);

  const stepForward = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
    const next = Math.min(fullDataRef.current.length - 1, replayIndexRef.current + 1);
    replayIndexRef.current = next;
    setReplayIndex(next);
    applyDataUpToIndex(next);
  }, [applyDataUpToIndex]);

  const skipToEnd = useCallback(() => {
    stopInterval();
    setIsPlaying(false);
    const last = fullDataRef.current.length - 1;
    replayIndexRef.current = last;
    setReplayIndex(last);
    applyDataUpToIndex(last);
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
    replayIndexRef.current = newIndex;
    setReplayIndex(newIndex);
    
    // Refresh chart series to include new historical data + current replay progress
    applyDataUpToIndex(newIndex);

    if (wasPlaying) startInterval();
  }, [mode, isPlaying, applyDataUpToIndex, startInterval]);

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
      stepBack, stepForward, skipToEnd, setSpeed, updateReplayData, reSelectBar,
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
