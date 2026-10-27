"use client";

// "Collaborate": starts a collab from the current chart, then shares it: the link, who can open
// it, adding people by email or name, and everyone's access. Opened from the chart's right-click
// menu and from the group panel.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./collab.css";
import { useAuth } from "@/context/AuthContext";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { collab, collabApi, collabLink, useCollab, type JoinRequest, type LinkAccess, type Member, type Person, type RoomInfo, type RoomKind } from "../../lib/collab/session";
import { AddPersonIcon, CloseIcon, CollabIcon, CopyIcon, GlobeIcon, LinkIcon, LockIcon, MicIcon } from "./icons";
import { openCollab } from "./CollabController";
import { RoleBadge } from "./CollabList";
import { collabRoleOf } from "../../lib/collab/roles";
import TvMenu, { type TvMenuItem } from "../ui/TvMenu";
import { cleanDrawings } from "../../lib/drawingData";
import { displaySymbol } from "@/app/lib/symbolDisplay";

const ACCESS_LABEL: Record<LinkAccess, string> = {
  restricted: "Only people added",
  view: "Anyone with the link can view",
  edit: "Anyone with the link can edit",
};
const ACCESS_HINT: Record<LinkAccess, string> = {
  restricted: "Only the people below can open this chart",
  view: "Anyone signed in with the link can watch and chat, but not change the chart",
  edit: "Anyone signed in with the link can draw, change the chart and trade along",
};
const ROLE_LABEL = { owner: "Owner", editor: "Can edit", viewer: "Can view" } as const;

// What a member may do, as the line under their name
function permsLine(m: Member, kind: RoomKind): string {
  if (m.role === "owner") return "Manages the collab";
  if (kind === "pine") {
    return [m.perms.pine ? "Edits the script" : "Views the script", m.perms.invite && "adds people", m.perms.voice ? "voice" : "no voice"].filter(Boolean).join(" · ");
  }
  const parts = [m.perms.edit ? "Edits the chart" : "Views the chart"];
  if (m.perms.replay) parts.push("replay");
  if (m.perms.invite) parts.push("adds people");
  if (m.perms.alert) parts.push("shares alerts");
  if (m.perms.pine) parts.push("edits Pine");
  parts.push(m.perms.voice ? "voice" : "no voice");
  return parts.join(" · ");
}

