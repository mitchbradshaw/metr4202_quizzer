// Sampling-based planners for a point robot in a 2D world (summary notes §5): PRM, RRT and RRT*.
// Each RRT/RRT* step returns an event describing what happened (nearest node, candidates, chosen parent,
// rewires) so the UI can highlight choose-parent and rewire. The by-hand helpers at the bottom reproduce
// the exam's tables (2025 Q29).
import { type Shape, type Vec2, dist, segHitsShape, pointInShape } from './geom2d';
import { graphSearch, type Neighbours } from './graph';

export interface World {
  w: number;
  h: number;
  obstacles: Shape[];
}

export function pointFree(world: World, p: Vec2): boolean {
  if (p.x < 0 || p.y < 0 || p.x > world.w || p.y > world.h) return false;
  return !world.obstacles.some((o) => pointInShape(p, o));
}

/** The whole segment must be free (checking only the end-points is the classic mistake, 2023 Q32c). */
export function segmentFree(world: World, a: Vec2, b: Vec2): boolean {
  return pointFree(world, a) && pointFree(world, b) && !world.obstacles.some((o) => segHitsShape(a, b, o));
}

// ------------------------------------------------------------------ RRT / RRT*

export interface TreeNode {
  id: number;
  p: Vec2;
  parent: number; // -1 for the root
  cost: number; // cost-to-come c(x) from the root
}

export interface Tree {
  nodes: TreeNode[];
}

export function treeInit(start: Vec2): Tree {
  return { nodes: [{ id: 0, p: { ...start }, parent: -1, cost: 0 }] };
}

export interface RrtOptions {
  /** Maximum edge length when steering towards a sample. */
  step: number;
  /** Probability of sampling the goal instead of a random point. */
  goalBias: number;
  goal?: Vec2;
  /** RRT* when true. */
  star: boolean;
  /** RRT* neighbourhood radius (fixed, or γ·(log n / n)^(1/2) capped at `radius` when `shrink`). */
  radius: number;
  shrink?: boolean;
}

export interface ParentCandidate {
  id: number;
  /** c(x_near) + d(x_near, x_new). */
  total: number;
  /** Is the edge x_near → x_new collision-free? */
  free: boolean;
}

export interface Rewire {
  id: number;
  /** c(x_new) + d(x_new, x_near). */
  via: number;
  /** c(x_near) before. */
  current: number;
  /** Was it rewired (via < current and the edge is free)? */
  done: boolean;
  oldParent: number;
}

export interface RrtEvent {
  sample: Vec2;
  nearest: number;
  /** Steered point (≤ step from nearest). */
  steered: Vec2;
  /** Id of the new node, or -1 if the extension was blocked. */
  added: number;
  /** RRT*: neighbours within the radius and their choose-parent totals. */
  candidates: ParentCandidate[];
  chosenParent: number;
  rewires: Rewire[];
  radius: number;
}

/** Ids of every node in the subtree below `id` (for propagating cost changes after a rewire). */
function subtree(tree: Tree, id: number): number[] {
  const kids = new Map<number, number[]>();
  for (const n of tree.nodes) if (n.parent >= 0) (kids.get(n.parent) ?? kids.set(n.parent, []).get(n.parent)!).push(n.id);
  const out: number[] = [];
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const k = stack.pop()!;
    out.push(k);
    stack.push(...(kids.get(k) ?? []));
  }
  return out;
}

export function nearestNode(tree: Tree, p: Vec2): number {
  let best = 0;
  let bd = Infinity;
  for (const n of tree.nodes) {
    const d = dist(n.p, p);
    if (d < bd) {
      bd = d;
      best = n.id;
    }
  }
  return best;
}

export function steer(from: Vec2, to: Vec2, step: number): Vec2 {
  const d = dist(from, to);
  if (d <= step) return { ...to };
  return { x: from.x + ((to.x - from.x) * step) / d, y: from.y + ((to.y - from.y) * step) / d };
}

