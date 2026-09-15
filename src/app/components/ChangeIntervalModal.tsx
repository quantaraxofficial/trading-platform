"use client";

import React, { useState, useEffect, useRef } from "react";
import { Info, X } from "lucide-react";

interface ChangeIntervalModalProps {
  initialDigit: string;
  onApply: (interval: string, label: string) => void;
  onClose: () => void;
  theme?: string;
}

export default function ChangeIntervalModal({ initialDigit, onApply, onClose, theme }: ChangeIntervalModalProps) {
  const [value, setValue] = useState(initialDigit);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === "dark";
  const bg = isDark ? "#1e222d" : "#ffffff";
  const text = isDark ? "#d1d4dc" : "#131722";
  const textMuted = isDark ? "#787b86" : "#787b86";
  const border = isDark ? "#2a2e39" : "#e0e3eb";
  const focusBorder = "#2962ff";

  useEffect(() => {
    inputRef.current?.focus();
    // Move cursor to end
    const len = inputRef.current?.value.length || 0;
    inputRef.current?.setSelectionRange(len, len);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const numValue = parseInt(value, 10);
  const isValid = !isNaN(numValue) && numValue > 0 && numValue <= 1440;
  const displayLabel = isValid ? `${numValue} minute${numValue !== 1 ? "s" : ""}` : "";

  const handleSubmit = () => {
    if (!isValid) return;
    // Map to TwelveData-compatible intervals
    const supported: Record<number, { value: string; label: string }> = {
      1: { value: "1min", label: "1m" },
      5: { value: "5min", label: "5m" },
      15: { value: "15min", label: "15m" },
      30: { value: "30min", label: "30m" },
      45: { value: "45min", label: "45m" },
      60: { value: "1h", label: "1h" },
      120: { value: "2h", label: "2h" },
      240: { value: "4h", label: "4h" },
    };
    if (supported[numValue]) {
      onApply(supported[numValue].value, supported[numValue].label);
    } else {
      // For unsupported intervals, still pass through (future aggregation support)
      onApply(`${numValue}min`, `${numValue}m`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.4)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: bg,
          borderRadius: "8px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          width: "260px",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: text, fontSize: "14px", fontWeight: 600 }}>
          Change interval
          <Info size={14} color={textMuted} style={{ cursor: "pointer" }} />
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, "");
            setValue(v);
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            padding: "10px 14px",
            fontSize: "16px",
            textAlign: "center",
            border: `2px solid ${focusBorder}`,
            borderRadius: "6px",
            outline: "none",
            backgroundColor: bg,
            color: text,
            fontWeight: 500,
          }}
        />

        {/* Minutes label */}
        <div style={{ fontSize: "12px", color: textMuted }}>
          {displayLabel}
        </div>
      </div>
    </div>
  );
}
