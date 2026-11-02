// Pure model for "RRT vs RRT* by hand" (2025 Q29): a small tree rooted at x_0, a new sample x_new and a
// connection neighbourhood of radius r. Shared by the RrtStarHand simulation, the plan-rrtstar generator and
// their self-tests. Every length is rounded to 0.1 BEFORE any arithmetic (as an exam prints it), so the
// tables always add up exactly to the numbers shown.
import { dist, distPointSeg, segSeg, type Vec2 } from '../../../core/geom2d';
import type { Rng } from '../../../engine/rng';

export interface HandNode {
  /** Equal to the index in `nodes`; 0 is the root x_0. */
  id: number;
  /** Subscript of the vertex name: '0' for the root, then 'a', 'b', ...; '' for an unlabelled background node. */
  label: string;
  p: Vec2;
  /** Parent id (-1 for the root). */
  parent: number;
}

export interface HandScene {
  nodes: HandNode[];
  xnew: Vec2;
  radius: number;
}

/** Round to 0.1 (the printed precision). The tiny offset makes 98.99999999999999 round to 99. */
export const r1 = (x: number) => Math.round(x * 10 + (x >= 0 ? 1e-7 : -1e-7)) / 10;
/** A printed length: 6 -> "6.0". */
export const f1 = (x: number) => r1(x).toFixed(1);
/** Vertex name as TeX, e.g. "x_{a}" (or x_{new}). */
export const vx = (label: string) => `x_{${label || '?'}}`;

/** Printed length of the edge from `id` to its parent (0 for the root). */
export function edgeLen(nodes: readonly HandNode[], id: number): number {
  const n = nodes[id];
  return n.parent < 0 ? 0 : r1(dist(n.p, nodes[n.parent].p));
}

/** Cost-to-come c(x) of every node: the sum of printed edge lengths back to the root. */
export function costsOf(nodes: readonly HandNode[]): number[] {
  const c = new Array<number>(nodes.length).fill(NaN);
  const get = (id: number, depth: number): number => {
    if (!Number.isNaN(c[id])) return c[id];
    const n = nodes[id];
    const v = n.parent < 0 || depth > nodes.length ? 0 : r1(get(n.parent, depth + 1) + edgeLen(nodes, id));
    c[id] = v;
    return v;
  };
  nodes.forEach((n) => get(n.id, 0));
  return c;
}

/** Node ids from the root to `id` (inclusive). */
export function pathIds(nodes: readonly HandNode[], id: number): number[] {
  const out: number[] = [];
  for (let k = id, guard = 0; k >= 0 && guard <= nodes.length; k = nodes[k].parent, guard++) out.unshift(k);
  return out;
}

export function childrenOf(parents: readonly number[]): number[][] {
  const kids: number[][] = parents.map(() => []);
  parents.forEach((p, i) => {
    if (p >= 0 && p < kids.length) kids[p].push(i);
  });
  return kids;
}

/** Every descendant of `id` (not `id` itself), given the parent of each node. */
export function subtreeOf(parents: readonly number[], id: number): number[] {
  const kids = childrenOf(parents);
  const out: number[] = [];
  const stack = [...(kids[id] ?? [])];
  while (stack.length) {
    const k = stack.pop()!;
    out.push(k);
    stack.push(...kids[k]);
  }
  return out;
}

export interface NeighbourRow {
  id: number;
  /** Printed distance d(x, x_new). */
  d: number;
  dExact: number;
  /** Cost-to-come c(x). */
  c: number;
  /** Printed edge lengths from the root to x (for "2.8 + 3.0 + 4.1"). */
  edges: number[];
  /** Choose-parent total c(x) + d(x, x_new). */
  total: number;
}

export interface RewireRow {
  id: number;
  /** c(x_new) + d(x_new, x). */
  via: number;
  /** c(x) when it is checked (lower than `original` only if an ancestor was rewired earlier in this step). */
  current: number;
  original: number;
  rewire: boolean;
  /** via equals the current cost: no gain, so no rewire. */
  equal: boolean;
}

