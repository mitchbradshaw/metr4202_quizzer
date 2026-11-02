// which-filter model: a few target beliefs on a 10 m corridor (mixtures of Gaussians), the one Gaussian a KF or
// EKF would carry (moment-matched: the same mean and variance, the best any single Gaussian can do), and a particle
// set drawn from the belief (what a PF carries), plus the numbers the simulation shows: how much of the true shape
// each representation captures, how likely the Gaussian's mean is, and which hypotheses hold no particle.
// Pure module (no React).
import { mulberry32 } from '../../../engine/rng';

export type ShapeId = 'one' | 'skew' | 'two' | 'rare' | 'doors';

export interface Comp {
  /** Weight (the weights of a shape sum to 1). */
  w: number;
  /** Centre (m). */
  mu: number;
  /** Standard deviation (m). */
  s: number;
}

export interface Shape {
  id: ShapeId;
  /** Short label for the selector. */
  label: string;
  title: string;
  comps: Comp[];
  /** Where a belief like this comes from (Rich). */
  story: string;
}

export const X0 = 0;
export const X1 = 10;
/** Largest particle count offered; draws are nested, so M particles are the first M of this many. */
export const M_MAX = 2000;
export const BINS = 40;
export const BIN_W = (X1 - X0) / BINS;

export const SHAPES: Record<ShapeId, Shape> = {
  one: {
    id: 'one',
    label: '1 bump',
    title: 'One bump',
    comps: [{ w: 1, mu: 4.5, s: 0.5 }],
    story: 'Tracking from a known start with a linear model: the belief stays **one Gaussian bump**.',
  },
  skew: {
    id: 'skew',
    label: 'lopsided',
    title: 'Lopsided',
    comps: [
      { w: 0.6, mu: 3.3, s: 0.45 },
      { w: 0.4, mu: 4.8, s: 1.05 },
    ],
    story: 'After a nonlinear step (a turn by an uncertain angle, a non-Gaussian sensor) the belief is **one lopsided bump**: a Gaussian is a fair approximation, not an exact one.',
  },
  two: {
    id: 'two',
    label: '2 doors',
    title: 'Two identical doors',
    comps: [
      { w: 0.5, mu: 2.5, s: 0.4 },
      { w: 0.5, mu: 7.5, s: 0.4 },
    ],
    story: 'Two identical doors and the robot has just seen a door: it is at one of them, **never between them**.',
  },
  rare: {
    id: 'rare',
    label: '1 rare',
    title: 'Three hypotheses, one rare',
    comps: [
      { w: 0.6, mu: 2.2, s: 0.45 },
      { w: 0.3, mu: 5.8, s: 0.45 },
      { w: 0.1, mu: 8.6, s: 0.3 },
    ],
    story: 'Three places fit the readings, with probabilities 0.6, 0.3 and **0.1**. The rare one may well be the truth (a kidnapped robot, a wrong data association).',
  },
  doors: {
    id: 'doors',
    label: '4 doors',
    title: 'Four look-alike doors',
    comps: [
      { w: 0.25, mu: 1.5, s: 0.35 },
      { w: 0.25, mu: 4.0, s: 0.35 },
      { w: 0.25, mu: 6.5, s: 0.35 },
      { w: 0.25, mu: 9.0, s: 0.35 },
    ],
    story: 'Global localisation in a corridor with four look-alike doors, just after seeing one: **four equal bumps**.',
  },
};

export const SHAPE_IDS: ShapeId[] = ['one', 'skew', 'two', 'rare', 'doors'];

const SQ2PI = Math.sqrt(2 * Math.PI);

export function normalPdf(x: number, mu: number, s2: number): number {
  const d = x - mu;
  return Math.exp((-d * d) / (2 * s2)) / (SQ2PI * Math.sqrt(s2));
}

/** True belief bel(x) of a shape (1/m). */
export function density(sh: Shape, x: number): number {
  let p = 0;
  for (const c of sh.comps) p += c.w * normalPdf(x, c.mu, c.s * c.s);
  return p;
}

