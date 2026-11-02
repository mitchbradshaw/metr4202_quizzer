// A small global planner used by the local-planning simulations to show the planning hierarchy: A* on an
// occupancy grid of the KNOWN obstacles (grown by a safety margin), shortened by line of sight, and then
// followed by the local planner through a moving sub-goal (a "carrot" a fixed distance ahead on the path).
// Pure functions, no React. (core/graph.ts graphSearch records Open/Closed snapshots for the exam tables,
// which is too slow to rerun on every drag of a 40 × 40 grid, so this file has its own heap-based A*.)
import { distToShape, segHitsShape, type Shape, type Vec2 } from '../../../core/geom2d';

export interface GridPlanOptions {
  /** World size (m). */
  w: number;
  h: number;
  /** Grid cell size (m). */
  cell: number;
  /** Cells closer than this to an obstacle are blocked (robot radius + margin). */
  inflate: number;
}

/** Binary min-heap of (key, value) pairs. */
class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r] < k[l] ? r : l;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

/** Smallest distance from p to any obstacle (Infinity with none). */
export function clearanceOf(p: Vec2, obstacles: readonly Shape[]): number {
  let d = Infinity;
  for (const o of obstacles) d = Math.min(d, distToShape(p, o));
  return d;
}

/**
 * A* (8-connected, octile heuristic, no corner cutting) from start to goal on a grid of the obstacles grown
 * by `inflate`, then shortcut by line of sight. Returns waypoints from start to goal, or null if blocked.
 */
export function gridPlan(obstacles: readonly Shape[], start: Vec2, goal: Vec2, o: GridPlanOptions): Vec2[] | null {
  const nc = Math.max(2, Math.round(o.w / o.cell));
  const nr = Math.max(2, Math.round(o.h / o.cell));
  const N = nc * nr;
  const blocked = new Uint8Array(N);
  for (let r = 0; r < nr; r++)
    for (let c = 0; c < nc; c++) {
      const p = { x: (c + 0.5) * o.cell, y: (r + 0.5) * o.cell };
      for (const s of obstacles)
        if (distToShape(p, s) < o.inflate) {
          blocked[r * nc + c] = 1;
          break;
        }
    }
  const cellOf = (p: Vec2) => {
    const c = Math.max(0, Math.min(nc - 1, Math.floor(p.x / o.cell)));
    const r = Math.max(0, Math.min(nr - 1, Math.floor(p.y / o.cell)));
    return r * nc + c;
  };
  const si = cellOf(start);
  const gi = cellOf(goal);
  // The start and goal may sit inside the safety margin (a goal next to a wall): let the plan begin and end there.
  blocked[si] = 0;
  blocked[gi] = 0;
  const gc = gi % nc;
  const gr = (gi - gc) / nc;
  const h = (i: number) => {
    const c = i % nc;
    const dx = Math.abs(c - gc);
    const dy = Math.abs((i - c) / nc - gr);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const g = new Float64Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  g[si] = 0;
  heap.push(h(si), si);
  const DIRS: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === gi) break;
    const c = i % nc;
    const r = (i - c) / nc;
    for (const [dc, dr, w] of DIRS) {
      const c2 = c + dc;
      const r2 = r + dr;
      if (c2 < 0 || r2 < 0 || c2 >= nc || r2 >= nr) continue;
      const j = r2 * nc + c2;
      if (blocked[j] || closed[j]) continue;
      if (dc && dr && (blocked[r * nc + c2] || blocked[r2 * nc + c])) continue;
      const ng = g[i] + w;
      if (ng < g[j]) {
        g[j] = ng;
        parent[j] = i;
        heap.push(ng + h(j), j);
      }
    }
  }
  if (!closed[gi]) return null;
  const cells: number[] = [];
  for (let i = gi; i >= 0; i = parent[i]) cells.push(i);
  cells.reverse();
  const pts: Vec2[] = cells.map((i) => {
    const c = i % nc;
    return { x: (c + 0.5) * o.cell, y: ((i - c) / nc + 0.5) * o.cell };
  });
  pts[0] = { ...start };
  if (pts.length === 1) pts.push({ ...goal });
  else pts[pts.length - 1] = { ...goal };
  return shortcut(pts, obstacles, o.inflate);
}

/** Is the segment free and (away from its end-points) at least `clear` from every obstacle? */
function segmentClear(a: Vec2, b: Vec2, obstacles: readonly Shape[], clear: number): boolean {
  if (obstacles.some((s) => segHitsShape(a, b, s))) return false;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.ceil(L / 0.08));
  // Near an end-point that itself sits close to an obstacle, accept the clearance that end-point has.
  const need = Math.min(clear, clearanceOf(a, obstacles), clearanceOf(b, obstacles)) - 1e-6;
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (clearanceOf(p, obstacles) < need) return false;
  }
  return true;
}

/** Greedy line-of-sight shortcutting: from each kept point jump to the farthest point it can see. */
function shortcut(pts: Vec2[], obstacles: readonly Shape[], clear: number): Vec2[] {
  const out: Vec2[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !segmentClear(pts[i], pts[j], obstacles, clear * 0.9)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/** Cumulative arc length at each vertex of a polyline. */
export function cumLength(pts: readonly Vec2[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return out;
}

/** The point at arc length s along the polyline (clamped to its ends). */
export function pointAtS(pts: readonly Vec2[], cum: readonly number[], s: number): Vec2 {
  if (s <= 0) return { ...pts[0] };
  const L = cum[cum.length - 1];
  if (s >= L) return { ...pts[pts.length - 1] };
  let k = 1;
  while (k < cum.length - 1 && cum[k] < s) k++;
  const seg = cum[k] - cum[k - 1] || 1;
  const t = (s - cum[k - 1]) / seg;
  return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * t };
}

/**
 * Arc length of the point of the polyline closest to p, searching only ahead of `sFrom` (minus a little),
 * so a robot that drifts sideways never jumps back to an earlier part of the plan.
 */
export function projectOnPath(pts: readonly Vec2[], cum: readonly number[], p: Vec2, sFrom: number, window = 3): number {
  let best = sFrom;
  let bd = Infinity;
  for (let k = 1; k < pts.length; k++) {
    if (cum[k] < sFrom - 0.3 || cum[k - 1] > sFrom + window) continue;
    const a = pts[k - 1];
    const b = pts[k];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const L2 = abx * abx + aby * aby;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / L2)) : 0;
    const d = Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
    if (d < bd) {
      bd = d;
      best = cum[k - 1] + t * (cum[k] - cum[k - 1]);
    }
  }
  return Math.max(sFrom, best);
}
