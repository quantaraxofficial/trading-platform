// Everything the strategy report shows, computed from a backtest's real trades and bar-by-bar equity
// (the Pine engine's PineStrategyReport): the key stats, the performance-analysis tabs (breakdown,
// periodical, benchmarking, margin, growth and decline), the trades-analysis tabs (distribution,
// streaks, time patterns), and the number formats TradingView's report uses.

import type { PineStrategyReport, PineStrategyTrade } from "../../lib/pineScriptEngine";

// ---------------------------------------------------------------- formatting

const MINUS = "−";

export function fmtNum(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (v < 0 && s !== (0).toFixed(digits) ? MINUS : "") + s;
}
export function fmtSigned(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  const s = fmtNum(Math.abs(v), digits);
  if (s === (0).toFixed(digits)) return s;
  return (v > 0 ? "+" : MINUS) + s;
}
export const fmtPct = (v: number, digits = 2) => `${fmtNum(v, digits)}%`;
export const fmtSignedPct = (v: number, digits = 2) => `${fmtSigned(v, digits)}%`;
// "66.04 K", "1.20 M" — the report's compact money format
export function fmtCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${fmtNum(v / 1e9)} B`;
  if (a >= 1e6) return `${fmtNum(v / 1e6)} M`;
  if (a >= 1e3) return `${fmtNum(v / 1e3)} K`;
  return fmtNum(v);
}
// "100 K" on the capital button (no decimals when round)
export function fmtCapital(v: number): string {
  const unit = v >= 1e6 ? [1e6, "M"] as const : v >= 1e3 ? [1e3, "K"] as const : null;
  if (!unit) return String(v);
  const n = v / unit[0];
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, "")} ${unit[1]}`;
}
// Axis labels of the report's charts: "2.70 K", "900.00", "−900.00"
export function fmtAxis(v: number): string {
  return Math.abs(v) >= 1000 ? `${fmtNum(v / 1000)} K` : fmtNum(v);
}

// ---------------------------------------------------------------- time

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface Zoned { y: number; m: number; d: number; h: number; min: number; wd: number }

// One formatter per zone (building an Intl.DateTimeFormat is costly, and reports format thousands
// of times)
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short",
    });
    formatters.set(zone, f);
  }
  return f;
}

// Bar times are shown in the chart's time zone ("exchange" = the bar times as they are)
export function zoned(t: number, tz: string): Zoned {
  const zone = !tz || tz === "exchange" ? "UTC" : tz;
  if (zone === "UTC") {
    const d = new Date(t * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), wd: d.getUTCDay() };
  }
  try {
    const parts = formatterFor(zone).formatToParts(new Date(t * 1000));
    const get = (k: string) => parts.find((p) => p.type === k)?.value || "0";
    return { y: +get("year"), m: +get("month") - 1, d: +get("day"), h: +get("hour") % 24, min: +get("minute"), wd: WEEKDAYS.indexOf(get("weekday")) };
  } catch {
    const d = new Date(t * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), wd: d.getUTCDay() };
  }
}
const pad = (n: number) => String(n).padStart(2, "0");
// "Sep 28, 2026, 20:55"
export function fmtDateTime(t: number, tz: string): string {
  const z = zoned(t, tz);
  return `${MONTHS[z.m]} ${z.d}, ${z.y}, ${pad(z.h)}:${pad(z.min)}`;
}
// "Aug 31, 2026"
export function fmtDate(t: number, tz: string): string {
  const z = zoned(t, tz);
  return `${MONTHS[z.m]} ${z.d}, ${z.y}`;
}
// "Thu, Sep 24, 2026, 20:55" (the performance chart's tooltip)
export function fmtDateTimeLong(t: number, tz: string): string {
  const z = zoned(t, tz);
  return `${WEEKDAYS[z.wd]}, ${MONTHS[z.m]} ${z.d}, ${z.y}, ${pad(z.h)}:${pad(z.min)}`;
}
// "2 days 4 hours", "35 minutes"
export function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "0 minutes";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.round((sec % 3600) / 60);
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d > 0) return h > 0 ? `${part(d, "day")} ${part(h, "hour")}` : part(d, "day");
  if (h > 0) return m > 0 ? `${part(h, "hour")} ${part(m, "minute")}` : part(h, "hour");
  return part(m, "minute");
}

