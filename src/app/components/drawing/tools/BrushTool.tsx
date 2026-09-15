import React, { useEffect, useState } from 'react';
import { Line, Group } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

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
  useChartTick(chart);
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

  const handleDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    const node = e.target;
    
    const dx = node.x();
    const dy = node.y();

    const newPoints: { logical: number; price: number }[] = [];
    let valid = true;

    for (let p of points) {
      const oldX = logicalToPixel(chart, p.logical);
      const oldY = priceToPixel(series, p.price);
      if (oldX === null || oldY === null) {
        valid = false;
        break;
      }
      
      const newL = pixelToLogical(chart, oldX + dx);
      const newP = pixelToPrice(series, oldY + dy);
      
      if (newL === null || newP === null) {
        valid = false;
        break;
      }
      
      newPoints.push({ logical: newL, price: newP });
    }

    if (valid) {
      onUpdatePoints(newPoints);
    }
    
    node.position({ x: 0, y: 0 });
  };

  return (
    <Group 
      id={id}
      draggable={isSelected && !isLocked}
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
        shadowBlur={isSelected ? 4 : 0}
        listening={false}
      />
    </Group>
  );
}