"use client";

// Tells the server the signed-in person has the site open (core/presence.py): once a minute while
// the tab is visible, and at once when it comes back. Django Admin shows who's active now.
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { backendFetch } from "@/lib/backend";

const BACKEND_URL = "http://localhost:8000";

export default function PresencePing() {
  const { user } = useAuth() as any;
  const uid: string | undefined = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let last = 0;
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 30_000) return;
      last = Date.now();
      backendFetch(`${BACKEND_URL}/api/users/presence/${encodeURIComponent(uid)}/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ where: location.pathname.slice(0, 40) }),
      }).catch(() => { /* offline */ });
    };
    ping();
    const id = setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", ping); };
  }, [uid]);
  return null;
}
