import React, { useEffect, useRef } from 'react';
import { Line, Circle, Group, Text } from 'react-konva';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface HorizontalRayToolProps {
  id: string;
  points: { logical: number; price: number }[]; // Exactly 1 point: where the ray starts
  stroke: string;
  strokeWidth: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  isSelected: boolean;
  isHovering?: boolean;
  chart: any;
  series: any;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  isLocked?: boolean;
  text?: string;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textVAlign?: 'Top' | 'Middle' | 'Bottom';
  textHAlign?: 'Left' | 'Center' | 'Right';
  priceLabel?: boolean; // Native price-axis badge, on by default
}

// A horizontal ray runs from a single anchor point straight right, off the edge of the
// chart, at that anchor's fixed price. It can be moved — dragging either the handle or the
// line body repositions its one anchor point — but unlike a trend line it has no second
// endpoint to reshape: the direction (horizontal) and extent (to infinity) are fixed by
// definition, so only the anchor itself ever moves.
export function HorizontalRayTool({
  id, points, stroke, strokeWidth, lineStyle = 'solid',
  isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints, isLocked = false,
  text, textColor, fontSize = 14, bold = false, italic = false,
  textVAlign = 'Bottom', textHAlign = 'Center', priceLabel = true,
}: HorizontalRayToolProps) {
  useChartTick(chart);

  // The "Price label" option puts a real badge on the chart's own price axis at this
  // ray's price — the same native mechanism the app already uses for TP/SL/order lines
  // (series.createPriceLine), not a hand-drawn imitation. lineVisible is off so this
  // doesn't ALSO draw its own full-width line across the whole chart (including to the
  // left of the anchor, where the ray shouldn't reach) — the Konva Line below is what
  // actually draws the visible ray; this call exists purely for the axis badge.
  const priceLineRef = useRef<any>(null);
  const price = points[0]?.price;
  useEffect(() => {
    if (!series) return;
    if (priceLineRef.current) {
      try { series.removePriceLine(priceLineRef.current); } catch { /* already gone */ }
      priceLineRef.current = null;
    }
    if (priceLabel && price !== undefined) {
      try {
        priceLineRef.current = series.createPriceLine({
          price,
          color: stroke || '#2962ff',
          lineWidth: 1,
          lineVisible: false,
          axisLabelVisible: true,
          title: '',
        });
      } catch { /* series not ready yet */ }
    }
    return () => {
      if (priceLineRef.current && series) {
        try { series.removePriceLine(priceLineRef.current); } catch { /* series already disposed */ }
        priceLineRef.current = null;
      }
    };
  }, [series, priceLabel, price, stroke]);

  if (points.length < 1) return null;

  const p1 = points[0];
  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  if (x1 === null || y1 === null) return null;

  // Far enough past any realistic stage width that the line always visually reaches the
  // right edge — Konva simply clips whatever falls outside the stage, so this reads as
  // "extends to infinity" without needing the stage's actual pixel width.
  const farRight = x1 + 100000;

  const dash = lineStyle === 'dashed' ? [10, 10] : lineStyle === 'dotted' ? [2, 4] : [];

  // Whole-shape drag (grabbing the line body): Konva reports the Group's own (dx, dy)
  // offset here, not an absolute position, since the Line's points are baked in as
  // absolute coordinates rather than relative to the Group.
  const handleGroupDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    const node = e.target;
    const dx = node.x();
    const dy = node.y();
    const newLogical = pixelToLogical(chart, x1 + dx);
    const newPrice = pixelToPrice(series, y1 + dy);
    if (newLogical !== null && newPrice !== null) {
      onUpdatePoints([{ logical: newLogical, price: newPrice }]);
    }
    node.position({ x: 0, y: 0 });
  };

  // Handle drag: the Circle's own x/y IS the absolute position directly, unrelated to the
  // Group's offset (which stays put — onDragStart below stops this from also bubbling up
  // into a Group-level drag).
  const handleAnchorDrag = (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const logical = pixelToLogical(chart, e.target.x());
    const price = pixelToPrice(series, e.target.y());
    if (logical !== null && price !== null) {
      onUpdatePoints([{ logical, price }]);
    }
  };

  // Text sits somewhere along the ray's VISIBLE span (from its anchor, or the left edge of
  // the pane if the anchor has scrolled off-screen, to the pane's right edge) — matching
  // what "Left/Center/Right" actually means for a line that has no real right endpoint.
  // Using a Konva Text `width` box + `align` (rather than hand-computing x per alignment)
  // is what makes "Right" actually end at the visible edge instead of overflowing it.
  const paneWidth = (() => {
    try { return chart.timeScale().width() || 0; } catch { return 0; }
  })();
  const visLeft = Math.max(x1, 0);
  const boxWidth = Math.max(paneWidth - visLeft, 10);
  // Text has no fixed height, so `verticalAlign` wouldn't apply — position its top edge
  // directly instead, per which side of the line it should read on.
  const textY = textVAlign === 'Top' ? y1 - fontSize - 6 : textVAlign === 'Middle' ? y1 - fontSize / 2 : y1 + 6;
  const fontStyle = [bold ? 'bold' : '', italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal';

  return (
    <Group
      id={id}
      draggable={(isSelected || isHovering) && !isLocked}
      onDragEnd={handleGroupDragEnd}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Line
        points={[x1, y1, farRight, y1]}
        stroke={isSelected ? '#2962ff' : stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        hitStrokeWidth={10}
        listening={true}
      />
      {text && (
        <Text
          text={text}
          x={visLeft}
          y={textY}
          width={boxWidth}
          align={textHAlign.toLowerCase() as 'left' | 'center' | 'right'}
          fontSize={fontSize}
          fontStyle={fontStyle}
          fill={textColor || stroke}
          padding={4}
          listening={false}
        />
      )}
      {(isSelected || isHovering) && (
        <Circle
          x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2}
          draggable={!isLocked}
          onDragStart={(e) => { e.cancelBubble = true; }}
          onDragMove={handleAnchorDrag}
          onDragEnd={handleAnchorDrag}
        />
      )}
    </Group>
  );
}
