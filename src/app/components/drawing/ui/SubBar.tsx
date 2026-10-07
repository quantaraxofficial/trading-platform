'use client';
import React, { useState, useEffect, useLayoutEffect } from 'react';
import { SubGripIcon, SubTemplateIcon, SubPencilIcon, SubTextIcon, SubBucketIcon, SubSettingsIcon, SubAlertIcon, SubLockIcon, SubTrashIcon, SubMoreIcon, SubOrderIcon, SubLineStyleIcon, SubColorBar, SubWidthLabel } from "./subbarIcons";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Trash2, Move, Square, Palette, Lock, Unlock, MoreHorizontal, RotateCcw, RotateCw, Settings } from 'lucide-react';
import { TVSettingsIcon } from '../../icons/TVIcons';
import { useDrawing } from '../core/DrawingContext';
import { TrendlineSettingsModal } from './TrendlineSettingsModal';
import { HorizontalRaySettingsModal } from './HorizontalRaySettingsModal';
import { BrushSettingsModal } from './BrushSettingsModal';
import { FibonacciSettingsModal } from './FibonacciSettingsModal';
import { TextSettingsModal } from './TextSettingsModal';
import { TriangleSettingsModal } from './TriangleSettingsModal';
import { ArrowMarkupSettingsModal } from './ArrowMarkupSettingsModal';
import { ArrowMarkerSettingsModal } from './ArrowMarkerSettingsModal';
import { ArrowSettingsModal } from './ArrowSettingsModal';
import { RectangleSettingsModal } from './RectangleSettingsModal';
import { RotatedRectangleSettingsModal } from './RotatedRectangleSettingsModal';
import { PathSettingsModal } from './PathSettingsModal';
import { HighlighterSettingsModal } from './HighlighterSettingsModal';
import { CircleSettingsModal } from './CircleSettingsModal';
import { EllipseSettingsModal } from './EllipseSettingsModal';
import { PolylineSettingsModal } from './PolylineSettingsModal';
import { CurveSettingsModal } from './CurveSettingsModal';
import { ArcSettingsModal } from './ArcSettingsModal';
import { DoubleCurveSettingsModal } from './DoubleCurveSettingsModal';
import { EmojiSettingsModal } from './EmojiSettingsModal';
import { PositionSettingsModal } from './PositionSettingsModal';
import { ColorPickerPopup, parseColorInput } from './ColorPickerPopup';
import { TvWidthMenu, TvLineStyleMenu } from './TvLineMenus';
import { POSITION_TARGET_FILL, POSITION_STOP_FILL } from '../tools/PositionTool';
import { PaletteInput } from "./PaletteInput";
import { backendFetch } from "@/lib/backend";

