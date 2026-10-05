'use client';
import React, { useState, useEffect } from 'react';
import { useDrawing, useSettingsSession } from '../core/DrawingContext';
import { DualRangeSlider } from './DualRangeSlider';
import { ColorPickerPopup } from './ColorPickerPopup';
import { useEscapeClose } from "../../../lib/useEscapeClose";

interface RectangleSettingsModalProps {
  onClose: () => void;
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
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => { setLocalVal(value); }, [localVal === value ? '' : value]); // Trigger update if prop changes but only if not currently typing
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
          border: isFocused ? '2px solid #2962ff' : '1px solid #e0e3eb', 
          borderRadius: '4px', padding: isFocused ? '0 7px' : '0 8px', 
          fontSize: '13px', color: '#131722', outline: 'none', 
          backgroundColor: '#ffffff',
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

export function RectangleSettingsModal({ onClose }: RectangleSettingsModalProps) {
  const cancelEdit = useSettingsSession(onClose);
  useEscapeClose(cancelEdit);
  const { selectedShapeId, drawings, updateDrawing } = useDrawing();
  const selectedShape = drawings.find((d: any) => d.id === selectedShapeId);

  const [position, setPosition]     = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]   = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab]   = useState('Style');

  const [showFontDrop, setShowFontDrop] = useState(false);
  const [showBorderPicker, setShowBorderPicker] = useState(false);
  const [showMiddleLinePicker, setShowMiddleLinePicker] = useState(false);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);

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
        position: 'fixed', left: position.x, top: position.y, width: '380px',
        backgroundColor: '#ffffff', borderRadius: '8px',
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
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#131722' }}>Rectangle</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </div>
        <button onClick={cancelEdit}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#131722', padding: '4px', borderRadius: '4px' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f3fa')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e3eb', padding: '0 20px' }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 0', marginRight: '20px', fontSize: '14px', fontWeight: 500,
              color: activeTab === tab ? '#131722' : '#787b86',
              background: 'transparent', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #131722' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >{tab}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '180px' }}>
        
        {/* STYLE */}
        {activeTab === 'Style' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Extend */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100px', fontSize: '13px', color: '#131722' }}>Extend</div>
              <select 
                value={selectedShape?.extendLeft && selectedShape?.extendRight ? 'Both' : selectedShape?.extendRight ? 'Right' : selectedShape?.extendLeft ? 'Left' : 'None'}
                onChange={(e) => {
                  const val = e.target.value;
                  updateDrawing(selectedShape.id, { 
                    extendLeft: val === 'Left' || val === 'Both', 
                    extendRight: val === 'Right' || val === 'Both' 
                  });
                }}
                style={{ height: '34px', flex: 1, border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 10px', fontSize: '13px', color: '#131722', outline: 'none', appearance: 'none', background: '#fff url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23787b86%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C/polyline%3E%3C/svg%3E") no-repeat right 10px center' }}
              >
                <option value="None">Don't extend</option>
                <option value="Right">Extend Right</option>
                <option value="Left">Extend Left</option>
                <option value="Both">Extend Both</option>
              </select>
            </div>

            {/* Border */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100px', fontSize: '13px', color: '#131722' }}>Border</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative' }}>
                  <div 
                    onClick={() => setShowBorderPicker(!showBorderPicker)}
                    style={{ position: 'relative', width: '64px', height: '34px', borderRadius: '4px', border: '1px solid #e0e3eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}
                  >
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px', opacity: 0.2 }} />
                    <div style={{ width: '24px', height: '24px', backgroundColor: selectedShape?.stroke || '#9b59b6', borderRadius: '2px', position: 'relative', zIndex: 1 }} />
                  </div>
                  {showBorderPicker && (
                    <ColorPickerPopup
                      colorStr={selectedShape?.stroke || '#9b59b6'}
                      onChange={(color) => updateProp('stroke', color)}
                      thickness={selectedShape?.strokeWidth || 2}
                      onThicknessChange={(w) => updateProp('strokeWidth', w)}
                      lineStyle={selectedShape?.lineStyle || 'Solid'}
                      onLineStyleChange={(s) => updateProp('lineStyle', s)}
                      onClose={() => setShowBorderPicker(false)}
                      style={{ top: '100%', left: 0, marginTop: '8px' }}
                    />
                  )}
                </div>
                <div style={{ width: '64px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="2" viewBox="0 0 24 2" fill="none" stroke={selectedShape?.stroke || '#9b59b6'} strokeWidth="2">
                    <line x1="0" y1="1" x2="24" y2="1" strokeDasharray={selectedShape?.lineStyle === 'Dashed' ? '4,4' : selectedShape?.lineStyle === 'Dotted' ? '1,3' : ''} />
                  </svg>
                </div>
              </div>
            </div>

            {/* Middle Line */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100px' }}>
                <CheckBox checked={!!selectedShape?.middleLineVisible} onChange={(v) => updateProp('middleLineVisible', v)} />
                <span style={{ fontSize: '13px', color: '#131722' }}>Middle line</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', opacity: selectedShape?.middleLineVisible ? 1 : 0.5, pointerEvents: selectedShape?.middleLineVisible ? 'auto' : 'none' }}>
                <div style={{ position: 'relative' }}>
                  <div 
                    onClick={() => setShowMiddleLinePicker(!showMiddleLinePicker)}
                    style={{ position: 'relative', width: '64px', height: '34px', borderRadius: '4px', border: '1px solid #e0e3eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}
                  >
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px', opacity: 0.2 }} />
                    <div style={{ width: '24px', height: '24px', backgroundColor: selectedShape?.middleLineColor || '#9b59b6', borderRadius: '2px', position: 'relative', zIndex: 1 }} />
                  </div>
                  {showMiddleLinePicker && (
                    <ColorPickerPopup
                      colorStr={selectedShape?.middleLineColor || '#9b59b6'}
                      onChange={(color) => updateProp('middleLineColor', color)}
                      onClose={() => setShowMiddleLinePicker(false)}
                      style={{ top: '100%', left: 0, marginTop: '8px' }}
                    />
                  )}
                </div>
                <div style={{ width: '64px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="2" viewBox="0 0 24 2" fill="none" stroke={selectedShape?.middleLineColor || '#9b59b6'} strokeWidth="1">
                    <line x1="0" y1="1" x2="24" y2="1" strokeDasharray="4,4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Background */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100px' }}>
                <CheckBox checked={selectedShape?.backgroundVisible !== false} onChange={(v) => updateProp('backgroundVisible', v)} />
                <span style={{ fontSize: '13px', color: '#131722' }}>Background</span>
              </div>
              <div style={{ position: 'relative' }}>
                <div 
                  onClick={() => setShowBackgroundPicker(!showBackgroundPicker)}
                  style={{ position: 'relative', width: '64px', height: '34px', borderRadius: '4px', border: '1px solid #e0e3eb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer', opacity: selectedShape?.backgroundVisible !== false ? 1 : 0.5, pointerEvents: selectedShape?.backgroundVisible !== false ? 'auto' : 'none' }}
                >
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px', opacity: 0.2 }} />
                  <div style={{ width: '24px', height: '24px', backgroundColor: selectedShape?.fill || '#9b59b633', borderRadius: '2px', position: 'relative', zIndex: 1 }} />
                </div>
                {showBackgroundPicker && (
                  <ColorPickerPopup
                    colorStr={selectedShape?.fill || '#9b59b633'}
                    onChange={(color) => updateProp('fill', color)}
                    onClose={() => setShowBackgroundPicker(false)}
                    style={{ top: '100%', left: 0, marginTop: '8px' }}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* TEXT */}
        {activeTab === 'Text' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '34px', height: '34px', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer', border: '1px solid #e0e3eb' }}>
                <div style={{ width: '100%', height: '100%', backgroundColor: selectedShape?.textColor || '#9b59b6' }} />
                <input type="color" value={selectedShape?.textColor || '#9b59b6'} onChange={e => updateProp('textColor', e.target.value)}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
              </div>

              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowFontDrop(!showFontDrop)} style={{ height: '34px', minWidth: '72px', border: '1px solid #e0e3eb', borderRadius: '4px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', fontSize: '13px', color: '#131722', cursor: 'pointer' }}>
                  {selectedShape?.fontSize || '14'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {showFontDrop && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: '#ffffff', border: '1px solid #e0e3eb', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 200, padding: '4px 0', maxHeight: '160px', overflowY: 'auto' }}>
                    {FONT_SIZES.map(s => (
                      <button key={s} onClick={() => { updateProp('fontSize', parseInt(s)); setShowFontDrop(false); }} style={{ width: '100%', padding: '6px 14px', textAlign: 'left', background: (selectedShape?.fontSize === parseInt(s)) ? '#f0f3fa' : 'transparent', border: 'none', fontSize: '13px', color: '#131722', cursor: 'pointer' }}>{s}</button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={() => updateProp('bold', !selectedShape?.bold)} style={{ width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', background: selectedShape?.bold ? '#e0e3eb' : '#ffffff', fontWeight: 700, fontSize: '15px', color: '#131722', cursor: 'pointer' }}>B</button>
              <button onClick={() => updateProp('italic', !selectedShape?.italic)} style={{ width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', background: selectedShape?.italic ? '#e0e3eb' : '#ffffff', fontStyle: 'italic', fontFamily: 'serif', fontSize: '15px', color: '#131722', cursor: 'pointer' }}>I</button>
            </div>

            <textarea value={selectedShape?.text || ''} onChange={e => updateProp('text', e.target.value)} placeholder="Add text" style={{ width: '100%', height: '80px', border: '1px solid #2962ff', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', resize: 'none', outline: 'none', color: '#131722', boxSizing: 'border-box' }} />
          </div>
        )}

        {/* COORDINATES */}
        {activeTab === 'Coordinates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {selectedShape?.points?.map((p: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '110px', fontSize: '13px', color: '#131722' }}>
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

        {/* VISIBILITY */}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #e0e3eb' }}>
        <div style={{ height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '6px', fontSize: '13px', color: '#131722', cursor: 'pointer' }}>
          Template <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={cancelEdit} style={{ padding: '0 16px', height: '34px', background: '#fff', border: '1px solid #131722', borderRadius: '4px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', color: '#131722' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0 24px', height: '34px', background: '#131722', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Ok</button>
        </div>
      </div>
    </div>
  );
}
