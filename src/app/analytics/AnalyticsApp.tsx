"use client";

// Analytics: your trading performance, each trade analysed and journaled, and your saved strategy
// backtests — for any paper trading account or the linked MetaTrader 5 account. In TradePilot's
// own look (the landing / login pages).

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, FlaskConical, LineChart, LogIn, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEngineState } from "../trading/store";
import { setBrokerUser, useBroker } from "../trading/broker";
import { loadJournal, mt5Trades, paperTrades, type ATrade, type Journal, type Source } from "./data";
import type { Period } from "./stats";
import Performance from "./Performance";
import TradeAnalysis from "./TradeAnalysis";
import Backtests from "./Backtests";

type View = "performance" | "trades" | "backtests";
const NAV: { id: View; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "performance", label: "Performance", icon: <BarChart3 size={18} />, hint: "Your results at a glance" },
  { id: "trades", label: "Trade Analysis", icon: <LineChart size={18} />, hint: "Each trade, scored and journaled" },
  { id: "backtests", label: "Backtests", icon: <FlaskConical size={18} />, hint: "Backtest sessions and saved strategy backtests" },
];
const ACCOUNT_KEY = "tv:analyticsAccount";
const MT5_DAYS: Record<Period, number> = { today: 31, "7d": 31, "30d": 31, "3m": 92, "1y": 366, all: 3650 };

