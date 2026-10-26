// Where a point on the main chart is, as a bar time and a price, and back. Times go between
// bars and past the last one, so a cursor lands in the same place on everyone's chart even when
// they have different amounts of history loaded.

function bars(): { time: number }[] {
  return (typeof window !== "undefined" && (window as any).__chartFullData) || [];
}

export function timeToLogical(time: number): number | null {
  const b = bars();
  if (!b.length) return null;
  let lo = 0, hi = b.length - 1;
  if (time >= b[hi].time) {
    const step = hi > 0 ? b[hi].time - b[hi - 1].time : 60;
    return hi + (time - b[hi].time) / (step || 60);
  }
  if (time <= b[0].time) return 0;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (b[mid].time <= time) lo = mid; else hi = mid;
  }
  const span = b[hi].time - b[lo].time;
  return lo + (span > 0 ? (time - b[lo].time) / span : 0);
}

export function logicalToTime(logical: number): number | null {
  const b = bars();
  if (!b.length) return null;
  const last = b.length - 1;
  if (logical >= last) {
    const step = last > 0 ? b[last].time - b[last - 1].time : 60;
    return b[last].time + (logical - last) * (step || 60);
  }
  if (logical <= 0) return b[0].time;
  const i = Math.floor(logical);
  return b[i].time + (logical - i) * (b[i + 1].time - b[i].time);
}

// The main chart's plot area on screen (without its price scales and time axis)
export function chartPane(): { left: number; top: number; width: number; height: number } | null {
  const chart = (window as any).__chartInstance;
  let el: HTMLElement | null = null;
  try { el = chart?.chartElement?.() ?? null; } catch { el = null; }
  if (!chart || !el) return null;
  const rect = el.getBoundingClientRect();
  let width = rect.width, height = rect.height, leftScale = 0;
  try {
    width = chart.timeScale().width();
    height = chart.paneSize?.(0)?.height ?? rect.height - (chart.timeScale().height?.() ?? 28);
    leftScale = chart.priceScale("left")?.width?.() ?? 0;
  } catch { /* the defaults */ }
  return { left: rect.left + leftScale, top: rect.top, width, height };
}
