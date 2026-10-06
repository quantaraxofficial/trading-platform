"use client";

// "Sync in layout" between the charts of a multi-chart layout (TradingView's Crosshair, Time and
// Date range options; Symbol and Interval are applied by the page). Each chart announces its own
// crosshair time / clicked time / visible date range and follows the others', matching times to
// its own bars (the charts may have different intervals). window.__layoutSync holds the options.

type Bar = { time: number; close: number };
type Flags = { multi?: boolean; crosshair?: boolean; time?: boolean; dateRange?: boolean };
const flags = (): Flags => (typeof window !== "undefined" && (window as any).__layoutSync) || {};

export function setLayoutSync(f: Flags) { (window as any).__layoutSync = f; }

// The last bar at or before t
function barAt(bars: Bar[], t: number): { bar: Bar; index: number } | null {
  let lo = 0, hi = bars.length - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].time <= t) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  if (found < 0) return bars.length ? { bar: bars[0], index: 0 } : null;
  return { bar: bars[found], index: found };
}

export function attachLayoutSync(chart: any, series: any, getBars: () => Bar[], src: string): () => void {
  let quietUntil = 0;           // ignore our own events caused by applying another chart's
  const quiet = (ms = 120) => { quietUntil = Date.now() + ms; };
  const send = (name: string, detail: object) => window.dispatchEvent(new CustomEvent(name, { detail: { src, ...detail } }));

  const onMove = (param: any) => {
    const f = flags();
    if (!f.multi || !f.crosshair || Date.now() < quietUntil) return;
    send("tv:sync-crosshair", { time: typeof param?.time === "number" ? param.time : null });
  };
  const onRange = () => {
    const f = flags();
    if (!f.multi || !f.dateRange || Date.now() < quietUntil) return;
    const r = chart.timeScale().getVisibleRange();
    if (r) send("tv:sync-range", { from: r.from, to: r.to });
  };
  const onClick = (param: any) => {
    const f = flags();
    if (!f.multi || !f.time || typeof param?.time !== "number") return;
    send("tv:sync-time", { time: param.time });
  };
  chart.subscribeCrosshairMove(onMove);
  chart.timeScale().subscribeVisibleTimeRangeChange(onRange);
  chart.subscribeClick(onClick);

  const onCrosshair = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d.src === src) return;
    quiet(60);
    try {
      if (d.time === null) { chart.clearCrosshairPosition(); return; }
      const hit = barAt(getBars(), d.time);
      if (hit) chart.setCrosshairPosition(hit.bar.close, hit.bar.time, series);
    } catch { /* chart gone */ }
  };
  const onSyncRange = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d.src === src) return;
    quiet();
    try { chart.timeScale().setVisibleRange({ from: d.from, to: d.to }); } catch { /* outside the data */ }
  };
  const onSyncTime = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d.src === src) return;
    const hit = barAt(getBars(), d.time);
    const r = chart.timeScale().getVisibleLogicalRange();
    if (!hit || !r) return;
    const half = (r.to - r.from) / 2;
    quiet();
    chart.timeScale().setVisibleLogicalRange({ from: hit.index - half, to: hit.index + half });
  };
  window.addEventListener("tv:sync-crosshair", onCrosshair);
  window.addEventListener("tv:sync-range", onSyncRange);
  window.addEventListener("tv:sync-time", onSyncTime);
  return () => {
    try { chart.unsubscribeCrosshairMove(onMove); chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange); chart.unsubscribeClick(onClick); } catch { /* chart removed */ }
    window.removeEventListener("tv:sync-crosshair", onCrosshair);
    window.removeEventListener("tv:sync-range", onSyncRange);
    window.removeEventListener("tv:sync-time", onSyncTime);
  };
}
