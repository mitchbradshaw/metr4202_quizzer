// Incremental RRT / RRT* with a replayable log, for the "PRM, RRT and RRT*" simulation.
//
// It runs exactly core/sampling.ts rrtStep (same samples from the same seed, same nearest / choose-parent /
// rewire rules and tie-breaks; the self-test plan-sampling-engine-vs-core checks it node for node, and the goal
// cost against core bestToGoal) and adds what the simulation needs:
//   - an "endpoint-only" collision mode: only the new node is checked, never the edge (the 2023 Q32c mistake);
//   - a log of every birth and rewire, so any earlier iteration can be redrawn without re-running;
//   - incremental child lists (core rebuilds a child map for every rewire) and collision-check counts;
//   - the best path to the goal after every iteration (for the cost-vs-iterations plot);
//   - no duplicate nodes: once a node sits exactly on the goal, core rrtStep adds a zero-length copy of it for
//     every later goal sample; here such a sample adds nothing (same random draws, same tree otherwise).
import { dist, type Shape, type Vec2 } from '../../../core/geom2d';
import { pointFree, segmentFree, steer, type World } from '../../../core/sampling';
import { mulberry32 } from '../../../engine/rng';

export type CheckMode = 'edge' | 'endpoint';

export interface GrowSpec {
  world: World;
  start: Vec2;
  goal: Vec2;
  /** Maximum edge length η. */
  step: number;
  /** Probability of sampling the goal itself. */
  goalBias: number;
  star: boolean;
  /** RRT* neighbourhood radius (fixed). */
  radius: number;
  check: CheckMode;
  seed: number;
  maxIt: number;
  /** A node this close to the goal that can see it completes a path (default: the step size). */
  goalTol?: number;
}

export interface StepLog {
  sample: Vec2;
  goalSample: boolean;
  nearest: number;
  steered: Vec2;
  /** Id of the new node, or -1 when the extension was rejected. */
  added: number;
  radius: number;
  /** RRT*: neighbours within the radius (ids, c + d totals, edge free?). Empty for RRT. */
  candIds: Int32Array;
  candTotals: Float64Array;
  candFree: Uint8Array;
  /** Chosen parent (-1 when rejected). */
  parent: number;
  /** c(nearest) + d(nearest, x_new): what connecting to the nearest node would cost. */
  nearestTotal: number;
  /** c(x_new) after choose-parent. */
  cost: number;
  rewires: { id: number; via: number; current: number; done: boolean; oldParent: number }[];
  /** The new edge really crosses an obstacle (only possible with endpoint-only checking). */
  badEdge: boolean;
  /** The steered point is the nearest node itself (the goal, sampled again once it is in the tree): nothing added. */
  dup: boolean;
}

interface RewireRec {
  it: number;
  id: number;
  from: number;
  to: number;
  bad: boolean;
}

export class GrowRun {
  readonly spec: GrowSpec;
  private readonly next: () => number;
  private readonly tol: number;
  // Current tree (after `it` iterations).
  readonly px: number[] = [];
  readonly py: number[] = [];
  readonly parent: number[] = [];
  readonly cost: number[] = [];
  private readonly kids: number[][] = [];
  // Log.
  /** Parent and "edge crosses an obstacle" flag of each node when it was added. */
  private readonly parent0: number[] = [];
  private readonly bad0: number[] = [];
  private readonly rewireLog: RewireRec[] = [];
  readonly log: StepLog[] = [];
  /** Node count, rewire count and cumulative collision checks after iteration i (index 0 = before any). */
  readonly nodesAt: number[] = [1];
  readonly rewiresAt: number[] = [0];
  readonly checksAt: number[] = [0];
  /** Best path cost to the goal after iteration i (NaN while there is none) and its last tree node. */
  readonly best: number[] = [NaN];
  readonly bestId: number[] = [-1];
  /** First iteration with a path (-1 until then). */
  firstIt = -1;
  /** Iterations done. */
  it = 0;
  private readonly goalCands: number[] = [];
  private readonly goalBad: Map<number, boolean> = new Map();
  private checks = 0;

  constructor(spec: GrowSpec) {
    this.spec = spec;
    this.next = mulberry32(spec.seed);
    this.tol = spec.goalTol ?? spec.step;
    this.addNode(spec.start, -1, 0, false);
    this.considerGoal(0);
    const b = this.bestNow();
    this.best[0] = b.cost;
    this.bestId[0] = b.id;
    if (Number.isFinite(b.cost)) this.firstIt = 0;
  }

