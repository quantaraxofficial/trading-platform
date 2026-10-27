"use client";

// The collab panel when no collab is open (or "Your collabs" from inside one): every collab you
// own or were added to, each marked with the colour of what you are in it (Admin, Controller,
// Editor, Participant, Viewer), newest activity first. The colours double as filters. Hovering a
// collab shows a gear for its settings (permissions, mics, requests, link access…).

import { useCallback, useEffect, useState } from "react";
import "./collab.css";
import { useAuth } from "@/context/AuthContext";
import { collabApi, type Perms, type Role, type RoomKind } from "../../lib/collab/session";
import { COLLAB_ROLES, COLLAB_ROLE_ORDER, collabRoleOf, type CollabRoleKey } from "../../lib/collab/roles";
import { displaySymbol } from "@/app/lib/symbolDisplay";
import { openCollab } from "./CollabController";
import { CollabSettingsDialog } from "./CollabDialog";
import { CloseIcon, CollabIcon } from "./icons";
import { TVSettingsHexIcon, TVTrashIcon } from "../icons/TVIcons";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { leaveCollab } from "./CollabController";

interface RoomSummary {
  name: string; kind: RoomKind; symbol: string; drawings: number; drawing_symbols: number; indicators: number; pine_lines: number;
  alerts: number; messages: number; files: number; file_bytes: number; images: number; members: number; requests: number; kicked: number; created_at: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The bin: the owner deletes the collab for good, after seeing everything that goes with it;
// anyone else leaves it (it stays for the others)
function DeleteCollabDialog({ uid, room, live, onClose, onDone }: { uid: string; room: ListedRoom; live: boolean; onClose: () => void; onDone: () => void }) {
  const owner = room.role === "owner";
  const [summary, setSummary] = useState<RoomSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  useEscapeClose(onClose);
  useEffect(() => {
    if (!owner) return;
    collabApi<RoomSummary>(uid, `room/${encodeURIComponent(room.token)}/summary/`).then(setSummary).catch(e => setError(e?.message || "Couldn't load what's in it"));
  }, [uid, room.token, owner]);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      if (owner) await collabApi(uid, `room/${encodeURIComponent(room.token)}/`, { method: "DELETE" });
      else await collabApi(uid, `room/${encodeURIComponent(room.token)}/member/${encodeURIComponent(uid)}/`, { method: "DELETE" });
      if (live) leaveCollab();
      onDone();
    } catch (e: any) {
      setError(e?.message || "Couldn't do it");
      setBusy(false);
    }
  };
  const s = summary;
  const rows: [string, string][] = s ? ([
    ...(s.kind === "chart" ? [
      ["Drawings", s.drawings ? `${plural(s.drawings, "drawing")} on ${plural(s.drawing_symbols, "symbol")}` : "None"],
      ["Indicators", s.indicators ? plural(s.indicators, "indicator") : "None"],
    ] : []),
    ["Pine Script", s.pine_lines ? `${plural(s.pine_lines, "line")} of shared code` : "None"],
    ...(s.kind === "chart" ? [["Shared alerts", s.alerts ? plural(s.alerts, "alert") : "None"]] : []),
    ["Chat", s.messages ? plural(s.messages, "message") : "No messages"],
    ["Shared files", s.files ? `${plural(s.files, "file")}${s.images ? ` (${plural(s.images, "picture")})` : ""}, ${(s.file_bytes / 1024 / 1024).toFixed(1)} MB` : "None"],
    ["People", s.members ? `${plural(s.members, "person", "people")} ${s.members === 1 ? "loses" : "lose"} access, with their permissions` : "Only you"],
    ...(s.requests || s.kicked ? [["Requests and kicks", `${plural(s.requests, "request")}, ${plural(s.kicked, "kicked person", "kicked people")}`]] : []),
    ["Link", "Stops working for everyone"],
  ] as [string, string][]) : [];
  const confirmWord = "delete";
  return createPortal(
    <div className="tv-co-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tv-co-dialog" role="dialog" aria-modal="true" aria-label={owner ? "Delete collab" : "Leave collab"} data-name="collab-delete-dialog" style={{ width: 460 }}>
        <div className="tv-co-header">
          <div className="tv-co-title">{owner ? `Delete “${room.name}”?` : `Leave “${room.name}”?`}</div>
          <button className="tv-co-iconbtn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="tv-co-content">
          {owner ? (
            <>
              <div style={{ lineHeight: "21px", marginBottom: 12 }}>This deletes the collab for everyone, for good. Everything in it is deleted with it:</div>
              {!s && !error && <div className="tv-co-hint">Counting what&apos;s in it…</div>}
              {s && (
                <div className="tv-co-delete-list" data-name="collab-delete-summary">
                  {rows.map(([k, v]) => (
                    <div key={k} className="tv-co-delete-row"><span>{k}</span><b>{v}</b></div>
                  ))}
                </div>
              )}
              <div className="tv-co-hint" style={{ marginTop: 10 }}>
                Everyone&apos;s own paper trades and alerts stay in their own accounts{room.kind === "chart" ? "; anyone who wants the drawings should copy them to their own chart first" : ""}.
                Whoever is in it now is told it ended.
              </div>
              <div className="tv-co-label" style={{ marginTop: 16 }}>Type “{confirmWord}” to confirm</div>
              <div className="tv-co-field plain">
                <input value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter" && typed.trim().toLowerCase() === confirmWord && s) go(); }}
                  aria-label="Type delete to confirm" data-name="collab-delete-confirm-input" autoFocus />
              </div>
            </>
          ) : (
            <div style={{ lineHeight: "21px" }}>
              You&apos;ll leave this collab and it goes from your list. It stays for everyone else, with its chart, chat and files; {room.owner_name} or someone allowed to add people can add you back.
            </div>
          )}
          {error && <div className="tv-co-error">{error}</div>}
        </div>
        <div className="tv-co-footer">
          <span className="tv-co-spacer" />
          <button className="tv-co-btn secondary" onClick={onClose}>Cancel</button>
          <button className="tv-co-btn danger" data-name="collab-delete-yes" disabled={busy || (owner && (!s || typed.trim().toLowerCase() !== confirmWord))} onClick={go}
            style={owner && (!s || typed.trim().toLowerCase() !== confirmWord) ? { opacity: 0.45, cursor: "default" } : undefined}>
            {busy ? (owner ? "Deleting…" : "Leaving…") : owner ? "Delete everything" : "Leave collab"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ListedRoom {
  token: string; name: string; kind: RoomKind; role: Role; owner_name: string; symbol: string; interval?: string;
  pending: boolean; perms?: Perms; members?: number; updated_at?: string; requests: number;
}

function ago(iso?: string) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

export function RoleBadge({ role, small }: { role: CollabRoleKey; small?: boolean }) {
  const r = COLLAB_ROLES[role];
  return (
    <span className={`tv-co-rolebadge${small ? " small" : ""}`} title={r.hint} data-role={role}
      style={{ color: r.color, borderColor: r.color, background: `${r.color}14` }}>{r.label}</span>
  );
}

export default function CollabList({ currentToken, onNew, onBack }: { currentToken?: string | null; onNew: () => void; onBack?: () => void }) {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<ListedRoom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CollabRoleKey | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ListedRoom | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    collabApi<{ rooms: ListedRoom[] }>(user.uid, "rooms/")
      .then(d => { setRooms(d.rooms || []); setError(null); })
      .catch(e => { setRooms(r => r || []); setError(e?.message || "Couldn't load your collabs"); });
  }, [user]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!user) {
    return <div className="tv-co-empty">Sign in to collaborate on charts and scripts with other people.</div>;
  }
  const withRole = (rooms || []).map(r => ({ ...r, key: collabRoleOf(r.role, r.perms, r.kind) }));
  const counts = COLLAB_ROLE_ORDER.reduce((m, k) => ({ ...m, [k]: withRole.filter(r => r.key === k).length }), {} as Record<CollabRoleKey, number>);
  const shown = withRole
    .filter(r => !filter || r.key === filter)
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  const open = (token: string) => {
    if (token === currentToken) { onBack?.(); return; }
    setOpening(token);
    openCollab(token, user.uid).then(() => onBack?.()).catch(e => setError(e?.message || "Couldn't open it")).finally(() => setOpening(null));
  };

  return (
    <div className="tv-co-panel" data-name="collab-list">
      <div className="tv-co-panel-head">
        {onBack && (
          <button className="tv-co-iconbtn small" title="Back to the collab" aria-label="Back to the collab" onClick={onBack}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M11 4 6 9l5 5" /></svg>
          </button>
        )}
        <div className="tv-co-panel-title">
          <b>Your collabs</b>
          <span>{rooms ? `${withRole.length} collab${withRole.length === 1 ? "" : "s"}` : "Loading…"}</span>
        </div>
        <button className="tv-co-btn primary" style={{ height: 30 }} onClick={onNew} data-name="collab-new">New collab</button>
      </div>

      {withRole.length > 0 && (
        <div className="tv-co-rolefilters" role="toolbar" aria-label="Show collabs where you are">
          <button className={`tv-co-rolefilter${!filter ? " on" : ""}`} onClick={() => setFilter(null)}>All</button>
          {COLLAB_ROLE_ORDER.map(k => (
            <button key={k} className={`tv-co-rolefilter${filter === k ? " on" : ""}`} onClick={() => setFilter(f => (f === k ? null : k))} disabled={!counts[k]}
              data-name={`collab-filter-${k}`} title={COLLAB_ROLES[k].hint}
              style={filter === k ? { background: COLLAB_ROLES[k].color, borderColor: COLLAB_ROLES[k].color, color: "#fff" } : undefined}>
              <i style={{ background: COLLAB_ROLES[k].color }} />{COLLAB_ROLES[k].label}{counts[k] ? ` ${counts[k]}` : ""}
            </button>
          ))}
        </div>
      )}

      <div className="tv-co-chat" style={{ padding: "6px 8px 12px" }}>
        {error && <div className="tv-co-banner error" style={{ margin: "4px 4px 8px" }}>{error}</div>}
        {rooms && withRole.length === 0 && (
          <div className="tv-co-empty">
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, color: "var(--tv-co-muted)" }}><CollabIcon size={40} /></div>
            You aren&apos;t in any collab yet. Start one to analyze this chart with others, or open a link someone shared with you.
          </div>
        )}
        {shown.map(r => {
          const role = COLLAB_ROLES[r.key];
          const here = r.token === currentToken;
          return (
            <div key={r.token} role="button" tabIndex={0} className={`tv-co-roomcard${here ? " here" : ""}${opening === r.token ? " busy" : ""}`}
              onClick={() => opening !== r.token && open(r.token)}
              onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); open(r.token); } }}
              data-name="collab-room-card" data-role={r.key}
              style={{ borderLeftColor: role.color, background: `linear-gradient(90deg, ${role.color}1f, transparent 70%)` }}>
              <div className="tv-co-roomcard-top">
                <span className="tv-co-roomcard-name" title={r.name}>{r.name}</span>
                <RoleBadge role={r.key} small />
                <button className="tv-co-iconbtn small tv-co-roomcard-gear" title={r.role === "owner" ? "Settings and permissions" : "Details"} aria-label={`Settings of ${r.name}`}
                  data-name="collab-room-settings" onClick={e => { e.stopPropagation(); setSettingsFor(r.token); }}>
                  <TVSettingsHexIcon size={22} />
                </button>
                <button className="tv-co-iconbtn small tv-co-roomcard-gear bin" title={r.role === "owner" ? "Delete collab" : "Leave collab"} aria-label={`${r.role === "owner" ? "Delete" : "Leave"} ${r.name}`}
                  data-name="collab-room-delete" onClick={e => { e.stopPropagation(); setDeleting(r); }}>
                  {/* The bin's drawing sits lower in its box than the gear's: centred on it, the two line up */}
                  <TVTrashIcon size={22} viewBox="0 1.75 28 28" />
                </button>
              </div>
              <div className="tv-co-member-sub">
                {r.kind === "pine" ? "Pine script" : `Chart · ${displaySymbol(r.symbol)}`}
                {r.role !== "owner" && ` · ${r.owner_name}'s`}
                {r.members ? ` · ${r.members} ${r.members === 1 ? "person" : "people"}` : ""}
                {r.updated_at ? ` · ${ago(r.updated_at)}` : ""}
              </div>
              {(here || r.pending || r.requests > 0 || opening === r.token) && (
                <div className="tv-co-roomcard-tags">
                  {here && <span className="tv-co-tag live">Open now</span>}
                  {r.pending && <span className="tv-co-tag">New invite</span>}
                  {r.requests > 0 && <span className="tv-co-tag warn">{r.requests} asking to join</span>}
                  {opening === r.token && <span className="tv-co-tag">Opening…</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {settingsFor && <CollabSettingsDialog token={settingsFor} onClose={() => setSettingsFor(null)} onChanged={load} />}
      {deleting && user && (
        <DeleteCollabDialog uid={user.uid} room={deleting} live={deleting.token === currentToken}
          onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); load(); }} />
      )}
    </div>
  );
}
