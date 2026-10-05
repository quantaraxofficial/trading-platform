"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export type DrawingType =
  | 'trendline' | 'horizontal_line' | 'horizontal_ray' | 'text' | 'rectangle' | 'fibonacci'
  | 'ray' | 'info_line' | 'extended_line' | 'trend_angle' | 'vertical_line' | 'cross_line'
  // Fibonacci & Gann, patterns, Elliott waves, cycles, forecasting, volume-based and measurers
  // (drawn by tools/advanced — see its registry)
  | 'fib_trend_ext' | 'fib_channel' | 'fib_timezone' | 'fib_speed_resist_fan' | 'fib_trend_time' | 'fib_circles'
  | 'fib_spiral' | 'fib_speed_resist_arcs' | 'fib_wedge' | 'pitchfan'
  | 'gannbox' | 'gannbox_fixed' | 'gannbox_square' | 'gannbox_fan'
  | 'xabcd_pattern' | 'cypher_pattern' | 'head_and_shoulders' | 'abcd_pattern' | 'triangle_pattern' | 'three_drives_pattern'
  | 'elliott_impulse_wave' | 'elliott_correction' | 'elliott_triangle_wave' | 'elliott_double_combo' | 'elliott_triple_combo'
  | 'cyclic_lines' | 'time_cycles' | 'sine_line'
  | 'forecast' | 'bars_pattern' | 'ghost_feed' | 'projection'
  | 'anchored_vwap' | 'fixed_range_volume_profile' | 'anchored_volume_profile'
  | 'price_range' | 'date_range' | 'date_and_price_range'
  | 'parallel_channel' | 'regression_trend' | 'flat_bottom' | 'disjoint_angle'
  | 'pitchfork' | 'schiff_pitchfork' | 'schiff_pitchfork_modified' | 'inside_pitchfork'
  | 'text_note' | 'price_note' | 'note' | 'table' | 'callout' | 'comment' | 'price_label' | 'signpost' | 'flag'
  | 'image' | 'tweet' | 'idea'
  | 'brush' | 'highlighter' | 'arrow_marker' | 'arrow' | 'arrow_mark_up' | 'arrow_mark_down'
  | 'rotated_rectangle' | 'path' | 'circle' | 'ellipse' | 'polyline' | 'triangle' 
  | 'arc' | 'curve' | 'double_curve' | 'measure' | 'long_position' | 'short_position' | 'emoji'
  | 'cross' | 'dot' | 'arrow_cursor' | 'eraser' | 'magic' | 'demonstration' | 'zoom_in';

export interface BaseDrawing {
  id: string;
  type: DrawingType;
  visible: boolean;
  locked: boolean;
  stroke: string;
  strokeWidth: number;
  points: any[];
  emojiChar?: string;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  initialBarWidth?: number;
  text?: string;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  // Trendline specific
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  extendLeft?: boolean;
  extendRight?: boolean;
  showPriceLabels?: boolean;
  showMiddlePoint?: boolean;
  showStats?: boolean;
  statsPosition?: 'Left' | 'Center' | 'Right';
  visibility?: {
    ticks?: { enabled: boolean; from: number; to: number };
    seconds?: { enabled: boolean; from: number; to: number };
    minutes?: { enabled: boolean; from: number; to: number };
    hours?: { enabled: boolean; from: number; to: number };
    days?: { enabled: boolean; from: number; to: number };
    weeks?: { enabled: boolean; from: number; to: number };
    months?: { enabled: boolean; from: number; to: number };
    ranges?: { enabled: boolean };
  };
  // Fibonacci specific
  showTrendLine?: boolean;
  trendLineColor?: string;
  trendLineStyle?: 'solid' | 'dashed' | 'dotted';
  fibLevels?: { id: string; enabled: boolean; value: number; color: string }[];
  useOneColor?: boolean;
  oneColor?: string;
  extendLeft?: boolean;
  extendRight?: boolean;
  levelsLineWidth?: number;
  levelsLineStyle?: 'solid' | 'dashed' | 'dotted';
  showBackground?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number; // 0 to 1
  showBorder?: boolean;
  borderColor?: string;
  textWrap?: boolean;
  // Horizontal Ray specific
  priceLabel?: boolean;
  textVAlign?: 'Top' | 'Middle' | 'Bottom';
  textHAlign?: 'Left' | 'Center' | 'Right';
  // Long Position specific
  accountSize?: number;
  accountSizeCurrency?: string;
  lotSize?: number;
  risk?: number;
  riskType?: '%' | 'Cash';
  entryPrice?: number;
  leverage?: number;
  profitTicks?: number;
  profitPrice?: number;
  stopTicks?: number;
  stopPrice?: number;
  qtyPrecision?: string;
  stopFillColor?: string;
  targetFillColor?: string;
  statsMode?: string;
  compactStatsMode?: boolean;
  alwaysShowStats?: boolean;
}

