import React, { useEffect, useState } from 'react';
import { Group, Line, Shape, Text, Rect, Circle, Image as KImage } from 'react-konva';
import { RenderCtx, XY } from './MultiPointTool';
import { SHAPE_FONT, textWidth } from '../../core/lineStats';

// TradingView's Text & notes tools (Note, Price note, Pin, Table, Callout, Comment, Price label,
// Signpost, Flag mark) and Content tools (Image, Post, Idea), in its default colours. Text is typed
// in the shared HTML editor; each tool says where its text sits (`textAt`) so the editor opens on it.

const PLACEHOLDER = 'Add text';
type TextGeom = { x: number; y: number; color: string; fontSize: number };
type GeomCtx = { p: XY[]; d: any; key?: string };

const shown = (c: RenderCtx, key = '') => c.editingKey !== key;
const textOf = (d: any) => (d.text || '') as string;
const linesOf = (t: string) => t.split('\n');
const boxSize = (t: string, fontSize: number, padX: number, padY: number, minW = 0) => {
  const lines = linesOf(t || PLACEHOLDER);
  return { w: Math.max(minW, Math.max(...lines.map(l => textWidth(l, fontSize))) + padX * 2), h: lines.length * Math.round(fontSize * 1.25) + padY * 2 };
};
const textNode = (x: number, y: number, t: string, fontSize: number, fill: string, onClick?: () => void, key?: string, bold = false) => (
  <Text key={key} x={x} y={y} text={t || PLACEHOLDER} fontSize={fontSize} lineHeight={1.25} fontFamily={SHAPE_FONT}
    fontStyle={bold ? 'bold' : 'normal'} fill={t ? fill : '#9598a1'} onClick={onClick} onTap={onClick} />
);

// ---- Note: a white box at the second point, joined by a thin line to the first
const NOTE = { fs: 14, padX: 8, padY: 6 };
const noteBox = (B: XY, d: any) => { const s = boxSize(textOf(d), d.fontSize || NOTE.fs, NOTE.padX, NOTE.padY); return { ...s, x: B.x - s.w / 2, y: B.y - s.h - 4 }; };
export function renderTextNote(c: RenderCtx) {
  const [A, B] = c.p;
  const fs = c.d.fontSize || NOTE.fs;
  const b = noteBox(B, c.d);
  return (
    <Group>
      <Line points={[A.x, A.y, B.x, B.y]} stroke={c.d.stroke || '#0F0F0F'} strokeWidth={1} hitStrokeWidth={8} />
      <Rect x={b.x} y={b.y} width={b.w} height={b.h} cornerRadius={4} fill="#ffffff" shadowColor="rgba(0,0,0,0.25)" shadowBlur={6} shadowOffsetY={1} onClick={() => c.editText()} />
      {shown(c) && textNode(b.x + NOTE.padX, b.y + NOTE.padY, textOf(c.d), fs, c.d.textColor || '#0F0F0F', () => c.editText())}
    </Group>
  );
}
export const textNoteAt = ({ p, d }: GeomCtx): TextGeom => { const b = noteBox(p[1], d); return { x: b.x + b.w / 2, y: b.y + b.h / 2, color: d.textColor || '#0F0F0F', fontSize: d.fontSize || NOTE.fs }; };

// ---- Price note: the first point's price in a blue badge at the second point
export function renderPriceNote(c: RenderCtx) {
  const [A, B] = c.p;
  const color = c.d.stroke || '#2962FF';
  const t = c.fmtPrice(c.pts[0].price);
  const w = textWidth(t, 14) * 1.08 + 16, h = 26;
  return (
    <Group>
      <Line points={[A.x, A.y, B.x, B.y]} stroke={color} strokeWidth={1} hitStrokeWidth={8} />
      <Rect x={B.x - w / 2} y={B.y - h - 2} width={w} height={h} cornerRadius={4} fill={color} />
      <Text x={B.x - w / 2} y={B.y - h + 4} width={w} align="center" text={t} fontSize={14} fontStyle="bold" fontFamily={SHAPE_FONT} fill="#ffffff" listening={false} />
    </Group>
  );
}

