"use client";

// Opens collab charts: from a shared link (?collab=…, once the visitor is signed in), from an
// invite, or from the Collaborate dialog. Keeps the link in the address bar while a collab is
// open, shows new invites as toasts, and says so when a collab ends or access is taken away.

import { useCallback, useEffect, useRef, useState } from "react";
import "./collab.css";
import { useAuth } from "@/context/AuthContext";
import { collab, collabApi, useCollab, type RoomInfo } from "../../lib/collab/session";
import { CloseIcon, CollabIcon } from "./icons";

const DISMISSED_KEY = "tv:collabDismissedInvites";
const INVITE_POLL_MS = 120_000;

function setUrlToken(token: string | null) {
  try {
    const u = new URL(window.location.href);
    if (token) u.searchParams.set("collab", token); else u.searchParams.delete("collab");
    window.history.replaceState(window.history.state, "", u.toString());
  } catch { /* no URL to change */ }
}

// Opens a collab chart: checks access (joining through the link when it allows), connects, and
// shows the group panel
export async function openCollab(token: string, uid: string): Promise<RoomInfo> {
  const room = await collabApi<RoomInfo>(uid, `room/${encodeURIComponent(token)}/`);
  collab.join(token, uid, room.kind);
  setUrlToken(token);
  window.dispatchEvent(new CustomEvent("tv:open-sidebar-panel", { detail: "collab" }));
  // A shared script opens straight in the Pine Editor
  if (room.kind === "pine") window.dispatchEvent(new CustomEvent("tv:open-pine-editor"));
  return room;
}

export function leaveCollab() {
  collab.leave();
  setUrlToken(null);
}

interface Toast { id: string; text: React.ReactNode; action?: { label: string; run: () => void }; onDismiss?: () => void }

export default function CollabController() {
  const { user, loading } = useAuth();
  const { status, error } = useCollab();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const triedLink = useRef<string | null>(null);

  const push = useCallback((t: Toast) => setToasts(list => [...list.filter(x => x.id !== t.id), t]), []);
  const drop = useCallback((id: string) => setToasts(list => list.filter(x => x.id !== id)), []);

  // A shared link: join once signed in
  useEffect(() => {
    if (loading) return;
    const token = new URLSearchParams(window.location.search).get("collab");
    if (!token || collab.get().token === token) return;
    if (!user) {
      push({ id: "signin", text: "Sign in to join the collab chart this link opens." });
      return;
    }
    if (triedLink.current === `${user.uid}:${token}`) return;
    triedLink.current = `${user.uid}:${token}`;
    drop("signin");
    openCollab(token, user.uid).catch(err => {
      setUrlToken(null);
      push({ id: `link-${token}`, text: err?.message || "Couldn't open this collab." });
    });
  }, [user, loading, push, drop]);

  // New invites, as toasts (once per invite per browser session)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const check = () => {
      collabApi<{ rooms: { token: string; name: string; owner_name: string; pending: boolean }[] }>(user.uid, "rooms/").then(d => {
        if (!alive) return;
        let dismissed: string[] = [];
        try { dismissed = JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || "[]"); } catch { /* none */ }
        for (const r of d.rooms || []) {
          if (!r.pending || dismissed.includes(r.token) || collab.get().token === r.token) continue;
          const dismiss = () => {
            try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed, r.token])); } catch { /* storage off */ }
            drop(`invite-${r.token}`);
          };
          push({
            id: `invite-${r.token}`,
            text: <><b>{r.owner_name}</b> invited you to collaborate on <b>{r.name}</b></>,
            action: { label: "Open", run: () => { dismiss(); openCollab(r.token, user.uid).catch(err => push({ id: `err-${r.token}`, text: err?.message || "Couldn't open it" })); } },
            onDismiss: dismiss,
          });
        }
      }).catch(() => { /* backend unreachable: try again later */ });
    };
    check();
    const t = setInterval(check, INVITE_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [user, push, drop]);

  // Signed out while in a collab: leave it
  useEffect(() => {
    if (!loading && !user && collab.active) leaveCollab();
  }, [user, loading]);

  // Ended by the owner, or access removed
  useEffect(() => {
    if (status !== "ended" && status !== "error") return;
    push({ id: "ended", text: error || "This collab is no longer available." });
    leaveCollab();
  }, [status, error, push]);

  if (!toasts.length) return null;
  return (
    <div className="tv-co-toasts" role="status">
      {toasts.map(t => (
        <div key={t.id} className="tv-co-toast">
          <span className="tv-co-access-icon"><CollabIcon size={22} /></span>
          <div className="tv-co-toast-body">
            <div>{t.text}</div>
            {t.action && (
              <div className="tv-co-toast-actions">
                <button className="tv-co-btn primary" onClick={t.action.run}>{t.action.label}</button>
                <button className="tv-co-btn secondary" onClick={() => (t.onDismiss ?? (() => drop(t.id)))()}>Later</button>
              </div>
            )}
          </div>
          <button className="tv-co-iconbtn small" aria-label="Dismiss" onClick={() => (t.onDismiss ?? (() => drop(t.id)))()}><CloseIcon size={14} /></button>
        </div>
      ))}
    </div>
  );
}
