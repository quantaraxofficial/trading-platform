import React from 'react';
import { Line, Group } from 'react-konva';
import { logicalToPixel, priceToPixel } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { useSnap, useSnappedDrag } from '../core/snap';
import { HandleCircle, HandleRect } from '../core/Handles';

// TradingView's Horizontal line, Vertical line and Cross line: lines across the whole chart
// through one point. A horizontal line moves only in price and a vertical one only in time
// (a cross line both). Their handle doesn't sit at the point you clicked: the horizontal
// line's is a little square 90% of the way across the chart, the vertical line's 90% of the
// way down, and the cross line's a circle where its two lines cross. Their price / time
// labels on the axes are drawn by AxisHighlights.
export type InfiniteLineKind = 'horizontal_line' | 'vertical_line' | 'cross_line';

interface InfiniteLineToolProps {
  id: string;
  kind: InfiniteLineKind;
  points: { logical: number; price: number; time?: number }[];
  stroke: string;
  strokeWidth: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted' | string;
  isSelected: boolean;
  isHovering?: boolean;
  chart: any;
  series: any;
  onSelect: () => void;
  onUpdatePoints?: (points: any[]) => void;
  isLocked?: boolean;
}

const FAR = 100000;

export function InfiniteLineTool({
  id, kind, points, stroke, strokeWidth, lineStyle = 'solid',
  isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints, isLocked = false,
}: InfiniteLineToolProps) {
  const snap = useSnap(chart, series);
  // Moving the line keeps it on its own axis: a horizontal line changes only its price, a
  // vertical one only its time
  const constrainedUpdate = (pts: any[]) => {
    const p0 = points[0];
    if (!onUpdatePoints || !pts[0] || !p0) return;
    if (kind === 'horizontal_line') onUpdatePoints([{ ...p0, price: pts[0].price }]);
    else if (kind === 'vertical_line') onUpdatePoints([{ ...p0, logical: pts[0].logical, time: pts[0].time }]);
    else onUpdatePoints(pts);
  };
  const move = useSnappedDrag(chart, series, points, constrainedUpdate);
  useChartTick(chart, series);
  if (points.length < 1) return null;

  const p = points[0];
  const x = logicalToPixel(chart, p.logical);
  const y = priceToPixel(series, p.price);
  const horizontal = kind !== 'vertical_line';
  const vertical = kind !== 'horizontal_line';
  if ((horizontal && y === null) || (vertical && x === null)) return null;

  let paneW = 0, paneH = 0;
  try { const s = chart.paneSize(); paneW = s.width; paneH = s.height; } catch { /* chart not laid out yet */ }

  const dash = lineStyle === 'dashed' || lineStyle === 'Dashed' ? [10, 10] : lineStyle === 'dotted' || lineStyle === 'Dotted' ? [2, 4] : [];

  // Dragging the handle moves the line along its own axis only
  const onHandleDrag = (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const snapped = snap(e.target.x(), e.target.y(), e.evt, e.target);
    if (!snapped) return;
    if (kind === 'horizontal_line') onUpdatePoints([{ ...p, price: snapped.price }]);
    else if (kind === 'vertical_line') onUpdatePoints([{ ...p, logical: snapped.logical, time: snapped.time }]);
    else onUpdatePoints([snapped]);
  };
  const onGroupDragEnd = (e: any) => { move.end(e); };

  const showHandles = (isSelected || isHovering) && !isLocked;
  return (
    <Group
      id={id}
      draggable={(isSelected || isHovering) && !isLocked}
      onDragStart={move.start}
      onDragMove={move.drag}
      onDragEnd={onGroupDragEnd}
      onClick={onSelect}
      onTap={onSelect}
    >
      {horizontal && y !== null && (
        <Line points={[-FAR, y, FAR, y]} stroke={stroke} strokeWidth={strokeWidth} dash={dash} hitStrokeWidth={10} />
      )}
      {vertical && x !== null && (
        <Line points={[x, -FAR, x, FAR]} stroke={stroke} strokeWidth={strokeWidth} dash={dash} hitStrokeWidth={10} />
      )}
      {showHandles && kind === 'horizontal_line' && y !== null && (
        <HandleRect x={paneW * 0.9} y={y} width={9} height={9} offsetX={4.5} offsetY={4.5} cornerRadius={2}
          fill="white" stroke="#2962ff" strokeWidth={1.5} draggable
          onDragStart={(e: any) => { e.cancelBubble = true; }} onDragMove={onHandleDrag} onDragEnd={onHandleDrag} />
      )}
      {showHandles && kind === 'vertical_line' && x !== null && (
        <HandleRect x={x} y={paneH * 0.9} width={9} height={9} offsetX={4.5} offsetY={4.5} cornerRadius={2}
          fill="white" stroke="#2962ff" strokeWidth={1.5} draggable
          onDragStart={(e: any) => { e.cancelBubble = true; }} onDragMove={onHandleDrag} onDragEnd={onHandleDrag} />
      )}
      {showHandles && kind === 'cross_line' && x !== null && y !== null && (
        <HandleCircle x={x} y={y} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable
          onDragStart={(e: any) => { e.cancelBubble = true; }} onDragMove={onHandleDrag} onDragEnd={onHandleDrag} />
      )}
    </Group>
  );
}
