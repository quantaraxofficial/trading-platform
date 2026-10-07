// Volume Profile Visible Range: a horizontal volume histogram of the bars on screen, recomputed as
// the chart scrolls or zooms. Each price row splits into up-bar and down-bar volume; the rows
// holding `valueArea`% of the volume around the point of control (POC, the busiest row) are drawn
// stronger, and the POC is marked with a line. Same binning as the fixed-range volume profile tool.

import type { IChartApi, ISeriesApi, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';

export interface VolumeProfileSettings {
  rows: number;            // number of price rows
  valueArea: number;       // percent of the volume in the value area
  placement: 'Right' | 'Left';
  widthPct: number;        // histogram width, percent of the pane
  upColor: string; downColor: string; upVaColor: string; downVaColor: string; pocColor: string;
}

export const DEFAULT_VP: VolumeProfileSettings = {
  rows: 24, valueArea: 70, placement: 'Right', widthPct: 30,
  upColor: 'rgba(38, 198, 218, 0.25)', downColor: 'rgba(236, 64, 122, 0.25)',
  upVaColor: 'rgba(38, 198, 218, 0.7)', downVaColor: 'rgba(236, 64, 122, 0.7)', pocColor: '#FF0000',
};

interface VPBar { time: number; open: number; high: number; low: number; close: number; volume?: number }

export class VolumeProfileVR {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _visible = true;

  constructor(private _bars: () => VPBar[], private _settings: () => VolumeProfileSettings) {}

  attached(p: SeriesAttachedParameter<Time>) { this._chart = p.chart as IChartApi; this._series = p.series as ISeriesApi<SeriesType>; }
  detached() { this._chart = null; this._series = null; }
  setVisible(v: boolean) { this._visible = v; }
  updateAllViews() {}
  paneViews() { return [{ zOrder: () => 'bottom' as const, renderer: () => ({ draw: (t: any) => this._draw(t) }) }]; }

  // The histogram of the visible bars (null when there's nothing to show)
  compute(): { lo: number; hi: number; up: number[]; down: number[]; poc: number; vaLo: number; vaHi: number } | null {
    const chart = this._chart;
    if (!chart) return null;
    const range = chart.timeScale().getVisibleLogicalRange();
    const data = this._bars();
    if (!range || !data.length) return null;
    const from = Math.max(0, Math.floor(range.from)), to = Math.min(data.length - 1, Math.ceil(range.to));
    if (to < from) return null;
    const s = this._settings();
    let lo = Infinity, hi = -Infinity;
    for (let i = from; i <= to; i++) { if (data[i].low < lo) lo = data[i].low; if (data[i].high > hi) hi = data[i].high; }
    if (!(hi > lo)) return null;
    const ROWS = Math.max(4, Math.min(500, Math.round(s.rows)));
    const h = (hi - lo) / ROWS;
    const up = new Array(ROWS).fill(0), down = new Array(ROWS).fill(0);
    for (let i = from; i <= to; i++) {
      const b = data[i];
      const vol = b.volume || 0;
      const r0 = Math.max(0, Math.min(ROWS - 1, Math.floor((b.low - lo) / h)));
      const r1 = Math.max(0, Math.min(ROWS - 1, Math.floor((b.high - lo) / h)));
      const share = vol / (r1 - r0 + 1);
      for (let r = r0; r <= r1; r++) (b.close >= b.open ? up : down)[r] += share;
    }
    const tot = up.map((u, i) => u + down[i]);
    const max = Math.max(...tot);
    if (!max) return null;
    const poc = tot.indexOf(max);
    // The value area grows from the POC towards the heavier side until it holds valueArea% of the volume
    const all = tot.reduce((a, x) => a + x, 0);
    let vaLo = poc, vaHi = poc, inVA = tot[poc];
    while (inVA < all * (s.valueArea / 100) && (vaLo > 0 || vaHi < ROWS - 1)) {
      const below = vaLo > 0 ? tot[vaLo - 1] : -1, above = vaHi < ROWS - 1 ? tot[vaHi + 1] : -1;
      if (above >= below) { vaHi++; inVA += tot[vaHi]; } else { vaLo--; inVA += tot[vaLo]; }
    }
    return { lo, hi, up, down, poc, vaLo, vaHi };
  }

  private _draw(target: any) {
    const series = this._series;
    if (!series || !this._visible) return;
    const p = this.compute();
    if (!p) return;
    const s = this._settings();
    const rows = p.up.length, h = (p.hi - p.lo) / rows;
    const max = Math.max(...p.up.map((u, i) => u + p.down[i]));
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }: any) => {
      const W = mediaSize.width;
      const maxW = W * Math.max(5, Math.min(100, s.widthPct)) / 100;
      const right = s.placement !== 'Left';
      for (let r = 0; r < rows; r++) {
        const yA = series.priceToCoordinate(p.lo + r * h), yB = series.priceToCoordinate(p.lo + (r + 1) * h);
        if (yA === null || yB === null) continue;
        const top = Math.min(yA, yB) + 0.5, hh = Math.max(1, Math.abs(yB - yA) - 1);
        const inside = r >= p.vaLo && r <= p.vaHi;
        const wu = (p.up[r] / max) * maxW, wd = (p.down[r] / max) * maxW;
        ctx.fillStyle = inside ? s.upVaColor : s.upColor;
        ctx.fillRect(right ? W - wu : 0, top, wu, hh);
        ctx.fillStyle = inside ? s.downVaColor : s.downColor;
        ctx.fillRect(right ? W - wu - wd : wu, top, wd, hh);
      }
      const y = series.priceToCoordinate(p.lo + (p.poc + 0.5) * h);
      if (y !== null) {
        ctx.strokeStyle = s.pocColor; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    });
  }
}
