// Shared localStorage cache for fetched OHLC data, used by both
// ChartContainer (the main chart's own data) and the Pine engine's
// multi-timeframe fetcher (request.security()/request.security_lower_tf()
// data). Lives in its own module so those two don't need to import from
// each other just to share this.
export const CACHE_PREFIX = 'tv_data_';
const CACHE_TTL_LIVE = 5 * 60 * 1000;      // 5 min for today's data
const CACHE_TTL_HISTORICAL = 7 * 24 * 60 * 60 * 1000; // 7 days for historical
const CACHE_MAX_ENTRIES = 200;              // Max entries before eviction
// Bumped when the cached bar shape changes (v2: bars keep the feed's volume)
const CACHE_FORMAT = 2;

export function getCacheKey(symbol: string, interval: string, endDate?: string, startDate?: string): string {
  return `${CACHE_PREFIX}${symbol}|${interval}|${endDate || 'latest'}|${startDate || ''}`;
}

function isToday(dateStr?: string): boolean {
  if (!dateStr) return true; // "latest" is always today
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}

export function getCachedData(key: string, endDate?: string): any[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts, v } = JSON.parse(raw);
    if (v !== CACHE_FORMAT) { localStorage.removeItem(key); return null; }
    const age = Date.now() - ts;
    const ttl = isToday(endDate) ? CACHE_TTL_LIVE : CACHE_TTL_HISTORICAL;
    if (age > ttl) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setCachedData(key: string, data: any[]): void {
  try {
    // Evict oldest entries if approaching limit
    const allKeys: { key: string; ts: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        try {
          const { ts } = JSON.parse(localStorage.getItem(k) || '{}');
          allKeys.push({ key: k, ts: ts || 0 });
        } catch { allKeys.push({ key: k, ts: 0 }); }
      }
    }
    if (allKeys.length >= CACHE_MAX_ENTRIES) {
      allKeys.sort((a, b) => a.ts - b.ts);
      const toRemove = allKeys.slice(0, Math.floor(CACHE_MAX_ENTRIES * 0.3));
      toRemove.forEach(e => localStorage.removeItem(e.key));
    }
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now(), v: CACHE_FORMAT }));
  } catch (e) {
    // Storage full — clear oldest cache entries and retry once
    console.warn('[Cache] localStorage full, evicting old entries');
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
    try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now(), v: CACHE_FORMAT })); } catch {}
  }
}
