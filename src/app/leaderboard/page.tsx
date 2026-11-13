"use client";

// The leaderboard (backend core/stats_accounts.py), public. Three boards:
// - Manual backtests: bar replay sessions traded by hand (Analytics → Backtests), that their owners
//   put on it, ranked on the session account's closed trades (at least 10).
// - Algo backtests: Strategy Tester backtests saved to Analytics, of strategies their authors
//   published, privately or publicly (a private one shows its name and results, never its code),
//   at least 10 trades.
// - Live accounts: real broker and prop-firm accounts, results read from MT5 / cTrader (verified),
//   by period; never an account number or balance. At least 5 closed trades in the period.
// Ranked by return (or profit factor, win rate, net profit). In the site pages' look (About / Contact).

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Bot, Hand, Lock, Medal, Trophy } from "lucide-react";
import SiteNav from "../components/external/SiteNav";
import {
  backtestLeaderboard, leaderboard, manualLeaderboard,
  type LbBacktestRow, type LbManualRow, type LbPeriod, type LbRow, type LbSort,
} from "../analytics/accounts";
import { PlatformBadge } from "../analytics/AccountPanel";
import { profileUrl } from "../community/social";

type Tab = "manual" | "algo" | "accounts";
const TABS: { id: Tab; label: string; icon: React.ReactNode; intro: string }[] = [
  { id: "manual", label: "Manual backtests", icon: <Hand size={15} />,
    intro: "Backtests traded by hand in bar replay, ranked on their closed trades." },
  { id: "algo", label: "Algo backtests", icon: <Bot size={15} />,
    intro: "Strategy Tester backtests of published strategies (public or private), ranked on their trades." },
  { id: "accounts", label: "Live accounts", icon: <BadgeCheck size={15} />,
    intro: "Real broker and prop-firm accounts, ranked on results read straight from MetaTrader 5 and cTrader." },
];
const PERIODS: [LbPeriod, string][] = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["1y", "1 year"], ["all", "All time"]];
const SORTS: [LbSort, string][] = [["return", "Return"], ["profit_factor", "Profit factor"], ["win_rate", "Win rate"], ["net", "Net profit"]];
const pct = (v: number, signed = true) => `${signed && v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const pf = (v: number | null) => (v == null ? "∞" : v.toFixed(2));
const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString() : "");
const chip = (on: boolean) => `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${on ? "bg-purple-600 text-white font-semibold" : "text-slate-300 hover:bg-white/10"}`;

function Rank({ n }: { n: number }) {
  if (n > 3) return <span className="text-slate-400 tabular-nums">{n}</span>;
  const c = n === 1 ? "text-amber-300" : n === 2 ? "text-slate-200" : "text-orange-400";
  return <Medal size={20} className={c} aria-label={`Rank ${n}`} />;
}
function Who({ name, username }: { name: string; username: string }) {
  return <Link href={profileUrl(username)} className="no-underline text-white hover:text-purple-300 font-medium">{name}<span className="block text-xs text-slate-400 font-normal">@{username}</span></Link>;
}
// the results columns, the same on every board
type Results = { return_pct: number; win_rate: number; profit_factor: number | null; max_dd_pct: number; trades: number };
const RESULT_HEADS = <><th className="px-2 text-right">Return</th><th className="px-2 text-right">Win rate</th><th className="px-2 text-right">Profit factor</th>
  <th className="px-2 text-right">Max drawdown</th><th className="px-4 text-right">Trades</th></>;
function ResultCells({ r }: { r: Results }) {
  return <>
    <td className={`px-2 text-right font-semibold tabular-nums ${r.return_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pct(r.return_pct)}</td>
    <td className="px-2 text-right tabular-nums">{r.win_rate.toFixed(1)}%</td>
    <td className="px-2 text-right tabular-nums">{pf(r.profit_factor)}</td>
    <td className="px-2 text-right tabular-nums text-red-300">{pct(-r.max_dd_pct, false)}</td>
    <td className="px-4 text-right tabular-nums">{r.trades}</td>
  </>;
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("manual");
  const [period, setPeriod] = useState<LbPeriod>("30d");
  const [sort, setSort] = useState<LbSort>("return");
  const [mode, setMode] = useState<"" | "real" | "demo">("");
  const [manual, setManual] = useState<LbManualRow[] | null>(null);
  const [algo, setAlgo] = useState<LbBacktestRow[] | null>(null);
  const [accounts, setAccounts] = useState<LbRow[] | null>(null);
  const [min, setMin] = useState(10);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "algo" || t === "accounts" || t === "manual") setTab(t);
  }, []);
  useEffect(() => {
    setErr(null);
    const failed = () => setErr("The leaderboard couldn't be loaded.");
    if (tab === "manual") { setManual(null); manualLeaderboard({ sort }).then(d => { setManual(d.rows || []); setMin(d.min_trades); }, failed); }
    else if (tab === "algo") { setAlgo(null); backtestLeaderboard({ sort }).then(d => { setAlgo(d.rows || []); setMin(d.min_trades); }, failed); }
    else { setAccounts(null); leaderboard({ period, sort, mode }).then(d => { setAccounts(d.rows || []); setMin(d.min_trades); }, failed); }
    const u = new URL(window.location.href);
    u.searchParams.set("tab", tab);
    window.history.replaceState(null, "", u.toString());
  }, [tab, period, sort, mode]);

  const loading = <div className="p-8 text-center text-slate-400">Loading…</div>;
  const intro = TABS.find(t => t.id === tab)!.intro;

  return (
    <div data-site-page className="min-h-screen relative text-white" style={{ backgroundColor: "#0f172a", overflow: "clip", fontFamily: "Inter, sans-serif" }}>
      <div className="pointer-events-none absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full" style={{ backgroundColor: "rgba(139, 92, 246, 0.3)", filter: "blur(120px)" }} />
      <div className="pointer-events-none absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full" style={{ backgroundColor: "rgba(99, 102, 241, 0.3)", filter: "blur(120px)" }} />
      <SiteNav active="/leaderboard" />

      <main className="relative z-10 mx-auto max-w-[1200px] px-4 sm:px-8 pb-24">
        <div className="text-center pt-8 pb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
            <span style={{ background: "linear-gradient(to right, #a78bfa, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Leaderboard</span>
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto">{intro}</p>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-slate-900/70 border border-slate-700/50 w-fit max-w-full mx-auto mb-6 overflow-x-auto" role="tablist">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-tab={t.id}
              className={`${chip(tab === t.id)} flex items-center gap-1.5`}>{t.icon}{t.label}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {tab === "accounts" && (
            <div className="flex gap-1 overflow-x-auto max-w-full" aria-label="Period">
              {PERIODS.map(([id, label]) => <button key={id} onClick={() => setPeriod(id)} className={chip(period === id)}>{label}</button>)}
            </div>
          )}
          <div className="flex gap-1 overflow-x-auto max-w-full sm:ml-auto" aria-label="Rank by">
            {SORTS.map(([id, label]) => <button key={id} onClick={() => setSort(id)} className={chip(sort === id)}>{label}</button>)}
          </div>
          {tab === "accounts" && (
            <div className="flex gap-1" aria-label="Accounts">
              {([["", "All"], ["real", "Real"], ["demo", "Demo / challenge"]] as const).map(([id, label]) => <button key={id} onClick={() => setMode(id)} className={chip(mode === id)}>{label}</button>)}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/50 backdrop-blur-md overflow-x-auto" data-testid="leaderboard-table">
          {err ? <div className="p-8 text-center text-red-300">{err}</div> : tab === "manual" ? (
            manual === null ? loading : manual.length === 0 ? <Empty text={`No manual backtests on the leaderboard yet (each needs at least ${min} closed trades). Share one from Analytics → Backtests.`} /> : (
              <table className="w-full text-sm min-w-[820px]">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 w-12">#</th><th className="px-2">Backtest</th><th className="px-2">Trader</th><th className="px-2">Market</th>{RESULT_HEADS}</tr></thead>
                <tbody>
                  {manual.map(r => (
                    <tr key={r.id} className="border-t border-slate-700/40 hover:bg-white/[0.03]">
                      <td className="px-4 py-3"><Rank n={r.rank} /></td>
                      <td className="px-2 font-medium">{r.session}<div className="text-xs text-slate-400 font-normal">{r.strategy || "Manual trading"}{r.status === "completed" ? " · completed" : ""}</div></td>
                      <td className="px-2"><Who name={r.name} username={r.username} /></td>
                      <td className="px-2">{r.symbol}{r.timeframe ? ` · ${r.timeframe}` : ""}<div className="text-xs text-slate-400">{date(r.period_from)} – {date(r.period_to)}</div></td>
                      <ResultCells r={r} />
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : tab === "algo" ? (
            algo === null ? loading : algo.length === 0 ? <Empty text={`No algo backtests on the leaderboard yet (a published strategy, public or private, with at least ${min} trades). Share one from Analytics → Backtests.`} /> : (
              <table className="w-full text-sm min-w-[820px]">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 w-12">#</th><th className="px-2">Strategy</th><th className="px-2">Author</th><th className="px-2">Market</th>{RESULT_HEADS}</tr></thead>
                <tbody>
                  {algo.map(r => (
                    <tr key={r.id} className="border-t border-slate-700/40 hover:bg-white/[0.03]">
                      <td className="px-4 py-3"><Rank n={r.rank} /></td>
                      <td className="px-2 font-medium">{r.script || r.strategy}
                        <div className="text-xs text-slate-400 font-normal flex items-center gap-1">
                          {r.published === "private" ? <><Lock size={11} />Private strategy</> : "Public strategy"} · {r.language}
                        </div></td>
                      <td className="px-2"><Who name={r.name} username={r.username} /></td>
                      <td className="px-2">{r.symbol}{r.timeframe ? ` · ${r.timeframe}` : ""}<div className="text-xs text-slate-400">{date(r.period_from)} – {date(r.period_to)}</div></td>
                      <ResultCells r={r} />
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            accounts === null ? loading : accounts.length === 0 ? <Empty text={`No live accounts on the leaderboard for this period yet (each needs at least ${min} closed trades in it).`} /> : (
              <table className="w-full text-sm min-w-[820px]">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 w-12">#</th><th className="px-2">Trader</th><th className="px-2">Account</th>{RESULT_HEADS}</tr></thead>
                <tbody>
                  {accounts.map(r => (
                    <tr key={r.id} className="border-t border-slate-700/40 hover:bg-white/[0.03]">
                      <td className="px-4 py-3"><Rank n={r.rank} /></td>
                      <td className="px-2"><Who name={r.name} username={r.username} /></td>
                      <td className="px-2">
                        <div className="flex items-center gap-1.5"><PlatformBadge platform={r.platform} /><span>{r.prop || r.broker || (r.platform === "mt5" ? "MetaTrader 5" : "cTrader")}</span></div>
                        <div className="text-xs text-slate-400">{[r.prop ? r.broker : "", r.mode].filter(Boolean).join(" · ")}</div>
                      </td>
                      <ResultCells r={r} />
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
        <p className="text-xs text-slate-500 mt-4 text-center">
          {tab === "accounts"
            ? "Return is on the account's balance at the start of the period; drawdown is the largest drop from a high. Join from Analytics: connect your account, then Settings → Show on the leaderboard."
            : "Return is on the backtest's starting balance; drawdown is the largest drop from a high. Backtests are simulated: past results don't promise future ones."}
        </p>
      </main>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-10 text-center text-slate-400"><Trophy size={28} className="mx-auto mb-3 text-purple-400/60" />{text}</div>;
}
