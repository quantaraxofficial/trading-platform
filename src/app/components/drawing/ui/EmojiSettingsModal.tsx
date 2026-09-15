'use client';
import React, { useState, useEffect } from 'react';
import { useDrawing } from '../core/DrawingContext';

interface EmojiSettingsModalProps {
  onClose: () => void;
}

import { DualRangeSlider } from './DualRangeSlider';
import { NumberInput } from './NumberInput';

// Reusable checked box component matching TradingView style
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

interface VisibilityRowProps {
  label: string;
  checked: boolean;
  minVal: number;
  maxVal: number;
  minLimit: number;
  maxLimit: number;
  onToggle: (v: boolean) => void;
  onRangeChange: (from: number, to: number) => void;
}

function VisibilityRow({ label, checked, minVal, maxVal, minLimit, maxLimit, onToggle, onRangeChange }: VisibilityRowProps) {
  const hasRange = minLimit !== undefined && maxLimit !== undefined;
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '34px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '120px' }}>
        <CheckBox checked={checked} onChange={onToggle} />
        <span style={{ fontSize: '14px', color: '#131722' }}>{label}</span>
      </div>
      
      {hasRange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, opacity: checked ? 1 : 0.4, pointerEvents: checked ? 'auto' : 'none' }}>
          <NumberInput 
            value={minVal}
            onChange={(val) => onRangeChange(parseInt(val) || minLimit, maxVal)}
            style={{ width: '70px' }} 
          />
          
          <DualRangeSlider 
            min={minLimit}
            max={maxLimit}
            from={minVal}
            to={maxVal}
            onChange={onRangeChange}
          />
          
          <NumberInput 
            value={maxVal}
            onChange={(val) => onRangeChange(minVal, parseInt(val) || maxLimit)}
            style={{ width: '70px' }} 
          />
        </div>
      )}
    </div>
  );
}

export function EmojiSettingsModal({ onClose }: EmojiSettingsModalProps) {
  const { selectedShape, updateDrawing } = useDrawing();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('Visibility');

  const emojiSize = selectedShape?.emojiSize || 40;

  // Center on first render
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPosition({ x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 300 });
    }
  }, []);

  // Dragging
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPosition(prev => ({ x: prev.x + (e.clientX - dragStart.x), y: prev.y + (e.clientY - dragStart.y) }));
      setDragStart({ x: e.clientX, y: e.clientY });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, dragStart]);

  const tabs = ['Style', 'Visibility'];

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
    if (selectedShape) updateDrawing(selectedShape.id, { visibility: newVisibility });
  };

  // Sync state when selectedShape changes
  useEffect(() => {
    if (selectedShape?.visibility) {
      setVisibility(selectedShape.visibility);
    }
  }, [selectedShape]);

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: '400px',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        zIndex: 2500,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        userSelect: 'none',
        overflow: 'hidden'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        onMouseDown={(e) => { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'grab' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#131722' }}>Emoji</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#787b86', cursor: 'pointer' }}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#787b86' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e3eb', padding: '0 20px' }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 0',
              marginRight: '24px',
              fontSize: '14px',
              fontWeight: 600,
              color: activeTab === tab ? '#131722' : '#787b86',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #2962ff' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', minHeight: '400px', backgroundColor: '#ffffff' }}>
        {activeTab === 'Style' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '14px', color: '#131722' }}>Size</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="number" 
                  value={emojiSize} 
                  onChange={(e) => selectedShape && updateDrawing(selectedShape.id, { emojiSize: parseInt(e.target.value) || 40 })}
                  style={{ width: '80px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '14px', outline: 'none' }}
                />
                <span style={{ fontSize: '14px', color: '#787b86' }}>px</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '14px', color: '#131722' }}>Emoji</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="text" 
                  value={selectedShape?.emojiChar || '😃'} 
                  onChange={(e) => selectedShape && updateDrawing(selectedShape.id, { emojiChar: e.target.value })}
                  style={{ width: '80px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '0 8px', fontSize: '18px', textAlign: 'center', outline: 'none' }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Visibility' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <VisibilityRow 
              label="Ticks" 
              checked={!!visibility.ticks?.enabled} 
              minVal={visibility.ticks?.from || 1} 
              maxVal={visibility.ticks?.to || 1000}
              minLimit={1}
              maxLimit={1000}
              onToggle={(v) => updateVisibility('ticks', { enabled: v })} 
              onRangeChange={(from, to) => updateVisibility('ticks', { from, to })}
            />
            {[
              { id: 'seconds', label: 'Seconds', minLimit: 1, maxLimit: 59 },
              { id: 'minutes', label: 'Minutes', minLimit: 1, maxLimit: 59 },
              { id: 'hours', label: 'Hours', minLimit: 1, maxLimit: 24 },
              { id: 'days', label: 'Days', minLimit: 1, maxLimit: 366 },
              { id: 'weeks', label: 'Weeks', minLimit: 1, maxLimit: 52 },
              { id: 'months', label: 'Months', minLimit: 1, maxLimit: 12 },
            ].map(row => (
              <VisibilityRow 
                key={row.id}
                label={row.label} 
                checked={!!visibility[row.id]?.enabled} 
                minVal={visibility[row.id]?.from || row.minLimit} 
                maxVal={visibility[row.id]?.to || row.maxLimit}
                minLimit={row.minLimit}
                maxLimit={row.maxLimit}
                onToggle={(v) => updateVisibility(row.id, { enabled: v })} 
                onRangeChange={(from, to) => updateVisibility(row.id, { from, to })}
              />
            ))}
            <div style={{ display: 'flex', alignItems: 'center', height: '34px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '120px' }}>
                <CheckBox checked={!!visibility.ranges?.enabled} onChange={(v) => updateVisibility('ranges', { enabled: v })} />
                <span style={{ fontSize: '14px', color: '#131722' }}>Ranges</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid #e0e3eb', backgroundColor: '#ffffff' }}>
        <div style={{ position: 'relative' }}>
          <button style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '0 12px', 
            height: '38px', 
            backgroundColor: '#ffffff', 
            border: '1px solid #e0e3eb', 
            borderRadius: '6px',
            fontSize: '14px',
            color: '#131722',
            cursor: 'pointer'
          }}>
            Template
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1L5 5L9 1"></path></svg>
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ 
            padding: '0 20px', 
            height: '38px', 
            backgroundColor: '#ffffff', 
            border: '1px solid #e0e3eb', 
            borderRadius: '6px', 
            color: '#131722', 
            fontSize: '14px', 
            fontWeight: 500, 
            cursor: 'pointer' 
          }}>Cancel</button>
          <button onClick={onClose} style={{ 
            padding: '0 24px', 
            height: '38px', 
            backgroundColor: '#131722', 
            border: 'none', 
            borderRadius: '6px', 
            color: '#ffffff', 
            fontSize: '14px', 
            fontWeight: 500, 
            cursor: 'pointer' 
          }}>Ok</button>
        </div>
      </div>
    </div>
  );
}
