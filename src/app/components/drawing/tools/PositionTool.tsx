import React, { useRef } from 'react';
import { Group, Rect, Text, Line, Circle } from 'react-konva';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../core/coordinates';
import { useChartTick } from '../core/useChartTick';
import { qtyStepOf } from '../../../trading/instruments';
import { useSnap } from '../core/snap';
import { HandleCircle, HandleRect } from '../core/Handles';

// TradingView's Long / Short position. Both zones (profit and stop) are drawn in full; the
// trade is then played out on the real bars: it opens on the first bar after the tool's start
// that trades through the entry price, and closes on the first bar that reaches the target or
// the stop (or, failing that, at the tool's right edge / the latest bar). From the entry bar to
// the exit bar, the zone the price is in gets a second layer of its colour, spanning from the
// entry to the exit price (the latest close while still open), with a dashed line from the
// entry to the exit point — exactly how TradingView shades a position as candles move through it.

export const POSITION_TARGET_FILL = 'rgba(8, 153, 129, 0.2)';
export const POSITION_STOP_FILL = 'rgba(242, 54, 69, 0.2)';

export type PositionSide = 'long' | 'short';

export interface PositionToolProps {
  id: string;
  points: { logical: number; price: number }[]; // [entry, rightBounds, target, stop]
  isSelected: boolean;
  isHovering?: boolean;
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  onSelect: () => void;
  onUpdatePoints?: (points: { logical: number; price: number }[]) => void;
  targetFillColor?: string;
  stopFillColor?: string;
  textColor?: string;
  fontSize?: number;
  showPriceLabels?: boolean;
  alwaysShowStats?: boolean;
  // Inputs (settings → Inputs), TradingView's defaults
  accountSize?: number;
  lotSize?: number;
  risk?: number;
  riskType?: string;
  qtyPrecision?: string;
}

type Bar = { time: number; open: number; high: number; low: number; close: number };

// `markPrice` is what the P&L label is measured at: the exit price once target or stop is hit,
// otherwise the latest close inside the tool. TradingView shows that "Open PnL" even before
// price has reached the entry (the shading only appears once it has).
export type PositionTrade =
  | { status: 'waiting'; markPrice: number | null }
  | { status: 'open'; entryIdx: number; exitIdx: number; exitPrice: number; markPrice: number }
  | { status: 'closed'; entryIdx: number; exitIdx: number; exitPrice: number; markPrice: number; reason: 'target' | 'stop' };

// Plays the position out on the bars from `startIdx` to `endIdx` (only those already printed)
export function simulatePosition(
  bars: Bar[], side: PositionSide, entry: number, target: number, stop: number,
  startIdx: number, endIdx: number, lastIdx: number,
): PositionTrade {
  const scanEnd = Math.min(endIdx, lastIdx, bars.length - 1);
  const markPrice = scanEnd >= Math.max(0, startIdx) && bars[scanEnd] ? bars[scanEnd].close : null;
  let entryIdx = -1;
  for (let i = Math.max(0, startIdx); i <= scanEnd; i++) {
    const b = bars[i];
    if (b && b.low <= entry && b.high >= entry) { entryIdx = i; break; }
  }
  if (entryIdx < 0) return { status: 'waiting', markPrice };
  for (let j = entryIdx; j <= scanEnd; j++) {
    const b = bars[j];
    if (!b) continue;
    const hitStop = side === 'long' ? b.low <= stop : b.high >= stop;
    const hitTarget = side === 'long' ? b.high >= target : b.low <= target;
    // A bar spanning both can't tell which came first; count it as stopped out (the cautious read)
    if (hitStop) return { status: 'closed', entryIdx, exitIdx: j, exitPrice: stop, markPrice: stop, reason: 'stop' };
    if (hitTarget) return { status: 'closed', entryIdx, exitIdx: j, exitPrice: target, markPrice: target, reason: 'target' };
  }
  // Neither level reached (even if the tool's end has passed): still open, marked to its last bar
  return { status: 'open', entryIdx, exitIdx: scanEnd, exitPrice: bars[scanEnd].close, markPrice: bars[scanEnd].close };
}

const group3 = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtFixed = (n: number, decimals: number) => {
  const [int, frac] = Math.abs(n).toFixed(decimals).split('.');
  return `${n < 0 ? '−' : ''}${group3(int)}${frac ? `.${frac}` : ''}`;
};
// Whole numbers without decimals, others to two ("1", "2.35")
const fmtAmount = (n: number) => fmtFixed(n, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);

