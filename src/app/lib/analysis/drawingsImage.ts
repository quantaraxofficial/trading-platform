// The drawings on a chart screenshot (TradingView's or any): Fib retracements, trend lines,
// horizontal lines and rays, vertical lines and rectangles, with their colours, widths and line
// styles, read from the pixels the theme scan (./themeImage) didn't take for the chart itself. And
// where they are: the picture's candles lined up with this chart's bars (the same run of up and
// down candles, their bodies' tops and bottoms against the bars' opens and closes) give each pixel
// its bar and its price — no reading of the axis labels.

import type { ChartScan, RGB } from "./themeImage";

const dist = (a: RGB, b: RGB) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const hex = (c: RGB) => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const medianColor = (cs: RGB[]): RGB => [median(cs.map(c => c[0])), median(cs.map(c => c[1])), median(cs.map(c => c[2]))];

export type LineStyle = "solid" | "dashed" | "dotted";
export type FoundDrawing =
  | { kind: "hline"; y: number; x0: number; x1: number; color: string; width: number; style: LineStyle; left: boolean; right: boolean }
  | { kind: "vline"; x: number; color: string; width: number; style: LineStyle }
  | { kind: "line"; a: { x: number; y: number }; b: { x: number; y: number }; color: string; width: number; style: LineStyle; left: boolean; right: boolean }
  | { kind: "rect"; x0: number; y0: number; x1: number; y1: number; border: string; width: number; fill: string | null; fillAlpha: number }
  | { kind: "fib"; x0: number; x1: number; y0: number; y1: number;            // y0: level 0, y1: level 1
      firstLeft: boolean;                                                      // its first point (level 1) on the left
      levels: { value: number; color: string; y: number }[]; width: number;
      background: boolean; backgroundAlpha: number;
      trend: { color: string; style: LineStyle; width: number } | null;
      left: boolean; right: boolean };

// TradingView's Fib levels (ours are the same)
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236, 1.272, 1.414, 2.272, 2.414, 2, 3, 3.272, 3.414, 4, 4.272, 4.414, 4.618, 4.764];
const FIB_SHOWN = new Set([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236]);

type Seg = { at: number; a: number; b: number; color: RGB; cover: number; thick: number; chart: boolean };