/** One iteration of RRT (star = false) or RRT* (star = true). Mutates `tree`. `next()` is uniform in [0, 1). */
export function rrtStep(world: World, tree: Tree, next: () => number, o: RrtOptions): RrtEvent {
  const sample = o.goal && next() < o.goalBias ? { ...o.goal } : { x: next() * world.w, y: next() * world.h };
  const nearest = nearestNode(tree, sample);
  const steered = steer(tree.nodes[nearest].p, sample, o.step);
  const n = tree.nodes.length;
  // Shrinking neighbourhood r = min(r_max, γ·sqrt(log n / n)) (2D), with γ chosen so r = r_max for small trees.
  const radius = o.shrink ? Math.min(o.radius, 3 * o.radius * Math.sqrt(Math.log(n + 1) / (n + 1))) : o.radius;
  const ev: RrtEvent = { sample, nearest, steered, added: -1, candidates: [], chosenParent: -1, rewires: [], radius };
  // A sample that lands on an existing node (e.g. the goal, re-sampled by goal bias) adds nothing:
  // a zero-length edge would only create a duplicate node and spurious rewires.
  if (dist(tree.nodes[nearest].p, steered) < 1e-9) return ev;
  if (!segmentFree(world, tree.nodes[nearest].p, steered)) return ev;

  let parent = nearest;
  let cost = tree.nodes[nearest].cost + dist(tree.nodes[nearest].p, steered);
  let near: number[] = [];
  if (o.star) {
    near = tree.nodes.filter((nd) => dist(nd.p, steered) <= radius).map((nd) => nd.id);
    if (!near.includes(nearest)) near.push(nearest);
    for (const id of near) {
      const nd = tree.nodes[id];
      const total = nd.cost + dist(nd.p, steered);
      const free = id === nearest ? true : segmentFree(world, nd.p, steered);
      ev.candidates.push({ id, total, free });
      if (free && total < cost - 1e-12) {
        cost = total;
        parent = id;
      }
    }
  }
  const id = tree.nodes.length;
  tree.nodes.push({ id, p: steered, parent, cost });
  ev.added = id;
  ev.chosenParent = parent;

  if (o.star) {
    for (const nid of near) {
      if (nid === parent) continue;
      const nd = tree.nodes[nid];
      const via = cost + dist(steered, nd.p);
      const better = via < nd.cost - 1e-12;
      const free = better && segmentFree(world, steered, nd.p);
      const r: Rewire = { id: nid, via, current: nd.cost, done: better && free, oldParent: nd.parent };
      ev.rewires.push(r);
      if (r.done) {
        const delta = nd.cost - via;
        nd.parent = id;
        nd.cost = via;
        for (const k of subtree(tree, nid)) tree.nodes[k].cost -= delta;
      }
    }
  }
  return ev;
}

/** Path (root → node) as points. */
export function treePath(tree: Tree, id: number): Vec2[] {
  const out: Vec2[] = [];
  for (let k = id; k >= 0; k = tree.nodes[k].parent) out.unshift(tree.nodes[k].p);
  return out;
}

/** Cheapest node within `tol` of the goal that can see it, with its total cost to the goal (or null). */
export function bestToGoal(world: World, tree: Tree, goal: Vec2, tol: number): { id: number; cost: number } | null {
  let best: { id: number; cost: number } | null = null;
  for (const n of tree.nodes) {
    const d = dist(n.p, goal);
    if (d > tol) continue;
    if (!segmentFree(world, n.p, goal)) continue;
    const c = n.cost + d;
    if (!best || c < best.cost) best = { id: n.id, cost: c };
  }
  return best;
}

// ------------------------------------------------------------------ PRM

export interface Roadmap {
  nodes: Vec2[];
  edges: [number, number, number][];
}

/** Sample n free configurations and connect each to neighbours within `radius` (or its k nearest) by free edges. */
export function prmBuild(world: World, next: () => number, n: number, opts: { radius?: number; k?: number } = {}): Roadmap {
  const nodes: Vec2[] = [];
  let tries = 0;
  while (nodes.length < n && tries < n * 50) {
    tries++;
    const p = { x: next() * world.w, y: next() * world.h };
    if (pointFree(world, p)) nodes.push(p);
  }
  return { nodes, edges: prmConnect(world, nodes, opts) };
}

