// A small, self-contained Pine Script (v5/v6-ish) interpreter.
// It supports the subset of the language that shows up in typical simple
// indicators/strategies: variable assignment (`=`, `:=`, `var`), `if`/`else`
// blocks, the common `ta.*`/`math.*` built-ins, `plot`/`plotshape`/`plotchar`,
// `strategy.entry`/`strategy.close`, `log.*`, and history-referencing (`close[1]`).
// It does not implement user-defined functions, loops, arrays, or
// multi-timeframe requests — those scripts will surface as errors.

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

export interface PineRunResult {
  plots: PinePlotResult[];
  markers: PineMarker[];
  logs: string[];
  warnings: string[];
  errors: PineScriptError[];
  meta: { title: string; isStrategy: boolean; overlay: boolean };
  execMs: number;
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
  | { type: "call"; name: string; args: Expr[]; namedArgs: Record<string, Expr>; id: number };

type Stmt =
  | { type: "if"; cond: Expr; body: Stmt[]; elseBody: Stmt[] | null; line: number }
  | { type: "assign"; name: string; expr: Expr; isVarDecl: boolean; line: number }
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
}

function withLine<T>(lineNo: number, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof PineError && err.line === undefined) err.line = lineNo;
    throw err;
  }
}

function parseSimpleStatement(line: Line, nextId: () => number): Stmt {
  let text = line.text;
  let isVar = false;
  if (/^var\s+/.test(text)) { isVar = true; text = text.replace(/^var\s+/, ""); }
  const m = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(:=|=)(?!=)\s*(.+)$/);
  if (m) {
    const [, name, op, rhs] = m;
    return { type: "assign", name, expr: withLine(line.lineNo, () => parseExpression(rhs, nextId)), isVarDecl: isVar && op === "=", line: line.lineNo };
  }
  return { type: "expr", expr: withLine(line.lineNo, () => parseExpression(text, nextId)), line: line.lineNo };
}

function parseBlock(lines: Line[], start: number, indent: number, nextId: () => number): { stmts: Stmt[]; next: number } {
  const stmts: Stmt[] = [];
  let i = start;
  while (i < lines.length && lines[i].indent >= indent) {
    const line = lines[i];
    if (/^if\b/.test(line.text)) {
      const cond = withLine(line.lineNo, () => parseExpression(line.text.replace(/^if\s*/, ""), nextId));
      i++;
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
          const res2 = parseBlock(lines, i, indent, nextId);
          elseBody = res2.stmts;
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
      stmts.push({ type: "if", cond, body, elseBody, line: line.lineNo });
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
  vars: Record<string, any>;
  varHistory: Record<string, any[]>;
  callState: Record<number, CallState>;
  plots: Record<number, PinePlotResult>;
  plotOrder: number[];
  markers: PineMarker[];
  logs: string[];
  warnings: string[];
  warned: Set<string>;
  bars: Bar[];
  barIndex: number;
  bar: Bar;
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
    case "strategy.long": return "long";
    case "strategy.short": return "short";
    case "true": return true;
    case "false": return false;
  }
  if (name.startsWith("color.")) {
    const c = COLOR_NAMES[name.slice(6)];
    if (c) return c;
  }
  if (Object.prototype.hasOwnProperty.call(ctx.vars, name)) return ctx.vars[name];
  return NaN;
}

function pushBarIdempotent(state: CallState, key: string, barIndex: number, value: number) {
  if (!state[key]) state[key] = { hist: [], lastBar: -1 };
  const s = state[key];
  if (s.lastBar !== barIndex) { s.hist.push(value); s.lastBar = barIndex; }
  return s.hist;
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
      return node.namedArgs.defval ? evalNode(node.namedArgs.defval, ctx) : (node.args[0] !== undefined ? argAt(0) : NaN);
    default:
      return NaN;
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
    case "call": return evalCall(node, ctx);
  }
  return NaN;
}

