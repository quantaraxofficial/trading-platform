// Pine Script in Monaco, as TradingView's Pine Editor has it: the tokenizer and colours (taken
// from TradingView's editor, light and dark), autocomplete from the Pine v6 built-ins (names,
// kinds and type details as TradingView lists them), hover cards with each built-in's syntax,
// and Ctrl + Click on a built-in to open it in the Pine reference manual.

import type * as Monaco from "monaco-editor";
import { PINE_CATALOG, type PineEntry } from "../../lib/pineCatalog";

export const PINE_LANG = "pine";
export const PINE_THEME_LIGHT = "tv-pine-light";
export const PINE_THEME_DARK = "tv-pine-dark";
export const PINE_FONT = 'Menlo, "Ubuntu Mono", Consolas, source-code-pro, monospace';

// --- Catalog lookups ---
const BY_NAME = new Map<string, PineEntry & { ns: string }>();
for (const [ns, list] of Object.entries(PINE_CATALOG)) {
  for (const e of list) {
    const full = ns ? `${ns}.${e[0]}` : e[0];
    if (!BY_NAME.has(full)) BY_NAME.set(full, Object.assign([...e] as PineEntry, { ns }));
  }
}
const isFn = (e: PineEntry) => /function|method/.test(e[1]) || /function|method/.test(e[2]);
const FUNCTIONS = Array.from(BY_NAME.entries()).filter(([, e]) => isFn(e)).map(([n]) => n);
const VALUES = Array.from(BY_NAME.entries()).filter(([, e]) => !isFn(e) && !/namespace|module|keyword|class|enum|struct/.test(e[1])).map(([n]) => n);
export function lookupBuiltin(name: string) { return BY_NAME.get(name) ?? null; }

const KEYWORDS = ["if", "else", "for", "to", "by", "while", "switch", "and", "or", "not", "var", "varip", "import", "as", "export", "method", "type", "enum", "break", "continue", "in", "true", "false"];
const QUALIFIERS = ["const", "simple", "series"];
const TYPES = ["int", "float", "bool", "string", "color", "line", "label", "box", "table", "linefill", "polyline", "array", "matrix", "map"];

// --- Language ---
function language(): Monaco.languages.IMonarchLanguage {
  return {
    defaultToken: "",
    tokenPostfix: ".pine",
    functions: FUNCTIONS,
    values: VALUES,
    keywords: KEYWORDS.filter(k => k !== "true" && k !== "false"),
    qualifiers: QUALIFIERS,
    types: TYPES,
    tokenizer: {
      root: [
        [/\/\/(?=\s*@\w)/, { token: "comment", next: "@annotation" }],
        [/\/\/.*$/, "comment"],
        [/"([^"\\]|\\.)*"/, "string"],
        [/'([^'\\]|\\.)*'/, "string"],
        [/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b/, "variable.predefined"],
        [/\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?/, "number"],
        [/\bimport\b/, { token: "keyword", next: "@importPath" }],
        [/\b(true|false)\b/, "variable.predefined"],
        // Generic type arguments: array.new<float>(), map.new<string, int>()
        [/<(?=\s*[A-Za-z_][\w.]*\s*(,\s*[A-Za-z_][\w.]*\s*)?>)/, { token: "delimiter.bracket", next: "@generic" }],
        // Type names in declarations and parameters: `var float x`, `method f(float v)`
        [/\b(const|simple|series)\b/, "type"],
        [/\b(int|float|bool|string|color|line|label|box|table|linefill|polyline|array|matrix|map)\b(?=\s+[A-Za-z_])/, "type"],
        // Built-in function calls (namespaced or not), then values and keywords
        [/[A-Za-z_]\w*(\.[A-Za-z_]\w*)*(?=\s*(\(|<[^>]*>\s*\())/, { cases: { "@functions": "predefined", "@default": "identifier" } }],
        [/[A-Za-z_]\w*(\.[A-Za-z_]\w*)*/, { cases: { "@keywords": "keyword", "@values": "variable.predefined", "@default": "identifier" } }],
        [/[()[\]{}]/, "delimiter.bracket"],
        [/:=|\+=|-=|\*=|\/=|%=|==|!=|<=|>=|=>|[=<>+\-*/%?:]/, "operator"],
        [/,/, "delimiter"],
        [/\s+/, "white"],
      ],
      annotation: [
        [/\s+/, "comment"],
        [/@\w+=?/, "comment.annotation"],
        [/.*$/, { token: "comment", next: "@pop" }],
      ],
      importPath: [
        [/\s+/, "white"],
        [/[\w-]+\/[\w-]+\/\d+/, "predefined"],
        [/\bas\b/, "keyword"],
        [/[A-Za-z_]\w*/, { token: "namespace", next: "@pop" }],
        [/$/, { token: "", next: "@pop" }],
      ],
      generic: [
        [/[A-Za-z_][\w.]*/, "type"],
        [/,/, "delimiter"],
        [/\s+/, "white"],
        [/>/, { token: "delimiter.bracket", next: "@pop" }],
      ],
    },
  } as Monaco.languages.IMonarchLanguage;
}

