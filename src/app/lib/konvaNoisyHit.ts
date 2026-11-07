"use client";

import Konva from "konva";

// Konva finds the shape under the pointer by drawing every shape in its own colour on a hidden
// "hit" canvas and looking the pixel's colour up exactly. Brave (fingerprinting protection, on by
// default) and some privacy add-ons add a little random noise to canvas pixels read back by a page:
// the line keyed #1834e9 (24, 52, 233) read back as (25, 52, 232), the lookup found nothing, and
// shapes couldn't be hovered, selected or middle-click deleted. This keeps Konva's lookup and,
// when the exact colour isn't a shape, takes the nearest shape colour within a few steps per
// channel. Konva's colour keys are random 24-bit colours, so a near miss landing on another
// shape is very unlikely; an exact match always wins.

const SPREAD = 3;
let installed = false;

export function installNoisyCanvasHit() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const K = Konva as any;
  const shapes: Record<string, any> = K.shapes;
  const proto = K.Layer?.prototype;
  if (!shapes || !proto || typeof proto._getIntersection !== "function") return;
  const key = (r: number, g: number, b: number) => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  // the neighbours to try, nearest first
  const offsets: [number, number, number][] = [];
  for (let dr = -SPREAD; dr <= SPREAD; dr++)
    for (let dg = -SPREAD; dg <= SPREAD; dg++)
      for (let db = -SPREAD; db <= SPREAD; db++)
        if (dr || dg || db) offsets.push([dr, dg, db]);
  offsets.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) + Math.abs(a[2]) - (Math.abs(b[0]) + Math.abs(b[1]) + Math.abs(b[2])));

  proto._getIntersection = function (pos: { x: number; y: number }) {
    const ratio = this.hitCanvas.pixelRatio;
    const p = this.hitCanvas.context.getImageData(Math.round(pos.x * ratio), Math.round(pos.y * ratio), 1, 1).data;
    const a = p[3];
    // (the noise can touch alpha too: nearly opaque counts as opaque)
    if (a >= 255 - SPREAD) {
      const exact = shapes[key(p[0], p[1], p[2])];
      if (exact) return { shape: exact };
      for (const [dr, dg, db] of offsets) {
        const r = p[0] + dr, g = p[1] + dg, b = p[2] + db;
        if (r < 0 || g < 0 || b < 0 || r > 255 || g > 255 || b > 255) continue;
        const s = shapes[key(r, g, b)];
        if (s) return { shape: s };
      }
      return { antialiased: true };
    }
    if (a > SPREAD) return { antialiased: true };
    return {};
  };
}
