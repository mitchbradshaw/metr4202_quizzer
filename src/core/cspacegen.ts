// Exam-style 2-link arm workspaces and C-space region analysis (summary notes §5; 2023 Q26, 2024 Q24,
// 2025 Q25; review deck slide 16). Pure module (no React).
//
//  - The exam workspaces, redrawn from the papers: 10 × 10 m, base at (5, 5), θ1 from +x, θ2 relative to link 1.
//  - A fast C-space kernel with ONE MASK PER OBSTACLE (0 free, 1 only link 2 hits, 2 link 1 hits), so dragging
//    one obstacle only recomputes its own mask. Link 1 is tested once per θ1 column; link 2 only inside the
//    obstacle's angular window as seen from the elbow. Cell (i, j) is θ1 = (i + ½)·2π/n, θ2 = (j + ½)·2π/n,
//    exactly as core/cspace.ts cspaceGrid, and the result is a CGrid (planCspace works on it).
//  - Connected components of each obstacle's region: as drawn (the flat square, where a region that wraps
//    is cut into pieces) and on the torus (θ = 0 ≡ 2π in both joints), with a representative cell per piece
//    that sits well inside it (where an answer box should point).
//  - Random exam-like workspaces: 2-4 obstacles labelled A-D, some crossing the link-1 circle (bands) and
//    some only reachable by link 2 (blobs), not overlapping each other or the base, with C-space regions
//    that do not touch each other.
import type { Rng } from '../engine/rng';
import { TAU, wrap, angularExtent, type CGrid, type TwoLinkArm } from './cspace';
import { type Shape, type Vec2, closestPointOnShape, distToShape, pointInShape, segHitsShape, shapeBounds, shapeCentre } from './geom2d';

export interface CObstacle {
  label: string;
  shape: Shape;
}

export interface CWorkspace {
  base: Vec2;
  l1: number;
  l2: number;
  obstacles: CObstacle[];
}

export const LETTERS = ['A', 'B', 'C', 'D'] as const;
export const armOf = (ws: CWorkspace): TwoLinkArm => ({ base: ws.base, l1: ws.l1, l2: ws.l2 });
/** Angle to (−π, π]. */
export const wrapPi = (a: number) => {
  const w = wrap(a);
  return w > Math.PI ? w - TAU : w;
};
/** Cell index of (θ1, θ2) on an n × n grid (angles wrapped). */
export function cellOf(n: number, t1: number, t2: number): number {
  const i = Math.min(n - 1, Math.floor((wrap(t1) / TAU) * n));
  const j = Math.min(n - 1, Math.floor((wrap(t2) / TAU) * n));
  return j * n + i;
}
/** Centre angles [θ1, θ2] of cell k. */
export function cellCentre(n: number, k: number): [number, number] {
  const i = k % n;
  const j = (k - i) / n;
  return [((i + 0.5) * TAU) / n, ((j + 0.5) * TAU) / n];
}

// ------------------------------------------------------------------ the exam workspaces

const poly = (pts: [number, number][]): Shape => ({ kind: 'poly', pts: pts.map(([x, y]) => ({ x, y })) });
const rect = (x: number, y: number, w: number, h: number): Shape => ({ kind: 'rect', x, y, w, h });
const BASE: Vec2 = { x: 5, y: 5 };

/** 2023 Q26: L1 = 2√2 (the dashed circle passes through (3, 3) and (7, 3)), L2 ≈ 2. */
export const EXAM_2023: CWorkspace = {
  base: BASE,
  l1: 2 * Math.SQRT2,
  l2: 2,
  obstacles: [
    { label: 'A', shape: poly([[0, 5], [2, 5], [2, 8], [1, 9], [0, 9]]) },
    { label: 'B', shape: poly([[3, 3], [5, 3], [5, 4], [4, 4]]) },
    { label: 'C', shape: rect(7, 3, 3, 2) },
  ],
};

/** 2024 Q24: L1 = 2√2 (A's corners (3, 3) and (3, 7) lie on the circle), L2 ≈ 2. */
export const EXAM_2024: CWorkspace = {
  base: BASE,
  l1: 2 * Math.SQRT2,
  l2: 2,
  obstacles: [
    { label: 'A', shape: poly([[3, 3], [4, 4], [4, 6], [3, 7]]) },
    { label: 'B', shape: poly([[8, 7], [10, 7], [10, 10], [8, 8]]) },
    { label: 'C', shape: rect(6, 2, 1, 1) },
  ],
};

/** 2025 Q25: L1 = 2.5, L2 ≈ 2; no obstacle crosses the circle. */
export const EXAM_2025: CWorkspace = {
  base: BASE,
  l1: 2.5,
  l2: 2,
  obstacles: [
    { label: 'A', shape: poly([[1, 5], [2, 5], [2, 7], [1, 8]]) },
    { label: 'B', shape: rect(4, 8, 1, 1) },
    { label: 'C', shape: rect(7, 2, 2, 1) },
  ],
};