// An on/off switch with its label and a hint under it
function Switch({ label, hint, checked, onChange, testId, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; testId?: string; disabled?: boolean }) {
  return (
    <label className={`tv-co-switch-row${disabled ? " disabled" : ""}`} data-name={testId}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", lineHeight: "20px" }}>{label}</span>
        {hint && <span className="tv-co-hint" style={{ display: "block", marginTop: 2 }}>{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="tv-co-switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

export function Avatar({ name, color, size, online, speaking }: { name: string; color: string; size?: "sm"; online?: boolean; speaking?: boolean }) {
  return (
    <span className={`tv-co-avatar${size ? ` ${size}` : ""}${online ? " online" : ""}${speaking ? " speaking" : ""}`} style={{ background: color }} title={name}>
      {(name || "?").trim().charAt(0)}
    </span>
  );
}

// mode "pine": opened from the Pine Editor, to share only the script being edited
export default function CollabDialog({ symbol, interval, indicators, onClose, mode = "chart", pine }: {
  symbol: string; interval: string; indicators: any[]; onClose: () => void;
  mode?: RoomKind; pine?: { code: string; scriptName: string };
}) {
  const { user } = useAuth();
  const state = useCollab();
  const inRoom = !!state.room && state.status !== "idle" && state.status !== "ended" && state.status !== "error";
  useEscapeClose(onClose);

  return createPortal(
    <div className="tv-co-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tv-co-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-co-title" data-name="collab-dialog">
        <div className="tv-co-header">
          <div className="tv-co-title" id="tv-co-title">{inRoom ? `Share “${state.room!.name}”` : mode === "pine" ? "Collaborate on this script" : "Collaborate"}</div>
          <button className="tv-co-iconbtn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        {!user ? (
          <>
            <div className="tv-co-content">
              <div className="tv-co-access">
                <span className="tv-co-access-icon"><CollabIcon size={22} /></span>
                <div>Sign in to collaborate {mode === "pine" ? "on scripts" : "on charts"} with other people.</div>
              </div>
            </div>
            <div className="tv-co-footer"><span className="tv-co-spacer" /><button className="tv-co-btn primary" onClick={onClose}>Ok</button></div>
          </>
        ) : inRoom ? (
          <ManageRoom uid={user.uid} room={state.room!} onClose={onClose} setRoom={r => collab.setRoom(r)} live />
        ) : (
          <StartRoom uid={user.uid} symbol={symbol} interval={interval} indicators={indicators} onClose={onClose} mode={mode} pine={pine} />
        )}
      </div>
    </div>,
    document.body,
  );
}

// A collab's settings from the list of your collabs (its gear), open in this tab or not: who's in
// it and what each may do, mics, requests, kicked people, link access, name; end it or leave it.
export function CollabSettingsDialog({ token, onClose, onChanged }: { token: string; onClose: () => void; onChanged?: () => void }) {
  const { user } = useAuth();
  const state = useCollab();
  const live = state.token === token && !!state.room && state.status !== "idle" && state.status !== "ended" && state.status !== "error";
  const [room, setRoomState] = useState<RoomInfo | null>(live ? state.room : null);
  const [error, setError] = useState<string | null>(null);
  useEscapeClose(onClose);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    collabApi<RoomInfo>(user.uid, `room/${encodeURIComponent(token)}/?peek=1`)
      .then(r => { if (alive) setRoomState(r); })
      .catch(e => { if (alive) setError(e?.message || "Couldn't load this collab"); });
    return () => { alive = false; };
  }, [user, token]);
  // The open collab's changes from others arrive through its connection
  useEffect(() => { if (live && state.room) setRoomState(state.room); }, [live, state.room]);
  const setRoom = (r: RoomInfo) => {
    setRoomState(r);
    if (live) collab.setRoom(r);
    onChanged?.();
  };
  const close = () => { onChanged?.(); onClose(); };
  return createPortal(
    <div className="tv-co-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="tv-co-dialog" role="dialog" aria-modal="true" aria-labelledby="tv-co-settings-title" data-name="collab-settings-dialog">
        <div className="tv-co-header">
          <div className="tv-co-title" id="tv-co-settings-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{room ? room.name : "Collab settings"}</span>
            {room && <RoleBadge role={collabRoleOf(room.role, room.perms, room.kind)} />}
          </div>
          <button className="tv-co-iconbtn" aria-label="Close" onClick={close}><CloseIcon /></button>
        </div>
        {!user ? <div className="tv-co-content">Sign in to manage your collabs.</div>
          : error ? <div className="tv-co-content"><div className="tv-co-error">{error}</div></div>
          : !room ? <div className="tv-co-content"><div className="tv-co-hint">Loading…</div></div>
          : <ManageRoom uid={user.uid} room={room} onClose={close} setRoom={setRoom} live={live} onLeft={onChanged} />}
      </div>
    </div>,
    document.body,
  );
}

