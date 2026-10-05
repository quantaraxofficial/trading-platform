// Fills the area between two line series (an indicator's upper and lower band), drawn behind
// the series it's attached to — TradingView's "Bollinger Bands Background Fill".
import type { ISeriesApi } from 'lightweight-charts';

export class BandFill {
  private chart: any = null;
  private series: any = null;
  private requestUpdate: (() => void) | null = null;
  constructor(private upper: ISeriesApi<'Line'>, private lower: ISeriesApi<'Line'>, private style: () => { visible: boolean; color: string }) {}

  attached(p: any) { this.chart = p.chart; this.series = p.series; this.requestUpdate = p.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.requestUpdate = null; }
  updateAllViews() { /* drawn from the series' current data in the renderer */ }
  update() { this.requestUpdate?.(); }

  paneViews() {
    const self = this;
    return [{
      zOrder: () => 'bottom' as const,
      renderer: () => ({
        draw: (target: any) => {
          const st = self.style();
          if (!st.visible || !self.chart || !self.upper.options().visible) return;
          const ts = self.chart.timeScale();
          const range = ts.getVisibleLogicalRange();
          if (!range) return;
          const up = self.upper.data() as any[], lo = self.lower.data() as any[];
          if (!up.length || !lo.length) return;
          const lowByTime = new Map<number, number>(lo.map(p => [p.time as number, p.value]));
          target.useMediaCoordinateSpace(({ context: ctx }: any) => {
            const top: [number, number][] = [], bottom: [number, number][] = [];
            for (const p of up) {
              const l = lowByTime.get(p.time as number);
              if (l === undefined) continue;
              const x = ts.timeToCoordinate(p.time);
              if (x === null) continue;
              const y1 = self.upper.priceToCoordinate(p.value), y2 = self.lower.priceToCoordinate(l);
              if (y1 === null || y2 === null) continue;
              top.push([x, y1]); bottom.push([x, y2]);
            }
            if (top.length < 2) return;
            ctx.beginPath();
            top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
            ctx.closePath();
            ctx.fillStyle = st.color;
            ctx.fill();
          });
        },
      }),
    }];
  }
}
