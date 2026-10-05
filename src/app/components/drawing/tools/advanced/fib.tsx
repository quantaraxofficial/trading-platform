import React from 'react';
import { Group, Line, Shape, Text, Ellipse } from 'react-konva';
import { RenderCtx, XY, Level, withAlpha, rayEnd, FAR } from './MultiPointTool';
import { SHAPE_FONT, textWidth } from '../../core/lineStats';

// TradingView's Fibonacci tools (besides the retracement), drawn as it does with its default
// levels, colours and fills. Levels can be overridden per drawing via `d.levels`.

const GREY = '#808080';
export const EXT_LEVELS: Level[] = [
  { coeff: 0, color: GREY }, { coeff: 0.236, color: '#F23645' }, { coeff: 0.382, color: '#FF9800' },
  { coeff: 0.5, color: '#4caf50' }, { coeff: 0.618, color: '#089981' }, { coeff: 0.786, color: '#00bcd4' },
  { coeff: 1, color: GREY }, { coeff: 1.618, color: '#2962FF' }, { coeff: 2.618, color: '#F23645' },
  { coeff: 3.618, color: '#9c27b0' }, { coeff: 4.236, color: '#e91e63' },
];
const TIMEZONE_LEVELS: Level[] = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map(c => ({ coeff: c, color: c === 0 ? GREY : '#2962FF' }));
const TREND_TIME_LEVELS: Level[] = [
  { coeff: 0, color: GREY }, { coeff: 0.382, color: '#F23645' }, { coeff: 0.618, color: '#4caf50' }, { coeff: 1, color: '#089981' },
  { coeff: 1.382, color: '#00bcd4' }, { coeff: 1.618, color: GREY }, { coeff: 2, color: '#2962FF' }, { coeff: 2.382, color: '#e91e63' },
  { coeff: 2.618, color: '#9c27b0' }, { coeff: 3, color: '#673ab7' },
];
const CIRCLE_LEVELS: Level[] = [
  { coeff: 0.236, color: '#F23645' }, { coeff: 0.382, color: '#FF9800' }, { coeff: 0.5, color: '#089981' }, { coeff: 0.618, color: '#4caf50' },
  { coeff: 0.786, color: '#00bcd4' }, { coeff: 1, color: GREY }, { coeff: 1.618, color: '#2962FF' }, { coeff: 2.618, color: '#e91e63' },
  { coeff: 3.618, color: '#2962FF' }, { coeff: 4.236, color: '#e91e63' }, { coeff: 4.618, color: '#F23645' },
];
const WEDGE_LEVELS: Level[] = CIRCLE_LEVELS.slice(0, 6).map((l, i) => ({ ...l, color: ['#F23645', '#FF9800', '#4caf50', '#089981', '#00bcd4', GREY][i] }));
const FAN_LEVELS: Level[] = [
  { coeff: 0, color: GREY }, { coeff: 0.25, color: '#FF9800' }, { coeff: 0.382, color: '#00bcd4' }, { coeff: 0.5, color: '#4caf50' },
  { coeff: 0.618, color: '#089981' }, { coeff: 0.75, color: '#2962FF' }, { coeff: 1, color: GREY },
];
const PITCHFAN_LEVELS: Level[] = [{ coeff: 0.5, color: '#00bcd4' }, { coeff: 1, color: '#2962FF' }];

const levelsOf = (d: any, def: Level[]): Level[] => ((d.levels as Level[]) || def).filter(l => l.visible !== false);
const FILL_T = 80; // TradingView's default fill transparency
const dashTrend = (pts: XY[], color = GREY, width = 2) => (
  <Line points={pts.flatMap(q => [q.x, q.y])} stroke={color} strokeWidth={width} dash={[6, 4]} hitStrokeWidth={10} />
);
const label = (x: number, y: number, text: string, color: string, align: 'left' | 'right' | 'center' = 'left', key?: string | number) => {
  const w = textWidth(text, 12);
  const left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  return <Text key={key} x={left} y={y - 7} text={text} fontSize={12} fontFamily={SHAPE_FONT} fill={color} listening={false} />;
};
const fmtCoeff = (c: number) => String(parseFloat(c.toFixed(3)));
// A closed polygon (optionally with a hole) filled without stroking
const poly = (outer: XY[], fill: string, key?: string | number, hole?: XY[]) => (
  <Shape key={key} listening={false} fill={fill}
    sceneFunc={(ctx, shape) => {
      ctx.beginPath();
      outer.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      if (hole) { [...hole].reverse().forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); }
      ctx.fillShape(shape);
    }} />
);
const ellipsePts = (c: XY, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2, n = 72): XY[] => {
  const out: XY[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push({ x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) }); }
  return out;
};

