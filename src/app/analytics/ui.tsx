"use client";

// Analytics' building blocks, in TradePilot's look (the landing / login pages): glassy dark cards
// with purple borders, purple → indigo accents, green / red for profit and loss.

import React, { useMemo, useRef, useState } from "react";
import type { EquityPoint } from "./stats";

export function Card({ title, subtitle, right, children, className = "", pad = true }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={`bg-black/50 backdrop-blur-xl border border-purple-800/40 rounded-2xl shadow-2xl shadow-purple-950/40 ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-white font-semibold text-[15px]">{title}</h3>}
            {subtitle && <p className="text-purple-300/70 text-xs mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Pills<T extends string>({ value, options, onChange, size = "md", testId }: {
  value: T; options: { id: T; label: React.ReactNode }[]; onChange: (v: T) => void; size?: "sm" | "md"; testId?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-purple-950/40 border border-purple-800/40" role="tablist" data-testid={testId}>
      {options.map(o => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)} data-value={o.id}
          className={`${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} rounded-lg font-medium whitespace-nowrap transition-all ${value === o.id
            ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/25"
            : "text-purple-300 hover:text-white hover:bg-purple-800/30"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/70">{children}</div>;
}

export function Kpi({ label, value, valueClass = "text-white", sub, icon, children, testId }: {
  label: string; value: React.ReactNode; valueClass?: string; sub?: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode; testId?: string;
}) {
  return (
    <div className="relative p-5 min-w-0" data-testid={testId}>
      <div className="flex items-center gap-2">
        {icon && <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/30 to-indigo-600/30 border border-purple-700/40 flex items-center justify-center text-purple-300">{icon}</span>}
        <Label>{label}</Label>
      </div>
      <div className={`mt-2 text-[28px] leading-8 font-bold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-purple-300/70">{sub}</div>}
      {children}
    </div>
  );
}

export function MiniStat({ label, value, valueClass = "text-white" }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="px-4 py-3 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-300/60 whitespace-nowrap">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

export function Empty({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-10 text-purple-300/70 text-sm">
      {icon && <div className="w-12 h-12 rounded-2xl bg-purple-900/30 border border-purple-800/40 flex items-center justify-center text-purple-400">{icon}</div>}
      {children}
    </div>
  );
}

// A horizontal two-part bar (e.g. winners vs losers)
export function SplitBar({ a, b, aClass = "bg-emerald-500", bClass = "bg-rose-500" }: { a: number; b: number; aClass?: string; bClass?: string }) {
  const total = a + b;
  return (
    <div className="h-2.5 w-full rounded-full overflow-hidden bg-purple-950/60 flex">
      {total > 0 && <div className={`${aClass} h-full`} style={{ width: `${(a / total) * 100}%` }} />}
      {total > 0 && <div className={`${bClass} h-full`} style={{ width: `${(b / total) * 100}%` }} />}
    </div>
  );
}

// The equity curve (or its drawdown below the peak), with the value under the pointer
export function EquityChart({ points, mode, format, height = 260 }: { points: EquityPoint[]; mode: "equity" | "drawdown"; format: (v: number) => string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = height, PAD_T = 12, PAD_B = 22;
  const values = points.map(p => (mode === "equity" ? p.equity : p.drawdown));
  const { min, max } = useMemo(() => {
    if (!values.length) return { min: 0, max: 1 };
    let lo = Math.min(...values), hi = Math.max(...values);
    if (mode === "drawdown") hi = 0;
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08;
    return { min: lo - (mode === "drawdown" ? pad : pad), max: hi + (mode === "drawdown" ? 0 : pad) };
  }, [values, mode]);
  if (points.length < 2) return null;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const base = mode === "drawdown" ? y(0) : H - PAD_B;
  const area = `${line} L${W},${base} L0,${base} Z`;
  const up = mode === "equity" ? values[values.length - 1] >= values[0] : false;
  const stroke = mode === "drawdown" ? "#fb7185" : up ? "#34d399" : "#fb7185";
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => PAD_T + f * (H - PAD_T - PAD_B));
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)))));
  };
  const hp = hover != null ? points[hover] : null;
  return (
    <div className="relative" data-testid="equity-chart">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block" style={{ height: H }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`eq-${mode}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={mode === "drawdown" ? 0.05 : 0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={mode === "drawdown" ? 0.35 : 0.02} />
          </linearGradient>
        </defs>
        {grid.map((g, i) => <line key={i} x1={0} x2={W} y1={g} y2={g} stroke="rgba(168,85,247,0.12)" vectorEffect="non-scaling-stroke" />)}
        <path d={area} fill={`url(#eq-${mode})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} stroke="rgba(216,180,254,0.5)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="absolute left-0 top-1 text-[10px] text-purple-300/60 tabular-nums">{format(max)}</div>
      <div className="absolute left-0 bottom-6 text-[10px] text-purple-300/60 tabular-nums">{format(min)}</div>
      {hp && (
        <div className="absolute top-2 pointer-events-none px-3 py-2 rounded-lg bg-black/80 border border-purple-700/50 text-xs text-white shadow-xl"
          style={{ left: `min(calc(${(hover! / (points.length - 1)) * 100}% + 8px), calc(100% - 170px))` }}>
          <div className="text-purple-300/80">{new Date(hp.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
          <div className="font-semibold tabular-nums">{mode === "equity" ? format(hp.equity) : `${format(hp.drawdown)}${hp.drawdownPct != null ? ` (${hp.drawdownPct.toFixed(2)}%)` : ""}`}</div>
        </div>
      )}
    </div>
  );
}

// Bars from a zero line, green up / red down (e.g. P&L by weekday)
export function PnlBars({ items, format }: { items: { label: string; value: number; sub?: string }[]; format: (v: number) => string }) {
  const maxAbs = Math.max(1e-9, ...items.map(i => Math.abs(i.value)));
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(i => (
        <div key={i.label} className="flex flex-col items-center gap-1 min-w-0">
          <div className="relative w-full h-28 flex flex-col">
            <div className="flex-1 flex items-end justify-center">{i.value > 0 && <div className="w-3/5 max-w-[34px] rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400" style={{ height: `${(i.value / maxAbs) * 100}%` }} />}</div>
            <div className="h-px bg-purple-700/50" />
            <div className="flex-1 flex items-start justify-center">{i.value < 0 && <div className="w-3/5 max-w-[34px] rounded-b-md bg-gradient-to-b from-rose-600 to-rose-400" style={{ height: `${(-i.value / maxAbs) * 100}%` }} />}</div>
          </div>
          <div className="text-xs font-medium text-purple-200">{i.label}</div>
          <div className={`text-[11px] tabular-nums ${i.value > 0 ? "text-emerald-400" : i.value < 0 ? "text-rose-400" : "text-purple-300/50"}`}>{i.sub ?? (i.value ? format(i.value) : "—")}</div>
        </div>
      ))}
    </div>
  );
}

export function Ring({ value, max = 100, size = 96, label }: { value: number; max?: number; size?: number; label?: React.ReactNode }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, value / max));
  const color = f >= 0.7 ? "#34d399" : f >= 0.4 ? "#a78bfa" : "#fb7185";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(88,28,135,0.45)" strokeWidth={7} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={7} fill="none" strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-white tabular-nums">{Math.round(value)}</div>
        {label && <div className="text-[10px] text-purple-300/70">{label}</div>}
      </div>
    </div>
  );
}
