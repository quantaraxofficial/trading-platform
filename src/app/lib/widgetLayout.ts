// The site's own layout: where its widgets sit (top bar, drawing toolbar, right panel, right
// toolbar, bottom panel) and their colours. The default is TradingView's grid; Redesign (top bar)
// frees them to be moved anywhere, snapping to the screen edges and to each other. The chart
// fills what's left: a widget docked against an edge (or against another docked widget) keeps
// that side for itself, one left floating sits over the chart. A layout can be saved as a
// template (Settings → Layout) and follows the account.

import { makeStore } from "../trading/settings";

export type WidgetId = "topbar" | "left" | "panel" | "sidebar" | "bottom";
export interface Rect { x: number; y: number; w: number; h: number }

export const WIDGETS: { id: WidgetId; label: string; hint: string; resizeW: boolean; resizeH: boolean }[] = [
  { id: "topbar", label: "Top bar", hint: "Symbol, timeframes, indicators, layout", resizeW: true, resizeH: false },
  { id: "left", label: "Drawing toolbar", hint: "The drawing tools", resizeW: false, resizeH: true },
  { id: "panel", label: "Right panel", hint: "Watchlist, alerts, chats, object tree…", resizeW: true, resizeH: true },
  { id: "sidebar", label: "Right toolbar", hint: "The panels' buttons", resizeW: false, resizeH: true },
  { id: "bottom", label: "Bottom panel", hint: "Date ranges, Strategy Tester, paper trading", resizeW: true, resizeH: false },
];
export const widgetLabel = (id: WidgetId) => WIDGETS.find(w => w.id === id)!.label;

export interface WidgetLayout {
  custom: boolean;                              // false: the default grid
  rects: Partial<Record<WidgetId, Rect>>;       // px, for the screen size below
  viewport: { w: number; h: number };
  colors: Partial<Record<WidgetId, string>>;    // backgrounds ("" / missing: the theme's)
}
export const DEFAULT_WIDGET_LAYOUT: WidgetLayout = { custom: false, rects: {}, viewport: { w: 0, h: 0 }, colors: {} };
export const widgetLayout = makeStore<WidgetLayout>("tv:widgetLayout", DEFAULT_WIDGET_LAYOUT);

export interface LayoutTemplate { id: string; name: string; layout: WidgetLayout; createdAt: number }
export const widgetLayoutTemplates = makeStore<{ items: LayoutTemplate[] }>("tv:widgetLayoutTemplates", { items: [] });

// Redesign mode is the page's own state; anything else starts it with this event
export const startRedesign = () => window.dispatchEvent(new CustomEvent("tv:redesign"));

export const GAP = 4;          // the space between panels, as the grid has it
export const SNAP = 14;        // how close an edge has to come to be pulled in
export const MIN_CUSTOM_WIDTH = 900;   // below this the default grid is used (phones, small tablets)

// ---- sizes the default grid gives each widget

