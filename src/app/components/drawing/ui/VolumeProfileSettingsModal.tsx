'use client';
import React, { useEffect, useState } from 'react';
import { useDrawing, useSettingsSession } from '../core/DrawingContext';
import { ColorPickerPopup } from './ColorPickerPopup';
import { useEscapeClose } from '../../../lib/useEscapeClose';
import { vpOf, type VpLine, type VpSettings } from '../tools/advanced/volume';
import TvSelect from "@/app/components/ui/TvSelect";

// TradingView's Fixed range / Anchored volume profile settings: Inputs (rows, volume, value area,
// extend right) and Style (the histogram, its colours, the VAH / VAL / POC lines, the developing
// POC and value area, the box). Changes show at once; Cancel / Escape / ✕ put them back, Ok keeps.

const TEXT = 'var(--tv-sub-text)';
const BORDER = '1px solid var(--tv-sub-border)';

function CheckBox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: TEXT }}>
      <span
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        style={{
          width: 18, height: 18, borderRadius: 3, flexShrink: 0, boxSizing: 'border-box',
          border: checked ? 'none' : '1px solid var(--tv-sub-muted)', backgroundColor: checked ? TEXT : 'var(--tv-sub-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tv-sub-bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        )}
      </span>
      {label && <span onClick={(e) => { e.preventDefault(); onChange(!checked); }}>{label}</span>}
    </label>
  );
}

// A number field that commits on blur / Enter, within its limits
function NumberField({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (!isFinite(v)) { setText(String(value)); return; }
    const c = Math.max(min, Math.min(max, Math.round(v)));
    setText(String(c));
    if (c !== value) onChange(c);
  };
  return (
    <input value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
      inputMode="numeric"
      style={{ width: 100, height: 32, border: BORDER, borderRadius: 4, padding: '0 8px', fontSize: 13, color: TEXT, background: 'var(--tv-sub-bg)', outline: 'none', boxSizing: 'border-box' }} />
  );
}

function Select<T extends string | number>({ value, options, onChange, width = 100 }: { value: T; options: [T, string][]; onChange: (v: T) => void; width?: number }) {
  return (
    <TvSelect value={String(value)} onChange={e => { const o = options.find(([v]) => String(v) === e.target.value); if (o) onChange(o[0]); }}
      style={{ width, height: 32, border: BORDER, borderRadius: 4, padding: '0 6px', fontSize: 13, color: TEXT, background: 'var(--tv-sub-bg)', cursor: 'pointer', outline: 'none' }}>
      {options.map(([v, label]) => <option key={String(v)} value={String(v)}>{label}</option>)}
    </TvSelect>
  );
}

// A colour swatch opening the shared picker (checkerboard under it, so transparency shows)
// (the picker is fixed to the window: the dialog's scrolling body would clip it)
function Swatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const open = !!at;
  const setOpen = (fn: (o: boolean) => boolean, el?: HTMLElement) => {
    if (!fn(open) || !el) { setAt(null); return; }
    const r = el.getBoundingClientRect();
    setAt({ left: Math.min(r.left, window.innerWidth - 260), top: r.bottom + 6 + 330 > window.innerHeight ? Math.max(8, r.top - 336) : r.bottom + 6 });
  };
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={e => setOpen(o => !o, e.currentTarget)} aria-label="Color"
        style={{
          width: 32, height: 32, padding: 0, border: BORDER, borderRadius: 4, cursor: 'pointer', overflow: 'hidden', position: 'relative',
          background: 'repeating-conic-gradient(#d1d4dc 0% 25%, #ffffff 0% 50%) 50% / 8px 8px',
        }}>
        <span style={{ position: 'absolute', inset: 0, background: color }} />
      </button>
      {at && <ColorPickerPopup colorStr={color} onChange={onChange} onClose={() => setAt(null)} style={{ position: 'fixed', left: at.left, top: at.top }} />}
    </div>
  );
}

const WIDTHS: [number, string][] = [[1, '1px'], [2, '2px'], [3, '3px'], [4, '4px']];
const STYLES: [VpLine['style'], string][] = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']];

