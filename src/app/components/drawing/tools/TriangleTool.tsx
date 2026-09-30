import React, { useEffect, useState, useRef } from 'react';
import { Line, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface TriangleToolProps {
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
  fill?: string;
  backgroundVisible?: boolean;
}

export function TriangleTool({ id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints, fill, backgroundVisible }: TriangleToolProps) {
  useChartTick(chart);

  // Local pixel positions for live-preview while dragging handles
  const [livePixels, setLivePixels] = useState<{ x: number; y: number }[] | null>(null);
  // Track which handle is being dragged
  const draggingIndex = useRef<number | null>(null);
  // shadowBlur is a real per-pixel blur convolution that Konva redraws every frame of any
  // native drag (move or handle resize) regardless of React re-renders — expensive enough
  // to feel like lag, so it's switched off for the duration of a drag.
  const [isDragging, setIsDragging] = useState(false);

  if (!chart || !series || points.length < 2) return null;

  // Build canonical pixel positions from logical coords
  const canonicalPixels: { x: number; y: number }[] = [];
  points.forEach(p => {
    const x = logicalToPixel(chart, p.logical);
    const y = priceToPixel(series, p.price);
    if (x !== null && y !== null) canonicalPixels.push({ x, y });
  });

  // Use live positions when dragging a handle, otherwise canonical
  const pixelPoints = livePixels ?? canonicalPixels;

  const flattenedPoints: number[] = [];
  pixelPoints.forEach(p => flattenedPoints.push(p.x, p.y));

  const handleDragStart = (e: any) => { e.cancelBubble = true; setIsDragging(true); };

  // ── Group drag (move whole triangle) ──────────────────────────────────────
  const handleGroupDragEnd = (e: any) => {
    setIsDragging(false);
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className === 'Circle') return; // handled separately
    const dx = node.x();
    const dy = node.y();
    const newPoints = points.map(p => {
      const px = logicalToPixel(chart, p.logical)! + dx;
      const py = priceToPixel(series, p.price)! + dy;
      return { logical: pixelToLogical(chart, px)!, price: pixelToPrice(series, py)! };
    });
    onUpdatePoints(newPoints);
    node.position({ x: 0, y: 0 });
  };

  // ── Handle drag: live preview ─────────────────────────────────────────────
  const handleCircleDragMove = (index: number) => (e: any) => {
    e.cancelBubble = true;
    draggingIndex.current = index;

    // Snapshot canonical pixels and override just the dragged one
    const updated = canonicalPixels.map((pt, i) =>
      i === index ? { x: e.target.x(), y: e.target.y() } : pt
    );
    setLivePixels(updated);
  };

  const handleCircleDragEnd = (index: number) => (e: any) => {
    e.cancelBubble = true;
    draggingIndex.current = null;
    setIsDragging(false);

    if (!onUpdatePoints) return;
    const logical = pixelToLogical(chart, e.target.x());
    const price = pixelToPrice(series, e.target.y());
    if (logical !== null && price !== null) {
      const newPoints = [...points];
      newPoints[index] = { logical, price };
      onUpdatePoints(newPoints);
    }
    // Clear live state — parent will re-render with updated logical coords
    setLivePixels(null);
  };

  return (
    <Group
      id={id}
      draggable={isSelected || isHovering}
      onDragStart={handleDragStart}
      onDragEnd={handleGroupDragEnd}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Line
        points={flattenedPoints}
        stroke={isSelected ? '#2962ff' : stroke}
        strokeWidth={strokeWidth}
        fill={backgroundVisible !== false ? (fill || 'rgba(41, 98, 255, 0.08)') : 'transparent'}
        closed={true}
        shadowColor={isSelected ? stroke : 'transparent'}
        shadowBlur={isSelected && !isDragging ? 4 : 0}
        listening={!isSelected} // let circles take events when selected
      />
      {(isSelected || isHovering) && pixelPoints.map((pt, i) => (
        <Circle
          key={i}
          x={pt.x}
          y={pt.y}
          radius={6}
          fill="white"
          stroke="#2962ff"
          strokeWidth={2}
          draggable
          onDragStart={handleDragStart}
          onDragMove={handleCircleDragMove(i)}
          onDragEnd={handleCircleDragEnd(i)}
        />
      ))}
    </Group>
  );
}