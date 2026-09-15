"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createPortal } from "react-dom";
import {
  ChevronDown, Play, CloudUpload, Minus, X, MoreHorizontal, TrendingUp, ChevronsRight,
  Copy, Pencil, History, ArrowDownToLine, FolderOpen, ChevronRight, Activity, Package,
  BarChart3, Settings, ExternalLink, ToggleLeft, ToggleRight, ScrollText, AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { runPineScript, PineRunResult, PineScriptError } from "../lib/pineScriptEngine";
import { EditorView, keymap, lineNumbers, Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, HighlightStyle, bracketMatching } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { linter, lintGutter, lintKeymap, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { tags } from "@lezer/highlight";

interface PineEditorPanelProps {
  theme?: string;
  onClose: () => void;
}

type ScriptType = "indicator" | "strategy" | "library";

interface SavedScript {
  id: string;
  name: string;
  code: string;
  type: ScriptType;
  updatedAt: number;
  order: number;
  versions: { code: string; savedAt: number }[];
}

const STORAGE_KEY = "tv-pine-scripts-v1";

function loadScripts(): SavedScript[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistScripts(list: SavedScript[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

const STRATEGY_TEMPLATE = `// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
// This source code is not for redistribution without permission.

//@version=6
strategy("My strategy", overlay=true, fill_orders_on_standard_ohlc=true)

longCondition = ta.crossover(ta.sma(close, 14), ta.sma(close, 28))
if (longCondition)
    strategy.entry("My Long Entry Id", strategy.long)

shortCondition = ta.crossunder(ta.sma(close, 14), ta.sma(close, 28))
if (shortCondition)
    strategy.entry("My Short Entry Id", strategy.short)
`;

const INDICATOR_TEMPLATE = `//@version=6
indicator("My indicator", overlay=true)

fastMa = ta.sma(close, 9)
slowMa = ta.sma(close, 21)

plot(fastMa, title="Fast MA", color=color.blue)
plot(slowMa, title="Slow MA", color=color.orange)
`;

const LIBRARY_TEMPLATE = `//@version=6
// A Pine library holds reusable functions for other scripts to import.
// This editor runs indicators/strategies directly; libraries are for
// authoring only and are not executed on their own.
library("MyLibrary", overlay=true)
`;

const BUILTINS: { name: string; code: string }[] = [
  { name: "Moving Average", code: INDICATOR_TEMPLATE },
  {
    name: "Relative Strength Index", code: `//@version=6
indicator("RSI", overlay=false)

rsiLen = 14
rsiValue = ta.rsi(close, rsiLen)

plot(rsiValue, title="RSI", color=color.purple)
` },
  {
    name: "MACD-style Crossover", code: `//@version=6
indicator("MACD-style Crossover", overlay=true)

fastMa = ta.ema(close, 12)
slowMa = ta.ema(close, 26)
macdLine = fastMa - slowMa

plot(macdLine, title="MACD Line", color=color.blue)
plot(0, title="Zero", color=color.gray)
` },
];

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// A menu row that opens a portal-rendered flyout to its left, escaping the
// panel's own clipping/overflow the same way other nested submenus in this
// app already do.
function FlyoutRow({ label, icon, disabled, children, border, bg, color }: { label: React.ReactNode; icon?: React.ReactNode; disabled?: boolean; children: React.ReactNode; border: string; bg: string; color: string }) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const closeTimer = useRef<any>(null);

  const openFlyout = () => {
    if (disabled) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = rowRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top, left: r.left - 220 });
    setOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div
      ref={rowRef}
      onMouseEnter={openFlyout}
      onMouseLeave={scheduleClose}
      style={{ position: "relative", opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", fontSize: "13px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>{icon}{label}</span>
        <ChevronRight size={14} />
      </div>
      {open && !disabled && createPortal(
        <div
          data-pine-flyout="true"
          onMouseEnter={openFlyout}
          onMouseLeave={scheduleClose}
          style={{ position: "fixed", top: pos.top, left: Math.max(4, pos.left), width: "220px", background: bg, border: `1px solid ${border}`, borderRadius: "6px", boxShadow: "0 4px 20px rgba(0,0,0,0.25)", zIndex: 2000, padding: "6px 0", color }}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
}

// The persistent "N of M problems" banner (matching the reference editor) is
// implemented as a real CodeMirror block widget decoration rather than an
// absolutely-positioned div guessing at pixel coordinates. Being a block
// widget means it occupies real space in the document's own layout — it
// pushes the following lines down like an inserted line would, CodeMirror
// keeps its position correct across edits/scrolling automatically, and it
// can never overlap or intercept clicks meant for the actual code, which is
// exactly the class of bug the previous hand-rolled overlay kept hitting.
const setPineErrorBanner = StateEffect.define<{ errors: PineScriptError[]; activeIndex: number; visible: boolean } | null>();

interface PineBannerCallbacks {
  onNavigate: (dir: 1 | -1) => void;
  onDismiss: () => void;
}

class PineErrorBannerWidget extends WidgetType {
  constructor(
    private errors: PineScriptError[],
    private activeIndex: number,
    private isDark: boolean,
    private callbacksRef: { current: PineBannerCallbacks }
  ) {
    super();
  }

  eq(other: PineErrorBannerWidget) {
    return other.errors === this.errors && other.activeIndex === this.activeIndex && other.isDark === this.isDark;
  }

  toDOM(view: EditorView) {
    const err = this.errors[Math.min(this.activeIndex, this.errors.length - 1)];
    const bg = this.isDark ? "#2b1a1d" : "#fdecea";
    const border = this.isDark ? "#5c2b2f" : "#f5c6c2";
    const textColor = this.isDark ? "#d1d4dc" : "#131722";
    const muted = "#787b86";

    // A block widget is laid out at the width of the document's own scrollable
    // content, not the visible viewport — for a long line elsewhere in the
    // script, that pushed this banner (and its buttons) off to the right,
    // reachable only via horizontal scroll. Sticking it to the left edge of
    // the actual scroller and sizing it to the scroller's visible width keeps
    // the whole banner (buttons included) on screen regardless of scroll
    // position or how wide the document itself is.
    const wrap = document.createElement("div");
    wrap.style.cssText = `background:${bg}; font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace; font-size:12px; cursor:default; position:sticky; left:0; box-sizing:border-box;`;
    // The widget sticks to .cm-content's own left edge, which sits to the right
    // of the line-number gutter — so the available width is the scroller's
    // visible right edge minus that gutter offset, not the scroller's full
    // clientWidth (which would overshoot by the gutter's width).
    const syncWidth = () => {
      const scrollerRight = view.scrollDOM.getBoundingClientRect().right;
      const contentLeft = view.contentDOM.getBoundingClientRect().left;
      wrap.style.width = `${Math.max(0, scrollerRight - contentLeft)}px`;
    };
    syncWidth();
    const resizeObserver = new ResizeObserver(syncWidth);
    resizeObserver.observe(view.scrollDOM);
    (wrap as any).__pineResizeObserver = resizeObserver;

    const header = document.createElement("div");
    header.style.cssText = `display:flex; align-items:center; justify-content:space-between; padding:5px 8px; border-top:1px solid ${border}; border-bottom:1px solid ${border};`;

    const left = document.createElement("span");
    left.style.cssText = "display:flex; align-items:center; gap:6px; color:#f23645;";
    left.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg><span>${this.activeIndex + 1} of ${this.errors.length} problem${this.errors.length > 1 ? "s" : ""}</span>`;

    const right = document.createElement("span");
    right.style.cssText = "display:flex; align-items:center; gap:2px;";

    const mkBtn = (svg: string, title: string, onClick: () => void) => {
      const btn = document.createElement("button");
      btn.style.cssText = `width:20px; height:20px; display:flex; align-items:center; justify-content:center; background:none; border:none; color:${muted}; cursor:pointer; padding:0;`;
      btn.innerHTML = svg;
      btn.title = title;
      // Prevent the mousedown from moving the editor's own caret/focus before our click fires.
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
      return btn;
    };

    right.appendChild(mkBtn(`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`, "Go to previous problem (error, warning, info) (Shift+Alt+F8)", () => this.callbacksRef.current.onNavigate(-1)));
    right.appendChild(mkBtn(`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`, "Go to next problem (error, warning, info) (Alt+F8)", () => this.callbacksRef.current.onNavigate(1)));
    right.appendChild(mkBtn(`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`, "Close", () => this.callbacksRef.current.onDismiss()));

    header.appendChild(left);
    header.appendChild(right);

    const body = document.createElement("div");
    body.style.cssText = `padding:6px 8px; color:${textColor}; border-bottom:1px solid ${border};`;
    body.textContent = err.message + " ";
    const codeSpan = document.createElement("span");
    codeSpan.style.color = muted;
    codeSpan.textContent = `(${err.code})`;
    body.appendChild(codeSpan);

    wrap.appendChild(header);
    wrap.appendChild(body);
    return wrap;
  }

  ignoreEvent() {
    return true;
  }

  destroy(dom: HTMLElement) {
    (dom as any).__pineResizeObserver?.disconnect();
  }
}

function buildPineErrorField(isDark: boolean, callbacksRef: { current: PineBannerCallbacks }) {
  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(deco, tr) {
      deco = deco.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(setPineErrorBanner)) {
          const val = effect.value;
          if (!val || !val.visible || val.errors.length === 0) return Decoration.none;
          const activeIndex = Math.min(val.activeIndex, val.errors.length - 1);
          const lineNum = Math.min(Math.max(val.errors[activeIndex].line, 1), tr.state.doc.lines);
          const pos = tr.state.doc.line(lineNum).to;
          const widget = Decoration.widget({
            widget: new PineErrorBannerWidget(val.errors, activeIndex, isDark, callbacksRef),
            side: 1,
            block: true,
          });
          return Decoration.set([widget.range(pos)]);
        }
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

// A real code-editing engine (CodeMirror) instead of a hand-rolled textarea
// overlaid with a separate syntax-highlighted div: cursor placement, drag
// selection, and rendering are all the browser-tested behavior CodeMirror
// already gets right, rather than approximations this app has to maintain.
interface PineCodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  onCursorChange: (pos: { line: number; col: number }) => void;
  isDark: boolean;
  fontSize: number;
  errors: PineScriptError[];
  activeErrorIndex: number;
  bannerVisible: boolean;
  onNavigateError: (dir: 1 | -1) => void;
  onDismissError: () => void;
}

function PineCodeEditor({ code, onChange, onCursorChange, isDark, fontSize, errors, activeErrorIndex, bannerVisible, onNavigateError, onDismissError }: PineCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastPushedRef = useRef(code);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const callbacksRef = useRef<PineBannerCallbacks>({ onNavigate: onNavigateError, onDismiss: onDismissError });
  onChangeRef.current = onChange;
  onCursorChangeRef.current = onCursorChange;
  callbacksRef.current = { onNavigate: onNavigateError, onDismiss: onDismissError };

  useEffect(() => {
    if (!containerRef.current) return;

    const textColor = isDark ? "#d1d4dc" : "#131722";
    const highlightStyle = HighlightStyle.define([
      { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: "#2962ff" },
      { tag: [tags.string, tags.special(tags.string)], color: isDark ? "#4caf50" : "#22863a" },
      { tag: tags.number, color: "#e07800" },
      { tag: tags.comment, color: "#787b86", fontStyle: "italic" },
      { tag: [tags.function(tags.variableName), tags.propertyName], color: textColor },
      { tag: tags.variableName, color: textColor },
      { tag: tags.operator, color: textColor },
    ]);

    const theme = EditorView.theme({
      "&": { height: "100%", fontSize: `${fontSize}px`, backgroundColor: "transparent", color: textColor },
      ".cm-content": {
        fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
        caretColor: textColor,
        padding: "8px 0",
      },
      ".cm-gutters": { backgroundColor: isDark ? "#1a1e27" : "#fafafa", color: "#787b86", border: "none" },
      ".cm-activeLine": { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" },
      ".cm-activeLineGutter": { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { overflow: "auto", fontFamily: "inherit" },
      ".cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(51, 153, 255, 0.35) !important" },
      "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(51, 153, 255, 0.35) !important" },
      ".cm-lintRange-error": { backgroundImage: "none", textDecorationLine: "underline", textDecorationStyle: "wavy", textDecorationColor: "#f23645", textUnderlineOffset: "3px" },
      ".cm-gutter-lint": { width: "1.2em" },
    }, { dark: isDark });

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newCode = update.state.doc.toString();
        lastPushedRef.current = newCode;
        onChangeRef.current(newCode);
      }
      if (update.docChanged || update.selectionSet) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        onCursorChangeRef.current({ line: line.number, col: pos - line.from + 1 });
      }
    });

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        history(),
        closeBrackets(),
        bracketMatching(),
        javascript(),
        syntaxHighlighting(highlightStyle),
        linter(null),
        lintGutter(),
        buildPineErrorField(isDark, callbacksRef),
        keymap.of([
          { key: "Alt-F8", run: () => { callbacksRef.current.onNavigate(1); return true; } },
          { key: "Shift-Alt-F8", run: () => { callbacksRef.current.onNavigate(-1); return true; } },
          ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...lintKeymap, indentWithTab,
        ]),
        theme,
        updateListener,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    lastPushedRef.current = code;

    return () => { view.destroy(); viewRef.current = null; };
    // Rebuilt only when theme/fontSize change (cheap) rather than reconfigured
    // in place, keeping the extension setup above straightforward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, fontSize]);

  // Pushes external content changes (opening a different script, restoring a
  // version, switching templates) into the editor. Edits typed by the user
  // flow the other direction via the updateListener above, and are excluded
  // here by comparing against the last value this effect itself pushed.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || code === lastPushedRef.current) return;
    lastPushedRef.current = code;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
  }, [code]);

  // Pushes the Pine engine's errors into CodeMirror's own diagnostics system —
  // this is what actually draws the squiggly underline and gutter marker — and
  // separately into the custom banner field for the persistent "N of M
  // problems" panel. Both are real editor decorations, not overlay elements,
  // so neither can end up sitting on top of the text and blocking clicks.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const docLines = view.state.doc.lines;
    const diagnostics: Diagnostic[] = errors.map((e) => {
      const lineNum = Math.min(Math.max(e.line, 1), docLines);
      const line = view.state.doc.line(lineNum);
      return { from: line.from, to: line.to, severity: "error", message: `${e.message} (${e.code})` };
    });
    view.dispatch(setDiagnostics(view.state, diagnostics));
    view.dispatch({ effects: setPineErrorBanner.of({ errors, activeIndex: activeErrorIndex, visible: bannerVisible }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors, activeErrorIndex, bannerVisible, isDark, fontSize]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%", overflow: "hidden" }} />;
}

export default function PineEditorPanel({ theme, onClose }: PineEditorPanelProps) {
  const isDark = theme === "dark";
  const { user } = useAuth();
  const uid = user?.uid;
  const [minimized, setMinimized] = useState(false);
  const [code, setCode] = useState(STRATEGY_TEMPLATE);
  const [scriptType, setScriptType] = useState<ScriptType>("strategy");
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);
  const [scriptName, setScriptName] = useState("Untitled script");
  const [renaming, setRenaming] = useState(false);

  const [scriptMenuOpen, setScriptMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [openScriptOpen, setOpenScriptOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [editorSettingsOpen, setEditorSettingsOpen] = useState(false);
  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [fontSize, setFontSize] = useState(13);

  const [profilerMode, setProfilerMode] = useState(false);
  const [pineLogsOn, setPineLogsOn] = useState(false);
  const [runResult, setRunResult] = useState<PineRunResult | null>(null);
  const [activeErrorIndex, setActiveErrorIndex] = useState(0);
  const [errorBannerDismissed, setErrorBannerDismissed] = useState(false);

  const scriptMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Signed-in users get real server-backed persistence (a PineScript row per
  // saved script, owned by their TraderProfile) so scripts follow them across
  // devices/browsers; signed-out users keep the old localStorage-only behavior.
  async function syncScriptToServer(partial: {
    id?: string; name?: string; script_type?: string; code?: string; versions?: { code: string; savedAt: number }[]; order?: number;
  }) {
    if (!uid) return null;
    try {
      const res = await fetch(`http://localhost:8000/api/users/pinescripts/${uid}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error("Failed to save Pine script to server:", e);
      return null;
    }
  }

  useEffect(() => {
    if (!uid) { setScripts(loadScripts()); return; }
    fetch(`http://localhost:8000/api/users/pinescripts/${uid}/`)
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        setScripts(data.map((s: any): SavedScript => ({
          id: String(s.id),
          name: s.name,
          code: s.code,
          type: s.script_type as ScriptType,
          updatedAt: new Date(s.updated_at).getTime(),
          order: s.order,
          versions: s.versions || [],
        })));
      })
      .catch((e) => console.error("Failed to load Pine scripts:", e));
  }, [uid]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest && target.closest('[data-pine-flyout]')) return;
      if (scriptMenuRef.current && !scriptMenuRef.current.contains(target)) setScriptMenuOpen(false);
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) setMoreMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); saveScript(); }
      if (e.key.toLowerCase() === "o") { e.preventDefault(); setOpenScriptOpen(true); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, scripts, currentScriptId, scriptName]);

  const bg = isDark ? "#1e222d" : "#ffffff";
  const headerBg = isDark ? "#131722" : "#f8f9fd";
  const border = isDark ? "#2a2e39" : "#e0e3eb";
  const text = isDark ? "#d1d4dc" : "#131722";
  const muted = "#787b86";
  const keyColor = "#2962ff";
  const menuBg = isDark ? "#1e222d" : "#ffffff";

  const hasErrors = !!runResult && runResult.errors.length > 0;

  function persistAsNew(name: string, codeToSave: string, type: ScriptType) {
    const id = "ps_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const maxOrder = scripts.reduce((m, s) => Math.max(m, s.order), 0);
    const versions = [{ code: codeToSave, savedAt: Date.now() }];
    const order = maxOrder + 1;
    const entry: SavedScript = { id, name, code: codeToSave, type, updatedAt: Date.now(), order, versions };
    const next = [...scripts, entry];
    setScripts(next);
    if (uid) {
      syncScriptToServer({ name, script_type: type, code: codeToSave, versions, order }).then((res) => {
        if (res?.id) {
          const serverId = String(res.id);
          setScripts((prev) => prev.map((s) => (s.id === id ? { ...s, id: serverId } : s)));
          setCurrentScriptId((cur) => (cur === id ? serverId : cur));
        }
      });
    } else {
      persistScripts(next);
    }
    setCurrentScriptId(id); setScriptName(name);
    return entry;
  }

  function saveScript() {
    if (!currentScriptId) {
      setSaveAsName(scriptName === "Untitled script" ? "" : scriptName);
      setSaveAsModalOpen(true);
      return;
    }
    const existing = scripts.find((s) => s.id === currentScriptId);
    const versions = [...(existing?.versions || []), { code, savedAt: Date.now() }].slice(-20);
    const next = scripts.map((s) => s.id === currentScriptId
      ? { ...s, code, name: scriptName, updatedAt: Date.now(), versions }
      : s);
    setScripts(next);
    if (uid) {
      syncScriptToServer({ id: currentScriptId, name: scriptName, code, versions });
    } else {
      persistScripts(next);
    }
  }

  function confirmSaveAs() {
    const name = saveAsName.trim();
    if (!name) return;
    persistAsNew(name, code, scriptType);
    setSaveAsModalOpen(false);
  }

  function makeACopy() {
    if (!currentScriptId) return;
    persistAsNew(`Copy of ${scriptName}`, code, scriptType);
  }

  function commitRename(newName: string) {
    const name = newName.trim() || scriptName;
    setScriptName(name);
    if (currentScriptId) {
      const next = scripts.map((s) => s.id === currentScriptId ? { ...s, name, updatedAt: s.updatedAt } : s);
      setScripts(next);
      if (uid) {
        syncScriptToServer({ id: currentScriptId, name });
      } else {
        persistScripts(next);
      }
    }
    setRenaming(false);
  }

  function moveToBottom() {
    if (!currentScriptId) return;
    const maxOrder = scripts.reduce((m, s) => Math.max(m, s.order), 0);
    const newOrder = maxOrder + 1;
    const next = scripts.map((s) => s.id === currentScriptId ? { ...s, order: newOrder } : s);
    setScripts(next);
    if (uid) {
      syncScriptToServer({ id: currentScriptId, order: newOrder });
    } else {
      persistScripts(next);
    }
    setScriptMenuOpen(false);
  }

  function openScript(s: SavedScript) {
    setCurrentScriptId(s.id);
    setScriptName(s.name);
    setCode(s.code);
    setScriptType(s.type);
    const next = scripts.map((x) => x.id === s.id ? { ...x, updatedAt: Date.now() } : x);
    setScripts(next);
    if (!uid) persistScripts(next); // server tracks recency via its own updated_at on real saves
    setScriptMenuOpen(false); setOpenScriptOpen(false);
  }

  function createNew(type: ScriptType) {
    setCurrentScriptId(null);
    setScriptName("Untitled script");
    setScriptType(type);
    setCode(type === "strategy" ? STRATEGY_TEMPLATE : type === "library" ? LIBRARY_TEMPLATE : INDICATOR_TEMPLATE);
    setScriptMenuOpen(false);
  }

  function loadBuiltin(b: { name: string; code: string }) {
    setCurrentScriptId(null);
    setScriptName(b.name);
    setScriptType("indicator");
    setCode(b.code);
    setScriptMenuOpen(false);
  }

  function restoreVersion(v: { code: string; savedAt: number }) {
    setCode(v.code);
    setVersionsOpen(false);
    setScriptMenuOpen(false);
  }

  function runScript() {
    const bars = (window as any).__chartFullData || [];
    const result = runPineScript(code, bars);
    setRunResult(result);
    setActiveErrorIndex(0);
    setErrorBannerDismissed(false);
    if (result.errors.length === 0) {
      window.dispatchEvent(new CustomEvent("tv:run-pine-script", { detail: { result } }));
    } else {
      window.dispatchEvent(new CustomEvent("tv:clear-pine-script"));
    }
    setPineLogsOn(true);
  }

  function navigateError(dir: 1 | -1) {
    const count = hasErrors ? runResult!.errors.length : 0;
    if (count === 0) return;
    setActiveErrorIndex((i) => (i + dir + count) % count);
  }

  const currentScript = scripts.find((s) => s.id === currentScriptId) || null;
  const recentlyUsed = [...scripts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const openScriptList = [...scripts].sort((a, b) => a.order - b.order);
  const hasSaved = !!currentScriptId;

  const menuItemStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", fontSize: "13px", cursor: "pointer", gap: "10px" };
  const menuLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
  const sectionHeaderStyle: React.CSSProperties = { padding: "6px 12px 4px", fontSize: "11px", color: muted, fontWeight: 600, letterSpacing: "0.03em" };
  const dividerStyle: React.CSSProperties = { height: "1px", background: border, margin: "4px 0" };

  return (
    <div
      style={{
        position: "fixed",
        top: "var(--tv-header-height)",
        bottom: "var(--tv-bottom-toolbar-height)",
        right: 0,
        width: minimized ? "260px" : "660px",
        maxWidth: "90vw",
        backgroundColor: bg,
        borderLeft: `1px solid ${border}`,
        boxShadow: "-4px 0 16px rgba(0,0,0,0.15)",
        display: "flex",
        flexDirection: "column",
        zIndex: 900,
        color: text,
      }}
    >
      {/* Title bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${border}`, backgroundColor: headerBg, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}>
          <ChevronsRight size={16} color={muted} />
          Pine Editor
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            title={minimized ? "Restore" : "Minimize"}
            onClick={() => setMinimized((v) => !v)}
            style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: muted, cursor: "pointer", borderRadius: "4px" }}
          >
            <Minus size={14} />
          </button>
          <button
            title="Close"
            onClick={onClose}
            style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: muted, cursor: "pointer", borderRadius: "4px" }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Toolbar row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${border}`, flexShrink: 0, gap: "10px",
          }}>
            <div ref={scriptMenuRef} style={{ position: "relative" }}>
              {renaming ? (
                <input
                  autoFocus
                  defaultValue={scriptName}
                  onBlur={(e) => commitRename(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename((e.target as HTMLInputElement).value); if (e.key === "Escape") setRenaming(false); }}
                  style={{ fontSize: "14px", fontWeight: 600, background: "transparent", border: `1px solid ${keyColor}`, borderRadius: "4px", color: text, padding: "2px 6px", outline: "none" }}
                />
              ) : (
                <div
                  onClick={() => setScriptMenuOpen((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
                >
                  <TrendingUp size={16} color={keyColor} />
                  {scriptName}
                  <ChevronDown size={14} color={muted} />
                </div>
              )}

              {scriptMenuOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "260px", background: menuBg, border: `1px solid ${border}`, borderRadius: "6px", boxShadow: "0 4px 20px rgba(0,0,0,0.25)", zIndex: 1500, padding: "6px 0" }}>
                  <div style={menuItemStyle} onClick={() => { saveScript(); setScriptMenuOpen(false); }}>
                    <span style={menuLabelStyle}><CloudUpload size={14} />Save script</span>
                    <span style={{ color: muted, fontSize: "11px" }}>Ctrl+S</span>
                  </div>
                  <div style={{ ...menuItemStyle, opacity: hasSaved ? 1 : 0.4, cursor: hasSaved ? "pointer" : "default" }} onClick={() => hasSaved && (makeACopy(), setScriptMenuOpen(false))}>
                    <span style={menuLabelStyle}><Copy size={14} />Make a copy...</span>
                  </div>
                  <div style={menuItemStyle} onClick={() => { setRenaming(true); setScriptMenuOpen(false); }}>
                    <span style={menuLabelStyle}><Pencil size={14} />Rename...</span>
                  </div>
                  <div style={{ ...menuItemStyle, opacity: hasSaved ? 1 : 0.4, cursor: hasSaved ? "pointer" : "default" }} onClick={() => hasSaved && setVersionsOpen((v) => !v)}>
                    <span style={menuLabelStyle}><History size={14} />Version history...</span>
                  </div>
                  <div style={{ ...menuItemStyle, opacity: hasSaved ? 1 : 0.4, cursor: hasSaved ? "pointer" : "default" }} onClick={moveToBottom}>
                    <span style={menuLabelStyle}><ArrowDownToLine size={14} />Move script to bottom</span>
                  </div>

                  {versionsOpen && hasSaved && (
                    <div style={{ maxHeight: "160px", overflowY: "auto", borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, margin: "4px 0" }}>
                      {(currentScript?.versions || []).slice().reverse().map((v, i) => (
                        <div key={i} style={{ ...menuItemStyle, paddingLeft: "28px" }} onClick={() => restoreVersion(v)}>
                          <span>{timeAgo(v.savedAt)}</span>
                          <span style={{ color: muted, fontSize: "11px" }}>Restore</span>
                        </div>
                      ))}
                      {(currentScript?.versions || []).length === 0 && (
                        <div style={{ padding: "8px 28px", fontSize: "12px", color: muted }}>No versions yet</div>
                      )}
                    </div>
                  )}

                  <div style={dividerStyle} />
                  <FlyoutRow label="Create new" icon={<Activity size={14} />} border={border} bg={menuBg} color={text}>
                    <div style={menuItemStyle} onClick={() => createNew("indicator")}>
                      <span style={menuLabelStyle}><Activity size={14} />Indicator</span>
                      <span style={{ color: muted, fontSize: "11px" }}>Ctrl+K, Ctrl+I</span>
                    </div>
                    <div style={menuItemStyle} onClick={() => createNew("strategy")}>
                      <span style={menuLabelStyle}><TrendingUp size={14} />Strategy</span>
                      <span style={{ color: muted, fontSize: "11px" }}>Ctrl+K, Ctrl+S</span>
                    </div>
                    <div style={menuItemStyle} onClick={() => createNew("library")}>
                      <span style={menuLabelStyle}><Package size={14} />Library</span>
                    </div>
                    <div style={dividerStyle} />
                    {BUILTINS.map((b) => (
                      <div key={b.name} style={menuItemStyle} onClick={() => loadBuiltin(b)}>
                        <span style={menuLabelStyle}><BarChart3 size={14} />{b.name}</span>
                      </div>
                    ))}
                  </FlyoutRow>

                  {recentlyUsed.length > 0 && (
                    <>
                      <div style={dividerStyle} />
                      <div style={sectionHeaderStyle}>RECENTLY USED</div>
                      {recentlyUsed.map((s) => (
                        <div key={s.id} style={{ ...menuItemStyle, fontWeight: s.id === currentScriptId ? 600 : 400 }} onClick={() => openScript(s)}>
                          <span style={{ ...menuLabelStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.type === "strategy" ? <TrendingUp size={14} /> : <Activity size={14} />}
                            {s.name}
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  <div style={dividerStyle} />
                  <div style={menuItemStyle} onClick={() => { setOpenScriptOpen(true); setScriptMenuOpen(false); }}>
                    <span style={menuLabelStyle}><FolderOpen size={14} />Open script...</span>
                    <span style={{ color: muted, fontSize: "11px" }}>Ctrl+O</span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button title={hasErrors ? "Recompile" : "Add to chart"} onClick={runScript} style={{ width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: hasErrors ? muted : text, cursor: "pointer", borderRadius: "4px" }}>
                {hasErrors ? <RefreshCw size={14} /> : <Play size={14} fill={text} />}
              </button>
              <button title="Save script" onClick={saveScript} style={{ width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: hasErrors ? muted : text, cursor: "pointer", borderRadius: "4px" }}>
                <CloudUpload size={16} />
              </button>
              <button style={{
                display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px",
                border: `1px solid ${border}`, borderRadius: "4px", background: "transparent",
                color: hasErrors ? muted : text, fontSize: "13px", cursor: hasErrors ? "default" : "pointer",
              }}>
                {hasErrors ? <AlertTriangle size={14} /> : <TrendingUp size={14} />}
                Publish script
              </button>
              <div ref={moreMenuRef} style={{ position: "relative" }}>
                <button title="More" onClick={() => setMoreMenuOpen((v) => !v)} style={{ position: "relative", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: muted, cursor: "pointer", borderRadius: "4px" }}>
                  <MoreHorizontal size={16} />
                  {hasErrors && <span style={{ position: "absolute", top: "2px", right: "2px", width: "6px", height: "6px", borderRadius: "50%", background: "#f23645" }} />}
                </button>
                {moreMenuOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: "220px", background: menuBg, border: `1px solid ${border}`, borderRadius: "6px", boxShadow: "0 4px 20px rgba(0,0,0,0.25)", zIndex: 1500, padding: "6px 0" }}>
                    <div style={menuItemStyle} onClick={() => setEditorSettingsOpen((v) => !v)}>
                      <span style={menuLabelStyle}><Settings size={14} />Editor settings...</span>
                    </div>
                    {editorSettingsOpen && (
                      <div style={{ padding: "6px 12px 10px", borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, margin: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
                          <span>Font size</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <button onClick={() => setFontSize((f) => Math.max(10, f - 1))} style={{ width: "20px", height: "20px", border: `1px solid ${border}`, background: "transparent", color: text, borderRadius: "4px", cursor: "pointer" }}>-</button>
                            {fontSize}
                            <button onClick={() => setFontSize((f) => Math.min(20, f + 1))} style={{ width: "20px", height: "20px", border: `1px solid ${border}`, background: "transparent", color: text, borderRadius: "4px", cursor: "pointer" }}>+</button>
                          </span>
                        </div>
                      </div>
                    )}

                    <div style={sectionHeaderStyle}>OPEN EDITOR</div>
                    <div style={menuItemStyle} onClick={() => window.open(window.location.href, "_blank", "width=1000,height=720")}>
                      <span style={menuLabelStyle}><ExternalLink size={14} />New window</span>
                    </div>
                    <div style={menuItemStyle} onClick={() => window.open(window.location.href, "_blank")}>
                      <span style={menuLabelStyle}><ExternalLink size={14} />New tab</span>
                    </div>

                    <div style={dividerStyle} />
                    <div style={sectionHeaderStyle}>DEVELOPER TOOLS</div>
                    <div style={menuItemStyle} onClick={() => setProfilerMode((v) => !v)}>
                      <span style={menuLabelStyle}>Profiler mode</span>
                      {profilerMode ? <ToggleRight size={20} color={keyColor} /> : <ToggleLeft size={20} color={muted} />}
                    </div>
                    <div style={menuItemStyle} onClick={() => setPineLogsOn((v) => !v)}>
                      <span style={menuLabelStyle}><ScrollText size={14} />Pine logs</span>
                      {pineLogsOn ? <ToggleRight size={20} color={keyColor} /> : <ToggleLeft size={20} color={muted} />}
                    </div>

                    <div style={dividerStyle} />
                    <div style={menuItemStyle}>
                      <span>Release notes</span>
                    </div>
                    <FlyoutRow label="Help" border={border} bg={menuBg} color={text}>
                      <div style={sectionHeaderStyle}>EDITOR REFERENCES</div>
                      <div style={menuItemStyle}><span>How to use</span></div>
                      <div style={menuItemStyle}><span>Keyboard shortcuts</span></div>
                      <div style={dividerStyle} />
                      <div style={sectionHeaderStyle}>PINE REFERENCES</div>
                      <div style={menuItemStyle} onClick={() => window.open("https://www.tradingview.com/pine-script-docs/", "_blank")}>
                        <span>User Manual</span><ExternalLink size={12} />
                      </div>
                      <div style={menuItemStyle} onClick={() => window.open("https://www.tradingview.com/pine-script-reference/v6/", "_blank")}>
                        <span>Reference manual...</span><ExternalLink size={12} />
                      </div>
                      <div style={dividerStyle} />
                      <div style={sectionHeaderStyle}>ASK QUESTION</div>
                      <div style={menuItemStyle}><span>Pine freelancers</span></div>
                      <div style={menuItemStyle} onClick={() => window.open("https://stackoverflow.com/questions/tagged/pine-script", "_blank")}>
                        <span>Stack Overflow</span><ExternalLink size={12} />
                      </div>
                      <div style={dividerStyle} />
                      <div style={sectionHeaderStyle}>REQUEST A FEATURE</div>
                      <div style={menuItemStyle} onClick={() => window.open("https://www.reddit.com/r/PineScript/", "_blank")}>
                        <span>Reddit</span><ExternalLink size={12} />
                      </div>
                    </FlyoutRow>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Code area — a real CodeMirror instance, not a hand-rolled textarea overlay */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <PineCodeEditor
              code={code}
              onChange={setCode}
              onCursorChange={setCursor}
              isDark={isDark}
              fontSize={fontSize}
              errors={hasErrors ? runResult!.errors : []}
              activeErrorIndex={activeErrorIndex}
              bannerVisible={!errorBannerDismissed}
              onNavigateError={navigateError}
              onDismissError={() => setErrorBannerDismissed(true)}
            />

          </div>

          {/* Pine logs panel */}
          {pineLogsOn && runResult && (
            <div style={{ maxHeight: "140px", overflowY: "auto", borderTop: `1px solid ${border}`, padding: "8px 12px", fontSize: "12px", fontFamily: "'SFMono-Regular', Consolas, monospace", flexShrink: 0 }}>
              {profilerMode && (
                <div style={{ color: muted, marginBottom: "4px" }}>Execution time: {runResult.execMs.toFixed(2)}ms</div>
              )}
              {runResult.errors.map((e, i) => <div key={"e" + i} style={{ color: "#f23645" }}>Line {e.line}: {e.message} ({e.code})</div>)}
              {runResult.warnings.map((w, i) => <div key={"w" + i} style={{ color: "#ff9800" }}>{w}</div>)}
              {runResult.logs.map((l, i) => <div key={"l" + i} style={{ color: text }}>{l}</div>)}
              {runResult.errors.length === 0 && runResult.warnings.length === 0 && runResult.logs.length === 0 && (
                <div style={{ color: muted }}>Script ran with no errors — {runResult.plots.length} plot(s), {runResult.markers.length} marker(s).</div>
              )}
            </div>
          )}

          {/* Status bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 12px", borderTop: `1px solid ${border}`, fontSize: "11px", color: muted, flexShrink: 0,
          }}>
            <span>{">_"}</span>
            <span>Line {cursor.line}, Col {cursor.col} &nbsp;&nbsp; Pine Script® v6</span>
          </div>
        </>
      )}

      {openScriptOpen && (
        <div
          onClick={() => setOpenScriptOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "360px", maxHeight: "70vh", overflowY: "auto", background: menuBg, border: `1px solid ${border}`, borderRadius: "8px", boxShadow: "0 8px 32px rgba(0,0,0,0.35)" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${border}`, fontSize: "14px", fontWeight: 600 }}>Open script</div>
            {openScriptList.length === 0 && (
              <div style={{ padding: "16px 14px", fontSize: "12px", color: muted }}>No saved scripts yet. Save a script first with Ctrl+S.</div>
            )}
            {openScriptList.map((s) => (
              <div key={s.id} style={menuItemStyle} onClick={() => openScript(s)}>
                <span style={menuLabelStyle}>
                  {s.type === "strategy" ? <TrendingUp size={14} /> : <Activity size={14} />}
                  {s.name}
                </span>
                <span style={{ color: muted, fontSize: "11px" }}>{timeAgo(s.updatedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {saveAsModalOpen && (
        <div
          onClick={() => setSaveAsModalOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "400px", background: menuBg, borderRadius: "8px", boxShadow: "0 8px 32px rgba(0,0,0,0.35)", padding: "20px 24px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: text }}>Save script</div>
              <button onClick={() => setSaveAsModalOpen(false)} style={{ width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: muted, cursor: "pointer", borderRadius: "4px" }}>
                <X size={18} />
              </button>
            </div>
            <label style={{ display: "block", fontSize: "12px", color: muted, marginBottom: "6px" }}>New script name</label>
            <input
              autoFocus
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmSaveAs(); if (e.key === "Escape") setSaveAsModalOpen(false); }}
              style={{
                width: "100%", boxSizing: "border-box", fontSize: "14px", padding: "8px 10px",
                borderRadius: "4px", border: `1px solid ${keyColor}`, outline: "none",
                background: isDark ? "#131722" : "#ffffff", color: text,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "24px" }}>
              <button
                onClick={() => setSaveAsModalOpen(false)}
                style={{ padding: "7px 16px", fontSize: "13px", borderRadius: "4px", border: `1px solid ${border}`, background: "transparent", color: text, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveAs}
                disabled={!saveAsName.trim()}
                style={{
                  padding: "7px 16px", fontSize: "13px", borderRadius: "4px", border: "none",
                  background: saveAsName.trim() ? keyColor : (isDark ? "#2a2e39" : "#e0e3eb"),
                  color: saveAsName.trim() ? "#ffffff" : muted,
                  cursor: saveAsName.trim() ? "pointer" : "default",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
