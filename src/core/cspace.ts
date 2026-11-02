// Configuration space of a planar 2-link arm (summary notes §5: "Reading a 2-link arm C-space plot").
// θ1 is measured from +x; θ2 is measured relative to link 1. Both in [0, 2π). Links are line segments.
import { type Shape, type Vec2, segHitsShape } from './geom2d';

export interface TwoLinkArm {
  base: Vec2;
  l1: number;
  l2: number;
}

export const TAU = 2 * Math.PI;

/** Forward kinematics: elbow = base + L1(cos θ1, sin θ1), tip = elbow + L2(cos(θ1+θ2), sin(θ1+θ2)). */
export function fk2(arm: TwoLinkArm, t1: number, t2: number): { elbow: Vec2; tip: Vec2 } {
  const elbow = { x: arm.base.x + arm.l1 * Math.cos(t1), y: arm.base.y + arm.l1 * Math.sin(t1) };
  const tip = { x: elbow.x + arm.l2 * Math.cos(t1 + t2), y: elbow.y + arm.l2 * Math.sin(t1 + t2) };
  return { elbow, tip };
}

/** Inverse kinematics of the 2-link arm; returns both branches (θ2 ≥ 0 first) wrapped to [0, 2π), or [] if out of reach. */
export function ik2(arm: TwoLinkArm, target: Vec2): [number, number][] {
  const dx = target.x - arm.base.x;
  const dy = target.y - arm.base.y;
  const r2 = dx * dx + dy * dy;
  const c2 = (r2 - arm.l1 ** 2 - arm.l2 ** 2) / (2 * arm.l1 * arm.l2);
  if (c2 < -1 - 1e-9 || c2 > 1 + 1e-9) return [];
  const cc = Math.max(-1, Math.min(1, c2));
  const out: [number, number][] = [];
  for (const s of [1, -1]) {
    const t2 = s * Math.acos(cc);
    const t1 = Math.atan2(dy, dx) - Math.atan2(arm.l2 * Math.sin(t2), arm.l1 + arm.l2 * Math.cos(t2));
    out.push([wrap(t1), wrap(t2)]);
  }
  return out;
}

export const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

/** Which obstacles each link touches at (θ1, θ2). */
export function armCollisions(arm: TwoLinkArm, t1: number, t2: number, obstacles: readonly Shape[]): { link1: number[]; link2: number[] } {
  const { elbow, tip } = fk2(arm, t1, t2);
  const link1: number[] = [];
  const link2: number[] = [];
  obstacles.forEach((o, i) => {
    if (segHitsShape(arm.base, elbow, o)) link1.push(i);
    if (segHitsShape(elbow, tip, o)) link2.push(i);
  });
  return { link1, link2 };
}

/**
 * C-space grid of n × n cells. Cell (i, j) is θ1 = (i + ½)·2π/n, θ2 = (j + ½)·2π/n.
 * `hit[k]` has bit o set if obstacle o touches the arm there (either link); `link1[k]` has bit o set if
 * LINK 1 touches obstacle o (those cells form the full-height bands). Index k = j·n + i. Up to 16 obstacles.
 */
export interface CGrid {
  n: number;
  hit: Uint16Array;
  link1: Uint16Array;
}

export function cspaceGrid(arm: TwoLinkArm, obstacles: readonly Shape[], n = 180): CGrid {
  const hit = new Uint16Array(n * n);
  const link1 = new Uint16Array(n * n);
  const d = TAU / n;
  for (let i = 0; i < n; i++) {
    const t1 = (i + 0.5) * d;
    const elbow = { x: arm.base.x + arm.l1 * Math.cos(t1), y: arm.base.y + arm.l1 * Math.sin(t1) };
    // Link 1 depends only on θ1: compute once per column.
    let l1mask = 0;
    obstacles.forEach((o, k) => {
      if (segHitsShape(arm.base, elbow, o)) l1mask |= 1 << k;
    });
    for (let j = 0; j < n; j++) {
      const a = t1 + (j + 0.5) * d;
      const tip = { x: elbow.x + arm.l2 * Math.cos(a), y: elbow.y + arm.l2 * Math.sin(a) };
      let m = l1mask;
      obstacles.forEach((o, k) => {
        if (!(m & (1 << k)) && segHitsShape(elbow, tip, o)) m |= 1 << k;
      });
      hit[j * n + i] = m;
      link1[j * n + i] = l1mask;
    }
  }
  return { n, hit, link1 };
}

