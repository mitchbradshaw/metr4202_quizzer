// Pure helpers for the dynamic-window simulation (no React): presets, evaluation of the (v, ω) samples in the
// dynamic window, admissibility, one control cycle, and a whole run for the self-tests.
//
// Fox, Burgard & Thrun (1997): search space V_r = V_s ∩ V_d ∩ V_a, where V_s = [0, v_max] × [−ω_max, ω_max],
// V_d is what the accelerations can reach within one control period Δt (core dynamicWindow), and V_a holds the
// velocities that can still stop before the nearest obstacle on their arc: v²/(2 v̇_max) ≤ dist(v, ω).
// The objective is G = w_h·heading + w_c·dist + w_v·velocity, each term scaled to [0, 1]:
//   heading  = 1 − |angle from the robot's heading at the end of the arc to the goal| / π
//   dist     = free distance along the arc's curvature before the nearest obstacle, divided by a cap
//   velocity = v / v_max.
// core/local.ts dwa() scores the minimum clearance instead (which makes standing still the best choice in
// front of any obstacle) and only rejects arcs that collide within the horizon; this file follows Fox et al.
// It also holds the command for Δt before braking can start, so admissibility asks for v²/(2v̇) + vΔt/2 + 2 cm
// (the exact braking distance with piecewise-constant commands), and it treats a predicted collision with a
// moving obstacle inside the horizon as a velocity obstacle.
import { type Shape, type Vec2, distToShape } from '../../../core/geom2d';
import { dynamicWindow, type DwaParams } from '../../../core/local';
import { velocityMotion, wrapAngle, type Pose } from '../../../core/motion';
import { cumLength, gridPlan, pointAtS, projectOnPath } from './localGlobal';

export const DWA_W = 10;
export const DWA_H = 7;

export interface DwaCfg {
  /** Velocity limits (the box V_s). */
  vMax: number;
  wMax: number;
  /** Acceleration limits v̇_max (also the braking deceleration) and ω̇_max. */
  aMax: number;
  alphaMax: number;
  /** Control period Δt. */
  dt: number;
  /** Forward-simulation time T of each candidate arc (heading is judged at its end; moving obstacles within it). */
  horizon: number;
  /** Samples per axis of the window. */
  nv: number;
  nw: number;
  radius: number;
  /** Weights of the objective G = w_h·heading + w_c·dist + w_v·velocity. */
  wHeading: number;
  wClear: number;
  wVel: number;
  /** Free distance (m) at which the dist sub-score saturates at 1. */
  clearCap: number;
  /** Safety margin (m): an arc "hits" when the robot's edge comes closer than this to an obstacle. */
  safety: number;
}

export const DWA_DEFAULT: DwaCfg = {
  vMax: 1,
  wMax: 2,
  aMax: 1,
  alphaMax: 4,
  dt: 0.25,
  horizon: 1,
  nv: 7,
  nw: 13,
  radius: 0.25,
  wHeading: 0.6,
  wClear: 0.3,
  wVel: 0.3,
  clearCap: 2,
  safety: 0.1,
};

/** A pedestrian walking back and forth between a and b. */
export interface Mover {
  a: Vec2;
  b: Vec2;
  speed: number;
  r: number;
}

export interface DwaWorld {
  obstacles: Shape[];
  movers: Mover[];
}

export interface DwaPreset {
  id: string;
  label: string;
  start: Pose;
  goal: Vec2;
  world: DwaWorld;
  cfg?: Partial<DwaCfg>;
}

const rect = (x: number, y: number, w: number, h: number): Shape => ({ kind: 'rect', x, y, w, h });
const circ = (x: number, y: number, r: number): Shape => ({ kind: 'circle', x, y, r });

export const DWA_PRESETS: DwaPreset[] = [
  { id: 'open', label: 'Obstacle ahead', start: { x: 1, y: 3.5, theta: 0 }, goal: { x: 9, y: 3.6 }, world: { obstacles: [circ(4.6, 3.3, 0.6), circ(7.2, 4.4, 0.5)], movers: [] } },
  { id: 'gap', label: 'Doorway', start: { x: 1, y: 1.4, theta: 0 }, goal: { x: 8.6, y: 5.4 }, world: { obstacles: [rect(5, 0, 0.3, 2.9), rect(5, 4.1, 0.3, 2.9)], movers: [] } },
  {
    id: 'trap',
    label: 'U-trap',
    start: { x: 1, y: 3.5, theta: 0 },
    goal: { x: 8.8, y: 3.5 },
    world: { obstacles: [rect(6, 1.8, 0.3, 3.4), rect(4, 1.8, 2.3, 0.3), rect(4, 4.9, 2.3, 0.3)], movers: [] },
  },
  {
    id: 'cross',
    label: 'Crossing pedestrian',
    start: { x: 1, y: 3.5, theta: 0 },
    goal: { x: 9, y: 3.5 },
    world: { obstacles: [], movers: [{ a: { x: 5, y: 6.3 }, b: { x: 5, y: 0.7 }, speed: 0.7, r: 0.3 }] },
  },
];

