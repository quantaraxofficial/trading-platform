// Settings → Canvas → Background image: a photo shown behind the candles. The picture itself
// lives in its own store (it's large; templates and the chart settings stay small) and follows
// the account like the other settings; whether it shows, how strongly and how it's fitted are
// chart settings (bgImage, bgImageOpacity, bgImageFit).

import type { CSSProperties } from "react";
import { makeStore } from "../trading/settings";

export const BG_IMAGE_KEY = "tv:chartBgImage";
export const chartBgImage = makeStore<{ data: string; name: string }>(BG_IMAGE_KEY, { data: "", name: "" });

export const BG_IMAGE_FITS = ["Fill", "Fit", "Stretch", "Center", "Tile"] as const;
export type BgImageFit = (typeof BG_IMAGE_FITS)[number];

// Under the settings sync's per-setting limit (2M characters), with room to spare
const MAX_CHARS = 1_600_000;
const MAX_SIDE = 2560;

// Reads a picked image file, shrunk to at most 2560px a side and re-encoded (JPEG; PNG when
// it has transparency and stays small enough), as a data URL that fits in a setting
export async function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image"));
      el.src = url;
    });
    let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Couldn't read that image");
      ctx.drawImage(img, 0, 0, w, h);
      if (file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif") {
        const png = canvas.toDataURL("image/png");
        if (png.length <= MAX_CHARS) return png;
      }
      for (const q of [0.88, 0.8, 0.7]) {
        const jpg = canvas.toDataURL("image/jpeg", q);
        if (jpg.length <= MAX_CHARS) return jpg;
      }
      scale *= 0.7;
    }
    throw new Error("That image is too large");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A colour with its opacity scaled (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba())
export function withAlpha(color: string, alpha: number): string {
  const c = (color || "").trim();
  let r = 0, g = 0, b = 0, a = 1;
  const hex = c.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map(x => x + x).join("");
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const m = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/i);
    if (!m) return c;
    r = +m[1]; g = +m[2]; b = +m[3];
    if (m[4]) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4];
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a * alpha)).toFixed(3)})`;
}

const SIZE: Record<BgImageFit, { size: string; repeat: string }> = {
  Fill: { size: "cover", repeat: "no-repeat" },
  Fit: { size: "contain", repeat: "no-repeat" },
  Stretch: { size: "100% 100%", repeat: "no-repeat" },
  Center: { size: "auto", repeat: "no-repeat" },
  Tile: { size: "auto", repeat: "repeat" },
};

// The CSS background for the chart's canvas area: the background colour (or gradient) over the
// photo, see-through by the image's strength (100%: the photo as is; 0%: just the colour)
export function canvasBackgroundCss(opts: { data: string; opacity: number; fit: BgImageFit; type: "Solid" | "Gradient"; top: string; bottom: string }): CSSProperties {
  const veil = 1 - Math.max(0, Math.min(100, opts.opacity)) / 100;
  const overlay = opts.type === "Gradient"
    ? `linear-gradient(${withAlpha(opts.top, veil)}, ${withAlpha(opts.bottom, veil)})`
    : `linear-gradient(${withAlpha(opts.top, veil)}, ${withAlpha(opts.top, veil)})`;
  const base = opts.type === "Gradient" ? `linear-gradient(${opts.top}, ${opts.bottom})` : `linear-gradient(${opts.top}, ${opts.top})`;
  const s = SIZE[opts.fit] || SIZE.Fill;
  return {
    backgroundImage: `${overlay}, url("${opts.data}"), ${base}`,
    backgroundSize: `100% 100%, ${s.size}, 100% 100%`,
    backgroundRepeat: `no-repeat, ${s.repeat}, no-repeat`,
    backgroundPosition: "center, center, center",
  };
}

// For snapshots: paints what the canvas area shows (the photo under the background colour) into
// a picture's rectangle, since the chart's own canvases are see-through while it's on
export async function paintCanvasBackground(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  opts: { data: string; opacity: number; fit: BgImageFit; type: "Solid" | "Gradient"; top: string; bottom: string }) {
  const img = await new Promise<HTMLImageElement | null>(resolve => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = opts.data;
  });
  const fill = (top: string, bottom: string) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };
  const bottom = opts.type === "Gradient" ? opts.bottom : opts.top;
  fill(opts.top, bottom);
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (opts.fit === "Tile") {
      for (let ty = y; ty < y + h; ty += ih) for (let tx = x; tx < x + w; tx += iw) ctx.drawImage(img, tx, ty);
    } else if (opts.fit === "Stretch") {
      ctx.drawImage(img, x, y, w, h);
    } else {
      const k = opts.fit === "Fill" ? Math.max(w / iw, h / ih) : opts.fit === "Fit" ? Math.min(w / iw, h / ih) : 1;
      const dw = iw * k, dh = ih * k;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
    ctx.restore();
  }
  const veil = 1 - Math.max(0, Math.min(100, opts.opacity)) / 100;
  fill(withAlpha(opts.top, veil), withAlpha(bottom, veil));
}
