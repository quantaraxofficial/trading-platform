// Pine Script built-in functions for the runtime in pineScriptEngine.ts: the ta.* indicator
// library (stateful, one state object per call site), math.*, str.* and color.*. Behaviour follows
// TradingView's reference manual: na source values are skipped by the moving averages and
// window functions ("calculates on the length quantity of non-na values"), and ta.ema / ta.rma
// start from the simple average of their first `length` values.

export interface TaBar { time: number; open: number; high: number; low: number; close: number; volume?: number }
export interface TaCtx { barIndex: number; bar: TaBar; bars: TaBar[] }
export type State = Record<string, any>;

const isNa = (v: any) => v === undefined || v === null || (typeof v === "number" && isNaN(v));
const num = (v: any) => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : NaN);

// Child state for a nested series (e.g. the inner WMAs of a Hull MA)
function sub(s: State, key: string): State { return (s[key] = s[key] || {}); }

// Runs `fn` once per bar for this state and caches the result, so evaluating the same call twice
// on a bar can't advance its series twice
function once<T>(s: State, c: TaCtx, fn: () => T): T {
  if (s.__bar === c.barIndex) return s.__out;
  s.__bar = c.barIndex;
  s.__out = fn();
  return s.__out;
}

// The last `len` non-na values of a source (oldest first), or null while there are fewer
function windowOf(s: State, c: TaCtx, v: number, len: number): number[] | null {
  if (!s.vals) { s.vals = []; s.lastPush = -1; }
  if (s.lastPush !== c.barIndex) { s.lastPush = c.barIndex; if (!isNa(v)) s.vals.push(v); if (s.vals.length > 5000) s.vals.splice(0, s.vals.length - 5000); }
  return s.vals.length >= len && len > 0 ? s.vals.slice(-len) : null;
}

// Raw per-bar history (na kept), for src[len]-style lookbacks
function histOf(s: State, c: TaCtx, v: any): any[] {
  if (!s.h) { s.h = []; s.hb = -1; }
  if (s.hb !== c.barIndex) { s.hb = c.barIndex; s.h.push(v); if (s.h.length > 5000) s.h.splice(0, 1); }
  return s.h;
}
const back = (h: any[], n: number) => (n >= 0 && h.length - 1 - n >= 0 ? h[h.length - 1 - n] : NaN);

export function sma(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => { const w = windowOf(s, c, v, Math.round(len)); return w ? w.reduce((a, b) => a + b, 0) / w.length : NaN; });
}

// ta.ema / ta.rma: alpha-smoothed, seeded with the SMA of the first `length` non-na values
function smoothed(s: State, c: TaCtx, v: number, len: number, alpha: number): number {
  return once(s, c, () => {
    if (isNa(v)) return isNa(s.prev) ? NaN : s.prev;
    if (isNa(s.prev)) {
      (s.seed = s.seed || []).push(v);
      if (s.seed.length < Math.round(len)) return NaN;
      s.prev = s.seed.reduce((a: number, b: number) => a + b, 0) / s.seed.length;
      s.seed = null;
      return s.prev;
    }
    s.prev = alpha * v + (1 - alpha) * s.prev;
    return s.prev;
  });
}
export const ema = (s: State, c: TaCtx, v: number, len: number) => smoothed(s, c, v, len, 2 / (len + 1));
export const rma = (s: State, c: TaCtx, v: number, len: number) => smoothed(s, c, v, len, 1 / len);

export function wma(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => {
    const n = Math.round(len), w = windowOf(s, c, v, n);
    if (!w) return NaN;
    let sum = 0, norm = 0;
    for (let i = 0; i < n; i++) { const wt = i + 1; sum += w[i] * wt; norm += wt; }
    return sum / norm;
  });
}

export function vwma(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => {
    const vol = c.bar.volume ?? 0;
    const a = sma(sub(s, "pv"), c, isNa(v) ? NaN : v * vol, len);
    const b = sma(sub(s, "v"), c, isNa(v) ? NaN : vol, len);
    return b ? a / b : NaN;
  });
}

export function swma(s: State, c: TaCtx, v: number): number {
  return once(s, c, () => { const h = histOf(s, c, v); const x = [back(h, 3), back(h, 2), back(h, 1), back(h, 0)]; return x.some(isNa) ? NaN : x[0] / 6 + x[1] * 2 / 6 + x[2] * 2 / 6 + x[3] / 6; });
}

