"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SymbolSearch from "./SymbolSearch";
import IndicatorsModal from "./IndicatorsModal";
import { useDrawing } from "./drawing/core/DrawingContext";
import { useAuth } from "@/context/AuthContext";
import { loadFavoriteIndicators } from "@/app/utils/favoriteIndicators";
import Link from 'next/link';
import {
  Search,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Maximize,
  Camera,
  Undo2,
  Redo2,
  Moon,
  Sun,
  AlarmClockPlus,
  Save,
  Plus,
  ChevronsLeft,
  Star,
  ChartNoAxesCombined
} from "lucide-react";
import { TVSettingsIcon } from "./icons/TVIcons";

interface TopBarProps {
  theme: string;
  toggleTheme: () => void;
  interval: string;
  onIntervalChange: (interval: string, label?: string) => void;
  onReplayClick?: () => void;
  isReplayActive?: boolean;
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  onIndicatorSelect?: (indicator: string) => void;
  isBotActive: boolean;
  onToggleBot: () => void;
  onAlertClick?: () => void;
  symbolSearchOpen?: boolean;
  symbolSearchInitial?: string;
  onSymbolSearchClose?: () => void;
  onSettingsClick?: () => void;
  onMaximizeClick?: () => void;
}

interface TFItem { display: string; value: string; short: string; }
interface TFGroup { label: string; items: TFItem[]; disabled?: boolean; }

// Groups shown in the "more timeframes" dropdown, styled after TradingView's interval picker.
// TICKS / SECONDS / RANGES are real trade-tick-based bar types that this app's data source
// (TwelveData's time_series endpoint) cannot produce — it only serves 1-minute-or-coarser
// OHLC candles — so those three groups are rendered but disabled.
const TIMEFRAME_GROUPS: TFGroup[] = [
  {
    label: "TICKS",
    disabled: true,
    items: [
      { display: "1 tick", value: "1t", short: "1t" },
      { display: "10 ticks", value: "10t", short: "10t" },
      { display: "100 ticks", value: "100t", short: "100t" },
      { display: "1000 ticks", value: "1000t", short: "1000t" },
    ],
  },
  {
    label: "SECONDS",
    disabled: true,
    items: [
      { display: "1 second", value: "1s", short: "1s" },
      { display: "5 seconds", value: "5s", short: "5s" },
      { display: "10 seconds", value: "10s", short: "10s" },
      { display: "15 seconds", value: "15s", short: "15s" },
      { display: "30 seconds", value: "30s", short: "30s" },
      { display: "45 seconds", value: "45s", short: "45s" },
    ],
  },
  {
    label: "MINUTES",
    items: [
      { display: "1 minute", value: "1min", short: "1m" },
      { display: "2 minutes", value: "2min", short: "2m" },
      { display: "3 minutes", value: "3min", short: "3m" },
      { display: "5 minutes", value: "5min", short: "5m" },
      { display: "10 minutes", value: "10min", short: "10m" },
      { display: "15 minutes", value: "15min", short: "15m" },
      { display: "30 minutes", value: "30min", short: "30m" },
      { display: "45 minutes", value: "45min", short: "45m" },
    ],
  },
  {
    label: "HOURS",
    items: [
      { display: "1 hour", value: "1h", short: "1h" },
      { display: "2 hours", value: "2h", short: "2h" },
      { display: "3 hours", value: "3h", short: "3h" },
      { display: "4 hours", value: "4h", short: "4h" },
    ],
  },
  {
    label: "DAYS",
    items: [
      { display: "1 day", value: "1day", short: "D" },
      { display: "1 week", value: "1week", short: "W" },
      { display: "1 month", value: "1month", short: "M" },
      { display: "3 months", value: "3month", short: "3M" },
      { display: "6 months", value: "6month", short: "6M" },
      { display: "12 months", value: "12month", short: "12M" },
    ],
  },
  {
    label: "RANGES",
    disabled: true,
    items: [
      { display: "1 range", value: "1r", short: "1R" },
      { display: "10 ranges", value: "10r", short: "10R" },
      { display: "100 ranges", value: "100r", short: "100R" },
      { display: "1000 ranges", value: "1000r", short: "1000R" },
    ],
  },
];

const ALL_TF_ITEMS = TIMEFRAME_GROUPS.flatMap(g => g.items);

const DEFAULT_FAVORITES = ["1min", "5min", "15min", "30min", "45min", "1h", "4h"];
const FAVORITES_STORAGE_KEY = "tv:favoriteIntervals";

