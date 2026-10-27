// MQL5 → JavaScript. The script is read as MetaEditor would (preprocessor, then C-like source:
// globals, inputs, enums, structs, functions), checked (undeclared names, unknown functions)
// and turned into a JavaScript function the runtime (mql5Runtime.ts) calls: OnInit, then
// OnCalculate for an indicator or OnTick on every bar for an Expert Advisor.
//
// The generated code can only reach what the runtime hands it: every name from the script is
// prefixed (u_ for variables and functions, m_ for members), strings are emitted as literals,
// and loops check a deadline, so a script can neither touch the page nor hang it.

export class MqlError extends Error {
  line: number;
  code: string;
  constructor(message: string, line: number, code = "MQL5") { super(message); this.line = line; this.code = code; }
}

// --- Preprocessor ---
export interface MqlProperty { name: string; value: string; line: number }
interface Pre { src: string; props: MqlProperty[]; defines: Map<string, string>; comments: Map<number, string> }

function preprocess(code: string): Pre {
  const props: MqlProperty[] = [];
  const defines = new Map<string, string>();
  const lines = code.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t.startsWith("#")) { out.push(lines[i]); continue; }
    const m = t.match(/^#\s*(\w+)\s*(.*)$/);
    const dir = m?.[1] || "";
    const rest = (m?.[2] || "").replace(/\s*\/\/.*$/, "").trim();
    if (dir === "property") {
      const pm = rest.match(/^(\w+)\s*(.*)$/);
      if (pm) props.push({ name: pm[1], value: pm[2].trim(), line: i + 1 });
    } else if (dir === "define") {
      const dm = rest.match(/^(\w+)(\()?\s*(.*)$/);
      if (dm) {
        if (dm[2]) throw new MqlError(`'${dm[1]}' - macros with parameters aren't supported`, i + 1);
        defines.set(dm[1], dm[3]);
      }
    }
    // #include, #import, #ifdef … : the standard library parts the runtime provides itself
    out.push("");
  }
  return { src: out.join("\n"), props, defines, comments: new Map() };
}

// --- Lexer ---
type Tok = { t: "num"; v: number; f: boolean; line: number } | { t: "str"; v: string; line: number } | { t: "id"; v: string; line: number } | { t: "op"; v: string; line: number } | { t: "eof"; v: ""; line: number };
const OPS = [">>=", "<<=", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "->", "::"];

function lex(pre: Pre): Tok[] {
  const toks: Tok[] = [];
  const run = (s: string, startLine: number, depth: number, record: boolean) => {
    let i = 0, line = startLine;
    while (i < s.length) {
      const c = s[i];
      if (c === "\n") { line++; i++; continue; }
      if (c === " " || c === "\t" || c === "\r") { i++; continue; }
      if (c === "/" && s[i + 1] === "/") {
        const e = s.indexOf("\n", i); const end = e < 0 ? s.length : e;
        if (record) pre.comments.set(line, s.slice(i + 2, end).trim());
        i = end; continue;
      }
      if (c === "/" && s[i + 1] === "*") {
        const e = s.indexOf("*/", i + 2); const end = e < 0 ? s.length : e + 2;
        for (let k = i; k < end; k++) if (s[k] === "\n") line++;
        i = end; continue;
      }
      // D'2024.01.15 10:30' and C'255,0,0'
      if ((c === "D" || c === "C") && s[i + 1] === "'") {
        const e = s.indexOf("'", i + 2);
        if (e < 0) throw new MqlError("unterminated literal", line);
        const body = s.slice(i + 2, e);
        toks.push({ t: "num", v: c === "D" ? parseDateLiteral(body) : parseColorLiteral(body), f: false, line });
        i = e + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] || ""))) {
        const m = s.slice(i).match(/^(0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/)!;
        const txt = m[0];
        toks.push({ t: "num", v: txt.startsWith("0x") || txt.startsWith("0X") ? parseInt(txt, 16) : parseFloat(txt), f: /[.eE]/.test(txt) && !/^0[xX]/.test(txt), line });
        i += txt.length; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = s.slice(i).match(/^[A-Za-z_]\w*/)!;
        const id = m[0];
        i += id.length;
        const def = pre.defines.get(id);
        if (def !== undefined && depth < 16) { run(def, line, depth + 1, false); continue; }
        toks.push({ t: "id", v: id, line });
        continue;
      }
      if (c === '"') {
        let j = i + 1, v = "";
        while (j < s.length && s[j] !== '"') {
          if (s[j] === "\\") { const n = s[j + 1]; v += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n === "0" ? "\0" : n; j += 2; }
          else { if (s[j] === "\n") throw new MqlError("unterminated string", line); v += s[j++]; }
        }
        if (j >= s.length) throw new MqlError("unterminated string", line);
        toks.push({ t: "str", v, line });
        i = j + 1;
        // "a" "b" → "ab"
        continue;
      }
      if (c === "'") {
        let ch = s[i + 1], len = 3;
        if (ch === "\\") { const n = s[i + 2]; ch = n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n === "0" ? "\0" : n; len = 4; }
        if (s[i + len - 1] !== "'") throw new MqlError("bad character literal", line);
        toks.push({ t: "num", v: ch.charCodeAt(0), f: false, line });
        i += len; continue;
      }
      const op = OPS.find(o => s.startsWith(o, i)) || c;
      if (!"+-*/%<>=!&|^~?:;,.()[]{}".includes(op[0])) throw new MqlError(`'${c}' - unexpected character`, line);
      toks.push({ t: "op", v: op, line });
      i += op.length;
    }
  };
  run(pre.src, 1, 0, true);
  // Adjacent string literals join, as in C
  const joined: Tok[] = [];
  for (const t of toks) {
    const prev = joined[joined.length - 1];
    if (t.t === "str" && prev?.t === "str") prev.v += t.v; else joined.push(t);
  }
  joined.push({ t: "eof", v: "", line: toks.length ? toks[toks.length - 1].line : 1 });
  return joined;
}

function parseDateLiteral(s: string): number {
  const m = s.trim().match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return 0;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) / 1000);
}
function parseColorLiteral(s: string): number {
  const p = s.split(",").map(x => parseInt(x.trim(), x.trim().startsWith("0x") ? 16 : 10) || 0);
  return ((p[2] & 255) << 16) | ((p[1] & 255) << 8) | (p[0] & 255);
}

