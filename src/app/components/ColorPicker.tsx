import React, { useState, useRef, useEffect } from 'react';
import { HSVColorPickerPopup } from './HSVColorPicker';

const COLORS = [
  // Grayscale
  ['#ffffff', '#e0e3eb', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#2a2e39', '#1e222d', '#131722'],
  // Reds
  ['#fceced', '#f9d9db', '#f4a3a8', '#f07479', '#ec454a', '#e0292f', '#cc242a', '#b82026', '#a31d22', '#8f191e'],
  // Oranges
  ['#fff2e5', '#ffdfbf', '#ffb973', '#ff9326', '#f27c00', '#d96f00', '#bf6200', '#a65500', '#8c4800', '#733b00'],
  // Yellows
  ['#fffce5', '#fff7bf', '#ffed73', '#ffe326', '#f2d400', '#d9be00', '#bfa800', '#a69200', '#8c7b00', '#736500'],
  // Greens
  ['#e5f5f2', '#bfe8e1', '#73d0bf', '#26b89d', '#089981', '#078a74', '#067a67', '#056b5a', '#055c4d', '#044d40'],
  // Cyans
  ['#e5f7ff', '#bfefff', '#73dfff', '#26cfff', '#00bfff', '#00abfc', '#0097e6', '#0084cc', '#0071b3', '#005e99'],
  // Blues
  ['#ebf0ff', '#d6e2ff', '#aabfff', '#7f9cff', '#547aff', '#2962ff', '#2050d6', '#183eb0', '#112d8a', '#091c63'],
  // Purples
  ['#f7e5ff', '#efbfff', '#df73ff', '#cf26ff', '#b300eb', '#9d00cc', '#8700ad', '#71008f', '#5c0070', '#470052']
];

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
  theme?: string;
  style?: React.CSSProperties;
}

export default function ColorPicker({ color, onChange, onClose, theme = 'light', style }: ColorPickerProps) {
  const isDark = theme === 'dark';
  const bg = isDark ? '#1e222d' : '#ffffff';
  const text = isDark ? '#d1d4dc' : '#131722';
  const border = isDark ? '#2a2e39' : '#e0e3eb';
  const hoverBg = isDark ? '#2a2e39' : '#f0f3fa';

  const pickerRef = useRef<HTMLDivElement>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Extract opacity and hex from color if it's rgba or hex
  const [opacity, setOpacity] = useState(100);

  useEffect(() => {
    // Parse color for initial opacity if possible, simplified for now
    if (color.startsWith('rgba')) {
      const match = color.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/);
      if (match) {
        setOpacity(Math.round(parseFloat(match[1]) * 100));
      }
    }
  }, [color]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleColorClick = (hex: string) => {
    if (opacity < 100) {
      // Convert hex to rgba
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      onChange(`rgba(${r}, ${g}, ${b}, ${opacity / 100})`);
    } else {
      onChange(hex);
    }
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newOp = parseInt(e.target.value);
    setOpacity(newOp);
    
    // Attempt to update existing color with new opacity
    let hex = color;
    if (color.startsWith('rgba')) {
      // Very naive conversion back to hex for internal use, usually TV keeps a base color state
      // For simplicity, we just trigger onChange with the updated rgba if we can parse the base
      const match = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (match) {
        onChange(`rgba(${match[1]}, ${match[2]}, ${match[3]}, ${newOp / 100})`);
        return;
      }
    } else if (color.startsWith('#')) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      onChange(`rgba(${r}, ${g}, ${b}, ${newOp / 100})`);
    }
  };

  const baseHex = color.startsWith('#') ? color : (() => {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) return `#${[1, 2, 3].map(i => parseInt(match[i]).toString(16).padStart(2, '0')).join('')}`;
    return '#000000';
  })();

  return (
    <div
      ref={pickerRef}
      style={{
        position: 'absolute',
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        zIndex: 100000,
        ...style
      }}
    >
      {showCustomPicker ? (
        <HSVColorPickerPopup
          hex={baseHex}
          isDark={isDark}
          onApply={(hex) => { handleColorClick(hex); setShowCustomPicker(false); }}
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {COLORS.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: '6px' }}>
                {row.map(c => {
                  // Basic check to see if this is the currently selected base color
                  const isSelected = color.toLowerCase().includes(c.toLowerCase()) ||
                    (color.startsWith('rgba') && opacity === 100 && c === color);

                  return (
                    <div
                      key={c}
                      onClick={() => handleColorClick(c)}
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: c,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: isSelected ? '2px solid #2962ff' : '1px solid rgba(0,0,0,0.1)',
                        boxSizing: 'border-box'
                      }}
                      title={c}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setShowCustomPicker(true)}
              title="Custom color"
              style={{
                background: 'transparent', border: 'none', color: text, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '4px'
              }} onMouseEnter={e => e.currentTarget.style.backgroundColor = hoverBg} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#787b86' }}>Opacity</span>
              <input
                type="range"
                min="0" max="100"
                value={opacity}
                onChange={handleOpacityChange}
                style={{ flex: 1, accentColor: '#2962ff' }}
              />
              <span style={{ fontSize: '12px', minWidth: '32px' }}>{opacity}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