// ---------------------------------------------------------------- key stats and breakdowns

export const isWin = (t: PineStrategyTrade) => t.netPnl > 0;
export const isLoss = (t: PineStrategyTrade) => t.netPnl < 0;

export interface PnlRow {
  key: string; label: string; side?: "long" | "short";
  grossProfit: number; grossLoss: number; commission: number; net: number; count: number;
}
function pnlRow(key: string, label: string, trades: PineStrategyTrade[], side?: "long" | "short"): PnlRow {
  let gp = 0, gl = 0, c = 0;
  for (const t of trades) { if (t.netPnl > 0) gp += t.netPnl; else gl += -t.netPnl; c += t.commission || 0; }
  return { key, label, side, grossProfit: gp, grossLoss: gl, commission: c, net: gp - gl, count: trades.length };
}
// "Profits and losses": by the orders' signal names (the entry ids), or by side
export function pnlBySignals(r: PineStrategyReport): PnlRow[] {
  const groups = new Map<string, PineStrategyTrade[]>();
  for (const t of r.trades) { const k = t.entrySignal || t.type; groups.set(k, [...(groups.get(k) || []), t]); }
  const rows = Array.from(groups.entries()).map(([k, ts]) => pnlRow(k, k, ts)).sort((a, b) => b.net - a.net);
  return [pnlRow("__all", "All signals", r.trades), ...rows];
}
export function pnlBySide(r: PineStrategyReport): PnlRow[] {
  return [
    pnlRow("__all", "Both sides", r.trades),
    pnlRow("long", "Longs", r.trades.filter((t) => t.type === "Long"), "long"),
    pnlRow("short", "Shorts", r.trades.filter((t) => t.type === "Short"), "short"),
  ];
}

export function totalCommission(r: PineStrategyReport) {
  return r.trades.reduce((a, t) => a + (t.commission || 0), 0);
}

// ---------------------------------------------------------------- periods (Daily / Weekly / ...)

export type PeriodKind = "day" | "week" | "month" | "quarter" | "year";

// The start (as a UTC date) of the calendar period a time falls in, in the chart's zone
function periodStart(t: number, kind: PeriodKind, tz: string): number {
  const z = zoned(t, tz);
  switch (kind) {
    case "day": return Date.UTC(z.y, z.m, z.d);
    case "week": return Date.UTC(z.y, z.m, z.d - z.wd); // weeks start on Sunday
    case "month": return Date.UTC(z.y, z.m, 1);
    case "quarter": return Date.UTC(z.y, z.m - (z.m % 3), 1);
    case "year": return Date.UTC(z.y, 0, 1);
  }
}
function nextPeriod(ms: number, kind: PeriodKind): number {
  const d = new Date(ms);
  switch (kind) {
    case "day": return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    case "week": return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7);
    case "month": return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    case "quarter": return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1);
    case "year": return Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  }
}
function periodLabel(ms: number, kind: PeriodKind): string {
  const d = new Date(ms);
  if (kind === "year") return String(d.getUTCFullYear());
  if (kind === "quarter") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (kind === "month") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export interface PeriodBucket { key: number; label: string; profit: number; loss: number; net: number; fe: number; ae: number; count: number; startClose: number | null; endClose: number | null; startEquity: number | null; endEquity: number | null }

// Every calendar period of the testing window (empty ones included), with the P&L of the trades
// closed in it and the price / equity at its edges
export function periodBuckets(r: PineStrategyReport, kind: PeriodKind, tz: string): PeriodBucket[] {
  const eq = r.equityCurve;
  if (!eq.length) return [];
  const first = periodStart(eq[0].time, kind, tz);
  const last = periodStart(eq[eq.length - 1].time, kind, tz);
  const out: PeriodBucket[] = [];
  const index = new Map<number, PeriodBucket>();
  for (let ms = first, guard = 0; ms <= last && guard < 5000; ms = nextPeriod(ms, kind), guard++) {
    const b: PeriodBucket = { key: ms, label: periodLabel(ms, kind), profit: 0, loss: 0, net: 0, fe: 0, ae: 0, count: 0, startClose: null, endClose: null, startEquity: null, endEquity: null };
    out.push(b); index.set(ms, b);
  }
  for (const t of r.trades) {
    const b = index.get(periodStart(t.exitTime, kind, tz));
    if (!b) continue;
    if (t.netPnl > 0) b.profit += t.netPnl; else b.loss += t.netPnl;
    b.net += t.netPnl; b.fe += t.favorableExcursion; b.ae += t.adverseExcursion; b.count++;
  }
  let prevEquity = r.initialCapital, prevClose: number | null = eq[0].close;
  for (const p of eq) {
    const b = index.get(periodStart(p.time, kind, tz));
    if (!b) continue;
    if (b.startClose === null) { b.startClose = prevClose; b.startEquity = prevEquity; }
    b.endClose = p.close; b.endEquity = p.equity;
    prevClose = p.close; prevEquity = p.equity;
  }
  return out;
}

// ---------------------------------------------------------------- periodical / benchmarking

export function daysInWindow(r: PineStrategyReport): number {
  const eq = r.equityCurve;
  return eq.length > 1 ? (eq[eq.length - 1].time - eq[0].time) / 86400 : 0;
}

// Annualized return. TradingView reports it only once the testing window spans a full year
// (0.00% below that, rather than extrapolating a month's result to a year)
export function cagr(r: PineStrategyReport): number {
  const days = daysInWindow(r);
  if (days < 365 || r.initialCapital <= 0) return 0;
  const final = r.initialCapital + r.netProfit;
  if (final <= 0) return -100;
  return (Math.pow(final / r.initialCapital, 365 / days) - 1) * 100;
}

// Sharpe / Sortino over monthly returns with a 2% annual risk-free rate, as TradingView computes
// them; null until there are at least two months to compare
export function sharpeSortino(r: PineStrategyReport, tz: string): { sharpe: number | null; sortino: number | null } {
  const months = periodBuckets(r, "month", tz).filter((b) => b.startEquity !== null && b.endEquity !== null);
  if (months.length < 2) return { sharpe: null, sortino: null };
  const rets = months.map((b) => ((b.endEquity! - b.startEquity!) / b.startEquity!) * 100);
  const rfr = 2 / 12;
  const mean = rets.reduce((a, v) => a + v, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, v) => a + (v - mean) ** 2, 0) / rets.length);
  const dd = Math.sqrt(rets.reduce((a, v) => a + Math.min(0, v - rfr) ** 2, 0) / rets.length);
  return { sharpe: sd > 0 ? (mean - rfr) / sd : null, sortino: dd > 0 ? (mean - rfr) / dd : null };
}

