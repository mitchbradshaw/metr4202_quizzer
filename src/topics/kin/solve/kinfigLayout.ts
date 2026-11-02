// Exam-style arm figure as pure layout (no React; self-tested under Node). Any ArmSpec is drawn at its zero
// configuration the way the papers draw it (2023 Q33, 2024 Q30, 2025 Q30, review deck slide 20):
//   - an oblique projection: the view's "right" and "up" directions are drawn as they are, and the direction
//     out of the page is drawn diagonally down-left (about 33° below horizontal, foreshortened to 0.7);
//   - links as thick lines; a revolute joint as a cylinder along its axis with a curved arrow whose sense is the
//     right-hand rule about the joint's signed ω (so the drawing and the answer table can never disagree); a
//     prismatic joint as a box with a straight arrow along its direction of travel;
//   - a joint whose axis runs along an adjacent link is slid along that link (any point on the axis is the same
//     joint, exactly as the papers draw it); otherwise it sits at the corner, with its axis dashed;
//   - the {s} and {b} frames as labelled triads, detached from the arm with a leader to the frame origin;
//   - dimension lines for L1, L2, … found from the symbolic geometry (two points one symbol apart along an axis);
//   - overlays the student can reveal after answering: the q_i vectors and ω_i arrows, p, the line of sight.
// Lengths are drawn with a floor (no length under 45 % of the longest), since the papers are not to scale either.
import { add3, cross3, dot3, linVecEval, norm3, scale3, sub3, type ArmSpec, type LinVec, type Vec3 } from '../../../core/kin';

export interface P2 {
  x: number;
  y: number;
}
export type Anchor = 'start' | 'middle' | 'end';
export interface FigText {
  k: 'text';
  x: number;
  y: number;
  /** Upright text before the symbol, e.g. 'optical axis '. */
  pre?: string;
  /** The symbol, set in italics (x, θ, L, q, ω). */
  main: string;
  sub?: string;
  /** A hat on the symbol (unit vectors x̂, ŷ, ẑ). */
  hat?: boolean;
  anchor: Anchor;
  cls: string;
}
export type FigItem =
  | { k: 'line'; a: P2; b: P2; cls: string }
  | { k: 'path'; pts: P2[]; closed: boolean; cls: string }
  | { k: 'curve'; a: P2; c1: P2; c2: P2; b: P2; cls: string }
  | { k: 'dot'; c: P2; r: number; cls: string }
  | FigText;

/** Reveals: the screw-axis geometry in {s} or {b}, the vector p, the camera's line of sight. */
export type OverlayId = 'screws-s' | 'screws-b' | 'p' | 'sight';

export interface ArmFigureModel {
  W: number;
  H: number;
  items: FigItem[];
  overlays: Partial<Record<OverlayId, FigItem[]>>;
  aria: string;
  /** Diagnostics for the self-tests: which lengths got a dimension line, the tightest label gap (px). */
  stats: { dims: string[]; minLabelGap: number; joints: number };
}

export interface ArmFigureOpts {
  overlays?: OverlayId[];
  /** Subscripts of the frame axes (default 's' and 'b'). */
  sName?: string;
  bName?: string;
}

// ------------------------------------------------------------------ projection

const PHI = (33 * Math.PI) / 180;
const KO = 0.7;
const OX = -KO * Math.cos(PHI);
const OY = -KO * Math.sin(PHI);

/** Pixel sizes of the glyphs (the 3-D sizes follow from the scale). */
const PX = { cylLen: 30, cylR: 9.5, arcR: 13, boxLen: 34, boxW: 8, triad: 34, dimOff: 26, dimStep: 18, font: 14 };

type View = ArmSpec['view'];

/** Screen position (px, y down) of a point in {s}. Linear, so it also maps directions. */
function projector(view: View, s: number) {
  return (v: Vec3): P2 => {
    const a = dot3(v, view.right);
    const b = dot3(v, view.up);
    const c = dot3(v, view.out);
    return { x: s * (a + OX * c), y: -s * (b + OY * c) };
  };
}

/** Screen position at unit scale (y down): the figure's projection, for layout checks elsewhere. */
export const projectUnit = (view: View, v: Vec3): P2 => projector(view, 1)(v);

/** Distance from a point to a segment, and whether two segments cross (screen space). */
export { pointSegDist, segSegDist };

/** The projection direction, pointing towards the viewer (it projects to a point). */
export function viewRay(view: View): Vec3 {
  return add3(add3(scale3(view.right, -OX), scale3(view.up, -OY)), view.out);
}

// ------------------------------------------------------------------ 2-D helpers

const add2 = (a: P2, b: P2): P2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub2 = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
const mul2 = (a: P2, k: number): P2 => ({ x: a.x * k, y: a.y * k });
const len2 = (a: P2) => Math.hypot(a.x, a.y);
const unit2 = (a: P2): P2 => {
  const l = len2(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
const dot2 = (a: P2, b: P2) => a.x * b.x + a.y * b.y;
const cross2 = (a: P2, b: P2) => a.x * b.y - a.y * b.x;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function pointSegDist(p: P2, a: P2, b: P2): number {
  const d = sub2(b, a);
  const L2 = dot2(d, d);
  const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot2(sub2(p, a), d) / L2));
  return len2(sub2(p, add2(a, mul2(d, t))));
}

function segsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => cross2(sub2(q, p), sub2(r, p));
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function segSegDist(a: P2, b: P2, c: P2, d: P2): number {
  if (segsCross(a, b, c, d)) return 0;
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
}

