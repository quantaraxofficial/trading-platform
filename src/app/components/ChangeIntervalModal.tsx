"use client";

import React, { useState, useEffect, useRef } from "react";
import { Info, X } from "lucide-react";
import { useEscapeClose } from "../lib/useEscapeClose";

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

  useEscapeClose(onClose);

  // A trailing unit letter picks minutes/hours/days/months/years, matching the
  // same values TopBar's own interval dropdown already sends through
  // handleIntervalChange (1h.."4h", 1day, 1month/3month/6month/12month, Nmin) —
  // reusing those exact strings is what makes typed values here genuinely work
  // rather than just looking accepted.
  const parsed = (() => {
    const m = value.match(/^(\d+)\s*([hHdDwWmMyY]?)$/);
    if (!m) return null;
    const num = parseInt(m[1], 10);
    if (isNaN(num) || num <= 0) return null;
    const unit = m[2].toLowerCase() as "" | "h" | "d" | "w" | "m" | "y";
    return { num, unit };
  })();

  const maxForUnit: Record<string, number> = { "": 1440, h: 24, d: 30, w: 52, m: 120, y: 50 };
  const isValid = parsed !== null && parsed.num <= maxForUnit[parsed.unit];

  const displayLabel = (() => {
    if (!parsed) return "";
    const { num, unit } = parsed;
    if (unit === "h") return `${num} hour${num !== 1 ? "s" : ""}`;
    if (unit === "d") return `${num} day${num !== 1 ? "s" : ""}`;
    if (unit === "w") return `${num} week${num !== 1 ? "s" : ""}`;
    if (unit === "m") return `${num} month${num !== 1 ? "s" : ""}`;
    if (unit === "y") return `${num} year${num !== 1 ? "s" : ""}`;
    return `${num} minute${num !== 1 ? "s" : ""}`;
  })();

  const handleSubmit = () => {
    if (!isValid || !parsed) return;
    const { num, unit } = parsed;

    if (unit === "h") {
      onApply(`${num}h`, `${num}h`);
      return;
    }
    if (unit === "d") {
      // TwelveData only exposes a single fixed "1day" bar; other day counts
      // are passed through best-effort, same as unmapped minute values below.
      onApply(num === 1 ? "1day" : `${num}day`, num === 1 ? "D" : `${num}D`);
      return;
    }
    if (unit === "w") {
      // Same fixed "1week" bar TopBar's own "1 week" button sends; other counts pass through best-effort.
      onApply(`${num}week`, num === 1 ? "W" : `${num}W`);
      return;
    }
    if (unit === "m") {
      onApply(`${num}month`, `${num}M`);
      return;
    }
    if (unit === "y") {
      // No native "year" interval — TopBar's own "12 months" button is how this
      // app already represents one year, so N years becomes N*12 months.
      const months = num * 12;
      onApply(`${months}month`, `${num}Y`);
      return;
    }

    // Plain minutes — map to TwelveData-compatible intervals
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
    if (supported[num]) {
      onApply(supported[num].value, supported[num].label);
    } else {
      // For unsupported intervals, still pass through (future aggregation support)
      onApply(`${num}min`, `${num}m`);
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
            // Digits, plus at most one trailing unit letter (h/d/w/m/y)
            const raw = e.target.value.replace(/[^0-9hHdDwWmMyY]/g, "");
            const digits = raw.match(/^\d*/)?.[0] || "";
            const unit = raw.slice(digits.length).match(/[hHdDwWmMyY]/)?.[0] || "";
            setValue(digits + unit);
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
