"use client";

// Trading dialogs: pick a broker, connect Paper Trading, close / reverse a position,
// protect a position (TP/SL and exit levels), create a paper account and account settings.

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { engine, useEngineState, useTradingUi, tradingUi, openTicket, lastQtyFor } from "./store";
import {
  accountMetrics, activeAccount, orderPrice, positionViews, precisionOf, quoteOf, isValidExit, DEFAULT_BALANCE, ExitLevel,
} from "./engine";
import { useTradingSettings, useTicketPrefs } from "./settings";
import { AssetClass, ASSET_CLASS_LABEL, DEFAULT_LEVERAGE, formatMoney, formatPrice, formatQty, qtyStepOf, qtyDecimals, roundQty } from "./instruments";
import { TicketCtx, defaultExitTicks } from "./ticketMath";
import { useEscapeClose } from "../lib/useEscapeClose";
import { C, BrandLogo, SymbolAvatar, CloseIcon } from "./ui";
import { DialogBtn, ExitRow, ExitDraft, Field, inputStyle, secondaryStyle, AddLevelLink, ExitLevelsView, Checkbox, LevelDraft, levelsRiskReward } from "./OrderTicket";

export default function TradingDialogs() {
  const ui = useTradingUi();
  const d = ui.dialog;
  const close = () => tradingUi.set({ dialog: null });
  if (!d) return null;
  switch (d.kind) {
    case "broker": return <BrokerDialog then={d.then} onClose={close} />;
    case "connect": return <ConnectDialog then={d.then} onClose={close} />;
    case "close": return <ClosePositionDialog symbol={d.symbol} onClose={close} />;
    case "reverse": return <ReverseDialog symbol={d.symbol} onClose={close} />;
    case "position": return <PositionDialog symbol={d.symbol} onClose={close} />;
    case "createAccount": return <CreateAccountDialog onClose={close} />;
    case "accountSettings": return <AccountSettingsDialog accountId={d.accountId} onClose={close} />;
  }
}

function Modal({ children, onClose, width = 480, label, dim = true }: { children: React.ReactNode; onClose: () => void; width?: number; label: string; dim?: boolean }) {
  useEscapeClose(onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center",
      background: dim ? "rgba(0,0,0,0.25)" : "transparent", padding: 16,
    }}>
      <div role="dialog" aria-label={label} style={{
        width, maxWidth: "100%", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column",
        background: C.panel, color: C.text, borderRadius: 8, boxShadow: C.shadow, overflow: "hidden",
      }}>{children}</div>
    </div>,
    document.body,
  );
}

function ModalHeader({ title, onClose, icon, border = true }: { title: React.ReactNode; onClose: () => void; icon?: React.ReactNode; border?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 16px 16px 20px", borderBottom: border ? `1px solid ${C.border}` : "none" }}>
      {icon}
      <span style={{ fontSize: 20, fontWeight: 600, flex: 1, minWidth: 0 }}>{title}</span>
      <button type="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, border: "none", borderRadius: 6, background: "transparent", color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CloseIcon size={22} />
      </button>
    </div>
  );
}

const Footer = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px 18px", borderTop: `1px solid ${C.border}` }}>{children}</div>
);

// ---------- broker & connect ----------

function BrokerDialog({ then, onClose }: { then?: { side: "buy" | "sell"; symbol: string }; onClose: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Modal onClose={onClose} width={720} label="Trade with your broker">
      <ModalHeader title="Trade with your broker" onClose={onClose} border={false} />
      <div style={{ padding: "8px 20px 28px" }}>
        <button
          type="button"
          onClick={() => tradingUi.set({ dialog: { kind: "connect", then } })}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            width: 164, height: 150, borderRadius: 8, border: `1px solid ${hover ? C.faint : C.border}`, background: C.panel, color: C.text,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer",
            boxShadow: hover ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
          }}
        >
          <BrandLogo size={48} />
          <span style={{ fontSize: 14 }}>Paper Trading</span>
          <span style={{ fontSize: 11, color: C.muted, lineHeight: "14px", textAlign: "center" }}>Brokerage simulator by<br />TradingView</span>
        </button>
      </div>
    </Modal>
  );
}

