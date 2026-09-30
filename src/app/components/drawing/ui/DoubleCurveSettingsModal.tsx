'use client';
import React, { useState, useEffect } from 'react';
import { useDrawing } from '../core/DrawingContext';
import { DualRangeSlider } from './DualRangeSlider';
import { useEscapeClose } from "../../../lib/useEscapeClose";

interface DoubleCurveSettingsModalProps {
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
  useEffect(() => { setLocalVal(value); }, [value]);
  const handleBlur = () => { if (onChange && localVal !== value) onChange(localVal); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <input type="text" value={localVal} onChange={(e) => setLocalVal(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown}
      style={{ width: '60px', height: '32px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#131722', outline: 'none', ...style }}
    />
  );
}

export function DoubleCurveSettingsModal({ onClose }: DoubleCurveSettingsModalProps) {
  useEscapeClose(onClose);
  const { selectedShapeId, drawings, updateDrawing } = useDrawing();
  const selectedShape = drawings.find((d: any) => d.id === selectedShapeId);

  const [position, setPosition]     = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]   = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab]   = useState('Style');
  const [showStartStyleDropdown, setShowStartStyleDropdown] = useState(false);
  const [showEndStyleDropdown, setShowEndStyleDropdown] = useState(false);
  const [showExtendDropdown, setShowExtendDropdown] = useState(false);

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

  useEffect(() => {
    if (selectedShape?.visibility) setVisibility(selectedShape.visibility);
  }, [selectedShape]);

  useEffect(() => {
    if (typeof window !== 'undefined')
      setPosition({ x: window.innerWidth / 2 - 190, y: window.innerHeight / 2 - 250 });
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

  const tabs = ['Style', 'Coordinates', 'Visibility'];

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
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#131722' }}>Double curve</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </div>
        <button onClick={onClose}
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
              padding: '8px 0', marginRight: '20px', fontSize: '14px', fontWeight: 600,
              color: activeTab === tab ? '#131722' : '#787b86',
              background: 'transparent', border: 'none',
              borderBottom: activeTab === tab ? '3px solid #131722' : '3px solid transparent',
              cursor: 'pointer',
            }}
          >{tab}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '160px' }}>
        
        {/* STYLE */}
        {activeTab === 'Style' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Line Section */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '14px', color: '#131722' }}>Line</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '4px' }}>
                  <div style={{ width: '100%', height: '100%', backgroundColor: selectedShape.stroke || '#2962ff', borderRadius: '2px' }} />
                  <input type="color" value={selectedShape.stroke || '#2962ff'} onChange={e => updateProp('stroke', e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                </div>
                
                {/* Line Start Style */}
                <div style={{ position: 'relative' }}>
                  <button 
                    onClick={() => { setShowStartStyleDropdown(!showStartStyleDropdown); setShowEndStyleDropdown(false); setShowExtendDropdown(false); }}
                    style={{ width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      {selectedShape.lineStartStyle === 'Arrow' ? (
                        <path d="M19 12H5M5 12l4-4M5 12l4 4" />
                      ) : (
                        <><circle cx="6" cy="12" r="2" /><line x1="8" y1="12" x2="20" y2="12" /></>
                      )}
                    </svg>
                  </button>
                  {showStartStyleDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: '#fff', border: '1px solid #e0e3eb', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)', zIndex: 100, minWidth: '120px' }}>
                      <div 
                        onClick={() => { updateProp('lineStartStyle', 'None'); setShowStartStyleDropdown(false); }}
                        style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: selectedShape.lineStartStyle !== 'Arrow' ? '#f0f3fa' : 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedShape.lineStartStyle !== 'Arrow' ? '#f0f3fa' : 'transparent'}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="12" r="2" /><line x1="8" y1="12" x2="18" y2="12" /></svg>
                        Normal
                      </div>
                      <div 
                        onClick={() => { updateProp('lineStartStyle', 'Arrow'); setShowStartStyleDropdown(false); }}
                        style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: selectedShape.lineStartStyle === 'Arrow' ? '#f0f3fa' : 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedShape.lineStartStyle === 'Arrow' ? '#f0f3fa' : 'transparent'}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M5 12l4-4M5 12l4 4" /></svg>
                        Arrow
                      </div>
                    </div>
                  )}
                </div>

                {/* Line End Style */}
                <div style={{ position: 'relative' }}>
                  <button 
                    onClick={() => { setShowEndStyleDropdown(!showEndStyleDropdown); setShowStartStyleDropdown(false); setShowExtendDropdown(false); }}
                    style={{ width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      {selectedShape.lineEndStyle === 'Arrow' ? (
                        <path d="M5 12h14M19 12l-4-4M19 12l-4 4" />
                      ) : (
                        <><line x1="4" y1="12" x2="16" y2="12" /><circle cx="18" cy="12" r="2" /></>
                      )}
                    </svg>
                  </button>
                  {showEndStyleDropdown && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: '#fff', border: '1px solid #e0e3eb', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)', zIndex: 100, minWidth: '120px' }}>
                      <div 
                        onClick={() => { updateProp('lineEndStyle', 'None'); setShowEndStyleDropdown(false); }}
                        style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: selectedShape.lineEndStyle !== 'Arrow' ? '#f0f3fa' : 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedShape.lineEndStyle !== 'Arrow' ? '#f0f3fa' : 'transparent'}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="4" y1="12" x2="14" y2="12" /><circle cx="16" cy="12" r="2" /></svg>
                        Normal
                      </div>
                      <div 
                        onClick={() => { updateProp('lineEndStyle', 'Arrow'); setShowEndStyleDropdown(false); }}
                        style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: selectedShape.lineEndStyle === 'Arrow' ? '#f0f3fa' : 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedShape.lineEndStyle === 'Arrow' ? '#f0f3fa' : 'transparent'}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M19 12l-4-4M19 12l-4 4" /></svg>
                        Arrow
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Extend Section */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '14px', color: '#131722' }}>Extend</div>
              <div style={{ position: 'relative' }}>
                <button 
                  onClick={() => { setShowExtendDropdown(!showExtendDropdown); setShowStartStyleDropdown(false); setShowEndStyleDropdown(false); }}
                  style={{ width: '220px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', background: '#fff', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#131722', cursor: 'pointer' }}
                >
                  <span>{!selectedShape.extendLeft && !selectedShape.extendRight ? "Don't extend" : selectedShape.extendLeft && selectedShape.extendRight ? "Extended both" : selectedShape.extendLeft ? "Extend left" : "Extend right"}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                {showExtendDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', backgroundColor: '#fff', border: '1px solid #e0e3eb', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)', zIndex: 100, padding: '4px 0' }}>
                    <div 
                      onClick={() => updateProp('extendLeft', !selectedShape.extendLeft)}
                      style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <CheckBox checked={!!selectedShape.extendLeft} onChange={(v) => updateProp('extendLeft', v)} />
                      Extend left line
                    </div>
                    <div 
                      onClick={() => updateProp('extendRight', !selectedShape.extendRight)}
                      style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <CheckBox checked={!!selectedShape.extendRight} onChange={(v) => updateProp('extendRight', v)} />
                      Extend right line
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Background Section */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckBox checked={!!selectedShape.fillEnabled} onChange={(v) => updateProp('fillEnabled', v)} />
                <span style={{ fontSize: '14px', color: '#131722' }}>Background</span>
              </div>
              <div style={{ position: 'relative', width: '34px', height: '34px', borderRadius: '4px', border: '1px solid #e0e3eb', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: selectedShape.fillEnabled ? 1 : 0.5 }}>
                 <div style={{ 
                   width: '22px', height: '22px', borderRadius: '2px', 
                   backgroundColor: selectedShape.fill || 'transparent',
                   backgroundImage: selectedShape.fill === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)' : 'none',
                   backgroundSize: '4px 4px'
                 }} />
                 <input type="color" disabled={!selectedShape.fillEnabled} value={selectedShape.fill || '#2962ff'} onChange={e => updateProp('fill', e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: selectedShape.fillEnabled ? 'pointer' : 'default' }} />
              </div>
            </div>
          </div>
        )}

        {/* COORDINATES */}
        {activeTab === 'Coordinates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
            {selectedShape?.points.map((p: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: '#131722', width: '110px' }}>#{i + 1} (price, bar)</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <LocalNumberInput 
                    value={p.price.toString()} 
                    onChange={(v) => {
                      const newPoints = [...selectedShape.points];
                      newPoints[i] = { ...newPoints[i], price: parseFloat(v) || 0 };
                      updateProp('points', newPoints);
                    }}
                    style={{ width: '90px' }}
                  />
                  <LocalNumberInput 
                    value={Math.round(p.logical).toString()} 
                    onChange={(v) => {
                      const newPoints = [...selectedShape.points];
                      newPoints[i] = { ...newPoints[i], logical: parseInt(v) || 0 };
                      updateProp('points', newPoints);
                    }}
                    style={{ width: '90px' }}
                  />
                </div>
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
        <div style={{ height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '6px', fontSize: '14px', color: '#131722', cursor: 'pointer' }}>
          Template <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '0 16px', height: '34px', background: '#fff', border: '1px solid #131722', borderRadius: '4px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', color: '#131722' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0 24px', height: '34px', background: '#131722', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Ok</button>
        </div>
      </div>
    </div>
  );
}
