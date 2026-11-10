"use client";

// The mobile terminal (/m): an MT5-style trading app for phones. Only phones open it, and only the
// accounts with unlimited access (anyone else gets "not found"; the server refuses them too).
// iPhones get the Apple layout, Android phones the Android one (from the user's screen recordings
// of the two apps). Quotes, Chart(s), Trade, History, and Messages (Android) / Settings (Apple).
// Trading is on the server (core/mobile.py): fills at the live MT5 bid / ask, SL / TP and pending
// orders triggered there as ticks come in.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAccess } from "@/lib/access";
import MobileChart, { DEFAULT_PREFS, TIMEFRAMES, type ChartPrefs } from "./MobileChart";
import {
  SYMBOLS, SYMBOL_NAMES, cancelOrder, closePosition, digitsOf, fmtMoney, kindLabel, liveAccount, liveProfit, loadHistory,
  modifyPosition, placeOrder, pointOf, refreshAccount, splitPrice, startQuotes, useAccount, useQuotes,
  type Position, type Quote,
} from "./data";

type Skin = "ios" | "android";
type Tab = "quotes" | "chart" | "trade" | "history" | "messages" | "settings";
const BLUE = "#2f8cff", RED = "#ef5350", MUTED = "#8e8e93", LINE = "#1f1f1f", ORANGE = "#ff9800";

// ---------------------------------------------------------------- the device
function deviceOf(): { phone: boolean; skin: Skin } {
  if (typeof navigator === "undefined") return { phone: false, skin: "android" };
  const ua = navigator.userAgent;
  const iphone = /iPhone|iPod/i.test(ua);
  const androidPhone = /Android/i.test(ua) && /Mobile/i.test(ua);
  return { phone: iphone || androidPhone, skin: iphone ? "ios" : "android" };
}

