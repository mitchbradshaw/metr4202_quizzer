// One occupancy cell, reading by reading (summary notes §4; 2023 Q31; review deck slides 9-13; 2025 Q22).
// Pure functions, no React. Builds the hand-calculation table (Bayes form and log-odds form side by side) on
// top of core/prob.ts. Probabilities are plain numbers in [0, 1]; log-odds may be ±Infinity for p = 1 / 0.
import { binaryLikelihoods, fromLogOdds, logOdds, occupancyUpdate, type BinaryReading, type BinarySensor } from './prob';

export type { BinaryReading, BinarySensor } from './prob';

/** One row of the reading-by-reading table. */
export interface OccRow {
  /** Reading number, 1-based. */
  t: number;
  z: BinaryReading;
  /** p(z_t | m) and p(z_t | ¬m): the column of the sensor table for the observed reading. */
  pzm: number;
  pznm: number;
  /** Prior for this step, p(m | z_1:t-1). */
  prior: number;
  /** Bayes numerator p(z_t | m) p(m | z_1:t-1) and evidence (numerator + p(z_t | ¬m) p(¬m | z_1:t-1)). */
  num: number;
  den: number;
  /** Posterior p(m | z_1:t). */
  post: number;
  /** Likelihood ratio p(z_t | m) / p(z_t | ¬m): how many times more likely this reading is if the cell is occupied. */
  lr: number;
  /** ln of the likelihood ratio: the amount this reading adds to the log-odds. */
  dl: number;
  /** Inverse sensor model p(m | z_t) computed with the prior p0 of the map (0.5 on the review slides). */
  ism: number;
  /** Log-odds before and after. */
  lPrev: number;
  l: number;
}

/** Likelihood ratio of a reading: OCC gives TP / (1 − TN), FREE gives (1 − TP) / TN. */
export function readingLR(z: BinaryReading, s: BinarySensor): number {
  const { pzGivenM, pzGivenNotM } = binaryLikelihoods(z, s);
  return pzGivenM / pzGivenNotM;
}

/** ln LR: the fixed step this reading adds to the log-odds, whatever the cell's current belief. */
export function readingStep(z: BinaryReading, s: BinarySensor): number {
  return Math.log(readingLR(z, s));
}

/** Inverse sensor model p(m | z) for the prior p0: the posterior from this one reading alone. */
export function inverseSensorWithPrior(z: BinaryReading, s: BinarySensor, p0: number): number {
  return occupancyUpdate(p0, z, s);
}

/**
 * Course log-odds update with a general prior p0:
 *   l_t = l_{t-1} + ln[p(m | z_t) / (1 − p(m | z_t))] − l_0,
 * where the inverse sensor model p(m | z_t) is computed with the SAME prior p0 (so the l_0 it contains cancels).
 * Equals l_{t-1} + ln LR(z_t). (core/prob.ts logOddsUpdate is only right for p0 = 0.5: it builds the inverse sensor
 * model with 0.5 and still subtracts l0.)
 */
export function logOddsStep(lPrev: number, z: BinaryReading, s: BinarySensor, p0 = 0.5): number {
  if (p0 <= 0 || p0 >= 1) return lPrev; // l0 = ∓∞: nothing finite moves it
  return lPrev + logOdds(inverseSensorWithPrior(z, s, p0)) - logOdds(p0);
}

/** The full table for a sequence of readings from the prior p0 (works for p0 = 0 and 1: nothing ever changes). */
export function occupancyTable(p0: number, readings: readonly BinaryReading[], s: BinarySensor): OccRow[] {
  const rows: OccRow[] = [];
  let p = p0;
  let l = logOdds(p0);
  readings.forEach((z, k) => {
    const { pzGivenM: pzm, pzGivenNotM: pznm } = binaryLikelihoods(z, s);
    const num = pzm * p;
    const den = num + pznm * (1 - p);
    const post = den > 0 ? num / den : p;
    const lr = pzm / pznm;
    const dl = Math.log(lr);
    const lPrev = l;
    l = Number.isFinite(l) ? l + dl : l;
    rows.push({ t: k + 1, z, pzm, pznm, prior: p, num, den, post, lr, dl, ism: inverseSensorWithPrior(z, s, Math.min(1, Math.max(0, p0))), lPrev, l });
    p = post;
  });
  return rows;
}

/** Probability after every reading, starting with p0 (length readings + 1). Same numbers as prob.occupancySequence. */
export function probabilityTrace(p0: number, readings: readonly BinaryReading[], s: BinarySensor): number[] {
  return [p0, ...occupancyTable(p0, readings, s).map((r) => r.post)];
}

/** Log-odds after every reading (length readings + 1); ∓Infinity stays ∓Infinity. */
export function logOddsTrace(p0: number, readings: readonly BinaryReading[], s: BinarySensor): number[] {
  return [logOdds(p0), ...occupancyTable(p0, readings, s).map((r) => r.l)];
}

/**
 * How many readings of kind `against` it takes to undo ONE reading of kind `z` (bring the log-odds back to, or
 * past, where it started): ceil(|ln LR(z)| / |ln LR(against)|). Infinity if `against` carries no evidence.
 */
export function readingsToCancel(z: BinaryReading, against: BinaryReading, s: BinarySensor): number {
  const a = Math.abs(readingStep(z, s));
  const b = Math.abs(readingStep(against, s));
  if (b < 1e-12) return Infinity;
  return Math.max(1, Math.ceil(a / b - 1e-9));
}

/** p(m) after k OCC and j FREE readings from p0 (order does not matter: the log-odds just add). */
export function afterCounts(p0: number, k: number, j: number, s: BinarySensor): number {
  if (p0 <= 0 || p0 >= 1) return p0;
  return fromLogOdds(logOdds(p0) + k * readingStep('occ', s) + j * readingStep('free', s));
}

/** Clamp log-odds to [lo, hi] (keeps cells able to change when the world changes). */
export function clampL(l: number, lo: number, hi: number): number {
  return l < lo ? lo : l > hi ? hi : l;
}

export { fromLogOdds, logOdds };