function segHitsBox(a: P2, b: P2, B: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, a.x - B.x0) && clip(dx, B.x1 - a.x) && clip(-dy, a.y - B.y0) && clip(dy, B.y1 - a.y);
}

function pointBoxDist(p: P2, B: Box): number {
  const dx = Math.max(B.x0 - p.x, 0, p.x - B.x1);
  const dy = Math.max(B.y0 - p.y, 0, p.y - B.y1);
  return Math.hypot(dx, dy);
}

function segBoxDist(a: P2, b: P2, B: Box): number {
  if (segHitsBox(a, b, B)) return -4;
  const corners: P2[] = [
    { x: B.x0, y: B.y0 },
    { x: B.x1, y: B.y0 },
    { x: B.x1, y: B.y1 },
    { x: B.x0, y: B.y1 },
  ];
  return Math.min(pointBoxDist(a, B), pointBoxDist(b, B), ...corners.map((c) => pointSegDist(c, a, b)));
}

function boxGap(a: Box, b: Box): number {
  const dx = Math.max(b.x0 - a.x1, a.x0 - b.x1);
  const dy = Math.max(b.y0 - a.y1, a.y0 - b.y1);
  if (dx < 0 && dy < 0) return Math.max(dx, dy) - 2; // overlapping: negative depth
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

function pointInPoly(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Everything placed so far, for clearance tests (px). */
class Field {
  /** `owner` tags the segments of joint glyphs (joint index), so a dimension can ignore the glyph it starts in. */
  segs: { a: P2; b: P2; r: number; owner: number }[] = [];
  boxes: Box[] = [];
  polys: P2[][] = [];
  seg(a: P2, b: P2, r = 1, owner = -1) {
    this.segs.push({ a, b, r, owner });
  }
  line(pts: P2[], r = 1, closed = false, owner = -1) {
    for (let i = 0; i + 1 < pts.length; i++) this.seg(pts[i], pts[i + 1], r, owner);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1], pts[0], r, owner);
  }
  box(b: Box) {
    this.boxes.push(b);
  }
  poly(pts: P2[], owner = -1) {
    this.polys.push(pts);
    this.line(pts, 1, true, owner);
  }
  clone(): Field {
    const f = new Field();
    f.segs = this.segs.slice();
    f.boxes = this.boxes.slice();
    f.polys = this.polys.slice();
    return f;
  }
  /** Smallest gap (px) between a box and anything placed; negative when they overlap. */
  gapBox(B: Box): number {
    let g = Infinity;
    for (const s of this.segs) g = Math.min(g, segBoxDist(s.a, s.b, B) - s.r);
    for (const o of this.boxes) g = Math.min(g, boxGap(B, o));
    const c = { x: (B.x0 + B.x1) / 2, y: (B.y0 + B.y1) / 2 };
    for (const p of this.polys) if (pointInPoly(c, p)) g = Math.min(g, -6);
    return g;
  }
  /** Smallest gap (px) between a segment and anything placed. */
  gapSeg(a: P2, b: P2, skipNear?: P2[], skipOwners?: number[]): number {
    let g = Infinity;
    for (const s of this.segs) {
      if (skipNear && skipNear.some((q) => pointSegDist(q, s.a, s.b) < 1.5)) continue;
      if (skipOwners && s.owner >= 0 && skipOwners.includes(s.owner)) continue;
      g = Math.min(g, segSegDist(a, b, s.a, s.b) - s.r);
    }
    for (const o of this.boxes) g = Math.min(g, segBoxDist(a, b, o));
    return g;
  }
  /** How many placed segments a polyline crosses. */
  crossings(pts: P2[]): number {
    let n = 0;
    for (let i = 0; i + 1 < pts.length; i++) for (const s of this.segs) if (segsCross(pts[i], pts[i + 1], s.a, s.b)) n++;
    return n;
  }
}

/** Clearance as a score: capped when clear, steeply negative when overlapping. */
const soft = (gap: number, cap: number) => (gap < 0 ? 5 * gap : Math.min(gap, cap));

/** Approximate box of a label (px): italic symbol, optional hat and subscript. */
function textBox(t: { x: number; y: number; pre?: string; main: string; sub?: string; hat?: boolean; anchor: Anchor }, size = PX.font): Box {
  const w = (t.pre ? t.pre.length * 0.52 * size : 0) + t.main.length * 0.62 * size + (t.sub ? t.sub.length * 0.5 * size + 1 : 0);
  const x0 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2;
  return { x0, y0: t.y - (t.hat ? 0.95 : 0.78) * size, x1: x0 + w, y1: t.y + (t.sub ? 0.36 : 0.2) * size };
}

/** A label centred on a point (baseline adjusted so the glyphs sit around it). */
function labelAt(c: P2, main: string, extra: Partial<FigText> & { cls: string }): FigText {
  return { k: 'text', x: c.x, y: c.y + 0.32 * PX.font, main, anchor: 'middle', ...extra };
}

function arrowHead(tip: P2, dir: P2, len = 8, half = 3.6): P2[] {
  const u = unit2(dir);
  const n = { x: -u.y, y: u.x };
  const base = sub2(tip, mul2(u, len));
  return [tip, add2(base, mul2(n, half)), sub2(base, mul2(n, half))];
}

