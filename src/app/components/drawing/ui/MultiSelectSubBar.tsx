'use client';
import React, { useState, useEffect } from 'react';
import { GripVertical, Pencil, PaintBucket, Type, Settings, Lock, Unlock, Trash2, MoreHorizontal, Layers, Copy, EyeOff, ChevronRight } from 'lucide-react';
import { useDrawing } from '../core/DrawingContext';
import { ColorPickerPopup } from './ColorPickerPopup';
import { MultiSelectSettingsModal } from './MultiSelectSettingsModal';

const LINE_WIDTHS = [1, 2, 3, 4];

export function MultiSelectSubBar() {
  const {
    drawings,
    selectedShapeIds,
    setSelectedShapeIds,
    updateMultipleDrawings,
    deleteMultipleDrawings,
    addDrawing,
    setSelectedShapeId,
    clearSelection,
  } = useDrawing();

  const ids = Array.from(selectedShapeIds);
  const selectedDrawings = drawings.filter(d => selectedShapeIds.has(d.id));

  // Draggability State
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthDropdown, setShowWidthDropdown] = useState(false);
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const [showFillColorPicker, setShowFillColorPicker] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [currentColor, setCurrentColor] = useState('#2962ff');
  const [currentWidth, setCurrentWidth] = useState(2);
  const [currentStyle, setCurrentStyle] = useState('Solid');
  const [currentFillColor, setCurrentFillColor] = useState('rgba(41, 98, 255, 0.2)');
  const [currentTextColor, setCurrentTextColor] = useState('#131722');

  // Position the bar near the center of the screen initially
  useEffect(() => {
    if (selectedShapeIds.size > 0) {
      setPosition({
        x: typeof window !== 'undefined' ? window.innerWidth / 2 - 220 : 300,
        y: 80
      });
    }
  }, [selectedShapeIds.size > 0 ? 1 : 0]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition(prev => ({
        x: prev.x + (e.clientX - dragStart.x),
        y: prev.y + (e.clientY - dragStart.y)
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  if (selectedShapeIds.size < 2) return null;

  const allLocked = selectedDrawings.every(d => d.locked);

  const handleColorChange = (color: string) => {
    setCurrentColor(color);
    updateMultipleDrawings(ids, { stroke: color });
  };

  const handleFillColorChange = (color: string) => {
    setCurrentFillColor(color);
    updateMultipleDrawings(ids, { fill: color });
  };

  const handleTextColorChange = (color: string) => {
    setCurrentTextColor(color);
    updateMultipleDrawings(ids, { textColor: color });
  };

  const handleWidthChange = (width: number) => {
    setCurrentWidth(width);
    updateMultipleDrawings(ids, { strokeWidth: width });
    setShowWidthDropdown(false);
  };

  const handleStyleChange = (style: string) => {
    setCurrentStyle(style);
    updateMultipleDrawings(ids, { lineStyle: style });
    setShowStyleDropdown(false);
  };

  const handleLockToggle = () => {
    updateMultipleDrawings(ids, { locked: !allLocked });
  };

  const handleHide = () => {
    updateMultipleDrawings(ids, { visible: false });
    clearSelection();
  };

  const handleClone = () => {
    selectedDrawings.forEach(d => {
      const clone = {
        ...d,
        id: `${d.type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        points: d.points?.map(p => ({ ...p, logical: p.logical + 5 })) || [],
      };
      addDrawing(clone);
    });
  };

  const handleDelete = () => {
    deleteMultipleDrawings(ids);
  };

  const btnStyle: React.CSSProperties = {
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '4px',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--tv-sub-text)',
    padding: 0,
  };

  const dividerStyle: React.CSSProperties = {
    width: '1px',
    height: '24px',
    backgroundColor: 'var(--tv-sub-border)',
    margin: '0 2px',
  };

  return (
    <>
    <div
      data-subbar="true"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'var(--tv-sub-bg)',
        borderRadius: '8px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
        padding: '6px',
        fontFamily: 'Inter, -apple-system, sans-serif',
        userSelect: 'none',
      }}
    >
      {/* Drag grip */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          setIsDragging(true);
          setDragStart({ x: e.clientX, y: e.clientY });
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          color: 'var(--tv-sub-muted)',
          padding: '0 4px',
        }}
        title="Drag to move"
      >
        <GripVertical size={18} strokeWidth={2.5} />
      </div>

      {/* Line width dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...btnStyle, width: 'auto', padding: '0 8px', gap: '8px', fontSize: '13px', fontWeight: 400 }}
          onClick={() => {
            setShowWidthDropdown(!showWidthDropdown);
            setShowStyleDropdown(false);
            setShowColorPicker(false);
            setShowFillColorPicker(false);
            setShowTextColorPicker(false);
            setShowMoreDropdown(false);
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          title="Line width"
        >
          <svg width="24" height="20" viewBox="0 0 24 20">
            <line x1="0" y1="10" x2="24" y2="10" stroke="var(--tv-sub-text)" strokeWidth={currentWidth} strokeLinecap="square" />
          </svg>
          <span style={{ minWidth: '24px', textAlign: 'center' }}>{currentWidth}px</span>
        </button>
        {showWidthDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            backgroundColor: 'var(--tv-sub-bg)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 300,
            padding: '4px 0',
            minWidth: '120px',
            border: '1px solid var(--tv-sub-border)',
          }}>
            {LINE_WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => handleWidthChange(w)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '8px 16px',
                  border: 'none',
                  background: currentWidth === w ? 'var(--tv-sub-hover)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--tv-sub-text)',
                  outline: 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
                onMouseLeave={e => currentWidth !== w && (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <svg width="32" height="16" viewBox="0 0 32 16">
                  <line x1="0" y1="8" x2="32" y2="8" stroke="var(--tv-sub-text)" strokeWidth={w} strokeLinecap="square" />
                </svg>
                <span>{w}px</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Line style dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...btnStyle, width: '34px' }}
          onClick={() => {
            setShowStyleDropdown(!showStyleDropdown);
            setShowWidthDropdown(false);
            setShowColorPicker(false);
            setShowFillColorPicker(false);
            setShowTextColorPicker(false);
            setShowMoreDropdown(false);
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          title="Line style"
        >
          <svg width="24" height="20" viewBox="0 0 24 20">
            {currentStyle === 'Solid' ? <line x1="0" y1="10" x2="24" y2="10" stroke="var(--tv-sub-text)" strokeWidth={2} strokeLinecap="square" /> :
             currentStyle === 'Dashed' ? <><line x1="0" y1="10" x2="8" y2="10" stroke="var(--tv-sub-text)" strokeWidth={2}/><line x1="16" y1="10" x2="24" y2="10" stroke="var(--tv-sub-text)" strokeWidth={2}/></> :
             <><circle cx="2" cy="10" r="1.5" fill="var(--tv-sub-text)"/><circle cx="10" cy="10" r="1.5" fill="var(--tv-sub-text)"/><circle cx="18" cy="10" r="1.5" fill="var(--tv-sub-text)"/></>}
          </svg>
        </button>
        {showStyleDropdown && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            backgroundColor: 'var(--tv-sub-bg)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 300,
            padding: '4px 0',
            minWidth: '130px',
            border: '1px solid var(--tv-sub-border)',
          }}>
            {['Solid', 'Dashed', 'Dotted'].map(style => (
              <button
                key={style}
                onClick={() => handleStyleChange(style)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '8px 16px',
                  border: 'none',
                  background: currentStyle === style ? 'var(--tv-sub-hover)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--tv-sub-text)',
                  outline: 'none',
                  textAlign: 'left'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
                onMouseLeave={e => currentStyle !== style && (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ width: '24px', display: 'flex', alignItems: 'center' }}>
                  <svg width="24" height="12" viewBox="0 0 24 12" fill="none" stroke="var(--tv-sub-text)" strokeWidth="2">
                    {style === 'Solid' ? <line x1="0" y1="6" x2="24" y2="6"/> :
                     style === 'Dashed' ? <><line x1="0" y1="6" x2="8" y2="6"/><line x1="12" y1="6" x2="20" y2="6"/></> :
                     <><circle cx="2" cy="6" r="1" fill="var(--tv-sub-text)"/><circle cx="8" cy="6" r="1" fill="var(--tv-sub-text)"/><circle cx="14" cy="6" r="1" fill="var(--tv-sub-text)"/><circle cx="20" cy="6" r="1" fill="var(--tv-sub-text)"/></>}
                  </svg>
                </div>
                {style === 'Solid' ? 'Line' : style === 'Dashed' ? 'Dashed line' : 'Dotted line'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={dividerStyle} />

      {/* Line Color picker */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...btnStyle, position: 'relative' }}
          onClick={() => {
            setShowColorPicker(!showColorPicker);
            setShowWidthDropdown(false);
            setShowStyleDropdown(false);
            setShowFillColorPicker(false);
            setShowTextColorPicker(false);
            setShowMoreDropdown(false);
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          title="Line Color"
        >
          <Pencil size={18} strokeWidth={2} />
          {/* Rainbow underline */}
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '6px',
            right: '6px',
            height: '3px',
            borderRadius: '2px',
            background: 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
          }} />
        </button>
        {showColorPicker && (
          <ColorPickerPopup
            colorStr={currentColor}
            onChange={handleColorChange}
            onClose={() => setShowColorPicker(false)}
            style={{ top: '100%', left: 0, marginTop: '8px' }}
          />
        )}
      </div>

      {/* Fill Color */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...btnStyle, position: 'relative' }}
          onClick={() => {
            setShowFillColorPicker(!showFillColorPicker);
            setShowWidthDropdown(false);
            setShowStyleDropdown(false);
            setShowColorPicker(false);
            setShowTextColorPicker(false);
            setShowMoreDropdown(false);
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          title="Background Color"
        >
          <PaintBucket size={18} strokeWidth={2} />
          {/* Cyan dashed underline */}
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '6px',
            right: '6px',
            height: '3px',
            borderBottom: '2px dashed #43b5ad',
          }} />
        </button>
        {showFillColorPicker && (
          <ColorPickerPopup
            colorStr={currentFillColor}
            onChange={handleFillColorChange}
            onClose={() => setShowFillColorPicker(false)}
            style={{ top: '100%', left: 0, marginTop: '8px' }}
          />
        )}
      </div>

      {/* Text Color */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...btnStyle, position: 'relative' }}
          onClick={() => {
            setShowTextColorPicker(!showTextColorPicker);
            setShowWidthDropdown(false);
            setShowStyleDropdown(false);
            setShowColorPicker(false);
            setShowFillColorPicker(false);
            setShowMoreDropdown(false);
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          title="Text Color"
        >
          <Type size={18} strokeWidth={2} />
          {/* Solid blue underline */}
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '6px',
            right: '6px',
            height: '3px',
            borderRadius: '2px',
            background: '#2962ff',
          }} />
        </button>
        {showTextColorPicker && (
          <ColorPickerPopup
            colorStr={currentTextColor}
            onChange={handleTextColorChange}
            onClose={() => setShowTextColorPicker(false)}
            style={{ top: '100%', left: 0, marginTop: '8px' }}
          />
        )}
      </div>

      <div style={dividerStyle} />

      <div style={{ position: 'relative' }}>
        <button
          style={btnStyle}
          onClick={() => {
            setIsSettingsOpen(true);
            setShowWidthDropdown(false);
            setShowStyleDropdown(false);
            setShowColorPicker(false);
            setShowFillColorPicker(false);
            setShowTextColorPicker(false);
            setShowMoreDropdown(false);
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          title="Settings"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
            <polygon points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>

      {/* Lock/Unlock */}
      <button
        style={btnStyle}
        onClick={handleLockToggle}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        title={allLocked ? 'Unlock all' : 'Lock all'}
      >
        {allLocked ? <Lock size={18} strokeWidth={2} /> : <Unlock size={18} strokeWidth={2} />}
      </button>

      {/* Delete */}
      <button
        style={btnStyle}
        onClick={handleDelete}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        title="Delete"
      >
        <Trash2 size={18} strokeWidth={2} />
      </button>

      {/* More Options */}
      <div style={{ position: 'relative' }}>
        <button
          style={btnStyle}
          onClick={() => {
            setShowMoreDropdown(!showMoreDropdown);
            setShowWidthDropdown(false);
            setShowStyleDropdown(false);
            setShowColorPicker(false);
            setShowFillColorPicker(false);
            setShowTextColorPicker(false);
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          title="More"
        >
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
        {showMoreDropdown && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '4px',
            backgroundColor: 'var(--tv-sub-bg)', borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 300,
            padding: '4px 0', minWidth: '220px', border: '1px solid var(--tv-sub-border)',
            fontSize: '14px', color: 'var(--tv-sub-text)',
          }}>
            <button style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', gap: '12px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <Layers size={18} strokeWidth={1.5} />
              <span style={{ flex: 1, textAlign: 'left' }}>Visual order</span>
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
            <button style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', gap: '12px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <div style={{ width: '18px' }} /> {/* Spacer */}
              <span style={{ flex: 1, textAlign: 'left' }}>Visibility on intervals</span>
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
            
            <div style={{ height: '1px', backgroundColor: 'var(--tv-sub-border)', margin: '4px 0' }} />
            
            <button onClick={() => { handleClone(); setShowMoreDropdown(false); }} style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', gap: '12px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <Copy size={18} strokeWidth={1.5} />
              <span style={{ flex: 1, textAlign: 'left' }}>Clone</span>
              <span style={{ color: '#787b86', fontSize: '12px' }}>Ctrl + Drag</span>
            </button>
            <button style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', gap: '12px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <div style={{ width: '18px' }} /> {/* Spacer */}
              <span style={{ flex: 1, textAlign: 'left' }}>Copy</span>
              <span style={{ color: '#787b86', fontSize: '12px' }}>Ctrl + C</span>
            </button>
            
            <div style={{ height: '1px', backgroundColor: 'var(--tv-sub-border)', margin: '4px 0' }} />
            
            <button onClick={() => { handleHide(); setShowMoreDropdown(false); }} style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', gap: '12px' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <EyeOff size={18} strokeWidth={1.5} />
              <span style={{ flex: 1, textAlign: 'left' }}>Hide</span>
            </button>
          </div>
        )}
      </div>
    </div>
    
    {isSettingsOpen && (
      <MultiSelectSettingsModal onClose={() => setIsSettingsOpen(false)} />
    )}
    </>
  );
}
