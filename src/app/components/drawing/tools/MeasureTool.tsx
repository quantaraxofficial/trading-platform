import React, { useEffect, useRef, useState } from 'react';
import { Rect, Text, Group, Arrow } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { formatVolume } from '../../../utils/volume';

interface MeasureToolProps {
  id: string;
  points: { logical: number; price: number }[];
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
}

export function MeasureTool({ id, points, chart, series }: MeasureToolProps) {
  useChartTick(chart, series);
  const textRef = useRef<any>(null);
  const [textDim, setTextDim] = useState({ width: 120, height: 50 });
  // The text's size, measured after each render (before the early return below, so every render
  // calls the same hooks); only a real change sets it
  useEffect(() => {
    const t = textRef.current;
    if (!t) return;
    const w = t.width(), h = t.height();
    if (w !== textDim.width || h !== textDim.height) setTextDim({ width: w, height: h });
  });

  if (!chart || !series || points.length < 2) return null;

  const [p1, p2] = points;
  
  const x1 = logicalToPixel(chart, p1.logical);
  const y1 = priceToPixel(series, p1.price);
  const x2 = logicalToPixel(chart, p2.logical);
  const y2 = priceToPixel(series, p2.price);

  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const maxX = Math.max(x1, x2);
  const maxY = Math.max(y1, y2);
  const absWidth = Math.abs(x2 - x1);
  const absHeight = Math.abs(y2 - y1);

  // Calculate Data values
  const priceDiff = p2.price - p1.price;
  const isPositive = priceDiff >= 0;
  
  const colorHex = isPositive ? '#2962ff' : '#f23645';
  const colorRgba = isPositive ? 'rgba(41, 98, 255, 0.2)' : 'rgba(242, 54, 69, 0.2)';

  const priceDiffPercent = (priceDiff / p1.price) * 100;
  
  // Calculate Pips / Ticks (assuming standard forex scale or just a generic multiplier)
  const ticks = priceDiff * 100; 

  const startIdx = Math.round(Math.min(p1.logical as number, p2.logical as number));
  const endIdx = Math.round(Math.max(p1.logical as number, p2.logical as number));
  const barsDiff = Math.round((p2.logical as number) - (p1.logical as number));
  const isTimeNegative = barsDiff < 0;

  let timeDiffStr = '';
  let volumeStr = '';

  const fullData = (window as any).__chartFullData;
  if (fullData && fullData.length > 0) {
    const sIdx = Math.max(0, Math.min(fullData.length - 1, startIdx));
    const eIdx = Math.max(0, Math.min(fullData.length - 1, endIdx));
    
    if (fullData[sIdx] && fullData[eIdx]) {
      const timeDiffSec = Math.abs(fullData[eIdx].time - fullData[sIdx].time);
      if (timeDiffSec >= 86400) {
        timeDiffStr = `${isTimeNegative ? '-' : ''}${Math.floor(timeDiffSec / 86400)}d`;
      } else if (timeDiffSec >= 3600) {
        timeDiffStr = `${isTimeNegative ? '-' : ''}${Math.floor(timeDiffSec / 3600)}h`;
      } else {
        timeDiffStr = `${isTimeNegative ? '-' : ''}${Math.floor(timeDiffSec / 60)}m`;
      }

      // The feed's real volume over the measured bars (none for forex/metals: "∅")
      let totalVol = 0;
      let anyVol = false;
      for (let i = Math.min(sIdx, eIdx); i <= Math.max(sIdx, eIdx); i++) {
        const v = fullData[i]?.volume;
        if (typeof v === 'number') { totalVol += v; anyVol = true; }
      }
      volumeStr = formatVolume(anyVol ? totalVol : null);
    }
  } else {
    timeDiffStr = `${barsDiff}m`; // fallback
    volumeStr = '-';
  }

  const sign = isPositive ? '+' : '';
  const line1 = `${sign}${priceDiff.toFixed(3)} (${sign}${priceDiffPercent.toFixed(2)}%) ${sign}${ticks.toFixed(1)}`;
  const line2 = `${barsDiff} bars, ${timeDiffStr}`;
  const line3 = `Vol ${volumeStr}`;

  const textContent = `${line1}\n${line2}\n${line3}`;


  const padding = 8;
  const boxWidth = textDim.width + padding * 2;
  const boxHeight = textDim.height + padding * 2;

  // Tooltip position (centered horizontally at bottom edge of bounding box)
  let tooltipX = minX + absWidth / 2;
  let tooltipY = maxY + 10; 
  
  // Keep tooltip on screen roughly (y)
  if (tooltipY + boxHeight > (chart.paneSize()?.height || 1000)) {
    tooltipY = minY - boxHeight - 10;
  }

  return (
    <Group>
      {/* Semi-transparent Background Fill */}
      <Rect
        x={minX}
        y={minY}
        width={absWidth}
        height={absHeight}
        fill={colorRgba}
        listening={false}
      />

      {/* Horizontal Arrow (Time diff) */}
      <Arrow
        points={[x1, (y1 + y2) / 2, x2, (y1 + y2) / 2]}
        stroke={colorHex}
        fill={colorHex}
        strokeWidth={1}
        pointerLength={6}
        pointerWidth={6}
        listening={false}
      />

      {/* Vertical Arrow (Price diff) */}
      <Arrow
        points={[(x1 + x2) / 2, y1, (x1 + x2) / 2, y2]}
        stroke={colorHex}
        fill={colorHex}
        strokeWidth={1}
        pointerLength={6}
        pointerWidth={6}
        listening={false}
      />

      {/* Tooltip Background */}
      <Rect
        x={tooltipX - boxWidth / 2}
        y={tooltipY}
        width={boxWidth}
        height={boxHeight}
        fill={colorHex}
        cornerRadius={4}
        listening={false}
      />

      {/* Tooltip Text */}
      <Text
        ref={textRef}
        x={tooltipX - boxWidth / 2 + padding}
        y={tooltipY + padding}
        text={textContent}
        fill="white"
        fontSize={12}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        align="center"
        lineHeight={1.4}
        listening={false}
      />
    </Group>
  );
}