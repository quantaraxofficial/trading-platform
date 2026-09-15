import React from 'react';
import { Arrow, Group, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface ArrowToolProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  strokeWidth: number;
  lineStyle?: 'Solid' | 'Dashed' | 'Dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  isSelected: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
}

export function ArrowTool({
  id, points, stroke, strokeWidth, lineStyle = 'Solid', extendLeft = false, extendRight = false, isSelected, chart, series, onSelect, onUpdatePoints
}: ArrowToolProps) {
  useChartTick(chart);
  if (!chart || !series || points.length < 2) return null;

  const p1 = points[0];
  const p2 = points[points.length - 1];

  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

  const color = stroke || '#2962ff';
  const width = strokeWidth || 2;

  // Arrow head size scales subtly with stroke width
  const headSize = Math.max(12, width * 4);

  const dash = lineStyle === 'Dashed' ? [10, 10] : lineStyle === 'Dotted' ? [2, 4] : [];

  let rx1 = x1, ry1 = y1, rx2 = x2, ry2 = y2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length > 0) {
    const ux = dx / length;
    const uy = dy / length;
    if (extendLeft) { rx1 = x1 - ux * 10000; ry1 = y1 - uy * 10000; }
    if (extendRight) { rx2 = x2 + ux * 10000; ry2 = y2 + uy * 10000; }
  }

  const handleGroupDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className === 'Circle') return;
    const dx = node.x();
    const dy = node.y();
    const newPoints = points.map(p => {
      const px = logicalToPixel(chart, p.logical)! + dx;
      const py = priceToPixel(series, p.price)! + dy;
      return { logical: pixelToLogical(chart, px)!, price: pixelToPrice(series, py)! };
    });
    onUpdatePoints(newPoints);
    node.position({ x: 0, y: 0 });
  };

  const handleCircleDragEnd = (index: number) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const logical = pixelToLogical(chart, e.target.x());
    const price   = pixelToPrice(series, e.target.y());
    if (logical !== null && price !== null) {
      const newPoints = [...points];
      newPoints[index] = { logical, price };
      onUpdatePoints(newPoints);
    }
  };

  return (
    <Group
      id={id}
      draggable={isSelected}
      onDragEnd={handleGroupDragEnd}
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e)  => { e.cancelBubble = true; onSelect(); }}
    >
      {/* Thin line with a proper arrowhead — classic TradingView arrow style */}
      <Arrow
        points={[rx1, ry1, rx2, ry2]}
        stroke={color}
        strokeWidth={width}
        dash={dash}
        fill={color}
        pointerLength={headSize}
        pointerWidth={headSize * 0.7}
        hitStrokeWidth={14}
        shadowColor={isSelected ? '#2962ff' : 'transparent'}
        shadowBlur={isSelected ? 5 : 0}
        shadowOpacity={0.35}
        lineCap="round"
        lineJoin="round"
      />

      {/* Selection handles at tail and tip */}
      {isSelected && (
        <>
          <Circle
            x={x1} y={y1}
            radius={6}
            fill="white" stroke="#2962ff" strokeWidth={2}
            draggable
            onDragMove={(e) => e.cancelBubble = true}
            onDragEnd={handleCircleDragEnd(0)}
          />
          <Circle
            x={x2} y={y2}
            radius={6}
            fill="white" stroke="#2962ff" strokeWidth={2}
            draggable
            onDragMove={(e) => e.cancelBubble = true}
            onDragEnd={handleCircleDragEnd(points.length - 1)}
          />
        </>
      )}
    </Group>
  );
}
