import React, { useEffect, useState } from 'react';
import { Group, Line, Text as KonvaText, Circle, Rect } from 'react-konva';
import { logicalToPixel, priceToPixel, calculateFibonacciLevels, pixelToLogical, pixelToPrice } from '../../core/coordinates';
import { useChartTick } from '../../core/useChartTick';
import { useSnap, useSnappedDrag } from '../../core/snap';
import { HandleCircle } from '../../core/Handles';

// Removes a set of exclusion intervals from [start, end], returning the remaining
// visible segments — used to punch gaps in a level line (around its label, and around
// any candle bodies it passes under).
function subtractRanges(start: number, end: number, exclusions: { from: number; to: number }[]): [number, number][] {
  const clipped = exclusions
    .map(e => ({ from: Math.max(start, e.from), to: Math.min(end, e.to) }))
    .filter(e => e.to > e.from)
    .sort((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const r of clipped) {
    if (merged.length > 0 && r.from <= merged[merged.length - 1].to) {
      merged[merged.length - 1].to = Math.max(merged[merged.length - 1].to, r.to);
    } else {
      merged.push({ ...r });
    }
  }
  const segments: [number, number][] = [];
  let cursor = start;
  for (const r of merged) {
    if (r.from > cursor) segments.push([cursor, r.from]);
    cursor = Math.max(cursor, r.to);
  }
  if (cursor < end) segments.push([cursor, end]);
  return segments;
}

interface FibonacciProps {
  id: string;
  points: { logical: number; price: number }[]; // Needs exactly 2 points
  stroke: string;
  strokeWidth: number;
  isSelected: boolean;
  isHovering?: boolean;
  chart: any;
  series: any;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  isLocked?: boolean;
  showTrendLine?: boolean;
  trendLineColor?: string;
  trendLineStyle?: 'solid' | 'dashed' | 'dotted';
  trendLineWidth?: number;
  fibLevels?: { id: string; enabled: boolean; value: number; color: string }[];
  useOneColor?: boolean;
  oneColor?: string;
  extendLeft?: boolean;
  extendRight?: boolean;
  levelsLineWidth?: number;
  levelsLineStyle?: 'solid' | 'dashed' | 'dotted';
  showBackground?: boolean;
  backgroundOpacity?: number;
  fibReverse?: boolean;
  fibShowLevels?: boolean;
  fibLevelFormat?: 'Values' | 'Percent' | 'Values & Percent';
  fibPrices?: boolean;
  fibShowText?: boolean;
  fibLabelHAlign?: 'Left' | 'Center' | 'Right';
  fibLabelVAlign?: 'Top' | 'Middle' | 'Bottom';
  fibFontSize?: number;
}

export function FibonacciTool({
  id, points, stroke, strokeWidth, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints, isLocked = false,
  showTrendLine = true, trendLineColor, trendLineStyle = 'dashed', trendLineWidth,
  fibLevels, useOneColor, oneColor, extendLeft, extendRight,
  levelsLineWidth, levelsLineStyle = 'solid',
  showBackground = true, backgroundOpacity = 0.2,
  fibReverse, fibShowLevels = true, fibLevelFormat = 'Values', fibPrices = true,
  fibShowText = true, fibLabelHAlign = 'Left', fibLabelVAlign = 'Middle', fibFontSize = 11,
}: FibonacciProps) {
  const snap = useSnap(chart, series);
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  if (points.length !== 2) return null;

  const [p1, p2] = points;
  
  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

  // Calculate actual levels based on settings
  // Normally 0% anchors at p2 (the second point) and 100% at p1; "Reverse" flips that.
  const zeroPoint = fibReverse ? p1 : p2;
  const hundredPoint = fibReverse ? p2 : p1;
  const diff = hundredPoint.price - zeroPoint.price;
  const startPrice = zeroPoint.price;

  const activeLevels = (fibLevels || []).filter(l => l.enabled).map(l => ({
    label: l.id,
    price: startPrice + l.value * diff,
    color: useOneColor ? (oneColor || stroke) : l.color
  }));

  // Fallback to defaults if no levels defined (before the settings modal has ever
  // been customized) — keep this reverse-aware too, matching the activeLevels path above.
  const levelsToRender = activeLevels.length > 0
    ? activeLevels
    : calculateFibonacciLevels(fibReverse ? p2.price : p1.price, fibReverse ? p1.price : p2.price, null, stroke);

  // Helper: compute time from a logical coordinate using chart data
  const getTimeForLogical = (logical: number): number | undefined => {
    const fullData = (window as any).__chartFullData || [];
    if (fullData.length === 0) return undefined;
    const idx = Math.round(logical);
    if (idx >= 0 && idx < fullData.length) {
      // Interpolate for fractional logical
      const intIdx = Math.floor(logical);
      const fraction = logical - intIdx;
      if (fraction > 0 && intIdx + 1 < fullData.length) {
        return fullData[intIdx].time + fraction * (fullData[intIdx + 1].time - fullData[intIdx].time);
      }
      return fullData[Math.min(idx, fullData.length - 1)].time;
    }
    // Extrapolate for out-of-range
    if (fullData.length >= 2) {
      const barSpacing = (fullData[fullData.length - 1].time - fullData[0].time) / (fullData.length - 1);
      return fullData[0].time + logical * barSpacing;
    }
    return undefined;
  };

  const handleDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    const node = e.target;
    const isHandle = node.className === 'Circle';

    if (!isHandle) move.end(e);
  };

  const handleCircleDrag = (index: number) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    
    const newX = e.target.x();
    const newY = e.target.y();

    const snapped = snap(newX, newY, e.evt, e.target);
    if (snapped) {
      const newPoints = [...points];
      newPoints[index] = snapped;
      onUpdatePoints(newPoints);
    }
  };

  const stageWidth = chart.chartElement().clientWidth;

  const levelEls = levelsToRender.map((level, i) => {
        const levelY = priceToPixel(series, level.price);
        if (levelY === null) return null;
        
        let lineStartX = Math.min(x1, x2);
        let lineEndX = Math.max(x1, x2);

        if (extendLeft) lineStartX = 0;
        if (extendRight) lineEndX = stageWidth;

        // Compose the label text from the ratio/percent value and/or the price, per settings
        const ratio = parseFloat(level.label);
        const textParts: string[] = [];
        if (fibShowLevels) {
          if (fibLevelFormat === 'Percent') textParts.push(`${(ratio * 100).toFixed(1)}%`);
          else if (fibLevelFormat === 'Values & Percent') textParts.push(`${level.label} (${(ratio * 100).toFixed(1)}%)`);
          else textParts.push(level.label);
        }
        if (fibPrices) textParts.push(`(${level.price.toFixed(3)})`);
        const labelText = textParts.join(' ');

        const labelWidth = 130;
        let textX: number;
        let align: 'left' | 'center' | 'right';
        if (fibLabelHAlign === 'Right') { textX = lineEndX + 5; align = 'left'; }
        else if (fibLabelHAlign === 'Center') {
          // Center on the line, but keep the label fully on-canvas — a narrow fib (or
          // one drawn near the chart's edge) would otherwise center the label right off
          // the visible area, showing only its tail end instead of the whole thing.
          textX = (lineStartX + lineEndX) / 2 - labelWidth / 2;
          textX = Math.max(0, Math.min(textX, stageWidth - labelWidth));
          align = 'center';
        }
        else { textX = lineStartX - labelWidth - 5; align = 'right'; }

        let textY: number;
        if (fibLabelVAlign === 'Top') textY = levelY - fibFontSize - 4;
        else if (fibLabelVAlign === 'Bottom') textY = levelY + 4;
        else textY = levelY - fibFontSize / 2 - 2;

        // When the label sits centered directly on the line (Middle V-align), split the
        // line into two segments with a gap around the text instead of drawing straight
        // through it — matching the "——— 0.68 ———" divider look.
        const showGap = align === 'center' && fibShowText && !!labelText && fibLabelVAlign === 'Middle';
        const lineDash = levelsLineStyle === 'dashed' ? [5, 5] : levelsLineStyle === 'dotted' ? [2, 2] : undefined;
        const lineStrokeWidth = levelsLineWidth || strokeWidth;

        const exclusions: { from: number; to: number }[] = [];
        if (showGap) {
          const estTextWidth = labelText.length * fibFontSize * 0.62;
          const gapCenterX = textX + labelWidth / 2;
          const gapHalfWidth = estTextWidth / 2 + 8;
          exclusions.push({ from: gapCenterX - gapHalfWidth, to: gapCenterX + gapHalfWidth });
        }

        // Duck the line under any candle body it passes through, instead of drawing
        // over it — only the body (open↔close), not the wicks, so the line still shows
        // through the thin wick lines above/below.
        const fullData = (window as any).__chartFullData || [];
        if (fullData.length > 0) {
          const fromLogical = pixelToLogical(chart, Math.max(0, lineStartX));
          const toLogical = pixelToLogical(chart, Math.min(stageWidth, lineEndX));
          if (fromLogical !== null && toLogical !== null) {
            const startIdx = Math.max(0, Math.floor(fromLogical) - 1);
            let endIdx = Math.min(fullData.length - 1, Math.ceil(toLogical) + 1);
            const replayCutoff = (window as any).__replayVisibleCutoff;
            if (replayCutoff !== null && replayCutoff !== undefined) {
              endIdx = Math.min(endIdx, replayCutoff); // bars past this aren't actually drawn while rewound
            }
            for (let idx = startIdx; idx <= endIdx; idx++) {
              const bar = fullData[idx];
              if (!bar) continue;
              const bodyTop = Math.max(bar.open, bar.close);
              const bodyBottom = Math.min(bar.open, bar.close);
              if (level.price <= bodyTop && level.price >= bodyBottom) {
                const cx1 = logicalToPixel(chart, idx - 0.4);
                const cx2 = logicalToPixel(chart, idx + 0.4);
                if (cx1 !== null && cx2 !== null) exclusions.push({ from: cx1, to: cx2 });
              }
            }
          }
        }

        const segments = subtractRanges(lineStartX, lineEndX, exclusions);

        return (
          <Group key={i}>
            {segments.map(([segFrom, segTo], segIdx) => (
              <Line
                key={segIdx}
                points={[segFrom, levelY, segTo, levelY]}
                stroke={level.color}
                strokeWidth={lineStrokeWidth}
                dash={lineDash}
                hitStrokeWidth={8}
              />
            ))}
            {fibShowText && labelText && (
              <KonvaText
                x={textX}
                y={textY}
                width={labelWidth}
                align={align}
                text={labelText}
                fill={level.color}
                fontSize={fibFontSize}
                fontFamily="sans-serif"
              />
            )}
          </Group>
        );
      });

  return (
    <Group
      id={id}
      draggable={(isSelected || isHovering) && !isLocked}
      onDragStart={move.start} onDragMove={move.drag} onDragEnd={handleDragEnd}
      onClick={onSelect}
      onTap={onSelect}
      listening={true}
    >
      {/* Trendline connecting the two points */}
      {showTrendLine && (
        <Line
          points={[x1, y1, x2, y2]}
          stroke={trendLineColor || "#787b86"}
          strokeWidth={trendLineWidth || 1}
          dash={trendLineStyle === 'dashed' ? [5, 5] : trendLineStyle === 'dotted' ? [2, 2] : undefined}
          hitStrokeWidth={10}
        />
      )}
      
      {!isHovering && levelEls}

      {/* Fibonacci Backgrounds */}
      {showBackground && levelsToRender.slice(0, -1).map((level, i) => {
        const nextLevel = levelsToRender[i + 1];
        const yStart = priceToPixel(series, level.price);
        const yEnd = priceToPixel(series, nextLevel.price);
        
        if (yStart === null || yEnd === null) return null;

        let lineStartX = Math.min(x1, x2);
        let lineEndX = Math.max(x1, x2);
        if (extendLeft) lineStartX = 0;
        if (extendRight) lineEndX = stageWidth;

        return (
          <Rect
            key={`bg-${i}`}
            x={lineStartX}
            y={Math.min(yStart, yEnd)}
            width={lineEndX - lineStartX}
            height={Math.abs(yEnd - yStart)}
            fill={level.color}
            opacity={backgroundOpacity}
            listening={false}
          />
        );
      })}

      {/* Levels go over the coloured bands while the fib is hovered, under them otherwise */}
      {isHovering && levelEls}

      {/* Selection handles */}
      {(isSelected || isHovering) && (
        <>
          <HandleCircle 
            x={x1} y={y1} radius={5} fill="white" stroke="#2962ff" strokeWidth={2} 
            draggable={!isLocked} 
            onDragStart={(e) => e.cancelBubble = true}
            onDragMove={handleCircleDrag(0)}
            onDragEnd={handleCircleDrag(0)}
          />
          <HandleCircle 
            x={x2} y={y2} radius={5} fill="white" stroke="#2962ff" strokeWidth={2} 
            draggable={!isLocked} 
            onDragStart={(e) => e.cancelBubble = true}
            onDragMove={handleCircleDrag(1)}
            onDragEnd={handleCircleDrag(1)}
          />
        </>
      )}
    </Group>
  );
}