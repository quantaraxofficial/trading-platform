import React, { useEffect, useState } from 'react';
import { Group, Rect, Text, Line, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';

interface LongPositionToolProps {
  id: string;
  points: { logical: number; price: number }[]; // [entry, rightBounds, target, stop]
  isSelected: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  targetFillColor?: string;
  stopFillColor?: string;
  textColor?: string;
  fontSize?: number;
  showPriceLabels?: boolean;
  statsMode?: string;
  compactStatsMode?: boolean;
  alwaysShowStats?: boolean;
  quantity?: number;
  openPnL?: number;
}

// Format number with comma separators
const fmtNum = (n: number, decimals = 1) => {
  const fixed = n.toFixed(decimals);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
};

export function LongPositionTool({
  id, points, isSelected, chart, series, onSelect, onUpdatePoints,
  targetFillColor = "rgba(76, 175, 80, 0.3)",
  stopFillColor = "rgba(244, 67, 54, 0.3)",
  textColor = "#ffffff",
  fontSize = 11,
  showPriceLabels = true,
  statsMode = 'TP price offset, ...',
  compactStatsMode = false,
  alwaysShowStats = false,
  quantity = 57,
  openPnL = 4.660
}: LongPositionToolProps) {
  useChartTick(chart);
  const [isHovered, setIsHovered] = useState(false);
  if (!chart || !series || points.length < 4) return null;

  const entryPoint = points[0];
  const rightPoint = points[1];
  const targetPoint = points[2];
  const stopPoint = points[3];

  const entryX = logicalToPixel(chart, entryPoint.logical);
  const entryY = priceToPixel(series, entryPoint.price);
  const targetY = priceToPixel(series, targetPoint.price);
  const stopY = priceToPixel(series, stopPoint.price);
  const rightX = logicalToPixel(chart, rightPoint.logical);

  if (entryX === null || entryY === null || targetY === null || stopY === null || rightX === null) return null;

  const leftX = entryX;
  const rectWidth = rightX - leftX;
  const rectCenterX = (leftX + rightX) / 2;
  const rectHeight = Math.abs(targetY - entryY);
  const stopRectHeight = Math.abs(entryY - stopY);

  const entryPrice = entryPoint.price;
  const targetPrice = targetPoint.price;
  const stopPrice = stopPoint.price;

  const targetPercentage = ((targetPrice - entryPrice) / entryPrice) * 100;
  const stopPercentage = ((entryPrice - stopPrice) / entryPrice) * 100;
  const targetPoints = targetPrice - entryPrice;
  const stopPoints = entryPrice - stopPrice;
  
  const contractSize = 10;
  const targetAmount = Math.abs(targetPoints * quantity * contractSize);
  const stopAmount = Math.abs(stopPoints * quantity * contractSize);
  
  const targetDistance = Math.abs(targetPrice - entryPrice);
  const stopDistance = Math.abs(entryPrice - stopPrice);
  const riskRewardRatio = stopDistance > 0 ? targetDistance / stopDistance : 0;

  const showUI = isSelected || isHovered;

  const handleDragEnd = (e: any) => {
    if (!onUpdatePoints) return;
    const node = e.target;
    if (node.className === 'Group') {
      const dx = node.x();
      const dy = node.y();
      const newPoints = points.map(p => {
        const px = logicalToPixel(chart, p.logical)! + dx;
        const py = priceToPixel(series, p.price)! + dy;
        return { logical: pixelToLogical(chart, px)!, price: pixelToPrice(series, py)! };
      });
      onUpdatePoints(newPoints);
      node.position({ x: 0, y: 0 });
    }
  };

  const handleHandleDrag = (index: number) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    
    const logical = pixelToLogical(chart, e.target.x());
    const price = pixelToPrice(series, e.target.y());
    if (logical === null || price === null) return;

    const newPoints = [...points];

    if (index === 0) {
      newPoints[0] = { logical, price };
      newPoints[2] = { logical, price: newPoints[2].price };
      newPoints[3] = { logical, price: newPoints[3].price };
    } else if (index === 1) {
      newPoints[1] = { logical, price: newPoints[1].price };
    } else if (index === 2) {
      newPoints[2] = { logical: newPoints[2].logical, price };
    } else if (index === 3) {
      newPoints[3] = { logical: newPoints[3].logical, price };
    }

    onUpdatePoints(newPoints);
  };

  // Label text
  const targetLabelText = `Target: ${targetPrice.toFixed(3)} (${targetPercentage.toFixed(3)}%) ${fmtNum(targetPoints)}, Amount: ${fmtNum(targetAmount, 0)}`;
  const stopLabelText = `Stop: ${stopPrice.toFixed(3)} (${stopPercentage.toFixed(3)}%) ${fmtNum(stopPoints)}, Amount: ${fmtNum(stopAmount, 0)}`;
  
  // Estimate label widths (approx 6.5px per char at fontSize 11)
  const charWidth = fontSize * 0.6;
  const targetLabelWidth = Math.max(targetLabelText.length * charWidth + 20, 160);
  const stopLabelWidth = Math.max(stopLabelText.length * charWidth + 20, 160);
  const labelHeight = fontSize + 12;

  // Colors
  const targetBadgeColor = '#089981'; // TradingView teal green
  const stopBadgeColor = '#f23645';   // TradingView red
  const infoBadgeColor = '#089981';

  // Info box
  const infoLine1 = `Open PnL: ${fmtNum(openPnL, 3)}, Qty: ${quantity}`;
  const infoLine2 = `Risk/reward ratio: ${riskRewardRatio.toFixed(1)}`;
  const infoWidth = Math.max(infoLine1.length * charWidth + 20, infoLine2.length * charWidth + 20, 170);
  const infoHeight = 32;

  // Top of the green zone and bottom of the red zone
  const greenTop = Math.min(targetY, entryY);
  const redBottom = Math.max(entryY, stopY);

  return (
    <Group id={id} draggable={isSelected} onDragEnd={handleDragEnd} onClick={onSelect} onTap={onSelect}
      onMouseEnter={() => { document.body.style.cursor = 'pointer'; setIsHovered(true); }}
      onMouseLeave={() => { document.body.style.cursor = 'default'; setIsHovered(false); }}>

      {/* Target Rectangle (Green) — no border stroke, just fill */}
      <Rect x={leftX} y={greenTop} width={rectWidth} height={rectHeight}
        fill={targetFillColor} />

      {/* Stop Rectangle (Red) — no border stroke, just fill */}
      <Rect x={leftX} y={Math.min(entryY, stopY)} width={rectWidth} height={stopRectHeight}
        fill={stopFillColor} />

      {/* Entry Line — dashed, extends slightly beyond */}
      <Line
        points={showUI ? [leftX - 15, entryY, rightX + 15, entryY] : [leftX, entryY, rightX, entryY]}
        stroke="#787b86"
        strokeWidth={1}
        dash={showUI ? [6, 3] : undefined}
        listening={false}
      />

      {/* Target Label — pill badge centered above the green zone */}
      {(showPriceLabels && showUI) && (
        <>
          <Rect
            x={rectCenterX - targetLabelWidth / 2}
            y={greenTop - labelHeight - 4}
            width={targetLabelWidth}
            height={labelHeight}
            fill={targetBadgeColor}
            cornerRadius={4}
            listening={false}
          />
          <Text
            x={rectCenterX - targetLabelWidth / 2}
            y={greenTop - labelHeight - 4 + (labelHeight - fontSize) / 2}
            width={targetLabelWidth}
            text={targetLabelText}
            fontSize={fontSize}
            fill={textColor}
            fontFamily="Arial"
            align="center"
            listening={false}
          />
        </>
      )}

      {/* Stop Label — pill badge centered below the red zone */}
      {(showPriceLabels && showUI) && (
        <>
          <Rect
            x={rectCenterX - stopLabelWidth / 2}
            y={redBottom + 4}
            width={stopLabelWidth}
            height={labelHeight}
            fill={stopBadgeColor}
            cornerRadius={4}
            listening={false}
          />
          <Text
            x={rectCenterX - stopLabelWidth / 2}
            y={redBottom + 4 + (labelHeight - fontSize) / 2}
            width={stopLabelWidth}
            text={stopLabelText}
            fontSize={fontSize}
            fill={textColor}
            fontFamily="Arial"
            align="center"
            listening={false}
          />
        </>
      )}

      {/* Info Box — centered on entry line */}
      {((alwaysShowStats || isSelected) && showUI) && (
        <>
          <Rect
            x={rectCenterX - infoWidth / 2}
            y={entryY - infoHeight / 2}
            width={infoWidth}
            height={infoHeight}
            fill={openPnL >= 0 ? infoBadgeColor : stopBadgeColor}
            cornerRadius={4}
            listening={false}
          />
          <Text
            x={rectCenterX - infoWidth / 2}
            y={entryY - infoHeight / 2 + 3}
            width={infoWidth}
            text={infoLine1}
            fontSize={fontSize}
            fill={textColor}
            fontFamily="Arial"
            align="center"
            listening={false}
          />
          <Text
            x={rectCenterX - infoWidth / 2}
            y={entryY - infoHeight / 2 + 3 + fontSize + 3}
            width={infoWidth}
            text={infoLine2}
            fontSize={fontSize}
            fill={textColor}
            fontFamily="Arial"
            align="center"
            listening={false}
          />
        </>
      )}

      {/* Handles */}
      {isSelected && (
        <>
          {/* Left entry — circle handle (freely draggable: x moves the entry bar, y adjusts entry price) */}
          <Circle x={leftX} y={entryY} radius={5} fill="white" stroke="#2962ff" strokeWidth={2} draggable
            onDragMove={handleHandleDrag(0)} />
          {/* Right entry — square handle */}
          <Rect x={rightX} y={entryY} width={8} height={8} offsetX={4} offsetY={4} cornerRadius={1} fill="white" stroke="#2962ff" strokeWidth={2} draggable
            dragBoundFunc={function(this: any, pos: any) { return { x: pos.x, y: this.getAbsolutePosition().y }; }}
            onDragMove={handleHandleDrag(1)} />
          {/* Target top-left — square handle */}
          <Rect x={leftX} y={targetY} width={8} height={8} offsetX={4} offsetY={4} cornerRadius={1} fill="white" stroke="#2962ff" strokeWidth={2} draggable
            dragBoundFunc={function(this: any, pos: any) { return { x: this.getAbsolutePosition().x, y: pos.y }; }}
            onDragMove={handleHandleDrag(2)} />
          {/* Target top-right — square handle */}
          <Rect x={rightX} y={targetY} width={8} height={8} offsetX={4} offsetY={4} cornerRadius={1} fill="white" stroke="#2962ff" strokeWidth={2} listening={false} />
          {/* Stop bottom-left — square handle */}
          <Rect x={leftX} y={stopY} width={8} height={8} offsetX={4} offsetY={4} cornerRadius={1} fill="white" stroke="#2962ff" strokeWidth={2} draggable
            dragBoundFunc={function(this: any, pos: any) { return { x: this.getAbsolutePosition().x, y: pos.y }; }}
            onDragMove={handleHandleDrag(3)} />
          {/* Stop bottom-right — square handle */}
          <Rect x={rightX} y={stopY} width={8} height={8} offsetX={4} offsetY={4} cornerRadius={1} fill="white" stroke="#2962ff" strokeWidth={2} listening={false} />
        </>
      )}
    </Group>
  );
}