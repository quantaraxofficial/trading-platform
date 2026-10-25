import { NextResponse } from 'next/server';
import { reportServerFailure } from '@/lib/requestTracker';

// TwelveData natively supported intervals
const NATIVE_INTERVALS = new Set([
  '1min', '5min', '15min', '30min', '45min',
  '1h', '2h', '4h', '1day', '1week', '1month'
]);

// TwelveData's times are requested in UTC (timezone=UTC): read them as UTC, whatever the server's own zone
function utcMs(datetime: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(datetime) ? Date.parse(`${datetime}T00:00:00Z`) : Date.parse(`${datetime.replace(' ', 'T')}Z`);
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
function formatUtc(ms: number, dateOnly: boolean): string {
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return dateOnly ? date : `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// How a non-native interval is built: which native bars to fetch, how many of them make one bar,
// and the start of the bar each native bar falls in
interface Resample { base: string; perBar: number; dateOnly: boolean; bucketStart: (ms: number) => number }

const MINUTE_BASES: [string, number][] = [['4h', 240], ['2h', 120], ['1h', 60], ['45min', 45], ['30min', 30], ['15min', 15], ['5min', 5], ['1min', 1]];

function resampleFor(interval: string): Resample | null {
  const m = /^(\d+)(min|h|day|week|month)$/.exec(interval);
  if (!m || NATIVE_INTERVALS.has(interval)) return null;
  const n = parseInt(m[1], 10);
  if (!(n > 0)) return null;
  switch (m[2]) {
    case 'min':
    case 'h': {
      // From the longest native bar that divides it. Bars restart at each UTC midnight, as
      // TradingView's intraday bars restart each session (7m: 00:00, 00:07 … 23:52, then 00:00)
      const minutes = m[2] === 'h' ? n * 60 : n;
      const [base, baseMin] = MINUTE_BASES.find(([, b]) => minutes % b === 0)!;
      const len = minutes * 60_000;
      const bucketStart = minutes <= 1440
        ? (ms: number) => { const day = Math.floor(ms / DAY_MS) * DAY_MS; return day + Math.floor((ms - day) / len) * len; }
        : (ms: number) => Math.floor(ms / len) * len;
      return { base, perBar: minutes / baseMin, dateOnly: false, bucketStart };
    }
    case 'day':
      return { base: '1day', perBar: n, dateOnly: true, bucketStart: ms => Math.floor(ms / DAY_MS / n) * n * DAY_MS };
    case 'week': {
      // Weeks start on Monday (1970-01-05 was the first one)
      const monday = 4 * DAY_MS, len = 7 * n * DAY_MS;
      return { base: '1week', perBar: n, dateOnly: true, bucketStart: ms => monday + Math.floor((ms - monday) / len) * len };
    }
    case 'month':
      // Calendar months, counted from January (6M: Jan–Jun, Jul–Dec; 12M: the calendar year)
      return {
        base: '1month', perBar: n, dateOnly: true, bucketStart: ms => {
          const d = new Date(ms);
          const k = Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / n) * n;
          return Date.UTC(Math.floor(k / 12), k % 12, 1);
        },
      };
  }
  return null;
}

// Combines native bars (newest first, as TwelveData sends them) into the longer bars; prices keep
// the provider's own strings
function resample(values: any[], r: Resample): any[] {
  const out: any[] = [];
  let cur: any = null, curStart = NaN, high = 0, low = 0, volume = 0, hasVolume = false;
  const flush = () => {
    if (!cur) return;
    out.push({ ...cur, volume: hasVolume ? String(volume) : undefined });
  };
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    const start = r.bucketStart(utcMs(v.datetime));
    if (!Number.isFinite(start)) continue;
    const h = parseFloat(v.high), l = parseFloat(v.low);
    if (start !== curStart) {
      flush();
      curStart = start;
      cur = { datetime: formatUtc(start, r.dateOnly), open: v.open, high: v.high, low: v.low, close: v.close };
      high = h; low = l; volume = 0;
      // Forex/metals come without volume: keep it absent rather than a made-up 0
      hasVolume = false;
    } else {
      if (h > high) { high = h; cur.high = v.high; }
      if (l < low) { low = l; cur.low = v.low; }
      cur.close = v.close;
    }
    if (v.volume != null) { hasVolume = true; volume += parseFloat(v.volume) || 0; }
  }
  flush();
  return out.reverse();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'AAPL'; 
  const interval = searchParams.get('interval') || '1min';
  const endDate = searchParams.get('end_date');
  const startDate = searchParams.get('start_date');
  const outputsize = searchParams.get('outputsize') || '5000';
  const apikey = process.env.TWELVEDATA_API_KEY;

  if (!apikey) {
    reportServerFailure({ path: '/api/stock-data', method: 'GET', status_code: 500, reason_code: 'api_key_missing', reason_message: 'TwelveData API key not configured' });
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  // ?earliest=1: the first bar the provider has for this symbol (replay's "First available date",
  // "Random bar" and the date dialog's range). Custom intervals ask about the bars they're built from.
  if (searchParams.get('earliest')) {
    const base = resampleFor(interval)?.base ?? interval;
    try {
      const response = await fetch(`https://api.twelvedata.com/earliest_timestamp?symbol=${encodeURIComponent(symbol)}&interval=${base}&timezone=UTC&apikey=${apikey}`);
      const data = await response.json();
      if (data.status === 'error' || !data.datetime) {
        reportServerFailure({ path: '/api/stock-data', method: 'GET', status_code: 400, reason_code: 'twelve_data_error', reason_message: data.message || 'Earliest date unavailable' });
        return NextResponse.json({ error: data.message || 'Earliest date unavailable' }, { status: 400 });
      }
      return NextResponse.json({ datetime: data.datetime, unix_time: data.unix_time });
    } catch {
      reportServerFailure({ path: '/api/stock-data', method: 'GET', status_code: 500, reason_code: 'twelve_data_error', reason_message: 'Connection to TwelveData failed (earliest)' });
      return NextResponse.json({ error: 'Connection to TwelveData failed' }, { status: 500 });
    }
  }

  // A non-native interval ("7min", "3h", "2day", "3week", "6month"): built from native bars
  const r = resampleFor(interval);
  if (r) {
    // Enough native bars for the bars asked for, within what one request returns
    const rawSize = Math.min(Math.max(1, parseInt(outputsize) || 5000) * r.perBar, 5000);
    let url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${r.base}&timezone=UTC&apikey=${apikey}&outputsize=${rawSize}`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'error') {
        reportServerFailure({ path: '/api/stock-data', method: 'GET', status_code: 400, reason_code: 'twelve_data_error', reason_message: data.message });
        return NextResponse.json({ error: data.message }, { status: 400 });
      }

      if (!data.values || !Array.isArray(data.values)) {
        return NextResponse.json(data);
      }

      return NextResponse.json({
        meta: { ...data.meta, interval: `${interval} (from ${r.base})` },
        values: resample(data.values, r),
        status: 'ok',
      });
    } catch (error) {
      reportServerFailure({ path: '/api/stock-data', method: 'GET', status_code: 500, reason_code: 'twelve_data_error', reason_message: 'Connection to TwelveData failed (custom interval)' });
      return NextResponse.json({ error: 'Connection to TwelveData failed' }, { status: 500 });
    }
  }

  // Native interval — pass through directly
  let url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&timezone=UTC&apikey=${apikey}&outputsize=${outputsize}`;
  if (endDate) {
    url += `&end_date=${encodeURIComponent(endDate)}`;
  }
  if (startDate) {
    url += `&start_date=${encodeURIComponent(startDate)}`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'error') {
      reportServerFailure({ path: '/api/stock-data', method: 'GET', status_code: 400, reason_code: 'twelve_data_error', reason_message: data.message });
      return NextResponse.json({ error: data.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    reportServerFailure({ path: '/api/stock-data', method: 'GET', status_code: 500, reason_code: 'twelve_data_error', reason_message: 'Connection to TwelveData failed' });
    return NextResponse.json({ error: 'Connection to TwelveData failed' }, { status: 500 });
  }
}
