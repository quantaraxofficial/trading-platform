"use client";
// TradingView's "Object tree and data window" panel. The Object tree lists the chart's symbol,
// its indicators / strategy and its drawings — front-most first, groups as folders — with
// hide / lock / remove on each row, selection kept in step with the chart, right-click menus,
// drag-and-drop to change the visual order (and to move drawings into or out of a group), and a
// toolbar: Create a group of drawings, Clone / Copy, Move to, Manage layout drawings. The Data
// window tab shows the values of the bar under the crosshair.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDrawing, type BaseDrawing } from "../drawing/core/DrawingContext";
import { chartObjects, type ChartObject } from "../../lib/chartObjects";
import TvMenu, { type TvMenuItem } from "../ui/TvMenu";
import { Tip } from "../../trading/ui";
import { loadFavoriteIndicators, saveFavoriteIndicators } from "../../utils/favoriteIndicators";
import {
  MainSeriesIcon, IndicatorIcon, StrategyIcon, FolderIcon, GroupButtonIcon, CloneCopyIcon, MoveToIcon, ManageDrawingsIcon,
  EyeIcon, LockIcon, TrashIcon, Chevron, DrawingIcon, drawingTreeName, formatModified,
} from "./treeIcons";
import DataWindow from "./DataWindow";
import ManageDrawingsDialog from "./ManageDrawingsDialog";

type Row =
  | { kind: "object"; key: string; obj: ChartObject }
  | { kind: "group"; key: string; id: string; name: string; members: BaseDrawing[] }
  | { kind: "drawing"; key: string; d: BaseDrawing; depth: 0 | 1 };

const ROW_H = 38;
const isDarkTheme = () => typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark";

export default function ObjectTreePanel() {
  const [tab, setTab] = useState<"tree" | "data">(() => { try { return localStorage.getItem("tv:objectTreeTab") === "data" ? "data" : "tree"; } catch { return "tree"; } });
  useEffect(() => { try { localStorage.setItem("tv:objectTreeTab", tab); } catch { /* ignore */ } }, [tab]);
  const tabBtn = (id: "tree" | "data", label: string) => (
    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      style={{ flex: 1, minWidth: 0, height: 28, border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 8px",
        background: tab === id ? "var(--tv-color-pane-bg)" : "transparent", color: "var(--tv-color-text)", fontWeight: tab === id ? 600 : 400,
        boxShadow: tab === id ? "0 1px 2px rgba(0,0,0,0.15)" : "none" }}>{label}</button>
  );
  return (
    <div data-object-tree style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", background: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)" }}>
      <div style={{ padding: "12px 16px 8px" }}>
        <div role="tablist" aria-label="Object tree and data window" style={{ display: "flex", gap: 2, padding: 3, borderRadius: 8, background: "var(--tv-color-item-hover)" }}>
          {tabBtn("tree", "Object tree")}
          {tabBtn("data", "Data window")}
        </div>
      </div>
      {tab === "tree" ? <ObjectTree /> : <DataWindow />}
    </div>
  );
}