function getShortLabel(value: string): string {
  const found = ALL_TF_ITEMS.find(i => i.value === value);
  if (found) return found.short;
  const mMin = value.match(/^(\d+)min$/);
  if (mMin) return `${mMin[1]}m`;
  const mHour = value.match(/^(\d+)h$/);
  if (mHour) return `${mHour[1]}h`;
  const mMonth = value.match(/^(\d+)month$/);
  if (mMonth) return `${mMonth[1]}M`;
  return value;
}

function loadFavoriteIntervals(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return DEFAULT_FAVORITES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(v => typeof v === "string") && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_FAVORITES;
  } catch {
    return DEFAULT_FAVORITES;
  }
}

function saveFavoriteIntervals(values: string[]) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — favorites just won't persist
  }
}

// Deterministic per-user avatar color, same idea as the colored initials used in the watchlist
const AVATAR_COLORS = ["#8c7ae6", "#2962ff", "#00bcd4", "#e91e63", "#ff9800", "#4caf50", "#f23645", "#9c27b0"];

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function TopBar({ theme, toggleTheme, interval, onIntervalChange, onReplayClick, isReplayActive, symbol, onSymbolChange, onIndicatorSelect, isBotActive, onToggleBot, onAlertClick, symbolSearchOpen, symbolSearchInitial, onSymbolSearchClose, onSettingsClick, onMaximizeClick }: TopBarProps) {
  const [showSymbolSearchInternal, setShowSymbolSearchInternal] = useState(false);
  const [internalSearchInitial, setInternalSearchInitial] = useState("");
  const showSymbolSearch = showSymbolSearchInternal || !!symbolSearchOpen;
  const [showIndicatorsModal, setShowIndicatorsModal] = useState(false);
  const [showMoreTf, setShowMoreTf] = useState(false);
  const [showFavIndicators, setShowFavIndicators] = useState(false);
  const [favoriteIndicators, setFavoriteIndicators] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>(DEFAULT_FAVORITES);
  const tfMenuRef = useRef<HTMLDivElement>(null);
  const favIndicatorsMenuRef = useRef<HTMLDivElement>(null);
  const { undo, redo, canUndo, canRedo } = useDrawing();
  const { user } = useAuth();

  const avatarLetter = (user?.displayName?.trim()?.[0] || user?.email?.trim()?.[0] || "T").toUpperCase();
  const avatarColor = getAvatarColor(user?.uid || user?.email || "guest");

  // Listen for global keyboard shortcut to open indicators
  useEffect(() => {
    const handler = () => setShowIndicatorsModal(true);
    window.addEventListener('tv:open-indicators' as any, handler);
    return () => window.removeEventListener('tv:open-indicators' as any, handler);
  }, []);

  // Load favorited timeframes from localStorage once on mount
  useEffect(() => {
    setFavorites(loadFavoriteIntervals());
  }, []);

  // Close the "more timeframes" dropdown on outside click
  useEffect(() => {
    if (!showMoreTf) return;
    const handleClick = (e: MouseEvent) => {
      if (tfMenuRef.current && !tfMenuRef.current.contains(e.target as Node)) {
        setShowMoreTf(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMoreTf]);

  // Close the "favorite indicators" dropdown on outside click
  useEffect(() => {
    if (!showFavIndicators) return;
    const handleClick = (e: MouseEvent) => {
      if (favIndicatorsMenuRef.current && !favIndicatorsMenuRef.current.contains(e.target as Node)) {
        setShowFavIndicators(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showFavIndicators]);

  const toggleFavoriteInterval = useCallback((value: string) => {
    setFavorites(prev => {
      const next = prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value];
      saveFavoriteIntervals(next);
      return next;
    });
  }, []);

  const selectInterval = useCallback((value: string) => {
    onIntervalChange(value, getShortLabel(value));
    setShowMoreTf(false);
  }, [onIntervalChange]);

  const btnH = "28px";
  const iconS = 16;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1px", height: "100%", minWidth: 0 }}>
        {/* App avatar with notification badge */}
        <button
          className="tv-icon-btn"
          style={{ width: "28px", height: btnH, position: "relative", padding: 0 }}
        >
          <div style={{
            width: "24px", height: "24px", borderRadius: "50%",
            backgroundColor: avatarColor, color: "#ffffff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "12px", fontWeight: 700, flexShrink: 0
          }}>
            {avatarLetter}
          </div>
          <div style={{
            position: "absolute", top: "0px", right: "0px",
            backgroundColor: "#f23645", color: "white", fontSize: "9px", fontWeight: 700,
            borderRadius: "6px", padding: "0 4px", lineHeight: "14px", minWidth: "14px", textAlign: "center"
          }}>3</div>
        </button>

        {/* Symbol */}
        <button
          className="tv-icon-btn"
          onClick={() => { setInternalSearchInitial(""); setShowSymbolSearchInternal(true); }}
          style={{ height: btnH, width: "auto", padding: "0 8px", fontWeight: 700, fontSize: "14px", color: "var(--tv-color-text)" }}
        >
          {symbol}
        </button>

        {showSymbolSearch && (
          <SymbolSearch
            onClose={() => { setShowSymbolSearchInternal(false); onSymbolSearchClose?.(); }}
            onSelect={(s) => {
              onSymbolChange(s);
              setShowSymbolSearchInternal(false);
              onSymbolSearchClose?.();
            }}
            initialSearch={symbolSearchOpen ? (symbolSearchInitial || "") : internalSearchInitial}
          />
        )}

        {/* Symbol info diamond */}
        <button className="tv-icon-btn" style={{ width: "24px", height: btnH }}>
          <div style={{ width: "9px", height: "9px", border: "1.5px solid currentColor", transform: "rotate(45deg)" }} />
        </button>

        {/* Add (compare/indicator) button */}
        <button className="tv-icon-btn" style={{ width: "24px", height: btnH }}>
          <div style={{
            width: "18px", height: "18px", borderRadius: "50%",
            border: "1.5px solid currentColor",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Plus size={11} strokeWidth={2.5} />
          </div>
        </button>

        <div className="tv-divider-v" style={{ height: "16px" }} />

        {/* Timeframes */}
        <div style={{ display: "flex", gap: "0px" }}>
          {favorites.map((value) => (
            <button
              key={value}
              className={`tv-icon-btn ${interval === value ? "active" : ""}`}
              style={{ height: btnH, width: "auto", padding: "0 6px", fontSize: "13px", fontWeight: interval === value ? 700 : 400 }}
              onClick={() => selectInterval(value)}
            >
              {getShortLabel(value)}
            </button>
          ))}
          {/* More timeframes dropdown */}
          <div style={{ position: "relative" }} ref={tfMenuRef}>
            <button
              className={`tv-icon-btn ${!favorites.includes(interval) ? "active" : ""}`}
              style={{ height: btnH, width: "auto", padding: "0 4px", fontSize: "13px", display: "flex", alignItems: "center", gap: "2px" }}
              onClick={() => setShowMoreTf(!showMoreTf)}
            >
              {!favorites.includes(interval) ? getShortLabel(interval) : ""}
              <ChevronDown size={12} strokeWidth={2} />
            </button>
            {showMoreTf && (
              <TimeframeDropdown
                interval={interval}
                favorites={favorites}
                onSelect={selectInterval}
                onToggleFavorite={toggleFavoriteInterval}
              />
            )}
          </div>
        </div>

        <div className="tv-divider-v" style={{ height: "16px" }} />

        {/* Chart type */}
        <button className="tv-icon-btn" style={{ width: "28px", height: btnH }}>
          <BarChart2 size={iconS} strokeWidth={1.5} />
        </button>

        <div className="tv-divider-v" style={{ height: "16px" }} />

        {/* Indicators */}
        <button
          className="tv-icon-btn"
          style={{ height: btnH, width: "auto", padding: "0 8px", display: "flex", alignItems: "center", gap: "4px" }}
          onClick={() => setShowIndicatorsModal(true)}
        >
          <ChartNoAxesCombined size={iconS} strokeWidth={1.5} />
          <span style={{ fontSize: "13px", fontWeight: 400 }}>Indicators</span>
        </button>

        {/* Favorite indicators quick-access */}
        <div className="tv-tooltip-container" style={{ position: "relative" }} ref={favIndicatorsMenuRef}>
          <button
            className="tv-icon-btn"
            style={{ width: "22px", height: btnH }}
            onClick={() => {
              setFavoriteIndicators(loadFavoriteIndicators());
              setShowFavIndicators(!showFavIndicators);
            }}
          >
            <ChevronDown size={14} strokeWidth={2} />
          </button>
          {!showFavIndicators && (
            <div className="tv-tooltip" style={{ top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: "6px" }}>
              Favorite indicators
            </div>
          )}
          {showFavIndicators && (
            <div style={{
              position: "absolute", top: "100%", left: 0, marginTop: "4px",
              backgroundColor: "var(--tv-color-pane-bg)", border: "1px solid var(--tv-color-border)",
              borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "4px 0",
              zIndex: 9999, minWidth: "220px"
            }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", padding: "6px 12px" }}>
                Indicators
              </div>
              {favoriteIndicators.length === 0 ? (
                <div style={{ padding: "8px 12px", fontSize: "13px", color: "var(--tv-color-text-muted)" }}>
                  No favorite indicators yet
                </div>
              ) : (
                favoriteIndicators.map(ind => (
                  <button
                    key={ind}
                    onClick={() => {
                      onIndicatorSelect?.(ind);
                      setShowFavIndicators(false);
                    }}
                    style={{
                      display: "block", width: "100%", padding: "7px 12px", textAlign: "left",
                      fontSize: "13px", border: "none", background: "transparent",
                      color: "var(--tv-color-text)", cursor: "pointer"
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    {ind}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="tv-divider-v" style={{ height: "16px" }} />

        {/* Alert */}
        <button 
          className="tv-icon-btn" 
          onClick={onAlertClick}
          style={{ height: btnH, width: "auto", padding: "0 8px", display: "flex", alignItems: "center", gap: "4px" }}
        >
          <AlarmClockPlus size={iconS} strokeWidth={1.5} />
          <span style={{ fontSize: "13px", fontWeight: 400 }}>Alert</span>
        </button>

        <div className="tv-divider-v" style={{ height: "16px" }} />

        {/* Replay */}
        <button
          className="tv-icon-btn"
          onClick={onReplayClick}
          style={{
            height: btnH, width: "auto", padding: "0 8px",
            display: "flex", alignItems: "center", gap: "4px",
            color: isReplayActive ? "var(--tv-color-accent)" : undefined,
            backgroundColor: isReplayActive ? "rgba(41,98,255,0.08)" : undefined,
          }}
        >
          <ChevronsLeft size={iconS} strokeWidth={2} />
          <span style={{ fontSize: "13px", fontWeight: 400 }}>Replay</span>
        </button>

        <div className="tv-divider-v" style={{ height: "16px" }} />

        {/* Undo / Redo */}
        <button className="tv-icon-btn" style={{ width: "28px", height: btnH, opacity: canUndo ? 1 : 0.35 }} onClick={undo} title="Undo (Ctrl+Z)">
          <Undo2 size={iconS} strokeWidth={1.5} />
        </button>
        <button className="tv-icon-btn" style={{ width: "28px", height: btnH, opacity: canRedo ? 1 : 0.35 }} onClick={redo} title="Redo (Ctrl+Y)">
          <Redo2 size={iconS} strokeWidth={1.5} />
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1px" }}>
        {/* Settings, Fullscreen, Camera */}
        <button className="tv-icon-btn" style={{ width: "28px", height: btnH }} onClick={onSettingsClick}><TVSettingsIcon size={iconS} /></button>
        <button className="tv-icon-btn" style={{ width: "28px", height: btnH }} onClick={onMaximizeClick} title="Hide panels"><Maximize size={iconS} strokeWidth={1.5} /></button>
        <button className="tv-icon-btn" style={{ width: "28px", height: btnH }}><Camera size={iconS} strokeWidth={1.5} /></button>
        
        <div className="tv-divider-v" style={{ height: "16px" }} />

        {/* Save */}
        <button className="tv-icon-btn" style={{ height: btnH, width: "auto", padding: "0 6px", display: "flex", alignItems: "center", gap: "4px" }}>
          <Save size={iconS} strokeWidth={1.5} />
        </button>

        <div className="tv-divider-v" style={{ height: "16px" }} />

        {/* Theme Toggle */}
        <button className="tv-icon-btn" style={{ width: "28px", height: btnH }} onClick={toggleTheme} title="Toggle Theme">
          {theme === "light" ? <Moon size={iconS} strokeWidth={1.5} /> : <Sun size={iconS} strokeWidth={1.5} />}
        </button>

        <div className="tv-divider-v" style={{ height: "16px" }} />

        {/* Trade */}
        <button style={{
          backgroundColor: "transparent",
          color: "var(--tv-color-text)",
          border: "none",
          padding: "0 10px",
          height: btnH,
          fontSize: "13px",
          fontWeight: 400,
          cursor: "pointer",
          borderRadius: "4px",
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
        >
          Trade
        </button>

        {/* Publish */}
        <button style={{
          backgroundColor: "transparent",
          color: "var(--tv-color-text)",
          border: "none",
          padding: "0 10px",
          height: btnH,
          fontSize: "13px",
          fontWeight: 400,
          cursor: "pointer",
          borderRadius: "4px",
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
        >
          Publish
        </button>
      </div>

      {/* Indicators Modal */}
      {showIndicatorsModal && (
        <IndicatorsModal
          onClose={() => setShowIndicatorsModal(false)}
          onSelect={(indicator) => {
            if (onIndicatorSelect) {
              onIndicatorSelect(indicator);
            }
            setShowIndicatorsModal(false);
          }}
        />
      )}
    </>
  );
}

function TimeframeDropdown({
  interval,
  favorites,
  onSelect,
  onToggleFavorite,
}: {
  interval: string;
  favorites: string[];
  onSelect: (value: string) => void;
  onToggleFavorite: (value: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customAmount, setCustomAmount] = useState("1");
  const [customUnit, setCustomUnit] = useState<"min" | "h">("min");

  const toggleCollapsed = (label: string) => {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleAddCustom = () => {
    const n = parseInt(customAmount, 10);
    if (!n || n < 1) return;
    onSelect(`${n}${customUnit}`);
    setShowCustomForm(false);
    setCustomAmount("1");
  };

  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, marginTop: "4px",
      backgroundColor: "var(--tv-color-pane-bg)", border: "1px solid var(--tv-color-border)",
      borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      zIndex: 9999, width: "230px", maxHeight: "70vh", overflowY: "auto",
      padding: "4px 0",
    }}>
      {/* Add custom interval */}
      {showCustomForm ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderBottom: "1px solid var(--tv-color-border)" }}>
          <input
            type="number"
            min={1}
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddCustom()}
            style={{
              width: "48px", height: "26px", padding: "0 6px", fontSize: "13px",
              border: "1px solid var(--tv-color-border)", borderRadius: "4px",
              backgroundColor: "transparent", color: "var(--tv-color-text)", outline: "none"
            }}
          />
          <select
            value={customUnit}
            onChange={e => setCustomUnit(e.target.value as "min" | "h")}
            style={{
              height: "26px", fontSize: "13px", border: "1px solid var(--tv-color-border)",
              borderRadius: "4px", backgroundColor: "transparent", color: "var(--tv-color-text)"
            }}
          >
            <option value="min">minutes</option>
            <option value="h">hours</option>
          </select>
          <button
            onClick={handleAddCustom}
            style={{
              height: "26px", padding: "0 10px", fontSize: "12px", fontWeight: 600,
              border: "none", borderRadius: "4px", cursor: "pointer",
              backgroundColor: "var(--tv-color-accent)", color: "#fff"
            }}
          >
            Add
          </button>
        </div>
      ) : (
        <div
          onClick={() => setShowCustomForm(true)}
          style={{
            display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px",
            fontSize: "13px", color: "var(--tv-color-text)", cursor: "pointer",
            borderBottom: "1px solid var(--tv-color-border)"
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <Plus size={14} strokeWidth={2} />
          Add custom interval...
        </div>
      )}

      {TIMEFRAME_GROUPS.map(group => {
        const isCollapsed = !!collapsed[group.label];
        return (
          <div key={group.label}>
            <div
              onClick={() => toggleCollapsed(group.label)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px 4px", cursor: "pointer",
              }}
            >
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {group.label}
              </span>
              {isCollapsed ? <ChevronDown size={14} color="var(--tv-color-text-muted)" /> : <ChevronUp size={14} color="var(--tv-color-text-muted)" />}
            </div>
            {!isCollapsed && group.items.map(item => (
              <TimeframeRow
                key={item.value}
                item={item}
                isActive={interval === item.value}
                isFavorite={favorites.includes(item.value)}
                disabled={!!group.disabled}
                onSelect={() => onSelect(item.value)}
                onToggleFavorite={() => onToggleFavorite(item.value)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TimeframeRow({
  item,
  isActive,
  isFavorite,
  disabled,
  onSelect,
  onToggleFavorite,
}: {
  item: TFItem;
  isActive: boolean;
  isFavorite: boolean;
  disabled: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={() => !disabled && onSelect()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 12px", fontSize: "13px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        color: disabled ? "var(--tv-color-text-muted)" : (isActive ? "var(--tv-color-accent)" : "var(--tv-color-text)"),
        backgroundColor: isActive ? "var(--tv-color-item-active)" : (hover && !disabled ? "var(--tv-color-item-hover)" : "transparent"),
      }}
    >
      <span>{item.display}</span>
      {!disabled && (
        <span
          onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          style={{ display: "flex", alignItems: "center", padding: "2px", opacity: (hover || isFavorite) ? 1 : 0 }}
        >
          <Star size={14} color={isFavorite ? "#f5b041" : "var(--tv-color-text-muted)"} fill={isFavorite ? "#f5b041" : "transparent"} />
        </span>
      )}
    </div>
  );
}