  get done(): boolean {
    return this.it >= this.spec.maxIt;
  }

  /** Run up to `n` more iterations. */
  advance(n: number) {
    for (let k = 0; k < n && !this.done; k++) this.iterate();
  }

  /** Run iterations for about `ms` milliseconds (time-slicing keeps the page responsive). Returns `done`. */
  advanceFor(ms: number): boolean {
    const t0 = performance.now();
    while (!this.done) {
      for (let k = 0; k < 8 && !this.done; k++) this.iterate();
      if (performance.now() - t0 >= ms) break;
    }
    return this.done;
  }

  // ---------------------------------------------------------------- replay

  /** Parents of every node as they were after iteration i. */
  parentsAt(i: number): Int32Array {
    const k = Math.max(0, Math.min(i, this.it));
    const n = this.nodesAt[k];
    const par = Int32Array.from(this.parent0.slice(0, n));
    const R = this.rewiresAt[k];
    for (let r = 0; r < R; r++) par[this.rewireLog[r].id] = this.rewireLog[r].to;
    return par;
  }

  /** Does the edge into each node cross an obstacle (after iteration i)? Only ever true in endpoint mode. */
  badAt(i: number): Uint8Array {
    const k = Math.max(0, Math.min(i, this.it));
    const n = this.nodesAt[k];
    const bad = Uint8Array.from(this.bad0.slice(0, n));
    const R = this.rewiresAt[k];
    for (let r = 0; r < R; r++) bad[this.rewireLog[r].id] = this.rewireLog[r].bad ? 1 : 0;
    return bad;
  }

  /** Rewires made in iteration i (old edge from → id replaced by to → id). */
  rewiresIn(i: number): RewireRec[] {
    if (i < 1 || i > this.it) return [];
    return this.rewireLog.slice(this.rewiresAt[i - 1], this.rewiresAt[i]);
  }

  /** Points of the best path after iteration i (root → … → goal), or null. Uses `par` if given. */
  pathAt(i: number, par?: Int32Array): Vec2[] | null {
    const k = Math.max(0, Math.min(i, this.it));
    const id = this.bestId[k];
    if (id < 0) return null;
    const P = par ?? this.parentsAt(k);
    const pts: Vec2[] = [];
    for (let q = id, guard = 0; q >= 0 && guard < P.length + 1; q = P[q], guard++) pts.unshift({ x: this.px[q], y: this.py[q] });
    const g = this.spec.goal;
    if (dist(pts[pts.length - 1], g) > 1e-12) pts.push({ ...g });
    return pts;
  }

  /** Does the final connection of the best path (node → goal) cross an obstacle? */
  goalEdgeBad(i: number): boolean {
    const id = this.bestId[Math.max(0, Math.min(i, this.it))];
    return id >= 0 && !!this.goalBad.get(id);
  }

  // ---------------------------------------------------------------- one iteration (mirrors core rrtStep)

  private free(a: Vec2, b: Vec2): boolean {
    this.checks++;
    return this.spec.check === 'edge' ? segmentFree(this.spec.world, a, b) : pointFree(this.spec.world, b);
  }

  /** Ground truth for drawing: does segment a-b cross an obstacle? (Not counted as a planner check.) */
  private crosses(a: Vec2, b: Vec2): boolean {
    return this.spec.check === 'endpoint' && !segmentFree(this.spec.world, a, b);
  }

  private addNode(p: Vec2, parent: number, cost: number, bad: boolean): number {
    const id = this.px.length;
    this.px.push(p.x);
    this.py.push(p.y);
    this.parent.push(parent);
    this.cost.push(cost);
    this.kids.push([]);
    this.parent0.push(parent);
    this.bad0.push(bad ? 1 : 0);
    if (parent >= 0) this.kids[parent].push(id);
    return id;
  }

  private considerGoal(id: number) {
    const p = { x: this.px[id], y: this.py[id] };
    const g = this.spec.goal;
    if (dist(p, g) > this.tol) return;
    if (!this.free(p, g)) return;
    this.goalCands.push(id);
    this.goalBad.set(id, this.crosses(p, g));
  }

