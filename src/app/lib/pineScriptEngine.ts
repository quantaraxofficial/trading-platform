import { PINE_CATALOG } from "./pineCatalog";
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
}

export interface PineMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
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
  markers: PineMarker[];
  tables: PineTableResult[];
  strategyReport: PineStrategyReport | null;
  inputs: string[]; // non-boolean input values in declaration order, for the on-chart legend line
  logs: string[];
  warnings: string[];
  errors: PineScriptError[];
  meta: { title: string; isStrategy: boolean; overlay: boolean; initialCapital: number; pyramiding?: number; defaultQtyValue?: number; defaultQtyType?: string };
  execMs: number;
  // Profiler mode: time spent on each script line (inclusive of the lines a block contains) and
  // how many times it ran
  profile?: { line: number; ms: number; count: number }[];
}

const COLOR_NAMES: Record<string, string> = {
  red: "#ef5350", green: "#26a69a", blue: "#2962ff", orange: "#ff9800",
  purple: "#9c27b0", yellow: "#ffeb3b", lime: "#8bc34a", aqua: "#00bcd4",
  fuchsia: "#e040fb", gray: "#787b86", grey: "#787b86", white: "#ffffff",
  black: "#000000", teal: "#009688", maroon: "#800000", navy: "#001f3f",
  olive: "#808000", silver: "#c0c0c0", pink: "#ff4081", magenta: "#e040fb",
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
  | { type: "histref"; base: Expr; offset: Expr }
  | { type: "call"; name: string; args: Expr[]; namedArgs: Record<string, Expr>; id: number }
  | { type: "tuple"; items: Expr[] };

interface FuncParam { name: string; default: Expr | null }
interface FunctionDef { name: string; params: FuncParam[]; body: Stmt[] }

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
  | { type: "expr"; expr: Expr; line: number };

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
  function parsePostfix(): Expr {
    let node = parsePrimary();
    while (peek().t === "[") {
      consume();
      const idx = parseTernary();
      expect("]");
      node = { type: "histref", base: node, offset: idx };
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
  const titleMatch = text.match(/\(\s*"((?:[^"\\]|\\.)*)"/);
  if (titleMatch) meta.title = titleMatch[1];
  const overlayMatch = text.match(/overlay\s*=\s*(true|false)/);
  if (overlayMatch) meta.overlay = overlayMatch[1] === "true";
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
  return trimmed.split(",").map((chunk) => {
    const c = chunk.trim().replace(/^[a-zA-Z_][a-zA-Z0-9_.<>\[\]]*\s+(?=[a-zA-Z_])/, "");
    const m = c.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*(.+))?$/);
    if (!m) return { name: c, default: null };
    return { name: m[1], default: m[2] ? parseExpression(m[2], nextId) : null };
  });
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
  return /^if\b/.test(text) || /^else\b/.test(text) || /^while\b/.test(text) || splitForHeader(text) !== null || matchFuncDecl(text) !== null;
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

function parseSimpleStatement(line: Line, nextId: () => number): Stmt {
  let text = line.text;
  let isVar = false;
  if (/^var(ip)?\s+/.test(text)) { isVar = true; text = text.replace(/^var(ip)?\s+/, ""); }
  text = text.replace(TYPE_PREFIX_RE, "");

  const tupleMatch = text.match(/^\[\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\]\s*=(?!=)\s*(.+)$/);
  if (tupleMatch) {
    const names = tupleMatch[1].split(",").map((n) => n.trim());
    return { type: "tupleAssign", names, expr: withLine(line.lineNo, () => parseExpression(tupleMatch[2], nextId)), line: line.lineNo };
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
    const line = lines[i];
    const fnDecl = matchFuncDecl(line.text);
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
      stmts.push({ type: "funcdef", def: { name: fnDecl.name, params, body }, line: line.lineNo });
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
  callState: Record<number, CallState>;
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
}

function truthy(v: any): boolean {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "number") return !isNaN(v) && v !== 0;
  if (typeof v === "string") return v.length > 0;
  return !!v;
}

