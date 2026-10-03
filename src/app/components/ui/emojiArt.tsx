'use client';
import React, { useEffect, useState } from 'react';
import { ICON_PATHS } from './iconData';

// What a picked "emoji" is: an emoji character drawn with Twemoji (the flat art TradingView's
// picker uses; CC BY 4.0), or one of the Icons tab's vector icons ("icon:..."), drawn in a colour.

export const isIconId = (s?: string | null) => !!s && s.startsWith('icon:');
export const iconPath = (id: string) => ICON_PATHS[id];

// Twemoji's file naming: code points in hex joined by "-", dropping U+FE0F unless the
// sequence has a zero-width joiner
export function twemojiUrl(char: string): string {
  const cps = Array.from(char).map(c => c.codePointAt(0)!.toString(16));
  const parts = cps.includes('200d') ? cps : cps.filter(c => c !== 'fe0f');
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${parts.join('-')}.svg`;
}

// One shared image per emoji for the chart canvas; null until it loads (or if it can't)
const images = new Map<string, { img: HTMLImageElement; ok: boolean | null; waiters: Set<() => void> }>();
export function useEmojiImage(char: string | null): HTMLImageElement | null {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!char || isIconId(char)) return;
    const url = twemojiUrl(char);
    let e = images.get(url);
    if (!e) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';   // keeps chart snapshots exportable
      const entry = { img, ok: null as boolean | null, waiters: new Set<() => void>() };
      img.onload = () => { entry.ok = true; entry.waiters.forEach(w => w()); };
      img.onerror = () => { entry.ok = false; entry.waiters.forEach(w => w()); };
      img.src = url;
      images.set(url, entry);
      e = entry;
    }
    if (e.ok !== null) return;
    const w = () => bump(n => n + 1);
    e.waiters.add(w);
    return () => { e!.waiters.delete(w); };
  }, [char]);
  if (!char || isIconId(char)) return null;
  const e = images.get(twemojiUrl(char));
  return e?.ok ? e.img : null;
}

// For the picker: the Twemoji image, falling back to the system glyph if it can't load
export function EmojiGlyph({ char, size }: { char: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{char}</span>;
  return <img src={twemojiUrl(char)} alt={char} width={size} height={size} draggable={false} loading="lazy" onError={() => setFailed(true)} style={{ display: 'block' }} />;
}

export function IconGlyph({ id, size, color = 'currentColor' }: { id: string; size: number; color?: string }) {
  const p = ICON_PATHS[id];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${p[0]} ${p[1]}`} style={{ display: 'block' }} aria-hidden>
      <path d={p[2]} fill={color} />
    </svg>
  );
}

// Either kind, for anything listing picked emojis
export function PickedGlyph({ value, size, color }: { value: string; size: number; color?: string }) {
  return isIconId(value) ? <IconGlyph id={value} size={size} color={color} /> : <EmojiGlyph char={value} size={size} />;
}
