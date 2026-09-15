"use client";
import { useState, useEffect, useRef } from "react";
import { Calendar, Settings, Maximize2, ChevronDown, Minus } from "lucide-react";
import GoToModal from "./GoToModal";
import PaperTradingPanel from "./PaperTradingPanel";

export default function BottomPanel({ theme }: { theme?: string }) {
  const [showGoTo, setShowGoTo] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState("00:00");
  const [clock, setClock] = useState("");
  const timeRanges = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "All"];
  const [activeRange, setActiveRange] = useState("All");

  const [activeTab, setActiveTab] = useState("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const startHeight = useRef(0);

  const isDark = theme === 'dark';
  const bg = isDark ? '#1e222d' : '#ffffff';
  const text = isDark ? '#d1d4dc' : '#131722';
  const textMuted = isDark ? '#787b86' : '#787b86';
  const border = isDark ? '#2a2e39' : '#e0e3eb';
  const hoverBg = isDark ? '#2a2e39' : '#f0f3fa';

  const bottomTabs = ["Trading Panel"];

  const handleTabClick = (tab: string) => {
    if (activeTab === tab && isPanelOpen) {
      setIsPanelOpen(false);
      setActiveTab("");
    } else {
      setActiveTab(tab);
      setIsPanelOpen(true);
    }
  };

  // Live ticking clock — reflects the chart's selected timezone (from the "UTC" dropdown),
  // kept in sync via localStorage + a same-tab custom event since ChartContainer owns the state.
  const [clockTimezone, setClockTimezone] = useState<string>('UTC');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tv:chartTimezone');
      if (stored) { setClockTimezone(stored); return; }
    } catch { /* ignore */ }
    try { setClockTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const handleChange = (e: Event) => {
      const tz = (e as CustomEvent).detail;
      if (typeof tz === 'string') setClockTimezone(tz);
    };
    window.addEventListener('tv:timezone-changed', handleChange);
    return () => window.removeEventListener('tv:timezone-changed', handleChange);
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const zone = clockTimezone === 'exchange' ? 'UTC' : clockTimezone;
      let h = '00', m = '00', s = '00', offsetLabel = 'UTC';
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: zone, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).formatToParts(now);
        const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
        h = get('hour') === '24' ? '00' : get('hour');
        m = get('minute');
        s = get('second');

        const offsetParts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now);
        const gmt = offsetParts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
        offsetLabel = gmt.replace('GMT', 'UTC').replace(/^UTC$/, 'UTC+0');
      } catch { /* ignore */ }
      setClock(`${h}:${m}:${s} ${offsetLabel}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [clockTimezone]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = dragStartY.current - e.clientY;
      const newHeight = Math.max(100, Math.min(window.innerHeight - 150, startHeight.current + deltaY));
      setPanelHeight(newHeight);
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Expanded Panel */}
      {isPanelOpen && activeTab === "Trading Panel" && (
        <div style={{
          position: "absolute",
          bottom: "100%", // Appears right above the bottom bar
          left: 0,
          right: 0,
          height: `${panelHeight}px`,
          backgroundColor: bg,
          borderTop: `1px solid ${border}`,
          display: "flex",
          flexDirection: "column",
          zIndex: 1000
        }}>
          {/* Resize Handle */}
          <div 
            style={{ 
              height: "4px", width: "100%", cursor: "ns-resize", backgroundColor: isDragging ? '#2962ff' : 'transparent',
              position: "absolute", top: "-2px", zIndex: 1001
            }}
            onMouseDown={(e) => {
              setIsDragging(true);
              dragStartY.current = e.clientY;
              startHeight.current = panelHeight;
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2962ff'}
            onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.backgroundColor = 'transparent' }}
          />

          {activeTab === "Trading Panel" && (
            <PaperTradingPanel 
              theme={theme} 
              onClose={() => { setIsPanelOpen(false); setActiveTab(""); }} 
            />
          )}
        </div>
      )}

      {/* Main Bottom Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", height: "100%", fontSize: "12px" }}>
        
        {/* Left Tools */}
        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          {bottomTabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => handleTabClick(tab)}
              style={{
                background: "transparent",
                border: "none",
                color: activeTab === tab && isPanelOpen ? text : textMuted,
                fontWeight: activeTab === tab && isPanelOpen ? 600 : 400,
                padding: "0 12px",
                height: "100%",
                cursor: "pointer",
                fontSize: "12px"
              }}
              onMouseEnter={(e) => { if (!(activeTab === tab && isPanelOpen)) e.currentTarget.style.color = text; }}
              onMouseLeave={(e) => { if (!(activeTab === tab && isPanelOpen)) e.currentTarget.style.color = textMuted; }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Right Ranges & Clock */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          {timeRanges.map((range, i) => (
            <button 
              key={i} 
              className={`tv-icon-btn ${range === activeRange ? "active" : ""}`} 
              style={{ width: "auto", padding: "0 5px", height: "22px", fontSize: "12px", fontWeight: range === activeRange ? 700 : 400 }}
              onClick={() => setActiveRange(range)}
            >
              {range}
            </button>
          ))}
          <div className="tv-divider-v" style={{ height: "14px", margin: "0 4px" }} />
          <button 
            className="tv-icon-btn" 
            style={{ width: "22px", height: "22px", marginRight: "8px" }} 
            title="Go to..."
            onClick={() => setShowGoTo(true)}
          >
            <Calendar size={14} strokeWidth={2} />
          </button>
          
          <div
            title="Change the time zone"
            data-timezone-toggle
            onClick={() => window.dispatchEvent(new CustomEvent('tv:open-timezone-menu'))}
            style={{ fontSize: "12px", color: textMuted, fontWeight: 400, paddingRight: "4px", cursor: "pointer" }}
            onMouseEnter={(e) => e.currentTarget.style.color = text}
            onMouseLeave={(e) => e.currentTarget.style.color = textMuted}
          >
            {clock}
          </div>
        </div>
      </div>

      {showGoTo && (
        <GoToModal 
          onClose={() => setShowGoTo(false)} 
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          selectedTime={selectedTime}
          setSelectedTime={setSelectedTime}
        />
      )}
    </div>
  );
}