export interface DescendantRow {
  id: number;
  old: number;
  now: number;
  /** The rewired ancestor whose saving it inherits. */
  from: number;
}

export interface HandResult {
  /** Cost-to-come of every tree node before x_new is added. */
  costs: number[];
  /** Vertices within the radius, in label order. */
  neighbours: NeighbourRow[];
  /** Basic RRT: the nearest vertex (exact distance breaks a tie in the printed values). */
  nearest: number | null;
  nearestTie: boolean;
  /** c(x_new) if basic RRT connects to the nearest vertex. */
  rrtCost: number;
  /** RRT*: the neighbour with the smallest c + d (label order breaks ties). */
  parent: number | null;
  parentTie: boolean;
  cNew: number;
  /** Rewire check for every other neighbour, in label order (sequential, as RRT* runs it). */
  rewires: RewireRow[];
  /** Nodes below a rewired neighbour, whose cost drops by the same amount. */
  descendants: DescendantRow[];
  /** Cost of every tree node after the step. */
  after: number[];
  /** Parent of every tree node after the step (nodes.length stands for x_new). */
  afterParent: number[];
}

const byLabel = (nodes: readonly HandNode[]) => (a: number, b: number) =>
  nodes[a].label.localeCompare(nodes[b].label) || a - b;

/** One RRT* insertion done by hand: neighbours, choose parent, rewire (and what basic RRT would do). */
export function analyse(scene: HandScene): HandResult {
  const { nodes, xnew, radius } = scene;
  const costs = costsOf(nodes);
  const ids = nodes
    .map((n) => n.id)
    .filter((id) => dist(nodes[id].p, xnew) <= radius + 1e-9)
    .sort(byLabel(nodes));
  const neighbours: NeighbourRow[] = ids.map((id) => {
    const dExact = dist(nodes[id].p, xnew);
    const d = r1(dExact);
    const path = pathIds(nodes, id);
    return { id, d, dExact, c: costs[id], edges: path.slice(1).map((k) => edgeLen(nodes, k)), total: r1(costs[id] + d) };
  });
  const parentsNow = nodes.map((n) => n.parent);
  if (!neighbours.length) {
    return { costs, neighbours, nearest: null, nearestTie: false, rrtCost: NaN, parent: null, parentTie: false, cNew: NaN, rewires: [], descendants: [], after: costs.slice(), afterParent: parentsNow };
  }
  // Basic RRT: nearest by printed distance; the exact distance decides a printed tie.
  const byD = [...neighbours].sort((a, b) => a.d - b.d || a.dExact - b.dExact);
  const nearestRow = byD[0];
  const nearestTie = byD.length > 1 && Math.abs(byD[1].d - nearestRow.d) < 1e-9;
  // RRT* choose parent: smallest c + d; ties keep label order (the first one checked wins).
  let best = neighbours[0];
  for (const n of neighbours) if (n.total < best.total - 1e-9) best = n;
  const parentTie = neighbours.filter((n) => Math.abs(n.total - best.total) < 1e-9).length > 1;
  const cNew = best.total;
  // Rewire, sequentially (a rewire lowers the costs of the subtree before later checks, as in rrtStep).
  const cur = costs.slice();
  const par = parentsNow.slice();
  const NEW = nodes.length;
  const rewires: RewireRow[] = [];
  const descendants: DescendantRow[] = [];
  for (const n of neighbours) {
    if (n.id === best.id) continue;
    const via = r1(cNew + n.d);
    const current = cur[n.id];
    const rewire = via < current - 1e-9;
    rewires.push({ id: n.id, via, current, original: costs[n.id], rewire, equal: Math.abs(via - current) < 1e-9 });
    if (rewire) {
      const delta = r1(current - via);
      for (const k of subtreeOf(par, n.id)) {
        const old = cur[k];
        cur[k] = r1(cur[k] - delta);
        const prev = descendants.find((x) => x.id === k);
        if (prev) prev.now = cur[k];
        else descendants.push({ id: k, old, now: cur[k], from: n.id });
      }
      cur[n.id] = via;
      par[n.id] = NEW;
    }
  }
  return {
    costs,
    neighbours,
    nearest: nearestRow.id,
    nearestTie,
    rrtCost: r1(costs[nearestRow.id] + nearestRow.d),
    parent: best.id,
    parentTie,
    cNew,
    rewires,
    descendants,
    after: cur,
    afterParent: par,
  };
}

