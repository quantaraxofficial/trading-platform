// Paints a Pine script's fill() areas in its pane: between two hlines (a band across the pane),
// between two plots, or TradingView's gradient form, where the area between the plots is clipped to
// [bottomValue, topValue] and shaded from topColor down to bottomColor (RSI's overbought / oversold
// fills). Attached to one series of the pane, whose price scale converts values to pixels.

import type { IChartApi, ISeriesApi, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';
import type { PineFill, PineHline, PinePlotResult } from '../../lib/pineScriptEngine';

export class PineFills {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _visible = true;

  constructor(private _fills: PineFill[], private _plots: PinePlotResult[], private _hlines: PineHline[]) {}

  attached(param: SeriesAttachedParameter<Time>) {
    this._chart = param.chart as IChartApi;
    this._series = param.series as ISeriesApi<SeriesType>;
  }
  detached() { this._chart = null; this._series = null; }
  setVisible(v: boolean) { this._visible = v; this._chart?.timeScale().applyOptions({}); }
  updateAllViews() {}

  paneViews() {
    return [{ zOrder: () => 'bottom' as const, renderer: () => ({ draw: (target: any) => this._draw(target) }) }];
  }

  // A side of a fill as value-by-time (plot) or a constant (hline)
  private _side(ref: PineFill['a']): { at: (t: number) => number | undefined; times: number[] | null } {
    if (ref.kind === 'hline') { const p = this._hlines[ref.index]?.price; return { at: () => p, times: null }; }
    const values = this._plots[ref.index]?.values || [];
    const m = new Map<number, number>(values.map(v => [v.time, v.value]));
    return { at: (t) => m.get(t), times: values.map(v => v.time) };
  }

  private _draw(target: any) {
    const chart = this._chart, series = this._series;
    if (!chart || !series || !this._visible) return;
    const ts = chart.timeScale();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }: any) => {
      for (const f of this._fills) {
        if (f.hidden) continue;
        const a = this._side(f.a), b = this._side(f.b);
        const y = (v: number) => series.priceToCoordinate(v);

        // Two hlines: a band across the whole pane
        if (!a.times && !b.times) {
          const ya = y(a.at(0)!), yb = y(b.at(0)!);
          if (ya === null || yb === null || !f.color) continue;
          ctx.fillStyle = f.color;
          ctx.fillRect(0, Math.min(ya, yb), mediaSize.width, Math.abs(yb - ya));
          continue;
        }

        const times = (a.times || b.times)!;
        const gradient = f.topValue !== undefined && f.bottomValue !== undefined && !isNaN(f.topValue) && !isNaN(f.bottomValue);
        const hi = gradient ? Math.max(f.topValue!, f.bottomValue!) : Infinity;
        const lo = gradient ? Math.min(f.topValue!, f.bottomValue!) : -Infinity;
        const clamp = (v: number) => Math.max(lo, Math.min(hi, v));
        if (gradient) {
          const yt = y(f.topValue!), yb2 = y(f.bottomValue!);
          if (yt === null || yb2 === null) continue;
          const g = ctx.createLinearGradient(0, yt, 0, yb2);
          g.addColorStop(0, f.topColor || 'rgba(0,0,0,0)');
          g.addColorStop(1, f.bottomColor || 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
        } else {
          if (!f.color) continue;
          ctx.fillStyle = f.color;
        }

        // One quad per pair of neighbouring bars where both sides have values
        ctx.beginPath();
        let prev: { x: number; ya: number; yb: number } | null = null;
        for (const t of times) {
          const va = a.at(t), vb = b.at(t);
          const x = ts.timeToCoordinate(t as Time);
          if (va === undefined || vb === undefined || x === null) { prev = null; continue; }
          const ya = y(clamp(va)), yb = y(clamp(vb));
          if (ya === null || yb === null) { prev = null; continue; }
          if (prev && (ya !== yb || prev.ya !== prev.yb)) {
            ctx.moveTo(prev.x, prev.ya);
            ctx.lineTo(x, ya);
            ctx.lineTo(x, yb);
            ctx.lineTo(prev.x, prev.yb);
            ctx.closePath();
          }
          prev = { x, ya, yb };
        }
        ctx.fill();
      }
    });
  }
}