  private bestNow(): { id: number; cost: number } {
    let id = -1;
    let cost = NaN;
    const g = this.spec.goal;
    for (const k of this.goalCands) {
      const c = this.cost[k] + dist({ x: this.px[k], y: this.py[k] }, g);
      if (id < 0 || c < cost) {
        id = k;
        cost = c;
      }
    }
    return { id, cost };
  }

  private iterate() {
    const o = this.spec;
    const W = o.world;
    const next = this.next;
    // Same random-number consumption as rrtStep: one draw for the goal bias, two for a uniform sample.
    const goalSample = next() < o.goalBias;
    const sample = goalSample ? { ...o.goal } : { x: next() * W.w, y: next() * W.h };
    const n = this.px.length;
    let nearest = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(this.px[i] - sample.x, this.py[i] - sample.y);
      if (d < bd) {
        bd = d;
        nearest = i;
      }
    }
    const pn = { x: this.px[nearest], y: this.py[nearest] };
    const steered = steer(pn, sample, o.step);
    const radius = o.radius;
    const ev: StepLog = {
      sample,
      goalSample,
      nearest,
      steered,
      added: -1,
      radius,
      candIds: EMPTY_I,
      candTotals: EMPTY_F,
      candFree: EMPTY_U,
      parent: -1,
      nearestTotal: this.cost[nearest] + dist(pn, steered),
      cost: NaN,
      rewires: [],
      badEdge: false,
      dup: dist(pn, steered) < 1e-9,
    };
    this.it++;
    if (!ev.dup && this.free(pn, steered)) {
      let parent = nearest;
      let cost = this.cost[nearest] + dist(pn, steered);
      let near: number[] = [];
      if (o.star) {
        for (let i = 0; i < n; i++) if (dist({ x: this.px[i], y: this.py[i] }, steered) <= radius) near.push(i);
        if (!near.includes(nearest)) near.push(nearest);
        const ids = new Int32Array(near.length);
        const totals = new Float64Array(near.length);
        const frees = new Uint8Array(near.length);
        near.forEach((id, k) => {
          const p = { x: this.px[id], y: this.py[id] };
          const total = this.cost[id] + dist(p, steered);
          const free = id === nearest ? true : this.free(p, steered);
          ids[k] = id;
          totals[k] = total;
          frees[k] = free ? 1 : 0;
          if (free && total < cost - 1e-12) {
            cost = total;
            parent = id;
          }
        });
        ev.candIds = ids;
        ev.candTotals = totals;
        ev.candFree = frees;
      }
      const pp = { x: this.px[parent], y: this.py[parent] };
      const bad = this.crosses(pp, steered);
      const id = this.addNode(steered, parent, cost, bad);
      ev.added = id;
      ev.parent = parent;
      ev.cost = cost;
      ev.badEdge = bad;
      if (o.star) {
        for (const nid of near) {
          if (nid === parent) continue;
          const np = { x: this.px[nid], y: this.py[nid] };
          const via = cost + dist(steered, np);
          const current = this.cost[nid];
          const better = via < current - 1e-12;
          const free = better && this.free(steered, np);
          const done = better && free;
          const oldParent = this.parent[nid];
          ev.rewires.push({ id: nid, via, current, done, oldParent });
          if (done) {
            const delta = current - via;
            const sib = this.kids[oldParent];
            sib.splice(sib.indexOf(nid), 1);
            this.kids[id].push(nid);
            this.parent[nid] = id;
            this.cost[nid] = via;
            const stack = [...this.kids[nid]];
            while (stack.length) {
              const k = stack.pop()!;
              this.cost[k] -= delta;
              for (const c of this.kids[k]) stack.push(c);
            }
            this.rewireLog.push({ it: this.it, id: nid, from: oldParent, to: id, bad: this.crosses(steered, np) });
          }
        }
      }
      this.considerGoal(id);
    }
    this.log.push(ev);
    const b = this.bestNow();
    this.best.push(b.cost);
    this.bestId.push(b.id);
    if (this.firstIt < 0 && Number.isFinite(b.cost)) this.firstIt = this.it;
    this.nodesAt.push(this.px.length);
    this.rewiresAt.push(this.rewireLog.length);
    this.checksAt.push(this.checks);
  }
}

const EMPTY_I = new Int32Array(0);
const EMPTY_F = new Float64Array(0);
const EMPTY_U = new Uint8Array(0);

// ------------------------------------------------------------------ worlds

