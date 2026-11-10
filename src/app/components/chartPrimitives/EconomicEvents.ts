// Settings → Events → Economic events: the economic calendar's events for the chart symbol's
// currencies, as TradingView marks them — a round flag at the bottom of the chart at the event's
// time (past bars, or the empty space right of the last bar for upcoming ones), ringed in the
// importance's colour. "Only future events" leaves out the past ones; "Events breaks" adds a
// vertical line at each. Events on the same bar share a mark; hovering a mark lists them (hit()).
// The time scale counts down to the next one (timeAxisViews), as the price scale counts down the bar.

import type { EconEvent } from "../../lib/economicCalendar";
import { IMPACT_COLOR } from "../../lib/economicCalendar";
import { currencyFlagImage } from "../../trading/symbolLogos";

type Style = { visible: boolean; onlyFuture: boolean; breaks: boolean; breaksStyle: { color: string; width: number; style: string } };
export type EventMark = { x: number; y: number; events: EconEvent[] };

const SIZE = 18, BOTTOM = 8;

// Now: the real time, or in a bar replay the replay's (ReplayContext's __replayNow; null until known)
function replayNow(): number | null {
  const w = typeof window !== "undefined" ? (window as any) : {};
  if (!w.__replayActive) return Date.now() / 1000;
  return typeof w.__replayNow === "number" ? w.__replayNow : null;
}

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

  // The next event to come (of those marked): soonest, the most important first at the same time
  private next(now: number): { time: number; events: EconEvent[] } | null {
    let best: EconEvent[] = [];
    for (const e of this.events) {
      if (e.time <= now || e.all_day) continue;
      if (!best.length || e.time < best[0].time) best = [e];
      else if (e.time === best[0].time) best.push(e);
    }
    if (!best.length) return null;
    const rank = (e: EconEvent) => (e.impact === "high" ? 0 : e.impact === "medium" ? 1 : 2);
    return { time: best[0].time, events: best.sort((a, b) => rank(a) - rank(b)) };
  }
  // Seconds until the next event, or null (the chart ticks the countdown faster when it's close)
  secondsToNext(): number | null {
    const now = replayNow();
    if (now === null) return null;
    const n = this.style().visible ? this.next(now) : null;
    return n ? n.time - now : null;
  }

  // The countdown to the next news on the time scale, as the bar countdown sits on the price scale:
  // a label at the event's time ("USD CPI m/m  01:23:45"), in its importance's colour, held at the
  // scale's edge (with an arrow) while that time is off screen
  timeAxisViews() {
    const st = this.style();
    if (!st.visible || !this.chart || !this.series) return [];
    // (in a bar replay it counts from the replay's time)
    const now = replayNow();
    if (now === null) return [];
    const n = this.next(now);
    if (!n) return [];
    const data = this.series.data() as any[];
    const l = this.logicalOf(n.time, data);
    const ts = this.chart.timeScale();
    const width: number = ts.width?.() ?? 0;
    let x = l === null ? null : ts.logicalToCoordinate(l as any);
    const top = n.events[0];
    const left = Math.max(0, Math.round(n.time - now));
    const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), sec = left % 60;
    const p2 = (v: number) => String(v).padStart(2, "0");
    const clock = d ? `${d}d ${p2(h)}:${p2(m)}` : h ? `${h}:${p2(m)}:${p2(sec)}` : `${p2(m)}:${p2(sec)}`;
    const title = top.title.length > 22 ? `${top.title.slice(0, 21)}…` : top.title;
    const more = n.events.length > 1 ? ` +${n.events.length - 1}` : "";
    let text = `${top.currency} ${title}${more}  ${clock}`;
    const half = text.length * 3.4 + 8;
    if (x === null || x > width - half) { x = width - half; text = `${text} →`; }
    else if (x < half) { x = half; text = `← ${text}`; }
    return [{
      coordinate: () => x as number,
      text: () => text,
      textColor: () => "#ffffff",
      backColor: () => IMPACT_COLOR[top.impact],
      visible: () => width > 0,
      tickVisible: () => false,
    }];
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
          const now = replayNow() ?? Date.now() / 1000;
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