function ObjectTree() {
  const {
    drawings, applyDrawings, updateMultipleDrawings, deleteMultipleDrawings,
    selectedShapeId, setSelectedShapeId, selectedShapeIds, setSelectedShapeIds,
  } = useDrawing();
  const { objects, selectedId } = chartObjects.useValue();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: TvMenuItem[]; label: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const anchorRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isDark = isDarkTheme();

  const selIds = useMemo(() => selectedShapeIds.size ? Array.from(selectedShapeIds) : selectedShapeId ? [selectedShapeId] : [], [selectedShapeId, selectedShapeIds]);
  const selSet = useMemo(() => new Set(selIds), [selIds]);
  const select = (ids: string[]) => {
    chartObjects.set({ selectedId: null });
    if (ids.length === 1) { setSelectedShapeIds(new Set()); setSelectedShapeId(ids[0]); }
    else if (ids.length > 1) { setSelectedShapeId(null); setSelectedShapeIds(new Set(ids)); }
    else { setSelectedShapeId(null); setSelectedShapeIds(new Set()); }
  };

  // Tree order: front-most drawing first; a group sits where its front-most member is
  const front = useMemo(() => drawings.filter(d => d.type !== "measure").slice().reverse(), [drawings]);
  const rows: Row[] = useMemo(() => {
    const out: Row[] = objects.map(o => ({ kind: "object" as const, key: `o:${o.id}`, obj: o }));
    const seen = new Set<string>();
    for (const d of front) {
      if (d.group) {
        if (seen.has(d.group.id)) continue;
        seen.add(d.group.id);
        const members = front.filter(m => m.group?.id === d.group!.id);
        out.push({ kind: "group", key: `g:${d.group.id}`, id: d.group.id, name: d.group.name, members });
        if (!collapsed.has(d.group.id)) members.forEach(m => out.push({ kind: "drawing", key: `d:${m.id}`, d: m, depth: 1 }));
      } else out.push({ kind: "drawing", key: `d:${d.id}`, d, depth: 0 });
    }
    return out;
  }, [objects, front, collapsed]);
  const flatIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const d of front) {
      if (d.group) { if (seen.has(d.group.id)) continue; seen.add(d.group.id); front.filter(m => m.group?.id === d.group!.id).forEach(m => ids.push(m.id)); }
      else ids.push(d.id);
    }
    return ids;
  }, [front]);

  // ── structural edits (one undo step each) ──
  const byId = (id: string) => drawings.find(d => d.id === id);
  const setTreeOrder = (treeOrder: BaseDrawing[]) => {
    const measures = drawings.filter(d => d.type === "measure");
    applyDrawings([...treeOrder.slice().reverse(), ...measures]);
  };
  const createGroup = (ids: string[]) => {
    if (!ids.length) return;
    const used = new Set(drawings.map(d => d.group?.name).filter(Boolean));
    let n = 1; while (used.has(`Group ${n}`)) n++;
    const group = { id: `grp-${Date.now().toString(36)}`, name: `Group ${n}` };
    const set = new Set(ids);
    const order = flatIds.map(id => byId(id)!).filter(Boolean);
    const firstIdx = order.findIndex(d => set.has(d.id));
    const picked = order.filter(d => set.has(d.id)).map(d => ({ ...d, group }));
    const rest = order.filter(d => !set.has(d.id));
    const before = order.slice(0, firstIdx).filter(d => !set.has(d.id)).length;
    setTreeOrder([...rest.slice(0, before), ...picked, ...rest.slice(before)]);
    select(picked.map(d => d.id));
  };
  const visualOrder = (ids: string[], action: "front" | "forward" | "backward" | "back") => {
    const set = new Set(ids);
    const arr = drawings.slice();
    if (action === "front" || action === "back") {
      const moving = arr.filter(d => set.has(d.id)), rest = arr.filter(d => !set.has(d.id));
      applyDrawings(action === "front" ? [...rest, ...moving] : [...moving, ...rest]);
      return;
    }
    // one step: each selected drawing swaps with its neighbour above / below
    if (action === "forward") { for (let i = arr.length - 2; i >= 0; i--) if (set.has(arr[i].id) && !set.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
    else { for (let i = 1; i < arr.length; i++) if (set.has(arr[i].id) && !set.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; }
    applyDrawings(arr);
  };
  const clone = (ids: string[]) => {
    const src = drawings.filter(d => ids.includes(d.id));
    if (!src.length) return;
    const stamp = Date.now().toString(36);
    const copies = src.map((d, i) => ({ ...JSON.parse(JSON.stringify(d)), id: `${d.type}-${stamp}${i}`, modifiedAt: Date.now(), points: (d.points || []).map((p: any) => ({ ...p, logical: (p.logical ?? 0) + 5 })) }));
    applyDrawings([...drawings, ...copies]);
    select(copies.map(c => c.id));
  };
  const copy = (ids: string[]) => { (window as any).__copiedDrawings = JSON.parse(JSON.stringify(drawings.filter(d => ids.includes(d.id)))); };
  const remove = (ids: string[]) => deleteMultipleDrawings(ids);
  const setLock = (ids: string[], locked: boolean) => updateMultipleDrawings(ids, { locked });
  const setHidden = (ids: string[], hidden: boolean) => updateMultipleDrawings(ids, { visible: !hidden });
  const renameGroup = (id: string, name: string) => {
    applyDrawings(drawings.map(d => d.group?.id === id ? { ...d, group: { id, name } } : d));
  };
  const openSettings = (id: string) => {
    select([id]);
    setTimeout(() => window.dispatchEvent(new CustomEvent("tv:open-shape-settings", { detail: { id } })), 60);
  };

  // ── selection by click ──
  const clickDrawing = (id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) { select(selSet.has(id) ? selIds.filter(x => x !== id) : [...selIds, id]); anchorRef.current = id; return; }
    if (e.shiftKey && anchorRef.current && flatIds.includes(anchorRef.current)) {
      const a = flatIds.indexOf(anchorRef.current), b = flatIds.indexOf(id);
      select(flatIds.slice(Math.min(a, b), Math.max(a, b) + 1));
      return;
    }
    anchorRef.current = id;
    select([id]);
  };
  const clickGroup = (members: BaseDrawing[], e: React.MouseEvent) => {
    const ids = members.map(m => m.id);
    if (e.ctrlKey || e.metaKey) { const all = ids.every(i => selSet.has(i)); select(all ? selIds.filter(x => !ids.includes(x)) : Array.from(new Set([...selIds, ...ids]))); return; }
    select(ids);
  };

  // ── right-click menus ──
  const drawingMenu = (ids: string[]): TvMenuItem[] => {
    const ds = drawings.filter(d => ids.includes(d.id));
    const allLocked = ds.every(d => d.locked), allHidden = ds.every(d => d.visible === false);
    return [
      { label: "Visual order", icon: <VisualOrderGlyph />, submenu: [
        { label: "Bring to front", onClick: () => visualOrder(ids, "front") },
        { label: "Bring forward", onClick: () => visualOrder(ids, "forward") },
        { label: "Send backward", onClick: () => visualOrder(ids, "backward") },
        { label: "Send to back", onClick: () => visualOrder(ids, "back") },
      ] },
      ...(ids.length === 1 ? [{ label: "Visibility on intervals", onClick: () => openSettings(ids[0]) } as TvMenuItem] : []),
      { kind: "divider" },
      { label: "Create a group of drawings", icon: <Small><GroupButtonIcon /></Small>, onClick: () => createGroup(ids) },
      { label: "Clone", icon: <Small><CloneCopyIcon /></Small>, onClick: () => clone(ids) },
      { label: "Copy", shortcut: "Ctrl + C", onClick: () => copy(ids) },
      { kind: "divider" },
      { label: allLocked ? "Unlock" : "Lock", icon: <LockIcon locked={!allLocked} />, onClick: () => setLock(ids, !allLocked) },
      { label: allHidden ? "Show" : "Hide", icon: <EyeIcon off={!allHidden} />, onClick: () => setHidden(ids, !allHidden) },
      { label: "Remove", icon: <TrashIcon />, shortcut: "Del", onClick: () => remove(ids) },
      ...(ids.length === 1 ? [{ kind: "divider" } as TvMenuItem, { label: "Settings…", icon: <GearGlyph />, onClick: () => openSettings(ids[0]) } as TvMenuItem] : []),
    ];
  };
  const groupMenu = (g: Extract<Row, { kind: "group" }>): TvMenuItem[] => {
    const ids = g.members.map(m => m.id);
    const allLocked = g.members.every(d => d.locked), allHidden = g.members.every(d => d.visible === false);
    return [
      { label: "Rename", icon: <PencilGlyph />, onClick: () => setRenaming(g.id) },
      { kind: "divider" },
      { label: allLocked ? "Unlock" : "Lock", icon: <LockIcon locked={!allLocked} />, onClick: () => setLock(ids, !allLocked) },
      { label: allHidden ? "Show" : "Hide", icon: <EyeIcon off={!allHidden} />, onClick: () => setHidden(ids, !allHidden) },
      { label: "Remove", icon: <TrashIcon />, shortcut: "Del", onClick: () => remove(ids) },
    ];
  };
  const objectMenu = (o: ChartObject): TvMenuItem[] => {
    if (o.kind === "main") return [
      { label: o.visible ? "Hide" : "Show", icon: <EyeIcon off={o.visible} />, onClick: o.toggleVisible },
      { kind: "divider" },
      { label: "Settings…", icon: <GearGlyph />, onClick: () => o.openSettings?.() },
    ];
    const fav = loadFavoriteIndicators().includes(o.fullName);
    return [
      { label: `Add indicator/strategy on ${o.title}…`, icon: <IndicatorPlusGlyph />, onClick: () => window.dispatchEvent(new CustomEvent("tv:open-indicators")) },
      { label: fav ? "Remove this indicator from favorites" : "Add this indicator to favorites", icon: <StarGlyph filled={fav} />, onClick: () => {
        const list = loadFavoriteIndicators();
        saveFavoriteIndicators(fav ? list.filter(n => n !== o.fullName) : [...list, o.fullName]);
      } },
      { kind: "divider" },
      { label: o.visible ? "Hide" : "Show", icon: <EyeIcon off={o.visible} />, onClick: o.toggleVisible },
      ...(o.remove ? [{ label: "Remove", icon: <TrashIcon />, shortcut: "Del", onClick: o.remove } as TvMenuItem] : []),
      { kind: "divider" },
      { label: "Settings…", icon: <GearGlyph />, onClick: () => o.openSettings?.() },
    ];
  };
  const openMenu = (e: React.MouseEvent, items: TvMenuItem[], label: string) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, items, label }); };

  // ── drag and drop: visual order, into / out of groups ──
  const [drag, setDrag] = useState<null | { ids: string[]; groupDrag: string | null; title: string; type: string | null; x: number; y: number; target: { rowKey: string; after: boolean } | null }>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const startDrag = (e: React.MouseEvent, ids: string[], groupDrag: string | null, title: string, type: string | null) => {
    if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.metaKey) return;
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    const move = (ev: MouseEvent) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      started = true;
      setDrag({ ids, groupDrag, title, type, x: ev.clientX, y: ev.clientY, target: dropTargetAt(ev.clientY, ids) });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const d = dragRef.current;
      setDrag(null);
      if (started && d?.target) drop(d.ids, d.groupDrag, d.target);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const dropTargetAt = (clientY: number, ids: string[]): { rowKey: string; after: boolean } | null => {
    const el = listRef.current;
    if (!el) return null;
    const firstDrawing = rows.findIndex(r => r.kind !== "object");
    if (firstDrawing < 0) return null;
    const top = el.getBoundingClientRect().top - el.scrollTop;
    let i = Math.floor((clientY - top) / ROW_H);
    let after = (clientY - top) % ROW_H > ROW_H / 2;
    if (i < firstDrawing) { i = firstDrawing; after = false; }
    if (i >= rows.length) { i = rows.length - 1; after = true; }
    const r = rows[i];
    if (r.kind === "drawing" && ids.includes(r.d.id)) return null;
    return { rowKey: r.key, after };
  };
  const drop = (ids: string[], groupDrag: string | null, target: { rowKey: string; after: boolean }) => {
    const r = rows.find(x => x.key === target.rowKey);
    if (!r || r.kind === "object") return;
    const order = flatIds.map(id => byId(id)!).filter(Boolean);
    const moving = order.filter(d => ids.includes(d.id));
    const rest = order.filter(d => !ids.includes(d.id));
    let anchorId: string, after: boolean, group: BaseDrawing["group"] | undefined;
    if (r.kind === "group") {
      const expanded = !collapsed.has(r.id);
      if (!target.after) { anchorId = r.members[0].id; after = false; group = undefined; }
      else if (expanded && !groupDrag) { anchorId = r.members[0].id; after = false; group = { id: r.id, name: r.name }; }
      else { anchorId = r.members[r.members.length - 1].id; after = true; group = undefined; }
    } else {
      anchorId = r.d.id; after = target.after; group = r.depth === 1 ? r.d.group : undefined;
      // a whole group can't go inside another: it goes next to that group instead
      if (groupDrag && group) {
        const members = rest.filter(d => d.group?.id === group!.id);
        anchorId = after ? members[members.length - 1].id : members[0].id;
        group = undefined;
      }
    }
    let at = rest.findIndex(d => d.id === anchorId);
    if (at < 0) return;
    if (after) at += 1;
    const placed = moving.map(d => groupDrag ? d : { ...d, group });
    setTreeOrder([...rest.slice(0, at), ...placed, ...rest.slice(at)]);
  };

  const drawingSel = selIds.length > 0;
  const toolbarBtn = (label: string, icon: React.ReactNode, onClick: ((e: React.MouseEvent<HTMLButtonElement>) => void) | null, name: string) => (
    <Tip text={label} placement="bottom">
      <button type="button" aria-label={label} data-name={name} disabled={!onClick} onClick={e => onClick?.(e)}
        style={{ width: 38, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 6, background: "transparent", padding: 0,
          color: onClick ? "var(--tv-color-text)" : "var(--tv-color-text-muted)", opacity: onClick ? 1 : 0.5, cursor: onClick ? "pointer" : "default" }}
        onMouseEnter={e => { if (onClick) e.currentTarget.style.background = "var(--tv-color-item-hover)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{icon}</button>
    </Tip>
  );

  const rowBg = (key: string, selected: boolean, childOfSelected: boolean) =>
    selected ? "var(--tv-ot-selected)" : childOfSelected ? "var(--tv-ot-selected-child)" : hovered === key ? "var(--tv-color-item-hover)" : "transparent";
  const rowBtn = (title: string, name: string, icon: React.ReactNode, onClick: () => void, show: boolean) => (
    <span role="button" aria-label={title} data-name={name} title={title}
      onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onClick(); }} onDoubleClick={e => e.stopPropagation()}
      style={{ width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, cursor: "pointer", visibility: show ? "visible" : "hidden", color: "var(--tv-color-text)" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--tv-color-item-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{icon}</span>
  );

  return (
    <>
      <div role="toolbar" aria-label="Object tree tools" style={{ display: "flex", alignItems: "center", padding: "0 10px 6px", borderBottom: "1px solid var(--tv-color-border)" }}>
        {toolbarBtn("Create a group of drawings", <GroupButtonIcon />, drawingSel ? () => createGroup(selIds) : null, "group-button")}
        {toolbarBtn("Clone, Copy", <CloneCopyIcon />, drawingSel ? (e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 2, label: "Clone, Copy", items: [{ label: "Copy", onClick: () => copy(selIds) }, { label: "Clone", onClick: () => clone(selIds) }] }); } : null, "copy-clone-button")}
        {/* drawings go to another pane only when the chart has more than one (it hasn't here) */}
        {toolbarBtn("Move to", <MoveToIcon />, null, "move-to-button")}
        <span style={{ flex: 1 }} />
        {toolbarBtn("Manage layout drawings", <ManageDrawingsIcon />, () => setManageOpen(true), "manage-drawings-button")}
      </div>
      <div ref={listRef} role="tree" aria-label="Object tree" aria-multiselectable
        onMouseDown={e => { if (e.target === e.currentTarget) { select([]); } }}
        onContextMenu={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", userSelect: "none" }}>
        {rows.map(r => {
          if (r.kind === "object") {
            const o = r.obj;
            const selected = selectedId === o.id;
            return (
              <div key={r.key} role="treeitem" aria-selected={selected} data-row={o.kind} data-title={o.title}
                onMouseEnter={() => setHovered(r.key)} onMouseLeave={() => setHovered(h => h === r.key ? null : h)}
                onClick={() => { select([]); chartObjects.set({ selectedId: o.id }); }}
                onDoubleClick={() => o.openSettings?.()}
                onContextMenu={e => { select([]); chartObjects.set({ selectedId: o.id }); openMenu(e, objectMenu(o), o.title); }}
                style={{ height: ROW_H, display: "flex", alignItems: "center", padding: "0 8px 0 22px", gap: 0, background: rowBg(r.key, selected, false), cursor: "default" }}>
                <span style={{ width: 28, height: 28, flexShrink: 0, color: o.visible ? "var(--tv-color-text)" : "var(--tv-color-text-muted)", opacity: o.visible ? 1 : 0.6 }}>{o.kind === "main" ? <MainSeriesIcon /> : o.kind === "strategy" ? <StrategyIcon /> : <IndicatorIcon />}</span>
                <span style={{ flex: 1, minWidth: 0, marginLeft: 8, fontSize: 14, fontWeight: o.kind === "main" ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: o.visible ? "var(--tv-color-text)" : "var(--tv-color-text-muted)" }}>{o.title}</span>
                <span style={{ display: "inline-flex", gap: 8, marginLeft: 6 }}>
                  {rowBtn(o.visible ? "Hide" : "Show", "hide", <EyeIcon off={!o.visible} />, o.toggleVisible, hovered === r.key || !o.visible)}
                  {o.remove && rowBtn("Remove", "remove", <TrashIcon />, o.remove, hovered === r.key)}
                </span>
              </div>
            );
          }
          if (r.kind === "group") {
            const ids = r.members.map(m => m.id);
            const selected = ids.every(i => selSet.has(i));
            const allLocked = r.members.every(d => d.locked), allHidden = r.members.every(d => d.visible === false);
            const open = !collapsed.has(r.id);
            const showDrop = drag?.target?.rowKey === r.key;
            return (
              <div key={r.key} role="treeitem" aria-expanded={open} aria-selected={selected} data-row="group" data-title={r.name}
                onMouseEnter={() => setHovered(r.key)} onMouseLeave={() => setHovered(h => h === r.key ? null : h)}
                onMouseDown={e => { if (renaming !== r.id) startDrag(e, ids, r.id, r.name, null); }}
                onClick={e => clickGroup(r.members, e)}
                onContextMenu={e => { if (!selected) select(ids); openMenu(e, groupMenu(r), r.name); }}
                style={{ height: ROW_H, display: "flex", alignItems: "center", padding: "0 8px 0 4px", background: rowBg(r.key, selected, false), position: "relative", cursor: "default" }}>
                <span role="button" aria-label={open ? "Collapse" : "Expand"} onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); setCollapsed(prev => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }); }}
                  style={{ width: 18, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--tv-color-text-muted)", cursor: "pointer" }}><Chevron open={open} /></span>
                <span style={{ width: 28, height: 28, flexShrink: 0, color: allHidden ? "var(--tv-color-text-muted)" : "var(--tv-color-text)" }}><FolderIcon /></span>
                {renaming === r.id ? (
                  <RenameInput initial={r.name} onDone={name => { setRenaming(null); if (name && name !== r.name) renameGroup(r.id, name); }} />
                ) : (
                  <span style={{ flex: 1, minWidth: 0, marginLeft: 8, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: allHidden ? "var(--tv-color-text-muted)" : "var(--tv-color-text)" }}>{r.name}</span>
                )}
                <span style={{ display: "inline-flex", gap: 8, marginLeft: 6 }}>
                  {rowBtn(allLocked ? "Unlock" : "Lock", "lock", <LockIcon locked={allLocked} />, () => setLock(ids, !allLocked), hovered === r.key || allLocked)}
                  {rowBtn(allHidden ? "Show" : "Hide", "hide", <EyeIcon off={allHidden} />, () => setHidden(ids, !allHidden), hovered === r.key || allHidden)}
                  {rowBtn("Remove", "remove", <TrashIcon />, () => remove(ids), hovered === r.key)}
                </span>
                {showDrop && <DropLine after={!!drag?.target?.after} indent={4} />}
              </div>
            );
          }
          const d = r.d;
          const selected = selSet.has(d.id);
          const groupSelected = r.depth === 1 && !selected ? false : false;
          const inSelectedGroup = r.depth === 1 && !!d.group && drawings.filter(m => m.group?.id === d.group!.id).every(m => selSet.has(m.id));
          const hidden = d.visible === false;
          const name = drawingTreeName(d.type);
          const showDrop = drag?.target?.rowKey === r.key;
          const row = (
            <div key={r.key} role="treeitem" aria-selected={selected} data-row="drawing" data-drawing={d.id} data-title={name}
              onMouseEnter={() => setHovered(r.key)} onMouseLeave={() => setHovered(h => h === r.key ? null : h)}
              onMouseDown={e => startDrag(e, selected && selIds.length > 1 ? flatIds.filter(i => selSet.has(i)) : [d.id], null, name, d.type)}
              onClick={e => clickDrawing(d.id, e)}
              onDoubleClick={() => openSettings(d.id)}
              onContextMenu={e => { const ids = selected ? selIds : [d.id]; if (!selected) select([d.id]); openMenu(e, drawingMenu(ids), name); }}
              style={{ height: ROW_H, display: "flex", alignItems: "center", padding: `0 8px 0 ${r.depth ? 58 : 22}px`, background: rowBg(r.key, selected && !inSelectedGroup, inSelectedGroup || groupSelected), position: "relative", cursor: "default" }}>
              <span style={{ width: 28, height: 28, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: hidden ? "var(--tv-color-text-muted)" : "var(--tv-color-text)" }}><DrawingIcon type={d.type} /></span>
              <span style={{ flex: 1, minWidth: 0, marginLeft: 8, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: hidden ? "var(--tv-color-text-muted)" : "var(--tv-color-text)" }}>{name}</span>
              <span style={{ display: "inline-flex", gap: 8, marginLeft: 6 }}>
                {rowBtn(d.locked ? "Unlock" : "Lock", "lock", <LockIcon locked={d.locked} />, () => setLock([d.id], !d.locked), hovered === r.key || d.locked)}
                {rowBtn(hidden ? "Show" : "Hide", "hide", <EyeIcon off={hidden} />, () => setHidden([d.id], !hidden), hovered === r.key || hidden)}
                {rowBtn("Remove", "remove", <TrashIcon />, () => remove([d.id]), hovered === r.key)}
              </span>
              {showDrop && <DropLine after={!!drag?.target?.after} indent={r.depth ? 40 : 4} />}
            </div>
          );
          return d.modifiedAt && !drag ? <Tip key={r.key} text={`Modified: ${formatModified(d.modifiedAt)}`} placement="top" block delay={600}>{row}</Tip> : row;
        })}
      </div>
      {drag && createPortal(
        <div aria-hidden style={{ position: "fixed", left: drag.x + 8, top: drag.y - ROW_H / 2, height: ROW_H, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", pointerEvents: "none", zIndex: 5000,
          background: "var(--tv-color-pane-bg)", color: "var(--tv-color-text)", opacity: 0.85, borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.25)", fontSize: 14 }}>
          <span style={{ width: 28, height: 28 }}>{drag.type ? <DrawingIcon type={drag.type} /> : <FolderIcon />}</span>{drag.title}{drag.ids.length > 1 && !drag.groupDrag ? ` +${drag.ids.length - 1}` : ""}
        </div>, document.body)}
      {menu && <TvMenu items={menu.items} position={{ x: menu.x, y: menu.y }} isDark={isDark} onClose={() => setMenu(null)} ariaLabel={menu.label} />}
      {manageOpen && <ManageDrawingsDialog onClose={() => setManageOpen(false)} />}
    </>
  );
}

