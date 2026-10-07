// Paints a Pine script's label.new / line.new / box.new objects, as they stand after the last bar.
// Attached to a series in the script's pane (the candles for an overlay script), whose price scale
// places y; x is a bar time, mapped through the chart's bars and extrapolated past the last one.

import type { IChartApi, ISeriesApi, Logical, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';
import type { PineDrawing, PineLabel, PineLine, PineBox } from '../../lib/pineScriptEngine';

const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
const SIZE: Record<string, number> = { tiny: 9, small: 11, normal: 13, large: 18, huge: 24, auto: 12 };

export class PineDrawings {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _visible = true;

  // `times`: the chart's bar times (seconds), oldest first
  constructor(private _items: PineDrawing[], private _times: () => number[]) {}

  attached(p: SeriesAttachedParameter<Time>) { this._chart = p.chart as IChartApi; this._series = p.series as ISeriesApi<SeriesType>; }
  detached() { this._chart = null; this._series = null; }
  setVisible(v: boolean) { this._visible = v; }
  setItems(items: PineDrawing[]) { this._items = items; }
  updateAllViews() {}
  paneViews() { return [{ zOrder: () => 'top' as const, renderer: () => ({ draw: (t: any) => this._draw(t) }) }]; }

  // A bar time as a (fractional) logical index of the chart's bars
  private _logical(t: number, times: number[]): number {
    const n = times.length;
    if (!n || isNaN(t)) return NaN;
    const step = n > 1 ? (times[n - 1] - times[Math.max(0, n - 21)]) / Math.min(20, n - 1) : 60;
    if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / step;
    if (t <= times[0]) return (t - times[0]) / step;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
    return lo + (t - times[lo]) / (times[hi] - times[lo] || 1);
  }

  private _draw(target: any) {
    const chart = this._chart, series = this._series;
    if (!chart || !series || !this._visible || !this._items.length) return;
    const ts = chart.timeScale();
    const times = this._times();
    const X = (t: number) => { const l = this._logical(t, times); return isNaN(l) ? null : ts.logicalToCoordinate(l as Logical); };
    const Y = (p: number) => (typeof p === 'number' && !isNaN(p) ? series.priceToCoordinate(p) : null);

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }: any) => {
      const W = mediaSize.width, H = mediaSize.height;
      for (const d of this._items) {
        ctx.save();
        if (d.kind === 'box') this._box(ctx, d, X, Y, W);
        else if (d.kind === 'line') this._line(ctx, d, X, Y, W, H);
        ctx.restore();
      }
      // Labels last, above lines and boxes
      for (const d of this._items) if (d.kind === 'label') { ctx.save(); this._label(ctx, d, X, Y); ctx.restore(); }
    });
  }

  private _dash(ctx: CanvasRenderingContext2D, style: string, w: number) {
    if (/dashed/.test(style)) ctx.setLineDash([w * 4 + 2, w * 3]);
    else if (/dotted/.test(style)) ctx.setLineDash([w, w * 2]);
    else ctx.setLineDash([]);
  }

  private _line(ctx: CanvasRenderingContext2D, d: PineLine, X: any, Y: any, W: number, H: number) {
    let x1 = X(d.x1), y1 = Y(d.y1), x2 = X(d.x2), y2 = Y(d.y2);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    // extend.left / right / both: carried along the line's slope to the pane's edge
    const slope = x2 !== x1 ? (y2 - y1) / (x2 - x1) : 0;
    const far = Math.max(W, H) * 4;
    const right = d.extend === 'right' || d.extend === 'both', left = d.extend === 'left' || d.extend === 'both';
    if (x1 === x2) { if (right || left) { y1 = left ? -far : y1; y2 = right ? far : y2; } }
    else {
      const dir = x2 >= x1 ? 1 : -1;
      if (right) { const nx = dir > 0 ? W + 10 : -10; y2 = y2 + slope * (nx - x2); x2 = nx; }
      if (left) { const nx = dir > 0 ? -10 : W + 10; y1 = y1 + slope * (nx - x1); x1 = nx; }
    }
    ctx.strokeStyle = d.color;
    ctx.lineWidth = d.width;
    this._dash(ctx, d.style, d.width);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // style_arrow_left / right / both
    const arrow = (fx: number, fy: number, tx: number, ty: number) => {
      const a = Math.atan2(ty - fy, tx - fx), s = 6 + d.width * 2;
      ctx.setLineDash([]); ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.lineTo(tx - s * Math.cos(a - 0.45), ty - s * Math.sin(a - 0.45));
      ctx.lineTo(tx - s * Math.cos(a + 0.45), ty - s * Math.sin(a + 0.45));
      ctx.closePath(); ctx.fill();
    };
    if (/arrow_right|arrow_both/.test(d.style)) arrow(x1, y1, x2, y2);
    if (/arrow_left|arrow_both/.test(d.style)) arrow(x2, y2, x1, y1);
  }

  private _box(ctx: CanvasRenderingContext2D, d: PineBox, X: any, Y: any, W: number) {
    let l = X(d.left), r = X(d.right);
    const t = Y(d.top), b = Y(d.bottom);
    if (l === null || r === null || t === null || b === null) return;
    if (d.extend === 'right' || d.extend === 'both') r = W + 10;
    if (d.extend === 'left' || d.extend === 'both') l = -10;
    const x = Math.min(l, r), y = Math.min(t, b), w = Math.abs(r - l), h = Math.abs(b - t);
    ctx.fillStyle = d.bgColor;
    ctx.fillRect(x, y, w, h);
    if (d.borderWidth > 0) {
      ctx.strokeStyle = d.borderColor; ctx.lineWidth = d.borderWidth;
      this._dash(ctx, d.borderStyle, d.borderWidth);
      ctx.strokeRect(x, y, w, h);
    }
    if (d.text) {
      const size = d.textSize === 'auto' ? Math.max(8, Math.min(24, h * 0.5, w / Math.max(1, d.text.length) * 1.6)) : SIZE[d.textSize] ?? 12;
      ctx.font = `${size}px ${FONT}`;
      ctx.fillStyle = d.textColor;
      ctx.textAlign = /left/.test(d.textHalign) ? 'left' : /right/.test(d.textHalign) ? 'right' : 'center';
      ctx.textBaseline = /top/.test(d.textValign) ? 'top' : /bottom/.test(d.textValign) ? 'bottom' : 'middle';
      const tx = ctx.textAlign === 'left' ? x + 4 : ctx.textAlign === 'right' ? x + w - 4 : x + w / 2;
      const ty = ctx.textBaseline === 'top' ? y + 3 : ctx.textBaseline === 'bottom' ? y + h - 3 : y + h / 2;
      ctx.fillText(d.text, tx, ty);
    }
  }

  private _label(ctx: CanvasRenderingContext2D, d: PineLabel, X: any, Y: any) {
    const x = X(d.x), y = Y(d.y);
    if (x === null || y === null) return;
    const size = SIZE[d.size] ?? 13;
    ctx.font = `${size}px ${FONT}`;
    const lines = d.text ? d.text.split('\n') : [];
    const tw = lines.length ? Math.max(...lines.map(l => ctx.measureText(l).width)) : 0;
    const lh = size + 3;
    const th = lines.length * lh;
    const style = d.style.replace(/^style_/, '');
    const textAt = (cx: number, cy: number) => {
      ctx.fillStyle = d.textColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = /left/.test(d.textAlign) ? 'left' : /right/.test(d.textAlign) ? 'right' : 'center';
      const ox = ctx.textAlign === 'left' ? -tw / 2 : ctx.textAlign === 'right' ? tw / 2 : 0;
      lines.forEach((l, i) => ctx.fillText(l, cx + ox, cy - th / 2 + lh * (i + 0.5)));
    };

    if (style === 'none') { textAt(x, y); return; }

    // Bubble styles: a rounded box with a pointer at the anchor point
    const bubble = /^label_(down|up|left|right|center|lower_left|lower_right|upper_left|upper_right)$/.exec(style);
    if (bubble || !lines.length && /^label/.test(style)) {
      const dir = bubble ? bubble[1] : 'down';
      const padX = 6, padY = 4, ptr = 6;
      const bw = Math.max(tw + padX * 2, 12), bh = Math.max(th + padY * 2, 12);
      let bx = x - bw / 2, by = y - bh / 2;
      if (dir === 'down') by = y - ptr - bh;
      else if (dir === 'up') by = y + ptr;
      else if (dir === 'left') bx = x + ptr;
      else if (dir === 'right') bx = x - ptr - bw;
      else if (dir === 'lower_left') { bx = x; by = y - bh; }
      else if (dir === 'lower_right') { bx = x - bw; by = y - bh; }
      else if (dir === 'upper_left') { bx = x; by = y; }
      else if (dir === 'upper_right') { bx = x - bw; by = y; }
      ctx.fillStyle = d.color;
      ctx.beginPath();
      (ctx as any).roundRect ? (ctx as any).roundRect(bx, by, bw, bh, 3) : ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.beginPath();
      if (dir === 'down') { ctx.moveTo(x - ptr, by + bh); ctx.lineTo(x, y); ctx.lineTo(x + ptr, by + bh); }
      else if (dir === 'up') { ctx.moveTo(x - ptr, by); ctx.lineTo(x, y); ctx.lineTo(x + ptr, by); }
      else if (dir === 'left') { ctx.moveTo(bx, y - ptr); ctx.lineTo(x, y); ctx.lineTo(bx, y + ptr); }
      else if (dir === 'right') { ctx.moveTo(bx + bw, y - ptr); ctx.lineTo(x, y); ctx.lineTo(bx + bw, y + ptr); }
      ctx.fill();
      if (lines.length) textAt(bx + bw / 2, by + bh / 2);
      return;
    }

    // Shape styles: the shape at the point, the text beside it
    const r = Math.max(4, size * 0.45);
    ctx.fillStyle = d.color; ctx.strokeStyle = d.color; ctx.lineWidth = 2;
    ctx.beginPath();
    if (style === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
    else if (style === 'square') ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (style === 'diamond') { ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r, y); }
    else if (style === 'triangleup' || style === 'arrowup') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); }
    else if (style === 'triangledown' || style === 'arrowdown') { ctx.moveTo(x, y + r); ctx.lineTo(x + r, y - r); ctx.lineTo(x - r, y - r); }
    else if (style === 'flag') { ctx.moveTo(x, y + r); ctx.lineTo(x, y - r); ctx.lineTo(x + r * 1.5, y - r / 2); ctx.lineTo(x, y); }
    if (style === 'xcross' || style === 'cross') {
      if (style === 'xcross') { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); }
      else { ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); }
      ctx.stroke();
    } else { ctx.closePath(); ctx.fill(); }
    if (lines.length) {
      const below = /down/.test(style);
      textAt(x, below ? y - r - 4 - th / 2 : y + r + 4 + th / 2);
    }
  }
}
