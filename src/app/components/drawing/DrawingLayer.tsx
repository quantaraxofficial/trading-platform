"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { applyChartWheel } from '../../lib/chartWheel';
import { Stage, Layer, Group, Rect as KonvaRect } from 'react-konva';
import Konva from 'konva';
import { useDrawing } from './core/DrawingContext';
import { pixelToLogical, pixelToPrice, logicalToPixel, priceToPixel } from './core/coordinates';
import { snapToChart, effectiveMagnet } from './core/snap';
import { afterChartFrame } from './core/chartFrame';
import { chartModeCursor } from '../chartCursor';
import { isIconId } from '../ui/emojiArt';
import { TrendLine } from './tools/TrendLine';
import { RectangleTool } from './tools/Rectangle';
import { InfiniteLineTool } from './tools/InfiniteLineTool';
import { MultiPointTool } from './tools/advanced/MultiPointTool';
import { ADVANCED_TOOLS } from './tools/advanced/registry';
import { TextTool } from './tools/Text';
import { FibonacciTool } from './tools/Fibonacci';
import { DEFAULT_FIB_LEVELS } from './ui/FibonacciSettingsModal';
import { BrushTool } from './tools/BrushTool';
import { MeasureTool } from './tools/MeasureTool';
import { RotatedRectangleTool } from './tools/RotatedRectangleTool';
import { PathTool } from './tools/PathTool';
import { PolylineTool } from './tools/PolylineTool';
import { CircleTool } from './tools/CircleTool';
import { HorizontalRayTool } from './tools/HorizontalRayTool';
import { EllipseTool } from './tools/EllipseTool';
import { TriangleTool } from './tools/TriangleTool';
import { ArcTool } from './tools/ArcTool';
import { CurveTool } from './tools/CurveTool';
import { DoubleCurveTool } from './tools/DoubleCurveTool';
import { HighlighterTool } from './tools/HighlighterTool';
import { ArrowMarkerTool } from './tools/ArrowMarkerTool';
import { ArrowTool } from './tools/ArrowTool';
import { ArrowIconTool } from './tools/ArrowIconTool';
import { LongPositionTool, ShortPositionTool } from './tools';
import AxisHighlights from './AxisHighlights';
import { POSITION_TARGET_FILL, POSITION_STOP_FILL } from './tools/PositionTool';
import { EmojiTool } from './tools/EmojiTool';
import { TextEditorOverlay } from './ui/TextEditorOverlay';
import { LinkPromptDialog } from './ui/LinkPromptDialog';
import { isTypingTarget } from '../../lib/isTypingTarget';

interface DrawingLayerProps {
  chart: any;
  series: any;
  width: number;
  height: number;
  theme?: string;
}

// Shapes whose selected label spot takes typing (an I-beam there on TradingView)
// Two-point lines drawn by the TrendLine component (TradingView's Lines group)
const TREND_LINE_TYPES = ['trendline', 'ray', 'info_line', 'extended_line', 'trend_angle'];
// Those that take a text label along the line (Trend angle has none)
const TEXT_LINE_TYPES = ['trendline', 'ray', 'info_line', 'extended_line'];
const TEXT_SPOT_TYPES = [...TEXT_LINE_TYPES, 'rectangle', 'circle', 'ellipse'];

// TradingView's cursor over a part of a drawing: a handle shows its own resize arrows if it
// has them (`cursor` attr) or else the plain arrow; the label spot of a selected shape the
// I-beam; anything else on the shape (line, border, fill) the pointing hand.
function shapePartCursor(node: any, drawing: { id: string; type: string } | undefined, selected: boolean): string {
  for (let n = node; n && n.getType?.() !== 'Stage'; n = n.getParent?.()) {
    const c = n.getAttr?.('cursor');
    if (c) return c;
    if (n.getAttr?.('tvHandle')) return 'default';
    if (drawing && n.id?.() === drawing.id) break;
  }
  if (selected && node?.className === 'Text' && drawing && TEXT_SPOT_TYPES.includes(drawing.type)) return 'text';
  return 'pointer';
}

// lightweight-charts' own candle body width, in device pixels (optimalCandlestickWidth)
function optimalCandlestickWidth(barSpacing: number, pixelRatio: number): number {
  if (barSpacing >= 2.5 && barSpacing <= 4) return Math.floor(3 * pixelRatio);
  const coeff = 1 - 0.2 * Math.atan(Math.max(4, barSpacing) - 4) / (Math.PI * 0.5);
  const res = Math.floor(barSpacing * coeff * pixelRatio);
  const scaled = Math.floor(barSpacing * pixelRatio);
  return Math.max(Math.floor(pixelRatio), Math.min(res, scaled));
}

