// The right toolbar's Chats panel: your private conversations across your collabs, your group
// chats, and the unread count on its button. Checked every minute, every few seconds while the
// panel is open, and at once when one arrives over an open collab's connection.

import { useSyncExternalStore } from "react";
import { collabApi, type ChatMessage, type RoomKind } from "./session";

export interface DmPerson { uid: string; name: string; email: string; color: string }
export interface DmConversation { token: string; room_name: string; room_kind: RoomKind; partner: DmPerson; last: ChatMessage; unread: number }
export interface DmContact extends DmPerson { collabs: { token: string; name: string; kind: RoomKind }[] }
export interface GroupTheme { name: string; background: string; text: string; bubble: string; bubbleMine: string; accent: string; imageDim: number; image_v: string | null; font?: string; fontSize?: number }
export interface GroupSummary { token: string; name: string; role: "admin" | "member"; members: number; people: DmPerson[]; last: ChatMessage | null; unread: number; updated_at: number }
export interface GroupInfo { token: string; name: string; role: "admin" | "member"; theme: GroupTheme | null; members: (DmPerson & { role: "admin" | "member" })[]; created_at: string }

interface DmState { uid: string | null; conversations: DmConversation[]; groups: GroupSummary[]; unread: number; loaded: boolean; error: string | null }
const INITIAL: DmState = { uid: null, conversations: [], groups: [], unread: 0, loaded: false, error: null };

let state: DmState = INITIAL;
const subs = new Set<() => void>();
const set = (patch: Partial<DmState>) => { state = { ...state, ...patch }; subs.forEach(f => f()); };
let timer: ReturnType<typeof setInterval> | null = null;
let fast = false;

export async function refreshDms() {
  const uid = state.uid;
  if (!uid) return;
  try {
    const [d, g] = await Promise.all([
      collabApi<{ conversations: DmConversation[]; unread: number }>(uid, "dms/"),
      collabApi<{ groups: GroupSummary[]; unread: number }>(uid, "groups/"),
    ]);
    if (state.uid === uid) set({ conversations: d.conversations || [], groups: g.groups || [], unread: (d.unread || 0) + (g.unread || 0), loaded: true, error: null });
  } catch (e: any) {
    if (state.uid === uid) set({ loaded: true, error: e?.message || "Couldn't load your chats" });
  }
}

function schedule() {
  if (timer) clearInterval(timer);
  timer = state.uid ? setInterval(refreshDms, fast ? 5000 : 60000) : null;
}

// Signed in as this user (or signed out: null)
export function setDmUser(uid: string | null) {
  if (uid === state.uid) return;
  state = { ...INITIAL, uid };
  subs.forEach(f => f());
  schedule();
  if (uid) refreshDms();
}

// The panel is open: check often
export function setDmPanelOpen(open: boolean) {
  if (fast === open) return;
  fast = open;
  schedule();
  if (open) refreshDms();
}

if (typeof window !== "undefined") {
  window.addEventListener("tv:collab-dm", () => { refreshDms(); });
}

export function useDms(): DmState {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => INITIAL);
}

export const dmApi = {
  people: (uid: string) => collabApi<{ people: DmContact[] }>(uid, "dms/people/").then(d => d.people || []),
  thread: (uid: string, token: string, partner: string) =>
    collabApi<{ token: string; room_name: string; partner: DmPerson; messages: ChatMessage[] }>(uid, `dms/${encodeURIComponent(token)}/${encodeURIComponent(partner)}/`),
  send: (uid: string, token: string, partner: string, text: string) =>
    collabApi<ChatMessage>(uid, `dms/${encodeURIComponent(token)}/${encodeURIComponent(partner)}/`, { method: "POST", body: { text } }),
};

// Group chats
const g = (token: string, rest = "") => `groups/${encodeURIComponent(token)}/${rest}`;
export const groupApi = {
  contacts: (uid: string) => collabApi<{ people: DmPerson[] }>(uid, "groups/contacts/").then(d => d.people || []),
  create: (uid: string, name: string, people: string[]) => collabApi<GroupInfo>(uid, "groups/", { method: "POST", body: { name, people } }),
  get: (uid: string, token: string) => collabApi<GroupInfo & { messages: ChatMessage[] }>(uid, g(token)),
  update: (uid: string, token: string, body: Record<string, any>) => collabApi<GroupInfo>(uid, g(token), { method: "PATCH", body }),
  remove: (uid: string, token: string) => collabApi(uid, g(token), { method: "DELETE" }),
  add: (uid: string, token: string, people: string[]) => collabApi<GroupInfo>(uid, g(token, "members/"), { method: "POST", body: { people } }),
  setRole: (uid: string, token: string, member: string, role: "admin" | "member") =>
    collabApi<GroupInfo>(uid, g(token, `members/${encodeURIComponent(member)}/`), { method: "PATCH", body: { role } }),
  removeMember: (uid: string, token: string, member: string) => collabApi<any>(uid, g(token, `members/${encodeURIComponent(member)}/`), { method: "DELETE" }),
  send: (uid: string, token: string, text: string) => collabApi<ChatMessage>(uid, g(token, "messages/"), { method: "POST", body: { text } }),
};
