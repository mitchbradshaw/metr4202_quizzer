// Model behind the Newton–Raphson IK simulation and the kin-nr-step generator (no React).
//
//   x_d − x(θ) = e,   J(θ) Δθ = e  (the linearisation),   Δθ = J^T (J J^T + λ² I)^{-1} e,   θ ← θ + Δθ.
//
// For a 2-link arm and λ = 0 this is Δθ = J^{-1} e (J square); for a 3-link arm J^T (J J^T)^{-1} is the right
// pseudoinverse J† (the minimum-norm step). The iterates themselves come from core/kin planarIk, so the
// simulation shows exactly what the core code does; this file only adds the per-step numbers (J, J†, det J,
// singular values) and two pictures: the basin map (which initial guess converges where) and, for a
// redundant 3-link arm, the whole curve of solutions.
import { planarFk, planarIk, planarJacobian, type Mat } from '../../../core/kin';

/** planarIk's default damping: numerically "undamped" but never exactly singular. */
export const LAMBDA_FLOOR = 1e-6;
export const MAX_ITER = 30;
export const TOL = 1e-4;
export const TAU = 2 * Math.PI;

export const wrapTau = (a: number) => ((a % TAU) + TAU) % TAU;
export const wrapPi = (a: number) => a - TAU * Math.round(a / TAU);

export type V2 = [number, number];

export interface NrStep {
  k: number;
  theta: number[];
  tip: V2;
  /** e = x_d − x(θ). */
  e: V2;
  err: number;
  J: Mat;
  /** J^T (J J^T + λ²I)^{-1}: n × 2 (equals J^{-1} for n = 2 and λ → 0). */
  Jp: Mat;
  /** det J (2-link) or sqrt(det J J^T) (3-link): the manipulability, 0 at a singularity. */
  w: number;
  /** Singular values of J, largest first. */
  sigma: V2;
  /** The step taken from here (null at the last iterate). */
  dtheta: number[] | null;
}

export interface NrRun {
  lengths: readonly number[];
  target: V2;
  lambda: number;
  steps: NrStep[];
  converged: boolean;
}

/** 2 × 2 symmetric inverse helper: (J J^T + λ² I)^{-1}. */
function aInv(J: Mat, lam: number): [number, number, number] {
  const n = J[0].length;
  let a = lam * lam;
  let b = 0;
  let d = lam * lam;
  for (let j = 0; j < n; j++) {
    a += J[0][j] * J[0][j];
    b += J[0][j] * J[1][j];
    d += J[1][j] * J[1][j];
  }
  const det = a * d - b * b;
  return [d / det, -b / det, a / det];
}

/** Damped pseudoinverse J^T (J J^T + λ² I)^{-1} (n × 2). */
export function dampedPinv(J: Mat, lambda: number): Mat {
  const [p, q, r] = aInv(J, Math.max(LAMBDA_FLOOR, lambda));
  return J[0].map((_, j) => [J[0][j] * p + J[1][j] * q, J[0][j] * q + J[1][j] * r]);
}

/** Singular values of a 2 × n matrix. */
export function singular2(J: Mat): V2 {
  let a = 0;
  let b = 0;
  let d = 0;
  for (let j = 0; j < J[0].length; j++) {
    a += J[0][j] * J[0][j];
    b += J[0][j] * J[1][j];
    d += J[1][j] * J[1][j];
  }
  const tr = a + d;
  const disc = Math.sqrt(Math.max(0, (a - d) * (a - d) + 4 * b * b));
  return [Math.sqrt(Math.max(0, (tr + disc) / 2)), Math.sqrt(Math.max(0, (tr - disc) / 2))];
}

