"use client";

// Chart settings (TradingView's Settings dialog: Symbol, Status line, Scales and lines, Canvas,
// Trading, Alerts, Events) — one store the dialog, the price-scale menu and the chart all use.
// The Status line and Trading tabs keep their own stores (statusLine, tradingSettings); a
// template / Cancel snapshot covers all three.

import { makeStore, tradingSettings, type TradingSettings } from "../trading/settings";
import { statusLine, type StatusLineSettings } from "./statusLine";
import type { SeriesStyles } from "./seriesStyles";
import { backendFetch } from "@/lib/backend";

export type Visibility3 = "Visible on mouse over" | "Always visible" | "Always invisible";
export const VISIBILITY3: Visibility3[] = ["Visible on mouse over", "Always visible", "Always invisible"];
export type LineStyleName = "Solid" | "Dashed" | "Dotted";
export type ColorLine = { color: string; width: number; style: LineStyleName };

export interface ChartSettings {
  // Symbol
  colorBarsOnPrevClose: boolean;
  candle: {
    upColor: string; downColor: string; borderUpColor: string; borderDownColor: string; wickUpColor: string; wickDownColor: string;
    borderVisible: boolean; wickVisible: boolean; bodyVisible: boolean;
  };
  precision: string;            // "Default" | "Integer" | "N decimals" | "1/2" …
  // Every other chart type's style (lib/seriesStyles), only what's been changed from the defaults
  series: Partial<SeriesStyles>;
  // Scales and lines
  currencyUnit: Visibility3;
  scaleModes: Visibility3;
  lockPriceToBarRatio: boolean;
  priceToBarRatio: number;
  scalesPlacement: "Stack on the left" | "Stack on the right" | "Auto";
  noOverlappingLabels: boolean;
  plusButton: boolean;
  countdown: boolean;
  symbolName: boolean; symbolValue: boolean; symbolLine: boolean;
  symbolLineStyle: { color: string; width: number };      // color "" = the bar's colour
  symbolValueMode: "Value according to scale" | "Price and percentage value";
  prevCloseValue: boolean; prevCloseLine: boolean; prevCloseStyle: ColorLine;
  indicatorsName: boolean; indicatorsValue: boolean;
  prePostValue: boolean; prePostLine: boolean;      // (the price-scale menu's pre/post-market items)
  highLowValue: boolean; highLowLine: boolean; highLowStyle: ColorLine;
  bidAskValue: boolean; bidAskLine: boolean; bidColor: string; askColor: string;
  dayOfWeek: boolean;
  dateFormat: string;
  timeFormat: "24-hours" | "12-hours";
  saveLeftEdge: boolean;
  // Canvas
  backgroundType: "Solid" | "Gradient";
  background: string; background2: string;
  vertGrid: boolean; gridVert: string;
  horzGrid: boolean; gridHorz: string;
  crosshair: ColorLine;
  watermark: { ticker: boolean; interval: boolean; description: boolean; replay: boolean };
  watermarkColor: string;
  text: string; fontSize: number;
  lines: string;
  navButtons: Visibility3; paneButtons: Visibility3;
  marginTop: number; marginBottom: number; marginRight: number;
  // Alerts
  alertLines: boolean; alertLineColor: string; onlyActiveAlerts: boolean; autoHideToasts: boolean;
  // Events
  ideas: boolean; ideasMode: string;
  sessionBreaks: boolean; sessionBreaksStyle: ColorLine;
  economicEvents: boolean; onlyFutureEvents: boolean; eventsBreaks: boolean; eventsBreaksStyle: ColorLine;
  latestNews: boolean; newsNotification: boolean;
  colorsTheme: "light" | "dark";      // the theme the canvas colours were last set for
}

export const DATE_FORMATS = ["Mon Q3 '97", "Mon Q3 1997", "Mon 29 Sep '97", "Mon Sep '97", "Mon Sep 29, 1997", "Mon Sep 1997", "Mon Sep 29", "Mon 29 Sep",
  "Mon 1997-09-29", "Mon 97-09-29", "Mon 97/09/29", "Mon 1997/09/29", "Mon 29-09-1997", "Mon 29-09-97", "Mon 29/09/97", "Mon 29/09/1997", "Mon 09/29/97", "Mon 09/29/1997"];
export const PRECISIONS = ["Default", "Integer", ...Array.from({ length: 15 }, (_, i) => `${i + 1} decimal${i ? "s" : ""}`), "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", "1/128", "1/320"];
export const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40];

