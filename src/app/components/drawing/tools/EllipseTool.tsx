import React, { useEffect, useState } from 'react';
import { Ellipse as KonvaEllipse, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface EllipseToolProps {
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
  isLocked?: boolean;
}

export function EllipseTool({ 
  id, points, stroke, strokeWidth, isSelected, chart, series, 
  onSelect, onUpdatePoints, fill, backgroundVisible, isLocked 
}: EllipseToolProps) {
  useChartTick(chart);
  if (!chart || !series || points.length < 2) return null;

  const center = points[0];
  const p2 = points[1]; 
  const p3 = points[2] || p2; 

  const cx = logicalToPixel(chart, center.logical);
  const cy = priceToPixel(series, center.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);
  const x3 = logicalToPixel(chart, p3.logical);
  const y3 = priceToPixel(series, p3.price);

  if (cx === null || cy === null || x2 === null || y2 === null || x3 === null || y3 === null) return null;

  const radiusX = Math.sqrt(Math.pow(x2 - cx, 2) + Math.pow(y2 - cy, 2));
  const radiusY = points.length < 3 ? radiusX : Math.sqrt(Math.pow(x3 - cx, 2) + Math.pow(y3 - cy, 2));
  const angle = Math.atan2(y2 - cy, x2 - cx) * (180 / Math.PI);

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
      <KonvaEllipse
        x={cx} y={cy} radiusX={radiusX} radiusY={radiusY} rotation={angle}
        stroke={isSelected ? '#2962ff' : stroke} strokeWidth={strokeWidth}
        fill={backgroundVisible !== false ? (fill || (stroke || '#2962ff') + '33') : 'transparent'}
        shadowColor={isSelected ? stroke : 'transparent'} shadowBlur={isSelected ? 4 : 0}
      />
      {isSelected && (
        <>
          <Circle x={cx} y={cy} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={(e) => e.cancelBubble = true} onDragEnd={handleCircleDragEnd(0)} />
          <Circle x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={(e) => e.cancelBubble = true} onDragEnd={handleCircleDragEnd(1)} />
          {points.length > 2 && (
            <Circle x={x3} y={y3} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={(e) => e.cancelBubble = true} onDragEnd={handleCircleDragEnd(2)} />
          )}
        </>
      )}
    </Group>
  );
}