// ---- Pin: a map pin on the point; selected, its note bubble opens above it
const PIN = { fs: 14, padX: 10, padY: 9, minW: 200 };
const pinBubble = (P: XY, d: any) => { const s = boxSize(textOf(d), d.fontSize || PIN.fs, PIN.padX, PIN.padY, PIN.minW); return { ...s, x: P.x - s.w / 2, y: P.y - 30 - s.h - 8 }; };
export function renderPin(c: RenderCtx) {
  const [P] = c.p;
  const color = c.d.stroke || '#2962FF';
  const head = { x: P.x, y: P.y - 18 };
  const b = pinBubble(P, c.d);
  const open = c.selected || c.editingKey !== null;
  return (
    <Group>
      <Shape fill={color} sceneFunc={(ctx, s) => {
        ctx.beginPath(); ctx.arc(head.x, head.y, 9, Math.PI * 0.85, Math.PI * 0.15); ctx.lineTo(P.x, P.y - 3); ctx.closePath(); ctx.fillShape(s);
      }} />
      <Circle x={head.x} y={head.y} radius={3.5} fill="#ffffff" listening={false} />
      {open && (
        <Group>
          <Rect x={b.x} y={b.y} width={b.w} height={b.h} cornerRadius={4} fill="#ffffff" shadowColor="rgba(0,0,0,0.25)" shadowBlur={8} shadowOffsetY={2} onClick={() => c.editText()} />
          <Shape fill="#ffffff" listening={false} sceneFunc={(ctx, s) => { ctx.beginPath(); ctx.moveTo(P.x - 7, b.y + b.h); ctx.lineTo(P.x, b.y + b.h + 7); ctx.lineTo(P.x + 7, b.y + b.h); ctx.closePath(); ctx.fillShape(s); }} />
          {shown(c) && textNode(b.x + PIN.padX, b.y + PIN.padY, textOf(c.d), c.d.fontSize || PIN.fs, c.d.textColor || '#0F0F0F', () => c.editText())}
        </Group>
      )}
    </Group>
  );
}
export const pinAt = ({ p, d }: GeomCtx): TextGeom => { const b = pinBubble(p[0], d); return { x: b.x + b.w / 2, y: b.y + b.h / 2, color: d.textColor || '#0F0F0F', fontSize: d.fontSize || PIN.fs }; };

// ---- Table: a 3×3 grid of editable cells from the point down and right
const TABLE = { fs: 14, colW: 120, rowH: 30, padX: 8 };
const tableCells = (d: any): string[][] => d.cells || [['', '', ''], ['', '', ''], ['', '', '']];
const cellGeom = (P: XY, d: any, r: number, col: number) => {
  const widths: number[] = d.columnWidths || tableCells(d)[0].map(() => TABLE.colW);
  const x = P.x + widths.slice(0, col).reduce((s, w) => s + w, 0);
  return { x, y: P.y + r * TABLE.rowH, w: widths[col], h: TABLE.rowH };
};
export function renderTable(c: RenderCtx) {
  const [P] = c.p;
  const cells = tableCells(c.d);
  const border = c.d.borderColor || '#DBDBDB';
  return (
    <Group>
      {cells.map((row, r) => row.map((txt, col) => {
        const g = cellGeom(P, c.d, r, col);
        const key = `${r},${col}`;
        return (
          <Group key={key}>
            <Rect x={g.x} y={g.y} width={g.w} height={g.h} fill={c.d.fill || '#ffffff'} stroke={border} strokeWidth={1} onClick={() => c.editText(key)} onTap={() => c.editText(key)} />
            {txt && shown(c, key) && <Text x={g.x + TABLE.padX} y={g.y + (g.h - 14) / 2} width={g.w - TABLE.padX * 2} text={txt} fontSize={c.d.fontSize || TABLE.fs} fontFamily={SHAPE_FONT} fill={c.d.textColor || '#0F0F0F'} wrap="none" ellipsis listening={false} />}
          </Group>
        );
      }))}
    </Group>
  );
}
export const tableAt = ({ p, d, key }: GeomCtx): TextGeom => {
  const [r, col] = (key || '0,0').split(',').map(Number);
  const g = cellGeom(p[0], d, r, col);
  return { x: g.x + g.w / 2, y: g.y + g.h / 2, color: d.textColor || '#0F0F0F', fontSize: d.fontSize || TABLE.fs };
};

