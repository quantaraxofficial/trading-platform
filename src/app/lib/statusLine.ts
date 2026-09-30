// Chart settings → Status line: what the chart legend (top-left) shows, as on TradingView.

import { makeStore } from "../trading/settings";

export type LegendTitleMode = "Description" | "Ticker" | "Ticker and description";
export const LEGEND_TITLE_MODES: LegendTitleMode[] = ["Description", "Ticker", "Ticker and description"];

export interface StatusLineSettings {
  // Instrument
  logo: boolean;
  title: boolean;
  titleMode: LegendTitleMode;
  marketStatus: boolean;
  chartValues: boolean;
  barChange: boolean;
  volume: boolean;
  lastDayChange: boolean;
  background: boolean;
  backgroundOpacity: number;
  // Indicators
  indTitles: boolean;
  indInputs: boolean;
  indValues: boolean;
  indBackground: boolean;
  indBackgroundOpacity: number;
}

export const DEFAULT_STATUS_LINE: StatusLineSettings = {
  logo: true,
  title: true,
  titleMode: "Description",
  marketStatus: true,
  chartValues: true,
  barChange: true,
  volume: false,
  lastDayChange: false,
  background: true,
  backgroundOpacity: 50,
  indTitles: true,
  indInputs: true,
  indValues: true,
  indBackground: true,
  indBackgroundOpacity: 50,
};

export const statusLine = makeStore<StatusLineSettings>("tv:statusLine", DEFAULT_STATUS_LINE);
