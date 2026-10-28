// Exports from Analytics: the trades as CSV (with their journal), and a PDF performance report —
// headline figures, the equity curve, long / short, days, sessions, symbols, the full stats table
// and every trade. The PDF is written here directly (standard Helvetica, vector drawing), so no
// library is needed and the file is a real PDF, not a print of the page.

import { CHECKLIST, type ATrade, type Journal } from "./data";
import { computeStats, duration, money, type Stats } from "./stats";

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "export";
const iso = (ms: number | null) => (ms == null ? "" : new Date(ms).toISOString().replace("T", " ").slice(0, 19));

// ---------------- CSV ----------------

export function tradesCsv(trades: ATrade[], journals: Record<string, Journal> = {}): string {
  const head = ["Exit time (UTC)", "Entry time (UTC)", "Symbol", "Side", "Quantity", "Entry price", "Exit price", "Net P&L", "Commission", "Swap",
    "Duration (min)", "Run-up", "Drawdown", "Status", "Signal / comment", "Pre-trade analysis", "Post-trade review", "Emotions", "Lessons learned",
    "R:R notes", "Tags", ...CHECKLIST.map(c => c.label), "Rating"];
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...trades].sort((a, b) => (a.exitTime ?? a.entryTime) - (b.exitTime ?? b.entryTime)).map(t => {
    const j = journals[t.key];
    return [iso(t.exitTime), iso(t.entryTime), t.symbol, t.side, t.qty, t.entryPrice, t.exitPrice ?? "", t.open ? "" : t.pnl.toFixed(2),
      t.commission.toFixed(2), t.swap.toFixed(2), t.exitTime ? Math.round((t.exitTime - t.entryTime) / 60000) : "",
      t.runUp ?? "", t.drawdown ?? "", t.open ? "open" : t.pnl > 0 ? "win" : t.pnl < 0 ? "loss" : "breakeven", t.signal ?? "",
      j?.pre_trade ?? "", j?.post_trade ?? "", j?.emotions ?? "", j?.lessons ?? "", j?.rr_notes ?? "", (j?.tags || []).join("; "),
      ...CHECKLIST.map(c => (j ? (j.checklist?.[c.key] ? "yes" : "no") : "")), j?.rating ?? ""].map(cell).join(",");
  });
  return [head.map(cell).join(","), ...rows].join("\r\n");
}

export function downloadTradesCsv(name: string, trades: ATrade[], journals?: Record<string, Journal>) {
  // (with a byte-order mark, so Excel reads it as UTF-8)
  download(`${fileSafe(name)}-trades.csv`, new Blob(["﻿" + tradesCsv(trades, journals)], { type: "text/csv;charset=utf-8" }));
}

// ---------------- a small PDF writer ----------------

// Helvetica's character widths (1/1000 em), for measuring text: ASCII 32–126
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
  667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556,
  333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const REPLACE: Record<string, string> = { "→": "->", "←": "<-", "·": "-", "−": "-", "—": "-", "–": "-", "…": "...", "’": "'", "‘": "'", "“": '"', "”": '"', "×": "x", "∞": "inf" };