// ---- Callout: a teal bubble at the second point with a tail to the first
const CALLOUT = { fs: 14, padX: 10, padY: 8 };
const calloutBox = (B: XY, d: any) => { const s = boxSize(textOf(d), d.fontSize || CALLOUT.fs, CALLOUT.padX, CALLOUT.padY); return { ...s, x: B.x - s.w / 2, y: B.y - s.h / 2 }; };
export function renderCallout(c: RenderCtx) {
  const [A, B] = c.p;
  const b = calloutBox(B, c.d);
  const fill = c.d.fill || 'rgba(0, 151, 167, 0.7)', border = c.d.stroke || '#0097A7';
  // the tail leaves the box edge nearest the anchor
  const cx = Math.max(b.x + 12, Math.min(b.x + b.w - 12, A.x)), cy = A.y > b.y + b.h ? b.y + b.h : A.y < b.y ? b.y : b.y + b.h / 2;
  return (
    <Group>
      <Shape fill={fill} stroke={border} strokeWidth={2} hitStrokeWidth={10}
        sceneFunc={(ctx, s) => { ctx.beginPath(); ctx.moveTo(cx - 7, cy); ctx.lineTo(A.x, A.y); ctx.lineTo(cx + 7, cy); ctx.closePath(); ctx.fillStrokeShape(s); }} />
      <Rect x={b.x} y={b.y} width={b.w} height={b.h} cornerRadius={8} fill={fill} stroke={border} strokeWidth={2} onClick={() => c.editText()} />
      {shown(c) && textNode(b.x + CALLOUT.padX, b.y + CALLOUT.padY, textOf(c.d), c.d.fontSize || CALLOUT.fs, c.d.textColor || '#ffffff', () => c.editText())}
    </Group>
  );
}
export const calloutAt = ({ p, d }: GeomCtx): TextGeom => { const b = calloutBox(p[1], d); return { x: b.x + b.w / 2, y: b.y + b.h / 2, color: d.textColor || '#ffffff', fontSize: d.fontSize || CALLOUT.fs }; };

// ---- Comment: a blue speech bubble whose square corner sits on the point
const COMMENT = { fs: 16, padX: 12, padY: 9 };
const commentBox = (P: XY, d: any) => { const s = boxSize(textOf(d), d.fontSize || COMMENT.fs, COMMENT.padX, COMMENT.padY); return { ...s, x: P.x, y: P.y - s.h }; };
export function renderComment(c: RenderCtx) {
  const [P] = c.p;
  const b = commentBox(P, c.d);
  const r = Math.min(18, b.h / 2);
  return (
    <Group>
      <Rect x={b.x} y={b.y} width={b.w} height={b.h} cornerRadius={[r, r, r, 0]} fill={c.d.fill || '#2962FF'} onClick={() => c.editText()} />
      {shown(c) && textNode(b.x + COMMENT.padX, b.y + COMMENT.padY, textOf(c.d), c.d.fontSize || COMMENT.fs, c.d.textColor || '#ffffff', () => c.editText())}
    </Group>
  );
}
export const commentAt = ({ p, d }: GeomCtx): TextGeom => { const b = commentBox(p[0], d); return { x: b.x + b.w / 2, y: b.y + b.h / 2, color: d.textColor || '#ffffff', fontSize: d.fontSize || COMMENT.fs }; };

// ---- Price label: the point's price in a blue tag up and to the right, pointing at it
export function renderPriceLabel(c: RenderCtx) {
  const [P] = c.p;
  const color = c.d.fill || '#2962FF';
  const t = c.fmtPrice(c.pts[0].price);
  const w = textWidth(t, 14) * 1.08 + 16, h = 24;
  const x = P.x + 8, y = P.y - h - 6;
  return (
    <Group>
      <Shape fill={color} sceneFunc={(ctx, s) => { ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(x + 4, y + h); ctx.lineTo(x + 14, y + h); ctx.closePath(); ctx.fillShape(s); }} />
      <Rect x={x} y={y} width={w} height={h} cornerRadius={3} fill={color} />
      <Text x={x} y={y + 5} width={w} align="center" text={t} fontSize={14} fontStyle="bold" fontFamily={SHAPE_FONT} fill={c.d.textColor || '#ffffff'} listening={false} />
    </Group>
  );
}

// ---- Signpost: a post up from the point with a blue plate on top
const SIGN = { fs: 12, padX: 8, padY: 5, post: 34 };
const signPlate = (P: XY, d: any) => { const s = boxSize(textOf(d), d.fontSize || SIGN.fs, SIGN.padX, SIGN.padY); return { ...s, x: P.x - s.w / 2, y: P.y - SIGN.post - s.h }; };
export function renderSignpost(c: RenderCtx) {
  const [P] = c.p;
  const color = c.d.fill || '#2962FF';
  const b = signPlate(P, c.d);
  return (
    <Group>
      <Line points={[P.x, P.y, P.x, b.y + b.h]} stroke={color} strokeWidth={2} hitStrokeWidth={10} />
      <Rect x={b.x} y={b.y} width={b.w} height={b.h} cornerRadius={4} fill={color} onClick={() => c.editText()} />
      {shown(c) && textNode(b.x + SIGN.padX, b.y + SIGN.padY, textOf(c.d), c.d.fontSize || SIGN.fs, c.d.textColor || '#ffffff', () => c.editText())}
    </Group>
  );
}
export const signpostAt = ({ p, d }: GeomCtx): TextGeom => { const b = signPlate(p[0], d); return { x: b.x + b.w / 2, y: b.y + b.h / 2, color: d.textColor || '#ffffff', fontSize: d.fontSize || SIGN.fs }; };

