"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Info } from "lucide-react";
import styles from "./page.module.css";
import TopBar from "./components/TopBar";
import LeftToolbar from "./components/LeftToolbar";
import RightSidebar from "./components/RightSidebar";
import RightToolbar from "./components/RightToolbar";
import OrderPanel from "./components/OrderPanel";
import BottomPanel from "./components/BottomPanel";
import AlertsSidebar from "./components/AlertsSidebar";
import CreateAlertModal from "./components/CreateAlertModal";
import ChangeIntervalModal from "./components/ChangeIntervalModal";
import ObjectTreeSidebar from "./components/ObjectTreeSidebar";
import FavoritesToolbar from "./components/FavoritesToolbar";
import PineEditorPanel from "./components/PineEditorPanel";
import AgentChatPanel from "./components/AgentChatPanel";
import dynamic from "next/dynamic";
const ChartContainer = dynamic(() => import('./components/ChartContainer'), { ssr: false });
import { DrawingProvider } from "./components/drawing/core/DrawingContext";
import BotController from "./components/bot/BotController";
import { ReplayProvider, useReplay } from "./components/ReplayContext";
import { useAuth } from "@/context/AuthContext";
import { useTelemetry } from "@/context/TelemetryContext";

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
  const [orderPanelState, setOrderPanelState] = useState<{isOpen: boolean, side: "buy" | "sell"}>({isOpen: false, side: "buy"});
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showIntervalModal, setShowIntervalModal] = useState(false);
  const [intervalInitialDigit, setIntervalInitialDigit] = useState("");
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [symbolSearchInitial, setSymbolSearchInitial] = useState("");
  const [activeSidebarPanel, setActiveSidebarPanel] = useState("watchlist");
  const [showPineEditor, setShowPineEditor] = useState(false);
  const [showAgentChat, setShowAgentChat] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [showPanelsHiddenToast, setShowPanelsHiddenToast] = useState(false);

  // Initialize symbol from URL or default to AAPL
  const [symbol, setSymbol] = useState(() => searchParams.get("symbol") || "AAPL");
  const { mode, enterSelectMode } = useReplay();

  // Refs to always have latest values for debounced/async callbacks
  const symbolRef = useRef(symbol);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  const intervalRef = useRef(selectedInterval);
  useEffect(() => { intervalRef.current = selectedInterval; }, [selectedInterval]);
  const hasLoadedOnce = useRef(false);

  // Sync symbol changes to URL
  useEffect(() => {
    const currentSymbol = searchParams.get("symbol");
    if (symbol !== currentSymbol) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("symbol", symbol);
      router.push(`?${params.toString()}`, { scroll: false });
    }
  }, [symbol, router, searchParams]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const urlSymbol = searchParams.get("symbol");
    if (urlSymbol && urlSymbol !== symbol) {
      setSymbol(urlSymbol);
    }
  }, [searchParams]);

  useEffect(() => {
    document.title = `${symbol} | TradePilot`;
  }, [symbol]);

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
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (showAlertModal || showIntervalModal || showSymbolSearch) return;

      // --- Ctrl/Cmd shortcuts ---
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+S = Save (prevent browser save dialog)
        if (e.key === 's') {
          e.preventDefault();
          // Could trigger a save action here
          return;
        }
        // Ctrl+K = Quick search (symbol search)
        if (e.key === 'k') {
          e.preventDefault();
          setSymbolSearchInitial("");
          setShowSymbolSearch(true);
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
          setShowAlertModal(true);
          return;
        }
        // Alt+G = Go to Date (open interval modal as proxy)
        if (key === 'g') {
          e.preventDefault();
          setIntervalInitialDigit("");
          setShowIntervalModal(true);
          return;
        }
        // Alt+R = Reset chart view (fit content + autoscale price)
        if (key === 'r') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('tv-zoom-out'));
          return;
        }
        // Alt+W = Add current symbol to watchlist
        if (key === 'w') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('tv:add-to-watchlist', { detail: symbol }));
          return;
        }
        // Alt+S = Take Snapshot (screenshot)
        if (key === 's') {
          e.preventDefault();
          // Find the chart canvas and take a screenshot
          const chartEl = document.querySelector('.mainChart canvas, main canvas') as HTMLCanvasElement;
          if (chartEl) {
            try {
              chartEl.toBlob((blob) => {
                if (blob) {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${symbol}_chart_${new Date().toISOString().slice(0,10)}.png`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              });
            } catch {
              console.warn("Could not capture chart screenshot");
            }
          }
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
        if (key === 'b') { e.preventDefault(); setOrderPanelState({ isOpen: true, side: 'buy' }); return; }
        if (key === 's') { e.preventDefault(); setOrderPanelState({ isOpen: true, side: 'sell' }); return; }
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
  }, [showAlertModal, showIntervalModal, showSymbolSearch, symbol]);

  const handleIntervalChange = (interval: string, label?: string) => {
    setSelectedInterval(interval);
    if (label) setIntervalLabel(label);
    logAction('TIMEFRAME_CHANGED', { interval, label });
  };

  const { user } = useAuth();
  const { logAction } = useTelemetry();

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
            // Derive basic interval label mapping
            const labelMap: Record<string, string> = {
              "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m", "45min": "45m",
              "1h": "1h", "2h": "2h", "4h": "4h", "1day": "D", "1week": "W", "1month": "M"
            };
            if (labelMap[data.interval]) {
              setIntervalLabel(labelMap[data.interval]);
            } else {
              // Handle custom intervals like "4min" -> "4m"
              const m = data.interval.match(/^(\d+)min$/);
              if (m) setIntervalLabel(`${m[1]}m`);
            }
          }
          if (data.timestamp) setTargetTimestamp(data.timestamp);
          if (data.bar_spacing) setTargetBarSpacing(data.bar_spacing);
          if (data.indicators && Array.isArray(data.indicators) && data.indicators.length > 0) {
            setActiveIndicators(data.indicators);
          }
        })
        .catch(err => console.error("Error loading chart state:", err))
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

  const handleReplayClick = () => {
    if (!user) {
      router.push("/login");
      return;
    }
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

  return (
    <div
      className={styles.layout}
      style={panelsHidden ? { gridTemplateColumns: "0 1fr 0 0", gridTemplateRows: "0 1fr var(--tv-bottom-toolbar-height)" } : undefined}
    >
      {!panelsHidden && (
        <header className={styles.topbar}>
          <TopBar
            theme={theme}
            toggleTheme={toggleTheme}
            interval={selectedInterval}
            onIntervalChange={handleIntervalChange}
            onReplayClick={handleReplayClick}
            isReplayActive={mode !== "inactive"}
            symbol={symbol}
            onSymbolChange={setSymbol}
            onIndicatorSelect={handleIndicatorSelect}
            isBotActive={isBotActive}
            onToggleBot={() => setIsBotActive(!isBotActive)}
            onAlertClick={() => setShowAlertModal(true)}
            symbolSearchOpen={showSymbolSearch}
            symbolSearchInitial={symbolSearchInitial}
            onSymbolSearchClose={() => setShowSymbolSearch(false)}
            onSettingsClick={() => setTriggerSettings(t => t + 1)}
            onMaximizeClick={togglePanelsHidden}
          />
        </header>
      )}

      <BotController
        isActive={isBotActive}
        timeframe={selectedInterval}
        setTimeframe={setSelectedInterval}
      />

      {!panelsHidden && (
        <aside className={styles.leftToolbar}>
          <LeftToolbar />
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
            onOpenOrderPanel={(side) => setOrderPanelState({isOpen: true, side})}
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

      {!panelsHidden && (
        <aside className={styles.rightToolbar}>
          {orderPanelState.isOpen ? (
            <OrderPanel
              symbol={symbol}
              theme={theme}
              initialSide={orderPanelState.side}
              onClose={() => setOrderPanelState(prev => ({...prev, isOpen: false}))}
            />
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
          <RightSidebar activePanel={activeSidebarPanel} onPanelChange={setActiveSidebarPanel} onOpenPineEditor={() => setShowPineEditor(true)} onOpenAgent={() => setShowAgentChat(true)} />
        </aside>
      )}

      <footer className={styles.bottomPanel}>
        <BottomPanel />
      </footer>

      {showPineEditor && (
        <PineEditorPanel theme={theme} onClose={() => setShowPineEditor(false)} />
      )}

      {showAgentChat && (
        <AgentChatPanel theme={theme} onClose={() => setShowAgentChat(false)} />
      )}

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

      {showAlertModal && (
        <CreateAlertModal 
          theme={theme} 
          symbol={symbol} 
          onClose={() => setShowAlertModal(false)} 
        />
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
