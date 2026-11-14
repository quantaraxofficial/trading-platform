// "Analyse the last hour and predict the next hour", "bias for the next 4 hours": the chart's market
// read over the last window (lib/analysis/bias: the move, the close, a sweep or break of the previous
// window, the structure on both timeframes, premium / discount), the lean for the window ahead with
// how often reads like it were right on this market lately, and its levels. Drawn on the chart (the
// window read, the window ahead, the target and where it's wrong) and said.
// The candles come at the timeframe that suits the window (5 minutes for an hour…), whatever the
// chart shows, cut at the chart's present (the replay bar during a replay).

import { getChartBars, getChartInfo } from "../chartBars";
import { fetchPineTimeframeData } from "../pineDataFetch";
import { biasRead, fmtPrice, possessive, type BiasResult } from "../analysis/bias";
import type { Zone } from "../analysis/smc";
import { drawZones, GROUP_PREFIX } from "./marks";
import type { BiasSpan } from "./commands";

const UNIT_SEC: Record<BiasSpan["unit"], number> = { minute: 60, hour: 3600, day: 86400, week: 604800 };
export const spanSec = (s: BiasSpan) => s.value * UNIT_SEC[s.unit];
// "hour", "4 hours", "15 minutes"
export const spanName = (s: BiasSpan) => (s.value === 1 ? s.unit : `${s.value} ${s.unit}s`);
export const BIAS_GROUP = `${GROUP_PREFIX}bias`;

export function intervalSec(iv: string): number | null {
  const m = /^(\d+)(s|min|h|day|week|month)$/.exec(iv || "");
  if (!m) return null;
  return parseInt(m[1], 10) * { s: 1, min: 60, h: 3600, day: 86400, week: 604800, month: 2592000 }[m[2] as "s"];
}

// The candles a window is read from (about 12–48 in it) and the timeframe above it
function frames(windowSec: number) {
  if (windowSec <= 1800) return { ltf: "1", ltfSec: 60, ltfName: "1-minute", htf: "15", htfSec: 900, htfName: "15-minute" };
  if (windowSec <= 7200) return { ltf: "5", ltfSec: 300, ltfName: "5-minute", htf: "60", htfSec: 3600, htfName: "1-hour" };
  if (windowSec <= 28800) return { ltf: "15", ltfSec: 900, ltfName: "15-minute", htf: "240", htfSec: 14400, htfName: "4-hour" };
  if (windowSec <= 172800) return { ltf: "60", ltfSec: 3600, ltfName: "1-hour", htf: "D", htfSec: 86400, htfName: "daily" };
  return { ltf: "240", ltfSec: 14400, ltfName: "4-hour", htf: "D", htfSec: 86400, htfName: "daily" };
}

const GREEN = "#089981", RED = "#f23645", GREY = "#787b86";

export async function biasOnChart(window: BiasSpan, horizon: BiasSpan, nameOf: (s: string) => string = s => s): Promise<{ ok: boolean; text: string; result?: BiasResult }> {
  const bars = getChartBars();
  const info = getChartInfo();
  if (!info || bars.length < 2) return { ok: false, text: "The chart has no bars to look at yet." };
  const wSec = spanSec(window), hSec = spanSec(horizon);
  const f = frames(wSec);
  const chartSec = intervalSec(info.interval) ?? bars[bars.length - 1].time - bars[bars.length - 2].time;
  const now = bars[bars.length - 1].time + chartSec;
  const [l, h] = await Promise.all([fetchPineTimeframeData(f.ltf, info.symbol), fetchPineTimeframeData(f.htf, info.symbol)]);
  const ltf = l.filter(b => b.time < now), htf = h.filter(b => b.time < now);
  const sym = nameOf(info.symbol);
  if (!ltf.length || !htf.length) {
    return { ok: false, text: l.length ? `I can only read the bias on recent candles, not this far back in the replay.` : `I couldn't load the ${f.ltfName} candles for ${sym}.` };
  }
  const wn = spanName(window), hn = spanName(horizon);
  const r = biasRead(ltf, htf, f.ltfSec, f.htfSec, wSec / f.ltfSec, hSec / f.ltfSec, { window: wn, ltf: f.ltfName, htf: f.htfName });
  if (!r) return { ok: false, text: `There aren't enough ${f.ltfName} candles on ${sym} to read the last ${wn} against its history.` };

  draw(r, bars, ltf[r.window.start].time, chartSec, hSec, wn, hn);
  return { ok: true, text: speech(r, sym, wn, hn, now), result: r };
}

