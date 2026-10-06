// The chart type's look (lib/chartType), per its style (lib/seriesStyles: Settings → Symbol). The
// symbol's candlestick series stays the chart's main series — drawings, trading lines and the
// other primitives work off it — and its bars are reshaped per type here: Heikin Ashi's averaged
// candles, hollow candles, high-low bars, bricks. For the types drawn by an extra line / area /
// bar series, or by StyleLayer below, it carries only what the price scale should fit and is
// drawn transparent; the extra series then also carries the price label.
import type { IChartApi } from 'lightweight-charts';
import type { ChartType } from '../../lib/chartType';
import { DEFAULT_SERIES_STYLES, sourcePrice, type SeriesStyles } from '../../lib/seriesStyles';

export type RawBar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
export type Styles = Partial<SeriesStyles>;
type AnyStyle = any;

// Kept for the label colours of overlay series
export const TV_STYLE = { up: '#089981', down: '#F23645', blue: '#2962FF' };

const CLOSE_ONLY = new Set<ChartType>(['line', 'lineWithMarkers', 'stepline', 'area', 'baseline', 'column']);
const lineDash = (style: string, w: number) => (style === 'Dashed' ? [4 * w, 3 * w] : style === 'Dotted' ? [w, 2 * w] : []);
export const lwcLineStyle = (style: string) => (style === 'Dashed' ? 2 : style === 'Dotted' ? 1 : 0);
const T = 'transparent';

// Which extra series a type needs: a real one that draws, or an invisible one for the price label
export function overlayKind(type: ChartType, st: AnyStyle): null | 'bar' | 'line' | 'area' | 'baseline' | 'label' {
  switch (type) {
    case 'bar': return 'bar';
    case 'line': case 'lineWithMarkers': case 'stepline': return st.colorType === 'Gradient' ? 'label' : 'line';
    case 'area': return 'area';
    case 'baseline': return 'baseline';
    case 'hlcArea': return 'line';
    case 'range': return st.style === 'Bars' ? 'bar' : null;
    case 'column': case 'volCandles': case 'kagi': case 'pnf': return 'label';
    case 'ha': return st.realPrices ? 'label' : null;
    default: return null;
  }
}

// The extra series' options for a type
export function overlayOptions(type: ChartType, st: AnyStyle): any {
  switch (type) {
    case 'bar': return { upColor: st.up, downColor: st.down, thinBars: st.thin, openVisible: !st.hlc };
    case 'range': return { upColor: st.up, downColor: st.down, thinBars: st.thin, openVisible: true };
    case 'line': case 'lineWithMarkers': case 'stepline':
      return st.colorType === 'Gradient'
        ? { lineVisible: false, color: st.gradEnd, crosshairMarkerVisible: true }
        : { lineVisible: true, color: st.color, lineWidth: st.width, lineStyle: lwcLineStyle(st.style), lineType: type === 'stepline' ? 1 : 0, pointMarkersVisible: type === 'lineWithMarkers', pointMarkersRadius: 3 };
    case 'area': return { lineColor: st.line.color, lineWidth: st.line.width, lineStyle: lwcLineStyle(st.line.style), topColor: st.fillTop, bottomColor: st.fillBottom };
    case 'baseline': return { lineWidth: st.top.width, topLineColor: st.top.color, bottomLineColor: st.bottom.color, topFillColor1: st.fillTop1, topFillColor2: st.fillTop2, bottomFillColor1: st.fillBottom1, bottomFillColor2: st.fillBottom2 };
    case 'hlcArea': return { color: st.close.color, lineWidth: st.close.width, lineStyle: lwcLineStyle(st.close.style) };
    default: return { lineVisible: false, crosshairMarkerVisible: false };
  }
}

export function styleOf(styles: Styles | undefined, type: ChartType): AnyStyle {
  const d = (DEFAULT_SERIES_STYLES as any)[type];
  if (!d) return {};
  const v = (styles as any)?.[type] || {};
  const out: any = { ...d };
  for (const k of Object.keys(v)) out[k] = d[k] && typeof d[k] === 'object' ? { ...d[k], ...v[k] } : v[k];
  return out;
}

