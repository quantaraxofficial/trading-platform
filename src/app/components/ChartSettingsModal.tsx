'use client';

// TradingView's chart Settings dialog: Symbol, Status line, Scales and lines, Canvas, Trading,
// Alerts and Events. Every change shows on the chart at once; Cancel (or Escape / ✕) puts
// everything back as it was when the dialog opened; Ok keeps it. Template: Apply defaults,
// Save as…, and the saved templates (each with a trash can on hover).

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import { useEscapeClose } from '../lib/useEscapeClose';
import { statusLine, type LegendTitleMode, type StatusLineSettings } from '../lib/statusLine';
import { tradingSettings, type TradingSettings, type PnlMode } from '@/app/trading/settings';
import { EXECUTION_SOUNDS, playExecutionSound } from '@/app/trading/sounds';
import { ColorPickerPopup } from './drawing/ui/ColorPickerPopup';
import { Tip } from '../trading/ui';
import {
  chartSettings, takeSnapshot, applySnapshot, defaultSnapshot, chartTemplates, saveTemplate, removeTemplate, syncTemplatesFromAccount, applyTemplate,
  VISIBILITY3, DATE_FORMATS, PRECISIONS, FONT_SIZES, type ChartSettings, type ColorLine, type ChartSettingsSnapshot,
} from '../lib/chartSettings';

export interface CandleColors {
  upColor: string; downColor: string; borderUpColor: string; borderDownColor: string; wickUpColor: string; wickDownColor: string;
  borderVisible: boolean; wickVisible: boolean; bodyVisible: boolean;
}
export interface CanvasColors { background: string; gridVert: string; gridHorz: string; crosshair: string; text: string; lines: string }

interface Props {
  theme: string;
  onClose: () => void;
  initialTab?: string;
  timezones: { label: string; tz: string }[];
  timezone: string;
  onTimezone: (tz: string) => void;
  onCommit?: () => void;        // Ok: the settings are final (e.g. save them to the account)
}

const TABS = [
  { id: 'symbol', label: 'Symbol' }, { id: 'legend', label: 'Status line' }, { id: 'scales', label: 'Scales and lines' },
  { id: 'canvas', label: 'Canvas' }, { id: 'trading', label: 'Trading' }, { id: 'alerts', label: 'Alerts' }, { id: 'events', label: 'Events' },
] as const;
const TAB_ALIASES: Record<string, string> = { status: 'legend', appearance: 'canvas' };

