"use client";

// The trading panel's account manager (TradingView's): account switcher and summary
// (balance, equity, P&L, margin, available funds, margin buffer) and tabs for positions,
// orders, order history, balance history, activity log, trade history and analytics, with
// row actions, column visibility and CSV export.

import React, { useMemo, useRef, useState } from "react";
import { engine, useEngineState, tradingUi, openTicket } from "./store";
import {
  accountMetrics, activeAccount, activeBook, orderLabel, orderPrice, positionViews, precisionOf, EngineState, Order, PositionView, Trade,
} from "./engine";
import {
  formatMoney, formatPrice, formatQty, formatSignedMoney, formatSignedPercent, formatDateTime, formatShortDateTime, formatCompact,
} from "./instruments";
import {
  C, Popover, MenuItem, MenuDivider, SymbolAvatar, ChevronDown, ChevronUp, HexSettingsIcon, PlusIcon, DownloadIcon, ColumnsIcon,
  PencilIcon, CloseIcon, UfoIllustration, Tip,
} from "./ui";
import { Checkbox } from "./OrderTicket";
import { tradingSettings } from "./settings";

type Tab = "positions" | "orders" | "orderHistory" | "balanceHistory" | "activity" | "tradeHistory" | "analytics";
const TABS: { id: Tab; label: string }[] = [
  { id: "positions", label: "Positions" },
  { id: "orders", label: "Orders" },
  { id: "orderHistory", label: "Order history" },
  { id: "balanceHistory", label: "Balance history" },
  { id: "activity", label: "Activity log" },
  { id: "tradeHistory", label: "Trade history" },
  { id: "analytics", label: "Analytics" },
];

interface Col<T> {
  id: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
  csv: (row: T) => string | number;
  width?: number;
}

const HIDDEN_KEY = "tv:accountManagerHiddenColumns";
function loadHidden(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "{}"); } catch { return {}; }
}

