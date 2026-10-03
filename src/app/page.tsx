"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Info, Search, Clock3, RotateCcw, ListPlus, Download, Copy, Link2, Maximize, Bot, SunMoon, Globe, ArrowUpCircle, ArrowDownCircle, CloudUpload, Folder, Keyboard } from "lucide-react";
import styles from "./page.module.css";
import TopBar from "./components/TopBar";
import LeftToolbar from "./components/LeftToolbar";
import RightSidebar from "./components/RightSidebar";
import RightToolbar from "./components/RightToolbar";
import OrderTicket from "./trading/OrderTicket";
import TradingDialogs from "./trading/TradingDialogs";
import TradingNotifications from "./trading/TradingNotifications";
import { requestTrade, tradingUi, useTradingUi, closeDock } from "./trading/store";
import DockedTradingPanel from "./trading/DockedTradingPanel";
import { useTicketPrefs } from "./trading/settings";
import BottomPanel from "./components/BottomPanel";
import AlertsSidebar from "./components/AlertsSidebar";
import CreateAlertModal from "./components/CreateAlertModal";
import ChangeIntervalModal from "./components/ChangeIntervalModal";
import ObjectTreeSidebar from "./components/ObjectTreeSidebar";
import FavoritesToolbar from "./components/FavoritesToolbar";
import PineEditorPanel from "./components/PineEditorPanel";
import { pineDock, openPine, defaultPineWidth } from "./components/pine/pineStore";
import { isTypingTarget } from "./lib/isTypingTarget";
import AgentChatPanel from "./components/AgentChatPanel";
import dynamic from "next/dynamic";
const ChartContainer = dynamic(() => import('./components/ChartContainer'), { ssr: false });
import { DrawingProvider } from "./components/drawing/core/DrawingContext";
import BotController from "./components/bot/BotController";
import { ReplayProvider, useReplay } from "./components/ReplayContext";
import { useAuth } from "@/context/AuthContext";
import { useChartSnapshot } from "./components/SnapshotController";
import { useTelemetry } from "@/context/TelemetryContext";
import QuickSearchDialog, { QuickAction } from "./components/QuickSearchDialog";
import { TVAlertIcon, TVReplayIcon, TVGoToDateIcon, TVPineIcon, TVSettingsIcon, TVIndicatorsIcon } from "./components/icons/TVIcons";
import type { IndicatorTemplate } from "./utils/indicatorTemplates";
import MobileMenuDrawer, { MobilePanel, MobilePanelSheet } from "./components/MobileMenuDrawer";
import KeyboardShortcutsDialog from "./components/KeyboardShortcutsDialog";
import ReplayLeaveDialog from "./components/ReplayLeaveDialog";
import { saveReplay } from "./lib/savedReplay";

const DRAWINGS_PANEL_KEY = "tv:drawingsPanelVisible";
const RIGHT_PANEL_KEY = "tv:rightPanelOpen";

// Short toolbar label for an interval value ("15min" → "15m", "1day" → "D")
function intervalToLabel(interval: string): string | undefined {
  const labelMap: Record<string, string> = {
    "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m", "45min": "45m",
    "1h": "1h", "2h": "2h", "4h": "4h", "1day": "D", "1week": "W", "1month": "M"
  };
  if (labelMap[interval]) return labelMap[interval];
  // Custom intervals like "4min" -> "4m"
  const m = interval.match(/^(\d+)min$/);
  return m ? `${m[1]}m` : undefined;
}

