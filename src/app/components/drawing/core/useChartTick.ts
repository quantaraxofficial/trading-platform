// src/app/components/drawing/core/useChartTick.ts
// ─────────────────────────────────────────────
// Shared hook: forces a Konva tool component to re-render
// every time the chart is zoomed or panned.
// Import and call this at the top of EVERY tool component.

import { useEffect, useState } from 'react';

export function useChartTick(chart: any) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!chart) return;
    const update = () => setTick(t => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(update);
    chart.timeScale().subscribeVisibleTimeRangeChange(update);
    // The chart resized (its pixel mapping changed even if the visible range didn't)
    chart.timeScale().subscribeSizeChange(update);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(update);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(update);
      try { chart.timeScale().unsubscribeSizeChange(update); } catch { /* chart already removed */ }
    };
  }, [chart]);
}