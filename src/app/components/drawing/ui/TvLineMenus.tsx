'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// TradingView's floating-toolbar dropdowns for line width and line style, measured off
// TradingView: 32px rows inside 6px padding, a dark #2e2e2e row for the current value,
// opening 3px under the button (or above it when there's no room below).

const ROW: React.CSSProperties = {
  height: 32, display: 'flex', alignItems: 'center', boxSizing: 'border-box', cursor: 'pointer',
  fontSize: 14, whiteSpace: 'nowrap', userSelect: 'none',
};

function MenuPanel({ onClose, children }: { onClose?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && r.bottom > window.innerHeight - 8) setAbove(true);
  }, []);
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div
      ref={ref}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', left: 0, ...(above ? { bottom: 'calc(100% + 3px)' } : { top: 'calc(100% + 3px)' }),
        background: '#ffffff', borderRadius: 6, boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)', padding: '6px 0',
        zIndex: 100, color: '#0f0f0f',
      }}
    >
      {children}
    </div>
  );
}

function MenuRow({ selected, onPick, padding, gap, children }: {
  selected: boolean; onPick: () => void; padding: number; gap: number; children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="menuitemradio"
      aria-checked={selected}
      onClick={e => { e.stopPropagation(); onPick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...ROW, padding: `0 ${padding + 2}px 0 ${padding}px`, gap,
        background: selected ? '#2e2e2e' : hover ? '#f2f2f2' : 'transparent',
        color: selected ? '#ffffff' : '#0f0f0f',
      }}
    >
      {children}
    </div>
  );
}

export function TvWidthMenu({ value, onPick, onClose }: { value?: number; onPick: (w: number) => void; onClose?: () => void }) {
  return (
    <MenuPanel onClose={onClose}>
      {[1, 2, 3, 4].map(w => (
        <MenuRow key={w} selected={(value ?? 1) === w} onPick={() => onPick(w)} padding={13} gap={12}>
          <span style={{ width: 18, height: w, background: 'currentColor', flex: 'none' }} />
          <span>{w}px</span>
        </MenuRow>
      ))}
    </MenuPanel>
  );
}

const STYLE_LABELS = ['Line', 'Dashed line', 'Dotted line'];

// `values` are the tool's own stored values for solid / dashed / dotted ('Solid', 'solid', ...)
export function TvLineStyleMenu({ value, values = ['solid', 'dashed', 'dotted'], onPick, onClose }: {
  value?: string; values?: string[]; onPick: (v: string) => void; onClose?: () => void;
}) {
  const current = values.findIndex(v => v.toLowerCase() === (value || values[0]).toLowerCase());
  return (
    <MenuPanel onClose={onClose}>
      {values.map((v, i) => (
        <MenuRow key={v} selected={(current < 0 ? 0 : current) === i} onPick={() => onPick(v)} padding={12} gap={11}>
          <svg width="21" height="4" viewBox="0 0 21 4" style={{ flex: 'none' }}>
            <line x1="0" y1="2" x2="21" y2="2" stroke="currentColor"
              strokeWidth={i === 2 ? 2 : 1} strokeDasharray={i === 1 ? '5 3' : i === 2 ? '2 3' : undefined} />
          </svg>
          <span>{STYLE_LABELS[i]}</span>
        </MenuRow>
      ))}
    </MenuPanel>
  );
}
