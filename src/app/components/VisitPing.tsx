"use client";

// Signed-out visitors (the home page, the sign-in page, a chart opened without an account): once a
// minute while the tab is visible, the server notes this browser's random id and the page
// (core/presence.py visit). The page they came from goes with the first one. Signed in, PresencePing
// does this instead.
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { BACKEND_URL } from "@/lib/backend";
import { visitorId } from "@/lib/visitor";

export default function VisitPing() {
  const { user, loading } = useAuth() as any;
  const signedOut = !loading && !user;
  useEffect(() => {
    if (!signedOut) return;
    const vid = visitorId();
    if (!vid) return;
    let last = 0, sentRef = false;
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 30_000) return;
      last = Date.now();
      const body: Record<string, string> = { vid, where: location.pathname.slice(0, 80) };
      if (!sentRef && document.referrer) { body.ref = document.referrer; sentRef = true; }
      fetch(`${BACKEND_URL}/api/users/visit/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })
        .catch(() => { /* offline */ });
    };
    ping();
    const id = setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", ping); };
  }, [signedOut]);
  return null;
}