function AppLayout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [theme, setTheme] = useState("light");
  const [selectedInterval, setSelectedInterval] = useState("15min");
  const [intervalLabel, setIntervalLabel] = useState("15m");
  const [targetTimestamp, setTargetTimestamp] = useState<number | null>(null);
  const [targetBarSpacing, setTargetBarSpacing] = useState<number | null>(null);
  const [triggerSettings, setTriggerSettings] = useState(0);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<{id: string, name: string, visible?: boolean}[]>([]);
  const [isBotActive, setIsBotActive] = useState(false);
  // The order ticket docked in the right column (floating otherwise)
  const tradingUiState = useTradingUi();
  const ticketPrefsState = useTicketPrefs();
  const dockedTicketOpen = ticketPrefsState.docked && tradingUiState.dock.open;
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showIntervalModal, setShowIntervalModal] = useState(false);
  const [intervalInitialDigit, setIntervalInitialDigit] = useState("");
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [symbolSearchInitial, setSymbolSearchInitial] = useState("");
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  // Narrow screens: the header's menu, the right-hand panel it opened, and whether the
  // drawing toolbar is shown (TradingView's "Drawings panel" switch, remembered)
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel | null>(null);
  const [drawingsPanelVisible, setDrawingsPanelVisible] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(DRAWINGS_PANEL_KEY) === "false") setDrawingsPanelVisible(false); } catch { /* ignore */ }
  }, []);
  // The right toolbar's panel (watchlist / alerts / object tree): clicking the open panel's
  // button again collapses it and the chart takes the width, as on TradingView (remembered)
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(RIGHT_PANEL_KEY) === "false") setRightPanelOpen(false); } catch { /* ignore */ }
  }, []);
  const setRightPanel = (open: boolean) => {
    setRightPanelOpen(open);
    try { localStorage.setItem(RIGHT_PANEL_KEY, String(open)); } catch { /* ignore */ }
  };
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Create Alert opens at a given price (e.g. a drawing's, from its toolbar) or else at the
  // latest close of the symbol on the chart
  const [alertInitialPrice, setAlertInitialPrice] = useState<number | undefined>(undefined);
  const openAlert = (price?: number) => {
    const data = (window as any).__chartFullData;
    const lastClose = Array.isArray(data) && data.length > 0 ? data[data.length - 1].close : undefined;
    setAlertInitialPrice(typeof price === "number" ? price : lastClose);
    setShowAlertModal(true);
  };
  // A drawing's toolbar can ask for an alert at its price, or (long/short position) an order
  useEffect(() => {
    const onAlert = (e: Event) => openAlert((e as CustomEvent).detail?.price);
    const onOrder = (e: Event) => requestTrade((e as CustomEvent).detail?.side === "sell" ? "sell" : "buy", symbolRef.current);
    window.addEventListener("tv:create-alert", onAlert);
    window.addEventListener("tv:open-order-panel", onOrder);
    return () => {
      window.removeEventListener("tv:create-alert", onAlert);
      window.removeEventListener("tv:open-order-panel", onOrder);
    };
  }, []);
  // The docked order ticket opens in the same column, so it shows even while the panel is collapsed
  const showRightPanel = rightPanelOpen || dockedTicketOpen;

  const toggleDrawingsPanel = () => {
    setDrawingsPanelVisible(prev => {
      try { localStorage.setItem(DRAWINGS_PANEL_KEY, String(!prev)); } catch { /* ignore */ }
      return !prev;
    });
  };
  const [activeSidebarPanel, setActiveSidebarPanel] = useState("watchlist");
  // The chart's right-click "Object tree" (and anything else) can open a right-panel page
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (typeof id !== "string") return;
      setPanelsHidden(false);
      setActiveSidebarPanel(id);
      setRightPanel(true);
    };
    window.addEventListener("tv:open-sidebar-panel", open);
    return () => window.removeEventListener("tv:open-sidebar-panel", open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The Pine Editor's place and state live in a store it shares with the bottom panel (split view,
  // bottom tab, collapse); the right toolbar's Pine button opens it, or collapses / restores it
  const pine = pineDock.useValue();
  const showPineEditor = pine.open;
  const pineVisible = pine.open && !pine.collapsed;
  const setShowPineEditor = (v: boolean | ((open: boolean) => boolean)) => {
    const cur = pineDock.get();
    const next = typeof v === "function" ? v(cur.open && !cur.collapsed) : v;
    if (!next) { if (cur.open) pineDock.set({ collapsed: true }); return; }
    if (cur.open) pineDock.set({ collapsed: false }); else openPine();
  };
  const closePineEditor = () => pineDock.set({ open: false, collapsed: false, maximized: false });
  // The layout's own width (narrower than the window in split view), for the header's compact rules
  const [winW, setWinW] = useState(1440);
  useEffect(() => {
    const on = () => setWinW(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const splitW = pineVisible && pine.mode === "split" && !pine.maximized ? (pine.width || defaultPineWidth()) : 0;
  const layoutW = winW - splitW;
  const layoutWidthClass = splitW ? `${layoutW <= 1150 ? "tv-lw-1150" : ""} ${layoutW <= 1000 ? "tv-lw-1000" : ""}` : "";
  // Lets the on-chart Pine script legend row's icons reopen the editor
  // without ChartContainer needing to own the editor's open state. The
  // "{}" icon includes the exact running script's code/name in the event so
  // the editor opens showing THAT script, not whatever it last had.
  const [pineOpenRequest, setPineOpenRequest] = useState<{ code?: string; scriptName?: string; key: number } | null>(null);
  useEffect(() => {
    const openPineEditor = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setPineOpenRequest({ code: detail.code, scriptName: detail.scriptName, key: Date.now() });
      setShowPineEditor(true);
    };
    window.addEventListener("tv:open-pine-editor", openPineEditor);
    return () => window.removeEventListener("tv:open-pine-editor", openPineEditor);
  }, []);
  const [showAgentChat, setShowAgentChat] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [showPanelsHiddenToast, setShowPanelsHiddenToast] = useState(false);

  // Initialize symbol from URL or default to AAPL
  const [symbol, setSymbol] = useState(() => searchParams.get("symbol") || "AAPL");
  const { mode, enterSelectMode, hasStarted, getReplayTime } = useReplay();
  const [leaveReplayOpen, setLeaveReplayOpen] = useState(false);

  // Refs to always have latest values for debounced/async callbacks
  const symbolRef = useRef(symbol);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  const intervalRef = useRef(selectedInterval);
  useEffect(() => { intervalRef.current = selectedInterval; }, [selectedInterval]);
  const hasLoadedOnce = useRef(false);

  // The URL mirrors the symbol. It's written synchronously: an async router round-trip could
  // land after a newer pick and flip the chart back to the older symbol, over and over.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("symbol") === symbol) return;
    url.searchParams.set("symbol", symbol);
    window.history.pushState(null, "", url);
  }, [symbol]);

  // ...and it's read back only on the browser's Back/Forward
  useEffect(() => {
    const onPop = () => {
      const urlSymbol = new URLSearchParams(window.location.search).get("symbol");
      if (urlSymbol) setSymbol(urlSymbol);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = `${symbol} | TradePilot`;
  }, [symbol]);

  // Paper trading follows the chart's symbol; the account manager can switch it
  useEffect(() => { tradingUi.set({ chartSymbol: symbol }); }, [symbol]);
  useEffect(() => {
    const onSet = (e: Event) => { const sym = (e as CustomEvent).detail?.symbol; if (typeof sym === "string" && sym) setSymbol(sym); };
    window.addEventListener("tv:set-symbol", onSet);
    return () => window.removeEventListener("tv:set-symbol", onSet);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  };

  // Esc always restores hidden panels, regardless of focus
  useEffect(() => {
    if (!panelsHidden) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanelsHidden(false);
        setShowPanelsHiddenToast(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [panelsHidden]);

  // Auto-fade the "panels hidden" toast a few seconds after hiding
  useEffect(() => {
    if (!showPanelsHiddenToast) return;
    const timer = setTimeout(() => setShowPanelsHiddenToast(false), 3000);
    return () => clearTimeout(timer);
  }, [showPanelsHiddenToast]);

  const togglePanelsHidden = () => {
    setPanelsHidden(prev => {
      const next = !prev;
      setShowPanelsHiddenToast(next);
      return next;
    });
  };

  // Global keydown: TradingView keyboard shortcuts for navigation/UI
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea, a contenteditable
      // area (e.g. the CodeMirror-based Pine Editor), or a modal is open
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (isTypingTarget(target)) return;
      if (showAlertModal || showIntervalModal || showSymbolSearch || showQuickSearch || showMobileMenu || showShortcuts) return;

      // --- Ctrl/Cmd shortcuts ---
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Alt+S = download chart image, Ctrl+Shift+S = copy chart image
        // (matched on e.code so Alt/Shift don't change which letter the key reports)
        if (e.code === 'KeyS' && e.altKey) { e.preventDefault(); runSnapshotRef.current('download'); return; }
        if (e.code === 'KeyS' && e.shiftKey) { e.preventDefault(); runSnapshotRef.current('copy-image'); return; }
        // Ctrl+S = Save (prevent browser save dialog)
        if (e.key === 's') {
          e.preventDefault();
          saveLayoutRef.current();
          return;
        }
        // Ctrl+K = Quick search (drawings, functions and settings)
        if (e.key === 'k') {
          e.preventDefault();
          setShowQuickSearch(true);
          return;
        }
        // Ctrl+/ = Keyboard shortcuts
        if (e.key === '/') {
          e.preventDefault();
          setShowShortcuts(true);
          return;
        }
        return;
      }

      // --- Alt shortcuts (UI actions) ---
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        // Alt+A = Add Alert
        if (key === 'a') {
          e.preventDefault();
          openAlert();
          return;
        }
        // Alt+G = Go to date (the bottom bar's calendar dialog)
        if (key === 'g') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('tv:open-goto'));
          return;
        }
        // Alt+R = Reset chart view (default zoom at the latest bars, auto price scale)
        if (key === 'r') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('tv:reset-chart-view'));
          return;
        }
        // Alt+W = Add current symbol to watchlist
        if (key === 'w') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('tv:add-to-watchlist', { detail: symbol }));
          return;
        }
        // Alt+S = copy a link to the chart image
        if (e.code === 'KeyS') {
          e.preventDefault();
          runSnapshotRef.current('copy-link');
          return;
        }
        return;
      }

      // --- Simple key shortcuts ---
      // / = Open indicators modal
      if (e.key === '/') {
        e.preventDefault();
        // Trigger indicators modal by simulating a click on the Indicators button
        // We'll dispatch a custom event that TopBar listens to
        window.dispatchEvent(new CustomEvent('tv:open-indicators'));
        return;
      }

      // Numbers = Open interval change modal
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setIntervalInitialDigit(e.key);
        setShowIntervalModal(true);
        return;
      }

      // Shift+B / Shift+S = Market buy / Market sell (opens the order panel to that side)
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'b') { e.preventDefault(); requestTrade('buy', symbolRef.current); return; }
        if (key === 's') { e.preventDefault(); requestTrade('sell', symbolRef.current); return; }
        // Shift+F = hide/show all panels (same as the fullscreen-style toggle button)
        if (key === 'f') { e.preventDefault(); togglePanelsHidden(); return; }
        // Shift+W = the watchlist's "Open list…" dialog (showing the watchlist first if needed;
        // the flag covers the watchlist mounting after this event)
        if (key === 'w') {
          e.preventDefault();
          setPanelsHidden(false);
          setActiveSidebarPanel('watchlist');
          setRightPanel(true);
          (window as any).__tvOpenListPending = true;
          window.dispatchEvent(new CustomEvent('tv:open-list-dialog'));
          return;
        }
      }

      // Typing a letter (with or without Shift) while nothing is focused and no
      // dialog is open = open symbol search, pre-filled with what was just typed
      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setSymbolSearchInitial(e.key.toUpperCase());
        setShowSymbolSearch(true);
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAlertModal, showIntervalModal, showSymbolSearch, showQuickSearch, showMobileMenu, showShortcuts, symbol]);

  const handleIntervalChange = (interval: string, label?: string) => {
    setSelectedInterval(interval);
    if (label) setIntervalLabel(label);
    logAction('TIMEFRAME_CHANGED', { interval, label });
  };

  // Bottom bar date ranges: switch to the range's interval here; the chart then shows the
  // range itself once that interval's bars are loaded (it listens to the same event)
  const handleIntervalChangeRef = useRef(handleIntervalChange);
  handleIntervalChangeRef.current = handleIntervalChange;
  useEffect(() => {
    const onRange = (e: Event) => {
      const next = (e as CustomEvent).detail?.interval;
      if (next && next !== intervalRef.current) handleIntervalChangeRef.current(next, intervalToLabel(next));
    };
    window.addEventListener('tv:apply-date-range', onRange);
    return () => window.removeEventListener('tv:apply-date-range', onRange);
  }, []);

  const { user } = useAuth();
  const { logAction } = useTelemetry();

  const { runSnapshot, toastElement: snapshotToast } = useChartSnapshot({ symbol, intervalLabel, theme });
  const runSnapshotRef = useRef(runSnapshot);
  runSnapshotRef.current = runSnapshot;

  // Load Chart State from Django Backend
  useEffect(() => {
    if (user) {
      fetch(`http://localhost:8000/api/users/chart_state/${user.uid}/`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (data.symbol) setSymbol(data.symbol);
          if (data.interval) {
            setSelectedInterval(data.interval);
            const label = intervalToLabel(data.interval);
            if (label) setIntervalLabel(label);
          }
          if (data.timestamp) setTargetTimestamp(data.timestamp);
          if (data.bar_spacing) setTargetBarSpacing(data.bar_spacing);
          if (data.indicators && Array.isArray(data.indicators) && data.indicators.length > 0) {
            setActiveIndicators(data.indicators);
          }
        })
        // the backend being down or failing just means the chart opens with its defaults
        .catch(err => console.warn("Chart state not loaded, using defaults:", err.message))
        .finally(() => setIsStateLoaded(true));
    } else {
      setIsStateLoaded(true);
    }
  }, [user]);

  // Save chart state when symbol or interval changes (skip initial load)
  useEffect(() => {
    if (user && isStateLoaded) {
      // Skip the very first fire (when isStateLoaded transitions to true with loaded values)
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        return;
      }
      // Cancel any pending onChartStateChange save to prevent stale-closure overwrites
      clearTimeout((window as any).__saveChartStateTimer);
      const timer = setTimeout(() => {
        console.log(`[Page] Saving state on symbol/interval change: ${symbol} / ${selectedInterval}`);
        fetch(`http://localhost:8000/api/users/chart_state/${user.uid}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            symbol, 
            interval: selectedInterval,
            timestamp: targetTimestamp,
            bar_spacing: targetBarSpacing
          })
        }).catch(err => console.warn("[Page] Failed to save state on symbol/interval change", err));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [symbol, selectedInterval, user, isStateLoaded]);

  // Save indicators when they change
  useEffect(() => {
    if (user && isStateLoaded && hasLoadedOnce.current) {
      const timer = setTimeout(() => {
        console.log(`[Page] Saving indicators: ${activeIndicators.length} indicators`);
        fetch(`http://localhost:8000/api/users/chart_state/${user.uid}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            symbol, 
            interval: selectedInterval,
            indicators: activeIndicators
          })
        }).catch(err => console.warn("[Page] Failed to save indicators", err));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [activeIndicators, user, isStateLoaded]);

  // Save chart state on page unload (beforeunload) so the last state is always captured
  useEffect(() => {
    if (!user) return;
    const handleBeforeUnload = () => {
      const payload = JSON.stringify({
        symbol,
        interval: selectedInterval,
        timestamp: targetTimestamp,
        bar_spacing: targetBarSpacing,
        indicators: activeIndicators
      });
      // Use sendBeacon for reliable delivery during page unload
      navigator.sendBeacon(
        `http://localhost:8000/api/users/chart_state/${user.uid}/`,
        new Blob([payload], { type: 'application/json' })
      );
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user, symbol, selectedInterval, targetTimestamp, targetBarSpacing, activeIndicators]);

  // Header "Save" / Ctrl+S: write the current layout to the account right away (signed out → sign in).
  // "Publish": sharing ideas needs an account; there is no ideas feed to publish to yet.
  // Kept in a ref so the window listeners always see the latest symbol/interval/indicators.
  const [headerToast, setHeaderToast] = useState<string | null>(null);
  useEffect(() => {
    if (!headerToast) return;
    const timer = setTimeout(() => setHeaderToast(null), 3000);
    return () => clearTimeout(timer);
  }, [headerToast]);
  const userRef = useRef(user);
  userRef.current = user;
  const saveLayoutRef = useRef<() => void>(() => {});
  saveLayoutRef.current = () => {
    if (!user) { router.push("/login"); return; }
    clearTimeout((window as any).__saveChartStateTimer);
    fetch(`http://localhost:8000/api/users/chart_state/${user.uid}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        interval: selectedInterval,
        timestamp: targetTimestamp,
        bar_spacing: targetBarSpacing,
        indicators: activeIndicators
      })
    })
      .then(res => setHeaderToast(res.ok ? "Chart layout saved" : "Couldn't save the chart layout"))
      .catch(() => setHeaderToast("Couldn't save the chart layout"));
  };
  useEffect(() => {
    const onSave = () => saveLayoutRef.current();
    const onPublish = () => {
      if (!userRef.current) { router.push("/login"); return; }
      setHeaderToast("Publishing ideas isn't available yet");
    };
    const onShortcuts = () => setShowShortcuts(true);
    window.addEventListener("tv:save-chart", onSave);
    window.addEventListener("tv:publish-idea", onPublish);
    window.addEventListener("tv:open-shortcuts", onShortcuts);
    return () => {
      window.removeEventListener("tv:save-chart", onSave);
      window.removeEventListener("tv:publish-idea", onPublish);
      window.removeEventListener("tv:open-shortcuts", onShortcuts);
    };
  }, [router]);

  const handleReplayClick = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    // Leaving a replay that's under way asks first (TradingView's "Leave current replay?")
    if (mode === 'active' && hasStarted) { setLeaveReplayOpen(true); return; }
    enterSelectMode();
  };
  const leaveReplay = (save: boolean) => {
    setLeaveReplayOpen(false);
    const time = getReplayTime();
    if (save && time !== null) saveReplay(symbol, { interval: selectedInterval, time, savedAt: Date.now() });
    enterSelectMode();
  };

  const handleIndicatorSelect = (indicator: string) => {
    setActiveIndicators(prev => {
      // Allow multiple EMAs, restrict Volume/FXN to 1
      if (indicator !== "Moving Average Exponential" && prev.some(i => i.name === indicator)) return prev;
      return [...prev, { id: Math.random().toString(36).substring(7), name: indicator }];
    });
  };

  const handleRemoveIndicator = (id: string) => {
    setActiveIndicators(prev => prev.filter(i => i.id !== id));
  };

  // Applying an indicator template replaces the chart's indicators with the saved set
  // (fresh ids, saved settings restored), then switches symbol/interval if it kept them.
  const applyIndicatorTemplate = (template: IndicatorTemplate) => {
    const next = template.indicators.map(item => ({
      id: Math.random().toString(36).substring(7),
      name: item.name,
      ...(item.visible !== undefined ? { visible: item.visible } : {}),
      config: item.config,
    }));
    const ema: Record<string, any> = {};
    next.forEach(i => { if (i.config) ema[i.id] = i.config; });
    (window as any).__indicatorSettings?.set?.({ ema, volume: template.volumeConfig });
    pendingTemplateMarketRef.current = {
      symbol: template.symbol && template.symbol !== symbol ? template.symbol : undefined,
      interval: template.interval && template.interval !== selectedInterval ? template.interval : undefined,
    };
    setActiveIndicators(next.map(({ config, ...rest }) => rest));
    logAction('INDICATOR_TEMPLATE_APPLIED', { name: template.name });
  };

  // A template's symbol/interval is switched to only after the chart has rebuilt the new
  // indicators on its current data (the chart's effects run before this parent effect);
  // doing both in one render races the EMA rebuild against the new data's reload.
  const pendingTemplateMarketRef = useRef<{ symbol?: string; interval?: string } | null>(null);
  useEffect(() => {
    const pending = pendingTemplateMarketRef.current;
    if (!pending) return;
    pendingTemplateMarketRef.current = null;
    if (pending.symbol) setSymbol(pending.symbol);
    if (pending.interval) handleIntervalChange(pending.interval, intervalToLabel(pending.interval));
  }, [activeIndicators]);

  const icon18 = { size: 18, strokeWidth: 1.5 };
  const quickActions: QuickAction[] = [
    { id: 'indicators', label: 'Indicators, metrics, and strategies', section: 'FUNCTIONS', keywords: ['indicator', 'study', 'add'], shortcut: ['/'], icon: <TVIndicatorsIcon size={28} />, run: () => window.dispatchEvent(new CustomEvent('tv:open-indicators')) },
    { id: 'alert', label: 'Create alert', section: 'FUNCTIONS', keywords: ['alarm', 'notify'], shortcut: ['Alt', 'A'], icon: <TVAlertIcon size={28} />, run: () => openAlert() },
    { id: 'replay', label: 'Bar replay', section: 'FUNCTIONS', keywords: ['replay', 'backtest', 'history'], icon: <TVReplayIcon size={28} />, run: handleReplayClick },
    { id: 'symbol', label: 'Change symbol', section: 'FUNCTIONS', keywords: ['search', 'ticker', 'stock'], icon: <Search {...icon18} />, run: () => { setSymbolSearchInitial(''); setShowSymbolSearch(true); } },
    { id: 'interval', label: 'Change interval', section: 'FUNCTIONS', keywords: ['timeframe', 'resolution'], icon: <Clock3 {...icon18} />, run: () => { setIntervalInitialDigit(''); setShowIntervalModal(true); } },
    { id: 'goto', label: 'Go to date', section: 'FUNCTIONS', keywords: ['calendar', 'jump', 'navigate'], shortcut: ['Alt', 'G'], icon: <TVGoToDateIcon size={28} />, run: () => window.dispatchEvent(new CustomEvent('tv:open-goto')) },
    { id: 'reset-view', label: 'Reset chart view', section: 'FUNCTIONS', keywords: ['zoom out', 'fit', 'autoscale'], shortcut: ['Alt', 'R'], icon: <RotateCcw {...icon18} />, run: () => window.dispatchEvent(new CustomEvent('tv-zoom-out')) },
    { id: 'watchlist', label: 'Add symbol to watchlist', section: 'FUNCTIONS', keywords: ['watchlist'], shortcut: ['Alt', 'W'], icon: <ListPlus {...icon18} />, run: () => window.dispatchEvent(new CustomEvent('tv:add-to-watchlist', { detail: symbol })) },
    { id: 'open-watchlist', label: 'Open watchlist…', section: 'FUNCTIONS', keywords: ['watchlist', 'list'], shortcut: ['Shift', 'W'], icon: <ListPlus {...icon18} />, run: () => { setPanelsHidden(false); setActiveSidebarPanel('watchlist'); setRightPanel(true); (window as any).__tvOpenListPending = true; window.dispatchEvent(new CustomEvent('tv:open-list-dialog')); } },
    { id: 'download-image', label: 'Download chart image', section: 'FUNCTIONS', keywords: ['snapshot', 'screenshot', 'save', 'png'], shortcut: ['Ctrl', 'Alt', 'S'], icon: <Download {...icon18} />, run: () => runSnapshot('download') },
    { id: 'copy-image', label: 'Copy chart image', section: 'FUNCTIONS', keywords: ['snapshot', 'screenshot', 'clipboard'], shortcut: ['Ctrl', 'Shift', 'S'], icon: <Copy {...icon18} />, run: () => runSnapshot('copy-image') },
    { id: 'copy-link', label: 'Copy link to the chart image', section: 'FUNCTIONS', keywords: ['snapshot', 'share', 'url'], shortcut: ['Alt', 'S'], icon: <Link2 {...icon18} />, run: () => runSnapshot('copy-link') },
    { id: 'save-indicator-template', label: 'Save indicator template', section: 'FUNCTIONS', keywords: ['template', 'indicator'], icon: <CloudUpload {...icon18} />, run: () => window.dispatchEvent(new CustomEvent('tv:indicator-templates', { detail: 'save' })) },
    { id: 'open-indicator-template', label: 'Open indicator template', section: 'FUNCTIONS', keywords: ['template', 'indicator', 'load'], icon: <Folder {...icon18} />, run: () => window.dispatchEvent(new CustomEvent('tv:indicator-templates', { detail: 'open' })) },
    { id: 'pine-editor', label: 'Open Pine Editor', section: 'FUNCTIONS', keywords: ['pine', 'script', 'code', 'strategy'], icon: <TVPineIcon size={28} />, run: () => setShowPineEditor(true) },
    { id: 'market-buy', label: 'Market buy', section: 'FUNCTIONS', keywords: ['order', 'trade', 'long'], shortcut: ['Shift', 'B'], icon: <ArrowUpCircle {...icon18} />, run: () => requestTrade('buy', symbolRef.current) },
    { id: 'market-sell', label: 'Market sell', section: 'FUNCTIONS', keywords: ['order', 'trade', 'short'], shortcut: ['Shift', 'S'], icon: <ArrowDownCircle {...icon18} />, run: () => requestTrade('sell', symbolRef.current) },
    { id: 'toggle-panels', label: panelsHidden ? 'Show panels' : 'Hide panels', section: 'FUNCTIONS', keywords: ['fullscreen', 'maximize', 'focus'], shortcut: ['Shift', 'F'], icon: <Maximize {...icon18} />, run: togglePanelsHidden },
    { id: 'agent', label: 'Open Trading Agent', section: 'FUNCTIONS', keywords: ['ai', 'assistant', 'chat', 'bot'], icon: <Bot {...icon18} />, run: () => setShowAgentChat(true) },
    { id: 'shortcuts', label: 'Keyboard shortcuts', section: 'FUNCTIONS', keywords: ['hotkeys', 'keys', 'help'], shortcut: ['Ctrl', '/'], icon: <Keyboard {...icon18} />, run: () => setShowShortcuts(true) },
    { id: 'chart-settings', label: 'Chart settings', section: 'SETTINGS', keywords: ['settings', 'appearance', 'scales', 'canvas', 'colors'], icon: <TVSettingsIcon size={18} />, run: () => setTriggerSettings(t => t + 1) },
    { id: 'theme', label: theme === 'dark' ? 'Light theme' : 'Dark theme', section: 'SETTINGS', keywords: ['theme', 'color', 'mode', 'appearance'], icon: <SunMoon {...icon18} />, run: toggleTheme },
    { id: 'timezone', label: 'Time zone', section: 'SETTINGS', keywords: ['timezone', 'clock', 'utc'], icon: <Globe {...icon18} />, run: () => window.dispatchEvent(new CustomEvent('tv:open-timezone-menu')) },
  ];

  return (
    <div
      className={`${styles.layout} ${layoutWidthClass}`}
      style={{
        ...(panelsHidden ? { gridTemplateColumns: "0 1fr 0 0", gridTemplateRows: "0 1fr var(--tv-bottom-toolbar-height)" } : {}),
        ...(!drawingsPanelVisible ? { ["--tv-left-toolbar-width" as any]: "0px" } : {}),
        ...(!showRightPanel ? { ["--tv-right-toolbar-width" as any]: "0px" } : {}),
        // Pine Editor in split view: the whole layout makes room beside it
        ...(splitW ? { width: `calc(100vw - ${splitW}px)` } : {}),
      }}
    >
      {!panelsHidden && (
        <header className={styles.topbar}>
          <TopBar
            theme={theme}
            toggleTheme={toggleTheme}
            drawingsPanelVisible={drawingsPanelVisible}
            onToggleDrawingsPanel={toggleDrawingsPanel}
            interval={selectedInterval}
            onIntervalChange={handleIntervalChange}
            onReplayClick={handleReplayClick}
            isReplayActive={mode !== "idle"}
            symbol={symbol}
            onSymbolChange={setSymbol}
            onIndicatorSelect={handleIndicatorSelect}
            isBotActive={isBotActive}
            onToggleBot={() => setIsBotActive(!isBotActive)}
            onAlertClick={() => openAlert()}
            symbolSearchOpen={showSymbolSearch}
            symbolSearchInitial={symbolSearchInitial}
            onSymbolSearchClose={() => setShowSymbolSearch(false)}
            onSettingsClick={() => setTriggerSettings(t => t + 1)}
            onMaximizeClick={togglePanelsHidden}
            onSnapshot={runSnapshot}
            activeIndicators={activeIndicators}
            onApplyIndicatorTemplate={applyIndicatorTemplate}
            onQuickSearchClick={() => setShowQuickSearch(true)}
            onMenuClick={() => setShowMobileMenu(true)}
          />
        </header>
      )}

      <BotController
        isActive={isBotActive}
        timeframe={selectedInterval}
        setTimeframe={setSelectedInterval}
      />

      {!panelsHidden && drawingsPanelVisible && (
        <aside className={styles.leftToolbar}>
          <LeftToolbar indicatorCount={activeIndicators.length} onRemoveIndicators={() => setActiveIndicators([])} />
        </aside>
      )}

      <main className={styles.mainChart}>
        {isStateLoaded ? (
          <ChartContainer 
            theme={theme} 
            interval={selectedInterval} 
            intervalLabel={intervalLabel} 
            symbol={symbol}
            activeIndicators={activeIndicators}
            onRemoveIndicator={handleRemoveIndicator}
            initialTargetTimestamp={targetTimestamp}
            initialBarSpacing={targetBarSpacing}
            onOpenOrderPanel={(side) => requestTrade(side, symbol)}
            onChartStateChange={(newTimestamp, newBarSpacing) => {
              // Keep local state in sync so beforeunload can persist latest values
              setTargetTimestamp(newTimestamp);
              setTargetBarSpacing(newBarSpacing);
              if (user) {
                // Debounced save — use refs to always read latest symbol/interval
                clearTimeout((window as any).__saveChartStateTimer);
                (window as any).__saveChartStateTimer = setTimeout(() => {
                  const currentSymbol = symbolRef.current;
                  const currentInterval = intervalRef.current;
                  console.log(`[Page] Saving state to DB: sym=${currentSymbol}, int=${currentInterval}, ts=${newTimestamp}, bs=${newBarSpacing}`);
                  fetch(`http://localhost:8000/api/users/chart_state/${user.uid}/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      symbol: currentSymbol, 
                      interval: currentInterval, 
                      timestamp: newTimestamp,
                      bar_spacing: newBarSpacing 
                    })
                  }).catch(err => console.warn("[Page] Failed to save state (backend may be offline)", err));
                }, 1000);
              }
            }}
            triggerSettings={triggerSettings}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--tv-color-text-muted)' }}>
            Loading chart...
          </div>
        )}
        <FavoritesToolbar />
      </main>

      {!panelsHidden && showRightPanel && (
        <aside className={styles.rightToolbar}>
          {dockedTicketOpen ? (
            <DockedTradingPanel />
          ) : activeSidebarPanel === "alerts" ? (
            <AlertsSidebar />
          ) : activeSidebarPanel === "object_tree" ? (
            <ObjectTreeSidebar
              indicators={activeIndicators}
              onUpdateIndicator={(id, updates) => {
                setActiveIndicators(prev => prev.map(ind => ind.id === id ? { ...ind, ...updates } : ind));
              }}
              onDeleteIndicator={handleRemoveIndicator}
            />
          ) : (
            <RightToolbar symbol={symbol} onSymbolChange={setSymbol} />
          )}
        </aside>
      )}

      {!panelsHidden && (
        <aside className={styles.rightSidebar}>
          <RightSidebar
            activePanel={showRightPanel ? activeSidebarPanel : null}
            onPanelChange={(id) => {
              if (id === activeSidebarPanel && showRightPanel && !dockedTicketOpen) { setRightPanel(false); return; }
              setActiveSidebarPanel(id);
              setRightPanel(true);
              if (dockedTicketOpen) closeDock();
            }}
            onOpenPineEditor={() => setShowPineEditor(open => !open)}
            pineOpen={pineVisible}
            onOpenAgent={() => setShowAgentChat(true)}
            onOpenReplay={handleReplayClick}
            onOpenShortcuts={() => setShowShortcuts(true)}
          />
        </aside>
      )}

      <footer className={styles.bottomPanel}>
        <BottomPanel theme={theme} interval={selectedInterval} />
      </footer>

      {showPineEditor && (
        <PineEditorPanel
          key={pineOpenRequest?.key ?? "default"}
          theme={theme}
          onClose={closePineEditor}
          initialCode={pineOpenRequest?.code}
          initialScriptName={pineOpenRequest?.scriptName}
        />
      )}

      {showAgentChat && (
        <AgentChatPanel theme={theme} onClose={() => setShowAgentChat(false)} />
      )}

      {snapshotToast}

      {showPanelsHiddenToast && (
        <div style={{
          position: "fixed", bottom: "calc(var(--tv-bottom-toolbar-height) + 16px)", left: "50%",
          transform: "translateX(-50%)", backgroundColor: "rgba(30, 34, 45, 0.95)", color: "#fff",
          fontSize: "13px", padding: "8px 16px", borderRadius: "6px",
          display: "flex", alignItems: "center", gap: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)", zIndex: 5000, pointerEvents: "none",
        }}>
          <Info size={15} />
          Panels hidden. Press ESC to show panels.
        </div>
      )}

      {headerToast && (
        <div role="status" style={{
          position: "fixed", bottom: "calc(var(--tv-bottom-toolbar-height) + 16px)", left: "50%",
          transform: "translateX(-50%)", backgroundColor: "rgba(30, 34, 45, 0.95)", color: "#fff",
          fontSize: "13px", padding: "8px 16px", borderRadius: "6px",
          display: "flex", alignItems: "center", gap: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)", zIndex: 5000, pointerEvents: "none",
        }}>
          <Info size={15} />
          {headerToast}
        </div>
      )}

      <OrderTicket placement="floating" />
      <TradingDialogs />
      <TradingNotifications />

      {showAlertModal && (
        <CreateAlertModal 
          theme={theme} 
          symbol={symbol} 
          initialPrice={alertInitialPrice}
          onClose={() => setShowAlertModal(false)} 
        />
      )}

      {showQuickSearch && (
        <QuickSearchDialog actions={quickActions} onClose={() => setShowQuickSearch(false)} />
      )}

      {leaveReplayOpen && <ReplayLeaveDialog onStay={() => setLeaveReplayOpen(false)} onLeave={leaveReplay} />}
      {showShortcuts && <KeyboardShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      {showMobileMenu && (
        <MobileMenuDrawer
          isDark={theme === "dark"}
          drawingsPanelVisible={drawingsPanelVisible}
          onClose={() => setShowMobileMenu(false)}
          onOpenPanel={setMobilePanel}
          onOpenPineEditor={() => setShowPineEditor(true)}
          onOpenTradingPanel={() => window.dispatchEvent(new CustomEvent('tv:open-trading-panel'))}
          onOpenAgent={() => setShowAgentChat(true)}
          onToggleTheme={toggleTheme}
          onToggleDrawingsPanel={toggleDrawingsPanel}
        />
      )}

      {mobilePanel && (
        <MobilePanelSheet panel={mobilePanel} onClose={() => setMobilePanel(null)}>
          {mobilePanel === "alerts" ? (
            <AlertsSidebar />
          ) : mobilePanel === "object_tree" ? (
            <ObjectTreeSidebar
              indicators={activeIndicators}
              onUpdateIndicator={(id, updates) => {
                setActiveIndicators(prev => prev.map(ind => ind.id === id ? { ...ind, ...updates } : ind));
              }}
              onDeleteIndicator={handleRemoveIndicator}
            />
          ) : (
            <RightToolbar symbol={symbol} onSymbolChange={(s) => { setSymbol(s); setMobilePanel(null); }} />
          )}
        </MobilePanelSheet>
      )}

      {showIntervalModal && (
        <ChangeIntervalModal
          theme={theme}
          initialDigit={intervalInitialDigit}
          onApply={(newInterval, newLabel) => {
            handleIntervalChange(newInterval, newLabel);
            setShowIntervalModal(false);
          }}
          onClose={() => setShowIntervalModal(false)}
        />
      )}
    </div>
  );
}

export default function Home() {
  return (
    <DrawingProvider>
      <ReplayProvider>
        <Suspense fallback={<div>Loading...</div>}>
          <AppLayout />
        </Suspense>
      </ReplayProvider>
    </DrawingProvider>
  );
}