function ConnectDialog({ then, onClose }: { then?: { side: "buy" | "sell"; symbol: string }; onClose: () => void }) {
  const connect = () => {
    engine.setConnected(true);
    onClose();
    if (then) openTicket({ symbol: then.symbol, side: then.side, type: "market" });
  };
  return (
    <Modal onClose={onClose} width={480} label="Paper Trading">
      <ModalHeader title="Paper Trading" icon={<BrandLogo size={48} />} onClose={onClose} border={false} />
      <div style={{ padding: "4px 40px 32px" }}>
        <button type="button" onClick={connect} autoFocus style={{
          width: "100%", height: 48, borderRadius: 8, border: "none", background: "var(--tv-trade-dark-btn)", color: "var(--tv-trade-dark-btn-text)",
          fontSize: 15, fontWeight: 600, cursor: "pointer",
        }}>Connect</button>
        <p style={{ fontSize: 14, lineHeight: "20px", margin: "20px 0 0", color: C.text }}>
          Paper Trading (also known as simulated trading) lets you practice buying and selling securities. The process is similar to real trading except no real money is used.
        </p>
        <p style={{ fontSize: 14, lineHeight: "20px", margin: "16px 0 0", color: C.text }}>
          Our Paper Trading engine is the perfect tool to polish your skills. We track everything: trade history, profit and loss, and more.
        </p>
      </div>
    </Modal>
  );
}

// ---------- close / reverse ----------

function PositionLine({ symbol }: { symbol: string }) {
  const state = useEngineState();
  const pos = positionViews(state).find(p => p.symbol === symbol);
  if (!pos) return null;
  return (
    <span style={{ fontSize: 14 }}>
      {symbol} <span style={{ color: C.muted }}>•</span> {pos.side === "buy" ? "Long" : "Short"} {formatQty(pos.qty)} @ {formatPrice(pos.avgPrice, precisionOf(state, symbol))}
    </span>
  );
}

function ClosePositionDialog({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const state = useEngineState();
  const pos = positionViews(state).find(p => p.symbol === symbol);
  const [partial, setPartial] = useState(false);
  const [text, setText] = useState(pos ? formatQty(pos.qty) : "");
  if (!pos) return null;
  const step = qtyStepOf(symbol);
  const qty = roundQty(parseFloat(text) || 0, symbol);
  const valid = !partial || (qty >= step - 1e-12 && qty <= pos.qty + 1e-12);
  const stepBy = (dir: 1 | -1) => setText(formatQty(Math.max(step, Math.min(pos.qty, roundQty((parseFloat(text) || 0) + dir * step, symbol) || step))));
  return (
    <Modal onClose={onClose} label="Close position">
      <ModalHeader title="Close position" onClose={onClose} />
      <div style={{ padding: "20px", display: "flex", gap: 12 }}>
        <SymbolAvatar symbol={symbol} size={28} />
        <div style={{ flex: 1 }}>
          <PositionLine symbol={symbol} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 14, width: "fit-content" }} onClick={() => setPartial(p => !p)}>
            <Checkbox checked={partial} /> Partial close
          </label>
          {partial && (
            <div style={{ marginTop: 14, marginLeft: -40 }}>
              <Field invalid={!valid} error={`Enter a quantity from ${formatQty(step)} to ${formatQty(pos.qty)}`}>
                <input aria-label="Quantity to close" autoFocus value={text} onChange={e => setText(e.target.value.replace(/[^0-9.]/g, ""))} style={inputStyle} />
                <span style={secondaryStyle}>of {formatQty(pos.qty)} units</span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <button type="button" aria-label="Increase" onClick={() => stepBy(1)} style={stepBtn}>▲</button>
                  <button type="button" aria-label="Decrease" onClick={() => stepBy(-1)} style={stepBtn}>▼</button>
                </span>
              </Field>
            </div>
          )}
        </div>
      </div>
      <Footer>
        <DialogBtn onClick={onClose}>Cancel</DialogBtn>
        <DialogBtn primary disabled={!valid} onClick={() => { engine.closePosition(symbol, partial ? qty : undefined); onClose(); }}>Close position</DialogBtn>
      </Footer>
    </Modal>
  );
}
const stepBtn: React.CSSProperties = { border: "none", background: "transparent", color: "var(--tv-trade-muted)", fontSize: 8, lineHeight: "10px", cursor: "pointer", padding: "0 2px" };

