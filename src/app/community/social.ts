// People, profiles, follows, notifications and published scripts (backend core/social.py)

import { BACKEND } from "../lib/collab/session";
import { sessionKey } from "@/lib/backend";

export interface Person { username: string; name: string; bio: string }
export interface SearchPerson extends Person { followers: number; scripts: number; is_me: boolean; i_follow: boolean }
export interface PublishedScript {
  id: number; name: string; kind: "indicator" | "strategy"; language: "pine" | "python" | "mql5"; description: string;
  visibility: "public" | "private"; version: number; uses: number; author: Person; mine: boolean; source_key: string | null;
  created_at: number; updated_at: number; invited?: Person[]; code?: string;
  // who may read its code: everyone who can use it, only the author, or the author and code_viewers
  code_access: CodeAccess; can_view_code: boolean; code_viewers?: Person[];
  compiled?: unknown;   // instead of the code, for someone who may not read it (Pine Script)
}
export type CodeAccess = "open" | "hidden" | "allowed";
export interface ProfileStats { label: string; currency: string; metrics: Record<string, number>; equity: [number, number][]; updated_at: number | null; shown: boolean }
export interface Profile extends Person {
  joined: number; is_me: boolean; followers: number; following: number; i_follow: boolean; follows_me: boolean;
  can_message: boolean; can_invite: boolean; scripts: PublishedScript[];
  stats?: ProfileStats;
  backtests?: { shown: boolean; items: { name: string; symbol: string; timeframe: string; language: string; trades: number; net: number; return_pct: number | null; period_from: number | null; period_to: number | null }[] };
  sessions?: { shown: boolean; items: { name: string; symbol: string; timeframe: string; status: string; trades: number; wins: number; net: number; return_pct: number | null; time_spent: number }[] };
}
export type Privacy = "everyone" | "following" | "nobody";
export interface MySettings extends Person {
  show_trading_stats: boolean; show_backtests: boolean; show_sessions: boolean; allow_messages: Privacy; allow_invites: Privacy; stats_updated_at: number | null;
}
export interface Notice { id: number; kind: string; text: string; data: Record<string, any>; read: boolean; at: number; actor: Person | null }

async function call<T>(uid: string, rest: string, method = "GET", body?: unknown, query = ""): Promise<T> {
  const res = await fetch(`${BACKEND}/api/users/social/${encodeURIComponent(uid)}/${rest}?session_key=${encodeURIComponent(sessionKey())}${query}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}
const u = (s: string) => encodeURIComponent(s.replace(/^@/, "").toLowerCase());

export const searchPeople = (uid: string, q: string) => call<{ people: SearchPerson[] }>(uid, "search/", "GET", undefined, `&q=${encodeURIComponent(q)}`).then(d => d.people);
export const getProfile = (uid: string, username: string) => call<{ profile: Profile }>(uid, `people/${u(username)}/`).then(d => d.profile);
export const followPerson = (uid: string, username: string, on: boolean) => call<{ i_follow: boolean; followers: number }>(uid, `people/${u(username)}/follow/`, on ? "POST" : "DELETE");
export const followList = (uid: string, username: string, which: "followers" | "following") =>
  call<{ people: Person[] }>(uid, `people/${u(username)}/follows/`, "GET", undefined, `&which=${which}`).then(d => d.people);
export const messagePerson = (uid: string, username: string) => call<{ token: string }>(uid, `people/${u(username)}/message/`, "POST").then(d => d.token);
export const inviteOptions = (uid: string, username: string) =>
  call<{ collabs: { token: string; name: string; kind: string; member: boolean; can_editor: boolean }[]; allowed: boolean }>(uid, `people/${u(username)}/invite/`);
export const invitePerson = (uid: string, username: string, token: string, role: "editor" | "viewer") =>
  call<{ ok: boolean; collab: string; role: string }>(uid, `people/${u(username)}/invite/`, "POST", { token, role });
export const mySettings = (uid: string) => call<{ me: MySettings }>(uid, "me/").then(d => d.me);
export const updateMySettings = (uid: string, patch: Partial<MySettings>) => call<{ me: MySettings }>(uid, "me/", "PATCH", patch).then(d => d.me);
export const putMyStats = (uid: string, s: { label: string; currency: string; metrics: Record<string, number>; equity: [number, number][] }) => call(uid, "me/stats/", "PUT", s);
export const deleteMyStats = (uid: string) => call(uid, "me/stats/", "DELETE");
export const getNotifications = (uid: string) => call<{ unread: number; items: Notice[] }>(uid, "notifications/");
export const markNotificationsRead = (uid: string, ids?: number[]) => call<{ unread: number; items: Notice[] }>(uid, "notifications/", "POST", ids ? { ids } : {});
export type ScriptScope = "community" | "following" | "shared" | "mine";
export const listScripts = (uid: string, scope: ScriptScope, opts: { kind?: string; q?: string; sort?: "top" | "new" } = {}) =>
  call<{ scripts: PublishedScript[] }>(uid, "scripts/", "GET", undefined,
    `&scope=${scope}${opts.kind ? `&kind=${opts.kind}` : ""}${opts.q ? `&q=${encodeURIComponent(opts.q)}` : ""}${opts.sort ? `&sort=${opts.sort}` : ""}`).then(d => d.scripts);
export const getScript = (uid: string, id: number, use = false) => call<{ script: PublishedScript }>(uid, `scripts/${id}/`, "GET", undefined, use ? "&use=1" : "").then(d => d.script);
export const publishScript = (uid: string, s: { source_key: string; name: string; kind: string; language: string; description: string; code: string; visibility: string; invite: string[]; code_access: CodeAccess; code_viewers: string[]; compiled: unknown }) =>
  call<{ script: PublishedScript; first: boolean }>(uid, "scripts/publish/", "POST", s);
export const updateScript = (uid: string, id: number, patch: { name?: string; description?: string; visibility?: string; invite?: string[]; code_access?: CodeAccess; code_viewers?: string[] }) =>
  call<{ script: PublishedScript }>(uid, `scripts/${id}/`, "PATCH", patch).then(d => d.script);
export const unpublishScript = (uid: string, id: number) => call(uid, `scripts/${id}/`, "DELETE");

// On the chart: add a published script (the chart page runs /?addScript=<id>), or open a chat
export const ADD_SCRIPT_EVENT = "tv:add-script";
export const chartUrlForScript = (id: number) => `/?addScript=${id}`;
export const chartUrlForChat = (token: string) => `/?chat=${encodeURIComponent(token)}`;
export const profileUrl = (username: string) => `/u/${encodeURIComponent(username)}`;
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
