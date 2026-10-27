// What an MQL5 program runs against: MetaTrader's built-in functions and constants over the
// chart's bars. An indicator's OnCalculate fills its buffers, which become the chart's plots
// (as its #property lines and PlotIndexSet* calls describe them). An Expert Advisor's OnTick runs
// once per bar, at its close (Bid / Ask = the close), and trades through CTrade or OrderSend
// on a netting account the strategy simulator keeps, so it gets the Strategy Tester report.

import type { Bar, PineFill, PineHline, PineInputMeta, PinePlotResult, PineRunResult } from "../pineScriptEngine";
import { compileMql5, scanMql5Inputs, MqlError, BUILTIN_STRUCTS, type CompileEnv, type BuiltinFn, type MqlProperty } from "./mql5Compiler";
import { StrategySim, contractSize } from "./strategySim";
import * as TA from "./ta";

const DBL_MAX = Number.MAX_VALUE;
const EMPTY_VALUE = DBL_MAX;

// MetaTrader's colour names (as RGB); a color value is BGR, as in MQL5
const WEB_COLORS: Record<string, string> = {
  Black: "000000", White: "FFFFFF", Red: "FF0000", Lime: "00FF00", Blue: "0000FF", Yellow: "FFFF00", Aqua: "00FFFF", Magenta: "FF00FF",
  Gray: "808080", Silver: "C0C0C0", Maroon: "800000", Green: "008000", Navy: "000080", Olive: "808000", Purple: "800080", Teal: "008080",
  Orange: "FFA500", DarkOrange: "FF8C00", OrangeRed: "FF4500", Gold: "FFD700", Goldenrod: "DAA520", Tomato: "FF6347", Crimson: "DC143C",
  FireBrick: "B22222", Salmon: "FA8072", Coral: "FF7F50", Chocolate: "D2691E", Brown: "A52A2A", Khaki: "F0E68C", Pink: "FFC0CB",
  HotPink: "FF69B4", DeepPink: "FF1493", Violet: "EE82EE", DarkViolet: "9400D3", Indigo: "4B0082", MediumPurple: "9370DB", BlueViolet: "8A2BE2",
  DodgerBlue: "1E90FF", DeepSkyBlue: "00BFFF", SkyBlue: "87CEEB", LightBlue: "ADD8E6", RoyalBlue: "4169E1", SteelBlue: "4682B4",
  Cyan: "00FFFF", Turquoise: "40E0D0", SpringGreen: "00FF7F", SeaGreen: "2E8B57", MediumSeaGreen: "3CB371", ForestGreen: "228B22",
  LimeGreen: "32CD32", LawnGreen: "7CFC00", Chartreuse: "7FFF00", YellowGreen: "9ACD32", LightGray: "D3D3D3", DarkGray: "A9A9A9",
  DimGray: "696969", SlateGray: "708090", Wheat: "F5DEB3", Beige: "F5F5DC", Ivory: "FFFFF0", MediumBlue: "0000CD", DarkBlue: "00008B",
  DarkGreen: "006400", DarkRed: "8B0000", LightGreen: "90EE90", LightCoral: "F08080", Orchid: "DA70D6", Plum: "DDA0DD", Tan: "D2B48C",
};
const rgbToBgr = (hex: string) => { const n = parseInt(hex, 16); return ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255); };
export const bgrToCss = (c: number) => {
  if (c < 0 || c === 0xffffffff) return "transparent";
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
};
const cssToBgr = (css: string) => { const m = String(css).match(/^#?([0-9a-f]{6})/i); return m ? rgbToBgr(m[1]) : 0; };

const PERIODS: Record<string, number> = { PERIOD_CURRENT: 0, PERIOD_M1: 1, PERIOD_M2: 2, PERIOD_M3: 3, PERIOD_M4: 4, PERIOD_M5: 5, PERIOD_M6: 6, PERIOD_M10: 10, PERIOD_M12: 12, PERIOD_M15: 15, PERIOD_M20: 20, PERIOD_M30: 30, PERIOD_H1: 16385, PERIOD_H2: 16386, PERIOD_H3: 16387, PERIOD_H4: 16388, PERIOD_H6: 16390, PERIOD_H8: 16392, PERIOD_H12: 16396, PERIOD_D1: 16408, PERIOD_W1: 32769, PERIOD_MN1: 49153 };
const periodSeconds = (p: number) => p === 0 ? 0 : p < 16384 ? p * 60 : p < 32768 ? (p - 16384) * 3600 : p === 32769 ? 604800 : 2592000;

export const CONSTANTS: Record<string, number | string> = {
  INIT_SUCCEEDED: 0, INIT_FAILED: 1, INIT_PARAMETERS_INCORRECT: 2, INIT_AGENT_NOT_SUITABLE: 3,
  INDICATOR_DATA: 0, INDICATOR_COLOR_INDEX: 1, INDICATOR_CALCULATIONS: 2,
  DRAW_NONE: 0, DRAW_LINE: 1, DRAW_SECTION: 2, DRAW_HISTOGRAM: 3, DRAW_HISTOGRAM2: 4, DRAW_ARROW: 5, DRAW_ZIGZAG: 6, DRAW_FILLING: 7, DRAW_BARS: 8, DRAW_CANDLES: 9,
  DRAW_COLOR_LINE: 10, DRAW_COLOR_SECTION: 11, DRAW_COLOR_HISTOGRAM: 12, DRAW_COLOR_HISTOGRAM2: 13, DRAW_COLOR_ARROW: 14, DRAW_COLOR_ZIGZAG: 15, DRAW_COLOR_BARS: 16, DRAW_COLOR_CANDLES: 17,
  STYLE_SOLID: 0, STYLE_DASH: 1, STYLE_DOT: 2, STYLE_DASHDOT: 3, STYLE_DASHDOTDOT: 4,
  PLOT_ARROW: 0, PLOT_ARROW_SHIFT: 1, PLOT_DRAW_BEGIN: 2, PLOT_DRAW_TYPE: 3, PLOT_SHOW_DATA: 4, PLOT_SHIFT: 5, PLOT_LINE_STYLE: 6, PLOT_LINE_WIDTH: 7, PLOT_COLOR_INDEXES: 8, PLOT_LINE_COLOR: 9, PLOT_EMPTY_VALUE: 10, PLOT_LABEL: 11,
  INDICATOR_SHORTNAME: 0, INDICATOR_DIGITS: 1, INDICATOR_LEVELS: 2, INDICATOR_LEVELVALUE: 3, INDICATOR_LEVELCOLOR: 4, INDICATOR_LEVELSTYLE: 5, INDICATOR_LEVELWIDTH: 6, INDICATOR_MINIMUM: 7, INDICATOR_MAXIMUM: 8, INDICATOR_LEVELTEXT: 9, INDICATOR_HEIGHT: 10,
  MODE_SMA: 0, MODE_EMA: 1, MODE_SMMA: 2, MODE_LWMA: 3,
  PRICE_CLOSE: 1, PRICE_OPEN: 2, PRICE_HIGH: 3, PRICE_LOW: 4, PRICE_MEDIAN: 5, PRICE_TYPICAL: 6, PRICE_WEIGHTED: 7,
  STO_LOWHIGH: 0, STO_CLOSECLOSE: 1,
  MAIN_LINE: 0, SIGNAL_LINE: 1, BASE_LINE: 0, UPPER_BAND: 1, LOWER_BAND: 2, PLUSDI_LINE: 1, MINUSDI_LINE: 2, MODE_MAIN: 0, MODE_SIGNAL: 1, MODE_PLUSDI: 1, MODE_MINUSDI: 2,
  MODE_OPEN: 0, MODE_LOW: 1, MODE_HIGH: 2, MODE_CLOSE: 3, MODE_VOLUME: 4, MODE_REAL_VOLUME: 5, MODE_SPREAD: 6,
  ...PERIODS,
  POSITION_TYPE_BUY: 0, POSITION_TYPE_SELL: 1,
  POSITION_TICKET: 0, POSITION_TIME: 1, POSITION_TYPE: 2, POSITION_MAGIC: 3, POSITION_IDENTIFIER: 4, POSITION_TIME_MSC: 5, POSITION_REASON: 6,
  POSITION_VOLUME: 10, POSITION_PRICE_OPEN: 11, POSITION_SL: 12, POSITION_TP: 13, POSITION_PRICE_CURRENT: 14, POSITION_SWAP: 15, POSITION_PROFIT: 16,
  POSITION_SYMBOL: 20, POSITION_COMMENT: 21,
  ORDER_TYPE_BUY: 0, ORDER_TYPE_SELL: 1, ORDER_TYPE_BUY_LIMIT: 2, ORDER_TYPE_SELL_LIMIT: 3, ORDER_TYPE_BUY_STOP: 4, ORDER_TYPE_SELL_STOP: 5,
  TRADE_ACTION_DEAL: 1, TRADE_ACTION_PENDING: 5, TRADE_ACTION_SLTP: 6, TRADE_ACTION_MODIFY: 7, TRADE_ACTION_REMOVE: 8, TRADE_ACTION_CLOSE_BY: 10,
  ORDER_FILLING_FOK: 0, ORDER_FILLING_IOC: 1, ORDER_FILLING_RETURN: 2, ORDER_TIME_GTC: 0, ORDER_TIME_DAY: 1,
  TRADE_RETCODE_DONE: 10009, TRADE_RETCODE_PLACED: 10008, TRADE_RETCODE_REJECT: 10006, TRADE_RETCODE_INVALID: 10013, TRADE_RETCODE_INVALID_VOLUME: 10014, TRADE_RETCODE_MARKET_CLOSED: 10018, TRADE_RETCODE_NO_CHANGES: 10025, TRADE_RETCODE_POSITION_CLOSED: 10036,
  SYMBOL_BID: 0, SYMBOL_ASK: 1, SYMBOL_LAST: 2, SYMBOL_POINT: 3, SYMBOL_TRADE_CONTRACT_SIZE: 4, SYMBOL_VOLUME_MIN: 5, SYMBOL_VOLUME_MAX: 6, SYMBOL_VOLUME_STEP: 7, SYMBOL_TRADE_TICK_SIZE: 8, SYMBOL_TRADE_TICK_VALUE: 9,
  SYMBOL_DIGITS: 20, SYMBOL_SPREAD: 21, SYMBOL_TRADE_STOPS_LEVEL: 22, SYMBOL_TRADE_FREEZE_LEVEL: 23,
  SYMBOL_DESCRIPTION: 30, SYMBOL_CURRENCY_BASE: 31, SYMBOL_CURRENCY_PROFIT: 32,
  ACCOUNT_BALANCE: 0, ACCOUNT_EQUITY: 1, ACCOUNT_PROFIT: 2, ACCOUNT_MARGIN: 3, ACCOUNT_MARGIN_FREE: 4, ACCOUNT_CREDIT: 5, ACCOUNT_MARGIN_LEVEL: 6,
  ACCOUNT_LEVERAGE: 10, ACCOUNT_LOGIN: 11, ACCOUNT_TRADE_MODE: 12, ACCOUNT_TRADE_ALLOWED: 13, ACCOUNT_TRADE_EXPERT: 14,
  ACCOUNT_CURRENCY: 20, ACCOUNT_NAME: 21, ACCOUNT_SERVER: 22, ACCOUNT_COMPANY: 23,
  TIME_DATE: 1, TIME_MINUTES: 2, TIME_SECONDS: 4,
  EMPTY_VALUE, DBL_MAX, DBL_MIN: 2.2250738585072014e-308, DBL_EPSILON: 2.220446049250313e-16, FLT_MAX: 3.402823466e38, FLT_MIN: 1.175494351e-38,
  INT_MAX: 2147483647, INT_MIN: -2147483648, UINT_MAX: 4294967295, LONG_MAX: Number.MAX_SAFE_INTEGER, LONG_MIN: Number.MIN_SAFE_INTEGER, ULONG_MAX: Number.MAX_SAFE_INTEGER,
  CHAR_MAX: 127, CHAR_MIN: -128, UCHAR_MAX: 255, SHORT_MAX: 32767, SHORT_MIN: -32768, USHORT_MAX: 65535,
  WHOLE_ARRAY: -1, WRONG_VALUE: -1, INVALID_HANDLE: -1, EMPTY: -1,
  M_PI: Math.PI, M_PI_2: Math.PI / 2, M_PI_4: Math.PI / 4, M_1_PI: 1 / Math.PI, M_2_PI: 2 / Math.PI, M_E: Math.E, M_SQRT2: Math.SQRT2, M_SQRT1_2: Math.SQRT1_2, M_LN2: Math.LN2, M_LN10: Math.LN10, M_LOG2E: Math.LOG2E, M_LOG10E: Math.LOG10E,
  clrNONE: -1, CLR_NONE: -1,
  MQL_TESTER: 6, MQL_OPTIMIZATION: 7, MQL_VISUAL_MODE: 8, MQL_DEBUG: 5, MQL_PROGRAM_NAME: 0,
  TERMINAL_CONNECTED: 6, TERMINAL_TRADE_ALLOWED: 8,
  OBJ_TREND: 2, OBJ_HLINE: 1, OBJ_VLINE: 0, OBJ_ARROW: 22, OBJ_TEXT: 101, OBJ_LABEL: 102, OBJ_RECTANGLE: 16,
  OBJPROP_COLOR: 0, OBJPROP_STYLE: 1, OBJPROP_WIDTH: 2, OBJPROP_TEXT: 999, OBJPROP_PRICE: 20, OBJPROP_TIME: 19,
};
for (const [k, v] of Object.entries(WEB_COLORS)) CONSTANTS[`clr${k}`] = rgbToBgr(v);

const ENUM_MEMBERS: Record<string, string[]> = {
  ENUM_MA_METHOD: ["MODE_SMA", "MODE_EMA", "MODE_SMMA", "MODE_LWMA"],
  ENUM_APPLIED_PRICE: ["PRICE_CLOSE", "PRICE_OPEN", "PRICE_HIGH", "PRICE_LOW", "PRICE_MEDIAN", "PRICE_TYPICAL", "PRICE_WEIGHTED"],
  ENUM_TIMEFRAMES: Object.keys(PERIODS),
  ENUM_STO_PRICE: ["STO_LOWHIGH", "STO_CLOSECLOSE"],
  ENUM_LINE_STYLE: ["STYLE_SOLID", "STYLE_DASH", "STYLE_DOT", "STYLE_DASHDOT", "STYLE_DASHDOTDOT"],
  ENUM_ORDER_TYPE: ["ORDER_TYPE_BUY", "ORDER_TYPE_SELL"],
};

const BUFFERS_PER_DRAW: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 2, 5: 1, 6: 2, 7: 2, 8: 4, 9: 4, 10: 2, 11: 2, 12: 2, 13: 3, 14: 2, 15: 3, 16: 5, 17: 5 };

class MqlRuntimeError extends Error {}

// An MQL5 array: values kept oldest-first; "as series" only flips which end index 0 is
export class MqlArr {
  d: any[];
  series = false;
  fixed: boolean;
  make: any;
  constructor(make: any, size: number, fixed: boolean) {
    this.make = make;
    this.fixed = fixed;
    this.d = new Array(Math.max(0, size | 0));
    for (let i = 0; i < this.d.length; i++) this.d[i] = this.fresh();
  }
  fresh() { return typeof this.make === "function" ? this.make() : this.make; }
  g(i: number) {
    const n = this.d.length;
    if (!(i >= 0 && i < n)) throw new MqlRuntimeError(`array out of range (index ${i}, size ${n})`);
    return this.d[this.series ? n - 1 - Math.trunc(i) : Math.trunc(i)];
  }
  s(i: number, v: any) {
    const n = this.d.length;
    if (!(i >= 0 && i < n)) throw new MqlRuntimeError(`array out of range (index ${i}, size ${n})`);
    this.d[this.series ? n - 1 - Math.trunc(i) : Math.trunc(i)] = v;
    return v;
  }
  resize(n: number) {
    n = Math.max(0, n | 0);
    const old = this.d.length;
    if (this.series) {
      // A series array grows at its oldest end (index n-1), as MetaTrader's does
      if (n > old) { const add = new Array(n - old); for (let i = 0; i < add.length; i++) add[i] = this.fresh(); this.d = add.concat(this.d); }
      else this.d = this.d.slice(old - n);
    } else {
      this.d.length = n;
      for (let i = old; i < n; i++) this.d[i] = this.fresh();
    }
    return n;
  }
  // Writes `values` (oldest first) as the whole array, as CopyBuffer / CopyClose do
  fill(values: any[]) {
    if (this.fixed && this.d.length < values.length) values = values.slice(values.length - this.d.length);
    if (this.fixed) { const off = this.d.length - values.length; for (let i = 0; i < values.length; i++) this.d[i + off] = values[i]; }
    else this.d = values.slice();
    return values.length;
  }
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function timeToString(t: number, flags = 3) {
  const d = new Date(t * 1000);
  let s = "";
  if (flags & 1) s = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
  if (flags & 6) s += `${s ? " " : ""}${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${flags & 4 ? `:${pad(d.getUTCSeconds())}` : ""}`;
  return s;
}

// printf-style formatting (%d %i %u %f %e %g %s %x %X %c %%, with flags, width and precision)
export function formatString(fmt: string, args: any[]) {
  let k = 0;
  return String(fmt).replace(/%([-+ 0#]*)(\d+|\*)?(?:\.(\d+|\*))?(?:h|l|ll|I32|I64)?([diufeEgGsxXoc%])/g, (_m, flags: string, width: string, prec: string, conv: string) => {
    if (conv === "%") return "%";
    if (width === "*") width = String(args[k++]);
    if (prec === "*") prec = String(args[k++]);
    const v = args[k++];
    let s: string;
    const p = prec !== undefined ? parseInt(prec, 10) : undefined;
    switch (conv) {
      case "d": case "i": case "u": s = String(Math.trunc(Number(v) || 0)); break;
      case "f": s = (Number(v) || 0).toFixed(p ?? 6); break;
      case "e": case "E": s = (Number(v) || 0).toExponential(p ?? 6); if (conv === "E") s = s.toUpperCase(); break;
      case "g": case "G": s = String(Number((Number(v) || 0).toPrecision(p || 6))); break;
      case "x": s = (Math.trunc(Number(v)) >>> 0).toString(16); break;
      case "X": s = (Math.trunc(Number(v)) >>> 0).toString(16).toUpperCase(); break;
      case "o": s = (Math.trunc(Number(v)) >>> 0).toString(8); break;
      case "c": s = String.fromCharCode(Number(v) || 0); break;
      default: s = v === null || v === undefined ? "" : String(v); if (p !== undefined) s = s.slice(0, p);
    }
    if (flags.includes("+") && /^[0-9]/.test(s) && "difeEgG".includes(conv)) s = "+" + s;
    const w = width ? parseInt(width, 10) : 0;
    if (s.length < w) s = flags.includes("-") ? s.padEnd(w) : flags.includes("0") && "difeEgGxX".includes(conv) ? (s[0] === "-" || s[0] === "+" ? s[0] + s.slice(1).padStart(w - 1, "0") : s.padStart(w, "0")) : s.padStart(w);
    return s;
  });
}

const mqlStr = (v: any): string => {
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(16)));
  if (v === null || v === undefined) return "";
  return String(v);
};

// --- The compile environment: which names exist and what they return ---
const fn = (ret: BuiltinFn["ret"], refs?: number[]): BuiltinFn => ({ ret, refs });
const FUNCS: Record<string, BuiltinFn> = {
  Print: fn("void"), PrintFormat: fn("void"), Comment: fn("void"), Alert: fn("void"), StringFormat: fn("string"),
  DoubleToString: fn("string"), IntegerToString: fn("string"), NormalizeDouble: fn("double"), TimeToString: fn("string"), StringToTime: fn("int"),
  TimeCurrent: fn("int"), TimeLocal: fn("int"), TimeGMT: fn("int"), TimeTradeServer: fn("int"), TimeToStruct: fn("bool"), StructToTime: fn("int"),
  MathAbs: fn("any"), MathMax: fn("any"), MathMin: fn("any"), MathPow: fn("double"), MathSqrt: fn("double"), MathLog: fn("double"), MathLog10: fn("double"),
  MathExp: fn("double"), MathFloor: fn("double"), MathCeil: fn("double"), MathRound: fn("double"), MathSin: fn("double"), MathCos: fn("double"),
  MathTan: fn("double"), MathArcsin: fn("double"), MathArccos: fn("double"), MathArctan: fn("double"), MathMod: fn("double"), MathRand: fn("int"),
  MathSrand: fn("void"), MathIsValidNumber: fn("bool"),
  fabs: fn("double"), fmax: fn("double"), fmin: fn("double"), pow: fn("double"), sqrt: fn("double"), log: fn("double"), log10: fn("double"), exp: fn("double"),
  floor: fn("double"), ceil: fn("double"), round: fn("double"), sin: fn("double"), cos: fn("double"), tan: fn("double"), asin: fn("double"), acos: fn("double"), atan: fn("double"), fmod: fn("double"),
  StringLen: fn("int"), StringSubstr: fn("string"), StringFind: fn("int"), StringToDouble: fn("double"), StringToInteger: fn("int"),
  StringToUpper: fn("bool", [0]), StringToLower: fn("bool", [0]), StringTrimLeft: fn("int", [0]), StringTrimRight: fn("int", [0]), StringReplace: fn("int", [0]),
  StringAdd: fn("bool", [0]), StringSplit: fn("int"), StringCompare: fn("int"), CharToString: fn("string"), ShortToString: fn("string"),
  StringGetCharacter: fn("int"), ColorToString: fn("string"), EnumToString: fn("string"), StringConcatenate: fn("int", [0]),
  ArraySize: fn("int"), ArrayRange: fn("int"), ArrayResize: fn("int"), ArraySetAsSeries: fn("bool"), ArrayGetAsSeries: fn("bool"), ArrayIsSeries: fn("bool"),
  ArrayIsDynamic: fn("bool"), ArrayInitialize: fn("int"), ArrayFill: fn("void"), ArrayCopy: fn("int"), ArrayMaximum: fn("int"), ArrayMinimum: fn("int"),
  ArrayFree: fn("void"), ArraySort: fn("bool"), ArrayReverse: fn("bool"), ArrayBsearch: fn("int"), ZeroMemory: fn("void"),
  Bars: fn("int"), iBars: fn("int"), iTime: fn("int"), iOpen: fn("double"), iHigh: fn("double"), iLow: fn("double"), iClose: fn("double"),
  iVolume: fn("int"), iTickVolume: fn("int"), iRealVolume: fn("int"), iSpread: fn("int"), iHighest: fn("int"), iLowest: fn("int"), iBarShift: fn("int"),
  CopyBuffer: fn("int"), CopyClose: fn("int"), CopyOpen: fn("int"), CopyHigh: fn("int"), CopyLow: fn("int"), CopyTime: fn("int"),
  CopyTickVolume: fn("int"), CopyRealVolume: fn("int"), CopySpread: fn("int"), CopyRates: fn("int"), BarsCalculated: fn("int"), SeriesInfoInteger: fn("int"),
  SymbolInfoTick: fn("bool"), Symbol: fn("string"), Period: fn("int"), Point: fn("double"), Digits: fn("int"), PeriodSeconds: fn("int"),
  SymbolInfoDouble: fn("double"), SymbolInfoInteger: fn("int"), SymbolInfoString: fn("string"), SymbolSelect: fn("bool"),
  AccountInfoDouble: fn("double"), AccountInfoInteger: fn("int"), AccountInfoString: fn("string"),
  SetIndexBuffer: fn("bool"), PlotIndexSetInteger: fn("bool"), PlotIndexSetDouble: fn("bool"), PlotIndexSetString: fn("bool"), PlotIndexGetInteger: fn("int"),
  IndicatorSetString: fn("bool"), IndicatorSetInteger: fn("bool"), IndicatorSetDouble: fn("bool"), IndicatorRelease: fn("bool"),
  iMA: fn("int"), iRSI: fn("int"), iATR: fn("int"), iBands: fn("int"), iStdDev: fn("int"), iMACD: fn("int"), iStochastic: fn("int"), iCCI: fn("int"),
  iMomentum: fn("int"), iADX: fn("int"), iCustom: fn("int"),
  PositionsTotal: fn("int"), PositionSelect: fn("bool"), PositionGetTicket: fn("int"), PositionSelectByTicket: fn("bool"), PositionGetDouble: fn("double"),
  PositionGetInteger: fn("int"), PositionGetString: fn("string"), PositionGetSymbol: fn("string"), OrdersTotal: fn("int"), OrderSend: fn("bool"),
  HistorySelect: fn("bool"), HistoryDealsTotal: fn("int"),
  GetLastError: fn("int"), ResetLastError: fn("void"), IsStopped: fn("bool"), Sleep: fn("void"), EventSetTimer: fn("bool"), EventKillTimer: fn("void"),
  GetTickCount: fn("int"), GetMicrosecondCount: fn("int"), MQLInfoInteger: fn("int"), MQLInfoString: fn("string"), TerminalInfoInteger: fn("int"),
  ChartID: fn("int"), ChartRedraw: fn("void"), ChartSetInteger: fn("bool"), ChartGetInteger: fn("int"), PlaySound: fn("bool"), SendNotification: fn("bool"), MessageBox: fn("int"),
  ObjectCreate: fn("bool"), ObjectDelete: fn("bool"), ObjectsDeleteAll: fn("int"), ObjectSetInteger: fn("bool"), ObjectSetDouble: fn("bool"),
  ObjectSetString: fn("bool"), ObjectFind: fn("int"), ObjectMove: fn("bool"), ObjectGetDouble: fn("double"), ObjectGetInteger: fn("int"),
};
const METHODS: CompileEnv["methods"] = {
  CTrade: {
    Buy: "bool", Sell: "bool", PositionOpen: "bool", PositionClose: "bool", PositionModify: "bool", PositionClosePartial: "bool",
    BuyLimit: "bool", SellLimit: "bool", BuyStop: "bool", SellStop: "bool", OrderDelete: "bool",
    SetExpertMagicNumber: "void", SetDeviationInPoints: "void", SetTypeFilling: "void", SetTypeFillingBySymbol: "bool", SetAsyncMode: "void", SetMarginMode: "void", LogLevel: "void",
    ResultRetcode: "int", ResultDeal: "int", ResultOrder: "int", ResultPrice: "double", ResultVolume: "double", ResultComment: "string", ResultRetcodeDescription: "string", RequestPrice: "double",
  },
  CPositionInfo: {
    Select: "bool", SelectByIndex: "bool", SelectByTicket: "bool", SelectByMagic: "bool", PositionType: "int", TypeDescription: "string", Ticket: "int", Time: "int",
    Magic: "int", Identifier: "int", Volume: "double", PriceOpen: "double", StopLoss: "double", TakeProfit: "double", PriceCurrent: "double", Profit: "double",
    Swap: "double", Commission: "double", Symbol: "string", Comment: "string",
  },
  CSymbolInfo: {
    Name: "any", RefreshRates: "bool", Refresh: "bool", Bid: "double", Ask: "double", Last: "double", Point: "double", Digits: "int", Spread: "int",
    LotsMin: "double", LotsMax: "double", LotsStep: "double", ContractSize: "double", TickSize: "double", TickValue: "double", StopsLevel: "int", NormalizePrice: "double",
  },
  CAccountInfo: { Balance: "double", Equity: "double", Profit: "double", Margin: "double", FreeMargin: "double", Leverage: "int", Currency: "string", Login: "int", Name: "string", Server: "string" },
  COrderInfo: { Select: "bool", SelectByIndex: "bool", Ticket: "int" },
  CDealInfo: { Select: "bool", SelectByIndex: "bool", Ticket: "int", Profit: "double" },
};
const ENV: CompileEnv = {
  consts: CONSTANTS,
  vars: { _Symbol: "string", _Period: "int", _Point: "double", _Digits: "int", _LastError: "int", _StopFlag: "bool", _RandomSeed: "int" },
  funcs: FUNCS,
  methods: METHODS,
};
export const MQL5_BUILTIN_NAMES = { funcs: Object.keys(FUNCS), consts: Object.keys(CONSTANTS), classes: Object.keys(METHODS) };

function tfToPeriod(pineTf: string): number {
  const tf = (pineTf || "").toUpperCase();
  if (/^\d+$/.test(tf)) {
    const m = parseInt(tf, 10);
    if (m < 60) return m;
    return 16384 + Math.round(m / 60);
  }
  if (tf.endsWith("D")) return PERIODS.PERIOD_D1;
  if (tf.endsWith("W")) return PERIODS.PERIOD_W1;
  if (tf.endsWith("M")) return PERIODS.PERIOD_MN1;
  return 0;
}
function priceDigits(bars: Bar[]): number {
  let d = 0;
  for (let i = Math.max(0, bars.length - 50); i < bars.length; i++) {
    const s = String(bars[i].close);
    const dot = s.indexOf(".");
    if (dot >= 0 && !s.includes("e")) d = Math.max(d, s.length - dot - 1);
  }
  return Math.min(d, 8);
}

export interface Mql5RunOpts { symbol: string; pineTf: string; initialCapital?: number; inputOverrides?: Record<string, any>; backtestFrom?: number; backtestTo?: number }

export function runMql5(code: string, bars: Bar[], opts: Mql5RunOpts): PineRunResult {
  const t0 = performance.now();
  const logs: string[] = [];
  const warnings: string[] = [];
  const warned = new Set<string>();
  const warnOnce = (key: string, text: string) => { if (!warned.has(key)) { warned.add(key); warnings.push(text); } };
  const meta: PineRunResult["meta"] = { title: "", isStrategy: false, overlay: true, initialCapital: opts.initialCapital ?? 100000 };
  const result: PineRunResult = { plots: [], hlines: [], fills: [], markers: [], tables: [], strategyReport: null, inputs: [], logs, warnings, errors: [], meta, execMs: 0 };
  let lineOf = () => 1;
  try {
    const { compiled, props } = compileMql5(code, ENV);
    const isEA = compiled.funcs.has("OnTick");
    const isIndicator = compiled.funcs.has("OnCalculate");
    if (!isEA && !isIndicator && !compiled.funcs.has("OnStart")) throw new MqlError("'OnCalculate', 'OnTick' or 'OnStart' - event handler not found", 1);
    meta.isStrategy = isEA;
    const n = bars.length;
    if (!n) { result.execMs = performance.now() - t0; return result; }

    const symbol = (opts.symbol || "").replace(/^[A-Z]+:/i, "");
    const period = tfToPeriod(opts.pineTf);
    const digits = priceDigits(bars);
    const point = Math.pow(10, -digits);
    const lot = contractSize(symbol);
    const deadline = Date.now() + 5000;
    let cur = n - 1;             // the bar the program is on (EAs: each bar in turn)
    let lastError = 0;
    let seed = 1;
    const col = { time: bars.map(b => b.time), open: bars.map(b => b.open), high: bars.map(b => b.high), low: bars.map(b => b.low), close: bars.map(b => b.close), volume: bars.map(b => b.volume ?? 0) };

    // Indicator state
    const prop = (name: string) => props.find(p => p.name === name)?.value;
    const unq = (s: string) => s.replace(/^"|"$/g, "");
    const constVal = (s: string): number => {
      s = s.trim();
      if (/^C'/.test(s)) { const p = s.slice(2, -1).split(",").map(x => parseInt(x, 10) || 0); return (p[2] << 16) | (p[1] << 8) | p[0]; }
      if (s in CONSTANTS && typeof CONSTANTS[s] === "number") return CONSTANTS[s] as number;
      const v = Number(s);
      return Number.isFinite(v) ? v : 0;
    };
    if (props.some(p => p.name === "indicator_separate_window")) meta.overlay = false;
    const plotCount = Math.max(0, parseInt(prop("indicator_plots") || "0", 10) || 0);
    interface PlotCfg { label: string; type: number; color: number; width: number; style: number; drawBegin: number; empty: number; shift: number }
    const plots: PlotCfg[] = [];
    for (let k = 0; k < plotCount; k++) {
      const i = k + 1;
      const colorText = prop(`indicator_color${i}`);
      plots.push({
        label: unq(prop(`indicator_label${i}`) || `Plot ${i}`),
        type: prop(`indicator_type${i}`) ? constVal(prop(`indicator_type${i}`)!) : 1,
        color: colorText ? constVal(colorText.split(/,(?![^']*')/)[0]) : rgbToBgr(["2962FF", "FF6D00", "00897B", "AB47BC", "F23645"][k % 5]),
        width: parseInt(prop(`indicator_width${i}`) || "1", 10) || 1,
        style: prop(`indicator_style${i}`) ? constVal(prop(`indicator_style${i}`)!) : 0,
        drawBegin: 0, empty: EMPTY_VALUE, shift: 0,
      });
    }
    const levels: { value: number; color?: number; style?: number; width?: number; text?: string }[] = [];
    for (const p of props.filter(p => /^indicator_level\d+$/.test(p.name))) levels.push({ value: parseFloat(p.value) });
    const levelColor = prop("indicator_levelcolor"), levelStyle = prop("indicator_levelstyle"), levelWidth = prop("indicator_levelwidth");
    let shortName = "";
    const buffers: { arr: MqlArr; kind: number }[] = [];

    // Trading
    const sim = isEA ? new StrategySim(bars, { initialCapital: meta.initialCapital, backtestFrom: opts.backtestFrom, backtestTo: opts.backtestTo, pyramiding: true }) : null;
    const tickets = new WeakMap<object, number>();
    let ticketSeq = 1;
    const ticketOf = () => { const p = sim?.position; if (!p) return 0; let t = tickets.get(p); if (!t) { t = ticketSeq++; tickets.set(p, t); } return t; };
    let magic = 0;
    let selected = false;
    let lastResult = { retcode: 0, price: 0, volume: 0, deal: 0, comment: "" };
    const tradeDone = (ok: boolean, volume: number) => {
      lastResult = ok ? { retcode: 10009, price: bars[cur].close, volume, deal: ticketSeq, comment: "done" } : { retcode: 10006, price: 0, volume: 0, deal: 0, comment: "rejected" };
      if (!ok) lastError = 4756;
      return ok;
    };
    const needSim = (what: string) => {
      if (!sim) throw new MqlRuntimeError(`${what} can only be used by an Expert Advisor (OnTick)`);
      return sim;
    };
    const posDouble = (prop: number) => {
      const p = sim?.position;
      if (!p) return 0;
      const close = bars[cur].close;
      switch (prop) {
        case 10: return p.qty / lot;
        case 11: return p.entryPrice;
        case 12: return p.sl ?? 0;
        case 13: return p.tp ?? 0;
        case 14: return close;
        case 16: return (p.direction === "long" ? close - p.entryPrice : p.entryPrice - close) * p.qty;
        default: return 0;
      }
    };
    const posInt = (prop: number) => {
      const p = sim?.position;
      if (!p) return 0;
      switch (prop) {
        case 0: case 4: return ticketOf();
        case 1: return p.entryTime;
        case 2: return p.direction === "long" ? 0 : 1;
        case 3: return magic;
        case 5: return p.entryTime * 1000;
        default: return 0;
      }
    };
    const buy = (volume: number, sl: number, tp: number, comment: string) => {
      const s = needSim("Trading");
      if (!(volume > 0)) { lastError = 4756; lastResult = { retcode: 10014, price: 0, volume: 0, deal: 0, comment: "invalid volume" }; return false; }
      return tradeDone(s.marketOrder(comment || "Buy", "long", volume * lot, sl > 0 ? sl : null, tp > 0 ? tp : null), volume);
    };
    const sell = (volume: number, sl: number, tp: number, comment: string) => {
      const s = needSim("Trading");
      if (!(volume > 0)) { lastError = 4756; lastResult = { retcode: 10014, price: 0, volume: 0, deal: 0, comment: "invalid volume" }; return false; }
      return tradeDone(s.marketOrder(comment || "Sell", "short", volume * lot, sl > 0 ? sl : null, tp > 0 ? tp : null), volume);
    };
    const closePos = (comment?: string) => {
      const s = needSim("Trading");
      const vol = s.position ? s.position.qty / lot : 0;
      return tradeDone(s.close(comment || "Close"), vol);
    };
    const pending = () => { warnOnce("pending", "Pending orders (BuyLimit, SellStop …) aren't simulated yet; use market orders with stop-loss / take-profit"); return false; };

    // Handles: built-in indicators over the chart's bars
    const applied = (price: number): number[] => {
      switch (price) {
        case 2: return col.open; case 3: return col.high; case 4: return col.low;
        case 5: return col.high.map((h, i) => (h + col.low[i]) / 2);
        case 6: return col.high.map((h, i) => (h + col.low[i] + col.close[i]) / 3);
        case 7: return col.high.map((h, i) => (h + col.low[i] + 2 * col.close[i]) / 4);
        default: return col.close;
      }
    };
    const handles: { buffers: number[][]; shift: number }[] = [];
    // (values not available yet read as EMPTY_VALUE, as MetaTrader's buffers do)
    const addHandle = (buffers: number[][], shift = 0) => { handles.push({ buffers: buffers.map(b => b.map(v => (Number.isFinite(v) ? v : EMPTY_VALUE))), shift }); return handles.length - 1; };
    const checkSeries = (sym: any, tf: any) => {
      if (sym && String(sym) !== symbol && String(sym) !== opts.symbol) warnOnce(`sym:${sym}`, `Only the chart's symbol is available; "${sym}" uses ${symbol}`);
      if (tf && tf !== period) warnOnce(`tf:${tf}`, "Only the chart's timeframe is available; other timeframes use it");
    };
    // The window [cur - start - count + 1, cur - start] of a series, oldest first
    const windowOf = (src: any[], start: number, count: number) => {
      const end = cur - Math.max(0, start | 0);
      const from = Math.max(0, end - Math.max(0, count | 0) + 1);
      return end < 0 ? [] : src.slice(from, end + 1);
    };
    const startIndex = (start: any): number => {
      // CopyX(symbol, tf, datetime start, count, …): from the bar at that time
      if (typeof start === "number" && start > 100000000) {
        let i = cur; while (i > 0 && col.time[i] > start) i--;
        return cur - i;
      }
      return Number(start) || 0;
    };
    const copySeries = (src: any[]) => (sym: any, tf: any, start: any, count: number, arr: MqlArr) => {
      checkSeries(sym, tf);
      if (count === -1) count = cur + 1;
      return arr.fill(windowOf(src, startIndex(start), count));
    };
    const shiftVal = (src: number[], shift: number) => { const i = cur - (shift | 0); return i >= 0 && i <= cur ? src[i] : 0; };
    const extremum = (sym: any, tf: any, type: number, count: number, start: number, max: boolean) => {
      checkSeries(sym, tf);
      const src = type === 1 ? col.low : type === 2 ? col.high : type === 0 ? col.open : type === 4 ? col.volume : col.close;
      if (count === -1) count = cur + 1 - start;
      let best = -1, bv = max ? -Infinity : Infinity;
      for (let s = start; s < start + count; s++) {
        const i = cur - s;
        if (i < 0) break;
        if (max ? src[i] > bv : src[i] < bv) { bv = src[i]; best = s; }
      }
      return best;
    };

    const arrFromList = (list: any[], make: any, size: number) => {
      const a = new MqlArr(make, Math.max(size || 0, list.length), !!size);
      for (let i = 0; i < list.length; i++) a.d[i] = list[i];
      return a;
    };
    const inputs = scanMql5Inputs(code);
    const legend: string[] = [];
    const enumValue = (name: string) => {
      if (name in CONSTANTS) return CONSTANTS[name];
      for (const m of Array.from(compiled.enums.values())) if (m.has(name)) return m.get(name)!;
      return undefined;
    };

    const $ = {
      lineOf: () => 1,
      int: (v: any) => { const x = typeof v === "string" ? parseFloat(v) : Number(v); return Number.isFinite(x) ? Math.trunc(x) : 0; },
      num: (v: any) => { const x = typeof v === "string" ? parseFloat(v) : Number(v); return Number.isNaN(x) ? 0 : x; },
      str: mqlStr,
      idiv: (a: number, b: number) => { if (!b) throw new MqlRuntimeError("zero divide"); return Math.trunc(a / b); },
      imod: (a: number, b: number) => { if (b === 0) throw new MqlRuntimeError("zero divide"); return a % b; },
      copy: (v: any) => (v && typeof v === "object" && !(v instanceof MqlArr) && !v.__obj ? structuredCopy(v) : v),
      charAt: (s: string, i: number) => s.charCodeAt(i) || 0,
      list: (items: any[]) => items,
      arr: (make: any, size: number, fixed: boolean) => new MqlArr(make, size, fixed),
      arrFrom: arrFromList,
      aincr: (a: MqlArr, i: number, d: number, post: boolean) => { const v = a.g(i); a.s(i, v + d); return post ? v : v + d; },
      abox: (a: MqlArr, i: number) => ({ get v() { return a.g(i); }, set v(x: any) { a.s(i, x); } }),
      struct: (type: string) => { const o: any = {}; for (const [k, t] of Object.entries(BUILTIN_STRUCTS[type])) o[`m_${k}`] = t === "string" ? "" : 0; return o; },
      obj: (type: string) => makeObject(type),
      input: (name: string, def: any, cat: string, enumName: string) => {
        const ov = opts.inputOverrides?.[name];
        let v = def;
        if (ov !== undefined && ov !== null && ov !== "") {
          if (enumName) { const e = enumValue(String(ov)); if (e !== undefined) v = e; }
          else if (cat === "int") v = Math.trunc(Number(ov)) || 0;
          else if (cat === "double") v = Number(ov) || 0;
          else if (cat === "bool") v = ov === true || ov === "true";
          else if (cat === "string") v = String(ov);
          else v = ov;
          const meta = inputs.find(x => x.name === name);
          if (meta?.type === "color") v = cssToBgr(String(ov));
        }
        const meta = inputs.find(x => x.name === name);
        if (cat !== "bool") {
          if (enumName) {
            const names = (ENUM_MEMBERS[enumName] || Array.from(compiled.enums.get(enumName)?.keys() || []));
            legend.push(names.find(nm => enumValue(nm) === v) || String(v));
          } else legend.push(meta?.type === "color" ? bgrToCss(v) : mqlStr(v));
        }
        return v;
      },
      tick: () => { if (Date.now() > deadline) throw new MqlRuntimeError("the program took too long (over 5 seconds) and was stopped"); },
    };

    lineOf = () => $.lineOf();

    const structuredCopy = (o: any): any => {
      const c: any = {};
      for (const k of Object.keys(o)) { const v = o[k]; c[k] = v instanceof MqlArr ? Object.assign(new MqlArr(v.make, 0, v.fixed), { d: v.d.map((x: any) => (x && typeof x === "object" ? structuredCopy(x) : x)), series: v.series }) : v && typeof v === "object" ? structuredCopy(v) : v; }
      return c;
    };

    const B = {
      get _Symbol() { return symbol; },
      get _Period() { return period; },
      get _Point() { return point; },
      get _Digits() { return digits; },
      get _LastError() { return lastError; },
      get _StopFlag() { return false; },
      get _RandomSeed() { return seed; },
    };

    const symbolDouble = (prop: number) => {
      switch (prop) {
        case 0: case 1: case 2: return bars[cur].close;
        case 3: case 8: return point;
        case 4: return lot;
        case 5: return 0.01;
        case 6: return 1000;
        case 7: return 0.01;
        case 9: return lot * point;
        default: return 0;
      }
    };
    const accountDouble = (prop: number) => {
      const bal = sim ? sim.balance : meta.initialCapital;
      const eq = sim ? sim.equity : meta.initialCapital;
      switch (prop) {
        case 0: return bal; case 1: return eq; case 2: return eq - bal; case 4: return eq; case 6: return 0;
        default: return 0;
      }
    };

    const makeObject = (type: string): any => {
      const o: any = { __obj: type };
      if (type === "CTrade") {
        Object.assign(o, {
          m_Buy: (v: number, _s?: any, _p?: number, sl = 0, tp = 0, c = "") => buy(v, sl, tp, c),
          m_Sell: (v: number, _s?: any, _p?: number, sl = 0, tp = 0, c = "") => sell(v, sl, tp, c),
          m_PositionOpen: (_s: any, t: number, v: number, _p: number, sl = 0, tp = 0, c = "") => (t === 0 ? buy(v, sl, tp, c) : t === 1 ? sell(v, sl, tp, c) : pending()),
          m_PositionClose: () => closePos(),
          m_PositionClosePartial: () => { warnOnce("partial", "PositionClosePartial closes the whole position"); return closePos(); },
          m_PositionModify: (_s: any, sl: number, tp: number) => { const ok = needSim("Trading").modify(sl > 0 ? sl : null, tp > 0 ? tp : null); return tradeDone(ok, 0); },
          m_BuyLimit: pending, m_SellLimit: pending, m_BuyStop: pending, m_SellStop: pending, m_OrderDelete: () => false,
          m_SetExpertMagicNumber: (m: number) => { magic = m; }, m_SetDeviationInPoints: () => {}, m_SetTypeFilling: () => {}, m_SetTypeFillingBySymbol: () => true,
          m_SetAsyncMode: () => {}, m_SetMarginMode: () => {}, m_LogLevel: () => {},
          m_ResultRetcode: () => lastResult.retcode, m_ResultDeal: () => lastResult.deal, m_ResultOrder: () => lastResult.deal, m_ResultPrice: () => lastResult.price,
          m_ResultVolume: () => lastResult.volume, m_ResultComment: () => lastResult.comment, m_ResultRetcodeDescription: () => lastResult.comment, m_RequestPrice: () => bars[cur].close,
        });
      } else if (type === "CPositionInfo") {
        Object.assign(o, {
          m_Select: () => (selected = !!sim?.position), m_SelectByIndex: (i: number) => (selected = i === 0 && !!sim?.position),
          m_SelectByTicket: (t: number) => (selected = !!sim?.position && ticketOf() === t), m_SelectByMagic: () => (selected = !!sim?.position),
          m_PositionType: () => posInt(2), m_TypeDescription: () => (posInt(2) === 0 ? "buy" : "sell"), m_Ticket: () => posInt(0), m_Time: () => posInt(1),
          m_Magic: () => magic, m_Identifier: () => posInt(0), m_Volume: () => posDouble(10), m_PriceOpen: () => posDouble(11), m_StopLoss: () => posDouble(12),
          m_TakeProfit: () => posDouble(13), m_PriceCurrent: () => posDouble(14), m_Profit: () => posDouble(16), m_Swap: () => 0, m_Commission: () => 0,
          m_Symbol: () => (sim?.position ? symbol : ""), m_Comment: () => sim?.position?.id ?? "",
        });
      } else if (type === "CSymbolInfo") {
        Object.assign(o, {
          m_Name: (s?: string) => (s === undefined ? symbol : true), m_RefreshRates: () => true, m_Refresh: () => true,
          m_Bid: () => bars[cur].close, m_Ask: () => bars[cur].close, m_Last: () => bars[cur].close, m_Point: () => point, m_Digits: () => digits, m_Spread: () => 0,
          m_LotsMin: () => 0.01, m_LotsMax: () => 1000, m_LotsStep: () => 0.01, m_ContractSize: () => lot, m_TickSize: () => point, m_TickValue: () => lot * point,
          m_StopsLevel: () => 0, m_NormalizePrice: (p: number) => Number(p.toFixed(digits)),
        });
      } else if (type === "CAccountInfo") {
        Object.assign(o, {
          m_Balance: () => accountDouble(0), m_Equity: () => accountDouble(1), m_Profit: () => accountDouble(2), m_Margin: () => 0, m_FreeMargin: () => accountDouble(4),
          m_Leverage: () => 100, m_Currency: () => "USD", m_Login: () => 0, m_Name: () => "Strategy Tester", m_Server: () => "TradePilot",
        });
      } else {
        Object.assign(o, { m_Select: () => false, m_SelectByIndex: () => false, m_Ticket: () => 0, m_Profit: () => 0 });
      }
      return o;
    };

    const ignored = (name: string) => () => { warnOnce(name, `${name} is ignored here (chart objects and terminal functions aren't available)`); return 0; };
    const log = (text: string) => {
      if (logs.length >= 1000) return;
      logs.push(isEA ? `${timeToString(col.time[cur])}  ${text}` : text);
    };
    const minMax = (a: number, b: number, max: boolean) => (max ? Math.max(a, b) : Math.min(a, b));
    const F: Record<string, (...a: any[]) => any> = {
      Print: (...a: any[]) => log(a.map(mqlStr).join("")),
      PrintFormat: (f: string, ...a: any[]) => log(formatString(f, a)),
      Comment: (...a: any[]) => { const t = a.map(mqlStr).join(""); if (t) log(t); },
      Alert: (...a: any[]) => log("Alert: " + a.map(mqlStr).join("")),
      StringFormat: (f: string, ...a: any[]) => formatString(f, a),
      DoubleToString: (v: number, d = 8) => Number(v).toFixed(Math.max(0, Math.min(16, d))),
      IntegerToString: (v: number, len = 0, ch = 32) => String(Math.trunc(v)).padStart(len, String.fromCharCode(ch)),
      NormalizeDouble: (v: number, d: number) => { const m = Math.pow(10, d); return Math.round(v * m) / m; },
      TimeToString: (t: number, f = 3) => timeToString(t, f),
      StringToTime: (s: string) => { const m = String(s).match(/(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) / 1000 : 0; },
      TimeCurrent: (s?: any) => { const t = col.time[cur]; if (s && typeof s === "object") F.TimeToStruct(t, s); return t; },
      TimeLocal: () => col.time[cur], TimeGMT: () => col.time[cur], TimeTradeServer: () => col.time[cur],
      TimeToStruct: (t: number, s: any) => {
        const d = new Date(t * 1000);
        Object.assign(s, { m_year: d.getUTCFullYear(), m_mon: d.getUTCMonth() + 1, m_day: d.getUTCDate(), m_hour: d.getUTCHours(), m_min: d.getUTCMinutes(), m_sec: d.getUTCSeconds(), m_day_of_week: d.getUTCDay(), m_day_of_year: Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) });
        return true;
      },
      StructToTime: (s: any) => Date.UTC(s.m_year, s.m_mon - 1, s.m_day, s.m_hour, s.m_min, s.m_sec) / 1000,
      MathAbs: Math.abs, MathMax: (a: number, b: number) => minMax(a, b, true), MathMin: (a: number, b: number) => minMax(a, b, false), MathPow: Math.pow, MathSqrt: Math.sqrt,
      MathLog: Math.log, MathLog10: Math.log10, MathExp: Math.exp, MathFloor: Math.floor, MathCeil: Math.ceil, MathRound: Math.round,
      MathSin: Math.sin, MathCos: Math.cos, MathTan: Math.tan, MathArcsin: Math.asin, MathArccos: Math.acos, MathArctan: Math.atan,
      MathMod: (a: number, b: number) => a % b,
      MathRand: () => { seed = (seed * 214013 + 2531011) >>> 0; return (seed >>> 16) & 0x7fff; },
      MathSrand: (s: number) => { seed = s >>> 0; },
      MathIsValidNumber: (v: number) => Number.isFinite(v),
      fabs: Math.abs, fmax: Math.max, fmin: Math.min, pow: Math.pow, sqrt: Math.sqrt, log: Math.log, log10: Math.log10, exp: Math.exp,
      floor: Math.floor, ceil: Math.ceil, round: Math.round, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, fmod: (a: number, b: number) => a % b,
      StringLen: (s: string) => String(s ?? "").length,
      StringSubstr: (s: string, start: number, len = -1) => String(s).substr(start, len < 0 ? undefined : len),
      StringFind: (s: string, sub: string, start = 0) => String(s).indexOf(sub, start),
      StringToDouble: (s: string) => parseFloat(s) || 0,
      StringToInteger: (s: string) => parseInt(s, 10) || 0,
      StringToUpper: (b: any) => { b.v = String(b.v).toUpperCase(); return true; },
      StringToLower: (b: any) => { b.v = String(b.v).toLowerCase(); return true; },
      StringTrimLeft: (b: any) => { const o = String(b.v); b.v = o.replace(/^\s+/, ""); return o.length - b.v.length; },
      StringTrimRight: (b: any) => { const o = String(b.v); b.v = o.replace(/\s+$/, ""); return o.length - b.v.length; },
      StringReplace: (b: any, find: string, rep: string) => { const parts = String(b.v).split(find); b.v = parts.join(rep); return parts.length - 1; },
      StringAdd: (b: any, s: string) => { b.v = String(b.v) + mqlStr(s); return true; },
      StringConcatenate: (b: any, ...a: any[]) => { b.v = a.map(mqlStr).join(""); return b.v.length; },
      StringSplit: (s: string, sep: number, arr: MqlArr) => { const parts = String(s).split(String.fromCharCode(sep)); arr.fill(parts); return parts.length; },
      StringCompare: (a: string, b: string, cs = true) => { const x = cs ? a : a.toLowerCase(), y = cs ? b : b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; },
      CharToString: (c: number) => String.fromCharCode(c), ShortToString: (c: number) => String.fromCharCode(c),
      StringGetCharacter: (s: string, i: number) => String(s).charCodeAt(i) || 0,
      ColorToString: (c: number) => bgrToCss(c),
      EnumToString: (v: number) => String(v),
      ArraySize: (a: MqlArr) => a.d.length, ArrayRange: (a: MqlArr) => a.d.length,
      ArrayResize: (a: MqlArr, n: number) => { if (a.fixed) return -1; return a.resize(n); },
      ArraySetAsSeries: (a: MqlArr, f: boolean) => { a.series = !!f; return true; },
      ArrayGetAsSeries: (a: MqlArr) => a.series, ArrayIsSeries: (a: MqlArr) => a.series, ArrayIsDynamic: (a: MqlArr) => !a.fixed,
      ArrayInitialize: (a: MqlArr, v: any) => { a.d.fill(v); return a.d.length; },
      ArrayFill: (a: MqlArr, start: number, count: number, v: any) => { for (let i = start; i < start + count && i < a.d.length; i++) a.s(i, v); },
      ArrayCopy: (dst: MqlArr, src: MqlArr, ds = 0, ss = 0, count = -1) => {
        if (count < 0) count = src.d.length - ss;
        if (!dst.fixed && dst.d.length < ds + count) dst.resize(ds + count);
        let k = 0;
        for (; k < count && ss + k < src.d.length && ds + k < dst.d.length; k++) dst.s(ds + k, src.g(ss + k));
        return k;
      },
      ArrayMaximum: (a: MqlArr, start = 0, count = -1) => { let best = -1, bv = -Infinity; const end = count < 0 ? a.d.length : Math.min(a.d.length, start + count); for (let i = start; i < end; i++) { const v = a.g(i); if (v > bv) { bv = v; best = i; } } return best; },
      ArrayMinimum: (a: MqlArr, start = 0, count = -1) => { let best = -1, bv = Infinity; const end = count < 0 ? a.d.length : Math.min(a.d.length, start + count); for (let i = start; i < end; i++) { const v = a.g(i); if (v < bv) { bv = v; best = i; } } return best; },
      ArrayFree: (a: MqlArr) => { if (!a.fixed) a.d = []; },
      ArraySort: (a: MqlArr) => { a.d.sort((x, y) => x - y); return true; },
      ArrayReverse: (a: MqlArr) => { a.d.reverse(); return true; },
      ArrayBsearch: (a: MqlArr, v: number) => { let best = 0, bd = Infinity; for (let i = 0; i < a.d.length; i++) { const d = Math.abs(a.g(i) - v); if (d < bd) { bd = d; best = i; } } return best; },
      ZeroMemory: (o: any) => { if (o instanceof MqlArr) o.d.fill(0); else if (o && typeof o === "object") for (const k of Object.keys(o)) o[k] = typeof o[k] === "string" ? "" : 0; },
      Bars: (s?: any, tf?: any) => { checkSeries(s, tf); return cur + 1; }, iBars: (s?: any, tf?: any) => { checkSeries(s, tf); return cur + 1; },
      iTime: (s: any, tf: any, sh: number) => { checkSeries(s, tf); return shiftVal(col.time, sh); },
      iOpen: (s: any, tf: any, sh: number) => { checkSeries(s, tf); return shiftVal(col.open, sh); },
      iHigh: (s: any, tf: any, sh: number) => { checkSeries(s, tf); return shiftVal(col.high, sh); },
      iLow: (s: any, tf: any, sh: number) => { checkSeries(s, tf); return shiftVal(col.low, sh); },
      iClose: (s: any, tf: any, sh: number) => { checkSeries(s, tf); return shiftVal(col.close, sh); },
      iVolume: (s: any, tf: any, sh: number) => shiftVal(col.volume, sh), iTickVolume: (s: any, tf: any, sh: number) => shiftVal(col.volume, sh),
      iRealVolume: (s: any, tf: any, sh: number) => shiftVal(col.volume, sh), iSpread: () => 0,
      iHighest: (s: any, tf: any, type: number, count = -1, start = 0) => extremum(s, tf, type, count, start, true),
      iLowest: (s: any, tf: any, type: number, count = -1, start = 0) => extremum(s, tf, type, count, start, false),
      iBarShift: (s: any, tf: any, t: number) => { let i = cur; while (i > 0 && col.time[i] > t) i--; return cur - i; },
      CopyBuffer: (h: number, buf: number, start: any, count: number, arr: MqlArr) => {
        const hd = handles[h];
        if (!hd || !hd.buffers[buf]) { lastError = 4807; return -1; }
        if (count === -1) count = cur + 1;
        return arr.fill(windowOf(hd.buffers[buf], startIndex(start), count));
      },
      CopyClose: copySeries(col.close), CopyOpen: copySeries(col.open), CopyHigh: copySeries(col.high), CopyLow: copySeries(col.low),
      CopyTime: copySeries(col.time), CopyTickVolume: copySeries(col.volume), CopyRealVolume: copySeries(col.volume),
      CopySpread: (s: any, tf: any, start: any, count: number, arr: MqlArr) => arr.fill(new Array(Math.max(0, Math.min(count, cur + 1))).fill(0)),
      CopyRates: (s: any, tf: any, start: any, count: number, arr: MqlArr) => {
        checkSeries(s, tf);
        const end = cur - Math.max(0, startIndex(start) | 0);
        const from = Math.max(0, end - Math.max(0, (count === -1 ? cur + 1 : count) | 0) + 1);
        const idx: number[] = [];
        for (let i = from; i <= end; i++) idx.push(i);
        return arr.fill(idx.map(i => ({ m_time: col.time[i], m_open: col.open[i], m_high: col.high[i], m_low: col.low[i], m_close: col.close[i], m_tick_volume: col.volume[i], m_spread: 0, m_real_volume: col.volume[i] })));
      },
      BarsCalculated: (h: number) => (handles[h] ? cur + 1 : -1), SeriesInfoInteger: () => cur + 1,
      SymbolInfoTick: (_s: any, t: any) => { Object.assign(t, { m_time: col.time[cur], m_bid: col.close[cur], m_ask: col.close[cur], m_last: col.close[cur], m_volume: col.volume[cur], m_time_msc: col.time[cur] * 1000 }); return true; },
      Symbol: () => symbol, Period: () => period, Point: () => point, Digits: () => digits,
      PeriodSeconds: (p = 0) => periodSeconds(p || period),
      SymbolInfoDouble: (_s: any, prop: number) => symbolDouble(prop),
      SymbolInfoInteger: (_s: any, prop: number) => (prop === 20 ? digits : 0),
      SymbolInfoString: (_s: any, prop: number) => (prop === 30 ? symbol : symbol.split("/")[prop === 31 ? 0 : 1] || "USD"),
      SymbolSelect: () => true,
      AccountInfoDouble: (prop: number) => accountDouble(prop),
      AccountInfoInteger: (prop: number) => (prop === 10 ? 100 : prop === 13 || prop === 14 ? 1 : 0),
      AccountInfoString: (prop: number) => (prop === 20 ? "USD" : prop === 21 ? "Strategy Tester" : "TradePilot"),
      SetIndexBuffer: (i: number, arr: MqlArr, kind = 0) => { buffers[i] = { arr, kind }; return true; },
      PlotIndexSetInteger: (i: number, prop: number, a: number, b?: number) => {
        const p = plots[i]; if (!p) return false;
        const v = b === undefined ? a : b;
        if (prop === 2) p.drawBegin = v; else if (prop === 3) p.type = v; else if (prop === 7) p.width = v; else if (prop === 6) p.style = v;
        else if (prop === 9 && (b === undefined || a === 0)) p.color = v; else if (prop === 5) p.shift = v;
        return true;
      },
      PlotIndexSetDouble: (i: number, prop: number, v: number) => { if (plots[i] && prop === 10) plots[i].empty = v; return !!plots[i]; },
      PlotIndexSetString: (i: number, prop: number, v: string) => { if (plots[i] && prop === 11) plots[i].label = v; return !!plots[i]; },
      PlotIndexGetInteger: (i: number, prop: number) => { const p = plots[i]; return !p ? 0 : prop === 2 ? p.drawBegin : prop === 3 ? p.type : prop === 7 ? p.width : prop === 9 ? p.color : 0; },
      IndicatorSetString: (prop: number, a: any, b?: any) => { if (prop === 0) shortName = String(a); else if (prop === 9) { const l = levels[a]; if (l) l.text = String(b); } return true; },
      IndicatorSetInteger: (prop: number, a: number, b?: number) => {
        if (prop === 2) { while (levels.length < a) levels.push({ value: 0 }); levels.length = a; }
        else if (prop === 4 || prop === 5 || prop === 6) { const target = b === undefined ? levels : [levels[a]]; for (const l of target) if (l) { const v = b === undefined ? a : b; if (prop === 4) l.color = v; else if (prop === 5) l.style = v; else l.width = v; } }
        return true;
      },
      IndicatorSetDouble: (prop: number, a: number, b?: number) => { if (prop === 3) { const i = b === undefined ? 0 : a; while (levels.length <= i) levels.push({ value: 0 }); levels[i].value = b === undefined ? a : b; } return true; },
      IndicatorRelease: () => true,
      iMA: (s: any, tf: any, p: number, shift: number, method: number, price: number) => { checkSeries(s, tf); return addHandle([TA.ma(applied(price), p, method)], shift); },
      iRSI: (s: any, tf: any, p: number, price: number) => { checkSeries(s, tf); return addHandle([TA.rsi(applied(price), p)]); },
      iATR: (s: any, tf: any, p: number) => { checkSeries(s, tf); return addHandle([TA.atr(col.high, col.low, col.close, p)]); },
      iBands: (s: any, tf: any, p: number, shift: number, dev: number, price: number) => {
        checkSeries(s, tf);
        const src = applied(price), mid = TA.sma(src, p), sd = TA.stdev(src, p, mid);
        return addHandle([mid, mid.map((m, i) => m + dev * sd[i]), mid.map((m, i) => m - dev * sd[i])], shift);
      },
      iStdDev: (s: any, tf: any, p: number, shift: number, method: number, price: number) => { checkSeries(s, tf); const src = applied(price); return addHandle([TA.stdev(src, p, TA.ma(src, p, method))], shift); },
      iMACD: (s: any, tf: any, fast: number, slow: number, signal: number, price: number) => {
        checkSeries(s, tf);
        const src = applied(price), f = TA.ema(src, fast), sl = TA.ema(src, slow);
        const main = f.map((v, i) => v - sl[i]);
        return addHandle([main, TA.sma(main, signal)]);
      },
      iStochastic: (s: any, tf: any, k: number, d: number, slowing: number, method: number) => { checkSeries(s, tf); const st = TA.stochastic(col.high, col.low, col.close, k, d, slowing, method); return addHandle([st.main, st.signal]); },
      iCCI: (s: any, tf: any, p: number, price: number) => { checkSeries(s, tf); return addHandle([TA.cci(applied(price), p)]); },
      iMomentum: (s: any, tf: any, p: number, price: number) => { checkSeries(s, tf); const src = applied(price); return addHandle([src.map((v, i) => (i >= p ? (v * 100) / src[i - p] : NaN))]); },
      iADX: (s: any, tf: any, p: number) => { checkSeries(s, tf); const a = TA.adx(col.high, col.low, col.close, p); return addHandle([a.adx, a.plus, a.minus]); },
      iCustom: () => { throw new MqlRuntimeError("iCustom isn't supported — paste the other indicator's code into this one"); },
      PositionsTotal: () => (sim?.position ? 1 : 0),
      PositionSelect: () => (selected = !!sim?.position),
      PositionGetTicket: (i: number) => { selected = i === 0 && !!sim?.position; return selected ? ticketOf() : 0; },
      PositionSelectByTicket: (t: number) => (selected = !!sim?.position && ticketOf() === t),
      PositionGetDouble: (prop: number) => posDouble(prop),
      PositionGetInteger: (prop: number) => posInt(prop),
      PositionGetString: (prop: number) => (!sim?.position ? "" : prop === 20 ? symbol : sim.position.id),
      PositionGetSymbol: (i: number) => (i === 0 && sim?.position ? symbol : ""),
      OrdersTotal: () => 0,
      OrderSend: (req: any, res: any) => {
        const s = needSim("OrderSend");
        let ok = false;
        if (req.m_action === 1) {
          const isBuy = req.m_type === 0;
          if (req.m_position && s.position) ok = closePos(req.m_comment);
          else ok = isBuy ? buy(req.m_volume, req.m_sl, req.m_tp, req.m_comment) : req.m_type === 1 ? sell(req.m_volume, req.m_sl, req.m_tp, req.m_comment) : pending();
        } else if (req.m_action === 6) ok = tradeDone(s.modify(req.m_sl > 0 ? req.m_sl : null, req.m_tp > 0 ? req.m_tp : null), 0);
        else ok = pending();
        if (res) Object.assign(res, { m_retcode: lastResult.retcode, m_deal: lastResult.deal, m_order: lastResult.deal, m_volume: lastResult.volume, m_price: lastResult.price, m_bid: bars[cur].close, m_ask: bars[cur].close, m_comment: lastResult.comment });
        return ok;
      },
      HistorySelect: () => true, HistoryDealsTotal: () => (sim ? sim.closedTrades * 2 : 0),
      GetLastError: () => lastError, ResetLastError: () => { lastError = 0; }, IsStopped: () => false, Sleep: () => {},
      EventSetTimer: () => { warnOnce("timer", "OnTimer isn't called here (the program runs on bars, not on a clock)"); return true; }, EventKillTimer: () => {},
      GetTickCount: () => Date.now() & 0x7fffffff, GetMicrosecondCount: () => Math.round(performance.now() * 1000),
      MQLInfoInteger: (p: number) => (p === 6 ? 1 : 0), MQLInfoString: () => "Script", TerminalInfoInteger: (p: number) => (p === 6 || p === 8 ? 1 : 0),
      ChartID: () => 0, ChartRedraw: () => {}, ChartSetInteger: () => true, ChartGetInteger: () => 0, PlaySound: () => true, SendNotification: () => true, MessageBox: () => 1,
      ObjectCreate: ignored("ObjectCreate"), ObjectDelete: ignored("ObjectDelete"), ObjectsDeleteAll: ignored("ObjectsDeleteAll"), ObjectSetInteger: ignored("ObjectSetInteger"),
      ObjectSetDouble: ignored("ObjectSetDouble"), ObjectSetString: ignored("ObjectSetString"), ObjectFind: () => -1, ObjectMove: ignored("ObjectMove"),
      ObjectGetDouble: () => 0, ObjectGetInteger: () => 0,
    };

    // eslint-disable-next-line no-new-func
    const program = new Function("$", "B", "F", compiled.js)($, B, F) as Record<string, ((...a: any[]) => any) | null>;
    result.inputs = legend;

    const asArr = (d: number[]) => { const a = new MqlArr(0, 0, false); a.d = d.slice(); return a; };
    if (program.OnInit) {
      const r = program.OnInit();
      if (r !== undefined && r !== 0) throw new MqlError(`OnInit returned ${r === 1 ? "INIT_FAILED" : r === 2 ? "INIT_PARAMETERS_INCORRECT" : r} — the program stopped`, 1, "INIT");
    }
    if (isIndicator) {
      // Buffers start empty for every bar (calculation and colour buffers at 0)
      for (const b of buffers) if (b) { const s = b.arr.series; b.arr.series = false; b.arr.d = new Array(n).fill(b.kind === 0 ? EMPTY_VALUE : 0); b.arr.series = s; }
      const onCalc = program.OnCalculate!;
      if (compiled.onCalculateParams >= 10) {
        onCalc(n, 0, asArr(col.time), asArr(col.open), asArr(col.high), asArr(col.low), asArr(col.close), asArr(col.volume), asArr(col.volume), asArr(new Array(n).fill(0)));
      } else {
        onCalc(n, 0, 0, asArr(col.close));
      }
    } else if (isEA) {
      for (let i = 0; i < n; i++) {
        cur = i;
        sim!.beginBar(i);
        program.OnTick!();
        sim!.endBar();
      }
      cur = n - 1;
      result.strategyReport = sim!.report();
      result.markers = sim!.markers;
    } else if (program.OnStart) {
      program.OnStart();
    }
    if (program.OnDeinit) program.OnDeinit(0);

    // Buffers → plots
    meta.title = shortName;
    const out: PinePlotResult[] = [];
    const fills: PineFill[] = [];
    let bi = 0;
    plots.forEach((p, k) => {
      const count = BUFFERS_PER_DRAW[p.type] ?? 1;
      const own = buffers.slice(bi, bi + count);
      bi += count;
      const series = (b: { arr: MqlArr } | undefined) => {
        if (!b) return [];
        const vals: { time: number; value: number }[] = [];
        const d = b.arr.d;
        for (let i = Math.max(0, p.drawBegin); i < n && i < d.length; i++) {
          const v = d[i];
          if (typeof v !== "number" || !Number.isFinite(v) || v === p.empty || v === EMPTY_VALUE || Math.abs(v) > 1e300) continue;
          vals.push({ time: col.time[i], value: v });
        }
        return vals;
      };
      const labels = p.label.split(";");
      const color = bgrToCss(p.color);
      if (p.type === 8 || p.type === 9 || p.type === 16 || p.type === 17) { warnOnce("candles", "DRAW_BARS / DRAW_CANDLES plots aren't drawn yet"); return; }
      if (p.type === 7 || p.type === 4 || p.type === 13) {
        const a = out.length;
        out.push({ title: labels[0] || `Plot ${k + 1}`, color, values: series(own[0]), lineWidth: p.width, style: "line", hidden: p.type === 7 });
        out.push({ title: labels[1] || `${labels[0] || `Plot ${k + 1}`} 2`, color, values: series(own[1]), lineWidth: p.width, style: "line", hidden: p.type === 7 });
        if (p.type === 7) fills.push({ a: { kind: "plot", index: a }, b: { kind: "plot", index: a + 1 }, title: labels[0] || "Fill", color: color === "transparent" ? undefined : `${color}55` });
        return;
      }
      const style = p.type === 3 || p.type === 12 ? "histogram" : p.type === 5 || p.type === 14 ? "circles" : "line";
      out.push({ title: labels[0] || `Plot ${k + 1}`, color, values: series(own[0]), lineWidth: p.width, style, hidden: p.type === 0 || color === "transparent" });
    });
    result.plots = out;
    result.fills = fills;
    const lineStyle = (s?: number) => (s === 0 ? "solid" : s === 2 ? "dotted" : "dashed");
    result.hlines = levels.filter(l => Number.isFinite(l.value)).map((l, id) => ({
      id, price: l.value, title: l.text || String(l.value),
      color: bgrToCss(l.color ?? (levelColor ? constVal(levelColor) : rgbToBgr("787B86"))),
      lineStyle: lineStyle(l.style ?? (levelStyle ? constVal(levelStyle) : 2)),
      lineWidth: l.width ?? (levelWidth ? parseInt(levelWidth, 10) || 1 : 1),
    } satisfies PineHline));
  } catch (err: any) {
    if (err instanceof MqlError) result.errors.push({ message: err.message, code: err.code, line: err.line });
    else if (err instanceof MqlRuntimeError) result.errors.push({ message: err.message, code: "RUNTIME", line: lineOf() });
    else result.errors.push({ message: `${err?.message || String(err)}`, code: "RUNTIME", line: lineOf() });
  }
  result.execMs = performance.now() - t0;
  return result;
}

export function getMql5InputsMeta(code: string): PineInputMeta[] {
  return scanMql5Inputs(code).map((i): PineInputMeta => {
    const t = i.type;
    const members = i.enumMembers || ENUM_MEMBERS[t];
    if (members) {
      return { varName: i.name, type: "string", title: i.title, group: i.group || undefined, options: members, value: members.includes(i.init) ? i.init : members[0] };
    }
    if (t === "bool") return { varName: i.name, type: "bool", title: i.title, group: i.group || undefined, value: i.init === "true" };
    if (t === "string") return { varName: i.name, type: "string", title: i.title, group: i.group || undefined, value: i.init.replace(/^"|"$/g, "") };
    if (t === "color") {
      const v = i.init in CONSTANTS ? bgrToCss(CONSTANTS[i.init] as number) : /^C'/.test(i.init) ? bgrToCss((() => { const p = i.init.slice(2, -1).split(",").map(x => parseInt(x, 10) || 0); return (p[2] << 16) | (p[1] << 8) | p[0]; })()) : "#2962ff";
      return { varName: i.name, type: "color", title: i.title, group: i.group || undefined, value: v };
    }
    if (t === "double" || t === "float") return { varName: i.name, type: "float", title: i.title, group: i.group || undefined, value: parseFloat(i.init) || 0 };
    return { varName: i.name, type: "int", title: i.title, group: i.group || undefined, value: parseInt(i.init, 10) || 0 };
  });
}

export type { MqlProperty };
