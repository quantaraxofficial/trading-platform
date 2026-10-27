// Indicator maths on plain arrays (oldest bar first, NaN where a value isn't available yet),
// behind MQL5's built-in indicator handles (iMA, iRSI, iBands …). Averages seeded the way
// MetaTrader's own indicators are: from the simple average of the first `period` values.

export function sma(src: number[], period: number): number[] {
  const n = src.length, out = new Array<number>(n).fill(NaN);
  if (period < 1) return out;
  let sum = 0, bad = 0;
  for (let i = 0; i < n; i++) {
    const v = src[i];
    if (Number.isFinite(v)) sum += v; else bad++;
    if (i >= period) { const o = src[i - period]; if (Number.isFinite(o)) sum -= o; else bad--; }
    if (i >= period - 1 && bad === 0) out[i] = sum / period;
  }
  return out;
}

// Exponential-style averages: value = alpha * price + (1 - alpha) * previous
function recursive(src: number[], period: number, alpha: number): number[] {
  const n = src.length, out = new Array<number>(n).fill(NaN);
  if (period < 1) return out;
  let prev = NaN, acc = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const v = src[i];
    if (!Number.isFinite(v)) continue;
    if (Number.isNaN(prev)) {
      acc += v; count++;
      if (count === period) { prev = acc / period; out[i] = prev; }
    } else {
      prev = alpha * v + (1 - alpha) * prev;
      out[i] = prev;
    }
  }
  return out;
}
export const ema = (src: number[], period: number) => recursive(src, period, 2 / (period + 1));
export const smma = (src: number[], period: number) => recursive(src, period, 1 / period);

export function lwma(src: number[], period: number): number[] {
  const n = src.length, out = new Array<number>(n).fill(NaN);
  const wsum = (period * (period + 1)) / 2;
  for (let i = period - 1; i < n; i++) {
    let s = 0, ok = true;
    for (let k = 0; k < period; k++) { const v = src[i - k]; if (!Number.isFinite(v)) { ok = false; break; } s += v * (period - k); }
    if (ok) out[i] = s / wsum;
  }
  return out;
}

// MODE_SMA 0, MODE_EMA 1, MODE_SMMA 2, MODE_LWMA 3
export function ma(src: number[], period: number, method: number): number[] {
  return method === 1 ? ema(src, period) : method === 2 ? smma(src, period) : method === 3 ? lwma(src, period) : sma(src, period);
}

export function stdev(src: number[], period: number, basis?: number[]): number[] {
  const n = src.length, out = new Array<number>(n).fill(NaN);
  const mean = basis ?? sma(src, period);
  for (let i = period - 1; i < n; i++) {
    const m = mean[i];
    if (!Number.isFinite(m)) continue;
    let s = 0;
    for (let k = 0; k < period; k++) { const d = src[i - k] - m; s += d * d; }
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

export function rsi(src: number[], period: number): number[] {
  const n = src.length, up = new Array<number>(n).fill(NaN), dn = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const d = src[i] - src[i - 1];
    if (!Number.isFinite(d)) continue;
    up[i] = d > 0 ? d : 0;
    dn[i] = d < 0 ? -d : 0;
  }
  const au = smma(up, period), ad = smma(dn, period);
  return au.map((u, i) => {
    const d = ad[i];
    if (!Number.isFinite(u) || !Number.isFinite(d)) return NaN;
    return d === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / d);
  });
}

export function trueRange(high: number[], low: number[], close: number[]): number[] {
  return high.map((h, i) => i === 0 ? h - low[i] : Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1])));
}
// MetaTrader's ATR is the simple average of the true range
export const atr = (high: number[], low: number[], close: number[], period: number) => sma(trueRange(high, low, close), period);

export function highest(src: number[], period: number): number[] {
  return src.map((_, i) => { if (i < period - 1) return NaN; let m = -Infinity; for (let k = 0; k < period; k++) m = Math.max(m, src[i - k]); return m; });
}
export function lowest(src: number[], period: number): number[] {
  return src.map((_, i) => { if (i < period - 1) return NaN; let m = Infinity; for (let k = 0; k < period; k++) m = Math.min(m, src[i - k]); return m; });
}

export function cci(src: number[], period: number): number[] {
  const mean = sma(src, period);
  return src.map((v, i) => {
    const m = mean[i];
    if (!Number.isFinite(m)) return NaN;
    let dev = 0;
    for (let k = 0; k < period; k++) dev += Math.abs(src[i - k] - m);
    dev /= period;
    return dev === 0 ? 0 : (v - m) / (0.015 * dev);
  });
}

// %K over kPeriod, smoothed by `slowing`, and its %D signal line
export function stochastic(high: number[], low: number[], close: number[], kPeriod: number, dPeriod: number, slowing: number, method: number) {
  const hh = highest(high, kPeriod), ll = lowest(low, kPeriod);
  const n = close.length, k = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < kPeriod + slowing - 2) continue;
    let num = 0, den = 0;
    for (let j = 0; j < slowing; j++) { num += close[i - j] - ll[i - j]; den += hh[i - j] - ll[i - j]; }
    k[i] = den === 0 ? 100 : (num / den) * 100;
  }
  return { main: k, signal: ma(k, dPeriod, method) };
}

export function adx(high: number[], low: number[], close: number[], period: number) {
  const n = close.length, pdm = new Array<number>(n).fill(0), mdm = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = high[i] - high[i - 1], down = low[i - 1] - low[i];
    pdm[i] = up > down && up > 0 ? up : 0;
    mdm[i] = down > up && down > 0 ? down : 0;
  }
  const tr = trueRange(high, low, close);
  const str = ema(tr, period), sp = ema(pdm, period), sm = ema(mdm, period);
  const plus = str.map((t, i) => (t ? (100 * sp[i]) / t : NaN));
  const minus = str.map((t, i) => (t ? (100 * sm[i]) / t : NaN));
  const dx = plus.map((p, i) => { const s = p + minus[i]; return !Number.isFinite(s) ? NaN : s ? (100 * Math.abs(p - minus[i])) / s : 0; });
  return { adx: ema(dx, period), plus, minus };
}
