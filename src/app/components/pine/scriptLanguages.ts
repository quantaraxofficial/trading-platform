// The editor's help for Python and MQL5 scripts: Monaco's own Python and C++ highlighting, plus
// suggestions for this app's Python API (indicator, strategy.*, ta.*, input.*, plot …) and
// MQL5's built-in functions, constants and classes.

import type * as Monaco from "monaco-editor";
import type { ScriptLanguage } from "../../lib/scripting";
import { MQL5_BUILTIN_NAMES } from "../../lib/scripting/mql5Runtime";

export const monacoLanguageFor = (language: ScriptLanguage, pineLang: string) =>
  language === "python" ? "python" : language === "mql5" ? "cpp" : pineLang;

const PY: Record<string, [string, string][]> = {
  "": [
    ["indicator", 'indicator(title="My script", overlay=False)'], ["strategy", 'strategy(title, overlay=True, initial_capital=100000)'],
    ["plot", "plot(series, title=None, color=None, linewidth=1, style=\"line\")"], ["hline", "hline(price, title=None, color, linestyle=\"dashed\")"],
    ["fill", "fill(plot_or_hline_1, plot_or_hline_2, color=None)"], ["plotshape", 'plotshape(condition, title=None, location="abovebar", color=None, style="circle", text="")'],
    ["plotchar", "plotchar(condition, title=None, char, location)"], ["nz", "nz(series, replacement=0)"], ["isna", "isna(series)"],
    ["open", "Bar open prices (NumPy array)"], ["high", "Bar highs"], ["low", "Bar lows"], ["close", "Bar closes"], ["volume", "Bar volumes"],
    ["time", "Bar times (UNIX seconds)"], ["hl2", "(high + low) / 2"], ["hlc3", "(high + low + close) / 3"], ["ohlc4", "(open + high + low + close) / 4"],
    ["bar_index", "0 … n-1"], ["na", "NaN (not available)"], ["np", "NumPy"], ["math", "The math module"], ["symbol", "The chart's symbol"], ["timeframe", "The chart's timeframe"],
    ["ta", "Technical analysis functions"], ["input", "Script inputs (shown in Settings)"], ["color", "Colours"], ["shape", "plotshape() shapes"], ["location", "plotshape() locations"],
  ],
  ta: [
    ["sma", "ta.sma(source, length)"], ["ema", "ta.ema(source, length)"], ["rma", "ta.rma(source, length)"], ["wma", "ta.wma(source, length)"], ["vwma", "ta.vwma(source, length)"],
    ["rsi", "ta.rsi(source, length)"], ["macd", "ta.macd(source, fast=12, slow=26, signal=9) → (macd, signal, hist)"], ["bb", "ta.bb(source, length=20, mult=2) → (basis, upper, lower)"],
    ["stdev", "ta.stdev(source, length)"], ["atr", "ta.atr(length)"], ["tr", "ta.tr()"], ["highest", "ta.highest(source, length)"], ["lowest", "ta.lowest(source, length)"],
    ["crossover", "ta.crossover(a, b)"], ["crossunder", "ta.crossunder(a, b)"], ["cross", "ta.cross(a, b)"], ["change", "ta.change(source, length=1)"], ["mom", "ta.mom(source, length)"],
    ["roc", "ta.roc(source, length)"], ["cci", "ta.cci(source, length)"], ["stoch", "ta.stoch(source, high, low, length)"], ["obv", "ta.obv()"], ["cum", "ta.cum(source)"],
    ["sum", "ta.sum(source, length)"], ["barssince", "ta.barssince(condition)"], ["valuewhen", "ta.valuewhen(condition, source, occurrence=0)"], ["vwap", "ta.vwap(source=hlc3)"],
    ["supertrend", "ta.supertrend(factor, atr_period) → (supertrend, direction)"],
  ],
  strategy: [
    ["entry", 'strategy.entry(id, strategy.long, when=condition, qty=None, limit=None, stop=None)'], ["exit", "strategy.exit(id, when=True, stop=None, limit=None)"],
    ["close", "strategy.close(id=None, when=condition)"], ["close_all", "strategy.close_all(when=condition)"], ["cancel", "strategy.cancel(id=None, when=True)"],
    ["long", "Long direction"], ["short", "Short direction"],
  ],
  input: [
    ["int", 'input.int(defval, "Title", minval=None, maxval=None)'], ["float", 'input.float(defval, "Title")'], ["bool", 'input.bool(defval, "Title")'],
    ["string", 'input.string(defval, "Title", options=[...])'], ["source", 'input.source(close, "Source")'], ["color", 'input.color("#2962FF", "Color")'],
  ],
  color: ["red", "green", "blue", "orange", "purple", "yellow", "lime", "aqua", "fuchsia", "gray", "white", "black", "teal", "maroon", "navy", "olive", "silver"].map(c => [c, `color.${c}`] as [string, string]).concat([["new", "color.new(color, transp)"], ["rgb", "color.rgb(r, g, b, transp=0)"]]),
  shape: ["arrowup", "arrowdown", "triangleup", "triangledown", "circle", "square", "diamond", "labelup", "labeldown"].map(s => [s, `shape.${s}`] as [string, string]),
  location: ["abovebar", "belowbar", "absolute"].map(s => [s, `location.${s}`] as [string, string]),
};

const MQL_KEYWORDS = ["input", "sinput", "extern", "static", "const", "return", "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "true", "false", "NULL",
  "int", "uint", "long", "ulong", "short", "ushort", "char", "uchar", "double", "float", "bool", "string", "datetime", "color", "void", "enum", "struct",
  "OnInit", "OnCalculate", "OnTick", "OnDeinit", "OnStart", "_Symbol", "_Period", "_Point", "_Digits", "MqlRates", "MqlTick", "MqlDateTime", "MqlTradeRequest", "MqlTradeResult"];

let registered = false;
export function setupScriptLanguages(monaco: typeof Monaco) {
  if (registered) return;
  registered = true;
  const K = monaco.languages.CompletionItemKind;
  monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: ["."],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const ns = (before.match(/(\w+)\.$/) || [])[1];
      const list = ns ? PY[ns] : PY[""];
      if (!list) return { suggestions: [] };
      return {
        suggestions: list.map(([label, detail]) => ({
          label, detail, range, insertText: label,
          kind: /\(/.test(detail) ? K.Function : ns === "color" || ns === "shape" || ns === "location" ? K.Constant : K.Variable,
        })),
      };
    },
  });
  const mql = [
    ...MQL5_BUILTIN_NAMES.funcs.map(n => ({ label: n, kind: K.Function })),
    ...MQL5_BUILTIN_NAMES.consts.map(n => ({ label: n, kind: K.Constant })),
    ...MQL5_BUILTIN_NAMES.classes.map(n => ({ label: n, kind: K.Class })),
    ...MQL_KEYWORDS.map(n => ({ label: n, kind: K.Keyword })),
  ];
  monaco.languages.registerCompletionItemProvider("cpp", {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      return { suggestions: mql.map(m => ({ ...m, insertText: m.label, range })) };
    },
  });
}