// Horizontal price levels projected from the third point by the first leg (A→B), between B and C
export function renderFibTrendExt(c: RenderCtx) {
  const [A, B, C] = c.p; const [a, b, cc] = c.pts;
  const lv = levelsOf(c.d, EXT_LEVELS).sort((m, n) => m.coeff - n.coeff);
  const xL = Math.min(B.x, C.x), xR = Math.max(B.x, C.x, xL + 1);
  const ys = lv.map(l => c.y(cc.price + l.coeff * (b.price - a.price)) ?? 0);
  return (
    <Group>
      {lv.slice(1).map((l, i) => poly([{ x: xL, y: ys[i] }, { x: xR, y: ys[i] }, { x: xR, y: ys[i + 1] }, { x: xL, y: ys[i + 1] }], withAlpha(l.color, FILL_T), `f${i}`))}
      {lv.map((l, i) => <Line key={i} points={[xL, ys[i], xR, ys[i]]} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />)}
      {lv.map((l, i) => label(xL - 4, ys[i], `${fmtCoeff(l.coeff)} (${c.fmtPrice(cc.price + l.coeff * (b.price - a.price))})`, l.color, 'right', `t${i}`))}
      {dashTrend([A, B, C])}
    </Group>
  );
}

// Lines parallel to A→B, stepped out towards C by each level
export function renderFibChannel(c: RenderCtx) {
  const [A, B, C] = c.p;
  const lv = levelsOf(c.d, EXT_LEVELS).sort((m, n) => m.coeff - n.coeff);
  // TradingView steps each level along the A→C vector, so level 1 passes through C
  const v = { x: C.x - A.x, y: C.y - A.y };
  const seg = (k: number) => [{ x: A.x + k * v.x, y: A.y + k * v.y }, { x: B.x + k * v.x, y: B.y + k * v.y }];
  return (
    <Group>
      {lv.slice(1).map((l, i) => { const s0 = seg(lv[i].coeff), s1 = seg(l.coeff); return poly([s0[0], s0[1], s1[1], s1[0]], withAlpha(l.color, FILL_T), `f${i}`); })}
      {lv.map((l, i) => { const s = seg(l.coeff); return <Line key={i} points={[s[0].x, s[0].y, s[1].x, s[1].y]} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />; })}
      {lv.map((l, i) => { const s = seg(l.coeff); const pr = c.priceAt(s[0].y); return label(s[0].x - 4, s[0].y, `${fmtCoeff(l.coeff)}${pr !== null ? ` (${c.fmtPrice(pr)})` : ''}`, l.color, 'right', `t${i}`); })}
    </Group>
  );
}

// Vertical lines at the Fibonacci numbers of the A→B bar distance
export function renderFibTimeZone(c: RenderCtx) {
  const [A, B] = c.p; const [a, b] = c.pts;
  const dx = b.logical - a.logical;
  const lv = levelsOf(c.d, TIMEZONE_LEVELS);
  return (
    <Group>
      {lv.map((l, i) => {
        const x = c.x(a.logical + l.coeff * dx); if (x === null) return null;
        return (
          <Group key={i}>
            <Line points={[x, -FAR, x, FAR]} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />
            {label(x + 4, c.H - 14, fmtCoeff(l.coeff), l.color, 'left')}
          </Group>
        );
      })}
      {dashTrend([A, B], GREY, 1)}
    </Group>
  );
}

// A box from A to B with level grid lines, and fan rays from A through each level on the far sides
export function renderFibSpeedFan(c: RenderCtx) {
  const [A, B] = c.p;
  const lv = levelsOf(c.d, FAN_LEVELS).sort((m, n) => m.coeff - n.coeff);
  // TradingView counts the levels from B: 0 on B's edge, 1 on A's
  const hy = (k: number) => B.y + k * (A.y - B.y), vx = (k: number) => B.x + k * (A.x - B.x);
  const hRays = lv.map(l => rayEnd(A, { x: B.x, y: hy(l.coeff) }));
  const vRays = lv.map(l => rayEnd(A, { x: vx(l.coeff), y: B.y }));
  return (
    <Group>
      {lv.slice(1).map((l, i) => poly([A, hRays[i], hRays[i + 1]], withAlpha(l.color, FILL_T), `fh${i}`))}
      {lv.slice(1).map((l, i) => poly([A, vRays[i], vRays[i + 1]], withAlpha(l.color, FILL_T), `fv${i}`))}
      {lv.map((l, i) => {
        const y = hy(l.coeff), x = vx(l.coeff);
        return (
          <Group key={i}>
            <Line points={[A.x, y, B.x, y]} stroke={l.color} strokeWidth={1} listening={false} />
            <Line points={[x, A.y, x, B.y]} stroke={l.color} strokeWidth={1} listening={false} />
            {l.coeff !== 1 && <Line points={[A.x, A.y, hRays[i].x, hRays[i].y]} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />}
            {l.coeff !== 1 && <Line points={[A.x, A.y, vRays[i].x, vRays[i].y]} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />}
            {label(Math.min(A.x, B.x) - 6, y, fmtCoeff(l.coeff), l.color, 'right', `l${i}`)}
            {label(Math.max(A.x, B.x) + 6, y, fmtCoeff(l.coeff), l.color, 'left', `r${i}`)}
            {label(x, Math.min(A.y, B.y) - 10, fmtCoeff(l.coeff), l.color, 'center', `tp${i}`)}
            {label(x, Math.max(A.y, B.y) + 10, fmtCoeff(l.coeff), l.color, 'center', `bt${i}`)}
          </Group>
        );
      })}
    </Group>
  );
}

