"use client";

// The order ticket (TradingView's order dialog): Sell/Buy with live bid/ask and spread,
// Market/Limit/Stop, quantity in units, margin, % balance or risk, a margin slider, exits
// (TP/SL in price, ticks, % price, money or % balance, with multiple exit levels), time in
// force, order presets, and docking to the right panel. It also projects limit/stop orders
// onto the chart, where dragging those lines edits the ticket.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../lib/useEscapeClose";
import { engine, useEngineState, useTradingUi, tradingUi, closeTicket, ProjectOrder, setDocked, showDockTab } from "./store";
import {
  accountMetrics, activeAccount, activeBook, leverageFor, precisionOf, quoteOf, isValidOrderPrice, isValidExit,
  orderPrice, tifExpiry, Side, OrderType, TimeInForce, ExitLevel, Order,
} from "./engine";
import { ticketPrefs, useTicketPrefs, useTradingSettings, QtyMode, ExitMode, OrderPreset } from "./settings";
import { formatPrice, formatQty, formatMoney, qtyStepOf, qtyDecimals, roundQty, priceInput, defaultQtyOf, assetClassOf } from "./instruments";
import {
  TicketCtx, QTY_MODE_LABEL, QTY_MODE_INFO, isRiskMode, qtyFromAnchor, anchorFromQty, formatAnchor,
  exitLabel, exitModeName, exitValue, exitPriceFrom, formatExitValue, defaultExitTicks, EXIT_MODE_INFO,
} from "./ticketMath";
import {
  C, Toggle, Tip, Popover, MenuItem, MenuDivider, BrandLogo, SwapIcon, ChevronDown, ChevronUp, ChevronLeft, CloseIcon,
  InfoIcon, HelpIcon, MoreIcon, PresetsIcon, PinIcon, HexSettingsIcon, CloudUpIcon, TrashIcon, PlusIcon, CheckIcon, UfoIllustration,
} from "./ui";

const QTY_MODES: QtyMode[] = ["units", "usdMargin", "pctBalance", "riskUsd", "riskPct"];
const EXIT_MODES: ExitMode[] = ["price", "ticks", "pctPrice", "money", "pctBalance"];
const TIFS: TimeInForce[] = ["Day", "Week", "Month", "GTD"];
const TICKET_WIDTH = 400;

export interface ExitDraft { on: boolean; price: number | null }   // price null: follows the market at the default distance
export interface LevelDraft { qty: number; tp?: number; sl?: number }

export default function OrderTicket({ placement }: { placement: "floating" | "docked" }) {
  const ui = useTradingUi();
  const prefs = useTicketPrefs();
  const t = ui.ticket;
  if (!t.open || !t.symbol) return null;
  const floating = !!t.floating || !prefs.docked;
  if (placement === "floating" ? !floating : floating || !ui.dock.open || ui.dock.tab !== "order") return null;
  return <TicketBody key={`${t.nonce}-${placement}`} placement={placement} />;
}

