import { NextResponse } from 'next/server';
import { reportServerFailure } from '@/lib/requestTracker';

// Live last-price for a symbol, sourced from the MT5→ClickHouse pipeline via
// the Django /api/users/live/last-prices/ endpoint. The chart / watchlist /
// paper-trading poll this; it returns the most recent 30-second bar per symbol.
//
// ?symbols=XAUUSD,AAPL  — defaults to whatever the pipeline is collecting when
// omitted (the last-prices view falls back to the pipeline's symbol list).
//
// The Django base URL is overridable via NEXT_PUBLIC_BACKEND_URL so deployed
// builds point at the real server; otherwise it assumes Django on :8000.
const BACKEND_BASE =
  (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols');
  const qs = symbols ? `?symbols=${encodeURIComponent(symbols)}` : "";
  const url = `${BACKEND_BASE}/api/users/live/last-prices/${qs}`;

  try {
    const resp = await fetch(url, { cache: "no-store" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      reportServerFailure({
        path: "/api/live",
        method: "GET",
        status_code: resp.status,
        reason_code: "live_upstream",
        reason_message: typeof data?.error === "string" ? data.error : "Django live endpoint failed",
      });
      return NextResponse.json({ error: data?.error || "Live endpoint error" }, { status: resp.status });
    }
    // Normalize to the same shape the TwelveData /api/quote path produces
    // ({close, exchange, ...}) so the consuming quoteFeed code can treat them
    // uniformly. The `close` field of a 30-second bar is the last tick's price.
    const out: Record<string, any> = {};
    const serverTime = (data as any)._server_time || Math.floor(Date.now() / 1000);
    for (const [sym, v] of Object.entries(data as Record<string, any>)) {
      if (sym === "_server_time" || v === null || typeof v !== "object") continue;
      out[sym] = {
        symbol: sym,
        close: v.close,
        open: v.open,
        high: v.high,
        low: v.low,
        ticks: v.ticks,
        ts: v.ts,
        source: "mt5-clickhouse",
      };
    }
    out._server_time = serverTime;
    return NextResponse.json(out);
  } catch (error: any) {
    reportServerFailure({
      path: "/api/live",
      method: "GET",
      status_code: 502,
      reason_code: "live_backend_unreachable",
      reason_message: error?.message || "Django backend unreachable",
    });
    return NextResponse.json({ error: "Live backend unreachable" }, { status: 502 });
  }
}
