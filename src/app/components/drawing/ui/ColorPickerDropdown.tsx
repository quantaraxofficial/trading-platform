'use client';
import React, { useState } from 'react';
import { COLOR_PALETTE } from './ColorPalette';

interface ColorPickerDropdownProps {
  color: string; // rgba or hex
  onChange: (color: string) => void;
  onClose: () => void;
  thickness?: number;
  onThicknessChange?: (w: number) => void;
  lineStyle?: string;
  onLineStyleChange?: (s: string) => void;
}

export function ColorPickerDropdown({ 
  color, onChange, onClose, 
  thickness, onThicknessChange, 
  lineStyle, onLineStyleChange 
}: ColorPickerDropdownProps) {
  // Extract initial opacity if it's rgba, else 100
  const getInitialOpacity = (col: string) => {
    if (col.startsWith('rgba')) {
      const match = col.match(/[\d.]+\)$/);
      if (match) return Math.round(parseFloat(match[0]) * 100);
    }
    return 100;
  };

  const getHex = (col: string) => {
    if (col.startsWith('rgba')) {
      const parts = col.match(/\d+/g);
      if (parts && parts.length >= 3) {
        return `#${parseInt(parts[0]).toString(16).padStart(2, '0')}${parseInt(parts[1]).toString(16).padStart(2, '0')}${parseInt(parts[2]).toString(16).padStart(2, '0')}`;
      }
    }
    return col;
  };

  const [currentHex, setCurrentHex] = useState(getHex(color));
  const [opacity, setOpacity] = useState(getInitialOpacity(color));

  const handleColorClick = (hex: string) => {
    setCurrentHex(hex);
    applyChange(hex, opacity);
  };

  const handleOpacityChange = (val: number) => {
    setOpacity(val);
    applyChange(currentHex, val);
  };

  const applyChange = (hex: string, op: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const rgba = `rgba(${r}, ${g}, ${b}, ${op / 100})`;
    onChange(rgba);
  };

  return (
    <div 
      style={{ 
        position: 'absolute', top: '100%', left: 0, marginTop: '8px',
        backgroundColor: '#ffffff', border: '1px solid #e0e3eb', borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, padding: '12px',
        width: '240px'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px', marginBottom: '12px' }}>
        {COLOR_PALETTE.flat().map((c, i) => (
          <div 
            key={i} 
            onClick={() => handleColorClick(c)}
            style={{ 
              width: '18px', height: '18px', backgroundColor: c, borderRadius: '2px', cursor: 'pointer',
              border: currentHex === c ? '2px solid #2962ff' : '1px solid rgba(0,0,0,0.1)',
              boxSizing: 'border-box'
            }} 
          />
        ))}
      </div>

      <div style={{ width: '100%', height: '1px', backgroundColor: '#e0e3eb', marginBottom: '12px' }}></div>

      <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#131722' }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="9" y1="4" x2="9" y2="14" />
          <line x1="4" y1="9" x2="14" y2="9" />
        </svg>
      </div>

      <div style={{ marginBottom: '4px', fontSize: '12px', color: '#787b86' }}>Opacity</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ flex: 1, position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          <div style={{ 
            position: 'absolute', inset: '8px 0', borderRadius: '2px',
            backgroundImage: `linear-gradient(to right, transparent, ${currentHex})`,
            backgroundColor: '#eee', backgroundSize: 'cover'
          }} />
          <input 
            type="range" min="0" max="100" value={opacity} 
            onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
            style={{ 
              position: 'absolute', inset: 0, width: '100%', cursor: 'pointer', opacity: 0, zIndex: 2
            }} 
          />
          <div style={{ 
            position: 'absolute', left: `${opacity}%`, width: '12px', height: '12px', 
            backgroundColor: '#ffffff', border: '2px solid #2962ff', borderRadius: '50%',
            transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 1
          }} />
        </div>
        <div style={{ 
          width: '44px', height: '24px', border: '1px solid #e0e3eb', borderRadius: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#131722'
        }}>
          {opacity}%
        </div>
      </div>

      {onThicknessChange !== undefined && (
        <>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#e0e3eb', margin: '12px 0' }}></div>
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#787b86' }}>Thickness</div>
          <div style={{ display: 'flex', border: '1px solid #e0e3eb', borderRadius: '4px', overflow: 'hidden' }}>
            {[1, 2, 3, 4].map(w => (
              <button 
                key={w} 
                onClick={() => onThicknessChange(w)}
                style={{ 
                  flex: 1, height: '32px', background: thickness === w ? '#131722' : 'transparent', 
                  border: 'none', borderRight: w < 4 ? '1px solid #e0e3eb' : 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <div style={{ width: '16px', height: `${w}px`, backgroundColor: thickness === w ? '#ffffff' : '#131722' }} />
              </button>
            ))}
          </div>
        </>
      )}

      {onLineStyleChange !== undefined && (
        <>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#e0e3eb', margin: '12px 0' }}></div>
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#787b86' }}>Line style</div>
          <div style={{ display: 'flex', border: '1px solid #e0e3eb', borderRadius: '4px', overflow: 'hidden' }}>
            {['Solid', 'Dashed', 'Dotted'].map(s => (
              <button 
                key={s} 
                onClick={() => onLineStyleChange(s)}
                style={{ 
                  flex: 1, height: '32px', background: lineStyle === s ? '#131722' : 'transparent', 
                  border: 'none', borderRight: s !== 'Dotted' ? '1px solid #e0e3eb' : 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <svg width="24" height="12" viewBox="0 0 24 12" fill="none" stroke={lineStyle === s ? '#ffffff' : '#131722'} strokeWidth="2">
                  {s === 'Solid' ? <line x1="0" y1="6" x2="24" y2="6"/> :
                   s === 'Dashed' ? <><line x1="0" y1="6" x2="8" y2="6"/><line x1="12" y1="6" x2="20" y2="6"/></> :
                   <><circle cx="2" cy="6" r="1" fill={lineStyle === s ? '#ffffff' : '#131722'}/><circle cx="8" cy="6" r="1" fill={lineStyle === s ? '#ffffff' : '#131722'}/><circle cx="14" cy="6" r="1" fill={lineStyle === s ? '#ffffff' : '#131722'}/><circle cx="20" cy="6" r="1" fill={lineStyle === s ? '#ffffff' : '#131722'}/></>}
                </svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
