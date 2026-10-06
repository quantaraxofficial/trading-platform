// Bar times from the data feed. Every TwelveData request asks for UTC (timezone=UTC): left to
// itself the feed answers in each symbol's "exchange" time, which for gold / forex turned out to
// be Sydney time — the candles then sat hours away from where TradingView shows them. Bars are
// real UTC timestamps; the chart's timezone setting formats them for display.

// "2026-10-05 17:30:00" (UTC) or "2026-10-05" → unix seconds
export function feedTimeToUnix(datetime: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(datetime)) return Math.floor(Date.parse(`${datetime}T00:00:00Z`) / 1000);
  return Math.floor(Date.parse(`${datetime.replace(" ", "T")}Z`) / 1000);
}
