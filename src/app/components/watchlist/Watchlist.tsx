"use client";

// The watchlist, as on TradingView: the list's name (its menu: copy, rename, add section, clear,
// new list, upload, open), Add symbol, and the columns / symbol-display menu; sortable column
// headers; sections; rows with colour flags, a right-click menu, drag to reorder, arrow keys.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SymbolSearch from "../SymbolSearch";
import { Popover, MenuItem, MenuDivider, Tip, SymbolAvatar } from "../../trading/ui";
import { useEscapeClose } from "../../lib/useEscapeClose";
import {
  watchlists, wl, activeList, listSymbols, sameSymbol, FLAG_COLORS,
  type FlagColor, type WlItem, type SortCol,
} from "./store";
import type { Quote } from "./data";

// Prices in the symbol's own precision: forex to 5 decimals (3 for yen pairs), the rest to 2
export function priceDecimals(sym: string, v: number) { return sym.includes("/") && !/^(BTC|ETH|XAU|XAG|SOL)/.test(sym) ? (v >= 20 ? 3 : 5) : 2; }
export function fmtPrice(sym: string, v: number) { const d = priceDecimals(sym, v); return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
const fmtSigned = (v: number, text: string) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${text}`;
export function fmtVolume(v?: number) {
  if (v == null) return "—";
  const a = Math.abs(v);
  for (const [s, u] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as [number, string][]) if (a >= s) return `${parseFloat((v / s).toPrecision(4))}${u}`;
  return String(Math.round(v));
}

type Row = { index: number; item: WlItem };

export default function Watchlist({ symbol, onSymbolChange, quotes }: { symbol: string; onSymbolChange?: (s: string) => void; quotes: Record<string, Quote> }) {
  const state = watchlists.useValue();
  const list = activeList(state);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [listMenu, setListMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; symbol?: string; sectionId?: string; index: number } | null>(null);
  const [dialog, setDialog] = useState<null | { kind: "rename" | "copy" | "new" } | { kind: "clear" } | { kind: "open" }>(null);
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  // Drag and drop (not while sorted): refs carry the drag, state only draws the drop line — and
  // is set after dragstart, since changing the DOM inside dragstart cancels the drag in Chrome
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const dragRef = useRef<{ from: number | null; to: number | null }>({ from: null, to: null });
  const startDrag = (index: number) => { dragRef.current = { from: index, to: null }; setTimeout(() => setDragFrom(index), 0); };
  const overDrag = (index: number) => { if (dragRef.current.from === null) return; dragRef.current.to = index; setDropAt(index); };
  const endDrag = () => { dragRef.current = { from: null, to: null }; setDragFrom(null); setDropAt(null); };
  const canDrag = !state.sort;
  const listBtn = useRef<HTMLButtonElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeCtx = React.useCallback(() => setCtx(null), []);
  useEscapeClose(closeCtx, !!ctx);

  // Shift+W (page shortcut) opens "Open list…"
  useEffect(() => {
    const open = () => { (window as any).__tvOpenListPending = false; setDialog({ kind: "open" }); };
    if ((window as any).__tvOpenListPending) open();
    window.addEventListener("tv:open-list-dialog", open);
    return () => window.removeEventListener("tv:open-list-dialog", open);
  }, []);
  // Alt+W (page shortcut) adds the chart's symbol
  useEffect(() => {
    const add = (e: Event) => wl.addSymbol((e as CustomEvent).detail || symbol);
    window.addEventListener("tv:add-to-watchlist", add);
    return () => window.removeEventListener("tv:add-to-watchlist", add);
  }, [symbol]);

  // Items in display order: sections keep their place; symbols sort within their section
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    let group: Row[] = [];
    const flush = () => {
      if (state.sort) {
        const { col, dir } = state.sort;
        const val = (r: Row) => {
          const s = (r.item as any).symbol as string; const q = quotes[s];
          return col === "symbol" ? s : col === "last" ? q?.close : col === "change" ? q?.change : col === "changePct" ? q?.percentChange : q?.volume;
        };
        group.sort((a, b) => {
          const va = val(a), vb = val(b);
          if (va == null) return 1; if (vb == null) return -1;
          return (typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * dir;
        });
      }
      out.push(...group); group = [];
    };
    let collapsed = false;
    list.items.forEach((item, index) => {
      if (item.kind === "section") { flush(); out.push({ index, item }); collapsed = !!item.collapsed; return; }
      if (!collapsed) group.push({ index, item });
    });
    flush();
    return out;
  }, [list.items, state.sort, quotes]);
  const symbolRows = rows.filter(r => r.item.kind === "symbol").map(r => (r.item as any).symbol as string);

  const select = (s: string) => { setSelected(s); onSymbolChange?.(s); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const i = selected ? symbolRows.findIndex(s => sameSymbol(s, selected)) : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = symbolRows[Math.max(0, Math.min(symbolRows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) { select(next); bodyRef.current?.querySelector(`[data-row="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" }); }
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      const after = symbolRows[i + 1] || symbolRows[i - 1] || null;
      wl.removeSymbol(selected); setSelected(after);
    } else if (e.key === "Enter" && e.altKey && selected) {
      e.preventDefault();
      wl.setFlag(selected, state.flags[selected] ? null : state.lastFlag);
    }
  };

  const cols = state.columns;
  const grid = `10px minmax(0, 1.6fr)${cols.last ? " minmax(0, 1.1fr)" : ""}${cols.change ? " minmax(0, 0.9fr)" : ""}${cols.changePct ? " minmax(0, 0.9fr)" : ""}${cols.volume ? " minmax(0, 0.9fr)" : ""}`;
  const header = (col: SortCol, label: string, right = true) => {
    const on = state.sort?.col === col;
    return (
      <button type="button" onClick={() => wl.cycleSort(col)} aria-label={`Sort by ${label}`}
        style={{ display: "flex", alignItems: "center", justifyContent: right ? "flex-end" : "flex-start", gap: 2, minWidth: 0, border: "none", background: "transparent", color: on ? "var(--tv-hdr-text)" : "var(--tv-legend-args)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: 0, whiteSpace: "nowrap", overflow: "hidden" }}>
        {label}{on && <span aria-hidden style={{ fontSize: 9 }}>{state.sort!.dir === -1 ? "▼" : "▲"}</span>}
      </button>
    );
  };

  const onUpload = async (file: File) => {
    const text = await file.text();
    wl.importText(file.name.replace(/\.[^.]+$/, "") || "Uploaded list", text);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, color: "var(--tv-hdr-text)" }}>
      {/* Header: the list's name and menu, Add symbol, columns menu */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, height: 44, padding: "0 6px 0 8px", flexShrink: 0 }}>
        <Tip text="Watchlist menu" placement="bottom">
          <button ref={listBtn} type="button" className={`tv-bb-btn ${listMenu ? "active" : ""}`} aria-label="Watchlist menu" onClick={() => setListMenu(o => !o)}
            style={{ gap: 4, fontSize: 15, fontWeight: 700, padding: "0 6px", maxWidth: 170 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{list.name}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d={listMenu ? "M2.5 7.5L6 4l3.5 3.5" : "M2.5 4.5L6 8l3.5-3.5"} /></svg>
          </button>
        </Tip>
        <div style={{ flex: 1 }} />
        <Tip text="Add symbol" placement="bottom">
          <button type="button" className="tv-bb-btn" aria-label="Add symbol" style={{ width: 32, padding: 0 }} onClick={() => setShowSearch(true)}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M11 4v14M4 11h14" /></svg>
          </button>
        </Tip>
        <Tip text="More" placement="bottom">
          <button ref={moreBtn} type="button" className={`tv-bb-btn ${moreMenu ? "active" : ""}`} aria-label="Watchlist settings" style={{ width: 32, padding: 0 }} onClick={() => setMoreMenu(o => !o)}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden><circle cx="5.5" cy="11" r="1.4" /><circle cx="11" cy="11" r="1.4" /><circle cx="16.5" cy="11" r="1.4" /></svg>
          </button>
        </Tip>
      </div>

      {/* List menu */}
      <Popover anchor={listBtn.current} open={listMenu} onClose={() => setListMenu(false)} width={250}>
        <MenuItem icon={<CopyIcon />} onClick={() => { setListMenu(false); setDialog({ kind: "copy" }); }}>Make a copy…</MenuItem>
        <MenuItem icon={<PencilIcon />} onClick={() => { setListMenu(false); setDialog({ kind: "rename" }); }}>Rename</MenuItem>
        <MenuItem icon={<SectionIcon />} onClick={() => { setListMenu(false); const id = wl.addSection(0); setRenamingSection(id); }}>Add section</MenuItem>
        <MenuItem icon={<BroomIcon />} onClick={() => { setListMenu(false); setDialog({ kind: "clear" }); }}>Clear list</MenuItem>
        <MenuDivider />
        <MenuItem icon={<NewListIcon />} onClick={() => { setListMenu(false); setDialog({ kind: "new" }); }}>Create new list…</MenuItem>
        <MenuItem icon={<UploadIcon />} onClick={() => { setListMenu(false); fileRef.current?.click(); }}>Upload list…</MenuItem>
        <MenuDivider />
        <MenuItem icon={<FolderIcon />} right={<span style={{ fontSize: 12, opacity: 0.6 }}>Shift + W</span>} onClick={() => { setListMenu(false); setDialog({ kind: "open" }); }}>Open list…</MenuItem>
      </Popover>
      <input ref={fileRef} type="file" accept=".txt,.csv,text/plain" style={{ display: "none" }} aria-label="Upload list"
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />

      {/* Columns and symbol display */}
      <Popover anchor={moreBtn.current} open={moreMenu} onClose={() => setMoreMenu(false)} align="right" width={230}>
        <MenuHeading>Customize columns</MenuHeading>
        <CheckRow label="Last" on={cols.last} onToggle={() => wl.setColumns({ last: !cols.last })} />
        <CheckRow label="Change" on={cols.change} onToggle={() => wl.setColumns({ change: !cols.change })} />
        <CheckRow label="Change %" on={cols.changePct} onToggle={() => wl.setColumns({ changePct: !cols.changePct })} />
        <CheckRow label="Volume" on={cols.volume} onToggle={() => wl.setColumns({ volume: !cols.volume })} />
        <MenuDivider />
        <MenuHeading>Symbol display</MenuHeading>
        <CheckRow label="Logo" on={state.display.logo} onToggle={() => wl.setDisplay({ logo: !state.display.logo })} />
        <CheckRow label="Symbol" radio on={state.display.label === "symbol"} onToggle={() => wl.setDisplay({ label: "symbol" })} />
        <CheckRow label="Name" radio on={state.display.label === "name"} onToggle={() => wl.setDisplay({ label: "name" })} />
      </Popover>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 6, alignItems: "center", height: 30, padding: "0 10px 0 0", borderBottom: "1px solid var(--tv-active-neutral)", flexShrink: 0 }}>
        <span aria-hidden />
        {header("symbol", "Symbol", false)}
        {cols.last && header("last", "Last")}
        {cols.change && header("change", "Chg")}
        {cols.changePct && header("changePct", "Chg%")}
        {cols.volume && header("volume", "Vol")}
      </div>

      {/* Rows */}
      <div ref={bodyRef} role="grid" aria-label="Watchlist" tabIndex={0} onKeyDown={onKeyDown}
        onDragOver={e => { if (dragRef.current.from !== null) e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); const { from, to } = dragRef.current; if (from !== null && to !== null && to !== from) wl.move(from, to); endDrag(); }}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", outline: "none" }}>
        {rows.map(({ index, item }) => item.kind === "section" ? (
          <SectionRow key={item.id} name={item.name} collapsed={!!item.collapsed} renaming={renamingSection === item.id}
            dropBefore={dropAt === index}
            onToggle={() => wl.toggleSection(item.id)}
            onRename={name => { wl.renameSection(item.id, name.toUpperCase()); setRenamingSection(null); }}
            onStartRename={() => setRenamingSection(item.id)}
            onContext={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, sectionId: item.id, index }); }}
            canDrag={canDrag} onDragStart={() => startDrag(index)} onDragOverRow={() => overDrag(index)} onDragEnd={endDrag} />
        ) : (
          <SymbolRow key={item.symbol} sym={item.symbol} quote={quotes[item.symbol]} grid={grid} cols={cols} display={state.display}
            flag={state.flags[item.symbol]} active={sameSymbol(item.symbol, symbol)} selected={!!selected && sameSymbol(item.symbol, selected)}
            dropBefore={dropAt === index}
            onSelect={() => select(item.symbol)}
            onRemove={() => wl.removeSymbol(item.symbol)}
            onContext={e => { e.preventDefault(); setSelected(item.symbol); setCtx({ x: e.clientX, y: e.clientY, symbol: item.symbol, index }); }}
            canDrag={canDrag} onDragStart={() => startDrag(index)} onDragOverRow={() => overDrag(index)} onDragEnd={endDrag} />
        ))}
        {dragFrom !== null && <div onDragOver={e => { e.preventDefault(); overDrag(list.items.length); }} style={{ height: 24, borderTop: dropAt === list.items.length ? "2px solid var(--tv-color-accent)" : undefined }} />}
        {list.items.length === 0 && (
          <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: "var(--tv-legend-args)" }}>
            This list is empty.<br />
            <button type="button" onClick={() => setShowSearch(true)} style={{ marginTop: 8, border: "none", background: "none", color: "var(--tv-color-accent)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Add symbol</button>
          </div>
        )}
      </div>

      {/* Right-click menu */}
      {ctx && createPortal(
        <ContextMenu at={ctx} onClose={closeCtx}>
          {ctx.symbol ? (
            <>
              <div style={{ padding: "4px 12px 2px 44px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14 }}>
                <span>Flag/Unflag {ctx.symbol}</span><span style={{ fontSize: 12, opacity: 0.6 }}>Alt + ↵</span>
              </div>
              <div role="group" aria-label="Flag colour" style={{ display: "flex", gap: 10, padding: "8px 12px 8px 44px" }}>
                {FLAG_COLORS.map(f => {
                  const on = state.flags[ctx.symbol!] === f.id;
                  return (
                    <button key={f.id} type="button" aria-label={`Flag ${f.id}`} aria-pressed={on}
                      onClick={() => { wl.setFlag(ctx.symbol!, on ? null : f.id as FlagColor); closeCtx(); }}
                      style={{ width: 14, height: 14, borderRadius: "50%", border: on ? "2px solid var(--tv-hdr-text)" : "none", background: f.hex, cursor: "pointer", padding: 0 }} />
                  );
                })}
              </div>
              <MenuItem onClick={() => { wl.unflagAll(); closeCtx(); }}>Unflag all symbols</MenuItem>
              <MenuDivider />
              {state.lists.length > 1 && (
                <SubMenu label={`Add ${ctx.symbol} to watchlist`} icon={<NewListIcon />}>
                  {state.lists.filter(l => l.id !== list.id).map(l => (
                    <MenuItem key={l.id} onClick={() => { wl.addSymbol(ctx.symbol!, l.id); closeCtx(); }}>{l.name}</MenuItem>
                  ))}
                </SubMenu>
              )}
              <MenuItem icon={<PencilIcon />} onClick={() => { const s = ctx.symbol!; closeCtx(); onSymbolChange?.(s); wl.setDetails({ notes: true }); window.dispatchEvent(new CustomEvent("tv:edit-note", { detail: s })); }}>Add note for {ctx.symbol}</MenuItem>
              <MenuDivider />
              <MenuItem icon={<SectionIcon />} onClick={() => { const id = wl.addSection(ctx.index); closeCtx(); setRenamingSection(id); }}>Add section</MenuItem>
              <MenuItem icon={<PlusIcon />} onClick={() => { closeCtx(); setShowSearch(true); }}>Add symbol</MenuItem>
              <MenuItem danger icon={<RemoveIcon />} right={<span style={{ fontSize: 12, opacity: 0.6 }}>Del</span>} onClick={() => { wl.removeSymbol(ctx.symbol!); closeCtx(); }}>Remove from watchlist</MenuItem>
            </>
          ) : (
            <>
              <MenuItem icon={<PencilIcon />} onClick={() => { setRenamingSection(ctx.sectionId!); closeCtx(); }}>Rename section</MenuItem>
              <MenuItem icon={<SectionIcon />} onClick={() => { const id = wl.addSection(ctx.index); closeCtx(); setRenamingSection(id); }}>Add section</MenuItem>
              <MenuItem danger icon={<RemoveIcon />} onClick={() => { wl.removeSection(ctx.sectionId!); closeCtx(); }}>Remove section</MenuItem>
            </>
          )}
        </ContextMenu>,
        document.body,
      )}

      {showSearch && (
        <SymbolSearch onClose={() => setShowSearch(false)} onSelect={s => { wl.addSymbol(s); onSymbolChange?.(s); setShowSearch(false); }} />
      )}

      {dialog && (dialog.kind === "rename" || dialog.kind === "copy" || dialog.kind === "new") && (
        <PromptDialog
          title={dialog.kind === "rename" ? "Rename" : dialog.kind === "copy" ? "Make a copy" : "Create new list"}
          initial={dialog.kind === "rename" ? list.name : dialog.kind === "copy" ? `${list.name} copy` : ""}
          placeholder="List name"
          onCancel={() => setDialog(null)}
          onSave={name => {
            if (dialog.kind === "rename") wl.rename(list.id, name);
            else if (dialog.kind === "copy") wl.copy(name);
            else wl.create(name);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "clear" && (
        <ConfirmDialog title="Clear list" text={`Remove all symbols and sections from “${list.name}”?`} confirm="Clear"
          onCancel={() => setDialog(null)} onConfirm={() => { wl.clear(list.id); setDialog(null); }} />
      )}
      {dialog?.kind === "open" && <OpenListDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

// --- Rows ---

function SymbolRow({ sym, quote, grid, cols, display, flag, active, selected, dropBefore, onSelect, onRemove, onContext, canDrag, onDragStart, onDragOverRow, onDragEnd }: {
  sym: string; quote?: Quote; grid: string; cols: { last: boolean; change: boolean; changePct: boolean; volume: boolean };
  display: { logo: boolean; label: "symbol" | "name" }; flag?: FlagColor; active: boolean; selected: boolean; dropBefore: boolean;
  onSelect: () => void; onRemove: () => void; onContext: (e: React.MouseEvent) => void; canDrag: boolean; onDragStart: () => void; onDragOverRow: () => void; onDragEnd: () => void;
}) {
  const [hover, setHover] = useState(false);
  const up = (quote?.change ?? 0) >= 0;
  const color = quote ? (up ? "var(--tv-color-bull, #089981)" : "var(--tv-color-bear, #f23645)") : undefined;
  const flagHex = flag ? FLAG_COLORS.find(f => f.id === flag)?.hex : undefined;
  const label = display.label === "name" && quote?.name ? quote.name : sym;
  const last = quote ? fmtPrice(sym, quote.close) : "…";
  const decimals = quote ? priceDecimals(sym, quote.close) : 2;
  return (
    <div role="row" data-row={sym} aria-selected={selected} draggable={canDrag}
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", sym); onDragStart(); }}
      onDragOver={e => { e.preventDefault(); onDragOverRow(); }} onDragEnd={onDragEnd}
      onClick={onSelect} onContextMenu={onContext} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", display: "grid", gridTemplateColumns: grid, gap: 6, alignItems: "center", height: 32, padding: "0 10px 0 0",
        fontSize: 14, cursor: "pointer", fontVariantNumeric: "tabular-nums",
        background: selected ? "rgba(41, 98, 255, 0.18)" : hover ? "var(--tv-hover-neutral)" : "transparent",
        boxShadow: active && !selected ? "inset 0 0 0 1px var(--tv-hdr-text)" : undefined, borderRadius: active && !selected ? 4 : 0,
        borderTop: dropBefore ? "2px solid var(--tv-color-accent)" : undefined,
      }}>
      <span aria-label={flag ? `Flagged ${flag}` : undefined} style={{ alignSelf: "stretch", width: 4, background: flagHex || "transparent" }} />
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {display.logo && <SymbolAvatar symbol={sym} size={18} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{label}</span>
        {quote && <span title={quote.isMarketOpen ? "Market open" : "Market closed"} style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: quote.isMarketOpen ? "#089981" : "var(--tv-legend-args)" }} />}
      </span>
      {cols.last && (
        <span style={{ textAlign: "right", whiteSpace: "nowrap", overflow: "hidden" }}>
          {decimals >= 3 ? <>{last.slice(0, -1)}<sup style={{ fontSize: 9 }}>{last.slice(-1)}</sup></> : last}
        </span>
      )}
      {cols.change && <span style={{ textAlign: "right", color, whiteSpace: "nowrap", overflow: "hidden" }}>{quote ? fmtSigned(quote.change, fmtPrice(sym, Math.abs(quote.change))) : ""}</span>}
      {cols.changePct && <span style={{ textAlign: "right", color, whiteSpace: "nowrap", overflow: "hidden" }}>{quote ? `${fmtSigned(quote.percentChange, Math.abs(quote.percentChange).toFixed(2))}%` : ""}</span>}
      {cols.volume && <span style={{ textAlign: "right", whiteSpace: "nowrap", overflow: "hidden" }}>{quote ? fmtVolume(quote.volume) : ""}</span>}
      {hover && (
        <button type="button" aria-label={`Remove ${sym}`} title="Remove from watchlist" onClick={e => { e.stopPropagation(); onRemove(); }}
          className="tv-bb-btn" style={{ position: "absolute", right: 4, top: 4, width: 24, height: 24, minWidth: 24, padding: 0, background: "var(--tv-color-pane-bg)" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M3 3l8 8M11 3l-8 8" /></svg>
        </button>
      )}
    </div>
  );
}

function SectionRow({ name, collapsed, renaming, dropBefore, onToggle, onRename, onStartRename, onContext, canDrag, onDragStart, onDragOverRow, onDragEnd }: {
  name: string; collapsed: boolean; renaming: boolean; dropBefore: boolean;
  onToggle: () => void; onRename: (n: string) => void; onStartRename: () => void; onContext: (e: React.MouseEvent) => void; canDrag: boolean; onDragStart: () => void; onDragOverRow: () => void; onDragEnd: () => void;
}) {
  const [value, setValue] = useState(name);
  useEffect(() => { if (renaming) setValue(name); }, [renaming, name]);
  return (
    <div role="row" draggable={canDrag && !renaming} onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", name); onDragStart(); }}
      onDragOver={e => { e.preventDefault(); onDragOverRow(); }} onDragEnd={onDragEnd}
      onClick={() => !renaming && onToggle()} onDoubleClick={onStartRename} onContextMenu={onContext}
      style={{ display: "flex", alignItems: "center", gap: 4, height: 30, padding: "0 10px", fontSize: 12, fontWeight: 600, letterSpacing: "0.4px", color: "var(--tv-legend-args)", cursor: "pointer", borderTop: dropBefore ? "2px solid var(--tv-color-accent)" : undefined }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden style={{ transform: collapsed ? "none" : "rotate(90deg)", transition: "transform 0.1s" }}><path d="M3.5 2L7 5 3.5 8" /></svg>
      {renaming ? (
        <input autoFocus aria-label="Section name" value={value} onChange={e => setValue(e.target.value)} onClick={e => e.stopPropagation()}
          onBlur={() => onRename(value.trim() || name)} onKeyDown={e => { if (e.key === "Enter") onRename(value.trim() || name); if (e.key === "Escape") onRename(name); }}
          style={{ flex: 1, minWidth: 0, height: 22, border: "1px solid var(--tv-color-accent)", borderRadius: 4, padding: "0 6px", fontSize: 12, fontWeight: 600, background: "transparent", color: "var(--tv-hdr-text)", textTransform: "uppercase", outline: "none" }} />
      ) : name}
    </div>
  );
}

// --- Menus and dialogs ---

export const MenuHeading = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 600, letterSpacing: "0.4px", color: "var(--tv-legend-args)", textTransform: "uppercase" }}>{children}</div>
);
export function CheckRow({ label, on, radio, onToggle }: { label: string; on: boolean; radio?: boolean; onToggle: () => void }) {
  return (
    <button type="button" role={radio ? "menuitemradio" : "menuitemcheckbox"} aria-checked={on} onClick={onToggle} className="tv-menu-row" style={{ height: 34, gap: 10 }}>
      <span aria-hidden style={{
        width: 16, height: 16, borderRadius: radio ? "50%" : 3, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${on ? "var(--tv-hdr-text)" : "var(--tv-legend-args)"}`, background: on && !radio ? "var(--tv-hdr-text)" : "transparent",
      }}>
        {on && (radio
          ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--tv-hdr-text)" }} />
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--tv-color-pane-bg)" strokeWidth="1.6"><path d="M2 5.2l2 2L8 3" /></svg>)}
      </span>
      {label}
    </button>
  );
}

function ContextMenu({ at, onClose, children }: { at: { x: number; y: number }; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    setPos({ left: Math.min(at.x, window.innerWidth - w - 8), top: Math.min(at.y, window.innerHeight - h - 8) });
  }, [at]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [onClose]);
  return (
    <div ref={ref} role="menu" style={{ position: "fixed", ...pos, zIndex: 15000, minWidth: 250, padding: "6px 0", background: "var(--tv-color-pane-bg)", color: "var(--tv-hdr-text)", border: "1px solid var(--tv-color-border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
      {children}
    </div>
  );
}

function SubMenu({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <MenuItem icon={icon} right={<span style={{ opacity: 0.6 }}>›</span>} onClick={() => setOpen(o => !o)}>{label}</MenuItem>
      {open && (
        <div role="menu" style={{ position: "absolute", right: "100%", top: 0, minWidth: 180, padding: "6px 0", background: "var(--tv-color-pane-bg)", border: "1px solid var(--tv-color-border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.18)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function DialogFrame({ title, onClose, children, width = 380 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEscapeClose(onClose);
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label={title} style={{ width, maxWidth: "100%", background: "var(--tv-color-pane-bg)", color: "var(--tv-hdr-text)", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 16px 12px 20px" }}>
          <span style={{ fontSize: 20, fontWeight: 600 }}>{title}</span>
          <button type="button" aria-label="Close" onClick={onClose} className="tv-legend-btn" style={{ width: 28, height: 28 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden><path d="M3.5 3.5l11 11M14.5 3.5l-11 11" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
const btn = (primary: boolean, enabled = true): React.CSSProperties => ({
  height: 34, padding: "0 14px", borderRadius: 6, fontSize: 14, fontFamily: "inherit", cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.5,
  border: primary ? "none" : "1px solid var(--tv-hdr-text)", background: primary ? "var(--tv-hdr-text)" : "transparent", color: primary ? "var(--tv-color-pane-bg)" : "var(--tv-hdr-text)",
});

function PromptDialog({ title, initial, placeholder, onCancel, onSave }: { title: string; initial: string; placeholder: string; onCancel: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  const ok = v.trim().length > 0;
  return (
    <DialogFrame title={title} onClose={onCancel}>
      <div style={{ padding: "0 20px 16px" }}>
        <input autoFocus aria-label={placeholder} value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && ok) onSave(v.trim()); }}
          style={{ width: "100%", boxSizing: "border-box", height: 36, borderRadius: 6, border: "1px solid var(--tv-color-accent)", padding: "0 10px", fontSize: 14, background: "transparent", color: "inherit", outline: "none" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 20px 18px", borderTop: "1px solid var(--tv-color-border)" }}>
        <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>
        <button type="button" disabled={!ok} onClick={() => onSave(v.trim())} style={btn(true, ok)}>Save</button>
      </div>
    </DialogFrame>
  );
}

function ConfirmDialog({ title, text, confirm, onCancel, onConfirm }: { title: string; text: string; confirm: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <DialogFrame title={title} onClose={onCancel}>
      <p style={{ margin: 0, padding: "0 20px 18px", fontSize: 14, lineHeight: "20px" }}>{text}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 20px 18px", borderTop: "1px solid var(--tv-color-border)" }}>
        <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>
        <button type="button" onClick={onConfirm} style={btn(true)}>{confirm}</button>
      </div>
    </DialogFrame>
  );
}

function OpenListDialog({ onClose }: { onClose: () => void }) {
  const state = watchlists.useValue();
  const [q, setQ] = useState("");
  const lists = state.lists.filter(l => l.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <DialogFrame title="Watchlists" onClose={onClose} width={420}>
      <div style={{ padding: "0 20px 10px" }}>
        <input autoFocus aria-label="Search lists" value={q} placeholder="Search" onChange={e => setQ(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", height: 36, borderRadius: 6, border: "1px solid var(--tv-color-border)", padding: "0 10px", fontSize: 14, background: "transparent", color: "inherit", outline: "none" }} />
      </div>
      <div role="listbox" aria-label="Watchlists" style={{ maxHeight: 360, overflowY: "auto", paddingBottom: 12 }}>
        {lists.map(l => (
          <div key={l.id} role="option" aria-selected={l.id === state.activeId} className="tv-menu-row" style={{ cursor: "pointer", background: l.id === state.activeId ? "var(--tv-hover-neutral)" : undefined }}
            onClick={() => { wl.open(l.id); onClose(); }}>
            <span style={{ flex: 1, fontWeight: l.id === state.activeId ? 600 : 400 }}>{l.name}</span>
            <span style={{ fontSize: 12, color: "var(--tv-legend-args)" }}>{listSymbols(l).length} symbols</span>
            {state.lists.length > 1 && (
              <button type="button" aria-label={`Delete ${l.name}`} className="tv-legend-btn" style={{ width: 26, height: 26 }}
                onClick={e => { e.stopPropagation(); wl.remove(l.id); }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden><path d="M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.7 9h6.6l.7-9" /></svg>
              </button>
            )}
          </div>
        ))}
        {lists.length === 0 && <div style={{ padding: "12px 20px", fontSize: 13, color: "var(--tv-legend-args)" }}>No lists match</div>}
      </div>
    </DialogFrame>
  );
}

// Icons (22px outlines)
const i22 = { width: 22, height: 22, viewBox: "0 0 22 22", fill: "none", stroke: "currentColor", strokeWidth: 1.1, "aria-hidden": true } as const;
const CopyIcon = () => <svg {...i22}><path d="M7.5 7.5h10v10h-10zM4.5 14.5v-10h10" /></svg>;
const PencilIcon = () => <svg {...i22}><path d="M4.5 17.5l1-4 9-9 3 3-9 9zM13 6l3 3" /></svg>;
const SectionIcon = () => <svg {...i22}><path d="M3.5 7.5h15M3.5 14.5h4M9.5 14.5h3M14.5 14.5h4" /></svg>;
const BroomIcon = () => <svg {...i22}><path d="M14 3.5l-3.5 7M7 10.5h7l1.5 8h-10z" /></svg>;
const NewListIcon = () => <svg {...i22}><path d="M3.5 4.5h15v13h-15zM7 8.5h8M7 11.5h8M7 14.5h4" /></svg>;
const UploadIcon = () => <svg {...i22}><path d="M11 15V4.5M7 8.5L11 4.5l4 4M4.5 14v4h13v-4" /></svg>;
const FolderIcon = () => <svg {...i22}><path d="M3.5 6.5v11h15v-9h-7l-2-2h-6z" /></svg>;
const PlusIcon = () => <svg {...i22}><path d="M11 4.5v13M4.5 11h13" /></svg>;
const RemoveIcon = () => <svg {...i22}><path d="M5 5l12 12M17 5L5 17" /></svg>;
