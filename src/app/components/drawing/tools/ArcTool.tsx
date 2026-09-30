import React, { useState } from 'react';
import { Shape, Group, Circle, Line } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface ArcToolProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  strokeWidth: number;
  fill?: string;
  isSelected: boolean;
  isHovering?: boolean;
  isLocked?: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
}

// Matches TradingView's Arc: points[0] and points[1] are the ends of the chord, and
// points[2] only sets the arc's height — its signed perpendicular distance from the chord.
// The peak always sits on the chord's perpendicular bisector, so the arc is symmetric,
// and the curve is a parabola through that peak (a quadratic Bézier whose control point
// is 2·peak − midpoint). Only the curve is stroked; the chord side is fill only.
export function ArcTool({ id, points, stroke, strokeWidth, fill, isSelected, isHovering = false, isLocked = false, chart, series, onSelect, onUpdatePoints }: ArcToolProps) {
  useChartTick(chart);
  // shadowBlur is redrawn every frame of a drag — switched off for the drag's duration
  const [isDragging, setIsDragging] = useState(false);
  if (!chart || !series || points.length < 2) return null;

  const ax = logicalToPixel(chart, points[0].logical);
  const ay = priceToPixel(series, points[0].price);
  const bx = logicalToPixel(chart, points[1].logical);
  const by = priceToPixel(series, points[1].price);
  if (ax === null || ay === null || bx === null || by === null) return null;

  const color = isSelected ? '#2962ff' : stroke;

  // Between clicks 1 and 2 there is only the chord, drawn as a plain line
  if (points.length < 3) {
    return (
      <Group id={id} listening={false}>
        <Line points={[ax, ay, bx, by]} stroke={color} strokeWidth={strokeWidth} lineCap="round" />
        <Circle x={ax} y={ay} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} />
      </Group>
    );
  }

  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const chord = Math.hypot(bx - ax, by - ay);
  const nx = chord > 0.0001 ? -(by - ay) / chord : 0;
  const ny = chord > 0.0001 ? (bx - ax) / chord : -1;

  const cx = logicalToPixel(chart, points[2].logical);
  const cy = priceToPixel(series, points[2].price);
  const height = cx === null || cy === null ? 0 : (cx - mx) * nx + (cy - my) * ny;

  const peakX = mx + nx * height;
  const peakY = my + ny * height;
  const ctrlX = mx + 2 * nx * height;
  const ctrlY = my + 2 * ny * height;

  const toPoint = (px: number, py: number) => {
    const logical = pixelToLogical(chart, px);
    const price = pixelToPrice(series, py);
    return logical === null || price === null ? null : { logical, price };
  };

  const handleDragStart = (e: any) => { e.cancelBubble = true; setIsDragging(true); };

  const handleGroupDragEnd = (e: any) => {
    setIsDragging(false);
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className === 'Circle') return;
    const dx = node.x();
    const dy = node.y();
    const moved = points.map(p => toPoint((logicalToPixel(chart, p.logical) ?? 0) + dx, (priceToPixel(series, p.price) ?? 0) + dy));
    if (moved.every(Boolean)) onUpdatePoints(moved as { logical: number; price: number }[]);
    node.position({ x: 0, y: 0 });
  };

  // Moving an end keeps the arc's height: the peak is re-placed on the new chord's
  // bisector at the same perpendicular distance, so the arc tilts with the chord.
  const handleEndMove = (index: 0 | 1) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const px = e.target.x();
    const py = e.target.y();
    const ox = index === 0 ? bx : ax;
    const oy = index === 0 ? by : ay;
    const nmx = (px + ox) / 2;
    const nmy = (py + oy) / 2;
    const ddx = index === 0 ? ox - px : px - ox;
    const ddy = index === 0 ? oy - py : py - oy;
    const len = Math.hypot(ddx, ddy);
    const nnx = len > 0.0001 ? -ddy / len : 0;
    const nny = len > 0.0001 ? ddx / len : -1;
    const end = toPoint(px, py);
    const peak = toPoint(nmx + nnx * height, nmy + nny * height);
    if (!end || !peak) return;
    const next = [...points];
    next[index] = end;
    next[2] = peak;
    onUpdatePoints(next);
  };

  // The peak handle only changes the height — its position is projected onto the bisector.
  // The node is pinned there directly: with a level chord the projected x never changes,
  // so React wouldn't re-apply it and the circle would stay wherever the cursor dragged it.
  const handlePeakMove = (e: any) => {
    e.cancelBubble = true;
    const h = (e.target.x() - mx) * nx + (e.target.y() - my) * ny;
    e.target.position({ x: mx + nx * h, y: my + ny * h });
    if (!onUpdatePoints) return;
    const peak = toPoint(mx + nx * h, my + ny * h);
    if (!peak) return;
    const next = [...points];
    next[2] = peak;
    onUpdatePoints(next);
  };

  const endDrag = (move: (e: any) => void) => (e: any) => { move(e); setIsDragging(false); };

  return (
    <Group id={id} draggable={(isSelected || isHovering) && !isLocked} onDragStart={handleDragStart} onDragEnd={handleGroupDragEnd} onClick={onSelect} onTap={onSelect}>
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo(ctrlX, ctrlY, bx, by);
          ctx.closePath();
          ctx.fillShape(shape);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo(ctrlX, ctrlY, bx, by);
          ctx.strokeShape(shape);
        }}
        hitFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo(ctrlX, ctrlY, bx, by);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }}
        stroke={color}
        strokeWidth={strokeWidth}
        fill={fill || (stroke || '#2962ff') + '33'}
        hitStrokeWidth={10}
        lineCap="round"
        shadowColor={isSelected ? stroke : 'transparent'}
        shadowBlur={isSelected && !isDragging ? 4 : 0}
      />

      {(isSelected || isHovering) && (
        <>
          <Circle x={ax} y={ay} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable={!isLocked} onDragStart={handleDragStart} onDragMove={handleEndMove(0)} onDragEnd={endDrag(handleEndMove(0))} />
          <Circle x={bx} y={by} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable={!isLocked} onDragStart={handleDragStart} onDragMove={handleEndMove(1)} onDragEnd={endDrag(handleEndMove(1))} />
          <Circle x={peakX} y={peakY} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable={!isLocked} onDragStart={handleDragStart} onDragMove={handlePeakMove} onDragEnd={endDrag(handlePeakMove)} />
        </>
      )}
    </Group>
  );
}
