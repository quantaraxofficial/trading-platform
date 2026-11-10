// Premium access (accounts are sold by hand and made in Django admin, see backend/core/access.py).
// Without an active subscription — signed out too — the features the admin marked locked are
// refused: 30-second charts, custom intervals, bar replay, and more indicators / active alerts /
// charts in a layout than the free limit (3). requireFeature() / requireRoom() open the "not a
// premium user" popup. The server refuses what it serves itself; the rest is locked here.
import { useSyncExternalStore } from "react";
import { BACKEND_URL, backendFetch } from "./backend";
import { isStandardInterval, parseInterval } from "@/app/lib/intervals";

export interface Plan {
  features: Record<string, string>; // key → label of everything that needs a subscription
  limits?: Record<string, number>;  // key → how many are free (3 indicators…)
  message: string;                  // the admin's renew message
}

export interface Access extends Plan {
  active: boolean;
  until: number | null;           // ms; null = never subscribed
  days_left: number;
  unlimited?: boolean;            // made "Unlimited" in admin
  locked: string[];               // locked for them when it was read
  // The premium extras their plan includes (the plan "without voice & live replay" in admin has
  // them off); missing (an older server): included with premium
  extras?: { voice?: boolean; live_replay?: boolean };
}

let access: Access | null = null;
let plan: Plan | null = null;     // for signed-out visitors (signed in, it comes with their access)
let signedIn: boolean | null = null;   // null until the sign-in state is known
let readAt = 0;
const subs = new Set<() => void>();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const notify = () => subs.forEach(f => f());

// Signed in: their access (null when it couldn't be read). Signed out: setSignedOut()
export function setAccess(a: Access | null) {
  access = a;
  signedIn = true;
  readAt = Date.now();
  clearTimeout(expiryTimer);
  // Locks itself when the time runs out while the page is open (timers cap at ~24 days)
  if (a?.active && a.until) {
    const left = a.until - Date.now();
    if (left > 0 && left < 2 ** 31 - 1) expiryTimer = setTimeout(notify, left + 500);
  }
  notify();
}

// Signed out, or signed in but the server won't give their profile (a session it refused): the
// free plan's limits, from the server
export function setSignedOut() {
  access = null;
  signedIn = false;
  clearTimeout(expiryTimer);
  notify();
  if (!plan) loadPlan();
}
export const setNotPremium = setSignedOut;

async function loadPlan() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/users/plan/`);
    if (res.ok) { plan = await res.json(); notify(); }
  } catch { /* offline: nothing is locked until it's known */ }
}

export function getAccess(): Access | null { return access; }

function activeNow(a: Access): boolean {
  return a.active && !!a.until && a.until > Date.now();
}

// What applies now; null while it isn't known (still loading, backend unreachable): then nothing
// is locked, so a premium user is never limited by a slow start
const PREMIUM: Plan = { features: {}, message: "" };
function currentPlan(): Plan | null {
  if (signedIn === true) return access ? (activeNow(access) ? PREMIUM : access) : null;
  if (signedIn === false) return plan;
  return null;
}
export const planKnown = () => currentPlan() !== null;
export const isSignedIn = () => signedIn === true;

export function featureLocked(key: string): boolean {
  const p = currentPlan();
  return !!p && key in (p.features || {});
}

// How many of `key` they may have: Infinity when it isn't limited for them
export function featureLimit(key: string): number {
  if (!featureLocked(key)) return Infinity;
  return currentPlan()?.limits?.[key] ?? 0;
}

export function featureLabel(key: string): string {
  return currentPlan()?.features?.[key] || access?.features?.[key] || plan?.features?.[key] || key;
}

// What the popup calls it: "30-second charts", or "More than 3 indicators on a chart"
export function featureWhat(key: string): string {
  const label = featureLabel(key);
  const n = currentPlan()?.limits?.[key];
  return n !== undefined ? `More than ${n} ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
}

const popup = (key: string) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tv:feature-locked", { detail: { key } }));
};

// true when they can use it; otherwise the popup opens and it's false
export function requireFeature(key: string): boolean {
  if (!featureLocked(key)) return true;
  popup(key);
  return false;
}

// true when they may have `count` of it (e.g. a 4th indicator); otherwise the popup, false
export function requireRoom(key: string, count: number): boolean {
  if (count <= featureLimit(key)) return true;
  popup(key);
  return false;
}

// The premium feature an interval needs: seconds (30s), a custom one (7m, 2h 30m…), or none
export function intervalFeature(interval: string): string | null {
  const p = parseInterval(interval);
  if (!p) return null;
  if (p.unit === "s") return "seconds";
  return isStandardInterval(interval) ? null : "custom_interval";
}
export const intervalLocked = (interval: string) => { const f = intervalFeature(interval); return !!f && featureLocked(f); };
export function requireInterval(interval: string): boolean {
  const f = intervalFeature(interval);
  return !f || requireFeature(f);
}

// The server's answer to a locked request (402 {locked, access}): the same popup
export function onLockedResponse(data: any) {
  if (data?.access) setAccess(data.access);
  popup(data?.locked || "");
}

export async function refreshAccess(uid: string): Promise<Access | null> {
  try {
    const res = await backendFetch(`${BACKEND_URL}/api/users/user/${encodeURIComponent(uid)}/`);
    if (!res.ok) return access;
    const data = await res.json();
    if (data?.access) setAccess(data.access);
  } catch { /* offline: keep what we have */ }
  return access;
}

// How long ago it was read (to re-read it when the tab comes back after a while)
export function accessAge(): number { return readAt ? Date.now() - readAt : Infinity; }

function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
// A new object when anything changes (the expiry passing too), so components re-render then
let snap: { a: Access | null; active: boolean; plan: Plan | null } = { a: null, active: false, plan: null };
function snapshot() {
  const active = !!access && activeNow(access);
  const p = currentPlan();
  if (snap.a !== access || snap.active !== active || snap.plan !== p) snap = { a: access, active, plan: p };
  return snap;
}
const serverSnap = { a: null, active: false, plan: null };

// A premium extra (the voice assistant, the replay like the live market): premium, and their plan
// includes it
export type PremiumExtra = "voice" | "live_replay";
export function useExtra(key: PremiumExtra): boolean {
  const { access: a, active } = useAccess();
  return active && a?.extras?.[key] !== false;
}

// `plan`: what's limited for them now (null: not known yet, nothing limited)
export function useAccess(): { access: Access | null; active: boolean; plan: Plan | null } {
  const s = useSyncExternalStore(subscribe, snapshot, () => serverSnap);
  return { access: s.a, active: s.active, plan: s.plan };
}
