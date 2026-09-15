'use client';
import React, { useState, useRef, useCallback } from 'react';

function hsvToHex(h: number, s: number, v: number) {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string) {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000';
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

interface HSVColorPickerPopupProps {
  hex: string;
  onApply: (hex: string) => void;
  isDark?: boolean;
}

// Full HSV picker: hex input + Add button, saturation/value square, vertical hue slider.
export function HSVColorPickerPopup({ hex, onApply, isDark }: HSVColorPickerPopupProps) {
  const initial = hexToHsv(hex);
  const [h, setH] = useState(initial.h);
  const [s, setS] = useState(initial.s);
  const [v, setV] = useState(initial.v);
  const [hexInput, setHexInput] = useState(hex);

  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  const currentHex = hsvToHex(h, s, v);
  const border = isDark ? '#2a2e39' : '#e0e3eb';
  const text = isDark ? '#d1d4dc' : '#131722';
  const inputBg = isDark ? '#131722' : '#ffffff';

  const updateFromSV = useCallback((clientX: number, clientY: number) => {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const newS = x * 100;
    const newV = (1 - y) * 100;
    setS(newS);
    setV(newV);
    setHexInput(hsvToHex(h, newS, newV));
  }, [h]);

  const updateFromHue = useCallback((clientY: number) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const newH = y * 360;
    setH(newH);
    setHexInput(hsvToHex(newH, s, v));
  }, [s, v]);

  const dragging = useRef<'sv' | 'hue' | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging.current === 'sv') updateFromSV(e.clientX, e.clientY);
    else if (dragging.current === 'hue') updateFromHue(e.clientY);
  }, [updateFromSV, updateFromHue]);

  const handleMouseUp = useCallback(() => {
    dragging.current = null;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const startDrag = (type: 'sv' | 'hue') => {
    dragging.current = type;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleHexInputChange = (val: string) => {
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      const parsed = hexToHsv(val);
      setH(parsed.h);
      setS(parsed.s);
      setV(parsed.v);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '24px', height: '24px', borderRadius: '4px', backgroundColor: currentHex, border: `1px solid ${border}`, flexShrink: 0 }} />
        <input
          type="text"
          value={hexInput}
          onChange={e => handleHexInputChange(e.target.value)}
          style={{
            flex: 1, height: '28px', padding: '0 8px', borderRadius: '4px',
            border: `1px solid ${border}`, backgroundColor: inputBg, color: text, fontSize: '13px',
          }}
        />
        <button
          onClick={() => onApply(/^#[0-9a-fA-F]{6}$/.test(hexInput) ? hexInput : currentHex)}
          style={{
            height: '28px', padding: '0 12px', borderRadius: '4px', border: 'none',
            backgroundColor: '#2962ff', color: '#ffffff', fontSize: '13px', cursor: 'pointer', flexShrink: 0,
          }}
        >
          Add
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <div
          ref={svRef}
          onMouseDown={e => { updateFromSV(e.clientX, e.clientY); startDrag('sv'); }}
          style={{
            position: 'relative', width: '188px', height: '150px', borderRadius: '4px', cursor: 'crosshair',
            backgroundColor: hsvToHex(h, 100, 100),
            backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
          }}
        >
          <div style={{
            position: 'absolute', left: `${s}%`, top: `${100 - v}%`,
            width: '12px', height: '12px', borderRadius: '50%',
            border: '2px solid #fff', boxShadow: '0 0 2px rgba(0,0,0,0.6)',
            transform: 'translate(-50%, -50%)', pointerEvents: 'none',
          }} />
        </div>

        <div
          ref={hueRef}
          onMouseDown={e => { updateFromHue(e.clientY); startDrag('hue'); }}
          style={{
            position: 'relative', width: '14px', height: '150px', borderRadius: '4px', cursor: 'pointer',
            background: 'linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
        >
          <div style={{
            position: 'absolute', left: '-2px', right: '-2px', top: `${(h / 360) * 100}%`,
            height: '4px', borderRadius: '2px', border: '2px solid #fff',
            boxShadow: '0 0 2px rgba(0,0,0,0.6)', transform: 'translateY(-50%)', pointerEvents: 'none',
          }} />
        </div>
      </div>
    </div>
  );
}
