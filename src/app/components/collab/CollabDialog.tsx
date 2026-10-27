"use client";

// "Collaborate": starts a collab from the current chart, then shares it: the link, who can open
// it, adding people by email or name, and everyone's access. Opened from the chart's right-click
// menu and from the group panel.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./collab.css";
import { useAuth } from "@/context/AuthContext";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { collab, collabApi, collabLink, useCollab, type LinkAccess, type Member, type RoomInfo, type RoomKind } from "../../lib/collab/session";
import { AddPersonIcon, CloseIcon, CollabIcon, CopyIcon, GlobeIcon, LinkIcon, LockIcon } from "./icons";
import { openCollab } from "./CollabController";
import TvMenu, { type TvMenuItem } from "../ui/TvMenu";

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
  mode?: RoomKind; pine?: { code: string; scriptName: string; language?: string };
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
          <ManageRoom uid={user.uid} room={state.room!} onClose={onClose} />
        ) : (
          <StartRoom uid={user.uid} symbol={symbol} interval={interval} indicators={indicators} onClose={onClose} mode={mode} pine={pine} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function StartRoom({ uid, symbol, interval, indicators, onClose, mode, pine }: {
  uid: string; symbol: string; interval: string; indicators: any[]; onClose: () => void; mode: RoomKind; pine?: { code: string; scriptName: string; language?: string };
}) {
  const [name, setName] = useState(mode === "pine" ? (pine?.scriptName || "Pine script") : `${symbol} analysis`);
  const [access, setAccess] = useState<LinkAccess>("edit");
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
      if (mode === "pine") {
        // Only the script: its code becomes the shared document everyone edits
        room = await collabApi<RoomInfo>(uid, "rooms/", { method: "POST", body: { kind: "pine", name, pine, symbol, interval } });
      } else {
        const drawings = ((window as any).__drawings || []).filter((d: any) => d.type !== "measure");
        const chartPine = (window as any).__pineScript ?? null;
        room = await collabApi<RoomInfo>(uid, "rooms/", { method: "POST", body: { name, symbol, interval, indicators, drawings, pine: chartPine } });
      }
      if (access !== "edit") await collabApi(uid, `room/${room.token}/`, { method: "PATCH", body: { link_access: access } });
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

function ManageRoom({ uid, room, onClose }: { uid: string; room: RoomInfo; onClose: () => void }) {
  const { peers } = useCollab();
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
      collab.setRoom(res.room);
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
    try { collab.setRoom(await collabApi<RoomInfo>(uid, `room/${room.token}/`, { method: "PATCH", body })); }
    catch (err: any) { setResult({ error: err?.message || "Couldn't change it" }); }
  };
  const memberUrl = (m: Member) => `room/${room.token}/member/${encodeURIComponent(m.uid)}/`;
  const updateMember = async (m: Member, body: Record<string, any>) => {
    try { collab.setRoom(await collabApi<RoomInfo>(uid, memberUrl(m), { method: "PATCH", body })); }
    catch (err: any) { setResult({ error: err?.message || "Couldn't change their permissions" }); }
  };
  const removeMember = async (m: Member) => {
    try { collab.setRoom(await collabApi<RoomInfo>(uid, memberUrl(m), { method: "DELETE" })); }
    catch (err: any) { setResult({ error: err?.message || "Couldn't remove them" }); }
  };
  const transfer = async (m: Member) => {
    try {
      collab.setRoom(await collabApi<RoomInfo>(uid, `room/${room.token}/transfer/`, { method: "POST", body: { uid: m.uid } }));
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
          <div className="tv-co-label">People with access</div>
          {room.members.map(m => (
            <div key={m.uid} className="tv-co-member">
              <Avatar name={m.name} color={m.color} online={online.has(m.uid)} />
              <div className="tv-co-member-info">
                <div className="tv-co-member-name">{m.name}{m.uid === uid ? " (you)" : ""}{online.has(m.uid) && <span className="tv-co-member-sub" style={{ display: "inline" }}> · here now</span>}</div>
                <div className="tv-co-member-sub">{m.pending ? "Invited · hasn't opened it yet" : permsLine(m, room.kind)}</div>
              </div>
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
        <span className="tv-co-spacer" />
        <button className="tv-co-btn primary" onClick={onClose}>Done</button>
      </div>
    </>
  );
}
