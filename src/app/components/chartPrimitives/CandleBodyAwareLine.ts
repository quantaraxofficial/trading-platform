// A lightweight-charts Series Primitive that draws an indicator line the same way
// the Fibonacci drawing tool already ducks its level lines under candle bodies:
// wherever the line's path would pass through a candle's open↔close body, that
// stretch is skipped so the body renders visually on top of it, while the thinner
// high↔low wick is left alone and the line can still cross over it freely.
//
// The line series this attaches to is itself rendered invisible (`lineVisible:
// false`, set where the series is created) — this primitive is what actually
// paints the visible line, reading color/lineWidth/visible straight off the
// series' own options so it stays in sync with any later applyOptions() call
// without needing separate wiring.
import type { IChartApi, ISeriesApi, SeriesAttachedParameter, Time } from 'lightweight-charts';

interface PixelPoint { x: number; y: number }

// Mirrors lightweight-charts' own internal `optimalCandlestickWidth` (see
// node_modules/lightweight-charts/dist/lightweight-charts.development.mjs) so the
// exclusion box matches the actual rendered body pixel-for-pixel instead of a flat
// fraction of bar spacing — the library's real ratio isn't a constant 0.8, it eases
// from ~1.0x bar spacing at low zoom down toward 0.8x as bars get wider, which is
// exactly the gap that let the line peek through at a body's edges before this.
// This version drops the library's pixelRatio scaling since we draw directly in
// CSS/media pixel space here, not device pixels.
export function candlestickBodyWidthCss(barSpacingPx: number): number {
  const specialCaseFrom = 2.5;
  const specialCaseTo = 4;
  const specialCaseWidth = 3;
  if (barSpacingPx >= specialCaseFrom && barSpacingPx <= specialCaseTo) {
    return specialCaseWidth;
  }
  const reducingCoeff = 0.2;
  const coeff = 1 - reducingCoeff * Math.atan(Math.max(specialCaseTo, barSpacingPx) - specialCaseTo) / (Math.PI * 0.5);
  const optimal = Math.min(barSpacingPx * coeff, barSpacingPx);
  return Math.max(1, optimal);
}

// Finds the sub-range of x within [xLo, xHi] (already clipped to both the segment
// and the candle's body x-span) where the segment's linearly-interpolated y falls
// inside [top, bottom] — i.e. where the line actually passes through the body,
// not merely near it.
function segmentBodyOverlap(
  x1: number, y1: number, x2: number, y2: number,
  xLo: number, xHi: number, top: number, bottom: number
): [number, number] | null {
  if (xHi <= xLo || x2 === x1) return null;
  const slope = (y2 - y1) / (x2 - x1);
  const yAt = (x: number) => y1 + slope * (x - x1);
  const yLo = Math.min(yAt(xLo), yAt(xHi));
  const yHi = Math.max(yAt(xLo), yAt(xHi));
  if (yHi < top || yLo > bottom) return null;
  if (slope === 0) return [xLo, xHi];
  const xAtTop = x1 + (top - y1) / slope;
  const xAtBottom = x1 + (bottom - y1) / slope;
  const from = Math.max(xLo, Math.min(xAtTop, xAtBottom));
  const to = Math.min(xHi, Math.max(xAtTop, xAtBottom));
  if (to <= from) return null;
  return [from, to];
}

