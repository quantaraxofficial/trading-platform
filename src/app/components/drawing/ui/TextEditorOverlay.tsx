"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface TextEditorOverlayProps {
  initialText: string;
  // Where the text sits (for the browser's own IME / emoji popups, which open at the input)
  x: number;
  y: number;
  onCommit: (newText: string) => void;
  onCancel: () => void;
  // Each change as it's typed: the shape draws it itself, so it's never shown twice
  onDraft: (text: string) => void;
  // The Konva stage the shape is drawn on; the text node being edited is named EDIT_TEXT_NAME
  stage: any;
}

export const EDIT_TEXT_NAME = 'tv-edit-text';

type XY = { x: number; y: number };
type Line = { start: number; end: number; text: string; x: number; y: number; width: number };
type Geom = { caret: XY[]; sel: XY[][]; color: string };

// Where each laid-out line of a Konva Text sits (in its own coordinates) and which characters
// of `value` it shows: the same arithmetic as Konva's Text._sceneFunc, so the caret lands
// exactly between the drawn letters. Wrapped lines lose the spaces they wrapped at, a new
// paragraph starts after its "\n".
function layout(node: any, value: string): { lines: Line[]; lineH: number } {
  const arr: { text: string; width: number; lastInParagraph: boolean }[] = node.textArr || [];
  const pad = node.padding(), lineH = node.lineHeight() * node.fontSize();
  const W = node.width(), H = node.height(), align = node.align(), va = node.verticalAlign();
  const alignY = va === 'middle' ? (H - arr.length * lineH - pad * 2) / 2 : va === 'bottom' ? H - arr.length * lineH - pad * 2 : 0;
  // the "Add text" placeholder is drawn while it's empty: the caret goes before it
  const typed = node.text() === value;
  const lines: Line[] = [];
  let pos = 0;
  arr.forEach((o, n) => {
    if (n > 0 && typed) {
      if (arr[n - 1].lastInParagraph) { const nl = value.indexOf('\n', pos); pos = nl < 0 ? value.length : nl + 1; }
      else while (pos < value.length && value[pos] === ' ' && !value.startsWith(o.text, pos)) pos++;
    }
    const len = typed ? Math.min(o.text.length, value.length - pos) : 0;
    const x = pad + (align === 'right' ? W - o.width - pad * 2 : align === 'center' ? (W - o.width - pad * 2) / 2 : 0);
    lines.push({ start: pos, end: pos + len, text: o.text, x, y: alignY + pad + n * lineH, width: o.width });
    pos += len;
  });
  return { lines, lineH };
}

const lineOf = (lines: Line[], i: number) => { let k = 0; lines.forEach((l, n) => { if (l.start <= i) k = n; }); return k; };
const xAt = (node: any, l: Line, i: number) => l.x + (i <= l.start ? 0 : node.measureSize(l.text.slice(0, Math.min(i, l.end) - l.start)).width);