// Text the standard fonts can show (Latin-1), everything else replaced
export function pdfText(s: string) {
  return Array.from(s).map(ch => REPLACE[ch] ?? (ch.charCodeAt(0) < 256 ? ch : "?")).join("");
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const f = (n: number) => (Math.round(n * 100) / 100).toString();

export class Pdf {
  readonly W = 595.28; readonly H = 841.89;   // A4, points
  private pages: string[] = [];
  private cur = "";
  constructor() { this.addPage(); }
  addPage() { if (this.cur) this.pages.push(this.cur); this.cur = ""; }
  width(text: string, size: number, bold = false) {
    let w = 0;
    for (const ch of pdfText(text)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? HELV[c - 32] : 556; }
    return (w / 1000) * size * (bold ? 1.06 : 1);
  }
  fit(text: string, size: number, maxW: number, bold = false) {
    let t = pdfText(text);
    if (this.width(t, size, bold) <= maxW) return t;
    while (t.length > 1 && this.width(t + "...", size, bold) > maxW) t = t.slice(0, -1);
    return t + "...";
  }
  // y is from the top of the page
  text(x: number, y: number, s: string, size = 10, opts: { bold?: boolean; color?: string; align?: "left" | "right" | "center" } = {}) {
    const t = pdfText(s);
    const w = this.width(t, size, opts.bold);
    const tx = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
    const [r, g, b] = hex(opts.color || "#111827");
    const esc = t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    this.cur += `BT /${opts.bold ? "F2" : "F1"} ${f(size)} Tf ${f(r)} ${f(g)} ${f(b)} rg ${f(tx)} ${f(this.H - y)} Td (${esc}) Tj ET\n`;
  }
  rect(x: number, y: number, w: number, h: number, opts: { fill?: string; stroke?: string; lw?: number } = {}) {
    let op = "";
    if (opts.fill) { const [r, g, b] = hex(opts.fill); op += `${f(r)} ${f(g)} ${f(b)} rg `; }
    if (opts.stroke) { const [r, g, b] = hex(opts.stroke); op += `${f(r)} ${f(g)} ${f(b)} RG ${f(opts.lw ?? 0.6)} w `; }
    this.cur += `${op}${f(x)} ${f(this.H - y - h)} ${f(w)} ${f(h)} re ${opts.fill && opts.stroke ? "B" : opts.fill ? "f" : "S"}\n`;
  }
  line(pts: [number, number][], color: string, lw = 1, close = false, fill?: string) {
    if (pts.length < 2) return;
    const [r, g, b] = hex(color);
    let path = `${f(pts[0][0])} ${f(this.H - pts[0][1])} m ` + pts.slice(1).map(([x, y]) => `${f(x)} ${f(this.H - y)} l`).join(" ");
    if (fill) {
      const [fr, fg, fb] = hex(fill);
      this.cur += `q ${f(fr)} ${f(fg)} ${f(fb)} rg ${path} h f Q\n`;
    }
    if (lw > 0) this.cur += `${f(r)} ${f(g)} ${f(b)} RG ${f(lw)} w 1 j ${path}${close ? " h" : ""} S\n`;
  }
  output(): Blob {
    this.addPage();
    const objs: string[] = [];
    const add = (s: string) => { objs.push(s); return objs.length; };
    add("<< /Type /Catalog /Pages 2 0 R >>");
    add("");   // pages, filled in below
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids: number[] = [];
    for (const content of this.pages) {
      const c = add(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(this.W)} ${f(this.H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    // one byte per character (everything is Latin-1 by now)
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: "application/pdf" });
  }
}

// ---------------- the performance report ----------------

const PURPLE = "#6d28d9", INK = "#111827", MUTED = "#6b7280", GREEN = "#059669", RED = "#e11d48", LINE = "#e5e7eb", TINT = "#f5f3ff";
const tone = (v: number) => (v > 0.004 ? GREEN : v < -0.004 ? RED : INK);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function performancePdf(opts: { title: string; subtitle: string; trades: ATrade[]; currency?: string; initialBalance?: number }): Blob {
  const { title, subtitle, trades } = opts;
  const cur = opts.currency || "USD";
  const s: Stats = computeStats(trades, opts.initialBalance || 0);
  const m = (v: number, signed = false) => money(v, cur, signed);
  const pdf = new Pdf();
  const L = 40, R = pdf.W - 40, CW = R - L;
  let page = 1;
  const footer = () => {
    pdf.text(L, pdf.H - 22, `TradePilot · ${title}`, 8, { color: MUTED });
    pdf.text(R, pdf.H - 22, `Page ${page}`, 8, { color: MUTED, align: "right" });
  };
  const newPage = () => { footer(); pdf.addPage(); page++; return 50; };

  // Header
  pdf.rect(0, 0, pdf.W, 92, { fill: PURPLE });
  pdf.text(L, 40, "TradePilot", 11, { bold: true, color: "#ddd6fe" });
  pdf.text(L, 64, pdf.fit(title, 20, CW, true), 20, { bold: true, color: "#ffffff" });
  pdf.text(L, 82, pdf.fit(subtitle, 9.5, CW), 9.5, { color: "#ede9fe" });
  pdf.text(R, 40, `Generated ${new Date().toLocaleString()}`, 8.5, { color: "#ddd6fe", align: "right" });

  // Headline figures
  let y = 112;
  const kpis: [string, string, string][] = [
    ["Total P&L", m(s.totalPnl, true), tone(s.totalPnl)], ["Win rate", `${s.winRate.toFixed(1)}%`, INK],
    ["Profit factor", Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "inf", INK], ["Expectancy", m(s.expectancy, true), tone(s.expectancy)],
    ["Closed trades", `${s.count}`, INK], ["Max drawdown", m(s.maxDrawdown), s.maxDrawdown < 0 ? RED : INK],
    ["Avg winner / loser", `${m(s.avgWin)} / ${m(s.avgLoss)}`, INK], ["Risk : reward", `1:${s.riskReward.toFixed(2)}`, INK],
  ];
  const bw = (CW - 3 * 8) / 4;
  kpis.forEach(([label, value, color], i) => {
    const x = L + (i % 4) * (bw + 8), yy = y + Math.floor(i / 4) * 56;
    pdf.rect(x, yy, bw, 48, { fill: TINT, stroke: "#ddd6fe" });
    pdf.text(x + 10, yy + 16, label.toUpperCase(), 7.5, { bold: true, color: MUTED });
    pdf.text(x + 10, yy + 36, pdf.fit(value, 13, bw - 20, true), 13, { bold: true, color });
  });
  y += 56 * 2 + 10;

  // Equity curve
  pdf.text(L, y + 10, "Equity curve", 12, { bold: true, color: INK });
  pdf.text(R, y + 10, `${s.count} closed trades`, 8.5, { color: MUTED, align: "right" });
  y += 18;
  const ch = 170;
  pdf.rect(L, y, CW, ch, { stroke: LINE });
  if (s.equity.length >= 2) {
    const vals = s.equity.map(p => p.equity);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const px = (i: number) => L + 8 + (i / (vals.length - 1)) * (CW - 16);
    const py = (v: number) => y + 10 + (1 - (v - lo) / (hi - lo)) * (ch - 26);
    for (let g = 0; g <= 4; g++) pdf.line([[L, y + 10 + (g / 4) * (ch - 26)], [R, y + 10 + (g / 4) * (ch - 26)]], "#f3f4f6", 0.5);
    const pts = vals.map((v, i) => [px(i), py(v)] as [number, number]);
    const up = vals[vals.length - 1] >= vals[0];
    pdf.line([...pts, [px(vals.length - 1), y + ch - 16], [px(0), y + ch - 16]], up ? GREEN : RED, 0, true, up ? "#d1fae5" : "#ffe4e6");
    pdf.line(pts, up ? GREEN : RED, 1.4);
    pdf.text(L + 6, y + 9, m(hi), 7, { color: MUTED });
    pdf.text(L + 6, y + ch - 4, m(lo), 7, { color: MUTED });
    pdf.text(R - 6, y + ch - 4, new Date(s.equity[s.equity.length - 1].time).toLocaleDateString(), 7, { color: MUTED, align: "right" });
  } else {
    pdf.text(L + CW / 2, y + ch / 2, "Not enough closed trades for a curve", 10, { color: MUTED, align: "center" });
  }
  y += ch + 22;

  // Three small tables: direction, weekday, session
  const colW = (CW - 2 * 14) / 3;
  const small = (x: number, title: string, rows: [string, string, number][]) => {
    pdf.text(x, y, title, 11, { bold: true });
    rows.forEach(([a, b, v], i) => {
      const yy = y + 18 + i * 16;
      pdf.text(x, yy, a, 9, { color: MUTED });
      pdf.text(x + colW, yy, b, 9, { bold: true, color: tone(v), align: "right" });
      pdf.line([[x, yy + 5], [x + colW, yy + 5]], "#f3f4f6", 0.5);
    });
  };
  small(L, "Long vs short", [
    [`Long · ${s.long.count} trades · ${s.long.count ? ((s.long.wins / s.long.count) * 100).toFixed(0) : 0}% won`, m(s.long.pnl, true), s.long.pnl],
    [`Short · ${s.short.count} trades · ${s.short.count ? ((s.short.wins / s.short.count) * 100).toFixed(0) : 0}% won`, m(s.short.pnl, true), s.short.pnl],
    ["Gross profit", m(s.grossProfit), s.grossProfit], ["Gross loss", m(s.grossLoss), s.grossLoss],
  ]);
  small(L + colW + 14, "By weekday (exit)", s.weekdays.map((b, i) => [`${WEEKDAYS[i]} · ${b.count}`, b.count ? m(b.pnl, true) : "-", b.pnl] as [string, string, number]));
  small(L + 2 * (colW + 14), "By session (entry, UTC)", (Object.entries(s.sessions) as [string, Stats["long"]][]).map(([n, b]) => [`${n} · ${b.count}`, b.count ? m(b.pnl, true) : "-", b.pnl] as [string, string, number]));
  y += 18 + 7 * 16 + 14;

  // Top symbols
  if (y > pdf.H - 140) y = newPage();
  pdf.text(L, y, "Top symbols", 11, { bold: true });
  y += 18;
  s.symbols.slice(0, 6).forEach(sym => {
    pdf.text(L, y, pdf.fit(sym.symbol, 9, 160), 9, { bold: true });
    pdf.text(L + 170, y, `${sym.count} trades · ${((sym.wins / sym.count) * 100).toFixed(0)}% won`, 9, { color: MUTED });
    pdf.text(R, y, m(sym.pnl, true), 9, { bold: true, color: tone(sym.pnl), align: "right" });
    pdf.line([[L, y + 5], [R, y + 5]], "#f3f4f6", 0.5);
    y += 16;
  });
  if (!s.symbols.length) { pdf.text(L, y, "No closed trades", 9, { color: MUTED }); y += 16; }

  // The full stats table
  y = newPage();
  pdf.text(L, y, "Your stats", 14, { bold: true });
  y += 22;
  const stats: [string, string][] = [
    ["Total P&L", m(s.totalPnl, true)], ["Total number of trades", `${s.count}`], ["Winning / losing / breakeven trades", `${s.wins} / ${s.losses} / ${s.breakeven}`],
    ["Win rate", `${s.winRate.toFixed(1)}%`], ["Profit factor", Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "inf"], ["Trade expectancy", m(s.expectancy, true)],
    ["Average winning trade", m(s.avgWin)], ["Average losing trade", m(s.avgLoss)], ["Largest profit", m(Math.max(0, s.best))], ["Largest loss", m(Math.min(0, s.worst))],
    ["Max consecutive wins", `${s.maxWinStreak}`], ["Max consecutive losses", `${s.maxLossStreak}`], ["Total commissions", m(s.commission)], ["Total swap", m(s.swap)],
    ["Avg hold time (all)", duration(s.avgHold)], ["Avg hold time (winners)", duration(s.avgHoldWin)], ["Avg hold time (losers)", duration(s.avgHoldLoss)],
    ["Open trades", `${s.openCount}`], ["Total trading days", `${s.tradingDays}`], ["Winning / losing / breakeven days", `${s.winningDays} / ${s.losingDays} / ${s.breakevenDays}`],
    ["Max consecutive winning days", `${s.maxWinDays}`], ["Max consecutive losing days", `${s.maxLossDays}`], ["Average daily P&L", m(s.avgDailyPnl, true)],
    ["Average winning day P&L", m(s.avgWinDayPnl)], ["Average losing day P&L", m(s.avgLossDayPnl)],
    ["Largest profitable day", s.bestDay && s.bestDay.pnl > 0 ? `${m(s.bestDay.pnl, true)} (${s.bestDay.day})` : "-"],
    ["Largest losing day", s.worstDay && s.worstDay.pnl < 0 ? `${m(s.worstDay.pnl, true)} (${s.worstDay.day})` : "-"],
    ["Best month", s.bestMonth ? `${m(s.bestMonth.pnl, true)} (${s.bestMonth.month})` : "-"], ["Worst month", s.worstMonth ? `${m(s.worstMonth.pnl, true)} (${s.worstMonth.month})` : "-"],
    ["Average per month", m(s.avgMonthPnl, true)], ["Average daily volume", `${+s.avgDailyVolume.toFixed(2)}`],
    ["Max drawdown", m(s.maxDrawdown)], ["Max drawdown %", s.maxDrawdownPct != null ? `${s.maxDrawdownPct.toFixed(2)}%` : "-"],
  ];
  const half = Math.ceil(stats.length / 2), sw = (CW - 24) / 2;
  stats.forEach(([a, b], i) => {
    const x = L + (i < half ? 0 : sw + 24), yy = y + (i % half) * 18;
    pdf.text(x, yy, a, 9, { color: MUTED });
    pdf.text(x + sw, yy, pdf.fit(b, 9, sw * 0.5, true), 9, { bold: true, align: "right" });
    pdf.line([[x, yy + 6], [x + sw, yy + 6]], "#f3f4f6", 0.5);
  });
  y += half * 18 + 26;

  // Every trade
  const cols: [string, number, "left" | "right"][] = [["Exit", 92, "left"], ["Symbol", 78, "left"], ["Side", 38, "left"], ["Qty", 46, "right"],
    ["Entry", 66, "right"], ["Exit price", 66, "right"], ["Duration", 58, "right"], ["Net P&L", CW - 444, "right"]];
  const header = () => {
    pdf.rect(L, y - 12, CW, 18, { fill: TINT });
    let x = L + 4;
    for (const [h, w, a] of cols) { pdf.text(a === "right" ? x + w - 8 : x, y, h, 8, { bold: true, color: PURPLE, align: a }); x += w; }
    y += 16;
  };
  if (y > pdf.H - 120) y = newPage();
  pdf.text(L, y, `Trades (${trades.length})`, 14, { bold: true });
  y += 24;
  header();
  const ordered = [...trades].sort((a, b) => (b.exitTime ?? b.entryTime) - (a.exitTime ?? a.entryTime));
  for (const t of ordered) {
    if (y > pdf.H - 50) { y = newPage(); header(); }
    const vals = [t.exitTime ? new Date(t.exitTime).toLocaleString([], { year: "2-digit", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "open",
      t.symbol, t.side, String(t.qty), String(t.entryPrice), t.exitPrice != null ? String(+t.exitPrice.toFixed(6)) : "-",
      duration(t.exitTime ? t.exitTime - t.entryTime : null), t.open ? "open" : m(t.pnl, true)];
    let x = L + 4;
    cols.forEach(([, w, a], i) => {
      const color = i === 7 && !t.open ? tone(t.pnl) : i === 2 ? (t.side === "long" ? GREEN : RED) : INK;
      pdf.text(a === "right" ? x + w - 8 : x, y, pdf.fit(vals[i], 8.5, w - 10, i === 7), 8.5, { align: a, color, bold: i === 7 });
      x += w;
    });
    pdf.line([[L, y + 5], [R, y + 5]], "#f3f4f6", 0.4);
    y += 15;
  }
  footer();
  return pdf.output();
}

export function downloadPerformancePdf(name: string, opts: Parameters<typeof performancePdf>[0]) {
  download(`${fileSafe(name)}-report.pdf`, performancePdf(opts));
}
