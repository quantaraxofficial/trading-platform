'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useDrawing } from '../core/DrawingContext';
import { DualRangeSlider } from './DualRangeSlider';
import { ColorPickerPopup } from './ColorPickerPopup';
import { useEscapeClose } from "../../../lib/useEscapeClose";

interface HorizontalRaySettingsModalProps {
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

function LocalNumberInput({ value, onChange, style }: { value: string; onChange?: (val: string) => void; style?: React.CSSProperties }) {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);
  const handleBlur = () => { if (onChange && localVal !== value) onChange(localVal); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <input type="text" value={localVal} onChange={(e) => setLocalVal(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown}
      style={{ width: '60px', height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#131722', outline: 'none', ...style }}
    />
  );
}

export function HorizontalRaySettingsModal({ onClose, initialPosition }: HorizontalRaySettingsModalProps) {
  useEscapeClose(onClose);
  const { drawings, updateDrawing, selectedShapeId } = useDrawing();
  const drawing = drawings.find((d: any) => d.id === selectedShapeId);

  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('Style');
  const [showLineColorPicker, setShowLineColorPicker] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  // Each ref spans its own swatch button + popup together, so a click that lands back on
  // the swatch (to toggle the popup closed) counts as "inside" and only the button's own
  // handler decides the outcome — a plain "click landed outside the popup element itself"
  // check would ALSO fire on that same click (mousedown reaches document before the
  // button's onClick runs), closing it and then the button's own toggle immediately
  // reopening it.
  const lineColorRef = useRef<HTMLDivElement>(null);
  const textColorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLineColorPicker && !showTextColorPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (showLineColorPicker && lineColorRef.current && !lineColorRef.current.contains(e.target as Node)) {
        setShowLineColorPicker(false);
      }
      if (showTextColorPicker && textColorRef.current && !textColorRef.current.contains(e.target as Node)) {
        setShowTextColorPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLineColorPicker, showTextColorPicker]);

  type VisibilityRow = { enabled: boolean; from?: number; to?: number };
  const [visibility, setVisibility] = useState<Record<string, VisibilityRow>>(drawing?.visibility || {
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
  }, [drawing]);

  useEffect(() => {
    if (position.x === 0 && position.y === 0 && typeof window !== 'undefined') {
      setPosition({ x: window.innerWidth / 2 - 190, y: window.innerHeight / 2 - 260 });
    }
  }, []);

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

  const point = drawing.points?.[0] || { logical: 0, price: 0 };
  const tabs = ['Style', 'Text', 'Coordinates', 'Visibility'];

  const tabButtonStyle = (tab: string): React.CSSProperties => ({
    padding: '8px 0', fontSize: '14px', fontWeight: activeTab === tab ? 600 : 400, color: '#131722',
    background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid #131722' : '2px solid transparent', cursor: 'pointer',
  });

  return (
    <div
      style={{
        position: 'fixed', left: position.x, top: position.y, width: '380px',
        backgroundColor: '#ffffff', borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
        zIndex: 2000, display: 'flex', flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        userSelect: 'none',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div
        onMouseDown={e => { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'grab' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#131722' }}>Horizontal ray</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid #e0e3eb', gap: '20px' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={tabButtonStyle(tab)}>{tab}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {activeTab === 'Style' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100px', fontSize: '14px', color: '#131722' }}>Line</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div ref={lineColorRef} style={{ position: 'relative' }}>
                  <div
                    onClick={() => setShowLineColorPicker(v => !v)}
                    style={{ position: 'relative', width: '32px', height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}
                  >
                    <div style={{ width: '100%', height: '100%', backgroundColor: drawing.stroke || '#2962ff', borderRadius: '2px' }} />
                  </div>
                  {showLineColorPicker && (
                    <ColorPickerPopup
                      colorStr={drawing.stroke || '#2962ff'}
                      onChange={c => updateProp('stroke', c)}
                      onClose={() => setShowLineColorPicker(false)}
                      style={{ top: '100%', left: 0, marginTop: '8px' }}
                    />
                  )}
                </div>
                <select value={drawing.strokeWidth || 2} onChange={e => updateProp('strokeWidth', parseInt(e.target.value))} style={{ height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px' }}>
                  {[1, 2, 3, 4].map(w => <option key={w} value={w}>{w}px</option>)}
                </select>
                <select value={drawing.lineStyle || 'solid'} onChange={e => updateProp('lineStyle', e.target.value)} style={{ height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px' }}>
                  <option value="solid">Line</option>
                  <option value="dashed">Dashed line</option>
                  <option value="dotted">Dotted line</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => updateProp('priceLabel', drawing.priceLabel === false)}>
              <CheckBox checked={drawing.priceLabel !== false} onChange={v => updateProp('priceLabel', v)} />
              <span style={{ fontSize: '13px', color: '#131722', marginLeft: '8px' }}>Price label</span>
            </div>
          </div>
        )}

        {activeTab === 'Text' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div ref={textColorRef} style={{ position: 'relative' }}>
                <div
                  onClick={() => setShowTextColorPicker(v => !v)}
                  style={{ position: 'relative', width: '32px', height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}
                >
                  <div style={{ width: '100%', height: '100%', backgroundColor: drawing.textColor || drawing.stroke || '#2962ff', borderRadius: '2px' }} />
                </div>
                {showTextColorPicker && (
                  <ColorPickerPopup
                    colorStr={drawing.textColor || drawing.stroke || '#2962ff'}
                    onChange={c => updateProp('textColor', c)}
                    onClose={() => setShowTextColorPicker(false)}
                    style={{ top: '100%', left: 0, marginTop: '8px' }}
                  />
                )}
              </div>
              <select value={drawing.fontSize || 14} onChange={e => updateProp('fontSize', parseInt(e.target.value))} style={{ height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px' }}>
                {[10, 12, 14, 16, 18, 20, 24, 28, 32].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={() => updateProp('bold', !drawing.bold)}
                style={{ width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', background: drawing.bold ? '#131722' : '#fff', color: drawing.bold ? '#fff' : '#131722', fontWeight: 700, cursor: 'pointer' }}
              >B</button>
              <button
                onClick={() => updateProp('italic', !drawing.italic)}
                style={{ width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', background: drawing.italic ? '#131722' : '#fff', color: drawing.italic ? '#fff' : '#131722', fontStyle: 'italic', cursor: 'pointer' }}
              >I</button>
            </div>

            <textarea
              value={drawing.text || ''}
              onChange={e => updateProp('text', e.target.value)}
              placeholder="Add text"
              style={{ width: '100%', height: '80px', border: '1px solid #2962ff', borderRadius: '4px', padding: '10px 12px', fontSize: '14px', fontFamily: 'inherit', resize: 'none', outline: 'none', color: '#131722', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: '#131722' }}>Text alignment</span>
              <select value={drawing.textVAlign || 'Bottom'} onChange={e => updateProp('textVAlign', e.target.value)} style={{ height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px' }}>
                <option value="Top">Top</option>
                <option value="Middle">Middle</option>
                <option value="Bottom">Bottom</option>
              </select>
              <select value={drawing.textHAlign || 'Center'} onChange={e => updateProp('textHAlign', e.target.value)} style={{ height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px' }}>
                <option value="Left">Left</option>
                <option value="Center">Center</option>
                <option value="Right">Right</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'Coordinates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: '#787b86', width: '110px' }}>#1 (price, bar)</span>
              <LocalNumberInput
                value={point.price.toString()}
                onChange={(v) => {
                  const parsed = parseFloat(v);
                  if (!isNaN(parsed) && selectedShapeId) updateDrawing(selectedShapeId, { points: [{ ...point, price: parsed }] });
                }}
                style={{ width: '110px' }}
              />
              <LocalNumberInput
                value={Math.round(point.logical).toString()}
                onChange={(v) => {
                  const parsed = parseInt(v, 10);
                  if (!isNaN(parsed) && selectedShapeId) updateDrawing(selectedShapeId, { points: [{ ...point, logical: parsed }] });
                }}
                style={{ width: '80px' }}
              />
            </div>
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
        <div style={{ height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '6px', fontSize: '13px', color: '#131722', cursor: 'pointer' }}>
          Template <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '0 16px', height: '34px', background: '#fff', border: '1px solid #131722', borderRadius: '4px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0 24px', height: '34px', background: '#131722', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Ok</button>
        </div>
      </div>
    </div>
  );
}
