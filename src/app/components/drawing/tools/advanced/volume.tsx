import React from 'react';
import { Group, Line, Rect, Shape } from 'react-konva';
import { RenderCtx, Pt, FAR } from './MultiPointTool';

// TradingView's volume-based tools, computed from the chart's own bars: Anchored VWAP (with its
// ±1 standard deviation band), Fixed range volume profile and Anchored volume profile (24 rows of
// up / down volume, the value area holding 70% of it, and the point of control).

type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
const visibleBars = (): Bar[] => {
  const all: Bar[] = (window as any).__chartFullData || [];
  const cut = (window as any).__replayVisibleCutoff;
  return typeof cut === 'number' ? all.slice(0, cut + 1) : all;
};

// Anchored VWAP from the anchor bar to the latest one
export function renderAnchoredVWAP(c: RenderCtx) {
  const data = visibleBars();
  const i0 = Math.max(0, Math.round(c.pts[0].logical));
  if (i0 >= data.length) return null;
  const line: number[] = [], upper: number[] = [], lower: number[] = [];
  let pv = 0, v = 0, pv2 = 0;
  for (let i = i0; i < data.length; i++) {
    const b = data[i];
    const vol = b.volume || 1;
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * vol; v += vol; pv2 += tp * tp * vol;
    const vwap = pv / v;
    const sd = Math.sqrt(Math.max(0, pv2 / v - vwap * vwap));
    const x = c.x(i), y = c.y(vwap), yu = c.y(vwap + sd), yl = c.y(vwap - sd);
    if (x === null || y === null || yu === null || yl === null) continue;
    line.push(x, y); upper.push(x, yu); lower.push(x, yl);
  }
  const band: { x: number; y: number }[] = [];
  for (let k = 0; k < upper.length; k += 2) band.push({ x: upper[k], y: upper[k + 1] });
  for (let k = lower.length - 2; k >= 0; k -= 2) band.push({ x: lower[k], y: lower[k + 1] });
  return (
    <Group>
      <Shape fill="rgba(76, 175, 80, 0.05)" listening={false}
        sceneFunc={(ctx, s) => { ctx.beginPath(); band.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.fillShape(s); }} />
      <Line points={upper} stroke="#4caf50" strokeWidth={1} listening={false} />
      <Line points={lower} stroke="#4caf50" strokeWidth={1} listening={false} />
      <Line points={line} stroke={c.d.stroke || '#2962FF'} strokeWidth={2} hitStrokeWidth={10} />
    </Group>
  );
}
// Puts the anchor on the anchor bar's typical price, where the VWAP starts
export function anchorOnVWAP(points: Pt[]): Record<string, any> {
  const data: Bar[] = (window as any).__chartFullData || [];
  const i = Math.round(points[0]?.logical ?? -1);
  if (i < 0 || i >= data.length) return {};
  const b = data[i];
  return { points: [{ ...points[0], logical: i, price: (b.high + b.low + b.close) / 3, time: b.time }] };
}

