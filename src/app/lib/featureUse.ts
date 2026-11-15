// Which features each signed-in person uses (Django Admin: a trader profile's "Features used" pie,
// and Site analytics). A feature's entry point calls trackFeature("drawing"); the counts ride along
// with the presence ping once a minute (components/PresencePing → core/presence.py), and when the
// tab is hidden. One use per feature per minute at most, so drawing twenty lines in a row is one use.
// The ids must match core/feature_use.py FEATURES.

export type FeatureId =
  | "chart_type" | "drawing" | "indicator" | "replay" | "backtest_session" | "collab" | "alert"
  | "orders" | "voice" | "snapshot" | "layout" | "watchlist" | "calendar" | "analytics" | "journal"
  | "pine" | "settings_file" | "background_image";

const THROTTLE_MS = 60_000;
const queue = new Map<FeatureId, number>();
const lastAt = new Map<FeatureId, number>();

export function trackFeature(id: FeatureId) {
  const now = Date.now();
  if (now - (lastAt.get(id) || 0) < THROTTLE_MS) return;
  lastAt.set(id, now);
  queue.set(id, (queue.get(id) || 0) + 1);
}

// What's waiting to be sent (and emptied): put back with restoreFeatures if the send fails
export function drainFeatures(): Record<string, number> | null {
  if (!queue.size) return null;
  const out = Object.fromEntries(queue);
  queue.clear();
  return out;
}

export function restoreFeatures(counts: Record<string, number> | null) {
  if (!counts) return;
  for (const [k, n] of Object.entries(counts)) queue.set(k as FeatureId, (queue.get(k as FeatureId) || 0) + n);
}