export function dwaPresetById(id: string): DwaPreset {
  return DWA_PRESETS.find((p) => p.id === id) ?? DWA_PRESETS[0];
}

/** Position and velocity of a mover at time t (ping-pong along a → b → a …). */
export function moverState(m: Mover, t: number): { p: Vec2; v: Vec2 } {
  const L = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) || 1e-9;
  const ux = (m.b.x - m.a.x) / L;
  const uy = (m.b.y - m.a.y) / L;
  let s = (m.speed * Math.max(0, t)) % (2 * L);
  let dir = 1;
  if (s > L) {
    s = 2 * L - s;
    dir = -1;
  }
  return { p: { x: m.a.x + ux * s, y: m.a.y + uy * s }, v: { x: dir * m.speed * ux, y: dir * m.speed * uy } };
}

/** Constant-velocity prediction of a mover from its state now (what the robot can know: position and velocity). */
interface MoverPred {
  p: Vec2;
  v: Vec2;
  r: number;
}

function predictMovers(world: DwaWorld, t0: number): MoverPred[] {
  return world.movers.map((m) => {
    const s = moverState(m, t0);
    return { p: s.p, v: s.v, r: m.r };
  });
}

/** Distance from the robot's edge (centre p) to the nearest static obstacle or the boundary wall. */
export function staticClearance(p: Vec2, world: DwaWorld, radius: number): number {
  let d = Math.min(p.x, p.y, DWA_W - p.x, DWA_H - p.y) - radius;
  for (const o of world.obstacles) d = Math.min(d, distToShape(p, o) - radius);
  return d;
}

export type CandReason = 'ok' | 'stop' | 'moving' | 'contact';

export interface Cand {
  v: number;
  w: number;
  /** The arc over the horizon, for drawing. */
  traj: Pose[];
  /** dist(v, ω): free distance along the arc's curvature before the robot's edge touches a static obstacle (Infinity: none within the look-ahead). */
  hitDist: number;
  /** Braking distance v²/(2 v̇_max). */
  stopDist: number;
  /** What admissibility asks for: stopDist + vΔt/2 + 2 cm (the command is held for Δt before braking starts). */
  needDist: number;
  admissible: boolean;
  reason: CandReason;
  sHeading: number;
  sClear: number;
  sVel: number;
  score: number;
}

type Arc = Omit<Cand, 'sHeading' | 'sClear' | 'sVel' | 'score'>;

const DS = 0.05;
const DTH = 0.12;
const MARGIN = 0.02;
export const GOAL_RADIUS = 0.3;

/** Simulate one constant-(v, ω) arc and decide admissibility (no scores yet). */
function simulateArc(world: DwaWorld, preds: MoverPred[], pose: Pose, v: number, w: number, cfg: DwaCfg): Arc {
  const stopDist = (v * v) / (2 * cfg.aMax);
  const needDist = stopDist + (v * cfg.dt) / 2 + MARGIN;
  const T = cfg.horizon;
  const n = Math.max(10, Math.ceil((v * T) / DS), Math.ceil((Math.abs(w) * T) / DTH));
  const traj: Pose[] = [pose];
  const c0 = staticClearance(pose, world, cfg.radius);
  let moving = false;
  for (let k = 1; k <= n; k++) {
    const t = (T * k) / n;
    const q = velocityMotion(pose, v, w, t);
    traj.push(q);
    for (const m of preds) if (Math.hypot(q.x - (m.p.x + m.v.x * t), q.y - (m.p.y + m.v.y * t)) <= cfg.radius + m.r + cfg.safety) moving = true;
  }
  // dist(v, ω): walk along the curvature κ = ω/v (unit speed) until the robot's edge touches something.
  // Inside the safety margin already (e.g. dragged there): any arc that gets closer than now counts as a hit.
  const thr = c0 > cfg.safety ? cfg.safety : Math.max(0, c0 - 0.005);
  let hitDist = c0 <= 0 ? 0 : Infinity;
  if (c0 > 0 && v > 1e-9) {
    const kappa = w / v;
    const look = Math.max(cfg.clearCap, needDist + 0.1);
    const m = Math.ceil(look / DS);
    for (let k = 1; k <= m; k++) {
      const s = (look * k) / m;
      if (staticClearance(velocityMotion(pose, 1, kappa, s), world, cfg.radius) <= thr) {
        hitDist = Math.max(0, s - look / m);
        break;
      }
    }
  }
  let reason: CandReason = 'ok';
  if (c0 <= 0) reason = 'contact';
  else if (needDist > hitDist) reason = 'stop';
  else if (moving) reason = 'moving';
  return { v, w, traj, hitDist, stopDist, needDist, admissible: reason === 'ok', reason };
}

