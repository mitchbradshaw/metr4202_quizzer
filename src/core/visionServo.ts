// Toy eye-in-hand visual servoing: position-based (PBVS) vs image-based (IBVS) (summary notes §7; Chaumette &
// Hutchinson, "Visual servo control, Part I", 2006). The world is the target's frame: four points of a 0.2 m square
// in its z = 0 plane. The desired camera pose is 0.5 m in front of it, looking straight at it (camera ẑ = world ẑ).
//
// PBVS: estimate the target's pose from the image, form the camera's pose relative to the desired one (ᶜ*t_c, θu)
//   and drive it to zero: v = −λ ᶜ*R_cᵀ ᶜ*t_c, ω = −λ θu. The camera centre moves on a straight line, but the
//   pose estimate (and the camera-to-end-effector transform) must be right, or it stops in the wrong place.
// IBVS: drive the image error e = s − s* to zero with the image Jacobian (interaction matrix) L:
//   v_c = −λ L⁺ e. Features move on nearly straight image lines; the 3-D path can be odd (it backs away for a
//   rotation about the optical axis) and L needs a depth estimate Z, but calibration errors only bend the path.
//
// Calibration error e ∈ [0, 1]: focal length overestimated by 30 e % (so the depth estimated from the known target
// size is 30 e % too large), and the camera-to-end-effector transform is off by (5e, −3e, 0) cm and ≈ 9e° of rotation
// (the robot executes each commanded camera twist slightly rotated).
import { I3, add, expSO3, logSO3, mul, mv, norm, rotX, rotY, rotZ, scale, solveLinear, sub, tr, type Mat3, type V2, type V3 } from './vision';

export interface ServoPose {
  /** Camera centre in the target frame (m). */
  C: V3;
  /** Camera axes (x̂ right, ŷ down, ẑ optical axis) as the columns, written in the target frame. */
  Rwc: Mat3;
}

export interface ServoCam {
  f: number;
  u0: number;
  v0: number;
  w: number;
  h: number;
}

/** 640 × 480 image, focal length 600 px (about 56° × 44° field of view). */
export const SERVO_CAM: ServoCam = { f: 600, u0: 320, v0: 240, w: 640, h: 480 };
export const SERVO_TARGET: V3[] = [
  [-0.1, -0.1, 0],
  [0.1, -0.1, 0],
  [0.1, 0.1, 0],
  [-0.1, 0.1, 0],
];
export const SERVO_GOAL: ServoPose = { C: [0, 0, -0.5], Rwc: I3() };
/** The gripper tip, fixed in the camera frame (below and ahead of the lens). */
export const SERVO_TOOL: V3 = [0, 0.07, 0.06];

export const camPoint = (p: ServoPose, X: V3): V3 => mv(tr(p.Rwc), sub(X, p.C));
export const toolTip = (p: ServoPose): V3 => add(p.C, mv(p.Rwc, SERVO_TOOL));

export function pixelsOf(cam: ServoCam, p: ServoPose, pts: V3[] = SERVO_TARGET): V2[] {
  return pts.map((X) => {
    const c = camPoint(p, X);
    const z = Math.max(c[2], 1e-6);
    return [cam.f * (c[0] / z) + cam.u0, cam.f * (c[1] / z) + cam.v0] as V2;
  });
}

/** The 2 × 6 interaction matrix of a normalised image point (x, y) at depth Z: ṡ = L v_c. */
export function interactionRows(x: number, y: number, Z: number): [number[], number[]] {
  return [
    [-1 / Z, 0, x / Z, x * y, -(1 + x * x), y],
    [0, -1 / Z, y / Z, 1 + y * y, -x * y, -x],
  ];
}

export interface ServoOptions {
  method: 'pbvs' | 'ibvs';
  /** Calibration error, 0 (perfect) to 1. */
  calib: number;
  /** IBVS depth estimate: the current depth of each point, or the constant desired depth. */
  depth?: 'current' | 'desired';
  lambda?: number;
  dt?: number;
  steps?: number;
}