export function SubBar() {
  const { user } = useAuth();
  const { activeTool, selectedShapeId, drawings, setDrawings, updateDrawing, deleteDrawing, addDrawing, setSelectedShapeId } = useDrawing();
  const selectedShape = drawings.find((d: any) => d.id === selectedShapeId);
  const selectedShapeType = selectedShape?.type;

  
  
  const [showVisualOrder, setShowVisualOrder] = useState(false);
  const handleVisualOrder = (action: 'front' | 'back' | 'forward' | 'backward') => {
    if (!selectedShapeId) return;
    setDrawings(prev => {
      const idx = prev.findIndex(d => d.id === selectedShapeId);
      if (idx === -1) return prev;
      
      const newDrawings = [...prev];
      const [shape] = newDrawings.splice(idx, 1);
      
      if (action === 'front') {
        newDrawings.push(shape);
      } else if (action === 'back') {
        newDrawings.unshift(shape);
      } else if (action === 'forward') {
        newDrawings.splice(Math.min(newDrawings.length, idx + 1), 0, shape);
      } else if (action === 'backward') {
        newDrawings.splice(Math.max(0, idx - 1), 0, shape);
      }
      return newDrawings;
    });
    setShowDropdown(false);
    setShowVisualOrder(false);
  };

  const MoreMenu = () => (
    <div style={{ position: 'relative' }}>
      <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
        <SubMoreIcon />
      </button>
      {showDropdown && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '180px' }}>
          
          {/* Visual Order with Submenu */}
          <div 
            style={{ position: 'relative' }}
            onMouseEnter={() => setShowVisualOrder(true)}
            onMouseLeave={() => setShowVisualOrder(false)}
          >
            <button style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--tv-sub-text)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              Visual order
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            {showVisualOrder && (
              <div style={{ position: 'absolute', top: '0', right: '100%', marginRight: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 101, padding: '4px 0', minWidth: '160px' }}>
                <button onClick={() => handleVisualOrder('front')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: 'var(--tv-sub-text)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Bring to front</button>
                <button onClick={() => handleVisualOrder('back')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: 'var(--tv-sub-text)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Send to back</button>
                <button onClick={() => handleVisualOrder('forward')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: 'var(--tv-sub-text)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Bring forward</button>
                <button onClick={() => handleVisualOrder('backward')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: 'var(--tv-sub-text)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Send backward</button>
              </div>
            )}
          </div>

          <button onClick={() => { setIsSettingsOpen(true); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: 'var(--tv-sub-text)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Visibility on intervals</button>
          
          <div style={{ height: '1px', backgroundColor: 'var(--tv-sub-hover)', margin: '4px 0' }} />

          <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: 'var(--tv-sub-text)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            Clone
            <span style={{ color: 'var(--tv-sub-muted)', fontSize: '11px' }}>Ctrl + Drag</span>
          </button>
          <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: 'var(--tv-sub-text)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            Copy
            <span style={{ color: 'var(--tv-sub-muted)', fontSize: '11px' }}>Ctrl + C</span>
          </button>
          
          <div style={{ height: '1px', backgroundColor: 'var(--tv-sub-hover)', margin: '4px 0' }} />
          
          <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: 'var(--tv-sub-text)' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
        </div>
      )}
    </div>
  );
const onStrokeWidthChange = (id: string, width: number) => updateDrawing(id, { strokeWidth: width });
  const onColorChange = (id: string, color: string) => updateDrawing(id, { stroke: color });
  const onLockChange = (id: string, locked: boolean) => updateDrawing(id, { locked });
  
  // The picker's colour already carries its opacity
  const handleTargetColorChange = (color: string) => {
    setTargetFillColor(color);
    if (selectedShapeId) updateDrawing(selectedShapeId, { targetFillColor: color });
  };

  const handleStopColorChange = (color: string) => {
    setStopFillColor(color);
    if (selectedShapeId) updateDrawing(selectedShapeId, { stopFillColor: color });
  };

  const handleTextColorChange = (color: string) => {
    setTextColor(color);
    // Set global text color for new shapes
    (window as any).currentTextColor = color;
    if (selectedShapeId) updateDrawing(selectedShapeId, { textColor: color });
  };

  const handleEmojiSizeChange = (size: number) => {
    setCurrentEmojiSize(size);
    if (selectedShapeId) updateDrawing(selectedShapeId, { emojiSize: size });
  };

  const handleFontSizeChange = (size: number) => {
    setCurrentFontSize(size);
    if (selectedShapeId) updateDrawing(selectedShapeId, { fontSize: size });
  };

  const [currentWidth, setCurrentWidth] = useState(selectedShape?.strokeWidth || 2);
  const [currentColor, setCurrentColor] = useState(selectedShape?.stroke || '#9b59b6');
  const [currentFillColor, setCurrentFillColor] = useState(selectedShape?.fill || '#ffffff');
  const [targetFillColor, setTargetFillColor] = useState(selectedShape?.targetFillColor || POSITION_TARGET_FILL);
  const [stopFillColor, setStopFillColor] = useState(selectedShape?.stopFillColor || POSITION_STOP_FILL);
  const [isLocked, setIsLocked] = useState(selectedShape?.locked || false);
  const [currentEmojiSize, setCurrentEmojiSize] = useState(selectedShape?.emojiSize || 40);
  const [currentFontSize, setCurrentFontSize] = useState(selectedShape?.fontSize || 16);
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState('Style');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showWidthDropdown, setShowWidthDropdown] = useState(false);
  const [showLineStyleDropdown, setShowLineStyleDropdown] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBrushSettingsOpen, setIsBrushSettingsOpen] = useState(false);
  const [isFibonacciSettingsOpen, setIsFibonacciSettingsOpen] = useState(false);
  const [isTextSettingsOpen, setIsTextSettingsOpen] = useState(false);
  const [isEmojiSettingsOpen, setIsEmojiSettingsOpen] = useState(false);
  const [isCurveSettingsOpen, setIsCurveSettingsOpen] = useState(false);
  const [isDoubleCurveSettingsOpen, setIsDoubleCurveSettingsOpen] = useState(false);
  const [fibonacciLevels, setFibonacciLevels] = useState([
    {id: "0.000", visible: true},
    {id: "0.236", visible: true},
    {id: "0.382", visible: true},
    {id: "0.500", visible: true},
    {id: "0.618", visible: true},
    {id: "0.786", visible: true},
    {id: "1.000", visible: true},
    {id: "1.272", visible: false},
    {id: "1.414", visible: false},
    {id: "1.618", visible: false},
    {id: "2.000", visible: false},
    {id: "2.272", visible: false},
    {id: "2.414", visible: false},
    {id: "2.618", visible: false},
    {id: "3.000", visible: false},
    {id: "3.272", visible: false},
    {id: "3.414", visible: false},
    {id: "3.618", visible: false},
    {id: "4.000", visible: false},
    {id: "4.236", visible: false},
    {id: "4.414", visible: false},
    {id: "4.618", visible: false},
    {id: "4.764", visible: false}
  ]);
  const [fibonacciSettings, setFibonacciSettings] = useState({
    activeLevels: ["0.000","0.236","0.382","0.500","0.618","0.786","1.000"],
    defaultColor: selectedShape?.stroke || '#9b59b6',
    lineStyle: "solid"
  });

  // Text color state
  const [textColor, setTextColor] = useState(selectedShape?.textColor || '#ffffff');
  
  // Brush Color Picker States
  const [showBrushColorPicker, setShowBrushColorPicker] = useState(false);
  const [showBrushFillPicker, setShowBrushFillPicker] = useState(false);
  const [showBrushWidthDropdown, setShowBrushWidthDropdown] = useState(false);
  const [showHighlighterWidthDropdown, setShowHighlighterWidthDropdown] = useState(false);
  const [showArrowMarkerWidthDropdown, setShowArrowMarkerWidthDropdown] = useState(false);
  const [showHighlighterColorPicker, setShowHighlighterColorPicker] = useState(false);
  const [showArrowMarkerColorPicker, setShowArrowMarkerColorPicker] = useState(false);
  const [showArrowMarkerTextColorPicker, setShowArrowMarkerTextColorPicker] = useState(false);
  const [showArrowMarkupColorPicker, setShowArrowMarkupColorPicker] = useState(false);
  const [showArrowMarkupTextColorPicker, setShowArrowMarkupTextColorPicker] = useState(false);
  const [showArrowColorPicker, setShowArrowColorPicker] = useState(false);
  const [showHRayColorPicker, setShowHRayColorPicker] = useState(false);
  const [showHRayTextColorPicker, setShowHRayTextColorPicker] = useState(false);
  // Shared across every shape-type block below that has a plain "Border/Line/Fill/Text/
  // Target/Stop Color" swatch — only one shape type's block is ever mounted at a time
  // (selectedShapeType), so these five booleans are safe to reuse everywhere instead of
  // declaring a new one per shape.
  const [showBorderColorPicker, setShowBorderColorPicker] = useState(false);
  const [showFillColorPicker, setShowFillColorPicker] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showTargetColorPicker, setShowTargetColorPicker] = useState(false);
  const [showStopColorPicker, setShowStopColorPicker] = useState(false);
  const [showArrowWidthDropdown, setShowArrowWidthDropdown] = useState(false);
  const [showArrowStyleDropdown, setShowArrowStyleDropdown] = useState(false);
  const [showRectangleWidthDropdown, setShowRectangleWidthDropdown] = useState(false);
  const [showRectangleStyleDropdown, setShowRectangleStyleDropdown] = useState(false);
  const [showRotatedRectangleWidthDropdown, setShowRotatedRectangleWidthDropdown] = useState(false);
  const [showPathWidthDropdown, setShowPathWidthDropdown] = useState(false);
  const [showPathStyleDropdown, setShowPathStyleDropdown] = useState(false);
  const [showCircleWidthDropdown, setShowCircleWidthDropdown] = useState(false);
  const [showEllipseWidthDropdown, setShowEllipseWidthDropdown] = useState(false);
  const [showPolylineWidthDropdown, setShowPolylineWidthDropdown] = useState(false);
  const [showPolylineStyleDropdown, setShowPolylineStyleDropdown] = useState(false);
  const [showTriangleWidthDropdown, setShowTriangleWidthDropdown] = useState(false);
  const [showArcWidthDropdown, setShowArcWidthDropdown] = useState(false);
  const [showCurveWidthDropdown, setShowCurveWidthDropdown] = useState(false);
  const [showCurveStyleDropdown, setShowCurveStyleDropdown] = useState(false);
  const [showDoubleCurveWidthDropdown, setShowDoubleCurveWidthDropdown] = useState(false);
  const [showDoubleCurveStyleDropdown, setShowDoubleCurveStyleDropdown] = useState(false);
  
  // Template States
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);

  // Shared SubBar wrapper - NOT a component (to avoid unmount/remount of children on re-render).
  // Using a render function instead of an inline component preserves child instances.
  const renderSaveTemplateModal = () => showSaveTemplateModal ? (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            backgroundColor: 'rgba(0,0,0,0.5)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1000 
          }} 
          onClick={() => setShowSaveTemplateModal(false)}
        >
          <div 
            style={{ 
              backgroundColor: 'var(--tv-sub-bg)', 
              borderRadius: '8px', 
              width: '440px', 
              boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
              position: 'relative',
              overflow: 'hidden'
            }} 
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--tv-sub-text)', fontFamily: 'Inter, sans-serif' }}>Save drawing template</h3>
              <button 
                onClick={() => setShowSaveTemplateModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tv-sub-text)', padding: '4px' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '8px', fontSize: '14px', color: '#787b86' }}>New template name</div>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => { setTemplateName(e.target.value); if (saveTemplateError) setSaveTemplateError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter' && templateName) handleSaveTemplate(); if (e.key === 'Escape') setShowSaveTemplateModal(false); }}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '2px solid #2962ff',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none',
                    color: 'var(--tv-sub-text)',
                    backgroundColor: 'var(--tv-sub-bg)'
                  }}
                />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#787b86' }}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              {saveTemplateError && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: '#f23645' }}>{saveTemplateError}</div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '0 24px 24px 24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowSaveTemplateModal(false)} 
                style={{ 
                  padding: '10px 24px', 
                  borderRadius: '6px', 
                  border: '1px solid var(--tv-sub-border)', 
                  background: 'transparent', 
                  color: 'var(--tv-sub-text)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer' 
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveTemplate} 
                disabled={!templateName}
                style={{ 
                  padding: '10px 24px', 
                  borderRadius: '6px', 
                  border: 'none', 
                  background: templateName ? '#2962ff' : 'var(--tv-sub-hover)', 
                  color: templateName ? '#ffffff' : '#b2b5be',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: templateName ? 'pointer' : 'not-allowed' 
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
  ) : null;

  // Initialize global text color
  useEffect(() => {
    if (!(window as any).currentTextColor) {
      (window as any).currentTextColor = '#ffffff';
    }
  }, []);

  // Draggability State — starts near the top middle of the chart, as TradingView's does
  const [position, setPosition] = useState({ 
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 350 : 0, 
    y: 50
  });
  // Keep the bar inside the chart pane (it is positioned within it): a bar that starts or is
  // dragged past an edge — or that grows, e.g. a wider shape's bar — is pulled back in
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>('[data-subbar="true"]');
    const pane = bar?.offsetParent as HTMLElement | null;
    if (!bar || !pane) return;
    const margin = 8;
    const x = Math.max(margin, Math.min(position.x, pane.clientWidth - bar.offsetWidth - margin));
    const y = Math.max(margin, Math.min(position.y, pane.clientHeight - bar.offsetHeight - margin));
    if (x !== position.x || y !== position.y) setPosition({ x, y });
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition(prev => ({
        x: prev.x + (e.clientX - dragStart.x),
        y: prev.y + (e.clientY - dragStart.y)
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const subbars = document.querySelectorAll('[data-subbar="true"]');
      let clickedInside = false;
      subbars.forEach(bar => {
        if (bar.contains(event.target as Node)) clickedInside = true;
      });
      
      if (!clickedInside) {
        setShowDropdown(false);
        setShowTemplateDropdown(false);
        setShowWidthDropdown(false);
        setShowLineStyleDropdown(false);
        setShowFontSizeDropdown(false);
        setShowBrushColorPicker(false);
        setShowBrushFillPicker(false);
        setShowBrushWidthDropdown(false);
        setShowHighlighterWidthDropdown(false);
        setShowArrowMarkerWidthDropdown(false);
        setShowHighlighterColorPicker(false);
        setShowArrowMarkerColorPicker(false);
        setShowArrowMarkerTextColorPicker(false);
        setShowArrowMarkupColorPicker(false);
        setShowArrowMarkupTextColorPicker(false);
        setShowArrowColorPicker(false);
        setShowArrowWidthDropdown(false);
        setShowArrowStyleDropdown(false);
        setShowRectangleWidthDropdown(false);
        setShowRectangleStyleDropdown(false);
        setShowRotatedRectangleWidthDropdown(false);
        setShowPathWidthDropdown(false);
        setShowPathStyleDropdown(false);
        setShowCircleWidthDropdown(false);
        setShowEllipseWidthDropdown(false);
        setShowPolylineWidthDropdown(false);
        setShowPolylineStyleDropdown(false);
        setShowTriangleWidthDropdown(false);
        setShowArcWidthDropdown(false);
        setShowCurveWidthDropdown(false);
        setShowCurveStyleDropdown(false);
        setShowDoubleCurveWidthDropdown(false);
        setShowDoubleCurveStyleDropdown(false);
        setShowHRayColorPicker(false);
        setShowHRayTextColorPicker(false);
        setShowBorderColorPicker(false);
        setShowFillColorPicker(false);
        setShowTextColorPicker(false);
        setShowTargetColorPicker(false);
        setShowStopColorPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGripMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  // Update currentWidth, currentColor, currentFillColor, and isLocked when selectedShape changes
  // Only trigger on shape ID change (not on every property update) to prevent re-render cascades
  useEffect(() => {
    setCurrentWidth(selectedShape?.strokeWidth || 2);
    // Set blue as default color for trendlines, otherwise use shape color or default purple
    if (['trendline', 'ray', 'info_line', 'extended_line', 'trend_angle', 'horizontal_line', 'vertical_line', 'cross_line'].includes(selectedShapeType as string)) {
      setCurrentColor(selectedShape?.stroke || '#2962ff');
    } else {
      setCurrentColor(selectedShape?.stroke || '#9b59b6');
    }
    setCurrentFillColor(selectedShape?.fill || '#ffffff');
    setTargetFillColor(selectedShape?.targetFillColor || POSITION_TARGET_FILL);
    setStopFillColor(selectedShape?.stopFillColor || POSITION_STOP_FILL);
    setIsLocked(selectedShape?.locked || false);
    setCurrentEmojiSize(selectedShape?.emojiSize || 40);
    setTextColor(selectedShape?.textColor || '#ffffff');
    setCurrentFontSize(selectedShape?.fontSize || 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShapeId]);

  // Template Logic
  const fetchTemplates = async () => {
    if (!user || !selectedShapeType) return;
    try {
      const res = await backendFetch(`http://localhost:8000/api/users/templates/${user.uid}/?tool_type=${selectedShapeType}`);
      if (!res.ok) {
        const text = await res.text();
        console.error("Server responded with error:", res.status, text);
        return;
      }
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching templates:", err);
    }
  };

  useEffect(() => {
    if (showTemplateDropdown) {
      fetchTemplates();
    }
  }, [showTemplateDropdown, selectedShapeType]);

  const handleSaveTemplate = async () => {
    if (!user || !templateName || !selectedShape) return;
    
    // Define settings to save based on tool type
    const settings: any = { ...selectedShape };
    const exclude = ['id', 'type', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'locked', 'hidden'];
    exclude.forEach(key => delete settings[key]);
    
    // Override with current UI states (unsaved changes)
    settings.stroke = currentColor;
    settings.strokeWidth = currentWidth;
    if (selectedShape.fill !== undefined) settings.fill = currentFillColor;
    if (selectedShape.textColor !== undefined) settings.textColor = textColor;
    if (selectedShape.fontSize !== undefined) settings.fontSize = currentFontSize;

    setSaveTemplateError(null);
    try {
      const res = await backendFetch(`http://localhost:8000/api/users/templates/${user.uid}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          tool_type: selectedShapeType,
          settings
        })
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Save failed:", res.status, text);
        setSaveTemplateError('Could not save the template — the server may be unreachable. Please try again.');
        return;
      }

      setTemplateName('');
      setShowSaveTemplateModal(false);
      fetchTemplates();
    } catch (err) {
      console.error("Error saving template:", err);
      setSaveTemplateError('Could not save the template — the server may be unreachable. Please try again.');
    }
  };

  const applyTemplate = (template: any) => {
    if (!selectedShapeId) return;
    const s = typeof template.settings === 'string' ? JSON.parse(template.settings) : template.settings;
    
    // Apply all settings directly
    updateDrawing(selectedShapeId, s);
    
    // Update local UI states for sync
    if (s.stroke) setCurrentColor(s.stroke);
    if (s.strokeWidth) setCurrentWidth(parseInt(s.strokeWidth));
    if (s.fill) setCurrentFillColor(s.fill);
    if (s.textColor) setTextColor(s.textColor);
    if (s.fontSize) setCurrentFontSize(parseInt(s.fontSize));
    
    setShowTemplateDropdown(false);
  };

  const applyDefaultTemplate = () => {
    const defaults = {
      stroke: '#2962ff',
      strokeWidth: 2,
      fill: 'transparent',
      textColor: '#2962ff',
      fontSize: 16,
      lineStyle: 'Solid'
    };

    setCurrentColor(defaults.stroke);
    setCurrentWidth(defaults.strokeWidth);
    setCurrentFillColor(defaults.fill);
    setTextColor(defaults.textColor);
    setCurrentFontSize(defaults.fontSize);
    
    if (selectedShapeId) {
      updateDrawing(selectedShapeId, defaults);
    }
    setShowTemplateDropdown(false);
  };

  const deleteTemplate = async (id) => {
    try {
      const res = await backendFetch(`http://localhost:8000/api/users/templates/delete/${id}/`, {
        method: 'DELETE'
      });
      if (res.ok) fetchTemplates();
    } catch (err) {
      console.error("Error deleting template:", err);
    }
  };

  const TemplateButton = () => {
    const { user } = useAuth();
    const router = useRouter();

    const handleTemplateClick = () => {
      if (!user) {
        router.push("/login");
        return;
      }
      setShowTemplateDropdown(!showTemplateDropdown);
    };

    return (
    <div style={{ position: 'relative' }}>
      <button 
        className="tv-icon-btn" 
        onClick={handleTemplateClick}
        style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: showTemplateDropdown ? 'var(--tv-sub-hover)' : 'transparent' }} 
        onMouseEnter={e => !showTemplateDropdown && (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')} 
        onMouseLeave={e => !showTemplateDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <SubTemplateIcon />
      </button>

      {showTemplateDropdown && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, marginTop: '4px', 
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '220px',
          border: '1px solid var(--tv-sub-border)'
        }}>
          <div style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 600, color: '#787b86', borderBottom: '1px solid #f0f3fa' }}>Template</div>
          <button 
            onClick={() => { setShowSaveTemplateModal(true); setShowTemplateDropdown(false); }}
            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '14px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Save Drawing Template As...
          </button>
          <button 
            onClick={applyDefaultTemplate}
            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '14px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Apply Default Style
          </button>
          
          {templates.length > 0 && (
            <>
              <div style={{ height: '1px', backgroundColor: 'var(--tv-sub-hover)', margin: '4px 0' }} />
              {templates.map(tmp => (
                <div key={tmp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
                  <button 
                    onClick={() => applyTemplate(tmp)}
                    style={{ flex: 1, padding: '10px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '14px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {tmp.name}
                  </button>
                  <button 
                    onClick={() => deleteTemplate(tmp.id)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tv-sub-muted)', padding: '4px' }}
                    title="Delete template"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
    );
  };

  // Update brush color when brush tool is active
  useEffect(() => {
    if (activeTool === 'brush' && (window as any).currentBrushColor) {
      setCurrentColor((window as any).currentBrushColor);
    }
  }, [activeTool]);

  // Update brush width when brush tool is active
  useEffect(() => {
    if (activeTool === 'brush' && (window as any).currentBrushWidth) {
      setCurrentWidth((window as any).currentBrushWidth);
    }
  }, [activeTool]);

  // Update Fibonacci settings when a different shape is selected
  useEffect(() => {
    if (selectedShape?.stroke) {
      setFibonacciSettings(prev => ({
        ...prev,
        defaultColor: selectedShape.stroke
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShapeId]);

  // Load individual Fibonacci levels when a different Fibonacci is selected
  useEffect(() => {
    if (selectedShapeType === 'fibonacci' && selectedShape?.activeLevels) {
      // Update fibonacciLevels state based on the selected Fibonacci's active levels
      setFibonacciLevels(prev => prev.map(level => ({
        ...level,
        visible: selectedShape.activeLevels.includes(level.id)
      })));
      
      // Update fibonacciSettings activeLevels
      setFibonacciSettings(prev => ({
        ...prev,
        activeLevels: selectedShape.activeLevels
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShapeId]);

  const handleWidthChange = (value) => {
    const newWidth = parseInt(value);
    console.log('Width change triggered:', { 
      value, 
      newWidth, 
      selectedShapeId: selectedShape?.id, 
      selectedShapeType,
      onStrokeWidthChange: !!onStrokeWidthChange 
    });
    setCurrentWidth(newWidth);
    if (onStrokeWidthChange) {
      console.log('Calling onStrokeWidthChange with:', { id: selectedShape.id, newWidth });
      onStrokeWidthChange(selectedShape.id, newWidth);
    } else {
      console.log('onStrokeWidthChange not available');
    }
    
    // Also update global brush width when brush tool is active
    if (activeTool === 'brush' && (window as any).setBrushWidth) {
      console.log('Updating brush width globally:', newWidth);
      (window as any).setBrushWidth(newWidth);
    }
  };

  const handleColorChange = (color) => {
    setCurrentColor(color);
    if (onColorChange) {
      onColorChange(selectedShape.id, color);
    }
    
    // Also update global brush color when selected shape is brush
    if (selectedShapeType === 'brush' && (window as any).setBrushColor) {
      (window as any).setBrushColor(color);
    }
  };

  // The picker sends the colour with its opacity already applied (a plain hex means 100%)
  const handleFillColorChange = (color: string) => {
    setCurrentFillColor(color);
    if (selectedShapeId) {
      updateDrawing(selectedShapeId, { fill: color });
    }
  };

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const handleLockToggle = () => {
    const newLockedState = !isLocked;
    setIsLocked(newLockedState);
    if (onLockChange) {
      onLockChange(selectedShape.id, newLockedState);
    }
  };

  const openSettings = () => {
    if (selectedShapeType === 'fibonacci') {
      setIsFibonacciSettingsOpen(true);
      setActiveTab('Style'); // Reset to Style tab when opening
    } else {
      setIsSettingsOpen(true);
    }
  };
  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openSettings();
  };

  // Double-clicking a shape on the chart opens its settings, like its gear button
  useEffect(() => {
    const onOpen = (e: Event) => {
      if (selectedShapeId && (e as CustomEvent).detail?.id === selectedShapeId) openSettings();
    };
    window.addEventListener('tv:open-shape-settings', onOpen);
    return () => window.removeEventListener('tv:open-shape-settings', onOpen);
  });

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
  };

  const handleDropdownToggle = () => {
    setShowDropdown(!showDropdown);
  };

  const handleClone = () => {
    if (selectedShape) {
      // Create a clone with horizontal offset (logical bars) instead of price,
      // as price scales vary wildly between assets (e.g., Forex vs Crypto).
      const clone = {
        ...selectedShape,
        id: `${selectedShape.type}-${Date.now()}`, // Unique ID
        points: selectedShape.points ? 
          selectedShape.points.map(point => ({
            ...point,
            logical: point.logical + 5 // Offset by 5 bars horizontally
          })) : 
          selectedShape.coordinates ? 
            selectedShape.coordinates.map(coord => ({
              ...coord,
              x: coord.x + 20, // Offset x for visibility
              y: coord.y + 20  // Offset y for visibility
            })) : 
            null
      };
      
      // Add clone to drawings via context
      addDrawing(clone);
      // Select the new clone
      setSelectedShapeId(clone.id);
    }
    setShowDropdown(false);
  };

  const handleDelete = () => {
    if (selectedShapeId) {
      deleteDrawing(selectedShapeId);
    }
  };

  // More → Copy: same as Ctrl+C — the drawing goes on the drawing clipboard for Ctrl+V
  const handleCopy = () => {
    if (!selectedShape) return;
    (window as any).__copiedDrawings = JSON.parse(JSON.stringify([selectedShape]));
  };

  // "Add alert": opens Create Alert at the drawing's price — its latest point, which for
  // a line is where it currently ends and for a level/ray is the level itself
  const handleCreateAlert = () => {
    const pts = selectedShape?.points || [];
    const last = pts[pts.length - 1];
    const price = typeof last?.price === 'number' ? last.price : undefined;
    window.dispatchEvent(new CustomEvent('tv:create-alert', { detail: { price } }));
  };

  // "Create order" on a long/short position: opens the order panel on that side
  const handleCreateOrder = () => {
    window.dispatchEvent(new CustomEvent('tv:open-order-panel', { detail: { side: selectedShapeType === 'short_position' ? 'sell' : 'buy' } }));
  };

  const handleHide = () => {
    if (selectedShapeId) {
      updateDrawing(selectedShapeId, { visible: false });
      setSelectedShapeId(null); // Deselect after hiding
    }
    setShowDropdown(false);
  };

  const handleFibonacciLevelToggle = (levelId, checked) => {
    // Update levels state
    const updatedLevels = fibonacciLevels.map(level => 
      level.id === levelId ? { ...level, visible: checked } : level
    );
    setFibonacciLevels(updatedLevels);
    
    // Update active levels in settings
    const updatedActiveLevels = updatedLevels
      .filter(level => level.visible)
      .map(level => level.id);
    
    const updatedSettings = {
      ...fibonacciSettings,
      activeLevels: updatedActiveLevels
    };
    setFibonacciSettings(updatedSettings);
    
    // Handle edge case: no levels selected
    if (updatedActiveLevels.length === 0) {
      console.log('No Fibonacci levels selected - removing Fibonacci object');
      // TODO: Implement removeFibonacciObject function
      if ((window as any).removeFibonacciObject) {
        (window as any).removeFibonacciObject(selectedShape?.id);
      }
      return;
    }
    
    // Add or remove level from chart
    if (checked) {
      addFibonacciLevel(levelId);
    } else {
      removeFibonacciLevel(levelId);
    }
    
    // Update the specific Fibonacci drawing with its active levels
    if (selectedShape && selectedShapeType === 'fibonacci') {
      if ((window as any).updateFibonacciDrawingLevels) {
        (window as any).updateFibonacciDrawingLevels(selectedShape.id, updatedActiveLevels);
      }
    }
    
    // Update chart immediately (updateChartOnChange: true)
    if ((window as any).updateFibonacciLevels && selectedShape) {
      (window as any).updateFibonacciLevels(selectedShape.id, updatedActiveLevels);
    }
  };

  const addFibonacciLevel = (levelId) => {
    // Add level to chart rendering
    console.log(`Adding Fibonacci level: ${levelId}`);
    // TODO: Implement actual chart update logic
    if ((window as any).addFibonacciLevel && selectedShape) {
      (window as any).addFibonacciLevel(selectedShape.id, levelId);
    }
  };

  const removeFibonacciLevel = (levelId) => {
    // Remove level from chart rendering
    console.log(`Removing Fibonacci level: ${levelId}`);
    // TODO: Implement actual chart update logic
    if ((window as any).removeFibonacciLevel && selectedShape) {
      (window as any).removeFibonacciLevel(selectedShape.id, levelId);
    }
  };

  const handleFibonacciColorChange = (color) => {
    const updatedSettings = {
      ...fibonacciSettings,
      defaultColor: color
    };
    setFibonacciSettings(updatedSettings);
    
    // Also update the main SubBar color to keep them in sync
    setCurrentColor(color);
    
    // Like TradingView, the toolbar colour paints every level: the fib switches to one colour
    if (selectedShape) {
      updateDrawing(selectedShape.id, { stroke: color, useOneColor: true, oneColor: color } as any);
    }
    
    // Update chart color
    if ((window as any).updateFibonacciColor && selectedShape) {
      (window as any).updateFibonacciColor(selectedShape.id, color);
    }
  };

  const handleLineStyleChange = (style) => {
    const updatedSettings = {
      ...fibonacciSettings,
      lineStyle: style
    };
    setFibonacciSettings(updatedSettings);
    
    // Update chart line style
    if ((window as any).updateFibonacciLineStyle && selectedShape) {
      (window as any).updateFibonacciLineStyle(selectedShape.id, style);
    }
  };

  const handleSubBarClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent document/chart click handler from firing
  };

  const handleSliderInteraction = (e) => {
    e.stopPropagation(); // Only prevent bubbling, allow default behavior
  };

  const handleMouseDown = (e) => {
    e.stopPropagation(); // Only prevent bubbling, allow default behavior
  };

  const handleMouseUp = (e) => {
    e.stopPropagation(); // Only prevent bubbling, allow default behavior
  };

  // Only show when a shape is selected
  if (!selectedShape) return null;

  // Rectangle SubBar
  if (selectedShapeType === 'rectangle') {
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Border Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Border Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={currentColor || '#9b59b6'} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={currentColor || '#9b59b6'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Background Color (Paint Bucket) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFillColorPicker(v => !v)} className="tv-icon-btn" title="Background Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={currentFillColor || '#9b59b633'} />
        </button>
          {showFillColorPicker && (
            <ColorPickerPopup
              colorStr={currentFillColor || '#9b59b633'}
              onChange={c => handleFillColorChange(c)}
              onClose={() => setShowFillColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Text Color (T) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTextColorPicker(v => !v)} className="tv-icon-btn" title="Text Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTextIcon />
          <SubColorBar color={textColor || '#9b59b6'} />
        </button>
          {showTextColorPicker && (
            <ColorPickerPopup
              colorStr={textColor || '#ffffff'}
              onChange={c => handleTextColorChange(c)}
              onClose={() => setShowTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowRectangleWidthDropdown(!showRectangleWidthDropdown)}
            style={{ width: 'auto', padding: '0 6px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubWidthLabel width={currentWidth} />
          </button>
          {showRectangleWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowRectangleWidthDropdown(false); }} onClose={() => setShowRectangleWidthDropdown(false)} />}
        </div>

        {/* Line Style */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowRectangleStyleDropdown(!showRectangleStyleDropdown)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubLineStyleIcon style={selectedShape?.lineStyle} />
          </button>
          {showRectangleStyleDropdown && <TvLineStyleMenu value={selectedShape?.lineStyle} values={['Solid', 'Dashed', 'Dotted']} onPick={(style) => { updateDrawing(selectedShape.id, { lineStyle: style }); setShowRectangleStyleDropdown(false); }} onClose={() => setShowRectangleStyleDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Alert (Alarm Clock) */}
        <button className="tv-icon-btn" title="Add alert" onClick={handleCreateAlert} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubAlertIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <RectangleSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Path SubBar
  if (selectedShapeType === 'path') {
    const themeColor = currentColor || '#2962ff';
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Line Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Line Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={themeColor} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={themeColor || '#2962ff'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowPathWidthDropdown(!showPathWidthDropdown)}
            style={{ width: '54px', height: '34px', color: themeColor, borderRadius: '4px', border: 'none', background: 'var(--tv-sub-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          >
            <div style={{ width: '12px', height: '1px', backgroundColor: themeColor }} />
            <SubWidthLabel width={currentWidth} />
          </button>
          {showPathWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowPathWidthDropdown(false); }} onClose={() => setShowPathWidthDropdown(false)} />}
        </div>

        {/* Line Style */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowPathStyleDropdown(!showPathStyleDropdown)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubLineStyleIcon style={selectedShape?.lineStyle} />
          </button>
          {showPathStyleDropdown && <TvLineStyleMenu value={selectedShape?.lineStyle} values={['Solid', 'Dashed', 'Dotted']} onPick={(style) => { updateDrawing(selectedShape.id, { lineStyle: style }); setShowPathStyleDropdown(false); }} onClose={() => setShowPathStyleDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <PathSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }
  // Rotated Rectangle SubBar
  if (selectedShapeType === 'rotated_rectangle') {
    const themeColor = currentColor || '#4caf50';
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Border Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Border Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={themeColor} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={themeColor || '#2962ff'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Background Color (Paint Bucket) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFillColorPicker(v => !v)} className="tv-icon-btn" title="Background Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={currentFillColor || themeColor + '33'} />
        </button>
          {showFillColorPicker && (
            <ColorPickerPopup
              colorStr={currentFillColor || '#9b59b633'}
              onChange={c => handleFillColorChange(c)}
              onClose={() => setShowFillColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowRotatedRectangleWidthDropdown(!showRotatedRectangleWidthDropdown)}
            style={{ width: 'auto', padding: '0 6px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubWidthLabel width={currentWidth} />
          </button>
          {showRotatedRectangleWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowRotatedRectangleWidthDropdown(false); }} onClose={() => setShowRotatedRectangleWidthDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <RotatedRectangleSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }
  // Arrow (Thin Line) SubBar
  if (selectedShapeType === 'arrow') {
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Line Color */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowArrowColorPicker(!showArrowColorPicker)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubPencilIcon />
            <SubColorBar color={currentColor || '#2962ff'} />
          </button>
          {showArrowColorPicker && (
            <ColorPickerPopup 
              colorStr={currentColor || '#2962ff'}
              onChange={(color) => {
                handleColorChange(color);
                setShowArrowColorPicker(false);
              }}
              onClose={() => setShowArrowColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowArrowWidthDropdown(!showArrowWidthDropdown)}
            style={{ width: 'auto', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubWidthLabel width={currentWidth} />
          </button>
          {showArrowWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowArrowWidthDropdown(false); }} onClose={() => setShowArrowWidthDropdown(false)} />}
        </div>

        {/* Line Style (Solid/Dash/Dot) */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowArrowStyleDropdown(!showArrowStyleDropdown)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubLineStyleIcon style={selectedShape?.lineStyle} />
          </button>
          {showArrowStyleDropdown && <TvLineStyleMenu value={selectedShape?.lineStyle} values={['Solid', 'Dashed', 'Dotted']} onPick={(style) => { updateDrawing(selectedShape.id, { lineStyle: style }); setShowArrowStyleDropdown(false); }} onClose={() => setShowArrowStyleDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <ArrowSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Arrow Marker SubBar
  if (selectedShapeType === 'arrow_marker') {
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Arrow Color â€” pencil with color underline */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowArrowMarkerColorPicker(!showArrowMarkerColorPicker)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubPencilIcon />
            <SubColorBar color={currentColor || '#2962ff'} />
          </button>
          {showArrowMarkerColorPicker && (
            <ColorPickerPopup 
              colorStr={currentColor || '#2962ff'}
              onChange={(color) => {
                handleColorChange(color);
                setShowArrowMarkerColorPicker(false);
              }}
              onClose={() => setShowArrowMarkerColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Thickness Dropdown */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowArrowMarkerWidthDropdown(!showArrowMarkerWidthDropdown)}
            style={{ width: 'auto', padding: '0 6px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubWidthLabel width={currentWidth} />
          </button>
          {showArrowMarkerWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowArrowMarkerWidthDropdown(false); }} onClose={() => setShowArrowMarkerWidthDropdown(false)} />}
        </div>

        {/* Text Color â€” T with color underline */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowArrowMarkerTextColorPicker(!showArrowMarkerTextColorPicker)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubTextIcon />
            <SubColorBar color={textColor || '#2962ff'} />
          </button>
          {showArrowMarkerTextColorPicker && (
            <ColorPickerPopup 
              colorStr={textColor || '#2962ff'}
              onChange={(color) => {
                handleTextColorChange(color);
                setShowArrowMarkerTextColorPicker(false);
              }}
              onClose={() => setShowArrowMarkerTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <ArrowMarkerSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Arrow Markup (Up/Down) SubBar
  if (selectedShapeType === 'arrow_mark_up' || selectedShapeType === 'arrow_mark_down') {
    const isUp = selectedShapeType === 'arrow_mark_up';
    const markupColor = currentColor || '#009688';
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Arrow Color */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowArrowMarkupColorPicker(!showArrowMarkupColorPicker)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubPencilIcon />
            <SubColorBar color={markupColor} />
          </button>
          {showArrowMarkupColorPicker && (
            <ColorPickerPopup 
              colorStr={markupColor}
              onChange={(color) => {
                handleColorChange(color);
                setShowArrowMarkupColorPicker(false);
              }}
              onClose={() => setShowArrowMarkupColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Text Color */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowArrowMarkupTextColorPicker(!showArrowMarkupTextColorPicker)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubTextIcon />
            <SubColorBar color={textColor || '#009688'} />
          </button>
          {showArrowMarkupTextColorPicker && (
            <ColorPickerPopup 
              colorStr={textColor || '#009688'}
              onChange={(color) => {
                handleTextColorChange(color);
                setShowArrowMarkupTextColorPicker(false);
              }}
              onClose={() => setShowArrowMarkupTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <ArrowMarkupSettingsModal type={selectedShapeType as any} onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Highlighter SubBar
  if (selectedShapeType === 'highlighter') {
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          padding: '2px 4px',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Line Color â€” pencil with color underline */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowHighlighterColorPicker(!showHighlighterColorPicker)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} 
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubPencilIcon />
            <SubColorBar color={currentColor || '#ff0000'} />
          </button>
          {showHighlighterColorPicker && (
            <ColorPickerPopup 
              colorStr={currentColor}
              onChange={(color) => {
                handleColorChange(color);
                setShowHighlighterColorPicker(false);
              }}
              onClose={() => setShowHighlighterColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Wavy brush stroke icon and thickness dropdown */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowHighlighterWidthDropdown(!showHighlighterWidthDropdown)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              height: '34px', 
              padding: '0 8px', 
              gap: '6px', 
              color: 'var(--tv-sub-text)', 
              borderRadius: '4px', 
              border: 'none', 
              background: showHighlighterWidthDropdown ? 'var(--tv-sub-hover)' : 'transparent' 
            }} 
            onMouseEnter={(e) => !showHighlighterWidthDropdown && (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')} 
            onMouseLeave={(e) => !showHighlighterWidthDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12 C5 9, 7 15, 9 12 S 13 9, 15 12 S 19 15, 21 12"></path>
            </svg>
            <SubWidthLabel width={currentWidth} />
            
          </button>
          
          {showHighlighterWidthDropdown && (
            <div style={{ 
              position: 'absolute', 
              top: '100%', 
              left: '0', 
              marginTop: '4px', 
              backgroundColor: 'var(--tv-sub-bg)', 
              border: '1px solid var(--tv-sub-border)', 
              borderRadius: '6px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
              zIndex: 100, 
              padding: '4px',
              minWidth: '100px'
            }}>
              {[8, 12, 20, 32, 48, 64, 80, 96].map(width => (
                <div 
                  key={width}
                  onClick={() => {
                    handleWidthChange(width.toString());
                    setShowHighlighterWidthDropdown(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    backgroundColor: currentWidth === width ? 'var(--tv-sub-text)' : 'transparent',
                    color: currentWidth === width ? 'var(--tv-sub-bg)' : 'var(--tv-sub-text)',
                    fontSize: '13px',
                    fontWeight: 500
                  }}
                  onMouseEnter={(e) => {
                    if (currentWidth !== width) e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (currentWidth !== width) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: '13px' }}>{width}px</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <HighlighterSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Triangle SubBar
  if (selectedShapeType === 'triangle') {
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          padding: '2px 4px',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Border Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Border Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={currentColor} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={currentColor || '#9b59b6'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Background Color (Paint Bucket) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFillColorPicker(v => !v)} className="tv-icon-btn" title="Background Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={currentFillColor === 'transparent' ? '#ccc' : currentFillColor} />
        </button>
          {showFillColorPicker && (
            <ColorPickerPopup
              colorStr={currentFillColor || '#9b59b633'}
              onChange={c => handleFillColorChange(c)}
              onClose={() => setShowFillColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowTriangleWidthDropdown(!showTriangleWidthDropdown)}
            style={{ width: '54px', height: '34px', color: currentColor, borderRadius: '4px', border: 'none', background: 'var(--tv-sub-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          >
            <div style={{ width: '12px', height: '1px', backgroundColor: currentColor }} />
            <SubWidthLabel width={currentWidth} />
          </button>
          {showTriangleWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowTriangleWidthDropdown(false); }} onClose={() => setShowTriangleWidthDropdown(false)} />}
        </div>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isSettingsOpen && (
        <TriangleSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Trendline SubBar
  if (['trendline', 'ray', 'info_line', 'extended_line', 'trend_angle'].includes(selectedShapeType)) {
    return (
      <>
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          padding: '2px 4px',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Icon */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}
        >
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Line Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Line Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          {/* Dynamic underline */}
          <SubColorBar color={currentColor || '#2962ff'} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={currentColor || '#9b59b6'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Text Color (T) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTextColorPicker(v => !v)} className="tv-icon-btn" title="Text Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTextIcon />
          {/* Dynamic underline */}
          <SubColorBar color={textColor || '#2962ff'} />
        </button>
          {showTextColorPicker && (
            <ColorPickerPopup
              colorStr={textColor || '#ffffff'}
              onChange={c => handleTextColorChange(c)}
              onClose={() => setShowTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowWidthDropdown(!showWidthDropdown)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              width: 'auto', 
              height: '34px', 
              padding: '0 8px', 
              gap: '6px', 
              color: 'var(--tv-sub-text)', 
              borderRadius: '4px', 
              border: 'none', 
              background: showWidthDropdown ? 'var(--tv-sub-hover)' : 'transparent' 
            }} 
            onMouseEnter={(e) => !showWidthDropdown && (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')} 
            onMouseLeave={(e) => !showWidthDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <SubWidthLabel width={currentWidth} />
            
          </button>
          
          {showWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(width) => {
                    setCurrentWidth(width);
                    if (selectedShapeId) onStrokeWidthChange(selectedShapeId, width);
                    setShowWidthDropdown(false);
                  }} onClose={() => setShowWidthDropdown(false)} />}
        </div>

        {/* Line Style */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowLineStyleDropdown(!showLineStyleDropdown)}
            style={{ 
              width: '34px', 
              height: '34px', 
              color: 'var(--tv-sub-text)', 
              borderRadius: '4px', 
              border: 'none', 
              background: showLineStyleDropdown ? 'var(--tv-sub-hover)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }} 
            onMouseEnter={(e) => !showLineStyleDropdown && (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')} 
            onMouseLeave={(e) => !showLineStyleDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {selectedShape?.lineStyle === 'dashed' ? (
              <div style={{ width: '16px', height: '1px', borderTop: '1px dashed currentColor' }}></div>
            ) : selectedShape?.lineStyle === 'dotted' ? (
              <div style={{ width: '16px', height: '1px', borderTop: '1px dotted currentColor' }}></div>
            ) : (
              <div style={{ width: '16px', height: '1px', backgroundColor: 'currentColor' }}></div>
            )}
          </button>

          {showLineStyleDropdown && <TvLineStyleMenu value={selectedShape?.lineStyle || 'solid'} values={['solid', 'dashed', 'dotted']} onPick={(style) => {
                    if (selectedShapeId) updateDrawing(selectedShapeId, { lineStyle: style as any });
                    setShowLineStyleDropdown(false);
                  }} onClose={() => setShowLineStyleDropdown(false)} />}
        </div>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Alert Clock Plus */}
        <button className="tv-icon-btn" title="Add alert" onClick={handleCreateAlert} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubAlertIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isSettingsOpen && (
        <TrendlineSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Horizontal Ray SubBar — same layout as the trend line's, minus Extend Left/Right
  // (a ray has no left side and always extends right by definition, so that option
  // wouldn't mean anything here).
  if (selectedShapeType === 'horizontal_ray' || selectedShapeType === 'horizontal_line' || selectedShapeType === 'vertical_line' || selectedShapeType === 'cross_line') {
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          padding: '2px 4px',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Icon */}
        <div
          onMouseDown={handleGripMouseDown}
          style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}
        >
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Line Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button
            className="tv-icon-btn" title="Line Color"
            onClick={() => setShowHRayColorPicker(!showHRayColorPicker)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubPencilIcon />
            <SubColorBar color={currentColor || '#2962ff'} />
          </button>
          {showHRayColorPicker && (
            <ColorPickerPopup
              colorStr={currentColor || '#2962ff'}
              onChange={(color) => { handleColorChange(color); }}
              onClose={() => setShowHRayColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Text Color (T) */}
        <div style={{ position: 'relative' }}>
          <button
            className="tv-icon-btn" title="Text Color"
            onClick={() => setShowHRayTextColorPicker(!showHRayTextColorPicker)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubTextIcon />
            <SubColorBar color={textColor || '#2962ff'} />
          </button>
          {showHRayTextColorPicker && (
            <ColorPickerPopup
              colorStr={textColor || '#2962ff'}
              onChange={(color) => { handleTextColorChange(color); }}
              onClose={() => setShowHRayTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button
            className="tv-icon-btn"
            onClick={() => setShowWidthDropdown(!showWidthDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: 'auto',
              height: '34px',
              padding: '0 8px',
              gap: '6px',
              color: 'var(--tv-sub-text)',
              borderRadius: '4px',
              border: 'none',
              background: showWidthDropdown ? 'var(--tv-sub-hover)' : 'transparent'
            }}
            onMouseEnter={(e) => !showWidthDropdown && (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')}
            onMouseLeave={(e) => !showWidthDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <SubWidthLabel width={currentWidth} />
            
          </button>

          {showWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(width) => {
                    setCurrentWidth(width);
                    if (selectedShapeId) onStrokeWidthChange(selectedShapeId, width);
                    setShowWidthDropdown(false);
                  }} onClose={() => setShowWidthDropdown(false)} />}
        </div>

        {/* Line Style */}
        <div style={{ position: 'relative' }}>
          <button
            className="tv-icon-btn"
            onClick={() => setShowLineStyleDropdown(!showLineStyleDropdown)}
            style={{
              width: '34px',
              height: '34px',
              color: 'var(--tv-sub-text)',
              borderRadius: '4px',
              border: 'none',
              background: showLineStyleDropdown ? 'var(--tv-sub-hover)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => !showLineStyleDropdown && (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')}
            onMouseLeave={(e) => !showLineStyleDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {selectedShape?.lineStyle === 'dashed' ? (
              <div style={{ width: '16px', height: '1px', borderTop: '1px dashed currentColor' }}></div>
            ) : selectedShape?.lineStyle === 'dotted' ? (
              <div style={{ width: '16px', height: '1px', borderTop: '1px dotted currentColor' }}></div>
            ) : (
              <div style={{ width: '16px', height: '1px', backgroundColor: 'currentColor' }}></div>
            )}
          </button>

          {showLineStyleDropdown && <TvLineStyleMenu value={selectedShape?.lineStyle || 'solid'} values={['solid', 'dashed', 'dotted']} onPick={(style) => {
                    if (selectedShapeId) updateDrawing(selectedShapeId, { lineStyle: style as any });
                    setShowLineStyleDropdown(false);
                  }} onClose={() => setShowLineStyleDropdown(false)} />}
        </div>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Alert Clock Plus */}
        <button className="tv-icon-btn" title="Add alert" onClick={handleCreateAlert} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubAlertIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isSettingsOpen && (
        <HorizontalRaySettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Rectangle SubBar
  if (selectedShapeType === 'rectangle' || selectedShapeType === 'rotated_rectangle') {
    return (
      <>
      <div data-subbar="true" className="absolute top-20 right-4 bg-gray-800 rounded-lg shadow-lg px-4 py-2 flex items-center space-x-3 z-50 pointer-events-auto" style={{ maxWidth: '20vw' }} onClick={handleSubBarClick}>
        <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
          {/* Delete */}
          <button
            className="p-1.5 bg-red-600 text-white rounded hover:bg-red-700"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            <SubTrashIcon />
          </button>

          {/* Move */}
          <button
            className="p-1.5 bg-gray-700 text-gray-400 rounded hover:bg-gray-600"
            title="Move"
            onClick={(e) => e.stopPropagation()}
          >
            <Move size={14} />
          </button>

          {/* Width Slider */}
          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-gray-400">W:</span>
            <input
              type="range"
              min="1"
              max="10"
              value={currentWidth}
              onChange={(e) => {
                e.stopPropagation();
                handleWidthChange(e.target.value);
              }}
              className="w-10 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-white w-6">{currentWidth}</span>
          </div>

          {/* Boundary Color */}
          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
            <Palette size={14} className="text-gray-400" />
            <PaletteInput
              value={currentColor}
              onChange={(e) => {
                e.stopPropagation();
                handleColorChange(e.target.value);
              }}
              className="w-5 h-5 rounded cursor-pointer"
            />
          </div>

          {/* Fill Color */}
          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
            <Square size={14} className="text-gray-400" />
            <PaletteInput
              value={parseColorInput(currentFillColor).hex}
              onChange={(e) => {
                e.stopPropagation();
                const { opacity } = parseColorInput(currentFillColor);
                handleFillColorChange(opacity === 100 || e.target.value.startsWith('rgb') ? e.target.value : hexToRgba(e.target.value, opacity / 100));
              }}
              className="w-5 h-5 rounded cursor-pointer"
            />
          </div>

          {/* Text Color */}
          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-gray-400">T</span>
            <PaletteInput
              value="#ffffff"
              onChange={(e) => {
                e.stopPropagation();
                // TODO: Add text color logic
              }}
              className="w-5 h-5 rounded cursor-pointer"
            />
          </div>

          {/* Lock Toggle */}
          <button
            className="p-1.5 bg-gray-700 text-gray-400 rounded hover:bg-gray-600"
            title={isLocked ? "Unlock shape" : "Lock shape"}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleLockToggle();
            }}
          >
            {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>

          {/* More Options Dropdown */}
          <div className="relative">
            <button
              className="p-1.5 bg-gray-700 text-gray-400 rounded hover:bg-gray-600"
              title="More Options"
              onClick={(e) => {
                e.stopPropagation();
                handleDropdownToggle();
              }}
            >
              <SubMoreIcon />
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div className="absolute top-full right-0 mt-1 w-32 bg-gray-800 border border-gray-600 rounded shadow-lg z-50">
                <button 
                  className="w-full px-3 py-2 text-left text-white hover:bg-gray-700 transition-colors text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClone();
                  }}
                >
                  Clone
                </button>
                <button className="w-full px-3 py-2 text-left text-white hover:bg-gray-700 transition-colors text-sm">
                  Copy
                </button>
                <button className="w-full px-3 py-2 text-left text-white hover:bg-gray-700 transition-colors text-sm">
                  Hide
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Shape Type Indicator */}
        <div className="ml-2 pl-2 border-l border-gray-600">
          <span className="text-xs text-gray-400 capitalize">
            Rectangle
          </span>
        </div>
      </div>
      {renderSaveTemplateModal()}</>
    );
  }

  // Circle SubBar
  if (selectedShapeType === 'circle') {
    const themeColor = currentColor || '#ffa000';
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Border Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Border Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={themeColor} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={themeColor || '#2962ff'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Background Color (Paint Bucket) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFillColorPicker(v => !v)} className="tv-icon-btn" title="Background Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={currentFillColor === 'transparent' ? '#ccc' : currentFillColor} />
        </button>
          {showFillColorPicker && (
            <ColorPickerPopup
              colorStr={currentFillColor || '#9b59b633'}
              onChange={c => handleFillColorChange(c)}
              onClose={() => setShowFillColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Text Color (T) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTextColorPicker(v => !v)} className="tv-icon-btn" title="Text Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTextIcon />
          <SubColorBar color={textColor || '#ffa000'} />
        </button>
          {showTextColorPicker && (
            <ColorPickerPopup
              colorStr={textColor || '#ffffff'}
              onChange={c => handleTextColorChange(c)}
              onClose={() => setShowTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowCircleWidthDropdown(!showCircleWidthDropdown)}
            style={{ width: '56px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubWidthLabel width={currentWidth} />
          </button>
          {showCircleWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowCircleWidthDropdown(false); }} onClose={() => setShowCircleWidthDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Alert (Alarm Clock) */}
        <button className="tv-icon-btn" title="Add alert" onClick={handleCreateAlert} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubAlertIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <CircleSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Ellipse SubBar
  if (selectedShapeType === 'ellipse') {
    const themeColor = currentColor || '#f7525f';
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Border Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Border Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={themeColor} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={themeColor || '#2962ff'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Background Color (Paint Bucket) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFillColorPicker(v => !v)} className="tv-icon-btn" title="Background Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={currentFillColor === 'transparent' ? '#ccc' : currentFillColor} />
        </button>
          {showFillColorPicker && (
            <ColorPickerPopup
              colorStr={currentFillColor || '#9b59b633'}
              onChange={c => handleFillColorChange(c)}
              onClose={() => setShowFillColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Text Color (T) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTextColorPicker(v => !v)} className="tv-icon-btn" title="Text Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTextIcon />
          <SubColorBar color={textColor || '#f7525f'} />
        </button>
          {showTextColorPicker && (
            <ColorPickerPopup
              colorStr={textColor || '#ffffff'}
              onChange={c => handleTextColorChange(c)}
              onClose={() => setShowTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowEllipseWidthDropdown(!showEllipseWidthDropdown)}
            style={{ width: '56px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubWidthLabel width={currentWidth} />
          </button>
          {showEllipseWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowEllipseWidthDropdown(false); }} onClose={() => setShowEllipseWidthDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <EllipseSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Polyline SubBar
  if (selectedShapeType === 'polyline') {
    const themeColor = currentColor || '#00bcd4';
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Border Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Border Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={themeColor} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={themeColor || '#2962ff'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Background Color (Paint Bucket) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFillColorPicker(v => !v)} className="tv-icon-btn" title="Background Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={currentFillColor === 'transparent' ? '#ccc' : currentFillColor} />
        </button>
          {showFillColorPicker && (
            <ColorPickerPopup
              colorStr={currentFillColor || '#9b59b633'}
              onChange={c => handleFillColorChange(c)}
              onClose={() => setShowFillColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowPolylineWidthDropdown(!showPolylineWidthDropdown)}
            style={{ width: '54px', height: '34px', color: themeColor, borderRadius: '4px', border: 'none', background: 'var(--tv-sub-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          >
            <div style={{ width: '12px', height: '1px', backgroundColor: themeColor }} />
            <SubWidthLabel width={currentWidth} />
          </button>
          {showPolylineWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowPolylineWidthDropdown(false); }} onClose={() => setShowPolylineWidthDropdown(false)} />}
        </div>

        {/* Line Style */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowPolylineStyleDropdown(!showPolylineStyleDropdown)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubLineStyleIcon style={selectedShape?.lineStyle} />
          </button>
          {showPolylineStyleDropdown && <TvLineStyleMenu value={selectedShape?.lineStyle} values={['Solid', 'Dashed', 'Dotted']} onPick={(style) => { updateDrawing(selectedShape.id, { lineStyle: style }); setShowPolylineStyleDropdown(false); }} onClose={() => setShowPolylineStyleDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <PolylineSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Curve SubBar
  if (selectedShapeType === 'curve') {
    const themeColor = currentColor || '#2962ff';
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Line Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Line Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={themeColor} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={themeColor || '#2962ff'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width/Style */}
        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowCurveWidthDropdown(!showCurveWidthDropdown)}
            style={{ width: '54px', height: '34px', color: themeColor, borderRadius: '4px', border: 'none', background: 'var(--tv-sub-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          >
            <div style={{ width: '12px', height: '1px', backgroundColor: themeColor }} />
            <SubWidthLabel width={currentWidth} />
          </button>
          {showCurveWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowCurveWidthDropdown(false); }} onClose={() => setShowCurveWidthDropdown(false)} />}
        </div>

        {/* Line Style */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowCurveStyleDropdown(!showCurveStyleDropdown)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubLineStyleIcon style={selectedShape?.lineStyle} />
          </button>
          {showCurveStyleDropdown && <TvLineStyleMenu value={selectedShape?.lineStyle} values={['Solid', 'Dashed', 'Dotted']} onPick={(style) => { updateDrawing(selectedShape.id, { lineStyle: style }); setShowCurveStyleDropdown(false); }} onClose={() => setShowCurveStyleDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <CurveSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Arc SubBar
  if (selectedShapeType === 'arc') {
    const themeColor = currentColor || '#e91e63';
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Border Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Border Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={themeColor} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={themeColor || '#2962ff'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Background Color (Paint Bucket) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFillColorPicker(v => !v)} className="tv-icon-btn" title="Background Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={currentFillColor === 'transparent' ? '#ccc' : currentFillColor} />
        </button>
          {showFillColorPicker && (
            <ColorPickerPopup
              colorStr={currentFillColor || '#9b59b633'}
              onChange={c => handleFillColorChange(c)}
              onClose={() => setShowFillColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width/Style */}
        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowArcWidthDropdown(!showArcWidthDropdown)}
            style={{ width: '54px', height: '34px', color: themeColor, borderRadius: '4px', border: 'none', background: 'var(--tv-sub-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          >
            <div style={{ width: '12px', height: '1px', backgroundColor: themeColor }} />
            <SubWidthLabel width={currentWidth} />
          </button>
          {showArcWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowArcWidthDropdown(false); }} onClose={() => setShowArcWidthDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <ArcSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Double Curve SubBar
  if (selectedShapeType === 'double_curve') {
    const themeColor = currentColor || '#673ab7';
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', alignItems: 'center', height: '34px' }}>
          <SubGripIcon />
        </div>

        <TemplateButton />

        {/* Line Color (Pencil) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Line Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={themeColor} />
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={themeColor || '#2962ff'}
              onChange={c => handleColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width/Style */}
        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowDoubleCurveWidthDropdown(!showDoubleCurveWidthDropdown)}
            style={{ width: '54px', height: '34px', color: themeColor, borderRadius: '4px', border: 'none', background: 'var(--tv-sub-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          >
            <div style={{ width: '12px', height: '1px', backgroundColor: themeColor }} />
            <SubWidthLabel width={currentWidth} />
          </button>
          {showDoubleCurveWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(w) => { handleWidthChange(w); setShowDoubleCurveWidthDropdown(false); }} onClose={() => setShowDoubleCurveWidthDropdown(false)} />}
        </div>

        {/* Line Style */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowDoubleCurveStyleDropdown(!showDoubleCurveStyleDropdown)}
            style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubLineStyleIcon style={selectedShape?.lineStyle} />
          </button>
          {showDoubleCurveStyleDropdown && <TvLineStyleMenu value={selectedShape?.lineStyle} values={['Solid', 'Dashed', 'Dotted']} onPick={(style) => { updateDrawing(selectedShape.id, { lineStyle: style }); setShowDoubleCurveStyleDropdown(false); }} onClose={() => setShowDoubleCurveStyleDropdown(false)} />}
        </div>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>
        {/* More */}
        <MoreMenu />
      </div>
      {isSettingsOpen && (
        <DoubleCurveSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }


  // Long Position SubBar
  if (selectedShapeType === 'long_position') {
    const targetColor = targetFillColor || 'rgba(76, 175, 80, 0.4)';
    const stopColor = stopFillColor || 'rgba(244, 67, 54, 0.4)';
    const currentLineColor = currentColor || '#787b86';
    
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', gap: '2px', alignItems: 'center', height: '34px', color: 'var(--tv-sub-muted)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[1,2,3,4].map(i => <div key={i} style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[1,2,3,4].map(i => <div key={i} style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }} />)}
          </div>
        </div>

        {/* Template (Four squares with plus) */}
        <button className="tv-icon-btn" title="Template" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTemplateIcon />
        </button>

        {/* Text Tool */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTextColorPicker(v => !v)} className="tv-icon-btn" title="Text Tool" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTextIcon />
          <SubColorBar color={textColor || '#e0e3eb'} />
        </button>
          {showTextColorPicker && (
            <ColorPickerPopup
              colorStr={textColor || '#ffffff'}
              onChange={c => handleTextColorChange(c)}
              onClose={() => setShowTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Target Color */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTargetColorPicker(v => !v)} className="tv-icon-btn" title="Target Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={targetColor} />
        </button>
          {showTargetColorPicker && (
            <ColorPickerPopup
              colorStr={targetColor || '#4CAF50'}
              onChange={c => handleTargetColorChange(c)}
              onClose={() => setShowTargetColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Stop Color */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowStopColorPicker(v => !v)} className="tv-icon-btn" title="Stop Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={stopColor} />
        </button>
          {showStopColorPicker && (
            <ColorPickerPopup
              colorStr={stopColor || '#F44336'}
              onChange={c => handleStopColorChange(c)}
              onClose={() => setShowStopColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Stats/Chart Icon */}
        <button className="tv-icon-btn" title="Create order" onClick={handleCreateOrder} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubOrderIcon />
        </button>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={handleSettingsClick} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Alert */}
        <button className="tv-icon-btn" title="Add alert" onClick={handleCreateAlert} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubAlertIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isSettingsOpen && (
        <PositionSettingsModal type="long" onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Short Position SubBar
  if (selectedShapeType === 'short_position') {
    const targetColor = targetFillColor || 'rgba(76, 175, 80, 0.4)';
    const stopColor = stopFillColor || 'rgba(244, 67, 54, 0.4)';
    
    return (
      <>
      <div
        data-subbar="true"
        style={{
          position: 'absolute', left: position.x, top: position.y,
          backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', padding: '2px 4px', gap: '4px',
          zIndex: 80, pointerEvents: 'auto', userSelect: 'none',
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip */}
        <div onMouseDown={handleGripMouseDown} style={{ cursor: 'grab', padding: '0 6px', display: 'flex', gap: '2px', alignItems: 'center', height: '34px', color: 'var(--tv-sub-muted)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[1,2,3,4].map(i => <div key={i} style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[1,2,3,4].map(i => <div key={i} style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }} />)}
          </div>
        </div>

        {/* Template (Four squares with plus) */}
        <button className="tv-icon-btn" title="Template" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTemplateIcon />
        </button>

        {/* Text Tool */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTextColorPicker(v => !v)} className="tv-icon-btn" title="Text Tool" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTextIcon />
          <SubColorBar color={textColor || '#e0e3eb'} />
        </button>
          {showTextColorPicker && (
            <ColorPickerPopup
              colorStr={textColor || '#ffffff'}
              onChange={c => handleTextColorChange(c)}
              onClose={() => setShowTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Target Color */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTargetColorPicker(v => !v)} className="tv-icon-btn" title="Target Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={targetColor} />
        </button>
          {showTargetColorPicker && (
            <ColorPickerPopup
              colorStr={targetColor || '#4CAF50'}
              onChange={c => handleTargetColorChange(c)}
              onClose={() => setShowTargetColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Stop Color */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowStopColorPicker(v => !v)} className="tv-icon-btn" title="Stop Color" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubBucketIcon />
          <SubColorBar color={stopColor} />
        </button>
          {showStopColorPicker && (
            <ColorPickerPopup
              colorStr={stopColor || '#F44336'}
              onChange={c => handleStopColorChange(c)}
              onClose={() => setShowStopColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Stats/Chart Icon */}
        <button className="tv-icon-btn" title="Create order" onClick={handleCreateOrder} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubOrderIcon />
        </button>

        {/* Settings */}
        <button className="tv-icon-btn" title="Settings" onClick={handleSettingsClick} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Alert */}
        <button className="tv-icon-btn" title="Add alert" onClick={handleCreateAlert} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubAlertIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isSettingsOpen && (
        <PositionSettingsModal type="short" onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Triangle SubBar
  if (selectedShapeType === 'triangle') {
    return (
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        <TemplateButton />

        {/* Boundary Color */}
        <button className="tv-icon-btn" title="Boundary Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: '18px', border: '2px solid currentColor', borderRadius: '2px' }}></div>
          <SubColorBar color={currentColor} />
        </button>

        {/* Fill Color */}
        <button className="tv-icon-btn" title="Fill Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: '18px', backgroundColor: 'currentColor', borderRadius: '2px', opacity: 0.3 }}></div>
          <SubColorBar color={currentFillColor} />
        </button>

        {/* Line Width */}
        <button className="tv-icon-btn" title="Line Width" style={{ width: '56px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: `${currentWidth}px`, backgroundColor: 'currentColor' }}></div>
          <span style={{ fontSize: '13px' }}>{currentWidth}px</span>
        </button>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={handleSettingsClick} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
    );
  }


  // Arc SubBar
  if (selectedShapeType === 'arc') {
    return (
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        <TemplateButton />

        {/* Boundary Color */}
        <button className="tv-icon-btn" title="Boundary Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: '18px', border: '2px solid currentColor', borderRadius: '2px' }}></div>
          <SubColorBar color={currentColor} />
        </button>

        {/* Fill Color */}
        <button className="tv-icon-btn" title="Fill Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: '18px', backgroundColor: 'currentColor', borderRadius: '2px', opacity: 0.3 }}></div>
          <SubColorBar color={currentFillColor} />
        </button>

        {/* Line Width */}
        <button className="tv-icon-btn" title="Line Width" style={{ width: '56px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: `${currentWidth}px`, backgroundColor: 'currentColor' }}></div>
          <span style={{ fontSize: '13px' }}>{currentWidth}px</span>
        </button>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={handleSettingsClick} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Rotated Rectangle SubBar
  if (selectedShapeType === 'rotated_rectangle') {
    return (
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        <TemplateButton />

        {/* Boundary Color */}
        <button className="tv-icon-btn" title="Boundary Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: '18px', border: '2px solid currentColor', borderRadius: '2px' }}></div>
          <SubColorBar color={currentColor} />
        </button>

        {/* Fill Color */}
        <button className="tv-icon-btn" title="Fill Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: '18px', backgroundColor: 'currentColor', borderRadius: '2px', opacity: 0.3 }}></div>
          <SubColorBar color={currentFillColor} />
        </button>

        {/* Line Width */}
        <button className="tv-icon-btn" title="Line Width" style={{ width: '56px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: `${currentWidth}px`, backgroundColor: 'currentColor' }}></div>
          <span style={{ fontSize: '13px' }}>{currentWidth}px</span>
        </button>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={handleSettingsClick} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Emoji SubBar
  if (selectedShapeType === 'emoji') {
    return (
      <>
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        {/* Template (Four squares with plus) */}
        <button className="tv-icon-btn" title="Template" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTemplateIcon />
        </button>

        {/* Emoji Size cycling button */}
        <button 
          className="tv-icon-btn" 
          onClick={() => {
            const sizes = [20, 40, 60, 80, 100];
            const currentIndex = sizes.indexOf(currentEmojiSize);
            const nextSize = sizes[(currentIndex + 1) % sizes.length];
            handleEmojiSizeChange(nextSize);
          }}
          style={{ width: '56px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} 
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{currentEmojiSize}px</span>
        </button>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => { console.log("Emoji settings clicked"); setIsEmojiSettingsOpen(true); }} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isEmojiSettingsOpen && (
        <EmojiSettingsModal onClose={() => setIsEmojiSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }
  // Brush SubBar
  if (selectedShapeType === 'brush') {
    return (
      <>
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        <TemplateButton />

        {/* Pencil Color */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => { setShowBrushColorPicker(!showBrushColorPicker); setShowBrushFillPicker(false); }}
            style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} 
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} 
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <SubPencilIcon />
            <SubColorBar color={currentColor} />
          </button>
          {showBrushColorPicker && (
            <ColorPickerPopup 
              colorStr={currentColor}
              onChange={(color) => {
                handleColorChange(color);
                setShowBrushColorPicker(false);
              }}
              onClose={() => setShowBrushColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowWidthDropdown(!showWidthDropdown)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              width: 'auto', 
              height: '34px', 
              padding: '0 8px', 
              gap: '6px', 
              color: 'var(--tv-sub-text)', 
              borderRadius: '4px', 
              border: 'none', 
              background: showWidthDropdown ? 'var(--tv-sub-hover)' : 'transparent' 
            }} 
            onMouseEnter={(e) => !showWidthDropdown && (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')} 
            onMouseLeave={(e) => !showWidthDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <SubWidthLabel width={currentWidth} />
            
          </button>
          
          {showWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(width) => {
                    handleWidthChange(width.toString());
                    setShowWidthDropdown(false);
                  }} onClose={() => setShowWidthDropdown(false)} />}
        </div>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => setIsBrushSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>

      {isBrushSettingsOpen && (
        <BrushSettingsModal onClose={() => setIsBrushSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Long/Short Position SubBar
  if (selectedShapeType === 'long_position' || selectedShapeType === 'short_position') {
    const isLong = selectedShapeType === 'long_position';
    return (
      <>
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        <TemplateButton />

        {/* Target Color */}
        <button className="tv-icon-btn" title="Target Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: '18px', backgroundColor: '#089981', borderRadius: '2px', opacity: 0.3 }}></div>
          <SubColorBar color={'#089981'} />
        </button>

        {/* Stop Color */}
        <button className="tv-icon-btn" title="Stop Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: '18px', backgroundColor: '#f23645', borderRadius: '2px', opacity: 0.3 }}></div>
          <SubColorBar color={'#f23645'} />
        </button>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => setIsSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isSettingsOpen && (
        <PositionSettingsModal type={isLong ? "long" : "short"} onClose={() => setIsSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }


  // Text SubBar
  if (selectedShapeType === 'text') {
    return (
      <>
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        <TemplateButton />

        {/* Text Color (Underline) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowTextColorPicker(v => !v)} className="tv-icon-btn" title="Text Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <span style={{ fontFamily: 'serif', fontSize: '18px', display: 'block', marginBottom: '2px' }}>T</span>
          <SubColorBar color={textColor} />
        </button>
          {showTextColorPicker && (
            <ColorPickerPopup
              colorStr={textColor || '#ffffff'}
              onChange={c => handleTextColorChange(c)}
              onClose={() => setShowTextColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Font Size */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowFontSizeDropdown(!showFontSizeDropdown)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              width: 'auto', 
              height: '34px', 
              padding: '0 8px', 
              gap: '4px', 
              color: 'var(--tv-sub-text)', 
              borderRadius: '4px', 
              border: 'none', 
              background: showFontSizeDropdown ? 'var(--tv-sub-hover)' : 'transparent',
              fontSize: '14px',
              fontWeight: 500
            }} 
            onMouseEnter={(e) => !showFontSizeDropdown && (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')} 
            onMouseLeave={(e) => !showFontSizeDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {currentFontSize}
            
          </button>
          
          {showFontSizeDropdown && (
            <div style={{ 
              position: 'absolute', 
              bottom: '100%', 
              left: '0', 
              marginBottom: '8px', 
              backgroundColor: 'var(--tv-sub-bg)', 
              border: '1px solid var(--tv-sub-border)', 
              borderRadius: '6px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
              zIndex: 100, 
              padding: '4px',
              minWidth: '60px',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {[10, 11, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80, 96].map(size => (
                <div 
                  key={size}
                  onClick={() => {
                    handleFontSizeChange(size);
                    setShowFontSizeDropdown(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    backgroundColor: currentFontSize === size ? 'var(--tv-sub-text)' : 'transparent',
                    color: currentFontSize === size ? 'var(--tv-sub-bg)' : 'var(--tv-sub-text)',
                    fontSize: '13px',
                    fontWeight: 500
                  }}
                  onMouseEnter={(e) => {
                    if (currentFontSize !== size) e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (currentFontSize !== size) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {size}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => setIsTextSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Anchor */}
        <button className="tv-icon-btn" title="Anchor" style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="3"></circle>
            <line x1="12" y1="22" x2="12" y2="8"></line>
            <path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>
          </svg>
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isTextSettingsOpen && (
        <TextSettingsModal onClose={() => setIsTextSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Curve SubBar
  if (selectedShapeType === 'curve') {
    return (
      <>
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        <TemplateButton />

        {/* Line Color */}
        <button className="tv-icon-btn" title="Line Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={currentColor} />
        </button>

        {/* Line Width */}
        <button className="tv-icon-btn" title="Line Width" style={{ width: '56px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: `${currentWidth}px`, backgroundColor: 'currentColor' }}></div>
          <span style={{ fontSize: '13px' }}>{currentWidth}px</span>
        </button>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => setIsCurveSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isCurveSettingsOpen && (
        <CurveSettingsModal onClose={() => setIsCurveSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Double Curve SubBar
  if (selectedShapeType === 'double_curve') {
    return (
      <>
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        <TemplateButton />

        {/* Line Color */}
        <button className="tv-icon-btn" title="Line Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          <SubColorBar color={currentColor} />
        </button>

        {/* Line Width */}
        <button className="tv-icon-btn" title="Line Width" style={{ width: '56px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <div style={{ width: '18px', height: `${currentWidth}px`, backgroundColor: 'currentColor' }}></div>
          <span style={{ fontSize: '13px' }}>{currentWidth}px</span>
        </button>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => setIsDoubleCurveSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isDoubleCurveSettingsOpen && (
        <DoubleCurveSettingsModal onClose={() => setIsDoubleCurveSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Fibonacci SubBar
  if (selectedShapeType === 'fibonacci') {
    return (
      <>
      <div 
        data-subbar="true" 
        style={{
          position: 'absolute',
          left: position.x !== 0 ? position.x : '50%',
          top: position.y !== 0 ? position.y : '60px',
          transform: position.x === 0 ? 'translateX(-50%)' : 'none',
          backgroundColor: 'var(--tv-sub-bg)',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 80,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
        onClick={handleSubBarClick}
      >
        {/* Grip Handle */}
        <div 
          onMouseDown={handleGripMouseDown}
          style={{ 
            display: 'flex', 
            gap: '2px', 
            padding: '4px', 
            cursor: 'grab', 
            color: 'var(--tv-sub-muted)',
            marginRight: '2px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
            <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          </div>
        </div>

        <TemplateButton />

        {/* Line Color (Rainbow) */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowBorderColorPicker(v => !v)} className="tv-icon-btn" title="Line Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubPencilIcon />
          {/* One colour for all levels shows that colour; otherwise the levels' rainbow */}
          <div style={{ position: 'absolute', bottom: '6px', left: '6px', right: '6px', height: '4px', borderRadius: '2px', background: (selectedShape as any)?.useOneColor ? ((selectedShape as any).oneColor || currentColor) : 'linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff)' }}></div>
        </button>
          {showBorderColorPicker && (
            <ColorPickerPopup
              colorStr={(selectedShape as any)?.useOneColor ? ((selectedShape as any).oneColor || currentColor) : (currentColor || '#9b59b6')}
              onChange={c => handleFibonacciColorChange(c)}
              onClose={() => setShowBorderColorPicker(false)}
              style={{ top: '100%', left: 0, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button 
            className="tv-icon-btn" 
            onClick={() => setShowWidthDropdown(!showWidthDropdown)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              width: 'auto', 
              height: '34px', 
              padding: '0 8px', 
              gap: '6px', 
              color: 'var(--tv-sub-text)', 
              borderRadius: '4px', 
              border: 'none', 
              background: showWidthDropdown ? 'var(--tv-sub-hover)' : 'transparent' 
            }} 
            onMouseEnter={(e) => !showWidthDropdown && (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')} 
            onMouseLeave={(e) => !showWidthDropdown && (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <SubWidthLabel width={currentWidth} />
            
          </button>
          
          {showWidthDropdown && <TvWidthMenu value={currentWidth} onPick={(width) => {
                    setCurrentWidth(width);
                    if (selectedShapeId) onStrokeWidthChange(selectedShapeId, width);
                    setShowWidthDropdown(false);
                  }} onClose={() => setShowWidthDropdown(false)} />}
        </div>

        {/* Settings Hexagon */}
        <button className="tv-icon-btn" title="Settings Hexagon" onClick={() => setIsFibonacciSettingsOpen(true)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubSettingsIcon />
        </button>

        {/* Lock */}
        <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubLockIcon locked={isLocked} />
        </button>

        {/* Trash */}
        <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubTrashIcon />
        </button>

        {/* More Options */}
        <div style={{ position: 'relative' }}>
          <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
            <SubMoreIcon />
          </button>
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
              <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
              <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
              <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
            </div>
          )}
        </div>
      </div>
      {isFibonacciSettingsOpen && (
        <FibonacciSettingsModal onClose={() => setIsFibonacciSettingsOpen(false)} />
      )}
      {renderSaveTemplateModal()}</>
    );
  }

  // Generic Fallback SubBar
  return (
    <>
    <div 
      data-subbar="true" 
      style={{
        position: 'absolute',
        left: position.x !== 0 ? position.x : '50%',
        top: position.y !== 0 ? position.y : '60px',
        transform: position.x === 0 ? 'translateX(-50%)' : 'none',
        backgroundColor: 'var(--tv-sub-bg)',
        borderRadius: '6px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
        padding: '2px 4px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        zIndex: 80,
        pointerEvents: 'auto',
        userSelect: 'none'
      }}
      onClick={handleSubBarClick}
    >
      {/* Grip Handle */}
      <div 
        onMouseDown={handleGripMouseDown}
        style={{ 
          display: 'flex', 
          gap: '2px', 
          padding: '4px', 
          cursor: 'grab', 
          color: 'var(--tv-sub-muted)',
          marginRight: '2px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
          <div style={{ width: '2px', height: '2px', backgroundColor: 'currentColor', borderRadius: '50%' }}></div>
        </div>
      </div>

      <TemplateButton />

      {/* Line Color */}
      <button className="tv-icon-btn" title="Line Color" style={{ position: 'relative', width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
        <div style={{ width: '18px', height: '2px', backgroundColor: 'currentColor', borderRadius: '1px' }}></div>
        <SubColorBar color={currentColor} />
      </button>

      {/* Line Width */}
      <button className="tv-icon-btn" title="Line Width" style={{ width: '56px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
        <div style={{ width: '18px', height: `${currentWidth}px`, backgroundColor: 'currentColor' }}></div>
        <span style={{ fontSize: '13px' }}>{currentWidth}px</span>
      </button>

      {/* Settings Hexagon */}
      <button className="tv-icon-btn" title="Settings Hexagon" onClick={handleSettingsClick} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
        <TVSettingsIcon size={20} />
      </button>

      {/* Lock */}
      <button className="tv-icon-btn" title="Lock" onClick={handleLockToggle} style={{ width: '34px', height: '34px', color: isLocked ? '#2962ff' : 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
        <SubLockIcon locked={isLocked} />
      </button>

      {/* Trash */}
      <button className="tv-icon-btn" title="Trash" onClick={handleDelete} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
        <SubTrashIcon />
      </button>

      {/* More Options */}
      <div style={{ position: 'relative' }}>
        <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: 'var(--tv-sub-text)', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
          <SubMoreIcon />
        </button>
        {showDropdown && (
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '120px' }}>
            <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Clone</button>
            <button onClick={() => { handleCopy(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Copy</button>
            <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
          </div>
        )}
      </div>
    </div>
    {renderSaveTemplateModal()}</>
  );
}

