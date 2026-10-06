// Chart snapshot helpers: compose the live chart into a PNG, and the delivery
// actions (download, clipboard, hosted link) that the Snapshot menu offers.

export interface SnapshotMeta {
  symbol: string;
  intervalLabel: string;
  theme: string;
}

// The chart region = the lightweight-charts element (pane, price scale, time axis) plus
// the Konva drawing overlay that sits next to it. Walk up from the former until the
// ancestor also contains the overlay so drawings are part of the picture.
function findChartRoot(): HTMLElement | null {
  const lwc = document.querySelector('.tv-lightweight-charts') as HTMLElement | null;
  if (!lwc) return null;
  let el: HTMLElement | null = lwc.parentElement;
  while (el && el !== document.body) {
    if (el.querySelector('.konvajs-content')) return el;
    el = el.parentElement;
  }
  return lwc.parentElement;
}

function isVisibleCanvas(c: HTMLCanvasElement): boolean {
  const r = c.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  // Every ancestor up to <body> must be shown too (a hidden panel's canvases still have size)
  for (let el: HTMLElement | null = c; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
  }
  return true;
}

import { tradingSettings } from '@/app/trading/settings';
import { paneGeometry } from './priceScaleSide';

export async function captureChartSnapshot(meta: SnapshotMeta): Promise<Blob> {
  const root = findChartRoot();
  if (!root) throw new Error('Chart is not ready yet');

  const rect = root.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const out = document.createElement('canvas');
  out.width = Math.round(rect.width * dpr);
  out.height = Math.round(rect.height * dpr);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const dark = meta.theme === 'dark';
  ctx.fillStyle = dark ? '#131722' : '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);

  // Settings → Trading → "Orders, executions, and positions in chart snapshots": off hides the
  // execution marks for the capture, on draws the position/order lines into it
  const trading = (window as any).__tradingSnapshot;
  const withTrades = tradingSettings.get().tradesInSnapshots;
  if (trading && !withTrades) {
    trading.setMarksHidden(true);
    await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())));
  }
  try {
    // Document order matches paint order here: chart pane canvases first, drawing overlay last
    root.querySelectorAll('canvas').forEach((node) => {
      const c = node as HTMLCanvasElement;
      if (!isVisibleCanvas(c)) return;
      const r = c.getBoundingClientRect();
      ctx.drawImage(c, (r.left - rect.left) * dpr, (r.top - rect.top) * dpr, r.width * dpr, r.height * dpr);
    });
  } finally {
    if (trading && !withTrades) trading.setMarksHidden(false);
  }
  if (trading && withTrades) {
    const chart = (window as any).__chartInstance;
    let paneW = rect.width, pl = 0;
    try { const g = paneGeometry(chart); paneW = rect.width - g.scaleW; pl = g.paneLeft; } catch { /* keep full width */ }
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
    ctx.textBaseline = 'middle';
    for (const l of trading.lines() as { y: number; color: string; dashed: boolean; text: string }[]) {
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 1;
      ctx.setLineDash(l.dashed ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(pl, Math.round(l.y) + 0.5); ctx.lineTo(pl + paneW, Math.round(l.y) + 0.5); ctx.stroke();
      ctx.setLineDash([]);
      const w = ctx.measureText(l.text).width + 14;
      const x = pl + paneW - 64 - w;
      ctx.fillStyle = dark ? '#1e222d' : '#ffffff';
      ctx.fillRect(x, l.y - 10, w, 20);
      ctx.strokeRect(x + 0.5, l.y - 9.5, w - 1, 19);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x + 7, l.y);
    }
    ctx.restore();
  }

  // The legend at the chart's top-left is HTML, not canvas, so draw an equivalent one.
  const fullData: any[] = (window as any).__chartFullData || [];
  const cutoff = (window as any).__replayVisibleCutoff;
  const lastIdx = cutoff !== null && cutoff !== undefined ? Math.min(cutoff, fullData.length - 1) : fullData.length - 1;
  const bar = lastIdx >= 0 ? fullData[lastIdx] : null;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'middle';
  const font = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
  const textColor = dark ? '#d1d4dc' : '#131722';
  const muted = dark ? '#787b86' : '#787b86';
  let x = 10;
  const y = 16;
  ctx.font = `600 13px ${font}`;
  ctx.fillStyle = textColor;
  ctx.fillText(meta.symbol, x, y);
  x += ctx.measureText(meta.symbol).width;
  ctx.font = `400 12px ${font}`;
  ctx.fillStyle = muted;
  const sub = ` · ${meta.intervalLabel} · TradePilot`;
  ctx.fillText(sub, x, y);
  x += ctx.measureText(sub).width + 10;
  if (bar) {
    const up = bar.close >= bar.open;
    const color = up ? '#089981' : '#f23645';
    const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(2) : n.toFixed(3));
    for (const [label, val] of [['O', bar.open], ['H', bar.high], ['L', bar.low], ['C', bar.close]] as [string, number][]) {
      ctx.fillStyle = muted;
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 2;
      ctx.fillStyle = color;
      const v = fmt(val);
      ctx.fillText(v, x, y);
      x += ctx.measureText(v).width + 8;
    }
  }
  ctx.restore();

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/png');
  });
}

export function snapshotFileName(symbol: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${symbol.replace(/[^\w.-]+/g, '_')}_${stamp}.png`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function copyImageToClipboard(blob: Blob) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard is not available in this browser');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// Hosts the image on this app's own server and returns the absolute URL of its snapshot
// page (/snapshot/<id>: header with Copy link / Launch chart, image beneath).
export async function uploadSnapshot(blob: Blob, meta: SnapshotMeta & { author?: string }): Promise<string> {
  const q = new URLSearchParams({
    symbol: meta.symbol,
    interval: meta.intervalLabel,
    author: meta.author || '',
    tz: String(-new Date().getTimezoneOffset()),
  });
  const res = await fetch(`/api/snapshots?${q.toString()}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(data.error || 'Could not upload the image');
  return `${window.location.origin}/snapshot/${data.id}`;
}
