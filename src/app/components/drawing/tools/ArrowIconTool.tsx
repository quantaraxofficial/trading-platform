import React, { useState } from 'react';
import { Path, Group, Text, Rect, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { useSnap } from '../core/snap';
import { HandleCircle } from '../core/Handles';

interface ArrowIconToolProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  isSelected: boolean;
  isHovering?: boolean;
  isLocked?: boolean;
  type: 'arrow_mark_up' | 'arrow_mark_down';
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

export function ArrowIconTool({
  id, points, stroke, isSelected, isHovering = false, isLocked = false, type, chart, series, onSelect, onUpdatePoints,
  text, textColor, fontSize, bold, italic
}: ArrowIconToolProps) {
  const snap = useSnap(chart, series);
  useChartTick(chart, series);
  // shadowBlur is redrawn every frame while the handle is dragged — switched off meanwhile
  const [isDragging, setIsDragging] = useState(false);
  if (!chart || !series || points.length < 1) return null;

  const p = points[0];
  const x = logicalToPixel(chart, p.logical);
  const y = priceToPixel(series, p.price);

  if (x === null || y === null) return null;

  const color = stroke || '#009688';
  const arrowUpData = "M12 4l-8 8h6v8h4v-8h6z";
  const isDown = type === 'arrow_mark_down';
  const textOffset = isDown ? 30 : -25;
  // The icon's 24px box is centered on the anchor, so the arrowhead's tip sits 8px above
  // it (mark up) or 8px below it (mark down, the same path rotated 180°). The handle sits
  // just past the tip, touching it — centered on the tip, it would hide the small head.
  const handleRadius = 6;
  const handleOffset = isDown ? 8 + handleRadius : -8 - handleRadius;

  // The single handle only moves the mark — the icon has a fixed size, so nothing resizes.
  const handleTipDrag = (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const snapped = snap(e.target.x(), e.target.y() - handleOffset, e.evt);
    if (!snapped) return;
    const px = logicalToPixel(chart, snapped.logical);
    const py = priceToPixel(series, snapped.price);
    if (px !== null && py !== null) e.target.position({ x: px, y: py + handleOffset });
    onUpdatePoints([snapped]);
  };

  return (
    <Group
      id={id}
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(); }}
    >
      {/* Invisible hit box for easier selection — Konva needs a fill to capture events */}
      <Rect
        x={x - 20}
        y={y - 20}
        width={40}
        height={40}
        fill="rgba(255,0,0,0.001)"
        hitStrokeWidth={10}
      />

      <Path
        x={x - 12}
        y={y - 12}
        data={arrowUpData}
        fill={color}
        rotation={isDown ? 180 : 0}
        offsetX={isDown ? 24 : 0}
        offsetY={isDown ? 24 : 0}
        shadowColor={isSelected ? color : 'transparent'}
        shadowBlur={isSelected && !isDragging ? 6 : 0}
        shadowOpacity={0.4}
      />
      {text && (
        <Text
          text={text}
          x={x}
          y={y + textOffset}
          fill={textColor || color}
          fontSize={fontSize || 14}
          fontStyle={`${bold ? 'bold ' : ''}${italic ? 'italic' : ''}`.trim() || 'normal'}
          align="center"
          offsetX={(text.length * (fontSize || 14) * 0.5) / 2}
        />
      )}

      {(isSelected || isHovering) && (
        <HandleCircle
          x={x}
          y={y + handleOffset}
          radius={handleRadius}
          fill="white"
          stroke="#2962ff"
          strokeWidth={2}
          draggable={!isLocked}
          onDragStart={(e) => { e.cancelBubble = true; setIsDragging(true); }}
          onDragMove={handleTipDrag}
          onDragEnd={(e) => { handleTipDrag(e); setIsDragging(false); }}
        />
      )}
    </Group>
  );
}
