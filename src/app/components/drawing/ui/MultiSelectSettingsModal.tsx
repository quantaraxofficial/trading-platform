'use client';
import React, { useState, useEffect } from 'react';
import { useDrawing, useSettingsSession } from '../core/DrawingContext';
import { DualRangeSlider } from './DualRangeSlider';
import { useEscapeClose } from "../../../lib/useEscapeClose";
import { PaletteInput } from "./PaletteInput";

interface MultiSelectSettingsModalProps {
  onClose: () => void;
  initialPosition?: { x: number, y: number };
}

function CheckBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '18px', height: '18px', borderRadius: '3px',
        border: checked ? 'none' : '1px solid var(--tv-sub-muted)',
        backgroundColor: checked ? '#2962ff' : 'var(--tv-sub-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tv-sub-bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

function LocalNumberInput({ value, onChange, style, placeholder }: { value: string; onChange?: (val: string) => void; style?: React.CSSProperties; placeholder?: string }) {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);
  const handleBlur = () => { if (onChange && localVal !== value) onChange(localVal); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <input type="text" value={localVal} onChange={(e) => setLocalVal(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} placeholder={placeholder}
      style={{ width: '60px', height: '32px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: 'var(--tv-sub-text)', outline: 'none', ...style }}
    />
  );
}

export function MultiSelectSettingsModal({ onClose, initialPosition }: MultiSelectSettingsModalProps) {
  const cancelEdit = useSettingsSession(onClose);
  useEscapeClose(cancelEdit);
  const { drawings, selectedShapeIds, updateMultipleDrawings } = useDrawing();
  const ids = Array.from(selectedShapeIds);
  const selectedDrawings = drawings.filter((d: any) => selectedShapeIds.has(d.id));
  
  // Use properties from the first drawing as the baseline, or default values
  const baselineDrawing = selectedDrawings[0] || {};

  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('Style');

  // Multi-select specific state
  const [lineColor, setLineColor] = useState(baselineDrawing.stroke || '#2962ff');
  const [hasPriceLabel, setHasPriceLabel] = useState(!!baselineDrawing.showPriceLabel);
  const [hasBackground, setHasBackground] = useState(!!baselineDrawing.fill);
  const [backgroundColor, setBackgroundColor] = useState(baselineDrawing.fill || 'rgba(41, 98, 255, 0.2)');
  const [textColor, setTextColor] = useState(baselineDrawing.textColor || '#2962ff');

  const [displacementPrice, setDisplacementPrice] = useState('');
  const [displacementBar, setDisplacementBar] = useState('');

  const [visibility, setVisibility] = useState(baselineDrawing.visibility || {
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
    updateMultipleDrawings(ids, { visibility: newVisibility });
  };

  useEffect(() => {
    if (position.x === 0 && position.y === 0 && typeof window !== 'undefined') {
      setPosition({ x: window.innerWidth / 2 - 180, y: window.innerHeight / 2 - 250 });
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

  if (selectedShapeIds.size < 2) return null;

  const tabs = ['Style', 'Displacement', 'Visibility'];

  const applyDisplacement = () => {
    // In a real implementation this would parse the math signs +,-,/,* 
    // and apply to the points/logical values. Here we just mock the function.
    if (displacementPrice || displacementBar) {
       // Mock apply
    }
  };

  const handleOk = () => {
    applyDisplacement();
    onClose();
  };

  return (
    <div 
      style={{
        position: 'fixed', left: position.x, top: position.y, width: '380px',
        backgroundColor: 'var(--tv-sub-bg)', borderRadius: '8px',
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
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tv-sub-text)' }}>Selected Drawings</span>
        </div>
        <button onClick={cancelEdit} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid var(--tv-sub-border)', gap: '20px' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '8px 0', fontSize: '14px', fontWeight: activeTab === tab ? 600 : 400, color: 'var(--tv-sub-text)', background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid #2962ff' : '2px solid transparent', cursor: 'pointer' }}
          >{tab}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {activeTab === 'Style' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Line row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '120px', fontSize: '14px', color: 'var(--tv-sub-text)' }}>Line</div>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', padding: '2px 8px', gap: '12px' }}>
                <div style={{ position: 'relative', width: '20px', height: '20px', borderRadius: '2px', background: 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}>
                  <PaletteInput value={lineColor} onChange={e => {
                    setLineColor(e.target.value);
                    updateMultipleDrawings(ids, { stroke: e.target.value });
                  }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
                </div>
                <div style={{ width: '24px', height: '2px', backgroundColor: '#131722' }} />
              </div>
            </div>

            {/* Price label row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '24px', display: 'flex' }}>
                <CheckBox checked={hasPriceLabel} onChange={v => {
                  setHasPriceLabel(v);
                  updateMultipleDrawings(ids, { showPriceLabel: v });
                }} />
              </div>
              <span style={{ fontSize: '14px', color: 'var(--tv-sub-text)', marginLeft: '8px' }}>Price label</span>
            </div>

            {/* Background row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '24px', display: 'flex' }}>
                <CheckBox checked={hasBackground} onChange={v => {
                  setHasBackground(v);
                  if (!v) updateMultipleDrawings(ids, { fill: undefined });
                  else updateMultipleDrawings(ids, { fill: backgroundColor });
                }} />
              </div>
              <span style={{ fontSize: '14px', color: 'var(--tv-sub-text)', marginLeft: '8px', width: '88px' }}>Background</span>
              <div style={{ position: 'relative', width: '32px', height: '32px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', padding: '4px', opacity: hasBackground ? 1 : 0.5, pointerEvents: hasBackground ? 'auto' : 'none' }}>
                {/* Checkered background pattern to indicate opacity */}
                <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--tv-sub-bg)', backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)', backgroundSize: '8px 8px', backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px', borderRadius: '2px' }}>
                  <div style={{ width: '100%', height: '100%', backgroundColor: backgroundColor }} />
                </div>
                <PaletteInput value={backgroundColor} onChange={e => {
                  setBackgroundColor(e.target.value);
                  updateMultipleDrawings(ids, { fill: e.target.value });
                }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
              </div>
            </div>

            {/* Text row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '120px', fontSize: '14px', color: 'var(--tv-sub-text)' }}>Text</div>
              <div style={{ position: 'relative', width: '32px', height: '32px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', padding: '4px' }}>
                <div style={{ width: '100%', height: '100%', backgroundColor: textColor, borderRadius: '2px' }} />
                <PaletteInput value={textColor} onChange={e => {
                  setTextColor(e.target.value);
                  updateMultipleDrawings(ids, { textColor: e.target.value });
                }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
              </div>
            </div>

          </div>
        )}

        {activeTab === 'Displacement' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', width: '160px' }}>Displacement (price, bar)</span>
              <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                <LocalNumberInput value={displacementPrice} onChange={setDisplacementPrice} placeholder="e.g. /2" style={{ width: '100%', flex: 1 }} />
                <LocalNumberInput value={displacementBar} onChange={setDisplacementBar} placeholder="e.g. +1" style={{ width: '100%', flex: 1 }} />
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#787b86', lineHeight: '1.5', paddingLeft: '160px' }}>
              Use special math signs to displace selected drawings: +,-,/,* for price and +,- for bar index.
            </div>
          </div>
        )}

        {activeTab === 'Visibility' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <CheckBox checked={!!visibility.ticks?.enabled} onChange={(v) => updateVisibility('ticks', { enabled: v })} />
              <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', marginLeft: '8px' }}>Ticks</span>
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
                  <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', marginLeft: '8px' }}>{row.label}</span>
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
              <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', marginLeft: '8px' }}>Ranges</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--tv-sub-border)' }}>
        <div style={{ height: '34px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '6px', fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}>
          Template <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={cancelEdit} style={{ padding: '0 16px', height: '34px', background: 'var(--tv-sub-bg)', border: '1px solid #131722', borderRadius: '4px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleOk} style={{ padding: '0 24px', height: '34px', background: '#2a2e39', border: 'none', borderRadius: '4px', color: 'var(--tv-sub-bg)', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Ok</button>
        </div>
      </div>
    </div>
  );
}
