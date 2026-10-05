'use client';
import React, { useState, useEffect } from 'react';
import { useDrawing, useSettingsSession } from '../core/DrawingContext';
import { DualRangeSlider } from './DualRangeSlider';
import { ColorPickerPopup } from './ColorPickerPopup';
import { useEscapeClose } from "../../../lib/useEscapeClose";

interface ArrowMarkerSettingsModalProps {
  onClose: () => void;
}

function CheckBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '18px', height: '18px', borderRadius: '3px',
        border: checked ? 'none' : '1px solid var(--tv-sub-muted)',
        backgroundColor: checked ? 'var(--tv-sub-text)' : 'var(--tv-sub-bg)',
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

function LocalNumberInput({ value, onChange, style }: { value: string; onChange?: (val: string) => void; style?: React.CSSProperties }) {
  const [localVal, setLocalVal] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => { setLocalVal(value); }, [value]);
  const handleBlur = () => { setIsFocused(false); if (onChange && localVal !== value) onChange(localVal); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input 
        type="text" 
        value={localVal} 
        onChange={(e) => setLocalVal(e.target.value)} 
        onBlur={handleBlur} 
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
        style={{ 
          width: '60px', height: '34px', 
          border: isFocused ? '2px solid #2962ff' : '1px solid var(--tv-sub-border)', 
          borderRadius: '4px', padding: isFocused ? '0 7px' : '0 8px', 
          fontSize: '13px', color: 'var(--tv-sub-text)', outline: 'none', 
          backgroundColor: 'var(--tv-sub-bg)',
          ...style 
        }}
      />
      {isFocused && (
        <div style={{ position: 'absolute', right: '4px', display: 'flex', flexDirection: 'column', gap: '2px', pointerEvents: 'none' }}>
          <svg width="8" height="6" viewBox="0 0 10 6" fill="none" stroke="#787b86" strokeWidth="1.2"><path d="M1 5L5 1L9 5"/></svg>
          <svg width="8" height="6" viewBox="0 0 10 6" fill="none" stroke="#787b86" strokeWidth="1.2"><path d="M1 1L5 5L9 1"/></svg>
        </div>
      )}
    </div>
  );
}

const FONT_SIZES = ['8','9','10','11','12','14','16','18','20','24','28','32','36','48','60','72'];
const THICKNESS_OPTIONS = ['1px', '2px', '3px', '4px'];

