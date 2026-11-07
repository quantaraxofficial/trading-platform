"use client";

// Site themes (Settings → Canvas → Site theme): colour combinations for the whole site beyond
// plain light and dark. Each sits on the light or the dark base (data-theme, which every
// component already reads) and swaps:
//   - the site's colour variables (--tv-color-*, toolbars, panels, menus, the paper trading
//     panel, the strategy report), set on <html> so they win over the base's
//   - the chart canvas: background, grid, crosshair, scale text and lines, watermark
//   - the candles
// The chosen theme is a chart setting (synced to the account, kept in templates, undone by
// the dialog's Cancel). "classic" is the plain light / dark look. The variables are also kept
// in localStorage (VARS_KEY) so the layout's inline script paints them before the first frame.
// Dialogs that pick their own colours keep the base's plain light / dark look.

import type { ChartSettings, LineStyleName } from "./chartSettings";

export type SiteThemeBase = "light" | "dark";

type Palette = {
  bg: string;          // the page and chart background
  panel: string;       // raised surfaces: menus, floating toolbars, side panels' strips
  border: string;
  gap: string;         // the gaps between panels
  text: string;
  muted: string;
  hover: string;
  active: string;
  accent: string;
  accentHover: string;
  up: string;          // gains (P&L, changes) — the candles have their own colours
  down: string;
};

export type SiteTheme = {
  id: string;
  name: string;
  base: SiteThemeBase;
  palette: Palette;
  canvas: { grid: string; crosshair: string; scaleText: string; scaleLines: string; watermark: string };
  candle: { up: string; down: string; borderUp?: string; borderDown?: string; wickUp?: string; wickDown?: string };
};

export const CLASSIC_ID = "classic";

// The two classic looks (shown as cards, applied as "classic" on that base)
export const CLASSIC_PREVIEW: Record<SiteThemeBase, { name: string; bg: string; panel: string; text: string; accent: string; up: string; down: string }> = {
  light: { name: "Classic light", bg: "#ffffff", panel: "#f0f3fa", text: "#131722", accent: "#2962ff", up: "#089981", down: "#f23645" },
  dark: { name: "Classic dark", bg: "#131722", panel: "#1e222d", text: "#d1d4dc", accent: "#2962ff", up: "#089981", down: "#f23645" },
};

