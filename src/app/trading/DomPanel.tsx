"use client";

// Depth of Market (the docked order panel's DOM tab), after TradingView's: a price ladder one
// tick per row around the last price, Bid size / Ask size columns, your working orders in the
// columns beside them (drag to move, × to cancel), click a bid/ask cell to buy/sell there
// (limit or stop depending on the market), and position, P&L, Flatten, CXL All, Reverse,
// Buy/Sell Mkt at the bottom. The data feed has no order book, so the size columns stay empty
// as TradingView's do for symbols without depth; the best bid and ask rows are marked.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { engine, useEngineState, useTradingUi, tradingUi, openTicket, closeDock } from "./store";
import { activeBook, orderPrice, precisionOf, quoteOf, positionViews, tifExpiry, Order, Side, TimeInForce } from "./engine";
import { useTicketPrefs, ticketPrefs, useTradingSettings } from "./settings";
import { formatPrice, formatQty, formatSignedMoney, roundQty, qtyStepOf } from "./instruments";
import { C, Tip, Popover, MenuItem, MenuDivider, TvLogo, MoreIcon, CloseIcon, HexSettingsIcon, ChevronDown, ChevronUp } from "./ui";
import { DockTabs, HeaderBtn, Checkbox, SelectBox, inputStyle } from "./OrderTicket";

const ROW_H = 20;
const TIFS: TimeInForce[] = ["Day", "Week", "Month", "GTD"];