// --- Types ---
const INTEGRAL = new Set(["char", "uchar", "short", "ushort", "int", "uint", "long", "ulong", "datetime", "color"]);
const REAL = new Set(["double", "float"]);
export const BUILTIN_STRUCTS: Record<string, Record<string, string>> = {
  MqlRates: { time: "datetime", open: "double", high: "double", low: "double", close: "double", tick_volume: "long", spread: "int", real_volume: "long" },
  MqlTick: { time: "datetime", bid: "double", ask: "double", last: "double", volume: "ulong", time_msc: "long", flags: "uint", volume_real: "double" },
  MqlDateTime: { year: "int", mon: "int", day: "int", hour: "int", min: "int", sec: "int", day_of_week: "int", day_of_year: "int" },
  MqlTradeRequest: { action: "int", magic: "ulong", order: "ulong", symbol: "string", volume: "double", price: "double", stoplimit: "double", sl: "double", tp: "double", deviation: "ulong", type: "int", type_filling: "int", type_time: "int", expiration: "datetime", comment: "string", position: "ulong", position_by: "ulong" },
  MqlTradeResult: { retcode: "uint", deal: "ulong", order: "ulong", volume: "double", price: "double", bid: "double", ask: "double", comment: "string", request_id: "uint", retcode_external: "int" },
};
export const BUILTIN_CLASSES = new Set(["CTrade", "CPositionInfo", "CSymbolInfo", "CAccountInfo", "COrderInfo", "CDealInfo"]);

type Cat = "int" | "double" | "bool" | "string" | "void" | "struct" | "obj" | "any";
interface TypeRef { name: string }
interface Sym { js: string; type: string; array: boolean; ref: boolean; isConst?: boolean }

// --- AST ---
type Expr =
  | { k: "num"; v: number; f: boolean; line: number }
  | { k: "str"; v: string; line: number }
  | { k: "id"; name: string; line: number }
  | { k: "bin"; op: string; a: Expr; b: Expr; line: number }
  | { k: "un"; op: string; a: Expr; line: number }
  | { k: "pre"; op: string; a: Expr; line: number }
  | { k: "post"; op: string; a: Expr; line: number }
  | { k: "assign"; op: string; target: Expr; value: Expr; line: number }
  | { k: "tern"; c: Expr; a: Expr; b: Expr; line: number }
  | { k: "call"; callee: Expr; args: Expr[]; line: number }
  | { k: "idx"; a: Expr; i: Expr; line: number }
  | { k: "mem"; a: Expr; name: string; line: number }
  | { k: "cast"; type: string; a: Expr; line: number }
  | { k: "new"; type: string; line: number };
interface Decl { name: string; dims: (Expr | null)[]; init: Expr | null; line: number }
type Stmt =
  | { k: "block"; body: Stmt[]; line: number }
  | { k: "var"; type: TypeRef; decls: Decl[]; isStatic: boolean; isConst: boolean; line: number }
  | { k: "expr"; e: Expr; line: number }
  | { k: "if"; c: Expr; a: Stmt; b: Stmt | null; line: number }
  | { k: "for"; init: Stmt | null; c: Expr | null; step: Expr[]; body: Stmt; line: number }
  | { k: "while"; c: Expr; body: Stmt; line: number }
  | { k: "do"; body: Stmt; c: Expr; line: number }
  | { k: "switch"; e: Expr; cases: { tests: Expr[] | null; body: Stmt[] }[]; line: number }
  | { k: "break"; line: number } | { k: "continue"; line: number }
  | { k: "return"; e: Expr | null; line: number }
  | { k: "empty"; line: number }
  | { k: "delete"; e: Expr; line: number };
interface Param { type: string; name: string; ref: boolean; array: boolean; def: Expr | null }
interface FuncDef { name: string; ret: string; params: Param[]; body: Stmt[]; line: number }
export interface InputDecl { name: string; type: string; init: Expr | null; title: string; group: string; line: number; sinput: boolean }

interface Program {
  globals: Stmt[];       // var statements, in order
  inputs: InputDecl[];
  funcs: Map<string, FuncDef>;
  enums: Map<string, Map<string, number>>;
  structs: Map<string, { name: string; type: string; array: boolean }[]>;
}

class Parser {
  private p = 0;
  constructor(private toks: Tok[], private comments: Map<number, string>, private consts: Record<string, number | string>) {}
  prog: Program = { globals: [], inputs: [], funcs: new Map(), enums: new Map(), structs: new Map() };
  private group = "";

  private get tok() { return this.toks[this.p]; }
  private peek(n = 1) { return this.toks[Math.min(this.p + n, this.toks.length - 1)]; }
  private isOp(v: string, t = this.tok) { return t.t === "op" && t.v === v; }
  private isId(v: string, t = this.tok) { return t.t === "id" && t.v === v; }
  private next() { return this.toks[this.p++]; }
  private fail(msg: string, t = this.tok): never { throw new MqlError(msg, t.line); }
  private expectOp(v: string) {
    if (!this.isOp(v)) this.fail(`'${this.tok.v || "end of file"}' - ${v === ";" ? "semicolon expected" : `'${v}' expected`}`);
    return this.next();
  }
  private ident(): string {
    const t = this.tok;
    if (t.t !== "id") this.fail(`'${t.v || "end of file"}' - identifier expected`);
    this.p++;
    return t.v;
  }

  isType(name: string) {
    return INTEGRAL.has(name) || REAL.has(name) || name === "bool" || name === "string" || name === "void"
      || name.startsWith("ENUM_") || name in BUILTIN_STRUCTS || BUILTIN_CLASSES.has(name)
      || this.prog.enums.has(name) || this.prog.structs.has(name);
  }
  // A declaration starts here: [modifiers] type [*|&] name
  private atDecl() {
    let k = 0;
    while (["const", "static", "input", "sinput", "extern", "unsigned"].includes(String(this.peek(k).v)) && this.peek(k).t === "id") k++;
    const t = this.peek(k);
    if (t.t !== "id" || !this.isType(t.v)) return false;
    let n = this.peek(k + 1);
    if (n.t === "op" && (n.v === "*" || n.v === "&")) n = this.peek(k + 2);
    return n.t === "id";
  }

  parse(): Program {
    while (this.tok.t !== "eof") this.topLevel();
    return this.prog;
  }