export function hma(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => {
    const half = wma(sub(s, "h"), c, v, Math.floor(len / 2));
    const full = wma(sub(s, "f"), c, v, len);
    return wma(sub(s, "o"), c, isNa(half) || isNa(full) ? NaN : 2 * half - full, Math.round(Math.sqrt(len)));
  });
}

export function alma(s: State, c: TaCtx, v: number, len: number, offset = 0.85, sigma = 6, floor = false): number {
  return once(s, c, () => {
    const n = Math.round(len), w = windowOf(s, c, v, n);
    if (!w) return NaN;
    const m = floor ? Math.floor(offset * (n - 1)) : offset * (n - 1);
    const sd = n / sigma;
    let sum = 0, norm = 0;
    for (let i = 0; i < n; i++) { const wt = Math.exp(-((i - m) ** 2) / (2 * sd * sd)); sum += w[i] * wt; norm += wt; }
    return sum / norm;
  });
}

export function stdev(s: State, c: TaCtx, v: number, len: number, biased = true): number {
  return once(s, c, () => {
    const w = windowOf(s, c, v, Math.round(len));
    if (!w) return NaN;
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    const ss = w.reduce((a, b) => a + (b - mean) ** 2, 0);
    return Math.sqrt(ss / (biased ? w.length : w.length - 1));
  });
}
export function variance(s: State, c: TaCtx, v: number, len: number, biased = true): number {
  const sd = stdev(s, c, v, len, biased);
  return sd * sd;
}
export function dev(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => {
    const w = windowOf(s, c, v, Math.round(len));
    if (!w) return NaN;
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    return w.reduce((a, b) => a + Math.abs(b - mean), 0) / w.length;
  });
}

export function highest(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => { const h = histOf(s, c, v); const n = Math.round(len); if (h.length < n) return NaN; let m = -Infinity; for (let i = 0; i < n; i++) { const x = back(h, i); if (!isNa(x) && x > m) m = x; } return m === -Infinity ? NaN : m; });
}
export function lowest(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => { const h = histOf(s, c, v); const n = Math.round(len); if (h.length < n) return NaN; let m = Infinity; for (let i = 0; i < n; i++) { const x = back(h, i); if (!isNa(x) && x < m) m = x; } return m === Infinity ? NaN : m; });
}
// Offset (0 or negative) to the highest / lowest value within `len` bars
export function highestbars(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => { const h = histOf(s, c, v); const n = Math.round(len); if (h.length < n) return NaN; let m = -Infinity, at = 0; for (let i = 0; i < n; i++) { const x = back(h, i); if (!isNa(x) && x > m) { m = x; at = -i; } } return at; });
}
export function lowestbars(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => { const h = histOf(s, c, v); const n = Math.round(len); if (h.length < n) return NaN; let m = Infinity, at = 0; for (let i = 0; i < n; i++) { const x = back(h, i); if (!isNa(x) && x < m) { m = x; at = -i; } } return at; });
}

export function change(s: State, c: TaCtx, v: any, len = 1): any {
  return once(s, c, () => { const h = histOf(s, c, v); const p = back(h, Math.round(len)); if (typeof v === "boolean") return p === undefined || isNa(p) ? false : v !== p; return isNa(p) || isNa(v) ? NaN : v - p; });
}
export function mom(s: State, c: TaCtx, v: number, len: number): number { return change(s, c, v, len); }
export function roc(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => { const h = histOf(s, c, v); const p = back(h, Math.round(len)); return isNa(p) || isNa(v) || p === 0 ? NaN : (100 * (v - p)) / p; });
}
export function rising(s: State, c: TaCtx, v: number, len: number): boolean {
  return once(s, c, () => { const h = histOf(s, c, v); const n = Math.round(len); if (h.length <= n) return false; for (let i = 1; i <= n; i++) { const x = back(h, i); if (isNa(x) || !(v > x)) return false; } return true; });
}
export function falling(s: State, c: TaCtx, v: number, len: number): boolean {
  return once(s, c, () => { const h = histOf(s, c, v); const n = Math.round(len); if (h.length <= n) return false; for (let i = 1; i <= n; i++) { const x = back(h, i); if (isNa(x) || !(v < x)) return false; } return true; });
}

