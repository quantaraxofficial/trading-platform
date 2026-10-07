"use client";

// TradingView's Pine Editor. It opens over the right half of the window (resizable from its
// left edge), can move to a split view beside the whole layout or to a tab in the bottom panel,
// and collapses without losing the script. Header: Pine Editor, split view, collapse, close.
// Script row: the script's name (its menu: save, copy, rename, version history, move to the
// bottom, create new, recently used, open), Add to chart / Update on chart, Save, Publish
// script, and "…" (editor settings, new window / tab, profiler, Pine logs, command palette,
// release notes, help). The editor is Monaco, as TradingView's, and runs on this app's Pine
// engine against the chart's own bars; a console under it logs compiles and errors.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { runPineScriptAsync, appIntervalToPineTf, type PineRunResult } from "../lib/pineScriptEngine";
import { fetchPineTimeframeData } from "../lib/pineDataFetch";
import { useEscapeClose } from "../lib/useEscapeClose";
import type { PineEditorApi } from "./pine/PineMonaco";
import { pineDock, pineEditorSettings, pineMisc, RELEASE_NOTES_VERSION, clampPineWidth, defaultPineWidth } from "./pine/pineStore";
import { BUILTIN_SCRIPTS } from "./pine/builtinScripts";
import * as Ic from "./pine/pineIcons";
import {
  pinePalette, SaveScriptDialog, OpenScriptDialog, BuiltinScriptDialog, EditorSettingsDialog, VersionHistoryDialog,
  KeyboardShortcutsDialog, StrategyReportEmptyDialog, ConfirmDialog, formatStamp, type PinePalette,
} from "./pine/PineDialogs";
import { backendFetch } from "@/lib/backend";

const PineMonaco = dynamic(() => import("./pine/PineMonaco"), { ssr: false, loading: () => null });

