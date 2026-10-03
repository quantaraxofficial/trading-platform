import React, { useRef, useState } from 'react';
import { Line, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { useSnappedDrag } from '../core/snap';
import { HandleCircle } from '../core/Handles';

interface HighlighterToolProps {
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
}

export function HighlighterTool({
  id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints
}: HighlighterToolProps) {
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);

  if (!chart || !series || points.length < 2) return null;

  const flattenedPoints: number[] = [];
  points.forEach(p => {
    const x = logicalToPixel(chart, p.logical);
    const y = priceToPixel(series, p.price);
    if (x !== null && y !== null) {
      flattenedPoints.push(x, y);
    }
  });

  // Derive endpoint pixel positions for the selection handles
  const firstPoint = points[0];
  const lastPoint  = points[points.length - 1];
  const x1 = logicalToPixel(chart, firstPoint.logical);
  const y1 = priceToPixel(series, firstPoint.price);
  const x2 = logicalToPixel(chart, lastPoint.logical);
  const y2 = priceToPixel(series, lastPoint.price);

  const handleStartDragMove = (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const logical = pixelToLogical(chart, e.target.x());
    const price   = pixelToPrice(series, e.target.y());
    if (logical === null || price === null) return;
    onUpdatePoints([{ logical, price }, ...points.slice(1)]);
  };

  const handleEndDragMove = (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const logical = pixelToLogical(chart, e.target.x());
    const price   = pixelToPrice(series, e.target.y());
    if (logical === null || price === null) return;
    onUpdatePoints([...points.slice(0, -1), { logical, price }]);
  };

  const handleGroupDragEnd = (e: any) => { move.end(e); };

  // Color with proper opacity for highlight effect — do NOT use globalCompositeOperation
  // as it leaks into the Konva canvas context and breaks all subsequent shapes
  const highlightColor = stroke.startsWith('rgba') ? stroke : stroke;

  return (
    <Group
      id={id}
      draggable={isSelected || isHovering}
      onDragStart={move.start} onDragMove={move.drag} onDragEnd={handleGroupDragEnd}
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e)  => { e.cancelBubble = true; onSelect(); }}
    >
      {/* Wide semi-transparent highlight stroke */}
      <Line
        points={flattenedPoints}
        stroke={highlightColor}
        strokeWidth={strokeWidth}
        opacity={0.45}
        tension={0.4}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />

      {/* Invisible fat hit area so clicks register */}
      <Line
        points={flattenedPoints}
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 10, 20)}
        tension={0.4}
        lineCap="round"
        lineJoin="round"
        listening={true}
        hitStrokeWidth={Math.max(strokeWidth + 10, 20)}
      />

      {/* Selection highlight ring */}
      {isSelected && (
        <Line
          points={flattenedPoints}
          stroke="#2962ff"
          strokeWidth={1.5}
          tension={0.4}
          lineCap="round"
          lineJoin="round"
          dash={[5, 4]}
          listening={false}
        />
      )}

      {/* Endpoint handles */}
      {(isSelected || isHovering) && x1 !== null && y1 !== null && (
        <HandleCircle
          x={x1} y={y1}
          radius={6}
          fill="white"
          stroke="#2962ff"
          strokeWidth={2}
          draggable
          onDragMove={handleStartDragMove}
          onDragEnd={handleStartDragMove}
        />
      )}
      {(isSelected || isHovering) && x2 !== null && y2 !== null && (
        <HandleCircle
          x={x2} y={y2}
          radius={6}
          fill="white"
          stroke="#2962ff"
          strokeWidth={2}
          draggable
          onDragMove={handleEndDragMove}
          onDragEnd={handleEndDragMove}
        />
      )}
    </Group>
  );
}