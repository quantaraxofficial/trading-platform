// Typefaces the site can switch to: ones every computer has (no downloads), each with fallbacks.
// Used for the whole site (Settings → Canvas → Site font) and for chat themes.

export type FontKey = "default" | "modern" | "classic" | "wide" | "mono" | "casual";

// TradingView's own stack (what the site uses when nothing else is picked)
export const DEFAULT_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

export const FONTS: Record<FontKey, { label: string; css: string }> = {
  default: { label: "Default", css: "" },
  modern: { label: "Modern", css: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
  classic: { label: "Classic", css: "Georgia, 'Times New Roman', serif" },
  wide: { label: "Wide", css: "Verdana, Geneva, Tahoma, sans-serif" },
  mono: { label: "Typewriter", css: "Consolas, 'Courier New', monospace" },
  casual: { label: "Casual", css: "'Comic Sans MS', 'Segoe Print', 'Chalkboard SE', cursive" },
};
export const FONT_KEYS = Object.keys(FONTS) as FontKey[];

// The whole site in one font: every element, over the fonts components set themselves, except
// code (the Pine Editor's), which stays monospaced
const STYLE_ID = "tv-site-font";
export function applySiteFont(key: FontKey | string | undefined) {
  if (typeof document === "undefined") return;
  const css = FONTS[(key as FontKey)]?.css || "";
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `body, body *:not(.monaco-editor):not(.monaco-editor *):not(code):not(pre):not(kbd) { font-family: ${css} !important; }`;
}
