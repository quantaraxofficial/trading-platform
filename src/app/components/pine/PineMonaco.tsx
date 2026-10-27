"use client";

// The Pine Editor's code editor: Monaco (the editor TradingView's Pine Editor is built on), set up
// as TradingView's — its font, line height, minimap, scrollbars, current-line highlight and
// colours — with Pine highlighting, autocomplete, hover cards, compile errors as markers (and
// the "N of M problems" peek after a failed compile), and change bars against the last save.

import { useEffect, useRef, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { setupPine, attachReferenceClicks, PINE_LANG, PINE_THEME_DARK, PINE_THEME_LIGHT, PINE_FONT } from "./pineLanguage";
import type { PineEditorSettings } from "./pineStore";
import type { PineScriptError } from "../../lib/pineScriptEngine";
import { collab, useCollabActive } from "../../lib/collab/session";
import { pineDoc } from "../../lib/collab/pineDoc";
import type { ScriptLanguage } from "../../lib/scripting";
import { monacoLanguageFor, setupScriptLanguages } from "./scriptLanguages";

export interface PineEditorApi {
  focus: () => void;
  commandPalette: () => void;
  goToLine: () => void;
  showProblems: () => void;
}

export interface PineMonacoProps {
  value: string;
  // Pine Script (this app's Pine mode), Python or MQL5 (Monaco's Python / C++ modes)
  language?: ScriptLanguage;
  onChange: (v: string) => void;
  onCursor: (line: number, col: number) => void;
  isDark: boolean;
  settings: PineEditorSettings;
  errors: PineScriptError[];
  // Bumped after a failed compile: jump to the first error and open the problems peek
  problemsTick: number;
  // The last saved code, for the added / changed / deleted line bars
  diffBase: string | null;
  onReady?: (api: PineEditorApi) => void;
  keys: {
    run: () => void; save: () => void; open: () => void;
    newIndicator: () => void; newStrategy: () => void;
  };
}

// Line diff (longest common subsequence) → which current lines were added or changed, and
// after which lines others were deleted
function lineDiff(base: string, cur: string) {
  const a = base.split("\n"), b = cur.split("\n");
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return { added: [] as number[], modified: [] as number[], deletedAfter: [] as number[] };
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const added: number[] = [], modified: number[] = [], deletedAfter: number[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; continue; }
    // A run of differences: pair removed and inserted lines as changes
    let del = 0, ins: number[] = [];
    while (i < n && j < m && a[i] !== b[j]) {
      if (dp[i + 1][j] >= dp[i][j + 1]) { i++; del++; } else { ins.push(j + 1); j++; }
    }
    while (i < n && j >= m) { i++; del++; }
    while (j < m && i >= n) { ins.push(j + 1); j++; }
    const pairs = Math.min(del, ins.length);
    modified.push(...ins.slice(0, pairs));
    added.push(...ins.slice(pairs));
    if (del > pairs) deletedAfter.push(Math.max(1, j));
  }
  return { added, modified, deletedAfter };
}

