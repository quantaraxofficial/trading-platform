"use client";

// The trading panel while MetaTrader 5 is the connected broker: the account's figures (balance,
// equity, open profit, margin, free margin, margin level), and its positions, pending orders and
// the last 24 hours' deals, as the broker reports them (refreshed every few seconds), and the strategies
// auto-trading it ("Algo": AutoTrade.tsx). From here: a new order,
// closing a position, changing its stops, moving or cancelling a pending order. The order form
// (also what the chart's Buy / Sell open while MT5 is the broker) sends market, limit and stop
// orders with stop loss / take profit; a real-money account asks for confirmation.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  useBroker, mt5Symbol, placeMt5Order, closeMt5Position, modifyMt5Position, cancelMt5Order, modifyMt5Order,
  type Mt5Deal, type Mt5Order, type Mt5Position, type Mt5SymbolInfo,
} from "./broker";
import { tradingUi } from "./store";
import { useEscapeClose } from "../lib/useEscapeClose";
import { C } from "./ui";
import { displaySymbol } from "@/app/lib/symbolDisplay";
import { AlgoTab } from "./AutoTrade";
import { useAlgo } from "./algo";

const TABS = [{ id: "positions", label: "Positions" }, { id: "orders", label: "Orders" }, { id: "deals", label: "Last 24 hours" }, { id: "algo", label: "Algo" }] as const;
type Tab = (typeof TABS)[number]["id"];

const num = (v: number, d = 2) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const priceText = (v: number | null | undefined) => (v == null ? "—" : String(v));
const timeText = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const pnlColor = (v: number) => (v > 0 ? C.buy : v < 0 ? C.sell : undefined);