export function findDrawings(scan: ChartScan): FoundDrawing[] {
  const { at, rowBg, inkTol, lineTol, plot, chartColors } = scan;
  const tol = Math.max(lineTol, 6);
  const ink = (x: number, y: number) => dist(at(x, y), rowBg[y]!) > inkTol;
  const chartish = (c: RGB) => chartColors.some(k => dist(c, k) <= tol + 4);
  const W = plot.x1 - plot.x0 + 1, H = plot.y1 - plot.y0 + 1;
  const minLen = Math.max(30, scan.step * 2.5);
  const blocks = uiBlocks(scan);
  // (with a margin: a panel's shadow and edge)
  const inBlock = (x: number, y: number) => blocks.some(b => x >= b.x0 - 12 && x <= b.x1 + 12 && y >= b.y0 - 12 && y <= b.y1 + 12);

  // ---- straight runs of one colour along each row (and column): lines, dashed ones joined up -----
  const runsAlong = (n: number, get: (i: number) => RGB, isInk: (i: number) => boolean, bgAt: (i: number) => RGB) => {
    const runs: { a: number; b: number; color: RGB }[] = [];
    let i = 0;
    while (i < n) {
      if (!isInk(i)) { i++; continue; }
      const c = get(i), start = i;
      while (i < n && isInk(i) && dist(get(i), c) <= tol) i++;
      if (i - start >= 2) runs.push({ a: start, b: i - 1, color: get(Math.floor((start + i - 1) / 2)) });
    }
    void bgAt;
    // (joined across short gaps, for dashed and dotted lines; the chart's own colours only when solid:
    // a row through candles' bodies isn't a line)
    const segs: { a: number; b: number; color: RGB; on: number; pieces: number; chart: boolean; lens: number[]; gaps: number[] }[] = [];
    for (const r of runs) {
      const ch = chartish(r.color);
      // (the line's last piece: past runs of other colours drawn over it)
      let last: (typeof segs)[number] | null = null;
      if (!ch) for (let j = segs.length - 1; j >= Math.max(0, segs.length - 12); j--) if (!segs[j].chart && dist(segs[j].color, r.color) <= tol) { last = segs[j]; break; }
      // (a gap: a dash's, or a candle drawn across the line)
      const gap = last ? r.a - last.b - 1 : 0;
      // (a line only ends where the background shows: candles or volume bars over it don't end it)
      const covered = (from: number, to: number) => { let k = 0; for (let i = from; i <= to; i++) if (isInk(i)) k++; return k >= (to - from + 1) * 0.85; };
      const gapNow = last ? r.a - last.b - 1 : 0;
      const hidden = last && gapNow > 0 && gapNow <= Math.max(20, scan.step * 4) && covered(last.b + 1, r.a - 1);
      if (last && !ch && !last.chart && dist(r.color, last.color) <= tol && (gapNow <= 7 || hidden)) {
        // (a gap under something drawn over the line counts as line; a dash's gap doesn't)
        if (hidden) { last.on += r.b - r.a + 1 + gapNow; last.lens[last.lens.length - 1] += gapNow + r.b - r.a + 1; }
        else { last.on += r.b - r.a + 1; last.lens.push(r.b - r.a + 1); last.gaps.push(gapNow); }
        last.b = r.b; last.pieces++;
      } else segs.push({ a: r.a, b: r.b, color: r.color, on: r.b - r.a + 1, pieces: 1, chart: ch, lens: [r.b - r.a + 1], gaps: [] });
      segs.sort((p, q) => p.b - q.b);
    }
    return segs;
  };
  const collect = (horizontal: boolean): Seg[] => {
    const out: Seg[] = [];
    const lines = horizontal ? H : W, len = horizontal ? W : H;
    for (let l = 0; l < lines; l++) {
      const y = plot.y0 + l, x = plot.x0 + l;
      const segs = horizontal
        ? runsAlong(len, i => at(plot.x0 + i, y), i => ink(plot.x0 + i, y), () => rowBg[y]!)
        : runsAlong(len, i => at(x, plot.y0 + i), i => ink(x, plot.y0 + i), i => rowBg[plot.y0 + i]!);
      for (const s of segs) {
        const L = s.b - s.a + 1;
        if (L < (horizontal ? minLen : Math.max(minLen, H * 0.5))) continue;
        if (s.chart && s.pieces > 1) continue;
        // (dashes are alike and evenly spaced; the strokes of a line of text aren't)
        if (s.gaps.length >= 2 && s.on / L < 0.9) {
          const cv = (xs: number[]) => { const m = xs.reduce((p, v) => p + v, 0) / xs.length; return m ? Math.sqrt(xs.reduce((p, v) => p + (v - m) ** 2, 0) / xs.length) / m : 0; };
          if (cv(s.lens.slice(1, -1).length >= 2 ? s.lens.slice(1, -1) : s.lens) > 0.45 || cv(s.gaps) > 0.45) continue;
        }
        const sa = (horizontal ? plot.x0 : plot.y0) + s.a, sb = (horizontal ? plot.x0 : plot.y0) + s.b;
        // (on a panel of the page's own — a toolbar, a table, a banner — not a drawing)
        if (horizontal ? inBlock(sa, y) && inBlock(sb, y) : inBlock(x, sa) && inBlock(x, sb)) continue;
        out.push({ at: horizontal ? y : x, a: (horizontal ? plot.x0 : plot.y0) + s.a, b: (horizontal ? plot.x0 : plot.y0) + s.b, color: s.color, cover: s.on / L, thick: 1, chart: s.chart });
      }
    }
    // the same line over neighbouring rows is one line (its width); more than 4 rows: a filled area
    out.sort((p, q) => p.at - q.at);
    const merged: Seg[] = [];
    for (const s of out) {
      const m = merged.find(o => o.at + o.thick === s.at && dist(o.color, s.color) <= tol
        && Math.min(o.b, s.b) - Math.max(o.a, s.a) >= 0.8 * Math.min(o.b - o.a, s.b - s.a));
      if (m) { m.thick++; m.a = Math.min(m.a, s.a); m.b = Math.max(m.b, s.b); continue; }
      merged.push({ ...s });
    }
    // a line stands out from what's just beside it; a slice of a shaded area (cut short by the candles
    // in it) is the same colour as the rows next to it
    // (and a grid line seen through a shaded area is only a little darker than it)
    const beside = (s: Seg) => {
      let same = 0, n = 0;
      const ds: number[] = [];
      for (let i = s.a; i <= s.b; i += 3) for (const off of [-2, s.thick + 1]) {
        const c = horizontal ? at(i, s.at + off) : at(s.at + off, i);
        n++; if (dist(c, s.color) <= tol) same++;
        ds.push(dist(c, s.color));
      }
      return { same: n ? same / n : 0, contrast: median(ds) };
    };
    return merged.filter(s => { if (s.thick > 4 || s.cover < 0.4) return false; const b = beside(s); return b.same < 0.4 && b.contrast >= 18; }).map(s => ({ ...s, at: s.at + (s.thick - 1) / 2 }));
  };
  const dedupe = (ls: Seg[]) => ls.filter(s => !ls.some(o => o !== s && Math.abs(o.at - s.at) <= 1.5
    && Math.min(o.b, s.b) - Math.max(o.a, s.a) >= 0.5 * Math.min(o.b - o.a, s.b - s.a)
    && (o.cover * (o.b - o.a) > s.cover * (s.b - s.a) || (o.cover * (o.b - o.a) === s.cover * (s.b - s.a) && ls.indexOf(o) < ls.indexOf(s)))));
  let hs = dedupe(collect(true)), vs = dedupe(collect(false));
  const styleOf = (s: Seg): LineStyle => (s.cover >= 0.9 ? "solid" : s.cover >= 0.6 ? "dashed" : "dotted");
  // (TradingView's own lines aren't drawings: the last price's dashed line, in a candle colour; the
  // crosshair, a dashed line each way in one colour)
  const fullW = (s: Seg) => s.a <= plot.x0 + 3 && s.b >= plot.x1 - 3, fullH = (s: Seg) => s.a <= plot.y0 + 3 && s.b >= plot.y1 - 3;
  hs = hs.filter(s => !(s.chart && styleOf(s) !== "solid" && fullW(s)));
  // (a dashed grey line right across: the crosshair's, the pointer over the chart)
  const grey = (c: RGB) => Math.max(...c) - Math.min(...c) <= 24;
  hs = hs.filter(s => !(s.b - s.a >= W * 0.9 && styleOf(s) !== "solid" && grey(s.color)));
  vs = vs.filter(s => !(s.b - s.a >= H * 0.9 && styleOf(s) !== "solid" && grey(s.color)));
  const crossH = hs.filter(s => fullW(s) && styleOf(s) !== "solid"), crossV = vs.filter(s => fullH(s) && styleOf(s) !== "solid");
  for (const h of crossH) for (const v of crossV) if (dist(h.color, v.color) <= tol) { hs = hs.filter(s => s !== h); vs = vs.filter(s => s !== v); }
  // the grid, should it have slipped through: many full lines of one colour
  hs = hs.filter(s => !(fullW(s) && hs.filter(o => fullW(o) && dist(o.color, s.color) <= tol).length >= 5));
  vs = vs.filter(s => !(fullH(s) && vs.filter(o => fullH(o) && dist(o.color, s.color) <= tol).length >= 5));

  const found: FoundDrawing[] = [];
  const used = new Set<Seg>();
  const colorAt = (x: number, y: number) => at(Math.round(x), Math.round(y));

  // ---- rectangles: a top and a bottom of one colour and width, joined by sides of that colour -----
  for (const t of hs) for (const b of hs) {
    if (used.has(t) || used.has(b) || b.at - t.at < 6 || Math.abs(t.a - b.a) > 2 || Math.abs(t.b - b.b) > 2 || dist(t.color, b.color) > tol) continue;
    const side = (x: number) => {
      let n = 0, k = 0;
      for (let y = Math.ceil(t.at) + 1; y < b.at; y++) { k++; if ([-1, 0, 1].some(d => dist(colorAt(x + d, y), t.color) <= tol)) n++; }
      return k ? n / k : 0;
    };
    if (side(t.a) < 0.7 || side(t.b) < 0.7) continue;
    // the fill: the inside's usual colour (candles under it aside) against the border's
    const inside: RGB[] = [];
    for (let y = Math.ceil(t.at) + t.thick + 1; y < b.at - b.thick; y += 2) for (let x = t.a + t.thick + 1; x < t.b - t.thick; x += 3) inside.push(colorAt(x, y));
    const fillC = modeColorOf(inside);
    const bg = rowBg[Math.round((t.at + b.at) / 2)]!;
    let fill: string | null = null, fillAlpha = 0;
    if (fillC && dist(fillC, bg) > Math.max(6, scan.noise * 2)) {
      // (a see-through fill of its own colour: how far it is from the background towards that colour —
      // TradingView's default fill is the border's colour; another colour, solid as seen)
      const toward = dist(fillC, bg) / Math.max(1, dist(t.color, bg));
      const sameHue = colorDirection(fillC, bg, t.color) > 0.95;
      fillAlpha = sameHue ? Math.min(1, Math.max(0.05, toward)) : estimateAlpha(fillC, bg);
      const base = sameHue ? t.color : unblend(fillC, bg, fillAlpha);
      fill = `rgba(${base.map(v => Math.round(v)).join(", ")}, ${fillAlpha.toFixed(2)})`;
    }
    used.add(t); used.add(b);
    // (an opaque box — a button, a label — is the page's; a drawing's fill is see-through)
    if (fill && fillAlpha >= 0.9) continue;
    found.push({ kind: "rect", x0: t.a, y0: t.at, x1: t.b, y1: b.at, border: hex(t.color), width: t.thick, fill, fillAlpha });
    vs = vs.filter(v => !(Math.abs(v.at - t.a) <= 2 || Math.abs(v.at - t.b) <= 2));
  }

  // ---- Fib retracements: 3+ levels with the same ends, at TradingView's ratios ---------------------
  const free = hs.filter(s => !used.has(s));
  const groups: Seg[][] = [];
  for (const s of free) {
    const g = groups.find(g => Math.abs(g[0].a - s.a) <= 3 && Math.abs(g[0].b - s.b) <= 3);
    if (g) g.push(s); else groups.push([s]);
  }
  for (const g of groups.filter(g => g.length >= 3)) {
    const fib = solveFib(g.map(s => s.at));
    if (!fib) continue;
    g.forEach(s => used.add(s));
    const { y0, y1 } = fib;
    const xa = Math.min(...g.map(s => s.a)), xb = Math.max(...g.map(s => s.b));
    // (a level whose end is hidden under a candle: within the Fib's width, at a ratio not found yet)
    const D = y1 - y0, ftol = Math.max(1.5, Math.abs(D) * 0.006);
    for (const s of hs) {
      if (used.has(s) || s.a < xa - 3 || s.b > xb + 3 || s.b - s.a < (xb - xa) * 0.5) continue;
      const r = FIB_RATIOS.find(r => Math.abs(y0 + r * D - s.at) <= ftol && ![...fib.ratios.values()].includes(r));
      if (r !== undefined) { fib.ratios.set(s.at, r); g.push(s); used.add(s); continue; }
      if (g.some(l => Math.abs(l.at - s.at) <= 4 && dist(l.color, s.color) <= tol)) used.add(s);
    }
    const levels = g.map(s => ({ value: fib.ratios.get(s.at)!, color: hex(s.color), y: s.at })).filter(l => l.value !== undefined).sort((a, b) => a.value - b.value);
    // the background between levels: see-through bands of each level's colour
    const alphas: number[] = [];
    const sorted = [...g].sort((a, b) => a.at - b.at);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const ym = Math.round((sorted[i].at + sorted[i + 1].at) / 2);
      if (sorted[i + 1].at - sorted[i].at < 6) continue;
      const cs: RGB[] = [];
      for (let x = xa + 4; x < xb - 4; x += 5) cs.push(at(x, ym));
      const c = modeColorOf(cs), bg = rowBg[ym]!;
      if (!c || dist(c, bg) <= Math.max(6, scan.noise * 2)) continue;
      // (TradingView shades a band in the colour of one of its two levels)
      const best = [sorted[i], sorted[i + 1]].map(s => ({ s, d: colorDirection(c, bg, s.color) })).sort((p, q) => q.d - p.d)[0];
      if (best.d > 0.9) alphas.push(dist(c, bg) / Math.max(1, dist(best.s.color, bg)));
    }
    const background = alphas.length >= Math.max(1, (sorted.length - 1) * 0.5);
    // its trend line: a diagonal (dashed, by default) from level 1 at one end to level 0 at the other
    const diag = (fromX: number, fromY: number, toX: number, toY: number) => {
      const cs: RGB[] = []; let k = 0;
      for (let i = 0.1; i <= 0.9; i += 0.005) {
        const x = fromX + (toX - fromX) * i, y = fromY + (toY - fromY) * i;
        if (g.some(s => Math.abs(s.at - y) <= 2)) continue;
        k++;
        const c = colorAt(x, y);
        // (a line's pixel differs from those a few pixels to each side; a shaded band's doesn't)
        if (dist(c, colorAt(x - 4, y)) >= 18 && dist(c, colorAt(x + 4, y)) >= 18) cs.push(c);
      }
      const color = cs.length ? modeColorOf(cs) : null;
      const n = color ? cs.filter(c => dist(c, color) <= Math.max(tol, 24)).length : 0;
      return { share: k ? n / k : 0, color };
    };
    const dl = diag(xa, y1, xb, y0), dr = diag(xb, y1, xa, y0);
    const t = dl.share >= dr.share ? dl : dr;
    const trend = t.share >= 0.15 && t.color ? { color: hex(t.color), style: (t.share >= 0.7 ? "solid" : t.share >= 0.25 ? "dashed" : "dotted") as LineStyle, width: 1 } : null;
    found.push({
      kind: "fib", x0: xa, x1: xb, y0, y1, firstLeft: !trend || dl.share >= dr.share, levels, width: Math.round(median(g.map(s => s.thick))),
      background, backgroundAlpha: background ? Math.min(1, Math.max(0.05, median(alphas))) : 0, trend,
      left: xa <= plot.x0 + 3, right: xb >= plot.x1 - 3,
    });
  }

  // ---- horizontal and vertical lines left: a line, a ray to the right, or a level between two points
  for (const s of hs.filter(s => !used.has(s))) {
    const wide = s.b - s.a >= W * 0.7;
    found.push({ kind: "hline", y: s.at, x0: s.a, x1: s.b, color: hex(s.color), width: s.thick, style: styleOf(s), left: wide || s.a <= plot.x0 + 3, right: wide || s.b >= plot.x1 - 3 });
    used.add(s);
  }
  for (const s of vs.filter(s => fullH(s))) found.push({ kind: "vline", x: s.at, color: hex(s.color), width: s.thick, style: styleOf(s) });

  // ---- slanted lines: thin runs of one colour not taken above (dashes joined along their line) -----
  for (const l of slantedLines(scan, hs, vs, found)) found.push(l);
  // (the legend's corner — the symbol, its values, the buy / sell buttons — has no drawings)
  const legend = (x: number, y: number) => y <= plot.y0 + Math.max(70, H * 0.09) && x <= plot.x0 + W * 0.3;
  return found.filter(d => !(d.kind === "hline" ? legend(d.x0, d.y) && legend(d.x1, d.y) && !(d.left && d.right)
    : d.kind === "line" ? legend(d.a.x, d.a.y) && legend(d.b.x, d.b.y)
    : d.kind === "rect" ? legend(d.x0, d.y0) && legend(d.x1, d.y1) : false));
}

