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
      left: boolean; right: boolean }
  | { kind: "position"; long: boolean; x0: number; x1: number; entry: number; target: number; stop: number }
  | { kind: "channel"; a: P; b: P; c: P; color: string; width: number; fill: string | null }
  | { kind: "arrow"; a: P; b: P; color: string; width: number; style: LineStyle }
  | { kind: "path"; pts: P[]; color: string; width: number; arrow: boolean; brush: boolean }
  | { kind: "triangle"; pts: [P, P, P]; color: string; width: number; fill: string | null }
  | { kind: "ellipse"; cx: number; cy: number; ra: number; rb: number; angle: number; circle: boolean; color: string; width: number; fill: string | null }
  | { kind: "cross"; x: number; y: number; color: string; width: number; style: LineStyle }
  | { kind: "marker"; x: number; y: number; up: boolean; color: string }
  | { kind: "range"; x0: number; y0: number; x1: number; y1: number; price: boolean; date: boolean; up: boolean; right: boolean; color: string; fill: string | null };
type P = { x: number; y: number };

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
  const runsAlong = (n: number, get: (i: number) => RGB, isInk: (i: number) => boolean, bgAt: (i: number) => RGB, horizontal: boolean) => {
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
      const hidden = last && gapNow > 0 && gapNow <= (horizontal ? Math.max(20, scan.step * 4) : Math.max(20, H * 0.25)) && covered(last.b + 1, r.a - 1);
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
        ? runsAlong(len, i => at(plot.x0 + i, y), i => ink(plot.x0 + i, y), () => rowBg[y]!, true)
        : runsAlong(len, i => at(x, plot.y0 + i), i => ink(x, plot.y0 + i), i => rowBg[plot.y0 + i]!, false);
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
        if (horizontal) {
          const row = textBoxes(scan).filter(b => y >= b.y0 && y <= b.y1);
          let inText = 0;
          for (let xx = sa; xx <= sb; xx += 2) if (row.some(b => xx >= b.x0 - 4 && xx <= b.x1 + 4)) inText++;
          if (row.length && inText >= ((sb - sa) / 2 + 1) * 0.8) continue;
        }
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
  // (most of the height: its ends hidden under something)
  // (a faint grey line from top to bottom is a scale's border, not a drawing)
  const faint = (s: Seg) => Math.max(...s.color) - Math.min(...s.color) <= 12 && dist(s.color, rowBg[Math.round((s.a + s.b) / 2)]!) < 40;
  for (const s of vs.filter(s => (fullH(s) || s.b - s.a >= H * 0.7) && !faint(s))) found.push({ kind: "vline", x: s.at, color: hex(s.color), width: s.thick, style: styleOf(s) });

  // ---- everything else: see-through shapes (positions, ranges, triangles, ellipses), slanted lines
  // (dashes joined), arrows, paths, channels, arrow marks; and a cross line from its two lines -----
  for (const l of freeShapes(scan, hs, vs, found)) found.push(l);
  for (const h of found.filter(d => d.kind === "hline" && d.left && d.right) as Extract<FoundDrawing, { kind: "hline" }>[]) {
    const v = found.find(d => d.kind === "vline" && d.color === h.color) as Extract<FoundDrawing, { kind: "vline" }> | undefined;
    if (!v) continue;
    found.splice(found.indexOf(h), 1); found.splice(found.indexOf(v), 1);
    found.push({ kind: "cross", x: v.x, y: h.y, color: h.color, width: h.width, style: h.style });
  }
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

// Text on the chart (the legend, labels, a text drawing): rows of glyph-sized marks of one colour.
// Masked out, so letters aren't read as lines. (cached per scan)
const textCache = new WeakMap<ChartScan, { x0: number; x1: number; y0: number; y1: number }[]>();
export function textBoxes(scan: ChartScan) {
  const hit = textCache.get(scan);
  if (hit) return hit;
  const { at, rowBg, inkTol, stepTol, plot, chartColors } = scan;
  const tol = Math.max(scan.lineTol, 6);
  const W = plot.x1 - plot.x0 + 1, H = plot.y1 - plot.y0 + 1;
  const chartish = (c: RGB) => chartColors.some(k => dist(c, k) <= tol + 4);
  const seen = new Uint8Array(W * H);
  const glyphs: { x0: number; x1: number; y0: number; y1: number; c: RGB }[] = [];
  const stack: number[] = [];
  for (let y = plot.y0; y <= plot.y1; y++) for (let x = plot.x0; x <= plot.x1; x++) {
    const i = (y - plot.y0) * W + (x - plot.x0);
    if (seen[i]) continue;
    seen[i] = 1;
    const c = at(x, y);
    if (dist(c, rowBg[y]!) <= inkTol || chartish(c)) continue;
    let n = 0, x0 = x, x1 = x, y0 = y, y1 = y;
    stack.length = 0; stack.push(x, y);
    while (stack.length) {
      const py = stack.pop()!, px = stack.pop()!;
      n++;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      if (n > 400) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy;
        if ((!dx && !dy) || qx < plot.x0 || qx > plot.x1 || qy < plot.y0 || qy > plot.y1) continue;
        const qi = (qy - plot.y0) * W + (qx - plot.x0);
        if (seen[qi]) continue;
        const qc = at(qx, qy);
        if (dist(qc, rowBg[qy]!) <= inkTol || dist(qc, at(px, py)) > Math.max(tol, stepTol) * 3) continue;
        seen[qi] = 1;
        stack.push(qx, qy);
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (n >= 4 && n <= 900 && w <= 90 && h >= 5 && h <= 18 && n <= w * h * 0.7) glyphs.push({ x0, x1, y0, y1, c });
  }
  // glyphs side by side on one line: a word, a line of text
  glyphs.sort((a, b) => a.x0 - b.x0);
  const lines: (typeof glyphs)[] = [];
  for (const g of glyphs) {
    const cy = (g.y0 + g.y1) / 2;
    const l = lines.find(l => { const p = l[l.length - 1]; return Math.abs((p.y0 + p.y1) / 2 - cy) <= 4 && g.x0 - p.x1 <= 12 && g.x0 >= p.x0; });
    if (l) l.push(g); else lines.push([g]);
  }
  // (three glyphs or more in a row; or a word or two, wide ones)
  const out = lines.filter(l => l.length >= 3 || l.reduce((t, g) => t + g.x1 - g.x0, 0) >= 30 && l.every(g => g.x1 - g.x0 >= 12)).map(l => ({
    x0: Math.min(...l.map(g => g.x0)) - 2, x1: Math.max(...l.map(g => g.x1)) + 2, y0: Math.min(...l.map(g => g.y0)) - 2, y1: Math.max(...l.map(g => g.y1)) + 2,
  }));
  textCache.set(scan, out);
  return out;
}

// The rest of the tools, from what's left after the lines, rectangles and Fibs: each patch of one
// colour (not the chart's own) is a see-through fill (a shape's inside), a small solid mark, or a
// thin stroke. Strokes are cut into straight parts, the parts of one line joined again across what's
// drawn over them (candles, text), then chained: a line, an arrow, a path, a triangle, a channel.
function freeShapes(scan: ChartScan, hs: Seg[], vs: Seg[], found: FoundDrawing[]): FoundDrawing[] {
  const { at, rowBg, inkTol, stepTol, plot, chartColors } = scan;
  const tol = Math.max(scan.lineTol, 6);
  const W = plot.x1 - plot.x0 + 1, H = plot.y1 - plot.y0 + 1;
  const taken = new Uint8Array(W * H);
  const mark = (x: number, y: number) => { if (x >= plot.x0 && x <= plot.x1 && y >= plot.y0 && y <= plot.y1) taken[(y - plot.y0) * W + (x - plot.x0)] = 1; };
  for (const s of hs) for (let x = s.a; x <= s.b; x++) for (let d = -2; d <= 2; d++) mark(x, Math.round(s.at) + d);
  for (const s of vs) for (let y = s.a; y <= s.b; y++) for (let d = -2; d <= 2; d++) mark(Math.round(s.at) + d, y);
  // (a rectangle's or a Fib's inside is theirs; the page's panels and text aren't drawings)
  for (const f of found) {
    if (f.kind === "rect") for (let y = Math.round(f.y0) - 2; y <= f.y1 + 2; y++) for (let x = f.x0 - 2; x <= f.x1 + 2; x++) mark(x, y);
    if (f.kind === "fib") {
      const ys = f.levels.map(l => l.y), lo = Math.min(...ys), hi = Math.max(...ys);
      for (let y = Math.round(lo) - 2; y <= hi + 2; y++) for (let x = f.x0 - 2; x <= f.x1 + 2; x++) mark(x, y);
    }
  }
  for (const b of uiBlocks(scan)) for (let y = b.y0 - 12; y <= b.y1 + 12; y++) for (let x = b.x0 - 12; x <= b.x1 + 12; x++) mark(x, y);
  const texts = textBoxes(scan);
  for (const b of texts) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) mark(x, y);
  const chartish = (c: RGB) => chartColors.some(k => dist(c, k) <= tol + 4);
  const inkAt = (x: number, y: number) => { const X = Math.round(x), Y = Math.round(y); return X >= plot.x0 && X <= plot.x1 && Y >= plot.y0 && Y <= plot.y1 && dist(at(X, Y), rowBg[Y]!) > inkTol; };
  const textAt = (x: number, y: number) => texts.some(b => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);

  // ---- patches of one colour
  type Comp = { pts: [number, number][]; color: RGB; x0: number; x1: number; y0: number; y1: number };
  const comps: Comp[] = [];
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let y = plot.y0; y <= plot.y1; y++) for (let x = plot.x0; x <= plot.x1; x++) {
    const i = (y - plot.y0) * W + (x - plot.x0);
    if (seen[i] || taken[i]) continue;
    seen[i] = 1;
    const c = at(x, y);
    if (dist(c, rowBg[y]!) <= inkTol || chartish(c)) continue;
    const pts: [number, number][] = [];
    let x0 = x, x1 = x, y0 = y, y1 = y;
    stack.length = 0; stack.push(x, y);
    while (stack.length && pts.length < 80000) {
      const py = stack.pop()!, px = stack.pop()!;
      pts.push([px, py]);
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy;
        if ((!dx && !dy) || qx < plot.x0 || qx > plot.x1 || qy < plot.y0 || qy > plot.y1) continue;
        const qi = (qy - plot.y0) * W + (qx - plot.x0);
        if (seen[qi] || taken[qi]) continue;
        const qc = at(qx, qy);
        if (dist(qc, rowBg[qy]!) <= inkTol || dist(qc, at(px, py)) > Math.max(tol, stepTol)) continue;
        seen[qi] = 1;
        stack.push(qx, qy);
      }
    }
    if (pts.length >= 3) comps.push({ pts, color: modeColorOf(pts.filter((_, k) => k % 3 === 0).map(([px, py]) => at(px, py))) ?? c, x0, x1, y0, y1 });
  }
  const bgAt = (y: number) => rowBg[Math.max(plot.y0, Math.min(plot.y1, Math.round(y)))]!;
  const out: FoundDrawing[] = [];

  // ---- see-through fills (a shape's inside; pieces cut by text or candles put together), small
  // solid marks, thin strokes
  const fillComps: Comp[] = [], solids: Comp[] = [], thin: Comp[] = [];
  for (const c of comps) {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, d = dist(c.color, bgAt((c.y0 + c.y1) / 2));
    if (c.pts.length >= 120 && w >= 6 && h >= 6 && d < 100 && c.pts.length / (w * h) >= 0.25) fillComps.push(c);
    else if (c.pts.length >= 50 && c.pts.length <= 1500 && w >= 8 && h >= 10 && w <= 45 && h <= 50 && d >= 60 && c.pts.length / (w * h) >= 0.3) solids.push(c);
    else if (c.pts.length / Math.max(w, h) <= 4.5) thin.push(c);
  }
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < fillComps.length && !merged; i++) for (let j = i + 1; j < fillComps.length && !merged; j++) {
      const A = fillComps[i], B = fillComps[j];
      if (dist(A.color, B.color) > tol) continue;
      const touch = A.x0 <= B.x1 + 5 && B.x0 <= A.x1 + 5 && A.y0 <= B.y1 + 5 && B.y0 <= A.y1 + 5;
      const stacked = Math.abs(A.x0 - B.x0) <= 3 && Math.abs(A.x1 - B.x1) <= 3 && Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1) <= 40;
      if (!touch && !stacked) continue;
      fillComps[i] = { pts: A.pts.concat(B.pts), color: A.pts.length >= B.pts.length ? A.color : B.color, x0: Math.min(A.x0, B.x0), x1: Math.max(A.x1, B.x1), y0: Math.min(A.y0, B.y0), y1: Math.max(A.y1, B.y1) };
      fillComps.splice(j, 1);
      merged = true;
    }
  }
  type Fill = { c: Comp; rowsL: Map<number, number>; rowsR: Map<number, number>; colsT: Map<number, number>; colsB: Map<number, number>; color: RGB; used?: boolean; channel?: { x0: number; x1: number } };
  const fills: Fill[] = fillComps.filter(c => c.pts.length >= 250).map(c => {
    const rowsL = new Map<number, number>(), rowsR = new Map<number, number>(), colsT = new Map<number, number>(), colsB = new Map<number, number>();
    for (const [x, y] of c.pts) {
      rowsL.set(y, Math.min(rowsL.get(y) ?? x, x)); rowsR.set(y, Math.max(rowsR.get(y) ?? x, x));
      colsT.set(x, Math.min(colsT.get(x) ?? y, y)); colsB.set(x, Math.max(colsB.get(x) ?? y, y));
    }
    return { c, rowsL, rowsR, colsT, colsB, color: c.color };
  });
  // a fill's colour as a see-through one (its outline's colour at some alpha, else TradingView's usual)
  const rgba = (fillC: RGB, bg: RGB, stroke?: RGB) => {
    const same = !!stroke && colorDirection(fillC, bg, stroke) > 0.95;
    const a = same ? Math.min(1, Math.max(0.05, dist(fillC, bg) / Math.max(1, dist(stroke!, bg)))) : estimateAlpha(fillC, bg);
    const base = same ? stroke! : unblend(fillC, bg, a);
    return `rgba(${base.map(v => Math.round(v)).join(", ")}, ${a.toFixed(2)})`;
  };
  const toRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const steady = (m: Map<number, number>) => { const v = [...m.values()], md = median(v); return v.filter(x => Math.abs(x - md) <= 2).length >= v.length * 0.6 ? md : null; };

  type Box = { f: Fill; x0: number; x1: number; y0: number; y1: number };
  const boxes: Box[] = [];
  const shapes: { kind: "ellipse" | "triangle"; d: FoundDrawing; f: Fill }[] = [];
  for (const f of fills) {
    const l = steady(f.rowsL), r = steady(f.rowsR), t = steady(f.colsT), b = steady(f.colsB);
    if (l !== null && r !== null && t !== null && b !== null) { boxes.push({ f, x0: l, x1: r, y0: t, y1: b }); continue; }
    // a parallelogram with upright sides: a channel's inside (its top and bottom two parallel slants)
    {
      const xs = [...f.colsT.keys()].sort((a, b) => a - b);
      const fitLine = (m: Map<number, number>) => {
        const ys = xs.map(x => m.get(x)!), n = xs.length, mx = xs.reduce((p, v) => p + v, 0) / n, my = ys.reduce((p, v) => p + v, 0) / n;
        let sxx = 0, sxy = 0; xs.forEach((x, i) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (ys[i] - my); });
        const k = sxy / (sxx || 1);
        return { k, res: median(xs.map((x, i) => Math.abs(my + k * (x - mx) - ys[i]))) };
      };
      const top = fitLine(f.colsT), bot = fitLine(f.colsB);
      if (top.res <= 3 && bot.res <= 3 && Math.abs(top.k - bot.k) < 0.04 && Math.abs(top.k) > 0.02) { f.channel = { x0: f.c.x0, x1: f.c.x1 }; continue; }
    }
    const edge: [number, number][] = [];
    for (const [y, x] of f.rowsL) edge.push([x, y], [f.rowsR.get(y)!, y]);
    for (const [x, y] of f.colsT) edge.push([x, y], [x, f.colsB.get(x)!]);
    const el = fitEllipse(edge);
    if (el && el.res < 0.05 && el.cover >= 0.85 && el.ra >= 12) {
      const d: FoundDrawing = { kind: "ellipse", cx: el.cx, cy: el.cy, ra: el.ra, rb: el.rb, angle: el.angle, circle: Math.abs(el.ra - el.rb) <= Math.max(2, el.ra * 0.04), color: hex(f.color), width: 2, fill: null };
      shapes.push({ kind: "ellipse", d, f }); f.used = true; continue;
    }
    const hull = convexHull(edge);
    const poly = simplify(hull.concat([hull[0]]), 4).slice(0, -1);
    if (poly.length === 3) {
      const d: FoundDrawing = { kind: "triangle", pts: poly.map(([x, y]) => ({ x, y })) as [P, P, P], color: hex(f.color), width: 2, fill: null };
      shapes.push({ kind: "triangle", d, f }); f.used = true;
    }
  }
  // positions: a profit box and a stop box one on the other, the same width
  const positions: Extract<FoundDrawing, { kind: "position" }>[] = [];
  for (const A of boxes) for (const B of boxes) {
    if (A === B || A.f.used || B.f.used || B.y0 - A.y1 > 8 || B.y0 - A.y1 < -3 || Math.abs(A.x0 - B.x0) > 4 || Math.abs(A.x1 - B.x1) > 4) continue;
    const greener = (c: RGB, bg: RGB) => (c[1] - bg[1]) - (c[0] - bg[0]);
    const sA = greener(A.f.color, bgAt(A.y0)), sB = greener(B.f.color, bgAt(B.y1));
    if (Math.abs(sA - sB) < 10) continue;
    const gA = sA > sB;
    // (the profit on top: a long)
    positions.push({ kind: "position", long: gA, x0: A.x0, x1: A.x1, entry: (A.y1 + B.y0) / 2, target: gA ? A.y0 : B.y1, stop: gA ? B.y1 : A.y0 });
    A.f.used = B.f.used = true;
  }
  out.push(...positions);

  // ---- strokes: straight parts (an arrowhead noted), curved ones apart
  const segLen = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);
  const turn = (a: P, b: P, c2: P) => {
    const u = [b.x - a.x, b.y - a.y], v = [c2.x - b.x, c2.y - b.y];
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) || 1)))) * 180 / Math.PI;
  };
  type Part = { a: P; b: P; color: RGB; width: number; on: number; headB: boolean; headA: boolean };
  const parts: Part[] = [];
  const arcs: Comp[] = [];
  for (const c of thin) {
    const path = diameterPath(c.pts);
    let poly = simplify(path, 2.2).map(([x, y]) => ({ x, y }));
    let headB = false;
    // an arrowhead: the chain ending in a short stroke turned sharply back (its other side a branch)
    if (poly.length >= 3 && c.pts.length > path.length * 1.15) {
      const n = poly.length;
      if (segLen(poly[n - 2], poly[n - 1]) <= 24 && turn(poly[n - 3], poly[n - 2], poly[n - 1]) > 110) { poly = poly.slice(0, -1); headB = true; }
      else if (segLen(poly[0], poly[1]) <= 24 && turn(poly[2], poly[1], poly[0]) > 110) { poly = poly.slice(1).reverse(); headB = true; }
    }
    const turns = poly.slice(2).map((q, i) => turn(poly[i], poly[i + 1], q));
    if (poly.length >= 6 && turns.filter(t => t < 35).length >= turns.length * 0.7) { arcs.push(c); continue; }
    const width = Math.max(1, Math.round(c.pts.length / Math.max(1, path.length) / (headB ? 1.4 : 1)));
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = poly[i], b = poly[i + 1];
      if (segLen(a, b) < 4) continue;
      parts.push({ a, b, color: c.color, width, on: segLen(a, b) + 1, headB: headB && i === poly.length - 2, headA: false });
    }
  }
  // the parts of one line joined: along it, across a gap that's a dash's or under something drawn
  // over it (the gap's pixels inked: candles, text)
  const covered = (a: P, b: P) => {
    const L = segLen(a, b); if (L <= 0) return true;
    let k = 0, n = 0;
    for (let t = 0; t <= L; t += 2) { n++; const x = a.x + (b.x - a.x) * t / L, y = a.y + (b.y - a.y) * t / L; if (inkAt(x, y) || textAt(x, y)) k++; }
    return k >= n * 0.7;
  };
  for (let grew = true; grew;) {
    grew = false;
    for (let i = 0; i < parts.length && !grew; i++) for (let j = 0; j < parts.length && !grew; j++) {
      if (i === j) continue;
      const A = parts[i], B = parts[j];
      if (dist(A.color, B.color) > tol) continue;
      const L = segLen(A.a, A.b) || 1, dx = (A.b.x - A.a.x) / L, dy = (A.b.y - A.a.y) / L;
      const off = (p: P) => Math.abs(-(p.x - A.a.x) * dy + (p.y - A.a.y) * dx);
      if (off(B.a) > 2 || off(B.b) > 2) continue;
      const t = (p: P) => (p.x - A.a.x) * dx + (p.y - A.a.y) * dy;
      const ta = t(B.a), tb = t(B.b), lo = Math.min(ta, tb), hi = Math.max(ta, tb);
      const gap = lo > L ? lo - L : hi < 0 ? -hi : 0;
      if (gap > 10 && !(gap <= Math.max(90, Math.min(220, L * 0.8)) && covered(lo > L ? A.b : (ta < tb ? B.b : B.a), lo > L ? (ta < tb ? B.a : B.b) : A.a))) continue;
      const nlo = Math.min(0, lo), nhi = Math.max(L, hi);
      // (an arrowhead stays at whichever end it was)
      const headEnd = A.headB ? 1 : B.headB ? (tb >= ta ? (hi >= L ? 1 : 0) : (lo <= 0 ? 0 : 1)) : -1;
      const na = { x: A.a.x + nlo * dx, y: A.a.y + nlo * dy }, nb = { x: A.a.x + nhi * dx, y: A.a.y + nhi * dy };
      parts[i] = { a: na, b: nb, color: A.color, width: Math.max(A.width, B.width), on: A.on + B.on, headB: headEnd === 1, headA: headEnd === 0 || A.headA || B.headA };
      parts.splice(j, 1);
      grew = true;
    }
  }
  // parts on a shape's edge are the shape's outline (its colour); likewise a position's and a box's
  const onEllipse = (p: P, e: Extract<FoundDrawing, { kind: "ellipse" }>) => {
    const ux = Math.cos(e.angle), uy = Math.sin(e.angle), u = (p.x - e.cx) * ux + (p.y - e.cy) * uy, v = -(p.x - e.cx) * uy + (p.y - e.cy) * ux;
    return Math.abs(Math.hypot(u / e.ra, v / e.rb) - 1) * Math.min(e.ra, e.rb) <= 4;
  };
  const onSeg = (p: P, a: P, b: P) => { const L = segLen(a, b) || 1, t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L); return t >= -0.05 && t <= 1.05 && Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x) / L <= 4; };
  const outlineSeen: Map<object, RGB[]> = new Map();
  const partOnShape = (pt: Part): object | null => {
    const mid = { x: (pt.a.x + pt.b.x) / 2, y: (pt.a.y + pt.b.y) / 2 };
    for (const s of shapes) {
      const d = s.d as any;
      if (s.kind === "ellipse" && [pt.a, pt.b, mid].every(p => onEllipse(p, d))) return s;
      if (s.kind === "triangle" && [0, 1, 2].some(k => [pt.a, pt.b].every(p => onSeg(p, d.pts[k], d.pts[(k + 1) % 3])))) return s;
    }
    for (const p of positions) if ([pt.a, pt.b].every(q => q.x >= p.x0 - 4 && q.x <= p.x1 + 4 && q.y >= Math.min(p.target, p.stop) - 4 && q.y <= Math.max(p.target, p.stop) + 4)) return p;
    return null;
  };
  for (let i = parts.length - 1; i >= 0; i--) {
    const s = partOnShape(parts[i]);
    if (!s) continue;
    if (!outlineSeen.has(s)) outlineSeen.set(s, []);
    outlineSeen.get(s)!.push(parts[i].color);
    parts.splice(i, 1);
  }
  // curved strokes: arcs of a shape found (its outline), or of one ellipse, or free brush strokes
  for (const g of groupColors(arcs, a => a.color, tol)) {
    const left: Comp[] = [];
    for (const a of g.list) {
      const s = shapes.find(s => s.kind === "ellipse" && a.pts.filter((_, k) => k % 4 === 0).every(([x, y]) => onEllipse({ x, y }, s.d as any)));
      if (s) { if (!outlineSeen.has(s)) outlineSeen.set(s, []); outlineSeen.get(s)!.push(a.color); } else left.push(a);
    }
    if (!left.length) continue;
    const el = fitEllipse(left.flatMap(a => a.pts));
    if (el && el.res < 0.06 && el.cover >= 0.6 && el.ra >= 12) {
      const inside = fills.find(f => !f.used && Math.hypot((f.c.x0 + f.c.x1) / 2 - el.cx, (f.c.y0 + f.c.y1) / 2 - el.cy) <= el.ra * 0.3);
      if (inside) inside.used = true;
      const d: FoundDrawing = { kind: "ellipse", cx: el.cx, cy: el.cy, ra: el.ra, rb: el.rb, angle: el.angle, circle: Math.abs(el.ra - el.rb) <= Math.max(2, el.ra * 0.04), color: hex(g.color), width: 2,
        fill: inside ? rgba(inside.color, bgAt(el.cy), g.color) : null };
      out.push(d);
      continue;
    }
    for (const a of left) {
      const path = simplify(diameterPath(a.pts), 1.5).map(([x, y]) => ({ x, y }));
      const len = path.slice(1).reduce((p, q, i) => p + segLen(path[i], q), 0);
      if (len >= 40 && !path.some(p => textAt(p.x, p.y))) out.push({ kind: "path", pts: path, color: hex(a.color), width: Math.max(1, Math.round(a.pts.length / Math.max(1, len))), arrow: false, brush: true });
    }
  }
  // the shapes found from their insides, with their outlines' colours
  for (const s of shapes) {
    const seenC = outlineSeen.get(s);
    const stroke = seenC?.length ? modeColorOf(seenC)! : null;
    const d = s.d as any;
    d.color = hex(stroke ?? s.f.color);
    d.fill = rgba(s.f.color, bgAt((s.f.c.y0 + s.f.c.y1) / 2), stroke ?? undefined);
    out.push(s.d);
  }

  // ---- the parts chained end to end: a path (an arrow at its end), a closed three: a triangle
  const minLen = Math.max(30, scan.step * 2.5);
  const blocks = uiBlocks(scan);
  const free = parts.filter(p => p.on >= 6 && !fills.some(f => dist(f.color, p.color) <= tol)
    && !blocks.some(b => [p.a, p.b].every(q => q.x >= b.x0 - 20 && q.x <= b.x1 + 20 && q.y >= b.y0 - 20 && q.y <= b.y1 + 20)));
  const chains: Part[][] = [];
  const usedP = new Set<Part>();
  const near = (p: P, q: P, small = false) => segLen(p, q) <= (small ? 18 : 7);
  for (const p of free) {
    if (usedP.has(p)) continue;
    usedP.add(p);
    let chain: Part[] = [p];
    for (let grew = true; grew;) {
      grew = false;
      const head = chain[chain.length - 1], tail = chain[0];
      for (const q of free) {
        if (usedP.has(q) || dist(q.color, p.color) > tol) continue;
        const stub = (q.headB || q.headA) && segLen(q.a, q.b) <= 25;
        if (near(head.b, q.a, stub)) { chain.push(q); usedP.add(q); grew = true; break; }
        if (near(head.b, q.b, stub)) { chain.push({ ...q, a: q.b, b: q.a, headB: q.headA, headA: q.headB }); usedP.add(q); grew = true; break; }
        if (near(tail.a, q.b, stub)) { chain.unshift(q); usedP.add(q); grew = true; break; }
        if (near(tail.a, q.a, stub)) { chain.unshift({ ...q, a: q.b, b: q.a, headB: q.headA, headA: q.headB }); usedP.add(q); grew = true; break; }
      }
    }
    // (a short stroke turned sharply back at an end: one side of an arrowhead)
    const sharp = (x: Part, y: Part) => segLen(y.a, y.b) <= 24 && turn(x.a, x.b, y.b) > 110;
    const flip = (q: Part): Part => ({ ...q, a: q.b, b: q.a, headA: q.headB, headB: q.headA });
    if (chain.length >= 2 && sharp(chain[chain.length - 2], chain[chain.length - 1])) { chain.pop(); chain[chain.length - 1] = { ...chain[chain.length - 1], headB: true }; }
    if (chain.length >= 2 && sharp(flip(chain[1]), flip(chain[0]))) { chain.shift(); chain[0] = { ...chain[0], headA: true }; }
    // (an arrowhead at the chain's start: the chain the other way round)
    if (chain[0].headA && !chain[chain.length - 1].headB) chain = chain.reverse().map(flip);
    // (and the head's two strokes beside the end, in the chain's colour)
    const end = chain[chain.length - 1];
    if (!end.headB && segLen(end.a, end.b) >= 20) {
      const L = segLen(end.a, end.b), ux = (end.b.x - end.a.x) / L, uy = (end.b.y - end.a.y) / L;
      const side = (sgn: number) => {
        let k = 0;
        for (let r = 5; r <= 11; r += 2) {
          const ang = sgn * 0.75, hx = end.b.x - r * (ux * Math.cos(ang) - uy * Math.sin(ang)), hy = end.b.y - r * (uy * Math.cos(ang) + ux * Math.sin(ang));
          if ([-1, 0, 1].some(d => dist(at(Math.round(hx) + d, Math.round(hy)), end.color) <= tol * 2)) k++;
        }
        return k >= 3;
      };
      if (side(1) && side(-1)) chain[chain.length - 1] = { ...end, headB: true };
    }
    chains.push(chain);
  }
  type Line = { a: P; b: P; color: RGB; on: number; width: number; len: number };
  const straight: Line[] = [];
  for (const ch of chains) {
    const pts = [ch[0].a, ...ch.map(q => q.b)];
    const len = ch.reduce((s, q) => s + segLen(q.a, q.b), 0);
    const arrow = ch[ch.length - 1].headB;
    const color = ch[0].color, width = Math.max(...ch.map(q => q.width));
    if (ch.length === 1) {
      const q = ch[0];
      if (arrow && len >= 20) { out.push({ kind: "arrow", a: q.a, b: q.b, color: hex(color), width, style: "solid" }); continue; }
      const [a, b] = q.a.x <= q.b.x ? [q.a, q.b] : [q.b, q.a];
      straight.push({ a, b, color, on: q.on, width, len: segLen(a, b) + 1 });
      continue;
    }
    if (len < minLen) continue;
    const closed = near(pts[0], pts[pts.length - 1]);
    if (closed && pts.length - 1 === 3) { out.push({ kind: "triangle", pts: pts.slice(0, 3) as [P, P, P], color: hex(color), width, fill: null }); continue; }
    out.push({ kind: "path", pts: closed ? pts.slice(0, -1) : pts, color: hex(color), width, arrow, brush: false });
  }
  const lines = straight.filter(l => {
    const angle = Math.abs(Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x)) * 180 / Math.PI;
    const flat = Math.min(angle, 180 - angle) < 1.5 || Math.abs(angle - 90) < 1.5;
    return l.len >= minLen && !flat && l.on / l.len >= 0.4;
  });
  // parallel channels: two lines alike side by side (a dashed middle line between them is theirs)
  const slope = (l: Line) => (l.b.y - l.a.y) / Math.max(1, l.b.x - l.a.x);
  const yAt = (l: Line, x: number) => l.a.y + slope(l) * (x - l.a.x);
  const inChannel = new Set<object>();
  for (const A of lines) for (const B of lines) {
    if (A === B || inChannel.has(A) || inChannel.has(B) || dist(A.color, B.color) > tol || Math.abs(slope(A) - slope(B)) > 0.03
      || Math.abs(A.a.x - B.a.x) > 8 || Math.abs(A.b.x - B.b.x) > 8 || yAt(B, A.a.x) - yAt(A, A.a.x) < 8) continue;
    for (const M of lines) if (M !== A && M !== B && Math.abs(slope(M) - slope(A)) < 0.03 && yAt(M, A.a.x) > yAt(A, A.a.x) && yAt(M, A.a.x) < yAt(B, A.a.x)) inChannel.add(M);
    const between = fills.find(f => !f.used && f.c.x0 >= A.a.x - 8 && f.c.x1 <= A.b.x + 8 && colorDirection(f.color, bgAt(f.c.y0), A.color) > 0.9 && f.c.pts.length >= 500);
    if (between) between.used = true;
    // (TradingView's channel: two points on its first line, one on the other — the lower line first)
    out.push({ kind: "channel", a: { x: A.a.x, y: yAt(B, A.a.x) }, b: { x: A.b.x, y: yAt(B, A.b.x) }, c: { x: A.a.x, y: yAt(A, A.a.x) },
      color: hex(A.color), width: A.width, fill: between ? rgba(between.color, bgAt((A.a.y + B.a.y) / 2), A.color) : null });
    inChannel.add(A); inChannel.add(B);
  }
  // triangles: three lines of one colour whose ends meet (their corners hidden or not)
  const crossAt = (A: Line, B: Line): P | null => {
    const d = (A.b.x - A.a.x) * (B.b.y - B.a.y) - (A.b.y - A.a.y) * (B.b.x - B.a.x);
    if (Math.abs(d) < 1e-6) return null;
    const t = ((B.a.x - A.a.x) * (B.b.y - B.a.y) - (B.a.y - A.a.y) * (B.b.x - B.a.x)) / d;
    return { x: A.a.x + t * (A.b.x - A.a.x), y: A.a.y + t * (A.b.y - A.a.y) };
  };
  // (a corner may be hidden: under the legend, text, candles)
  let three = true;   // (three sides meeting: a corner may be further off)
  const nearEnd = (l: Line, p: P) => { const e = segLen(l.a, p) < segLen(l.b, p) ? l.a : l.b; const g = segLen(e, p); return g <= 40 || (g <= 100 && covered(e, p)) || (three && g <= 120); };
  const inTri = (p: P, t: P[]) => { const s2 = (a: P, b: P, c2: P) => (b.x - a.x) * (c2.y - a.y) - (b.y - a.y) * (c2.x - a.x); const d1 = s2(t[0], t[1], p), d2 = s2(t[1], t[2], p), d3 = s2(t[2], t[0], p); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  const tri = lines.filter(l => !inChannel.has(l));
  for (let i = 0; i < tri.length; i++) for (let j = i + 1; j < tri.length; j++) for (let k = j + 1; k < tri.length; k++) {
    const A = tri[i], B = tri[j], C = tri[k];
    const hue = (x: Line, y: Line) => dist(x.color, y.color) <= tol || colorDirection(x.color, bgAt(x.a.y), y.color) > 0.9 || colorDirection(y.color, bgAt(y.a.y), x.color) > 0.9;
    if (inChannel.has(A) || inChannel.has(B) || inChannel.has(C) || !hue(A, B) || !hue(A, C)) continue;
    const ab = crossAt(A, B), bc = crossAt(B, C), ca = crossAt(C, A);
    if (!ab || !bc || !ca || !nearEnd(A, ab) || !nearEnd(B, ab) || !nearEnd(B, bc) || !nearEnd(C, bc) || !nearEnd(C, ca) || !nearEnd(A, ca)) continue;
    const pts: [P, P, P] = [ca, ab, bc];
    const xs = pts.map(q => q.x), lo = Math.min(...xs), hi = Math.max(...xs);
    // (its inside: a fill of its colour within it; a triangle read from that fill alone was a part of it)
    const inside = fills.find(f => colorDirection(f.color, bgAt(f.c.y0), A.color) > 0.9 && f.c.x0 >= lo - 6 && f.c.x1 <= hi + 6);
    for (let n = out.length - 1; n >= 0; n--) { const d = out[n]; if (d.kind === "triangle" && d.pts.every(q => q.x >= lo - 10 && q.x <= hi + 10)) out.splice(n, 1); }
    // (its colour: the strongest of its sides')
    const main = [A, B, C].sort((p, q) => dist(q.color, bgAt(q.a.y)) - dist(p.color, bgAt(p.a.y)))[0];
    const fillIn = inside ?? fills.filter(f => colorDirection(f.color, bgAt(f.c.y0), main.color) > 0.9 && inTri({ x: (f.c.x0 + f.c.x1) / 2, y: (f.c.y0 + f.c.y1) / 2 }, pts)).sort((p, q) => q.c.pts.length - p.c.pts.length)[0];
    out.push({ kind: "triangle", pts, color: hex(main.color), width: main.width, fill: fillIn ? rgba(fillIn.color, bgAt(fillIn.c.y0), main.color) : null });
    inChannel.add(A); inChannel.add(B); inChannel.add(C);
  }
  const inTri2 = (p: P, t: P[]) => { const s2 = (a: P, b: P, c2: P) => (b.x - a.x) * (c2.y - a.y) - (b.y - a.y) * (c2.x - a.x); const d1 = s2(t[0], t[1], p), d2 = s2(t[1], t[2], p), d3 = s2(t[2], t[0], p); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  three = false;
  const tri2 = lines.filter(l => !inChannel.has(l));
  for (let i = 0; i < tri2.length; i++) for (let j = i + 1; j < tri2.length; j++) {
    const A = tri2[i], B = tri2[j];
    if (inChannel.has(A) || inChannel.has(B) || dist(A.color, B.color) > tol) continue;
    const m = crossAt(A, B);
    if (!m || !nearEnd(A, m) || !nearEnd(B, m)) continue;
    const far = (l: Line) => (segLen(l.a, m) > segLen(l.b, m) ? l.a : l.b);
    const pts: [P, P, P] = [far(A), m, far(B)];
    if (segLen(pts[0], pts[2]) < 40) continue;
    const inside = fills.filter(f => colorDirection(f.color, bgAt(f.c.y0), A.color) > 0.9 && inTri2({ x: (f.c.x0 + f.c.x1) / 2, y: (f.c.y0 + f.c.y1) / 2 }, pts));
    if (!inside.length) continue;
    const big = inside.sort((p, q) => q.c.pts.length - p.c.pts.length)[0];
    out.push({ kind: "triangle", pts, color: hex(A.color), width: A.width, fill: rgba(big.color, bgAt(big.c.y0), A.color) });
    inChannel.add(A); inChannel.add(B);
  }
  for (const l of lines) {
    if (inChannel.has(l)) continue;
    const cover = Math.min(1, l.on / l.len);
    out.push({ kind: "line", a: l.a, b: l.b, color: hex(l.color), width: l.width, style: cover >= 0.9 ? "solid" : cover >= 0.6 ? "dashed" : "dotted", left: l.a.x <= plot.x0 + 3, right: l.b.x >= plot.x1 - 3 });
  }

  // (an ellipse found from its outline and from its inside: one, with both)
  for (let n = out.length - 1; n >= 0; n--) {
    const e = out[n];
    if (e.kind !== "ellipse") continue;
    const other = out.find(o => o !== e && o.kind === "ellipse" && Math.hypot(o.cx - e.cx, o.cy - e.cy) <= Math.max(6, e.ra * 0.15)) as typeof e | undefined;
    if (!other) continue;
    if (!other.fill && e.fill) { other.fill = e.fill; other.cx = e.cx; other.cy = e.cy; other.ra = e.ra; other.rb = e.rb; other.angle = e.angle; }
    out.splice(n, 1);
  }
  // (the rows where a shape's outline runs flat — an ellipse's top, a triangle's side — aren't levels)
  for (let k = found.length - 1; k >= 0; k--) {
    const d = found[k];
    if (d.kind !== "hline" || (d.left && d.right)) continue;
    const ends = [{ x: d.x0, y: d.y }, { x: d.x1, y: d.y }, { x: (d.x0 + d.x1) / 2, y: d.y }];
    const onShape = out.some(o => (o.kind === "ellipse" && ends.every(p => onEllipse(p, o) || (Math.abs(p.y - o.cy) >= o.rb * 0.85 && Math.abs(p.x - o.cx) <= o.ra)))
      || (o.kind === "triangle" && [0, 1, 2].some(i => ends.every(p => onSeg(p, o.pts[i], o.pts[(i + 1) % 3])))));
    if (onShape) found.splice(k, 1);
  }

  // (a line's or a path's ends: followed on while its colour goes on; an arrowhead at an end: its two
  // strokes going back from the tip, one each side — the drawing ending there)
  const isOf = (X: number, Y: number, color: RGB) => {
    if (X < plot.x0 || X > plot.x1 || Y < plot.y0 || Y > plot.y1) return false;
    const c = at(X, Y), bg = rowBg[Y]!;
    return dist(c, color) <= tol * 2 || (colorDirection(c, bg, color) > 0.92 && dist(c, bg) >= dist(color, bg) * 0.35);
  };
  const extend = (a: P, b: P, color: RGB): P => {
    const L = segLen(a, b) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    let end = b;
    for (let r = 1; r <= 40; r++) {
      const x = b.x + ux * r, y = b.y + uy * r;
      if (![0, -1, 1].some(d => isOf(Math.round(x - uy * d), Math.round(y + ux * d), color))) break;
      end = { x, y };
    }
    return end;
  };
  const headAt = (a: P, b: P, color: RGB) => {
    const L = segLen(a, b) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    const side = (sgn: number) => {
      let k = 0;
      for (let r = 4; r <= 12; r += 2) for (const ang of [0.6, 0.75, 0.9]) {
        const t = sgn * ang, hx = b.x - r * (ux * Math.cos(t) - uy * Math.sin(t)), hy = b.y - r * (uy * Math.cos(t) + ux * Math.sin(t));
        if (isOf(Math.round(hx), Math.round(hy), color)) { k++; break; }
      }
      return k >= 4;
    };
    return side(1) && side(-1);
  };
  for (let n = 0; n < out.length; n++) {
    const d = out[n];
    if (d.kind !== "line" && d.kind !== "arrow" && d.kind !== "path") continue;
    const color = toRgb(d.color);
    const pts = d.kind === "path" ? d.pts.slice() : [d.a, d.b];
    pts[pts.length - 1] = extend(pts[pts.length - 2], pts[pts.length - 1], color);
    pts[0] = extend(pts[1], pts[0], color);
    const hb = headAt(pts[pts.length - 2], pts[pts.length - 1], color), ha = headAt(pts[1], pts[0], color);
    const fwd = hb || !ha ? pts : pts.slice().reverse();
    const head = hb || ha || (d.kind === "arrow") || (d.kind === "path" && d.arrow);
    if (d.kind === "path") out[n] = { ...d, pts: fwd, arrow: head };
    else if (head && d.kind === "line") out[n] = { kind: "arrow", a: fwd[0], b: fwd[1], color: d.color, width: d.width, style: d.style };
    else out[n] = { ...d, a: fwd[0], b: fwd[1] } as FoundDrawing;
  }

  // ---- boxes left: a price / date range (an arrow inside it), else a rectangle without a border
  const consumeLevels = (x0: number, x1: number, ys: number[]) => {
    for (let k = found.length - 1; k >= 0; k--) {
      const d = found[k];
      if (d.kind === "hline" && ys.some(y => Math.abs(d.y - y) <= 3) && d.x0 >= x0 - 6 && d.x1 <= x1 + 6) found.splice(k, 1);
    }
  };
  for (const p of positions) consumeLevels(p.x0, p.x1, [p.entry, p.target, p.stop]);
  for (const bx of boxes.filter(b => !b.f.used)) {
    const within = (p: P) => p.x >= bx.x0 - 4 && p.x <= bx.x1 + 4 && p.y >= bx.y0 - 6 && p.y <= bx.y1 + 6;
    const inner = out.filter(d => (d.kind === "arrow" || d.kind === "line" || d.kind === "path") && (d.kind === "path" ? d.pts.every(within) : within(d.a) && within(d.b)));
    const ends = (d: FoundDrawing): [P, P] => (d.kind === "path" ? [d.pts[0], d.pts[d.pts.length - 1]] : [(d as any).a, (d as any).b]);
    const v = inner.find(d => { const [a, b] = ends(d); return Math.abs(a.x - b.x) <= 4 && Math.abs(a.y - b.y) > 10; });
    const h = inner.find(d => { const [a, b] = ends(d); return Math.abs(a.y - b.y) <= 4 && Math.abs(a.x - b.x) > 10; });
    // (an upright line inside a box: found among the vertical segments too short to be a line on its own)
    const vSeg = !v ? vs.find(s => s.at > bx.x0 + 4 && s.at < bx.x1 - 4 && s.a >= bx.y0 - 6 && s.b <= bx.y1 + 6 && s.b - s.a >= (bx.y1 - bx.y0) * 0.6) : undefined;
    const strokeHex = v ? (v as any).color : h ? (h as any).color : vSeg ? hex(vSeg.color) : hex(bx.f.color);
    const fill = rgba(bx.f.color, bgAt(bx.y0), toRgb(strokeHex));
    if (v || h || vSeg) {
      for (const d of [v, h]) if (d) out.splice(out.indexOf(d), 1);
      const [va, vb] = v ? ends(v) : [{ x: 0, y: 1 }, { x: 0, y: 0 }];
      const [ha, hb] = h ? ends(h) : [{ x: 0, y: 0 }, { x: 1, y: 0 }];
      out.push({ kind: "range", x0: bx.x0, y0: bx.y0, x1: bx.x1, y1: bx.y1, price: !!(v || vSeg), date: !!h, up: v ? vb.y < va.y : true, right: hb.x > ha.x, color: strokeHex, fill });
      consumeLevels(bx.x0, bx.x1, [bx.y0, bx.y1]);
    } else if (bx.x1 - bx.x0 >= 20 && bx.y1 - bx.y0 >= 8) out.push({ kind: "rect", x0: bx.x0, y0: bx.y0, x1: bx.x1, y1: bx.y1, border: strokeHex, width: 1, fill, fillAlpha: 0.2 });
  }
  // (levels and lines touching text: a label's box, not a drawing)
  for (let k = found.length - 1; k >= 0; k--) {
    const d = found[k];
    if (d.kind === "hline" && !(d.left && d.right) && d.x1 - d.x0 < 260 && texts.some(b => d.x0 >= b.x0 - 12 && d.x1 <= b.x1 + 12 && Math.abs(d.y - b.y0) <= 8 || (d.x0 >= b.x0 - 12 && d.x1 <= b.x1 + 12 && Math.abs(d.y - b.y1) <= 8))) found.splice(k, 1);
  }

  // ---- arrow marks: small solid arrows, the narrow tip at the top (up) or at the bottom (down)
  for (const c of solids) {
    const rows = new Map<number, number>();
    for (const [, y] of c.pts) rows.set(y, (rows.get(y) ?? 0) + 1);
    const top = (rows.get(c.y0) ?? 0) + (rows.get(c.y0 + 1) ?? 0), bottom = (rows.get(c.y1) ?? 0) + (rows.get(c.y1 - 1) ?? 0);
    const widest = Math.max(...rows.values()), stem = median([...rows.values()]);
    if (Math.abs(top - bottom) < 6 || widest < stem * 1.4 || Math.max(...c.color) - Math.min(...c.color) < 40) continue;
    // (anchored as the arrow-mark tool is: 8 px from its tip, towards the stem)
    const up = top < bottom;
    out.push({ kind: "marker", x: (c.x0 + c.x1) / 2, y: up ? c.y0 + 8 : c.y1 - 8, up, color: hex(c.color) });
  }
  // (the chart's own corner marks — its logo, a chat button — at the bottom left, aren't drawings)
  const corner = (p: P) => p.x <= plot.x0 + 160 && p.y >= plot.y1 - 60;
  return out.filter(d => !((d.kind === "path" && d.pts.every(corner)) || (d.kind === "marker" && corner(d))));
}

// The longest chain through a stroke's pixels, one end to the other (branches — an arrowhead's
// other side — left off)
function diameterPath(pts: [number, number][]): [number, number][] {
  const key = (x: number, y: number) => x * 100000 + y;
  const set = new Set(pts.map(([x, y]) => key(x, y)));
  const bfs = (from: [number, number]) => {
    const prev = new Map<number, number>(), d = new Map<number, number>([[key(from[0], from[1]), 0]]);
    const q: [number, number][] = [from];
    let far = from, farD = 0;
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h], dd = d.get(key(x, y))!;
      if (dd > farD) { far = [x, y]; farD = dd; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = key(x + dx, y + dy);
        if ((!dx && !dy) || !set.has(k) || d.has(k)) continue;
        d.set(k, dd + 1); prev.set(k, key(x, y)); q.push([x + dx, y + dy]);
      }
    }
    return { far, prev };
  };
  const a = bfs(pts[0]).far, { far: b, prev } = bfs(a);
  const path: [number, number][] = [];
  for (let k: number | undefined = key(b[0], b[1]); k !== undefined; k = prev.get(k)) path.push([Math.floor(k / 100000), k % 100000]);
  return path;
}

