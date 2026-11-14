// A chart theme read from a screenshot (TradingView's, ours, any candle chart): the chart's
// background (solid or a gradient), its grid lines, the scales' text and separator lines, the
// candles' body / border / wick colours, and whether the page around it is dark or light. Pixels
// only, nothing guessed by a model: the colours in the image (a compressed JPEG's too: how noisy the
// image is is measured first, and the colours are the middle of each part's pixels).
//
// Which candle colour is up: candles join (each opens about where the one before closed), so the
// reading that makes the bodies join up best is the right one — an up candle opens at its body's
// bottom and closes at its top. That works for any colours (white / black, blue / orange…); only
// when the candles can't tell it apart is a green-ish colour taken as up.

export type RGB = [number, number, number];
export type Pixels = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };   // RGBA

export type CandleColors = { body: string; border: string; wick: string };
export type ImageTheme = {
  chart: { x0: number; y0: number; x1: number; y1: number };
  background: string; background2: string; gradient: boolean;
  gridHorz: string | null; gridVert: string | null;        // null: no grid lines found that way
  text: string | null; lines: string | null;                // scale text, scale separators
  up: CandleColors | null; down: CandleColors | null;
  candles: number;                                          // bodies the colours were read from
  upBy: "joins" | "hue" | null;                             // how up was told from down
  pageDark: boolean;                                        // the page around the chart (or the chart, cropped)
  chartDark: boolean;
  noise: number;                                            // the image's colour noise (0: a clean PNG)
};

export const hex = (c: RGB) => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const dist = (a: RGB, b: RGB) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const key = (c: RGB) => (c[0] << 16) | (c[1] << 8) | c[2];
const unkey = (k: number): RGB => [(k >> 16) & 255, (k >> 8) & 255, k & 255];
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const medianColor = (cs: RGB[]): RGB => [median(cs.map(c => c[0])), median(cs.map(c => c[1])), median(cs.map(c => c[2]))];

function modeOf(keys: Iterable<number>): number | null {
  const m = new Map<number, number>();
  let best: number | null = null, bestN = 0;
  for (const k of keys) { const n = (m.get(k) ?? 0) + 1; m.set(k, n); if (n > bestN) { bestN = n; best = k; } }
  return best;
}
// the most common colour, near-equal colours counted together (5 bits a channel), as their median
function modeColor(cs: RGB[]): RGB | null {
  if (!cs.length) return null;
  const q = (c: RGB) => ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
  const k = modeOf(cs.map(q));
  return medianColor(cs.filter(c => q(c) === k));
}
// colours grouped within `tol` of each group's first
function groupColors<T>(items: T[], color: (t: T) => RGB, tol: number): { color: RGB; list: T[] }[] {
  const groups: { color: RGB; list: T[] }[] = [];
  for (const it of items) {
    const c = color(it);
    const g = groups.find(g => dist(g.color, c) <= tol);
    if (g) g.list.push(it); else groups.push({ color: c, list: [it] });
  }
  return groups;
}

// What the scan found besides the colours, for reading the drawings on the chart (./drawingsImage):
// the plot area, the background, the tolerances for this image, the candles (each body's middle, top,
// bottom and direction) and the colours that are the chart's own (candles, volume, grid)
export type ChartScan = {
  at: (x: number, y: number) => RGB;
  rowBg: (RGB | null)[];
  noise: number; inkTol: number; stepTol: number; sameTol: number; lineTol: number;
  plot: { x0: number; x1: number; y0: number; y1: number };          // the candles' area (no scales)
  candles: { x: number; top: number; bottom: number; up: boolean }[];
  step: number;                                                      // pixels from one candle to the next
  chartColors: RGB[];                                                // candles', volume bars', grid's
};

export function readThemeImage(img: Pixels): ImageTheme | null {
  return scanChartImage(img)?.theme ?? null;
}

