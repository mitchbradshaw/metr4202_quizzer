// Beam-based range-finder model (summary notes §3 "Sensor models"; Thrun, Burgard & Fox, Probabilistic Robotics
// §6.3, Tables 6.1 and 6.2). One beam with expected range z* (from ray casting the map at the pose) has
//   p(z | x, m) = z_hit p_hit + z_short p_short + z_max p_max + z_rand p_rand,  weights summing to 1, where
//   p_hit   = η N(z; z*, σ_hit²) on [0, z_max]             measurement noise round the true range
//   p_short = η λ e^{−λz} on [0, z*]                        unexpected objects in front (people, clutter)
//   p_max   = point mass at z_max                           missed returns (glass, black or specular surfaces)
//   p_rand  = 1/z_max on [0, z_max)                         unexplained noise (crosstalk, sunlight)
// Each η makes its own component integrate to 1 over its support, so the weighted sum integrates to 1.
// p_max is a point mass; to plot it and to integrate numerically it is a narrow box of width Δ (default
// z_max/200) and height 1/Δ ending at z_max, so readings of exactly z_max (a miss) fall inside it.
//
// "Characterising a sensor": record many readings at a known true range, then fit the weights, σ_hit and λ_short
// by maximum likelihood with expectation maximisation (fitBeam). Units: metres, 1/m for λ.
import { gaussian } from './motion';

export type BeamComp = 'hit' | 'short' | 'max' | 'rand';
export const BEAM_COMPS: readonly BeamComp[] = ['hit', 'short', 'max', 'rand'];

export interface BeamWeights {
  hit: number;
  short: number;
  max: number;
  rand: number;
}

export interface BeamParams {
  /** Expected range z* (m): what the beam would read with a perfect sensor (ray cast in the map). */
  zStar: number;
  /** Maximum range z_max (m). */
  zMax: number;
  /** σ_hit (m): spread of correct readings round z*. */
  sigma: number;
  /** λ_short (1/m): how quickly the chance of an unexpected object falls off with range. */
  lambda: number;
  /** Mixing weights (z_hit, z_short, z_max, z_rand); normalised before use. */
  w: BeamWeights;
  /** Width of the box that stands for the z_max point mass (m); default z_max/200. */
  spike?: number;
}

/** Weights divided by their sum (all zero -> equal weights). */
export function normaliseWeights(w: BeamWeights): BeamWeights {
  const s = w.hit + w.short + w.max + w.rand;
  if (!(s > 0)) return { hit: 0.25, short: 0.25, max: 0.25, rand: 0.25 };
  return { hit: w.hit / s, short: w.short / s, max: w.max / s, rand: w.rand / s };
}

// ------------------------------------------------------------------ the standard normal

/** erf(x) from the Numerical Recipes Chebyshev fit of erfc (fractional error < 1.2e-7 everywhere). */
export function erf(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? 1 - r : r - 1;
}

/** Φ(x), the standard normal CDF. */
export const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

/** N(x; μ, σ²). */
export function normPdf(x: number, mu: number, sigma: number): number {
  const u = (x - mu) / sigma;
  return Math.exp(-0.5 * u * u) / (sigma * Math.sqrt(2 * Math.PI));
}

// ------------------------------------------------------------------ the four components (unweighted densities)

/** η_hit = 1 / ∫₀^{z_max} N(z; z*, σ²) dz: rescales the Gaussian truncated to the sensor's range. */
export function hitNorm(zStar: number, sigma: number, zMax: number): number {
  const mass = normCdf((zMax - zStar) / sigma) - normCdf((0 - zStar) / sigma);
  return mass > 1e-300 ? 1 / mass : Infinity;
}

/** η_short = 1 / (1 − e^{−λ z*}): the exponential is cut off at z* (an object can only be in front of the wall). */
export function shortNorm(zStar: number, lambda: number): number {
  const mass = 1 - Math.exp(-lambda * zStar);
  return mass > 1e-300 ? 1 / mass : Infinity;
}

export const spikeWidth = (p: Pick<BeamParams, 'zMax' | 'spike'>) => p.spike ?? p.zMax / 200;

export function pHit(z: number, p: BeamParams): number {
  if (z < 0 || z > p.zMax) return 0;
  return hitNorm(p.zStar, p.sigma, p.zMax) * normPdf(z, p.zStar, p.sigma);
}

