'use client';
import React, { useState, useEffect } from 'react';
import { useDrawing } from '../core/DrawingContext';
import { DualRangeSlider } from './DualRangeSlider';
import { useAuth } from '@/context/AuthContext';
import SaveTemplateModal from '../../SaveTemplateModal';
import { HSVColorPickerPopup } from '../../HSVColorPicker';

interface FibonacciSettingsModalProps {
  onClose: () => void;
  initialPosition?: { x: number, y: number };
}

function CheckBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '18px', height: '18px', borderRadius: '3px',
        border: checked ? 'none' : '1px solid #b2b5be',
        backgroundColor: checked ? '#131722' : '#ffffff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

// Grayscale row + hue rows, same palette used for the session-range color picker
const TV_COLORS = [
  ["#ffffff", "#f0f3fa", "#e0e3eb", "#b2b5be", "#787b86", "#434651", "#2a2e39", "#1e222d", "#131722", "#000000"],
  ["#f23645", "#ff9800", "#ffeb3b", "#4caf50", "#089981", "#00bcd4", "#2962ff", "#673ab7", "#9c27b0", "#e91e63"],
  ["#fce8e8", "#fdf0e3", "#fef9e6", "#e8f5e9", "#e2f2ef", "#e0f7fa", "#e8f0fe", "#f3e5f5", "#f8e1f4", "#fce4ec"],
  ["#f8b6b6", "#fbc89a", "#fdf0a4", "#a5d6a7", "#8accc1", "#b2ebf2", "#9bb5fe", "#d1c4e9", "#eab6e6", "#f8bbd0"],
  ["#f27979", "#f99e52", "#fce362", "#66bb6a", "#4db6ac", "#4dd0e1", "#648fff", "#9575cd", "#ce85d6", "#f06292"],
  ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#00897b", "#00acc1", "#1e88e5", "#5e35b1", "#ab47bc", "#d81b60"],
  ["#c62828", "#ef6c00", "#fbc02d", "#2e7d32", "#00695c", "#00838f", "#1565c0", "#4527a0", "#8e24aa", "#ad1457"],
  ["#8e0000", "#e65100", "#f57f17", "#1b5e20", "#004d40", "#006064", "#0d47a1", "#311b92", "#6a1b9a", "#880e4f"],
];

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseColorInput(colorStr: string) {
  if (!colorStr) return { hex: '#000000', opacity: 100 };
  if (colorStr.startsWith('#')) return { hex: colorStr, opacity: 100 };
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    const hex = `#${parseInt(match[1]).toString(16).padStart(2, '0')}${parseInt(match[2]).toString(16).padStart(2, '0')}${parseInt(match[3]).toString(16).padStart(2, '0')}`;
    const opacity = match[4] !== undefined ? Math.round(parseFloat(match[4]) * 100) : 100;
    return { hex, opacity };
  }
  return { hex: '#000000', opacity: 100 };
}

