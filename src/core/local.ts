// Local (reactive) planners (summary notes §5): artificial potential fields and the dynamic window approach.
import { type Shape, type Vec2, closestPointOnShape, distToShape } from './geom2d';
import { type Pose, velocityMotion } from './motion';

// ------------------------------------------------------------------ potential fields

export interface FieldParams {
  /** Attractive gain ζ. */
  kAtt: number;
  /** Repulsive gain η. */
  kRep: number;
  /** Obstacle influence distance Q* (no repulsion beyond it). */
  d0: number;
  /** Switch from quadratic to conic attraction beyond this distance d*. */
  dStar: number;
}

/** U_att: ½ζd² within d*, then ζd*·d − ½ζd*² (conic) so the pull stays bounded far away. */
export function attractive(p: Vec2, goal: Vec2, f: FieldParams): number {
  const d = Math.hypot(p.x - goal.x, p.y - goal.y);
  return d <= f.dStar ? 0.5 * f.kAtt * d * d : f.dStar * f.kAtt * d - 0.5 * f.kAtt * f.dStar * f.dStar;
}

/** U_rep = Σ ½η(1/d − 1/Q*)² for each obstacle closer than Q* (∞ inside an obstacle). */
export function repulsive(p: Vec2, obstacles: readonly Shape[], f: FieldParams): number {
  let u = 0;
  for (const o of obstacles) {
    const d = distToShape(p, o);
    if (d <= 1e-6) return Infinity;
    if (d < f.d0) u += 0.5 * f.kRep * (1 / d - 1 / f.d0) ** 2;
  }
  return u;
}

export function potential(p: Vec2, goal: Vec2, obstacles: readonly Shape[], f: FieldParams): number {
  return attractive(p, goal, f) + repulsive(p, obstacles, f);
}

/** −∇U: the force the robot follows (analytic for each term). */
export function force(p: Vec2, goal: Vec2, obstacles: readonly Shape[], f: FieldParams): Vec2 {
  const dx = p.x - goal.x;
  const dy = p.y - goal.y;
  const d = Math.hypot(dx, dy);
  let fx = 0;
  let fy = 0;
  if (d > 1e-12) {
    const s = d <= f.dStar ? f.kAtt : (f.kAtt * f.dStar) / d;
    fx -= s * dx;
    fy -= s * dy;
  }
  for (const o of obstacles) {
    const q = closestPointOnShape(p, o);
    const rx = p.x - q.x;
    const ry = p.y - q.y;
    const r = Math.hypot(rx, ry);
    if (r < 1e-6 || r >= f.d0) continue;
    const mag = f.kRep * (1 / r - 1 / f.d0) / (r * r);
    fx += (mag * rx) / r;
    fy += (mag * ry) / r;
  }
  return { x: fx, y: fy };
}

export type DescentStatus = 'goal' | 'local-min' | 'collision' | 'max-iter';

/** Normalised gradient descent: step a fixed distance along the force until the goal or a local minimum. */
export function descend(start: Vec2, goal: Vec2, obstacles: readonly Shape[], f: FieldParams, o: { step: number; maxIter: number; goalTol: number }): { path: Vec2[]; status: DescentStatus } {
  const path: Vec2[] = [{ ...start }];
  let p = { ...start };
  let stuck = 0;
  for (let i = 0; i < o.maxIter; i++) {
    if (Math.hypot(p.x - goal.x, p.y - goal.y) <= o.goalTol) return { path, status: 'goal' };
    const F = force(p, goal, obstacles, f);
    const m = Math.hypot(F.x, F.y);
    if (m < 1e-6) return { path, status: 'local-min' };
    const np = { x: p.x + (o.step * F.x) / m, y: p.y + (o.step * F.y) / m };
    if (obstacles.some((ob) => distToShape(np, ob) <= 1e-6)) return { path, status: 'collision' };
    // Oscillating in place (the classic trap in front of a U-shaped obstacle) counts as a local minimum.
    const back = path.length > 8 ? path[path.length - 8] : null;
    if (back && Math.hypot(np.x - back.x, np.y - back.y) < o.step * 1.5) {
      if (++stuck > 6) return { path, status: 'local-min' };
    } else stuck = 0;
    p = np;
    path.push(p);
  }
  return { path, status: 'max-iter' };
}

