"use client";

import React, { useState, useRef, useEffect } from "react";
import { useReplay } from "./ReplayContext";

const SPEED_OPTIONS = [
  { label: "10x", desc: "10 upd per 1 sec", value: 10 },
  { label: "7x", desc: "7 upd per 1 sec", value: 7 },
  { label: "5x", desc: "5 upd per 1 sec", value: 5 },
  { label: "3x", desc: "3 upd per 1 sec", value: 3 },
  { label: "1x", desc: "1 upd per 1 sec", value: 1 },
  { label: "0.5x", desc: "1 upd per 2 sec", value: 0.5 },
  { label: "0.3x", desc: "1 upd per 3 sec", value: 0.3 },
  { label: "0.2x", desc: "1 upd per 5 sec", value: 0.2 },
  { label: "0.1x", desc: "1 upd per 10 sec", value: 0.1 },
];

export default function ReplayBar({ intervalLabel = "5m" }: { intervalLabel?: string }) {
  const {
    mode, isPlaying, replaySpeed, 
    stopReplay, togglePlay, stepForward, skipToEnd, setSpeed, enterSelectMode, reSelectBar
  } = useReplay();

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (mode === 'idle') return null;

  const speedLabel = SPEED_OPTIONS.find(s => s.value === replaySpeed)?.label ?? "1x";

  // Pixel-Perfect Light Theme (38px height)
  const barStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: "100%",
    height: "38px",
    backgroundColor: "#ffffff",
    borderTop: "1px solid #d1d4dc",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    color: "#131722",
    fontSize: "13px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif",
    zIndex: 1000,
    boxSizing: "border-box",
    userSelect: "none",
  };

  const separatorStyle: React.CSSProperties = {
    width: "1px",
    height: "24px",
    backgroundColor: "#e0e3eb",
    margin: "0 12px",
  };

  // ── SELECT MODE BAR ──────────────────────────────────────────────────────────
  if (mode === 'selecting') {
    return (
      <div style={barStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 16px", width: "100%" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2962ff" strokeWidth="2.5">
            <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
            <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>
          </svg>
          <span style={{ color: "#2962ff", fontWeight: 700 }}>Select bar</span>
          <span style={{ opacity: 0.6, fontSize: "12px" }}>— Click on the chart to select the bar from which you'd like to start the replay</span>
          <div style={{ flex: 1 }} />
          <button 
            onClick={stopReplay}
            style={{ background: "none", border: "1px solid #d1d4dc", color: "#131722", borderRadius: "4px", padding: "4px 12px", fontSize: "12px", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f0f3fa"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── ACTIVE REPLAY BAR ─────────────────────────────────────────────────────────
  return (
    <div style={barStyle}>
      {/* Left spacer (matches close button width for perfect centering) */}
      <div style={{ width: "30px" }} />
      
      {/* Center group */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0px" }}>
        {/* Select bar button */}
        <button 
          onClick={reSelectBar}
          style={{ 
            display: "flex", alignItems: "center", gap: "6px", 
            background: "none", border: "none", color: "#131722", 
            cursor: "pointer", padding: "4px 10px", borderRadius: "4px",
            fontSize: "13px", fontWeight: 500,
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f0f3fa"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4v16M8 12h12M8 12l4-4M8 12l4 4"/>
          </svg>
          Select bar
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        <div style={separatorStyle} />

        {/* Play/Pause and Step Forward */}
        <IconButton onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? (
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
               <path d="M10 5h1v14h-1zM14 5h1v14h-1z"/>
             </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7 5l10 7-10 7V5z"/>
            </svg>
          )}
        </IconButton>

        <IconButton onClick={stepForward} title="Forward (Step)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 5l10 7-10 7V5zM17 5v14"/>
          </svg>
        </IconButton>

        {/* Speed Label */}
        <div ref={speedMenuRef} style={{ position: "relative", marginLeft: "12px" }}>
          <button 
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            style={{ background: "none", border: "none", color: "#2962ff", cursor: "pointer", fontSize: "14px", fontWeight: 700, padding: "4px 8px" }}
          >
            {speedLabel}
          </button>
          {showSpeedMenu && (
            <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", backgroundColor: "#ffffff", border: "1px solid #e0e3eb", borderRadius: "6px", marginBottom: "8px", overflow: "hidden", zIndex: 1001, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", minWidth: "200px" }}>
              <div style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 700, color: "#787b86", textTransform: "uppercase", borderBottom: "1px solid #f0f3fa" }}>
                Replay Speed
              </div>
              {SPEED_OPTIONS.map(opt => (
                <div 
                  key={opt.value} 
                  onClick={() => { setSpeed(opt.value); setShowSpeedMenu(false); }} 
                  style={{ 
                    padding: "10px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                    backgroundColor: replaySpeed === opt.value ? "#333" : "transparent",
                    color: replaySpeed === opt.value ? "#ffffff" : "#131722",
                    fontSize: "14px",
                  }} 
                  onMouseEnter={e => {
                    if (replaySpeed !== opt.value) e.currentTarget.style.backgroundColor = "#f0f3fa";
                  }} 
                  onMouseLeave={e => {
                    if (replaySpeed !== opt.value) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{opt.label}</span>
                  <span style={{ opacity: 0.8, fontSize: "13px" }}>{opt.desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interval Label */}
        <div style={{ color: "#787b86", fontSize: "14px", fontWeight: 600, marginLeft: "8px", padding: "0 8px" }}>
          {intervalLabel}
        </div>

        <div style={separatorStyle} />

        {/* Jump to Real Time */}
        <IconButton onClick={skipToEnd} title="Jump to real time">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 5l10 7-10 7V5zM17 5v14M20 5v14"/>
          </svg>
        </IconButton>
      </div>

      {/* Close Button (pinned right) */}
      <IconButton onClick={stopReplay} title="Exit Replay">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#787b86" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </IconButton>
    </div>
  );
}

function IconButton({ children, onClick, title }: { children: React.ReactNode, onClick: () => void, title: string }) {
  return (
    <button
      onClick={() => {
        console.log(`[Replay UI] Button clicked: ${title}`);
        onClick();
      }}
      title={title}
      style={{
        background: "none", border: "none", color: "#131722",
        padding: "6px", cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", transition: "background 0.2s", borderRadius: "4px"
      }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f0f3fa"}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
    >
      {children}
    </button>
  );
}