// Review deck slide 16 ("match the workspaces to their C-spaces"). The deck draws the base at (0, 0) on
// [−5, 5]²; here everything is shifted by (5, 5) so the base sits at (5, 5) like the papers. L1 = 3, L2 ≈ 1.
const REVIEW_SMALL = poly([[4, 5], [4.5, 5], [4.5, 5.5], [4, 6]]);
/** Review deck workspace A (matches C-space 1): small block, square to the right (band), block below out of reach (blob). */
export const REVIEW_A: CWorkspace = {
  base: BASE,
  l1: 3,
  l2: 1,
  obstacles: [
    { label: 'A', shape: REVIEW_SMALL },
    { label: 'B', shape: rect(7, 4, 2, 2) },
    { label: 'C', shape: rect(4, 0, 2, 1.5) },
  ],
};
/** Review deck workspace B (matches C-space 3): the block below is taller and crosses the circle (second band). */
export const REVIEW_B: CWorkspace = {
  base: BASE,
  l1: 3,
  l2: 1,
  obstacles: [
    { label: 'A', shape: REVIEW_SMALL },
    { label: 'B', shape: rect(4, 0, 2, 3.5) },
  ],
};
/** Review deck workspace C (matches C-space 2): small block (band) and the block below out of reach of link 1 (blob). */
export const REVIEW_C: CWorkspace = {
  base: BASE,
  l1: 3,
  l2: 1,
  obstacles: [
    { label: 'A', shape: REVIEW_SMALL },
    { label: 'B', shape: rect(4, 0, 2, 1.5) },
  ],
};

/** An answer box from a paper: the configuration its pointer touches (θ in units of π) and the answer. */
export interface PaperBox {
  t1: number;
  t2: number;
  answer: string;
  where: string;
}

// Pointer tips read off the printed figures (2023 Q26, 2024 Q24, 2025 Q25) and the worked solutions' answers.
export const EXAM_2023_BOXES: PaperBox[] = [
  { t1: 0.86, t2: 1.79, answer: 'A', where: 'top-centre blob' },
  { t1: 0.12, t2: 1.28, answer: 'C', where: 'blob on the left edge (C’s band wraps through θ₁ = 0)' },
  { t1: 1.33, t2: 1.19, answer: 'B', where: 'centre band, θ₁ ∈ [1.25π, 1.5π]' },
  { t1: 0.76, t2: 0.21, answer: 'A', where: 'bottom blob (the same region as the top one)' },
  { t1: 1.92, t2: 0.58, answer: 'C', where: 'right band, θ₁ ∈ [1.75π, 2π]' },
];
export const EXAM_2024_BOXES: PaperBox[] = [
  { t1: 0.32, t2: 1.7, answer: 'B', where: 'top-left stripe' },
  { t1: 0.65, t2: 0.81, answer: 'A', where: 'bulge left of the wide band' },
  { t1: 0.16, t2: 0.13, answer: 'B', where: 'bottom-left stripe (the same region, through θ₂ = 0)' },
  { t1: 1.68, t2: 0.58, answer: 'C', where: 'narrow band, θ₁ ≈ 1.6π–1.75π' },
];
export const EXAM_2025_BOXES: PaperBox[] = [
  { t1: 0.61, t2: 1.71, answer: 'B', where: 'top row, left' },
  { t1: 1.07, t2: 1.58, answer: 'A', where: 'top row, middle' },
  { t1: 1.89, t2: 1.65, answer: 'C', where: 'top row, right' },
  { t1: 0.36, t2: 0.45, answer: 'B', where: 'bottom row, left' },
  { t1: 0.78, t2: 0.41, answer: 'A', where: 'bottom row, middle' },
  { t1: 1.6, t2: 0.45, answer: 'C', where: 'bottom row, right' },
];

// ------------------------------------------------------------------ fast collision kernel

/** A shape prepared for allocation-free segment tests. */
export interface Collider {
  /** 0 circle, 1 rectangle, 2 convex polygon, 3 general polygon. */
  kind: 0 | 1 | 2 | 3;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Bounding circle (centre, radius); for a circle the circle itself. */
  cx: number;
  cy: number;
  r: number;
  px: Float64Array;
  py: Float64Array;
  nx: Float64Array;
  ny: Float64Array;
  shape: Shape;
}

const EMPTY = new Float64Array(0);