export default function PineMonaco({ value, language = "pine", onChange, onCursor, isDark, settings, errors, problemsTick, diffBase, onReady, keys }: PineMonacoProps) {
  const languageRef = useRef(language);
  languageRef.current = language;
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const onCursorRef = useRef(onCursor);
  onCursorRef.current = onCursor;
  const diffRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const disposers = useRef<Monaco.IDisposable[]>([]);
  const [mounted, setMounted] = useState(false);
  // The editor keeps its own text (it's given `value` only to start with). The value coming back
  // from the parent lags the typing, and writing it back would wipe the newest keystrokes, so a
  // `value` that is just an echo of what this editor reported is ignored; any other (opening a
  // script, a version) replaces the text. Checked when it's applied, not when rendering, so a
  // keystroke in between can't be lost.
  const emitted = useRef<string[]>([]);
  const handleChange = (v: string | undefined) => {
    const s = v ?? "";
    emitted.current.push(s);
    if (emitted.current.length > 200) emitted.current.shift();
    onChange(s);
  };
  useEffect(() => {
    const editor = editorRef.current, model = editor?.getModel();
    if (!editor || !model) return;
    if (model.getValue() === value) { emitted.current = []; return; }
    if (emitted.current.includes(value)) return;
    emitted.current = [];
    editor.pushUndoStop();
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null);
    editor.pushUndoStop();
  }, [value, mounted]);
  // In a collab, the code is the room's, edited live by everyone allowed to
  const inCollab = useCollabActive();
  useEffect(() => {
    const editor = editorRef.current, monaco = monacoRef.current;
    if (!inCollab || !mounted || !editor || !monaco) return;
    const unbind = pineDoc.bind(editor, monaco, () => languageRef.current);
    // The collab ended: back to the code this editor had before; the editor closed: nothing to put back
    return () => unbind(!collab.active);
  }, [inCollab, mounted]);

  const beforeMount: BeforeMount = (monaco) => { setupPine(monaco); setupScriptLanguages(monaco); };
  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    const K = monaco.KeyMod, C = monaco.KeyCode;
    editor.addCommand(K.CtrlCmd | C.Enter, () => keysRef.current.run());
    editor.addCommand(K.CtrlCmd | C.KeyS, () => keysRef.current.save());
    editor.addCommand(K.CtrlCmd | C.KeyO, () => keysRef.current.open());
    editor.addCommand(K.chord(K.CtrlCmd | C.KeyK, K.CtrlCmd | C.KeyI), () => keysRef.current.newIndicator());
    editor.addCommand(K.chord(K.CtrlCmd | C.KeyK, K.CtrlCmd | C.KeyS), () => keysRef.current.newStrategy());
    disposers.current.push(
      editor.onDidChangeCursorPosition(e => onCursorRef.current(e.position.lineNumber, e.position.column)),
      attachReferenceClicks(editor),
    );
    diffRef.current = editor.createDecorationsCollection([]);
    setMounted(true);
    onReady?.({
      focus: () => editor.focus(),
      commandPalette: () => { editor.focus(); editor.trigger("pine", "editor.action.quickCommand", null); },
      goToLine: () => { editor.focus(); editor.trigger("pine", "editor.action.gotoLine", null); },
      showProblems: () => { editor.focus(); editor.trigger("pine", "editor.action.marker.next", null); },
    });
  };
  useEffect(() => () => { disposers.current.forEach(d => d.dispose()); disposers.current = []; }, []);

  // Compile errors → markers (squiggles, overview ruler, minimap)
  useEffect(() => {
    const editor = editorRef.current, monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    monaco.editor.setModelMarkers(model, "pine", errors.map(e => {
      const line = Math.min(Math.max(1, e.line), model.getLineCount());
      const first = model.getLineFirstNonWhitespaceColumn(line) || 1;
      return { severity: monaco.MarkerSeverity.Error, startLineNumber: line, startColumn: first, endLineNumber: line, endColumn: model.getLineMaxColumn(line), message: e.message, code: e.code };
    }));
  }, [errors, value]);

  // After a failed compile: to the first error, with the problems peek open
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !problemsTick || errors.length === 0) return;
    const line = Math.max(1, errors[0].line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.revealLineInCenterIfOutsideViewport(line);
    editor.focus();
    editor.trigger("pine", "editor.action.marker.next", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemsTick]);

  // Change bars against the last saved version
  useEffect(() => {
    const coll = diffRef.current, monaco = monacoRef.current;
    if (!coll || !monaco) return;
    if (!settings.diffDecorations || diffBase === null || diffBase === value) { coll.clear(); return; }
    const t = setTimeout(() => {
      const { added, modified, deletedAfter } = lineDiff(diffBase, value);
      const dec = (line: number, cls: string, color: string): Monaco.editor.IModelDeltaDecoration => ({
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, linesDecorationsClassName: cls, overviewRuler: { color, position: monaco.editor.OverviewRulerLane.Left }, minimap: { color, position: monaco.editor.MinimapPosition.Gutter } },
      });
      coll.set([
        ...added.map(l => dec(l, "pine-diff-added", isDark ? "#487e02" : "#48985d")),
        ...modified.map(l => dec(l, "pine-diff-modified", isDark ? "#1b81a8" : "#2090d3")),
        ...deletedAfter.map(l => dec(l, "pine-diff-deleted", "#f23645")),
      ]);
    }, 150);
    return () => clearTimeout(t);
  }, [diffBase, value, settings.diffDecorations, isDark]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <style>{`
        .pine-diff-added, .pine-diff-modified { margin-left: 3px; width: 3px !important; }
        .pine-diff-added { background: ${isDark ? "#487e02" : "#48985d"}; }
        .pine-diff-modified { background: ${isDark ? "#1b81a8" : "#2090d3"}; }
        .pine-diff-deleted { margin-left: 3px; width: 0 !important; height: 0 !important; margin-top: 14px;
          border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 4px solid #f23645; }
        .monaco-editor .suggest-widget { border-radius: 2px; }
        .monaco-hover .markdown-hover p, .monaco-hover .markdown-hover code { font-size: 13px; }
      `}</style>
      <Editor
        language={monacoLanguageFor(language, PINE_LANG)}
        theme={isDark ? PINE_THEME_DARK : PINE_THEME_LIGHT}
        defaultValue={value}
        onChange={handleChange}
        beforeMount={beforeMount}
        onMount={onMount}
        loading={<div style={{ padding: 16, fontSize: 13, color: "#9c9c9c" }}>Loading…</div>}
        options={{
          fontFamily: PINE_FONT,
          fontSize: 13,
          lineHeight: 18,
          fontWeight: "500",
          fontLigatures: false,
          padding: { top: 8 },
          lineNumbersMinChars: 5,
          glyphMargin: false,
          folding: true,
          renderLineHighlight: "line",
          minimap: { enabled: settings.minimap, maxColumn: 80, renderCharacters: true, showSlider: "mouseover" },
          scrollbar: { verticalScrollbarSize: 14, horizontalScrollbarSize: 12, useShadows: false },
          scrollBeyondLastLine: true,
          quickSuggestions: settings.suggestions ? { other: true, comments: false, strings: false } : false,
          suggestOnTriggerCharacters: settings.suggestions,
          wordWrap: settings.wordWrap ? "on" : "off",
          rulers: settings.lineLengthGuide ? [80] : [],
          bracketPairColorization: { enabled: false },
          guides: { indentation: true, bracketPairs: false },
          tabSize: 4,
          insertSpaces: true,
          detectIndentation: false,
          automaticLayout: true,
          fixedOverflowWidgets: true,
          contextmenu: true,
          smoothScrolling: false,
          overviewRulerLanes: 2,
          hover: { delay: 300 },
        }}
      />
    </div>
  );
}
