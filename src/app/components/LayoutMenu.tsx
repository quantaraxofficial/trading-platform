"use client";

// The header's layout control, as on TradingView: the layout's name (click to save it; its
// tooltip says whether changes are saved) and "Manage layouts": Save layout, Autosave, Share
// layout, Make a copy…, Rename…, Download chart data…, Create new layout…, the recently used
// layouts and Open layout… (".").

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tip, TipKey, Popover, ChevronDown, ChevronUp, C } from "../trading/ui";
import { useEscapeClose } from "../lib/useEscapeClose";
import { layoutStore, layouts, isDirty, shareLink, type SavedLayout } from "../lib/layoutStore";
import { isTypingTarget } from "../lib/isTypingTarget";
import { Copy, Pencil, Download, Plus, FolderOpen, Search, Trash2, ArrowDownAZ, ArrowUpAZ, Link2 } from "lucide-react";

export function readLayoutName(): string {
  try { return layoutStore.get().working?.name || localStorage.getItem("tv:layoutName") || "Unnamed"; } catch { return "Unnamed"; }
}

const MINUTES: Record<string, string> = { "1min": "1", "5min": "5", "15min": "15", "30min": "30", "45min": "45", "1h": "60", "2h": "120", "4h": "240", "1day": "1D", "1week": "1W", "1month": "1M" };
const activeCell = (l: SavedLayout) => l.cells[l.active] || l.cells[0];

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    // (a span: it sits inside the menu row's own button)
    <span role="switch" aria-checked={on} aria-label={label} onClick={e => { e.stopPropagation(); onChange(!on); }}
      style={{ position: "relative", display: "inline-block", flexShrink: 0, width: 38, height: 20, borderRadius: 10, cursor: "pointer", background: on ? "var(--tv-hdr-text)" : "var(--tv-color-border)" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 14, height: 14, borderRadius: "50%", background: "var(--tv-color-pane-bg)", transition: "left .15s" }} />
    </span>
  );
}