function TicketBody({ placement }: { placement: "floating" | "docked" }) {
  const state = useEngineState();
  const ui = useTradingUi();
  const prefs = useTicketPrefs();
  const settings = useTradingSettings();
  const req = ui.ticket;
  const symbol = req.symbol;
  const acc = activeAccount(state);
  const metrics = accountMetrics(state);
  const book = activeBook(state);
  const modifying: Order | undefined = req.modifyOrderId ? book.orders.find(o => o.id === req.modifyOrderId) : undefined;
  const prec = precisionOf(state, symbol);
  const tick = Math.pow(10, -prec);
  const q = quoteOf(state, symbol);
  const leverage = leverageFor(acc, symbol);
  const qDec = qtyDecimals(symbol);
  const step = qtyStepOf(symbol);

  // ---- order ----
  const [side, setSide] = useState<Side>(modifying?.side ?? req.side);
  const [type, setType] = useState<OrderType>(modifying?.type ?? req.type);
  const [priceText, setPriceText] = useState<string>(() => {
    const p = modifying ? orderPrice(modifying) : req.price;
    return p !== undefined ? priceInput(p, prec) : "";
  });
  const [priceSwapped, setPriceSwapped] = useState(false);
  const [offsetText, setOffsetText] = useState<string | null>(null);

  useEffect(() => {
    if (type !== "market" && !priceText && q) setPriceText(priceInput(side === "buy" ? q.ask : q.bid, prec));
  }, [type, q, priceText, side, prec]);

  const refPrice = q ? (side === "buy" ? q.ask : q.bid) : NaN;
  const entry = type === "market" ? refPrice : parseFloat(priceText);

  // ---- exits ----
  const defaults = useMemo(() => {
    const d = defaultExitTicks(symbol, prec);
    return { tp: prefs.tpTicks ?? d.tp, sl: prefs.slTicks ?? d.sl };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const initialExit = (role: "tp" | "sl"): ExitDraft => {
    if (!modifying) return { on: false, price: null };
    const child = book.orders.find(o => o.parentId === modifying.id && o.role === role && (o.status === "inactive" || o.status === "working"));
    return child ? { on: true, price: orderPrice(child) ?? null } : { on: false, price: null };
  };
  const [tp, setTp] = useState<ExitDraft>(() => initialExit("tp"));
  const startRiskPct = !modifying && req.qty === undefined && prefs.defaultRiskPct ? prefs.defaultRiskPct : null;
  const startMode: QtyMode = modifying || req.qty !== undefined ? "units" : startRiskPct !== null ? "riskPct" : prefs.qtyMode;
  // Sizing by risk needs a stop loss, so a ticket that starts in a risk mode starts with one
  const [sl, setSl] = useState<ExitDraft>(() => (!modifying && isRiskMode(startMode) ? { on: true, price: null } : initialExit("sl")));
  const [tpMode, setTpMode] = useState<ExitMode>(prefs.tpMode);
  const [slMode, setSlMode] = useState<ExitMode>(prefs.slMode);
  const [tpSecondary, setTpSecondary] = useState<ExitMode>(prefs.tpSecondary === prefs.tpMode ? (prefs.tpMode === "price" ? "ticks" : "price") : prefs.tpSecondary);
  const [slSecondary, setSlSecondary] = useState<ExitMode>(prefs.slSecondary === prefs.slMode ? (prefs.slMode === "price" ? "ticks" : "price") : prefs.slSecondary);
  const [tpText, setTpText] = useState<string | null>(null);
  const [slText, setSlText] = useState<string | null>(null);
  const [levels, setLevels] = useState<LevelDraft[] | null>(() => {
    if (!modifying) return null;
    const kids = book.orders.filter(o => o.parentId === modifying.id && (o.status === "inactive" || o.status === "working"));
    const ids = Array.from(new Set(kids.map(k => k.levelId || 0)));
    if (ids.length < 2) return null;
    return ids.sort().map(id => {
      const lv = kids.filter(k => (k.levelId || 0) === id);
      const tpO = lv.find(k => k.role === "tp"), slO = lv.find(k => k.role === "sl");
      return { qty: (tpO || slO)!.qty, tp: tpO ? orderPrice(tpO) : undefined, sl: slO ? orderPrice(slO) : undefined };
    });
  });
  const exitDir = (role: "tp" | "sl") => ((side === "buy") === (role === "tp") ? 1 : -1);
  const tracked = (role: "tp" | "sl", ticks: number) => isFinite(entry) ? Math.round((entry + exitDir(role) * ticks * tick) / tick) * tick : NaN;
  const tpPrice = tp.on && tp.price !== null ? tp.price : tracked("tp", defaults.tp);
  const slPrice = sl.on && sl.price !== null ? sl.price : tracked("sl", defaults.sl);

  // ---- quantity ----
  const lastQty = modifying?.qty ?? req.qty ?? prefs.qtyBySymbol[symbol] ?? defaultQtyOf(symbol);
  const [qtyMode, setQtyMode] = useState<QtyMode>(startMode);
  const [qtySecondary, setQtySecondary] = useState<QtyMode>(() => {
    return prefs.qtySecondary !== startMode ? prefs.qtySecondary : startMode === "units" ? "usdMargin" : "units";
  });
  const [anchor, setAnchor] = useState<number | null>(() => {
    if (startMode === "units") return lastQty;
    if (startRiskPct !== null) return startRiskPct;
    if (startMode === "riskUsd") return prefs.riskUsd;
    if (startMode === "riskPct") return prefs.riskPct;
    return null; // margin modes: derived from the last quantity once prices are known
  });
  const [riskText, setRiskText] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState<string | null>(null);

  const ctx: TicketCtx = { side, entry, leverage, equity: metrics.equity, available: metrics.availableFunds + (modifying ? orderMarginOf(modifying) : 0), precision: prec };
  const slForRisk = sl.on ? slPrice : null;
  const qty = roundQty(anchor === null ? lastQty : qtyFromAnchor(qtyMode, anchor, ctx, slForRisk), symbol);
  const shownAnchor = anchor === null ? anchorFromQty(qtyMode, qty, ctx, slForRisk) : anchor;

  function orderMarginOf(o: Order) {
    return o.type === "market" ? 0 : ((orderPrice(o) || 0) * o.qty) / leverageFor(acc, o.symbol);
  }

  // Risk-based sizing needs a stop loss
  const switchQtyMode = (m: QtyMode) => {
    if (isRiskMode(m) && !sl.on) setSl({ on: true, price: slPrice });
    const slP = isRiskMode(m) ? slPrice : slForRisk;
    setAnchor(anchorFromQty(m, qty, ctx, slP));
    if (qtySecondary === m) setQtySecondary(qtyMode);
    setQtyMode(m);
    setQtyText(null);
  };

  const setSlOn = (on: boolean) => {
    setSl({ on, price: on ? slPrice : null });
    if (!on && isRiskMode(qtyMode)) { setAnchor(qty); setQtyMode("units"); }
    if (on && prefs.slEnablesRiskQty && !isRiskMode(qtyMode)) {
      setAnchor(anchorFromQty("riskUsd", qty, ctx, slPrice));
      setQtyMode("riskUsd");
      if (qtySecondary === "riskUsd") setQtySecondary("units");
    }
  };

  // ---- extra ----
  const [tif, setTif] = useState<TimeInForce>(modifying?.tif ?? req.tif ?? "Day");
  const [gtdDate, setGtdDate] = useState<string>(() => {
    const d = new Date(modifying?.expiresAt ?? Date.now() + 7 * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [exitsOpen, setExitsOpen] = useState(prefs.exitsOpen);
  const [extraOpen, setExtraOpen] = useState(prefs.extraOpen);
  const [view, setView] = useState<"main" | "levels" | "savePreset">("main");

  // ---- validation ----
  const noQuote = !q;
  const priceValid = type === "market" || (!!q && isValidOrderPrice(side, type, entry, q.bid, q.ask));
  const qtyValid = qty >= step - 1e-12;
  const tpValid = !!levels || !tp.on || (isFinite(tpPrice) && isValidExit(side, "tp", tpPrice, entry));
  const slValid = !!levels || !sl.on || (isFinite(slPrice) && isValidExit(side, "sl", slPrice, entry));
  const levelsValid = !levels || levels.every(l => (l.tp === undefined || isValidExit(side, "tp", l.tp, entry)) && (l.sl === undefined || isValidExit(side, "sl", l.sl, entry)));
  const canSubmit = !noQuote && priceValid && qtyValid && tpValid && slValid && levelsValid && isFinite(entry);

  const buildLevels = (): ExitLevel[] | undefined => {
    if (levels) {
      const total = levels.reduce((s, l) => s + l.qty, 0) || 1;
      let used = 0;
      return levels.map((l, i) => {
        const lq = i === levels.length - 1 ? roundQty(qty - used, symbol) : roundQty((l.qty / total) * qty, symbol);
        used += lq;
        return { qty: lq, tp: l.tp, sl: l.sl };
      }).filter(l => l.qty > 0);
    }
    if (!tp.on && !sl.on) return undefined;
    return [{ qty, tp: tp.on ? tpPrice : undefined, sl: sl.on ? slPrice : undefined }];
  };

  const submit = () => {
    if (!canSubmit) return;
    const lv = buildLevels();
    const expiresAt = type === "market" ? undefined : tif === "GTD" ? new Date(`${gtdDate}T23:59:59`).getTime() : tifExpiry(tif, Date.now());
    const result = modifying
      ? engine.modifyOrder(modifying.id, { price: entry, qty, type: type === "market" ? undefined : type, levels: lv ?? [], tif, expiresAt })
      : engine.placeOrder({ symbol, side, type, qty, price: type === "market" ? undefined : entry, levels: lv, tif: type === "market" ? undefined : tif, expiresAt });
    ticketPrefs.set(p => ({
      qtyBySymbol: { ...p.qtyBySymbol, [symbol]: qty },
      qtyMode, qtySecondary, tpMode, slMode, tpSecondary, slSecondary,
      riskUsd: qtyMode === "riskUsd" ? shownAnchor : p.riskUsd,
      riskPct: qtyMode === "riskPct" ? shownAnchor : p.riskPct,
      tpTicks: tp.on && isFinite(entry) ? Math.max(1, Math.round(Math.abs(tpPrice - entry) / tick)) : p.tpTicks,
      slTicks: sl.on && isFinite(entry) ? Math.max(1, Math.round(Math.abs(slPrice - entry) / tick)) : p.slTicks,
    }));
    if (result.ok && (placement === "floating" || modifying)) closeTicket();
  };

  // ---- chart projection ----
  const projectType = modifying ? null : type;
  useEffect(() => {
    const show = !!projectType && (projectType !== "market" || settings.projectOrderForMarket) && isFinite(entry) && q;
    const next: ProjectOrder | null = show ? {
      source: "ticket", symbol, side, type: projectType!, price: entry, qty,
      tp: levels ? undefined : tp.on ? tpPrice : undefined, sl: levels ? undefined : sl.on ? slPrice : undefined,
      valid: canSubmit,
    } : null;
    const cur = tradingUi.get().project;
    if (cur?.source === "chart" && !next) return;
    const same = (a: ProjectOrder | null, b: ProjectOrder | null) => !a && !b ? true : !!a && !!b &&
      a.source === b.source && a.symbol === b.symbol && a.side === b.side && a.type === b.type && a.price === b.price &&
      a.qty === b.qty && a.tp === b.tp && a.sl === b.sl && a.valid === b.valid;
    if (!same(cur, next)) tradingUi.set({ project: next });
  }, [projectType, settings.projectOrderForMarket, entry, q, symbol, side, qty, tp.on, tpPrice, sl.on, slPrice, levels, canSubmit]);
  useEffect(() => () => {
    if (tradingUi.get().project?.source === "ticket") tradingUi.set({ project: null });
  }, []);

  // Chart drags of the projected lines
  const patchNonce = useRef(ui.projectPatch?.nonce ?? 0);
  useEffect(() => {
    const p = ui.projectPatch;
    if (!p || p.nonce === patchNonce.current) return;
    patchNonce.current = p.nonce;
    if (p.price !== undefined) setPriceText(priceInput(p.price, prec));
    if (p.tp !== undefined) setTp({ on: true, price: p.tp });
    if (p.sl !== undefined) setSl({ on: true, price: p.sl });
  }, [ui.projectPatch, prec]);

  // The projected order's Buy/Sell button on the chart sends the ticket; its TP/SL x removes that exit
  const submitRef = useRef<() => void>(() => {});
  submitRef.current = submit;
  useEffect(() => {
    const onSubmit = () => submitRef.current();
    const onExitOff = (e: Event) => {
      const role = (e as CustomEvent).detail?.role;
      if (role === "tp") setTp({ on: false, price: null });
      if (role === "sl") setSlOnRef.current(false);
    };
    window.addEventListener("tv:ticket-submit", onSubmit);
    window.addEventListener("tv:ticket-exit-off", onExitOff);
    return () => { window.removeEventListener("tv:ticket-submit", onSubmit); window.removeEventListener("tv:ticket-exit-off", onExitOff); };
  }, []);
  const setSlOnRef = useRef(setSlOn);
  setSlOnRef.current = setSlOn;

  // Esc goes back from a sub-view, then closes the ticket
  useEscapeClose(() => { if (view !== "main") setView("main"); else closeTicket(); });

  // ---- floating position / drag ----
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    if (placement !== "floating") return null;
    if (prefs.floatingPos) return prefs.floatingPos;
    const main = typeof document !== "undefined" ? document.querySelector("main")?.getBoundingClientRect() : null;
    const x = main ? main.left + main.width / 2 - TICKET_WIDTH / 2 : 200;
    const y = main ? main.top + 60 : 100;
    return { x, y };
  });
  const clampPos = useCallback((p: { x: number; y: number }) => {
    const h = boxRef.current?.offsetHeight || 400;
    return {
      x: Math.max(8, Math.min(p.x, window.innerWidth - TICKET_WIDTH - 8)),
      y: Math.max(8, Math.min(p.y, window.innerHeight - Math.min(h, window.innerHeight - 16) - 8)),
    };
  }, []);
  useEffect(() => {
    if (placement !== "floating") return;
    const fit = () => setPos(p => (p ? clampPos(p) : p));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [placement, clampPos, view, type, exitsOpen, extraOpen, levels]);
  const startDrag = (e: React.MouseEvent) => {
    if (placement !== "floating" || !pos || (e.target as HTMLElement).closest("button")) return;
    const sx = e.clientX, sy = e.clientY, start = pos;
    const move = (ev: MouseEvent) => setPos(clampPos({ x: start.x + ev.clientX - sx, y: start.y + ev.clientY - sy }));
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      ticketPrefs.set({ floatingPos: clampPos({ x: start.x + ev.clientX - sx, y: start.y + ev.clientY - sy }) });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ---- presets / menus ----
  const presetsBtn = useRef<HTMLButtonElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<null | "presets" | "more">(null);
  const applyPreset = (p: OrderPreset) => {
    setType(p.type);
    if (p.tpTicks) setTp({ on: true, price: tracked("tp", p.tpTicks) }); else setTp({ on: false, price: null });
    if (p.slTicks) setSl({ on: true, price: tracked("sl", p.slTicks) }); else setSlOn(false);
    setLevels(null);
    setMenu(null);
  };

  const formatP = (v: number) => formatPrice(v, prec);
  const sideColor = side === "buy" ? C.buy : C.sell;
  const typeLabel = type === "market" ? "Market" : type === "limit" ? "Limit" : "Stop";

  const body = (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={`${symbol} order`}
      style={placement === "floating" ? {
        position: "fixed", left: pos?.x ?? 0, top: pos?.y ?? 0, width: TICKET_WIDTH, maxHeight: "calc(100vh - 16px)",
        background: C.panel, color: C.text, borderRadius: 8, boxShadow: C.shadow, zIndex: 2600, display: "flex", flexDirection: "column",
        fontSize: 14, overflow: "hidden",
      } : {
        width: "100%", height: "100%", background: C.panel, color: C.text, display: "flex", flexDirection: "column", fontSize: 14, overflow: "hidden",
      }}
    >
      {view === "levels" ? (
        <ExitLevelsView
          symbol={symbol} side={side} typeLabel={typeLabel} qty={qty} entry={entry} prec={prec} ctx={ctx} qtyDec={qDec} step={step}
          initial={levels ?? [{ qty, tp: tp.on ? tpPrice : tracked("tp", defaults.tp), sl: sl.on ? slPrice : tracked("sl", defaults.sl) }]}
          onDiscard={() => setView("main")}
          onClose={closeTicket}
          onConfirm={(lv) => {
            if (lv.length <= 1) {
              const l = lv[0];
              setLevels(null);
              setTp(l?.tp !== undefined ? { on: true, price: l.tp } : { on: false, price: null });
              if (l?.sl !== undefined) setSl({ on: true, price: l.sl }); else setSlOn(false);
            } else setLevels(lv);
            setView("main");
          }}
        />
      ) : (
        <>
          {/* Header */}
          <div onMouseDown={startDrag} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 8px 16px", cursor: placement === "floating" ? "move" : "default", userSelect: "none" }}>
            <BrandLogo size={24} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{symbol}</span>
            {modifying && <span style={{ color: C.muted, fontSize: 13 }}>· Modify order {modifying.id}</span>}
            <span style={{ flex: 1 }} />
            {!modifying && (
              <Tip text="Order presets" placement="bottom">
                <HeaderBtn btnRef={presetsBtn} active={menu === "presets"} onClick={() => setMenu(m => (m === "presets" ? null : "presets"))}><PresetsIcon /></HeaderBtn>
              </Tip>
            )}
            <HeaderBtn btnRef={moreBtn} active={menu === "more"} onClick={() => setMenu(m => (m === "more" ? null : "more"))} label="More"><MoreIcon /></HeaderBtn>
            <HeaderBtn onClick={closeTicket} label="Close"><CloseIcon size={20} /></HeaderBtn>
          </div>

          {placement === "docked" && !modifying && <DockTabs tab="order" />}
          <div style={{ overflowY: "auto", overflowX: "hidden", padding: "0 16px", flex: 1, minHeight: 0 }}>
            {/* Sell / Buy */}
            <div style={{ position: "relative", display: "flex", height: 52, borderRadius: 8, overflow: "hidden", background: C.seg, marginTop: 4 }}>
              {(["sell", "buy"] as Side[]).map(s => {
                const selected = side === s;
                const color = s === "buy" ? C.buy : C.sell;
                const price = q ? (s === "buy" ? q.ask : q.bid) : NaN;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!!modifying && !selected}
                    onClick={() => setSide(s)}
                    style={{
                      flex: 1, border: "none", cursor: modifying ? "default" : "pointer", padding: "7px 10px",
                      background: selected ? (s === "buy" ? "var(--tv-trade-buy-soft)" : "var(--tv-trade-sell-soft)") : "transparent",
                      display: "flex", flexDirection: "column", alignItems: s === "buy" ? "flex-end" : "flex-start", justifyContent: "center",
                      color: selected ? color : C.text, opacity: modifying && !selected ? 0.5 : 1,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14, lineHeight: "18px" }}>{s === "buy" ? "Buy" : "Sell"}</span>
                    <span style={{ fontSize: 16, lineHeight: "22px" }}>{isFinite(price) ? formatP(price) : "—"}</span>
                  </button>
                );
              })}
              <span style={{
                position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -2px)", background: C.panel, color: C.text,
                fontSize: 11, lineHeight: "16px", padding: "0 6px", borderRadius: 4, minWidth: 24, textAlign: "center", pointerEvents: "none",
              }}>{q ? Math.round((q.ask - q.bid) / tick) : "—"}</span>
            </div>

            {/* Market / Limit / Stop */}
            <div style={{ position: "relative", display: "flex", marginTop: 10 }}>
              {(["market", "limit", "stop"] as OrderType[]).map(tt => {
                const disabled = !!modifying && tt === "market";
                return (
                  <button key={tt} type="button" disabled={disabled} onClick={() => setType(tt)} style={{
                    flex: 1, height: 38, border: "none", background: "transparent", cursor: disabled ? "default" : "pointer",
                    fontSize: 14, color: type === tt ? C.text : C.muted, fontWeight: type === tt ? 600 : 400, opacity: disabled ? 0.4 : 1,
                  }}>{tt === "market" ? "Market" : tt === "limit" ? "Limit" : "Stop"}</button>
                );
              })}
              <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, borderRadius: 2, background: C.seg }} />
              <span style={{
                position: "absolute", bottom: 0, height: 3, borderRadius: 2, background: C.text, width: "33.333%",
                left: `${(["market", "limit", "stop"].indexOf(type)) * 33.333}%`, transition: "left 0.15s",
              }} />
            </div>

            {/* Price (limit / stop) */}
            {type !== "market" && (() => {
              const offset = isFinite(entry) && isFinite(refPrice) ? Math.round((entry - refPrice) / tick) : NaN;
              const offsetLabel = `${side === "buy" ? "Ask" : "Bid"}${!isFinite(offset) || offset === 0 ? "" : offset > 0 ? ` + ${offset}` : ` − ${Math.abs(offset)}`}`;
              return (
                <>
                  <SectionLabel>Price</SectionLabel>
                  <Field invalid={!priceValid && !!priceText} error="Selected price isn't valid for this order type">
                    {priceSwapped ? (
                      <input
                        aria-label="Price offset in ticks"
                        value={offsetText ?? (isFinite(offset) ? String(offset) : "")}
                        onChange={e => {
                          setOffsetText(e.target.value);
                          const v = parseFloat(e.target.value);
                          if (isFinite(v) && isFinite(refPrice)) setPriceText(priceInput(refPrice + v * tick, prec));
                        }}
                        onBlur={() => setOffsetText(null)}
                        style={inputStyle}
                      />
                    ) : (
                      <input aria-label="Price" value={priceText} onChange={e => setPriceText(e.target.value.replace(/[^0-9.]/g, ""))} style={inputStyle} />
                    )}
                    <SwapBtn onClick={() => setPriceSwapped(v => !v)} />
                    <span style={secondaryStyle}>{priceSwapped ? (isFinite(entry) ? priceInput(entry, prec) : "") : offsetLabel}</span>
                  </Field>
                </>
              );
            })()}

            {/* Quantity */}
            <QtyModeLabel mode={qtyMode} onChange={switchQtyMode} />
            <Field invalid={!qtyValid && !noQuote} error={isRiskMode(qtyMode) && !sl.on ? "Set a stop loss to size the order by risk" : `Quantity should be at least ${formatQty(step)}`}>
              <input
                aria-label="Quantity"
                value={qtyText ?? formatAnchor(qtyMode, shownAnchor, qDec)}
                onFocus={e => e.target.select()}
                onChange={e => {
                  const txt = e.target.value.replace(/[^0-9.]/g, "");
                  setQtyText(txt);
                  const v = parseFloat(txt);
                  setAnchor(isFinite(v) ? v : 0);
                }}
                onBlur={() => setQtyText(null)}
                style={inputStyle}
              />
              <SwapBtn onClick={() => {
                const sec = qtySecondary;
                setQtySecondary(qtyMode);
                switchQtyModeKeepSecondary(sec);
              }} />
              <QtySecondary mode={qtySecondary} primary={qtyMode} qty={qty} ctx={ctx} slPrice={sl.on ? slPrice : null} qtyDec={qDec} onPick={setQtySecondary} />
            </Field>
            <MarginSlider
              pct={ctx.available > 0 ? ((qty * (isFinite(entry) ? entry : 0)) / leverage / ctx.available) * 100 : 0}
              onChange={pct => {
                if (!(entry > 0)) return;
                const newQty = roundQty(((pct / 100) * ctx.available * leverage) / entry, symbol);
                setAnchor(anchorFromQty(qtyMode, newQty, ctx, slForRisk));
                setQtyText(null);
              }}
            />
            <div style={{ background: C.subtle, borderRadius: 8, padding: "10px 12px", marginTop: 12, display: "grid", gap: 6, fontSize: 13 }}>
              <InfoRow label={`Trade value (${leverage}x)`} value={isFinite(entry) ? formatMoney(qty * entry) : "—"} />
              <InfoRow label="Available margin" value={formatMoney(ctx.available)} warn={isFinite(entry) && (qty * entry) / leverage > ctx.available + 1e-9} />
              {(assetClassOf(symbol) === "forex" || assetClassOf(symbol) === "commodities") && (
                <InfoRow label="Tick value" value={tickValueText(tick * qty)} />
              )}
            </div>

            {/* Risk %: sizes the quantity from account equity and the stop loss distance
                (quantity = equity × risk % ÷ |entry − stop loss|), optionally remembered as the
                default every new ticket starts from */}
            {!modifying && (() => {
              const currentRiskPct = qtyMode === "riskPct" ? shownAnchor : sl.on && isFinite(entry) ? anchorFromQty("riskPct", qty, ctx, slPrice) : NaN;
              const riskUsd = sl.on && isFinite(entry) ? qty * Math.abs(entry - slPrice) : NaN;
              const fieldValue = riskText ?? (isFinite(currentRiskPct) && currentRiskPct > 0 ? String(Math.round(currentRiskPct * 100) / 100) : "");
              const isDefault = prefs.defaultRiskPct !== null;
              const apply = (v: number) => {
                if (!sl.on) setSl({ on: true, price: slPrice });
                if (qtyMode !== "riskPct") {
                  if (qtySecondary === "riskPct") setQtySecondary(qtyMode);
                  setQtyMode("riskPct");
                }
                setAnchor(v);
                setQtyText(null);
                if (isDefault) ticketPrefs.set({ defaultRiskPct: v });
              };
              return (
                <>
                  <SectionLabel>Risk %</SectionLabel>
                  <Field>
                    <input
                      aria-label="Risk %"
                      placeholder="e.g. 1"
                      value={fieldValue}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const txt = e.target.value.replace(/[^0-9.]/g, "");
                        setRiskText(txt);
                        const v = parseFloat(txt);
                        if (v > 0) apply(v);
                      }}
                      onBlur={() => setRiskText(null)}
                      style={inputStyle}
                    />
                    <span style={secondaryStyle}>%</span>
                  </Field>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: "16px" }}>
                    {!(currentRiskPct > 0)
                      ? "Enter a risk % to size the quantity from your equity and stop loss"
                      : `Risking ${formatMoney(riskUsd)} USD (${Math.round(currentRiskPct * 100) / 100}% of ${formatMoney(metrics.equity)} equity) \u2192 Quantity ${formatQty(qty)}`}
                  </div>
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: currentRiskPct > 0 || isDefault ? "pointer" : "default", fontSize: 13, color: C.muted, width: "fit-content", opacity: currentRiskPct > 0 || isDefault ? 1 : 0.5 }}
                    onClick={() => {
                      if (isDefault) ticketPrefs.set({ defaultRiskPct: null });
                      else if (currentRiskPct > 0) ticketPrefs.set({ defaultRiskPct: Math.round(currentRiskPct * 100) / 100 });
                    }}
                  >
                    <Checkbox checked={isDefault} /> Set as default risk %
                  </label>
                </>
              );
            })()}

            {/* Exits */}
            <Collapsible title="Exits" open={exitsOpen} onToggle={() => { setExitsOpen(o => !o); ticketPrefs.set(p => ({ exitsOpen: !p.exitsOpen })); }}>
              {levels ? (
                <LevelsSummary levels={levels} prec={prec} total={qty} side={side} entry={entry} onEdit={() => setView("levels")} />
              ) : (
                <>
                  <ExitRow
                    role="tp" draft={tp} price={tpPrice} mode={tpMode} secondary={tpSecondary} text={tpText} qty={qty} ctx={ctx} valid={tpValid}
                    onToggle={on => setTp({ on, price: on ? tpPrice : null })}
                    onMode={m => { if (m === tpSecondary) setTpSecondary(tpMode); setTpMode(m); setTpText(null); }}
                    onSecondary={setTpSecondary}
                    onSwap={() => { const s2 = tpSecondary; setTpSecondary(tpMode); setTpMode(s2); setTpText(null); }}
                    onText={setTpText}
                    onPrice={p => setTp({ on: true, price: p })}
                  />
                  <ExitRow
                    role="sl" draft={sl} price={slPrice} mode={slMode} secondary={slSecondary} text={slText} qty={qty} ctx={ctx} valid={slValid}
                    onToggle={setSlOn}
                    onMode={m => { if (m === slSecondary) setSlSecondary(slMode); setSlMode(m); setSlText(null); }}
                    onSecondary={setSlSecondary}
                    onSwap={() => { const s2 = slSecondary; setSlSecondary(slMode); setSlMode(s2); setSlText(null); }}
                    onText={setSlText}
                    onPrice={p => setSl({ on: true, price: p })}
                  />
                  {tp.on && sl.on && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted, marginTop: 14 }}>
                        <span>Risk / Reward</span>
                        <span style={{ color: C.text }}>{isFinite(entry) && Math.abs(entry - slPrice) > 0 ? (Math.abs(tpPrice - entry) / Math.abs(entry - slPrice)).toFixed(2) : "—"}</span>
                      </div>
                      {qty >= 2 * step - 1e-12 && <AddLevelLink onClick={() => setView("levels")} />}
                    </>
                  )}
                </>
              )}
            </Collapsible>

            {/* Extra settings */}
            {type !== "market" && (
              <Collapsible title="Extra settings" open={extraOpen} onToggle={() => { setExtraOpen(o => !o); ticketPrefs.set(p => ({ extraOpen: !p.extraOpen })); }}>
                <SectionLabel>Time in force</SectionLabel>
                <SelectBox value={tif} options={TIFS} onChange={v => setTif(v as TimeInForce)} />
                {tif === "GTD" && (
                  <input type="date" aria-label="Good till date" value={gtdDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setGtdDate(e.target.value)}
                    style={{ ...inputStyle, marginTop: 8, height: 36, border: `1px solid ${C.field}`, borderRadius: 6, padding: "0 10px", width: "100%", boxSizing: "border-box", colorScheme: "light dark" }} />
                )}
              </Collapsible>
            )}
            <div style={{ height: 12 }} />
          </div>

          {/* Submit */}
          <div style={{ padding: "4px 16px 16px" }}>
            <SubmitButton
              color={side} disabled={!canSubmit}
              title={modifying ? "Modify" : side === "buy" ? "Buy" : "Sell"}
              subtitle={`${formatQty(qty)} ${symbol}${type !== "market" && isFinite(entry) ? ` @ ${formatP(entry)}` : ""} ${type.toUpperCase()}`}
              onClick={submit}
              sideColor={sideColor}
            />
          </div>
        </>
      )}

      {view === "savePreset" && (
        <SavePresetDialog
          type={type}
          tpTicks={tp.on && isFinite(entry) ? Math.round(Math.abs(tpPrice - entry) / tick) : undefined}
          slTicks={sl.on && isFinite(entry) ? Math.round(Math.abs(slPrice - entry) / tick) : undefined}
          onCancel={() => setView("main")}
          onSave={(name) => {
            const preset: OrderPreset = {
              id: Math.random().toString(36).slice(2), name, type,
              tpTicks: tp.on && isFinite(entry) ? Math.round(Math.abs(tpPrice - entry) / tick) : undefined,
              slTicks: sl.on && isFinite(entry) ? Math.round(Math.abs(slPrice - entry) / tick) : undefined,
            };
            ticketPrefs.set(p => ({ presets: [...p.presets, preset] }));
            setView("main");
          }}
        />
      )}

      <Popover anchor={presetsBtn.current} open={menu === "presets"} onClose={() => setMenu(null)} align="right" width={250}>
        <MenuItem icon={<CloudUpIcon />} onClick={() => { setMenu(null); setView("savePreset"); }}>Save order preset…</MenuItem>
        <MenuDivider />
        {prefs.presets.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 16px 16px", color: C.text, gap: 8 }}>
            <UfoIllustration size={64} />
            <span style={{ fontSize: 14 }}>No order presets created yet</span>
          </div>
        ) : prefs.presets.map(p => (
          <PresetRow key={p.id} preset={p} onApply={() => applyPreset(p)} onDelete={() => ticketPrefs.set(s => ({ presets: s.presets.filter(x => x.id !== p.id) }))} />
        ))}
      </Popover>

      <Popover anchor={moreBtn.current} open={menu === "more"} onClose={() => setMenu(null)} align="left" width={290}>
        <MenuItem icon={<PinIcon />} onClick={() => { setMenu(null); setDocked(!prefs.docked); }}>
          {prefs.docked ? "Undock order panel" : "Dock to right"}
        </MenuItem>
        <MenuItem icon={<HexSettingsIcon />} onClick={() => { setMenu(null); window.dispatchEvent(new CustomEvent("tv:open-chart-settings", { detail: { tab: "trading" } })); }}>
          Trading settings…
        </MenuItem>
        <MenuDivider />
        <MenuItem onClick={() => ticketPrefs.set(p => ({ slEnablesRiskQty: !p.slEnablesRiskQty }))} icon={<Checkbox checked={prefs.slEnablesRiskQty} />}>
          SL enables quantity in risk
        </MenuItem>
      </Popover>
    </div>
  );

  // Swap keeps the current secondary as the new secondary's counterpart
  function switchQtyModeKeepSecondary(m: QtyMode) {
    if (isRiskMode(m) && !sl.on) setSl({ on: true, price: slPrice });
    const slP = isRiskMode(m) ? slPrice : slForRisk;
    setAnchor(anchorFromQty(m, qty, ctx, slP));
    setQtyMode(m);
    setQtyText(null);
  }

  return placement === "floating" && typeof document !== "undefined" ? createPortal(body, document.body) : body;
}