export function PositionTool({
  side, id, points, isSelected, isHovering = false, chart, series, onSelect, onUpdatePoints,
  targetFillColor = POSITION_TARGET_FILL,
  stopFillColor = POSITION_STOP_FILL,
  textColor = "#ffffff",
  fontSize = 11,
  showPriceLabels = true,
  alwaysShowStats = false,
  accountSize = 1000,
  lotSize = 1,
  risk = 25,
  riskType = '%',
  qtyPrecision = 'Default',
}: PositionToolProps & { side: PositionSide }) {
  const snap = useSnap(chart, series);
  useChartTick(chart, series);
  // Points when a whole-tool drag began (the drag is applied to these, in whole bars)
  const dragStartRef = useRef<{ logical: number; price: number }[] | null>(null);
  if (!chart || !series || points.length < 4) return null;

  // Positions drawn before the colours matched TradingView's kept the old defaults; show those
  // with TradingView's (a colour the user picked is left alone)
  if (targetFillColor === 'rgba(76, 175, 80, 0.4)') targetFillColor = POSITION_TARGET_FILL;
  if (stopFillColor === 'rgba(244, 67, 54, 0.4)') stopFillColor = POSITION_STOP_FILL;

  const [entryPoint, rightPoint, targetPoint, stopPoint] = points;
  const entryX = logicalToPixel(chart, entryPoint.logical);
  const entryY = priceToPixel(series, entryPoint.price);
  const targetY = priceToPixel(series, targetPoint.price);
  const stopY = priceToPixel(series, stopPoint.price);
  const rightX = logicalToPixel(chart, rightPoint.logical);
  if (entryX === null || entryY === null || targetY === null || stopY === null || rightX === null) return null;

  const leftX = entryX;
  const rectWidth = rightX - leftX;
  const rectCenterX = (leftX + rightX) / 2;
  const entry = entryPoint.price, target = targetPoint.price, stop = stopPoint.price;
  const isLong = side === 'long';

  // --- The numbers, from the tool's own inputs
  const precision: number = (window as any).__pricePrecision ?? 2;
  const symbol: string = (window as any).__chartSymbol || '';
  const targetDist = Math.abs(target - entry);
  const stopDist = Math.abs(entry - stop);
  const rr = stopDist > 0 ? targetDist / stopDist : 0;
  const riskAmount = riskType === '%' ? accountSize * risk / 100 : risk;
  const qtyStep = qtyPrecision === 'Default' ? qtyStepOf(symbol) : Math.pow(10, -Number(qtyPrecision));
  const rawQty = stopDist > 0 && lotSize > 0 ? riskAmount / (stopDist * lotSize) : 0;
  const qty = Math.floor(rawQty / qtyStep + 1e-9) * qtyStep;
  const qtyDecimals = qtyStep < 1 ? Math.round(-Math.log10(qtyStep)) : 0;
  const stopAmount = accountSize - riskAmount;
  const targetAmount = accountSize + riskAmount * rr;
  // Ticks, or pips on fractional-pip quotes (3+ decimals), as TradingView counts them
  const pip = precision >= 3 ? Math.pow(10, -(precision - 1)) : Math.pow(10, -precision);
  const ticksText = (d: number) => fmtFixed(d / pip, precision >= 3 ? 1 : 0);
  const pct = (d: number) => (entry ? (d / entry) * 100 : 0).toFixed(3);

  // --- Play the trade out on the bars
  const bars: Bar[] = (window as any).__chartFullData || [];
  const replayCutoff = (window as any).__replayVisibleCutoff;
  const lastIdx = replayCutoff !== null && replayCutoff !== undefined ? replayCutoff : bars.length - 1;
  const trade = simulatePosition(
    bars, side, entry, target, stop,
    Math.round(Math.min(entryPoint.logical, rightPoint.logical)), Math.round(Math.max(entryPoint.logical, rightPoint.logical)), lastIdx,
  );
  const pnl = trade.markPrice === null ? 0 : (isLong ? trade.markPrice - entry : entry - trade.markPrice);

  const showUI = isSelected || isHovering;

  // Moving the whole tool: like TradingView it follows the pointer in whole bars and re-plays the
  // trade as it goes, so the shading updates live. The group is put back at 0 on every move,
  // since the new points already carry the offset.
  const isWholeToolDrag = (e: any) => e.target === e.currentTarget;
  const handleDragStart = (e: any) => {
    if (!isWholeToolDrag(e)) return;
    dragStartRef.current = points.map(p => ({ logical: p.logical, price: p.price }));
  };
  const handleDragMove = (e: any) => {
    if (!isWholeToolDrag(e) || !onUpdatePoints) return;
    const start = dragStartRef.current;
    const node = e.target;
    const dx = node.x(), dy = node.y();
    node.position({ x: 0, y: 0 });
    if (!start) return;
    const ox = logicalToPixel(chart, start[0].logical);
    const oy = priceToPixel(series, start[0].price);
    if (ox === null || oy === null) return;
    // The entry point snaps (candle, and magnet) and the rest of the tool follows it
    const s = snap(ox + dx, oy + dy, e.evt);
    if (!s) return;
    const dLogical = Math.round(s.logical - start[0].logical);
    const dPrice = s.price - start[0].price;
    onUpdatePoints(start.map(p => ({ logical: p.logical + dLogical, price: p.price + dPrice })));
  };
  const handleDragEnd = (e: any) => {
    if (!isWholeToolDrag(e)) return;
    e.target.position({ x: 0, y: 0 });
    dragStartRef.current = null;
  };

  // Handles (TradingView's four): the entry circle moves the start bar and the entry price
  // (target and stop keep their prices); the right square moves the end; the target and stop
  // squares move their own price, never past the entry
  const handleHandleDrag = (index: number) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const snapped = snap(pos.x, pos.y, e.evt);
    if (!snapped) return;
    const logical = Math.round(snapped.logical);
    const price = snapped.price;
    const [e0, r0, t0, s0] = points;
    const minGap = Math.pow(10, -((window as any).__pricePrecision ?? 2));
    let next = points;
    if (index === 0) {
      const startL = Math.min(logical, r0.logical - 1);
      // The entry (breakeven) line stays inside its zones, a tick short of the stop and the
      // target, as on TradingView; TP and SL keep their prices
      const lo = Math.min(t0.price, s0.price) + minGap;
      const hi = Math.max(t0.price, s0.price) - minGap;
      const entry = lo <= hi ? Math.min(hi, Math.max(lo, price)) : (t0.price + s0.price) / 2;
      next = [{ logical: startL, price: entry }, { logical: r0.logical, price: entry }, { logical: startL, price: t0.price }, { logical: startL, price: s0.price }];
    } else if (index === 1) {
      next = [e0, { logical: Math.max(logical, e0.logical + 1), price: e0.price }, t0, s0];
    } else if (index === 2) {
      const p = isLong ? Math.max(price, e0.price + minGap) : Math.min(price, e0.price - minGap);
      next = [e0, r0, { logical: t0.logical, price: p }, s0];
    } else if (index === 3) {
      const p = isLong ? Math.min(price, e0.price - minGap) : Math.max(price, e0.price + minGap);
      next = [e0, r0, t0, { logical: s0.logical, price: p }];
    }
    onUpdatePoints(next);
  };

  // --- Labels (TradingView's wording)
  const targetLabelText = `Target: ${fmtFixed(targetDist, precision)} (${pct(targetDist)}%) ${ticksText(targetDist)}, Amount: ${fmtAmount(targetAmount)}`;
  const stopLabelText = `Stop: ${fmtFixed(stopDist, precision)} (${pct(stopDist)}%) ${ticksText(stopDist)}, Amount: ${fmtAmount(stopAmount)}`;
  const infoLine1 = `${trade.status === 'closed' ? 'Closed' : 'Open'} PnL: ${fmtFixed(pnl, precision)}, Qty: ${fmtFixed(qty, qtyDecimals)}`;
  const infoLine2 = `Risk/reward ratio: ${parseFloat(rr.toFixed(2))}`;

  const charWidth = fontSize * 0.6;
  const targetLabelWidth = Math.max(targetLabelText.length * charWidth + 20, 160);
  const stopLabelWidth = Math.max(stopLabelText.length * charWidth + 20, 160);
  const labelHeight = fontSize + 12;
  const infoWidth = Math.max(infoLine1.length * charWidth + 20, infoLine2.length * charWidth + 20, 170);
  const infoHeight = 32;
  const targetBadgeColor = '#089981';
  const stopBadgeColor = '#f23645';

  // Outer edges of the two zones (where their labels sit) and the info box, on the target side
  const targetOuter = isLong ? Math.min(targetY, entryY) : Math.max(targetY, entryY);
  const stopOuter = isLong ? Math.max(stopY, entryY) : Math.min(stopY, entryY);
  const targetLabelY = isLong ? targetOuter - labelHeight - 4 : targetOuter + 4;
  const stopLabelY = isLong ? stopOuter + 4 : stopOuter - labelHeight - 4;
  const infoY = isLong ? entryY - infoHeight - 6 : entryY + 6;

  // --- The played-out part: a second layer of the zone's colour from entry to exit
  let played: React.ReactNode = null;
  if (trade.status !== 'waiting') {
    const x1 = logicalToPixel(chart, trade.entryIdx);
    const x2 = logicalToPixel(chart, trade.exitIdx);
    const exitY = priceToPixel(series, trade.exitPrice);
    if (x1 !== null && x2 !== null && exitY !== null) {
      const clampX = (x: number) => Math.max(Math.min(leftX, rightX), Math.min(Math.max(leftX, rightX), x));
      const ax = clampX(x1), bx = clampX(x2);
      const favourable = isLong ? trade.exitPrice >= entry : trade.exitPrice <= entry;
      played = (
        <>
          {bx > ax && Math.abs(exitY - entryY) > 0 && (
            <Rect x={ax} y={Math.min(entryY, exitY)} width={bx - ax} height={Math.abs(exitY - entryY)}
              fill={favourable ? targetFillColor : stopFillColor} listening={false} />
          )}
          <Line points={[ax, entryY, bx, exitY]} stroke="#787b86" strokeWidth={1} dash={[4, 4]} listening={false} />
        </>
      );
    }
  }

  const badge = (x: number, y: number, w: number, fill: string, lines: string[], h: number) => (
    <>
      <Rect x={x} y={y} width={w} height={h} fill={fill} cornerRadius={4} listening={false} />
      {lines.map((t, i) => (
        <Text key={i} x={x} y={y + (lines.length === 1 ? (h - fontSize) / 2 : 3 + i * (fontSize + 3))} width={w} text={t}
          fontSize={fontSize} fill={textColor} fontFamily="Arial" align="center" listening={false} />
      ))}
    </>
  );

  return (
    <Group id={id} draggable={isSelected || isHovering} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onClick={onSelect} onTap={onSelect}>
      {/* The two zones, in full */}
      <Rect x={leftX} y={Math.min(targetY, entryY)} width={rectWidth} height={Math.abs(targetY - entryY)} fill={targetFillColor} />
      <Rect x={leftX} y={Math.min(stopY, entryY)} width={rectWidth} height={Math.abs(stopY - entryY)} fill={stopFillColor} />

      {played}

      {/* Entry line */}
      <Line
        points={showUI ? [leftX - 15, entryY, rightX + 15, entryY] : [leftX, entryY, rightX, entryY]}
        stroke="#787b86" strokeWidth={1} dash={showUI ? [6, 3] : undefined} listening={false}
      />

      {showPriceLabels && showUI && badge(rectCenterX - targetLabelWidth / 2, targetLabelY, targetLabelWidth, targetBadgeColor, [targetLabelText], labelHeight)}
      {showPriceLabels && showUI && badge(rectCenterX - stopLabelWidth / 2, stopLabelY, stopLabelWidth, stopBadgeColor, [stopLabelText], labelHeight)}
      {(alwaysShowStats || showUI) && badge(rectCenterX - infoWidth / 2, infoY, infoWidth, pnl >= 0 ? targetBadgeColor : stopBadgeColor, [infoLine1, infoLine2], infoHeight)}

      {/* Handles: TradingView's four */}
      {showUI && (
        <>
          <HandleCircle x={leftX} y={entryY} radius={5} fill="white" stroke="#2962ff" strokeWidth={2} draggable
            onDragMove={handleHandleDrag(0)} />
          <HandleRect cursor="ew-resize" x={rightX} y={entryY} width={9} height={9} offsetX={4.5} offsetY={4.5} cornerRadius={2} fill="white" stroke="#2962ff" strokeWidth={2} draggable
            onDragMove={handleHandleDrag(1)} />
          <HandleRect cursor="ns-resize" x={leftX} y={targetY} width={9} height={9} offsetX={4.5} offsetY={4.5} cornerRadius={2} fill="white" stroke="#2962ff" strokeWidth={2} draggable
            onDragMove={handleHandleDrag(2)} />
          <HandleRect cursor="ns-resize" x={leftX} y={stopY} width={9} height={9} offsetX={4.5} offsetY={4.5} cornerRadius={2} fill="white" stroke="#2962ff" strokeWidth={2} draggable
            onDragMove={handleHandleDrag(3)} />
        </>
      )}
    </Group>
  );
}