export function buyAndHoldPct(r: PineStrategyReport): number {
  const eq = r.equityCurve;
  if (eq.length < 2 || !(eq[0].close > 0)) return 0;
  return (eq[eq.length - 1].close / eq[0].close - 1) * 100;
}

// Correlation between the strategy's equity and the symbol's price over the testing window
export function equityPriceCorrelation(r: PineStrategyReport): number | null {
  const eq = r.equityCurve;
  if (eq.length < 3) return null;
  const n = eq.length;
  let sx = 0, sy = 0;
  for (const p of eq) { sx += p.equity; sy += p.close; }
  const mx = sx / n, my = sy / n;
  let cov = 0, vx = 0, vy = 0;
  for (const p of eq) { cov += (p.equity - mx) * (p.close - my); vx += (p.equity - mx) ** 2; vy += (p.close - my) ** 2; }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null;
}

// ---------------------------------------------------------------- growth and decline

export interface Episode { kind: "runup" | "drawdown"; pct: number; amount: number; start: number; end: number; current: boolean }

// The equity's alternating growth and decline, on the closed-trade equity (initial capital plus
// cumulative P&L): the swings between its turning points, where a turn only counts once the equity
// has moved back by a tenth of its largest drawdown (so every small wiggle isn't a new period).
// A run-up is measured in % of the trough it rose from, a drawdown in % of the peak it fell from;
// the last swing is the current one.
export function growthEpisodes(r: PineStrategyReport): Episode[] {
  const pts: { time: number; v: number }[] = [];
  if (r.equityCurve.length) pts.push({ time: r.equityCurve[0].time, v: r.initialCapital });
  for (const t of r.trades) pts.push({ time: t.exitTime, v: r.initialCapital + t.cumulativePnl });
  if (pts.length < 2) return [];
  let maxDd = 0, runPeak = pts[0].v;
  for (const p of pts) { runPeak = Math.max(runPeak, p.v); maxDd = Math.max(maxDd, runPeak - p.v); }
  const thr = maxDd * 0.1;
  const eps: Episode[] = [];
  const push = (kind: Episode["kind"], from: { time: number; v: number }, to: { time: number; v: number }, current: boolean) => {
    const amount = Math.abs(to.v - from.v);
    if (amount <= 0) return;
    eps.push({ kind, amount, pct: from.v > 0 ? (amount / from.v) * 100 : 0, start: from.time, end: to.time, current });
  };
  // `pivot`: where the current swing started; `ext`: its extreme so far
  let pivot = pts[0], ext = pts[0];
  let dir: 0 | 1 | -1 = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (dir === 0) {
      if (p.v > pivot.v) { dir = 1; ext = p; } else if (p.v < pivot.v) { dir = -1; ext = p; }
      continue;
    }
    if (dir === 1) {
      if (p.v >= ext.v) ext = p;
      else if (ext.v - p.v > thr) { push("runup", pivot, ext, false); pivot = ext; ext = p; dir = -1; }
    } else {
      if (p.v <= ext.v) ext = p;
      else if (p.v - ext.v > thr) { push("drawdown", pivot, ext, false); pivot = ext; ext = p; dir = 1; }
    }
  }
  if (dir === 1) push("runup", pivot, ext, true);
  else if (dir === -1) push("drawdown", pivot, ext, true);
  return eps;
}

