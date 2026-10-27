// The languages a script can be written in — Pine Script, Python and MQL5 — behind one way of
// running them: every engine takes the chart's bars and returns the same result (plots, levels,
// markers, the strategy report …), so the chart, the settings dialog, the Strategy Tester and
// collabs treat a script the same whatever it's written in.

import { runPineScriptAsync, getPineInputsMeta, type Bar, type MtfFetcher, type PineInputMeta, type PineRunResult } from "../pineScriptEngine";
import { runMql5, getMql5InputsMeta } from "./mql5Runtime";
import { runPython, getPythonInputsMeta } from "./pythonEngine";

export type ScriptLanguage = "pine" | "python" | "mql5";
export const SCRIPT_LANGUAGES: { id: ScriptLanguage; label: string; hint: string }[] = [
  { id: "pine", label: "Pine Script", hint: "TradingView's language" },
  { id: "python", label: "Python", hint: "NumPy, whole series at once" },
  { id: "mql5", label: "MQL5", hint: "MetaTrader 5 indicators and Expert Advisors" },
];
export const languageLabel = (l: ScriptLanguage) => SCRIPT_LANGUAGES.find(x => x.id === l)?.label ?? "Pine Script";
export const isScriptLanguage = (v: unknown): v is ScriptLanguage => v === "pine" || v === "python" || v === "mql5";
export const asLanguage = (v: unknown): ScriptLanguage => (isScriptLanguage(v) ? v : "pine");

export interface ScriptRunOpts {
  symbol: string; pineTf: string; fetchTimeframe: MtfFetcher;
  initialCapital?: number; inputOverrides?: Record<string, any>; backtestFrom?: number; backtestTo?: number; profile?: boolean;
}

export async function runScriptAsync(language: ScriptLanguage, code: string, bars: Bar[], opts: ScriptRunOpts): Promise<PineRunResult> {
  if (language === "python") return runPython(code, bars, opts);
  if (language === "mql5") return runMql5(code, bars, opts);
  return runPineScriptAsync(code, bars, opts);
}

export function getScriptInputsMeta(language: ScriptLanguage, code: string): PineInputMeta[] {
  try {
    if (language === "python") return getPythonInputsMeta(code);
    if (language === "mql5") return getMql5InputsMeta(code);
    return getPineInputsMeta(code);
  } catch {
    return [];
  }
}

