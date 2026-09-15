import React, { useEffect, useState } from 'react';
import { Line, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface PolylineToolProps {
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
  lineStartStyle?: string;
  lineEndStyle?: string;
  fill?: string;
  backgroundVisible?: boolean;
}

export function PolylineTool({ 
  id, points, stroke, strokeWidth, isSelected, chart, series, 
  onSelect, onUpdatePoints, lineStyle, lineStartStyle, lineEndStyle,
  fill, backgroundVisible
}: PolylineToolProps) {
  useChartTick(chart);
  if (!chart || !series || points.length < 2) return null;

  const flattenedPoints: number[] = [];
  const pixelPoints: {x: number, y: number}[] = [];
  
  points.forEach(p => {
    const x = logicalToPixel(chart, p.logical);
    const y = priceToPixel(series, p.price);
    if (x !== null && y !== null) {
      flattenedPoints.push(x, y);
      pixelPoints.push({x, y});
    }
  });

  const handleDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className !== 'Circle') {
      const dx = node.x();
      const dy = node.y();
      const newPoints = points.map(p => {
        const px = logicalToPixel(chart, p.logical)! + dx;
        const py = priceToPixel(series, p.price)! + dy;
        return { logical: pixelToLogical(chart, px)!, price: pixelToPrice(series, py)! };
      });
      onUpdatePoints(newPoints);
      node.position({ x: 0, y: 0 });
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
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 10, 15)}
        hitStrokeWidth={20}
      />
      <Line
        points={flattenedPoints}
        stroke={isSelected ? '#2962ff' : stroke}
        strokeWidth={strokeWidth}
        fill={backgroundVisible !== false ? fill : 'transparent'}
        closed={!!fill && fill !== 'transparent'}
        shadowColor={isSelected ? stroke : 'transparent'}
        shadowBlur={isSelected ? 4 : 0}
        dash={lineStyle === 'Dashed' ? [5, 5] : lineStyle === 'Dotted' ? [2, 2] : undefined}
        listening={false}
      />
      {isSelected && pixelPoints.map((pt, i) => (
        <Circle key={i} x={pt.x} y={pt.y} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={(e) => e.cancelBubble = true} onDragEnd={handleCircleDragEnd(i)} />
      ))}
      {pixelPoints.length >= 2 && lineEndStyle === 'Arrow' && (() => {
        const last = pixelPoints[pixelPoints.length - 1];
        const prev = pixelPoints[pixelPoints.length - 2];
        const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
        const headLength = 12;
        return (
          <Line
            points={[
              last.x - headLength * Math.cos(angle - Math.PI / 6),
              last.y - headLength * Math.sin(angle - Math.PI / 6),
              last.x,
              last.y,
              last.x - headLength * Math.cos(angle + Math.PI / 6),
              last.y - headLength * Math.sin(angle + Math.PI / 6)
            ]}
            stroke={isSelected ? '#2962ff' : stroke}
            strokeWidth={strokeWidth}
            lineCap="round"
            lineJoin="round"
          />
        );
      })()}
      {pixelPoints.length >= 2 && lineStartStyle === 'Arrow' && (() => {
        const first = pixelPoints[0];
        const second = pixelPoints[1];
        const angle = Math.atan2(first.y - second.y, first.x - second.x);
        const headLength = 12;
        return (
          <Line
            points={[
              first.x - headLength * Math.cos(angle - Math.PI / 6),
              first.y - headLength * Math.sin(angle - Math.PI / 6),
              first.x,
              first.y,
              first.x - headLength * Math.cos(angle + Math.PI / 6),
              first.y - headLength * Math.sin(angle + Math.PI / 6)
            ]}
            stroke={isSelected ? '#2962ff' : stroke}
            strokeWidth={strokeWidth}
            lineCap="round"
            lineJoin="round"
          />
        );
      })()}
    </Group>
  );
}