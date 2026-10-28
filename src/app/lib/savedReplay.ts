// A replay saved when leaving it ("Save this replay"), one per symbol: the bar it was on and the
// timeframe, so it can be continued later from the replay's starting-point menu. Kept in your
// account (backend core/analytics.py → SavedReplay), so it's there on any browser or device. A save
// the server couldn't take (offline) waits in this browser and is sent next time; replays saved in
// this browser before they were kept in the account are moved into it once you're signed in.

import { BACKEND } from './collab/session';
import { sessionKey } from '@/lib/backend';

export interface SavedReplay { interval: string; time: number; savedAt: number }
type BySymbol = Record<string, SavedReplay>;

const LEGACY_KEY = 'tv:savedReplays';   // this browser's, from before they were kept in the account
const pendingKey = (uid: string) => `tv:savedReplays:pending:${uid}`;

let uid: string | null = null;
let account: BySymbol = {};

function read(key: string): BySymbol {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
}
function write(key: string, v: BySymbol) {
  try { if (Object.keys(v).length) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); } catch { /* storage unavailable */ }
}
const changed = () => window.dispatchEvent(new CustomEvent('tv:saved-replay-changed'));
const newest = (...rs: (SavedReplay | undefined)[]) => rs.reduce<SavedReplay | null>((a, r) => (r && (!a || r.savedAt > a.savedAt) ? r : a), null);
const url = (user: string) => `${BACKEND}/api/users/analytics/${encodeURIComponent(user)}/replays/?session_key=${encodeURIComponent(sessionKey())}`;

async function put(user: string, symbol: string, r: SavedReplay) {
  const res = await fetch(url(user), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, ...r }) });
  if (!res.ok) throw new Error(`Saving the replay failed (${res.status})`);
}

// Signed in as this user (null: signed out): their saved replays, then anything waiting is sent
export async function setSavedReplayUser(next: string | null) {
  if (next === uid) return;
  uid = next;
  account = {};
  changed();
  if (!next) return;
  try {
    const res = await fetch(url(next));
    if (!res.ok) return;
    const d = await res.json();
    if (uid !== next) return;
    account = Object.fromEntries((d.replays || []).map((r: any) => [r.symbol, { interval: r.interval, time: r.time, savedAt: r.savedAt }]));
    changed();
  } catch { return; }
  for (const key of [pendingKey(next), LEGACY_KEY]) {
    const waiting = read(key);
    for (const [symbol, r] of Object.entries(waiting)) {
      try {
        await put(next, symbol, r);
        if (uid === next && (!account[symbol] || account[symbol].savedAt < r.savedAt)) account = { ...account, [symbol]: r };
        delete waiting[symbol];
      } catch { /* offline: next time */ }
    }
    write(key, waiting);
  }
  changed();
}

export function getSavedReplay(symbol: string): SavedReplay | null {
  if (typeof window === 'undefined') return null;
  const r = uid ? newest(account[symbol], read(pendingKey(uid))[symbol]) : newest(read(LEGACY_KEY)[symbol]);
  return r && typeof r.time === 'number' ? r : null;
}

export function saveReplay(symbol: string, replay: SavedReplay) {
  if (!uid) {
    // (bar replay needs signing in; kept in this browser until then)
    write(LEGACY_KEY, { ...read(LEGACY_KEY), [symbol]: replay });
    changed();
    return;
  }
  const user = uid;
  account = { ...account, [symbol]: replay };
  changed();
  put(user, symbol, replay).catch(() => write(pendingKey(user), { ...read(pendingKey(user)), [symbol]: replay }));
}