// ---------------------------------------------------------------- trades analysis

export function expectancy(r: PineStrategyReport): number {
  return r.trades.length ? r.netProfit / r.trades.length : 0;
}

// P&L of the statistical outliers: trades whose result lies more than two standard deviations from
// the average trade
export function outliersPnl(r: PineStrategyReport): number {
  const n = r.trades.length;
  if (n < 3) return 0;
  const mean = r.trades.reduce((a, t) => a + t.netPnl, 0) / n;
  const sd = Math.sqrt(r.trades.reduce((a, t) => a + (t.netPnl - mean) ** 2, 0) / n);
  if (!(sd > 0)) return 0;
  return r.trades.filter((t) => Math.abs(t.netPnl - mean) > 2 * sd).reduce((a, t) => a + t.netPnl, 0);
}

export function largest(r: PineStrategyReport) {
  let win: PineStrategyTrade | null = null, loss: PineStrategyTrade | null = null;
  for (const t of r.trades) {
    if (t.netPnl > 0 && (!win || t.netPnl > win.netPnl)) win = t;
    if (t.netPnl < 0 && (!loss || t.netPnl < loss.netPnl)) loss = t;
  }
  return { win, loss };
}

export function averages(r: PineStrategyReport) {
  const w = r.trades.filter(isWin), l = r.trades.filter(isLoss);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return { avgWinPct: avg(w.map((t) => t.returnPct)), avgLossPct: avg(l.map((t) => t.returnPct)) };
}

// Trade returns in % binned on a round step, for the returns-distribution histogram
export function returnsHistogram(r: PineStrategyReport): { edges: number[]; bins: { from: number; to: number; count: number; profit: boolean }[] } {
  const rets = r.trades.map((t) => t.returnPct);
  if (!rets.length) return { edges: [], bins: [] };
  let lo = Math.min(...rets, 0), hi = Math.max(...rets, 0);
  if (hi - lo < 1e-9) { lo -= 0.1; hi += 0.1; }
  const raw = (hi - lo) / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) || raw;
  const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
  const edges: number[] = [];
  for (let e = start; e <= end + step / 2; e += step) edges.push(Math.round(e / step) * step);
  // bins left of 0 hold the losers, from 0 up the winners
  const bins = edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1], count: 0, profit: from >= 0 }));
  for (const v of rets) bins[Math.min(bins.length - 1, Math.max(0, Math.floor((v - start) / step + 1e-9)))].count++;
  return { edges, bins };
}

