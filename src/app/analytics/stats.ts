// The statistics Analytics shows, worked out from a list of trades: totals, win rate, profit
// factor, expectancy, streaks, the equity / drawdown curve, long vs short, days of the week,
// trading sessions, symbols, the daily / monthly calendar and the full "Your stats" table.
// Closed trades count by their exit; days and months are in the viewer's time zone.

import type { ATrade } from "./data";

export type Period = "today" | "7d" | "30d" | "3m" | "1y" | "all";
export const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" }, { id: "7d", label: "7 Days" }, { id: "30d", label: "30 Days" },
  { id: "3m", label: "3 Months" }, { id: "1y", label: "1 Year" }, { id: "all", label: "All Time" },
];
export type Outcome = "all" | "winners" | "losers";

const DAY = 86400000;
export function periodStart(p: Period, now = Date.now()): number {
  if (p === "all") return -Infinity;
  if (p === "today") { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
  return now - { "7d": 7, "30d": 30, "3m": 91, "1y": 365 }[p] * DAY;
}

// Trades in a period (closed: by exit; open ones always) and of an outcome
export function filterTrades(trades: ATrade[], period: Period, outcome: Outcome): ATrade[] {
  const from = periodStart(period);
  return trades.filter(t => {
    if (!t.open && (t.exitTime ?? 0) < from) return false;
    if (outcome === "winners") return !t.open && t.pnl > 0;
    if (outcome === "losers") return !t.open && t.pnl < 0;
    return true;
  });
}

export const isWin = (t: ATrade) => t.pnl > 0.004;
export const isLoss = (t: ATrade) => t.pnl < -0.004;

export const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const monthKey = (ms: number) => dayKey(ms).slice(0, 7);

// Trading sessions by the hour (UTC) a trade was entered: Asian 22–07, London 07–12, New York 12–22
// (the London / New York overlap counts as New York)
export type SessionName = "Asian" | "London" | "New York";
export function sessionOf(ms: number): SessionName {
  const h = new Date(ms).getUTCHours();
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 22) return "New York";
  return "Asian";
}

export interface Bucket { count: number; wins: number; losses: number; be: number; pnl: number; volume: number }
const bucket = (): Bucket => ({ count: 0, wins: 0, losses: 0, be: 0, pnl: 0, volume: 0 });
const add = (b: Bucket, t: ATrade) => { b.count++; b.pnl += t.pnl; b.volume += t.qty; if (isWin(t)) b.wins++; else if (isLoss(t)) b.losses++; else b.be++; };

export interface EquityPoint { time: number; equity: number; drawdown: number; drawdownPct: number | null }

