// One Pine script's output on the chart: its plots as series (on the price chart for an overlay
// script, else in a pane of its own under it), hline levels, fills, label/line/box drawings and
// markers. The Pine editor's script and each built-in indicator get one each.

import { AreaSeries, HistogramSeries, LineSeries, LineStyle, LineType, createSeriesMarkers } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { PineRunResult } from '../../lib/pineScriptEngine';
import { CandleBodyAwareLine } from '../chartPrimitives/CandleBodyAwareLine';
import { PineFills } from '../chartPrimitives/PineFills';
import { PineDrawings } from '../chartPrimitives/PineDrawings';

export interface PineLegendPlot { title: string; color: string; lastValue: number | null }

export class PineChartView {
  overlay = true;
  private _series: Record<number, ISeriesApi<SeriesType>> = {};
  private _anchor: ISeriesApi<SeriesType> | null = null;   // invisible series carrying a pane's levels / fills
  private _fills: PineFills | null = null;
  private _drawings: PineDrawings | null = null;
  private _drawingsOn: ISeriesApi<SeriesType> | null = null;
  private _paneMarkers: any = null;
  private _paneMarkerList: any[] = [];
  private _markers: any[] = [];
  private _visible = true;

  constructor(private _chart: IChartApi, private _main: () => ISeriesApi<SeriesType> | null, private _times: () => number[]) {}