export function themeCanvas(dark: boolean) {
  return {
    background: dark ? "#131722" : "#ffffff", background2: dark ? "#131722" : "#ffffff",
    gridVert: dark ? "rgba(42, 46, 57, 0.6)" : "rgba(42, 46, 57, 0.06)", gridHorz: dark ? "rgba(42, 46, 57, 0.6)" : "rgba(42, 46, 57, 0.06)",
    crosshair: { color: dark ? "#758696" : "#9598a1", width: 1, style: "Dashed" as LineStyleName },
    text: dark ? "#d1d4dc" : "#131722", lines: dark ? "#2a2e39" : "#e0e3eb",
    watermarkColor: dark ? "rgba(178, 181, 190, 0.2)" : "rgba(80, 83, 94, 0.2)",
  };
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  colorBarsOnPrevClose: false,
  candle: { upColor: "#089981", downColor: "#f23645", borderUpColor: "#089981", borderDownColor: "#f23645", wickUpColor: "#089981", wickDownColor: "#f23645", borderVisible: true, wickVisible: true, bodyVisible: true },
  precision: "Default",
  series: {},
  currencyUnit: "Visible on mouse over", scaleModes: "Visible on mouse over",
  lockPriceToBarRatio: false, priceToBarRatio: 1,
  scalesPlacement: "Auto",
  noOverlappingLabels: true, plusButton: true, countdown: true,
  symbolName: false, symbolValue: true, symbolLine: true, symbolLineStyle: { color: "", width: 1 },
  symbolValueMode: "Value according to scale",
  prevCloseValue: false, prevCloseLine: false, prevCloseStyle: { color: "#555555", width: 1, style: "Dotted" },
  indicatorsName: false, indicatorsValue: true,
  prePostValue: false, prePostLine: false,
  highLowValue: false, highLowLine: false, highLowStyle: { color: "", width: 1, style: "Dotted" },
  bidAskValue: false, bidAskLine: false, bidColor: "#2962ff", askColor: "#f7525f",
  dayOfWeek: true, dateFormat: "Mon 29 Sep '97", timeFormat: "24-hours", saveLeftEdge: false,
  backgroundType: "Solid", ...(() => { const c = themeCanvas(false); return { background: c.background, background2: c.background2, gridVert: c.gridVert, gridHorz: c.gridHorz, crosshair: c.crosshair, text: c.text, lines: c.lines, watermarkColor: c.watermarkColor }; })(),
  vertGrid: true, horzGrid: true,
  watermark: { ticker: false, interval: false, description: false, replay: true },
  fontSize: 12,
  navButtons: "Visible on mouse over", paneButtons: "Visible on mouse over",
  marginTop: 10, marginBottom: 8, marginRight: 10,
  alertLines: true, alertLineColor: "#089981", onlyActiveAlerts: true, autoHideToasts: true,
  ideas: false, ideasMode: "All ideas",
  sessionBreaks: false, sessionBreaksStyle: { color: "#4985e7", width: 1, style: "Dashed" },
  economicEvents: true, onlyFutureEvents: true, eventsBreaks: false, eventsBreaksStyle: { color: "#555555", width: 1, style: "Dashed" },
  latestNews: true, newsNotification: false,
  colorsTheme: "light",
};

export const chartSettings = makeStore<ChartSettings>("tv:chartSettings", DEFAULT_CHART_SETTINGS);

// Everything the dialog covers, for Cancel and for templates
export type ChartSettingsSnapshot = { chart: ChartSettings; status: StatusLineSettings; trading: Partial<TradingSettings> };
const TRADING_KEYS: (keyof TradingSettings)[] = ["buySellButtons", "oneClickTrading", "executionSound", "executionSoundVolume", "executionSoundName", "onlyRejectionNotifications",
  "positionsAndOrders", "reversePositionButton", "projectOrderForMarket", "pnlValue", "pnlPositions", "pnlPositionsMode", "pnlBrackets", "pnlBracketsMode",
  "executionMarks", "executionLabels", "extendedPriceLines", "alignment", "tradesInSnapshots"] as any;