export const SITE_THEMES: SiteTheme[] = [
  {
    id: "midnight", name: "Midnight", base: "dark",
    palette: { bg: "#0b1120", panel: "#111a2e", border: "#1f2a44", gap: "#1a2338", text: "#cbd5e1", muted: "#7c8aa5", hover: "#1a2540", active: "#22305a", accent: "#3b82f6", accentHover: "#2563eb", up: "#26a69a", down: "#ef5350" },
    canvas: { grid: "rgba(31, 42, 68, 0.7)", crosshair: "#5b6b8c", scaleText: "#cbd5e1", scaleLines: "#1f2a44", watermark: "rgba(124, 138, 165, 0.2)" },
    candle: { up: "#26a69a", down: "#ef5350" },
  },
  {
    id: "ocean", name: "Ocean", base: "dark",
    palette: { bg: "#0a1f26", panel: "#0f2a33", border: "#1c3d48", gap: "#163640", text: "#cfe8ec", muted: "#7fa3ab", hover: "#163640", active: "#1e4651", accent: "#00acc1", accentHover: "#0097a7", up: "#2ee6a8", down: "#ff6b6b" },
    canvas: { grid: "rgba(28, 61, 72, 0.7)", crosshair: "#5f8f99", scaleText: "#cfe8ec", scaleLines: "#1c3d48", watermark: "rgba(127, 163, 171, 0.2)" },
    candle: { up: "#2ee6a8", down: "#ff6b6b" },
  },
  {
    id: "forest", name: "Forest", base: "dark",
    palette: { bg: "#0f1a14", panel: "#15241b", border: "#233a2b", gap: "#1c3024", text: "#d4e4d8", muted: "#84a08c", hover: "#1c3024", active: "#24402f", accent: "#43a047", accentHover: "#388e3c", up: "#8bc34a", down: "#ff7043" },
    canvas: { grid: "rgba(35, 58, 43, 0.7)", crosshair: "#6d8c76", scaleText: "#d4e4d8", scaleLines: "#233a2b", watermark: "rgba(132, 160, 140, 0.2)" },
    candle: { up: "#8bc34a", down: "#ff7043" },
  },
  {
    id: "sunset", name: "Sunset", base: "dark",
    palette: { bg: "#1a1023", panel: "#22162e", border: "#3a2650", gap: "#2c1d3b", text: "#ead9f2", muted: "#a08aae", hover: "#2c1d3b", active: "#3a2650", accent: "#f4511e", accentHover: "#e64a19", up: "#ffc947", down: "#e0457b" },
    canvas: { grid: "rgba(58, 38, 80, 0.7)", crosshair: "#8a6fa0", scaleText: "#ead9f2", scaleLines: "#3a2650", watermark: "rgba(160, 138, 174, 0.2)" },
    candle: { up: "#ffc947", down: "#e0457b" },
  },
  {
    id: "graphite", name: "Graphite", base: "dark",
    palette: { bg: "#161616", panel: "#1f1f1f", border: "#2e2e2e", gap: "#262626", text: "#e0e0e0", muted: "#8a8a8a", hover: "#2a2a2a", active: "#363636", accent: "#616161", accentHover: "#545454", up: "#4caf50", down: "#e57373" },
    canvas: { grid: "rgba(46, 46, 46, 0.8)", crosshair: "#7a7a7a", scaleText: "#e0e0e0", scaleLines: "#2e2e2e", watermark: "rgba(138, 138, 138, 0.2)" },
    // monochrome candles: white rising, grey falling
    candle: { up: "#e6e6e6", down: "#5c5c5c", borderUp: "#e6e6e6", borderDown: "#8c8c8c", wickUp: "#a6a6a6", wickDown: "#a6a6a6" },
  },
  {
    id: "contrast", name: "High contrast", base: "dark",
    palette: { bg: "#000000", panel: "#0d0d0d", border: "#4d4d4d", gap: "#262626", text: "#ffffff", muted: "#bdbdbd", hover: "#1f1f1f", active: "#333333", accent: "#2979ff", accentHover: "#2962ff", up: "#00e676", down: "#ff1744" },
    canvas: { grid: "rgba(255, 255, 255, 0.12)", crosshair: "#ffffff", scaleText: "#ffffff", scaleLines: "#4d4d4d", watermark: "rgba(255, 255, 255, 0.2)" },
    candle: { up: "#00e676", down: "#ff1744" },
  },
  {
    id: "sepia", name: "Sepia", base: "light",
    palette: { bg: "#f8f1e3", panel: "#fbf6ec", border: "#e3d6bd", gap: "#ece1cb", text: "#3b2f22", muted: "#8a7a64", hover: "#efe4cf", active: "#e8dabf", accent: "#a0522d", accentHover: "#8b4513", up: "#4f8a3c", down: "#c0392b" },
    canvas: { grid: "rgba(120, 90, 50, 0.1)", crosshair: "#9c8a70", scaleText: "#3b2f22", scaleLines: "#e3d6bd", watermark: "rgba(120, 90, 50, 0.18)" },
    candle: { up: "#4f8a3c", down: "#c0392b" },
  },
  {
    id: "arctic", name: "Arctic", base: "light",
    palette: { bg: "#f4f7fb", panel: "#ffffff", border: "#d8e1ec", gap: "#e3eaf3", text: "#1f2d3d", muted: "#6b7d93", hover: "#e8eef6", active: "#dbe5f1", accent: "#0284c7", accentHover: "#0369a1", up: "#0d9488", down: "#e11d48" },
    canvas: { grid: "rgba(31, 45, 61, 0.07)", crosshair: "#8a9bb0", scaleText: "#1f2d3d", scaleLines: "#d8e1ec", watermark: "rgba(31, 45, 61, 0.15)" },
    candle: { up: "#0d9488", down: "#e11d48" },
  },
];

export const siteThemeById = (id: string | undefined) => SITE_THEMES.find(t => t.id === id) ?? null;

