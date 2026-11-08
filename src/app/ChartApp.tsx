"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Info, Search, Clock3, RotateCcw, ListPlus, Download, Copy, Link2, Maximize, SunMoon, Globe, ArrowUpCircle, ArrowDownCircle, CloudUpload, Folder, Keyboard, MessageCircle } from "lucide-react";
import styles from "./page.module.css";
import { installDialogFit } from "./lib/fitDialogs";
import TopBar from "./components/TopBar";
import LeftToolbar from "./components/LeftToolbar";
import RightSidebar from "./components/RightSidebar";
import RightToolbar from "./components/RightToolbar";
import OrderTicket from "./trading/OrderTicket";
import TradingDialogs from "./trading/TradingDialogs";
import TradingNotifications from "./trading/TradingNotifications";
import AlertToasts from "./components/alerts/AlertToasts";
import { isPineIndicator } from "./components/pine/usePineIndicators";
import { requestTrade, tradingUi, useTradingUi, closeDock } from "./trading/store";
import DockedTradingPanel from "./trading/DockedTradingPanel";
import { useTicketPrefs } from "./trading/settings";
import BottomPanel from "./components/BottomPanel";
import AlertsSidebar from "./components/AlertsSidebar";
import CreateAlertModal from "./components/CreateAlertModal";
import ChangeIntervalModal from "./components/ChangeIntervalModal";
import { parseInterval, intervalShort, intervalSeconds, isIntervalAvailable, SECTIONS } from "./lib/intervals";
import { featureLimit, intervalFeature, intervalLocked, requireFeature, requireInterval, requireRoom, useAccess } from "@/lib/access";
import ObjectTreePanel from "./components/objectTree/ObjectTreePanel";
import FavoritesToolbar from "./components/FavoritesToolbar";
import PineEditorPanel from "./components/PineEditorPanel";
import { pineDock, openPine, defaultPineWidth } from "./components/pine/pineStore";
import { isTypingTarget } from "./lib/isTypingTarget";
import dynamic from "next/dynamic";
const ChartContainer = dynamic(() => import('./components/ChartContainer'), { ssr: false });
import { DrawingProvider } from "./components/drawing/core/DrawingContext";
import { ReplayProvider, useReplay } from "./components/ReplayContext";
import { useAuth } from "@/context/AuthContext";
import { useChartSnapshot } from "./components/SnapshotController";
import QuickSearchDialog, { QuickAction } from "./components/QuickSearchDialog";
import FeedbackPanel from "./components/FeedbackPanel";
import { TVAlertIcon, TVReplayIcon, TVGoToDateIcon, TVPineIcon, TVSettingsIcon, TVIndicatorsIcon } from "./components/icons/TVIcons";
import type { IndicatorTemplate } from "./utils/indicatorTemplates";
import MobileMenuDrawer, { MobilePanel, MobilePanelSheet } from "./components/MobileMenuDrawer";
import KeyboardShortcutsDialog from "./components/KeyboardShortcutsDialog";
import ReplayLeaveDialog from "./components/ReplayLeaveDialog";
import BacktestSessionBar from "./components/BacktestSessionBar";
import BacktestSessionsPanel from "./components/BacktestSessionsPanel";
import { saveReplay, setSavedReplayUser } from "./lib/savedReplay";
import { layoutStore, layouts, ensureLayout, readSharedLayout, newLayout } from "./lib/layoutStore";
import { LAYOUTS, LAYOUT_ROWS } from "./lib/chartLayouts";
import { setLayoutSync } from "./lib/layoutSync";
import SecondaryChart from "./components/SecondaryChart";
import { watchlists, listSymbols, sameSymbol } from "./components/watchlist/store";
import { backendFetch, sessionKey, BACKEND_URL } from "@/lib/backend";
import CollabController from "./components/collab/CollabController";
import CollabDialog from "./components/collab/CollabDialog";
import CollabPanel from "./components/collab/CollabPanel";
import CollabOverlay from "./components/collab/CollabOverlay";
import { CollabAlertsSync, CollabChartSync, CollabDrawingSync, CollabPineSync, CollabPresenceSync, CollabReplaySync } from "./components/collab/CollabSync";
import { collab, useCollabActive, useCollabChartActive } from "./lib/collab/session";
import { displaySymbol } from "@/app/lib/symbolDisplay";

const DRAWINGS_PANEL_KEY = "tv:drawingsPanelVisible";
const RIGHT_PANEL_KEY = "tv:rightPanelOpen";

// Short toolbar label for an interval value ("15min" → "15m", "1day" → "D", "2week" → "2W")
function intervalToLabel(interval: string): string | undefined {
  return parseInterval(interval) ? intervalShort(interval) : undefined;
}

