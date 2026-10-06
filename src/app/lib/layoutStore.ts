"use client";

// Chart layouts, as TradingView's "Manage layouts": named layouts, each with its chart grid
// (Layout setup), the symbol and interval of every chart in it, which chart is active and the
// "Sync in layout" options. What's on screen is the working copy of the current layout; with
// Autosave on every change is saved straight away, otherwise "Save layout" (Ctrl+S) saves it.

import { makeStore } from "../trading/settings";
import type { ChartType } from "./chartType";

export type LayoutSync = { symbol: boolean; interval: boolean; crosshair: boolean; time: boolean; dateRange: boolean };
export type LayoutCell = { symbol: string; interval: string; intervalLabel: string; chartType?: ChartType };   // chart type: candles when unset
export type SavedLayout = {
  id: string;
  name: string;
  grid: string;               // a chartLayouts id ("1a", "2a", …)
  cells: LayoutCell[];        // one per chart (the grid's chart count)
  active: number;             // the chart the toolbar and panels work on
  sync: LayoutSync;
  savedAt: number;
  shared?: boolean;
};

export const DEFAULT_SYNC: LayoutSync = { symbol: false, interval: false, crosshair: true, time: false, dateRange: false };

type LayoutState = {
  layouts: SavedLayout[];
  currentId: string;
  working: SavedLayout | null;   // the current layout as shown (may be ahead of its saved copy)
  autosave: boolean;
  recent: string[];              // ids, most recent first
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const layoutStore = makeStore<LayoutState>("tv:layouts", { layouts: [], currentId: "", working: null, autosave: true, recent: [] });

export function newLayout(name: string, cell: LayoutCell): SavedLayout {
  return { id: uid(), name, grid: "1a", cells: [cell], active: 0, sync: { ...DEFAULT_SYNC }, savedAt: Date.now() };
}

// The working layout, created from the chart on screen the first time
export function ensureLayout(cell: LayoutCell, legacyName?: string): SavedLayout {
  const s = layoutStore.get();
  if (s.working) return s.working;
  const existing = s.layouts.find(l => l.id === s.currentId);
  const l = existing ? { ...existing } : newLayout(legacyName || "Unnamed", cell);
  layoutStore.set({ working: l, currentId: l.id, layouts: existing ? s.layouts : [...s.layouts, l], recent: [l.id, ...s.recent.filter(id => id !== l.id)] });
  return l;
}

export const isDirty = (s: LayoutState) => {
  const saved = s.layouts.find(l => l.id === s.currentId);
  if (!s.working || !saved) return false;
  const { savedAt: _a, ...w } = s.working, { savedAt: _b, ...v } = saved;
  return JSON.stringify(w) !== JSON.stringify(v);
};

export const layouts = {
  // Change the working layout (saved at once with Autosave on)
  update(patch: Partial<SavedLayout> | ((l: SavedLayout) => Partial<SavedLayout>)) {
    layoutStore.set(s => {
      if (!s.working) return {};
      const working = { ...s.working, ...(typeof patch === "function" ? patch(s.working) : patch) };
      return s.autosave ? { working: { ...working, savedAt: Date.now() }, layouts: s.layouts.map(l => (l.id === working.id ? { ...working, savedAt: Date.now() } : l)) } : { working };
    });
  },
  save() {
    layoutStore.set(s => {
      if (!s.working) return {};
      const saved = { ...s.working, savedAt: Date.now() };
      return { working: saved, layouts: s.layouts.some(l => l.id === saved.id) ? s.layouts.map(l => (l.id === saved.id ? saved : l)) : [...s.layouts, saved] };
    });
  },
  setAutosave(on: boolean) {
    layoutStore.set({ autosave: on });
    if (on) layouts.save();
  },
  rename(name: string) { layouts.update({ name }); if (!layoutStore.get().autosave) layouts.save(); },
  // Make a copy of the working layout under a new name, and switch to it
  copy(name: string) {
    const s = layoutStore.get();
    if (!s.working) return;
    const l = { ...s.working, id: uid(), name, savedAt: Date.now(), shared: false };
    layoutStore.set({ layouts: [...s.layouts, l], working: l, currentId: l.id, recent: [l.id, ...s.recent.filter(id => id !== l.id)] });
  },
  create(cell: LayoutCell) {
    const s = layoutStore.get();
    const l = newLayout("Unnamed", cell);
    layoutStore.set({ layouts: [...s.layouts, l], working: l, currentId: l.id, recent: [l.id, ...s.recent.filter(id => id !== l.id)] });
  },
  open(id: string) {
    const s = layoutStore.get();
    const l = s.layouts.find(x => x.id === id);
    if (!l) return;
    layoutStore.set({ working: { ...l }, currentId: id, recent: [id, ...s.recent.filter(x => x !== id)] });
  },
  remove(id: string) {
    const s = layoutStore.get();
    if (id === s.currentId) return; // the open layout can't be removed
    layoutStore.set({ layouts: s.layouts.filter(l => l.id !== id), recent: s.recent.filter(x => x !== id) });
  },
};

// A shareable link carries the layout in the URL (opened as a copy by whoever follows it)
export function shareLink(l: SavedLayout): string {
  const { id: _id, savedAt: _s, shared: _sh, ...rest } = l;
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(rest))));
  return `${window.location.origin}${window.location.pathname}?layout=${encodeURIComponent(data)}`;
}
export function readSharedLayout(param: string | null): Omit<SavedLayout, "id" | "savedAt"> | null {
  if (!param) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(param)))); } catch { return null; }
}