// --- Themes (TradingView's own editor colours) ---
const LIGHT_TOKENS: Monaco.editor.ITokenThemeRule[] = [
  { token: "", foreground: "0f0f0f" },
  { token: "comment", foreground: "9c9c9c" },
  { token: "comment.annotation", foreground: "9c9c9c", fontStyle: "bold" },
  { token: "string", foreground: "388e3c" },
  { token: "number", foreground: "f57f17" },
  { token: "keyword", foreground: "22ab94" },
  { token: "operator", foreground: "22ab94" },
  { token: "delimiter", foreground: "22ab94" },
  { token: "delimiter.bracket", foreground: "000000" },
  { token: "type", foreground: "22ab94", fontStyle: "bold" },
  { token: "predefined", foreground: "2962ff" },
  { token: "variable.predefined", foreground: "cc2929" },
  { token: "namespace", foreground: "8e24aa" },
  { token: "identifier", foreground: "2e2e2e" },
];
const DARK_TOKENS: Monaco.editor.ITokenThemeRule[] = [
  { token: "", foreground: "ffffff" },
  { token: "comment", foreground: "808080" },
  { token: "comment.annotation", foreground: "808080", fontStyle: "bold" },
  { token: "string", foreground: "388e3c" },
  { token: "number", foreground: "f57f17" },
  { token: "keyword", foreground: "42bda8" },
  { token: "operator", foreground: "42bda8" },
  { token: "delimiter", foreground: "42bda8" },
  { token: "delimiter.bracket", foreground: "ffffff" },
  { token: "type", foreground: "42bda8", fontStyle: "bold" },
  { token: "predefined", foreground: "5b9cf6" },
  { token: "variable.predefined", foreground: "f77c80" },
  { token: "namespace", foreground: "ba68c8" },
  { token: "identifier", foreground: "dbdbdb" },
];
const COMMON_COLORS = {
  "editorError.foreground": "#f23645",
  "editorOverviewRuler.errorForeground": "#ff1212b3",
  "minimap.errorHighlight": "#ff1212b3",
  "editorMarkerNavigationError.background": "#f23645",
  "editorMarkerNavigationError.headerBackground": "#f236451a",
  "editorMarkerNavigation.background": "#00000000",
  "editorGutter.background": "#00000000",
  "editorGutter.deletedBackground": "#f23645",
  "minimapGutter.deletedBackground": "#f23645",
  "editorBracketHighlight.unexpectedBracket.foreground": "#ff1212cc",
};
// Brackets keep their token colour (TradingView doesn't colour bracket pairs)
const bracketColors = (c: string) => Object.fromEntries([1, 2, 3, 4, 5, 6].map(i => [`editorBracketHighlight.foreground${i}`, c]));
const LIGHT_COLORS: Record<string, string> = {
  ...COMMON_COLORS,
  ...bracketColors("#000000"),
  "editor.background": "#ffffff",
  "editor.foreground": "#0f0f0f",
  "editor.lineHighlightBackground": "#e3effd",
  "editor.lineHighlightBorder": "#e3effd",
  "editorLineNumber.foreground": "#9c9c9c",
  "editorLineNumber.activeForeground": "#4a4a4a",
  "editor.selectionBackground": "#bbd9fb",
  "editor.inactiveSelectionBackground": "#e5ebf1",
  "editor.selectionHighlightBackground": "#e3effd",
  "editor.findMatchBackground": "#ffe0b2",
  "editor.findMatchHighlightBackground": "#ffe0b2",
  "editor.findMatchBorder": "#ff9800",
  "editor.wordHighlightBackground": "#57575740",
  "editor.wordHighlightStrongBackground": "#0e639c40",
  "editorCursor.foreground": "#000000",
  "editorIndentGuide.background1": "#d3d3d3",
  "editorIndentGuide.activeBackground1": "#939393",
  "editorRuler.foreground": "#a8a8a8",
  "editorBracketMatch.background": "#ebebeb",
  "editorBracketMatch.border": "#b9b9b9",
  "editorWarning.foreground": "#ff9800",
  "editorOverviewRuler.border": "#7f7f7f4d",
  "editorWidget.background": "#ffffff",
  "editorWidget.foreground": "#0f0f0f",
  "editorWidget.border": "#c8c8c8",
  "editorHoverWidget.background": "#ffffff",
  "editorHoverWidget.foreground": "#0f0f0f",
  "editorHoverWidget.border": "#c8c8c8",
  "editorHoverWidget.statusBarBackground": "#ebebeb",
  "editorHoverWidget.highlightForeground": "#0066bf",
  "editorSuggestWidget.background": "#ffffff",
  "editorSuggestWidget.border": "#c8c8c8",
  "editorSuggestWidget.foreground": "#0f0f0f",
  "editorSuggestWidget.selectedForeground": "#ffffff",
  "editorSuggestWidget.selectedBackground": "#2e2e2e",
  "editorSuggestWidget.highlightForeground": "#0066bf",
  "editorSuggestWidget.focusHighlightForeground": "#90bff9",
  "list.hoverBackground": "#f2f2f2",
  "list.hoverForeground": "#0f0f0f",
  "list.activeSelectionBackground": "#2e2e2e",
  "list.activeSelectionForeground": "#ffffff",
  "list.focusHighlightForeground": "#90bff9",
  "focusBorder": "#0090f1",
  "scrollbar.shadow": "#dddddd",
  "scrollbarSlider.background": "#64646466",
  "scrollbarSlider.hoverBackground": "#646464b3",
  "scrollbarSlider.activeBackground": "#00000099",
  "minimap.selectionHighlight": "#add6ff",
  "minimap.findMatchHighlight": "#d18616",
  "minimapSlider.background": "#64646433",
  "minimapSlider.hoverBackground": "#64646459",
  "minimapSlider.activeBackground": "#0000004d",
  "editorGutter.modifiedBackground": "#2090d3",
  "editorGutter.addedBackground": "#48985d",
  "minimapGutter.modifiedBackground": "#2090d3",
  "minimapGutter.addedBackground": "#48985d",
  "editorGutter.foldingControlForeground": "#424242",
  "peekView.border": "#1a85ff",
};
const DARK_COLORS: Record<string, string> = {
  ...COMMON_COLORS,
  ...bracketColors("#ffffff"),
  // The app's dark theme is TradingView's classic navy, so the editor sits on that
  "editor.background": "#131722",
  "editor.foreground": "#ffffff",
  "editor.lineHighlightBackground": "#132042",
  "editor.lineHighlightBorder": "#132042",
  "editorLineNumber.foreground": "#808080",
  "editorLineNumber.activeForeground": "#b8b8b8",
  "editor.selectionBackground": "#142e61",
  "editor.inactiveSelectionBackground": "#3a3d41",
  "editor.selectionHighlightBackground": "#2e2e2e",
  "editor.findMatchBackground": "#515c6a",
  "editor.findMatchHighlightBackground": "#ea5c0054",
  "editor.wordHighlightBackground": "#575757b8",
  "editor.wordHighlightStrongBackground": "#004972b8",
  "editorCursor.foreground": "#aeafad",
  "editorIndentGuide.background1": "#404040",
  "editorIndentGuide.activeBackground1": "#707070",
  "editorRuler.foreground": "#808080",
  "editorBracketMatch.background": "#3d3d3d",
  "editorBracketMatch.border": "#888888",
  "editorWarning.foreground": "#f57c00",
  "editorOverviewRuler.border": "#7f7f7f4d",
  "editorWidget.background": "#1f1f1f",
  "editorWidget.foreground": "#b8b8b8",
  "editorWidget.border": "#454545",
  "editorHoverWidget.background": "#1f1f1f",
  "editorHoverWidget.foreground": "#b8b8b8",
  "editorHoverWidget.border": "#454545",
  "editorHoverWidget.statusBarBackground": "#0f0f0f",
  "editorHoverWidget.highlightForeground": "#2aaaff",
  "editorSuggestWidget.background": "#1f1f1f",
  "editorSuggestWidget.border": "#454545",
  "editorSuggestWidget.foreground": "#ffffff",
  "editorSuggestWidget.selectedForeground": "#000000",
  "editorSuggestWidget.selectedBackground": "#ffffff",
  "editorSuggestWidget.highlightForeground": "#2aaaff",
  "editorSuggestWidget.focusHighlightForeground": "#1e53e5",
  "list.hoverBackground": "#2e2e2e",
  "list.hoverForeground": "#a8a8a8",
  "list.activeSelectionBackground": "#ffffff",
  "list.activeSelectionForeground": "#000000",
  "list.focusHighlightForeground": "#1e53e5",
  "focusBorder": "#007fd4",
  "scrollbar.shadow": "#2e2e2e",
  "scrollbarSlider.background": "#79797966",
  "scrollbarSlider.hoverBackground": "#646464b3",
  "scrollbarSlider.activeBackground": "#bfbfbf66",
  "minimap.selectionHighlight": "#264f78",
  "minimap.findMatchHighlight": "#d18616",
  "minimapSlider.background": "#79797933",
  "minimapSlider.hoverBackground": "#64646459",
  "minimapSlider.activeBackground": "#bfbfbf33",
  "editorGutter.modifiedBackground": "#1b81a8",
  "editorGutter.addedBackground": "#487e02",
  "minimapGutter.modifiedBackground": "#1b81a8",
  "minimapGutter.addedBackground": "#487e02",
  "editorGutter.foldingControlForeground": "#c5c5c5",
  "peekView.border": "#3794ff",
};

