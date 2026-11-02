// Model behind the Bayes' rule simulation (bayes-rule): a few scenarios (a door sensor, a rare crack with a good
// detector, the 2025 Q28 fruit classifier), the one-step update, the product rule / marginalisation numbers, the
// "two readings" (conditional independence) numbers and natural frequencies. Pure (no React), so the self-tests
// can check every number the simulation and its predictions quote.
import { bayesUpdate, normalize, type BayesTable } from '../../../core/prob';
import { EXAM_2025 } from '../solve/classifier';

export interface RuleScenario {
  id: string;
  label: string;
  /** State names (x), plain text, and as TeX for formulas. */
  states: string[];
  xTex: string[];
  /** Reading names (z) in table-column order, plain text, and as TeX for formulas. */
  readings: string[];
  zTex: string[];
  prior: number[];
  /** table[x][z] = P(z | x); every row sums to 1. */
  table: number[][];
  /** The reading observed at the start. */
  z: number;
  /** The state the formulas are written for at the start. */
  focus: number;
  /** One line on where the numbers come from. */
  note: string;
  /** Whole objects for the natural-frequency sentence ("parts", "cells", "fruit"). */
  things: string;
}

export const RULE_SCENARIOS: RuleScenario[] = [
  {
    id: 'door',
    label: 'Door sensor',
    states: ['door', 'wall'],
    xTex: ['\\text{door}', '\\text{wall}'],
    readings: ['saw door', 'saw wall'],
    zTex: ['\\text{saw door}', '\\text{saw wall}'],
    prior: [0.1, 0.9],
    table: [
      [0.8, 0.2],
      [0.1, 0.9],
    ],
    z: 0,
    focus: 0,
    note: 'A corridor like the next simulation’s: 3 door cells out of 30, so $P(\\text{door}) = 0.1$. This sensor reports a door at 80 % of doors and false-alarms at 10 % of walls.',
    things: 'cells',
  },
  {
    id: 'crack',
    label: 'Rare crack',
    states: ['cracked', 'sound'],
    xTex: ['\\text{cracked}', '\\text{sound}'],
    readings: ['beep', 'silent'],
    zTex: ['\\text{beep}', '\\text{silent}'],
    prior: [0.01, 0.99],
    table: [
      [0.99, 0.01],
      [0.05, 0.95],
    ],
    z: 0,
    focus: 0,
    note: 'A rare event and a good detector: 1 part in 100 is cracked; the detector beeps for 99 % of cracked parts and false-alarms on 5 % of sound ones.',
    things: 'parts',
  },
  {
    id: 'fruit',
    label: 'Fruit classifier (2025 Q28)',
    states: ['Apple', 'Banana', 'None'],
    xTex: ['A', 'B', 'N'],
    readings: ['detects A', 'detects B', 'detects N'],
    zTex: ['z{=}A', 'z{=}B', 'z{=}N'],
    prior: EXAM_2025.prior.slice(),
    table: EXAM_2025.table.map((r) => r.slice()),
    z: 1,
    focus: 1,
    note: 'Table 1 of 2025 Q28 (rows: the true fruit; columns: what the camera reports) and the paper’s belief $P(A) = 0.3$, $P(B) = 0.5$, $P(N) = 0.2$. The first frame reports B.',
    things: 'fruit',
  },
];

export const scenarioById = (id: string) => RULE_SCENARIOS.find((s) => s.id === id) ?? RULE_SCENARIOS[0];

/** Likelihood column P(z | x) for every x. */
export const likOf = (table: readonly (readonly number[])[], z: number) => table.map((row) => row[z]);

/** One correction: posterior ∝ P(z | x) P(x). */
export function ruleUpdate(prior: readonly number[], table: readonly (readonly number[])[], z: number): BayesTable {
  return bayesUpdate(prior, likOf(table, z));
}

/** Set P(x_i) = v and rescale the other states so the prior still sums to 1 (equal split if they were all 0). */
export function setPriorAt(prior: readonly number[], i: number, v: number): number[] {
  const val = Math.max(0, Math.min(1, v));
  const rest = prior.reduce((a, p, k) => (k === i ? a : a + p), 0);
  const n = prior.length;
  return prior.map((p, k) => (k === i ? val : rest > 1e-12 ? (p / rest) * (1 - val) : (1 - val) / (n - 1)));
}

/** Move the boundary between states i and i + 1 to the cumulative position c (0…1); the pair keeps its total. */
export function setBoundary(prior: readonly number[], i: number, c: number): number[] {
  const before = prior.slice(0, i).reduce((a, b) => a + b, 0);
  const pair = prior[i] + prior[i + 1];
  const left = Math.max(0, Math.min(pair, c - before));
  const out = prior.slice();
  out[i] = left;
  out[i + 1] = pair - left;
  return out;
}

