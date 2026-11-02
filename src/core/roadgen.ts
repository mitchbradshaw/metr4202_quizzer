// Random road maps for A*-by-hand practice (2024 Q29 style), deterministic from a seed.
//
// Towns are scattered with a minimum spacing in a W × H km box (x right, y down, like the exam figure).
// Roads are added shortest-first without crossings or passing close to another town (a greedy planar
// triangulation), then thinned to about 1.4–1.75 roads per town while keeping every town on at least two roads.
// Each road is longer than the straight line between its towns by a random "road factor" (1.0–1.4).
//
// Rounding keeps the straight-line heuristic admissible AND consistent, exactly as on the paper:
//   cost(a, b) = ceil₀.₁(|ab| · factor)  ≥ |ab|          (roads never beat the crow)
//   h(n)       = floor₀.₁(|n, goal|)    ≤ |n, goal|
// so h(n) ≤ |n, goal| ≤ any road route, and h(a) ≤ c(a, b) + h(b) for every road.
import { makeRng } from '../engine/rng';
import { distPointSeg, segSeg, type Vec2 } from './geom2d';
import { costToGo, graphSearch, neighboursOf, type WeightedGraph } from './graph';

export interface RoadMap {
  /** Towns (x, y in km, y down) and roads [a, b, cost km]. */
  graph: WeightedGraph;
  start: string;
  goal: string;
  /** Straight-line distance to `goal` (km), rounded down to 0.1 km. */
  h: Record<string, number>;
  /** The seed this map was generated from (reproduces it exactly). */
  seed: number;
  /** Size of the box the towns were placed in (km). */
  width: number;
  height: number;
}

export interface RoadGenOptions {
  /** Number of towns (default 6–9, from the seed). */
  n?: number;
  /** Box size in km (default 16 × 10). */
  width?: number;
  height?: number;
  /** Road factor range (default [1.0, 1.4]). */
  factor?: [number, number];
}

const LETTERS = 'ABCDEFGHIJKLMNOP';

/** Round up / down to 0.1 without floating-point fuzz (3.0000000001 → 3.0, not 3.1). */
export const ceil1 = (x: number) => Number((Math.ceil(x * 10 - 1e-7) / 10).toFixed(1));
export const floor1 = (x: number) => Number((Math.floor(x * 10 + 1e-7) / 10).toFixed(1));

/** Straight-line distance (km) from every town to `goal`, rounded down to 0.1 km: an admissible, consistent h. */
export function straightLineH(graph: WeightedGraph, goal: string): Record<string, number> {
  const g = graph.nodes.find((n) => n.id === goal);
  const out: Record<string, number> = {};
  for (const n of graph.nodes) out[n.id] = g ? floor1(Math.hypot((n.x ?? 0) - (g.x ?? 0), (n.y ?? 0) - (g.y ?? 0))) : 0;
  out[goal] = 0;
  return out;
}

/** Fewest roads between two towns (BFS hop count), Infinity if disconnected. */
function hops(graph: WeightedGraph, a: string, b: string): number {
  const nb = neighboursOf(graph);
  const seen = new Map<string, number>([[a, 0]]);
  const q = [a];
  while (q.length) {
    const u = q.shift()!;
    if (u === b) return seen.get(u)!;
    for (const [v] of nb(u)) if (!seen.has(v)) {
      seen.set(v, seen.get(u)! + 1);
      q.push(v);
    }
  }
  return Infinity;
}

function connected(n: number, edges: [number, number][]): boolean {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = new Array<boolean>(n).fill(false);
  const st = [0];
  seen[0] = true;
  let c = 1;
  while (st.length) {
    const u = st.pop()!;
    for (const v of adj[u]) if (!seen[v]) {
      seen[v] = true;
      c++;
      st.push(v);
    }
  }
  return c === n;
}

