// "What was gold at 10:30 on 5 March?", "how did EUR/USD move last week?", "what did Apple do in
// October, and was there real buying behind it?": the symbol's own candles for that time or period
// (from the site's feeds, at a timeframe that suits its length), and what they show — the price then,
// or the move, its high and low, the path it took, how volatile it was and how much participation
// (volume) was behind it, against the same length of time just before. Times are the trader's own
// (the browser's time zone).

import { fetchVantageCandles, isVantageSymbol, vantageInterval } from "../vantageFeed";
import { feedTimeToUnix } from "../../utils/feedTime";
import { barVolume } from "../../utils/volume";
import { priceStory, type Bar } from "../analysis/priceStory";
import { getChartInfo } from "../chartBars";

export type SpanUnit = "minute" | "hour" | "day" | "week" | "month" | "year";
export type HistoryAsk = { symbol?: string; at?: string; from?: string; to?: string; span?: { value: number; unit: SpanUnit } };

const UNIT: Record<SpanUnit, number> = { minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
const FRAMES: [string, number][] = [["1min", 60], ["5min", 300], ["15min", 900], ["1h", 3600], ["4h", 14400], ["1day", 86400], ["1week", 604800]];

// "2024-03-05" / "2024-03-05 10:30" in the trader's time zone → unix seconds (a date alone: its start)
function parseLocal(s: string | undefined, endOfDay = false): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec((s ?? "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = h !== undefined ? new Date(+y, +mo - 1, +d, +h, +mi) : endOfDay ? new Date(+y, +mo - 1, +d, 23, 59, 59) : new Date(+y, +mo - 1, +d);
  return Math.floor(date.getTime() / 1000);
}
const utc = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 19).replace("T", " ");

// The symbol's candles between two times (its own server's for our feed's symbols, else the market feed's)
async function candles(symbol: string, interval: string, start: number, end: number): Promise<Bar[]> {
  let bars: Bar[] = [];
  if (isVantageSymbol(symbol) && vantageInterval(interval)) bars = (await fetchVantageCandles(symbol, interval, utc(end), utc(start))) ?? [];
  else {
    try {
      const res = await fetch(`/api/stock-data?symbol=${encodeURIComponent(symbol)}&interval=${interval}&start_date=${encodeURIComponent(utc(start))}&end_date=${encodeURIComponent(utc(end))}`);
      const data = await res.json();
      if (Array.isArray(data?.values)) bars = data.values.map((v: any) => ({ time: feedTimeToUnix(v.datetime), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: barVolume(v) })).reverse();
    } catch { /* none */ }
  }
  return bars.filter(b => b.time >= start - 1 && b.time <= end && Number.isFinite(b.close)).sort((a, b) => a.time - b.time);
}

// (prices in the market's own decimals: a change on a 4,000 market in 2, on a 1.08 one in 4)
const price = (p: number, ref = p) => { const d = Math.abs(ref) >= 100 ? 2 : Math.abs(ref) >= 1 ? 4 : 5; return p.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
// (this year's dates without the year)
const when = (sec: number, withTime: boolean) => {
  const d = new Date(sec * 1000), thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("en-GB", withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", ...(thisYear ? {} : { year: "numeric" }) });
};
// the market as it's said: gold, not XAUUSD
const SPOKEN: [RegExp, string][] = [[/^XAU/i, "gold"], [/^XAG/i, "silver"], [/^BTC/i, "bitcoin"], [/^ETH/i, "ether"], [/^(WTI|USOIL|CL)/i, "oil"]];
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}%`;

export async function priceHistory(ask: HistoryAsk, nameOf: (s: string) => string = s => s): Promise<string> {
  const symbol = ask.symbol || getChartInfo()?.symbol;
  if (!symbol) return "Which symbol?";
  const plain = symbol.replace(/[^A-Za-z]/g, "");
  const name = SPOKEN.find(([re]) => re.test(plain))?.[1] ?? nameOf(symbol);
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  const now = Math.floor(Date.now() / 1000);

  // ---- the price at a moment: the candle it fell in, the finest one the feed still has
  if (ask.at) {
    const t = parseLocal(ask.at);
    if (t === null) return "I couldn't read that time. Say a date and time, like 5 March at 10:30.";
    if (t > now) return "That time hasn't come yet.";
    for (const [iv, sec] of FRAMES.slice(0, 6)) {
      const bars = await candles(symbol, iv, t - sec * 30, t + sec * 2);
      if (!bars.length) continue;
      const bar = bars.find(b => b.time <= t && t < b.time + sec);
      const prev = [...bars].reverse().find(b => b.time + sec <= t);
      if (!bar && !prev) continue;
      const withTime = sec < 86400;
      // (the day around it: its range)
      const dayStart = parseLocal(new Date(t * 1000).toLocaleDateString("en-CA"))!;
      const day = await candles(symbol, "1h", dayStart, Math.min(now, dayStart + 86400));
      const dayText = day.length >= 2 ? ` That day it traded from ${price(Math.min(...day.map(b => b.low)))} to ${price(Math.max(...day.map(b => b.high)))}.` : "";
      if (!bar && prev) return `The market was closed at ${when(t, true)}. ${Name}'s last price before it was ${price(prev.close)}, at ${when(prev.time + sec, withTime)}.${dayText}`;
      const b = bar!;
      const label = iv === "1min" ? "one-minute" : iv === "5min" ? "five-minute" : iv === "15min" ? "fifteen-minute" : iv === "1h" ? "hourly" : iv === "4h" ? "four-hour" : "daily";
      return `${Name} at ${when(t, withTime)}: about ${price(b.close)}. The ${label} candle then opened at ${price(b.open)}, went from ${price(b.low)} to ${price(b.high)} and closed at ${price(b.close)} (${pct(((b.close - b.open) / b.open) * 100)}).${dayText}`;
    }
    return `I have no candles for ${name} around ${when(t, true)}: that's further back than the feed goes, or the market was closed.`;
  }

  // ---- a period: from / to, or the last N minutes … years
  let start: number | null = null, end: number | null = null;
  if (ask.span && ask.span.value > 0) { end = now; start = now - ask.span.value * UNIT[ask.span.unit]; }
  if (ask.from) start = parseLocal(ask.from);
  if (ask.to) end = parseLocal(ask.to, true);
  if (start !== null && end === null) end = now;
  if (start === null || end === null) return "Over what time? For example: last week, today, or from 1 to 10 March.";
  end = Math.min(end, now);
  if (end <= start) return "That period's end comes before its start.";
  const L = end - start;
  const [iv, sec] = FRAMES.find(([, s]) => L / s <= 400) ?? FRAMES[FRAMES.length - 1];
  // (the same length of time before it: the usual)
  const all = await candles(symbol, iv, start - L, end);
  const bars = all.filter(b => b.time >= start!), before = all.filter(b => b.time < start!);
  const story = priceStory(bars, before);
  if (!story) return `I have no candles for ${name} in that period: it's further back than the feed goes, or the market was closed.`;
  const withTime = L <= 10 * 86400;
  const period = ask.span && !ask.from ? (ask.span.value === 1 ? `over the last ${ask.span.unit}` : `over the last ${ask.span.value} ${ask.span.unit}s`) : `from ${when(start, withTime)} to ${when(end, withTime)}`;

  const out: string[] = [];
  const verb = story.trend === "sideways" ? "moved sideways" : story.pct > 0 ? "rose" : "fell";
  out.push(`${Name} ${period} ${verb}: from ${price(story.open)} to ${price(story.close)}, ${story.change >= 0 ? "up" : "down"} ${price(Math.abs(story.change), story.open)} (${pct(story.pct)}).`);
  out.push(`Its high was ${price(story.high)} on ${when(story.highAt, withTime)}, its low ${price(story.low)} on ${when(story.lowAt, withTime)}, a ${story.rangePct.toFixed(2)}% range.`);
  const legs = story.legs.slice(-4).map(l => `${l.pct >= 0 ? "up" : "down"} ${Math.abs(l.pct).toFixed(2)}% to ${when(l.to, withTime)}`);
  out.push(`The path: ${story.shape}${story.legs.length >= 2 ? `: ${legs.join(", then ")}` : ""}.`);
  if (story.bigUp || story.bigDown) {
    const big = [story.bigUp && `${pct(story.bigUp.pct)} on ${when(story.bigUp.time, withTime)}`, story.bigDown && `${pct(story.bigDown.pct)} on ${when(story.bigDown.time, withTime)}`].filter(Boolean).join(" and ");
    out.push(`The biggest single ${iv === "1day" ? "days" : iv === "1week" ? "weeks" : "candles"}: ${big}.`);
  }
  if (story.volatility !== null) {
    const v = story.volatility;
    out.push(v >= 1.3 ? `It was more volatile than usual: candles ${v.toFixed(1)}× their size the period before.` : v <= 0.75 ? `It was quieter than usual: candles ${v.toFixed(1)}× their size the period before.` : "Volatility was about usual.");
  }
  // the crowd behind it
  const vol = story.volume;
  const what = isVantageSymbol(symbol) ? "activity (the feed's tick volume)" : "volume";
  if (vol) {
    const parts: string[] = [];
    if (vol.vsUsual !== null) parts.push(`${what} was ${vol.vsUsual.toFixed(1)}× the usual${vol.trend !== "flat" ? `, ${vol.trend === "rising" ? "growing" : "fading"} as it went` : ""}`);
    const up = Math.round(vol.upShare * 100);
    parts.push(`${up}% of it came on rising candles, ${100 - up}% on falling ones${up >= 58 ? ": buyers were in control" : up <= 42 ? ": sellers were in control" : ": evenly matched"}`);
    if (vol.spikes.length) parts.push(`the heaviest burst was ${vol.spikes[0].times.toFixed(1)}× the average, on ${when(vol.spikes[0].time, withTime)}, a ${pct(vol.spikes[0].pct)} candle`);
    out.push(`Participation: ${parts.join("; ")}.`);
  } else out.push(`This feed gives no volume for ${name}, so how many were behind the move can't be measured.`);
  return out.join(" ");
}