function draw(r: BiasResult, bars: { time: number }[], startTime: number, chartSec: number, hSec: number, wn: string, hn: string) {
  const last = bars.length - 1;
  let i0 = last;
  while (i0 > 0 && bars[i0].time > startTime) i0--;
  if (bars[i0].time < startTime && i0 < last) i0++;
  const ahead = Math.max(1, Math.round(hSec / chartSec));
  const w = r.window, c = w.close, d = (p: number) => fmtPrice(p, c);
  const color = r.side === "bull" ? GREEN : r.side === "bear" ? RED : GREY;
  const rate = r.tested.calls ? `${Math.round((100 * r.tested.right) / r.tested.calls)}% right in testing` : "untested";
  const lean = r.side === "neutral" ? "no lean" : `${r.side === "bull" ? "bullish" : "bearish"} ${r.edge ? r.strength : "lean, no proven edge"}`;
  const move = c - w.open;
  const zones: Zone[] = [
    { kind: "bias_window", side: "bull", color: GREY, from: i0, to: last, top: w.high, bottom: w.low, extend: false,
      label: `Last ${wn}: ${move >= 0 ? "+" : "−"}${d(Math.abs(move))}` },
    { kind: "bias", side: r.side === "bear" ? "bear" : "bull", color, from: last, to: last + ahead, top: c + r.typicalMove, bottom: c - r.typicalMove, extend: false,
      label: `Next ${hn}: ${lean} · ${rate}` },
  ];
  if (r.target) zones.push({ kind: "bias", side: "bull", color, shape: "line", dashed: true, from: last, to: last + ahead, top: r.target.price, bottom: r.target.price,
    label: `Target ${d(r.target.price)} · ${r.target.why}` });
  if (r.invalidation) zones.push({ kind: "bias", side: "bull", color: GREY, shape: "line", dashed: true, from: last, to: last + ahead, top: r.invalidation.price, bottom: r.invalidation.price,
    label: `Wrong past ${d(r.invalidation.price)}` });
  drawZones(BIAS_GROUP, "Bias · voice assistant", zones, bars);
}

// What's said: the read, the lean and its record (plainly: a coin flip is called one), what weighed
// most, the levels
function speech(r: BiasResult, sym: string, wn: string, hn: string, now: number): string {
  const by = Object.fromEntries(r.factors.map(f => [f.id, f]));
  const c = r.window.close, d = (p: number) => fmtPrice(p, c);
  const read = [by.momentum.text, by.close.text];
  if (by.sweep.value) read.push(by.sweep.text);
  else if (by.breakout.value) read.push(by.breakout.text);
  read.push(by.htf_trend.text);
  const out: string[] = [`${sym}: ${read.join(", ")}.`];

  const days = Math.max(1, Math.round((now - r.tested.fromTime) / 86400));
  const pct = r.tested.calls ? Math.round((100 * r.tested.right) / r.tested.calls) : 0;
  const record = `reads like this were right ${pct}% of the time on ${sym} over the last ${days} days (${r.tested.calls} calls)`;
  const dir = r.side === "bull" ? "bullish" : "bearish";
  if (r.side === "neutral") out.push(`For the next ${hn} there's no lean either way: the signals cancel out.`);
  else if (!r.tested.calls) out.push(`For the next ${hn} it leans ${dir}, but there isn't enough history here to test reads like this.`);
  else if (r.edge) out.push(`For the next ${hn} I lean ${dir}, ${r.strength}: ${record}.`);
  else out.push(`For the next ${hn} it leans ${dir}, but honestly there's no proven edge: ${record}, about a coin flip. Don't trade on it alone.`);

  // what weighed most, and how it has done
  const top = r.factors.find(f => f.value && Math.abs(f.weight) > 0.005 && f.n >= 20);
  if (top && r.side !== "neutral") {
    const pctTop = Math.round(top.hit * 100);
    out.push(pctTop >= 50 ? `What weighed most: ${top.text}; after that the next ${hn} followed it ${pctTop}% of the time.`
      : `What weighed most: ${top.text}; here that has tended to fade: the next ${hn} went the other way ${100 - pctTop}% of the time.`);
  }
  if (r.target && r.invalidation) out.push(`Target ${d(r.target.price)}, ${r.target.why}; wrong past ${d(r.invalidation.price)}, ${r.invalidation.why}.`);
  else out.push(`Levels: ${d(r.window.prevHigh)} above, the previous ${possessive(wn)} high, and ${d(r.window.prevLow)} below, its low.`);
  out.push(`A usual next ${hn} moves about ${d(r.typicalMove)}.`);
  return out.join(" ");
}
