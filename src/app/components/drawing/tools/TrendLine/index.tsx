import React, { useState, useRef, useEffect } from 'react';
import { Line, Circle, Group, Text } from 'react-konva';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../../core/coordinates';
import { useChartTick } from '../../core/useChartTick';
import { useSnap, useSnappedDrag } from '../../core/snap';
import { HandleCircle } from '../../core/Handles';

interface TrendLineProps {
  id: string;
  points: { logical: number; price: number }[]; // Needs exactly 2 points
  stroke: string;
  strokeWidth: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  showMiddlePoint?: boolean;
  showPriceLabels?: boolean;
  showStats?: boolean;
  statsPosition?: 'Left' | 'Center' | 'Right';
  isSelected: boolean;
  isHovering?: boolean;
  chart: any;
  series: any;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  isLocked?: boolean;
  text?: string;
  onTextEdit?: () => void;
  isEditingText?: boolean;
}

export function TrendLine({
  id, points, stroke, strokeWidth, lineStyle = 'solid',
  extendLeft = false, extendRight = false, showMiddlePoint = false,
  showPriceLabels = false, showStats = false, statsPosition = 'Right',
  isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints, isLocked = false,
  text, onTextEdit, isEditingText = false
}: TrendLineProps) {
  const snap = useSnap(chart, series);
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  // The resize handles are only rendered while (isSelected || isHovering) — but a resize
  // drag moves the very endpoint that hover-tracking hit-tests against, so a drag started
  // by hovering (not clicking to select first) very quickly carries the cursor outside
  // the line's hit area, hover flips false, and — with isSelected also false — the whole
  // handles block used to unmount mid-drag, destroying the exact Circle node Konva was
  // dragging and freezing the resize wherever it happened to be at that instant. Any
  // constraint applied during the drag (e.g. the Shift 45° angle lock below) only had a
  // few pixels of real cursor movement to work with before that happened, which is why it
  // could look "wrong" for most angles: the resize wasn't actually completing at all.
  // Tracking the drag explicitly keeps the handles mounted for its whole duration.
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  // Which endpoint (0 or 1) is currently being resize-dragged, and a ref to its live
  // Konva node — both needed by the Shift-toggle effect below, which has to reach in
  // and move that exact node from outside Konva's own dragmove callback.
  const draggingIndexRef = useRef<number | null>(null);
  const handleRefs = useRef<[any, any]>([null, null]);
  if (points.length !== 2) return null;

  const [p1, p2] = points;
  
  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

  // Calculate extended points if needed
  let displayX1 = x1;
  let displayY1 = y1;
  let displayX2 = x2;
  let displayY2 = y2;

  if (extendLeft || extendRight) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > 0) {
      const ux = dx / length;
      const uy = dy / length;
      
      const extension = 100000; // Large enough for any screen

      if (extendLeft) {
        displayX1 = x1 - ux * extension;
        displayY1 = y1 - uy * extension;
      }
      if (extendRight) {
        displayX2 = x2 + ux * extension;
        displayY2 = y2 + uy * extension;
      }
    }
  }

  const dash = lineStyle === 'dashed' ? [10, 10] : lineStyle === 'dotted' ? [2, 4] : [];

  // Stats calculation
  const priceDiff = p2.price - p1.price;
  const percentChange = ((p2.price - p1.price) / p1.price) * 100;
  const barDiff = Math.abs(Math.round(p2.logical - p1.logical));
  const statsText = `${priceDiff.toFixed(2)} (${percentChange.toFixed(2)}%) ${barDiff} bars`;

  const getStatsPos = () => {
    if (statsPosition === 'Left') return { x: x1, y: y1 - 20 };
    if (statsPosition === 'Center') return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 20 };
    return { x: x2, y: y2 - 20 };
  };

  const statsPos = getStatsPos();

  const handleDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    const node = e.target;
    // node could be Group (whole shape) or Circle (handle)
    const isHandle = node.className === 'Circle';

    if (!isHandle) move.end(e);
  };

  // Shared by the real Konva dragmove/dragend callback below AND by the Shift-toggle
  // effect further down: given a handle's raw (unsnapped) target position, applies the
  // 45°-angle lock when shiftHeld is true, repositions the live Konva node to match,
  // and pushes the resulting point up via onUpdatePoints.
  const applyHandleMove = (index: number, node: any, rawX: number, rawY: number, shiftHeld: boolean, evt?: any) => {
    if (!onUpdatePoints) return;
    // Without Shift the handle snaps to candles (and the magnet) exactly as placing it did
    if (!shiftHeld) {
      const snapped = snap(rawX, rawY, evt, node);
      if (snapped) {
        const newPoints = [...points];
        newPoints[index] = snapped;
        onUpdatePoints(newPoints);
      }
      return;
    }
    let newX = rawX;
    let newY = rawY;

    // Same 45°-multiple angle lock the line gets while first being drawn, now also
    // while resizing an already-placed line by dragging one of its endpoints — held
    // Shift snaps this handle's angle around the OTHER (fixed) endpoint.
    if (shiftHeld) {
      const anchorX = index === 0 ? x2 : x1;
      const anchorY = index === 0 ? y2 : y1;
      const dx = newX - anchorX;
      const dy = newY - anchorY;
      if (dx !== 0 || dy !== 0) {
        const step = Math.PI / 4; // 45°
        const angle = Math.round(Math.atan2(dy, dx) / step) * step;
        const length = dx * Math.cos(angle) + dy * Math.sin(angle);
        newX = anchorX + length * Math.cos(angle);
        newY = anchorY + length * Math.sin(angle);
      }
    }
    // Konva's own drag machinery keeps positioning this node at the raw cursor spot on
    // every pointer move regardless of what the points prop says (it takes priority
    // over React-driven x/y during an active drag), so the target position has to be
    // commanded on the node directly here too, not just handed off via onUpdatePoints,
    // or the handle would visually lag behind until the drag ends. Doing this
    // unconditionally (not just in the shiftHeld branch) is also what makes releasing
    // Shift mid-drag snap the handle straight back to the raw cursor position instead
    // of leaving it wherever it was last pinned.
    if (node) node.position({ x: newX, y: newY });

    const logical = pixelToLogical(chart, newX);
    const price = pixelToPrice(series, newY);

    if (logical !== null && price !== null) {
      const newPoints = [...points];
      newPoints[index] = { logical, price };
      onUpdatePoints(newPoints);
    }
  };

  const handleCircleDrag = (index: number) => (e: any) => {
    e.cancelBubble = true; // Prevent Group drag
    applyHandleMove(index, e.target, e.target.x(), e.target.y(), !!e.evt?.shiftKey, e.evt);
  };

  // Without this, toggling Shift while the mouse sits still mid-resize does nothing
  // visible until the next actual pointer move — since the whole snap/un-snap only ever
  // ran inside the dragmove callback above. A quick tap of Shift (press then release
  // between two mouse movements) could then land entirely between pointer-move events
  // and never get applied at all, which is what made a "tap" look like it didn't work
  // while holding Shift down through further movement did. Mirrors the same fix already
  // used for the live preview while first drawing a trend line.
  useEffect(() => {
    if (!isDraggingHandle || draggingIndexRef.current === null) return;
    const index = draggingIndexRef.current;
    const node = handleRefs.current[index];
    const stage = node?.getStage?.();

    const resync = (shiftHeld: boolean, evt: KeyboardEvent) => {
      const pos = stage?.getPointerPosition?.();
      if (!pos) return;
      applyHandleMove(index, node, pos.x, pos.y, shiftHeld, evt);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') resync(true, e); };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') resync(false, e); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraggingHandle]);

  return (
    <Group 
      id={id}
      draggable={(isSelected || isHovering) && !isLocked}
      onDragStart={move.start} onDragMove={move.drag} onDragEnd={handleDragEnd}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Line
        points={[displayX1, displayY1, displayX2, displayY2]}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        hitStrokeWidth={10}
        listening={true}
      />
      
      {showPriceLabels && (
        <>
          <Text x={x1 + 10} y={y1 - 15} text={p1.price.toFixed(2)} fontSize={10} fill={stroke} />
          <Text x={x2 + 10} y={y2 - 15} text={p2.price.toFixed(2)} fontSize={10} fill={stroke} />
        </>
      )}

      {showStats && (
        <Text 
          x={statsPos.x} 
          y={statsPos.y} 
          text={statsText} 
          fontSize={11} 
          fill={stroke}
          fontStyle="bold"
        />
      )}

      {/* Text rendering — suppressed while the HTML overlay is actively editing this
          shape's text, so its own blinking cursor isn't doubled up with this label */}
      {!isEditingText && (() => {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const textRot = (angle > 90 || angle < -90) ? angle + 180 : angle;

        if (text) {
          // offsetX must be half the rendered width for align="center" to actually
          // center the text on (mx,my) — offsetX=0 anchors at the text's own left
          // edge instead, which is what let this drift out of sync with the HTML
          // text-edit overlay (which centers using the real DOM-measured width).
          const estWidth = Math.max(text.length * 14 * 0.6, 10);
          return (
            <Group
              x={mx}
              y={my}
              rotation={textRot}
              onClick={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
              onTap={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
            >
              <Text
                text={text}
                fill={stroke}
                fontSize={14}
                width={estWidth}
                offsetX={estWidth / 2}
                offsetY={10} // Position above the line
                align="center"
              />
            </Group>
          );
        }

        // isSelected alone is enough (matches Rectangle/Circle/Ellipse) — requiring
        // isHovering too meant moving the mouse from the line up toward this label,
        // which sits 20px above it, passed through a gap with no hit-test coverage
        // and made the placeholder vanish before the click ever landed.
        if ((isSelected || isHovering) && !text) {
          const placeholderWidth = '+ Add text'.length * 12 * 0.6;
          return (
            <Group
              x={mx}
              y={my}
              rotation={textRot}
              onClick={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
              onTap={(e) => { e.cancelBubble = true; onTextEdit && onTextEdit(); }}
            >
              <Text
                text="+ Add text"
                fill="#2962ff"
                opacity={0.7}
                fontSize={12}
                width={placeholderWidth}
                offsetX={placeholderWidth / 2}
                offsetY={10}
                align="center"
              />
            </Group>
          );
        }
        return null;
      })()}

      {(isSelected || isHovering || isDraggingHandle) && (
        <>
          <HandleCircle
            ref={(node: any) => { handleRefs.current[0] = node; }}
            x={x1} y={y1} radius={6} fill="white" stroke="#2962ff" strokeWidth={2}
            draggable={!isLocked}
            onDragStart={(e) => { e.cancelBubble = true; draggingIndexRef.current = 0; setIsDraggingHandle(true); }}
            onDragMove={handleCircleDrag(0)}
            onDragEnd={(e) => { handleCircleDrag(0)(e); draggingIndexRef.current = null; setIsDraggingHandle(false); }}
          />
          {showMiddlePoint && (
            <Circle
              x={(x1 + x2) / 2} y={(y1 + y2) / 2} radius={5} fill="white" stroke="#2962ff" strokeWidth={1}
            />
          )}
          <HandleCircle
            ref={(node: any) => { handleRefs.current[1] = node; }}
            x={x2} y={y2} radius={6} fill="white" stroke="#2962ff" strokeWidth={2}
            draggable={!isLocked}
            onDragStart={(e) => { e.cancelBubble = true; draggingIndexRef.current = 1; setIsDraggingHandle(true); }}
            onDragMove={handleCircleDrag(1)}
            onDragEnd={(e) => { handleCircleDrag(1)(e); draggingIndexRef.current = null; setIsDraggingHandle(false); }}
          />
        </>
      )}
    </Group>
  );
}