export function ArrowMarkerSettingsModal({ onClose }: ArrowMarkerSettingsModalProps) {
  const cancelEdit = useSettingsSession(onClose);
  useEscapeClose(cancelEdit);
  const { selectedShapeId, drawings, updateDrawing } = useDrawing();
  const selectedShape = drawings.find((d: any) => d.id === selectedShapeId);

  const [position, setPosition]     = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]   = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab]   = useState('Style');

  const [showFontDrop, setShowFontDrop] = useState(false);
  const [showThicknessDrop, setShowThicknessDrop] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);

  const [visibility, setVisibility] = useState(selectedShape?.visibility || {
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

  const handlePointChange = (index: number, field: 'price' | 'logical', value: string) => {
    if (!selectedShape || !selectedShape.points) return;
    const newPoints = [...selectedShape.points];
    const numValue = field === 'price' ? parseFloat(value) : parseInt(value);
    if (isNaN(numValue)) return;
    newPoints[index] = { ...newPoints[index], [field]: numValue };
    updateProp('points', newPoints);
  };

  useEffect(() => {
    if (selectedShape?.visibility) setVisibility(selectedShape.visibility);
  }, [selectedShape]);

  useEffect(() => {
    if (typeof window !== 'undefined')
      setPosition({ x: window.innerWidth / 2 - 185, y: window.innerHeight / 2 - 260 });
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

  const tabs = ['Style', 'Text', 'Coordinates', 'Visibility'];

  return (
    <div
      style={{
        position: 'fixed', left: position.x, top: position.y, width: '370px',
        backgroundColor: 'var(--tv-sub-bg)', borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.07)',
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
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tv-sub-text)' }}>Arrow marker</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tv-sub-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </div>
        <button onClick={cancelEdit}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', color: 'var(--tv-sub-text)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--tv-sub-border)', padding: '0 20px' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 0', marginRight: '20px', fontSize: '14px', fontWeight: 500,
              color: activeTab === tab ? 'var(--tv-sub-text)' : '#787b86',
              background: 'transparent', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #131722' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >{tab}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '140px' }}>

        {/* ── STYLE ── */}
        {activeTab === 'Style' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '80px', fontSize: '13px', color: 'var(--tv-sub-text)' }}>Color</div>
              <div style={{ position: 'relative' }}>
                <div 
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  style={{ width: '34px', height: '34px', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--tv-sub-border)', position: 'relative' }}
                >
                  <div style={{ width: '100%', height: '100%', backgroundColor: selectedShape?.stroke || '#2962ff' }} />
                </div>
                {showColorPicker && (
                  <ColorPickerPopup
                    colorStr={selectedShape?.stroke || '#2962ff'}
                    onChange={(color) => updateProp('stroke', color)}
                    onClose={() => setShowColorPicker(false)}
                    style={{ top: '100%', left: 0, marginTop: '8px' }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '80px', fontSize: '13px', color: 'var(--tv-sub-text)' }}>Thickness</div>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowThicknessDrop(!showThicknessDrop)}
                  style={{ height: '34px', minWidth: '72px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', background: 'var(--tv-sub-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', gap: '6px', fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
                >
                  {selectedShape?.strokeWidth ? `${selectedShape.strokeWidth}px` : '2px'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {showThicknessDrop && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 200, padding: '4px 0' }}>
                    {THICKNESS_OPTIONS.map(s => (
                      <button key={s} onClick={() => { updateProp('strokeWidth', parseInt(s)); setShowThicknessDrop(false); }}
                        style={{ width: '100%', padding: '6px 14px', textAlign: 'left', background: (selectedShape?.strokeWidth === parseInt(s)) ? 'var(--tv-sub-hover)' : 'transparent', border: 'none', fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = (selectedShape?.strokeWidth === parseInt(s)) ? 'var(--tv-sub-hover)' : 'transparent')}
                      >{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TEXT ── */}
        {activeTab === 'Text' && (
          <>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <div 
                  onClick={() => setShowTextColorPicker(!showTextColorPicker)}
                  style={{ width: '34px', height: '34px', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--tv-sub-border)', position: 'relative' }}
                >
                  <div style={{ width: '100%', height: '100%', backgroundColor: selectedShape?.textColor || '#2962ff' }} />
                </div>
                {showTextColorPicker && (
                  <ColorPickerPopup
                    colorStr={selectedShape?.textColor || '#2962ff'}
                    onChange={(color) => updateProp('textColor', color)}
                    onClose={() => setShowTextColorPicker(false)}
                    style={{ top: '100%', left: 0, marginTop: '8px' }}
                  />
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowFontDrop(!showFontDrop)}
                  style={{ height: '34px', minWidth: '72px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', background: 'var(--tv-sub-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', gap: '6px', fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
                >
                  {selectedShape?.fontSize || '16'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {showFontDrop && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 200, padding: '4px 0', maxHeight: '200px', overflowY: 'auto' }}>
                    {FONT_SIZES.map(s => (
                      <button key={s} onClick={() => { updateProp('fontSize', parseInt(s)); setShowFontDrop(false); }}
                        style={{ width: '100%', padding: '6px 14px', textAlign: 'left', background: (selectedShape?.fontSize === parseInt(s)) ? 'var(--tv-sub-hover)' : 'transparent', border: 'none', fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = (selectedShape?.fontSize === parseInt(s)) ? 'var(--tv-sub-hover)' : 'transparent')}
                      >{s}</button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={() => updateProp('bold', !selectedShape?.bold)}
                style={{ width: '34px', height: '34px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', background: selectedShape?.bold ? '#e0e3eb' : 'var(--tv-sub-bg)', fontWeight: 700, fontSize: '15px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
              >B</button>

              <button onClick={() => updateProp('italic', !selectedShape?.italic)}
                style={{ width: '34px', height: '34px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', background: selectedShape?.italic ? '#e0e3eb' : 'var(--tv-sub-bg)', fontStyle: 'italic', fontFamily: 'serif', fontSize: '15px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
              >I</button>
            </div>

            <textarea
              value={selectedShape?.text || ''}
              onChange={e => updateProp('text', e.target.value)}
              placeholder="Add text"
              style={{
                width: '100%', height: '90px', border: '1px solid #2962ff', borderRadius: '6px',
                padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', resize: 'none',
                outline: 'none', color: 'var(--tv-sub-text)', boxSizing: 'border-box',
              }}
            />
          </>
        )}

        {/* ── COORDINATES ── */}
        {activeTab === 'Coordinates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {selectedShape?.points?.map((p: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '110px', fontSize: '13px', color: 'var(--tv-sub-text)' }}>
                  #{idx + 1} (price, bar)
                </div>
                <LocalNumberInput 
                  value={p.price.toFixed(3)} 
                  onChange={(val) => handlePointChange(idx, 'price', val)}
                  style={{ width: '110px' }}
                />
                <LocalNumberInput 
                  value={p.logical.toString()} 
                  onChange={(val) => handlePointChange(idx, 'logical', val)}
                  style={{ width: '80px' }}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── VISIBILITY ── */}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--tv-sub-border)' }}>
        <div style={{ height: '34px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '6px', fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}>
          Template
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={cancelEdit}
            style={{ padding: '0 16px', height: '34px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid #131722', borderRadius: '4px', color: 'var(--tv-sub-text)', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
          >Cancel</button>
          <button onClick={onClose}
            style={{ padding: '0 24px', height: '34px', backgroundColor: '#131722', border: 'none', borderRadius: '4px', color: '#ffffff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
          >Ok</button>
        </div>
      </div>
    </div>
  );
}