function ReverseDialog({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose} label="Reverse position">
      <div style={{ display: "flex", alignItems: "flex-start", padding: "24px 16px 0 40px" }}>
        <span style={{ fontSize: 20, fontWeight: 600, flex: 1, marginTop: 16 }}>Reverse {symbol} position?</span>
        <button type="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, border: "none", borderRadius: 6, background: "transparent", color: C.text, cursor: "pointer" }}>
          <CloseIcon size={22} />
        </button>
      </div>
      <p style={{ margin: "12px 40px 0", fontSize: 15, lineHeight: "22px" }}>Are you sure you want to reverse {symbol} position?</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "24px 40px 32px" }}>
        <DialogBtn onClick={onClose}>Cancel</DialogBtn>
        <DialogBtn primary onClick={() => { engine.reversePosition(symbol); onClose(); }}>Reverse position</DialogBtn>
      </div>
    </Modal>
  );
}

// ---------- protect position (TP/SL) ----------

function PositionDialog({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const state = useEngineState();
  const prefs = useTicketPrefs();
  useTradingSettings();
  const pos = positionViews(state).find(p => p.symbol === symbol);
  const acc = activeAccount(state);
  const metrics = accountMetrics(state);
  const prec = precisionOf(state, symbol);
  const tick = Math.pow(10, -prec);
  const initial = useMemo(() => ({
    tp: pos?.tpOrders[0] ? orderPrice(pos.tpOrders[0]) ?? null : null,
    sl: pos?.slOrders[0] ? orderPrice(pos.slOrders[0]) ?? null : null,
    multi: !!pos && (pos.tpOrders.length > 1 || pos.slOrders.length > 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const defaults = useMemo(() => {
    const d = defaultExitTicks(symbol, prec);
    return { tp: prefs.tpTicks ?? d.tp, sl: prefs.slTicks ?? d.sl };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tp, setTp] = useState<ExitDraft>({ on: initial.tp !== null, price: initial.tp });
  const [sl, setSl] = useState<ExitDraft>({ on: initial.sl !== null, price: initial.sl });
  const [tpMode, setTpMode] = useState(prefs.tpMode);
  const [slMode, setSlMode] = useState(prefs.slMode);
  const [tpSec, setTpSec] = useState(prefs.tpSecondary === prefs.tpMode ? "ticks" : prefs.tpSecondary);
  const [slSec, setSlSec] = useState(prefs.slSecondary === prefs.slMode ? "ticks" : prefs.slSecondary);
  const [tpText, setTpText] = useState<string | null>(null);
  const [slText, setSlText] = useState<string | null>(null);
  const [levels, setLevels] = useState<LevelDraft[] | null>(() => {
    if (!pos || !initial.multi) return null;
    const n = Math.max(pos.tpOrders.length, pos.slOrders.length);
    return Array.from({ length: n }, (_, i) => ({
      qty: (pos.tpOrders[i] || pos.slOrders[i])?.qty ?? 0,
      tp: pos.tpOrders[i] ? orderPrice(pos.tpOrders[i]) : undefined,
      sl: pos.slOrders[i] ? orderPrice(pos.slOrders[i]) : undefined,
    }));
  });
  const [view, setView] = useState<"main" | "levels">("main");
  if (!pos) return null;
  const q = quoteOf(state, symbol);
  const entry = pos.avgPrice;
  const exitRef = q ? (pos.side === "buy" ? q.bid : q.ask) : pos.last;
  const dirOf = (role: "tp" | "sl") => ((pos.side === "buy") === (role === "tp") ? 1 : -1);
  const tpPrice = tp.on && tp.price !== null ? tp.price : Math.round((entry + dirOf("tp") * defaults.tp * tick) / tick) * tick;
  const slPrice = sl.on && sl.price !== null ? sl.price : Math.round((entry + dirOf("sl") * defaults.sl * tick) / tick) * tick;
  const ctx: TicketCtx = { side: pos.side, entry, leverage: pos.leverage, equity: metrics.equity, available: metrics.availableFunds, precision: prec };
  const tpValid = !tp.on || isValidExit(pos.side, "tp", tpPrice, exitRef);
  const slValid = !sl.on || isValidExit(pos.side, "sl", slPrice, exitRef);
  const changed = levels
    ? true
    : (tp.on ? tpPrice : null) !== initial.tp || (sl.on ? slPrice : null) !== initial.sl || initial.multi;
  const canConfirm = changed && tpValid && slValid;

  const confirm = () => {
    const lv: ExitLevel[] = levels
      ? levels.map(l => ({ qty: l.qty, tp: l.tp, sl: l.sl }))
      : [{ qty: pos.qty, tp: tp.on ? tpPrice : undefined, sl: sl.on ? slPrice : undefined }];
    const r = engine.setPositionExits(symbol, lv.filter(l => l.tp !== undefined || l.sl !== undefined));
    if (r.ok) onClose();
  };

  return (
    <Modal onClose={onClose} width={400} label={`${symbol} position`} dim={false}>
      {view === "levels" ? (
        <ExitLevelsView
          symbol={symbol} side={pos.side} typeLabel="Position" qty={pos.qty} entry={entry} prec={prec} ctx={ctx}
          qtyDec={qtyDecimals(symbol)} step={qtyStepOf(symbol)}
          initial={levels ?? [{ qty: pos.qty, tp: tp.on ? tpPrice : undefined, sl: sl.on ? slPrice : undefined }]}
          onDiscard={() => setView("main")}
          onClose={onClose}
          onConfirm={lv => {
            if (lv.length <= 1) {
              setLevels(null);
              setTp(lv[0]?.tp !== undefined ? { on: true, price: lv[0].tp } : { on: false, price: null });
              setSl(lv[0]?.sl !== undefined ? { on: true, price: lv[0].sl } : { on: false, price: null });
            } else setLevels(lv);
            setView("main");
          }}
        />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 8px 16px" }}>
            <BrandLogo size={24} />
            <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{symbol}</span>
            <button type="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, border: "none", borderRadius: 6, background: "transparent", color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CloseIcon size={20} />
            </button>
          </div>
          <div style={{ padding: "0 16px 10px", fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
            {pos.side === "buy" ? "Long" : "Short"} {formatQty(pos.qty)} @ {formatPrice(pos.avgPrice, prec)}
          </div>
          <div style={{ padding: "12px 16px 4px", overflowY: "auto" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Exits</div>
            {levels ? (
              <div>
                {levels.map((l, i) => (
                  <div key={i} style={{ marginTop: 10, fontSize: 13 }}>
                    <div style={{ color: C.muted, marginBottom: 4 }}>Level {i + 1} • {((l.qty / pos.qty) * 100).toFixed(2)}%</div>
                    <div style={{ background: C.subtle, borderRadius: 6, padding: "8px 10px" }}>
                      {l.tp !== undefined && <><span style={{ color: C.tp }}>TP</span> {formatQty(l.qty)} @ {formatPrice(l.tp, prec)}</>}
                      {l.tp !== undefined && l.sl !== undefined && " • "}
                      {l.sl !== undefined && <><span style={{ color: C.sl }}>SL</span> {formatQty(l.qty)} @ {formatPrice(l.sl, prec)}</>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <ExitRow role="tp" draft={tp} price={tpPrice} mode={tpMode} secondary={tpSec} text={tpText} qty={pos.qty} ctx={ctx} valid={tpValid}
                  onToggle={on => setTp({ on, price: on ? tpPrice : null })}
                  onMode={m => { if (m === tpSec) setTpSec(tpMode); setTpMode(m); setTpText(null); }}
                  onSecondary={setTpSec} onSwap={() => { const s = tpSec; setTpSec(tpMode); setTpMode(s); setTpText(null); }}
                  onText={setTpText} onPrice={p => setTp({ on: true, price: p })} />
                <ExitRow role="sl" draft={sl} price={slPrice} mode={slMode} secondary={slSec} text={slText} qty={pos.qty} ctx={ctx} valid={slValid}
                  onToggle={on => setSl({ on, price: on ? slPrice : null })}
                  onMode={m => { if (m === slSec) setSlSec(slMode); setSlMode(m); setSlText(null); }}
                  onSecondary={setSlSec} onSwap={() => { const s = slSec; setSlSec(slMode); setSlMode(s); setSlText(null); }}
                  onText={setSlText} onPrice={p => setSl({ on: true, price: p })} />
              </>
            )}
            <div style={{ background: C.subtle, borderRadius: 8, padding: "10px 12px", marginTop: 14, display: "grid", gap: 6, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.muted }}>Risk / Reward</span>
                <span>{levels ? levelsRiskReward(levels, pos.side, entry) : tp.on && sl.on && Math.abs(entry - slPrice) > 0 ? (Math.abs(tpPrice - entry) / Math.abs(entry - slPrice)).toFixed(2) : "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.muted }}>Trade value ({pos.leverage}x)</span>
                <span>{formatMoney(pos.tradeValue)}<span style={{ fontSize: 10, marginLeft: 2 }}>USD</span></span>
              </div>
            </div>
            {pos.qty >= 2 * qtyStepOf(symbol) - 1e-12 && <AddLevelLink onClick={() => setView("levels")} />}
          </div>
          <div style={{ padding: "16px" }}>
            <button type="button" disabled={!canConfirm} onClick={confirm} style={{
              width: "100%", height: 48, borderRadius: 8, border: "none", fontSize: 15, fontWeight: 600, cursor: canConfirm ? "pointer" : "default",
              background: canConfirm ? "var(--tv-trade-dark-btn)" : C.seg, color: canConfirm ? "var(--tv-trade-dark-btn-text)" : C.faint,
            }}>Confirm</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------- accounts ----------

function CreateAccountDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState(String(DEFAULT_BALANCE));
  const bal = parseFloat(balance);
  const valid = name.trim().length > 0 && bal >= 1;
  return (
    <Modal onClose={onClose} width={420} label="Create account">
      <ModalHeader title="Create account" onClose={onClose} />
      <div style={{ padding: "16px 20px", display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: C.muted }}>Account name
          <Field><input autoFocus aria-label="Account name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="My paper account" /></Field>
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: C.muted }}>Initial balance
          <Field invalid={!(bal >= 1)} error="Enter a balance of at least 1 USD">
            <input aria-label="Initial balance" value={balance} onChange={e => setBalance(e.target.value.replace(/[^0-9.]/g, ""))} style={inputStyle} />
            <span style={secondaryStyle}>USD</span>
          </Field>
        </label>
      </div>
      <Footer>
        <DialogBtn onClick={onClose}>Cancel</DialogBtn>
        <DialogBtn primary disabled={!valid} onClick={() => { engine.createAccount(name, bal); onClose(); }}>Create account</DialogBtn>
      </Footer>
    </Modal>
  );
}

function AccountSettingsDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const state = useEngineState();
  const acc = state.accounts.find(a => a.id === accountId);
  const [name, setName] = useState(acc?.name ?? "");
  const [lev, setLev] = useState<Record<AssetClass, string>>(() => {
    const l = acc?.leverage ?? DEFAULT_LEVERAGE;
    return { stocks: String(l.stocks), forex: String(l.forex), crypto: String(l.crypto), commodities: String(l.commodities) };
  });
  const [resetBalance, setResetBalance] = useState(String(acc?.initialBalance ?? DEFAULT_BALANCE));
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!acc) return null;
  const levValid = (Object.values(lev) as string[]).every(v => parseFloat(v) >= 1 && parseFloat(v) <= 500);
  const save = () => {
    engine.updateAccount(accountId, {
      name,
      leverage: Object.fromEntries(Object.entries(lev).map(([k, v]) => [k, Math.round(parseFloat(v))])) as Record<AssetClass, number>,
    });
    onClose();
  };
  const rb = parseFloat(resetBalance);
  return (
    <Modal onClose={onClose} width={460} label="Account settings">
      <ModalHeader title="Account settings" onClose={onClose} />
      <div style={{ padding: "16px 20px", display: "grid", gap: 16, overflowY: "auto" }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: C.muted }}>Account name
          <Field><input aria-label="Account name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></Field>
        </label>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 0.4, color: C.muted, marginBottom: 8 }}>LEVERAGE</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {(Object.keys(ASSET_CLASS_LABEL) as AssetClass[]).map(k => (
              <label key={k} style={{ display: "grid", gap: 4, fontSize: 13, color: C.muted }}>{ASSET_CLASS_LABEL[k]}
                <Field invalid={!(parseFloat(lev[k]) >= 1 && parseFloat(lev[k]) <= 500)} error="1 to 500">
                  <span style={{ color: C.muted, fontSize: 13 }}>1:</span>
                  <input aria-label={`${ASSET_CLASS_LABEL[k]} leverage`} value={lev[k]} onChange={e => setLev(s => ({ ...s, [k]: e.target.value.replace(/[^0-9]/g, "") }))} style={inputStyle} />
                </Field>
              </label>
            ))}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.4, color: C.muted, marginBottom: 8 }}>RESET ACCOUNT</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <Field invalid={!(rb >= 1)} error="Enter a balance of at least 1 USD">
                <input aria-label="Starting balance" value={resetBalance} onChange={e => { setResetBalance(e.target.value.replace(/[^0-9.]/g, "")); setConfirmReset(false); }} style={inputStyle} />
                <span style={secondaryStyle}>USD</span>
              </Field>
            </div>
            {!confirmReset
              ? <DialogBtn onClick={() => setConfirmReset(true)} disabled={!(rb >= 1)}>Reset…</DialogBtn>
              : <DialogBtn primary onClick={() => { engine.resetAccount(accountId, rb); setConfirmReset(false); }}>Confirm reset</DialogBtn>}
          </div>
          {confirmReset && <div style={{ fontSize: 12, color: C.sell, marginTop: 6 }}>This deletes all positions, orders and history of this account and restarts it with {formatMoney(rb)} USD.</div>}
        </div>
        {state.accounts.length > 1 && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, fontSize: 13, color: C.muted }}>{confirmDelete ? "Delete this account and all its history?" : "Delete this paper account"}</span>
            {!confirmDelete
              ? <DialogBtn onClick={() => setConfirmDelete(true)}>Delete…</DialogBtn>
              : <DialogBtn primary onClick={() => { engine.deleteAccount(accountId); onClose(); }}>Delete account</DialogBtn>}
          </div>
        )}
      </div>
      <Footer>
        <DialogBtn onClick={onClose}>Cancel</DialogBtn>
        <DialogBtn primary disabled={!name.trim() || !levValid} onClick={save}>Save</DialogBtn>
      </Footer>
    </Modal>
  );
}

export { lastQtyFor };
