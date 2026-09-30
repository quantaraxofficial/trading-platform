import React from 'react';
import { Line, Group, Circle, Rect } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface RotatedRectangleToolProps {
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

export function RotatedRectangleTool({
  id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints,
  fill, backgroundVisible
}: RotatedRectangleToolProps) {
  useChartTick(chart);
  if (!chart || !series || points.length < 2) return null;

  const firstCenter = points[0];
  const secondCenter = points[points.length - 1];

  const c1x = logicalToPixel(chart, firstCenter.logical);
  const c1y = priceToPixel(series, firstCenter.price);
  const c2x = logicalToPixel(chart, secondCenter.logical);
  const c2y = priceToPixel(series, secondCenter.price);

  if (c1x === null || c1y === null || c2x === null || c2y === null) return null;

  const vx = c2x - c1x;
  const vy = c2y - c1y;
  const h = Math.hypot(vx, vy);

  let flatPoints: number[] = [];
  const color = isSelected ? '#2962ff' : (stroke || '#4caf50');
  const bgColor = backgroundVisible !== false ? (fill || (stroke || '#4caf50') + '33') : 'transparent';

  let cornerPoints: {x: number, y: number}[] = [];

  if (h > 0) {
    const halfWidth = h;
    const nx = (c1x - c2x) / h;
    const ny = (c1y - c2y) / h;
    const ux = -ny;
    const uy = nx;

    const aPx = c1x + ux * halfWidth;
    const aPy = c1y + uy * halfWidth;
    const bPx = c1x - ux * halfWidth;
    const bPy = c1y - uy * halfWidth;
    const cPx = c2x - ux * halfWidth;
    const cPy = c2y - uy * halfWidth;
    const dPx = c2x + ux * halfWidth;
    const dPy = c2y + uy * halfWidth;

    flatPoints = [aPx, aPy, bPx, bPy, cPx, cPy, dPx, dPy];
    cornerPoints = [{x:aPx, y:aPy}, {x:bPx, y:bPy}, {x:cPx, y:cPy}, {x:dPx, y:dPy}];
  } else {
    flatPoints = [c1x, c1y, c1x, c1y, c2x, c2y, c2x, c2y];
  }

  const handleDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    if (e.target !== e.currentTarget) return;
    const node = e.target;
    const dx = node.x();
    const dy = node.y();
    node.position({ x: 0, y: 0 });

    const newPoints = points.map(p => {
      const px = logicalToPixel(chart, p.logical)! + dx;
      const py = priceToPixel(series, p.price)! + dy;
      return { logical: pixelToLogical(chart, px)!, price: pixelToPrice(series, py)! };
    });
    onUpdatePoints(newPoints);
  };

  const handleHandleDrag = (index: number, e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const logical = pixelToLogical(chart, pos.x);
    const price = pixelToPrice(series, pos.y);
    if (logical !== null && price !== null) {
      const newPoints = [...points];
      newPoints[index === 0 ? 0 : points.length - 1] = { logical, price };
      onUpdatePoints(newPoints);
    }
  };

  return (
    <Group id={id} draggable={isSelected || isHovering} onDragEnd={handleDragEnd} onClick={(e) => { e.cancelBubble = true; onSelect(); }} onTap={(e) => { e.cancelBubble = true; onSelect(); }}>
      <Line
        points={flatPoints}
        stroke={color}
        strokeWidth={strokeWidth || 2}
        fill={bgColor}
        closed={true}
      />
      {(isSelected || isHovering) && (
        <>
          {/* Main define points */}
          <Circle x={c1x} y={c1y} radius={6} fill="white" stroke="#2962ff" strokeWidth={1.5} draggable onDragMove={(e) => handleHandleDrag(0, e)} />
          <Circle x={c2x} y={c2y} radius={6} fill="white" stroke="#2962ff" strokeWidth={1.5} draggable onDragMove={(e) => handleHandleDrag(1, e)} />
          
          {/* Visual Corner Handles */}
          {cornerPoints.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={4.5} fill="white" stroke="#2962ff" strokeWidth={1.5} />
          ))}
          
          {/* Midpoint handles */}
          {cornerPoints.length === 4 && (
            <>
              {[
                {x: (cornerPoints[0].x + cornerPoints[1].x)/2, y: (cornerPoints[0].y + cornerPoints[1].y)/2},
                {x: (cornerPoints[1].x + cornerPoints[2].x)/2, y: (cornerPoints[1].y + cornerPoints[2].y)/2},
                {x: (cornerPoints[2].x + cornerPoints[3].x)/2, y: (cornerPoints[2].y + cornerPoints[3].y)/2},
                {x: (cornerPoints[3].x + cornerPoints[0].x)/2, y: (cornerPoints[3].y + cornerPoints[0].y)/2}
              ].map((p, i) => (
                <Rect key={i} x={p.x - 4} y={p.y - 4} width={8} height={8} fill="white" stroke="#2962ff" strokeWidth={1.5} cornerRadius={2} />
              ))}
            </>
          )}
        </>
      )}
    </Group>
  );
}