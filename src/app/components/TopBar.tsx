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
import { IntervalMenu, DownChevron } from "./IntervalMenu";
import { intervalName, intervalShort, sortIntervals, removeCustomInterval } from "../lib/intervals";

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

const DEFAULT_FAVORITES = ["1min", "5min", "15min", "30min", "45min", "1h", "4h"];
const FAVORITES_STORAGE_KEY = "tv:favoriteIntervals";

function loadFavoriteIntervals(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return DEFAULT_FAVORITES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(v => typeof v === "string") && parsed.length > 0) {
      return sortIntervals(parsed);
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

export default function TopBar({ theme, toggleTheme, interval, onIntervalChange, onReplayClick, isReplayActive, symbol, onSymbolChange, onIndicatorSelect, onAlertClick, symbolSearchOpen, symbolSearchInitial, onSymbolSearchClose, onSettingsClick, onMaximizeClick, onSnapshot, activeIndicators = [], onApplyIndicatorTemplate, onQuickSearchClick, onMenuClick, drawingsPanelVisible, onToggleDrawingsPanel }: TopBarProps) {
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
      // Kept in order of length, as TradingView lays them out on the toolbar
      const next = prev.includes(value) ? prev.filter(v => v !== value) : sortIntervals([...prev, value]);
      saveFavoriteIntervals(next);
      return next;
    });
  }, []);

  // A custom interval taken out of the menu also leaves the toolbar
  const removeCustom = useCallback((value: string) => {
    removeCustomInterval(value);
    setFavorites(prev => {
      if (!prev.includes(value)) return prev;
      const next = prev.filter(v => v !== value);
      saveFavoriteIntervals(next);
      return next;
    });
  }, []);

  const selectInterval = useCallback((value: string) => {
    onIntervalChange(value, intervalShort(value));
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

        {/* Intervals: the favorites, then the chart's interval if it isn't one, then the menu */}
        {(favorites.includes(interval) ? favorites : [...favorites, interval]).map((value) => (
          <Tip key={value} text={intervalName(value)} placement="bottom">
            <button
              className={`tv-hdr-btn tv-tf-fav ${interval === value ? "active" : ""}`}
              style={{ minWidth: 0, padding: "0 6px" }}
              onClick={() => selectInterval(value)}
            >
              {intervalShort(value)}
            </button>
          </Tip>
        ))}
        <div ref={tfMenuRef} style={{ display: "flex" }}>
          <Tip text="Chart interval" placement="bottom">
            <button
              className={`tv-hdr-btn ${showMoreTf ? "active" : ""}`}
              style={{ minWidth: 24, width: 24, padding: 0 }}
              aria-label="Chart interval"
              aria-expanded={showMoreTf}
              onClick={() => setShowMoreTf(!showMoreTf)}
            >
              <span style={{ display: "flex", transform: showMoreTf ? "rotate(180deg)" : undefined }}><DownChevron /></span>
            </button>
          </Tip>
        </div>
        {showMoreTf && (
          <IntervalMenu
            anchor={tfMenuRef.current}
            interval={interval}
            favorites={favorites}
            onSelect={selectInterval}
            onToggleFavorite={toggleFavoriteInterval}
            onRemoveCustom={removeCustom}
            onClose={closeMoreTf}
          />
        )}

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
          intervalLabel={intervalShort(interval)}
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
