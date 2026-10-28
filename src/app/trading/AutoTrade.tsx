"use client";

// Auto-trading a chart strategy on the linked MetaTrader 5 account (trading/algo.ts): the
// "Auto-trade" button in the strategy report's toolbar, its dialog (lots, on / off, real-money
// confirmation, what it did lately), and the MT5 panel's "Algo" tab with every strategy that
// trades the account and the log of what they did.

import React, { useEffect, useState } from "react";
import { useBroker, mt5Symbol, type Mt5SymbolInfo } from "./broker";
import { useAlgo, setAutoTrade, forgetAlgo, type AlgoLogEntry, type ChartStrategy } from "./algo";
import { Shell, field, labelStyle, smallBtn } from "./Mt5Panel";
import { C } from "./ui";
import { displaySymbol } from "@/app/lib/symbolDisplay";

const timeText = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const ACTION_LABEL: Record<string, string> = { on: "On", off: "Off", lots: "Lots", open: "Opened", close: "Closed", skip: "Skipped", error: "Failed" };

function LogList({ entries, showName }: { entries: AlgoLogEntry[]; showName?: boolean }) {
  if (!entries.length) return <div style={{ color: C.muted, fontSize: 12, padding: "6px 0" }}>Nothing yet</div>;
  return (
    <div data-name="algo-log" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {entries.map(e => (
        <div key={e.id} data-name="algo-log-row" style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: "17px" }}>
          <span style={{ color: C.muted, whiteSpace: "nowrap", minWidth: 92 }}>{timeText(e.at)}</span>
          <span style={{ fontWeight: 600, minWidth: 54, color: !e.ok ? C.sell : e.action === "open" || e.action === "on" ? "var(--tv-color-live, #089981)" : undefined }}>{ACTION_LABEL[e.action] || e.action}</span>
          <span style={{ flex: 1, minWidth: 0 }}>{showName ? <b>{e.name}: </b> : null}{e.message}</span>
        </div>
      ))}
    </div>
  );
}

const positionText = (c: ChartStrategy) =>
  c.position ? `${c.position.dir > 0 ? "Long" : "Short"} since ${timeText((c.position.entryTime > 1e11 ? c.position.entryTime : c.position.entryTime * 1000))}` : "Flat (no position)";

// In the strategy report's toolbar (only with an MT5 account linked)
export function AutoTradePill({ chartId }: { chartId?: string }) {
  const { linked } = useBroker();
  const algo = useAlgo();
  const [open, setOpen] = useState(false);
  const chart = chartId ? algo.charts[chartId] : undefined;
  if (!linked || !chart) return null;
  const on = algo.strategies.some(s => s.key === chart.key && s.enabled);
  return (
    <>
      <button type="button" className="st-pill" data-name="auto-trade" aria-label="Auto-trade on MetaTrader 5" onClick={() => setOpen(true)}
        style={{ flexShrink: 0, whiteSpace: "nowrap" }}
        title={on ? `Trading ${linked.login} on MetaTrader 5` : "Trade this strategy on your MetaTrader 5 account"}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, marginRight: 6, background: on ? "var(--tv-color-live, #089981)" : C.muted, flex: "none" }} />
        {on ? `Auto-trading · MT5 ${linked.login}` : "Auto-trade"}
      </button>
      {open && <AutoTradeDialog chartId={chartId!} onClose={() => setOpen(false)} />}
    </>
  );
}

