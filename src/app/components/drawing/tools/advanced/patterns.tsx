import React from 'react';
import { Group, Line, Shape, Text, Rect } from 'react-konva';
import { RenderCtx, XY, withAlpha, FAR } from './MultiPointTool';
import { SHAPE_FONT, textWidth } from '../../core/lineStats';

// TradingView's chart patterns (XABCD, Cypher, Head and shoulders, ABCD, Triangle pattern, Three
// drives), Elliott waves and cycles (Cyclic lines, Time cycles, Sine line).

const poly = (pts: XY[], fill: string, key?: string | number) => (
  <Shape key={key} listening={false} fill={fill} sceneFunc={(ctx, s) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.fillShape(s); }} />
);
const path = (pts: XY[], color: string, width = 2, key?: string | number) => (
  <Line key={key} points={pts.flatMap(q => [q.x, q.y])} stroke={color} strokeWidth={width} hitStrokeWidth={10} lineJoin="round" />
);
const dotted = (a: XY, b: XY, color: string, key?: string | number) => (
  <Line key={key} points={[a.x, a.y, b.x, b.y]} stroke={color} strokeWidth={1} dash={[2, 3]} listening={false} />
);
// A small filled badge with white text, centred on (x, y)
const badge = (x: number, y: number, text: string, bg: string, key?: string | number, fontSize = 12) => {
  const w = textWidth(text, fontSize) + 8, h = fontSize + 5;
  return (
    <Group key={key} x={x - w / 2} y={y - h / 2} listening={false}>
      <Rect width={w} height={h} fill={bg} cornerRadius={2} />
      <Text x={4} y={2.5} text={text} fontSize={fontSize} fontFamily={SHAPE_FONT} fill="#ffffff" />
    </Group>
  );
};
const ratio = (num: number, den: number) => (den ? String(parseFloat(Math.abs(num / den).toFixed(3))) : '');
// Whether point i is a peak (above its neighbours) — labels go above peaks and below troughs
const isPeak = (p: XY[], i: number) => {
  const prev = p[i - 1] ?? p[i + 1], next = p[i + 1] ?? p[i - 1];
  return p[i].y <= Math.min(prev.y, next.y) || (p[i].y < prev.y && i === p.length - 1) || (i === 0 && p[0].y < p[1].y);
};
const mid = (a: XY, b: XY) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const letterAt = (p: XY[], i: number, text: string, bg: string, key?: string | number) =>
  badge(p[i].x, p[i].y + (isPeak(p, i) ? -16 : 16), text, bg, key);

// XABCD / Cypher: the five legs, the two triangles shaded, and the leg ratios on the dotted diagonals
function harmonic(c: RenderCtx, cypher: boolean) {
  const p = c.p, pr = c.pts.map(q => q.price);
  const color = c.d.stroke || '#2962FF';
  const fill = withAlpha(c.d.fill || color, 85);
  const [X, A, B, C, D] = pr;
  const xb = ratio(B - A, A - X);
  const ac = cypher ? ratio(C - X, A - X) : ratio(C - B, B - A);
  const bd = ratio(D - C, C - B);
  const xd = cypher ? ratio(D - C, C - X) : ratio(D - A, A - X);
  return (
    <Group>
      {poly([p[0], p[1], p[2]], fill, 'f1')}
      {poly([p[2], p[3], p[4]], fill, 'f2')}
      {dotted(p[0], p[2], color, 'd1')}{dotted(p[1], p[3], color, 'd2')}{dotted(p[2], p[4], color, 'd3')}{dotted(p[0], p[4], color, 'd4')}
      {path(p, color, c.d.strokeWidth || 2)}
      {badge(mid(p[0], p[2]).x, mid(p[0], p[2]).y, xb, color, 'r1')}
      {badge(mid(p[1], p[3]).x, mid(p[1], p[3]).y, ac, color, 'r2')}
      {badge(mid(p[2], p[4]).x, mid(p[2], p[4]).y, bd, color, 'r3')}
      {badge(mid(p[0], p[4]).x, mid(p[0], p[4]).y, xd, color, 'r4')}
      {['X', 'A', 'B', 'C', 'D'].map((t, i) => letterAt(p, i, t, color, `l${i}`))}
    </Group>
  );
}
export const renderXABCD = (c: RenderCtx) => harmonic(c, false);
export const renderCypher = (c: RenderCtx) => harmonic(c, true);

// Where the line through a and b crosses the segment s0→s1 (or null)
function cross(a: XY, b: XY, s0: XY, s1: XY): XY | null {
  const d = (b.x - a.x) * (s1.y - s0.y) - (b.y - a.y) * (s1.x - s0.x);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((s0.x - a.x) * (b.y - a.y) - (s0.y - a.y) * (b.x - a.x)) / d;
  if (u < 0 || u > 1) return null;
  return { x: s0.x + u * (s1.x - s0.x), y: s0.y + u * (s1.y - s0.y) };
}

