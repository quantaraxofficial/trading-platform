"use client";

// Freezes of the page in this browser (Django Admin → Site analytics: slow or down): a timer ticks
// every half second while the tab is visible; a tick that comes 1.5 s or more late means the page
// didn't respond for that long (a heavy chart, a slow phone…). Once a minute, if it froze for a
// second or more, it tells the server how long (the worst and the total), on which page. Signed in:
// with the session; signed out: the visitor's random id (lib/visitor). Almost free: no animation loop.
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { BACKEND_URL, backendFetch } from "@/lib/backend";
import { visitorId } from "@/lib/visitor";

const TICK = 500;

export default function LagReporter() {
  const { user } = useAuth() as any;
  const uid: string | undefined = user?.uid;
  useEffect(() => {
    let last = performance.now();
    let worst = 0, total = 0, count = 0;
    let where = location.pathname;
    const tick = setInterval(() => {
      const now = performance.now();
      const late = now - last - TICK;
      last = now;
      // (a hidden tab's timers are slowed on purpose, and a sleeping computer stops them: not lag)
      if (document.visibilityState !== "visible" || late < 1000 || late > 60000) return;
      worst = Math.max(worst, late);
      total += late;
      count++;
      where = location.pathname;
    }, TICK);
    const onVisible = () => { last = performance.now(); };
    document.addEventListener("visibilitychange", onVisible);
    const report = setInterval(() => {
      if (!count) return;
      const body = { vid: visitorId(), uid, where: where.slice(0, 80), worst_ms: Math.round(worst), total_ms: Math.round(total), count };
      worst = total = count = 0;
      backendFetch(`${BACKEND_URL}/api/users/lag/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })
        .catch(() => { /* offline */ });
    }, 60_000);
    return () => { clearInterval(tick); clearInterval(report); document.removeEventListener("visibilitychange", onVisible); };
  }, [uid]);
  return null;
}
