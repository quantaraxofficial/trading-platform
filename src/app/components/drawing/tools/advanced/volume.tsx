import React from 'react';
import { Group, Line, Rect, Shape, Text } from 'react-konva';
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

// Fixed range / Anchored volume profile settings, as TradingView's (its defaults): kept on the
// drawing as `vp`, edited in VolumeProfileSettingsModal
export type VpLine = { show: boolean; color: string | null; width: number; style: 'solid' | 'dashed' | 'dotted' };
export type VpSettings = {
  rowsLayout: 'rows' | 'ticks'; rows: number; volume: 'updown' | 'total' | 'delta'; vaVolume: number; extendRight: boolean;
  showProfile: boolean; showValues: boolean; valuesColor: string | null; widthPct: number; placement: 'left' | 'right';
  upColor: string; downColor: string; vaUpColor: string; vaDownColor: string;
  vah: VpLine; val: VpLine; poc: VpLine; devPoc: VpLine; devVa: VpLine; boxColor: string;
};
// (a null colour follows the theme: black on light, light grey on dark)
export const VP_DEFAULTS: VpSettings = {
  rowsLayout: 'rows', rows: 24, volume: 'updown', vaVolume: 70, extendRight: false,
  showProfile: true, showValues: false, valuesColor: null, widthPct: 30, placement: 'left',
  upColor: 'rgba(38, 198, 218, 0.25)', downColor: 'rgba(236, 64, 122, 0.25)',
  vaUpColor: 'rgba(38, 198, 218, 0.7)', vaDownColor: 'rgba(236, 64, 122, 0.7)',
  vah: { show: false, color: null, width: 1, style: 'solid' }, val: { show: false, color: null, width: 1, style: 'solid' },
  poc: { show: true, color: null, width: 2, style: 'solid' },
  devPoc: { show: false, color: null, width: 1, style: 'solid' }, devVa: { show: false, color: '#00bcd4', width: 1, style: 'solid' },
  boxColor: 'rgba(55, 166, 239, 0.06)',
};
// The drawing's settings over the defaults (the anchored profile sits on the right by default)
export function vpOf(d: any, type?: string): VpSettings {
  const v = d?.vp || {};
  const base: VpSettings = { ...VP_DEFAULTS, ...((type ?? d?.type) === 'anchored_volume_profile' ? { placement: 'right' as const, boxColor: 'rgba(38, 198, 218, 0.05)' } : {}) };
  const line = (k: 'vah' | 'val' | 'poc' | 'devPoc' | 'devVa') => ({ ...base[k], ...(v[k] || {}) });
  return { ...base, ...v, vah: line('vah'), val: line('val'), poc: line('poc'), devPoc: line('devPoc'), devVa: line('devVa') };
}

const dashOf = (style: string, w: number) => (style === 'dashed' ? [4 * w + 2, 3 * w + 2] : style === 'dotted' ? [w, 2 * w + 1] : undefined);
const fmtVol = (n: number) => {
  const a = Math.abs(n), sgn = n < 0 ? '-' : '';
  return a >= 1e9 ? `${sgn}${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${sgn}${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${sgn}${(a / 1e3).toFixed(2)}K` : `${sgn}${Math.round(a)}`;
};

// The rows of a range of bars: each bar's volume spread evenly over the rows its high-low covers,
// as up (close >= open) or down volume
function rowsOf(lo: number, h: number, ROWS: number) {
  const up: number[] = new Array(ROWS).fill(0), down: number[] = new Array(ROWS).fill(0);
  const add = (b: Bar) => {
    const vol = b.volume || 0;
    const r0 = Math.max(0, Math.min(ROWS - 1, Math.floor((b.low - lo) / h)));
    const r1 = Math.max(0, Math.min(ROWS - 1, Math.floor((b.high - lo) / h)));
    const share = vol / (r1 - r0 + 1);
    for (let r = r0; r <= r1; r++) (b.close >= b.open ? up : down)[r] += share;
  };
  return { up, down, add };
}
// Point of control and value area (grown from the POC towards the heavier side until vaPct of
// the volume is in)
function pocVa(tot: number[], vaPct: number) {
  let poc = 0;
  for (let i = 1; i < tot.length; i++) if (tot[i] > tot[poc]) poc = i;
  const all = tot.reduce((s, x) => s + x, 0);
  let vaLo = poc, vaHi = poc, inVA = tot[poc];
  while (inVA < all * vaPct && (vaLo > 0 || vaHi < tot.length - 1)) {
    const below = vaLo > 0 ? tot[vaLo - 1] : -1, above = vaHi < tot.length - 1 ? tot[vaHi + 1] : -1;
    if (above >= below) { vaHi++; inVA += tot[vaHi]; } else { vaLo--; inVA += tot[vaLo]; }
  }
  return { poc, vaLo, vaHi };
}

