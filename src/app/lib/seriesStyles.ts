"use client";
// The style of each chart type (Settings → Symbol, which shows the current type's section), with
// TradingView's defaults. Kept in chartSettings.series, so Cancel, templates and the live
// preview work as for the rest of the dialog. Candles keep their own fields (chartSettings.candle).
import type { ChartType } from "./chartType";
import type { ColorLine } from "./chartSettings";

export type PriceSource = "Open" | "High" | "Low" | "Close" | "(H + L)/2" | "(H + L + C)/3" | "(O + H + L + C)/4";
export const PRICE_SOURCES: PriceSource[] = ["Open", "High", "Low", "Close", "(H + L)/2", "(H + L + C)/3", "(O + H + L + C)/4"];
export type BoxMethod = "ATR" | "Traditional" | "Percentage LTP";
export const BOX_METHODS: BoxMethod[] = ["ATR", "Traditional", "Percentage LTP"];
export type OnColor = { on: boolean; color: string };
export type OnUpDown = { on: boolean; up: string; down: string };
export type BodyBorder = { body: string; border: string };

export interface SeriesStyles {
  bar: { prevClose: boolean; hlc: boolean; up: string; down: string; thin: boolean };
  hollowCandle: { body: OnUpDown; border: OnUpDown; wick: OnUpDown };
  volCandles: { prevClose: boolean; body: OnUpDown; border: OnUpDown; wick: OnUpDown };
  line: LineStyleSet; lineWithMarkers: LineStyleSet; stepline: LineStyleSet;
  area: { source: PriceSource; line: ColorLine; fillTop: string; fillBottom: string };
  hlcArea: { high: OnColor & { width: number; style: ColorLine["style"] }; low: OnColor & { width: number; style: ColorLine["style"] }; close: ColorLine; fillHigh: string; fillLow: string };
  baseline: { source: PriceSource; top: ColorLine; bottom: ColorLine; fillTop1: string; fillTop2: string; fillBottom1: string; fillBottom2: string; level: number };
  column: { source: PriceSource; prevClose: boolean; up: string; down: string };
  hilo: { body: OnColor; border: OnColor; labels: OnColor };
  ha: { realPrices: boolean; prevClose: boolean; body: OnUpDown; border: OnUpDown; wick: OnUpDown };
  renko: { up: BodyBorder; down: BodyBorder; projUp: BodyBorder; projDown: BodyBorder; wick: OnUpDown; source: "Close" | "OHLC"; method: BoxMethod; atrLength: number; boxSize: number; percentage: number };
  pb: { up: BodyBorder; down: BodyBorder; projUp: BodyBorder; projDown: BodyBorder; lines: number };
  kagi: { up: string; down: string; projUp: string; projDown: string; method: BoxMethod; atrLength: number; reversal: number; percentage: number };
  pnf: { up: string; down: string; projUp: string; projDown: string; source: "HL" | "Close"; method: BoxMethod; atrLength: number; boxSize: number; percentage: number; reversal: number; oneStepBack: boolean };
  range: { style: "Bars" | "Candles"; up: string; down: string; projUp: string; projDown: string; thin: boolean; phantom: boolean };
}
export type LineStyleSet = { source: PriceSource; colorType: "Solid" | "Gradient"; color: string; gradStart: string; gradEnd: string; width: number; style: ColorLine["style"] };

const UP = "#089981", DOWN = "#F23645", BLUE = "#2962FF", PUP = "#a9dcc3", PDOWN = "#f5a6ae";
const lineSet = (): LineStyleSet => ({ source: "Close", colorType: "Solid", color: BLUE, gradStart: "#D500F9", gradEnd: "#00BCE5", width: 2, style: "Solid" });
const ud = (on = true): OnUpDown => ({ on, up: UP, down: DOWN });

