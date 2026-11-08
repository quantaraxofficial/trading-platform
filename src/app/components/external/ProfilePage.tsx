'use client';

// Your profile: who you are (name, sign-in, plan, member since), your overall results and metrics
// across every paper trading account, your portfolio (each account's balance, equity and open
// positions, live), your backtest sessions and saved strategy backtests, achievements earned from
// all of that, and settings (account details, trading on the chart, a settings backup, sign out).
// Everything is read from your real data: the paper trading engine, and the backend's sessions,
// backtests and journal. In the site pages' look (home, sign-in).

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Award, BarChart3, BookOpen, CalendarDays, Clock, Coins, Crown, Download, Flame, FlaskConical, Gauge, Layers,
  LineChart, LogIn, LogOut, Medal, PieChart, Play, Rocket, Settings as SettingsIcon, ShieldCheck, Sparkles, Target,
  TrendingUp, Trophy, Wallet,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { engine, useEngineState } from '../../trading/store';
import { accountMetrics, positionViews, type EngineState } from '../../trading/engine';
import { useTradingSettings, tradingSettings, type TradingSettings } from '../../trading/settings';
import { listBacktests, loadJournal, paperTrades, type SavedBacktest } from '../../analytics/data';
import { chartUrlFor, listSessions, spent, timeLeft, type BacktestSession } from '../../analytics/sessions';
import { computeStats, duration, money, pnlClass, profitFactorLabel, type Stats } from '../../analytics/stats';
import { Card, Empty, EquityChart, Kpi, MiniStat, Pills, SplitBar } from '../../analytics/ui';
import { downloadSettings } from '../../lib/settingsTransfer';
import SiteUserMenu, { Avatar, accountLogin, accountName } from './SiteUserMenu';

type Tab = 'overview' | 'portfolio' | 'sessions' | 'achievements' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'portfolio', label: 'Portfolio' }, { id: 'sessions', label: 'Backtesting' },
  { id: 'achievements', label: 'Achievements' }, { id: 'settings', label: 'Settings' },
];

const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
const pf = (v: number) => (isFinite(v) ? v.toFixed(2) : '∞');
const date = (v: string | number | null | undefined, withDay = true) => {
  if (v == null || v === '') return '—';
  const d = new Date(typeof v === 'number' && v < 1e11 ? v * 1000 : v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, withDay ? { day: 'numeric', month: 'long', year: 'numeric' } : { month: 'long', year: 'numeric' });
};

