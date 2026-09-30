"use client";

// The Pine Editor's dialogs, laid out as TradingView's: Save script / Rename, Open my script,
// Open built-in script, Editor settings, Version history, Keyboard shortcuts, the "Strategy
// report is empty" notice, and a plain confirm. All close on Esc and on a click outside.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../../lib/useEscapeClose";
import { CloseIcon, SearchIcon, SortIcon, TrashIcon, IndicatorIcon, StrategyIcon, LibraryIcon, HelpCircleIcon } from "./pineIcons";
import { DEFAULT_EDITOR_SETTINGS, type PineEditorSettings } from "./pineStore";

export type PinePalette = ReturnType<typeof pinePalette>;
export function pinePalette(isDark: boolean) {
  return isDark ? {
    bg: "#131722", menu: "#1e222d", text: "#d1d4dc", muted: "#868993", faint: "#787b86", border: "#4a4a4a", hover: "#2a2e39",
    primaryBg: "#ffffff", primaryText: "#000000", blue: "#5b9cf6", danger: "#f23645", shadow: "0 2px 4px rgba(0,0,0,.4)", overlay: "rgba(0,0,0,.5)", inputBg: "#131722",
  } : {
    bg: "#ffffff", menu: "#ffffff", text: "#0f0f0f", muted: "#707070", faint: "#9c9c9c", border: "#ebebeb", hover: "#f2f2f2",
    primaryBg: "#0f0f0f", primaryText: "#ffffff", blue: "#2962ff", danger: "#f23645", shadow: "0 2px 4px rgba(0,0,0,.2)", overlay: "rgba(0,0,0,.4)", inputBg: "#ffffff",
  };
}

export const typeIcon = (t: string, size = 18) => t === "strategy" ? <StrategyIcon size={size} /> : t === "library" ? <LibraryIcon size={size} /> : <IndicatorIcon size={size} />;