export default function LayoutMenu() {
  const s = layoutStore.useValue();
  const w = s.working;
  const name = w?.name || "Unnamed";
  const dirty = isDirty(s);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "rename" | "copy" | "download" | "open">(null);
  const [copied, setCopied] = useState(false);
  const chevRef = useRef<HTMLButtonElement>(null);

  const save = () => { layouts.save(); window.dispatchEvent(new CustomEvent("tv:save-chart")); };
  // Ctrl+S (the page saves the chart; the layout goes with it) and "." for Open layout…
  useEffect(() => {
    const onSaved = () => layouts.save();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "." && !e.ctrlKey && !e.altKey && !e.metaKey && !isTypingTarget(e.target)) { e.preventDefault(); setDialog("open"); }
    };
    window.addEventListener("tv:layout-save", onSaved);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("tv:layout-save", onSaved); window.removeEventListener("keydown", onKey); };
  }, []);

  const recent = s.recent.map(id => s.layouts.find(l => l.id === id)).filter((l): l is SavedLayout => !!l).slice(0, 5);
  const row = (key: string, icon: React.ReactNode, label: React.ReactNode, onClick: () => void, right?: React.ReactNode, disabled = false) => (
    <button key={key} type="button" role="menuitem" disabled={disabled} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 32, padding: "0 12px", border: "none", background: "transparent", color: disabled ? "var(--tv-color-text-muted)" : "inherit", fontSize: 14, cursor: disabled ? "default" : "pointer", textAlign: "left", fontFamily: "inherit" }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "var(--tv-hover-neutral)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      {icon !== null && <span style={{ width: 18, display: "inline-flex", justifyContent: "center" }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {right}
    </button>
  );
  const sep = (k: string) => <div key={k} style={{ height: 1, background: "var(--tv-color-border)", margin: "4px 0" }} />;
  const ic = { size: 18, strokeWidth: 1.4 } as const;

  return (
    <>
      <Tip text={dirty ? "Save layout" : "All changes saved"} placement="bottom">
        <button type="button" className="tv-hdr-btn" onClick={save} style={{ maxWidth: 160, padding: "0 6px" }} aria-label={`Layout ${name}`}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        </button>
      </Tip>
      <Tip text="Manage layouts" placement="bottom">
        <button ref={chevRef} type="button" aria-label="Manage layouts" className={`tv-hdr-btn ${open ? "active" : ""}`} style={{ minWidth: 24, padding: "0 4px" }} onClick={() => setOpen(o => !o)}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </Tip>
      <Popover anchor={chevRef.current} open={open} onClose={() => setOpen(false)} align="right" width={260}>
        <div role="menu" aria-label="Manage layouts" style={{ padding: "4px 0" }}>
          {row("save", null, "Save layout", () => { setOpen(false); save(); }, <span style={{ fontSize: 12, opacity: 0.6 }}>Ctrl + S</span>, !dirty)}
          {row("autosave", null, "Autosave", () => layouts.setAutosave(!s.autosave), <Switch on={s.autosave} onChange={v => layouts.setAutosave(v)} label="Autosave" />)}
          {row("share", null, <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Share layout
            <Tip text="Anyone with the link can open a copy of this layout" placement="top" maxWidth={240}>
              <span style={{ display: "inline-flex", width: 14, height: 14, borderRadius: "50%", background: "var(--tv-color-text-muted)", color: "var(--tv-color-pane-bg)", fontSize: 10, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>i</span>
            </Tip></span>,
            () => layouts.update(l => ({ shared: !l.shared })), <Switch on={!!w?.shared} onChange={v => layouts.update({ shared: v })} label="Share layout" />)}
          {w?.shared && row("link", <Link2 {...ic} />, copied ? "Link copied" : "Copy link", () => {
            navigator.clipboard?.writeText(shareLink(w)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
          })}
          {row("copy", <Copy {...ic} />, "Make a copy…", () => { setOpen(false); setDialog("copy"); })}
          {row("rename", <Pencil {...ic} />, "Rename…", () => { setOpen(false); setDialog("rename"); })}
          {row("download", <Download {...ic} />, "Download chart data…", () => { setOpen(false); setDialog("download"); })}
          {sep("s1")}
          {row("new", <Plus {...ic} />, "Create new layout…", () => { setOpen(false); window.dispatchEvent(new CustomEvent("tv:layout-create")); })}
          {recent.length > 0 && sep("s2")}
          {recent.length > 0 && <div style={{ padding: "6px 12px 4px", fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: "var(--tv-color-text-muted)" }}>RECENTLY USED</div>}
          {recent.map(l => {
            const cur = l.id === s.currentId;
            const cell = activeCell(l);
            return (
              <button key={l.id} type="button" role="menuitemradio" aria-checked={cur} onClick={() => { setOpen(false); if (!cur) window.dispatchEvent(new CustomEvent("tv:layout-open", { detail: l.id })); }}
                style={{ display: "block", width: "calc(100% - 12px)", margin: "0 6px", padding: "6px 8px", border: "none", borderRadius: 6, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  background: cur ? "var(--tv-active-neutral)" : "transparent", color: "inherit" }}>
                <div style={{ fontSize: 14 }}>{l.name}</div>
                <div style={{ fontSize: 12, color: "var(--tv-color-text-muted)" }}>{cell.symbol.replace("/", "")}, {MINUTES[cell.interval] || cell.interval}</div>
              </button>
            );
          })}
          {sep("s3")}
          {row("open", <FolderOpen {...ic} />, "Open layout…", () => { setOpen(false); setDialog("open"); }, <span style={{ fontSize: 12, opacity: 0.6 }}>.</span>)}
        </div>
      </Popover>
      {dialog === "rename" && (
        <NameDialog title="Rename chart layout" action="Rename" initial={name} onClose={() => setDialog(null)} onSave={n => { layouts.rename(n); try { localStorage.setItem("tv:layoutName", n); } catch { /* ignore */ } setDialog(null); }} />
      )}
      {dialog === "copy" && (
        <NameDialog title="Copy chart layout" action="Copy" initial={`${name} copy`} onClose={() => setDialog(null)} onSave={n => { layouts.copy(n); setDialog(null); }} />
      )}
      {dialog === "download" && <DownloadDialog onClose={() => setDialog(null)} />}
      {dialog === "open" && <LayoutsDialog onClose={() => setDialog(null)} />}
    </>
  );
}

function Modal({ label, width = 400, onClose, children }: { label: string; width?: number; onClose: () => void; children: React.ReactNode }) {
  useEscapeClose(onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label={label} style={{ position: "relative", width, maxWidth: "100%", background: C.panel, color: C.text, borderRadius: 8, boxShadow: C.shadow, fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif" }}>
        <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 1l16 16M17 1L1 17" /></svg>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  height: 34, padding: "0 14px", borderRadius: 6, fontSize: 14, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  border: primary ? "none" : `1px solid ${C.field}`, background: primary ? (disabled ? C.seg : "var(--tv-trade-dark-btn)") : "transparent",
  color: primary ? (disabled ? C.faint : "var(--tv-trade-dark-btn-text)") : C.text,
});

// Rename / Make a copy: the layout name, pre-selected
function NameDialog({ title, action, initial, onClose, onSave }: { title: string; action: string; initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.select(), 30); return () => clearTimeout(t); }, []);
  const valid = value.trim().length > 0;
  return (
    <Modal label={title} onClose={onClose}>
      <div style={{ padding: "26px 40px 0", fontSize: 20, fontWeight: 600 }}>{title}</div>
      <div style={{ padding: "18px 40px 0" }}>
        <div style={{ fontSize: 13, color: C.faint, marginBottom: 6 }}>New layout name</div>
        <input ref={inputRef} autoFocus aria-label="New layout name" value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && valid) onSave(value.trim()); }}
          style={{ width: "100%", boxSizing: "border-box", height: 34, borderRadius: 6, border: `1px solid ${C.accent}`, padding: "0 10px", fontSize: 14, background: "transparent", color: C.text, outline: "none" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "24px 40px 28px" }}>
        <button type="button" onClick={onClose} style={btn(false)}>Cancel</button>
        <button type="button" disabled={!valid} onClick={() => onSave(value.trim())} style={btn(true, !valid)}>{action}</button>
      </div>
    </Modal>
  );
}

