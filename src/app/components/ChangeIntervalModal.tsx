"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { useEscapeClose } from "../lib/useEscapeClose";

// Maps a chart interval value to the short label TradingView's "Change interval"
// dialog pre-fills: "1day" → "1d", "5min" → "5m", "4h" → "4h", "1month" → "1m".
function toShortLabel(v: string): string {
  const m = /^(\d+)(min|h|day|week|month|month|y|s)$/.exec(v);
  if (!m) return v;
  const n = m[1];
  const u = m[2];
  if (u === "min") return `${n}m`;
  if (u === "day") return `${n}d`;
  if (u === "week") return `${n}w`;
  if (u === "month") return `${n}m`;
  if (u === "h" || u === "s") return `${n}${u}`;
  return v;
}

interface ChangeIntervalModalProps {
  initialDigit: string;
  onApply: (interval: string, label: string) => void;
  onClose: () => void;
  theme?: string;
  /**
   * Pre-fills the input from the chart's current interval (e.g. "1day" → "1d")
   * instead of showing a bare digit — exactly what TradingView's "Change interval"
   * dialog does. The digit is ignored when this is passed.
   */
  currentInterval?: string;
  /** Opens with the "Change interval..." dialog's custom interval form pre-shown. */
  startInCustomForm?: boolean;
}

type IntervalUnit = "s" | "min" | "h" | "day" | "week" | "month";

