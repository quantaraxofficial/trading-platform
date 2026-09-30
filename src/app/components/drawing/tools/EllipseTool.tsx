import React, { useState } from 'react';
import { Ellipse as KonvaEllipse, Group, Circle, Text, Line } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { textLinesHitFunc } from '../core/textHit';

interface EllipseToolProps {
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
  isLocked?: boolean;
  text?: string;
  onTextEdit?: () => void;
  isEditingText?: boolean;
  textColor?: string;
  fontSize?: number;
}

// Matches TradingView's own ellipse tool: points[0]/points[1] are the two ends of the
// ellipse's diameter (its major axis) — click 1 and click 2 — and points[2] is the third
// click that sets the curvature, i.e. how far the ellipse bulges perpendicular to that
// diameter (the minor-axis radius). Center, angle and both radii are all derived from
// these three points rather than stored directly, so panning/zooming the chart just
// re-derives pixel geometry from the same logical/price anchors like every other tool.
export function EllipseTool({
  id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series,
  onSelect, onUpdatePoints, fill, backgroundVisible, isLocked, text, onTextEdit, isEditingText = false, textColor, fontSize
}: EllipseToolProps) {
  useChartTick(chart);
  // shadowBlur is a real per-pixel blur convolution, expensive enough that recomputing
  // it on every drag-move frame is visible as lag — so it's switched off for the
  // duration of a drag and only re-enabled once the shape settles.
  const [isDragging, setIsDragging] = useState(false);
  if (!chart || !series || points.length < 2) return null;

  const a = points[0];
  const b = points[1];
  const c = points.length >= 3 ? points[2] : null;

  const ax = logicalToPixel(chart, a.logical);
  const ay = priceToPixel(series, a.price);
  const bx = logicalToPixel(chart, b.logical);
  const by = priceToPixel(series, b.price);
  if (ax === null || ay === null || bx === null || by === null) return null;

  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const majorLen = Math.hypot(dx, dy);
  const radiusX = majorLen / 2;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  // Unit vector perpendicular to the diameter — the direction the curvature handles sit in
  const perpX = majorLen > 0.0001 ? -dy / majorLen : 0;
  const perpY = majorLen > 0.0001 ? dx / majorLen : 1;

  let radiusY = 0;
  if (c) {
    const cx = logicalToPixel(chart, c.logical);
    const cy = priceToPixel(series, c.price);
    if (cx !== null && cy !== null) {
      radiusY = Math.abs((cx - mx) * perpX + (cy - my) * perpY);
    }
  }

  const topX = mx + perpX * radiusY;
  const topY = my + perpY * radiusY;
  const bottomX = mx - perpX * radiusY;
  const bottomY = my - perpY * radiusY;

  // Between clicks 1 and 2 there's no curvature yet — just the diameter itself, shown as
  // a plain guide line. It's replaced by the real ellipse the instant a third point (even
  // a live preview one) exists to derive a curvature from.
  const hasCurvature = points.length >= 3;

  const handleDragStart = (e: any) => { e.cancelBubble = true; setIsDragging(true); };

  // Whole-shape move: shift all stored points by the same pixel delta, unchanged pattern
  // used by every other draggable tool in this file.
  const handleDragEnd = (e: any) => {
    setIsDragging(false);
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className !== 'Circle') {
      const dx2 = node.x();
      const dy2 = node.y();
      const newPoints = points.map(p => {
        const px = logicalToPixel(chart, p.logical)! + dx2;
        const py = priceToPixel(series, p.price)! + dy2;
        return { logical: pixelToLogical(chart, px)!, price: pixelToPrice(series, py)! };
      });
      onUpdatePoints(newPoints);
      node.position({ x: 0, y: 0 });
    }
  };

  // Dragging a diameter endpoint (A or B) moves that end of the major axis while keeping
  // the ellipse's "fatness" (radiusY) unchanged — recomputed fresh from the CURRENT points
  // every call, so a curvature edit made between two endpoint drags is respected exactly.
  const handleEndpointMove = (index: 0 | 1) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const newLogical = pixelToLogical(chart, e.target.x());
    const newPrice = pixelToPrice(series, e.target.y());
    if (newLogical === null || newPrice === null) return;

    const otherIndex = index === 0 ? 1 : 0;
    const other = points[otherIndex];
    const ox = logicalToPixel(chart, other.logical);
    const oy = priceToPixel(series, other.price);
    if (ox === null || oy === null) return;

    const newX = e.target.x();
    const newY = e.target.y();
    const newMx = (newX + ox) / 2;
    const newMy = (newY + oy) / 2;
    const newDx = index === 0 ? ox - newX : newX - ox;
    const newDy = index === 0 ? oy - newY : newY - oy;
    const newMajorLen = Math.hypot(newDx, newDy);
    const newPerpX = newMajorLen > 0.0001 ? -newDy / newMajorLen : 0;
    const newPerpY = newMajorLen > 0.0001 ? newDx / newMajorLen : 1;

    const newPoints = [...points];
    newPoints[index] = { logical: newLogical, price: newPrice };
    if (points.length >= 3) {
      const newCx = newMx + newPerpX * radiusY;
      const newCy = newMy + newPerpY * radiusY;
      const newCLogical = pixelToLogical(chart, newCx);
      const newCPrice = pixelToPrice(series, newCy);
      if (newCLogical !== null && newCPrice !== null) {
        newPoints[2] = { logical: newCLogical, price: newCPrice };
      }
    }
    onUpdatePoints(newPoints);
  };

  const handleEndpointEnd = (index: 0 | 1) => (e: any) => {
    handleEndpointMove(index)(e);
    setIsDragging(false);
  };

  // Dragging either curvature handle (top or bottom) keeps the diameter fixed and only
  // changes radiusY. The bottom handle is the mirror of the top one through the center,
  // so both always resize the ellipse symmetrically about its major axis.
  const handleCurvatureMove = (side: 'top' | 'bottom') => (e: any) => {
    e.cancelBubble = true;
    // Pin the handle onto the minor axis — with a level diameter its computed x never
    // changes, so React wouldn't re-apply it and the circle would drift off the axis.
    const reach = Math.abs((e.target.x() - mx) * perpX + (e.target.y() - my) * perpY);
    const dir = side === 'top' ? 1 : -1;
    e.target.position({ x: mx + dir * perpX * reach, y: my + dir * perpY * reach });
    if (!onUpdatePoints) return;
    const px = side === 'top' ? e.target.x() : 2 * mx - e.target.x();
    const py = side === 'top' ? e.target.y() : 2 * my - e.target.y();
    const logical = pixelToLogical(chart, px);
    const price = pixelToPrice(series, py);
    if (logical === null || price === null) return;
    const newPoints = [...points];
    newPoints[2] = { logical, price };
    onUpdatePoints(newPoints);
  };

  const handleCurvatureEnd = (side: 'top' | 'bottom') => (e: any) => {
    handleCurvatureMove(side)(e);
    setIsDragging(false);
  };

  return (
    <Group id={id} draggable={isSelected || isHovering} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={onSelect} onTap={onSelect}>
      {hasCurvature ? (
        <KonvaEllipse
          x={mx} y={my} radiusX={radiusX} radiusY={radiusY} rotation={angle}
          stroke={isSelected ? '#2962ff' : stroke} strokeWidth={strokeWidth}
          fill={backgroundVisible !== false ? (fill || (stroke || '#2962ff') + '33') : 'transparent'}
          shadowColor={isSelected ? stroke : 'transparent'} shadowBlur={isSelected && !isDragging ? 4 : 0}
        />
      ) : (
        <Line points={[ax, ay, bx, by]} stroke={isSelected ? '#2962ff' : stroke} strokeWidth={strokeWidth} />
      )}
      {/* Text stays horizontal regardless of the ellipse's own tilt — rotating it with
          `angle` (which can be any value depending on how the ellipse was drawn) made it
          render sideways or upside-down instead of staying readable. */}
      {hasCurvature && (
        <Group x={mx} y={my}>
          {/* Suppressed while the HTML overlay is actively editing this shape's text, so
              its own blinking cursor isn't doubled up with this label */}
          {text && !isEditingText && (
            <Text
              text={text}
              hitFunc={textLinesHitFunc}
              x={-radiusX}
              y={-radiusY}
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
              x={-radiusX}
              y={-radiusY}
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
        </Group>
      )}
      {(isSelected || isHovering) && (
        <>
          <Circle x={ax} y={ay} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleEndpointMove(0)} onDragEnd={handleEndpointEnd(0)} />
          <Circle x={bx} y={by} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleEndpointMove(1)} onDragEnd={handleEndpointEnd(1)} />
          {hasCurvature && (
            <>
              <Circle x={topX} y={topY} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleCurvatureMove('top')} onDragEnd={handleCurvatureEnd('top')} />
              <Circle x={bottomX} y={bottomY} radius={6} fill="white" stroke="#2962ff" strokeWidth={2} draggable onDragStart={handleDragStart} onDragMove={handleCurvatureMove('bottom')} onDragEnd={handleCurvatureEnd('bottom')} />
            </>
          )}
        </>
      )}
    </Group>
  );
}
