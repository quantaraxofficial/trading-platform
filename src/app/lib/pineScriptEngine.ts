import { PINE_CATALOG } from "./pineCatalog";
import * as B from "./pineBuiltins";
// A small, self-contained Pine Script (v5/v6-ish) interpreter.
// It supports the subset of the language that shows up in typical simple
// indicators/strategies: variable assignment (`=`, `:=`, `var`, typed
// declarations like `float x = ...`), `if`/`else`/`for`/`while` blocks,
// user-defined functions (single-line and multi-line `=>` bodies, including
// tuple returns like `[a, b] = f(...)`), arrays (`array.*`), the common
// `ta.*`/`math.*` built-ins, `plot`/`plotshape`/`plotchar`,
// `strategy.entry`/`strategy.close`, `log.*`, history-referencing
// (`close[1]`), and real multi-timeframe data via `request.security` /
// `request.security_lower_tf` (see runPineScriptAsync).
// It does NOT simulate actual order fills, position tracking, or equity —
// `strategy.position_size`/`strategy.equity`/`strategy.closedtrades` etc.
// return inert defaults rather than a real backtest ledger.

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PinePlotResult {
  title: string;
  color: string;
  values: { time: number; value: number }[];
  lineWidth?: number;
  style?: string;      // plot.style_* suffix: line, stepline, histogram, columns, circles, cross, area
  hidden?: boolean;    // display=display.none or color=na: kept for fill() and the data window, not drawn
}

// hline(): a horizontal level in the script's pane
export interface PineHline { id: number; price: number; title: string; color: string; lineStyle: string; lineWidth: number }

// fill(): the area between two plots or two hlines. With topValue/bottomValue it is a gradient
// from topColor (at topValue) to bottomColor (at bottomValue), clipped to that range.
export interface PineFill {
  a: { kind: "plot" | "hline"; index: number };
  b: { kind: "plot" | "hline"; index: number };
  title: string;
  color?: string;
  topValue?: number; bottomValue?: number; topColor?: string; bottomColor?: string;
  colors?: Record<number, string>; // per-bar color (by bar time) when the script's color changes bar to bar
  hidden?: boolean;
}

export interface PineMarker {
  time: number;
  position: "aboveBar" | "belowBar" | "atPriceTop" | "atPriceBottom" | "atPriceMiddle";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
  price?: number;      // location.absolute: drawn at this value
  textColor?: string;
}

export interface PineScriptError {
  message: string;
  code: string;
  line: number;
}

export interface PineTableCell {
  text: string;
  textColor?: string;
  bgcolor?: string;
}

export interface PineTableResult {
  position: string; // e.g. "top_right", "middle_center" — the suffix of table.new()'s position.* argument
  columns: number;
  rows: number;
  bgcolor?: string;
  borderColor?: string;
  cells: (PineTableCell | null)[][]; // [row][col]
}

export interface PineStrategyTrade {
  num: number;
  type: "Long" | "Short";
  entryTime: number; entryPrice: number;
  exitTime: number; exitPrice: number;
  // The orders' names as the List of trades shows them ("Signal" column): the entry's id, and the
  // exit's (a strategy.exit id, "Close entry(s) order <id>", "Close position order"; "Open" while open)
  entrySignal: string; exitSignal: string;
  entryBar: number; exitBar: number; // bar indices, for "Duration (bars)"
  commission: number;
  qty: number;
  netPnl: number;
  returnPct: number;
  cumulativePnl: number;
  favorableExcursion: number; // best unrealized P&L reached while the trade was open (>= 0)
  adverseExcursion: number;   // worst unrealized P&L reached while the trade was open (<= 0)
}

export interface PineStrategyReport {
  initialCapital: number;
  netProfit: number; netProfitPct: number;
  maxDrawdown: number; maxDrawdownPct: number;
  profitableCount: number; totalCount: number; profitablePct: number;
  profitFactor: number;
  grossProfit: number; grossProfitPct: number;
  grossLoss: number; grossLossPct: number;
  longPnl: number; shortPnl: number;
  winCount: number; lossCount: number; breakevenCount: number;
  trades: PineStrategyTrade[];
  // The position still open when the data ends (TradingView lists it as "Open" and keeps it out of
  // the closed-trade statistics); its P&L is the unrealized one at the last bar
  openTrade: PineStrategyTrade | null;
  equityCurve: { time: number; equity: number; close: number }[];
}

export interface PineRunResult {
  plots: PinePlotResult[];
  hlines?: PineHline[];
  fills?: PineFill[];
  drawings?: PineDrawing[];
  markers: PineMarker[];
  tables: PineTableResult[];
  strategyReport: PineStrategyReport | null;
  inputs: string[]; // non-boolean input values in declaration order, for the on-chart legend line
  logs: string[];
  warnings: string[];
  errors: PineScriptError[];
  meta: { title: string; shortTitle?: string; isStrategy: boolean; overlay: boolean; initialCapital: number; pyramiding?: number; defaultQtyValue?: number; defaultQtyType?: string; precision?: number; maxLabels?: number; maxLines?: number; maxBoxes?: number };
  execMs: number;
  // Profiler mode: time spent on each script line (inclusive of the lines a block contains) and
  // how many times it ran
  profile?: { line: number; ms: number; count: number }[];
}

// Pine's color.* constants, with TradingView's values
const COLOR_NAMES: Record<string, string> = {
  red: "#F23645", green: "#089981", blue: "#2962FF", orange: "#FF9800",
  purple: "#9C27B0", yellow: "#FDD835", lime: "#00E676", aqua: "#00BCD4",
  fuchsia: "#E040FB", gray: "#787B86", white: "#FFFFFF", black: "#363A45",
  teal: "#00897B", maroon: "#880E4F", navy: "#311B92", olive: "#808000", silver: "#B2B5BE",
};

const PALETTE = ["#2962ff", "#ef5350", "#26a69a", "#ff9800", "#9c27b0", "#00bcd4"];

export class PineError extends Error {
  code: string;
  line?: number;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------- tokenizer

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "and" | "or" | "not" | "eof" }
  | { t: "==" | "!=" | "<=" | ">=" | ":=" | "(" | ")" | "[" | "]" | "," | "+" | "-" | "*" | "/" | "%" | "?" | ":" | "<" | ">" | "=" };

function tokenize(s: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1, str = "";
      while (j < n && s[j] !== quote) {
        if (s[j] === "\\") { str += s[j + 1]; j += 2; } else { str += s[j]; j++; }
      }
      toks.push({ t: "str", v: str });
      i = j + 1;
      continue;
    }
    if (c === "#") {
      let j = i + 1;
      while (j < n && /[0-9a-fA-F]/.test(s[j])) j++;
      toks.push({ t: "str", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] || ""))) {
      let j = i;
      while (j < n && /[0-9.]/.test(s[j])) j++;
      toks.push({ t: "num", v: parseFloat(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_.]/.test(s[j])) j++;
      const word = s.slice(i, j);
      if (word === "and") toks.push({ t: "and" });
      else if (word === "or") toks.push({ t: "or" });
      else if (word === "not") toks.push({ t: "not" });
      else toks.push({ t: "id", v: word });
      i = j;
      // `array.new<float>(…)`, `matrix.new<myType>()`: the type argument only matters to the compiler
      if (/\.new$/.test(word) && s[i] === "<") {
        const g = s.slice(i).match(/^<[\w.<>, \[\]]*>(?=\s*\()/);
        if (g) i += g[0].length;
      }
      continue;
    }
    // `.method()` / `.field` after a call or an index: `m.row(0).last().price`
    if (c === "." && /[a-zA-Z_]/.test(s[i + 1] || "") && toks.length && (toks[toks.length - 1].t === ")" || toks[toks.length - 1].t === "]")) {
      toks.push({ t: "." as any });
      i++;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === ":=") {
      toks.push({ t: two as any });
      i += 2;
      continue;
    }
    if ("()[],+-*/%?:<>=".includes(c)) {
      toks.push({ t: c as any });
      i++;
      continue;
    }
    i++; // skip unknown char rather than hard-fail the whole script
  }
  toks.push({ t: "eof" });
  return toks;
}

// -------------------------------------------------------------------- AST

type Expr =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "ident"; name: string }
  | { type: "neg"; expr: Expr }
  | { type: "not"; expr: Expr }
  | { type: "or"; left: Expr; right: Expr }
  | { type: "and"; left: Expr; right: Expr }
  | { type: "cmp"; op: string; left: Expr; right: Expr }
  | { type: "arith"; op: string; left: Expr; right: Expr }
  | { type: "ternary"; cond: Expr; t: Expr; f: Expr }
  | { type: "histref"; base: Expr; offset: Expr; id: number }
  | { type: "call"; name: string; args: Expr[]; namedArgs: Record<string, Expr>; id: number }
  | { type: "tuple"; items: Expr[] }
  // switch [subject] / arms `value => body` (or `cond => body` without a subject); `=> body` is the default
  | { type: "switch"; subject: Expr | null; arms: { cond: Expr | null; body: Stmt[] }[] }
  // `expr.method(…)` / `expr.field` on the result of an expression; `path` may hold several names
  | { type: "mcall"; recv: Expr; name: string; args: Expr[]; namedArgs: Record<string, Expr>; id: number }
  | { type: "field"; base: Expr; path: string }
  // An already-computed value (a method's receiver passed on as its first argument)
  | { type: "value"; value: any };

interface FuncParam { name: string; default: Expr | null; type?: string }
interface FunctionDef { name: string; params: FuncParam[]; body: Stmt[]; isMethod?: boolean }
// A user-defined type: `type Name` and its fields
interface TypeDef { name: string; fields: { name: string; default: Expr | null }[] }

// Real (not simulated-in-name-only) strategy state: pending orders get
// checked against each subsequent bar's actual OHLC range for a fill,
// exactly like process_orders_on_close=true — a limit fills when the bar's
// range crosses it, a market order (no limit given) fills at that bar's
// open. One open position at a time (matches pyramiding=0, the default and
// the only mode these scripts use).
interface PendingEntryOrder { direction: "long" | "short"; qty: number; limit: number | null; stop: number | null }
interface OpenPosition {
  direction: "long" | "short"; qty: number; entryPrice: number; entryTime: number; id: string; entryBar: number;
  // Running best/worst unrealized P&L reached while this position has been
  // open — Maximum Favorable/Adverse Excursion, updated every bar in
  // processStrategyOrders and frozen onto the trade record when it closes.
  maxFavorable: number;
  maxAdverse: number;
}
interface ClosedTrade {
  num: number; type: "Long" | "Short";
  entryTime: number; entryPrice: number; exitTime: number; exitPrice: number;
  entrySignal: string; exitSignal: string; entryBar: number; exitBar: number; commission: number;
  qty: number; netPnl: number; returnPct: number;
  favorableExcursion: number; adverseExcursion: number;
}
interface StrategyState {
  position: OpenPosition | null;
  pendingEntries: Record<string, PendingEntryOrder>;
  pendingExit: { id: string; stop: number | null; limit: number | null } | null;
  closedTrades: ClosedTrade[];
  netProfit: number;
  peakEquity: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  equityCurve: { time: number; equity: number; close: number }[];
}

function makeStrategyState(): StrategyState {
  return {
    position: null, pendingEntries: {}, pendingExit: null, closedTrades: [],
    netProfit: 0, peakEquity: 0, maxDrawdown: 0, maxDrawdownPct: 0, equityCurve: [],
  };
}

function closeStrategyPosition(ctx: Ctx, exitPrice: number, exitTime: number, exitSignal: string) {
  const st = ctx.strategyState;
  const pos = st.position;
  if (!pos) return;
  const sign = pos.direction === "long" ? 1 : -1;
  const netPnl = sign * (exitPrice - pos.entryPrice) * pos.qty;
  const notional = pos.entryPrice * pos.qty;
  st.closedTrades.push({
    num: st.closedTrades.length + 1,
    type: pos.direction === "long" ? "Long" : "Short",
    entryTime: pos.entryTime, entryPrice: pos.entryPrice,
    exitTime, exitPrice, qty: pos.qty, netPnl,
    entrySignal: pos.id, exitSignal, entryBar: pos.entryBar, exitBar: ctx.barIndex, commission: 0,
    returnPct: notional > 0 ? (netPnl / notional) * 100 : 0,
    favorableExcursion: Math.max(pos.maxFavorable, netPnl, 0),
    adverseExcursion: Math.min(pos.maxAdverse, netPnl, 0),
  });
  st.netProfit += netPnl;
  st.position = null;
  st.pendingExit = null;
}

// A price-based order fills at its exact level when the bar's H/L range
// simply crosses it mid-bar. But when the bar GAPS past the level entirely —
// the whole bar trades on the far side of it, e.g. an overnight gap through
// a limit or stop — the market never actually traded at that exact price.
// TradingView's broker emulator documents this explicitly: "If the market
// price crosses a price-based order's level during the gap between one
// bar's closing time and the next bar's opening time... the emulator fills
// the order at the opening price of the bar following the gap" rather than
// at the order's own level. Treating every touch as a fill-at-level (the
// previous behavior here) silently drops any order whose level sits outside
// the bar's H/L range even though it gapped straight through — which is
// exactly the kind of miss that shows up as fewer trades than TradingView.
function longExitFillPrice(bar: { open: number; high: number; low: number }, stop: number | null, limit: number | null): number | null {
  // Pessimistic default (no bar magnifier): when both a stop and a limit
  // could have triggered within the same bar, TradingView assumes the
  // stop-loss is the one that hit first — hence checking stop before limit.
  if (stop !== null && bar.low <= stop) return bar.open <= stop ? bar.open : stop;
  if (limit !== null && bar.high >= limit) return bar.open >= limit ? bar.open : limit;
  return null;
}
function shortExitFillPrice(bar: { open: number; high: number; low: number }, stop: number | null, limit: number | null): number | null {
  if (stop !== null && bar.high >= stop) return bar.open >= stop ? bar.open : stop;
  if (limit !== null && bar.low <= limit) return bar.open <= limit ? bar.open : limit;
  return null;
}

// Runs at the START of each bar, before that bar's own script statements —
// so an order placed by the PREVIOUS bar's logic gets checked against this
// bar's real OHLC range for a fill, exactly like process_orders_on_close=true.
function processStrategyOrders(ctx: Ctx) {
  const st = ctx.strategyState;
  const bar = ctx.bar;

  // "Testing period" end: TradingView force-flattens any still-open position
  // the moment the selected window closes, rather than letting it ride on
  // into bars that are otherwise still being calculated for warm-up.
  if (ctx.backtestTo !== undefined && bar.time > ctx.backtestTo) {
    if (st.position) closeStrategyPosition(ctx, bar.open, bar.time, "Close position order");
    return;
  }

  if (st.position && st.pendingExit) {
    const { stop, limit } = st.pendingExit;
    const exitPrice = st.position.direction === "long"
      ? longExitFillPrice(bar, stop, limit)
      : shortExitFillPrice(bar, stop, limit);
    if (exitPrice !== null) closeStrategyPosition(ctx, exitPrice, bar.time, st.pendingExit.id);
  }

  // Entries: with no position, the first order to fill opens one. While a position is open, an
  // entry the other way reverses it (TradingView's strategy.entry: the order closes the position
  // and opens the opposite one), and one the same way is ignored (pyramiding 0)
  {
    for (const id of Object.keys(st.pendingEntries)) {
      const order = st.pendingEntries[id];
      if (st.position && st.position.direction === order.direction) { delete st.pendingEntries[id]; continue; }
      let fillPrice: number | null = null;
      if (order.limit !== null) {
        // Buy-limit fills at-or-below its level; sell-limit at-or-above.
        if (order.direction === "long") {
          if (bar.low <= order.limit) fillPrice = bar.open <= order.limit ? bar.open : order.limit;
        } else if (bar.high >= order.limit) {
          fillPrice = bar.open >= order.limit ? bar.open : order.limit;
        }
      } else if (order.stop !== null) {
        // Stop-entry (buy-stop / sell-stop): triggers on a breakout through the stop level.
        if (order.direction === "long") {
          if (bar.high >= order.stop) fillPrice = bar.open >= order.stop ? bar.open : order.stop;
        } else if (bar.low <= order.stop) {
          fillPrice = bar.open <= order.stop ? bar.open : order.stop;
        }
      } else {
        fillPrice = bar.open; // a plain market order fills at this bar's open
      }
      if (fillPrice !== null) {
        if (st.position) closeStrategyPosition(ctx, fillPrice, bar.time, id);
        st.position = { direction: order.direction, qty: order.qty, entryPrice: fillPrice, entryTime: bar.time, id, entryBar: ctx.barIndex, maxFavorable: 0, maxAdverse: 0 };
        st.pendingEntries = {}; // pyramiding=0: at most one position at a time
        break;
      }
    }
  }

  const unrealized = st.position
    ? (st.position.direction === "long" ? bar.close - st.position.entryPrice : st.position.entryPrice - bar.close) * st.position.qty
    : 0;
  if (st.position) {
    st.position.maxFavorable = Math.max(st.position.maxFavorable, unrealized);
    st.position.maxAdverse = Math.min(st.position.maxAdverse, unrealized);
  }
  const equity = ctx.strategyInitialCapital + st.netProfit + unrealized;
  st.equityCurve.push({ time: bar.time, equity, close: bar.close });
  st.peakEquity = Math.max(st.peakEquity, equity);
  const dd = st.peakEquity - equity;
  st.maxDrawdown = Math.max(st.maxDrawdown, dd);
  if (st.peakEquity > 0) st.maxDrawdownPct = Math.max(st.maxDrawdownPct, (dd / st.peakEquity) * 100);
}

function buildStrategyReport(ctx: Ctx): PineStrategyReport {
  const st = ctx.strategyState;
  const trades = st.closedTrades;
  // The equity curve is recorded across the FULL bar history (needed so
  // maxDrawdown/peakEquity are measured correctly against a real running
  // peak) but everything before the selected "Testing period" is just a
  // flat line at initial capital — trim it from what actually gets charted.
  if (ctx.backtestFrom !== undefined) {
    st.equityCurve = st.equityCurve.filter((p) => p.time >= ctx.backtestFrom!);
  }
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const breakevens = trades.filter((t) => t.netPnl === 0);
  const grossProfit = wins.reduce((a, t) => a + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.netPnl, 0));
  const longPnl = trades.filter((t) => t.type === "Long").reduce((a, t) => a + t.netPnl, 0);
  const shortPnl = trades.filter((t) => t.type === "Short").reduce((a, t) => a + t.netPnl, 0);
  const cap = ctx.strategyInitialCapital || 1;
  let running = 0;
  const tradesWithCumulative: PineStrategyTrade[] = trades.map((t) => {
    running += t.netPnl;
    return { ...t, cumulativePnl: running };
  });
  let openTrade: PineStrategyTrade | null = null;
  const pos = st.position;
  if (pos && ctx.bars.length) {
    const last = ctx.bars[ctx.bars.length - 1];
    const sign = pos.direction === "long" ? 1 : -1;
    const pnl = sign * (last.close - pos.entryPrice) * pos.qty;
    const notional = pos.entryPrice * pos.qty;
    openTrade = {
      num: trades.length + 1, type: pos.direction === "long" ? "Long" : "Short",
      entryTime: pos.entryTime, entryPrice: pos.entryPrice, exitTime: last.time, exitPrice: last.close,
      entrySignal: pos.id, exitSignal: "Open", entryBar: pos.entryBar, exitBar: ctx.bars.length - 1, commission: 0,
      qty: pos.qty, netPnl: pnl, returnPct: notional > 0 ? (pnl / notional) * 100 : 0, cumulativePnl: running + pnl,
      favorableExcursion: Math.max(pos.maxFavorable, pnl, 0), adverseExcursion: Math.min(pos.maxAdverse, pnl, 0),
    };
  }
  return {
    initialCapital: ctx.strategyInitialCapital,
    netProfit: st.netProfit, netProfitPct: (st.netProfit / cap) * 100,
    maxDrawdown: st.maxDrawdown, maxDrawdownPct: st.maxDrawdownPct,
    profitableCount: wins.length, totalCount: trades.length,
    profitablePct: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
    grossProfit, grossProfitPct: (grossProfit / cap) * 100,
    grossLoss, grossLossPct: (grossLoss / cap) * 100,
    longPnl, shortPnl,
    winCount: wins.length, lossCount: losses.length, breakevenCount: breakevens.length,
    trades: tradesWithCumulative,
    openTrade,
    equityCurve: st.equityCurve,
  };
}

type Stmt =
  | { type: "if"; cond: Expr; body: Stmt[]; elseBody: Stmt[] | null; line: number }
  | { type: "for"; varName: string; from: Expr; to: Expr; step: Expr | null; body: Stmt[]; line: number }
  | { type: "while"; cond: Expr; body: Stmt[]; line: number }
  | { type: "assign"; name: string; expr: Expr; isVarDecl: boolean; line: number }
  | { type: "tupleAssign"; names: string[]; expr: Expr; line: number }
  | { type: "funcdef"; def: FunctionDef; line: number }
  | { type: "expr"; expr: Expr; line: number }
  | { type: "typedef"; def: TypeDef; line: number }
  // `obj.field := value` (and `+=` …)
  | { type: "fieldAssign"; target: string; expr: Expr; line: number }
  // `for x in arr` / `for [i, x] in arr`
  | { type: "forin"; idxVar: string | null; valVar: string; expr: Expr; body: Stmt[]; line: number };

