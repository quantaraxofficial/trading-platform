"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Crosshair,
  Circle,
  Type,
  MousePointer2,
  ZoomIn, 
  ZoomOut,
  Magnet, 
  Lock, 
  EyeOff, 
  Trash2,
  Smile,
  ChevronRight,
  PlayCircle,
  Wand2,
  Eraser,
  Star,
  Pencil,
  Unlock
} from "lucide-react";
import { useDrawing, DrawingType } from "./drawing/core/DrawingContext";
import { EmojiGridPicker } from "./ui/EmojiGridPicker";
import {
  TVCrosshairIcon,
  TVMeasureIcon,
  TVTrendlineIcon,
  TVFibonacciIcon,
  TVRectangleIcon,
  TVTriangleIcon,
  TVArcIcon,
  TVCurveIcon,
  TVDoubleCurveIcon,
  TVRotatedRectangleIcon,
  TVPathIcon,
  TVPolylineIcon,
  TVCircleIcon,
  TVEllipseIcon,
  TVBrushIcon,
  TVBrushStrokeIcon,
  TVHighlighterIcon,
  TVArrowMarkerIcon,
  TVArrowIcon,
  TVArrowMarkUpIcon,
  TVArrowMarkDownIcon,
  TVLongPositionIcon,
  TVShortPositionIcon
} from "./icons/TVIcons";

function StayInDrawingModeIcon({ size = 24 }: { size?: number }) {
  const lockSize = Math.round(size * 0.5);
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Pencil size={size * 0.7} strokeWidth={2} />
      <Lock
        size={lockSize}
        strokeWidth={2.5}
        style={{ position: "absolute", right: -2, bottom: -2 }}
      />
    </div>
  );
}

interface ToolItem {
  type?: DrawingType | null;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  isHeader?: boolean;
}

interface ToolGroup {
  id: string;
  defaultIcon: React.ReactNode;
  tooltip: string;
  items?: ToolItem[];
  defaultType?: DrawingType | null;
}

