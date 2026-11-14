// "Make my chart look like this" with a screenshot attached in the voice panel: the colours read from
// the image (lib/analysis/themeImage) put on this site's chart — background (solid / gradient), grid,
// scale text and lines, the candles' body / border / wick colours — and the page's light / dark theme
// to match the page around the chart. Applied at once (as the Settings dialog does); a no puts the
// colours and the theme back as they were.

import { readThemeImage, type ImageTheme, type Pixels } from "../analysis/themeImage";
import { chartSettings, takeSnapshot, applySnapshot, type ChartSettings } from "../chartSettings";

export type ThemePart = "chart" | "candles" | "page";
export const THEME_PARTS: ThemePart[] = ["chart", "candles", "page"];

// The image's pixels (a very large one halved: plenty for a chart's colours)
export async function imagePixels(file: Blob): Promise<Pixels> {
  const bmp = await createImageBitmap(file);
  const scale = Math.max(bmp.width, bmp.height) > 4000 ? 0.5 : 1;
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = scale !== 1;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const d = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

export type ThemeApplied = { theme: ImageTheme; summary: string; undo: () => void };

// Reads the image and applies what it found (only the parts asked for); null: no chart found in it
export async function applyImageTheme(file: Blob, parts: ThemePart[] = THEME_PARTS): Promise<ThemeApplied | null> {
  const t = readThemeImage(await imagePixels(file));
  if (!t) return null;
  const before = takeSnapshot();
  const pageBefore = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const want = new Set(parts);
  const said: string[] = [];
  const patch: Partial<ChartSettings> = {};

  // the page first: switching it resets the chart's colours to the theme's, unless they're marked as
  // that theme's already (colorsTheme), as these are
  const pageTheme = t.pageDark ? "dark" : "light";
  const switchPage = want.has("page") && pageTheme !== pageBefore;
  if (want.has("chart") || want.has("candles")) patch.colorsTheme = want.has("page") ? pageTheme : pageBefore;

  if (want.has("chart")) {
    patch.backgroundType = t.gradient ? "Gradient" : "Solid";
    patch.background = t.background; patch.background2 = t.background2;
    said.push(t.gradient ? `a gradient background from ${t.background} to ${t.background2}` : `background ${t.background}`);
    patch.horzGrid = !!t.gridHorz; patch.vertGrid = !!t.gridVert;
    if (t.gridHorz) patch.gridHorz = t.gridHorz;
    if (t.gridVert) patch.gridVert = t.gridVert;
    said.push(t.gridHorz || t.gridVert ? `grid ${t.gridHorz ?? t.gridVert}${t.gridHorz && t.gridVert ? "" : t.gridHorz ? " (horizontal lines only)" : " (vertical lines only)"}` : "no grid lines");
    if (t.text) { patch.text = t.text; said.push(`scale text ${t.text}`); }
    if (t.lines) patch.lines = t.lines;
  }
  if (want.has("candles") && t.up && t.down) {
    patch.candle = {
      ...chartSettings.get().candle,
      upColor: t.up.body, downColor: t.down.body, borderUpColor: t.up.border, borderDownColor: t.down.border, wickUpColor: t.up.wick, wickDownColor: t.down.wick,
      bodyVisible: true, borderVisible: true, wickVisible: true,
    };
    const extra = (c: { body: string; border: string; wick: string }) =>
      c.border !== c.body || c.wick !== c.body ? ` (border ${c.border}, wick ${c.wick})` : "";
    said.push(`up candles ${t.up.body}${extra(t.up)}, down candles ${t.down.body}${extra(t.down)}`
      + (t.upBy === "joins" ? "" : ", up told apart by colour, not by how the candles join: check it"));
  }
  if (!Object.keys(patch).length && !switchPage) return { theme: t, summary: "", undo: () => {} };

  chartSettings.set(patch);
  if (switchPage) {
    window.dispatchEvent(new CustomEvent("tv:set-theme", { detail: { theme: pageTheme } }));
    said.push(`the ${pageTheme} page theme`);
    // (in case the page's switch ran after these and put its own colours on: once more)
    setTimeout(() => { if (chartSettings.get().background !== patch.background && patch.background) chartSettings.set(patch); }, 400);
  }
  return {
    theme: t,
    summary: said.join(", "),
    undo: () => {
      if (switchPage) window.dispatchEvent(new CustomEvent("tv:set-theme", { detail: { theme: pageBefore } }));
      applySnapshot({ chart: { ...before.chart, colorsTheme: pageBefore } });
      setTimeout(() => applySnapshot({ chart: { ...before.chart, colorsTheme: pageBefore } }), 400);
    },
  };
}