interface PineEditorPanelProps {
  theme?: string;
  onClose: () => void;
  // Set when the editor is opened via the on-chart legend row's "{}" icon — loads the exact
  // script running on the chart rather than whatever the editor last had
  initialCode?: string;
  initialScriptName?: string;
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
const SESSION_KEY = "tv:pineSession";
function loadScripts(): SavedScript[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function persistScripts(list: SavedScript[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// TradingView's new-script templates
const LICENSE = "// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/";
const header = (user: string | null) => `${LICENSE}\n${user ? `// © ${user}` : ""}\n\n`;
const TEMPLATES: Record<ScriptType, (user: string | null) => string> = {
  indicator: (u) => `${header(u)}//@version=6\nindicator("My script")\nplot(close)\n`,
  strategy: (u) => `${header(u)}//@version=6\nstrategy("My strategy", overlay=true, fill_orders_on_standard_ohlc = true)\n\nlongCondition = ta.crossover(ta.sma(close, 14), ta.sma(close, 28))\nif (longCondition)\n    strategy.entry("My Long Entry Id", strategy.long)\n\nshortCondition = ta.crossunder(ta.sma(close, 14), ta.sma(close, 28))\nif (shortCondition)\n    strategy.entry("My Short Entry Id", strategy.short)\n`,
  library: (u) => `${header(u)}//@version=6\n// @description TODO: add library description here\nlibrary("MyLibrary")\n\n// @function TODO: add function description here\n// @param x TODO: add parameter x description here\n// @returns TODO: add what function returns\nexport fun(float x) =>\n    //TODO : add function body and return value here\n    x\n`,
};

const detectType = (code: string): ScriptType => /^\s*strategy\s*\(/m.test(code) ? "strategy" : /^\s*library\s*\(/m.test(code) ? "library" : "indicator";
const declaredTitle = (code: string) => (code.match(/^\s*(?:indicator|strategy|library)\s*\(\s*(?:title\s*=\s*)?"([^"]*)"/m) || [])[1] || "";

// What this editor put on the chart (kept across remounts): the script and the code added
let onChartMemo: { key: string; code: string } | null = null;

type ConsoleLine = { t: number; text: string; kind: "info" | "error" | "warning" };
const clock = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

// --- Tooltip (TradingView's: dark, 13px, with the hotkey after a divider) ---
function Tip({ text, keys, children, placement = "top" }: { text: string; keys?: string[]; children: React.ReactElement<any>; placement?: "top" | "bottom" }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPos({ x: r.left + r.width / 2, y: placement === "top" ? r.top - 6 : r.bottom + 6 }), 500);
  };
  const hide = () => { clearTimeout(timer.current); setPos(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      {React.cloneElement(children, { onMouseEnter: show, onMouseLeave: hide, onMouseDown: hide })}
      {pos && createPortal(
        <div role="tooltip" style={{
          position: "fixed", left: pos.x, top: pos.y, transform: placement === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)", zIndex: 3300, pointerEvents: "none",
          display: "flex", alignItems: "center", gap: 8, height: 24, padding: "0 8px", borderRadius: 2, background: "#2e2e2e", color: "#f2f2f2", fontSize: 13, whiteSpace: "nowrap",
        }}>
          {text}
          {keys && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, paddingLeft: 8, borderLeft: "1px solid #4a4a4a", height: 16 }}>
              {keys.map((k, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ fontSize: 11 }}>+</span>}
                  <span style={{ padding: "0 4px", borderRadius: 2, background: "#4a4a4a", fontSize: 11, lineHeight: "16px" }}>{k}</span>
                </React.Fragment>
              ))}
            </span>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// --- Menus ---
type MenuItem =
  | { kind?: "item"; label: string; icon?: React.ReactNode; shortcut?: string; disabled?: boolean; onClick?: () => void; right?: React.ReactNode; submenu?: MenuItem[]; hint?: string; testId?: string; dot?: boolean }
  | { kind: "divider" }
  | { kind: "header"; label: string };

function Menu({ p, anchor, items, onClose, align = "left", width, submenuSide }: {
  p: PinePalette; anchor: DOMRect; items: MenuItem[]; onClose: () => void; align?: "left" | "right"; width: number; submenuSide?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<{ index: number; rect: DOMRect } | null>(null);
  useEscapeClose(onClose);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("[data-pine-menu]")) return;
      onClose();
    };
    document.addEventListener("mousedown", down, true);
    return () => document.removeEventListener("mousedown", down, true);
  }, [onClose]);
  const left = align === "left" ? anchor.left : anchor.right - width;
  const top = anchor.bottom;
  return createPortal(
    <>
      <MenuBox p={p} refEl={ref} left={Math.max(4, Math.min(left, window.innerWidth - width - 4))} top={top} width={width} items={items} onClose={onClose}
        onOpenSub={(index, rect) => setSub(rect ? { index, rect } : null)} activeSub={sub?.index ?? null} />
      {sub && (() => {
        const it = items[sub.index];
        if (!it || it.kind === "divider" || it.kind === "header" || !it.submenu) return null;
        const subW = 222;
        const side = submenuSide ?? (sub.rect.right + subW + 4 < window.innerWidth ? "right" : "left");
        const x = side === "right" ? sub.rect.right + 2 : sub.rect.left - subW - 2;
        return <MenuBox p={p} left={x} top={sub.rect.top - 6} width={subW} items={it.submenu} onClose={onClose} onOpenSub={() => {}} activeSub={null} alignBottom />;
      })()}
    </>,
    document.body,
  );
}

function MenuBox({ p, refEl, left, top, width, items, onClose, onOpenSub, activeSub, alignBottom }: {
  p: PinePalette; refEl?: React.RefObject<HTMLDivElement | null>; left: number; top: number; width: number; items: MenuItem[]; onClose: () => void;
  onOpenSub: (index: number, rect: DOMRect | null) => void; activeSub: number | null; alignBottom?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(top);
  useEffect(() => {
    const h = boxRef.current?.offsetHeight ?? 0;
    setY(top + h > window.innerHeight - 8 ? Math.max(8, alignBottom ? window.innerHeight - h - 8 : top - h - 44) : top);
  }, [top, alignBottom]);
  return (
    <div ref={(el) => { boxRef.current = el; if (refEl) (refEl as React.MutableRefObject<HTMLDivElement | null>).current = el; }} data-pine-menu role="menu"
      style={{ position: "fixed", left, top: y, width, zIndex: 3100, background: p.menu, color: p.text, borderRadius: 10, boxShadow: p.shadow, padding: "6px 0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif" }}>
      {items.map((it, i) => {
        if (it.kind === "divider") return <div key={i} style={{ height: 1, background: p.border, margin: "6px 6px" }} />;
        if (it.kind === "header") return <div key={i} style={{ padding: "2px 14px 6px", fontSize: 11, color: p.muted, textTransform: "uppercase", letterSpacing: ".4px", lineHeight: "16px" }}>{it.label}</div>;
        return <MenuRow key={i} p={p} item={it} open={activeSub === i} onClose={onClose}
          onHover={(rect) => onOpenSub(i, it.submenu ? rect : null)} />;
      })}
    </div>
  );
}

function MenuRow({ p, item, open, onClose, onHover }: { p: PinePalette; item: Extract<MenuItem, { label: string; kind?: "item" }>; open: boolean; onClose: () => void; onHover: (rect: DOMRect) => void }) {
  const [hover, setHover] = useState(false);
  const dis = !!item.disabled;
  return (
    <div role="menuitem" aria-disabled={dis} data-testid={item.testId}
      onMouseEnter={e => { setHover(true); onHover(e.currentTarget.getBoundingClientRect()); }}
      onMouseLeave={() => setHover(false)}
      onClick={() => { if (dis || item.submenu) return; onClose(); item.onClick?.(); }}
      style={{
        display: "flex", alignItems: "center", gap: 4, height: 32, margin: "0 6px", padding: item.icon ? "0 8px 0 4px" : "0 8px", borderRadius: 6,
        cursor: dis ? "default" : "pointer", color: dis ? p.faint : p.text, background: (hover || open) && !dis ? p.hover : "transparent", fontSize: 14,
      }}>
      {item.icon && <span style={{ display: "flex", width: 28, justifyContent: "center", opacity: dis ? 0.6 : 1 }}>{item.icon}</span>}
      <span style={{ flex: 1, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
        {item.label}
        {item.hint && <span title={item.hint} style={{ color: p.faint, display: "flex" }}><Ic.HelpCircleIcon /></span>}
        {item.dot && <span aria-label="New" style={{ width: 6, height: 6, borderRadius: "50%", background: p.danger }} />}
      </span>
      {item.shortcut && <span style={{ fontSize: 12, color: p.muted, whiteSpace: "nowrap" }}>{item.shortcut}</span>}
      {item.right}
      {item.submenu && <span style={{ display: "flex", color: p.muted }}><Ic.ChevronRightIcon /></span>}
    </div>
  );
}

function Switch({ on, p }: { on: boolean; p: PinePalette }) {
  return (
    <span aria-hidden style={{ width: 38, height: 20, borderRadius: 10, background: on ? p.text : p.faint, position: "relative", flexShrink: 0, transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: p.bg === "#ffffff" ? "#ffffff" : p.menu, transition: "left .15s" }} />
    </span>
  );
}

// --- The editor ---
export default function PineEditorPanel({ theme, onClose, initialCode, initialScriptName }: PineEditorPanelProps) {
  const isDark = theme === "dark";
  const p = pinePalette(isDark);
  const { user } = useAuth();
  const uid = user?.uid;
  const author = user ? (user.displayName || user.email?.split("@")[0] || "").replace(/\s+/g, "_") || null : null;
  const dock = pineDock.useValue();
  const settings = pineEditorSettings.useValue();
  const misc = pineMisc.useValue();

  // --- Script state ---
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const session = useRef<{ scriptId: string | null; name: string; code: string } | null>(null);
  if (session.current === null) {
    try { session.current = initialCode === undefined ? JSON.parse(localStorage.getItem(SESSION_KEY) || "null") : null; } catch { session.current = null; }
  }
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(initialCode === undefined ? session.current?.scriptId ?? null : null);
  const [scriptName, setScriptName] = useState(initialScriptName || (initialCode === undefined ? session.current?.name : undefined) || "Untitled script");
  const [code, setCode] = useState<string>(initialCode ?? session.current?.code ?? TEMPLATES.indicator(author));
  const scriptType = detectType(code);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  // Signed-in users keep scripts on the server (so they follow them across devices); signed-out
  // users keep them in this browser
  async function syncScriptToServer(partial: { id?: string; name?: string; script_type?: string; code?: string; versions?: { code: string; savedAt: number }[]; order?: number }) {
    if (!uid) return null;
    try {
      const res = await backendFetch(`http://localhost:8000/api/users/pinescripts/${uid}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(partial) });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }
  async function deleteScriptOnServer(id: string) {
    if (!uid) return;
    try { await backendFetch(`http://localhost:8000/api/users/pinescripts/${uid}/`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); } catch { /* ignore */ }
  }
  useEffect(() => {
    if (!uid) { setScripts(loadScripts()); return; }
    backendFetch(`http://localhost:8000/api/users/pinescripts/${uid}/`).then(r => r.json()).then((data) => {
      if (!Array.isArray(data)) return;
      setScripts(data.map((s: any): SavedScript => ({ id: String(s.id), name: s.name, code: s.code, type: s.script_type as ScriptType, updatedAt: new Date(s.updated_at).getTime(), order: s.order, versions: s.versions || [] })));
    }).catch(() => setScripts(loadScripts()));
  }, [uid]);
  const commitScripts = (next: SavedScript[]) => { setScripts(next); if (!uid) persistScripts(next); };

  // The editor's session survives closing the panel and reloading, as on TradingView
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ scriptId: currentScriptId, name: scriptName, code })); } catch { /* ignore */ } }, 300);
    return () => clearTimeout(t);
  }, [currentScriptId, scriptName, code]);

  const currentScript = scripts.find(s => s.id === currentScriptId) || null;
  const savedCode = currentScript?.code ?? null;
  const dirty = savedCode === null ? true : savedCode !== code;

  // --- Console ---
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>(() => [{ t: Date.now(), text: `"${initialScriptName || session.current?.name || "Untitled script"}" opened`, kind: "info" }]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [unseenError, setUnseenError] = useState(false);
  const log = useCallback((text: string, kind: ConsoleLine["kind"] = "info") => setConsoleLines(l => [...l.slice(-199), { t: Date.now(), text, kind }]), []);
  const consoleRef = useRef<HTMLDivElement>(null);
  useEffect(() => { consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight }); }, [consoleLines, consoleOpen]);
  useEffect(() => { if (consoleOpen) setUnseenError(false); }, [consoleOpen]);

  // --- Running on the chart ---
  const scriptKey = currentScriptId ?? "untitled";
  const [onChart, setOnChart] = useState(onChartMemo);
  useEffect(() => { onChartMemo = onChart; }, [onChart]);
  useEffect(() => {
    const clear = () => setOnChart(null);
    window.addEventListener("tv:clear-pine-script", clear);
    return () => window.removeEventListener("tv:clear-pine-script", clear);
  }, []);
  const isOnChart = onChart?.key === scriptKey;
  const upToDate = isOnChart && onChart?.code === code;
  const [runResult, setRunResult] = useState<PineRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [problemsTick, setProblemsTick] = useState(0);
  const [profilerMode, setProfilerMode] = useState(false);
  const [logsPanel, setLogsPanel] = useState(false);
  const errors = runResult?.errors ?? [];

  async function runScript() {
    if (isRunning || upToDate) return;
    setIsRunning(true);
    const wasOnChart = isOnChart;
    try {
      const bars = (window as any).__chartFullData || [];
      const symbol = (window as any).__chartSymbol || "";
      const appInterval = (window as any).__chartInterval || "";
      const result = await runPineScriptAsync(code, bars, { symbol, pineTf: appInterval ? appIntervalToPineTf(appInterval) : "", fetchTimeframe: fetchPineTimeframeData, profile: profilerMode });
      setRunResult(result);
      if (result.errors.length) {
        const model = code.split("\n");
        for (const e of result.errors) {
          const line = Math.min(Math.max(1, e.line), model.length);
          const col = (model[line - 1]?.search(/\S/) ?? 0) + 1;
          log(`Error at ${line}:${col} ${e.message}`, "error");
        }
        setUnseenError(true);
        setConsoleOpen(true);
        setProblemsTick(t => t + 1);
        return;
      }
      result.warnings.forEach(w => log(w, "warning"));
      log("Compiled.");
      window.dispatchEvent(new CustomEvent("tv:run-pine-script", { detail: { result, scriptName: result.meta.title || scriptName, code } }));
      setOnChart({ key: scriptKey, code });
      log(wasOnChart ? "Updated on chart." : "Added to chart.");
      if (profilerMode && result.profile) log(`Profiler: ${result.execMs.toFixed(1)} ms over ${bars.length} bars`);
    } finally {
      setIsRunning(false);
    }
  }

  // --- Saving ---
  const [dialog, setDialog] = useState<null | "save" | "rename" | "open" | "builtin" | "settings" | "versions" | "shortcuts" | "reportEmpty">(null);
  const [confirm, setConfirm] = useState<null | { title: string; text: React.ReactNode; confirm: string; onConfirm: () => void; extra?: string; onExtra?: () => void }>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  function persistAsNew(name: string, codeToSave: string) {
    const id = "ps_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const order = scripts.reduce((m, s) => Math.max(m, s.order), 0) + 1;
    const versions = [{ code: codeToSave, savedAt: Date.now() }];
    const entry: SavedScript = { id, name, code: codeToSave, type: detectType(codeToSave), updatedAt: Date.now(), order, versions };
    commitScripts([...scripts, entry]);
    if (uid) syncScriptToServer({ name, script_type: entry.type, code: codeToSave, versions, order }).then(res => {
      if (!res?.id) return;
      const serverId = String(res.id);
      setScripts(prev => prev.map(s => (s.id === id ? { ...s, id: serverId } : s)));
      setCurrentScriptId(cur => (cur === id ? serverId : cur));
      if (onChartMemo?.key === id) setOnChart({ ...onChartMemo, key: serverId });
    });
    if (onChart?.key === "untitled" && onChart.code === codeToSave) setOnChart({ key: id, code: codeToSave });
    setCurrentScriptId(id);
    setScriptName(name);
    log(`"${name}" saved.`);
  }
  function saveScript() {
    if (!currentScriptId) { setDialog("save"); return; }
    const existing = scripts.find(s => s.id === currentScriptId);
    if (existing && existing.code === code && existing.name === scriptName) return;
    const versions = [...(existing?.versions || []), { code, savedAt: Date.now() }].slice(-50);
    commitScripts(scripts.map(s => (s.id === currentScriptId ? { ...s, code, name: scriptName, type: detectType(code), updatedAt: Date.now(), versions } : s)));
    if (uid) syncScriptToServer({ id: currentScriptId, name: scriptName, code, versions, script_type: detectType(code) });
    log(`"${scriptName}" saved.`);
  }
  function rename(name: string) {
    setScriptName(name);
    if (currentScriptId) {
      commitScripts(scripts.map(s => (s.id === currentScriptId ? { ...s, name } : s)));
      if (uid) syncScriptToServer({ id: currentScriptId, name });
    }
  }
  function makeCopy() {
    if (!currentScriptId) return;
    persistAsNew(`Copy of ${scriptName}`, code);
  }
  // Opening something else with unsaved edits asks first (TradingView keeps one open script)
  function guardUnsaved(next: () => void) {
    const untouchedTemplate = !currentScriptId && Object.values(TEMPLATES).some(t => t(author) === code);
    if (!dirty || untouchedTemplate) { next(); return; }
    setConfirm({
      title: "Unsaved changes",
      text: <>Save changes to &ldquo;{scriptName}&rdquo; before opening another script?</>,
      confirm: "Save",
      extra: "Don't save",
      onExtra: () => { setConfirm(null); next(); },
      onConfirm: () => { setConfirm(null); if (currentScriptId) { saveScript(); next(); } else setDialog("save"); },
    });
  }
  function load(id: string | null, name: string, nextCode: string) {
    setCurrentScriptId(id);
    setScriptName(name);
    setCode(nextCode);
    setRunResult(null);
    log(`"${name}" opened`);
  }
  function openSaved(id: string) {
    const s = scripts.find(x => x.id === id);
    if (!s) return;
    setDialog(null);
    guardUnsaved(() => {
      load(s.id, s.name, s.code);
      const touched = scripts.map(x => (x.id === s.id ? { ...x, updatedAt: Date.now() } : x));
      commitScripts(touched);
    });
  }
  function createNew(type: ScriptType) { guardUnsaved(() => load(null, "Untitled script", TEMPLATES[type](author))); }
  function openBuiltin(name: string) {
    const b = BUILTIN_SCRIPTS.find(x => x.name === name);
    setDialog(null);
    if (b) guardUnsaved(() => load(null, "Untitled script", b.code));
  }
  function deleteSaved(id: string) {
    const s = scripts.find(x => x.id === id);
    if (!s) return;
    setConfirm({
      title: "Delete script", text: <>Do you really want to delete &ldquo;{s.name}&rdquo;?</>, confirm: "Delete",
      onConfirm: () => {
        setConfirm(null);
        commitScripts(scripts.filter(x => x.id !== id));
        deleteScriptOnServer(id);
        if (currentScriptId === id) setCurrentScriptId(null);
      },
    });
  }
  function publish() {
    if (scriptType === "strategy") {
      const closed = runResult?.strategyReport ? (runResult.strategyReport as any).totalTrades ?? runResult.strategyReport.trades?.length ?? 0 : 0;
      if (!closed) { setDialog("reportEmpty"); return; }
    }
    setToast("Publishing scripts isn't available yet");
  }

  // Keyboard shortcuts while the panel has focus (the editor has its own for its text)
  const panelRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<PineEditorApi | null>(null);
  const keyActions = { run: () => runScript(), save: () => saveScript(), open: () => setDialog("open"), newIndicator: () => createNew("indicator"), newStrategy: () => createNew("strategy") };
  const keysRef = useRef(keyActions);
  keysRef.current = keyActions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !panelRef.current?.contains(document.activeElement)) return;
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); keysRef.current.save(); }
      else if (k === "o") { e.preventDefault(); keysRef.current.open(); }
      else if (k === "enter") { e.preventDefault(); keysRef.current.run(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // --- Dock: size, split view, bottom, collapse ---
  const width = dock.width || defaultPineWidth();
  const mode = dock.mode;
  const visible = !dock.collapsed;
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    document.body.style.cursor = "ew-resize";
    let frame = 0;
    const move = (ev: MouseEvent) => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => pineDock.set({ width: clampPineWidth(startW + startX - ev.clientX) })); };
    const up = () => { cancelAnimationFrame(frame); document.body.style.cursor = ""; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };
  const [bottomHost, setBottomHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (mode !== "bottom" || !visible) { setBottomHost(null); return; }
    let frame = 0;
    const find = () => { const el = document.getElementById("tv-pine-bottom-host"); if (el) setBottomHost(el); else frame = requestAnimationFrame(find); };
    find();
    return () => cancelAnimationFrame(frame);
  }, [mode, visible]);

  // --- Menus ---
  const [menu, setMenu] = useState<null | { which: "name" | "more" | "tab"; rect: DOMRect }>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu = (which: "name" | "more" | "tab", e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu(m => (m?.which === which ? null : { which, rect }));
  };
  const recentlyUsed = [...scripts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const icon = (el: React.ReactNode) => el;
  const hasSaved = !!currentScriptId;
  const createNewItems: MenuItem[] = [
    { label: "Indicator", icon: <Ic.IndicatorIcon />, shortcut: "Ctrl + K, Ctrl + I", onClick: () => createNew("indicator") },
    { label: "Strategy", icon: <Ic.StrategyIcon />, shortcut: "Ctrl + K, Ctrl + S", onClick: () => createNew("strategy") },
    { label: "Library", icon: <Ic.LibraryIcon />, onClick: () => createNew("library") },
    { kind: "divider" },
    { label: "Built-in…", icon: <Ic.BuiltInIcon />, onClick: () => setDialog("builtin") },
  ];
  const nameItems: MenuItem[] = [
    { label: "Save script", icon: icon(<Ic.SaveCloudIcon />), shortcut: "Ctrl + S", onClick: saveScript },
    { label: "Make a copy…", icon: <Ic.CopyIcon />, disabled: !hasSaved, onClick: makeCopy },
    { label: "Rename…", icon: <Ic.RenameIcon />, onClick: () => setDialog(hasSaved ? "rename" : "save") },
    { label: "Version history…", icon: <Ic.VersionHistoryIcon />, disabled: !hasSaved || (currentScript?.versions.length ?? 0) === 0, onClick: () => setDialog("versions") },
    { label: "Move script to bottom", icon: <Ic.MoveBottomIcon />, onClick: () => pineDock.set({ mode: "bottom", bottomExpanded: true, maximized: false }) },
    { kind: "divider" },
    { label: "Create new", icon: <Ic.PlusIcon />, submenu: createNewItems },
    ...(recentlyUsed.length ? [{ kind: "divider" } as MenuItem, { kind: "header", label: "Recently used" } as MenuItem, ...recentlyUsed.map(s => ({ label: s.name, onClick: () => openSaved(s.id) }) as MenuItem)] : []),
    { kind: "divider" },
    { label: "Open script…", icon: <Ic.FolderIcon />, shortcut: "Ctrl + O", onClick: () => setDialog("open") },
  ];
  const tabItems: MenuItem[] = [
    { label: "Save script", icon: <Ic.SaveCloudIcon />, shortcut: "Ctrl + S", onClick: saveScript },
    { label: "Rename…", icon: <Ic.RenameIcon />, onClick: () => setDialog(hasSaved ? "rename" : "save") },
    { label: "Version history…", icon: <Ic.VersionHistoryIcon />, disabled: !hasSaved || (currentScript?.versions.length ?? 0) === 0, onClick: () => setDialog("versions") },
    { label: "Move script to right", icon: <Ic.MoveRightIcon />, onClick: () => pineDock.set({ mode: "overlay" }) },
    { kind: "divider" },
    { label: isOnChart ? "Update on chart" : "Add to chart", icon: isOnChart ? <Ic.UpdateIcon /> : <Ic.AddToChartIcon />, shortcut: "Ctrl + ↵", disabled: upToDate || isRunning, onClick: runScript },
    { kind: "divider" },
    { label: "Close tab", icon: <Ic.CloseTabIcon />, onClick: onClose },
  ];
  const releaseDot = misc.releaseNotesSeen !== RELEASE_NOTES_VERSION;
  const link = (url: string) => () => window.open(url, "_blank", "noopener");
  const helpItems: MenuItem[] = [
    { kind: "header", label: "Editor references" },
    { label: "How to use", icon: <Ic.HowToUseIcon />, onClick: link("https://www.tradingview.com/pine-script-docs/primer/first-steps/") },
    { label: "Keyboard shortcuts", icon: <Ic.KeyboardIcon />, onClick: () => setDialog("shortcuts") },
    { kind: "divider" },
    { kind: "header", label: "Pine references" },
    { label: "User Manual", icon: <Ic.UserManualIcon />, right: <span style={{ color: p.muted, display: "flex" }}><Ic.ExternalIcon /></span>, onClick: link("https://www.tradingview.com/pine-script-docs/") },
    { label: "Reference manual…", icon: <Ic.ReferenceManualIcon />, onClick: link("https://www.tradingview.com/pine-script-reference/v6/") },
    { kind: "divider" },
    { kind: "header", label: "Ask question" },
    { label: "Pine freelancers", icon: <Ic.FreelancersIcon />, right: <span style={{ color: p.muted, display: "flex" }}><Ic.ExternalIcon /></span>, onClick: link("https://www.tradingview.com/pine-script-docs/where-can-i-get-more-information/") },
    { label: "Stack Overflow", icon: <Ic.StackOverflowIcon />, right: <span style={{ color: p.muted, display: "flex" }}><Ic.ExternalIcon /></span>, onClick: link("https://stackoverflow.com/questions/tagged/pine-script") },
    { kind: "divider" },
    { kind: "header", label: "Request a feature" },
    { label: "Reddit", icon: <Ic.RedditIcon />, right: <span style={{ color: p.muted, display: "flex" }}><Ic.ExternalIcon /></span>, onClick: link("https://www.reddit.com/r/pinescript/") },
  ];
  const moreItems: MenuItem[] = [
    { label: "Editor settings…", icon: <Ic.EditorSettingsIcon />, onClick: () => setDialog("settings") },
    { kind: "divider" },
    { kind: "header", label: "Open editor" },
    { label: "New window", icon: <Ic.NewWindowIcon />, onClick: () => window.open(window.location.href, "_blank", "width=1100,height=760") },
    { label: "New tab", icon: <Ic.NewTabIcon />, onClick: () => window.open(window.location.href, "_blank") },
    { kind: "divider" },
    { kind: "header", label: "Developer tools" },
    { label: "Profiler mode", hint: "Times each line of the script on its next run and shows the results beside the lines", right: <Switch on={profilerMode} p={p} />, onClick: () => { setProfilerMode(v => !v); if (profilerMode) setRunResult(r => (r ? { ...r, profile: undefined } : r)); } , testId: "pine-profiler" },
    { label: "Pine logs", hint: "Shows the messages the script writes with log.info(), log.warning() and log.error()", onClick: () => setLogsPanel(true) },
    { label: "Command Palette", hint: "Every editor command, searchable (F1)", onClick: () => apiRef.current?.commandPalette() },
    { kind: "divider" },
    { label: "Release notes", right: <span style={{ color: p.muted, display: "flex" }}><Ic.ExternalIcon /></span>, onClick: () => { pineMisc.set({ releaseNotesSeen: RELEASE_NOTES_VERSION }); link("https://www.tradingview.com/pine-script-docs/release-notes/")(); } },
    { label: "Help", submenu: helpItems },
  ];
  // The release-notes dot beside its menu item
  const moreItemsWithDot = moreItems.map(it => (it.kind === undefined && (it as any).label === "Release notes" && releaseDot ? { ...it, dot: true } as MenuItem : it));

  // --- Profiler annotations (per-line timings, as a console summary of the slowest lines) ---
  const profileLines = useMemo(() => {
    const prof = runResult?.profile;
    if (!prof?.length) return null;
    const total = prof.filter(x => x.line > 0).reduce((a, b) => a + b.ms, 0) || 1;
    return [...prof].sort((a, b) => b.ms - a.ms).slice(0, 8).map(x => ({ ...x, pct: (x.ms / total) * 100 }));
  }, [runResult]);

  // --- Pieces ---
  const wide = mode !== "bottom" && width >= 860;
  const narrow = mode !== "bottom" && width < 600;
  const btnBase: React.CSSProperties = { height: 34, minWidth: 34, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 8, background: "transparent", color: p.text, cursor: "pointer", fontSize: 16, fontFamily: "inherit", padding: 0 };
  const bordered: React.CSSProperties = { ...btnBase, border: `1px solid ${p.border}` };
  const runLabel = isOnChart ? "Update on chart" : "Add to chart";
  const runButton = (
    <Tip text={runLabel} keys={["Ctrl", "↵"]}>
      <button type="button" aria-label={runLabel} className="pine-hover-btn" onClick={runScript} disabled={upToDate || isRunning}
        style={{ ...bordered, padding: wide ? "0 12px 0 4px" : 0, color: upToDate ? p.faint : p.text, cursor: upToDate ? "default" : "pointer" }}>
        {isRunning ? <span className="pine-dots"><i /><i /><i /></span> : isOnChart ? <Ic.UpdateIcon /> : <Ic.AddToChartIcon />}
        {wide && <span>{runLabel}</span>}
      </button>
    </Tip>
  );
  const saveButton = (
    <Tip text="Save script" keys={["Ctrl", "S"]}>
      <button type="button" aria-label="Save script" className="pine-hover-btn" onClick={saveScript} style={{ ...btnBase, padding: wide ? "0 8px 0 4px" : 0, color: p.blue }}>
        {dialog === "save" ? <span className="pine-dots"><i /><i /><i /></span> : <Ic.SaveCloudIcon />}
        {wide && <span>Save</span>}
      </button>
    </Tip>
  );
  const nameButton = (
    <button type="button" aria-label="Script menu" aria-haspopup="menu" aria-expanded={menu?.which === "name"} className="pine-hover-btn" onClick={e => openMenu("name", e)}
      style={{ ...btnBase, padding: "0 6px", gap: 4, background: menu?.which === "name" ? p.hover : "transparent", minWidth: 0, flexShrink: 1 }}>
      {scriptType === "strategy" ? <Ic.StrategyIcon /> : scriptType === "library" ? <Ic.LibraryIcon /> : <Ic.TypeIndicatorIcon />}
      <h2 title={scriptName} style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: "24px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{scriptName}</h2>
      <span style={{ display: "flex", transform: menu?.which === "name" ? "rotate(180deg)" : undefined }}><Ic.ChevronDownIcon /></span>
    </button>
  );

  const editor = (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }} data-testid="pine-editor">
      <PineMonaco
        value={code}
        onChange={setCode}
        onCursor={(line, col) => setCursor({ line, col })}
        isDark={isDark}
        settings={settings}
        errors={errors}
        problemsTick={problemsTick}
        diffBase={savedCode}
        onReady={api => { apiRef.current = api; }}
        keys={{ run: () => keysRef.current.run(), save: () => keysRef.current.save(), open: () => keysRef.current.open(), newIndicator: () => keysRef.current.newIndicator(), newStrategy: () => keysRef.current.newStrategy() }}
      />
    </div>
  );

  const consolePanel = consoleOpen && (
    <div ref={consoleRef} data-testid="pine-console" style={{ height: 120, flexShrink: 0, overflowY: "auto", borderTop: `1px solid ${p.border}`, padding: "4px 8px", fontFamily: 'Menlo, "Ubuntu Mono", Consolas, source-code-pro, monospace', fontSize: 12, lineHeight: "26px" }}>
      {consoleLines.map((l, i) => (
        <div key={i} style={{ color: l.kind === "error" ? p.danger : l.kind === "warning" ? "#ff9800" : p.faint, whiteSpace: "pre-wrap" }}>
          <span>{clock(l.t)}</span>&nbsp;&nbsp;{l.text}
        </div>
      ))}
      {profileLines && (
        <div style={{ color: p.faint }}>
          {profileLines.map(x => <div key={x.line}>&nbsp;&nbsp;line {x.line}: {x.ms.toFixed(2)} ms ({x.pct.toFixed(1)}%) · {x.count} runs</div>)}
        </div>
      )}
    </div>
  );

  const logsPanelEl = logsPanel && (
    <div data-testid="pine-logs" style={{ height: 160, flexShrink: 0, display: "flex", flexDirection: "column", borderTop: `1px solid ${p.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 32, padding: "0 4px 0 12px", fontSize: 14, fontWeight: 600 }}>
        Pine Logs
        <button type="button" aria-label="Close Pine Logs" className="pine-hover-btn" onClick={() => setLogsPanel(false)} style={{ ...btnBase, height: 28, minWidth: 28 }}><Ic.CloseIcon size={22} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 8px", fontFamily: 'Menlo, "Ubuntu Mono", Consolas, source-code-pro, monospace', fontSize: 12, lineHeight: "20px" }}>
        {(runResult?.logs ?? []).map((l, i) => <div key={i}>{l}</div>)}
        {!(runResult?.logs?.length) && <div style={{ color: p.faint }}>No logs yet. Messages from log.info(), log.warning() and log.error() show here after the script runs.</div>}
      </div>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", alignItems: "center", height: 22, flexShrink: 0, borderTop: `1px solid ${p.border}`, padding: mode === "bottom" ? "0 8px" : "0 2px 0 8px", fontSize: 12, color: p.text }}>
      <Tip text={consoleOpen ? "Hide console" : "Show console"} placement="top">
        <button type="button" aria-label="Toggle console" aria-pressed={consoleOpen} onClick={() => setConsoleOpen(o => !o)}
          style={{ position: "relative", width: 34, height: 22, border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: consoleOpen ? p.hover : "transparent", color: p.text, cursor: "pointer" }}>
          <Ic.ConsoleIcon />
          {unseenError && !consoleOpen && <span style={{ position: "absolute", top: 1, right: 7, width: 6, height: 6, borderRadius: "50%", background: p.danger }} />}
        </button>
      </Tip>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={() => apiRef.current?.goToLine()} style={{ border: "none", background: "transparent", color: p.text, fontSize: 12, fontFamily: "inherit", cursor: "pointer", padding: "0 8px", height: 22 }}>Line {cursor.line}, Col {cursor.col}</button>
      <a href="https://www.tradingview.com/pine-script-reference/v6/" target="_blank" rel="noopener noreferrer" title="Open Pine Reference" style={{ color: p.text, textDecoration: "none", padding: "0 8px", lineHeight: "22px" }}>Pine Script® v6</a>
    </div>
  );

  const dialogs = (
    <>
      {(dialog === "save" || dialog === "rename") && (
        <SaveScriptDialog p={p} title={dialog === "rename" ? "Rename script" : "Save script"}
          initial={dialog === "rename" ? scriptName : (scriptName !== "Untitled script" ? scriptName : declaredTitle(code) || "My script")}
          onCancel={() => setDialog(null)}
          onSave={name => { setDialog(null); if (dialog === "rename") rename(name); else persistAsNew(name, code); }} />
      )}
      {dialog === "open" && (
        <OpenScriptDialog p={p} onClose={() => setDialog(null)} onOpen={openSaved} onDelete={deleteSaved}
          items={[...scripts].sort((a, b) => a.order - b.order).map(s => ({ id: s.id, name: s.name, type: s.type, versionLabel: `Version: ${Math.max(1, s.versions.length)}.0 (${formatStamp(s.updatedAt)})` }))} />
      )}
      {dialog === "builtin" && (
        <BuiltinScriptDialog p={p} onClose={() => setDialog(null)} onOpen={openBuiltin}
          items={[...BUILTIN_SCRIPTS].sort((a, b) => a.name.localeCompare(b.name)).map(b => ({ id: b.name, name: b.name, type: b.type, aliases: [(b.code.match(/shorttitle\s*=\s*"([^"]+)"/) || [])[1] || "", declaredTitle(b.code)] }))} />
      )}
      {dialog === "settings" && <EditorSettingsDialog p={p} value={settings} onCancel={() => setDialog(null)} onOk={v => { pineEditorSettings.set(v); setDialog(null); }} />}
      {dialog === "versions" && currentScript && (
        <VersionHistoryDialog p={p} name={currentScript.name} versions={currentScript.versions} onClose={() => setDialog(null)}
          onOpen={i => { setDialog(null); setCode(currentScript.versions[i].code); log(`Version ${i + 1}.0 of "${currentScript.name}" opened`); }} />
      )}
      {dialog === "shortcuts" && <KeyboardShortcutsDialog p={p} onClose={() => setDialog(null)} />}
      {dialog === "reportEmpty" && <StrategyReportEmptyDialog p={p} onClose={() => setDialog(null)} />}
      {confirm && <ConfirmDialog p={p} title={confirm.title} text={confirm.text} confirm={confirm.confirm} extra={confirm.extra} onExtra={confirm.onExtra} onCancel={() => setConfirm(null)} onConfirm={confirm.onConfirm} />}
      {menu?.which === "name" && <Menu p={p} anchor={menu.rect} items={nameItems} onClose={closeMenu} width={340} />}
      {menu?.which === "tab" && <Menu p={p} anchor={menu.rect} items={tabItems} onClose={closeMenu} width={300} />}
      {menu?.which === "more" && <Menu p={p} anchor={menu.rect} items={moreItemsWithDot} onClose={closeMenu} align="right" width={200} submenuSide="left" />}
      {toast && createPortal(
        <div role="status" style={{ position: "fixed", left: "50%", bottom: 64, transform: "translateX(-50%)", zIndex: 3300, background: "#2e2e2e", color: "#f2f2f2", borderRadius: 6, padding: "10px 16px", fontSize: 14 }}>{toast}</div>,
        document.body,
      )}
    </>
  );

  const styles = (
    <style>{`
      .pine-hover-btn:hover:not(:disabled) { background: ${p.hover} !important; }
      .pine-icon-btn { display: flex; align-items: center; justify-content: center; border: none; background: transparent; border-radius: 8px; cursor: pointer; padding: 0; }
      .pine-icon-btn:hover { background: ${p.hover}; }
      .pine-dots { display: inline-flex; gap: 3px; align-items: center; justify-content: center; width: 28px; }
      .pine-dots i { width: 4px; height: 4px; border-radius: 50%; background: currentColor; animation: pineDot 1.2s infinite ease-in-out; }
      .pine-dots i:nth-child(2) { animation-delay: .15s; } .pine-dots i:nth-child(3) { animation-delay: .3s; }
      @keyframes pineDot { 0%, 60%, 100% { opacity: .3; } 30% { opacity: 1; } }
      .pine-checkbox { appearance: none; width: 18px; height: 18px; margin: 0; border: 1px solid ${p.faint}; border-radius: 4px; display: inline-grid; place-content: center; cursor: pointer; flex-shrink: 0; }
      .pine-checkbox:checked { background: ${p.text}; border-color: ${p.text}; }
      .pine-checkbox:checked::after { content: ""; width: 10px; height: 6px; border-left: 2px solid ${p.bg}; border-bottom: 2px solid ${p.bg}; transform: rotate(-45deg) translate(1px, -1px); }
    `}</style>
  );

  // --- Bottom tab ---
  if (mode === "bottom") {
    if (!visible || !bottomHost) return <>{styles}{dialogs}</>;
    return createPortal(
      <div ref={panelRef} data-testid="pine-panel" data-dock="bottom" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: p.bg, color: p.text }}>
        {styles}
        <div style={{ display: "flex", alignItems: "center", height: 38, flexShrink: 0, padding: "0 6px" }}>
          <button type="button" aria-label="Script menu" className="pine-hover-btn" onClick={e => openMenu("tab", e)}
            style={{ ...btnBase, height: 32, padding: "0 6px", gap: 4, fontSize: 14, background: p.hover }}>
            {scriptType === "strategy" ? <Ic.StrategyIcon /> : scriptType === "library" ? <Ic.LibraryIcon /> : <Ic.TypeIndicatorIcon />}
            <span style={{ whiteSpace: "nowrap" }}>{scriptName}</span>
            <span style={{ display: "flex", transform: menu?.which === "tab" ? "rotate(180deg)" : undefined }}><Ic.ChevronDownIcon /></span>
          </button>
          <span style={{ flex: 1 }} />
          <Tip text={dock.bottomExpanded ? "Collapse panel" : "Open panel"}>
            <button type="button" aria-label={dock.bottomExpanded ? "Collapse panel" : "Open panel"} className="pine-icon-btn" onClick={() => pineDock.set(d => ({ bottomExpanded: !d.bottomExpanded }))} style={{ width: 34, height: 34, color: p.text, transform: dock.bottomExpanded ? undefined : "rotate(180deg)" }}><Ic.CollapseIcon /></button>
          </Tip>
          <Tip text="Close">
            <button type="button" aria-label="Close" className="pine-icon-btn" onClick={onClose} style={{ width: 34, height: 34, color: p.text }}><Ic.CloseIcon /></button>
          </Tip>
        </div>
        {dock.bottomExpanded && <>{editor}{logsPanelEl}{consolePanel}{footer}</>}
        {dialogs}
      </div>,
      bottomHost,
    );
  }

  // --- Overlay / split view ---
  const split = mode === "split";
  const full = split && dock.maximized;
  return (
    <div ref={panelRef} data-testid="pine-panel" data-dock={mode}
      style={{
        position: "fixed", top: 0, bottom: 0, right: 0, width: full ? "100vw" : width, maxWidth: "100vw",
        display: visible ? "flex" : "none", flexDirection: "column", background: p.bg, color: p.text, zIndex: 2100,
        boxShadow: split ? "none" : isDark ? "-1px 0 0 #2a2e39" : "-1px 0 0 #ebebeb",
        borderLeft: split ? `4px solid var(--tv-color-gap)` : "none",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
      }}>
      {styles}
      {/* Resize from the left edge (the grip TradingView shows mid-height) */}
      {!full && (
        <div data-name="pine-resize" onMouseDown={startResize} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 16, cursor: "ew-resize", zIndex: 2 }}>
          <div style={{ position: "absolute", left: 12, top: "50%", width: 4, height: 76, marginTop: -38, borderRadius: 2, background: isDark ? "#4a4a4a" : "#9c9c9c" }} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "0 20px 0 36px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, height: 34, marginTop: 16, flexShrink: 0 }}>
          <Tip text={split ? "Move split-view to overlay" : "Move overlay to split-view"} placement="bottom">
            <button type="button" aria-label={split ? "Move split-view to overlay" : "Move overlay to split-view"} className="pine-icon-btn" style={{ width: 34, height: 34, color: p.text }}
              onClick={() => pineDock.set({ mode: split ? "overlay" : "split", maximized: false })}>
              <Ic.SplitViewIcon style={split ? { transform: "scaleX(-1)" } : undefined} />
            </button>
          </Tip>
          <span style={{ fontSize: 14 }}>Pine Editor</span>
          <span style={{ flex: 1 }} />
          {split && (
            <Tip text={full ? "Restore panel" : "Maximize panel"} placement="bottom">
              <button type="button" aria-label={full ? "Restore panel" : "Maximize panel"} className="pine-icon-btn" style={{ width: 34, height: 34, color: p.text }} onClick={() => pineDock.set(d => ({ maximized: !d.maximized }))}>
                {full ? <Ic.RestoreIcon /> : <Ic.MaximizeIcon />}
              </button>
            </Tip>
          )}
          <Tip text="Collapse panel" placement="bottom">
            <button type="button" aria-label="Collapse panel" className="pine-icon-btn" style={{ width: 34, height: 34, color: p.text, marginRight: 4 }} onClick={() => pineDock.set({ collapsed: true })}><Ic.CollapseIcon /></button>
          </Tip>
          <Tip text="Close" placement="bottom">
            <button type="button" aria-label="Close" className="pine-icon-btn" style={{ width: 34, height: 34, color: p.text }} onClick={onClose}><Ic.CloseIcon /></button>
          </Tip>
        </div>
        {/* Script row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, marginTop: 12, marginLeft: -6, flexShrink: 0 }}>
          {nameButton}
          {runButton}
          {saveButton}
          <span style={{ flex: 1 }} />
          <Tip text="Share your script with community">
            <button type="button" aria-label="Publish script" className="pine-hover-btn" onClick={publish} style={{ ...bordered, padding: narrow ? 0 : "0 12px 0 6px", flexShrink: 0 }}>
              <Ic.PublishIcon />{!narrow && <span style={{ whiteSpace: "nowrap" }}>Publish script</span>}
            </button>
          </Tip>
          <Tip text="More">
            <button type="button" aria-label="More" aria-haspopup="menu" className="pine-hover-btn" onClick={e => openMenu("more", e)}
              style={{ ...bordered, position: "relative", width: 34, flexShrink: 0, background: menu?.which === "more" ? p.hover : "transparent" }}>
              <Ic.MoreIcon />
              {releaseDot && <span data-testid="pine-release-dot" style={{ position: "absolute", top: -3, right: -3, width: 7, height: 7, borderRadius: "50%", background: p.danger }} />}
            </button>
          </Tip>
        </div>
        <div style={{ height: 1, background: p.border, marginTop: 13, flexShrink: 0 }} />
        {editor}
        {logsPanelEl}
        {consolePanel}
        {footer}
      </div>
      {dialogs}
    </div>
  );
}
