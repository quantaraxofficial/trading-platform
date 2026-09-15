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

export function DoubleCurveTool({ id, points, stroke, strokeWidth, isSelected, chart, series, onSelect, onUpdatePoints, lineStyle, fill, fillEnabled, lineStartStyle, lineEndStyle }: DoubleCurveToolProps) {
  useChartTick(chart);
  if (!chart || !series || points.length < 2) return null;

  const pixelPoints = points.map(p => ({
    x: logicalToPixel(chart, p.logical),
    y: priceToPixel(series, p.price)
  })).filter(pt => pt.x !== null && pt.y !== null) as { x: number; y: number }[];

  if (pixelPoints.length < 2) return null;

  const flattenedPoints = pixelPoints.flatMap(pt => [pt.x, pt.y]);

  const handleDragEnd = (e: any) => {
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

  return (
    <Group id={id} draggable={isSelected} onDragEnd={handleDragEnd} onClick={onSelect} onTap={onSelect}>
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
        shadowBlur={isSelected ? 4 : 0}
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
      {isSelected && pixelPoints.map((pt, i) => (
        <Circle
          key={i}
          x={pt.x}
          y={pt.y}
          radius={6}
          fill="white"
          stroke="#2962ff"
          strokeWidth={2}
          draggable
          onDragMove={handleCircleDragMove(i)}
          onDragEnd={handleCircleDragEnd(i)}
        />
      ))}
    </Group>
  );
}