// Head and shoulders: seven points, the shoulders and head shaded down to the neckline (through
// the two troughs, extended both ways), with their names
export function renderHeadShoulders(c: RenderCtx) {
  const p = c.p;
  const color = c.d.stroke || '#089981';
  const fill = withAlpha(color, 85);
  const n0 = p[2], n1 = p[4];
  const dx = n1.x - n0.x || 1, slope = (n1.y - n0.y) / dx;
  const neck = (x: number) => ({ x, y: n0.y + slope * (x - n0.x) });
  const left = cross(n0, n1, p[0], p[1]) ?? p[0];
  const right = cross(n0, n1, p[5], p[6]) ?? p[6];
  return (
    <Group>
      {poly([left, p[1], p[2]], fill, 'f1')}
      {poly([p[2], p[3], p[4]], fill, 'f2')}
      {poly([p[4], p[5], right], fill, 'f3')}
      <Line points={[neck(n0.x - FAR).x, neck(n0.x - FAR).y, neck(n1.x + FAR).x, neck(n1.x + FAR).y]} stroke={color} strokeWidth={1} dash={[2, 3]} listening={false} />
      {path(p, color, c.d.strokeWidth || 2)}
      {badge(p[1].x, p[1].y - 16, 'Left Shoulder', color, 'l1')}
      {badge(p[3].x, p[3].y - 16, 'Head', color, 'l2')}
      {badge(p[5].x, p[5].y - 16, 'Right Shoulder', color, 'l3')}
    </Group>
  );
}

// ABCD: the three legs, with BC/AB on A–C and CD/BC on B–D
export function renderABCD(c: RenderCtx) {
  const p = c.p, pr = c.pts.map(q => q.price);
  const color = c.d.stroke || '#089981';
  return (
    <Group>
      {dotted(p[0], p[2], color, 'd1')}{dotted(p[1], p[3], color, 'd2')}
      {path(p, color, c.d.strokeWidth || 2)}
      {badge(mid(p[0], p[2]).x, mid(p[0], p[2]).y, ratio(pr[2] - pr[1], pr[1] - pr[0]), color, 'r1')}
      {badge(mid(p[1], p[3]).x, mid(p[1], p[3]).y, ratio(pr[3] - pr[2], pr[2] - pr[1]), color, 'r2')}
      {['A', 'B', 'C', 'D'].map((t, i) => letterAt(p, i, t, color, `l${i}`))}
    </Group>
  );
}

// Triangle pattern: A–B–C–D, with the A–C and B–D trend lines extended right and the triangle shaded
export function renderTrianglePattern(c: RenderCtx) {
  const p = c.p;
  const color = c.d.stroke || '#673ab7';
  const fill = withAlpha(color, 85);
  const lineAt = (a: XY, b: XY, x: number) => ({ x, y: a.y + ((b.y - a.y) / ((b.x - a.x) || 1)) * (x - a.x) });
  const span = Math.max(p[3].x - p[0].x, 1);
  let xEnd = p[3].x + span;
  const s1 = (p[2].y - p[0].y) / ((p[2].x - p[0].x) || 1), s2 = (p[3].y - p[1].y) / ((p[3].x - p[1].x) || 1);
  if (Math.abs(s1 - s2) > 1e-9) {
    const xi = (p[1].y - p[0].y + s1 * p[0].x - s2 * p[1].x) / (s1 - s2);
    if (xi > p[3].x && xi < p[3].x + 3 * span) xEnd = xi;
  }
  const lower = [lineAt(p[0], p[2], p[0].x), lineAt(p[0], p[2], xEnd)];
  const upper = [lineAt(p[1], p[3], p[0].x), lineAt(p[1], p[3], xEnd)];
  return (
    <Group>
      {poly([lower[0], lower[1], upper[1], upper[0]], fill, 'f')}
      {dotted(lower[0], lower[1], color, 'd1')}{dotted(upper[0], upper[1], color, 'd2')}{dotted(lower[0], upper[0], color, 'd3')}
      {path(p, color, c.d.strokeWidth || 2)}
      {['A', 'B', 'C', 'D'].map((t, i) => letterAt(p, i, t, color, `l${i}`))}
    </Group>
  );
}

