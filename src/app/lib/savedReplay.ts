// A replay saved when leaving it ("Save this replay"), one per symbol: the bar it was on,
// so it can be continued later from the replay's starting-point menu.

const KEY = 'tv:savedReplays';

export interface SavedReplay { interval: string; time: number; savedAt: number }

function readAll(): Record<string, SavedReplay> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function getSavedReplay(symbol: string): SavedReplay | null {
  if (typeof window === 'undefined') return null;
  const r = readAll()[symbol];
  return r && typeof r.time === 'number' ? r : null;
}

export function saveReplay(symbol: string, replay: SavedReplay) {
  const all = readAll();
  all[symbol] = replay;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent('tv:saved-replay-changed'));
}