export function crossover(s: State, c: TaCtx, a: number, b: number): boolean {
  return once(s, c, () => { const r = !isNa(s.pa) && !isNa(s.pb) && s.pa <= s.pb && a > b; s.pa = a; s.pb = b; return r; });
}
export function crossunder(s: State, c: TaCtx, a: number, b: number): boolean {
  return once(s, c, () => { const r = !isNa(s.pa) && !isNa(s.pb) && s.pa >= s.pb && a < b; s.pa = a; s.pb = b; return r; });
}
export function cross(s: State, c: TaCtx, a: number, b: number): boolean {
  return once(s, c, () => { const r = !isNa(s.pa) && !isNa(s.pb) && ((s.pa <= s.pb && a > b) || (s.pa >= s.pb && a < b)); s.pa = a; s.pb = b; return r; });
}

// True range; the first bar (no previous close) is na unless handleNa, then high - low
export function tr(s: State, c: TaCtx, handleNa = false): number {
  const prev = c.barIndex > 0 ? c.bars[c.barIndex - 1].close : NaN;
  const { high, low } = c.bar;
  if (isNa(prev)) return handleNa ? high - low : NaN;
  return Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
}
export function atr(s: State, c: TaCtx, len: number): number { return rma(s, c, tr(s, c, true), len); }

export function pivothigh(s: State, c: TaCtx, v: number, left: number, right: number): number {
  return once(s, c, () => pivot(histOf(s, c, v), Math.round(left), Math.round(right), true));
}
export function pivotlow(s: State, c: TaCtx, v: number, left: number, right: number): number {
  return once(s, c, () => pivot(histOf(s, c, v), Math.round(left), Math.round(right), false));
}
// The value `right` bars back if it's a pivot: beyond every value to its left (strictly) and
// not exceeded by any to its right
function pivot(h: any[], left: number, right: number, high: boolean): number {
  if (h.length < left + right + 1) return NaN;
  const center = back(h, right);
  if (isNa(center)) return NaN;
  for (let i = 1; i <= left; i++) { const x = back(h, right + i); if (isNa(x) || (high ? x >= center : x <= center)) return NaN; }
  for (let i = 1; i <= right; i++) { const x = back(h, right - i); if (isNa(x) || (high ? x > center : x < center)) return NaN; }
  return center;
}

export function cum(s: State, c: TaCtx, v: number): number {
  return once(s, c, () => { s.sum = (s.sum ?? 0) + (isNa(v) ? 0 : v); return s.sum; });
}
export function sum(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => { const w = windowOf(s, c, v, Math.round(len)); return w ? w.reduce((a, b) => a + b, 0) : NaN; });
}
export function allTimeMax(s: State, c: TaCtx, v: number): number { return once(s, c, () => { if (!isNa(v)) s.m = isNa(s.m) ? v : Math.max(s.m, v); return s.m ?? NaN; }); }
export function allTimeMin(s: State, c: TaCtx, v: number): number { return once(s, c, () => { if (!isNa(v)) s.m = isNa(s.m) ? v : Math.min(s.m, v); return s.m ?? NaN; }); }

export function linreg(s: State, c: TaCtx, v: number, len: number, offset = 0): number {
  return once(s, c, () => {
    const n = Math.round(len), w = windowOf(s, c, v, n);
    if (!w) return NaN;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += w[i]; sxy += i * w[i]; sxx += i * i; }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    return intercept + slope * (n - 1 - offset);
  });
}

export function correlation(s: State, c: TaCtx, a: number, b: number, len: number): number {
  return once(s, c, () => {
    const n = Math.round(len);
    const ha = histOf(sub(s, "a"), c, a), hb = histOf(sub(s, "b"), c, b);
    if (ha.length < n) return NaN;
    const xa: number[] = [], xb: number[] = [];
    for (let i = 0; i < n; i++) { const p = back(ha, i), q = back(hb, i); if (isNa(p) || isNa(q)) return NaN; xa.push(p); xb.push(q); }
    const ma = xa.reduce((x, y) => x + y, 0) / n, mb = xb.reduce((x, y) => x + y, 0) / n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) { cov += (xa[i] - ma) * (xb[i] - mb); va += (xa[i] - ma) ** 2; vb += (xb[i] - mb) ** 2; }
    return va && vb ? cov / Math.sqrt(va * vb) : NaN;
  });
}

