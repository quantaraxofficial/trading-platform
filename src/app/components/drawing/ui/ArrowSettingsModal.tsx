'use client';
import React, { useState, useEffect } from 'react';
import { useDrawing, useSettingsSession } from '../core/DrawingContext';
import { DualRangeSlider } from './DualRangeSlider';
import { ColorPickerPopup } from './ColorPickerPopup';
import { useEscapeClose } from "../../../lib/useEscapeClose";

interface ArrowSettingsModalProps {
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
  useEffect(() => { setLocalVal(value); }, [value]);
  const handleBlur = () => { if (onChange && localVal !== value) onChange(localVal); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <input type="text" value={localVal} onChange={(e) => setLocalVal(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown}
      style={{ width: '60px', height: '32px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: 'var(--tv-sub-text)', outline: 'none', ...style }}
    />
  );
}

function Select({ options, value, onChange, style }: { options: string[]; value: string; onChange?: (val: string) => void; style?: React.CSSProperties }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div style={{ position: 'relative', width: '100%', ...style }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', height: '34px', border: isOpen ? '2px solid #2962ff' : '1px solid var(--tv-sub-border)', 
          borderRadius: '4px', background: 'var(--tv-sub-bg)', display: 'flex', alignItems: 'center', 
          justifyContent: 'space-between', padding: isOpen ? '0 9px' : '0 10px', 
          fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer', outline: 'none', textAlign: 'left'
        }}
      >
        {value}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="var(--tv-sub-text)" strokeWidth="1.2" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          <path d="M1 1L5 5L9 1"></path>
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setIsOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
            backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, padding: '4px 0',
            overflow: 'hidden'
          }}>
            {options.map(opt => (
              <div 
                key={opt}
                style={{ 
                  padding: '8px 12px', fontSize: '13px', cursor: 'pointer',
                  backgroundColor: value === opt ? '#2962ff' : 'transparent',
                  color: value === opt ? '#ffffff' : 'var(--tv-sub-text)'
                }}
                onClick={() => { onChange && onChange(opt); setIsOpen(false); }}
                onMouseEnter={e => { if (value !== opt) e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'; }}
                onMouseLeave={e => { if (value !== opt) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {opt}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExtendDropdown({ 
  extendLeft, 
  extendRight, 
  onChangeLeft, 
  onChangeRight 
}: { 
  extendLeft: boolean; 
  extendRight: boolean; 
  onChangeLeft: (v: boolean) => void; 
  onChangeRight: (v: boolean) => void; 
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  const getLabel = () => {
    if (extendLeft && extendRight) return 'Both';
    if (extendLeft) return 'Left';
    if (extendRight) return 'Right';
    return "Don't extend";
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', height: '34px', border: isOpen ? '2px solid #2962ff' : '1px solid var(--tv-sub-border)', 
          borderRadius: '4px', background: 'var(--tv-sub-bg)', display: 'flex', alignItems: 'center', 
          justifyContent: 'space-between', padding: isOpen ? '0 9px' : '0 10px', 
          fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer', outline: 'none'
        }}
      >
        {getLabel()}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="var(--tv-sub-text)" strokeWidth="1.2" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          <path d="M1 1L5 5L9 1"></path>
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setIsOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
            backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, padding: '4px 0'
          }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onChangeLeft(!extendLeft); }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <CheckBox checked={extendLeft} onChange={onChangeLeft} />
              <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', marginLeft: '10px' }}>Extend left line</span>
            </div>
            <div 
              style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onChangeRight(!extendRight); }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <CheckBox checked={extendRight} onChange={onChangeRight} />
              <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', marginLeft: '10px' }}>Extend right line</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatsDropdown({ 
  statsOptions, 
  onChange 
}: { 
  statsOptions: any; 
  onChange: (key: string, v: boolean) => void; 
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  const options = [
    { key: 'priceRange', label: 'Price range' },
    { key: 'percentChange', label: 'Percent change' },
    { key: 'changeInPips', label: 'Change in pips' },
    { key: 'barsRange', label: 'Bars range' },
    { key: 'dateTimeRange', label: 'Date/time range' },
    { key: 'distance', label: 'Distance' },
    { key: 'angle', label: 'Angle' },
  ];

  const getLabel = () => {
    const active = options.filter(opt => statsOptions?.[opt.key]);
    if (active.length === 0) return 'Hidden';
    if (active.length === 1) return active[0].label;
    return `${active.length} items`;
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', height: '34px', border: isOpen ? '2px solid #2962ff' : '1px solid var(--tv-sub-border)', 
          borderRadius: '4px', background: 'var(--tv-sub-bg)', display: 'flex', alignItems: 'center', 
          justifyContent: 'space-between', padding: isOpen ? '0 9px' : '0 10px', 
          fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer', outline: 'none'
        }}
      >
        {getLabel()}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="var(--tv-sub-text)" strokeWidth="1.2" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          <path d="M1 1L5 5L9 1"></path>
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setIsOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
            backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, padding: '4px 0'
          }}>
            {options.map(opt => (
              <div 
                key={opt.key}
                style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); onChange(opt.key, !statsOptions?.[opt.key]); }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <CheckBox checked={!!statsOptions?.[opt.key]} onChange={(v) => onChange(opt.key, v)} />
                <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', marginLeft: '10px' }}>{opt.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const FONT_SIZES = ['8','9','10','11','12','14','16','18','20','24','28','32','36','48','60','72'];
const LINE_STYLES = ['Solid', 'Dashed', 'Dotted'];
const THICKNESS_OPTIONS = ['1px', '2px', '3px', '4px'];

export function ArrowSettingsModal({ onClose }: ArrowSettingsModalProps) {
  const cancelEdit = useSettingsSession(onClose);
  useEscapeClose(cancelEdit);
  const { selectedShapeId, drawings, updateDrawing } = useDrawing();
  const selectedShape = drawings.find((d: any) => d.id === selectedShapeId);

  const [position, setPosition]     = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart]   = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab]   = useState('Style');

  // Style dropdowns
  const [showFontDrop, setShowFontDrop] = useState(false);
  const [showThicknessDrop, setShowThicknessDrop] = useState(false);
  const [showStyleDrop, setShowStyleDrop] = useState(false);
  const [showStartCapDrop, setShowStartCapDrop] = useState(false);
  const [showEndCapDrop, setShowEndCapDrop] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);

  // Visibility state
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
      setPosition({ x: window.innerWidth / 2 - 185, y: window.innerHeight / 2 - 200 });
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
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tv-sub-text)' }}>Arrow</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tv-sub-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </div>
        <button onClick={cancelEdit}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tv-sub-text)', padding: '4px', borderRadius: '4px' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--tv-sub-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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
        {activeTab === 'Style' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Line Row */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '80px', fontSize: '13px', color: 'var(--tv-sub-text)' }}>Line</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Color + Thickness */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', height: '34px', padding: '0 8px', gap: '8px', cursor: 'pointer' }} onClick={() => setShowColorPicker(!showColorPicker)}>
                  <div style={{ width: '18px', height: '18px', backgroundColor: selectedShape?.stroke || '#2962ff', borderRadius: '2px' }} />
                  <div style={{ width: '30px', height: '1px', backgroundColor: selectedShape?.stroke || '#2962ff' }} />
                  {showColorPicker && (
                    <ColorPickerPopup
                      colorStr={selectedShape?.stroke || '#2962ff'}
                      onChange={(color) => updateProp('stroke', color)}
                      onClose={() => setShowColorPicker(false)}
                      style={{ top: '100%', left: 0, marginTop: '8px' }}
                    />
                  )}
                </div>

                {/* Line Style */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowStyleDrop(!showStyleDrop)} style={{ width: '34px', height: '34px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', background: 'var(--tv-sub-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="12" x2="20" y2="12" strokeDasharray={selectedShape?.lineStyle === 'Dashed' ? '4,4' : selectedShape?.lineStyle === 'Dotted' ? '1,2' : 'none'} /></svg>
                  </button>
                  {showStyleDrop && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 100 }}>
                      {LINE_STYLES.map(opt => (
                        <div key={opt} onClick={() => { updateProp('lineStyle', opt); setShowStyleDrop(false); }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: selectedShape?.lineStyle === opt ? 'var(--tv-sub-hover)' : 'var(--tv-sub-bg)' }}>{opt}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Start Cap */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowStartCapDrop(!showStartCapDrop)} style={{ width: '34px', height: '34px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', background: 'var(--tv-sub-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="10" y1="12" x2="20" y2="12" />
                      {selectedShape?.startCap === 'Circle' ? <circle cx="6" cy="12" r="3" /> : selectedShape?.startCap === 'Arrow' ? <path d="M10 7l-5 5 5 5" /> : null}
                    </svg>
                  </button>
                  {showStartCapDrop && (
                     <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 100 }}>
                       {['None', 'Arrow', 'Circle'].map(opt => (
                         <div key={opt} onClick={() => { updateProp('startCap', opt); setShowStartCapDrop(false); }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: selectedShape?.startCap === opt ? 'var(--tv-sub-hover)' : 'var(--tv-sub-bg)' }}>{opt}</div>
                       ))}
                     </div>
                  )}
                </div>

                {/* End Cap */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowEndCapDrop(!showEndCapDrop)} style={{ width: '34px', height: '34px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', background: 'var(--tv-sub-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="4" y1="12" x2="14" y2="12" />
                      {selectedShape?.endCap === 'Circle' ? <circle cx="18" cy="12" r="3" /> : (selectedShape?.endCap !== 'None') ? <path d="M14 7l5 5-5 5" /> : null}
                    </svg>
                  </button>
                  {showEndCapDrop && (
                     <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 100 }}>
                       {['None', 'Arrow', 'Circle'].map(opt => (
                         <div key={opt} onClick={() => { updateProp('endCap', opt); setShowEndCapDrop(false); }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: selectedShape?.endCap === opt ? 'var(--tv-sub-hover)' : 'var(--tv-sub-bg)' }}>{opt}</div>
                       ))}
                     </div>
                  )}
                </div>
              </div>
            </div>

            {/* Extend Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '80px', fontSize: '13px', color: 'var(--tv-sub-text)' }}>Extend</div>
              <ExtendDropdown 
                extendLeft={!!selectedShape?.extendLeft}
                extendRight={!!selectedShape?.extendRight}
                onChangeLeft={(v) => updateProp('extendLeft', v)}
                onChangeRight={(v) => updateProp('extendRight', v)}
              />
            </div>

            {/* Checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => updateProp('middlePoint', !selectedShape?.middlePoint)}>
                <CheckBox checked={!!selectedShape?.middlePoint} onChange={v => updateProp('middlePoint', v)} />
                <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', marginLeft: '10px' }}>Middle point</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => updateProp('priceLabels', !selectedShape?.priceLabels)}>
                <CheckBox checked={!!selectedShape?.priceLabels} onChange={v => updateProp('priceLabels', v)} />
                <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', marginLeft: '10px' }}>Price labels</span>
              </div>
            </div>

            {/* INFO Section */}
            <div style={{ marginTop: '10px', borderTop: '1px solid #f0f3fa', paddingTop: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#787b86', marginBottom: '12px', textTransform: 'uppercase' }}>Info</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '80px', fontSize: '13px', color: 'var(--tv-sub-text)' }}>Stats</div>
                  <StatsDropdown 
                    statsOptions={selectedShape?.statsOptions || {}}
                    onChange={(key, v) => {
                      const current = selectedShape?.statsOptions || {};
                      updateProp('statsOptions', { ...current, [key]: v });
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '80px', fontSize: '13px', color: 'var(--tv-sub-text)' }}>Stats position</div>
                  <Select options={['Right', 'Left', 'Top', 'Bottom']} value={selectedShape?.statsPosition || 'Right'} onChange={v => updateProp('statsPosition', v)} style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginTop: '4px' }} onClick={() => updateProp('alwaysShowStats', !selectedShape?.alwaysShowStats)}>
                  <CheckBox checked={!!selectedShape?.alwaysShowStats} onChange={v => updateProp('alwaysShowStats', v)} />
                  <span style={{ fontSize: '13px', color: 'var(--tv-sub-text)', marginLeft: '10px' }}>Always show stats</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TEXT ── */}
        {activeTab === 'Text' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <div 
                  onClick={() => setShowTextColorPicker(!showTextColorPicker)}
                  style={{ width: '34px', height: '34px', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--tv-sub-border)', position: 'relative' }}
                >
                  <div style={{ width: '100%', height: '100%', backgroundColor: selectedShape?.textColor || '#131722' }} />
                </div>
                {showTextColorPicker && (
                  <ColorPickerPopup
                    colorStr={selectedShape?.textColor || '#131722'}
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
                >
                  {selectedShape?.fontSize || '14'}
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="var(--tv-sub-text)" strokeWidth="1.2"><path d="M1 1L5 5L9 1"></path></svg>
                </button>
                {showFontDrop && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: 'var(--tv-sub-bg)', border: '1px solid var(--tv-sub-border)', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 200, padding: '4px 0', maxHeight: '200px', overflowY: 'auto' }}>
                    {FONT_SIZES.map(s => (
                      <button key={s} onClick={() => { updateProp('fontSize', parseInt(s)); setShowFontDrop(false); }}
                        style={{ width: '100%', padding: '6px 14px', textAlign: 'left', background: (selectedShape?.fontSize === parseInt(s)) ? 'var(--tv-sub-hover)' : 'transparent', border: 'none', fontSize: '13px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
                      >{s}</button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={() => updateProp('bold', !selectedShape?.bold)}
                style={{ width: '34px', height: '34px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', background: selectedShape?.bold ? 'var(--tv-sub-hover)' : 'var(--tv-sub-bg)', fontWeight: 700, fontSize: '14px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
              >B</button>

              <button onClick={() => updateProp('italic', !selectedShape?.italic)}
                style={{ width: '34px', height: '34px', border: '1px solid var(--tv-sub-border)', borderRadius: '4px', background: selectedShape?.italic ? 'var(--tv-sub-hover)' : 'var(--tv-sub-bg)', fontStyle: 'italic', fontSize: '14px', color: 'var(--tv-sub-text)', cursor: 'pointer' }}
              >I</button>
            </div>

            <textarea
              value={selectedShape?.text || ''}
              onChange={e => updateProp('text', e.target.value)}
              placeholder="Text"
              style={{
                width: '100%', height: '80px', border: '1px solid var(--tv-sub-border)', borderRadius: '6px',
                padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', resize: 'none',
                outline: 'none', color: 'var(--tv-sub-text)', boxSizing: 'border-box',
              }}
            />
          </div>
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
                  value={p.price.toFixed(5)} 
                  onChange={(v) => {
                    const newPoints = [...selectedShape.points];
                    newPoints[idx] = { ...newPoints[idx], price: parseFloat(v) || p.price };
                    updateProp('points', newPoints);
                  }}
                  style={{ flex: 1 }}
                />
                <LocalNumberInput 
                  value={p.logical.toString()} 
                  onChange={(v) => {
                    const newPoints = [...selectedShape.points];
                    newPoints[idx] = { ...newPoints[idx], logical: parseInt(v) || p.logical };
                    updateProp('points', newPoints);
                  }}
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={cancelEdit} style={{ padding: '0 16px', height: '34px', background: 'var(--tv-sub-bg)', border: '1px solid #131722', borderRadius: '4px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0 24px', height: '34px', background: 'var(--tv-sub-text)', border: 'none', borderRadius: '4px', color: 'var(--tv-sub-bg)', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Ok</button>
        </div>
      </div>
    </div>
  );
}
