"use client";

import React, { useState, useEffect } from "react";
import { X, ChevronDown, Plus, Activity } from "lucide-react";
import { DualRangeSlider } from "./drawing/ui/DualRangeSlider";
import { useEscapeClose } from "../lib/useEscapeClose";

function CheckBox({ checked, onChange, label, subtext, labelStyle }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => onChange(!checked)}>
      <div
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '3px',
          border: checked ? 'none' : '1px solid #b2b5be',
          backgroundColor: checked ? '#2962ff' : 'transparent', // The EMA screenshot shows a blue checkbox
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        )}
      </div>
      {(label || subtext) && (
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '12px' }}>
          {label && <span style={{ fontSize: '13px', color: labelStyle?.color || 'inherit' }}>{label}</span>}
          {subtext && <span style={{ fontSize: '11px', color: '#787b86' }}>{subtext}</span>}
        </div>
      )}
    </div>
  );
}

function LocalNumberInput({ value, onChange, style }: any) {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);
  const handleBlur = () => { if (onChange && localVal !== value) onChange(localVal); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <input
      type="text"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        height: '34px',
        border: '1px solid #e0e3eb',
        borderRadius: '4px',
        padding: '0 12px',
        fontSize: '13px',
        color: '#131722',
        outline: 'none',
        ...style
      }}
    />
  );
}

function SelectDropdown({ value, options, onChange, style, theme }: any) {
  const isDark = theme === "dark";
  return (
    <div style={{ position: "relative", width: "100%", ...style }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: "34px",
          appearance: "none",
          border: `1px solid ${isDark ? "#2a2e39" : "#e0e3eb"}`,
          borderRadius: "4px",
          backgroundColor: isDark ? "#131722" : "#ffffff",
          color: isDark ? "#d1d4dc" : "#131722",
          fontSize: "13px",
          padding: "0 32px 0 12px",
          outline: "none",
          cursor: "pointer"
        }}
      >
        {options.map((opt: any) => (
          <option key={opt.value || opt} value={opt.value || opt}>
            {opt.label || opt}
          </option>
        ))}
      </select>
      <ChevronDown 
        size={14} 
        color={isDark ? "#787b86" : "#787b86"} 
        style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} 
      />
    </div>
  );
}

interface EmaSettingsModalProps {
  onClose: () => void;
  theme: string;
  config: { length: number; source: string; offset: number; color: string };
  onChangeConfig: (newConfig: any) => void;
}

