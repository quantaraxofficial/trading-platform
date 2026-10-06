import { barVolume } from "../utils/volume";
import { pineTfToAppInterval, type Bar as PineBar } from "./pineScriptEngine";
import { getCacheKey, getCachedData, setCachedData } from "./stockDataCache";
import { feedTimeToUnix } from "../utils/feedTime";

// Fetches real historical OHLC data for a timeframe OTHER than the one
// currently loaded on the chart, via the same /api/stock-data proxy
// ChartContainer itself uses — this is what backs a Pine script's
// request.security()/request.security_lower_tf() calls with genuine market
// data instead of approximating them from the primary series. Shared by
// PineEditorPanel (the initial run) and ChartContainer (re-running a
// strategy over a different backtest date range) so neither has to import
// the other just for this.
export async function fetchPineTimeframeData(pineTf: string, symbol: string): Promise<PineBar[]> {
  const appInterval = pineTfToAppInterval(pineTf);
  // Share ChartContainer's own localStorage cache (same key shape, same TTL)
  // so re-running a script doesn't re-fetch the same timeframe from the API
  // every click — the TwelveData free tier caps at 8 requests/minute, and a
  // script needing several timeframes can burn through that in one Run.
  const cacheKey = getCacheKey(symbol, appInterval);
  const cached = getCachedData(cacheKey);
  if (cached && cached.length > 0) return cached as PineBar[];
  try {
    const url = `/api/stock-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(appInterval)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error || !data.values || !Array.isArray(data.values)) return [];
    const bars: PineBar[] = data.values
      .map((item: any) => ({
        time: feedTimeToUnix(item.datetime),
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
        volume: barVolume(item),
      }))
      .reverse()
      // Matches the weekend-bar exclusion ChartContainer's own primary-series
      // backfill already applies: the market's genuinely closed all day
      // Saturday and most of Sunday, but a bar-generating feed can still hand
      // back a flat, unchanged "quote carried forward" placeholder for that
      // stretch. A script using this as its "previous day" (e.g. computing a
      // daily range for position sizing) sees a near-zero range and reacts
      // as if real trading happened — without this filter, a fixed-risk
      // qty = capital*risk% / (entry-stop distance) formula ends up wildly
      // oversized off a $0.20 range that was never real market movement.
      .filter((b) => { const day = new Date(b.time * 1000).getUTCDay(); return day !== 0 && day !== 6; });
    if (bars.length > 0) setCachedData(cacheKey, bars);
    return bars;
  } catch {
    return [];
  }
}
