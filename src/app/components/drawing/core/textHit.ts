// Hit region for a Konva Text laid out inside a shape's box (a rectangle's, a circle's): only
// the text's own lines, with a little slack, rather than Konva's default of the whole box. With
// the default, a label as wide and tall as its shape took every click inside it — and on its
// top and left edges — so clicking the shape's border opened the text editor instead of
// selecting the shape. Mirrors the line layout of Konva's Text sceneFunc.
export function textLinesHitFunc(context: any, shape: any) {
  const lines: { width: number }[] = shape.textArr || [];
  if (!lines.length || !shape.text()) return;
  const pad = shape.padding(), lh = shape.lineHeight() * shape.fontSize();
  const w = shape.width(), h = shape.height();
  const va = shape.verticalAlign(), align = shape.align();
  let y = pad + (va === 'middle' ? (h - lines.length * lh - pad * 2) / 2 : va === 'bottom' ? h - lines.length * lh - pad * 2 : 0);
  context.beginPath();
  for (const line of lines) {
    const x = pad + (align === 'center' ? (w - line.width - pad * 2) / 2 : align === 'right' ? w - line.width - pad * 2 : 0);
    context.rect(x - 3, y, line.width + 6, lh);
    y += lh;
  }
  context.closePath();
  context.fillStrokeShape(shape);
}
