import React, { useEffect, useState } from 'react';
import { Ellipse as KonvaEllipse, Group, Circle, Text } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { textLinesHitFunc } from '../core/textHit';
import { useSnap, useSnappedDrag } from '../core/snap';
import { HandleCircle } from '../core/Handles';

interface CircleToolProps {
  id: string;
  points: { logical: number; price: number; time?: number }[];
  stroke: string;
  strokeWidth: number;
  isSelected: boolean;
  isHovering?: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number; time?: number }[]) => void;
  fill?: string;
  backgroundVisible?: boolean;
  text?: string;
  onTextEdit?: () => void;
  isEditingText?: boolean;
  textColor?: string;
  fontSize?: number;
}

export function CircleTool({
  id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series,
  onSelect, onUpdatePoints, fill, backgroundVisible, text, onTextEdit, isEditingText = false, textColor, fontSize
}: CircleToolProps) {
  const snap = useSnap(chart, series);
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  // shadowBlur is a real per-pixel blur convolution, expensive enough that recomputing
  // it on every drag-move frame is visible as lag — so it's switched off for the
  // duration of a drag and only re-enabled once the shape settles.
  const [isDragging, setIsDragging] = useState(false);
  if (!chart || !series || points.length < 2) return null;

  const p1 = points[0];
  const p2 = points.length >= 3 ? points[1] : points[points.length - 1];

  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

  // New circles are stored as [center, right-edge, top-edge] so the horizontal radius
  // follows the time axis and the vertical one the price axis (see DrawingLayer where
  // they are created). Older 2-point circles keep the single pixel radius.
  const isAnchored = points.length >= 3;
  const p3 = points[2];
  const y3 = isAnchored ? priceToPixel(series, p3.price) : null;
  if (isAnchored && y3 === null) return null;
  const radiusX = isAnchored ? Math.abs(x2 - x1) : Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  const radiusY = isAnchored ? Math.abs((y3 as number) - y1) : radiusX;
  // Right-edge handle sits on the circle's horizontal axis for anchored circles
  const handleX = isAnchored ? x1 + radiusX : x2;
  const handleY = isAnchored ? y1 : y2;

  const handleDragEnd = (e: any) => {
    setIsDragging(false);
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className !== 'Circle' || node.attrs.radius !== 6) {
      move.end(e);
    }
  };

  const handleDragStart = (e: any) => { e.cancelBubble = true; setIsDragging(true); move.start(e); };

  // Dragging the center handle moves the whole circle, keeping its size
  const handleAnchoredMove = (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const c = snap(e.target.x(), e.target.y(), e.evt, e.target);
    if (!c) return;
    const dL = c.logical - points[0].logical;
    const dP = c.price - points[0].price;
    const moved = points.map(p => {
      const logical = p.logical + dL;
      const time = p.time !== undefined && points[0].time !== undefined && points[1].time !== undefined && points[1].logical !== points[0].logical
        ? p.time + dL * ((points[1].time - points[0].time) / (points[1].logical - points[0].logical)) : p.time;
      return { ...p, logical, price: p.price + dP, time };
    });
    onUpdatePoints(moved);
  };

  // Dragging the edge handle rescales the circle uniformly (both radii by the same
  // factor, from the handle's distance to the center), like resizing a circle.
  const handleAnchoredResize = (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints || radiusX < 1) return;
    const k = Math.hypot(e.target.x() - x1, e.target.y() - y1) / radiusX;
    if (k < 0.01) return;
    // Keep the handle on the circle's horizontal axis, where it's drawn — dragged off it
    // vertically, its y prop never changes, so React wouldn't move it back.
    e.target.position({ x: x1 + radiusX * k, y: y1 });
    const edgeLogical = pixelToLogical(chart, x1 + radiusX * k);
    const topPrice = pixelToPrice(series, y1 - radiusY * k);
    if (edgeLogical === null || topPrice === null) return;
    const spacing = points[1].time !== undefined && points[0].time !== undefined && points[1].logical !== points[0].logical
      ? (points[1].time - points[0].time) / (points[1].logical - points[0].logical) : undefined;
    onUpdatePoints([
      points[0],
      { ...points[1], logical: edgeLogical, time: spacing !== undefined ? (points[0].time as number) + (edgeLogical - points[0].logical) * spacing : points[1].time },
      { ...points[2], logical: points[0].logical, price: topPrice },
    ]);
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

  const handleAnchoredMoveEnd = (e: any) => { handleAnchoredMove(e); setIsDragging(false); };
  const handleAnchoredResizeEnd = (e: any) => { handleAnchoredResize(e); setIsDragging(false); };

  return (
    <Group id={id} draggable={isSelected || isHovering} onDragStart={handleDragStart} onDragMove={move.drag} onDragEnd={handleDragEnd} onClick={onSelect} onTap={onSelect}>
      <KonvaEllipse
        x={x1}
        y={y1}
        radiusX={radiusX}
        radiusY={radiusY}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill={backgroundVisible !== false ? (fill || (stroke || '#9b59b6') + '33') : 'transparent'}
        shadowColor={isSelected ? stroke : 'transparent'}
        shadowBlur={isSelected && !isDragging ? 4 : 0}
      />
      {/* Suppressed while the HTML overlay is actively editing this shape's text, so
          its own blinking cursor isn't doubled up with this label */}
      {text && !isEditingText && (
        <Text
          text={text}
          hitFunc={textLinesHitFunc}
          x={x1 - radiusX}
          y={y1 - radiusY}
          width={radiusX * 2}
          height={radiusY * 2}
          fill={textColor || stroke}
          fontSize={fontSize || 14}
          align="center"
          verticalAlign="middle"
          onClick={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
          onTap={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
        />
      )}
      {(isSelected || isHovering) && !text && !isEditingText && (
        <Text
          text="+ Add text"
          hitFunc={textLinesHitFunc}
          x={x1 - radiusX}
          y={y1 - radiusY}
          width={radiusX * 2}
          height={radiusY * 2}
          align="center"
          verticalAlign="middle"
          fill="#2962ff"
          opacity={0.7}
          fontSize={fontSize || 14}
          onClick={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
          onTap={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
        />
      )}
      {(isSelected || isHovering) && (
        <>
          {isAnchored ? (
            <>
              {/* Center handle moves the whole circle; the right-edge handle resizes it */}
              <HandleCircle x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleAnchoredMove} onDragEnd={handleAnchoredMoveEnd} />
              <HandleCircle x={handleX} y={handleY} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleAnchoredResize} onDragEnd={handleAnchoredResizeEnd} />
            </>
          ) : (
            <>
              <HandleCircle x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleCircleDragMove(0)} onDragEnd={handleCircleDragEnd(0)} />
              <HandleCircle x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleCircleDragMove(points.length - 1)} onDragEnd={handleCircleDragEnd(points.length - 1)} />
            </>
          )}
        </>
      )}
    </Group>
  );
}