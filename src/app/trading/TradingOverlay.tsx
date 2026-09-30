"use client";

// Positions, exits (TP/SL), working orders and projected orders drawn on the chart the way
// TradingView does: a price line with a label box and axis tag, buttons to reverse, add
// TP/SL, close or cancel, and dragging to move an order or exit (confirmed with
// Discard/Confirm unless one-click trading is on). Also the "+" button on the price axis.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi } from "lightweight-charts";
import { useEscapeClose } from "../lib/useEscapeClose";
import {
  engine, useEngineState, useTradingUi, tradingUi, openTicket, closeTicket, sendChartProject, projectChartOrder,
  orderTypeAt, lastQtyFor, PendingEdit, ProjectOrder,
} from "./store";
import { activeBook, orderPrice, precisionOf, quoteOf, positionViews, Order, PositionView, Side, isValidExit } from "./engine";
import { useTradingSettings, TradingSettings, PnlMode } from "./settings";
import { formatPrice, formatQty, formatSignedMoney, roundToTick } from "./instruments";
import { C, Tip, Popover, MenuItem, MenuDivider } from "./ui";

const BUY = "#2962ff";
const SELL = "#f23645";
const TP = "#089981";
const SL = "#ff9800";
const BOX_H = 20;
const RIGHT_GAP = 64;     // label boxes sit this far left of the price axis
const HANDLE_GAP = 26;

interface Props {
  chart: IChartApi;
  series: any;
  symbol: string;
  width: number;
  height: number;
  plusButton: boolean;
}

interface DragState {
  key: string;             // what is being dragged
  price: number;
  apply: (price: number) => void;
  fill?: { from: number; color: string };
}

