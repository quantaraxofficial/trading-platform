"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useDrawing, DrawingType } from "./drawing/core/DrawingContext";
import {
  TrendingUp,
  AlignJustify,
  PenTool,
  Square,
  Circle,
  Triangle,
  Type,
  MousePointer2,
  Eraser,
  PlayCircle,
  Wand2,
} from "lucide-react";
import {
  TVCrosshairIcon,
  TVTrendlineIcon,
  TVFibonacciIcon,
  TVBrushIcon,
  TVLongPositionIcon,
  TVShortPositionIcon,
} from "./icons/TVIcons";

// Map drawing types to their icons
const toolIconMap: Record<string, (size: number) => React.ReactNode> = {
  cross: (s) => <TVCrosshairIcon size={s} />,
  dot: (s) => <Circle size={s} fill="currentColor" />,
  arrow_cursor: (s) => <MousePointer2 size={s} style={{ transform: "rotate(-45deg)" }} />,
  demonstration: (s) => <PlayCircle size={s} />,
  magic: (s) => <Wand2 size={s} />,
  eraser: (s) => <Eraser size={s} />,
  trendline: (s) => <TVTrendlineIcon size={s} />,
  fibonacci: (s) => <TVFibonacciIcon size={s} />,
  brush: (s) => <TVBrushIcon size={s} />,
  highlighter: (s) => <PenTool size={s} strokeWidth={2} opacity={0.5} />,
  arrow_marker: (s) => <MousePointer2 size={s} strokeWidth={2} />,
  arrow: (s) => <MousePointer2 size={s} strokeWidth={2} style={{ transform: "rotate(-45deg)" }} />,
  arrow_mark_up: (s) => <TrendingUp size={s} strokeWidth={2} />,
  arrow_mark_down: (s) => <TrendingUp size={s} strokeWidth={2} style={{ transform: "scaleY(-1)" }} />,
  rectangle: (s) => <Square size={s} strokeWidth={2} />,
  rotated_rectangle: (s) => <Square size={s} strokeWidth={2} style={{ transform: "rotate(45deg)" }} />,
  path: (s) => <AlignJustify size={s} strokeWidth={2} />,
  circle: (s) => <Circle size={s} strokeWidth={2} />,
  ellipse: (s) => <Circle size={s} strokeWidth={2} style={{ transform: "scaleY(0.7)" }} />,
  polyline: (s) => <AlignJustify size={s} strokeWidth={2} />,
  triangle: (s) => <Triangle size={s} strokeWidth={2} />,
  arc: (s) => <Circle size={s} strokeWidth={2} />,
  curve: (s) => <Circle size={s} strokeWidth={2} />,
  double_curve: (s) => <Circle size={s} strokeWidth={2} />,
  text: (s) => <Type size={s} strokeWidth={2} />,
  long_position: (s) => <TVLongPositionIcon size={s} />,
  short_position: (s) => <TVShortPositionIcon size={s} />,
};

// Friendly display name map
const toolNameMap: Record<string, string> = {
  cross: "Cross",
  dot: "Dot",
  arrow_cursor: "Arrow",
  demonstration: "Demonstration",
  magic: "Magic",
  eraser: "Eraser",
  trendline: "Trend Line",
  fibonacci: "Fibonacci Retracement",
  brush: "Brush",
  highlighter: "Highlighter",
  arrow_marker: "Arrow Marker",
  arrow: "Arrow",
  arrow_mark_up: "Arrow Mark Up",
  arrow_mark_down: "Arrow Mark Down",
  rectangle: "Rectangle",
  rotated_rectangle: "Rotated Rectangle",
  path: "Path",
  circle: "Circle",
  ellipse: "Ellipse",
  polyline: "Polyline",
  triangle: "Triangle",
  arc: "Arc",
  curve: "Curve",
  double_curve: "Double Curve",
  text: "Text",
  long_position: "Long Position",
  short_position: "Short Position",
};

export default function FavoritesToolbar() {
  const { favoriteTools, activeTool, setActiveTool, isFavoritesToolbarVisible } = useDrawing();
  const [position, setPosition] = useState({ x: 100, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posStartRef = useRef({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Load saved position from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tv_favorites_toolbar_pos");
      if (saved) {
        setPosition(JSON.parse(saved));
      }
    } catch {}
  }, []);

  // Save position on change
  useEffect(() => {
    if (!isDragging) {
      localStorage.setItem("tv_favorites_toolbar_pos", JSON.stringify(position));
    }
  }, [position, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    posStartRef.current = { ...position };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition({
        x: posStartRef.current.x + dx,
        y: posStartRef.current.y + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  if (!isFavoritesToolbarVisible || favoriteTools.length === 0) return null;

  return (
    <div
      ref={toolbarRef}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: "0px",
        backgroundColor: "var(--tv-color-pane-bg)",
        border: "1px solid var(--tv-color-border)",
        borderRadius: "6px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        padding: "2px 4px",
        cursor: isDragging ? "grabbing" : "default",
        userSelect: "none",
      }}
    >
      {/* Drag Handle - 6 dot grid */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: "grid",
          gridTemplateColumns: "4px 4px",
          gap: "2px",
          padding: "6px 4px",
          cursor: isDragging ? "grabbing" : "grab",
          opacity: 0.4,
        }}
      >
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            style={{
              width: "3px",
              height: "3px",
              borderRadius: "50%",
              backgroundColor: "var(--tv-color-text)",
            }}
          />
        ))}
      </div>

      {/* Separator */}
      <div
        style={{
          width: "1px",
          height: "24px",
          backgroundColor: "var(--tv-color-border)",
          margin: "0 2px",
        }}
      />

      {/* Favorite tool buttons */}
      {favoriteTools.map((toolType) => {
        const iconFn = toolIconMap[toolType];
        const isActive = activeTool === toolType;
        const name = toolNameMap[toolType] || toolType;
        if (!iconFn) return null;

        return (
          <div key={toolType} className="tv-tooltip-container" style={{ position: "relative" }}>
            <button
              className={`tv-icon-btn ${isActive ? "active" : ""}`}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isActive ? "var(--tv-color-accent)" : "var(--tv-color-text)",
              }}
              onClick={() => setActiveTool(toolType)}
              title={name}
            >
              {iconFn(18)}
            </button>
            <div
              className="tv-tooltip"
              style={{
                top: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                marginTop: "6px",
                zIndex: 100,
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
