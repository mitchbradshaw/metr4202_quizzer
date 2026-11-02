// The world behind the "velocity vs odometry" simulation: a differential-drive robot is given velocity
// commands, its motors under-deliver (gain, left/right imbalance), and on a wet patch its wheels slip.
//   commanded path: integrate the commands (what the velocity model assumes happens)
//   odometry path:  integrate the wheel encoders (what the wheels actually did; slip is invisible to them)
//   true path:      what the robot really did on the ground
// The odometry increments u_k = (δrot1, δtrans, δrot2) come from consecutive odometry poses (Thrun Table 5.6),
// and both models' sample clouds are propagated step by step from the true start (dead reckoning, no correction).
import {
  gaussian,
  odometryFromPoses,
  sampleOdometryMotion,
  sampleVelocityMotion,
  velocityMotion,
  wrapAngle,
  type OdometryAlphas,
  type OdometryU,
  type Pose,
  type VelocityAlphas,
} from '../../../core/motion';
import { mulberry32 } from '../../../engine/rng';

export interface OdoCmd {
  v: number;
  w: number;
  dt: number;
}

export interface Patch {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Route {
  id: string;
  label: string;
  start: Pose;
  cmds: OdoCmd[];
  patch: Patch;
}

const rep = (n: number, c: OdoCmd) => Array.from({ length: n }, () => ({ ...c }));

export const ROUTES: Route[] = [
  {
    id: 'turn',
    label: 'Straight, left turn, straight',
    start: { x: 0, y: 0, theta: 0 },
    cmds: [...rep(3, { v: 0.6, w: 0, dt: 1 }), ...rep(3, { v: 0.5, w: 0.5, dt: 1 }), ...rep(3, { v: 0.6, w: 0, dt: 1 })],
    patch: { x0: 0.9, y0: -0.45, x1: 1.9, y1: 0.45 },
  },
  {
    id: 's',
    label: 'S-bend',
    start: { x: 0, y: 0, theta: 0.3 },
    cmds: [...rep(4, { v: 0.6, w: -0.35, dt: 1 }), ...rep(4, { v: 0.6, w: 0.35, dt: 1 })],
    patch: { x0: 2.4, y0: -1.2, x1: 3.4, y1: -0.2 },
  },
  {
    id: 'spin',
    label: 'Turn on the spot, then drive',
    start: { x: 0, y: 0, theta: 0 },
    cmds: [...rep(2, { v: 0, w: 0.8, dt: 1 }), ...rep(5, { v: 0.6, w: 0, dt: 1 })],
    patch: { x0: -0.6, y0: 1.2, x1: 0.6, y1: 2.2 },
  },
];

export const routeById = (id: string) => ROUTES.find((r) => r.id === id) ?? ROUTES[0];

export interface Actuation {
  /** Fraction of the commanded wheel speed the motors deliver (1 = perfect). */
  gain: number;
  /** Right wheel weaker by this fraction, left stronger by the same (0 = balanced). */
  imbalance: number;
  /** On the patch the ground moves (1 − slip) × what the wheels turn. */
  slip: number;
}

export const WHEEL_BASE = 0.3;
const SUB = 10;

export const inPatch = (p: { x: number; y: number }, q: Patch) => p.x >= q.x0 && p.x <= q.x1 && p.y >= q.y0 && p.y <= q.y1;

export interface RouteSim {
  /** Poses at the start of each step and after the last (length n + 1). */
  truth: Pose[];
  odo: Pose[];
  cmd: Pose[];
  /** Odometry increments between consecutive odometry poses (length n). */
  u: OdometryU[];
  /** What the wheels really did per step (v', ω'). */
  actual: { v: number; w: number }[];
  /** Fraction of each step spent slipping on the patch. */
  slipFrac: number[];
  /** The true poses inside each step (SUB + 1 per step), for animating the move. */
  sub: Pose[][];
}

/** Run the route: commands -> wheel speeds (motor errors, small random jitter) -> encoders and ground motion. */
export function simulateRoute(route: Route, act: Actuation, seed = 1): RouteSim {
  const next = mulberry32(seed);
  const truth: Pose[] = [route.start];
  const odo: Pose[] = [route.start];
  const cmd: Pose[] = [route.start];
  const u: OdometryU[] = [];
  const actual: { v: number; w: number }[] = [];
  const slipFrac: number[] = [];
  const sub: Pose[][] = [];
  const b = WHEEL_BASE;
  for (const c of route.cmds) {
    const vr = c.v + (c.w * b) / 2;
    const vl = c.v - (c.w * b) / 2;
    const jr = 1 + 0.015 * gaussian(next);
    const jl = 1 + 0.015 * gaussian(next);
    const vr2 = act.gain * (1 - act.imbalance) * vr * jr;
    const vl2 = act.gain * (1 + act.imbalance) * vl * jl;
    const va = (vr2 + vl2) / 2;
    const wa = (vr2 - vl2) / b;
    actual.push({ v: va, w: wa });
    let t = truth[truth.length - 1];
    let o = odo[odo.length - 1];
    let slipping = 0;
    const h = c.dt / SUB;
    const tsub: Pose[] = [t];
    for (let s = 0; s < SUB; s++) {
      const k = inPatch(t, route.patch) ? 1 - act.slip : 1;
      if (k < 1) slipping++;
      t = velocityMotion(t, va * k, wa * k, h);
      o = velocityMotion(o, va, wa, h);
      tsub.push(t);
    }
    sub.push(tsub);
    // A turn on the spot leaves a few millimetres of translation (motor imbalance), which would make δrot1 the
    // direction of that tiny move (up to ±π). Below 1 cm treat it as a pure rotation, as a real driver would.
    let du = odometryFromPoses(odo[odo.length - 1], o);
    if (du.trans < 0.01) du = { rot1: 0, trans: du.trans, rot2: wrapAngle(o.theta - odo[odo.length - 1].theta) };
    u.push(du);
    truth.push(t);
    odo.push(o);
    cmd.push(velocityMotion(cmd[cmd.length - 1], c.v, c.w, c.dt));
    slipFrac.push(slipping / SUB);
  }
  return { truth, odo, cmd, u, actual, slipFrac, sub };
}

export interface Clouds {
  /** vel[k] / odo[k]: the samples after k steps (k = 0 is the start). */
  vel: Pose[][];
  odo: Pose[][];
}

/** Scale the default noise of both models together (1 = the defaults below). */
export function alphasFor(scale: number): { v: VelocityAlphas; o: OdometryAlphas } {
  const s = Math.max(0, scale);
  return {
    v: [0.02 * s, 0.01 * s, 0.02 * s, 0.01 * s, 0.004 * s, 0.004 * s],
    o: [0.02 * s, 0.01 * s, 0.02 * s, 0.01 * s],
  };
}

/** Propagate N samples through every step with each model, from the true start (no correction step). */
export function propagate(route: Route, sim: RouteSim, scale: number, n: number, seed = 3): Clouds {
  const next = mulberry32(seed);
  const a = alphasFor(scale);
  const vel: Pose[][] = [Array.from({ length: n }, () => route.start)];
  const odo: Pose[][] = [Array.from({ length: n }, () => route.start)];
  route.cmds.forEach((c, k) => {
    vel.push(vel[k].map((p) => sampleVelocityMotion(p, c.v, c.w, c.dt, a.v, next)));
    odo.push(odo[k].map((p) => sampleOdometryMotion(p, sim.u[k], a.o, next)));
  });
  return { vel, odo };
}

/** Mean position of a cloud. */
export function meanOf(ps: Pose[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const p of ps) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, ps.length), y: y / Math.max(1, ps.length) };
}