// ---- Flag mark: a small blue flag on a pole standing on the point
export function renderFlag(c: RenderCtx) {
  const [P] = c.p;
  const color = c.d.fill || c.d.stroke || '#2962FF';
  return (
    <Group>
      <Line points={[P.x, P.y, P.x, P.y - 22]} stroke="#787b86" strokeWidth={1.5} hitStrokeWidth={10} />
      <Shape fill={color} sceneFunc={(ctx, s) => {
        ctx.beginPath(); ctx.moveTo(P.x, P.y - 22); ctx.lineTo(P.x + 18, P.y - 22); ctx.lineTo(P.x + 13, P.y - 17); ctx.lineTo(P.x + 18, P.y - 12); ctx.lineTo(P.x, P.y - 12); ctx.closePath(); ctx.fillShape(s);
      }} />
    </Group>
  );
}

// ---- Image: the chosen picture stretched between its two corners
function useImage(src?: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    const im = new window.Image();
    im.onload = () => setImg(im);
    im.src = src;
  }, [src]);
  return img;
}
function ImageNode({ src, x, y, w, h }: { src?: string; x: number; y: number; w: number; h: number }) {
  const img = useImage(src);
  return img ? <KImage image={img} x={x} y={y} width={w} height={h} /> : <Rect x={x} y={y} width={w} height={h} fill="rgba(41,98,255,0.06)" stroke="#2962FF" dash={[4, 4]} />;
}
export function renderImage(c: RenderCtx) {
  const [A, B] = c.p;
  if (!B) return null;
  return <Group><ImageNode src={c.d.imageData} x={Math.min(A.x, B.x)} y={Math.min(A.y, B.y)} w={Math.abs(B.x - A.x)} h={Math.abs(B.y - A.y)} /></Group>;
}

// ---- Post / Idea: a card for the linked X post or TradingView idea, from the point
function linkCard(c: RenderCtx, kind: 'post' | 'idea') {
  const [P] = c.p;
  const url: string = c.d.url || '';
  let title = '', sub = '';
  if (kind === 'post') {
    const m = url.match(/(?:x|twitter)\.com\/([^/?#]+)/i);
    title = m ? `@${m[1]}` : 'X post'; sub = 'View post on X';
  } else {
    const m = url.match(/\/chart\/[^/]+\/[^-]+-([^/?#]+)/) || url.match(/ideas?\/([^/?#]+)/);
    title = m ? decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').replace(/\/$/, '') : 'TradingView idea'; sub = 'View idea on TradingView';
  }
  const w = Math.max(240, textWidth(title, 14) + 70), h = 64;
  return (
    <Group>
      <Rect x={P.x} y={P.y} width={w} height={h} cornerRadius={8} fill={c.dark ? '#1e222d' : '#ffffff'} stroke={c.dark ? '#363a45' : '#e0e3eb'} strokeWidth={1} shadowColor="rgba(0,0,0,0.12)" shadowBlur={6} shadowOffsetY={1} />
      <Circle x={P.x + 26} y={P.y + h / 2} radius={16} fill={kind === 'post' ? '#0F0F0F' : '#2962FF'} listening={false} />
      <Text x={P.x + 10} y={P.y + h / 2 - 8} width={32} align="center" text={kind === 'post' ? '𝕏' : 'TV'} fontSize={kind === 'post' ? 16 : 12} fontStyle="bold" fontFamily={SHAPE_FONT} fill="#ffffff" listening={false} />
      <Text x={P.x + 52} y={P.y + 14} text={title} fontSize={14} fontStyle="bold" fontFamily={SHAPE_FONT} fill={c.dark ? '#d1d4dc' : '#0F0F0F'} listening={false} />
      <Text x={P.x + 52} y={P.y + 36} text={sub} fontSize={12} fontFamily={SHAPE_FONT} fill="#2962FF" listening={false} />
    </Group>
  );
}
export const renderPost = (c: RenderCtx) => linkCard(c, 'post');
export const renderIdea = (c: RenderCtx) => linkCard(c, 'idea');