function parseExpression(text: string, nextId: () => number): Expr {
  const toks = tokenize(text);
  let pos = 0;
  const peek = () => toks[pos];
  const consume = () => toks[pos++];
  const expect = (t: string) => {
    if (peek().t !== t) throw new PineError(`Syntax error: expected '${t}'`, "CE10002");
    return consume();
  };

  function parseTernary(): Expr {
    const left = parseOr();
    if (peek().t === "?") {
      consume();
      const t = parseTernary();
      expect(":");
      const f = parseTernary();
      return { type: "ternary", cond: left, t, f };
    }
    return left;
  }
  function parseOr(): Expr {
    let left = parseAnd();
    while (peek().t === "or") { consume(); left = { type: "or", left, right: parseAnd() }; }
    return left;
  }
  function parseAnd(): Expr {
    let left = parseCmp();
    while (peek().t === "and") { consume(); left = { type: "and", left, right: parseCmp() }; }
    return left;
  }
  function parseCmp(): Expr {
    let left = parseAdd();
    while (["==", "!=", "<", ">", "<=", ">="].includes(peek().t)) {
      const op = consume().t as string;
      left = { type: "cmp", op, left, right: parseAdd() };
    }
    return left;
  }
  function parseAdd(): Expr {
    let left = parseMul();
    while (peek().t === "+" || peek().t === "-") {
      const op = consume().t as string;
      left = { type: "arith", op, left, right: parseMul() };
    }
    return left;
  }
  function parseMul(): Expr {
    let left = parseUnary();
    while (peek().t === "*" || peek().t === "/" || peek().t === "%") {
      const op = consume().t as string;
      left = { type: "arith", op, left, right: parseUnary() };
    }
    return left;
  }
  function parseUnary(): Expr {
    if (peek().t === "-") { consume(); return { type: "neg", expr: parseUnary() }; }
    if (peek().t === "not") { consume(); return { type: "not", expr: parseUnary() }; }
    return parsePostfix();
  }
  function parseArgs(): { args: Expr[]; namedArgs: Record<string, Expr> } {
    const args: Expr[] = [];
    const namedArgs: Record<string, Expr> = {};
    if (peek().t !== ")") {
      while (true) {
        if (peek().t === "id" && toks[pos + 1] && toks[pos + 1].t === "=") {
          const key = (consume() as any).v as string;
          consume(); // '='
          namedArgs[key] = parseTernary();
        } else args.push(parseTernary());
        if (peek().t === ",") { consume(); continue; }
        break;
      }
    }
    expect(")");
    return { args, namedArgs };
  }
  function parsePostfix(): Expr {
    let node = parsePrimary();
    while (peek().t === "[" || (peek().t as string) === ".") {
      if (consume().t === "[") {
        const idx = parseTernary();
        expect("]");
        node = { type: "histref", base: node, offset: idx, id: nextId() };
        continue;
      }
      const nameTok = consume();
      if (nameTok.t !== "id") throw new PineError("Syntax error: expected a name after '.'", "CE10001");
      const name = (nameTok as any).v as string;
      if (peek().t === "(") { consume(); const { args, namedArgs } = parseArgs(); node = { type: "mcall", recv: node, name, args, namedArgs, id: nextId() }; }
      else node = { type: "field", base: node, path: name };
    }
    return node;
  }
  function parsePrimary(): Expr {
    const tok = peek();
    if (tok.t === "num") { consume(); return { type: "num", value: (tok as any).v }; }
    if (tok.t === "str") { consume(); return { type: "str", value: (tok as any).v }; }
    if (tok.t === "(") {
      consume();
      const e = parseTernary();
      expect(")");
      return e;
    }
    if (tok.t === "id") {
      consume();
      const name = (tok as any).v as string;
      if (peek().t === "(") {
        consume();
        const args: Expr[] = [];
        const namedArgs: Record<string, Expr> = {};
        if (peek().t !== ")") {
          while (true) {
            if (peek().t === "id" && toks[pos + 1] && toks[pos + 1].t === "=") {
              const key = (consume() as any).v as string;
              consume(); // '='
              namedArgs[key] = parseTernary();
            } else {
              args.push(parseTernary());
            }
            if (peek().t === ",") { consume(); continue; }
            break;
          }
        }
        expect(")");
        return { type: "call", name, args, namedArgs, id: nextId() };
      }
      return { type: "ident", name };
    }
    if (tok.t === "[") {
      // Only appears as a bare tuple literal — a user-defined function's
      // trailing `[a, b, c]` return statement. `close[1]`-style history
      // indexing is handled separately, as a postfix on an already-parsed
      // primary (see parsePostfix), so it never reaches here.
      consume();
      const items: Expr[] = [];
      if (peek().t !== "]") {
        while (true) {
          items.push(parseTernary());
          if (peek().t === ",") { consume(); continue; }
          break;
        }
      }
      expect("]");
      return { type: "tuple", items };
    }
    throw new PineError(`Syntax error at '${text.trim()}'`, "CE10001");
  }

  const result = parseTernary();
  if (peek().t !== "eof") {
    if (peek().t === ")") throw new PineError("Extra closing parenthesis", "CE10016");
    throw new PineError(`Syntax error: unexpected token near '${text.trim()}'`, "CE10001");
  }
  return result;
}

interface Line { indent: number; text: string; lineNo: number }

function stripComment(raw: string): string {
  let inStr: string | null = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "/" && raw[i + 1] === "/") return raw.slice(0, i);
  }
  return raw;
}

function parseMeta(text: string, meta: PineRunResult["meta"]) {
  meta.isStrategy = /^strategy\s*\(/.test(text);
  // indicator("Name", ...) or indicator(title="Name", shorttitle="RSI", ...)
  const titleMatch = text.match(/\(\s*"((?:[^"\\]|\\.)*)"/) || text.match(/[(,]\s*title\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (titleMatch) meta.title = titleMatch[1];
  const shortMatch = text.match(/shorttitle\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (shortMatch) meta.shortTitle = shortMatch[1];
  // Pine's default is overlay=false: the script gets its own pane
  const overlayMatch = text.match(/overlay\s*=\s*(true|false)/);
  meta.overlay = overlayMatch ? overlayMatch[1] === "true" : false;
  const precisionMatch = text.match(/[(,]\s*precision\s*=\s*(\d+)/);
  if (precisionMatch) meta.precision = parseInt(precisionMatch[1], 10);
  const count = (re: RegExp) => { const m = text.match(re); return m ? parseInt(m[1], 10) : undefined; };
  meta.maxLabels = count(/max_labels_count\s*=\s*(\d+)/);
  meta.maxLines = count(/max_lines_count\s*=\s*(\d+)/);
  meta.maxBoxes = count(/max_boxes_count\s*=\s*(\d+)/);
  const capMatch = text.match(/initial_capital\s*=\s*(-?[0-9.]+)/);
  if (capMatch) meta.initialCapital = parseFloat(capMatch[1]);
  const pyramidingMatch = text.match(/pyramiding\s*=\s*([0-9]+)/);
  if (pyramidingMatch) meta.pyramiding = parseInt(pyramidingMatch[1], 10);
  const qtyMatch = text.match(/default_qty_value\s*=\s*(-?[0-9.]+)/);
  if (qtyMatch) meta.defaultQtyValue = parseFloat(qtyMatch[1]);
  const qtyTypeMatch = text.match(/default_qty_type\s*=\s*strategy\.(\w+)/);
  if (qtyTypeMatch) meta.defaultQtyType = qtyTypeMatch[1];
}

// Pine lets a function call's argument list span multiple physical lines
// (a trailing comma or an unclosed paren continues the statement). This
// tracks paren/bracket depth — ignoring anything inside string literals —
// and joins continuation lines into one logical line before they're handed
// to the statement parser, which otherwise only ever sees one line at a time.
function bracketDelta(s: string): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
  }
  return depth;
}

function mergeContinuationLines(rawLines: string[]): { text: string; indentRaw: string; lineNo: number }[] {
  const out: { text: string; indentRaw: string; lineNo: number }[] = [];
  let depth = 0;
  let buffer = "";
  let bufferIndentRaw = "";
  let bufferLineNo = -1;
  for (let ln = 0; ln < rawLines.length; ln++) {
    const stripped = stripComment(rawLines[ln]);
    if (depth === 0) {
      if (!stripped.trim()) continue;
      buffer = stripped;
      bufferIndentRaw = stripped;
      bufferLineNo = ln + 1;
    } else {
      buffer += " " + stripped.trim();
    }
    depth += bracketDelta(stripped);
    if (depth <= 0) {
      out.push({ text: buffer, indentRaw: bufferIndentRaw, lineNo: bufferLineNo });
      buffer = "";
      depth = 0; // guard against malformed/unbalanced brackets going negative
    }
  }
  if (buffer.trim()) out.push({ text: buffer, indentRaw: bufferIndentRaw, lineNo: bufferLineNo });
  return out;
}

// Matches a user-defined function DECLARATION: `name(params) => ...`.
// Distinguished from an ordinary call statement (e.g. `plot(close)`) by
// requiring '=>' immediately after the matching close-paren — an ordinary
// call never has that, so this never misfires on one.
function matchFuncDecl(text: string): { name: string; paramsText: string; rest: string } | null {
  const head = text.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*\(/);
  if (!head) return null;
  let i = head[0].length;
  let depth = 1;
  let inStr: string | null = null;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (inStr) { if (c === "\\") { i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; i++; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    i++;
  }
  if (depth !== 0) return null;
  const paramsText = text.slice(head[0].length, i - 1);
  const restRaw = text.slice(i).trim();
  if (!restRaw.startsWith("=>")) return null;
  return { name: head[1], paramsText, rest: restRaw.slice(2).trim() };
}

function parseParams(paramsText: string, nextId: () => number): FuncParam[] {
  const trimmed = paramsText.trim();
  if (!trimmed) return [];
  return splitTopLevel(trimmed).map((chunk) => {
    // `simple bool flag = true`, `pivotGraphic g`, `array<float> xs`: qualifiers and the type go,
    // the type (its last word) is kept for method overloads
    const m = chunk.trim().match(/^((?:[a-zA-Z_][\w.<>,\[\]]*\s+)*)([a-zA-Z_]\w*)\s*(?:=\s*([\s\S]+))?$/);
    if (!m) return { name: chunk.trim(), default: null };
    const words = m[1].trim().split(/\s+/).filter(Boolean).filter(w => !/^(simple|series|const)$/.test(w));
    return { name: m[2], default: m[3] ? parseExpression(m[3], nextId) : null, type: words[words.length - 1] };
  });
}

// Splits on commas outside brackets and strings
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0, inStr: string | null = null, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "(" || c === "[" || c === "<") depth++;
    else if (c === ")" || c === "]" || c === ">") depth--;
    else if (c === "," && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out;
}

// Splits `for i = <from> to <to> [by <step>]` into its pieces, honoring
// paren/bracket depth and string literals so a nested call in <from>/<to>
// (e.g. `array.size(flv) - 1`) can't be mistaken for the "to"/"by" keyword.
function splitForHeader(text: string): { varName: string; fromText: string; toText: string; byText: string | null } | null {
  const m = text.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([\s\S]*)$/);
  if (!m) return null;
  const rest = m[2];
  let depth = 0, inStr: string | null = null, toIdx = -1, byIdx = -1;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (depth === 0) {
      if (toIdx === -1 && rest.slice(i, i + 4) === " to ") toIdx = i;
      else if (toIdx !== -1 && byIdx === -1 && rest.slice(i, i + 4) === " by ") byIdx = i;
    }
  }
  if (toIdx === -1) return null;
  return {
    varName: m[1],
    fromText: rest.slice(0, toIdx),
    toText: byIdx !== -1 ? rest.slice(toIdx + 4, byIdx) : rest.slice(toIdx + 4),
    byText: byIdx !== -1 ? rest.slice(byIdx + 4) : null,
  };
}

// Pine also allows a statement to continue onto following lines purely by
// indentation, with no unbalanced bracket in sight — e.g. a ternary chain
// split one branch per line. Since only if/for/while/a function declaration
// can legitimately introduce a MORE-indented child block, any other line
// followed by deeper indentation must be a continuation of it, never a
// nested body — so it's always safe to fold such lines back together here,
// before block structure is parsed.
function startsBlock(text: string): boolean {
  return /^if\b/.test(text) || /^else\b/.test(text) || /^while\b/.test(text) || splitForHeader(text) !== null || matchFuncDecl(text) !== null
    || switchHead(text) !== null || armSplit(text) !== null
    || /^(export\s+)?(type|method)\s/.test(text) || /^for\s.*\sin\s/.test(text);
}

// `switch x`, `y = switch x`, `var float y = switch`: the text before `switch`, and its subject
function switchHead(text: string): { prefix: string; subject: string } | null {
  const m = text.match(/^((?:var(?:ip)?\s+)?(?:[a-zA-Z_][a-zA-Z0-9_.<>]*\s+)?(?:[a-zA-Z_][a-zA-Z0-9_]*|\[[\w\s,]+\])\s*(?::=|=)\s*)?switch\b\s*(.*)$/);
  if (!m) return null;
  return { prefix: m[1] || "", subject: m[2].trim() };
}

// A switch arm `cond => body`, split at its top-level `=>` (not one inside brackets or a string).
// `name(params) => …` is a function declaration, not an arm.
function armSplit(text: string): { cond: string; body: string } | null {
  if (matchFuncDecl(text)) return null;
  let depth = 0, inStr: string | null = null;
  for (let i = 0; i < text.length - 1; i++) {
    const c = text[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && c === "=" && text[i + 1] === ">") return { cond: text.slice(0, i).trim(), body: text.slice(i + 2).trim() };
  }
  return null;
}

function mergeIndentContinuations(lines: Line[]): Line[] {
  const out: Line[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    let text = cur.text;
    let j = i + 1;
    if (!startsBlock(cur.text)) {
      while (j < lines.length && lines[j].indent > cur.indent) {
        text += " " + lines[j].text;
        j++;
      }
    }
    out.push({ indent: cur.indent, text, lineNo: cur.lineNo });
    i = j;
  }
  return out;
}

function withLine<T>(lineNo: number, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof PineError && err.line === undefined) err.line = lineNo;
    throw err;
  }
}

// A Pine type keyword prefixing a declaration, e.g. `float rng = h - l` or
// `array<float> cL = array.new_float()`. Purely a type annotation to this
// dynamically-typed interpreter, so it's stripped before the usual
// name/op/rhs match. The lookahead keeps it from ever eating a variable
// that's merely named after a type keyword (nothing follows "color" in
// `color = get_color()` but whitespace then '=', which the lookahead rejects).
const TYPE_PREFIX_RE = /^(int|float|bool|string|color|line|label|box|table|linefill|polyline|array<[a-zA-Z_][a-zA-Z0-9_.]*>|matrix<[a-zA-Z_][a-zA-Z0-9_.]*>)\s+(?=[a-zA-Z_])/;

// The script's own type names (`type pivotGraphic`), so `pivotGraphic g = …` reads as a declaration
let udtNames = new Set<string>();

// Removes a declaration's qualifiers and type: `series float x = …`, `myType t = …`, `chart.point p = …`
function stripTypePrefix(text: string): string {
  let t = text.replace(/^(?:simple|series|const)\s+/, "");
  t = t.replace(TYPE_PREFIX_RE, "");
  const m = t.match(/^([a-zA-Z_][\w.]*(?:<[\w.<>, ]*>)?)\s+(?=[a-zA-Z_]\w*\s*(?::=|=|$))/);
  if (m && (udtNames.has(m[1]) || /^(chart\.point|map<.*>|array<.*>|matrix<.*>)$/.test(m[1]))) t = t.slice(m[0].length);
  return t;
}

function parseSimpleStatement(line: Line, nextId: () => number): Stmt {
  let text = line.text;
  let isVar = false;
  if (/^var(ip)?\s+/.test(text)) { isVar = true; text = text.replace(/^var(ip)?\s+/, ""); }
  text = stripTypePrefix(text);

  const tupleMatch = text.match(/^\[\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\]\s*=(?!=)\s*(.+)$/);
  if (tupleMatch) {
    const names = tupleMatch[1].split(",").map((n) => n.trim());
    return { type: "tupleAssign", names, expr: withLine(line.lineNo, () => parseExpression(tupleMatch[2], nextId)), line: line.lineNo };
  }

  // A field of an object: `obj.field := x`, `obj.count += 1`
  const fa = text.match(/^([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+)\s*(:=|\+=|-=|\*=|\/=|%=)\s*(.+)$/);
  if (fa) {
    const rhs = withLine(line.lineNo, () => parseExpression(fa[3], nextId));
    const expr: Expr = fa[2] === ":=" ? rhs : { type: "arith", op: fa[2][0], left: { type: "ident", name: fa[1] }, right: rhs };
    return { type: "fieldAssign", target: fa[1], expr, line: line.lineNo };
  }

  // Compound assignment (`j -= 1`, etc.) desugars to `j := j - 1`.
  const compound = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/);
  if (compound) {
    const [, name, op, rhs] = compound;
    const rhsExpr = withLine(line.lineNo, () => parseExpression(rhs, nextId));
    const combined: Expr = { type: "arith", op: op[0], left: { type: "ident", name }, right: rhsExpr };
    return { type: "assign", name, expr: combined, isVarDecl: false, line: line.lineNo };
  }

  const m = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(:=|=)(?!=)\s*(.+)$/);
  if (m) {
    const [, name, op, rhs] = m;
    return { type: "assign", name, expr: withLine(line.lineNo, () => parseExpression(rhs, nextId)), isVarDecl: isVar && op === "=", line: line.lineNo };
  }
  return { type: "expr", expr: withLine(line.lineNo, () => parseExpression(text, nextId)), line: line.lineNo };
}

// Parses exactly ONE if/else-if/else statement, never more. Needed as its
// own function because "else if" is handled by rewriting that line to "if"
// and recursing — recursing into the general parseBlock (which loops until
// it runs out of same-or-deeper-indented lines) would keep going, chewing
// through every sibling statement that follows the whole if/else-if/else
// chain in the source and burying them as this if's elseBody instead of
// leaving them for the caller. That was a real, severe bug: an `if` at
// column 0 followed by `else if` swallowed the ENTIRE REST of the script.
function parseIfStmt(lines: Line[], start: number, indent: number, nextId: () => number): { stmt: Stmt; next: number } {
  const line = lines[start];
  const cond = withLine(line.lineNo, () => parseExpression(line.text.replace(/^if\s*/, ""), nextId));
  let i = start + 1;
  let body: Stmt[] = [];
  if (i < lines.length && lines[i].indent > indent) {
    const res = parseBlock(lines, i, lines[i].indent, nextId);
    body = res.stmts;
    i = res.next;
  }
  let elseBody: Stmt[] | null = null;
  if (i < lines.length && lines[i].indent === indent && /^else\b/.test(lines[i].text)) {
    if (/^else\s+if\b/.test(lines[i].text)) {
      lines[i] = { ...lines[i], text: lines[i].text.replace(/^else\s+if/, "if") };
      const res2 = parseIfStmt(lines, i, indent, nextId);
      elseBody = [res2.stmt];
      i = res2.next;
    } else {
      i++;
      if (i < lines.length && lines[i].indent > indent) {
        const res3 = parseBlock(lines, i, lines[i].indent, nextId);
        elseBody = res3.stmts;
        i = res3.next;
      } else elseBody = [];
    }
  }
  return { stmt: { type: "if", cond, body, elseBody, line: line.lineNo }, next: i };
}

function parseBlock(lines: Line[], start: number, indent: number, nextId: () => number): { stmts: Stmt[]; next: number } {
  const stmts: Stmt[] = [];
  let i = start;
  while (i < lines.length && lines[i].indent >= indent) {
    let line = lines[i];
    const sw = switchHead(line.text);
    if (sw) {
      const subject = sw.subject ? withLine(line.lineNo, () => parseExpression(sw.subject, nextId)) : null;
      const arms: { cond: Expr | null; body: Stmt[] }[] = [];
      i++;
      if (i < lines.length && lines[i].indent > line.indent) {
        const armIndent = lines[i].indent;
        while (i < lines.length && lines[i].indent >= armIndent) {
          const armLine = lines[i];
          const parts = armSplit(armLine.text);
          if (!parts || armLine.indent !== armIndent) {
            const e = new PineError("Syntax error: each switch case needs the form `value => result`", "CE10001");
            e.line = armLine.lineNo;
            throw e;
          }
          const cond = parts.cond ? withLine(armLine.lineNo, () => parseExpression(parts.cond, nextId)) : null;
          i++;
          let body: Stmt[] = [];
          if (parts.body) body = [parseSimpleStatement({ indent: armIndent + 1, text: parts.body, lineNo: armLine.lineNo }, nextId)];
          else if (i < lines.length && lines[i].indent > armIndent) { const res = parseBlock(lines, i, lines[i].indent, nextId); body = res.stmts; i = res.next; }
          arms.push({ cond, body });
        }
      }
      const swExpr: Expr = { type: "switch", subject, arms };
      if (sw.prefix) {
        // `x = switch …`: an ordinary assignment whose value is the switch
        const assign = parseSimpleStatement({ indent: line.indent, text: sw.prefix + "na", lineNo: line.lineNo }, nextId);
        if (assign.type === "assign" || assign.type === "tupleAssign") assign.expr = swExpr;
        stmts.push(assign);
      } else stmts.push({ type: "expr", expr: swExpr, line: line.lineNo });
      continue;
    }
    // `export` (libraries) changes nothing here
    if (/^export\s+/.test(line.text)) lines[i] = line = { ...line, text: line.text.replace(/^export\s+/, "") };
    // type Name / its fields, one per indented line: `float price = 0.0`
    const typeHead = line.text.match(/^type\s+([a-zA-Z_]\w*)\s*$/);
    if (typeHead) {
      const fields: TypeDef["fields"] = [];
      i++;
      while (i < lines.length && lines[i].indent > line.indent) {
        const f = parseParams(lines[i].text, nextId)[0];
        if (f) fields.push({ name: f.name, default: f.default });
        i++;
      }
      stmts.push({ type: "typedef", def: { name: typeHead[1], fields }, line: line.lineNo });
      continue;
    }
    // for x in array / for [i, x] in array
    const forIn = line.text.match(/^for\s+(?:\[\s*([a-zA-Z_]\w*)\s*,\s*([a-zA-Z_]\w*)\s*\]|([a-zA-Z_]\w*))\s+in\s+(.+)$/);
    if (forIn) {
      const expr = withLine(line.lineNo, () => parseExpression(forIn[4], nextId));
      i++;
      let body: Stmt[] = [];
      if (i < lines.length && lines[i].indent > indent) { const res = parseBlock(lines, i, lines[i].indent, nextId); body = res.stmts; i = res.next; }
      stmts.push({ type: "forin", idxVar: forIn[1] || null, valVar: forIn[2] || forIn[3], expr, body, line: line.lineNo });
      continue;
    }
    // method name(Type this, …) => …: a function also callable as this.name(…)
    const isMethod = /^method\s+/.test(line.text);
    const fnDecl = matchFuncDecl(isMethod ? line.text.replace(/^method\s+/, "") : line.text);
    const forHeader = !fnDecl ? splitForHeader(line.text) : null;
    if (fnDecl) {
      const params = parseParams(fnDecl.paramsText, nextId);
      i++;
      let body: Stmt[];
      if (fnDecl.rest) {
        body = [parseSimpleStatement({ indent: line.indent + 1, text: fnDecl.rest, lineNo: line.lineNo }, nextId)];
      } else {
        body = [];
        if (i < lines.length && lines[i].indent > indent) {
          const res = parseBlock(lines, i, lines[i].indent, nextId);
          body = res.stmts;
          i = res.next;
        }
      }
      stmts.push({ type: "funcdef", def: { name: fnDecl.name, params, body, isMethod }, line: line.lineNo });
    } else if (forHeader) {
      const from = withLine(line.lineNo, () => parseExpression(forHeader.fromText, nextId));
      const to = withLine(line.lineNo, () => parseExpression(forHeader.toText, nextId));
      const step = forHeader.byText ? withLine(line.lineNo, () => parseExpression(forHeader.byText as string, nextId)) : null;
      i++;
      let body: Stmt[] = [];
      if (i < lines.length && lines[i].indent > indent) {
        const res = parseBlock(lines, i, lines[i].indent, nextId);
        body = res.stmts;
        i = res.next;
      }
      stmts.push({ type: "for", varName: forHeader.varName, from, to, step, body, line: line.lineNo });
    } else if (/^while\b/.test(line.text)) {
      const cond = withLine(line.lineNo, () => parseExpression(line.text.replace(/^while\s*/, ""), nextId));
      i++;
      let body: Stmt[] = [];
      if (i < lines.length && lines[i].indent > indent) {
        const res = parseBlock(lines, i, lines[i].indent, nextId);
        body = res.stmts;
        i = res.next;
      }
      stmts.push({ type: "while", cond, body, line: line.lineNo });
    } else if (/^if\b/.test(line.text)) {
      const res = parseIfStmt(lines, i, indent, nextId);
      stmts.push(res.stmt);
      i = res.next;
    } else {
      stmts.push(parseSimpleStatement(line, nextId));
      i++;
    }
  }
  return { stmts, next: i };
}