export function prmConnect(world: World, nodes: readonly Vec2[], opts: { radius?: number; k?: number }): [number, number, number][] {
  const edges: [number, number, number][] = [];
  const seen = new Set<string>();
  nodes.forEach((p, i) => {
    let cands = nodes.map((q, j) => ({ j, d: dist(p, q) })).filter((c) => c.j !== i);
    if (opts.radius !== undefined) cands = cands.filter((c) => c.d <= opts.radius!);
    cands.sort((a, b) => a.d - b.d);
    if (opts.k !== undefined) cands = cands.slice(0, opts.k);
    for (const c of cands) {
      const key = i < c.j ? `${i}-${c.j}` : `${c.j}-${i}`;
      if (seen.has(key)) continue;
      if (segmentFree(world, p, nodes[c.j])) {
        seen.add(key);
        edges.push([i, c.j, c.d]);
      }
    }
  });
  return edges;
}

/** Connect start and goal to the roadmap and search it with A* (Euclidean heuristic). */
export function prmQuery(world: World, rm: Roadmap, start: Vec2, goal: Vec2, opts: { radius?: number; k?: number }): { path: Vec2[] | null; cost: number } {
  const nodes = [...rm.nodes, start, goal];
  const s = nodes.length - 2;
  const g = nodes.length - 1;
  const edges = [...rm.edges];
  for (const idx of [s, g]) {
    let cands = rm.nodes.map((q, j) => ({ j, d: dist(nodes[idx], q) }));
    if (opts.radius !== undefined) cands = cands.filter((c) => c.d <= opts.radius! * 1.5);
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, opts.k ?? 8)) if (segmentFree(world, nodes[idx], nodes[c.j])) edges.push([idx, c.j, c.d]);
  }
  const adj = new Map<string, [string, number][]>();
  nodes.forEach((_, i) => adj.set(String(i), []));
  for (const [a, b, w] of edges) {
    adj.get(String(a))!.push([String(b), w]);
    adj.get(String(b))!.push([String(a), w]);
  }
  const nb: Neighbours = (k) => adj.get(k) ?? [];
  const res = graphSearch(nb, String(s), String(g), 'astar', { h: (k) => dist(nodes[Number(k)], goal) });
  return { path: res.path ? res.path.map((k) => nodes[Number(k)]) : null, cost: res.cost };
}

// ------------------------------------------------------------------ by hand (2025 Q29)

export interface HandNeighbour {
  id: string;
  /** Cost-to-come c(x) from the root along existing edges. */
  cost: number;
  /** Distance d(x, x_new). */
  d: number;
}

/** Basic RRT: connect x_new to the NEAREST vertex, ignoring cost-to-come. */
export function rrtParentByHand(nbs: readonly HandNeighbour[]): string {
  return [...nbs].sort((a, b) => a.d - b.d)[0].id;
}

/** RRT* choose parent: minimise c(x_near) + d(x_near, x_new). Returns the table too. */
export function rrtStarParentByHand(nbs: readonly HandNeighbour[]): { parent: string; cost: number; table: { id: string; total: number }[] } {
  const table = nbs.map((n) => ({ id: n.id, total: n.cost + n.d }));
  const best = [...table].sort((a, b) => a.total - b.total)[0];
  return { parent: best.id, cost: best.total, table };
}

/** RRT* rewire: for every other neighbour, rewire if c(x_new) + d(x_new, x_near) < c(x_near). */
export function rrtStarRewireByHand(nbs: readonly HandNeighbour[], parent: string, newCost: number): { id: string; via: number; current: number; rewire: boolean }[] {
  return nbs.filter((n) => n.id !== parent).map((n) => ({ id: n.id, via: newCost + n.d, current: n.cost, rewire: newCost + n.d < n.cost - 1e-12 }));
}
