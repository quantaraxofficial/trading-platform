// Settings → Events → Economic events: the economic calendar's events for the chart symbol's
// currencies, as TradingView marks them — a round flag at the bottom of the chart at the event's
// time (past bars, or the empty space right of the last bar for upcoming ones), ringed in the
// importance's colour. "Only future events" leaves out the past ones; "Events breaks" adds a
// vertical line at each. Events on the same bar share a mark; hovering a mark lists them (hit()).

import type { EconEvent } from "../../lib/economicCalendar";
import { IMPACT_COLOR } from "../../lib/economicCalendar";
import { currencyFlagImage } from "../../trading/symbolLogos";

type Style = { visible: boolean; onlyFuture: boolean; breaks: boolean; breaksStyle: { color: string; width: number; style: string } };
export type EventMark = { x: number; y: number; events: EconEvent[] };

const SIZE = 18, BOTTOM = 8;

export class EconomicEvents {
  private chart: any = null;
  private series: any = null;
  private requestUpdate: (() => void) | null = null;
  private events: EconEvent[] = [];
  private marks: EventMark[] = [];
  constructor(private style: () => Style) {}
  attached(p: any) { this.chart = p.chart; this.series = p.series; this.requestUpdate = p.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.requestUpdate = null; }
  updateAllViews() {}
  update() { this.requestUpdate?.(); }
  setEvents(events: EconEvent[]) { this.events = events; this.requestUpdate?.(); }

  // The mark under a point of the pane (media pixels), if any
  hit(x: number, y: number): EventMark | null {
    for (const m of this.marks) if (Math.hypot(m.x - x, m.y - y) <= SIZE / 2 + 3) return m;
    return null;
  }

  // An event time's logical bar: the bar it falls in, or past the last bar at the bar spacing
  private logicalOf(t: number, data: any[]): number | null {
    const n = data.length;
    if (n < 2) return null;
    const first = data[0].time as number, last = data[n - 1].time as number;
    if (t < first) return null;
    if (t >= last) {
      const step = (last - (data[n - 2].time as number)) || 60;
      return n - 1 + Math.floor((t - last) / step);
    }
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if ((data[mid].time as number) <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }

  paneViews() {
    const self = this;
    return [{
      zOrder: () => "top" as const,
      renderer: () => ({
        draw: (target: any) => {
          self.marks = [];
          const st = self.style();
          if (!st.visible || !self.chart || !self.series || !self.events.length) return;
          const data = self.series.data() as any[];
          const ts = self.chart.timeScale();
          const now = Date.now() / 1000;
          // events on one bar share a mark
          const byBar = new Map<number, EconEvent[]>();
          for (const e of self.events) {
            if (st.onlyFuture && e.time <= now) continue;
            const l = self.logicalOf(e.time, data);
            if (l === null) continue;
            const list = byBar.get(l);
            if (list) list.push(e); else byBar.set(l, [e]);
          }
          target.useMediaCoordinateSpace(({ context: ctx, mediaSize }: any) => {
            const y = mediaSize.height - BOTTOM - SIZE / 2;
            ctx.save();
            byBar.forEach((evs, l) => {
              const x = ts.logicalToCoordinate(l as any);
              if (x === null || !isFinite(x) || x < -SIZE || x > mediaSize.width + SIZE) return;
              const rank = (e: EconEvent) => (e.impact === "high" ? 0 : e.impact === "medium" ? 1 : 2);
              evs.sort((a, b) => rank(a) - rank(b));
              const top = evs[0];
              if (st.breaks) {
                const bs = st.breaksStyle;
                ctx.strokeStyle = bs.color; ctx.lineWidth = bs.width;
                ctx.setLineDash(bs.style === "Dashed" ? [4, 3] : bs.style === "Dotted" ? [bs.width, bs.width * 2] : []);
                const px = Math.round(x) + (bs.width % 2 ? 0.5 : 0);
                ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, y - SIZE / 2 - 2); ctx.stroke();
                ctx.setLineDash([]);
              }
              // the importance ring, then the flag
              ctx.beginPath(); ctx.arc(x, y, SIZE / 2 + 1.5, 0, Math.PI * 2);
              ctx.fillStyle = IMPACT_COLOR[top.impact]; ctx.fill();
              const img = currencyFlagImage(top.currency, SIZE * 2, () => self.requestUpdate?.());
              if (img) ctx.drawImage(img, x - SIZE / 2, y - SIZE / 2, SIZE, SIZE);
              else {
                ctx.beginPath(); ctx.arc(x, y, SIZE / 2, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
                ctx.fillStyle = "#131722"; ctx.font = "600 7px -apple-system, Segoe UI, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(top.currency, x, y + 0.5);
              }
              if (evs.length > 1) {
                const bx = x + SIZE / 2 - 1, by = y - SIZE / 2 + 1;
                ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fillStyle = "#2962ff"; ctx.fill();
                ctx.fillStyle = "#ffffff"; ctx.font = "600 9px -apple-system, Segoe UI, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(evs.length > 9 ? "9+" : String(evs.length), bx, by + 0.5);
              }
              self.marks.push({ x, y, events: evs });
            });
            ctx.restore();
          });
        },
      }),
    }];
  }
}