export default function DrawingLayer({ chart, series, width, height, theme = 'light' }: DrawingLayerProps) {
  const { activeTool, setActiveTool, drawings, setDrawings, addDrawing, selectedShapeId, setSelectedShapeId, updateDrawing, deleteDrawing, activeEmoji, selectedShapeIds, setSelectedShapeIds, clearSelection, magnetMode, defaultSettings, keepDrawing, allDrawingsHidden } = useDrawing();
  // Once a drawing is finished the tool goes back to the cursor, unless "Keep drawing" is on
  const finishActiveTool = () => { if (!keepDrawing) setActiveTool(null); };
  // Clicking a drawing selects it — or, with the Eraser active, removes it. (The chart-level
  // click handler below can't do this on its own: a hovered drawing makes this layer capture
  // the click, so it never reaches the chart.)
  const selectDrawing = (id: string) => {
    if (activeTool === 'eraser') { deleteDrawing(id); return; }
    setSelectedShapeId(id);
  };
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  // The drawing being worked on (selected or hovered). As on TradingView, it's drawn on top of
  // the candles, so the candle cut-out below leaves its area alone.
  const activeDrawingIdsRef = useRef<string[]>([]);

  // Drawings sit on a canvas ABOVE the chart, so by default they paint over candle
  // bodies. The rule here is that shapes may cross a candle's thin wick but never its
  // body, so after Konva paints the layer, every visible candle body rectangle is
  // punched out of it (destination-out) — the real candle underneath then shows
  // through, which reads as the shape passing behind it. Selection handles are
  // redrawn afterwards so they stay grabbable even when they sit on a body.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !chart || !series) return;

    const isHandle = (n: any) => {
      const a = n.attrs;
      return a && a.fill === 'white' && a.stroke === '#2962ff' && (n.className === 'Circle' || n.className === 'Rect');
    };

    const cutCandleBodies = () => {
      const fullData: any[] = (window as any).__chartFullData || [];
      if (fullData.length === 0) return;
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const opts: any = series.options();
      const cutoff = (window as any).__replayVisibleCutoff;

      const barSpacing = Math.abs((ts.logicalToCoordinate(1) ?? 0) - (ts.logicalToCoordinate(0) ?? 0)) || 6;
      const start = Math.max(0, Math.floor(range.from) - 1);
      let end = Math.min(fullData.length - 1, Math.ceil(range.to) + 1);
      if (cutoff !== null && cutoff !== undefined) end = Math.min(end, cutoff);

      const ctx: CanvasRenderingContext2D = layer.getContext()._context;
      ctx.save();
      // Keep the selected / hovered drawing whole (it sits above the candles, like TradingView's).
      // Its box is left out of the cut; overlapping boxes are merged first, since the even-odd
      // clip would otherwise flip back the parts where two of them overlap.
      const boxes: { x: number; y: number; width: number; height: number }[] = Array.from(new Set(activeDrawingIdsRef.current))
        .map(id => layer.findOne('#' + id))
        .filter(Boolean)
        .map((n: any) => { const b = n.getClientRect({ skipShadow: true }); return { x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4 }; });
      for (let merged = true; merged;) {
        merged = false;
        for (let i = 0; i < boxes.length && !merged; i++) {
          for (let j = i + 1; j < boxes.length && !merged; j++) {
            const a = boxes[i], b = boxes[j];
            if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
              const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
              boxes[i] = { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
              boxes.splice(j, 1);
              merged = true;
            }
          }
        }
      }
      if (boxes.length) {
        ctx.beginPath();
        ctx.rect(0, 0, layer.width(), layer.height());
        boxes.forEach(b => ctx.rect(b.x, b.y, b.width, b.height));
        ctx.clip('evenodd');
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      // Cut exactly the pixels the chart paints for each body: lightweight-charts draws them in
      // device pixels (its candlestick renderer), so the holes are computed the same way there —
      // anything rounder in CSS pixels leaves a rim of chart background around the candles.
      // The clip above is already set, so switching to device pixels here doesn't move it.
      const kpr = layer.getCanvas().getPixelRatio();
      const paneCanvas: HTMLCanvasElement | null = chart.chartElement?.()?.querySelector('td canvas') ?? null;
      const hpr = paneCanvas && paneCanvas.clientWidth ? paneCanvas.width / paneCanvas.clientWidth : kpr;
      const vpr = paneCanvas && paneCanvas.clientHeight ? paneCanvas.height / paneCanvas.clientHeight : kpr;
      const sx = kpr / hpr, sy = kpr / vpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      let barWidth = optimalCandlestickWidth(barSpacing, hpr);
      if (barWidth >= 2 && (Math.floor(hpr) % 2) !== (barWidth % 2)) barWidth--;
      const borderVisible = opts.borderVisible !== false;
      let borderWidth = Math.floor(hpr);
      if (barWidth <= 2 * borderWidth) borderWidth = Math.floor((barWidth - 1) * 0.5);
      borderWidth = Math.max(Math.floor(hpr), borderWidth);
      if (barWidth <= borderWidth * 2) borderWidth = Math.max(Math.floor(hpr), Math.floor(hpr));
      const cut = (l: number, t: number, w: number, h: number) => { if (w > 0 && h > 0) ctx.fillRect(l * sx, t * sy, w * sx, h * sy); };
      let prevEdge: number | null = null;
      for (let i = start; i <= end; i++) {
        const bar = fullData[i];
        if (!bar) { prevEdge = null; continue; }
        // A hidden body (transparent color in candle settings) has nothing to reveal
        const bodyColor = bar.close >= bar.open ? opts.upColor : opts.downColor;
        const cx = ts.logicalToCoordinate(i);
        const yTop = series.priceToCoordinate(Math.max(bar.open, bar.close));
        const yBottom = series.priceToCoordinate(Math.min(bar.open, bar.close));
        if (cx === null || yTop === null || yBottom === null) { prevEdge = null; continue; }
        const top = Math.round(yTop * vpr);
        const bottom = Math.round(yBottom * vpr);
        const left = Math.round(cx * hpr) - Math.floor(barWidth * 0.5);
        const right = left + barWidth - 1;
        if (borderVisible) {
          // The border box (its left edge nudged clear of the previous candle, as the chart does)
          const bl = prevEdge !== null ? Math.min(Math.max(prevEdge + 1, left), right) : left;
          const borderColor = bar.close >= bar.open ? opts.borderUpColor : opts.borderDownColor;
          if (bodyColor !== 'transparent' || borderColor !== 'transparent') cut(bl, top, right - bl + 1, bottom - top + 1);
          if (bodyColor !== 'transparent' && barWidth > borderWidth * 2) cut(left + borderWidth, top + borderWidth, right - left - 2 * borderWidth + 1, bottom - top - 2 * borderWidth + 1);
        } else if (bodyColor !== 'transparent') {
          cut(left, top, right - left + 1, bottom - top + 1);
        }
        prevEdge = right;
      }
      ctx.restore();

      layer.find(isHandle).forEach((n: any) => n.drawScene(layer.getCanvas()));
    };

    layer.on('draw.candleCut', cutCandleBodies);
    // Live ticks / replay steps change candle bodies without moving the time scale
    const redraw = () => layer.batchDraw();
    series.subscribeDataChanged(redraw);
    // When the chart's mapping changes, the drawings have just re-rendered inside its paint:
    // draw them now, in the same frame as the candles, not on Konva's next frame
    const offFrame = afterChartFrame(chart, series, () => layer.draw());
    layer.batchDraw();
    return () => {
      layer.off('draw.candleCut');
      offFrame();
      try { series.unsubscribeDataChanged(redraw); } catch { /* series already disposed */ }
    };
  }, [chart, series]);
  // Lets handleChartClick (set up once per chart/tool change, not per drawing edit)
  // read the current drawings without going stale or forcing that effect to
  // re-subscribe chart.subscribeClick on every single drawing update.
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  // Lets the Shift keydown/keyup handlers below (registered in an effect that doesn't
  // re-run on every pendingPoints/mouse-position change) always read the CURRENT
  // in-progress trendline point and cursor position, instead of whatever they were the
  // last time that effect happened to re-run.
  const pendingPointsRef = useRef<{ logical: number; price: number }[]>([]);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  // Which of the edited drawing's texts is open: null its text, 'r,c' a table cell
  const [editingTextKey, setEditingTextKey] = useState<string | null>(null);
  // Post / Idea waiting for their link
  const [linkPrompt, setLinkPrompt] = useState<{ id: string; kind: 'post' | 'idea' } | null>(null);
  // Which drawing (if any) the pointer is currently over. Driven from the
  // chart's own crosshair-move stream (not Konva's native mouseenter/leave)
  // because the Konva stage's wrapper div is deliberately pointer-events:none
  // whenever nothing is selected and no tool is drawing — that's what lets
  // ordinary chart panning/zooming/crosshair-hover reach the real chart
  // underneath instead of being swallowed by an always-on-top empty overlay.
  // That means Konva never receives a real browser mousemove to react to, so
  // per-shape hover has to be computed the same way click-to-select already
  // is: call the Konva stage's own hit-canvas (getIntersection) manually
  // using the coordinates the chart's crosshair handler hands us, entirely
  // independent of the wrapper's CSS pointer-events state.
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  // The cursor for the part of a drawing under the mouse, and the one held during a drag
  // (a handle's own cursor, or the closed hand when a whole shape is moved)
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);
  const [dragCursor, setDragCursor] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedShapeId);
  selectedIdRef.current = selectedShapeId;
  // Set true for the duration of any native Konva drag (a shape's whole-body
  // drag, not a handle drag). While true, hover tracking below is frozen:
  // a fast diagonal drag can momentarily carry the pointer off a thin
  // line's hit region, which would otherwise flip isHovering to false
  // mid-gesture — and since isHovering feeds the shape's `draggable` prop,
  // Konva would cancel/restart the in-progress drag right then, so
  // dragend's handler never runs with the real total offset (this is what
  // broke Ctrl-drag-to-clone from a hover-only, unselected shape).
  const isAnyDraggingRef = useRef(false);
  const [activelyDrawingId, setActivelyDrawingId] = useState<string | null>(null);
  const [activeStrokePoints, setActiveStrokePoints] = useState<{ logical: number; price: number }[]>([]);
  const [activeStrokeConfig, setActiveStrokeConfig] = useState<{ stroke: string, strokeWidth: number, type: string } | null>(null);

  // Ctrl+drag selection rectangle state
  const [selectionRect, setSelectionRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [isCtrlDragging, setIsCtrlDragging] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // Refs for Ctrl/Shift so callbacks always see fresh key state (updated synchronously in key handlers)
  const ctrlRef = useRef(false);
  const shiftRef = useRef(false);

  // Track which drawings have already been cloned in the current drag to avoid duplicates
  const clonedDrawingIds = useRef<Set<string>>(new Set());

  // Ctrl+Drag: clone a drawing at its original position the instant the drag
  // starts (see the stage-level 'dragstart' listener below), so both the
  // stationary original and the moving copy are visible for the whole drag
  // instead of only appearing once the mouse is released. Uses the
  // functional setDrawings form so it never needs `drawings` in its
  // dependency array — this callback is invoked from a stage-level Konva
  // listener attached once on mount, so a stale closure over `drawings`
  // would otherwise clone from outdated state.
  const cloneDrawingIfNeeded = useCallback((drawingId: string) => {
    if (!ctrlRef.current || clonedDrawingIds.current.has(drawingId)) return;
    clonedDrawingIds.current.add(drawingId);
    setDrawings(prev => {
      const original = prev.find(d => d.id === drawingId);
      if (!original) return prev;
      const cloneId = Math.random().toString(36).substring(2, 10);
      return [...prev, { ...original, id: cloneId }];
    });
  }, [setDrawings]);

  // While the pointer is held (resizing a handle, dragging a shape), edits go into this
  // local preview instead of the shared drawing context. Every context update re-renders
  // all of its consumers — SubBar, ChartContainer, the toolbars — and doing that on every
  // drag frame blocked the main thread for 50–100 ms per mouse move, so shapes visibly
  // lagged behind the cursor. Only this layer re-renders during the drag; the result is
  // committed to the context once, on release.
  type LiveEdit = { id: string; updates: Partial<any> };
  const [liveEdit, setLiveEdit] = useState<LiveEdit | null>(null);
  const liveEditRef = useRef<LiveEdit | null>(null);
  const pointerHeldRef = useRef(false);

  const commitLiveEdit = useCallback(() => {
    const pending = liveEditRef.current;
    if (!pending) return;
    liveEditRef.current = null;
    updateDrawing(pending.id, pending.updates);
    setLiveEdit(null);
  }, [updateDrawing]);

  // Clones on the first update if needed (a no-op if cloneDrawingIfNeeded already fired),
  // then applies the update — previewed while the pointer is held, committed otherwise.
  const handleUpdateWithClone = useCallback((drawingId: string, updates: Partial<any>) => {
    cloneDrawingIfNeeded(drawingId);
    if (!pointerHeldRef.current) {
      updateDrawing(drawingId, updates);
      return;
    }
    const prev = liveEditRef.current;
    if (prev && prev.id !== drawingId) commitLiveEdit();
    const next = { id: drawingId, updates: prev && prev.id === drawingId ? { ...prev.updates, ...updates } : updates };
    liveEditRef.current = next;
    setLiveEdit(next);
  }, [cloneDrawingIfNeeded, updateDrawing, commitLiveEdit]);

  // Konva registers its own window mouseup listeners (which fire dragend) at module load,
  // so this bubble-phase listener always runs after a tool's final drag-end update.
  useEffect(() => {
    const onDown = () => { pointerHeldRef.current = true; };
    const onUp = () => { pointerHeldRef.current = false; commitLiveEdit(); };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('touchstart', onDown, true);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
    window.addEventListener('blur', onUp);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('touchstart', onDown, true);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
      window.removeEventListener('blur', onUp);
    };
  }, [commitLiveEdit]);

  // Clear cloned tracking when a new drag starts
  useEffect(() => {
    const handleMouseDown = () => { clonedDrawingIds.current.clear(); };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Panning / zooming doesn't re-render this layer: each drawing follows the chart itself
  // (useChartTick, in the chart's own paint) and the candle cut redraws after each chart frame.
  // Re-rendering the whole layer per frame also re-rendered the Konva stage's context bridge
  // and every drawing a second time, which made pan, zoom and drags stutter.
  useEffect(() => {
    if (!chart) return;

    // Listen for clicks on the chart to select or erase shapes when not in drawing mode
    const handleChartClick = (param: any) => {
      // Only handle if we aren't currently drawing (cursor tools are fine)
      const isCursorTool = activeTool && ['cross', 'dot', 'arrow_cursor', 'eraser', 'magic', 'demonstration'].includes(activeTool);
      if (activeTool && !isCursorTool) return;
      
      if (!param.point || !stageRef.current) {
        setSelectedShapeId(null);
        setDrawings(prev => prev.filter(d => d.type !== 'measure'));
        return;
      }

      // Clean up ephemeral measure tools on any chart click
      setDrawings(prev => prev.filter(d => d.type !== 'measure'));

      // getIntersection uses Konva's internal hit canvas
      const shape = stageRef.current.getIntersection(param.point);
      if (shape) {
        // Find the topmost group/shape with an ID
        let current = shape;
        let foundId = null;
        while (current) {
          if (current.attrs && current.attrs.id) {
            foundId = current.attrs.id;
            // Ignore preview shapes
            if (foundId !== 'preview') break;
          }
          current = current.parent;
        }
        
        if (foundId && foundId !== 'preview') {
          console.log('[DrawingLayer] Shape found via hit-test:', foundId);
          if (activeTool === 'eraser') {
            deleteDrawing(foundId);
          } else {
            setSelectedShapeId(foundId);
            // A real Konva click never reaches a shape's own onClick handlers while it's
            // only hovered (not yet selected) — the wrapper div's pointer-events stay
            // 'none' until something is selected, so the browser routes the click to the
            // chart underneath instead, landing here via getIntersection. That means the
            // "+ Add text" placeholder (and clicking existing text to re-edit it) would
            // silently do nothing on the very first click. Since this manual hit-test
            // already found the exact Konva node, open the text editor directly for it
            // when that node is specifically a Text label on a type that supports one.
            const textEditableTypes = [...TEXT_LINE_TYPES, 'rectangle', 'circle', 'ellipse', 'text'];
            const clickedDrawing = drawingsRef.current.find(d => d.id === foundId);
            if (shape.className === 'Text' && clickedDrawing && textEditableTypes.includes(clickedDrawing.type)) {
              setEditingTextId(foundId);
            }
          }
          return;
        }
      }
      console.log('[DrawingLayer] No shape found at click pos, clearing selection');
      setSelectedShapeId(null);
      clearSelection();
    };
    
    chart.subscribeClick(handleChartClick);

    // Same hit-test as handleChartClick above, but driving hover state
    // instead of a click action. This is a window-level listener rather
    // than chart.subscribeCrosshairMove on purpose: the wrapper div around
    // the Konva stage flips pointer-events between 'none' and 'auto' (e.g.
    // the instant Ctrl is held, to allow a Ctrl-drag directly off a hover
    // state), and that pointer-events change itself alters which element
    // the browser considers "under the cursor" — which made the chart
    // briefly think the pointer had left its canvas and report a null
    // point right when Ctrl was pressed, clearing hover at exactly the
    // moment a Ctrl+drag needed it. A window mousemove listener always
    // fires regardless of any element's pointer-events, so it isn't
    // affected by that handoff.
    const handleWindowMouseMove = (e: MouseEvent) => {
      // Mid-drag the cursor stays the dragged node's: a handle's own (resize arrows / plain
      // arrow), or the closed hand for a whole shape. Read from Konva itself, since some tools
      // stop their handles' dragstart from bubbling up to the stage.
      const dragged: any = Konva.DD.isDragging ? Konva.DD.node : null;
      if (dragged) {
        setDragCursor(dragged.getAttr('cursor') || (dragged.getAttr('tvHandle') ? 'default' : 'grabbing'));
        return;
      }
      if (isAnyDraggingRef.current) return;
      const isCursorTool = activeTool && ['cross', 'dot', 'arrow_cursor', 'eraser', 'magic', 'demonstration'].includes(activeTool);
      if (activeTool && !isCursorTool) { setHoveredShapeId(null); return; }
      if (!stageRef.current) { setHoveredShapeId(null); return; }

      const stageBox = stageRef.current.container().getBoundingClientRect();
      const point = { x: e.clientX - stageBox.left, y: e.clientY - stageBox.top };
      if (point.x < 0 || point.y < 0 || point.x > stageBox.width || point.y > stageBox.height) {
        setHoveredShapeId(null);
        return;
      }

      const shape = stageRef.current.getIntersection(point);
      if (shape) {
        let current = shape;
        let foundId: string | null = null;
        while (current) {
          if (current.attrs && current.attrs.id) {
            foundId = current.attrs.id;
            if (foundId !== 'preview') break;
          }
          current = current.parent;
        }
        const id = foundId && foundId !== 'preview' ? foundId : null;
        setHoveredShapeId(id);
        setHoverCursor(id ? shapePartCursor(shape, drawingsRef.current.find(d => d.id === id), selectedIdRef.current === id) : null);
        return;
      }
      setHoveredShapeId(null);
      setHoverCursor(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    const handleWindowMouseUp = () => setDragCursor(null);
    window.addEventListener('mouseup', handleWindowMouseUp);

    // Middle-click (mouse wheel button) on a shape deletes it immediately, without
    // needing to select it or switch to the eraser tool first. This has to be a
    // window-level 'mousedown' listener rather than a Konva/Stage handler: whenever
    // nothing is selected the wrapper div is deliberately pointer-events:none (see
    // shouldCaptureEvents above) so plain hover/pan reaches the real chart underneath,
    // which means Konva itself never sees the click — so hit-testing is done by hand
    // here, the same way hover and left-click-to-select already do just above.
    const handleWindowMiddleClick = (e: MouseEvent) => {
      if (e.button !== 1 || !stageRef.current) return;
      const stageBox = stageRef.current.container().getBoundingClientRect();
      const point = { x: e.clientX - stageBox.left, y: e.clientY - stageBox.top };
      if (point.x < 0 || point.y < 0 || point.x > stageBox.width || point.y > stageBox.height) return;

      const shape = stageRef.current.getIntersection(point);
      if (!shape) return;
      let current: any = shape;
      let foundId: string | null = null;
      while (current) {
        if (current.attrs && current.attrs.id) {
          foundId = current.attrs.id;
          if (foundId !== 'preview') break;
        }
        current = current.parent;
      }
      if (foundId && foundId !== 'preview') {
        // Stop the browser's middle-click autoscroll cursor and any focus/paste
        // side effects now that the click actually did something on the page.
        e.preventDefault();
        deleteDrawing(foundId);
        if (selectedShapeId === foundId) setSelectedShapeId(null);
        setSelectedShapeIds(prev => {
          if (!prev.has(foundId!)) return prev;
          const next = new Set(prev);
          next.delete(foundId!);
          return next;
        });
      }
    };
    window.addEventListener('mousedown', handleWindowMiddleClick);

    // Konva drag events bubble up to the stage, so this single pair of
    // listeners covers every shape's whole-body drag without needing to
    // touch each of the 18 tool components individually.
    const handleAnyDragStart = (e: any) => {
      isAnyDraggingRef.current = true;
      // Only whole-shape drags carry the drawing's id on the dragged node
      // itself (handles are anonymous Circles/Rects with no id), so this
      // naturally skips cloning when a resize handle is being dragged.
      const drawingId = e.target?.id?.();
      if (drawingId) cloneDrawingIfNeeded(drawingId);
    };
    const handleAnyDragEnd = () => { isAnyDraggingRef.current = false; };
    stageRef.current?.on('dragstart', handleAnyDragStart);
    stageRef.current?.on('dragend', handleAnyDragEnd);

    // Track Ctrl and Shift keys to allow starting a selection drag or measure drag
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Control' || e.ctrlKey) { setIsCtrlPressed(true); ctrlRef.current = true; }
      if (e.key === 'Shift' || e.shiftKey) {
        setIsShiftPressed(true);
        shiftRef.current = true;
        syncTrendlineShiftPreview(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || !e.ctrlKey) { setIsCtrlPressed(false); ctrlRef.current = false; }
      if (e.key === 'Shift' || !e.shiftKey) {
        setIsShiftPressed(false);
        shiftRef.current = false;
        syncTrendlineShiftPreview(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      chart.unsubscribeClick(handleChartClick);
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('mousedown', handleWindowMiddleClick);
      stageRef.current?.off('dragstart', handleAnyDragStart);
      stageRef.current?.off('dragend', handleAnyDragEnd);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [chart, activeTool, setSelectedShapeId, cloneDrawingIfNeeded]);

  const [pendingPoints, setPendingPoints] = useState<{ logical: number; price: number }[]>([]);
  pendingPointsRef.current = pendingPoints;
  const [previewPoint, setPreviewPoint] = useState<{ logical: number; price: number } | null>(null);
  const [isShiftMeasuring, setIsShiftMeasuring] = useState(false);

  // An in-progress multi-click drawing (e.g. a trendline's first point already
  // placed) must not carry over when the active tool changes — whether that's
  // via Escape (which only clears activeTool) or by picking a different tool
  // straight from the favorites subbar without cancelling first. Without this,
  // the new tool's first click silently reuses the abandoned point's location.
  useEffect(() => {
    setPendingPoints([]);
    setPreviewPoint(null);
  }, [activeTool]);

  type ToolConfigType = { type: 'N-point' | 'continuous' | 'click-point', maxPoints?: number };
  
  const TOOL_CONFIG: Record<string, ToolConfigType> = {
    text: { type: 'click-point', maxPoints: 1 },
    arrow_mark_up: { type: 'click-point', maxPoints: 1 },
    arrow_mark_down: { type: 'click-point', maxPoints: 1 },
    
    trendline: { type: 'click-point', maxPoints: 2 },
    ray: { type: 'click-point', maxPoints: 2 },
    info_line: { type: 'click-point', maxPoints: 2 },
    extended_line: { type: 'click-point', maxPoints: 2 },
    trend_angle: { type: 'click-point', maxPoints: 2 },
    horizontal_line: { type: 'click-point', maxPoints: 1 },
    vertical_line: { type: 'click-point', maxPoints: 1 },
    cross_line: { type: 'click-point', maxPoints: 1 },
    horizontal_ray: { type: 'click-point', maxPoints: 1 },
    rectangle: { type: 'click-point', maxPoints: 2 },
    zoom_in: { type: 'click-point', maxPoints: 2 },
    fibonacci: { type: 'click-point', maxPoints: 2 },
    arrow_marker: { type: 'click-point', maxPoints: 2 },
    arrow: { type: 'click-point', maxPoints: 2 },
    circle: { type: 'click-point', maxPoints: 2 },
    measure: { type: 'click-point', maxPoints: 2 },
    
    rotated_rectangle: { type: 'click-point', maxPoints: 2 },
    triangle: { type: 'click-point', maxPoints: 3 },
    arc: { type: 'click-point', maxPoints: 3 },
    curve: { type: 'click-point', maxPoints: 2 },
    ellipse: { type: 'click-point', maxPoints: 3 },
    
    double_curve: { type: 'click-point', maxPoints: 2 },
    
    long_position: { type: 'click-point', maxPoints: 1 },
    short_position: { type: 'click-point', maxPoints: 1 },
    emoji: { type: 'click-point', maxPoints: 1 },
    
    path: { type: 'N-point' },
    polyline: { type: 'N-point' },
    
    // Fibonacci & Gann, patterns, Elliott, cycles, forecasting, volume-based, measurers
    ...Object.fromEntries(Object.entries(ADVANCED_TOOLS).map(([k, t]) => [k, t.points === Infinity ? { type: 'N-point' as const } : { type: 'click-point' as const, maxPoints: t.points }])),
    brush: { type: 'continuous' },
    highlighter: { type: 'continuous' },
  };

  // Curve and double curve are placed with two clicks (their ends); their control points
  // are derived from those ends. Shared by creation and the live preview, so the preview
  // shows the exact shape that will be created instead of a straight line between clicks.
  type AnchorPoint = { logical: number; price: number; time?: number };

  const deriveCurvePoints = (start: AnchorPoint, end: AnchorPoint): AnchorPoint[] | null => {
    const x1 = logicalToPixel(chart, start.logical);
    const y1 = priceToPixel(series, start.price);
    const x2 = logicalToPixel(chart, end.logical);
    const y2 = priceToPixel(series, end.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    const mLogical = pixelToLogical(chart, (x1 + x2) / 2);
    const mPrice = pixelToPrice(series, (y1 + y2) / 2 - 20); // default bulge
    if (mLogical === null || mPrice === null) return null;
    return [start, end, { logical: mLogical, price: mPrice }];
  };

  const deriveDoubleCurvePoints = (start: AnchorPoint, end: AnchorPoint): AnchorPoint[] | null => {
    const x1 = logicalToPixel(chart, start.logical);
    const y1 = priceToPixel(series, start.price);
    const x2 = logicalToPixel(chart, end.logical);
    const y2 = priceToPixel(series, end.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const chord = Math.hypot(dx, dy);
    if (chord < 1) return null;
    const perpX = -dy / chord;
    const perpY = dx / chord;
    // S-shape: control points at 1/4 and 3/4 along the chord, pushed out to opposite sides
    const bulge = chord * 0.6;
    const t1logical = pixelToLogical(chart, x1 + dx * 0.25 + perpX * bulge);
    const t1price = pixelToPrice(series, y1 + dy * 0.25 + perpY * bulge);
    const t2logical = pixelToLogical(chart, x1 + dx * 0.75 - perpX * bulge);
    const t2price = pixelToPrice(series, y1 + dy * 0.75 - perpY * bulge);
    if (t1logical === null || t1price === null || t2logical === null || t2price === null) return null;
    return [start, { logical: t1logical, price: t1price }, { logical: t2logical, price: t2price }, end];
  };

  // Shift-key angle lock while placing a trend line's second point: snaps the line to
  // whichever multiple of 45° from horizontal (0/45/90/135/180/225/270/315) it's already
  // closest to — the same octant-constrain behavior design tools like Figma/Illustrator
  // use for a held Shift, rather than only the old horizontal-only special case. Holding
  // Shift snaps it; releasing Shift (this is simply never called that frame) goes
  // straight back to whatever the free, unconstrained angle actually is under the
  // cursor. "45 degrees" is a visual, on-screen notion — a bar and a price unit aren't
  // the same size — so the snap is computed in pixel space and only converted back to
  // logical/price afterward.
  const computeAngleLockedPoint = (
    p1: { logical: number; price: number },
    pointerPos: { x: number; y: number }
  ): { logical: number; price: number; time: number | null } | null => {
    const x1 = logicalToPixel(chart, p1.logical);
    const y1 = priceToPixel(series, p1.price);
    if (x1 === null || y1 === null) return null;

    const dx = pointerPos.x - x1;
    const dy = pointerPos.y - y1;
    if (dx === 0 && dy === 0) return null;

    const step = Math.PI / 4; // 45°
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    // Project the cursor's actual reach onto the snapped direction, so the line's
    // length keeps tracking the cursor naturally as it moves along that direction.
    const length = dx * Math.cos(angle) + dy * Math.sin(angle);

    const x2 = x1 + length * Math.cos(angle);
    const y2 = y1 + length * Math.sin(angle);

    const logical = pixelToLogical(chart, x2);
    const price = pixelToPrice(series, y2);
    if (logical === null || price === null) return null;

    // Same fractional-time interpolation/extrapolation the raw cursor position already
    // gets elsewhere, just re-derived for this angle-snapped logical instead.
    const fullData = (window as any).__chartFullData || [];
    let time: number | null = null;
    const index1 = Math.floor(logical);
    const index2 = index1 + 1;
    if (index1 >= 0 && index2 < fullData.length) {
      const t1 = fullData[index1].time;
      const t2 = fullData[index2].time;
      time = t1 + (logical - index1) * (t2 - t1);
    } else if (fullData.length >= 2 && index1 >= fullData.length - 1) {
      const lastTime = fullData[fullData.length - 1].time;
      const prevTime = fullData[fullData.length - 2].time;
      const diff = lastTime - prevTime;
      time = lastTime + (logical - (fullData.length - 1)) * diff;
    } else if (fullData.length > 0) {
      time = fullData[Math.max(0, Math.min(fullData.length - 1, Math.round(logical)))].time;
    }

    return { logical, price, time };
  };

  // Keeps the trendline's live preview in sync the INSTANT Shift is pressed or
  // released, using the last known pointer position — without this, the 45° snap (or
  // its release back to a free angle) only took effect on the next actual mousemove,
  // so toggling Shift while the cursor sat still appeared to do nothing, and any click
  // that followed without first nudging the mouse would place the point using whichever
  // state (locked or free) happened to be left over instead of the current one.
  const syncTrendlineShiftPreview = (shiftHeld: boolean) => {
    if (!activeTool || !TREND_LINE_TYPES.includes(activeTool) || pendingPointsRef.current.length !== 1) return;
    const pos = lastPointerPosRef.current;
    if (!pos || !chart || !series) return;

    const rawLogical = pixelToLogical(chart, pos.x);
    const rawPrice = pixelToPrice(series, pos.y);
    if (rawLogical === null || rawPrice === null) return;

    const fullData = (window as any).__chartFullData || [];
    let logical = rawLogical;
    let price = rawPrice;
    let time: number | null = null;
    const snappedLogical = Math.round(rawLogical);
    if (snappedLogical >= 0 && snappedLogical < fullData.length) {
      logical = snappedLogical;
      time = fullData[snappedLogical].time;
    }

    if (shiftHeld) {
      const locked = computeAngleLockedPoint(pendingPointsRef.current[0], pos);
      if (locked) {
        logical = locked.logical;
        price = locked.price;
        if (locked.time !== null) time = locked.time;
      }
    }

    setPreviewPoint({ logical, price, time } as any);
  };

  // Re-sends a press on this layer to the chart element beneath it (see handleMouseDown).
  // The chart follows the rest of the gesture at document level, so only the press is needed.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const forwardPressToChart = (evt: MouseEvent): boolean => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return false;
    const prev = wrapper.style.pointerEvents;
    wrapper.style.pointerEvents = 'none';
    const target = document.elementFromPoint(evt.clientX, evt.clientY);
    wrapper.style.pointerEvents = prev;
    if (!target || wrapper.contains(target) || !wrapper.parentElement?.contains(target)) return false;
    target.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, view: window, detail: 1,
      clientX: evt.clientX, clientY: evt.clientY, screenX: evt.screenX, screenY: evt.screenY,
      button: 0, buttons: 1, ctrlKey: evt.ctrlKey, shiftKey: evt.shiftKey, altKey: evt.altKey, metaKey: evt.metaKey,
    }));
    return true;
  };

  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    lastPointerPosRef.current = pointerPos;
    // Only the left button places points (a right-click finishes a path, it doesn't add to it)
    if (activeTool && e.evt && e.evt.button !== undefined && e.evt.button !== 0) return;
    downsRef.current = [downsRef.current[1], { x: pointerPos.x, y: pointerPos.y }];

    // Ctrl+drag on empty canvas starts a selection rectangle. Ctrl+drag
    // starting directly on a hovered/selected shape (e.target !== stage) is
    // the clone-drag gesture instead, handled by the shape's own native
    // Konva drag plus handleUpdateWithClone above — without this check this
    // branch fired first for every Ctrl+drag and hijacked the mousedown
    // before it ever reached the shape's own drag handling.
    if (e.evt?.ctrlKey && !e.evt?.shiftKey && e.target === stage && (!activeTool || ['cross', 'dot', 'arrow_cursor', 'eraser', 'magic', 'demonstration'].includes(activeTool))) {
      setIsCtrlDragging(true);
      setSelectionRect({ startX: pointerPos.x, startY: pointerPos.y, endX: pointerPos.x, endY: pointerPos.y });
      setSelectedShapeId(null);
      clearSelection();
      return;
    }

    // Shift+drag to start the measure tool — but not when Ctrl is also held,
    // since Ctrl+Shift+drag on a shape is the clone-drag gesture instead;
    // without this check this branch fired first and hijacked the mousedown
    // before it ever reached the shape's own drag handling.
    if (e.evt?.shiftKey && !e.evt?.ctrlKey && (!activeTool || ['cross', 'dot', 'arrow_cursor', 'eraser', 'magic', 'demonstration'].includes(activeTool))) {
      const logical = pixelToLogical(chart, pointerPos.x);
      const price = pixelToPrice(series, pointerPos.y);
      if (logical !== null && price !== null) {
        // Clean up any existing ephemeral measure tools first
        drawings.forEach(d => {
          if (d.type === 'measure') deleteDrawing(d.id);
        });
        setIsShiftMeasuring(true);
        setPendingPoints([{ logical, price }]);
        setPreviewPoint({ logical, price });
        return;
      }
    }

    const clickedOnEmpty = e.target === stage;

    // Pressing empty chart space while this layer captures the mouse (a drawing is selected or
    // hovered): as on TradingView, dragging pans the chart, the selected drawing stays selected
    // and moves with it, and only a click without movement deselects. The press is handed to
    // the chart's own pane underneath, so the pan is the chart's native one; a click without
    // movement then reaches handleChartClick, which clears the selection.
    const isCursorLike = !activeTool || ['cross', 'dot', 'arrow_cursor', 'eraser', 'magic', 'demonstration'].includes(activeTool);
    if (clickedOnEmpty && isCursorLike && e.evt?.button === 0 && forwardPressToChart(e.evt)) {
      drawings.forEach(d => { if (d.type === 'measure') deleteDrawing(d.id); });
      return;
    }

    // Eraser: pressing on a drawing removes it. (Over a drawing this layer captures the
    // press, so the chart-level click handler that also erases never sees it.)
    if (activeTool === 'eraser') {
      let node = e.target;
      while (node && node !== stage) {
        const id = node.attrs?.id;
        if (id && id !== 'preview' && drawings.some(d => d.id === id)) { deleteDrawing(id); break; }
        node = node.parent;
      }
      return;
    }

    if (!activeTool) {
      if (clickedOnEmpty) {
        setSelectedShapeId(null);
        clearSelection();
      }
      
      // Clean up ephemeral measure tools on any click
      drawings.forEach(d => {
        if (d.type === 'measure') deleteDrawing(d.id);
      });
      return;
    }

    const snapped = snapToChart(chart, series, pointerPos.x, pointerPos.y, effectiveMagnet(magnetMode, isCtrlPressed),
      !activeTool || activeTool === 'brush' || activeTool === 'highlighter');
    if (!snapped) return;
    let { logical, price, time } = snapped as { logical: number; price: number; time: any };

    // Trend line: holding Shift while placing the second point locks the line's angle
    // to the nearest multiple of 45°.
    if (activeTool && TREND_LINE_TYPES.includes(activeTool) && pendingPoints.length === 1 && e.evt?.shiftKey) {
      const locked = computeAngleLockedPoint(pendingPoints[0], pointerPos);
      if (locked) {
        logical = locked.logical;
        price = locked.price;
        if (locked.time !== null) time = locked.time;
      }
    }

    const config = TOOL_CONFIG[activeTool];
    if (!config) return;

    if (config.type === 'continuous') {
      const newId = `${activeTool}-${Date.now()}`;
      setActivelyDrawingId(newId);
      setActiveStrokePoints([{ logical, price, time }]);
      setActiveStrokeConfig({
        type: activeTool as string,
        stroke: activeTool === 'highlighter' ? 'rgba(255, 235, 59, 1)' : '#2962ff',
        strokeWidth: activeTool === 'highlighter' ? 20 : 2
      });
      return;
    }

    if (config.type === 'click-point' || config.type === 'N-point') {
      const newPoints = [...pendingPoints, { logical, price, time }];
      
      if (config.maxPoints && newPoints.length === config.maxPoints) {
        if (activeTool === 'text') {
          const newId = `text-${Date.now()}`;
          
          // Capture the current pixel width of 1 logical bar to use as a baseline scale
          let initialBarWidth = 10; // safe fallback
          const c0 = logicalToPixel(chart, 0);
          const c1 = logicalToPixel(chart, 1);
          if (c0 !== null && c1 !== null) {
            initialBarWidth = Math.abs(c1 - c0);
          }

          addDrawing({
            id: newId,
            type: 'text',
            visible: true,
            locked: false,
            stroke: '#2962ff',
            strokeWidth: 1,
            points: newPoints,
            // @ts-ignore
            text: '',
            initialBarWidth
          });
          setEditingTextId(newId);
        } else if (activeTool === 'emoji') {
          const newId = `emoji-${Date.now()}`;
          
          let initialBarWidth = 10;
          const c0 = logicalToPixel(chart, 0);
          const c1 = logicalToPixel(chart, 1);
          if (c0 !== null && c1 !== null) {
            initialBarWidth = Math.abs(c1 - c0);
          }

          addDrawing({
            id: newId,
            type: 'emoji',
            visible: true,
            locked: false,
            // An Icons-tab icon is drawn in this colour; an emoji keeps its own
            stroke: isIconId(activeEmoji) ? '#2962ff' : '#000000',
            strokeWidth: 1,
            points: newPoints,
            emojiChar: activeEmoji || '😀',
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            initialBarWidth
          });
          setSelectedShapeId(newId);
          finishActiveTool();
        } else {
          let finalPoints = shapePoints(activeTool, newPoints);

          let additionalProps = {};


          if (activeTool === 'long_position' || activeTool === 'short_position') {
            const isLong = activeTool === 'long_position';
            const entryLogical = finalPoints[0].logical;
            const entryPrice = finalPoints[0].price;
            
            // Calculate pixel distances for 1-click instantiation
            const entryY = priceToPixel(series, entryPrice) || 0;
            
            let targetPrice, stopPrice;
            if (isLong) {
              targetPrice = pixelToPrice(series, entryY - 100) || entryPrice * 1.05;
              stopPrice = pixelToPrice(series, entryY + 50) || entryPrice * 0.95;
            } else {
              targetPrice = pixelToPrice(series, entryY + 100) || entryPrice * 0.95;
              stopPrice = pixelToPrice(series, entryY - 50) || entryPrice * 1.05;
            }
            
            // 15 logical points (bars) width roughly
            const rightLogical = entryLogical + 15;
            
            // Map to 4 explicit points: [0] = Entry Point, [1] = Right Logical Point, [2] = Target Point, [3] = Stop Point
            finalPoints = [
              { logical: entryLogical, price: entryPrice }, // Entry
              { logical: rightLogical, price: entryPrice }, // Right boundary
              { logical: entryLogical, price: targetPrice }, // Target
              { logical: entryLogical, price: stopPrice }    // Stop
            ];
            
            // TradingView's defaults; quantity and P&L are worked out from these as bars print
            additionalProps = {
              textColor: '#ffffff',
              targetFillColor: POSITION_TARGET_FILL,
              stopFillColor: POSITION_STOP_FILL,
              accountSize: 1000,
              lotSize: 1,
              risk: 25,
              riskType: '%',
            };
          }




          // Tools that capture something when drawn (Bars pattern's bars, Anchored VWAP's anchor…)
          const created = ADVANCED_TOOLS[activeTool]?.onCreate?.(finalPoints);
          if (created) {
            const { points: adjusted, ...rest } = created;
            if (adjusted) finalPoints = adjusted;
            additionalProps = { ...additionalProps, ...rest };
          }

          if (activeTool === 'zoom_in') {
            const logical1 = finalPoints[0].logical;
            const logical2 = finalPoints[1].logical;
            if (logical1 !== null && logical2 !== null) {
              // Zoom Out steps back through these, one zoom at a time (as TradingView's does)
              const before = chart.timeScale().getVisibleLogicalRange();
              if (before) {
                const stack: any[] = ((window as any).__zoomStack = (window as any).__zoomStack || []);
                stack.push({ from: before.from, to: before.to });
                window.dispatchEvent(new CustomEvent('tv:zoom-depth', { detail: stack.length }));
              }
              chart.timeScale().setVisibleLogicalRange({
                from: Math.min(logical1, logical2),
                to: Math.max(logical1, logical2)
              });
            }
            setActiveTool('cross');
            setPendingPoints([]);
            setPreviewPoint(null);
            return;
          }

          const newId = `${activeTool}-${Date.now()}`;
          
          console.log(`[DrawingCreated] type=${activeTool} id=${newId}`);
          finalPoints.forEach((p: any, i: number) => {
            console.log(`  point[${i}]: logical=${p.logical}, price=${p.price}, time=${p.time} (${p.time ? new Date(p.time * 1000).toISOString() : 'none'})`);
          });

          addDrawing({
            id: newId,
            type: activeTool as any,
            visible: true,
            locked: false,
            ...toolBaseStyle(activeTool),
            points: finalPoints,
            ...additionalProps
          });
          setSelectedShapeId(newId);
          afterCreate(activeTool, newId, finalPoints);
        }
        setPendingPoints([]);
        setPreviewPoint(null);
        finishActiveTool();
      } else {
        setPendingPoints(newPoints);
      }
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    lastPointerPosRef.current = pointerPos;

    const snapped = snapToChart(chart, series, pointerPos.x, pointerPos.y, effectiveMagnet(magnetMode, isCtrlPressed),
      !activeTool || activeTool === 'brush' || activeTool === 'highlighter');
    if (!snapped) return;
    let { logical, price, time } = snapped as { logical: number; price: number; time: any };

    // Trend line: holding Shift while placing the second point locks the live preview's
    // angle to the nearest multiple of 45°.
    if (activeTool && TREND_LINE_TYPES.includes(activeTool) && pendingPoints.length === 1 && e.evt?.shiftKey) {
      const locked = computeAngleLockedPoint(pendingPoints[0], pointerPos);
      if (locked) {
        logical = locked.logical;
        price = locked.price;
        if (locked.time !== null) time = locked.time;
      }
    }

    if (isCtrlDragging && selectionRect) {
      const stage = e.target.getStage();
      const pointerPos = stage.getPointerPosition();
      if (pointerPos) {
        setSelectionRect(prev => prev ? { ...prev, endX: pointerPos.x, endY: pointerPos.y } : null);
      }
      return;
    }

    if (isShiftMeasuring && pendingPoints.length === 1) {
      setPreviewPoint({ logical, price, time });
      return;
    }

    if (activelyDrawingId && (activeTool === 'brush' || activeTool === 'highlighter')) {
      setActiveStrokePoints(prev => [...prev, { logical, price, time }]);
      return;
    }

    if (!activeTool) return;

    setPreviewPoint({ logical, price, time });
  };

  const handleDblClick = (e: any) => {
    if (!activeTool) {
      // Double-clicking a drawing selects it and opens its settings
      const stage = e?.target?.getStage?.();
      let node = e?.target;
      while (node && node !== stage) {
        const id = node.attrs?.id;
        const d = id && drawings.find(x => x.id === id);
        if (d) {
          setSelectedShapeId(id);
          // SubBar mounts for the new selection first, then hears this
          requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('tv:open-shape-settings', { detail: { id } })));
          return;
        }
        node = node.parent;
      }
      return;
    }
    const config = TOOL_CONFIG[activeTool];
    // Konva calls any two quick clicks a double-click, even far apart; placing points fast
    // isn't one. Only two presses on the same spot finish the shape.
    const [d1, d2] = downsRef.current;
    if (!d1 || !d2 || Math.hypot(d1.x - d2.x, d1.y - d2.y) > 6) return;
    if (config?.type === 'N-point' && pendingPoints.length >= 1) {
      // The double-clicked spot is the last point. Its own presses may not have reached
      // pendingPoints yet when this fires, so it's added here (and de-duplicated)
      const pos = e?.target?.getStage?.()?.getPointerPosition?.();
      const pt = pos ? snapToChart(chart, series, pos.x, pos.y, effectiveMagnet(magnetMode, isCtrlPressed)) : null;
      finishNPoint(true, pt ?? undefined);
    }
  };

  // Finishes a Path/Polyline with the points placed so far. A double-click's second press
  // lands on the same spot, so a repeated point is dropped. TradingView leaves the shape
  // selected, except when it's finished with Esc.
  // The last two presses on the layer, to tell a real double-click from two quick clicks
  const downsRef = useRef<({ x: number; y: number } | undefined)[]>([undefined, undefined]);
  const finishNPoint = (select: boolean, last?: { logical: number; price: number; time: any }) => {
    const placed = last ? [...pendingPoints, last] : pendingPoints;
    const pts = placed.filter((p, i) => i === 0 || p.logical !== placed[i - 1].logical || p.price !== placed[i - 1].price);
    if (activeTool && pts.length >= 2) {
      const id = `${activeTool}-${Date.now()}`;
      const { points: adjusted, ...rest } = ADVANCED_TOOLS[activeTool]?.onCreate?.(pts) || {};
      addDrawing({ id, type: activeTool as any, visible: true, locked: false, ...toolBaseStyle(activeTool), ...rest, points: adjusted || pts });
      if (select) setSelectedShapeId(id);
    }
    setPendingPoints([]);
    setPreviewPoint(null);
    finishActiveTool();
  };

  // Esc on a path that already has two points keeps it, unselected (with one point it's
  // dropped by the global Esc). Capture phase, so it runs before that Esc clears the tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || activeTool !== 'path' || isTypingTarget(e.target)) return;
      if (pendingPoints.length >= 2) finishNPoint(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Enter') {
        if (!activeTool) return;
        const config = TOOL_CONFIG[activeTool];
        if (config?.type === 'N-point' && pendingPoints.length >= 2) finishNPoint(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, pendingPoints, addDrawing]);

  const handleMouseUp = () => {
    // Finish Ctrl+drag selection rectangle or Zoom in
    if (isCtrlDragging && selectionRect) {
      const x1 = Math.min(selectionRect.startX, selectionRect.endX);
      const y1 = Math.min(selectionRect.startY, selectionRect.endY);
      const x2 = Math.max(selectionRect.startX, selectionRect.endX);
      const y2 = Math.max(selectionRect.startY, selectionRect.endY);

      // Only process if rect has meaningful size
      if (Math.abs(x2 - x1) > 5 && Math.abs(y2 - y1) > 5) {
        // Perform Selection
        const hitIds = new Set<string>();

        drawings.filter(d => d.visible).forEach(d => {
          // Check if any of the drawing's points fall inside the selection rectangle
          const inside = d.points?.some(p => {
            const px = logicalToPixel(chart, p.logical);
            const py = priceToPixel(series, p.price);
            if (px === null || py === null) return false;
            return px >= x1 && px <= x2 && py >= y1 && py <= y2;
          });
          if (inside) hitIds.add(d.id);
        });

        if (hitIds.size > 0) {
          setSelectedShapeIds(hitIds);
          setSelectedShapeId(null);
        }
      }

      setIsCtrlDragging(false);
      setSelectionRect(null);
      return;
    }

    if (isShiftMeasuring) {
      if (pendingPoints.length === 1 && previewPoint) {
        // commit measure drawing
        addDrawing({
          id: `measure-${Date.now()}`,
          type: 'measure',
          visible: true,
          locked: false,
          stroke: '#2962ff',
          strokeWidth: 2,
          points: [pendingPoints[0], previewPoint]
        });
      }
      setIsShiftMeasuring(false);
      setPendingPoints([]);
      setPreviewPoint(null);
      return;
    }

    if (activelyDrawingId && (activeTool === 'brush' || activeTool === 'highlighter') && activeStrokeConfig) {
      if (activeStrokePoints.length >= 2) {
        addDrawing({
          id: activelyDrawingId,
          type: activeStrokeConfig.type as any,
          visible: true,
          locked: false,
          stroke: activeStrokeConfig.stroke,
          strokeWidth: activeStrokeConfig.strokeWidth,
          points: activeStrokePoints
        });
        // A finished stroke is selected (with its toolbar), like every other new drawing
        setSelectedShapeId(activelyDrawingId);
      }
      setActivelyDrawingId(null);
      setActiveStrokePoints([]);
      setActiveStrokeConfig(null);
    }
  };

  const handleContextMenu = (e: any) => {
    e.evt?.preventDefault?.();
    
    // Right-click exits any active drawing tool and returns to chart canvas
    if (activeTool) {
      const config = TOOL_CONFIG[activeTool];
      
      // Finishing or leaving a drawing with a right-click opens no chart menu (TradingView)
      e.evt?.stopPropagation?.();
      // For N-point tools (like Path/Polyline), right-click FINISHES the drawing
      if (config?.type === 'N-point' && pendingPoints.length >= 2) {
        finishNPoint(true);
        return;
      }

      finishActiveTool();
      setPendingPoints([]);
      setPreviewPoint(null);
      setActivelyDrawingId(null);
    }
  };

  if (!width || !height) return null;

  const isCursorTool = activeTool && ['cross', 'dot', 'arrow_cursor', 'eraser', 'magic', 'demonstration'].includes(activeTool);
  // As on TradingView: any drawing tool shows the crosshair (over drawings too, which don't
  // react while a tool is active); otherwise a drag keeps its cursor, a hovered drawing shows
  // the cursor for the part under the mouse (the Eraser keeps its own), and empty chart the
  // selected cursor mode's
  let cursorStyle: string;
  if (activeTool && !isCursorTool) cursorStyle = activeTool === 'zoom_in' ? 'zoom-in' : 'crosshair';
  else if (dragCursor) cursorStyle = dragCursor;
  else if (hoveredShapeId && hoverCursor && activeTool !== 'eraser') cursorStyle = hoverCursor;
  else cursorStyle = chartModeCursor(activeTool, theme).cursor;
  // Determine if we should capture events. We need to capture if drawing (and not a cursor tool) OR if a shape is selected (for dragging)
  // OR if we are currently editing a text overlay OR if multi-selecting OR if Ctrl is held (for starting Ctrl+drag) OR if a shape is
  // currently hovered: a shape's own resize handles (and its body, for whole-shape drag) only ever render while hovered or selected, so
  // without this the wrapper stayed pointer-events:none the whole time a shape was merely hovered (not yet clicked to select) and a real
  // mousedown on one of those very handles never reached Konva at all — it fell through to the chart underneath instead, same as a click
  // on empty space. That's what made grabbing a visible handle to resize a shape, without first clicking it to select it, unreliable: not
  // occasionally slow to register, but structurally unable to start a drag most of the time. This matches how every other drawing/vector
  // tool (this app's own TradingView model included) behaves: hovering a drawn object and starting to drag it moves/resizes that object,
  // not the canvas underneath.
  activeDrawingIdsRef.current = [selectedShapeId, hoveredShapeId, ...Array.from(selectedShapeIds)].filter((v): v is string => !!v);
  const shouldCaptureEvents = (activeTool !== null && !isCursorTool) || selectedShapeId !== null || editingTextId !== null || selectedShapeIds.size > 0 || isCtrlDragging || isCtrlPressed || isShiftMeasuring || isShiftPressed || hoveredShapeId !== null;

  // Wheel over the drawing layer (when it takes the mouse): the chart's own TradingView wheel.
  // A native non-passive listener — React's onWheel is passive and can't stop the page scroll.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !chart) return;
    const onWheel = (e: WheelEvent) => {
      if (applyChartWheel(chart, e, e.clientX - el.getBoundingClientRect().left)) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [chart]);

  // Anchor position/rotation for the text-edit overlay, frozen for the whole editing
  // session instead of recomputed on every DrawingLayer re-render. Depending only on
  // editingTextId (not chart/drawings) is deliberate: unrelated re-renders — hover
  // tracking's window mousemove listener fires on essentially every pointer move —
  // used to recompute this from the drawing's live coordinates each time, and for a
  // trendline that angle feeds a CSS rotate(); any sub-pixel jitter in x1/y1/x2/y2
  // between renders got amplified by that rotation into a visible shake while typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const editingOverlayGeometry = useMemo(() => {
    if (!editingTextId || !chart || !series) return null;
    const d = drawingsRef.current.find(x => x.id === editingTextId);
    if (!d || d.points.length === 0) return null;
    // Text & notes tools say where their own text sits
    const advText = ADVANCED_TOOLS[d.type]?.text;
    if (advText) {
      const p = d.points.map((q: any) => ({ x: logicalToPixel(chart, q.logical) || 0, y: priceToPixel(series, q.price) || 0 }));
      const g = advText.at({ p, d, key: editingTextKey ?? undefined });
      return { d, px: g.x, py: g.y, rot: 0, color: g.color, fontSize: g.fontSize };
    }
    if (d.type !== 'text' && !TEXT_LINE_TYPES.includes(d.type) && d.type !== 'rectangle' && d.type !== 'circle' && d.type !== 'ellipse') return null;

    let px = 0, py = 0, rot = 0;

    if (TEXT_LINE_TYPES.includes(d.type) && d.points.length === 2) {
      const x1 = logicalToPixel(chart, d.points[0].logical) || 0;
      const y1 = priceToPixel(series, d.points[0].price) || 0;
      const x2 = logicalToPixel(chart, d.points[1].logical) || 0;
      const y2 = priceToPixel(series, d.points[1].price) || 0;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
      rot = (angle > 90 || angle < -90) ? angle + 180 : angle;
      // TrendLine renders its own text/placeholder offset 10px "up" in the line's own
      // rotated local space (Konva's offsetY), not straight up on screen — matching
      // that rotated offset here is what stops a visible jump the instant you click
      // "+ Add text" and this HTML overlay replaces it at a different spot.
      const rotRad = (rot * Math.PI) / 180;
      px = mx + 10 * Math.sin(rotRad);
      py = my - 10 * Math.cos(rotRad);
    } else if (d.type === 'rectangle' && d.points.length === 2) {
      const x1 = logicalToPixel(chart, d.points[0].logical) || 0;
      const y1 = priceToPixel(series, d.points[0].price) || 0;
      const x2 = logicalToPixel(chart, d.points[1].logical) || 0;
      const y2 = priceToPixel(series, d.points[1].price) || 0;
      px = (x1 + x2) / 2;
      py = (y1 + y2) / 2;
    } else if (d.type === 'ellipse' && d.points.length >= 2) {
      // points[0]/points[1] are the ellipse's diameter endpoints, not its center
      const x1 = logicalToPixel(chart, d.points[0].logical) || 0;
      const y1 = priceToPixel(series, d.points[0].price) || 0;
      const x2 = logicalToPixel(chart, d.points[1].logical) || 0;
      const y2 = priceToPixel(series, d.points[1].price) || 0;
      px = (x1 + x2) / 2;
      py = (y1 + y2) / 2;
    } else {
      const p = d.points[0];
      px = logicalToPixel(chart, p.logical) || 0;
      py = priceToPixel(series, p.price) || 0;
    }

    return { d, px, py, rot, color: undefined as string | undefined, fontSize: undefined as number | undefined };
  }, [editingTextId, editingTextKey]);

  // Right after a registry tool is placed: notes start typing (as TradingView's do), Image asks
  // for a picture and Post / Idea for their link — dropping the drawing if that's cancelled
  const afterCreate = (tool: string, id: string, points: any[]) => {
    const adv = ADVANCED_TOOLS[tool];
    if (!adv) return;
    if (adv.text?.editOnCreate) { setEditingTextKey(null); setEditingTextId(id); }
    if (adv.content === 'post' || adv.content === 'idea') setLinkPrompt({ id, kind: adv.content });
    if (adv.content === 'image') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('cancel', () => deleteDrawing(id));
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { deleteDrawing(id); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const img = new window.Image();
          img.onload = () => {
            // stored scaled down (it travels with the layout), placed up to 300px across
            const scale = Math.min(1, 800 / Math.max(img.width, img.height));
            const cv = document.createElement('canvas');
            cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
            cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height);
            const data = cv.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9);
            const shown = Math.min(1, 300 / Math.max(img.width, img.height));
            const x0 = logicalToPixel(chart, points[0].logical), y0 = priceToPixel(series, points[0].price);
            if (x0 === null || y0 === null) return;
            const l1 = pixelToLogical(chart, x0 + img.width * shown), p1 = pixelToPrice(series, y0 + img.height * shown);
            if (l1 === null || p1 === null) return;
            updateDrawing(id, { imageData: data, points: [points[0], { logical: l1, price: p1 }] } as any);
          };
          img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
  };
  // The style a tool's drawing is created with; addDrawing layers the user's last-used
  // style for that tool on top. The live preview is built the same way.
  const toolBaseStyle = (tool: string): Record<string, any> => {
    const style: Record<string, any> = { stroke: '#e91e63', strokeWidth: 2 };
    if (tool === 'arrow_mark_up' || tool === 'arrow_mark_down') style.stroke = '#009688';
    if (tool === 'horizontal_ray' || TOOL_CONFIG[tool]?.type === 'N-point') style.stroke = '#2962ff';
    if (['ray', 'info_line', 'extended_line', 'trend_angle', 'horizontal_line', 'vertical_line', 'cross_line'].includes(tool)) style.stroke = '#2962ff';
    if (tool === 'fibonacci') style.fibLevels = DEFAULT_FIB_LEVELS;
    if (ADVANCED_TOOLS[tool]) { style.stroke = ADVANCED_TOOLS[tool].stroke; Object.assign(style, ADVANCED_TOOLS[tool].extra || {}); }
    if (tool === 'arc') style.fill = 'rgba(233, 30, 99, 0.2)';
    if (tool === 'path') style.lineEndStyle = 'Arrow';
    return style;
  };

  // The points a drawing is stored with, from the points the user placed
  const shapePoints = (tool: string, placed: any[]): any[] => {
    if (tool === 'curve' && placed.length === 2) return deriveCurvePoints(placed[0], placed[1]) ?? placed;
    if (tool === 'double_curve' && placed.length === 2) return deriveDoubleCurvePoints(placed[0], placed[1]) ?? placed;
    // A circle is stored like an ellipse — [center, right-edge point, top-edge point] — so
    // its horizontal radius is in bars and its vertical radius in price, and it stretches
    // with each axis on zoom. At creation it is exactly the circle the user dragged.
    if (tool === 'circle' && placed.length === 2) {
      const c = placed[0];
      const cx = logicalToPixel(chart, c.logical);
      const cy = priceToPixel(series, c.price);
      const ex = logicalToPixel(chart, placed[1].logical);
      const ey = priceToPixel(series, placed[1].price);
      if (cx === null || cy === null || ex === null || ey === null) return placed;
      const r = Math.hypot(ex - cx, ey - cy);
      const edgeLogical = pixelToLogical(chart, cx + r);
      const topPrice = pixelToPrice(series, cy - r);
      if (r < 1 || edgeLogical === null || topPrice === null) return placed;
      const fullData: any[] = (window as any).__chartFullData || [];
      const n = fullData.length;
      // Time at a fractional bar index, extrapolated past either end of the data
      const spacing = n > 1 ? (fullData[n - 1].time - fullData[0].time) / (n - 1) : 0;
      const timeAt = (l: number) => {
        if (n === 0) return (c as any).time;
        if (l <= 0) return fullData[0].time + l * spacing;
        if (l >= n - 1) return fullData[n - 1].time + (l - (n - 1)) * spacing;
        const i = Math.floor(l);
        return fullData[i].time + (l - i) * (fullData[i + 1].time - fullData[i].time);
      };
      return [
        c,
        { logical: edgeLogical, price: c.price, time: timeAt(edgeLogical) },
        { logical: c.logical, price: topPrice, time: (c as any).time },
      ];
    }
    return placed;
  };

  // The shape being drawn, exactly as it will be created (same style, same stored points),
  // so the preview matches the placed drawing
  const previewDrawing = (() => {
    if (!activeTool || pendingPoints.length === 0 || !previewPoint) return null;
    if (activeTool === 'measure' || activeTool === 'zoom_in' || TOOL_CONFIG[activeTool]?.type === 'continuous') return null;
    return {
      ...toolBaseStyle(activeTool),
      ...((defaultSettings as any)[activeTool] || {}),
      id: 'preview', type: activeTool, visible: true, locked: false,
      points: shapePoints(activeTool, [...pendingPoints, previewPoint]),
    } as any;
  })();

  // Renders a drawing as the chart shows it; the preview goes through here too
  const renderDrawing = (committed: any, asSelected = false) => {
            const drawing = liveEdit && liveEdit.id === committed.id ? { ...committed, ...liveEdit.updates } : committed;
            const isSel = asSelected || selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id);
            const adv = ADVANCED_TOOLS[drawing.type];
            if (adv) {
              return (
                <MultiPointTool
                  key={drawing.id}
                  id={drawing.id}
                  drawing={drawing}
                  points={drawing.points}
                  required={adv.points}
                  render={adv.render}
                  constrain={adv.constrain}
                  editingKey={editingTextId === drawing.id ? (editingTextKey ?? '') : null}
                  onEditText={adv.text ? (key) => { setSelectedShapeId(drawing.id); setEditingTextKey(key ?? null); setEditingTextId(drawing.id); } : undefined}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                />
              );
            }
            if (TREND_LINE_TYPES.includes(drawing.type)) {
              // Ray runs off to the right, Extended line both ways (each can be changed in settings)
              const t = drawing.type;
              return (
                <TrendLine 
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  stroke={drawing.stroke}
                  strokeWidth={drawing.strokeWidth}
                  lineStyle={drawing.lineStyle}
                  extendLeft={drawing.extendLeft ?? t === 'extended_line'}
                  extendRight={drawing.extendRight ?? (t === 'ray' || t === 'extended_line')}
                  infoStats={t === 'info_line'}
                  angleMark={t === 'trend_angle'}
                  allowText={t !== 'trend_angle'}
                  showMiddlePoint={drawing.showMiddlePoint}
                  showPriceLabels={drawing.showPriceLabels}
                  showStats={drawing.showStats}
                  statsPosition={drawing.statsPosition}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                  text={(drawing as any).text}
                  onTextEdit={() => setEditingTextId(drawing.id)}
                  isEditingText={editingTextId === drawing.id}
                />
              );
            } else if (drawing.type === 'rectangle') {
              return (
                <RectangleTool 
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  stroke={drawing.stroke}
                  strokeWidth={drawing.strokeWidth}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                  // New properties passed here
                  fill={drawing.fill}
                  backgroundVisible={(drawing as any).backgroundVisible}
                  text={(drawing as any).text}
                  onTextEdit={() => setEditingTextId(drawing.id)}
                  isEditingText={editingTextId === drawing.id}
                  textColor={(drawing as any).textColor}
                  fontSize={(drawing as any).fontSize}
                  bold={(drawing as any).bold}
                  italic={(drawing as any).italic}
                  textAlign={(drawing as any).textAlign}
                  textVerticalAlign={(drawing as any).textVerticalAlign}
                  middleLineVisible={(drawing as any).middleLineVisible}
                  middleLineColor={(drawing as any).middleLineColor}
                  middleLineStyle={(drawing as any).middleLineStyle}
                  extendLeft={(drawing as any).extendLeft}
                  extendRight={(drawing as any).extendRight}
                  lineStyle={(drawing as any).lineStyle}
                />
              );
            } else if (drawing.type === 'text') {
              return (
                <TextTool 
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  stroke={drawing.stroke}
                  // @ts-ignore
                  text={drawing.text}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdateText={(newText) => updateDrawing(drawing.id, { text: newText } as any)}
                  onEdit={() => setEditingTextId(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  initialBarWidth={(drawing as any).initialBarWidth}
                  isLocked={drawing.locked}
                  fontSize={(drawing as any).fontSize}
                  textColor={(drawing as any).textColor}
                  bold={(drawing as any).bold}
                  italic={(drawing as any).italic}
                  showBackground={(drawing as any).showBackground}
                  backgroundColor={(drawing as any).backgroundColor}
                  backgroundOpacity={(drawing as any).backgroundOpacity}
                  showBorder={(drawing as any).showBorder}
                  borderColor={(drawing as any).borderColor}
                  textWrap={(drawing as any).textWrap}
                />
              );
            } else if (drawing.type === 'long_position') {
              return (
                <LongPositionTool
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  targetFillColor={drawing.targetFillColor}
                  stopFillColor={drawing.stopFillColor}
                  textColor={drawing.textColor}
                  fontSize={drawing.fontSize}
                  showPriceLabels={drawing.showPriceLabels}
                  alwaysShowStats={drawing.alwaysShowStats}
                  accountSize={drawing.accountSize}
                  lotSize={drawing.lotSize}
                  risk={drawing.risk}
                  riskType={drawing.riskType}
                  qtyPrecision={drawing.qtyPrecision}
                />
              );
            } else if (drawing.type === 'short_position') {
              return (
                <ShortPositionTool
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  targetFillColor={drawing.targetFillColor}
                  stopFillColor={drawing.stopFillColor}
                  textColor={drawing.textColor}
                  fontSize={drawing.fontSize}
                  showPriceLabels={drawing.showPriceLabels}
                  alwaysShowStats={drawing.alwaysShowStats}
                  accountSize={drawing.accountSize}
                  lotSize={drawing.lotSize}
                  risk={drawing.risk}
                  riskType={drawing.riskType}
                  qtyPrecision={drawing.qtyPrecision}
                />
              );
            } else if (drawing.type === 'fibonacci') {
              return (
                <FibonacciTool 
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  stroke={drawing.stroke}
                  strokeWidth={drawing.strokeWidth}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                  showTrendLine={(drawing as any).showTrendLine}
                  trendLineColor={(drawing as any).trendLineColor}
                  trendLineStyle={(drawing as any).trendLineStyle}
                  trendLineWidth={(drawing as any).trendLineWidth}
                  fibLevels={(drawing as any).fibLevels}
                  useOneColor={(drawing as any).useOneColor}
                  oneColor={(drawing as any).oneColor}
                  extendLeft={(drawing as any).extendLeft}
                  extendRight={(drawing as any).extendRight}
                  levelsLineWidth={(drawing as any).levelsLineWidth}
                  levelsLineStyle={(drawing as any).levelsLineStyle}
                  showBackground={(drawing as any).showBackground}
                  backgroundOpacity={(drawing as any).backgroundOpacity}
                  fibReverse={(drawing as any).fibReverse}
                  fibShowLevels={(drawing as any).fibShowLevels}
                  fibLevelFormat={(drawing as any).fibLevelFormat}
                  fibPrices={(drawing as any).fibPrices}
                  fibShowText={(drawing as any).fibShowText}
                  fibLabelHAlign={(drawing as any).fibLabelHAlign}
                  fibLabelVAlign={(drawing as any).fibLabelVAlign}
                  fibFontSize={(drawing as any).fibFontSize}
                />
              );
            } else if (drawing.type === 'brush') {
              return (
                <BrushTool 
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  stroke={drawing.stroke}
                  strokeWidth={drawing.strokeWidth}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                />
              );
            } else if (drawing.type === 'measure') {
              return (
                <MeasureTool key={drawing.id} id={drawing.id} points={drawing.points} chart={chart} series={series} />
              );
            } else if (drawing.type === 'highlighter') {
              return (
                <HighlighterTool key={drawing.id} id={drawing.id} points={drawing.points} stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} isSelected={isSel} isHovering={hoveredShapeId === drawing.id} chart={chart} series={series} onSelect={() => selectDrawing(drawing.id)} onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} isLocked={drawing.locked} />
              );
            } else if (drawing.type === 'arrow_marker') {
              return (
                <ArrowMarkerTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  strokeWidth={drawing.strokeWidth} 
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => selectDrawing(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  text={drawing.text}
                  textColor={drawing.textColor}
                  fontSize={drawing.fontSize}
                  bold={drawing.bold}
                  italic={drawing.italic}
                  isLocked={drawing.locked}
                />
              );
            } else if (drawing.type === 'arrow') {
              return (
                <ArrowTool key={drawing.id} id={drawing.id} points={drawing.points} stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} lineStyle={(drawing as any).lineStyle} extendLeft={(drawing as any).extendLeft} extendRight={(drawing as any).extendRight} isSelected={isSel} isHovering={hoveredShapeId === drawing.id} chart={chart} series={series} onSelect={() => selectDrawing(drawing.id)} onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} isLocked={drawing.locked} />
              );
            } else if (drawing.type === 'arrow_mark_up' || drawing.type === 'arrow_mark_down') {
              return (
                <ArrowIconTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id} 
                  type={drawing.type}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  text={drawing.text}
                  textColor={drawing.textColor}
                  fontSize={drawing.fontSize}
                  bold={drawing.bold}
                  italic={drawing.italic}
                  isLocked={drawing.locked}
                />
              );
            } else if (drawing.type === 'rotated_rectangle') {
              return (
                <RotatedRectangleTool key={drawing.id} id={drawing.id} points={drawing.points} stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} isSelected={isSel} isHovering={hoveredShapeId === drawing.id} chart={chart} series={series} onSelect={() => selectDrawing(drawing.id)} onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} isLocked={drawing.locked} />
              );
            } else if (drawing.type === 'path') {
              return (
                <PathTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  strokeWidth={drawing.strokeWidth} 
                  lineStyle={(drawing as any).lineStyle} 
                  lineStartStyle={(drawing as any).lineStartStyle}
                  lineEndStyle={(drawing as any).lineEndStyle}
                  fill={drawing.fill}
                  backgroundVisible={(drawing as any).backgroundVisible}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => selectDrawing(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
                  hideLastHandle={drawing.id === 'preview'}
                />
              );
            } else if (drawing.type === 'polyline') {
              return (
                <PolylineTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  strokeWidth={drawing.strokeWidth} 
                  lineStyle={(drawing as any).lineStyle}
                  lineStartStyle={(drawing as any).lineStartStyle}
                  lineEndStyle={(drawing as any).lineEndStyle}
                  fill={drawing.fill}
                  backgroundVisible={(drawing as any).backgroundVisible}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => selectDrawing(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
                />
              );
            } else if (drawing.type === 'circle') {
              return (
                <CircleTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  strokeWidth={drawing.strokeWidth} 
                  fill={drawing.fill}
                  backgroundVisible={(drawing as any).backgroundVisible}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                  text={(drawing as any).text}
                  onTextEdit={() => setEditingTextId(drawing.id)}
                  isEditingText={editingTextId === drawing.id}
                  textColor={(drawing as any).textColor}
                  fontSize={(drawing as any).fontSize}
                />
              );
            } else if (drawing.type === 'ellipse') {
              return (
                <EllipseTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  strokeWidth={drawing.strokeWidth} 
                  fill={drawing.fill}
                  backgroundVisible={(drawing as any).backgroundVisible}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                  text={(drawing as any).text}
                  onTextEdit={() => setEditingTextId(drawing.id)}
                  isEditingText={editingTextId === drawing.id}
                  textColor={(drawing as any).textColor}
                  fontSize={(drawing as any).fontSize}
                />
              );
            } else if (drawing.type === 'triangle') {
              return (
                <TriangleTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  strokeWidth={drawing.strokeWidth} 
                  fill={drawing.fill}
                  backgroundVisible={(drawing as any).backgroundVisible}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => selectDrawing(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
                />
              );
            } else if (drawing.type === 'arc') {
              return (
                <ArcTool key={drawing.id} id={drawing.id} points={drawing.points} stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} fill={(drawing as any).fill} isSelected={isSel} isHovering={hoveredShapeId === drawing.id} chart={chart} series={series} onSelect={() => selectDrawing(drawing.id)} onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} isLocked={drawing.locked} />
              );
            } else if (drawing.type === 'curve') {
              return (
                <CurveTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  strokeWidth={drawing.strokeWidth} 
                  lineStyle={(drawing as any).lineStyle}
                  fill={drawing.fill}
                  fillEnabled={(drawing as any).fillEnabled}
                  lineStartStyle={(drawing as any).lineStartStyle}
                  lineEndStyle={(drawing as any).lineEndStyle}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => selectDrawing(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
                />
              );
            } else if (drawing.type === 'double_curve') {
              return (
                <DoubleCurveTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  strokeWidth={drawing.strokeWidth} 
                  lineStyle={(drawing as any).lineStyle}
                  fill={drawing.fill}
                  fillEnabled={(drawing as any).fillEnabled}
                  lineStartStyle={(drawing as any).lineStartStyle}
                  lineEndStyle={(drawing as any).lineEndStyle}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => selectDrawing(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
                />
              );
            } else if (drawing.type === 'horizontal_line' || drawing.type === 'vertical_line' || drawing.type === 'cross_line') {
              return (
                <InfiniteLineTool
                  key={drawing.id}
                  id={drawing.id}
                  kind={drawing.type}
                  points={drawing.points}
                  stroke={drawing.stroke}
                  strokeWidth={drawing.strokeWidth}
                  lineStyle={(drawing as any).lineStyle}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                />
              );
            } else if (drawing.type === 'horizontal_ray') {
              return (
                <HorizontalRayTool
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  stroke={drawing.stroke}
                  strokeWidth={drawing.strokeWidth}
                  lineStyle={(drawing as any).lineStyle}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                  text={(drawing as any).text}
                  textColor={(drawing as any).textColor}
                  fontSize={(drawing as any).fontSize}
                  bold={(drawing as any).bold}
                  italic={(drawing as any).italic}
                  textVAlign={(drawing as any).textVAlign}
                  textHAlign={(drawing as any).textHAlign}
                  priceLabel={(drawing as any).priceLabel}
                />
              );
            } else if (drawing.type === 'emoji') {
              return (
                <EmojiTool
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  emojiChar={drawing.emojiChar || '😀'}
                  scaleX={drawing.scaleX}
                  scaleY={drawing.scaleY}
                  rotation={drawing.rotation}
                  initialBarWidth={drawing.initialBarWidth}
                  isSelected={isSel} isHovering={hoveredShapeId === drawing.id}
                  chart={chart}
                  series={series}
                  onSelect={() => selectDrawing(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  onUpdateScale={(scaleX, scaleY, rotation) => updateDrawing(drawing.id, { scaleX, scaleY, rotation })}
                  isLocked={drawing.locked}
                  emojiSize={(drawing as any).emojiSize}
                  color={drawing.stroke}
                />
              );
            }
            return null;
  };

  return (
    <>
    <div 
      ref={wrapperRef}
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        // LWC time scale is ~26px high, right price scale is ~60px wide
        width: 'calc(100% - 60px)', 
        height: 'calc(100% - 26px)', 
        zIndex: 10, 
        pointerEvents: shouldCaptureEvents ? 'auto' : 'none', 
        cursor: cursorStyle 
      }}
    >
      <Stage
        width={width - 60}
        height={height - 26}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleDblClick}
        onContextMenu={handleContextMenu}
        ref={stageRef}
      >
        <Layer ref={layerRef}>
          {/* Active stroke (being drawn) */}
          {activelyDrawingId && activeStrokePoints.length >= 2 && activeStrokeConfig && (
            activeStrokeConfig.type === 'brush' ? (
              <BrushTool
                id={activelyDrawingId}
                points={activeStrokePoints}
                stroke={activeStrokeConfig.stroke}
                strokeWidth={activeStrokeConfig.strokeWidth}
                isSelected={false}
                chart={chart}
                series={series}
                onSelect={() => {}}
              />
            ) : (
              <HighlighterTool
                id={activelyDrawingId}
                points={activeStrokePoints}
                stroke={activeStrokeConfig.stroke}
                strokeWidth={activeStrokeConfig.strokeWidth}
                isSelected={false}
                chart={chart}
                series={series}
                onSelect={() => {}}
              />
            )
          )}

          {drawings.filter(d => d.visible).map(d => renderDrawing(d))}

          {previewDrawing && <Group listening={false}>{renderDrawing(previewDrawing, true)}</Group>}

          {(activeTool === 'measure' || isShiftMeasuring) && pendingPoints.length > 0 && previewPoint && (
            <MeasureTool 
              id="preview"
              points={[pendingPoints[0], previewPoint]}
              chart={chart}
              series={series}
            />
          )}


          {activeTool === 'zoom_in' && pendingPoints.length > 0 && previewPoint && (() => {
            const px1 = logicalToPixel(chart, pendingPoints[0].logical);
            const py1 = priceToPixel(series, pendingPoints[0].price);
            const px2 = logicalToPixel(chart, previewPoint.logical);
            const py2 = priceToPixel(series, previewPoint.price);
            if (px1 !== null && py1 !== null && px2 !== null && py2 !== null) {
              const startX = Math.min(px1, px2);
              const startY = Math.min(py1, py2);
              const w = Math.abs(px2 - px1);
              const h = Math.abs(py2 - py1);
              return (
                <KonvaRect
                  x={startX}
                  y={startY}
                  width={w}
                  height={h}
                  fill="rgba(41, 98, 255, 0.2)"
                  stroke="#2962ff"
                  strokeWidth={1}
                  listening={false}
                />
              );
            }
            return null;
          })()}




          {/* Ctrl+drag selection rectangle */}
          {selectionRect && (
            <KonvaRect
              x={Math.min(selectionRect.startX, selectionRect.endX)}
              y={Math.min(selectionRect.startY, selectionRect.endY)}
              width={Math.abs(selectionRect.endX - selectionRect.startX)}
              height={Math.abs(selectionRect.endY - selectionRect.startY)}
              fill="rgba(41, 98, 255, 0.08)"
              stroke="#2962ff"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {editingTextId && editingOverlayGeometry && (() => {
        const { d, px, py, rot } = editingOverlayGeometry;
        const cell = editingTextKey ? editingTextKey.split(',').map(Number) : null;
        const cells: string[][] | null = cell ? ((d as any).cells || [['', '', ''], ['', '', ''], ['', '', '']]) : null;
        return (
          <TextEditorOverlay
            key={`${editingTextId}-${editingTextKey ?? ''}`}
            initialText={cells && cell ? cells[cell[0]][cell[1]] : (d as any).text || ''}
            x={px}
            y={py}
            rotation={TEXT_LINE_TYPES.includes(d.type) ? rot : (d.type === 'rectangle' || d.type === 'circle' || d.type === 'ellipse') ? 0 : undefined}
            color={editingOverlayGeometry.color || (d as any).textColor || d.stroke}
            fontSize={editingOverlayGeometry.fontSize || (d as any).fontSize || 14}
            onCommit={(newText) => {
              if (cells && cell) {
                // a table cell
                const next = cells.map(r => [...r]);
                next[cell[0]][cell[1]] = newText;
                updateDrawing(editingTextId, { cells: next } as any);
                setSelectedShapeId(editingTextId);
              } else if (newText.trim() === '' && d.type === 'text') {
                deleteDrawing(editingTextId);
              } else {
                updateDrawing(editingTextId, { text: newText } as any);
                setSelectedShapeId(editingTextId);
              }
              setEditingTextId(null);
              setEditingTextKey(null);
            }}
            onCancel={() => {
              if (((d as any).text || '').trim() === '' && d.type === 'text') {
                deleteDrawing(editingTextId);
              }
              setEditingTextId(null);
              setEditingTextKey(null);
            }}
          />
        );
      })()}
      {linkPrompt && (
        <LinkPromptDialog
          kind={linkPrompt.kind}
          onSubmit={(url) => { updateDrawing(linkPrompt.id, { url } as any); setLinkPrompt(null); }}
          onCancel={() => { deleteDrawing(linkPrompt.id); setLinkPrompt(null); }}
        />
      )}
    </div>
    {/* Price / time axis labels and bands for the selected drawing (and positions' levels) */}
    {!allDrawingsHidden && (
      <AxisHighlights
        chart={chart}
        series={series}
        drawings={drawings.filter(d => d.visible).map(d => (liveEdit && liveEdit.id === d.id ? { ...d, ...liveEdit.updates } : d)) as any}
        selectedIds={[selectedShapeId, ...Array.from(selectedShapeIds)].filter((v): v is string => !!v)}
        width={width}
        height={height}
      />
    )}
    </>
  );
}