/** Is the cell containing (θ1, θ2) in collision? */
export function cgridAt(g: CGrid, t1: number, t2: number): number {
  const i = Math.min(g.n - 1, Math.floor((wrap(t1) / TAU) * g.n));
  const j = Math.min(g.n - 1, Math.floor((wrap(t2) / TAU) * g.n));
  return g.hit[j * g.n + i];
}

/**
 * Shortest collision-free path between two configurations on the C-space grid (8-connected, wrapping
 * at 0 = 2π in both joints: the C-space of a 2R arm is a torus). Returns cell-centre angles or null.
 */
export function planCspace(g: CGrid, from: [number, number], to: [number, number]): [number, number][] | null {
  const n = g.n;
  const idx = (t1: number, t2: number) => Math.min(n - 1, Math.floor((wrap(t2) / TAU) * n)) * n + Math.min(n - 1, Math.floor((wrap(t1) / TAU) * n));
  const s = idx(from[0], from[1]);
  const t = idx(to[0], to[1]);
  if (g.hit[s] || g.hit[t]) return null;
  const gScore = new Float64Array(n * n).fill(Infinity);
  const parent = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  gScore[s] = 0;
  const torusDist = (a: number, b: number) => {
    const ai = a % n,
      aj = Math.floor(a / n),
      bi = b % n,
      bj = Math.floor(b / n);
    const di = Math.min(Math.abs(ai - bi), n - Math.abs(ai - bi));
    const dj = Math.min(Math.abs(aj - bj), n - Math.abs(aj - bj));
    return Math.hypot(di, dj);
  };
  // binary heap on f
  const heap: [number, number][] = [[torusDist(s, t), s]];
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p][0] <= heap[c][0]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1,
          r = l + 1;
        let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === t) break;
    const i = k % n;
    const j = Math.floor(k / n);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = (i + di + n) % n;
        const nj = (j + dj + n) % n;
        const nk = nj * n + ni;
        if (g.hit[nk] || closed[nk]) continue;
        const ng = gScore[k] + (di && dj ? Math.SQRT2 : 1);
        if (ng < gScore[nk]) {
          gScore[nk] = ng;
          parent[nk] = k;
          push(ng + torusDist(nk, t), nk);
        }
      }
  }
  if (!closed[t]) return null;
  const cells: number[] = [];
  for (let k = t; k !== -1; k = parent[k]) cells.unshift(k);
  return cells.map((k) => [((k % n) + 0.5) * (TAU / n), (Math.floor(k / n) + 0.5) * (TAU / n)]);
}

/** Directions (radians from +x, in [0, 2π)) from the base to the corners/samples of a shape: its angular extent. */
export function angularExtent(base: Vec2, s: Shape, samples = 64): { min: number; max: number; nearest: number; farthest: number } {
  const pts: Vec2[] = [];
  if (s.kind === 'circle') for (let i = 0; i < samples; i++) pts.push({ x: s.x + s.r * Math.cos((TAU * i) / samples), y: s.y + s.r * Math.sin((TAU * i) / samples) });
  else if (s.kind === 'rect')
    pts.push({ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h });
  else pts.push(...s.pts);
  const angs = pts.map((p) => wrap(Math.atan2(p.y - base.y, p.x - base.x)));
  const ds = pts.map((p) => Math.hypot(p.x - base.x, p.y - base.y));
  // smallest arc containing all angles
  const sorted = [...angs].sort((a, b) => a - b);
  let gap = -1,
    gi = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU;
    if (b - a > gap) {
      gap = b - a;
      gi = i;
    }
  }
  const min = sorted[(gi + 1) % sorted.length];
  const max = sorted[gi];
  return { min, max, nearest: Math.min(...ds), farthest: Math.max(...ds) };
}
