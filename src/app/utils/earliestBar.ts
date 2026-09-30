"use client";

// The first bar the data provider has for a symbol/interval — what replay's "First available
// date" jumps to, the bottom of "Random bar"'s range and the first enabled day in the replay
// date dialog. It never changes, so it's cached (one request per symbol and interval).

const KEY = "tv:earliestBar:";
const inflight = new Map<string, Promise<number | null>>();

// Bar times are chart times: daily and longer bars sit at UTC midnight of their date, intraday
// bars at their exchange-local wall time read as local (see fetchStockData)
function toChartSeconds(datetime: string): number {
  return Math.floor(new Date(datetime).getTime() / 1000);
}

export function getEarliestBarTime(symbol: string, interval: string): Promise<number | null> {
  const id = `${symbol}|${interval}`;
  try {
    const cached = localStorage.getItem(KEY + id);
    if (cached) {
      const v = Number(cached);
      if (isFinite(v)) return Promise.resolve(v);
    }
  } catch { /* ignore */ }
  let pending = inflight.get(id);
  if (!pending) {
    pending = fetch(`/api/stock-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&earliest=1`)
      .then(r => r.json())
      .then(d => {
        if (!d || !d.datetime) return null;
        const t = toChartSeconds(d.datetime);
        if (!isFinite(t)) return null;
        try { localStorage.setItem(KEY + id, String(t)); } catch { /* ignore */ }
        return t;
      })
      .catch(() => null)
      .finally(() => { inflight.delete(id); });
    inflight.set(id, pending);
  }
  return pending;
}
