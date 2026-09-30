// Numbers for the symbol details panel, all from the symbol's real daily bars:
//  • Technicals — TradingView's "Technical Ratings" method: moving averages and oscillators each
//    vote buy (+1), sell (−1) or neutral (0); the two groups' averages are combined.
//  • Seasonals — each year's % change from its first trading day, for this year and two before.
//  • Performance — the % change over 1W / 1M / 3M / 6M / YTD / 1Y.

export type DailyBar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

// --- Indicator helpers (each returns a series aligned with the input, NaN until defined) ---
const sma = (v: number[], n: number) => v.map((_, i) => (i + 1 < n ? NaN : v.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n));
function ema(v: number[], n: number): number[] {
  const out: number[] = []; const k = 2 / (n + 1); let prev = NaN;
  v.forEach((x, i) => {
    if (i + 1 < n) { out.push(NaN); return; }
    prev = i + 1 === n ? v.slice(0, n).reduce((a, b) => a + b, 0) / n : x * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}
function rma(v: number[], n: number): number[] {
  const out: number[] = []; let prev = NaN;
  v.forEach((x, i) => {
    if (i + 1 < n) { out.push(NaN); return; }
    prev = i + 1 === n ? v.slice(0, n).reduce((a, b) => a + b, 0) / n : (prev * (n - 1) + x) / n;
    out.push(prev);
  });
  return out;
}
const wma = (v: number[], n: number) => v.map((_, i) => {
  if (i + 1 < n) return NaN;
  let s = 0, w = 0;
  for (let j = 0; j < n; j++) { s += v[i - j] * (n - j); w += n - j; }
  return s / w;
});
function rsi(c: number[], n = 14): number[] {
  const up = c.map((x, i) => (i ? Math.max(0, x - c[i - 1]) : 0));
  const dn = c.map((x, i) => (i ? Math.max(0, c[i - 1] - x) : 0));
  const ru = rma(up, n), rd = rma(dn, n);
  return ru.map((u, i) => (isNaN(u) ? NaN : rd[i] === 0 ? 100 : 100 - 100 / (1 + u / rd[i])));
}
const highest = (v: number[], n: number, i: number) => Math.max(...v.slice(Math.max(0, i + 1 - n), i + 1));
const lowest = (v: number[], n: number, i: number) => Math.min(...v.slice(Math.max(0, i + 1 - n), i + 1));

export type RatingLabel = "Strong sell" | "Sell" | "Neutral" | "Buy" | "Strong buy";
export type TechnicalRating = { value: number; label: RatingLabel; ma: number; osc: number; counts: { buy: number; sell: number; neutral: number } };

export function ratingLabel(v: number): RatingLabel {
  return v > 0.5 ? "Strong buy" : v > 0.1 ? "Buy" : v >= -0.1 ? "Neutral" : v >= -0.5 ? "Sell" : "Strong sell";
}

export function technicalRating(bars: DailyBar[]): TechnicalRating | null {
  if (bars.length < 60) return null;
  const c = bars.map(b => b.close), h = bars.map(b => b.high), l = bars.map(b => b.low);
  const last = c.length - 1, close = c[last];
  const sig = (buy: boolean, sell: boolean) => (buy ? 1 : sell ? -1 : 0);
  const maVotes: number[] = [];
  const osc: number[] = [];

  // Moving averages: the price above the average is a buy
  for (const n of [10, 20, 30, 50, 100, 200]) {
    for (const series of [sma(c, n), ema(c, n)]) {
      const m = series[last];
      if (!isNaN(m)) maVotes.push(sig(m < close, m > close));
    }
  }
  // Volume-weighted MA (20) and Hull MA (9)
  if (bars.every(b => b.volume != null)) {
    const pv = bars.map(b => b.close * (b.volume as number)), vol = bars.map(b => b.volume as number);
    const vw = sma(pv, 20)[last] / sma(vol, 20)[last];
    if (isFinite(vw)) maVotes.push(sig(vw < close, vw > close));
  }
  {
    const w1 = wma(c, 4), w2 = wma(c, 9);
    const diff = c.map((_, i) => 2 * w1[i] - w2[i]);
    const hma = wma(diff.map(x => (isNaN(x) ? 0 : x)), 3)[last];
    if (isFinite(hma)) maVotes.push(sig(hma < close, hma > close));
  }
  // Ichimoku: base line under the price and the price above the cloud is a buy
  {
    const conv = (highest(h, 9, last) + lowest(l, 9, last)) / 2;
    const base = (highest(h, 26, last) + lowest(l, 26, last)) / 2;
    const i26 = last - 25;
    if (i26 > 52) {
      const leadA = ((highest(h, 9, i26) + lowest(l, 9, i26)) / 2 + (highest(h, 26, i26) + lowest(l, 26, i26)) / 2) / 2;
      const leadB = (highest(h, 52, i26) + lowest(l, 52, i26)) / 2;
      maVotes.push(sig(base < close && conv > base && close > Math.max(leadA, leadB), base > close && conv < base && close < Math.min(leadA, leadB)));
    }
  }

  // Oscillators
  const r = rsi(c);
  if (!isNaN(r[last])) osc.push(sig(r[last] < 30 && r[last] > r[last - 1], r[last] > 70 && r[last] < r[last - 1]));
  // Stochastic %K(14) smoothed 3, %D 3
  {
    const rawK = c.map((x, i) => { const hh = highest(h, 14, i), ll = lowest(l, 14, i); return hh === ll ? 50 : ((x - ll) / (hh - ll)) * 100; });
    const k = sma(rawK, 3), d = sma(k, 3);
    osc.push(sig(k[last] < 20 && d[last] < 20 && k[last] > d[last], k[last] > 80 && d[last] > 80 && k[last] < d[last]));
  }
  // CCI(20)
  {
    const tp = bars.map(b => (b.high + b.low + b.close) / 3);
    const cci = (i: number) => {
      const w = tp.slice(i - 19, i + 1); const m = w.reduce((a, b) => a + b, 0) / 20;
      const md = w.reduce((a, b) => a + Math.abs(b - m), 0) / 20;
      return md ? (tp[i] - m) / (0.015 * md) : 0;
    };
    const now = cci(last), prev = cci(last - 1);
    osc.push(sig(now < -100 && now > prev, now > 100 && now < prev));
  }
  // ADX(14) with the directional indicators
  {
    const tr = bars.map((b, i) => (i ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)) : b.high - b.low));
    const plusDM = bars.map((b, i) => { if (!i) return 0; const u = b.high - bars[i - 1].high, d = bars[i - 1].low - b.low; return u > d && u > 0 ? u : 0; });
    const minusDM = bars.map((b, i) => { if (!i) return 0; const u = b.high - bars[i - 1].high, d = bars[i - 1].low - b.low; return d > u && d > 0 ? d : 0; });
    const atr = rma(tr, 14), pdi = rma(plusDM, 14).map((x, i) => (100 * x) / atr[i]), mdi = rma(minusDM, 14).map((x, i) => (100 * x) / atr[i]);
    const dx = pdi.map((p, i) => (p + mdi[i] ? (100 * Math.abs(p - mdi[i])) / (p + mdi[i]) : 0));
    const adx = rma(dx.map(x => (isNaN(x) ? 0 : x)), 14);
    osc.push(sig(adx[last] > 20 && pdi[last - 1] < mdi[last - 1] && pdi[last] > mdi[last], adx[last] > 20 && pdi[last - 1] > mdi[last - 1] && pdi[last] < mdi[last]));
  }
  // Awesome oscillator
  {
    const mid = bars.map(b => (b.high + b.low) / 2);
    const ao = sma(mid, 5).map((x, i) => x - sma(mid, 34)[i]);
    osc.push(sig((ao[last] > 0 && ao[last - 1] < 0) || (ao[last] > 0 && ao[last] > ao[last - 1] && ao[last - 1] < ao[last - 2]),
      (ao[last] < 0 && ao[last - 1] > 0) || (ao[last] < 0 && ao[last] < ao[last - 1] && ao[last - 1] > ao[last - 2])));
  }
  // Momentum(10)
  {
    const mom = (i: number) => c[i] - c[i - 10];
    osc.push(sig(mom(last) > mom(last - 1), mom(last) < mom(last - 1)));
  }
  // MACD(12, 26, 9)
  {
    const m = ema(c, 12).map((x, i) => x - ema(c, 26)[i]);
    const sigLine = ema(m.map(x => (isNaN(x) ? 0 : x)), 9);
    osc.push(sig(m[last] > sigLine[last], m[last] < sigLine[last]));
  }
  // Stochastic RSI (3, 3, 14, 14)
  {
    const rr = r.map(x => (isNaN(x) ? 50 : x));
    const raw = rr.map((x, i) => { const hh = highest(rr, 14, i), ll = lowest(rr, 14, i); return hh === ll ? 50 : ((x - ll) / (hh - ll)) * 100; });
    const k = sma(raw, 3), d = sma(k, 3);
    osc.push(sig(k[last] < 20 && d[last] < 20 && k[last] > d[last], k[last] > 80 && d[last] > 80 && k[last] < d[last]));
  }
  // Williams %R(14)
  {
    const wr = (i: number) => { const hh = highest(h, 14, i), ll = lowest(l, 14, i); return hh === ll ? -50 : ((hh - c[i]) / (hh - ll)) * -100; };
    osc.push(sig(wr(last) < -80 && wr(last) > wr(last - 1), wr(last) > -20 && wr(last) < wr(last - 1)));
  }
  // Bull Bear Power (13)
  {
    const e = ema(c, 13);
    const bbp = (i: number) => (h[i] - e[i]) + (l[i] - e[i]);
    const up = e[last] > e[last - 1];
    osc.push(sig(up && bbp(last) < 0 && bbp(last) > bbp(last - 1), !up && bbp(last) > 0 && bbp(last) < bbp(last - 1)));
  }
  // Ultimate oscillator (7, 14, 28)
  {
    const bp = bars.map((b, i) => b.close - Math.min(b.low, i ? bars[i - 1].close : b.low));
    const tr = bars.map((b, i) => Math.max(b.high, i ? bars[i - 1].close : b.high) - Math.min(b.low, i ? bars[i - 1].close : b.low));
    const avg = (n: number) => bp.slice(-n).reduce((a, b) => a + b, 0) / (tr.slice(-n).reduce((a, b) => a + b, 0) || 1);
    const uo = (100 * (4 * avg(7) + 2 * avg(14) + avg(28))) / 7;
    osc.push(sig(uo > 70, uo < 30));
  }

  const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const ma = avg(maVotes), os = avg(osc);
  const value = (ma + os) / 2;
  const all = [...maVotes, ...osc];
  return {
    value, label: ratingLabel(value), ma, osc: os,
    counts: { buy: all.filter(v => v > 0).length, sell: all.filter(v => v < 0).length, neutral: all.filter(v => v === 0).length },
  };
}