export function VolumeProfileSettingsModal({ onClose }: { onClose: () => void }) {
  const cancelEdit = useSettingsSession(onClose);
  useEscapeClose(cancelEdit);
  const { drawings, updateDrawing, selectedShapeId } = useDrawing();
  const drawing: any = drawings.find((d: any) => d.id === selectedShapeId);
  const [tab, setTab] = useState<'Inputs' | 'Style'>('Inputs');
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(8, window.innerWidth / 2 - 190) : 0,
    y: typeof window !== 'undefined' ? Math.max(8, window.innerHeight / 2 - 300) : 0,
  }));
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => { setPos(p => ({ x: p.x + e.clientX - drag.x, y: p.y + e.clientY - drag.y })); setDrag({ x: e.clientX, y: e.clientY }); };
    const up = () => setDrag(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [drag]);

  if (!drawing) return null;
  const s = vpOf(drawing);
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  const auto = isDark ? '#d1d4dc' : '#0f0f0f';
  // Only what's been set is stored (on top of the defaults)
  const set = (patch: Partial<VpSettings>) => updateDrawing(drawing.id, { vp: { ...(drawing.vp || {}), ...patch } } as any);
  const setLine = (k: 'vah' | 'val' | 'poc' | 'devPoc' | 'devVa', patch: Partial<VpLine>) => set({ [k]: { ...s[k], ...patch } } as any);

  const row = (label: React.ReactNode, control: React.ReactNode, indent = false) => (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 36, paddingLeft: indent ? 26 : 0 }}>
      <div style={{ flex: 1, fontSize: 13, color: TEXT }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{control}</div>
    </div>
  );
  const lineRow = (k: 'vah' | 'val' | 'poc' | 'devPoc' | 'devVa', label: string) => row(
    <CheckBox checked={s[k].show} onChange={v => setLine(k, { show: v })} label={label} />,
    <>
      <Swatch color={s[k].color || auto} onChange={c => setLine(k, { color: c })} />
      <Select value={s[k].width} options={WIDTHS} onChange={w => setLine(k, { width: w })} width={64} />
      <Select value={s[k].style} options={STYLES} onChange={st => setLine(k, { style: st })} width={82} />
    </>,
  );
  const title = drawing.type === 'anchored_volume_profile' ? 'Anchored Volume Profile' : 'FRVP';

  return (
    <div data-tv-settings-dialog
      role="dialog" aria-label={`${title} settings`}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, width: 380, maxHeight: 'calc(100vh - 16px)',
        backgroundColor: 'var(--tv-sub-bg)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.07)',
        zIndex: 2000, display: 'flex', flexDirection: 'column', userSelect: 'none',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div onMouseDown={e => setDrag({ x: e.clientX, y: e.clientY })}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'grab' }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: TEXT }}>{title}</span>
        <button onClick={cancelEdit} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: TEXT, display: 'flex', padding: 4, borderRadius: 4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: BORDER, padding: '0 20px' }}>
        {(['Inputs', 'Style'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '8px 0', marginRight: 20, fontSize: 14, fontWeight: 500, background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === t ? TEXT : '#787b86', borderBottom: tab === t ? `2px solid ${TEXT}` : '2px solid transparent',
            }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '12px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tab === 'Inputs' ? (
          <>
            {row('Rows Layout', <Select value={s.rowsLayout} options={[['rows', 'Number Of Rows'], ['ticks', 'Ticks Per Row']]} onChange={v => set({ rowsLayout: v })} width={140} />)}
            {row('Row Size', <NumberField value={s.rows} min={1} max={1000} onChange={v => set({ rows: v })} />)}
            {row('Volume', <Select value={s.volume} options={[['updown', 'Up/Down'], ['total', 'Total'], ['delta', 'Delta']]} onChange={v => set({ volume: v })} />)}
            {row('Value Area Volume', <NumberField value={s.vaVolume} min={1} max={100} onChange={v => set({ vaVolume: v })} />)}
            {row(<CheckBox checked={s.extendRight} onChange={v => set({ extendRight: v })} label="Extend Right" />, null)}
          </>
        ) : (
          <>
            {row(<CheckBox checked={s.showProfile} onChange={v => set({ showProfile: v })} label="Volume profile" />, null)}
            <div style={{ opacity: s.showProfile ? 1 : 0.45, pointerEvents: s.showProfile ? 'auto' : 'none' }}>
              {row(<CheckBox checked={s.showValues} onChange={v => set({ showValues: v })} label="Values" />, <Swatch color={s.valuesColor || auto} onChange={c => set({ valuesColor: c })} />, true)}
              {row('Width (% of the box)', <NumberField value={s.widthPct} min={1} max={100} onChange={v => set({ widthPct: v })} />, true)}
              {row('Placement', <Select value={s.placement} options={[['left', 'Left'], ['right', 'Right']]} onChange={v => set({ placement: v })} />, true)}
              {row('Up Volume', <Swatch color={s.upColor} onChange={c => set({ upColor: c })} />, true)}
              {row('Down Volume', <Swatch color={s.downColor} onChange={c => set({ downColor: c })} />, true)}
              {row('Value Area Up', <Swatch color={s.vaUpColor} onChange={c => set({ vaUpColor: c })} />, true)}
              {row('Value Area Down', <Swatch color={s.vaDownColor} onChange={c => set({ vaDownColor: c })} />, true)}
            </div>
            {lineRow('vah', 'VAH')}
            {lineRow('val', 'VAL')}
            {lineRow('poc', 'POC')}
            {lineRow('devPoc', 'Developing POC')}
            {lineRow('devVa', 'Developing VA')}
            {row('Histogram Box', <Swatch color={s.boxColor} onChange={c => set({ boxColor: c })} />)}
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: BORDER }}>
        <button onClick={() => updateDrawing(drawing.id, { vp: {} } as any)}
          style={{ height: 34, padding: '0 12px', border: BORDER, borderRadius: 4, background: 'transparent', color: TEXT, fontSize: 13, cursor: 'pointer' }}>
          Reset settings
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={cancelEdit} style={{ padding: '0 16px', height: 34, background: 'var(--tv-sub-bg)', border: `1px solid ${TEXT}`, borderRadius: 4, color: TEXT, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0 24px', height: 34, background: TEXT, border: 'none', borderRadius: 4, color: 'var(--tv-sub-bg)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Ok</button>
        </div>
      </div>
    </div>
  );
}
