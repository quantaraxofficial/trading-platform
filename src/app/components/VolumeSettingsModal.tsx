"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, ChevronDown, BarChart2, Activity, Plus } from "lucide-react";
import { DualRangeSlider } from "./drawing/ui/DualRangeSlider";
import { useEscapeClose } from "../lib/useEscapeClose";

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

interface VolumeSettingsModalProps {
  onClose: () => void;
  theme: string;
  config: { upColor: string, downColor: string, maColor: string };
  onChangeConfig: (newConfig: { upColor: string, downColor: string, maColor: string }) => void;
}

export default function VolumeSettingsModal({ onClose, theme, config, onChangeConfig }: VolumeSettingsModalProps) {
  // Changes show live; Cancel / Escape / ✕ / a click outside put the original colours back
  const initialRef = React.useRef(config);
  const cancel = () => { onChangeConfig(initialRef.current); onClose(); };
  useEscapeClose(cancel);
  const [activeTab, setActiveTab] = useState<"Inputs" | "Style" | "Visibility">("Inputs");
  const [visibility, setVisibility] = useState({
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
    setVisibility(prev => ({
      ...prev,
      [key]: { ...(prev as any)[key], ...updates }
    }));
  };
  
  const isDark = theme === "dark";
  const bgColor = isDark ? "#1e222d" : "#ffffff";
  const textColor = isDark ? "#d1d4dc" : "#131722";
  const borderColor = isDark ? "#2a2e39" : "#e0e3eb";
  const activeTabColor = isDark ? "#d1d4dc" : "#131722";
  const inactiveTabColor = isDark ? "#787b86" : "#787b86";

  const tabStyle = (tabName: string) => ({
    padding: "10px 16px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: activeTab === tabName ? 600 : 400,
    color: activeTab === tabName ? activeTabColor : inactiveTabColor,
    borderBottom: activeTab === tabName ? `2px solid ${activeTabColor}` : "2px solid transparent",
    transition: "color 0.2s, border-bottom 0.2s"
  });

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10000,
    }} onClick={cancel}>
      <div 
        style={{
          width: "360px",
          backgroundColor: bgColor, borderRadius: "6px",
          display: "flex", flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.24)",
          fontFamily: "Inter, sans-serif",
          color: textColor,
          overflow: "hidden"
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Vol</h2>
          <button onClick={cancel} style={{ background: "none", border: "none", cursor: "pointer", color: textColor, padding: 0 }}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "0 4px", borderBottom: `1px solid ${borderColor}` }}>
          <div style={tabStyle("Inputs")} onClick={() => setActiveTab("Inputs")}>Inputs</div>
          <div style={tabStyle("Style")} onClick={() => setActiveTab("Style")}>Style</div>
          <div style={tabStyle("Visibility")} onClick={() => setActiveTab("Visibility")}>Visibility</div>
        </div>

        {/* Content */}
        <div style={{ padding: "20px", flex: 1, minHeight: "240px", maxHeight: "400px", overflowY: "auto", fontSize: "13px", overflowX: "hidden" }}>
          {activeTab === "Inputs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{ width: "80px" }}>MA Length</span>
                <input type="number" defaultValue={20} style={{ width: "80px", padding: "6px 8px", borderRadius: "4px", border: `1px solid ${borderColor}`, backgroundColor: isDark ? "#131722" : "#ffffff", color: textColor }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input type="checkbox" id="color-based" style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                <label htmlFor="color-based" style={{ cursor: "pointer" }}>Color based on previous close</label>
              </div>
            </div>
          )}

          {activeTab === "Style" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <input type="checkbox" defaultChecked id="volume-chk" style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                  <label htmlFor="volume-chk" style={{ cursor: "pointer" }}>Volume</label>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ width: "60px" }}>Growing</span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <ColorBox color={config.upColor} onChangeColor={(c) => onChangeConfig({ ...config, upColor: c })} theme={theme} />
                      <div style={{ width: "32px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${borderColor}`, borderRadius: "4px", cursor: "pointer" }}>
                        <BarChart2 size={14} color={textColor} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ width: "60px" }}>Falling</span>
                    <ColorBox color={config.downColor} onChangeColor={(c) => onChangeConfig({ ...config, downColor: c })} theme={theme} />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input type="checkbox" id="volume-ma" style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                <label htmlFor="volume-ma" style={{ cursor: "pointer", width: "76px" }}>Volume MA</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <ColorBox color={config.maColor} onChangeColor={(c) => onChangeConfig({ ...config, maColor: c })} theme={theme} />
                  <div style={{ width: "32px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${borderColor}`, borderRadius: "4px", cursor: "pointer" }}>
                    <Activity size={14} color={textColor} />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "12px" }}>
                <span style={{ width: "80px", color: "#787b86", fontSize: "11px", fontWeight: 600 }}>OUTPUT VALUES</span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{ width: "80px" }}>Precision</span>
                <select style={{ flex: 1, padding: "6px 8px", borderRadius: "4px", border: `1px solid ${borderColor}`, backgroundColor: isDark ? "#131722" : "#ffffff", color: textColor }}>
                  <option>Default</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input type="checkbox" defaultChecked id="labels-chk" style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                <label htmlFor="labels-chk" style={{ cursor: "pointer" }}>Labels on price scale</label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input type="checkbox" defaultChecked id="values-chk" style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                <label htmlFor="values-chk" style={{ cursor: "pointer" }}>Values in status line</label>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "4px" }}>
                <span style={{ width: "80px", color: "#787b86", fontSize: "11px", fontWeight: 600 }}>INPUT VALUES</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input type="checkbox" defaultChecked id="inputs-chk" style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                <label htmlFor="inputs-chk" style={{ cursor: "pointer" }}>Inputs in status line</label>
              </div>
            </div>
          )}

          {activeTab === "Visibility" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <CheckBox checked={!!visibility.ticks?.enabled} onChange={(v) => updateVisibility('ticks', { enabled: v })} />
                <span style={{ fontSize: '13px', color: textColor, marginLeft: '8px' }}>Ticks</span>
              </div>
              
              {[
                { id: 'seconds', label: 'Seconds', min: 1, max: 59 },
                { id: 'minutes', label: 'Minutes', min: 1, max: 59 },
                { id: 'hours', label: 'Hours', min: 1, max: 24 },
                { id: 'days', label: 'Days', min: 1, max: 366 },
                { id: 'weeks', label: 'Weeks', min: 1, max: 52 },
                { id: 'months', label: 'Months', min: 1, max: 12 },
              ].map(row => {
                const isEnabled = !!(visibility as any)[row.id]?.enabled;
                return (
                  <div key={row.id} style={{ display: 'flex', alignItems: 'center', opacity: isEnabled ? 1 : 0.4, pointerEvents: isEnabled ? 'auto' : 'none' }}>
                    <div style={{ width: '100px', display: 'flex', alignItems: 'center' }}>
                      <CheckBox checked={isEnabled} onChange={(v) => updateVisibility(row.id, { enabled: v })} />
                      <span style={{ fontSize: '13px', color: textColor, marginLeft: '8px' }}>{row.label}</span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px', flex: 1, alignItems: 'center' }}>
                      <LocalNumberInput 
                        value={((visibility as any)[row.id]?.from || row.min).toString()} 
                        onChange={(v) => updateVisibility(row.id, { from: parseInt(v) || row.min })}
                        style={{ width: '60px', backgroundColor: bgColor, color: textColor, borderColor }} 
                      />
                      
                      <DualRangeSlider 
                        min={row.min} 
                        max={row.max} 
                        from={(visibility as any)[row.id]?.from || row.min} 
                        to={(visibility as any)[row.id]?.to || row.max} 
                        onChange={(from, to) => updateVisibility(row.id, { from, to })} 
                      />
                      
                      <LocalNumberInput 
                        value={((visibility as any)[row.id]?.to || row.max).toString()} 
                        onChange={(v) => updateVisibility(row.id, { to: parseInt(v) || row.max })}
                        style={{ width: '60px', backgroundColor: bgColor, color: textColor, borderColor }} 
                      />
                    </div>
                  </div>
                );
              })}
              
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <CheckBox checked={!!visibility.ranges?.enabled} onChange={(v) => updateVisibility('ranges', { enabled: v })} />
                <span style={{ fontSize: '13px', color: textColor, marginLeft: '8px' }}>Ranges</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${borderColor}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", border: `1px solid ${borderColor}`, borderRadius: "4px", cursor: "pointer", fontSize: "13px" }}>
            Defaults <ChevronDown size={14} />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={cancel} style={{ padding: "8px 16px", borderRadius: "4px", border: `1px solid ${borderColor}`, backgroundColor: "transparent", color: textColor, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
            <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: "4px", border: "none", backgroundColor: "#2962ff", color: "white", cursor: "pointer", fontWeight: 600 }}>Ok</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorBox({ color, onChangeColor, theme }: { color: string, onChangeColor: (c: string) => void, theme: string }) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isDark = theme === "dark";
  const bgColor = isDark ? "#1e222d" : "#ffffff";
  const borderColor = isDark ? "#2a2e39" : "#e0e3eb";
  const textColor = isDark ? "#d1d4dc" : "#131722";

  // Helper function to extract base hex from rgba if needed
  const getBaseColor = (c: string) => {
    if (c.startsWith('rgba')) {
      // Basic extraction, assuming the colors array uses hex
      // For simplicity here, just assume it's valid css
      return c;
    }
    return c;
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    if (showPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPicker]);

  const colors = [
    '#ffffff', '#f8f9fd', '#e0e3eb', '#b2b5be', '#787b86', '#434651', '#2a2e39', '#1e222d', '#131722', '#000000',
    '#ef5350', '#ff9800', '#ffeb3b', '#4caf50', '#26a69a', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63',
    '#f8bbd0', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2dfdb', '#b2ebf2', '#bbdefb', '#d1c4e9', '#e1bee7', '#f48fb1',
    '#f06292', '#ffb74d', '#fff176', '#81c784', '#4db6ac', '#4dd0e1', '#64b5f6', '#9575cd', '#ba68c8', '#f06292',
    '#e53935', '#f57c00', '#fbc02d', '#388e3c', '#00796b', '#0097a7', '#1976d2', '#512da8', '#7b1fa2', '#c2185b',
    '#b71c1c', '#e65100', '#f57f17', '#1b5e20', '#004d40', '#006064', '#0d47a1', '#311b92', '#4a148c', '#880e4f',
  ];

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <div 
        onClick={() => setShowPicker(!showPicker)}
        style={{ 
          width: "32px", height: "24px", backgroundColor: color, 
          borderRadius: "4px", border: `1px solid ${showPicker ? "#2962ff" : borderColor}`,
          cursor: "pointer",
          // Adding outline to match screenshot for active state:
          outline: showPicker ? "2px solid rgba(41, 98, 255, 0.3)" : "none",
          outlineOffset: "1px"
        }} 
      />
      {showPicker && (
        <div 
          ref={pickerRef}
          style={{
            position: "absolute", top: "100%", left: 0, marginTop: "8px",
            backgroundColor: bgColor, borderRadius: "6px",
            border: `1px solid ${borderColor}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: "12px", zIndex: 100, width: "208px"
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "4px" }}>
            {colors.map((c, i) => (
              <div 
                key={i} 
                onClick={() => {
                  // When selecting from grid, apply 50% opacity by default to match original logic
                  // Hex to rgba conversion
                  const hex = c.replace('#', '');
                  let r, g, b;
                  if (hex.length === 3) {
                    r = parseInt(hex[0]+hex[0], 16);
                    g = parseInt(hex[1]+hex[1], 16);
                    b = parseInt(hex[2]+hex[2], 16);
                  } else {
                    r = parseInt(hex.substring(0,2), 16);
                    g = parseInt(hex.substring(2,4), 16);
                    b = parseInt(hex.substring(4,6), 16);
                  }
                  onChangeColor(`rgba(${r}, ${g}, ${b}, 0.5)`);
                }}
                style={{ width: "14px", height: "14px", backgroundColor: c, borderRadius: "2px", border: c === '#ffffff' ? `1px solid ${borderColor}` : "none", cursor: "pointer" }} 
              />
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${borderColor}`, margin: "12px 0 8px 0" }} />
          
          <div style={{ display: "flex", alignItems: "center", marginBottom: "8px", cursor: "pointer", color: textColor }}>
            <Plus size={16} strokeWidth={1.5} />
          </div>

          <div style={{ color: "#787b86", fontSize: "11px", marginBottom: "4px", marginTop: "12px" }}>Opacity</div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1, height: "12px", background: `linear-gradient(to right, transparent, ${color})`, borderRadius: "6px", position: "relative", border: `1px solid ${borderColor}` }}>
              <div style={{ position: "absolute", left: "50%", top: "-3px", width: "16px", height: "16px", backgroundColor: "#fff", border: "2px solid #131722", borderRadius: "50%", transform: "translateX(-50%)", cursor: "pointer" }} />
            </div>
            <div style={{ padding: "2px 6px", border: `1px solid ${borderColor}`, borderRadius: "4px", fontSize: "12px" }}>50%</div>
          </div>

          <div style={{ color: "#787b86", fontSize: "11px", marginBottom: "4px" }}>Thickness</div>
          <div style={{ display: "flex", gap: "4px" }}>
            {[1, 2, 3, 4].map(w => (
              <div key={w} style={{ flex: 1, height: "24px", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${borderColor}`, borderRadius: "4px", backgroundColor: w === 1 ? (isDark ? "#2a2e39" : "#313335") : "transparent", cursor: "pointer" }}>
                <div style={{ width: "16px", height: `${w}px`, backgroundColor: w === 1 ? (isDark ? "#d1d4dc" : "#ffffff") : textColor }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

