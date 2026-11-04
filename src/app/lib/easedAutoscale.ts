"use client";

// The price axis gliding to its new range instead of snapping, as on openmarket.xyz (its titan
// engine: autoScaleEasing, autoScaleEaseRate 20): when zooming, panning or a new bar changes the
// visible high / low, the auto-scaled range moves 1 − e^(−20·dt) of the way each frame (~28 % at
// 60 fps, settled in ~150 ms). A series' autoscaleInfoProvider hands lightweight-charts the eased
// range; while it's still moving, the next frame asks for a recompute.
// snap(): the next range is taken as is (new data: a symbol or interval switch shouldn't glide
// in from the old prices).

const RATE = 20;          // per second
const SETTLED = 1e-3;     // of the range's height

export function easedAutoscale(recompute: () => void) {
  let cur: { min: number; max: number } | null = null;
  let last = 0;
  let snapNext = true;
  let raf: number | null = null;

  const provider = (original: () => any) => {
    const r = original();
    const t = r?.priceRange;
    if (!t || !isFinite(t.minValue) || !isFinite(t.maxValue)) return r;
    const now = performance.now();
    if (!cur || snapNext) {
      cur = { min: t.minValue, max: t.maxValue };
      snapNext = false;
      last = now;
      return r;
    }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const a = 1 - Math.exp(-RATE * dt);
    cur = { min: cur.min + (t.minValue - cur.min) * a, max: cur.max + (t.maxValue - cur.max) * a };
    const span = Math.max(t.maxValue - t.minValue, Math.abs(t.maxValue) * 1e-6, 1e-12);
    if (Math.abs(cur.min - t.minValue) < span * SETTLED && Math.abs(cur.max - t.maxValue) < span * SETTLED) {
      cur = { min: t.minValue, max: t.maxValue };
      return r;
    }
    if (raf === null) raf = requestAnimationFrame(() => { raf = null; recompute(); });
    return { ...r, priceRange: { minValue: cur.min, maxValue: cur.max } };
  };

  return {
    provider,
    snap: () => { snapNext = true; },
    dispose: () => { if (raf !== null) cancelAnimationFrame(raf); raf = null; },
  };
}
