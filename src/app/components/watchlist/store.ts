"use client";

// Watchlists as on TradingView: several named lists, each an ordered run of section headers and
// symbols; colour flags on symbols; column and symbol-display choices; which sections the
// details panel shows; per-symbol notes; the watchlist/details split. Kept in localStorage.

import { makeStore } from "../../trading/settings";

export type FlagColor = "red" | "blue" | "green" | "orange" | "purple" | "cyan" | "pink";
export const FLAG_COLORS: { id: FlagColor; hex: string }[] = [
  { id: "red", hex: "#f23645" }, { id: "blue", hex: "#2962ff" }, { id: "green", hex: "#4caf50" },
  { id: "orange", hex: "#fbc02d" }, { id: "purple", hex: "#ab47bc" }, { id: "cyan", hex: "#00bcd4" }, { id: "pink", hex: "#f06292" },
];

export type WlItem = { kind: "section"; id: string; name: string; collapsed?: boolean } | { kind: "symbol"; symbol: string };
export type WlList = { id: string; name: string; items: WlItem[] };
export type SortCol = "symbol" | "last" | "change" | "changePct" | "volume";
export type DetailsSection = "priceRanges" | "notes" | "keyStats" | "performance" | "seasonals" | "technicals";

export interface WatchlistState {
  lists: WlList[];
  activeId: string;
  flags: Record<string, FlagColor>;
  lastFlag: FlagColor;
  columns: { last: boolean; change: boolean; changePct: boolean; volume: boolean };
  display: { logo: boolean; label: "symbol" | "name" };
  sort: { col: SortCol; dir: 1 | -1 } | null;
  details: Record<DetailsSection, boolean>;
  notes: Record<string, string>;
  // Height of the watchlist part of the panel, as a share of the panel
  split: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// A new user's list: TradingView's default mix of sections, limited to symbols this app's data
// source (TwelveData, free plan) can quote and chart
const DEFAULT_SYMBOLS = ["AAPL", "TSLA", "NFLX", "XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "BTC/USD", "ETH/USD"];
const CRYPTO_BASES = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "LTC", "DOT", "AVAX"];
export function assetKind(sym: string): "stock" | "commodity" | "forex" | "crypto" {
  if (!sym.includes("/")) return "stock";
  const base = sym.split("/")[0];
  if (CRYPTO_BASES.includes(base)) return "crypto";
  if (["XAU", "XAG", "XPT", "XPD"].includes(base)) return "commodity";
  return "forex";
}
function groupedItems(symbols: string[]): WlItem[] {
  const order: [ReturnType<typeof assetKind>, string][] = [["stock", "STOCKS"], ["commodity", "COMMODITIES"], ["forex", "FOREX"], ["crypto", "CRYPTO"]];
  const out: WlItem[] = [];
  for (const [kind, name] of order) {
    const syms = symbols.filter(s => assetKind(s) === kind);
    if (!syms.length) continue;
    out.push({ kind: "section", id: uid(), name });
    syms.forEach(s => out.push({ kind: "symbol", symbol: s }));
  }
  return out;
}

const firstList = (): WlList => ({ id: "default", name: "Watchlist", items: groupedItems(DEFAULT_SYMBOLS) });

const DEFAULTS: WatchlistState = {
  lists: [firstList()],
  activeId: "default",
  flags: {},
  lastFlag: "red",
  columns: { last: true, change: true, changePct: true, volume: false },
  display: { logo: true, label: "symbol" },
  sort: null,
  details: { priceRanges: false, notes: true, keyStats: true, performance: true, seasonals: true, technicals: true },
  notes: {},
  split: 0.5,
};

export const watchlists = makeStore<WatchlistState>("tv:watchlists", DEFAULTS, apply => {
  // The earlier single list ("tv:watchlist", a plain array of symbols) becomes the first list
  try {
    if (localStorage.getItem("tv:watchlists")) return;
    const raw = localStorage.getItem("tv:watchlist");
    const syms = raw ? JSON.parse(raw) : null;
    if (Array.isArray(syms) && syms.every(s => typeof s === "string")) {
      apply({ lists: [{ id: "default", name: "Watchlist", items: groupedItems(syms) }], activeId: "default" });
    }
  } catch { /* ignore */ }
});

// --- Helpers over the state ---
export const activeList = (s: WatchlistState): WlList => s.lists.find(l => l.id === s.activeId) ?? s.lists[0];
export const listSymbols = (l: WlList): string[] => l.items.filter((i): i is { kind: "symbol"; symbol: string } => i.kind === "symbol").map(i => i.symbol);
export const sameSymbol = (a: string, b: string) => a.replace("/", "").toLowerCase() === b.replace("/", "").toLowerCase();

const patchList = (id: string, fn: (l: WlList) => WlList) =>
  watchlists.set(s => ({ lists: s.lists.map(l => (l.id === id ? fn(l) : l)) }));

// --- Actions ---
export const wl = {
  open: (id: string) => watchlists.set({ activeId: id }),
  create: (name: string) => { const id = uid(); watchlists.set(s => ({ lists: [...s.lists, { id, name, items: [] }], activeId: id })); return id; },
  copy: (name: string) => {
    const id = uid();
    watchlists.set(s => {
      const src = activeList(s);
      const items = src.items.map(i => (i.kind === "section" ? { ...i, id: uid() } : { ...i }));
      return { lists: [...s.lists, { id, name, items }], activeId: id };
    });
  },
  rename: (id: string, name: string) => patchList(id, l => ({ ...l, name })),
  remove: (id: string) => watchlists.set(s => {
    const lists = s.lists.filter(l => l.id !== id);
    const safe = lists.length ? lists : [{ id: uid(), name: "Watchlist", items: [] }];
    return { lists: safe, activeId: s.activeId === id ? safe[0].id : s.activeId };
  }),
  clear: (id: string) => patchList(id, l => ({ ...l, items: [] })),
  addSymbol: (symbol: string, listId?: string) => watchlists.set(s => {
    const id = listId ?? s.activeId;
    return {
      lists: s.lists.map(l => (l.id !== id || listSymbols(l).some(x => sameSymbol(x, symbol)) ? l : { ...l, items: [...l.items, { kind: "symbol", symbol }] })),
    };
  }),
  removeSymbol: (symbol: string) => watchlists.set(s => ({
    lists: s.lists.map(l => (l.id !== s.activeId ? l : { ...l, items: l.items.filter(i => !(i.kind === "symbol" && sameSymbol(i.symbol, symbol))) })),
  })),
  // New sections go above the given item (or at the top), named "SECTION" like TradingView's
  addSection: (beforeIndex = 0) => {
    const id = uid();
    watchlists.set(s => ({
      lists: s.lists.map(l => {
        if (l.id !== s.activeId) return l;
        const items = [...l.items];
        items.splice(Math.max(0, Math.min(beforeIndex, items.length)), 0, { kind: "section", id, name: "SECTION" });
        return { ...l, items };
      }),
    }));
    return id;
  },
  renameSection: (id: string, name: string) => watchlists.set(s => ({
    lists: s.lists.map(l => ({ ...l, items: l.items.map(i => (i.kind === "section" && i.id === id ? { ...i, name } : i)) })),
  })),
  toggleSection: (id: string) => watchlists.set(s => ({
    lists: s.lists.map(l => ({ ...l, items: l.items.map(i => (i.kind === "section" && i.id === id ? { ...i, collapsed: !i.collapsed } : i)) })),
  })),
  removeSection: (id: string) => watchlists.set(s => ({
    lists: s.lists.map(l => ({ ...l, items: l.items.filter(i => !(i.kind === "section" && i.id === id)) })),
  })),
  // Drag and drop: move the item at `from` to position `to` (both indexes in the list's items)
  move: (from: number, to: number) => watchlists.set(s => ({
    lists: s.lists.map(l => {
      if (l.id !== s.activeId) return l;
      const items = [...l.items];
      const [it] = items.splice(from, 1);
      items.splice(to > from ? to - 1 : to, 0, it);
      return { ...l, items };
    }),
  })),
  // A text file of symbols (commas / new lines), TradingView's export format included:
  // "EXCHANGE:SYMBOL" entries and "###SECTION NAME" section headers
  importText: (name: string, text: string) => {
    const items: WlItem[] = [];
    for (const raw of text.split(/[,\n\r]+/).map(t => t.trim()).filter(Boolean)) {
      if (raw.startsWith("###")) { items.push({ kind: "section", id: uid(), name: raw.slice(3).trim() || "SECTION" }); continue; }
      const sym = raw.includes(":") ? raw.split(":").pop()!.trim() : raw;
      if (sym && !items.some(i => i.kind === "symbol" && sameSymbol(i.symbol, sym))) items.push({ kind: "symbol", symbol: sym.toUpperCase() });
    }
    const id = uid();
    watchlists.set(s => ({ lists: [...s.lists, { id, name, items }], activeId: id }));
    return items.filter(i => i.kind === "symbol").length;
  },
  setFlag: (symbol: string, color: FlagColor | null) => watchlists.set(s => {
    const flags = { ...s.flags };
    if (color) flags[symbol] = color; else delete flags[symbol];
    return { flags, lastFlag: color ?? s.lastFlag };
  }),
  unflagAll: () => watchlists.set({ flags: {} }),
  setColumns: (p: Partial<WatchlistState["columns"]>) => watchlists.set(s => ({ columns: { ...s.columns, ...p } })),
  setDisplay: (p: Partial<WatchlistState["display"]>) => watchlists.set(s => ({ display: { ...s.display, ...p } })),
  // Clicking a column header: descending, ascending, then back to the list's own order
  cycleSort: (col: SortCol) => watchlists.set(s => ({
    sort: !s.sort || s.sort.col !== col ? { col, dir: -1 } : s.sort.dir === -1 ? { col, dir: 1 } : null,
  })),
  setDetails: (p: Partial<WatchlistState["details"]>) => watchlists.set(s => ({ details: { ...s.details, ...p } })),
  setNote: (symbol: string, text: string) => watchlists.set(s => {
    const notes = { ...s.notes };
    if (text.trim()) notes[symbol] = text; else delete notes[symbol];
    return { notes };
  }),
  setSplit: (split: number) => watchlists.set({ split: Math.max(0.15, Math.min(0.85, split)) }),
};
