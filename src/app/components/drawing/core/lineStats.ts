// The figures TradingView's Info line (and a line's stats) show between two points:
// price change with % and pips/ticks, bars and the time between them, the pixel distance
// and the angle on screen.

type Pt = { logical: number; price: number; time?: number };

const INTERVAL_SEC: Record<string, number> = { min: 60, h: 3600, day: 86400, week: 604800, month: 2629746 };
function intervalSeconds(): number {
  const m = String((window as any).__chartInterval || '1day').match(/^(\d+)(min|h|day|week|month)$/);
  return m ? Number(m[1]) * INTERVAL_SEC[m[2]] : 86400;
}

// A point's time: its own, else its bar's (extrapolated past either end of the data)
function timeOf(p: Pt): number | null {
  if (typeof p.time === 'number') return p.time;
  const bars: { time: number }[] = (window as any).__chartFullData || [];
  if (!bars.length) return null;
  const i = Math.round(p.logical);
  if (i >= 0 && i < bars.length) return bars[i].time;
  const step = intervalSeconds();
  return i < 0 ? bars[0].time + i * step : bars[bars.length - 1].time + (i - (bars.length - 1)) * step;
}

// "1d 15h", "2h 30m", "45m"
export function formatDuration(seconds: number): string {
  let s = Math.round(Math.abs(seconds));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  const parts = [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean);
  return parts.length ? parts.join(' ') : '0m';
}

// The line's angle on screen, in degrees, counter-clockwise from the right (up is positive)
export function screenAngle(x1: number, y1: number, x2: number, y2: number): number {
  return (Math.atan2(y1 - y2, x2 - x1) * 180) / Math.PI;
}

export function lineStats(p1: Pt, p2: Pt, x1: number, y1: number, x2: number, y2: number) {
  const prec: number = (window as any).__pricePrecision ?? 2;
  const fmt = (n: number, digits: number) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const diff = p2.price - p1.price;
  const pct = p1.price ? (diff / p1.price) * 100 : 0;
  // Fractional-pip quotes (3 or 5 decimals) count pips, one decimal; others count ticks
  const ticks = diff * Math.pow(10, prec);
  const pipsText = prec === 3 || prec === 5 ? fmt(ticks / 10, 1) : fmt(Math.round(ticks), 0);
  const bars = Math.round(p2.logical - p1.logical);
  const t1 = timeOf(p1), t2 = timeOf(p2);
  const duration = t1 !== null && t2 !== null ? formatDuration(t2 - t1) : '';
  const distance = Math.round(Math.hypot(x2 - x1, y2 - y1));
  const angle = screenAngle(x1, y1, x2, y2);
  return {
    priceLine: `${fmt(diff, prec)} (${fmt(pct, 2)}%), ${pipsText}`,
    barsLine: `${bars} bars${duration ? ` (${duration})` : ''}, distance: ${distance} px`,
    angleLine: `${angle.toFixed(2)}°`,
    angle,
  };
}

// Text width for laying out boxes around Konva text (same font the shapes draw with)
let measureCtx: CanvasRenderingContext2D | null = null;
export const SHAPE_FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
export function textWidth(text: string, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * fontSize * 0.6;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * fontSize * 0.6;
  measureCtx.font = `${fontSize}px ${SHAPE_FONT}`;
  return measureCtx.measureText(text).width;
}

// Whether the chart is in its dark theme (read off the page's pane colour)
export function isDarkChart(): boolean {
  if (typeof document === 'undefined') return false;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--tv-color-pane-bg').trim();
  const m = bg.match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 128;
}