// --- Completion and hover ---
const KIND_MAP: Record<string, string> = {
  variable: "Variable", function: "Function", method: "Method", constant: "Constant", keyword: "Keyword",
  namespace: "Module", module: "Module", class: "Class", struct: "Struct", enum: "Enum", enumMember: "EnumMember",
  field: "Field", property: "Property", constructor: "Constructor", interface: "Interface", key: "Keyword",
};

// Reference-manual anchor for a built-in (fun_, var_, const_, kw_, type_)
export function referenceUrl(name: string): string {
  const e = BY_NAME.get(name);
  const kind = e ? (isFn(e) ? "fun" : /constant/.test(e[2]) || e[1] === "constant" ? "const" : /keyword/.test(e[2]) || e[1] === "keyword" ? "kw" : /type/.test(e[2]) ? "type" : "var") : KEYWORDS.includes(name) ? "kw" : "var";
  return `https://www.tradingview.com/pine-script-reference/v6/#${kind}_${name}`;
}

// The dotted name under/before a position ("ta.sma", "strategy.risk.allow_entry_in")
function dottedAt(model: Monaco.editor.ITextModel, pos: Monaco.Position) {
  const line = model.getLineContent(pos.lineNumber);
  let s = pos.column - 1, e = pos.column - 1;
  while (s > 0 && /[\w.]/.test(line[s - 1])) s--;
  while (e < line.length && /\w/.test(line[e])) e++;
  return { text: line.slice(s, e), start: s + 1, end: e + 1 };
}

