import { flushSync } from 'react-dom';

// Keeps drawings locked to the chart while it zooms and pans. Range-change events arrive
// after lightweight-charts has painted, so anything redrawn from them lags a frame behind
// the candles (it shakes), and price-scale moves fire no event at all. Instead a series
// primitive is told by lightweight-charts itself, inside its paint, that a frame is about
// to be drawn; if the time/price mapping changed, every subscriber re-renders there and
// then (one synchronous React pass), and the "after" hooks draw their canvases right away.

type Fn = () => void;
interface Hub { tick: Set<Fn>; after: Set<Fn>; detach: Fn; sig: string }
const hubs = new WeakMap<object, Hub>();

function mappingSignature(chart: any, series: any): string {
  const ts = chart.timeScale();
  const r = ts.getVisibleLogicalRange();
  const p0 = series.coordinateToPrice(0);
  const p1 = series.coordinateToPrice(100);
  return `${r?.from}|${r?.to}|${ts.width()}|${p0}|${p1}`;
}

function hubFor(chart: any, series: any): Hub {
  let hub = hubs.get(series);
  if (hub) return hub;
  const h: Hub = { tick: new Set(), after: new Set(), detach: () => {}, sig: '' };
  const primitive = {
    updateAllViews() {
      let sig: string;
      try { sig = mappingSignature(chart, series); } catch { return; }
      if (sig === h.sig) return;
      h.sig = sig;
      if (h.tick.size) flushSync(() => h.tick.forEach(f => f()));
      h.after.forEach(f => f());
    },
    paneViews: () => [],
  };
  series.attachPrimitive(primitive);
  h.detach = () => { try { series.detachPrimitive(primitive); } catch { /* series already removed */ } };
  hubs.set(series, h);
  return h;
}

function release(series: any, h: Hub) {
  if (h.tick.size || h.after.size) return;
  h.detach();
  hubs.delete(series);
}

// `fn` runs (inside one synchronous React pass) whenever the chart's mapping changed this frame
export function subscribeChartFrame(chart: any, series: any, fn: Fn): Fn {
  const h = hubFor(chart, series);
  h.tick.add(fn);
  return () => { h.tick.delete(fn); release(series, h); };
}

// `fn` runs right after that pass, still inside the chart's paint (e.g. to draw a canvas now)
export function afterChartFrame(chart: any, series: any, fn: Fn): Fn {
  const h = hubFor(chart, series);
  h.after.add(fn);
  return () => { h.after.delete(fn); release(series, h); };
}
