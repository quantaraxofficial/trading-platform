// Liquidity concepts beyond BSL / SSL, equal highs / lows and sweeps (./concepts), worked out from the
// chart's OHLC bars for the voice assistant's marks. Pure functions; bar indices. The rules:
//
//   Session liquidity   the Asia (20–00 New York), London (02–05) and New York (07–10) sessions' highs
//                       and lows of today and yesterday, and the previous month's high and low: stops
//                       rest beyond them. "Taken" once price traded through, else "resting"
//   Inducement (IDM)    after a break of structure, the first pullback (the leg's first minor swing
//                       the other way): early traders' stops sit beyond it, and price often takes them
//                       before reaching the real POI further on. "Swept" once taken
//   Trend line liquidity a trend line touched three times or more: the stops of everyone trading it
//                       sit just beyond it (below a rising line: sell-side, above a falling one: buy-side)
//   Liquidity voids     a fast one-way run (3+ candles, each closing past the last with little overlap):
//                       thin price that tends to be revisited. "Filled" once price traded back through it
//   Round numbers       the psychological levels nearest price (big figures and halves): orders cluster there
//   Draw on liquidity   external range liquidity (ERL: the dealing range's swing high and low, untaken)
//                       and internal range liquidity (IRL: the open FVGs inside it); the likely draw is
//                       the untaken ERL in the direction of the last break of structure

import { atr, swings, swingSize, marketStructure, type Bar, type Side, type Zone } from "./smc";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const unitOf = (bars: Bar[], from: number) => mean(atr(bars).slice(from)) || (bars[bars.length - 1].high - bars[bars.length - 1].low) || 1;
const line = (kind: string, side: Side, from: number, to: number, p: number, label: string, dashed = false): Zone =>
  ({ kind, side, from, to, top: p, bottom: p, label, shape: "line", dashed });