/** "2.8 + 3.0 + 4.1 = 9.9" (or "2.8" for a first-level node, "0" for the root). */
export function costSum(edges: readonly number[]): string {
  if (!edges.length) return '0';
  const total = r1(edges.reduce((t, e) => t + e, 0));
  return edges.length === 1 ? f1(total) : `${edges.map(f1).join(' + ')} = ${f1(total)}`;
}

// ------------------------------------------------------------------ the 2025 Q29 tree

const polar = (r: number, deg: number): Vec2 => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
const plus = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

/** The two intersections of circle (a, ra) and circle (b, rb). */
function circleX(a: Vec2, ra: number, b: Vec2, rb: number): [Vec2, Vec2] {
  const d = dist(a, b);
  const t = (ra * ra - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ra * ra - t * t));
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  const m = { x: a.x + ux * t, y: a.y + uy * t };
  return [
    { x: m.x - uy * h, y: m.y + ux * h },
    { x: m.x + uy * h, y: m.y - ux * h },
  ];
}

/**
 * The 2025 Q29 tree, laid out so that the geometry reproduces the printed numbers exactly (to 0.1):
 * edges x_0–x_b 2.8, x_b–x_a 3.2, x_b–x_c 3.0, x_c–x_d 4.1 and distances to x_new 1.5, 2.2, 2.8, 3.5.
 * The paper says its figure is not to scale; this one is, so dragging x_new starts from the same table.
 */
export function examScene(): HandScene {
  const N: Vec2 = { x: 0, y: 0 };
  const b = polar(2.2, 5.6);
  const [a] = circleX(N, 1.5, b, 3.2); // above the line x_new → x_b
  const [, c] = circleX(N, 2.8, b, 3.0); // below it
  const d = circleX(N, 3.5, c, 4.1).sort((p, q) => p.x - q.x)[0]; // the one to the left
  const x0 = plus(b, polar(2.8, 26));
  // Background branches of the paper's figure (unlabelled there; lettered from e here in case x_new is dragged to them).
  const n1 = plus(x0, { x: -1.57, y: 2.57 });
  const n2 = plus(x0, { x: 2.48, y: 0.95 });
  const n3 = plus(n2, { x: 1.9, y: 2.9 });
  const n4 = plus(n2, { x: 3.19, y: -0.24 });
  const n5 = plus(n4, { x: 2.43, y: 0.81 });
  const n6 = plus(x0, { x: 2.33, y: -2.05 });
  const n7 = plus(n6, { x: 2.67, y: 0.29 });
  const n8 = plus(n6, { x: -0.33, y: -2.0 });
  const nodes: HandNode[] = [
    { id: 0, label: '0', p: x0, parent: -1 },
    { id: 1, label: 'a', p: a, parent: 2 },
    { id: 2, label: 'b', p: b, parent: 0 },
    { id: 3, label: 'c', p: c, parent: 2 },
    { id: 4, label: 'd', p: d, parent: 3 },
    { id: 5, label: 'e', p: n1, parent: 0 },
    { id: 6, label: 'f', p: n2, parent: 0 },
    { id: 7, label: 'g', p: n3, parent: 6 },
    { id: 8, label: 'h', p: n4, parent: 6 },
    { id: 9, label: 'i', p: n5, parent: 8 },
    { id: 10, label: 'j', p: n6, parent: 0 },
    { id: 11, label: 'k', p: n7, parent: 10 },
    { id: 12, label: 'l', p: n8, parent: 10 },
  ];
  return { nodes, xnew: N, radius: 3.9 };
}

/** The four vertices the paper labels (the rest are background). */
export const EXAM_LABELLED = new Set(['0', 'a', 'b', 'c', 'd']);

