'use client';

// TradingView's Create alert / Edit alert dialog: condition (price crossing, crossing up/down,
// greater/less than a value), trigger, expiration, message, and the Notifications page
// (desktop notification, toast, webhook, sound with repeat). In Bar Replay it shows
// "Oops. This is replay mode" instead.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft, ChevronUp, X } from 'lucide-react';
import { useAlerts, ALERT_OPERATORS, DEFAULT_NOTIFY, requestDesktopPermission } from '@/context/AlertsContext';
import type { AlertNotify, AlertOperator, AlertTrigger } from '@/context/AlertsContext';
import { useEscapeClose } from "../lib/useEscapeClose";
import { useReplay } from "./ReplayContext";
import ReplayAlertDialog from "./alerts/ReplayAlertDialog";
import { SymbolChip } from "./alerts/AlertToasts";
import { SOUND_GROUPS, SOUND_REPEATS, soundName, playAlertSound } from "../lib/alertSounds";

interface CreateAlertModalProps {
  onClose: () => void;
  theme?: string;
  symbol?: string;
  initialPrice?: number;
  editId?: string;   // edit this alert instead of creating one
}

// The last notification choices are the next alert's defaults, as in TradingView
const NOTIFY_KEY = 'tv:alert-notify';
function lastNotify(): AlertNotify {
  try { return { ...DEFAULT_NOTIFY, ...JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}') }; } catch { return DEFAULT_NOTIFY; }
}

// The chart's price precision for its own symbol (AAPL 2, EURUSD 5); a guess for others
function decimalsFor(symbol: string, p: number) {
  const w = typeof window !== 'undefined' ? (window as any) : {};
  const key = (s: string) => (s.split(':').pop() || s).toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (typeof w.__pricePrecision === 'number' && w.__chartSymbol && key(w.__chartSymbol) === key(symbol)) return w.__pricePrecision;
  return Math.abs(p) < 20 ? 5 : 3;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const longDate = (t: number) => { const d = new Date(t); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const localInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const inAMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setSeconds(0, 0); return d.getTime(); };

export function notifySummary(n: AlertNotify) {
  const parts = [n.app && 'App', n.toast && 'Toasts', n.webhook && 'Webhook', n.sound && 'Sound'].filter(Boolean);
  return parts.length ? parts.join(', ') : 'None';
}

export default function CreateAlertModal(props: CreateAlertModalProps) {
  const { mode } = useReplay();
  // Decided when the dialog opens: alerts can't be made against replayed bars
  const [inReplay] = useState(mode !== 'idle');
  if (inReplay) return <ReplayAlertDialog theme={props.theme} onClose={props.onClose} />;
  return <AlertDialog {...props} />;
}

function AlertDialog({ onClose, theme, symbol: chartSymbol = 'XAUUSD', initialPrice, editId }: CreateAlertModalProps) {
  const { alerts, addAlert, updateAlert } = useAlerts();
  const editing = editId ? alerts.find(a => a.id === editId) : undefined;
  const symbol = editing?.symbol ?? chartSymbol;
  const start = editing?.value ?? initialPrice ?? 0;
  const [decimals] = useState(() => decimalsFor(symbol, start));

  const [operator, setOperator] = useState<AlertOperator>(editing?.condition ?? 'Crossing');
  const [value, setValue] = useState(start ? start.toFixed(decimals) : '');
  const [trigger, setTrigger] = useState<AlertTrigger>(editing?.trigger ?? 'Once only');
  const [expiration, setExpiration] = useState(editing?.expiration && editing.expiration > Date.now() ? editing.expiration : inAMonth());
  const [editingExpiry, setEditingExpiry] = useState(false);
  const autoMessage = `${symbol.split(':').pop()} ${operator} ${value}`;
  const [message, setMessage] = useState<string | null>(editing ? editing.message : null); // null = follows the condition
  const [notify, setNotify] = useState<AlertNotify>(() => editing?.notify ?? lastNotify());
  const [page, setPage] = useState<'main' | 'notifications'>('main');
  // The Notifications page edits a draft: Apply keeps it, Cancel / Back restore this
  const notifyBefore = useRef(notify);
  const openNotifications = () => { notifyBefore.current = notify; setPage('notifications'); };
  const leaveNotifications = (apply: boolean) => { if (!apply) setNotify(notifyBefore.current); setPage('main'); };
  const valueRef = useRef<HTMLInputElement>(null);

  useEscapeClose(onClose);
  useEffect(() => { valueRef.current?.focus(); valueRef.current?.select(); }, []);

  const step = Math.pow(10, -decimals);
  const nudge = (dir: 1 | -1) => {
    const v = parseFloat(value);
    if (isFinite(v)) setValue((v + dir * step).toFixed(decimals));
  };
  const valid = isFinite(parseFloat(value));

  const submit = () => {
    if (!valid) return;
    const data = { symbol, condition: operator, value: parseFloat(value), trigger, expiration, message: (message ?? autoMessage).trim() || autoMessage, notify };
    if (editing) updateAlert(editing.id, data); else addAlert(data);
    try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(notify)); } catch { /* ignore */ }
    if (notify.app) requestDesktopPermission();
    onClose();
  };

  const dark = theme === 'dark';
  const c = dark
    ? { bg: '#1e222d', text: '#d1d4dc', muted: '#787b86', border: '#2a2e39', input: '#2a2e39', hover: 'rgba(255,255,255,0.06)', btn: '#d1d4dc', btnText: '#131722', link: '#5b9cf6' }
    : { bg: '#ffffff', text: '#131722', muted: '#787b86', border: '#e0e3eb', input: '#ffffff', hover: '#f0f3fa', btn: '#131722', btnText: '#ffffff', link: '#2962ff' };
  const field: React.CSSProperties = { height: 34, boxSizing: 'border-box', borderRadius: 6, border: `1px solid ${c.border}`, background: c.input, color: c.text, fontSize: 14, outline: 'none', fontFamily: 'inherit' };
  const label: React.CSSProperties = { width: 130, flex: 'none', fontSize: 14, color: c.muted };
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', minHeight: 30 };
  const link: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, color: c.text, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10005, backgroundColor: 'rgba(0,0,0,0.4)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={page === 'notifications' ? 'Notifications' : `${editing ? 'Edit' : 'Create'} alert on ${symbol}`}
        style={{ background: c.bg, color: c.text, borderRadius: 6, width: 480, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)', boxShadow: '0 2px 4px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif" }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 20px 18px', borderBottom: `1px solid ${c.border}` }}>
          {page === 'notifications' && (
            <button type="button" aria-label="Back" onClick={() => leaveNotifications(false)} style={{ ...link, width: 28, height: 28, justifyContent: 'center' }}><ChevronLeft size={20} /></button>
          )}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 600, lineHeight: '28px' }}>
            {page === 'notifications' ? 'Notifications' : <>{editing ? 'Edit' : 'Create'} alert on <SymbolChip symbol={symbol} dark={dark} /></>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ ...link, width: 28, height: 28, justifyContent: 'center' }}><X size={20} strokeWidth={1.5} /></button>
        </div>

        {page === 'main' ? (
          <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
            <div style={{ display: 'flex' }}>
              <div style={{ ...label, paddingTop: 8 }}>Condition</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ ...field, display: 'flex', alignItems: 'center', padding: '0 8px' }}>Price</div>
                <Select dark={dark} c={c} field={field} ariaLabel="Condition" value={operator} options={ALERT_OPERATORS.map(o => ({ value: o, label: o }))} onChange={v => setOperator(v as AlertOperator)} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ ...field, width: 140, display: 'flex', alignItems: 'center', padding: '0 8px' }}>Value</div>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input ref={valueRef} aria-label="Value" inputMode="decimal" value={value}
                      onChange={e => setValue(e.target.value.replace(/[^0-9.\-]/g, ''))}
                      onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1); } else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); } else if (e.key === 'Enter') submit(); }}
                      style={{ ...field, width: '100%', padding: '0 28px 0 8px', border: `1px solid ${valid ? '#2962ff' : '#f23645'}` }} />
                    <div style={{ position: 'absolute', right: 4, top: 3, display: 'flex', flexDirection: 'column', color: c.muted }}>
                      <button type="button" aria-label="Increase" onClick={() => nudge(1)} style={{ ...link, color: c.muted, height: 14 }}><ChevronUp size={13} /></button>
                      <button type="button" aria-label="Decrease" onClick={() => nudge(-1)} style={{ ...link, color: c.muted, height: 14 }}><ChevronDown size={13} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: c.border, margin: '18px 0 14px' }} />

            <div style={row}>
              <div style={label}>Trigger</div>
              <Select dark={dark} c={c} field={field} ariaLabel="Trigger" compact value={trigger} options={[{ value: 'Once only', label: 'Once only' }, { value: 'Every time', label: 'Every time' }]} onChange={v => setTrigger(v as AlertTrigger)} />
            </div>
            <div style={row}>
              <div style={label}>Expiration</div>
              {editingExpiry ? (
                <input type="datetime-local" aria-label="Expiration" autoFocus value={localInput(expiration)} min={localInput(Date.now())}
                  onChange={e => { const t = new Date(e.target.value).getTime(); if (isFinite(t)) setExpiration(t); }}
                  onBlur={() => setEditingExpiry(false)} style={{ ...field, height: 28, padding: '0 6px' }} />
              ) : (
                <button type="button" style={link} onClick={() => setEditingExpiry(true)}>{longDate(expiration)} <ChevronDown size={14} /></button>
              )}
            </div>
            <div style={{ ...row, alignItems: 'flex-start' }}>
              <div style={{ ...label, paddingTop: 6 }}>Message</div>
              <textarea aria-label="Message" rows={2} value={message ?? autoMessage} onChange={e => setMessage(e.target.value)}
                style={{ ...field, flex: 1, height: 'auto', minHeight: 34, padding: '6px 8px', resize: 'vertical', lineHeight: '20px' }} />
            </div>
            <div style={{ ...row, marginTop: 6 }}>
              <div style={label}>Notifications</div>
              <button type="button" style={link} onClick={openNotifications}>{notifySummary(notify)} <ChevronRight size={14} /></button>
            </div>
          </div>
        ) : (
          <NotificationsPage notify={notify} setNotify={setNotify} c={c} field={field} dark={dark} />
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: `1px solid ${c.border}` }}>
          <button type="button" onClick={page === 'notifications' ? () => leaveNotifications(false) : onClose}
            style={{ height: 34, padding: '0 11px', borderRadius: 8, border: `1px solid ${c.border}`, background: 'transparent', color: c.text, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" disabled={page === 'main' && !valid} onClick={page === 'notifications' ? () => leaveNotifications(true) : submit}
            style={{ height: 34, padding: '0 11px', borderRadius: 8, border: 'none', background: c.btn, color: c.btnText, cursor: page === 'main' && !valid ? 'default' : 'pointer', opacity: page === 'main' && !valid ? 0.5 : 1, fontSize: 16, fontFamily: 'inherit' }}>
            {page === 'notifications' ? 'Apply' : editing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

type Palette = { bg: string; text: string; muted: string; border: string; input: string; hover: string; link: string };

function NotificationsPage({ notify, setNotify, c, field, dark }: { notify: AlertNotify; setNotify: (n: AlertNotify) => void; c: Palette; field: React.CSSProperties; dark: boolean }) {
  const set = (patch: Partial<AlertNotify>) => setNotify({ ...notify, ...patch });
  const option = (key: 'app' | 'toast' | 'webhook' | 'sound', title: string, desc: React.ReactNode, extra?: React.ReactNode) => (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={notify[key]} onChange={e => set({ [key]: e.target.checked } as Partial<AlertNotify>)} style={{ width: 18, height: 18, accentColor: dark ? '#d1d4dc' : '#131722', margin: 0 }} />
        {title}
      </label>
      <div style={{ fontSize: 13, color: c.muted, marginTop: 6, lineHeight: '18px' }}>{desc}</div>
      {notify[key] && extra}
    </div>
  );
  return (
    <div style={{ padding: '18px 20px 0', overflowY: 'auto' }}>
      {option('app', 'Notify in app', 'Shows a desktop notification from this browser.')}
      {option('toast', 'Show toast notification', 'Displays an onsite notification in the page corner.')}
      {option('webhook', 'Webhook URL', 'Sends a POST request to your specified URL when your alert triggers.',
        <input aria-label="Webhook URL" placeholder="https://" value={notify.webhookUrl} onChange={e => set({ webhookUrl: e.target.value })}
          style={{ ...field, width: '100%', marginTop: 8, padding: '0 8px' }} />)}
      {option('sound', 'Play sound', 'Plays an audio cue when your alert triggers.',
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <SoundSelect value={notify.soundId} onChange={id => set({ soundId: id })} c={c} field={field} dark={dark} />
          <Select dark={dark} c={c} field={field} ariaLabel="Repeat" width={150} value={String(notify.soundRepeat)} options={SOUND_REPEATS.map(r => ({ value: String(r.seconds), label: r.label }))} onChange={v => set({ soundRepeat: Number(v) })} />
        </div>)}
    </div>
  );
}

// A dropdown in TradingView's style (the native <select> can't hold play buttons or groups)
function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);
  return ref;
}

// Lists are fixed to the viewport at their button so the dialog's scrolling body can't clip them
function anchorBelow(el: HTMLElement | null): React.CSSProperties {
  const r = el?.getBoundingClientRect();
  return r ? { position: 'fixed', top: r.bottom + 4, left: r.left, minWidth: r.width } : {};
}
function anchorAbove(el: HTMLElement | null): React.CSSProperties {
  const r = el?.getBoundingClientRect();
  return r ? { position: 'fixed', bottom: window.innerHeight - r.top + 4, left: r.left, maxHeight: Math.min(480, r.top - 12) } : {};
}

function Select({ value, options, onChange, c, field, dark, ariaLabel, width, compact }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; c: Palette; field: React.CSSProperties; dark: boolean; ariaLabel: string; width?: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  useEscapeClose(() => setOpen(false), open);
  const current = options.find(o => o.value === value)?.label ?? value;
  return (
    <div ref={ref} style={{ position: 'relative', width: width ?? (compact ? undefined : '100%') }}>
      <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={compact
          ? { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, color: c.text, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }
          : { ...field, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', cursor: 'pointer', borderColor: open ? '#2962ff' : c.border }}>
        {current} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div role="listbox" style={{ ...anchorBelow(ref.current), zIndex: 10007, overflowY: 'auto', maxHeight: 320, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 0', boxShadow: dark ? '0 2px 8px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.15)' }}>
          {options.map(o => (
            <div key={o.value} role="option" aria-selected={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}
              onMouseEnter={e => (e.currentTarget.style.background = c.hover)} onMouseLeave={e => (e.currentTarget.style.background = o.value === value ? c.hover : 'transparent')}
              style={{ padding: '7px 12px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', background: o.value === value ? c.hover : 'transparent' }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="currentColor" /><path fill="currentColor" d="M7 5.8v6.4L12.2 9 7 5.8Z" /></svg>;
}

// Sounds in collapsible groups (Classic open), each with a ▶ preview
function SoundSelect({ value, onChange, c, field, dark }: { value: string; onChange: (id: string) => void; c: Palette; field: React.CSSProperties; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const groupOf = useMemo(() => SOUND_GROUPS.find(g => g.sounds.some(s => s.id === value))?.title ?? 'Classic', [value]);
  const [expanded, setExpanded] = useState<string>(groupOf);
  const ref = useOutside(open, () => setOpen(false));
  useEscapeClose(() => setOpen(false), open);
  return (
    <div ref={ref} style={{ position: 'relative', width: 150 }}>
      <button type="button" aria-label="Sound" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setExpanded(groupOf); setOpen(o => !o); }}
        style={{ ...field, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', cursor: 'pointer', borderColor: open ? '#2962ff' : c.border }}>
        {soundName(value)} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div role="listbox" aria-label="Sounds" style={{ ...anchorAbove(ref.current), width: 300, overflowY: 'auto', zIndex: 10007, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: 6, boxShadow: dark ? '0 2px 8px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.15)' }}>
          {SOUND_GROUPS.map((g, gi) => (
            <div key={g.title} style={{ borderTop: gi ? `1px solid ${c.border}` : 'none' }}>
              <button type="button" aria-expanded={expanded === g.title} onClick={() => setExpanded(e => (e === g.title ? '' : g.title))}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 8px', background: 'none', border: 'none', color: c.muted, fontSize: 11, letterSpacing: 0.4, cursor: 'pointer', fontFamily: 'inherit' }}>
                {g.title.toUpperCase()} {expanded === g.title ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded === g.title && g.sounds.map(s => {
                const selected = s.id === value;
                return (
                  <div key={s.id} role="option" aria-selected={selected} onClick={() => { onChange(s.id); setOpen(false); }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.background = c.hover; }} onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 38, padding: '0 8px', borderRadius: 4, cursor: 'pointer', fontSize: 14,
                      background: selected ? (dark ? '#d1d4dc' : '#131722') : 'transparent', color: selected ? (dark ? '#131722' : '#ffffff') : c.text }}>
                    {s.name}
                    <button type="button" aria-label={`Play ${s.name}`} title="Play" onClick={e => { e.stopPropagation(); playAlertSound(s.id); }}
                      style={{ display: 'flex', background: 'none', border: 'none', padding: 2, color: 'inherit', opacity: selected ? 1 : 0.6, cursor: 'pointer' }}>
                      <PlayIcon />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
