import React from 'react';
import { Line, Group } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { useSnap, useSnappedDrag } from '../core/snap';
import { HandleCircle } from '../core/Handles';
import { strokeOnlyHit } from '../core/textHit';

type Pt = { logical: number; price: number; time?: number };

interface RotatedRectangleToolProps {
  id: string;
  points: Pt[];
  stroke: string;
  strokeWidth: number;
  isSelected: boolean;
  isHovering?: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: Pt[]) => void;
  fill?: string;
  backgroundVisible?: boolean;
  isLocked?: boolean;
  // The shape still being placed (click 2 not made yet: just the A→B line)
  isPreview?: boolean;
}

// As TradingView draws it: click 1 and click 2 (points[0], points[1]) are the middles of two
// opposite sides — the rectangle's centre line — and the third point sets its width: the
// rectangle reaches as far on each side of that line as the third point is from it.
// Handles: the two centre-line ends (moving one keeps the width) and the four corners (each
// changes only the width).
export function RotatedRectangleTool({
  id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints,
  fill, backgroundVisible, isPreview = false,
}: RotatedRectangleToolProps) {
  const snap = useSnap(chart, series);
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  if (!chart || !series || points.length < 2) return null;

  const ax = logicalToPixel(chart, points[0].logical);
  const ay = priceToPixel(series, points[0].price);
  const bx = logicalToPixel(chart, points[1].logical);
  const by = priceToPixel(series, points[1].price);
  if (ax === null || ay === null || bx === null || by === null) return null;

  const color = stroke || '#4caf50';
  const len = Math.hypot(bx - ax, by - ay);
  // Unit normal to the centre line
  const nx = len > 0.0001 ? -(by - ay) / len : 0;
  const ny = len > 0.0001 ? (bx - ax) / len : 1;

  // Half the width: from the third point; a shape saved before the third point existed was a
  // square-ish box as wide as the line is long
  let half = 0;
  const hasWidth = points.length >= 3 || !isPreview;
  if (points.length >= 3) {
    const cx = logicalToPixel(chart, points[2].logical);
    const cy = priceToPixel(series, points[2].price);
    if (cx !== null && cy !== null) half = Math.abs((cx - ax) * nx + (cy - ay) * ny);
  } else if (!isPreview) {
    half = len;
  }

  const corners = [
    { x: ax + nx * half, y: ay + ny * half },
    { x: bx + nx * half, y: by + ny * half },
    { x: bx - nx * half, y: by - ny * half },
    { x: ax - nx * half, y: ay - ny * half },
  ];

  // A stored point at a pixel spot
  const at = (x: number, y: number): Pt | null => {
    const logical = pixelToLogical(chart, x), price = pixelToPrice(series, y);
    return logical === null || price === null ? null : { logical, price };
  };

  // A centre-line end follows the cursor (magnet applies); the width in pixels stays
  const dragEnd = (index: 0 | 1) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const p = snap(e.target.x(), e.target.y(), e.evt, e.target);
    if (!p) return;
    const nxp = logicalToPixel(chart, p.logical), nyp = priceToPixel(series, p.price);
    if (nxp === null || nyp === null) return;
    const [x0, y0, x1, y1] = index === 0 ? [nxp, nyp, bx, by] : [ax, ay, nxp, nyp];
    const l = Math.hypot(x1 - x0, y1 - y0);
    const pnx = l > 0.0001 ? -(y1 - y0) / l : 0, pny = l > 0.0001 ? (x1 - x0) / l : 1;
    const next = [...points];
    next[index] = { logical: p.logical, price: p.price, ...(p.time != null ? { time: p.time } : {}) };
    const w = at(x0 + pnx * half, y0 + pny * half);
    if (w) next[2] = w;
    onUpdatePoints(next.slice(0, 3));
  };

  // A corner changes only the width: it slides along its own side's normal
  const dragCorner = (i: number) => (e: any) => {
    e.cancelBubble = true;
    const base = i === 0 || i === 3 ? { x: ax, y: ay } : { x: bx, y: by };
    const sign = i === 0 || i === 1 ? 1 : -1;
    const reach = (e.target.x() - base.x) * nx + (e.target.y() - base.y) * ny;
    const h = Math.abs(reach);
    e.target.position({ x: base.x + nx * sign * h, y: base.y + ny * sign * h });
    if (!onUpdatePoints) return;
    const w = at(ax + nx * h, ay + ny * h);
    if (!w) return;
    onUpdatePoints([points[0], points[1], w]);
  };

  const showHandles = isSelected || isHovering;
  return (
    <Group id={id} draggable={!isPreview && (isSelected || isHovering)} onDragStart={move.start} onDragMove={move.drag} onDragEnd={(e) => move.end(e)}
      onClick={(e) => { e.cancelBubble = true; onSelect(); }} onTap={(e) => { e.cancelBubble = true; onSelect(); }}>
      {hasWidth ? (
        <Line
          points={corners.flatMap(p => [p.x, p.y])}
          stroke={color}
          strokeWidth={strokeWidth || 2}
          fill={backgroundVisible !== false ? (fill || 'rgba(76, 175, 80, 0.2)') : undefined}
          hitFunc={strokeOnlyHit}
          hitStrokeWidth={10}
          closed
          lineJoin="miter"
        />
      ) : (
        <Line points={[ax, ay, bx, by]} stroke={color} strokeWidth={strokeWidth || 2} hitStrokeWidth={10} />
      )}
      {showHandles && (
        <>
          <HandleCircle x={ax} y={ay} radius={6} fill="white" stroke="#2962ff" strokeWidth={1.5} draggable onDragStart={move.start} onDragMove={dragEnd(0)} onDragEnd={dragEnd(0)} />
          <HandleCircle x={bx} y={by} radius={6} fill="white" stroke="#2962ff" strokeWidth={1.5} draggable onDragStart={move.start} onDragMove={dragEnd(1)} onDragEnd={dragEnd(1)} />
          {hasWidth && corners.map((p, i) => (
            <HandleCircle key={i} x={p.x} y={p.y} radius={6} fill="white" stroke="#2962ff" strokeWidth={1.5} draggable onDragStart={move.start} onDragMove={dragCorner(i)} onDragEnd={dragCorner(i)} />
          ))}
        </>
      )}
    </Group>
  );
}
