import React from 'react';
import { Group, Line } from 'react-konva';
import { logicalToPixel, priceToPixel, pixelToLogical, pixelToPrice } from '../../core/coordinates';
import { useChartTick } from '../../core/useChartTick';
import { useSnap, useSnappedDrag } from '../../core/snap';
import { HandleCircle } from '../../core/Handles';
import { isDarkChart } from '../../core/lineStats';

// The shared shell for TradingView's multi-point tools (Fibonacci & Gann, patterns, Elliott
// waves, cycles, forecasting, measurers): selecting, moving the whole drawing, a handle on each
// point that snaps like placing does. Each tool only supplies how it is drawn from its points.

export type Pt = { logical: number; price: number; time?: number };
export type XY = { x: number; y: number };

export interface RenderCtx {
  p: XY[];                 // the points on screen
  pts: Pt[];               // the points in bars / price
  d: any;                  // the drawing (its style and any data it carries)
  chart: any;
  series: any;
  W: number;               // pane size
  H: number;
  x: (logical: number) => number | null;
  y: (price: number) => number | null;
  logicalAt: (x: number) => number | null;
  priceAt: (y: number) => number | null;
  prec: number;
  fmtPrice: (n: number) => string;
  selected: boolean;
  dark: boolean;
  complete: boolean;       // false while it's still being placed
  // Text tools: which of its texts the HTML editor is open on ('' = its text, 'r,c' = a table
  // cell; null = none), so it isn't drawn twice; and how to open the editor on one
  editingKey: string | null;
  editText: (key?: string) => void;
}

export interface MultiPointToolProps {
  id: string;
  drawing: any;
  points: Pt[];
  required: number;        // points the finished drawing has (Infinity for open-ended tools)
  render: (ctx: RenderCtx) => React.ReactNode;
  isSelected: boolean;
  isHovering?: boolean;
  chart: any;
  series: any;
  onSelect: () => void;
  onUpdatePoints?: (points: Pt[]) => void;
  isLocked?: boolean;
  // A tool whose handles aren't simply its points (e.g. a single-anchor indicator) can hide them
  hideHandles?: boolean;
  // Lets a tool adjust the points when one handle moves (e.g. Sector keeps its radius)
  constrain?: (points: Pt[], movedIndex: number, ctx: RenderCtx) => Pt[];
  editingKey?: string | null;
  onEditText?: (key?: string) => void;
}

export function MultiPointTool({
  id, drawing, points, required, render, isSelected, isHovering = false, chart, series,
  onSelect, onUpdatePoints, isLocked = false, hideHandles = false, constrain,
  editingKey = null, onEditText,
}: MultiPointToolProps) {
  const snap = useSnap(chart, series);
  const move = useSnappedDrag(chart, series, points, onUpdatePoints);
  useChartTick(chart, series);
  if (!chart || !series || !points.length) return null;

  const p: XY[] = [];
  for (const pt of points) {
    const x = logicalToPixel(chart, pt.logical);
    const y = priceToPixel(series, pt.price);
    if (x === null || y === null) return null;
    p.push({ x, y });
  }
  let W = 0, H = 0;
  try { const s = chart.paneSize(); W = s.width; H = s.height; } catch { /* not laid out yet */ }
  const prec: number = (window as any).__pricePrecision ?? 2;
  const ctx: RenderCtx = {
    p, pts: points, d: drawing, chart, series, W, H,
    x: (l) => logicalToPixel(chart, l), y: (pr) => priceToPixel(series, pr),
    logicalAt: (x) => pixelToLogical(chart, x), priceAt: (y) => pixelToPrice(series, y),
    prec,
    fmtPrice: (n) => n.toLocaleString('en-US', { minimumFractionDigits: prec, maximumFractionDigits: prec }),
    selected: isSelected, dark: isDarkChart(),
    // an open-ended tool (Ghost feed) draws itself from its second point on
    complete: Number.isFinite(required) ? points.length >= required : points.length >= 2,
    editingKey, editText: (key) => onEditText?.(key),
  };

  const onHandleMove = (i: number) => (e: any) => {
    e.cancelBubble = true;
    if (!onUpdatePoints) return;
    const snapped = snap(e.target.x(), e.target.y(), e.evt, e.target);
    if (!snapped) return;
    let next = points.map((pt, k) => (k === i ? snapped : pt));
    if (constrain) next = constrain(next, i, ctx);
    onUpdatePoints(next);
  };

  const flat = p.flatMap(q => [q.x, q.y]);
  return (
    <Group
      id={id}
      draggable={(isSelected || isHovering) && !isLocked}
      onDragStart={move.start} onDragMove={move.drag} onDragEnd={(e: any) => move.end(e)}
      onClick={onSelect}
      onTap={onSelect}
    >
      {ctx.complete
        ? render(ctx)
        // still being placed: the points joined up, as TradingView previews them
        : <Line points={flat} stroke={drawing.stroke || '#2962ff'} strokeWidth={2} hitStrokeWidth={10} />}
      {(isSelected || isHovering) && !hideHandles && p.map((q, i) => (
        <HandleCircle
          key={i} x={q.x} y={q.y} radius={6} fill="white" stroke="#2962ff" strokeWidth={2}
          draggable={!isLocked}
          onDragStart={(e: any) => { e.cancelBubble = true; }}
          onDragMove={onHandleMove(i)} onDragEnd={onHandleMove(i)}
        />
      ))}
    </Group>
  );
}

// ---- drawing helpers shared by the tools

// "#2962FF" / "rgba(…)" at a TradingView transparency (0 opaque … 100 clear)
export function withAlpha(color: string, transparency: number): string {
  const a = Math.max(0, Math.min(1, 1 - transparency / 100));
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const rgb = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${a})`;
  return color;
}

export const FAR = 100000;

// The far end of a ray from a through b
export function rayEnd(a: XY, b: XY): XY {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: a.x + (dx / len) * FAR, y: a.y + (dy / len) * FAR };
}

export function dashFor(style?: number | string): number[] | undefined {
  if (style === 1 || style === 'Dotted' || style === 'dotted') return [2, 3];
  if (style === 2 || style === 'Dashed' || style === 'dashed') return [6, 4];
  return undefined;
}

export type Level = { coeff: number; color: string; visible?: boolean };