/** Smallest angle (rad) between segment directions u and v. */
function angleBetween(u: Vec2, v: Vec2): number {
  const d = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

/** One random road map from `seed` (same seed ⇒ same map). */
export function roadMap(seed: number, opts: RoadGenOptions = {}): RoadMap {
  const rng = makeRng(seed);
  const W = opts.width ?? 16;
  const H = opts.height ?? 10;
  const n = opts.n ?? rng.int(6, 9);
  const [fLo, fHi] = opts.factor ?? [1.0, 1.4];
  const margin = 0.8;

  // 1. Towns: dart throwing with a minimum spacing that shrinks until all n fit.
  let dmin = 0.62 * Math.sqrt((W * H) / n);
  let pts: Vec2[] = [];
  for (let round = 0; round < 12 && pts.length < n; round++) {
    pts = [];
    for (let tries = 0; tries < 4000 && pts.length < n; tries++) {
      const p = { x: rng.uniform(margin, W - margin), y: rng.uniform(margin, H - margin) };
      if (pts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= dmin)) pts.push(p);
    }
    if (pts.length < n) dmin *= 0.92;
  }
  // Letters run left to right so A is the westernmost town.
  pts.sort((a, b) => a.x - b.x);
  const N = pts.length;

  // 2. Greedy planar roads, shortest first: no crossings, keep clear of other towns, no razor-thin angles.
  const cand: { a: number; b: number; len: number }[] = [];
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) cand.push({ a, b, len: Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) });
  cand.sort((p, q) => p.len - q.len);
  const clear = 0.36 * dmin;
  const minAngle = (26 * Math.PI) / 180;
  const roads: [number, number][] = [];
  const dir = (a: number, b: number): Vec2 => ({ x: pts[b].x - pts[a].x, y: pts[b].y - pts[a].y });
  for (const { a, b } of cand) {
    let ok = true;
    for (const [c, d] of roads) {
      if (c === a || c === b || d === a || d === b) continue;
      if (segSeg(pts[a], pts[b], pts[c], pts[d])) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (let k = 0; k < N && ok; k++) if (k !== a && k !== b && distPointSeg(pts[k], pts[a], pts[b]) < clear) ok = false;
    if (!ok) continue;
    for (const [c, d] of roads) {
      if (c === a && angleBetween(dir(a, b), dir(a, d)) < minAngle) ok = false;
      else if (d === a && angleBetween(dir(a, b), dir(a, c)) < minAngle) ok = false;
      else if (c === b && angleBetween(dir(b, a), dir(b, d)) < minAngle) ok = false;
      else if (d === b && angleBetween(dir(b, a), dir(b, c)) < minAngle) ok = false;
      if (!ok) break;
    }
    if (ok) roads.push([a, b]);
  }
  // Dead ends make dull searches: give any town on a single road its shortest second road that still
  // crosses nothing and keeps clear of other towns (the angle rule is relaxed for this one).
  for (let a = 0; a < N; a++) {
    const degA = () => roads.filter(([c, d]) => c === a || d === a).length;
    if (degA() >= 2) continue;
    for (const { a: c, b: d } of cand) {
      if (c !== a && d !== a) continue;
      if (roads.some(([p, q]) => (p === c && q === d) || (p === d && q === c))) continue;
      let ok = true;
      for (const [p, q] of roads) {
        if (p === c || p === d || q === c || q === d) continue;
        if (segSeg(pts[c], pts[d], pts[p], pts[q])) {
          ok = false;
          break;
        }
      }
      for (let k = 0; k < N && ok; k++) if (k !== c && k !== d && distPointSeg(pts[k], pts[c], pts[d]) < clear) ok = false;
      if (ok) {
        roads.push([c, d]);
        if (degA() >= 2) break;
      }
    }
  }

  // 3. Thin out the long roads (randomly) to ~1.4–1.75 roads per town, keeping degree ≥ 2 and connectivity.
  const target = Math.max(N, Math.min(roads.length, Math.round(N * rng.uniform(1.4, 1.75))));
  const deg = new Array<number>(N).fill(0);
  for (const [a, b] of roads) {
    deg[a]++;
    deg[b]++;
  }
  const len = (e: [number, number]) => Math.hypot(pts[e[0]].x - pts[e[1]].x, pts[e[0]].y - pts[e[1]].y);
  const byLength = roads.slice().sort((p, q) => len(q) - len(p));
  let kept = roads.slice();
  for (const pass of [0, 1]) {
    for (const e of byLength) {
      if (kept.length <= target) break;
      if (!kept.includes(e)) continue;
      if (pass === 0 && !rng.chance(0.7)) continue;
      if (deg[e[0]] <= 2 || deg[e[1]] <= 2) continue;
      const without = kept.filter((x) => x !== e);
      if (!connected(N, without)) continue;
      kept = without;
      deg[e[0]]--;
      deg[e[1]]--;
    }
  }

  // 4. Costs: straight-line length × road factor, rounded UP to 0.1 km.
  const ids = pts.map((_, i) => LETTERS[i]);
  const graph: WeightedGraph = {
    nodes: pts.map((p, i) => ({ id: ids[i], x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) })),
    edges: kept.map(([a, b]) => [ids[a], ids[b], Math.max(0.5, ceil1(len([a, b]) * rng.uniform(fLo, fHi)))] as [string, string, number]),
  };

  // 5. Start and goal: far apart in a straight line and at least three roads apart.
  let far = 0;
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) far = Math.max(far, Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y));
  const pairs: [string, string][] = [];
  let best: [string, string] = [ids[0], ids[N - 1]];
  let bestHops = -1;
  for (let a = 0; a < N; a++)
    for (let b = 0; b < N; b++) {
      if (a === b) continue;
      const hp = hops(graph, ids[a], ids[b]);
      if (hp > bestHops && Number.isFinite(hp)) {
        bestHops = hp;
        best = [ids[a], ids[b]];
      }
      if (hp >= 3 && Number.isFinite(hp) && Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) >= 0.6 * far) pairs.push([ids[a], ids[b]]);
    }
  const [start, goal] = pairs.length ? rng.pick(pairs) : best;
  return { graph, start, goal, h: straightLineH(graph, goal), seed, width: W, height: H };
}