// ---------- pieces ----------

// 0.006 USD per tick on 6 units of gold; whole cents above 1 USD
function tickValueText(v: number): string {
  if (!isFinite(v)) return "\u2014";
  return v >= 1 ? formatMoney(v) : String(Math.round(v * 1e6) / 1e6);
}

// The docked panel's "Order | DOM" switch
export function DockTabs({ tab }: { tab: "order" | "dom" }) {
  return (
    <div role="tablist" style={{ display: "flex", margin: "0 16px 10px", padding: 3, borderRadius: 8, background: C.seg }}>
      {(["order", "dom"] as const).map(t => (
        <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { if (t !== tab) showDockTab(t); }} style={{
          flex: 1, height: 32, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14,
          background: tab === t ? C.panel : "transparent", color: tab === t ? C.text : C.muted,
          boxShadow: tab === t ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
        }}>{t === "order" ? "Order" : "DOM"}</button>
      ))}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--tv-color-text)", fontSize: 14, height: "100%", padding: 0,
  fontFamily: "inherit",
};
export const secondaryStyle: React.CSSProperties = { color: "var(--tv-trade-muted)", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0, textAlign: "right" };

export function HeaderBtn({ children, onClick, active, btnRef, label }: { children: React.ReactNode; onClick: () => void; active?: boolean; btnRef?: React.Ref<HTMLButtonElement>; label?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button ref={btnRef} type="button" aria-label={label} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      width: 32, height: 32, border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      background: active || hover ? C.hover : "transparent", color: C.text, padding: 0,
    }}>{children}</button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ color: C.muted, fontSize: 14, margin: "14px 0 6px" }}>{children}</div>;
}

