import React, { useRef } from 'react';
import { Shape, Group, Circle, Text } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface ArrowMarkerToolProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  strokeWidth: number;
  isSelected: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  text?: string;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
}

export function ArrowMarkerTool({
  id, points, stroke, strokeWidth, isSelected, chart, series, onSelect, onUpdatePoints,
  text, textColor, fontSize, bold, italic
}: ArrowMarkerToolProps) {
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

  // Compute length and angle of the arrow
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;

  const angle = Math.atan2(dy, dx); // radians

  // Arrow dimensions — thick like TradingView's arrow marker
  const headLength = Math.min(len * 0.45, 60);   // arrowhead takes up ~45% of length
  const headWidth  = headLength * 0.85;           // wide triangular head
  const shaftWidth = headWidth * 0.35;            // narrower rectangular shaft
  const shaftLength = Math.max(len - headLength, 0);

  const sceneFunc = (ctx: any, shape: any) => {
    ctx.beginPath();
    const hw = shaftWidth / 2;
    const hh = headWidth / 2;
    ctx.moveTo(0, -hw);
    ctx.lineTo(shaftLength, -hw);
    ctx.lineTo(shaftLength, -hh);
    ctx.lineTo(len, 0);
    ctx.lineTo(shaftLength, hh);
    ctx.lineTo(shaftLength, hw);
    ctx.lineTo(0, hw);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStrokeShape(shape);
  };

  const hitFunc = (ctx: any, shape: any) => {
    const hw = shaftWidth / 2 + 4;
    const hh = headWidth / 2 + 4;
    ctx.beginPath();
    ctx.moveTo(0, -hw);
    ctx.lineTo(shaftLength, -hw);
    ctx.lineTo(shaftLength, -hh);
    ctx.lineTo(len + 4, 0);
    ctx.lineTo(shaftLength, hh);
    ctx.lineTo(shaftLength, hw);
    ctx.lineTo(0, hw);
    ctx.closePath();
    ctx.fillStrokeShape(shape);
  };

  const handleDragEnd = (e: any) => {
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
      onDragEnd={handleDragEnd}
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e)  => { e.cancelBubble = true; onSelect(); }}
    >
      <Shape
        x={x1}
        y={y1}
        rotation={angle * (180 / Math.PI)}
        fill={color}
        sceneFunc={sceneFunc}
        hitFunc={hitFunc}
        shadowColor={isSelected ? '#2962ff' : 'transparent'}
        shadowBlur={isSelected ? 6 : 0}
        shadowOpacity={0.4}
      />

      {text && (
        <Text
          text={text}
          x={x1 + dx / 2}
          y={y1 + dy / 2 - (fontSize || 16) - 5}
          fill={textColor || color}
          fontSize={fontSize || 16}
          fontStyle={`${bold ? 'bold ' : ''}${italic ? 'italic' : ''}`.trim() || 'normal'}
          align="center"
          offsetX={(text.length * (fontSize || 16) * 0.5) / 2}
        />
      )}

      {isSelected && (
        <>
          <Circle x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={(e) => e.cancelBubble = true} onDragEnd={handleCircleDragEnd(0)} />
          <Circle x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragMove={(e) => e.cancelBubble = true} onDragEnd={handleCircleDragEnd(points.length - 1)} />
        </>
      )}
    </Group>
  );
}