function TabIcon({ id }: { id: string }) {
  const p = { width: 28, height: 28, viewBox: '0 0 28 28', fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': true } as const;
  switch (id) {
    case 'symbol': return <svg {...p}><path d="M10 7v14M18 7v14" /><rect x="7.5" y="10.5" width="5" height="7" rx="1" /><rect x="15.5" y="12.5" width="5" height="5" rx="1" fill="currentColor" /></svg>;
    case 'legend': return <svg {...p}><path d="M7 9.5h14M7 13.5h14M7 17.5h9" /></svg>;
    case 'scales': return <svg {...p}><path d="M8.5 6v15.5H24" /><path d="M6 8.5l2.5-2.5L11 8.5M21.5 19L24 21.5 21.5 24" /><circle cx="8.5" cy="21.5" r="1.5" /></svg>;
    case 'canvas': return <svg {...p}><path d="M18.5 7.5l2 2L11 19l-3 1 1-3 9.5-9.5z" /><path d="M16.5 9.5l2 2" /></svg>;
    case 'trading': return <svg {...p}><path d="M6 19l5-5 4 3 7-7" /><path d="M18 10h4v4" /><path d="M6 22h16" /></svg>;
    case 'alerts': return <svg {...p}><circle cx="14" cy="15" r="7" /><path d="M14 11v4l2.5 2M8 8l2-2M20 8l-2-2" /></svg>;
    default: return <svg {...p}><rect x="7.5" y="8.5" width="13" height="12" rx="1.5" /><path d="M7.5 12.5h13M11 6.5v4M17 6.5v4" /></svg>;
  }
}

// ---- small controls ------------------------------------------------------
type Colors = { text: string; muted: string; border: string; field: string; hover: string; panel: string; checkOn: string; checkMark: string; disabledBg: string };

function Check({ c, checked, onChange, label, disabled, after }: { c: Colors; checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; disabled?: boolean; after?: React.ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, userSelect: 'none', minHeight: 34 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span aria-hidden style={{ width: 18, height: 18, borderRadius: 4, boxSizing: 'border-box', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: checked ? 'none' : `1px solid ${c.muted}`, background: checked ? c.checkOn : 'transparent' }}>
        {checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={c.checkMark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.4 2.4 4.6-5" /></svg>}
      </span>
      <span style={{ fontSize: 14 }}>{label}</span>
      {after}
    </label>
  );
}

function Help({ c, text, mark = '?' }: { c: Colors; text: string; mark?: string }) {
  return (
    <Tip text={text} placement="top" maxWidth={280}>
      <span aria-label={text} style={{ width: 16, height: 16, borderRadius: '50%', background: c.muted, color: c.panel, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, cursor: 'default' }}>{mark}</span>
    </Tip>
  );
}

const chevron = (open: boolean, color: string) => (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke={color} strokeWidth="1.3" style={{ transform: open ? 'rotate(180deg)' : undefined, flexShrink: 0 }} aria-hidden><path d="M5 7.5l4 4 4-4" /></svg>
);

// TradingView's dropdowns: a button with a list under it (one choice, or several ticks)
function Dropdown({ c, label, value, options, onChange, width = 150, disabled, multi, display }: {
  c: Colors; label: string; value: string; options: readonly (string | { value: string; label: string })[]; onChange: (v: string) => void; width?: number; disabled?: boolean;
  multi?: { checked: Record<string, boolean>; toggle: (k: string) => void }; display?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, maxH: 300, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const opts = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o));
  useEscapeClose(() => setOpen(false), open);   // Escape closes just the list
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!btn.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    return () => { document.removeEventListener('mousedown', onDown, true); };
  }, [open]);
  const toggleOpen = () => {
    if (disabled) return;
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      const up = below < 200 && above > below;
      setPos({ top: up ? r.top - 4 : r.bottom + 4, left: r.left, maxH: Math.min(360, up ? above : below), up });
    }
    setOpen(o => !o);
  };
  const shown = display ?? opts.find(o => o.value === value)?.label ?? value;
  return (
    <>
      <button ref={btn} type="button" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-disabled={disabled} onClick={toggleOpen}
        style={{ width, height: 34, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderRadius: 6, fontSize: 14, cursor: disabled ? 'default' : 'pointer',
          border: `1px solid ${open ? '#2962ff' : c.border}`, background: disabled ? c.disabledBg : 'transparent', color: c.text, opacity: disabled ? 0.5 : 1, fontFamily: 'inherit', textAlign: 'left' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shown}</span>
        {chevron(open, c.text)}
      </button>
      {open && createPortal(
        <div ref={list} role="listbox" aria-label={label} aria-multiselectable={!!multi}
          style={{ position: 'fixed', left: pos.left, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }), minWidth: width, maxHeight: pos.maxH, overflowY: 'auto',
            background: c.panel, color: c.text, borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,0.25)', padding: '4px 0', zIndex: 100002, fontSize: 14 }}>
          {opts.map(o => {
            const sel = multi ? !!multi.checked[o.value] : o.value === value;
            return (
              <div key={o.value} role="option" aria-selected={sel} onClick={() => { if (multi) multi.toggle(o.value); else { onChange(o.value); setOpen(false); } }}
                onMouseEnter={e => (e.currentTarget.style.background = c.hover)} onMouseLeave={e => (e.currentTarget.style.background = !multi && sel ? c.hover : 'transparent')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap', background: !multi && sel ? c.hover : 'transparent' }}>
                {multi && <span aria-hidden style={{ width: 18, height: 18, borderRadius: 4, boxSizing: 'border-box', border: sel ? 'none' : `1px solid ${c.muted}`, background: sel ? c.checkOn : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {sel && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={c.checkMark} strokeWidth="2" strokeLinecap="round"><path d="M2.5 6.2l2.4 2.4 4.6-5" /></svg>}
                </span>}
                {o.label}
              </div>
            );
          })}
        </div>, document.body)}
    </>
  );
}
const multiText = (labels: string[]) => (labels.length ? labels.map((l, i) => (i ? l.toLowerCase() : l)).join(', ') : 'Hidden');

// Colour swatches: a plain colour, or a colour with its line (thickness / style)
function Swatch({ c, color, onChange, label, disabled, line, onLine, wide, split }: {
  c: Colors; color: string; onChange: (v: string) => void; label: string; disabled?: boolean; wide?: boolean;
  line?: { width: number; style: string }; onLine?: (l: { width?: number; style?: string }) => void; split?: [string, string];
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => { if (!btn.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setPos(null); };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [pos]);
  const open = () => {
    if (disabled) return;
    if (pos) { setPos(null); return; }
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 440)), left: Math.min(r.left, window.innerWidth - 290) });
  };
  const checker = 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 8px 8px';
  const box = split
    ? <span style={{ width: 22, height: 22, borderRadius: 4, background: `linear-gradient(135deg, ${split[0]} 50%, ${split[1]} 50%)` }} />
    : <span style={{ position: 'relative', width: wide ? 22 : 22, height: 22, borderRadius: 4, overflow: 'hidden', background: checker }}><span style={{ position: 'absolute', inset: 0, background: color || 'transparent' }} /></span>;
  return (
    <>
      <button ref={btn} type="button" aria-label={label} onClick={open} disabled={disabled}
        style={{ height: 34, minWidth: 34, boxSizing: 'border-box', padding: '0 5px', display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
          border: `1px solid ${pos ? '#2962ff' : c.border}`, background: disabled ? c.disabledBg : 'transparent', opacity: disabled ? 0.5 : 1, width: line || wide ? 75 : 34 }}>
        {box}
        {line && <svg width="30" height="6" viewBox="0 0 30 6" aria-hidden><line x1="0" y1="3" x2="30" y2="3" stroke={c.text} strokeWidth={line.width} strokeDasharray={line.style === 'Dashed' ? '4 3' : line.style === 'Dotted' ? `${line.width} ${line.width * 2}` : undefined} /></svg>}
      </button>
      {pos && createPortal(
        <div ref={pop}>
          <ColorPickerPopup colorStr={color || '#2962ff'} onChange={onChange} onClose={() => setPos(null)}
            {...(line && onLine ? { thickness: line.width, onThicknessChange: (w: number) => onLine({ width: w }), lineStyle: line.style, onLineStyleChange: (s: string) => onLine({ style: s }) } : {})}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 100002 }} />
        </div>, document.body)}
    </>
  );
}

function NumberInput({ c, value, onChange, label, width = 100, disabled, min }: { c: Colors; value: number; onChange: (v: number) => void; label: string; width?: number; disabled?: boolean; min?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(t => (Number(t) === value ? t : String(value))); }, [value]);
  return (
    <input type="text" inputMode="decimal" aria-label={label} value={text} disabled={disabled}
      onChange={e => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== '' && isFinite(n) && (min === undefined || n >= min)) onChange(n); }}
      onBlur={() => setText(String(value))} onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
      style={{ width, height: 34, boxSizing: 'border-box', borderRadius: 6, border: `1px solid ${c.border}`, padding: '0 8px', fontSize: 14, outline: 'none',
        background: disabled ? c.disabledBg : 'transparent', color: disabled ? c.muted : c.text }} />
  );
}

