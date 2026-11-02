// Pure helpers for the potential-field simulation (no React): presets, the descent with optional escape
// strategies (random walks, or a global grid plan followed through a moving sub-goal), the sampled field for
// the heat map, 1-D profiles of U and the "trap basin" map. Built on core/local.ts (potential, force, descend).
import { distToShape, pointInShape, segHitsShape, type Shape, type Vec2 } from '../../../core/geom2d';
import { attractive, descend, force, potential, type DescentStatus, type FieldParams } from '../../../core/local';
import { mulberry32 } from '../../../engine/rng';
import { cumLength, gridPlan, pointAtS, projectOnPath } from './localGlobal';

/** The world is FIELD_SIZE × FIELD_SIZE metres, x to the right and y up. */
export const FIELD_SIZE = 10;
/** Normalised gradient-descent step (m). */
export const FIELD_STEP = 0.05;
export const FIELD_GOAL_TOL = 0.1;
export const FIELD_MAX_ITER = 4000;

export interface FieldScene {
  start: Vec2;
  goal: Vec2;
  obstacles: Shape[];
}

export type EscapeMode = 'none' | 'walk' | 'global';

export const DEFAULT_FIELD: FieldParams = { kAtt: 1, kRep: 1, d0: 1.2, dStar: 2 };

export interface FieldPreset {
  id: string;
  label: string;
  scene: FieldScene;
  /** Gains this preset starts with (the rest come from DEFAULT_FIELD). */
  params: Partial<FieldParams>;
}

const rect = (x: number, y: number, w: number, h: number): Shape => ({ kind: 'rect', x, y, w, h });
const circ = (x: number, y: number, r: number): Shape => ({ kind: 'circle', x, y, r });

export const FIELD_PRESETS: FieldPreset[] = [
  { id: 'open', label: 'Open field', scene: { start: { x: 1.5, y: 2 }, goal: { x: 8.5, y: 8 }, obstacles: [] }, params: {} },
  { id: 'single', label: 'One obstacle', scene: { start: { x: 1.5, y: 4.2 }, goal: { x: 8.5, y: 5.2 }, obstacles: [circ(5, 5, 1)] }, params: {} },
  {
    id: 'trap',
    label: 'U-shaped trap',
    scene: { start: { x: 1.5, y: 5.3 }, goal: { x: 8.8, y: 5 }, obstacles: [rect(6, 3, 0.4, 4), rect(4, 3, 2.4, 0.4), rect(4, 6.6, 2.4, 0.4)] },
    params: {},
  },
  {
    id: 'gap',
    label: 'Narrow gap',
    scene: { start: { x: 1.5, y: 5 }, goal: { x: 8.5, y: 5 }, obstacles: [circ(5, 3.6, 0.9), circ(5, 6.4, 0.9)] },
    params: { d0: 0.6 },
  },
  { id: 'near', label: 'Goal by a wall', scene: { start: { x: 1.5, y: 4 }, goal: { x: 7.2, y: 5 }, obstacles: [rect(7.6, 2.5, 0.8, 5)] }, params: { d0: 1.5 } },
];

export function presetById(id: string): FieldPreset {
  return FIELD_PRESETS.find((p) => p.id === id) ?? FIELD_PRESETS[0];
}

export function insideAny(p: Vec2, obstacles: readonly Shape[]): boolean {
  return obstacles.some((o) => pointInShape(p, o));
}

export interface FieldRun {
  /** Every point the robot visits, FIELD_STEP apart along descent segments. */
  path: Vec2[];
  status: DescentStatus;
  /** Index ranges [from, to] of random-walk segments in `path`. */
  walks: [number, number][];
  /** Where plain descent first stalled (null if it never did). */
  firstStuck: Vec2 | null;
  /** The global plan's waypoints (mode 'global'; null if none or no route). */
  plan: Vec2[] | null;
}

const WALK_STEPS = 140;
const WALK_STEP = 0.3;
const MAX_WALKS = 12;
const CARROT = 1.2;