// ---------------------------------------------------------------- runtime

interface CallState { [key: string]: any }

interface Ctx {
  profile?: Map<number, { ms: number; count: number }>;
  vars: Record<string, any>;
  varHistory: Record<string, any[]>;
  callState: Record<string | number, CallState>;
  plots: Record<number, PinePlotResult>;
  plotOrder: number[];
  markers: PineMarker[];
  tables: any[]; // PineTable runtime objects (see table.new), flushed to PineRunResult.tables at the end
  logs: string[];
  warnings: string[];
  warned: Set<string>;
  bars: Bar[];
  barIndex: number;
  bar: Bar;
  functions: Record<string, FunctionDef>;
  types?: Record<string, TypeDef>;
  methods?: Record<string, FunctionDef[]>;
  scopeStmts?: Stmt[];   // the statements of the script / function being run (request.security dependencies)
  strategyInitialCapital: number;
  strategyState: StrategyState;
  inputsList: { value: any; isBool: boolean }[];
  inputOverrides?: Record<string, any>;
  // Points at the top-level script ctx (self-referential there). A
  // user-defined function's own ctx has isolated vars/varHistory for its
  // params and locals, but Pine functions can still read GLOBAL/script-level
  // variables (e.g. an input.*()-derived constant) — never a caller's
  // locals, since Pine functions aren't closures — so name resolution falls
  // back to this when a name isn't one of the function's own.
  globalCtx: Ctx;
  // Multi-timeframe support (see runPineScriptAsync). pineTf/barDurationSec
  // describe the timeframe THIS ctx's own `bars` are on — the primary chart
  // timeframe for the top-level ctx, or the requested tf for a sub-ctx built
  // to evaluate a request.security()/request.security_lower_tf() expression.
  symbol: string;
  pineTf: string;
  barDurationSec: number;
  mtfData: Record<string, Bar[]>;
  mtfSeriesCache: Map<string, { time: number; value: any }[]>;
  // Strategy Tester's "Testing period" scoping: TradingView keeps calculating
  // a strategy across ALL loaded chart history regardless of this setting —
  // it only restricts which bars are allowed to SUBMIT new entry orders and
  // forces any still-open position closed once the window ends. Truncating
  // the bar series itself (this engine's earlier approach) instead starves
  // any var-persisted state — accumulated arrays, running highs/lows, etc.
  // — of the warm-up history it needs, so a script's very first signals
  // inside the window come out wrong. undefined means no restriction (the
  // "all"/entire-history case).
  backtestFrom?: number;
  backtestTo?: number;
  mintick?: number;
  drawings?: any;
  hlines?: PineHline[];
  fills?: PineFill[];
  fillSeen?: Map<number, PineFill>;
}

function truthy(v: any): boolean {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "number") return !isNaN(v) && v !== 0;
  if (typeof v === "string") return v.length > 0;
  return !!v;
}

// Built-in variables a script's own variable can't shadow here (checked before the fast path)
const CORE_IDENTS = new Set(["close", "open", "high", "low", "volume", "hl2", "hlc3", "ohlc4", "hlcc4", "bar_index", "na", "time", "time_close",
  "true", "false", "last_bar_index", "timenow", "year", "month", "dayofmonth", "dayofweek", "hour", "minute", "second", "time_tradingday"]);

function resolveIdent(name: string, ctx: Ctx): any {
  // Fast path: an ordinary variable of the script (most reads)
  if (!CORE_IDENTS.has(name) && name.indexOf(".") < 0) {
    if (own(ctx.vars, name)) return ctx.vars[name];
    if (ctx.globalCtx && ctx.globalCtx !== ctx && own(ctx.globalCtx.vars, name)) return ctx.globalCtx.vars[name];
  }
  switch (name) {
    case "close": return ctx.bar.close;
    case "open": return ctx.bar.open;
    case "high": return ctx.bar.high;
    case "low": return ctx.bar.low;
    case "volume": return ctx.bar.volume ?? 0;
    case "hl2": return (ctx.bar.high + ctx.bar.low) / 2;
    case "hlc3": return (ctx.bar.high + ctx.bar.low + ctx.bar.close) / 3;
    case "ohlc4": return (ctx.bar.open + ctx.bar.high + ctx.bar.low + ctx.bar.close) / 4;
    case "bar_index": return ctx.barIndex;
    case "na": return NaN;
    case "time": return ctx.bar.time * 1000;
    case "time_close": return ctx.bar.time * 1000 + ctx.barDurationSec * 1000;
    case "strategy.long": return "long";
    case "strategy.short": return "short";
    case "strategy.fixed": return "fixed";
    case "strategy.initial_capital": return ctx.strategyInitialCapital ?? NaN;
    case "strategy.equity": {
      const ec = ctx.strategyState.equityCurve;
      return ec.length ? ec[ec.length - 1].equity : ctx.strategyInitialCapital;
    }
    case "strategy.netprofit": return ctx.strategyState.netProfit;
    case "strategy.position_size": {
      const pos = ctx.strategyState.position;
      if (!pos) return 0;
      return pos.direction === "long" ? pos.qty : -pos.qty;
    }
    case "strategy.position_avg_price": return ctx.strategyState.position ? ctx.strategyState.position.entryPrice : NaN;
    case "strategy.closedtrades": return ctx.strategyState.closedTrades.length;
    case "strategy.opentrades": return ctx.strategyState.position ? 1 : 0;
    case "barmerge.lookahead_on": return true;
    case "barmerge.lookahead_off": return false;
    case "syminfo.tickerid": case "syminfo.ticker": return ctx.symbol || "";
    case "timeframe.period": return ctx.pineTf || "";
    case "currency.USD": return "USD";
    case "true": return true;
    case "false": return false;
    case "hlcc4": return (ctx.bar.high + ctx.bar.low + 2 * ctx.bar.close) / 4;
    case "last_bar_index": return ctx.bars.length - 1;
    case "timenow": return Date.now();
    case "math.pi": return Math.PI;
    case "math.e": return Math.E;
    case "math.phi": return 1.618033988749895;
    case "math.rphi": return 0.618033988749895;
    case "syminfo.mintick": return minTick(ctx);
    case "barstate.isfirst": return ctx.barIndex === 0;
    case "barstate.islast": case "barstate.islastconfirmedhistory": return ctx.barIndex === ctx.bars.length - 1;
    case "barstate.ishistory": return ctx.barIndex < ctx.bars.length - 1;
    case "barstate.isrealtime": return false;
    case "barstate.isnew": case "barstate.isconfirmed": return true;
    // The bar's date and time, UTC
    case "year": return new Date(ctx.bar.time * 1000).getUTCFullYear();
    case "month": return new Date(ctx.bar.time * 1000).getUTCMonth() + 1;
    case "dayofmonth": return new Date(ctx.bar.time * 1000).getUTCDate();
    case "dayofweek": return new Date(ctx.bar.time * 1000).getUTCDay() + 1;
    case "hour": return new Date(ctx.bar.time * 1000).getUTCHours();
    case "minute": return new Date(ctx.bar.time * 1000).getUTCMinutes();
    case "second": return new Date(ctx.bar.time * 1000).getUTCSeconds();
    case "time_tradingday": return Math.floor(ctx.bar.time / 86400) * 86400 * 1000;
    case "syminfo.timezone": return "Etc/UTC";
    case "syminfo.currency": return "USD";
    case "syminfo.prefix": return (ctx.symbol || "").includes(":") ? ctx.symbol.split(":")[0] : "";
    case "syminfo.root": return (ctx.symbol || "").split(":").pop() || "";
    case "label.all": return drawStore(ctx).label.slice();
    case "line.all": return drawStore(ctx).line.slice();
    case "box.all": return drawStore(ctx).box.slice();
    case "timeframe.isintraday": return ctx.barDurationSec > 0 && ctx.barDurationSec < 86400;
    case "timeframe.isdaily": return ctx.barDurationSec === 86400;
    case "timeframe.isweekly": return ctx.barDurationSec === 7 * 86400;
    case "timeframe.ismonthly": return ctx.barDurationSec >= 28 * 86400;
    case "timeframe.isdwm": return ctx.barDurationSec >= 86400;
    // "15" → 15, "4H"/"240" → 240, "D" → 1, "3M" → 3
    case "timeframe.multiplier": { const m = /^(\d+)/.exec(ctx.pineTf || ""); return m ? parseInt(m[1], 10) : 1; }
    case "timeframe.isminutes": return /^\d+$/.test(ctx.pineTf || "");
    case "timeframe.isseconds": return /S$/i.test(ctx.pineTf || "");
    case "dayofweek.sunday": return 1;
    case "dayofweek.monday": return 2;
    case "dayofweek.tuesday": return 3;
    case "dayofweek.wednesday": return 4;
    case "dayofweek.thursday": return 5;
    case "dayofweek.friday": return 6;
    case "dayofweek.saturday": return 7;
    // Built-in series variables that need state: one per name
    case "ta.tr": return B.tr({}, ctx, false);
    case "ta.vwap": return B.vwap((ctx.callState["v:ta.vwap"] = ctx.callState["v:ta.vwap"] || {}), ctx, (ctx.bar.high + ctx.bar.low + ctx.bar.close) / 3);
    case "ta.obv": return B.obv((ctx.callState["v:ta.obv"] = ctx.callState["v:ta.obv"] || {}), ctx);
    case "ta.accdist": return B.accdist((ctx.callState["v:ta.accdist"] = ctx.callState["v:ta.accdist"] || {}), ctx);
    case "ta.pvt": return B.pvt((ctx.callState["v:ta.pvt"] = ctx.callState["v:ta.pvt"] || {}), ctx);
  }
  // obj.field.subfield on a variable
  const dotAt = name.indexOf(".");
  if (dotAt > 0) {
    const head = varOf(ctx, name.slice(0, dotAt));
    if (head.found && head.value && typeof head.value === "object") return walkFields(head.value, name.slice(dotAt + 1).split("."));
  }
  if (name.startsWith("color.")) {
    const c = COLOR_NAMES[name.slice(6)];
    if (c) return c;
  }
  if (Object.prototype.hasOwnProperty.call(ctx.vars, name)) return ctx.vars[name];
  if (ctx.globalCtx && ctx.globalCtx !== ctx && Object.prototype.hasOwnProperty.call(ctx.globalCtx.vars, name)) return ctx.globalCtx.vars[name];
  // Generic fallback for Pine's many dot-namespaced enum constants
  // (position.top_right, size.tiny, location.belowbar, shape.triangleup,
  // xloc.bar_index, line.style_dashed, ...) whose value only needs to be
  // internally distinguishable — the suffix after the last dot works for
  // every caller that switches on it (e.g. plotshape's "below" check).
  if (name.includes(".")) return name.slice(name.lastIndexOf(".") + 1);
  return NaN;
}

function pushBarIdempotent(state: CallState, key: string, barIndex: number, value: number) {
  if (!state[key]) state[key] = { hist: [], lastBar: -1 };
  const s = state[key];
  if (s.lastBar !== barIndex) { s.hist.push(value); s.lastBar = barIndex; }
  return s.hist;
}

// Parses a Pine-style timeframe string ("1", "5", "240", "D", "3D", "W", "M")
// into seconds. Bare integers are minutes, per Pine convention.
function pineTimeframeToSeconds(tf: string): number {
  if (!tf) return 0;
  const t = tf.trim().toUpperCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10) * 60;
  const m = t.match(/^(\d*)([DWM])$/);
  if (m) {
    const mult = m[1] ? parseInt(m[1], 10) : 1;
    if (m[2] === "D") return mult * 86400;
    if (m[2] === "W") return mult * 7 * 86400;
    if (m[2] === "M") return mult * 30 * 86400;
  }
  const s = t.match(/^(\d+)S$/);
  if (s) return parseInt(s[1], 10);
  return 0;
}

function warnOnce(ctx: Ctx, msg: string) {
  if (!ctx.warned.has(msg)) { ctx.warned.add(msg); ctx.warnings.push(msg); }
}

const LOOP_LIMIT = 200000;

function execForStmt(s: Extract<Stmt, { type: "for" }>, ctx: Ctx, exec: (stmts: Stmt[], ctx: Ctx) => any): void {
  const fromV = Math.round(Number(evalNode(s.from, ctx)));
  const toV = Math.round(Number(evalNode(s.to, ctx)));
  const stepV = s.step ? Number(evalNode(s.step, ctx)) : (fromV <= toV ? 1 : -1);
  if (!stepV) return;
  let iter = 0;
  if (stepV > 0) {
    for (let i = fromV; i <= toV; i += stepV) {
      ctx.vars[s.varName] = i;
      exec(s.body, ctx);
      if (++iter > LOOP_LIMIT) throw new PineError("Loop iteration limit exceeded (possible infinite loop)", "CE90003");
    }
  } else {
    for (let i = fromV; i >= toV; i += stepV) {
      ctx.vars[s.varName] = i;
      exec(s.body, ctx);
      if (++iter > LOOP_LIMIT) throw new PineError("Loop iteration limit exceeded (possible infinite loop)", "CE90003");
    }
  }
}

function execWhileStmt(s: Extract<Stmt, { type: "while" }>, ctx: Ctx, exec: (stmts: Stmt[], ctx: Ctx) => any): void {
  let iter = 0;
  while (truthy(evalNode(s.cond, ctx))) {
    exec(s.body, ctx);
    if (++iter > LOOP_LIMIT) throw new PineError("Loop iteration limit exceeded (possible infinite loop)", "CE90003");
  }
}

function execTupleAssign(s: Extract<Stmt, { type: "tupleAssign" }>, ctx: Ctx): void {
  const result = evalNode(s.expr, ctx);
  const values: any[] = Array.isArray(result) ? result : [result];
  s.names.forEach((name, i) => {
    if (name === "_") return;
    const v = values[i];
    ctx.vars[name] = v;
    if (!ctx.varHistory[name]) ctx.varHistory[name] = [];
    ctx.varHistory[name][ctx.barIndex] = v;
  });
}

// Runs a user-defined function's body. Distinct from execStmts (the
// top-level/if/for/while executor used for the main script) because a
// function's value is the value of its LAST statement — Pine has no explicit
// `return`. Side-effecting builtins (plot/strategy.entry/log/etc.) aren't
// expected inside these two functions' bodies, so bare expression statements
// go straight through evalNode rather than execExprStatement.
// Statements both executors share: object fields and for…in loops
function execFieldAssign(s: Extract<Stmt, { type: "fieldAssign" }>, ctx: Ctx) {
  const segs = s.target.split(".");
  const head = varOf(ctx, segs[0]);
  const parent = head.found ? walkFields(head.value, segs.slice(1, -1)) : null;
  if (!parent || typeof parent !== "object") throw new PineError(`Cannot assign to '${s.target}': '${segs[0]}' is not an object`, "CE10004");
  parent[segs[segs.length - 1]] = evalNode(s.expr, ctx);
}
function execForIn(s: Extract<Stmt, { type: "forin" }>, ctx: Ctx, exec: (stmts: Stmt[], ctx: Ctx) => any) {
  const coll = evalNode(s.expr, ctx);
  const items: any[] = Array.isArray(coll) ? coll.slice() : isMatrix(coll) ? coll.data.map((r) => r.slice()) : [];
  if (items.length > LOOP_LIMIT) throw new PineError("Loop iteration limit exceeded (possible infinite loop)", "CE90003");
  items.forEach((item, i) => {
    if (s.idxVar) ctx.vars[s.idxVar] = i;
    ctx.vars[s.valVar] = item;
    exec(s.body, ctx);
  });
}

function execFunctionBody(stmts: Stmt[], ctx: Ctx): any {
  let lastValue: any = NaN;
  for (const s of stmts) {
    try {
      switch (s.type) {
        case "if":
          if (truthy(evalNode(s.cond, ctx))) lastValue = execFunctionBody(s.body, ctx);
          else if (s.elseBody) lastValue = execFunctionBody(s.elseBody, ctx);
          else lastValue = NaN;
          break;
        case "for": execForStmt(s, ctx, execFunctionBody); lastValue = NaN; break;
        case "forin": execForIn(s, ctx, execFunctionBody); lastValue = NaN; break;
        case "fieldAssign": execFieldAssign(s, ctx); lastValue = NaN; break;
        case "typedef": break;
        case "while": execWhileStmt(s, ctx, execFunctionBody); lastValue = NaN; break;
        // `[a, b] = f()` as a function's last line returns the tuple, as in Pine
        case "tupleAssign": execTupleAssign(s, ctx); lastValue = s.names.map((n) => ctx.vars[n]); break;
        case "funcdef": break;
        case "assign":
          if (!(s.isVarDecl && ctx.barIndex !== 0 && Object.prototype.hasOwnProperty.call(ctx.vars, s.name))) {
            ctx.vars[s.name] = evalNode(s.expr, ctx);
          }
          if (!ctx.varHistory[s.name]) ctx.varHistory[s.name] = [];
          ctx.varHistory[s.name][ctx.barIndex] = ctx.vars[s.name];
          lastValue = ctx.vars[s.name];
          break;
        case "expr":
          // Orders, logs, table cells… inside a function or a switch case still happen
          if (s.expr.type === "call" && isSideEffectCall(s.expr.name)) { execExprStatement(s.expr, ctx); lastValue = NaN; }
          else lastValue = evalNode(s.expr, ctx);
          break;
      }
    } catch (err) {
      if (err instanceof PineError) { if (err.line === undefined) err.line = s.line; throw err; }
      const wrapped = new PineError(err instanceof Error ? err.message : String(err), "CE90001");
      wrapped.line = s.line;
      throw wrapped;
    }
  }
  return lastValue;
}

const SIDE_EFFECT_CALLS = new Set(["fill", "bgcolor", "barcolor", "alert", "alertcondition", "table.cell", "table.clear", "strategy.entry", "strategy.exit", "strategy.close", "strategy.close_all", "strategy.cancel", "strategy.cancel_all", "strategy.order"]);
function isSideEffectCall(name: string): boolean {
  return SIDE_EFFECT_CALLS.has(name) || name.startsWith("log.") || name.startsWith("label.") || name.startsWith("line.") || name.startsWith("box.");
}

function callUserFunction(fn: FunctionDef, node: Extract<Expr, { type: "call" }>, ctx: Ctx): any {
  // evalCall already lazily creates ctx.callState[node.id] as {} for every
  // call (builtins use it directly); that object is truthy, so `||` alone
  // would never attach localVars/localVarHistory. Check for them by name.
  const cs = (ctx.callState[node.id] = ctx.callState[node.id] || {});
  if (!cs.localVars) cs.localVars = {};
  if (!cs.localVarHistory) cs.localVarHistory = {};
  // Each call site keeps its own series state for the ta.* calls inside the function, as in
  // Pine: ma(rsi, 14) and ma(close, 50) don't share one moving average
  if (!cs.innerState) cs.innerState = {};
  const fnCtx: Ctx = { ...ctx, vars: cs.localVars, varHistory: cs.localVarHistory, callState: cs.innerState, scopeStmts: fn.body };
  fn.params.forEach((p, idx) => {
    let v: any;
    if (node.namedArgs[p.name] !== undefined) v = evalNode(node.namedArgs[p.name], ctx);
    else if (node.args[idx] !== undefined) v = evalNode(node.args[idx], ctx);
    else if (p.default) v = evalNode(p.default, fnCtx);
    else v = NaN;
    fnCtx.vars[p.name] = v;
    if (!fnCtx.varHistory[p.name]) fnCtx.varHistory[p.name] = [];
    fnCtx.varHistory[p.name][ctx.barIndex] = v;
  });
  return execFunctionBody(fn.body, fnCtx);
}