export type ScriptKind = "indicator" | "strategy" | "library";
export function detectScriptKind(language: ScriptLanguage, code: string): ScriptKind {
  if (language === "python") return /^\s*strategy\s*\(/m.test(code) ? "strategy" : "indicator";
  if (language === "mql5") return /\bvoid\s+OnTick\s*\(/.test(code) ? "strategy" : "indicator";
  return /^\s*strategy\s*\(/m.test(code) ? "strategy" : /^\s*library\s*\(/m.test(code) ? "library" : "indicator";
}
export function declaredScriptTitle(language: ScriptLanguage, code: string): string {
  if (language === "mql5") return (code.match(/IndicatorSetString\s*\(\s*INDICATOR_SHORTNAME\s*,\s*"([^"]*)"/) || code.match(/#property\s+description\s+"([^"]*)"/) || [])[1] || "";
  return (code.match(/^\s*(?:indicator|strategy|library)\s*\(\s*(?:title\s*=\s*)?["']([^"']*)["']/m) || [])[1] || "";
}

// --- New-script templates ---
const PINE_LICENSE = "// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/";
const pineHeader = (u: string | null) => `${PINE_LICENSE}\n${u ? `// © ${u}` : ""}\n\n`;

const PY_INDICATOR = (u: string | null) => `# Python indicator${u ? ` · © ${u}` : ""}
# The chart's bars are NumPy arrays: open, high, low, close, volume, time, hl2, hlc3, ohlc4.
# Work on whole series at once; ta.* has the usual indicators, plot() draws a series.

indicator("My script", overlay=True)

length = input.int(20, "Length", minval=1)
source = input.source(close, "Source")

basis = ta.sma(source, length)
plot(basis, "SMA", color=color.blue, linewidth=2)
`;
const PY_STRATEGY = (u: string | null) => `# Python strategy${u ? ` · © ${u}` : ""}
# Conditions are boolean series; an order is placed on every bar where its condition is true
# and fills at the next bar's open, as in TradingView's Strategy Tester.

strategy("My strategy", overlay=True, initial_capital=100000)

fast_length = input.int(14, "Fast length")
slow_length = input.int(28, "Slow length")

fast = ta.sma(close, fast_length)
slow = ta.sma(close, slow_length)
plot(fast, "Fast", color=color.blue)
plot(slow, "Slow", color=color.orange)

strategy.entry("My Long Entry Id", strategy.long, when=ta.crossover(fast, slow))
strategy.entry("My Short Entry Id", strategy.short, when=ta.crossunder(fast, slow))
`;

const MQL_INDICATOR = (u: string | null) => `//+------------------------------------------------------------------+
//|                                                    My script.mq5 |
${u ? `//|                                          Copyright ${u.padStart(22)} |\n` : ""}//+------------------------------------------------------------------+
#property indicator_chart_window
#property indicator_buffers 1
#property indicator_plots   1
#property indicator_label1  "MA"
#property indicator_type1   DRAW_LINE
#property indicator_color1  clrDodgerBlue
#property indicator_width1  2

input int            InpPeriod = 20;        // Period
input ENUM_MA_METHOD InpMethod = MODE_SMA;  // Method

double MaBuffer[];
int    maHandle;

int OnInit()
{
   SetIndexBuffer(0, MaBuffer, INDICATOR_DATA);
   PlotIndexSetInteger(0, PLOT_DRAW_BEGIN, InpPeriod - 1);
   IndicatorSetString(INDICATOR_SHORTNAME, "MA(" + IntegerToString(InpPeriod) + ")");
   maHandle = iMA(_Symbol, _Period, InpPeriod, 0, InpMethod, PRICE_CLOSE);
   return(INIT_SUCCEEDED);
}

int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   if (CopyBuffer(maHandle, 0, 0, rates_total, MaBuffer) <= 0) return(0);
   return(rates_total);
}
`;
const MQL_EA = (u: string | null) => `//+------------------------------------------------------------------+
//|                                                  My strategy.mq5 |
${u ? `//|                                          Copyright ${u.padStart(22)} |\n` : ""}//+------------------------------------------------------------------+
// An Expert Advisor: OnTick runs once per bar, at its close, and trades through CTrade.
#include <Trade\\Trade.mqh>

input int    FastPeriod = 14;    // Fast MA
input int    SlowPeriod = 28;    // Slow MA
input double Lots       = 1.0;   // Lots

CTrade trade;
int    fastHandle, slowHandle;

int OnInit()
{
   fastHandle = iMA(_Symbol, _Period, FastPeriod, 0, MODE_SMA, PRICE_CLOSE);
   slowHandle = iMA(_Symbol, _Period, SlowPeriod, 0, MODE_SMA, PRICE_CLOSE);
   return(INIT_SUCCEEDED);
}

void OnTick()
{
   double fast[], slow[];
   ArraySetAsSeries(fast, true);
   ArraySetAsSeries(slow, true);
   if (CopyBuffer(fastHandle, 0, 0, 2, fast) < 2 || CopyBuffer(slowHandle, 0, 0, 2, slow) < 2) return;
   if (slow[1] == EMPTY_VALUE) return;

   bool crossUp   = fast[0] > slow[0] && fast[1] <= slow[1];
   bool crossDown = fast[0] < slow[0] && fast[1] >= slow[1];

   if (crossUp)
   {
      if (PositionSelect(_Symbol) && PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_SELL) trade.PositionClose(_Symbol);
      if (!PositionSelect(_Symbol)) trade.Buy(Lots, _Symbol, 0, 0, 0, "Long");
   }
   else if (crossDown)
   {
      if (PositionSelect(_Symbol) && PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) trade.PositionClose(_Symbol);
      if (!PositionSelect(_Symbol)) trade.Sell(Lots, _Symbol, 0, 0, 0, "Short");
   }
}
`;

export const SCRIPT_TEMPLATES: Record<ScriptLanguage, Partial<Record<ScriptKind, (user: string | null) => string>>> = {
  pine: {
    indicator: (u) => `${pineHeader(u)}//@version=6\nindicator("My script")\nplot(close)\n`,
    strategy: (u) => `${pineHeader(u)}//@version=6\nstrategy("My strategy", overlay=true, fill_orders_on_standard_ohlc = true)\n\nlongCondition = ta.crossover(ta.sma(close, 14), ta.sma(close, 28))\nif (longCondition)\n    strategy.entry("My Long Entry Id", strategy.long)\n\nshortCondition = ta.crossunder(ta.sma(close, 14), ta.sma(close, 28))\nif (shortCondition)\n    strategy.entry("My Short Entry Id", strategy.short)\n`,
    library: (u) => `${pineHeader(u)}//@version=6\n// @description TODO: add library description here\nlibrary("MyLibrary")\n\n// @function TODO: add function description here\n// @param x TODO: add parameter x description here\n// @returns TODO: add what function returns\nexport fun(float x) =>\n    //TODO : add function body and return value here\n    x\n`,
  },
  python: { indicator: PY_INDICATOR, strategy: PY_STRATEGY },
  mql5: { indicator: MQL_INDICATOR, strategy: MQL_EA },
};
export const templateFor = (language: ScriptLanguage, kind: ScriptKind, user: string | null) =>
  (SCRIPT_TEMPLATES[language][kind] ?? SCRIPT_TEMPLATES[language].indicator!)(user);
export const isUntouchedTemplate = (code: string, user: string | null) =>
  Object.values(SCRIPT_TEMPLATES).some(t => Object.values(t).some(f => f && f(user) === code));

export const LANGUAGE_DOCS: Record<ScriptLanguage, { label: string; url: string; title: string }> = {
  pine: { label: "Pine Script® v6", url: "https://www.tradingview.com/pine-script-reference/v6/", title: "Open Pine Reference" },
  python: { label: "Python 3 · NumPy", url: "https://numpy.org/doc/stable/reference/", title: "Python with NumPy: indicator(), strategy(), input.*, ta.*, plot(), hline(), fill(), plotshape()" },
  mql5: { label: "MQL5", url: "https://www.mql5.com/en/docs", title: "Open the MQL5 reference" },
};