export function Field({ children, invalid, error, disabled, onDisabledClick }: { children: React.ReactNode; invalid?: boolean; error?: string; disabled?: boolean; onDisabledClick?: () => void }) {
  const [focus, setFocus] = useState(false);
  const box = (
    <div
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={() => setFocus(false)}
      onMouseDown={disabled ? (e) => { e.preventDefault(); onDisabledClick?.(); } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 8, height: 36, borderRadius: 6, padding: "0 10px", boxSizing: "border-box",
        border: `1px solid ${invalid ? C.sell : focus ? C.accent : C.field}`,
        boxShadow: focus && !invalid ? `0 0 0 1px ${C.accent}` : invalid ? `0 0 0 1px ${C.sell}` : "none",
        background: disabled ? C.subtle : "transparent", opacity: disabled ? 0.6 : 1, cursor: disabled ? "pointer" : "text",
      }}
    >{children}</div>
  );
  return invalid && error ? <Tip text={error} block>{box}</Tip> : box;
}

function SwapBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label="Swap" disabled={disabled} onClick={onClick} style={{
      border: "none", background: "transparent", color: C.muted, cursor: disabled ? "default" : "pointer", display: "flex", padding: 2, flexShrink: 0,
    }}><SwapIcon /></button>
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span style={{
      width: 18, height: 18, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: `1px solid ${checked ? "var(--tv-trade-toggle-on)" : C.faint}`, background: checked ? "var(--tv-trade-toggle-on)" : "transparent",
      color: "var(--tv-trade-panel-bg)",
    }}>{checked && <CheckIcon size={12} />}</span>
  );
}