function profile(c: RenderCtx, i0: number, i1: number, xLeft: number, xRight: number, fromRight: boolean, boxFill: string) {
  const data = visibleBars();
  const from = Math.max(0, Math.min(i0, i1)), to = Math.min(data.length - 1, Math.max(i0, i1));
  if (to < from) return null;
  const slice = data.slice(from, to + 1);
  const lo = Math.min(...slice.map(b => b.low)), hi = Math.max(...slice.map(b => b.high));
  if (!(hi > lo)) return null;
  const ROWS = 24, h = (hi - lo) / ROWS;
  const up = new Array(ROWS).fill(0), down = new Array(ROWS).fill(0);
  for (const b of slice) {
    const vol = b.volume || 0;
    const r0 = Math.max(0, Math.min(ROWS - 1, Math.floor((b.low - lo) / h)));
    const r1 = Math.max(0, Math.min(ROWS - 1, Math.floor((b.high - lo) / h)));
    const share = vol / (r1 - r0 + 1);
    for (let r = r0; r <= r1; r++) (b.close >= b.open ? up : down)[r] += share;
  }
  const tot = up.map((u, i) => u + down[i]);
  const max = Math.max(...tot) || 1;
  const poc = tot.indexOf(max);
  // value area: grow from the POC towards the heavier side until 70% of the volume is in
  const all = tot.reduce((s, x) => s + x, 0);
  let vaLo = poc, vaHi = poc, inVA = tot[poc];
  while (inVA < all * 0.7 && (vaLo > 0 || vaHi < ROWS - 1)) {
    const below = vaLo > 0 ? tot[vaLo - 1] : -1, above = vaHi < ROWS - 1 ? tot[vaHi + 1] : -1;
    if (above >= below) { vaHi++; inVA += tot[vaHi]; } else { vaLo--; inVA += tot[vaLo]; }
  }
  const boxW = Math.abs(xRight - xLeft);
  const maxW = boxW * 0.3;
  const yTop = c.y(hi), yBot = c.y(lo);
  if (yTop === null || yBot === null) return null;
  const pocLine = c.dark ? '#d1d4dc' : '#0F0F0F';
  return (
    <Group>
      <Rect x={Math.min(xLeft, xRight)} y={yTop} width={boxW} height={yBot - yTop} fill={boxFill} />
      {tot.map((t, r) => {
        const yA = c.y(lo + r * h), yB = c.y(lo + (r + 1) * h);
        if (yA === null || yB === null || !t) return null;
        const inside = r >= vaLo && r <= vaHi;
        const wu = (up[r] / max) * maxW, wd = (down[r] / max) * maxW;
        const top = Math.min(yA, yB) + 0.5, hh = Math.max(1, Math.abs(yB - yA) - 1);
        const x0 = fromRight ? xRight : xLeft, sgn = fromRight ? -1 : 1;
        return (
          <Group key={r} listening={false}>
            <Rect x={fromRight ? x0 - wu : x0} y={top} width={wu} height={hh} fill={inside ? 'rgba(38, 198, 218, 0.7)' : 'rgba(38, 198, 218, 0.25)'} />
            <Rect x={fromRight ? x0 - wu - wd : x0 + sgn * wu} y={top} width={wd} height={hh} fill={inside ? 'rgba(236, 64, 122, 0.7)' : 'rgba(236, 64, 122, 0.25)'} />
          </Group>
        );
      })}
      {(() => { const y = c.y(lo + (poc + 0.5) * h); return y === null ? null : <Line points={[Math.min(xLeft, xRight), y, Math.max(xLeft, xRight), y]} stroke={pocLine} strokeWidth={2} hitStrokeWidth={8} />; })()}
    </Group>
  );
}

export function renderFixedRangeVP(c: RenderCtx) {
  const [A, B] = c.p;
  const i0 = Math.round(c.pts[0].logical), i1 = Math.round(c.pts[1].logical);
  return (
    <Group>
      <Line points={[A.x, -FAR, A.x, FAR]} stroke="#9598a1" strokeWidth={1} hitStrokeWidth={8} />
      <Line points={[B.x, -FAR, B.x, FAR]} stroke="#9598a1" strokeWidth={1} hitStrokeWidth={8} />
      {profile(c, i0, i1, Math.min(A.x, B.x), Math.max(A.x, B.x), false, 'rgba(55, 166, 239, 0.06)')}
    </Group>
  );
}

export function renderAnchoredVP(c: RenderCtx) {
  const [A] = c.p;
  const data = visibleBars();
  const i0 = Math.round(c.pts[0].logical), i1 = data.length - 1;
  const xEnd = c.x(i1) ?? A.x;
  return (
    <Group>
      <Line points={[A.x, -FAR, A.x, FAR]} stroke="#9598a1" strokeWidth={1} hitStrokeWidth={8} />
      {profile(c, i0, i1, A.x, xEnd, true, 'rgba(38, 198, 218, 0.05)')}
    </Group>
  );
}
