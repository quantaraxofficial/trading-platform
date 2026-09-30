"use client";

import React, { useState } from 'react';
import { useDrawing } from './drawing/core/DrawingContext';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  X, 
  Minus, 
  Square, 
  Type, 
  TrendingUp, 
  TrendingDown, 
  Brush, 
  Activity, 
  PenTool,
  MoveRight,
  MoreHorizontal
} from 'lucide-react';

interface Indicator {
  id: string;
  name: string;
  visible?: boolean;
}

interface ObjectTreeSidebarProps {
  indicators: Indicator[];
  onUpdateIndicator: (id: string, updates: Partial<Indicator>) => void;
  onDeleteIndicator: (id: string) => void;
}

export default function ObjectTreeSidebar({ indicators, onUpdateIndicator, onDeleteIndicator }: ObjectTreeSidebarProps) {
  const { drawings, updateDrawing, deleteDrawing, selectedShapeId, setSelectedShapeId } = useDrawing();
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null);
  const [hoveredIndicatorId, setHoveredIndicatorId] = useState<string | null>(null);

  const getDrawingIcon = (type: string) => {
    switch(type) {
      case 'trendline': return <Minus size={16} />;
      case 'horizontal_ray': return <Minus size={16} />;
      case 'rectangle': return <Square size={16} />;
      case 'text': return <Type size={16} />;
      case 'long_position': return <TrendingUp size={16} />;
      case 'short_position': return <TrendingDown size={16} />;
      case 'brush':
      case 'highlighter': return <Brush size={16} />;
      case 'arrow':
      case 'arrow_marker': return <MoveRight size={16} />;
      case 'path':
      case 'polyline':
      case 'curve': return <PenTool size={16} />;
      default: return <Minus size={16} />;
    }
  };

  const getDrawingName = (type: string, text?: string) => {
    if (text) return text.slice(0, 20) + (text.length > 20 ? '...' : '');
    const names: Record<string, string> = {
      'trendline': 'Trend Line',
      'horizontal_ray': 'Horizontal Ray',
      'rectangle': 'Rectangle',
      'text': 'Text',
      'long_position': 'Long Position',
      'short_position': 'Short Position',
      'brush': 'Brush',
      'highlighter': 'Highlighter',
      'arrow': 'Arrow',
      'arrow_marker': 'Arrow Mark',
      'path': 'Path',
      'polyline': 'Polyline',
      'curve': 'Curve'
    };
    return names[type] || 'Drawing';
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", backgroundColor: "var(--tv-color-pane-bg)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--tv-color-border)" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, letterSpacing: "-0.2px", color: "var(--tv-color-text-main)" }}>Object Tree</h3>
        <div style={{ display: "flex", gap: "4px" }}>
          <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }}><MoreHorizontal size={16} strokeWidth={1.5} /></button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        
        {/* Indicators Section */}
        {indicators.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ padding: "4px 12px", fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", letterSpacing: "0.3px" }}>
              INDICATORS
            </div>
            {indicators.map((ind) => (
              <div 
                key={ind.id}
                onMouseEnter={() => setHoveredIndicatorId(ind.id)}
                onMouseLeave={() => setHoveredIndicatorId(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 12px",
                  fontSize: "13px",
                  cursor: "pointer",
                  backgroundColor: hoveredIndicatorId === ind.id ? "var(--tv-color-item-hover)" : "transparent",
                  color: "var(--tv-color-text-main)"
                }}
              >
                <div style={{ marginRight: "10px", display: "flex", alignItems: "center", color: "var(--tv-color-text-muted)" }}>
                  <Activity size={16} />
                </div>
                <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ind.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", opacity: hoveredIndicatorId === ind.id ? 1 : 0, transition: "opacity 0.15s ease" }}>
                  <button 
                    className="tv-icon-btn" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateIndicator(ind.id, { visible: ind.visible === false ? true : false });
                    }}
                    style={{ width: "24px", height: "24px", color: "var(--tv-color-text-muted)" }}
                  >
                    {ind.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button 
                    className="tv-icon-btn" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteIndicator(ind.id);
                    }}
                    style={{ width: "24px", height: "24px", color: "var(--tv-color-text-muted)" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Drawings Section */}
        {drawings.length > 0 && (
          <div>
            <div style={{ padding: "4px 12px", fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", letterSpacing: "0.3px" }}>
              DRAWINGS
            </div>
            {drawings.slice().reverse().map((drawing) => {
              const isSelected = selectedShapeId === drawing.id;
              const isHovered = hoveredDrawingId === drawing.id;
              return (
                <div 
                  key={drawing.id}
                  onClick={() => setSelectedShapeId(drawing.id)}
                  onMouseEnter={() => setHoveredDrawingId(drawing.id)}
                  onMouseLeave={() => setHoveredDrawingId(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 12px",
                    fontSize: "13px",
                    cursor: "pointer",
                    backgroundColor: isSelected ? "var(--tv-color-item-active)" : isHovered ? "var(--tv-color-item-hover)" : "transparent",
                    color: isSelected ? "var(--tv-color-text-active)" : "var(--tv-color-text-main)"
                  }}
                >
                  <div style={{ marginRight: "10px", display: "flex", alignItems: "center", color: isSelected ? "var(--tv-color-text-active)" : "var(--tv-color-text-muted)" }}>
                    {getDrawingIcon(drawing.type)}
                  </div>
                  <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {getDrawingName(drawing.type, (drawing as any).text)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", opacity: (isHovered || isSelected || !drawing.visible || drawing.locked) ? 1 : 0, transition: "opacity 0.15s ease" }}>
                    <button 
                      className="tv-icon-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        updateDrawing(drawing.id, { locked: !drawing.locked });
                      }}
                      style={{ width: "24px", height: "24px", color: isSelected ? "var(--tv-color-text-active)" : "var(--tv-color-text-muted)" }}
                    >
                      {drawing.locked ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                    <button 
                      className="tv-icon-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        updateDrawing(drawing.id, { visible: drawing.visible === false ? true : false });
                      }}
                      style={{ width: "24px", height: "24px", color: isSelected ? "var(--tv-color-text-active)" : "var(--tv-color-text-muted)" }}
                    >
                      {drawing.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button 
                      className="tv-icon-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDrawing(drawing.id);
                      }}
                      style={{ width: "24px", height: "24px", color: isSelected ? "var(--tv-color-text-active)" : "var(--tv-color-text-muted)" }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {indicators.length === 0 && drawings.length === 0 && (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--tv-color-text-muted)", fontSize: "13px" }}>
            No objects on chart
          </div>
        )}
      </div>
    </div>
  );
}
