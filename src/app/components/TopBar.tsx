"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SymbolSearch from "./SymbolSearch";
import ChartTypeMenu from "./ChartTypeMenu";
import IndicatorsModal from "./IndicatorsModal";
import { useDrawing } from "./drawing/core/DrawingContext";
import { useAuth } from "@/context/AuthContext";
import { loadFavoriteIndicators } from "@/app/utils/favoriteIndicators";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Star,
  Download,
  Copy,
  Link2,
  ExternalLink,
  Menu
} from "lucide-react";
import { placeBelow, useCloseOnAnchorScroll } from "../lib/anchoredPopup";
import type { SnapshotAction } from "./SnapshotController";
import { useEscapeClose } from "../lib/useEscapeClose";
import { TVAlertIcon, TVReplayIcon, TVQuickSearchIcon, TVIndicatorsIcon, TVCompareIcon, TVCandlesIcon, TVSettingsHexIcon, TVFullscreenIcon, TVCameraIcon, TVUndoIcon, TVRedoIcon } from "./icons/TVIcons";
import { Tip, TipKey } from "../trading/ui";
import LayoutMenu from "./LayoutMenu";
import LayoutSetupMenu from "./LayoutSetupMenu";
import IndicatorTemplatesMenu from "./IndicatorTemplatesMenu";
import type { IndicatorTemplate } from "@/app/utils/indicatorTemplates";
import AccountMenu from "./AccountMenu";
import TradeButton from "../trading/TradeButton";

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
  onSnapshot?: (action: SnapshotAction) => void;
  activeIndicators?: { id: string; name: string; visible?: boolean }[];
  onApplyIndicatorTemplate?: (template: IndicatorTemplate) => void;
  onQuickSearchClick?: () => void;
  onMenuClick?: () => void;
  drawingsPanelVisible?: boolean;
  onToggleDrawingsPanel?: () => void;
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

