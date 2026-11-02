// Pure model behind the EKF simulation: push a Gaussian through a nonlinear function (Monte Carlo truth vs the
// EKF's tangent-line Gaussian), and correct a Gaussian with a range reading to a beacon beside the rail (exact
// grid posterior vs the EKF update). Closed-form moments make the bias and variance error exact, not noisy.
import { ekf1Update } from '../../../core/filters_kalman';
import { gaussian } from '../../../core/motion';
import { mulberry32 } from '../../../engine/rng';

// ------------------------------------------------------------------ prediction through g

export type FnId = 'curve' | 'sin';

/** Step length for the heading example (m). */
export const SIN_D = 2;

export interface FnSpec {
  id: FnId;
  /** Input axis range. */
  x: [number, number];
  /** Output axis range. */
  y: [number, number];
  g: (x: number, k: number) => number;
  dg: (x: number, k: number) => number;
}

export const FNS: Record<FnId, FnSpec> = {
  curve: {
    id: 'curve',
    x: [-4, 4],
    y: [-4, 9],
    g: (x, k) => x + k * x * x,
    dg: (x, k) => 1 + 2 * k * x,
  },
  sin: {
    id: 'sin',
    x: [-Math.PI, Math.PI],
    y: [-2.6, 2.6],
    g: (x) => SIN_D * Math.sin(x),
    dg: (x) => SIN_D * Math.cos(x),
  },
};

export interface Moments {
  mean: number;
  std: number;
}

/** The EKF's linearised result: mean g(μ), standard deviation |g′(μ)| σ. */
export function ekfMoments(fn: FnId, mu: number, s: number, k: number): Moments & { G: number } {
  const f = FNS[fn];
  const G = f.dg(mu, k);
  return { mean: f.g(mu, k), std: Math.abs(G) * s, G };
}

/**
 * Exact moments of g(x) for x ~ N(μ, σ²).
 *   curve: E = μ + κ(μ² + σ²), Var = (1 + 2κμ)²σ² + 2κ²σ⁴  (so the EKF's bias is exactly κσ²)
 *   sin:   E = d sin μ e^{−σ²/2}, E[sin²] = (1 − cos 2μ e^{−2σ²})/2
 */
export function trueMoments(fn: FnId, mu: number, s: number, k: number): Moments {
  const s2 = s * s;
  if (fn === 'curve') {
    const G = 1 + 2 * k * mu;
    return { mean: mu + k * (mu * mu + s2), std: Math.sqrt(G * G * s2 + 2 * k * k * s2 * s2) };
  }
  const m1 = Math.sin(mu) * Math.exp(-s2 / 2);
  const m2 = (1 - Math.cos(2 * mu) * Math.exp(-2 * s2)) / 2;
  return { mean: SIN_D * m1, std: SIN_D * Math.sqrt(Math.max(0, m2 - m1 * m1)) };
}

/** Fixed standard-normal draws, so moving a slider morphs the same Monte Carlo cloud instead of re-rolling it. */
export function normals(n: number, seed = 4202): Float64Array {
  const next = mulberry32(seed);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = gaussian(next);
  return out;
}

/**
 * Histogram density of g(μ + σε) over [lo, hi] with `bins` bins; also the sample mean and standard deviation
 * (over all samples) and the fraction that fell outside the range.
 */
export function mcHistogram(fn: FnId, mu: number, s: number, k: number, eps: Float64Array, lo: number, hi: number, bins: number): { dens: Float64Array; mean: number; std: number; outside: number } {
  const f = FNS[fn];
  const counts = new Float64Array(bins);
  const w = (hi - lo) / bins;
  let sum = 0;
  let sum2 = 0;
  let out = 0;
  for (let i = 0; i < eps.length; i++) {
    const y = f.g(mu + s * eps[i], k);
    sum += y;
    sum2 += y * y;
    const b = Math.floor((y - lo) / w);
    if (b >= 0 && b < bins) counts[b]++;
    else out++;
  }
  const n = eps.length;
  const mean = sum / n;
  const dens = counts.map((c) => c / (n * w));
  return { dens, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), outside: out / n };
}

/** Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9), for evenly spread rays. */
export function probit(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ------------------------------------------------------------------ correction with a range reading

/** Range from a robot at x on the rail to a beacon at (0, b): h(x) = √(x² + b²). */
export const rangeH = (x: number, b: number) => Math.sqrt(x * x + b * b);
export const rangeDH = (x: number, b: number) => x / Math.sqrt(x * x + b * b);

export interface RangeIn {
  /** Predicted mean on the rail (m). */
  mu: number;
  /** Predicted standard deviation (m). */
  s: number;
  /** Beacon's lateral offset from the rail (m). */
  b: number;
  /** Measured range (m). */
  z: number;
  /** Sensor noise variance (m²). */
  Q: number;
}

export const RANGE_X: [number, number] = [-8, 8];

export interface RangeOut {
  xs: Float64Array;
  prior: Float64Array;
  /** p(z | x) as a function of x (not a density in x). */
  lik: Float64Array;
  /** Exact posterior density on the grid. */
  post: Float64Array;
  /** EKF posterior density N(μ, σ²) on the grid. */
  ekf: Float64Array;
  /** The EKF's linearised likelihood N(z; h(μ̄) + H(x − μ̄), Q) as a function of x. */
  linLik: Float64Array;
  ekfMu: number;
  ekfS2: number;
  H: number;
  K: number;
  truthMean: number;
  truthStd: number;
  /** Local maxima of the exact posterior above 10 % of its peak. */
  modes: number[];
  /** Where the circle of radius z around the beacon cuts the rail (±√(z² − b²)), if it does. */
  cut: number | null;
}

export function rangeUpdate(p: RangeIn, n = 800): RangeOut {
  const [x0, x1] = RANGE_X;
  const xs = new Float64Array(n + 1);
  const prior = new Float64Array(n + 1);
  const lik = new Float64Array(n + 1);
  const post = new Float64Array(n + 1);
  const ekf = new Float64Array(n + 1);
  const linLik = new Float64Array(n + 1);
  const s2 = p.s * p.s;
  const dx = (x1 - x0) / n;
  const u = ekf1Update(p.mu, s2, p.z, (x) => rangeH(x, p.b), (x) => rangeDH(x, p.b), p.Q);
  const hm = rangeH(p.mu, p.b);
  let Z = 0;
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * dx;
    xs[i] = x;
    prior[i] = Math.exp(-((x - p.mu) ** 2) / (2 * s2)) / Math.sqrt(2 * Math.PI * s2);
    const r = rangeH(x, p.b);
    lik[i] = Math.exp(-((p.z - r) ** 2) / (2 * p.Q)) / Math.sqrt(2 * Math.PI * p.Q);
    linLik[i] = Math.exp(-((p.z - hm - u.H * (x - p.mu)) ** 2) / (2 * p.Q)) / Math.sqrt(2 * Math.PI * p.Q);
    post[i] = prior[i] * lik[i];
    Z += post[i] * dx;
    ekf[i] = Math.exp(-((x - u.mu) ** 2) / (2 * u.s2)) / Math.sqrt(2 * Math.PI * u.s2);
  }
  let m = 0;
  let m2 = 0;
  let peak = 0;
  if (Z > 0) {
    for (let i = 0; i <= n; i++) {
      post[i] /= Z;
      m += xs[i] * post[i] * dx;
      m2 += xs[i] * xs[i] * post[i] * dx;
      peak = Math.max(peak, post[i]);
    }
  }
  const modes: number[] = [];
  for (let i = 1; i < n; i++) if (post[i] >= post[i - 1] && post[i] > post[i + 1] && post[i] > 0.1 * peak) modes.push(xs[i]);
  const cut = p.z > p.b ? Math.sqrt(p.z * p.z - p.b * p.b) : null;
  return { xs, prior, lik, post, ekf, linLik, ekfMu: u.mu, ekfS2: u.s2, H: u.H, K: u.K, truthMean: m, truthStd: Math.sqrt(Math.max(0, m2 - m * m)), modes, cut };
}
