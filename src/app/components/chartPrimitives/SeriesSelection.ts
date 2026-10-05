// TradingView's "series selected" look: clicking a candle selects the price series, and small
// blue-ringed dots appear in the middle of candle bodies, every few bars (about 90px apart, on
// fixed bars so they don't crawl while the chart scrolls). Clicking elsewhere / Esc clears it.
import type { IChartApi } from 'lightweight-charts';

type Bar = { open: number; close: number };

export class SeriesSelection {
  private _chart: IChartApi | null = null;
  private _series: any = null;
  private _requestUpdate: (() => void) | null = null;
  private _selected = false;

  attached(param: { chart: unknown; series: unknown; requestUpdate: () => void }) {
    this._chart = param.chart as IChartApi;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached() { this._chart = null; this._series = null; this._requestUpdate = null; }

  setSelected(on: boolean) {
    if (on === this._selected) return;
    this._selected = on;
    this._requestUpdate?.();
  }

  updateAllViews() {}

  paneViews() {
    return [{ zOrder: () => 'top' as const, renderer: () => ({ draw: (target: any) => this._draw(target) }) }];
  }

  private _draw(target: any) {
    if (!this._selected || !this._chart || !this._series) return;
    const ts = this._chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    const bars: Bar[] = (window as any).__chartFullData || [];
    const cut = (window as any).__replayVisibleCutoff;
    if (!range || !bars.length) return;
    const spacing = Math.abs((ts.logicalToCoordinate(1 as any) ?? 0) - (ts.logicalToCoordinate(0 as any) ?? 0)) || 6;
    const step = Math.max(1, Math.round(90 / spacing));
    const last = Math.min(bars.length - 1, typeof cut === 'number' ? cut : Infinity, Math.ceil(range.to));
    const first = Math.max(0, Math.floor(range.from));
    target.useMediaCoordinateSpace(({ context: ctx }: any) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#2962FF';
      ctx.fillStyle = '#ffffff';
      for (let i = Math.ceil(first / step) * step; i <= last; i += step) {
        const b = bars[i];
        const x = ts.logicalToCoordinate(i as any);
        const y = this._series.priceToCoordinate((b.open + b.close) / 2);
        if (x === null || y === null) continue;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    });
  }
}
