"use client";

// The drawing toolbar, laid out as TradingView's: 34px buttons 38px apart with a neutral chip
// for the active tool, a flyout arrow that appears on hover, and separators between the tool
// groups, the zoom tools, the drawing modes and Remove objects.

import { TvToolIcon } from "./icons/tvToolIcons";
import React, { useState, useRef, useEffect } from "react";
import { Circle, MousePointer2, PlayCircle, Wand2, Eraser, Star } from "lucide-react";
import { useDrawing, DrawingType } from "./drawing/core/DrawingContext";
import { EmojiGridPicker } from "./ui/EmojiGridPicker";
import { PickedGlyph } from "./ui/emojiArt";
import { placeBeside, useCloseOnAnchorScroll } from "../lib/anchoredPopup";
import { useEscapeClose } from "../lib/useEscapeClose";
import { Tip, TipKey } from "../trading/ui";
import {
  TVCrosshairIcon,
  TVMeasureIcon,
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
  TVShortPositionIcon,
  TVTextToolIcon,
  TVEmojiToolIcon,
  TVZoomInIcon,
  TVZoomOutIcon,
  TVMagnetIcon,
  TVKeepDrawingIcon,
  TVLockToolIcon,
  TVHideDrawingsIcon,
  TVTrashIcon,
  TVStarOutlineIcon,
} from "./icons/TVIcons";

interface ToolItem {
  type?: DrawingType | null;
  label: string;
  icon?: React.ReactNode;
  /** Keyboard shortcut, as keycaps (e.g. ["Alt", "J"]) */
  keys?: string[];
  /** Extra hint after the name in the button's tooltip */
  hint?: React.ReactNode;
  isHeader?: boolean;
}

interface ToolGroup {
  id: string;
  defaultIcon: React.ReactNode;
  tooltip: string;
  items?: ToolItem[];
  defaultType?: DrawingType | null;
}

const Keys = ({ keys }: { keys: string[] }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
    {keys.map((k, i) => <React.Fragment key={k}>{i > 0 && "+"}<TipKey>{k}</TipKey></React.Fragment>)}
  </span>
);

// "Name | hint" tooltips (Trendline, Measure) stay on one line with a divider, as on TradingView
const Hinted = ({ name, hint }: { name: string; hint: React.ReactNode }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
    {name}
    <span style={{ width: 1, alignSelf: "stretch", margin: "-2px 0", background: "rgba(255,255,255,0.25)" }} />
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{hint}</span>
  </span>
);

const Chevron = () => (
  <svg width="6" height="10" viewBox="0 0 6 10" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M1 1l4 4-4 4" /></svg>
);

