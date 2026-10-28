// What a strategy backtest is ranked by in the optimizer: the Strategy Tester's own figures, plus
// risk-adjusted ones (return over drawdown, Sharpe and Sortino of the monthly returns, as
// TradingView computes them) and consistency (profitable months, profitable years).
// The backend keeps these keys (core/optimizer_api.py METRICS).

import type { PineStrategyReport } from "../pineScriptEngine";

export interface Metrics {
  netProfit: number; netProfitPct: number; grossProfit: number; grossLoss: number; profitFactor: number | null;
  winRate: number; totalTrades: number; maxDrawdown: number; maxDrawdownPct: number; returnToDrawdown: number | null;
  avgTrade: number; avgTradePct: number; largestLoss: number; avgBarsInTrade: number; longPnl: number; shortPnl: number;
  sharpe: number | null; sortino: number | null; profitableMonthsPct: number | null; worstMonthPct: number | null;
  profitableYears: number; years: number;
}

export const METRIC_INFO: { key: keyof Metrics; label: string; short: string; lowerBetter?: boolean; kind: "money" | "pct" | "num" | "int" }[] = [
  { key: "netProfit", label: "Net profit", short: "Net P&L", kind: "money" },
  { key: "netProfitPct", label: "Net profit %", short: "Net %", kind: "pct" },
  { key: "profitFactor", label: "Profit factor", short: "PF", kind: "num" },
  { key: "returnToDrawdown", label: "Return ÷ max drawdown", short: "Ret/DD", kind: "num" },
  { key: "sharpe", label: "Sharpe ratio", short: "Sharpe", kind: "num" },
  { key: "sortino", label: "Sortino ratio", short: "Sortino", kind: "num" },
  { key: "winRate", label: "Percent profitable", short: "Win %", kind: "pct" },
  { key: "profitableMonthsPct", label: "Profitable months %", short: "Months+", kind: "pct" },
  { key: "worstMonthPct", label: "Worst month %", short: "Worst mo", kind: "pct" },
  { key: "maxDrawdownPct", label: "Max drawdown %", short: "Max DD", kind: "pct", lowerBetter: true },
  { key: "maxDrawdown", label: "Max drawdown", short: "Max DD $", kind: "money", lowerBetter: true },
  { key: "totalTrades", label: "Total trades", short: "Trades", kind: "int" },
  { key: "avgTrade", label: "Average trade", short: "Avg trade", kind: "money" },
  { key: "avgTradePct", label: "Average trade %", short: "Avg %", kind: "pct" },
  { key: "largestLoss", label: "Largest losing trade", short: "Worst trade", kind: "money" },
  { key: "longPnl", label: "Long P&L", short: "Long", kind: "money" },
  { key: "shortPnl", label: "Short P&L", short: "Short", kind: "money" },
  { key: "avgBarsInTrade", label: "Average bars in trade", short: "Bars", kind: "num", lowerBetter: true },
];

export function formatMetric(kind: string, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (kind === "money") return (v < 0 ? "−" : "") + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (kind === "pct") return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
  if (kind === "int") return Math.round(v).toLocaleString();
  return (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const capped = (v: number) => Math.max(-1e6, Math.min(1e6, v));

export function computeMetrics(rep: PineStrategyReport): Metrics {
  const trades = rep.trades;
  const n = trades.length;
  const cap = rep.initialCapital || 1;
  // Month / year buckets of closed trades' P&L (by exit time)
  const byMonth = new Map<number, number>();
  const byYear = new Map<number, number>();
  for (const t of trades) {
    const d = new Date(t.exitTime * 1000);
    const mk = d.getUTCFullYear() * 12 + d.getUTCMonth();
    byMonth.set(mk, (byMonth.get(mk) || 0) + t.netPnl);
    byYear.set(d.getUTCFullYear(), (byYear.get(d.getUTCFullYear()) || 0) + t.netPnl);
  }
  // Monthly returns over every month from the first trade's to the last's (quiet months count as 0)
  let sharpe: number | null = null, sortino: number | null = null, worstMonthPct: number | null = null;
  if (byMonth.size) {
    const keys = Array.from(byMonth.keys()).sort((a, b) => a - b);
    const rets: number[] = [];
    let equity = cap;
    for (let k = keys[0]; k <= keys[keys.length - 1]; k++) {
      const pnl = byMonth.get(k) || 0;
      const r = equity > 0 ? pnl / equity : 0;
      rets.push(r);
      equity += pnl;
    }
    worstMonthPct = Math.min(...rets) * 100;
    if (rets.length >= 2) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
      const down = Math.sqrt(rets.reduce((a, b) => a + Math.min(0, b) ** 2, 0) / rets.length);
      sharpe = sd > 0 ? mean / sd : null;
      sortino = down > 0 ? mean / down : null;
    }
  }
  const months = Array.from(byMonth.values());
  const years = Array.from(byYear.values());
  const pf = rep.grossLoss !== 0 ? rep.grossProfit / Math.abs(rep.grossLoss) : rep.grossProfit > 0 ? 100 : null;
  const dd = Math.abs(rep.maxDrawdownPct);
  return {
    netProfit: r6(rep.netProfit), netProfitPct: r6(rep.netProfitPct), grossProfit: r6(rep.grossProfit), grossLoss: r6(-Math.abs(rep.grossLoss)),
    profitFactor: pf == null ? null : r6(Math.min(100, pf)), winRate: r6(rep.profitablePct), totalTrades: n,
    maxDrawdown: r6(Math.abs(rep.maxDrawdown)), maxDrawdownPct: r6(dd),
    returnToDrawdown: dd > 0 ? r6(capped(rep.netProfitPct / dd)) : rep.netProfitPct > 0 ? 100 : null,
    avgTrade: n ? r6(rep.netProfit / n) : 0, avgTradePct: n ? r6(trades.reduce((a, t) => a + t.returnPct, 0) / n) : 0,
    largestLoss: n ? r6(Math.min(0, ...trades.map(t => t.netPnl))) : 0,
    avgBarsInTrade: n ? r6(trades.reduce((a, t) => a + (t.exitBar - t.entryBar), 0) / n) : 0,
    longPnl: r6(rep.longPnl), shortPnl: r6(rep.shortPnl),
    sharpe: sharpe == null ? null : r6(sharpe), sortino: sortino == null ? null : r6(sortino),
    profitableMonthsPct: months.length ? r6(months.filter(v => v > 0).length / months.length * 100) : null,
    worstMonthPct: worstMonthPct == null ? null : r6(worstMonthPct),
    profitableYears: years.filter(v => v > 0).length, years: years.length,
  };
}
