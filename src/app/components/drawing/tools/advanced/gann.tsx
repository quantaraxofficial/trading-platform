import React from 'react';
import { Group, Line, Shape, Text, Rect } from 'react-konva';
import { RenderCtx, XY, withAlpha, rayEnd } from './MultiPointTool';
import { SHAPE_FONT, textWidth } from '../../core/lineStats';

// TradingView's Gann tools: Gann box, Gann square fixed, Gann square and Gann fan

const GREY = '#808080';
const BOX_LEVELS = [
  { coeff: 0, color: GREY }, { coeff: 0.25, color: '#FF9800' }, { coeff: 0.382, color: '#00bcd4' }, { coeff: 0.5, color: '#4caf50' },
  { coeff: 0.618, color: '#089981' }, { coeff: 0.75, color: '#2962FF' }, { coeff: 1, color: GREY },
];
// The 5×5 square's grid lines, arcs (radius √(x²+y²) units) and fan lines
const SQUARE_GRID = [GREY, '#FF9800', '#00bcd4', '#4caf50', '#089981', GREY];
const SQUARE_ARCS: [number, number, string][] = [
  [1, 0, '#FF9800'], [1, 1, '#FF9800'], [1.5, 0, '#FF9800'], [2, 0, '#00bcd4'], [2, 1, '#00bcd4'], [3, 0, '#4caf50'],
  [3, 1, '#4caf50'], [4, 0, '#089981'], [4, 1, '#089981'], [5, 0, '#2962FF'], [5, 1, '#2962FF'],
];
const SQUARE_FANS: [number, number, string][] = [[2, 1, '#00bcd4'], [1, 1, '#4caf50'], [1, 2, '#089981']];
const FAN_RATIOS: [number, number, string][] = [
  [1, 8, '#FF9800'], [1, 4, '#089981'], [1, 3, '#4caf50'], [1, 2, '#089981'], [1, 1, '#00bcd4'],
  [2, 1, '#2962FF'], [3, 1, '#9c27b0'], [4, 1, '#e91e63'], [8, 1, '#F23645'],
];

const label = (x: number, y: number, text: string, color: string, align: 'left' | 'right' | 'center', key?: string | number) => {
  const w = textWidth(text, 12);
  return <Text key={key} x={align === 'left' ? x : align === 'right' ? x - w : x - w / 2} y={y - 7} text={text} fontSize={12} fontFamily={SHAPE_FONT} fill={color} listening={false} />;
};
const poly = (pts: XY[], fill: string, key?: string | number) => (
  <Shape key={key} listening={false} fill={fill} sceneFunc={(ctx, s) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.fillShape(s); }} />
);
const fmt = (c: number) => String(parseFloat(c.toFixed(3)));

// A box with level lines both ways, banded fills and labels on all four sides
export function renderGannBox(c: RenderCtx) {
  const [A, B] = c.p;
  const L = Math.min(A.x, B.x), R = Math.max(A.x, B.x), T = Math.min(A.y, B.y), Bo = Math.max(A.y, B.y);
  const ys = BOX_LEVELS.map(l => A.y + l.coeff * (B.y - A.y));
  const xs = BOX_LEVELS.map(l => A.x + l.coeff * (B.x - A.x));
  return (
    <Group>
      {BOX_LEVELS.slice(1).map((l, i) => poly([{ x: L, y: ys[i] }, { x: R, y: ys[i] }, { x: R, y: ys[i + 1] }, { x: L, y: ys[i + 1] }], withAlpha(l.color, 80), `h${i}`))}
      {BOX_LEVELS.slice(1).map((l, i) => poly([{ x: xs[i], y: T }, { x: xs[i + 1], y: T }, { x: xs[i + 1], y: Bo }, { x: xs[i], y: Bo }], withAlpha(l.color, 80), `v${i}`))}
      {BOX_LEVELS.map((l, i) => (
        <Group key={i}>
          <Line points={[L, ys[i], R, ys[i]]} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />
          <Line points={[xs[i], T, xs[i], Bo]} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />
          {label(L - 6, ys[i], fmt(l.coeff), l.color, 'right')}
          {label(R + 6, ys[i], fmt(l.coeff), l.color, 'left')}
          {label(xs[i], T - 10, fmt(l.coeff), l.color, 'center')}
          {label(xs[i], Bo + 10, fmt(l.coeff), l.color, 'center')}
        </Group>
      ))}
    </Group>
  );
}