// Which Fib levels these are: the 0 and 1 levels' rows that put every row found on one of the ratios
function solveFib(ys: number[]): { y0: number; y1: number; ratios: Map<number, number> } | null {
  const sorted = [...ys].sort((a, b) => a - b);
  let best: { score: number; shown: number; span: number; y0: number; y1: number; ratios: Map<number, number> } | null = null;
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    for (const ra of FIB_RATIOS) for (const rb of FIB_RATIOS) {
      if (ra === rb) continue;
      const D = (sorted[j] - sorted[i]) / (rb - ra);
      if (Math.abs(D) < 8) continue;
      const y0 = sorted[i] - ra * D, y1 = y0 + D;
      const tol = Math.max(1.2, Math.abs(D) * 0.006);
      const ratios = new Map<number, number>();
      let shown = 0;
      for (const y of sorted) {
        const r = FIB_RATIOS.find(r => Math.abs(y0 + r * D - y) <= tol && ![...ratios.values()].includes(r));
        if (r === undefined) continue;
        ratios.set(y, r);
        if (FIB_SHOWN.has(r)) shown++;
      }
      const score = ratios.size;
      const span = Math.max(...ratios.values());
      if (!best || score > best.score || (score === best.score && (shown > best.shown || (shown === best.shown && span < best.span)))) best = { score, shown, span, y0, y1, ratios };
    }
  }
  if (!best || best.score < Math.max(3, sorted.length - 1)) return null;
  const vals = [...best.ratios.values()];
  if (best.score < 4 && !(vals.includes(0) && vals.includes(1))) return null;
  const at = [...best.ratios.keys()].sort((a, b) => a - b);
  if (at.some((y, i) => i && y - at[i - 1] < 4)) return null;
  return best;
}