function scoreArc(c: Arc, target: Vec2, cfg: DwaCfg): Cand {
  const end = c.traj[c.traj.length - 1];
  // An arc that passes through the goal region has perfect heading (it gets there).
  let through = false;
  for (const q of c.traj) if (Math.hypot(q.x - target.x, q.y - target.y) <= GOAL_RADIUS) through = true;
  const err = through ? 0 : Math.abs(wrapAngle(Math.atan2(target.y - end.y, target.x - end.x) - end.theta));
  const sHeading = 1 - err / Math.PI;
  const sClear = Number.isFinite(c.hitDist) ? Math.max(0, Math.min(1, c.hitDist / cfg.clearCap)) : 1;
  const sVel = cfg.vMax > 0 ? c.v / cfg.vMax : 0;
  return { ...c, sHeading, sClear, sVel, score: cfg.wHeading * sHeading + cfg.wClear * sClear + cfg.wVel * sVel };
}

export function windowOf(v: number, w: number, cfg: DwaCfg): { v0: number; v1: number; w0: number; w1: number } {
  const p: DwaParams = {
    vMax: cfg.vMax,
    wMax: cfg.wMax,
    aMax: cfg.aMax,
    alphaMax: cfg.alphaMax,
    dt: cfg.dt,
    horizon: cfg.horizon,
    nv: cfg.nv,
    nw: cfg.nw,
    radius: cfg.radius,
    heading: cfg.wHeading,
    clearance: cfg.wClear,
    velocity: cfg.wVel,
  };
  return dynamicWindow(v, w, p);
}

export interface DwaEval {
  window: { v0: number; v1: number; w0: number; w1: number };
  cands: Cand[];
  /** Highest-scoring admissible candidate (null: none, so the robot brakes). */
  best: Cand | null;
  /** The point the heading term aims at (the goal, or the carrot on the global plan). */
  target: Vec2;
}

/** Score every sample of the dynamic window around the current (v, ω). Ties go to the faster, straighter sample. */
export function evaluate(world: DwaWorld, pose: Pose, v: number, w: number, target: Vec2, cfg: DwaCfg, t0 = 0): DwaEval {
  const win = windowOf(v, w, cfg);
  const preds = predictMovers(world, t0);
  const cands: Cand[] = [];
  for (let i = 0; i < cfg.nv; i++) {
    const cv = cfg.nv === 1 ? win.v1 : win.v0 + ((win.v1 - win.v0) * i) / (cfg.nv - 1);
    for (let j = 0; j < cfg.nw; j++) {
      const cw = cfg.nw === 1 ? 0 : win.w0 + ((win.w1 - win.w0) * j) / (cfg.nw - 1);
      cands.push(scoreArc(simulateArc(world, preds, pose, cv, cw, cfg), target, cfg));
    }
  }
  let best: Cand | null = null;
  for (const c of cands) {
    if (!c.admissible) continue;
    if (!best || c.score > best.score + 1e-9 || (Math.abs(c.score - best.score) <= 1e-9 && (c.v > best.v + 1e-9 || (Math.abs(c.v - best.v) <= 1e-9 && Math.abs(c.w) < Math.abs(best.w)))))
      best = c;
  }
  return { window: win, cands, best, target };
}

/**
 * Admissibility over the whole box V_s on an nV × nW grid (row 0 = lowest v, column 0 = −ω_max):
 * 0 admissible, 1 cannot stop before a static obstacle, 2 collides with a moving obstacle within the horizon.
 */
export function velocityMap(world: DwaWorld, pose: Pose, cfg: DwaCfg, nV: number, nW: number, t0 = 0): Uint8Array {
  const out = new Uint8Array(nV * nW);
  const preds = predictMovers(world, t0);
  for (let i = 0; i < nV; i++) {
    const v = ((i + 0.5) / nV) * cfg.vMax;
    for (let j = 0; j < nW; j++) {
      const w = -cfg.wMax + ((j + 0.5) / nW) * 2 * cfg.wMax;
      const c = simulateArc(world, preds, pose, v, w, cfg);
      out[i * nW + j] = c.reason === 'ok' ? 0 : c.reason === 'moving' ? 2 : 1;
    }
  }
  return out;
}