function profile(c: RenderCtx, i0: number, i1: number, xLeft: number, xRight: number, s: VpSettings) {
  const data = visibleBars();
  const from = Math.max(0, Math.min(i0, i1)), to = Math.min(data.length - 1, Math.max(i0, i1));
  if (to < from) return null;
  const slice = data.slice(from, to + 1);
  let lo = Infinity, hi = -Infinity;
  for (const b of slice) { if (b.low < lo) lo = b.low; if (b.high > hi) hi = b.high; }
  if (!(hi > lo)) return null;
  // Rows: a number of them across the range, or a fixed size in ticks (the price's last digit)
  let ROWS: number, h: number;
  if (s.rowsLayout === 'ticks') {
    h = Math.max(1, s.rows) * Math.pow(10, -(c.prec ?? 2));
    ROWS = Math.min(1000, Math.max(1, Math.ceil((hi - lo) / h)));
    if (ROWS === 1000) h = (hi - lo) / ROWS;
  } else {
    ROWS = Math.min(1000, Math.max(1, Math.round(s.rows) || 24));
    h = (hi - lo) / ROWS;
  }
  const { up, down, add } = rowsOf(lo, h, ROWS);
  slice.forEach(add);
  const tot = up.map((u, i) => u + down[i]);
  const vaPct = Math.max(1, Math.min(100, s.vaVolume || 70)) / 100;
  const { poc, vaLo, vaHi } = pocVa(tot, vaPct);
  const delta = up.map((u, i) => u - down[i]);
  const max = (s.volume === 'delta' ? Math.max(...delta.map(Math.abs)) : Math.max(...tot)) || 1;

  const boxL = Math.min(xLeft, xRight);
  const boxR = s.extendRight ? Math.max(c.W, Math.max(xLeft, xRight)) : Math.max(xLeft, xRight);
  const maxW = Math.abs(xRight - xLeft) * Math.max(1, Math.min(100, s.widthPct)) / 100;
  const yTop = c.y(hi), yBot = c.y(lo);
  if (yTop === null || yBot === null) return null;
  const auto = c.dark ? '#d1d4dc' : '#0F0F0F';
  const fromRight = s.placement === 'right';
  const x0 = fromRight ? Math.max(xLeft, xRight) : boxL;
  const sgn = fromRight ? -1 : 1;
  const hline = (price: number, l: VpLine, key: string) => {
    const y = c.y(price);
    return y === null ? null : <Line key={key} points={[boxL, y, boxR, y]} stroke={l.color || auto} strokeWidth={l.width} dash={dashOf(l.style, l.width)} hitStrokeWidth={8} />;
  };

  // Developing POC / value area: where they stood after each bar of the range, as step lines
  const developing = () => {
    if (!s.devPoc.show && !s.devVa.show) return null;
    const run = rowsOf(lo, h, ROWS);
    const pocPts: number[] = [], vahPts: number[] = [], valPts: number[] = [];
    slice.forEach((b, k) => {
      run.add(b);
      const r = pocVa(run.up.map((u, i) => u + run.down[i]), vaPct);
      const xa = c.x(from + k), xb = c.x(from + k + 1);
      if (xa === null || xb === null) return;
      const push = (pts: number[], price: number) => { const y = c.y(price); if (y !== null) pts.push(xa, y, xb, y); };
      push(pocPts, lo + (r.poc + 0.5) * h);
      push(vahPts, lo + (r.vaHi + 1) * h);
      push(valPts, lo + r.vaLo * h);
    });
    const dl = (pts: number[], l: VpLine, key: string) => (pts.length >= 4 ? <Line key={key} points={pts} stroke={l.color || auto} strokeWidth={l.width} dash={dashOf(l.style, l.width)} listening={false} /> : null);
    return (
      <Group listening={false}>
        {s.devPoc.show && dl(pocPts, s.devPoc, 'dp')}
        {s.devVa.show && dl(vahPts, s.devVa, 'dvh')}
        {s.devVa.show && dl(valPts, s.devVa, 'dvl')}
      </Group>
    );
  };

  return (
    <Group>
      <Rect x={boxL} y={yTop} width={boxR - boxL} height={yBot - yTop} fill={s.boxColor} />
      {s.showProfile && tot.map((t, r) => {
        const yA = c.y(lo + r * h), yB = c.y(lo + (r + 1) * h);
        if (yA === null || yB === null || !t) return null;
        const inside = r >= vaLo && r <= vaHi;
        const top = Math.min(yA, yB) + 0.5, hh = Math.max(1, Math.abs(yB - yA) - 1);
        const bar = (start: number, w: number, fill: string, key: string) =>
          (w > 0 ? <Rect key={key} x={fromRight ? start - w : start} y={top} width={w} height={hh} fill={fill} /> : null);
        let parts: React.ReactNode[], end: number, value: number;
        if (s.volume === 'delta') {
          const dv = delta[r], w = (Math.abs(dv) / max) * maxW;
          const col = dv >= 0 ? (inside ? s.vaUpColor : s.upColor) : (inside ? s.vaDownColor : s.downColor);
          parts = [bar(x0, w, col, 'd')]; end = x0 + sgn * w; value = dv;
        } else if (s.volume === 'total') {
          const w = (t / max) * maxW;
          parts = [bar(x0, w, inside ? s.vaUpColor : s.upColor, 't')]; end = x0 + sgn * w; value = t;
        } else {
          const wu = (up[r] / max) * maxW, wd = (down[r] / max) * maxW;
          parts = [bar(x0, wu, inside ? s.vaUpColor : s.upColor, 'u'), bar(x0 + sgn * wu, wd, inside ? s.vaDownColor : s.downColor, 'w')];
          end = x0 + sgn * (wu + wd); value = t;
        }
        const fs = Math.max(7, Math.min(11, hh));
        return (
          <Group key={r} listening={false}>
            {parts}
            {s.showValues && <Text x={fromRight ? end - 64 : end + 3} y={top + hh / 2 - fs / 2} width={60} align={fromRight ? 'right' : 'left'} text={fmtVol(value)} fontSize={fs} fill={s.valuesColor || auto} />}
          </Group>
        );
      })}
      {s.vah.show && hline(lo + (vaHi + 1) * h, s.vah, 'vah')}
      {s.val.show && hline(lo + vaLo * h, s.val, 'val')}
      {s.poc.show && hline(lo + (poc + 0.5) * h, s.poc, 'poc')}
      {developing()}
    </Group>
  );
}

// (the range's edges show while it's selected or being placed, as TradingView's do)
export function renderFixedRangeVP(c: RenderCtx) {
  const [A, B] = c.p;
  const i0 = Math.round(c.pts[0].logical), i1 = Math.round(c.pts[1].logical);
  const edges = c.selected || !c.complete;
  return (
    <Group>
      {edges && <Line points={[A.x, -FAR, A.x, FAR]} stroke="#9598a1" strokeWidth={1} hitStrokeWidth={8} />}
      {edges && <Line points={[B.x, -FAR, B.x, FAR]} stroke="#9598a1" strokeWidth={1} hitStrokeWidth={8} />}
      {profile(c, i0, i1, Math.min(A.x, B.x), Math.max(A.x, B.x), vpOf(c.d, 'fixed_range_volume_profile'))}
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
      {profile(c, i0, i1, A.x, xEnd, vpOf(c.d, 'anchored_volume_profile'))}
    </Group>
  );
}
