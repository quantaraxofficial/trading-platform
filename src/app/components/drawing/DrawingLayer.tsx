"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect as KonvaRect } from 'react-konva';
import { useDrawing } from './core/DrawingContext';
import { pixelToLogical, pixelToPrice, logicalToPixel, priceToPixel } from './core/coordinates';
import { TrendLine } from './tools/TrendLine';
import { RectangleTool } from './tools/Rectangle';
import { TextTool } from './tools/Text';
import { FibonacciTool } from './tools/Fibonacci';
import { DEFAULT_FIB_LEVELS } from './ui/FibonacciSettingsModal';
import { BrushTool } from './tools/BrushTool';
import { MeasureTool } from './tools/MeasureTool';
import { RotatedRectangleTool } from './tools/RotatedRectangleTool';
import { PathTool } from './tools/PathTool';
import { PolylineTool } from './tools/PolylineTool';
import { CircleTool } from './tools/CircleTool';
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
import { EmojiTool } from './tools/EmojiTool';
import { TextEditorOverlay } from './ui/TextEditorOverlay';

interface DrawingLayerProps {
  chart: any;
  series: any;
  width: number;
  height: number;
}

export default function DrawingLayer({ chart, series, width, height }: DrawingLayerProps) {
  const { activeTool, setActiveTool, drawings, setDrawings, addDrawing, selectedShapeId, setSelectedShapeId, updateDrawing, deleteDrawing, activeEmoji, selectedShapeIds, setSelectedShapeIds, clearSelection, magnetMode, defaultSettings } = useDrawing();
  const stageRef = useRef<any>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [activelyDrawingId, setActivelyDrawingId] = useState<string | null>(null);
  const [activeStrokePoints, setActiveStrokePoints] = useState<{ logical: number; price: number }[]>([]);
  const [activeStrokeConfig, setActiveStrokeConfig] = useState<{ stroke: string, strokeWidth: number, type: string } | null>(null);

  // Ctrl+drag selection rectangle state
  const [selectionRect, setSelectionRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [isCtrlDragging, setIsCtrlDragging] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // Refs for Ctrl+Shift so callbacks always see fresh key state (updated synchronously in key handlers)
  const ctrlRef = useRef(false);
  const shiftRef = useRef(false);

  // Track which drawings have already been cloned in the current drag to avoid duplicates
  const clonedDrawingIds = useRef<Set<string>>(new Set());

  // Ctrl+Shift+Drag: clone a drawing at its original position, then let the drag move the original
  const handleUpdateWithClone = useCallback((drawingId: string, updates: Partial<any>) => {
    if (ctrlRef.current && shiftRef.current && !clonedDrawingIds.current.has(drawingId)) {
      const original = drawings.find(d => d.id === drawingId);
      if (original) {
        const cloneId = Math.random().toString(36).substring(2, 10);
        const clone = { ...original, id: cloneId };
        clonedDrawingIds.current.add(drawingId);
        setDrawings(prev => [...prev, clone]);
      }
    }
    updateDrawing(drawingId, updates);
  }, [drawings, updateDrawing, setDrawings]);

  // Clear cloned tracking when a new drag starts
  useEffect(() => {
    const handleMouseDown = () => { clonedDrawingIds.current.clear(); };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // We need to trigger a re-render when the chart is panned or zoomed
  // so that the Konva shapes stick to the chart coordinates.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!chart) return;
    const update = () => setTick(t => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(update);
    chart.timeScale().subscribeVisibleLogicalRangeChange(update);
    // The price scale (manual zoom via the axis, mode/invert/autoscale toggles) has no
    // subscribe-to-change API of its own — ChartContainer dispatches this event whenever
    // it mutates the price scale so shapes stay pinned to the chart in real time instead
    // of only catching up whenever some unrelated re-render happens to follow.
    window.addEventListener('tv-price-scale-changed', update);

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
          }
          return;
        }
      }
      console.log('[DrawingLayer] No shape found at click pos, clearing selection');
      setSelectedShapeId(null);
    };
    
    chart.subscribeClick(handleChartClick);

    // Track Ctrl and Shift keys to allow starting a selection drag or measure drag
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.ctrlKey) { setIsCtrlPressed(true); ctrlRef.current = true; }
      if (e.key === 'Shift' || e.shiftKey) { setIsShiftPressed(true); shiftRef.current = true; }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || !e.ctrlKey) { setIsCtrlPressed(false); ctrlRef.current = false; }
      if (e.key === 'Shift' || !e.shiftKey) { setIsShiftPressed(false); shiftRef.current = false; }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(update);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(update);
      window.removeEventListener('tv-price-scale-changed', update);
      chart.unsubscribeClick(handleChartClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [chart, activeTool, setSelectedShapeId]);

  const [pendingPoints, setPendingPoints] = useState<{ logical: number; price: number }[]>([]);
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
    horizontal_line: { type: 'click-point', maxPoints: 2 },
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
    
    brush: { type: 'continuous' },
    highlighter: { type: 'continuous' },
  };

  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    // Ctrl+drag to start a selection rectangle (but NOT Ctrl+Shift which is clone-drag)
    if (e.evt?.ctrlKey && !e.evt?.shiftKey && (!activeTool || ['cross', 'dot', 'arrow_cursor', 'eraser', 'magic', 'demonstration'].includes(activeTool))) {
      setIsCtrlDragging(true);
      setSelectionRect({ startX: pointerPos.x, startY: pointerPos.y, endX: pointerPos.x, endY: pointerPos.y });
      setSelectedShapeId(null);
      clearSelection();
      return;
    }

    // Shift+drag to start the measure tool
    if (e.evt?.shiftKey && (!activeTool || ['cross', 'dot', 'arrow_cursor', 'eraser', 'magic', 'demonstration'].includes(activeTool))) {
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

    let rawLogical = pixelToLogical(chart, pointerPos.x);
    let rawPrice = pixelToPrice(series, pointerPos.y);
    let rawTime = chart.timeScale().coordinateToTime(pointerPos.x) || null;
    
    // Interpolate exact time for fractional logical coordinates to preserve visual alignment across timeframes
    if (rawLogical !== null) {
      const fullData = (window as any).__chartFullData || [];
      const index1 = Math.floor(rawLogical);
      const index2 = index1 + 1;
      if (index1 >= 0 && index2 < fullData.length) {
        const time1 = fullData[index1].time;
        const time2 = fullData[index2].time;
        const fraction = rawLogical - index1;
        rawTime = time1 + fraction * (time2 - time1);
      } else if (index1 >= fullData.length - 1 && fullData.length >= 2) {
        const lastTime = fullData[fullData.length - 1].time;
        const prevTime = fullData[fullData.length - 2].time;
        const diff = lastTime - prevTime;
        const fraction = rawLogical - (fullData.length - 1);
        rawTime = lastTime + fraction * diff;
      }
    }

    if (rawLogical === null || rawPrice === null) return;

    // Apply Magnet Mode Snapping
    const isMagnetActive = (magnetMode !== 'off' && !isCtrlPressed) || (magnetMode === 'off' && isCtrlPressed);
    const effectiveMagnetMode = isMagnetActive ? (magnetMode === 'weak' && !isCtrlPressed ? 'weak' : 'strong') : 'off';

    let logical = rawLogical;
    let price = rawPrice;
    let time = rawTime;

    if (effectiveMagnetMode !== 'off') {
      const fullData = (window as any).__chartFullData || [];
      const roundedLogical = Math.round(logical);
      
      if (roundedLogical >= 0 && roundedLogical < fullData.length) {
        const candle = fullData[roundedLogical];
        if (candle) {
          const pixelY = pointerPos.y;
          const oY = priceToPixel(series, candle.open) ?? pixelY;
          const hY = priceToPixel(series, candle.high) ?? pixelY;
          const lY = priceToPixel(series, candle.low) ?? pixelY;
          const cY = priceToPixel(series, candle.close) ?? pixelY;
          
          const dists = [
            { val: candle.open, dist: Math.abs(pixelY - oY) },
            { val: candle.high, dist: Math.abs(pixelY - hY) },
            { val: candle.low, dist: Math.abs(pixelY - lY) },
            { val: candle.close, dist: Math.abs(pixelY - cY) }
          ];
          
          dists.sort((a, b) => a.dist - b.dist);
          const closest = dists[0];
          
          if (effectiveMagnetMode === 'strong' || (effectiveMagnetMode === 'weak' && closest.dist < 30)) {
            logical = roundedLogical;
            price = closest.val;
            time = candle.time;
          }
        }
      }
    }

    // Every shape's points always snap horizontally to the nearest candle's own center
    // (its wick midline), independent of the Magnet Mode toggle — price stays fully free
    // so the point can still be placed anywhere along that vertical line. Continuous
    // freehand tools (brush/highlighter) are excluded — snapping would make strokes look
    // steppy instead of smooth.
    if (activeTool && activeTool !== 'brush' && activeTool !== 'highlighter') {
      const fullData = (window as any).__chartFullData || [];
      const snappedLogical = Math.round(rawLogical);
      if (snappedLogical >= 0 && snappedLogical < fullData.length) {
        logical = snappedLogical;
        price = rawPrice;
        time = fullData[snappedLogical].time;
      }
    }

    // Trend line: holding Shift while placing the second point locks the line to
    // perfectly horizontal (same price as the first point).
    if (activeTool === 'trendline' && pendingPoints.length === 1 && e.evt?.shiftKey) {
      price = pendingPoints[0].price;
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
            stroke: '#000000',
            strokeWidth: 1,
            points: newPoints,
            emojiChar: activeEmoji || '😀',
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            initialBarWidth
          });
          setSelectedShapeId(newId);
          setActiveTool(null);
        } else {
          let finalPoints = newPoints;
          if (activeTool === 'double_curve' && newPoints.length === 2) {
            const start = newPoints[0];
            const end = newPoints[1];
            const x1 = logicalToPixel(chart, start.logical);
            const y1 = priceToPixel(series, start.price);
            const x2 = logicalToPixel(chart, end.logical);
            const y2 = priceToPixel(series, end.price);
            if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
              const dx = x2 - x1;
              const dy = y2 - y1;
              const chord = Math.hypot(dx, dy);
              if (chord >= 1) {
                const perpX = -dy / chord;
                const perpY = dx / chord;
                // To match the user's image, we need a more pronounced S-shape
                // We'll place the control points at 1/4 and 3/4 along the chord
                // and push them out further (bulge)
                const bulge = chord * 0.6; 
                const t1x = x1 + dx * 0.25 + perpX * bulge;
                const t1y = y1 + dy * 0.25 + perpY * bulge;
                const t2x = x1 + dx * 0.75 - perpX * bulge;
                const t2y = y1 + dy * 0.75 - perpY * bulge;
                
                const t1logical = pixelToLogical(chart, t1x);
                const t1price = pixelToPrice(series, t1y);
                const t2logical = pixelToLogical(chart, t2x);
                const t2price = pixelToPrice(series, t2y);
                
                if (t1logical !== null && t1price !== null && t2logical !== null && t2price !== null) {
                  finalPoints = [start, { logical: t1logical, price: t1price }, { logical: t2logical, price: t2price }, end];
                }
              }
            }
          }
          
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
            
            additionalProps = {
              quantity: 57,
              openPnL: isLong ? 4.660 : -4.660,
              textColor: '#ffffff',
              targetFillColor: "rgba(76, 175, 80, 0.3)",
              stopFillColor: "rgba(244, 67, 54, 0.3)",
            };
          }

          if (activeTool === 'fibonacci') {
            // Seed the same 24-level defaults the settings modal displays, so a freshly
            // drawn fib renders identically to what the Style tab shows before any edits.
            additionalProps = {
              fibLevels: DEFAULT_FIB_LEVELS,
            };
          }

          if (activeTool === 'curve' && newPoints.length === 2) {
            const start = newPoints[0];
            const end = newPoints[1];
            const x1 = logicalToPixel(chart, start.logical);
            const y1 = priceToPixel(series, start.price);
            const x2 = logicalToPixel(chart, end.logical);
            const y2 = priceToPixel(series, end.price);
            if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2 - 20; // Default bulge
              const mLogical = pixelToLogical(chart, mx);
              const mPrice = pixelToPrice(series, my);
              if (mLogical !== null && mPrice !== null) {
                finalPoints = [start, end, { logical: mLogical, price: mPrice }];
              }
            }
          }

          if (activeTool === 'arc') {
            additionalProps = {
              fill: 'rgba(233, 30, 99, 0.2)'
            };
          }

          if (activeTool === 'zoom_in') {
            const logical1 = finalPoints[0].logical;
            const logical2 = finalPoints[1].logical;
            if (logical1 !== null && logical2 !== null) {
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
          const isMarkup = activeTool === 'arrow_mark_up' || activeTool === 'arrow_mark_down';
          
          console.log(`[DrawingCreated] type=${activeTool} id=${newId}`);
          finalPoints.forEach((p: any, i: number) => {
            console.log(`  point[${i}]: logical=${p.logical}, price=${p.price}, time=${p.time} (${p.time ? new Date(p.time * 1000).toISOString() : 'none'})`);
          });

          addDrawing({
            id: newId,
            type: activeTool as any,
            visible: true,
            locked: false,
            stroke: isMarkup ? '#009688' : '#e91e63', // matching the pinkish theme for arc
            strokeWidth: 2,
            points: finalPoints,
            ...additionalProps
          });
          setSelectedShapeId(newId);
        }
        setPendingPoints([]);
        setPreviewPoint(null);
        setActiveTool(null);
      } else {
        setPendingPoints(newPoints);
      }
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    let rawLogical = pixelToLogical(chart, pointerPos.x);
    let rawPrice = pixelToPrice(series, pointerPos.y);
    let rawTime = chart.timeScale().coordinateToTime(pointerPos.x) || null;
    
    if (rawLogical === null || rawPrice === null) return;

    // Apply Magnet Mode Snapping
    const isMagnetActive = (magnetMode !== 'off' && !isCtrlPressed) || (magnetMode === 'off' && isCtrlPressed);
    const effectiveMagnetMode = isMagnetActive ? (magnetMode === 'weak' && !isCtrlPressed ? 'weak' : 'strong') : 'off';

    let logical = rawLogical;
    let price = rawPrice;
    let time = rawTime;

    if (effectiveMagnetMode !== 'off') {
      const fullData = (window as any).__chartFullData || [];
      const roundedLogical = Math.round(logical);
      
      if (roundedLogical >= 0 && roundedLogical < fullData.length) {
        const candle = fullData[roundedLogical];
        if (candle) {
          const pixelY = pointerPos.y;
          const oY = priceToPixel(series, candle.open) ?? pixelY;
          const hY = priceToPixel(series, candle.high) ?? pixelY;
          const lY = priceToPixel(series, candle.low) ?? pixelY;
          const cY = priceToPixel(series, candle.close) ?? pixelY;
          
          const dists = [
            { val: candle.open, dist: Math.abs(pixelY - oY) },
            { val: candle.high, dist: Math.abs(pixelY - hY) },
            { val: candle.low, dist: Math.abs(pixelY - lY) },
            { val: candle.close, dist: Math.abs(pixelY - cY) }
          ];
          
          dists.sort((a, b) => a.dist - b.dist);
          const closest = dists[0];
          
          if (effectiveMagnetMode === 'strong' || (effectiveMagnetMode === 'weak' && closest.dist < 30)) {
            logical = roundedLogical;
            price = closest.val;
            time = candle.time;
          }
        }
      }
    }

    // Every shape's points always snap horizontally to the nearest candle's own center
    // (its wick midline), independent of the Magnet Mode toggle — price stays fully free
    // so the point can still be placed anywhere along that vertical line. Continuous
    // freehand tools (brush/highlighter) are excluded — snapping would make strokes look
    // steppy instead of smooth.
    if (activeTool && activeTool !== 'brush' && activeTool !== 'highlighter') {
      const fullData = (window as any).__chartFullData || [];
      const snappedLogical = Math.round(rawLogical);
      if (snappedLogical >= 0 && snappedLogical < fullData.length) {
        logical = snappedLogical;
        price = rawPrice;
        time = fullData[snappedLogical].time;
      }
    }

    // Trend line: holding Shift while placing the second point locks the live preview
    // to perfectly horizontal (same price as the first point).
    if (activeTool === 'trendline' && pendingPoints.length === 1 && e.evt?.shiftKey) {
      price = pendingPoints[0].price;
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

  const handleDblClick = () => {
    if (!activeTool) return;
    const config = TOOL_CONFIG[activeTool];
    if (config?.type === 'N-point' && pendingPoints.length >= 2) {
      addDrawing({
        id: `${activeTool}-${Date.now()}`,
        type: activeTool as any,
        visible: true,
        locked: false,
        stroke: '#2962ff',
        strokeWidth: 2,
        points: pendingPoints
      });
      setPendingPoints([]);
      setPreviewPoint(null);
      setActiveTool(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (!activeTool) return;
        const config = TOOL_CONFIG[activeTool];
        if (config?.type === 'N-point' && pendingPoints.length >= 2) {
          addDrawing({
            id: `${activeTool}-${Date.now()}`,
            type: activeTool as any,
            visible: true,
            locked: false,
            stroke: '#2962ff',
            strokeWidth: 2,
            points: pendingPoints
          });
          setPendingPoints([]);
          setPreviewPoint(null);
          setActiveTool(null);
        }
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
      
      // For N-point tools (like Path/Polyline), right-click FINISHES the drawing
      if (config?.type === 'N-point' && pendingPoints.length >= 2) {
        addDrawing({
          id: `${activeTool}-${Date.now()}`,
          type: activeTool as any,
          visible: true,
          locked: false,
          stroke: '#2962ff',
          strokeWidth: 2,
          points: pendingPoints
        });
      }

      setActiveTool(null);
      setPendingPoints([]);
      setPreviewPoint(null);
      setActivelyDrawingId(null);
    }
  };

  if (!width || !height) return null;

  let cursorStyle = 'default';
  if (activeTool === 'text') {
    cursorStyle = 'text';
  } else if (activeTool) {
    cursorStyle = 'crosshair';
  }

  const isCursorTool = activeTool && ['cross', 'dot', 'arrow_cursor', 'eraser', 'magic', 'demonstration'].includes(activeTool);
  // Determine if we should capture events. We need to capture if drawing (and not a cursor tool) OR if a shape is selected (for dragging)
  // OR if we are currently editing a text overlay OR if multi-selecting OR if Ctrl is held (for starting Ctrl+drag)
  const shouldCaptureEvents = (activeTool !== null && !isCursorTool) || selectedShapeId !== null || editingTextId !== null || selectedShapeIds.size > 0 || isCtrlDragging || isCtrlPressed || isShiftMeasuring || isShiftPressed;

  // Forward wheel events to the underlying chart so the user can zoom/scroll
  // while a drawing tool is still active.
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!chart) return;

    const timeScale = chart.timeScale();
    const logicalRange = timeScale.getVisibleLogicalRange();
    if (!logicalRange) return;

    const rangeSize = logicalRange.to - logicalRange.from;

    if (e.ctrlKey || e.metaKey) {
      // Ctrl + scroll  → zoom (same as native chart behaviour)
      const zoomFactor = e.deltaY > 0 ? 1.12 : 0.88;
      const pointer = chart.timeScale().coordinateToLogical(
        e.nativeEvent.offsetX
      ) ?? (logicalRange.from + logicalRange.to) / 2;
      const newSize = rangeSize * zoomFactor;
      const ratio = (pointer - logicalRange.from) / rangeSize;
      timeScale.setVisibleLogicalRange({
        from: pointer - ratio * newSize,
        to:   pointer + (1 - ratio) * newSize,
      });
    } else if (e.shiftKey) {
      // Shift + scroll → horizontal pan
      const panBy = (e.deltaY / 100) * rangeSize * 0.15;
      timeScale.setVisibleLogicalRange({
        from: logicalRange.from + panBy,
        to:   logicalRange.to + panBy,
      });
    } else {
      // Plain scroll → zoom centred on pointer (mirrors TradingView default)
      const zoomFactor = e.deltaY > 0 ? 1.12 : 0.88;
      const pointer = timeScale.coordinateToLogical(e.nativeEvent.offsetX)
        ?? (logicalRange.from + logicalRange.to) / 2;
      const newSize = rangeSize * zoomFactor;
      const ratio = (pointer - logicalRange.from) / rangeSize;
      timeScale.setVisibleLogicalRange({
        from: pointer - ratio * newSize,
        to:   pointer + (1 - ratio) * newSize,
      });
    }
  };

  return (
    <div 
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
      onWheel={shouldCaptureEvents ? handleWheel : undefined}
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
        <Layer>
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

          {drawings.filter(d => d.visible).map(drawing => {
            if (drawing.type === 'trendline') {
              return (
                <TrendLine 
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  stroke={drawing.stroke}
                  strokeWidth={drawing.strokeWidth}
                  lineStyle={drawing.lineStyle}
                  extendLeft={drawing.extendLeft}
                  extendRight={drawing.extendRight}
                  showMiddlePoint={drawing.showMiddlePoint}
                  showPriceLabels={drawing.showPriceLabels}
                  showStats={drawing.showStats}
                  statsPosition={drawing.statsPosition}
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)}
                  chart={chart}
                  series={series}
                  onSelect={() => setSelectedShapeId(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                  text={(drawing as any).text}
                  onTextEdit={() => setEditingTextId(drawing.id)}
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)}
                  chart={chart}
                  series={series}
                  onSelect={() => setSelectedShapeId(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  isLocked={drawing.locked}
                  // New properties passed here
                  fill={drawing.fill}
                  backgroundVisible={(drawing as any).backgroundVisible}
                  text={(drawing as any).text}
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)}
                  chart={chart}
                  series={series}
                  onSelect={() => setSelectedShapeId(drawing.id)}
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)}
                  chart={chart}
                  series={series}
                  onSelect={() => setSelectedShapeId(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  targetFillColor={drawing.targetFillColor}
                  stopFillColor={drawing.stopFillColor}
                  textColor={drawing.textColor}
                  fontSize={drawing.fontSize}
                  showPriceLabels={drawing.showPriceLabels}
                  statsMode={drawing.statsMode}
                  compactStatsMode={drawing.compactStatsMode}
                  alwaysShowStats={drawing.alwaysShowStats}
                  quantity={(drawing as any).quantity}
                  openPnL={(drawing as any).openPnL}
                />
              );
            } else if (drawing.type === 'short_position') {
              return (
                <ShortPositionTool
                  key={drawing.id}
                  id={drawing.id}
                  points={drawing.points}
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)}
                  chart={chart}
                  series={series}
                  onSelect={() => setSelectedShapeId(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  targetFillColor={drawing.targetFillColor}
                  stopFillColor={drawing.stopFillColor}
                  textColor={drawing.textColor}
                  fontSize={drawing.fontSize}
                  showPriceLabels={drawing.showPriceLabels}
                  statsMode={drawing.statsMode}
                  compactStatsMode={drawing.compactStatsMode}
                  alwaysShowStats={drawing.alwaysShowStats}
                  quantity={(drawing as any).quantity}
                  openPnL={(drawing as any).openPnL}
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)}
                  chart={chart}
                  series={series}
                  onSelect={() => setSelectedShapeId(drawing.id)}
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)}
                  chart={chart}
                  series={series}
                  onSelect={() => setSelectedShapeId(drawing.id)}
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
                <HighlighterTool key={drawing.id} id={drawing.id} points={drawing.points} stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} chart={chart} series={series} onSelect={() => setSelectedShapeId(drawing.id)} onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} isLocked={drawing.locked} />
              );
            } else if (drawing.type === 'arrow_marker') {
              return (
                <ArrowMarkerTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  strokeWidth={drawing.strokeWidth} 
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => setSelectedShapeId(drawing.id)} 
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
                <ArrowTool key={drawing.id} id={drawing.id} points={drawing.points} stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} lineStyle={(drawing as any).lineStyle} extendLeft={(drawing as any).extendLeft} extendRight={(drawing as any).extendRight} isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} chart={chart} series={series} onSelect={() => setSelectedShapeId(drawing.id)} onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} isLocked={drawing.locked} />
              );
            } else if (drawing.type === 'arrow_mark_up' || drawing.type === 'arrow_mark_down') {
              return (
                <ArrowIconTool 
                  key={drawing.id} 
                  id={drawing.id} 
                  points={drawing.points} 
                  stroke={drawing.stroke} 
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} 
                  type={drawing.type} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => setSelectedShapeId(drawing.id)} 
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
                <RotatedRectangleTool key={drawing.id} id={drawing.id} points={drawing.points} stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} chart={chart} series={series} onSelect={() => setSelectedShapeId(drawing.id)} onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} isLocked={drawing.locked} />
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => setSelectedShapeId(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => setSelectedShapeId(drawing.id)} 
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => setSelectedShapeId(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => setSelectedShapeId(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => setSelectedShapeId(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
                />
              );
            } else if (drawing.type === 'arc') {
              return (
                <ArcTool key={drawing.id} id={drawing.id} points={drawing.points} stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} fill={(drawing as any).fill} isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} chart={chart} series={series} onSelect={() => setSelectedShapeId(drawing.id)} onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} isLocked={drawing.locked} />
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => setSelectedShapeId(drawing.id)} 
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)} 
                  chart={chart} 
                  series={series} 
                  onSelect={() => setSelectedShapeId(drawing.id)} 
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })} 
                  isLocked={drawing.locked} 
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
                  isSelected={selectedShapeId === drawing.id || selectedShapeIds.has(drawing.id)}
                  chart={chart}
                  series={series}
                  onSelect={() => setSelectedShapeId(drawing.id)}
                  onUpdatePoints={(points) => handleUpdateWithClone(drawing.id, { points })}
                  onUpdateScale={(scaleX, scaleY, rotation) => updateDrawing(drawing.id, { scaleX, scaleY, rotation })}
                  isLocked={drawing.locked}
                  emojiSize={(drawing as any).emojiSize}
                />
              );
            }
            return null;
          })}

          {activeTool === 'trendline' && pendingPoints.length > 0 && previewPoint && (
            <TrendLine 
              id="preview"
              points={[pendingPoints[0], previewPoint]}
              stroke="#2962ff"
              strokeWidth={2}
              isSelected={false}
              chart={chart}
              series={series}
              onSelect={() => {}}
            />
          )}

          {(activeTool === 'measure' || isShiftMeasuring) && pendingPoints.length > 0 && previewPoint && (
            <MeasureTool 
              id="preview"
              points={[pendingPoints[0], previewPoint]}
              chart={chart}
              series={series}
            />
          )}

          {activeTool === 'rectangle' && pendingPoints.length > 0 && previewPoint && (
            <RectangleTool 
              id="preview"
              points={[pendingPoints[0], previewPoint]}
              stroke="rgba(41, 98, 255, 0.2)"
              strokeWidth={1}
              isSelected={false}
              chart={chart}
              series={series}
              onSelect={() => {}}
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
          {activeTool === 'fibonacci' && pendingPoints.length > 0 && previewPoint && (() => {
            // Mirror addDrawing()'s merge order (defaultSettings on top of the base
            // seed) so the live preview looks exactly like the fib that will actually
            // be created, instead of the tool's own hardcoded fallback style.
            const fibDefaults: any = defaultSettings?.fibonacci || {};
            return (
              <FibonacciTool
                id="preview"
                points={[pendingPoints[0], previewPoint]}
                stroke={fibDefaults.stroke ?? "#2962ff"}
                strokeWidth={fibDefaults.strokeWidth ?? 2}
                isSelected={true}
                chart={chart}
                series={series}
                onSelect={() => {}}
                showTrendLine={fibDefaults.showTrendLine}
                trendLineColor={fibDefaults.trendLineColor}
                trendLineStyle={fibDefaults.trendLineStyle}
                trendLineWidth={fibDefaults.trendLineWidth}
                fibLevels={fibDefaults.fibLevels ?? DEFAULT_FIB_LEVELS}
                useOneColor={fibDefaults.useOneColor}
                oneColor={fibDefaults.oneColor}
                extendLeft={fibDefaults.extendLeft}
                extendRight={fibDefaults.extendRight}
                levelsLineWidth={fibDefaults.levelsLineWidth}
                levelsLineStyle={fibDefaults.levelsLineStyle}
                showBackground={fibDefaults.showBackground}
                backgroundOpacity={fibDefaults.backgroundOpacity}
                fibReverse={fibDefaults.fibReverse}
                fibShowLevels={fibDefaults.fibShowLevels}
                fibLevelFormat={fibDefaults.fibLevelFormat}
                fibPrices={fibDefaults.fibPrices}
                fibShowText={fibDefaults.fibShowText}
                fibLabelHAlign={fibDefaults.fibLabelHAlign}
                fibLabelVAlign={fibDefaults.fibLabelVAlign}
                fibFontSize={fibDefaults.fibFontSize}
              />
            );
          })()}



          {/* Generic previews for other shapes */}
          {activeTool && pendingPoints.length > 0 && previewPoint && (
            (() => {
              const previewPts = [...pendingPoints, previewPoint];
              const props = {
                id: 'preview',
                points: previewPts,
                stroke: '#2962ff',
                strokeWidth: 2,
                isSelected: true,
                chart,
                series,
                onSelect: () => {}
              };

              switch (activeTool) {
                case 'arrow_marker':
                case 'arrow':
                  return <ArrowMarkerTool {...props} />;
                case 'rotated_rectangle':
                  return <RotatedRectangleTool {...props} />;
                case 'path':
                  return <PathTool {...props} />;
                case 'polyline':
                  return <PolylineTool {...props} />;
                case 'circle':
                  return <CircleTool {...props} />;
                case 'ellipse':
                  return <EllipseTool {...props} />;
                case 'triangle':
                  return <TriangleTool {...props} />;
                case 'arc':
                  return <ArcTool {...props} />;
                case 'curve':
                  return <CurveTool {...props} />;
                case 'double_curve':
                  return <DoubleCurveTool {...props} />;
                default:
                  return null;
              }
            })()
          )}

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

      {editingTextId && (() => {
        const d = drawings.find(x => x.id === editingTextId);
        if (!d || d.points.length === 0) return null;
        if (d.type !== 'text' && d.type !== 'trendline') return null;

        let px = 0, py = 0, rot = 0;

        if (d.type === 'trendline' && d.points.length === 2) {
          const x1 = logicalToPixel(chart, d.points[0].logical) || 0;
          const y1 = priceToPixel(series, d.points[0].price) || 0;
          const x2 = logicalToPixel(chart, d.points[1].logical) || 0;
          const y2 = priceToPixel(series, d.points[1].price) || 0;
          px = (x1 + x2) / 2;
          py = (y1 + y2) / 2;
          const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
          rot = (angle > 90 || angle < -90) ? angle + 180 : angle;
        } else {
          const p = d.points[0];
          px = logicalToPixel(chart, p.logical) || 0;
          py = priceToPixel(series, p.price) || 0;
        }

        return (
          <TextEditorOverlay
            initialText={(d as any).text || ''}
            x={px}
            y={py}
            rotation={d.type === 'trendline' ? rot : undefined}
            color={d.stroke}
            onCommit={(newText) => {
              if (newText.trim() === '' && d.type === 'text') {
                deleteDrawing(editingTextId);
              } else {
                updateDrawing(editingTextId, { text: newText } as any);
                setSelectedShapeId(editingTextId);
              }
              setEditingTextId(null);
            }}
            onCancel={() => {
              if (((d as any).text || '').trim() === '' && d.type === 'text') {
                deleteDrawing(editingTextId);
              }
              setEditingTextId(null);
            }}
          />
        );
      })()}
    </div>
  );
}