export type WorldKey = 'open' | 'narrow' | 'cluttered' | 'bugtrap';

export interface WorldPreset {
  key: WorldKey;
  label: string;
  world: World;
  start: Vec2;
  goal: Vec2;
  blurb: string;
}

const rect = (x: number, y: number, w: number, h: number): Shape => ({ kind: 'rect', x, y, w, h });
const circ = (x: number, y: number, r: number): Shape => ({ kind: 'circle', x, y, r });

export const WORLDS: Record<WorldKey, WorldPreset> = {
  open: {
    key: 'open',
    label: 'Open',
    world: { w: 10, h: 10, obstacles: [] },
    start: { x: 1, y: 1 },
    goal: { x: 9, y: 9 },
    blurb: 'No obstacles: the shortest path is the straight line, so you can see exactly how far each planner is from optimal.',
  },
  narrow: {
    key: 'narrow',
    label: 'Narrow passage',
    world: { w: 10, h: 10, obstacles: [rect(4.85, 0, 0.3, 6.6), rect(4.85, 7.3, 0.3, 2.7)] },
    start: { x: 1.5, y: 2 },
    goal: { x: 8.5, y: 2 },
    blurb: 'A thin wall with one 0.7-wide gap, far from the straight line. Few samples land near the gap, so the first path takes long.',
  },
  cluttered: {
    key: 'cluttered',
    label: 'Cluttered',
    world: {
      w: 10,
      h: 10,
      obstacles: [
        circ(2.5, 3, 0.8),
        circ(5, 6.5, 1),
        rect(6, 2, 1.2, 2.5),
        rect(3.2, 7.8, 1.5, 0.8),
        circ(7.8, 7.4, 0.7),
        rect(1, 5.6, 2, 0.6),
        circ(4.2, 4.4, 0.6),
        rect(8, 4.4, 0.6, 1.8),
        circ(8.6, 1.6, 0.5),
      ],
    },
    start: { x: 1, y: 1 },
    goal: { x: 9, y: 9 },
    blurb: 'Many small obstacles: many routes (homotopy classes); RRT* keeps switching to shorter ones.',
  },
  bugtrap: {
    key: 'bugtrap',
    label: 'Bug trap',
    world: {
      w: 10,
      h: 10,
      obstacles: [rect(1.5, 2, 0.3, 6), rect(1.5, 7.7, 5.5, 0.3), rect(1.5, 2, 5.5, 0.3), rect(6.7, 5.6, 0.3, 2.4), rect(6.7, 2, 0.3, 2.4), rect(5, 5.6, 1.7, 0.25), rect(5, 4.15, 1.7, 0.25)],
    },
    start: { x: 3.2, y: 5 },
    goal: { x: 9, y: 9 },
    blurb: 'The start is inside a cup whose only exit is a narrow channel. A goal-biased sample only pushes the tree into the wall facing the goal; the random samples are what find the way out.',
  },
};

export const WORLD_KEYS: WorldKey[] = ['open', 'narrow', 'cluttered', 'bugtrap'];

/** Nearest free point to p (searching outwards), so a dragged start/goal never ends inside an obstacle. */
export function nearestFree(world: World, p: Vec2): Vec2 {
  const c = { x: Math.max(0.15, Math.min(world.w - 0.15, p.x)), y: Math.max(0.15, Math.min(world.h - 0.15, p.y)) };
  if (pointFree(world, c) && clearance(world, c) >= 0.12) return c;
  for (let r = 0.1; r < 3; r += 0.1) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI;
      const q = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
      if (q.x < 0.15 || q.y < 0.15 || q.x > world.w - 0.15 || q.y > world.h - 0.15) continue;
      if (pointFree(world, q) && clearance(world, q) >= 0.12) return q;
    }
  }
  return c;
}

function clearance(world: World, p: Vec2): number {
  let m = Infinity;
  for (const o of world.obstacles) {
    if (o.kind === 'circle') m = Math.min(m, Math.hypot(p.x - o.x, p.y - o.y) - o.r);
    else if (o.kind === 'rect') {
      const dx = Math.max(o.x - p.x, 0, p.x - (o.x + o.w));
      const dy = Math.max(o.y - p.y, 0, p.y - (o.y + o.h));
      m = Math.min(m, Math.hypot(dx, dy));
    }
  }
  return m;
}