// The blue line where a dragged row will land, with TradingView's dot at its start
function DropLine({ after, indent }: { after: boolean; indent: number }) {
  return (
    <span aria-hidden style={{ position: "absolute", left: indent, right: 0, [after ? "bottom" : "top"]: -1, height: 2, background: "var(--tv-color-accent)", pointerEvents: "none", zIndex: 2 }}>
      <span style={{ position: "absolute", left: -4, top: -3, width: 8, height: 8, borderRadius: "50%", border: "2px solid var(--tv-color-accent)", background: "var(--tv-color-pane-bg)", boxSizing: "border-box" }} />
    </span>
  );
}

// A group's name, edited in place (Rename): selected, Enter / leaving keeps it, Esc cancels
function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  const finish = (v: string | null) => { if (done.current) return; done.current = true; onDone(v); };
  return (
    <input ref={ref} aria-label="Group name" defaultValue={initial}
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
      onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") finish(e.currentTarget.value.trim() || null); if (e.key === "Escape") { e.nativeEvent.stopImmediatePropagation(); finish(null); } }}
      onBlur={e => finish(e.currentTarget.value.trim() || null)}
      style={{ flex: 1, minWidth: 0, marginLeft: 8, height: 22, fontSize: 14, fontFamily: "inherit", border: "none", outline: "none", background: "transparent", color: "var(--tv-color-text)", padding: 0 }} />
  );
}

