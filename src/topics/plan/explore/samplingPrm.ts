// Incremental probabilistic roadmap (PRM) with a replayable build, for the "PRM, RRT and RRT*" simulation.
//
// Sampling is exactly core/sampling.ts prmBuild (same draws from the same seed, samples inside obstacles are
// discarded), and with a connection radius the finished roadmap has exactly core prmConnect's edges (the
// self-test plan-sampling-prm-vs-core checks both). Vertices are added one at a time, each trying to connect to
// the earlier vertices within the radius (or its k nearest earlier vertices), so the build can be replayed step
// by step. A query connects start and goal to the roadmap with core prmQuery's rule and runs A*; the roadmap
// itself is never touched, which is what makes a PRM multi-query.
import { dist, type Vec2 } from '../../../core/geom2d';
import { pointFree, segmentFree, type World } from '../../../core/sampling';
import { mulberry32 } from '../../../engine/rng';
import type { CheckMode } from './samplingEngine';

export type PrmConnect = 'radius' | 'k';

export interface PrmSpec {
  world: World;
  /** Number of free samples (roadmap vertices) to collect. */
  n: number;
  connect: PrmConnect;
  /** Connection radius (connect = 'radius'). */
  radius: number;
  /** Earlier vertices each new vertex tries (connect = 'k'). */
  k: number;
  check: CheckMode;
  seed: number;
}

export interface PrmStepLog {
  /** Samples that landed inside an obstacle (discarded) just before this vertex was accepted. */
  rejected: Vec2[];
  /** Earlier vertices this one tried to connect to, nearest first, and whether each edge was accepted. */
  cand: Int32Array;
  ok: Uint8Array;
}

export interface PrmQuery {
  /** Path length (Infinity when start and goal are not connected through the roadmap). */
  cost: number;
  /** Path as points start → goal (null when there is none) and as vertex ids (-1 start, -2 goal). */
  path: Vec2[] | null;
  ids: number[] | null;
  /** Path segments that cross an obstacle (only possible with end-point checking). */
  bad: boolean[];
  /** Roadmap vertices the start and the goal were joined to. */
  startLinks: number[];
  goalLinks: number[];
  /** Collision checks this query needed (only the start and goal connections). */
  checks: number;
  /** Vertices A* expanded. */
  expanded: number;
}

export class PrmRun {
  readonly spec: PrmSpec;
  private readonly next: () => number;
  private tries = 0;
  readonly px: number[] = [];
  readonly py: number[] = [];
  /** Neighbour ids and edge lengths of each vertex, in the order the edges were made. */
  readonly adj: number[][] = [];
  readonly adjW: number[][] = [];
  /** Edges in insertion order, ea < eb; ebad = 1 when the edge crosses an obstacle (end-point checking only). */
  readonly ea: number[] = [];
  readonly eb: number[] = [];
  readonly ebad: number[] = [];
  /** Log of each vertex's insertion (index = vertex id). */
  readonly log: PrmStepLog[] = [];
  /** After i vertices: edge count, cumulative collision checks and discarded samples (index 0 = empty). */
  readonly edgesAt: number[] = [0];
  readonly checksAt: number[] = [0];
  readonly rejectedAt: number[] = [0];
  /** The sampler gave up (n × 50 draws) before collecting n free samples. */
  exhausted = false;
  private checks = 0;
  private rejectedTotal = 0;

  constructor(spec: PrmSpec) {
    this.spec = spec;
    this.next = mulberry32(spec.seed);
  }

  get count(): number {
    return this.px.length;
  }

  get done(): boolean {
    return this.px.length >= this.spec.n || this.exhausted;
  }

  advance(n: number) {
    for (let k = 0; k < n && !this.done; k++) this.addOne();
  }

