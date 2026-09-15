'use client';
import React, { useState, useEffect } from 'react';
import { useDrawing } from '../core/DrawingContext';
import { DualRangeSlider } from './DualRangeSlider';
import { NumberInput as GlobalNumberInput } from './NumberInput';

interface PositionSettingsModalProps {
  type: 'long' | 'short';
  onClose: () => void;
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
        width: '100px',
        height: '34px',
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

function Select({ options, value, onChange, style }: { options: string[]; value: string; onChange?: (val: string) => void; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <select
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={{
          width: '100%',
          height: '34px',
          border: '1px solid #e0e3eb',
          borderRadius: '4px',
          padding: '0 30px 0 10px',
          fontSize: '13px',
          color: '#131722',
          backgroundColor: '#ffffff',
          appearance: 'none',
          outline: 'none',
          cursor: 'pointer'
        }}
      >
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="#131722" strokeWidth="1.2"><path d="M1 1L5 5L9 1"></path></svg>
      </div>
    </div>
  );
}

// Helper to convert rgba to hex for color inputs
const rgbaToHex = (rgba: string) => {
  if (rgba.startsWith('#')) return rgba;
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#000000';
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
};

// Helper to convert hex to rgba
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export function PositionSettingsModal({ type, onClose }: PositionSettingsModalProps) {
  const { selectedShapeId, drawings, updateDrawing } = useDrawing();
  const selectedShape = drawings.find((d: any) => d.id === selectedShapeId);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('Inputs');

  const targetColor = selectedShape?.targetFillColor || 'rgba(76, 175, 80, 0.3)';
  const stopColor = selectedShape?.stopFillColor || 'rgba(244, 67, 54, 0.3)';
  const textColor = selectedShape?.textColor || '#ffffff';

  // Derived hex colors for inputs
  const targetHex = rgbaToHex(targetColor);
  const stopHex = rgbaToHex(stopColor);
  const textHex = rgbaToHex(textColor);

  // Input bindings
  const accountSize = selectedShape?.accountSize || 1000;
  const accountCurrency = selectedShape?.accountSizeCurrency || 'Default';
  const lotSize = selectedShape?.lotSize || 1;
  const risk = selectedShape?.risk || 25.00;
  const riskType = selectedShape?.riskType || '%';
  const leverage = selectedShape?.leverage || 10000.0;
  const qtyPrecision = selectedShape?.qtyPrecision || 'Default';
  const entryPrice = selectedShape?.points?.[0]?.price || 0;
  const targetPrice = selectedShape?.points?.[2]?.price || 0;
  const stopPrice = selectedShape?.points?.[3]?.price || 0;

  const targetTicks = Math.round(Math.abs(targetPrice - entryPrice) * 100);
  const stopTicks = Math.round(Math.abs(entryPrice - stopPrice) * 100);

  const updateProp = (key: string, val: any) => {
    if (selectedShape) updateDrawing(selectedShape.id, { [key]: val });
  };

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

  const handleEntryChange = (valStr: string) => {
    if (!selectedShape) return;
    const p = parseFloat(valStr);
    if (isNaN(p)) return;
    const diff = p - entryPrice;
    const newPoints = [...selectedShape.points];
    newPoints[0] = { ...newPoints[0], price: p };
    newPoints[1] = { ...newPoints[1], price: p };
    newPoints[2] = { ...newPoints[2], price: newPoints[2].price + diff };
    newPoints[3] = { ...newPoints[3], price: newPoints[3].price + diff };
    updateDrawing(selectedShape.id, { points: newPoints });
  };

  const handleTargetPriceChange = (valStr: string) => {
    if (!selectedShape) return;
    const p = parseFloat(valStr);
    if (isNaN(p)) return;
    const newPoints = [...selectedShape.points];
    newPoints[2] = { ...newPoints[2], price: p };
    updateDrawing(selectedShape.id, { points: newPoints });
  };

  const handleStopPriceChange = (valStr: string) => {
    if (!selectedShape) return;
    const p = parseFloat(valStr);
    if (isNaN(p)) return;
    const newPoints = [...selectedShape.points];
    newPoints[3] = { ...newPoints[3], price: p };
    updateDrawing(selectedShape.id, { points: newPoints });
  };

  const handleTargetTicksChange = (valStr: string) => {
    if (!selectedShape) return;
    const ticks = parseInt(valStr);
    if (isNaN(ticks)) return;
    const newPoints = [...selectedShape.points];
    newPoints[2] = { ...newPoints[2], price: type === 'long' ? entryPrice + (ticks / 100) : entryPrice - (ticks / 100) };
    updateDrawing(selectedShape.id, { points: newPoints });
  };

  const handleStopTicksChange = (valStr: string) => {
    if (!selectedShape) return;
    const ticks = parseInt(valStr);
    if (isNaN(ticks)) return;
    const newPoints = [...selectedShape.points];
    newPoints[3] = { ...newPoints[3], price: type === 'long' ? entryPrice - (ticks / 100) : entryPrice + (ticks / 100) };
    updateDrawing(selectedShape.id, { points: newPoints });
  };

  // Center on first render
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPosition({ x: window.innerWidth / 2 - 185, y: window.innerHeight / 2 - 280 });
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

  const tabs = ['Inputs', 'Style', 'Visibility'];

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: '370px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.07)',
        zIndex: 2500,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        userSelect: 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        onMouseDown={(e) => { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'grab' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#131722' }}>{type === 'long' ? 'Long position' : 'Short position'}</span>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#131722' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e3eb', padding: '0 20px' }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 0',
              marginRight: '20px',
              fontSize: '14px',
              fontWeight: 500,
              color: activeTab === tab ? '#131722' : '#787b86',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #131722' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '400px', overflowY: 'auto', maxHeight: '70vh' }}>
        
        {/* ── INPUTS TAB ── */}
        {activeTab === 'Inputs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>Account size</div>
              <LocalNumberInput value={accountSize.toString()} onChange={(v) => updateProp('accountSize', parseFloat(v))} style={{ flex: 1, minWidth: '0' }} />
              <Select options={['Default', 'USD']} value={accountCurrency} onChange={(v) => updateProp('accountSizeCurrency', v)} style={{ width: '100px' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>Lot size</div>
              <LocalNumberInput value={lotSize.toString()} onChange={(v) => updateProp('lotSize', parseFloat(v))} style={{ flex: 1, minWidth: '0' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>Risk</div>
              <LocalNumberInput value={risk.toString()} onChange={(v) => updateProp('risk', parseFloat(v))} style={{ flex: 1, minWidth: '0' }} />
              <Select options={['%', 'USD']} value={riskType} onChange={(v) => updateProp('riskType', v)} style={{ width: '100px' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>Entry price</div>
              <LocalNumberInput value={entryPrice.toFixed(3)} onChange={handleEntryChange} style={{ flex: 1, minWidth: '0' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>Leverage</div>
              <LocalNumberInput value={leverage.toString()} onChange={(v) => updateProp('leverage', parseFloat(v))} style={{ flex: 1, minWidth: '0' }} />
            </div>

            <div style={{ fontSize: '11px', color: '#787b86', textTransform: 'uppercase', marginTop: '10px' }}>PROFIT LEVEL</div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>Ticks</div>
              <LocalNumberInput value={targetTicks.toString()} onChange={handleTargetTicksChange} style={{ flex: 1, minWidth: '0' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>Price</div>
              <LocalNumberInput value={targetPrice.toFixed(3)} onChange={handleTargetPriceChange} style={{ flex: 1, minWidth: '0' }} />
            </div>

            <div style={{ fontSize: '11px', color: '#787b86', textTransform: 'uppercase', marginTop: '10px' }}>STOP LEVEL</div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>Ticks</div>
              <LocalNumberInput value={stopTicks.toString()} onChange={handleStopTicksChange} style={{ flex: 1, minWidth: '0' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>Price</div>
              <LocalNumberInput value={stopPrice.toFixed(3)} onChange={handleStopPriceChange} style={{ flex: 1, minWidth: '0' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
              <div style={{ width: '120px', fontSize: '13px', color: '#131722' }}>QTY precision</div>
              <Select options={['Default']} value={qtyPrecision} onChange={(v) => updateProp('qtyPrecision', v)} style={{ width: '120px' }} />
            </div>
          </div>
        )}

        {/* ── STYLE TAB ── */}
        {activeTab === 'Style' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '100px', fontSize: '13px', color: '#131722' }}>Lines</div>
              <div style={{ display: 'flex', gap: '8px', border: '1px solid #e0e3eb', borderRadius: '4px', padding: '3px 8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '22px', height: '22px', backgroundColor: selectedShape?.stroke || '#787b86', borderRadius: '2px' }}>
                  <input type="color" value={rgbaToHex(selectedShape?.stroke || '#787b86')} onChange={(e) => updateProp('stroke', e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                </div>
                <div style={{ width: '24px', height: '1px', backgroundColor: selectedShape?.stroke || '#787b86' }}></div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '100px', fontSize: '13px', color: '#131722' }}>Stop color</div>
              <div style={{ position: 'relative', width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', backgroundColor: stopColor, cursor: 'pointer', backgroundImage: 'linear-gradient(45deg, #e0e3eb 25%, transparent 25%, transparent 75%, #e0e3eb 75%, #e0e3eb), linear-gradient(45deg, #e0e3eb 25%, transparent 25%, transparent 75%, #e0e3eb 75%, #e0e3eb)', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundColor: stopColor }} />
                <input type="color" value={stopHex} onChange={(e) => updateProp('stopFillColor', hexToRgba(e.target.value, 0.3))} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '100px', fontSize: '13px', color: '#131722' }}>Target color</div>
              <div style={{ position: 'relative', width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', backgroundColor: targetColor, cursor: 'pointer', backgroundImage: 'linear-gradient(45deg, #e0e3eb 25%, transparent 25%, transparent 75%, #e0e3eb 75%, #e0e3eb), linear-gradient(45deg, #e0e3eb 25%, transparent 25%, transparent 75%, #e0e3eb 75%, #e0e3eb)', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }}>
                <div style={{ position: 'absolute', inset: 0, backgroundColor: targetColor }} />
                <input type="color" value={targetHex} onChange={(e) => updateProp('targetFillColor', hexToRgba(e.target.value, 0.3))} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '100px', fontSize: '13px', color: '#131722' }}>Text</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', width: '34px', height: '34px', border: '1px solid #e0e3eb', borderRadius: '4px', backgroundColor: textColor, cursor: 'pointer' }}>
                  <input type="color" value={textHex} onChange={(e) => updateProp('textColor', e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                </div>
                <Select options={['10', '12', '14', '16']} value={(selectedShape?.fontSize || 12).toString()} onChange={(v) => updateProp('fontSize', parseInt(v))} style={{ width: '100px' }} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
              <CheckBox checked={!!selectedShape?.showPriceLabels} onChange={(v) => updateProp('showPriceLabels', v)} />
              <div style={{ fontSize: '13px', color: '#131722' }}>Price labels</div>
            </div>

            <div style={{ fontSize: '11px', color: '#787b86', textTransform: 'uppercase', marginTop: '10px' }}>INFO</div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ width: '100px', fontSize: '13px', color: '#131722' }}>Stats</div>
              <Select options={['TP price offset, ...']} value={selectedShape?.statsMode || 'TP price offset, ...'} onChange={(v) => updateProp('statsMode', v)} style={{ flex: 1 }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
              <CheckBox checked={!!selectedShape?.compactStatsMode} onChange={(v) => updateProp('compactStatsMode', v)} />
              <div style={{ fontSize: '13px', color: '#131722' }}>Compact stats mode</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckBox checked={!!selectedShape?.alwaysShowStats} onChange={(v) => updateProp('alwaysShowStats', v)} />
              <div style={{ fontSize: '13px', color: '#131722' }}>Always show stats</div>
            </div>
          </div>
        )}

        {/* ── VISIBILITY TAB ── */}
        {activeTab === 'Visibility' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <CheckBox checked={!!visibility.ticks?.enabled} onChange={(v) => updateVisibility('ticks', { enabled: v })} />
              <div style={{ fontSize: '13px', color: '#131722' }}>Ticks</div>
            </div>

            {[
              { id: 'seconds', label: 'Seconds', minLimit: 1, maxLimit: 59 },
              { id: 'minutes', label: 'Minutes', minLimit: 1, maxLimit: 59 },
              { id: 'hours', label: 'Hours', minLimit: 1, maxLimit: 24 },
              { id: 'days', label: 'Days', minLimit: 1, maxLimit: 366 },
              { id: 'weeks', label: 'Weeks', minLimit: 1, maxLimit: 52 },
              { id: 'months', label: 'Months', minLimit: 1, maxLimit: 12 },
            ].map(row => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: !!visibility[row.id]?.enabled ? 1 : 0.4, pointerEvents: !!visibility[row.id]?.enabled ? 'auto' : 'none' }}>
                <CheckBox checked={!!visibility[row.id]?.enabled} onChange={(v) => updateVisibility(row.id, { enabled: v })} />
                <div style={{ fontSize: '13px', color: '#131722', width: '60px' }}>{row.label}</div>
                <LocalNumberInput 
                  value={(visibility[row.id]?.from || row.minLimit).toString()} 
                  onChange={(v) => updateVisibility(row.id, { from: parseInt(v) || row.minLimit })}
                  style={{ width: '60px', height: '28px' }} 
                />
                <DualRangeSlider 
                  min={row.minLimit} 
                  max={row.maxLimit} 
                  from={visibility[row.id]?.from || row.minLimit} 
                  to={visibility[row.id]?.to || row.maxLimit} 
                  onChange={(from, to) => updateVisibility(row.id, { from, to })} 
                />
                <LocalNumberInput 
                  value={(visibility[row.id]?.to || row.maxLimit).toString()} 
                  onChange={(v) => updateVisibility(row.id, { to: parseInt(v) || row.maxLimit })}
                  style={{ width: '60px', height: '28px' }} 
                />
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
              <CheckBox checked={!!visibility.ranges?.enabled} onChange={(v) => updateVisibility('ranges', { enabled: v })} />
              <div style={{ fontSize: '13px', color: '#131722' }}>Ranges</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #e0e3eb' }}>
        <Select options={['Template']} defaultValue="Template" style={{ width: '110px' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '0 16px', height: '34px', backgroundColor: '#ffffff', border: '1px solid #131722', borderRadius: '4px', color: '#131722', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0 24px', height: '34px', backgroundColor: '#131722', border: 'none', borderRadius: '4px', color: '#ffffff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Ok</button>
        </div>
      </div>
    </div>
  );
}