export default function DomPanel() {
  const state = useEngineState();
  const ui = useTradingUi();
  const prefs = useTicketPrefs();
  const settings = useTradingSettings();
  const symbol = ui.chartSymbol;
  const prec = precisionOf(state, symbol);
  const tick = Math.pow(10, -prec);
  const q = quoteOf(state, symbol);
  const book = activeBook(state);
  const pos = positionViews(state).find(p => p.symbol === symbol);
  const working = book.orders.filter(o => o.symbol === symbol && o.status === "working" && o.type !== "market");
  const oneClick = settings.oneClickTrading;
  const idx = (p: number) => Math.round(p / tick);
  const priceOf = (i: number) => Math.round(i * tick * Math.pow(10, prec)) / Math.pow(10, prec);

  // ---- ladder geometry ----
  const ladderRef = useRef<HTMLDivElement>(null);
  const [ladderH, setLadderH] = useState(400);
  useEffect(() => {
    const el = ladderRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLadderH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rowsCount = Math.max(5, Math.floor(ladderH / ROW_H));
  const [staticCenter, setStaticCenter] = useState<number | null>(null);   // null = dynamic (follows the price)
  const lastIdx = q ? idx(q.last) : null;
  const centerIdx = staticCenter ?? lastIdx;

  // Session range (today's bars) for "Show zero trade volume prices"
  const tradedRange = useMemo(() => {
    try {
      const bars: any[] = (window as any).__chartFullData || [];
      if (!bars.length) return null;
      const day = (t: number) => Math.floor(t / 86400);
      const d = day(bars[bars.length - 1].time);
      let lo = Infinity, hi = -Infinity;
      for (let i = bars.length - 1; i >= 0 && day(bars[i].time) === d; i--) { lo = Math.min(lo, bars[i].low); hi = Math.max(hi, bars[i].high); }
      return isFinite(lo) ? { lo: idx(lo), hi: idx(hi) } : null;
    } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.last, symbol, prec]);

  const orderIdxs = new Set(working.map(o => idx(orderPrice(o)!)));
  const bidIdx = q ? idx(q.bid) : null;
  const askIdx = q ? idx(q.ask) : null;
  const posIdx = pos ? idx(pos.avgPrice) : null;
  const special = (i: number) => i === lastIdx || i === bidIdx || i === askIdx || i === posIdx || orderIdxs.has(i);
  const visible = (i: number) => {
    if (special(i)) return true;
    if (!prefs.domShowInsideSpread && bidIdx !== null && askIdx !== null && i > bidIdx && i < askIdx) return false;
    if (!prefs.domShowZeroVolume && tradedRange && (i < tradedRange.lo || i > tradedRange.hi)) return false;
    return true;
  };
  // Rows outward from the center until the ladder is full (top = highest price)
  const rows: number[] = [];
  if (centerIdx !== null) {
    const up: number[] = [], down: number[] = [];
    const half = Math.floor(rowsCount / 2);
    for (let k = 0, guard = 0; up.length < rowsCount - half && guard < 20000; k++, guard++) if (visible(centerIdx + k)) up.push(centerIdx + k);
    for (let k = 1, guard = 0; down.length < half && guard < 20000; k++, guard++) if (visible(centerIdx - k)) down.push(centerIdx - k);
    rows.push(...up.reverse(), ...down);
  }

  // ---- quantity / time in force ----
  const [qtyText, setQtyText] = useState<string | null>(null);
  const domQty = prefs.qtyBySymbol[symbol] ?? 1;
  const setDomQty = (v: number) => ticketPrefs.set(p => ({ qtyBySymbol: { ...p.qtyBySymbol, [symbol]: v } }));
  const [gtdDate, setGtdDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const expiresAt = () => prefs.domTif === "GTD" ? new Date(`${gtdDate}T23:59:59`).getTime() : tifExpiry(prefs.domTif, Date.now());

  // ---- actions ----
  const typeAt = (side: Side, i: number): "limit" | "stop" => {
    if (bidIdx === null || askIdx === null) return "limit";
    return side === "buy" ? (i < askIdx ? "limit" : "stop") : (i > bidIdx ? "limit" : "stop");
  };
  const orderAt = (side: Side, i: number) => {
    const price = priceOf(i);
    const type = typeAt(side, i);
    if (oneClick) engine.placeOrder({ symbol, side, type, qty: domQty, price, tif: prefs.domTif, expiresAt: expiresAt() });
    else openTicket({ symbol, side, type, price, qty: domQty, tif: prefs.domTif, floating: true });
  };
  const market = (side: Side) => {
    if (oneClick) engine.placeOrder({ symbol, side, type: "market", qty: domQty });
    else openTicket({ symbol, side, type: "market", qty: domQty, floating: true });
  };
  const cancelSide = (side: Side) => { for (const o of working.filter(x => x.side === side)) engine.cancelOrder(o.id); };
  const cancelAll = () => { for (const o of working) engine.cancelOrder(o.id); };

  // Drag an order cell to another row
  const [drag, setDrag] = useState<{ ids: string[]; side: Side; target: number | null } | null>(null);
  const rowAt = (clientY: number): number | null => {
    const r = ladderRef.current?.getBoundingClientRect();
    if (!r) return null;
    const k = Math.floor((clientY - r.top) / ROW_H);
    return rows[k] ?? null;
  };
  const startDrag = (e: React.MouseEvent, ids: string[], side: Side) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const sy = e.clientY;
    let moved = false;
    let target: number | null = null;
    const move = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientY - sy) < 4) return;
      moved = true;
      target = rowAt(ev.clientY);
      setDrag({ ids, side, target });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDrag(null);
      if (moved && target !== null) for (const id of ids) engine.modifyOrder(id, { price: priceOf(target) });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const [hover, setHover] = useState<{ i: number; side: Side } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);

  const totals = { buy: working.filter(o => o.side === "buy").reduce((s, o) => s + o.qty, 0), sell: working.filter(o => o.side === "sell").reduce((s, o) => s + o.qty, 0) };
  const cols = "44px 1fr 1.25fr 1fr 44px";
  const grid = "1px solid var(--tv-color-border)";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: C.panel, color: C.text, fontSize: 13 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 8px 16px" }}>
        <TvLogo size={24} />
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{symbol}</span>
        <HeaderBtn btnRef={moreRef} active={menu} onClick={() => setMenu(m => !m)} label="DOM settings"><MoreIcon /></HeaderBtn>
        <HeaderBtn onClick={closeDock} label="Close"><CloseIcon size={20} /></HeaderBtn>
      </div>
      <DockTabs tab="dom" />

      {/* Column titles */}
      <div style={{ display: "grid", gridTemplateColumns: cols, padding: "0 12px", fontSize: 12, color: C.muted, height: 22, alignItems: "center" }}>
        <span /><span style={{ textAlign: "center" }}>Bid size</span><span /><span style={{ textAlign: "center" }}>Ask size</span><span />
      </div>

      {/* Ladder */}
      <div
        ref={ladderRef}
        onWheel={e => {
          if (centerIdx === null) return;
          setStaticCenter(centerIdx + (e.deltaY > 0 ? -3 : 3));
        }}
        style={{ flex: 1, minHeight: 100, overflow: "hidden", padding: "0 12px", userSelect: "none" }}
        role="grid"
        aria-label="Depth of market"
      >
        {!q && <div style={{ padding: 24, textAlign: "center", color: C.muted }}>No quotes for {symbol} yet</div>}
        {rows.map(i => {
          const price = priceOf(i);
          const buys = working.filter(o => o.side === "buy" && idx(orderPrice(o)!) === i);
          const sells = working.filter(o => o.side === "sell" && idx(orderPrice(o)!) === i);
          const isLast = i === lastIdx;
          const dropHere = drag?.target === i;
          const cell = (side: Side) => {
            const hovered = hover?.i === i && hover.side === side;
            const color = side === "buy" ? C.buy : C.sell;
            const best = side === "buy" ? i === bidIdx : i === askIdx;
            return (
              <div
                role="gridcell"
                aria-label={`${side === "buy" ? "Buy" : "Sell"} at ${formatPrice(price, prec)}`}
                onMouseEnter={() => setHover({ i, side })}
                onMouseLeave={() => setHover(h => (h && h.i === i && h.side === side ? null : h))}
                onClick={() => orderAt(side, i)}
                style={{
                  borderLeft: side === "buy" ? grid : "none", borderRight: grid, borderBottom: grid, cursor: "pointer",
                  background: best ? (side === "buy" ? "rgba(41,98,255,0.12)" : "rgba(242,54,69,0.12)") : "transparent",
                  outline: hovered ? `1px dashed ${color}` : "none", outlineOffset: -1,
                }}
              />
            );
          };
          const orderCell = (side: Side, list: Order[]) => {
            const color = side === "buy" ? C.buy : C.sell;
            const soft = side === "buy" ? "var(--tv-trade-buy-soft)" : "var(--tv-trade-sell-soft)";
            if (list.length) {
              const qty = list.reduce((s, o) => s + o.qty, 0);
              const kind = list.every(o => o.role === "tp") ? "TP" : list.every(o => o.role === "sl") ? "SL" : list[0].type === "limit" ? "LMT" : "STP";
              const dragging = drag && list.some(o => drag.ids.includes(o.id));
              return (
                <Tip text={`${side === "buy" ? "Buy" : "Sell"} ${formatQty(qty)} ${kind === "TP" ? "take profit" : kind === "SL" ? "stop loss" : kind === "LMT" ? "limit" : "stop"} @ ${formatPrice(price, prec)} · drag to move`} block>
                  <div onMouseDown={e => startDrag(e, list.map(o => o.id), side)} style={{
                    height: ROW_H - 2, margin: "1px 2px", borderRadius: 3, background: color, color: "#fff", fontSize: 11, display: "flex", alignItems: "center",
                    justifyContent: "space-between", padding: "0 3px", cursor: "ns-resize", opacity: dragging ? 0.5 : 1, gap: 2,
                  }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{formatQty(qty)}</span>
                    <span role="button" aria-label="Cancel" onMouseDown={e => e.stopPropagation()} onClick={() => list.forEach(o => engine.cancelOrder(o.id))}
                      style={{ fontSize: 11, lineHeight: 1, cursor: "pointer", opacity: 0.9 }}>×</span>
                  </div>
                </Tip>
              );
            }
            if (drag && dropHere && drag.side === side) {
              return <div style={{ height: ROW_H - 2, margin: "1px 2px", borderRadius: 3, border: `1px dashed ${color}` }} />;
            }
            if (hover?.i === i && hover.side === side) {
              return (
                <div style={{ height: ROW_H - 2, margin: "1px 0", background: soft, color: C.text, fontSize: 9, letterSpacing: 0.4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {typeAt(side, i).toUpperCase()}
                </div>
              );
            }
            return <div />;
          };
          return (
            <div key={i} role="row" style={{ display: "grid", gridTemplateColumns: cols, height: ROW_H }}>
              {orderCell("buy", buys)}
              {cell("buy")}
              <div role="gridcell" style={{
                display: "flex", alignItems: "center", justifyContent: "center", borderRight: grid, borderBottom: grid, fontSize: 12, fontVariantNumeric: "tabular-nums",
                background: isLast ? C.seg : i === posIdx ? (pos!.side === "buy" ? "rgba(41,98,255,0.15)" : "rgba(242,54,69,0.15)") : "transparent",
                fontWeight: i === posIdx ? 600 : 400, color: i === posIdx ? (pos!.side === "buy" ? C.buy : C.sell) : C.text,
              }}>{formatPrice(price, prec)}</div>
              {cell("sell")}
              {orderCell("sell", sells)}
            </div>
          );
        })}
      </div>

      {/* Totals, position, actions */}
      <div style={{ padding: "8px 12px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 32px 1fr 24px", alignItems: "center", gap: 8 }}>
          <Tip text="Cancel all buy orders"><XBtn disabled={totals.buy === 0} onClick={() => cancelSide("buy")} /></Tip>
          <Tip text="Total buy quantity" block>
            <div style={{ height: 20, background: "var(--tv-trade-buy-soft)", color: C.buy, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{totals.buy ? formatQty(totals.buy) : "-"}</div>
          </Tip>
          <Tip text={staticCenter === null ? "Disable dynamic mode" : "Enable dynamic mode"}>
            <button type="button" aria-label={staticCenter === null ? "Disable dynamic mode" : "Enable dynamic mode"} onClick={() => setStaticCenter(c => (c === null ? centerIdx : null))} style={{
              width: 28, height: 28, border: "none", borderRadius: 6, background: "transparent", color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
                <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
                {staticCenter === null ? <path d="M7 9V6.5a3 3 0 0 1 5.8-1.1" /> : <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />}
                <circle cx="10" cy="13" r="1" fill="currentColor" />
              </svg>
            </button>
          </Tip>
          <Tip text="Total sell quantity" block>
            <div style={{ height: 20, background: "var(--tv-trade-sell-soft)", color: C.sell, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{totals.sell ? formatQty(totals.sell) : "-"}</div>
          </Tip>
          <Tip text="Cancel all sell orders"><XBtn disabled={totals.sell === 0} onClick={() => cancelSide("sell")} /></Tip>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
          <Tip text="Position" block>
            <Box color={pos ? (pos.side === "buy" ? C.buy : C.sell) : C.text}>{pos ? `${pos.side === "sell" ? "−" : ""}${formatQty(pos.qty)}` : "—"}</Box>
          </Tip>
          <Tip text="Profit/Loss" block>
            <Box color={pos ? (pos.pnl >= 0 ? C.tp : C.sell) : C.text}>{pos ? formatSignedMoney(pos.pnl) : "—"}</Box>
          </Tip>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
          <Tip text="Close the position" block>
            <OutlineBtn disabled={!pos} onClick={() => { if (oneClick) engine.closePosition(symbol); else tradingUi.set({ dialog: { kind: "close", symbol } }); }}>Flatten</OutlineBtn>
          </Tip>
          <Tip text="Cancel all orders for the current symbol" block>
            <OutlineBtn disabled={working.length === 0} onClick={cancelAll}>CXL All</OutlineBtn>
          </Tip>
          <Tip text="Reverse the position" block>
            <OutlineBtn disabled={!pos} onClick={() => { if (oneClick) engine.reversePosition(symbol); else tradingUi.set({ dialog: { kind: "reverse", symbol } }); }}>Reverse</OutlineBtn>
          </Tip>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 1fr", gap: 6, marginTop: 12 }}>
          <MktBtn side="buy" onClick={() => market("buy")} />
          <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.field}`, borderRadius: 6, padding: "0 8px", height: 32 }}>
            <input aria-label="DOM quantity" value={qtyText ?? formatQty(domQty)} onFocus={e => e.target.select()}
              onChange={e => { const t = e.target.value.replace(/[^0-9.]/g, ""); setQtyText(t); const v = roundQty(parseFloat(t) || 0, symbol); if (v >= qtyStepOf(symbol)) setDomQty(v); }}
              onBlur={() => setQtyText(null)} style={{ ...inputStyle, fontSize: 13 }} />
          </div>
          <MktBtn side="sell" onClick={() => market("sell")} />
        </div>
      </div>

      {/* Details: time in force for orders placed from the DOM */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12 }}>
        <button type="button" onClick={() => ticketPrefs.set(p => ({ domDetailsOpen: !p.domDetailsOpen }))} style={{
          display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", border: "none", background: "transparent", cursor: "pointer",
          padding: "10px 16px", color: C.muted, fontSize: 11, letterSpacing: 0.4,
        }}>
          <span>DETAILS <span style={{ color: C.faint }}>{prefs.domTif.toUpperCase()}</span></span>
          {prefs.domDetailsOpen ? <ChevronUp /> : <ChevronDown />}
        </button>
        {prefs.domDetailsOpen && (
          <div style={{ padding: "0 16px 14px" }}>
            <div style={{ color: C.muted, fontSize: 14, marginBottom: 6 }}>Time in force</div>
            <SelectBox value={prefs.domTif} options={TIFS} onChange={v => ticketPrefs.set({ domTif: v as TimeInForce })} />
            {prefs.domTif === "GTD" && (
              <input type="date" aria-label="Good till date" value={gtdDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setGtdDate(e.target.value)}
                style={{ ...inputStyle, marginTop: 8, height: 34, border: `1px solid ${C.field}`, borderRadius: 6, padding: "0 10px", width: "100%", boxSizing: "border-box", colorScheme: "light dark" }} />
            )}
          </div>
        )}
      </div>

      <Popover anchor={moreRef.current} open={menu} onClose={() => setMenu(false)} align="right" width={290}>
        <div style={{ padding: "4px 16px 6px", fontSize: 11, color: C.muted, letterSpacing: 0.4 }}>DOM PANEL SETTINGS</div>
        <MenuItem icon={<Checkbox checked={prefs.domShowZeroVolume} />} onClick={() => ticketPrefs.set(p => ({ domShowZeroVolume: !p.domShowZeroVolume }))}>Show zero trade volume prices</MenuItem>
        <MenuItem icon={<Checkbox checked={prefs.domShowInsideSpread} />} onClick={() => ticketPrefs.set(p => ({ domShowInsideSpread: !p.domShowInsideSpread }))}>Show prices between the best bid/ask</MenuItem>
        <MenuDivider />
        <MenuItem icon={<HexSettingsIcon />} onClick={() => { setMenu(false); window.dispatchEvent(new CustomEvent("tv:open-chart-settings", { detail: { tab: "trading" } })); }}>Trading settings…</MenuItem>
      </Popover>
    </div>
  );
}

function XBtn({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label="Cancel orders" disabled={disabled} onClick={onClick} style={{
      width: 24, height: 24, border: "none", background: "transparent", cursor: disabled ? "default" : "pointer", color: disabled ? C.faint : C.text,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
    }}><CloseIcon size={14} /></button>
  );
}

const Box = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <div style={{ height: 30, borderRadius: 6, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color, fontVariantNumeric: "tabular-nums" }}>{children}</div>
);

function OutlineBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" disabled={disabled} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      width: "100%", height: 30, borderRadius: 6, border: `1px solid ${C.border}`, background: hover && !disabled ? C.hover : "transparent",
      color: disabled ? C.faint : C.text, fontSize: 13, cursor: disabled ? "default" : "pointer",
    }}>{children}</button>
  );
}

function MktBtn({ side, onClick }: { side: Side; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const base = side === "buy" ? "var(--tv-trade-buy)" : "var(--tv-trade-sell)";
  const hov = side === "buy" ? "var(--tv-trade-buy-hover)" : "var(--tv-trade-sell-hover)";
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      height: 32, borderRadius: 6, border: "none", background: hover ? hov : base, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
    }}>{side === "buy" ? "Buy Mkt" : "Sell Mkt"}</button>
  );
}