/** Gradient descent from scene.start, with the chosen escape strategy. Deterministic for a given seed. */
export function runField(scene: FieldScene, f: FieldParams, mode: EscapeMode, seed = 1): FieldRun {
  const { start, goal, obstacles } = scene;
  const o = { step: FIELD_STEP, goalTol: FIELD_GOAL_TOL, maxIter: FIELD_MAX_ITER };
  if (insideAny(start, obstacles)) return { path: [{ ...start }], status: 'collision', walks: [], firstStuck: null, plan: null };
  if (mode === 'global') {
    const plan = gridPlan(obstacles, start, goal, { w: FIELD_SIZE, h: FIELD_SIZE, cell: 0.25, inflate: 0.45 });
    if (plan) {
      const r = followPlan(scene, f, plan);
      return { ...r, walks: [], firstStuck: null, plan };
    }
  }
  const first = descend(start, goal, obstacles, f, o);
  const path = first.path.slice();
  let status = first.status;
  if (status === 'local-min') settleEnd(path, scene, f);
  const firstStuck = status === 'local-min' ? { ...path[path.length - 1] } : null;
  const walks: [number, number][] = [];
  if (mode === 'walk') {
    const rnd = mulberry32(seed);
    for (let e = 0; e < MAX_WALKS && status === 'local-min'; e++) {
      const from = path.length - 1;
      let p = path[from];
      for (let k = 0; k < WALK_STEPS; k++) {
        for (let tries = 0; tries < 12; tries++) {
          const a = rnd() * 2 * Math.PI;
          const q = { x: p.x + WALK_STEP * Math.cos(a), y: p.y + WALK_STEP * Math.sin(a) };
          if (q.x < 0.05 || q.y < 0.05 || q.x > FIELD_SIZE - 0.05 || q.y > FIELD_SIZE - 0.05) continue;
          if (obstacles.some((s) => segHitsShape(p, q, s))) continue;
          p = q;
          path.push(q);
          break;
        }
      }
      walks.push([from, path.length - 1]);
      const res = descend(p, goal, obstacles, f, { ...o, maxIter: Math.max(200, FIELD_MAX_ITER - path.length) });
      for (let k = 1; k < res.path.length; k++) path.push(res.path[k]);
      status = res.status;
      if (status === 'local-min') settleEnd(path, scene, f);
    }
  }
  return { path, status, walks, firstStuck, plan: null };
}

/**
 * The fixed 5 cm steps stall by jittering up to one step either side of the balance point, where the pull and the
 * push do not quite cancel yet. Settle there with shrinking steps that must each lower U, so the reported stop is
 * where F_att + F_rep ≈ 0 (|∇U| drops from ~0.3 to ~0.002 in the U-trap). Never climbs, never enters an obstacle.
 */
export function settle(p: Vec2, goal: Vec2, obstacles: readonly Shape[], f: FieldParams): Vec2 {
  let q = { ...p };
  let u = potential(q, goal, obstacles, f);
  for (const st of [0.025, 0.012, 0.006, 0.003, 0.0015, 0.0008, 0.0004]) {
    for (let i = 0; i < 60; i++) {
      const F = force(q, goal, obstacles, f);
      const m = Math.hypot(F.x, F.y);
      if (m < 1e-9) return q;
      const nq = { x: q.x + (st * F.x) / m, y: q.y + (st * F.y) / m };
      const un = potential(nq, goal, obstacles, f);
      if (!(un < u)) break;
      q = nq;
      u = un;
    }
  }
  return q;
}

/** Append the settled stall point to a path that ended in a local minimum. */
function settleEnd(path: Vec2[], scene: FieldScene, f: FieldParams): void {
  const end = path[path.length - 1];
  const q = settle(end, scene.goal, scene.obstacles, f);
  if (Math.hypot(q.x - end.x, q.y - end.y) > 1e-4) path.push(q);
}

/**
 * Hierarchical planning: the local field is attracted to a sub-goal CARROT metres ahead of the robot's
 * projection on the global plan (the final goal once the carrot reaches it). Same normalised steps and
 * stall detection as core descend().
 */
function followPlan(scene: FieldScene, f: FieldParams, plan: Vec2[]): { path: Vec2[]; status: DescentStatus } {
  const { goal, obstacles } = scene;
  const cum = cumLength(plan);
  const L = cum[cum.length - 1];
  let p = { ...scene.start };
  const path: Vec2[] = [{ ...p }];
  let s = 0;
  let stuck = 0;
  for (let i = 0; i < FIELD_MAX_ITER; i++) {
    if (Math.hypot(p.x - goal.x, p.y - goal.y) <= FIELD_GOAL_TOL) return { path, status: 'goal' };
    s = projectOnPath(plan, cum, p, s);
    const target = s + CARROT >= L ? goal : pointAtS(plan, cum, s + CARROT);
    const F = force(p, target, obstacles, f);
    const m = Math.hypot(F.x, F.y);
    if (m < 1e-6) return { path, status: 'local-min' };
    const np = { x: p.x + (FIELD_STEP * F.x) / m, y: p.y + (FIELD_STEP * F.y) / m };
    if (obstacles.some((ob) => distToShape(np, ob) <= 1e-6)) return { path, status: 'collision' };
    const back = path.length > 8 ? path[path.length - 8] : null;
    if (back && Math.hypot(np.x - back.x, np.y - back.y) < FIELD_STEP * 1.5) {
      if (++stuck > 6) return { path, status: 'local-min' };
    } else stuck = 0;
    p = np;
    path.push(p);
  }
  return { path, status: 'max-iter' };
}