export function pShort(z: number, p: BeamParams): number {
  if (z < 0 || z > p.zStar) return 0;
  return shortNorm(p.zStar, p.lambda) * p.lambda * Math.exp(-p.lambda * z);
}

/** The z_max point mass as a box of width Δ and height 1/Δ ending at z_max. */
export function pMax(z: number, p: BeamParams): number {
  const d = spikeWidth(p);
  return z >= p.zMax - d && z <= p.zMax ? 1 / d : 0;
}

export function pRand(z: number, p: BeamParams): number {
  return z >= 0 && z < p.zMax ? 1 / p.zMax : 0;
}

export type BeamValues = Record<BeamComp, number>;

/** The four unweighted component densities at z. */
export function components(z: number, p: BeamParams): BeamValues {
  return { hit: pHit(z, p), short: pShort(z, p), max: pMax(z, p), rand: pRand(z, p) };
}

/** p(z | x, m) = Σ z_k p_k(z), with the weights normalised. */
export function mixture(z: number, p: BeamParams): number {
  const w = normaliseWeights(p.w);
  const c = components(z, p);
  return w.hit * c.hit + w.short * c.short + w.max * c.max + w.rand * c.rand;
}

/** Each component's share of p(z): which part of the model "explains" this reading. */
export function responsibilities(z: number, p: BeamParams): BeamValues {
  const w = normaliseWeights(p.w);
  const c = components(z, p);
  const e = { hit: w.hit * c.hit, short: w.short * c.short, max: w.max * c.max, rand: w.rand * c.rand };
  const s = e.hit + e.short + e.max + e.rand;
  if (!(s > 0)) return { hit: 0, short: 0, max: 0, rand: 0 };
  return { hit: e.hit / s, short: e.short / s, max: e.max / s, rand: e.rand / s };
}

/** Σ ln p(z_i): the log-likelihood of a set of readings (each floored at 1e-300 so a stray reading is finite). */
export function logLikelihood(zs: ArrayLike<number>, p: BeamParams): number {
  let s = 0;
  for (let i = 0; i < zs.length; i++) s += Math.log(Math.max(1e-300, mixture(zs[i], p)));
  return s;
}

// ------------------------------------------------------------------ sampling (simulated readings)

/** Pick a component by weight, then draw the reading from it. */
export function sampleBeam(p: BeamParams, next: () => number): { z: number; comp: BeamComp } {
  const w = normaliseWeights(p.w);
  const u = next();
  const comp: BeamComp = u < w.hit ? 'hit' : u < w.hit + w.short ? 'short' : u < w.hit + w.short + w.max ? 'max' : 'rand';
  return { z: sampleComponent(comp, p, next), comp };
}

export function sampleComponent(comp: BeamComp, p: BeamParams, next: () => number): number {
  switch (comp) {
    case 'hit': {
      for (let k = 0; k < 64; k++) {
        const z = p.zStar + p.sigma * gaussian(next);
        if (z >= 0 && z <= p.zMax) return z;
      }
      return Math.max(0, Math.min(p.zMax, p.zStar));
    }
    case 'short': {
      // Inverse CDF of the exponential truncated to [0, z*].
      const m = 1 - Math.exp(-p.lambda * p.zStar);
      return -Math.log(1 - next() * m) / p.lambda;
    }
    case 'max':
      return p.zMax;
    case 'rand':
      return next() * p.zMax;
  }
}

// ------------------------------------------------------------------ histogram

export interface Histogram {
  /** Bin edges over [0, z_max): edges.length = bins + 1. */
  edges: number[];
  /** Readings per bin (z < z_max). */
  counts: number[];
  /** Readings of exactly z_max (misses), kept apart from the last bin. */
  atMax: number;
  n: number;
}

export function histogram(zs: ArrayLike<number>, zMax: number, bins: number): Histogram {
  const counts = new Array<number>(bins).fill(0);
  const edges = Array.from({ length: bins + 1 }, (_, i) => (zMax * i) / bins);
  let atMax = 0;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    if (z >= zMax - 1e-9) atMax++;
    else if (z >= 0) counts[Math.min(bins - 1, Math.floor((z / zMax) * bins))]++;
  }
  return { edges, counts, atMax, n: zs.length };
}

// ------------------------------------------------------------------ maximum-likelihood fit (EM)