  private topLevel() {
    const t = this.tok;
    if (this.isOp(";")) { this.p++; return; }
    if (this.isId("input") && this.peek().t === "id" && this.peek().v === "group") {
      this.p += 2;
      const g = this.tok;
      if (g.t !== "str") this.fail("group name expected");
      this.group = g.v; this.p++;
      this.expectOp(";");
      return;
    }
    if (this.isId("enum")) { this.enumDecl(); return; }
    if (this.isId("struct")) { this.structDecl(); return; }
    if (this.isId("class")) this.fail("classes aren't supported yet — use functions and structs");
    if (this.isId("template")) this.fail("templates aren't supported yet");
    let isInput = false, sinput = false, isConst = false, isStatic = false;
    for (;;) {
      if (this.isId("input") || this.isId("extern")) { isInput = true; this.p++; }
      else if (this.isId("sinput")) { isInput = true; sinput = true; this.p++; }
      else if (this.isId("const")) { isConst = true; this.p++; }
      else if (this.isId("static")) { isStatic = true; this.p++; }
      else if (this.isId("unsigned")) { this.p++; }
      else break;
    }
    void t;
    if (this.tok.t !== "id" || !this.isType(this.tok.v)) this.fail(`'${this.tok.v || "end of file"}' - unexpected token`);
    const type = this.next().v as string;
    if (this.isOp("*") || this.isOp("&")) this.p++;
    const nameTok = this.tok;
    const name = this.ident();
    if (this.isOp("(") && !isInput) { this.funcDecl(type, name, nameTok.line); return; }
    // Global variable(s) / input
    const decls = this.declRest(name, nameTok.line);
    if (isInput) {
      for (const d of decls) this.prog.inputs.push({ name: d.name, type, init: d.init, title: this.comments.get(d.line) || d.name, group: this.group, line: d.line, sinput });
    }
    this.prog.globals.push({ k: "var", type: { name: type }, decls, isStatic, isConst, line: nameTok.line });
    if (isInput) (this.prog.globals[this.prog.globals.length - 1] as any).input = true;
  }

  private enumDecl() {
    this.p++;
    const name = this.ident();
    const members = new Map<string, number>();
    this.prog.enums.set(name, members);
    this.expectOp("{");
    let val = 0;
    while (!this.isOp("}")) {
      const m = this.ident();
      if (this.isOp("=")) { this.p++; val = Number(this.constExpr()); }
      members.set(m, val);
      this.consts[m] = val;
      val++;
      if (this.isOp(",")) this.p++; else break;
    }
    this.expectOp("}");
    this.expectOp(";");
  }
  private constExpr(): number {
    let neg = false;
    if (this.isOp("-")) { neg = true; this.p++; }
    const t = this.next();
    let v = 0;
    if (t.t === "num") v = t.v;
    else if (t.t === "id" && typeof this.consts[t.v] === "number") v = this.consts[t.v] as number;
    else this.fail("constant expected", t);
    return neg ? -v : v;
  }

  private structDecl() {
    this.p++;
    const name = this.ident();
    const fields: { name: string; type: string; array: boolean }[] = [];
    this.prog.structs.set(name, fields);
    this.expectOp("{");
    while (!this.isOp("}")) {
      if (this.tok.t === "eof") this.fail("'}' expected");
      const type = this.ident();
      if (!this.isType(type)) this.fail(`'${type}' - unknown type`);
      for (;;) {
        const f = this.ident();
        let array = false;
        if (this.isOp("[")) { this.p++; while (!this.isOp("]")) this.p++; this.p++; array = true; }
        fields.push({ name: f, type, array });
        if (this.isOp(",")) { this.p++; continue; }
        break;
      }
      this.expectOp(";");
    }
    this.expectOp("}");
    this.expectOp(";");
  }

  private funcDecl(ret: string, name: string, line: number) {
    this.expectOp("(");
    const params: Param[] = [];
    if (this.isId("void") && this.isOp(")", this.peek())) this.p++;
    while (!this.isOp(")")) {
      if (this.isId("const")) this.p++;
      const type = this.ident();
      if (!this.isType(type)) this.fail(`'${type}' - unknown type`);
      let ref = false;
      if (this.isOp("&")) { ref = true; this.p++; }
      if (this.isOp("*")) this.p++;
      const pname = this.ident();
      let array = false;
      if (this.isOp("[")) { this.p++; if (!this.isOp("]")) this.expr(); this.expectOp("]"); array = true; }
      let def: Expr | null = null;
      if (this.isOp("=")) { this.p++; def = this.assignment(); }
      params.push({ type, name: pname, ref, array, def });
      if (this.isOp(",")) this.p++; else break;
    }
    this.expectOp(")");
    if (this.isId("const")) this.p++;
    if (this.isOp(";")) { this.p++; return; } // a forward declaration
    const body = this.block().body;
    this.prog.funcs.set(name, { name, ret, params, body, line });
  }

  private declRest(firstName: string, firstLine: number): Decl[] {
    const decls: Decl[] = [];
    let name = firstName, line = firstLine;
    for (;;) {
      const dims: (Expr | null)[] = [];
      while (this.isOp("[")) {
        this.p++;
        dims.push(this.isOp("]") ? null : this.expr());
        this.expectOp("]");
      }
      let init: Expr | null = null;
      if (this.isOp("=")) {
        this.p++;
        if (this.isOp("{")) init = this.initList(); else init = this.assignment();
      } else if (this.isOp("(")) {
        // Constructor-style arguments (CTrade t(); …): ignored
        this.p++;
        while (!this.isOp(")")) this.p++;
        this.p++;
      }
      decls.push({ name, dims, init, line });
      if (!this.isOp(",")) break;
      this.p++;
      if (this.isOp("*") || this.isOp("&")) this.p++;
      line = this.tok.line;
      name = this.ident();
    }
    this.expectOp(";");
    return decls;
  }
  // {1, 2, 3} → an array literal (a call to the runtime's list builder)
  private initList(): Expr {
    const line = this.tok.line;
    this.expectOp("{");
    const items: Expr[] = [];
    while (!this.isOp("}")) {
      items.push(this.isOp("{") ? this.initList() : this.assignment());
      if (this.isOp(",")) this.p++; else break;
    }
    this.expectOp("}");
    return { k: "call", callee: { k: "id", name: "__list", line }, args: items, line };
  }