const KNOWN_IGNORED_CALLS = new Set(["hline", "fill", "bgcolor", "alertcondition", "alert", "strategy.close", "strategy.close_all", "strategy.exit", "barcolor", "runtime.error"]);

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
    const id = String(argAt(0));
    const dir = argAt(1);
    const isLong = dir === "long";
    ctx.markers.push({ time: ctx.bar.time, position: isLong ? "belowBar" : "aboveBar", color: isLong ? "#2962ff" : "#f23645", shape: isLong ? "arrowUp" : "arrowDown", text: id });
    return;
  }
  if (name.startsWith("log.")) {
    const msg = node.args.map((a) => String(evalNode(a, ctx))).join(" ");
    ctx.logs.push(`[bar ${ctx.barIndex}] ${msg}`);
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
    try {
      if (s.type === "if") {
        if (truthy(evalNode(s.cond, ctx))) execStmts(s.body, ctx);
        else if (s.elseBody) execStmts(s.elseBody, ctx);
      } else if (s.type === "assign") {
        if (!(s.isVarDecl && ctx.barIndex !== 0 && Object.prototype.hasOwnProperty.call(ctx.vars, s.name))) {
          ctx.vars[s.name] = evalNode(s.expr, ctx);
        }
        if (!ctx.varHistory[s.name]) ctx.varHistory[s.name] = [];
        ctx.varHistory[s.name][ctx.barIndex] = ctx.vars[s.name];
      } else {
        execExprStatement(s.expr, ctx);
      }
    } catch (err) {
      if (err instanceof PineError) { if (err.line === undefined) err.line = s.line; throw err; }
      const wrapped = new PineError(err instanceof Error ? err.message : String(err), "CE90001");
      wrapped.line = s.line;
      throw wrapped;
    }
  }
}

export function runPineScript(code: string, bars: Bar[]): PineRunResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const meta = { title: "Untitled script", isStrategy: false, overlay: true };
  const result: PineRunResult = { plots: [], markers: [], logs: [], warnings: [], errors: [], meta, execMs: 0 };
  try {
    const rawLines = code.split("\n");
    const lines: Line[] = [];
    for (let ln = 0; ln < rawLines.length; ln++) {
      const raw = rawLines[ln];
      const stripped = stripComment(raw);
      const trimmed = stripped.trim();
      if (!trimmed) continue;
      if (/^\/\/@version/.test(trimmed)) continue;
      if (/^(indicator|strategy|library)\s*\(/.test(trimmed)) { parseMeta(trimmed, meta); continue; }
      const indent = stripped.length - stripped.replace(/^[ \t]+/, "").length;
      lines.push({ indent, text: trimmed, lineNo: ln + 1 });
    }
    let counter = 0;
    const nextId = () => counter++;
    const { stmts } = parseBlock(lines, 0, 0, nextId);
    if (!bars || bars.length === 0) {
      result.errors.push({ message: "No chart data is available yet — wait for the chart to finish loading.", code: "CE90002", line: 1 });
      return result;
    }
    const ctx: Ctx = {
      vars: {}, varHistory: {}, callState: {}, plots: {}, plotOrder: [],
      markers: [], logs: [], warnings: [], warned: new Set(), bars,
      barIndex: 0, bar: bars[0],
    };
    for (let i = 0; i < bars.length; i++) {
      ctx.barIndex = i;
      ctx.bar = bars[i];
      execStmts(stmts, ctx);
    }
    result.plots = ctx.plotOrder.map((id) => ctx.plots[id]);
    result.markers = ctx.markers;
    result.logs = ctx.logs.slice(-200);
    result.warnings = ctx.warnings;
  } catch (err: any) {
    if (err instanceof PineError) {
      result.errors.push({ message: err.message, code: err.code, line: err.line ?? 1 });
    } else {
      result.errors.push({ message: err?.message ? String(err.message) : String(err), code: "CE99999", line: 1 });
    }
  }
  result.execMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  return result;
}