// Thin slanted lines (trend lines): components of one colour (not the chart's, not the lines found),
// long and narrow; a dashed line's dashes are joined when they lie on one line
function slantedLines(scan: ChartScan, hs: Seg[], vs: Seg[], found: FoundDrawing[]): FoundDrawing[] {
  const { at, rowBg, inkTol, stepTol, plot, chartColors } = scan;
  const tol = Math.max(scan.lineTol, 6);
  const W = plot.x1 - plot.x0 + 1, H = plot.y1 - plot.y0 + 1;
  const taken = new Uint8Array(W * H);
  const mark = (x: number, y: number) => { if (x >= plot.x0 && x <= plot.x1 && y >= plot.y0 && y <= plot.y1) taken[(y - plot.y0) * W + (x - plot.x0)] = 1; };
  for (const s of hs) for (let x = s.a; x <= s.b; x++) for (let d = -2; d <= 2; d++) mark(x, Math.round(s.at) + d);
  for (const s of vs) for (let y = s.a; y <= s.b; y++) for (let d = -2; d <= 2; d++) mark(Math.round(s.at) + d, y);
  for (const f of found) if (f.kind === "rect") for (let y = Math.round(f.y0) - 2; y <= f.y1 + 2; y++) for (let x = f.x0 - 2; x <= f.x1 + 2; x++) {
    if (y <= f.y0 + 2 || y >= f.y1 - 2 || x <= f.x0 + 2 || x >= f.x1 - 2) mark(x, y);
  }
  const chartish = (c: RGB) => chartColors.some(k => dist(c, k) <= tol + 4);
  for (const b of uiBlocks(scan)) for (let y = b.y0 - 12; y <= b.y1 + 12; y++) for (let x = b.x0 - 12; x <= b.x1 + 12; x++) mark(x, y);
  type Piece = { pts: [number, number][]; color: RGB };
  const pieces: Piece[] = [];
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let y = plot.y0; y <= plot.y1; y++) for (let x = plot.x0; x <= plot.x1; x++) {
    const i = (y - plot.y0) * W + (x - plot.x0);
    if (seen[i] || taken[i]) continue;
    seen[i] = 1;
    const c = at(x, y);
    if (dist(c, rowBg[y]!) <= inkTol || chartish(c)) continue;
    const pts: [number, number][] = [];
    stack.length = 0; stack.push(x, y);
    while (stack.length && pts.length < 6000) {
      const py = stack.pop()!, px = stack.pop()!;
      pts.push([px, py]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy;
        if ((!dx && !dy) || qx < plot.x0 || qx > plot.x1 || qy < plot.y0 || qy > plot.y1) continue;
        const qi = (qy - plot.y0) * W + (qx - plot.x0);
        if (seen[qi] || taken[qi]) continue;
        const qc = at(qx, qy);
        if (dist(qc, rowBg[qy]!) <= inkTol || dist(qc, c) > Math.max(tol, stepTol)) continue;
        seen[qi] = 1;
        stack.push(qx, qy);
      }
    }
    if (pts.length < 3 || pts.length >= 6000) continue;
    pieces.push({ pts, color: c });
  }
  // each piece's line (its principal direction), kept when thin
  type Line = { a: [number, number]; b: [number, number]; dir: [number, number]; color: RGB; n: number; width: number };
  const fit = (pts: [number, number][]): Line | null => {
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), dir: [number, number] = [Math.cos(ang), Math.sin(ang)];
    let lo = Infinity, hi = -Infinity, off = 0;
    for (const [x, y] of pts) {
      const t = (x - mx) * dir[0] + (y - my) * dir[1];
      lo = Math.min(lo, t); hi = Math.max(hi, t);
      off = Math.max(off, Math.abs(-(x - mx) * dir[1] + (y - my) * dir[0]));
    }
    const len = hi - lo + 1;
    if (len < 3 || off > 2.5 || pts.length > len * 4) return null;
    return { a: [mx + lo * dir[0], my + lo * dir[1]], b: [mx + hi * dir[0], my + hi * dir[1]], dir, color: [0, 0, 0], n: pts.length, width: Math.max(1, Math.round(pts.length / len)) };
  };
  const lines: (Line & { len: number; on: number })[] = [];
  for (const p of pieces) {
    const l = fit(p.pts);
    if (!l) continue;
    lines.push({ ...l, color: p.color, len: Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) + 1, on: Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) + 1 });
  }
  // dashes along one line, joined (nearest first)
  lines.sort((p, q) => q.len - p.len);
  const out: FoundDrawing[] = [];
  const usedL = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (usedL.has(i)) continue;
    let cur = { ...lines[i] };
    usedL.add(i);
    for (let grew = true; grew;) {
      grew = false;
      for (let j = 0; j < lines.length; j++) {
        if (usedL.has(j)) continue;
        const o = lines[j];
        if (dist(o.color, cur.color) > tol) continue;
        // on the line (both its ends), next to one end
        const offOf = (p: [number, number]) => Math.abs(-(p[0] - cur.a[0]) * cur.dir[1] + (p[1] - cur.a[1]) * cur.dir[0]);
        if (offOf(o.a) > 1.8 || offOf(o.b) > 1.8) continue;
        const tOf = (p: [number, number]) => (p[0] - cur.a[0]) * cur.dir[0] + (p[1] - cur.a[1]) * cur.dir[1];
        const curLen = tOf(cur.b);
        const ta = tOf(o.a), tb = tOf(o.b), lo = Math.min(ta, tb), hi = Math.max(ta, tb);
        if (!(hi >= -10 && lo <= curLen + 10)) continue;
        const nlo = Math.min(0, lo), nhi = Math.max(curLen, hi);
        const a: [number, number] = [cur.a[0] + nlo * cur.dir[0], cur.a[1] + nlo * cur.dir[1]];
        const b: [number, number] = [cur.a[0] + nhi * cur.dir[0], cur.a[1] + nhi * cur.dir[1]];
        cur = { ...cur, a, b, len: nhi - nlo + 1, on: cur.on + o.on, n: cur.n + o.n };
        usedL.add(j); grew = true;
      }
    }
    const angle = Math.abs(Math.atan2(cur.b[1] - cur.a[1], cur.b[0] - cur.a[0])) * 180 / Math.PI;
    const flat = Math.min(angle, 180 - angle) < 1.5 || Math.abs(angle - 90) < 1.5;
    if (cur.len < Math.max(30, scan.step * 2.5) || flat) continue;
    const cover = Math.min(1, cur.on / cur.len);
    if (cover < 0.4) continue;
    const [p, q] = cur.a[0] <= cur.b[0] ? [cur.a, cur.b] : [cur.b, cur.a];
    out.push({ kind: "line", a: { x: p[0], y: p[1] }, b: { x: q[0], y: q[1] }, color: hex(cur.color), width: cur.width,
      style: cover >= 0.9 ? "solid" : cover >= 0.6 ? "dashed" : "dotted", left: p[0] <= plot.x0 + 3, right: q[0] >= plot.x1 - 3 });
  }
  return out;
}