/** What makes a map worth practising on: used to pick among seeds. */
export interface RoadMapStats {
  /** Pops A* makes until it pops the goal. */
  pops: number;
  /** Roads on the shortest path. */
  pathEdges: number;
  /** An Open node got a cheaper parent at some step (the 2024 Q29 "SL improves" moment). */
  improves: number;
  /** A neighbour already in Open was reached by a worse route (no change). */
  worses: number;
  /** Two Open nodes tied for the lowest f at some pop (ambiguous by hand). */
  tieAtPop: boolean;
  /** The goal entered Open before a cheaper-f node was popped (goal test at pop matters). */
  goalWaited: boolean;
}

export function roadMapStats(m: RoadMap): RoadMapStats {
  const nb = neighboursOf(m.graph);
  const res = graphSearch(nb, m.start, m.goal, 'astar', { h: (n) => m.h[n] });
  let improves = 0;
  let worses = 0;
  let tieAtPop = false;
  let goalIn = false;
  let goalWaited = false;
  let before = res.initialOpen;
  for (const s of res.steps) {
    if (before.length > 1 && Math.abs(before[0].f - before[1].f) < 1e-9) tieAtPop = true;
    if (goalIn && s.expanded !== m.goal) goalWaited = true;
    for (const u of s.updates) {
      if (u.kind === 'improve') improves++;
      if (u.kind === 'worse') worses++;
      if (u.node === m.goal && u.kind === 'add') goalIn = true;
    }
    before = s.open;
  }
  return { pops: res.steps.length, pathEdges: (res.path?.length ?? 1) - 1, improves, worses, tieAtPop, goalWaited };
}

/**
 * The first map from seed, seed + 1, … that `accept` likes (deterministic). Falls back to the last one tried.
 * Each try is a few hundred microseconds, so 80 tries is still instant.
 */
export function pickRoadMap(seed: number, accept: (m: RoadMap, s: RoadMapStats) => boolean, tries = 80, opts: RoadGenOptions = {}): RoadMap {
  let m = roadMap(seed, opts);
  for (let k = 0; k < tries; k++) {
    m = roadMap(seed + k, opts);
    if (accept(m, roadMapStats(m))) return m;
  }
  return m;
}

/** True cost-to-go h*(n) on a road map (for admissibility checks). */
export function trueCostToGo(m: { graph: WeightedGraph }, goal: string): Map<string, number> {
  return costToGo(neighboursOf(m.graph), m.graph.nodes.map((n) => n.id), goal);
}