/** Set P(z | x) = v in row x and rescale the row's other readings so it still sums to 1. */
export function setLikAt(table: readonly (readonly number[])[], x: number, z: number, v: number): number[][] {
  const val = Math.max(0, Math.min(1, v));
  return table.map((row, k) => {
    if (k !== x) return row.slice();
    const rest = row.reduce((a, p, j) => (j === z ? a : a + p), 0);
    const m = row.length;
    return row.map((p, j) => (j === z ? val : rest > 1e-12 ? (p / rest) * (1 - val) : (1 - val) / (m - 1)));
  });
}

/** The product rule both ways, and the 2024 MCQ distractor, for state x. */
export function productRule(t: BayesTable, x: number) {
  return {
    joint: t.likelihood[x] * t.prior[x], // P(z | x) P(x)
    other: t.posterior[x] * t.evidence, // P(x | z) P(z): the same number
    trap: t.posterior[x] * t.prior[x], // P(x | z) P(x): not a joint probability
  };
}

/**
 * Two readings from the same sensor, z₁ then z₂ (both = z). Given x they are independent (each depends only on x),
 * but without x they are not: the first reading changes the belief about x, so it changes what the second will say.
 * Returns P(z₂ = z) (before any reading) and P(z₂ = z | z₁ = z) = Σ_x P(z | x) P(x | z₁).
 */
export function twoReadings(prior: readonly number[], table: readonly (readonly number[])[], z: number) {
  const lik = likOf(table, z);
  const first = bayesUpdate(prior, lik);
  const marginal = first.evidence;
  const givenFirst = first.posterior.reduce((a, p, i) => a + p * lik[i], 0);
  return { marginal, givenFirst, posterAfterTwo: bayesUpdate(first.posterior, lik).posterior };
}

/** True when z tells nothing about x: P(z | x) is the same for every state with non-zero prior. */
export function independentOfX(prior: readonly number[], table: readonly (readonly number[])[], z: number, tol = 1e-9): boolean {
  const l = likOf(table, z).filter((_, i) => prior[i] > 0);
  return l.every((v) => Math.abs(v - l[0]) <= tol);
}

/** Natural frequencies: of N things, how many are each state and how many of those give reading z. */
export function naturalFrequencies(prior: readonly number[], table: readonly (readonly number[])[], z: number, N = 1000) {
  const counts = prior.map((p) => p * N);
  const hits = counts.map((c, i) => c * table[i][z]);
  const total = hits.reduce((a, b) => a + b, 0);
  return { counts, hits, total, share: normalize(hits) };
}

/** Apply the same reading k times in a row (each posterior is the next prior). */
export function repeatReading(prior: readonly number[], table: readonly (readonly number[])[], z: number, k: number): number[] {
  let p = prior.slice();
  for (let i = 0; i < k; i++) {
    const t = ruleUpdate(p, table, z);
    if (!(t.evidence > 0)) break;
    p = t.posterior;
  }
  return p;
}

// ------------------------------------------------------------------ the labelling game

export type TermId = 'post' | 'lik' | 'prior' | 'ev';

export interface TermChip {
  id: string;
  /** The term it belongs to (null for a distractor). */
  term: TermId | null;
  name: string;
  meaning: string;
  /** Why it is right (or, for a distractor, why it belongs nowhere here). */
  why: string;
}

export const TERM_CHIPS: TermChip[] = [
  { id: 'c-prior', term: 'prior', name: 'prior', meaning: 'old belief, before the reading', why: '$P(x)$ is the belief **before** this measurement: in the filter it is the predicted belief $\\overline{bel}(x_t)$.' },
  { id: 'c-lik', term: 'lik', name: 'likelihood', meaning: 'sensor model', why: '$P(z \\mid x)$ is the sensor model: how probable this reading is **if** the state were $x$. It is read from the sensor table, one entry per state.' },
  { id: 'c-ev', term: 'ev', name: 'evidence', meaning: 'normaliser, $1/\\eta$', why: '$P(z) = \\sum_x P(z \\mid x)P(x)$ is the same for every $x$; dividing by it (multiplying by $\\eta$) makes the posterior sum to 1.' },
  { id: 'c-post', term: 'post', name: 'posterior', meaning: 'new belief, after the reading', why: '$P(x \\mid z)$ is the belief **after** the measurement, $bel(x_t)$: what the filter carries to the next step.' },
  { id: 'c-motion', term: null, name: 'motion model', meaning: '$p(x_t \\mid u_t, x_{t-1})$', why: 'The motion model belongs to the **prediction** step. Bayes’ rule here is the correction step, which uses only the sensor model.' },
];

export const TERM_ORDER: TermId[] = ['post', 'lik', 'prior', 'ev'];
