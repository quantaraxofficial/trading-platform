"use client";

// Tells the server the signed-in person has the site open (core/presence.py): once a minute while
// the tab is visible, and at once when it comes back. Django Admin shows who's active now. The
// features used since the last one go with it (lib/featureUse), and alone when the tab is hidden;
// and whether they did anything on the page since (a click, a key, a scroll, the mouse moving): Time
// on site's active time vs only open.
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { backendFetch } from "@/lib/backend";
import { drainFeatures, restoreFeatures } from "@/app/lib/featureUse";

const BACKEND_URL = "http://localhost:8000";

export default function PresencePing() {
  const { user } = useAuth() as any;
  const uid: string | undefined = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let last = 0;
    let touched = false;
    const touch = () => { touched = true; };
    const INPUT = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    INPUT.forEach(e => window.addEventListener(e, touch, { passive: true, capture: true }));
    const url = `${BACKEND_URL}/api/users/presence/${encodeURIComponent(uid)}/`;
    const send = (body: Record<string, unknown>, features: Record<string, number> | null) =>
      backendFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true, body: JSON.stringify(features ? { ...body, features } : body) })
        .then(r => { if (!r.ok) restoreFeatures(features); }, () => restoreFeatures(features));
    const ping = () => {
      if (document.visibilityState !== "visible") {
        // (leaving or hidden: only what was used, not presence)
        const features = drainFeatures();
        if (features) send({ only_features: true }, features);
        return;
      }
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      const active = touched;
      touched = false;
      send({ where: location.pathname.slice(0, 40), active }, drainFeatures());
    };
    ping();
    const id = setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
      INPUT.forEach(e => window.removeEventListener(e, touch, { capture: true }));
    };
  }, [uid]);
  return null;
}