// ---------------------------------------------------------------- icons (drawn here)
const I = ({ d, size = 24, fill }: { d: string; size?: number; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const ICON = {
  menu: "M4 7h16M4 12h16M4 17h16",
  quotes: "M8 4v16M8 4 5 7M8 4l3 3M16 20V4M16 20l-3-3M16 20l3-3",
  chart: "M7 4v16M17 4v16M5 8h4v8H5zM15 6h4v9h-4z",
  trade: "M3 17l5-6 4 3 4-6 5 5",
  history: "M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4",
  messages: "M4 5h12v9H8l-4 3zM9 17h7l4 3V9h-2",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.1z",
  cross: "M12 3v18M3 12h18",
  indicators: "M3 17l4-6 4 3 5-8 5 6",
  plus: "M12 5v14M5 12h14",
  pencil: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6 6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  up: "M6 15l6-6 6 6",
  check: "M5 12l5 5 9-10",
  order: "M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14h6",
  sort: "M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  oneclick: "M4 7h7v10H4zM13 7h7v10h-7z",
};

// ---------------------------------------------------------------- pieces
function Price({ v, d, color, size = 24 }: { v: number; d: number; color: string; size?: number }) {
  const [a, b, c] = splitPrice(v, d);
  return (
    <span style={{ color, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
      <span style={{ fontSize: size * 0.62 }}>{a}</span><span style={{ fontSize: size, fontWeight: 500 }}>{b}</span>
      {c && <sup style={{ fontSize: size * 0.5, verticalAlign: "top", position: "relative", top: 2 }}>{c}</sup>}
    </span>
  );
}
const tickColor = (q?: Quote) => (!q ? "#fff" : q.dir > 0 ? BLUE : q.dir < 0 ? RED : "#fff");
const sideColor = (side: string) => (side.startsWith("buy") ? BLUE : RED);
const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateTime = (s: number) => new Date(s * 1000).toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(",", "");

function Row({ label, value }: { label: string; value: string }) {
  // "Balance: ......... 104 192.00": MT5's dotted leaders
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "3px 0", fontSize: 16 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ flex: 1, borderBottom: "2px dotted #3a3a3a", transform: "translateY(-4px)" }} />
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Stepper({ value, onChange, step, digits, placeholder, color }: { value: number | null; onChange: (v: number | null) => void; step: number; digits: number; placeholder: string; color?: string }) {
  const [text, setText] = useState(value === null ? "" : value.toFixed(digits));
  useEffect(() => { setText(value === null ? "" : value.toFixed(digits)); }, [value, digits]);
  return (
    <div style={{ display: "flex", alignItems: "center", flex: 1, borderBottom: `1px solid ${color || "#3a3a3a"}`, height: 40 }}>
      <button type="button" onClick={() => value !== null && onChange(+(value - step).toFixed(digits))} style={btnBare(BLUE, 22)}>−</button>
      <input inputMode="decimal" value={text} placeholder={placeholder} onChange={e => setText(e.target.value)}
        onBlur={() => { const n = parseFloat(text.replace(",", ".")); onChange(isFinite(n) && n > 0 ? +n.toFixed(digits) : null); }}
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "#fff", textAlign: "center", fontSize: 16, outline: "none" }} />
      <button type="button" onClick={() => onChange(value === null ? null : +(value + step).toFixed(digits))} style={btnBare(BLUE, 22)}>+</button>
    </div>
  );
}
const btnBare = (color: string, size = 15): React.CSSProperties => ({ background: "transparent", border: "none", color, fontSize: size, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit" });

// ---------------------------------------------------------------- the app
export default function MobileApp() {
  const { user, loading } = useAuth() as any;
  const { access } = useAccess();
  const [device, setDevice] = useState<{ phone: boolean; skin: Skin } | null>(null);
  useEffect(() => { setDevice(deviceOf()); }, []);

  if (!device) return <div style={{ position: "fixed", inset: 0, background: "#000" }} />;
  if (!device.phone) return <Refused text="Open this page on your phone." />;
  if (loading) return <div style={{ position: "fixed", inset: 0, background: "#000" }} />;
  if (!user || (access && !access.unlimited)) return <Refused text="404 · This page could not be found." />;
  if (!access) return <div style={{ position: "fixed", inset: 0, background: "#000" }} />;
  return <Terminal skin={device.skin} uid={user.uid} />;
}

function Refused({ text }: { text: string }) {
  return <div style={{ position: "fixed", inset: 0, background: "#000", color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, Roboto, sans-serif", fontSize: 15, padding: 24, textAlign: "center" }}>{text}</div>;
}

type Overlay =
  | { kind: "order"; symbol: string }
  | { kind: "modify"; id: number }
  | { kind: "result"; title: string; lines: string[]; ok: boolean }
  | { kind: "sheet"; title: string; items: { label: string; red?: boolean; run: () => void }[] }
  | { kind: "chartSettings" }
  | { kind: "timeframes" }
  | null;

function Terminal({ skin, uid }: { skin: Skin; uid: string }) {
  const ios = skin === "ios";
  const quotes = useQuotes();
  const acc0 = useAccount();
  const acc = useMemo(() => (acc0 ? liveAccount(acc0, quotes) : null), [acc0, quotes]);
  const [tab, setTab] = useState<Tab>("chart");
  const [symbol, setSymbol] = useState("XAUUSD");
  const [tf, setTf] = useState("M1");
  const [volume, setVolume] = useState(0.01);
  const [oneClick, setOneClick] = useState(true);
  const [prefs, setPrefs] = useState<ChartPrefs>(DEFAULT_PREFS);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    startQuotes();
    refreshAccount(uid);
    // (the server fills stops and pending orders on its own: the account is read again now and then)
    const id = setInterval(() => { if (document.visibilityState === "visible") refreshAccount(uid); }, 3000);
    return () => clearInterval(id);
  }, [uid]);
  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem("m:prefs") || "null"); if (p) setPrefs({ ...DEFAULT_PREFS, ...p }); } catch { /* none */ }
  }, []);
  const savePrefs = (p: ChartPrefs) => { setPrefs(p); try { localStorage.setItem("m:prefs", JSON.stringify(p)); } catch { /* full */ } };

  const result = (ok: boolean, title: string, lines: string[]) => setOverlay({ kind: "result", ok, title, lines });
  const trade = useCallback(async (kind: "buy" | "sell", sym: string, vol: number, sl: number | null = null, tp: number | null = null) => {
    if (busy) return;
    setBusy(true);
    const r = await placeOrder({ symbol: sym, kind, volume: vol, sl, tp }).catch(() => ({ ok: false, data: { error: "No connection." } }));
    setBusy(false);
    const d = digitsOf(sym);
    if (r.ok) result(true, "Done", [`market ${kind} ${vol.toFixed(2)} ${sym} at ${Number(r.data.price).toFixed(d)}`, "done"]);
    else result(false, "Rejected", [r.data?.error || "The order was rejected."]);
  }, [busy]);
  const oneClickTrade = async (kind: "buy" | "sell") => {
    const r = await placeOrder({ symbol, kind, volume }).catch(() => ({ ok: false, data: { error: "No connection." } }));
    setToast(r.ok ? `${symbol}  ${kind === "buy" ? "Buy" : "Sell"}  ${volume.toFixed(2)}   done` : r.data?.error || "Rejected");
  };
  const [toast, setToastState] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setToast = (t: string) => { setToastState(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastState(null), 2500); };

  const openChart = (s: string) => { setSymbol(s); setTab("chart"); setOverlay(null); };
  const quoteMenu = (s: string) => setOverlay({
    kind: "sheet", title: `${s}: ${SYMBOL_NAMES[s] || s}`,
    items: ios
      ? [{ label: "Trade", red: true, run: () => setOverlay({ kind: "order", symbol: s }) }, { label: "Chart", run: () => openChart(s) }]
      : [{ label: "New Order", run: () => setOverlay({ kind: "order", symbol: s }) }, { label: "Chart", run: () => openChart(s) }],
  });

  const font = ios ? "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif" : "Roboto, 'Segoe UI', sans-serif";
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "quotes", label: "Quotes", icon: ICON.quotes }, { id: "chart", label: ios ? "Chart" : "Charts", icon: ICON.chart },
    { id: "trade", label: "Trade", icon: ICON.trade }, { id: "history", label: "History", icon: ICON.history },
    ios ? { id: "settings", label: "Settings", icon: ICON.settings } : { id: "messages", label: "Messages", icon: ICON.messages },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", color: "#fff", fontFamily: font, display: "flex", flexDirection: "column", overflow: "hidden", userSelect: "none", WebkitTapHighlightColor: "transparent" } as React.CSSProperties}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", paddingBottom: ios ? 86 : 0 }}>
        {tab === "quotes" && <QuotesScreen ios={ios} quotes={quotes} onTap={quoteMenu} />}
        {tab === "chart" && (
          <ChartScreen ios={ios} symbol={symbol} tf={tf} quote={quotes[symbol]} prefs={prefs} oneClick={oneClick} volume={volume} setVolume={setVolume}
            positions={(acc?.positions || []).filter(p => p.symbol === symbol)} orders={(acc?.orders || []).filter(o => o.symbol === symbol)}
            selected={selected} onSelect={setSelected} onTrade={oneClickTrade} onToggleOneClick={() => setOneClick(o => !o)}
            onTimeframes={() => setOverlay({ kind: "timeframes" })} onNewOrder={() => setOverlay({ kind: "order", symbol })}
            onSymbolList={() => setOverlay({ kind: "sheet", title: "Symbols", items: SYMBOLS.map(s => ({ label: s, run: () => openChart(s) })) })}
            onChartMenu={() => setOverlay({ kind: "sheet", title: `${symbol}: ${SYMBOL_NAMES[symbol] || symbol}`, items: [
              { label: "Trade", red: true, run: () => setOverlay({ kind: "order", symbol }) },
              { label: "Indicators", run: () => setOverlay({ kind: "chartSettings" }) },
              { label: "Settings", run: () => setOverlay({ kind: "chartSettings" }) },
            ] })}
            onSettings={() => setOverlay({ kind: "chartSettings" })}
            onClosePos={async id => { setSelected(null); const p = acc?.positions.find(x => x.id === id); const r = await closePosition(id); if (r.ok && p) setToast(`close ${p.symbol} ${p.side} ${p.volume.toFixed(2)}   done`); else if (!r.ok) setToast(r.data?.error || "Rejected"); }}
            onModifyPos={id => { setSelected(null); setOverlay({ kind: "modify", id }); }} />
        )}
        {tab === "trade" && acc && <TradeScreen ios={ios} acc={acc} quotes={quotes} onNew={() => setOverlay({ kind: "order", symbol })}
          onPosition={p => setOverlay({ kind: "sheet", title: `${p.symbol}, ${p.side} ${p.volume.toFixed(2)}`, items: [
            { label: "Close position", red: true, run: async () => { setOverlay(null); const r = await closePosition(p.id); if (!r.ok) result(false, "Rejected", [r.data?.error || ""]); } },
            { label: "Modify position", run: () => setOverlay({ kind: "modify", id: p.id }) },
            { label: "Chart", run: () => openChart(p.symbol) },
          ] })}
          onOrder={o => setOverlay({ kind: "sheet", title: `${o.symbol}, ${kindLabel(o.kind)} ${o.volume.toFixed(2)}`, items: [
            { label: "Delete order", red: true, run: async () => { setOverlay(null); await cancelOrder(o.id); } },
            { label: "Chart", run: () => openChart(o.symbol) },
          ] })} />}
        {tab === "history" && <HistoryScreen ios={ios} />}
        {tab === "messages" && <Empty icon={ICON.messages} text="No messages" />}
        {tab === "settings" && <SettingsScreen onChart={() => setOverlay({ kind: "chartSettings" })} acc={acc} />}
      </div>

      <TabBar ios={ios} tabs={tabs} tab={tab} onTab={t => { setTab(t); setSelected(null); }} />

      {toast && (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: ios ? 100 : 70, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 6, background: "#2a2a2a", fontSize: 13, zIndex: 30 }}>
          <span style={{ flex: 1 }}>{toast}</span>
        </div>
      )}
      {overlay?.kind === "order" && <OrderScreen ios={ios} symbol={overlay.symbol} quote={quotes[overlay.symbol]} busy={busy}
        position={acc?.positions.find(p => p.symbol === overlay.symbol)}
        onBack={() => setOverlay(null)} onTrade={(k, v, sl, tp) => trade(k, overlay.symbol, v, sl, tp)}
        onPending={async (kind, v, price, sl, tp) => {
          const r = await placeOrder({ symbol: overlay.symbol, kind, volume: v, price, sl, tp });
          if (r.ok) result(true, "Done", [`${kindLabel(kind)} ${v.toFixed(2)} ${overlay.symbol} at ${price.toFixed(digitsOf(overlay.symbol))}`, "placed"]);
          else result(false, "Rejected", [r.data?.error || "The order was rejected."]);
        }}
        onClose={async id => { const r = await closePosition(id); if (r.ok) result(true, "Done", [`close #${id} by market at ${Number(r.data.price).toFixed(digitsOf(overlay.symbol))}`, "done"]); else result(false, "Rejected", [r.data?.error || ""]); }} />}
      {overlay?.kind === "modify" && acc && (() => {
        const p = acc.positions.find(x => x.id === overlay.id);
        if (!p) return null;
        return <ModifyScreen ios={ios} p={p} quote={quotes[p.symbol]} onBack={() => setOverlay(null)}
          onModify={async (sl, tp) => {
            const r = await modifyPosition(p.id, sl, tp);
            if (r.ok) result(true, "Done", [`modify #${p.id} ${p.side} ${p.volume.toFixed(2)} ${p.symbol}`, `sl: ${sl ?? "0"}`, `tp: ${tp ?? "0"}`, "done"]);
            else result(false, "Rejected", [r.data?.error || ""]);
          }} />;
      })()}
      {overlay?.kind === "result" && <ResultScreen ios={ios} ok={overlay.ok} title={overlay.title} lines={overlay.lines} onDone={() => setOverlay(null)} />}
      {overlay?.kind === "sheet" && <Sheet ios={ios} title={overlay.title} items={overlay.items} onCancel={() => setOverlay(null)} />}
      {overlay?.kind === "chartSettings" && <ChartSettings prefs={prefs} onChange={savePrefs} onBack={() => setOverlay(null)} />}
      {overlay?.kind === "timeframes" && <TimeframeWheel tf={tf} onPick={t => { setTf(t); setOverlay(null); }} onCancel={() => setOverlay(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- the tab bar
function TabBar({ ios, tabs, tab, onTab }: { ios: boolean; tabs: { id: Tab; label: string; icon: string }[]; tab: Tab; onTab: (t: Tab) => void }) {
  if (ios) {
    // the Apple layout: a floating rounded bar
    return (
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 18, height: 60, borderRadius: 30, background: "rgba(40,40,42,0.92)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", padding: "0 6px", zIndex: 20 }}>
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => onTab(t.id)} style={{ flex: 1, height: 50, borderRadius: 25, border: "none", background: tab === t.id ? "rgba(255,255,255,0.12)" : "transparent", color: tab === t.id ? BLUE : "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontSize: 10, fontFamily: "inherit" }}>
            <I d={t.icon} size={20} />{t.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div style={{ height: 64, display: "flex", borderTop: `1px solid ${LINE}`, background: "#000", flexShrink: 0 }}>
      {tabs.map(t => (
        <button key={t.id} type="button" onClick={() => onTab(t.id)} style={{ flex: 1, border: "none", background: "transparent", color: tab === t.id ? BLUE : "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, fontSize: 12, fontFamily: "inherit" }}>
          <span style={{ width: 52, height: 28, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: tab === t.id ? "#1c2a3e" : "transparent" }}><I d={t.icon} size={20} /></span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Header({ ios, title, sub, left, right }: { ios: boolean; title: React.ReactNode; sub?: React.ReactNode; left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 56, padding: "0 12px", flexShrink: 0 }}>
      {left ?? <span style={{ color: "#fff" }}><I d={ICON.menu} /></span>}
      <div style={{ flex: 1, minWidth: 0, textAlign: ios ? "center" : "left" }}>
        <div style={{ fontSize: sub ? 14 : 18, fontWeight: ios ? 600 : 400 }}>{title}</div>
        {sub && <div style={{ fontSize: 16, color: BLUE }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------- quotes
function QuotesScreen({ ios, quotes, onTap }: { ios: boolean; quotes: Record<string, Quote>; onTap: (s: string) => void }) {
  return (
    <>
      <Header ios={ios} title="Quotes" left={<span><I d={ios ? ICON.menu : ICON.menu} /></span>}
        right={<span style={{ display: "flex", gap: 16 }}>{!ios && <I d={ICON.plus} />}<I d={ICON.pencil} />{ios && <I d={ICON.search} />}</span>} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {SYMBOLS.map(s => {
          const q = quotes[s], d = digitsOf(s);
          const chg = q?.prevClose ? q.bid - q.prevClose : null;
          const pct = chg !== null && q?.prevClose ? (chg / q.prevClose) * 100 : null;
          const spread = q ? Math.round((q.ask - q.bid) / Math.pow(10, -d)) : null;
          return (
            <div key={s} onClick={() => onTap(s)} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${LINE}`, cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {chg !== null && <div style={{ fontSize: 12, color: chg >= 0 ? BLUE : RED }}>{chg >= 0 ? "+" : ""}{Math.round(chg / Math.pow(10, -d))} {pct!.toFixed(2)}%</div>}
                <div style={{ fontSize: 17, fontWeight: 600 }}>{s}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{q ? hhmmss(q.time) : "—"} ⌶ {spread ?? "—"}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 100 }}>
                {q ? <Price v={q.bid} d={d} color={tickColor(q)} /> : <span style={{ color: MUTED }}>—</span>}
                <div style={{ fontSize: 11, color: MUTED }}>L: {q?.low?.toFixed(d) ?? "—"}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 100, marginLeft: 10 }}>
                {q ? <Price v={q.ask} d={d} color={tickColor(q)} /> : <span style={{ color: MUTED }}>—</span>}
                <div style={{ fontSize: 11, color: MUTED }}>H: {q?.high?.toFixed(d) ?? "—"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- chart
function ChartScreen(props: {
  ios: boolean; symbol: string; tf: string; quote?: Quote; prefs: ChartPrefs; oneClick: boolean; volume: number; setVolume: (v: number) => void;
  positions: Position[]; orders: any[]; selected: number | null; onSelect: (id: number | null) => void; onTrade: (k: "buy" | "sell") => void;
  onToggleOneClick: () => void; onTimeframes: () => void; onNewOrder: () => void; onSymbolList: () => void; onChartMenu: () => void; onSettings: () => void;
  onClosePos: (id: number) => void; onModifyPos: (id: number) => void;
}) {
  const { ios, symbol, tf, quote, prefs } = props;
  const d = digitsOf(symbol);
  const interval = TIMEFRAMES.find(t => t.label === tf)?.interval || "1min";
  const step = (dir: 1 | -1) => props.setVolume(Math.max(0.01, +(props.volume + dir * (props.volume >= 1 ? 0.1 : 0.01)).toFixed(2)));
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 50, padding: "0 10px", flexShrink: 0 }}>
        {ios ? <button type="button" onClick={props.onTimeframes} style={btnBare("#fff", 15)}>{tf}</button> : <span><I d={ICON.menu} /></span>}
        <span style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <I d={ICON.cross} /><span onClick={props.onSettings}><I d={ICON.indicators} /></span>
          {!ios && <button type="button" onClick={props.onTimeframes} style={btnBare("#fff", 15)}>{tf}</button>}
          <span onClick={props.onTimeframes} style={{ color: RED }}><I d={ICON.clock} /></span>
          <span onClick={props.onToggleOneClick} style={{ color: props.oneClick ? BLUE : "#fff" }}><I d={ICON.oneclick} /></span>
        </span>
      </div>
      {props.oneClick && quote && (
        <div style={{ display: "flex", height: 52, flexShrink: 0 }}>
          <button type="button" onClick={() => props.onTrade("sell")} style={{ width: "34%", border: "none", background: quote.dir < 0 ? RED : BLUE, color: "#fff", textAlign: "left", padding: "2px 8px", fontFamily: "inherit" }}>
            <div style={{ fontSize: 10 }}>SELL</div><Price v={quote.bid} d={d} color="#fff" size={22} />
          </button>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-around", background: "#000" }}>
            <button type="button" onClick={() => step(-1)} style={btnBare("#fff", 16)}><I d={ICON.down} size={18} /></button>
            <span style={{ fontSize: 16 }}>{props.volume.toFixed(2)}</span>
            <button type="button" onClick={() => step(1)} style={btnBare("#fff", 16)}><I d={ICON.up} size={18} /></button>
          </div>
          <button type="button" onClick={() => props.onTrade("buy")} style={{ width: "34%", border: "none", background: quote.dir < 0 ? RED : BLUE, color: "#fff", textAlign: "left", padding: "2px 8px", fontFamily: "inherit" }}>
            <div style={{ fontSize: 10 }}>BUY</div><Price v={quote.ask} d={d} color="#fff" size={22} />
          </button>
        </div>
      )}
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
        <div onClick={props.onSymbolList} style={{ position: "absolute", left: 4, top: 4, zIndex: 5, fontSize: 13, lineHeight: "16px" }}>
          <span style={{ color: BLUE }}>{symbol}</span> • {tf}<div style={{ color: "#d1d4dc" }}>{SYMBOL_NAMES[symbol] || symbol}</div>
        </div>
        <MobileChart symbol={symbol} interval={interval} prefs={prefs} positions={props.positions} orders={props.orders} quote={quote}
          onSelectPosition={id => (id === null && ios ? props.onChartMenu() : props.onSelect(id))} />
        {props.selected !== null && (
          <div style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 22, background: "rgba(40,40,42,0.95)", zIndex: 6 }}>
            <button type="button" onClick={() => props.onSelect(null)} style={btnBare("#fff")}><I d={ICON.close} size={20} /></button>
            <button type="button" onClick={() => props.onClosePos(props.selected!)} style={{ ...btnBare(ORANGE, 14), border: `1px solid ${ORANGE}`, borderRadius: 16, padding: "4px 12px" }}>CLOSE</button>
            <button type="button" onClick={() => props.onModifyPos(props.selected!)} style={{ ...btnBare("#fff", 13), background: ORANGE, borderRadius: 16, padding: "4px 9px" }}>SL</button>
            <button type="button" onClick={() => props.onModifyPos(props.selected!)} style={{ ...btnBare("#fff", 13), background: "#2e9e4f", borderRadius: 16, padding: "4px 9px" }}>TP</button>
            <button type="button" onClick={() => props.onModifyPos(props.selected!)} style={btnBare(BLUE)}><I d={ICON.arrow} size={20} /></button>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- trade
function TradeScreen({ ios, acc, quotes, onNew, onPosition, onOrder }: {
  ios: boolean; acc: ReturnType<typeof liveAccount>; quotes: Record<string, Quote>; onNew: () => void; onPosition: (p: Position) => void; onOrder: (o: any) => void;
}) {
  return (
    <>
      <Header ios={ios} title={ios ? <span style={{ color: BLUE, fontSize: 18 }}>{fmtMoney(acc.profit)} {acc.currency}</span> : "Trade"}
        sub={ios ? undefined : `${fmtMoney(acc.profit)} ${acc.currency}`} left={ios ? <span style={{ width: 24 }} /> : undefined}
        right={<span style={{ display: "flex", gap: 16 }}>{!ios && <I d={ICON.sort} />}<span onClick={onNew}><I d={ios ? ICON.plus : ICON.order} /></span></span>} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "4px 14px 10px" }}>
          <Row label="Balance:" value={fmtMoney(acc.balance)} />
          <Row label="Equity:" value={fmtMoney(acc.equity)} />
          <Row label="Margin:" value={fmtMoney(acc.margin)} />
          <Row label={ios ? "Free Margin:" : "Free margin:"} value={fmtMoney(acc.free_margin)} />
          <Row label="Margin Level (%):" value={acc.margin_level === null ? "—" : fmtMoney(acc.margin_level)} />
        </div>
        {acc.positions.length > 0 && <SectionHead title="Positions" />}
        {acc.positions.map(p => {
          const q = quotes[p.symbol], pr = liveProfit(p, q), now = q ? (p.side === "buy" ? q.bid : q.ask) : p.price;
          return (
            <div key={p.id} onClick={() => onPosition(p)} style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${LINE}`, borderLeft: pr < 0 ? `3px solid ${ORANGE}` : "3px solid transparent", cursor: "pointer" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{p.symbol}, <span style={{ color: sideColor(p.side), fontWeight: 400 }}>{p.side} {p.volume.toFixed(2)}</span></div>
                <div style={{ fontSize: 15, color: "#cfcfcf" }}>{p.open_price.toFixed(p.digits)} → {now?.toFixed(p.digits) ?? "—"}</div>
              </div>
              <div style={{ fontSize: 18, color: pr < 0 ? RED : BLUE, fontWeight: 500 }}>{fmtMoney(pr)}</div>
            </div>
          );
        })}
        {acc.orders.length > 0 && <SectionHead title="Orders" />}
        {acc.orders.map(o => (
          <div key={o.id} onClick={() => onOrder(o)} style={{ padding: "8px 14px", borderBottom: `1px solid ${LINE}`, cursor: "pointer" }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{o.symbol}, <span style={{ color: sideColor(o.kind), fontWeight: 400 }}>{kindLabel(o.kind)} {o.volume.toFixed(2)}</span></div>
            <div style={{ fontSize: 15, color: "#cfcfcf" }}>at {o.price.toFixed(o.digits)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
const SectionHead = ({ title }: { title: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", background: "#111", color: "#cfcfcf", fontSize: 15, fontWeight: 600 }}><span>{title}</span><span>•••</span></div>
);

// ---------------------------------------------------------------- history
function HistoryScreen({ ios }: { ios: boolean }) {
  const [view, setView] = useState<"positions" | "orders" | "deals">("positions");
  const [data, setData] = useState<any>(null);
  useEffect(() => { const now = Date.now() / 1000; loadHistory(now - 30 * 86400, now + 60).then(setData); }, []);
  const list: any[] = data ? data[view] : [];
  return (
    <>
      <Header ios={ios} title="History" sub="All symbols" />
      <div style={{ display: "flex", borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
        {(["positions", "orders", "deals"] as const).map(v => (
          <button key={v} type="button" onClick={() => setView(v)} style={{ flex: 1, height: 42, border: "none", background: "transparent", color: view === v ? "#fff" : MUTED, borderBottom: view === v ? `2px solid ${BLUE}` : "2px solid transparent", fontSize: 13, letterSpacing: 0.5, fontFamily: "inherit" }}>{v.toUpperCase()}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!data ? null : !list.length ? <Empty icon={ICON.history} text="Empty history" /> : list.map((x: any) => (
          <div key={`${view}${x.id}`} style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${LINE}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{x.symbol}, <span style={{ color: sideColor(x.side || x.kind), fontWeight: 400 }}>{x.side || kindLabel(x.kind)} {Number(x.volume).toFixed(2)}{view === "deals" ? `, ${x.entry}` : ""}</span></div>
              <div style={{ fontSize: 13, color: "#cfcfcf" }}>
                {view === "positions" ? `${x.open_price.toFixed(x.digits)} → ${x.close_price?.toFixed(x.digits)}` : view === "orders" ? `${x.price.toFixed(x.digits)}, ${x.status}` : `at ${x.price.toFixed(x.digits)}`}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: MUTED }}>{dateTime(view === "positions" ? x.close_time : x.time)}</div>
              {view !== "orders" && <div style={{ fontSize: 16, color: x.profit < 0 ? RED : BLUE }}>{fmtMoney(x.profit)}</div>}
            </div>
          </div>
        ))}
        {data && (
          <div style={{ padding: "10px 14px" }}>
            <Row label="Profit:" value={fmtMoney(data.summary.profit)} />
            <Row label="Deposit:" value={fmtMoney(data.summary.deposit)} />
            <Row label="Balance:" value={fmtMoney(data.summary.balance)} />
          </div>
        )}
      </div>
    </>
  );
}
function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: MUTED, padding: 60 }}>
      <span style={{ color: "#3a3a3a" }}><I d={icon} size={84} /></span>{text}
    </div>
  );
}

// ---------------------------------------------------------------- settings (Apple)
function SettingsScreen({ onChart, acc }: { onChart: () => void; acc: ReturnType<typeof liveAccount> | null }) {
  return (
    <>
      <Header ios title="Settings" left={<span style={{ width: 24 }} />} />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px" }}>
        <div style={{ padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>TradePilot demo</div>
          <div style={{ fontSize: 13, color: MUTED }}>{acc ? `${fmtMoney(acc.balance)} ${acc.currency}, 1:${acc.leverage}` : ""}</div>
        </div>
        <button type="button" onClick={onChart} style={{ ...btnBare("#fff", 16), width: "100%", textAlign: "left", padding: "14px 0", borderBottom: `1px solid ${LINE}` }}>Charts</button>
        <a href="/chart" style={{ display: "block", padding: "14px 0", color: BLUE, fontSize: 16, textDecoration: "none" }}>Open TradePilot</a>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- new order
const ORDER_TYPES = [{ id: "market", label: "Market Execution" }, { id: "buy_limit", label: "Buy Limit" }, { id: "sell_limit", label: "Sell Limit" }, { id: "buy_stop", label: "Buy Stop" }, { id: "sell_stop", label: "Sell Stop" }];
function OrderScreen({ ios, symbol, quote, busy, position, onBack, onTrade, onPending, onClose }: {
  ios: boolean; symbol: string; quote?: Quote; busy: boolean; position?: Position;
  onBack: () => void; onTrade: (k: "buy" | "sell", v: number, sl: number | null, tp: number | null) => void;
  onPending: (kind: string, v: number, price: number, sl: number | null, tp: number | null) => void; onClose: (id: number) => void;
}) {
  const d = digitsOf(symbol), pt = pointOf(symbol);
  const [type, setType] = useState("market");
  const [vol, setVol] = useState(ios ? 0.01 : 1);
  const [sl, setSl] = useState<number | null>(null);
  const [tp, setTp] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  useEffect(() => { if (type !== "market" && price === null && quote) setPrice(+quote.bid.toFixed(d)); }, [type, price, quote, d]);
  const steps = ios ? [-0.5, -0.1, 0.1, 0.5] : [-5, -1, -0.1, 0.1, 1, 5];
  const addVol = (x: number) => setVol(v => Math.max(0.01, +(v + x).toFixed(2)));
  const startStop = (v: number | null, set: (n: number | null) => void, above: boolean) => set(v ?? (quote ? +(quote.bid + (above ? 1 : -1) * 100 * pt).toFixed(d) : null));
  return (
    <Screen>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 56, padding: "0 10px" }}>
        <button type="button" onClick={onBack} style={{ ...btnBare("#fff"), ...(ios ? { background: "#2a2a2c", borderRadius: 18, padding: 6 } : {}) }}><I d={ICON.back} /></button>
        <div style={{ flex: 1, textAlign: ios ? "center" : "left" }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{symbol}{ios ? " ⌄" : ""}</div>
          <div style={{ fontSize: 12, color: MUTED }}>{SYMBOL_NAMES[symbol] || symbol}</div>
        </div>
        {ios && <span style={{ width: 36 }} />}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px" }}>
        <div onClick={() => setTypeOpen(o => !o)} style={{ display: "flex", justifyContent: ios ? "space-between" : "center", alignItems: "center", height: 44, borderBottom: `1px solid #3a3a3a`, fontSize: 16, cursor: "pointer" }}>
          {ORDER_TYPES.find(t => t.id === type)!.label}<I d={ICON.down} size={16} />
        </div>
        {typeOpen && ORDER_TYPES.map(t => (
          <div key={t.id} onClick={() => { setType(t.id); setTypeOpen(false); setPrice(null); }} style={{ padding: "10px 6px", color: t.id === type ? BLUE : "#fff", borderBottom: `1px solid ${LINE}` }}>{t.label}</div>
        ))}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 50 }}>
          {steps.filter(x => x < 0).map(x => <button key={x} type="button" onClick={() => addVol(x)} style={btnBare(BLUE)}>{x}</button>)}
          <span style={{ fontSize: 17, fontWeight: 600, minWidth: 50, textAlign: "center" }}>{vol.toFixed(2)}</span>
          {steps.filter(x => x > 0).map(x => <button key={x} type="button" onClick={() => addVol(x)} style={btnBare(BLUE)}>+{x}</button>)}
        </div>
        {!ios && quote && (
          <div style={{ display: "flex", justifyContent: "center", gap: 40, padding: "8px 0" }}>
            <Price v={quote.bid} d={d} color={RED} size={28} /><Price v={quote.ask} d={d} color={BLUE} size={28} />
          </div>
        )}
        {type !== "market" && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
            <span style={{ width: 90, color: MUTED }}>Price</span>
            <Stepper value={price} onChange={setPrice} step={10 * pt} digits={d} placeholder="price" />
          </div>
        )}
        {ios ? (
          <>
            <StopRow label="Stop Loss" value={sl} onTap={() => startStop(sl, setSl, false)} onChange={setSl} step={10 * pt} d={d} color={ORANGE} />
            <StopRow label="Take Profit" value={tp} onTap={() => startStop(tp, setTp, true)} onChange={setTp} step={10 * pt} d={d} color="#2e9e4f" />
          </>
        ) : (
          <div style={{ display: "flex", gap: 16, padding: "10px 0" }}>
            <div style={{ flex: 1 }} onFocus={() => sl === null && startStop(sl, setSl, false)}><Stepper value={sl} onChange={setSl} step={10 * pt} digits={d} placeholder="SL" color={ORANGE} /></div>
            <div style={{ flex: 1 }} onFocus={() => tp === null && startStop(tp, setTp, true)}><Stepper value={tp} onChange={setTp} step={10 * pt} digits={d} placeholder="TP" color="#2e9e4f" /></div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", color: "#cfcfcf", borderBottom: `1px solid ${LINE}` }}><span>Fill Policy</span><span>Fill or Kill</span></div>
        {ios && quote && (
          <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 0" }}>
            <Price v={quote.bid} d={d} color={RED} size={30} /><Price v={quote.ask} d={d} color={BLUE} size={30} />
          </div>
        )}
        {type === "market" ? (
          ios ? (
            <>
              <div style={{ display: "flex", gap: 2 }}>
                <button type="button" disabled={busy} onClick={() => onTrade("sell", vol, sl, tp)} style={{ flex: 1, height: 44, border: "none", background: RED, color: "#fff", fontSize: 16, fontFamily: "inherit" }}>Sell by Market</button>
                <button type="button" disabled={busy} onClick={() => onTrade("buy", vol, sl, tp)} style={{ flex: 1, height: 44, border: "none", background: BLUE, color: "#fff", fontSize: 16, fontFamily: "inherit" }}>Buy by Market</button>
              </div>
              {position && (
                <button type="button" onClick={() => onClose(position.id)} style={{ width: "100%", marginTop: 4, padding: "8px 6px", border: "none", background: ORANGE, color: "#fff", fontSize: 14, fontFamily: "inherit" }}>
                  Close #{position.id} {position.side} {position.volume.toFixed(2)} by Market with Profit {fmtMoney(liveProfit(position, quote))}
                </button>
              )}
            </>
          ) : null
        ) : (
          <button type="button" disabled={busy || price === null} onClick={() => price !== null && onPending(type, vol, price, sl, tp)}
            style={{ width: "100%", height: 46, marginTop: 10, border: "none", background: BLUE, color: "#fff", fontSize: 15, fontFamily: "inherit" }}>PLACE</button>
        )}
        <div style={{ padding: "14px 6px", fontSize: 12, color: MUTED, textAlign: "center" }}>Attention! The trade will be executed at market conditions, difference with requested price may be significant!</div>
      </div>
      {!ios && type === "market" && (
        <div style={{ display: "flex", height: 56, borderTop: `1px solid ${LINE}` }}>
          <button type="button" disabled={busy} onClick={() => onTrade("sell", vol, sl, tp)} style={{ flex: 1, border: "none", background: "transparent", color: RED, fontSize: 16, fontWeight: 600, fontFamily: "inherit" }}>SELL<div style={{ fontSize: 10, fontWeight: 400 }}>BY MARKET</div></button>
          <button type="button" disabled={busy} onClick={() => onTrade("buy", vol, sl, tp)} style={{ flex: 1, border: "none", background: "transparent", color: BLUE, fontSize: 16, fontWeight: 600, fontFamily: "inherit" }}>BUY<div style={{ fontSize: 10, fontWeight: 400 }}>BY MARKET</div></button>
        </div>
      )}
    </Screen>
  );
}
function StopRow({ label, value, onTap, onChange, step, d, color }: { label: string; value: number | null; onTap: () => void; onChange: (v: number | null) => void; step: number; d: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", height: 44, borderBottom: `1px solid ${LINE}` }}>
      <span style={{ flex: 1, fontSize: 15 }}>{label}</span>
      <button type="button" onClick={() => (value === null ? onTap() : onChange(+(value - step).toFixed(d)))} style={btnBare(BLUE, 20)}>−</button>
      <span onClick={() => value !== null && onChange(null)} style={{ width: 110, textAlign: "center", color: value === null ? MUTED : color }}>{value === null ? "not set" : value.toFixed(d)}</span>
      <button type="button" onClick={() => (value === null ? onTap() : onChange(+(value + step).toFixed(d)))} style={btnBare(BLUE, 20)}>+</button>
    </div>
  );
}

// ---------------------------------------------------------------- modify position
function ModifyScreen({ ios, p, quote, onBack, onModify }: { ios: boolean; p: Position; quote?: Quote; onBack: () => void; onModify: (sl: number | null, tp: number | null) => void }) {
  const d = p.digits, pt = Math.pow(10, -d);
  const [sl, setSl] = useState<number | null>(p.sl);
  const [tp, setTp] = useState<number | null>(p.tp);
  const ref = quote ? (p.side === "buy" ? quote.bid : quote.ask) : p.open_price;
  return (
    <Screen>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 60, padding: "0 10px" }}>
        <button type="button" onClick={onBack} style={btnBare("#fff")}><I d={ICON.back} /></button>
        <div><div style={{ fontSize: 16, fontWeight: 600 }}>Modify position #{p.id}</div><div style={{ fontSize: 12, color: MUTED }}>{p.side} {p.volume.toFixed(2)} {p.symbol} at {p.open_price.toFixed(d)}</div></div>
      </div>
      <div style={{ flex: 1, padding: "0 14px" }}>
        {quote && <div style={{ display: "flex", justifyContent: "center", gap: 30, padding: "10px 0" }}><Price v={quote.bid} d={d} color={RED} size={28} /><Price v={quote.ask} d={d} color={BLUE} size={28} /></div>}
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }} onFocus={() => sl === null && setSl(+(ref + (p.side === "buy" ? -1 : 1) * 100 * pt).toFixed(d))}><Stepper value={sl} onChange={setSl} step={10 * pt} digits={d} placeholder="SL" color={ORANGE} /></div>
          <div style={{ flex: 1 }} onFocus={() => tp === null && setTp(+(ref + (p.side === "buy" ? 1 : -1) * 100 * pt).toFixed(d))}><Stepper value={tp} onChange={setTp} step={10 * pt} digits={d} placeholder="TP" color="#2e9e4f" /></div>
        </div>
      </div>
      <button type="button" onClick={() => onModify(sl, tp)} style={{ height: 56, border: "none", background: ios ? BLUE : "#1a1a1a", color: "#fff", fontSize: 16, fontWeight: 600, letterSpacing: 0.5, fontFamily: "inherit" }}>MODIFY</button>
    </Screen>
  );
}

// ---------------------------------------------------------------- results, sheets, settings, timeframes
function ResultScreen({ ios, ok, title, lines, onDone }: { ios: boolean; ok: boolean; title: string; lines: string[]; onDone: () => void }) {
  return (
    <Screen>
      {ios && <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 14px 0" }}><button type="button" aria-label="Done" onClick={onDone} style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: BLUE, color: "#fff" }}><I d={ICON.check} size={20} /></button></div>}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: ios ? "flex-start" : "center", gap: 6, padding: 24, textAlign: "center" }}>
        {!ios && <div style={{ width: 80, height: 80, borderRadius: 40, background: ok ? "#2e9e4f" : RED, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}><I d={ok ? ICON.check : ICON.close} size={40} /></div>}
        {!ios && <div style={{ fontSize: 22, fontWeight: 700 }}>{title}</div>}
        {lines.map((l, i) => <div key={i} style={{ fontSize: ios && i === 0 ? 18 : 15, color: ios ? "#fff" : "#cfcfcf", fontWeight: ios && i === 0 ? 600 : 400 }}>{l}</div>)}
      </div>
      {!ios && <button type="button" onClick={onDone} style={{ height: 56, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 16, fontWeight: 600, fontFamily: "inherit" }}>DONE</button>}
    </Screen>
  );
}
function Sheet({ ios, title, items, onCancel }: { ios: boolean; title: string; items: { label: string; red?: boolean; run: () => void }[]; onCancel: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40, display: "flex", alignItems: ios ? "center" : "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: ios ? "78%" : "100%", maxHeight: "80%", overflowY: "auto", background: ios ? "rgba(44,44,46,0.97)" : "#2a2a2a", borderRadius: ios ? 22 : 0, padding: ios ? 12 : "8px 0" }}>
        <div style={{ padding: ios ? "6px 6px 12px" : "10px 16px", textAlign: ios ? "center" : "left", color: ios ? "#fff" : MUTED, fontSize: ios ? 15 : 16, fontWeight: ios ? 600 : 400 }}>{title}</div>
        {[...items, ...(ios ? [{ label: "Cancel", run: onCancel }] : [])].map((it, i) => (
          <button key={i} type="button" onClick={it.run} style={{ display: "block", width: "100%", marginBottom: ios ? 8 : 0, padding: ios ? "11px 0" : "14px 16px", border: "none", borderRadius: ios ? 20 : 0, background: ios ? "rgba(70,70,74,0.9)" : "transparent", color: (it as any).red ? RED : "#fff", fontSize: 16, fontWeight: ios ? 600 : 400, textAlign: ios ? "center" : "left", fontFamily: "inherit" }}>{it.label}</button>
        ))}
      </div>
    </div>
  );
}
function ChartSettings({ prefs, onChange, onBack }: { prefs: ChartPrefs; onChange: (p: ChartPrefs) => void; onBack: () => void }) {
  const rows: { key: keyof ChartPrefs; title: string; text: string }[] = [
    { key: "positions", title: "Trade positions", text: "Show position open prices on the chart" },
    { key: "slTp", title: "SL/TP levels", text: "Show Stop Loss and Take Profit values on the chart" },
    { key: "grid", title: "Show grid", text: "Show grid on the chart" },
    { key: "askLine", title: "Ask price line", text: "Show Ask line" },
    { key: "ma", title: "Moving Average", text: `Show a ${prefs.maPeriod}-period moving average` },
  ];
  return (
    <Screen>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 56, padding: "0 10px" }}>
        <button type="button" onClick={onBack} style={btnBare("#fff")}><I d={ICON.back} /></button><span style={{ fontSize: 18 }}>Settings</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {rows.map(r => (
          <label key={r.key} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${LINE}` }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 16 }}>{r.title}</div><div style={{ fontSize: 13, color: MUTED }}>{r.text}</div></div>
            <input type="checkbox" checked={!!prefs[r.key]} onChange={e => onChange({ ...prefs, [r.key]: e.target.checked })} style={{ width: 20, height: 20, accentColor: BLUE }} />
          </label>
        ))}
      </div>
    </Screen>
  );
}
function TimeframeWheel({ tf, onPick, onCancel }: { tf: string; onPick: (t: string) => void; onCancel: () => void }) {
  // the timeframes round a dial, as on the chart's period wheel
  const R = 100;
  return (
    <div onClick={onCancel} style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: 2 * R + 60, height: 2 * R + 60, borderRadius: "50%", background: "#1f1f1f" }}>
        <div style={{ position: "absolute", inset: 46, borderRadius: "50%", background: "#000" }} />
        {TIMEFRAMES.map((t, i) => {
          const a = (-90 + (i * 360) / TIMEFRAMES.length) * (Math.PI / 180);
          return (
            <button key={t.label} type="button" onClick={() => onPick(t.label)} style={{ position: "absolute", left: R + 30 + R * Math.cos(a) - 22, top: R + 30 + R * Math.sin(a) - 14, width: 44, height: 28, border: "none", background: "transparent", color: t.label === tf ? BLUE : "#fff", fontSize: 15, fontWeight: 600, fontFamily: "inherit" }}>{t.label}</button>
          );
        })}
      </div>
    </div>
  );
}
const Screen = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: "absolute", inset: 0, background: "#000", zIndex: 35, display: "flex", flexDirection: "column" }}>{children}</div>
);
