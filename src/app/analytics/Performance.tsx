"use client";

// Performance analytics for a set of trades: period and outcome filters, the headline figures,
// the equity / drawdown curve, win / loss distribution, long vs short, days of the week, trading
// sessions, top symbols, the daily P&L calendar and the full stats table.

import React, { useMemo, useState } from "react";
import { Activity, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock, Download, FileText, Percent, Target, Trophy, Wallet } from "lucide-react";
import type { ATrade, Journal } from "./data";
import { downloadPerformancePdf, downloadTradesCsv } from "./exporters";
import { computeStats, dayKey, duration, filterTrades, money, PERIODS, pnlClass, profitFactorLabel, type Outcome, type Period, type Stats } from "./stats";
import { Card, Empty, EquityChart, Kpi, Label, MiniStat, Pills, PnlBars, SplitBar } from "./ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Performance({ trades, currency = "USD", initialBalance = 0, period, onPeriod, onOpenTrade, note, journals, exportName = "Trading", exportSubtitle = "" }: {
  trades: ATrade[]; currency?: string; initialBalance?: number; period: Period; onPeriod: (p: Period) => void;
  onOpenTrade?: (t: ATrade) => void; note?: React.ReactNode;
  journals?: Record<string, Journal>; exportName?: string; exportSubtitle?: string;   // for CSV / PDF exports
}) {
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [curve, setCurve] = useState<"equity" | "drawdown">("equity");
  const shown = useMemo(() => filterTrades(trades, period, outcome), [trades, period, outcome]);
  const s = useMemo(() => computeStats(shown, initialBalance), [shown, initialBalance]);
  const fmt = (v: number, signed = false) => money(v, currency, signed);

  return (
    <div className="space-y-5" data-testid="performance">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label>Time period</Label>
          <div className="mt-1.5"><Pills value={period} onChange={onPeriod} options={PERIODS} testId="period" /></div>
        </div>
        <div>
          <Label>Filter by</Label>
          <div className="mt-1.5"><Pills value={outcome} onChange={setOutcome} testId="outcome"
            options={[{ id: "all", label: "All Trades" }, { id: "winners", label: "Winners" }, { id: "losers", label: "Losers" }]} /></div>
        </div>
        {note && <div className="text-xs text-purple-300/70 pb-2">{note}</div>}
        <div className="ml-auto flex gap-2 pb-0.5">
          <button onClick={() => downloadTradesCsv(exportName, shown, journals)} data-testid="export-csv"
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-purple-700/50 text-purple-200 hover:bg-purple-800/30"><Download size={14} />CSV</button>
          <button data-testid="export-pdf" onClick={() => downloadPerformancePdf(exportName, {
              title: `${exportName} — performance report`,
              subtitle: [exportSubtitle, PERIODS.find(p => p.id === period)?.label, outcome !== "all" ? (outcome === "winners" ? "winners only" : "losers only") : ""].filter(Boolean).join(" · "),
              trades: shown, currency, initialBalance,
            })}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-700 hover:to-indigo-700"><FileText size={14} />PDF report</button>
        </div>
      </div>

      <Card pad={false}>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-purple-800/30">
          <Kpi testId="kpi-pnl" label="Total P&L" icon={<Wallet size={16} />} value={fmt(s.totalPnl, true)} valueClass={pnlClass(s.totalPnl)}
            sub={`From ${s.count} closed trade${s.count === 1 ? "" : "s"}`} />
          <Kpi testId="kpi-winrate" label="Win rate" icon={<Trophy size={16} />} value={`${s.winRate.toFixed(1)}%`}
            sub={`${s.wins} wins · ${s.losses} losses${s.breakeven ? ` · ${s.breakeven} breakeven` : ""}`}>
            <div className="mt-2"><SplitBar a={s.wins} b={s.losses} /></div>
          </Kpi>
          <Kpi testId="kpi-pf" label="Profit factor" icon={<Percent size={16} />} value={Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}
            sub={profitFactorLabel(s.profitFactor, s.count)} />
          <Kpi testId="kpi-expectancy" label="Expectancy" icon={<Target size={16} />} value={fmt(s.expectancy, true)} valueClass={pnlClass(s.expectancy)}
            sub="Expected profit per trade" />
        </div>
      </Card>

      <Card title={<span className="flex items-center gap-2"><Activity size={16} className="text-purple-400" />{curve === "equity" ? "Equity curve" : "Drawdown"}</span>}
        subtitle={curve === "equity" ? "Cumulative P&L progression" : "Decline from peak equity"}
        right={<Pills size="sm" value={curve} onChange={setCurve} options={[{ id: "equity", label: "Equity" }, { id: "drawdown", label: "Drawdown" }]} testId="curve" />} pad={false}>
        <div className="px-5 pt-3 pb-2">
          {s.equity.length >= 2 ? <EquityChart points={s.equity} mode={curve} format={v => fmt(v)} />
            : <Empty icon={<Activity size={22} />}>{s.count ? "Close more trades to see your equity curve" : "Complete trades to see your equity curve"}</Empty>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 border-t border-purple-800/30 divide-x divide-purple-800/30">
          <MiniStat label="Avg winner" value={fmt(s.avgWin)} valueClass="text-emerald-400" />
          <MiniStat label="Avg loser" value={fmt(s.avgLoss)} valueClass="text-rose-400" />
          <MiniStat label="Best trade" value={fmt(s.best, true)} valueClass={pnlClass(s.best)} />
          <MiniStat label="Worst trade" value={fmt(s.worst, true)} valueClass={pnlClass(s.worst)} />
          <MiniStat label="Win streak" value={s.maxWinStreak} />
          <MiniStat label="Loss streak" value={s.maxLossStreak} />
          <MiniStat label="Risk : reward" value={`1:${s.riskReward.toFixed(2)}`} />
          <MiniStat label="Open trades" value={s.openCount} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Win / loss distribution" right={<span className="text-xs text-purple-300/70">{s.wins} winners · {s.losses} losers</span>}>
          {s.count ? (
            <>
              <SplitBar a={s.grossProfit} b={-s.grossLoss} />
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div><Label>Gross profit</Label><div className="mt-1 font-semibold text-emerald-400 tabular-nums">{fmt(s.grossProfit)}</div></div>
                <div><Label>Gross loss</Label><div className="mt-1 font-semibold text-rose-400 tabular-nums">{fmt(s.grossLoss)}</div></div>
                <div><Label>Net result</Label><div className={`mt-1 font-semibold tabular-nums ${pnlClass(s.totalPnl)}`}>{fmt(s.totalPnl, true)}</div></div>
              </div>
            </>
          ) : <Empty>No closed trades</Empty>}
        </Card>
        <Card title="Long vs short" subtitle="Performance by trade direction">
          <div className="grid grid-cols-2 gap-3">
            {([["Long", s.long, "from-emerald-600/25"], ["Short", s.short, "from-rose-600/25"]] as const).map(([name, b, tint]) => (
              <div key={name} className={`rounded-xl p-4 bg-gradient-to-br ${tint} to-transparent border border-purple-800/40`} data-testid={`dir-${name.toLowerCase()}`}>
                <div className="text-sm font-semibold text-white">{name}</div>
                <div className="text-xs text-purple-300/70 mt-0.5">{b.count} trade{b.count === 1 ? "" : "s"} · {b.count ? ((b.wins / b.count) * 100).toFixed(1) : "0.0"}% won</div>
                <div className={`mt-3 text-xl font-bold tabular-nums ${pnlClass(b.pnl)}`}>{fmt(b.pnl, true)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Day performance" subtitle="Find your best trading days (by exit)">
          <PnlBars format={v => fmt(v, true)} items={s.weekdays.map((b, i) => ({ label: WEEKDAYS[i], value: b.pnl, sub: b.count ? `${fmt(b.pnl, true)} · ${b.count}` : "—" }))} />
        </Card>
        <Card title="Session performance" subtitle="By entry time — Asian, London & New York (UTC)">
          <div className="space-y-3">
            {(Object.entries(s.sessions) as [string, Stats["long"]][]).map(([name, b]) => (
              <div key={name} className="grid grid-cols-[90px_1fr_auto] items-center gap-3" data-testid={`session-${name}`}>
                <div className="text-sm text-purple-100">{name}</div>
                <SplitBar a={b.wins} b={b.losses} />
                <div className="text-right">
                  <div className={`text-sm font-semibold tabular-nums ${pnlClass(b.pnl)}`}>{b.count ? fmt(b.pnl, true) : "—"}</div>
                  <div className="text-[11px] text-purple-300/60">{b.count} trades · avg {b.count ? fmt(b.pnl / b.count, true) : "—"} · vol {+b.volume.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        <Card title="Top symbols" subtitle="Best performing assets">
          {s.symbols.length ? (
            <div className="space-y-2">
              {s.symbols.slice(0, 8).map(sym => (
                <div key={sym.symbol} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-purple-950/30 border border-purple-800/30" data-testid="symbol-row">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">{sym.symbol.replace(/[^A-Z]/gi, "").slice(0, 3).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">{sym.symbol}</div>
                    <div className="text-[11px] text-purple-300/60">{sym.count} trades · {((sym.wins / sym.count) * 100).toFixed(0)}% won</div>
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${pnlClass(sym.pnl)}`}>{fmt(sym.pnl, true)}</div>
                </div>
              ))}
            </div>
          ) : <Empty icon={<BarChart3 size={22} />}>No symbol data yet</Empty>}
        </Card>
        <Calendar s={s} fmt={fmt} trades={shown} onOpenTrade={onOpenTrade} />
      </div>

      <YourStats s={s} fmt={fmt} />
    </div>
  );
}

function Calendar({ s, fmt, trades, onOpenTrade }: { s: Stats; fmt: (v: number, signed?: boolean) => string; trades: ATrade[]; onOpenTrade?: (t: ATrade) => void }) {
  const lastTrade = s.closed[s.closed.length - 1];
  const [month, setMonth] = useState(() => { const d = new Date(lastTrade?.exitTime ?? Date.now()); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState<string | null>(null);
  const first = (month.getDay() + 6) % 7;            // Monday first
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const keyOf = (d: number) => dayKey(new Date(month.getFullYear(), month.getMonth(), d).getTime());
  const monthTotal = Array.from(s.days.entries()).filter(([k]) => k.startsWith(keyOf(1).slice(0, 7))).reduce((a, [, b]) => a + b.pnl, 0);
  const dayTrades = picked ? trades.filter(t => !t.open && t.exitTime && dayKey(t.exitTime) === picked) : [];
  return (
    <Card title={<span className="flex items-center gap-2"><CalendarDays size={16} className="text-purple-400" />Trading calendar</span>}
      subtitle="Daily P&L heatmap — click a day to see its trades"
      right={
        <div className="flex items-center gap-2">
          <span className={`text-xs tabular-nums ${pnlClass(monthTotal)}`}>Month: {fmt(monthTotal, true)}</span>
          <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="w-7 h-7 rounded-lg border border-purple-800/50 text-purple-300 hover:bg-purple-800/30 flex items-center justify-center"><ChevronLeft size={15} /></button>
          <span className="text-sm text-white w-28 text-center" data-testid="calendar-month">{month.toLocaleString([], { month: "long", year: "numeric" })}</span>
          <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="w-7 h-7 rounded-lg border border-purple-800/50 text-purple-300 hover:bg-purple-800/30 flex items-center justify-center"><ChevronRight size={15} /></button>
        </div>
      }>
      <div className="grid grid-cols-8 gap-1.5 text-[10px] font-semibold uppercase text-purple-300/60 mb-1.5">
        {[...WEEKDAYS, "Week"].map(d => <div key={d} className="text-center">{d}</div>)}
      </div>
      <div className="space-y-1.5" data-testid="calendar">
        {weeks.map((w, wi) => {
          const wk = w.filter(Boolean).map(d => s.days.get(keyOf(d!))).filter(Boolean) as Stats["long"][];
          const wPnl = wk.reduce((a, b) => a + b.pnl, 0);
          return (
            <div key={wi} className="grid grid-cols-8 gap-1.5">
              {w.map((d, i) => {
                if (!d) return <div key={i} className="h-14 rounded-lg bg-purple-950/10" />;
                const k = keyOf(d), b = s.days.get(k);
                const tone = !b ? "bg-purple-950/30 border-purple-900/40" : b.pnl > 0.004 ? "bg-emerald-500/15 border-emerald-500/40" : b.pnl < -0.004 ? "bg-rose-500/15 border-rose-500/40" : "bg-purple-800/20 border-purple-700/40";
                return (
                  <button key={i} disabled={!b} onClick={() => setPicked(picked === k ? null : k)} data-day={k}
                    className={`h-14 rounded-lg border text-left px-1.5 py-1 transition-all ${tone} ${picked === k ? "ring-2 ring-purple-400" : ""} ${b ? "hover:brightness-125 cursor-pointer" : "cursor-default"}`}>
                    <div className="text-[10px] text-purple-300/70">{d}</div>
                    {b && <div className={`text-[11px] font-semibold tabular-nums truncate ${pnlClass(b.pnl)}`}>{fmt(b.pnl, true)}</div>}
                    {b && <div className="text-[9px] text-purple-300/60">{b.count} trade{b.count === 1 ? "" : "s"}</div>}
                  </button>
                );
              })}
              <div className="h-14 rounded-lg bg-purple-900/20 border border-purple-800/30 px-1.5 py-1 text-center">
                <div className="text-[9px] text-purple-300/60 uppercase">Weekly</div>
                <div className={`text-[11px] font-semibold tabular-nums truncate ${pnlClass(wPnl)}`}>{wk.length ? fmt(wPnl, true) : "$0"}</div>
                <div className="text-[9px] text-purple-300/60">{wk.length} day{wk.length === 1 ? "" : "s"}</div>
              </div>
            </div>
          );
        })}
      </div>
      {picked && (
        <div className="mt-4 border-t border-purple-800/30 pt-3" data-testid="day-trades">
          <div className="text-xs text-purple-300/70 mb-2">{new Date(picked + "T00:00").toLocaleDateString([], { dateStyle: "full" })}</div>
          {dayTrades.map(t => (
            <button key={t.key} onClick={() => onOpenTrade?.(t)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-purple-800/20 text-left">
              <span className={`text-[11px] font-bold uppercase ${t.side === "long" ? "text-emerald-400" : "text-rose-400"}`}>{t.side}</span>
              <span className="text-sm text-white flex-1">{t.symbol}</span>
              <span className="text-xs text-purple-300/60">{new Date(t.exitTime!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className={`text-sm font-semibold tabular-nums ${pnlClass(t.pnl)}`}>{fmt(t.pnl, true)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-4 mt-3 text-[11px] text-purple-300/60">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500/60" />Profitable day</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-500/60" />Losing day</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-purple-900/60" />No trades</span>
      </div>
    </Card>
  );
}

function YourStats({ s, fmt }: { s: Stats; fmt: (v: number, signed?: boolean) => string }) {
  const monthName = (k?: string) => (k ? new Date(k + "-01T00:00").toLocaleString([], { month: "long", year: "numeric" }) : "No data");
  const rows: [string, React.ReactNode, string?][] = [
    ["Total P&L", fmt(s.totalPnl, true), pnlClass(s.totalPnl)],
    ["Average daily volume", (+s.avgDailyVolume.toFixed(2)).toString()],
    ["Average winning trade", fmt(s.avgWin), "text-emerald-400"],
    ["Average losing trade", fmt(s.avgLoss), "text-rose-400"],
    ["Total number of trades", s.count],
    ["Number of winning trades", s.wins],
    ["Number of losing trades", s.losses],
    ["Number of break even trades", s.breakeven],
    ["Max consecutive wins", s.maxWinStreak],
    ["Max consecutive losses", s.maxLossStreak],
    ["Current streak", s.currentStreak.kind ? `${s.currentStreak.length} ${s.currentStreak.kind === "win" ? "win" : "loss"}${s.currentStreak.length === 1 ? "" : s.currentStreak.kind === "win" ? "s" : "es"}` : "—"],
    ["Total commissions", fmt(s.commission)],
    ["Total swap", fmt(s.swap)],
    ["Largest profit", fmt(s.best > 0 ? s.best : 0), "text-emerald-400"],
    ["Largest loss", fmt(s.worst < 0 ? s.worst : 0), "text-rose-400"],
    ["Avg hold time (all)", duration(s.avgHold)],
    ["Avg hold time (winners)", duration(s.avgHoldWin)],
    ["Avg hold time (losers)", duration(s.avgHoldLoss)],
    ["Open trades", s.openCount],
    ["Total trading days", s.tradingDays],
    ["Winning days", s.winningDays],
    ["Losing days", s.losingDays],
    ["Breakeven days", s.breakevenDays],
    ["Max consecutive winning days", s.maxWinDays],
    ["Max consecutive losing days", s.maxLossDays],
    ["Average daily P&L", fmt(s.avgDailyPnl, true), pnlClass(s.avgDailyPnl)],
    ["Average winning day P&L", fmt(s.avgWinDayPnl), "text-emerald-400"],
    ["Average losing day P&L", fmt(s.avgLossDayPnl), "text-rose-400"],
    ["Largest profitable day", s.bestDay && s.bestDay.pnl > 0 ? `${fmt(s.bestDay.pnl, true)} · ${s.bestDay.day}` : "—"],
    ["Largest losing day", s.worstDay && s.worstDay.pnl < 0 ? `${fmt(s.worstDay.pnl, true)} · ${s.worstDay.day}` : "—"],
    ["Trade expectancy", fmt(s.expectancy, true), pnlClass(s.expectancy)],
    ["Max drawdown", fmt(s.maxDrawdown), s.maxDrawdown < 0 ? "text-rose-400" : undefined],
    ["Max drawdown %", s.maxDrawdownPct != null ? `${s.maxDrawdownPct.toFixed(2)}%` : "—", s.maxDrawdownPct ? "text-rose-400" : undefined],
  ];
  return (
    <Card title={<span className="flex items-center gap-2"><Clock size={16} className="text-purple-400" />Your stats</span>}>
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        {([["Best month", s.bestMonth], ["Worst month", s.worstMonth]] as const).map(([label, m]) => (
          <div key={label} className="rounded-xl p-4 bg-purple-950/30 border border-purple-800/30">
            <Label>{label}</Label>
            <div className={`mt-1 text-lg font-bold tabular-nums ${m ? pnlClass(m.pnl) : "text-purple-300/50"}`}>{m ? fmt(m.pnl, true) : "—"}</div>
            <div className="text-[11px] text-purple-300/60">{monthName(m?.month)}</div>
          </div>
        ))}
        <div className="rounded-xl p-4 bg-purple-950/30 border border-purple-800/30">
          <Label>Average</Label>
          <div className={`mt-1 text-lg font-bold tabular-nums ${pnlClass(s.avgMonthPnl)}`}>{fmt(s.avgMonthPnl, true)}</div>
          <div className="text-[11px] text-purple-300/60">per month</div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-x-8" data-testid="your-stats">
        {rows.map(([label, value, cls]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2 border-b border-purple-800/20 text-sm">
            <span className="text-purple-300/80">{label}</span>
            <span className={`font-semibold tabular-nums text-right ${cls || "text-white"}`}>{value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

