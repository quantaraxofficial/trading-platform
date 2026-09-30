"use client";

// TradingView's strategy report, in its own section of the bottom panel: the strategy's tab (with
// collapse / maximize), a toolbar (Metrics / Trades, testing period, initial capital, bar
// detalization, script execution, settings, add alert), and either the metrics report (key stats,
// the performance chart, performance analysis, trades analysis) or the list of trades. Every
// figure comes from the backtest's real trades and equity; the pickers re-run the backtest.

import React, { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PineStrategyReport, PineStrategyTrade } from "../lib/pineScriptEngine";
import { useEscapeClose } from "../lib/useEscapeClose";
import { Tip, MinimizeIcon, MaximizeIcon, RestoreIcon } from "../trading/ui";
import TvMenu from "./ui/TvMenu";
import {
  StMetricsIcon, StTradesIcon, StCalendarIcon, StChevronDown18Icon, StChevronUp18Icon, StCapitalIcon, StDetalizationIcon,
  StScriptExecIcon, StGear28Icon, StAddAlertIcon, StDownloadIcon, StColumnsIcon, StTargetIcon, StCheckMarkIcon, StHelp18Icon,
  StInfo18Icon, StGear18Icon, StCameraIcon, StExpandIcon, StEyeOffIcon, StTogglerChevronIcon, StArrowUpRightIcon,
  StArrowDownRightIcon, StUfoIcon, StStrategyTabIcon,
} from "./strategy/icons";
import {
  fmtNum, fmtSigned, fmtPct, fmtSignedPct, fmtCompact, fmtCapital, fmtAxis, fmtDate, fmtDateTime, fmtDuration,
  pnlBySignals, pnlBySide, totalCommission, periodBuckets, cagr, sharpeSortino, buyAndHoldPct, equityPriceCorrelation,
  growthEpisodes, expectancy, outliersPnl, largest, averages, returnsHistogram, streaks, resultsByTime, bestEntryTimes,
  avgTradeDuration, tradesCsv, type PeriodKind, type PnlRow, type TimeGroup,
} from "./strategy/stats";
import { PerformanceChart, CategoryBarChart, Donut, ChartLegend, type PerfVisibility, type PerfChartHandle } from "./strategy/charts";
import { strategyDock, strategyPresence, STRATEGY_HOST_ID, TRADE_COLUMNS, DEFAULT_COLUMNS, type TradeColumn } from "./strategy/strategyStore";
import { PANEL_ROW_HEIGHT } from "../trading/TradingPanel";

export type BacktestRange = { kind: "all" | "days" | "custom" | "history"; days?: number; from?: number; to?: number };

interface StrategyReportPanelProps {
  theme?: string;
  scriptName: string;
  symbol: string;
  report: PineStrategyReport;
  range: BacktestRange;
  busy: boolean;
  tz: string;
  pricePrecision: number;
  onChangeRange: (range: BacktestRange) => void;
  onChangeCapital: (capital: number) => void;
  onShowTime: (from: number, to?: number) => void;
  onOpenSettings: () => void;
  onAddAlert: () => void;
  onRemove: () => void;
  fullRangeStart?: number;
  fullRangeEnd?: number;
}

const CURRENCY = "USD";

// ---------------------------------------------------------------- small pieces

function Currency({ size = 11 }: { size?: number }) {
  return <span style={{ fontSize: size, lineHeight: "16px", letterSpacing: size === 11 ? 0.4 : 0, textTransform: "uppercase", marginLeft: 2, fontWeight: size === 11 ? 400 : 500 }}>{CURRENCY}</span>;
}

function HelpTip({ text, info }: { text: string; info?: boolean }) {
  return (
    <Tip text={text} maxWidth={300}>
      <span style={{ display: "inline-flex", color: "var(--st-icon-muted)", cursor: "default" }}>{info ? <StInfo18Icon /> : <StHelp18Icon />}</span>
    </Tip>
  );
}

// A "Key stats" style cell: title, then value + currency + change
function Cell({ title, children, first, gap = 8, help }: { title: string; children: React.ReactNode; first?: boolean; gap?: number; help?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", minWidth: 200, flex: "1 0 0", marginLeft: first ? 0 : gap }}>
      <div style={{ display: "flex", alignItems: "center", lineHeight: "18px", whiteSpace: "nowrap" }}>
        <span style={{ marginRight: 4 }}>{title}</span>{help && <HelpTip text={help} />}
      </div>
      <div style={{ lineHeight: "24px", whiteSpace: "nowrap" }}>{children}</div>
    </div>
  );
}
const tone = (v: number) => (v > 0 ? "var(--st-pos)" : v < 0 ? "var(--st-neg)" : undefined);
function Money({ v, signed, colored, pct, pctSigned }: { v: number; signed?: boolean; colored?: boolean; pct?: number; pctSigned?: boolean }) {
  return (
    <span style={{ color: colored ? tone(v) : undefined }}>
      <span style={{ fontSize: 16, fontWeight: 500 }}>{signed ? fmtSigned(v) : fmtNum(v)}</span>
      <Currency />
      {pct !== undefined && <span style={{ fontSize: 16, fontWeight: 500, marginLeft: 8 }}>{pctSigned ? fmtSignedPct(pct) : fmtPct(pct)}</span>}
    </span>
  );
}
const Big = ({ children, color }: { children: React.ReactNode; color?: string }) => <span style={{ fontSize: 16, fontWeight: 500, color }}>{children}</span>;

function Cells({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) {
  const items = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<{ first?: boolean; gap?: number }>[];
  return (
    <div className="st-scroll" style={{ display: "flex", overflowX: "auto", overflowY: "hidden" }}>
      {items.map((c, i) => React.cloneElement(c, { first: i === 0, gap }))}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="st-seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={`st-seg-btn${o.value === value ? " checked" : ""}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function RoundTabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="st-scroll" style={{ display: "flex", overflowX: "auto", padding: 4, margin: -4 }} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={`st-roundtab${o.value === value ? " selected" : ""}`} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function InfoTitle({ title, children, small }: { title: string; children?: React.ReactNode; small?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, minHeight: 34, marginBottom: small ? 8 : 12 }}>
      <span style={{ fontSize: 16, fontWeight: 600, lineHeight: "24px" }}>{title}</span>
      {children && <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{children}</div>}
    </div>
  );
}

function NoData({ height, text = "Not enough data to show" }: { height: number; text?: string }) {
  return (
    <div style={{ height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--st-text)" }}>
      <StUfoIcon style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 16, lineHeight: "24px" }}>{text}</div>
    </div>
  );
}

// ---------------------------------------------------------------- popovers

function Popover({ anchor, onClose, width = 290, align = "left", children, label }: {
  anchor: HTMLElement | null; onClose: () => void; width?: number; align?: "left" | "right"; children: React.ReactNode; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscapeClose(onClose);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [anchor, onClose]);
  const [pos, setPos] = useState<{ left: number; top: number; bottomUp?: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor?.getBoundingClientRect();
    if (!r) return;
    let left = align === "left" ? r.left : r.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const h = ref.current?.offsetHeight ?? 200;
    // below the button, or above it when there's no room underneath (a short panel)
    if (r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0) setPos({ left, top: r.top - h });
    else setPos({ left, top: r.bottom });
  }, [anchor, align, width]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} role="menu" aria-label={label} className="st-popover" style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>{children}</div>,
    document.body,
  );
}
const PopHead = ({ title, help, reset }: { title: string; help?: string; reset?: { enabled: boolean; onClick: () => void } }) => (
  <div className="st-pop-head">
    <div className="st-pop-title"><span style={{ marginRight: 4 }}>{title}</span>{help && <HelpTip text={help} />}</div>
    {reset && <button type="button" className="st-pop-reset" disabled={!reset.enabled} onClick={reset.onClick}>Reset</button>}
  </div>
);
const PopDivider = () => <div className="st-pop-divider"><div /></div>;

function Checkbox({ checked }: { checked: boolean }) {
  return <span className={`st-check${checked ? " checked" : ""}`}>{checked && <StCheckMarkIcon />}</span>;
}

// ---------------------------------------------------------------- toolbar

function ToolbarPill({ icon, children, open, onClick, tip, btnRef, label, disabled }: {
  icon: React.ReactNode; children?: React.ReactNode; open?: boolean; onClick: () => void; tip?: string; btnRef?: React.Ref<HTMLButtonElement>; label: string; disabled?: boolean;
}) {
  const btn = (
    <button ref={btnRef} type="button" aria-label={label} aria-expanded={open} disabled={disabled} className={`st-pill${open ? " open" : ""}${children ? "" : " icon-only"}`} onClick={onClick}>
      <span style={{ display: "flex", marginLeft: children ? -4 : 0 }}>{icon}</span>
      {children}
    </button>
  );
  // (always inside its tooltip, open or not: re-wrapping would remount the button a popover is anchored to)
  return tip ? <Tip text={tip}>{btn}</Tip> : btn;
}
const Caret = ({ open }: { open: boolean }) => <span style={{ display: "flex", paddingLeft: 4 }}>{open ? <StChevronUp18Icon /> : <StChevronDown18Icon />}</span>;

