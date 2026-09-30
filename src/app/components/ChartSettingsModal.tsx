'use client';

import React, { useState, useRef, useEffect } from 'react';
import { statusLine, LEGEND_TITLE_MODES, type StatusLineSettings, type LegendTitleMode } from "../lib/statusLine";
import { X, HelpCircle, ChevronDown, Menu, Move, Edit2, Activity, Clock, Calendar, BarChart2 } from 'lucide-react';
import ColorPicker from './ColorPicker';
import { useAuth } from '@/context/AuthContext';
import SaveTemplateModal from './SaveTemplateModal';
import { tradingSettings, TradingSettings, PnlMode } from '@/app/trading/settings';
import { EXECUTION_SOUNDS, playExecutionSound } from '@/app/trading/sounds';

export interface CandleColors {
  upColor: string;
  downColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  borderVisible: boolean;
  wickVisible: boolean;
  bodyVisible: boolean;
}

export interface CanvasColors {
  background: string;
  gridVert: string;
  gridHorz: string;
  crosshair: string;
  text: string;
  lines: string;
}

interface ChartSettingsModalProps {
  theme: string;
  onClose: () => void;
  candleColors?: CandleColors;
  onSaveColors?: (colors: CandleColors) => void;
  canvasColors?: CanvasColors;
  onSaveCanvasColors?: (colors: CanvasColors) => void;
  initialTab?: string;
}