export const DEFAULT_SERIES_STYLES: SeriesStyles = {
  bar: { prevClose: false, hlc: false, up: UP, down: DOWN, thin: true },
  hollowCandle: { body: ud(), border: ud(), wick: ud() },
  volCandles: { prevClose: false, body: ud(), border: ud(), wick: ud() },
  line: lineSet(), lineWithMarkers: lineSet(), stepline: lineSet(),
  area: { source: "Close", line: { color: BLUE, width: 2, style: "Solid" }, fillTop: "rgba(41, 98, 255, 0.28)", fillBottom: "rgba(41, 98, 255, 0.05)" },
  hlcArea: { high: { on: true, color: "#00bcd4", width: 2, style: "Solid" }, low: { on: true, color: "#e91e63", width: 2, style: "Solid" }, close: { color: BLUE, width: 2, style: "Solid" }, fillHigh: "rgba(0, 188, 212, 0.25)", fillLow: "rgba(233, 30, 99, 0.25)" },
  baseline: { source: "Close", top: { color: UP, width: 2, style: "Solid" }, bottom: { color: DOWN, width: 2, style: "Solid" }, fillTop1: "rgba(8, 153, 129, 0.28)", fillTop2: "rgba(8, 153, 129, 0.05)", fillBottom1: "rgba(242, 54, 69, 0.05)", fillBottom2: "rgba(242, 54, 69, 0.28)", level: 50 },
  column: { source: "Close", prevClose: true, up: "rgba(8, 153, 129, 0.5)", down: "rgba(242, 54, 69, 0.5)" },
  hilo: { body: { on: true, color: BLUE }, border: { on: true, color: BLUE }, labels: { on: true, color: BLUE } },
  ha: { realPrices: false, prevClose: false, body: ud(), border: ud(), wick: ud() },
  renko: { up: { body: UP, border: UP }, down: { body: DOWN, border: DOWN }, projUp: { body: PUP, border: PUP }, projDown: { body: PDOWN, border: PDOWN }, wick: ud(), source: "Close", method: "ATR", atrLength: 14, boxSize: 3, percentage: 1 },
  pb: { up: { body: UP, border: UP }, down: { body: DOWN, border: DOWN }, projUp: { body: PUP, border: PUP }, projDown: { body: PDOWN, border: PDOWN }, lines: 3 },
  kagi: { up: UP, down: DOWN, projUp: PUP, projDown: PDOWN, method: "ATR", atrLength: 14, reversal: 1, percentage: 1 },
  pnf: { up: UP, down: DOWN, projUp: PUP, projDown: PDOWN, source: "HL", method: "ATR", atrLength: 14, boxSize: 1, percentage: 1, reversal: 3, oneStepBack: false },
  range: { style: "Bars", up: UP, down: DOWN, projUp: PUP, projDown: PDOWN, thin: true, phantom: false },
};

// A type's style, with any fields a saved copy predates filled from the defaults
export function styleFor<K extends keyof SeriesStyles>(all: Partial<SeriesStyles> | undefined, type: K): SeriesStyles[K] {
  const d = DEFAULT_SERIES_STYLES[type] as any, v = (all?.[type] || {}) as any;
  const out: any = { ...d };
  for (const k of Object.keys(v)) out[k] = d[k] && typeof d[k] === "object" && !Array.isArray(d[k]) ? { ...d[k], ...v[k] } : v[k];
  return out;
}

export function sourcePrice(b: { open: number; high: number; low: number; close: number }, src: PriceSource): number {
  switch (src) {
    case "Open": return b.open;
    case "High": return b.high;
    case "Low": return b.low;
    case "(H + L)/2": return (b.high + b.low) / 2;
    case "(H + L + C)/3": return (b.high + b.low + b.close) / 3;
    case "(O + H + L + C)/4": return (b.open + b.high + b.low + b.close) / 4;
    default: return b.close;
  }
}

export const hasStyle = (t: ChartType): t is keyof SeriesStyles => t in DEFAULT_SERIES_STYLES;
