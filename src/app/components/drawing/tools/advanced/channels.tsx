import React from 'react';
import { Group, Line, Shape, Text } from 'react-konva';
import { RenderCtx, XY, withAlpha, FAR } from './MultiPointTool';
import { SHAPE_FONT, textWidth } from '../../core/lineStats';

// TradingView's Channels (Parallel channel, Regression trend, Flat top/bottom, Disjoint channel)
// and Pitchforks (Pitchfork, Schiff, Modified Schiff, Inside), with their default colours.

const poly = (pts: XY[], fill: string, key?: string | number) => (
  <Shape key={key} listening={false} fill={fill} sceneFunc={(ctx, s) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.fillShape(s); }} />
);
const seg = (a: XY, b: XY, color: string, width = 2, dash?: number[], key?: string | number) => (
  <Line key={key} points={[a.x, a.y, b.x, b.y]} stroke={color} strokeWidth={width} dash={dash} hitStrokeWidth={10} />
);
const far = (from: XY, dir: XY) => { const l = Math.hypot(dir.x, dir.y) || 1; return { x: from.x + (dir.x / l) * FAR, y: from.y + (dir.y / l) * FAR }; };
const yOnLine = (a: XY, b: XY, x: number) => a.y + ((b.y - a.y) / ((b.x - a.x) || 1)) * (x - a.x);