function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: P2, a: P2, b: P2) => cross2(sub2(a, o), sub2(b, o));
  const lower: P2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Unit u, w perpendicular to the unit axis a with u × w = a (so increasing angle is positive rotation about a). */
function perpBasis(a: Vec3): [Vec3, Vec3] {
  const h: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u0 = cross3(h, a);
  const u = scale3(u0, 1 / norm3(u0));
  return [u, cross3(a, u)];
}

// ------------------------------------------------------------------ arm geometry

/** Drawing lengths: the true values, but none shorter than 45 % of the longest (the papers are not to scale). */
export function drawValues(arm: ArmSpec): Record<string, number> {
  const mx = Math.max(...arm.symbols.map((s) => arm.values[s]));
  return Object.fromEntries(arm.symbols.map((s) => [s, Math.max(arm.values[s], 0.45 * mx)]));
}

interface Seg3 {
  a: Vec3;
  b: Vec3;
  after: number;
}

function linkSegments(arm: ArmSpec, dv: Record<string, number>): Seg3[] {
  const out: Seg3[] = [];
  for (const l of arm.links)
    for (let k = 0; k + 1 < l.pts.length; k++) {
      const a = linVecEval(l.pts[k], dv);
      const b = linVecEval(l.pts[k + 1], dv);
      if (norm3(sub3(b, a)) > 1e-9) out.push({ a, b, after: l.after });
    }
  return out;
}

interface Place {
  c: Vec3;
  /** Index of the link segment the joint was slid onto, or −1 when it sits at its corner. */
  seg: number;
  /** Length of segment available to this joint (3-D units). */
  room: number;
}

/**
 * Where each joint is drawn (see the header). In order of preference: slid along a link that lies on the joint's
 * axis line (one through q, or an adjacent one); at a link corner on the axis line (e.g. a vertical axis whose q
 * was written at floor level); else at q.
 */
export function placeJoints(arm: ArmSpec, dv: Record<string, number>, segs: Seg3[]): Place[] {
  const onSeg: number[][] = segs.map(() => []);
  const corner: (Vec3 | null)[] = arm.joints.map(() => null);
  const onLine = (x: Vec3, q: Vec3, a: Vec3) => norm3(cross3(sub3(x, q), a)) < 1e-6;
  const assign = arm.joints.map((j, i) => {
    const q = linVecEval(j.q, dv);
    let best = -1;
    let rank = 99;
    segs.forEach((g, k) => {
      const d = sub3(g.b, g.a);
      const L = norm3(d);
      if (Math.abs(Math.abs(dot3(d, j.axis)) / L - 1) > 1e-6 || !onLine(g.a, q, j.axis)) return;
      const t = dot3(sub3(q, g.a), d) / (L * L);
      const contains = t > -1e-6 && t < 1 + 1e-6;
      const r = contains ? (g.after === i + 1 ? 0 : g.after === i ? 1 : 2) : g.after === i + 1 ? 3 : g.after === i ? 4 : 99;
      if (r < rank) {
        rank = r;
        best = k;
      }
    });
    if (best >= 0) {
      onSeg[best].push(i);
      return best;
    }
    let vr = 99;
    arm.links.forEach((l) =>
      l.pts.forEach((pt, idx) => {
        const v = linVecEval(pt, dv);
        if (!onLine(v, q, j.axis)) return;
        const r = l.after === i + 1 && idx === 0 ? 0 : l.after === i && idx === l.pts.length - 1 ? 1 : 2;
        if (r < vr) {
          vr = r;
          corner[i] = v;
        }
      })
    );
    return -1;
  });
  return arm.joints.map((j, i) => {
    const k = assign[i];
    if (k < 0) return { c: corner[i] ?? linVecEval(j.q, dv), seg: -1, room: Infinity };
    const g = segs[k];
    const list = onSeg[k];
    const t = (list.indexOf(i) + 1) / (list.length + 1);
    const L = norm3(sub3(g.b, g.a));
    return { c: add3(g.a, scale3(sub3(g.b, g.a), t)), seg: k, room: L / (list.length + 1) };
  });
}

/** Key points (vertices of the link polylines, then p) as linear forms and numbers. */
function keyPoints(arm: ArmSpec): { lin: LinVec; poly: number; idx: number }[] {
  const out: { lin: LinVec; poly: number; idx: number }[] = [];
  arm.links.forEach((l, pi) => l.pts.forEach((p, idx) => out.push({ lin: p, poly: pi, idx })));
  out.push({ lin: arm.p, poly: -1, idx: 0 });
  return out;
}

/** b − a when it is exactly ±symbol along one axis: the axis index and sign; else null. */
function oneSymbolApart(a: LinVec, b: LinVec, sym: string): { axis: number; sign: number } | null {
  let hit: { axis: number; sign: number } | null = null;
  for (let k = 0; k < 3; k++) {
    const keys = new Set([...Object.keys(a[k]), ...Object.keys(b[k])]);
    const diff: Record<string, number> = {};
    for (const key of keys) {
      const d = (b[k][key] ?? 0) - (a[k][key] ?? 0);
      if (Math.abs(d) > 1e-12) diff[key] = d;
    }
    const ks = Object.keys(diff);
    if (!ks.length) continue;
    if (hit || ks.length !== 1 || ks[0] !== sym || Math.abs(Math.abs(diff[sym]) - 1) > 1e-12) return null;
    hit = { axis: k, sign: Math.sign(diff[sym]) };
  }
  return hit;
}

