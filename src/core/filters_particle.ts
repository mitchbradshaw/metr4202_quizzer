// Particle filter building blocks (summary notes §2; Thrun, Probabilistic Robotics Table 4.3 / 4.4):
//   1. Sample:   move every particle through the noisy motion model, x_t^[m] ~ p(x_t | u_t, x_{t−1}^[m]).
//   2. Weight:   w^[m] = p(z_t | x_t^[m]), the sensor likelihood.
//   3. Resample: draw M new particles with probability proportional to the weights (low-variance sampler:
//                one random number r ∈ [0, 1/M) and M equally spaced pointers U_m = r + (m − 1)/M).
// Pure functions, no React. Every random draw goes through an injected uniform generator `next()` in [0, 1),
// so a run is reproducible from its seed. Particle sets live in typed arrays (1000–2000 particles at 60 fps).
import { gaussian } from './motion';

// ------------------------------------------------------------------ weights

export function weightTotal(w: ArrayLike<number>, n = w.length): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += w[i];
  return s;
}

/** w̄_i = w_i / Σ w. All-zero (or non-finite) weights fall back to uniform 1/M: no particle is preferred. */
export function normaliseWeights(w: ArrayLike<number>, out: Float64Array = new Float64Array(w.length), n = w.length): Float64Array {
  const s = weightTotal(w, n);
  if (!(s > 0) || !Number.isFinite(s)) {
    for (let i = 0; i < n; i++) out[i] = 1 / n;
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = w[i] / s;
  return out;
}

/** Effective sample size N_eff = 1 / Σ w̄²: M when all weights are equal, 1 when one particle has them all. */
export function effectiveSampleSize(w: ArrayLike<number>, n = w.length): number {
  const s = weightTotal(w, n);
  if (!(s > 0)) return n;
  let q = 0;
  for (let i = 0; i < n; i++) {
    const v = w[i] / s;
    q += v * v;
  }
  return q > 0 ? 1 / q : n;
}

/** Expected number of copies of each particle when M particles are drawn: M w̄_i. */
export function expectedCopies(w: ArrayLike<number>, M = w.length): Float64Array {
  const wn = normaliseWeights(w);
  const out = new Float64Array(wn.length);
  for (let i = 0; i < wn.length; i++) out[i] = M * wn[i];
  return out;
}

/** Running sums of the normalised weights, c_i = w̄_1 + … + w̄_i (the last one is 1). */
export function cumulativeWeights(w: ArrayLike<number>): Float64Array {
  const wn = normaliseWeights(w);
  const c = new Float64Array(wn.length);
  let s = 0;
  for (let i = 0; i < wn.length; i++) {
    s += wn[i];
    c[i] = s;
  }
  if (c.length) c[c.length - 1] = 1;
  return c;
}

// ------------------------------------------------------------------ resampling

/** The M pointers of the low-variance sampler: U_m = r + (m − 1)/M, m = 1 … M. */
export function lowVariancePointers(r: number, M: number): number[] {
  return Array.from({ length: M }, (_, m) => r + m / M);
}

/**
 * Low-variance (systematic) resampling, Thrun Table 4.4. `r` ∈ [0, 1/M) is the one random number; the weights may
 * be unnormalised. Returns, for each new particle m, the index of the old particle it copies. A particle whose
 * interval of the cumulative weights holds k pointers is copied k times, so a particle with weight exactly 1/M is
 * copied exactly once, whatever r is.
 */
export function lowVarianceIndices(w: ArrayLike<number>, r: number, M = w.length, out: Int32Array = new Int32Array(M), n = w.length): Int32Array {
  let W = weightTotal(w, n);
  const uniform = !(W > 0) || !Number.isFinite(W);
  if (uniform) W = n;
  const wi = (i: number) => (uniform ? 1 : w[i]);
  let i = 0;
  let c = wi(0);
  for (let m = 0; m < M; m++) {
    const U = (r + m / M) * W;
    while (U > c && i < n - 1) {
      i++;
      c += wi(i);
    }
    out[m] = i;
  }
  return out;
}

/** Multinomial resampling: M independent draws, each picks particle i with probability w̄_i. */
export function multinomialIndices(w: ArrayLike<number>, next: () => number, M = w.length, out: Int32Array = new Int32Array(M), n = w.length): Int32Array {
  const c = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += Math.max(0, w[i]);
    c[i] = s;
  }
  const uniform = !(s > 0) || !Number.isFinite(s);
  for (let m = 0; m < M; m++) {
    if (uniform) {
      out[m] = Math.min(n - 1, Math.floor(next() * n));
      continue;
    }
    const U = next() * s;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (c[mid] < U) lo = mid + 1;
      else hi = mid;
    }
    out[m] = lo;
  }
  return out;
}

/** How many copies of each old particle an index list makes. */
export function copyCounts(indices: ArrayLike<number>, n: number): Int32Array {
  const k = new Int32Array(n);
  for (let m = 0; m < indices.length; m++) k[indices[m]]++;
  return k;
}

export type ResampleMethod = 'low-variance' | 'multinomial';

// ------------------------------------------------------------------ 2-D particle sets (x, y, θ)

export interface ParticleSet2 {
  /** Particles in use (≤ capacity). */
  n: number;
  x: Float64Array;
  y: Float64Array;
  th: Float64Array;
  /** Importance weights (unnormalised). */
  w: Float64Array;
}

