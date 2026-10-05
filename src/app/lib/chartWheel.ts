"use client";

// The mouse wheel over the chart, as TradingView does it (measured on TradingView Desktop):
//   wheel           zoom; bar spacing × 1.1 per 100 of deltaY, the right edge stays put (the
//                   gap after the last bar, in bars, is kept), applied at once — no animation
//   Ctrl + wheel    zoom around the cursor
//   Shift + wheel,
//   horizontal      pan, 0.8 px per unit of delta (Shift + wheel down goes back in time)
// Used for the chart canvas and the drawing layer above it, so both behave the same.

const MIN_BARS = 3;

export function applyChartWheel(chart: any, e: WheelEvent, paneX: number): boolean {
  const ts = chart?.timeScale?.();
  const lr = ts?.getVisibleLogicalRange?.();
  const width = ts?.width?.();
  if (!lr || !width) return false;
  const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? width : 1;
  let dx = e.deltaX * unit, dy = e.deltaY * unit;
  if (e.shiftKey && dy && !dx) { dx = -dy; dy = 0; }
  const size = lr.to - lr.from;
  if (dx && Math.abs(dx) >= Math.abs(dy)) {
    const bars = (dx * 0.8) / (width / size);
    ts.setVisibleLogicalRange({ from: lr.from + bars, to: lr.to + bars });
    return true;
  }
  if (!dy) return false;
  const k = Math.pow(1.1, dy / 100);            // > 1 zooms out
  const next = Math.max(MIN_BARS, size * k);
  if (next === size) return true;
  if (e.ctrlKey || e.metaKey) {
    const anchor = lr.from + (Math.max(0, Math.min(width, paneX)) / width) * size;
    const r = (anchor - lr.from) / size;
    ts.setVisibleLogicalRange({ from: anchor - r * next, to: anchor + (1 - r) * next });
  } else {
    ts.setVisibleLogicalRange({ from: lr.to - next, to: lr.to });
  }
  return true;
}
