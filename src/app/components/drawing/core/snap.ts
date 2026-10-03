import { useRef } from 'react';
import { useDrawing } from './DrawingContext';
import { logicalToPixel, pixelToLogical, pixelToPrice, priceToPixel } from './coordinates';

export type MagnetMode = 'off' | 'weak' | 'strong';
export type SnappedPoint = { logical: number; price: number; time: number | null };

const WEAK_MAGNET_PX = 30;

// Holding Ctrl inverts the magnet: off becomes strong, weak/strong become off
export function effectiveMagnet(mode: MagnetMode, ctrl: boolean): MagnetMode {
  if (mode === 'off') return ctrl ? 'strong' : 'off';
  return ctrl ? 'off' : mode;
}

// Time at a fractional logical index, extrapolated past the last bar at its bar spacing
function timeAtLogical(data: any[], logical: number): number | null {
  const i = Math.floor(logical);
  if (i >= 0 && i + 1 < data.length) return data[i].time + (logical - i) * (data[i + 1].time - data[i].time);
  if (i >= data.length - 1 && data.length >= 2) {
    const last = data[data.length - 1].time;
    return last + (logical - (data.length - 1)) * (last - data[data.length - 2].time);
  }
  return null;
}

// Where a pointer at (x, y) lands on the chart: pinned to the nearest candle's center, and
// with the magnet on, to that candle's nearest open/high/low/close. Freehand strokes keep
// their raw x so they stay smooth. Placing and resizing share this so both snap the same.
export function snapToChart(chart: any, series: any, x: number, y: number, magnet: MagnetMode, freehand = false): SnappedPoint | null {
  const rawLogical = pixelToLogical(chart, x);
  const rawPrice = pixelToPrice(series, y);
  if (rawLogical === null || rawPrice === null) return null;
  const data: any[] = (window as any).__chartFullData || [];
  let logical = rawLogical;
  let price = rawPrice;
  let time = timeAtLogical(data, rawLogical) ?? (chart.timeScale().coordinateToTime(x) as number | null) ?? null;

  const idx = Math.round(rawLogical);
  const candle = idx >= 0 && idx < data.length ? data[idx] : null;
  if (!candle) return { logical, price, time };

  let onCandle = !freehand;
  if (magnet !== 'off') {
    let best = { val: rawPrice, dist: Infinity };
    for (const val of [candle.open, candle.high, candle.low, candle.close]) {
      const py = priceToPixel(series, val);
      if (py === null) continue;
      const dist = Math.abs(y - py);
      if (dist < best.dist) best = { val, dist };
    }
    if (magnet === 'strong' || best.dist < WEAK_MAGNET_PX) {
      price = best.val;
      onCandle = true;
    }
  }
  if (onCandle) {
    logical = idx;
    time = candle.time;
  }
  return { logical, price, time };
}

// Moving a whole shape by (dx, dy) pixels: the point nearest where it was grabbed snaps
// like a placed point, and every point shifts by that same bar/price offset so the shape
// stays rigid and moves in whole bars.
export function useSnapMove(chart: any, series: any) {
  const snap = useSnap(chart, series);
  return <P extends { logical: number; price: number; time?: any }>(points: P[], dx: number, dy: number, evt?: any, stage?: any): P[] | null => {
    const px = points.map(p => ({ x: logicalToPixel(chart, p.logical), y: priceToPixel(series, p.price) }));
    const pointer = stage?.getPointerPosition?.();
    let a = 0;
    if (pointer) {
      const gx = pointer.x - dx, gy = pointer.y - dy;
      let best = Infinity;
      px.forEach((q, i) => {
        if (q.x === null || q.y === null) return;
        const d = Math.hypot(q.x - gx, q.y - gy);
        if (d < best) { best = d; a = i; }
      });
    }
    if (px[a].x === null || px[a].y === null) return null;
    const s = snap(px[a].x! + dx, px[a].y! + dy, evt);
    if (!s) return null;
    const dL = s.logical - points[a].logical;
    const dP = s.price - points[a].price;
    const data: any[] = (window as any).__chartFullData || [];
    return points.map(p => {
      const logical = p.logical + dL;
      return { ...p, logical, price: p.price + dP, time: timeAtLogical(data, logical) ?? p.time } as P;
    });
  };
}

// Live, snapped whole-shape drag for a tool's Group: `start` on drag start, `drag` as the
// Group's onDragMove, `end` from its drag end. The Group is put back at 0,0 on every move
// (Konva then reports the total offset since drag start), so the shape is redrawn from its
// snapped points instead of sliding with the raw cursor. Handle drags are ignored.
export function useSnappedDrag<P extends { logical: number; price: number; time?: any }>(
  chart: any, series: any, points: P[], onUpdatePoints?: (points: P[]) => void,
) {
  const snapMove = useSnapMove(chart, series);
  const startRef = useRef<P[] | null>(null);
  const isGroupDrag = (e: any) => e.target === e.currentTarget;
  const apply = (e: any) => {
    const start = startRef.current;
    const node = e.target;
    const dx = node.x(), dy = node.y();
    node.position({ x: 0, y: 0 });
    if (!start || !onUpdatePoints || (dx === 0 && dy === 0)) return;
    const next = snapMove(start, dx, dy, e.evt, node.getStage?.());
    if (next) onUpdatePoints(next);
  };
  return {
    start: (e: any) => { if (isGroupDrag(e)) startRef.current = points; },
    drag: (e: any) => { if (isGroupDrag(e)) apply(e); },
    // True when this was a whole-shape drag (handled here)
    end: (e: any): boolean => {
      if (!isGroupDrag(e)) return false;
      apply(e);
      startRef.current = null;
      return true;
    },
  };
}

// For drawing tools' drag handles: snaps like placing does, honouring the magnet and Ctrl.
// Konva keeps a dragged node on the raw cursor, so the handle being dragged (if passed) is
// moved onto the snapped point, else it would drift off the shape's corner mid-drag.
export function useSnap(chart: any, series: any) {
  const { magnetMode } = useDrawing();
  return (x: number, y: number, evt?: { ctrlKey?: boolean; metaKey?: boolean } | null, node?: any): SnappedPoint | null => {
    const pt = snapToChart(chart, series, x, y, effectiveMagnet(magnetMode, !!(evt?.ctrlKey || evt?.metaKey)));
    if (pt && node?.position) {
      const px = logicalToPixel(chart, pt.logical);
      const py = priceToPixel(series, pt.price);
      if (px !== null && py !== null) node.position({ x: px, y: py });
    }
    return pt;
  };
}
