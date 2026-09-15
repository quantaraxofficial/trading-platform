import React from 'react';
import { Path, Group, Text, Rect } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface ArrowIconToolProps {
  id: string;
  points: { logical: number; price: number }[];
  stroke: string;
  isSelected: boolean;
  type: 'arrow_mark_up' | 'arrow_mark_down';
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  text?: string;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
}

export function ArrowIconTool({ 
  id, points, stroke, isSelected, type, chart, series, onSelect,
  text, textColor, fontSize, bold, italic
}: ArrowIconToolProps) {
  useChartTick(chart);
  if (!chart || !series || points.length < 1) return null;

  const p = points[0];
  const x = logicalToPixel(chart, p.logical);
  const y = priceToPixel(series, p.price);

  if (x === null || y === null) return null;

  const color = stroke || '#009688';
  const arrowUpData = "M12 4l-8 8h6v8h4v-8h6z";
  const isDown = type === 'arrow_mark_down';
  const textOffset = isDown ? 30 : -25;

  console.log('[ArrowIconTool] Rendering', id, { type, isSelected, text });

  return (
    <Group 
      id={id}
      onClick={(e) => { 
        console.log('[ArrowIconTool] Group CLICKED!', id);
        e.cancelBubble = true; 
        onSelect(); 
      }} 
      onTap={(e) => { 
        console.log('[ArrowIconTool] Group TAPPED!', id);
        e.cancelBubble = true; 
        onSelect(); 
      }}
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
        shadowBlur={isSelected ? 6 : 0}
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
    </Group>
  );
}