// Each year's path: % change from its first close, by day of the year (0–365)
export type SeasonalYear = { year: number; points: { day: number; pct: number }[] };
export function seasonals(bars: DailyBar[], years = 3): SeasonalYear[] {
  if (!bars.length) return [];
  const lastYear = new Date(bars[bars.length - 1].time * 1000).getUTCFullYear();
  const out: SeasonalYear[] = [];
  for (let y = lastYear; y > lastYear - years; y--) {
    const yb = bars.filter(b => new Date(b.time * 1000).getUTCFullYear() === y);
    if (yb.length < 2) continue;
    const base = yb[0].close;
    const start = Date.UTC(y, 0, 1) / 1000;
    out.push({ year: y, points: yb.map(b => ({ day: (b.time - start) / 86400, pct: ((b.close - base) / base) * 100 })) });
  }
  return out;
}

// % change over the usual periods, from the latest close
export function performance(bars: DailyBar[]): { period: string; pct: number }[] | null {
  if (bars.length < 2) return null;
  const now = bars[bars.length - 1];
  const DAY = 86400;
  const closeAtOrBefore = (t: number) => { let v = bars[0].close; for (const b of bars) { if (b.time <= t) v = b.close; else break; } return v; };
  const yearStart = Date.UTC(new Date(now.time * 1000).getUTCFullYear(), 0, 1) / 1000 - 1;
  return [
    ["1W", now.time - 7 * DAY], ["1M", now.time - 30 * DAY], ["3M", now.time - 91 * DAY],
    ["6M", now.time - 182 * DAY], ["YTD", yearStart], ["1Y", now.time - 365 * DAY],
  ].map(([period, t]) => {
    const past = closeAtOrBefore(t as number);
    return { period: period as string, pct: past ? ((now.close - past) / past) * 100 : 0 };
  });
}