/**
 * λ for an exponential truncated to [0, a] whose (weighted) mean is m: solves 1/λ − a/(e^{λa} − 1) = m.
 * The left side falls from a/2 (λ → 0, a uniform) to 0, so a mean at or above a/2 gives the smallest λ.
 */
export function truncExpLambda(m: number, a: number): number {
  const LO = 1e-4;
  const HI = 1e3;
  const mean = (l: number) => {
    const la = l * a;
    if (la < 1e-6) return a / 2 - (la * a) / 12;
    return 1 / l - a / Math.expm1(la);
  };
  if (!(m > 0)) return HI;
  if (m >= mean(LO)) return LO;
  if (m <= mean(HI)) return HI;
  let lo = Math.log(LO);
  let hi = Math.log(HI);
  for (let k = 0; k < 80; k++) {
    const mid = 0.5 * (lo + hi);
    if (mean(Math.exp(mid)) > m) lo = mid;
    else hi = mid;
  }
  return Math.exp(0.5 * (lo + hi));
}

export interface EmState {
  params: BeamParams;
  logL: number;
}

/**
 * One EM iteration with z*, z_max and the spike width held fixed.
 * E-step: responsibilities e_ik = z_k p_k(z_i) / p(z_i). M-step: z_k = mean of e_ik;
 * σ_hit² = Σ e_i,hit (z_i − z*)² / Σ e_i,hit (the Gaussian's truncation is ignored, as in Thrun Table 6.2);
 * λ_short from the exact truncated-exponential maximum-likelihood condition (truncExpLambda).
 */
export function emStep(zs: ArrayLike<number>, p: BeamParams): BeamParams {
  const w = normaliseWeights(p.w);
  let sH = 0;
  let sS = 0;
  let sM = 0;
  let sR = 0;
  let sH2 = 0;
  let sSz = 0;
  const n = zs.length;
  for (let i = 0; i < n; i++) {
    const z = zs[i];
    const c = components(z, p);
    const eh = w.hit * c.hit;
    const es = w.short * c.short;
    const em = w.max * c.max;
    const er = w.rand * c.rand;
    const s = eh + es + em + er;
    if (!(s > 0)) continue;
    sH += eh / s;
    sS += es / s;
    sM += em / s;
    sR += er / s;
    sH2 += (eh / s) * (z - p.zStar) * (z - p.zStar);
    sSz += (es / s) * z;
  }
  const tot = sH + sS + sM + sR || 1;
  const sigma = sH > 1e-9 ? Math.max(0.005 * p.zMax, Math.sqrt(sH2 / sH)) : p.sigma;
  const lambda = sS > 1e-9 ? truncExpLambda(sSz / sS, p.zStar) : p.lambda;
  return { ...p, sigma, lambda, w: { hit: sH / tot, short: sS / tot, max: sM / tot, rand: sR / tot } };
}

export interface BeamFit {
  params: BeamParams;
  logL: number;
  iters: number;
  /** The estimate after each iteration (history[0] is the initial guess). */
  history: EmState[];
}

/** Run EM from `init` until the log-likelihood gains less than `tol` per reading (or maxIter). */
export function fitBeam(zs: ArrayLike<number>, init: BeamParams, opts: { maxIter?: number; tol?: number } = {}): BeamFit {
  const maxIter = opts.maxIter ?? 200;
  const tol = opts.tol ?? 1e-7;
  let p: BeamParams = { ...init, w: normaliseWeights(init.w) };
  let L = logLikelihood(zs, p);
  const history: EmState[] = [{ params: p, logL: L }];
  let it = 0;
  for (; it < maxIter; it++) {
    const q = emStep(zs, p);
    const Lq = logLikelihood(zs, q);
    history.push({ params: q, logL: Lq });
    const gain = (Lq - L) / Math.max(1, zs.length);
    p = q;
    L = Lq;
    if (Math.abs(gain) < tol) {
      it++;
      break;
    }
  }
  return { params: p, logL: L, iters: it, history };
}

/** A neutral starting guess for EM: equal-ish weights, σ = 5 % of z_max, λ = 2/z*. */
export function emInitialGuess(zStar: number, zMax: number): BeamParams {
  return { zStar, zMax, sigma: 0.05 * zMax, lambda: 2 / Math.max(0.1, zStar), w: { hit: 0.4, short: 0.2, max: 0.2, rand: 0.2 } };
}