export default function ChartSettingsModal({ theme, onClose, candleColors, onSaveColors, canvasColors, onSaveCanvasColors, initialTab }: ChartSettingsModalProps) {
  useEscapeClose(onClose);
  const [activeTab, setActiveTab] = useState(initialTab || 'symbol');
  // Trading tab edits a draft that Ok applies (Cancel drops it)
  const [tradingDraft, setTradingDraft] = useState<TradingSettings>(() => tradingSettings.get());
  const [statusDraft, setStatusDraft] = useState<StatusLineSettings>(() => statusLine.get());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetch(`http://localhost:8000/api/users/templates/${user.uid}/?tool_type=chart_settings`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setTemplates(data);
        })
        .catch(e => console.error("Failed to load templates:", e));
    }
  }, [user]);

  const applyTemplate = (t: any) => {
    if (t.settings) {
      if (t.settings.candleColors) setColors(t.settings.candleColors);
      if (t.settings.canvasColors) setCanvasColorsState(t.settings.canvasColors);
    }
    setShowTemplateDropdown(false);
  };

  const [colors, setColors] = useState<CandleColors>(candleColors || {
    upColor: "#089981", downColor: "#f23645",
    borderUpColor: "#089981", borderDownColor: "#f23645",
    wickUpColor: "#089981", wickDownColor: "#f23645",
    borderVisible: true, wickVisible: true, bodyVisible: true
  });

  const [canvasColorsState, setCanvasColorsState] = useState<CanvasColors>(canvasColors || {
    background: isDark ? "#131722" : "#ffffff",
    gridVert: isDark ? "#1e222d" : "#f0f3fa",
    gridHorz: isDark ? "#1e222d" : "#f0f3fa",
    crosshair: "#9598a1",
    text: isDark ? "#d1d4dc" : "#131722",
    lines: isDark ? "#e0e3eb" : "#e0e3eb"
  });

  const handleSave = () => {
    onSaveColors?.(colors);
    onSaveCanvasColors?.(canvasColorsState);
    tradingSettings.set(tradingDraft);
    statusLine.set(statusDraft);
    onClose();
  };

  // Center the modal initially
  useEffect(() => {
    if (typeof window !== 'undefined' && modalRef.current) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const mw = modalRef.current.offsetWidth;
      const mh = modalRef.current.offsetHeight;
      setPosition({
        x: Math.max(0, (w - mw) / 2),
        y: Math.max(0, (h - mh) / 2)
      });
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const isDark = theme === 'dark';
  const bg = isDark ? '#1e222d' : '#ffffff';
  const text = isDark ? '#d1d4dc' : '#131722';
  const border = isDark ? '#2a2e39' : '#e0e3eb';
  const tabHover = isDark ? '#2a2e39' : '#f0f3fa';
  const tabActive = isDark ? '#2a2e39' : '#f0f3fa';

  const tabs = [
    { id: 'symbol', label: 'Symbol', icon: <BarChart2 size={18} /> },
    { id: 'status', label: 'Status line', icon: <Menu size={18} /> },
    { id: 'scales', label: 'Scales and lines', icon: <Move size={18} /> },
    { id: 'canvas', label: 'Canvas', icon: <Edit2 size={18} /> },
    { id: 'trading', label: 'Trading', icon: <Activity size={18} /> },
    { id: 'alerts', label: 'Alerts', icon: <Clock size={18} /> },
    { id: 'events', label: 'Events', icon: <Calendar size={18} /> },
  ];

  return (
    <div 
      ref={modalRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: '600px',
        height: '600px',
        backgroundColor: bg,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* Header */}
      <div 
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: `1px solid ${border}`,
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Settings</h2>
        <button onClick={onClose} style={{ color: text, cursor: 'pointer', background: 'none', border: 'none' }}>
          <X size={24} />
        </button>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: '200px', borderRight: `1px solid ${border}`, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '10px 16px',
                border: 'none',
                background: activeTab === tab.id ? tabActive : 'transparent',
                color: text,
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '14px',
                fontWeight: activeTab === tab.id ? 600 : 400,
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => { if (activeTab !== tab.id) e.currentTarget.style.background = tabHover; }}
              onMouseLeave={(e) => { if (activeTab !== tab.id) e.currentTarget.style.background = 'transparent'; }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {activeTab === 'symbol' && <SymbolTab isDark={isDark} border={border} theme={theme} colors={colors} setColors={setColors} />}
          {activeTab === 'status' && <StatusTab border={border} value={statusDraft} onChange={patch => setStatusDraft(d => ({ ...d, ...patch }))} />}
          {activeTab === 'scales' && <ScalesTab isDark={isDark} border={border} />}
          {activeTab === 'canvas' && <CanvasTab isDark={isDark} border={border} theme={theme} colors={canvasColorsState} setColors={setCanvasColorsState} />}
          {activeTab === 'trading' && <TradingTab border={border} value={tradingDraft} onChange={patch => setTradingDraft(d => ({ ...d, ...patch }))} />}
          {activeTab === 'alerts' && <AlertsTab isDark={isDark} border={border} />}
          {activeTab === 'events' && <EventsTab isDark={isDark} border={border} />}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: `1px solid ${border}` }}>
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
            style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', 
            padding: '8px 12px', background: 'transparent', border: `1px solid ${border}`, borderRadius: '6px',
            color: text, cursor: 'pointer', fontSize: '14px'
          }}>
            Template <ChevronDown size={16} />
          </button>
          
          {showTemplateDropdown && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: '8px',
              backgroundColor: bg, border: `1px solid ${border}`, borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: '180px', overflow: 'hidden',
              display: 'flex', flexDirection: 'column', zIndex: 100001
            }}>
              <button onClick={() => { setShowTemplateDropdown(false); setShowSaveModal(true); }} style={{ padding: '10px 16px', background: 'transparent', border: 'none', color: text, cursor: 'pointer', textAlign: 'left', fontSize: '14px' }} onMouseEnter={(e) => e.currentTarget.style.background = tabHover} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                Save As...
              </button>
              {templates.length > 0 && <div style={{ height: '1px', backgroundColor: border, margin: '4px 0' }} />}
              {templates.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)} style={{ padding: '10px 16px', background: 'transparent', border: 'none', color: text, cursor: 'pointer', textAlign: 'left', fontSize: '14px' }} onMouseEnter={(e) => e.currentTarget.style.background = tabHover} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{ 
            padding: '8px 24px', background: 'transparent', border: `1px solid ${border}`, borderRadius: '6px',
            color: text, cursor: 'pointer', fontSize: '14px'
          }}>
            Cancel
          </button>
          <button onClick={handleSave} style={{ 
            padding: '8px 24px', background: isDark ? '#2962ff' : '#2962ff', border: 'none', borderRadius: '6px',
            color: '#fff', cursor: 'pointer', fontSize: '14px'
          }}>
            Ok
          </button>
        </div>
      </div>
      
      {showSaveModal && (
        <SaveTemplateModal 
          onClose={(saved) => {
            setShowSaveModal(false);
            if (saved && user) {
              fetch(`http://localhost:8000/api/users/templates/${user.uid}/?tool_type=chart_settings`)
                .then(res => res.json())
                .then(data => { if (Array.isArray(data)) setTemplates(data); });
            }
          }}
          theme={theme}
          settingsToSave={{ candleColors: colors, canvasColors: canvasColorsState }}
        />
      )}
    </div>
  );
}

