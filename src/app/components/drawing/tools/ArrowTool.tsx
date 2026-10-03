import React, { useState } from 'react';
import { Line, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { useSnap, useSnappedDrag } from '../core/snap';
import { HandleCircle } from '../core/Handles';

interface ArrowToolProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  strokeWidth: number;
  lineStyle?: 'Solid' | 'Dashed' | 'Dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  isSelected: boolean;
  isHovering?: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
}

export function ArrowTool({
  id, points, stroke, strokeWidth, lineStyle = 'Solid', extendLeft = false, extendRight = false, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints
}: ArrowToolProps) {
  const snap = useSnap(chart, series);
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  // shadowBlur is a real per-pixel blur convolution that Konva redraws every frame of any
  // native drag (move or handle resize) regardless of React re-renders — expensive enough
  // to feel like lag, so it's switched off for the duration of a drag.
  const [isDragging, setIsDragging] = useState(false);
  if (!chart || !series || points.length < 2) return null;

  const p1 = points[0];
  const p2 = points[points.length - 1];

  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

  const color = stroke || '#2962ff';
  const width = strokeWidth || 2;

  // Open V arrowhead (two strokes, no fill), like TradingView's Arrow tool — wing length
  // scales subtly with stroke width.
  const headSize = Math.max(12, width * 4);
  const wingAngle = Math.PI / 5;

  const dash = lineStyle === 'Dashed' ? [10, 10] : lineStyle === 'Dotted' ? [2, 4] : [];

  let rx1 = x1, ry1 = y1, rx2 = x2, ry2 = y2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length > 0) {
    const ux = dx / length;
    const uy = dy / length;
    if (extendLeft) { rx1 = x1 - ux * 10000; ry1 = y1 - uy * 10000; }
    if (extendRight) { rx2 = x2 + ux * 10000; ry2 = y2 + uy * 10000; }
  }

  // The head always sits on the real tip point, even when the line is extended past it
  const dirAngle = Math.atan2(dy, dx);
  const headPoints = [
    x2 - headSize * Math.cos(dirAngle - wingAngle), y2 - headSize * Math.sin(dirAngle - wingAngle),
    x2, y2,
    x2 - headSize * Math.cos(dirAngle + wingAngle), y2 - headSize * Math.sin(dirAngle + wingAngle),
  ];

  const handleDragStart = (e: any) => { e.cancelBubble = true; setIsDragging(true); move.start(e); };

  const handleGroupDragEnd = (e: any) => {
    setIsDragging(false);
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className === 'Circle') return;
    move.end(e);
  };

  const handleCircleDragMove = (index: number) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const snapped = snap(e.target.x(), e.target.y(), e.evt, e.target);
    if (snapped) {
      const newPoints = [...points];
      newPoints[index] = snapped;
      onUpdatePoints(newPoints);
    }
  };

  const handleCircleDragEnd = (index: number) => (e: any) => {
    handleCircleDragMove(index)(e);
    setIsDragging(false);
  };

  return (
    <Group
      id={id}
      draggable={isSelected || isHovering}
      onDragStart={handleDragStart} onDragMove={move.drag}
      onDragEnd={handleGroupDragEnd}
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e)  => { e.cancelBubble = true; onSelect(); }}
    >
      <Line
        points={[rx1, ry1, rx2, ry2]}
        stroke={color}
        strokeWidth={width}
        dash={dash}
        hitStrokeWidth={14}
        shadowColor={isSelected ? '#2962ff' : 'transparent'}
        shadowBlur={isSelected && !isDragging ? 5 : 0}
        shadowOpacity={0.35}
        lineCap="round"
        lineJoin="round"
      />
      {length > 0 && (
        <Line
          points={headPoints}
          stroke={color}
          strokeWidth={width}
          hitStrokeWidth={14}
          shadowColor={isSelected ? '#2962ff' : 'transparent'}
          shadowBlur={isSelected && !isDragging ? 5 : 0}
          shadowOpacity={0.35}
          lineCap="round"
          lineJoin="round"
        />
      )}

      {/* Selection handles at tail and tip */}
      {(isSelected || isHovering) && (
        <>
          <HandleCircle
            x={x1} y={y1}
            radius={6}
            fill="white" stroke="#2962ff" strokeWidth={2}
            draggable
            onDragStart={handleDragStart}
            onDragMove={handleCircleDragMove(0)}
            onDragEnd={handleCircleDragEnd(0)}
          />
          <HandleCircle
            x={x2} y={y2}
            radius={6}
            fill="white" stroke="#2962ff" strokeWidth={2}
            draggable
            onDragStart={handleDragStart}
            onDragMove={handleCircleDragMove(points.length - 1)}
            onDragEnd={handleCircleDragEnd(points.length - 1)}
          />
        </>
      )}
    </Group>
  );
}
