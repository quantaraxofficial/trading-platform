"use client";
// A local index of every symbol's drawings — what they are and when they were changed — kept as
// drawings change, for the Object tree's "Manage layout drawings" (which lists them per symbol
// without loading each symbol). The backend's list replaces it when signed in.

export interface IndexedDrawing { id: string; type: string; modifiedAt?: number }
const KEY = "tv:drawingIndex";

export function readDrawingIndex(): Record<string, IndexedDrawing[]> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}

export function writeDrawingIndex(symbol: string, drawings: { id: string; type: string; modifiedAt?: number }[]) {
  if (!symbol) return;
  try {
    const idx = readDrawingIndex();
    const list = drawings.filter(d => d.type !== "measure").map(d => ({ id: d.id, type: d.type, modifiedAt: d.modifiedAt }));
    if (list.length) idx[symbol] = list; else delete idx[symbol];
    localStorage.setItem(KEY, JSON.stringify(idx));
  } catch { /* storage full / blocked */ }
}