/** For each length symbol, the point pairs its dimension lines span (every link that is exactly that length). */
export function dimensionPairs(arm: ArmSpec): { sym: string; a: LinVec; b: LinVec; axis: number }[] {
  const pts = keyPoints(arm);
  const out: { sym: string; a: LinVec; b: LinVec; axis: number }[] = [];
  for (const sym of arm.symbols) {
    const segPairs: { a: LinVec; b: LinVec; axis: number }[] = [];
    let other: { a: LinVec; b: LinVec; axis: number } | null = null;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const h = oneSymbolApart(pts[i].lin, pts[j].lin, sym);
        if (!h) continue;
        const consecutive = pts[i].poly === pts[j].poly && pts[i].poly >= 0 && Math.abs(pts[i].idx - pts[j].idx) === 1;
        if (consecutive) segPairs.push({ a: pts[i].lin, b: pts[j].lin, axis: h.axis });
        else if (!other) other = { a: pts[i].lin, b: pts[j].lin, axis: h.axis };
      }
    const chosen = segPairs.length ? segPairs : other ? [other] : [];
    for (const c of chosen) out.push({ sym, ...c });
  }
  return out;
}

const UNIT: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Split 'L12' into L and 12 for a subscript. */
export function symParts(sym: string): { main: string; sub?: string } {
  const m = /^([A-Za-z]+)(\d*)$/.exec(sym);
  return m ? { main: m[1], sub: m[2] || undefined } : { main: sym };
}

// ------------------------------------------------------------------ the layout