export interface ServoTrace {
  t: number[];
  C: V3[];
  Rwc: Mat3[];
  /** Feature pixels per step (4 points). */
  uv: V2[][];
  /** Distance from the camera centre to the target centre (m). */
  dist: number[];
  /** RMS pixel error to the desired features. */
  err: number[];
  /** First step at which a feature is outside the image or behind the camera (−1 if never). */
  leftView: number;
  /** Steps outside the image. */
  outSteps: number;
  /** Final gripper-tip error (m) and final RMS pixel error. */
  toolErr: number;
  pixErr: number;
  /** Largest distance to the target along the way (m). */
  maxDist: number;
}

export interface CalibModel {
  /** f_est / f. */
  k: number;
  /** Rotation the robot applies to every commanded camera twist (hand-eye rotation error). */
  Rhe: Mat3;
  /** Hand-eye translation error (m), in the desired camera frame. */
  dT: V3;
}

export function calibModel(e: number): CalibModel {
  return { k: 1 + 0.3 * e, Rhe: mul(rotX(0.12 * e), rotY(-0.09 * e)), dT: [0.05 * e, -0.03 * e, 0] };
}

const clampNorm = (v: V3, max: number): V3 => {
  const n = norm(v);
  return n > max ? scale(v, max / n) : v;
};

/** Run one servo law from `start` to SERVO_GOAL; every step is recorded. */
export function simulateServo(start: ServoPose, o: ServoOptions, cam: ServoCam = SERVO_CAM): ServoTrace {
  const lambda = o.lambda ?? 1;
  const dt = o.dt ?? 0.02;
  const steps = o.steps ?? 400;
  const cm = calibModel(o.calib);
  const fEst = cam.f * cm.k;
  const goal = SERVO_GOAL;
  const sStar = pixelsOf(cam, goal);
  const zStar = SERVO_TARGET.map((X) => camPoint(goal, X)[2]);
  const xStarEst = sStar.map(([u, v]) => [(u - cam.u0) / fEst, (v - cam.v0) / fEst] as V2);
  // PBVS: the desired target pose in the desired camera frame, as the controller believes it.
  const cStarRt = tr(goal.Rwc);
  const cStarTt = add(scale(mv(cStarRt, goal.C), -1), cm.dT);

  const tr0: ServoTrace = { t: [], C: [], Rwc: [], uv: [], dist: [], err: [], leftView: -1, outSteps: 0, toolErr: 0, pixErr: 0, maxDist: 0 };
  let p: ServoPose = { C: start.C.slice() as V3, Rwc: start.Rwc.map((r) => r.slice()) as Mat3 };
  for (let k = 0; k <= steps; k++) {
    const s = pixelsOf(cam, p);
    const Xc = SERVO_TARGET.map((X) => camPoint(p, X));
    const out = Xc.some((c) => c[2] < 0.02) || s.some(([u, v]) => u < 0 || u > cam.w || v < 0 || v > cam.h);
    if (out) {
      tr0.outSteps++;
      if (tr0.leftView < 0) tr0.leftView = k;
    }
    const err = Math.sqrt(s.reduce((a, [u, v], i) => a + (u - sStar[i][0]) ** 2 + (v - sStar[i][1]) ** 2, 0) / 4);
    const dist = norm(p.C);
    tr0.t.push(k * dt);
    tr0.C.push(p.C);
    tr0.Rwc.push(p.Rwc);
    tr0.uv.push(s);
    tr0.err.push(err);
    tr0.dist.push(dist);
    tr0.maxDist = Math.max(tr0.maxDist, dist);
    if (k === steps) break;

    let v: V3;
    let w: V3;
    if (o.method === 'ibvs') {
      const L: number[][] = [];
      const e: number[] = [];
      s.forEach(([u, vv], i) => {
        const x = (u - cam.u0) / fEst;
        const y = (vv - cam.v0) / fEst;
        const Z = o.depth === 'desired' ? zStar[i] : Math.max(0.05, Xc[i][2] * cm.k);
        const [r1, r2] = interactionRows(x, y, Z);
        L.push(r1, r2);
        e.push(x - xStarEst[i][0], y - xStarEst[i][1]);
      });
      // v = −λ (LᵀL)⁻¹ Lᵀ e
      const LtL = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => L.reduce((a, row) => a + row[i] * row[j], 0)));
      const Lte = Array.from({ length: 6 }, (_, i) => L.reduce((a, row, r) => a + row[i] * e[r], 0));
      const sol = solveLinear(LtL, Lte) ?? [0, 0, 0, 0, 0, 0];
      v = [-lambda * sol[0], -lambda * sol[1], -lambda * sol[2]];
      w = [-lambda * sol[3], -lambda * sol[4], -lambda * sol[5]];
    } else {
      // Estimated target pose in the camera frame: depth scaled by f_est / f (from the known target size).
      const cRt = tr(p.Rwc);
      const ctt = scale(mv(cRt, p.C), -1);
      const cttEst: V3 = [ctt[0], ctt[1], ctt[2] * cm.k];
      const cStarRc = mul(cStarRt, tr(cRt));
      const cStarTc = sub(cStarTt, mv(cStarRc, cttEst));
      v = scale(mv(tr(cStarRc), cStarTc), -lambda);
      w = scale(logSO3(cStarRc), -lambda);
    }
    v = clampNorm(mv(cm.Rhe, v), 1.2);
    w = clampNorm(mv(cm.Rhe, w), 2.5);
    p = { C: add(p.C, scale(mv(p.Rwc, v), dt)), Rwc: mul(p.Rwc, expSO3(scale(w, dt))) };
  }
  const last = tr0.uv.length - 1;
  tr0.pixErr = tr0.err[last];
  tr0.toolErr = norm(sub(toolTip({ C: tr0.C[last], Rwc: tr0.Rwc[last] }), toolTip(goal)));
  return tr0;
}