// Vertical bands from C, stepped by the A→B time distance
export function renderFibTrendTime(c: RenderCtx) {
  const [A, B, C] = c.p; const [a, b, cc] = c.pts;
  const dx = b.logical - a.logical;
  const lv = levelsOf(c.d, TREND_TIME_LEVELS).sort((m, n) => m.coeff - n.coeff);
  const xs = lv.map(l => c.x(cc.logical + l.coeff * dx) ?? 0);
  return (
    <Group>
      {lv.slice(1).map((l, i) => poly([{ x: xs[i], y: -FAR }, { x: xs[i + 1], y: -FAR }, { x: xs[i + 1], y: FAR }, { x: xs[i], y: FAR }], withAlpha(l.color, FILL_T), `f${i}`))}
      {lv.map((l, i) => <Line key={i} points={[xs[i], -FAR, xs[i], FAR]} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />)}
      {lv.map((l, i) => label(xs[i] + 4, c.H - 14, fmtCoeff(l.coeff), l.color, 'left', `t${i}`))}
      {dashTrend([A, B, C])}
    </Group>
  );
}

// Ellipses around the middle of A→B; level 1 fits the A→B box
export function renderFibCircles(c: RenderCtx) {
  const [A, B] = c.p;
  const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const rx = Math.abs(B.x - A.x) / 2, ry = Math.abs(B.y - A.y) / 2;
  const lv = levelsOf(c.d, CIRCLE_LEVELS).sort((m, n) => m.coeff - n.coeff);
  return (
    <Group>
      {lv.map((l, i) => poly(ellipsePts(M, rx * l.coeff, ry * l.coeff), withAlpha(l.color, FILL_T), `f${i}`, i ? ellipsePts(M, rx * lv[i - 1].coeff, ry * lv[i - 1].coeff) : undefined))}
      {lv.map((l, i) => <Ellipse key={i} x={M.x} y={M.y} radiusX={rx * l.coeff} radiusY={ry * l.coeff} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />)}
      {lv.map((l, i) => label(M.x - rx * l.coeff + 4, M.y + 10, fmtCoeff(l.coeff), l.color, 'left', `t${i}`))}
      {dashTrend([A, B])}
    </Group>
  );
}

// A golden spiral around A passing through B, with the ray from A through B
export function renderFibSpiral(c: RenderCtx) {
  const [A, B] = c.p;
  const color = c.d.stroke || '#00bcd4';
  const r0 = Math.hypot(B.x - A.x, B.y - A.y);
  const th0 = Math.atan2(B.y - A.y, B.x - A.x);
  const phi = (1 + Math.sqrt(5)) / 2;
  const dir = c.d.counterclockwise ? -1 : 1;
  const pts: number[] = [];
  for (let k = -360 * 4; k <= 360 * 1.5; k += 4) {
    const th = (k * Math.PI) / 180;
    const r = r0 * Math.pow(phi, th / (Math.PI / 2));
    if (r < 0.5) continue;
    pts.push(A.x + r * Math.cos(th0 + dir * th), A.y + r * Math.sin(th0 + dir * th));
  }
  const end = rayEnd(A, B);
  return (
    <Group>
      <Line points={pts} stroke={color} strokeWidth={c.d.strokeWidth || 2} hitStrokeWidth={8} />
      <Line points={[A.x, A.y, end.x, end.y]} stroke={color} strokeWidth={c.d.strokeWidth || 2} hitStrokeWidth={8} />
    </Group>
  );
}