export function makeCollider(s: Shape): Collider {
  const [x0, y0, x1, y1] = shapeBounds(s);
  if (s.kind === 'circle') return { kind: 0, x0, y0, x1, y1, cx: s.x, cy: s.y, r: s.r, px: EMPTY, py: EMPTY, nx: EMPTY, ny: EMPTY, shape: s };
  if (s.kind === 'rect') {
    return { kind: 1, x0, y0, x1, y1, cx: s.x + s.w / 2, cy: s.y + s.h / 2, r: Math.hypot(s.w, s.h) / 2, px: EMPTY, py: EMPTY, nx: EMPTY, ny: EMPTY, shape: s };
  }
  let pts = s.pts;
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) area += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  if (area < 0) pts = [...pts].reverse();
  const m = pts.length;
  const px = new Float64Array(m);
  const py = new Float64Array(m);
  const nx = new Float64Array(m);
  const ny = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    px[k] = pts[k].x;
    py[k] = pts[k].y;
  }
  let convex = true;
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m;
    const k2 = (k + 2) % m;
    const ex = px[k1] - px[k];
    const ey = py[k1] - py[k];
    const L = Math.hypot(ex, ey) || 1;
    nx[k] = ey / L; // outward normal of an anticlockwise polygon
    ny[k] = -ex / L;
    const fx = px[k2] - px[k1];
    const fy = py[k2] - py[k1];
    if (ex * fy - ey * fx < -1e-12) convex = false;
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  let r = 0;
  for (let k = 0; k < m; k++) r = Math.max(r, Math.hypot(px[k] - cx, py[k] - cy));
  return { kind: convex ? 2 : 3, x0, y0, x1, y1, cx, cy, r, px, py, nx, ny, shape: s };
}

