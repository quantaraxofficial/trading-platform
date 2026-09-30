"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useDrawing } from "./drawing/core/DrawingContext";
import { DRAWING_TOOL_BY_TYPE } from "./drawing/toolCatalog";

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
        const tool = DRAWING_TOOL_BY_TYPE[toolType];
        const isActive = activeTool === toolType;
        if (!tool) return null;
        const name = tool.label;

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
              {tool.icon()}
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
