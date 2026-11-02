// Credit assignment in a cooperative multi-robot task (summary notes §9; 2024 Q20, 2025 Q20).
//
// Coverage game: K inspection sites with values v_k; each of N robots picks one site per round. The team reward is
//   G(z) = Σ_k v_k · [site k has at least one robot]          (a second robot on a site adds nothing)
// Three learning signals a robot can learn from:
//   global      r_i = G(z)                      aligned with the team, but robot i's own effect is buried in
//                                                 everyone else's random exploration as N grows;
//   difference  r_i = D_i = G(z) − G(z_−i)       the team reward minus the reward without robot i: exactly what
//                                                 robot i adds (v of its site if it is alone there, else 0);
//   local       r_i = v_{site of i}             selfish: ignores crowding, so robots pile onto the best site.
// Each robot learns stateless action values Q_i(k) with ε-greedy choice and Q_i(k) ← Q_i(k) + α (r_i − Q_i(k)).
// Pure module, no React. Deterministic for a seed.

import { mulberry32 } from '../engine/rng';

export type CreditSignal = 'global' | 'difference' | 'local';

/** Site values for K sites: a fixed, seed-independent, well-spread set between 1 and 3 (golden-ratio sequence). */
export function siteValues(K: number): number[] {
  return Array.from({ length: K }, (_, k) => Number((1 + 2 * ((k * 0.6180339887) % 1)).toFixed(2)));
}

/** G(z): total value of the sites covered by at least one robot. `skip` leaves one robot out (for G(z_−i)). */
export function teamReward(choice: ArrayLike<number>, values: readonly number[], skip = -1): number {
  const covered = new Uint8Array(values.length);
  for (let i = 0; i < choice.length; i++) if (i !== skip && choice[i] >= 0) covered[choice[i]] = 1;
  let g = 0;
  for (let k = 0; k < values.length; k++) if (covered[k]) g += values[k];
  return g;
}

/** D_i = G(z) − G(z_−i): v of robot i's site if nobody else is there, otherwise 0. */
export function differenceReward(choice: ArrayLike<number>, values: readonly number[], i: number): number {
  return teamReward(choice, values) - teamReward(choice, values, i);
}

export function signalFor(signal: CreditSignal, choice: ArrayLike<number>, values: readonly number[], i: number, G: number): number {
  if (signal === 'global') return G;
  if (signal === 'local') return values[choice[i]];
  return differenceReward(choice, values, i);
}

/** Best possible G: the N most valuable sites covered by one robot each. */
export function bestTeamReward(values: readonly number[], N: number): number {
  return [...values].sort((a, b) => b - a).slice(0, N).reduce((s, v) => s + v, 0);
}

export interface CreditLearnParams {
  N: number;
  K: number;
  signal: CreditSignal;
  alpha: number;
  eps: number;
  episodes: number;
  seed: number;
}

export interface CreditRun {
  values: number[];
  /** G / G_best per episode (behaviour, including exploration). */
  perf: Float32Array;
  /** G / G_best of the greedy joint choice after each episode. */
  greedyPerf: Float32Array;
  /** Final Q_i(k), row-major (i * K + k). */
  Q: Float64Array;
  /** Final greedy choices. */
  greedy: Int16Array;
  /** The last joint choice made while learning. */
  lastChoice: Int16Array;
  /** Every joint choice made while learning: choices[e * N + i]. */
  choices: Int16Array;
  /** Robot i's learning signal in each episode: signals[e * N + i]. */
  signals: Float32Array;
  best: number;
}

function argmaxRow(Q: Float64Array, off: number, K: number, rand: () => number): number {
  let best = -Infinity;
  let n = 0;
  let pick = 0;
  for (let k = 0; k < K; k++) {
    const q = Q[off + k];
    if (q > best + 1e-12) {
      best = q;
      n = 1;
      pick = k;
    } else if (Math.abs(q - best) <= 1e-12) {
      n++;
      if (rand() * n < 1) pick = k;
    }
  }
  return pick;
}