/** Does the segment (ax, ay)–(bx, by) touch the shape? Same answer as geom2d segHitsShape, without allocating. */
export function segHits(ax: number, ay: number, bx: number, by: number, c: Collider): boolean {
  if ((ax > bx ? ax : bx) < c.x0 || (ax < bx ? ax : bx) > c.x1 || (ay > by ? ay : by) < c.y0 || (ay < by ? ay : by) > c.y1) return false;
  const dx = bx - ax;
  const dy = by - ay;
  if (c.kind === 0) {
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((c.cx - ax) * dx + (c.cy - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx - c.cx;
    const qy = ay + t * dy - c.cy;
    return Math.sqrt(qx * qx + qy * qy) <= c.r;
  }
  if (c.kind === 1) {
    // slab clipping against the closed box
    let t0 = 0;
    let t1 = 1;
    if (dx === 0) {
      if (ax < c.x0 || ax > c.x1) return false;
    } else {
      let ta = (c.x0 - ax) / dx;
      let tb = (c.x1 - ax) / dx;
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    if (dy === 0) {
      if (ay < c.y0 || ay > c.y1) return false;
    } else {
      let ta = (c.y0 - ay) / dy;
      let tb = (c.y1 - ay) / dy;
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    return true;
  }
  if (c.kind === 2) {
    // Cyrus–Beck clipping against a convex polygon (boundary counts as a hit)
    let t0 = 0;
    let t1 = 1;
    const m = c.px.length;
    for (let k = 0; k < m; k++) {
      const num = c.nx[k] * (ax - c.px[k]) + c.ny[k] * (ay - c.py[k]);
      const den = c.nx[k] * dx + c.ny[k] * dy;
      if (Math.abs(den) < 1e-14) {
        if (num > 1e-12) return false;
        continue;
      }
      const t = -num / den;
      if (den < 0) {
        if (t > t0) t0 = t;
      } else if (t < t1) t1 = t;
      if (t0 > t1 + 1e-12) return false;
    }
    return true;
  }
  return segHitsShape({ x: ax, y: ay }, { x: bx, y: by }, c.shape);
}

const TRIG = new Map<number, { cos: Float64Array; sin: Float64Array }>();
function trig(n: number) {
  let t = TRIG.get(n);
  if (!t) {
    const cos = new Float64Array(n);
    const sin = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      cos[k] = Math.cos((k * TAU) / n);
      sin[k] = Math.sin((k * TAU) / n);
    }
    t = { cos, sin };
    TRIG.set(n, t);
  }
  return t;
}

/**
 * C-space mask of ONE obstacle on an n × n grid (index j·n + i): 0 free, 1 only link 2 touches it,
 * 2 link 1 touches it (then the whole θ1 column is 2: whatever θ2 is, the arm collides).
 */
export function obstacleMask(arm: TwoLinkArm, s: Shape, n: number, out?: Uint8Array): Uint8Array {
  const mask = out && out.length === n * n ? out : new Uint8Array(n * n);
  mask.fill(0);
  const c = makeCollider(s);
  const d = TAU / n;
  const { cos, sin } = trig(n);
  const bx = arm.base.x;
  const by = arm.base.y;
  const l2 = arm.l2;
  for (let i = 0; i < n; i++) {
    const t1 = (i + 0.5) * d;
    const ex = bx + arm.l1 * Math.cos(t1);
    const ey = by + arm.l1 * Math.sin(t1);
    if (segHits(bx, by, ex, ey, c)) {
      for (let j = 0; j < n; j++) mask[j * n + i] = 2;
      continue;
    }
    // Link 2 swings on a circle of radius L2 about the elbow: skip the column if the obstacle is out of
    // reach, otherwise only test the directions that can point at it.
    const ox = c.cx - ex;
    const oy = c.cy - ey;
    const dist = Math.sqrt(ox * ox + oy * oy);
    if (dist - c.r > l2 + 1e-9) continue;
    let kFrom = 0;
    let count = n;
    if (dist > c.r + 1e-9) {
      const w = Math.asin(Math.min(1, c.r / dist));
      const phi = Math.atan2(oy, ox);
      const kmin = Math.floor((phi - w) / d) - 1;
      const kmax = Math.ceil((phi + w) / d) + 1;
      if (kmax - kmin + 1 < n) {
        kFrom = kmin;
        count = kmax - kmin + 1;
      }
    }
    for (let q = 0; q < count; q++) {
      const k = (((kFrom + q) % n) + n) % n; // absolute direction of link 2: α = θ1 + θ2 = k·2π/n
      const j = (((k - i - 1) % n) + n) % n;
      if (segHits(ex, ey, ex + l2 * cos[k], ey + l2 * sin[k], c)) mask[j * n + i] = 1;
    }
  }
  return mask;
}

/** Combine per-obstacle masks into a CGrid (bit o of hit/link1 = obstacle o). */
export function gridFromMasks(masks: readonly Uint8Array[], n: number): CGrid {
  const hit = new Uint16Array(n * n);
  const link1 = new Uint16Array(n * n);
  masks.forEach((m, o) => {
    const b = 1 << o;
    for (let k = 0; k < m.length; k++) {
      const v = m[k];
      if (v) {
        hit[k] |= b;
        if (v === 2) link1[k] |= b;
      }
    }
  });
  return { n, hit, link1 };
}

/** Same grid as core/cspace.ts cspaceGrid, computed with the fast kernel. */
export function fastCspaceGrid(arm: TwoLinkArm, shapes: readonly Shape[], n = 180): CGrid {
  return gridFromMasks(
    shapes.map((s) => obstacleMask(arm, s, n)),
    n
  );
}

export const workspaceGrid = (ws: CWorkspace, n = 144) =>
  fastCspaceGrid(
    armOf(ws),
    ws.obstacles.map((o) => o.shape),
    n
  );

/** Which obstacles each link touches at (θ1, θ2), with prepared colliders. */
export function collisionsAt(arm: TwoLinkArm, cols: readonly Collider[], t1: number, t2: number): { link1: number[]; link2: number[] } {
  const ex = arm.base.x + arm.l1 * Math.cos(t1);
  const ey = arm.base.y + arm.l1 * Math.sin(t1);
  const tx = ex + arm.l2 * Math.cos(t1 + t2);
  const ty = ey + arm.l2 * Math.sin(t1 + t2);
  const link1: number[] = [];
  const link2: number[] = [];
  cols.forEach((c, o) => {
    if (segHits(arm.base.x, arm.base.y, ex, ey, c)) link1.push(o);
    if (segHits(ex, ey, tx, ty, c)) link2.push(o);
  });
  return { link1, link2 };
}

export interface MotionCheck {
  free: boolean;
  /** Fraction of the motion completed before the first contact (1 when free). */
  s: number;
  /** Last collision-free configuration (unwrapped from `from`). */
  stop: [number, number];
  hit?: { t1: number; t2: number; link1: number[]; link2: number[] };
}

/**
 * Check a straight joint-space motion from `from` by `delta` (radians, not wrapped: pass the motion you
 * mean, e.g. the shortest way round), sampled so that no joint moves more than `maxStep` between checks.
 */
export function checkMotion(arm: TwoLinkArm, cols: readonly Collider[], from: [number, number], delta: [number, number], maxStep = 0.006): MotionCheck {
  const len = Math.max(Math.abs(delta[0]), Math.abs(delta[1]));
  const steps = Math.max(1, Math.ceil(len / maxStep));
  let last: [number, number] = [from[0], from[1]];
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const t1 = from[0] + delta[0] * f;
    const t2 = from[1] + delta[1] * f;
    const c = collisionsAt(arm, cols, t1, t2);
    if (c.link1.length || c.link2.length) return { free: false, s: Math.max(0, (s - 1) / steps), stop: last, hit: { t1, t2, ...c } };
    last = [t1, t2];
  }
  return { free: true, s: 1, stop: last };
}

/** Shortest-way-round joint difference from a to b (each joint in (−π, π]). */
export const torusDelta = (a: readonly [number, number], b: readonly [number, number]): [number, number] => [wrapPi(b[0] - a[0]), wrapPi(b[1] - a[1])];

// ------------------------------------------------------------------ regions: pieces (as drawn) and torus components

export interface RegionPiece {
  obstacle: number;
  /** Number of cells. */
  cells: number;
  /** Representative cell (index j·n + i): deepest inside the piece, preferring cells no other obstacle shares. */
  rep: number;
  /** Bounding box in cell indices (flat plot). */
  i0: number;
  i1: number;
  j0: number;
  j1: number;
  /** Contains link-1 cells (it is, or includes, a full-height band). */
  link1: boolean;
  /** Torus component this piece belongs to. */
  comp: number;
  touches: { left: boolean; right: boolean; bottom: boolean; top: boolean };
  /** Cells hit by this obstacle only. */
  pure: number;
}

export interface RegionComp {
  obstacle: number;
  pieces: number[];
  cells: number;
  link1: boolean;
}

export interface RegionAnalysis {
  n: number;
  pieces: RegionPiece[];
  comps: RegionComp[];
  /** Per obstacle: piece index of every cell (−1 if the obstacle does not cover it). */
  flat: Int32Array[];
  /** Per obstacle: torus component index of every cell (−1 if not covered). */
  torus: Int32Array[];
}

/**
 * Connected components (8-neighbour) of every obstacle's C-space region: flat pieces as the plot shows
 * them, and components on the torus (wrap-around at θ = 0 ≡ 2π in both joints).
 */
export function analyseRegions(g: CGrid, nObstacles: number): RegionAnalysis {
  const n = g.n;
  const N = n * n;
  const pieces: RegionPiece[] = [];
  const comps: RegionComp[] = [];
  const flat: Int32Array[] = [];
  const torus: Int32Array[] = [];
  const queue = new Int32Array(N);
  const q2 = new Int32Array(N);
  const depth = new Int32Array(N);
  for (let o = 0; o < nObstacles; o++) {
    const b = 1 << o;
    const tl = new Int32Array(N).fill(-1);
    const fl = new Int32Array(N).fill(-1);
    // torus components
    for (let s = 0; s < N; s++) {
      if (!(g.hit[s] & b) || tl[s] >= 0) continue;
      const id = comps.length;
      const comp: RegionComp = { obstacle: o, pieces: [], cells: 0, link1: false };
      comps.push(comp);
      let head = 0;
      let tail = 0;
      queue[tail++] = s;
      tl[s] = id;
      while (head < tail) {
        const k = queue[head++];
        const i = k % n;
        const j = (k - i) / n;
        comp.cells++;
        if (g.link1[k] & b) comp.link1 = true;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const nk = ((j + dj + n) % n) * n + ((i + di + n) % n);
            if (g.hit[nk] & b && tl[nk] < 0) {
              tl[nk] = id;
              queue[tail++] = nk;
            }
          }
      }
    }
    // flat pieces
    for (let s = 0; s < N; s++) {
      if (!(g.hit[s] & b) || fl[s] >= 0) continue;
      const id = pieces.length;
      let head = 0;
      let tail = 0;
      queue[tail++] = s;
      fl[s] = id;
      let i0 = n;
      let i1 = -1;
      let j0 = n;
      let j1 = -1;
      let link1 = false;
      let si = 0;
      let sj = 0;
      let pure = 0;
      while (head < tail) {
        const k = queue[head++];
        const i = k % n;
        const j = (k - i) / n;
        if (i < i0) i0 = i;
        if (i > i1) i1 = i;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
        si += i;
        sj += j;
        if (g.link1[k] & b) link1 = true;
        if (g.hit[k] === b) pure++;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
            const nk = nj * n + ni;
            if (g.hit[nk] & b && fl[nk] < 0) {
              fl[nk] = id;
              queue[tail++] = nk;
            }
          }
      }
      const cells = tail;
      // depth: chessboard distance to the outside of the piece (the plot edge counts as outside)
      let h2 = 0;
      let t2 = 0;
      for (let q = 0; q < cells; q++) {
        const k = queue[q];
        depth[k] = 0;
      }
      for (let q = 0; q < cells; q++) {
        const k = queue[q];
        const i = k % n;
        const j = (k - i) / n;
        const edge =
          i === 0 || j === 0 || i === n - 1 || j === n - 1 || fl[k - 1] !== id || fl[k + 1] !== id || fl[k - n] !== id || fl[k + n] !== id;
        if (edge) {
          depth[k] = 1;
          q2[t2++] = k;
        }
      }
      while (h2 < t2) {
        const k = q2[h2++];
        const i = k % n;
        const j = (k - i) / n;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
            const nk = nj * n + ni;
            if (fl[nk] === id && depth[nk] === 0) {
              depth[nk] = depth[k] + 1;
              q2[t2++] = nk;
            }
          }
      }
      const ci = si / cells;
      const cj = sj / cells;
      let rep = queue[0];
      let best = -1;
      let bestD = Infinity;
      for (let q = 0; q < cells; q++) {
        const k = queue[q];
        if (pure > 0 && g.hit[k] !== b) continue;
        const i = k % n;
        const j = (k - i) / n;
        const dd = (i - ci) ** 2 + (j - cj) ** 2;
        if (depth[k] > best || (depth[k] === best && dd < bestD)) {
          best = depth[k];
          bestD = dd;
          rep = k;
        }
      }
      const comp = tl[s];
      pieces.push({
        obstacle: o,
        cells,
        rep,
        i0,
        i1,
        j0,
        j1,
        link1,
        comp,
        touches: { left: i0 === 0, right: i1 === n - 1, bottom: j0 === 0, top: j1 === n - 1 },
        pure,
      });
      comps[comp].pieces.push(id);
    }
    flat.push(fl);
    torus.push(tl);
  }
  return { n, pieces, comps, flat, torus };
}