function AutoTradeDialog({ chartId, onClose }: { chartId: string; onClose: () => void }) {
  const { linked, live } = useBroker();
  const algo = useAlgo();
  const chart = algo.charts[chartId];
  const strat = chart ? algo.strategies.find(s => s.key === chart.key) : undefined;
  const on = !!strat?.enabled;
  const [lots, setLots] = useState(String(strat?.lots ?? 0.01));
  const [real, setReal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Mt5SymbolInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const isReal = (live?.account.mode || linked?.mode) === "real";
  const symbol = chart?.symbol;

  useEffect(() => {
    if (!symbol) return;
    let gone = false;
    mt5Symbol(symbol).then(i => { if (!gone) { setInfo(i); setInfoError(null); } }, e => { if (!gone) setInfoError(e?.message || "Not found at your broker"); });
    return () => { gone = true; };
  }, [symbol]);

  if (!chart) return null;
  const submit = async (enabled: boolean) => {
    setError(null);
    const v = parseFloat(lots);
    if (enabled && !(v > 0)) { setError("Enter the lots to trade"); return; }
    if (enabled && isReal && !real) { setError("Tick the box: this account trades real money"); return; }
    setBusy(true);
    try { await setAutoTrade(chart, { enabled, lots: v, confirmReal: real }); }
    catch (e: any) { setError(e?.message || "The broker didn't accept it"); }
    finally { setBusy(false); }
  };
  const log = strat ? algo.log.filter(e => e.strategy === strat.id).slice(0, 8) : [];
  const lotsChanged = on && strat && parseFloat(lots) !== strat.lots;

  return (
    <Shell title="Auto-trade" onClose={onClose} width={460} testId="auto-trade-dialog">
      <div style={{ fontSize: 13, lineHeight: "19px" }}>
        <div style={{ fontWeight: 600 }}>{chart.name}</div>
        <div style={{ color: C.muted }}>{displaySymbol(chart.symbol)} · {chart.timeframe} · on {linked?.login} · {linked?.server}
          <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 4, fontWeight: 600, textTransform: "uppercase",
            background: isReal ? "rgba(242,54,69,0.12)" : "rgba(41,98,255,0.12)", color: isReal ? C.sell : C.accent }}>{isReal ? "Real" : "Demo"}</span>
        </div>
        <div style={{ marginTop: 8 }} data-name="auto-trade-position">Strategy now: <b>{positionText(chart)}</b></div>
        {!chart.live && (
          <div role="status" style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(242,153,0,0.12)", fontSize: 12 }}>
            The chart isn&apos;t on live data (a replay, a past testing period or a closed market): it trades once it is.
          </div>
        )}
      </div>

      <label style={labelStyle} htmlFor="auto-trade-lots">Lots per trade</label>
      <input id="auto-trade-lots" style={field} value={lots} onChange={e => setLots(e.target.value)} inputMode="decimal" data-name="auto-trade-lots" onKeyDown={e => e.stopPropagation()} />
      <div style={{ fontSize: 12, color: infoError ? C.sell : C.muted, marginTop: 4 }} data-name="auto-trade-symbol">
        {infoError || (info ? `${info.symbol} at your broker: ${info.volume_min} to ${info.volume_max} lots, steps of ${info.volume_step}` : "Looking the symbol up at your broker…")}
      </div>

      <div style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: "17px" }}>
        The account follows the strategy: it goes long → buy, short → sell, closes → close, reverses → close and open the other way, at
        this size. It starts from the strategy&apos;s next signal (the position it holds now isn&apos;t copied), only touches its own
        trades, and runs while this chart is open.
      </div>

      {isReal && !on && (
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={real} onChange={e => setReal(e.target.checked)} data-name="auto-trade-real" />
          <span>I understand this strategy will trade <b>real money</b> on my account without asking each time</span>
        </label>
      )}
      {error && <div role="alert" data-name="auto-trade-error" style={{ marginTop: 10, padding: "6px 10px", borderRadius: 6, background: "rgba(242,54,69,0.1)", color: C.sell, fontSize: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {on ? (
          <>
            <button disabled={busy} onClick={() => submit(false)} data-name="auto-trade-off"
              style={{ flex: 1, height: 38, borderRadius: 6, border: `1px solid ${C.sell}`, background: "transparent", color: C.sell, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Switch off</button>
            {lotsChanged && <button disabled={busy} onClick={() => submit(true)} data-name="auto-trade-save"
              style={{ flex: 1, height: 38, borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Save lots</button>}
          </>
        ) : (
          <button disabled={busy || !!infoError} onClick={() => submit(true)} data-name="auto-trade-on"
            style={{ flex: 1, height: 38, borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontWeight: 600, cursor: busy || infoError ? "default" : "pointer", fontSize: 14, opacity: infoError ? 0.5 : 1 }}>
            {busy ? "Checking with the broker…" : "Switch on"}
          </button>
        )}
      </div>
      {on && <div data-name="auto-trade-status" style={{ marginTop: 8, fontSize: 12, color: "var(--tv-color-live, #089981)" }}>On: trading {strat!.lots} lots per signal</div>}

      {strat && (
        <>
          <div style={{ ...labelStyle, marginTop: 16 }}>Recent activity</div>
          <LogList entries={log} />
        </>
      )}
    </Shell>
  );
}

// The MT5 panel's "Algo" tab: every strategy trading the account, and what they did
export function AlgoTab() {
  const algo = useAlgo();
  const [busy, setBusy] = useState<number | null>(null);
  const onChart = (key: string) => Object.values(algo.charts).find(c => c.key === key);
  const toggle = async (key: string, enabled: boolean) => {
    const c = onChart(key);
    const s = algo.strategies.find(x => x.key === key)!;
    setBusy(s.id);
    try {
      // Switching back on needs the strategy on a chart (its current position is the starting point)
      if (enabled && !c) { window.alert("Open this strategy on its chart to switch it back on."); return; }
      await setAutoTrade(c || { key, name: s.name, symbol: s.symbol, timeframe: s.timeframe, barSeconds: 60, position: null, live: false },
        { enabled, lots: s.lots, confirmReal: s.real_confirmed });
    } catch (e: any) { window.alert(e?.message || "The broker didn't accept it"); }
    finally { setBusy(null); }
  };
  if (!algo.strategies.length) {
    return <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted }}>
      No strategy trades this account yet. Add a strategy to the chart and press <b>Auto-trade</b> in its report.
    </div>;
  }
  return (
    <div style={{ padding: "0 16px 12px" }} data-name="algo-tab">
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <thead>
          <tr>{["Strategy", "Symbol", "Timeframe", "Lots", "Tag", "Status", ""].map(h => <th key={h} style={{ textAlign: "left", fontWeight: 400, color: C.muted, fontSize: 12, padding: "6px 12px 6px 0", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {algo.strategies.map(s => {
            const c = onChart(s.key);
            return (
              <tr key={s.id} data-name="algo-row">
                <td style={{ padding: "7px 12px 7px 0", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{s.name}</td>
                <td style={{ padding: "7px 12px 7px 0", borderBottom: `1px solid ${C.border}` }}>{displaySymbol(s.symbol)}</td>
                <td style={{ padding: "7px 12px 7px 0", borderBottom: `1px solid ${C.border}` }}>{s.timeframe}</td>
                <td style={{ padding: "7px 12px 7px 0", borderBottom: `1px solid ${C.border}` }}>{s.lots}</td>
                <td style={{ padding: "7px 12px 7px 0", borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: 12 }}>{s.comment}</td>
                <td style={{ padding: "7px 12px 7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  {s.enabled
                    ? <span style={{ color: c ? "var(--tv-color-live, #089981)" : "#f29900" }}>{c ? (c.live ? "On · running" : "On · chart not live") : "On · chart not open"}</span>
                    : <span style={{ color: C.muted }}>Off</span>}
                </td>
                <td style={{ padding: "7px 0", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", textAlign: "right" }}>
                  <button style={smallBtn} disabled={busy === s.id} data-name="algo-toggle" onClick={() => toggle(s.key, !s.enabled)}>{s.enabled ? "Switch off" : "Switch on"}</button>
                  {!s.enabled && <button style={{ ...smallBtn, marginLeft: 6 }} data-name="algo-forget"
                    onClick={() => window.confirm(`Forget "${s.name}" and its log? Its open position, if any, stays at the broker.`) && forgetAlgo(s.id)}>Forget</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <LogList entries={algo.log.slice(0, 50)} showName />
    </div>
  );
}