// The shared 5×5 square: grid, arcs from the corner and fan lines, kept inside the square
function gannSquare(A: XY, ux: number, uy: number, key = 'sq') {
  const corner = (x: number, y: number) => ({ x: A.x + x * ux, y: A.y + y * uy });
  const arcPts = (r: number) => { const out: XY[] = []; for (let i = 0; i <= 48; i++) { const t = (Math.PI / 2) * (i / 48); out.push(corner(r * Math.cos(t), r * Math.sin(t))); } return out; };
  const radii = SQUARE_ARCS.map(([x, y, color]) => ({ r: Math.hypot(x, y), color }));
  const box = [corner(0, 0), corner(5, 0), corner(5, 5), corner(0, 5)];
  return (
    <Group key={key} clipFunc={(ctx) => { ctx.beginPath(); box.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); }}>
      {radii.map((a, i) => poly([...arcPts(a.r), ...(i ? arcPts(radii[i - 1].r).reverse() : [corner(0, 0)])], withAlpha(a.color, 80), `af${i}`))}
      {SQUARE_GRID.map((color, i) => (
        <Group key={`g${i}`}>
          <Line points={[corner(i, 0).x, corner(i, 0).y, corner(i, 5).x, corner(i, 5).y]} stroke={color} strokeWidth={2} hitStrokeWidth={8} />
          <Line points={[corner(0, i).x, corner(0, i).y, corner(5, i).x, corner(5, i).y]} stroke={color} strokeWidth={2} hitStrokeWidth={8} />
        </Group>
      ))}
      {radii.map((a, i) => <Line key={`a${i}`} points={arcPts(a.r).flatMap(q => [q.x, q.y])} stroke={a.color} strokeWidth={2} listening={false} />)}
      {SQUARE_FANS.map(([fx, fy, color], i) => { const e = corner(5 * Math.min(1, fx / fy), 5 * Math.min(1, fy / fx)); return <Line key={`fan${i}`} points={[A.x, A.y, e.x, e.y]} stroke={color} strokeWidth={2} hitStrokeWidth={8} />; })}
    </Group>
  );
}

// Gann square: the 5×5 square fitted to the A→B box, with its price range, bars and ratio
export function renderGannSquare(c: RenderCtx) {
  const [A, B] = c.p; const [a, b] = c.pts;
  const ux = (B.x - A.x) / 5, uy = (B.y - A.y) / 5;
  const range = Math.abs(b.price - a.price), bars = Math.abs(Math.round(b.logical - a.logical));
  const L = Math.min(A.x, B.x), R = Math.max(A.x, B.x), T = Math.min(A.y, B.y), Bo = Math.max(A.y, B.y);
  const ink = c.dark ? '#d1d4dc' : '#787b86';
  return (
    <Group>
      <Rect x={L} y={T} width={R - L} height={Bo - T} fill="rgba(0,0,0,0.001)" />
      {gannSquare(A, ux, uy)}
      {label(L - 8, T - 6, range.toFixed(c.prec), ink, 'right')}
      {label(R + 8, T - 6, bars ? String(parseFloat((range / bars).toFixed(7))) : '', ink, 'left')}
      {label(R + 8, Bo + 8, String(bars), ink, 'left')}
    </Group>
  );
}

// Gann square fixed: |AB| on screen is one unit of a square 5 units a side, towards B
export function renderGannFixed(c: RenderCtx) {
  const [A, B] = c.p;
  const u = Math.hypot(B.x - A.x, B.y - A.y);
  const sx = B.x >= A.x ? 1 : -1, sy = B.y >= A.y ? 1 : -1;
  return <Group>{gannSquare(A, sx * u, sy * u)}</Group>;
}

// Gann fan: rays from A at time/price ratios of the A→B step (1/1), labelled at the A→B box edge
export function renderGannFan(c: RenderCtx) {
  const [A, B] = c.p;
  const dx = B.x - A.x, dy = B.y - A.y;
  const rays = FAN_RATIOS.map(([t, p, color]) => {
    const through = t >= p ? { x: A.x + dx, y: A.y + (dy * p) / t } : { x: A.x + (dx * t) / p, y: A.y + dy };
    return { end: rayEnd(A, through), through, color, text: `${t}/${p}` };
  });
  return (
    <Group>
      {rays.slice(1).map((r, i) => poly([A, rays[i].end, r.end], withAlpha(r.color, 80), `f${i}`))}
      {rays.map((r, i) => <Line key={i} points={[A.x, A.y, r.end.x, r.end.y]} stroke={r.color} strokeWidth={2} hitStrokeWidth={8} />)}
      {rays.map((r, i) => label(r.through.x + 6, r.through.y, r.text, r.color, 'left', `t${i}`))}
    </Group>
  );
}