/**
 * Full-height bands of one obstacle: runs of θ1 columns where link 1 hits it, as [θ1 start, θ1 end]
 * (radians, end may exceed 2π when the band wraps through θ1 = 0).
 */
export function bandRanges(g: CGrid, o: number): [number, number][] {
  const n = g.n;
  const b = 1 << o;
  const col = (i: number) => (g.link1[i] & b) !== 0; // row 0 is enough: link-1 columns are full height
  const d = TAU / n;
  if (!Array.from({ length: n }, (_, i) => col(i)).some(Boolean)) return [];
  if (Array.from({ length: n }, (_, i) => col(i)).every(Boolean)) return [[0, TAU]];
  // start scanning at a free column so a band through θ1 = 0 comes out in one piece
  let s0 = 0;
  while (col(s0)) s0++;
  const out: [number, number][] = [];
  let start = -1;
  for (let q = 1; q <= n; q++) {
    const i = (s0 + q) % n;
    const on = col(i);
    if (on && start < 0) start = s0 + q;
    if (!on && start >= 0) {
      out.push([wrap(start * d), wrap(start * d) + (s0 + q - start) * d]);
      start = -1;
    }
  }
  return out;
}

// ------------------------------------------------------------------ obstacle geometry for hints

export interface ObstacleInfo {
  /** Nearest point of the obstacle to the base, and its distance. */
  near: Vec2;
  dNear: number;
  /** Farthest distance from the base (vertices, or centre + r). */
  dFar: number;
  /** Directions from the base spanned by the obstacle: [from, to] radians, to ≥ from (to may exceed 2π). */
  dir: [number, number];
  /** Link 1 can reach it (it crosses or lies inside the dashed circle): a full-height band. */
  band: boolean;
  /** The arm can reach it at all (nearest point within L1 + L2). */
  reachable: boolean;
}

