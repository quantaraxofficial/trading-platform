// A single-stroke font for writing with the brush ("write Rahul with the brush"): each character as
// the pen strokes that draw it, on a 4 x 6 grid (x right, y down; letters sit on y = 6). Capitals,
// digits and a little punctuation; lowercase is written in capitals. Corners are rounded and the
// strokes subdivided when laid out, so they read as handwriting rather than straight segments.

type Pt = [number, number];
type Glyph = Pt[][];

const O: Glyph = [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]];
const P: Glyph = [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]];

const GLYPHS: Record<string, Glyph> = {
  A: [[[0, 6], [2, 0], [4, 6]], [[1, 3.6], [3, 3.6]]],
  B: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.5], [2.2, 3.5]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 0], [3, 0]], [[2, 0], [2, 6]], [[1, 6], [3, 6]]],
  J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.3, 2.6], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3.5], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O,
  P,
  Q: [...O, [[2.5, 4.5], [4, 6]]],
  R: [...P, [[2, 3], [4, 6]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  0: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[3.6, 0.6], [0.4, 5.4]]],
  1: [[[1, 1.2], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
  2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  3: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [2, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  4: [[[3, 6], [3, 0], [0, 4], [4, 4]]],
  5: [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  6: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  7: [[[0, 0], [4, 0], [1.5, 6]]],
  8: [[[1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
  9: [[[4, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5]]],
  ".": [[[2, 5.7], [2, 6]]],
  ",": [[[2.2, 5.4], [2, 6.6]]],
  "!": [[[2, 0], [2, 4.4]], [[2, 5.7], [2, 6]]],
  "?": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [2, 3.4], [2, 4.4]], [[2, 5.7], [2, 6]]],
  "-": [[[1, 3], [3, 3]]],
  "'": [[[2, 0], [2, 1.5]]],
  "/": [[[0, 6], [4, 0]]],
  ":": [[[2, 1.7], [2, 2]], [[2, 4.7], [2, 5]]],
  "+": [[[2, 1.5], [2, 4.5]], [[0.5, 3], [3.5, 3]]],
};

const ADVANCE = 5.6;   // grid units from one character to the next
const SPACE = 3.5;

// The text as pen strokes in grid units (x from 0, y 0..6), the characters it couldn't write
export function strokesFor(text: string): { strokes: Pt[][]; width: number; skipped: string[] } {
  const strokes: Pt[][] = [];
  const skipped: string[] = [];
  let x = 0;
  for (const ch of Array.from(text.toUpperCase())) {
    if (ch === " ") { x += SPACE; continue; }
    const g = GLYPHS[ch];
    if (!g) { if (!skipped.includes(ch)) skipped.push(ch); continue; }
    for (const s of g) strokes.push(smooth(s.map(([px, py]) => [px + x, py] as Pt)));
    x += ADVANCE;
  }
  return { strokes, width: Math.max(0, x - (ADVANCE - 4)), skipped };
}

// Rounded and subdivided (Chaikin's corner cutting, twice): a pen's curve, not ruler lines
function smooth(stroke: Pt[]): Pt[] {
  if (stroke.length < 3) return stroke;
  let pts = stroke;
  for (let k = 0; k < 2; k++) {
    const next: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}
