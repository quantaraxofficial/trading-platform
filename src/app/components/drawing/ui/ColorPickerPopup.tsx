'use client';
import React, { useState } from 'react';
import { HSVColorPickerPopup } from '../../HSVColorPicker';
import { useEscapeClose } from '../../../lib/useEscapeClose';

// The TradingView-style 8-row swatch grid: grayscale, saturated, then six tint/shade
// rows running light-to-dark for each hue — shared by every color button in the app
// that opens this popup, so they all offer the same palette.
export const TV_COLORS = [
  ['#ffffff', '#dbdbdb', '#b8b8b8', '#9c9c9c', '#808080', '#636363', '#4a4a4a', '#2e2e2e', '#0f0f0f', '#000000'],
  ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'],
  ['#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#ace5dc', '#b2ebf2', '#bbd9fb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
  ['#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#70ccbd', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1'],
  ['#f77c80', '#ffb74d', '#fff176', '#81c784', '#42bda8', '#4dd0e1', '#5b9cf6', '#9575cd', '#ba68c8', '#f06292'],
  ['#f7525f', '#ffa726', '#ffee58', '#66bb6a', '#22ab94', '#26c6da', '#3179f5', '#7e57c2', '#ab47bc', '#ec407a'],
  ['#b22833', '#f57c00', '#fbc02d', '#388e3c', '#056656', '#0097a7', '#1848cc', '#512da8', '#7b1fa2', '#c2185b'],
  ['#801922', '#e65100', '#f57f17', '#1b5e20', '#00332a', '#006064', '#0c3299', '#311b92', '#4a148c', '#880e4f'],
];

// TradingView's popup: 17px swatches 6px apart, and the line-style values tools store
const SW = 17;
const GAP = 6;
const GRID_W = SW * 10 + GAP * 9;
const LINE_STYLES = ['Solid', 'Dashed', 'Dotted'];
const CUSTOM_COLORS_KEY = 'tv:customColors';

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

  // TradingView keeps colours made with "+" as swatches next to it
  const [customColors, setCustomColors] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_COLORS_KEY) || '[]').filter((c: unknown) => typeof c === 'string'); } catch { return []; }
  });
  const addCustomColor = (c: string) => {
    setCustomColors(prev => {
      const next = [c, ...prev.filter(x => x.toLowerCase() !== c.toLowerCase())].slice(0, 9);
      try { localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const swatch = (c: string, key: string | number) => {
    const on = hex.toLowerCase() === c.toLowerCase();
    return (
      <div key={key} onClick={() => applyColor(c, opacity)} title={c}
        style={{
          width: SW, height: SW, borderRadius: 3, cursor: 'pointer', backgroundColor: c, boxSizing: 'border-box',
          border: c.toLowerCase() === '#ffffff' ? '1px solid #dbdbdb' : 'none',
          boxShadow: on ? '0 0 0 1.5px #ffffff, 0 0 0 3px #0f0f0f' : undefined,
        }}
      />
    );
  };
  const label = (t: string) => <div style={{ margin: '14px 0 8px', fontSize: 14, color: 'var(--tv-color-text-muted)' }}>{t}</div>;
  const segments = (count: number, isOn: (i: number) => boolean, pick: (i: number) => void, draw: (i: number, color: string) => React.ReactNode) => (
    <div style={{ display: 'flex', border: '1px solid var(--tv-sub-border)', borderRadius: 6, overflow: 'hidden' }}>
      {Array.from({ length: count }, (_, i) => {
        const on = isOn(i);
        return (
          <button key={i} type="button" onClick={() => pick(i)}
            style={{
              flex: 1, height: 32, background: on ? 'var(--tv-sub-text)' : 'transparent', border: 'none', borderLeft: i > 0 ? '1px solid var(--tv-sub-border)' : 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            {draw(i, on ? 'var(--tv-sub-bg)' : 'var(--tv-sub-text)')}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute', backgroundColor: 'var(--tv-sub-bg)', borderRadius: 6, boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)', zIndex: 100000,
        padding: '12px 13px', width: showCustomPicker ? 236 : GRID_W, boxSizing: 'content-box', overflow: 'hidden', ...style,
      }}
      onClick={stopAll}
    >
      {showCustomPicker ? (
        <HSVColorPickerPopup
          hex={hex}
          isDark={typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'}
          onApply={(newHex) => { addCustomColor(newHex); applyColor(newHex, opacity); setShowCustomPicker(false); }}
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(10, ${SW}px)`, gap: GAP }}>
            {TV_COLORS.slice(0, 2).flat().map((c, i) => swatch(c, i))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(10, ${SW}px)`, gap: GAP, marginTop: GAP * 2 }}>
            {TV_COLORS.slice(2).flat().map((c, i) => swatch(c, i))}
          </div>

          <div style={{ height: 1, backgroundColor: '#dbdbdb', margin: '15px 0 10px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(10, ${SW}px)`, gap: GAP, alignItems: 'center' }}>
            {customColors.map((c, i) => swatch(c, `c${i}`))}
            <div onClick={() => setShowCustomPicker(true)} title="Add custom color"
              style={{ width: SW, height: SW, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tv-sub-text)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M7 0v14M0 7h14" /></svg>
            </div>
          </div>

          {label('Opacity')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, height: 10, borderRadius: 5, border: '1px solid #b8b8b8', boxSizing: 'border-box',
                backgroundImage: `linear-gradient(to right, transparent, ${hex}), repeating-conic-gradient(#d1d4dc 0% 25%, #ffffff 0% 50%)`,
                backgroundSize: '100% 100%, 8px 8px',
              }} />
              <input type="range" min="0" max="100" value={opacity} onChange={e => applyColor(hex, parseInt(e.target.value))} aria-label="Opacity"
                style={{ position: 'absolute', inset: 0, width: '100%', cursor: 'pointer', opacity: 0, zIndex: 2, margin: 0 }} />
              <div style={{ position: 'absolute', left: `calc(${opacity}% - ${opacity * 0.14}px)`, width: 14, height: 14, backgroundColor: 'var(--tv-sub-bg)', border: '2px solid var(--tv-sub-text)', borderRadius: '50%', boxSizing: 'border-box', pointerEvents: 'none' }} />
            </div>
            <div style={{ width: 48, height: 32, border: '1px solid var(--tv-sub-border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, boxSizing: 'border-box', fontSize: 14, color: 'var(--tv-sub-text)' }}>
              {opacity}%
            </div>
          </div>
        </>
      )}

      {!showCustomPicker && onThicknessChange && (
        <>
          {label('Thickness')}
          {segments(4, i => thickness === i + 1, i => onThicknessChange(i + 1), (i, color) => (
            <span style={{ width: 31, height: i + 1, background: color, display: 'block' }} />
          ))}
        </>
      )}

      {!showCustomPicker && onLineStyleChange && (
        <>
          {label('Line style')}
          {segments(3, i => (lineStyle || 'Solid').toLowerCase() === LINE_STYLES[i].toLowerCase(), i => onLineStyleChange(LINE_STYLES[i]), (i, color) => (
            <svg width="31" height="2" viewBox="0 0 31 2" aria-hidden>
              <line x1="0" y1="1" x2="31" y2="1" stroke={color} strokeWidth="2" strokeDasharray={i === 1 ? '4 3' : i === 2 ? '2 2' : undefined} />
            </svg>
          ))}
        </>
      )}
    </div>
  );
}
