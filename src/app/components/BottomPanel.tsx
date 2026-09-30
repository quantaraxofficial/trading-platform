"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import GoToModal from "./GoToModal";
import TradingPanel, { PANEL_ROW_HEIGHT } from "../trading/TradingPanel";
import { engine, tradingUi, useEngineState } from "../trading/store";
import { Tip, TipKey } from "../trading/ui";
import { TVGoToDateIcon } from "./icons/TVIcons";
import { useEscapeClose } from "../lib/useEscapeClose";
import { pineDock } from "./pine/pineStore";
import { strategyDock, useStrategyPresence, STRATEGY_HOST_ID } from "./strategy/strategyStore";

export type DateRangeSpan = { days?: number; months?: number } | "ytd" | "all";

// TradingView's date ranges: each one switches the chart to a fitting interval and shows
// that much history ending at the latest bar (ChartContainer applies the range once the
// interval's bars are loaded — see "tv:apply-date-range").
const DATE_RANGES: { key: string; label: string; interval: string; span: DateRangeSpan }[] = [
  { key: "1D", label: "1 day in 1 minute intervals", interval: "1min", span: { days: 1 } },
  { key: "5D", label: "5 days in 5 minutes intervals", interval: "5min", span: { days: 5 } },
  { key: "1M", label: "1 month in 30 minutes intervals", interval: "30min", span: { months: 1 } },
  { key: "3M", label: "3 months in 1 hour intervals", interval: "1h", span: { months: 3 } },
  { key: "6M", label: "6 months in 2 hours intervals", interval: "2h", span: { months: 6 } },
  { key: "YTD", label: "Year to day in 1 day intervals", interval: "1day", span: "ytd" },
  { key: "1Y", label: "1 year in 1 day intervals", interval: "1day", span: { months: 12 } },
  { key: "5Y", label: "5 years in 1 week intervals", interval: "1week", span: { months: 60 } },
  { key: "All", label: "All data in 1 month intervals", interval: "1month", span: "all" },
];

// Below this width the bottom bar swaps its row of range buttons for a "Date Range" menu
const COMPACT_WIDTH = 560;
// On phones (the width where the header's menu button appears) the range buttons also fold
// into the "Date Range" menu
const PHONE_QUERY = "(max-width: 700px)";

// TradingView's bottom rows: the chart's 38px date-range row (under a 1px line), then, while a
// broker is connected, a 4px gap and the trading panel (its 38px tab row, plus the account
// manager when opened)
const RANGE_ROW_HEIGHT = 38;
const PANEL_GAP = 4;
const DEFAULT_PANEL_HEIGHT = 340;
const MIN_PANEL_HEIGHT = 150;
// Room the header, date-range row and a sliver of chart keep while the panel is dragged taller
const MIN_CHART_SPACE = 220;