export function makeParticleSet(capacity: number): ParticleSet2 {
  return { n: 0, x: new Float64Array(capacity), y: new Float64Array(capacity), th: new Float64Array(capacity), w: new Float64Array(capacity) };
}

export function cloneParticleSet(s: ParticleSet2): ParticleSet2 {
  return { n: s.n, x: s.x.slice(), y: s.y.slice(), th: s.th.slice(), w: s.w.slice() };
}

/** Spread n particles with poses from `sampler` and equal weights 1/n. */
export function initParticles(s: ParticleSet2, n: number, sampler: (next: () => number) => { x: number; y: number; th: number }, next: () => number): void {
  s.n = Math.min(n, s.x.length);
  for (let i = 0; i < s.n; i++) {
    const p = sampler(next);
    s.x[i] = p.x;
    s.y[i] = p.y;
    s.th[i] = p.th;
    s.w[i] = 1 / s.n;
  }
}

/** Motion command: turn by `turn` (rad), then drive `dist` (m) straight ahead. */
export interface TurnDrive {
  turn: number;
  dist: number;
}

/** Standard deviations of the actuation noise for one command. */
export interface TurnDriveNoise {
  /** Heading noise added to the turn (rad). */
  sTurn: number;
  /** Distance noise (m). */
  sDist: number;
}

/** Noise-free turn-then-drive motion of one pose. */
export function turnDrive(p: { x: number; y: number; th: number }, u: TurnDrive): { x: number; y: number; th: number } {
  const th = p.th + u.turn;
  return { x: p.x + u.dist * Math.cos(th), y: p.y + u.dist * Math.sin(th), th };
}

/**
 * SAMPLE step: every particle draws its own noisy version of the command, x^[m] ~ p(x_t | u_t, x^[m]_{t−1}).
 * The weights are left alone. Without this noise, resampled duplicates would stay stacked on one point forever.
 */
export function sampleMotion(s: ParticleSet2, u: TurnDrive, noise: TurnDriveNoise, next: () => number): void {
  for (let i = 0; i < s.n; i++) {
    const th = s.th[i] + u.turn + noise.sTurn * gaussian(next);
    const d = u.dist + noise.sDist * gaussian(next);
    s.x[i] += d * Math.cos(th);
    s.y[i] += d * Math.sin(th);
    s.th[i] = th;
  }
}

/**
 * WEIGHT step: multiply each weight by the sensor likelihood p(z | x^[m]) (after a resample all weights are equal,
 * so this sets w ∝ p(z | x)). Returns the sum of the likelihoods (its average tracks how well the particles explain z).
 */
export function weightParticles(s: ParticleSet2, lik: (x: number, y: number, th: number) => number): { likSum: number; likMax: number } {
  let likSum = 0;
  let likMax = 0;
  for (let i = 0; i < s.n; i++) {
    const p = lik(s.x[i], s.y[i], s.th[i]);
    likSum += p;
    if (p > likMax) likMax = p;
    s.w[i] *= p;
  }
  return { likSum, likMax };
}

/**
 * RESAMPLE step: draw M = `m` new particles in proportion to the weights (low-variance or multinomial), then give
 * every survivor weight 1/M. `inject` replaces that fraction of the new set with fresh random particles (the fix
 * for a kidnapped robot or particle deprivation). Returns the copy counts of the old particles.
 */
export function resampleParticles(
  s: ParticleSet2,
  method: ResampleMethod,
  next: () => number,
  opts: { m?: number; inject?: number; sampler?: (next: () => number) => { x: number; y: number; th: number } } = {}
): Int32Array {
  const n = s.n;
  const M = Math.min(opts.m ?? n, s.x.length);
  const nInject = opts.sampler ? Math.min(M, Math.max(0, Math.round((opts.inject ?? 0) * M))) : 0;
  const keep = M - nInject;
  const idx = method === 'low-variance' ? lowVarianceIndices(s.w, next() / Math.max(1, keep), keep, new Int32Array(keep), n) : multinomialIndices(s.w, next, keep, new Int32Array(keep), n).sort();
  // Both index lists are now ascending, so the copies of each old particle sit next to each other.
  const counts = copyCounts(idx, n);
  const x = new Float64Array(keep);
  const y = new Float64Array(keep);
  const th = new Float64Array(keep);
  for (let m = 0; m < keep; m++) {
    x[m] = s.x[idx[m]];
    y[m] = s.y[idx[m]];
    th[m] = s.th[idx[m]];
  }
  for (let m = 0; m < keep; m++) {
    s.x[m] = x[m];
    s.y[m] = y[m];
    s.th[m] = th[m];
  }
  for (let m = keep; m < M; m++) {
    const p = opts.sampler!(next);
    s.x[m] = p.x;
    s.y[m] = p.y;
    s.th[m] = p.th;
  }
  s.n = M;
  for (let m = 0; m < M; m++) s.w[m] = 1 / M;
  return counts;
}

/** Weighted mean pose (circular mean for θ) — misleading for a multimodal belief, which is the point. */
export function weightedMean(s: ParticleSet2): { x: number; y: number; th: number } {
  const W = weightTotal(s.w, s.n) || 1;
  let x = 0;
  let y = 0;
  let c = 0;
  let sn = 0;
  for (let i = 0; i < s.n; i++) {
    const w = s.w[i] / W;
    x += w * s.x[i];
    y += w * s.y[i];
    c += w * Math.cos(s.th[i]);
    sn += w * Math.sin(s.th[i]);
  }
  return { x, y, th: Math.atan2(sn, c) };
}