// TradingView's text editing: the text is typed into an invisible <textarea> and stays drawn by
// the shape itself as it changes (rectangle, line, note, text…), with a blinking caret and the
// selection drawn over it here. So it's the same text, font and place while typing and after:
// Enter / a click outside / Escape don't make it jump. Enter adds a line, as on TradingView.
export function TextEditorOverlay({ initialText, x, y, onCommit, onCancel, onDraft, stage }: TextEditorOverlayProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [geom, setGeom] = useState<Geom | null>(null);
  const [tick, setTick] = useState(0); // restarts the blink on each change

  const node = () => stage?.findOne?.('.' + EDIT_TEXT_NAME) || null;

  // The caret and selection, from the drawn node and the textarea's selection
  const measure = () => {
    const el = areaRef.current, n = node(), wrap = wrapRef.current;
    if (!el || !n || !wrap) { setGeom(null); return; }
    const { lines, lineH } = layout(n, el.value);
    if (!lines.length) { setGeom(null); return; }
    const t = n.getAbsoluteTransform().copy();
    const off = (() => { const a = stage.container().getBoundingClientRect(), b = wrap.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top }; })();
    const pt = (px: number, py: number) => { const p = t.point({ x: px, y: py }); return { x: p.x + off.x, y: p.y + off.y }; };
    const fs = n.fontSize(), h = Math.min(lineH, fs * 1.25), inset = (lineH - h) / 2;
    const s = el.selectionStart ?? 0, e = el.selectionEnd ?? s;
    const at = el.selectionDirection === 'backward' ? s : e;
    const cl = lines[lineOf(lines, at)], cx = xAt(n, cl, at);
    const sel: XY[][] = [];
    if (e > s) lines.forEach(l => {
      if (l.end < s || l.start > e) return;
      const a = xAt(n, l, Math.max(s, l.start)), b = xAt(n, l, Math.min(e, l.end));
      if (b > a) sel.push([pt(a, l.y), pt(b, l.y), pt(b, l.y + lineH), pt(a, l.y + lineH)]);
    });
    const next: Geom = { caret: [pt(cx, cl.y + inset), pt(cx, cl.y + inset + h)], sel, color: String(n.fill() || '#2962ff') };
    setGeom(prev => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;

  // Re-measured whenever the chart redraws (the shape took the new text, or the chart moved)
  useEffect(() => {
    if (!stage) return;
    const layers: any[] = stage.getLayers?.() || [];
    const on = () => measureRef.current();
    layers.forEach(l => l.on('draw.tvTextEdit', on));
    return () => layers.forEach(l => l.off('draw.tvTextEdit'));
  }, [stage]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.value = initialText;
    el.focus({ preventScroll: true });
    el.setSelectionRange(initialText.length, initialText.length); // caret at the end, as on TradingView
    onDraft(initialText);
    requestAnimationFrame(() => measureRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The caret moves without a redraw too (arrows, Home / End, a click in the text)
  useEffect(() => {
    const onSel = () => { if (document.activeElement === areaRef.current) { measureRef.current(); setTick(t => t + 1); } };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    // (kept exactly as typed, a last empty line too: dropping it would re-centre a centred text)
    const v = areaRef.current?.value ?? '';
    if (!commit || v.trim() === '') onCancel(); else onCommit(v);
  };

  // A click on the text puts the caret there (Shift extends the selection); anywhere else ends typing
  const onWrapMouseDown = (e: React.MouseEvent) => {
    const el = areaRef.current, n = node(), wrap = wrapRef.current;
    if (!el || !n || !wrap) { finish(true); return; }
    const box = n.getClientRect();
    const sb = stage.container().getBoundingClientRect();
    const px = e.clientX - sb.left, py = e.clientY - sb.top;
    if (px < box.x - 4 || px > box.x + box.width + 4 || py < box.y - 4 || py > box.y + box.height + 4) { finish(true); return; }
    e.preventDefault();
    const local = n.getAbsoluteTransform().copy().invert().point({ x: px, y: py });
    const { lines, lineH } = layout(n, el.value);
    if (!lines.length) return;
    const l = lines[Math.max(0, Math.min(lines.length - 1, Math.floor((local.y - lines[0].y) / lineH)))];
    let best = l.start, dist = Infinity;
    for (let i = l.start; i <= l.end; i++) { const d = Math.abs(xAt(n, l, i) - local.x); if (d < dist) { dist = d; best = i; } }
    if (e.shiftKey) el.setSelectionRange(Math.min(el.selectionStart, best), Math.max(el.selectionEnd, best));
    else el.setSelectionRange(best, best);
    el.focus({ preventScroll: true });
    measure();
  };

  return (
    <div ref={wrapRef} onMouseDown={onWrapMouseDown}
      style={{ position: 'absolute', inset: 0, zIndex: 100, cursor: 'default' /* above the drawing layer */ }}>
      <textarea
        ref={areaRef}
        aria-label="Text"
        spellCheck={false}
        onInput={e => { onDraft(e.currentTarget.value); setTick(t => t + 1); }}
        onKeyDown={e => {
          e.stopPropagation(); // typing isn't a chart shortcut
          if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        }}
        onBlur={() => finish(true)}
        style={{
          // invisible, as TradingView's: the shape draws the text; this only takes the keys
          position: 'absolute', left: x, top: y, width: 2, height: 2, opacity: 0, padding: 0, border: 0,
          resize: 'none', overflow: 'hidden', pointerEvents: 'none',
        }}
      />
      {geom && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          {geom.sel.map((q, i) => (
            <polygon key={i} points={q.map(p => `${p.x},${p.y}`).join(' ')} fill="#2962ff" fillOpacity={0.3} />
          ))}
          <line key={tick} className="tv-text-caret" x1={geom.caret[0].x} y1={geom.caret[0].y} x2={geom.caret[1].x} y2={geom.caret[1].y}
            stroke={geom.color} strokeWidth={1} shapeRendering="crispEdges" />
        </svg>
      )}
      <style>{`.tv-text-caret { animation: tv-text-caret-blink 1.06s steps(1) infinite; }
@keyframes tv-text-caret-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }`}</style>
    </div>
  );
}
