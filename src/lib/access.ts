// The account's subscription (accounts are sold by hand and made in Django admin, see
// backend/core/access.py). Once it has ended the account still works, but the features the admin
// marked locked (collab, bar replay…) are refused: requireFeature() says so with the locked dialog.
// The server refuses collab by itself too; replay runs only in the browser, so this is its lock.
import { useSyncExternalStore } from "react";
import { backendFetch } from "./backend";

export interface Access {
  active: boolean;
  until: number | null;           // ms; null = never subscribed
  days_left: number;
  locked: string[];               // locked for them when it was read
  features: Record<string, string>; // key → label of everything that needs a subscription
  message: string;                // the admin's renew message
}

let access: Access | null = null;
let readAt = 0;
const subs = new Set<() => void>();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

export function setAccess(a: Access | null) {
  access = a;
  readAt = Date.now();
  clearTimeout(expiryTimer);
  // Locks itself when the time runs out while the page is open (timers cap at ~24 days)
  if (a?.active && a.until) {
    const left = a.until - Date.now();
    if (left > 0 && left < 2 ** 31 - 1) expiryTimer = setTimeout(() => subs.forEach(f => f()), left + 500);
  }
  subs.forEach(f => f());
}

export function getAccess(): Access | null { return access; }

function activeNow(a: Access): boolean {
  return a.active && !!a.until && a.until > Date.now();
}

// Not known yet (signed out, still loading, backend unreachable): nothing is locked here
export function featureLocked(key: string): boolean {
  if (!access) return false;
  return !activeNow(access) && key in (access.features || {});
}

export function featureLabel(key: string): string {
  return access?.features?.[key] || key;
}

// true when they can use it; otherwise the locked dialog opens and it's false
export function requireFeature(key: string): boolean {
  if (!featureLocked(key)) return true;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tv:feature-locked", { detail: { key } }));
  return false;
}

// The server's answer to a locked request (402 {locked, access}): the same dialog, with what it says
export function onLockedResponse(data: any) {
  if (data?.access) setAccess(data.access);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tv:feature-locked", { detail: { key: data?.locked || "" } }));
}

export async function refreshAccess(uid: string): Promise<Access | null> {
  try {
    const res = await backendFetch(`http://localhost:8000/api/users/user/${encodeURIComponent(uid)}/`);
    if (!res.ok) return access;
    const data = await res.json();
    if (data?.access) setAccess(data.access);
  } catch { /* offline: keep what we have */ }
  return access;
}

// How long ago it was read (to re-read it when the tab comes back after a while)
export function accessAge(): number { return readAt ? Date.now() - readAt : Infinity; }

function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
// A new object when the expiry passes, so components re-render then too
let snap: { a: Access | null; active: boolean } = { a: null, active: false };
function snapshot() {
  const active = !!access && activeNow(access);
  if (snap.a !== access || snap.active !== active) snap = { a: access, active };
  return snap;
}
const serverSnap = { a: null, active: false };

export function useAccess(): { access: Access | null; active: boolean } {
  const s = useSyncExternalStore(subscribe, snapshot, () => serverSnap);
  return { access: s.a, active: s.active };
}