export default function ProfilePage() {
  const { user, userData, loading, logout } = useAuth();
  const router = useRouter();
  const uid = user?.uid || null;
  const state = useEngineState();
  const [tab, setTab] = useState<Tab>('overview');
  // (paper accounts only once mounted: before the saved ones load, the server's placeholder and
  // the browser's differ, as in Analytics)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && TABS.some(x => x.id === t)) setTab(t);
  }, []);
  // The tab in the address, so a refresh or a link opens it
  useEffect(() => {
    if (!mounted) return;
    const u = new URL(window.location.href);
    if (tab === 'overview') u.searchParams.delete('tab'); else u.searchParams.set('tab', tab);
    window.history.replaceState(null, '', u.toString());
  }, [tab, mounted]);

  // From the backend: backtest sessions, saved strategy backtests, and how many trades are journaled
  const [sessions, setSessions] = useState<BacktestSession[] | null>(null);
  const [backtests, setBacktests] = useState<SavedBacktest[] | null>(null);
  const [journaled, setJournaled] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    let gone = false;
    listSessions(uid).then(s => { if (!gone) setSessions(s); }, e => { if (!gone) { setSessions([]); setLoadError(e.message); } });
    listBacktests(uid).then(b => { if (!gone) setBacktests(b); }, () => { if (!gone) setBacktests([]); });
    Promise.all((['paper', 'session', 'backtest'] as const).map(src => loadJournal(uid, src).catch(() => [])))
      .then(lists => { if (!gone) setJournaled(lists.reduce((n, l) => n + l.length, 0)); });
    return () => { gone = true; };
  }, [uid]);

  // Every paper account's trades, recomputed when trading changes (not on every price tick)
  const revision = engine.getRevision();
  const accountsKey = state.accounts.map(a => a.id).join(',');
  const { stats, initial } = useMemo(() => {
    const s = engine.getSavedState();
    const trades = mounted ? s.accounts.flatMap(a => paperTrades(s, a.id)) : [];
    const initial = mounted ? s.accounts.reduce((sum, a) => sum + a.initialBalance, 0) : 0;
    return { stats: computeStats(trades, initial), initial };
  }, [mounted, revision, accountsKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const sessionTotals = useMemo(() => {
    const list = sessions || [];
    const trades = list.reduce((n, s) => n + s.trade_count, 0);
    const wins = list.reduce((n, s) => n + s.wins, 0);
    return {
      count: list.length, trades, wins, winRate: trades ? (wins / trades) * 100 : 0,
      pnl: list.reduce((n, s) => n + s.net_pnl, 0), timeSpent: list.reduce((n, s) => n + s.time_spent, 0),
      completed: list.filter(s => s.status === 'completed').length, active: list.filter(s => s.status !== 'completed').length,
    };
  }, [sessions]);

  const equityNow = mounted ? state.accounts.reduce((sum, a) => sum + (state.books[a.id] ? accountMetrics(state, a.id).equity : a.balance), 0) : 0;
  const signOut = async () => { await logout(); router.push('/'); };

  const access = userData?.access;
  const plan = !access ? null : access.active ? (access.unlimited ? 'Premium' : `Premium · ${access.days_left} day${access.days_left === 1 ? '' : 's'} left`) : 'Free plan';

  return (
    <div data-site-page className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black text-white relative">
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="blob blob-1"></div><div className="blob blob-2"></div><div className="blob blob-3"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-purple-900/80 backdrop-blur-md shadow-lg">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center space-x-2">
            <span className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center"><TrendingUp className="w-6 h-6" /></span>
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent font-bold text-xl">TradePilot</span>
          </a>
          <div className="flex items-center gap-4 sm:gap-8">
            <a href="/" className="hidden sm:inline text-purple-300 hover:text-white transition-colors">Home</a>
            <a href="/analytics" className="hidden sm:inline text-purple-300 hover:text-white transition-colors">Analytics</a>
            <a href="/chart" className="bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 px-3 sm:px-5 py-2 rounded-lg font-semibold whitespace-nowrap transition-all">Open the chart</a>
            <SiteUserMenu signedOut={<a href="/login" className="text-purple-300 hover:text-white">Log in</a>} />
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-28 pb-16 px-4 sm:px-6">
        <div className="container mx-auto max-w-6xl">
          {!user && loading ? <div className="text-purple-300 text-center py-24">Loading…</div> : !user ? (
            <div className="max-w-md mx-auto mt-10 bg-black/60 backdrop-blur-xl border border-purple-800/50 rounded-2xl p-8 text-center shadow-2xl" data-name="profile-signed-out">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-purple-500/20"><Wallet className="w-9 h-9" /></div>
              <h1 className="text-2xl font-bold mb-2">Sign in to see your profile</h1>
              <p className="text-purple-300 mb-6">Your results, portfolio, backtest sessions and achievements are saved to your TradePilot account.</p>
              <a href="/login" className="inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 py-3 rounded-lg font-semibold"><LogIn size={18} />Sign in</a>
            </div>
          ) : (
            <>
              {/* Who you are */}
              <section className="bg-black/50 backdrop-blur-xl border border-purple-800/40 rounded-2xl p-6 sm:p-8 mb-6 flex flex-col md:flex-row items-center md:items-start gap-6" data-name="profile-header">
                <Avatar size={112} className="ring-4 ring-purple-600/40 shrink-0" />
                <div className="flex-1 min-w-0 text-center md:text-left">
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                    <h1 className="text-3xl font-bold truncate">{accountName(user, userData)}</h1>
                    {plan && (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${access?.active ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-purple-800/30 text-purple-200 border-purple-600/50'}`}>
                        {access?.active && <Crown className="w-3.5 h-3.5" />}{plan}
                      </span>
                    )}
                  </div>
                  <p className="text-purple-300 mt-1">{accountLogin(user)}</p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-2 mt-4 text-sm text-purple-300/90">
                    <span className="inline-flex items-center gap-2"><CalendarDays className="w-4 h-4" />Member since {date(userData?.created_at || user.metadata?.creationTime, false)}</span>
                    <span className="inline-flex items-center gap-2"><Wallet className="w-4 h-4" />{mounted ? state.accounts.length : 0} paper account{mounted && state.accounts.length === 1 ? '' : 's'}</span>
                    <span className="inline-flex items-center gap-2"><FlaskConical className="w-4 h-4" />{sessions ? sessionTotals.count : '…'} backtest session{sessionTotals.count === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <div className="flex md:flex-col gap-2 shrink-0">
                  <a href="/analytics" className="inline-flex items-center gap-2 bg-purple-800/40 hover:bg-purple-800/60 border border-purple-700/50 px-4 py-2 rounded-lg text-sm"><BarChart3 className="w-4 h-4" />Full analytics</a>
                  <button type="button" onClick={() => setTab('settings')} className="inline-flex items-center gap-2 bg-purple-800/40 hover:bg-purple-800/60 border border-purple-700/50 px-4 py-2 rounded-lg text-sm"><SettingsIcon className="w-4 h-4" />Settings</button>
                </div>
              </section>

              {/* At a glance */}
              <section className="bg-black/50 backdrop-blur-xl border border-purple-800/40 rounded-2xl grid grid-cols-2 lg:grid-cols-5 profile-tiles divide-x divide-y lg:divide-y-0 divide-purple-800/30 mb-6 overflow-hidden" data-name="profile-kpis">
                <Kpi label="Net P&L" value={money(stats.totalPnl, 'USD', true)} valueClass={pnlClass(stats.totalPnl)} sub="Closed paper trades" icon={<TrendingUp size={16} />} />
                <Kpi label="Win rate" value={pct(stats.winRate)} sub={`${stats.wins} won · ${stats.losses} lost`} icon={<Target size={16} />} />
                <Kpi label="Trades" value={stats.count} sub={stats.openCount ? `${stats.openCount} open now` : 'None open'} icon={<Activity size={16} />} />
                <Kpi label="Equity" value={money(equityNow)} sub={`Started with ${money(initial)}`} icon={<Wallet size={16} />} />
                <Kpi label="Backtesting" value={sessions ? sessionTotals.count : '…'} sub={`${spent(sessionTotals.timeSpent)} practised`} icon={<FlaskConical size={16} />} />
              </section>

              <div className="mb-6 overflow-x-auto"><Pills value={tab} options={TABS} onChange={setTab} testId="profile-tabs" /></div>

              {loadError && <div role="alert" className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">Couldn&apos;t load your backtesting: {loadError}</div>}

              {tab === 'overview' && <Overview stats={stats} sessions={sessionTotals} loaded={!!sessions} />}
              {tab === 'portfolio' && <Portfolio state={state} mounted={mounted} />}
              {tab === 'sessions' && <Backtesting sessions={sessions} backtests={backtests} />}
              {tab === 'achievements' && <Achievements stats={stats} sessions={sessions} backtests={backtests} journaled={journaled} />}
              {tab === 'settings' && <SettingsTab userData={userData} user={user} uid={uid} plan={plan} onSignOut={signOut} />}
            </>
          )}
        </div>
      </main>

      <style jsx global>{`
        .blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.15; will-change: opacity; transform: translateZ(0); animation: pulse-blob 6s ease-in-out infinite; }
        .blob-1 { width: 320px; height: 320px; background: #581c87; top: -80px; right: -80px; }
        .blob-2 { width: 320px; height: 320px; background: #581c87; bottom: -80px; left: -80px; }
        .blob-3 { width: 384px; height: 384px; background: #4c1d95; top: 50%; left: 50%; transform: translate3d(-50%, -50%, 0); opacity: 0.08; }
        @keyframes pulse-blob { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.25; } }
        /* phones: the tiles' big numbers a size smaller, so "$101,055.00" fits half the width */
        @media (max-width: 639px) { .profile-tiles .tabular-nums.leading-8 { font-size: 20px; line-height: 28px; } }
      `}</style>
    </div>
  );
}

// ---- Overview: the overall metrics and the equity curve
function Overview({ stats, sessions, loaded }: { stats: Stats; sessions: { count: number; trades: number; winRate: number; pnl: number; timeSpent: number; completed: number; active: number }; loaded: boolean }) {
  const topSymbol = stats.symbols.slice().sort((a, b) => b.pnl - a.pnl)[0];
  const winRateOf = (b: { count: number; wins: number }) => (b.count ? pct((b.wins / b.count) * 100, 0) : '—');
  return (
    <div className="grid lg:grid-cols-3 gap-6" data-name="profile-overview">
      <Card title="Equity curve" subtitle="Every paper account, closed trades" className="lg:col-span-2"
        right={<a href="/analytics" className="text-xs text-purple-300 hover:text-white whitespace-nowrap">Full analytics →</a>}>
        {stats.equity.length > 1 ? <EquityChart points={stats.equity} mode="equity" format={v => money(v)} height={240} />
          : <Empty icon={<LineChart size={22} />}>Your equity curve appears after your first closed trade.<a href="/chart" className="text-purple-200 underline">Trade on the chart</a></Empty>}
      </Card>
      <Card title="Profit factor" subtitle={profitFactorLabel(stats.profitFactor, stats.count)}>
        <div className="text-4xl font-bold tabular-nums">{stats.count ? pf(stats.profitFactor) : '—'}</div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-purple-300">Gross profit</span><span className="text-emerald-400 tabular-nums">{money(stats.grossProfit)}</span></div>
          <div className="flex justify-between"><span className="text-purple-300">Gross loss</span><span className="text-rose-400 tabular-nums">{money(stats.grossLoss)}</span></div>
          <SplitBar a={stats.grossProfit} b={-stats.grossLoss} />
          <div className="flex justify-between pt-2"><span className="text-purple-300">Long win rate</span><span className="tabular-nums">{winRateOf(stats.long)}</span></div>
          <div className="flex justify-between"><span className="text-purple-300">Short win rate</span><span className="tabular-nums">{winRateOf(stats.short)}</span></div>
        </div>
      </Card>

      <Card title="Metrics" subtitle="All time, every paper account" className="lg:col-span-2" pad={false}>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-purple-800/20" data-name="profile-metrics">
          <MiniStat label="Expectancy" value={money(stats.expectancy, 'USD', true)} valueClass={pnlClass(stats.expectancy)} />
          <MiniStat label="Average win" value={money(stats.avgWin)} valueClass="text-emerald-400" />
          <MiniStat label="Average loss" value={money(stats.avgLoss)} valueClass="text-rose-400" />
          <MiniStat label="Reward : risk" value={stats.riskReward ? stats.riskReward.toFixed(2) : '—'} />
          <MiniStat label="Best trade" value={stats.count ? money(stats.best, 'USD', true) : '—'} valueClass={pnlClass(stats.best)} />
          <MiniStat label="Worst trade" value={stats.count ? money(stats.worst, 'USD', true) : '—'} valueClass={pnlClass(stats.worst)} />
          <MiniStat label="Max drawdown" value={stats.maxDrawdown ? `${money(stats.maxDrawdown)}${stats.maxDrawdownPct != null ? ` (${pct(stats.maxDrawdownPct)})` : ''}` : '—'} valueClass="text-rose-400" />
          <MiniStat label="Average hold" value={duration(stats.avgHold)} />
          <MiniStat label="Longest win streak" value={stats.maxWinStreak} />
          <MiniStat label="Longest loss streak" value={stats.maxLossStreak} />
          <MiniStat label="Trading days" value={stats.tradingDays} />
          <MiniStat label="Best day" value={stats.bestDay ? money(stats.bestDay.pnl, 'USD', true) : '—'} valueClass={stats.bestDay ? pnlClass(stats.bestDay.pnl) : undefined} />
          <MiniStat label="Best month" value={stats.bestMonth ? money(stats.bestMonth.pnl, 'USD', true) : '—'} valueClass={stats.bestMonth ? pnlClass(stats.bestMonth.pnl) : undefined} />
          <MiniStat label="Symbols traded" value={stats.symbols.length} />
          <MiniStat label="Top symbol" value={topSymbol ? topSymbol.symbol : '—'} />
          <MiniStat label="Commission" value={money(stats.commission)} />
        </div>
      </Card>
      <Card title="Backtesting" subtitle="Your bar-replay sessions"
        right={<a href="/analytics?view=backtests" className="text-xs text-purple-300 hover:text-white whitespace-nowrap">Open →</a>}>
        {!loaded ? <div className="text-purple-300 text-sm">Loading…</div> : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-purple-300">Sessions</span><span>{sessions.count} ({sessions.active} going, {sessions.completed} completed)</span></div>
            <div className="flex justify-between"><span className="text-purple-300">Trades</span><span className="tabular-nums">{sessions.trades}</span></div>
            <div className="flex justify-between"><span className="text-purple-300">Win rate</span><span className="tabular-nums">{sessions.trades ? pct(sessions.winRate) : '—'}</span></div>
            <div className="flex justify-between"><span className="text-purple-300">Net P&amp;L</span><span className={`tabular-nums ${pnlClass(sessions.pnl)}`}>{money(sessions.pnl, 'USD', true)}</span></div>
            <div className="flex justify-between"><span className="text-purple-300">Time practised</span><span className="tabular-nums">{spent(sessions.timeSpent)}</span></div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---- Portfolio: each paper account, live
function Portfolio({ state, mounted }: { state: EngineState; mounted: boolean }) {
  if (!mounted) return null;
  const fmt = (symbol: string, v: number) => v.toLocaleString(undefined, { minimumFractionDigits: Math.min(state.precision[symbol] ?? 2, 8), maximumFractionDigits: Math.min(state.precision[symbol] ?? 2, 8) });
  const rows = state.accounts.filter(a => state.books[a.id]).map(a => ({ a, m: accountMetrics(state, a.id), positions: positionViews(state, a.id), orders: state.books[a.id].orders.filter(o => o.status === 'working').length }));
  const total = rows.reduce((t, r) => ({ equity: t.equity + r.m.equity, unrealized: t.unrealized + r.m.unrealizedPnL, initial: t.initial + r.a.initialBalance }), { equity: 0, unrealized: 0, initial: 0 });
  return (
    <div className="space-y-6" data-name="profile-portfolio">
      <section className="bg-black/50 backdrop-blur-xl border border-purple-800/40 rounded-2xl grid grid-cols-2 lg:grid-cols-4 profile-tiles divide-x divide-y lg:divide-y-0 divide-purple-800/30 overflow-hidden">
        <Kpi label="Total equity" value={money(total.equity)} icon={<Coins size={16} />} />
        <Kpi label="Return" value={total.initial ? pct(((total.equity - total.initial) / total.initial) * 100, 2) : '—'} valueClass={pnlClass(total.equity - total.initial)} sub={money(total.equity - total.initial, 'USD', true)} icon={<PieChart size={16} />} />
        <Kpi label="Open P&L" value={money(total.unrealized, 'USD', true)} valueClass={pnlClass(total.unrealized)} icon={<Activity size={16} />} />
        <Kpi label="Open positions" value={rows.reduce((n, r) => n + r.positions.length, 0)} sub={`${rows.reduce((n, r) => n + r.orders, 0)} working orders`} icon={<Layers size={16} />} />
      </section>
      {rows.map(({ a, m, positions, orders }) => (
        <Card key={a.id} title={<span className="inline-flex items-center gap-2">{a.name}{a.id === state.activeAccountId && <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-purple-700/50 text-purple-100">Active</span>}</span>}
          subtitle={`Paper trading · opened ${date(a.createdAt)}`} right={<a href="/chart" className="text-xs text-purple-300 hover:text-white whitespace-nowrap">Trade →</a>} pad={false}>
          <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-purple-800/30">
            <MiniStat label="Balance" value={money(m.balance)} />
            <MiniStat label="Equity" value={money(m.equity)} />
            <MiniStat label="Open P&L" value={money(m.unrealizedPnL, 'USD', true)} valueClass={pnlClass(m.unrealizedPnL)} />
            <MiniStat label="Realized P&L" value={money(m.realizedPnL, 'USD', true)} valueClass={pnlClass(m.realizedPnL)} />
            <MiniStat label="Available" value={money(m.availableFunds)} />
          </div>
          {positions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-purple-300/70">
                  <th className="px-4 py-2 font-semibold">Symbol</th><th className="px-4 py-2 font-semibold">Side</th><th className="px-4 py-2 font-semibold text-right">Qty</th>
                  <th className="px-4 py-2 font-semibold text-right">Avg price</th><th className="px-4 py-2 font-semibold text-right">Last</th><th className="px-4 py-2 font-semibold text-right">P&amp;L</th>
                </tr></thead>
                <tbody>
                  {positions.map(p => (
                    <tr key={p.symbol} className="border-t border-purple-800/20">
                      <td className="px-4 py-2 font-medium">{p.symbol}</td>
                      <td className={`px-4 py-2 ${p.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>{p.side === 'buy' ? 'Long' : 'Short'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.qty.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(p.symbol, p.avgPrice)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(p.symbol, p.last)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${pnlClass(p.pnl)}`}>{money(p.pnl, 'USD', true)} <span className="text-xs opacity-75">({pct(p.pnlPct, 2)})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="px-5 py-4 text-sm text-purple-300/70">No open positions{orders ? ` · ${orders} working order${orders === 1 ? '' : 's'}` : ''}</div>}
        </Card>
      ))}
    </div>
  );
}

// ---- Backtesting: sessions (resume on the chart, analyse) and saved strategy backtests
function Backtesting({ sessions, backtests }: { sessions: BacktestSession[] | null; backtests: SavedBacktest[] | null }) {
  const status = { active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', paused: 'bg-amber-500/15 text-amber-300 border-amber-500/40', completed: 'bg-purple-700/30 text-purple-200 border-purple-600/50' };
  return (
    <div className="space-y-6" data-name="profile-sessions">
      <Card title="Backtest sessions" subtitle="Bar replays you come back to, each with its own account"
        right={<a href="/analytics?view=backtests" className="text-xs text-purple-300 hover:text-white whitespace-nowrap">New session →</a>}>
        {!sessions ? <div className="text-purple-300 text-sm">Loading…</div> : !sessions.length ? (
          <Empty icon={<FlaskConical size={22} />}>No backtest sessions yet.<a href="/analytics?view=backtests" className="text-purple-200 underline">Start one</a></Empty>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {sessions.slice().sort((a, b) => b.updated_at - a.updated_at).map(s => {
              const left = timeLeft(s);
              const winRate = s.trade_count ? (s.wins / s.trade_count) * 100 : null;
              return (
                <div key={s.id} className="rounded-xl border border-purple-800/40 bg-purple-950/30 p-4" data-session={s.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{s.name}</div>
                      <div className="text-xs text-purple-300/80">{s.symbol} · {s.interval_label}{s.strategy ? ` · ${s.strategy}` : ''}</div>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${status[s.status]}`}>{s.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-3 text-sm">
                    <div><div className="text-[10px] uppercase text-purple-300/60">P&amp;L</div><div className={`tabular-nums ${pnlClass(s.net_pnl)}`}>{money(s.net_pnl, 'USD', true)}</div></div>
                    <div><div className="text-[10px] uppercase text-purple-300/60">Trades</div><div className="tabular-nums">{s.trade_count}</div></div>
                    <div><div className="text-[10px] uppercase text-purple-300/60">Win rate</div><div className="tabular-nums">{winRate == null ? '—' : pct(winRate, 0)}</div></div>
                    <div><div className="text-[10px] uppercase text-purple-300/60">Time</div><div className="tabular-nums">{spent(s.time_spent)}</div></div>
                  </div>
                  {left && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full bg-purple-950/70 overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500" style={{ width: `${left.progress * 100}%` }} /></div>
                      <div className="text-[11px] text-purple-300/70 mt-1">{left.text}</div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <a href={chartUrlFor(s)} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"><Play size={12} />{s.status === 'completed' ? 'Open on the chart' : 'Resume'}</a>
                    <a href={`/analytics?view=backtests&session=${s.id}`} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-purple-700/50 text-purple-200 hover:bg-purple-800/30"><BarChart3 size={12} />Analyse</a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card title="Strategy backtests" subtitle="Saved from the Strategy Tester">
        {!backtests ? <div className="text-purple-300 text-sm">Loading…</div> : !backtests.length ? (
          <Empty icon={<LineChart size={22} />}>No saved strategy backtests yet. Run a strategy on the chart and save it from the Strategy Tester.</Empty>
        ) : (
          <div className="divide-y divide-purple-800/30">
            {backtests.map(b => (
              <a key={b.id} href="/analytics?view=backtests" className="flex items-center justify-between gap-4 py-3 hover:bg-purple-800/10 -mx-2 px-2 rounded-lg">
                <div className="min-w-0"><div className="font-medium truncate">{b.name}</div><div className="text-xs text-purple-300/80">{b.symbol} · {b.timeframe} · {b.trade_count} trades · {date(b.created_at)}</div></div>
                <div className={`tabular-nums text-sm ${pnlClass(b.net_profit)}`}>{money(b.net_profit, 'USD', true)}</div>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---- Achievements: earned from your real trading, backtesting and journal
interface Achievement { id: string; name: string; description: string; icon: React.ReactNode; progress: number; status: string; unlocked: boolean }
function count(id: string, name: string, description: string, icon: React.ReactNode, have: number, need: number, unit: string): Achievement {
  return { id, name, description, icon, progress: Math.min(1, have / need), status: `${Math.min(have, need).toLocaleString()} / ${need.toLocaleString()} ${unit}`, unlocked: have >= need };
}
// A goal measured once there are enough trades to judge it
function judged(id: string, name: string, description: string, icon: React.ReactNode, trades: number, minTrades: number, ok: boolean, now: string): Achievement {
  if (trades < minTrades) return { id, name, description, icon, progress: trades / minTrades, status: `${trades} / ${minTrades} trades to judge`, unlocked: false };
  return { id, name, description, icon, progress: ok ? 1 : 0.95, status: ok ? `Earned: ${now}` : `Now ${now}`, unlocked: ok };
}
function Achievements({ stats, sessions, backtests, journaled }: { stats: Stats; sessions: BacktestSession[] | null; backtests: SavedBacktest[] | null; journaled: number | null }) {
  const n = stats.count;
  const hours = (sessions || []).reduce((h, s) => h + s.time_spent, 0) / 3600;
  const list: Achievement[] = [
    count('first-trade', 'First trade', 'Close your first paper trade', <Rocket size={22} />, n, 1, 'trades'),
    count('first-win', 'First win', 'Close a trade in profit', <Sparkles size={22} />, stats.wins, 1, 'wins'),
    count('ten-trades', 'Getting started', 'Close 10 trades', <Activity size={22} />, n, 10, 'trades'),
    count('hundred-trades', 'Seasoned trader', 'Close 100 trades', <Medal size={22} />, n, 100, 'trades'),
    count('hot-streak', 'Hot streak', 'Win 5 trades in a row', <Flame size={22} />, stats.maxWinStreak, 5, 'in a row'),
    count('diversified', 'Diversified', 'Trade 5 different symbols', <Layers size={22} />, stats.symbols.length, 5, 'symbols'),
    judged('in-the-green', 'In the green', 'Be in profit overall after at least 10 trades', <TrendingUp size={22} />, n, 10, stats.totalPnl > 0, money(stats.totalPnl, 'USD', true)),
    judged('sharp-shooter', 'Sharp shooter', 'A win rate of 60% or more over at least 20 trades', <Target size={22} />, n, 20, stats.winRate >= 60, pct(stats.winRate)),
    judged('edge', 'Found an edge', 'A profit factor of 1.5 or more over at least 20 trades', <Gauge size={22} />, n, 20, stats.profitFactor >= 1.5, pf(stats.profitFactor)),
    judged('risk-manager', 'Risk manager', 'Never more than 10% below your peak, over at least 20 trades', <ShieldCheck size={22} />, n, 20,
      stats.maxDrawdownPct != null && stats.maxDrawdownPct > -10, stats.maxDrawdownPct != null ? `${pct(stats.maxDrawdownPct)} max drawdown` : '—'),
    count('backtester', 'Backtester', 'Start a backtest session', <FlaskConical size={22} />, sessions?.length ?? 0, 1, 'sessions'),
    count('finisher', 'Finisher', 'Complete a backtest session', <Award size={22} />, (sessions || []).filter(s => s.status === 'completed').length, 1, 'completed'),
    count('practice', 'Dedicated practice', 'Spend 10 hours in backtest sessions', <Clock size={22} />, Math.floor(hours * 10) / 10, 10, 'hours'),
    count('strategist', 'Strategist', 'Save a strategy backtest from the Strategy Tester', <LineChart size={22} />, backtests?.length ?? 0, 1, 'saved'),
    count('journal', 'Journal keeper', 'Journal 10 trades in Analytics', <BookOpen size={22} />, journaled ?? 0, 10, 'journaled'),
  ];
  const earned = list.filter(a => a.unlocked).length;
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Trophy size={16} className="text-amber-300" />{earned} of {list.length} earned</span>} subtitle="Earned from your real trading, backtesting and journal">
      <div className="h-2 rounded-full bg-purple-950/70 overflow-hidden mb-5"><div className="h-full bg-gradient-to-r from-amber-400 to-purple-500" style={{ width: `${(earned / list.length) * 100}%` }} /></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-name="profile-achievements">
        {list.map(a => (
          <div key={a.id} data-achievement={a.id} data-unlocked={a.unlocked || undefined}
            className={`rounded-xl border p-4 ${a.unlocked ? 'bg-gradient-to-br from-purple-800/40 to-indigo-900/30 border-amber-400/40' : 'bg-black/30 border-purple-900/50'}`}>
            <div className="flex items-center gap-3">
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${a.unlocked ? 'bg-amber-400/20 text-amber-300' : 'bg-purple-900/40 text-purple-400/60'}`}>{a.icon}</span>
              <div className="min-w-0">
                <div className={`font-semibold ${a.unlocked ? 'text-white' : 'text-purple-200/80'}`}>{a.name}</div>
                <div className="text-xs text-purple-300/70">{a.description}</div>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-purple-950/70 overflow-hidden mt-3"><div className={`h-full ${a.unlocked ? 'bg-amber-400' : 'bg-purple-500/70'}`} style={{ width: `${a.progress * 100}%` }} /></div>
            <div className={`text-xs mt-1.5 ${a.unlocked ? 'text-amber-300' : 'text-purple-300/70'}`}>{a.unlocked ? '✓ ' : ''}{a.status}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---- Settings: the account, trading on the chart (the same settings as the chart's Settings →
// Trading, saved to the account), a backup of every setting, signing out
const TRADING_TOGGLES: { key: keyof TradingSettings; label: string; hint: string }[] = [
  { key: 'buySellButtons', label: 'Buy/sell buttons', hint: 'The Buy and Sell buttons on the chart' },
  { key: 'oneClickTrading', label: 'One-click trading', hint: 'Place, edit and cancel orders and close positions without a confirmation' },
  { key: 'executionSound', label: 'Execution sound', hint: 'A sound when an order fills' },
  { key: 'positionsAndOrders', label: 'Positions and orders', hint: 'Show your positions and orders on the chart' },
  { key: 'executionMarks', label: 'Execution marks', hint: 'Arrows on the bars where your orders were filled' },
  { key: 'pnlPositions', label: 'P&L on positions', hint: "Each position's profit or loss on its line" },
  { key: 'tradesInSnapshots', label: 'Trades in snapshots', hint: 'Include your positions and orders in chart snapshots' },
];
function SettingsTab({ user, userData, uid, plan, onSignOut }: { user: any; userData: any; uid: string | null; plan: string | null; onSignOut: () => void }) {
  const tr = useTradingSettings();
  const [downloaded, setDownloaded] = useState(false);
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2.5 border-b border-purple-800/20 last:border-0"><span className="text-purple-300">{label}</span><span className="text-right min-w-0 truncate">{value}</span></div>
  );
  return (
    <div className="grid lg:grid-cols-2 gap-6" data-name="profile-settings">
      <Card title="Account" subtitle="Accounts are managed by the TradePilot team">
        <div className="text-sm">
          {row('Name', accountName(user, userData))}
          {row('Email or user ID', accountLogin(user) || '—')}
          {row('Phone', userData?.phone || '—')}
          {row('Plan', plan || '—')}
          {userData?.access?.active && !userData.access.unlimited && row('Premium until', date(userData.access.until))}
          {row('Member since', date(userData?.created_at || user?.metadata?.creationTime))}
          {row('Last sign-in', date(userData?.last_login || user?.metadata?.lastSignInTime))}
        </div>
        <p className="text-xs text-purple-300/70 mt-3">To change your name, email or password, <a href="/contact" className="text-purple-200 underline">contact us</a>.</p>
      </Card>
      <Card title="Trading on the chart" subtitle="Saved to your account, the same as the chart's Settings → Trading">
        <div className="space-y-1">
          {TRADING_TOGGLES.map(t => (
            <label key={t.key} className="flex items-center justify-between gap-4 py-2 cursor-pointer" data-setting={t.key}>
              <span className="min-w-0"><span className="block text-sm">{t.label}</span><span className="block text-xs text-purple-300/70">{t.hint}</span></span>
              <input type="checkbox" role="switch" className="sr-only peer" checked={!!tr[t.key]} onChange={e => tradingSettings.set({ [t.key]: e.target.checked } as Partial<TradingSettings>)} />
              <span aria-hidden className="relative w-10 h-6 shrink-0 rounded-full bg-purple-950 border border-purple-700/60 transition-colors peer-checked:bg-purple-600 peer-checked:border-purple-500 peer-focus-visible:ring-2 peer-focus-visible:ring-purple-400 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
            </label>
          ))}
        </div>
      </Card>
      <Card title="Your settings" subtitle="Layouts, watchlists, chart settings, templates and favourites">
        <p className="text-sm text-purple-300 mb-4">Download every setting as a file, to keep a backup or bring them to another account. Import a file from the chart&apos;s Settings.</p>
        <button type="button" data-name="profile-download-settings"
          onClick={async () => { await downloadSettings({ name: accountName(user, userData), email: user?.email }, uid); setDownloaded(true); setTimeout(() => setDownloaded(false), 1800); }}
          className="inline-flex items-center gap-2 bg-purple-800/40 hover:bg-purple-800/60 border border-purple-700/50 px-4 py-2 rounded-lg text-sm"><Download className="w-4 h-4" />{downloaded ? 'Downloaded' : 'Download settings'}</button>
      </Card>
      <Card title="Sign out" subtitle="Each account can be signed in on one device at a time">
        <p className="text-sm text-purple-300 mb-4">Signing out here frees your account to sign in on another device.</p>
        <button type="button" onClick={onSignOut} data-name="profile-sign-out"
          className="inline-flex items-center gap-2 bg-rose-900/30 hover:bg-rose-900/50 border border-rose-700/50 text-rose-200 px-4 py-2 rounded-lg text-sm"><LogOut className="w-4 h-4" />Sign out of this device</button>
      </Card>
    </div>
  );
}
