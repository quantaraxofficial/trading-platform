import { NextResponse } from 'next/server';
import { reportServerFailure } from '@/lib/requestTracker';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'AAPL';
  const apikey = process.env.TWELVEDATA_API_KEY;

  if (!apikey) {
    reportServerFailure({ path: '/api/quote', method: 'GET', status_code: 500, reason_code: 'api_key_missing', reason_message: 'TwelveData API key not configured' });
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apikey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'error' || data.code) {
      reportServerFailure({ path: '/api/quote', method: 'GET', status_code: 400, reason_code: 'twelve_data_error', reason_message: data.message || 'Quote unavailable' });
      return NextResponse.json({ error: data.message || 'Quote unavailable' }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    reportServerFailure({ path: '/api/quote', method: 'GET', status_code: 500, reason_code: 'twelve_data_error', reason_message: 'Connection to TwelveData failed' });
    return NextResponse.json({ error: 'Connection to TwelveData failed' }, { status: 500 });
  }
}
