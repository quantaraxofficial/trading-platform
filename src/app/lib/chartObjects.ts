"use client";
// What's on the active chart besides drawings — the symbol's own series, indicators, a Pine
// script — as the Object tree and the Data window show them (TradingView's "Object tree and
// data window" panel). The chart publishes it; the panel reads it. Visibility, settings and
// removal go back through the chart's own handlers, so the legend and the tree stay in step.
import { useSyncExternalStore } from "react";

export type ChartObjectKind = "main" | "indicator" | "strategy";

export interface ChartObject {
  id: string;
  kind: ChartObjectKind;
  title: string;          // as the tree writes it: "AAPL · NASDAQ, 15", "EMA (9, close)", "Vol"
  fullName: string;       // the indicator's full name (favorites, "Add indicator on …")
  visible: boolean;
  toggleVisible: () => void;
  openSettings?: () => void;
  remove?: () => void;
}

export interface DataWindowRow { label: string; value: string; color?: string }
export interface DataWindowSection { id: string; kind: ChartObjectKind; title: string; rows: DataWindowRow[] }
export interface DataWindowData { date: string; time: string | null; sections: DataWindowSection[] }

interface State {
  objects: ChartObject[];
  // The Data window's values for the bar under the crosshair (the last bar otherwise), and the
  // crosshair store to follow
  dataWindow: (() => DataWindowData | null) | null;
  hover: { subscribe: (f: () => void) => () => void } | null;
  // The object the tree / legend has selected (indicators and the main series; drawings have
  // their own selection)
  selectedId: string | null;
}

let state: State = { objects: [], dataWindow: null, hover: null, selectedId: null };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export const chartObjects = {
  get: () => state,
  set(patch: Partial<State>) { state = { ...state, ...patch }; emit(); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  useValue(): State { return useSyncExternalStore(chartObjects.subscribe, chartObjects.get, chartObjects.get); },
};

// Equal for publishing purposes: same rows, titles and visibility (the handlers are refreshed
// through the chart's refs, so they needn't trigger a re-render)
export function sameObjects(a: ChartObject[], b: ChartObject[]) {
  return a.length === b.length && a.every((o, i) => o.id === b[i].id && o.title === b[i].title && o.visible === b[i].visible && o.kind === b[i].kind);
}