function resolveIdent(name: string, ctx: Ctx): any {
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
        case "while": execWhileStmt(s, ctx, execFunctionBody); lastValue = NaN; break;
        case "tupleAssign": execTupleAssign(s, ctx); lastValue = NaN; break;
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
          lastValue = evalNode(s.expr, ctx);
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

function callUserFunction(fn: FunctionDef, node: Extract<Expr, { type: "call" }>, ctx: Ctx): any {
  // evalCall already lazily creates ctx.callState[node.id] as {} for every
  // call (builtins use it directly); that object is truthy, so `||` alone
  // would never attach localVars/localVarHistory. Check for them by name.
  const cs = (ctx.callState[node.id] = ctx.callState[node.id] || {});
  if (!cs.localVars) cs.localVars = {};
  if (!cs.localVarHistory) cs.localVarHistory = {};
  const fnCtx: Ctx = { ...ctx, vars: cs.localVars, varHistory: cs.localVarHistory };
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
function evalSeriesOverBars(exprNode: Expr, otherBars: Bar[], tf: string, functions: Record<string, FunctionDef>, globalCtx: Ctx): { time: number; value: any }[] {
  const subCtx: Ctx = {
    vars: {}, varHistory: {}, callState: {}, plots: {}, plotOrder: [], markers: [], tables: [], logs: [],
    warnings: [], warned: new Set(), bars: otherBars, barIndex: 0, bar: otherBars[0],
    functions, strategyInitialCapital: 0, strategyState: makeStrategyState(), inputsList: [], symbol: "", pineTf: tf, barDurationSec: pineTimeframeToSeconds(tf),
    mtfData: {}, mtfSeriesCache: new Map(), globalCtx,
  };
  const out: { time: number; value: any }[] = [];
  for (let i = 0; i < otherBars.length; i++) {
    subCtx.barIndex = i;
    subCtx.bar = otherBars[i];
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
  const otherBars = ctx.mtfData[tf];
  if (!otherBars || otherBars.length === 0) {
    warnOnce(ctx, `request.security(...) for timeframe '${tf}' has no data available and was skipped (returns na).`);
    return NaN;
  }
  const cacheKey = `sec:${node.id}:${tf}`;
  let series = ctx.mtfSeriesCache.get(cacheKey);
  if (!series) {
    series = evalSeriesOverBars(node.args[2], otherBars, tf, ctx.functions, ctx.globalCtx);
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
    series = evalSeriesOverBars(node.args[2], otherBars, tf, ctx.functions, ctx.globalCtx);
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

function evalCall(node: Extract<Expr, { type: "call" }>, ctx: Ctx): any {
  const name = node.name;
  const cs = (ctx.callState[node.id] = ctx.callState[node.id] || {});
  const argAt = (i: number) => (node.args[i] !== undefined ? evalNode(node.args[i], ctx) : undefined);

  switch (name) {
    case "ta.sma": {
      const v = argAt(0), len = Math.round(argAt(1));
      const hist = pushBarIdempotent(cs, "s", ctx.barIndex, v);
      if (hist.length < len) return NaN;
      const slice = hist.slice(-len);
      return slice.reduce((a, b) => a + b, 0) / len;
    }
    case "ta.ema": {
      const v = argAt(0), len = argAt(1);
      const alpha = 2 / (len + 1);
      if (cs.lastBar !== ctx.barIndex) {
        cs.ema = cs.ema === undefined ? v : v * alpha + cs.ema * (1 - alpha);
        cs.lastBar = ctx.barIndex;
      }
      return cs.ema;
    }
    case "ta.rsi": {
      const v = argAt(0), len = argAt(1);
      if (cs.lastBar !== ctx.barIndex) {
        if (cs.prev === undefined) { cs.avgGain = 0; cs.avgLoss = 0; }
        else {
          const diff = v - cs.prev;
          const gain = Math.max(diff, 0), loss = Math.max(-diff, 0);
          if (cs.avgGain === undefined) { cs.avgGain = gain; cs.avgLoss = loss; }
          else { cs.avgGain = (cs.avgGain * (len - 1) + gain) / len; cs.avgLoss = (cs.avgLoss * (len - 1) + loss) / len; }
        }
        cs.prev = v;
        cs.lastBar = ctx.barIndex;
      }
      if (!cs.avgLoss) return cs.avgGain ? 100 : 50;
      const rs = cs.avgGain / cs.avgLoss;
      return 100 - 100 / (1 + rs);
    }
    case "ta.highest": {
      const v = argAt(0), len = Math.round(argAt(1));
      const hist = pushBarIdempotent(cs, "s", ctx.barIndex, v);
      if (hist.length < len) return NaN;
      return Math.max(...hist.slice(-len));
    }
    case "ta.lowest": {
      const v = argAt(0), len = Math.round(argAt(1));
      const hist = pushBarIdempotent(cs, "s", ctx.barIndex, v);
      if (hist.length < len) return NaN;
      return Math.min(...hist.slice(-len));
    }
    case "ta.atr": {
      const len = Math.round(argAt(0));
      const prevClose = ctx.barIndex > 0 ? ctx.bars[ctx.barIndex - 1].close : ctx.bar.close;
      const tr = Math.max(ctx.bar.high - ctx.bar.low, Math.abs(ctx.bar.high - prevClose), Math.abs(ctx.bar.low - prevClose));
      if (cs.lastBar !== ctx.barIndex) {
        cs.atr = cs.atr === undefined ? tr : (cs.atr * (len - 1) + tr) / len;
        cs.lastBar = ctx.barIndex;
      }
      return cs.atr;
    }
    case "ta.crossover":
    case "ta.crossunder": {
      const a = argAt(0), b = argAt(1);
      let result = false;
      if (cs.lastBar !== ctx.barIndex) {
        if (cs.prevA !== undefined) {
          result = name === "ta.crossover" ? cs.prevA <= cs.prevB && a > b : cs.prevA >= cs.prevB && a < b;
        }
        cs.prevA = a; cs.prevB = b; cs.result = result; cs.lastBar = ctx.barIndex;
      } else {
        result = cs.result;
      }
      return result;
    }
    case "ta.change": {
      const v = argAt(0);
      if (cs.lastBar !== ctx.barIndex) {
        cs.result = cs.prev === undefined ? NaN : v - cs.prev;
        cs.prev = v;
        cs.lastBar = ctx.barIndex;
      }
      return cs.result;
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
    case "str.tostring": {
      const v = argAt(0);
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") {
        if (isNaN(v)) return "NaN";
        if (node.args[1] !== undefined) {
          const fmt = String(argAt(1));
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
    case "math.abs": return Math.abs(argAt(0));
    case "math.round": return Math.round(argAt(0));
    case "math.floor": return Math.floor(argAt(0));
    case "math.ceil": return Math.ceil(argAt(0));
    case "math.sqrt": return Math.sqrt(argAt(0));
    case "math.pow": return Math.pow(argAt(0), argAt(1));
    case "nz": { const v = argAt(0); const fb = node.args[1] !== undefined ? argAt(1) : 0; return v === undefined || (typeof v === "number" && isNaN(v)) ? fb : v; }
    case "na": { const v = argAt(0); return typeof v === "number" && isNaN(v); }
    case "color.new": return argAt(0);
    case "input": case "input.int": case "input.float": case "input.bool": case "input.string": case "input.color":
    case "input.timeframe": case "input.session": case "input.symbol": case "input.source": case "input.text_area": {
      const v = node.namedArgs.defval ? evalNode(node.namedArgs.defval, ctx) : (node.args[0] !== undefined ? argAt(0) : NaN);
      // Captured once (bar 0) for the on-chart legend line, which lists each
      // input's current value the way TradingView's own legend does.
      if (ctx.barIndex === 0) ctx.inputsList.push({ value: v, isBool: name === "input.bool" });
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
      const fn = ctx.functions[name];
      if (fn) return callUserFunction(fn, node, ctx);
      return NaN;
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
      return evalNode(node.base, ctx); // best effort: no history for compound expressions
    }
    case "call":
      // `u = plot(...)` (a plot kept for fill()) still draws: the call's side effect runs,
      // and the plot's id stands in for its value
      if (node.name === "plot" || node.name === "plotshape" || node.name === "plotchar" || node.name === "hline") { execExprStatement(node, ctx); return node.name === "hline" ? NaN : node.id; }
      return evalCall(node, ctx);
    case "tuple": return node.items.map((it) => evalNode(it, ctx));
  }
  return NaN;
}

const KNOWN_IGNORED_CALLS = new Set(["hline", "fill", "bgcolor", "alertcondition", "alert", "barcolor", "runtime.error"]);

function execExprStatement(node: Expr, ctx: Ctx) {
  if (node.type !== "call") return;
  const name = node.name;
  const argAt = (i: number) => (node.args[i] !== undefined ? evalNode(node.args[i], ctx) : undefined);
  const namedColor = (key: string): string | null => {
    const n = node.namedArgs[key];
    if (!n) return null;
    const v = evalNode(n, ctx);
    return typeof v === "string" ? v : null;
  };

  if (name === "plot") {
    if (!ctx.plots[node.id]) {
      const title = node.namedArgs.title ? String(evalNode(node.namedArgs.title, ctx)) : `Plot ${ctx.plotOrder.length + 1}`;
      const color = namedColor("color") || PALETTE[ctx.plotOrder.length % PALETTE.length];
      ctx.plots[node.id] = { title, color, values: [] };
      ctx.plotOrder.push(node.id);
    }
    const v = argAt(0);
    if (typeof v === "number" && !isNaN(v)) ctx.plots[node.id].values.push({ time: ctx.bar.time, value: v });
    return;
  }
  if (name === "plotshape" || name === "plotchar") {
    const cond = truthy(argAt(0));
    if (!cond) return;
    const loc = node.namedArgs.location ? String(evalNode(node.namedArgs.location, ctx)) : "abovebar";
    const below = /below/i.test(loc);
    const color = namedColor("color") || "#2962ff";
    const text = node.namedArgs.text ? String(evalNode(node.namedArgs.text, ctx)) : "";
    ctx.markers.push({ time: ctx.bar.time, position: below ? "belowBar" : "aboveBar", color, shape: "circle", text });
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
  if (name === "strategy.close_all") {
    if (ctx.strategyState.position) closeStrategyPosition(ctx, ctx.bar.close, ctx.bar.time, "Close position order");
    ctx.strategyState.pendingEntries = {};
    return;
  }
  if (name === "strategy.close") {
    // Closes a position by entry id — these scripts only ever hold one
    // position at a time, so any id match closes the (single) open one.
    const pos = ctx.strategyState.position;
    if (pos) closeStrategyPosition(ctx, ctx.bar.close, ctx.bar.time, `Close entry(s) order ${node.args[0] !== undefined ? String(argAt(0)) : pos.id}`);
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
  if (!ctx.warned.has(name)) {
    ctx.warned.add(name);
    ctx.warnings.push(`'${name}(...)' is not supported by this editor's built-in runtime and was skipped.`);
  }
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

function collectFunctions(stmts: Stmt[], out: Record<string, FunctionDef>) {
  for (const s of stmts) if (s.type === "funcdef") out[s.def.name] = s.def;
}

function parseProgram(code: string): { stmts: Stmt[]; meta: PineRunResult["meta"] } {
  const meta: PineRunResult["meta"] = { title: "Untitled script", isStrategy: false, overlay: true, initialCapital: 100000 };
  const rawLines = code.split("\n");
  const merged = mergeContinuationLines(rawLines);
  const lines: Line[] = [];
  for (const m of merged) {
    const trimmed = m.text.trim();
    if (!trimmed) continue;
    if (/^\/\/@version/.test(trimmed)) continue;
    if (/^(indicator|strategy|library)\s*\(/.test(trimmed)) { parseMeta(trimmed, meta); continue; }
    const indent = m.indentRaw.length - m.indentRaw.replace(/^[ \t]+/, "").length;
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
      if (s.type === "assign") declared.add(s.name);
      else if (s.type === "tupleAssign") s.names.forEach(n => declared.add(n));
      else if (s.type === "funcdef") { declared.add(s.def.name); s.def.params.forEach(p => declared.add(p.name)); collect(s.def.body); }
      else if (s.type === "for") { declared.add(s.varName); collect(s.body); }
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
      }
    }
  };
  visit(stmts);
}

interface RunOpts { symbol?: string; pineTf?: string; mtfData?: Record<string, Bar[]>; initialCapital?: number; inputOverrides?: Record<string, any>; backtestFrom?: number; backtestTo?: number; profile?: boolean }

function executeParsed(stmts: Stmt[], meta: PineRunResult["meta"], bars: Bar[], opts: RunOpts): PineRunResult {
  const result: PineRunResult = { plots: [], markers: [], tables: [], strategyReport: null, inputs: [], logs: [], warnings: [], errors: [], meta, execMs: 0 };
  try {
    if (!bars || bars.length === 0) {
      result.errors.push({ message: "No chart data is available yet — wait for the chart to finish loading.", code: "CE90002", line: 1 });
      return result;
    }
    const functions: Record<string, FunctionDef> = {};
    collectFunctions(stmts, functions);
    const pineTf = opts.pineTf || "";
    const ctx: Ctx = {
      vars: {}, varHistory: {}, callState: {}, plots: {}, plotOrder: [],
      markers: [], tables: [], logs: [], warnings: [], warned: new Set(), bars,
      barIndex: 0, bar: bars[0],
      functions,
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
    for (let i = 0; i < bars.length; i++) {
      ctx.barIndex = i;
      ctx.bar = bars[i];
      if (meta.isStrategy) processStrategyOrders(ctx);
      execStmts(stmts, ctx);
    }
    result.plots = ctx.plotOrder.map((id) => ctx.plots[id]);
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
    if (err instanceof PineError) {
      result.errors.push({ message: err.message, code: err.code, line: err.line ?? 1 });
    } else {
      result.errors.push({ message: err?.message ? String(err.message) : String(err), code: "CE99999", line: 1 });
    }
  }
  return result;
}

export function runPineScript(code: string, bars: Bar[], opts?: { symbol?: string; pineTf?: string }): PineRunResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let meta: PineRunResult["meta"] = { title: "Untitled script", isStrategy: false, overlay: true, initialCapital: 100000 };
  let result: PineRunResult;
  try {
    const parsed = parseProgram(code);
    meta = parsed.meta;
    result = executeParsed(parsed.stmts, meta, bars, { symbol: opts?.symbol, pineTf: opts?.pineTf, mtfData: {} });
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