// ------------------------------------------------------------------ running it

export type DwaStatus = 'running' | 'goal' | 'stuck' | 'collision';

export interface DwaState {
  pose: Pose;
  v: number;
  w: number;
  t: number;
  status: DwaStatus;
  /** Closest approach to the goal so far, and when it happened (for "stuck" detection). */
  bestD: number;
  bestT: number;
  /** True when no admissible velocity existed this cycle and the robot braked. */
  braking: boolean;
  /** Arc length along the global plan already passed (carrot following). */
  planS: number;
}

const STUCK_AFTER = 8;

export function initState(start: Pose, goal: Vec2): DwaState {
  return { pose: { ...start }, v: 0, w: 0, t: 0, status: 'running', bestD: Math.hypot(goal.x - start.x, goal.y - start.y), bestT: 0, braking: false, planS: 0 };
}

export interface PlanFollow {
  pts: Vec2[];
  cum: number[];
  /** Look-ahead distance of the carrot (m). */
  look: number;
}

/** A global plan on the known static obstacles, grown by the robot radius plus a margin. */
export function dwaPlan(world: DwaWorld, start: Vec2, goal: Vec2, cfg: DwaCfg): PlanFollow | null {
  const pts = gridPlan(world.obstacles, start, goal, { w: DWA_W, h: DWA_H, cell: 0.2, inflate: cfg.radius + 0.25 });
  return pts ? { pts, cum: cumLength(pts), look: 1.2 } : null;
}

/** The point the heading term should aim at this cycle. */
export function headingTarget(s: DwaState, goal: Vec2, plan: PlanFollow | null): { target: Vec2; planS: number } {
  if (!plan) return { target: goal, planS: 0 };
  const sp = projectOnPath(plan.pts, plan.cum, s.pose, s.planS);
  const L = plan.cum[plan.cum.length - 1];
  return { target: sp + plan.look >= L ? goal : pointAtS(plan.pts, plan.cum, sp + plan.look), planS: sp };
}

/** One control cycle: evaluate the window, execute the best admissible (v, ω) (or brake) for Δt. */
export function dwaStep(s: DwaState, world: DwaWorld, goal: Vec2, cfg: DwaCfg, plan: PlanFollow | null = null): { next: DwaState; ev: DwaEval } {
  const { target, planS } = headingTarget(s, goal, plan);
  const ev = evaluate(world, s.pose, s.v, s.w, target, cfg, s.t);
  if (s.status !== 'running') return { next: s, ev };
  const win = ev.window;
  const v = ev.best ? ev.best.v : win.v0;
  const w = ev.best ? ev.best.w : Math.max(win.w0, Math.min(win.w1, 0));
  const pose = velocityMotion(s.pose, v, w, cfg.dt);
  const t = s.t + cfg.dt;
  let status: DwaStatus = 'running';
  const d = Math.hypot(goal.x - pose.x, goal.y - pose.y);
  let collided = staticClearance(pose, world, cfg.radius) <= 0;
  for (const m of world.movers) {
    const q = moverState(m, t).p;
    if (Math.hypot(pose.x - q.x, pose.y - q.y) <= cfg.radius + m.r) collided = true;
  }
  let { bestD, bestT } = s;
  if (d < bestD - 0.05) {
    bestD = d;
    bestT = t;
  }
  if (collided) status = 'collision';
  else if (d <= GOAL_RADIUS) status = 'goal';
  else if (t - bestT > STUCK_AFTER) status = 'stuck';
  const done = status === 'goal' || status === 'collision';
  return { next: { pose, v: done ? 0 : v, w: done ? 0 : w, t, status, bestD, bestT, braking: !ev.best, planS }, ev };
}

/** Run DWA from a preset until it stops or maxT seconds pass (self-tests). */
export function runDwa(world: DwaWorld, start: Pose, goal: Vec2, cfg: DwaCfg, maxT = 60, usePlan = false): { state: DwaState; poses: Pose[]; minClear: number } {
  const plan = usePlan ? dwaPlan(world, start, goal, cfg) : null;
  let s = initState(start, goal);
  const poses: Pose[] = [s.pose];
  let minClear = Infinity;
  while (s.status === 'running' && s.t < maxT) {
    s = dwaStep(s, world, goal, cfg, plan).next;
    poses.push(s.pose);
    minClear = Math.min(minClear, staticClearance(s.pose, world, cfg.radius));
  }
  return { state: s, poses, minClear };
}
