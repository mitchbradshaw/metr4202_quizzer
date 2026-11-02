// Shared helpers for the bayes exam-mode generators: number formatting the way the worked solutions print
// probabilities, direction names for grid moves, and trap filters (a trap equal to the answer is meaningless).
import type { MoveOutcome } from '../../../core/gridloc';
import { registerTraps } from '../../../engine/traps';

// The discrete-Bayes mistakes that have no core trap (the trap log shows them with this title and detail).
registerTraps([
  { id: 'bayes-forgot-prior', title: 'Prediction: multiply by the starting probability', detail: 'Each contribution is $p(x_1 \\mid u, x_0)\\,P(x_0)$: the transition probability **times** the probability of having started there.' },
  { id: 'bayes-start-colour', title: 'The starting tile’s colour plays no part', detail: 'The likelihood uses the colour of the cell the robot is in **after** the move, not where it started.' },
  { id: 'bayes-old-prior', title: 'Correct the predicted belief, not the old one', detail: 'The prior in the correction table is the output of the prediction step, $\\overline{bel}(x_t)$.' },
  { id: 'bayes-chain-prior', title: 'Each posterior is the next prior', detail: 'With several measurements, start each update from the previous posterior, not from the original prior.' },
  { id: 'bayes-product-rule', title: 'Product rule: P(x, y) = P(x | y) P(y)', detail: 'Condition on $y$, multiply by the probability of $y$. $P(x \\mid y)P(x)$ (the 2024 MCQ distractor) is wrong.' },
  { id: 'bayes-inverse', title: 'P(x | z) is not P(z | x)', detail: 'The likelihood $P(z \\mid x)$ (sensor model) and the posterior $P(x \\mid z)$ are different numbers; Bayes’ rule converts one into the other using the prior.' },
  { id: 'bayes-decision', title: 'Decide with the expected outcome, not the most likely state', detail: 'Compute $\\sum_x P(\\text{success} \\mid g, x)\\,P(x)$ for every option $g$ and pick the largest.' },
  { id: 'bayes-wrong-denominator', title: 'Conditional probability: divide by the probability of what you condition on', detail: '$P(x \\mid y) = P(x, y)/P(y)$, not $P(x, y)/P(x)$.' },
]);

/** Probability as the worked solutions print it: up to `d` decimals, trailing zeros dropped (0.4, 0.068, 0.1271). */
export function num(x: number, d = 4): string {
  if (!Number.isFinite(x)) return '—';
  const v = Number(x.toFixed(d));
  return Object.is(v, -0) ? '0' : String(v);
}

/** Fixed decimals (0.40, 0.535 → '0.5350'). */
export function fix(x: number, d = 4): string {
  return x.toFixed(d);
}

/** Sum of a list. */
export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

// ------------------------------------------------------------------ grid moves

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** "up", "up-left", "stays put" … for a shift (dc, dr); rows count down the page. */
export function moveName(dc: number, dr: number): string {
  if (dc === 0 && dr === 0) return 'stays put';
  const v = dr < 0 ? 'up' : dr > 0 ? 'down' : '';
  const h = dc < 0 ? 'left' : dc > 0 ? 'right' : '';
  const base = v && h ? `${v}-${h}` : v || h;
  const steps = Math.max(Math.abs(dc), Math.abs(dr));
  return steps > 1 ? `${base} ×${steps}` : base;
}

/** Plain-English phrase for an outcome: "moves to the tile above", "slips to the tile above and to the left". */
export function movePhrase(m: MoveOutcome, main: boolean): string {
  if (m.dc === 0 && m.dr === 0) return 'stays on the same tile';
  const vert = m.dr < 0 ? 'above' : m.dr > 0 ? 'below' : '';
  const hor = m.dc < 0 ? 'to the left' : m.dc > 0 ? 'to the right' : '';
  const where = vert && hor ? `the tile ${vert} and ${hor}` : vert ? `the tile ${vert}` : `the tile ${hor}`;
  return `${main ? 'moves to' : 'slips to'} ${where}`;
}

// ------------------------------------------------------------------ traps

/** Keep numeric traps that differ from the answer (by more than `gap`), are finite and are not repeated. */
export function numericTraps<T extends { value: number }>(answer: number, list: T[], gap = 0.004): T[] {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = t.value.toFixed(4);
    if (!Number.isFinite(t.value) || Math.abs(t.value - answer) <= gap || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Keep matrix traps whose shape matches and that differ from the answer in some cell by more than `gap`. */
export function matrixTraps<T extends { value: number[][] }>(answer: number[][], list: T[], gap = 0.01): T[] {
  const seen = new Set<string>();
  return list.filter((t) => {
    if (t.value.length !== answer.length || t.value.some((row, i) => row.length !== answer[i].length)) return false;
    if (t.value.some((row) => row.some((x) => !Number.isFinite(x)))) return false;
    const differs = t.value.some((row, i) => row.some((x, j) => Math.abs(x - answer[i][j]) > gap));
    const k = JSON.stringify(t.value.map((row) => row.map((x) => x.toFixed(3))));
    if (!differs || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Column vector [[a], [b], …] for a one-column matrix part. */
export const col = (xs: readonly number[]) => xs.map((x) => [x]);