// The page's own panels over the chart (a floating toolbar, a table, a banner, an ad): solid areas
// of one colour far from the background. A drawing's fill is see-through: near the background.
// (cached per scan)
const blockCache = new WeakMap<ChartScan, { x0: number; x1: number; y0: number; y1: number }[]>();
function uiBlocks(scan: ChartScan) {
  const hit = blockCache.get(scan);
  if (hit) return hit;
  const { at, rowBg, plot } = scan;
  type Region = { x0: number; x1: number; y0: number; y1: number; n: number; color: RGB; last: { a: number; b: number }[]; lastY: number };
  const regions: Region[] = [];
  for (let y = plot.y0; y <= plot.y1; y++) {
    const bg = rowBg[y]!;
    let x = plot.x0;
    const runs: { a: number; b: number; c: RGB }[] = [];
    while (x <= plot.x1) {
      const c = at(x, y);
      if (dist(c, bg) < 100) { x++; continue; }
      const a = x;
      while (x <= plot.x1 && dist(at(x, y), c) <= 6) x++;
      if (x - a >= 20) runs.push({ a, b: x - 1, c });
    }
    for (const r of runs) {
      const reg = regions.find(g => g.lastY >= y - 2 && dist(g.color, r.c) <= 8 && g.last.some(l => l.a <= r.b && r.a <= l.b));
      if (reg) {
        reg.x0 = Math.min(reg.x0, r.a); reg.x1 = Math.max(reg.x1, r.b); reg.y1 = y; reg.n += r.b - r.a + 1;
        if (reg.lastY !== y) { reg.last = []; reg.lastY = y; }
        reg.last.push({ a: r.a, b: r.b });
      } else regions.push({ x0: r.a, x1: r.b, y0: y, y1: y, n: r.b - r.a + 1, color: r.c, last: [{ a: r.a, b: r.b }], lastY: y });
    }
  }
  const out = regions.filter(g => g.y1 - g.y0 >= 9 && g.x1 - g.x0 >= 29 && g.n >= (g.x1 - g.x0 + 1) * (g.y1 - g.y0 + 1) * 0.45)
    .map(g => ({ x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1 }));
  blockCache.set(scan, out);
  return out;
}