export default function AccountManager() {
  const state = useEngineState();
  const [tab, setTab] = useState<Tab>("positions");
  const [orderFilter, setOrderFilter] = useState("All");
  const [historyFilter, setHistoryFilter] = useState("All");
  const [hidden, setHidden] = useState<Record<string, string[]>>(() => (typeof window === "undefined" ? {} : loadHidden()));
  const acc = activeAccount(state);
  const book = activeBook(state);
  const m = accountMetrics(state);
  const positions = positionViews(state);
  const prec = (sym: string) => precisionOf(state, sym);

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const activeOrders = book.orders.filter(o => o.status === "working" || o.status === "inactive");
  const sessionOrders = book.orders.filter(o => o.status === "working" || o.status === "inactive" || (o.closedAt ?? 0) >= startOfDay.getTime())
    .sort((a, b) => b.placedAt - a.placedAt || Number(b.id) - Number(a.id));
  const historyOrders = book.orders.filter(o => o.status === "filled" || o.status === "cancelled" || o.status === "rejected")
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0) || Number(b.id) - Number(a.id));

  const toggleCol = (tabId: string, colId: string) => {
    setHidden(prev => {
      const list = prev[tabId] || [];
      const next = { ...prev, [tabId]: list.includes(colId) ? list.filter(c => c !== colId) : [...list, colId] };
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // ---------- columns ----------
  const posCols: Col<PositionView>[] = [
    { id: "symbol", label: "Symbol", render: p => <SymbolCell symbol={p.symbol} />, csv: p => p.symbol },
    { id: "side", label: "Side", render: p => <span style={{ color: p.side === "buy" ? C.buy : C.sell }}>{p.side === "buy" ? "Long" : "Short"}</span>, csv: p => (p.side === "buy" ? "Long" : "Short") },
    { id: "qty", label: "Quantity", align: "right", render: p => formatQty(p.qty), csv: p => p.qty },
    { id: "avg", label: "Avg fill price", align: "right", render: p => formatPrice(p.avgPrice, prec(p.symbol)), csv: p => p.avgPrice },
    { id: "tp", label: "Take profit", align: "right", render: p => p.tpOrders[0] ? formatPrice(orderPrice(p.tpOrders[0])!, prec(p.symbol)) : "", csv: p => (p.tpOrders[0] ? orderPrice(p.tpOrders[0])! : "") },
    { id: "sl", label: "Stop loss", align: "right", render: p => p.slOrders[0] ? formatPrice(orderPrice(p.slOrders[0])!, prec(p.symbol)) : "", csv: p => (p.slOrders[0] ? orderPrice(p.slOrders[0])! : "") },
    { id: "last", label: "Last price", align: "right", render: p => formatPrice(p.last, prec(p.symbol)), csv: p => p.last },
    { id: "pnl", label: "Unrealized PnL", align: "right", render: p => <Money value={p.pnl} signed />, csv: p => p.pnl.toFixed(2) },
    { id: "pnlPct", label: "Unrealized PnL %", align: "right", render: p => <span style={{ color: pnlColor(p.pnl) }}>{formatSignedPercent(p.pnlPct)}</span>, csv: p => p.pnlPct.toFixed(2) },
    { id: "tradeValue", label: "Trade value", align: "right", render: p => <Money value={p.tradeValue} />, csv: p => p.tradeValue.toFixed(2) },
    { id: "marketValue", label: "Market value", align: "right", render: p => <Money value={p.marketValue} />, csv: p => p.marketValue.toFixed(2) },
    { id: "leverage", label: "Leverage", align: "right", render: p => `${p.leverage}x`, csv: p => p.leverage },
    { id: "margin", label: "Margin", align: "right", render: p => <Money value={p.margin} />, csv: p => p.margin.toFixed(2) },
    { id: "expiration", label: "Expiration date", align: "right", render: () => "", csv: () => "" },
  ];

  const statusColor = (s: Order["status"]) => s === "working" ? C.buy : s === "filled" ? C.tp : s === "cancelled" ? "#ff9800" : s === "rejected" ? C.sell : C.muted;
  const statusText = (s: Order["status"]) => s[0].toUpperCase() + s.slice(1);
  const levelBrackets = (o: Order, role: "tp" | "sl") => {
    const kid = book.orders.find(k => k.parentId === o.id && k.role === role);
    return kid ? orderPrice(kid) : undefined;
  };
  const orderCols: Col<Order>[] = [
    { id: "symbol", label: "Symbol", render: o => <SymbolCell symbol={o.symbol} />, csv: o => o.symbol },
    { id: "side", label: "Side", render: o => <span style={{ color: o.side === "buy" ? C.buy : C.sell }}>{o.side === "buy" ? "Buy" : "Sell"}</span>, csv: o => o.side },
    { id: "type", label: "Type", render: o => orderLabel(o), csv: o => orderLabel(o) },
    { id: "qty", label: "Quantity", align: "right", render: o => formatQty(o.qty), csv: o => o.qty },
    { id: "limit", label: "Limit price", align: "right", render: o => (o.limitPrice !== undefined ? formatPrice(o.limitPrice, prec(o.symbol)) : ""), csv: o => o.limitPrice ?? "" },
    { id: "stop", label: "Stop price", align: "right", render: o => (o.stopPrice !== undefined ? formatPrice(o.stopPrice, prec(o.symbol)) : ""), csv: o => o.stopPrice ?? "" },
    { id: "fill", label: "Fill price", align: "right", render: o => (o.fillPrice !== undefined ? formatPrice(o.fillPrice, prec(o.symbol)) : ""), csv: o => o.fillPrice ?? "" },
    { id: "tp", label: "Take profit", align: "right", render: o => { const v = o.role === "entry" ? levelBrackets(o, "tp") : undefined; return v !== undefined ? formatPrice(v, prec(o.symbol)) : ""; }, csv: o => (o.role === "entry" ? levelBrackets(o, "tp") ?? "" : "") },
    { id: "sl", label: "Stop loss", align: "right", render: o => { const v = o.role === "entry" ? levelBrackets(o, "sl") : undefined; return v !== undefined ? formatPrice(v, prec(o.symbol)) : ""; }, csv: o => (o.role === "entry" ? levelBrackets(o, "sl") ?? "" : "") },
    { id: "instruction", label: "Instruction", render: o => o.rejectReason ? <span style={{ color: C.sell }}>{o.rejectReason}</span> : "", csv: o => o.rejectReason ?? "" },
    { id: "status", label: "Status", render: o => <span style={{ color: statusColor(o.status) }}>{statusText(o.status)}</span>, csv: o => statusText(o.status) },
    { id: "placed", label: "Placing time", render: o => formatDateTime(o.placedAt), csv: o => formatDateTime(o.placedAt) },
    { id: "id", label: "Order ID", render: o => o.id, csv: o => o.id },
    { id: "level", label: "Level ID", render: o => o.levelId ?? "", csv: o => o.levelId ?? "" },
    { id: "expiration", label: "Expiration", render: o => (o.expiresAt ? formatDateTime(o.expiresAt) : ""), csv: o => (o.expiresAt ? formatDateTime(o.expiresAt) : "") },
  ];
  const historyCols: Col<Order>[] = [
    ...orderCols.filter(c => ["symbol", "side", "type", "qty", "limit", "stop", "fill", "status"].includes(c.id)),
    { id: "commission", label: "Commission", align: "right", render: () => "", csv: () => "" },
    orderCols.find(c => c.id === "placed")!,
    { id: "closed", label: "Closing time", render: o => (o.closedAt ? formatDateTime(o.closedAt) : ""), csv: o => (o.closedAt ? formatDateTime(o.closedAt) : "") },
    orderCols.find(c => c.id === "id")!,
    orderCols.find(c => c.id === "level")!,
    { id: "leverage", label: "Leverage", align: "right", render: o => (o.status === "filled" && o.role === "entry" ? o.leverage : ""), csv: o => (o.status === "filled" && o.role === "entry" ? o.leverage : "") },
  ];
  type BalRow = EngineState["books"][string]["balanceHistory"][number];
  const balanceCols: Col<BalRow>[] = [
    { id: "time", label: "Time", render: b => formatDateTime(b.time), csv: b => formatDateTime(b.time) },
    { id: "before", label: "Balance before", render: b => formatMoney(b.before), csv: b => b.before.toFixed(2) },
    { id: "after", label: "Balance after", render: b => formatMoney(b.after), csv: b => b.after.toFixed(2) },
    { id: "pnl", label: "Realized PnL", render: b => <Money value={b.pnl} signed />, csv: b => b.pnl.toFixed(2) },
    { id: "action", label: "Action", render: b => <span style={{ whiteSpace: "normal" }}>{b.action}</span>, csv: b => b.action, width: 520 },
  ];
  type ActRow = EngineState["books"][string]["activity"][number];
  const activityCols: Col<ActRow>[] = [
    { id: "time", label: "Time", render: a => formatDateTime(a.time), csv: a => formatDateTime(a.time), width: 180 },
    { id: "text", label: "Text", render: a => <span style={{ whiteSpace: "normal" }}>{a.text}</span>, csv: a => a.text },
  ];

  // ---------- tab bodies ----------
  const counts: Partial<Record<Tab, number>> = { positions: positions.length, orders: activeOrders.length };
  const filterCount = (list: Order[], f: string) => f === "All" ? list.length : list.filter(o => o.status === f.toLowerCase()).length;
  const orderRows = orderFilter === "All" ? sessionOrders : sessionOrders.filter(o => o.status === orderFilter.toLowerCase());
  const historyRows = historyFilter === "All" ? historyOrders : historyOrders.filter(o => o.status === historyFilter.toLowerCase());

  const trades = useMemo(() => [...book.trades].sort((a, b) => (b.exitTime ?? b.entryTime) - (a.exitTime ?? a.entryTime)), [book.trades]);

  const csvFor = (): { name: string; rows: string[][] } | null => {
    const build = <T,>(cols: Col<T>[], rows: T[], tabId: string) => {
      const vis = cols.filter(c => !(hidden[tabId] || []).includes(c.id));
      return [vis.map(c => c.label), ...rows.map(r => vis.map(c => String(c.csv(r))))];
    };
    switch (tab) {
      case "positions": return { name: "positions", rows: build(posCols, positions, tab) };
      case "orders": return { name: "orders", rows: build(orderCols, orderRows, tab) };
      case "orderHistory": return { name: "order-history", rows: build(historyCols, historyRows, tab) };
      case "balanceHistory": return { name: "balance-history", rows: build(balanceCols, book.balanceHistory, tab) };
      case "activity": return { name: "activity-log", rows: build(activityCols, book.activity, tab) };
      case "tradeHistory": return {
        name: "trade-history",
        rows: [["Symbol", "Side", "Entry time", "Entry order", "Entry price", "Exit time", "Exit order", "Exit price", "Quantity", "Net PnL", "Return %"],
          ...trades.map(t => [t.symbol, t.side === "buy" ? "Long" : "Short", formatDateTime(t.entryTime), t.entryOrderId, String(t.entryPrice),
            t.exitTime ? formatDateTime(t.exitTime) : "Open", t.exitOrderId ?? "", t.exitPrice !== undefined ? String(t.exitPrice) : "", String(t.qty),
            t.pnl !== undefined ? t.pnl.toFixed(2) : "", t.pnl !== undefined ? ((t.pnl / (t.entryPrice * t.qty)) * 100).toFixed(2) : ""])],
      };
      default: return null;
    }
  };
  const exportCsv = () => {
    const data = csvFor();
    if (!data) return;
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const blob = new Blob([data.rows.map(r => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${acc.name.replace(/\s+/g, "-")}-${data.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const positionActions = (p: PositionView) => (
    <RowActions>
      <Tip text="Protect position"><IconBtn onClick={() => tradingUi.set({ dialog: { kind: "position", symbol: p.symbol } })}><PencilIcon /></IconBtn></Tip>
      <Tip text="Close position"><IconBtn onClick={() => {
        if (tradingSettingsOneClick()) engine.closePosition(p.symbol);
        else tradingUi.set({ dialog: { kind: "close", symbol: p.symbol } });
      }}><CloseIcon size={16} /></IconBtn></Tip>
    </RowActions>
  );
  const orderActions = (o: Order) => (o.status === "working" || o.status === "inactive") ? (
    <RowActions>
      <Tip text="Modify order"><IconBtn onClick={() => {
        if (o.role === "entry") openTicket({ symbol: o.symbol, side: o.side, type: o.type, modifyOrderId: o.id });
        else tradingUi.set({ dialog: { kind: "position", symbol: o.symbol } });
      }}><PencilIcon /></IconBtn></Tip>
      <Tip text="Cancel order"><IconBtn onClick={() => engine.cancelOrder(o.id)}><CloseIcon size={16} /></IconBtn></Tip>
    </RowActions>
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: C.panel, color: C.text, fontSize: 13, minHeight: 0 }}>
      {/* Account + summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 12px 6px 16px", flexWrap: "wrap" }}>
        <AccountSwitcher />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Metric label="Account balance" value={formatMoney(m.balance)} />
          <Metric label="Equity" value={formatMoney(m.equity)} />
          <Metric label="Realized PnL" value={formatSignedMoney(m.realizedPnL)} color={pnlColor(m.realizedPnL)} />
          <Metric label="Unrealized PnL" value={formatSignedMoney(m.unrealizedPnL)} color={pnlColor(m.unrealizedPnL)} />
          <Metric label="Account margin" value={formatMoney(m.accountMargin)} />
          <Metric label="Available funds" value={formatMoney(m.availableFunds)} color={m.availableFunds < 0 ? C.sell : undefined} />
          <Metric label="Orders margin" value={formatMoney(m.ordersMargin)} />
          <Metric label="Margin buffer" value={`${m.marginBuffer.toFixed(2)}%`} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px 8px 16px" }}>
        <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
          {TABS.map(t => (
            <Pill key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}{counts[t.id] ? <span style={{ opacity: 0.6, marginLeft: 4 }}>{counts[t.id]}</span> : null}
            </Pill>
          ))}
        </div>
        {tab !== "analytics" && <Tip text="Export data"><IconBtn onClick={exportCsv}><DownloadIcon /></IconBtn></Tip>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tab === "positions" && (
          <DataTable cols={posCols} rows={positions} rowKey={p => p.symbol} hidden={hidden.positions || []} onToggleCol={c => toggleCol("positions", c)}
            actions={positionActions} empty="There are no open positions in your trading account yet" onRowClick={p => setChartSymbol(p.symbol)} />
        )}
        {tab === "orders" && (
          <>
            <Filters options={["All", "Working", "Inactive", "Filled", "Cancelled", "Rejected"]} value={orderFilter} onChange={setOrderFilter} count={f => filterCount(sessionOrders, f)} />
            <DataTable cols={orderCols} rows={orderRows} rowKey={o => o.id} hidden={hidden.orders || []} onToggleCol={c => toggleCol("orders", c)}
              actions={orderActions} empty="There are no orders in your trading account yet" onRowClick={o => setChartSymbol(o.symbol)} />
          </>
        )}
        {tab === "orderHistory" && (
          <>
            <Filters options={["All", "Filled", "Cancelled", "Rejected"]} value={historyFilter} onChange={setHistoryFilter} count={f => filterCount(historyOrders, f)} />
            <DataTable cols={historyCols} rows={historyRows} rowKey={o => o.id} hidden={hidden.orderHistory || []} onToggleCol={c => toggleCol("orderHistory", c)}
              empty="There is no trading data here yet" onRowClick={o => setChartSymbol(o.symbol)} />
          </>
        )}
        {tab === "balanceHistory" && (
          <DataTable cols={balanceCols} rows={book.balanceHistory} rowKey={(b, i) => `${b.time}-${i}`} hidden={hidden.balanceHistory || []} onToggleCol={c => toggleCol("balanceHistory", c)}
            empty="There is no trading data here yet" />
        )}
        {tab === "activity" && (
          <DataTable cols={activityCols} rows={book.activity} rowKey={(a, i) => `${a.time}-${i}`} hidden={hidden.activity || []} onToggleCol={c => toggleCol("activity", c)}
            empty="There is no trading data here yet" />
        )}
        {tab === "tradeHistory" && <TradeHistory trades={trades} prec={prec} />}
        {tab === "analytics" && <Analytics trades={book.trades} />}
      </div>
    </div>
  );
}

function tradingSettingsOneClick() {
  return tradingSettings.get().oneClickTrading;
}
function setChartSymbol(symbol: string) {
  window.dispatchEvent(new CustomEvent("tv:set-symbol", { detail: { symbol } }));
}
const pnlColor = (v: number) => (v > 0.004 ? C.tp : v < -0.004 ? C.sell : C.text);

// ---------- pieces ----------

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <span style={{ fontSize: 13, color: C.text, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: color || C.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Money({ value, signed }: { value: number; signed?: boolean }) {
  return (
    <span style={{ color: signed ? pnlColor(value) : C.text }}>
      {signed ? formatSignedMoney(value) : formatMoney(value)}<span style={{ fontSize: 10, marginLeft: 2 }}>USD</span>
    </span>
  );
}

function SymbolCell({ symbol }: { symbol: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <SymbolAvatar symbol={symbol} size={20} />
      <span style={{ background: C.buy, color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 12, fontWeight: 600 }}>{symbol}</span>
    </span>
  );
}

function Pill({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      height: 30, padding: "0 12px", borderRadius: 15, border: "none", fontSize: 14, cursor: "pointer", whiteSpace: "nowrap",
      background: active ? "var(--tv-trade-toggle-on)" : hover ? "var(--tv-color-item-active)" : C.seg,
      color: active ? "var(--tv-trade-panel-bg)" : C.text,
    }}>{children}</button>
  );
}

function IconBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onClick(); }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      width: 28, height: 28, border: "none", borderRadius: 6, background: hover ? C.hover : "transparent", color: C.text, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
    }}>{children}</button>
  );
}

const RowActions = ({ children }: { children: React.ReactNode }) => <span style={{ display: "inline-flex", gap: 2 }}>{children}</span>;

function Filters({ options, value, onChange, count }: { options: string[]; value: string; onChange: (v: string) => void; count: (f: string) => number }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "0 12px 6px 16px" }}>
      {options.map(o => {
        const n = count(o);
        return (
          <button key={o} type="button" onClick={() => onChange(o)} style={{
            height: 28, padding: "0 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 14,
            background: value === o ? C.seg : "transparent", color: C.text, fontWeight: value === o ? 600 : 400,
          }}>{o}{n > 0 && <span style={{ opacity: 0.55, marginLeft: 4, fontWeight: 400 }}>{n}</span>}</button>
        );
      })}
    </div>
  );
}

function DataTable<T>({ cols, rows, rowKey, hidden, onToggleCol, actions, empty, onRowClick }: {
  cols: Col<T>[]; rows: T[]; rowKey: (r: T, i: number) => string; hidden: string[]; onToggleCol: (id: string) => void;
  actions?: (r: T) => React.ReactNode; empty: string; onRowClick?: (r: T) => void;
}) {
  const vis = cols.filter(c => !hidden.includes(c.id));
  const colsBtn = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const th: React.CSSProperties = { position: "sticky", top: 0, background: C.panel, color: C.muted, fontWeight: 400, fontSize: 13, padding: "8px 12px", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}`, zIndex: 1 };
  return (
    <div style={{ position: "relative", minWidth: "100%", display: rows.length ? "block" : "flex", flexDirection: "column", height: rows.length ? "auto" : "100%" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {vis.map((c, i) => <th key={c.id} style={{ ...th, textAlign: c.align || "left", paddingLeft: i === 0 ? 16 : 12, width: c.width }}>{c.label}</th>)}
            <th style={{ ...th, width: 72, textAlign: "right", paddingRight: 12 }}>
              <button ref={colsBtn} type="button" aria-label="Columns" onClick={() => setMenu(v => !v)} style={{ border: "none", background: menu ? C.hover : "transparent", borderRadius: 6, cursor: "pointer", color: C.text, display: "inline-flex", padding: 2 }}>
                <ColumnsIcon />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const k = rowKey(r, i);
            return (
              <tr key={k} onMouseEnter={() => setHoverRow(k)} onMouseLeave={() => setHoverRow(null)} onClick={() => onRowClick?.(r)}
                style={{ background: hoverRow === k ? C.hover : "transparent", cursor: onRowClick ? "pointer" : "default" }}>
                {vis.map((c, ci) => (
                  <td key={c.id} style={{ padding: "10px 12px", paddingLeft: ci === 0 ? 16 : 12, textAlign: c.align || "left", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle", fontVariantNumeric: "tabular-nums", maxWidth: c.width }}>
                    {c.render(r)}
                  </td>
                ))}
                <td style={{ padding: "4px 12px", textAlign: "right", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                  <span style={{ visibility: hoverRow === k ? "visible" : "hidden" }}>{actions?.(r)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontSize: 15, textAlign: "center", color: C.text, minHeight: 80 }}>
          <span style={{ maxWidth: 320, lineHeight: "22px" }}>{empty}</span>
        </div>
      )}
      <Popover anchor={colsBtn.current} open={menu} onClose={() => setMenu(false)} align="right" width={230}>
        <div style={{ padding: "4px 16px 6px", fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>COLUMNS</div>
        {cols.map(c => (
          <MenuItem key={c.id} icon={<Checkbox checked={!hidden.includes(c.id)} />} onClick={() => onToggleCol(c.id)}>{c.label}</MenuItem>
        ))}
      </Popover>
    </div>
  );
}

function TradeHistory({ trades, prec }: { trades: Trade[]; prec: (s: string) => number }) {
  if (trades.length === 0) {
    return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>There is no trading data here yet</div>;
  }
  const th: React.CSSProperties = { position: "sticky", top: 0, background: C.panel, color: C.muted, fontWeight: 400, fontSize: 13, padding: "8px 12px", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}`, zIndex: 1, textAlign: "left" };
  const td: React.CSSProperties = { padding: "8px 12px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={{ ...th, paddingLeft: 16 }}>Symbol</th><th style={th}>Side</th><th style={th}>Type</th><th style={th}>Date and time ↓</th><th style={th}>Order ID</th>
          <th style={{ ...th, textAlign: "right" }}>Price</th><th style={{ ...th, textAlign: "right" }}>Size</th><th style={{ ...th, textAlign: "right" }}>Net PnL</th><th style={{ ...th, textAlign: "right", paddingRight: 16 }}>Return</th>
        </tr>
      </thead>
      <tbody>
        {trades.map(t => {
          const open = t.exitTime === undefined;
          const value = t.entryPrice * t.qty;
          const ret = !open && t.pnl !== undefined ? (t.pnl / value) * 100 : undefined;
          const p = prec(t.symbol);
          return (
            <React.Fragment key={t.id}>
              <tr>
                <td rowSpan={2} style={{ ...td, paddingLeft: 16, borderBottom: `1px solid ${C.border}` }}><SymbolCell symbol={t.symbol} /></td>
                <td rowSpan={2} style={{ ...td, color: t.side === "buy" ? C.buy : C.sell, borderBottom: `1px solid ${C.border}` }}>{t.side === "buy" ? "Long" : "Short"}</td>
                <td style={{ ...td, borderBottom: `1px solid ${C.border}` }}>Exit</td>
                <td style={{ ...td, color: open ? C.muted : C.text, borderBottom: `1px solid ${C.border}` }}>{open ? "Open" : formatShortDateTime(t.exitTime!)}</td>
                <td style={{ ...td, borderBottom: `1px solid ${C.border}` }}>{open ? "—" : t.exitOrderId}</td>
                <td style={{ ...td, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>{open ? "—" : formatPrice(t.exitPrice!, p)}</td>
                <td rowSpan={2} style={{ ...td, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                  <div>{formatQty(Math.round(t.qty * 100) / 100)}</div>
                  <div>{formatCompact(value)}<span style={{ fontSize: 10, marginLeft: 2 }}>USD</span></div>
                </td>
                <td rowSpan={2} style={{ ...td, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                  {open ? <>0<span style={{ fontSize: 10, marginLeft: 2 }}>USD</span></> : <Money value={t.pnl!} signed />}
                </td>
                <td rowSpan={2} style={{ ...td, textAlign: "right", paddingRight: 16, color: ret === undefined ? C.muted : pnlColor(ret), borderBottom: `1px solid ${C.border}` }}>
                  {ret === undefined ? "—" : formatSignedPercent(ret)}
                </td>
              </tr>
              <tr>
                <td style={{ ...td, borderBottom: `1px solid ${C.border}` }}>Entry</td>
                <td style={{ ...td, borderBottom: `1px solid ${C.border}` }}>{formatShortDateTime(t.entryTime)}</td>
                <td style={{ ...td, borderBottom: `1px solid ${C.border}` }}>{t.entryOrderId}</td>
                <td style={{ ...td, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>{formatPrice(t.entryPrice, p)}</td>
              </tr>
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------- analytics ----------

function Analytics({ trades }: { trades: Trade[] }) {
  const closed = useMemo(() => trades.filter(t => t.exitTime !== undefined && t.pnl !== undefined).sort((a, b) => a.exitTime! - b.exitTime!), [trades]);
  const [showCum, setShowCum] = useState(true);
  const [showRun, setShowRun] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);
  const wins = closed.filter(t => t.pnl! > 0);
  const losses = closed.filter(t => t.pnl! < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl!, 0);
  const grossLoss = -losses.reduce((s, t) => s + t.pnl!, 0);
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const stat = (label: string, value: React.ReactNode) => (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 14, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16 }}>{value}</div>
    </div>
  );
  return (
    <div style={{ padding: "8px 16px 16px" }}>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {stat("Profitable trades", closed.length ? <>{((wins.length / closed.length) * 100).toFixed(2)}% <span style={{ marginLeft: 6 }}>{wins.length}/{closed.length}</span></> : "—")}
        {stat("Profit factor", grossLoss > 0 ? (grossProfit / grossLoss).toFixed(3) : "—")}
        {stat("Expectancy", closed.length ? <Money value={closed.reduce((s, t) => s + t.pnl!, 0) / closed.length} /> : "—")}
        {stat("Average R:R", avgWin > 0 && avgLoss > 0 ? (avgWin / avgLoss).toFixed(3) : "—")}
      </div>
      <div style={{ fontWeight: 600, fontSize: 16, margin: "22px 0 10px" }}>Performance</div>
      {closed.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "12px 0 24px", color: C.text }}>
          <UfoIllustration size={120} cargo="cow" />
          <span style={{ fontSize: 15 }}>Not enough data to show</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ width: 200, flexShrink: 0, fontSize: 13 }}>
            {legendOpen && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }} onClick={() => setShowCum(v => !v)}>
                  <Checkbox checked={showCum} /> Cumulative PnL
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }} onClick={() => setShowRun(v => !v)}>
                  <Checkbox checked={showRun} /> Run-ups and drawdowns
                </label>
              </>
            )}
            <IconBtn onClick={() => setLegendOpen(v => !v)}>{legendOpen ? <ChevronUp /> : <ChevronDown />}</IconBtn>
          </div>
          <PerformanceChart trades={closed} showCum={showCum} showRun={showRun} />
        </div>
      )}
    </div>
  );
}

function PerformanceChart({ trades, showCum, showRun }: { trades: Trade[]; showCum: boolean; showRun: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900, H = 240, PAD_R = 70, PAD_T = 12, PAD_B = 24;
  const cum: number[] = [];
  trades.reduce((s, t) => { const v = s + t.pnl!; cum.push(v); return v; }, 0);
  const values = [0, ...(showCum ? cum : []), ...(showRun ? trades.flatMap(t => [t.runUp, t.drawdown]) : [])];
  let min = Math.min(...values), max = Math.max(...values);
  if (max - min < 1e-9) { max += 1; min -= 1; }
  const pad = (max - min) * 0.1;
  min -= pad; max += pad;
  const n = trades.length;
  const plotW = W - PAD_R;
  const x = (i: number) => (n === 1 ? plotW / 2 : (i / (n - 1)) * (plotW - 40) + 20);
  const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);
  const ticks = 5;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);
  const line = cum.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(n - 1)},${y(Math.max(min, 0))} L${x(0)},${y(Math.max(min, 0))} Z`;
  const barW = Math.max(3, Math.min(18, (plotW - 40) / Math.max(1, n) * 0.4));
  return (
    <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}
        onMouseMove={e => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0, bd = Infinity;
          for (let i = 0; i < n; i++) { const dd = Math.abs(x(i) - px); if (dd < bd) { bd = dd; best = i; } }
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke="var(--tv-color-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={plotW + 8} y={y(v) + 4} fontSize={11} fill="var(--tv-color-text)">{v.toFixed(2)}</text>
          </g>
        ))}
        {showRun && trades.map((t, i) => (
          <g key={i}>
            <rect x={x(i) - barW / 2} y={y(Math.max(0, t.runUp))} width={barW} height={Math.max(0, y(0) - y(t.runUp))} fill="#089981" opacity={0.55} />
            <rect x={x(i) - barW / 2} y={y(0)} width={barW} height={Math.max(0, y(t.drawdown) - y(0))} fill="#f23645" opacity={0.55} />
          </g>
        ))}
        {showCum && (
          <>
            <path d={area} fill="#2962ff" opacity={0.15} />
            <path d={line} fill="none" stroke="#2962ff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {cum.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="#2962ff" />)}
            <rect x={plotW + 2} y={y(cum[n - 1]) - 9} width={PAD_R - 4} height={18} rx={2} fill="#2962ff" />
            <text x={plotW + 8} y={y(cum[n - 1]) + 4} fontSize={11} fill="#fff">{cum[n - 1].toFixed(2)}</text>
          </>
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} stroke="var(--tv-trade-muted)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover !== null && (
        <div style={{ position: "absolute", top: 8, left: `${(x(hover) / W) * 100}%`, transform: "translateX(-50%)", background: "var(--tv-trade-tooltip-bg)", color: "#fff", fontSize: 12, borderRadius: 6, padding: "6px 10px", pointerEvents: "none", whiteSpace: "nowrap" }}>
          Trade #{hover + 1} · {trades[hover].symbol}<br />
          Net PnL {formatSignedMoney(trades[hover].pnl!)} USD · Cumulative {formatSignedMoney(cum[hover])} USD<br />
          Run-up {formatSignedMoney(trades[hover].runUp)} · Drawdown {formatSignedMoney(trades[hover].drawdown)}
        </div>
      )}
    </div>
  );
}

// ---------- account switcher ----------

function AccountSwitcher() {
  const state = useEngineState();
  const acc = activeAccount(state);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 6, border: `1px solid ${C.border}`,
        background: open ? C.hover : "transparent", color: C.text, cursor: "pointer", fontSize: 14,
      }}>
        {acc.name} <span style={{ fontSize: 10, fontWeight: 600 }}>{acc.currency}</span> {open ? <ChevronUp /> : <ChevronDown />}
      </button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={250}>
        <div style={{ padding: "6px 16px", fontSize: 11, letterSpacing: 0.5, color: C.muted }}>PAPER TRADING ACCOUNTS</div>
        {state.accounts.map(a => (
          <MenuItem key={a.id} selected={a.id === acc.id} onClick={() => { engine.switchAccount(a.id); setOpen(false); }}
            right={a.id === acc.id ? (
              <span role="button" aria-label="Account settings" onClick={e => { e.stopPropagation(); setOpen(false); tradingUi.set({ dialog: { kind: "accountSettings", accountId: a.id } }); }} style={{ display: "flex", cursor: "pointer" }}>
                <HexSettingsIcon size={20} />
              </span>
            ) : undefined}>
            {a.name} <span style={{ fontSize: 10, fontWeight: 600 }}>{a.currency}</span>
          </MenuItem>
        ))}
        <MenuDivider />
        <MenuItem icon={<PlusIcon />} onClick={() => { setOpen(false); tradingUi.set({ dialog: { kind: "createAccount" } }); }}>Create account…</MenuItem>
      </Popover>
    </>
  );
}