function getLongLabel(value: string): string {
  const found = ALL_TF_ITEMS.find(i => i.value === value);
  if (found) return found.display;
  const m = value.match(/^(\d+)(min|h|day|week|month)$/);
  if (!m) return value;
  const n = Number(m[1]);
  const unit = { min: "minute", h: "hour", day: "day", week: "week", month: "month" }[m[2] as "min"]!;
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
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

export default function TopBar({ theme, toggleTheme, interval, onIntervalChange, onReplayClick, isReplayActive, symbol, onSymbolChange, onIndicatorSelect, isBotActive, onToggleBot, onAlertClick, symbolSearchOpen, symbolSearchInitial, onSymbolSearchClose, onSettingsClick, onMaximizeClick, onSnapshot, activeIndicators = [], onApplyIndicatorTemplate, onQuickSearchClick, onMenuClick, drawingsPanelVisible, onToggleDrawingsPanel }: TopBarProps) {
  const [showSymbolSearchInternal, setShowSymbolSearchInternal] = useState(false);
  const [internalSearchInitial, setInternalSearchInitial] = useState("");
  const showSymbolSearch = showSymbolSearchInternal || !!symbolSearchOpen;
  const [showIndicatorsModal, setShowIndicatorsModal] = useState(false);
  const [showMoreTf, setShowMoreTf] = useState(false);
  const [showFavIndicators, setShowFavIndicators] = useState(false);
  const [favoriteIndicators, setFavoriteIndicators] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>(DEFAULT_FAVORITES);
  const tfMenuRef = useRef<HTMLDivElement>(null);
  const [showSnapshotMenu, setShowSnapshotMenu] = useState(false);
  const snapshotMenuRef = useRef<HTMLDivElement>(null);
  const favIndicatorsMenuRef = useRef<HTMLDivElement>(null);
  const { undo, redo, canUndo, canRedo } = useDrawing();
  const { user } = useAuth();


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

  // Snapshot dropdown: Esc / outside click closes it
  useEscapeClose(() => setShowSnapshotMenu(false), showSnapshotMenu);
  useEffect(() => {
    if (!showSnapshotMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (snapshotMenuRef.current && !snapshotMenuRef.current.contains(e.target as Node)) {
        setShowSnapshotMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSnapshotMenu]);

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

  // The header's popups are fixed-positioned (it scrolls sideways on narrow screens),
  // so each closes if the header scrolls out from under it
  const closeMoreTf = useCallback(() => setShowMoreTf(false), []);
  const closeFavIndicators = useCallback(() => setShowFavIndicators(false), []);
  const closeSnapshotMenu = useCallback(() => setShowSnapshotMenu(false), []);
  useCloseOnAnchorScroll(tfMenuRef, showMoreTf, closeMoreTf);
  useCloseOnAnchorScroll(favIndicatorsMenuRef, showFavIndicators, closeFavIndicators);
  useCloseOnAnchorScroll(snapshotMenuRef, showSnapshotMenu, closeSnapshotMenu);

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

  const btnH = "32px";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "2px", height: "100%", minWidth: 0 }}>
        {/* Phone/tablet: the menu that replaces the hidden right-hand panels */}
        <button className="tv-hdr-btn tv-narrow-only" onClick={onMenuClick} aria-label="Open menu">
          <Menu size={22} strokeWidth={1.5} />
        </button>

        {/* Account menu */}
        <AccountMenu isDark={theme === "dark"} onToggleTheme={toggleTheme} height={btnH} drawingsPanelVisible={drawingsPanelVisible} onToggleDrawingsPanel={onToggleDrawingsPanel} />

        {/* Symbol search: the symbol in a rounded pill */}
        <Tip text="Symbol search" placement="bottom">
          <button
            className="tv-hdr-sym"
            onClick={() => { setInternalSearchInitial(""); setShowSymbolSearchInternal(true); }}
          >
            {symbol}
          </button>
        </Tip>

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

        {/* Compare symbols */}
        <Tip text="Compare symbols" placement="bottom">
          <button className="tv-hdr-btn" aria-label="Compare symbols"><TVCompareIcon size={28} /></button>
        </Tip>

        <div className="tv-hdr-sep" />

        {/* Intervals */}
        {favorites.map((value) => (
          <Tip key={value} text={getLongLabel(value)} placement="bottom">
            <button
              className={`tv-hdr-btn tv-tf-fav ${interval === value ? "active" : ""}`}
              style={{ minWidth: 0, padding: "0 6px" }}
              onClick={() => selectInterval(value)}
            >
              {getShortLabel(value)}
            </button>
          </Tip>
        ))}
        {/* More intervals */}
        <div style={{ position: "relative" }} ref={tfMenuRef}>
          <button
            className={`tv-hdr-btn ${!favorites.includes(interval) || showMoreTf ? "active" : ""}`}
            style={{ minWidth: 24, padding: "0 4px", gap: "2px" }}
            aria-label="More intervals"
            onClick={() => setShowMoreTf(!showMoreTf)}
          >
            {!favorites.includes(interval) ? getShortLabel(interval) : ""}
            {showMoreTf ? <ChevronUp size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
          </button>
          {showMoreTf && (
            <TimeframeDropdown
              anchorRef={tfMenuRef}
              interval={interval}
              favorites={favorites}
              onSelect={selectInterval}
              onToggleFavorite={toggleFavoriteInterval}
            />
          )}
        </div>

        <div className="tv-hdr-sep" />

        {/* Chart type */}
        <ChartTypeMenu />

        <div className="tv-hdr-sep" />

        {/* Indicators */}
        <button
          className="tv-hdr-btn tv-topbar-labeled"
          style={{ padding: "0 8px 0 2px" }}
          onClick={() => setShowIndicatorsModal(true)}
        >
          <TVIndicatorsIcon size={28} />
          <span className="tv-topbar-label">Indicators</span>
        </button>

        {/* Favorite indicators */}
        <div style={{ position: "relative" }} ref={favIndicatorsMenuRef}>
          <Tip text="Favorite indicators" placement="bottom">
            <button
              className={`tv-hdr-btn ${showFavIndicators ? "active" : ""}`}
              style={{ minWidth: 24, padding: "0 4px" }}
              aria-label="Favorite indicators"
              onClick={() => {
                setFavoriteIndicators(loadFavoriteIndicators());
                setShowFavIndicators(!showFavIndicators);
              }}
            >
              {showFavIndicators ? <ChevronUp size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
            </button>
          </Tip>
          {showFavIndicators && (
            <div ref={el => placeBelow(el, favIndicatorsMenuRef.current)} style={{
              position: "absolute", top: "100%", left: 0, marginTop: "4px",
              backgroundColor: "var(--tv-color-pane-bg)", border: "1px solid var(--tv-color-border)",
              borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", padding: "6px 0",
              zIndex: 9999, minWidth: "240px"
            }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", padding: "6px 14px" }}>
                Indicators
              </div>
              {favoriteIndicators.length === 0 ? (
                <div style={{ padding: "8px 14px", fontSize: "14px", color: "var(--tv-color-text-muted)" }}>
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
                      display: "block", width: "100%", padding: "8px 14px", textAlign: "left",
                      fontSize: "14px", border: "none", background: "transparent",
                      color: "var(--tv-color-text)", cursor: "pointer"
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--tv-hover-neutral)"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    {ind}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Indicator templates */}
        <IndicatorTemplatesMenu
          activeIndicators={activeIndicators}
          symbol={symbol}
          interval={interval}
          intervalLabel={getShortLabel(interval)}
          onApply={(t) => onApplyIndicatorTemplate?.(t)}
        />

        <div className="tv-hdr-sep" />

        {/* Alert */}
        <Tip text={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Create alert <TipKey>Alt</TipKey>+<TipKey>A</TipKey></span>} placement="bottom">
          <button className="tv-hdr-btn tv-topbar-labeled" onClick={onAlertClick} style={{ padding: "0 8px 0 2px" }}>
            <TVAlertIcon size={28} />
            <span className="tv-topbar-label">Alert</span>
          </button>
        </Tip>

        {/* Replay */}
        <Tip text="Bar replay" placement="bottom">
          <button
            className={`tv-hdr-btn tv-topbar-labeled ${isReplayActive ? "active" : ""}`}
            onClick={onReplayClick}
            style={{ padding: "0 8px 0 2px", color: isReplayActive ? "var(--tv-color-accent)" : undefined }}
          >
            <TVReplayIcon size={28} />
            <span className="tv-topbar-label">Replay</span>
          </button>
        </Tip>

        <div className="tv-hdr-sep" />

        {/* Undo / Redo */}
        <Tip text={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Undo <TipKey>Ctrl</TipKey>+<TipKey>Z</TipKey></span>} placement="bottom">
          <button className="tv-hdr-btn" disabled={!canUndo} onClick={undo} aria-label="Undo"><TVUndoIcon size={28} /></button>
        </Tip>
        <Tip text={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Redo <TipKey>Ctrl</TipKey>+<TipKey>Y</TipKey></span>} placement="bottom">
          <button className="tv-hdr-btn" disabled={!canRedo} onClick={redo} aria-label="Redo"><TVRedoIcon size={28} /></button>
        </Tip>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        {/* Layout setup (the chart grid), then the layout name + Manage layouts */}
        <span className="tv-wide-only" style={{ display: "contents" }}>
          <LayoutSetupMenu />
          <LayoutMenu />
        </span>

        <div className="tv-hdr-sep" />

        {/* Quick search (Ctrl+K) */}
        <Tip text={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Quick search <TipKey>Ctrl</TipKey>+<TipKey>K</TipKey></span>} placement="bottom">
          <button className="tv-hdr-btn" onClick={onQuickSearchClick} aria-label="Quick search"><TVQuickSearchIcon size={28} /></button>
        </Tip>

        {/* Settings, Fullscreen, Snapshot */}
        <Tip text="Settings" placement="bottom">
          <button className="tv-hdr-btn" onClick={onSettingsClick} aria-label="Settings"><TVSettingsHexIcon size={28} /></button>
        </Tip>
        <Tip text={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Fullscreen mode <TipKey>Shift</TipKey>+<TipKey>F</TipKey></span>} placement="bottom">
          <button className="tv-hdr-btn" onClick={onMaximizeClick} aria-label="Fullscreen mode"><TVFullscreenIcon size={28} /></button>
        </Tip>
        <div ref={snapshotMenuRef} style={{ position: "relative" }}>
          <Tip text="Take a snapshot" placement="bottom">
            <button
              className={`tv-hdr-btn ${showSnapshotMenu ? "active" : ""}`}
              onClick={() => setShowSnapshotMenu(v => !v)}
              aria-label="Take a snapshot"
            >
              <TVCameraIcon size={28} />
            </button>
          </Tip>
          {showSnapshotMenu && (
            <div ref={el => placeBelow(el, snapshotMenuRef.current, "end", 6)} style={{
              position: "absolute", top: "calc(100% + 6px)", right: "-90px", width: "280px", zIndex: 3000,
              background: "var(--tv-color-bg)", color: "var(--tv-color-text)",
              border: "1px solid var(--tv-color-border)", borderRadius: "8px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.25)", padding: "6px 0",
            }}>
              <div style={{ padding: "8px 16px 6px", fontSize: "11px", letterSpacing: "0.5px", fontWeight: 600, color: "var(--tv-color-text-muted)" }}>
                CHART SNAPSHOT
              </div>
              {([
                { action: "download", icon: <Download size={20} strokeWidth={1.5} />, label: "Download image", shortcut: "Ctrl + Alt + S" },
                { action: "copy-image", icon: <Copy size={20} strokeWidth={1.5} />, label: "Copy image", shortcut: "Ctrl + Shift + S" },
                { action: "copy-link", icon: <Link2 size={20} strokeWidth={1.5} />, label: "Copy link", shortcut: "Alt + S" },
                { action: "open-tab", icon: <ExternalLink size={20} strokeWidth={1.5} />, label: "Open in new tab" },
                { action: "tweet", icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                ), label: "Tweet image" },
              ] as { action: SnapshotAction; icon: React.ReactNode; label: string; shortcut?: string }[]).map(item => (
                <button
                  key={item.action}
                  onClick={() => { setShowSnapshotMenu(false); onSnapshot?.(item.action); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "14px", width: "100%", padding: "10px 16px",
                    background: "transparent", border: "none", color: "inherit", cursor: "pointer",
                    fontSize: "14px", textAlign: "left",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--tv-hover-neutral)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.shortcut && <span style={{ fontSize: "12px", color: "var(--tv-color-text-muted)" }}>{item.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Trade (paper trading broker) */}
        <span style={{ marginLeft: 6, display: "inline-flex" }}><TradeButton height={btnH} /></span>

        {/* Publish */}
        <Tip text="Share your idea with the trade community" placement="bottom">
          <button className="tv-hdr-publish" onClick={() => window.dispatchEvent(new CustomEvent("tv:publish-idea"))}>
            Publish
          </button>
        </Tip>
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
  anchorRef,
  interval,
  favorites,
  onSelect,
  onToggleFavorite,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
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
    <div ref={el => placeBelow(el, anchorRef.current)} style={{
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