  /** Add vertices for about `ms` milliseconds. Returns `done`. */
  advanceFor(ms: number): boolean {
    const t0 = performance.now();
    while (!this.done) {
      for (let k = 0; k < 4 && !this.done; k++) this.addOne();
      if (performance.now() - t0 >= ms) break;
    }
    return this.done;
  }

  private free(a: Vec2, b: Vec2): boolean {
    this.checks++;
    return this.spec.check === 'edge' ? segmentFree(this.spec.world, a, b) : pointFree(this.spec.world, b);
  }

  private addOne() {
    const { world, n, connect, radius, k } = this.spec;
    const rejected: Vec2[] = [];
    let p: Vec2 | null = null;
    // Same draws as core prmBuild: keep drawing until a sample is free (one point check each).
    while (this.tries < n * 50) {
      this.tries++;
      const q = { x: this.next() * world.w, y: this.next() * world.h };
      this.checks++;
      if (pointFree(world, q)) {
        p = q;
        break;
      }
      rejected.push(q);
    }
    if (!p) {
      this.exhausted = true;
      return;
    }
    this.rejectedTotal += rejected.length;
    const i = this.px.length;
    const cands: { j: number; d: number }[] = [];
    for (let j = 0; j < i; j++) {
      const d = Math.hypot(this.px[j] - p.x, this.py[j] - p.y);
      if (connect === 'k' || d <= radius) cands.push({ j, d });
    }
    cands.sort((a, b) => a.d - b.d || a.j - b.j);
    if (connect === 'k' && cands.length > k) cands.length = Math.max(0, k);
    this.px.push(p.x);
    this.py.push(p.y);
    this.adj.push([]);
    this.adjW.push([]);
    const cand = new Int32Array(cands.length);
    const ok = new Uint8Array(cands.length);
    cands.forEach((c, m) => {
      const q = { x: this.px[c.j], y: this.py[c.j] };
      cand[m] = c.j;
      if (!this.free(q, p!)) return;
      ok[m] = 1;
      this.ea.push(c.j);
      this.eb.push(i);
      this.ebad.push(this.spec.check === 'endpoint' && !segmentFree(world, q, p!) ? 1 : 0);
      this.adj[c.j].push(i);
      this.adjW[c.j].push(c.d);
      this.adj[i].push(c.j);
      this.adjW[i].push(c.d);
    });
    this.log.push({ rejected, cand, ok });
    this.edgesAt.push(this.ea.length);
    this.checksAt.push(this.checks);
    this.rejectedAt.push(this.rejectedTotal);
  }

  /** Connected pieces of the roadmap made of the first m vertices: count and the piece of every vertex. */
  components(m: number): { count: number; of: Int32Array } {
    const M = Math.max(0, Math.min(m, this.count));
    const par = new Int32Array(M);
    for (let i = 0; i < M; i++) par[i] = i;
    const find = (a: number): number => {
      while (par[a] !== a) {
        par[a] = par[par[a]];
        a = par[a];
      }
      return a;
    };
    const E = this.edgesAt[M];
    for (let e = 0; e < E; e++) {
      const a = find(this.ea[e]);
      const b = find(this.eb[e]);
      if (a !== b) par[Math.max(a, b)] = Math.min(a, b);
    }
    const of = new Int32Array(M);
    let count = 0;
    const label = new Map<number, number>();
    for (let i = 0; i < M; i++) {
      const r = find(i);
      let l = label.get(r);
      if (l === undefined) {
        l = count++;
        label.set(r, l);
      }
      of[i] = l;
    }
    return { count, of };
  }