export function obstacleInfo(ws: CWorkspace, s: Shape): ObstacleInfo {
  const dNear = distToShape(ws.base, s);
  const near = dNear === 0 ? { ...ws.base } : closestPointOnShape(ws.base, s);
  const pts = s.kind === 'circle' ? [] : s.kind === 'rect' ? [{ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h }] : s.pts;
  const dFar = s.kind === 'circle' ? Math.hypot(s.x - ws.base.x, s.y - ws.base.y) + s.r : Math.max(...pts.map((p) => Math.hypot(p.x - ws.base.x, p.y - ws.base.y)));
  const ex = angularExtent(ws.base, s);
  const to = ex.max < ex.min ? ex.max + TAU : ex.max;
  return { near, dNear, dFar, dir: [ex.min, to], band: dNear <= ws.l1, reachable: dNear <= ws.l1 + ws.l2 };
}

/** Exam-style angle in units of π, e.g. 0.30π. */
export const piStr = (a: number, dp = 2) => `${(a / Math.PI).toFixed(dp)}π`;
/** Same as TeX, e.g. 0.30\pi. */
export const piTeX = (a: number, dp = 2) => {
  const v = (a / Math.PI).toFixed(dp);
  return v === (0).toFixed(dp) ? '0' : `${v}\\pi`;
};
export const degStr = (a: number) => `${Math.round((a * 180) / Math.PI)}°`;

// ------------------------------------------------------------------ random exam-like workspaces

export interface RandomWsOptions {
  /** Number of obstacles, 2-4. */
  count: number;
  /** How many cross the link-1 circle (full-height bands); the rest only link 2 can reach (blobs). */
  inside: number;
  /** [L1, L2]; random exam-like values if omitted. */
  lengths?: [number, number];
  /** Grid used to check the regions (default 144: 2.5° cells). */
  n?: number;
}