function modeColorOf(cs: RGB[]): RGB | null {
  if (!cs.length) return null;
  const q = (c: RGB) => ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
  const m = new Map<number, number>();
  let best = 0, bestN = 0;
  for (const c of cs) { const k = q(c), n = (m.get(k) ?? 0) + 1; m.set(k, n); if (n > bestN) { bestN = n; best = k; } }
  return medianColor(cs.filter(c => q(c) === best));
}
// how much c lies on the way from bg towards target (1: exactly that direction)
function colorDirection(c: RGB, bg: RGB, target: RGB): number {
  const u = [c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]], v = [target[0] - bg[0], target[1] - bg[1], target[2] - bg[2]];
  const nu = Math.hypot(...u), nv = Math.hypot(...v);
  return nu && nv ? (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv) : 0;
}
// a fill of an unknown colour: TradingView's usual see-through (20%), else as seen
function estimateAlpha(c: RGB, bg: RGB): number {
  const a = 0.2, base = unblend(c, bg, a);
  return base.every(v => v >= -2 && v <= 257) ? a : 1;
}
function unblend(c: RGB, bg: RGB, a: number): RGB {
  return [0, 1, 2].map(i => Math.max(0, Math.min(255, (c[i] - (1 - a) * bg[i]) / a))) as RGB;
}