function QtyModeLabel({ mode, onChange }: { mode: QtyMode; onChange: (m: QtyMode) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: "14px 0 6px" }}>
      <button ref={ref} type="button" onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: open ? C.hover : "transparent", color: C.muted,
        fontSize: 14, cursor: "pointer", padding: "2px 4px", margin: "-2px -4px", borderRadius: 4,
      }}>{QTY_MODE_LABEL[mode]} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={220}>
        {QTY_MODES.map(m => (
          <MenuItem key={m} selected={m === mode} onClick={() => { setOpen(false); onChange(m); }}
            right={QTY_MODE_INFO[m] ? <Tip text={QTY_MODE_INFO[m]}><span style={{ display: "flex", color: m === mode ? "inherit" : C.faint }}><InfoIcon size={16} /></span></Tip> : undefined}>
            {QTY_MODE_LABEL[m]}
          </MenuItem>
        ))}
      </Popover>
    </div>
  );
}

function QtySecondary({ mode, primary, qty, ctx, slPrice, qtyDec, onPick }: { mode: QtyMode; primary: QtyMode; qty: number; ctx: TicketCtx; slPrice: number | null; qtyDec: number; onPick: (m: QtyMode) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const value = (m: QtyMode) => anchorFromQty(m, qty, ctx, slPrice);
  const show = (m: QtyMode) => {
    const v = value(m);
    if (!isFinite(v)) return "—";
    if (m === "units") return `${formatAnchor("units", v, qtyDec)} ${v === 1 ? "unit" : "units"}`;
    if (m === "usdMargin" || m === "riskUsd") return `${v.toFixed(2)} USD`;
    return `${v.toFixed(2)}%`;
  };
  return (
    <>
      <Tip text="Changes equivalent type">
        <button ref={ref} type="button" onClick={() => setOpen(o => !o)} style={{
          display: "flex", alignItems: "center", gap: 2, border: "none", borderRadius: 4, background: open ? C.hover : "transparent",
          color: C.muted, fontSize: 12, cursor: "pointer", padding: "3px 4px", whiteSpace: "nowrap",
        }}>{show(mode)} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
      </Tip>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} align="right" width={230}>
        {QTY_MODES.filter(m => m !== primary).map(m => {
          const v = value(m);
          return (
            <MenuItem key={m} selected={m === mode} onClick={() => { setOpen(false); onPick(m); }}
              right={<span style={{ opacity: 0.8, fontSize: 13 }}>{isFinite(v) ? (m === "units" ? formatAnchor("units", v, qtyDec) : v.toFixed(2)) : "—"}</span>}>
              {QTY_MODE_LABEL[m]}
            </MenuItem>
          );
        })}
      </Popover>
    </>
  );
}