const nyFmt = typeof Intl !== "undefined" ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit" }) : null;
function ny(t: number): { min: number; day: string; month: string } {
  const p = Object.fromEntries(nyFmt!.formatToParts(new Date(t * 1000)).map(x => [x.type, x.value]));
  return { min: Number(p.hour) * 60 + Number(p.minute), day: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}` };
}
const spacing = (bars: Bar[]) => { const n = bars.length; return n > 21 ? (bars[n - 1].time - bars[n - 21].time) / 20 : 0; };

// taken after `from`: price traded beyond the level
const takenAfter = (bars: Bar[], i: number, side: "high" | "low", level: number) => {
  for (let j = i + 1; j < bars.length; j++) if (side === "high" ? bars[j].high > level : bars[j].low < level) return j;
  return -1;
};

// ---- session liquidity
export function sessionLiquidity(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (!nyFmt || last < 20) return [];
  const out: Zone[] = [];
  if (spacing(bars) <= 3600 + 1) {
    const SESSIONS = [{ name: "Asia", a: 20 * 60, b: 24 * 60 }, { name: "London", a: 2 * 60, b: 5 * 60 }, { name: "NY", a: 7 * 60, b: 10 * 60 }];
    type S = { name: string; key: string; first: number; lastI: number; hi: number; lo: number; hiI: number; loI: number };
    const found: S[] = [];
    let cur: S | null = null;
    for (let i = Math.max(0, last - 2000); i <= last; i++) {
      const t = ny(bars[i].time);
      const s = SESSIONS.find(x => t.min >= x.a && t.min < x.b);
      const key = s ? `${s.name}-${t.day}` : "";
      if (cur && cur.key !== key) { found.push(cur); cur = null; }
      if (!s) continue;
      const b = bars[i];
      if (!cur) cur = { name: s.name, key, first: i, lastI: i, hi: b.high, lo: b.low, hiI: i, loI: i };
      else { cur.lastI = i; if (b.high > cur.hi) { cur.hi = b.high; cur.hiI = i; } if (b.low < cur.lo) { cur.lo = b.low; cur.loI = i; } }
    }
    if (cur) found.push(cur);
    // the last two of each session (today's and yesterday's)
    for (const name of ["Asia", "London", "NY"]) {
      for (const s of found.filter(x => x.name === name).slice(-2)) {
        const hiTaken = takenAfter(bars, s.lastI, "high", s.hi), loTaken = takenAfter(bars, s.lastI, "low", s.lo);
        out.push(line("liq", "bear", s.hiI, hiTaken >= 0 ? hiTaken : last, s.hi, `${name} high · ${hiTaken >= 0 ? "taken" : "resting BSL"}`, hiTaken >= 0));
        out.push(line("liq", "bull", s.loI, loTaken >= 0 ? loTaken : last, s.lo, `${name} low · ${loTaken >= 0 ? "taken" : "resting SSL"}`, loTaken >= 0));
      }
    }
  }
  // the previous month's high and low
  const months = new Map<string, { hi: number; lo: number; hiI: number; loI: number; lastI: number }>();
  for (let i = 0; i <= last; i++) {
    const m = nyFmt ? ny(bars[i].time).month : new Date(bars[i].time * 1000).toISOString().slice(0, 7);
    const b = bars[i], cur = months.get(m);
    if (!cur) months.set(m, { hi: b.high, lo: b.low, hiI: i, loI: i, lastI: i });
    else { cur.lastI = i; if (b.high > cur.hi) { cur.hi = b.high; cur.hiI = i; } if (b.low < cur.lo) { cur.lo = b.low; cur.loI = i; } }
  }
  const list = Array.from(months.values());
  const pm = list.length >= 2 ? list[list.length - 2] : null;
  if (pm) {
    const hiT = takenAfter(bars, pm.lastI, "high", pm.hi), loT = takenAfter(bars, pm.lastI, "low", pm.lo);
    out.push(line("key", "bear", pm.hiI, last, pm.hi, `PMH · ${hiT >= 0 ? "taken" : "resting"}`, true));
    out.push(line("key", "bull", pm.loI, last, pm.lo, `PML · ${loT >= 0 ? "taken" : "resting"}`, true));
  }
  return out.filter(z => z.to >= from || z.from >= from);
}

// ---- inducement (IDM)
export function inducement(bars: Bar[], from: number, max = 4): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const out: Zone[] = [];
  for (const s of marketStructure(bars, from, { max: 40 })) {
    const brk = s.to, bull = s.side === "bull";
    // the first pullback after the break: the first bar whose low (high) holds below the next ones,
    // i.e. the leg's first minor swing the other way (2 bars each side)
    for (let i = brk + 1; i <= Math.min(last - 2, brk + 30); i++) {
      const p = bull ? bars[i].low : bars[i].high;
      const isSwing = [i - 1, i + 1, i + 2].every(j => j <= last && (bull ? bars[j].low >= p : bars[j].high <= p));
      if (!isSwing) continue;
      const swept = takenAfter(bars, i + 2, bull ? "low" : "high", p);
      out.push(line("idm", bull ? "bull" : "bear", i, swept >= 0 ? swept : last, p, `IDM · ${swept >= 0 ? "swept" : "not taken yet"}`, swept >= 0));
      break;
    }
  }
  return out.slice(-max);
}

// ---- trend line liquidity (3+ touches)
export function trendlineLiquidity(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 30) return [];
  const unit = unitOf(bars, from);
  const k = Math.max(2, swingSize(last - from) - 1);
  const { highs, lows } = swings(bars, k, from, last);
  const out: Zone[] = [];
  for (const up of [true, false]) {
    const pts = up ? lows : highs;
    const px = (i: number) => (up ? bars[i].low : bars[i].high);
    let best: { i: number; slope: number; touches: number; broke: number } | null = null;
    for (let b = pts.length - 1; b > 0 && !best; b--) for (let a = b - 1; a >= 0; a--) {
      const i = pts[a], j = pts[b];
      if (up ? px(j) <= px(i) : px(j) >= px(i)) continue;
      const slope = (px(j) - px(i)) / (j - i);
      const touches = pts.filter(t => t >= i && Math.abs(px(t) - (px(i) + slope * (t - i))) <= unit * 0.15).length;
      if (touches < 3) continue;
      // broken: the first close beyond it (its liquidity taken)
      let broke = -1;
      for (let x = i; x <= last; x++) { const at = px(i) + slope * (x - i); if (up ? bars[x].close < at - unit * 0.1 : bars[x].close > at + unit * 0.1) { broke = x; break; } }
      if (broke >= 0 && broke < j) continue;
      best = { i, slope, touches, broke };
      break;
    }
    if (!best) continue;
    const end = best.broke >= 0 ? best.broke : last;
    out.push({ kind: "liq", side: up ? "bull" : "bear", from: best.i, to: end, top: px(best.i), bottom: px(best.i) + best.slope * (end - best.i), shape: "line",
      dashed: best.broke >= 0, label: `${up ? "Rising" : "Falling"} trend line liquidity · ${best.touches} touches · ${best.broke >= 0 ? "taken" : up ? "SSL below" : "BSL above"}` });
  }
  return out;
}

// ---- liquidity voids
export function liquidityVoids(bars: Bar[], from: number, max = 5): Zone[] {
  const last = bars.length - 1;
  if (last - from < 20) return [];
  const a = atr(bars);
  const out: Zone[] = [];
  let i = Math.max(from, 1);
  while (i < last - 2) {
    const dir = Math.sign(bars[i].close - bars[i].open);
    let j = i;
    while (j + 1 <= last) {
      const b = bars[j + 1], p = bars[j];
      const sameDir = Math.sign(b.close - b.open) === dir;
      const thin = dir > 0 ? b.low >= (p.open + p.close) / 2 : b.high <= (p.open + p.close) / 2;
      const strong = Math.abs(b.close - b.open) >= a[j + 1] * 0.6;
      if (!sameDir || !thin || !strong) break;
      j++;
    }
    if (j - i + 1 >= 3 && Math.abs(bars[i].close - bars[i].open) >= a[i] * 0.6) {
      const lo = dir > 0 ? bars[i].open : bars[j].close, hi = dir > 0 ? bars[j].close : bars[i].open;
      // filled once price traded back through the whole of it
      let filled = false;
      for (let x = j + 1; x <= last && !filled; x++) if (dir > 0 ? bars[x].low <= lo : bars[x].high >= hi) filled = true;
      out.push({ kind: "void", side: dir > 0 ? "bull" : "bear", from: i, to: filled ? j + 1 : last, top: hi, bottom: lo, extend: !filled,
        label: `Liquidity void · ${filled ? "filled" : "open"}` });
      i = j + 1;
    } else i++;
  }
  return out.slice(-max);
}

// ---- round numbers
export function roundNumbers(bars: Bar[], from: number, perSide = 2): Zone[] {
  const last = bars.length - 1;
  const price = bars[last].close;
  const unit = unitOf(bars, from);
  // a step that gives levels a few ATRs apart: 1, 2.5, 5 × a power of ten
  let step = 1;
  const want = unit * 4;
  const p10 = Math.pow(10, Math.floor(Math.log10(want)));
  for (const m of [1, 2.5, 5, 10]) { step = m * p10; if (step >= want) break; }
  const big = step * 2;   // (every other one: the big figure)
  const out: Zone[] = [];
  const below = Math.floor(price / step) * step;
  for (let n = 0; n < perSide; n++) {
    for (const [lvl, side] of [[below - n * step, "bull"], [below + (n + 1) * step, "bear"]] as [number, Side][]) {
      const dec = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
      out.push(line("round", side, Math.max(from, last - 60), last, lvl, `Round number ${lvl.toFixed(dec)}${Math.abs(lvl / big - Math.round(lvl / big)) < 1e-9 ? " (big figure)" : ""}`, true));
    }
  }
  return out;
}

// ---- draw on liquidity: ERL and IRL
export function drawOnLiquidity(bars: Bar[], from: number): Zone[] {
  const last = bars.length - 1;
  if (last - from < 30) return [];
  const unit = unitOf(bars, from);
  const k = swingSize(last - from);
  const { highs, lows } = swings(bars, k, from, last);
  if (!highs.length || !lows.length) return [];
  // the dealing range: the highest untaken swing high and lowest untaken swing low of the window
  const untakenHigh = highs.filter(i => takenAfter(bars, i, "high", bars[i].high) < 0).sort((a, b) => bars[b].high - bars[a].high)[0];
  const untakenLow = lows.filter(i => takenAfter(bars, i, "low", bars[i].low) < 0).sort((a, b) => bars[a].low - bars[b].low)[0];
  const structure = marketStructure(bars, from, { max: 1 })[0];
  const bias: Side | null = structure ? structure.side : null;
  const out: Zone[] = [];
  if (untakenHigh !== undefined) out.push(line("erl", "bear", untakenHigh, last, bars[untakenHigh].high, `ERL · buy-side${bias === "bull" ? " · likely draw" : ""}`, bias !== "bull"));
  if (untakenLow !== undefined) out.push(line("erl", "bull", untakenLow, last, bars[untakenLow].low, `ERL · sell-side${bias === "bear" ? " · likely draw" : ""}`, bias !== "bear"));
  const hi = untakenHigh !== undefined ? bars[untakenHigh].high : Infinity, lo = untakenLow !== undefined ? bars[untakenLow].low : -Infinity;
  // IRL: open FVGs inside the range
  for (let i = Math.max(from, 1); i < last; i++) {
    const a = bars[i - 1], c = bars[i + 1];
    const bull = c.low > a.high && c.low - a.high >= unit * 0.15, bear = c.high < a.low && a.low - c.high >= unit * 0.15;
    if (!bull && !bear) continue;
    const top = bull ? c.low : a.low, bottom = bull ? a.high : c.high;
    if (top > hi || bottom < lo) continue;
    let filled = false;
    for (let j = i + 2; j <= last && !filled; j++) if (bull ? bars[j].low <= bottom : bars[j].high >= top) filled = true;
    if (!filled) out.push({ kind: "irl", side: bull ? "bull" : "bear", from: i - 1, to: last, top, bottom, label: "IRL · open FVG" });
  }
  const irl = out.filter(z => z.kind === "irl");
  return [...out.filter(z => z.kind !== "irl"), ...irl.slice(-4)];
}
