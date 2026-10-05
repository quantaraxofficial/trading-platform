// Settings → Events → Session breaks: a vertical line where each trading day starts (intraday
// charts only), in the chart's timezone — drawn behind the candles, like TradingView's.

type Style = { visible: boolean; color: string; width: number; style: string };

export class SessionBreaks {
  private chart: any = null;
  private series: any = null;
  private requestUpdate: (() => void) | null = null;
  constructor(private style: () => Style, private dayKey: (t: number) => string, private intraday: () => boolean) {}
  attached(p: any) { this.chart = p.chart; this.series = p.series; this.requestUpdate = p.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.requestUpdate = null; }
  updateAllViews() {}
  update() { this.requestUpdate?.(); }
  paneViews() {
    const self = this;
    return [{
      zOrder: () => 'bottom' as const,
      renderer: () => ({
        draw: (target: any) => {
          const st = self.style();
          if (!st.visible || !self.chart || !self.series || !self.intraday()) return;
          const ts = self.chart.timeScale();
          const r = ts.getVisibleLogicalRange();
          const data = self.series.data() as any[];
          if (!r || data.length < 2) return;
          const from = Math.max(1, Math.floor(r.from)), to = Math.min(data.length - 1, Math.ceil(r.to));
          target.useMediaCoordinateSpace(({ context: ctx, mediaSize }: any) => {
            ctx.save();
            ctx.strokeStyle = st.color;
            ctx.lineWidth = st.width;
            ctx.setLineDash(st.style === 'Dashed' ? [4, 3] : st.style === 'Dotted' ? [st.width, st.width * 2] : []);
            let prev = self.dayKey(data[from - 1].time as number);
            for (let i = from; i <= to; i++) {
              const k = self.dayKey(data[i].time as number);
              if (k === prev) continue;
              prev = k;
              // halfway between the last bar of one day and the first of the next
              const x = (ts.logicalToCoordinate(i) + ts.logicalToCoordinate(i - 1)) / 2;
              if (!isFinite(x)) continue;
              const px = Math.round(x) + (st.width % 2 ? 0.5 : 0);
              ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, mediaSize.height); ctx.stroke();
            }
            ctx.restore();
          });
        },
      }),
    }];
  }
}
