'use client';
import React, { useState } from 'react';
import { HSVColorPickerPopup } from '../../HSVColorPicker';
import { useEscapeClose } from '../../../lib/useEscapeClose';

// The TradingView-style 8-row swatch grid: grayscale, saturated, then six tint/shade
// rows running light-to-dark for each hue — shared by every color button in the app
// that opens this popup, so they all offer the same palette.
export const TV_COLORS = [
  ["#ffffff", "#f0f3fa", "#e0e3eb", "#b2b5be", "#787b86", "#434651", "#2a2e39", "#1e222d", "#131722", "#000000"],
  ["#f23645", "#ff9800", "#ffeb3b", "#4caf50", "#089981", "#00bcd4", "#2962ff", "#673ab7", "#9c27b0", "#e91e63"],
  ["#fce8e8", "#fdf0e3", "#fef9e6", "#e8f5e9", "#e2f2ef", "#e0f7fa", "#e8f0fe", "#f3e5f5", "#f8e1f4", "#fce4ec"],
  ["#f8b6b6", "#fbc89a", "#fdf0a4", "#a5d6a7", "#8accc1", "#b2ebf2", "#9bb5fe", "#d1c4e9", "#eab6e6", "#f8bbd0"],
  ["#f27979", "#f99e52", "#fce362", "#66bb6a", "#4db6ac", "#4dd0e1", "#648fff", "#9575cd", "#ce85d6", "#f06292"],
  ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#00897b", "#00acc1", "#1e88e5", "#5e35b1", "#ab47bc", "#d81b60"],
  ["#c62828", "#ef6c00", "#fbc02d", "#2e7d32", "#00695c", "#00838f", "#1565c0", "#4527a0", "#8e24aa", "#ad1457"],
  ["#8e0000", "#e65100", "#f57f17", "#1b5e20", "#004d40", "#006064", "#0d47a1", "#311b92", "#6a1b9a", "#880e4f"],
];

export function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function parseColorInput(colorStr: string) {
  if (!colorStr) return { hex: '#000000', opacity: 100 };
  if (colorStr.startsWith('#')) {
    // #rrggbbaa carries its own opacity
    if (/^#[0-9a-f]{8}$/i.test(colorStr)) return { hex: colorStr.slice(0, 7), opacity: Math.round(parseInt(colorStr.slice(7), 16) / 255 * 100) };
    return { hex: colorStr, opacity: 100 };
  }
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    const hex = `#${parseInt(match[1]).toString(16).padStart(2, '0')}${parseInt(match[2]).toString(16).padStart(2, '0')}${parseInt(match[3]).toString(16).padStart(2, '0')}`;
    const opacity = match[4] !== undefined ? Math.round(parseFloat(match[4]) * 100) : 100;
    return { hex, opacity };
  }
  return { hex: '#000000', opacity: 100 };
}

// A click-outside listener (e.g. a modal's own root onClick) that only checks
// stopPropagation() would still see this click via React's synthetic event
// bubbling in some cases — stopImmediatePropagation on the native event is the fix
// already used elsewhere in the codebase (see SessionSettingsModal's ColorSquare).
export function stopAll(e: React.SyntheticEvent) {
  e.stopPropagation();
  if (e.nativeEvent) (e.nativeEvent as Event).stopImmediatePropagation();
}

interface ColorPickerPopupProps {
  colorStr: string;
  onChange: (c: string) => void;
  onClose: () => void;
  thickness?: number;
  onThicknessChange?: (w: number) => void;
  lineStyle?: string;
  onLineStyleChange?: (s: string) => void;
  style?: React.CSSProperties;
}

// Swatch-grid + opacity color picker, with a "+" custom-color swatch (opens a real HSV
// picker with an editable hex input, not the browser's native OS color dialog) and
// optional thickness/line-style rows. Shared by every tool's "Line Color"/"Text Color"
// buttons so they all get the same picker instead of each rolling its own.
export function ColorPickerPopup({ colorStr, onChange, onClose, thickness, onThicknessChange, lineStyle, onLineStyleChange, style }: ColorPickerPopupProps) {
  useEscapeClose(onClose);
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
        padding: '12px', width: showCustomPicker ? '236px' : '216px', boxSizing: 'content-box', overflow: 'hidden', ...style,
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
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
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