// Consecutive winners / losers, with each trade's position in its streak (+n winners, −n losers)
// and the running amount within the streak
export function streaks(r: PineStrategyReport) {
  const perTrade: { count: number; amount: number }[] = [];
  const runs: { win: boolean; len: number; amount: number }[] = [];
  let cur: { win: boolean; len: number; amount: number } | null = null;
  for (const t of r.trades) {
    if (t.netPnl === 0) { cur = null; perTrade.push({ count: 0, amount: 0 }); continue; }
    const win = t.netPnl > 0;
    if (!cur || cur.win !== win) { cur = { win, len: 0, amount: 0 }; runs.push(cur); }
    cur.len++; cur.amount += t.netPnl;
    perTrade.push({ count: win ? cur.len : -cur.len, amount: cur.amount });
  }
  const winRuns = runs.filter((x) => x.win), lossRuns = runs.filter((x) => !x.win);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    perTrade,
    longestWin: winRuns.reduce((m, x) => Math.max(m, x.len), 0),
    longestLoss: lossRuns.reduce((m, x) => Math.max(m, x.len), 0),
    avgWin: avg(winRuns.map((x) => x.len)),
    avgLoss: avg(lossRuns.map((x) => x.len)),
  };
}

export type TimeGroup = "hours" | "days" | "months";
// Winners and losers by the hour / weekday / month they were entered in
export function resultsByTime(r: PineStrategyReport, group: TimeGroup, tz: string) {
  const labels = group === "hours" ? Array.from({ length: 24 }, (_, h) => `${pad(h)}:00`)
    : group === "days" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : MONTHS.slice();
  const rows = labels.map((label) => ({ label, winners: 0, losers: 0, net: 0 }));
  for (const t of r.trades) {
    const z = zoned(t.entryTime, tz);
    const i = group === "hours" ? z.h : group === "days" ? (z.wd + 6) % 7 : z.m;
    if (t.netPnl > 0) rows[i].winners++; else if (t.netPnl < 0) rows[i].losers++;
    rows[i].net += t.netPnl;
  }
  return rows;
}
export function bestEntryTimes(r: PineStrategyReport, tz: string) {
  const best = (rows: { label: string; net: number; winners: number; losers: number }[], names?: string[]) => {
    let bi = -1;
    rows.forEach((x, i) => { if (x.winners + x.losers > 0 && (bi < 0 || x.net > rows[bi].net)) bi = i; });
    return bi < 0 ? null : names ? names[bi] : rows[bi].label;
  };
  return {
    hour: best(resultsByTime(r, "hours", tz)),
    day: best(resultsByTime(r, "days", tz), ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
    month: best(resultsByTime(r, "months", tz), MONTHS_LONG),
  };
}
export function avgTradeDuration(r: PineStrategyReport): number {
  const n = r.trades.length;
  return n ? r.trades.reduce((a, t) => a + (t.exitTime - t.entryTime), 0) / n : 0;
}

// ---------------------------------------------------------------- list of trades CSV

export function tradesCsv(r: PineStrategyReport, tz: string, currency: string): string {
  const head = ["Trade #", "Type", "Signal", "Date/Time", "Price " + currency, "Position size (qty)", "Position size (value)", `Net P&L ${currency}`, "Net P&L %", `Favorable excursion ${currency}`, "Favorable excursion %", `Adverse excursion ${currency}`, "Adverse excursion %", `Cumulative P&L ${currency}`, "Cumulative P&L %", "Commission " + currency, "Duration (bars)"];
  const rows: string[][] = [head];
  const all = r.openTrade ? [...r.trades, r.openTrade] : r.trades;
  const pctOf = (v: number, t: PineStrategyTrade) => { const n = t.entryPrice * t.qty; return n > 0 ? ((v / n) * 100).toFixed(2) : "0"; };
  for (const t of all) {
    const common = [String(t.qty), (t.entryPrice * t.qty).toFixed(2), t.netPnl.toFixed(2), t.returnPct.toFixed(2), t.favorableExcursion.toFixed(2), pctOf(t.favorableExcursion, t), t.adverseExcursion.toFixed(2), pctOf(t.adverseExcursion, t), t.cumulativePnl.toFixed(2), ((t.cumulativePnl / (r.initialCapital || 1)) * 100).toFixed(2), (t.commission || 0).toFixed(2), String(t.exitBar - t.entryBar)];
    const side = t.type.toLowerCase();
    rows.push([String(t.num), `Exit ${side}`, t.exitSignal, t.exitSignal === "Open" ? "" : fmtDateTime(t.exitTime, tz), t.exitSignal === "Open" ? "" : String(t.exitPrice), ...common]);
    rows.push([String(t.num), `Entry ${side}`, t.entrySignal, fmtDateTime(t.entryTime, tz), String(t.entryPrice), ...common]);
  }
  return rows.map((row) => row.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
}