function cssPx(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function gridSizes() {
  return {
    header: cssPx("--tv-header-height", 42),
    left: cssPx("--tv-left-toolbar-width", 56),
    panel: cssPx("--tv-right-toolbar-width", 320),
    sidebar: cssPx("--tv-right-sidebar-width", 50),
    bottom: cssPx("--tv-bottom-toolbar-height", 39),
  };
}

// The sides a widget can't be resized on: its size comes from the site (toolbar widths, the top
// bar's height, the bottom panel's content)
export function fixedSize(id: WidgetId, measuredBottomH?: number): { w?: number; h?: number } {
  const g = gridSizes();
  if (id === "topbar") return { h: g.header - GAP };
  if (id === "left") return { w: g.left - GAP };
  if (id === "sidebar") return { w: g.sidebar - GAP };
  if (id === "bottom") return { h: measuredBottomH || g.bottom };
  return {};
}

// Where the default grid puts each widget, on a W × H screen
export function defaultRects(W: number, H: number): Record<WidgetId, Rect> {
  const g = gridSizes();
  const top = g.header;
  return {
    topbar: { x: 0, y: 0, w: W, h: g.header - GAP },
    left: { x: 0, y: top, w: g.left - GAP, h: H - top },
    sidebar: { x: W - g.sidebar + GAP, y: top, w: g.sidebar - GAP, h: H - top },
    panel: { x: W - g.sidebar - g.panel + GAP, y: top, w: g.panel - GAP, h: H - top },
    bottom: { x: g.left, y: H - g.bottom, w: Math.max(200, W - g.left - g.panel - g.sidebar), h: g.bottom },
  };
}

// ---- fitting a saved layout to this screen: docked edges stay docked, the rest scales

export function fitRects(l: WidgetLayout, W: number, H: number, measuredBottomH?: number): Record<WidgetId, Rect> {
  const base = defaultRects(W, H);
  const vw = l.viewport.w || W, vh = l.viewport.h || H;
  const out = {} as Record<WidgetId, Rect>;
  for (const { id } of WIDGETS) {
    const r = l.rects[id];
    const fixed = fixedSize(id, measuredBottomH);
    if (!r) { out[id] = { ...base[id], ...fixed }; continue; }
    const w = Math.min(W, Math.max(40, fixed.w ?? (vw === W ? r.w : r.w * W / vw)));
    const h = Math.min(H, Math.max(24, fixed.h ?? (vh === H ? r.h : r.h * H / vh)));
    const rh = id === "bottom" ? (measuredBottomH || r.h) : r.h;
    const x = r.x <= 2 ? 0 : r.x + r.w >= vw - 2 ? W - w : r.x * W / vw;
    const y = r.y <= 2 ? 0 : r.y + rh >= vh - 2 ? H - h : r.y * H / vh;
    out[id] = { x: clamp(x, 0, W - w), y: clamp(y, 0, H - h), w, h };
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---- the chart's area: what the side widgets leave free
// A tall widget keeps the side of the screen it's on (left or right of the middle) from its
// inner edge out; a wide one the top or bottom. Small ones float over the chart.

export function chartArea(rects: Partial<Record<WidgetId, Rect>>, W: number, H: number): Rect {
  let L = 0, R = 0, T = 0, B = 0;
  for (const r of Object.values(rects)) {
    if (!r) continue;
    const tallness = r.h / H, wideness = r.w / W;
    const tall = tallness >= 0.4 && tallness >= wideness, wide = !tall && wideness >= 0.3;
    if (tall) {
      if (r.x + r.w / 2 < W / 2) L = Math.max(L, r.x + r.w + GAP);
      else R = Math.max(R, W - r.x + GAP);
    } else if (wide) {
      if (r.y + r.h / 2 < H / 2) T = Math.max(T, r.y + r.h + GAP);
      else B = Math.max(B, H - r.y);
    }
  }
  const w = Math.max(200, W - L - R), h = Math.max(120, H - T - B);
  return { x: Math.min(L, W - w), y: Math.min(T, H - h), w, h };
}

// ---- magnetic moving and resizing

export interface Guide { axis: "x" | "y"; at: number }

function nearest(value: number, candidates: number[]): number | null {
  let best: number | null = null, dist = SNAP + 1;
  for (const c of candidates) { const d = Math.abs(c - value); if (d < dist) { dist = d; best = c; } }
  return best;
}

// A widget moved to (x, y): pulled to the screen edges and the other widgets' edges (a GAP apart,
// or lined up with them) when it comes close; the guides show where it snapped
export function snapMove(r: Rect, others: Rect[], W: number, H: number): { rect: Rect; guides: Guide[] } {
  const xs = [0, W - r.w], ys = [0, H - r.h];
  for (const o of others) {
    xs.push(o.x + o.w + GAP, o.x - GAP - r.w, o.x, o.x + o.w - r.w);
    ys.push(o.y + o.h + GAP, o.y - GAP - r.h, o.y, o.y + o.h - r.h);
  }
  const sx = nearest(r.x, xs), sy = nearest(r.y, ys);
  const x = clamp(sx ?? r.x, 0, W - r.w), y = clamp(sy ?? r.y, 0, H - r.h);
  const guides: Guide[] = [];
  if (sx !== null) guides.push({ axis: "x", at: Math.abs(sx - (W - r.w)) < 1 || others.some(o => Math.abs(o.x + o.w - (sx + r.w)) < 1 || Math.abs(o.x - GAP - r.w - sx) < 1) ? x + r.w : x });
  if (sy !== null) guides.push({ axis: "y", at: Math.abs(sy - (H - r.h)) < 1 || others.some(o => Math.abs(o.y + o.h - (sy + r.h)) < 1 || Math.abs(o.y - GAP - r.h - sy) < 1) ? y + r.h : y });
  return { rect: { ...r, x, y }, guides };
}

// Its right / bottom edge dragged to `edge`: pulled the same way
export function snapEdge(axis: "w" | "h", r: Rect, edge: number, others: Rect[], W: number, H: number): { rect: Rect; guides: Guide[] } {
  const max = axis === "w" ? W : H;
  const cands = [max];
  for (const o of others) {
    if (axis === "w") cands.push(o.x - GAP, o.x + o.w, o.x);
    else cands.push(o.y - GAP, o.y + o.h, o.y);
  }
  const s = nearest(edge, cands);
  const end = clamp(s ?? edge, (axis === "w" ? r.x : r.y) + (axis === "w" ? 120 : 60), max);
  const rect = axis === "w" ? { ...r, w: end - r.x } : { ...r, h: end - r.y };
  return { rect, guides: s !== null ? [{ axis: axis === "w" ? "x" : "y", at: end }] : [] };
}