export function Mt5Badge({ size = 20 }: { size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: Math.round(size / 4), background: "linear-gradient(135deg, #1f8f4e, #2f6fd6)", color: "#fff",
      fontSize: Math.round(size * 0.36), fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", letterSpacing: -0.3, flex: "none" }}>MT5</span>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 90 }}>
      <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Table<T>({ cols, rows, empty, rowKey }: { cols: { label: string; render: (r: T) => React.ReactNode; align?: "right" }[]; rows: T[]; empty: React.ReactNode; rowKey: (r: T) => React.Key }) {
  if (!rows.length) return <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted }}>{empty}</div>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
      <thead>
        <tr>{cols.map(c => <th key={c.label} style={{ textAlign: c.align || "left", fontWeight: 400, color: C.muted, fontSize: 12, padding: "6px 12px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={rowKey(r)} data-name="mt5-row">
            {cols.map(c => <td key={c.label} style={{ textAlign: c.align || "left", padding: "7px 12px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{c.render(r)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Side = ({ side }: { side: string }) => <span style={{ color: side.startsWith("buy") ? C.buy : side.startsWith("sell") ? C.sell : undefined, fontWeight: 600, textTransform: "capitalize" }}>{side}</span>;

export const smallBtn: React.CSSProperties = { height: 24, padding: "0 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.text, cursor: "pointer", fontSize: 12, fontFamily: "inherit" };

export default function Mt5Panel() {
  const { live, linked, error } = useBroker();
  const [tab, setTab] = useState<Tab>("positions");
  const [editing, setEditing] = useState<{ kind: "position" | "order"; ticket: number; symbol: string; price?: number; sl: number | null; tp: number | null } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const real = (live?.account.mode || linked?.mode) === "real";
  // On a real-money account each change is confirmed first
  const confirmed = (what: string) => !real || window.confirm(`Real-money account: ${what}?`);
  const run = async (what: string, f: () => Promise<unknown>) => {
    setNotice(null);
    try { await f(); setNotice({ ok: true, text: what }); }
    catch (e: any) { setNotice({ ok: false, text: e?.message || "The broker didn't accept it" }); }
  };
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(t); }, [notice]);
  const newOrder = () => tradingUi.set({ dialog: { kind: "mt5order", side: "buy", symbol: (window as any).__chartSymbol || "XAU/USD", type: "market" } });
  const a = live?.account;
  const cur = a?.currency || linked?.currency || "";
  const money = (v: number) => `${num(v)} ${cur}`.trim();
  const algo = useAlgo();
  const counts: Record<Tab, number> = { positions: live?.positions.length || 0, orders: live?.orders.length || 0, deals: live?.deals.length || 0, algo: algo.strategies.filter(s => s.enabled).length };

  return (
    <div data-name="mt5-panel" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: C.panel, color: C.text, fontSize: 13, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 12px 6px 16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Mt5Badge size={28} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, whiteSpace: "nowrap" }} data-name="mt5-account-title">
              {linked?.login} · {linked?.server}
              <span data-name="mt5-mode" style={{ marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4, fontWeight: 600, textTransform: "uppercase",
                background: (a?.mode || linked?.mode) === "real" ? "rgba(242,54,69,0.12)" : "rgba(41,98,255,0.12)", color: (a?.mode || linked?.mode) === "real" ? C.sell : C.accent }}>
                {(a?.mode || linked?.mode) === "real" ? "Real" : (a?.mode || linked?.mode) === "contest" ? "Contest" : "Demo"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {a?.name || linked?.name}{(a?.company || linked?.company) ? ` · ${a?.company || linked?.company}` : ""}{a?.leverage ? ` · 1:${a.leverage}` : ""}
              {a && !a.trade_allowed ? " · read only (investor password)" : ""}
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {a ? (
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "flex-end" }} data-name="mt5-metrics">
            <Metric label="Balance" value={money(a.balance)} />
            <Metric label="Equity" value={money(a.equity)} />
            <Metric label="Open profit" value={`${a.profit > 0 ? "+" : ""}${money(a.profit)}`} color={pnlColor(a.profit)} />
            <Metric label="Margin" value={money(a.margin)} />
            <Metric label="Free margin" value={money(a.free_margin)} color={a.free_margin < 0 ? C.sell : undefined} />
            <Metric label="Margin level" value={a.margin ? `${num(a.margin_level)}%` : "—"} />
          </div>
        ) : (
          <span style={{ color: C.muted }}>{error ? "" : "Reaching the broker…"}</span>
        )}
      </div>
      {error && <div role="alert" style={{ margin: "0 16px 6px", padding: "6px 10px", borderRadius: 6, background: "rgba(242,54,69,0.1)", color: C.sell, fontSize: 12 }}>{error}</div>}
      {notice && <div role="status" data-name="mt5-notice" style={{ margin: "0 16px 6px", padding: "6px 10px", borderRadius: 6, fontSize: 12,
        background: notice.ok ? "rgba(8,153,129,0.1)" : "rgba(242,54,69,0.1)", color: notice.ok ? "var(--tv-color-live, #089981)" : C.sell }}>{notice.text}</div>}

      <div role="tablist" style={{ display: "flex", gap: 6, padding: "4px 12px 8px 16px" }}>
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-name={`mt5-tab-${t.id}`}
            style={{ height: 28, padding: "0 12px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              background: tab === t.id ? "var(--tv-trade-dark-btn)" : C.subtle, color: tab === t.id ? "var(--tv-trade-dark-btn-text)" : C.text }}>
            {t.label}{counts[t.id] ? <span style={{ opacity: 0.6, marginLeft: 4 }}>{counts[t.id]}</span> : null}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={newOrder} data-name="mt5-new-order" style={{ height: 28, padding: "0 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit",
          fontSize: 13, fontWeight: 600, background: C.accent, color: "#fff" }}>New order</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tab === "positions" && (
          <Table<Mt5Position> rows={live?.positions || []} rowKey={p => p.ticket}
            empty={<>No open positions. <button onClick={newOrder} style={{ ...smallBtn, marginLeft: 6 }}>New order</button></>}
            cols={[
              { label: "Symbol", render: p => <b>{displaySymbol(p.symbol)}</b> },
              { label: "Side", render: p => <Side side={p.side} /> },
              { label: "Volume", render: p => p.volume, align: "right" },
              { label: "Open price", render: p => p.open_price, align: "right" },
              { label: "Price", render: p => p.price, align: "right" },
              { label: "S/L", render: p => priceText(p.sl), align: "right" },
              { label: "T/P", render: p => priceText(p.tp), align: "right" },
              { label: "Swap", render: p => num(p.swap), align: "right" },
              { label: "Profit", render: p => <span style={{ color: pnlColor(p.profit), fontWeight: 600 }}>{p.profit > 0 ? "+" : ""}{num(p.profit)}</span>, align: "right" },
              { label: "Opened", render: p => timeText(p.time) },
              { label: "Ticket", render: p => <span style={{ color: C.muted }}>{p.ticket}</span> },
              { label: "", render: p => (
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <button style={smallBtn} data-name="mt5-edit-stops" onClick={() => setEditing({ kind: "position", ticket: p.ticket, symbol: p.symbol, sl: p.sl, tp: p.tp })}>S/L · T/P</button>
                  <button style={{ ...smallBtn, color: C.sell, borderColor: C.sell }} data-name="mt5-close-position"
                    onClick={() => confirmed(`close ${p.side} ${p.volume} ${p.symbol}`) && run(`Closed ${p.volume} ${displaySymbol(p.symbol)}`, () => closeMt5Position(p.ticket, real))}>Close</button>
                </span>
              ) },
            ]} />
        )}
        {tab === "orders" && (
          <Table<Mt5Order> rows={live?.orders || []} rowKey={o => o.ticket} empty="No pending orders"
            cols={[
              { label: "Symbol", render: o => <b>{displaySymbol(o.symbol)}</b> },
              { label: "Type", render: o => <Side side={o.type} /> },
              { label: "Volume", render: o => o.volume, align: "right" },
              { label: "Price", render: o => o.price, align: "right" },
              { label: "S/L", render: o => priceText(o.sl), align: "right" },
              { label: "T/P", render: o => priceText(o.tp), align: "right" },
              { label: "Placed", render: o => timeText(o.time) },
              { label: "Ticket", render: o => <span style={{ color: C.muted }}>{o.ticket}</span> },
              { label: "", render: o => (
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <button style={smallBtn} data-name="mt5-edit-order" onClick={() => setEditing({ kind: "order", ticket: o.ticket, symbol: o.symbol, price: o.price, sl: o.sl, tp: o.tp })}>Modify</button>
                  <button style={{ ...smallBtn, color: C.sell, borderColor: C.sell }} data-name="mt5-cancel-order"
                    onClick={() => confirmed(`cancel the ${o.type} order on ${o.symbol}`) && run(`Cancelled the ${o.type} order`, () => cancelMt5Order(o.ticket, real))}>Cancel</button>
                </span>
              ) },
            ]} />
        )}
        {tab === "deals" && (
          <Table<Mt5Deal> rows={live?.deals || []} rowKey={d => d.ticket} empty="No deals in the last 24 hours"
            cols={[
              { label: "Time", render: d => timeText(d.time) },
              { label: "Symbol", render: d => d.symbol ? <b>{displaySymbol(d.symbol)}</b> : "—" },
              { label: "Type", render: d => <Side side={d.type} /> },
              { label: "Direction", render: d => d.entry || "—" },
              { label: "Volume", render: d => d.volume || "—", align: "right" },
              { label: "Price", render: d => d.price || "—", align: "right" },
              { label: "Commission", render: d => num(d.commission), align: "right" },
              { label: "Profit", render: d => <span style={{ color: pnlColor(d.profit) }}>{num(d.profit)}</span>, align: "right" },
            ]} />
        )}
        {tab === "algo" && <AlgoTab />}
      </div>
      {editing && (
        <EditDialog item={editing} onClose={() => setEditing(null)} onSave={async (price, sl, tp) => {
          if (!confirmed(editing.kind === "position" ? `change the stops of ${editing.symbol}` : `move the order on ${editing.symbol}`)) return;
          setEditing(null);
          await run(editing.kind === "position" ? "Stops changed" : "Order moved",
            () => (editing.kind === "position" ? modifyMt5Position(editing.ticket, sl, tp, real) : modifyMt5Order(editing.ticket, price, sl, tp, real)));
        }} />
      )}
    </div>
  );
}

export const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: 34, padding: "0 10px", borderRadius: 6, border: `1px solid ${C.field}`,
  background: "transparent", color: C.text, fontSize: 14, fontFamily: "inherit", outline: "none" };
export const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: C.muted, margin: "12px 0 5px" };

export function Shell({ title, onClose, children, width = 380, testId }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number; testId?: string }) {
  useEscapeClose(onClose);
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 10050, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div role="dialog" aria-label={typeof title === "string" ? title : "MetaTrader 5"} data-name={testId}
        style={{ width, maxWidth: "calc(100vw - 32px)", background: C.panel, color: C.text, borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", padding: "18px 22px 20px", fontSize: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Mt5Badge size={26} />
          <div style={{ flex: 1, fontSize: 18, fontWeight: 600 }}>{title}</div>
          <button aria-label="Close" onClick={onClose} style={{ border: "none", background: "transparent", color: C.text, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function EditDialog({ item, onClose, onSave }: { item: { kind: "position" | "order"; symbol: string; price?: number; sl: number | null; tp: number | null }; onClose: () => void; onSave: (price: string, sl: string, tp: string) => void }) {
  const [price, setPrice] = useState(item.price != null ? String(item.price) : "");
  const [sl, setSl] = useState(item.sl != null ? String(item.sl) : "");
  const [tp, setTp] = useState(item.tp != null ? String(item.tp) : "");
  return (
    <Shell title={`${item.kind === "position" ? "Stops" : "Modify order"} · ${displaySymbol(item.symbol)}`} onClose={onClose} testId="mt5-edit-dialog">
      {item.kind === "order" && <><label style={labelStyle}>Price</label><input style={field} value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" onKeyDown={e => e.stopPropagation()} /></>}
      <label style={labelStyle}>Stop loss (empty: none)</label>
      <input style={field} value={sl} onChange={e => setSl(e.target.value)} inputMode="decimal" data-name="mt5-edit-sl" onKeyDown={e => e.stopPropagation()} />
      <label style={labelStyle}>Take profit (empty: none)</label>
      <input style={field} value={tp} onChange={e => setTp(e.target.value)} inputMode="decimal" data-name="mt5-edit-tp" onKeyDown={e => e.stopPropagation()} />
      <button onClick={() => onSave(price, sl, tp)} data-name="mt5-edit-save" style={{ width: "100%", height: 40, marginTop: 16, borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Save</button>
    </Shell>
  );
}

// The order form: the broker's symbol with its live bid / ask, Sell / Buy, market / limit / stop,
// lots (the broker's minimum and step), price for a pending order, stop loss, take profit
export function Mt5OrderDialog({ side: initialSide, symbol: initialSymbol, type: initialType = "market", price: initialPrice, onClose }: {
  side: "buy" | "sell"; symbol: string; type?: "market" | "limit" | "stop"; price?: number; onClose: () => void;
}) {
  const { live, linked } = useBroker();
  const [symbol, setSymbol] = useState(initialSymbol.replace("/", ""));
  const [info, setInfo] = useState<Mt5SymbolInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [side, setSide] = useState(initialSide);
  const [type, setType] = useState(initialType);
  const [volume, setVolume] = useState("");
  const [price, setPrice] = useState(initialPrice != null ? String(initialPrice) : "");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [realOk, setRealOk] = useState(false);
  const real = (live?.account.mode || linked?.mode) === "real";

  // The broker's symbol and its prices, refreshed every second while the form is open
  useEffect(() => {
    let alive = true;
    const load = () => mt5Symbol(symbol).then(d => {
      if (!alive) return;
      setInfo(d);
      setInfoError(null);
      setVolume(v => v || String(d.volume_min));
    }).catch(e => { if (alive) { setInfo(null); setInfoError(e?.message || "Unknown symbol"); } });
    const t0 = setTimeout(load, 250);
    const t = setInterval(load, 1000);
    return () => { alive = false; clearTimeout(t0); clearInterval(t); };
  }, [symbol]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await placeMt5Order({ symbol: info?.symbol || symbol, side, type, volume, price: type === "market" ? undefined : price, sl, tp, confirm_real: real ? realOk : undefined });
      setDone(`${r.message}: ${side} ${r.volume} ${r.symbol}${type === "market" ? ` at ${r.price}` : ` ${type} at ${price}`} (#${r.order})`);
      setTimeout(onClose, 1600);
    } catch (e: any) {
      setError(e?.message || "The broker didn't accept the order");
    } finally {
      setBusy(false);
    }
  };
  const digits = info?.digits ?? 5;
  const priceBtn = (s: "sell" | "buy") => {
    const on = side === s;
    const color = s === "buy" ? C.buy : C.sell;
    const px = s === "buy" ? info?.ask : info?.bid;
    return (
      <button type="button" onClick={() => setSide(s)} data-name={`mt5-side-${s}`} aria-pressed={on}
        style={{ flex: 1, height: 52, borderRadius: 6, border: `1px solid ${color}`, background: on ? color : "transparent", color: on ? "#fff" : color, cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", fontWeight: 600 }}>{s}</div>
        <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{px != null ? px.toFixed(digits) : "—"}</div>
      </button>
    );
  };
  return (
    <Shell title="New order" onClose={onClose} width={400} testId="mt5-order-dialog">
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
        {linked?.login} · {linked?.server} · <b style={{ color: real ? C.sell : C.accent }}>{real ? "REAL MONEY" : "Demo"}</b>
      </div>
      <label style={labelStyle}>Symbol</label>
      <input style={field} value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} data-name="mt5-order-symbol" onKeyDown={e => e.stopPropagation()} />
      <div style={{ fontSize: 12, marginTop: 4, color: infoError ? C.sell : C.muted }} data-name="mt5-order-symbol-info">
        {infoError || (info ? `${info.symbol} at your broker · lots ${info.volume_min}–${info.volume_max}, step ${info.volume_step}` : "Looking it up…")}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>{priceBtn("sell")}{priceBtn("buy")}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {(["market", "limit", "stop"] as const).map(t => (
          <button key={t} type="button" onClick={() => setType(t)} data-name={`mt5-type-${t}`} aria-pressed={type === t}
            style={{ flex: 1, height: 30, borderRadius: 6, border: `1px solid ${type === t ? C.text : C.border}`, background: type === t ? C.subtle : "transparent", color: C.text, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{t}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={labelStyle}>Volume (lots)</label><input style={field} value={volume} onChange={e => setVolume(e.target.value)} inputMode="decimal" data-name="mt5-order-volume" onKeyDown={e => e.stopPropagation()} /></div>
        {type !== "market" && <div style={{ flex: 1 }}><label style={labelStyle}>Price</label><input style={field} value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" data-name="mt5-order-price" onKeyDown={e => e.stopPropagation()} /></div>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={labelStyle}>Stop loss</label><input style={field} value={sl} onChange={e => setSl(e.target.value)} inputMode="decimal" placeholder="optional" data-name="mt5-order-sl" onKeyDown={e => e.stopPropagation()} /></div>
        <div style={{ flex: 1 }}><label style={labelStyle}>Take profit</label><input style={field} value={tp} onChange={e => setTp(e.target.value)} inputMode="decimal" placeholder="optional" data-name="mt5-order-tp" onKeyDown={e => e.stopPropagation()} /></div>
      </div>
      {real && (
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 14, fontSize: 13, color: C.sell, cursor: "pointer" }}>
          <input type="checkbox" checked={realOk} onChange={e => setRealOk(e.target.checked)} data-name="mt5-order-real-ok" />
          This is a real-money account: send this order for real
        </label>
      )}
      {error && <div role="alert" data-name="mt5-order-error" style={{ marginTop: 12, color: C.sell, fontSize: 13 }}>{error}</div>}
      {done && <div role="status" data-name="mt5-order-done" style={{ marginTop: 12, color: "var(--tv-color-live, #089981)", fontSize: 13 }}>{done}</div>}
      <button type="button" onClick={send} disabled={busy || !info || !volume || (type !== "market" && !price) || (real && !realOk) || !!done} data-name="mt5-order-send"
        style={{ width: "100%", height: 44, marginTop: 16, borderRadius: 6, border: "none", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
          background: side === "buy" ? C.buy : C.sell, color: "#fff", cursor: busy ? "progress" : "pointer",
          opacity: busy || !info || !volume || (type !== "market" && !price) || (real && !realOk) ? 0.55 : 1 }}>
        {busy ? "Sending…" : `${side === "buy" ? "Buy" : "Sell"} ${volume || ""} ${info?.symbol || symbol}${type === "market" ? " at market" : ` ${type}`}`}
      </button>
    </Shell>
  );
}