// Removes exclusion ranges from [start, end], returning the remaining visible
// x-sub-ranges — the same interval-punching approach Fibonacci's level lines use,
// applied here along a slanted indicator segment instead of a flat one.
function subtractRanges(start: number, end: number, exclusions: [number, number][]): [number, number][] {
  const clipped = exclusions
    .map(([from, to]) => [Math.max(start, from), Math.min(end, to)] as [number, number])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of clipped) {
    if (merged.length > 0 && r[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    } else {
      merged.push([r[0], r[1]]);
    }
  }
  const segments: [number, number][] = [];
  let cursor = start;
  for (const [from, to] of merged) {
    if (from > cursor) segments.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (cursor < end) segments.push([cursor, end]);
  return segments;
}

export class CandleBodyAwareLine {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<'Line'> | null = null;

  attached(param: SeriesAttachedParameter<Time>) {
    this._chart = param.chart as IChartApi;
    this._series = param.series as ISeriesApi<'Line'>;
  }

  detached() {
    this._chart = null;
    this._series = null;
  }

  updateAllViews() {}

  paneViews() {
    return [
      {
        zOrder: () => 'top' as const,
        renderer: () => ({
          draw: (target: any) => this._draw(target),
        }),
      },
    ];
  }

  private _draw(target: any) {
    const chart = this._chart;
    const series = this._series;
    if (!chart || !series) return;

    const opts: any = series.options();
    if (opts.visible === false) return;
    const color = opts.color || '#2962ff';
    const lineWidth = opts.lineWidth || 2;

    const rawPoints = series.data() as unknown as { time: number; value: number }[];
    if (!rawPoints || rawPoints.length < 2) return;

    const ts = chart.timeScale();
    const fullData: any[] = (window as any).__chartFullData || [];
    const replayCutoff = (window as any).__replayVisibleCutoff;

    target.useMediaCoordinateSpace(({ context: ctx }: any) => {
      const pixelPoints: (PixelPoint | null)[] = rawPoints.map((p) => {
        const x = ts.timeToCoordinate(p.time as any);
        const y = series.priceToCoordinate((p as any).value);
        return x === null || y === null ? null : { x, y };
      });

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Bar spacing is uniform across the whole pane at any given zoom level, so
      // the body width only needs to be computed once per draw, not per candle.
      const barSpacingPx = Math.abs(
        (ts.logicalToCoordinate(1 as any) ?? 0) - (ts.logicalToCoordinate(0 as any) ?? 0)
      ) || 6;
      const bodyHalfWidthPx = candlestickBodyWidthCss(barSpacingPx) / 2;

      for (let i = 0; i < pixelPoints.length - 1; i++) {
        const a = pixelPoints[i];
        const b = pixelPoints[i + 1];
        if (!a || !b) continue;

        const exclusions: [number, number][] = [];
        if (fullData.length > 0) {
          const fromLogical = ts.coordinateToLogical(Math.min(a.x, b.x));
          const toLogical = ts.coordinateToLogical(Math.max(a.x, b.x));
          if (fromLogical !== null && toLogical !== null) {
            const startIdx = Math.max(0, Math.floor(fromLogical) - 1);
            let endIdx = Math.min(fullData.length - 1, Math.ceil(toLogical) + 1);
            if (replayCutoff !== null && replayCutoff !== undefined) {
              endIdx = Math.min(endIdx, replayCutoff);
            }
            for (let idx = startIdx; idx <= endIdx; idx++) {
              const bar = fullData[idx];
              if (!bar) continue;
              const cxCenter = ts.logicalToCoordinate(idx as any);
              if (cxCenter === null) continue;
              const yTop = series.priceToCoordinate(Math.max(bar.open, bar.close));
              const yBottom = series.priceToCoordinate(Math.min(bar.open, bar.close));
              if (yTop === null || yBottom === null) continue;

              const left = cxCenter - bodyHalfWidthPx;
              const right = cxCenter + bodyHalfWidthPx;
              const xLo = Math.max(Math.min(a.x, b.x), left);
              const xHi = Math.min(Math.max(a.x, b.x), right);
              const overlap = segmentBodyOverlap(a.x, a.y, b.x, b.y, xLo, xHi, yTop, yBottom);
              if (overlap) exclusions.push(overlap);
            }
          }
        }

        const segStart = Math.min(a.x, b.x);
        const segEnd = Math.max(a.x, b.x);
        const visibleRanges = subtractRanges(segStart, segEnd, exclusions);
        const yAt = (x: number) => (b.x === a.x ? a.y : a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x)));

        for (const [from, to] of visibleRanges) {
          ctx.beginPath();
          ctx.moveTo(from, yAt(from));
          ctx.lineTo(to, yAt(to));
          ctx.stroke();
        }
      }

      ctx.restore();
    });
  }
}