// One bar of the main series for a type, given the previous raw bar and the previous styled bar
// (Heikin Ashi builds on its own previous candle). `candle` handles colour-by-previous-close.
export function styleBar(type: ChartType, st: AnyStyle, b: RawBar, prevRaw: RawBar | null, prevStyled: any, candleColor?: (b: RawBar, prevClose: number | null) => any): any {
  if (typeof b.close !== 'number') return b;
  const { time } = b;
  const parts = (up: boolean, s: AnyStyle, hollow = false) => ({
    color: s.body.on && !hollow ? (up ? s.body.up : s.body.down) : T,
    borderColor: s.border.on ? (up ? s.border.up : s.border.down) : T,
    wickColor: s.wick.on ? (up ? s.wick.up : s.wick.down) : T,
  });
  switch (type) {
    case 'candle':
      return candleColor ? candleColor(b, prevRaw ? prevRaw.close : null) : b;
    case 'hollowCandle': {
      const up = b.close >= (prevRaw ? prevRaw.close : b.open);
      return { ...b, ...parts(up, st, b.close > b.open) };
    }
    case 'ha': {
      const close = (b.open + b.high + b.low + b.close) / 4;
      const open = prevStyled && typeof prevStyled.open === 'number' ? (prevStyled.open + prevStyled.close) / 2 : (b.open + b.close) / 2;
      const up = st.prevClose && prevStyled ? close >= prevStyled.close : close >= open;
      return { time, open, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), close, ...parts(up, st) };
    }
    case 'hilo':
      return { time, open: b.high, high: b.high, low: b.low, close: b.low, color: st.body.on ? st.body.color : T, borderColor: st.border.on ? st.border.color : T, wickColor: T };
    case 'hlcArea':
      return { time, open: b.close, high: b.high, low: b.low, close: b.close };
    case 'renko': case 'pb': {
      const k: any = b, proj = !!k.projection;
      const c = k.up ? (proj ? st.projUp : st.up) : (proj ? st.projDown : st.down);
      const wick = type === 'renko' && st.wick.on ? (k.up ? st.wick.up : st.wick.down) : T;
      return { time, open: b.open, high: type === 'renko' && st.wick.on ? b.high : Math.max(b.open, b.close), low: type === 'renko' && st.wick.on ? b.low : Math.min(b.open, b.close), close: b.close, color: c.body, borderColor: c.border, wickColor: wick };
    }
    case 'range': {
      if (st.style === 'Bars') return { time, open: b.open, high: b.high, low: b.low, close: b.close };
      const k: any = b, c = k.up ? (k.projection ? st.projUp : st.up) : (k.projection ? st.projDown : st.down);
      return { time, open: b.open, high: b.high, low: b.low, close: b.close, color: c, borderColor: c, wickColor: c };
    }
    case 'kagi': case 'pnf': case 'volCandles': case 'bar':
      return { time, open: b.open, high: b.high, low: b.low, close: b.close };
    default:
      if (CLOSE_ONLY.has(type)) { const p = sourcePrice(b, st.source || 'Close'); return { time, open: p, high: p, low: p, close: p }; }
      return { time, open: b.open, high: b.high, low: b.low, close: b.close };
  }
}

export function styleBars(type: ChartType, st: AnyStyle, data: RawBar[], candleColor?: (b: RawBar, prevClose: number | null) => any): any[] {
  const out: any[] = [];
  for (let i = 0; i < data.length; i++) out.push(styleBar(type, st, data[i], i > 0 ? data[i - 1] : null, i > 0 ? out[i - 1] : null, candleColor));
  return out;
}

// The extra series' point for a bar
export function overlayPoint(type: ChartType, st: AnyStyle, b: RawBar, prevRaw: RawBar | null): any {
  if (typeof b.close !== 'number') return { time: b.time };
  if (type === 'bar') {
    const p = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close } as any;
    if (st.prevClose && prevRaw) p.color = b.close >= prevRaw.close ? st.up : st.down;
    return p;
  }
  if (type === 'range') {
    const k: any = b;
    return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: k.up ? (k.projection ? st.projUp : st.up) : (k.projection ? st.projDown : st.down) };
  }
  if (type === 'line' || type === 'lineWithMarkers' || type === 'stepline' || type === 'area' || type === 'baseline' || type === 'column') return { time: b.time, value: sourcePrice(b, st.source || 'Close') };
  return { time: b.time, value: b.close };
}

// The label colour of an invisible label series: the last bar's up / down colour
export function labelColor(type: ChartType, st: AnyStyle, last: any, prev: any): string {
  switch (type) {
    case 'column': { const up = st.prevClose && prev ? sourcePrice(last, st.source) >= sourcePrice(prev, st.source) : last.close >= last.open; return up ? st.up : st.down; }
    case 'volCandles': { const up = st.prevClose && prev ? last.close >= prev.close : last.close >= last.open; return up ? st.body.up : st.body.down; }
    case 'kagi': return last.thick ? (last.projection ? st.projUp : st.up) : (last.projection ? st.projDown : st.down);
    case 'pnf': return last.up ? (last.projection ? st.projUp : st.up) : (last.projection ? st.projDown : st.down);
    case 'line': case 'lineWithMarkers': case 'stepline': return st.gradEnd;
    case 'ha': { const up = last.close >= last.open; return up ? st.body.up : st.body.down; }
    default: return TV_STYLE.blue;
  }
}

