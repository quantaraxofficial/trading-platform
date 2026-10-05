import React from 'react';
import { Group, Line, Shape, Text, Rect, Arrow } from 'react-konva';
import { RenderCtx, XY, Pt } from './MultiPointTool';
import { SHAPE_FONT, textWidth, formatDuration } from '../../core/lineStats';

// TradingView's forecasting and measuring tools: Position forecast, Bars pattern, Ghost feed,
// Sector, Price range, Date range, Date and price range.

const bars = (): { time: number; open: number; high: number; low: number; close: number; volume?: number }[] => {
  const all = (window as any).__chartFullData || [];
  const cut = (window as any).__replayVisibleCutoff;
  return typeof cut === 'number' ? all.slice(0, cut + 1) : all;
};
const timeAt = (logical: number): number | null => {
  const b = (window as any).__chartFullData || [];
  if (!b.length) return null;
  const i = Math.round(logical);
  if (i >= 0 && i < b.length) return b[i].time;
  const step = b.length > 1 ? (b[b.length - 1].time - b[0].time) / (b.length - 1) : 60;
  return i < 0 ? b[0].time + i * step : b[b.length - 1].time + (i - b.length + 1) * step;
};
const fmtNum = (n: number, d: number) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pipsText = (diff: number, prec: number) => {
  const ticks = diff * Math.pow(10, prec);
  return prec === 3 || prec === 5 ? fmtNum(ticks / 10, 1) : fmtNum(Math.round(ticks), 0);
};
const dateText = (t: number | null) => {
  if (t === null) return '';
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// A white label box with a soft shadow, its rows centred, placed with its centre-top at (cx, top)
function labelBox(cx: number, top: number, rows: string[], key = 'lbl', dark = false) {
  const w = Math.max(...rows.map(r => textWidth(r, 12))) + 20;
  const h = rows.length * 20 + 8;
  return (
    <Group key={key} x={cx - w / 2} y={top} listening={false}>
      <Rect width={w} height={h} cornerRadius={4} fill={dark ? '#1e222d' : '#ffffff'} shadowColor="rgba(0,0,0,0.2)" shadowBlur={6} shadowOffsetY={2} />
      {rows.map((r, i) => <Text key={i} x={0} y={7 + i * 20} width={w} align="center" text={r} fontSize={12} fontFamily={SHAPE_FONT} fill={dark ? '#d1d4dc' : '#000000'} />)}
    </Group>
  );
}

function rangeTool(c: RenderCtx, showPrice: boolean, showDate: boolean) {
  const [A, B] = c.p; const [a, b] = c.pts;
  const color = c.d.stroke || '#2962FF';
  const L = Math.min(A.x, B.x), R = Math.max(A.x, B.x), T = Math.min(A.y, B.y), Bo = Math.max(A.y, B.y);
  const diff = b.price - a.price;
  const rows: string[] = [];
  if (showPrice) rows.push(`${fmtNum(diff, c.prec)} (${fmtNum(a.price ? (diff / a.price) * 100 : 0, 2)}%) ${pipsText(diff, c.prec)}`);
  if (showDate) {
    const n = Math.round(b.logical - a.logical);
    const t1 = timeAt(a.logical), t2 = timeAt(b.logical);
    rows.push(`${n} bars${t1 !== null && t2 !== null ? `, ${t2 >= t1 ? '' : '-'}${formatDuration(t2 - t1)}` : ''}`);
  }
  const midX = (L + R) / 2, midY = (T + Bo) / 2;
  const up = B.y <= A.y;
  const labelTop = showPrice ? (up ? T - 8 - (rows.length * 20 + 8) : Bo + 8) : T - 8 - (rows.length * 20 + 8);
  return (
    <Group>
      <Rect x={L} y={T} width={R - L} height={Bo - T} fill={c.d.fill || 'rgba(41, 98, 255, 0.15)'} />
      {showPrice && !showDate && <Line points={[L, A.y, R, A.y]} stroke={color} strokeWidth={2} hitStrokeWidth={8} />}
      {showPrice && !showDate && <Line points={[L, B.y, R, B.y]} stroke={color} strokeWidth={2} hitStrokeWidth={8} />}
      {showDate && !showPrice && <Line points={[A.x, T, A.x, Bo]} stroke={color} strokeWidth={2} hitStrokeWidth={8} />}
      {showDate && !showPrice && <Line points={[B.x, T, B.x, Bo]} stroke={color} strokeWidth={2} hitStrokeWidth={8} />}
      {showPrice && <Arrow points={[midX, A.y, midX, B.y]} stroke={color} fill={color} strokeWidth={2} pointerLength={7} pointerWidth={10} hitStrokeWidth={8} />}
      {showDate && <Arrow points={[A.x, midY, B.x, midY]} stroke={color} fill={color} strokeWidth={2} pointerLength={7} pointerWidth={10} hitStrokeWidth={8} />}
      {labelBox(midX, labelTop, rows, 'lbl', c.dark)}
    </Group>
  );
}
export const renderPriceRange = (c: RenderCtx) => rangeTool(c, true, false);
export const renderDateRange = (c: RenderCtx) => rangeTool(c, false, true);
export const renderDateAndPriceRange = (c: RenderCtx) => rangeTool(c, true, true);

// Position forecast: a curve from the source to the target, labelled with both, and whether price
// got to the target in time (Success) or the time ran out first (Failure)
export function renderForecast(c: RenderCtx) {
  const [A, B] = c.p; const [a, b] = c.pts;
  const color = c.d.stroke || '#2962FF';
  const diff = b.price - a.price;
  const tA = timeAt(a.logical), tB = timeAt(b.logical);
  // status from the bars between the source and target times
  let status: 'success' | 'failure' | null = null;
  const data = bars();
  if (tA !== null && tB !== null && data.length) {
    const upTarget = diff >= 0;
    for (const bar of data) {
      if (bar.time <= tA) continue;
      if (bar.time > tB) break;
      if (upTarget ? bar.high >= b.price : bar.low <= b.price) { status = 'success'; break; }
    }
    if (!status && data[data.length - 1].time >= tB) status = 'failure';
  }
  const curve = (
    <Shape stroke={color} strokeWidth={2} hitStrokeWidth={10}
      sceneFunc={(ctx, s) => { ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(B.x, A.y, B.x, B.y); ctx.strokeShape(s); }} />
  );
  const box = (x: number, y: number, lines: [string, number][], bg: string, key: string) => {
    // the first row is bold, which runs wider than the regular-weight measurement
    const w = Math.max(...lines.map(([t, f], i) => textWidth(t, f) * (i === 0 ? 1.1 : 1))) + 12;
    const h = lines.reduce((s, [, f]) => s + f + 5, 0) + 4;
    return (
      <Group key={key} x={x} y={y} listening={false}>
        <Rect width={w} height={h} fill={bg} cornerRadius={2} />
        {lines.map(([t, f], i) => <Text key={i} x={6} y={4 + lines.slice(0, i).reduce((s, [, ff]) => s + ff + 5, 0)} text={t} fontSize={f} fontFamily={SHAPE_FONT} fill="#ffffff" fontStyle={i === 0 ? 'bold' : 'normal'} />)}
      </Group>
    );
  };
  const n = Math.round(b.logical - a.logical);
  const targetLines: [string, number][] = [[`${fmtNum(diff, c.prec)} (${fmtNum(a.price ? (diff / a.price) * 100 : 0, 2)}%) in ${n} bars`, 12], [`${c.fmtPrice(b.price)}  ${dateText(tB)}`, 10]];
  const tw = Math.max(...targetLines.map(([t, f], i) => textWidth(t, f) * (i === 0 ? 1.1 : 1))) + 12;
  const targetTop = B.y - 52;
  return (
    <Group>
      {curve}
      {box(A.x - 18, A.y + 10, [[c.fmtPrice(a.price), 12], [dateText(tA), 10]], color, 'src')}
      {box(B.x - 18, targetTop + 8, targetLines, color, 'tgt')}
      {status && (() => {
        const t = status === 'success' ? 'SUCCESS' : 'FAILURE';
        const w = textWidth(t, 11) + 22;
        return (
          <Group x={B.x - 18} y={targetTop - 12} listening={false}>
            <Rect width={Math.max(w, tw)} height={16} fill={status === 'success' ? '#4caf50' : '#F23645'} cornerRadius={[2, 2, 0, 0]} />
            <Text x={0} y={2} width={Math.max(w, tw)} align="center" text={t} fontSize={11} fontStyle="bold" fontFamily={SHAPE_FONT} fill="#ffffff" />
          </Group>
        );
      })()}
    </Group>
  );
}

// Bars pattern: a copy of the bars between the two clicks (taken when it was drawn), shown as
// high–low bars starting at the first point, moved along with the drawing
export function captureBarsPattern(points: Pt[]): Record<string, any> {
  const data = (window as any).__chartFullData || [];
  if (points.length < 2 || !data.length) return {};
  const i0 = Math.max(0, Math.round(Math.min(points[0].logical, points[1].logical)));
  const i1 = Math.min(data.length - 1, Math.round(Math.max(points[0].logical, points[1].logical)));
  const src = data.slice(i0, i1 + 1);
  if (!src.length) return {};
  const base = src[0].close;
  return { barsData: src.map((b: any) => [b.open - base, b.high - base, b.low - base, b.close - base]) };
}
export function renderBarsPattern(c: RenderCtx) {
  const [A] = c.p; const [a] = c.pts;
  const color = c.d.stroke || '#2962FF';
  const rows: number[][] = c.d.barsData || [];
  const step = Math.abs((c.x(a.logical + 1) ?? A.x + 6) - A.x) || 6;
  return (
    <Group>
      {rows.map((r, i) => {
        const x = A.x + i * step;
        const yh = c.y(a.price + r[1]), yl = c.y(a.price + r[2]);
        if (yh === null || yl === null) return null;
        return <Line key={i} points={[x, yh, x, yl]} stroke={color} strokeWidth={Math.max(1, Math.min(3, step * 0.3))} hitStrokeWidth={8} />;
      })}
    </Group>
  );
}

// Ghost feed: made-up candles following the clicked path, a little noisy (always the same for a
// given drawing), in TradingView's pale candle colours
function seeded(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; }; }
export function renderGhostFeed(c: RenderCtx) {
  const pts = c.pts;
  const data = (window as any).__chartFullData || [];
  const recent = data.slice(-100);
  const avgHL = recent.length ? recent.reduce((s: number, b: any) => s + (b.high - b.low), 0) / recent.length : Math.abs(pts[0].price) * 0.002;
  const rnd = seeded(String(c.d.id).split('').reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7));
  const candles: { l: number; o: number; h: number; lo: number; cl: number }[] = [];
  let prevClose = pts[0].price;
  for (let s = 0; s + 1 < pts.length; s++) {
    const l0 = Math.round(pts[s].logical), l1 = Math.round(pts[s + 1].logical);
    for (let l = l0 + (s ? 1 : 0); l <= l1; l++) {
      const t = l1 === l0 ? 1 : (l - l0) / (l1 - l0);
      const target = pts[s].price + t * (pts[s + 1].price - pts[s].price);
      const cl = target + (rnd() - 0.5) * avgHL * 0.5;
      const o = prevClose;
      candles.push({ l, o, cl, h: Math.max(o, cl) + rnd() * avgHL * 0.4, lo: Math.min(o, cl) - rnd() * avgHL * 0.4 });
      prevClose = cl;
    }
  }
  const step = Math.abs((c.x(1) ?? 6) - (c.x(0) ?? 0)) || 6;
  const bw = Math.max(1, step * 0.7);
  return (
    <Group>
      <Line points={c.p.flatMap(q => [q.x, q.y])} stroke="#808080" strokeWidth={1} hitStrokeWidth={10} />
      <Group opacity={0.5} listening={false}>
        {candles.map((k, i) => {
          const x = c.x(k.l), yo = c.y(k.o), yc = c.y(k.cl), yh = c.y(k.h), yl = c.y(k.lo);
          if (x === null || yo === null || yc === null || yh === null || yl === null) return null;
          const up = k.cl >= k.o;
          return (
            <Group key={i}>
              <Line points={[x, yh, x, yl]} stroke="#808080" strokeWidth={1} />
              <Rect x={x - bw / 2} y={Math.min(yo, yc)} width={bw} height={Math.max(1, Math.abs(yc - yo))} fill={up ? '#ACE5DC' : '#FAA1A4'} stroke={up ? '#089981' : '#F23645'} strokeWidth={1} />
            </Group>
          );
        })}
      </Group>
    </Group>
  );
}