export interface Stats {
  closed: ATrade[]; openCount: number; count: number; wins: number; losses: number; breakeven: number;
  totalPnl: number; winRate: number; grossProfit: number; grossLoss: number; profitFactor: number; expectancy: number;
  avgWin: number; avgLoss: number; best: number; worst: number; maxWinStreak: number; maxLossStreak: number;
  currentStreak: { kind: "win" | "loss" | null; length: number }; riskReward: number;
  long: Bucket; short: Bucket; weekdays: Bucket[]; sessions: Record<SessionName, Bucket>;
  symbols: (Bucket & { symbol: string })[];
  days: Map<string, Bucket>; months: Map<string, Bucket>;
  equity: EquityPoint[]; maxDrawdown: number; maxDrawdownPct: number | null;
  commission: number; swap: number;
  avgHold: number | null; avgHoldWin: number | null; avgHoldLoss: number | null;
  tradingDays: number; winningDays: number; losingDays: number; breakevenDays: number;
  maxWinDays: number; maxLossDays: number; avgDailyPnl: number; avgWinDayPnl: number; avgLossDayPnl: number;
  bestDay: { day: string; pnl: number } | null; worstDay: { day: string; pnl: number } | null;
  bestMonth: { month: string; pnl: number } | null; worstMonth: { month: string; pnl: number } | null; avgMonthPnl: number;
  avgDailyVolume: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function streaks<T>(xs: T[], win: (x: T) => boolean, loss: (x: T) => boolean) {
  let w = 0, l = 0, maxW = 0, maxL = 0;
  for (const x of xs) {
    if (win(x)) { w++; l = 0; } else if (loss(x)) { l++; w = 0; } else { w = 0; l = 0; }
    maxW = Math.max(maxW, w); maxL = Math.max(maxL, l);
  }
  return { maxW, maxL, w, l };
}

export function computeStats(trades: ATrade[], initialBalance = 0): Stats {
  const closed = trades.filter(t => !t.open && t.exitTime != null).sort((a, b) => a.exitTime! - b.exitTime!);
  const wins = closed.filter(isWin), losses = closed.filter(isLoss);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = losses.reduce((s, t) => s + t.pnl, 0);
  const totalPnl = grossProfit + grossLoss + closed.filter(t => !isWin(t) && !isLoss(t)).reduce((s, t) => s + t.pnl, 0);
  const st = streaks(closed, isWin, isLoss);
  const avgWin = avg(wins.map(t => t.pnl)), avgLoss = avg(losses.map(t => t.pnl));

  const long = bucket(), short = bucket();
  const weekdays = Array.from({ length: 7 }, bucket);            // Monday first
  const sessions: Record<SessionName, Bucket> = { Asian: bucket(), London: bucket(), "New York": bucket() };
  const symbols = new Map<string, Bucket>(), days = new Map<string, Bucket>(), months = new Map<string, Bucket>();
  for (const t of closed) {
    add(t.side === "long" ? long : short, t);
    add(weekdays[(new Date(t.exitTime!).getDay() + 6) % 7], t);
    add(sessions[sessionOf(t.entryTime)], t);
    for (const [map, k] of [[symbols, t.symbol], [days, dayKey(t.exitTime!)], [months, monthKey(t.exitTime!)]] as const) {
      if (!map.has(k)) map.set(k, bucket());
      add(map.get(k)!, t);
    }
  }

  // Equity from the starting balance (or 0), and how far it is below its peak
  let equity = initialBalance, peak = initialBalance, maxDrawdown = 0, maxDrawdownPct: number | null = initialBalance > 0 ? 0 : null;
  const curve: EquityPoint[] = closed.length ? [{ time: closed[0].entryTime, equity, drawdown: 0, drawdownPct: initialBalance > 0 ? 0 : null }] : [];
  for (const t of closed) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    const dd = equity - peak;
    const ddPct = peak > 0 ? (dd / peak) * 100 : null;
    maxDrawdown = Math.min(maxDrawdown, dd);
    if (ddPct != null && maxDrawdownPct != null) maxDrawdownPct = Math.min(maxDrawdownPct, ddPct);
    curve.push({ time: t.exitTime!, equity, drawdown: dd, drawdownPct: ddPct });
  }