export function percentrank(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => { const h = histOf(s, c, v); const n = Math.round(len); if (h.length <= n || isNa(v)) return NaN; let cnt = 0; for (let i = 1; i <= n; i++) if (back(h, i) <= v) cnt++; return (cnt / n) * 100; });
}
export function percentile(s: State, c: TaCtx, v: number, len: number, pct: number, linear: boolean): number {
  return once(s, c, () => {
    const w = windowOf(s, c, v, Math.round(len));
    if (!w) return NaN;
    const sorted = w.slice().sort((a, b) => a - b);
    if (!linear) return sorted[Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1)];
    const pos = (pct / 100) * (sorted.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  });
}
export const median = (s: State, c: TaCtx, v: number, len: number) => percentile(s, c, v, len, 50, true);
export function range(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => highest(sub(s, "h"), c, v, len) - lowest(sub(s, "l"), c, v, len));
}

export function cci(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => { const m = sma(sub(s, "m"), c, v, len), d = dev(sub(s, "d"), c, v, len); return isNa(m) || !d ? NaN : (v - m) / (0.015 * d); });
}
export function cmo(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => {
    const ch = change(sub(s, "c"), c, v);
    const up = sum(sub(s, "u"), c, isNa(ch) ? NaN : Math.max(ch, 0), len);
    const dn = sum(sub(s, "d"), c, isNa(ch) ? NaN : -Math.min(ch, 0), len);
    return isNa(up) || up + dn === 0 ? NaN : (100 * (up - dn)) / (up + dn);
  });
}
export function rsi(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => {
    const ch = change(sub(s, "c"), c, v);
    const up = rma(sub(s, "u"), c, isNa(ch) ? NaN : Math.max(ch, 0), len);
    const dn = rma(sub(s, "d"), c, isNa(ch) ? NaN : -Math.min(ch, 0), len);
    if (isNa(up) || isNa(dn)) return NaN;
    return dn === 0 ? 100 : up === 0 ? 0 : 100 - 100 / (1 + up / dn);
  });
}
export function mfi(s: State, c: TaCtx, v: number, len: number): number {
  return once(s, c, () => {
    const ch = change(sub(s, "c"), c, v), vol = c.bar.volume ?? 0;
    const up = sum(sub(s, "u"), c, isNa(ch) ? NaN : ch <= 0 ? 0 : vol * v, len);
    const dn = sum(sub(s, "d"), c, isNa(ch) ? NaN : ch >= 0 ? 0 : vol * v, len);
    return isNa(up) ? NaN : dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  });
}
export function stoch(s: State, c: TaCtx, v: number, high: number, low: number, len: number): number {
  return once(s, c, () => { const hh = highest(sub(s, "h"), c, high, len), ll = lowest(sub(s, "l"), c, low, len); return isNa(hh) || hh === ll ? NaN : (100 * (v - ll)) / (hh - ll); });
}
export function wpr(s: State, c: TaCtx, len: number): number {
  return once(s, c, () => { const hh = highest(sub(s, "h"), c, c.bar.high, len), ll = lowest(sub(s, "l"), c, c.bar.low, len); return isNa(hh) || hh === ll ? NaN : (100 * (c.bar.close - hh)) / (hh - ll); });
}
export function tsi(s: State, c: TaCtx, v: number, short: number, long: number): number {
  return once(s, c, () => {
    const ch = change(sub(s, "c"), c, v);
    const n = ema(sub(s, "n2"), c, ema(sub(s, "n1"), c, ch, long), short);
    const d = ema(sub(s, "d2"), c, ema(sub(s, "d1"), c, isNa(ch) ? NaN : Math.abs(ch), long), short);
    return isNa(n) || !d ? NaN : n / d;
  });
}