function MarginSlider({ pct, onChange }: { pct: number; onChange: (pct: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<string | null>(null);
  const value = Math.max(0, Math.min(100, isFinite(pct) ? pct : 0));
  const fromEvent = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    onChange(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  const down = (e: React.MouseEvent) => {
    e.preventDefault();
    fromEvent(e.clientX);
    const move = (ev: MouseEvent) => fromEvent(ev.clientX);
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
      <div ref={trackRef} onMouseDown={down} role="slider" aria-label="Margin used" aria-valuenow={Math.floor(value)} aria-valuemin={0} aria-valuemax={100}
        style={{ position: "relative", flex: 1, height: 20, cursor: "pointer" }}>
        <span style={{ position: "absolute", left: 0, right: 0, top: 8, height: 4, borderRadius: 2, background: C.seg }} />
        <span style={{ position: "absolute", left: 0, width: `${value}%`, top: 8, height: 4, borderRadius: 2, background: "var(--tv-trade-toggle-on)" }} />
        {[0, 25, 50, 75, 100].map(d => (
          <span key={d} style={{
            position: "absolute", left: `${d}%`, top: 6, width: 8, height: 8, marginLeft: -4, borderRadius: "50%",
            background: d <= value ? "var(--tv-trade-toggle-on)" : C.seg, border: `1px solid ${d <= value ? "var(--tv-trade-toggle-on)" : C.panel}`, boxSizing: "border-box",
          }} />
        ))}
        <span style={{
          position: "absolute", left: `${value}%`, top: 3, width: 14, height: 14, marginLeft: -7, borderRadius: "50%", background: C.panel,
          border: "2px solid var(--tv-trade-toggle-on)", boxSizing: "border-box",
        }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", background: C.subtle, borderRadius: 6, height: 28, padding: "0 8px", width: 56, boxSizing: "border-box" }}>
        <input aria-label="Margin used, percent" value={text ?? String(Math.floor(value))} onFocus={e => e.target.select()}
          onChange={e => { const t = e.target.value.replace(/[^0-9.]/g, ""); setText(t); const v = parseFloat(t); if (isFinite(v)) onChange(Math.min(100, v)); }}
          onBlur={() => setText(null)}
          style={{ ...inputStyle, width: 30, textAlign: "right", fontSize: 13 }} />
        <span style={{ fontSize: 13 }}>%</span>
      </div>
    </div>
  );
}

function InfoRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: warn ? C.sell : C.text }}>{value}<span style={{ fontSize: 10, marginLeft: 2 }}>USD</span></span>
    </div>
  );
}

function Collapsible({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <button type="button" onClick={onToggle} style={{
        display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", border: "none", background: "transparent",
        color: C.text, fontWeight: 600, fontSize: 14, cursor: "pointer", padding: 0, height: 24,
      }}>{title}<span style={{ color: C.muted, display: "flex" }}>{open ? <ChevronUp /> : <ChevronDown />}</span></button>
      {open && children}
    </div>
  );
}

export function ExitRow({ role, draft, price, mode, secondary, text, qty, ctx, valid, onToggle, onMode, onSecondary, onSwap, onText, onPrice }: {
  role: "tp" | "sl"; draft: ExitDraft; price: number; mode: ExitMode; secondary: ExitMode; text: string | null; qty: number; ctx: TicketCtx; valid: boolean;
  onToggle: (on: boolean) => void; onMode: (m: ExitMode) => void; onSecondary: (m: ExitMode) => void; onSwap: () => void;
  onText: (t: string | null) => void; onPrice: (p: number) => void;
}) {
  const modeRef = useRef<HTMLButtonElement>(null);
  const secRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<null | "mode" | "sec">(null);
  const primaryValue = exitValue(mode, price, role, qty, ctx);
  const disabled = !draft.on;
  const secText = (m: ExitMode) => {
    const v = exitValue(m, price, role, qty, ctx);
    if (!isFinite(v)) return "—";
    if (m === "ticks") return `${Math.round(v)} ticks`;
    if (m === "price") return formatExitValue("price", v, ctx.precision);
    if (m === "money") return `${v.toFixed(2)} USD`;
    return `${v.toFixed(2)}%`;
  };
  const errorText = role === "tp"
    ? `Take profit should be ${(ctx.side === "buy") ? "above" : "below"} the entry price`
    : `Stop loss should be ${(ctx.side === "buy") ? "below" : "above"} the entry price`;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 0 6px" }}>
        <button ref={modeRef} type="button" onClick={() => setMenu(m => (m === "mode" ? null : "mode"))} style={{
          display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: menu === "mode" ? C.hover : "transparent",
          color: C.muted, fontSize: 14, cursor: "pointer", padding: "2px 4px", margin: "-2px -4px", borderRadius: 4,
        }}>{exitLabel(mode, role)} {menu === "mode" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
        <Toggle on={draft.on} onChange={onToggle} label={role === "tp" ? "Take profit" : "Stop loss"} />
      </div>
      <Field invalid={draft.on && !valid} error={errorText} disabled={disabled} onDisabledClick={() => onToggle(true)}>
        <input
          aria-label={role === "tp" ? "Take profit" : "Stop loss"}
          disabled={disabled}
          value={text ?? formatExitValue(mode, primaryValue, ctx.precision)}
          onFocus={e => e.target.select()}
          onChange={e => {
            const t = e.target.value.replace(/[^0-9.\-]/g, "");
            onText(t);
            const v = parseFloat(t);
            if (isFinite(v)) onPrice(exitPriceFrom(mode, v, role, qty, ctx));
          }}
          onBlur={() => onText(null)}
          style={{ ...inputStyle, color: disabled ? C.muted : C.text, pointerEvents: disabled ? "none" : "auto" }}
        />
        <SwapBtn onClick={onSwap} disabled={disabled} />
        <Tip text="Changes equivalent type">
          <button ref={secRef} type="button" disabled={disabled} onClick={() => setMenu(m => (m === "sec" ? null : "sec"))} style={{
            display: "flex", alignItems: "center", gap: 2, border: "none", borderRadius: 4, background: menu === "sec" ? C.hover : "transparent",
            color: C.muted, fontSize: 12, cursor: disabled ? "default" : "pointer", padding: "3px 4px", whiteSpace: "nowrap",
          }}>{secText(secondary)} {menu === "sec" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
        </Tip>
      </Field>
      <Popover anchor={modeRef.current} open={menu === "mode"} onClose={() => setMenu(null)} width={230}>
        {EXIT_MODES.map(m => (
          <MenuItem key={m} selected={m === mode} onClick={() => { setMenu(null); onMode(m); }}
            right={EXIT_MODE_INFO[m] ? <Tip text={EXIT_MODE_INFO[m]}><span style={{ display: "flex", color: m === mode ? "inherit" : C.faint }}><InfoIcon size={16} /></span></Tip> : undefined}>
            {exitModeName(m, role)}
          </MenuItem>
        ))}
      </Popover>
      <Popover anchor={secRef.current} open={menu === "sec"} onClose={() => setMenu(null)} align="right" width={250}>
        {EXIT_MODES.filter(m => m !== mode).map(m => {
          const v = exitValue(m, price, role, qty, ctx);
          return (
            <MenuItem key={m} selected={m === secondary} onClick={() => { setMenu(null); onSecondary(m); }}
              right={<span style={{ opacity: 0.8, fontSize: 13 }}>{isFinite(v) ? formatExitValue(m, v, ctx.precision) : "—"}</span>}>
              {exitModeName(m, role)}
            </MenuItem>
          );
        })}
      </Popover>
    </div>
  );
}

export function AddLevelLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: C.accent, fontSize: 14,
      cursor: "pointer", padding: 0, marginTop: 14,
    }}><PlusIcon size={16} />Add level</button>
  );
}