export function layoutArmFigure(arm: ArmSpec, opts: ArmFigureOpts = {}): ArmFigureModel {
  const dv = drawValues(arm);
  const view = arm.view;
  const ray = viewRay(view);
  const segs = linkSegments(arm, dv);
  const pEnd = linVecEval(arm.p, dv);
  const origin: Vec3 = [0, 0, 0];

  // Scale: the skeleton fits about 460 × 320 px, and the shortest drawn link is at least ~58 px long.
  const P1 = projector(view, 1);
  const skel: Vec3[] = [origin, pEnd, ...segs.flatMap((g) => [g.a, g.b])];
  const sk = skel.map(P1);
  const wU = Math.max(1e-6, Math.max(...sk.map((p) => p.x)) - Math.min(...sk.map((p) => p.x)));
  const hU = Math.max(1e-6, Math.max(...sk.map((p) => p.y)) - Math.min(...sk.map((p) => p.y)));
  const shortest = Math.min(...segs.map((g) => len2(P1(sub3(g.b, g.a)))));
  const s = Math.max(Math.min(460 / wU, 320 / hU, 250), Math.min(58 / Math.max(shortest, 1e-6), 320));
  const P = projector(view, s);
  /** Screen length (px) of one 3-D unit along a direction. */
  const pxPerUnit = (d: Vec3) => len2(P(d));

  const items: FigItem[] = [];
  const field = new Field();
  const labelGaps: number[] = [];

  // ---- links
  for (const g of segs) {
    const a = P(g.a);
    const b = P(g.b);
    items.push({ k: 'line', a, b, cls: 'kin-fig-link' });
    field.seg(a, b, 2.4);
  }

  // ---- joints (far ones first)
  const places = placeJoints(arm, dv, segs);
  const glyphBoxes: Box[] = [];
  const glyphTips: P2[] = []; // screen point where each joint's ω / v overlay arrow can start
  const order = arm.joints.map((_, i) => i).sort((i, j) => dot3(places[i].c, ray) - dot3(places[j].c, ray));
  const glyphItems: FigItem[][] = arm.joints.map(() => []);
  const glyphReach: number[] = arm.joints.map(() => 0); // 3-D distance from the centre to the end of the glyph (along +axis)
  for (const i of order) {
    const J = arm.joints[i];
    const pl = places[i];
    const a = J.axis;
    const [u, w] = perpBasis(a);
    const out: FigItem[] = glyphItems[i];
    const pts2: P2[] = [];
    if (J.type === 'R') {
      const hl = Math.min(PX.cylLen / 2 / s, pl.seg >= 0 ? 0.4 * pl.room : Infinity);
      const r = PX.cylR / s;
      const ra = PX.arcR / s;
      const sv = dot3(a, ray) >= 0 ? 1 : -1; // the visible end of the cylinder
      const circle = (centre: Vec3, rad: number, n = 36, t0 = 0, t1 = 2 * Math.PI) =>
        Array.from({ length: n + 1 }, (_, k) => {
          const t = t0 + ((t1 - t0) * k) / n;
          return P(add3(centre, add3(scale3(u, rad * Math.cos(t)), scale3(w, rad * Math.sin(t)))));
        });
      const capV = add3(pl.c, scale3(a, sv * hl));
      const capH = add3(pl.c, scale3(a, -sv * hl));
      const ringV = circle(capV, r);
      const ringH = circle(capH, r);
      // extents of the cap and arc ellipses along the projected axis, to keep the arrow clear of the cap
      const ax2 = unit2(P(scale3(a, sv)));
      const extent = (rad: number) => rad * s * Math.hypot(dot2(P1(u), ax2), dot2(P1(w), ax2));
      const gapPx = extent(r) + extent(ra) + 3;
      const arcC = add3(capV, scale3(a, (sv * gapPx) / pxPerUnit(a)));
      const shaftEnd = add3(arcC, scale3(a, (sv * (extent(ra) + 5)) / pxPerUnit(a)));
      if (pl.seg < 0) {
        // corner joint: dash the axis through the cylinder
        const ext = (hl + 14 / pxPerUnit(a)) * 1;
        out.push({ k: 'line', a: P(add3(pl.c, scale3(a, -sv * ext))), b: P(add3(pl.c, scale3(a, sv * ext))), cls: 'kin-fig-axis' });
      }
      const body = hull([...ringV, ...ringH]);
      out.push({ k: 'path', pts: body, closed: true, cls: 'kin-fig-solid' });
      out.push({ k: 'path', pts: ringV, closed: true, cls: 'kin-fig-solid' });
      out.push({ k: 'line', a: P(capV), b: P(shaftEnd), cls: 'kin-fig-shaft' });
      // the rotation arrow: positive rotation about ω, arrowhead on the side facing the viewer
      const tFront = Math.atan2(dot3(w, ray), dot3(u, ray));
      const t1 = tFront + 0.32 * Math.PI;
      const arc = circle(arcC, ra, 40, t1 - 1.55 * Math.PI, t1);
      const last = arc[arc.length - 1];
      const tangent = sub2(last, arc[arc.length - 3]);
      out.push({ k: 'path', pts: arc.slice(0, -2), closed: false, cls: 'kin-fig-arc' });
      out.push({ k: 'path', pts: arrowHead(add2(last, mul2(unit2(tangent), 2)), tangent, 7.5, 3.6), closed: true, cls: 'kin-fig-head' });
      pts2.push(...body, ...arc, P(shaftEnd));
      field.poly(body, i);
      field.line(arc, 1.2, false, i);
      field.seg(P(capV), P(shaftEnd), 1.2, i);
      glyphReach[i] = norm3(sub3(shaftEnd, pl.c));
      glyphTips[i] = P(pl.c);
    } else {
      const hl = Math.min(PX.boxLen / 2 / s, pl.seg >= 0 ? 0.42 * pl.room : Infinity);
      const hw = PX.boxW / s;
      const corner = (sa: number, su: number, sw: number) => add3(pl.c, add3(scale3(a, sa * hl), add3(scale3(u, su * hw), scale3(w, sw * hw))));
      const faces: { n: Vec3; q: Vec3[] }[] = [];
      for (const sgn of [1, -1]) {
        faces.push({ n: scale3(a, sgn), q: [corner(sgn, -1, -1), corner(sgn, 1, -1), corner(sgn, 1, 1), corner(sgn, -1, 1)] });
        faces.push({ n: scale3(u, sgn), q: [corner(-1, sgn, -1), corner(1, sgn, -1), corner(1, sgn, 1), corner(-1, sgn, 1)] });
        faces.push({ n: scale3(w, sgn), q: [corner(-1, -1, sgn), corner(1, -1, sgn), corner(1, 1, sgn), corner(-1, 1, sgn)] });
      }
      const all: P2[] = [];
      for (const f of faces) {
        const q2 = f.q.map(P);
        all.push(...q2);
        if (dot3(f.n, ray) > 1e-9) out.push({ k: 'path', pts: q2, closed: true, cls: 'kin-fig-solid' });
      }
      // the travel arrow, beside the box on its most side-on visible face
      const sides = [u, scale3(u, -1), w, scale3(w, -1)].filter((d) => dot3(d, ray) > 0);
      const axP = unit2(P(a));
      const side = sides.sort((d1, d2) => Math.abs(cross2(axP, unit2(P(d2)))) - Math.abs(cross2(axP, unit2(P(d1)))))[0] ?? u;
      const off = scale3(side, hw + 7 / pxPerUnit(side));
      const a0 = P(add3(pl.c, add3(off, scale3(a, -0.75 * hl))));
      const a1 = P(add3(pl.c, add3(off, scale3(a, 0.75 * hl))));
      out.push({ k: 'line', a: a0, b: sub2(a1, mul2(unit2(sub2(a1, a0)), 5)), cls: 'kin-fig-parrow' });
      out.push({ k: 'path', pts: arrowHead(a1, sub2(a1, a0), 8, 4), closed: true, cls: 'kin-fig-head' });
      const body = hull(all);
      pts2.push(...body, a0, a1);
      field.poly(body, i);
      field.seg(a0, a1, 1.5, i);
      glyphReach[i] = hl;
      glyphTips[i] = P(pl.c);
    }
    const xs = pts2.map((p) => p.x);
    const ys = pts2.map((p) => p.y);
    glyphBoxes[i] = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  for (const i of order) items.push(...glyphItems[i]);

  // ---- frame origins
  const oS = P(origin);
  const oB = P(pEnd);
  items.push({ k: 'dot', c: oS, r: 3, cls: 'kin-fig-origin' }, { k: 'dot', c: oB, r: 3, cls: 'kin-fig-origin' });
  field.box({ x0: oS.x - 4, y0: oS.y - 4, x1: oS.x + 4, y1: oS.y + 4 });
  field.box({ x0: oB.x - 4, y0: oB.y - 4, x1: oB.x + 4, y1: oB.y + 4 });

  // ---- joint labels θ_i, close to their own glyph
  arm.joints.forEach((_, i) => {
    const B = glyphBoxes[i];
    const c = { x: (B.x0 + B.x1) / 2, y: (B.y0 + B.y1) / 2 };
    const hx = (B.x1 - B.x0) / 2;
    const hy = (B.y1 - B.y0) / 2;
    let best: { t: FigText; score: number; gap: number } | null = null;
    for (let k = 0; k < 16; k++) {
      const ang = (k * Math.PI) / 8;
      for (const extra of [9, 18]) {
        const pc = { x: c.x + Math.cos(ang) * (hx + extra + 6), y: c.y + Math.sin(ang) * (hy + extra + 3) };
        const t = labelAt(pc, 'θ', { sub: String(i + 1), cls: 'kin-fig-joint' });
        const gap = field.gapBox(textBox(t));
        const score = soft(gap, 10) - 0.12 * extra - (k % 2 ? 0.3 : 0);
        if (!best || score > best.score) best = { t, score, gap };
      }
    }
    if (best) {
      items.push(best.t);
      field.box(textBox(best.t));
      labelGaps.push(best.gap);
    }
  });

  // ---- frame triads, detached, with a leader to the origin
  const sName = opts.sName ?? 's';
  const bName = opts.bName ?? 'b';
  const Rcols: Vec3[] = [0, 1, 2].map((k) => [arm.R[0][k], arm.R[1][k], arm.R[2][k]] as Vec3);
  const placeTriad = (o2: P2, axes: Vec3[], name: string) => {
    let best: { T: P2; score: number; parts: FigItem[]; boxes: Box[]; segs: [P2, P2][]; gap: number; leader: P2[] } | null = null;
    for (const d of [62, 86, 112]) {
      for (let k = 0; k < 16; k++) {
        const ang = (k * Math.PI) / 8;
        const T = { x: o2.x + d * Math.cos(ang), y: o2.y + d * Math.sin(ang) };
        const parts: FigItem[] = [];
        const boxes: Box[] = [];
        const tsegs: [P2, P2][] = [];
        axes.forEach((ax, m) => {
          const dir = P1(ax);
          const tip = add2(T, mul2(dir, PX.triad));
          const u2 = unit2(dir);
          tsegs.push([T, tip]);
          parts.push({ k: 'line', a: T, b: sub2(tip, mul2(u2, 5)), cls: 'kin-fig-triad' });
          parts.push({ k: 'path', pts: arrowHead(tip, dir, 7.5, 3.4), closed: true, cls: 'kin-fig-triadhead' });
          const lc = add2(tip, mul2(u2, 11));
          const t = labelAt(lc, 'xyz'[m], { hat: true, sub: name, cls: 'kin-fig-axislabel' });
          parts.push(t);
          boxes.push(textBox(t));
        });
        let gap = Infinity;
        for (const [a, b] of tsegs) gap = Math.min(gap, field.gapSeg(a, b));
        for (const b of boxes) gap = Math.min(gap, field.gapBox(b));
        // the leader: a gentle S from the triad's origin to the frame origin
        const L = sub2(o2, T);
        const nrm = { x: -L.y * 0.22, y: L.x * 0.22 };
        const c1 = add2(add2(T, mul2(L, 0.35)), nrm);
        const c2 = sub2(add2(T, mul2(L, 0.65)), nrm);
        const leader = Array.from({ length: 13 }, (_, q) => {
          const t = q / 12;
          const m1 = 1 - t;
          return {
            x: m1 * m1 * m1 * T.x + 3 * m1 * m1 * t * c1.x + 3 * m1 * t * t * c2.x + t * t * t * o2.x,
            y: m1 * m1 * m1 * T.y + 3 * m1 * m1 * t * c1.y + 3 * m1 * t * t * c2.y + t * t * t * o2.y,
          };
        });
        const crosses = field.crossings(leader.slice(0, 11)) + tsegs.reduce((n, [a, b]) => n + (segsCross(a, b, leader[4], leader[8]) ? 1 : 0), 0);
        const score = soft(gap, 14) - 0.07 * d - 25 * crosses;
        if (!best || score > best.score)
          best = {
            T,
            score,
            parts: [{ k: 'curve', a: T, c1, c2, b: o2, cls: 'kin-fig-leader' }, ...parts],
            boxes,
            segs: tsegs,
            gap,
            leader,
          };
      }
    }
    if (!best) return;
    items.push(...best.parts);
    for (const [a, b] of best.segs) field.seg(a, b, 1);
    for (const b of best.boxes) field.box(b);
    field.line(best.leader, 0.5);
    labelGaps.push(best.gap);
  };
  placeTriad(oS, UNIT, sName);
  placeTriad(oB, Rcols, bName);

  // ---- dimension lines
  const dimsPlaced: string[] = [];
  const dimSides: string[] = []; // 'axis/offset-direction' of every dimension placed, to line chains up
  const allPts2 = [...segs.flatMap((g) => [P(g.a), P(g.b)])];
  const cen = mul2(allPts2.reduce((t, p) => add2(t, p), { x: 0, y: 0 }), 1 / Math.max(1, allPts2.length));
  const pairs = dimensionPairs(arm).map((d) => ({ ...d, len: len2(sub2(P(linVecEval(d.b, dv)), P(linVecEval(d.a, dv)))) }));
  pairs.sort((u, v) => v.len - u.len); // the longest first, so a chain of shorter ones lines up with it
  for (const dpair of pairs) {
    const A = linVecEval(dpair.a, dv);
    const B = linVecEval(dpair.b, dv);
    const A2 = P(A);
    const B2 = P(B);
    const dir2 = unit2(sub2(B2, A2));
    // glyphs sitting on the measured points: their outlines do not block the extension lines
    const own = glyphBoxes.map((g, j) => ([A2, B2].some((p) => p.x >= g.x0 - 3 && p.x <= g.x1 + 3 && p.y >= g.y0 - 3 && p.y <= g.y1 + 3) ? j : -1)).filter((j) => j >= 0);
    let best: { score: number; parts: FigItem[]; line: [P2, P2]; ext: [P2, P2][]; box: Box; gap: number; side: string } | null = null;
    for (let m = 0; m < 3; m++) {
      if (m === dpair.axis) continue;
      for (const sgn of [1, -1]) {
        const n3 = scale3(UNIT[m], sgn);
        const off2 = unit2(P(n3));
        if (Math.abs(cross2(dir2, off2)) < 0.3) continue;
        const side = `${dpair.axis}/${m}/${sgn}`;
        for (let level = 0; level < 3; level++) {
          const offPx = PX.dimOff + level * PX.dimStep;
          const o3 = offPx / pxPerUnit(n3);
          const a1 = P(add3(A, scale3(n3, o3)));
          const b1 = P(add3(B, scale3(n3, o3)));
          const gapStart = 5 / pxPerUnit(n3);
          const past = 5 / pxPerUnit(n3);
          const ext: [P2, P2][] = [
            [P(add3(A, scale3(n3, gapStart))), P(add3(A, scale3(n3, o3 + past)))],
            [P(add3(B, scale3(n3, gapStart))), P(add3(B, scale3(n3, o3 + past)))],
          ];
          const mid = mul2(add2(a1, b1), 0.5);
          const sp = symParts(dpair.sym);
          const t = labelAt(add2(mid, mul2(off2, 12)), sp.main, { sub: sp.sub, cls: 'kin-fig-dimlabel' });
          const box = textBox(t);
          // (the line is tested without its last 8 px at each end, so dimensions can chain end to end)
          const trimA = add2(a1, mul2(dir2, 8));
          const trimB = sub2(b1, mul2(dir2, 8));
          const gap = Math.min(field.gapSeg(trimA, trimB), field.gapBox(box), ...ext.map(([p, q]) => field.gapSeg(add2(p, mul2(unit2(sub2(q, p)), 3)), q, [A2, B2], own)));
          const outward = dot2(off2, unit2(sub2(mid, cen)));
          const score = soft(gap, 12) + 5 * outward - 7 * level + (dimSides.includes(side) ? 7 : 0);
          if (!best || score > best.score) {
            const parts: FigItem[] = [
              ...ext.map(([p, q]): FigItem => ({ k: 'line', a: p, b: q, cls: 'kin-fig-ext' })),
              { k: 'line', a: add2(a1, mul2(dir2, 6)), b: sub2(b1, mul2(dir2, 6)), cls: 'kin-fig-dim' },
              { k: 'path', pts: arrowHead(a1, mul2(dir2, -1), 6.5, 2.8), closed: true, cls: 'kin-fig-dimhead' },
              { k: 'path', pts: arrowHead(b1, dir2, 6.5, 2.8), closed: true, cls: 'kin-fig-dimhead' },
              t,
            ];
            best = { score, parts, line: [trimA, trimB], ext, box, gap, side };
          }
        }
      }
    }
    if (!best) continue;
    items.push(...best.parts);
    dimSides.push(best.side);
    field.seg(best.line[0], best.line[1], 1);
    for (const [p, q] of best.ext) field.seg(p, q, 0.5);
    field.box(best.box);
    labelGaps.push(best.gap);
    dimsPlaced.push(dpair.sym);
  }

  // ---- overlays (laid out now so the figure does not jump when one is revealed)
  const overlays: Partial<Record<OverlayId, FigItem[]>> = {};
  const want = new Set(opts.overlays ?? []);
  const arrowItems = (from: P2, to: P2, cls: string, headCls: string): FigItem[] => {
    const d = sub2(to, from);
    if (len2(d) < 4) return [];
    return [
      { k: 'line', a: from, b: sub2(to, mul2(unit2(d), 5)), cls },
      { k: 'path', pts: arrowHead(to, d, 8, 3.8), closed: true, cls: headCls },
    ];
  };
  const placeOvLabel = (f: Field, at: P2, main: string, sub: string | undefined, cls: string, hat = false, pre?: string): FigText => {
    let best: { t: FigText; score: number } | null = null;
    for (let k = 0; k < 12; k++) {
      const ang = (k * Math.PI) / 6;
      for (const r of [12, 20]) {
        const t = labelAt({ x: at.x + r * Math.cos(ang), y: at.y + r * Math.sin(ang) }, main, { sub, cls, hat, pre });
        const score = soft(f.gapBox(textBox(t)), 8) - 0.15 * r;
        if (!best || score > best.score) best = { t, score };
      }
    }
    f.box(textBox(best!.t));
    return best!.t;
  };

  if (want.has('p')) {
    const f = field.clone();
    const ov: FigItem[] = arrowItems(oS, oB, 'kin-fig-ov-p', 'kin-fig-ov-phead');
    ov.push(placeOvLabel(f, mul2(add2(oS, oB), 0.5), 'p', undefined, 'kin-fig-ov-plabel'));
    overlays.p = ov;
  }
  if (want.has('sight')) {
    const z = Rcols[2];
    const tip = add3(pEnd, scale3(z, 120 / pxPerUnit(z)));
    const ov: FigItem[] = [
      { k: 'line', a: oB, b: P(tip), cls: 'kin-fig-ov-sight' },
      { k: 'path', pts: arrowHead(P(tip), sub2(P(tip), oB), 9, 4), closed: true, cls: 'kin-fig-ov-sighthead' },
    ];
    const f = field.clone();
    ov.push(placeOvLabel(f, P(add3(pEnd, scale3(z, 100 / pxPerUnit(z)))), 'z', bName, 'kin-fig-ov-sightlabel', true, 'optical axis '));
    overlays.sight = ov;
  }
  for (const frame of ['s', 'b'] as const) {
    if (!want.has(frame === 's' ? 'screws-s' : 'screws-b')) continue;
    const f = field.clone();
    const ov: FigItem[] = [];
    const O2 = frame === 's' ? oS : oB;
    arm.joints.forEach((J, i) => {
      const pl = places[i];
      const c2 = P(pl.c);
      // ω (or the travel direction) as an arrow along the axis, out past the glyph
      const reach = glyphReach[i] + 16 / pxPerUnit(J.axis);
      const tip = P(add3(pl.c, scale3(J.axis, reach)));
      ov.push(...arrowItems(c2, tip, 'kin-fig-ov-w', 'kin-fig-ov-whead'));
      f.seg(c2, tip, 1);
      ov.push(placeOvLabel(f, tip, J.type === 'R' ? 'ω' : 'v', String(i + 1), 'kin-fig-ov-wlabel'));
      if (J.type !== 'R') return;
      // q: the point on the axis closest to the frame origin (the one the hints use)
      const k = J.axis.findIndex((x) => Math.abs(x) > 0.5);
      let q3: Vec3;
      if (frame === 's') {
        q3 = linVecEval(J.q, dv);
        q3[k] = 0;
      } else {
        const rel = sub3(linVecEval(J.q, dv), pEnd);
        const qb: Vec3 = [dot3(Rcols[0], rel), dot3(Rcols[1], rel), dot3(Rcols[2], rel)];
        const wb: Vec3 = [dot3(Rcols[0], J.axis), dot3(Rcols[1], J.axis), dot3(Rcols[2], J.axis)];
        qb[wb.findIndex((x) => Math.abs(x) > 0.5)] = 0;
        q3 = add3(pEnd, add3(scale3(Rcols[0], qb[0]), add3(scale3(Rcols[1], qb[1]), scale3(Rcols[2], qb[2]))));
      }
      const q2 = P(q3);
      ov.push(...arrowItems(O2, q2, 'kin-fig-ov-q', 'kin-fig-ov-qhead'));
      ov.push({ k: 'dot', c: q2, r: 3.2, cls: 'kin-fig-ov-qdot' });
      f.seg(O2, q2, 1);
      ov.push(placeOvLabel(f, q2, 'q', String(i + 1), 'kin-fig-ov-qlabel'));
    });
    overlays[frame === 's' ? 'screws-s' : 'screws-b'] = ov;
  }

  // ---- fit the view box around everything (overlays included)
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (p: P2) => {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  };
  const visit = (it: FigItem) => {
    if (it.k === 'line') {
      grow(it.a);
      grow(it.b);
    } else if (it.k === 'path') it.pts.forEach(grow);
    else if (it.k === 'curve') [it.a, it.c1, it.c2, it.b].forEach(grow);
    else if (it.k === 'dot') grow(it.c);
    else {
      const b = textBox(it);
      grow({ x: b.x0, y: b.y0 });
      grow({ x: b.x1, y: b.y1 });
    }
  };
  items.forEach(visit);
  Object.values(overlays).forEach((ov) => ov?.forEach(visit));
  const pad = 8;
  const dx = pad - x0;
  const dy = pad - y0;
  const mv = (p: P2): P2 => ({ x: Math.round((p.x + dx) * 10) / 10, y: Math.round((p.y + dy) * 10) / 10 });
  const shift = (it: FigItem): FigItem => {
    if (it.k === 'line') return { ...it, a: mv(it.a), b: mv(it.b) };
    if (it.k === 'path') return { ...it, pts: it.pts.map(mv) };
    if (it.k === 'curve') return { ...it, a: mv(it.a), c1: mv(it.c1), c2: mv(it.c2), b: mv(it.b) };
    if (it.k === 'dot') return { ...it, c: mv(it.c) };
    const q = mv({ x: it.x, y: it.y });
    return { ...it, x: q.x, y: q.y };
  };
  const ovShifted: Partial<Record<OverlayId, FigItem[]>> = {};
  for (const [k, v] of Object.entries(overlays)) if (v) ovShifted[k as OverlayId] = v.map(shift);

  const types = arm.joints.map((j) => j.type).join('');
  const aria = `Exam-style drawing of a ${types} arm at its zero configuration: ${arm.joints.length} joints labelled θ1 to θ${arm.joints.length} from the base, the static frame {${sName}} at the base and the body frame {${bName}} at the end effector, each drawn as a labelled axis triad joined to its origin by a leader, and dimension lines for ${[...new Set(dimsPlaced)].join(', ')}.`;
  return {
    W: Math.ceil(x1 - x0 + 2 * pad),
    H: Math.ceil(y1 - y0 + 2 * pad),
    items: items.map(shift),
    overlays: ovShifted,
    aria,
    stats: { dims: dimsPlaced, minLabelGap: labelGaps.length ? Math.min(...labelGaps) : Infinity, joints: arm.joints.length },
  };
}