export function takeSnapshot(): ChartSettingsSnapshot {
  const t = tradingSettings.get() as any;
  const trading: any = {};
  TRADING_KEYS.forEach(k => { if (k in t) trading[k] = t[k]; });
  return { chart: chartSettings.get(), status: statusLine.get(), trading };
}
export function applySnapshot(s: Partial<ChartSettingsSnapshot>) {
  if (s.chart) chartSettings.set({ ...DEFAULT_CHART_SETTINGS, ...s.chart, candle: { ...DEFAULT_CHART_SETTINGS.candle, ...(s.chart.candle || {}) } });
  if (s.status) statusLine.set(s.status);
  if (s.trading) tradingSettings.set(s.trading);
}
export function defaultSnapshot(dark: boolean): ChartSettingsSnapshot {
  const c = themeCanvas(dark);
  return {
    chart: { ...DEFAULT_CHART_SETTINGS, colorsTheme: dark ? "dark" : "light", background: c.background, background2: c.background2, gridVert: c.gridVert, gridHorz: c.gridHorz, crosshair: c.crosshair, text: c.text, lines: c.lines, watermarkColor: c.watermarkColor },
    status: { ...statusLine.get(), ...{ logo: true, title: true, marketStatus: true, chartValues: true, barChange: true, volume: false, lastDayChange: false, background: true, backgroundOpacity: 50, indTitles: true, indInputs: true, indValues: true, indBackground: true, indBackgroundOpacity: 50 } } as StatusLineSettings,
    trading: {},
  };
}

// Templates (Template → Save as… / a saved one / its trash can): kept in the browser and, when
// signed in, in the account too
export type ChartTemplate = { name: string; settings: ChartSettingsSnapshot; id?: string | number };
const TEMPLATES_KEY = "tv:chartSettingsTemplates";
export const chartTemplates = makeStore<{ list: ChartTemplate[] }>(TEMPLATES_KEY, { list: [] });
const API = "http://localhost:8000/api/users/templates";
export function saveTemplate(name: string, uid?: string | null) {
  const settings = takeSnapshot();
  chartTemplates.set(p => ({ list: [...p.list.filter(t => t.name !== name), { name, settings }].sort((a, b) => a.name.localeCompare(b.name)) }));
  if (uid) backendFetch(`${API}/${uid}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, tool_type: "chart_settings", settings }) }).catch(() => {});
}
export function removeTemplate(name: string, uid?: string | null) {
  const t = chartTemplates.get().list.find(x => x.name === name);
  chartTemplates.set(p => ({ list: p.list.filter(x => x.name !== name) }));
  if (uid && t?.id !== undefined) backendFetch(`${API}/${uid}/${t.id}/`, { method: "DELETE" }).catch(() => {});
}
// Merges the account's templates in (older ones only held candle / canvas colours)
export function syncTemplatesFromAccount(uid: string) {
  backendFetch(`${API}/${uid}/?tool_type=chart_settings`).then(r => (r.ok ? r.json() : [])).then((data: any[]) => {
    if (!Array.isArray(data)) return;
    const fromAccount: ChartTemplate[] = data.filter(d => d && d.name && d.name !== "default").map(d => ({ id: d.id, name: d.name, settings: upgradeTemplate(d.settings) }));
    chartTemplates.set(p => {
      const byName = new Map(p.list.map(t => [t.name, t]));
      fromAccount.forEach(t => byName.set(t.name, { ...byName.get(t.name), ...t }));
      return { list: Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)) };
    });
  }).catch(() => {});
}
function upgradeTemplate(s: any): ChartSettingsSnapshot {
  if (s && s.chart) return s;
  const chart: any = { ...chartSettings.get() };
  if (s?.candleColors) chart.candle = { ...chart.candle, ...s.candleColors };
  if (s?.canvasColors) {
    const c = s.canvasColors;
    Object.assign(chart, { background: c.background ?? chart.background, background2: c.background ?? chart.background2, gridVert: c.gridVert ?? chart.gridVert, gridHorz: c.gridHorz ?? chart.gridHorz, text: c.text ?? chart.text, lines: c.lines ?? chart.lines });
    if (c.crosshair) chart.crosshair = { ...chart.crosshair, color: c.crosshair };
  }
  return { chart, status: statusLine.get(), trading: {} };
}
export function applyTemplate(t: ChartTemplate) { applySnapshot(t.settings); }

// The precision option as a price format
export function precisionFormat(p: string, detected: number): { precision: number; minMove: number } {
  if (p === "Default") return { precision: detected, minMove: Math.pow(10, -detected) };
  if (p === "Integer") return { precision: 0, minMove: 1 };
  const dec = /^(\d+) decimal/.exec(p);
  if (dec) return { precision: +dec[1], minMove: Math.pow(10, -+dec[1]) };
  const frac = /^1\/(\d+)$/.exec(p);
  if (frac) { const d = +frac[1]; const precision = Math.ceil(Math.log10(d)) + (d % 5 === 0 ? 0 : 1); return { precision: Math.min(precision, 8), minMove: 1 / d }; }
  return { precision: detected, minMove: Math.pow(10, -detected) };
}