// Evaluates a single expression bar-by-bar across an OTHER timeframe's own
// bar series, with its own isolated ta.*/var state — this is what makes
// stateful sub-expressions like `ta.ema(close, len)` inside a
// request.security() call behave as their own independent series rather
// than sharing state with the primary chart.
// Every identifier an expression reads (through calls, fields, switches…)
function exprIdents(e: Expr | null | undefined, out: Set<string>) {
  if (!e) return;
  switch (e.type) {
    case "ident": out.add(e.name.split(".")[0]); return;
    case "neg": case "not": exprIdents(e.expr, out); return;
    case "or": case "and": case "cmp": case "arith": exprIdents(e.left, out); exprIdents(e.right, out); return;
    case "ternary": exprIdents(e.cond, out); exprIdents(e.t, out); exprIdents(e.f, out); return;
    case "histref": exprIdents(e.base, out); exprIdents(e.offset, out); return;
    case "call": e.args.forEach((a) => exprIdents(a, out)); Object.values(e.namedArgs).forEach((a) => exprIdents(a, out)); { const head = e.name.split(".")[0]; if (e.name.includes(".")) out.add(head); } return;
    case "mcall": exprIdents(e.recv, out); e.args.forEach((a) => exprIdents(a, out)); return;
    case "field": exprIdents(e.base, out); return;
    case "tuple": e.items.forEach((a) => exprIdents(a, out)); return;
    case "switch": exprIdents(e.subject, out); e.arms.forEach((a) => { exprIdents(a.cond, out); a.body.forEach((st) => { if (st.type === "assign" || st.type === "expr" || st.type === "tupleAssign") exprIdents(st.expr, out); }); }); return;
  }
}

// The assignments (at any depth) of a statement list, by the name they define
function assignsByName(stmts: Stmt[] | undefined, out: Map<string, Stmt>) {
  for (const st of stmts || []) {
    if (st.type === "assign" && !out.has(st.name)) out.set(st.name, st);
    else if (st.type === "tupleAssign") st.names.forEach((n) => { if (!out.has(n)) out.set(n, st); });
    else if (st.type === "if") { assignsByName(st.body, out); assignsByName(st.elseBody || [], out); }
  }
}

// Evaluates an expression bar by bar on another timeframe's bars, with its own ta.* and var
// state. As in TradingView, the script variables it depends on are computed on that timeframe too
// (e.g. a timeframe.change() flag defined before the request.security() call).
function evalSeriesOverBars(exprNode: Expr, otherBars: Bar[], tf: string, functions: Record<string, FunctionDef>, globalCtx: Ctx, callerCtx?: Ctx): { time: number; value: any }[] {
  const subCtx: Ctx = {
    vars: callerCtx ? { ...callerCtx.vars } : {}, varHistory: {}, callState: {}, plots: {}, plotOrder: [], markers: [], tables: [], logs: [],
    warnings: [], warned: new Set(), bars: otherBars, barIndex: 0, bar: otherBars[0],
    functions, types: globalCtx?.types, methods: globalCtx?.methods,
    strategyInitialCapital: 0, strategyState: makeStrategyState(), inputsList: [], symbol: globalCtx?.symbol || "", pineTf: tf, barDurationSec: pineTimeframeToSeconds(tf),
    mtfData: {}, mtfSeriesCache: new Map(), globalCtx,
  };
  // The assignments this expression depends on (not inputs: those keep the values they have)
  const defs = new Map<string, Stmt>();
  assignsByName(callerCtx?.scopeStmts, defs);
  if (globalCtx?.scopeStmts && globalCtx !== callerCtx) assignsByName(globalCtx.scopeStmts, defs);
  const needed: Stmt[] = [];
  const seen = new Set<string>();
  const visit = (e: Expr) => {
    const names = new Set<string>();
    exprIdents(e, names);
    for (const n of Array.from(names)) {
      if (seen.has(n)) continue;
      seen.add(n);
      const st = defs.get(n);
      if (!st || needed.includes(st)) continue;
      const rhs = (st as any).expr as Expr;
      if (rhs && rhs.type === "call" && rhs.name.startsWith("input")) continue;
      if (rhs) visit(rhs);
      needed.push(st);
    }
  };
  visit(exprNode);
  const out: { time: number; value: any }[] = [];
  for (let i = 0; i < otherBars.length; i++) {
    subCtx.barIndex = i;
    subCtx.bar = otherBars[i];
    if (needed.length) execStmts(needed, subCtx);
    out.push({ time: otherBars[i].time, value: evalNode(exprNode, subCtx) });
  }
  return out;
}

// request.security(): real multi-timeframe lookup, resolved against
// genuinely fetched other-timeframe bars (see runPineScriptAsync) rather
// than approximated from the primary series. Uses `lookahead_on` semantics
// (the standard non-repainting form): the most recent other-tf bar whose
// own open time is already known as of the current primary bar.
function evalRequestSecurity(node: Extract<Expr, { type: "call" }>, ctx: Ctx): any {
  if (node.args.length < 3) return NaN;
  let tf: string;
  try { tf = String(evalNode(node.args[1], ctx)); } catch { return NaN; }
  let otherBars = ctx.mtfData[tf];
  // A higher timeframe that wasn't downloaded is built from the chart's own bars
  if ((!otherBars || otherBars.length === 0) && tf && pineTimeframeToSeconds(tf) >= (ctx.barDurationSec || 0)) {
    const g = ctx.globalCtx || ctx;
    otherBars = ctx.mtfData[tf] = aggregateBars(g.bars, tf);
  }
  if (!otherBars || otherBars.length === 0) {
    warnOnce(ctx, `request.security(...) for timeframe '${tf}' has no data available and was skipped (returns na).`);
    return NaN;
  }
  const cacheKey = `sec:${node.id}:${tf}`;
  let series = ctx.mtfSeriesCache.get(cacheKey);
  if (!series) {
    series = evalSeriesOverBars(node.args[2], otherBars, tf, ctx.functions, ctx.globalCtx, ctx);
    ctx.mtfSeriesCache.set(cacheKey, series);
  }
  const cs = (ctx.callState[node.id] = ctx.callState[node.id] || {});
  if (cs.cursor === undefined) cs.cursor = 0;
  const t = ctx.bar.time;
  while (cs.cursor + 1 < otherBars.length && otherBars[cs.cursor + 1].time <= t) cs.cursor++;
  if (otherBars[cs.cursor].time > t) return NaN;
  return series[cs.cursor].value;
}

// request.security_lower_tf(): returns every finer-timeframe value whose bar
// falls within the current (coarser) primary bar's own period, matching
// real Pine's array-of-values-per-bar semantics.
function evalRequestSecurityLowerTf(node: Extract<Expr, { type: "call" }>, ctx: Ctx): any[] {
  if (node.args.length < 3) return [];
  let tf: string;
  try { tf = String(evalNode(node.args[1], ctx)); } catch { return []; }
  const otherBars = ctx.mtfData[tf];
  if (!otherBars || otherBars.length === 0) {
    warnOnce(ctx, `request.security_lower_tf(...) for timeframe '${tf}' has no data available and was skipped (returns an empty array).`);
    return [];
  }
  const cacheKey = `ltf:${node.id}:${tf}`;
  let series = ctx.mtfSeriesCache.get(cacheKey);
  if (!series) {
    series = evalSeriesOverBars(node.args[2], otherBars, tf, ctx.functions, ctx.globalCtx, ctx);
    ctx.mtfSeriesCache.set(cacheKey, series);
  }
  const periodStart = ctx.bar.time;
  const periodEnd = periodStart + (ctx.barDurationSec || Infinity);
  const out: any[] = [];
  for (let i = 0; i < otherBars.length; i++) {
    if (otherBars[i].time >= periodStart && otherBars[i].time < periodEnd) out.push(series[i].value);
  }
  return out;
}

const DRAWING_NAMESPACES = ["linefill.", "polyline."];
// Every function in Pine's reference ("ta.rma", "math.abs", "plot", …) from the editor's catalog
const PINE_FUNCTIONS = new Set(Object.entries(PINE_CATALOG).flatMap(([ns, entries]) => entries.filter((e) => e[1] === "function").map((e) => (ns ? `${ns}.${e[0]}` : e[0]))));

// syminfo.mintick, estimated from the decimals the bars are quoted in
function minTick(ctx: Ctx): number {
  const g = ctx.globalCtx || ctx;
  if (g.mintick === undefined) {
    let dec = 0;
    for (const b of g.bars.slice(-50)) for (const v of [b.open, b.high, b.low, b.close]) { const t = String(v).split(".")[1]; if (t) dec = Math.max(dec, Math.min(t.length, 8)); }
    g.mintick = Math.pow(10, -dec);
  }
  return g.mintick;
}

// ------------------------------------------------------------ drawings
// label.* / line.* / box.*: objects a script creates, edits and deletes while it runs; what is
// left after the last bar is drawn. x is a bar index (xloc.bar_index) or a time (xloc.bar_time);
// both are stored as a bar time in seconds, extrapolated past the last bar for future points.

export interface PineLabel { kind: "label"; id: number; xloc?: string; x: number; y: number; yloc: string; text: string; color: string; textColor: string; style: string; size: string; textAlign: string; tooltip?: string }
export interface PineLine { kind: "line"; id: number; xloc?: string; x1: number; y1: number; x2: number; y2: number; color: string; width: number; style: string; extend: string }
export interface PineBox { kind: "box"; id: number; xloc?: string; left: number; top: number; right: number; bottom: number; borderColor: string; borderWidth: number; borderStyle: string; bgColor: string; extend: string; text: string; textColor: string; textSize: string; textHalign: string; textValign: string }
export type PineDrawing = PineLabel | PineLine | PineBox;

interface DrawStore { seq: number; label: PineLabel[]; line: PineLine[]; box: PineBox[]; max: { label: number; line: number; box: number } }

function drawStore(ctx: Ctx): DrawStore {
  const g = ctx.globalCtx || ctx;
  if (!g.drawings) g.drawings = { seq: 0, label: [], line: [], box: [], max: { label: 50, line: 50, box: 50 } };
  return g.drawings;
}

// A bar's time in seconds from a bar index; past the last bar it continues at the usual bar spacing
function timeOfIndex(ctx: Ctx, idx: number): number {
  const bars = (ctx.globalCtx || ctx).bars;
  if (!bars.length || isNaN(idx)) return NaN;
  const i = Math.round(idx);
  if (i >= 0 && i < bars.length) return bars[i].time;
  const step = bars.length > 1 ? (bars[bars.length - 1].time - bars[Math.max(0, bars.length - 21)].time) / Math.min(20, bars.length - 1) : 60;
  return i < 0 ? bars[0].time + i * step : bars[bars.length - 1].time + (i - bars.length + 1) * step;
}
const xToTime = (ctx: Ctx, x: any, xloc: any) => (typeof x !== "number" || isNaN(x) ? NaN : xloc === "bar_time" ? Math.round(x / 1000) : timeOfIndex(ctx, x));
function timeToIndex(ctx: Ctx, t: number): number {
  const bars = (ctx.globalCtx || ctx).bars;
  let lo = 0, hi = bars.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].time < t) lo = m + 1; else hi = m; }
  return lo;
}

// chart.point: an x (bar index and time) and a price
const isPoint = (v: any) => v && typeof v === "object" && v.__point;
function pointTime(ctx: Ctx, p: any, xloc: any): number {
  if (xloc === "bar_time" && !isNaN(p.time)) return Math.round(p.time / 1000);
  return !isNaN(p.index) ? timeOfIndex(ctx, p.index) : Math.round(p.time / 1000);
}

function addDrawing<T extends PineDrawing>(ctx: Ctx, d: T): T {
  const st = drawStore(ctx);
  const list = st[d.kind] as PineDrawing[];
  list.push(d);
  // Past the script's max_*_count the oldest object goes, as on TradingView
  while (list.length > st.max[d.kind]) list.shift();
  return d;
}
function deleteDrawing(ctx: Ctx, d: any) {
  if (!d || typeof d !== "object" || !d.kind) return;
  const list = drawStore(ctx)[d.kind as "label" | "line" | "box"] as PineDrawing[];
  const i = list.indexOf(d);
  if (i >= 0) list.splice(i, 1);
}

const colorOr = (v: any, def: string) => (typeof v === "string" ? v : typeof v === "number" && isNaN(v) ? "rgba(0, 0, 0, 0)" : def);
const strOr = (v: any, def: string) => (typeof v === "string" ? v : def);

function evalDrawing(name: string, node: Extract<Expr, { type: "call" }>, ctx: Ctx): { handled: boolean; value?: any } {
  // An argument by position or name; a missing one is `def` (undefined), unlike an explicit na
  const A = (i: number, key: string, def?: any): any =>
    node.namedArgs[key] !== undefined ? evalNode(node.namedArgs[key], ctx) : node.args[i] !== undefined ? evalNode(node.args[i], ctx) : def;
  const st = drawStore(ctx);
  const obj = () => A(0, "id");
  const live = (d: any) => d && typeof d === "object" && d.kind;
  const set = (patch: (d: any) => void) => { const d = obj(); if (live(d)) patch(d); return { handled: true, value: NaN }; };
  // x as the script gave it: a time (ms) for xloc.bar_time objects, else a bar index
  const xOut = (d: any, t: number) => (d.xloc === "bar_time" ? t * 1000 : timeToIndex(ctx, t));

  switch (name) {
    case "chart.point.new": return { handled: true, value: { __point: true, time: A(0, "time"), index: A(1, "index"), price: A(2, "price") } };
    case "chart.point.from_index": { const i = A(0, "index"); return { handled: true, value: { __point: true, index: i, time: timeOfIndex(ctx, i) * 1000, price: A(1, "price") } }; }
    case "chart.point.from_time": { const t = A(0, "time"); return { handled: true, value: { __point: true, time: t, index: timeToIndex(ctx, t / 1000), price: A(1, "price") } }; }
    case "chart.point.now": return { handled: true, value: { __point: true, time: ctx.bar.time * 1000, index: ctx.barIndex, price: A(0, "price", ctx.bar.close) } };
    case "chart.point.copy": { const p = A(0, "id"); return { handled: true, value: isPoint(p) ? { ...p } : NaN }; }

    case "label.new": {
      const p0 = A(0, "point");
      const pt = isPoint(p0);
      const shift = pt ? 1 : 0; // label.new(point, text, …) has one argument less
      const xloc = A(3 - shift, "xloc", "bar_index");
      const x = pt ? pointTime(ctx, p0, xloc) : xToTime(ctx, A(0, "x"), xloc);
      const y = pt ? p0.price : A(1, "y");
      const lbl: PineLabel = {
        kind: "label", id: ++st.seq, xloc, x, y: Number(y), yloc: strOr(A(4 - shift, "yloc"), "price"),
        text: strOr(A(2 - shift, "text"), ""), color: colorOr(A(5 - shift, "color"), "#2962FF"),
        style: strOr(A(6 - shift, "style"), "style_label_down"), textColor: colorOr(A(7 - shift, "textcolor"), "#FFFFFF"),
        size: strOr(A(8 - shift, "size"), "normal"), textAlign: strOr(A(9 - shift, "textalign"), "align_center"),
        tooltip: typeof A(10 - shift, "tooltip") === "string" ? A(10 - shift, "tooltip") : undefined,
      };
      if (lbl.yloc !== "price") lbl.y = lbl.yloc === "abovebar" ? ctx.bar.high : ctx.bar.low;
      return { handled: true, value: addDrawing(ctx, lbl) };
    }
    case "line.new": {
      const p0 = A(0, "first_point");
      const pt = isPoint(p0);
      const shift = pt ? 2 : 0; // line.new(p1, p2, …)
      const xloc = A(4 - shift, "xloc", "bar_index");
      const p1 = pt ? p0 : null, p2 = pt ? A(1, "second_point") : null;
      const ln: PineLine = {
        kind: "line", id: ++st.seq, xloc,
        x1: pt ? pointTime(ctx, p1, xloc) : xToTime(ctx, A(0, "x1"), xloc), y1: Number(pt ? p1.price : A(1, "y1")),
        x2: pt ? pointTime(ctx, p2, xloc) : xToTime(ctx, A(2, "x2"), xloc), y2: Number(pt ? p2.price : A(3, "y2")),
        extend: strOr(A(5 - shift, "extend"), "none"), color: colorOr(A(6 - shift, "color"), "#2962FF"),
        style: strOr(A(7 - shift, "style"), "style_solid"), width: Number(A(8 - shift, "width", 1)) || 1,
      };
      return { handled: true, value: addDrawing(ctx, ln) };
    }
    case "box.new": {
      const p0 = A(0, "top_left");
      const pt = isPoint(p0);
      const shift = pt ? 2 : 0; // box.new(top_left, bottom_right, …)
      const xloc = A(8 - shift, "xloc", "bar_index");
      const p1 = pt ? p0 : null, p2 = pt ? A(1, "bottom_right") : null;
      const bx: PineBox = {
        kind: "box", id: ++st.seq, xloc,
        left: pt ? pointTime(ctx, p1, xloc) : xToTime(ctx, A(0, "left"), xloc), top: Number(pt ? p1.price : A(1, "top")),
        right: pt ? pointTime(ctx, p2, xloc) : xToTime(ctx, A(2, "right"), xloc), bottom: Number(pt ? p2.price : A(3, "bottom")),
        borderColor: colorOr(A(4 - shift, "border_color"), "#2962FF"), borderWidth: Number(A(5 - shift, "border_width", 1)),
        borderStyle: strOr(A(6 - shift, "border_style"), "style_solid"), extend: strOr(A(7 - shift, "extend"), "none"),
        bgColor: colorOr(A(9 - shift, "bgcolor"), "rgba(41, 98, 255, 0.2)"), text: strOr(A(10 - shift, "text"), ""),
        textSize: strOr(A(11 - shift, "text_size"), "auto"), textColor: colorOr(A(12 - shift, "text_color"), "#000000"),
        textHalign: strOr(A(13 - shift, "text_halign"), "align_center"), textValign: strOr(A(14 - shift, "text_valign"), "align_center"),
      };
      return { handled: true, value: addDrawing(ctx, bx) };
    }

    case "label.delete": case "line.delete": case "box.delete": deleteDrawing(ctx, obj()); return { handled: true, value: NaN };
    case "label.copy": case "line.copy": case "box.copy": { const d = obj(); return { handled: true, value: live(d) ? addDrawing(ctx, { ...d, id: ++st.seq }) : NaN }; }

    // ---- setters ----
    case "label.set_x": return set((d) => { d.x = xToTime(ctx, A(1, "x"), d.xloc); });
    case "label.set_y": return set((d) => { d.y = Number(A(1, "y")); });
    case "label.set_xy": return set((d) => { d.x = xToTime(ctx, A(1, "x"), d.xloc); d.y = Number(A(2, "y")); });
    case "label.set_point": return set((d) => { const p = A(1, "point"); if (isPoint(p)) { d.x = pointTime(ctx, p, d.xloc); d.y = p.price; } });
    case "label.set_text": return set((d) => { d.text = strOr(A(1, "text"), ""); });
    case "label.set_color": return set((d) => { d.color = colorOr(A(1, "color"), d.color); });
    case "label.set_textcolor": return set((d) => { d.textColor = colorOr(A(1, "textcolor"), d.textColor); });
    case "label.set_style": return set((d) => { d.style = strOr(A(1, "style"), d.style); });
    case "label.set_size": return set((d) => { d.size = strOr(A(1, "size"), d.size); });
    case "label.set_textalign": return set((d) => { d.textAlign = strOr(A(1, "textalign"), d.textAlign); });
    case "label.set_tooltip": return set((d) => { d.tooltip = strOr(A(1, "tooltip"), ""); });
    case "label.set_yloc": return set((d) => { d.yloc = strOr(A(1, "yloc"), "price"); });
    case "label.set_xloc": return set((d) => { d.x = xToTime(ctx, A(1, "x"), A(2, "xloc")); });
    case "line.set_x1": return set((d) => { d.x1 = xToTime(ctx, A(1, "x"), d.xloc); });
    case "line.set_x2": return set((d) => { d.x2 = xToTime(ctx, A(1, "x"), d.xloc); });
    case "line.set_y1": return set((d) => { d.y1 = Number(A(1, "y")); });
    case "line.set_y2": return set((d) => { d.y2 = Number(A(1, "y")); });
    case "line.set_xy1": return set((d) => { d.x1 = xToTime(ctx, A(1, "x"), d.xloc); d.y1 = Number(A(2, "y")); });
    case "line.set_xy2": return set((d) => { d.x2 = xToTime(ctx, A(1, "x"), d.xloc); d.y2 = Number(A(2, "y")); });
    case "line.set_first_point": return set((d) => { const p = A(1, "point"); if (isPoint(p)) { d.x1 = pointTime(ctx, p, d.xloc); d.y1 = p.price; } });
    case "line.set_second_point": return set((d) => { const p = A(1, "point"); if (isPoint(p)) { d.x2 = pointTime(ctx, p, d.xloc); d.y2 = p.price; } });
    case "line.set_xloc": return set((d) => { const xl = A(3, "xloc"); d.x1 = xToTime(ctx, A(1, "x1"), xl); d.x2 = xToTime(ctx, A(2, "x2"), xl); });
    case "line.set_color": return set((d) => { d.color = colorOr(A(1, "color"), d.color); });
    case "line.set_width": return set((d) => { d.width = Number(A(1, "width")) || 1; });
    case "line.set_style": return set((d) => { d.style = strOr(A(1, "style"), d.style); });
    case "line.set_extend": return set((d) => { d.extend = strOr(A(1, "extend"), d.extend); });
    case "box.set_left": return set((d) => { d.left = xToTime(ctx, A(1, "left"), d.xloc); });
    case "box.set_right": return set((d) => { d.right = xToTime(ctx, A(1, "right"), d.xloc); });
    case "box.set_top": return set((d) => { d.top = Number(A(1, "top")); });
    case "box.set_bottom": return set((d) => { d.bottom = Number(A(1, "bottom")); });
    case "box.set_lefttop": return set((d) => { d.left = xToTime(ctx, A(1, "left"), d.xloc); d.top = Number(A(2, "top")); });
    case "box.set_rightbottom": return set((d) => { d.right = xToTime(ctx, A(1, "right"), d.xloc); d.bottom = Number(A(2, "bottom")); });
    case "box.set_top_left_point": return set((d) => { const p = A(1, "point"); if (isPoint(p)) { d.left = pointTime(ctx, p, d.xloc); d.top = p.price; } });
    case "box.set_bottom_right_point": return set((d) => { const p = A(1, "point"); if (isPoint(p)) { d.right = pointTime(ctx, p, d.xloc); d.bottom = p.price; } });
    case "box.set_bgcolor": return set((d) => { d.bgColor = colorOr(A(1, "color"), d.bgColor); });
    case "box.set_border_color": return set((d) => { d.borderColor = colorOr(A(1, "color"), d.borderColor); });
    case "box.set_border_width": return set((d) => { d.borderWidth = Number(A(1, "width")); });
    case "box.set_border_style": return set((d) => { d.borderStyle = strOr(A(1, "style"), d.borderStyle); });
    case "box.set_extend": return set((d) => { d.extend = strOr(A(1, "extend"), d.extend); });
    case "box.set_text": return set((d) => { d.text = strOr(A(1, "text"), ""); });
    case "box.set_text_color": return set((d) => { d.textColor = colorOr(A(1, "text_color"), d.textColor); });
    case "box.set_text_size": return set((d) => { d.textSize = strOr(A(1, "text_size"), d.textSize); });
    case "box.set_text_halign": return set((d) => { d.textHalign = strOr(A(1, "text_halign"), d.textHalign); });
    case "box.set_text_valign": return set((d) => { d.textValign = strOr(A(1, "text_valign"), d.textValign); });

    // ---- getters (x as a bar index, as Pine returns it for xloc.bar_index) ----
    case "label.get_x": { const d = obj(); return { handled: true, value: live(d) ? xOut(d, d.x) : NaN }; }
    case "label.get_y": { const d = obj(); return { handled: true, value: live(d) ? d.y : NaN }; }
    case "label.get_text": { const d = obj(); return { handled: true, value: live(d) ? d.text : "" }; }
    case "line.get_x1": { const d = obj(); return { handled: true, value: live(d) ? xOut(d, d.x1) : NaN }; }
    case "line.get_x2": { const d = obj(); return { handled: true, value: live(d) ? xOut(d, d.x2) : NaN }; }
    case "line.get_y1": { const d = obj(); return { handled: true, value: live(d) ? d.y1 : NaN }; }
    case "line.get_y2": { const d = obj(); return { handled: true, value: live(d) ? d.y2 : NaN }; }
    case "line.get_price": {
      const d = obj(); if (!live(d)) return { handled: true, value: NaN };
      const x = timeOfIndex(ctx, A(1, "x"));
      return { handled: true, value: d.x2 === d.x1 ? d.y1 : d.y1 + ((d.y2 - d.y1) * (x - d.x1)) / (d.x2 - d.x1) };
    }
    case "box.get_left": { const d = obj(); return { handled: true, value: live(d) ? xOut(d, d.left) : NaN }; }
    case "box.get_right": { const d = obj(); return { handled: true, value: live(d) ? xOut(d, d.right) : NaN }; }
    case "box.get_top": { const d = obj(); return { handled: true, value: live(d) ? d.top : NaN }; }
    case "box.get_bottom": { const d = obj(); return { handled: true, value: live(d) ? d.bottom : NaN }; }
  }
  return { handled: false };
}

