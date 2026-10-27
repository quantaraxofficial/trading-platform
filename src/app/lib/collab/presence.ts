// Presence for the chats: telling the server you're here (every ~25 s while the tab is open, so
// others see you online / your last seen) and what you're typing in (at most every 3 s, and once
// to stop); your privacy choices (read receipts, typing, last seen); and how a last seen reads.

import { useSyncExternalStore } from "react";
import { collabApi } from "./session";

const HEARTBEAT_MS = 25_000;
const TYPING_EVERY_MS = 3000;

let uid: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let typingKey = "";
let typingSent = 0;

function beat() {
  if (uid && document.visibilityState === "visible") collabApi(uid, "presence/", { method: "POST", body: {} }).catch(() => {});
}

export function setPresenceUser(next: string | null) {
  if (next === uid) return;
  uid = next;
  if (timer) clearInterval(timer);
  timer = uid ? setInterval(beat, HEARTBEAT_MS) : null;
  if (uid) { beat(); loadPrivacy(); }
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", beat);

// Typing in a conversation (its key from the server); "" when it stops
export function reportTyping(key: string, typing: boolean) {
  if (!uid || !key) return;
  const now = Date.now();
  if (typing) {
    if (typingKey === key && now - typingSent < TYPING_EVERY_MS) return;
    typingKey = key;
    typingSent = now;
    collabApi(uid, "presence/", { method: "POST", body: { typing: key } }).catch(() => {});
  } else if (typingKey === key) {
    typingKey = "";
    typingSent = 0;
    collabApi(uid, "presence/", { method: "POST", body: { typing: "" } }).catch(() => {});
  }
}

// Privacy
export interface ChatPrivacy { read_receipts: boolean; show_typing: boolean; show_last_seen: boolean }
let privacy: ChatPrivacy = { read_receipts: true, show_typing: true, show_last_seen: true };
const subs = new Set<() => void>();
function loadPrivacy() {
  if (!uid) return;
  collabApi<ChatPrivacy>(uid, "chat-privacy/").then(p => { privacy = p; subs.forEach(f => f()); }).catch(() => {});
}
export async function setPrivacy(patch: Partial<ChatPrivacy>) {
  if (!uid) return;
  privacy = { ...privacy, ...patch };
  subs.forEach(f => f());
  privacy = await collabApi<ChatPrivacy>(uid, "chat-privacy/", { method: "PATCH", body: patch });
  subs.forEach(f => f());
}
export function usePrivacy(): ChatPrivacy {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => privacy, () => privacy);
}

// "online", "last seen today at 10:42", "last seen yesterday at …", "last seen 3 Oct"
export interface Seen { online: boolean | null; last_seen: number | null; hidden?: boolean }
export function seenText(s: Seen | undefined | null): string {
  if (!s || s.hidden) return "";
  if (s.online) return "online";
  if (!s.last_seen) return "";
  const d = new Date(s.last_seen);
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `last seen today at ${time}`;
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return `last seen yesterday at ${time}`;
  return `last seen ${d.toLocaleDateString([], { day: "numeric", month: "short" })}`;
}