export const EXAM_LENGTHS: [number, number][] = [
  [2 * Math.SQRT2, 2],
  [2.5, 2],
  [3, 1.5],
  [2.5, 1.5],
];

type Cls = 'in' | 'out';
const snap = (v: number) => Math.round(v * 2) / 2;

function sampleShape(rng: Rng, cls: Cls, l1: number, l2: number): Shape {
  const phi = rng.uniform(0, TAU);
  const dn = cls === 'in' ? rng.uniform(0.9, l1 - 0.45) : rng.uniform(l1 + 0.35, l1 + l2 - 0.65);
  const qx = 5 + dn * Math.cos(phi);
  const qy = 5 + dn * Math.sin(phi);
  const w = rng.step(1, cls === 'in' ? 2 : 2.5, 0.5);
  const h = rng.step(1, cls === 'in' ? 2 : 2.5, 0.5);
  let x: number;
  let y: number;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  if (Math.abs(c) >= Math.abs(s)) {
    x = c > 0 ? qx : qx - w;
    y = qy - h * rng.uniform(0.2, 0.8);
  } else {
    y = s > 0 ? qy : qy - h;
    x = qx - w * rng.uniform(0.2, 0.8);
  }
  x = snap(x);
  y = snap(y);
  const corners: Vec2[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const dist = corners.map((p) => Math.hypot(p.x - 5, p.y - 5));
  const far = dist.indexOf(Math.max(...dist));
  const nearC = dist.indexOf(Math.min(...dist));
  const kind = rng.pick(['rect', 'rect', 'chamfer', 'trapezoid', 'triangle'] as const);
  if (kind === 'rect') return rect(x, y, w, h);
  if (kind === 'triangle') return { kind: 'poly', pts: corners.filter((_, k) => k !== nearC) };
  if (kind === 'chamfer') {
    const cut = Math.min(w, h) >= 1.5 ? 1 : 0.5;
    const pts: Vec2[] = [];
    corners.forEach((p, k) => {
      if (k !== far) {
        pts.push(p);
        return;
      }
      const prev = corners[(k + 3) % 4];
      const next = corners[(k + 1) % 4];
      const toward = (a: Vec2, b: Vec2) => {
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        return { x: a.x + ((b.x - a.x) / L) * cut, y: a.y + ((b.y - a.y) / L) * cut };
      };
      pts.push(toward(p, prev), toward(p, next));
    });
    return { kind: 'poly', pts };
  }
  // trapezoid: the two corners of one far side pulled in by 0.5 along that side
  const k0 = far;
  const k1 = rng.chance(0.5) ? (far + 1) % 4 : (far + 3) % 4;
  const inset = 0.5;
  const pts = corners.map((p, k) => {
    if (k !== k0) return p;
    const other = corners[k1];
    const L = Math.hypot(other.x - p.x, other.y - p.y);
    return L > 1 ? { x: p.x + ((other.x - p.x) / L) * inset, y: p.y + ((other.y - p.y) / L) * inset } : p;
  });
  return { kind: 'poly', pts };
}

function shapeVertices(s: Shape): Vec2[] {
  if (s.kind === 'poly') return s.pts;
  if (s.kind === 'rect')
    return [
      { x: s.x, y: s.y },
      { x: s.x + s.w, y: s.y },
      { x: s.x + s.w, y: s.y + s.h },
      { x: s.x, y: s.y + s.h },
    ];
  return Array.from({ length: 16 }, (_, i) => ({ x: s.x + s.r * Math.cos((TAU * i) / 16), y: s.y + s.r * Math.sin((TAU * i) / 16) }));
}

/** Smallest distance between two (convex) shapes, 0 if they overlap. */
export function shapeGap(a: Shape, b: Shape): number {
  const va = shapeVertices(a);
  const vb = shapeVertices(b);
  if (va.some((p) => pointInShape(p, b)) || vb.some((p) => pointInShape(p, a))) return 0;
  for (let i = 0; i < va.length; i++) {
    const p = va[i];
    const q = va[(i + 1) % va.length];
    if (segHitsShape(p, q, b)) return 0;
  }
  return Math.min(...va.map((p) => distToShape(p, b)), ...vb.map((p) => distToShape(p, a)));
}

function fitsClass(s: Shape, cls: Cls, l1: number, l2: number): boolean {
  const [x0, y0, x1, y1] = shapeBounds(s);
  if (x0 < -1e-9 || y0 < -1e-9 || x1 > 10 + 1e-9 || y1 > 10 + 1e-9) return false;
  const dn = distToShape(BASE, s);
  if (cls === 'in') {
    if (dn < 0.7 || dn > l1 - 0.35) return false;
    const ex = angularExtent(BASE, s);
    const span = wrap(ex.max - ex.min);
    return span > 0.2 && span < 1.6;
  }
  return dn >= l1 + 0.3 && dn <= l1 + l2 - 0.5;
}

/** Arc distance between two direction intervals (0 if they overlap). */
function dirGap(a: [number, number], b: [number, number]): number {
  const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
  const half = (r: [number, number]) => (r[1] - r[0]) / 2;
  const d = Math.abs(wrapPi(mid(a) - mid(b)));
  return Math.max(0, d - half(a) - half(b));
}

/** Regions are clean when every obstacle has a sizeable region of the right kind and no two regions touch. */
export function regionsClean(ws: CWorkspace, g: CGrid, needBand: boolean[]): boolean {
  const n = g.n;
  const N = n * n;
  const counts = new Array(ws.obstacles.length).fill(0);
  const l1 = new Array(ws.obstacles.length).fill(false);
  for (let k = 0; k < N; k++) {
    const h = g.hit[k];
    if (!h) continue;
    if (h & (h - 1)) return false; // two obstacles at once
    const o = 31 - Math.clz32(h);
    counts[o]++;
    if (g.link1[k]) l1[o] = true;
    const i = k % n;
    const j = (k - i) / n;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const nk = ((j + dj + n) % n) * n + ((i + di + n) % n);
        const h2 = g.hit[nk];
        if (h2 && h2 !== h) return false;
      }
  }
  return counts.every((c, o) => c >= 0.006 * N && l1[o] === needBand[o]);
}

