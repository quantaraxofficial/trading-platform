import React, { useEffect, useState } from 'react';
import { Shape, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface CurveToolProps {
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

export function CurveTool({ id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints, lineStyle, fill, fillEnabled, lineStartStyle, lineEndStyle }: CurveToolProps) {
  useChartTick(chart);
  // shadowBlur is a real per-pixel blur convolution that Konva redraws every frame of any
  // native drag (move or handle resize) regardless of React re-renders — expensive enough
  // to feel like lag, so it's switched off for the duration of a drag.
  const [isDragging, setIsDragging] = useState(false);
  if (!chart || !series || points.length < 2) return null;

  const p1 = points[0];
  const p2 = points[1]; 
  const p3 = points[2] || { logical: (p1.logical + p2.logical) / 2, price: (p1.price + p2.price) / 2 };

  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);
  const x3 = logicalToPixel(chart, p3.logical);
  const y3 = priceToPixel(series, p3.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null || x3 === null || y3 === null) return null;

  // calculate control point so curve passes exactly through P3 at t=0.5
  const controlX = 2 * x3 - 0.5 * (x1 + x2);
  const controlY = 2 * y3 - 0.5 * (y1 + y2);

  const handleDragStart = (e: any) => { e.cancelBubble = true; setIsDragging(true); };

  const handleDragEnd = (e: any) => {
    setIsDragging(false);
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
      <Shape
        sceneFunc={(context, shape) => {
          context.beginPath();
          context.moveTo(x1, y1);
          context.quadraticCurveTo(controlX, controlY, x2, y2);
          context.fillStrokeShape(shape);
        }}
        stroke={isSelected ? '#2962ff' : stroke}
        strokeWidth={strokeWidth}
        fill={fillEnabled ? fill : 'transparent'}
        dash={lineStyle === 'Dashed' ? [strokeWidth * 3, strokeWidth * 3] : lineStyle === 'Dotted' ? [strokeWidth, strokeWidth * 2] : undefined}
        shadowColor={isSelected ? stroke : 'transparent'}
        shadowBlur={isSelected && !isDragging ? 4 : 0}
        hitStrokeWidth={10}
      />
      {/* Arrowheads */}
      {lineStartStyle === 'Arrow' && (
        <Shape
          sceneFunc={(context, shape) => {
            const angle = Math.atan2(y1 - controlY, x1 - controlX);
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x1 - 10 * Math.cos(angle - Math.PI / 6), y1 - 10 * Math.sin(angle - Math.PI / 6));
            context.moveTo(x1, y1);
            context.lineTo(x1 - 10 * Math.cos(angle + Math.PI / 6), y1 - 10 * Math.sin(angle + Math.PI / 6));
            context.fillStrokeShape(shape);
          }}
          stroke={isSelected ? '#2962ff' : stroke}
          strokeWidth={strokeWidth}
        />
      )}
      {lineEndStyle === 'Arrow' && (
        <Shape
          sceneFunc={(context, shape) => {
            const angle = Math.atan2(y2 - controlY, x2 - controlX);
            context.beginPath();
            context.moveTo(x2, y2);
            context.lineTo(x2 - 10 * Math.cos(angle - Math.PI / 6), y2 - 10 * Math.sin(angle - Math.PI / 6));
            context.moveTo(x2, y2);
            context.lineTo(x2 - 10 * Math.cos(angle + Math.PI / 6), y2 - 10 * Math.sin(angle + Math.PI / 6));
            context.fillStrokeShape(shape);
          }}
          stroke={isSelected ? '#2962ff' : stroke}
          strokeWidth={strokeWidth}
        />
      )}
      {(isSelected || isHovering) && (
        <>
          <Circle x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleCircleDragMove(0)} onDragEnd={handleCircleDragEnd(0)} />
          <Circle x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleCircleDragMove(1)} onDragEnd={handleCircleDragEnd(1)} />
          {points.length > 2 && (
            <Circle x={x3} y={y3} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleCircleDragMove(2)} onDragEnd={handleCircleDragEnd(2)} />
          )}
        </>
      )}
    </Group>
  );
}