// Helper components for UI elements
const SectionHeader = ({ title }: { title: string }) => (
  <div style={{ fontSize: '11px', fontWeight: 600, color: '#787b86', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '16px', marginTop: '24px' }}>
    {title}
  </div>
);

const CheckboxRow = ({ label, hasIcon = false }: { label: string, hasIcon?: boolean }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', cursor: 'pointer' }}>
    <input type="checkbox" defaultChecked style={{ width: '16px', height: '16px', accentColor: '#2962ff' }} />
    <span style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      {label} {hasIcon && <HelpCircle size={14} color="#b2b5be" />}
    </span>
  </label>
);

const DropdownRow = ({ label, options, border }: { label: string, options: string[], border: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
    <span style={{ fontSize: '14px' }}>{label}</span>
    <select style={{ 
      padding: '6px 32px 6px 12px', borderRadius: '6px', border: `1px solid ${border}`, 
      background: 'transparent', color: 'inherit', fontSize: '14px', appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '16px'
    }}>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  </div>
);

import { createPortal } from 'react-dom';
import { useEscapeClose } from "../lib/useEscapeClose";

const ColorPickerBox = ({ color, onChange, theme, bg }: { color?: string, onChange?: (c: string) => void, theme?: string, bg?: string }) => {
  const [show, setShow] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [internalColor, setInternalColor] = useState(color || bg || '#ffffff');

  useEffect(() => {
    if (color) setInternalColor(color);
  }, [color]);

  const toggleShow = () => {
    if (!show && boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setShow(!show);
  };

  const handleChange = (c: string) => {
    setInternalColor(c);
    if (onChange) onChange(c);
  };

  return (
    <>
      <div 
        ref={boxRef}
        onClick={toggleShow}
        style={{ width: '28px', height: '28px', borderRadius: '4px', backgroundColor: internalColor, border: '1px solid #e0e3eb', cursor: 'pointer' }} 
      />
      {show && typeof document !== 'undefined' && createPortal(
        <ColorPicker 
          color={internalColor} 
          onChange={handleChange} 
          onClose={() => setShow(false)} 
          theme={theme}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 999999 }}
        />,
        document.body
      )}
    </>
  );
};