// ------------------------------------------------- objects, fields, methods
// User-defined types are plain objects tagged with __udt; `a.b.c` reads fields along the path.

const own = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function varOf(ctx: Ctx, name: string): { found: boolean; value?: any } {
  if (own(ctx.vars, name)) return { found: true, value: ctx.vars[name] };
  if (ctx.globalCtx && ctx.globalCtx !== ctx && own(ctx.globalCtx.vars, name)) return { found: true, value: ctx.globalCtx.vars[name] };
  return { found: false };
}
function walkFields(v: any, segs: string[]): any {
  for (const s of segs) {
    if (v && typeof v === "object" && s in v) v = v[s];
    else return NaN;
  }
  return v;
}

// `obj.method(args)`: the script's own method for that type, else the built-in one for the
// receiver's kind (array.*, matrix.*, line.*, label.*, box.*, str.*)
function evalMethod(recv: any, method: string, node: { args: Expr[]; namedArgs: Record<string, Expr>; id: number }, ctx: Ctx): any {
  const synth: Extract<Expr, { type: "call" }> = { type: "call", name: method, args: [{ type: "value", value: recv }, ...node.args], namedArgs: node.namedArgs, id: node.id };
  const g = ctx.globalCtx || ctx;
  const candidates = (g.methods || {})[method] || [];
  const udt = recv && typeof recv === "object" ? recv.__udt : undefined;
  const user = candidates.find((f) => f.params[0]?.type === udt) || (udt ? candidates.find((f) => !f.params[0]?.type) : undefined);
  if (user) return callUserFunction(user, synth, ctx);
  const ns = Array.isArray(recv) ? "array" : recv && recv.__matrix ? "matrix" : recv && recv.__point ? "chart.point" : recv && recv.__pineTable ? "table"
    : recv && recv.kind ? recv.kind : typeof recv === "string" ? "str" : null;
  if (ns) return evalCall({ ...synth, name: `${ns}.${method}` }, ctx);
  if (candidates.length) return callUserFunction(candidates[0], synth, ctx);
  throw new PineError(`Could not find method '${method}'`, "CE10003");
}

function newObject(def: TypeDef, node: Extract<Expr, { type: "call" }>, ctx: Ctx): any {
  const o: any = { __udt: def.name };
  def.fields.forEach((f, i) => {
    if (node.namedArgs[f.name] !== undefined) o[f.name] = evalNode(node.namedArgs[f.name], ctx);
    else if (node.args[i] !== undefined) o[f.name] = evalNode(node.args[i], ctx);
    else o[f.name] = f.default ? evalNode(f.default, ctx) : NaN;
  });
  return o;
}

// ------------------------------------------------------------ matrices
interface PineMatrix { __matrix: true; data: any[][] }
const isMatrix = (m: any): m is PineMatrix => !!(m && m.__matrix);
function evalMatrix(name: string, A: (i: number, key: string, def?: any) => any): { handled: boolean; value?: any } {
  const m = () => { const v = A(0, "id"); return isMatrix(v) ? v : null; };
  switch (name) {
    case "matrix.new": {
      const rows = Math.max(0, Math.round(A(0, "rows", 0))), cols = Math.max(0, Math.round(A(1, "columns", 0))), init = A(2, "initial_value", NaN);
      return { handled: true, value: { __matrix: true, data: Array.from({ length: rows }, () => new Array(cols).fill(init)) } };
    }
    case "matrix.rows": return { handled: true, value: m()?.data.length ?? 0 };
    case "matrix.columns": { const x = m(); return { handled: true, value: x && x.data.length ? x.data[0].length : 0 }; }
    case "matrix.elements_count": { const x = m(); return { handled: true, value: x ? x.data.reduce((a, r) => a + r.length, 0) : 0 }; }
    case "matrix.get": { const x = m(); const r = x?.data[Math.round(A(1, "row"))]; return { handled: true, value: r ? r[Math.round(A(2, "column"))] ?? NaN : NaN }; }
    case "matrix.set": { const x = m(); const r = x?.data[Math.round(A(1, "row"))]; if (r) r[Math.round(A(2, "column"))] = A(3, "value"); return { handled: true, value: NaN }; }
    case "matrix.row": { const x = m(); const r = x?.data[Math.round(A(1, "row"))]; return { handled: true, value: r ? r.slice() : [] }; }
    case "matrix.col": { const x = m(); const c = Math.round(A(1, "column")); return { handled: true, value: x ? x.data.map((r) => r[c]) : [] }; }
    case "matrix.add_row": {
      const x = m(); if (!x) return { handled: true, value: NaN };
      const arr = A(2, "array_id", undefined);
      const idx = A(1, "row", x.data.length);
      const at = typeof idx === "number" && !isNaN(idx) ? Math.round(idx) : x.data.length;
      const cols = x.data.length ? x.data[0].length : (Array.isArray(arr) ? arr.length : 0);
      x.data.splice(at, 0, Array.isArray(arr) ? arr.slice() : new Array(cols).fill(NaN));
      return { handled: true, value: NaN };
    }
    case "matrix.remove_row": {
      const x = m(); if (!x || !x.data.length) return { handled: true, value: [] };
      const idx = A(1, "row", x.data.length - 1);
      return { handled: true, value: x.data.splice(Math.round(idx), 1)[0] || [] };
    }
    case "matrix.fill": { const x = m(); const v = A(1, "value"); x?.data.forEach((r) => r.fill(v)); return { handled: true, value: NaN }; }
    case "matrix.copy": { const x = m(); return { handled: true, value: x ? { __matrix: true, data: x.data.map((r) => r.slice()) } : NaN }; }
  }
  return { handled: false };
}

// ------------------------------------------------------------- pivots
// ta.pivot_point_levels(type, anchor, developing): [P, R1, S1, R2, S2, R3, S3, R4, S4, R5, S5] from
// the last finished period's high / low / close (developing: the current period's so far)
function pivotLevels(type: string, h: number, l: number, c: number, o: number, curOpen: number): number[] {
  const r = h - l;
  const na = NaN;
  switch (type) {
    case "Fibonacci": { const p = (h + l + c) / 3; return [p, p + 0.382 * r, p - 0.382 * r, p + 0.618 * r, p - 0.618 * r, p + r, p - r, na, na, na, na]; }
    case "Woodie": { const p = (h + l + 2 * curOpen) / 4; const r3 = h + 2 * (p - l), s3 = l - 2 * (h - p); return [p, 2 * p - l, 2 * p - h, p + r, p - r, r3, s3, r3 + r, s3 - r, na, na]; }
    case "Classic": { const p = (h + l + c) / 3; return [p, 2 * p - l, 2 * p - h, p + r, p - r, p + 2 * r, p - 2 * r, p + 3 * r, p - 3 * r, na, na]; }
    case "DM": { const x = c < o ? h + 2 * l + c : c > o ? 2 * h + l + c : h + l + 2 * c; const p = x / 4; return [p, x / 2 - l, x / 2 - h, na, na, na, na, na, na, na, na]; }
    case "Camarilla": {
      const p = (h + l + c) / 3, k = 1.1 * r;
      const r5 = (h / l) * c;
      return [p, c + k / 12, c - k / 12, c + k / 6, c - k / 6, c + k / 4, c - k / 4, c + k / 2, c - k / 2, r5, c - (r5 - c)];
    }
    default: { // Traditional
      const p = (h + l + c) / 3;
      return [p, 2 * p - l, 2 * p - h, p + r, p - r, 2 * p + (h - 2 * l), 2 * p - (2 * h - l), 3 * p + (h - 3 * l), 3 * p - (3 * h - l), 4 * p + (h - 4 * l), 4 * p - (4 * h - l)];
    }
  }
}

// Bars of a higher timeframe built from the chart's own bars (no extra download): what
// request.security() uses for a timeframe that wasn't fetched
function periodKey(t: number, tf: string): number {
  const u = tf.trim().toUpperCase();
  const n = parseInt(u, 10) || 1;
  const d = new Date(t * 1000);
  if (/M$/.test(u) && !/^\d+$/.test(u)) return Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / n);
  if (/W$/.test(u)) return Math.floor((t / 86400 + 3) / 7 / n);
  if (/D$/.test(u)) return Math.floor(t / 86400 / n);
  const sec = pineTimeframeToSeconds(u) || 86400;
  return Math.floor(t / sec);
}
function periodStart(key: number, tf: string): number {
  const u = tf.trim().toUpperCase();
  const n = parseInt(u, 10) || 1;
  if (/M$/.test(u) && !/^\d+$/.test(u)) { const months = key * n; return Date.UTC(Math.floor(months / 12), months % 12, 1) / 1000; }
  if (/W$/.test(u)) return (key * 7 * n - 3) * 86400;
  if (/D$/.test(u)) return key * n * 86400;
  return key * (pineTimeframeToSeconds(u) || 86400);
}
function aggregateBars(bars: Bar[], tf: string): Bar[] {
  const out: Bar[] = [];
  let key: number | null = null;
  for (const b of bars) {
    const k = periodKey(b.time, tf);
    if (k !== key) { key = k; out.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }); }
    else { const o = out[out.length - 1]; o.high = Math.max(o.high, b.high); o.low = Math.min(o.low, b.low); o.close = b.close; o.volume = (o.volume ?? 0) + (b.volume ?? 0); }
  }
  return out;
}

