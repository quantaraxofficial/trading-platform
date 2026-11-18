// The times of the bars still to come after the last one, as TradingView's time axis keeps going past
// the last candle: its times and dates go on into the empty space on the right, so a trader can count
// ahead (a backtest's 4H dealing range marked forward) and the crosshair shows a time there too.
// Only while that market trades: crypto always; forex and metals not at the weekend; our gold
// (Vantage) on its own sessions, its daily break too; US stocks 9:30–16:00 New York on weekdays.
import { assetClassOf } from "../trading/instruments";
import { isVantageSymbol, vantageBarTime, vantageMarketOpen } from "./vantageFeed";

const nyHourFmt = typeof Intl !== "undefined"
  ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit" })
  : null;

// Is the market trading at this moment (unix s)?
function trading(symbol: string, cls: string, t: number): boolean {
  if (isVantageSymbol(symbol)) return vantageMarketOpen(t * 1000);
  if (cls === "crypto") return true;
  if (cls === "stocks") {
    if (!nyHourFmt) return true;
    const p: Record<string, string> = {};
    for (const x of nyHourFmt.formatToParts(new Date(t * 1000))) p[x.type] = x.value;
    if (p.weekday === "Sat" || p.weekday === "Sun") return false;
    const m = Number(p.hour) * 60 + Number(p.minute);
    return m >= 9 * 60 + 30 && m < 16 * 60;
  }
  // forex, metals: Sunday 22:00 to Friday 22:00 UTC
  const d = new Date(t * 1000), day = d.getUTCDay(), h = d.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && h >= 22) return false;
  if (day === 0 && h < 22) return false;
  return true;
}

// `count` bar times after `last` (unix s) on this symbol's `interval` (`barSec` long)
export function futureTimes(symbol: string, interval: string, last: number, barSec: number, count: number): number[] {
  if (!symbol || !(barSec > 0) || !Number.isFinite(last)) return [];
  const cls = assetClassOf(symbol);
  const out: number[] = [];
  const vantage = isVantageSymbol(symbol);
  // Days and longer: the next calendar steps (labels at 00:00 UTC), weekends left out for all but crypto
  if (barSec >= 86400) {
    const month = /month$/.test(interval);
    const n = parseInt(interval, 10) || 1;
    let t = last;
    for (let guard = 0; out.length < count && guard < count * 4; guard++) {
      if (month) { const d = new Date(t * 1000); t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) / 1000; }
      else t += barSec;
      if (barSec === 86400 * n && n === 1 && cls !== "crypto") {
        const day = new Date(t * 1000).getUTCDay();
        if (day === 0 || day === 6) continue;
      }
      out.push(t);
    }
    return out;
  }
  // Intraday: step a bar at a time; a bar comes if the market trades at any point in it (checked at its
  // start, middle and last minute); our gold's bar times follow its own buckets (45m restarts every 4h)
  const step = Math.max(60, Math.min(barSec, 3600));
  let t = last + barSec;
  let lastLabel = last;
  for (let guard = 0; out.length < count && guard < count * 200; guard++) {
    const label = vantage ? (vantageBarTime(interval, t * 1000) ?? t) : t;
    if (label > lastLabel && (trading(symbol, cls, t) || trading(symbol, cls, t + barSec / 2) || trading(symbol, cls, t + barSec - 60))) {
      out.push(label);
      lastLabel = label;
      t = label + barSec;
      continue;
    }
    // (closed: on to the next step; a long closure, a weekend, is skipped an hour at a time)
    t += label > lastLabel ? barSec : step;
  }
  return out;
}
