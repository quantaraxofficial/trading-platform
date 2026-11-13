// Intraday bars that don't fit evenly into 4 hours (45m, 50m, 90m… — up to 2 hours) restart at each
// 4-hour boundary, as on the live site: a 4-hour candle's own window holds whole bars and then a short
// one up to its end (45m: five, then 15 minutes), so they never cross a 4-hour candle's edge and its
// high and low are always theirs. The 4-hour boundaries are TwelveData's (UTC 00:00, 04:00, …), and so
// are the chart's times (UTC seconds). Used by /api/stock-data (building such bars) and the chart (the
// live bar, the countdown).

export const BLOCK = 4 * 3600;

// An interval's length in seconds (minutes / hours only)
export function intradaySeconds(interval: string): number | null {
  const m = /^(\d+)(min|h)$/.exec(interval || "");
  if (!m) return null;
  return +m[1] * (m[2] === "min" ? 60 : 3600);
}

export const inBlocks = (secs: number | null): boolean => !!secs && secs <= 7200 && BLOCK % secs !== 0;

// The start (unix s) of the bar a moment belongs to
export function blockBarStart(secs: number, t: number): number {
  const block = Math.floor(t / BLOCK) * BLOCK;
  return block + Math.floor((t - block) / secs) * secs;
}

// When the bar starting at `barTime` ends: its length, or sooner for the short bar before a 4-hour boundary
export function barEnd(interval: string, barTime: number): number | null {
  const secs = intradaySeconds(interval);
  if (!secs) return null;
  if (!inBlocks(secs)) return barTime + secs;
  return Math.min(barTime + secs, (Math.floor(barTime / BLOCK) + 1) * BLOCK);
}