function Frame({ p, title, onClose, width = 480, height, children, titleExtra, testId }: {
  p: PinePalette; title: string; onClose: () => void; width?: number; height?: number; children: React.ReactNode; titleExtra?: React.ReactNode; testId?: string;
}) {
  useEscapeClose(onClose);
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 3200, background: p.overlay, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label={title} data-testid={testId}
        style={{ width, maxWidth: "100%", height, maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: p.bg, color: p.text, borderRadius: 6, boxShadow: "0 2px 12px rgba(0,0,0,.25)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px 20px", flexShrink: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700, lineHeight: "28px" }}>{title}{titleExtra}</span>
          <button type="button" aria-label="Close" onClick={onClose} className="pine-icon-btn" style={{ width: 34, height: 34, color: p.text }}><CloseIcon /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function PineButton({ p, kind = "secondary", children, onClick, disabled, strongBorder, autoFocus }: {
  p: PinePalette; kind?: "primary" | "secondary"; children: React.ReactNode; onClick?: () => void; disabled?: boolean; strongBorder?: boolean; autoFocus?: boolean;
}) {
  const primary = kind === "primary";
  return (
    <button type="button" onClick={onClick} disabled={disabled} autoFocus={autoFocus}
      style={{
        height: 34, padding: "0 12px", borderRadius: 8, fontSize: 16, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
        background: primary ? p.primaryBg : "transparent", color: primary ? p.primaryText : p.text,
        border: primary ? `1px solid ${p.primaryBg}` : `1px solid ${strongBorder ? p.text : p.border}`,
      }}>
      {children}
    </button>
  );
}

// --- Save script / Rename ---
export function SaveScriptDialog({ p, title, initial, onCancel, onSave }: { p: PinePalette; title: string; initial: string; onCancel: () => void; onSave: (name: string) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  const ok = v.trim().length > 0;
  return (
    <Frame p={p} title={title} onClose={onCancel} width={480}>
      <div style={{ padding: "0 20px" }}>
        <label style={{ display: "block", fontSize: 14, color: p.muted, marginBottom: 6 }}>New script name</label>
        <input ref={ref} autoFocus aria-label="New script name" value={v} onChange={e => setV(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && ok) onSave(v.trim()); }}
          style={{ width: "100%", boxSizing: "border-box", height: 34, padding: "0 8px", fontSize: 16, fontFamily: "inherit", color: p.text, background: p.inputBg, border: `1px solid ${p.blue}`, boxShadow: `0 0 0 1px ${p.blue}`, borderRadius: 6, outline: "none" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "24px 20px 20px" }}>
        <PineButton p={p} onClick={onCancel}>Cancel</PineButton>
        <PineButton p={p} kind="primary" disabled={!ok} onClick={() => onSave(v.trim())}>Save</PineButton>
      </div>
    </Frame>
  );
}

// --- Script lists (Open my script, Open built-in script) ---
export interface ListedScript { id: string; name: string; type: string; versionLabel?: string; aliases?: string[] }
function ScriptList({ p, items, onOpen, onDelete, sortable, emptyText }: {
  p: PinePalette; items: ListedScript[]; onOpen: (id: string) => void; onDelete?: (id: string) => void; sortable?: boolean; emptyText: string;
}) {
  const [q, setQ] = useState("");
  const [desc, setDesc] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = items.filter(s => s.name.toLowerCase().includes(needle) || (s.aliases || []).some(a => a.toLowerCase().includes(needle)));
    return sortable ? [...f].sort((a, b) => a.name.localeCompare(b.name) * (desc ? -1 : 1)) : f;
  }, [items, q, desc, sortable]);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 20px", borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}`, flexShrink: 0, color: p.faint }}>
        <SearchIcon />
        <input autoFocus aria-label="Search" placeholder="Search" value={q} onChange={e => setQ(e.target.value)}
          style={{ flex: 1, height: 38, border: "none", outline: "none", background: "transparent", fontSize: 16, fontFamily: "inherit", color: p.text }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 40, padding: "0 20px 0 32px", flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: p.muted, letterSpacing: ".4px" }}>SCRIPT NAME</span>
        {sortable && (
          <button type="button" aria-label={desc ? "Sort A to Z" : "Sort Z to A"} className="pine-icon-btn" onClick={() => setDesc(d => !d)} style={{ width: 28, height: 28, color: p.text, transform: desc ? "scaleY(-1)" : undefined }}><SortIcon /></button>
        )}
      </div>
      <div role="listbox" aria-label="Scripts" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 12 }}>
        {shown.map(s => (
          <div key={s.id} role="option" aria-selected={false} tabIndex={0}
            onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(h => (h === s.id ? null : h))}
            onClick={() => onOpen(s.id)} onKeyDown={e => { if (e.key === "Enter") onOpen(s.id); }}
            style={{ display: "flex", alignItems: "center", gap: 8, minHeight: s.versionLabel ? 56 : 32, padding: "4px 20px 4px 32px", cursor: "pointer", background: hover === s.id ? p.hover : "transparent" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, lineHeight: "20px" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ color: p.muted, display: "flex" }}>{typeIcon(s.type)}</span>
              </div>
              {s.versionLabel && <div style={{ fontSize: 12, color: p.muted, marginTop: 4 }}>{s.versionLabel}</div>}
            </div>
            {onDelete && (
              <button type="button" aria-label={`Delete ${s.name}`} className="pine-icon-btn" onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                style={{ width: 28, height: 28, color: p.text, visibility: hover === s.id ? "visible" : "hidden" }}><TrashIcon /></button>
            )}
          </div>
        ))}
        {shown.length === 0 && <div style={{ padding: "16px 32px", fontSize: 14, color: p.muted }}>{q ? "No scripts match your search" : emptyText}</div>}
      </div>
    </>
  );
}

export function OpenScriptDialog({ p, items, onOpen, onDelete, onClose }: { p: PinePalette; items: ListedScript[]; onOpen: (id: string) => void; onDelete: (id: string) => void; onClose: () => void }) {
  return (
    <Frame p={p} title="Open my script" onClose={onClose} width={480} height={620} testId="pine-open-dialog">
      <ScriptList p={p} items={items} onOpen={onOpen} onDelete={onDelete} sortable emptyText="You have no saved scripts yet" />
    </Frame>
  );
}