/** A random exam-like workspace (deterministic for a given rng state). */
export function randomWorkspace(rng: Rng, o: RandomWsOptions): CWorkspace {
  const n = o.n ?? 144;
  const count = Math.max(1, Math.min(4, o.count));
  const inside = Math.max(0, Math.min(count, o.inside));
  for (let attempt = 0; attempt < 80; attempt++) {
    const [l1, l2] = o.lengths ?? rng.pick(EXAM_LENGTHS);
    const classes: Cls[] = [...Array<Cls>(inside).fill('in'), ...Array<Cls>(count - inside).fill('out')];
    const shapes: Shape[] = [];
    const dirs: [number, number][] = [];
    let ok = true;
    for (const cls of classes) {
      let placed: Shape | null = null;
      for (let t = 0; t < 60 && !placed; t++) {
        const s = sampleShape(rng, cls, l1, l2);
        if (!fitsClass(s, cls, l1, l2)) continue;
        const ex = angularExtent(BASE, s);
        const dir: [number, number] = [ex.min, ex.max < ex.min ? ex.max + TAU : ex.max];
        if (shapes.some((q, k) => shapeGap(q, s) < 0.6 || dirGap(dirs[k], dir) < 0.35)) continue;
        placed = s;
        dirs.push(dir);
      }
      if (!placed) {
        ok = false;
        break;
      }
      shapes.push(placed);
    }
    if (!ok) continue;
    const order = rng.shuffle(shapes.map((_, k) => k));
    const ws: CWorkspace = { base: { ...BASE }, l1, l2, obstacles: order.map((k, idx) => ({ label: LETTERS[idx], shape: shapes[k] })) };
    const g = workspaceGrid(ws, n);
    if (regionsClean(ws, g, order.map((k) => classes[k] === 'in'))) return ws;
  }
  // Fallback (never expected): an exam workspace with the right number of obstacles.
  const pool = [EXAM_2024, EXAM_2023, EXAM_2025];
  const ws = pool.find((p) => p.obstacles.length >= count) ?? EXAM_2024;
  return { ...ws, obstacles: ws.obstacles.slice(0, count) };
}

/** Centre of an obstacle (for labels). */
export const obstacleCentre = (s: Shape): Vec2 => shapeCentre(s);

/** Is the tip inside the obstacle with some margin (for "verify one point with FK")? */
export function tipInside(arm: TwoLinkArm, s: Shape, t1: number, t2: number, margin = 0.06): boolean {
  const ex = arm.base.x + arm.l1 * Math.cos(t1);
  const ey = arm.base.y + arm.l1 * Math.sin(t1);
  const tip = { x: ex + arm.l2 * Math.cos(t1 + t2), y: ey + arm.l2 * Math.sin(t1 + t2) };
  if (!pointInShape(tip, s)) return false;
  // distance to the boundary
  if (s.kind === 'circle') return s.r - Math.hypot(tip.x - s.x, tip.y - s.y) >= margin;
  const c = closestPointOnShape(tip, { kind: 'poly', pts: shapeVertices(s) });
  return Math.hypot(c.x - tip.x, c.y - tip.y) >= margin;
}