// ------------------------------------------------------------------ random trees for practice

export interface SceneSpec {
  /** Number of vertices inside the neighbourhood. */
  neighbours: [number, number];
  /** Number of rewired neighbours. */
  rewires: [number, number];
  /** Add a labelled child (outside the circle) below a rewired neighbour, whose cost also drops. */
  descendant: boolean;
  /** Total tree size to grow (before the descendant). */
  size: [number, number];
}

export interface RandomScene {
  scene: HandScene;
  /** The extra descendant's id (spec.descendant), else null. */
  descendant: number | null;
  /** True when every constraint held (false = fell back to the exam tree). */
  ok: boolean;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Next unused vertex letter (then numbers after z). */
export function nextLabel(nodes: readonly HandNode[]): string {
  const used = new Set(nodes.map((n) => n.label));
  for (const ch of LETTERS) if (!used.has(ch)) return ch;
  for (let k = 1; ; k++) if (!used.has(String(k))) return String(k);
}

/** Give every unlabelled node the next free letter (the simulation needs a name for any vertex). */
export function labelAll(nodes: readonly HandNode[]): HandNode[] {
  const out = nodes.map((n) => ({ ...n }));
  for (const n of out) if (!n.label) n.label = nextLabel(out);
  return out;
}

const BOX = { x0: -10.5, x1: 5.5, y0: -5, y1: 5 };
const inBox = (p: Vec2) => p.x >= BOX.x0 && p.x <= BOX.x1 && p.y >= BOX.y0 && p.y <= BOX.y1;

/** Can segment a→b be added without crossing an edge or crowding a node (or x_new)? */
function edgeFits(nodes: readonly HandNode[], a: number, b: Vec2, xnew: Vec2): boolean {
  const pa = nodes[a].p;
  if (distPointSeg(xnew, pa, b) < 0.55) return false;
  for (const n of nodes) {
    if (dist(n.p, b) < 1.4) return false;
    if (n.id !== a && distPointSeg(n.p, pa, b) < 0.6) return false;
    if (n.parent >= 0 && n.id !== a && n.parent !== a) {
      const q = nodes[n.parent].p;
      if (segSeg(pa, b, n.p, q) || distPointSeg(b, n.p, q) < 0.6) return false;
    }
  }
  return true;
}

/**
 * A random tree in the style of 2025 Q29: grown like an RRT from x_0 = (0, 0), with x_new to its left. Rejection
 * sampling keeps only clear-cut instances: printed distances differ, the nearest vertex is NOT the RRT* parent, the
 * choose-parent minimum and every rewire decision win by at least 0.2, and the number of rewires is as asked.
 */
export function randomScene(rng: Rng, spec: SceneSpec): RandomScene {
  for (let attempt = 0; attempt < 600; attempt++) {
    const xnew = { x: r1(-5.2 + rng.uniform(-0.7, 0.7)), y: r1(rng.uniform(-0.9, 0.9)) };
    const radius = rng.step(3.6, 4.2, 0.1);
    const nodes: HandNode[] = [{ id: 0, label: '0', p: { x: 0, y: 0 }, parent: -1 }];
    if (dist(nodes[0].p, xnew) < radius + 0.5) continue;
    const size = rng.int(spec.size[0], spec.size[1]);
    for (let tries = 0; tries < size * 8 && nodes.length < size; tries++) {
      const toward = rng.chance(0.62);
      const ang = rng.uniform(0, 2 * Math.PI);
      const rad = toward ? radius * Math.sqrt(rng.next()) * 1.05 : 0;
      const target = toward
        ? { x: xnew.x + rad * Math.cos(ang), y: xnew.y + rad * Math.sin(ang) }
        : { x: rng.uniform(BOX.x0, BOX.x1), y: rng.uniform(BOX.y0, BOX.y1) };
      let near = 0;
      let bd = Infinity;
      for (const n of nodes) {
        const d = dist(n.p, target);
        if (d < bd) {
          bd = d;
          near = n.id;
        }
      }
      if (bd < 1.2) continue;
      const L = Math.min(bd, rng.uniform(2.1, 3.9));
      const from = nodes[near].p;
      const q = { x: from.x + ((target.x - from.x) * L) / bd, y: from.y + ((target.y - from.y) * L) / bd };
      if (!inBox(q) || dist(q, xnew) < 1.1) continue;
      const dq = dist(q, xnew);
      if (Math.abs(dq - radius) < 0.35) continue; // clearly inside or clearly outside the circle
      if (!edgeFits(nodes, near, q, xnew)) continue;
      nodes.push({ id: nodes.length, label: '', p: q, parent: near });
    }
    if (nodes.length < spec.size[0]) continue;
    const scene: HandScene = { nodes, xnew, radius };
    const res = analyse(scene);
    const nb = res.neighbours;
    if (nb.length < spec.neighbours[0] || nb.length > spec.neighbours[1]) continue;
    if (nb.some((n) => n.id === 0 || n.d < 1.0)) continue;
    const ds = nb.map((n) => n.d).sort((a, b) => a - b);
    if (ds.some((d, i) => i > 0 && d - ds[i - 1] < 0.1 - 1e-9)) continue; // every printed distance differs
    if (ds.length > 1 && ds[1] - ds[0] < 0.2 - 1e-9) continue;
    if (res.nearest === res.parent || res.parentTie || res.nearestTie) continue;
    const totals = nb.map((n) => n.total).sort((a, b) => a - b);
    if (totals.length > 1 && totals[1] - totals[0] < 0.3 - 1e-9) continue;
    if (res.rewires.some((r) => Math.abs(r.via - r.current) < 0.2 - 1e-9)) continue;
    const rewired = res.rewires.filter((r) => r.rewire).map((r) => r.id);
    if (rewired.length < spec.rewires[0] || rewired.length > spec.rewires[1]) continue;
    // By hand every rewire is judged on the original costs: avoid a rewired vertex with another neighbour below it.
    const parents = nodes.map((n) => n.parent);
    if (rewired.some((id) => subtreeOf(parents, id).some((k) => nb.some((n) => n.id === k)))) continue;
    if (res.rewires.some((r) => Math.abs(r.current - r.original) > 1e-9)) continue;
    // Labels: neighbours get a, b, c... in a random order (so the answer is not always x_a or x_b).
    const letters = rng.shuffle(LETTERS.slice(0, nb.length).split(''));
    nb.forEach((n, i) => (nodes[n.id].label = letters[i]));
    let descendant: number | null = null;
    if (spec.descendant) {
      descendant = addDescendant(rng, nodes, xnew, radius, rewired);
      if (descendant === null) continue;
      nodes[descendant].label = LETTERS[nb.length];
    }
    return { scene: { nodes, xnew, radius }, descendant, ok: true };
  }
  return { scene: examScene(), descendant: null, ok: false };
}

/** A child below one of the rewired vertices, outside the circle (an existing one if possible). */
function addDescendant(rng: Rng, nodes: HandNode[], xnew: Vec2, radius: number, rewired: number[]): number | null {
  for (const id of rng.shuffle(rewired)) {
    const kid = nodes.find((n) => n.parent === id && dist(n.p, xnew) > radius + 0.3);
    if (kid) return kid.id;
  }
  for (let t = 0; t < 60; t++) {
    const id = rng.pick(rewired);
    const p = nodes[id].p;
    const away = Math.atan2(p.y - xnew.y, p.x - xnew.x) + rng.uniform(-0.9, 0.9);
    const L = rng.uniform(2.0, 3.2);
    const q = { x: p.x + L * Math.cos(away), y: p.y + L * Math.sin(away) };
    if (dist(q, xnew) < radius + 0.4) continue;
    if (q.x < BOX.x0 - 2 || q.x > BOX.x1 + 1 || Math.abs(q.y) > BOX.y1 + 1.5) continue;
    if (!edgeFits(nodes, id, q, xnew)) continue;
    nodes.push({ id: nodes.length, label: '', p: q, parent: id });
    return nodes.length - 1;
  }
  return null;
}