// Tabs Content
const SymbolTab = ({ border, theme, colors, setColors }: { isDark: boolean, border: string, theme: string, colors: CandleColors, setColors: React.Dispatch<React.SetStateAction<CandleColors>> }) => (
  <div>
    <SectionHeader title="Candles" />
    <CheckboxRow label="Color bars based on previous close" />
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', width: '120px' }}>
        <input type="checkbox" checked={colors.bodyVisible} onChange={e => setColors({...colors, bodyVisible: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#2962ff' }} />
        <span style={{ fontSize: '14px' }}>Body</span>
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <ColorPickerBox theme={theme} color={colors.upColor} onChange={c => setColors({...colors, upColor: c})} />
        <ColorPickerBox theme={theme} color={colors.downColor} onChange={c => setColors({...colors, downColor: c})} />
      </div>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', width: '120px' }}>
        <input type="checkbox" checked={colors.borderVisible} onChange={e => setColors({...colors, borderVisible: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#2962ff' }} />
        <span style={{ fontSize: '14px' }}>Borders</span>
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <ColorPickerBox theme={theme} color={colors.borderUpColor} onChange={c => setColors({...colors, borderUpColor: c})} />
        <ColorPickerBox theme={theme} color={colors.borderDownColor} onChange={c => setColors({...colors, borderDownColor: c})} />
      </div>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', width: '120px' }}>
        <input type="checkbox" checked={colors.wickVisible} onChange={e => setColors({...colors, wickVisible: e.target.checked})} style={{ width: '16px', height: '16px', accentColor: '#2962ff' }} />
        <span style={{ fontSize: '14px' }}>Wick</span>
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <ColorPickerBox theme={theme} color={colors.wickUpColor} onChange={c => setColors({...colors, wickUpColor: c})} />
        <ColorPickerBox theme={theme} color={colors.wickDownColor} onChange={c => setColors({...colors, wickDownColor: c})} />
      </div>
    </div>

    <SectionHeader title="Data Modification" />
    <DropdownRow label="Precision" options={['Default']} border={border} />
    <DropdownRow label="Timezone" options={['(UTC+5:30) Kolkata']} border={border} />
  </div>
);

const StatusTab = ({ border, value: v, onChange }: { border: string, value: StatusLineSettings, onChange: (p: Partial<StatusLineSettings>) => void }) => {
  // Plain functions, not components: a component defined in here would remount (and drop a
  // slider mid-drag) on every change
  const check = (label: string, k: keyof StatusLineSettings, children?: React.ReactNode) => (
    <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', marginBottom: '16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!v[k]} onChange={e => onChange({ [k]: e.target.checked } as Partial<StatusLineSettings>)} style={{ width: '16px', height: '16px', accentColor: '#131722' }} />
        <span style={{ fontSize: '14px' }}>{label}</span>
      </label>
      {children}
    </div>
  );
  const opacity = (k: 'backgroundOpacity' | 'indBackgroundOpacity', enabledBy: keyof StatusLineSettings) => (
    <input type="range" min={0} max={100} value={v[k]} disabled={!v[enabledBy]} aria-label="Background opacity"
      onChange={e => onChange({ [k]: Number(e.target.value) } as Partial<StatusLineSettings>)}
      style={{ flex: 1, maxWidth: '180px', accentColor: '#131722', opacity: v[enabledBy] ? 1 : 0.45 }} />
  );
  return (
    <div>
      <SectionHeader title="Instrument" />
      {check("Logo", "logo")}
      {check("Title", "title", (
        <select value={v.titleMode} disabled={!v.title} aria-label="Title" onChange={e => onChange({ titleMode: e.target.value as LegendTitleMode })} style={{
          width: 190, padding: '6px 28px 6px 10px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent', color: 'inherit', fontSize: '14px',
          opacity: v.title ? 1 : 0.45,
        }}>
          {LEGEND_TITLE_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      ))}
      {check("Open market status", "marketStatus")}
      {check("Chart values", "chartValues")}
      {check("Bar change values", "barChange")}
      {check("Volume", "volume")}
      {check("Last day change values", "lastDayChange")}
      {check("Background", "background", opacity("backgroundOpacity", "background"))}

      <SectionHeader title="Indicators" />
      {check("Titles", "indTitles")}
      {check("Inputs", "indInputs")}
      {check("Values", "indValues")}
      {check("Background", "indBackground", opacity("indBackgroundOpacity", "indBackground"))}
    </div>
  );
};

const ScalesTab = ({ border }: { isDark: boolean, border: string }) => (
  <div>
    <SectionHeader title="Price Scale" />
    <DropdownRow label="Currency and Unit" options={['Visible on mouse over']} border={border} />
    <DropdownRow label="Scale modes (A and L)" options={['Visible on mouse over']} border={border} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: '16px', height: '16px' }} />
        <span style={{ fontSize: '14px' }}>Lock price to bar ratio</span>
      </label>
      <input type="text" defaultValue="0.186072" disabled style={{ padding: '6px 12px', width: '100px', borderRadius: '6px', border: `1px solid ${border}`, background: '#f0f3fa', color: '#787b86' }} />
    </div>
    <DropdownRow label="Scales placement" options={['Auto']} border={border} />

    <SectionHeader title="Price Labels & Lines" />
    <CheckboxRow label="No overlapping labels" />
    <CheckboxRow label="Plus button" hasIcon />
    <CheckboxRow label="Countdown to bar close" />
    
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
      <span style={{ fontSize: '14px' }}>Symbol</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <select style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent' }}><option>Value, line</option></select>
        <ColorPickerBox bg="#f23645" />
      </div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
      <select style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent' }}><option>Value according to sc...</option></select>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <span style={{ fontSize: '14px' }}>Previous day close</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <select style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent' }}><option>Hidden</option></select>
        <ColorPickerBox bg="#9598a1" />
      </div>
    </div>

    <SectionHeader title="Time Scale" />
    <CheckboxRow label="Day of week on labels" />
    <DropdownRow label="Date format" options={["Mon 29 Sep '97"]} border={border} />
    <DropdownRow label="Time hours format" options={['24-hours']} border={border} />
  </div>
);

const CanvasTab = ({ border, theme, colors, setColors }: { isDark: boolean, border: string, theme: string, colors: CanvasColors, setColors: React.Dispatch<React.SetStateAction<CanvasColors>> }) => (
  <div>
    <SectionHeader title="Chart Basic Styles" />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <span style={{ fontSize: '14px' }}>Background</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <select style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent' }}><option>Solid</option></select>
        <ColorPickerBox theme={theme} color={colors.background} onChange={c => setColors({...colors, background: c})} />
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <span style={{ fontSize: '14px' }}>Grid lines</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <select style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent' }}><option>Vert and Horz</option></select>
        <ColorPickerBox theme={theme} color={colors.gridVert} onChange={c => setColors({...colors, gridVert: c})} />
        <ColorPickerBox theme={theme} color={colors.gridHorz} onChange={c => setColors({...colors, gridHorz: c})} />
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <span style={{ fontSize: '14px' }}>Crosshair</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <ColorPickerBox theme={theme} color={colors.crosshair} onChange={c => setColors({...colors, crosshair: c})} />
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <span style={{ fontSize: '14px' }}>Watermark</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <select style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent' }}><option>Replay mode</option></select>
        <ColorPickerBox bg="#e0e3eb" />
      </div>
    </div>

    <SectionHeader title="Scales" />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <span style={{ fontSize: '14px' }}>Text</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <ColorPickerBox theme={theme} color={colors.text} onChange={c => setColors({...colors, text: c})} />
        <select style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent' }}><option>12</option></select>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <span style={{ fontSize: '14px' }}>Lines</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <ColorPickerBox theme={theme} color={colors.lines} onChange={c => setColors({...colors, lines: c})} />
      </div>
    </div>

    <SectionHeader title="Buttons" />
    <DropdownRow label="Navigation" options={['Visible on mouse over']} border={border} />
    <DropdownRow label="Pane" options={['Visible on mouse over']} border={border} />

    <SectionHeader title="Margins" />
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {['Top', 'Bottom', 'Right'].map(lbl => (
        <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <span style={{ fontSize: '14px', width: '80px' }}>{lbl}</span>
          <input type="text" defaultValue={lbl === 'Bottom' ? '8' : '10'} style={{ width: '80px', padding: '6px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent', color: 'inherit' }} />
          <span style={{ fontSize: '14px' }}>{lbl === 'Right' ? 'bars' : '%'}</span>
        </div>
      ))}
    </div>
  </div>
);

// Settings → Trading: every option drives the paper-trading UI (buttons, one-click trading,
// sounds, notifications, how positions/orders/executions are drawn, snapshots)
const TradingTab = ({ border, value: v, onChange }: { border: string, value: TradingSettings, onChange: (p: Partial<TradingSettings>) => void }) => {
  const Check = ({ label, k, disabled, help }: { label: string, k: keyof TradingSettings, disabled?: boolean, help?: string }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: help ? '4px' : '16px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1 }}>
      <input type="checkbox" checked={!!v[k]} disabled={disabled} onChange={e => onChange({ [k]: e.target.checked } as Partial<TradingSettings>)} style={{ width: '16px', height: '16px', accentColor: '#131722' }} />
      <span style={{ fontSize: '14px' }}>{label}</span>
    </label>
  );
  const Help = ({ children, indent = 28 }: { children: React.ReactNode, indent?: number }) => (
    <p style={{ fontSize: '12px', color: '#787b86', margin: `0 0 16px ${indent}px` }}>{children}</p>
  );
  const Select = ({ value, options, onPick, disabled, width = 120 }: { value: string, options: readonly string[], onPick: (o: string) => void, disabled?: boolean, width?: number }) => (
    <select value={value} disabled={disabled} onChange={e => onPick(e.target.value)} style={{
      width, padding: '6px 28px 6px 10px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent', color: 'inherit', fontSize: '14px',
      opacity: disabled ? 0.45 : 1, appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23787b86' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '16px',
    }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const pnlModes: PnlMode[] = ['Money', 'Ticks', 'Percentage'];
  return (
    <div>
      <SectionHeader title="General" />
      <Check label="Buy/sell buttons" k="buySellButtons" help="x" />
      <Help>Displays buy and sell buttons directly on the chart</Help>
      <Check label="One-click trading" k="oneClickTrading" help="x" />
      <Help>Instantly place, edit, cancel orders, or close positions without confirmation</Help>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: 16 }}>
        <Check label="Execution sound" k="executionSound" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <input type="range" min={0} max={100} value={v.executionSoundVolume} disabled={!v.executionSound} aria-label="Execution sound volume"
            onChange={e => onChange({ executionSoundVolume: Number(e.target.value) })}
            onMouseUp={() => v.executionSound && playExecutionSound(v.executionSoundName, v.executionSoundVolume)}
            style={{ width: '150px', accentColor: '#131722', opacity: v.executionSound ? 1 : 0.45 }} />
          <Select value={v.executionSoundName} options={EXECUTION_SOUNDS} disabled={!v.executionSound} width={150}
            onPick={o => { onChange({ executionSoundName: o }); playExecutionSound(o, v.executionSoundVolume); }} />
        </div>
      </div>
      <Check label="Show only rejection notifications" k="onlyRejectionNotifications" />

      <SectionHeader title="Appearance" />
      <Check label="Positions and orders" k="positionsAndOrders" />
      <div style={{ marginLeft: '28px' }}>
        <Check label="Reverse position button" k="reversePositionButton" disabled={!v.positionsAndOrders} help="x" />
        <Help>Adds the reverse button next to the open position on the chart</Help>
      </div>
      <Check label="Project order for market orders" k="projectOrderForMarket" help="x" />
      <Help>Shows a project order on the chart before sending a market order</Help>

      <Check label="Profit and loss value" k="pnlValue" />
      <div style={{ marginLeft: '28px', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
        {([['Positions', 'pnlPositions', 'pnlPositionsMode'], ['Brackets', 'pnlBrackets', 'pnlBracketsMode']] as const).map(([label, k, mk]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Check label={label} k={k} disabled={!v.pnlValue} />
            <div style={{ marginBottom: 16 }}>
              <Select value={v[mk]} options={pnlModes} disabled={!v.pnlValue || !v[k]} onPick={o => onChange({ [mk]: o as PnlMode } as Partial<TradingSettings>)} />
            </div>
          </div>
        ))}
      </div>

      <Check label="Execution marks" k="executionMarks" />
      <div style={{ marginLeft: '28px' }}>
        <Check label="Execution labels" k="executionLabels" disabled={!v.executionMarks} />
      </div>

      <Check label="Extended price lines across the entire chart width" k="extendedPriceLines" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontSize: '14px' }}>Order and position alignment</span>
        <Select value={v.alignment} options={['Left', 'Right']} onPick={o => onChange({ alignment: o as 'Left' | 'Right' })} />
      </div>
      <Check label="Orders, executions, and positions in chart snapshots" k="tradesInSnapshots" help="x" />
      <Help>Shows your trades on the chart in snapshots</Help>
    </div>
  );
};

const AlertsTab = ({ border }: { isDark: boolean, border: string }) => (
  <div>
    <SectionHeader title="Chart Line Visibility" />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <CheckboxRow label="Alert lines" />
      <ColorPickerBox bg="#f23645" />
    </div>
    <CheckboxRow label="Only active alerts" />

    <SectionHeader title="Notifications" />
    <CheckboxRow label="Automatically hide toasts" hasIcon />
  </div>
);

const EventsTab = ({ border }: { isDark: boolean, border: string }) => (
  <div>
    <SectionHeader title="Events" />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: '16px', height: '16px' }} />
        <span style={{ fontSize: '14px' }}>Ideas</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <select style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${border}`, background: 'transparent' }}><option>All ideas</option></select>
        <HelpCircle size={14} color="#b2b5be" />
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: '16px', height: '16px' }} />
        <span style={{ fontSize: '14px' }}>Session breaks</span>
      </label>
      <ColorPickerBox bg="#2962ff" />
    </div>
    <CheckboxRow label="Economic events" />
    <div style={{ marginLeft: '28px' }}>
      <CheckboxRow label="Only future events" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '14px' }}>Events breaks</span>
        </label>
        <ColorPickerBox bg="#9598a1" />
      </div>
    </div>
    <CheckboxRow label="Latest news" />
    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', cursor: 'pointer' }}>
      <input type="checkbox" style={{ width: '16px', height: '16px' }} />
      <span style={{ fontSize: '14px' }}>News notification</span>
    </label>
  </div>
);