function StartRoom({ uid, symbol, interval, indicators, onClose, mode, pine }: {
  uid: string; symbol: string; interval: string; indicators: any[]; onClose: () => void; mode: RoomKind; pine?: { code: string; scriptName: string };
}) {
  const [name, setName] = useState(mode === "pine" ? (pine?.scriptName || "Pine script") : `${displaySymbol(symbol)} analysis`);
  const [access, setAccess] = useState<LinkAccess>("edit");
  const [allowRequests, setAllowRequests] = useState(true);
  const [allowVoice, setAllowVoice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<{ token: string; name: string; kind: RoomKind; role: string; owner_name: string; symbol: string; pending: boolean }[] | null>(null);

  useEffect(() => {
    let alive = true;
    collabApi(uid, "rooms/").then(d => { if (alive) setRooms(d.rooms || []); }).catch(() => { if (alive) setRooms([]); });
    return () => { alive = false; };
  }, [uid]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      let room: RoomInfo;
      const settings = { link_access: access, allow_requests: allowRequests, allow_voice: allowVoice };
      if (mode === "pine") {
        // Only the script: its code becomes the shared document everyone edits
        room = await collabApi<RoomInfo>(uid, "rooms/", { method: "POST", body: { kind: "pine", name, pine, symbol, interval, ...settings } });
      } else {
        const drawings = cleanDrawings((window as any).__drawings).filter((d: any) => d.type !== "measure");
        const chartPine = (window as any).__pineScript ?? null;
        room = await collabApi<RoomInfo>(uid, "rooms/", { method: "POST", body: { name, symbol, interval, indicators, drawings, pine: chartPine, ...settings } });
      }
      await openCollab(room.token, uid);
    } catch (err: any) {
      setError(err?.message || "Couldn't start the collab");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="tv-co-content">
        <div className="tv-co-section">
          <div className="tv-co-hint" style={{ marginTop: 0, fontSize: 14, lineHeight: "21px", color: "var(--tv-co-text)" }}>
            {mode === "pine"
              ? <>Edit this Pine script together, live. Everyone with access types in the same code and sees each other&apos;s cursors, and can chat and talk in the group. Only the script is shared, not your chart.</>
              : <>Analyze this chart together, live. Everyone in the collab sees the same symbol, interval, indicators and drawings, each other&apos;s cursors and paper trades, and can chat and talk in the group.</>}
          </div>
        </div>
        <div className="tv-co-section">
          <div className="tv-co-label">Name</div>
          <div className="tv-co-field plain">
            <input value={name} maxLength={120} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && name.trim()) create(); }} autoFocus />
          </div>
        </div>
        <div className="tv-co-section">
          <div className="tv-co-label">General access</div>
          <div className="tv-co-access">
            <span className="tv-co-access-icon">{access === "restricted" ? <LockIcon /> : <GlobeIcon />}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <select className="tv-co-select" value={access} onChange={e => setAccess(e.target.value as LinkAccess)} style={{ width: "100%" }}>
                {(Object.keys(ACCESS_LABEL) as LinkAccess[]).map(a => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
              </select>
              <div className="tv-co-hint">{ACCESS_HINT[access]}</div>
            </div>
          </div>
        </div>
        <div className="tv-co-section">
          <div className="tv-co-label">Settings</div>
          <Switch label="Let people without access ask to join" hint="Someone who opens the link without access sees a Request to join button, and you decide" checked={allowRequests} onChange={setAllowRequests} testId="start-allow-requests" />
          <Switch label="Everyone can use their mic" hint="Off: only you can talk in the voice call; the others listen. You can change this, or each person's mic, later" checked={allowVoice} onChange={setAllowVoice} testId="start-allow-voice" />
        </div>
        {error && <div className="tv-co-error">{error}</div>}
        {rooms && rooms.length > 0 && (
          <div className="tv-co-section">
            <div className="tv-co-label">Your collabs</div>
            {rooms.map(r => (
              <div key={r.token} className="tv-co-member">
                <span className="tv-co-access-icon"><CollabIcon size={22} /></span>
                <div className="tv-co-member-info">
                  <div className="tv-co-member-name">{r.name}</div>
                  <div className="tv-co-member-sub">{r.kind === "pine" ? "Pine script · " : "Chart · "}{r.role === "owner" ? "You own this" : `${r.owner_name}'s · ${ROLE_LABEL[r.role as keyof typeof ROLE_LABEL] ?? r.role}`}{r.pending ? " · New invite" : ""}</div>
                </div>
                <button className="tv-co-btn secondary" onClick={() => openCollab(r.token, uid).catch(e => setError(e?.message))}>Open</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="tv-co-footer">
        <span className="tv-co-spacer" />
        <button className="tv-co-btn secondary" onClick={onClose}>Cancel</button>
        <button className="tv-co-btn primary" disabled={busy || !name.trim()} onClick={create}>{busy ? "Creating…" : "Create link"}</button>
      </div>
    </>
  );
}

// live: the collab open in this tab (who's here now is known, and its changes reach the session)
function ManageRoom({ uid, room, onClose, setRoom, live = false, onLeft }: {
  uid: string; room: RoomInfo; onClose: () => void; setRoom: (r: RoomInfo) => void; live?: boolean; onLeft?: () => void;
}) {
  const { peers: livePeers } = useCollab();
  const peers = live ? livePeers : [];
  const isOwner = room.role === "owner";
  const canInvite = !!room.perms?.invite;
  const [menuFor, setMenuFor] = useState<{ uid: string; x: number; y: number } | null>(null);
  const [transferTo, setTransferTo] = useState<Member | null>(null);
  const link = useMemo(() => collabLink(room.token), [room.token]);
  const [copied, setCopied] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">(isOwner ? "editor" : "viewer");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: string; errors?: { query: string; error: string }[]; error?: string } | null>(null);
  const [suggest, setSuggest] = useState<{ uid: string; name: string; email: string; color: string }[]>([]);
  const [active, setActive] = useState(0);
  // People picked for changing several at once
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [kickConfirm, setKickConfirm] = useState<Member[] | null>(null);
  const online = new Set(peers.map(p => p.uid));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setSuggest([]); return; }
    const t = setTimeout(() => {
      collabApi(uid, `people/?q=${encodeURIComponent(q)}`)
        .then(d => setSuggest((d.people || []).filter((p: any) => !room.members.some(m => m.uid === p.uid))))
        .catch(() => setSuggest([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, uid, room.members]);

  const copy = () => {
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  const addChip = (value: string) => {
    const v = value.trim().replace(/,$/, "");
    if (v && !chips.includes(v)) setChips(c => [...c, v]);
    setQuery("");
    setSuggest([]);
    setActive(0);
  };

  const invite = async () => {
    const people = [...chips, ...(query.trim() ? [query.trim()] : [])];
    if (!people.length) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await collabApi<{ added: Member[]; errors: { query: string; error: string }[]; room: RoomInfo }>(uid, `room/${room.token}/invite/`, { method: "POST", body: { people, role: inviteRole } });
      setRoom(res.room);
      const failed = new Set(res.errors.map(e => e.query));
      setChips(people.filter(p => failed.has(p)));
      setQuery("");
      setResult({ ok: res.added.length ? `Added ${res.added.map(m => m.name).join(", ")}. They'll see the invite when they open the site, or send them the link.` : undefined, errors: res.errors });
    } catch (err: any) {
      setResult({ error: err?.message || "Couldn't add people" });
    } finally {
      setBusy(false);
    }
  };

  const patchRoom = async (body: any) => {
    try { setRoom(await collabApi<RoomInfo>(uid, `room/${room.token}/`, { method: "PATCH", body })); }
    catch (err: any) { setResult({ error: err?.message || "Couldn't change it" }); }
  };
  const memberUrl = (m: Member) => `room/${room.token}/member/${encodeURIComponent(m.uid)}/`;
  const updateMember = async (m: Member, body: Record<string, any>) => {
    try { setRoom(await collabApi<RoomInfo>(uid, memberUrl(m), { method: "PATCH", body })); }
    catch (err: any) { setResult({ error: err?.message || "Couldn't change their permissions" }); }
  };
  const removeMember = async (m: Member, kick = false) => {
    try { setRoom(await collabApi<RoomInfo>(uid, memberUrl(m) + (kick ? "?kick=1" : ""), { method: "DELETE" })); }
    catch (err: any) { setResult({ error: err?.message || "Couldn't remove them" }); }
  };
  const kick = async (list: Member[]) => {
    setKickConfirm(null);
    for (const m of list) await removeMember(m, true);
    setPicked(new Set());
    setResult({ ok: `Kicked out ${list.map(m => m.name).join(", ")}. They can't come back through the link unless you add them again.` });
  };
  // Several people at once ("all" or the ones picked)
  const updateMany = async (uids: string[] | "all", body: Record<string, any>) => {
    try { setRoom(await collabApi<RoomInfo>(uid, `room/${room.token}/members/`, { method: "PATCH", body: { uids, ...body } })); }
    catch (err: any) { setResult({ error: err?.message || "Couldn't change their permissions" }); }
  };
  const answerRequest = async (r: JoinRequest, action: "approve" | "decline" | "block") => {
    try {
      const body = action === "approve" ? { action, role: isOwner ? inviteRole : "viewer" } : { action };
      setRoom(await collabApi<RoomInfo>(uid, `room/${room.token}/requests/${encodeURIComponent(r.uid)}/`, { method: "POST", body }));
    } catch (err: any) { setResult({ error: err?.message || "Couldn't answer the request" }); }
  };
  const unkick = async (p: Person) => {
    try { setRoom(await collabApi<RoomInfo>(uid, `room/${room.token}/kicked/${encodeURIComponent(p.uid)}/`, { method: "DELETE" })); }
    catch (err: any) { setResult({ error: err?.message || "Couldn't let them back" }); }
  };
  const others = room.members.filter(m => m.role !== "owner");
  const pickedMembers = others.filter(m => picked.has(m.uid));
  const togglePick = (m: Member) => setPicked(prev => { const n = new Set(prev); if (n.has(m.uid)) n.delete(m.uid); else n.add(m.uid); return n; });
  const transfer = async (m: Member) => {
    try {
      setRoom(await collabApi<RoomInfo>(uid, `room/${room.token}/transfer/`, { method: "POST", body: { uid: m.uid } }));
      setTransferTo(null);
      setResult({ ok: `${m.name} is now the owner.` });
    } catch (err: any) { setResult({ error: err?.message || "Couldn't hand the collab over" }); }
  };
  const menuMember = menuFor ? room.members.find(m => m.uid === menuFor.uid) : null;
  const pineRoom = room.kind === "pine";
  // In a script-only collab, "can edit" means editing the script
  const roleLabel = (m: Member) => m.role === "owner" ? ROLE_LABEL.owner : pineRoom ? (m.perms.pine ? "Can edit" : "Can view") : ROLE_LABEL[m.role];
  const menuItems: TvMenuItem[] = !menuMember ? [] : pineRoom ? [
    { label: "Can edit the script", checked: menuMember.perms.pine, keepOpen: true, onClick: () => updateMember(menuMember, { can_pine: !menuMember.perms.pine }), testId: "perm-pine" },
    { label: "Can add people", checked: menuMember.perms.invite, keepOpen: true, onClick: () => updateMember(menuMember, { can_invite: !menuMember.perms.invite }), testId: "perm-invite" },
    { label: "Can talk in voice", checked: menuMember.perms.voice, keepOpen: true, onClick: () => updateMember(menuMember, { can_voice: !menuMember.perms.voice }), testId: "perm-voice" },
    { kind: "divider" },
    { label: "Make owner…", onClick: () => setTransferTo(menuMember), testId: "perm-transfer" },
    { label: "Remove access", onClick: () => removeMember(menuMember), testId: "perm-remove" },
    { label: "Kick out…", onClick: () => setKickConfirm([menuMember]), testId: "perm-kick" },
  ] : [
    { label: "Can edit the chart", checked: menuMember.perms.edit, keepOpen: true, onClick: () => updateMember(menuMember, { role: menuMember.perms.edit ? "viewer" : "editor" }), testId: "perm-edit" },
    { label: "Can control the replay", checked: menuMember.perms.replay, keepOpen: true, onClick: () => updateMember(menuMember, { can_replay: !menuMember.perms.replay }), testId: "perm-replay" },
    { label: "Can add people", checked: menuMember.perms.invite, keepOpen: true, onClick: () => updateMember(menuMember, { can_invite: !menuMember.perms.invite }), testId: "perm-invite" },
    { label: "Can edit Pine Script", checked: menuMember.perms.pine, keepOpen: true, onClick: () => updateMember(menuMember, { can_pine: !menuMember.perms.pine }), testId: "perm-pine" },
    { label: "Can share alerts", checked: menuMember.perms.alert, keepOpen: true, onClick: () => updateMember(menuMember, { can_alert: !menuMember.perms.alert }), testId: "perm-alert" },
    { label: "Can talk in voice", checked: menuMember.perms.voice, keepOpen: true, onClick: () => updateMember(menuMember, { can_voice: !menuMember.perms.voice }), testId: "perm-voice" },
    { kind: "divider" },
    { label: "Make owner…", onClick: () => setTransferTo(menuMember), testId: "perm-transfer" },
    { label: "Remove access", onClick: () => removeMember(menuMember), testId: "perm-remove" },
    { label: "Kick out…", onClick: () => setKickConfirm([menuMember]), testId: "perm-kick" },
  ];
  const endCollab = async () => {
    await patchRoom({ active: false });
    onClose();
  };

  return (
    <>
      <div className="tv-co-content">
        {transferTo && (
          <div className="tv-co-section" data-name="collab-transfer-confirm" style={{ padding: 12, borderRadius: 6, background: "var(--tv-co-hover)" }}>
            <div style={{ lineHeight: "20px" }}>
              Make <b>{transferTo.name} </b>the owner? They&apos;ll manage everyone&apos;s permissions and can end the collab. You&apos;ll stay in it with every other permission.
            </div>
            <div className="tv-co-row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
              <button className="tv-co-btn secondary" onClick={() => setTransferTo(null)}>Cancel</button>
              <button className="tv-co-btn primary" onClick={() => transfer(transferTo)}>Make owner</button>
            </div>
          </div>
        )}
        {kickConfirm && (
          <div className="tv-co-section" data-name="collab-kick-confirm" style={{ padding: 12, borderRadius: 6, background: "var(--tv-co-hover)" }}>
            <div style={{ lineHeight: "20px" }}>
              Kick out <b>{kickConfirm.map(m => m.name).join(", ")}</b>? They&apos;ll leave the collab now and can&apos;t come back through the link or ask to join, unless you add them again.
            </div>
            <div className="tv-co-row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
              <button className="tv-co-btn secondary" onClick={() => setKickConfirm(null)}>Cancel</button>
              <button className="tv-co-btn danger" onClick={() => kick(kickConfirm)} data-name="collab-kick-yes">Kick out</button>
            </div>
          </div>
        )}
        {canInvite && (room.requests || []).length > 0 && (
          <div className="tv-co-section" data-name="collab-requests">
            <div className="tv-co-label">Asking to join · {(room.requests || []).length}</div>
            {(room.requests || []).map(r => (
              <div key={r.uid} className="tv-co-member" data-name="collab-request-row">
                <Avatar name={r.name} color={r.color} />
                <div className="tv-co-member-info">
                  <div className="tv-co-member-name">{r.name}</div>
                  <div className="tv-co-member-sub">{r.email}</div>
                </div>
                {isOwner && <button className="tv-co-btn secondary" title="Decline and keep them from asking again" onClick={() => answerRequest(r, "block")}>Block</button>}
                <button className="tv-co-btn secondary" onClick={() => answerRequest(r, "decline")} data-name="collab-request-decline">Decline</button>
                <button className="tv-co-btn primary" onClick={() => answerRequest(r, "approve")} data-name="collab-request-approve">Let in</button>
              </div>
            ))}
            <div className="tv-co-hint">{isOwner ? `People let in get "${inviteRole === "editor" ? "Can edit" : "Can view"}" (the access picked under Add people).` : "People you let in can view."}</div>
          </div>
        )}
        {canInvite && (
          <div className="tv-co-section">
            <div className="tv-co-label">Add people</div>
            <div className="tv-co-row" style={{ alignItems: "flex-start" }}>
              <div className="tv-co-field" onClick={() => inputRef.current?.focus()}>
                {chips.map(c => (
                  <span key={c} className="tv-co-chip"><span>{c}</span><button aria-label={`Remove ${c}`} onClick={() => setChips(list => list.filter(x => x !== c))}><CloseIcon size={10} /></button></span>
                ))}
                <input
                  ref={inputRef}
                  value={query}
                  placeholder={chips.length ? "" : "Email or name"}
                  onChange={e => { const v = e.target.value; if (v.endsWith(",")) addChip(v); else setQuery(v); }}
                  onKeyDown={e => {
                    if (e.key === "ArrowDown" && suggest.length) { e.preventDefault(); setActive(a => (a + 1) % suggest.length); }
                    else if (e.key === "ArrowUp" && suggest.length) { e.preventDefault(); setActive(a => (a - 1 + suggest.length) % suggest.length); }
                    else if (e.key === "Enter") {
                      e.preventDefault();
                      if (suggest[active]) addChip(suggest[active].email);
                      else if (query.trim()) addChip(query);
                      else invite();
                    } else if (e.key === "Backspace" && !query && chips.length) setChips(c => c.slice(0, -1));
                  }}
                  onBlur={() => setTimeout(() => setSuggest([]), 150)}
                />
                {suggest.length > 0 && (
                  <div className="tv-co-suggest">
                    {suggest.map((p, i) => (
                      <div key={p.uid} className={`tv-co-suggest-row${i === active ? " active" : ""}`} onMouseDown={e => { e.preventDefault(); addChip(p.email); }}>
                        <Avatar name={p.name} color={p.color} size="sm" />
                        <div className="tv-co-member-info"><div className="tv-co-member-name">{p.name}</div><div className="tv-co-member-sub">{p.email}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <select className="tv-co-select" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} aria-label="Access for the people added">
                {isOwner && <option value="editor">Can edit</option>}
                <option value="viewer">Can view</option>
              </select>
            </div>
            <div className="tv-co-row" style={{ marginTop: 8 }}>
              <span className="tv-co-hint" style={{ marginTop: 0, flex: 1 }}>Press Enter after each email or name. They need an account on this site.</span>
              <button className="tv-co-btn primary" disabled={busy || (!chips.length && !query.trim())} onClick={invite}><AddPersonIcon />{busy ? "Adding…" : "Invite"}</button>
            </div>
            {result?.ok && <div className="tv-co-ok">{result.ok}</div>}
            {result?.errors?.map(e => <div key={e.query} className="tv-co-error">{e.query}: {e.error}</div>)}
            {result?.error && <div className="tv-co-error">{result.error}</div>}
          </div>
        )}

        <div className="tv-co-section">
          <div className="tv-co-row" style={{ marginBottom: 8 }}>
            <div className="tv-co-label" style={{ margin: 0, flex: 1 }}>People with access</div>
            {isOwner && others.length > 0 && (
              <button className="tv-co-link" onClick={() => setPicked(prev => (prev.size === others.length ? new Set() : new Set(others.map(m => m.uid))))} data-name="collab-pick-all">
                {picked.size === others.length ? "Unselect all" : "Select all"}
              </button>
            )}
          </div>
          {isOwner && pickedMembers.length > 0 && (
            <div className="tv-co-bulk" data-name="collab-bulk">
              <span style={{ flex: "1 0 100%", fontSize: 12, color: "var(--tv-co-muted)" }}>{pickedMembers.length} selected</span>
              <button className="tv-co-btn secondary" onClick={() => updateMany(pickedMembers.map(m => m.uid), { can_voice: false })} data-name="bulk-mic-off"><MicIcon off />Mic off</button>
              <button className="tv-co-btn secondary" onClick={() => updateMany(pickedMembers.map(m => m.uid), { can_voice: true })} data-name="bulk-mic-on"><MicIcon />Mic on</button>
              {pineRoom ? <>
                <button className="tv-co-btn secondary" onClick={() => updateMany(pickedMembers.map(m => m.uid), { can_pine: true })} data-name="bulk-edit">Can edit</button>
                <button className="tv-co-btn secondary" onClick={() => updateMany(pickedMembers.map(m => m.uid), { can_pine: false })} data-name="bulk-view">View only</button>
              </> : <>
                <button className="tv-co-btn secondary" onClick={() => updateMany(pickedMembers.map(m => m.uid), { role: "editor" })} data-name="bulk-edit">Can edit</button>
                <button className="tv-co-btn secondary" onClick={() => updateMany(pickedMembers.map(m => m.uid), { role: "viewer" })} data-name="bulk-view">View only</button>
              </>}
              <button className="tv-co-btn danger" onClick={() => setKickConfirm(pickedMembers)} data-name="bulk-kick">Kick out</button>
            </div>
          )}
          {room.members.map(m => (
            <div key={m.uid} className="tv-co-member">
              {isOwner && others.length > 0 && (
                <input type="checkbox" className="tv-co-check" aria-label={`Select ${m.name}`} disabled={m.role === "owner"} style={m.role === "owner" ? { visibility: "hidden" } : undefined}
                  checked={picked.has(m.uid)} onChange={() => togglePick(m)} />
              )}
              <Avatar name={m.name} color={m.color} online={online.has(m.uid)} />
              <div className="tv-co-member-info">
                <div className="tv-co-member-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}{m.uid === uid ? " (you)" : ""}</span>
                  <RoleBadge role={collabRoleOf(m.role, m.perms, room.kind)} small />
                  {online.has(m.uid) && <span className="tv-co-member-sub" style={{ display: "inline" }}>here now</span>}
                </div>
                <div className="tv-co-member-sub">{m.pending ? "Invited · hasn't opened it yet" : permsLine(m, room.kind)}</div>
              </div>
              {isOwner && m.role !== "owner" && (
                <button
                  className={`tv-co-iconbtn small${m.perms.voice ? "" : " on"}`}
                  title={!room.allow_voice ? "Everyone's mic is off (see Settings below)" : m.mic ? `Turn off ${m.name}'s mic` : `Turn on ${m.name}'s mic`}
                  aria-label={m.mic ? `Turn off ${m.name}'s mic` : `Turn on ${m.name}'s mic`}
                  aria-pressed={!m.mic}
                  data-name="member-mic"
                  onClick={() => updateMember(m, { can_voice: !m.mic })}
                >
                  <MicIcon off={!m.perms.voice} />
                </button>
              )}
              {isOwner && m.role !== "owner" ? (
                <button
                  className="tv-co-select bare"
                  style={{ display: "inline-flex", alignItems: "center" }}
                  aria-label={`Permissions for ${m.name}`}
                  aria-haspopup="menu"
                  data-name="member-permissions"
                  onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenuFor(f => (f?.uid === m.uid ? null : { uid: m.uid, x: r.right - 220, y: r.bottom + 4 })); }}
                >
                  {roleLabel(m)}
                </button>
              ) : (
                <span className="tv-co-role">{roleLabel(m)}</span>
              )}
            </div>
          ))}
        </div>

        <div className="tv-co-section">
          <div className="tv-co-label">General access</div>
          <div className="tv-co-access">
            <span className="tv-co-access-icon">{room.link_access === "restricted" ? <LockIcon /> : <GlobeIcon />}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {isOwner ? (
                <select className="tv-co-select" value={room.link_access} onChange={e => patchRoom({ link_access: e.target.value })} style={{ width: "100%" }}>
                  {(Object.keys(ACCESS_LABEL) as LinkAccess[]).map(a => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
                </select>
              ) : (
                <div style={{ lineHeight: "34px" }}>{ACCESS_LABEL[room.link_access]}</div>
              )}
              <div className="tv-co-hint">{ACCESS_HINT[room.link_access]}</div>
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="tv-co-section" data-name="collab-settings">
            <div className="tv-co-label">Settings</div>
            <div className="tv-co-field plain" style={{ marginBottom: 6 }}>
              <input aria-label="Collab name" defaultValue={room.name} key={room.name} maxLength={120} data-name="collab-rename"
                onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== room.name) patchRoom({ name: v }); else e.target.value = room.name; }} />
            </div>
            <Switch label="Everyone can use their mic" hint={room.allow_voice ? "Turn off to mute everyone but you at once; the mic button by each name turns one person's off" : "Only you can talk; the others can listen"} checked={room.allow_voice} onChange={v => patchRoom({ allow_voice: v })} testId="allow-voice" />
            <Switch label="Let people without access ask to join" hint="Someone who opens the link without access can send you a request" checked={room.allow_requests} onChange={v => patchRoom({ allow_requests: v })} testId="allow-requests" />
            {others.length > 0 && (
              <div className="tv-co-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                <button className="tv-co-btn secondary" onClick={() => updateMany("all", pineRoom ? { can_pine: true } : { role: "editor" })} data-name="all-edit">Everyone can edit</button>
                <button className="tv-co-btn secondary" onClick={() => updateMany("all", pineRoom ? { can_pine: false } : { role: "viewer" })} data-name="all-view">Everyone view only</button>
              </div>
            )}
          </div>
        )}

        {isOwner && (room.kicked || []).length > 0 && (
          <div className="tv-co-section" data-name="collab-kicked">
            <div className="tv-co-label">Kicked out</div>
            {(room.kicked || []).map(p => (
              <div key={p.uid} className="tv-co-member">
                <Avatar name={p.name} color={p.color} />
                <div className="tv-co-member-info">
                  <div className="tv-co-member-name">{p.name}</div>
                  <div className="tv-co-member-sub">{p.email} · can&apos;t open the link or ask to join</div>
                </div>
                <button className="tv-co-btn secondary" onClick={() => unkick(p)} data-name="collab-unkick">Allow back</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {menuFor && menuMember && (
        <TvMenu
          items={menuItems}
          position={{ x: menuFor.x, y: menuFor.y }}
          isDark={typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"}
          onClose={() => setMenuFor(null)}
          ariaLabel={`Permissions for ${menuMember.name}`}
          testId="member-permissions-menu"
        />
      )}
      <div className="tv-co-footer">
        <button className="tv-co-btn secondary" onClick={copy}>{copied ? <><CopyIcon />Copied</> : <><LinkIcon />Copy link</>}</button>
        {isOwner && <button className="tv-co-btn danger" onClick={endCollab}>End collab</button>}
        {!isOwner && room.role && (
          <button className="tv-co-btn danger" data-name="collab-leave" onClick={async () => {
            try {
              await collabApi(uid, `room/${room.token}/member/${encodeURIComponent(uid)}/`, { method: "DELETE" });
              if (live) collab.leave();
              onLeft?.();
              onClose();
            } catch (err: any) { setResult({ error: err?.message || "Couldn't leave" }); }
          }}>Leave collab</button>
        )}
        <span className="tv-co-spacer" />
        <button className="tv-co-btn primary" onClick={onClose}>Done</button>
      </div>
    </>
  );
}
