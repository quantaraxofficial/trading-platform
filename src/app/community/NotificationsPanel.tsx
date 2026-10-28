"use client";

// Notifications on the chart (the right toolbar's bell): new scripts from people you follow, new
// followers, private scripts shared with you, collab invites. The unread count is checked every
// minute while the page is visible.

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/context/AuthContext";
import { getNotifications, markNotificationsRead, initials, type Notice } from "./social";
import { noticeHref } from "./CommunityShell";

let state: { unread: number; items: Notice[] } = { unread: 0, items: [] };
const subs = new Set<() => void>();
const set = (s: typeof state) => { state = s; subs.forEach(f => f()); };
let polling: { uid: string; timer: ReturnType<typeof setInterval> } | null = null;

function startPolling(uid: string) {
  if (polling?.uid === uid) return;
  if (polling) clearInterval(polling.timer);
  const load = () => { if (document.visibilityState === "visible") getNotifications(uid).then(set, () => {}); };
  load();
  polling = { uid, timer: setInterval(load, 60000) };
}

export function useNotifications() {
  const { user } = useAuth();
  useEffect(() => { if (user?.uid) startPolling(user.uid); }, [user?.uid]);
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => state);
}

export default function NotificationsPanel() {
  const { user } = useAuth();
  const data = useNotifications();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!user?.uid) return;
    getNotifications(user.uid).then(d => { set(d); setLoaded(true); }, () => setLoaded(true));
  }, [user?.uid]);
  const readAll = () => user?.uid && markNotificationsRead(user.uid).then(set, () => {});
  return (
    <div data-testid="notifications-panel" style={{ display: "flex", flexDirection: "column", height: "100%", color: "var(--tv-color-text)", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "12px 12px 8px", gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>Notifications</span>
        {data.unread > 0 && <button onClick={readAll} style={{ border: "none", background: "transparent", color: "var(--tv-color-accent, #2962ff)", cursor: "pointer", fontSize: 13 }}>Mark all read</button>}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!user ? <Empty>Sign in to get notifications</Empty> : !loaded && !data.items.length ? <Empty>Loading…</Empty> : data.items.length === 0 ? (
          <Empty>Nothing yet. Follow traders in the <a href="/community" target="_blank" rel="noreferrer" style={{ color: "var(--tv-color-accent, #2962ff)" }}>community</a> to hear when they publish an indicator or strategy.</Empty>
        ) : data.items.map(n => {
          const href = noticeHref(n);
          const row = (
            <div style={{ display: "flex", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--tv-color-border)", background: n.read ? "transparent" : "var(--tv-color-item-hover)" }}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#8b5cf6,#4f46e5)", color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {initials(n.actor?.name || "TP")}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", lineHeight: "18px" }}>{n.text}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--tv-color-text-muted)", marginTop: 2 }}>{new Date(n.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
              </span>
            </div>
          );
          // A script opens on this chart (it's already here); profiles and the rest in a new tab
          return href ? <a key={n.id} href={href} target={href.startsWith("/?") ? undefined : "_blank"} rel="noreferrer" style={{ textDecoration: "none", color: "inherit", display: "block" }}
            onClick={() => user?.uid && !n.read && markNotificationsRead(user.uid, [n.id]).then(set, () => {})}>{row}</a> : <div key={n.id}>{row}</div>;
        })}
      </div>
      <a href="/community" target="_blank" rel="noreferrer" style={{ padding: "10px 12px", borderTop: "1px solid var(--tv-color-border)", color: "var(--tv-color-accent, #2962ff)", textDecoration: "none" }}>Open the community ↗</a>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <div style={{ padding: "24px 12px", color: "var(--tv-color-text-muted)", lineHeight: "20px" }}>{children}</div>;
