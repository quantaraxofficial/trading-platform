"use client";

// Backtesting in Analytics:
// - backtest sessions: bar replays you come back to, each with its own account. Start a new one
//   (symbol, timeframe, start date, balance, strategy, rules, tags), resume it on the chart exactly
//   where it was left, and see its analytics;
// - strategy backtests saved from the Strategy Tester.
// Either opens into the full performance analytics and its trades, one at a time with a journal.

import React, { useEffect, useMemo, useState } from "react";
import { Clock, FlaskConical, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { backtestTrades, deleteBacktest, getBacktest, listBacktests, renameBacktest, type ATrade, type Journal, type SavedBacktest, type Source } from "./data";
import { chartUrlFor, createSession, deleteSession, freshAccount, getSession, listSessions, sessionTrades, spent, updateSession, type BacktestSession } from "./sessions";
import { money, pnlClass, type Period } from "./stats";
import Performance from "./Performance";
import TradeAnalysis from "./TradeAnalysis";
import { Card, Empty, Kpi, Label, Pills } from "./ui";
import { useEscapeClose } from "../lib/useEscapeClose";

type Opened = { kind: "session"; s: BacktestSession } | { kind: "strategy"; b: SavedBacktest };
const INTERVALS: [string, string][] = [["1min", "1m"], ["5min", "5m"], ["15min", "15m"], ["30min", "30m"], ["1h", "1h"], ["4h", "4h"], ["1day", "1D"], ["1week", "1W"]];
const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", paused: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  completed: "bg-purple-500/15 text-purple-200 border-purple-500/40",
};