// Identifiers the script declares itself, offered next to the built-ins
function userSymbols(model: Monaco.editor.ITextModel) {
  const out = new Map<string, "variable" | "function">();
  const text = model.getValue();
  for (const m of Array.from(text.matchAll(/^\s*(?:(?:var|varip|const)\s+)?(?:[A-Za-z_][\w.<>]*\s+)?([A-Za-z_]\w*)\s*(?::=|=(?!=|>))/gm))) out.set(m[1], "variable");
  for (const m of Array.from(text.matchAll(/^\s*(?:export\s+)?(?:method\s+)?([A-Za-z_]\w*)\s*\([^)]*\)\s*=>/gm))) out.set(m[1], "function");
  for (const m of Array.from(text.matchAll(/\[\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*\]\s*=/g))) for (const n of m[1].split(",")) out.set(n.trim(), "variable");
  return out;
}

let registered = false;
export function setupPine(monaco: typeof Monaco) {
  monaco.editor.defineTheme(PINE_THEME_LIGHT, { base: "vs", inherit: true, rules: LIGHT_TOKENS, colors: LIGHT_COLORS });
  monaco.editor.defineTheme(PINE_THEME_DARK, { base: "vs-dark", inherit: true, rules: DARK_TOKENS, colors: DARK_COLORS });
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: PINE_LANG, extensions: [".pine"], aliases: ["Pine Script", "pine"] });
  monaco.languages.setMonarchTokensProvider(PINE_LANG, language());
  monaco.languages.setLanguageConfiguration(PINE_LANG, {
    comments: { lineComment: "//" },
    brackets: [["(", ")"], ["[", "]"], ["{", "}"]],
    autoClosingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: "{", close: "}" }, { open: '"', close: '"', notIn: ["string"] }, { open: "'", close: "'", notIn: ["string"] }],
    surroundingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: '"', close: '"' }],
    indentationRules: { increaseIndentPattern: /(=>|^\s*(if|else|for|while|switch|type|enum)\b.*)$/, decreaseIndentPattern: /^\s*else\b/ },
    onEnterRules: [{ beforeText: /(=>\s*|^\s*(if|else|for|while|switch|type|enum)\b.*)$/, action: { indentAction: monaco.languages.IndentAction.Indent } }],
    wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g,
  });

  monaco.languages.registerCompletionItemProvider(PINE_LANG, {
    triggerCharacters: ["."],
    provideCompletionItems(model, position) {
      const { text, start } = dottedAt(model, position);
      const dot = text.lastIndexOf(".");
      const ns = dot >= 0 ? text.slice(0, dot) : "";
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: dot >= 0 ? start + dot + 1 : word.startColumn, endColumn: word.endColumn };
      const list = PINE_CATALOG[ns];
      const suggestions: Monaco.languages.CompletionItem[] = [];
      if (list) {
        list.forEach((e, i) => suggestions.push({
          label: e[0], kind: (monaco.languages.CompletionItemKind as any)[KIND_MAP[e[1]] ?? "Variable"] ?? monaco.languages.CompletionItemKind.Variable, detail: e[2],
          documentation: e[3]?.length ? { value: "```pine\n" + e[3].join("\n") + "\n```" } : undefined,
          insertText: e[0], range, sortText: String(i).padStart(5, "0"),
        }));
      }
      if (!ns) {
        let i = list ? list.length : 0;
        for (const [name, kind] of Array.from(userSymbols(model).entries())) {
          if (PINE_CATALOG[""]?.some(e => e[0] === name)) continue;
          suggestions.push({ label: name, kind: kind === "function" ? monaco.languages.CompletionItemKind.Function : monaco.languages.CompletionItemKind.Variable, detail: kind === "function" ? "(user function)" : "(variable)", insertText: name, range, sortText: String(i++).padStart(5, "0") });
        }
      }
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider(PINE_LANG, {
    provideHover(model, position) {
      const { text, start, end } = dottedAt(model, position);
      if (!text) return null;
      const e = BY_NAME.get(text);
      if (!e) return null;
      const kind = (e[2].match(/^\(([^)]+)\)/) || [])[1] || e[1];
      const type = e[2].replace(/^\([^)]+\)\s*/, "");
      const parts: Monaco.IMarkdownString[] = [{ value: `**${text}** (${kind})` }];
      const body: string[] = [];
      if (e[3]?.length) body.push("**Syntax**\n\n```pine\n" + e[3].join("\n") + "\n```");
      if (isFn(e)) { if (e[4]) body.push("**Returns**\n\n" + e[4]); else if (type) body.push("**Returns**\n\n" + type.replace(/^returns\s+/, "")); }
      else if (type) body.push("**Type**\n\n" + type);
      body.push("<span style=\"color:#fff;background-color:#6a6a6a;\">&nbsp;Ctrl&nbsp;</span> + <span style=\"color:#fff;background-color:#6a6a6a;\">&nbsp;Click&nbsp;</span> *on keyword for more help*");
      parts.push({ value: body.join("\n\n"), supportHtml: true, isTrusted: true });
      return { range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: start, endColumn: end }, contents: parts };
    },
  });
}

// Ctrl + Click on a built-in opens the reference manual at it
export function attachReferenceClicks(editor: Monaco.editor.IStandaloneCodeEditor) {
  return editor.onMouseDown(ev => {
    if (!(ev.event.ctrlKey || ev.event.metaKey) || !ev.target.position) return;
    const model = editor.getModel();
    if (!model) return;
    const { text } = dottedAt(model, ev.target.position);
    if (text && (BY_NAME.has(text) || KEYWORDS.includes(text))) {
      ev.event.preventDefault();
      window.open(referenceUrl(text), "_blank", "noopener");
    }
  });
}
