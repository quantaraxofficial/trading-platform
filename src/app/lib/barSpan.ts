// When a chart bar really starts and ends (unix s), for a replay moving between timeframes: what it
// may show must have ended by the moment it reached, whatever the timeframes.
//  - Vantage symbols' (XAUUSD) day / week / month bars start the evening before their label (the
//    server's midnight, 17:00 New York)
//  - a bar ends after its length, or sooner: 45-minute bars restart at each 4-hour boundary (every
//    fourth hour's last one is 15 minutes), and no bar runs past the next one's start
import { isVantageSymbol, vantageBarEnd, vantageBarStart } from "./vantageFeed";

export function barStart(symbol: string, interval: string, time: number): number {
  return (isVantageSymbol(symbol) ? vantageBarStart(interval, time) : null) ?? time;
}

export function barEnd(data: { time: number }[], i: number, symbol: string, interval: string, sec: number): number {
  const start = barStart(symbol, interval, data[i].time);
  const own = (isVantageSymbol(symbol) ? vantageBarEnd(interval, data[i].time) : null) ?? start + sec;
  const next = data[i + 1];
  return next ? Math.min(own, barStart(symbol, interval, next.time)) : own;
}

// The replay's moment after bar i: up to the next bar's start, since nothing traded in between (the
// daily break, a weekend) — so a day that closed at 20:57 counts as over at its 21:00 end
export function momentAfter(data: { time: number }[], i: number, symbol: string, interval: string, sec: number): number {
  const next = data[i + 1];
  return next ? barStart(symbol, interval, next.time) : barEnd(data, i, symbol, interval, sec);
}
