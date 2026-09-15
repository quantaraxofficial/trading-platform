import React, { useRef, useEffect } from 'react';
import { Text as KonvaText, Group, Transformer, Rect as KonvaRect } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';

interface EmojiToolProps {
  id: string;
  points: { logical: number; price: number }[];
  emojiChar: string;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  initialBarWidth?: number;
  isSelected: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  onUpdateScale?: (scaleX: number, scaleY: number, rotation: number) => void;
  isLocked?: boolean;
}

export function EmojiTool({ 
  id, points, emojiChar, scaleX = 1, scaleY = 1, rotation = 0,  initialBarWidth, isSelected, chart, series, onSelect, onUpdatePoints, onUpdateScale,
  emojiSize = 40, isLocked = false
}: EmojiToolProps & { emojiSize?: number }) {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      const layer = trRef.current.getLayer();
      if (layer) {
        layer.batchDraw();
      }
    }
  }, [isSelected]);

  if (points.length < 1) return null;

  const [p1] = points;
  
  const x = logicalToPixel(chart, p1.logical);
  const y = priceToPixel(series, p1.price);

  if (x === null || y === null) return null;

  const actualEmojiSize = emojiSize || 40;
  const finalScaleX = scaleX || 1;
  const finalScaleY = scaleY || 1;

  return (
    <>
      <Group
        id={id}
        ref={shapeRef}
        x={x}
        y={y}
        width={actualEmojiSize}
        height={actualEmojiSize}
        offsetX={actualEmojiSize / 2}
        offsetY={actualEmojiSize / 2}
        scaleX={finalScaleX}
        scaleY={finalScaleY}
        rotation={rotation}
        draggable={isSelected && !isLocked}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => {
          if (!onUpdatePoints) return;
          const stage = e.target.getStage();
          if(!stage) return;
          
          // Get the new X/Y after dragging the group
          const newX = e.target.x();
          const newY = e.target.y();
          
          const logical = pixelToLogical(chart, newX);
          const price = pixelToPrice(series, newY);
          
          if (logical !== null && price !== null) {
            onUpdatePoints([{ logical, price }]);
          }
        }}
        onTransformEnd={(e) => {
          if (!onUpdateScale || !onUpdatePoints) return;
          const node = shapeRef.current;
          
          const newScaleX = node.scaleX();
          const newScaleY = node.scaleY();
          const newRotation = node.rotation();
          
          onUpdateScale(newScaleX, newScaleY, newRotation);
          
          // Also update position since transforming might change it slightly
          const logical = pixelToLogical(chart, node.x());
          const price = pixelToPrice(series, node.y());
          if (logical !== null && price !== null) {
            onUpdatePoints([{ logical, price }]);
          }
        }}
      >
        <KonvaText
          text={emojiChar || '😃'}
          fontSize={actualEmojiSize}
          fontFamily="'Segoe UI Emoji', 'Apple Color Emoji', sans-serif"
          fill="black"
          x={actualEmojiSize / 2}
          y={actualEmojiSize / 2}
          offsetX={actualEmojiSize / 2}
          offsetY={actualEmojiSize / 2}
          listening={true}
          perfectDrawEnabled={false}
          hitFunc={(context, shape) => {
            context.beginPath();
            context.rect(0, 0, actualEmojiSize, actualEmojiSize);
            context.closePath();
            context.fillStrokeShape(shape);
          }}
        />
      </Group>

      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            // limit resize
            if (Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10) {
              return oldBox;
            }
            return newBox;
          }}
          rotateAnchorOffset={15}
          enabledAnchors={isLocked ? [] : ['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          rotateEnabled={!isLocked}
        />
      )}
    </>
  );
}
