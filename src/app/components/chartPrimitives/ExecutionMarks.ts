// TradingView's execution marks: a thin arrow on the bar each fill happened in — blue, pointing
// up, under the bar's low for buys; red, pointing down, over its high for sells. Hovering one
// puts a soft pill behind it and a chevron at each fill's exact price on the candle; clicking
// opens the fills card (drawn by the chart as HTML). Several fills of one side in one bar share
// one arrow.
import type { IChartApi } from 'lightweight-charts';

export interface ExecFill { qty: number; price: number; time: number }
export interface ExecMark { key: string; time: number; side: 'buy' | 'sell'; fills: ExecFill[]; label?: string }

const BLUE = '#2962ff', RED = '#f23645';
const GAP = 4, LEN = 15, HEAD = 5, PILL_W = 18, PILL_PAD = 7;

type Bar = { time: number; high: number; low: number };

export class ExecutionMarks {
  private _chart: IChartApi | null = null;
  private _series: any = null;
  private _requestUpdate: (() => void) | null = null;
  private _marks: ExecMark[] = [];
  private _hover: string | null = null;
  private _active: string | null = null;
  constructor(private _hidden: () => boolean = () => false) {}

  attached(param: { chart: unknown; series: unknown; requestUpdate: () => void }) {
    this._chart = param.chart as IChartApi;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }
  detached() { this._chart = null; this._series = null; this._requestUpdate = null; }
  updateAllViews() {}

  setMarks(marks: ExecMark[]) { this._marks = marks; this._requestUpdate?.(); }
  setHover(key: string | null) { if (key !== this._hover) { this._hover = key; this._requestUpdate?.(); } }
  setActive(key: string | null) { if (key !== this._active) { this._active = key; this._requestUpdate?.(); } }
  mark(key: string) { return this._marks.find(m => m.key === key) || null; }

  private _bar(time: number): Bar | null {
    const bars: Bar[] = (window as any).__chartFullData || [];
    let lo = 0, hi = bars.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; const t = bars[mid].time; if (t === time) return bars[mid]; if (t < time) lo = mid + 1; else hi = mid - 1; }
    return null;
  }

  // The arrow's place in pane pixels: x, the tip (at the bar) and the tail
  geometry(m: ExecMark): { x: number; tip: number; tail: number } | null {
    if (!this._chart || !this._series) return null;
    const bar = this._bar(m.time);
    if (!bar) return null;
    const cut = (window as any).__replayVisibleCutoff;
    const bars: Bar[] = (window as any).__chartFullData || [];
    if (typeof cut === 'number' && bars[cut] && m.time > bars[cut].time) return null;
    const x = this._chart.timeScale().timeToCoordinate(m.time as any);
    if (x === null) return null;
    if (m.side === 'sell') {
      const y = this._series.priceToCoordinate(bar.high);
      if (y === null) return null;
      return { x, tip: y - GAP, tail: y - GAP - LEN };
    }
    const y = this._series.priceToCoordinate(bar.low);
    if (y === null) return null;
    return { x, tip: y + GAP, tail: y + GAP + LEN };
  }

  // The mark under a pane point (the pill's area), if any
  hitTest(px: number, py: number): string | null {
    if (this._hidden()) return null;
    for (let i = this._marks.length - 1; i >= 0; i--) {
      const m = this._marks[i];
      const g = this.geometry(m);
      if (!g) continue;
      const top = Math.min(g.tip, g.tail) - PILL_PAD, bottom = Math.max(g.tip, g.tail) + PILL_PAD;
      if (Math.abs(px - g.x) <= PILL_W / 2 + 1 && py >= top && py <= bottom) return m.key;
    }
    return null;
  }

  paneViews() {
    return [{ zOrder: () => 'top' as const, renderer: () => ({ draw: (target: any) => this._draw(target) }) }];
  }

  private _draw(target: any) {
    if (this._hidden() || !this._marks.length || !this._chart || !this._series) return;
    target.useMediaCoordinateSpace(({ context: ctx }: any) => {
      ctx.save();
      for (const m of this._marks) {
        const g = this.geometry(m);
        if (!g) continue;
        const color = m.side === 'buy' ? BLUE : RED;
        const dir = m.side === 'buy' ? -1 : 1;   // +1: the tip is below the tail (sell, pointing down)
        const lit = m.key === this._hover || m.key === this._active;
        if (lit) {
          // the pill behind the arrow
          const top = Math.min(g.tip, g.tail) - PILL_PAD, h = LEN + PILL_PAD * 2, x0 = g.x - PILL_W / 2, r = PILL_W / 2;
          ctx.fillStyle = m.side === 'buy' ? 'rgba(41, 98, 255, 0.22)' : 'rgba(242, 54, 69, 0.22)';
          ctx.beginPath();
          ctx.moveTo(x0 + r, top); ctx.arcTo(x0 + PILL_W, top, x0 + PILL_W, top + h, r); ctx.arcTo(x0 + PILL_W, top + h, x0, top + h, r);
          ctx.arcTo(x0, top + h, x0, top, r); ctx.arcTo(x0, top, x0 + PILL_W, top, r); ctx.closePath(); ctx.fill();
          // a chevron at each fill's price: right of the candle for sells (pointing left at it),
          // left of it for buys (pointing right)
          for (const f of m.fills) {
            const y = this._series.priceToCoordinate(f.price);
            if (y === null) continue;
            const cx = m.side === 'sell' ? g.x + 7 : g.x - 7, s = m.side === 'sell' ? 1 : -1;
            const path = () => { ctx.beginPath(); ctx.moveTo(cx + 3 * s, y - 4); ctx.lineTo(cx - 1 * s, y); ctx.lineTo(cx + 3 * s, y + 4); };
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; path(); ctx.stroke();
            ctx.strokeStyle = color; ctx.lineWidth = 2; path(); ctx.stroke();
          }
        }
        // the arrow: shaft and head
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(g.x, g.tail); ctx.lineTo(g.x, g.tip);
        ctx.moveTo(g.x - HEAD, g.tip - HEAD * dir); ctx.lineTo(g.x, g.tip); ctx.lineTo(g.x + HEAD, g.tip - HEAD * dir);
        ctx.stroke();
        if (m.label) {
          ctx.fillStyle = color; ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = m.side === 'buy' ? 'top' : 'bottom';
          ctx.fillText(m.label, g.x, m.side === 'buy' ? g.tail + 3 : g.tail - 3);
        }
      }
      ctx.restore();
    });
  }
}