/** The best single Gaussian (same mean and variance as the mixture): what a KF or EKF can hold at most. */
export function momentMatch(sh: Shape): { mu: number; s2: number } {
  let mu = 0;
  let m2 = 0;
  for (const c of sh.comps) {
    mu += c.w * c.mu;
    m2 += c.w * (c.s * c.s + c.mu * c.mu);
  }
  return { mu, s2: m2 - mu * mu };
}

/** n + 1 samples of f over [X0, X1]. */
export function curve(f: (x: number) => number, n = 400): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(n + 1);
  const y = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    x[i] = X0 + ((X1 - X0) * i) / n;
    y[i] = f(x[i]);
  }
  return { x, y };
}

/**
 * M_MAX particles drawn from the belief (component by weight, then a Gaussian draw), clamped to the corridor.
 * Nested: the first M of them are a valid M-particle set, so sliding M up only adds particles.
 */
export function drawParticles(sh: Shape, seed: number, n = M_MAX): Float64Array {
  const r = mulberry32(seed);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let u = r();
    let k = 0;
    while (k < sh.comps.length - 1 && u >= sh.comps[k].w) {
      u -= sh.comps[k].w;
      k++;
    }
    const c = sh.comps[k];
    const z = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    out[i] = Math.max(X0, Math.min(X1, c.mu + c.s * z));
  }
  return out;
}

/** Histogram density of the first M particles (BINS bins over the corridor): count / (M · bin width). */
export function histogram(p: Float64Array, M: number): Float64Array {
  const h = new Float64Array(BINS);
  for (let i = 0; i < M; i++) {
    const b = Math.min(BINS - 1, Math.max(0, Math.floor((p[i] - X0) / BIN_W)));
    h[b] += 1;
  }
  for (let b = 0; b < BINS; b++) h[b] /= M * BIN_W;
  return h;
}

/** Shared area ∫ min(p, q) dx (1 = the same shape, 0 = no overlap), on a fine grid. */
export function overlap(p: (x: number) => number, q: (x: number) => number, n = 1000): number {
  const dx = (X1 - X0) / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = X0 + (i + 0.5) * dx;
    s += Math.min(p(x), q(x)) * dx;
  }
  return s;
}

/** The histogram as a function of x. */
export function histFn(h: Float64Array): (x: number) => number {
  return (x) => h[Math.min(BINS - 1, Math.max(0, Math.floor((x - X0) / BIN_W)))];
}

/** Particles within 2.5 σ of each component's centre (a hypothesis with 0 is lost to the filter). */
export function modeCounts(sh: Shape, p: Float64Array, M: number): number[] {
  return sh.comps.map((c) => {
    let k = 0;
    for (let i = 0; i < M; i++) if (Math.abs(p[i] - c.mu) <= 2.5 * c.s) k++;
    return k;
  });
}

/** Peak of the true belief (grid search). */
export function peak(sh: Shape): number {
  let m = 0;
  for (let i = 0; i <= 1000; i++) m = Math.max(m, density(sh, X0 + ((X1 - X0) * i) / 1000));
  return m;
}

/** First seed (from `from`) whose first M particles satisfy `ok`, e.g. "the rare hypothesis got no particle". */
export function findSeed(sh: Shape, M: number, ok: (counts: number[]) => boolean, from = 1, tries = 400): number {
  for (let s = from; s < from + tries; s++) if (ok(modeCounts(sh, drawParticles(sh, s, M), M))) return s;
  return from;
}

export interface FitStats {
  gauss: { mu: number; s2: number };
  /** ∫ min(bel, Gaussian). */
  gaussMatch: number;
  /** ∫ min(bel, particle histogram). */
  pfMatch: number;
  /** bel(μ) / max bel: how plausible the Gaussian's best guess is under the true belief. */
  atMean: number;
  counts: number[];
  hist: Float64Array;
}

export function fitStats(sh: Shape, parts: Float64Array, M: number): FitStats {
  const gauss = momentMatch(sh);
  const bel = (x: number) => density(sh, x);
  const hist = histogram(parts, M);
  return {
    gauss,
    gaussMatch: overlap(bel, (x) => normalPdf(x, gauss.mu, gauss.s2)),
    pfMatch: overlap(bel, histFn(hist)),
    atMean: density(sh, gauss.mu) / peak(sh),
    counts: modeCounts(sh, parts, M),
    hist,
  };
}