// ------------------------------------------------------------------ sampled field and profiles

/**
 * U at the centres of an n × n grid over the world, row-major with row 0 at the TOP (y = FIELD_SIZE),
 * ready for ImageData. Infinity inside obstacles.
 */
export function sampleField(goal: Vec2, obstacles: readonly Shape[], f: FieldParams, n: number, out?: Float32Array): Float32Array {
  const U = out && out.length === n * n ? out : new Float32Array(n * n);
  const h = FIELD_SIZE / n;
  const p = { x: 0, y: 0 };
  for (let r = 0; r < n; r++) {
    p.y = FIELD_SIZE - (r + 0.5) * h;
    for (let c = 0; c < n; c++) {
      p.x = (c + 0.5) * h;
      U[r * n + c] = potential(p, goal, obstacles, f);
    }
  }
  return U;
}

/** The rim of the attractive bowl: U_att at the world corner farthest from the goal (the colour-scale reference). */
export function bowlRim(goal: Vec2, f: FieldParams): number {
  let u = 0;
  for (const [x, y] of [
    [0, 0],
    [FIELD_SIZE, 0],
    [0, FIELD_SIZE],
    [FIELD_SIZE, FIELD_SIZE],
  ])
    u = Math.max(u, attractive({ x, y }, goal, f));
  return Math.max(u, 1e-6);
}

export interface Profile {
  /** Distance along the slice (m). */
  s: number[];
  U: number[];
  Uatt: number[];
  /** [s0, s1] ranges of the slice inside obstacles. */
  inside: [number, number][];
}

/** U along the straight segment start → goal. */
export function lineProfile(scene: FieldScene, f: FieldParams, n = 240): Profile {
  const { start: a, goal: b, obstacles } = scene;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const out: Profile = { s: [], U: [], Uatt: [], inside: [] };
  let open = -1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const s = L * t;
    const u = potential(p, b, obstacles, f);
    out.s.push(s);
    out.U.push(u);
    out.Uatt.push(attractive(p, b, f));
    const ins = insideAny(p, obstacles);
    if (ins && open < 0) open = s;
    if (!ins && open >= 0) {
      out.inside.push([open, s]);
      open = -1;
    }
  }
  if (open >= 0) out.inside.push([open, L]);
  return out;
}

/** U along the robot's own path, against distance travelled. */
export function pathProfile(path: readonly Vec2[], scene: FieldScene, f: FieldParams, maxPts = 400): Profile {
  const out: Profile = { s: [], U: [], Uatt: [], inside: [] };
  const stride = Math.max(1, Math.ceil(path.length / maxPts));
  let s = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) s += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (i % stride !== 0 && i !== path.length - 1) continue;
    out.s.push(s);
    out.U.push(potential(path[i], scene.goal, scene.obstacles, f));
    out.Uatt.push(attractive(path[i], scene.goal, f));
  }
  return out;
}

/** Total path length (m). */
export function pathLength(path: readonly Vec2[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return s;
}

/** −∇U split into its attractive and repulsive parts at p. */
export function forceParts(p: Vec2, goal: Vec2, obstacles: readonly Shape[], f: FieldParams): { att: Vec2; rep: Vec2; tot: Vec2 } {
  const att = force(p, goal, [], f);
  const tot = force(p, goal, obstacles, f);
  return { att, rep: { x: tot.x - att.x, y: tot.y - att.y }, tot };
}

/**
 * One row of the trap-basin map: where plain gradient descent from each cell centre ends up.
 * 0 = reaches the goal, 1 = local minimum, 2 = collision / no convergence, 3 = inside an obstacle.
 * Row 0 is the top of the world. Coarser steps than the robot's own run (it is only a map).
 */
export function basinRow(scene: FieldScene, f: FieldParams, n: number, r: number, out: Uint8Array): void {
  const h = FIELD_SIZE / n;
  const y = FIELD_SIZE - (r + 0.5) * h;
  for (let c = 0; c < n; c++) {
    const p = { x: (c + 0.5) * h, y };
    if (insideAny(p, scene.obstacles)) {
      out[r * n + c] = 3;
      continue;
    }
    const res = descend(p, scene.goal, scene.obstacles, f, { step: 0.1, maxIter: 320, goalTol: 0.2 });
    out[r * n + c] = res.status === 'goal' ? 0 : res.status === 'local-min' ? 1 : 2;
  }
}