  block(): { k: "block"; body: Stmt[]; line: number } {
    const line = this.tok.line;
    this.expectOp("{");
    const body: Stmt[] = [];
    while (!this.isOp("}")) {
      if (this.tok.t === "eof") this.fail("'}' - unbalanced parentheses");
      body.push(this.stmt());
    }
    this.p++;
    return { k: "block", body, line };
  }

  stmt(): Stmt {
    const t = this.tok, line = t.line;
    if (this.isOp("{")) return this.block();
    if (this.isOp(";")) { this.p++; return { k: "empty", line }; }
    if (t.t === "id") {
      switch (t.v) {
        case "if": {
          this.p++; this.expectOp("("); const c = this.expr(); this.expectOp(")");
          const a = this.stmt();
          let b: Stmt | null = null;
          if (this.isId("else")) { this.p++; b = this.stmt(); }
          return { k: "if", c, a, b, line };
        }
        case "for": {
          this.p++; this.expectOp("(");
          let init: Stmt | null = null;
          if (this.isOp(";")) this.p++;
          else if (this.atDecl()) init = this.varStmt();
          else { init = { k: "expr", e: this.exprList(), line }; this.expectOp(";"); }
          const c = this.isOp(";") ? null : this.expr();
          this.expectOp(";");
          const step: Expr[] = [];
          while (!this.isOp(")")) { step.push(this.assignment()); if (this.isOp(",")) this.p++; else break; }
          this.expectOp(")");
          return { k: "for", init, c, step, body: this.stmt(), line };
        }
        case "while": {
          this.p++; this.expectOp("("); const c = this.expr(); this.expectOp(")");
          return { k: "while", c, body: this.stmt(), line };
        }
        case "do": {
          this.p++;
          const body = this.stmt();
          if (!this.isId("while")) this.fail("'while' expected");
          this.p++; this.expectOp("("); const c = this.expr(); this.expectOp(")"); this.expectOp(";");
          return { k: "do", body, c, line };
        }
        case "switch": {
          this.p++; this.expectOp("("); const e = this.expr(); this.expectOp(")");
          this.expectOp("{");
          const cases: { tests: Expr[] | null; body: Stmt[] }[] = [];
          while (!this.isOp("}")) {
            if (this.isId("case")) {
              this.p++;
              const test = this.ternary();
              this.expectOp(":");
              const last = cases[cases.length - 1];
              if (last && last.body.length === 0 && last.tests) last.tests.push(test);
              else cases.push({ tests: [test], body: [] });
            } else if (this.isId("default")) {
              this.p++; this.expectOp(":");
              cases.push({ tests: null, body: [] });
            } else {
              if (!cases.length) this.fail("'case' expected");
              cases[cases.length - 1].body.push(this.stmt());
            }
          }
          this.p++;
          return { k: "switch", e, cases, line };
        }
        case "break": this.p++; this.expectOp(";"); return { k: "break", line };
        case "continue": this.p++; this.expectOp(";"); return { k: "continue", line };
        case "return": {
          this.p++;
          const e = this.isOp(";") ? null : this.expr();
          this.expectOp(";");
          return { k: "return", e, line };
        }
        case "delete": { this.p++; const e = this.expr(); this.expectOp(";"); return { k: "delete", e, line }; }
      }
      if (this.atDecl()) return this.varStmt();
    }
    const e = this.exprList();
    this.expectOp(";");
    return { k: "expr", e, line };
  }

  private varStmt(): Stmt {
    const line = this.tok.line;
    let isStatic = false, isConst = false;
    for (;;) {
      if (this.isId("static")) { isStatic = true; this.p++; }
      else if (this.isId("const")) { isConst = true; this.p++; }
      else if (this.isId("unsigned")) this.p++;
      else break;
    }
    const type = this.ident();
    if (this.isOp("*") || this.isOp("&")) this.p++;
    const nl = this.tok.line;
    const name = this.ident();
    return { k: "var", type: { name: type }, decls: this.declRest(name, nl), isStatic, isConst, line };
  }

  // --- Expressions (C precedence) ---
  private exprList(): Expr {
    let e = this.assignment();
    while (this.isOp(",")) { const line = this.tok.line; this.p++; e = { k: "bin", op: ",", a: e, b: this.assignment(), line }; }
    return e;
  }
  expr(): Expr { return this.exprList(); }
  private assignment(): Expr {
    const left = this.ternary();
    const t = this.tok;
    if (t.t === "op" && ["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="].includes(t.v)) {
      this.p++;
      if (left.k !== "id" && left.k !== "idx" && left.k !== "mem") this.fail("'=' - l-value required", t);
      return { k: "assign", op: t.v, target: left, value: this.assignment(), line: t.line };
    }
    return left;
  }
  private ternary(): Expr {
    const c = this.binary(0);
    if (this.isOp("?")) {
      const line = this.tok.line;
      this.p++;
      const a = this.assignment();
      this.expectOp(":");
      return { k: "tern", c, a, b: this.assignment(), line };
    }
    return c;
  }
  private static PREC: Record<string, number> = {
    "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, "<=": 7, ">": 7, ">=": 7, "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10,
  };
  private binary(min: number): Expr {
    let left = this.unary();
    for (;;) {
      const t = this.tok;
      const prec = t.t === "op" ? Parser.PREC[t.v] : undefined;
      if (prec === undefined || prec <= min) break;
      this.p++;
      left = { k: "bin", op: String(t.v), a: left, b: this.binary(prec), line: t.line };
    }
    return left;
  }
  private unary(): Expr {
    const t = this.tok;
    if (t.t === "op") {
      if (t.v === "!" || t.v === "-" || t.v === "+" || t.v === "~") { this.p++; return { k: "un", op: t.v, a: this.unary(), line: t.line }; }
      if (t.v === "++" || t.v === "--") { this.p++; return { k: "pre", op: t.v, a: this.unary(), line: t.line }; }
      if (t.v === "&") { this.p++; return this.unary(); } // address-of: objects are references already
      if (t.v === "(") {
        // (type)expr
        const n = this.peek();
        if (n.t === "id" && this.isType(n.v) && this.isOp(")", this.peek(2))) {
          this.p += 3;
          return { k: "cast", type: n.v, a: this.unary(), line: t.line };
        }
      }
    }
    if (this.isId("new")) {
      this.p++;
      const type = this.ident();
      if (this.isOp("(")) { this.p++; this.expectOp(")"); }
      return { k: "new", type, line: t.line };
    }
    return this.postfix(this.primary());
  }
  private postfix(e: Expr): Expr {
    for (;;) {
      const t = this.tok;
      if (this.isOp("(")) {
        this.p++;
        const args: Expr[] = [];
        while (!this.isOp(")")) { args.push(this.assignment()); if (this.isOp(",")) this.p++; else break; }
        this.expectOp(")");
        e = { k: "call", callee: e, args, line: t.line };
      } else if (this.isOp("[")) {
        this.p++;
        const i = this.expr();
        this.expectOp("]");
        e = { k: "idx", a: e, i, line: t.line };
      } else if (this.isOp(".") || this.isOp("->")) {
        this.p++;
        e = { k: "mem", a: e, name: this.ident(), line: t.line };
      } else if (this.isOp("++") || this.isOp("--")) {
        this.p++;
        e = { k: "post", op: String(t.v), a: e, line: t.line };
      } else return e;
    }
  }
  private primary(): Expr {
    const t = this.next();
    if (t.t === "num") return { k: "num", v: t.v, f: t.f, line: t.line };
    if (t.t === "str") return { k: "str", v: t.v, line: t.line };
    if (t.t === "id") {
      if (t.v === "true" || t.v === "false") return { k: "num", v: t.v === "true" ? 1 : 0, f: false, line: t.line, bool: true } as any;
      if (this.isOp("::")) { this.p++; return this.primary(); }
      return { k: "id", name: t.v, line: t.line };
    }
    if (t.t === "op" && t.v === "(") {
      const e = this.expr();
      this.expectOp(")");
      return e;
    }
    if (t.t === "op" && t.v === "::") return this.primary();
    this.fail(`'${t.v || "end of file"}' - unexpected token`, t);
  }
}