function evalCall(node: Extract<Expr, { type: "call" }>, ctx: Ctx): any {
  const name = node.name;
  const cs = (ctx.callState[node.id] = ctx.callState[node.id] || {});
  const argAt = (i: number) => (node.args[i] !== undefined ? evalNode(node.args[i], ctx) : undefined);
  // An argument given by position or by its Pine parameter name, else the default
  const A = (i: number, key: string, def?: any): any => {
    if (node.namedArgs[key] !== undefined) return evalNode(node.namedArgs[key], ctx);
    if (node.args[i] !== undefined) return evalNode(node.args[i], ctx);
    return def === undefined ? NaN : def;
  };

  switch (name) {
    // ---- ta.*: the indicator library (pineBuiltins.ts), one series state per call site ----
    case "ta.sma": return B.sma(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.ema": return B.ema(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.rma": return B.rma(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.wma": return B.wma(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.vwma": return B.vwma(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.hma": return B.hma(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.swma": return B.swma(cs, ctx, A(0, "source"));
    case "ta.alma": return B.alma(cs, ctx, A(0, "series"), A(1, "length"), A(2, "offset", 0.85), A(3, "sigma", 6), truthy(A(4, "floor", false)));
    case "ta.stdev": return B.stdev(cs, ctx, A(0, "source"), A(1, "length"), truthy(A(2, "biased", true)));
    case "ta.variance": return B.variance(cs, ctx, A(0, "source"), A(1, "length"), truthy(A(2, "biased", true)));
    case "ta.dev": return B.dev(cs, ctx, A(0, "source"), A(1, "length"));
    // ta.highest(length) / ta.lowest(length) read high / low
    case "ta.highest": return node.args.length + Object.keys(node.namedArgs).length >= 2 ? B.highest(cs, ctx, A(0, "source"), A(1, "length")) : B.highest(cs, ctx, ctx.bar.high, A(0, "length"));
    case "ta.lowest": return node.args.length + Object.keys(node.namedArgs).length >= 2 ? B.lowest(cs, ctx, A(0, "source"), A(1, "length")) : B.lowest(cs, ctx, ctx.bar.low, A(0, "length"));
    case "ta.highestbars": return node.args.length + Object.keys(node.namedArgs).length >= 2 ? B.highestbars(cs, ctx, A(0, "source"), A(1, "length")) : B.highestbars(cs, ctx, ctx.bar.high, A(0, "length"));
    case "ta.lowestbars": return node.args.length + Object.keys(node.namedArgs).length >= 2 ? B.lowestbars(cs, ctx, A(0, "source"), A(1, "length")) : B.lowestbars(cs, ctx, ctx.bar.low, A(0, "length"));
    case "ta.change": return B.change(cs, ctx, A(0, "source"), A(1, "length", 1));
    case "ta.mom": return B.mom(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.roc": return B.roc(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.rising": return B.rising(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.falling": return B.falling(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.crossover": return B.crossover(cs, ctx, A(0, "source1"), A(1, "source2"));
    case "ta.crossunder": return B.crossunder(cs, ctx, A(0, "source1"), A(1, "source2"));
    case "ta.cross": return B.cross(cs, ctx, A(0, "source1"), A(1, "source2"));
    case "ta.tr": return B.tr(cs, ctx, truthy(A(0, "handle_na", false)));
    case "ta.atr": return B.atr(cs, ctx, A(0, "length"));
    // ta.pivothigh(left, right) / ta.pivotlow(left, right) read high / low
    case "ta.pivothigh": return node.args.length + Object.keys(node.namedArgs).length >= 3 ? B.pivothigh(cs, ctx, A(0, "source"), A(1, "leftbars"), A(2, "rightbars")) : B.pivothigh(cs, ctx, ctx.bar.high, A(0, "leftbars"), A(1, "rightbars"));
    case "ta.pivotlow": return node.args.length + Object.keys(node.namedArgs).length >= 3 ? B.pivotlow(cs, ctx, A(0, "source"), A(1, "leftbars"), A(2, "rightbars")) : B.pivotlow(cs, ctx, ctx.bar.low, A(0, "leftbars"), A(1, "rightbars"));
    case "ta.cum": return B.cum(cs, ctx, A(0, "source"));
    case "math.sum": return B.sum(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.max": return B.allTimeMax(cs, ctx, A(0, "source"));
    case "ta.min": return B.allTimeMin(cs, ctx, A(0, "source"));
    case "ta.linreg": return B.linreg(cs, ctx, A(0, "source"), A(1, "length"), A(2, "offset", 0));
    case "ta.correlation": return B.correlation(cs, ctx, A(0, "source1"), A(1, "source2"), A(2, "length"));
    case "ta.percentrank": return B.percentrank(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.percentile_linear_interpolation": return B.percentile(cs, ctx, A(0, "source"), A(1, "length"), A(2, "percentage"), true);
    case "ta.percentile_nearest_rank": return B.percentile(cs, ctx, A(0, "source"), A(1, "length"), A(2, "percentage"), false);
    case "ta.median": return B.median(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.range": return B.range(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.cci": return B.cci(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.cmo": return B.cmo(cs, ctx, A(0, "series"), A(1, "length"));
    case "ta.rsi": return B.rsi(cs, ctx, A(0, "source"), A(1, "length"));
    case "ta.mfi": return B.mfi(cs, ctx, A(0, "series"), A(1, "length"));
    case "ta.stoch": return B.stoch(cs, ctx, A(0, "source"), A(1, "high"), A(2, "low"), A(3, "length"));
    case "ta.wpr": return B.wpr(cs, ctx, A(0, "length"));
    case "ta.tsi": return B.tsi(cs, ctx, A(0, "source"), A(1, "short_length"), A(2, "long_length"));
    case "ta.macd": return B.macd(cs, ctx, A(0, "source"), A(1, "fastlen"), A(2, "slowlen"), A(3, "siglen"));
    case "ta.bb": return B.bb(cs, ctx, A(0, "series"), A(1, "length"), A(2, "mult"));
    case "ta.bbw": return B.bbw(cs, ctx, A(0, "series"), A(1, "length"), A(2, "mult"));
    case "ta.kc": return B.kc(cs, ctx, A(0, "series"), A(1, "length"), A(2, "mult"), truthy(A(3, "useTrueRange", true)));
    case "ta.kcw": return B.kcw(cs, ctx, A(0, "series"), A(1, "length"), A(2, "mult"), truthy(A(3, "useTrueRange", true)));
    case "ta.dmi": return B.dmi(cs, ctx, A(0, "diLength"), A(1, "adxSmoothing"));
    case "ta.sar": return B.sar(cs, ctx, A(0, "start"), A(1, "inc"), A(2, "max"));
    case "ta.supertrend": return B.supertrend(cs, ctx, A(0, "factor"), A(1, "atrPeriod"));
    case "ta.vwap": {
      // ta.vwap(source) resets each day; ta.vwap(source, anchor) when anchor is true; with
      // stdev_mult it returns [vwap, upper band, lower band]
      const src = A(0, "source", (ctx.bar.high + ctx.bar.low + ctx.bar.close) / 3);
      const hasAnchor = node.args[1] !== undefined || node.namedArgs.anchor !== undefined;
      const hasMult = node.args[2] !== undefined || node.namedArgs.stdev_mult !== undefined;
      if (!hasAnchor) return B.vwap(cs, ctx, src);
      const r = B.vwapAnchored(cs, ctx, src, truthy(A(1, "anchor")), hasMult ? A(2, "stdev_mult") : 1);
      return hasMult ? r : r[0];
    }
    case "ta.barssince": {
      const cond = truthy(argAt(0));
      if (cs.lastBar !== ctx.barIndex) {
        cs.count = cond ? 0 : (cs.count === undefined ? NaN : cs.count + 1);
        cs.lastBar = ctx.barIndex;
      }
      return cs.count;
    }
    case "ta.valuewhen": {
      const cond = truthy(argAt(0)), v = argAt(1), occurrence = node.args[2] !== undefined ? Math.round(argAt(2)) : 0;
      if (cs.lastBar !== ctx.barIndex) {
        if (!cs.hist) cs.hist = [];
        if (cond) cs.hist.unshift(v);
        cs.lastBar = ctx.barIndex;
      }
      return cs.hist && cs.hist[occurrence] !== undefined ? cs.hist[occurrence] : NaN;
    }
    case "fixnan": { const v = argAt(0); if (!B.isNa(v)) cs.last = v; return cs.last ?? NaN; }
    case "str.tostring": {
      const v = argAt(0);
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") {
        if (isNaN(v)) return "NaN";
        if (node.args[1] !== undefined) {
          const fmt = String(argAt(1));
          // format.mintick / price / percent / volume
          if (fmt === "mintick" || fmt === "price") { const dec = Math.max(0, Math.round(-Math.log10(minTick(ctx)))); return v.toFixed(dec); }
          if (fmt === "percent") return `${v.toFixed(2)}%`;
          if (fmt === "volume") { const a = Math.abs(v); return a >= 1e9 ? `${(v / 1e9).toFixed(3)}B` : a >= 1e6 ? `${(v / 1e6).toFixed(3)}M` : a >= 1e3 ? `${(v / 1e3).toFixed(3)}K` : String(Math.round(v)); }
          const decMatch = fmt.match(/\.(#+)/);
          if (decMatch) return v.toFixed(decMatch[1].length);
          if (/^#+$/.test(fmt)) return String(Math.round(v));
        }
        return String(v);
      }
      return String(v);
    }
    case "str.format": {
      let fmt = String(argAt(0));
      for (let i = 1; i < node.args.length; i++) fmt = fmt.split(`{${i - 1}}`).join(String(argAt(i)));
      return fmt;
    }
    case "str.length": return String(argAt(0)).length;
    case "str.tonumber": { const v = parseFloat(String(argAt(0))); return isNaN(v) ? NaN : v; }
    case "year": return new Date(node.args[0] !== undefined ? argAt(0) : ctx.bar.time * 1000).getUTCFullYear();
    case "month": return new Date(node.args[0] !== undefined ? argAt(0) : ctx.bar.time * 1000).getUTCMonth() + 1;
    case "dayofmonth": return new Date(node.args[0] !== undefined ? argAt(0) : ctx.bar.time * 1000).getUTCDate();
    case "dayofweek": return new Date(node.args[0] !== undefined ? argAt(0) : ctx.bar.time * 1000).getUTCDay() + 1;
    case "hour": return new Date(node.args[0] !== undefined ? argAt(0) : ctx.bar.time * 1000).getUTCHours();
    case "minute": return new Date(node.args[0] !== undefined ? argAt(0) : ctx.bar.time * 1000).getUTCMinutes();
    case "second": return new Date(node.args[0] !== undefined ? argAt(0) : ctx.bar.time * 1000).getUTCSeconds();
    case "math.max": return Math.max(...node.args.map((_, i) => argAt(i)));
    case "math.min": return Math.min(...node.args.map((_, i) => argAt(i)));
    case "math.avg": { const xs = node.args.map((_, i) => Number(argAt(i))); return xs.reduce((a, b) => a + b, 0) / xs.length; }
    case "math.abs": return Math.abs(argAt(0));
    case "math.round": {
      const v = argAt(0), prec = node.args[1] !== undefined ? Math.round(argAt(1)) : 0;
      if (B.isNa(v)) return NaN;
      const f = Math.pow(10, prec);
      return Math.round(v * f) / f;
    }
    case "math.round_to_mintick": { const t = minTick(ctx); return Math.round(argAt(0) / t) * t; }
    case "math.floor": return Math.floor(argAt(0));
    case "math.ceil": return Math.ceil(argAt(0));
    case "math.sqrt": return Math.sqrt(argAt(0));
    case "math.pow": return Math.pow(argAt(0), argAt(1));
    case "math.log": return Math.log(argAt(0));
    case "math.log10": return Math.log10(argAt(0));
    case "math.exp": return Math.exp(argAt(0));
    case "math.sign": return Math.sign(argAt(0));
    case "math.sin": return Math.sin(argAt(0));
    case "math.cos": return Math.cos(argAt(0));
    case "math.tan": return Math.tan(argAt(0));
    case "math.asin": return Math.asin(argAt(0));
    case "math.acos": return Math.acos(argAt(0));
    case "math.atan": return Math.atan(argAt(0));
    case "math.todegrees": return (argAt(0) * 180) / Math.PI;
    case "math.toradians": return (argAt(0) * Math.PI) / 180;
    case "math.random": { const lo = node.args[0] !== undefined ? argAt(0) : 0, hi = node.args[1] !== undefined ? argAt(1) : 1; return lo + Math.random() * (hi - lo); }
    case "nz": { const v = argAt(0); const fb = node.args[1] !== undefined ? argAt(1) : 0; return v === undefined || (typeof v === "number" && isNaN(v)) ? fb : v; }
    case "na": { const v = argAt(0); return v === undefined || v === null || (typeof v === "number" && isNaN(v)); }
    case "int": { const v = argAt(0); return B.isNa(v) ? NaN : Math.trunc(v); }
    case "float": return Number(argAt(0));
    case "bool": return truthy(argAt(0));
    case "string": return String(argAt(0));
    case "timestamp": {
      // timestamp(year, month, day, hour, minute, second) or timestamp(timezone, year, …), UTC
      const xs = node.args.map((_, i) => argAt(i)).filter((x) => typeof x === "number");
      if (!xs.length) { const t = Date.parse(String(argAt(0))); return isNaN(t) ? NaN : t; }
      return Date.UTC(xs[0], (xs[1] ?? 1) - 1, xs[2] ?? 1, xs[3] ?? 0, xs[4] ?? 0, xs[5] ?? 0);
    }

    // ---- color.* ----
    case "color.new": return B.colorNew(A(0, "color"), A(1, "transp", 0));
    case "color.rgb": return B.colorRgb(A(0, "red"), A(1, "green"), A(2, "blue"), A(3, "transp", 0));
    case "color.r": return B.colorPart(argAt(0), "r");
    case "color.g": return B.colorPart(argAt(0), "g");
    case "color.b": return B.colorPart(argAt(0), "b");
    case "color.t": return B.colorPart(argAt(0), "t");
    case "color.from_gradient": return B.fromGradient(A(0, "value"), A(1, "bottom_value"), A(2, "top_value"), A(3, "bottom_color"), A(4, "top_color"));

    // ---- str.* ----
    case "str.contains": return String(argAt(0)).includes(String(argAt(1)));
    case "str.startswith": return String(argAt(0)).startsWith(String(argAt(1)));
    case "str.endswith": return String(argAt(0)).endsWith(String(argAt(1)));
    case "str.pos": { const i = String(argAt(0)).indexOf(String(argAt(1))); return i < 0 ? NaN : i; }
    case "str.lower": return String(argAt(0)).toLowerCase();
    case "str.upper": return String(argAt(0)).toUpperCase();
    case "str.trim": return String(argAt(0)).trim();
    case "str.substring": { const s = String(argAt(0)); return node.args[2] !== undefined ? s.substring(argAt(1), argAt(2)) : s.substring(argAt(1)); }
    case "str.replace": {
      const s = String(argAt(0)), target = String(argAt(1)), repl = String(argAt(2)), occ = node.args[3] !== undefined ? Math.round(argAt(3)) : 0;
      let from = 0;
      for (let k = 0; k <= occ; k++) { const at = s.indexOf(target, from); if (at < 0) return s; if (k === occ) return s.slice(0, at) + repl + s.slice(at + target.length); from = at + target.length; }
      return s;
    }
    case "str.replace_all": return String(argAt(0)).split(String(argAt(1))).join(String(argAt(2)));
    case "str.split": return String(argAt(0)).split(String(argAt(1)));
    case "str.repeat": { const n = Math.max(0, Math.round(argAt(1))); const sep = node.args[2] !== undefined ? String(argAt(2)) : ""; return new Array(n).fill(String(argAt(0))).join(sep); }
    case "input": case "input.int": case "input.float": case "input.bool": case "input.string": case "input.color":
    case "input.timeframe": case "input.session": case "input.symbol": case "input.source": case "input.text_area": case "input.price": case "input.time": {
      const v = node.namedArgs.defval ? evalNode(node.namedArgs.defval, ctx) : (node.args[0] !== undefined ? argAt(0) : NaN);
      // Captured once (bar 0) for the on-chart legend line, which lists each
      // input's current value the way TradingView's own legend does.
      // input.source shows its source's name ("close"), not a price
      const src = node.namedArgs.defval ?? node.args[0];
      const label = name === "input.source" && src?.type === "ident" ? src.name : v;
      if (ctx.barIndex === 0) ctx.inputsList.push({ value: label, isBool: name === "input.bool" });
      return v;
    }

    // ---- arrays: a Pine array is represented directly as a plain JS array,
    // since nothing here needs to distinguish it from a tuple-return value. ----
    case "array.new_float": case "array.new_int": case "array.new_bool": case "array.new_string":
    case "array.new_line": case "array.new_label": case "array.new_box": case "array.new_color": {
      const size = node.args[0] !== undefined ? Math.max(0, Math.round(argAt(0))) : 0;
      const initVal = node.args[1] !== undefined ? argAt(1) : (name === "array.new_bool" ? false : name === "array.new_string" ? "" : NaN);
      return new Array(size).fill(initVal);
    }
    case "array.from": return node.args.map((_, i) => argAt(i));
    case "array.push": { const arr = argAt(0); if (Array.isArray(arr)) arr.push(argAt(1)); return NaN; }
    case "array.unshift": { const arr = argAt(0); if (Array.isArray(arr)) arr.unshift(argAt(1)); return NaN; }
    case "array.get": { const arr = argAt(0); const i = Math.round(argAt(1)); return Array.isArray(arr) && arr[i] !== undefined ? arr[i] : NaN; }
    case "array.set": { const arr = argAt(0); const i = Math.round(argAt(1)); if (Array.isArray(arr)) arr[i] = argAt(2); return NaN; }
    case "array.size": { const arr = argAt(0); return Array.isArray(arr) ? arr.length : 0; }
    case "array.max": { const arr = argAt(0); return Array.isArray(arr) && arr.length ? Math.max(...arr) : NaN; }
    case "array.min": { const arr = argAt(0); return Array.isArray(arr) && arr.length ? Math.min(...arr) : NaN; }
    case "array.avg": { const arr = argAt(0); return Array.isArray(arr) && arr.length ? arr.reduce((a: number, b: number) => a + b, 0) / arr.length : NaN; }
    case "array.sum": { const arr = argAt(0); return Array.isArray(arr) ? arr.reduce((a: number, b: number) => a + b, 0) : 0; }
    case "array.copy": { const arr = argAt(0); return Array.isArray(arr) ? arr.slice() : []; }
    case "array.slice": { const arr = argAt(0); return Array.isArray(arr) ? arr.slice(Math.round(argAt(1)), Math.round(argAt(2))) : []; }
    case "array.shift": { const arr = argAt(0); return Array.isArray(arr) && arr.length ? arr.shift() : NaN; }
    case "array.pop": { const arr = argAt(0); return Array.isArray(arr) && arr.length ? arr.pop() : NaN; }
    case "array.insert": { const arr = argAt(0); if (Array.isArray(arr)) arr.splice(Math.round(argAt(1)), 0, argAt(2)); return NaN; }
    case "array.remove": { const arr = argAt(0); if (Array.isArray(arr)) { const [v] = arr.splice(Math.round(argAt(1)), 1); return v ?? NaN; } return NaN; }
    case "array.clear": { const arr = argAt(0); if (Array.isArray(arr)) arr.length = 0; return NaN; }
    case "array.includes": { const arr = argAt(0); return Array.isArray(arr) ? arr.includes(argAt(1)) : false; }
    case "array.indexof": { const arr = argAt(0); return Array.isArray(arr) ? arr.indexOf(argAt(1)) : -1; }
    case "array.sort": {
      const arr = argAt(0);
      const order = node.args[1] !== undefined ? argAt(1) : "ascending";
      if (Array.isArray(arr)) arr.sort((a: number, b: number) => (order === "descending" ? b - a : a - b));
      return NaN;
    }

    // ---- more array.* ----
    case "array.new": {
      const size = Math.max(0, Math.round(A(0, "size", 0)));
      return new Array(size).fill(A(1, "initial_value", NaN));
    }
    case "array.first": { const arr = argAt(0); return Array.isArray(arr) && arr.length ? arr[0] : NaN; }
    case "array.last": { const arr = argAt(0); return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : NaN; }
    case "array.reverse": { const arr = argAt(0); if (Array.isArray(arr)) arr.reverse(); return NaN; }
    case "array.fill": { const arr = argAt(0); if (Array.isArray(arr)) { const from = node.args[2] !== undefined ? Math.round(argAt(2)) : 0; const to = node.args[3] !== undefined ? Math.round(argAt(3)) : arr.length; arr.fill(argAt(1), from, to); } return NaN; }
    case "array.concat": { const a = argAt(0), b = argAt(1); if (Array.isArray(a) && Array.isArray(b)) a.push(...b); return a; }
    case "array.join": { const arr = argAt(0); return Array.isArray(arr) ? arr.map(String).join(node.args[1] !== undefined ? String(argAt(1)) : ",") : ""; }
    case "array.lastindexof": { const arr = argAt(0); return Array.isArray(arr) ? arr.lastIndexOf(argAt(1)) : -1; }
    case "array.range": { const arr = argAt(0); return Array.isArray(arr) && arr.length ? Math.max(...arr) - Math.min(...arr) : NaN; }
    case "array.median": { const arr = argAt(0); if (!Array.isArray(arr) || !arr.length) return NaN; const s2 = arr.slice().sort((a: number, b: number) => a - b); const m = s2.length >> 1; return s2.length % 2 ? s2[m] : (s2[m - 1] + s2[m]) / 2; }
    case "array.stdev": { const arr = argAt(0); if (!Array.isArray(arr) || !arr.length) return NaN; const mean = arr.reduce((a: number, b: number) => a + b, 0) / arr.length; return Math.sqrt(arr.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / arr.length); }

    // ---- pivots ----
    case "ta.pivot_point_levels": {
      // Levels from the last finished period (developing: from the current one so far); the period
      // ends whenever `anchor` is true
      const type = String(A(0, "type", "Traditional"));
      const anchor = truthy(A(1, "anchor"));
      const developing = truthy(A(2, "developing", false));
      const b = ctx.bar;
      if (cs.lastBar !== ctx.barIndex) {
        cs.lastBar = ctx.barIndex;
        if (anchor && cs.cur) { cs.prev = cs.cur; cs.cur = null; }
        if (!cs.cur) cs.cur = { o: b.open, h: b.high, l: b.low, c: b.close };
        else { cs.cur.h = Math.max(cs.cur.h, b.high); cs.cur.l = Math.min(cs.cur.l, b.low); cs.cur.c = b.close; }
      }
      const src = developing ? cs.cur : cs.prev;
      if (!src) return new Array(11).fill(NaN);
      return pivotLevels(type, src.h, src.l, src.c, src.o, developing ? cs.cur.c : cs.cur.o);
    }

    // ---- symbols, time ----
    case "ticker.modify": case "ticker.new": case "ticker.standard": case "ticker.heikinashi": return node.args[0] !== undefined ? argAt(0) : ctx.symbol;
    case "time": case "time_close": {
      // time(timeframe, session, bars_back, timeframe_bars_back): a bar's open time (ms)
      const tf = String(A(0, "timeframe", "") || "");
      const barsBack = Math.round(Number(A(2, "bars_back", 0)) || 0);
      const tfBack = Math.round(Number(A(3, "timeframe_bars_back", 0)) || 0);
      const t = timeOfIndex(ctx, ctx.barIndex - barsBack);
      if (!tf || tf === ctx.pineTf) return (t + (name === "time_close" ? ctx.barDurationSec : 0)) * 1000;
      const key = periodKey(t, tf) - tfBack;
      return (name === "time_close" ? periodStart(key + 1, tf) : periodStart(key, tf)) * 1000;
    }
    case "runtime.error": throw new PineError(String(argAt(0) ?? "Runtime error"), "RE10001");
    case "timeframe.change": {
      // True on the first bar of each new period of that timeframe ("D", "W", "M", "60"…)
      const tf = String(A(0, "timeframe", ctx.pineTf));
      const t = ctx.bar.time;
      let key: number;
      if (/^\d*M$/i.test(tf)) { const d = new Date(t * 1000); const n = parseInt(tf, 10) || 1; key = Math.floor((d.getUTCFullYear() * 12 + d.getUTCMonth()) / n); }
      else if (/^\d*W$/i.test(tf)) key = Math.floor((t / 86400 + 3) / 7 / (parseInt(tf, 10) || 1));
      else { const sec = pineTimeframeToSeconds(tf) || 86400; key = Math.floor(t / sec); }
      if (cs.lastBar !== ctx.barIndex) { cs.result = cs.key !== undefined && key !== cs.key; cs.key = key; cs.lastBar = ctx.barIndex; }
      return cs.result;
    }
    case "timeframe.in_seconds": return pineTimeframeToSeconds(String(node.args[0] !== undefined ? argAt(0) : ctx.pineTf));

    case "request.security": return evalRequestSecurity(node, ctx);
    case "request.security_lower_tf": return evalRequestSecurityLowerTf(node, ctx);

    // table.new() is a VALUE (assigned via `var table tbl = table.new(...)`),
    // so it lives here rather than in execExprStatement. `var`'s existing
    // skip-reassignment semantics mean this only actually runs once (bar 0),
    // so pushing to ctx.tables here can't create duplicates for one script.
    case "table.new": {
      const position = String(argAt(0));
      const columns = Math.max(1, Math.round(argAt(1)));
      const rows = Math.max(1, Math.round(argAt(2)));
      const bgcolor = node.namedArgs.bgcolor !== undefined ? String(evalNode(node.namedArgs.bgcolor, ctx)) : (node.args[3] !== undefined ? String(argAt(3)) : undefined);
      const borderColor = node.namedArgs.border_color !== undefined ? String(evalNode(node.namedArgs.border_color, ctx)) : undefined;
      const table = {
        __pineTable: true, position, columns, rows, bgcolor, borderColor,
        cells: Array.from({ length: rows }, () => new Array(columns).fill(null)),
      };
      ctx.tables.push(table);
      return table;
    }

    case "strategy.closedtrades.profit": { const t = ctx.strategyState.closedTrades[Math.round(argAt(0))]; return t ? t.netPnl : NaN; }
    case "strategy.closedtrades.entry_price": { const t = ctx.strategyState.closedTrades[Math.round(argAt(0))]; return t ? t.entryPrice : NaN; }
    case "strategy.closedtrades.exit_price": { const t = ctx.strategyState.closedTrades[Math.round(argAt(0))]; return t ? t.exitPrice : NaN; }
    case "strategy.closedtrades.size": { const t = ctx.strategyState.closedTrades[Math.round(argAt(0))]; return t ? (t.type === "Long" ? t.qty : -t.qty) : NaN; }

    default: {
      const g = ctx.globalCtx || ctx;
      const fn = ctx.functions[name];
      if (fn) return callUserFunction(fn, node, ctx);
      // MyType.new(…) / MyType.copy(obj)
      const dot = name.lastIndexOf(".");
      if (dot > 0 && g.types) {
        const def = g.types[name.slice(0, dot)];
        if (def && name.slice(dot + 1) === "new") return newObject(def, node, ctx);
        if (def && name.slice(dot + 1) === "copy") { const o = argAt(0); return o && typeof o === "object" ? { ...o } : NaN; }
      }
      // obj.method(…) / obj.field.method(…) on a variable
      if (dot > 0) {
        const segs = name.split(".");
        const head = varOf(ctx, segs[0]);
        if (head.found) return evalMethod(walkFields(head.value, segs.slice(1, -1)), segs[segs.length - 1], node, ctx);
      }
      const mx = evalMatrix(name, A);
      if (mx.handled) return mx.value;
      const drawn = evalDrawing(name, node, ctx);
      if (drawn.handled) return drawn.value;
      // linefill / polyline aren't drawn yet: the script still runs
      if (DRAWING_NAMESPACES.some((ns) => name.startsWith(ns))) {
        warnOnce(ctx, `'${name.split(".")[0]}.*' drawings aren't supported by this editor yet and were skipped.`);
        return NaN;
      }
      // A function we don't have stops the script with a clear error instead of quietly giving na
      throw new PineError(PINE_FUNCTIONS.has(name) ? `'${name}()' isn't supported by this editor yet` : `Could not find function or function reference '${name}'`, "CE10003");
    }
  }
}

function evalNode(node: Expr, ctx: Ctx): any {
  switch (node.type) {
    case "num": return node.value;
    case "str": return node.value;
    case "ident": return resolveIdent(node.name, ctx);
    case "neg": return -evalNode(node.expr, ctx);
    case "not": return !truthy(evalNode(node.expr, ctx));
    case "or": return truthy(evalNode(node.left, ctx)) || truthy(evalNode(node.right, ctx));
    case "and": return truthy(evalNode(node.left, ctx)) && truthy(evalNode(node.right, ctx));
    case "cmp": {
      const l = evalNode(node.left, ctx), r = evalNode(node.right, ctx);
      switch (node.op) {
        case "==": return l === r;
        case "!=": return l !== r;
        case "<": return Number(l) < Number(r);
        case "<=": return Number(l) <= Number(r);
        case ">": return Number(l) > Number(r);
        case ">=": return Number(l) >= Number(r);
      }
      return false;
    }
    case "arith": {
      const l = evalNode(node.left, ctx), r = evalNode(node.right, ctx);
      if (node.op === "+" && (typeof l === "string" || typeof r === "string")) return String(l) + String(r);
      switch (node.op) {
        case "+": return Number(l) + Number(r);
        case "-": return Number(l) - Number(r);
        case "*": return Number(l) * Number(r);
        case "/": return Number(l) / Number(r);
        case "%": return Number(l) % Number(r);
      }
      return NaN;
    }
    case "ternary": return truthy(evalNode(node.cond, ctx)) ? evalNode(node.t, ctx) : evalNode(node.f, ctx);
    case "histref": {
      const offset = Math.round(evalNode(node.offset, ctx));
      const idx = ctx.barIndex - offset;
      if (idx < 0) return NaN;
      if (node.base.type === "ident") {
        const bn = node.base.name;
        if (["close", "open", "high", "low", "volume"].includes(bn)) return (ctx.bars[idx] as any)[bn] ?? NaN;
        if (bn === "bar_index") return idx;
        const h = ctx.varHistory[bn];
        return h && h[idx] !== undefined ? h[idx] : NaN;
      }
      // `ta.sma(close, 5)[1]`, `(a + b)[2]`: this expression's own per-bar history
      const cs = (ctx.callState[`h${node.id}`] = ctx.callState[`h${node.id}`] || { hist: [] as any[], bar: -1 });
      const cur = evalNode(node.base, ctx);
      if (cs.bar !== ctx.barIndex) { cs.hist[ctx.barIndex] = cur; cs.bar = ctx.barIndex; }
      const v = cs.hist[idx];
      return v === undefined ? NaN : v;
    }
    case "switch": return evalSwitch(node, ctx);
    case "value": return node.value;
    case "field": { const v = evalNode(node.base, ctx); return walkFields(v, node.path.split(".")); }
    case "mcall": {
      const segs = node.name.split(".");
      const recv = walkFields(evalNode(node.recv, ctx), segs.slice(0, -1));
      return evalMethod(recv, segs[segs.length - 1], node, ctx);
    }
    case "call":
      // `u = plot(...)` / `h = hline(...)` (kept for fill()) still draw: the call's side effect
      // runs, and a reference to the plot / level stands in for its value
      if (node.name === "plot" || node.name === "plotshape" || node.name === "plotchar" || node.name === "hline") {
        execExprStatement(node, ctx);
        if (node.name === "plot") return { __plot: node.id };
        if (node.name === "hline") return { __hline: node.id };
        return NaN;
      }
      return evalCall(node, ctx);
    case "tuple": return node.items.map((it) => evalNode(it, ctx));
  }
  return NaN;
}

// The first matching case's block runs and gives the switch its value; no match is na
function evalSwitch(node: Extract<Expr, { type: "switch" }>, ctx: Ctx): any {
  const subject = node.subject ? evalNode(node.subject, ctx) : undefined;
  for (const arm of node.arms) {
    const hit = arm.cond === null ? true : node.subject ? evalNode(arm.cond, ctx) === subject : truthy(evalNode(arm.cond, ctx));
    if (hit) return execFunctionBody(arm.body, ctx);
  }
  return NaN;
}

// Each plot's offset= (bars it's drawn shifted by)
const plotOffsets = new WeakMap<PinePlotResult, any>();

// Drawing-only calls with no effect on values: accepted so scripts run, not drawn here
const KNOWN_IGNORED_CALLS = new Set(["bgcolor", "alertcondition", "alert", "barcolor", "max_bars_back", "library", "export"]);

function execExprStatement(node: Expr, ctx: Ctx) {
  if (node.type === "switch") { evalSwitch(node, ctx); return; }
  if (node.type === "mcall") { evalNode(node, ctx); return; }
  if (node.type !== "call") return;
  const name = node.name;
  const argAt = (i: number) => (node.args[i] !== undefined ? evalNode(node.args[i], ctx) : undefined);
  const namedColor = (key: string): string | null => {
    const n = node.namedArgs[key];
    if (!n) return null;
    const v = evalNode(n, ctx);
    return typeof v === "string" ? v : null;
  };

  // An argument by position or Pine parameter name (plot(series, title, color, linewidth, style, …))
  const arg = (i: number, key: string): any => {
    if (node.namedArgs[key] !== undefined) return evalNode(node.namedArgs[key], ctx);
    if (node.args[i] !== undefined) return evalNode(node.args[i], ctx);
    return undefined;
  };
  const isNaColor = (c: any) => c === undefined ? false : typeof c !== "string" || (B.parseColor(c)?.a === 0);
  // The bar `offset` bars away (plots / shapes drawn shifted), or null off the chart
  const shiftedTime = (offset: any) => {
    const o = typeof offset === "number" && !isNaN(offset) ? Math.round(offset) : 0;
    const i = ctx.barIndex + o;
    if (i < 0) return null;
    // A positive offset runs past the last bar into the future (Ichimoku's cloud)
    return i < ctx.bars.length ? ctx.bars[i].time : timeOfIndex(ctx, i);
  };

  if (name === "plot") {
    if (!ctx.plots[node.id]) {
      const t = arg(1, "title");
      const title = t !== undefined && typeof t === "string" ? t : `Plot ${ctx.plotOrder.length + 1}`;
      const c = arg(2, "color");
      const color = typeof c === "string" ? c : PALETTE[ctx.plotOrder.length % PALETTE.length];
      const lw = arg(3, "linewidth");
      const style = arg(4, "style");
      const display = arg(11, "display");
      ctx.plots[node.id] = {
        title, color, values: [],
        lineWidth: typeof lw === "number" && lw > 0 ? lw : undefined,
        style: typeof style === "string" ? style.replace(/^style_/, "") : undefined,
        // color=na hides it; a per-bar color that starts transparent doesn't
        hidden: display === "none" || (c !== undefined && typeof c !== "string"),
      };
      ctx.plotOrder.push(node.id);
      plotOffsets.set(ctx.plots[node.id], arg(7, "offset"));
    }
    const plot = ctx.plots[node.id];
    const v = argAt(0);
    const time = shiftedTime(arg(7, "offset"));
    if (time !== null && typeof v === "number" && !isNaN(v)) {
      // A per-bar color (color=cond ? a : b) colors that point
      const c = node.namedArgs.color !== undefined || node.args[2] !== undefined ? arg(2, "color") : undefined;
      const point: any = { time, value: v };
      if (typeof c === "string" && c !== plot.color) point.color = isNaColor(c) ? "rgba(0, 0, 0, 0)" : c;
      plot.values.push(point);
    }
    return;
  }
  if (name === "hline") {
    if (!ctx.hlines) ctx.hlines = [];
    if (!ctx.hlines.some((h) => h.id === node.id)) {
      const price = Number(arg(0, "price"));
      const t = arg(1, "title"), c = arg(2, "color"), ls = arg(3, "linestyle"), lw = arg(4, "linewidth"), display = arg(6, "display");
      if (!isNaN(price) && display !== "none") {
        ctx.hlines.push({ id: node.id, price, title: typeof t === "string" ? t : "", color: typeof c === "string" ? c : "#787B86", lineStyle: typeof ls === "string" ? ls.replace(/^style_/, "") : "dashed", lineWidth: typeof lw === "number" ? lw : 1 });
      }
    }
    return;
  }
  if (name === "fill") {
    // Created on the bar it first runs on (the ends are plots or hlines). A color that's an
    // expression (Ichimoku's green / red cloud) is recorded for every bar.
    if (!ctx.fillSeen) ctx.fillSeen = new Map();
    let fill = ctx.fillSeen.get(node.id);
    if (!fill) {
      const ref = (v: any): PineFill["a"] | null => v && typeof v === "object" ? (v.__plot !== undefined ? { kind: "plot", index: v.__plot } : v.__hline !== undefined ? { kind: "hline", index: v.__hline } : null) : null;
      const a = ref(argAt(0)), b = ref(argAt(1));
      if (!a || !b) return;
      // fill(p1, p2, top_value, bottom_value, top_color, bottom_color, …) is the gradient form
      const gradient = node.namedArgs.top_color !== undefined || (node.args.length >= 6 && typeof argAt(2) === "number");
      fill = gradient
        ? { a, b, title: String(arg(6, "title") ?? ""), topValue: Number(arg(2, "top_value")), bottomValue: Number(arg(3, "bottom_value")), topColor: arg(4, "top_color"), bottomColor: arg(5, "bottom_color"), hidden: arg(7, "display") === "none" }
        : { a, b, title: String(arg(3, "title") ?? ""), color: arg(2, "color"), hidden: arg(a.kind === "hline" ? 6 : 7, "display") === "none" };
      ctx.fillSeen.set(node.id, fill);
      (ctx.fills = ctx.fills || []).push(fill);
    }
    if (fill.topValue === undefined) {
      const colorNode = node.namedArgs.color ?? node.args[2];
      if (colorNode && colorNode.type !== "str" && colorNode.type !== "ident") {
        const c = arg(2, "color");
        // keyed by where the plots draw this bar (their offset), as the fill follows them
        const end = fill.a.kind === "plot" ? ctx.plots[fill.a.index] : undefined;
        const at = shiftedTime(end ? plotOffsets.get(end) : 0);
        if (at !== null) (fill.colors = fill.colors || {})[at] = typeof c === "string" ? c : "rgba(0, 0, 0, 0)";
      }
    }
    return;
  }
  if (name === "plotshape" || name === "plotchar") {
    // A bool shows the shape when true; a number shows it when not na (and is its price with
    // location.absolute)
    const v = argAt(0);
    if (typeof v === "number" ? isNaN(v) : !truthy(v)) return;
    const isChar = name === "plotchar";
    const style = isChar ? "" : String(arg(2, "style") ?? "xcross");
    const loc = String(arg(isChar ? 3 : 3, "location") ?? "abovebar");
    const time = shiftedTime(arg(isChar ? 5 : 5, "offset"));
    if (time === null) return;
    const c = arg(isChar ? 4 : 4, "color");
    if (isNaColor(c)) return;
    const color = typeof c === "string" ? c : "#2962FF";
    const tc = arg(7, "textcolor");
    const t = arg(6, "text");
    const text = isChar ? String(arg(2, "char") ?? "★") + (typeof t === "string" ? ` ${t}` : "") : typeof t === "string" ? t.trim() : "";
    const up = /up$/i.test(style), down = /down$/i.test(style);
    const shape: PineMarker["shape"] = up ? "arrowUp" : down ? "arrowDown" : /square|diamond/i.test(style) ? "square" : "circle";
    let position: PineMarker["position"];
    let price: number | undefined;
    if (/absolute/i.test(loc) && typeof v === "number") { price = v; position = down ? "atPriceTop" : up ? "atPriceBottom" : "atPriceMiddle"; }
    else position = /below|bottom/i.test(loc) ? "belowBar" : "aboveBar";
    ctx.markers.push({ time, position, color, shape, text, price, textColor: typeof tc === "string" ? tc : undefined });
    return;
  }
  if (name === "strategy.entry") {
    // Matches TradingView's "Testing period": the script still calculates
    // every bar of full history, but the broker simply isn't accepting new
    // orders outside the selected window.
    if ((ctx.backtestFrom !== undefined && ctx.bar.time < ctx.backtestFrom) || (ctx.backtestTo !== undefined && ctx.bar.time > ctx.backtestTo)) return;
    const id = String(argAt(0));
    const dir = argAt(1);
    const isLong = dir === "long";
    const qty = node.namedArgs.qty !== undefined ? evalNode(node.namedArgs.qty, ctx) : (node.args[2] !== undefined ? argAt(2) : 1);
    const limit = node.namedArgs.limit !== undefined ? evalNode(node.namedArgs.limit, ctx) : null;
    const stop = node.namedArgs.stop !== undefined ? evalNode(node.namedArgs.stop, ctx) : null;
    ctx.strategyState.pendingEntries[id] = { direction: isLong ? "long" : "short", qty: Math.abs(Number(qty) || 0), limit, stop };
    ctx.markers.push({ time: ctx.bar.time, position: isLong ? "belowBar" : "aboveBar", color: isLong ? "#2962ff" : "#f23645", shape: isLong ? "arrowUp" : "arrowDown", text: id });
    return;
  }
  if (name === "strategy.exit") {
    const stop = node.namedArgs.stop !== undefined ? evalNode(node.namedArgs.stop, ctx) : null;
    const limit = node.namedArgs.limit !== undefined ? evalNode(node.namedArgs.limit, ctx) : null;
    const exitId = node.namedArgs.id !== undefined ? String(evalNode(node.namedArgs.id, ctx)) : node.args[0] !== undefined ? String(argAt(0)) : "Exit";
    ctx.strategyState.pendingExit = { id: exitId, stop, limit };
    return;
  }
  if (name === "strategy.cancel" || name === "strategy.cancel_all") {
    if (node.args[0] !== undefined) delete ctx.strategyState.pendingEntries[String(argAt(0))];
    else ctx.strategyState.pendingEntries = {};
    return;
  }
  // A non-empty `comment` replaces the default signal text in the List of trades, as in TradingView
  const closeComment = () => {
    const c = node.namedArgs.comment !== undefined ? evalNode(node.namedArgs.comment, ctx) : null;
    return typeof c === "string" && c !== "" ? c : null;
  };
  if (name === "strategy.close_all") {
    if (ctx.strategyState.position) closeStrategyPosition(ctx, ctx.bar.close, ctx.bar.time, closeComment() ?? "Close position order");
    ctx.strategyState.pendingEntries = {};
    return;
  }
  if (name === "strategy.close") {
    // Closes a position by entry id — these scripts only ever hold one
    // position at a time, so any id match closes the (single) open one.
    const pos = ctx.strategyState.position;
    if (pos) closeStrategyPosition(ctx, ctx.bar.close, ctx.bar.time, closeComment() ?? `Close entry(s) order ${node.args[0] !== undefined ? String(argAt(0)) : pos.id}`);
    return;
  }
  if (name.startsWith("log.")) {
    const msg = node.args.map((a) => String(evalNode(a, ctx))).join(" ");
    ctx.logs.push(`[bar ${ctx.barIndex}] ${msg}`);
    return;
  }
  if (name.startsWith("array.")) { evalNode(node, ctx); return; } // mutators (push/set/sort/...) run for their side effect
  if (name === "table.cell") {
    const table = argAt(0);
    const col = Math.round(argAt(1));
    const row = Math.round(argAt(2));
    const text = node.args[3] !== undefined ? String(argAt(3)) : "";
    const textColor = namedColor("text_color") || undefined;
    const bgcolor = namedColor("bgcolor") || undefined;
    if (table && table.__pineTable && table.cells[row] !== undefined && col >= 0 && col < table.columns) {
      table.cells[row][col] = { text, textColor, bgcolor };
    }
    return;
  }
  if (name === "table.clear") {
    const table = argAt(0);
    if (table && table.__pineTable) {
      const fromCol = node.args[1] !== undefined ? Math.round(argAt(1)) : 0;
      const fromRow = node.args[2] !== undefined ? Math.round(argAt(2)) : 0;
      const toCol = node.args[3] !== undefined ? Math.round(argAt(3)) : table.columns - 1;
      const toRow = node.args[4] !== undefined ? Math.round(argAt(4)) : table.rows - 1;
      for (let r = fromRow; r <= toRow && r < table.rows; r++) {
        for (let c = fromCol; c <= toCol && c < table.columns; c++) table.cells[r][c] = null;
      }
    }
    return;
  }
  if (KNOWN_IGNORED_CALLS.has(name) || name.startsWith("strategy.")) return;
  // Anything else (a user function called for its effects, label.new(…), array.* …) is an
  // ordinary call: evalCall runs it, or raises the error for a function we don't have
  evalCall(node, ctx);
}

function execStmts(stmts: Stmt[], ctx: Ctx) {
  for (const s of stmts) {
    const prof = ctx.globalCtx?.profile;
    const t0 = prof ? performance.now() : 0;
    try {
      switch (s.type) {
        case "if":
          if (truthy(evalNode(s.cond, ctx))) execStmts(s.body, ctx);
          else if (s.elseBody) execStmts(s.elseBody, ctx);
          break;
        case "for": execForStmt(s, ctx, execStmts); break;
        case "forin": execForIn(s, ctx, execStmts); break;
        case "fieldAssign": execFieldAssign(s, ctx); break;
        case "typedef": break;
        case "while": execWhileStmt(s, ctx, execStmts); break;
        case "tupleAssign": execTupleAssign(s, ctx); break;
        case "funcdef": break; // collected into ctx.functions up front; nothing to run per-bar
        case "assign":
          if (!(s.isVarDecl && ctx.barIndex !== 0 && Object.prototype.hasOwnProperty.call(ctx.vars, s.name))) {
            // An input.*() assignment can be overridden by the settings
            // modal (see PineInputMeta/inputOverrides), substituted here
            // after evaluation so the call's other (non-value) args stay real.
            if (ctx.inputOverrides && s.expr.type === "call" && s.expr.name.startsWith("input") && Object.prototype.hasOwnProperty.call(ctx.inputOverrides, s.name)) {
              ctx.vars[s.name] = ctx.inputOverrides[s.name];
            } else {
              ctx.vars[s.name] = evalNode(s.expr, ctx);
            }
          }
          if (!ctx.varHistory[s.name]) ctx.varHistory[s.name] = [];
          ctx.varHistory[s.name][ctx.barIndex] = ctx.vars[s.name];
          break;
        case "expr":
          execExprStatement(s.expr, ctx);
          break;
      }
    } catch (err) {
      if (err instanceof PineError) { if (err.line === undefined) err.line = s.line; throw err; }
      const wrapped = new PineError(err instanceof Error ? err.message : String(err), "CE90001");
      wrapped.line = s.line;
      throw wrapped;
    } finally {
      if (prof && s.type !== "funcdef") {
        const e = prof.get(s.line);
        const dt = performance.now() - t0;
        if (e) { e.ms += dt; e.count++; } else prof.set(s.line, { ms: dt, count: 1 });
      }
    }
  }
}

function collectFunctions(stmts: Stmt[], out: Record<string, FunctionDef>, types?: Record<string, TypeDef>, methods?: Record<string, FunctionDef[]>) {
  for (const s of stmts) {
    if (s.type === "funcdef") {
      if (s.def.isMethod && methods) (methods[s.def.name] = methods[s.def.name] || []).push(s.def);
      if (!s.def.isMethod || !out[s.def.name]) out[s.def.name] = s.def;
    } else if (s.type === "typedef" && types) types[s.def.name] = s.def;
  }
}

function parseProgram(code: string): { stmts: Stmt[]; meta: PineRunResult["meta"] } {
  const meta: PineRunResult["meta"] = { title: "Untitled script", isStrategy: false, overlay: true, initialCapital: 100000 };
  // Windows line endings (code pasted from a Windows editor) read as plain newlines
  const rawLines = code.replace(/\r\n?/g, "\n").split("\n");
  // The script's own type names, known before any declaration that uses them is parsed
  udtNames = new Set(rawLines.map(l => (l.match(/^\s*(?:export\s+)?type\s+([a-zA-Z_]\w*)\s*$/) || [])[1]).filter(Boolean) as string[]);
  const merged = mergeContinuationLines(rawLines);
  const lines: Line[] = [];
  for (const m of merged) {
    const trimmed = m.text.trim();
    if (!trimmed) continue;
    if (/^\/\/@version/.test(trimmed)) continue;
    if (/^(indicator|strategy|library)\s*\(/.test(trimmed)) { parseMeta(trimmed, meta); continue; }
    // Pine counts a tab as 4 spaces (TradingView's own scripts mix the two)
    const lead = (m.indentRaw.match(/^[ \t]*/) || [""])[0];
    const indent = lead.replace(/\t/g, "    ").length;
    lines.push({ indent, text: trimmed, lineNo: m.lineNo });
  }
  const joined = mergeIndentContinuations(lines);
  let counter = 0;
  const nextId = () => counter++;
  const { stmts } = parseBlock(joined, 0, 0, nextId);
  checkUndeclared(stmts);
  return { stmts, meta };
}

// As TradingView's compiler does, a name that's neither declared anywhere in the script nor a
// Pine built-in stops the compile ("Undeclared identifier 'foo'") instead of quietly reading na.
// Declarations are gathered program-wide (assignments, tuple targets, functions, parameters,
// loop variables), so the check never flags a name the script does declare.
const PINE_TOP_LEVEL = new Set((PINE_CATALOG[""] || []).map(e => e[0]));
const ENGINE_NAMES = new Set(["close", "open", "high", "low", "volume", "hl2", "hlc3", "ohlc4", "hlcc4", "bar_index", "na", "time", "time_close", "true", "false"]);
function checkUndeclared(stmts: Stmt[]) {
  const declared = new Set<string>();
  const collect = (list: Stmt[]) => {
    for (const s of list) {
      if ((s.type === "assign" || s.type === "expr") && s.expr.type === "switch") s.expr.arms.forEach(a => collect(a.body));
      if (s.type === "assign") declared.add(s.name);
      else if (s.type === "tupleAssign") s.names.forEach(n => declared.add(n));
      else if (s.type === "funcdef") { declared.add(s.def.name); s.def.params.forEach(p => declared.add(p.name)); collect(s.def.body); }
      else if (s.type === "for") { declared.add(s.varName); collect(s.body); }
      else if (s.type === "forin") { declared.add(s.valVar); if (s.idxVar) declared.add(s.idxVar); collect(s.body); }
      else if (s.type === "typedef") declared.add(s.def.name);
      else if (s.type === "if") { collect(s.body); if (s.elseBody) collect(s.elseBody); }
      else if (s.type === "while") collect(s.body);
    }
  };
  collect(stmts);
  const known = (name: string) => name.includes(".") || declared.has(name) || PINE_TOP_LEVEL.has(name) || ENGINE_NAMES.has(name) || name === "_";
  const walk = (e: Expr | null | undefined, line: number) => {
    if (!e) return;
    switch (e.type) {
      case "ident":
        if (!known(e.name)) { const err = new PineError(`Undeclared identifier '${e.name}'`, "CE10030"); err.line = line; throw err; }
        return;
      case "neg": case "not": walk(e.expr, line); return;
      case "or": case "and": case "cmp": case "arith": walk(e.left, line); walk(e.right, line); return;
      case "ternary": walk(e.cond, line); walk(e.t, line); walk(e.f, line); return;
      case "histref": walk(e.base, line); walk(e.offset, line); return;
      case "call": e.args.forEach(a => walk(a, line)); Object.values(e.namedArgs).forEach(a => walk(a, line)); return;
      case "tuple": e.items.forEach(a => walk(a, line)); return;
      case "switch": walk(e.subject, line); e.arms.forEach(a => { walk(a.cond, line); visit(a.body); }); return;
      case "mcall": walk(e.recv, line); e.args.forEach(a => walk(a, line)); Object.values(e.namedArgs).forEach(a => walk(a, line)); return;
      case "field": walk(e.base, line); return;
    }
  };
  const visit = (list: Stmt[]) => {
    for (const s of list) {
      switch (s.type) {
        case "if": walk(s.cond, s.line); visit(s.body); if (s.elseBody) visit(s.elseBody); break;
        case "for": walk(s.from, s.line); walk(s.to, s.line); walk(s.step, s.line); visit(s.body); break;
        case "while": walk(s.cond, s.line); visit(s.body); break;
        case "assign": case "tupleAssign": case "expr": walk(s.expr, s.line); break;
        case "funcdef": s.def.params.forEach(p => walk(p.default, s.line)); visit(s.def.body); break;
        case "forin": walk(s.expr, s.line); visit(s.body); break;
        case "fieldAssign": walk(s.expr, s.line); break;
        case "typedef": s.def.fields.forEach(f => walk(f.default, s.line)); break;
      }
    }
  };
  visit(stmts);
}

interface RunOpts { symbol?: string; pineTf?: string; mtfData?: Record<string, Bar[]>; initialCapital?: number; inputOverrides?: Record<string, any>; backtestFrom?: number; backtestTo?: number; profile?: boolean }

function executeParsed(stmts: Stmt[], meta: PineRunResult["meta"], bars: Bar[], opts: RunOpts): PineRunResult {
  let logsSoFar: string[] | null = null;
  const result: PineRunResult = { plots: [], markers: [], tables: [], strategyReport: null, inputs: [], logs: [], warnings: [], errors: [], meta, execMs: 0 };
  try {
    if (!bars || bars.length === 0) {
      result.errors.push({ message: "No chart data is available yet — wait for the chart to finish loading.", code: "CE90002", line: 1 });
      return result;
    }
    const functions: Record<string, FunctionDef> = {};
    const types: Record<string, TypeDef> = {};
    const methods: Record<string, FunctionDef[]> = {};
    collectFunctions(stmts, functions, types, methods);
    const pineTf = opts.pineTf || "";
    const ctx: Ctx = {
      vars: {}, varHistory: {}, callState: {}, plots: {}, plotOrder: [],
      markers: [], tables: [], logs: [], warnings: [], warned: new Set(), bars,
      barIndex: 0, bar: bars[0],
      functions, types, methods,
      strategyInitialCapital: opts.initialCapital ?? meta.initialCapital,
      strategyState: makeStrategyState(),
      inputsList: [],
      inputOverrides: opts.inputOverrides,
      symbol: opts.symbol || "",
      pineTf,
      barDurationSec: pineTimeframeToSeconds(pineTf),
      mtfData: opts.mtfData || {},
      mtfSeriesCache: new Map(),
      globalCtx: null as unknown as Ctx,
      backtestFrom: opts.backtestFrom,
      backtestTo: opts.backtestTo,
      profile: opts.profile ? new Map() : undefined,
    };
    ctx.globalCtx = ctx;
    ctx.scopeStmts = stmts;
    logsSoFar = ctx.logs;
    // indicator(max_lines_count=…) etc.: how many of each drawing the script keeps (TradingView: 50 by default, 500 at most)
    const lim = (v: number | undefined) => Math.max(1, Math.min(500, v ?? 50));
    ctx.drawings = { seq: 0, label: [], line: [], box: [], max: { label: lim(meta.maxLabels), line: lim(meta.maxLines), box: lim(meta.maxBoxes) } };
    for (let i = 0; i < bars.length; i++) {
      ctx.barIndex = i;
      ctx.bar = bars[i];
      if (meta.isStrategy) processStrategyOrders(ctx);
      execStmts(stmts, ctx);
    }
    result.plots = ctx.plotOrder.map((id) => ctx.plots[id]);
    result.hlines = ctx.hlines || [];
    result.drawings = ctx.drawings ? [...ctx.drawings.box, ...ctx.drawings.line, ...ctx.drawings.label] : [];
    // fill() ends point at plots / hlines by their position in those lists
    result.fills = (ctx.fills || []).map((f) => {
      const transparent = (c: any) => typeof c !== "string" || B.parseColor(c)?.a === 0;
      if (f.topValue === undefined && (f.colors ? Object.values(f.colors).every(transparent) : transparent(f.color))) f = { ...f, hidden: true };
      const at = (r: PineFill["a"]) => ({ kind: r.kind, index: r.kind === "plot" ? ctx.plotOrder.indexOf(r.index) : (ctx.hlines || []).findIndex((h) => h.id === r.index) });
      return { ...f, a: at(f.a), b: at(f.b) };
    }).filter((f) => f.a.index >= 0 && f.b.index >= 0);
    result.markers = ctx.markers;
    result.tables = ctx.tables.map((t: any) => ({
      position: t.position, columns: t.columns, rows: t.rows,
      bgcolor: t.bgcolor, borderColor: t.borderColor, cells: t.cells,
    }));
    result.strategyReport = meta.isStrategy ? buildStrategyReport(ctx) : null;
    result.inputs = ctx.inputsList
      .filter((i) => !i.isBool)
      .map((i) => (typeof i.value === "number" ? String(Math.round(i.value * 1000) / 1000) : String(i.value)));
    result.logs = ctx.logs.slice(-200);
    result.warnings = ctx.warnings;
    if (ctx.profile) result.profile = Array.from(ctx.profile.entries()).map(([line, v]) => ({ line, ms: v.ms, count: v.count })).sort((a, b) => a.line - b.line);
  } catch (err: any) {
    // The log so far stays visible next to the error (TradingView keeps it too)
    if (logsSoFar) result.logs = logsSoFar.slice(-200);
    if (err instanceof PineError) {
      result.errors.push({ message: err.message, code: err.code, line: err.line ?? 1 });
    } else {
      result.errors.push({ message: err?.message ? String(err.message) : String(err), code: "CE99999", line: 1 });
    }
  }
  return result;
}

export function runPineScript(code: string, bars: Bar[], opts?: { symbol?: string; pineTf?: string; inputOverrides?: Record<string, any> }): PineRunResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let meta: PineRunResult["meta"] = { title: "Untitled script", isStrategy: false, overlay: true, initialCapital: 100000 };
  let result: PineRunResult;
  try {
    const parsed = parseProgram(code);
    meta = parsed.meta;
    result = executeParsed(parsed.stmts, meta, bars, { symbol: opts?.symbol, pineTf: opts?.pineTf, mtfData: {}, inputOverrides: opts?.inputOverrides });
  } catch (err: any) {
    result = { plots: [], markers: [], tables: [], strategyReport: null, inputs: [], logs: [], warnings: [], errors: [], meta, execMs: 0 };
    if (err instanceof PineError) result.errors.push({ message: err.message, code: err.code, line: err.line ?? 1 });
    else result.errors.push({ message: err?.message ? String(err.message) : String(err), code: "CE99999", line: 1 });
  }
  result.execMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  return result;
}

// Walks the whole AST (including function bodies) collecting every
// request.security()/request.security_lower_tf() call, so the caller can
// fetch real data for each distinct timeframe those calls need before the
// interpreter runs. Timeframe arguments are usually a variable bound to an
// input.timeframe(...) default (e.g. i_anaTF), so this also does a one-pass
// "static" evaluation of the script's top-level assignments (input.*() calls
// only depend on their own literal defaults, never on bar data) to resolve
// those variables to their literal string values.
function collectRequestTimeframes(stmts: Stmt[], inputOverrides?: Record<string, any>): Set<string> {
  const calls: Extract<Expr, { type: "call" }>[] = [];
  const visitExpr = (e: Expr) => {
    switch (e.type) {
      case "call":
        if (e.name === "request.security" || e.name === "request.security_lower_tf") calls.push(e);
        e.args.forEach(visitExpr);
        Object.values(e.namedArgs).forEach(visitExpr);
        break;
      case "neg": case "not": visitExpr(e.expr); break;
      case "or": case "and": case "cmp": case "arith": visitExpr(e.left); visitExpr(e.right); break;
      case "ternary": visitExpr(e.cond); visitExpr(e.t); visitExpr(e.f); break;
      case "histref": visitExpr(e.base); visitExpr(e.offset); break;
      case "tuple": e.items.forEach(visitExpr); break;
      case "switch": if (e.subject) visitExpr(e.subject); e.arms.forEach(a => { if (a.cond) visitExpr(a.cond); visitStmts(a.body); }); break;
      case "mcall": visitExpr(e.recv); e.args.forEach(visitExpr); break;
      case "field": visitExpr(e.base); break;
    }
  };
  const visitStmts = (list: Stmt[]) => {
    for (const s of list) {
      switch (s.type) {
        case "if": visitExpr(s.cond); visitStmts(s.body); if (s.elseBody) visitStmts(s.elseBody); break;
        case "for": visitExpr(s.from); visitExpr(s.to); if (s.step) visitExpr(s.step); visitStmts(s.body); break;
        case "while": visitExpr(s.cond); visitStmts(s.body); break;
        case "assign": visitExpr(s.expr); break;
        case "tupleAssign": visitExpr(s.expr); break;
        case "funcdef": visitStmts(s.def.body); break;
        case "forin": visitExpr(s.expr); visitStmts(s.body); break;
        case "expr": visitExpr(s.expr); break;
      }
    }
  };
  visitStmts(stmts);

  const dummyBar: Bar = { time: 0, open: 0, high: 0, low: 0, close: 0 };
  const staticCtx: Ctx = {
    vars: {}, varHistory: {}, callState: {}, plots: {}, plotOrder: [], markers: [], tables: [], logs: [],
    warnings: [], warned: new Set(), bars: [dummyBar], barIndex: 0, bar: dummyBar,
    functions: {}, strategyInitialCapital: 0, strategyState: makeStrategyState(), inputsList: [], symbol: "", pineTf: "", barDurationSec: 0,
    mtfData: {}, mtfSeriesCache: new Map(), globalCtx: null as unknown as Ctx,
  };
  staticCtx.globalCtx = staticCtx;
  for (const s of stmts) {
    if (s.type !== "assign") continue;
    try {
      if (inputOverrides && s.expr.type === "call" && s.expr.name.startsWith("input") && Object.prototype.hasOwnProperty.call(inputOverrides, s.name)) {
        staticCtx.vars[s.name] = inputOverrides[s.name];
      } else {
        staticCtx.vars[s.name] = evalNode(s.expr, staticCtx);
      }
    } catch { /* best-effort only */ }
  }

  const tfSet = new Set<string>();
  for (const c of calls) {
    try {
      const tf = evalNode(c.args[1], staticCtx);
      if (typeof tf === "string" && tf) tfSet.add(tf);
    } catch { /* unresolvable statically — that call returns na/[] at runtime */ }
  }
  return tfSet;
}

function makeStaticCtx(): Ctx {
  const dummyBar: Bar = { time: 0, open: 0, high: 0, low: 0, close: 0 };
  const ctx: Ctx = {
    vars: {}, varHistory: {}, callState: {}, plots: {}, plotOrder: [], markers: [], tables: [], logs: [],
    warnings: [], warned: new Set(), bars: [dummyBar], barIndex: 0, bar: dummyBar,
    functions: {}, strategyInitialCapital: 0, strategyState: makeStrategyState(), inputsList: [], symbol: "", pineTf: "", barDurationSec: 0,
    mtfData: {}, mtfSeriesCache: new Map(), globalCtx: null as unknown as Ctx,
  };
  ctx.globalCtx = ctx;
  return ctx;
}

export interface PineInputMeta {
  varName: string; // the script's own variable name — also how an override is targeted
  type: "int" | "float" | "bool" | "string" | "color" | "timeframe" | "session" | "symbol" | "source" | "text_area";
  title: string;
  group?: string;
  tooltip?: string;
  options?: string[]; // input.string(options=[...])
  minval?: number; maxval?: number; step?: number; // input.int/float
  value: any; // current default
}

function inputTypeFromCallName(name: string, defaultValue: any): PineInputMeta["type"] {
  if (name === "input") {
    if (typeof defaultValue === "boolean") return "bool";
    if (typeof defaultValue === "number") return "float";
    return "string";
  }
  return name.slice(6) as PineInputMeta["type"]; // "input.int" -> "int"
}

// Statically walks the script's top-level assignments to describe every
// input.*() call — type, label, group, tooltip, numeric bounds, string
// options, and its current default — without running the interpreter over
// any bar data. This is what the settings modal renders itself from, so it
// only ever shows controls a script actually declares, never invented ones.
function collectInputsMeta(stmts: Stmt[]): PineInputMeta[] {
  const staticCtx = makeStaticCtx();
  const metas: PineInputMeta[] = [];
  const safeEval = (node: Expr | undefined): any => {
    if (!node) return undefined;
    try { return evalNode(node, staticCtx); } catch { return undefined; }
  };
  for (const s of stmts) {
    if (s.type !== "assign") continue;
    const expr = s.expr;
    if (expr.type !== "call" || !expr.name.startsWith("input")) {
      try { staticCtx.vars[s.name] = evalNode(expr, staticCtx); } catch { /* best-effort only */ }
      continue;
    }
    const titleNode = expr.namedArgs.title ?? expr.args[1];
    const value = safeEval(expr.namedArgs.defval ?? expr.args[0]);
    const optionsNode = expr.namedArgs.options;
    const options = optionsNode && optionsNode.type === "tuple" ? optionsNode.items.map((it) => String(safeEval(it))) : undefined;
    metas.push({
      varName: s.name,
      type: inputTypeFromCallName(expr.name, value),
      title: titleNode ? String(safeEval(titleNode)) : s.name,
      group: expr.namedArgs.group ? String(safeEval(expr.namedArgs.group)) : undefined,
      tooltip: expr.namedArgs.tooltip ? String(safeEval(expr.namedArgs.tooltip)) : undefined,
      options,
      minval: expr.namedArgs.minval ? Number(safeEval(expr.namedArgs.minval)) : undefined,
      maxval: expr.namedArgs.maxval ? Number(safeEval(expr.namedArgs.maxval)) : undefined,
      step: expr.namedArgs.step ? Number(safeEval(expr.namedArgs.step)) : undefined,
      value,
    });
    staticCtx.vars[s.name] = value;
  }
  return metas;
}

// Public entry point: describe a script's inputs without running it, so a
// settings UI can be built before the user has re-run anything.
export function getPineInputsMeta(code: string): PineInputMeta[] {
  try {
    const { stmts } = parseProgram(code);
    return collectInputsMeta(stmts);
  } catch {
    return [];
  }
}

// TwelveData's "1day" (and weekly/monthly) responses only give a bare
// calendar date with no time-of-day, so it gets parsed as UTC midnight —
// but plenty of forex/CFD/commodity instruments' real trading "day" rolls
// over at a broker-specific hour that ISN'T 00:00 UTC (verified for
// XAU/USD: TradingView's real daily/4h boundary sits at 07:00 UTC). A Pine
// script using request.security(..., "D", time, ...) to detect day
// boundaries needs the REAL rollover moment; get that wrong and every
// once-per-day signal built on it (like a strategy that places one order
// per trading day) reconstructs the wrong "previous day" data entirely.
//
// There's no way to derive that rollover hour from a finer intraday grid's
// shape alone — a 4h grid's six bar-start hours are all equally plausible
// candidates for "day start" with nothing to distinguish them. What DOES
// settle it unambiguously: the "D" bars carry their own real open/high/
// low/close, computed by the very same feed using its own correct session
// boundary. Aggregating 24 hours of the finer series starting at the RIGHT
// hour reproduces that daily OHLC exactly (confirmed empirically: the
// correct anchor gives a zero-error match, wrong ones are off by
// multiple dollars) — so this tests every candidate hour and keeps
// whichever one actually reconstructs the daily bars it already has.
function alignDailyTimeframeBoundaries(mtfData: Record<string, Bar[]>): void {
  const DAY = 86400;
  const dayKeys = Object.keys(mtfData).filter((tf) => pineTimeframeToSeconds(tf) === DAY && mtfData[tf].length > 0);
  if (dayKeys.length === 0) return;

  let bestRef: Bar[] | null = null;
  let bestSec = 0;
  for (const tf of Object.keys(mtfData)) {
    const sec = pineTimeframeToSeconds(tf);
    if (sec > 0 && sec < DAY && DAY % sec === 0 && mtfData[tf].length >= (DAY / sec) * 3 && sec > bestSec) {
      bestSec = sec;
      bestRef = mtfData[tf];
    }
  }
  if (!bestRef) return;
  const ref = bestRef;
  const bucketsPerDay = DAY / bestSec;
  // The grid's own bars reveal which hours-of-day it actually lands on
  // (e.g. 03/07/11/15/19/23 for a 4h series) — candidate offsets have to
  // come from that observed set, not an assumed zero-based 0/4/8/12/16/20
  // grid, since there's no reason the real grid starts counting from
  // midnight at all.
  const candidateOffsets = Array.from(new Set(ref.map((b) => ((b.time % DAY) + DAY) % DAY)));

  for (const dayTf of dayKeys) {
    const dayBars = mtfData[dayTf];
    let bestOffset = 0;
    let bestErr = Infinity;
    let priceScale = 0;
    let sampled = 0;

    for (const offsetSec of candidateOffsets) {
      let totalErr = 0;
      let tested = 0;
      for (const db of dayBars) {
        if (((db.time % DAY) + DAY) % DAY !== 0) continue; // only test bars that actually need correcting
        const winStart = Math.floor(db.time / DAY) * DAY + offsetSec;
        const inWin = ref.filter((b) => b.time >= winStart && b.time < winStart + DAY);
        if (inWin.length !== bucketsPerDay) continue; // incomplete window (edge of loaded history) — skip
        const aggO = inWin[0].open, aggC = inWin[inWin.length - 1].close;
        const aggH = Math.max(...inWin.map((b) => b.high)), aggL = Math.min(...inWin.map((b) => b.low));
        totalErr += Math.abs(aggO - db.open) + Math.abs(aggH - db.high) + Math.abs(aggL - db.low) + Math.abs(aggC - db.close);
        if (offsetSec === candidateOffsets[0]) { priceScale += Math.abs(db.close); sampled++; }
        tested++;
        if (tested >= 6) break; // a handful of clean days is enough to settle it
      }
      if (tested > 0 && totalErr / tested < bestErr) bestErr = totalErr / tested, bestOffset = offsetSec;
    }

    // Require a genuinely tight match (well under a tenth of a percent of
    // the instrument's own price level) before trusting it — otherwise this
    // timeframe's daily bars are left exactly as fetched.
    const scale = sampled > 0 ? priceScale / sampled : 0;
    if (scale <= 0 || bestErr > scale * 0.001) continue;

    mtfData[dayTf] = dayBars.map((b) => {
      if (((b.time % DAY) + DAY) % DAY !== 0) return b;
      return { ...b, time: Math.floor(b.time / DAY) * DAY + bestOffset };
    });
  }
}

export type MtfFetcher = (pineTimeframe: string, symbol: string) => Promise<Bar[]>;

// Async counterpart of runPineScript for scripts that use
// request.security()/request.security_lower_tf(). Pre-scans the script for
// which other timeframes it actually needs, fetches real bar data for each
// via the caller-supplied fetcher (so this module stays free of any network
// code of its own), then runs the interpreter exactly as runPineScript does.
export async function runPineScriptAsync(
  code: string,
  bars: Bar[],
  opts: { symbol: string; pineTf: string; fetchTimeframe: MtfFetcher; initialCapital?: number; inputOverrides?: Record<string, any>; backtestFrom?: number; backtestTo?: number; profile?: boolean }
): Promise<PineRunResult> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let meta: PineRunResult["meta"] = { title: "Untitled script", isStrategy: false, overlay: true, initialCapital: 100000 };
  let result: PineRunResult;
  try {
    const parsed = parseProgram(code);
    meta = parsed.meta;
    const neededTfs = collectRequestTimeframes(parsed.stmts, opts.inputOverrides);
    const mtfData: Record<string, Bar[]> = {};
    await Promise.all(Array.from(neededTfs).map(async (tf) => {
      try { mtfData[tf] = await opts.fetchTimeframe(tf, opts.symbol); } catch { mtfData[tf] = []; }
    }));
    alignDailyTimeframeBoundaries(mtfData);
    result = executeParsed(parsed.stmts, meta, bars, {
      symbol: opts.symbol, pineTf: opts.pineTf, mtfData, initialCapital: opts.initialCapital, inputOverrides: opts.inputOverrides,
      backtestFrom: opts.backtestFrom, backtestTo: opts.backtestTo, profile: opts.profile,
    });
  } catch (err: any) {
    result = { plots: [], markers: [], tables: [], strategyReport: null, inputs: [], logs: [], warnings: [], errors: [], meta, execMs: 0 };
    if (err instanceof PineError) result.errors.push({ message: err.message, code: err.code, line: err.line ?? 1 });
    else result.errors.push({ message: err?.message ? String(err.message) : String(err), code: "CE99999", line: 1 });
  }
  result.execMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  return result;
}

// Converts between this app's own interval strings ("5min", "4h", "1day",
// TwelveData's convention) and Pine's own timeframe strings ("5", "240",
// "D") used by input.timeframe()/timeframe.period and by request.security().
export function appIntervalToPineTf(interval: string): string {
  const map: Record<string, string> = {
    "1min": "1", "5min": "5", "15min": "15", "30min": "30", "45min": "45",
    "1h": "60", "2h": "120", "4h": "240",
    "1day": "D", "1week": "W", "1month": "M",
  };
  if (map[interval]) return map[interval];
  let m = interval.match(/^(\d+)min$/); if (m) return m[1];
  m = interval.match(/^(\d+)h$/); if (m) return String(parseInt(m[1], 10) * 60);
  m = interval.match(/^(\d+)day$/); if (m) return `${m[1]}D`;
  m = interval.match(/^(\d+)week$/); if (m) return `${m[1]}W`;
  m = interval.match(/^(\d+)month$/); if (m) return `${m[1]}M`;
  return interval;
}

export function pineTfToAppInterval(tf: string): string {
  const t = tf.trim().toUpperCase();
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    if (n === 60) return "1h";
    if (n === 120) return "2h";
    if (n === 240) return "4h";
    return `${n}min`;
  }
  const m = t.match(/^(\d*)([DWM])$/);
  if (m) {
    const mult = m[1] ? parseInt(m[1], 10) : 1;
    const unit = m[2] === "D" ? "day" : m[2] === "W" ? "week" : "month";
    return mult === 1 ? `1${unit}` : `${mult}${unit}`;
  }
  return tf;
}
