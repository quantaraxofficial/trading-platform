import React, { useEffect, useState } from 'react';
import { Circle as KonvaCircle, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface CircleToolProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  strokeWidth: number;
  isSelected: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  fill?: string;
  backgroundVisible?: boolean;
}

export function CircleTool({ 
  id, points, stroke, strokeWidth, isSelected, chart, series, 
  onSelect, onUpdatePoints, fill, backgroundVisible 
}: CircleToolProps) {
  useChartTick(chart);
  if (!chart || !series || points.length < 2) return null;

  const p1 = points[0];
  const p2 = points[points.length - 1]; 

  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

  const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

  const handleDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className !== 'Circle' || node.attrs.radius !== 6) {
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
      <KonvaCircle
        x={x1}
        y={y1}
        radius={radius}
        stroke={isSelected ? '#2962ff' : stroke}
        strokeWidth={strokeWidth}
        fill={backgroundVisible !== false ? (fill || (stroke || '#9b59b6') + '33') : 'transparent'}
        shadowColor={isSelected ? stroke : 'transparent'}
        shadowBlur={isSelected ? 4 : 0}
      />
      {isSelected && (
        <>
          <Circle x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={(e) => e.cancelBubble = true} onDragEnd={handleCircleDragEnd(0)} />
          <Circle x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={(e) => e.cancelBubble = true} onDragEnd={handleCircleDragEnd(points.length - 1)} />
        </>
      )}
    </Group>
  );
}