  const hold = (xs: ATrade[]) => (xs.length ? avg(xs.map(t => t.exitTime! - t.entryTime)) : null);
  const dayList = Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b));
  const winDays = dayList.filter(([, b]) => b.pnl > 0.004), lossDays = dayList.filter(([, b]) => b.pnl < -0.004);
  const dst = streaks(dayList, ([, b]) => b.pnl > 0.004, ([, b]) => b.pnl < -0.004);
  const extreme = <K extends string>(list: [string, Bucket][], key: K, best: boolean) =>
    list.length ? list.reduce((m, [k, b]) => ((best ? b.pnl > m.pnl : b.pnl < m.pnl) ? { [key]: k, pnl: b.pnl } as any : m), { [key]: list[0][0], pnl: list[0][1].pnl } as any) : null;
  const monthList = Array.from(months.entries());
  const last = closed[closed.length - 1];
  const currentKind = !last ? null : isWin(last) ? "win" : isLoss(last) ? "loss" : null;

  return {
    closed, openCount: trades.filter(t => t.open).length, count: closed.length,
    wins: wins.length, losses: losses.length, breakeven: closed.length - wins.length - losses.length,
    totalPnl, winRate: closed.length ? (wins.length / closed.length) * 100 : 0, grossProfit, grossLoss,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : grossProfit > 0 ? Infinity : 0,
    expectancy: closed.length ? totalPnl / closed.length : 0,
    avgWin, avgLoss, best: closed.length ? Math.max(...closed.map(t => t.pnl)) : 0, worst: closed.length ? Math.min(...closed.map(t => t.pnl)) : 0,
    maxWinStreak: st.maxW, maxLossStreak: st.maxL,
    currentStreak: { kind: currentKind, length: currentKind === "win" ? st.w : currentKind === "loss" ? st.l : 0 },
    riskReward: avgLoss < 0 ? avgWin / -avgLoss : 0,
    long, short, weekdays, sessions,
    symbols: Array.from(symbols.entries()).map(([symbol, b]) => ({ symbol, ...b })).sort((a, b) => b.pnl - a.pnl),
    days, months, equity: curve, maxDrawdown, maxDrawdownPct,
    commission: closed.reduce((s, t) => s + t.commission, 0), swap: closed.reduce((s, t) => s + t.swap, 0),
    avgHold: hold(closed), avgHoldWin: hold(wins), avgHoldLoss: hold(losses),
    tradingDays: dayList.length, winningDays: winDays.length, losingDays: lossDays.length, breakevenDays: dayList.length - winDays.length - lossDays.length,
    maxWinDays: dst.maxW, maxLossDays: dst.maxL,
    avgDailyPnl: avg(dayList.map(([, b]) => b.pnl)), avgWinDayPnl: avg(winDays.map(([, b]) => b.pnl)), avgLossDayPnl: avg(lossDays.map(([, b]) => b.pnl)),
    bestDay: extreme(dayList, "day", true), worstDay: extreme(dayList, "day", false),
    bestMonth: extreme(monthList, "month", true), worstMonth: extreme(monthList, "month", false),
    avgMonthPnl: avg(monthList.map(([, b]) => b.pnl)),
    avgDailyVolume: dayList.length ? closed.reduce((s, t) => s + t.qty, 0) / dayList.length : 0,
  };
}

export function profitFactorLabel(pf: number, count: number) {
  if (!count) return "No trades yet";
  if (pf >= 2) return "Excellent";
  if (pf >= 1.5) return "Good";
  if (pf >= 1) return "Fair";
  return "Needs work";
}

// ---- one trade's quality (out of 100): profitability 30, execution 40 (the checklist), journal 20, your rating 10
export interface Quality { total: number; profitability: number; execution: number; journal: number; rating: number }
export function tradeQuality(t: ATrade, s: Stats, j?: { checklist?: Record<string, boolean | undefined>; pre_trade?: string; post_trade?: string; lessons?: string; rating?: number | null }): Quality {
  let profitability = 10;                                         // breakeven
  if (isWin(t)) profitability = 15 + 15 * Math.min(1, s.avgWin > 0 ? t.pnl / s.avgWin : 1);
  else if (isLoss(t)) profitability = 10 * Math.max(0, 1 - (s.avgLoss < 0 ? t.pnl / s.avgLoss : 1));   // a smaller-than-usual loss keeps some
  const c = j?.checklist || {};
  const execution = ["followed_plan", "proper_risk", "good_entry", "patient_exit"].filter(k => c[k]).length * 10;
  const journal = (j?.pre_trade?.trim() ? 7 : 0) + (j?.post_trade?.trim() ? 7 : 0) + (j?.lessons?.trim() ? 6 : 0);
  const rating = j?.rating ? j.rating : 0;
  const r = (v: number) => Math.round(v);
  return { total: r(profitability) + execution + journal + rating, profitability: r(profitability), execution, journal, rating };
}

// ---- formatting
export function money(v: number, currency = "USD", signed = false) {
  const s = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = v < -0.004 ? "-" : signed && v > 0.004 ? "+" : "";
  return `${sign}${currency === "USD" ? "$" : ""}${s}${currency && currency !== "USD" ? ` ${currency}` : ""}`;
}
export function duration(msv: number | null) {
  if (msv == null) return "—";
  const m = Math.round(msv / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
export const pnlClass = (v: number) => (v > 0.004 ? "text-emerald-400" : v < -0.004 ? "text-rose-400" : "text-purple-100");