/** Every iterate of Newton–Raphson (planarIk) with the numbers a by-hand step needs. */
export function nrRun(lengths: readonly number[], target: V2, theta0: readonly number[], lambda: number, maxIter = MAX_ITER): NrRun {
  const lam = Math.max(LAMBDA_FLOOR, lambda);
  const { iterates, converged } = planarIk(lengths, target, theta0, { maxIter, tol: TOL, lambda: lam });
  const steps: NrStep[] = iterates.map((it, k) => {
    const J = planarJacobian(lengths, it.theta);
    const sigma = singular2(J);
    const w = lengths.length === 2 ? J[0][0] * J[1][1] - J[0][1] * J[1][0] : sigma[0] * sigma[1];
    const next = iterates[k + 1];
    return {
      k,
      theta: it.theta,
      tip: it.tip,
      e: [target[0] - it.tip[0], target[1] - it.tip[1]],
      err: it.err,
      J,
      Jp: dampedPinv(J, lam),
      w,
      sigma,
      dtheta: next ? next.theta.map((t, i) => t - it.theta[i]) : null,
    };
  });
  return { lengths, target, lambda, steps, converged };
}

/** Tip path while θ moves in a straight line from a to b (what really happens during one step). */
export function stepArc(lengths: readonly number[], a: readonly number[], b: readonly number[], n = 24): V2[] {
  const out: V2[] = [];
  for (let s = 0; s <= n; s++) {
    const f = s / n;
    const pts = planarFk(
      lengths,
      a.map((t, i) => t + (b[i] - t) * f)
    );
    out.push(pts[pts.length - 1]);
  }
  return out;
}

// ------------------------------------------------------------------ 2-link facts

/** Both exact solutions of the 2-link arm (θ2 > 0 first), or [] when out of reach. Angles in [0, 2π). */
export function twoLinkSolutions(L1: number, L2: number, target: V2): [number, number][] {
  const r2 = target[0] * target[0] + target[1] * target[1];
  const c2 = (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  if (c2 > 1 + 1e-12 || c2 < -1 - 1e-12) return [];
  const t2 = Math.acos(Math.max(-1, Math.min(1, c2)));
  return [t2, -t2].map((tt) => {
    const t1 = Math.atan2(target[1], target[0]) - Math.atan2(L2 * Math.sin(tt), L1 + L2 * Math.cos(tt));
    return [wrapTau(t1), wrapTau(tt)] as [number, number];
  });
}

/**
 * "elbow up" / "elbow down" for a configuration: which side of the base→tip line the elbow is on, judged
 * against the upward normal of that line (for a tip straight above or below the base: left / right).
 */
export function elbowName(lengths: readonly number[], theta: readonly number[]): string {
  const pts = planarFk(lengths, theta);
  const tip = pts[pts.length - 1];
  const el = pts[1];
  const r = Math.hypot(tip[0], tip[1]);
  if (r < 1e-9) return 'folded';
  const cross = tip[0] * el[1] - tip[1] * el[0]; // > 0: elbow anticlockwise of the base→tip line
  if (Math.abs(cross) < 1e-9 * r) return Math.abs(Math.sin(theta[1])) < 1e-9 && Math.cos(theta[1]) > 0 ? 'stretched' : 'folded';
  if (Math.abs(tip[0]) < 0.05 * r) return (cross > 0) === tip[1] > 0 ? 'elbow left' : 'elbow right';
  const up = tip[0] > 0 ? cross > 0 : cross < 0;
  return up ? 'elbow up' : 'elbow down';
}

// ------------------------------------------------------------------ basin map (2-link)

export const BASIN_NONE = 0;
export const BASIN_POS = 1; // converged with θ2 in (0, π)
export const BASIN_NEG = 2; // converged with θ2 in (π, 2π)

/**
 * For an N × N grid of initial guesses (θ1, θ2) ∈ [0, 2π)², run the same Newton–Raphson as planarIk
 * (damped 2 × 2 inverse, same tolerance and iteration cap) and record which solution each converges to.
 * code[j * N + i]: BASIN_NONE / BASIN_POS / BASIN_NEG; iters[…]: iterations used. Row j = θ2, column i = θ1.
 */
export function basinMap(L1: number, L2: number, target: V2, lambda: number, N: number, code: Uint8Array, iters: Uint8Array, maxIter = MAX_ITER): void {
  const lam2 = Math.max(LAMBDA_FLOOR, lambda) ** 2;
  const tx = target[0];
  const ty = target[1];
  const tol2 = TOL * TOL;
  const h = TAU / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let t1 = (i + 0.5) * h;
      let t2 = (j + 0.5) * h;
      let k = 0;
      let ok = false;
      for (; k <= maxIter; k++) {
        const c1 = Math.cos(t1);
        const s1 = Math.sin(t1);
        const c12 = Math.cos(t1 + t2);
        const s12 = Math.sin(t1 + t2);
        const ex = tx - (L1 * c1 + L2 * c12);
        const ey = ty - (L1 * s1 + L2 * s12);
        if (ex * ex + ey * ey < tol2) {
          ok = true;
          break;
        }
        if (k === maxIter) break;
        const j11 = -L1 * s1 - L2 * s12;
        const j12 = -L2 * s12;
        const j21 = L1 * c1 + L2 * c12;
        const j22 = L2 * c12;
        const a = j11 * j11 + j12 * j12 + lam2;
        const b = j11 * j21 + j12 * j22;
        const d = j21 * j21 + j22 * j22 + lam2;
        const det = a * d - b * b;
        const y1 = (d * ex - b * ey) / det;
        const y2 = (a * ey - b * ex) / det;
        t1 += j11 * y1 + j21 * y2;
        t2 += j12 * y1 + j22 * y2;
        if (!Number.isFinite(t1) || !Number.isFinite(t2)) break;
      }
      const p = j * N + i;
      iters[p] = Math.min(255, k);
      code[p] = ok ? (Math.sin(t2) >= 0 ? BASIN_POS : BASIN_NEG) : BASIN_NONE;
    }
  }
}