// Three drives: seven points, with each drive's extension of the retracement before it
export function renderThreeDrives(c: RenderCtx) {
  const p = c.p, pr = c.pts.map(q => q.price);
  const color = c.d.stroke || '#673ab7';
  return (
    <Group>
      {dotted(p[1], p[3], color, 'd1')}{dotted(p[3], p[5], color, 'd2')}
      {path(p, color, c.d.strokeWidth || 2)}
      {badge(mid(p[1], p[3]).x, mid(p[1], p[3]).y, ratio(pr[3] - pr[2], pr[1] - pr[2]), color, 'r1')}
      {badge(mid(p[3], p[5]).x, mid(p[3], p[5]).y, ratio(pr[5] - pr[4], pr[3] - pr[4]), color, 'r2')}
    </Group>
  );
}

// Elliott waves: the wave with its labels in brackets, above peaks and below troughs
const ELLIOTT_LABELS: Record<string, string[]> = {
  elliott_impulse_wave: ['0', '1', '2', '3', '4', '5'],
  elliott_correction: ['0', 'A', 'B', 'C'],
  elliott_triangle_wave: ['0', 'A', 'B', 'C', 'D', 'E'],
  elliott_double_combo: ['0', 'W', 'X', 'Y'],
  elliott_triple_combo: ['0', 'W', 'X', 'Y', 'X', 'Z'],
};
export const ELLIOTT_POINTS: Record<string, number> = Object.fromEntries(Object.entries(ELLIOTT_LABELS).map(([k, v]) => [k, v.length]));
export function renderElliott(c: RenderCtx) {
  const p = c.p;
  const color = c.d.stroke || '#3d85c6';
  const labels = ELLIOTT_LABELS[c.d.type] || [];
  return (
    <Group>
      {c.d.showWave !== false && path(p, color, c.d.strokeWidth || 2)}
      {p.map((q, i) => {
        const t = `(${labels[i] ?? i})`;
        const w = textWidth(t, 13);
        return <Text key={i} x={q.x - w / 2} y={q.y + (isPeak(p, i) ? -24 : 10)} text={t} fontSize={13} fontFamily={SHAPE_FONT} fill={color} listening={false} />;
      })}
    </Group>
  );
}

// Cyclic lines: vertical lines repeating every A→B bars, from A onwards
export function renderCyclicLines(c: RenderCtx) {
  const [A, B] = c.p; const [a, b] = c.pts;
  const color = c.d.stroke || '#80ccdb';
  const step = b.logical - a.logical;
  const lines: React.ReactNode[] = [];
  if (Math.abs(step) >= 0.5) {
    for (let k = 0; k < 400; k++) {
      const x = c.x(a.logical + k * step);
      if (x === null || (step > 0 ? x > c.W + 50 : x < -50)) break;
      lines.push(<Line key={k} points={[x, -FAR, x, FAR]} stroke={color} strokeWidth={c.d.strokeWidth || 2} hitStrokeWidth={8} />);
    }
  }
  return (
    <Group>
      {lines}
      <Line points={[A.x, A.y, B.x, B.y]} stroke="#808080" strokeWidth={1} dash={[6, 4]} listening={false} />
    </Group>
  );
}

// Time cycles: half circles one A→B wide, end to end along A's price, both ways across the chart
export function renderTimeCycles(c: RenderCtx) {
  const [A, B] = c.p;
  const color = c.d.stroke || '#159980';
  const fill = c.d.fill || 'rgba(106, 168, 79, 0.5)';
  const w = Math.abs(B.x - A.x);
  const arcs: React.ReactNode[] = [];
  if (w >= 2) {
    const start = A.x - Math.ceil((A.x + 50) / w) * w;
    for (let x0 = start, k = 0; x0 < c.W + 50 && k < 600; x0 += w, k++) {
      const cx = x0 + w / 2, r = w / 2;
      arcs.push(
        <Shape key={k} fill={fill} stroke={color} strokeWidth={c.d.strokeWidth || 2}
          sceneFunc={(ctx, s) => { ctx.beginPath(); ctx.arc(cx, A.y, r, Math.PI, 0, false); ctx.closePath(); ctx.fillStrokeShape(s); }}
          hitFunc={(ctx, s) => { ctx.beginPath(); ctx.arc(cx, A.y, r, Math.PI, 0, false); ctx.strokeShape(s); }} hitStrokeWidth={8} />
      );
    }
  }
  return <Group>{arcs}</Group>;
}

// Sine line: a wave with its trough at A and crest at B, across the chart
export function renderSineLine(c: RenderCtx) {
  const [A, B] = c.p;
  const color = c.d.stroke || '#159980';
  const half = B.x - A.x || 1;
  const amp = (A.y - B.y) / 2, midY = (A.y + B.y) / 2;
  const pts: number[] = [];
  for (let x = -20; x <= c.W + 20; x += 2) pts.push(x, midY + amp * Math.cos((Math.PI * (x - A.x)) / half));
  return <Group><Line points={pts} stroke={color} strokeWidth={c.d.strokeWidth || 2} hitStrokeWidth={8} /></Group>;
}