// ------------------------------------------------------------------ dynamic window approach

export interface DwaParams {
  vMax: number;
  wMax: number;
  /** Translational / rotational acceleration limits. */
  aMax: number;
  alphaMax: number;
  /** Control period (the window is what is reachable within dt). */
  dt: number;
  /** Forward simulation time for each candidate arc. */
  horizon: number;
  /** Samples per axis of the window. */
  nv: number;
  nw: number;
  /** Robot radius (clearance is measured from the robot's edge). */
  radius: number;
  /** Score weights. */
  heading: number;
  clearance: number;
  velocity: number;
}

export interface DwaCandidate {
  v: number;
  w: number;
  traj: Pose[];
  /** Normalised sub-scores in [0, 1]. */
  sHeading: number;
  sClear: number;
  sVel: number;
  /** Minimum clearance along the arc (m). */
  clearance: number;
  /** Can the robot stop before the nearest obstacle on this arc? */
  admissible: boolean;
  score: number;
}

export function dynamicWindow(v: number, w: number, p: DwaParams): { v0: number; v1: number; w0: number; w1: number } {
  return {
    v0: Math.max(0, v - p.aMax * p.dt),
    v1: Math.min(p.vMax, v + p.aMax * p.dt),
    w0: Math.max(-p.wMax, w - p.alphaMax * p.dt),
    w1: Math.min(p.wMax, w + p.alphaMax * p.dt),
  };
}

/** Score every (v, ω) sample in the window on heading, clearance and speed; pick the best admissible one. */
export function dwa(pose: Pose, v: number, w: number, goal: Vec2, obstacles: readonly Shape[], p: DwaParams): { window: ReturnType<typeof dynamicWindow>; candidates: DwaCandidate[]; best: DwaCandidate | null } {
  const win = dynamicWindow(v, w, p);
  const raw: Omit<DwaCandidate, 'sHeading' | 'sClear' | 'sVel' | 'score'>[] = [];
  const steps = 12;
  for (let i = 0; i < p.nv; i++)
    for (let j = 0; j < p.nw; j++) {
      const cv = p.nv === 1 ? win.v1 : win.v0 + ((win.v1 - win.v0) * i) / (p.nv - 1);
      const cw = p.nw === 1 ? 0 : win.w0 + ((win.w1 - win.w0) * j) / (p.nw - 1);
      const traj: Pose[] = [pose];
      let clear = Infinity;
      let travelled = 0;
      let distToHit = Infinity;
      for (let k = 1; k <= steps; k++) {
        const q = velocityMotion(pose, cv, cw, (p.horizon * k) / steps);
        travelled += Math.hypot(q.x - traj[k - 1].x, q.y - traj[k - 1].y);
        traj.push(q);
        let d = Infinity;
        for (const o of obstacles) d = Math.min(d, distToShape(q, o) - p.radius);
        if (d < clear) clear = d;
        if (d <= 0 && distToHit === Infinity) distToHit = travelled;
      }
      const stopDist = (cv * cv) / (2 * p.aMax);
      const admissible = clear > 0 && (distToHit === Infinity || stopDist < distToHit);
      raw.push({ v: cv, w: cw, traj, clearance: clear, admissible });
    }
  const scored: DwaCandidate[] = raw.map((c) => {
    const end = c.traj[c.traj.length - 1];
    const toGoal = Math.atan2(goal.y - end.y, goal.x - end.x);
    let err = Math.abs(((toGoal - end.theta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    if (!Number.isFinite(err)) err = Math.PI;
    const sHeading = 1 - err / Math.PI;
    const sClear = Math.max(0, Math.min(1, c.clearance / 2));
    const sVel = p.vMax > 0 ? c.v / p.vMax : 0;
    const score = p.heading * sHeading + p.clearance * sClear + p.velocity * sVel;
    return { ...c, sHeading, sClear, sVel, score };
  });
  const best = scored.filter((c) => c.admissible).sort((a, b) => b.score - a.score)[0] ?? null;
  return { window: win, candidates: scored, best };
}