/** Classify the end of a planarIk run the same way as basinMap. */
export function classifyRun(run: NrRun): number {
  if (!run.converged) return BASIN_NONE;
  const th = run.steps[run.steps.length - 1].theta;
  return Math.sin(th[1]) >= 0 ? BASIN_POS : BASIN_NEG;
}

// ------------------------------------------------------------------ 3-link: the curve of solutions

/**
 * Every configuration of a 3-link arm whose tip is on the target: for each absolute angle φ of link 3 the
 * wrist w = x_d − L3(cos φ, sin φ) is a 2-link problem with two elbow branches. Returns the two branches as
 * runs of consecutive reachable samples (θ1, θ2, θ3), unwrapped along each run.
 */
export function selfMotion3(lengths: readonly number[], target: V2, samples = 240): { branch: 0 | 1; pts: number[][] }[] {
  const [L1, L2, L3] = lengths;
  const runs: { branch: 0 | 1; pts: number[][] }[] = [];
  for (const branch of [0, 1] as const) {
    let cur: number[][] | null = null;
    for (let s = 0; s <= samples; s++) {
      const phi = (s / samples) * TAU;
      const wx = target[0] - L3 * Math.cos(phi);
      const wy = target[1] - L3 * Math.sin(phi);
      const c2 = (wx * wx + wy * wy - L1 * L1 - L2 * L2) / (2 * L1 * L2);
      if (c2 > 1 || c2 < -1) {
        if (cur && cur.length > 1) runs.push({ branch, pts: cur });
        cur = null;
        continue;
      }
      const t2 = (branch === 0 ? 1 : -1) * Math.acos(c2);
      const t1 = Math.atan2(wy, wx) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
      const t3 = phi - t1 - t2;
      const p = [t1, t2, t3];
      if (cur && cur.length) {
        const q = cur[cur.length - 1];
        for (let m = 0; m < 3; m++) p[m] = q[m] + wrapPi(p[m] - q[m]);
      }
      (cur ??= []).push(p);
    }
    if (cur && cur.length > 1) runs.push({ branch, pts: cur });
  }
  return runs;
}

/** Reach of a planar arm: outer radius and inner (hole) radius. */
export function reach(lengths: readonly number[]): { outer: number; inner: number } {
  const sum = lengths.reduce((a, b) => a + b, 0);
  const longest = Math.max(...lengths);
  return { outer: sum, inner: Math.max(0, 2 * longest - sum) };
}
