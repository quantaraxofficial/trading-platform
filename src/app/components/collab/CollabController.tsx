"use client";

// Opens collab charts: from a shared link (?collab=…, once the visitor is signed in), from an
// invite, or from the Collaborate dialog. Keeps the link in the address bar while a collab is
// open, shows new invites as toasts, and says so when a collab ends or access is taken away.
// Also: a chime and a short notification whenever someone comes or goes (you too), someone asks
// to join, or your access changes; and, for a link opened without access, the "You weren't
// invited" window with a button to ask the owner to let you in.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./collab.css";
import { useAuth } from "@/context/AuthContext";
import { collab, collabApi, useCollab, type CollabNotice, type NoAccess, type RoomInfo } from "../../lib/collab/session";
import { playCollabSound } from "../../lib/collab/sounds";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { CloseIcon, CollabIcon, LockIcon } from "./icons";
import { Avatar } from "./CollabDialog";

const DISMISSED_KEY = "tv:collabDismissedInvites";
const INVITE_POLL_MS = 120_000;
// While a request to join is waiting, how often to check whether it was answered
const REQUEST_POLL_MS = 4000;
const NOTICE_MS = 4500;

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

interface Toast {
  id: string; text: React.ReactNode; person?: { name: string; color: string };
  action?: { label: string; run: () => void }; secondary?: { label: string; run: () => void };
  onDismiss?: () => void; ttl?: number;
}

