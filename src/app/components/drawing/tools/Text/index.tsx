import React, { useRef, useLayoutEffect, useState } from 'react';
import { Text as KonvaText, Group, Rect } from 'react-konva';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../../core/coordinates';
import { useChartTick } from '../../core/useChartTick';
import { useSnap } from '../../core/snap';

interface TextToolProps {
  id: string;
  points: { logical: number; price: number }[]; // Needs 1 point
  stroke: string;
  isSelected: boolean;
  chart: any;
  series: any;
  onSelect: () => void;
  text?: string;
  onUpdateText?: (newText: string) => void;
  onEdit?: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  initialBarWidth?: number;
  isLocked?: boolean;
  fontSize?: number;
  textColor?: string;
  bold?: boolean;
  italic?: boolean;
  showBackground?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  showBorder?: boolean;
  borderColor?: string;
  textWrap?: boolean;
  isEditingText?: boolean;
}

export function TextTool({ 
  id, 
  points, 
  stroke, 
  isSelected, 
  chart, 
  series, 
  onSelect, 
  text = 'Text', 
  onUpdateText, 
  onEdit, 
  onUpdatePoints, 
  initialBarWidth, 
  isLocked = false,
  fontSize = 16,
  textColor,
  bold = false,
  italic = false,
  showBackground = false,
  backgroundColor = '#2962ff',
  backgroundOpacity = 0.2,
  showBorder = false,
  borderColor = '#b2b5be',
  textWrap = false,
  isEditingText = false,
}: TextToolProps) {
  const snap = useSnap(chart, series);
  useChartTick(chart, series);
  const textRef = useRef<any>(null);
  const [textDims, setTextDims] = useState({ width: 0, height: 0 });

  // (an empty text being typed shows TradingView's faded "Add text")
  const shownText = text || (isEditingText ? 'Add text' : '');
  // Measured before the frame is painted, so a text changing as it's typed stays centred on its
  // point without a frame drawn off-centre
  useLayoutEffect(() => {
    if (textRef.current) {
      const w = textRef.current.width();
      const h = textRef.current.height();
      if (w !== textDims.width || h !== textDims.height) {
        setTextDims({ width: w, height: h });
      }
    }
  }, [shownText, fontSize, bold, italic, textWrap]);

  if (points.length < 1) return null;

  const [p1] = points;
  
  const x = logicalToPixel(chart, p1.logical);
  const y = priceToPixel(series, p1.price);

  if (x === null || y === null) return null;

  const fontStyle = `${bold ? 'bold ' : ''}${italic ? 'italic ' : ''}`.trim() || 'normal';

  return (
    <Group 
      x={x} 
      y={y} 
      draggable={isSelected && !isLocked}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onDblClick={(e) => {
        e.cancelBubble = true;
        if (onEdit) onEdit();
      }}
      onDragMove={(e) => {
        if (!onUpdatePoints || e.target !== e.currentTarget) return;
        const snapped = snap(e.target.x(), e.target.y(), e.evt, e.target);
        if (snapped) onUpdatePoints([snapped]);
      }}
    >
      {/* Background */}
      {showBackground && (
        <Rect
          x={-textDims.width / 2}
          y={-textDims.height / 2}
          width={textDims.width}
          height={textDims.height}
          fill={backgroundColor}
          opacity={backgroundOpacity}
          cornerRadius={2}
        />
      )}

      {/* Border */}
      {showBorder && (
        <Rect
          x={-textDims.width / 2}
          y={-textDims.height / 2}
          width={textDims.width}
          height={textDims.height}
          stroke={borderColor}
          strokeWidth={1}
          cornerRadius={2}
        />
      )}

      <KonvaText
        ref={textRef}
        id={id}
        name={isEditingText ? 'tv-edit-text' : undefined}
        opacity={text ? 1 : 0.6}
        x={0}
        y={0}
        offsetX={textDims.width / 2}
        offsetY={textDims.height / 2}
        text={shownText}
        fontSize={fontSize}
        fontStyle={fontStyle}
        fontFamily="sans-serif"
        fill={textColor || stroke}
        padding={4}
        width={textWrap ? 200 : undefined} // Example wrap width, can be improved
        hitFunc={(context, shape) => {
          context.beginPath();
          context.rect(0, 0, shape.width(), shape.height());
          context.closePath();
          context.fillStrokeShape(shape);
        }}
        listening={true}
      />
    </Group>
  );
}