export function macd(s: State, c: TaCtx, v: number, fast: number, slow: number, signal: number): number[] {
  return once(s, c, () => {
    const f = ema(sub(s, "f"), c, v, fast), sl = ema(sub(s, "s"), c, v, slow);
    const m = isNa(f) || isNa(sl) ? NaN : f - sl;
    const sig = ema(sub(s, "g"), c, m, signal);
    return [m, sig, isNa(m) || isNa(sig) ? NaN : m - sig];
  });
}
export function bb(s: State, c: TaCtx, v: number, len: number, mult: number): number[] {
  return once(s, c, () => { const b = sma(sub(s, "m"), c, v, len), d = stdev(sub(s, "d"), c, v, len); return [b, b + mult * d, b - mult * d]; });
}
export function bbw(s: State, c: TaCtx, v: number, len: number, mult: number): number {
  return once(s, c, () => { const [b, u, l] = bb(sub(s, "b"), c, v, len, mult); return b ? ((u - l) / b) * 100 : NaN; });
}
export function kc(s: State, c: TaCtx, v: number, len: number, mult: number, useTr = true): number[] {
  return once(s, c, () => {
    const basis = ema(sub(s, "b"), c, v, len);
    const rng = ema(sub(s, "r"), c, useTr ? tr(s, c, true) : c.bar.high - c.bar.low, len);
    return [basis, basis + rng * mult, basis - rng * mult];
  });
}
export function kcw(s: State, c: TaCtx, v: number, len: number, mult: number, useTr = true): number {
  return once(s, c, () => { const [b, u, l] = kc(sub(s, "k"), c, v, len, mult, useTr); return b ? (u - l) / b : NaN; });
}
export function dmi(s: State, c: TaCtx, diLen: number, adxLen: number): number[] {
  return once(s, c, () => {
    const p = c.barIndex > 0 ? c.bars[c.barIndex - 1] : null;
    const up = p ? c.bar.high - p.high : NaN, down = p ? p.low - c.bar.low : NaN;
    const plusDM = isNa(up) ? NaN : up > down && up > 0 ? up : 0;
    const minusDM = isNa(down) ? NaN : down > up && down > 0 ? down : 0;
    const trur = rma(sub(s, "t"), c, tr(s, c, false), diLen);
    const plus = (100 * rma(sub(s, "p"), c, plusDM, diLen)) / trur;
    const minus = (100 * rma(sub(s, "m"), c, minusDM, diLen)) / trur;
    const sumDi = plus + minus;
    const adx = 100 * rma(sub(s, "a"), c, isNa(sumDi) ? NaN : Math.abs(plus - minus) / (sumDi === 0 ? 1 : sumDi), adxLen);
    return [plus, minus, adx];
  });
}

// Parabolic SAR, as TradingView's built-in computes it
export function sar(s: State, c: TaCtx, start: number, inc: number, max: number): number {
  return once(s, c, () => {
    const i = c.barIndex, b = c.bar;
    if (i === 0) { s.started = false; return NaN; }
    const p = c.bars[i - 1];
    let firstTrendBar = false;
    if (!s.started) {
      s.started = true;
      if (b.close > p.close) { s.up = true; s.ep = b.high; s.sar = p.low; } else { s.up = false; s.ep = b.low; s.sar = p.high; }
      s.af = start; firstTrendBar = true;
    }
    let result = s.sar;
    s.sar = s.sar + s.af * (s.ep - s.sar);
    if (s.up) {
      if (s.sar > b.low) { firstTrendBar = true; s.up = false; s.sar = Math.max(s.ep, b.high); s.ep = b.low; s.af = start; }
    } else if (s.sar < b.high) { firstTrendBar = true; s.up = true; s.sar = Math.min(s.ep, b.low); s.ep = b.high; s.af = start; }
    if (!firstTrendBar) {
      if (s.up) { if (b.high > s.ep) { s.ep = b.high; s.af = Math.min(s.af + inc, max); } }
      else if (b.low < s.ep) { s.ep = b.low; s.af = Math.min(s.af + inc, max); }
    }
    if (s.up) { s.sar = Math.min(s.sar, p.low); if (i > 1) s.sar = Math.min(s.sar, c.bars[i - 2].low); }
    else { s.sar = Math.max(s.sar, p.high); if (i > 1) s.sar = Math.max(s.sar, c.bars[i - 2].high); }
    result = s.sar;
    return result;
  });
}

export function supertrend(s: State, c: TaCtx, factor: number, atrLen: number): number[] {
  return once(s, c, () => {
    const src = (c.bar.high + c.bar.low) / 2;
    const a = atr(sub(s, "a"), c, atrLen);
    let upper = src + factor * a, lower = src - factor * a;
    const prevClose = c.barIndex > 0 ? c.bars[c.barIndex - 1].close : NaN;
    if (!isNa(s.lower)) lower = lower > s.lower || prevClose < s.lower ? lower : s.lower;
    if (!isNa(s.upper)) upper = upper < s.upper || prevClose > s.upper ? upper : s.upper;
    let dir: number;
    if (isNa(a) || isNa(s.st)) dir = 1;
    else if (s.st === s.upper) dir = c.bar.close > upper ? -1 : 1;
    else dir = c.bar.close < lower ? 1 : -1;
    const st = isNa(a) ? NaN : dir === -1 ? lower : upper;
    s.lower = lower; s.upper = upper; s.st = st;
    return [st, dir];
  });
}