export function scanChartImage(img: Pixels): { theme: ImageTheme; scan: ChartScan } | null {
  const { width: W, height: H, data } = img;
  if (W < 80 || H < 60) return null;
  const at = (x: number, y: number): RGB => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };

  // ---- the background row by row (a gradient changes down the chart), and how noisy the image is --
  const cx0 = Math.floor(W * 0.2), cx1 = Math.floor(W * 0.75);
  const rowBg: (RGB | null)[] = new Array(H).fill(null);
  for (let y = 0; y < H; y++) {
    const cs: RGB[] = [];
    for (let x = cx0; x < cx1; x += 2) cs.push(at(x, y));
    rowBg[y] = modeColor(cs);
  }
  // (noise: how much neighbouring near-background pixels differ — a clean image's don't; a flat
  // shaded area, a drawing's see-through fill, isn't noise)
  const devs: number[] = [];
  for (let y = Math.floor(H * 0.3); y < H * 0.7; y += 7) for (let x = cx0; x < cx1; x += 7) {
    const p = at(x, y), q = at(x + 1, y), b = rowBg[y]!;
    if (dist(p, b) <= 24 && dist(q, b) <= 24) devs.push(dist(p, q));
  }
  const noise = [...devs].sort((a, b) => a - b)[Math.floor(devs.length * 0.9)] ?? 0;
  const bgTol = Math.max(6, noise * 1.5 + 2);       // still the background
  const sameTol = Math.max(10, noise * 2.5 + 4);    // the same colour (a body, a group of bodies)
  const inkTol = noise <= 1 ? 14 : Math.max(28, noise * 5);   // clearly not the background (a JPEG's halos aren't)
  const stepTol = noise <= 1 ? 10 : 48;                        // next pixel, same part (a JPEG's colours bleed at edges)
  const groupTol = noise <= 1 ? 10 : Math.max(28, sameTol);
  const lineTol = Math.max(4, noise * 1.5 + 1);
  const bgLike = (x: number, y: number) => { const b = rowBg[y]; return !!b && dist(at(x, y), b) <= bgTol; };

  // ---- where the chart is: the columns mostly background around the middle; the rows out from the
  // middle while the background stays the chart's (changing gently: a gradient). A row whose most
  // common colour isn't it (a grid line, the crosshair, volume bars) keeps the row before's.
  // (over nearly the whole height: a big drawing — a Fib's shaded bands — covers the middle of its columns)
  const ys = Math.floor(H * 0.08), ye = Math.floor(H * 0.92);
  const colShare = (x: number) => { let n = 0, t = 0; for (let y = ys; y < ye; y += 2) { t++; if (bgLike(x, y)) n++; } return n / t; };
  const colFlags = Array.from({ length: W }, (_, x) => colShare(x) >= 0.2);
  const cols = runAround(colFlags, Math.floor(W / 2), 4);
  if (!cols) return null;
  const [x0, x1] = cols;
  const bgShare = (y: number, b: RGB) => { let n = 0, t = 0; for (let x = x0; x <= x1; x += 2) { t++; if (dist(at(x, y), b) <= bgTol) n++; } return n / t; };
  let start = Math.floor(H / 2);
  while (start < H && !(rowBg[start] && bgShare(start, rowBg[start]!) >= 0.35)) start++;
  if (start >= H) return null;
  const walk = (dir: 1 | -1): number => {
    let good = start, prev = rowBg[start]!, miss = 0;
    for (let y = start + dir; y >= 0 && y < H; y += dir) {
      const own = rowBg[y];
      if (own && dist(own, prev) <= Math.max(8, bgTol) && bgShare(y, own) >= 0.35) { good = y; prev = own; miss = 0; continue; }
      rowBg[y] = prev;
      if (bgShare(y, prev) >= 0.1) { good = y; miss = 0; continue; }
      if (++miss > 4) break;
    }
    return good;
  };
  const y0 = walk(-1), y1 = walk(1);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  if (cw < 60 || ch < 40) return null;

  const band = Math.max(3, Math.floor(ch * 0.08));
  const topBg = medianColor(rowBg.slice(y0, y0 + band) as RGB[]);
  const botBg = medianColor(rowBg.slice(y1 - band + 1, y1 + 1) as RGB[]);
  const midBg = medianColor(rowBg.slice(y0, y1 + 1) as RGB[]);
  const gradient = dist(topBg, botBg) > Math.max(10, noise * 2);

  // ---- full-length lines: grid lines and the scales' separators -----------------------------------
  type Line = { at: number; color: RGB; cover: number };
  const lineAlong = (n: number, get: (i: number) => RGB, bg: (i: number) => RGB | null): { c: RGB; cover: number } | null => {
    const cs: RGB[] = [];
    for (let i = 0; i < n; i += 2) { const c = get(i), b = bg(i); if (b && dist(c, b) > Math.max(3, noise)) cs.push(c); }
    if (cs.length < n * 0.2) return null;
    const c = modeColor(cs)!;
    let same = 0, t = 0;
    for (let i = 0; i < n; i += 2) { t++; if (dist(get(i), c) <= lineTol) same++; }
    return same / t >= 0.45 ? { c, cover: same / t } : null;
  };
  const hl: Line[] = [], vl: Line[] = [];
  for (let y = y0; y <= y1; y++) { const r = lineAlong(cw, i => at(x0 + i, y), () => rowBg[y]); if (r) hl.push({ at: y, color: r.c, cover: r.cover }); }
  for (let x = x0; x <= x1; x++) { const r = lineAlong(ch, i => at(x, y0 + i), i => rowBg[y0 + i]); if (r) vl.push({ at: x, color: r.c, cover: r.cover }); }
  // (a line two pixels wide is one line) the grid: the colour 3+ lines share
  const merge = (ls: Line[]) => ls.filter((l, i) => !(i && ls[i - 1].at === l.at - 1 && dist(ls[i - 1].color, l.color) <= lineTol));
  const gridOf = (ls: Line[]) => {
    const g = groupColors(merge(ls), l => l.color, lineTol).sort((a, b) => b.list.length - a.list.length)[0];
    return g && g.list.length >= 3 ? medianColor(g.list.map(l => l.color)) : null;
  };
  const gridH = gridOf(hl), gridV = gridOf(vl);
  // a lone line of another colour at the right / bottom: a scale's edge
  const sepV = merge(vl).filter(l => l.cover >= 0.85 && l.at > x0 + cw * 0.6 && (!gridV || dist(l.color, gridV) > lineTol)).pop();
  const sepH = merge(hl).filter(l => l.cover >= 0.85 && l.at > y0 + ch * 0.6 && (!gridH || dist(l.color, gridH) > lineTol)).pop();
  const isGrid = (c: RGB) => (!!gridH && dist(c, gridH) <= lineTol) || (!!gridV && dist(c, gridV) <= lineTol);

  // ---- candles: bodies (3+ px wide, filled) with thin wicks, by colour ------------------------------
  // (the grid's lines run exactly across the plot: their ends are its edges — the price scale's and
  // the time scale's start, and a panel beside the chart that shares its background stays out)
  const extent = (ls: Line[], grid: RGB | null, horizontal: boolean): [number, number] | null => {
    if (!grid) return null;
    const lo: number[] = [], hi: number[] = [];
    for (const l of ls.filter(l => dist(l.color, grid) <= lineTol)) {
      const n = horizontal ? cw : ch, get = (i: number) => (horizontal ? at(x0 + i, l.at) : at(l.at, y0 + i));
      let a = -1, b = -1;
      for (let i = 0; i < n; i++) if (dist(get(i), grid) <= lineTol) { if (a < 0) a = i; b = i; }
      if (a >= 0) { lo.push((horizontal ? x0 : y0) + a); hi.push((horizontal ? x0 : y0) + b); }
    }
    return lo.length >= 3 ? [median(lo), median(hi)] : null;
  };
  const gx = extent(hl, gridH, true), gy = extent(vl, gridV, false);
  const ax0 = gx ? gx[0] : x0 + 1, ax1 = gx ? gx[1] : (sepV ? sepV.at : x1 - Math.max(30, Math.floor(cw * 0.04))) - 1;
  const ay0 = gy ? gy[0] : y0 + 1, ay1 = gy ? gy[1] : (sepH ? sepH.at : y1 - Math.max(12, Math.floor(ch * 0.03))) - 1;
  const aw = ax1 - ax0 + 1, ah = ay1 - ay0 + 1;
  if (aw < 20 || ah < 20) return null;
  const seen = new Uint8Array(aw * ah);
  type Body = { x: number; xa: number; xb: number; top: number; bottom: number; color: RGB; wick: boolean };
  const bodies: Body[] = [];
  const stack: number[] = [];
  const rowsMin = new Map<number, number>(), rowsMax = new Map<number, number>(), rowsN = new Map<number, number>();
  for (let y = ay0; y <= ay1; y++) for (let x = ax0; x <= ax1; x++) {
    const si = (y - ay0) * aw + (x - ax0);
    if (seen[si]) continue;
    seen[si] = 1;
    const seed = at(x, y), bg = rowBg[y]!;
    // (ink: clearly not the background, nor a grid line)
    if (dist(seed, bg) <= inkTol || isGrid(seed)) continue;
    rowsMin.clear(); rowsMax.clear(); rowsN.clear();
    let n = 0, minX = x, maxX = x;
    stack.length = 0; stack.push(x, y);
    while (stack.length && n < 20000) {
      const py = stack.pop()!, px = stack.pop()!;
      n++;
      rowsMin.set(py, Math.min(rowsMin.get(py) ?? px, px)); rowsMax.set(py, Math.max(rowsMax.get(py) ?? px, px)); rowsN.set(py, (rowsN.get(py) ?? 0) + 1);
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      for (let d = 0; d < 4; d++) {
        const qx = px + (d === 0 ? 1 : d === 1 ? -1 : 0), qy = py + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (qx < ax0 || qx > ax1 || qy < ay0 || qy > ay1) continue;
        const qi = (qy - ay0) * aw + (qx - ax0);
        if (seen[qi]) continue;
        const qc = at(qx, qy);
        if (dist(qc, rowBg[qy]!) <= inkTol || dist(qc, at(px, py)) > stepTol) continue;
        seen[qi] = 1;
        stack.push(qx, qy);
      }
    }
    const w = maxX - minX + 1;
    if (w < 3 || w > 60 || n >= 20000) continue;
    // body rows: about the full width, filled; the rest (wicks) narrow
    let maxRow = 0;
    rowsN.forEach(c => { if (c > maxRow) maxRow = c; });
    if (maxRow < 3) continue;
    const bodyRows: number[] = [];
    let ok = true;
    rowsN.forEach((cnt, ry) => {
      if (!ok) return;
      const span = rowsMax.get(ry)! - rowsMin.get(ry)! + 1;
      if (cnt >= Math.max(3, maxRow * 0.6)) { if (cnt / span < (noise <= 1 ? 0.85 : 0.7)) ok = false; else bodyRows.push(ry); }
      else if (cnt > Math.max(2, maxRow * 0.4)) ok = false;
    });
    if (!ok || !bodyRows.length) continue;
    bodyRows.sort((a, b) => a - b);
    if (bodyRows[bodyRows.length - 1] - bodyRows[0] + 1 > bodyRows.length + 1) continue;
    const top = bodyRows[0], bottom = bodyRows[bodyRows.length - 1];
    // (a one-row stroke with nothing on it is a letter's or a dashed line's, not a candle)
    if (bottom - top < 2 && rowsN.size === bodyRows.length) continue;
    const xa = rowsMin.get(top)!, xb = rowsMax.get(top)!;
    // its colour: the middle of its inside (a JPEG's edges ring)
    const inside: RGB[] = [];
    for (let yy = top + (bottom - top >= 4 ? 1 : 0); yy <= bottom - (bottom - top >= 4 ? 1 : 0); yy++) for (let xx = xa + 1; xx < xb; xx++) inside.push(at(xx, yy));
    bodies.push({ x: (xa + xb) / 2, xa, xb, top, bottom, color: inside.length ? medianColor(inside) : seed, wick: rowsN.size > bodyRows.length });
  }

  // a body's wick (just above / below its middle) and border (just outside its sides)
  const wickOf = (b: Body): RGB | null => {
    const x = Math.round(b.x);
    for (const y of [b.top - 1, b.bottom + 1]) {
      if (y < ay0 || y > ay1) continue;
      const c = at(x, y);
      if (dist(c, rowBg[y]!) > inkTol && !isGrid(c)) return c;
    }
    return null;
  };
  // grouped by colour; volume bars (standing on one line, no wicks) and letters (short) aren't candles
  const volumeColors: RGB[] = [];
  const candleGroups = groupColors(bodies, b => b.color, groupTol).filter(g => {
    if (g.list.length < 2) return false;
    const base = median(g.list.map(b => b.bottom));
    const standing = g.list.filter(b => Math.abs(b.bottom - base) <= 2).length;
    if (standing / g.list.length >= 0.6 && g.list.length >= 4) { volumeColors.push(g.color); return false; }
    return true;
  }).map(g => {
    // (a chart draws its candles one width: the bodies at the group's usual width)
    const wMode = modeOf(g.list.map(b => b.xb - b.xa + 1))!;
    const list = g.list.filter(b => Math.abs(b.xb - b.xa + 1 - wMode) <= 1);
    return { color: medianColor(list.map(b => b.color)), list, all: g.list.length, wMode,
      tall: list.filter(b => b.bottom - b.top >= 3).length, wicked: list.filter(b => b.wick || wickOf(b)).length };
  })
    // (and spread over the chart: a legend's letters sit in its top corner)
    .filter(g => g.list.length >= g.all * 0.6 && g.tall >= 2 && g.wicked >= g.list.length * 0.3
      && g.list.filter(b => b.top > y0 + ch * 0.25).length >= g.list.length * 0.3
      && Math.max(...g.list.map(b => b.x)) - Math.min(...g.list.map(b => b.x)) >= aw * 0.25).sort((a, b) => b.tall + b.wicked - (a.tall + a.wicked));

  const borderOf = (b: Body, body: RGB): RGB | null => {
    const y = Math.round((b.top + b.bottom) / 2);
    const l = at(b.xa - 1, y), r = at(b.xb + 1, y);
    if (bgLike(b.xa - 1, y) || bgLike(b.xb + 1, y) || dist(l, r) > sameTol || dist(l, body) <= sameTol) return null;
    return l;
  };
  const colorsOf = (g: { list: Body[] }): CandleColors => {
    const body = medianColor(g.list.map(b => b.color));
    const borders = g.list.map(b => borderOf(b, body)).filter(Boolean) as RGB[];
    const border = borders.length >= Math.max(2, g.list.length * 0.4) ? medianColor(borders) : body;
    const wicks = g.list.map(b => (b.wick ? null : wickOf(b))).filter(Boolean) as RGB[];
    const sameWick = g.list.filter(b => b.wick).length;
    // (wicks that joined the body are its colour; else the colour found just off the body)
    const wick = sameWick >= wicks.length ? body : modeColor(wicks)!;
    return { body: hex(body), border: hex(border), wick: hex(wick) };
  };

  let up: CandleColors | null = null, down: CandleColors | null = null, upBy: ImageTheme["upBy"] = null, candles = 0;
  let scanCandles: ChartScan["candles"] = [], scanStep = 0;
  // up and down: the strongest group, and the strongest other one drawn at the same width
  const A0 = candleGroups[0], B0 = A0 && candleGroups.slice(1).find(g => Math.abs(g.wMode - A0.wMode) <= 1);
  if (A0 && B0) {
    const A = A0, B = B0;
    // the bodies in order; neighbours (the next candle, not across a gap) say how they join
    const all = [...A.list.map(b => ({ b, a: true })), ...B.list.map(b => ({ b, a: false }))].sort((p, q) => p.b.x - q.b.x);
    const step = median(all.slice(1).map((p, i) => p.b.x - all[i].b.x).filter(d => d > 1));
    let errA = 0, errB = 0, pairs = 0;
    for (let i = 1; i < all.length; i++) {
      const p = all[i - 1], q = all[i];
      if (q.b.x - p.b.x > step * 1.6) continue;
      // A up: an up candle opens at its body's bottom and closes at its top
      const open = (s: typeof q, aUp: boolean) => (s.a === aUp ? s.b.bottom : s.b.top);
      const close = (s: typeof q, aUp: boolean) => (s.a === aUp ? s.b.top : s.b.bottom);
      errA += Math.abs(open(q, true) - close(p, true));
      errB += Math.abs(open(q, false) - close(p, false));
      pairs++;
    }
    let aUp: boolean;
    if (pairs >= 4 && Math.abs(errA - errB) > 0.15 * Math.max(errA, errB)) { aUp = errA < errB; upBy = "joins"; }
    else {
      // (the joins can't tell: the greener one is up; two greys: the lighter)
      const greenness = (c: RGB) => c[1] - Math.max(c[0], c[2]) * 0.6;
      const ga = greenness(A.color), gb = greenness(B.color);
      aUp = Math.abs(ga - gb) > 20 ? ga > gb : lum(A.color) >= lum(B.color);
      upBy = "hue";
    }
    up = colorsOf(aUp ? A : B); down = colorsOf(aUp ? B : A);
    candles = A.list.length + B.list.length;
    scanCandles = all.map(p => ({ x: p.b.x, top: p.b.top, bottom: p.b.bottom, up: p.a === aUp }));
    scanStep = step;
  }

  // ---- the price scale's text: right of the candles, the colour whose glyphs run down most of the
  // chart (the labels, one every so often); a table or a badge covers only a part of it ---------------
  const lastBody = bodies.reduce((m, b) => Math.max(m, b.xb), ax0);
  const sx0 = sepV ? sepV.at + 1 : Math.max(lastBody + 3, x1 - Math.max(90, Math.floor(cw * 0.08)));
  const glyph: { c: RGB; y: number; k: number }[] = [];
  for (let y = y0; y < y1; y++) for (let x = sx0; x <= x1; x++) {
    const c = at(x, y), b = rowBg[y]!, k = dist(c, b);
    if (k < Math.max(50, noise * 3)) continue;
    // (a glyph's stroke: background beside it; a label's filled box has none)
    if (!(bgLike(x - 2, y) || bgLike(x + 2, y) || bgLike(x, y - 2) || bgLike(x, y + 2))) continue;
    glyph.push({ c, y, k });
  }
  let text: RGB | null = null, bestCover = 0;
  const dirOf = (p: { c: RGB; y: number }): RGB => {
    const b = rowBg[p.y]!, d = [p.c[0] - b[0], p.c[1] - b[1], p.c[2] - b[2]], n = Math.hypot(d[0], d[1], d[2]) || 1;
    return [Math.round(128 + 127 * d[0] / n), Math.round(128 + 127 * d[1] / n), Math.round(128 + 127 * d[2] / n)];
  };
  for (const g of groupColors(glyph, dirOf, 30)) {
    const bins = new Set(g.list.map(p => Math.floor((p.y - y0) / 12)));
    if (bins.size <= bestCover) continue;
    // (its cores: the pixels furthest from the background)
    const ks = g.list.map(p => p.k).sort((a, b) => a - b), cut = ks[Math.floor(ks.length * (noise <= 1 ? 0.8 : 0.9))];
    const cores = g.list.filter(p => p.k >= cut).map(p => p.c);
    bestCover = bins.size;
    text = noise <= 1 ? unkey(modeOf(cores.map(key))!) : medianColor(cores);
  }
  // (a compressed image loses thin text's colour: none rather than a wrong one)
  if (bestCover < 3 || noise >= 3) text = null;

  // the page around the chart (a cropped chart: the chart itself)
  const page: RGB[] = [];
  for (let x = 0; x < W; x += 3) for (let y = 0; y < Math.min(y0, 30); y += 2) page.push(at(x, y));
  for (let y = 0; y < H; y += 3) for (let x = 0; x < Math.min(x0, 30); x += 2) page.push(at(x, y));
  const pageC = page.length >= 40 ? modeColor(page) : null;
  const chartDark = lum(midBg) < 0.5;

  const theme: ImageTheme = {
    chart: { x0, y0, x1, y1 },
    background: hex(gradient ? topBg : midBg), background2: hex(gradient ? botBg : midBg), gradient,
    gridHorz: gridH ? hex(gridH) : null, gridVert: gridV ? hex(gridV) : null,
    text: text ? hex(text) : null,
    lines: sepV ? hex(sepV.color) : sepH ? hex(sepH.color) : null,
    up, down, candles, upBy,
    pageDark: pageC ? lum(pageC) < 0.5 : chartDark,
    chartDark, noise,
  };
  const hexToRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const chartColors: RGB[] = [...volumeColors, ...(gridH ? [gridH] : []), ...(gridV ? [gridV] : []),
    ...[up, down].filter(Boolean).flatMap(c => [c!.body, c!.border, c!.wick].map(hexToRgb))];
  return {
    theme,
    scan: { at, rowBg, noise, inkTol, stepTol, sameTol, lineTol, plot: { x0: ax0, x1: ax1, y0: ay0, y1: ay1 }, candles: scanCandles, step: scanStep, chartColors },
  };
}

// the longest run of true values that covers `center` (gaps of up to `gap` false values bridged)
function runAround(flags: boolean[], center: number, gap: number): [number, number] | null {
  let c = center;
  if (!flags[c]) {
    let d = 1;
    while (d < flags.length && !(flags[c - d] || flags[c + d])) d++;
    c = flags[c - d] ? c - d : c + d;
    if (!flags[c]) return null;
  }
  let a = c, b = c;
  for (let i = c - 1, miss = 0; i >= 0; i--) { if (flags[i]) { a = i; miss = 0; } else if (++miss > gap) break; }
  for (let i = c + 1, miss = 0; i < flags.length; i++) { if (flags[i]) { b = i; miss = 0; } else if (++miss > gap) break; }
  return [a, b];
}
