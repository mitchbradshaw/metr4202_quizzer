// 2D geometry for planners and collision checking: points, segments, rectangles, circles and polygons.

export interface Vec2 {
  x: number;
  y: number;
}

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'poly'; pts: Vec2[] };

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Polygon vertices of any shape (circles as a regular n-gon), anticlockwise. */
export function shapePoly(s: Shape, n = 24): Vec2[] {
  if (s.kind === 'poly') return s.pts;
  if (s.kind === 'rect')
    return [
      { x: s.x, y: s.y },
      { x: s.x + s.w, y: s.y },
      { x: s.x + s.w, y: s.y + s.h },
      { x: s.x, y: s.y + s.h },
    ];
  return Array.from({ length: n }, (_, i) => ({ x: s.x + s.r * Math.cos((2 * Math.PI * i) / n), y: s.y + s.r * Math.sin((2 * Math.PI * i) / n) }));
}

/** Axis-aligned bounding box [minX, minY, maxX, maxY]. */
export function shapeBounds(s: Shape): [number, number, number, number] {
  if (s.kind === 'rect') return [s.x, s.y, s.x + s.w, s.y + s.h];
  if (s.kind === 'circle') return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  for (const p of s.pts) {
    a = Math.min(a, p.x);
    b = Math.min(b, p.y);
    c = Math.max(c, p.x);
    d = Math.max(d, p.y);
  }
  return [a, b, c, d];
}

export function shapeCentre(s: Shape): Vec2 {
  if (s.kind === 'rect') return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  if (s.kind === 'circle') return { x: s.x, y: s.y };
  const n = s.pts.length;
  return { x: s.pts.reduce((t, p) => t + p.x, 0) / n, y: s.pts.reduce((t, p) => t + p.y, 0) / n };
}

/** Move a shape by (dx, dy). */
export function translateShape(s: Shape, dx: number, dy: number): Shape {
  if (s.kind === 'rect') return { ...s, x: s.x + dx, y: s.y + dy };
  if (s.kind === 'circle') return { ...s, x: s.x + dx, y: s.y + dy };
  return { kind: 'poly', pts: s.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

export function pointInPoly(p: Vec2, pts: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function pointInShape(p: Vec2, s: Shape): boolean {
  if (s.kind === 'rect') return p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h;
  if (s.kind === 'circle') return (p.x - s.x) ** 2 + (p.y - s.y) ** 2 <= s.r * s.r;
  return pointInPoly(p, s.pts);
}

const orient = (a: Vec2, b: Vec2, c: Vec2) => cross(sub(b, a), sub(c, a));

function onSeg(a: Vec2, b: Vec2, p: Vec2) {
  return Math.min(a.x, b.x) - 1e-12 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-12 && Math.min(a.y, b.y) - 1e-12 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-12;
}

/** Do segments ab and cd touch or cross? */
export function segSeg(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (Math.abs(d1) < 1e-12 && onSeg(c, d, a)) return true;
  if (Math.abs(d2) < 1e-12 && onSeg(c, d, b)) return true;
  if (Math.abs(d3) < 1e-12 && onSeg(a, b, c)) return true;
  if (Math.abs(d4) < 1e-12 && onSeg(a, b, d)) return true;
  return false;
}

/** Shortest distance from p to segment ab. */
export function distPointSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0;
  return dist(p, lerp(a, b, t));
}

/** Does the segment ab touch the shape (cross its boundary or lie inside it)? */
export function segHitsShape(a: Vec2, b: Vec2, s: Shape): boolean {
  if (s.kind === 'circle') return distPointSeg({ x: s.x, y: s.y }, a, b) <= s.r;
  if (s.kind === 'rect') {
    // quick reject on bounding boxes
    if (Math.max(a.x, b.x) < s.x || Math.min(a.x, b.x) > s.x + s.w || Math.max(a.y, b.y) < s.y || Math.min(a.y, b.y) > s.y + s.h) return false;
  }
  if (pointInShape(a, s) || pointInShape(b, s)) return true;
  const pts = shapePoly(s);
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if (segSeg(a, b, pts[j], pts[i])) return true;
  return false;
}

/** Distance from p to the shape (0 inside). */
export function distToShape(p: Vec2, s: Shape): number {
  if (pointInShape(p, s)) return 0;
  if (s.kind === 'circle') return Math.max(0, Math.hypot(p.x - s.x, p.y - s.y) - s.r);
  if (s.kind === 'rect') {
    const dx = Math.max(s.x - p.x, 0, p.x - (s.x + s.w));
    const dy = Math.max(s.y - p.y, 0, p.y - (s.y + s.h));
    return Math.hypot(dx, dy);
  }
  let d = Infinity;
  const pts = s.pts;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, distPointSeg(p, pts[j], pts[i]));
  return d;
}

/** Closest point on the shape's boundary to p (for repulsive-force directions). */
export function closestPointOnShape(p: Vec2, s: Shape): Vec2 {
  if (s.kind === 'circle') {
    const d = Math.hypot(p.x - s.x, p.y - s.y) || 1e-9;
    return { x: s.x + ((p.x - s.x) / d) * s.r, y: s.y + ((p.y - s.y) / d) * s.r };
  }
  if (s.kind === 'rect' && !pointInShape(p, s)) return { x: Math.max(s.x, Math.min(p.x, s.x + s.w)), y: Math.max(s.y, Math.min(p.y, s.y + s.h)) };
  const pts = shapePoly(s);
  let best = pts[0];
  let bd = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j];
    const b = pts[i];
    const ab = sub(b, a);
    const L2 = dot(ab, ab);
    const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0;
    const q = lerp(a, b, t);
    const d = dist(p, q);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}