// Download chart data: the chart and the time format; the chart writes the CSV
function DownloadDialog({ onClose }: { onClose: () => void }) {
  const s = layoutStore.get();
  const cell = s.working ? activeCell(s.working) : null;
  const [format, setFormat] = useState<"iso" | "unix">("iso");
  const offset = (() => { const m = -new Date().getTimezoneOffset(); const sign = m >= 0 ? "+" : "-"; const a = Math.abs(m); return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`; })();
  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: 38, borderRadius: 6, border: `1px solid ${C.field}`, padding: "0 10px", fontSize: 14, background: "transparent", color: C.text, display: "flex", alignItems: "center" };
  return (
    <Modal label="Download chart data" width={480} onClose={onClose}>
      <div style={{ padding: "26px 40px 0", fontSize: 20, fontWeight: 600 }}>Download chart data</div>
      <div style={{ padding: "14px 40px 0", fontSize: 15, lineHeight: "22px" }}>All information from the selected chart, including the symbol &amp; indicators will be saved to a CSV file.</div>
      <div style={{ padding: "16px 40px 0" }}>
        <div style={{ fontSize: 13, color: C.faint, marginBottom: 6 }}>Chart</div>
        <div style={field}>{cell ? `${cell.symbol.replace("/", "")}, ${MINUTES[cell.interval] || cell.interval}` : "Chart"}</div>
        <div style={{ fontSize: 13, color: C.faint, margin: "14px 0 6px" }}>Time format ({offset})</div>
        <select aria-label="Time format" value={format} onChange={e => setFormat(e.target.value as any)} style={{ ...field, cursor: "pointer" }}>
          <option value="iso">ISO time</option>
          <option value="unix">UNIX timestamp</option>
        </select>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "24px 40px 28px" }}>
        <button type="button" onClick={onClose} style={btn(false)}>Cancel</button>
        <button type="button" onClick={() => { window.dispatchEvent(new CustomEvent("tv:download-chart-data", { detail: { format } })); onClose(); }} style={btn(true)}>Download</button>
      </div>
    </Modal>
  );
}

// Open layout: the saved layouts, searchable and sortable by name; the open one can't be removed
function LayoutsDialog({ onClose }: { onClose: () => void }) {
  const s = layoutStore.useValue();
  const [q, setQ] = useState("");
  const [desc, setDesc] = useState(false);
  const list = s.layouts
    .filter(l => l.name.toLowerCase().includes(q.toLowerCase()) || activeCell(l).symbol.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name));
  const when = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <Modal label="Layouts" width={480} onClose={onClose}>
      <div style={{ padding: "22px 20px 0", fontSize: 20, fontWeight: 600 }}>Layouts</div>
      <div style={{ padding: "14px 20px 8px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, borderRadius: 6, border: `1px solid ${C.field}`, padding: "0 10px" }}>
          <Search size={18} strokeWidth={1.4} />
          <input autoFocus aria-label="Search" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: C.text, fontSize: 14 }} />
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 34px 6px 34px", fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: C.faint }}>
        LAYOUT NAME
        <button type="button" aria-label="Sort by name" onClick={() => setDesc(d => !d)} style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", display: "flex" }}>
          {desc ? <ArrowUpAZ size={16} strokeWidth={1.4} /> : <ArrowDownAZ size={16} strokeWidth={1.4} />}
        </button>
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto", padding: "0 20px 16px" }}>
        {list.map(l => {
          const cur = l.id === s.currentId;
          const cell = activeCell(l);
          return (
            <div key={l.id} role="option" aria-selected={cur} className="tv-layout-row"
              onClick={() => { if (!cur) window.dispatchEvent(new CustomEvent("tv:layout-open", { detail: l.id })); onClose(); }}
              style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderRadius: 6, cursor: "pointer", background: cur ? "var(--tv-active-neutral)" : "transparent" }}
              onMouseEnter={e => { if (!cur) e.currentTarget.style.background = "var(--tv-hover-neutral)"; }}
              onMouseLeave={e => { if (!cur) e.currentTarget.style.background = "transparent"; }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{l.name}</div>
                <div style={{ fontSize: 12, color: C.faint }}>{cell.symbol.replace("/", "")}, {cell.intervalLabel} ({when(l.savedAt)})</div>
              </div>
              {!cur && (
                <button type="button" aria-label={`Remove ${l.name}`} onClick={e => { e.stopPropagation(); layouts.remove(l.id); }}
                  style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", opacity: 0.7, display: "flex" }}>
                  <Trash2 size={16} strokeWidth={1.4} />
                </button>
              )}
            </div>
          );
        })}
        {list.length === 0 && <div style={{ padding: 20, textAlign: "center", color: C.faint, fontSize: 14 }}>No layouts match</div>}
      </div>
    </Modal>
  );
}

export { TipKey };
