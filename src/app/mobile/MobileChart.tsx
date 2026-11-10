"use client";

// The mobile terminal's chart: candles of one symbol and timeframe from the site's MT5 history,
// moving with the live ticks; a moving average; the ask line; the account's positions, pending
// orders and their SL / TP as lines labelled on the left ("SELL 0.01, +0.03 USD"), as MT5's mobile
// chart draws them. Tapping a position's line selects it (the caller shows Close / SL / TP).

import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries, LineStyle, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { fetchVantageCandles, vantageBarTime } from "../lib/vantageFeed";
import { digitsOf, feedSymbol, fmtMoney, liveProfit, type Order, type Position, type Quote } from "./data";

export const TIMEFRAMES: { label: string; interval: string }[] = [
  { label: "M1", interval: "1min" }, { label: "M5", interval: "5min" }, { label: "M15", interval: "15min" }, { label: "M30", interval: "30min" },
  { label: "H1", interval: "1h" }, { label: "H4", interval: "4h" }, { label: "D1", interval: "1day" }, { label: "W1", interval: "1week" }, { label: "MN", interval: "1month" },
];

export type ChartPrefs = { grid: boolean; askLine: boolean; positions: boolean; slTp: boolean; ma: boolean; maPeriod: number };
export const DEFAULT_PREFS: ChartPrefs = { grid: true, askLine: true, positions: true, slTp: true, ma: true, maPeriod: 10 };

type Bar = { time: number; open: number; high: number; low: number; close: number };
type Line = { key: string; price: number; text: string; color: string; dashed?: boolean; posId?: number };

const UP = "#26a69a", DOWN = "#ef5350", BUY = "#2f8cff", SELL = "#ef5350";

function sma(bars: Bar[], n: number) {
  const out: { time: number; value: number }[] = [];
  let sum = 0;
  bars.forEach((b, i) => { sum += b.close; if (i >= n) sum -= bars[i - n].close; if (i >= n - 1) out.push({ time: b.time, value: sum / n }); });
  return out;
}