interface DrawingContextType {
  activeTool: DrawingType | null;
  setActiveTool: (tool: DrawingType | null) => void;
  activeEmoji: string | null;
  setActiveEmoji: (emoji: string | null) => void;
  drawings: BaseDrawing[];
  setDrawings: React.Dispatch<React.SetStateAction<BaseDrawing[]>>;
  addDrawing: (drawing: BaseDrawing) => void;
  updateDrawing: (id: string, updates: Partial<BaseDrawing>) => void;
  updateMultipleDrawings: (ids: string[], updates: Partial<BaseDrawing>) => void;
  deleteDrawing: (id: string) => void;
  deleteMultipleDrawings: (ids: string[]) => void;
  clearDrawings: () => void;
  selectedShapeId: string | null;
  setSelectedShapeId: (id: string | null) => void;
  // Multi-select
  selectedShapeIds: Set<string>;
  setSelectedShapeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  // History for Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  shiftDrawings: (shift: number) => void;
  symbol: string;
  setSymbol: (symbol: string) => void;
  favoriteTools: DrawingType[];
  toggleFavoriteTool: (tool: DrawingType) => void;
  isFavoritesToolbarVisible: boolean;
  setIsFavoritesToolbarVisible: (visible: boolean) => void;
  magnetMode: 'off' | 'weak' | 'strong';
  setMagnetMode: (mode: 'off' | 'weak' | 'strong') => void;
  // "Keep drawing": the tool stays active after a drawing is finished
  keepDrawing: boolean;
  setKeepDrawing: (on: boolean) => void;
  defaultSettings: Partial<Record<DrawingType, Partial<BaseDrawing>>>;
  updateDefaultSettings: (type: DrawingType, settings: Partial<BaseDrawing>) => void;
  allDrawingsLocked: boolean;
  toggleLockAllDrawings: () => void;
  allDrawingsHidden: boolean;
  toggleHideAllDrawings: () => void;
}

import { useAuth } from '@/context/AuthContext';
import { useTelemetry } from '@/context/TelemetryContext';
import { isTypingTarget } from '../../../lib/isTypingTarget';

const DrawingContext = createContext<DrawingContextType | undefined>(undefined);