export default function Backtests({ uid, journals, onJournal, openSessionId }: {
  uid: string; journals: Record<Source, Record<string, Journal>>; onJournal: (src: Source) => (key: string, j: Journal | null) => void; openSessionId?: number | null;
}) {
  const [runs, setRuns] = useState<SavedBacktest[] | null>(null);
  const [sessions, setSessions] = useState<BacktestSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [view, setView] = useState<"performance" | "trades">("performance");
  const [period, setPeriod] = useState<Period>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = () => {
    listBacktests(uid).then(setRuns, e => setError(e.message));
    listSessions(uid).then(setSessions, e => setError(e.message));
  };
  useEffect(() => { reload(); }, [uid]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Back from the chart (or another tab): fresh progress
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") listSessions(uid).then(setSessions, () => {}); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [uid]);
  useEffect(() => { if (openSessionId) openSession(openSessionId); }, [openSessionId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const openSession = (id: number) => getSession(uid, id).then(s => { setOpened({ kind: "session", s }); setView("performance"); setSelectedKey(null); }, e => setError(e.message));
  const openRun = (id: number) => getBacktest(uid, id).then(b => { setOpened({ kind: "strategy", b }); setView("performance"); setSelectedKey(null); }, e => setError(e.message));

  const totals = useMemo(() => {
    const ss = sessions || [], rs = runs || [];
    return {
      sessions: ss.length, time: ss.reduce((a, s) => a + s.time_spent, 0),
      trades: ss.reduce((a, s) => a + s.trade_count, 0) + rs.reduce((a, b) => a + b.trade_count, 0),
      net: ss.reduce((a, s) => a + s.net_pnl, 0) + rs.reduce((a, b) => a + b.net_profit, 0),
    };
  }, [sessions, runs]);

  const remove = async (key: string, fn: () => Promise<unknown>) => {
    if (confirmDelete !== key) { setConfirmDelete(key); return; }
    await fn().catch(e => setError(e.message));
    setConfirmDelete(null);
    reload();
  };
  const rename = async () => {
    if (!renaming) return;
    const [kind, id] = renaming.key.split(":");
    const name = renaming.name.trim();
    setRenaming(null);
    if (!name) return;
    await (kind === "s" ? updateSession(uid, +id, { name }) : renameBacktest(uid, +id, name)).catch(e => setError(e.message));
    reload();
  };
  const nameField = (key: string, name: string) => renaming?.key === key ? (
    <input autoFocus value={renaming.name} onClick={e => e.stopPropagation()} onChange={e => setRenaming({ key, name: e.target.value })}
      onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(null); }} onBlur={rename}
      className="w-full bg-gray-900/60 border border-purple-600/60 rounded px-2 py-1 text-sm text-white focus:outline-none" />
  ) : <div className="text-white font-semibold truncate">{name}</div>;
  const cardActions = (key: string, name: string, del: () => Promise<unknown>) => (
    <div className="flex gap-1 opacity-60 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
      <button aria-label="Rename" onClick={() => setRenaming({ key, name })} className="w-7 h-7 rounded-lg hover:bg-purple-800/40 text-purple-300 flex items-center justify-center"><Pencil size={14} /></button>
      <button aria-label={confirmDelete === key ? "Click again to delete" : "Delete"} onClick={() => remove(key, del)}
        className={`h-7 rounded-lg flex items-center justify-center gap-1 px-1.5 ${confirmDelete === key ? "bg-rose-500/20 text-rose-300 text-xs" : "hover:bg-purple-800/40 text-purple-300 w-7"}`}>
        <Trash2 size={14} />{confirmDelete === key && "Delete?"}
      </button>
    </div>
  );

  if (opened) {
    const isSession = opened.kind === "session";
    const trades: ATrade[] = isSession ? sessionTrades(opened.s) : backtestTrades(opened.b);
    const src: Source = isSession ? "session" : "backtest";
    const name = isSession ? opened.s.name : opened.b.name;
    const capital = isSession ? opened.s.initial_balance : opened.b.initial_capital;
    return (
      <div className="space-y-5" data-testid="backtest-open">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => { setOpened(null); setSelectedKey(null); reload(); }} className="text-sm text-purple-300 hover:text-white">← All backtests</button>
          <h2 className="text-xl font-bold text-white">{name}</h2>
          {isSession ? (
            <>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[opened.s.status]}`}>{opened.s.status}</span>
              <span className="text-xs text-purple-300/70">{opened.s.symbol} · {opened.s.interval_label || opened.s.interval} · at {new Date(opened.s.current_time * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {spent(opened.s.time_spent)} spent</span>
              <a href={chartUrlFor(opened.s)} target="_blank" rel="noreferrer" data-testid="session-resume"
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-700 hover:to-indigo-700"><Play size={14} />Resume on chart</a>
            </>
          ) : <span className="text-xs text-purple-300/70">{opened.b.symbol} · {opened.b.timeframe} · {opened.b.language} · capital {money(opened.b.initial_capital)}</span>}
          <div className="ml-auto"><Pills value={view} onChange={setView} testId="backtest-view" options={[{ id: "performance", label: "Performance" }, { id: "trades", label: "Trades" }]} /></div>
        </div>
        {isSession && (opened.s.strategy || opened.s.rules.length > 0 || opened.s.description) && (
          <Card title={opened.s.strategy || "Strategy"} subtitle={opened.s.description || undefined}>
            {opened.s.rules.length > 0 && <ol className="list-decimal list-inside text-sm text-purple-100 space-y-1">{opened.s.rules.map((r, i) => <li key={i}>{r}</li>)}</ol>}
            {opened.s.tags.length > 0 && <div className="flex gap-1.5 mt-3 flex-wrap">{opened.s.tags.map(t => <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-purple-700/30 border border-purple-600/40 text-purple-100">{t}</span>)}</div>}
          </Card>
        )}
        {view === "performance"
          ? <Performance trades={trades} initialBalance={capital} period={period} onPeriod={setPeriod} journals={journals[src]} exportName={name}
              exportSubtitle={isSession ? `Backtest session · ${opened.s.symbol} ${opened.s.interval_label || opened.s.interval}` : `Strategy backtest · ${opened.b.symbol} ${opened.b.timeframe}`}
              onOpenTrade={t => { setSelectedKey(t.key); setView("trades"); }}
              note={!isSession && opened.b.period_from && opened.b.period_to ? `Backtested ${new Date(opened.b.period_from).toLocaleDateString()} – ${new Date(opened.b.period_to).toLocaleDateString()}`
                : isSession ? `Started ${new Date(opened.s.start_time * 1000).toLocaleDateString()} · balance ${money(opened.s.balance)}` : undefined} />
          : <TradeAnalysis uid={uid} source={src} trades={trades} journals={journals[src]} onJournal={onJournal(src)} selectedKey={selectedKey} onSelect={setSelectedKey} exportName={name} />}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="backtests">
      <Card pad={false}>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-purple-800/30">
          <Kpi label="Sessions" value={totals.sessions} icon={<FlaskConical size={16} />} sub="Bar replays you come back to" />
          <Kpi label="Time backtesting" value={spent(totals.time)} icon={<Clock size={16} />} sub="Across your sessions" testId="kpi-time" />
          <Kpi label="Closed trades" value={totals.trades} sub="Sessions and saved backtests" />
          <Kpi label="Net P&L" value={money(totals.net, "USD", true)} valueClass={pnlClass(totals.net)} sub="Sessions and saved backtests" />
        </div>
      </Card>
      {error && <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold">Backtest sessions</h2>
          <span className="text-xs text-purple-300/70">Replay a market from a date, trade it, and come back to it exactly where you left</span>
          <button onClick={() => setCreating(true)} data-testid="new-session"
            className="ml-auto flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-700 hover:to-indigo-700 shadow-lg shadow-purple-700/25">
            <Plus size={15} />New session</button>
        </div>
        {sessions === null ? <Card><Empty>Loading…</Empty></Card> : sessions.length === 0 ? (
          <Card><Empty icon={<FlaskConical size={22} />}><div className="text-white font-semibold">No sessions yet</div>
            Start one here, or during a bar replay choose <b className="text-purple-200">Save as backtest session</b> in the replay menu.</Empty></Card>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sessions.map(s => (
              <div key={s.id} data-testid="session-card" data-session={s.id} onClick={() => openSession(s.id)}
                className="group bg-black/50 backdrop-blur-xl border border-purple-800/40 rounded-2xl p-5 hover:border-purple-500/60 transition-all cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white text-[11px] font-bold">{s.symbol.replace(/[^A-Z]/gi, "").slice(0, 3).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    {nameField(`s:${s.id}`, s.name)}
                    <div className="text-xs text-purple-300/70 mt-0.5">{s.symbol} · {s.interval_label || s.interval}{s.strategy ? ` · ${s.strategy}` : ""}</div>
                  </div>
                  {cardActions(`s:${s.id}`, s.name, () => deleteSession(uid, s.id))}
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className={`px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[s.status]}`}>{s.status}</span>
                  <span className="text-purple-300/80" data-testid="session-at">At {new Date(s.current_time * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-4">
                  <div><Label>Balance</Label><div className="mt-0.5 text-sm font-semibold text-white tabular-nums">{money(s.balance)}</div></div>
                  <div><Label>P&L</Label><div className={`mt-0.5 text-sm font-semibold tabular-nums ${pnlClass(s.net_pnl)}`}>{money(s.net_pnl, "USD", true)}</div></div>
                  <div><Label>Trades</Label><div className="mt-0.5 text-sm font-semibold text-white">{s.trade_count}{s.open_count ? <span className="text-purple-300/60 text-xs"> +{s.open_count} open</span> : null}</div></div>
                  <div><Label>Time</Label><div className="mt-0.5 text-sm font-semibold text-white">{spent(s.time_spent)}</div></div>
                </div>
                <a href={chartUrlFor(s)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} data-testid="session-card-resume"
                  className="mt-4 flex items-center justify-center gap-1.5 text-sm py-2 rounded-lg border border-purple-600/50 text-purple-100 hover:bg-purple-700/30">
                  <Play size={14} />{s.status === "completed" ? "Open on chart" : "Resume on chart"}</a>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold">Strategy backtests</h2>
          <span className="text-xs text-purple-300/70">Saved from the Strategy Tester (Pine, Python, MQL5)</span>
        </div>
        {runs === null ? <Card><Empty>Loading…</Empty></Card> : runs.length === 0 ? (
          <Card><Empty icon={<FlaskConical size={22} />}><div className="text-white font-semibold">No strategy backtests saved yet</div>
            Run a strategy on the chart, then press <b className="text-purple-200">Save to Analytics</b> in its Strategy Tester report.</Empty></Card>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {runs.map(b => (
              <div key={b.id} data-testid="backtest-card" onClick={() => openRun(b.id)}
                className="group bg-black/50 backdrop-blur-xl border border-purple-800/40 rounded-2xl p-5 hover:border-purple-500/60 transition-all cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white"><FlaskConical size={18} /></div>
                  <div className="flex-1 min-w-0">
                    {nameField(`b:${b.id}`, b.name)}
                    <div className="text-xs text-purple-300/70 mt-0.5">{b.symbol} · {b.timeframe || "—"} · {new Date(b.created_at).toLocaleDateString()}</div>
                  </div>
                  {cardActions(`b:${b.id}`, b.name, () => deleteBacktest(uid, b.id))}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div><Label>Net P&L</Label><div className={`mt-0.5 font-semibold tabular-nums ${pnlClass(b.net_profit)}`}>{money(b.net_profit, "USD", true)}</div></div>
                  <div><Label>Trades</Label><div className="mt-0.5 font-semibold text-white">{b.trade_count}</div></div>
                  <div><Label>Return</Label><div className={`mt-0.5 font-semibold tabular-nums ${pnlClass(b.net_profit)}`}>{b.initial_capital ? `${((b.net_profit / b.initial_capital) * 100).toFixed(2)}%` : "—"}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {creating && <NewSessionDialog uid={uid} onClose={() => setCreating(false)} onCreated={s => { setCreating(false); reload(); window.open(chartUrlFor(s), "_blank"); }} />}
    </div>
  );
}

// "New session": what to replay, from when, with what balance — and what you're testing
function NewSessionDialog({ uid, onClose, onCreated }: { uid: string; onClose: () => void; onCreated: (s: BacktestSession) => void }) {
  useEscapeClose(onClose);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("XAU/USD");
  const [interval, setInterval] = useState("15min");
  const [date, setDate] = useState(() => new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  const [time, setTime] = useState("00:00");
  const [balance, setBalance] = useState("10000");
  const [strategy, setStrategy] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [ruleDraft, setRuleDraft] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = INTERVALS.find(([id]) => id === interval)?.[1] || interval;
  const daily = /day|week/.test(interval);
  const field = "w-full bg-gray-900/50 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-500/70 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20";
  const create = async () => {
    setError(null);
    const sym = symbol.trim().toUpperCase();
    const start = Math.floor(new Date(daily ? `${date}T00:00:00Z` : `${date}T${time || "00:00"}`).getTime() / 1000);
    const bal = parseFloat(balance);
    if (!sym) { setError("Pick a symbol"); return; }
    if (!(start > 0) || start * 1000 > Date.now()) { setError("Pick a start date in the past"); return; }
    if (!(bal > 0)) { setError("The starting balance must be above 0"); return; }
    setBusy(true);
    try {
      const s = await createSession(uid, {
        name: name.trim() || `${sym} ${label} backtest`, symbol: sym, interval, interval_label: label, start_time: start, initial_balance: bal,
        strategy: strategy.trim(), description: description.trim(), rules, tags, account: freshAccount(`Backtest · ${name.trim() || sym}`, bal), book: {} as any,
      });
      onCreated(s);
    } catch (e: any) { setError(e?.message || "Couldn't create the session"); }
    finally { setBusy(false); }
  };
  const chips = (items: string[], set: (v: string[]) => void) => items.map(x => (
    <span key={x} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-700/30 border border-purple-600/40 text-purple-100">
      {x}<button aria-label={`Remove ${x}`} onClick={() => set(items.filter(i => i !== x))}><X size={11} /></button></span>
  ));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="New backtest session" data-testid="new-session-dialog"
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto bg-black/80 backdrop-blur-xl border border-purple-800/60 rounded-2xl p-6 shadow-2xl shadow-purple-900/40" onKeyDown={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center"><FlaskConical size={18} /></div>
          <div className="flex-1"><h2 className="text-xl font-bold">New backtest session</h2><p className="text-purple-300 text-sm">Replay a market from a date and trade it with its own balance</p></div>
          <button aria-label="Close" onClick={onClose} className="text-purple-300 hover:text-white"><X size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2"><span className="block text-purple-300 text-sm font-medium mb-1.5">Name</span>
            <input className={field} value={name} onChange={e => setName(e.target.value)} placeholder={`${symbol || "XAU/USD"} ${label} backtest`} data-testid="ns-name" /></label>
          <label><span className="block text-purple-300 text-sm font-medium mb-1.5">Symbol</span>
            <input className={field} value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="XAU/USD" data-testid="ns-symbol" /></label>
          <label><span className="block text-purple-300 text-sm font-medium mb-1.5">Timeframe</span>
            <select className={field} value={interval} onChange={e => setInterval(e.target.value)} data-testid="ns-interval">
              {INTERVALS.map(([id, l]) => <option key={id} value={id} className="bg-gray-900">{l}</option>)}
            </select></label>
          <label><span className="block text-purple-300 text-sm font-medium mb-1.5">Start date</span>
            <input type="date" className={field} value={date} onChange={e => setDate(e.target.value)} data-testid="ns-date" style={{ colorScheme: "dark" }} /></label>
          <label><span className="block text-purple-300 text-sm font-medium mb-1.5">Start time {daily ? "(daily bars)" : ""}</span>
            <input type="time" className={field} value={time} disabled={daily} onChange={e => setTime(e.target.value)} style={{ colorScheme: "dark" }} /></label>
          <label className="col-span-2"><span className="block text-purple-300 text-sm font-medium mb-1.5">Starting balance (USD)</span>
            <input className={field} value={balance} onChange={e => setBalance(e.target.value)} inputMode="decimal" data-testid="ns-balance" /></label>
          <label className="col-span-2"><span className="block text-purple-300 text-sm font-medium mb-1.5">Strategy (optional)</span>
            <input className={field} value={strategy} onChange={e => setStrategy(e.target.value)} placeholder="e.g. London breakout" /></label>
          <label className="col-span-2"><span className="block text-purple-300 text-sm font-medium mb-1.5">What are you testing? (optional)</span>
            <textarea className={field} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="The idea, the conditions, what would prove it wrong…" /></label>
          <div className="col-span-2"><span className="block text-purple-300 text-sm font-medium mb-1.5">Rules</span>
            <div className="flex flex-wrap gap-1.5 items-center">{chips(rules, setRules)}
              <input className="flex-1 min-w-[160px] bg-transparent border-b border-purple-700/50 px-1 py-1 text-sm text-white placeholder-purple-500/70 focus:outline-none" value={ruleDraft}
                onChange={e => setRuleDraft(e.target.value)} placeholder="Type rule + Enter"
                onKeyDown={e => { if (e.key === "Enter" && ruleDraft.trim()) { e.preventDefault(); setRules(r => [...r, ruleDraft.trim()]); setRuleDraft(""); } }} /></div></div>
          <div className="col-span-2"><span className="block text-purple-300 text-sm font-medium mb-1.5">Tags</span>
            <div className="flex flex-wrap gap-1.5 items-center">{chips(tags, setTags)}
              <input className="flex-1 min-w-[160px] bg-transparent border-b border-purple-700/50 px-1 py-1 text-sm text-white placeholder-purple-500/70 focus:outline-none" value={tagDraft}
                onChange={e => setTagDraft(e.target.value)} placeholder="Type tag + Enter"
                onKeyDown={e => { if (e.key === "Enter" && tagDraft.trim()) { e.preventDefault(); setTags(t => Array.from(new Set([...t, tagDraft.trim()]))); setTagDraft(""); } }} /></div></div>
        </div>
        {error && <div role="alert" className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-purple-700/50 text-purple-200 hover:bg-purple-800/30">Cancel</button>
          <button onClick={create} disabled={busy} data-testid="ns-create"
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold disabled:opacity-60 flex items-center gap-2">
            <Play size={15} />{busy ? "Creating…" : "Create & open on chart"}</button>
        </div>
      </div>
    </div>
  );
}
