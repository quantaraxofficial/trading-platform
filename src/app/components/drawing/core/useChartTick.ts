// src/app/components/drawing/core/useChartTick.ts
// ─────────────────────────────────────────────
// Shared hook: re-renders the calling component whenever the chart's time/price mapping
// changes (zoom, pan, price-scale moves, resize). With the series it rides the chart's own
// paint (see chartFrame), so drawings move in the same frame as the candles; without it,
// it falls back to range-change events.

import { useEffect, useState } from 'react';
import { subscribeChartFrame } from './chartFrame';

export function useChartTick(chart: any, series?: any) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!chart) return;
    const update = () => setTick(t => t + 1);
    if (series) return subscribeChartFrame(chart, series, update);
    chart.timeScale().subscribeVisibleLogicalRangeChange(update);
    chart.timeScale().subscribeVisibleTimeRangeChange(update);
    // The chart resized (its pixel mapping changed even if the visible range didn't)
    chart.timeScale().subscribeSizeChange(update);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(update);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(update);
      try { chart.timeScale().unsubscribeSizeChange(update); } catch { /* chart already removed */ }
    };
  }, [chart, series]);
}
