import React, { useState } from 'react';
import { Shape, Group, Circle, Text } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { useSnap, useSnappedDrag } from '../core/snap';
import { HandleCircle } from '../core/Handles';

interface ArrowMarkerToolProps {
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
  text?: string;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
}

export function ArrowMarkerTool({
  id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints,
  text, textColor, fontSize, bold, italic
}: ArrowMarkerToolProps) {
  const snap = useSnap(chart, series);
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  // shadowBlur is a real per-pixel blur convolution that Konva redraws every frame of any
  // native drag (move or handle resize) regardless of React re-renders — expensive enough
  // to feel like lag, so it's switched off for the duration of a drag.
  const [isDragging, setIsDragging] = useState(false);
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

  // The body is a plain straight-sided dart: two straight lines from the tail directly to
  // the notch points (the inner corners of the arrowhead), no belly bulge. The shoulder
  // where those lines meet the flared head is pulled inward toward the tip, cutting a
  // shallow notch into the back of the head on both sides.
  const headLength = Math.min(len * 0.45, 80);
  const shaftLen = len - headLength;
  const bodyHW = Math.max(strokeWidth * 1.5, 4);
  const headHW = bodyHW + headLength * 0.55;
  const notchBend = headLength * 0.28;
  const notchX = shaftLen + notchBend;
  const notchHW = (bodyHW + headHW) / 2;

  const buildPath = (ctx: any, pad: number) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(notchX, -notchHW - pad);
    ctx.lineTo(shaftLen, -headHW - pad);
    ctx.lineTo(len + pad, 0);
    ctx.lineTo(shaftLen, headHW + pad);
    ctx.lineTo(notchX, notchHW + pad);
    ctx.lineTo(0, 0);
    ctx.closePath();
  };

  const sceneFunc = (ctx: any, shape: any) => {
    buildPath(ctx, 0);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStrokeShape(shape);
  };

  const hitFunc = (ctx: any, shape: any) => {
    buildPath(ctx, 4);
    ctx.fillStrokeShape(shape);
  };

  const handleDragStart = (e: any) => { e.cancelBubble = true; setIsDragging(true); move.start(e); };

  const handleDragEnd = (e: any) => {
    setIsDragging(false);
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className === 'Circle') return;
    move.end(e);
  };

  const handleCircleDragMove = (index: number) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const snapped = snap(e.target.x(), e.target.y(), e.evt, e.target);
    if (snapped) {
      const newPoints = [...points];
      newPoints[index] = snapped;
      onUpdatePoints(newPoints);
    }
  };

  const handleCircleDragEnd = (index: number) => (e: any) => {
    handleCircleDragMove(index)(e);
    setIsDragging(false);
  };

  return (
    <Group
      id={id}
      draggable={isSelected || isHovering}
      onDragStart={handleDragStart} onDragMove={move.drag}
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
        shadowBlur={isSelected && !isDragging ? 6 : 0}
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

      {(isSelected || isHovering) && (
        <>
          <HandleCircle x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleCircleDragMove(0)} onDragEnd={handleCircleDragEnd(0)} />
          <HandleCircle x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleCircleDragMove(points.length - 1)} onDragEnd={handleCircleDragEnd(points.length - 1)} />
        </>
      )}
    </Group>
  );
}