export default function ChangeIntervalModal({ initialDigit, currentInterval, startInCustomForm, onApply, onClose, theme }: ChangeIntervalModalProps) {
  const [value, setValue] = useState(currentInterval ? toShortLabel(currentInterval) : (initialDigit ? `${initialDigit}min` : ""));
  const [showCustom, setShowCustom] = useState(!!startInCustomForm);
  const [customNumber, setCustomNumber] = useState("1");
  const [customUnit, setCustomUnit] = useState<IntervalUnit>("min");
  const inputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === "dark";

  useEffect(() => {
    inputRef.current?.focus();
    // Move cursor to end
    const len = inputRef.current?.value.length || 0;
    inputRef.current?.setSelectionRange(len, len);
  }, [showCustom]);

  useEscapeClose(onClose);

  // A trailing unit letter picks seconds/minutes/hours/days/months/years,
  // matching the same values TopBar's own interval dropdown already sends
  // through handleIntervalChange (30s, 1h.."4h", 1day, 1month/3month/6month/
  // 12month, Nmin) — reusing those exact strings is what makes typed values
  // here genuinely work rather than just look accepted.
  const parsed = (() => {
    const m = value.match(/^(\d+)\s*([hHdDwWmMMyYsS]?)$/);
    if (!m) return null;
    const num = parseInt(m[1], 10);
    if (isNaN(num) || num <= 0) return null;
    const rawUnit = m[2].toLowerCase();
    const unit = (rawUnit === "s" ? "s" : rawUnit) as "" | "h" | "d" | "w" | "m" | "y" | "s";
    return { num, unit };
  })();

  const maxForUnit: Record<string, number> = { "": 1440, s: 30, h: 24, d: 30, w: 52, m: 120, y: 50 };
  const isValid = parsed !== null && parsed.num <= maxForUnit[parsed.unit];

  const displayLabel = (() => {
    if (!parsed) return "";
    const { num, unit } = parsed;
    if (unit === "s") return `${num} second${num !== 1 ? "s" : ""}`;
    if (unit === "h") return `${num} hour${num !== 1 ? "s" : ""}`;
    if (unit === "d") return `${num} day${num !== 1 ? "s" : ""}`;
    if (unit === "w") return `${num} week${num !== 1 ? "s" : ""}`;
    if (unit === "m") return `${num} month${num !== 1 ? "s" : ""}`;
    if (unit === "y") return `${num} year${num !== 1 ? "s" : ""}`;
    return `${num} minute${num !== 1 ? "s" : ""}`;
  })();

  // --- Custom interval form (TradingView's "Change interval..." dialog) ---------
  const UNIT_NAMES: Record<IntervalUnit, string> = {
    s: "seconds", min: "minutes", h: "hours", day: "days", week: "weeks", month: "months",
  };
  // What each unit can sensibly be sized to — anything past it would need data the
  // feed can't produce, so the count is capped like TradingView caps its inputs.
  const MAXES: Record<IntervalUnit, number> = { s: 30, min: 1440, h: 24, day: 30, week: 52, month: 120 };
  const customParsed = (() => {
    const n = parseInt(customNumber, 10);
    return n > 0 && n <= MAXES[customUnit] ? n : null;
  })();
  const customValid = customParsed !== null;

  const handleSubmit = () => {
    if (showCustom) {
      if (!customValid) return;
      const n = customParsed!;
      switch (customUnit) {
        case "s": {
          // Sub-minute intervals only come from the MT5/ClickHouse 30-second feed;
          // anything else is clamped to the 30-second bar.
          onApply(n === 30 ? "30s" : "30s", "30s");
          return;
        }
        case "min": {
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
          const m = supported[n];
          onApply(m ? m.value : `${n}min`, m ? m.label : `${n}m`);
          return;
        }
        case "h":
          onApply(`${n}h`, `${n}h`);
          return;
        case "day":
          onApply(n === 1 ? "1day" : `${n}day`, n === 1 ? "D" : `${n}D`);
          return;
        case "week":
          onApply(n === 1 ? "1week" : `${n}week`, n === 1 ? "W" : `${n}W`);
          return;
        case "month":
          onApply(`${n}month`, `${n}M`);
          return;
      }
    }
    // --- Quick-change input (digits + optional trailing unit letter) -------------
    if (!isValid || !parsed) return;
    const { num, unit } = parsed;

    if (unit === "s") {
      // Sub-minute intervals only come from the MT5/ClickHouse 30-second feed;
      // anything else is clamped to the 30-second bar.
      const v = num === 30 ? "30s" : "30s";
      onApply(v, "30s");
      return;
    }
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

  const inputBorder = isDark ? "#434651" : "#e0e3eb";
  const muted = "#787b86";
  const fieldBg = isDark ? "#131722" : "transparent";
  const panelBg = isDark ? "#1e222d" : "#ffffff";
  const panelShadow = isDark ? "0 16px 48px rgba(0,0,0,0.6)" : "0 16px 48px rgba(0,0,0,0.25)";

  return createPortal(
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
        role="dialog"
        aria-label="Change interval"
        style={{
          backgroundColor: panelBg,
          borderRadius: "8px",
          boxShadow: panelShadow,
          width: "340px",
          height: "fit-content",
          padding: "12px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {/* Title bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            aria-label="Help"
            style={{
              width: 22, height: 22, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", color: muted,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <Info size={16} strokeWidth={1.75} />
          </button>
          <span style={{ flex: 1, fontSize: "15px", fontWeight: 600, color: isDark ? "#d1d4dc" : "#131722" }}>
            Change interval
          </span>
        </div>

        {showCustom ? (
          /* Custom interval form — TradingView's "Change interval..." dialog */
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                ref={inputRef}
                type="number"
                min={1}
                max={MAXES[customUnit]}
                value={customNumber}
                onChange={e => setCustomNumber(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Amount"
                style={{
                  width: "80px", padding: "8px 10px", fontSize: "14px", textAlign: "center",
                  border: `1px solid ${inputBorder}`, borderRadius: "4px",
                  backgroundColor: fieldBg, color: isDark ? "#d1d4dc" : "#131722",
                  outline: "none", fontWeight: 500,
                }}
              />
              <select
                value={customUnit}
                onChange={e => {
                  const u = e.target.value as IntervalUnit;
                  setCustomUnit(u);
                  setCustomNumber(String(Math.min(parseInt(customNumber, 10) || 1, MAXES[u])));
                }}
                aria-label="Unit"
                style={{
                  flex: 1, padding: "8px 10px", fontSize: "14px",
                  border: `1px solid ${inputBorder}`, borderRadius: "4px",
                  backgroundColor: fieldBg, color: isDark ? "#d1d4dc" : "#131722", outline: "none",
                }}
              >
                {(Object.keys(UNIT_NAMES) as IntervalUnit[]).map(u => (
                  <option key={u} value={u}>{UNIT_NAMES[u]}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!customValid}
              style={{
                padding: "9px 0", fontSize: "13px", fontWeight: 600,
                borderRadius: "4px", cursor: customValid ? "pointer" : "default",
                backgroundColor: customValid ? "#2962ff" : (isDark ? "#363a45" : "#e0e3eb"),
                color: customValid ? "#ffffff" : muted, border: "none",
              }}
            >
              Add
            </button>
            <div style={{ fontSize: "12px", color: muted, lineHeight: 1.5 }}>
              Sub-second intervals (ticks, seconds, ranges) are unavailable for this symbol — the
              app's live data feed can only produce 30-second bars or larger.
            </div>
          </div>
        ) : (
          /* Quick change — the pre-filled value, a live label, and the custom link */
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                // Digits, plus at most one trailing unit letter (s/h/d/w/m/y)
                const raw = e.target.value.replace(/[^0-9sShHdDwWmMyY]/g, "");
                const digits = raw.match(/^\d*/)?.[0] || "";
                const unit = raw.slice(digits.length).match(/[sShHdDwWmMyY]/)?.[0] || "";
                setValue(digits + unit.toLowerCase());
              }}
              onKeyDown={handleKeyDown}
              aria-label="Interval"
              style={{
                padding: "10px 14px", fontSize: "16px", textAlign: "center",
                border: `1px solid ${inputBorder}`, borderRadius: "4px", outline: "none",
                backgroundColor: fieldBg, color: isDark ? "#d1d4dc" : "#131722", fontWeight: 500,
              }}
            />
            <div style={{ fontSize: "12px", color: muted, textAlign: "center" }}>
              {parsed ? displayLabel : (value ? "Enter a number with an optional unit (s, m, h, d, w, y)" : "Enter an interval")}
            </div>
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              style={{
                border: "none", background: "transparent", cursor: "pointer",
                fontSize: "13px", color: "var(--tv-color-accent)", padding: "2px 0",
              }}
            >
              Change interval...
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