// Session VWAP, reset at each new UTC day
export function vwap(s: State, c: TaCtx, v: number): number {
  return once(s, c, () => {
    const day = Math.floor(c.bar.time / 86400);
    if (s.day !== day) { s.day = day; s.pv = 0; s.vol = 0; }
    const vol = c.bar.volume ?? 0;
    if (!isNa(v)) { s.pv += v * vol; s.vol += vol; }
    return s.vol ? s.pv / s.vol : NaN;
  });
}
// VWAP restarting whenever `anchor` is true, with bands `mult` volume-weighted standard deviations away
export function vwapAnchored(s: State, c: TaCtx, v: number, anchor: boolean, mult: number): number[] {
  return once(s, c, () => {
    if (anchor || s.vol === undefined) { s.pv = 0; s.pv2 = 0; s.vol = 0; }
    const vol = c.bar.volume ?? 0;
    if (!isNa(v)) { s.pv += v * vol; s.pv2 += v * v * vol; s.vol += vol; }
    if (!s.vol) return [NaN, NaN, NaN];
    const w = s.pv / s.vol;
    const sd = Math.sqrt(Math.max(0, s.pv2 / s.vol - w * w));
    return [w, w + mult * sd, w - mult * sd];
  });
}

export function obv(s: State, c: TaCtx): number {
  return once(s, c, () => { const p = c.barIndex > 0 ? c.bars[c.barIndex - 1].close : NaN; const d = isNa(p) ? 0 : Math.sign(c.bar.close - p); s.v = (s.v ?? 0) + d * (c.bar.volume ?? 0); return s.v; });
}
export function accdist(s: State, c: TaCtx): number {
  return once(s, c, () => { const { high, low, close } = c.bar; const mfm = high === low ? 0 : ((close - low) - (high - close)) / (high - low); s.v = (s.v ?? 0) + mfm * (c.bar.volume ?? 0); return s.v; });
}
export function pvt(s: State, c: TaCtx): number {
  return once(s, c, () => { const p = c.barIndex > 0 ? c.bars[c.barIndex - 1].close : NaN; if (!isNa(p) && p) s.v = (s.v ?? 0) + ((c.bar.close - p) / p) * (c.bar.volume ?? 0); return s.v ?? 0; });
}

// ------------------------------------------------------------------ colors

export function parseColor(c: any): { r: number; g: number; b: number; a: number } | null {
  if (typeof c !== "string") return null;
  const s = c.trim();
  let m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split("").map(x => x + x).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  return null;
}
const rgba = (r: number, g: number, b: number, a: number) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+Math.max(0, Math.min(1, a)).toFixed(3)})`;
// Pine transparency is 0 (opaque) … 100 (invisible)
// Scripts recompute the same colors on every bar: remember them
const colorCache = new Map<string, string>();
const cached = (key: string, make: () => string) => {
  let v = colorCache.get(key);
  if (v === undefined) { v = make(); if (colorCache.size > 2000) colorCache.clear(); colorCache.set(key, v); }
  return v;
};
export function colorNew(c: any, transp: number): any {
  if (typeof c !== "string" || isNa(transp)) return c;
  return cached(`${c}|${transp}`, () => { const p = parseColor(c); return p ? rgba(p.r, p.g, p.b, 1 - transp / 100) : c; });
}
export function colorRgb(r: number, g: number, b: number, transp = 0): string {
  return cached(`${r},${g},${b},${transp}`, () => rgba(r, g, b, 1 - (isNa(transp) ? 0 : transp) / 100));
}
export function colorPart(c: any, part: "r" | "g" | "b" | "t"): number {
  const p = parseColor(c);
  if (!p) return NaN;
  return part === "t" ? Math.round((1 - p.a) * 100) : p[part];
}
export function fromGradient(v: number, bottom: number, top: number, bottomColor: any, topColor: any): any {
  if (isNa(v)) return NaN;
  const a = parseColor(bottomColor), b = parseColor(topColor);
  if (!a || !b) return v >= top ? topColor : bottomColor;
  const t = top === bottom ? 1 : Math.max(0, Math.min(1, (v - bottom) / (top - bottom)));
  return rgba(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
}

export { isNa, num };
