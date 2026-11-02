// Pure model behind the 1-D Kalman filter simulation (kf1d): one predict-correct cycle with A = B = C = 1, and the
// time-series run of a cart on a rail (noisy motion, noisy position sensor). The noise is drawn once per seed as
// standard normals and scaled by √R and √Q, so moving a slider morphs the same run instead of re-rolling it.
import { kf1GainSequence, kf1Step, kf1SteadyState, type Kf1Model, type Kf1Step } from '../../../core/filters_kalman';
import { gaussian } from '../../../core/motion';
import { mulberry32 } from '../../../engine/rng';

/** The cycle-mode model: x_t = x_{t−1} + u_t + ε (var R), z_t = x_t + δ (var Q). */
export const kfModel = (R: number, Q: number): Kf1Model => ({ a: 1, b: 1, c: 1, R, Q });

export interface CycleIn {
  mu0: number;
  s0: number;
  u: number;
  z: number;
  R: number;
  Q: number;
}

export const CYCLE_DEFAULT: CycleIn = { mu0: 4, s0: 1, u: 6, z: 13, R: 1.5, Q: 2 };

export function cycle(c: CycleIn): Kf1Step {
  return kf1Step(c.mu0, c.s0 * c.s0, c.u, c.z, kfModel(c.R, c.Q));
}

/** Posterior mean and variance as functions of one noise parameter (the "what Q does" sweep chart). */
export function sweep(c: CycleIn, param: 'Q' | 'R', values: ArrayLike<number>): { mu: Float64Array; s2: Float64Array; K: Float64Array } {
  const n = values.length;
  const mu = new Float64Array(n);
  const s2 = new Float64Array(n);
  const K = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = cycle({ ...c, [param]: values[i] });
    mu[i] = r.mu;
    s2[i] = r.s2;
    K[i] = r.K;
  }
  return { mu, s2, K };
}

// ------------------------------------------------------------------ time series: a cart on a 20 m rail

export const TS_STEPS = 60;
export const TS_X0 = 10;
/** The filter's initial guess (3 m off the true start). */
export const TS_MU0 = 7;
/** The known command: the cart drives back and forth, u_t = 1.6 cos(2π(t − 1)/30) m per step. */
export const tsCommand = (t: number) => 1.6 * Math.cos((2 * Math.PI * (t - 1)) / 30);

export interface TsNoise {
  /** Standard normals for the motion noise, index t = 1 … N. */
  e: Float64Array;
  /** Standard normals for the sensor noise. */
  d: Float64Array;
}

export function tsNoise(seed: number, n = TS_STEPS): TsNoise {
  const next = mulberry32(seed);
  const e = new Float64Array(n + 1);
  const d = new Float64Array(n + 1);
  for (let t = 1; t <= n; t++) {
    e[t] = gaussian(next);
    d[t] = gaussian(next);
  }
  return { e, d };
}

export interface TsRow {
  t: number;
  u: number;
  /** True position. */
  x: number;
  /** Measurement (NaN at t = 0). */
  z: number;
  muBar: number;
  s2Bar: number;
  K: number;
  mu: number;
  s2: number;
  /** Is the truth inside μ ± 2σ? */
  inside: boolean;
}

/** Run the filter alongside the simulated cart. Row 0 is the initial belief N(μ0, σ0²). */
export function kfTrace(R: number, Q: number, s0: number, noise: TsNoise, n = TS_STEPS, mu0 = TS_MU0, x0 = TS_X0): TsRow[] {
  const m = kfModel(R, Q);
  const rows: TsRow[] = [{ t: 0, u: 0, x: x0, z: NaN, muBar: mu0, s2Bar: s0 * s0, K: NaN, mu: mu0, s2: s0 * s0, inside: Math.abs(x0 - mu0) <= 2 * s0 }];
  let x = x0;
  let mu = mu0;
  let s2 = s0 * s0;
  for (let t = 1; t <= n; t++) {
    const u = tsCommand(t);
    x = x + u + Math.sqrt(R) * noise.e[t];
    const z = x + Math.sqrt(Q) * noise.d[t];
    const r = kf1Step(mu, s2, u, z, m);
    mu = r.mu;
    s2 = r.s2;
    rows.push({ t, u, x, z, muBar: r.muBar, s2Bar: r.s2Bar, K: r.K, mu, s2, inside: Math.abs(x - mu) <= 2 * Math.sqrt(s2) });
  }
  return rows;
}

/** Steady-state gain and variances of the cycle model (they do not depend on the data). */
export function steady(R: number, Q: number) {
  return kf1SteadyState(kfModel(R, Q));
}

/** First n gains from initial standard deviation s0. */
export function gains(R: number, Q: number, s0: number, n = TS_STEPS) {
  return kf1GainSequence(s0 * s0, n, kfModel(R, Q));
}