// The colour variables a theme sets (the classic look sets none: the stylesheet's own apply)
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
export function themeVars(t: SiteTheme): Record<string, string> {
  const p = t.palette, dark = t.base === "dark";
  return {
    "--tv-color-bg": p.bg, "--tv-color-pane-bg": p.bg, "--tv-color-border": p.border,
    "--tv-color-text": p.text, "--tv-color-text-muted": p.muted,
    "--tv-color-accent": p.accent, "--tv-color-accent-hover": p.accentHover,
    "--tv-color-item-hover": p.hover, "--tv-color-item-active": p.active, "--tv-color-bg-hover": p.hover,
    "--tv-color-bull": p.up, "--tv-color-bear": p.down, "--tv-color-live": p.up,
    "--tv-ot-selected": alpha(p.accent, dark ? 0.35 : 0.25), "--tv-ot-selected-child": alpha(p.accent, dark ? 0.18 : 0.1),
    "--tv-sub-bg": p.panel, "--tv-sub-text": p.text, "--tv-sub-hover": p.hover, "--tv-sub-muted": p.muted, "--tv-sub-border": p.border,
    "--tv-hdr-text": p.text, "--tv-hover-neutral": p.hover, "--tv-active-neutral": p.hover, "--tv-active-neutral-hover": p.active,
    "--tv-color-gap": p.gap, "--tv-panel-strip": p.panel, "--tv-trade-pill-border": p.border,
    "--tv-legend-args": p.muted,
    "--tv-trade-panel-bg": p.panel, "--tv-trade-field-border": p.border, "--tv-trade-subtle-bg": p.hover, "--tv-trade-seg-bg": p.hover,
    "--tv-trade-muted": p.muted, "--tv-trade-line-box-bg": p.panel,
    "--tv-trade-buy": p.accent, "--tv-trade-buy-hover": p.accentHover, "--tv-trade-buy-soft": alpha(p.accent, dark ? 0.35 : 0.25),
    "--tv-trade-sell": p.down, "--tv-trade-sell-soft": alpha(p.down, dark ? 0.35 : 0.25), "--tv-trade-tp": p.up,
    "--st-bg": p.bg, "--st-text": p.text, "--st-text-secondary": p.muted, "--st-fill": p.hover, "--st-fill-strong": p.active,
    "--st-row-border": p.hover, "--st-menu-bg": p.panel, "--st-input-border": p.border, "--st-chart-grid": p.hover,
    "--st-pos": p.up, "--st-neg": p.down, "--st-line-green": p.up, "--st-line-red": p.down, "--st-long": p.accent, "--st-short": p.down,
  };
}
// Every variable any theme sets (to clear them for the classic look)
const ALL_VARS = Object.keys(themeVars(SITE_THEMES[0]));
export const VARS_KEY = "tv:siteThemeVars";

// Puts a theme's colour variables on <html> (none for the classic look) and remembers them for
// the next page load's first paint
export function applyThemeVars(id: string | undefined) {
  if (typeof document === "undefined") return;
  const t = siteThemeById(id);
  const root = document.documentElement;
  const vars = t ? themeVars(t) : {};
  ALL_VARS.forEach(k => { if (!(k in vars)) root.style.removeProperty(k); });
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  if (t) root.setAttribute("data-site-theme", t.id); else root.removeAttribute("data-site-theme");
  try { if (t) localStorage.setItem(VARS_KEY, JSON.stringify(vars)); else localStorage.removeItem(VARS_KEY); } catch { /* full */ }
}

const CLASSIC_CANDLE = { upColor: "#089981", downColor: "#f23645", borderUpColor: "#089981", borderDownColor: "#f23645", wickUpColor: "#089981", wickDownColor: "#f23645" };

// The chart settings a theme sets: the theme, its base, the canvas and the candles. (The page
// follows colorsTheme to the theme's light / dark base.)
export function themeSettings(id: string, base: SiteThemeBase, current: ChartSettings, classicCanvas: (dark: boolean) => any): Partial<ChartSettings> {
  const t = id === CLASSIC_ID ? null : siteThemeById(id);
  if (!t) {
    const c = classicCanvas(base === "dark");
    return {
      siteTheme: CLASSIC_ID, colorsTheme: base,
      background: c.background, background2: c.background2, gridVert: c.gridVert, gridHorz: c.gridHorz,
      crosshair: { ...current.crosshair, color: c.crosshair.color }, text: c.text, lines: c.lines, watermarkColor: c.watermarkColor,
      candle: { ...current.candle, ...CLASSIC_CANDLE },
    };
  }
  const k = t.candle;
  return {
    siteTheme: t.id, colorsTheme: t.base,
    background: t.palette.bg, background2: t.palette.bg, gridVert: t.canvas.grid, gridHorz: t.canvas.grid,
    crosshair: { ...current.crosshair, color: t.canvas.crosshair, style: current.crosshair.style as LineStyleName },
    text: t.canvas.scaleText, lines: t.canvas.scaleLines, watermarkColor: t.canvas.watermark,
    candle: {
      ...current.candle,
      upColor: k.up, downColor: k.down, borderUpColor: k.borderUp ?? k.up, borderDownColor: k.borderDown ?? k.down,
      wickUpColor: k.wickUp ?? k.up, wickDownColor: k.wickDown ?? k.down,
    },
  };
}
