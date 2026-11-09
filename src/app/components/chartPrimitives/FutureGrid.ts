// The chart library draws vertical grid lines only at tick marks of real bars, so the space to
// the right of the latest candle had none. TradingView's grid carries on there; this pane
// primitive draws those lines, at the times future bars will have, picking the step the
// library itself would (its labels are kept at least (fontSize + 4) * 5 px apart, on minute /
// 5-minute / 30-minute / hour / 3h / 6h / 12h / day / month / year boundaries).
import type { IChartApi } from 'lightweight-charts';

type Bar = { time: number };

const STEPS = [1, 5, 15, 30, 60, 300, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400];

export class FutureGrid {
  private _chart: IChartApi | null = null;

  constructor(private _bars: () => Bar[]) {}

  attached(param: { chart: unknown }) { this._chart = param.chart as IChartApi; }
  detached() { this._chart = null; }
  updateAllViews() {}

  paneViews() {
    return [{
      zOrder: () => 'bottom' as const,
      renderer: () => ({ draw: (target: any) => this._draw(target) }),
    }];
  }

  private _draw(target: any) {
    const chart = this._chart;
    if (!chart) return;
    const opts: any = chart.options();
    const vert = opts.grid?.vertLines;
    if (!vert || vert.visible === false) return;
    const bars = this._bars();
    const n = bars.length;
    if (n < 3) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range || range.to <= n - 1) return;

    // One bar's duration: the smallest recent gap (weekend / overnight gaps are longer)
    let dt = Infinity;
    for (let i = Math.max(1, n - 6); i < n; i++) {
      const d = bars[i].time - bars[i - 1].time;
      if (d > 0 && d < dt) dt = d;
    }
    if (!isFinite(dt)) return;
    const last = bars[n - 1].time;
    const barSpacing: number = (ts.options() as any).barSpacing ?? 6;
    const fontSize: number = opts.layout?.fontSize ?? 12;
    const minBars = Math.max(1, Math.round(((fontSize + 4) * 5) / barSpacing));

    // A future slot is a grid line when it starts a new step (or month / year)
    const minSec = minBars * dt;
    const step = STEPS.find(s => s >= dt && s % dt === 0 && s >= minSec);
    const monthKey = (t: number) => { const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
    let isLine: (t: number) => boolean;
    if (step) {
      isLine = t => t % step === 0;
    } else {
      // Daily bars and wider: months, or years once months are too close
      const monthsApart = Math.ceil(minSec / (30 * 86400));
      const every = monthsApart <= 1 ? 1 : monthsApart <= 3 ? 3 : monthsApart <= 6 ? 6 : 12;
      isLine = t => { const m = monthKey(t); return m !== monthKey(t - dt) && m % every === 0; };
    }

    const from = Math.max(n, Math.floor(range.from));
    const to = Math.ceil(range.to) + 1;
    const xs: number[] = [];
    for (let i = from; i <= to && xs.length < 500; i++) {
      const t = last + (i - (n - 1)) * dt;
      if (!isLine(t)) continue;
      const x = ts.logicalToCoordinate(i as any);
      if (x !== null) xs.push(x);
    }
    if (!xs.length) return;

    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio: hpr }: any) => {
      ctx.save();
      ctx.fillStyle = vert.color || 'rgba(42, 46, 57, 0.06)';
      const w = Math.max(1, Math.floor(hpr));
      const style = vert.style ?? 0;
      // Solid lines as filled columns; dotted / dashed ones in short segments, like the library
      const dash = style === 1 ? [1, 1] : style === 2 ? [2, 2] : style === 3 ? [6, 6] : style === 4 ? [1, 4] : null;
      for (const x of xs) {
        const bx = Math.round(x * hpr) - Math.floor(w / 2);
        if (!dash) { ctx.fillRect(bx, 0, w, bitmapSize.height); continue; }
        const [on, off] = dash.map(v => v * w);
        for (let y = 0; y < bitmapSize.height; y += on + off) ctx.fillRect(bx, y, w, on);
      }
      ctx.restore();
    });
  }
}