// Columns, the HLC area's high / low lines and fills, volume candles, gradient lines, Kagi lines,
// Point & figure boxes and High-low labels, drawn on the main series' pane from the chart's bars
export class StyleLayer {
  private _chart: IChartApi | null = null;
  private _series: any = null;
  private _requestUpdate: (() => void) | null = null;
  private _type: ChartType = 'candle';
  private _st: AnyStyle = {};
  constructor(private _bars: () => RawBar[] = () => (window as any).__chartFullData || [], private _cutoff: () => number | undefined = () => (window as any).__replayVisibleCutoff) {}
  attached(p: { chart: unknown; series: unknown; requestUpdate: () => void }) { this._chart = p.chart as IChartApi; this._series = p.series; this._requestUpdate = p.requestUpdate; }
  detached() { this._chart = null; this._series = null; this._requestUpdate = null; }
  updateAllViews() {}
  setType(t: ChartType, st: AnyStyle) { this._type = t; this._st = st; this._requestUpdate?.(); }
  paneViews() {
    return [{ zOrder: () => 'normal' as const, renderer: () => ({ draw: (target: any) => this._draw(target) }) }];
  }
  private _draw(target: any) {
    const type = this._type, st = this._st;
    const gradientLine = (type === 'line' || type === 'lineWithMarkers' || type === 'stepline') && st.colorType === 'Gradient';
    const hiloLabels = type === 'hilo' && st.labels?.on;
    if (!['column', 'hlcArea', 'volCandles', 'kagi', 'pnf'].includes(type) && !gradientLine && !hiloLabels) return;
    if (!this._chart || !this._series) return;
    const bars: any[] = this._bars();
    const ts = this._chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range || !bars.length) return;
    const cut = this._cutoff();
    const first = Math.max(0, Math.floor(range.from) - 1);
    const last = Math.min(bars.length - 1, Math.ceil(range.to) + 1, typeof cut === 'number' ? cut : Infinity);
    const spacing = Math.abs((ts.logicalToCoordinate(1 as any) ?? 0) - (ts.logicalToCoordinate(0 as any) ?? 0)) || 6;
    const y = (p: number) => this._series.priceToCoordinate(p) as number | null;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }: any) => {
      ctx.save();
      if (gradientLine) {
        const pts: { x: number; y: number }[] = [];
        for (let i = first; i <= last; i++) {
          const x = ts.logicalToCoordinate(i as any), yy = y(sourcePrice(bars[i], st.source));
          if (x !== null && yy !== null) pts.push({ x, y: yy });
        }
        if (pts.length > 1) {
          const g = ctx.createLinearGradient(pts[0].x, 0, pts[pts.length - 1].x, 0);
          g.addColorStop(0, st.gradStart); g.addColorStop(1, st.gradEnd);
          ctx.strokeStyle = g; ctx.fillStyle = g; ctx.lineWidth = st.width; ctx.lineJoin = 'round'; ctx.setLineDash(lineDash(st.style, st.width));
          ctx.beginPath();
          pts.forEach((p, i) => {
            if (!i) { ctx.moveTo(p.x, p.y); return; }
            if (type === 'stepline') ctx.lineTo(p.x, pts[i - 1].y);
            ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
          if (type === 'lineWithMarkers') { ctx.setLineDash([]); pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }); }
        }
      } else if (type === 'column') {
        const w = Math.max(1, Math.floor(spacing * 0.8));
        for (let i = first; i <= last; i++) {
          const b = bars[i], x = ts.logicalToCoordinate(i as any), v = sourcePrice(b, st.source), yc = y(v);
          if (x === null || yc === null) continue;
          const up = st.prevClose ? v >= (i > 0 ? sourcePrice(bars[i - 1], st.source) : b.open) : b.close >= b.open;
          ctx.fillStyle = up ? st.up : st.down;
          ctx.fillRect(Math.round(x - w / 2), yc, w, mediaSize.height - yc);
        }
      } else if (type === 'hlcArea') {
        const pts: { x: number; h: number; l: number; c: number }[] = [];
        for (let i = first; i <= last; i++) {
          const b = bars[i], x = ts.logicalToCoordinate(i as any), h = y(b.high), l = y(b.low), c = y(b.close);
          if (x === null || h === null || l === null || c === null) continue;
          pts.push({ x, h, l, c });
        }
        if (pts.length > 1) {
          const band = (a: 'h' | 'l', color: string) => {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p[a]) : ctx.moveTo(p.x, p[a])));
            for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].c);
            ctx.closePath(); ctx.fillStyle = color; ctx.fill();
          };
          band('h', st.fillHigh);
          band('l', st.fillLow);
          const line = (a: 'h' | 'l', s: AnyStyle) => {
            if (!s.on) return;
            ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p[a]) : ctx.moveTo(p.x, p[a])));
            ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineJoin = 'round'; ctx.setLineDash(lineDash(s.style, s.width)); ctx.stroke();
          };
          line('h', st.high);
          line('l', st.low);
        }
      } else if (type === 'kagi') {
        // each segment: a horizontal shoulder / waist from the previous one, then the vertical line;
        // thick in the up colour while yang (above the last shoulder), thin in the down colour while yin
        let px: number | null = null;
        for (let i = Math.max(0, first - 1); i <= last; i++) {
          const b = bars[i], x = ts.logicalToCoordinate(i as any), yo = y(b.open), yc = y(b.close);
          if (x === null || yo === null || yc === null) continue;
          ctx.strokeStyle = b.thick ? (b.projection ? st.projUp : st.up) : (b.projection ? st.projDown : st.down);
          ctx.lineWidth = b.thick ? 3 : 1.5;
          ctx.lineCap = 'square';
          ctx.beginPath();
          if (px !== null) { ctx.moveTo(px, yo); ctx.lineTo(x, yo); } else ctx.moveTo(x, yo);
          ctx.lineTo(x, yc);
          ctx.stroke();
          px = x;
        }
      } else if (type === 'pnf') {
        for (let i = first; i <= last; i++) {
          const b = bars[i], x = ts.logicalToCoordinate(i as any);
          if (x === null || !b.box) continue;
          const n = Math.max(1, b.boxes || 1);
          const y0 = y(b.low), y1 = y(b.low + b.box);
          if (y0 === null || y1 === null) continue;
          const half = Math.max(1.5, Math.min(spacing * 0.4, Math.abs(y0 - y1) * 0.45));
          ctx.strokeStyle = b.kind === 'x' ? (b.projection ? st.projUp : st.up) : (b.projection ? st.projDown : st.down);
          ctx.lineWidth = 1.2;
          for (let k = 0; k < n; k++) {
            const cy = y(b.low + (k + 0.5) * b.box);
            if (cy === null) continue;
            ctx.beginPath();
            if (b.kind === 'x') { ctx.moveTo(x - half, cy - half); ctx.lineTo(x + half, cy + half); ctx.moveTo(x + half, cy - half); ctx.lineTo(x - half, cy + half); }
            else ctx.arc(x, cy, half, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      } else if (type === 'volCandles') {
        // the width follows the bar's volume against the busiest visible bar
        let maxVol = 0;
        for (let i = first; i <= last; i++) maxVol = Math.max(maxVol, bars[i].volume || 0);
        for (let i = first; i <= last; i++) {
          const b = bars[i], x = ts.logicalToCoordinate(i as any);
          const yo = y(b.open), yc = y(b.close), yh = y(b.high), yl = y(b.low);
          if (x === null || yo === null || yc === null || yh === null || yl === null) continue;
          const share = maxVol > 0 ? (b.volume || 0) / maxVol : 1;
          const w = Math.max(1, Math.round(spacing * (0.15 + 0.85 * share) * 0.9));
          const up = st.prevClose && i > 0 ? b.close >= bars[i - 1].close : b.close >= b.open;
          const left = Math.round(x - w / 2 + 0.5), top = Math.min(yo, yc), h = Math.max(1, Math.abs(yc - yo));
          if (st.wick.on) { ctx.fillStyle = up ? st.wick.up : st.wick.down; ctx.fillRect(Math.round(x), Math.min(yh, yl), 1, Math.abs(yl - yh)); }
          if (st.body.on) { ctx.fillStyle = up ? st.body.up : st.body.down; ctx.fillRect(left, top, w, h); }
          if (st.border.on && w > 2) { ctx.strokeStyle = up ? st.border.up : st.border.down; ctx.lineWidth = 1; ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1); }
        }
      }
      if (hiloLabels) {
        // each bar's high above it and its low below it, where they fit between the bars
        const prec: number = (window as any).__pricePrecision ?? 2;
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
        ctx.fillStyle = st.labels.color; ctx.textAlign = 'center';
        const sample = ctx.measureText(bars[last] ? bars[last].high.toFixed(prec) : '0').width;
        if (sample + 6 <= spacing) {
          for (let i = first; i <= last; i++) {
            const b = bars[i], x = ts.logicalToCoordinate(i as any), yh = y(b.high), yl = y(b.low);
            if (x === null || yh === null || yl === null) continue;
            ctx.textBaseline = 'bottom'; ctx.fillText(b.high.toFixed(prec), x, yh - 3);
            ctx.textBaseline = 'top'; ctx.fillText(b.low.toFixed(prec), x, yl + 3);
          }
        }
      }
      ctx.restore();
    });
  }
}