// --- Code generation ---
export interface BuiltinFn { ret: Cat; refs?: number[] }
export interface CompileEnv {
  consts: Record<string, number | string>;
  vars: Record<string, Cat>;            // _Symbol, _Point … (read from B)
  funcs: Record<string, BuiltinFn>;      // Print, iMA, ArraySize … (called on F)
  methods: Record<string, Record<string, Cat>>; // class → method → return type
}

const catOf = (type: string, structs: Map<string, unknown>): Cat =>
  INTEGRAL.has(type) || type.startsWith("ENUM_") ? "int" : REAL.has(type) ? "double" : type === "bool" ? "bool" : type === "string" ? "string" : type === "void" ? "void"
    : type in BUILTIN_STRUCTS || structs.has(type) ? "struct" : BUILTIN_CLASSES.has(type) ? "obj" : "int"; // user enums are integers

export interface Compiled {
  js: string;
  inputs: InputDecl[];
  enums: Map<string, Map<string, number>>;
  funcs: Set<string>;
  onCalculateParams: number;
}

export function compileMql5(code: string, env: CompileEnv): { compiled: Compiled; props: MqlProperty[] } {
  const pre = preprocess(code);
  const toks = lex(pre);
  const consts = { ...env.consts };
  const prog = new Parser(toks, pre.comments, consts).parse();
  const structs = prog.structs;
  const isUserEnum = (t: string) => prog.enums.has(t);
  const cat = (t: string) => catOf(t, structs);
  const out: string[] = [];
  const hoisted: string[] = [];
  let uid = 0;

  const scopes: Map<string, Sym>[] = [new Map()];
  const lookup = (name: string): Sym | null => { for (let i = scopes.length - 1; i >= 0; i--) { const s = scopes[i].get(name); if (s) return s; } return null; };
  const declare = (name: string, sym: Sym, line: number) => {
    const top = scopes[scopes.length - 1];
    if (top.has(name) && scopes.length > 1) throw new MqlError(`'${name}' - variable already defined`, line);
    top.set(name, sym);
  };
  let curFunc: FuncDef | null = null;

  const lit = (v: number | string) => typeof v === "string" ? JSON.stringify(v) : Object.is(v, -0) ? "0" : String(v);
  const isInt = (c: Cat) => c === "int" || c === "bool";

  // A fresh value of a type (scalars' defaults, structs and objects as new instances)
  function makeValue(type: string, line: number): string {
    if (type in BUILTIN_STRUCTS) return `$.struct(${JSON.stringify(type)})`;
    if (structs.has(type)) return `$S_${type}()`;
    if (BUILTIN_CLASSES.has(type)) return `$.obj(${JSON.stringify(type)})`;
    const c = cat(type);
    if (c === "string") return '""';
    if (c === "bool") return "false";
    if (c === "void") throw new MqlError("'void' - illegal use of type", line);
    return "0";
  }
  function arrayFactory(type: string, line: number): string {
    const c = cat(type);
    if (c === "struct" || c === "obj") return `()=>${makeValue(type, line)}`;
    return c === "string" ? '""' : c === "bool" ? "false" : "0";
  }

  function coerce(code: string, from: Cat, to: Cat): string {
    if (to === "int" && from !== "int" && from !== "bool") return `$.int(${code})`;
    if (to === "double" && from === "string") return `$.num(${code})`;
    if (to === "string" && from !== "string") return `$.str(${code})`;
    if (to === "bool" && from !== "bool") return `!!(${code})`;
    if (to === "struct") return `$.copy(${code})`;
    return code;
  }

  type R = { c: string; t: Cat; elem?: string; arr?: boolean; type?: string };

  function gen(e: Expr): R {
    switch (e.k) {
      case "num": return (e as any).bool ? { c: e.v ? "true" : "false", t: "bool" } : { c: lit(e.v), t: e.f ? "double" : "int" };
      case "str": return { c: lit(e.v), t: "string" };
      case "id": {
        const s = lookup(e.name);
        if (s) {
          const c = s.ref && !s.array && cat(s.type) !== "struct" && cat(s.type) !== "obj" ? `${s.js}.v` : s.js;
          return { c, t: s.array ? "any" : cat(s.type), arr: s.array, type: s.type };
        }
        if (e.name in consts) { const v = consts[e.name]; return { c: lit(v), t: typeof v === "string" ? "string" : Number.isInteger(v) ? "int" : "double" }; }
        if (e.name in env.vars) return { c: `B.${e.name}`, t: env.vars[e.name] };
        if (e.name === "NULL") return { c: "null", t: "any" };
        throw new MqlError(`'${e.name}' - undeclared identifier`, e.line);
      }
      case "bin": {
        if (e.op === ",") { const a = gen(e.a), b = gen(e.b); return { c: `(${a.c},${b.c})`, t: b.t }; }
        const a = gen(e.a), b = gen(e.b);
        switch (e.op) {
          case "&&": case "||": return { c: `!!(${a.c}${e.op}${b.c})`, t: "bool" };
          case "==": case "!=": return { c: `(${a.c}${e.op}${b.c})`, t: "bool" };
          case "<": case "<=": case ">": case ">=": return { c: `(${a.c}${e.op}${b.c})`, t: "bool" };
          case "/": return isInt(a.t) && isInt(b.t) ? { c: `$.idiv(${a.c},${b.c})`, t: "int" } : { c: `(${a.c}/${b.c})`, t: "double" };
          case "%": return { c: isInt(a.t) && isInt(b.t) ? `$.imod(${a.c},${b.c})` : `(${a.c}%${b.c})`, t: isInt(a.t) && isInt(b.t) ? "int" : "double" };
          case "+": {
            if (a.t === "string" || b.t === "string") return { c: `(${a.t === "string" ? a.c : `$.str(${a.c})`}+${b.t === "string" ? b.c : `$.str(${b.c})`})`, t: "string" };
            return { c: `(${a.c}+${b.c})`, t: isInt(a.t) && isInt(b.t) ? "int" : a.t === "any" || b.t === "any" ? "any" : "double" };
          }
          case "-": case "*": return { c: `(${a.c}${e.op}${b.c})`, t: isInt(a.t) && isInt(b.t) ? "int" : a.t === "any" || b.t === "any" ? "any" : "double" };
          default: return { c: `(${a.c}${e.op}${b.c})`, t: "int" }; // bitwise
        }
      }
      case "un": {
        const a = gen(e.a);
        if (e.op === "!") return { c: `(!${a.c})`, t: "bool" };
        if (e.op === "~") return { c: `(~${a.c})`, t: "int" };
        return { c: `(${e.op}${a.c})`, t: a.t === "bool" ? "int" : a.t };
      }
      case "pre": case "post": return genIncDec(e.a, e.op === "++" ? 1 : -1, e.k === "post", e.line);
      case "tern": {
        const c = gen(e.c), a = gen(e.a), b = gen(e.b);
        return { c: `(${c.c}?${a.c}:${b.c})`, t: a.t === b.t ? a.t : a.t === "string" || b.t === "string" ? "string" : isInt(a.t) && isInt(b.t) ? "int" : "double" };
      }
      case "cast": {
        const a = gen(e.a);
        return { c: coerce(a.c, a.t, cat(e.type)), t: cat(e.type) };
      }
      case "new": return { c: makeValue(e.type, e.line), t: cat(e.type), type: e.type };
      case "idx": {
        const a = gen(e.a), i = gen(e.i);
        if (a.t === "string" && !a.arr) return { c: `$.charAt(${a.c},${i.c})`, t: "int" };
        return { c: `${a.c}.g(${i.c})`, t: a.type ? cat(a.type) : "any", type: a.type };
      }
      case "mem": {
        const a = gen(e.a);
        // A struct field: its declared type when known
        const st = a.type && structs.get(a.type);
        const bst = a.type && BUILTIN_STRUCTS[a.type];
        let t: Cat = "any", type: string | undefined;
        if (st) { const f = st.find(x => x.name === e.name); if (!f) throw new MqlError(`'${e.name}' - undeclared identifier`, e.line); type = f.type; t = f.array ? "any" : cat(f.type); return { c: `${a.c}.m_${e.name}`, t, type, arr: f.array }; }
        if (bst) { type = bst[e.name]; if (!type) throw new MqlError(`'${e.name}' - undeclared identifier`, e.line); t = cat(type); }
        return { c: `${a.c}.m_${e.name}`, t, type };
      }
      case "assign": return genAssign(e.target, e.op, e.value, e.line);
      case "call": return genCall(e);
    }
  }

  // An assignable place. An array element works out its array and index once (into temps,
  // `prep`), then reads and writes through them.
  interface LValue { get: string; set: (v: string) => string; t: Cat; type?: string; prep?: string; ta?: string; ti?: string }
  function lvalue(target: Expr, line: number): LValue {
    if (target.k === "id") {
      const s = lookup(target.name);
      if (!s) throw new MqlError(`'${target.name}' - undeclared identifier`, line);
      if (s.isConst) throw new MqlError(`'${target.name}' - constant cannot be modified`, line);
      const ref = s.ref && !s.array && cat(s.type) !== "struct" && cat(s.type) !== "obj";
      const get = ref ? `${s.js}.v` : s.js;
      return { get, set: v => `(${get}=${v})`, t: s.array ? "any" : cat(s.type), type: s.type };
    }
    if (target.k === "idx") {
      const a = gen(target.a), i = gen(target.i);
      const ta = `$t${uid++}`, ti = `$t${uid++}`;
      hoisted.push(`let ${ta},${ti};`);
      return { get: `${ta}.g(${ti})`, set: v => `${ta}.s(${ti},${v})`, prep: `${ta}=${a.c},${ti}=${i.c}`, ta, ti, t: a.type ? cat(a.type) : "any", type: a.type };
    }
    if (target.k === "mem") {
      const r = gen(target);
      return { get: r.c, set: v => `(${r.c}=${v})`, t: r.t, type: r.type };
    }
    throw new MqlError("l-value required", line);
  }
  const withPrep = (lv: LValue, code: string) => lv.prep ? `(${lv.prep},${code})` : code;

  function genAssign(target: Expr, op: string, value: Expr, line: number): R {
    const lv = lvalue(target, line);
    const v = gen(value);
    if (op === "=") {
      if (lv.t === "struct") return { c: withPrep(lv, lv.set(`$.copy(${v.c})`)), t: lv.t };
      return { c: withPrep(lv, lv.set(coerce(v.c, v.t, lv.t === "any" ? v.t : lv.t))), t: lv.t };
    }
    const bop = op.slice(0, -1);
    let combined: string, ct: Cat;
    if (bop === "/" && isInt(lv.t) && isInt(v.t)) { combined = `$.idiv(${lv.get},${v.c})`; ct = "int"; }
    else if (bop === "+" && (lv.t === "string" || v.t === "string")) { combined = `(${lv.get}+$.str(${v.c}))`; ct = "string"; }
    else { combined = `(${lv.get}${bop}${v.c})`; ct = isInt(v.t) || ["&", "|", "^", "<<", ">>", "%"].includes(bop) ? lv.t : "double"; }
    return { c: withPrep(lv, lv.set(coerce(combined, ct, lv.t === "any" ? ct : lv.t))), t: lv.t };
  }

  function genIncDec(target: Expr, d: number, post: boolean, line: number): R {
    const lv = lvalue(target, line);
    if (lv.prep) return { c: withPrep(lv, `$.aincr(${lv.ta},${lv.ti},${d},${post})`), t: lv.t };
    const op = d > 0 ? "++" : "--";
    return { c: post ? `(${lv.get}${op})` : `(${op}${lv.get})`, t: lv.t };
  }

  function genArgsFor(params: { ref: boolean; array: boolean; type: string }[], args: Expr[], line: number): string[] {
    return args.map((a, i) => {
      const p = params[i];
      if (p && p.ref && !p.array && cat(p.type) !== "struct" && cat(p.type) !== "obj") {
        // A scalar passed by reference: a box the function reads and writes through
        if (a.k === "id") {
          const s = lookup(a.name);
          if (s && s.ref && !s.array) return s.js;
        }
        if (a.k !== "id" && a.k !== "idx" && a.k !== "mem") throw new MqlError("parameter passed by reference, variable expected", line);
        const lv = lvalue(a, line);
        if (lv.prep) return withPrep(lv, `$.abox(${lv.ta},${lv.ti})`);
        return `{get v(){return ${lv.get}},set v($v){${lv.get}=$v}}`;
      }
      const r = gen(a);
      return p ? coerce(r.c, r.t, p.array ? r.t : cat(p.type) === "struct" ? r.t : cat(p.type)) : r.c;
    });
  }

  function genCall(e: Extract<Expr, { k: "call" }>): R {
    const callee = e.callee;
    if (callee.k === "id") {
      const name = callee.name;
      // type(x): a function-style cast
      if (INTEGRAL.has(name) || REAL.has(name) || name === "string" || name === "bool") {
        const a = gen(e.args[0]);
        return { c: coerce(a.c, a.t, cat(name)), t: cat(name) };
      }
      if (name === "__list") return { c: `$.list([${e.args.map(a => gen(a).c).join(",")}])`, t: "any" };
      const f = prog.funcs.get(name);
      if (f) {
        if (e.args.length > f.params.length) throw new MqlError(`'${name}' - wrong parameters count`, e.line);
        for (let i = e.args.length; i < f.params.length; i++) if (!f.params[i].def) throw new MqlError(`'${name}' - wrong parameters count`, e.line);
        return { c: `u_${name}(${genArgsFor(f.params, e.args, e.line).join(",")})`, t: cat(f.ret), type: f.ret };
      }
      const b = env.funcs[name];
      if (b) {
        const params = e.args.map((_, i) => ({ ref: !!b.refs?.includes(i), array: false, type: "double" }));
        const args = e.args.map((a, i) => params[i].ref ? genArgsFor([params[i]], [a], e.line)[0] : gen(a).c);
        return { c: `F.${name}(${args.join(",")})`, t: b.ret };
      }
      throw new MqlError(`'${name}' - undeclared identifier`, e.line);
    }
    if (callee.k === "mem") {
      const obj = gen(callee.a);
      const methods = obj.type ? env.methods[obj.type] : undefined;
      if (obj.type && BUILTIN_CLASSES.has(obj.type) && methods && !(callee.name in methods)) throw new MqlError(`'${callee.name}' - undeclared identifier`, e.line);
      return { c: `${obj.c}.m_${callee.name}(${e.args.map(a => gen(a).c).join(",")})`, t: methods?.[callee.name] ?? "any" };
    }
    throw new MqlError("function name expected", e.line);
  }

  // --- Statements ---
  const LOOP_GUARD = "if((++$c&262143)===0)$.tick();";
  // A control statement's body is always braced: the line marker makes every statement two
  const body = (s: Stmt, ind: string) => s.k === "block" ? genStmt(s, ind) : `${ind}{\n${genStmt(s, ind + " ")}\n${ind}}`;
  function genStmt(s: Stmt, ind: string): string {
    const L = `$L=${s.line};`;
    switch (s.k) {
      case "block": {
        scopes.push(new Map());
        const body = s.body.map(x => genStmt(x, ind + " ")).join("\n");
        scopes.pop();
        return `${ind}{\n${body}\n${ind}}`;
      }
      case "empty": return `${ind};`;
      case "var": return genVar(s, ind, false);
      case "expr": return `${ind}${L}${gen(s.e).c};`;
      case "if": return `${ind}${L}if(${gen(s.c).c})\n${body(s.a, ind + " ")}${s.b ? `\n${ind}else\n${body(s.b, ind + " ")}` : ""}`;
      case "while": return `${ind}${L}while(${gen(s.c).c}){${LOOP_GUARD}\n${genStmt(s.body, ind + " ")}\n${ind}}`;
      case "do": return `${ind}${L}do{${LOOP_GUARD}\n${genStmt(s.body, ind + " ")}\n${ind}}while(${gen(s.c).c});`;
      case "for": {
        scopes.push(new Map());
        const init = s.init ? (s.init.k === "var" ? genVar(s.init, "", true) : gen((s.init as Extract<Stmt, { k: "expr" }>).e).c) : "";
        const c = s.c ? gen(s.c).c : "";
        const step = s.step.map(x => gen(x).c).join(",");
        const inner = genStmt(s.body, ind + " ");
        scopes.pop();
        return `${ind}${L}for(${init};${c};${step}){${LOOP_GUARD}\n${inner}\n${ind}}`;
      }
      case "switch": {
        const e = gen(s.e);
        scopes.push(new Map());
        const cases = s.cases.map(cs => {
          const labels = cs.tests ? cs.tests.map(t => `case ${gen(t).c}:`).join("") : "default:";
          return `${ind} ${labels}\n${cs.body.map(x => genStmt(x, ind + "  ")).join("\n")}`;
        }).join("\n");
        scopes.pop();
        return `${ind}${L}switch(${e.c}){\n${cases}\n${ind}}`;
      }
      case "break": return `${ind}break;`;
      case "continue": return `${ind}continue;`;
      case "return": {
        if (!s.e) return `${ind}${L}return;`;
        const r = gen(s.e);
        const rt = curFunc ? cat(curFunc.ret) : "any";
        return `${ind}${L}return ${rt === "void" ? r.c : coerce(r.c, r.t, rt === "struct" ? r.t : rt)};`;
      }
      case "delete": return `${ind};`;
    }
  }

  function genVar(s: Extract<Stmt, { k: "var" }>, ind: string, inFor: boolean, global = false): string {
    const type = s.type.name;
    if (!(INTEGRAL.has(type) || REAL.has(type) || type === "bool" || type === "string" || type.startsWith("ENUM_") || isUserEnum(type) || type in BUILTIN_STRUCTS || structs.has(type) || BUILTIN_CLASSES.has(type)))
      throw new MqlError(`'${type}' - unknown type`, s.line);
    const c = cat(type);
    const parts: string[] = [];
    for (const d of s.decls) {
      const isArr = d.dims.length > 0;
      if (d.dims.length > 1) throw new MqlError(`'${d.name}' - multi-dimensional arrays aren't supported yet`, d.line);
      const js = s.isStatic && !global ? `$s${uid++}_${d.name}` : `u_${d.name}`;
      let init: string;
      if (isArr) {
        const size = d.dims[0] ? gen(d.dims[0]).c : "0";
        init = d.init ? `$.arrFrom(${gen(d.init).c},${arrayFactory(type, d.line)},${size})` : `$.arr(${arrayFactory(type, d.line)},${size},${d.dims[0] ? "true" : "false"})`;
      } else if (d.init && c === "struct" && d.init.k === "call" && d.init.callee.k === "id" && d.init.callee.name === "__list") {
        init = makeValue(type, d.line); // MqlTradeRequest req = {}; → zeroed
      } else if (d.init) {
        const r = gen(d.init);
        init = c === "struct" ? `$.copy(${r.c})` : coerce(r.c, r.t, c);
      } else init = makeValue(type, d.line);
      if ((s as any).input && !isArr) {
        const enumName = isUserEnum(type) ? type : type.startsWith("ENUM_") ? type : "";
        init = `$.input(${JSON.stringify(d.name)},${init},${JSON.stringify(c)},${JSON.stringify(enumName)})`;
      }
      declare(d.name, { js, type, array: isArr, ref: false, isConst: s.isConst || !!(s as any).input }, d.line);
      if (s.isStatic && !global) { hoisted.push(`let ${js}=${init};`); continue; }
      parts.push(`${js}=${init}`);
    }
    if (!parts.length) return inFor ? "" : `${ind};`;
    return inFor ? `let ${parts.join(",")}` : `${ind}$L=${s.line};${global ? "" : "let "}${parts.join(",")};`;
  }

  // Globals, then functions (all names are known before any body is generated)
  for (const [name, fields] of Array.from(structs)) {
    out.push(`function $S_${name}(){return {${fields.map(f => `m_${f.name}:${f.array ? `$.arr(${arrayFactory(f.type, 0)},0,false)` : makeValue(f.type, 0)}`).join(",")}};}`);
  }
  const globalDecls: string[] = [];
  for (const g of prog.globals) {
    if (g.k !== "var") continue;
    for (const d of g.decls) globalDecls.push(`u_${d.name}`);
  }
  if (globalDecls.length) out.push(`let ${globalDecls.join(",")};`);
  // Functions are declared first, so globals' initializers may call them
  const funcOut: string[] = [];
  for (const g of prog.globals) out.push(genVar(g as Extract<Stmt, { k: "var" }>, "", false, true));
  for (const f of Array.from(prog.funcs.values())) {
    curFunc = f;
    scopes.push(new Map());
    const params = f.params.map(p => {
      declare(p.name, { js: `u_${p.name}`, type: p.type, array: p.array, ref: p.ref }, f.line);
      return p.def ? `u_${p.name}=${gen(p.def).c}` : `u_${p.name}`;
    });
    const body = f.body.map(s => genStmt(s, " ")).join("\n");
    scopes.pop();
    funcOut.push(`function u_${f.name}(${params.join(",")}){\n${body}\n}`);
    curFunc = null;
  }
  const exportsList = ["OnInit", "OnCalculate", "OnTick", "OnDeinit", "OnStart"].map(n => `${n}:${prog.funcs.has(n) ? `u_${n}` : "null"}`).join(",");
  const js = `"use strict";\nlet $L=0,$c=0;\n${hoisted.join("\n")}\n${funcOut.join("\n")}\n$.lineOf=()=>$L;\n${out.join("\n")}\nreturn {${exportsList}};`;
  return {
    compiled: { js, inputs: prog.inputs, enums: prog.enums, funcs: new Set(prog.funcs.keys()), onCalculateParams: prog.funcs.get("OnCalculate")?.params.length ?? 0 },
    props: pre.props,
  };
}

// Inputs as the settings dialog shows them, read without running the script
export function scanMql5Inputs(code: string): { name: string; type: string; init: string; title: string; group: string; enumMembers?: string[] }[] {
  const res: { name: string; type: string; init: string; title: string; group: string; enumMembers?: string[] }[] = [];
  const src = code.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  const enums = new Map<string, string[]>();
  for (const m of Array.from(src.matchAll(/\benum\s+(\w+)\s*\{([^}]*)\}/g))) enums.set(m[1], m[2].split(",").map((x: string) => x.replace(/\/\/.*$/gm, "").split("=")[0].trim()).filter(Boolean));
  let group = "";
  for (const line of src.split(/\r?\n/)) {
    const g = line.match(/^\s*input\s+group\s+"([^"]*)"/);
    if (g) { group = g[1]; continue; }
    const m = line.match(/^\s*(?:input|sinput|extern)\s+(?:const\s+)?(\w+)\s+(\w+)\s*(?:=\s*([^;]+))?;\s*(?:\/\/\s*(.*))?$/);
    if (!m) continue;
    res.push({ type: m[1], name: m[2], init: (m[3] || "").trim(), title: (m[4] || "").trim() || m[2], group, enumMembers: enums.get(m[1]) });
  }
  return res;
}
