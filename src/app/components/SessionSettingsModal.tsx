"use client";

import React, { useState, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { DualRangeSlider } from "./drawing/ui/DualRangeSlider";

const TV_COLORS = [
  ["#ffffff", "#f0f3fa", "#e0e3eb", "#b2b5be", "#787b86", "#434651", "#2a2e39", "#1e222d", "#131722", "#000000"],
  ["#f23645", "#ff9800", "#ffeb3b", "#4caf50", "#089981", "#00bcd4", "#2962ff", "#673ab7", "#9c27b0", "#e91e63"],
  ["#fce8e8", "#fdf0e3", "#fef9e6", "#e8f5e9", "#e2f2ef", "#e0f7fa", "#e8f0fe", "#f3e5f5", "#f8e1f4", "#fce4ec"],
  ["#f8b6b6", "#fbc89a", "#fdf0a4", "#a5d6a7", "#8accc1", "#b2ebf2", "#9bb5fe", "#d1c4e9", "#eab6e6", "#f8bbd0"],
  ["#f27979", "#f99e52", "#fce362", "#66bb6a", "#4db6ac", "#4dd0e1", "#648fff", "#9575cd", "#ce85d6", "#f06292"],
  ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#00897b", "#00acc1", "#1e88e5", "#5e35b1", "#ab47bc", "#d81b60"],
  ["#c62828", "#ef6c00", "#fbc02d", "#2e7d32", "#00695c", "#00838f", "#1565c0", "#4527a0", "#8e24aa", "#ad1457"],
  ["#8e0000", "#e65100", "#f57f17", "#1b5e20", "#004d40", "#006064", "#0d47a1", "#311b92", "#6a1b9a", "#880e4f"],
];

function hexToRgba(hex: string, alpha: number) {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseRgba(colorStr: string) {
  if (!colorStr) return { hex: "#000000", opacity: 100 };
  if (colorStr.startsWith("#")) {
    return { hex: colorStr, opacity: 100 };
  }
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
    return { hex: `#${r}${g}${b}`, opacity: Math.round(alpha * 100) };
  }
  return { hex: "#000000", opacity: 100 };
}

function ColorPickerPopup({ colorStr, onChange, style, isDark }: any) {
  const { hex: initHex, opacity: initOp } = parseRgba(colorStr);
  const [hex, setHex] = useState(initHex);
  const [opacity, setOpacity] = useState(initOp);

  const applyColor = (newHex: string, newOp: number) => {
    setHex(newHex);
    setOpacity(newOp);
    onChange(newOp === 100 ? newHex : hexToRgba(newHex, newOp / 100));
  };

  const bg = isDark ? "#1e222d" : "#ffffff";
  const border = isDark ? "#2a2e39" : "#e0e3eb";
  const text = isDark ? "#d1d4dc" : "#131722";

  return (
    <div 
      style={{
        position: "absolute",
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: "6px",
        padding: "12px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        zIndex: 100000,
        ...style
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation();
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 18px)", gap: "4px" }}>
        {TV_COLORS.map((row, rIdx) => 
          row.map((colHex, cIdx) => (
            <div 
              key={`${rIdx}-${cIdx}`}
              onClick={() => applyColor(colHex, opacity)}
              style={{
                width: "18px", height: "18px",
                backgroundColor: colHex,
                borderRadius: "2px",
                cursor: "pointer",
                border: hex.toLowerCase() === colHex.toLowerCase() ? "2px solid #2962ff" : `1px solid ${isDark ? "#434651" : "#e0e3eb"}`
              }}
            />
          ))
        )}
      </div>

      <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${border}` }}>
        <div style={{ fontSize: "12px", color: text, marginBottom: "8px" }}>Opacity</div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input 
            type="range" min="0" max="100" value={opacity} 
            onChange={(e) => applyColor(hex, parseInt(e.target.value))}
            style={{ flex: 1, accentColor: "#2962ff" }} 
          />
          <div style={{ 
            width: "40px", height: "24px", 
            border: `1px solid ${border}`, borderRadius: "4px", 
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "12px", color: text, backgroundColor: isDark ? "#131722" : "#ffffff" 
          }}>
            {opacity}%
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorSquare({ color, onClick, isDark, isActive }: any) {
  return (
    <div 
      onClick={onClick}
      style={{ 
        width: "28px", height: "28px", 
        border: isActive ? "2px solid #2962ff" : `1px solid ${isDark ? "#434651" : "#e0e3eb"}`, 
        borderRadius: "4px",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#fff",
        backgroundImage: "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAACtJREFUeNpiZGBg4GcgAQxwJqICvFJMTEz/49LQ0BDVwEQrTDRw2AAQYAAAWj0CA6I/uOAAAAAASUVORK5CYII=')",
        backgroundSize: "8px 8px"
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color }} />
    </div>
  );
}

function CheckBox({ checked, onChange, label, subtext, labelStyle }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => onChange(!checked)}>
      <div
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '3px',
          border: checked ? 'none' : '1px solid #b2b5be',
          backgroundColor: checked ? '#2962ff' : 'transparent',
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

export const defaultSessionConfig = {
  asian: { startH: 20, startM: 0, endH: 2, endM: 0, extendH: 11, extendM: 30, borderColor: "blue", borderWidth: 1, borderStyle: "solid", highLowWidth: 2, highLowStyle: "dotted", midColor: "orange", midStyle: "dotted", textColor: "blue", textSize: "normal", bgEnabled: true, bgColor: "rgba(33, 150, 243, 0.1)", fillEnabled: true, fillColor: "rgba(33, 150, 243, 0.1)" },
  london: { show: true, showPips: true, startH: 3, startM: 0, endH: 7, endM: 0, borderColor: "teal", borderWidth: 1, borderStyle: "solid", highLowWidth: 2, highLowStyle: "dotted", midColor: "teal", midStyle: "dotted", textColor: "teal", textSize: "normal", bgEnabled: true, bgColor: "rgba(0, 150, 136, 0.1)", fillEnabled: true, fillColor: "rgba(0, 150, 136, 0.1)" },
  ny: { show: true, showPips: true, startH: 8, startM: 0, endH: 12, endM: 0, borderColor: "silver", borderWidth: 1, borderStyle: "solid", highLowWidth: 2, highLowStyle: "dotted", midColor: "silver", midStyle: "dotted", textColor: "silver", textSize: "normal", bgEnabled: true, bgColor: "rgba(158, 158, 158, 0.1)", fillEnabled: true, fillColor: "rgba(158, 158, 158, 0.1)" },
  adr: { show: true, asPips: true, days: 1, length: 21 },
  prevDay: { show: true, color: "yellow", width: 1, style: "dashed", showRange: false, showLabel: false },
  lastWeek: { show: true, color: "orange", width: 1, style: "dashed", showLabel: true },
  thisWeek: { show: false, color: "olive", width: 1, style: "dashed", showLabel: false },
  timeOfDay: false,
  styleConfig: { paneLabels: true, lines: true, precision: "Default", labelsScale: true, valuesStatus: true },
  visibility: { 
    seconds: { enabled: true, from: 1, to: 59 },
    minutes: { enabled: true, from: 1, to: 59 },
    hours: { enabled: true, from: 1, to: 24 },
    days: { enabled: true, from: 1, to: 366 },
    weeks: { enabled: true, from: 1, to: 52 },
    months: { enabled: true, from: 1, to: 12 }
  }
};

export default function SessionSettingsModal({ isOpen, onClose, config, onSave, theme }: any) {
  const [activeTab, setActiveTab] = useState("Style");
  const [localConfig, setLocalConfig] = useState(config || defaultSessionConfig);
  const [colorPickerOpen, setColorPickerOpen] = useState("");
  
  useEffect(() => {
    const handleClick = () => setColorPickerOpen("");
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);
  
  useEffect(() => {
    if (isOpen) setLocalConfig(config || defaultSessionConfig);
  }, [isOpen, config]);

  if (!isOpen) return null;

  const isDark = theme === "dark";
  const bg = isDark ? "#1e222d" : "#ffffff";
  const text = isDark ? "#d1d4dc" : "#131722";
  const border = isDark ? "#2a2e39" : "#e0e3eb";
  const sectionColor = isDark ? "#787b86" : "#787b86";

  const handleUpdate = (section: string, field: string, value: any) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
  };

  const updateVisibility = (id: string, updates: any) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      visibility: {
        ...prev.visibility,
        [id]: {
          ...prev.visibility[id],
          ...updates
        }
      }
    }));
  };

  const visibility = localConfig.visibility || {};

  const hourOptions = Array.from({length: 24}, (_, i) => ({ value: i, label: i.toString().padStart(2, '0') }));
  const minuteOptions = Array.from({length: 60}, (_, i) => ({ value: i, label: i.toString().padStart(2, '0') }));
  const colorOptions = ["blue", "teal", "silver", "orange", "yellow", "olive", "red", "green", "black", "white"];
  const styleOptions = ["solid", "dotted", "dashed"];
  const sizeOptions = ["small", "normal", "large"];

  const renderSessionInputs = (key: string, name: string) => {
    const s = localConfig[key];
    const isAsian = key === "asian";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
        {!isAsian && (
          <CheckBox checked={s.show} onChange={(v: any) => handleUpdate(key, "show", v)} label={`Show ${name} Session Box`} labelStyle={{ color: text }} />
        )}
        {(!isAsian && s.show) && (
          <CheckBox checked={s.showPips} onChange={(v: any) => handleUpdate(key, "showPips", v)} label={`Show ${name} Session Range Pips`} labelStyle={{ color: text }} />
        )}
        
        {(isAsian || s.show) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", alignItems: "center", gap: "12px", marginLeft: isAsian ? 0 : "24px" }}>
            <span style={{ fontSize: "13px" }}>{isAsian ? "Start Session" : `${name} Start`} Hour (EST)</span>
            <SelectDropdown value={s.startH} options={hourOptions} onChange={(v: any) => handleUpdate(key, "startH", parseInt(v))} theme={theme} />
            <span style={{ fontSize: "13px" }}>{isAsian ? "Start Session" : `${name} Start`} Minute (EST)</span>
            <SelectDropdown value={s.startM} options={minuteOptions} onChange={(v: any) => handleUpdate(key, "startM", parseInt(v))} theme={theme} />
            
            <span style={{ fontSize: "13px" }}>{isAsian ? "End Session" : `${name} End`} Hour (EST)</span>
            <SelectDropdown value={s.endH} options={hourOptions} onChange={(v: any) => handleUpdate(key, "endH", parseInt(v))} theme={theme} />
            <span style={{ fontSize: "13px" }}>{isAsian ? "End Session" : `${name} End`} Minute (EST)</span>
            <SelectDropdown value={s.endM} options={minuteOptions} onChange={(v: any) => handleUpdate(key, "endM", parseInt(v))} theme={theme} />

            {isAsian && (
              <>
                <span style={{ fontSize: "13px" }}>Extend Session Lines Until Hour (EST)</span>
                <SelectDropdown value={s.extendH} options={hourOptions} onChange={(v: any) => handleUpdate(key, "extendH", parseInt(v))} theme={theme} />
                <span style={{ fontSize: "13px" }}>Extend Session Lines Until Minute (EST)</span>
                <SelectDropdown value={s.extendM} options={minuteOptions} onChange={(v: any) => handleUpdate(key, "extendM", parseInt(v))} theme={theme} />
              </>
            )}

            <span style={{ fontSize: "13px" }}>{name} Range Border Color</span>
            <SelectDropdown value={s.borderColor} options={colorOptions} onChange={(v: any) => handleUpdate(key, "borderColor", v)} theme={theme} />
            
            <span style={{ fontSize: "13px" }}>{name} Box Line Width</span>
            <LocalNumberInput value={s.borderWidth.toString()} onChange={(v: string) => handleUpdate(key, "borderWidth", parseInt(v) || 1)} style={{ backgroundColor: isDark ? "#131722" : "#ffffff", borderColor: border, color: text }} />
            
            <span style={{ fontSize: "13px" }}>{name} Box Line Style</span>
            <SelectDropdown value={s.borderStyle} options={styleOptions} onChange={(v: any) => handleUpdate(key, "borderStyle", v)} theme={theme} />

            <span style={{ fontSize: "13px" }}>Session High / Low / Mid Line Width</span>
            <LocalNumberInput value={s.highLowWidth.toString()} onChange={(v: string) => handleUpdate(key, "highLowWidth", parseInt(v) || 1)} style={{ backgroundColor: isDark ? "#131722" : "#ffffff", borderColor: border, color: text }} />

            <span style={{ fontSize: "13px" }}>Session High / Low Line Style</span>
            <SelectDropdown value={s.highLowStyle} options={styleOptions} onChange={(v: any) => handleUpdate(key, "highLowStyle", v)} theme={theme} />

            <span style={{ fontSize: "13px" }}>Middle Range Line Color</span>
            <SelectDropdown value={s.midColor} options={colorOptions} onChange={(v: any) => handleUpdate(key, "midColor", v)} theme={theme} />

            <span style={{ fontSize: "13px" }}>Middle Range Line Style</span>
            <SelectDropdown value={s.midStyle} options={styleOptions} onChange={(v: any) => handleUpdate(key, "midStyle", v)} theme={theme} />

            <span style={{ fontSize: "13px" }}>Text Color</span>
            <SelectDropdown value={s.textColor} options={colorOptions} onChange={(v: any) => handleUpdate(key, "textColor", v)} theme={theme} />

            <span style={{ fontSize: "13px" }}>Text Size</span>
            <SelectDropdown value={s.textSize} options={sizeOptions} onChange={(v: any) => handleUpdate(key, "textSize", v)} theme={theme} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.5)", zIndex: 99999, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: "420px", maxHeight: "80vh", backgroundColor: bg, borderRadius: "8px", display: "flex", flexDirection: "column", boxShadow: "0 2px 5px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${border}` }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: text }}>Asian Session Range</h2>
          <X size={20} color={isDark ? "#787b86" : "#131722"} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "0 20px", borderBottom: `1px solid ${border}` }}>
          {["Inputs", "Style", "Visibility"].map(tab => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "16px 12px", cursor: "pointer", fontSize: "14px", fontWeight: "500",
                color: activeTab === tab ? (isDark ? "#2962ff" : "#2962ff") : (isDark ? "#787b86" : "#131722"),
                borderBottom: activeTab === tab ? "2px solid #2962ff" : "2px solid transparent",
                marginBottom: "-1px"
              }}
            >
              {tab}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "20px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px", color: text }}>
          
          {activeTab === "Inputs" && (
            <>
              {renderSessionInputs("asian", "Asian")}
              <hr style={{ borderColor: border, margin: "0" }} />
              {renderSessionInputs("london", "London")}
              <hr style={{ borderColor: border, margin: "0" }} />
              {renderSessionInputs("ny", "New York")}
              <hr style={{ borderColor: border, margin: "0" }} />

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
                <CheckBox checked={localConfig.adr.show} onChange={(v: any) => handleUpdate("adr", "show", v)} label="Show Average Daily Range" labelStyle={{ color: text }} />
                <CheckBox checked={localConfig.adr.asPips} onChange={(v: any) => handleUpdate("adr", "asPips", v)} label="Display average range as forex pips?" labelStyle={{ color: text }} />
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "13px" }}>Show ADR for x days</span>
                  <LocalNumberInput value={localConfig.adr.days.toString()} onChange={(v: string) => handleUpdate("adr", "days", parseInt(v) || 1)} style={{ backgroundColor: isDark ? "#131722" : "#ffffff", borderColor: border, color: text }} />
                  <span style={{ fontSize: "13px" }}>ADR Length parameter (Days - default 3 weeks, 21 days)</span>
                  <LocalNumberInput value={localConfig.adr.length.toString()} onChange={(v: string) => handleUpdate("adr", "length", parseInt(v) || 21)} style={{ backgroundColor: isDark ? "#131722" : "#ffffff", borderColor: border, color: text }} />
                </div>

                <CheckBox checked={localConfig.prevDay.show} onChange={(v: any) => handleUpdate("prevDay", "show", v)} label="Show Previous Days High / Low" labelStyle={{ color: text }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", alignItems: "center", gap: "12px", marginLeft: "24px" }}>
                  <span style={{ fontSize: "13px" }}>Previous Days Line Color</span>
                  <SelectDropdown value={localConfig.prevDay.color} options={colorOptions} onChange={(v: any) => handleUpdate("prevDay", "color", v)} theme={theme} />
                  <span style={{ fontSize: "13px" }}>Previous Days Line Width</span>
                  <LocalNumberInput value={localConfig.prevDay.width.toString()} onChange={(v: string) => handleUpdate("prevDay", "width", parseInt(v) || 1)} style={{ backgroundColor: isDark ? "#131722" : "#ffffff", borderColor: border, color: text }} />
                  <span style={{ fontSize: "13px" }}>Previous Days Line Style</span>
                  <SelectDropdown value={localConfig.prevDay.style} options={styleOptions} onChange={(v: any) => handleUpdate("prevDay", "style", v)} theme={theme} />
                </div>
                <CheckBox checked={localConfig.prevDay.showRange} onChange={(v: any) => handleUpdate("prevDay", "showRange", v)} label="Show Previous Days Range" labelStyle={{ color: text }} />
                <CheckBox checked={localConfig.prevDay.showLabel} onChange={(v: any) => handleUpdate("prevDay", "showLabel", v)} label="Show Line Label (YH / YL)" labelStyle={{ color: text }} />

                <CheckBox checked={localConfig.lastWeek.show} onChange={(v: any) => handleUpdate("lastWeek", "show", v)} label="Show Last Weeks High / Low" labelStyle={{ color: text }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", alignItems: "center", gap: "12px", marginLeft: "24px" }}>
                  <span style={{ fontSize: "13px" }}>Last Week Line Color</span>
                  <SelectDropdown value={localConfig.lastWeek.color} options={colorOptions} onChange={(v: any) => handleUpdate("lastWeek", "color", v)} theme={theme} />
                  <span style={{ fontSize: "13px" }}>Last Week Line Width</span>
                  <LocalNumberInput value={localConfig.lastWeek.width.toString()} onChange={(v: string) => handleUpdate("lastWeek", "width", parseInt(v) || 1)} style={{ backgroundColor: isDark ? "#131722" : "#ffffff", borderColor: border, color: text }} />
                  <span style={{ fontSize: "13px" }}>Last Week Line Style</span>
                  <SelectDropdown value={localConfig.lastWeek.style} options={styleOptions} onChange={(v: any) => handleUpdate("lastWeek", "style", v)} theme={theme} />
                </div>
                <CheckBox checked={localConfig.lastWeek.showLabel} onChange={(v: any) => handleUpdate("lastWeek", "showLabel", v)} label="Show Line Label (PWH / PWL)" labelStyle={{ color: text }} />

                <CheckBox checked={localConfig.thisWeek.show} onChange={(v: any) => handleUpdate("thisWeek", "show", v)} label="Show This Weeks High / Low" labelStyle={{ color: text }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", alignItems: "center", gap: "12px", marginLeft: "24px" }}>
                  <span style={{ fontSize: "13px" }}>This Weeks Line Color</span>
                  <SelectDropdown value={localConfig.thisWeek.color} options={colorOptions} onChange={(v: any) => handleUpdate("thisWeek", "color", v)} theme={theme} />
                  <span style={{ fontSize: "13px" }}>This Weeks Line Width</span>
                  <LocalNumberInput value={localConfig.thisWeek.width.toString()} onChange={(v: string) => handleUpdate("thisWeek", "width", parseInt(v) || 1)} style={{ backgroundColor: isDark ? "#131722" : "#ffffff", borderColor: border, color: text }} />
                  <span style={{ fontSize: "13px" }}>This Weeks Line Style</span>
                  <SelectDropdown value={localConfig.thisWeek.style} options={styleOptions} onChange={(v: any) => handleUpdate("thisWeek", "style", v)} theme={theme} />
                </div>
                <CheckBox checked={localConfig.thisWeek.showLabel} onChange={(v: any) => handleUpdate("thisWeek", "showLabel", v)} label="Show Line Label (WH / WL)" labelStyle={{ color: text }} />

                <CheckBox checked={localConfig.timeOfDay} onChange={(v: any) => setLocalConfig({...localConfig, timeOfDay: v})} label="Show Hi / Low Time of Day (Always Displays Eastern Standard Time)" labelStyle={{ color: text }} />
              </div>
            </>
          )}

          {activeTab === "Style" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {[
                { key: "asian", field: "bgColor", label: "Asian Session Background Color" },
                { key: "london", field: "bgColor", label: "London Session Background Color" },
                { key: "ny", field: "bgColor", label: "New York Session Background Color" },
                { key: "asian", field: "fillColor", label: "Fill Asian Range Color" },
                { key: "london", field: "fillColor", label: "Fill London Range Color" },
                { key: "ny", field: "fillColor", label: "Fill New York Range Color" },
              ].map((item, idx) => {
                const pickerId = `${item.key}-${item.field}`;
                const isActive = colorPickerOpen === pickerId;
                return (
                  <div key={pickerId} style={{ display: "flex", flexDirection: "column", gap: "8px", position: "relative" }}>
                    <CheckBox checked={localConfig[item.key][item.field.replace('Color', 'Enabled')]} onChange={(v: any) => handleUpdate(item.key, item.field.replace('Color', 'Enabled'), v)} label={item.label} labelStyle={{ color: text }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "28px" }}>
                      <span style={{ fontSize: "13px" }}>Color {idx % 3}</span>
                      <ColorSquare 
                        color={localConfig[item.key][item.field]} 
                        isDark={isDark} 
                        isActive={isActive}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation();
                          setColorPickerOpen(isActive ? "" : pickerId);
                        }} 
                      />
                      {isActive && (
                        <ColorPickerPopup 
                          colorStr={localConfig[item.key][item.field]} 
                          onChange={(c: string) => handleUpdate(item.key, item.field, c)} 
                          isDark={isDark}
                          style={{ top: "34px", left: "60px" }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              
              <div style={{ fontSize: "11px", color: sectionColor, textTransform: "uppercase", fontWeight: 600, marginTop: "8px" }}>Graphic Objects</div>
              <CheckBox checked={localConfig.styleConfig.paneLabels} onChange={(v: any) => handleUpdate("styleConfig", "paneLabels", v)} label="Pane labels" labelStyle={{ color: text }} />
              <CheckBox checked={localConfig.styleConfig.lines} onChange={(v: any) => handleUpdate("styleConfig", "lines", v)} label="Lines" labelStyle={{ color: text }} />

              <div style={{ fontSize: "11px", color: sectionColor, textTransform: "uppercase", fontWeight: 600, marginTop: "8px" }}>Output Values</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "13px" }}>Precision</span>
                <SelectDropdown value={localConfig.styleConfig.precision} options={["Default", "0", "1", "2", "3", "4", "5", "6", "7", "8"]} onChange={(v: any) => handleUpdate("styleConfig", "precision", v)} theme={theme} />
              </div>
              <CheckBox checked={localConfig.styleConfig.labelsScale} onChange={(v: any) => handleUpdate("styleConfig", "labelsScale", v)} label="Labels on price scale" labelStyle={{ color: text }} />
              <CheckBox checked={localConfig.styleConfig.valuesStatus} onChange={(v: any) => handleUpdate("styleConfig", "valuesStatus", v)} label="Values in status line" labelStyle={{ color: text }} />
              <CheckBox checked={localConfig.styleConfig.inputsStatus} onChange={(v: any) => handleUpdate("styleConfig", "inputsStatus", v)} label="Inputs in status line" labelStyle={{ color: text }} />
            </div>
          )}

          {activeTab === "Visibility" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <CheckBox checked={!!visibility.ticks?.enabled} onChange={(v: boolean) => updateVisibility('ticks', { enabled: v })} label="Ticks" labelStyle={{ color: text }} />
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
                      <CheckBox checked={isEnabled} onChange={(v: boolean) => updateVisibility(row.id, { enabled: v })} label={row.label} labelStyle={{ color: text }} />
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px', flex: 1, alignItems: 'center' }}>
                      <LocalNumberInput 
                        value={((visibility as any)[row.id]?.from || row.min).toString()} 
                        onChange={(v: string) => updateVisibility(row.id, { from: parseInt(v) || row.min })}
                        style={{ width: '60px', backgroundColor: bg, color: text, borderColor: border }} 
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
                        style={{ width: '60px', backgroundColor: bg, color: text, borderColor: border }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderTop: `1px solid ${border}` }}>
          <div style={{ fontSize: "14px", color: isDark ? "#2962ff" : "#2962ff", cursor: "pointer" }} onClick={() => setLocalConfig(defaultSessionConfig)}>Defaults</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={onClose} style={{ padding: "8px 24px", borderRadius: "4px", border: `1px solid ${border}`, backgroundColor: "transparent", color: text, cursor: "pointer", fontSize: "14px" }}>Cancel</button>
            <button onClick={() => onSave(localConfig)} style={{ padding: "8px 24px", borderRadius: "4px", border: "none", backgroundColor: "#2962ff", color: "white", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}>Ok</button>
          </div>
        </div>

      </div>
    </div>
  );
}