type PanelState = { open: boolean; height: number };
const PANEL_KEY = "tv:tradingPanel";
function loadPanelState(): PanelState {
  try {
    const v = JSON.parse(localStorage.getItem(PANEL_KEY) || "null");
    if (v && typeof v.height === "number") return { open: !!v.open, height: Math.max(MIN_PANEL_HEIGHT, v.height) };
  } catch { /* ignore */ }
  return { open: false, height: DEFAULT_PANEL_HEIGHT };
}
function savePanelState(p: PanelState) {
  try { localStorage.setItem(PANEL_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export default function BottomPanel({ interval }: { theme?: string; interval?: string }) {
  const [showGoTo, setShowGoTo] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState("00:00");
  const [clock, setClock] = useState("");
  const [activeRange, setActiveRange] = useState<string | null>(null);
  const [showRangeMenu, setShowRangeMenu] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const rangeBtnRef = useRef<HTMLButtonElement>(null);
  const [barWidth, setBarWidth] = useState(Infinity);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBarWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = barWidth < COMPACT_WIDTH;
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const applyRange = (range: typeof DATE_RANGES[number]) => {
    setActiveRange(range.key);
    setShowRangeMenu(false);
    window.dispatchEvent(new CustomEvent('tv:apply-date-range', { detail: { interval: range.interval, span: range.span } }));
  };

  // --- Trading panel: only while a broker is connected (logging out removes it, as on TradingView)
  const connected = useEngineState().connected;
  const [panel, setPanel] = useState<PanelState>({ open: false, height: DEFAULT_PANEL_HEIGHT });
  const [maximized, setMaximized] = useState(false);
  useEffect(() => { setPanel(loadPanelState()); }, []);
  useEffect(() => { savePanelState(panel); }, [panel]);
  // Logging out collapses it for next time (a page load, before the saved account is back,
  // isn't a log out)
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (wasConnected.current && !connected) {
      setMaximized(false);
      setPanel(p => (p.open ? { ...p, open: false } : p));
    }
    wasConnected.current = connected;
  }, [connected]);
  const panelOpen = connected && panel.open;
  const toggleOpen = () => {
    if (maximized) { setMaximized(false); setPanel(p => ({ ...p, open: false })); return; }
    setPanel(p => ({ ...p, open: !p.open }));
  };
  const toggleMaximize = () => {
    if (maximized) { setMaximized(false); return; }
    setPanel(p => ({ ...p, open: true }));
    setMaximized(true);
  };

  // The header's Trade button (and the phone menu) ask for the account manager; with no
  // broker connected that means picking one first
  useEffect(() => {
    const open = () => {
      if (!engine.getState().connected) { tradingUi.set({ dialog: { kind: "broker" } }); return; }
      setPanel(p => ({ ...p, open: true }));
    };
    window.addEventListener('tv:open-trading-panel', open);
    return () => window.removeEventListener('tv:open-trading-panel', open);
  }, []);

  // The Pine Editor, moved to the bottom ("Move script to bottom"): its tab and editor sit under
  // the date-range row, in a section this bar sizes (the editor renders itself into it)
  const dock = pineDock.useValue();
  const pineBottom = dock.open && !dock.collapsed && dock.mode === "bottom";
  const pineHeight = dock.bottomExpanded ? dock.bottomHeight : PANEL_ROW_HEIGHT;
  const startPineResize = (e: React.MouseEvent) => {
    if (!dock.bottomExpanded) return;
    e.preventDefault();
    const startY = e.clientY, startH = dock.bottomHeight;
    document.body.style.cursor = "ns-resize";
    let frame = 0;
    const move = (ev: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - MIN_CHART_SPACE);
        pineDock.set({ bottomHeight: Math.round(Math.max(MIN_PANEL_HEIGHT, Math.min(max, startH + startY - ev.clientY))) });
      });
    };
    const up = () => { cancelAnimationFrame(frame); document.body.style.cursor = ""; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  // A strategy on the chart: its report sits in its own section (the report renders itself into
  // it), expanded or collapsed to its tab, resizable, or maximized over the chart column
  const strategyOn = useStrategyPresence().on;
  const st = strategyDock.useValue();
  const stHeight = st.expanded ? st.height : PANEL_ROW_HEIGHT;
  const stMax = strategyOn && st.maximized;
  const startStrategyResize = (e: React.MouseEvent) => {
    if (!st.expanded || st.maximized) return;
    e.preventDefault();
    const startY = e.clientY, startH = st.height;
    document.body.style.cursor = "ns-resize";
    let frame = 0;
    const move = (ev: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - MIN_CHART_SPACE);
        strategyDock.set({ height: Math.round(Math.max(MIN_PANEL_HEIGHT, Math.min(max, startH + startY - ev.clientY))) });
      });
    };
    const up = () => { cancelAnimationFrame(frame); document.body.style.cursor = ""; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  // Everything below the chart (for the grid row, and for toasts that sit above it)
  const bottomHeight = RANGE_ROW_HEIGHT + 1 + (pineBottom ? PANEL_GAP + pineHeight : 0) + (strategyOn ? PANEL_GAP + stHeight : 0) + (connected ? PANEL_GAP + (panelOpen ? panel.height : PANEL_ROW_HEIGHT) : 0);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--tv-bottom-toolbar-height", `${bottomHeight}px`);
    return () => { root.removeProperty("--tv-bottom-toolbar-height"); };
  }, [bottomHeight]);

  // Maximized, the panel covers the whole chart column, header included
  const [columnBox, setColumnBox] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const root = document.documentElement.style;
    if (!maximized && !stMax) { root.removeProperty("--tv-bottom-panel-z"); return; }
    root.setProperty("--tv-bottom-panel-z", "2003");
    const measure = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) setColumnBox({ left: r.left, width: r.width });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("resize", measure); root.removeProperty("--tv-bottom-panel-z"); };
  }, [maximized, stMax]);

  // Dragging the gap between the chart and the open panel resizes the panel
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const startResize = (e: React.MouseEvent) => {
    if (!panelOpen || maximized) return;
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: panel.height };
    document.body.style.cursor = "ns-resize";
    let frame = 0;
    const move = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - MIN_CHART_SPACE);
        const height = Math.round(Math.max(MIN_PANEL_HEIGHT, Math.min(max, d.startH + d.startY - ev.clientY)));
        setPanel(p => (p.height === height ? p : { ...p, height }));
      });
    };
    const up = () => {
      dragRef.current = null;
      cancelAnimationFrame(frame);
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  // Alt+G (handled globally in page.tsx) opens the same Go to dialog as the calendar button
  useEffect(() => {
    const open = () => setShowGoTo(true);
    window.addEventListener('tv:open-goto', open);
    return () => window.removeEventListener('tv:open-goto', open);
  }, []);

  // Switching to an interval other than the picked range's means the chart no longer shows
  // that preset range, so it stops being highlighted
  useEffect(() => {
    setActiveRange(key => (key && DATE_RANGES.find(r => r.key === key)?.interval === interval ? key : null));
  }, [interval]);

  // Live ticking clock — reflects the chart's selected timezone (from the "UTC" dropdown),
  // kept in sync via localStorage + a same-tab custom event since ChartContainer owns the state.
  const [clockTimezone, setClockTimezone] = useState<string>('UTC');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tv:chartTimezone');
      if (stored) { setClockTimezone(stored); return; }
    } catch { /* ignore */ }
    try { setClockTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const handleChange = (e: Event) => {
      const tz = (e as CustomEvent).detail;
      if (typeof tz === 'string') setClockTimezone(tz);
    };
    window.addEventListener('tv:timezone-changed', handleChange);
    return () => window.removeEventListener('tv:timezone-changed', handleChange);
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const zone = clockTimezone === 'exchange' ? 'UTC' : clockTimezone;
      let h = '00', m = '00', s = '00', offsetLabel = 'UTC';
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: zone, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
        }).formatToParts(now);
        const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
        h = get('hour') === '24' ? '00' : get('hour');
        m = get('minute');
        s = get('second');

        const offsetParts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now);
        const gmt = offsetParts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
        offsetLabel = gmt.replace('GMT', 'UTC').replace(/^UTC$/, 'UTC+0');
      } catch { /* ignore */ }
      setClock(`${h}:${m}:${s} ${offsetLabel}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [clockTimezone]);

  // "Date Range ⌄" (or the picked range's name) — the narrow-screen form of the range buttons
  const renderRangeMenuButton = () => (
    <button
      ref={rangeBtnRef}
      className={`tv-bb-btn ${showRangeMenu ? "active" : ""}`}
      style={{ gap: "4px", padding: "0 8px" }}
      onClick={() => setShowRangeMenu(v => !v)}
    >
      {activeRange ?? "Date Range"}
      <ChevronDown size={14} strokeWidth={1.5} />
    </button>
  );

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minWidth: 0 }}>
      {/* The chart's bottom row: date ranges and Go to on the left, the clock on the right */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 8,
        height: RANGE_ROW_HEIGHT, padding: "0 6px 0 10px", boxSizing: "content-box",
        borderTop: "1px solid var(--tv-color-gap)", background: "var(--tv-color-bg)", color: "var(--tv-hdr-text)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
          {compact || isPhone ? renderRangeMenuButton() : (
            DATE_RANGES.map(range => (
              <Tip key={range.key} text={range.label}>
                <button
                  className={`tv-bb-btn ${range.key === activeRange ? "active" : ""}`}
                  onClick={() => applyRange(range)}
                >
                  {range.key}
                </button>
              </Tip>
            ))
          )}
          {!(compact || isPhone) && (
            <>
              <div style={{ width: 1, height: 20, margin: "0 6px", background: "var(--tv-active-neutral)", flexShrink: 0 }} />
              <Tip text={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Go to <TipKey>Alt</TipKey>+<TipKey>G</TipKey></span>}>
                <button className="tv-bb-btn" aria-label="Go to" style={{ width: 32, padding: 0 }} onClick={() => setShowGoTo(true)}>
                  <TVGoToDateIcon size={28} />
                </button>
              </Tip>
            </>
          )}
        </div>

        <Tip text="Timezone">
          <button
            className="tv-bb-btn"
            data-timezone-toggle
            aria-label="Timezone"
            style={{ padding: "0 6px", fontVariantNumeric: "tabular-nums" }}
            onClick={() => window.dispatchEvent(new CustomEvent('tv:open-timezone-menu'))}
          >
            {clock}
          </button>
        </Tip>
      </div>

      {pineBottom && (
        <>
          <div onMouseDown={startPineResize} aria-hidden style={{ height: PANEL_GAP, flexShrink: 0, cursor: dock.bottomExpanded ? "ns-resize" : "default" }} />
          <div id="tv-pine-bottom-host" style={{ height: pineHeight, flexShrink: 0, minHeight: 0, position: "relative", background: "var(--tv-color-bg)" }} />
        </>
      )}

      {strategyOn && (
        <>
          <div onMouseDown={startStrategyResize} aria-hidden style={{ height: PANEL_GAP, flexShrink: 0, cursor: st.expanded && !st.maximized ? "ns-resize" : "default" }} />
          <div
            id={STRATEGY_HOST_ID}
            style={stMax && columnBox
              ? { position: "fixed", top: 0, bottom: 0, left: columnBox.left, width: columnBox.width, zIndex: 3, background: "var(--st-bg)" }
              : { height: stHeight, flexShrink: 0, minHeight: 0, position: "relative", background: "var(--st-bg)" }}
          />
        </>
      )}

      {connected && (
        <>
          {/* The 4px gap above the panel: drag it to resize the open panel */}
          <div
            onMouseDown={startResize}
            aria-hidden
            style={{ height: PANEL_GAP, flexShrink: 0, cursor: panelOpen && !maximized ? "ns-resize" : "default" }}
          />
          <div style={maximized && columnBox ? {
            position: "fixed", top: 0, bottom: 0, left: columnBox.left, width: columnBox.width,
          } : { height: panelOpen ? panel.height : PANEL_ROW_HEIGHT, flexShrink: 0, minHeight: 0 }}>
            <TradingPanel open={panelOpen} maximized={maximized} onToggleOpen={toggleOpen} onToggleMaximize={toggleMaximize} />
          </div>
        </>
      )}

      {/* Full-screen layers go to <body>: inside the bottom bar they'd share its stacking
          level and the drawing toolbar (one level up, so its menus can overlay this bar)
          would paint over them */}
      {showRangeMenu && createPortal(
        <DateRangeMenu
          anchor={rangeBtnRef.current}
          activeRange={activeRange}
          onPick={applyRange}
          onGoTo={() => { setShowRangeMenu(false); setShowGoTo(true); }}
          onClose={() => setShowRangeMenu(false)}
        />,
        document.body
      )}

      {showGoTo && createPortal(
        <GoToModal
          onClose={() => setShowGoTo(false)}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          selectedTime={selectedTime}
          setSelectedTime={setSelectedTime}
        />,
        document.body
      )}
    </div>
  );
}

// The date-range list: a bottom sheet on phones (as TradingView shows it), otherwise a menu
// rising from the button. Ends with "Go to…", the calendar dialog.
function DateRangeMenu({ anchor, activeRange, onPick, onGoTo, onClose }: {
  anchor: HTMLElement | null;
  activeRange: string | null;
  onPick: (range: typeof DATE_RANGES[number]) => void;
  onGoTo: () => void;
  onClose: () => void;
}) {
  useEscapeClose(onClose);
  const isPhone = typeof window !== "undefined" && window.innerWidth <= 700;
  const a = anchor?.getBoundingClientRect();
  const panelStyle: React.CSSProperties = isPhone
    ? { position: "fixed", left: 0, right: 0, bottom: 0, borderRadius: "12px 12px 0 0", maxHeight: "80vh" }
    : {
        position: "fixed", width: "300px", borderRadius: "6px", maxHeight: "70vh",
        bottom: a ? window.innerHeight - a.top + 4 : 40,
        left: a ? Math.max(8, Math.min(a.left, window.innerWidth - 308)) : 8,
      };
  const row = (key: string, content: React.ReactNode, onClick: () => void, active = false) => (
    <button
      key={key}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "12px", width: "100%", minHeight: isPhone ? "40px" : "34px",
        padding: isPhone ? "0 24px 0 42px" : "0 16px", border: "none", cursor: "pointer", textAlign: "left",
        fontSize: isPhone ? "15px" : "14px", color: active ? "var(--tv-color-accent)" : "var(--tv-color-text)",
        backgroundColor: active ? "var(--tv-color-item-active)" : "transparent",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = "var(--tv-color-item-hover)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {content}
    </button>
  );
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10006, backgroundColor: isPhone ? "rgba(0,0,0,0.3)" : "transparent" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        ...panelStyle, overflowY: "auto", padding: "8px 0", backgroundColor: "var(--tv-color-pane-bg)",
        border: "1px solid var(--tv-color-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      }}>
        {DATE_RANGES.map(r => row(r.key, r.label, () => onPick(r), r.key === activeRange))}
        <div style={{ height: "1px", backgroundColor: "var(--tv-color-border)", margin: "6px 0" }} />
        {row("goto", <><span style={{ display: "flex", marginLeft: isPhone ? "-30px" : "-6px" }}><TVGoToDateIcon size={28} /></span>Go to…</>, onGoTo)}
      </div>
    </div>
  );
}