// ---- where the picture is on this chart -----------------------------------------------------------
export type Bar = { time: number; open: number; high: number; low: number; close: number };
export type Alignment = {
  k: number;         // the bar under the picture's first candle
  x0: number; step: number;
  a: number; b: number; log: boolean;   // y = a·price + b (a·ln(price) + b on a log scale)
  rms: number; agree: number; candles: number;
};

// The picture's candles against the bars: the run of up / down candles that matches, then the
// straight line from price to pixel that its bodies' tops and bottoms fit best
export function alignCandles(scan: ChartScan, bars: Bar[]): Alignment | null {
  const cs = [...scan.candles].sort((p, q) => p.x - q.x);
  if (cs.length < 12 || !(scan.step > 1) || bars.length < cs.length) return null;
  // each candle's slot, then the spacing and start that fit the slots best
  let step = scan.step, x0 = cs[0].x;
  for (let pass = 0; pass < 2; pass++) {
    const slots = cs.map(c => Math.round((c.x - x0) / step));
    const n = cs.length, sx = slots.reduce((s, v) => s + v, 0), sy = cs.reduce((s, c) => s + c.x, 0);
    const sxx = slots.reduce((s, v) => s + v * v, 0), sxy = slots.reduce((s, v, i) => s + v * cs[i].x, 0);
    const den = n * sxx - sx * sx;
    if (den) { step = (n * sxy - sx * sy) / den; x0 = (sy - step * sx) / n; }
  }
  const slots = cs.map(c => Math.round((c.x - x0) / step));
  const span = Math.max(...slots);
  const cands: { k: number; agree: number }[] = [];
  for (let k = 0; k + span < bars.length; k++) {
    let ok = 0, n = 0;
    for (let i = 0; i < cs.length; i++) {
      const b = bars[k + slots[i]];
      if (b.close === b.open) continue;
      n++;
      if ((b.close > b.open) === cs[i].up) ok++;
    }
    if (n >= 10) cands.push({ k, agree: ok / n });
  }
  cands.sort((p, q) => q.agree - p.agree);
  let best: Alignment | null = null;
  for (const c of cands.slice(0, 40)) {
    if (c.agree < 0.75) break;
    for (const log of [false, true]) {
      const px: number[] = [], py: number[] = [];
      cs.forEach((cd, i) => {
        const b = bars[c.k + slots[i]];
        const f = (p: number) => (log ? Math.log(p) : p);
        px.push(f(Math.max(b.open, b.close)), f(Math.min(b.open, b.close))); py.push(cd.top, cd.bottom);
      });
      // (a straight fit, then again without the pairs far off it: a body misread, a candle the feeds differ on)
      let keep = px.map((_, i) => i), a = 0, b = 0, rms = Infinity;
      for (let pass = 0; pass < 3 && keep.length >= 10; pass++) {
        const n = keep.length, mx = keep.reduce((s, i) => s + px[i], 0) / n, my = keep.reduce((s, i) => s + py[i], 0) / n;
        let sxx = 0, sxy = 0;
        for (const i of keep) { sxx += (px[i] - mx) ** 2; sxy += (px[i] - mx) * (py[i] - my); }
        if (!sxx) break;
        a = sxy / sxx; b = my - a * mx;
        const res = keep.map(i => Math.abs(a * px[i] + b - py[i]));
        rms = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n);
        const cut = Math.max(2, median(res) * 3);
        keep = keep.filter((_, j) => res[j] <= cut);
      }
      if (!(a < 0) || keep.length < px.length * 0.6) continue;
      if (!best || rms < best.rms) best = { k: c.k, x0, step, a, b, log, rms, agree: c.agree, candles: cs.length };
    }
  }
  if (!best) return null;
  const bodyH = median(cs.map(c => c.bottom - c.top + 1));
  return best.rms <= Math.max(3, bodyH * 0.35) ? best : null;
}

// a pixel's bar (fractional) and price under an alignment
export const barAt = (al: Alignment, x: number) => al.k + (x - al.x0) / al.step;
export const priceAt = (al: Alignment, y: number) => (al.log ? Math.exp((y - al.b) / al.a) : (y - al.b) / al.a);