export default function LeftToolbar() {
  const { activeTool, setActiveTool, clearDrawings, activeEmoji, setActiveEmoji, favoriteTools, toggleFavoriteTool, isFavoritesToolbarVisible, setIsFavoritesToolbarVisible, magnetMode, setMagnetMode, allDrawingsLocked, toggleLockAllDrawings } = useDrawing();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [hoveredItemKey, setHoveredItemKey] = useState<string | null>(null);
  const [activeGroupTools, setActiveGroupTools] = useState<Record<string, DrawingType | null>>({
    'crosshair': null,
    'trendlines': 'trendline',
    'fibonacci': 'fibonacci',
    'shapes': null,
    'text': 'text',
  });

  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToolClick = (group: ToolGroup) => {
    if (group.id === 'icons') {
      setOpenDropdown(openDropdown === 'icons' ? null : 'icons');
      return;
    }

    // If the group is already active and has a dropdown, clicking the main button opens the dropdown
    const hasDropdown = group.items && group.items.length > 0;
    if (isGroupActive(group) && hasDropdown) {
      setOpenDropdown(openDropdown === group.id ? null : group.id);
      return;
    }

    if (hasDropdown) {
      const firstValidItem = group.items!.find(item => !item.isHeader && item.type);
      const toolToActivate = activeGroupTools[group.id] !== undefined && activeGroupTools[group.id] !== null
        ? activeGroupTools[group.id] 
        : firstValidItem?.type;
      setActiveGroupTools(prev => ({ ...prev, [group.id]: toolToActivate || null }));
      setActiveTool(toolToActivate || null);
    } else {
      setActiveTool(group.defaultType || null);
    }
    setOpenDropdown(null);
  };

  const handleDropdownItemClick = (e: React.MouseEvent, groupId: string, type: DrawingType | null) => {
    e.stopPropagation();
    setActiveGroupTools(prev => ({ ...prev, [groupId]: type }));
    setActiveTool(type);
    setOpenDropdown(null);
  };

  const handleArrowClick = (e: React.MouseEvent, groupId: string) => {
    e.stopPropagation();
    setOpenDropdown(openDropdown === groupId ? null : groupId);
  };

  const iconSize = 24;
  const btnSize = "38px";

  const toolGroups: ToolGroup[] = [
    { 
      id: 'crosshair', 
      defaultIcon: <TVCrosshairIcon size={iconSize} />, 
      tooltip: "Crosshair",
      defaultType: 'cross' as DrawingType,
      items: [
        { type: "cross" as DrawingType, label: "Cross", icon: <TVCrosshairIcon size={16} /> },
        { type: "dot" as DrawingType, label: "Dot", icon: <Circle size={16} fill="currentColor" /> },
        { type: "arrow_cursor" as DrawingType, label: "Arrow", icon: <MousePointer2 size={16} style={{ transform: 'rotate(-45deg)' }} /> },
        { type: "demonstration" as DrawingType, label: "Demonstration", icon: <PlayCircle size={16} /> },
        { type: "magic" as DrawingType, label: "Magic", icon: <Wand2 size={16} /> },
        { isHeader: true, label: "" },
        { type: "eraser" as DrawingType, label: "Eraser", icon: <Eraser size={16} /> },
      ]
    },
    { 
      id: 'trendlines', 
      defaultIcon: <TVTrendlineIcon size={iconSize} />, 
      tooltip: "Trend Line Tools",
      items: [
        { type: "trendline" as DrawingType, label: "Trend Line", icon: <TVTrendlineIcon size={16} /> }
      ]
    },
    { 
      id: 'fibonacci', 
      defaultIcon: <TVFibonacciIcon size={iconSize} />, 
      tooltip: "Gann and Fibonacci Tools",
      items: [
        { type: "fibonacci" as DrawingType, label: "Fibonacci Retracement", icon: <TVFibonacciIcon size={16} /> }
      ]
    },
    {
      id: 'prediction',
      defaultIcon: <TVLongPositionIcon size={iconSize} />,
      tooltip: "Prediction and Measurement Tools",
      items: [
        { type: "long_position" as DrawingType, label: "Long Position", icon: <TVLongPositionIcon size={16} /> },
        { type: "short_position" as DrawingType, label: "Short Position", icon: <TVShortPositionIcon size={16} /> }
      ]
    },
    {
      id: 'shapes',
      defaultIcon: <TVBrushIcon size={iconSize} />,
      tooltip: "Geometric Shapes",
      items: [
        { isHeader: true, label: "BRUSHES" },
        { type: "brush" as DrawingType, label: "Brush", icon: <TVBrushStrokeIcon size={16} /> },
        { type: "highlighter" as DrawingType, label: "Highlighter", icon: <TVHighlighterIcon size={16} /> },
        { isHeader: true, label: "ARROWS" },
        { type: "arrow_marker" as DrawingType, label: "Arrow marker", icon: <TVArrowMarkerIcon size={16} /> },
        { type: "arrow" as DrawingType, label: "Arrow", icon: <TVArrowIcon size={16} /> },
        { type: "arrow_mark_up" as DrawingType, label: "Arrow mark up", icon: <TVArrowMarkUpIcon size={16} /> },
        { type: "arrow_mark_down" as DrawingType, label: "Arrow mark down", icon: <TVArrowMarkDownIcon size={16} /> },
        { isHeader: true, label: "SHAPES" },
        { type: "rectangle" as DrawingType, label: "Rectangle", icon: <TVRectangleIcon size={16} />, shortcut: "Alt+Shift+R" },
        { type: "rotated_rectangle" as DrawingType, label: "Rotated rectangle", icon: <TVRotatedRectangleIcon size={16} /> },
        { type: "path" as DrawingType, label: "Path", icon: <TVPathIcon size={16} /> },
        { type: "circle" as DrawingType, label: "Circle", icon: <TVCircleIcon size={16} /> },
        { type: "ellipse" as DrawingType, label: "Ellipse", icon: <TVEllipseIcon size={16} /> },
        { type: "polyline" as DrawingType, label: "Polyline", icon: <TVPolylineIcon size={16} /> },
        { type: "triangle" as DrawingType, label: "Triangle", icon: <TVTriangleIcon size={16} /> },
        { type: "arc" as DrawingType, label: "Arc", icon: <TVArcIcon size={16} /> },
        { type: "curve" as DrawingType, label: "Curve", icon: <TVCurveIcon size={16} /> },
        { type: "double_curve" as DrawingType, label: "Double curve", icon: <TVDoubleCurveIcon size={16} /> },
      ]
    },
    {
      id: 'text',
      defaultIcon: <Type size={iconSize} strokeWidth={2} />,
      tooltip: "Annotation Tools",
      items: [
        { type: "text" as DrawingType, label: "Text", icon: <Type size={16} strokeWidth={2} /> }
      ]
    },
    { id: 'icons', defaultIcon: <Smile size={iconSize} strokeWidth={2} />, tooltip: "Icons", defaultType: 'emoji' as DrawingType },
  ];

  const actions = [
    { id: 'measure', icon: <TVMeasureIcon size={iconSize} />, tooltip: "Measure", onClick: () => setActiveTool('measure' as DrawingType) },
    { 
      id: 'zoom_in', 
      icon: <ZoomIn size={iconSize} strokeWidth={2} />, 
      tooltip: "Zoom In", 
      isActive: activeTool === 'zoom_in',
      onClick: () => setActiveTool(activeTool === 'zoom_in' ? null : 'zoom_in' as DrawingType) 
    },
    { 
      id: 'zoom_out', 
      icon: <ZoomOut size={iconSize} strokeWidth={2} />, 
      tooltip: "Zoom Out", 
      onClick: () => {
        // Dispatch a custom event to reset zoom in ChartContainer
        window.dispatchEvent(new CustomEvent('tv-zoom-out'));
      }
    },
    { 
      id: 'magnet', 
      icon: <Magnet size={iconSize} strokeWidth={2} />, 
      tooltip: "Magnet Mode snaps drawings placed near price bars to the closest OHLC value [Ctrl]",
      isActive: magnetMode !== 'off',
      onClick: () => setMagnetMode(magnetMode === 'off' ? 'strong' : 'off'),
      dropdownItems: [
        { id: 'weak', label: 'Weak Magnet', onClick: () => setMagnetMode('weak'), active: magnetMode === 'weak' },
        { id: 'strong', label: 'Strong Magnet', onClick: () => setMagnetMode('strong'), active: magnetMode === 'strong' }
      ]
    },
    { id: 'stay', icon: <StayInDrawingModeIcon size={iconSize} />, tooltip: "Stay in Drawing Mode" },
    {
      id: 'lock',
      icon: allDrawingsLocked ? <Lock size={iconSize} strokeWidth={2} /> : <Unlock size={iconSize} strokeWidth={2} />,
      tooltip: allDrawingsLocked ? "Unlock All Drawing Tools" : "Lock All Drawing Tools",
      isActive: allDrawingsLocked,
      onClick: toggleLockAllDrawings,
    },
    { id: 'hide', icon: <EyeOff size={iconSize} strokeWidth={2} />, tooltip: "Hide All Drawings" },
    { id: 'remove', icon: <Trash2 size={iconSize} strokeWidth={2} />, tooltip: "Remove Drawings", onClick: clearDrawings },
  ];

  const getGroupIcon = (group: ToolGroup) => {
    if (group.id === 'icons' && activeEmoji) {
      return <div style={{ fontSize: '16px', lineHeight: 1 }}>{activeEmoji}</div>;
    }
    if (!group.items) return group.defaultIcon;
    const currentActive = activeGroupTools[group.id];
    const item = group.items.find(i => i.type === currentActive);
    if (item) {
      // Force full, uniform opacity here regardless of how the dropdown-item icon
      // itself is styled (preserving any transform etc. already on it), so the
      // top-level button always matches its siblings.
      const iconEl = item.icon as React.ReactElement<any>;
      return React.cloneElement(iconEl, {
        size: iconSize,
        opacity: 1,
        style: { ...(iconEl.props?.style || {}), opacity: 1 },
      });
    }
    return group.defaultIcon;
  };

  const isGroupActive = (group: ToolGroup) => {
    if (group.id === 'icons') return activeTool === 'emoji';
    if (!group.items) return activeTool === group.defaultType;
    return group.items.some(i => i.type === activeTool) || (activeTool === null && group.id === 'crosshair') || (activeTool === 'cross' && group.id === 'crosshair');
  };

  return (
    <div ref={toolbarRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', padding: '2px 0', color: 'var(--tv-color-text)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '100%', alignItems: 'center' }}>
        {toolGroups.map((group) => {
          const isActive = isGroupActive(group);
          const hasDropdown = group.items && group.items.length > 0;
          
          return (
            <div key={group.id} style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
              <div className="tv-tooltip-container" style={{ position: 'relative' }}>
                <button 
                  className={`tv-icon-btn ${isActive ? "active" : ""}`} 
                  style={{ width: btnSize, height: btnSize, borderRadius: "4px", position: 'relative', color: isActive ? 'var(--tv-color-accent)' : 'var(--tv-color-text)' }}
                  onClick={() => handleToolClick(group)}
                >
                  {getGroupIcon(group)}
                  
                  {(hasDropdown || group.id === 'icons') && (
                    <div 
                      style={{ 
                        position: 'absolute', right: '1px', top: '50%', marginTop: '-4px', 
                        width: '8px', height: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--tv-color-text-muted)'
                      }}
                      onClick={(e) => handleArrowClick(e, group.id)}
                    >
                      <ChevronRight size={8} />
                    </div>
                  )}
                </button>
                <div className="tv-tooltip" style={{ left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: "8px", zIndex: 100 }}>
                  {group.tooltip}
                </div>
              </div>

              {openDropdown === group.id && group.id === 'icons' && (
                <EmojiGridPicker 
                  onSelect={(emoji) => {
                    setActiveEmoji(emoji);
                    setActiveTool('emoji');
                  }}
                />
              )}

              {openDropdown === group.id && group.items && (
                <div style={{
                  position: 'absolute', left: '100%', top: 0, marginLeft: '2px',
                  backgroundColor: 'var(--tv-color-pane-bg)', border: '1px solid var(--tv-color-border)',
                  borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  padding: '4px 0', zIndex: 100, width: '200px', display: 'flex', flexDirection: 'column'
                }}>
                  {group.items.map((item, idx) => (
                    item.isHeader ? (
                      <div key={idx} style={{ padding: '6px 12px 3px', fontSize: '10px', fontWeight: 600, color: 'var(--tv-color-text-muted)', letterSpacing: '0.5px' }}>
                        {item.label}
                      </div>
                    ) : (
                      <button
                        key={idx}
                        onClick={(e) => { if (item.type) handleDropdownItemClick(e, group.id, item.type); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                          padding: '6px 12px', width: '100%', border: 'none',
                          background: activeTool === item.type ? 'var(--tv-color-item-active)' : 'transparent',
                          color: activeTool === item.type ? 'var(--tv-color-accent)' : 'var(--tv-color-text)',
                          cursor: 'pointer', textAlign: 'left', fontSize: '12px'
                        }}
                        onMouseEnter={(e) => { 
                          setHoveredItemKey(`${group.id}-${idx}`);
                          e.currentTarget.style.background = activeTool === item.type ? 'var(--tv-color-item-active)' : 'var(--tv-color-item-hover)';
                        }}
                        onMouseLeave={(e) => {
                          setHoveredItemKey(null);
                          e.currentTarget.style.background = activeTool === item.type ? 'var(--tv-color-item-active)' : 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {item.icon}
                          {item.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {item.type && (
                            <div 
                              onClick={(e) => { e.stopPropagation(); toggleFavoriteTool(item.type!); }}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center',
                                opacity: favoriteTools.includes(item.type) ? 1 : (hoveredItemKey === `${group.id}-${idx}` ? 0.5 : 0)
                              }}
                            >
                              <Star 
                                size={14} 
                                fill={favoriteTools.includes(item.type) ? 'var(--tv-color-accent)' : 'transparent'}
                                color={favoriteTools.includes(item.type) ? 'var(--tv-color-accent)' : 'currentColor'}
                              />
                            </div>
                          )}
                          {item.shortcut && <span style={{ fontSize: '10px', color: 'var(--tv-color-text-muted)' }}>{item.shortcut}</span>}
                        </div>
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="tv-divider-h" style={{ margin: "6px 0", width: "28px" }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', width: '100%', alignItems: 'center' }}>
        {actions.map((action, i) => (
          <div key={i} className="tv-tooltip-container" style={{ position: 'relative' }}>
            <button 
              className={`tv-icon-btn ${action.isActive ? "active" : ""}`}
              style={{ width: btnSize, height: btnSize, borderRadius: "4px", color: action.isActive ? 'var(--tv-color-accent)' : 'var(--tv-color-text)' }}
              onClick={action.onClick}
            >
              {action.icon}
              {action.dropdownItems && (
                <div 
                  style={{ 
                    position: 'absolute', right: '1px', top: '50%', marginTop: '-4px', 
                    width: '8px', height: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--tv-color-text-muted)'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === action.id ? null : action.id!);
                  }}
                >
                  <ChevronRight size={8} />
                </div>
              )}
            </button>
            <div className="tv-tooltip" style={{ left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: "8px", zIndex: 100 }}>
              {action.tooltip}
            </div>

            {openDropdown === action.id && action.dropdownItems && (
              <div style={{
                position: 'absolute', left: '100%', top: 0, marginLeft: '2px',
                backgroundColor: 'var(--tv-color-pane-bg)', border: '1px solid var(--tv-color-border)',
                borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: '4px 0', zIndex: 100, width: '150px', display: 'flex', flexDirection: 'column'
              }}>
                {action.dropdownItems.map((item, idx) => (
                  <button
                    key={idx}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '6px 12px',
                      fontSize: '13px', backgroundColor: 'transparent',
                      color: item.active ? 'var(--tv-color-accent)' : 'var(--tv-color-text)',
                      textAlign: 'left', width: '100%'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-color-item-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onClick();
                      setOpenDropdown(null);
                    }}
                  >
                    <div style={{ width: '16px', marginRight: '8px', display: 'flex', justifyContent: 'center' }}>
                      {item.active && <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'currentColor' }} />}
                    </div>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="tv-tooltip-container" style={{ marginTop: 'auto', marginBottom: '12px' }}>
        <button 
          className="tv-icon-btn" 
          style={{ 
            width: '32px', 
            height: '32px', 
            borderRadius: '6px', 
            color: isFavoritesToolbarVisible ? '#ffffff' : 'var(--tv-color-text)',
            backgroundColor: isFavoritesToolbarVisible ? '#2a2e39' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s'
          }}
          onClick={() => setIsFavoritesToolbarVisible(!isFavoritesToolbarVisible)}
        >
          <Star size={iconSize} strokeWidth={2} fill="transparent" />
        </button>
        <div className="tv-tooltip" style={{ left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: "8px", zIndex: 100 }}>
          {isFavoritesToolbarVisible ? 'Hide Favorite Drawings Toolbar' : 'Show Favorite Drawings Toolbar'}
        </div>
      </div>
    </div>
  );
}
