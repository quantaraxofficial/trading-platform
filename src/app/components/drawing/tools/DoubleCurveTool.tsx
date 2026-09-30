import React, { useEffect, useState } from 'react';
import { Group, Circle, Line } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface DoubleCurveToolProps {
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
  lineStyle?: string;
  fill?: string;
  fillEnabled?: boolean;
  lineStartStyle?: string;
  lineEndStyle?: string;
}

export function DoubleCurveTool({ id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints, lineStyle, fill, fillEnabled, lineStartStyle, lineEndStyle }: DoubleCurveToolProps) {
  useChartTick(chart);
  // shadowBlur is a real per-pixel blur convolution that Konva redraws every frame of any
  // native drag (move or handle resize) regardless of React re-renders — expensive enough
  // to feel like lag, so it's switched off for the duration of a drag.
  const [isDragging, setIsDragging] = useState(false);
  if (!chart || !series || points.length < 2) return null;

  const pixelPoints = points.map(p => ({
    x: logicalToPixel(chart, p.logical),
    y: priceToPixel(series, p.price)
  })).filter(pt => pt.x !== null && pt.y !== null) as { x: number; y: number }[];

  if (pixelPoints.length < 2) return null;

  const flattenedPoints = pixelPoints.flatMap(pt => [pt.x, pt.y]);

  const handleDragStart = (e: any) => { e.cancelBubble = true; setIsDragging(true); };

  const handleDragEnd = (e: any) => {
    setIsDragging(false);
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className !== 'Circle') {
      const dx = node.x();
      const dy = node.y();
      const newPoints = points.map(p => {
        const px = (logicalToPixel(chart, p.logical) ?? 0) + dx;
        const py = (priceToPixel(series, p.price) ?? 0) + dy;
        return { logical: pixelToLogical(chart, px)!, price: pixelToPrice(series, py)! };
      });
      onUpdatePoints(newPoints);
      node.position({ x: 0, y: 0 });
    }
  };

  const handleCircleDragMove = (index: number) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const logical = pixelToLogical(chart, e.target.x());
    const price = pixelToPrice(series, e.target.y());
    if (logical !== null && price !== null) {
      const newPoints = [...points];
      newPoints[index] = { logical, price };
      onUpdatePoints(newPoints);
    }
  };

  const handleCircleDragEnd = (index: number) => (e: any) => {
    handleCircleDragMove(index)(e);
    setIsDragging(false);
  };

  return (
    <Group id={id} draggable={isSelected || isHovering} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={onSelect} onTap={onSelect}>
      <Line
        points={flattenedPoints}
        stroke={isSelected ? '#2962ff' : stroke}
        strokeWidth={strokeWidth}
        fill={fillEnabled ? fill : 'transparent'}
        dash={lineStyle === 'Dashed' ? [strokeWidth * 3, strokeWidth * 3] : lineStyle === 'Dotted' ? [strokeWidth, strokeWidth * 2] : undefined}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        shadowColor={isSelected ? stroke : 'transparent'}
        shadowBlur={isSelected && !isDragging ? 4 : 0}
        hitStrokeWidth={10}
      />
      {/* Arrowheads */}
      {lineStartStyle === 'Arrow' && pixelPoints.length >= 2 && (
        <Line
          points={[pixelPoints[0].x, pixelPoints[0].y, pixelPoints[1].x, pixelPoints[1].y]}
          stroke={isSelected ? '#2962ff' : stroke}
          strokeWidth={strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
      )}
      {/* Note: Simplified arrowhead for DoubleCurve for now as it uses Konva Line with tension */}
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