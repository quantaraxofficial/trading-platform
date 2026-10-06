import { NextResponse } from 'next/server';

// Symbol search over the data provider (TwelveData's symbol_search, which also understands
// "xauusd" for XAU/USD or "eurusd" for EUR/USD). Results are cached for a while per query.

type Hit = { symbol: string; name: string; type: string; exchange: string; country?: string; currency?: string };
const cache = new Map<string, { at: number; hits: Hit[] }>();
const TTL = 10 * 60 * 1000;

// Listings the chart can't use (warrants etc.) are left out; primary listings come first
const SKIP = /warrant|structured product|right/i;
const RANK = (h: Hit) => (/^(NASDAQ|NYSE|NYSE ARCA|CBOE|AMEX)$/i.test(h.exchange) ? 0 : /COMMODITY|PHYSICAL CURRENCY|Binance|Coinbase/i.test(h.exchange) ? 0 : 1);

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ data: [] });
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ data: hit.hits });
  const apikey = process.env.TWELVEDATA_API_KEY;
  if (!apikey) return NextResponse.json({ data: [], error: 'No data provider key' });
  try {
    const r = await fetch(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(q)}&outputsize=30&apikey=${apikey}`);
    const d = await r.json();
    const seen = new Set<string>();
    const hits: Hit[] = (Array.isArray(d?.data) ? d.data : [])
      .filter((x: any) => x?.symbol && !SKIP.test(x.instrument_type || ''))
      .map((x: any) => ({ symbol: x.symbol, name: x.instrument_name || x.symbol, type: x.instrument_type || '', exchange: x.exchange || '', country: x.country, currency: x.currency }))
      .sort((a: Hit, b: Hit) => RANK(a) - RANK(b))
      // one row per symbol (its primary listing)
      .filter((h: Hit) => (seen.has(h.symbol) ? false : (seen.add(h.symbol), true)))
      .slice(0, 20);
    cache.set(key, { at: Date.now(), hits });
    return NextResponse.json({ data: hits });
  } catch {
    return NextResponse.json({ data: [], error: 'Search failed' });
  }
}