  // Draws a run's result, replacing what this view drew before. Returns the legend's plots.
  apply(result: PineRunResult | null, colorOverrides: Record<string, string> = {}): PineLegendPlot[] {
    this.clear();
    if (!result) return [];
    const chart = this._chart;
    const allPlots = result.plots || [];
    const plots = allPlots.filter(p => !p.hidden);
    const hlines = result.hlines || [];
    const fills = result.fills || [];
    const drawings = result.drawings || [];
    this.overlay = result.meta?.overlay !== false;
    // A script in a pane goes into a new pane at the bottom
    const pane = this.overlay ? 0 : chart.panes().length;
    const precision = result.meta?.precision;
    const priceFormat = typeof precision === 'number' ? { priceFormat: { type: 'price' as const, precision, minMove: Math.pow(10, -precision) } } : {};
    // The pane's scale also fits its hlines (RSI's 30 / 70), as TradingView's does
    const levels = hlines.map(h => h.price);
    const autoscaleInfoProvider = levels.length && !this.overlay ? (original: () => any) => {
      const r = original();
      const lo = Math.min(...levels), hi = Math.max(...levels);
      if (!r || !r.priceRange) return { priceRange: { minValue: lo, maxValue: hi } };
      return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, lo), maxValue: Math.max(r.priceRange.maxValue, hi) } };
    } : undefined;

    plots.forEach((p, idx) => {
      try {
        const color = colorOverrides[p.title] || p.color;
        const common: any = { title: p.title, priceLineVisible: false, lastValueVisible: true, ...priceFormat, ...(autoscaleInfoProvider ? { autoscaleInfoProvider } : {}) };
        let s: any;
        if (p.style === 'histogram' || p.style === 'columns') s = chart.addSeries(HistogramSeries, { color, ...common }, pane);
        else if (p.style === 'area') s = chart.addSeries(AreaSeries, { lineColor: color, topColor: color, bottomColor: 'rgba(0, 0, 0, 0)', lineWidth: p.lineWidth ?? 1, ...common }, pane);
        else {
          const dots = p.style === 'circles' || p.style === 'cross';
          s = chart.addSeries(LineSeries, {
            color, lineWidth: p.lineWidth ?? 1,
            lineType: p.style === 'stepline' ? LineType.WithSteps : LineType.Simple,
            crosshairMarkerVisible: true, pointMarkersVisible: dots,
            // On the price chart the line is painted by CandleBodyAwareLine (ducking under candle
            // bodies); the series drives the axis label, crosshair and legend values
            lineVisible: !this.overlay && !dots,
            ...common,
          }, pane);
          if (this.overlay) s.attachPrimitive(new CandleBodyAwareLine());
        }
        s.setData(p.values as any);
        this._series[idx] = s;
      } catch { /* a plot the chart can't take is skipped */ }
    });

    const markers = result.markers || [];
    // Levels, fills, drawings and markers of a pane hang off one of its series; with no visible
    // plot there, an invisible one spanning the bars
    let host: ISeriesApi<SeriesType> | null = this._series[0] || null;
    if (!this.overlay && !host && (hlines.length || fills.length || drawings.length || markers.length)) {
      const times = this._times();
      const v = levels.length ? levels[0] : (drawings.length ? (drawings[0] as any).y ?? (drawings[0] as any).y1 ?? (drawings[0] as any).top : 0);
      host = chart.addSeries(LineSeries, { lineVisible: false, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, ...(autoscaleInfoProvider ? { autoscaleInfoProvider } : {}) } as any, pane);
      host.setData(times.length ? [{ time: times[0], value: v }, { time: times[times.length - 1], value: v }] as any : []);
      this._anchor = host;
    }
    if (host) {
      const dash: Record<string, number> = { solid: LineStyle.Solid, dotted: LineStyle.Dotted, dashed: LineStyle.Dashed };
      if (!this.overlay) hlines.forEach(h => { try { host!.createPriceLine({ price: h.price, color: h.color, lineWidth: h.lineWidth as any, lineStyle: dash[h.lineStyle] ?? LineStyle.Dashed, axisLabelVisible: false, title: '' }); } catch { /* ignore */ } });
      if (fills.length) { this._fills = new PineFills(fills, allPlots, hlines); host.attachPrimitive(this._fills as any); }
    }
    // Drawings sit on the candles' scale for an overlay script, else in the script's pane
    const drawOn = this.overlay ? this._main() : host;
    if (drawings.length && drawOn) {
      this._drawings = new PineDrawings(drawings, this._times);
      drawOn.attachPrimitive(this._drawings as any);
      this._drawingsOn = drawOn;
    }
    if (!this.overlay && host && markers.length) { this._paneMarkerList = markers; try { this._paneMarkers = createSeriesMarkers(host, markers as any); } catch { /* ignore */ } }
    // An overlay script's markers join the trade markers on the candles (the host merges them)
    this._markers = this.overlay ? markers : [];

    // TradingView gives an indicator pane about a quarter of the chart
    if (!this.overlay) { try { chart.panes()[0]?.setStretchFactor(3); chart.panes()[pane]?.setStretchFactor(1); } catch { /* ignore */ } }
    this._visible = true;
    return plots.map(p => ({ title: p.title, color: colorOverrides[p.title] || p.color, lastValue: p.values.length ? p.values[p.values.length - 1].value : null }));
  }

  overlayMarkers(): any[] { return this._visible ? this._markers : []; }

  // Top of this script's pane in chart pixels (undefined for an overlay script)
  paneTop(): number | undefined {
    const s = this._series[0] || this._anchor;
    if (this.overlay || !s) return undefined;
    try {
      const idx = s.getPane().paneIndex();
      const panes = this._chart.panes();
      let top = 0;
      for (let i = 0; i < idx; i++) top += panes[i].getHeight() + 1;
      return top;
    } catch { return undefined; }
  }

  setVisible(v: boolean) {
    this._visible = v;
    Object.values(this._series).forEach(s => { try { s.applyOptions({ visible: v }); } catch { /* ignore */ } });
    try { this._anchor?.applyOptions({ visible: v }); } catch { /* ignore */ }
    this._fills?.setVisible(v);
    this._drawings?.setVisible(v);
    try { this._paneMarkers?.setMarkers(v ? this._paneMarkerList : []); } catch { /* ignore */ }
  }

  setPlotColor(idx: number, color: string) { try { this._series[idx]?.applyOptions({ color } as any); } catch { /* ignore */ } }

  // Removes everything this view drew. A pane left empty is removed by the chart itself.
  clear() {
    const chart = this._chart;
    Object.values(this._series).forEach(s => { try { chart.removeSeries(s); } catch { /* ignore */ } });
    this._series = {};
    if (this._drawings && this._drawingsOn) { try { this._drawingsOn.detachPrimitive(this._drawings as any); } catch { /* ignore */ } }
    this._drawings = null; this._drawingsOn = null;
    if (this._anchor) { try { chart.removeSeries(this._anchor); } catch { /* ignore */ } this._anchor = null; }
    this._fills = null;
    try { this._paneMarkers?.setMarkers([]); } catch { /* ignore */ }
    this._paneMarkers = null;
    this._markers = [];
  }
}
