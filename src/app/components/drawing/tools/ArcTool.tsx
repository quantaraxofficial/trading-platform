import React, { useEffect, useState } from 'react';
import { Shape, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface ArcToolProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  strokeWidth: number;
  fill?: string;
  isSelected: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
}

function computeCircleFromThreePoints(p1: {x: number, y: number}, p2: {x: number, y: number}, p3: {x: number, y: number}) {
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;

  const a = x2 - x1;
  const b = y2 - y1;
  const c = x3 - x1;
  const d = y3 - y1;

  const e = a * (x1 + x2) + b * (y1 + y2);
  const f = c * (x1 + x3) + d * (y1 + y3);
  const g = 2 * (a * (y3 - y2) - b * (x3 - x2));

  if (Math.abs(g) < 1e-6) return null; // Collinear

  const cx = (d * e - b * f) / g;
  const cy = (a * f - c * e) / g;
  const r = Math.hypot(cx - x1, cy - y1);

  if (!isFinite(cx) || !isFinite(cy) || !isFinite(r) || r === 0) return null;

  return { cx, cy, r };
}

export function ArcTool({ id, points, stroke, strokeWidth, fill, isSelected, chart, series, onSelect, onUpdatePoints }: ArcToolProps) {
  useChartTick(chart);
  if (!chart || !series || points.length < 2) return null;

  const p1 = points[0];
  const p2 = points[1]; 
  const p3 = points[2] || { logical: (p1.logical + p2.logical) / 2, price: (p1.price + p2.price) / 2 + 10 };

  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);
  const x3 = logicalToPixel(chart, p3.logical);
  const y3 = priceToPixel(series, p3.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null || x3 === null || y3 === null) return null;

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

  const circle = computeCircleFromThreePoints({x: x1, y: y1}, {x: x2, y: y2}, {x: x3, y: y3});

  return (
    <Group id={id} draggable={isSelected} onDragEnd={handleDragEnd} onClick={onSelect} onTap={onSelect}>
      {circle ? (
        <Shape
          sceneFunc={(context, shape) => {
            const { cx, cy, r } = circle;
            let a1 = Math.atan2(y1 - cy, x1 - cx);
            let a2 = Math.atan2(y2 - cy, x2 - cx);
            let a3 = Math.atan2(y3 - cy, x3 - cx);
            
            const norm = (a: number) => (a % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            const A1 = norm(a1);
            const A2 = norm(a2);
            const A3 = norm(a3);
            
            let spanCCW = norm(A1 - A2);
            let midFrom2 = norm(A3 - A2);
            let anticlockwise = false;
            
            if (midFrom2 > spanCCW) {
              anticlockwise = true;
            }
            
            context.beginPath();
            context.arc(cx, cy, r, a2, a1, anticlockwise);
            context.closePath(); // Connects start and end to fill the segment
            context.fillStrokeShape(shape);
          }}
          stroke={isSelected ? '#2962ff' : stroke}
          strokeWidth={strokeWidth}
          fill={fill}
          shadowColor={isSelected ? stroke : 'transparent'}
          shadowBlur={isSelected ? 4 : 0}
          hitStrokeWidth={10}
        />
      ) : (
        <Shape
          sceneFunc={(context, shape) => {
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x2, y2);
            context.lineTo(x3, y3);
            context.closePath();
            context.fillStrokeShape(shape);
          }}
          stroke={isSelected ? '#2962ff' : stroke}
          strokeWidth={strokeWidth}
          fill={fill}
        />
      )}
      
      {isSelected && (
        <>
          <Circle x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={handleCircleDragMove(0)} onDragEnd={handleCircleDragEnd(0)} />
          <Circle x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={handleCircleDragMove(1)} onDragEnd={handleCircleDragEnd(1)} />
          {points.length > 2 && (
            <Circle x={x3} y={y3} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={handleCircleDragMove(2)} onDragEnd={handleCircleDragEnd(2)} />
          )}
        </>
      )}
    </Group>
  );
}