export function BuiltinScriptDialog({ p, items, onOpen, onClose }: { p: PinePalette; items: ListedScript[]; onOpen: (id: string) => void; onClose: () => void }) {
  return (
    <Frame p={p} title="Open built-in script" onClose={onClose} width={480} height={620} testId="pine-builtin-dialog"
      titleExtra={<span title="Opens a copy of a built-in script's source, to read or build on" style={{ color: p.faint, display: "flex" }}><HelpCircleIcon /></span>}>
      <ScriptList p={p} items={items} onOpen={onOpen} emptyText="No built-in scripts" />
    </Frame>
  );
}

// --- Editor settings ---
const SETTING_ROWS: { key: keyof PineEditorSettings; label: string; hint?: string }[] = [
  { key: "suggestions", label: "Suggestions as you type" },
  { key: "minimap", label: "Minimap" },
  { key: "lineLengthGuide", label: "Line length guide" },
  { key: "diffDecorations", label: "Diff decorations", hint: "Marks the lines added, changed or deleted since the script was last saved" },
  { key: "wordWrap", label: "Use word wrap by default", hint: "Wraps long lines to the editor's width instead of scrolling sideways" },
];
export function EditorSettingsDialog({ p, value, onCancel, onOk }: { p: PinePalette; value: PineEditorSettings; onCancel: () => void; onOk: (v: PineEditorSettings) => void }) {
  const [v, setV] = useState(value);
  return (
    <Frame p={p} title="Editor settings" onClose={onCancel} width={466} testId="pine-editor-settings">
      <div style={{ borderTop: `1px solid ${p.border}`, padding: "20px 20px 4px" }}>
        <div style={{ fontSize: 11, color: p.muted, letterSpacing: ".4px", marginBottom: 12 }}>TEXT EDITOR</div>
        {SETTING_ROWS.map(r => (
          <label key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, height: 50, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={v[r.key]} onChange={e => setV(s => ({ ...s, [r.key]: e.target.checked }))} className="pine-checkbox" aria-label={r.label} />
            <span>{r.label}</span>
            {r.hint && <span title={r.hint} style={{ color: p.faint, display: "flex" }}><HelpCircleIcon /></span>}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 20px", borderTop: `1px solid ${p.border}` }}>
        <PineButton p={p} onClick={() => setV(DEFAULT_EDITOR_SETTINGS)}>Reset to default</PineButton>
        <span style={{ flex: 1 }} />
        <PineButton p={p} strongBorder onClick={onCancel}>Cancel</PineButton>
        <PineButton p={p} kind="primary" onClick={() => onOk(v)}>Ok</PineButton>
      </div>
    </Frame>
  );
}

// --- Version history ---
export function VersionHistoryDialog({ p, name, versions, onOpen, onClose }: { p: PinePalette; name: string; versions: { code: string; savedAt: number }[]; onOpen: (index: number) => void; onClose: () => void }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <Frame p={p} title="Version history" onClose={onClose} width={480} height={520} testId="pine-versions">
      <div style={{ padding: "0 20px 8px", fontSize: 14, color: p.muted }}>{name}</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: `1px solid ${p.border}`, paddingBottom: 12 }}>
        {versions.map((v, i) => i).reverse().map(i => (
          <div key={i} role="option" aria-selected={false} tabIndex={0} onClick={() => onOpen(i)} onKeyDown={e => { if (e.key === "Enter") onOpen(i); }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, padding: "0 20px", cursor: "pointer", background: hover === i ? p.hover : "transparent" }}>
            <span style={{ fontSize: 14 }}>Version {i + 1}.0{i === versions.length - 1 ? <span style={{ color: p.muted }}> (current)</span> : null}</span>
            <span style={{ fontSize: 12, color: p.muted }}>{formatStamp(versions[i].savedAt)}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function formatStamp(ts: number) {
  const d = new Date(ts), z = (n: number) => String(n).padStart(2, "0");
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

// --- Keyboard shortcuts ---
const SHORTCUTS: [string, string[]][] = [
  ["Add to chart / Update on chart", ["Ctrl", "Enter"]],
  ["Save script", ["Ctrl", "S"]],
  ["Open script", ["Ctrl", "O"]],
  ["New indicator", ["Ctrl + K", "Ctrl + I"]],
  ["New strategy", ["Ctrl + K", "Ctrl + S"]],
  ["Command palette", ["F1"]],
  ["Trigger suggestions", ["Ctrl", "Space"]],
  ["Toggle line comment", ["Ctrl", "/"]],
  ["Find", ["Ctrl", "F"]],
  ["Replace", ["Ctrl", "H"]],
  ["Go to line", ["Ctrl", "G"]],
  ["Next problem", ["Alt", "F8"]],
  ["Previous problem", ["Shift", "Alt", "F8"]],
  ["Move line up / down", ["Alt", "↑ / ↓"]],
  ["Copy line up / down", ["Shift", "Alt", "↑ / ↓"]],
  ["Delete line", ["Ctrl", "Shift", "K"]],
  ["Indent / outdent", ["Tab / Shift + Tab"]],
  ["Undo / redo", ["Ctrl", "Z / Y"]],
  ["Open reference for keyword", ["Ctrl", "Click"]],
];
export function KeyboardShortcutsDialog({ p, onClose }: { p: PinePalette; onClose: () => void }) {
  return (
    <Frame p={p} title="Keyboard shortcuts" onClose={onClose} width={520} height={620} testId="pine-shortcuts">
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", borderTop: `1px solid ${p.border}`, padding: "8px 0 16px" }}>
        {SHORTCUTS.map(([label, keys]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 40, padding: "0 20px", fontSize: 14 }}>
            <span>{label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {keys.map((k, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ color: p.muted, fontSize: 12 }}>{keys[0].includes("+") ? "," : "+"}</span>}
                  <span style={{ minWidth: 24, height: 24, padding: "0 6px", borderRadius: 4, border: `1px solid ${p.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>{k}</span>
                </React.Fragment>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

// --- Notices ---
export function StrategyReportEmptyDialog({ p, onClose }: { p: PinePalette; onClose: () => void }) {
  return (
    <Frame p={p} title="Strategy report is empty" onClose={onClose} width={480} testId="pine-report-empty">
      <p style={{ margin: 0, padding: "0 20px", fontSize: 16, lineHeight: "24px" }}>
        To help the community get the most from your strategy, it needs a backtest report with closed trades. Before publishing, check the strategy&apos;s logic and the Strategy report to confirm that it simulates trades.{" "}
        <a href="https://www.tradingview.com/pine-script-docs/concepts/strategies/" target="_blank" rel="noopener noreferrer" style={{ color: p.blue, textDecoration: "none" }}>Learn more</a>.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "32px 20px 20px" }}>
        <PineButton p={p} kind="primary" onClick={onClose} autoFocus>Back to editor</PineButton>
      </div>
    </Frame>
  );
}

export function ConfirmDialog({ p, title, text, confirm, cancel = "Cancel", extra, onCancel, onConfirm, onExtra }: {
  p: PinePalette; title: string; text: React.ReactNode; confirm: string; cancel?: string; extra?: string; onCancel: () => void; onConfirm: () => void; onExtra?: () => void;
}) {
  return (
    <Frame p={p} title={title} onClose={onCancel} width={440} testId="pine-confirm">
      <div style={{ padding: "0 20px", fontSize: 16, lineHeight: "24px" }}>{text}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "28px 20px 20px" }}>
        {extra && onExtra && <><PineButton p={p} onClick={onExtra}>{extra}</PineButton><span style={{ flex: 1 }} /></>}
        <PineButton p={p} onClick={onCancel}>{cancel}</PineButton>
        <PineButton p={p} kind="primary" onClick={onConfirm} autoFocus>{confirm}</PineButton>
      </div>
    </Frame>
  );
}