const Small = ({ children }: { children: React.ReactNode }) => <span style={{ display: "inline-flex", width: 18, height: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" }}><span style={{ transform: "scale(0.7)", display: "inline-flex" }}>{children}</span></span>;
const VisualOrderGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden><path d="M9 2.5l6.5 3.5L9 9.5 2.5 6z" /><path d="M2.5 9L9 12.5 15.5 9M2.5 12L9 15.5 15.5 12" /></svg>
);
const GearGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden><circle cx="9" cy="9" r="2.5" /><path d="M7.6 1.5h2.8l.4 2 1.6.9 1.9-.7 1.4 2.4-1.5 1.3v1.8l1.5 1.3-1.4 2.4-1.9-.7-1.6.9-.4 2H7.6l-.4-2-1.6-.9-1.9.7-1.4-2.4 1.5-1.3V7.3L2.3 6l1.4-2.4 1.9.7 1.6-.9z" /></svg>
);
const PencilGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden><path d="M12.5 2.5l3 3-9 9H3.5v-3z" /></svg>
);
const IndicatorPlusGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" aria-hidden><path d="M1.5 12.5l3-3 3 2.5 4-5M13.5 11v6M10.5 14h6" /></svg>
);
const StarGlyph = ({ filled }: { filled?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill={filled ? "#f7a600" : "none"} stroke={filled ? "#f7a600" : "currentColor"} aria-hidden><path d="M9 2.5l2 4.3 4.7.5-3.5 3.2 1 4.6L9 12.7l-4.2 2.4 1-4.6-3.5-3.2 4.7-.5z" /></svg>
);
