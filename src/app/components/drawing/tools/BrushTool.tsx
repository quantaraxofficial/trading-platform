import React, { useEffect, useState } from 'react';
import { Line, Group } from 'react-konva';
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
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  isLocked?: boolean;
}

export function BrushTool({ id, points, stroke, strokeWidth, isSelected, chart, series, onSelect, onUpdatePoints, isLocked = false }: BrushToolProps) {
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  // shadowBlur is a real per-pixel blur convolution that Konva redraws every frame of any
  // native drag regardless of React re-renders — expensive enough to feel like lag, so it's
  // switched off for the duration of a drag.
  const [isDragging, setIsDragging] = useState(false);
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

  const handleDragStart = (e: any) => { e.cancelBubble = true; setIsDragging(true); move.start(e); };

  const handleDragEnd = (e: any) => {
    setIsDragging(false);
    if (!onUpdatePoints) return;
    move.end(e);
  };

  return (
    <Group 
      id={id}
      draggable={isSelected && !isLocked}
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
        shadowColor={isSelected ? stroke : 'transparent'}
        shadowBlur={isSelected && !isDragging ? 4 : 0}
        listening={false}
      />
    </Group>
  );
}