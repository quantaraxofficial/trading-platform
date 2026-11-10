// The main chart's bars, for code outside the chart (the voice assistant's analysis): the bars it
// shows, cut at the replay bar during a replay, so index i is the chart's logical bar i. The chart
// (ChartContainer) registers the getter.

export type ChartBar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

let getter: (() => ChartBar[]) | null = null;
export function registerChartBars(get: (() => ChartBar[]) | null) { getter = get; }
export function getChartBars(): ChartBar[] {
  try { return (getter?.() ?? []).filter(b => b && typeof b.high === "number" && typeof b.low === "number"); } catch { return []; }
}

// The chart's symbol and timeframe ("XAU/USD", "15min"), registered by the chart alongside its bars
let infoGetter: (() => { symbol: string; interval: string }) | null = null;
export function registerChartInfo(get: (() => { symbol: string; interval: string }) | null) { infoGetter = get; }
export function getChartInfo(): { symbol: string; interval: string } | null {
  try { return infoGetter?.() ?? null; } catch { return null; }
}
