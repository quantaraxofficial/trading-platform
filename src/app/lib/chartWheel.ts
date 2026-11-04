"use client";

// The mouse wheel over the chart: TradingView's gestures, eased the way openmarket.xyz's chart
// does it (its titan engine: zoomEasing, zoomEaseRate 21.5):
//   wheel           zoom; bar spacing × 1.1 per 100 of deltaY, the right edge stays put (the
//                   gap after the last bar, in bars, is kept)
//   Ctrl + wheel    zoom around the cursor
//   Shift + wheel,
//   horizontal      pan, 0.8 px per unit of delta (Shift + wheel down goes back in time)
// Each event adds to a target instead of jumping there: every frame covers 1 − e^(−21.5·dt) of
// what's left (~30 % at 60 fps, settled in ~140 ms), so a notched wheel's steps flow together
// and a trackpad's stream stays smooth.
// Used for the chart canvas and the drawing layer above it, so both behave the same.

const MIN_BARS = 3;
const EASE_RATE = 21.5;        // per second
const MAX_STEP = 1.6;          // one event zooms at most ×1.6 / ÷1.6 (a fast trackpad flick)
const DONE = 8e-4;             // what's left counts as nothing below this

type Glide = {
  zoom: number;                // the zoom still to apply: a factor on the visible bar count
  anchor: number | null;       // Ctrl + wheel: where the cursor is, 0..1 across the pane; null: the right edge
  pan: number;                 // bars still to pan
  raf: number | null;
  last: number;
};
const glides = new WeakMap<object, Glide>();

function glideOf(chart: any): Glide {
  let g = glides.get(chart);
  if (!g) { g = { zoom: 1, anchor: null, pan: 0, raf: null, last: 0 }; glides.set(chart, g); }
  return g;
}

// Stops a glide in progress (a drag or another gesture takes over the chart)
export function stopChartGlide(chart: any) {
  const g = glides.get(chart);
  if (!g) return;
  if (g.raf !== null) cancelAnimationFrame(g.raf);
  g.raf = null; g.zoom = 1; g.pan = 0;
}

function frame(chart: any, g: Glide, now: number) {
  g.raf = null;
  const ts = chart?.timeScale?.();
  let lr: { from: number; to: number } | null = null;
  try { lr = ts?.getVisibleLogicalRange?.() ?? null; } catch { lr = null; }   // a removed chart
  if (!lr) { g.zoom = 1; g.pan = 0; return; }
  const dt = Math.min(0.05, Math.max(0.001, (now - (g.last || now - 16)) / 1000));
  g.last = now;
  const a = 1 - Math.exp(-EASE_RATE * dt);
  let { from, to } = lr;

  if (g.pan !== 0) {
    const step = Math.abs(g.pan) < 0.01 ? g.pan : g.pan * a;
    from += step; to += step;
    g.pan -= step;
  }
  if (g.zoom !== 1) {
    // a multiplicative target: this frame takes zoom^a of it
    let k = Math.abs(g.zoom - 1) < DONE ? g.zoom : Math.pow(g.zoom, a);
    const size = to - from;
    let next = size * k;
    if (next < MIN_BARS) { next = MIN_BARS; k = next / size; g.zoom = k; }   // as far in as it goes
    if (g.anchor !== null) {
      const at = from + g.anchor * size;
      from = at - g.anchor * next;
      to = at + (1 - g.anchor) * next;
    } else {
      from = to - next;
    }
    g.zoom /= k;
    if (Math.abs(g.zoom - 1) < DONE) g.zoom = 1;
  }
  try { ts.setVisibleLogicalRange({ from, to }); } catch { g.zoom = 1; g.pan = 0; return; }
  if (g.zoom !== 1 || g.pan !== 0) g.raf = requestAnimationFrame(t => frame(chart, g, t));
}

function run(chart: any, g: Glide) {
  if (g.raf !== null) return;
  g.last = performance.now() - 16;
  g.raf = requestAnimationFrame(t => frame(chart, g, t));
}

export function applyChartWheel(chart: any, e: WheelEvent, paneX: number): boolean {
  const ts = chart?.timeScale?.();
  const lr = ts?.getVisibleLogicalRange?.();
  const width = ts?.width?.();
  if (!lr || !width) return false;
  const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? width : 1;
  let dx = e.deltaX * unit, dy = e.deltaY * unit;
  if (e.shiftKey && dy && !dx) { dx = -dy; dy = 0; }
  const size = lr.to - lr.from;
  const g = glideOf(chart);
  if (dx && Math.abs(dx) >= Math.abs(dy)) {
    g.pan += (dx * 0.8) / (width / size);
    run(chart, g);
    return true;
  }
  if (!dy) return false;
  const k = Math.min(MAX_STEP, Math.max(1 / MAX_STEP, Math.pow(1.1, dy / 100)));   // > 1 zooms out
  // Already as far in as it goes: nothing to do
  if (k < 1 && size * g.zoom <= MIN_BARS + 1e-6) return true;
  const anchor = e.ctrlKey || e.metaKey ? Math.max(0, Math.min(1, paneX / width)) : null;
  // A different anchor finishes the glide in progress first (it was heading somewhere else)
  if (g.zoom !== 1 && g.anchor !== anchor) g.zoom = 1;
  g.anchor = anchor;
  g.zoom *= k;
  run(chart, g);
  return true;
}