// Ramer–Douglas–Peucker: a chain of points' corners
function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay);
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = L > 1 ? Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// An ellipse through points on its outline: its axes are the points' spread's directions, its centre
// halfway between the farthest points along each, its radii how far they reach. res: how far the
// points are off it (0: on it); cover: how much of the way round they go (1: all of it)
function fitEllipse(pts: [number, number][]): { cx: number; cy: number; ra: number; rb: number; angle: number; res: number; cover: number } | null {
  if (pts.length < 20) return null;
  let cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const toAxes = (x: number, y: number) => [(x - cx) * ux + (y - cy) * uy, -(x - cx) * uy + (y - cy) * ux];
  const pre = pts.map(([x, y]) => toAxes(x, y));
  const u = pre.map(p => p[0]), v = pre.map(p => p[1]);
  const du = (Math.max(...u) + Math.min(...u)) / 2, dv = (Math.max(...v) + Math.min(...v)) / 2;
  cx += du * ux - dv * uy; cy += du * uy + dv * ux;
  const Q = pts.map(([x, y]) => toAxes(x, y));
  const ra = Math.max(...Q.map(p => Math.abs(p[0]))), rb = Math.max(...Q.map(p => Math.abs(p[1])));
  if (ra < 4 || rb < 4) return null;
  const res = median(Q.map(([a, b]) => Math.abs(Math.hypot(a / ra, b / rb) - 1)));
  const bins = new Set(Q.map(([a, b]) => Math.floor(((Math.atan2(b / rb, a / ra) + Math.PI) / (2 * Math.PI)) * 36)));
  return { cx, cy, ra, rb, angle, res, cover: bins.size / 36 };
}

function groupColors<T>(items: T[], color: (t: T) => RGB, tol: number): { color: RGB; list: T[] }[] {
  const groups: { color: RGB; list: T[] }[] = [];
  for (const it of items) { const c = color(it); const g = groups.find(g => dist(g.color, c) <= tol); if (g) g.list.push(it); else groups.push({ color: c, list: [it] }); }
  return groups;
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
