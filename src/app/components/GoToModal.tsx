"use client";

import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from "lucide-react";
import { useEscapeClose } from "../lib/useEscapeClose";

interface GoToModalProps {
  onClose: () => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedTime: string;
  setSelectedTime: (time: string) => void;
}

export default function GoToModal({ onClose, selectedDate, setSelectedDate, selectedTime, setSelectedTime }: GoToModalProps) {
  useEscapeClose(onClose);
  const [activeTab, setActiveTab] = useState<"date" | "custom">("date");
  
  // Current view state for the calendar - initialize to the selected date's month
  const [viewDate, setViewDate] = useState(new Date(selectedDate));
  
  // Custom range states
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const weekDays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    // 0 is Sunday, 1 is Monday, etc. Adjust to Mo-Su (0-6)
    let day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();
  const monthName = viewDate.toLocaleString('default', { month: 'long' });

  const totalDays = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleDateClick = (day: number) => {
    const newDate = new Date(currentYear, currentMonth, day);
    const dateStr = newDate.toISOString().split('T')[0];
    if (activeTab === "date") {
      setSelectedDate(dateStr);
    } else {
      // Simple logic: if click on toDate, change toDate, else fromDate
      // Or just toggle. Let's just update selectedDate for now as a demo.
      setSelectedDate(dateStr);
    }
  };

  const handleGoTo = () => {
    const goToDate = (window as any).__goToDate;

    if (goToDate) {
      // Use the new goToDate function that fetches data from API if needed
      goToDate(selectedDate, selectedTime);
    } else {
      // Fallback: scroll within existing data (old behavior)
      const targetTimestamp = new Date(`${selectedDate}T${selectedTime}`).getTime() / 1000;
      const chart = (window as any).__chartInstance;
      const fullData = (window as any).__chartFullData;

      if (chart && fullData && fullData.length > 0) {
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < fullData.length; i++) {
          const diff = Math.abs(fullData[i].time - targetTimestamp);
          if (diff < minDiff) { minDiff = diff; closestIdx = i; }
        }
        const timeScale = chart.timeScale();
        const visibleLogicalRange = timeScale.getVisibleLogicalRange();
        if (visibleLogicalRange) {
          const rangeWidth = visibleLogicalRange.to - visibleLogicalRange.from;
          const halfWidth = rangeWidth / 2;
          timeScale.setVisibleLogicalRange({ from: closestIdx - halfWidth, to: closestIdx + halfWidth });
        } else {
          timeScale.scrollToPosition(closestIdx, true);
        }
      }
    }

    onClose();
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: "var(--tv-color-pane-background, #ffffff)",
        width: "360px",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
        }}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--tv-color-text, #131722)" }}>Go to</span>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--tv-color-text-muted, #787b86)" }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "24px", padding: "0 20px", borderBottom: "1px solid var(--tv-color-border, #e0e3eb)" }}>
          <button
            onClick={() => setActiveTab("date")}
            style={{
              padding: "8px 0",
              fontSize: "14px",
              fontWeight: 700,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "date" ? "2px solid var(--tv-color-accent, #2962ff)" : "2px solid transparent",
              color: activeTab === "date" ? "var(--tv-color-text, #131722)" : "var(--tv-color-text-muted, #787b86)",
              cursor: "pointer",
            }}
          >
            Date
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            style={{
              padding: "8px 0",
              fontSize: "14px",
              fontWeight: 700,
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "custom" ? "2px solid var(--tv-color-accent, #2962ff)" : "2px solid transparent",
              color: activeTab === "custom" ? "var(--tv-color-text, #131722)" : "var(--tv-color-text-muted, #787b86)",
              cursor: "pointer",
            }}
          >
            Custom range
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "20px" }}>
          {/* Inputs */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input
                type="text"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  width: "100%",
                  height: "34px",
                  padding: "0 12px",
                  borderRadius: "6px",
                  border: "2px solid var(--tv-color-accent, #2962ff)",
                  fontSize: "14px",
                  outline: "none",
                  backgroundColor: "transparent",
                  color: "var(--tv-color-text)"
                }}
              />
              <CalendarIcon size={16} style={{ position: "absolute", right: "10px", top: "9px", color: "var(--tv-color-text-muted)" }} />
            </div>
            <div style={{ width: "100px", position: "relative" }}>
              <input
                type="text"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                style={{
                  width: "100%",
                  height: "34px",
                  padding: "0 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--tv-color-border, #e0e3eb)",
                  fontSize: "14px",
                  outline: "none",
                  backgroundColor: "transparent",
                  color: "var(--tv-color-text)"
                }}
              />
              <Clock size={16} style={{ position: "absolute", right: "10px", top: "9px", color: "var(--tv-color-text-muted)" }} />
            </div>
          </div>

          {activeTab === "custom" && (
            <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type="text"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  style={{
                    width: "100%",
                    height: "34px",
                    padding: "0 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--tv-color-border, #e0e3eb)",
                    fontSize: "14px",
                    outline: "none",
                    backgroundColor: "transparent",
                    color: "var(--tv-color-text)"
                  }}
                />
                <CalendarIcon size={16} style={{ position: "absolute", right: "10px", top: "9px", color: "var(--tv-color-text-muted)" }} />
              </div>
              <div style={{ width: "100px", position: "relative" }}>
                <input
                  type="text"
                  value="20:00"
                  readOnly
                  style={{
                    width: "100%",
                    height: "34px",
                    padding: "0 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--tv-color-border, #e0e3eb)",
                    fontSize: "14px",
                    outline: "none",
                    backgroundColor: "transparent",
                    color: "var(--tv-color-text)"
                  }}
                />
                <Clock size={16} style={{ position: "absolute", right: "10px", top: "9px", color: "var(--tv-color-text-muted)" }} />
              </div>
            </div>
          )}

          {/* Calendar Picker */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", padding: "0 12px" }}>
              <ChevronLeft size={20} onClick={prevMonth} style={{ cursor: "pointer", color: "var(--tv-color-text-muted)" }} />
              <span style={{ fontWeight: 600, fontSize: "14px" }}>
                {monthName} {currentYear}
              </span>
              <ChevronRight size={20} onClick={nextMonth} style={{ cursor: "pointer", color: "var(--tv-color-text-muted)" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", textAlign: "center" }}>
              {weekDays.map(day => (
                <div key={day} style={{ fontSize: "12px", color: "var(--tv-color-text-muted)", padding: "8px 0" }}>{day}</div>
              ))}
              
              {/* Empty slots for the first week */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {/* Actual days */}
              {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => {
                const dateObj = new Date(currentYear, currentMonth, day);
                const dateStr = dateObj.toISOString().split('T')[0];
                const isSelected = selectedDate === dateStr;
                const isToday = new Date().toISOString().split('T')[0] === dateStr;

                return (
                  <div
                    key={day}
                    onClick={() => handleDateClick(day)}
                    style={{
                      padding: "8px 0",
                      fontSize: "13px",
                      cursor: "pointer",
                      borderRadius: "4px",
                      backgroundColor: isSelected ? "var(--tv-color-text, #131722)" : "transparent",
                      color: isSelected ? "#ffffff" : "var(--tv-color-text)",
                      fontWeight: isSelected || isToday ? 700 : 400,
                      position: "relative",
                    }}
                    onMouseEnter={e => !isSelected && (e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover-bg, #f0f3fa)")}
                    onMouseLeave={e => !isSelected && (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    {day}
                    {isToday && !isSelected && (
                      <div style={{ position: "absolute", bottom: "4px", left: "50%", transform: "translateX(-50%)", width: "12px", height: "2px", backgroundColor: "var(--tv-color-accent)" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 20px",
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
          borderTop: "1px solid var(--tv-color-border, #e0e3eb)",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "0 16px",
              height: "34px",
              borderRadius: "6px",
              border: "1px solid var(--tv-color-border, #e0e3eb)",
              background: "transparent",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              color: "var(--tv-color-text)"
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleGoTo}
            style={{
              padding: "0 16px",
              height: "34px",
              borderRadius: "6px",
              border: "none",
              background: "var(--tv-color-text, #131722)",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Go to
          </button>
        </div>
      </div>
    </div>
  );
}