export function DrawingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { logAction } = useTelemetry();
  const [symbol, setSymbol] = useState<string>('');
  const [activeTool, setActiveTool] = useState<DrawingType | null>(null);
  const [activeEmoji, setActiveEmoji] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<BaseDrawing[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set());
  // Read-only view for debugging and automated checks, like window.__chartFullData
  useEffect(() => { (window as any).__drawings = drawings; }, [drawings]);
  useEffect(() => { (window as any).__selectedDrawingId = selectedShapeId; }, [selectedShapeId]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [favoriteTools, setFavoriteTools] = useState<DrawingType[]>([]);
  const [isFavoritesToolbarVisible, setIsFavoritesToolbarVisible] = useState(true);
  const [magnetMode, setMagnetMode] = useState<'off' | 'weak' | 'strong'>('off');
  const [keepDrawing, setKeepDrawingState] = useState(false);
  useEffect(() => {
    try { setKeepDrawingState(localStorage.getItem('tv:keepDrawing') === '1'); } catch { /* ignore */ }
  }, []);
  const setKeepDrawing = useCallback((on: boolean) => {
    setKeepDrawingState(on);
    try { localStorage.setItem('tv:keepDrawing', on ? '1' : '0'); } catch { /* ignore */ }
  }, []);
  
  const [history, setHistory] = useState<BaseDrawing[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  // The latest drawings / history position, for functions called from long-lived listeners
  // (e.g. the window middle-click delete): building the next list from a stale `drawings`
  // would bring back shapes deleted since that listener was registered. Written straight
  // away on each change so two edits before the next render still chain.
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;
  const commitDrawings = (next: BaseDrawing[]) => {
    drawingsRef.current = next;
    setDrawings(next);
  };

  const [defaultSettings, setDefaultSettings] = useState<Partial<Record<DrawingType, Partial<BaseDrawing>>>>({});

  // Load default settings from backend
  useEffect(() => {
    if (user) {
      const loadDefaultSettings = async () => {
        try {
          const res = await fetch(`http://localhost:8000/api/users/templates/${user.uid}/`);
          if (res.ok) {
            const data = await res.json();
            const defaults: Partial<Record<DrawingType, Partial<BaseDrawing>>> = {};
            data.forEach((t: any) => {
              if (t.name === 'default') {
                defaults[t.tool_type as DrawingType] = t.settings;
              }
            });
            setDefaultSettings(defaults);
          }
        } catch (error) {
          console.error("Error loading default settings:", error);
        }
      };
      loadDefaultSettings();
    }
  }, [user]);

  const updateDefaultSettings = (type: DrawingType, newSettings: Partial<BaseDrawing>) => {
    setDefaultSettings(prev => ({ ...prev, [type]: { ...(prev[type] || {}), ...newSettings } }));
    
    if (user) {
      const settingsToSave = { ...newSettings };
      delete settingsToSave.id;
      delete settingsToSave.type;
      delete settingsToSave.points;
      delete settingsToSave.visible;
      delete settingsToSave.locked;

      fetch(`http://localhost:8000/api/users/templates/${user.uid}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'default',
          tool_type: type,
          settings: settingsToSave
        })
      }).catch(err => console.warn("Failed to save default settings", err));
    }
  };

  // Load favorites: from backend if logged in, else from localStorage
  useEffect(() => {
    const loadFavorites = async () => {
      if (user) {
        try {
          const res = await fetch(`http://localhost:8000/api/users/favorites/${user.uid}/`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              setFavoriteTools(data);
              localStorage.setItem('tv_favorite_tools', JSON.stringify(data));
              return;
            }
          }
        } catch (e) {
          console.warn("Failed to load favorites from backend, using localStorage", e);
        }
      }
      // Fallback to localStorage
      try {
        const stored = localStorage.getItem('tv_favorite_tools');
        if (stored) {
          setFavoriteTools(JSON.parse(stored));
        }
      } catch (e) {
        console.warn("Failed to load favorite tools from localStorage", e);
      }
    };
    loadFavorites();
  }, [user]);

  const toggleFavoriteTool = (tool: DrawingType) => {
    setFavoriteTools(prev => {
      const newFavs = prev.includes(tool) 
        ? prev.filter(t => t !== tool)
        : [...prev, tool];
      // Always save to localStorage
      localStorage.setItem('tv_favorite_tools', JSON.stringify(newFavs));
      // Save to backend if logged in (fire-and-forget)
      if (user) {
        fetch(`http://localhost:8000/api/users/favorites/${user.uid}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ favorites: newFavs })
        }).catch(err => console.warn("Failed to save favorites to backend", err));
      }
      return newFavs;
    });
  };

  // Load drawings when user or symbol changes
  useEffect(() => {
    if (user && symbol) {
      const loadDrawings = async () => {
        try {
          const res = await fetch(`http://localhost:8000/api/users/drawings/${user.uid}/?symbol=${symbol}`);
          if (res.ok) {
            const data = await res.json();
            setDrawings(data);
            setHistory([data]);
            setHistoryIndex(0);
          }
        } catch (error) {
          console.error("Error loading drawings:", error);
        } finally {
          setIsInitialLoad(false);
        }
      };
      loadDrawings();
    } else {
      setDrawings([]);
      setHistory([[]]);
      setHistoryIndex(0);
    }
  }, [user, symbol]);

  // Save drawings when they change (debounced or after each action)
  useEffect(() => {
    if (user && symbol && !isInitialLoad) {
      const saveDrawings = async () => {
        try {
          await fetch(`http://localhost:8000/api/users/drawings/${user.uid}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol: symbol,
              drawings: drawings
            })
          });
        } catch (error) {
          console.error("Error saving drawings:", error);
        }
      };
      
      const timer = setTimeout(saveDrawings, 1000); // Debounce save
      return () => clearTimeout(timer);
    }
  }, [drawings, user, symbol, isInitialLoad]);

  // Push to history when drawings change meaningfully
  const pushToHistory = (newDrawings: BaseDrawing[]) => {
    const index = historyIndexRef.current;
    setHistory(prev => {
      const newHistory = prev.slice(0, index + 1);
      // Shallow copy is sufficient because we treat drawing objects as immutable
      newHistory.push([...newDrawings]);
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    const nextIndex = Math.min(index + 1, 49);
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
  };

  const addDrawing = (drawing: BaseDrawing) => {
    const toolDefaults = defaultSettings[drawing.type] || {};
    const newDrawing = { 
      ...drawing, 
      ...toolDefaults, 
      // Ensure these core properties are not overwritten by defaults
      id: drawing.id, 
      type: drawing.type, 
      points: drawing.points,
      visible: drawing.visible,
      locked: drawing.locked
    };
    const newDrawings = [...drawingsRef.current, newDrawing];
    commitDrawings(newDrawings);
    pushToHistory(newDrawings);
    logAction('DRAWING_ADDED', { id: drawing.id, type: drawing.type, points: drawing.points });
  };

  const updateDrawing = (id: string, updates: Partial<BaseDrawing>) => {
    setDrawings(prev => prev.map(d => {
      if (d.id === id) {
        const newDrawing = { ...d, ...updates };
        // Intercept style updates to save as new default
        const nonStyleKeys = ['id', 'type', 'points', 'visible', 'locked', 'scaleX', 'scaleY', 'rotation', 'text'];
        const styleKeysChanged = Object.keys(updates).filter(k => !nonStyleKeys.includes(k));
        
        if (styleKeysChanged.length > 0) {
          const styleUpdates: any = {};
          styleKeysChanged.forEach(k => styleUpdates[k] = (updates as any)[k]);
          updateDefaultSettings(newDrawing.type, styleUpdates);
        }
        
        return newDrawing;
      }
      return d;
    }));
    logAction('DRAWING_MODIFIED', { id, updates });
  };

  const updateMultipleDrawings = (ids: string[], updates: Partial<BaseDrawing>) => {
    setDrawings(prev => prev.map(d => ids.includes(d.id) ? { ...d, ...updates } : d));
    logAction('DRAWINGS_BATCH_MODIFIED', { ids, updates });
  };

  const deleteDrawing = (id: string) => {
    const newDrawings = drawingsRef.current.filter(d => d.id !== id);
    commitDrawings(newDrawings);
    if (selectedShapeId === id) setSelectedShapeId(null);
    setSelectedShapeIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    pushToHistory(newDrawings);
    logAction('DRAWING_DELETED', { id });
  };

  const deleteMultipleDrawings = (ids: string[]) => {
    const idSet = new Set(ids);
    const newDrawings = drawingsRef.current.filter(d => !idSet.has(d.id));
    commitDrawings(newDrawings);
    if (selectedShapeId && idSet.has(selectedShapeId)) setSelectedShapeId(null);
    setSelectedShapeIds(new Set());
    pushToHistory(newDrawings);
    logAction('DRAWINGS_BATCH_DELETED', { ids });
  };

  const clearDrawings = () => {
    commitDrawings([]);
    setSelectedShapeId(null);
    setSelectedShapeIds(new Set());
    pushToHistory([]);
  };

  const allDrawingsLocked = drawings.length > 0 && drawings.every(d => d.locked);

  const toggleLockAllDrawings = () => {
    const nextLocked = !allDrawingsLocked;
    setDrawings(prev => prev.map(d => ({ ...d, locked: nextLocked })));
    logAction('DRAWINGS_LOCK_TOGGLED', { locked: nextLocked });
  };

  const allDrawingsHidden = drawings.length > 0 && drawings.every(d => d.visible === false);

  const toggleHideAllDrawings = () => {
    const nextHidden = !allDrawingsHidden;
    setDrawings(prev => prev.map(d => ({ ...d, visible: !nextHidden })));
    logAction('DRAWINGS_VISIBILITY_TOGGLED', { hidden: nextHidden });
  };

  const addToSelection = (id: string) => {
    setSelectedShapeIds(prev => new Set(prev).add(id));
    setSelectedShapeId(null); // Clear single selection when multi-selecting
  };

  const removeFromSelection = (id: string) => {
    setSelectedShapeIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const clearSelection = () => {
    setSelectedShapeIds(new Set());
  };

  const undo = () => {
    if (historyIndex > 0) {
      setDrawings(JSON.parse(JSON.stringify(history[historyIndex - 1])));
      setHistoryIndex(prev => prev - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setDrawings(JSON.parse(JSON.stringify(history[historyIndex + 1])));
      setHistoryIndex(prev => prev + 1);
    }
  };
  
  const shiftDrawings = (shift: number) => {
    if (shift === 0) return;
    setDrawings(prev => prev.map(d => ({
      ...d,
      points: d.points.map(p => ({
        ...p,
        logical: p.logical + shift
      }))
    })));
  };

  // Keyboard shortcuts
  useEffect(() => {
    // Paste the drawing clipboard (Ctrl+C, or a drawing's More → Copy), a few bars to the
    // right of the originals; also run by the chart's right-click "Paste"
    const pasteCopiedDrawings = () => {
      const copied = (window as any).__copiedDrawings;
      if (!copied || !Array.isArray(copied) || copied.length === 0) return false;
      const newDrawings = copied.map((d: any) => ({
        ...d,
        id: Math.random().toString(36).substring(2, 9),
        points: d.points.map((p: any) => ({ ...p, logical: p.logical + 5, price: p.price }))
      }));
      const next = [...drawingsRef.current, ...newDrawings];
      commitDrawings(next);
      // Select the pasted drawings
      setSelectedShapeIds(new Set(newDrawings.map((d: any) => d.id)));
      setSelectedShapeId(null);
      pushToHistory(next);
      return true;
    };
    const handlePasteRequest = () => { pasteCopiedDrawings(); };
    window.addEventListener('tv:paste-drawings', handlePasteRequest);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or a contenteditable
      // area (e.g. the CodeMirror-based Pine Editor)
      const target = e.target as HTMLElement;
      if (isTypingTarget(target)) return;

      // --- Ctrl/Cmd shortcuts ---
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Z = Undo
        if (e.key === 'z' && !e.shiftKey && !e.altKey) { e.preventDefault(); undo(); return; }
        // Ctrl+Y or Ctrl+Shift+Z = Redo
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
        // Ctrl+A = Select all drawings
        if (e.key === 'a') {
          e.preventDefault();
          const allIds = new Set(drawings.map(d => d.id));
          setSelectedShapeIds(allIds);
          setSelectedShapeId(null);
          return;
        }
        // Ctrl+Alt+H = Hide all drawings (toggle visibility)
        if (e.altKey && (e.key === 'h' || e.key === 'H')) {
          e.preventDefault();
          toggleHideAllDrawings();
          return;
        }
        // Ctrl+C = Copy selected drawings
        if (e.key === 'c' && !e.altKey) {
          if (selectedShapeId || selectedShapeIds.size > 0) {
            const ids = selectedShapeIds.size > 0 ? Array.from(selectedShapeIds) : (selectedShapeId ? [selectedShapeId] : []);
            const toCopy = drawings.filter(d => ids.includes(d.id));
            if (toCopy.length > 0) {
              (window as any).__copiedDrawings = JSON.parse(JSON.stringify(toCopy));
            }
          }
          return;
        }
        // Ctrl+V = Paste copied drawings
        if (e.key === 'v' && !e.altKey) {
          if (pasteCopiedDrawings()) e.preventDefault();
          return;
        }
        return;
      }

      // --- Alt shortcuts (Drawing tools) ---
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        
        // Alt+T = Trend Line
        if (key === 't' && !e.shiftKey) { e.preventDefault(); setActiveTool('trendline'); return; }
        // Alt+H = Horizontal Line
        if (key === 'h' && !e.shiftKey) { e.preventDefault(); setActiveTool('horizontal_line'); return; }
        // Alt+J = Horizontal Ray
        if (key === 'j' && !e.shiftKey) { e.preventDefault(); setActiveTool('horizontal_ray'); return; }
        // Alt+V = Vertical Line
        if (key === 'v' && !e.shiftKey) { e.preventDefault(); setActiveTool('vertical_line'); return; }
        // Alt+C = Crossline
        if (key === 'c' && !e.shiftKey) { e.preventDefault(); setActiveTool('cross_line'); return; }
        // Alt+F = Fibonacci Retracement
        if (key === 'f' && !e.shiftKey) { e.preventDefault(); setActiveTool('fibonacci'); return; }
        // Alt+E = Eraser
        if (key === 'e' && !e.shiftKey) { e.preventDefault(); setActiveTool('eraser'); return; }
        // Alt+B = Brush
        if (key === 'b' && !e.shiftKey) { e.preventDefault(); setActiveTool('brush'); return; }
        // Alt+Shift+R = Rectangle
        if (key === 'r' && e.shiftKey) { e.preventDefault(); setActiveTool('rectangle'); return; }
        return;
      }

      // --- Simple key shortcuts ---
      // Delete / Backspace = Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedShapeIds.size > 0) {
          deleteMultipleDrawings(Array.from(selectedShapeIds));
        } else if (selectedShapeId) {
          deleteDrawing(selectedShapeId);
        }
        return;
      }
      // Escape = Cancel tool / deselect, and dismiss a finished measurement (it's temporary)
      if (e.key === 'Escape') {
        setActiveTool(null);
        setSelectedShapeId(null);
        setSelectedShapeIds(new Set());
        if (drawings.some(d => d.type === 'measure')) setDrawings(prev => prev.filter(d => d.type !== 'measure'));
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('tv:paste-drawings', handlePasteRequest);
    };
  }, [historyIndex, history, selectedShapeId, selectedShapeIds, drawings]);

  const contextValue = React.useMemo(() => ({
    activeTool, setActiveTool,
    activeEmoji, setActiveEmoji,
    drawings, setDrawings, addDrawing, updateDrawing, updateMultipleDrawings, deleteDrawing, deleteMultipleDrawings, clearDrawings,
    selectedShapeId, setSelectedShapeId,
    selectedShapeIds, setSelectedShapeIds, addToSelection, removeFromSelection, clearSelection,
    undo, redo, canUndo: historyIndex > 0, canRedo: historyIndex < history.length - 1,
    shiftDrawings,
    symbol, setSymbol,
    favoriteTools, toggleFavoriteTool,
    isFavoritesToolbarVisible, setIsFavoritesToolbarVisible,
    magnetMode, setMagnetMode,
    keepDrawing, setKeepDrawing,
    defaultSettings, updateDefaultSettings,
    allDrawingsLocked, toggleLockAllDrawings,
    allDrawingsHidden, toggleHideAllDrawings
  }), [activeTool, activeEmoji, drawings, selectedShapeId, selectedShapeIds, historyIndex, history, symbol, favoriteTools, isFavoritesToolbarVisible, magnetMode, keepDrawing, setKeepDrawing, defaultSettings, allDrawingsLocked, allDrawingsHidden]);

  return (
    <DrawingContext.Provider value={contextValue}>
      {children}
    </DrawingContext.Provider>
  );
}

export function useDrawing() {
  const context = useContext(DrawingContext);
  if (context === undefined) {
    throw new Error('useDrawing must be used within a DrawingProvider');
  }
  return context;
}