// ---- the dialog ----------------------------------------------------------
export default function ChartSettingsModal({ theme, onClose, initialTab, timezones, timezone, onTimezone, onCommit }: Props) {
  const isDark = theme === 'dark';
  const c: Colors = isDark
    ? { text: '#dbdbdb', muted: '#8c8c8c', border: '#4a4a4a', field: '#1e1e1e', hover: '#2e2e2e', panel: '#1e1e1e', checkOn: '#dbdbdb', checkMark: '#1e1e1e', disabledBg: '#2a2a2a' }
    : { text: '#131722', muted: '#787b86', border: '#d1d4dc', field: '#ffffff', hover: '#f0f3fa', panel: '#ffffff', checkOn: '#131722', checkMark: '#ffffff', disabledBg: '#f0f3fa' };
  const [tab, setTab] = useState<string>(() => TAB_ALIASES[initialTab || ''] || initialTab || 'symbol');
  const s = chartSettings.useValue();
  const sl = statusLine.useValue();
  const tr = tradingSettings.useValue();
  const { user } = useAuth();
  const set = (patch: Partial<ChartSettings>) => chartSettings.set(patch);
  const setSl = (patch: Partial<StatusLineSettings>) => statusLine.set(patch);
  const setTr = (patch: Partial<TradingSettings>) => tradingSettings.set(patch);

  // What Cancel restores
  const snapRef = useRef<{ snap: ChartSettingsSnapshot; tz: string } | null>(null);
  if (!snapRef.current) snapRef.current = { snap: takeSnapshot(), tz: timezone };
  const cancel = () => { applySnapshot(snapRef.current!.snap); onTimezone(snapRef.current!.tz); onClose(); };
  const ok = () => { onCommit?.(); onClose(); };
  const [subDialog, setSubDialog] = useState(false);
  useEscapeClose(cancel, !subDialog);

  useEffect(() => { if (user?.uid) syncTemplatesFromAccount(user.uid); }, [user?.uid]);

  // Dragging by the title
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = boxRef.current!.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev: MouseEvent) => setPos({ x: Math.max(0, Math.min(window.innerWidth - 100, ev.clientX - dx)), y: Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - dy)) });
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };

  const section = (t: string, first = false) => <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', color: c.muted, margin: first ? '0 0 6px' : '22px 0 6px' }}>{t}</div>;
  const row = (labelW: number, label: React.ReactNode, ...controls: React.ReactNode[]) => (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 50, gap: 8 }}>
      <div style={{ width: labelW, flexShrink: 0, fontSize: 14 }}>{label}</div>
      {controls}
    </div>
  );
  const line = (children: React.ReactNode, indent = 0, h = 50) => <div style={{ display: 'flex', alignItems: 'center', minHeight: h, gap: 8, paddingLeft: indent }}>{children}</div>;
  const desc = (t: string, indent = 0) => <div style={{ fontSize: 13, color: c.muted, margin: '-14px 0 10px', paddingLeft: indent, lineHeight: '18px', maxWidth: 400 }}>{t}</div>;
  const colorLine = (key: keyof ChartSettings, label: string, disabled?: boolean) => {
    const v = s[key] as ColorLine;
    return <Swatch c={c} label={label} disabled={disabled} color={v.color} onChange={col => set({ [key]: { ...v, color: col } } as any)}
      line={{ width: v.width, style: v.style }} onLine={l => set({ [key]: { ...v, ...(l.width ? { width: l.width } : {}), ...(l.style ? { style: l.style } : {}) } } as any)} />;
  };
  const candleRow = (label: string, vis: 'bodyVisible' | 'borderVisible' | 'wickVisible', up: 'upColor' | 'borderUpColor' | 'wickUpColor', down: 'downColor' | 'borderDownColor' | 'wickDownColor') =>
    line(<>
      <div style={{ width: 85 }}><Check c={c} label={label} checked={s.candle[vis]} onChange={v => set({ candle: { ...s.candle, [vis]: v } })} /></div>
      <Swatch c={c} label={`${label} up color`} color={s.candle[up]} onChange={col => set({ candle: { ...s.candle, [up]: col } })} />
      <Swatch c={c} label={`${label} down color`} color={s.candle[down]} onChange={col => set({ candle: { ...s.candle, [down]: col } })} />
    </>);

  const titleModes: { value: LegendTitleMode; label: string }[] = [{ value: 'Description', label: 'Name' }, { value: 'Ticker', label: 'Symbol' }, { value: 'Ticker and description', label: 'Symbol and name' }];
  const pnlModes: { value: PnlMode; label: string }[] = [{ value: 'Money', label: 'Money' }, { value: 'Ticks', label: 'Ticks' }, { value: 'Percentage', label: '%' }];

  const symbolTab = (<>
    {section('Candles', true)}
    {line(<Check c={c} label="Color bars based on previous close" checked={s.colorBarsOnPrevClose} onChange={v => set({ colorBarsOnPrevClose: v })} />)}
    {candleRow('Body', 'bodyVisible', 'upColor', 'downColor')}
    {candleRow('Borders', 'borderVisible', 'borderUpColor', 'borderDownColor')}
    {candleRow('Wick', 'wickVisible', 'wickUpColor', 'wickDownColor')}
    {section('Data modification')}
    {row(93, 'Precision', <Dropdown key="p" c={c} label="Precision" value={s.precision} options={PRECISIONS} onChange={v => set({ precision: v })} />)}
    {row(93, 'Timezone', <Dropdown key="tz" c={c} label="Timezone" value={timezone} options={timezones.map(t => ({ value: t.tz, label: t.label }))} onChange={onTimezone} />)}
  </>);

  const legendTab = (<>
    {section('Instrument', true)}
    {line(<Check c={c} label="Logo" checked={sl.logo} onChange={v => setSl({ logo: v })} />)}
    {line(<><div style={{ width: 110 }}><Check c={c} label="Title" checked={sl.title} onChange={v => setSl({ title: v })} /></div>
      <Dropdown c={c} label="Title" value={sl.titleMode} options={titleModes} disabled={!sl.title} onChange={v => setSl({ titleMode: v as LegendTitleMode })} /></>)}
    {line(<Check c={c} label="Open market status" checked={sl.marketStatus} onChange={v => setSl({ marketStatus: v })} />)}
    {line(<Check c={c} label="Chart values" checked={sl.chartValues} onChange={v => setSl({ chartValues: v })} />)}
    {line(<Check c={c} label="Bar change values" checked={sl.barChange} onChange={v => setSl({ barChange: v })} />)}
    {line(<Check c={c} label="Volume" checked={sl.volume} onChange={v => setSl({ volume: v })} />)}
    {line(<Check c={c} label="Last day change values" checked={sl.lastDayChange} onChange={v => setSl({ lastDayChange: v })} />)}
    {line(<Check c={c} label="Buy/sell buttons" checked={tr.buySellButtons} onChange={v => setTr({ buySellButtons: v })} />)}
    {desc('Displays buy and sell buttons directly on the chart')}
    {section('Indicators')}
    {line(<Check c={c} label="Titles" checked={sl.indTitles} onChange={v => setSl({ indTitles: v })} />, 0, 42)}
    {line(<Check c={c} label="Inputs" checked={sl.indInputs} disabled={!sl.indTitles} onChange={v => setSl({ indInputs: v })} />, 26, 42)}
    {line(<Check c={c} label="Values" checked={sl.indValues} onChange={v => setSl({ indValues: v })} />)}
    {line(<><div style={{ width: 110 }}><Check c={c} label="Background" checked={sl.indBackground} onChange={v => setSl({ indBackground: v })} /></div>
      <input type="range" min={0} max={100} aria-label="Background opacity" value={sl.indBackgroundOpacity} disabled={!sl.indBackground}
        onChange={e => setSl({ indBackgroundOpacity: Number(e.target.value), backgroundOpacity: Number(e.target.value) })}
        style={{ width: 150, accentColor: '#2962ff', opacity: sl.indBackground ? 1 : 0.45 }} /></>, 0, 64)}
  </>);

  const vis3 = (key: 'currencyUnit' | 'scaleModes' | 'navButtons' | 'paneButtons', label: string, w = 180) =>
    <Dropdown key={key} c={c} label={label} value={s[key]} options={VISIBILITY3} width={w} onChange={v => set({ [key]: v } as any)} />;
  const pair = (label: string, value: 'symbolValue' | 'prevCloseValue' | 'highLowValue' | 'bidAskValue', lineK: 'symbolLine' | 'prevCloseLine' | 'highLowLine' | 'bidAskLine', nameK?: 'symbolName') => {
    const opts = [...(nameK ? [{ value: 'name', label: 'Name' }] : []), { value: 'value', label: 'Value' }, { value: 'line', label: 'Line' }];
    const checked: Record<string, boolean> = { name: nameK ? !!s[nameK] : false, value: !!s[value], line: !!s[lineK] };
    return <Dropdown key={label} c={c} label={label} value="" options={opts} width={180} display={multiText(opts.filter(o => checked[o.value]).map(o => o.label))}
      onChange={() => {}} multi={{ checked, toggle: k => set(k === 'name' ? { [nameK!]: !checked.name } as any : k === 'value' ? { [value]: !checked.value } as any : { [lineK]: !checked.line } as any) }} />;
  };
  const scalesTab = (<>
    {section('Price scale', true)}
    {row(187, 'Currency and Unit', vis3('currencyUnit', 'Currency and Unit'))}
    {row(187, 'Scale modes (A and L)', vis3('scaleModes', 'Scale modes (A and L)'))}
    {line(<><div style={{ width: 179 }}><Check c={c} label="Lock price to bar ratio" checked={s.lockPriceToBarRatio} onChange={v => set({ lockPriceToBarRatio: v })} /></div>
      <NumberInput c={c} label="Price to bar ratio" width={150} value={s.lockPriceToBarRatio ? s.priceToBarRatio : ((globalThis as any).__priceToBarRatioNow?.() ?? s.priceToBarRatio)} min={0.0000001} disabled={!s.lockPriceToBarRatio} onChange={v => set({ priceToBarRatio: v })} /></>)}
    {row(187, 'Scales placement', <Dropdown key="sp" c={c} label="Scales placement" value={s.scalesPlacement} options={['Stack on the left', 'Stack on the right', 'Auto']} onChange={v => set({ scalesPlacement: v as any })} />)}
    {section('Price labels & lines')}
    {line(<Check c={c} label="No overlapping labels" checked={s.noOverlappingLabels} onChange={v => set({ noOverlappingLabels: v })} />)}
    {line(<Check c={c} label="Plus button" checked={s.plusButton} onChange={v => set({ plusButton: v })} after={<Help c={c} text="Shows a + button on the price scale at the crosshair price, to add an alert, order or horizontal line there" />} />)}
    {line(<Check c={c} label="Countdown to bar close" checked={s.countdown} onChange={v => set({ countdown: v })} />)}
    {row(187, 'Symbol', pair('Symbol', 'symbolValue', 'symbolLine', 'symbolName'),
      <Swatch key="sw" c={c} label="Symbol line color" color={s.symbolLineStyle.color} split={s.symbolLineStyle.color ? undefined : [s.candle.upColor, s.candle.downColor]}
        onChange={col => set({ symbolLineStyle: { ...s.symbolLineStyle, color: col } })} line={{ width: s.symbolLineStyle.width, style: 'Solid' }} onLine={l => l.width && set({ symbolLineStyle: { ...s.symbolLineStyle, width: l.width } })} />)}
    {line(<><div style={{ width: 187 }} /><Dropdown c={c} label="Symbol value" value={s.symbolValueMode} width={180} options={['Price and percentage value', 'Value according to scale']} onChange={v => set({ symbolValueMode: v as any })} /></>, 0, 42)}
    {row(187, 'Previous day close', pair('Previous day close', 'prevCloseValue', 'prevCloseLine'), <span key="pc">{colorLine('prevCloseStyle', 'Previous day close line', !s.prevCloseValue && !s.prevCloseLine)}</span>)}
    {row(187, 'Indicators and financials', (() => {
      const checked: Record<string, boolean> = { name: s.indicatorsName, value: s.indicatorsValue };
      const opts = [{ value: 'name', label: 'Name' }, { value: 'value', label: 'Value' }];
      return <Dropdown key="ind" c={c} label="Indicators and financials" value="" options={opts} width={180} onChange={() => {}} display={multiText(opts.filter(o => checked[o.value]).map(o => o.label))}
        multi={{ checked, toggle: k => set(k === 'name' ? { indicatorsName: !s.indicatorsName } : { indicatorsValue: !s.indicatorsValue }) }} />;
    })())}
    {row(187, 'High and low', pair('High and low', 'highLowValue', 'highLowLine'),
      <Swatch key="hl" c={c} label="High and low line color" disabled={!s.highLowValue && !s.highLowLine} color={s.highLowStyle.color} split={s.highLowStyle.color ? undefined : [s.candle.upColor, s.candle.downColor]}
        onChange={col => set({ highLowStyle: { ...s.highLowStyle, color: col } })} line={{ width: s.highLowStyle.width, style: s.highLowStyle.style }}
        onLine={l => set({ highLowStyle: { ...s.highLowStyle, ...(l.width ? { width: l.width } : {}), ...(l.style ? { style: l.style as any } : {}) } })} />)}
    {row(187, 'Bid and ask', pair('Bid and ask', 'bidAskValue', 'bidAskLine'),
      <Swatch key="bid" c={c} label="Bid line color" disabled={!s.bidAskValue && !s.bidAskLine} color={s.bidColor} onChange={col => set({ bidColor: col })} />,
      <Swatch key="ask" c={c} label="Ask line color" disabled={!s.bidAskValue && !s.bidAskLine} color={s.askColor} onChange={col => set({ askColor: col })} />)}
    {section('Time scale')}
    {line(<Check c={c} label="Day of week on labels" checked={s.dayOfWeek} onChange={v => set({ dayOfWeek: v })} />)}
    {row(187, 'Date format', <Dropdown key="df" c={c} label="Date format" value={s.dateFormat} options={DATE_FORMATS.map(f => ({ value: f, label: s.dayOfWeek ? f : f.replace(/^Mon /, '') }))} onChange={v => set({ dateFormat: v })} />)}
    {row(187, 'Time hours format', <Dropdown key="tf" c={c} label="Time hours format" value={s.timeFormat} width={100} options={['24-hours', '12-hours']} onChange={v => set({ timeFormat: v as any })} />)}
    {line(<Check c={c} label="Save chart left edge position when changing interval" checked={s.saveLeftEdge} onChange={v => set({ saveLeftEdge: v })} />)}
  </>);

  const wm = s.watermark;
  const wmOpts = [{ value: 'ticker', label: 'Ticker' }, { value: 'interval', label: 'Interval' }, { value: 'description', label: 'Description' }, { value: 'replay', label: 'Replay mode' }];
  const canvasTab = (<>
    {section('Chart basic styles', true)}
    {row(173, 'Background', <Dropdown key="bt" c={c} label="Background" value={s.backgroundType} options={['Solid', 'Gradient']} onChange={v => set({ backgroundType: v as any })} />,
      <Swatch key="bg1" c={c} label="Background color" color={s.background} onChange={col => set({ background: col })} />,
      s.backgroundType === 'Gradient' ? <Swatch key="bg2" c={c} label="Background bottom color" color={s.background2} onChange={col => set({ background2: col })} /> : null)}
    {line(<><div style={{ width: 165 }}><Check c={c} label="Vertical grid lines" checked={s.vertGrid} onChange={v => set({ vertGrid: v })} /></div>
      <Swatch c={c} wide label="Vertical grid lines color" disabled={!s.vertGrid} color={s.gridVert} onChange={col => set({ gridVert: col })} /></>)}
    {line(<><div style={{ width: 165 }}><Check c={c} label="Horizontal grid lines" checked={s.horzGrid} onChange={v => set({ horzGrid: v })} /></div>
      <Swatch c={c} wide label="Horizontal grid lines color" disabled={!s.horzGrid} color={s.gridHorz} onChange={col => set({ gridHorz: col })} /></>)}
    {row(173, 'Crosshair', <span key="ch">{colorLine('crosshair', 'Crosshair color and line')}</span>)}
    {row(173, 'Watermark', <Dropdown key="wm" c={c} label="Watermark" value="" width={180} options={wmOpts} onChange={() => {}}
      display={multiText(wmOpts.filter(o => (wm as any)[o.value]).map(o => o.label)).replace(/^Hidden$/, 'Hidden')}
      multi={{ checked: wm as any, toggle: k => set({ watermark: { ...wm, [k]: !(wm as any)[k] } }) }} />,
      <Swatch key="wmc" c={c} label="Watermark color" color={s.watermarkColor} onChange={col => set({ watermarkColor: col })} />)}
    {section('Scales')}
    {row(173, 'Text', <Swatch key="tc" c={c} label="Scales text color" color={s.text} onChange={col => set({ text: col })} />,
      <Dropdown key="fs" c={c} label="Scales font size" value={String(s.fontSize)} width={100} options={FONT_SIZES.map(String)} onChange={v => set({ fontSize: Number(v) })} />)}
    {row(173, 'Lines', <Swatch key="lc" c={c} label="Scales lines color" color={s.lines} onChange={col => set({ lines: col })} />)}
    {section('Buttons')}
    {row(173, 'Navigation', vis3('navButtons', 'Navigation'))}
    {row(173, 'Pane', vis3('paneButtons', 'Pane'))}
    {section('Margins')}
    {row(173, 'Top', <NumberInput key="mt" c={c} label="Top margin" value={s.marginTop} min={0} onChange={v => set({ marginTop: Math.min(80, v) })} />, <span key="u1" style={{ fontSize: 14 }}>%</span>)}
    {row(173, 'Bottom', <NumberInput key="mb" c={c} label="Bottom margin" value={s.marginBottom} min={0} onChange={v => set({ marginBottom: Math.min(80, v) })} />, <span key="u2" style={{ fontSize: 14 }}>%</span>)}
    {row(173, 'Right', <NumberInput key="mr" c={c} label="Right margin" value={s.marginRight} min={0} onChange={v => set({ marginRight: Math.round(v) })} />, <span key="u3" style={{ fontSize: 14 }}>bars</span>)}
  </>);

  const tradingTab = (<>
    {section('General', true)}
    {line(<Check c={c} label="Buy/sell buttons" checked={tr.buySellButtons} onChange={v => setTr({ buySellButtons: v })} />)}
    {desc('Displays buy and sell buttons directly on the chart')}
    {line(<Check c={c} label="One-click trading" checked={tr.oneClickTrading} onChange={v => setTr({ oneClickTrading: v })} after={<Help c={c} text="Place, edit and cancel orders and close positions without a confirmation" />} />)}
    {desc('Instantly place, edit, cancel orders, or close positions without confirmation')}
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minHeight: 92 }}>
      <div style={{ width: 196, paddingTop: 8 }}><Check c={c} label="Execution sound" checked={tr.executionSound} onChange={v => setTr({ executionSound: v })} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, opacity: tr.executionSound ? 1 : 0.45 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={c.text} strokeWidth="1.2" aria-hidden><path d="M3 7h3l4-3v10l-4-3H3z" />{tr.executionSoundVolume === 0 && <path d="M12 6l4 6M16 6l-4 6" />}{tr.executionSoundVolume > 0 && <path d="M12.5 6.5a3.5 3.5 0 010 5" />}</svg>
          <input type="range" min={0} max={100} aria-label="Execution sound volume" value={tr.executionSoundVolume} disabled={!tr.executionSound}
            onChange={e => setTr({ executionSoundVolume: Number(e.target.value) })} onMouseUp={() => tr.executionSound && playExecutionSound(tr.executionSoundName, tr.executionSoundVolume)}
            style={{ width: 136, accentColor: c.text }} />
        </div>
        <Dropdown c={c} label="Execution sound" value={tr.executionSoundName} options={EXECUTION_SOUNDS} disabled={!tr.executionSound}
          onChange={v => { setTr({ executionSoundName: v }); playExecutionSound(v, tr.executionSoundVolume); }} />
      </div>
    </div>
    {line(<Check c={c} label="Show only rejection notifications" checked={tr.onlyRejectionNotifications} onChange={v => setTr({ onlyRejectionNotifications: v })} />)}
    {section('Appearance')}
    {line(<Check c={c} label="Positions and orders" checked={tr.positionsAndOrders} onChange={v => setTr({ positionsAndOrders: v })} after={<Help c={c} mark="i" text="Shows your positions and orders on the chart" />} />, 0, 42)}
    {line(<Check c={c} label="Reverse position button" checked={tr.reversePositionButton} disabled={!tr.positionsAndOrders} onChange={v => setTr({ reversePositionButton: v })} />, 26, 42)}
    {desc('Adds the reverse button next to the open position on the chart', 26)}
    {line(<Check c={c} label="Project order for market orders" checked={tr.projectOrderForMarket} onChange={v => setTr({ projectOrderForMarket: v })} />)}
    {desc('Shows a project order on the chart before sending a market order')}
    {line(<Check c={c} label="Profit and loss value" checked={tr.pnlValue} onChange={v => setTr({ pnlValue: v })} after={<Help c={c} text="Shows the profit or loss of positions and brackets on the chart" />} />, 0, 42)}
    {([['Positions', 'pnlPositions', 'pnlPositionsMode'], ['Brackets', 'pnlBrackets', 'pnlBracketsMode']] as const).map(([label, k, mk]) => (
      <div key={k}>{line(<><div style={{ width: 178 }}><Check c={c} label={label} checked={tr[k]} disabled={!tr.pnlValue} onChange={v => setTr({ [k]: v } as any)} /></div>
        <Dropdown c={c} label={`${label} profit and loss`} value={tr[mk]} width={100} options={pnlModes} disabled={!tr.pnlValue || !tr[k]} onChange={v => setTr({ [mk]: v } as any)} /></>, 26, 42)}</div>
    ))}
    {line(<Check c={c} label="Execution marks" checked={tr.executionMarks} onChange={v => setTr({ executionMarks: v })} after={<Help c={c} mark="i" text="Shows arrows on the bars where your orders were filled" />} />, 0, 42)}
    {line(<Check c={c} label="Execution labels" checked={tr.executionLabels} disabled={!tr.executionMarks} onChange={v => setTr({ executionLabels: v })} />, 26, 42)}
    {line(<Check c={c} label="Extended price lines across the entire chart width" checked={tr.extendedPriceLines} onChange={v => setTr({ extendedPriceLines: v })} />)}
    {row(204, 'Order and position alignment', <Dropdown key="al" c={c} label="Order and position alignment" value={tr.alignment} width={100} options={['Left', 'Center', 'Right']} onChange={v => setTr({ alignment: v as any })} />)}
    {line(<Check c={c} label="Orders, executions, and positions in chart snapshots" checked={tr.tradesInSnapshots} onChange={v => setTr({ tradesInSnapshots: v })} />)}
    {desc('Shows your trades on the chart in snapshots')}
  </>);

  const alertsTab = (<>
    {section('Chart line visibility', true)}
    {line(<><Check c={c} label="Alert lines" checked={s.alertLines} onChange={v => set({ alertLines: v })} />
      <Swatch c={c} label="Alert lines color" disabled={!s.alertLines} color={s.alertLineColor} onChange={col => set({ alertLineColor: col })} /></>)}
    {line(<Check c={c} label="Only active alerts" checked={s.onlyActiveAlerts} disabled={!s.alertLines} onChange={v => set({ onlyActiveAlerts: v })} />)}
    {section('Notifications')}
    {line(<Check c={c} label="Automatically hide toasts" checked={s.autoHideToasts} onChange={v => set({ autoHideToasts: v })} after={<Help c={c} text="Alert toasts close by themselves after a few seconds instead of staying until you close them" />} />)}
  </>);

  const eventsTab = (<>
    {section('Events', true)}
    {line(<><div style={{ width: 150 }}><Check c={c} label="Ideas" checked={s.ideas} onChange={v => set({ ideas: v })} /></div>
      <Dropdown c={c} label="Ideas" value={s.ideasMode} width={100} disabled={!s.ideas} options={['All ideas', 'Following', 'Private']} onChange={v => set({ ideasMode: v })} />
      <Help c={c} text="Shows published ideas for this symbol on the chart" /></>)}
    {line(<><div style={{ width: 150 }}><Check c={c} label="Session breaks" checked={s.sessionBreaks} onChange={v => set({ sessionBreaks: v })} /></div>{colorLine('sessionBreaksStyle', 'Session breaks line', !s.sessionBreaks)}</>)}
    {line(<Check c={c} label="Economic events" checked={s.economicEvents} onChange={v => set({ economicEvents: v })} />, 0, 42)}
    {line(<Check c={c} label="Only future events" checked={s.onlyFutureEvents} disabled={!s.economicEvents} onChange={v => set({ onlyFutureEvents: v })} />, 26, 42)}
    {line(<><div style={{ width: 124 }}><Check c={c} label="Events breaks" checked={s.eventsBreaks} disabled={!s.economicEvents} onChange={v => set({ eventsBreaks: v })} /></div>{colorLine('eventsBreaksStyle', 'Events breaks line', !s.economicEvents || !s.eventsBreaks)}</>, 26, 42)}
    {line(<Check c={c} label="Latest news" checked={s.latestNews} onChange={v => set({ latestNews: v })} />)}
    {line(<Check c={c} label="News notification" checked={s.newsNotification} onChange={v => set({ newsNotification: v })} />)}
  </>);

  const content: Record<string, React.ReactNode> = { symbol: symbolTab, legend: legendTab, scales: scalesTab, canvas: canvasTab, trading: tradingTab, alerts: alertsTab, events: eventsTab };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div ref={boxRef} role="dialog" aria-label="Settings" data-name="series-properties-dialog"
        style={{ ...(pos ? { position: 'fixed', left: pos.x, top: pos.y } : {}), width: 750, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column',
          background: c.panel, color: c.text, borderRadius: 8, boxShadow: '0 2px 24px rgba(0,0,0,0.3)', pointerEvents: 'auto',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif' }}>
        <div onMouseDown={startDrag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px', cursor: 'default' }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Settings</div>
          <button type="button" aria-label="Close menu" onClick={cancel} style={{ width: 34, height: 34, border: 'none', background: 'transparent', color: c.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 3l12 12M15 3L3 15" /></svg>
          </button>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div role="tablist" aria-orientation="vertical" style={{ width: 206, flexShrink: 0, padding: '8px 0 20px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {TABS.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-value={t.id} onClick={() => setTab(t.id)}
                onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.background = c.hover; }} onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.background = 'transparent'; }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, height: 40, padding: '0 10px 0 12px', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  background: tab === t.id ? c.hover : 'transparent', color: c.text, fontSize: 14, fontWeight: tab === t.id ? 600 : 400 }}>
                <TabIcon id={t.id} /><span>{t.label}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 20px 24px 20px' }}>{content[tab]}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: `1px solid ${c.border}` }}>
          <TemplateMenu c={c} isDark={isDark} uid={user?.uid} onDialog={setSubDialog} />
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={cancel} style={{ height: 34, padding: '0 12px', borderRadius: 6, border: `1px solid ${c.text}`, background: 'transparent', color: c.text, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button type="button" onClick={ok} style={{ height: 34, padding: '0 12px', minWidth: 44, borderRadius: 6, border: 'none', background: c.text, color: c.panel, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Ok</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Template ▾ : Apply defaults, Save as…, then the saved templates (trash can on hover)
function TemplateMenu({ c, isDark, uid, onDialog }: { c: Colors; isDark: boolean; uid?: string | null; onDialog: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const list = chartTemplates.useValue().list;
  const ref = useRef<HTMLDivElement>(null);
  useEscapeClose(() => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('mousedown', onDown); };
  }, [open]);
  useEffect(() => { onDialog(saving); }, [saving]); // eslint-disable-line react-hooks/exhaustive-deps
  const item = (key: string, label: React.ReactNode, onClick: () => void, extra?: React.ReactNode) => (
    <div key={key} role="menuitem" tabIndex={-1} onClick={onClick} className="tv-tmpl-item"
      onMouseEnter={e => { e.currentTarget.style.background = c.hover; const t = e.currentTarget.querySelector<HTMLElement>('[data-trash]'); if (t) t.style.visibility = 'visible'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; const t = e.currentTarget.querySelector<HTMLElement>('[data-trash]'); if (t) t.style.visibility = 'hidden'; }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32, padding: '0 8px 0 14px', margin: '0 4px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 14 }}>
      <span style={{ flex: 1 }}>{label}</span>{extra}
    </div>
  );
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={e => {
        // opens downward, or upward when the window has no room below
        const r = e.currentTarget.getBoundingClientRect();
        setUp(window.innerHeight - r.bottom < 24 + 32 * (2 + list.length) + 12);
        setOpen(o => !o);
      }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 8px 0 12px', borderRadius: 6, border: `1px solid ${open ? '#2962ff' : c.border}`, background: 'transparent', color: c.text, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
        Template {chevron(open, c.text)}
      </button>
      {open && (
        <div role="menu" aria-label="Template" style={{ position: 'absolute', left: 0, ...(up ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }), minWidth: 118, background: c.panel, borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,0.3)', padding: '4px 0', zIndex: 5 }}>
          {item('defaults', 'Apply defaults', () => { applySnapshot(defaultSnapshot(isDark)); setOpen(false); })}
          {item('saveas', 'Save as…', () => { setOpen(false); setSaving(true); })}
          {list.length > 0 && <div style={{ height: 1, background: c.border, margin: '4px 6px' }} />}
          {list.map(t => item(`t:${t.name}`, t.name, () => { applyTemplate(t); setOpen(false); },
            <button type="button" data-trash aria-label={`Remove ${t.name}`} onClick={e => { e.stopPropagation(); removeTemplate(t.name, uid); }}
              style={{ visibility: 'hidden', border: 'none', background: 'transparent', color: c.muted, cursor: 'pointer', display: 'flex', padding: 4 }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M4 5.5h10M7.5 5.5V4h3v1.5M5.5 5.5l.7 9h5.6l.7-9" /></svg>
            </button>))}
        </div>
      )}
      {saving && <SaveTemplateDialog c={c} names={list.map(t => t.name)} onClose={() => setSaving(false)} onSave={name => { saveTemplate(name, uid); setSaving(false); }} />}
    </div>
  );
}

function SaveTemplateDialog({ c, names, onClose, onSave }: { c: Colors; names: string[]; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEscapeClose(onClose);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); }, []);
  const trimmed = name.trim();
  const submit = () => { if (!trimmed) return; if (names.includes(trimmed) && !confirm) { setConfirm(true); return; } onSave(trimmed); };
  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 100003, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="dialog" aria-label="Save template as" style={{ position: 'relative', width: 480, maxWidth: 'calc(100vw - 32px)', background: c.panel, color: c.text, borderRadius: 8, boxShadow: '0 2px 24px rgba(0,0,0,0.35)', padding: '30px 40px 28px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif' }}>
        <button type="button" aria-label="close" onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, border: 'none', background: 'transparent', color: c.text, cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 3l12 12M15 3L3 15" /></svg>
        </button>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 18 }}>Save template as</div>
        <div style={{ fontSize: 14, color: c.muted, marginBottom: 6 }}>Template name:</div>
        <div style={{ position: 'relative' }}>
          <input ref={inputRef} aria-label="Template name" value={name} onChange={e => { setName(e.target.value); setConfirm(false); }} onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            style={{ width: '100%', boxSizing: 'border-box', height: 34, borderRadius: 6, border: '1px solid #2962ff', padding: '0 34px 0 10px', fontSize: 14, outline: 'none', background: 'transparent', color: c.text }} />
          {names.length > 0 && (
            <button type="button" aria-label="Saved templates" onClick={() => setListOpen(o => !o)} style={{ position: 'absolute', right: 4, top: 4, width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {chevron(listOpen, c.text)}
            </button>
          )}
          {listOpen && (
            <div role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: 38, background: c.panel, borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,0.3)', padding: '4px 0', zIndex: 2, maxHeight: 200, overflowY: 'auto' }}>
              {names.map(n => (
                <div key={n} role="option" aria-selected={n === trimmed} onClick={() => { setName(n); setListOpen(false); setConfirm(false); }}
                  onMouseEnter={e => (e.currentTarget.style.background = c.hover)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 14 }}>{n}</div>
              ))}
            </div>
          )}
        </div>
        {confirm && <div style={{ fontSize: 13, color: c.muted, marginTop: 10 }}>Template "{trimmed}" already exists. Do you really want to replace it?</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button type="button" onClick={onClose} style={{ height: 34, padding: '0 12px', borderRadius: 6, border: `1px solid ${c.text}`, background: 'transparent', color: c.text, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
          <button type="button" disabled={!trimmed} onClick={submit} style={{ height: 34, padding: '0 14px', borderRadius: 6, border: 'none', background: trimmed ? c.text : c.disabledBg, color: trimmed ? c.panel : c.muted, fontSize: 15, cursor: trimmed ? 'pointer' : 'default' }}>{confirm ? 'Replace' : 'Save'}</button>
        </div>
      </div>
    </div>, document.body);
}
