import React from 'react';
import { Line, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { useSnappedDrag } from '../core/snap';

interface BrushToolProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  strokeWidth: number;
  isSelected: boolean;
  isHovering?: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  isLocked?: boolean;
}

export function BrushTool({ id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints, isLocked = false }: BrushToolProps) {
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  if (!chart || !series || points.length < 2) return null;

  // Flatten points for Konva Line [x1, y1, x2, y2, ...]
  const flattenedPoints: number[] = [];
  
  points.forEach(p => {
    const x = logicalToPixel(chart, p.logical);
    const y = priceToPixel(series, p.price);
    if (x !== null && y !== null) {
      flattenedPoints.push(x, y);
    }
  });

  const handleDragStart = (e: any) => { e.cancelBubble = true; move.start(e); };

  const handleDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    move.end(e);
  };

  // As on TradingView: hovered or selected, the stroke itself stays as it is and a small
  // hollow blue ring marks each end (the stroke moves as a whole; the rings don't reshape it)
  const showEnds = (isSelected || isHovering) && flattenedPoints.length >= 4;
  const n = flattenedPoints.length;

  return (
    <Group 
      id={id}
      draggable={(isSelected || isHovering) && !isLocked}
      onDragStart={handleDragStart} onDragMove={move.drag}
      onDragEnd={handleDragEnd}
    >
      {/* Invisible thicker line for easier selection */}
      <Line
        points={flattenedPoints}
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 10, 15)}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        onClick={onSelect}
        onTap={onSelect}
      />
      {/* The visible brush stroke */}
      <Line
        points={flattenedPoints}
        stroke={stroke}
        strokeWidth={strokeWidth}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      {showEnds && [[flattenedPoints[0], flattenedPoints[1]], [flattenedPoints[n - 2], flattenedPoints[n - 1]]].map(([x, y], i) => (
        <Circle key={i} x={x} y={y} radius={4} stroke="#2962ff" strokeWidth={1} hitStrokeWidth={8} onClick={onSelect} onTap={onSelect} />
      ))}
    </Group>
  );
}