function LevelsSummary({ levels, prec, total, side, entry, onEdit }: { levels: LevelDraft[]; prec: number; total: number; side: Side; entry: number; onEdit: () => void }) {
  const sum = levels.reduce((s, l) => s + l.qty, 0) || 1;
  return (
    <div>
      {levels.map((l, i) => (
        <div key={i} style={{ marginTop: 12 }}>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>Level {i + 1} • {((l.qty / sum) * 100).toFixed(2)}%</div>
          <button type="button" onClick={onEdit} style={{ width: "100%", textAlign: "left", border: "none", background: C.subtle, borderRadius: 6, padding: "8px 10px", cursor: "pointer", color: C.text, fontSize: 13 }}>
            {l.tp !== undefined && <><span style={{ color: C.tp }}>TP</span> {formatQty(roundQtyShare(l.qty / sum * total))} @ {formatPrice(l.tp, prec)}</>}
            {l.tp !== undefined && l.sl !== undefined && <span style={{ color: C.muted }}> • </span>}
            {l.sl !== undefined && <><span style={{ color: C.sl }}>SL</span> {formatQty(roundQtyShare(l.qty / sum * total))} @ {formatPrice(l.sl, prec)}</>}
          </button>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted, marginTop: 14 }}>
        <span>Risk / Reward</span><span style={{ color: C.text }}>{levelsRiskReward(levels, side, entry)}</span>
      </div>
      <AddLevelLink onClick={onEdit} />
    </div>
  );
}

const roundQtyShare = (v: number) => Math.round(v * 1e4) / 1e4;

export function levelsRiskReward(levels: LevelDraft[], side: Side, entry: number): string {
  let reward = 0, risk = 0;
  for (const l of levels) {
    if (l.tp !== undefined) reward += Math.abs(l.tp - entry) * l.qty;
    if (l.sl !== undefined) risk += Math.abs(entry - l.sl) * l.qty;
  }
  void side;
  return risk > 0 && reward > 0 ? (reward / risk).toFixed(2) : "—";
}

export function SelectBox({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", height: 36, borderRadius: 6, padding: "0 10px",
        border: `1px solid ${open ? C.accent : C.field}`, background: "transparent", color: C.text, fontSize: 14, cursor: "pointer",
      }}>{value}<span style={{ display: "flex", color: C.muted }}>{open ? <ChevronUp /> : <ChevronDown />}</span></button>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} width={ref.current?.offsetWidth}>
        {options.map(o => <MenuItem key={o} selected={o === value} onClick={() => { setOpen(false); onChange(o); }}>{o}</MenuItem>)}
      </Popover>
    </>
  );
}

function SubmitButton({ title, subtitle, disabled, onClick, color }: { title: string; subtitle: string; disabled: boolean; onClick: () => void; color: Side; sideColor: string }) {
  const [hover, setHover] = useState(false);
  const base = color === "buy" ? "var(--tv-trade-buy)" : "var(--tv-trade-sell)";
  const hov = color === "buy" ? "var(--tv-trade-buy-hover)" : "var(--tv-trade-sell-hover)";
  return (
    <button type="button" disabled={disabled} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      width: "100%", minHeight: 56, borderRadius: 8, border: "none", cursor: disabled ? "default" : "pointer",
      background: disabled ? C.seg : hover ? hov : base, color: disabled ? C.faint : "#fff",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, padding: "6px 10px",
    }}>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: 12, fontWeight: 500 }}>{subtitle}</span>
    </button>
  );
}

function PresetRow({ preset, onApply, onDelete }: { preset: OrderPreset; onApply: () => void; onDelete: () => void }) {
  const [hover, setHover] = useState(false);
  const t = preset.type === "market" ? "Market" : preset.type === "limit" ? "Limit" : "Stop";
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onApply} style={{
      display: "flex", alignItems: "center", gap: 8, margin: "0 6px", padding: "6px 10px", borderRadius: 6, cursor: "pointer", background: hover ? C.hover : "transparent",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preset.name}</div>
        <div style={{ fontSize: 12, color: C.muted }}>
          {t}{preset.tpTicks ? <> · <span style={{ color: C.tp }}>TP {preset.tpTicks}</span></> : null}{preset.slTicks ? <> · <span style={{ color: C.sl }}>SL {preset.slTicks}</span></> : null}
        </div>
      </div>
      {hover && (
        <button type="button" aria-label="Delete preset" onClick={e => { e.stopPropagation(); onDelete(); }} style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", display: "flex", padding: 2 }}>
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

function SavePresetDialog({ type, tpTicks, slTicks, onCancel, onSave }: { type: OrderType; tpTicks?: number; slTicks?: number; onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  const t = type === "market" ? "Market" : type === "limit" ? "Limit" : "Stop";
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-label="Save order preset" style={{ width: "calc(100% - 16px)", background: C.panel, borderRadius: 8, boxShadow: C.shadow }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px 20px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Save order preset</span>
          <HeaderBtn onClick={onCancel} label="Close"><CloseIcon size={20} /></HeaderBtn>
        </div>
        <div style={{ padding: "12px 20px 16px" }}>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 6 }}>Name</div>
          <Field>
            <input autoFocus aria-label="Preset name" placeholder="Enter preset name" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }} style={inputStyle} />
          </Field>
          <div style={{ color: C.muted, fontSize: 11, letterSpacing: 0.4, margin: "16px 0 8px" }}>ORDER PARAMETERS</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: "22px" }}>
            <li>{t} order</li>
            <li>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Exits
                <Tip text="Take profit and stop loss distances in ticks from the entry price"><span style={{ display: "flex", color: C.faint }}><InfoIcon size={14} /></span></Tip>
              </span>
              <div style={{ fontSize: 13 }}>
                {tpTicks ? <span style={{ color: C.tp, marginRight: 10 }}>TP {tpTicks}</span> : null}
                {slTicks ? <span style={{ color: C.sl }}>SL {slTicks}</span> : null}
                {!tpTicks && !slTicks && <span style={{ color: C.muted }}>None</span>}
              </div>
            </li>
          </ul>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 16px 16px", borderTop: `1px solid ${C.border}` }}>
          <DialogBtn onClick={onCancel}>Cancel</DialogBtn>
          <DialogBtn primary disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</DialogBtn>
        </div>
      </div>
    </div>
  );
}

export function DialogBtn({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" disabled={disabled} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      height: 34, padding: "0 14px", borderRadius: 6, fontSize: 14, cursor: disabled ? "default" : "pointer",
      border: primary ? "none" : `1px solid ${C.field}`,
      background: primary ? (disabled ? C.seg : hover ? "#434651" : "var(--tv-trade-dark-btn)") : hover ? C.hover : C.panel,
      color: primary ? (disabled ? C.faint : "var(--tv-trade-dark-btn-text)") : C.text,
    }}>{children}</button>
  );
}

// ---------- exit levels ----------