/** Independent learners on the coverage game; returns the learning curve. */
export function learnCoverage(p: CreditLearnParams): CreditRun {
  const { N, K, signal, alpha, eps, episodes } = p;
  const values = siteValues(K);
  const best = bestTeamReward(values, N);
  const rand = mulberry32(p.seed * 9973 + N * 131 + K * 7 + (signal === 'global' ? 1 : signal === 'difference' ? 2 : 3));
  const Q = new Float64Array(N * K);
  const choice = new Int16Array(N);
  const greedy = new Int16Array(N);
  const perf = new Float32Array(episodes);
  const greedyPerf = new Float32Array(episodes);
  const greedyRand = mulberry32(p.seed + 5);
  const choices = new Int16Array(episodes * N);
  const signals = new Float32Array(episodes * N);
  for (let e = 0; e < episodes; e++) {
    for (let i = 0; i < N; i++) choice[i] = rand() < eps ? Math.floor(rand() * K) : argmaxRow(Q, i * K, K, rand);
    const G = teamReward(choice, values);
    perf[e] = G / best;
    for (let i = 0; i < N; i++) {
      const r = signalFor(signal, choice, values, i, G);
      const idx = i * K + choice[i];
      Q[idx] += alpha * (r - Q[idx]);
      choices[e * N + i] = choice[i];
      signals[e * N + i] = r;
    }
    for (let i = 0; i < N; i++) greedy[i] = argmaxRow(Q, i * K, K, greedyRand);
    greedyPerf[e] = teamReward(greedy, values) / best;
  }
  return { values, perf, greedyPerf, Q, greedy, lastChoice: choice.slice(), choices, signals, best };
}

/**
 * How faithfully a learning signal reports robot i's real contribution D_i (its marginal effect on the team),
 * with teammates choosing at random (early in learning): the correlation corr(r_i, D_i) over random team
 * choices. 1 = the signal is exactly i's contribution; ≈ 0 = i cannot see its own effect in it.
 */
export function contributionCorr(signal: CreditSignal, N: number, K: number, samples = 1500, seed = 1): number {
  const values = siteValues(K);
  const rand = mulberry32(seed * 131 + N * 7919 + K * 3);
  const choice = new Int16Array(N);
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let s = 0; s < samples; s++) {
    for (let j = 0; j < N; j++) choice[j] = Math.floor(rand() * K);
    const G = teamReward(choice, values);
    const d = differenceReward(choice, values, 0);
    const r = signalFor(signal, choice, values, 0, G);
    sx += d;
    sy += r;
    sxx += d * d;
    syy += r * r;
    sxy += d * r;
  }
  const n = samples;
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2;
  const vy = syy / n - (sy / n) ** 2;
  return vx > 1e-12 && vy > 1e-12 ? cov / Math.sqrt(vx * vy) : 0;
}

/**
 * How much of robot i's learning signal is caused by robot i's own choice, when its teammates choose at random
 * (early in learning): the share of the signal's variance explained by i's action,
 *   quality = Var_a(E[r | a]) / (Var_a(E[r | a]) + E_a[Var(r | a)]),  1 = a clean signal, → 0 = pure noise.
 * Monte Carlo over `samples` random team choices (deterministic for a seed).
 */
export function signalQuality(signal: CreditSignal, N: number, K: number, samples = 600, seed = 1): number {
  const values = siteValues(K);
  const rand = mulberry32(seed * 31 + N * 977 + K);
  const sum = new Float64Array(K);
  const sum2 = new Float64Array(K);
  const choice = new Int16Array(N);
  for (let s = 0; s < samples; s++) {
    for (let j = 1; j < N; j++) choice[j] = Math.floor(rand() * K);
    for (let a = 0; a < K; a++) {
      choice[0] = a;
      const G = teamReward(choice, values);
      const r = signalFor(signal, choice, values, 0, G);
      sum[a] += r;
      sum2[a] += r * r;
    }
  }
  let meanOfMeans = 0;
  const means: number[] = [];
  let noise = 0;
  for (let a = 0; a < K; a++) {
    const m = sum[a] / samples;
    means.push(m);
    meanOfMeans += m / K;
    noise += Math.max(0, sum2[a] / samples - m * m) / K;
  }
  let sig = 0;
  for (const m of means) sig += (m - meanOfMeans) ** 2 / K;
  return sig + noise > 1e-12 ? sig / (sig + noise) : 1;
}