function AppLayout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [theme, setTheme] = useState("light");
  const [selectedInterval, setSelectedInterval] = useState("15min");
  const [intervalLabel, setIntervalLabel] = useState("15m");
  const [targetTimestamp, setTargetTimestamp] = useState<number | null>(null);
  const [targetBarSpacing, setTargetBarSpacing] = useState<number | null>(null);
  // Where the chart is scrolled to / its zoom, as the user pans: kept in refs, not state —
  // updating page state on every pan/zoom frame re-rendered the whole app each frame
  const viewTimestampRef = useRef<number | null>(null);
  const viewBarSpacingRef = useRef<number | null>(null);
  const [triggerSettings, setTriggerSettings] = useState(0);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<{id: string, name: string, visible?: boolean, inputs?: Record<string, any>, config?: Record<string, any>}[]>([]);
  // The order ticket docked in the right column (floating otherwise)
  const tradingUiState = useTradingUi();
  const ticketPrefsState = useTicketPrefs();
  const dockedTicketOpen = ticketPrefsState.docked && tradingUiState.dock.open;
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showIntervalModal, setShowIntervalModal] = useState(false);
  const [intervalInitialDigit, setIntervalInitialDigit] = useState("");
  // The "Change interval" quick-change dialog vs. its "Add custom interval..." form
  const [intervalCustomForm, setIntervalCustomForm] = useState(false);
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
  const [showFeedback, setShowFeedback] = useState(false);
  // Collab charts: the Collaborate dialog (from the chart's right-click menu or the group panel)
  const [showCollabDialog, setShowCollabDialog] = useState(false);
  const inCollab = useCollabActive();
  useEffect(() => {
    const open = () => setShowCollabDialog(true);
    window.addEventListener("tv:open-collab", open);
    return () => window.removeEventListener("tv:open-collab", open);
  }, []);
  // Create Alert opens at a given price (e.g. a drawing's, from its toolbar) or else at the
  // latest close of the symbol on the chart
  const [alertInitialPrice, setAlertInitialPrice] = useState<number | undefined>(undefined);
  // Editing an existing alert (its row's settings button or a toast's "Edit alert")
  const [editAlertId, setEditAlertId] = useState<string | undefined>(undefined);
  const openAlert = (price?: number) => {
    const data = (window as any).__chartFullData;
    const lastClose = Array.isArray(data) && data.length > 0 ? data[data.length - 1].close : undefined;
    setAlertInitialPrice(typeof price === "number" ? price : lastClose);
    setEditAlertId(undefined);
    setShowAlertModal(true);
  };
  // A drawing's toolbar can ask for an alert at its price, or (long/short position) an order
  useEffect(() => {
    const onAlert = (e: Event) => openAlert((e as CustomEvent).detail?.price);
    const onOrder = (e: Event) => requestTrade((e as CustomEvent).detail?.side === "sell" ? "sell" : "buy", symbolRef.current);
    const onEditAlert = (e: Event) => { const id = (e as CustomEvent).detail?.id; if (id) { setEditAlertId(id); setShowAlertModal(true); } };
    window.addEventListener("tv:create-alert", onAlert);
    window.addEventListener("tv:edit-alert", onEditAlert);
    window.addEventListener("tv:open-order-panel", onOrder);
    return () => {
      window.removeEventListener("tv:create-alert", onAlert);
      window.removeEventListener("tv:edit-alert", onEditAlert);
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

  // ── Chart layouts (Layout setup / Manage layouts): the grid of charts, which one is active,
  // and "Sync in layout". The page's symbol / interval are the active chart's.
  const layoutState = layoutStore.useValue();
  const workingLayout = layoutState.working;
  // The layout once the page's chart state is known (and a shared layout link opens as a copy)
  const layoutReady = useRef(false);
  useEffect(() => {
    if (!isStateLoaded || layoutReady.current) return;
    layoutReady.current = true;
    let legacy: string | undefined;
    try { legacy = localStorage.getItem("tv:layoutName") || undefined; } catch { /* ignore */ }
    ensureLayout({ symbol, interval: selectedInterval, intervalLabel }, legacy);
    const shared = readSharedLayout(searchParams.get("layout"));
    if (shared) {
      const l = { ...newLayout(`${shared.name || "Unnamed"} (shared)`, shared.cells[0]), ...shared, name: `${shared.name || "Unnamed"} (shared)` };
      const s0 = layoutStore.get();
      const copy = { ...l, id: Math.random().toString(36).slice(2, 10), savedAt: Date.now(), shared: false };
      layoutStore.set({ layouts: [...s0.layouts, copy], working: copy, currentId: copy.id, recent: [copy.id, ...s0.recent] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStateLoaded]);
  // The page follows the active chart when the layout or the active chart changes
  const followedKey = useRef("");
  useEffect(() => {
    if (!workingLayout) return;
    const key = `${workingLayout.id}:${workingLayout.active}`;
    if (followedKey.current === key) return;
    followedKey.current = key;
    const cell = workingLayout.cells[workingLayout.active] || workingLayout.cells[0];
    if (!cell) return;
    if (cell.symbol !== symbolRef.current) setSymbol(cell.symbol);
    // (an interval saved as its label, e.g. "15m" from an older bug, isn't applied)
    if (cell.interval !== intervalRef.current && parseInterval(cell.interval)) { setSelectedInterval(cell.interval); setIntervalLabel(intervalShort(cell.interval)); }
  }, [workingLayout]);
  // …and the active chart follows the page (symbol search, interval menu, …), with Sync in layout
  useEffect(() => {
    const w = layoutStore.get().working;
    if (!w || followedKey.current !== `${w.id}:${w.active}`) return;
    const cur = w.cells[w.active];
    if (cur && cur.symbol === symbol && cur.interval === selectedInterval && cur.intervalLabel === intervalLabel) return;
    layouts.update(l => ({
      cells: l.cells.map((c, i) => {
        if (i === l.active) return { symbol, interval: selectedInterval, intervalLabel };
        return {
          ...c,
          ...(l.sync.symbol ? { symbol } : {}),
          ...(l.sync.interval ? { interval: selectedInterval, intervalLabel } : {}),
        };
      }),
    }));
  }, [symbol, selectedInterval, intervalLabel]);
  // Crosshair / time / date range sync (the charts read these while they draw)
  useEffect(() => {
    const w = workingLayout;
    setLayoutSync({ multi: !!w && w.cells.length > 1, crosshair: !!w?.sync.crosshair, time: !!w?.sync.time, dateRange: !!w?.sync.dateRange });
  }, [workingLayout]);
  // Manage layouts → Open layout… / a recent one, Create new layout…
  useEffect(() => {
    const onOpen = (e: Event) => { const id = (e as CustomEvent).detail; if (typeof id === "string") layouts.open(id); };
    const onCreate = () => layouts.create({ symbol: symbolRef.current, interval: intervalRef.current, intervalLabel: intervalLabelRef.current });
    window.addEventListener("tv:layout-open", onOpen);
    window.addEventListener("tv:layout-create", onCreate);
    return () => { window.removeEventListener("tv:layout-open", onOpen); window.removeEventListener("tv:layout-create", onCreate); };
  }, []);
  const intervalLabelRef = useRef(intervalLabel);
  intervalLabelRef.current = intervalLabel;
  const hasLoadedOnce = useRef(false);
  // Whose saved chart state (symbol, timeframe, view, indicators) has been read from the server:
  // nothing of it is saved for a user before that. On a browser whose data was cleared, the chart
  // first shows the (empty) local copy; saving that before the account's state had loaded wiped the
  // account's indicators
  const [stateOwner, setStateOwner] = useState<string | null>(null);
  const stateOwnerRef = useRef<string | null>(null);
  stateOwnerRef.current = stateOwner;

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
    document.title = `${displaySymbol(symbol)} | TradePilot`;
  }, [symbol]);

  // Paper trading follows the chart's symbol; the account manager can switch it
  useEffect(() => { tradingUi.set({ chartSymbol: symbol }); }, [symbol]);
  useEffect(() => {
    const onSet = (e: Event) => { const sym = (e as CustomEvent).detail?.symbol; if (typeof sym === "string" && sym) setSymbol(sym); };
    window.addEventListener("tv:set-symbol", onSet);
    return () => window.removeEventListener("tv:set-symbol", onSet);
  }, []);

  // The theme is remembered (the layout's inline script applies it before the first paint)
  const themeLoaded = useRef(false);
  useEffect(() => {
    try { const t = localStorage.getItem("tv:theme"); if (t === "dark" || t === "light") setTheme(t); } catch { /* ignore */ }
    themeLoaded.current = true;
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (themeLoaded.current) { try { localStorage.setItem("tv:theme", theme); } catch { /* ignore */ } }
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

      // Numbers = Open interval quick-change dialog (TradingView's "Change interval")
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setIntervalInitialDigit(e.key);
        setIntervalCustomForm(false);
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

      // Space / Shift+Space = the watchlist's next / previous symbol (round the end of the list), as
      // on TradingView. In replay Space plays / pauses instead (the replay's own shortcut).
      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (mode !== 'idle') return;
        const wl = watchlists.get();
        const list = wl.lists.find(l => l.id === wl.activeId) || wl.lists[0];
        const syms = list ? listSymbols(list) : [];
        if (!syms.length) return;
        e.preventDefault();
        const i = syms.findIndex(x => sameSymbol(x, symbol));
        setSymbol(i < 0 ? syms[0] : syms[(i + (e.shiftKey ? -1 : 1) + syms.length) % syms.length]);
        return;
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
  }, [showAlertModal, showIntervalModal, showSymbolSearch, showQuickSearch, showMobileMenu, showShortcuts, symbol, mode]);

  const handleIntervalChange = (interval: string, label?: string) => {
    if (!requireInterval(interval)) return;   // 30s and custom intervals are premium
    setSelectedInterval(interval);
    if (label) setIntervalLabel(label);
  };

  // The "Change interval" quick-change dialog, pre-filled from the chart's current interval
  const openQuickChangeInterval = () => {
    setIntervalInitialDigit("");
    setIntervalCustomForm(false);
    setShowIntervalModal(true);
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

  // Without premium (an account whose access ended, or signed out), what the chart opened with is
  // brought within the free plan, with the popup saying why: a 30s / custom interval becomes the
  // nearest standard one, and indicators and charts in the layout beyond the free 3 are dropped.
  // Nothing happens until it's known whether they're premium. In a collab the timeframe and the
  // indicators are the room's (set by whoever may change them, e.g. a 30s chart): everyone in it
  // sees them as they are — only their own choices are held to their plan.
  const { plan: accessPlan } = useAccess();
  const inCollabChart = useCollabChartActive();
  useEffect(() => {
    if (!isStateLoaded || !accessPlan) return;
    if (!inCollabChart && intervalLocked(selectedInterval)) {
      const secs = intervalSeconds(selectedInterval) || 60;
      const dist = (v: string) => Math.abs(Math.log(intervalSeconds(v) / secs));
      const free = SECTIONS.flatMap(sec => sec.standard).filter(v => isIntervalAvailable(v) && !intervalLocked(v) && intervalSeconds(v) > 0);
      const next = free.reduce((best, v) => (dist(v) < dist(best) ? v : best), "1min");
      requireFeature(intervalFeature(selectedInterval)!);
      setSelectedInterval(next);
      setIntervalLabel(intervalToLabel(next) || intervalShort(next));
    }
    const maxIndicators = featureLimit("indicators");
    if (!inCollabChart && activeIndicators.length > maxIndicators) {
      requireRoom("indicators", activeIndicators.length);
      setActiveIndicators(prev => prev.slice(0, maxIndicators));
    }
    const maxCharts = featureLimit("charts");
    const w = layoutStore.get().working;
    if (w && w.cells.length > maxCharts) {
      const row = [...LAYOUT_ROWS].reverse().find(r => r.charts <= maxCharts);
      if (row) {
        requireRoom("charts", w.cells.length);
        layouts.update(l => ({ grid: row.layouts[0].id, cells: l.cells.slice(0, row.charts), active: Math.min(l.active, row.charts - 1) }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStateLoaded, accessPlan, selectedInterval, activeIndicators.length, workingLayout?.cells.length, inCollabChart]);
  // "Save this replay" is kept in the account: load this user's (and send any saved here before)
  useEffect(() => { setSavedReplayUser(user?.uid ?? null); }, [user?.uid]);

  // Shape settings dialogs shrink to fit a small window (lib/fitDialogs)
  useEffect(() => installDialogFit(), []);

  const { runSnapshot, toastElement: snapshotToast } = useChartSnapshot({ symbol, intervalLabel, theme });
  const runSnapshotRef = useRef(runSnapshot);
  runSnapshotRef.current = runSnapshot;

  // The chart's indicators as last kept in this browser (signed out, or the backend unreachable)
  const restoreLocalIndicators = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('tv:indicators') || 'null');
      if (Array.isArray(saved) && saved.every((i: any) => i && typeof i.id === 'string' && typeof i.name === 'string')) setActiveIndicators(saved);
    } catch { /* none kept */ }
  };

  // The chart's view (centre bar and zoom) as last kept in this browser: signed out, the backend
  // unreachable, or it has none yet
  const restoreLocalView = () => {
    try {
      const v = JSON.parse(localStorage.getItem('tv:chartView') || 'null');
      if (v && typeof v.timestamp === 'number') { setTargetTimestamp(v.timestamp); viewTimestampRef.current = v.timestamp; }
      if (v && typeof v.bar_spacing === 'number' && v.bar_spacing > 0) { setTargetBarSpacing(v.bar_spacing); viewBarSpacingRef.current = v.bar_spacing; }
    } catch { /* none kept */ }
  };

  // A collab's own view in this browser (kept per collab link, apart from this user's chart): its
  // symbol, timeframe, centre bar and zoom, so reloading a collab comes back where you were
  const collabToken = () => new URLSearchParams(window.location.search).get("collab") || collab.get().token || "";
  const restoreCollabView = (token: string) => {
    try {
      const v = JSON.parse(localStorage.getItem(`tv:collabView:${token}`) || 'null');
      if (!v) return;
      if (typeof v.symbol === 'string' && v.symbol) setSymbol(v.symbol);
      const label = typeof v.interval === 'string' ? intervalToLabel(v.interval) : undefined;
      if (label) { setSelectedInterval(v.interval); setIntervalLabel(label); }
      if (typeof v.timestamp === 'number') { setTargetTimestamp(v.timestamp); viewTimestampRef.current = v.timestamp; }
      if (typeof v.bar_spacing === 'number' && v.bar_spacing > 0) { setTargetBarSpacing(v.bar_spacing); viewBarSpacingRef.current = v.bar_spacing; }
    } catch { /* none kept */ }
  };
  const saveCollabView = (timestamp: number | null, barSpacing: number | null) => {
    const token = collabToken();
    if (!token || timestamp == null) return;
    try { localStorage.setItem(`tv:collabView:${token}`, JSON.stringify({ symbol: symbolRef.current, interval: intervalRef.current, timestamp, bar_spacing: barSpacing })); } catch { /* full */ }
  };
  // The view a page opens with: a collab link's own, else this browser's
  const restoreView = () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("collab");
    if (token) restoreCollabView(token);
    else if (!params.has("session")) restoreLocalView();   // a session places the chart itself
  };

  // Load Chart State from Django Backend (a failed read is tried again a few times; until it's
  // read, nothing is saved over it)
  useEffect(() => {
    if (user) {
      let gone = false;
      setStateOwner(null);
      const read = async () => {
        let lastErr: any = null;
        for (const wait of [0, 1500, 4000, 10000]) {
          if (wait) await new Promise(r => setTimeout(r, wait));
          if (gone) throw new Error("superseded");
          try {
            const res = await backendFetch(`${BACKEND_URL}/api/users/chart_state/${user.uid}/`);
            if (res.ok) return res.json();
            lastErr = new Error(`HTTP error! status: ${res.status}`);
          } catch (e) { lastErr = e; }
          // (meanwhile the chart opens with this browser's copy)
          if (!wait) { restoreLocalIndicators(); restoreView(); setIsStateLoaded(true); }
        }
        throw lastErr;
      };
      read()
        .then(data => {
          if (gone) return;
          // (a backtest session being opened picks its own symbol and timeframe; so does a collab
          // link: the room's chart where this user last was in that collab — their own chart's
          // view doesn't carry into it)
          const params = new URLSearchParams(window.location.search);
          const openingCollab = params.has("collab");
          const openingSession = params.has("session") || openingCollab;
          if (data.symbol && !openingSession) setSymbol(data.symbol);
          // Only an interval the app knows ("15min", not the label "15m" older saves can hold)
          const label = data.interval ? intervalToLabel(data.interval) : undefined;
          if (label && !openingSession) {
            setSelectedInterval(data.interval);
            setIntervalLabel(label);
          }
          if (openingCollab) restoreCollabView(params.get("collab") || "");
          // (a backtest session places the chart at its own bar: this user's view would fight it)
          else if (!params.has("session")) {
            if (data.timestamp) { setTargetTimestamp(data.timestamp); viewTimestampRef.current = data.timestamp; }
            if (data.bar_spacing) { setTargetBarSpacing(data.bar_spacing); viewBarSpacingRef.current = data.bar_spacing; }
            if (!data.timestamp) restoreLocalView();
          }
          if (data.indicators && Array.isArray(data.indicators) && data.indicators.length > 0) {
            setActiveIndicators(data.indicators);
          }
          setStateOwner(user.uid);
        })
        // the backend being down or failing just means the chart opens with what this browser kept
        // (and none of it is saved to the account)
        .catch(err => { if (!gone) console.warn("Chart state not loaded, using this browser's:", err?.message); })
        .finally(() => { if (!gone) setIsStateLoaded(true); });
      return () => { gone = true; };
    } else {
      restoreLocalIndicators();
      restoreView();
      setIsStateLoaded(true);
    }
  }, [user]);

  // This browser's copy of the indicators (and, through cloud sync, the account's)
  useEffect(() => {
    if (!isStateLoaded) return;
    try { localStorage.setItem('tv:indicators', JSON.stringify(activeIndicators)); } catch { /* full */ }
  }, [activeIndicators, isStateLoaded]);

  // Save chart state when symbol or interval changes (skip initial load)
  useEffect(() => {
    // (in a collab the chart is the room's: nothing of it is saved as this user's own chart)
    if (user && isStateLoaded && stateOwner === user.uid && !collab.chartActive) {
      // Skip the very first fire (when isStateLoaded transitions to true with loaded values)
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        return;
      }
      // Cancel any pending onChartStateChange save to prevent stale-closure overwrites
      clearTimeout((window as any).__saveChartStateTimer);
      const timer = setTimeout(() => {
        console.log(`[Page] Saving state on symbol/interval change: ${symbol} / ${selectedInterval}`);
        backendFetch(`${BACKEND_URL}/api/users/chart_state/${user.uid}/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            symbol, 
            interval: selectedInterval,
            timestamp: viewTimestampRef.current,
            bar_spacing: viewBarSpacingRef.current
          })
        }).catch(err => console.warn("[Page] Failed to save state on symbol/interval change", err));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [symbol, selectedInterval, user, isStateLoaded, stateOwner]);

  // Save indicators when they change
  useEffect(() => {
    if (user && isStateLoaded && stateOwner === user.uid && hasLoadedOnce.current && !collab.chartActive) {
      const timer = setTimeout(() => {
        console.log(`[Page] Saving indicators: ${activeIndicators.length} indicators`);
        backendFetch(`${BACKEND_URL}/api/users/chart_state/${user.uid}/`, {
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
  }, [activeIndicators, user, isStateLoaded, stateOwner]);

  // Save chart state on page unload (beforeunload) so the last state is always captured
  useEffect(() => {
    if (!user) return;
    const handleBeforeUnload = () => {
      // the room's chart isn't this user's own: kept as that collab's view instead
      if (collab.chartActive) { saveCollabView(viewTimestampRef.current, viewBarSpacingRef.current); return; }
      if (stateOwnerRef.current !== user.uid) return;   // (their saved state hasn't been read yet)
      const payload = JSON.stringify({
        symbol,
        interval: selectedInterval,
        timestamp: viewTimestampRef.current,
        bar_spacing: viewBarSpacingRef.current,
        indicators: activeIndicators
      });
      // Use sendBeacon for reliable delivery during page unload
      navigator.sendBeacon(
        `${BACKEND_URL}/api/users/chart_state/${user.uid}/?session_key=${encodeURIComponent(sessionKey())}`,
        new Blob([payload], { type: 'application/json' })
      );
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user, symbol, selectedInterval, activeIndicators]);

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
    layouts.save();
    // Signed out, the layout is still kept on this device: stay on the chart
    if (!user) { setHeaderToast("Chart layout saved"); return; }
    clearTimeout((window as any).__saveChartStateTimer);
    backendFetch(`${BACKEND_URL}/api/users/chart_state/${user.uid}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        interval: selectedInterval,
        timestamp: viewTimestampRef.current,
        bar_spacing: viewBarSpacingRef.current,
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
    const onFeedback = () => setShowFeedback(true);
    window.addEventListener("tv:save-chart", onSave);
    window.addEventListener("tv:publish-idea", onPublish);
    window.addEventListener("tv:open-shortcuts", onShortcuts);
    window.addEventListener("tv:open-feedback", onFeedback);
    return () => {
      window.removeEventListener("tv:save-chart", onSave);
      window.removeEventListener("tv:publish-idea", onPublish);
      window.removeEventListener("tv:open-shortcuts", onShortcuts);
      window.removeEventListener("tv:open-feedback", onFeedback);
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
    // EMAs and the Pine-based indicators can be added several times (as on TradingView); Volume / FXN once
    if (indicator !== "Moving Average Exponential" && !isPineIndicator(indicator) && activeIndicators.some(i => i.name === indicator)) return;
    if (!requireRoom("indicators", activeIndicators.length + 1)) return;   // more than 3 is premium
    setActiveIndicators(prev => [...prev, { id: Math.random().toString(36).substring(7), name: indicator }]);
  };

  const handleRemoveIndicator = (id: string) => {
    setActiveIndicators(prev => prev.filter(i => i.id !== id));
  };
  // An indicator's inputs / visibility, kept on its entry so they save with the layout
  const handleUpdateIndicator = (id: string, patch: { inputs?: Record<string, any>; visible?: boolean; config?: Record<string, any> }) => {
    setActiveIndicators(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
  };

  // Applying an indicator template replaces the chart's indicators with the saved set
  // (fresh ids, saved settings restored), then switches symbol/interval if it kept them.
  const applyIndicatorTemplate = (template: IndicatorTemplate) => {
    if (!requireRoom("indicators", template.indicators.length)) return;
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
    setActiveIndicators(next);
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
    { id: 'interval', label: 'Change interval', section: 'FUNCTIONS', keywords: ['timeframe', 'resolution'], icon: <Clock3 {...icon18} />, run: openQuickChangeInterval },
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
    { id: 'feedback', label: 'Send feedback / report a bug', section: 'FUNCTIONS', keywords: ['feedback', 'bug', 'report', 'issue', 'contact'], icon: <MessageCircle {...icon18} />, run: () => window.dispatchEvent(new CustomEvent('tv:open-feedback')) },
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

      {!panelsHidden && drawingsPanelVisible && (
        <aside className={styles.leftToolbar} data-left-toolbar>
          <LeftToolbar indicatorCount={activeIndicators.length} onRemoveIndicators={() => setActiveIndicators([])} />
        </aside>
      )}

      <main className={styles.mainChart}>
        {(() => {
          // Layout setup: each chart's cell; the full chart sits in the active one (moved, not
          // remounted, when another chart is clicked), the others are SecondaryCharts
          const grid = workingLayout ? (LAYOUTS[workingLayout.grid] || LAYOUTS["1a"]) : LAYOUTS["1a"];
          const cells = workingLayout ? workingLayout.cells.slice(0, grid.charts) : [];
          const multi = grid.charts > 1 && cells.length === grid.charts;
          const active = multi ? Math.min(workingLayout!.active, grid.charts - 1) : 0;
          const rect = (i: number): React.CSSProperties => {
            const [x, y, w, h] = grid.cells[i];
            const g = (from: number, to: number) => (from > 0 ? 1 : 0) + (to < 0.999 ? 1 : 0);
            return {
              position: "absolute",
              left: `calc(${x * 100}% + ${x > 0 ? 1 : 0}px)`, top: `calc(${y * 100}% + ${y > 0 ? 1 : 0}px)`,
              width: `calc(${w * 100}% - ${g(x, x + w)}px)`, height: `calc(${h * 100}% - ${g(y, y + h)}px)`,
            };
          };
          return (
            <div data-chart-grid={grid.id} style={{ position: "absolute", inset: 0, background: multi ? "var(--tv-color-border)" : undefined }}>
              {multi && cells.map((c, i) => i === active ? null : (
                <div key={`cell-${i}`} style={{ ...rect(i), background: "var(--tv-color-pane-bg)", overflow: "hidden" }}>
                  <SecondaryChart index={i} symbol={c.symbol} interval={c.interval} intervalLabel={c.intervalLabel} theme={theme} chartType={c.chartType}
                    showVolume={activeIndicators.some(ind => ind.name === "Volume" && (ind as any).visible !== false)}
                    onActivate={(idx) => layouts.update({ active: idx })} />
                </div>
              ))}
              <div data-active-chart style={{ ...(multi ? rect(active) : { position: "absolute", inset: 0 }), overflow: "hidden" }}>
        {isStateLoaded ? (
          <ChartContainer 
            theme={theme} 
            interval={selectedInterval} 
            intervalLabel={intervalLabel} 
            symbol={symbol}
            activeIndicators={activeIndicators}
            onRemoveIndicator={handleRemoveIndicator}
            onUpdateIndicator={handleUpdateIndicator}
            initialTargetTimestamp={targetTimestamp}
            initialBarSpacing={targetBarSpacing}
            onOpenOrderPanel={(side) => requestTrade(side, symbol)}
            onChartStateChange={(newTimestamp, newBarSpacing) => {
              // In a collab the view is kept as that collab's (this browser), not this user's own chart
              if (collab.chartActive) {
                viewTimestampRef.current = newTimestamp;
                viewBarSpacingRef.current = newBarSpacing;
                saveCollabView(newTimestamp, newBarSpacing);
                return;
              }
              // Keep local state in sync so beforeunload can persist latest values
              viewTimestampRef.current = newTimestamp;
              viewBarSpacingRef.current = newBarSpacing;
              try { localStorage.setItem('tv:chartView', JSON.stringify({ timestamp: newTimestamp, bar_spacing: newBarSpacing })); } catch { /* full */ }
              // (the chart keeps the first copy of this function, made before sign-in may have
              // finished: the user is read from the ref, or a signed-in view would never be saved)
              const u = userRef.current;
              if (u && stateOwnerRef.current === u.uid) {
                // Debounced save — use refs to always read latest symbol/interval
                clearTimeout((window as any).__saveChartStateTimer);
                (window as any).__saveChartStateTimer = setTimeout(() => {
                  const currentSymbol = symbolRef.current;
                  const currentInterval = intervalRef.current;
                  console.log(`[Page] Saving state to DB: sym=${currentSymbol}, int=${currentInterval}, ts=${newTimestamp}, bs=${newBarSpacing}`);
                  backendFetch(`${BACKEND_URL}/api/users/chart_state/${u.uid}/`, {
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
              </div>
              {multi && <div aria-hidden style={{ ...rect(active), boxShadow: "inset 0 0 0 1px #2962ff", pointerEvents: "none", zIndex: 60 }} />}
            </div>
          );
        })()}
        <FavoritesToolbar />
      </main>

      {!panelsHidden && showRightPanel && (
        <aside className={styles.rightToolbar}>
          {dockedTicketOpen ? (
            <DockedTradingPanel />
          ) : activeSidebarPanel === "alerts" ? (
            <AlertsSidebar />
          ) : activeSidebarPanel === "object_tree" ? (
            <ObjectTreePanel />
          ) : activeSidebarPanel === "collab" ? (
            <CollabPanel onShare={() => setShowCollabDialog(true)} />
          ) : activeSidebarPanel === "backtest_sessions" ? (
            <BacktestSessionsPanel />
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

      {/* The chart's feedback icon: a small bubble anchored above the bottom bar, on the chart's
          bottom-left corner beside the logo; clicking it opens the bug-report panel. Hidden when
          panels are hidden or the panel itself is open. (It sat over the drawing toolbar's column:
          in a short window, e.g. 1326 x 560, it covered the Magnet button and swallowed its clicks.) */}
      {!panelsHidden && !showFeedback && (
        <button
          onClick={() => setShowFeedback(true)}
          aria-label="Send feedback"
          title="Send feedback / report a bug"
          style={{
            position: "fixed", left: "calc(var(--tv-left-toolbar-width) + 52px)", bottom: "calc(var(--tv-bottom-toolbar-height) + 14px)",
            width: "36px", height: "36px", borderRadius: "50%",
            border: "1px solid var(--tv-color-border)",
            backgroundColor: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)",
            display: "flex", alignItems: "center", justifyContent: "center",
            // (above the chart, under the toolbars (2001) so their flyout menus open over it)
            cursor: "pointer", zIndex: 2000,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          <MessageCircle size={17} strokeWidth={1.5} />
        </button>
      )}

      <OrderTicket placement="floating" />
      <TradingDialogs />
      <TradingNotifications />
      <AlertToasts theme={theme} />

      {showAlertModal && (
        <CreateAlertModal
          key={editAlertId ?? "new"}
          theme={theme}
          symbol={symbol}
          initialPrice={alertInitialPrice}
          editId={editAlertId}
          onClose={() => { setShowAlertModal(false); setEditAlertId(undefined); }}
        />
      )}

      {showQuickSearch && (
        <QuickSearchDialog actions={quickActions} onClose={() => setShowQuickSearch(false)} />
      )}

      {leaveReplayOpen && <ReplayLeaveDialog onStay={() => setLeaveReplayOpen(false)} onLeave={leaveReplay} />}
      <BacktestSessionBar symbol={symbol} interval={selectedInterval} intervalLabel={intervalLabel}
        onSymbol={setSymbol} onInterval={(iv, label) => handleIntervalChange(iv, label)} />
      {showShortcuts && <KeyboardShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      {showFeedback && (
        <FeedbackPanel
          theme={theme}
          symbol={symbol}
          interval={intervalLabel}
          onClose={() => setShowFeedback(false)}
        />
      )}

      {/* Collab charts: opening links and invites, keeping the shared chart in step, others' cursors and trades */}
      <CollabController />
      <CollabDrawingSync />
      <CollabChartSync
        symbol={symbol}
        interval={selectedInterval}
        indicators={activeIndicators}
        setSymbol={setSymbol}
        // The room's timeframe as it is (a 30s or custom one too, without premium): only this
        // user's own switches go through the plan check (handleIntervalChange)
        setInterval={(i) => { setSelectedInterval(i); setIntervalLabel(intervalToLabel(i) || intervalShort(i)); }}
        setIndicators={setActiveIndicators}
      />
      <CollabPresenceSync symbol={symbol} />
      <CollabReplaySync />
      <CollabPineSync />
      <CollabAlertsSync />
      <CollabOverlay symbol={symbol} />
      {showCollabDialog && (
        <CollabDialog symbol={symbol} interval={selectedInterval} indicators={activeIndicators} onClose={() => setShowCollabDialog(false)} />
      )}

      {showMobileMenu && (
        <MobileMenuDrawer
          isDark={theme === "dark"}
          drawingsPanelVisible={drawingsPanelVisible}
          onClose={() => setShowMobileMenu(false)}
          onOpenPanel={setMobilePanel}
          onOpenPineEditor={() => setShowPineEditor(true)}
          onOpenTradingPanel={() => window.dispatchEvent(new CustomEvent('tv:open-trading-panel'))}
          onToggleTheme={toggleTheme}
          onToggleDrawingsPanel={toggleDrawingsPanel}
        />
      )}

      {mobilePanel && (
        <MobilePanelSheet panel={mobilePanel} onClose={() => setMobilePanel(null)}>
          {mobilePanel === "alerts" ? (
            <AlertsSidebar />
          ) : mobilePanel === "object_tree" ? (
            <ObjectTreePanel />
          ) : (
            <RightToolbar symbol={symbol} onSymbolChange={(s) => { setSymbol(s); setMobilePanel(null); }} />
          )}
        </MobilePanelSheet>
      )}

      {showIntervalModal && (
        <ChangeIntervalModal
          theme={theme}
          currentInterval={selectedInterval}
          initialDigit={intervalInitialDigit}
          startInCustomForm={intervalCustomForm}
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