export default function LeftToolbar({ indicatorCount = 0, onRemoveIndicators }: { indicatorCount?: number; onRemoveIndicators?: () => void }) {
  const {
    activeTool, setActiveTool, drawings, clearDrawings, activeEmoji, setActiveEmoji, favoriteTools, toggleFavoriteTool,
    isFavoritesToolbarVisible, setIsFavoritesToolbarVisible, magnetMode, setMagnetMode, allDrawingsLocked, toggleLockAllDrawings,
    allDrawingsHidden, toggleHideAllDrawings, keepDrawing, setKeepDrawing,
  } = useDrawing();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [hoveredItemKey, setHoveredItemKey] = useState<string | null>(null);
  const [activeGroupTools, setActiveGroupTools] = useState<Record<string, DrawingType | null>>({
    'crosshair': null,
    'trendlines': 'trendline',
    'fibonacci': 'fibonacci',
    'shapes': null,
    'text': 'text',
  });
  // How many Zoom In steps can be undone; Zoom Out only shows while there are some (as on TradingView)
  const [zoomDepth, setZoomDepth] = useState(0);
  useEffect(() => {
    setZoomDepth(((window as any).__zoomStack || []).length);
    const onDepth = (e: Event) => setZoomDepth((e as CustomEvent<number>).detail || 0);
    window.addEventListener('tv:zoom-depth', onDepth);
    return () => window.removeEventListener('tv:zoom-depth', onDepth);
  }, []);

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
    const hasDropdown = group.items && group.items.length > 0;
    if (hasDropdown) {
      const firstValidItem = group.items!.find(item => !item.isHeader && item.type);
      const toolToActivate = activeGroupTools[group.id] ?? firstValidItem?.type;
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

  // Flyouts open level with their button, fixed-positioned so the toolbar can scroll on
  // touch screens without clipping them; placeBeside moves one up if it would run off the
  // bottom of the window (as TradingView's do). Scrolling the toolbar closes it.
  const buttonElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const closeDropdown = React.useCallback(() => setOpenDropdown(null), []);
  const toolbarTop = () => toolbarRef.current?.getBoundingClientRect().top ?? 8;
  useCloseOnAnchorScroll(toolbarRef, openDropdown !== null, closeDropdown);
  useEscapeClose(closeDropdown, openDropdown !== null);

  const toggleDropdown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenDropdown(openDropdown === id ? null : id);
  };

  const icon = 28;
  const menuIcon = 28;

  const toolGroups: ToolGroup[] = [
    {
      id: 'crosshair',
      defaultIcon: <TVCrosshairIcon size={icon} />,
      tooltip: "Cross",
      defaultType: 'cross' as DrawingType,
      items: [
        { type: "cross" as DrawingType, label: "Cross", icon: <TVCrosshairIcon size={menuIcon} /> },
        { type: "dot" as DrawingType, label: "Dot", icon: <Circle size={menuIcon * 0.3} fill="currentColor" style={{ margin: menuIcon * 0.35 }} /> },
        { type: "arrow_cursor" as DrawingType, label: "Arrow", icon: <MousePointer2 size={18} strokeWidth={1.25} style={{ transform: 'rotate(-45deg)', margin: 5 }} /> },
        { type: "demonstration" as DrawingType, label: "Demonstration", icon: <PlayCircle size={18} strokeWidth={1.25} style={{ margin: 5 }} /> },
        { type: "magic" as DrawingType, label: "Magic", icon: <Wand2 size={18} strokeWidth={1.25} style={{ margin: 5 }} /> },
        { isHeader: true, label: "" },
        { type: "eraser" as DrawingType, label: "Eraser", icon: <Eraser size={18} strokeWidth={1.25} style={{ margin: 5 }} />, keys: ["Alt", "E"] },
      ]
    },
    {
      id: 'trendlines',
      defaultIcon: <TvToolIcon id="LineToolTrendLine" size={icon} />,
      tooltip: "Trendline",
      items: [
        { isHeader: true, label: "LINES" },
        {
          type: "trendline" as DrawingType, label: "Trend line", icon: <TvToolIcon id="LineToolTrendLine" size={menuIcon} />, keys: ["Alt", "T"],
          hint: <><TipKey>Shift</TipKey> — drawing a straight line at angles of 45°</>,
        },
        { type: "ray" as DrawingType, label: "Ray", icon: <TvToolIcon id="LineToolRay" size={menuIcon} /> },
        { type: "info_line" as DrawingType, label: "Info line", icon: <TvToolIcon id="LineToolInfoLine" size={menuIcon} /> },
        { type: "extended_line" as DrawingType, label: "Extended line", icon: <TvToolIcon id="LineToolExtended" size={menuIcon} /> },
        { type: "trend_angle" as DrawingType, label: "Trend angle", icon: <TvToolIcon id="LineToolTrendAngle" size={menuIcon} /> },
        { type: "horizontal_line" as DrawingType, label: "Horizontal line", icon: <TvToolIcon id="LineToolHorzLine" size={menuIcon} />, keys: ["Alt", "H"] },
        { type: "horizontal_ray" as DrawingType, label: "Horizontal ray", icon: <TvToolIcon id="LineToolHorzRay" size={menuIcon} />, keys: ["Alt", "J"] },
        { type: "vertical_line" as DrawingType, label: "Vertical line", icon: <TvToolIcon id="LineToolVertLine" size={menuIcon} />, keys: ["Alt", "V"] },
        { type: "cross_line" as DrawingType, label: "Cross line", icon: <TvToolIcon id="LineToolCrossLine" size={menuIcon} />, keys: ["Alt", "C"] },
      ]
    },
    {
      id: 'fibonacci',
      defaultIcon: <TVFibonacciIcon size={icon} />,
      tooltip: "Fib retracement",
      items: [
        { isHeader: true, label: "FIBONACCI" },
        { type: "fibonacci" as DrawingType, label: "Fib retracement", icon: <TVFibonacciIcon size={menuIcon} />, keys: ["Alt", "F"] },
      ]
    },
    {
      id: 'prediction',
      defaultIcon: <TVLongPositionIcon size={icon} />,
      tooltip: "Long position",
      items: [
        { isHeader: true, label: "PROJECTION" },
        { type: "long_position" as DrawingType, label: "Long position", icon: <TVLongPositionIcon size={menuIcon} /> },
        { type: "short_position" as DrawingType, label: "Short position", icon: <TVShortPositionIcon size={menuIcon} /> },
      ]
    },
    {
      id: 'shapes',
      defaultIcon: <TVBrushIcon size={icon} />,
      tooltip: "Brush",
      items: [
        { isHeader: true, label: "BRUSHES" },
        { type: "brush" as DrawingType, label: "Brush", icon: <TVBrushStrokeIcon size={menuIcon} />, keys: ["Alt", "B"] },
        { type: "highlighter" as DrawingType, label: "Highlighter", icon: <TVHighlighterIcon size={menuIcon} /> },
        { isHeader: true, label: "ARROWS" },
        { type: "arrow_marker" as DrawingType, label: "Arrow marker", icon: <TVArrowMarkerIcon size={menuIcon} /> },
        { type: "arrow" as DrawingType, label: "Arrow", icon: <TVArrowIcon size={menuIcon} /> },
        { type: "arrow_mark_up" as DrawingType, label: "Arrow mark up", icon: <TVArrowMarkUpIcon size={menuIcon} /> },
        { type: "arrow_mark_down" as DrawingType, label: "Arrow mark down", icon: <TVArrowMarkDownIcon size={menuIcon} /> },
        { isHeader: true, label: "SHAPES" },
        { type: "rectangle" as DrawingType, label: "Rectangle", icon: <TVRectangleIcon size={menuIcon} />, keys: ["Alt", "Shift", "R"] },
        { type: "rotated_rectangle" as DrawingType, label: "Rotated rectangle", icon: <TVRotatedRectangleIcon size={menuIcon} /> },
        { type: "path" as DrawingType, label: "Path", icon: <TVPathIcon size={menuIcon} /> },
        { type: "circle" as DrawingType, label: "Circle", icon: <TVCircleIcon size={menuIcon} /> },
        { type: "ellipse" as DrawingType, label: "Ellipse", icon: <TVEllipseIcon size={menuIcon} /> },
        { type: "polyline" as DrawingType, label: "Polyline", icon: <TVPolylineIcon size={menuIcon} /> },
        { type: "triangle" as DrawingType, label: "Triangle", icon: <TVTriangleIcon size={menuIcon} /> },
        { type: "arc" as DrawingType, label: "Arc", icon: <TVArcIcon size={menuIcon} /> },
        { type: "curve" as DrawingType, label: "Curve", icon: <TVCurveIcon size={menuIcon} /> },
        { type: "double_curve" as DrawingType, label: "Double curve", icon: <TVDoubleCurveIcon size={menuIcon} /> },
      ]
    },
    {
      id: 'text',
      defaultIcon: <TVTextToolIcon size={icon} />,
      tooltip: "Text",
      items: [
        { isHeader: true, label: "TEXT & NOTES" },
        { type: "text" as DrawingType, label: "Text", icon: <TVTextToolIcon size={menuIcon} /> },
      ]
    },
    { id: 'icons', defaultIcon: <TVEmojiToolIcon size={icon} />, tooltip: "Icon", defaultType: 'emoji' as DrawingType },
  ];

  const getGroupIcon = (group: ToolGroup) => {
    if (group.id === 'icons' && activeEmoji) {
      return <PickedGlyph value={activeEmoji} size={22} />;
    }
    if (!group.items) return group.defaultIcon;
    const item = group.items.find(i => !i.isHeader && i.type === activeGroupTools[group.id]);
    return item?.icon ?? group.defaultIcon;
  };

  // The tool a group's button currently stands for (the last one picked from its flyout, else
  // the first): what its icon shows, what a click activates, and what its tooltip names
  const getGroupCurrentItem = (group: ToolGroup) => {
    if (!group.items || group.id === 'icons') return undefined;
    const current = activeGroupTools[group.id];
    return group.items.find(i => !i.isHeader && i.type && i.type === current)
      ?? group.items.find(i => !i.isHeader && i.type);
  };

  const isGroupActive = (group: ToolGroup) => {
    if (group.id === 'icons') return activeTool === 'emoji';
    if (!group.items) return activeTool === group.defaultType;
    return group.items.some(i => i.type === activeTool) || (activeTool === null && group.id === 'crosshair');
  };

  const groupTooltip = (group: ToolGroup) => {
    const item = getGroupCurrentItem(group);
    if (!item) return group.tooltip;
    const name = item.type === 'trendline' ? 'Trendline' : item.label;
    if (item.hint) return <Hinted name={name} hint={item.hint} />;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {name}
        {item.keys && <Keys keys={item.keys} />}
      </span>
    );
  };

  const menuStyle: React.CSSProperties = {
    position: 'absolute', left: '100%', top: 0, marginLeft: '2px',
    backgroundColor: 'var(--tv-color-pane-bg)', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
    padding: '6px 0', zIndex: 100, display: 'flex', flexDirection: 'column', color: 'var(--tv-hdr-text)',
  };
  const menuRow = (key: string, active: boolean, onClick: (e: React.MouseEvent) => void, content: React.ReactNode, right?: React.ReactNode) => (
    <button
      key={key}
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        minHeight: '38px', padding: '0 12px 0 8px', width: '100%', border: 'none',
        background: active ? 'var(--tv-active-neutral)' : 'transparent', color: 'inherit',
        cursor: 'pointer', textAlign: 'left', fontSize: '14px', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { setHoveredItemKey(key); if (!active) e.currentTarget.style.background = 'var(--tv-hover-neutral)'; }}
      onMouseLeave={(e) => { setHoveredItemKey(null); e.currentTarget.style.background = active ? 'var(--tv-active-neutral)' : 'transparent'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{content}</span>
      {right && <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{right}</span>}
    </button>
  );

  // One toolbar button: its chip, tooltip and (for the ones with a flyout) the hover arrow
  const button = (id: string, opts: {
    icon: React.ReactNode; tip: React.ReactNode; active?: boolean; onClick: () => void; flyout?: boolean; label?: string; wideTip?: boolean;
  }, menu?: React.ReactNode) => (
    <div key={id} className="tv-lt-item" ref={el => { buttonElsRef.current[id] = el; }}>
      <Tip text={opts.tip} placement="right" delay={400} maxWidth={opts.wideTip ? 640 : undefined}>
        <button
          className={`tv-lt-btn ${opts.active ? "active" : ""}`}
          aria-label={opts.label}
          aria-pressed={opts.active}
          onClick={opts.onClick}
        >
          {opts.icon}
        </button>
      </Tip>
      {opts.flyout && (
        <span
          className="tv-lt-arrow"
          role="button"
          aria-label={`${opts.label ?? id} options`}
          style={openDropdown === id ? { opacity: 1 } : undefined}
          onClick={(e) => toggleDropdown(e, id)}
        >
          <Chevron />
        </span>
      )}
      {openDropdown === id && menu}
    </div>
  );

  const drawingCount = drawings.filter(d => d.type !== 'measure').length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <div ref={toolbarRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', padding: '4px 0', gap: '4px', color: 'var(--tv-hdr-text)' }}>
      {toolGroups.map((group) => {
        const hasDropdown = !!(group.items && group.items.length > 0);
        const currentItem = getGroupCurrentItem(group);
        const menu = group.id === 'icons' ? (
          <EmojiGridPicker
            popupRef={el => placeBeside(el, buttonElsRef.current[group.id], 4, toolbarTop())}
            onSelect={(emoji) => {
              setActiveEmoji(emoji);
              setActiveTool('emoji');
            }}
          />
        ) : group.items ? (
          <div role="menu" ref={el => placeBeside(el, buttonElsRef.current[group.id], 2, toolbarTop())} style={{ ...menuStyle, width: group.id === 'shapes' ? '270px' : '250px' }}>
            {group.items.map((item, idx) => item.isHeader ? (
              item.label
                ? <div key={idx} style={{ padding: '8px 14px 4px', fontSize: '11px', fontWeight: 600, color: 'var(--tv-color-text-muted)', letterSpacing: '0.4px' }}>{item.label}</div>
                : <div key={idx} style={{ height: 1, margin: '6px 0', background: 'var(--tv-active-neutral)' }} />
            ) : menuRow(
              `${group.id}-${idx}`,
              activeTool === item.type || (!activeTool && item.type === 'cross'),
              (e) => { if (item.type) handleDropdownItemClick(e, group.id, item.type); },
              <>{item.icon}<span>{item.label}</span></>,
              <>
                {item.keys && <span style={{ fontSize: '12px', color: 'var(--tv-color-text-muted)' }}>{item.keys.join(' + ')}</span>}
                {item.type && (
                  <span
                    role="button"
                    aria-label={favoriteTools.includes(item.type) ? `Remove ${item.label} from favorites` : `Add ${item.label} to favorites`}
                    onClick={(e) => { e.stopPropagation(); toggleFavoriteTool(item.type!); }}
                    style={{ display: 'flex', alignItems: 'center', opacity: favoriteTools.includes(item.type) ? 1 : (hoveredItemKey === `${group.id}-${idx}` ? 0.6 : 0) }}
                  >
                    <Star size={16} strokeWidth={1.5}
                      fill={favoriteTools.includes(item.type) ? '#f7a600' : 'transparent'}
                      color={favoriteTools.includes(item.type) ? '#f7a600' : 'currentColor'} />
                  </span>
                )}
              </>,
            ))}
          </div>
        ) : null;
        return button(group.id, {
          icon: getGroupIcon(group),
          tip: groupTooltip(group),
          active: isGroupActive(group),
          onClick: () => handleToolClick(group),
          flyout: hasDropdown || group.id === 'icons',
          label: currentItem?.label ?? group.tooltip,
          wideTip: !!currentItem?.hint,
        }, menu);
      })}

      <div className="tv-lt-sep" />

      {button('measure', {
        icon: <TVMeasureIcon size={icon} />,
        tip: <Hinted name="Measure" hint={<><TipKey>Shift</TipKey>+ Click on the chart</>} />,
        wideTip: true,
        active: activeTool === 'measure',
        onClick: () => setActiveTool(activeTool === 'measure' ? null : 'measure' as DrawingType),
        label: 'Measure',
      })}
      {button('zoom_in', {
        icon: <TVZoomInIcon size={icon} />,
        tip: 'Zoom in',
        active: activeTool === 'zoom_in',
        onClick: () => setActiveTool(activeTool === 'zoom_in' ? null : 'zoom_in' as DrawingType),
        label: 'Zoom in',
      })}
      {zoomDepth > 0 && button('zoom_out', {
        icon: <TVZoomOutIcon size={icon} />,
        tip: 'Zoom out',
        onClick: () => window.dispatchEvent(new CustomEvent('tv-zoom-out')),
        label: 'Zoom out',
      })}

      <div className="tv-lt-sep" />

      {button('magnet', {
        icon: <TVMagnetIcon size={icon} />,
        tip: 'Magnet mode snaps drawings placed near price bars to the closest OHLC value',
        active: magnetMode !== 'off',
        onClick: () => setMagnetMode(magnetMode === 'off' ? 'weak' : 'off'),
        flyout: true,
        label: 'Magnet',
      }, (
        <div role="menu" ref={el => placeBeside(el, buttonElsRef.current['magnet'], 2, toolbarTop())} style={{ ...menuStyle, width: '200px' }}>
          {([['weak', 'Weak magnet'], ['strong', 'Strong magnet']] as const).map(([mode, label]) => menuRow(
            `magnet-${mode}`,
            magnetMode === mode,
            (e) => { e.stopPropagation(); setMagnetMode(magnetMode === mode ? 'off' : mode); setOpenDropdown(null); },
            <><TVMagnetIcon size={menuIcon} /><span>{label}</span></>,
          ))}
        </div>
      ))}
      {button('keep', {
        icon: <TVKeepDrawingIcon size={icon} />,
        tip: 'Keep drawing',
        active: keepDrawing,
        onClick: () => setKeepDrawing(!keepDrawing),
        label: 'Keep drawing',
      })}
      {button('lock', {
        icon: <TVLockToolIcon size={icon} locked={allDrawingsLocked} />,
        tip: allDrawingsLocked ? 'Unlock all drawings' : 'Lock all drawings',
        active: allDrawingsLocked,
        onClick: toggleLockAllDrawings,
        label: 'Lock all drawings',
      })}
      {button('hide', {
        icon: <TVHideDrawingsIcon size={icon} hidden={allDrawingsHidden} />,
        tip: <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{allDrawingsHidden ? 'Show all drawings' : 'Hide all drawings'} <Keys keys={["Ctrl", "Alt", "H"]} /></span>,
        active: allDrawingsHidden,
        onClick: toggleHideAllDrawings,
        label: 'Hide all drawings',
      })}

      <div className="tv-lt-sep" />

      {button('remove', {
        icon: <TVTrashIcon size={icon} />,
        tip: 'Remove objects',
        onClick: clearDrawings,
        flyout: true,
        label: 'Remove objects',
      }, (
        <div role="menu" ref={el => placeBeside(el, buttonElsRef.current['remove'], 2, toolbarTop())} style={{ ...menuStyle, width: '270px' }}>
          {menuRow('rm-drawings', false, (e) => { e.stopPropagation(); clearDrawings(); setOpenDropdown(null); },
            <><TVTrashIcon size={menuIcon} /><span>Remove {plural(drawingCount, 'drawing')}</span></>)}
          {menuRow('rm-indicators', false, (e) => { e.stopPropagation(); onRemoveIndicators?.(); setOpenDropdown(null); },
            <><TVTrashIcon size={menuIcon} /><span>Remove {plural(indicatorCount, 'indicator')}</span></>)}
          {menuRow('rm-all', false, (e) => { e.stopPropagation(); clearDrawings(); onRemoveIndicators?.(); setOpenDropdown(null); },
            <><TVTrashIcon size={menuIcon} /><span>Remove {plural(drawingCount, 'drawing')} & {plural(indicatorCount, 'indicator')}</span></>)}
        </div>
      ))}

      <div style={{ marginTop: 'auto', paddingBottom: '8px' }}>
        <Tip text={isFavoritesToolbarVisible ? 'Hide Favorite Drawing Tools Toolbar' : 'Show Favorite Drawing Tools Toolbar'} placement="right" delay={400}>
          <button
            className="tv-lt-btn"
            aria-label="Favorite drawing tools toolbar"
            aria-pressed={isFavoritesToolbarVisible}
            style={isFavoritesToolbarVisible ? { background: '#2e2e2e', color: '#ffffff' } : undefined}
            onClick={() => setIsFavoritesToolbarVisible(!isFavoritesToolbarVisible)}
          >
            <TVStarOutlineIcon size={icon} />
          </button>
        </Tip>
      </div>
    </div>
  );
}
