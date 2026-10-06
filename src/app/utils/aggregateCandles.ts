/**
 * Client-side candle aggregation utility.
 * Aggregates 1-minute OHLC data into higher timeframe candles.
 */

export interface CandleData {
  time: number;   // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

// Intervals that can be built from 1m data
export const AGGREGATABLE_INTERVALS: Record<string, number> = {
  '5min':  5,
  '15min': 15,
  '30min': 30,
  '45min': 45,
  '1h':    60,
  '2h':    120,
  '3h':    180,
  '4h':    240,
};

/**
 * Aggregate sorted 1-minute candle data into N-minute candles.
 */
export function aggregateFromMinuteData(
  minuteData: CandleData[],
  targetMinutes: number
): CandleData[] {
  if (!minuteData || minuteData.length === 0 || targetMinutes <= 1) return minuteData;

  const bucketSizeSeconds = targetMinutes * 60;
  const result: CandleData[] = [];

  let i = 0;
  while (i < minuteData.length) {
    const candle = minuteData[i];
    const bucketStart = Math.floor(candle.time / bucketSizeSeconds) * bucketSizeSeconds;
    const bucketEnd = bucketStart + bucketSizeSeconds;

    let open = candle.open;
    let high = candle.high;
    let low = candle.low;
    let close = candle.close;
    const time = candle.time;

    i++;

    while (i < minuteData.length && minuteData[i].time < bucketEnd) {
      const c = minuteData[i];
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      close = c.close;
      i++;
    }

    result.push({ time, open, high, low, close });
  }

  return result;
}

// LocalStorage helpers for aggregated cache
const AGG_CACHE_PREFIX = 'tv_agg2_';   // (2: bar times are real UTC now)

export function getAggCacheKey(symbol: string, interval: string): string {
  return `${AGG_CACHE_PREFIX}${symbol}|${interval}`;
}

export function getAggCachedData(symbol: string, interval: string): CandleData[] | null {
  try {
    const key = getAggCacheKey(symbol, interval);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > 5 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setAggCachedData(symbol: string, interval: string, data: CandleData[]): void {
  try {
    const key = getAggCacheKey(symbol, interval);
    let merged = data;
    const existingRaw = localStorage.getItem(key);
    if (existingRaw) {
      try {
        const { data: existing } = JSON.parse(existingRaw);
        if (Array.isArray(existing) && existing.length > 0) {
          const map = new Map<number, CandleData>();
          existing.forEach((c: CandleData) => map.set(c.time, c));
          data.forEach((c: CandleData) => map.set(c.time, c));
          merged = Array.from(map.values()).sort((a, b) => a.time - b.time);
        }
      } catch { }
    }
    localStorage.setItem(key, JSON.stringify({ data: merged, ts: Date.now() }));
  } catch {
    console.warn('[AggCache] localStorage full, skipping cache write');
  }
}

export function precomputeAllTimeframes(symbol: string, minuteData: CandleData[]): void {
  setTimeout(() => {
    const start = performance.now();
    for (const [interval, minutes] of Object.entries(AGGREGATABLE_INTERVALS)) {
      const aggregated = aggregateFromMinuteData(minuteData, minutes);
      if (aggregated.length > 0) {
        setAggCachedData(symbol, interval, aggregated);
      }
    }
    console.log(`[AggCache] Pre-computed ${Object.keys(AGGREGATABLE_INTERVALS).length} timeframes for ${symbol} in ${(performance.now() - start).toFixed(1)}ms`);
  }, 100);
}
