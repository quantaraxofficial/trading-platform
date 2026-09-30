'use client';

import React, { useState } from 'react';
import { X, LayoutGrid, HelpCircle, ChevronDown, ChevronRight, Plus, Activity } from 'lucide-react';
import { useAlerts } from '@/context/AlertsContext';
import { useEscapeClose } from "../lib/useEscapeClose";

interface CreateAlertModalProps {
  onClose: () => void;
  theme?: string;
  symbol?: string;
  initialPrice?: number;
}

export default function CreateAlertModal({ onClose, theme, symbol = 'XAUUSD', initialPrice = 4218.560 }: CreateAlertModalProps) {
  useEscapeClose(onClose);
  const [conditions, setConditions] = useState([{ id: 1, type: 'Price', operator: 'Crossing', value: initialPrice.toFixed(3) }]);
  const [trigger, setTrigger] = useState('Once only');
  const { addAlert } = useAlerts();

  const handleCreate = () => {
    // Just stringifying the conditions for the message to show they work
    const conditionsStr = conditions.map(c => `${c.type} ${c.operator} ${c.value}`).join(' AND ');
    
    addAlert({
      symbol,
      condition: conditions[0].operator,
      value: parseFloat(conditions[0].value), // The engine currently only strictly checks the first one
      trigger,
      expiration: Date.now() + 30 * 24 * 60 * 60 * 1000,
      message: `${symbol} ${conditionsStr}`
    });
    onClose();
  };

  const addCondition = () => {
    setConditions([...conditions, { id: Date.now(), type: 'Price', operator: 'Crossing', value: initialPrice.toFixed(3) }]);
  };

  const updateCondition = (id: number, field: string, value: string) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCondition = (id: number) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const isDark = theme === 'dark';
  const bg = isDark ? '#1e222d' : '#ffffff';
  const text = isDark ? '#d1d4dc' : '#131722';
  const textMuted = isDark ? '#787b86' : '#787b86';
  const border = isDark ? '#2a2e39' : '#e0e3eb';
  const inputBg = isDark ? '#2a2e39' : '#f0f3fa';

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10005, backgroundColor: 'rgba(0,0,0,0.4)'
    }}>
      <div style={{
        backgroundColor: bg, color: text, border: `1px solid ${border}`, borderRadius: '8px',
        width: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: `1px solid ${border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Create alert on</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600 }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#f2a900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '8px', height: '8px', borderTop: '2px solid white', borderBottom: '2px solid white' }} />
              </div>
              {symbol} <ChevronDown size={14} color={textMuted} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: textMuted }}>
            <LayoutGrid size={18} style={{ cursor: 'pointer' }} />
            <X size={20} style={{ cursor: 'pointer', color: text }} onClick={onClose} />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* Condition */}
          <div style={{ display: 'flex', marginBottom: '24px' }}>
            <div style={{ width: '100px', fontSize: '13px', color: textMuted, paddingTop: '8px' }}>Condition</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {conditions.map((c, index) => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {index > 0 && <div style={{ fontSize: '12px', fontWeight: 600, color: '#2962ff' }}>AND</div>}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      value={c.type} 
                      readOnly
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: '6px', 
                        border: `1px solid ${border}`, backgroundColor: inputBg, color: text, fontSize: '14px', outline: 'none'
                      }}
                    />
                    {index > 0 && <X size={16} color={textMuted} style={{ cursor: 'pointer' }} onClick={() => removeCondition(c.id)} />}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <select 
                      value={c.operator}
                      onChange={(e) => updateCondition(c.id, 'operator', e.target.value)}
                      style={{
                        width: '100%', padding: '8px 32px 8px 32px', borderRadius: '6px', 
                        border: `1px solid ${border}`, backgroundColor: inputBg, color: text, fontSize: '14px', appearance: 'none', outline: 'none', cursor: 'pointer'
                      }}
                    >
                      <option value="Crossing">Crossing</option>
                      <option value="Crossing Up">Crossing Up</option>
                      <option value="Crossing Down">Crossing Down</option>
                      <option value="Greater Than">Greater Than</option>
                      <option value="Less Than">Less Than</option>
                    </select>
                    <Activity size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: text }} />
                    <ChevronDown size={16} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: textMuted }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ position: 'relative', width: '120px' }}>
                      <select style={{
                        width: '100%', padding: '8px 32px 8px 12px', borderRadius: '6px', 
                        border: `1px solid ${border}`, backgroundColor: inputBg, color: text, fontSize: '14px', appearance: 'none', outline: 'none', cursor: 'pointer'
                      }}>
                        <option>Value</option>
                      </select>
                      <ChevronDown size={16} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: textMuted }} />
                    </div>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input 
                        type="text" 
                        value={c.value}
                        onChange={e => updateCondition(c.id, 'value', e.target.value)}
                        style={{
                          width: '100%', padding: '8px 32px 8px 12px', borderRadius: '6px', 
                          border: `2px solid #2962ff`, backgroundColor: 'transparent', color: text, fontSize: '14px', outline: 'none'
                        }}
                      />
                      <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', color: textMuted }}>
                        <ChevronDown size={12} style={{ transform: 'rotate(180deg)', cursor: 'pointer' }} />
                        <ChevronDown size={12} style={{ cursor: 'pointer' }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <button onClick={addCondition} style={{ background: 'none', border: 'none', color: '#2962ff', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: 0 }}>
                  <Plus size={14} /> Add condition
                </button>
                <HelpCircle size={14} color="#b2b5be" />
              </div>
            </div>
          </div>

          <div style={{ height: '1px', backgroundColor: border, margin: '0 -24px 24px -24px' }} />

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ width: '100px', fontSize: '13px', color: textMuted }}>Trigger</div>
            <div style={{ position: 'relative', width: '200px' }}>
              <select 
                value={trigger}
                onChange={e => setTrigger(e.target.value)}
                style={{
                  width: '100%', padding: '6px 32px 6px 12px', borderRadius: '6px', 
                  border: `1px solid ${border}`, backgroundColor: inputBg, color: text, fontSize: '13px', appearance: 'none', outline: 'none', cursor: 'pointer'
                }}>
                <option value="Once only">Once only</option>
                <option value="Every time">Every time</option>
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: textMuted }} />
            </div>
          </div>

          {/* Expiration */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ width: '100px', fontSize: '13px', color: textMuted }}>Expiration</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
              July 13, 2026 at 13:51 <ChevronDown size={14} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ width: '100px', fontSize: '13px', color: textMuted }}>Message</div>
            <div style={{ flex: 1 }}>
              <input 
                type="text" 
                value={`${symbol} ${conditions.map(c => `${c.type} ${c.operator} ${c.value}`).join(' AND ')}`}
                readOnly
                style={{
                  width: '100%', padding: '6px 12px', borderRadius: '6px', 
                  border: `1px solid ${border}`, backgroundColor: inputBg, color: text, fontSize: '13px', outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Notifications */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100px', fontSize: '13px', color: textMuted }}>Notifications</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
              App, Toasts <ChevronRight size={14} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: `1px solid ${border}` }}>
          <button onClick={onClose} style={{ 
            padding: '8px 16px', borderRadius: '6px', border: `1px solid ${border}`,
            background: 'transparent', color: text, cursor: 'pointer', fontSize: '14px'
          }}>
            Cancel
          </button>
          <button onClick={handleCreate} style={{ 
            padding: '8px 24px', borderRadius: '6px', border: 'none',
            background: '#2962ff', color: '#fff', cursor: 'pointer', fontSize: '14px'
          }}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