export default function TradingOverlay({ chart, series, symbol, width, height, plusButton }: Props) {
  const state = useEngineState();
  const ui = useTradingUi();
  const settings = useTradingSettings();
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick(t => (t + 1) % 1e9), []);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Stay pinned to the chart as it scrolls, zooms and rescales
  useEffect(() => {
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(bump);
    window.addEventListener("tv-price-scale-changed", bump);
    window.addEventListener("tv:live-price", bump);
    const el = chart.chartElement?.();
    const onUp = () => requestAnimationFrame(bump);
    el?.addEventListener("pointerup", onUp);
    el?.addEventListener("wheel", onUp, { passive: true });
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(bump);
      window.removeEventListener("tv-price-scale-changed", bump);
      window.removeEventListener("tv:live-price", bump);
      el?.removeEventListener("pointerup", onUp);
      el?.removeEventListener("wheel", onUp);
    };
  }, [chart, bump]);

  // Esc discards a pending chart edit
  useEscapeClose(() => tradingUi.set({ pending: null }), !!ui.pending);

  let scaleWidth = 0, timeHeight = 0;
  try { scaleWidth = chart.priceScale("right").width(); timeHeight = chart.timeScale().height(); } catch { /* chart disposed */ }
  const paneW = Math.max(0, width - scaleWidth);
  const paneH = Math.max(0, height - timeHeight);
  const prec = precisionOf(state, symbol);
  const tick = Math.pow(10, -prec);
  const yOf = (price: number): number | null => {
    try {
      const y = series.priceToCoordinate(price);
      return y === null || y === undefined || !isFinite(y) ? null : y;
    } catch { return null; }
  };
  const priceAt = (clientY: number): number | null => {
    const rect = chart.chartElement?.()?.getBoundingClientRect();
    if (!rect) return null;
    try {
      const p = series.coordinateToPrice(clientY - rect.top);
      return p === null || !isFinite(p) ? null : roundToTick(p, prec);
    } catch { return null; }
  };

  const startDrag = (e: React.MouseEvent, key: string, initial: number, apply: (price: number) => void, fill?: { from: number; color: string }) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let moved = false;
    let current = initial;
    const sy = e.clientY;
    const move = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientY - sy) < 3) return;
      moved = true;
      const p = priceAt(ev.clientY);
      if (p !== null && p > 0) { current = p; setDrag({ key, price: p, apply, fill }); }
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDrag(null);
      if (moved) apply(current);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const book = activeBook(state);
  const q = quoteOf(state, symbol);
  const positions = positionViews(state).filter(p => p.symbol === symbol);
  const pos = positions[0];
  const workingEntries = book.orders.filter(o => o.symbol === symbol && o.role === "entry" && o.status === "working" && o.type !== "market");
  const pending = ui.pending && ui.pending.symbol === symbol ? ui.pending : null;
  const project = ui.project && ui.project.symbol === symbol ? ui.project : null;
  const oneClick = settings.oneClickTrading;
  const show = settings.positionsAndOrders && state.connected;

  // An exit moved or added on the position: straight away with one-click trading, else pending
  const commitExit = (edit: PendingEdit) => {
    if (oneClick) applyPending(edit);
    else tradingUi.set({ pending: edit });
  };

  const pnlText = (mode: PnlMode, money: number, ticks: number, pct: number) =>
    mode === "Money" ? `${formatSignedMoney(money)} USD` : mode === "Ticks" ? `${ticks > 0 ? "+" : ticks < 0 ? "−" : ""}${Math.abs(ticks)} ticks` : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(2)}%`;

  const items: React.ReactNode[] = [];
  const axisTags: React.ReactNode[] = [];
  const handles: React.ReactNode[] = [];
  const fills: React.ReactNode[] = [];

  const lineAt = (key: string, y: number, color: string, dashed: boolean, faded: boolean) => (
    <div key={`line-${key}`} style={{
      position: "absolute", top: Math.round(y), height: 0, borderTop: `1px ${dashed ? "dashed" : "solid"} ${color}`, opacity: faded ? 0.55 : 1,
      left: settings.extendedPriceLines ? 0 : settings.alignment === "Right" ? Math.max(0, paneW - RIGHT_GAP - 360) : 0,
      width: settings.extendedPriceLines ? paneW : 360 + RIGHT_GAP, pointerEvents: "none",
    }} />
  );
  const axisTag = (key: string, y: number, price: number, color: string, filled: boolean, dashed = false, faded = false) => (
    <div key={`tag-${key}`} style={{
      position: "absolute", left: paneW, top: Math.round(y) - BOX_H / 2 + 1, width: scaleWidth, height: BOX_H - 2, boxSizing: "border-box",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, borderRadius: 2,
      background: filled ? color : "var(--tv-trade-line-box-bg)", color: filled ? "#fff" : color,
      border: `1px ${dashed ? "dashed" : "solid"} ${color}`, opacity: faded ? 0.6 : 1, pointerEvents: "none", zIndex: 2,
    }}>{formatPrice(price, prec)}</div>
  );
  const handle = (key: string, y: number, color: string, onDown?: (e: React.MouseEvent) => void) => (
    <div key={`h-${key}`} data-handle={key} onMouseDown={onDown} style={{
      position: "absolute", left: paneW - HANDLE_GAP - 5, top: Math.round(y) - 5, width: 10, height: 10, borderRadius: "50%", boxSizing: "border-box",
      border: `1.5px solid ${color}`, background: "var(--tv-trade-line-box-bg)", pointerEvents: onDown ? "auto" : "none", cursor: onDown ? "ns-resize" : "default",
    }} />
  );
  const roleOf = (key: string) => key === "pos" ? "position" : key.startsWith("ex-") ? "exit" : key.startsWith("ob-") ? "order-exit" : key.startsWith("o-") ? "order" : key === "proj" ? "project" : key.startsWith("proj-") ? `project-${key.slice(5)}` : key;
  const row = (key: string, y: number, children: React.ReactNode, faded = false) => (
    <div key={`row-${key}`} data-role={roleOf(key)} data-key={key} style={{
      position: "absolute", top: Math.round(y) - BOX_H / 2, height: BOX_H, display: "flex", alignItems: "center", gap: 6,
      ...(settings.alignment === "Right" ? { right: scaleWidth + RIGHT_GAP } : { left: RIGHT_GAP }),
      opacity: faded ? 0.6 : 1, pointerEvents: "auto", whiteSpace: "nowrap", zIndex: 1,
    }}>{children}</div>
  );

  if (show && pos) {
    const color = pos.side === "buy" ? BUY : SELL;
    const y = yOf(pos.avgPrice);
    const singleLevel = pos.tpOrders.length <= 1 && pos.slOrders.length <= 1;
    const exitRef = q ? (pos.side === "buy" ? q.bid : q.ask) : pos.last;

    // Exits: pending moves replace the moved order's line
    const exits: { key: string; role: "tp" | "sl"; order?: Order; price: number; qty: number; faded: boolean }[] = [];
    for (const o of [...pos.tpOrders, ...pos.slOrders]) {
      if (pending?.kind === "exit" && pending.orderId === o.id) continue;
      if (drag?.key === `exit-${o.id}`) continue;
      exits.push({ key: o.id, role: o.role as "tp" | "sl", order: o, price: orderPrice(o)!, qty: o.qty, faded: false });
    }
    if (pending?.kind === "exit") {
      const existing = pending.orderId ? [...pos.tpOrders, ...pos.slOrders].find(o => o.id === pending.orderId) : undefined;
      exits.push({ key: `pending`, role: pending.role!, order: existing, price: pending.price, qty: existing?.qty ?? pos.qty, faded: true });
    }
    if (drag && drag.key.startsWith("exit-")) {
      const id = drag.key.slice(5);
      const existing = [...pos.tpOrders, ...pos.slOrders].find(o => o.id === id);
      const role = (existing?.role ?? (id === "new-tp" ? "tp" : "sl")) as "tp" | "sl";
      exits.push({ key: "drag", role, order: existing, price: drag.price, qty: existing?.qty ?? pos.qty, faded: true });
    }

    for (const ex of exits) {
      const ey = yOf(ex.price);
      if (ey === null) continue;
      const ecolor = ex.role === "tp" ? TP : SL;
      const money = (ex.price - pos.avgPrice) * ex.qty * (pos.side === "buy" ? 1 : -1);
      const ticks = Math.round(((ex.price - pos.avgPrice) * (pos.side === "buy" ? 1 : -1)) / tick);
      const pct = ((ex.price - pos.avgPrice) / pos.avgPrice) * 100 * (pos.side === "buy" ? 1 : -1);
      items.push(lineAt(`ex-${ex.key}`, ey, ecolor, ex.faded, ex.faded));
      axisTags.push(axisTag(`ex-${ex.key}`, ey, ex.price, ecolor, false, ex.faded, ex.faded));
      const order = ex.order;
      const onDown = order && !ex.faded ? (e: React.MouseEvent) => startDrag(e, `exit-${order.id}`, ex.price,
        p => {
          if (!isValidExit(pos.side, ex.role, p, exitRef)) return;
          commitExit({ symbol, kind: "exit", orderId: order.id, role: ex.role, price: p });
        },
        { from: pos.avgPrice, color: ecolor }) : undefined;
      handles.push(handle(`ex-${ex.key}`, ey, ecolor, onDown));
      items.push(row(`ex-${ex.key}`, ey, (
        <LineBox color={ecolor} dashed={ex.faded} onMouseDown={onDown}>
          <Seg color={ecolor}>{formatQty(ex.qty)}</Seg>
          {settings.pnlValue && settings.pnlBrackets && (
            <Tip text={<>{ex.role === "tp" ? "Take profit" : "Stop loss"} {pct >= 0 ? "+" : "−"}{Math.abs(pct).toFixed(2)}% {ticks} ticks<br />Price {formatPrice(ex.price, prec)}</>}>
              <Seg color={ecolor} divider>{pnlText(settings.pnlBracketsMode, money, ticks, pct)}</Seg>
            </Tip>
          )}
          {order && !ex.faded && (
            <Tip text={ex.role === "tp" ? "Cancel take profit" : "Cancel stop loss"}>
              <XSeg color={ecolor} onClick={() => engine.cancelOrder(order.id)} />
            </Tip>
          )}
        </LineBox>
      ), ex.faded));
      if (y !== null) {
        const top = Math.min(y, ey), h = Math.abs(ey - y);
        handles.push(<div key={`conn-${ex.key}`} style={{ position: "absolute", left: paneW - HANDLE_GAP, top, height: h, borderLeft: `1px solid ${ecolor}`, pointerEvents: "none" }} />);
      }
    }

    if (y !== null) {
      items.push(lineAt("pos", y, color, false, false));
      axisTags.push(axisTag("pos", y, pos.avgPrice, color, true));
      handles.push(handle("pos", y, color));
      const pnlTicks = Math.round(((pos.last - pos.avgPrice) * (pos.side === "buy" ? 1 : -1)) / tick);
      items.push(row("pos", y, (
        <>
          {settings.reversePositionButton && (
            <Tip text="Reverse Position">
              <SmallBtn color={color} onClick={() => {
                if (oneClick) engine.reversePosition(symbol);
                else tradingUi.set({ dialog: { kind: "reverse", symbol } });
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4.5 2v10M2 4.5L4.5 2 7 4.5M9.5 12V2M7 9.5L9.5 12 12 9.5" /></svg>
              </SmallBtn>
            </Tip>
          )}
          {pending && pending.kind === "exit" && (
            <span style={{ display: "flex", gap: 0 }}>
              <PlainBtn onClick={() => tradingUi.set({ pending: null })}>Discard</PlainBtn>
              <PlainBtn primary color={BUY} onClick={() => { applyPending(pending); }}>Confirm</PlainBtn>
            </span>
          )}
          {singleLevel && (
            <span style={{ display: "flex" }}>
              <Tip text="Drag to add take profit">
                <DashBtn color={TP} onMouseDown={e => startDrag(e, pos.tpOrders[0] ? `exit-${pos.tpOrders[0].id}` : "exit-new-tp", pos.avgPrice,
                  p => { if (isValidExit(pos.side, "tp", p, exitRef)) commitExit({ symbol, kind: "exit", orderId: pos.tpOrders[0]?.id, role: "tp", price: p }); },
                  { from: pos.avgPrice, color: TP })}>TP</DashBtn>
              </Tip>
              <Tip text="Drag to add stop loss">
                <DashBtn color={SL} onMouseDown={e => startDrag(e, pos.slOrders[0] ? `exit-${pos.slOrders[0].id}` : "exit-new-sl", pos.avgPrice,
                  p => { if (isValidExit(pos.side, "sl", p, exitRef)) commitExit({ symbol, kind: "exit", orderId: pos.slOrders[0]?.id, role: "sl", price: p }); },
                  { from: pos.avgPrice, color: SL })}>SL</DashBtn>
              </Tip>
            </span>
          )}
          <LineBox color={color}>
            <Tip text="Protect position">
              <Seg color="#fff" bg={color} onClick={() => tradingUi.set({ dialog: { kind: "position", symbol } })}>
                {pos.side === "sell" ? "−" : ""}{formatQty(pos.qty)}
              </Seg>
            </Tip>
            {settings.pnlValue && settings.pnlPositions && (
              <Tip text={<>Unrealized P&amp;L {pos.pnlPct >= 0 ? "+" : "−"}{Math.abs(pos.pnlPct).toFixed(2)}% {pnlTicks} ticks<br />Avg price {formatPrice(pos.avgPrice, prec)}</>}>
                <Seg color={pos.pnl >= 0 ? TP : SELL} divider>{pnlText(settings.pnlPositionsMode, pos.pnl, pnlTicks, pos.pnlPct)}</Seg>
              </Tip>
            )}
            <Tip text="Close Position">
              <XSeg color={color} onClick={() => {
                if (oneClick) engine.closePosition(symbol);
                else tradingUi.set({ dialog: { kind: "close", symbol } });
              }} />
            </Tip>
          </LineBox>
        </>
      )));
    }
  }

  // Working entry orders (and their exits waiting for the fill)
  if (show) {
    for (const o of workingEntries) {
      const moving = pending?.kind === "order" && pending.orderId === o.id ? pending.price : drag?.key === `order-${o.id}` ? drag.price : null;
      const price = moving ?? orderPrice(o)!;
      const y = yOf(price);
      if (y === null) continue;
      const color = o.side === "buy" ? BUY : SELL;
      const faded = moving !== null;
      items.push(lineAt(`o-${o.id}`, y, color, true, faded));
      axisTags.push(axisTag(`o-${o.id}`, y, price, color, false, false, faded));
      const onDown = (e: React.MouseEvent) => startDrag(e, `order-${o.id}`, price, p => {
        if (oneClick) engine.modifyOrder(o.id, { price: p });
        else tradingUi.set({ pending: { symbol, kind: "order", orderId: o.id, price: p } });
      });
      handles.push(handle(`o-${o.id}`, y, color, onDown));
      const isPending = pending?.kind === "order" && pending.orderId === o.id;
      items.push(row(`o-${o.id}`, y, (
        <>
          {isPending && (
            <span style={{ display: "flex" }}>
              <PlainBtn onClick={() => tradingUi.set({ pending: null })}>Discard</PlainBtn>
              <PlainBtn primary color={BUY} onClick={() => applyPending(pending!)}>Confirm</PlainBtn>
            </span>
          )}
          <LineBox color={color} onMouseDown={onDown}>
            <Tip text="Change order quantity"><Seg color={color} onClick={() => openTicket({ symbol, side: o.side, type: o.type, modifyOrderId: o.id })}>{formatQty(o.qty)}</Seg></Tip>
            <Tip text="Change order type"><Seg color={color} divider onClick={() => openTicket({ symbol, side: o.side, type: o.type, modifyOrderId: o.id })}>{o.type === "limit" ? "Limit" : "Stop"}</Seg></Tip>
            <Tip text="Cancel order"><XSeg color={color} onClick={() => engine.cancelOrder(o.id)} /></Tip>
          </LineBox>
        </>
      ), faded));
      for (const br of book.orders.filter(x => x.parentId === o.id && x.status === "inactive")) {
        const bp = orderPrice(br)!;
        const by = yOf(bp);
        if (by === null) continue;
        const bcolor = br.role === "tp" ? TP : SL;
        const money = (bp - price) * br.qty * (o.side === "buy" ? 1 : -1);
        items.push(lineAt(`ob-${br.id}`, by, bcolor, true, true));
        axisTags.push(axisTag(`ob-${br.id}`, by, bp, bcolor, false, true, true));
        items.push(row(`ob-${br.id}`, by, (
          <LineBox color={bcolor} dashed>
            <Seg color={bcolor}>{formatQty(br.qty)}</Seg>
            {settings.pnlValue && settings.pnlBrackets && <Seg color={bcolor} divider>{formatSignedMoney(money)} USD</Seg>}
            <Tip text={br.role === "tp" ? "Cancel take profit" : "Cancel stop loss"}><XSeg color={bcolor} onClick={() => engine.cancelOrder(br.id)} /></Tip>
          </LineBox>
        ), true));
      }
    }
  }

  // Projected order (the open ticket's, or one made from the chart menus)
  if (project && state.connected) {
    const p = project;
    const dragPrice = drag?.key === "project" ? drag.price : null;
    const price = dragPrice ?? p.price;
    const y = yOf(price);
    const color = p.side === "buy" ? BUY : SELL;
    const patch = (fields: { price?: number; tp?: number; sl?: number }) => {
      if (p.source === "ticket") tradingUi.set(prev => ({ projectPatch: { ...fields, nonce: (prev.projectPatch?.nonce ?? 0) + 1 } }));
      else tradingUi.set(prev => ({ project: prev.project ? { ...prev.project, ...fields, type: fields.price !== undefined ? orderTypeAt(symbol, prev.project.side, fields.price) : prev.project.type } : null }));
    };
    if (y !== null) {
      items.push(lineAt("proj", y, color, true, true));
      axisTags.push(axisTag("proj", y, price, color, false, true, true));
      const onDown = (e: React.MouseEvent) => startDrag(e, "project", price, np => patch({ price: np }));
      handles.push(handle("proj", y, color, p.type === "market" ? undefined : onDown));
      items.push(row("proj", y, (
        <>
          {!p.valid && (
            <Tip text="Selected price isn't valid for this order type">
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: SL, color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>
            </Tip>
          )}
          <button type="button" disabled={!p.valid} onClick={() => {
            if (p.source === "chart") sendChartProject();
            else window.dispatchEvent(new CustomEvent("tv:ticket-submit"));
          }} style={{
            height: BOX_H, padding: "0 8px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 600, cursor: p.valid ? "pointer" : "default",
            background: p.valid ? color : "var(--tv-trade-seg-bg)", color: p.valid ? "#fff" : "var(--tv-trade-faint)",
          }}>{p.side === "buy" ? "Buy" : "Sell"}</button>
          <span style={{ display: "flex" }}>
            <Tip text="Drag to add take profit">
              <DashBtn color={TP} onMouseDown={e => startDrag(e, "project-tp", price, np => { if (isValidExit(p.side, "tp", np, price)) patch({ tp: np }); }, { from: price, color: TP })}>TP</DashBtn>
            </Tip>
            <Tip text="Drag to add stop loss">
              <DashBtn color={SL} onMouseDown={e => startDrag(e, "project-sl", price, np => { if (isValidExit(p.side, "sl", np, price)) patch({ sl: np }); }, { from: price, color: SL })}>SL</DashBtn>
            </Tip>
          </span>
          <LineBox color={color} dashed onMouseDown={p.type === "market" ? undefined : onDown}>
            <Tip text="Change order quantity"><Seg color={color} onClick={() => {
              if (p.source === "chart") { tradingUi.set({ project: null }); openTicket({ symbol, side: p.side, type: p.type, price: p.price }); }
            }}>{formatQty(p.qty)}</Seg></Tip>
            <Tip text="Change order type"><Seg color={color} divider onClick={() => {
              if (p.source === "chart" && p.type !== "market") tradingUi.set(prev => ({ project: prev.project ? { ...prev.project, type: prev.project.type === "limit" ? "stop" : "limit" } : null }));
            }}>{p.type === "market" ? "Market" : p.type === "limit" ? "Limit" : "Stop"}</Seg></Tip>
            <Tip text="Cancel project order"><XSeg color={color} onClick={() => {
              if (p.source === "chart") tradingUi.set({ project: null }); else closeTicket();
            }} /></Tip>
          </LineBox>
        </>
      ), false));
    }
    for (const role of ["tp", "sl"] as const) {
      const dragKey = `project-${role}`;
      const lp = drag?.key === dragKey ? drag.price : p[role];
      if (lp === undefined) continue;
      const ly = yOf(lp);
      if (ly === null) continue;
      const lcolor = role === "tp" ? TP : SL;
      const money = (lp - price) * p.qty * (p.side === "buy" ? 1 : -1);
      items.push(lineAt(`proj-${role}`, ly, lcolor, true, true));
      axisTags.push(axisTag(`proj-${role}`, ly, lp, lcolor, false, true, true));
      const onDown = (e: React.MouseEvent) => startDrag(e, dragKey, lp, np => { if (isValidExit(p.side, role, np, price)) patch({ [role]: np }); }, { from: price, color: lcolor });
      handles.push(handle(`proj-${role}`, ly, lcolor, onDown));
      items.push(row(`proj-${role}`, ly, (
        <LineBox color={lcolor} dashed onMouseDown={onDown}>
          <Seg color={lcolor}>{formatQty(p.qty)}</Seg>
          <Seg color={lcolor} divider>{formatSignedMoney(money)} USD</Seg>
          <XSeg color={lcolor} onClick={() => {
            if (p.source === "chart") tradingUi.set(prev => ({ project: prev.project ? { ...prev.project, [role]: undefined } : null }));
            else window.dispatchEvent(new CustomEvent("tv:ticket-exit-off", { detail: { role } }));
          }} />
        </LineBox>
      ), true));
    }
  }

  // Green/orange band between the entry and an exit while it's dragged
  if (drag?.fill) {
    const y1 = yOf(drag.fill.from), y2 = yOf(drag.price);
    if (y1 !== null && y2 !== null) {
      fills.push(<div key="fill" style={{ position: "absolute", left: 0, width: paneW, top: Math.min(y1, y2), height: Math.abs(y2 - y1), background: drag.fill.color, opacity: 0.18, pointerEvents: "none" }} />);
    }
  }

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none", zIndex: 70, overflow: "hidden", fontFamily: "inherit" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: paneW, height: paneH, overflow: "hidden" }}>
        {fills}
        {items}
        {handles}
      </div>
      <div style={{ position: "absolute", left: 0, top: 0, width, height: paneH, overflow: "hidden" }}>{axisTags}</div>
      {plusButton && <PlusButton chart={chart} series={series} symbol={symbol} paneW={paneW} paneH={paneH} prec={prec} connected={state.connected} />}
    </div>
  );
}

// Applies a confirmed chart edit
function applyPending(p: PendingEdit) {
  tradingUi.set({ pending: null });
  if (p.kind === "order" && p.orderId) {
    engine.modifyOrder(p.orderId, { price: p.price });
    return;
  }
  const s = engine.getState();
  const pos = positionViews(s).find(v => v.symbol === p.symbol);
  if (!pos) return;
  if (p.orderId) {
    engine.modifyOrder(p.orderId, { price: p.price });
  } else {
    engine.setPositionExits(p.symbol, [{
      qty: pos.qty,
      tp: p.role === "tp" ? p.price : pos.tpOrders[0] ? orderPrice(pos.tpOrders[0]) : undefined,
      sl: p.role === "sl" ? p.price : pos.slOrders[0] ? orderPrice(pos.slOrders[0]) : undefined,
    }]);
  }
}

// ---------- line label parts ----------

function LineBox({ color, children, dashed, onMouseDown }: { color: string; children: React.ReactNode; dashed?: boolean; onMouseDown?: (e: React.MouseEvent) => void }) {
  return (
    <div onMouseDown={onMouseDown} style={{
      display: "flex", alignItems: "stretch", height: BOX_H, boxSizing: "border-box", borderRadius: 4, overflow: "hidden",
      border: `1px ${dashed ? "dashed" : "solid"} ${color}`, background: "var(--tv-trade-line-box-bg)", fontSize: 12,
      cursor: onMouseDown ? "ns-resize" : "default",
    }}>{children}</div>
  );
}

function Seg({ children, color, bg, divider, onClick }: { children: React.ReactNode; color: string; bg?: string; divider?: boolean; onClick?: () => void }) {
  return (
    <span
      onMouseDown={onClick ? e => e.stopPropagation() : undefined}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", padding: "0 7px", color, background: bg || "transparent",
        borderLeft: divider ? `1px solid ${color}` : "none", cursor: onClick ? "pointer" : "inherit", fontVariantNumeric: "tabular-nums",
      }}
    >{children}</span>
  );
}

function XSeg({ color, onClick }: { color: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <span
      role="button"
      onMouseDown={e => e.stopPropagation()}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", padding: "0 5px", color, borderLeft: `1px solid ${color}`, cursor: "pointer", background: hover ? `${color}22` : "transparent" }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.3"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
    </span>
  );
}

function SmallBtn({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button type="button" onMouseDown={e => e.stopPropagation()} onClick={onClick} style={{
      height: BOX_H, width: 28, borderRadius: 4, border: `1px solid ${color}`, background: "var(--tv-trade-line-box-bg)", color, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
    }}>{children}</button>
  );
}

function DashBtn({ children, color, onMouseDown }: { children: React.ReactNode; color: string; onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <span onMouseDown={onMouseDown} style={{
      height: BOX_H, boxSizing: "border-box", padding: "0 6px", display: "flex", alignItems: "center", fontSize: 12, color,
      border: `1px dashed ${color}`, background: "var(--tv-trade-line-box-bg)", cursor: "ns-resize", userSelect: "none", marginRight: -1,
    }}>{children}</span>
  );
}

function PlainBtn({ children, onClick, primary, color }: { children: React.ReactNode; onClick: () => void; primary?: boolean; color?: string }) {
  return (
    <button type="button" onMouseDown={e => e.stopPropagation()} onClick={onClick} style={{
      height: BOX_H, padding: "0 8px", border: primary ? "none" : "1px solid var(--tv-trade-field-border)", borderRadius: 4, fontSize: 12,
      background: primary ? color : "var(--tv-trade-line-box-bg)", color: primary ? "#fff" : "var(--tv-color-text)", cursor: "pointer", marginRight: 4,
    }}>{children}</button>
  );
}

// ---------- "+" on the price axis ----------

function PlusButton({ chart, series, symbol, paneW, paneH, prec, connected }: { chart: IChartApi; series: any; symbol: string; paneW: number; paneH: number; prec: number; connected: boolean }) {
  const [y, setY] = useState<number | null>(null);
  const [menuPrice, setMenuPrice] = useState<number | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hoverRef = useRef(false);
  useEffect(() => {
    const onMove = (param: any) => {
      if (hoverRef.current) return;
      setY(param?.point && param.point.y >= 0 && param.point.y <= paneH ? param.point.y : null);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [chart, paneH]);
  const price = useMemo(() => {
    if (y === null) return null;
    try { const p = series.coordinateToPrice(y); return p === null ? null : roundToTick(p, prec); } catch { return null; }
  }, [y, series, prec]);
  const qty = lastQtyFor(symbol);
  const p = menuPrice ?? price;
  const fp = p !== null ? formatPrice(p, prec) : "";
  const buyType = p !== null ? orderTypeAt(symbol, "buy", p) : "limit";
  const sellType = p !== null ? orderTypeAt(symbol, "sell", p) : "stop";
  const close = () => { setMenuPrice(null); hoverRef.current = false; };
  return (
    <>
      {(y !== null || menuPrice !== null) && (
        <button
          ref={btnRef}
          type="button"
          aria-label="Add alert, order or line at this price"
          onMouseEnter={() => { hoverRef.current = true; }}
          onMouseLeave={() => { if (menuPrice === null) hoverRef.current = false; }}
          onClick={() => { if (price !== null) setMenuPrice(price); }}
          style={{
            position: "absolute", left: paneW - 22, top: (y ?? 0) - 10, width: 20, height: 20, borderRadius: 4, padding: 0,
            border: "none", background: "#131722", color: "#fff", cursor: "pointer", pointerEvents: "auto",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="7" cy="7" r="6" /><path d="M7 4v6M4 7h6" /></svg>
        </button>
      )}
      <Popover anchor={btnRef.current} open={menuPrice !== null} onClose={close} align="right" width={360}>
        <MenuItem icon={<AlarmIcon />} right={<Kbd>Alt + A</Kbd>} onClick={() => { close(); window.dispatchEvent(new CustomEvent("tv:create-alert", { detail: { price: p } })); }}>
          Add alert on {symbol} at {fp}
        </MenuItem>
        <MenuDivider />
        <MenuItem icon={<UpChevron />} right={<Kbd>Alt + Shift + B</Kbd>} onClick={() => { close(); if (p !== null) projectChartOrder(symbol, "buy", buyType, p); }}>
          Buy {formatQty(qty)} {symbol} @ {fp} {buyType}
        </MenuItem>
        <MenuItem icon={<DownChevron />} onClick={() => { close(); if (p !== null) projectChartOrder(symbol, "sell", sellType, p); }}>
          Sell {formatQty(qty)} {symbol} @ {fp} {sellType}
        </MenuItem>
        <MenuItem icon={<OrderIcon />} right={<Kbd>Shift + T</Kbd>} onClick={() => {
          close();
          if (p === null) return;
          if (!connected) { tradingUi.set({ dialog: { kind: "broker", then: { side: "buy", symbol } } }); return; }
          openTicket({ symbol, side: "buy", type: buyType, price: p });
        }}>
          Add order on {symbol} at {fp}…
        </MenuItem>
        <MenuDivider />
        <MenuItem icon={<HLineIcon />} right={<Kbd>Alt + H</Kbd>} onClick={() => { close(); window.dispatchEvent(new CustomEvent("tv:draw-hline", { detail: { price: p } })); }}>
          Draw horizontal line at {fp}
        </MenuItem>
      </Popover>
    </>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 12 }}>{children}</span>;
const UpChevron = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4.5 11l4.5-4.5 4.5 4.5" /></svg>;
const DownChevron = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4.5 7l4.5 4.5L13.5 7" /></svg>;
const AlarmIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.1"><circle cx="9" cy="10" r="5.5" /><path d="M9 7v3l2 1.5M3 4l2-1.5M15 4l-2-1.5" /></svg>;
const OrderIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.1"><rect x="2.5" y="3.5" width="13" height="11" rx="1.5" /><path d="M5 11l3-3 2 2 3-3.5" /></svg>;
const HLineIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.1"><path d="M1.5 9h15" /><circle cx="9" cy="9" r="1.8" fill="var(--tv-trade-panel-bg)" /></svg>;

export type { ProjectOrder, PositionView, Side, TradingSettings };