// Half circles around A at each level of |AB|, on B's side
export function renderFibSpeedArcs(c: RenderCtx) {
  const [A, B] = c.p;
  const R = Math.hypot(B.x - A.x, B.y - A.y);
  const up = B.y <= A.y;
  const a0 = up ? Math.PI : 0, a1 = up ? Math.PI * 2 : Math.PI;
  const lv = levelsOf(c.d, CIRCLE_LEVELS).sort((m, n) => m.coeff - n.coeff);
  return (
    <Group>
      {lv.map((l, i) => poly(ellipsePts(A, R * l.coeff, R * l.coeff, a0, a1), withAlpha(l.color, FILL_T), `f${i}`, i ? ellipsePts(A, R * lv[i - 1].coeff, R * lv[i - 1].coeff, a0, a1) : undefined))}
      {lv.map((l, i) => <Line key={i} points={ellipsePts(A, R * l.coeff, R * l.coeff, a0, a1).flatMap(q => [q.x, q.y])} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />)}
      {lv.map((l, i) => label(A.x - 4, A.y + (up ? -1 : 1) * R * l.coeff, fmtCoeff(l.coeff), l.color, 'right', `t${i}`))}
      {dashTrend([A, B])}
    </Group>
  );
}

// Arcs between the rays A→B and A→C at each level of |AB|
export function renderFibWedge(c: RenderCtx) {
  const [A, B, C] = c.p;
  const R = Math.hypot(B.x - A.x, B.y - A.y);
  const t1 = Math.atan2(B.y - A.y, B.x - A.x);
  let t2 = Math.atan2(C.y - A.y, C.x - A.x);
  let delta = t2 - t1; while (delta > Math.PI) delta -= 2 * Math.PI; while (delta < -Math.PI) delta += 2 * Math.PI; t2 = t1 + delta;
  const lv = levelsOf(c.d, WEDGE_LEVELS).sort((m, n) => m.coeff - n.coeff);
  const arc = (k: number) => ellipsePts(A, R * k, R * k, t1, t2, 48);
  const edge = (t: number) => ({ x: A.x + R * Math.cos(t), y: A.y + R * Math.sin(t) });
  return (
    <Group>
      {lv.map((l, i) => poly([...(i ? [] : [A]), ...arc(l.coeff), ...(i ? arc(lv[i - 1].coeff).reverse() : [])], withAlpha(l.color, FILL_T), `f${i}`))}
      {lv.map((l, i) => <Line key={i} points={arc(l.coeff).flatMap(q => [q.x, q.y])} stroke={l.color} strokeWidth={2} hitStrokeWidth={8} />)}
      {lv.map((l, i) => { const q = { x: A.x + R * l.coeff * Math.cos((t1 + t2) / 2), y: A.y + R * l.coeff * Math.sin((t1 + t2) / 2) }; return label(q.x, q.y, fmtCoeff(l.coeff), l.color, 'center', `t${i}`); })}
      <Line points={[A.x, A.y, edge(t1).x, edge(t1).y]} stroke={GREY} strokeWidth={2} hitStrokeWidth={8} />
      <Line points={[A.x, A.y, edge(t2).x, edge(t2).y]} stroke={GREY} strokeWidth={2} hitStrokeWidth={8} />
    </Group>
  );
}

// A fan from A: the median to the middle of B–C, and rays through the levels towards B and C
export function renderPitchfan(c: RenderCtx) {
  const [A, B, C] = c.p;
  const M = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
  const median = c.d.medianColor || '#F23645';
  const lv = levelsOf(c.d, PITCHFAN_LEVELS).sort((m, n) => m.coeff - n.coeff);
  const side = (target: XY) => lv.map(l => ({ l, end: rayEnd(A, { x: M.x + l.coeff * (target.x - M.x), y: M.y + l.coeff * (target.y - M.y) }) }));
  const mEnd = rayEnd(A, M);
  const rays = [side(B), side(C)];
  return (
    <Group>
      {rays.map((rs, s) => rs.map((r, i) => poly([A, i ? rs[i - 1].end : mEnd, r.end], withAlpha(r.l.color, FILL_T), `f${s}${i}`)))}
      {rays.map((rs, s) => rs.map((r, i) => <Line key={`${s}${i}`} points={[A.x, A.y, r.end.x, r.end.y]} stroke={r.l.color} strokeWidth={2} hitStrokeWidth={8} />))}
      <Line points={[A.x, A.y, mEnd.x, mEnd.y]} stroke={median} strokeWidth={2} hitStrokeWidth={8} />
      <Line points={[B.x, B.y, C.x, C.y]} stroke={median} strokeWidth={2} hitStrokeWidth={8} />
    </Group>
  );
}
