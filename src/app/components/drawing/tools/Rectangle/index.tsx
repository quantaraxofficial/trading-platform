import React, { useRef } from 'react';
import { Rect, Circle, Group, Text, Line } from 'react-konva';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../../core/coordinates';
import { useChartTick } from '../../core/useChartTick';
import { textLinesHitFunc } from '../../core/textHit';
import { useSnap, useSnappedDrag } from '../../core/snap';
import { HandleCircle, HandleRect } from '../../core/Handles';

interface RectangleProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  strokeWidth: number;
  isSelected: boolean;
  isHovering?: boolean;
  chart: any;
  series: any;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  // Extended properties
  fill?: string;
  backgroundVisible?: boolean;
  text?: string;
  onTextEdit?: () => void;
  isEditingText?: boolean;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textAlign?: string;
  textVerticalAlign?: string;
  middleLineVisible?: boolean;
  middleLineColor?: string;
  middleLineStyle?: number[];
  extendLeft?: boolean;
  extendRight?: boolean;
  lineStyle?: string;
  isLocked?: boolean;
}

export function RectangleTool({
  id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints,
  fill, backgroundVisible, text, onTextEdit, isEditingText = false, textColor, fontSize, bold, italic,
  textAlign, textVerticalAlign, middleLineVisible, middleLineColor, middleLineStyle,
  extendLeft, extendRight, lineStyle, isLocked = false
}: RectangleProps) {
  const snap = useSnap(chart, series);
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  const groupRef = useRef<any>(null);

  if (points.length !== 2) return null;

  const [p1, p2] = points;
  
  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

  let left = Math.min(x1, x2);
  let top = Math.min(y1, y2);
  let width = Math.abs(x2 - x1);
  let height = Math.abs(y2 - y1);

  const stage = groupRef.current?.getStage();
  const stageWidth = stage ? stage.width() : 5000; // Fallback

  if (extendLeft) {
    width += left;
    left = 0;
  }
  if (extendRight) {
    width = stageWidth - left;
  }

  const rectColor = stroke || '#9b59b6';
  const bgColor = backgroundVisible !== false ? (fill || (stroke || '#9b59b6') + '33') : 'transparent';

  // Helper: compute time from a logical coordinate using chart data
  const getTimeForLogical = (logical: number): number | undefined => {
    const fullData = (window as any).__chartFullData || [];
    if (fullData.length === 0) return undefined;
    const idx = Math.round(logical);
    if (idx >= 0 && idx < fullData.length) {
      const intIdx = Math.floor(logical);
      const fraction = logical - intIdx;
      if (fraction > 0 && intIdx + 1 < fullData.length) {
        return fullData[intIdx].time + fraction * (fullData[intIdx + 1].time - fullData[intIdx].time);
      }
      return fullData[Math.min(idx, fullData.length - 1)].time;
    }
    if (fullData.length >= 2) {
      const barSpacing = (fullData[fullData.length - 1].time - fullData[0].time) / (fullData.length - 1);
      return fullData[0].time + logical * barSpacing;
    }
    return undefined;
  };

  const handleDragMove = (index: number, e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const snapped = snap(pos.x, pos.y, e.evt, e.target);
    if (!snapped) return;

    const newPoints = [...points];
    newPoints[index] = snapped;
    onUpdatePoints(newPoints);
  };

  const handleSideDrag = (side: 'top' | 'bottom' | 'left' | 'right', e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const snapped = snap(pos.x, pos.y, e.evt);
    if (!snapped) return;
    const { logical, price, time } = snapped;

    const newPoints = [...points];
    // Compare price to find top/bottom
    const p1IsTop = points[0].price > points[1].price;
    const topIdx = p1IsTop ? 0 : 1;
    const botIdx = 1 - topIdx;

    const p1IsLeft = points[0].logical < points[1].logical;
    const leftIdx = p1IsLeft ? 0 : 1;
    const rightIdx = 1 - leftIdx;

    if (side === 'top') {
      newPoints[topIdx] = { ...newPoints[topIdx], price };
    } else if (side === 'bottom') {
      newPoints[botIdx] = { ...newPoints[botIdx], price };
    } else if (side === 'left') {
      newPoints[leftIdx] = { ...newPoints[leftIdx], logical, time };
    } else if (side === 'right') {
      newPoints[rightIdx] = { ...newPoints[rightIdx], logical, time };
    }
    onUpdatePoints(newPoints);
  };

  const handleGroupDragEnd = (e: any) => { move.end(e); };

  return (
    <Group 
      id={id} 
      ref={groupRef}
      draggable={(isSelected || isHovering) && !isLocked}
      onDragStart={move.start} onDragMove={move.drag} onDragEnd={handleGroupDragEnd}
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(); }}
    >
      <Rect
        x={left}
        y={top}
        width={width}
        height={height}
        stroke={rectColor}
        strokeWidth={strokeWidth || 2}
        fill={bgColor}
        dash={lineStyle === 'Dashed' ? [5, 5] : lineStyle === 'Dotted' ? [2, 2] : undefined}
        hitStrokeWidth={10}
      />
      
      {middleLineVisible && (
        <Line
          points={[left, top + height / 2, left + width, top + height / 2]}
          stroke={middleLineColor || rectColor}
          strokeWidth={1.5}
          dash={[6, 4]}
        />
      )}

      {/* Suppressed while the HTML overlay is actively editing this shape's text, so
          its own blinking cursor isn't doubled up with this label */}
      {text && !isEditingText && (
        <Text
          text={text}
          hitFunc={textLinesHitFunc}
          x={left + 5}
          y={top + 5}
          width={width - 10}
          height={height - 10}
          fill={textColor || rectColor}
          fontSize={fontSize || 14}
          fontStyle={`${bold ? 'bold ' : ''}${italic ? 'italic' : ''}`.trim() || 'normal'}
          align={textAlign || 'center'}
          verticalAlign={textVerticalAlign || 'middle'}
          onClick={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
          onTap={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
        />
      )}

      {(isSelected || isHovering) && !text && !isEditingText && (
        <Text
          text="+ Add text"
          hitFunc={textLinesHitFunc}
          x={left}
          y={top}
          width={width}
          height={height}
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
          {/* Corner handles (Circles) */}
          <HandleCircle 
            x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={1.5} 
            draggable={!isLocked} onDragMove={(e) => handleDragMove(0, e)} 
          />
          <HandleCircle 
            x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={1.5} 
            draggable={!isLocked} onDragMove={(e) => handleDragMove(1, e)} 
          />
          <HandleCircle 
            x={x2} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={1.5} 
            draggable={!isLocked} onDragMove={(e) => {
              e.cancelBubble = true;
              if (!onUpdatePoints) return;
              const stage = e.target.getStage();
              const pos = stage.getPointerPosition();
              if (!pos) return;
              const snapped = snap(pos.x, pos.y, e.evt, e.target);
              if (!snapped) return;
              const { logical, price, time } = snapped;
              onUpdatePoints([{ logical: p1.logical, price, time: (p1 as any).time }, { logical, price: p2.price, time }]);
            }} 
          />
          <HandleCircle 
            x={x1} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={1.5} 
            draggable={!isLocked} onDragMove={(e) => {
              e.cancelBubble = true;
              if (!onUpdatePoints) return;
              const stage = e.target.getStage();
              const pos = stage.getPointerPosition();
              if (!pos) return;
              const snapped = snap(pos.x, pos.y, e.evt, e.target);
              if (!snapped) return;
              const { logical, price, time } = snapped;
              onUpdatePoints([{ logical, price: p1.price, time }, { logical: p2.logical, price, time: (p2 as any).time }]);
            }} 
          />

          {/* Side handles (Rounded Squares) */}
          <HandleRect 
            x={left + width / 2 - 5} y={top - 5} width={10} height={10} fill="white" stroke="#2962ff" strokeWidth={1.5} cornerRadius={2} 
            draggable={!isLocked} onDragMove={(e) => handleSideDrag('top', e)} 
          />
          <HandleRect 
            x={left + width / 2 - 5} y={top + height - 5} width={10} height={10} fill="white" stroke="#2962ff" strokeWidth={1.5} cornerRadius={2} 
            draggable={!isLocked} onDragMove={(e) => handleSideDrag('bottom', e)} 
          />
          <HandleRect 
            x={left - 5} y={top + height / 2 - 5} width={10} height={10} fill="white" stroke="#2962ff" strokeWidth={1.5} cornerRadius={2} 
            draggable={!isLocked} onDragMove={(e) => handleSideDrag('left', e)} 
          />
          <HandleRect 
            x={left + width - 5} y={top + height / 2 - 5} width={10} height={10} fill="white" stroke="#2962ff" strokeWidth={1.5} cornerRadius={2} 
            draggable={!isLocked} onDragMove={(e) => handleSideDrag('right', e)} 
          />
        </>
      )}
    </Group>
  );
}