export function ExitLevelsView({ symbol, side, typeLabel, qty, entry, prec, ctx, qtyDec, step, initial, onConfirm, onDiscard, onClose }: {
  symbol: string; side: Side; typeLabel: string; qty: number; entry: number; prec: number; ctx: TicketCtx; qtyDec: number; step: number;
  initial: LevelDraft[]; onConfirm: (lv: LevelDraft[]) => void; onDiscard: () => void; onClose: () => void;
}) {
  // Level quantities are kept in units that add up to the order quantity
  const [levels, setLevels] = useState<LevelDraft[]>(() => {
    const sum = initial.reduce((s, l) => s + l.qty, 0) || 1;
    const scaled = initial.map(l => ({ ...l, qty: Math.round((l.qty / sum) * qty * 1e8) / 1e8 }));
    if (initial.length === 1) {
      // Adding a level splits off the smallest step, as TradingView does
      const first = scaled[0];
      if (qty < 2 * step - 1e-12) return scaled;
      const addQty = step;
      return [{ ...first, qty: Math.round((first.qty - addQty) * 1e8) / 1e8 }, { ...first, qty: addQty }];
    }
    return scaled;
  });
  const [expanded, setExpanded] = useState(levels.length - 1);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const total = qty || 1;
  const protectedPct = (levels.filter(l => l.tp !== undefined || l.sl !== undefined).reduce((s, l) => s + l.qty, 0) / total) * 100;
  const fmtPct = (v: number) => `${(Math.round(v * 100) / 100).toFixed(2)}%`;

  const setLevelQty = (i: number, v: number) => {
    setLevels(prev => {
      const next = prev.map(l => ({ ...l }));
      const others = next.reduce((s, l, j) => (j === i ? s : s + l.qty), 0);
      const max = Math.max(step, qty - (next.length - 1) * step);
      const val = Math.max(step, Math.min(max, v));
      next[i].qty = val;
      // The first level (or the last, when editing the first) absorbs the difference
      const k = i === 0 ? next.length - 1 : 0;
      next[k].qty = Math.max(step, Math.round((next[k].qty + (qty - others - val)) * 1e8) / 1e8);
      return next;
    });
  };
  const validLevel = (l: LevelDraft) => (l.tp === undefined || isValidExit(side, "tp", l.tp, entry)) && (l.sl === undefined || isValidExit(side, "sl", l.sl, entry));
  const allValid = levels.every(validLevel) && Math.abs(levels.reduce((s, l) => s + l.qty, 0) - qty) < step / 2 + 1e-9;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 12px 10px 10px", borderBottom: `1px solid ${C.border}` }}>
        <HeaderBtn onClick={onDiscard} label="Back"><ChevronLeft /></HeaderBtn>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Exit levels</span>
        <Tip text="Split the order into parts, each closed by its own take profit and stop loss. When one exit of a level fills, the other exit of that level is cancelled.">
          <span style={{ display: "flex", color: C.faint }}><HelpIcon size={16} /></span>
        </Tip>
        <span style={{ flex: 1 }} />
        <HeaderBtn onClick={onClose} label="Close"><CloseIcon size={20} /></HeaderBtn>
      </div>
      <div style={{ overflowY: "auto", padding: "14px 16px", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandLogo size={36} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{symbol}</div>
            <div style={{ color: C.muted, fontSize: 13 }}>{side === "buy" ? "Buy" : "Sell"} {typeLabel} {formatQty(qty)} @ {isFinite(entry) ? formatPrice(entry, prec) : "—"}</div>
          </div>
        </div>
        <div style={{ fontSize: 13, marginTop: 14 }}>Protected size <span style={{ color: C.muted }}>•</span> {fmtPct(protectedPct)}</div>
        <div style={{ height: 6, borderRadius: 3, background: C.seg, marginTop: 6, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, protectedPct)}%`, height: "100%", background: C.tp }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 12 }}>
          <span>Risk / Reward</span><span>{levelsRiskReward(levels, side, entry)}</span>
        </div>

        {levels.map((l, i) => (
          <div key={i} style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: C.muted, fontSize: 13, marginBottom: 6 }}>
              <span>Level {i + 1} <span>•</span> {fmtPct((l.qty / total) * 100)}</span>
              {levels.length > 1 && (
                <button type="button" aria-label={`Remove level ${i + 1}`} onClick={() => {
                  setLevels(prev => {
                    const next = prev.filter((_, j) => j !== i).map(x => ({ ...x }));
                    next[0].qty = Math.round((next[0].qty + l.qty) * 1e8) / 1e8;
                    return next;
                  });
                  setExpanded(0);
                }} style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", display: "flex", padding: 2 }}><TrashIcon /></button>
              )}
            </div>
            {expanded === i ? (
              <div style={{ background: C.subtle, borderRadius: 8, padding: "10px 12px 12px" }}>
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 6 }}>Units</div>
                <Field>
                  <input aria-label={`Level ${i + 1} units`} value={texts[`q${i}`] ?? formatAnchor("units", l.qty, qtyDec)}
                    onChange={e => { const t = e.target.value.replace(/[^0-9.]/g, ""); setTexts(s => ({ ...s, [`q${i}`]: t })); const v = parseFloat(t); if (isFinite(v)) setLevelQty(i, v); }}
                    onBlur={() => setTexts(s => { const n = { ...s }; delete n[`q${i}`]; return n; })} style={inputStyle} />
                  <span style={secondaryStyle}>{fmtPct((l.qty / total) * 100)}</span>
                </Field>
                {(["tp", "sl"] as const).map(role => {
                  const price = l[role];
                  const key = `${role}${i}`;
                  const valid = price === undefined || isValidExit(side, role, price, entry);
                  return (
                    <div key={role}>
                      <div style={{ color: C.muted, fontSize: 13, margin: "10px 0 6px" }}>{role === "tp" ? "Take profit, price" : "Stop loss, price"}</div>
                      <Field invalid={!valid} error={role === "tp" ? `Take profit should be ${side === "buy" ? "above" : "below"} the entry price` : `Stop loss should be ${side === "buy" ? "below" : "above"} the entry price`}>
                        <input aria-label={`Level ${i + 1} ${role === "tp" ? "take profit" : "stop loss"}`}
                          value={texts[key] ?? (price !== undefined ? price.toFixed(prec) : "")}
                          placeholder="None"
                          onChange={e => {
                            const t = e.target.value.replace(/[^0-9.]/g, "");
                            setTexts(s => ({ ...s, [key]: t }));
                            const v = parseFloat(t);
                            setLevels(prev => prev.map((x, j) => (j === i ? { ...x, [role]: isFinite(v) ? v : undefined } : x)));
                          }}
                          onBlur={() => setTexts(s => { const n = { ...s }; delete n[key]; return n; })} style={inputStyle} />
                        <span style={secondaryStyle}>{price !== undefined && isFinite(entry) ? `${exitValue("ticks", price, role, l.qty, ctx)} ticks` : ""}</span>
                      </Field>
                    </div>
                  );
                })}
              </div>
            ) : (
              <button type="button" onClick={() => setExpanded(i)} style={{
                width: "100%", textAlign: "left", border: "none", background: C.subtle, borderRadius: 6, padding: "8px 10px", cursor: "pointer", color: C.text, fontSize: 13,
                outline: validLevel(l) ? "none" : `1px solid ${C.sell}`,
              }}>
                {l.tp !== undefined && <><span style={{ color: C.tp }}>TP</span> {formatQty(l.qty)} @ {formatPrice(l.tp, prec)}</>}
                {l.tp !== undefined && l.sl !== undefined && <span style={{ color: C.muted }}> • </span>}
                {l.sl !== undefined && <><span style={{ color: C.sl }}>SL</span> {formatQty(l.qty)} @ {formatPrice(l.sl, prec)}</>}
                {l.tp === undefined && l.sl === undefined && <span style={{ color: C.muted }}>No exits</span>}
              </button>
            )}
          </div>
        ))}
        {levels.length * step < qty - step / 2 && (
          <AddLevelLink onClick={() => {
            setLevels(prev => {
              const next = prev.map(x => ({ ...x }));
              const biggest = next.reduce((bi, x, j) => (x.qty > next[bi].qty ? j : bi), 0);
              const take = Math.min(step, next[biggest].qty - step);
              if (take <= 0) return prev;
              next[biggest].qty = Math.round((next[biggest].qty - take) * 1e8) / 1e8;
              next.push({ ...next[next.length - 1], qty: take });
              setExpanded(next.length - 1);
              return next;
            });
          }} />
        )}
      </div>
      <div style={{ padding: "8px 16px 16px", display: "grid", gap: 8 }}>
        <button type="button" disabled={!allValid} onClick={() => onConfirm(levels)} style={{
          height: 40, borderRadius: 8, border: "none", fontSize: 14, cursor: allValid ? "pointer" : "default",
          background: allValid ? "var(--tv-trade-dark-btn)" : C.seg, color: allValid ? "var(--tv-trade-dark-btn-text)" : C.faint,
        }}>Confirm</button>
        <button type="button" onClick={onDiscard} style={{ height: 40, borderRadius: 8, border: `1px solid ${C.field}`, background: C.panel, color: C.text, fontSize: 14, cursor: "pointer" }}>Discard</button>
      </div>
    </>
  );
}
