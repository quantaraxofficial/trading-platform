// Cloud sync of the app's settings that otherwise live only in this browser: saved chart layouts,
// watchlists, chart settings and their templates, indicator templates, favorites, theme… While a
// user is signed in, every change to one of these keys is sent to the backend (debounced), and on
// sign-in / when the tab comes back into view the newer copies are fetched. Per key, the most
// recent change wins.

import { reloadStore } from "../trading/settings";

const API = "http://localhost:8000/api/users/settings/";

// What follows the user between devices. (Per-device things — panel sizes and docks, open
// tabs, caches — stay local.)
export const SYNCED_KEYS = [
  "tv:layouts", "tv:watchlists", "tv:chartSettings", "tv:chartSettingsTemplates", "tv:chartType", "tv:statusLine",
  "tv:tradingSettings", "tv:indicatorTemplates", "tv:emaDefaults", "tv:favoriteIndicators", "tv:favoriteIntervals",
  "tv_favorite_tools", "tv:customColors", "tv:savedReplays", "tv:theme", "tv:chartTimezone", "tv:pineEditorSettings",
  "tv:alert-notify", "tv:indicators",
];
const SYNCED = new Set(SYNCED_KEYS);
const META_KEY = "tv:syncMeta"; // key -> time of its last change here (ms)

let uid: string | null = null;
let applying = false;
const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;

function readMeta(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {}; } catch { return {}; }
}
function writeMeta(key: string, t: number) {
  const m = readMeta();
  m[key] = t;
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* full */ }
}
const sessionKey = () => { try { return localStorage.getItem("tv_session_key") || ""; } catch { return ""; } };
// The session key travels in the query (a custom header would need a CORS preflight the backend doesn't allow)
const url = () => `${API}${encodeURIComponent(uid || "")}/?session_key=${encodeURIComponent(sessionKey())}`;

// Notices every write to a synced key, however the app makes it
function installHook() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    setItem.call(this, key, value);
    if (this === window.localStorage && SYNCED.has(key) && !applying) changed(key);
  };
  Storage.prototype.removeItem = function (key: string) {
    removeItem.call(this, key);
    if (this === window.localStorage && SYNCED.has(key) && !applying) changed(key);
  };
}

function changed(key: string) {
  writeMeta(key, Date.now());
  if (!uid) return;
  dirty.add(key);
  if (timer) clearTimeout(timer);
  timer = setTimeout(push, 1500);
}

// Writes a copy that came from the server, without sending it straight back
function applyRemote(key: string, value: string, updatedAt: number) {
  applying = true;
  try { localStorage.setItem(key, value); } catch { /* full */ } finally { applying = false; }
  writeMeta(key, updatedAt);
  reloadStore(key);
}

// A failed upload (server busy, offline) is tried again shortly
function retryLater(keys: string[]) {
  keys.forEach((k) => dirty.add(k));
  if (!timer) timer = setTimeout(push, 5000);
}

async function push() {
  timer = null;
  if (!uid || !dirty.size) return;
  const keys = Array.from(dirty);
  dirty.clear();
  const meta = readMeta();
  const settings: Record<string, { value: string; updated_at: number }> = {};
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v !== null) settings[k] = { value: v, updated_at: meta[k] || Date.now() };
  }
  if (!Object.keys(settings).length) return;
  try {
    const res = await fetch(url(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
    if (!res.ok) { retryLater(keys); return; }
    // The server keeps a newer copy (changed on another device meanwhile): take that one
    const kept = await res.json();
    const applied: string[] = [];
    for (const [k, item] of Object.entries<any>(kept || {})) {
      if (item && item.updated_at > (settings[k]?.updated_at ?? 0)) { applyRemote(k, item.value, item.updated_at); applied.push(k); }
    }
    if (applied.length) window.dispatchEvent(new CustomEvent("tv:cloud-sync", { detail: { keys: applied } }));
  } catch {
    retryLater(keys); // offline or the server busy
  }
}

// Fetches the server's copies; newer ones replace this browser's, and keys this browser changed
// more recently go up
export async function pullAndMerge(): Promise<string[]> {
  if (!uid) return [];
  let remote: Record<string, { value: string; updated_at: number }> = {};
  try {
    const res = await fetch(url());
    if (!res.ok) return [];
    remote = await res.json();
  } catch { return []; }
  const meta = readMeta();
  const applied: string[] = [];
  for (const key of SYNCED_KEYS) {
    const r = remote[key];
    const local = localStorage.getItem(key);
    const lt = meta[key] || 0;
    if (r && r.updated_at > lt) { if (r.value !== local) { applyRemote(key, r.value, r.updated_at); applied.push(key); } else writeMeta(key, r.updated_at); }
    else if (local !== null && (!r || lt > r.updated_at)) { if (!lt) writeMeta(key, Date.now()); dirty.add(key); }
  }
  if (dirty.size) await push();
  if (applied.length) window.dispatchEvent(new CustomEvent("tv:cloud-sync", { detail: { keys: applied } }));
  return applied;
}

// Signed in: start syncing as this user; signed out: stop (this browser keeps its copies)
export function setCloudSyncUser(nextUid: string | null) {
  installHook();
  if (nextUid === uid) return;
  uid = nextUid;
  dirty.clear();
  if (uid) pullAndMerge();
}

// Another device may have changed something while this tab was in the background
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && uid) pullAndMerge(); });
}

// Changes made before sign-in still get their time stamped
if (typeof window !== "undefined") installHook();
