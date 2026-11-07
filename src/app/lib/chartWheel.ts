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
// A price axis set by hand (dragged or wheeled: autoscale off) would stay frozen while zooming,
// the candles running off it; instead it keeps where it sat against the visible bars' high and
// low (its stretch and its shift), so the zoom follows the bars as it does with autoscale on.

import { mainPriceScale, mainScaleSide } from "./priceScaleSide";

const MIN_BARS = 3;
const EASE_RATE = 21.5;        // per second
const MAX_STEP = 1.6;          // one event zooms at most ×1.6 / ÷1.6 (a fast trackpad flick)
const DONE = 8e-4;             // what's left counts as nothing below this

// The hand-set price range as a share of the visible bars' low..high
type PriceFit = { series: any; scale: any; u: number; v: number };

type Glide = {
  zoom: number;                // the zoom still to apply: a factor on the visible bar count
  anchor: number | null;       // Ctrl + wheel: where the cursor is, 0..1 across the pane; null: the right edge
  pan: number;                 // bars still to pan
  fit: PriceFit | null;        // a hand-set price axis kept against the bars while zooming
  raf: number | null;
  last: number;
};
const glides = new WeakMap<object, Glide>();

function glideOf(chart: any): Glide {
  let g = glides.get(chart);
  if (!g) { g = { zoom: 1, anchor: null, pan: 0, fit: null, raf: null, last: 0 }; glides.set(chart, g); }
  return g;
}

// Stops a glide in progress (a drag or another gesture takes over the chart)
export function stopChartGlide(chart: any) {
  const g = glides.get(chart);
  if (!g) return;
  if (g.raf !== null) cancelAnimationFrame(g.raf);
  g.raf = null; g.zoom = 1; g.pan = 0; g.fit = null;
}

// The low and high of the bars across a logical range (null: none there)
function barsLowHigh(series: any, from: number, to: number): { lo: number; hi: number } | null {
  let data: any[];
  try { data = series.data(); } catch { return null; }
  const i0 = Math.max(0, Math.floor(from)), i1 = Math.min(data.length - 1, Math.ceil(to));
  let lo = Infinity, hi = -Infinity;
  for (let i = i0; i <= i1; i++) {
    const b = data[i];
    const l = typeof b?.low === "number" ? b.low : b?.value, h = typeof b?.high === "number" ? b.high : b?.value;
    if (typeof l === "number" && l < lo) lo = l;
    if (typeof h === "number" && h > hi) hi = h;
  }
  return hi >= lo ? { lo, hi } : null;
}

// The main price scale, when it's set by hand: its range against the bars on screen now
function captureFit(chart: any, lr: { from: number; to: number }): PriceFit | null {
  try {
    const scale = mainPriceScale(chart);
    const o = scale.options();
    // (normal scale only: on a log scale the library's setVisibleRange blanks the axis, even given
    // back the range it just returned; percent / indexed ranges aren't prices)
    if (o.autoScale || o.mode !== 0) return null;
    const side = mainScaleSide(chart);
    // (a series on the default scale has no priceScaleId: that's the right one)
    const all = chart.panes()[0].getSeries();
    const series = all.find((s: any) => (s.options().priceScaleId || "right") === side) ?? all[0];
    const range = scale.getVisibleRange();
    if (!series || !range) return null;
    const r = barsLowHigh(series, lr.from, lr.to);
    if (!r || r.hi - r.lo <= 0) return null;
    const span = r.hi - r.lo;
    return { series, scale, u: (range.from - r.lo) / span, v: (range.to - r.lo) / span };
  } catch { return null; }
}

function applyFit(fit: PriceFit, from: number, to: number) {
  const r = barsLowHigh(fit.series, from, to);
  if (!r) return;
  const span = Math.max(r.hi - r.lo, Math.abs(r.hi) * 1e-9, 1e-12);
  try { fit.scale.setVisibleRange({ from: r.lo + fit.u * span, to: r.lo + fit.v * span }); } catch { /* chart removed */ }
}

function frame(chart: any, g: Glide, now: number) {
  g.raf = null;
  const ts = chart?.timeScale?.();
  let lr: { from: number; to: number } | null = null;
  try { lr = ts?.getVisibleLogicalRange?.() ?? null; } catch { lr = null; }   // a removed chart
  if (!lr) { g.zoom = 1; g.pan = 0; g.fit = null; return; }
  const dt = Math.min(0.05, Math.max(0.001, (now - (g.last || now - 16)) / 1000));
  g.last = now;
  const a = 1 - Math.exp(-EASE_RATE * dt);
  let { from, to } = lr;

  if (g.pan !== 0) {
    const step = Math.abs(g.pan) < 0.01 ? g.pan : g.pan * a;
    from += step; to += step;
    g.pan -= step;
  }
  const zoomed = g.zoom !== 1;
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
  // (the price range first: the time range's listeners redraw the drawings with both in place)
  if (g.fit && zoomed) applyFit(g.fit, from, to);
  try { ts.setVisibleLogicalRange({ from, to }); } catch { g.zoom = 1; g.pan = 0; g.fit = null; return; }
  if (g.fit && zoomed) window.dispatchEvent(new CustomEvent("tv-price-scale-changed"));
  if (g.zoom !== 1 || g.pan !== 0) g.raf = requestAnimationFrame(t => frame(chart, g, t));
  else g.fit = null;
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
  if (!g.fit) g.fit = captureFit(chart, lr);
  g.zoom *= k;
  run(chart, g);
  return true;
}