export default function CollabController() {
  const { user, loading } = useAuth();
  const { status, error } = useCollab();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [noAccess, setNoAccess] = useState<(NoAccess & { token: string }) | null>(null);
  const triedLink = useRef<string | null>(null);
  // Invites / requests already chimed for, so the periodic check doesn't chime again
  const chimed = useRef(new Set<string>());

  const push = useCallback((t: Toast) => setToasts(list => [...list.filter(x => x.id !== t.id), t]), []);
  const drop = useCallback((id: string) => setToasts(list => list.filter(x => x.id !== id)), []);

  // Short notices go away on their own
  useEffect(() => {
    const timed = toasts.filter(t => t.ttl);
    if (!timed.length) return;
    const timers = timed.map(t => setTimeout(() => drop(t.id), t.ttl));
    return () => timers.forEach(clearTimeout);
  }, [toasts, drop]);

  const open = useCallback((token: string, uid: string) => openCollab(token, uid).catch(err => {
    const data = err?.data as NoAccess | undefined;
    if (err?.status === 403 && data && (data.not_invited || data.kicked)) {
      setNoAccess({ ...data, token });
      return;
    }
    setUrlToken(null);
    push({ id: `link-${token}`, text: err?.message || "Couldn't open this collab." });
  }), [push]);

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
    open(token, user.uid);
  }, [user, loading, push, drop, open]);

  // Sounds and notifications for what happens in the collab
  useEffect(() => {
    if (!user) return;
    return collab.onNotice((n: CollabNotice) => {
      const t = Date.now();
      switch (n.kind) {
        case "self-joined": {
          playCollabSound("self-joined");
          const me = collab.get().room?.members.find(m => m.uid === user.uid);
          push({ id: `n${t}`, text: <>You joined <b>{n.room}</b></>, person: me ? { name: me.name, color: me.color } : undefined, ttl: NOTICE_MS });
          break;
        }
        case "self-left":
          playCollabSound("self-left");
          push({ id: `n${t}`, text: <>You left <b>{n.room}</b></>, ttl: NOTICE_MS });
          break;
        case "joined":
          playCollabSound("joined");
          push({ id: `n${t}${n.name}`, text: <><b>{n.name}</b> joined the collab</>, person: n, ttl: NOTICE_MS });
          break;
        case "left":
          playCollabSound("left");
          push({ id: `n${t}${n.name}`, text: <><b>{n.name}</b> left the collab</>, person: n, ttl: NOTICE_MS });
          break;
        case "request": {
          playCollabSound("request");
          const id = `req-${n.token}-${n.request.uid}`;
          const answer = (action: "approve" | "decline") => {
            drop(id);
            collabApi<RoomInfo>(user.uid, `room/${n.token}/requests/${encodeURIComponent(n.request.uid)}/`, { method: "POST", body: { action } })
              .then(room => { if (collab.get().token === n.token) collab.setRoom(room); })
              .catch(err => push({ id: `${id}-err`, text: err?.message || "Couldn't answer the request", ttl: NOTICE_MS }));
          };
          push({
            id, person: n.request,
            text: <><b>{n.request.name}</b> asks to join <b>{n.room}</b><div className="tv-co-member-sub">{n.request.email}</div></>,
            action: { label: "Let in", run: () => answer("approve") },
            secondary: { label: "Decline", run: () => answer("decline") },
          });
          break;
        }
        case "removed":
          playCollabSound("removed");
          break;
        case "ended":
          playCollabSound("left");
          break;
        case "mic-off":
          playCollabSound("mic-off");
          push({ id: "perm-mic", text: "The owner turned your mic off. You can still listen.", ttl: NOTICE_MS });
          break;
        case "mic-on":
          playCollabSound("mic-on");
          push({ id: "perm-mic", text: "The owner turned your mic on. You can talk in the voice call.", ttl: NOTICE_MS });
          break;
        case "edit-on":
          playCollabSound("notice");
          push({ id: "perm-edit", text: "You can now edit.", ttl: NOTICE_MS });
          break;
        case "edit-off":
          playCollabSound("notice");
          push({ id: "perm-edit", text: "You can now only view.", ttl: NOTICE_MS });
          break;
      }
    });
  }, [user, push, drop]);

  // New invites, and people asking to join your collabs, as toasts (once per browser session)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const check = () => {
      collabApi<{ rooms: { token: string; name: string; owner_name: string; pending: boolean; requests: number }[] }>(user.uid, "rooms/").then(d => {
        if (!alive) return;
        let dismissed: string[] = [];
        try { dismissed = JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || "[]"); } catch { /* none */ }
        for (const r of d.rooms || []) {
          if (collab.get().token === r.token) continue;
          const key = r.pending ? r.token : `${r.token}:requests:${r.requests}`;
          if (dismissed.includes(key) || (!r.pending && !r.requests)) continue;
          const id = `invite-${r.token}`;
          const dismiss = () => {
            try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed, key])); } catch { /* storage off */ }
            drop(id);
          };
          if (!chimed.current.has(key)) {
            chimed.current.add(key);
            playCollabSound(r.pending ? "notice" : "request");
          }
          push({
            id,
            text: r.pending
              ? <><b>{r.owner_name}</b> invited you to collaborate on <b>{r.name}</b></>
              : <>{r.requests === 1 ? "Someone is" : `${r.requests} people are`} asking to join <b>{r.name}</b></>,
            action: { label: "Open", run: () => { dismiss(); open(r.token, user.uid); } },
            onDismiss: dismiss,
          });
        }
      }).catch(() => { /* backend unreachable: try again later */ });
    };
    check();
    const t = setInterval(check, INVITE_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [user, push, drop, open]);

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

  return (
    <>
      {noAccess && user && (
        <NoAccessDialog
          uid={user.uid}
          info={noAccess}
          onChange={setNoAccess}
          onJoined={() => {
            setNoAccess(null);
            playCollabSound("approved");
          }}
          onClose={() => { setNoAccess(null); setUrlToken(null); }}
        />
      )}
      {toasts.length > 0 && (
        <div className="tv-co-toasts" role="status">
          {toasts.map(t => {
            const dismiss = t.onDismiss ?? (() => drop(t.id));
            return (
              <div key={t.id} className="tv-co-toast" data-name="collab-toast">
                {t.person ? <Avatar name={t.person.name} color={t.person.color} /> : <span className="tv-co-access-icon"><CollabIcon size={22} /></span>}
                <div className="tv-co-toast-body">
                  <div>{t.text}</div>
                  {t.action && (
                    <div className="tv-co-toast-actions">
                      <button className="tv-co-btn primary" onClick={t.action.run}>{t.action.label}</button>
                      <button className="tv-co-btn secondary" onClick={t.secondary?.run ?? dismiss}>{t.secondary?.label ?? "Later"}</button>
                    </div>
                  )}
                </div>
                <button className="tv-co-iconbtn small" aria-label="Dismiss" onClick={dismiss}><CloseIcon size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// A link opened by someone who wasn't added: says so, and lets them ask the owner to let them
// in (when the owner allows asking). While the request waits, it checks every few seconds and
// opens the collab as soon as they're let in.
function NoAccessDialog({ uid, info, onChange, onJoined, onClose }: {
  uid: string; info: NoAccess & { token: string };
  onChange: (n: NoAccess & { token: string }) => void; onJoined: () => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEscapeClose(onClose);
  const { token, request } = info;
  const infoRef = useRef(info);
  infoRef.current = info;
  const cbs = useRef({ onChange, onJoined });
  cbs.current = { onChange, onJoined };

  useEffect(() => {
    if (request !== "pending") return;
    let alive = true;
    const t = setInterval(() => {
      openCollab(token, uid).then(() => { if (alive) cbs.current.onJoined(); }).catch(e => {
        const data = e?.data as NoAccess | undefined;
        if (!alive || e?.status !== 403 || !data) return;
        if (data.request !== infoRef.current.request || data.kicked !== infoRef.current.kicked) {
          if (data.request === "declined" || data.kicked) playCollabSound("declined");
          cbs.current.onChange({ ...data, token });
        }
      });
    }, REQUEST_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [request, token, uid]);

  const ask = async (method: "POST" | "DELETE") => {
    setBusy(true);
    setErr(null);
    try {
      const data = await collabApi<NoAccess>(uid, `room/${encodeURIComponent(token)}/request/`, { method, body: {} });
      onChange({ ...data, token });
      if (method === "POST") playCollabSound("notice");
    } catch (e: any) {
      if (e?.data?.room_name) onChange({ ...e.data, token });
      setErr(e?.message || "Couldn't send the request");
    } finally {
      setBusy(false);
    }
  };

  const title = info.kicked ? "You were removed from this collab" : "You weren't invited to this collab";
  let body: React.ReactNode;
  if (info.kicked) body = <>The owner, <b>{info.owner_name}</b>, removed you from <b>{info.room_name}</b>, so you can't open it again unless they add you back.</>;
  else if (request === "pending") body = <>Request sent. You&apos;ll join <b>{info.room_name}</b> as soon as <b>{info.owner_name}</b> lets you in. Keep this window open.</>;
  else if (request === "declined") body = <><b>{info.owner_name}</b> declined your request to join <b>{info.room_name}</b>.{info.can_request ? " You can ask again." : ""}</>;
  else if (info.can_request) body = <><b>{info.room_name}</b> is shared by <b>{info.owner_name}</b> with the people they added. Ask them to let you in.</>;
  else body = <><b>{info.room_name}</b> is shared by <b>{info.owner_name}</b> with the people they added, and they aren&apos;t taking requests. Ask them to add you.</>;

  return createPortal(
    <div className="tv-co-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tv-co-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-co-noaccess-title" data-name="collab-no-access" style={{ width: 420 }}>
        <div className="tv-co-header">
          <div className="tv-co-title" id="tv-co-noaccess-title">{title}</div>
          <button className="tv-co-iconbtn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="tv-co-content">
          <div className="tv-co-access" style={{ alignItems: "flex-start" }}>
            <span className={`tv-co-access-icon${request === "pending" ? " tv-co-pulse" : ""}`}><LockIcon /></span>
            <div style={{ lineHeight: "21px" }} data-name="collab-no-access-text">{body}</div>
          </div>
          {err && <div className="tv-co-error">{err}</div>}
        </div>
        <div className="tv-co-footer">
          <span className="tv-co-spacer" />
          {request === "pending" ? (
            <button className="tv-co-btn secondary" disabled={busy} onClick={() => ask("DELETE")} data-name="collab-cancel-request">Cancel request</button>
          ) : (
            <button className="tv-co-btn secondary" onClick={onClose}>Close</button>
          )}
          {!info.kicked && info.can_request && request !== "pending" && (
            <button className="tv-co-btn primary" disabled={busy} onClick={() => ask("POST")} data-name="collab-request-access">
              {busy ? "Sending…" : request === "declined" ? "Ask again" : "Request to join"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