// Swatch-grid + opacity color picker, with a "+" custom-color swatch and optional thickness/line-style rows
function FibColorPickerPopup({ colorStr, onChange, onClose, thickness, onThicknessChange, lineStyle, onLineStyleChange, style }: {
  colorStr: string; onChange: (c: string) => void; onClose: () => void;
  thickness?: number; onThicknessChange?: (w: number) => void;
  lineStyle?: string; onLineStyleChange?: (s: string) => void; style?: React.CSSProperties;
}) {
  const { hex: initHex, opacity: initOpacity } = parseColorInput(colorStr);
  const [hex, setHex] = useState(initHex);
  const [opacity, setOpacity] = useState(initOpacity);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const applyColor = (newHex: string, newOpacity: number) => {
    setHex(newHex);
    setOpacity(newOpacity);
    onChange(newOpacity === 100 ? newHex : hexToRgba(newHex, newOpacity / 100));
  };

  return (
    <div
      style={{
        position: 'absolute', backgroundColor: '#ffffff', border: '1px solid #e0e3eb',
        borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100000,
        padding: '12px', width: '216px', boxSizing: 'content-box', ...style,
      }}
      onClick={stopAll}
    >
      {showCustomPicker ? (
        <HSVColorPickerPopup
          hex={hex}
          onApply={(newHex) => { applyColor(newHex, opacity); setShowCustomPicker(false); }}
        />
      ) : (
        <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 18px)', gap: '4px' }}>
        {TV_COLORS.flat().map((c, i) => (
          <div key={i} onClick={() => applyColor(c, opacity)}
            style={{
              width: '18px', height: '18px', borderRadius: '2px', cursor: 'pointer', backgroundColor: c,
              border: hex.toLowerCase() === c.toLowerCase() ? '2px solid #2962ff' : '1px solid rgba(0,0,0,0.1)',
              boxSizing: 'border-box',
            }}
          />
        ))}
        <div onClick={() => setShowCustomPicker(true)}
          style={{
            position: 'relative', width: '18px', height: '18px', borderRadius: '2px', cursor: 'pointer',
            border: '1px dashed #b2b5be', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#787b86',
          }}
          title="Custom color"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
      </div>

      <div style={{ height: '1px', backgroundColor: '#e0e3eb', margin: '12px 0' }} />
      <div style={{ marginBottom: '4px', fontSize: '12px', color: '#787b86' }}>Opacity</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ flex: 1, position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', inset: '8px 0', borderRadius: '2px', backgroundImage: `linear-gradient(to right, transparent, ${hex})`, backgroundColor: '#eee' }} />
          <input type="range" min="0" max="100" value={opacity} onChange={e => applyColor(hex, parseInt(e.target.value))}
            style={{ position: 'absolute', inset: 0, width: '100%', cursor: 'pointer', opacity: 0, zIndex: 2 }} />
          <div style={{ position: 'absolute', left: `${opacity}%`, width: '12px', height: '12px', backgroundColor: '#fff', border: '2px solid #2962ff', borderRadius: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
        </div>
        <div style={{ width: '44px', height: '24px', border: '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#131722' }}>
          {opacity}%
        </div>
      </div>
      </>
      )}

      {!showCustomPicker && onThicknessChange && (
        <>
          <div style={{ height: '1px', backgroundColor: '#e0e3eb', margin: '12px 0' }} />
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#787b86' }}>Thickness</div>
          <div style={{ display: 'flex', border: '1px solid #e0e3eb', borderRadius: '4px', overflow: 'hidden' }}>
            {[1, 2, 3, 4].map(w => (
              <button key={w} onClick={() => onThicknessChange(w)}
                style={{
                  flex: 1, height: '32px', background: thickness === w ? '#131722' : 'transparent',
                  border: 'none', borderRight: w < 4 ? '1px solid #e0e3eb' : 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{ width: '16px', height: `${w}px`, backgroundColor: thickness === w ? '#ffffff' : '#131722' }} />
              </button>
            ))}
          </div>
        </>
      )}

      {!showCustomPicker && onLineStyleChange && (
        <>
          <div style={{ height: '1px', backgroundColor: '#e0e3eb', margin: '12px 0' }} />
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#787b86' }}>Line style</div>
          <div style={{ display: 'flex', border: '1px solid #e0e3eb', borderRadius: '4px', overflow: 'hidden' }}>
            {['Solid', 'Dashed', 'Dotted'].map(s => (
              <button key={s} onClick={() => onLineStyleChange(s)}
                style={{
                  flex: 1, height: '32px', background: lineStyle === s ? '#131722' : 'transparent',
                  border: 'none', borderRight: s !== 'Dotted' ? '1px solid #e0e3eb' : 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="24" height="12" viewBox="0 0 24 12" fill="none" stroke={lineStyle === s ? '#ffffff' : '#131722'} strokeWidth="2">
                  {s === 'Solid' ? <line x1="0" y1="6" x2="24" y2="6" /> :
                   s === 'Dashed' ? <><line x1="0" y1="6" x2="8" y2="6" /><line x1="12" y1="6" x2="20" y2="6" /></> :
                   <><circle cx="2" cy="6" r="1" fill={lineStyle === s ? '#ffffff' : '#131722'} /><circle cx="8" cy="6" r="1" fill={lineStyle === s ? '#ffffff' : '#131722'} /><circle cx="14" cy="6" r="1" fill={lineStyle === s ? '#ffffff' : '#131722'} /><circle cx="20" cy="6" r="1" fill={lineStyle === s ? '#ffffff' : '#131722'} /></>}
                </svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function lineDash(style: string) {
  return style === 'dashed' ? '5,4' : style === 'dotted' ? '1,3' : undefined;
}

// A plain React stopPropagation() doesn't reliably stop the document-level
// "click outside" listeners used throughout this app from also firing (React's
// synthetic dispatch happens after native bubbling has already reached document
// in some cases) — stopImmediatePropagation on the native event is the fix
// already used elsewhere in the codebase (see SessionSettingsModal's ColorSquare).
function stopAll(e: React.SyntheticEvent) {
  e.stopPropagation();
  if (e.nativeEvent) (e.nativeEvent as Event).stopImmediatePropagation();
}

// Compact icon-preview button + vertical dropdown for line thickness only (no color)
function LineThicknessDropdown({ value, onChange, isOpen, onToggle }: { value: number; onChange: (w: number) => void; isOpen: boolean; onToggle: () => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <div onClick={e => { stopAll(e); onToggle(); }}
        style={{ width: '48px', height: '32px', border: isOpen ? '1px solid #2962ff' : '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <div style={{ width: '24px', height: `${value}px`, backgroundColor: '#131722' }} />
      </div>
      {isOpen && (
        <div onClick={stopAll}
          style={{ position: 'absolute', top: '36px', left: 0, backgroundColor: '#fff', border: '1px solid #e0e3eb', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100000, padding: '4px', width: '56px' }}>
          {[1, 2, 3, 4].map(w => (
            <div key={w} onClick={() => onChange(w)}
              style={{ height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', cursor: 'pointer', backgroundColor: value === w ? '#131722' : 'transparent' }}>
              <div style={{ width: '24px', height: `${w}px`, backgroundColor: value === w ? '#ffffff' : '#131722' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Compact icon-preview button + vertical dropdown for line style, with text labels
function LineStyleMiniDropdown({ value, onChange, isOpen, onToggle }: { value: string; onChange: (s: string) => void; isOpen: boolean; onToggle: () => void }) {
  const options = [
    { key: 'solid', label: 'Line' },
    { key: 'dashed', label: 'Dashed line' },
    { key: 'dotted', label: 'Dotted line' },
  ];
  return (
    <div style={{ position: 'relative' }}>
      <div onClick={e => { stopAll(e); onToggle(); }}
        style={{ width: '48px', height: '32px', border: isOpen ? '1px solid #2962ff' : '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <svg width="24" height="2" viewBox="0 0 24 2"><line x1="0" y1="1" x2="24" y2="1" stroke="#131722" strokeWidth="2" strokeDasharray={lineDash(value)} /></svg>
      </div>
      {isOpen && (
        <div onClick={stopAll}
          style={{ position: 'absolute', top: '36px', left: 0, backgroundColor: '#fff', border: '1px solid #e0e3eb', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100000, padding: '4px', width: '140px' }}>
          {options.map(opt => (
            <div key={opt.key} onClick={() => onChange(opt.key)}
              style={{
                height: '32px', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 10px',
                borderRadius: '4px', cursor: 'pointer', fontSize: '13px',
                backgroundColor: value === opt.key ? '#131722' : 'transparent', color: value === opt.key ? '#ffffff' : '#131722',
              }}>
              <svg width="20" height="2" viewBox="0 0 20 2" style={{ flexShrink: 0 }}>
                <line x1="0" y1="1" x2="20" y2="1" stroke={value === opt.key ? '#ffffff' : '#131722'} strokeWidth="2" strokeDasharray={lineDash(opt.key)} />
              </svg>
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Multi-select checkbox dropdown for "Extend lines left" / "Extend lines right"
function ExtendDropdown({ left, right, onChange, isOpen, onToggle }: { left: boolean; right: boolean; onChange: (updates: { extendLeft?: boolean; extendRight?: boolean }) => void; isOpen: boolean; onToggle: () => void }) {
  const label = left && right ? 'Extend lines left, right' : left ? 'Extend lines left' : right ? 'Extend lines right' : "Don't extend";
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div onClick={e => { stopAll(e); onToggle(); }}
        style={{
          height: '32px', border: isOpen ? '1px solid #2962ff' : '1px solid #e0e3eb', borderRadius: '4px',
          padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer',
        }}>
        <span style={{ fontSize: '13px', color: '#131722', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#787b86" strokeWidth="2" style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : undefined }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {isOpen && (
        <div onClick={stopAll}
          style={{ position: 'absolute', top: '36px', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e0e3eb', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100000, padding: '6px' }}>
          <div onClick={() => onChange({ extendLeft: !left })}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '4px', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <CheckBox checked={left} onChange={() => onChange({ extendLeft: !left })} />
            <span style={{ fontSize: '13px', color: '#131722' }}>Extend lines left</span>
          </div>
          <div onClick={() => onChange({ extendRight: !right })}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '4px', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <CheckBox checked={right} onChange={() => onChange({ extendRight: !right })} />
            <span style={{ fontSize: '13px', color: '#131722' }}>Extend lines right</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorSwatchButton({ color, size = 28, onClick }: { color: string; size?: number; onClick: () => void }) {
  return (
    <div onClick={e => { stopAll(e); onClick(); }} style={{ position: 'relative', width: `${size}px`, height: `${size}px`, border: '1px solid #e0e3eb', borderRadius: '4px', padding: '3px', cursor: 'pointer' }}>
      <div style={{ width: '100%', height: '100%', backgroundColor: color, borderRadius: '2px' }} />
    </div>
  );
}

function LocalNumberInput({ value, onChange, style }: { value: string; onChange?: (val: string) => void; style?: React.CSSProperties }) {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);
  const handleBlur = () => { if (onChange && localVal !== value) onChange(localVal); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <input type="text" value={localVal} onChange={(e) => setLocalVal(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown}
      style={{ width: '60px', height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#131722', outline: 'none', ...style }}
    />
  );
}

// Left/right column pairs, interleaved so the 2-column grid (row-major) lays out
// exactly as: left = 0, 0.34, 0.68, 1, 2.618, 4.236, 1.414, 2.414, 3, 3.414, 4.272, 4.618
//             right = 0.236, 0.5, 0.6, 0.9, 3.618, 1.272, 2.272, 2, 3.272, 4, 4.414, 4.764
export const DEFAULT_FIB_LEVELS = [
  { id: '0', enabled: true, value: 0, color: '#000000' },
  { id: '0.236', enabled: false, value: 0.236, color: '#787b86' },
  { id: '0.34', enabled: true, value: 0.34, color: '#000000' },
  { id: '0.5', enabled: true, value: 0.5, color: '#000000' },
  { id: '0.68', enabled: true, value: 0.68, color: '#000000' },
  { id: '0.6', enabled: true, value: 0.6, color: '#000000' },
  { id: '1', enabled: true, value: 1, color: '#000000' },
  { id: '0.9', enabled: true, value: 0.9, color: '#000000' },
  { id: '2.618', enabled: false, value: 2.618, color: '#787b86' },
  { id: '3.618', enabled: false, value: 3.618, color: '#787b86' },
  { id: '4.236', enabled: false, value: 4.236, color: '#787b86' },
  { id: '1.272', enabled: false, value: 1.272, color: '#787b86' },
  { id: '1.414', enabled: false, value: 1.414, color: '#787b86' },
  { id: '2.272', enabled: false, value: 2.272, color: '#787b86' },
  { id: '2.414', enabled: false, value: 2.414, color: '#787b86' },
  { id: '2', enabled: false, value: 2, color: '#787b86' },
  { id: '3', enabled: false, value: 3, color: '#787b86' },
  { id: '3.272', enabled: false, value: 3.272, color: '#787b86' },
  { id: '3.414', enabled: false, value: 3.414, color: '#787b86' },
  { id: '4', enabled: false, value: 4, color: '#787b86' },
  { id: '4.272', enabled: false, value: 4.272, color: '#787b86' },
  { id: '4.414', enabled: false, value: 4.414, color: '#787b86' },
  { id: '4.618', enabled: false, value: 4.618, color: '#787b86' },
  { id: '4.764', enabled: false, value: 4.764, color: '#787b86' },
];

export function FibonacciSettingsModal({ onClose, initialPosition }: FibonacciSettingsModalProps) {
  const { drawings, updateDrawing, selectedShapeId } = useDrawing();
  const drawing = drawings.find((d: any) => d.id === selectedShapeId);

  const [position, setPosition] = useState(initialPosition || { 
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 200 : 0, 
    y: typeof window !== 'undefined' ? window.innerHeight / 2 - 300 : 0 
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('Style');
  const [colorPickerOpen, setColorPickerOpen] = useState('');

  useEffect(() => {
    if (!colorPickerOpen) return;
    const handleClick = () => setColorPickerOpen('');
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [colorPickerOpen]);

  const { user } = useAuth();
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    if (user && drawing) {
      fetch(`http://localhost:8000/api/users/templates/${user.uid}/?tool_type=${drawing.type}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setTemplates(data.filter(t => t.name !== 'default'));
        })
        .catch(e => console.error("Failed to load templates:", e));
    }
  }, [user, drawing]);

  const applyTemplate = (t: any) => {
    if (t.settings && drawing) {
      updateDrawing(drawing.id, t.settings);
    }
    setShowTemplateDropdown(false);
  };

  const [visibility, setVisibility] = useState(drawing?.visibility || {
    ticks: { enabled: true, from: 1, to: 1000 },
    seconds: { enabled: true, from: 1, to: 59 },
    minutes: { enabled: true, from: 1, to: 59 },
    hours: { enabled: true, from: 1, to: 24 },
    days: { enabled: true, from: 1, to: 366 },
    weeks: { enabled: true, from: 1, to: 52 },
    months: { enabled: true, from: 1, to: 12 },
    ranges: { enabled: true }
  });

  const updateVisibility = (key: string, updates: any) => {
    const newVisibility = { ...visibility, [key]: { ...visibility[key], ...updates } };
    setVisibility(newVisibility);
    if (selectedShapeId) updateDrawing(selectedShapeId, { visibility: newVisibility });
  };

  const updateProp = (key: string, val: any) => {
    if (selectedShapeId) updateDrawing(selectedShapeId, { [key]: val });
  };

  useEffect(() => {
    if (drawing?.visibility) setVisibility(drawing.visibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShapeId]);

  // Debug: log position changes
  useEffect(() => {
    console.log(`[FibSettingsModal] Position changed → x: ${position.x}, y: ${position.y}`);
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPosition(p => ({ x: p.x + e.clientX - dragStart.x, y: p.y + e.clientY - dragStart.y }));
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, dragStart]);

  if (!drawing) return null;

  const tabs = ['Style', 'Coordinates', 'Visibility'];
  const fibLevels = drawing.fibLevels || DEFAULT_FIB_LEVELS;

  const updateFibLevel = (index: number, updates: any) => {
    const newLevels = [...fibLevels];
    const merged = { ...newLevels[index], ...updates };
    // When value changes, sync the id (used as label text on the chart)
    if ('value' in updates) {
      merged.id = String(updates.value);
    }
    newLevels[index] = merged;
    updateDrawing(drawing.id, { fibLevels: newLevels });
  };

  return (
    <div 
      style={{
        position: 'fixed', left: position.x, top: position.y, width: '400px',
        backgroundColor: '#ffffff', borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
        zIndex: 2000, display: 'flex', flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        userSelect: 'none',
      }}
      onClick={stopAll}
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div 
        onMouseDown={e => { e.stopPropagation(); setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'grab' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#131722' }}>Fib retracement</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid #e0e3eb', gap: '20px' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '8px 0', fontSize: '14px', fontWeight: activeTab === tab ? 600 : 400, color: '#131722', background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid #131722' : '2px solid transparent', cursor: 'pointer' }}
          >{tab}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '500px', overflowY: 'auto' }}>
        {activeTab === 'Style' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '120px', display: 'flex', alignItems: 'center' }}>
                <CheckBox checked={!!drawing.showTrendLine} onChange={v => updateProp('showTrendLine', v)} />
                <span style={{ fontSize: '13px', color: '#131722', marginLeft: '8px' }}>Trend line</span>
              </div>
              <div style={{ position: 'relative' }}>
                <div
                  onClick={e => { stopAll(e); setColorPickerOpen(colorPickerOpen === 'trend' ? '' : 'trend'); }}
                  style={{ width: '48px', height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: '#f8f9fd' }}
                >
                  <svg width="28" height="2" viewBox="0 0 28 2">
                    <line x1="0" y1="1" x2="28" y2="1" stroke={drawing.trendLineColor || '#787b86'} strokeWidth="2"
                      strokeDasharray={(drawing.trendLineStyle || 'dashed') === 'dashed' ? '5,4' : drawing.trendLineStyle === 'dotted' ? '1,3' : undefined} />
                  </svg>
                </div>
                {colorPickerOpen === 'trend' && (
                  <FibColorPickerPopup
                    colorStr={drawing.trendLineColor || '#787b86'}
                    onChange={c => updateProp('trendLineColor', c)}
                    onClose={() => setColorPickerOpen('')}
                    thickness={drawing.trendLineWidth || 1}
                    onThicknessChange={w => updateProp('trendLineWidth', w)}
                    lineStyle={drawing.trendLineStyle ? drawing.trendLineStyle[0].toUpperCase() + drawing.trendLineStyle.slice(1) : 'Dashed'}
                    onLineStyleChange={s => updateProp('trendLineStyle', s.toLowerCase())}
                    style={{ top: '38px', left: 0 }}
                  />
                )}
              </div>
            </div>

            {/* Levels line */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '120px' }}>
                <span style={{ fontSize: '13px', color: '#131722' }}>Levels line</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <LineStyleMiniDropdown
                  value={drawing.levelsLineStyle || 'solid'}
                  onChange={s => { updateProp('levelsLineStyle', s); setColorPickerOpen(''); }}
                  isOpen={colorPickerOpen === 'levels-style'}
                  onToggle={() => setColorPickerOpen(colorPickerOpen === 'levels-style' ? '' : 'levels-style')}
                />
                <LineThicknessDropdown
                  value={drawing.levelsLineWidth || 1}
                  onChange={w => { updateProp('levelsLineWidth', w); setColorPickerOpen(''); }}
                  isOpen={colorPickerOpen === 'levels-width'}
                  onToggle={() => setColorPickerOpen(colorPickerOpen === 'levels-width' ? '' : 'levels-width')}
                />
              </div>
            </div>

            {/* Extend */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '120px' }}>
                <span style={{ fontSize: '13px', color: '#131722' }}>Extend</span>
              </div>
              <ExtendDropdown
                left={!!drawing.extendLeft}
                right={!!drawing.extendRight}
                onChange={updates => updateDrawing(drawing.id, updates)}
                isOpen={colorPickerOpen === 'extend'}
                onToggle={() => setColorPickerOpen(colorPickerOpen === 'extend' ? '' : 'extend')}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '16px', rowGap: '12px' }}>
              {fibLevels.map((lvl: any, i: number) => {
                const pickerId = `level-${i}`;
                return (
                  <div key={lvl.id} style={{ display: 'flex', alignItems: 'center', opacity: lvl.enabled ? 1 : 0.4 }}>
                    <CheckBox checked={lvl.enabled} onChange={v => updateFibLevel(i, { enabled: v })} />
                    <LocalNumberInput value={lvl.value.toString()} onChange={v => updateFibLevel(i, { value: parseFloat(v) || 0 })} style={{ width: '72px', marginLeft: '8px', marginRight: '8px' }} />
                    <div style={{ position: 'relative', pointerEvents: lvl.enabled ? 'auto' : 'none' }}>
                      <ColorSwatchButton color={lvl.color} onClick={() => setColorPickerOpen(colorPickerOpen === pickerId ? '' : pickerId)} />
                      {colorPickerOpen === pickerId && (
                        <FibColorPickerPopup
                          colorStr={lvl.color}
                          onChange={c => updateFibLevel(i, { color: c })}
                          onClose={() => setColorPickerOpen('')}
                          style={i % 2 === 0 ? { top: '34px', left: 0 } : { top: '34px', right: 0 }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Separator */}
            <div style={{ height: '1px', backgroundColor: '#e0e3eb', margin: '8px 0' }} />

            {/* Use one color */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#131722' }}>Use one color</span>
              <div style={{ position: 'relative', width: '32px', height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${drawing.fibOneColor || '#ef5350'} 50%, ${drawing.fibOneColorAlt || '#26a69a'} 50%)` }} />
                <input type="color" value={drawing.fibOneColor || '#ef5350'} onChange={e => updateProp('fibOneColor', e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              </div>
            </div>

            {/* Background */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckBox checked={drawing.showBackground !== false} onChange={v => updateProp('showBackground', v)} />
              <span style={{ fontSize: '13px', color: '#131722', width: '80px' }}>Background</span>
              <div style={{ flex: 1, position: 'relative', height: '8px', borderRadius: '4px', background: 'linear-gradient(to right, transparent, #5b9cf6)', cursor: 'pointer' }}>
                <input type="range" min="0" max="100" value={Math.round((drawing.backgroundOpacity ?? 0.2) * 100)}
                  onChange={e => updateProp('backgroundOpacity', parseInt(e.target.value) / 100)}
                  style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', margin: 0 }}
                />
                <div style={{
                  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                  left: `${Math.round((drawing.backgroundOpacity ?? 0.2) * 100)}%`, width: '14px', height: '14px',
                  borderRadius: '50%', backgroundColor: '#fff', border: '2px solid #5b9cf6',
                  pointerEvents: 'none', marginLeft: '-7px'
                }} />
              </div>
            </div>

            {/* Reverse */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckBox checked={!!drawing.fibReverse} onChange={v => updateProp('fibReverse', v)} />
              <span style={{ fontSize: '13px', color: '#131722' }}>Reverse</span>
            </div>

            {/* Prices */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckBox checked={drawing.fibPrices !== false} onChange={v => updateProp('fibPrices', v)} />
              <span style={{ fontSize: '13px', color: '#131722' }}>Prices</span>
            </div>

            {/* Levels */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckBox checked={drawing.fibShowLevels !== false} onChange={v => updateProp('fibShowLevels', v)} />
              <span style={{ fontSize: '13px', color: '#131722', width: '80px' }}>Levels</span>
              <select value={drawing.fibLevelFormat || 'Values'} onChange={e => updateProp('fibLevelFormat', e.target.value)}
                style={{ height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#131722', background: '#fff', cursor: 'pointer', minWidth: '100px' }}>
                <option value="Values">Values</option>
                <option value="Percent">Percent</option>
                <option value="Values & Percent">Values & Percent</option>
              </select>
            </div>

            {/* Labels */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#131722', width: '96px' }}>Labels</span>
              <select value={drawing.fibLabelHAlign || 'Left'} onChange={e => updateProp('fibLabelHAlign', e.target.value)}
                style={{ height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#131722', background: '#fff', cursor: 'pointer', flex: 1 }}>
                <option value="Left">Left</option>
                <option value="Center">Center</option>
                <option value="Right">Right</option>
              </select>
              <select value={drawing.fibLabelVAlign || 'Middle'} onChange={e => updateProp('fibLabelVAlign', e.target.value)}
                style={{ height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#131722', background: '#fff', cursor: 'pointer', flex: 1 }}>
                <option value="Top">Top</option>
                <option value="Middle">Middle</option>
                <option value="Bottom">Bottom</option>
              </select>
            </div>

            {/* Text */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckBox checked={drawing.fibShowText !== false} onChange={v => updateProp('fibShowText', v)} />
              <span style={{ fontSize: '13px', color: '#131722', width: '80px' }}>Text</span>
              <select value={drawing.fibTextHAlign || 'Center'} onChange={e => updateProp('fibTextHAlign', e.target.value)}
                style={{ height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#131722', background: '#fff', cursor: 'pointer', flex: 1 }}>
                <option value="Left">Left</option>
                <option value="Center">Center</option>
                <option value="Right">Right</option>
              </select>
              <select value={drawing.fibTextVAlign || 'Middle'} onChange={e => updateProp('fibTextVAlign', e.target.value)}
                style={{ height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#131722', background: '#fff', cursor: 'pointer', flex: 1 }}>
                <option value="Top">Top</option>
                <option value="Middle">Middle</option>
                <option value="Bottom">Bottom</option>
              </select>
            </div>

            {/* Font size */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#131722', width: '96px' }}>Font size</span>
              <select value={drawing.fibFontSize || 11} onChange={e => updateProp('fibFontSize', parseInt(e.target.value))}
                style={{ height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#131722', background: '#fff', cursor: 'pointer', minWidth: '80px' }}>
                {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Fib levels based on log scale */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckBox checked={!!drawing.fibLogScale} onChange={v => updateProp('fibLogScale', v)} />
              <span style={{ fontSize: '13px', color: '#131722' }}>Fib levels based on log scale</span>
            </div>
          </>
        )}

        {activeTab === 'Coordinates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <span style={{ fontSize: '13px', color: '#787b86' }}>Interactive point placement</span>
          </div>
        )}

        {activeTab === 'Visibility' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <CheckBox checked={!!visibility.ticks?.enabled} onChange={(v) => updateVisibility('ticks', { enabled: v })} />
              <span style={{ fontSize: '13px', color: '#131722', marginLeft: '8px' }}>Ticks</span>
            </div>
            
            {[
              { id: 'seconds', label: 'Seconds', min: 1, max: 59 },
              { id: 'minutes', label: 'Minutes', min: 1, max: 59 },
              { id: 'hours', label: 'Hours', min: 1, max: 24 },
              { id: 'days', label: 'Days', min: 1, max: 366 },
              { id: 'weeks', label: 'Weeks', min: 1, max: 52 },
              { id: 'months', label: 'Months', min: 1, max: 12 },
            ].map(row => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', opacity: !!visibility[row.id]?.enabled ? 1 : 0.4, pointerEvents: !!visibility[row.id]?.enabled ? 'auto' : 'none' }}>
                <div style={{ width: '100px', display: 'flex', alignItems: 'center' }}>
                  <CheckBox checked={!!visibility[row.id]?.enabled} onChange={(v) => updateVisibility(row.id, { enabled: v })} />
                  <span style={{ fontSize: '13px', color: '#131722', marginLeft: '8px' }}>{row.label}</span>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', flex: 1, alignItems: 'center' }}>
                  <LocalNumberInput 
                    value={(visibility[row.id]?.from || row.min).toString()} 
                    onChange={(v) => updateVisibility(row.id, { from: parseInt(v) || row.min })}
                    style={{ width: '60px' }} 
                  />
                  <DualRangeSlider 
                    min={row.min} max={row.max} 
                    from={visibility[row.id]?.from || row.min} to={visibility[row.id]?.to || row.max} 
                    onChange={(from, to) => updateVisibility(row.id, { from, to })} 
                  />
                  <LocalNumberInput 
                    value={(visibility[row.id]?.to || row.max).toString()} 
                    onChange={(v) => updateVisibility(row.id, { to: parseInt(v) || row.max })}
                    style={{ width: '60px' }} 
                  />
                </div>
              </div>
            ))}
            
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <CheckBox checked={!!visibility.ranges?.enabled} onChange={(v) => updateVisibility('ranges', { enabled: v })} />
              <span style={{ fontSize: '13px', color: '#131722', marginLeft: '8px' }}>Ranges</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid #e0e3eb' }}>
        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
            style={{ height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '6px', fontSize: '13px', color: '#131722', cursor: 'pointer' }}>
            Template <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {showTemplateDropdown && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: '4px',
              backgroundColor: '#fff', border: `1px solid #e0e3eb`, borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '180px', overflow: 'hidden',
              display: 'flex', flexDirection: 'column', zIndex: 100001
            }}>
              <button onClick={() => { setShowTemplateDropdown(false); setShowSaveModal(true); }} style={{ padding: '10px 16px', background: 'transparent', border: 'none', color: '#131722', cursor: 'pointer', textAlign: 'left', fontSize: '14px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f3fa'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                Save As...
              </button>
              {templates.length > 0 && <div style={{ height: '1px', backgroundColor: '#e0e3eb', margin: '4px 0' }} />}
              {templates.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)} style={{ padding: '10px 16px', background: 'transparent', border: 'none', color: '#131722', cursor: 'pointer', textAlign: 'left', fontSize: '14px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f0f3fa'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '0 16px', height: '34px', background: '#fff', border: '1px solid #131722', borderRadius: '4px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0 24px', height: '34px', background: '#131722', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Ok</button>
        </div>
      </div>
      
      {showSaveModal && (
        <SaveTemplateModal 
          onClose={(saved) => {
            setShowSaveModal(false);
            if (saved && user && drawing) {
              fetch(`http://localhost:8000/api/users/templates/${user.uid}/?tool_type=${drawing.type}`)
                .then(res => res.json())
                .then(data => { if (Array.isArray(data)) setTemplates(data.filter((t: any) => t.name !== 'default')); });
            }
          }}
          settingsToSave={(() => {
             const s = { ...drawing };
             delete s.id; delete s.type; delete s.points; delete s.visible; delete s.locked;
             return s;
          })()}
        />
      )}
    </div>
  );
}