const RANGE_PRESETS: { label: string; range: BacktestRange }[] = [
  { label: "Last 7 days", range: { kind: "days", days: 7 } },
  { label: "Last 30 days", range: { kind: "days", days: 30 } },
  { label: "Last 90 days", range: { kind: "days", days: 90 } },
  { label: "Last 365 days", range: { kind: "days", days: 365 } },
];
const sameRange = (a: BacktestRange, b: BacktestRange) => a.kind === b.kind && (a.kind !== "days" || a.days === b.days);

function CustomRangeDialog({ from, to, min, max, onApply, onClose }: { from: number; to: number; min?: number; max?: number; onApply: (from: number, to: number) => void; onClose: () => void }) {
  useEscapeClose(onClose);
  const toInput = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  const [a, setA] = useState(toInput(from));
  const [b, setB] = useState(toInput(to));
  const fromT = Date.parse(a + "T00:00:00Z") / 1000, toT = Date.parse(b + "T23:59:59Z") / 1000;
  const valid = isFinite(fromT) && isFinite(toT) && fromT < toT;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10060, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="st-root" role="dialog" aria-label="Custom date range" style={{ width: 360, borderRadius: 10, boxShadow: "var(--st-menu-shadow)", background: "var(--st-menu-bg)", padding: "16px 20px 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 600, lineHeight: "28px", marginBottom: 16 }}>Custom date range</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="st-input" type="date" aria-label="Start date" value={a} min={min ? toInput(min) : undefined} max={b} onChange={(e) => setA(e.target.value)} style={{ flex: 1 }} />
          <span style={{ color: "var(--st-text-secondary)" }}>{"—"}</span>
          <input className="st-input" type="date" aria-label="End date" value={b} min={a} max={max ? toInput(max) : undefined} onChange={(e) => setB(e.target.value)} style={{ flex: 1 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "1px solid var(--st-input-border)", background: "transparent", color: "var(--st-text)", fontSize: 14 }}>Cancel</button>
          <button type="button" disabled={!valid} onClick={() => { onApply(fromT, toT); onClose(); }} style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: "var(--st-invert-bg)", color: "var(--st-invert-text)", fontSize: 14, opacity: valid ? 1 : 0.5 }}>Apply</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Toolbar({ p, view, setView }: { p: StrategyReportPanelProps; view: "metrics" | "trades"; setView: (v: "metrics" | "trades") => void }) {
  const [menu, setMenu] = useState<null | "range" | "capital" | "detail" | "exec">(null);
  const [customOpen, setCustomOpen] = useState(false);
  const rangeRef = useRef<HTMLButtonElement>(null);
  const capRef = useRef<HTMLButtonElement>(null);
  const detailRef = useRef<HTMLButtonElement>(null);
  const execRef = useRef<HTMLButtonElement>(null);
  const dock = strategyDock.useValue();
  const eq = p.report.equityCurve;
  const winFrom = eq.length ? eq[0].time : p.fullRangeStart ?? 0;
  const winTo = eq.length ? eq[eq.length - 1].time : p.fullRangeEnd ?? 0;
  const [capDraft, setCapDraft] = useState("");
  const close = () => setMenu(null);
  const toggle = (m: typeof menu) => setMenu((cur) => (cur === m ? null : m));
  const pick = (r: BacktestRange) => { close(); p.onChangeRange(r); };
  const applyCapital = () => {
    const v = parseFloat(capDraft.replace(/[,\s]/g, ""));
    if (isFinite(v) && v > 0 && v !== p.report.initialCapital) p.onChangeCapital(v);
  };
  const execCount = 1 + (dock.onRealtimeTick ? 1 : 0);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "0 20px", margin: "8px 0", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        <div className="st-lighttabs" role="tablist" aria-label="Report view">
          <Tip text="Metrics"><button type="button" role="tab" aria-selected={view === "metrics"} aria-label="Metrics" className={`st-lighttab${view === "metrics" ? " selected" : ""}`} onClick={() => setView("metrics")}><StMetricsIcon /></button></Tip>
          <Tip text="Trades"><button type="button" role="tab" aria-selected={view === "trades"} aria-label="Trades" className={`st-lighttab${view === "trades" ? " selected" : ""}`} onClick={() => setView("trades")}><StTradesIcon /></button></Tip>
        </div>
        <div className="st-scroll" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflowX: "auto", overflowY: "hidden" }}>
          <ToolbarPill label={`${fmtDate(winFrom, p.tz)} — ${fmtDate(winTo, p.tz)}`} btnRef={rangeRef} open={menu === "range"} onClick={() => toggle("range")} tip="Testing period" icon={<StCalendarIcon />} disabled={p.busy}>
            <span style={{ marginLeft: 4 }}>{fmtDate(winFrom, p.tz)} {"—"} {fmtDate(winTo, p.tz)}</span><Caret open={menu === "range"} />
          </ToolbarPill>
          <ToolbarPill label={`${fmtCapital(p.report.initialCapital)} ${CURRENCY}`} btnRef={capRef} open={menu === "capital"} onClick={() => { setCapDraft(p.report.initialCapital.toLocaleString("en-US")); toggle("capital"); }} tip="Initial capital" icon={<StCapitalIcon />} disabled={p.busy}>
            <span style={{ marginLeft: 4 }}>{fmtCapital(p.report.initialCapital)}</span><Currency /><Caret open={menu === "capital"} />
          </ToolbarPill>
          <ToolbarPill label="Default detalization" btnRef={detailRef} open={menu === "detail"} onClick={() => toggle("detail")} tip="Bar detalization" icon={<StDetalizationIcon />}>
            <span style={{ marginLeft: 4 }}>Default detalization</span><Caret open={menu === "detail"} />
          </ToolbarPill>
          <ToolbarPill label="Script execution" btnRef={execRef} open={menu === "exec"} onClick={() => toggle("exec")} tip="Script execution" icon={<StScriptExecIcon />}>
            <span style={{ marginLeft: 4, marginRight: 4 }}>Script execution</span>
            <span style={{ minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "var(--st-counter-bg)", color: "var(--st-counter-text)", fontSize: 12, lineHeight: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{execCount}</span>
            <Caret open={menu === "exec"} />
          </ToolbarPill>
          <div style={{ width: 1, height: 28, background: "var(--st-fill-strong)", flexShrink: 0 }} />
          <ToolbarPill label="Settings" onClick={p.onOpenSettings} tip="Settings" icon={<StGear28Icon />} />
          <ToolbarPill label="Add alert" onClick={p.onAddAlert} tip="Add alert" icon={<StAddAlertIcon />} />
        </div>
      </div>

      {menu === "range" && (
        <Popover anchor={rangeRef.current} onClose={close} label="Testing period">
          <PopHead title="Testing period" reset={{ enabled: p.range.kind !== "all", onClick: () => pick({ kind: "all" }) }} />
          <PopDivider />
          <button type="button" className={`st-pop-item${p.range.kind === "all" ? " selected" : ""}`} onClick={() => pick({ kind: "all" })}>
            Available chart range<span className="st-pop-right">Default</span>
          </button>
          {RANGE_PRESETS.map((r) => (
            <button key={r.label} type="button" className={`st-pop-item${sameRange(p.range, r.range) ? " selected" : ""}`} onClick={() => pick(r.range)}>{r.label}</button>
          ))}
          <button type="button" className={`st-pop-item${p.range.kind === "history" ? " selected" : ""}`} onClick={() => pick({ kind: "history" })}>Entire history</button>
          <PopDivider />
          <button type="button" className={`st-pop-item${p.range.kind === "custom" ? " selected" : ""}`} style={{ paddingLeft: 0 }} onClick={() => { close(); setCustomOpen(true); }}>
            <StCalendarIcon />Custom date range
          </button>
        </Popover>
      )}
      {customOpen && (
        <CustomRangeDialog from={p.range.kind === "custom" && p.range.from ? p.range.from : winFrom} to={p.range.kind === "custom" && p.range.to ? p.range.to : winTo}
          min={p.fullRangeStart} max={p.fullRangeEnd} onClose={() => setCustomOpen(false)} onApply={(from, to) => p.onChangeRange({ kind: "custom", from, to })} />
      )}
      {menu === "capital" && (
        <Popover anchor={capRef.current} onClose={() => { applyCapital(); close(); }} label="Initial capital">
          <PopHead title="Initial capital" />
          <PopDivider />
          <div style={{ display: "flex", gap: 8, padding: "2px 8px 4px" }}>
            <input className="st-input" autoFocus aria-label="Initial capital" inputMode="decimal" value={capDraft} style={{ flex: 1, minWidth: 0 }}
              onChange={(e) => setCapDraft(e.target.value.replace(/[^0-9.,]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") { applyCapital(); close(); } }} />
            <Tip text="Account currency: this chart's prices are in USD">
              <select className="st-input" aria-label="Currency" value={CURRENCY} onChange={() => {}} style={{ width: 126, appearance: "auto" }}>
                <option value="USD">USD</option>
              </select>
            </Tip>
          </div>
        </Popover>
      )}
      {menu === "detail" && (
        <Popover anchor={detailRef.current} onClose={close} label="Bar detalization">
          <PopHead title="Bar detalization" help="How finely each bar is replayed to fill the strategy's orders. Default detalization uses the bar's open, high, low and close (4 ticks per bar)." />
          <PopDivider />
          <button type="button" className="st-pop-item selected" onClick={close}>Default detalization<span className="st-pop-right">4 ticks per bar</span></button>
          <Tip text="Needs intrabar (lower timeframe) data, which this chart's data source doesn't provide" block>
            <button type="button" className="st-pop-item" disabled>High detalization<span className="st-pop-right">~40 ticks per bar</span></button>
          </Tip>
        </Popover>
      )}
      {menu === "exec" && (
        <Popover anchor={execRef.current} onClose={close} label="Script execution">
          <PopHead title="Script execution" help="When the strategy calculates. It always calculates on each bar's close; the options below add more calculations." reset={{ enabled: dock.onRealtimeTick, onClick: () => strategyDock.set({ onRealtimeTick: false }) }} />
          <PopDivider />
          {[
            { label: "On bar close", checked: true, disabled: true, info: "Default strategy calculation. Selecting an additional subset limits strategy execution to specific bar updates." },
            { label: "On order fill", checked: false, disabled: true, info: "Runs an additional recalculation immediately after the order fills. Needs intrabar data, which this chart's data source doesn't provide." },
            { label: "On history bar tick", checked: false, disabled: true, info: "Executes on every update in the history. Needs tick history, which this chart's data source doesn't provide." },
            { label: "On realtime bar tick", checked: dock.onRealtimeTick, disabled: false, info: "Executes on each real-time update of the last bar" },
          ].map((o) => (
            <button key={o.label} type="button" role="menuitemcheckbox" aria-checked={o.checked} className="st-pop-item" disabled={o.disabled} style={{ gap: 12, paddingLeft: 10 }}
              onClick={() => { if (o.label === "On realtime bar tick") strategyDock.set({ onRealtimeTick: !dock.onRealtimeTick }); }}>
              <Checkbox checked={o.checked} />
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{o.label}<HelpTip text={o.info} info /></span>
            </button>
          ))}
        </Popover>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- performance section

const LEGEND_ITEMS: { key: keyof PerfVisibility; label: string }[] = [
  { key: "cum", label: "Cumulative PnL" },
  { key: "bh", label: "Buy and hold" },
  { key: "exc", label: "Trades excursions" },
  { key: "runs", label: "Run-ups and drawdowns" },
];
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden><path fill="currentColor" d="M9 4C6.31 4 3.58 5.63 2.08 9c1.5 3.37 4.23 5 6.92 5s5.42-1.63 6.92-5C14.42 5.63 11.69 4 9 4Zm0-1c3.18 0 6.31 1.98 7.92 5.81L17 9l-.08.2C15.31 13.01 12.18 15 9 15s-6.31-1.99-7.92-5.8L1 9l.08-.19C2.69 4.98 5.82 3 9 3Zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-3 2a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z" /></svg>
);

function PerformanceSection({ p, bodyHeight }: { p: StrategyReportPanelProps; bodyHeight: number }) {
  const [vis, setVis] = useState<PerfVisibility>({ cum: true, bh: false, exc: true, runs: true });
  const [legendOpen, setLegendOpen] = useState(true);
  const [percent, setPercent] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [scaleMenu, setScaleMenu] = useState<{ right: number; top: number } | null>(null);
  const [hoverLine, setHoverLine] = useState<string | null>(null);
  const handle = useRef<PerfChartHandle | null>(null);
  const scaleBtn = useRef<HTMLButtonElement>(null);
  const height = expanded ? Math.max(320, bodyHeight - 110) : 320;
  const snapshot = () => {
    const c = handle.current?.screenshot();
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${p.scriptName || "strategy"} performance.png`.replace(/[\\/:*?"<>|]/g, "_");
    a.click();
  };
  const noTrades = p.report.trades.length === 0;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 20px", margin: "10px 0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 600, lineHeight: "24px", padding: "4px 0" }}>Performance</span>
          <HelpTip text="Cumulative profit and loss of the closed trades over the testing period, with each trade's favorable and adverse excursion, the buy-and-hold result and the run-up and drawdown periods" />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <Tip text="Scale"><button ref={scaleBtn} type="button" aria-label="Scale" className={`st-lightbtn${scaleMenu ? " active" : ""}`} onClick={() => {
            const r = scaleBtn.current?.getBoundingClientRect();
            setScaleMenu((m) => (m || !r ? null : { right: r.right, top: r.bottom + 4 }));
          }}><StGear18Icon /></button></Tip>
          <Tip text="Take a snapshot"><button type="button" aria-label="Take a snapshot" className="st-lightbtn" onClick={snapshot} disabled={noTrades}><StCameraIcon /></button></Tip>
          <Tip text={expanded ? "Collapse chart" : "Expand chart"}><button type="button" aria-label={expanded ? "Collapse chart" : "Expand chart"} className={`st-lightbtn${expanded ? " active" : ""}`} onClick={() => setExpanded((v) => !v)}><StExpandIcon /></button></Tip>
        </div>
      </div>
      {scaleMenu && (
        <TvMenu isDark={p.theme === "dark"} position={{ x: scaleMenu.right - 200, y: scaleMenu.top }} onClose={() => setScaleMenu(null)} ariaLabel="Scale"
          items={[
            { label: `Values in ${CURRENCY}`, checked: !percent, onClick: () => setPercent(false) },
            { label: "Values in % of initial capital", checked: percent, onClick: () => setPercent(true) },
          ]} />
      )}
      <div style={{ position: "relative", padding: "0 20px" }}>
        {noTrades ? <NoData height={height} text="This strategy did not generate any orders throughout the testing range" /> : (
          <>
            <div style={{ position: "absolute", left: 14, top: 0, zIndex: 5, display: "flex", flexDirection: "column", alignItems: "flex-start", padding: 1 }}>
              {legendOpen && LEGEND_ITEMS.map((it) => {
                const on = vis[it.key];
                return (
                  <div key={it.key} onMouseEnter={() => setHoverLine(it.key)} onMouseLeave={() => setHoverLine(null)}
                    style={{ display: "flex", alignItems: "center", height: 24, padding: "0 0 0 5px", fontSize: 13, lineHeight: "18px", background: "color-mix(in srgb, var(--st-bg) 50%, transparent)", borderRadius: 4 }}>
                    <span style={{ whiteSpace: "nowrap", marginRight: 4, color: on ? "var(--st-text)" : "var(--st-text-secondary)", opacity: on ? 1 : 0.5 }}>{it.label}</span>
                    {(!on || hoverLine === it.key) && (
                      <Tip text={on ? "Hide" : "Show"}>
                        <button type="button" aria-label={on ? `Hide ${it.label}` : `Show ${it.label}`} className="st-iconbtn" style={{ width: 28, height: 22, borderRadius: 8, color: "var(--st-text)" }}
                          onClick={() => setVis((v) => ({ ...v, [it.key]: !v[it.key] }))}>{on ? <EyeIcon /> : <StEyeOffIcon />}</button>
                      </Tip>
                    )}
                  </div>
                );
              })}
              <div style={{ padding: "4px 0 0" }}>
                <Tip text={legendOpen ? "Hide metrics legend" : "Show metrics legend"}>
                  <button type="button" aria-label={legendOpen ? "Hide metrics legend" : "Show metrics legend"} onClick={() => setLegendOpen((v) => !v)}
                    style={{ marginLeft: 5, width: 29, height: 21, display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 3px", border: "1px solid var(--st-fill-strong)", borderRadius: 4, background: "color-mix(in srgb, var(--st-bg) 50%, transparent)", color: "var(--st-text)" }}>
                    <span style={{ display: "flex", transform: legendOpen ? "rotate(180deg)" : undefined }}><StTogglerChevronIcon /></span>
                  </button>
                </Tip>
              </div>
            </div>
            <PerformanceChart report={p.report} visible={vis} percent={percent} height={height} tz={p.tz} theme={p.theme || "light"} handleRef={handle}
              onClickTrade={(t) => p.onShowTime(t.entryTime, t.exitTime)} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- performance analysis

type AnalysisTab = "breakdown" | "periodical" | "benchmarking" | "margin" | "growth";
type TradesTab = "distribution" | "streaks" | "time";
const PERIOD_OPTIONS: { value: PeriodKind; label: string }[] = [
  { value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "quarter", label: "Quarterly" }, { value: "year", label: "Yearly" },
];
const PERIOD_TITLE: Record<PeriodKind, string> = { day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" };

function PnlRows({ rows }: { rows: PnlRow[] }) {
  const all = rows[0];
  const maxLoss = Math.max(...rows.map((r) => r.grossLoss + r.commission), 0);
  const maxProfit = Math.max(...rows.map((r) => r.grossProfit), 0);
  const total = maxLoss + maxProfit || 1;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr) auto", alignItems: "center" }}>
      {rows.map((r, i) => {
        const lossW = maxLoss > 0 ? ((r.grossLoss + r.commission) / maxLoss) * 100 : 0;
        const profitW = maxProfit > 0 ? (r.grossProfit / maxProfit) * 100 : 0;
        const netW = r.net >= 0 ? (maxProfit > 0 ? (r.net / maxProfit) * 100 : 0) : (maxLoss > 0 ? (-r.net / maxLoss) * 100 : 0);
        const summary = i === 0;
        const cellBase: React.CSSProperties = { height: 36, display: "flex", alignItems: "center", fontSize: summary ? 14 : 13, lineHeight: "18px" };
        return (
          <Fragment key={r.key}>
            <div className="st-pnl-row" style={{ display: "contents" }}>
              <div className="st-pnl-cell" style={{ ...cellBase, padding: "9px 12px", marginLeft: -12, borderRadius: "6px 0 0 6px", fontWeight: summary ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden" }}>
                {r.side === "long" && <span style={{ display: "flex", marginRight: 8 }}><StArrowUpRightIcon /></span>}
                {r.side === "short" && <span style={{ display: "flex", marginRight: 8 }}><StArrowDownRightIcon /></span>}
                <Tip text={`${r.label}: ${r.count} trade${r.count === 1 ? "" : "s"}, gross profit ${fmtNum(r.grossProfit)} ${CURRENCY}, gross loss ${fmtNum(r.grossLoss)} ${CURRENCY}`}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                </Tip>
              </div>
              <div className="st-pnl-cell" style={{ ...cellBase, padding: "14px 0", gap: 2 }}>
                <div style={{ flex: `${maxLoss} 1 0`, height: 8, display: "flex", justifyContent: "flex-end", position: "relative", overflow: "hidden" }}>
                  <div style={{ width: `${lossW}%`, height: 8, display: "flex", justifyContent: "flex-end", borderRadius: "4px 0 0 4px", overflow: "hidden" }}>
                    {r.commission > 0 && <div style={{ width: `${(r.commission / (r.grossLoss + r.commission)) * 100}%`, background: "var(--st-pnl-commission)" }} />}
                    <div style={{ flex: 1, background: "var(--st-pnl-loss-sum)" }} />
                  </div>
                  {r.net < 0 && <div style={{ position: "absolute", right: 0, top: 0, height: 8, width: `${netW}%`, background: "var(--st-pnl-net-loss)" }} />}
                </div>
                <div style={{ flex: `${maxProfit} 1 0`, height: 8, display: "flex", justifyContent: "flex-start", position: "relative", overflow: "hidden" }}>
                  <div style={{ width: `${profitW}%`, height: 8, borderRadius: "0 4px 4px 0", background: "var(--st-pnl-profit-sum)" }} />
                  {r.net > 0 && <div style={{ position: "absolute", left: 0, top: 0, height: 8, width: `${netW}%`, background: "var(--st-pnl-net-profit)" }} />}
                </div>
              </div>
              <div className="st-pnl-cell" style={{ ...cellBase, justifyContent: "flex-end", padding: "9px 12px", marginRight: -12, borderRadius: "0 6px 6px 0", color: tone(r.net), fontWeight: summary ? 600 : 400, whiteSpace: "nowrap" }}>
                <span>{fmtSigned(r.net)}</span><span style={{ fontSize: 10, fontWeight: 500, lineHeight: "14px", marginLeft: 2, alignSelf: "flex-end", marginBottom: 2 }}>{CURRENCY}</span>
              </div>
            </div>
            {summary && (
              <>
                <div style={{ padding: "4px 0 4px 12px" }}><div style={{ borderTop: "1px solid var(--st-fill-strong)" }} /></div>
                <div style={{ padding: "4px 0" }}><div style={{ borderTop: "1px solid var(--st-fill-strong)" }} /></div>
                <div style={{ padding: "4px 12px 4px 0" }}><div style={{ borderTop: "1px solid var(--st-fill-strong)" }} /></div>
              </>
            )}
          </Fragment>
        );
      })}
      {all.count === 0 && <div style={{ gridColumn: "1 / -1", color: "var(--st-text-secondary)", padding: "8px 0" }}>No closed trades</div>}
    </div>
  );
}

function HBars({ groups }: { groups: { title: string; rows: { label: string; value: number; color: string }[] }[] }) {
  const max = Math.max(...groups.flatMap((g) => g.rows.map((r) => r.value)), 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {groups.map((g) => (
        <div key={g.title}>
          <div style={{ fontSize: 13, lineHeight: "18px", marginBottom: 6 }}>{g.title}</div>
          {g.rows.map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", height: 30, gap: 12 }}>
              <span style={{ width: 55, flexShrink: 0, fontSize: 13, color: "var(--st-text-secondary)" }}>{r.label}</span>
              <div style={{ flex: 1, height: 16 }}><div style={{ width: `${(r.value / max) * 100}%`, height: 16, background: r.color }} /></div>
              <span style={{ width: 44, textAlign: "right", fontSize: 12, flexShrink: 0 }}>{fmtPct(r.value)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AnalysisSection({ p }: { p: StrategyReportPanelProps }) {
  const r = p.report;
  const [tab, setTab] = useState<AnalysisTab>("breakdown");
  const [by, setBy] = useState<"signals" | "side">("signals");
  const [period, setPeriod] = useState<PeriodKind>("day");
  const [benchPeriod, setBenchPeriod] = useState<PeriodKind>("week");
  const cap = r.initialCapital || 1;
  const commission = totalCommission(r);

  let cells: React.ReactElement[] = [];
  let info: React.ReactNode = null;
  if (tab === "breakdown") {
    cells = [
      <Cell key="gp" title="Gross profit"><Money v={r.grossProfit} pct={r.grossProfitPct} /></Cell>,
      <Cell key="gl" title="Gross loss"><Money v={r.grossLoss} pct={r.grossLossPct} /></Cell>,
      <Cell key="pf" title="Profit factor"><Big>{isFinite(r.profitFactor) ? fmtNum(r.profitFactor, 3) : "—"}</Big></Cell>,
      <Cell key="cl" title="Commission load"><Money v={commission} pct={r.grossProfit > 0 ? (commission / r.grossProfit) * 100 : 0} /></Cell>,
    ];
    info = (
      <div>
        <InfoTitle title="Profits and losses">
          <Segmented value={by} onChange={setBy} options={[{ value: "signals", label: "By signals" }, { value: "side", label: "By side" }]} />
        </InfoTitle>
        <PnlRows rows={by === "signals" ? pnlBySignals(r) : pnlBySide(r)} />
      </div>
    );
  } else if (tab === "periodical") {
    const ss = sharpeSortino(r, p.tz);
    const buckets = periodBuckets(r, period, p.tz);
    cells = [
      <Cell key="cagr" title="Annualized return (CAGR)"><Big color={tone(cagr(r))}>{fmtPct(cagr(r))}</Big></Cell>,
      <Cell key="tr" title="Total return"><Big color={tone(r.netProfitPct)}>{fmtSignedPct(r.netProfitPct)}</Big></Cell>,
      <Cell key="sh" title="Sharpe ratio"><Big>{ss.sharpe === null ? "—" : fmtNum(ss.sharpe, 3)}</Big></Cell>,
      <Cell key="so" title="Sortino ratio"><Big>{ss.sortino === null ? "—" : fmtNum(ss.sortino, 3)}</Big></Cell>,
    ];
    info = (
      <div>
        <InfoTitle title={`${PERIOD_TITLE[period]} PnL`}><Segmented value={period} onChange={setPeriod} options={PERIOD_OPTIONS} /></InfoTitle>
        <CategoryBarChart height={250} labels={buckets.map((b) => b.label)} yFormat={fmtAxis}
          groups={[[
            { values: buckets.map((b) => b.fe || null), color: "var(--st-bar-green-faint)" },
            { values: buckets.map((b) => b.ae || null), color: "var(--st-bar-red-faint)" },
            { values: buckets.map((b) => b.net || null), color: (v) => (v >= 0 ? "var(--st-bar-green)" : "var(--st-bar-red)") },
          ]]}
          tooltip={(i) => { const b = buckets[i]; return <><div>{b.label}</div><div>Realized PnL: {fmtSigned(b.net)} {CURRENCY}</div><div>{b.count} trade{b.count === 1 ? "" : "s"}</div></>; }} />
        <div style={{ marginTop: 8 }}>
          <ChartLegend items={[{ color: "var(--st-bar-green)", label: "Realized profit" }, { color: "var(--st-bar-red)", label: "Realized loss" }, { color: "var(--st-bar-green-faint)", label: "Favorable excursion" }, { color: "var(--st-bar-red-faint)", label: "Adverse excursion" }]} />
        </div>
      </div>
    );
  } else if (tab === "benchmarking") {
    const bh = buyAndHoldPct(r);
    const corr = equityPriceCorrelation(r);
    const buckets = periodBuckets(r, benchPeriod, p.tz);
    const bhPnl = buckets.map((b) => (b.startClose && b.endClose ? cap * (b.endClose / b.startClose - 1) : null));
    const stPnl = buckets.map((b) => (b.startEquity !== null && b.endEquity !== null ? b.endEquity - b.startEquity : null));
    cells = [
      <Cell key="sr" title="Strategy return"><Big color={tone(r.netProfitPct)}>{fmtSignedPct(r.netProfitPct)}</Big></Cell>,
      <Cell key="bh" title="Buy and hold return"><Big color={tone(bh)}>{fmtSignedPct(bh)}</Big></Cell>,
      <Cell key="so" title="Strategy outperformance"><Big color={tone(r.netProfitPct - bh)}>{fmtSignedPct(r.netProfitPct - bh)}</Big></Cell>,
      <Cell key="co" title="Correlation"><Big>{corr === null ? "—" : fmtNum(corr, 3)}</Big></Cell>,
    ];
    info = (
      <div>
        <InfoTitle title="Strategy vs benchmark"><Segmented value={benchPeriod} onChange={setBenchPeriod} options={PERIOD_OPTIONS} /></InfoTitle>
        <CategoryBarChart height={250} labels={buckets.map((b) => b.label)} yFormat={fmtAxis}
          groups={[[{ values: stPnl, color: "var(--st-bench-blue)" }], [{ values: bhPnl, color: "var(--st-bench-gray)" }]]}
          tooltip={(i) => <><div>{buckets[i].label}</div><div>Strategy PnL: {stPnl[i] === null ? "—" : `${fmtSigned(stPnl[i]!)} ${CURRENCY}`}</div><div>Buy and hold PnL: {bhPnl[i] === null ? "—" : `${fmtSigned(bhPnl[i]!)} ${CURRENCY}`}</div></>} />
        <div style={{ marginTop: 8 }}><ChartLegend items={[{ color: "var(--st-bench-blue)", label: "Strategy PnL" }, { color: "var(--st-bench-gray)", label: "Buy and hold PnL" }]} /></div>
      </div>
    );
  } else if (tab === "margin") {
    // This backtest doesn't trade on margin (no margin requirements are simulated), so no margin
    // is ever used or called
    cells = [
      <Cell key="me" title="Margin efficiency"><Big>0</Big><Currency /></Cell>,
      <Cell key="am" title="Average margin used"><Big>0</Big><Currency /></Cell>,
      <Cell key="mc" title="Margin calls"><Big>0</Big></Cell>,
      <Cell key="lv" title="Total liquidated volume"><Big>0</Big><Currency /></Cell>,
    ];
    info = <div><InfoTitle title="Margin utilization" /><NoData height={280} /></div>;
  } else {
    const eps = growthEpisodes(r);
    const ru = eps.filter((e) => e.kind === "runup"), dd = eps.filter((e) => e.kind === "drawdown");
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const days = (e: { start: number; end: number }[]) => Math.round(avg(e.map((x) => (x.end - x.start) / 86400)));
    const cur = eps.length && eps[eps.length - 1].kind === "drawdown" && eps[eps.length - 1].current ? eps[eps.length - 1] : null;
    cells = [
      <Cell key="rd" title="Average run-up duration"><Big>{ru.length ? `${days(ru)} day${days(ru) === 1 ? "" : "s"}` : "—"}</Big></Cell>,
      <Cell key="dd" title="Average drawdown duration"><Big>{dd.length ? `${days(dd)} day${days(dd) === 1 ? "" : "s"}` : "—"}</Big></Cell>,
      <Cell key="md" title="Max drawdown"><Money v={r.maxDrawdown} pct={r.maxDrawdownPct} /></Cell>,
      <Cell key="mdc" title="Max drawdown as % of initial capital"><Big>{fmtPct((r.maxDrawdown / cap) * 100)}</Big></Cell>,
    ];
    info = (
      <div style={{ display: "flex", gap: 64 }}>
        <div style={{ flex: 1, minWidth: 0, maxWidth: "calc(50% - 32px)" }}>
          <InfoTitle title="Alternating growth and decline" small />
          {eps.length ? (
            <>
              <CategoryBarChart height={260} labels={eps.map(() => "")} yFormat={(v) => fmtPct(v)}
                groups={[[{ values: eps.map((e) => e.pct), color: (_v, i) => (eps[i].kind === "runup" ? "var(--st-bar-green)" : eps[i].current ? "var(--st-bar-red-soft)" : "var(--st-bar-red)") }]]}
                tooltip={(i) => { const e = eps[i]; return <><div>{e.kind === "runup" ? "Run-up" : e.current ? "Current drawdown" : "Drawdown"}</div><div>{fmtPct(e.pct)} ({fmtNum(e.amount)} {CURRENCY})</div><div>{fmtDate(e.start, p.tz)} {"—"} {fmtDate(e.end, p.tz)}</div></>; }} />
              <ChartLegend items={[{ color: "var(--st-bar-green)", label: "Run-up" }, { color: "var(--st-bar-red)", label: "Drawdown" }, { color: "var(--st-bar-red-soft)", label: "Current drawdown" }]} />
            </>
          ) : <NoData height={260} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, maxWidth: "calc(50% - 32px)" }}>
          <InfoTitle title="Comparison of growth and decline periods" small />
          {eps.length ? (
            <HBars groups={[
              { title: "Run-up", rows: [{ label: "Maximum", value: Math.max(0, ...ru.map((e) => e.pct)), color: "var(--st-bar-green)" }, { label: "Average", value: avg(ru.map((e) => e.pct)), color: "var(--st-bar-green)" }] },
              { title: "Drawdown", rows: [{ label: "Maximum", value: Math.max(0, ...dd.map((e) => e.pct)), color: "var(--st-bar-red)" }, { label: "Average", value: avg(dd.map((e) => e.pct)), color: "var(--st-bar-red)" }, { label: "Current", value: cur ? cur.pct : 0, color: "var(--st-bar-red-soft)" }] },
            ]} />
          ) : <NoData height={260} />}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 20, fontWeight: 600, lineHeight: "24px", margin: "16px 0" }}>Performance analysis</p>
      <div style={{ paddingBottom: 12 }}>
        <RoundTabs value={tab} onChange={setTab} options={[
          { value: "breakdown", label: "Breakdown" }, { value: "periodical", label: "Periodical" }, { value: "benchmarking", label: "Benchmarking" },
          { value: "margin", label: "Margin usage" }, { value: "growth", label: "Growth and decline" },
        ]} />
      </div>
      <Cells gap={16}>{cells}</Cells>
      <div style={{ marginTop: 16 }}>{info}</div>
    </div>
  );
}

function TradesAnalysisSection({ p }: { p: StrategyReportPanelProps }) {
  const r = p.report;
  const [tab, setTab] = useState<TradesTab>("distribution");
  const [streakMode, setStreakMode] = useState<"count" | "amount">("count");
  const [timeGroup, setTimeGroup] = useState<TimeGroup>("hours");
  const cap = r.initialCapital || 1;

  let cells: React.ReactElement[] = [];
  let info: React.ReactNode = null;
  if (tab === "distribution") {
    const exp = expectancy(r), out = outliersPnl(r), { win, loss } = largest(r), av = averages(r);
    const hist = returnsHistogram(r);
    const step = hist.edges.length > 1 ? hist.edges[1] - hist.edges[0] : 1;
    const at = (v: number) => (hist.edges.length ? (v - hist.edges[0]) / step : 0);
    const decimals = step < 0.1 ? 2 : 1;
    const winners = r.winCount, losers = r.lossCount, evens = r.breakevenCount, total = r.trades.length;
    cells = [
      <Cell key="ex" title="Expectancy"><Money v={exp} pct={(exp / cap) * 100} /></Cell>,
      <Cell key="ou" title="Outliers PnL"><Money v={out} pct={(out / cap) * 100} /></Cell>,
      <Cell key="lp" title="Largest profit"><Money v={win ? win.netPnl : 0} pct={win ? win.returnPct : 0} /></Cell>,
      <Cell key="ll" title="Largest loss"><Money v={loss ? loss.netPnl : 0} pct={loss ? loss.returnPct : 0} /></Cell>,
    ];
    info = (
      <div style={{ display: "flex", gap: 64 }}>
        <div style={{ flex: 1, minWidth: 0, maxWidth: "calc(50% - 32px)" }}>
          <InfoTitle title="Returns distribution" small />
          {total ? (
            <>
              <CategoryBarChart height={168} labels={hist.bins.map((b) => `${fmtNum(b.from, decimals)}%`)} integerTicks yFormat={(v) => String(Math.round(v))}
                edgeLabels={hist.edges.map((e) => `${fmtNum(e, decimals)}%`)}
                groups={[[{ values: hist.bins.map((b) => b.count || null), color: (_v, i) => (hist.bins[i].profit ? "var(--st-bar-green)" : "var(--st-bar-red)") }]]}
                vlines={[...(av.avgLossPct < 0 ? [{ at: at(av.avgLossPct), color: "var(--st-neg)" }] : []), ...(av.avgWinPct > 0 ? [{ at: at(av.avgWinPct), color: "var(--st-pos)" }] : [])]}
                tooltip={(i) => { const b = hist.bins[i]; return <><div>{fmtNum(b.from, decimals)}% {"—"} {fmtNum(b.to, decimals)}%</div><div>{b.count} trade{b.count === 1 ? "" : "s"}</div></>; }} />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6, paddingRight: 44, marginTop: 8, flexWrap: "wrap" }}>
                <ChartLegend justify="flex-start" items={[{ color: "var(--st-bar-red)", label: "Losers" }, { color: "var(--st-bar-green)", label: "Winners" }]} />
                <ChartLegend justify="flex-start" items={[{ color: "var(--st-neg)", label: "Average loss", dashed: true, value: fmtSignedPct(av.avgLossPct) }, { color: "var(--st-pos)", label: "Average profit", dashed: true, value: fmtPct(av.avgWinPct) }]} />
              </div>
            </>
          ) : <NoData height={194} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, maxWidth: "calc(50% - 32px)" }}>
          <InfoTitle title="Trades distribution" small />
          <div style={{ display: "flex", alignItems: "center", columnGap: 20, minHeight: 200 }}>
            <div style={{ display: "flex", justifyContent: "center", minWidth: 200, maxWidth: 240, flex: 1 }}>
              <Donut parts={[{ value: winners, color: "var(--st-donut-win)" }, { value: losers, color: "var(--st-donut-loss)" }, { value: evens, color: "var(--st-donut-even)" }]}
                center={<><div style={{ fontSize: 18, fontWeight: 600, lineHeight: "24px" }}>{total}</div><div style={{ fontSize: 12, fontWeight: 600, lineHeight: "16px" }}>Total trades</div></>} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "16px auto auto auto", alignItems: "center", fontSize: 13, lineHeight: "18px", maxWidth: 280, flex: 1, columnGap: 0 }}>
              {[["Winners", winners, "var(--st-donut-win)"], ["Losers", losers, "var(--st-donut-loss)"], ["Breakevens", evens, "var(--st-donut-even)"]].map(([l, n, c]) => (
                <Fragment key={l as string}>
                  <div style={{ padding: "3px 0" }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: c as string }} /></div>
                  <div style={{ padding: "3px 0", whiteSpace: "nowrap" }}>{l as string}</div>
                  <div style={{ padding: "3px 0 3px 16px", textAlign: "right", whiteSpace: "nowrap" }}>{n as number} trade{n === 1 ? "" : "s"}</div>
                  <div style={{ padding: "3px 0 3px 16px", textAlign: "right" }}>{fmtPct(total ? ((n as number) / total) * 100 : 0)}</div>
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  } else if (tab === "streaks") {
    const s = streaks(r);
    const fmtTr = (n: number, d = 0) => `${d ? fmtNum(n, d) : n} trade${n === 1 ? "" : "s"}`;
    const values = s.perTrade.map((x) => (streakMode === "count" ? x.count : x.amount) || null);
    cells = [
      <Cell key="lw" title="Longest winning streak"><Big>{fmtTr(s.longestWin)}</Big></Cell>,
      <Cell key="ll" title="Longest losing streak"><Big>{fmtTr(s.longestLoss)}</Big></Cell>,
      <Cell key="aw" title="Average winning streak"><Big>{fmtTr(s.avgWin, 2)}</Big></Cell>,
      <Cell key="al" title="Average losing streak"><Big>{fmtTr(s.avgLoss, 2)}</Big></Cell>,
    ];
    info = (
      <div>
        <InfoTitle title="Winning and losing streaks"><Segmented value={streakMode} onChange={setStreakMode} options={[{ value: "count", label: "Count" }, { value: "amount", label: "Amount" }]} /></InfoTitle>
        {r.trades.length ? (
          <>
            <CategoryBarChart height={250} labels={r.trades.map((t) => String(t.num))} integerTicks={streakMode === "count"}
              yFormat={(v) => (streakMode === "count" ? String(Math.abs(Math.round(v))) : fmtAxis(v))}
              groups={[[{ values, color: (v) => (v >= 0 ? "var(--st-bar-green)" : "var(--st-bar-red)") }]]}
              tooltip={(i) => { const t = r.trades[i], x = s.perTrade[i]; return <><div>Trade {t.num} {t.type.toLowerCase()}</div><div>{x.count > 0 ? `Win #${x.count}` : x.count < 0 ? `Loss #${-x.count}` : "Breakeven"} in the streak</div><div>Streak PnL: {fmtSigned(x.amount)} {CURRENCY}</div></>; }} />
            <div style={{ marginTop: 8 }}><ChartLegend items={[{ color: "var(--st-bar-green)", label: "Winners" }, { color: "var(--st-bar-red)", label: "Losers" }]} /></div>
          </>
        ) : <NoData height={274} />}
      </div>
    );
  } else {
    const best = bestEntryTimes(r, p.tz);
    const rows = resultsByTime(r, timeGroup, p.tz);
    cells = [
      <Cell key="bh" title="Best hour for entries"><Big>{best.hour ?? "—"}</Big></Cell>,
      <Cell key="bd" title="Best day for entries"><Big>{best.day ?? "—"}</Big></Cell>,
      <Cell key="bm" title="Best month for entries"><Big>{best.month ?? "—"}</Big></Cell>,
      <Cell key="ad" title="Average trade duration"><Big>{r.trades.length ? fmtDuration(avgTradeDuration(r)) : "—"}</Big></Cell>,
    ];
    info = (
      <div>
        <InfoTitle title="Results by time"><Segmented value={timeGroup} onChange={setTimeGroup} options={[{ value: "hours", label: "Hours" }, { value: "days", label: "Days" }, { value: "months", label: "Months" }]} /></InfoTitle>
        <CategoryBarChart height={250} labels={rows.map((x) => x.label)} integerTicks yFormat={(v) => String(Math.round(v))}
          groups={[[
            { values: rows.map((x) => x.winners + x.losers || null), color: "var(--st-bar-red)" },
            { values: rows.map((x) => x.winners || null), color: "var(--st-bar-green)" },
          ]]}
          tooltip={(i) => { const x = rows[i]; return <><div>{x.label}</div><div>Winners: {x.winners}</div><div>Losers: {x.losers}</div><div>Net PnL: {fmtSigned(x.net)} {CURRENCY}</div></>; }} />
        <div style={{ marginTop: 8 }}><ChartLegend items={[{ color: "var(--st-bar-green)", label: "Winners" }, { color: "var(--st-bar-red)", label: "Losers" }]} /></div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 20, fontWeight: 600, lineHeight: "24px", margin: "16px 0" }}>Trades analysis</p>
      <div style={{ paddingBottom: 12 }}>
        <RoundTabs value={tab} onChange={setTab} options={[{ value: "distribution", label: "Distribution" }, { value: "streaks", label: "Streaks" }, { value: "time", label: "Time patterns" }]} />
      </div>
      <Cells gap={16}>{cells}</Cells>
      <div style={{ marginTop: 16 }}>{info}</div>
    </div>
  );
}

function MetricsView({ p, bodyHeight }: { p: StrategyReportPanelProps; bodyHeight: number }) {
  const r = p.report;
  return (
    <div>
      <p style={{ fontSize: 20, fontWeight: 600, lineHeight: "24px", padding: "0 20px", margin: "16px 0 12px" }}>Key stats</p>
      <div style={{ padding: "0 20px" }}>
        <Cells>
          {[
            <Cell key="pnl" title="Total PnL"><Money v={r.netProfit} signed colored pct={r.netProfitPct} pctSigned /></Cell>,
            <Cell key="dd" title="Max drawdown"><Money v={r.maxDrawdown} pct={r.maxDrawdownPct} /></Cell>,
            <Cell key="pt" title="Profitable trades"><Big>{fmtPct(r.profitablePct)}</Big><span style={{ fontSize: 16, fontWeight: 500, marginLeft: 8 }}>{r.profitableCount}/{r.totalCount}</span></Cell>,
            <Cell key="pf" title="Profit factor"><Big>{isFinite(r.profitFactor) ? fmtNum(r.profitFactor, 3) : "—"}</Big></Cell>,
          ]}
        </Cells>
      </div>
      <PerformanceSection p={p} bodyHeight={bodyHeight} />
      <div style={{ display: "flex", flexDirection: "column", gap: 32, padding: "0 20px", margin: "40px 0" }}>
        <AnalysisSection p={p} />
        <TradesAnalysisSection p={p} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- list of trades

type SortKey = "num" | "time" | "netPnl" | "return" | "size" | "price" | "commission" | "fe" | "ae" | "cumPnl" | "duration";
const COL_SORT: Partial<Record<TradeColumn, SortKey>> = { dateTime: "time", price: "price", size: "size", netPnl: "netPnl", return: "return", commission: "commission", fe: "fe", ae: "ae", cumPnl: "cumPnl", duration: "duration" };
const sortValue = (t: PineStrategyTrade, k: SortKey) => {
  switch (k) {
    case "num": return t.num;
    case "time": return t.entryTime;
    case "netPnl": return t.netPnl;
    case "return": return t.returnPct;
    case "size": return t.qty;
    case "price": return t.entryPrice;
    case "commission": return t.commission || 0;
    case "fe": return t.favorableExcursion;
    case "ae": return t.adverseExcursion;
    case "cumPnl": return t.cumulativePnl;
    case "duration": return t.exitBar - t.entryBar;
  }
};
const END_COLS = new Set<TradeColumn>(["price", "size", "netPnl", "return", "commission", "fe", "ae", "cumPnl", "duration"]);

function CurrencyValue({ v, digits = 2, signed, color }: { v: number; digits?: number; signed?: boolean; color?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3, color }}>
      <span>{signed ? fmtSigned(v, digits) : fmtNum(v, digits)}</span>
      <span style={{ fontSize: 10, fontWeight: 500, lineHeight: "14px" }}>{CURRENCY}</span>
    </span>
  );
}

// Rows are 2 × 49px plus the row border; the list header and the table header sit above them
const ROW_H = 99, LIST_TOP = 52 + 40;

function TradesView({ p, scrollEl }: { p: StrategyReportPanelProps; scrollEl: HTMLElement | null }) {
  const r = p.report;
  const dock = strategyDock.useValue();
  const cols = TRADE_COLUMNS.filter((c) => (dock.columns?.length ? dock.columns : DEFAULT_COLUMNS).includes(c.key));
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "num", desc: true });
  const [colsMenu, setColsMenu] = useState(false);
  const colsBtn = useRef<HTMLButtonElement>(null);
  const cap = r.initialCapital || 1;
  const rows = useMemo(() => {
    const all = r.openTrade ? [...r.trades, r.openTrade] : [...r.trades];
    all.sort((a, b) => (sortValue(a, sort.key) - sortValue(b, sort.key)) * (sort.desc ? -1 : 1) || (a.num - b.num) * (sort.desc ? -1 : 1));
    return all;
  }, [r, sort]);
  const download = () => {
    const blob = new Blob([tradesCsv(r, p.tz, CURRENCY)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    a.download = `${p.scriptName || "Strategy"}_${p.symbol}_${today}.csv`.replace(/[\\/:*?"<>|\s]+/g, "_");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const toggleCol = (k: TradeColumn) => {
    const cur = dock.columns?.length ? dock.columns : DEFAULT_COLUMNS;
    strategyDock.set({ columns: cur.includes(k) ? cur.filter((c) => c !== k) : [...cur, k] });
  };
  const header = (key: SortKey | null, label: string, end?: boolean, first?: boolean) => (
    <th key={label} className={end ? "end" : undefined} style={first ? { minWidth: 110 } : undefined}
      onClick={() => { if (key) setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true })); }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexDirection: end ? "row-reverse" : "row" }}>
        <span>{label}</span>
        {key && sort.key === key && <span aria-hidden style={{ fontSize: 12 }}>{sort.desc ? "↓" : "↑"}</span>}
      </span>
    </th>
  );
  const dCell = (exit: React.ReactNode, entry: React.ReactNode, end?: boolean, lastCol?: boolean) => (
    <>
      <div className={`st-dcell first${lastCol ? " last-col" : ""}`} style={{ justifyContent: end ? "flex-end" : "flex-start" }}>{exit}</div>
      <div className="st-dcell" style={{ justifyContent: end ? "flex-end" : "flex-start" }}>{entry}</div>
    </>
  );
  const pctOf = (v: number, t: PineStrategyTrade) => { const n = t.entryPrice * t.qty; return n > 0 ? (v / n) * 100 : 0; };
  const lastDoubleCol = cols.filter((c) => c.key === "dateTime" || c.key === "signal" || c.key === "price").slice(-1)[0]?.key;
  const [win, setWin] = useState({ top: 0, h: 800 });
  useEffect(() => {
    if (!scrollEl) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setWin({ top: scrollEl.scrollTop, h: scrollEl.clientHeight })); };
    on();
    scrollEl.addEventListener("scroll", on, { passive: true });
    const ro = new ResizeObserver(on);
    ro.observe(scrollEl);
    return () => { cancelAnimationFrame(raf); scrollEl.removeEventListener("scroll", on); ro.disconnect(); };
  }, [scrollEl]);
  const first = Math.max(0, Math.floor((win.top - LIST_TOP) / ROW_H) - 4);
  const last = Math.min(rows.length, Math.ceil((win.top + win.h - LIST_TOP) / ROW_H) + 4);
  const spacer = (h: number, key: string) => (h > 0 ? <tr key={key} aria-hidden style={{ height: h, borderBottom: "none", background: "transparent" }}><td colSpan={3 + cols.length} style={{ padding: 0 }} /></tr> : null);
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "16px 20px 12px", flexShrink: 0 }}>
        <p style={{ fontSize: 20, fontWeight: 600, lineHeight: "24px", margin: 0 }}>List of trades</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <Tip text="Download .csv"><button type="button" aria-label="Download .csv" className="st-lightbtn" style={{ width: 30 }} onClick={download} disabled={!rows.length}><StDownloadIcon /></button></Tip>
          <Tip text="Column setup"><button ref={colsBtn} type="button" aria-label="Column setup" className={`st-lightbtn${colsMenu ? " active" : ""}`} onClick={() => setColsMenu((v) => !v)}><StColumnsIcon /></button></Tip>
        </div>
      </div>
      {colsMenu && (
        <Popover anchor={colsBtn.current} onClose={() => setColsMenu(false)} width={196} align="right" label="Column setup">
          {TRADE_COLUMNS.map((c) => {
            const on = cols.some((x) => x.key === c.key);
            return (
              <button key={c.key} type="button" role="menuitemcheckbox" aria-checked={on} className="st-pop-item" style={{ gap: 12, paddingLeft: 10 }} onClick={() => toggleCol(c.key)}>
                <Checkbox checked={on} />{c.label}
              </button>
            );
          })}
        </Popover>
      )}
      {rows.length === 0 ? <NoData height={240} text="No trades throughout the testing range" /> : (
        <table className="st-table">
          <thead>
            <tr>
              {header("num", "Trade number", false, true)}
              <th aria-label="Show on chart" style={{ width: 46, padding: 0 }} />
              <th>Type</th>
              {cols.map((c) => header(COL_SORT[c.key] ?? null, c.label, END_COLS.has(c.key)))}
            </tr>
          </thead>
          <tbody>
            {spacer(first * ROW_H, "top")}
            {rows.slice(first, last).map((t) => {
              const open = t.exitSignal === "Open";
              const pnlColor = tone(t.netPnl);
              return (
                <tr key={t.num}>
                  <td>
                    <span style={{ marginRight: 8 }}>{t.num}</span>
                    <span style={{ color: t.type === "Long" ? "var(--st-long)" : "var(--st-short)" }}>{t.type}</span>
                  </td>
                  <td className="double" style={{ width: 46 }}>
                    {dCell(
                      open ? null : <Tip text="Show on chart"><button type="button" aria-label="Show on chart" className="st-iconbtn st-target" onClick={() => p.onShowTime(t.exitTime)}><StTargetIcon /></button></Tip>,
                      <Tip text="Show on chart"><button type="button" aria-label="Show on chart" className="st-iconbtn st-target" onClick={() => p.onShowTime(t.entryTime)}><StTargetIcon /></button></Tip>,
                    )}
                  </td>
                  <td className="double">{dCell("Exit", "Entry")}</td>
                  {cols.map((c) => {
                    switch (c.key) {
                      case "dateTime": return <td key={c.key} className="double">{dCell(open ? "—" : fmtDateTime(t.exitTime, p.tz), fmtDateTime(t.entryTime, p.tz), false, lastDoubleCol === "dateTime")}</td>;
                      case "signal": return <td key={c.key} className="double">{dCell(t.exitSignal, t.entrySignal, false, lastDoubleCol === "signal")}</td>;
                      case "price": return <td key={c.key} className="double">{dCell(<CurrencyValue v={t.exitPrice} digits={p.pricePrecision} />, <CurrencyValue v={t.entryPrice} digits={p.pricePrecision} />, true, lastDoubleCol === "price")}</td>;
                      case "size": return (
                        <td key={c.key} style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <div>{Number.isInteger(t.qty) ? t.qty : fmtNum(t.qty, 4)}</div>
                            <div><span>{fmtCompact(t.entryPrice * t.qty)}</span><span style={{ fontSize: 10, fontWeight: 500, lineHeight: "14px", marginLeft: 3 }}>{CURRENCY}</span></div>
                          </div>
                        </td>
                      );
                      case "netPnl": return <td key={c.key} style={{ textAlign: "right" }}><CurrencyValue v={t.netPnl} signed color={pnlColor} /></td>;
                      case "return": return <td key={c.key} style={{ textAlign: "right", color: pnlColor }}>{fmtSignedPct(t.returnPct)}</td>;
                      case "commission": return <td key={c.key} style={{ textAlign: "right" }}><CurrencyValue v={t.commission || 0} /></td>;
                      case "fe": return <td key={c.key} style={{ textAlign: "right" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}><CurrencyValue v={t.favorableExcursion} /><span>{fmtPct(pctOf(t.favorableExcursion, t))}</span></div></td>;
                      case "ae": return <td key={c.key} style={{ textAlign: "right" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}><CurrencyValue v={t.adverseExcursion} /><span>{fmtPct(pctOf(t.adverseExcursion, t))}</span></div></td>;
                      case "cumPnl": return <td key={c.key} style={{ textAlign: "right" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, color: tone(t.cumulativePnl) }}><CurrencyValue v={t.cumulativePnl} signed /><span>{fmtSignedPct((t.cumulativePnl / cap) * 100)}</span></div></td>;
                      case "duration": return <td key={c.key} style={{ textAlign: "right" }}>{t.exitBar - t.entryBar}</td>;
                    }
                    return null;
                  })}
                </tr>
              );
            })}
            {spacer((rows.length - last) * ROW_H, "bottom")}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- header (the strategy's tab)

const PanelUpIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M4.5 17.5l9.5-8.5 9.5 8.5" /></svg>
);
const SmallChevron = ({ up }: { up?: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden><path d={up ? "M1.5 6.5L5 3l3.5 3.5" : "M1.5 3.5L5 7l3.5-3.5"} /></svg>
);

function Header({ p, expanded, maximized }: { p: StrategyReportPanelProps; expanded: boolean; maximized: boolean }) {
  const chevron = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | { above: { right: number; top: number } } | null>(null);
  const toggleOpen = () => {
    if (maximized) { strategyDock.set({ maximized: false, expanded: false }); return; }
    strategyDock.set((d) => ({ expanded: !d.expanded }));
  };
  const toggleMax = () => strategyDock.set((d) => (d.maximized ? { maximized: false } : { maximized: true, expanded: true }));
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, height: PANEL_ROW_HEIGHT, paddingRight: 2, background: expanded ? "var(--tv-panel-strip)" : "var(--st-bg)", color: "var(--st-text)" }}>
      <div style={{
        display: "flex", alignItems: "center", alignSelf: expanded ? "stretch" : "center", minWidth: 0,
        height: expanded ? undefined : 32, margin: expanded ? 0 : "0 0 0 2px", paddingRight: 6,
        borderRadius: expanded ? "0 8px 0 0" : 6, background: expanded ? "var(--st-bg)" : "transparent",
        boxShadow: expanded ? "4px 0 8px -6px rgba(0,0,0,0.25)" : undefined,
      }}>
        <button type="button" aria-label={p.scriptName} aria-expanded={expanded} onClick={() => { if (!expanded) toggleOpen(); }}
          style={{ display: "flex", alignItems: "center", gap: 12, height: expanded ? PANEL_ROW_HEIGHT : 32, padding: expanded ? "0 0 0 16px" : "0 0 0 14px", border: "none", background: "transparent", color: "inherit", fontSize: 14, minWidth: 0, cursor: expanded ? "default" : "pointer" }}>
          <StStrategyTabIcon />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 }}>{p.scriptName}</span>
        </button>
        <Tip text="Open context menu">
          <button ref={chevron} type="button" aria-label="Open context menu" aria-expanded={!!menu} className="tv-bb-btn"
            style={{ height: 24, minWidth: 21, padding: 0, marginLeft: 8, background: menu ? "var(--tv-active-neutral-hover)" : undefined }}
            onClick={() => {
              const r = chevron.current?.getBoundingClientRect();
              if (!r || menu) { setMenu(null); return; }
              setMenu(r.bottom + 240 > window.innerHeight ? { above: { right: r.left + 220, top: r.top - 4 } } : { x: r.left - 8, y: r.bottom + 4 });
            }}>
            <SmallChevron up={!!menu} />
          </button>
        </Tip>
      </div>
      {menu && (
        <TvMenu isDark={p.theme === "dark"} position={menu} onClose={() => setMenu(null)} ariaLabel="Strategy"
          items={[
            { label: p.scriptName, checked: true },
            { kind: "divider" },
            { label: "Settings…", onClick: p.onOpenSettings },
            { label: "Add alert…", onClick: p.onAddAlert },
            { kind: "divider" },
            { label: "Remove strategy", onClick: p.onRemove },
          ]} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Tip text={expanded && !maximized ? "Collapse panel" : "Open panel"}>
          <button type="button" className="tv-bb-btn" aria-label={expanded && !maximized ? "Collapse panel" : "Open panel"} onClick={toggleOpen} style={{ width: 34, height: 34, padding: 0 }}>
            {expanded ? <MinimizeIcon size={28} /> : <PanelUpIcon />}
          </button>
        </Tip>
        <Tip text={maximized ? "Restore panel" : "Maximize panel"}>
          <button type="button" className="tv-bb-btn" aria-label={maximized ? "Restore panel" : "Maximize panel"} onClick={toggleMax} style={{ width: 34, height: 34, padding: 0 }}>
            {maximized ? <RestoreIcon size={28} /> : <MaximizeIcon size={28} />}
          </button>
        </Tip>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the panel

function Panel(p: StrategyReportPanelProps) {
  const dock = strategyDock.useValue();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  const setBody = useCallback((el: HTMLDivElement | null) => { bodyRef.current = el; setBodyEl(el); }, []);
  const [bodyH, setBodyH] = useState(400);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    setBodyH(el.clientHeight);
    const ro = new ResizeObserver(() => setBodyH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [dock.expanded, bodyEl]);
  const view = dock.view === "trades" ? "trades" : "metrics";
  const setView = (v: "metrics" | "trades") => strategyDock.set({ view: v });
  // Esc leaves the maximized report
  useEscapeClose(() => strategyDock.set({ maximized: false }), dock.maximized);
  return (
    <div className="st-root" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Header p={p} expanded={dock.expanded} maximized={dock.maximized} />
      {dock.expanded && (
        <>
          <Toolbar p={p} view={view} setView={setView} />
          <div ref={setBody} data-name="strategy-report-body" className="st-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative", opacity: p.busy ? 0.6 : 1, transition: "opacity 0.15s" }}>
            {view === "metrics" ? <MetricsView p={p} bodyHeight={bodyH} /> : <TradesView p={p} scrollEl={bodyEl} />}
          </div>
        </>
      )}
    </div>
  );
}

const MemoPanel = React.memo(Panel);

// Renders into the bottom panel's strategy section (which exists while a strategy is on the chart).
// The chart re-renders on every live price; the report only re-renders when its own data changes
// (the callbacks are kept stable for that).
export default function StrategyReportPanel(props: StrategyReportPanelProps) {
  const latest = useRef(props);
  latest.current = props;
  const callbacks = useMemo(() => ({
    onChangeRange: (r: BacktestRange) => latest.current.onChangeRange(r),
    onChangeCapital: (c: number) => latest.current.onChangeCapital(c),
    onShowTime: (from: number, to?: number) => latest.current.onShowTime(from, to),
    onOpenSettings: () => latest.current.onOpenSettings(),
    onAddAlert: () => latest.current.onAddAlert(),
    onRemove: () => latest.current.onRemove(),
  }), []);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    strategyPresence.set({ on: true, title: props.scriptName });
  }, [props.scriptName]);
  useEffect(() => () => strategyPresence.set({ on: false, title: "" }), []);
  useEffect(() => {
    let raf = 0;
    const find = () => {
      const el = document.getElementById(STRATEGY_HOST_ID);
      if (el) setHost((h) => (h === el ? h : el));
      else raf = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!host) return null;
  return createPortal(<MemoPanel {...props} {...callbacks} />, host);
}
