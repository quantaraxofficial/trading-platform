import React, { useRef, useEffect } from 'react';
import { Text as KonvaText, Group, Transformer, Image as KonvaImage, Path as KonvaPath, Rect as KonvaRect } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { useSnap } from '../core/snap';
import { isIconId, iconPath, useEmojiImage } from '../../ui/emojiArt';

// TradingView places an emoji/icon 80px square, centred on its point
export const EMOJI_DEFAULT_SIZE = 80;

interface EmojiToolProps {
  id: string;
  points: { logical: number; price: number }[];
  emojiChar: string;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  initialBarWidth?: number;
  isSelected: boolean;
  isHovering?: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  onUpdateScale?: (scaleX: number, scaleY: number, rotation: number) => void;
  isLocked?: boolean;
  // An icon's colour (emojis keep their own colours)
  color?: string;
}

export function EmojiTool({
  id, points, emojiChar, scaleX = 1, scaleY = 1, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints, onUpdateScale,
  emojiSize, isLocked = false, color = '#2962ff'
}: EmojiToolProps & { emojiSize?: number }) {
  const snap = useSnap(chart, series);
  useChartTick(chart, series);
  const image = useEmojiImage(emojiChar || null);
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const showHandles = isSelected || isHovering;

  useEffect(() => {
    if (showHandles && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [showHandles]);

  if (points.length < 1 || !chart || !series) return null;
  const [p1] = points;
  const x = logicalToPixel(chart, p1.logical);
  const y = priceToPixel(series, p1.price);
  if (x === null || y === null) return null;

  const size = emojiSize || EMOJI_DEFAULT_SIZE;
  const icon = isIconId(emojiChar) ? iconPath(emojiChar) : null;

  let art: React.ReactNode;
  if (icon) {
    // Fit the icon's view box into the square, centred
    const k = size / Math.max(icon[0], icon[1]);
    art = <KonvaPath data={icon[2]} fill={color} scaleX={k} scaleY={k} x={(size - icon[0] * k) / 2} y={(size - icon[1] * k) / 2} listening={false} />;
  } else if (image) {
    art = <KonvaImage image={image} width={size} height={size} listening={false} />;
  } else {
    art = (
      <KonvaText text={emojiChar || '😃'} fontSize={size * 0.86} width={size} height={size} align="center" verticalAlign="middle"
        fontFamily="'Segoe UI Emoji', 'Apple Color Emoji', sans-serif" listening={false} perfectDrawEnabled={false} />
    );
  }

  return (
    <>
      <Group
        id={id}
        ref={shapeRef}
        x={x}
        y={y}
        width={size}
        height={size}
        offsetX={size / 2}
        offsetY={size / 2}
        scaleX={scaleX || 1}
        scaleY={scaleY || 1}
        draggable={showHandles && !isLocked}
        onMouseDown={(e) => { e.cancelBubble = true; onSelect(); }}
        onTap={(e) => { e.cancelBubble = true; onSelect(); }}
        onDragMove={(e) => {
          if (!onUpdatePoints || e.target !== e.currentTarget) return;
          const snapped = snap(e.target.x(), e.target.y(), e.evt, e.target);
          if (snapped) onUpdatePoints([snapped]);
        }}
        onTransformEnd={() => {
          if (!onUpdateScale || !onUpdatePoints) return;
          const node = shapeRef.current;
          onUpdateScale(node.scaleX(), node.scaleY(), 0);
          // Corner resizes move the centre too
          const logical = pixelToLogical(chart, node.x());
          const price = pixelToPrice(series, node.y());
          if (logical !== null && price !== null) onUpdatePoints([{ logical, price }]);
        }}
      >
        {/* The whole square is grabbable, not just the art's opaque pixels */}
        <KonvaRect width={size} height={size} fill="transparent" />
        {art}
      </Group>

      {showHandles && (
        // TradingView: a square outline with four corner handles; resizing keeps it square
        // and there is no rotation handle
        <Transformer
          ref={trRef}
          keepRatio
          rotateEnabled={false}
          enabledAnchors={isLocked ? [] : ['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          borderStroke="#2962ff"
          borderStrokeWidth={1}
          anchorStroke="#2962ff"
          anchorStrokeWidth={2}
          anchorFill="#ffffff"
          anchorSize={11}
          anchorCornerRadius={6}
          boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10 ? oldBox : newBox)}
        />
      )}
    </>
  );
}
