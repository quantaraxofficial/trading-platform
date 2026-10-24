// Central sink for "a request the user made did not come back successfully".
//
// Two paths feed the Django admin's "Failed requests" table (core.models.FailedRequest):
//   1. Backend /api/users/* failures are recorded authoritatively by Django's
//      FailedRequestMiddleware (it has the real HTTP status + reason). We do NOT re-log
//      those here — that would be a duplicate of the same event.
//   2. Failures the middleware never sees — the Next.js /api/* data routes (TwelveData
//      proxy) and the cloud-sync raw-fetch misses — are reported by the browser/Node via
//      reportFailure() / reportServerFailure() below, which POST to /api/users/track-failure/.
//
// Both are fire-and-forget: never awaited, never retried, never throwing, one small POST,
// so a report can't block the user or lag the machine (per the no-PC-lag constraint).

const REPORT_URL =
  (typeof process !== "undefined" && process.env && process.env.BACKEND_URL
    ? process.env.BACKEND_URL.replace(/\/$/, "")
    : "http://localhost:8000") + "/api/users/track-failure/";

function sessionKeyOf(): string {
  try { return typeof localStorage !== "undefined" ? (localStorage.getItem("tv_session_key") || "") : ""; }
  catch { return ""; }
}

export interface FailureReport {
  path: string;          // e.g. /api/stock-data
  method?: string;       // GET / POST
  status_code?: number;  // the HTTP status the user saw
  reason_code: string;   // stable tag, e.g. "twelve_data_error", "cloud_sync_failed"
  reason_message?: string;
}

// Browser-side (cloudSync, any client code). Skips the whole call when the browser is offline.
export function reportFailure(r: FailureReport): void {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const key = sessionKeyOf();
    const url = key ? `${REPORT_URL}?session_key=${encodeURIComponent(key)}` : REPORT_URL;
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...r, source: "frontend" }),
    }).catch(() => { /* a failed report must not log itself recursively */ });
  } catch { /* ignore */ }
}

// Server-side (imported by Next.js route files, which run in Node with global fetch and no
// localStorage). No session query — the backend attributes user=None, which still records the
// path / status / reason for the admin.
export function reportServerFailure(r: FailureReport): void {
  try {
    void fetch(REPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...r, source: "frontend" }),
    }).catch(() => { /* ignore */ });
  } catch { /* ignore */ }
}