// Parallel channel: A–B, the parallel line through C's offset, the dashed middle, filled
export function renderParallelChannel(c: RenderCtx) {
  const [A, B, C] = c.p;
  const color = c.d.stroke || '#2962FF';
  const off = C.y - yOnLine(A, B, C.x);
  const A2 = { x: A.x, y: A.y + off }, B2 = { x: B.x, y: B.y + off };
  const mid = (k: number) => [{ x: A.x, y: A.y + off * k }, { x: B.x, y: B.y + off * k }];
  return (
    <Group>
      {poly([A, B, B2, A2], c.d.fill || 'rgba(41, 98, 255, 0.2)', 'f')}
      {seg(A, B, color, 2, undefined, 'l0')}
      {seg(A2, B2, color, 2, undefined, 'l1')}
      {seg(mid(0.5)[0], mid(0.5)[1], color, 1, [6, 4], 'm')}
    </Group>
  );
}
// Regression trend: the least-squares line through the closes between A and B, with lines two
// standard deviations either side, and Pearson's R
export function renderRegressionTrend(c: RenderCtx) {
  const [A, B] = c.p; const [a, b] = c.pts;
  const data: { close: number }[] = (window as any).__chartFullData || [];
  const i0 = Math.max(0, Math.round(Math.min(a.logical, b.logical))), i1 = Math.min(data.length - 1, Math.round(Math.max(a.logical, b.logical)));
  const L = Math.min(A.x, B.x), R = Math.max(A.x, B.x);
  const edges = (
    <>
      <Line points={[L, -FAR, L, FAR]} stroke="#9598a1" strokeWidth={1} hitStrokeWidth={8} />
      <Line points={[R, -FAR, R, FAR]} stroke="#9598a1" strokeWidth={1} hitStrokeWidth={8} />
    </>
  );
  if (i1 - i0 < 1) return <Group>{edges}</Group>;
  const n = i1 - i0 + 1;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (let i = i0; i <= i1; i++) { const x = i - i0, y = data[i].close; sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const icpt = (sy - slope * sx) / n;
  let ss = 0;
  for (let i = i0; i <= i1; i++) { const r = data[i].close - (icpt + slope * (i - i0)); ss += r * r; }
  const sd = Math.sqrt(ss / n);
  const pearson = (n * sxy - sx * sy) / Math.sqrt(Math.max(1e-12, (n * sxx - sx * sx) * (n * syy - sy * sy)));
  const at = (i: number, dev: number) => ({ x: c.x(i) ?? 0, y: c.y(icpt + slope * (i - i0) + dev) ?? 0 });
  const up = [at(i0, 2 * sd), at(i1, 2 * sd)], dn = [at(i0, -2 * sd), at(i1, -2 * sd)], base = [at(i0, 0), at(i1, 0)];
  const label = pearson.toFixed(2);
  return (
    <Group>
      {edges}
      {poly([up[0], up[1], dn[1], dn[0]], 'rgba(41, 98, 255, 0.06)', 'f')}
      {seg(up[0], up[1], 'rgba(41, 98, 255, 0.3)', 2, undefined, 'u')}
      {seg(dn[0], dn[1], 'rgba(41, 98, 255, 0.3)', 2, undefined, 'd')}
      {seg(base[0], base[1], 'rgba(242, 54, 69, 0.3)', 1, [6, 4], 'b')}
      <Text x={(dn[0].x + dn[1].x) / 2 - textWidth(label, 12) / 2} y={Math.max(dn[0].y, dn[1].y) + 6} text={label} fontSize={12} fontFamily={SHAPE_FONT} fill="#2962FF" listening={false} />
    </Group>
  );
}

// Flat top/bottom: the A–B trend line and a level line at C's price between them, filled
export function renderFlatBottom(c: RenderCtx) {
  const [A, B, C] = c.p;
  const color = c.d.stroke || '#FF9800';
  const F1 = { x: A.x, y: C.y }, F2 = { x: B.x, y: C.y };
  return (
    <Group>
      {poly([A, B, F2, F1], c.d.fill || 'rgba(255, 152, 0, 0.2)', 'f')}
      {seg(A, B, color, 2, undefined, 't')}
      {seg(F1, F2, color, 2, undefined, 'f2')}
    </Group>
  );
}

// Disjoint channel: A–B and, from C, the same leg mirrored (its slope reversed), filled between
export function renderDisjointChannel(c: RenderCtx) {
  const [A, B, C] = c.p;
  const color = c.d.stroke || '#089981';
  const D = { x: B.x, y: C.y + (A.y - B.y) };
  return (
    <Group>
      {poly([A, B, D, C], c.d.fill || 'rgba(8, 153, 129, 0.2)', 'f')}
      {seg(A, B, color, 2, undefined, 'l1')}
      {seg(C, D, color, 2, undefined, 'l2')}
    </Group>
  );
}

// Pitchforks: a median from the start point through the middle of B–C, and lines parallel to it
// from B, C and the levels between, filled
const PF_LEVELS = [{ coeff: 0.5, color: '#089981' }, { coeff: 1, color: '#2962FF' }];
function pitchfork(c: RenderCtx, kind: 'original' | 'schiff' | 'modified' | 'inside') {
  const [A, B, C] = c.p;
  const red = c.d.medianColor || '#F23645';
  const M = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
  const AB = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  let start: XY = A, dir: XY;
  if (kind === 'schiff') start = { x: A.x, y: AB.y };
  if (kind === 'modified') start = AB;
  if (kind === 'inside') { start = M; dir = { x: C.x - AB.x, y: C.y - AB.y }; }
  else dir = { x: M.x - start.x, y: M.y - start.y };
  const lv = (c.d.levels || PF_LEVELS) as { coeff: number; color: string }[];
  const side = (T: XY) => lv.map(l => ({ l, from: { x: M.x + l.coeff * (T.x - M.x), y: M.y + l.coeff * (T.y - M.y) } }));
  const sides = [side(B), side(C)];
  const medianEnd = far(M, dir);
  return (
    <Group>
      {sides.map((s, k) => s.map((r, i) => {
        const prev = i ? s[i - 1].from : M;
        return poly([prev, far(prev, dir), far(r.from, dir), r.from], withAlpha(r.l.color, 80), `f${k}${i}`);
      }))}
      {sides.map((s, k) => s.map((r, i) => seg(r.from, far(r.from, dir), r.l.color, 2, undefined, `l${k}${i}`)))}
      {seg(kind === 'inside' ? M : start, medianEnd, red, 2, undefined, 'median')}
      {seg(B, C, red, 2, undefined, 'bc')}
      {kind !== 'original' && seg(A, B, red, 2, undefined, 'ab')}
      {kind === 'inside' && seg(AB, C, red, 2, undefined, 'abc')}
    </Group>
  );
}
export const renderPitchfork = (c: RenderCtx) => pitchfork(c, 'original');
export const renderSchiffPitchfork = (c: RenderCtx) => pitchfork(c, 'schiff');
export const renderModifiedSchiffPitchfork = (c: RenderCtx) => pitchfork(c, 'modified');
export const renderInsidePitchfork = (c: RenderCtx) => pitchfork(c, 'inside');
