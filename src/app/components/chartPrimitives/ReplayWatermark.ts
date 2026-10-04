// TradingView's "Replay" watermark: while replay mode is on, a faint rewind icon and the
// word "Replay" sit in the middle of the chart, behind the candles and the crosshair.
// A pane primitive drawn on the bottom layer; its colour follows the chart's background.
import type { IChartApi } from 'lightweight-charts';

const FONT_PX = 80;
const ICON_D = 52;
const GAP = 22;
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';

function parseColor(c: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(x => x + x).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c);
  return rgb ? [+rgb[1], +rgb[2], +rgb[3]] : null;
}

export class ReplayWatermark {
  private _chart: IChartApi | null = null;
  private _requestUpdate: (() => void) | null = null;

  constructor(private _visible: () => boolean) {}

  attached(param: { chart: unknown; requestUpdate: () => void }) {
    this._chart = param.chart as IChartApi;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._chart = null;
    this._requestUpdate = null;
  }

  // Repaint after replay mode turns on or off
  update() { this._requestUpdate?.(); }

  updateAllViews() {}

  paneViews() {
    return [{
      zOrder: () => 'bottom' as const,
      renderer: () => ({ draw: (target: any) => this._draw(target) }),
    }];
  }

  private _draw(target: any) {
    if (!this._chart || !this._visible()) return;
    const bg: any = (this._chart.options() as any).layout?.background ?? {};
    const bgColor: string = bg.color ?? bg.topColor ?? '#ffffff';
    const rgb = parseColor(bgColor) ?? [255, 255, 255];
    const dark = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] < 128;
    // Sampled from TradingView: a light grey at ~12% on dark charts, the mirror on light ones
    const ink = dark ? 'rgba(178, 181, 190, 0.12)' : 'rgba(19, 23, 34, 0.07)';

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }: any) => {
      ctx.save();
      ctx.font = `${FONT_PX}px ${FONT_FAMILY}`;
      const textW = ctx.measureText('Replay').width;
      const fullW = ICON_D + GAP + textW;
      // Shrink to fit a narrow chart
      const s = Math.min(1, (mediaSize.width * 0.8) / fullW, (mediaSize.height * 0.5) / FONT_PX);
      if (s <= 0) { ctx.restore(); return; }
      ctx.translate(mediaSize.width / 2, mediaSize.height / 2);
      ctx.scale(s, s);
      const left = -fullW / 2;

      // The icon: a filled circle with a rewind (◀◀) cut into it (painted in the background colour)
      const r = ICON_D / 2;
      const cx = left + r;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(cx, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.moveTo(cx - 14, 0); ctx.lineTo(cx - 2.5, -10); ctx.lineTo(cx - 2.5, 10); ctx.closePath();
      ctx.moveTo(cx - 2.5, 0); ctx.lineTo(cx + 9.5, -11); ctx.lineTo(cx + 9.5, 11); ctx.closePath();
      ctx.fill();

      ctx.fillStyle = ink;
      ctx.textBaseline = 'middle';
      ctx.fillText('Replay', left + ICON_D + GAP, 2);
      ctx.restore();
    });
  }
}
