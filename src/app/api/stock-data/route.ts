import { NextResponse } from 'next/server';

// TwelveData natively supported intervals
const NATIVE_INTERVALS = new Set([
  '1min', '5min', '15min', '30min', '45min',
  '1h', '2h', '4h', '1day', '1week', '1month'
]);

// Aggregate 1min candles into N-minute candles
function aggregateCandles(values: any[], minutes: number): any[] {
  if (!values || values.length === 0) return [];

  // Values come from TwelveData in descending order (newest first)
  // We need ascending order for grouping, then reverse back
  const ascending = [...values].reverse();

  const aggregated: any[] = [];
  let i = 0;

  while (i < ascending.length) {
    const bucketStart = new Date(ascending[i].datetime).getTime();
    // Align to N-minute boundary
    const alignedStart = Math.floor(bucketStart / (minutes * 60 * 1000)) * (minutes * 60 * 1000);
    const bucketEnd = alignedStart + minutes * 60 * 1000;

    let open = parseFloat(ascending[i].open);
    let high = parseFloat(ascending[i].high);
    let low = parseFloat(ascending[i].low);
    let close = parseFloat(ascending[i].close);
    let volume = parseFloat(ascending[i].volume || '0');
    // Forex/metals come without volume: keep it absent rather than a made-up 0
    let hasVolume = ascending[i].volume != null;
    const datetime = ascending[i].datetime;

    i++;

    while (i < ascending.length) {
      const t = new Date(ascending[i].datetime).getTime();
      if (t >= bucketEnd) break;

      const h = parseFloat(ascending[i].high);
      const l = parseFloat(ascending[i].low);
      const c = parseFloat(ascending[i].close);
      const v = parseFloat(ascending[i].volume || '0');
      if (ascending[i].volume != null) hasVolume = true;

      if (h > high) high = h;
      if (l < low) low = l;
      close = c;
      volume += v;
      i++;
    }

    aggregated.push({
      datetime,
      open: open.toFixed(5),
      high: high.toFixed(5),
      low: low.toFixed(5),
      close: close.toFixed(5),
      volume: hasVolume ? volume.toString() : undefined,
    });
  }

  // Return in descending order (newest first) to match TwelveData format
  return aggregated.reverse();
}

// Aggregate daily candles into N-calendar-month candles (for custom "3month", "6month", "12month" etc.)
function aggregateCandlesByMonths(values: any[], monthsPerBucket: number): any[] {
  if (!values || values.length === 0) return [];

  const ascending = [...values].reverse();
  const aggregated: any[] = [];
  let i = 0;

  const bucketKey = (d: Date) => Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / monthsPerBucket);

  while (i < ascending.length) {
    const startKey = bucketKey(new Date(ascending[i].datetime));

    let open = parseFloat(ascending[i].open);
    let high = parseFloat(ascending[i].high);
    let low = parseFloat(ascending[i].low);
    let close = parseFloat(ascending[i].close);
    let volume = parseFloat(ascending[i].volume || '0');
    // Forex/metals come without volume: keep it absent rather than a made-up 0
    let hasVolume = ascending[i].volume != null;
    const datetime = ascending[i].datetime;

    i++;

    while (i < ascending.length && bucketKey(new Date(ascending[i].datetime)) === startKey) {
      const h = parseFloat(ascending[i].high);
      const l = parseFloat(ascending[i].low);
      const c = parseFloat(ascending[i].close);
      const v = parseFloat(ascending[i].volume || '0');
      if (ascending[i].volume != null) hasVolume = true;

      if (h > high) high = h;
      if (l < low) low = l;
      close = c;
      volume += v;
      i++;
    }

    aggregated.push({
      datetime,
      open: open.toFixed(5),
      high: high.toFixed(5),
      low: low.toFixed(5),
      close: close.toFixed(5),
      volume: hasVolume ? volume.toString() : undefined,
    });
  }

  return aggregated.reverse();
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
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  // ?earliest=1: the first bar the provider has for this symbol (replay's "First available date",
  // "Random bar" and the date dialog's range). Custom intervals are built from 1min / 1day bars.
  if (searchParams.get('earliest')) {
    const base = NATIVE_INTERVALS.has(interval) ? interval : /month/.test(interval) ? '1day' : '1min';
    try {
      const response = await fetch(`https://api.twelvedata.com/earliest_timestamp?symbol=${encodeURIComponent(symbol)}&interval=${base}&apikey=${apikey}`);
      const data = await response.json();
      if (data.status === 'error' || !data.datetime) {
        return NextResponse.json({ error: data.message || 'Earliest date unavailable' }, { status: 400 });
      }
      return NextResponse.json({ datetime: data.datetime, unix_time: data.unix_time });
    } catch {
      return NextResponse.json({ error: 'Connection to TwelveData failed' }, { status: 500 });
    }
  }

  // Check if this is a custom (non-native) interval like "4min", "7min", "3h", etc.
  const customMinMatch = interval.match(/^(\d+)min$/);
  const customHourMatch = interval.match(/^(\d+)h$/);
  const isCustomMinuteBased = (customMinMatch || customHourMatch) && !NATIVE_INTERVALS.has(interval);

  if (isCustomMinuteBased) {
    const customMinutes = customMinMatch
      ? parseInt(customMinMatch[1], 10)
      : parseInt(customHourMatch![1], 10) * 60;
    // Fetch more 1min candles to produce enough aggregated candles
    // We need roughly outputsize * customMinutes raw candles
    const rawSize = Math.min(parseInt(outputsize) * customMinutes, 5000);

    let url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1min&apikey=${apikey}&outputsize=${rawSize}`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'error') {
        return NextResponse.json({ error: data.message }, { status: 400 });
      }

      if (!data.values || !Array.isArray(data.values)) {
        return NextResponse.json(data);
      }

      const aggregatedValues = aggregateCandles(data.values, customMinutes);

      return NextResponse.json({
        meta: { ...data.meta, interval: `${customMinutes}min (custom)` },
        values: aggregatedValues,
        status: 'ok',
      });
    } catch (error) {
      return NextResponse.json({ error: 'Connection to TwelveData failed' }, { status: 500 });
    }
  }

  // Custom multi-month interval like "3month", "6month", "12month" — built from daily candles
  const customMonthMatch = interval.match(/^(\d+)month$/);
  const isCustomMonth = customMonthMatch && !NATIVE_INTERVALS.has(interval);

  if (isCustomMonth) {
    const monthsPerBucket = parseInt(customMonthMatch![1], 10);

    let url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&apikey=${apikey}&outputsize=5000`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'error') {
        return NextResponse.json({ error: data.message }, { status: 400 });
      }

      if (!data.values || !Array.isArray(data.values)) {
        return NextResponse.json(data);
      }

      const aggregatedValues = aggregateCandlesByMonths(data.values, monthsPerBucket);

      return NextResponse.json({
        meta: { ...data.meta, interval: `${monthsPerBucket}month (custom)` },
        values: aggregatedValues,
        status: 'ok',
      });
    } catch (error) {
      return NextResponse.json({ error: 'Connection to TwelveData failed' }, { status: 500 });
    }
  }

  // Native interval — pass through directly
  let url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&apikey=${apikey}&outputsize=${outputsize}`;
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
      return NextResponse.json({ error: data.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Connection to TwelveData failed' }, { status: 500 });
  }
}