export default function MobileChart({ symbol, interval, prefs, positions, orders, quote, onSelectPosition }: {
  symbol: string; interval: string; prefs: ChartPrefs; positions: Position[]; orders: Order[]; quote?: Quote;
  onSelectPosition: (id: number | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const maRef = useRef<ISeriesApi<"Line"> | null>(null);
  const barsRef = useRef<Bar[]>([]);
  const [lines, setLines] = useState<(Line & { y: number })[]>([]);
  const d = digitsOf(symbol);

  // the chart itself
  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#000000" }, textColor: "#d1d4dc", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "#2a2a2a", style: LineStyle.Dotted }, horzLines: { color: "#2a2a2a", style: LineStyle.Dotted } },
      rightPriceScale: { borderColor: "#3a3a3a" },
      timeScale: { borderColor: "#3a3a3a", timeVisible: true, rightOffset: 4 },
      crosshair: { vertLine: { color: "#5a5a5a" }, horzLine: { color: "#5a5a5a" } },
    });
    const c = chart.addSeries(CandlestickSeries, { upColor: "#000000", downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
      priceFormat: { type: "price", precision: d, minMove: Math.pow(10, -d) }, priceLineColor: "#26a69a" });
    const ma = chart.addSeries(LineSeries, { color: "#ff1744", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    chartRef.current = chart; candles.current = c; maRef.current = ma;
    chart.subscribeClick(p => {
      if (!p.point) return;
      const hit = linesNow.current.find(l => l.posId !== undefined && Math.abs(l.y - p.point!.y) < 14);
      onSelectRef.current(hit?.posId ?? null);
    });
    return () => { chart.remove(); chartRef.current = null; candles.current = null; maRef.current = null; };
  }, [symbol, d]);
  const onSelectRef = useRef(onSelectPosition);
  onSelectRef.current = onSelectPosition;

  // its bars
  useEffect(() => {
    let alive = true;
    barsRef.current = [];
    candles.current?.setData([]);
    fetchVantageCandles(feedSymbol(symbol), interval).then(bars => {
      if (!alive || !bars || !candles.current) return;
      barsRef.current = bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
      candles.current.setData(barsRef.current as any);
      maRef.current?.setData(prefsRef.current.ma ? sma(barsRef.current, prefsRef.current.maPeriod) as any : []);
      chartRef.current?.timeScale().scrollToRealTime();
    });
    return () => { alive = false; };
  }, [symbol, interval]);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => {
    chartRef.current?.applyOptions({ grid: { vertLines: { visible: prefs.grid }, horzLines: { visible: prefs.grid } } });
    maRef.current?.setData(prefs.ma ? sma(barsRef.current, prefs.maPeriod) as any : []);
  }, [prefs]);

  // the live tick moves the last bar (or starts a new one)
  useEffect(() => {
    if (!quote || !candles.current) return;
    const bars = barsRef.current;
    const t = vantageBarTime(interval, quote.time);
    if (t === null || !bars.length) return;
    const last = bars[bars.length - 1];
    if (t > last.time) bars.push({ time: t, open: quote.bid, high: quote.bid, low: quote.bid, close: quote.bid });
    else if (t === last.time) { last.high = Math.max(last.high, quote.bid); last.low = Math.min(last.low, quote.bid); last.close = quote.bid; }
    else return;
    try { candles.current.update({ ...bars[bars.length - 1] } as any); } catch { /* replaced */ }
    if (prefs.ma && bars.length >= prefs.maPeriod) {
      const n = prefs.maPeriod, tail = bars.slice(-n);
      try { maRef.current?.update({ time: bars[bars.length - 1].time, value: tail.reduce((a, b) => a + b.close, 0) / n } as any); } catch { /* replaced */ }
    }
  }, [quote, interval, prefs.ma, prefs.maPeriod]);

  // the lines: the ask, positions, pending orders, SL / TP (labelled on the left, as MT5 does)
  const wanted: Line[] = [];
  if (prefs.askLine && quote) wanted.push({ key: "ask", price: quote.ask, text: "", color: SELL });
  if (prefs.positions) positions.forEach(p => {
    const pr = liveProfit(p, quote);
    wanted.push({ key: `p${p.id}`, price: p.open_price, posId: p.id, dashed: true, color: p.side === "buy" ? BUY : SELL,
      text: `${p.side.toUpperCase()} ${p.volume.toFixed(2)}, ${pr >= 0 ? "+" : ""}${fmtMoney(pr)} USD` });
    if (prefs.slTp && p.sl) wanted.push({ key: `sl${p.id}`, price: p.sl, posId: p.id, color: "#ff9800", text: "SL" });
    if (prefs.slTp && p.tp) wanted.push({ key: `tp${p.id}`, price: p.tp, posId: p.id, color: "#4caf50", text: "TP" });
  });
  if (prefs.positions) orders.forEach(o => wanted.push({ key: `o${o.id}`, price: o.price, dashed: true, color: o.kind.startsWith("buy") ? BUY : SELL,
    text: `${o.kind.replace("_", " ").toUpperCase()} ${o.volume.toFixed(2)}` }));
  const wantedKey = wanted.map(l => `${l.key}:${l.price}:${l.text}:${l.color}`).join("|");
  const linesNow = useRef<(Line & { y: number })[]>([]);
  // drawn as price lines (the axis label), the left labels placed over the chart on every change
  const priceLines = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    const s = candles.current;
    if (!s) return;
    const keep = new Set(wanted.map(l => l.key));
    priceLines.current.forEach((pl, k) => { if (!keep.has(k)) { try { s.removePriceLine(pl); } catch { /* gone */ } priceLines.current.delete(k); } });
    wanted.forEach(l => {
      const opts = { price: l.price, color: l.color, lineWidth: 1 as const, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: "" };
      const pl = priceLines.current.get(l.key);
      if (pl) pl.applyOptions(opts); else priceLines.current.set(l.key, s.createPriceLine(opts));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, symbol]);
  useEffect(() => {
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const s = candles.current;
        if (!s) return;
        const next = wanted.filter(l => l.text).map(l => ({ ...l, y: s.priceToCoordinate(l.price) ?? -999 }));
        linesNow.current = next;
        setLines(next);
      });
    };
    place();
    const chart = chartRef.current;
    chart?.timeScale().subscribeVisibleLogicalRangeChange(place);
    const id = setInterval(place, 500);
    return () => { cancelAnimationFrame(frame); clearInterval(id); try { chart?.timeScale().unsubscribeVisibleLogicalRangeChange(place); } catch { /* gone */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, symbol]);

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      {lines.map(l => l.y > 0 && (
        <div key={l.key} style={{ position: "absolute", left: 4, top: l.y - 15, color: l.color, fontSize: 12, pointerEvents: "none", whiteSpace: "nowrap", fontFamily: "Roboto, -apple-system, sans-serif" }}>{l.text}</div>
      ))}
    </div>
  );
}
