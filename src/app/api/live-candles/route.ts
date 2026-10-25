import { NextResponse } from 'next/server';
import { reportServerFailure } from '@/lib/requestTracker';

// 30-second candles for one symbol straight from the MT5→ClickHouse pipeline,
// shaped exactly like /api/stock-data's TwelveData {values, meta} response so
// the chart can consume it without a new code path.
//
// ?symbol=XAUUSD&interval=30s&limit=500
//
// When the backend/ClickHouse has no data yet (pipeline not running or empty),
// this returns an empty values array with meta.source = "empty" so the caller
// can silently fall back to its TwelveData source instead of showing a gap.
const BACKEND_BASE =
  (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const limit = searchParams.get("limit") || "500";
  const url = `${BACKEND_BASE}/api/users/live/candles/?symbol=${encodeURIComponent(symbol)}&limit=${encodeURIComponent(limit)}`;

  try {
    const resp = await fetch(url, { cache: "no-store" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      reportServerFailure({
        path: "/api/live-candles",
        method: "GET",
        status_code: resp.status,
        reason_code: "live_candles_upstream",
        reason_message: typeof data?.error === "string" ? data.error : "Django live-candles failed",
      });
      return NextResponse.json({ error: data?.error || "Live-candles endpoint error" }, { status: resp.status });
    }
    // Pass through the {values, meta} shape the chart already knows.
    return NextResponse.json(data);
  } catch (error: any) {
    reportServerFailure({
      path: "/api/live-candles",
      method: "GET",
      status_code: 502,
      reason_code: "live_candles_backend_unreachable",
      reason_message: error?.message || "Django backend unreachable",
    });
    return NextResponse.json({ error: "Live-candles backend unreachable", values: [], meta: { source: "empty" } }, { status: 502 });
  }
}