export default function AnalyticsApp() {
  const { user, loading } = useAuth();
  const uid = user?.uid || null;
  const engineState = useEngineState();
  const broker = useBroker();
  const [view, setView] = useState<View>("performance");
  const [account, setAccount] = useState<string>("");
  // (read after the first render, so the server's page and the browser's match)
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "trades" || v === "backtests") setView(v);
    const sid = Number(new URLSearchParams(window.location.search).get("session"));
    if (sid > 0) { setView("backtests"); setOpenSessionId(sid); }
    try { setAccount(localStorage.getItem(ACCOUNT_KEY) || ""); } catch { /* storage off */ }
  }, []);
  const [period, setPeriod] = useState<Period>("30d");
  const [mt5, setMt5] = useState<{ days: number; trades: ATrade[]; currency: string } | null>(null);
  const [mt5Error, setMt5Error] = useState<string | null>(null);
  const [mt5Loading, setMt5Loading] = useState(false);
  const [journals, setJournals] = useState<Record<Source, Record<string, Journal>>>({ paper: {}, mt5: {}, backtest: {}, session: {} });
  const [openSessionId, setOpenSessionId] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => { setBrokerUser(uid); }, [uid]);
  // The view in the address, so a refresh or a shared link opens it
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("view", view);
    window.history.replaceState(null, "", u.toString());
  }, [view]);

  // (paper accounts only once mounted: before the saved ones load, the server's placeholder account
  // and the browser's have different ids)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const accounts = useMemo(() => !mounted ? [] : [
    ...engineState.accounts.map(a => ({ id: `paper:${a.id}`, label: a.name, sub: "Paper trading", balance: a.initialBalance, currency: a.currency })),
    ...(broker.linked ? [{ id: "mt5", label: `MT5 · ${broker.linked.login}`, sub: `${broker.linked.server} · ${broker.linked.mode}`, balance: 0, currency: broker.linked.currency || "USD" }] : []),
  ], [mounted, engineState.accounts, broker.linked]);
  const current = accounts.find(a => a.id === account) || accounts.find(a => a.id === `paper:${engineState.activeAccountId}`) || accounts[0];
  const source: Source = current?.id === "mt5" ? "mt5" : "paper";
  useEffect(() => { if (current) { try { localStorage.setItem(ACCOUNT_KEY, current.id); } catch { /* storage off */ } } }, [current?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // MT5: the closed trades over enough days for the period
  const days = MT5_DAYS[period];
  const fetchMt5 = (d: number) => {
    if (!uid || !broker.linked) return;
    setMt5Loading(true);
    mt5Trades(uid, broker.linked.login, d)
      .then(h => { setMt5({ days: d, trades: h.trades, currency: h.currency || "USD" }); setMt5Error(null); })
      .catch(e => setMt5Error(e.message))
      .finally(() => setMt5Loading(false));
  };
  useEffect(() => {
    if (source === "mt5" && (!mt5 || mt5.days < days)) fetchMt5(days);
  }, [source, days, uid, broker.linked?.login]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Journal entries of the account's kind, and of backtests
  useEffect(() => {
    if (!uid) return;
    for (const src of ["paper", "mt5", "backtest", "session"] as Source[]) {
      loadJournal(uid, src).then(entries => setJournals(j => ({ ...j, [src]: Object.fromEntries(entries.map(e => [e.trade_key, e])) })), () => {});
    }
  }, [uid]);
  const onJournal = (src: Source) => (key: string, j: Journal | null) => setJournals(prev => {
    const next = { ...prev[src] };
    if (j) next[key] = j; else delete next[key];
    return { ...prev, [src]: next };
  });

  const trades: ATrade[] = useMemo(() => {
    if (!current) return [];
    if (current.id === "mt5") return mt5?.trades || [];
    return paperTrades(engineState, current.id.slice(6));
  }, [current, engineState, mt5]);
  const currency = current?.id === "mt5" ? mt5?.currency || current.currency : "USD";
  const nav = NAV.find(n => n.id === view)!;

  return (
    <div className="h-screen bg-gradient-to-br from-black via-purple-950 to-black text-white relative overflow-hidden" data-testid="analytics">
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="an-blob an-blob-1" /><div className="an-blob an-blob-2" /><div className="an-blob an-blob-3" />
      </div>
      <div className="relative z-10 flex h-full">
        <aside className="hidden md:flex w-64 shrink-0 flex-col gap-6 p-5 border-r border-purple-800/30 bg-black/40 backdrop-blur-xl h-full overflow-y-auto">
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20"><TrendingUp className="w-6 h-6" /></div>
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent font-bold text-xl">TradePilot</span>
          </a>
          <nav className="space-y-1" aria-label="Analytics">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-400/70 px-3 mb-2">Analytics</div>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setView(n.id)} data-nav={n.id} aria-current={view === n.id ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${view === n.id
                  ? "bg-gradient-to-r from-purple-600/80 to-indigo-600/80 text-white shadow-lg shadow-purple-700/30" : "text-purple-300 hover:text-white hover:bg-purple-800/25"}`}>
                {n.icon}{n.label}
              </button>
            ))}
          </nav>
          {view !== "backtests" && accounts.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-400/70 px-3 mb-2">Account</div>
              <div className="space-y-1" data-testid="accounts">
                {accounts.map(a => (
                  <button key={a.id} onClick={() => { setAccount(a.id); setSelectedKey(null); }} data-account={a.id}
                    className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${current?.id === a.id ? "border-purple-500/60 bg-purple-700/20" : "border-transparent hover:bg-purple-800/20"}`}>
                    <div className="flex items-center gap-2 text-sm text-white">
                      {a.id === "mt5" ? <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-gradient-to-br from-emerald-600 to-blue-600">MT5</span> : <Wallet size={14} className="text-purple-400" />}
                      <span className="truncate">{a.label}</span>
                    </div>
                    <div className="text-[11px] text-purple-300/60 mt-0.5 truncate">{a.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <a href="/" className="mt-auto flex items-center gap-2 text-sm text-purple-400 hover:text-white"><ArrowLeft size={15} />Back to the chart</a>
        </aside>

        <main className="flex-1 min-w-0 h-full overflow-y-auto px-4 sm:px-8 py-6" data-testid="analytics-main">
          <header className="flex flex-wrap items-center gap-3 mb-6">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold">{nav.label}</h1>
              <p className="text-purple-300/80 text-sm">{nav.hint}{view !== "backtests" && current ? ` · ${current.label}` : ""}</p>
            </div>
            <div className="md:hidden w-full">
              <select value={view} onChange={e => setView(e.target.value as View)} className="w-full bg-gray-900/60 border border-purple-700/50 rounded-lg px-3 py-2 text-sm">
                {NAV.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              {view !== "backtests" && accounts.length > 1 && (
                <select value={current?.id} onChange={e => setAccount(e.target.value)} className="mt-2 w-full bg-gray-900/60 border border-purple-700/50 rounded-lg px-3 py-2 text-sm">
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              )}
            </div>
            {source === "mt5" && view !== "backtests" && (
              <button onClick={() => fetchMt5(days)} className="ml-auto flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-purple-700/50 text-purple-200 hover:bg-purple-800/30">
                <RefreshCw size={14} className={mt5Loading ? "animate-spin" : ""} />Refresh from MT5</button>
            )}
          </header>

          {loading ? <div className="text-purple-300">Loading…</div> : !uid ? (
            <div className="max-w-md mx-auto mt-16 bg-black/60 backdrop-blur-xl border border-purple-800/50 rounded-2xl p-8 text-center shadow-2xl">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-purple-500/20"><BarChart3 className="w-9 h-9" /></div>
              <h2 className="text-2xl font-bold mb-2">Sign in to see your analytics</h2>
              <p className="text-purple-300 mb-6">Your trades, journal and backtests are saved to your TradePilot account.</p>
              <a href="/login" className="inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 py-3 rounded-lg font-semibold"><LogIn size={18} />Sign in</a>
            </div>
          ) : view === "backtests" ? (
            <Backtests uid={uid} journals={journals} onJournal={onJournal} openSessionId={openSessionId} />
          ) : (
            <>
              {source === "mt5" && mt5Error && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{mt5Error}</div>}
              {source === "mt5" && !mt5 && mt5Loading ? <div className="text-purple-300">Reading your MetaTrader 5 history…</div>
                : view === "performance"
                  ? <Performance trades={trades} currency={currency} initialBalance={source === "paper" ? current?.balance || 0 : 0} period={period} onPeriod={setPeriod}
                      journals={journals[source]} exportName={current?.label || "Trading"} exportSubtitle={current ? `${current.label} · ${current.sub}` : ""}
                      onOpenTrade={t => { setSelectedKey(t.key); setView("trades"); }}
                      note={source === "mt5" ? `Closed trades from MetaTrader 5 · last ${days >= 3650 ? "10 years" : `${days} days`}` : undefined} />
                  : <TradeAnalysis uid={uid} source={source} trades={trades} journals={journals[source]} onJournal={onJournal(source)} currency={currency} exportName={current?.label || "Trading"}
                      selectedKey={selectedKey} onSelect={setSelectedKey} />}
            </>
          )}
        </main>
      </div>
      <style>{`
        .an-blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15; animation: an-pulse 6s ease-in-out infinite; }
        .an-blob-1 { width: 360px; height: 360px; background: #581c87; top: -100px; right: -80px; }
        .an-blob-2 { width: 320px; height: 320px; background: #581c87; bottom: -80px; left: -80px; }
        .an-blob-3 { width: 420px; height: 420px; background: #4c1d95; top: 45%; left: 55%; opacity: 0.08; }
        @keyframes an-pulse { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.2; } }
        @media (prefers-reduced-motion: reduce) { .an-blob { animation: none; } }
      `}</style>
    </div>
  );
}
