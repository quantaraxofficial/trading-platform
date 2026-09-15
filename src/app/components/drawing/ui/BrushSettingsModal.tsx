import React, { useState, useEffect } from 'react';
import { useDrawing } from '../core/DrawingContext';
import { DualRangeSlider } from './DualRangeSlider';

interface BrushSettingsModalProps {
  onClose: () => void;
  initialPosition?: { x: number, y: number };
}

// Reusable components matching TradingView style
function CheckBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '18px',
        height: '18px',
        borderRadius: '3px',
        border: checked ? 'none' : '1px solid #b2b5be',
        backgroundColor: checked ? '#131722' : '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      )}
    </div>
  );
}

function LocalNumberInput({ value, onChange, style }: { value: string; onChange?: (val: string) => void; style?: React.CSSProperties }) {
  const [localVal, setLocalVal] = useState(value);
  
  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleBlur = () => {
    if (onChange && localVal !== value) {
      onChange(localVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        width: '60px',
        height: '32px',
        border: '1px solid #e0e3eb',
        borderRadius: '4px',
        padding: '0 8px',
        fontSize: '13px',
        color: '#131722',
        outline: 'none',
        ...style
      }}
    />
  );
}

export function BrushSettingsModal({ onClose, initialPosition }: BrushSettingsModalProps) {
  const { selectedShapeId, drawings, updateDrawing } = useDrawing();
  const selectedShape = drawings.find((d: any) => d.id === selectedShapeId);

  // Draggable State
  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [activeTab, setActiveTab] = useState('Style');
  const [showStartArrowDropdown, setShowStartArrowDropdown] = useState(false);
  const [showEndArrowDropdown, setShowEndArrowDropdown] = useState(false);

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
    const newVisibility = {
      ...visibility,
      [key]: { ...visibility[key], ...updates }
    };
    setVisibility(newVisibility);
    if (selectedShapeId) updateDrawing(selectedShapeId, { visibility: newVisibility });
  };

  // Sync state when selectedShape changes
  useEffect(() => {
    if (selectedShape?.visibility) {
      setVisibility(selectedShape.visibility);
    }
  }, [selectedShape]);

  const updateProp = (key: string, val: any) => {
    if (selectedShapeId) updateDrawing(selectedShapeId, { [key]: val });
  };

  // Center on first render if no initial position
  useEffect(() => {
    if (position.x === 0 && position.y === 0 && typeof window !== 'undefined') {
      setPosition({ 
        x: window.innerWidth / 2 - 180, 
        y: window.innerHeight / 2 - 250 
      });
    }
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition(prev => ({
        x: prev.x + (e.clientX - dragStart.x),
        y: prev.y + (e.clientY - dragStart.y)
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    // Only allow dragging from the header area
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const tabs = ['Style', 'Visibility'];

  // Checkered pattern for background option
  const checkeredBg = `url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h4v4H0zm4 4h4v4H4z' fill='%23d1d4dc' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")`;

  return (
    <div 
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: '360px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        userSelect: 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div 
        onMouseDown={handleHeaderMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          cursor: 'grab',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#131722' }}>Brush</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
          </svg>
        </div>
        <button 
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#131722',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f3fa'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid #e0e3eb', gap: '20px' }}>
        {tabs.map(tab => (
          <div 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 0',
              fontSize: '14px',
              fontWeight: activeTab === tab ? 600 : 400,
              color: '#131722',
              cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid #131722' : '2px solid transparent',
              marginBottom: '-1px'
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {activeTab === 'Style' && (
          <>
            {/* Line Controls */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '80px', fontSize: '13px', color: '#131722' }}>Line</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* Color and Width combo box */}
                <div style={{ display: 'flex', border: '1px solid #e0e3eb', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: '32px', height: '32px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ width: '100%', height: '100%', backgroundColor: selectedShape?.stroke || '#00bcd4', borderRadius: '2px' }}></div>
                    <input type="color" value={selectedShape?.stroke || '#00bcd4'} onChange={e => updateProp('stroke', e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                  </div>
                  <div style={{ width: '1px', backgroundColor: '#e0e3eb' }}></div>
                  <div style={{ width: '40px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '20px', height: `${selectedShape?.strokeWidth || 2}px`, backgroundColor: selectedShape?.stroke || '#00bcd4' }}></div>
                  </div>
                </div>
                {/* Start Style */}
                <div style={{ position: 'relative' }}>
                  <div 
                    onClick={() => { setShowStartArrowDropdown(!showStartArrowDropdown); setShowEndArrowDropdown(false); }}
                    style={{ 
                      width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      borderColor: showStartArrowDropdown ? '#2962ff' : '#e0e3eb'
                    }}
                  >
                    {selectedShape?.lineStart === 'arrow' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1.5">
                        <path d="M7 12h11M7 12l4-4M7 12l4 4"></path>
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1">
                        <circle cx="6" cy="12" r="2" fill="transparent"></circle>
                        <line x1="8" y1="12" x2="18" y2="12"></line>
                      </svg>
                    )}
                  </div>
                  {showStartArrowDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: '#ffffff', border: '1px solid #e0e3eb', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 10, width: '120px' }}>
                      <div 
                        onClick={() => { updateProp('lineStart', 'normal'); setShowStartArrowDropdown(false); }}
                        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: selectedShape?.lineStart !== 'arrow' ? '#f0f3fa' : 'transparent' }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1"><circle cx="6" cy="12" r="2"></circle><line x1="8" y1="12" x2="18" y2="12"></line></svg>
                        <span style={{ fontSize: '13px' }}>Normal</span>
                      </div>
                      <div 
                        onClick={() => { updateProp('lineStart', 'arrow'); setShowStartArrowDropdown(false); }}
                        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: selectedShape?.lineStart === 'arrow' ? '#f0f3fa' : 'transparent' }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1.5"><path d="M7 12h11M7 12l4-4M7 12l4 4"></path></svg>
                        <span style={{ fontSize: '13px' }}>Arrow</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* End Style */}
                <div style={{ position: 'relative' }}>
                  <div 
                    onClick={() => { setShowEndArrowDropdown(!showEndArrowDropdown); setShowStartArrowDropdown(false); }}
                    style={{ 
                      width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      borderColor: showEndArrowDropdown ? '#2962ff' : '#e0e3eb'
                    }}
                  >
                    {selectedShape?.lineEnd === 'arrow' ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1.5">
                        <path d="M6 12h11M17 12l-4-4M17 12l-4 4"></path>
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1">
                        <line x1="6" y1="12" x2="16" y2="12"></line>
                        <circle cx="18" cy="12" r="2" fill="transparent"></circle>
                      </svg>
                    )}
                  </div>
                  {showEndArrowDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', backgroundColor: '#ffffff', border: '1px solid #e0e3eb', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 10, width: '120px' }}>
                      <div 
                        onClick={() => { updateProp('lineEnd', 'normal'); setShowEndArrowDropdown(false); }}
                        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: selectedShape?.lineEnd !== 'arrow' ? '#f0f3fa' : 'transparent' }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1"><line x1="6" y1="12" x2="16" y2="12"></line><circle cx="18" cy="12" r="2"></circle></svg>
                        <span style={{ fontSize: '13px' }}>Normal</span>
                      </div>
                      <div 
                        onClick={() => { updateProp('lineEnd', 'arrow'); setShowEndArrowDropdown(false); }}
                        style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', backgroundColor: selectedShape?.lineEnd === 'arrow' ? '#f0f3fa' : 'transparent' }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#131722" strokeWidth="1.5"><path d="M6 12h11M17 12l-4-4M17 12l-4 4"></path></svg>
                        <span style={{ fontSize: '13px' }}>Arrow</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Background Control */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '120px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckBox checked={!!selectedShape?.fillEnabled} onChange={(v) => updateProp('fillEnabled', v)} />
                <span style={{ fontSize: '13px', color: '#131722' }}>Background</span>
              </div>
              <div style={{ display: 'flex', marginLeft: '12px' }}>
                {/* Checkered Color Box */}
                <div style={{ width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '4px', position: 'relative', opacity: selectedShape?.fillEnabled ? 1 : 0.5 }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '2px', backgroundImage: checkeredBg, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: selectedShape?.fill || '#00bcd4' }}></div>
                  </div>
                  <input type="color" value={selectedShape?.fill || '#00bcd4'} onChange={e => updateProp('fill', e.target.value)} disabled={!selectedShape?.fillEnabled} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: selectedShape?.fillEnabled ? 'pointer' : 'default' }} />
                </div>
              </div>
            </div>
          </>
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
                    min={row.min} 
                    max={row.max} 
                    from={visibility[row.id]?.from || row.min} 
                    to={visibility[row.id]?.to || row.max} 
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
        {/* Template */}
        <div style={{ width: '110px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontSize: '13px', color: '#131722', cursor: 'pointer' }}>
          Template
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={onClose}
            style={{
              padding: '0 16px',
              height: '34px',
              backgroundColor: '#ffffff',
              border: '1px solid #131722',
              borderRadius: '4px',
              color: '#131722',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button 
            onClick={onClose}
            style={{
              padding: '0 24px',
              height: '34px',
              backgroundColor: '#131722',
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Ok
          </button>
        </div>
      </div>
    </div>
  );
}