export default function EmaSettingsModal({ onClose, theme, config, onChangeConfig }: EmaSettingsModalProps) {
  useEscapeClose(onClose);
  const [activeTab, setActiveTab] = useState<"Inputs" | "Style" | "Visibility">("Inputs");
  
  const isDark = theme === "dark";
  const bgColor = isDark ? "#1e222d" : "#ffffff";
  const textColor = isDark ? "#d1d4dc" : "#131722";
  const borderColor = isDark ? "#2a2e39" : "#e0e3eb";
  const sectionLabelColor = "#787b86";

  const [localConfig, setLocalConfig] = useState(config);

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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div 
        style={{ 
          width: "360px", 
          backgroundColor: bgColor, 
          borderRadius: "8px", 
          boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.5)" : "0 4px 12px rgba(0,0,0,0.15)",
          border: `1px solid ${borderColor}`,
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          color: textColor,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px 0 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>EMA</h2>
          <X size={20} color={textColor} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "0 20px", borderBottom: `1px solid ${borderColor}`, gap: "20px" }}>
          {(["Inputs", "Style", "Visibility"] as const).map(tab => (
            <div 
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 0",
                fontSize: "14px",
                fontWeight: activeTab === tab ? 600 : 400,
                color: textColor,
                cursor: "pointer",
                borderBottom: activeTab === tab ? `2px solid ${textColor}` : "2px solid transparent",
                marginBottom: "-1px"
              }}
            >
              {tab}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "20px", maxHeight: "450px", overflowY: "auto" }}>
          {activeTab === "Inputs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ width: "120px", fontSize: "13px" }}>Length</span>
                <LocalNumberInput value={localConfig.length.toString()} onChange={(v: string) => setLocalConfig({...localConfig, length: parseInt(v) || 9})} style={{ width: "120px", backgroundColor: isDark ? "#131722" : "#ffffff", borderColor, color: textColor }} />
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ width: "120px", fontSize: "13px" }}>Source</span>
                <SelectDropdown value="Close" options={["Close", "Open", "High", "Low"]} style={{ width: "120px" }} theme={theme} />
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ width: "120px", fontSize: "13px" }}>Offset</span>
                <LocalNumberInput value="0" style={{ width: "120px", backgroundColor: isDark ? "#131722" : "#ffffff", borderColor, color: textColor }} />
              </div>
              
              <div style={{ marginTop: "8px", fontSize: "11px", color: sectionLabelColor, textTransform: "uppercase", fontWeight: 500 }}>Smoothing</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ width: "120px", fontSize: "13px" }}>Type</span>
                <SelectDropdown value="None" options={["None", "SMA", "EMA"]} style={{ width: "120px" }} theme={theme} />
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ width: "120px", fontSize: "13px" }}>Length</span>
                <LocalNumberInput value="14" style={{ width: "120px", backgroundColor: isDark ? "#2a2e39" : "#f0f3fa", borderColor, color: textColor }} />
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ width: "120px", fontSize: "13px" }}>BB StdDev</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <LocalNumberInput value="2" style={{ width: "120px", backgroundColor: isDark ? "#2a2e39" : "#f0f3fa", borderColor, color: textColor }} />
                  <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: sectionLabelColor, color: bgColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "bold" }}>i</div>
                </div>
              </div>

              <div style={{ marginTop: "8px", fontSize: "11px", color: sectionLabelColor, textTransform: "uppercase", fontWeight: 500 }}>Calculation</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ width: "120px", fontSize: "13px" }}>Timeframe</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <SelectDropdown value="Chart" options={["Chart", "1m", "5m", "15m", "1h"]} style={{ width: "120px" }} theme={theme} />
                  <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: sectionLabelColor, color: bgColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "bold" }}>?</div>
                </div>
              </div>
              <div style={{ marginTop: "4px" }}>
                <CheckBox checked={true} onChange={() => {}} label="Wait for timeframe closes" labelStyle={{ color: textColor }} />
              </div>
            </div>
          )}

          {activeTab === "Style" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <CheckBox checked={true} onChange={() => {}} label="EMA" labelStyle={{ color: textColor }} />
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{ display: "flex", border: `1px solid ${borderColor}`, borderRadius: "4px", padding: "4px", alignItems: "center" }}>
                    <div style={{ width: "24px", height: "24px", backgroundColor: localConfig.color, borderRadius: "2px", cursor: "pointer", position: "relative" }}>
                      <input type="color" value={localConfig.color} onChange={e => setLocalConfig({...localConfig, color: e.target.value})} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                    </div>
                    <div style={{ width: "1px", height: "24px", backgroundColor: borderColor, margin: "0 8px" }} />
                    <div style={{ width: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <div style={{ width: "24px", height: "2px", backgroundColor: localConfig.color }} />
                    </div>
                  </div>
                  <div style={{ width: "34px", height: "34px", border: `1px solid ${borderColor}`, borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Activity size={18} color={textColor} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "8px", fontSize: "11px", color: sectionLabelColor, textTransform: "uppercase", fontWeight: 500 }}>Output Values</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ width: "120px", fontSize: "13px" }}>Precision</span>
                <SelectDropdown value="Default" options={["Default", "0", "1", "2", "3", "4", "5", "6", "7", "8"]} style={{ width: "120px" }} theme={theme} />
              </div>
              <CheckBox checked={true} onChange={() => {}} label="Labels on price scale" labelStyle={{ color: textColor }} />
              <CheckBox checked={true} onChange={() => {}} label="Values in status line" labelStyle={{ color: textColor }} />

              <div style={{ marginTop: "8px", fontSize: "11px", color: sectionLabelColor, textTransform: "uppercase", fontWeight: 500 }}>Input Values</div>
              <CheckBox checked={true} onChange={() => {}} label="Inputs in status line" labelStyle={{ color: textColor }} />
            </div>
          )}

          {activeTab === "Visibility" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <CheckBox checked={!!visibility.ticks?.enabled} onChange={(v: boolean) => updateVisibility('ticks', { enabled: v })} label="Ticks" labelStyle={{ color: textColor }} />
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
                      <CheckBox checked={isEnabled} onChange={(v: boolean) => updateVisibility(row.id, { enabled: v })} label={row.label} labelStyle={{ color: textColor }} />
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px', flex: 1, alignItems: 'center' }}>
                      <LocalNumberInput 
                        value={((visibility as any)[row.id]?.from || row.min).toString()} 
                        onChange={(v: string) => updateVisibility(row.id, { from: parseInt(v) || row.min })}
                        style={{ width: '60px', backgroundColor: bgColor, color: textColor, borderColor }} 
                      />
                      
                      <DualRangeSlider 
                        min={row.min} 
                        max={row.max} 
                        from={(visibility as any)[row.id]?.from || row.min} 
                        to={(visibility as any)[row.id]?.to || row.max} 
                        onChange={(from: number, to: number) => updateVisibility(row.id, { from, to })} 
                      />
                      
                      <LocalNumberInput 
                        value={((visibility as any)[row.id]?.to || row.max).toString()} 
                        onChange={(v: string) => updateVisibility(row.id, { to: parseInt(v) || row.max })}
                        style={{ width: '60px', backgroundColor: bgColor, color: textColor, borderColor }} 
                      />
                    </div>
                  </div>
                );
              })}
              
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <CheckBox checked={!!visibility.ranges?.enabled} onChange={(v: boolean) => updateVisibility('ranges', { enabled: v })} label="Ranges" labelStyle={{ color: textColor }} />
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
            <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: "4px", border: `1px solid ${borderColor}`, backgroundColor: "transparent", color: textColor, cursor: "pointer", fontWeight: 500, fontSize: "14px" }}>Cancel</button>
            <button onClick={() => { onChangeConfig(localConfig); onClose(); }} style={{ padding: "8px 24px", borderRadius: "4px", border: "none", backgroundColor: isDark ? "#2962ff" : "#131722", color: "white", cursor: "pointer", fontWeight: 500, fontSize: "14px" }}>Ok</button>
          </div>
        </div>
      </div>
    </div>
  );
}
