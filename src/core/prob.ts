// Discrete probability and the Bayes filter, as used by hand in the exam (summary notes §1 and §4).
// Pure functions, no React. Probabilities are plain numbers in [0, 1].

/** Scale a non-negative vector to sum to 1. Returns all zeros if the sum is 0. */
export function normalize(p: readonly number[]): number[] {
  const s = p.reduce((a, b) => a + b, 0);
  return s > 0 ? p.map((x) => x / s) : p.map(() => 0);
}

/** Σ f(x) P(x): expected value of f under the belief P (e.g. grasp success over fruit types). */
export function expectation(p: readonly number[], f: readonly number[]): number {
  return p.reduce((t, pi, i) => t + pi * f[i], 0);
}

/** The columns of the hand-worked correction table: prior × likelihood = product; product / Σ = posterior. */
export interface BayesTable {
  prior: number[];
  likelihood: number[];
  product: number[];
  /** Σ product = P(z), the evidence (the normaliser is η = 1/P(z)). */
  evidence: number;
  posterior: number[];
}

/** One correction step: bel(x) = η p(z | x) bel⁻(x). */
export function bayesUpdate(prior: readonly number[], likelihood: readonly number[]): BayesTable {
  const product = prior.map((p, i) => p * likelihood[i]);
  const evidence = product.reduce((a, b) => a + b, 0);
  const posterior = evidence > 0 ? product.map((x) => x / evidence) : product.map(() => 0);
  return { prior: prior.slice(), likelihood: likelihood.slice(), product, evidence, posterior };
}

/** Several measurements in a row (no motion between them): each posterior becomes the next prior. */
export function bayesSequence(prior: readonly number[], likelihoods: readonly (readonly number[])[]): BayesTable[] {
  const out: BayesTable[] = [];
  let p = prior.slice();
  for (const l of likelihoods) {
    const t = bayesUpdate(p, l);
    out.push(t);
    p = t.posterior;
  }
  return out;
}

/**
 * Likelihood column for an observed class from a confusion table.
 * `table[trueState][detected]` = P(detected | trueState); returns P(z = detected | x) for every x.
 */
export function likelihoodColumn(table: readonly (readonly number[])[], detected: number): number[] {
  return table.map((row) => row[detected]);
}

/**
 * Prediction step on a discrete state space: bel⁻(x') = Σ_x p(x' | u, x) bel(x).
 * `move(i)` lists where state i can go and with what probability (the probabilities should sum to 1).
 */
export function discretePredict(belief: readonly number[], move: (from: number) => readonly (readonly [number, number])[]): number[] {
  const out = new Array<number>(belief.length).fill(0);
  belief.forEach((b, i) => {
    if (b === 0) return;
    for (const [to, p] of move(i)) if (to >= 0 && to < out.length) out[to] += p * b;
  });
  return out;
}

// ------------------------------------------------------------------ binary (occupancy) Bayes filter

/** Forward sensor model of a binary detector: tp = P(z = occupied | m), tn = P(z = free | ¬m). */
export interface BinarySensor {
  tp: number;
  tn: number;
}

export type BinaryReading = 'occ' | 'free';

/** P(z | m) and P(z | ¬m) for one reading. Each row of the sensor table sums to 1. */
export function binaryLikelihoods(z: BinaryReading, s: BinarySensor): { pzGivenM: number; pzGivenNotM: number } {
  return z === 'occ' ? { pzGivenM: s.tp, pzGivenNotM: 1 - s.tn } : { pzGivenM: 1 - s.tp, pzGivenNotM: s.tn };
}

/**
 * Occupancy update by Bayes' rule:
 * p(m | z) = p(z | m) p(m) / (p(z | m) p(m) + p(z | ¬m) p(¬m)).
 */
export function occupancyUpdate(p: number, z: BinaryReading, s: BinarySensor): number {
  const { pzGivenM, pzGivenNotM } = binaryLikelihoods(z, s);
  const num = pzGivenM * p;
  const den = num + pzGivenNotM * (1 - p);
  return den > 0 ? num / den : p;
}

/** Run a sequence of readings from a prior; returns every intermediate probability (length = readings + 1). */
export function occupancySequence(prior: number, readings: readonly BinaryReading[], s: BinarySensor): number[] {
  const out = [prior];
  let p = prior;
  for (const z of readings) {
    p = occupancyUpdate(p, z, s);
    out.push(p);
  }
  return out;
}

/** Log-odds l = ln(p / (1 − p)). p = 0.5 gives 0; p = 0 or 1 gives ∓∞ (the cell can never change). */
export function logOdds(p: number): number {
  return Math.log(p / (1 - p));
}

/** p = 1 − 1 / (1 + eˡ). */
export function fromLogOdds(l: number): number {
  return 1 - 1 / (1 + Math.exp(l));
}

/** Likelihood ratio p(z | m) / p(z | ¬m): how strong a reading is as evidence (14 for OCC at TP 0.7, FP 0.05). */
export function likelihoodRatio(z: BinaryReading, s: BinarySensor): number {
  const { pzGivenM, pzGivenNotM } = binaryLikelihoods(z, s);
  return pzGivenM / pzGivenNotM;
}

/**
 * Inverse sensor model p(m | z) computed with the uninformative prior 0.5, as on the review slides
 * (e.g. TP 0.85, TN 0.99 gives p(m | occ) = 0.9884 and p(m | free) = 0.1316).
 */
export function inverseSensor(z: BinaryReading, s: BinarySensor): number {
  return occupancyUpdate(0.5, z, s);
}

/**
 * Log-odds update l_t = l_{t−1} + ln(p(m | z_t) / (1 − p(m | z_t))) − l₀, with l₀ the log-odds of the prior.
 * Additive form of occupancyUpdate (identical results when the prior is 0.5).
 */
export function logOddsUpdate(l: number, z: BinaryReading, s: BinarySensor, l0 = 0): number {
  return l + logOdds(inverseSensor(z, s)) - l0;
}
