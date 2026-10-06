"use client";
// The chart's type (TradingView's chart style menu): what the symbol's bars are drawn as, and the
// types starred as favorites (shown as their own buttons in the top bar). Values are
// TradingView's own menu values.
import { makeStore } from "../trading/settings";
import { layoutStore, layouts } from "./layoutStore";

export type ChartType =
  | "bar" | "candle" | "hollowCandle" | "volCandles"
  | "line" | "lineWithMarkers" | "stepline"
  | "area" | "hlcArea" | "baseline"
  | "column" | "hilo"
  | "volFootprint" | "tpo" | "svp"
  | "ha" | "renko" | "pb" | "kagi" | "pnf" | "range";

export interface ChartTypeInfo { id: ChartType; name: string; about: string }

// In the menu's order, a group per divider
export const CHART_TYPE_GROUPS: ChartTypeInfo[][] = [
  [
    { id: "bar", name: "Bars", about: "Each bar shows a period's open (the tick on the left), high, low and close (the tick on the right)." },
    { id: "candle", name: "Candles", about: "Each candle shows a period's open, high, low and close: the body spans open to close, the wicks reach the high and low." },
    { id: "hollowCandle", name: "Hollow candles", about: "Candles whose body is hollow when the close is above the open and filled when it's below; the colour compares the close with the previous close." },
    { id: "volCandles", name: "Volume candles", about: "Candles whose width follows the period's volume: the busier the period, the wider the candle." },
  ],
  [
    { id: "line", name: "Line", about: "A line through each period's close." },
    { id: "lineWithMarkers", name: "Line with markers", about: "A line through each period's close, with a dot on every close." },
    { id: "stepline", name: "Step line", about: "Each close drawn as a level that holds until the next one, joined by vertical steps." },
  ],
  [
    { id: "area", name: "Area", about: "A line through the closes with the area under it filled." },
    { id: "hlcArea", name: "HLC area", about: "Lines through the highs, lows and closes, with the ranges above and below the close filled." },
    { id: "baseline", name: "Baseline", about: "Closes drawn against a base level (the middle of the visible prices): above it in green, below it in red." },
  ],
  [
    { id: "column", name: "Columns", about: "A column up to each period's close, coloured by whether it closed above or below the previous close." },
    { id: "hilo", name: "High-low", about: "A bar from each period's low to its high." },
  ],
  [
    { id: "volFootprint", name: "Volume footprint", about: "How each candle's volume was distributed across its prices, split into buying and selling." },
    { id: "tpo", name: "Time price opportunity", about: "Market profile: how long the price spent at each level during a session." },
    { id: "svp", name: "Session volume profile", about: "The volume traded at each price level within each session." },
  ],
  [
    { id: "ha", name: "Heikin Ashi", about: "Candles from averaged prices (close = average of the period's OHLC, open = midpoint of the previous candle), which smooth out noise." },
    { id: "renko", name: "Renko", about: "Bricks of a fixed size, a new one each time the price moves a full brick beyond the last; time plays no part." },
    { id: "pb", name: "Line break", about: "A new line when the close goes beyond the last line, reversing only after it breaks the last three lines." },
    { id: "kagi", name: "Kagi", about: "A line that keeps going while the price goes its way and turns when it reverses by the reversal amount; thick above the last high, thin below the last low." },
    { id: "pnf", name: "Point & figure", about: "Columns of X (rising) and O (falling) boxes, a new column after a reversal of a set number of boxes." },
    { id: "range", name: "Range", about: "Bars that each span the same price range, a new one once the price has moved that far." },
  ],
];
export const CHART_TYPES: ChartTypeInfo[] = CHART_TYPE_GROUPS.flat();
export const chartTypeInfo = (id: ChartType) => CHART_TYPES.find(t => t.id === id) || CHART_TYPES[1];

// Types drawn here (the rest are listed, as on TradingView, but need data this chart doesn't have)
export const DRAWN_TYPES = new Set<ChartType>(["bar", "candle", "hollowCandle", "volCandles", "line", "lineWithMarkers", "stepline", "area", "hlcArea", "baseline", "column", "hilo", "ha", "renko", "pb", "kagi", "pnf", "range"]);

// The favorites (and the type when there's no layout yet); each chart of a layout keeps its own
// type in its layout cell, as on TradingView, where changing the type changes the active chart only
export const chartTypeStore = makeStore<{ type: ChartType; favorites: ChartType[] }>("tv:chartType", { type: "candle", favorites: [] });
export function setChartType(type: ChartType) {
  chartTypeStore.set({ type });
  if (layoutStore.get().working) layouts.update(l => ({ cells: l.cells.map((c, i) => (i === l.active ? { ...c, chartType: type } : c)) }));
}
// The active chart's type
export function useChartType(): ChartType {
  const stored = chartTypeStore.useValue().type;
  const w = layoutStore.useValue().working;
  return w ? (w.cells[w.active]?.chartType ?? "candle") : stored;
}
export const toggleFavoriteChartType = (type: ChartType) => chartTypeStore.set(s => ({ favorites: s.favorites.includes(type) ? s.favorites.filter(t => t !== type) : [...s.favorites, type] }));

// Types built from their own bars (bricks, lines, boxes) rather than the chart's time bars
export const BRICK_TYPES = new Set<ChartType>(["renko", "pb", "kagi", "pnf", "range"]);