// Sector: a slice of the circle around A through B, between the rays to B and C, shaded from blue to purple
export function renderSector(c: RenderCtx) {
  const [A, B, C] = c.p;
  const R = Math.hypot(B.x - A.x, B.y - A.y);
  const t1 = Math.atan2(B.y - A.y, B.x - A.x);
  let t2 = Math.atan2(C.y - A.y, C.x - A.x);
  let d = t2 - t1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; t2 = t1 + d;
  const border = '#9C9C9C';
  const E = (t: number): XY => ({ x: A.x + R * Math.cos(t), y: A.y + R * Math.sin(t) });
  return (
    <Group>
      <Shape
        fillLinearGradientStartPoint={E(t1)} fillLinearGradientEndPoint={E(t2)}
        fillLinearGradientColorStops={[0, c.d.color1 || 'rgba(41, 98, 255, 0.2)', 1, c.d.color2 || 'rgba(156, 39, 176, 0.2)']}
        stroke={border} strokeWidth={2} hitStrokeWidth={8}
        sceneFunc={(ctx, s) => { ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.arc(A.x, A.y, R, Math.min(t1, t2), Math.max(t1, t2)); ctx.closePath(); ctx.fillStrokeShape(s); }}
      />
    </Group>
  );
}
// Keeps C on the circle through B (and B's radius moving C along with it)
export function constrainSector(points: Pt[], moved: number, ctx: RenderCtx): Pt[] {
  if (points.length < 3) return points;
  const A = { x: ctx.x(points[0].logical), y: ctx.y(points[0].price) };
  const B = { x: ctx.x(points[1].logical), y: ctx.y(points[1].price) };
  const C = { x: ctx.x(points[2].logical), y: ctx.y(points[2].price) };
  if ([A.x, A.y, B.x, B.y, C.x, C.y].some(v => v === null)) return points;
  const R = Math.hypot(B.x! - A.x!, B.y! - A.y!);
  const t = Math.atan2(C.y! - A.y!, C.x! - A.x!);
  const x = A.x! + R * Math.cos(t), y = A.y! + R * Math.sin(t);
  const l = ctx.logicalAt(x), p = ctx.priceAt(y);
  if (moved === 0 || l === null || p === null) return points;
  return [points[0], points[1], { ...points[2], logical: l, price: p, time: timeAt(l) ?? points[2].time }];
}