  /**
   * Answer one start → goal query on the roadmap made of the first m vertices, without changing it.
   * Start and goal join the roadmap with core prmQuery's rule (radius: up to 8 nearest within 1.5 r; k: the k
   * nearest), then A* with the straight-line heuristic.
   */
  query(m: number, start: Vec2, goal: Vec2): PrmQuery {
    const M = Math.max(0, Math.min(m, this.count));
    const { world, connect, radius, k, check } = this.spec;
    let checks = 0;
    const links = (p: Vec2): number[] => {
      const c: { j: number; d: number }[] = [];
      for (let j = 0; j < M; j++) {
        const d = Math.hypot(this.px[j] - p.x, this.py[j] - p.y);
        if (connect === 'k' || d <= radius * 1.5) c.push({ j, d });
      }
      c.sort((a, b) => a.d - b.d || a.j - b.j);
      const out: number[] = [];
      for (const x of c.slice(0, connect === 'k' ? k : 8)) {
        checks++;
        const q = { x: this.px[x.j], y: this.py[x.j] };
        if (check === 'edge' ? segmentFree(world, p, q) : pointFree(world, q)) out.push(x.j);
      }
      return out;
    };
    const startLinks = links(start);
    const goalLinks = links(goal);
    const S = M;
    const G = M + 1;
    const N = M + 2;
    const pos = (i: number): Vec2 => (i === S ? start : i === G ? goal : { x: this.px[i], y: this.py[i] });
    const isGoalLink = new Uint8Array(N);
    for (const j of goalLinks) isGoalLink[j] = 1;
    const gScore = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const h = (i: number) => Math.hypot(pos(i).x - goal.x, pos(i).y - goal.y);
    gScore[S] = 0;
    heap.push(S, h(S));
    let expanded = 0;
    const relax = (u: number, v: number, w: number) => {
      if (closed[v]) return;
      const g = gScore[u] + w;
      if (g < gScore[v] - 1e-12) {
        gScore[v] = g;
        prev[v] = u;
        heap.push(v, g + h(v));
      }
    };
    while (heap.size) {
      const u = heap.pop();
      if (closed[u]) continue;
      closed[u] = 1;
      expanded++;
      if (u === G) break;
      if (u === S) {
        for (const j of startLinks) relax(S, j, dist(start, pos(j)));
        continue;
      }
      const nb = this.adj[u];
      const nw = this.adjW[u];
      for (let t = 0; t < nb.length; t++) if (nb[t] < M) relax(u, nb[t], nw[t]);
      if (isGoalLink[u]) relax(u, G, dist(pos(u), goal));
    }
    const cost = gScore[G];
    let ids: number[] | null = null;
    let path: Vec2[] | null = null;
    const bad: boolean[] = [];
    if (Number.isFinite(cost)) {
      ids = [];
      for (let q = G; q >= 0; q = prev[q]) ids.unshift(q === S ? -1 : q === G ? -2 : q);
      path = ids.map((q) => (q === -1 ? { ...start } : q === -2 ? { ...goal } : { x: this.px[q], y: this.py[q] }));
      for (let s = 1; s < path.length; s++) bad.push(check === 'endpoint' && !segmentFree(world, path[s - 1], path[s]));
    }
    return { cost, path, ids, bad, startLinks, goalLinks, checks, expanded };
  }
}

/** Path cost of the query after each number of vertices 0 … n, filled in a few milliseconds at a time. */
export class PrmCurve {
  readonly cost: Float64Array;
  filled = 0;
  constructor(
    readonly run: PrmRun,
    readonly start: Vec2,
    readonly goal: Vec2
  ) {
    this.cost = new Float64Array(run.spec.n + 1).fill(NaN);
  }
  /** Fill entries up to the vertices built so far, for about `ms` milliseconds. Returns true when complete. */
  advanceFor(ms: number): boolean {
    const t0 = performance.now();
    const upto = Math.min(this.run.count, this.cost.length - 1);
    while (this.filled <= upto) {
      const c = this.run.query(this.filled, this.start, this.goal).cost;
      this.cost[this.filled] = Number.isFinite(c) ? c : NaN;
      this.filled++;
      if (performance.now() - t0 >= ms) break;
    }
    return this.run.done && this.filled > this.run.count;
  }
}

/** Binary min-heap of (id, key) pairs; duplicates allowed (stale entries are skipped by the caller). */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}
