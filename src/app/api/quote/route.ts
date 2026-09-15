import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'AAPL';
  const apikey = process.env.TWELVEDATA_API_KEY;

  if (!apikey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apikey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'error' || data.code) {
      return NextResponse.json({ error: data.message || 'Quote unavailable' }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Connection to TwelveData failed' }, { status: 500 });
  }
}
