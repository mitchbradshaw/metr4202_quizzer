// The shortest collision-free path between two points in a sampling-planner world, for the "shortest possible"
// reference line of the PRM / RRT / RRT* simulation (what RRT* converges to and RRT does not).
//
// Method: a visibility graph. Its vertices are the obstacle corners pushed out by a hair (circles become a
// circumscribed regular polygon), plus start and goal; two vertices are joined when the straight segment between
// them is free. The shortest path in a polygonal world runs corner to corner, so Dijkstra on this graph finds it;
// round obstacles are approximated by the polygon, which makes the answer at most ~0.3 % too long.
import { dist, type Vec2 } from '../../../core/geom2d';
import { pointFree, segmentFree, type World } from '../../../core/sampling';

export interface ShortestPath {
  /** Length of the shortest free path (Infinity when start and goal are not connected). */
  cost: number;
  /** Its corner points, start → goal (null when there is none). */
  path: Vec2[] | null;
}

interface VisGraph {
  nodes: Vec2[];
  /** Row-major V × V edge lengths (Infinity where the segment is blocked). */
  w: Float64Array;
}

const SIDES = 24;
const EPS = 0.02;

/** Corner points of every obstacle, pushed EPS outwards, that lie in free space. */
export function visibilityNodes(world: World, sides = SIDES, eps = EPS): Vec2[] {
  const out: Vec2[] = [];
  for (const o of world.obstacles) {
    if (o.kind === 'rect') {
      out.push({ x: o.x - eps, y: o.y - eps }, { x: o.x + o.w + eps, y: o.y - eps }, { x: o.x + o.w + eps, y: o.y + o.h + eps }, { x: o.x - eps, y: o.y + o.h + eps });
    } else if (o.kind === 'circle') {
      // Circumscribed polygon: its edges are tangent to the circle of radius r + eps, so they stay clear of it.
      const R = (o.r + eps) / Math.cos(Math.PI / sides);
      for (let k = 0; k < sides; k++) {
        const a = (2 * Math.PI * k) / sides;
        out.push({ x: o.x + R * Math.cos(a), y: o.y + R * Math.sin(a) });
      }
    } else {
      const c = o.pts.reduce((s, p) => ({ x: s.x + p.x / o.pts.length, y: s.y + p.y / o.pts.length }), { x: 0, y: 0 });
      for (const p of o.pts) {
        const d = dist(p, c) || 1;
        out.push({ x: p.x + ((p.x - c.x) / d) * eps * 1.5, y: p.y + ((p.y - c.y) / d) * eps * 1.5 });
      }
    }
  }
  return out.filter((p) => pointFree(world, p));
}

const cache = new WeakMap<World, VisGraph>();

function graphOf(world: World): VisGraph {
  let g = cache.get(world);
  if (g) return g;
  const nodes = visibilityNodes(world);
  const V = nodes.length;
  const w = new Float64Array(V * V).fill(Infinity);
  for (let i = 0; i < V; i++) {
    w[i * V + i] = 0;
    for (let j = i + 1; j < V; j++) {
      if (!segmentFree(world, nodes[i], nodes[j])) continue;
      const d = dist(nodes[i], nodes[j]);
      w[i * V + j] = d;
      w[j * V + i] = d;
    }
  }
  g = { nodes, w };
  cache.set(world, g);
  return g;
}

/**
 * Shortest free path from start to goal (both must be free). The obstacle-corner graph is cached per world
 * object, so a new start or goal costs only 2V segment checks and one dense Dijkstra (about a millisecond).
 */
export function shortestFreePath(world: World, start: Vec2, goal: Vec2): ShortestPath {
  if (!pointFree(world, start) || !pointFree(world, goal)) return { cost: Infinity, path: null };
  if (segmentFree(world, start, goal)) return { cost: dist(start, goal), path: [{ ...start }, { ...goal }] };
  const g = graphOf(world);
  const V = g.nodes.length;
  const N = V + 2;
  const S = V;
  const G = V + 1;
  const pt = (i: number) => (i < V ? g.nodes[i] : i === S ? start : goal);
  // Edges from start and goal to every visible corner.
  const ws = new Float64Array(V).fill(Infinity);
  const wg = new Float64Array(V).fill(Infinity);
  for (let i = 0; i < V; i++) {
    if (segmentFree(world, start, g.nodes[i])) ws[i] = dist(start, g.nodes[i]);
    if (segmentFree(world, goal, g.nodes[i])) wg[i] = dist(goal, g.nodes[i]);
  }
  const weight = (a: number, b: number): number => {
    if (a === S) return b === G ? Infinity : ws[b];
    if (b === S) return a === G ? Infinity : ws[a];
    if (a === G) return wg[b];
    if (b === G) return wg[a];
    return g.w[a * V + b];
  };
  // Dense Dijkstra (V is a few hundred at most).
  const d = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  d[S] = 0;
  for (let it = 0; it < N; it++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && d[i] < best) {
      best = d[i];
      u = i;
    }
    if (u < 0 || u === G) break;
    done[u] = 1;
    for (let v = 0; v < N; v++) {
      if (done[v] || v === u) continue;
      const wuv = weight(u, v);
      if (wuv === Infinity) continue;
      if (d[u] + wuv < d[v] - 1e-12) {
        d[v] = d[u] + wuv;
        prev[v] = u;
      }
    }
  }
  if (!Number.isFinite(d[G])) return { cost: Infinity, path: null };
  const path: Vec2[] = [];
  for (let k = G; k >= 0; k = prev[k]) path.unshift({ ...pt(k) });
  return { cost: d[G], path };
}
