// 1-D corridor localisation: the classic "robot in a corridor with doors" histogram filter (a discrete Bayes
// filter, summary notes §1). Cells are 0 … n−1 from left to right and the robot is always commanded to move
// one cell to the right. Pure functions, no React; used by the corridor simulation, the bayes-predict-correct
// generator and the self-tests.
import { bayesUpdate, type BayesTable } from './prob';

/** Where the robot really ends up when told to move one cell right: short (stays), exact (1 cell), long (2 cells). */
export interface MotionNoise {
  under: number;
  exact: number;
  over: number;
}

/** 'loop': the corridor is a ring (leaving on the right re-enters on the left). 'wall': the robot stops at the end. */
export type CorridorEnds = 'loop' | 'wall';

/** One motion outcome: shift by d cells with probability p. */
export interface Shift {
  d: number;
  p: number;
}

/** The three outcomes of "move right one cell", in the order under, exact, over. */
export function shiftsOf(m: MotionNoise): Shift[] {
  return [
    { d: 0, p: m.under },
    { d: 1, p: m.exact },
    { d: 2, p: m.over },
  ];
}

/** Destination of cell i moved by d cells. At a wall the robot stops at the last cell. */
export function shiftCell(i: number, d: number, n: number, ends: CorridorEnds): number {
  if (ends === 'loop') return (((i + d) % n) + n) % n;
  return Math.max(0, Math.min(n - 1, i + d));
}

export interface CorridorPredict {
  /** The predicted belief bel⁻(x_t). */
  bel: number[];
  shifts: Shift[];
  /** layers[k][i] = bel(x_{t−1} = i) · p_k: the piece of cell i's probability that takes outcome k. */
  layers: number[][];
  /** dest[k][i]: where that piece lands. */
  dest: number[][];
}

/**
 * Prediction (actuation): bel⁻(x_t) = Σ_{x_{t−1}} p(x_t | u_t, x_{t−1}) bel(x_{t−1}).
 * Each cell's probability splits into one piece per outcome; pieces landing on the same cell add.
 */
export function predictCorridor(bel: readonly number[], shifts: readonly Shift[], ends: CorridorEnds): CorridorPredict {
  const n = bel.length;
  const out = new Array<number>(n).fill(0);
  const layers = shifts.map(() => new Array<number>(n).fill(0));
  const dest = shifts.map(() => new Array<number>(n).fill(0));
  shifts.forEach((s, k) => {
    for (let i = 0; i < n; i++) {
      const to = shiftCell(i, s.d, n, ends);
      const mass = bel[i] * s.p;
      layers[k][i] = mass;
      dest[k][i] = to;
      out[to] += mass;
    }
  });
  return { bel: out, shifts: shifts.slice(), layers, dest };
}

/** Door sensor: hit = P(z = door | at a door), falseAlarm = P(z = door | at a wall). */
export interface DoorSensor {
  hit: number;
  falseAlarm: number;
}

export type DoorReading = 'door' | 'wall';

/** P(z | x) for every cell: the likelihood column of the observed reading. Each sensor-table row sums to 1. */
export function doorLikelihood(doors: readonly boolean[], z: DoorReading, s: DoorSensor): number[] {
  return doors.map((isDoor) => (z === 'door' ? (isDoor ? s.hit : s.falseAlarm) : isDoor ? 1 - s.hit : 1 - s.falseAlarm));
}

/** Correction (measurement): bel(x) = η p(z | x) bel⁻(x), with the full hand table. */
export function correctCorridor(bel: readonly number[], doors: readonly boolean[], z: DoorReading, s: DoorSensor): BayesTable {
  return bayesUpdate(bel, doorLikelihood(doors, z, s));
}

// ------------------------------------------------------------------ how uncertain is a belief?

/** Shannon entropy in bits, −Σ p log₂ p (0 = certain; log₂ n = uniform over n cells). */
export function entropyBits(p: readonly number[]): number {
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log2(x);
  return h;
}

/** 2^H: the belief is as uncertain as a uniform spread over this many cells. */
export function effectiveCells(p: readonly number[]): number {
  return Math.pow(2, entropyBits(p));
}

export function argmax(p: readonly number[]): number {
  let k = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[k]) k = i;
  return k;
}

/**
 * Number of separate bumps: runs of neighbouring cells whose probability is at least `frac` × the maximum
 * (a run may wrap round the end of a looped corridor). A uniform belief counts as 0 bumps.
 */
export function countModes(p: readonly number[], frac = 0.3, loop = true): number {
  const n = p.length;
  if (!n) return 0;
  const mx = Math.max(...p);
  const mn = Math.min(...p);
  if (mx <= 0 || mx - mn < 1e-9 * Math.max(mx, 1e-12)) return 0;
  const on = p.map((x) => x >= frac * mx);
  let runs = 0;
  for (let i = 0; i < n; i++) if (on[i] && !on[i === 0 ? n - 1 : i - 1]) runs++;
  if (!loop && on[0] && on[n - 1]) runs++; // the wrap-round test above joined the two ends; a wall separates them
  if (runs === 0 && on.every(Boolean)) return 1;
  return runs;
}

// ------------------------------------------------------------------ sampling the hidden robot

/** Index k with probability probs[k], from a uniform number u in [0, 1). */
export function sampleIndex(u: number, probs: readonly number[]): number {
  let acc = 0;
  for (let k = 0; k < probs.length; k++) {
    acc += probs[k];
    if (u < acc) return k;
  }
  return probs.length - 1;
}

/** The true move (0, 1 or 2 cells) for a uniform number u. */
export function sampleMove(u: number, m: MotionNoise): number {
  return shiftsOf(m)[sampleIndex(u, [m.under, m.exact, m.over])].d;
}

/** What the door sensor reports at a door or a wall, for a uniform number u. */
export function sampleReading(u: number, atDoor: boolean, s: DoorSensor): DoorReading {
  const pDoor = atDoor ? s.hit : s.falseAlarm;
  return u < pDoor ? 'door' : 'wall';
}

/** Uniform belief over n cells. */
export function uniform(n: number): number[] {
  return new Array<number>(n).fill(1 / n);
}