/** Starting poses for the simulation (camera centre and axes in the target frame). */
export interface ServoPreset {
  id: string;
  label: string;
  note: string;
  start: ServoPose;
}

/** Axes of a camera at C looking at `at`, then rolled about its optical axis by `roll`. */
export function lookAtPose(C: V3, at: V3, roll = 0, upHint: V3 = [0, -1, 0]): ServoPose {
  const z = (() => {
    const d = sub(at, C);
    const n = norm(d) || 1;
    return scale(d, 1 / n);
  })();
  // x̂ right = ŷ_down × ẑ … pick x̂ ⟂ ẑ closest to the hint's right-hand side.
  let x = [upHint[1] * z[2] - upHint[2] * z[1], upHint[2] * z[0] - upHint[0] * z[2], upHint[0] * z[1] - upHint[1] * z[0]] as V3;
  x = scale(x, -1 / (norm(x) || 1));
  const y: V3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  let R: Mat3 = [
    [x[0], y[0], z[0]],
    [x[1], y[1], z[1]],
    [x[2], y[2], z[2]],
  ];
  if (roll) R = mul(R, expSO3([0, 0, roll]));
  return { C, Rwc: R };
}

/** The simulation's starting poses (also used by the self-tests). */
export const SERVO_PRESETS: ServoPreset[] = [
  { id: 'approach', label: 'Approach from 1.1 m, a little off to the side', start: lookAtPose([0.25, -0.15, -1.1], [0.03, 0.02, 0], 0.4), note: 'An easy case: both laws converge and look alike.' },
  { id: 'roll90', label: 'Rotated 90° about the optical axis', start: { C: [0, 0, -0.5], Rwc: rotZ(Math.PI / 2) }, note: 'Pure rotation about the optical axis: PBVS rotates in place; IBVS pulls the features along straight chords, which shrinks the square, so the camera backs away.' },
  { id: 'roll160', label: 'Rotated 160° about the optical axis', start: { C: [0, 0, -0.5], Rwc: rotZ((160 * Math.PI) / 180) }, note: 'Near 180° the straight image chords pass close to the centre: IBVS retreats more than three times as far before coming back (at exactly 180° it would retreat to infinity).' },
  { id: 'swing', label: 'Beside the target, turned and rolled', start: lookAtPose([0.7, 0.05, -0.2], [-0.05, 0, 0], 1.2), note: 'PBVS’s straight line and steady rotation sweep the target out of the image for part of the way; IBVS keeps it in view.' },
];
