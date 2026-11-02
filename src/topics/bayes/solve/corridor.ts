// One predict and one correct step by hand on a short corridor with doors (bayes-predict-correct): the 1-D
// version of the 2024 Q28 template, and the same filter as the corridor simulation (core/bayes1d.ts).
// Tier 1: two outcomes (stays or moves one cell); tier 2: three outcomes (short, exact, long) and up to three
// possible starting cells, so contributions from neighbouring starts add.
import type { ChoicePart, MatrixPart, NumericPart, SolveGenerator, SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { correctCorridor, predictCorridor, shiftsOf, type DoorReading, type DoorSensor, type MotionNoise } from '../../../core/bayes1d';
import { makeCorridorFigure } from './figures';
import { col, matrixTraps, num, numericTraps } from './common';

export interface CorridorSpec {
  n: number;
  doors: boolean[];
  prior: number[];
  motion: MotionNoise;
  sensor: DoorSensor;
  z: DoorReading;
}

export interface CorridorSolution {
  predicted: number[];
  /** Cells with non-zero predicted probability, left to right. */
  cells: number[];
  /** Contributions: from cell, outcome shift, to cell, mass. */
  contributions: { from: number; d: number; p: number; to: number; mass: number }[];
  evidence: number;
  lik: number[];
  product: number[];
  posterior: number[];
}

export function solveCorridor(spec: CorridorSpec): CorridorSolution {
  const shifts = shiftsOf(spec.motion).filter((s) => s.p > 0);
  const pr = predictCorridor(spec.prior, shifts, 'wall');
  const contributions: CorridorSolution['contributions'] = [];
  spec.prior.forEach((b, i) => {
    if (!b) return;
    shifts.forEach((s, k) => contributions.push({ from: i, d: s.d, p: s.p, to: pr.dest[k][i], mass: pr.layers[k][i] }));
  });
  const t = correctCorridor(pr.bel, spec.doors, spec.z, spec.sensor);
  const cells = pr.bel.map((p, i) => (p > 1e-12 ? i : -1)).filter((i) => i >= 0);
  return { predicted: pr.bel, cells, contributions, evidence: t.evidence, lik: t.likelihood, product: t.product, posterior: t.posterior };
}

const PRIORS: Record<number, number[][]> = {
  2: [
    [0.5, 0.5],
    [0.6, 0.4],
    [0.7, 0.3],
    [0.4, 0.6],
  ],
  3: [
    [0.5, 0.3, 0.2],
    [0.4, 0.4, 0.2],
    [0.2, 0.5, 0.3],
    [0.3, 0.4, 0.3],
  ],
};

function tryRandom(rng: Rng, tier: Tier): CorridorSpec | null {
  const n = rng.int(7, 9);
  const doors = Array.from({ length: n }, () => rng.chance(0.35));
  const k = tier === 1 ? 2 : rng.pick([2, 3, 3]);
  // Starting cells: neighbours sometimes, so that contributions add.
  const first = rng.int(0, n - 3 - k);
  const gaps = Array.from({ length: k - 1 }, () => rng.pick([1, 1, 2]));
  const starts = [first];
  for (const g of gaps) starts.push(starts[starts.length - 1] + g);
  if (starts[starts.length - 1] + 2 > n - 1) return null;
  const pr = rng.pick(PRIORS[k]);
  const prior = new Array<number>(n).fill(0);
  starts.forEach((s, i) => (prior[s] = pr[i]));
  const exact = tier === 1 ? rng.pick([0.7, 0.75, 0.8, 0.85, 0.9]) : rng.pick([0.6, 0.7, 0.8]);
  const over = tier === 1 ? 0 : rng.pick([0.1, 0.15, 0.2]);
  const under = Number((1 - exact - over).toFixed(2));
  if (under <= 0) return null;
  const motion: MotionNoise = { under, exact, over };
  const sensor: DoorSensor = { hit: rng.step(0.7, 0.95, 0.05), falseAlarm: rng.step(0.05, 0.3, 0.05) };
  const z: DoorReading = rng.chance(0.6) ? 'door' : 'wall';
  const spec: CorridorSpec = { n, doors, prior, motion, sensor, z };
  const sol = solveCorridor(spec);
  const kinds = new Set(sol.cells.map((i) => doors[i]));
  if (kinds.size < 2) return null; // the reading must discriminate between the reachable cells
  const ranked = sol.cells.map((i) => sol.posterior[i]).sort((a, b) => b - a);
  if (ranked[0] - ranked[1] < 0.012) return null;
  if (sol.cells.some((i) => sol.predicted[i] < 0.02)) return null;
  return spec;
}

const FALLBACK: CorridorSpec = {
  n: 8,
  doors: [false, true, false, false, true, true, false, false],
  prior: [0.5, 0.5, 0, 0, 0, 0, 0, 0],
  motion: { under: 0.2, exact: 0.8, over: 0 },
  sensor: { hit: 0.8, falseAlarm: 0.1 },
  z: 'door',
};

export function randomCorridorSpec(rng: Rng, tier: Tier): CorridorSpec {
  for (let k = 0; k < 300; k++) {
    const s = tryRandom(rng, tier);
    if (s) return s;
  }
  return FALLBACK;
}

const cellName = (i: number) => `cell ${i + 1}`;
const moveWord = (d: number) => (d === 0 ? 'stays' : d === 1 ? 'moves 1' : `moves ${d}`);

function build(spec: CorridorSpec, tier: Tier): SolveInstance {
  const sol = solveCorridor(spec);
  const { n, doors, prior, motion, sensor, z } = spec;
  const startCells = prior.map((p, i) => (p > 0 ? i : -1)).filter((i) => i >= 0);
  const doorList = doors.map((d, i) => (d ? i + 1 : 0)).filter(Boolean);
  const zTxt = z === 'door' ? '“door”' : '“no door”';
  const outcomes =
    motion.over > 0
      ? `it stays put with probability ${num(motion.under)}, moves one cell with probability ${num(motion.exact)}, and overshoots to two cells with probability ${num(motion.over)}`
      : `it moves one cell with probability ${num(motion.exact)} and stays put (wheel slip) with probability ${num(motion.under)}`;
  const prompt = [
    `A robot localises itself in a corridor of ${n} cells (numbered 1 to ${n} from the left). There are doors at cells ${doorList.join(', ')}. Its current belief is ${startCells.map((i) => `$P(x_0 = ${i + 1}) = ${num(prior[i])}$`).join(', ')}, and zero elsewhere.`,
    `It is told to move one cell to the right: ${outcomes}. Its door sensor reports “door” with probability ${num(sensor.hit)} beside a door and with probability ${num(sensor.falseAlarm)} beside a wall (a false alarm). After the move it reports ${zTxt}.`,
  ].join('\n\n');

  const cells = sol.cells;
  // Matrix row labels are Rich text: plain cell names (TeX would need $ … $).
  const rows = cells.map((i) => cellName(i));
  const answerPred = col(cells.map((i) => sol.predicted[i]));
  const firstOnly = col(cells.map((i) => sol.contributions.find((c) => c.to === i)!.mass));
  const parts: SolvePart[] = [];
  const pred: MatrixPart = {
    kind: 'matrix',
    id: 'pred',
    label: '(a) The predicted belief $\\overline{bel}(x_1)$ of every cell the robot can reach',
    answer: answerPred,
    rowLabels: rows,
    colLabels: ['$\\overline{bel}(x_1)$'],
    absTol: 0.002,
    traps: matrixTraps(answerPred, [{ value: firstOnly, message: 'Neighbouring starts can land on the same cell: **add** every contribution to a cell.', trapId: 'contributions-add' }]),
    marks: tier === 1 ? 3 : 4,
  };
  const likWrong = cells.map((i) => (doors[i] ? (z === 'door' ? sensor.hit : sensor.hit) : z === 'door' ? 1 - sensor.falseAlarm : sensor.falseAlarm));
  const evWrong = cells.reduce((a, i, k) => a + sol.predicted[i] * likWrong[k], 0);
  const pz: NumericPart = {
    kind: 'numeric',
    id: 'pz',
    label: `(b) The total probability of the reading, $P(z = ${z === 'door' ? '\\text{door}' : '\\text{no door}'})$`,
    answer: sol.evidence,
    unit: '',
    tol: 0.004,
    absTol: 0.002,
    traps: numericTraps(sol.evidence, [
      { value: evWrong, message: `Check the likelihoods: beside a wall $P(${z === 'door' ? '\\text{door}' : '\\text{no door}'} \\mid \\text{wall})$ = ${num(z === 'door' ? sensor.falseAlarm : 1 - sensor.falseAlarm)}${z === 'door' ? '' : `, and beside a door $P(\\text{no door} \\mid \\text{door}) = 1 - ${num(sensor.hit)}$`}.`, trapId: 'likelihood-column' },
      { value: startCells.reduce((a, i) => a + prior[i] * (z === 'door' ? (doors[i] ? sensor.hit : sensor.falseAlarm) : doors[i] ? 1 - sensor.hit : 1 - sensor.falseAlarm), 0), message: 'That uses the cells before the move. Correct the **predicted** belief from (a).', trapId: 'bayes-old-prior' },
    ]),
    marks: 2,
  };
  const answerPost = col(cells.map((i) => sol.posterior[i]));
  const post: MatrixPart = {
    kind: 'matrix',
    id: 'post',
    label: '(c) The posterior $bel(x_1)$ of the same cells',
    answer: answerPost,
    rowLabels: rows,
    colLabels: ['$bel(x_1)$'],
    absTol: 0.002,
    traps: matrixTraps(answerPost, [{ value: col(cells.map((i) => sol.product[i])), message: `Divide each product by $P(z)$ = ${num(sol.evidence, 5)}.`, trapId: 'normalise' }]),
    marks: tier === 1 ? 3 : 4,
  };
  const best = cells.reduce((a, i) => (sol.posterior[i] > sol.posterior[a] ? i : a), cells[0]);
  const bestPart: ChoicePart = {
    kind: 'choice',
    id: 'best',
    label: '(d) Where is the robot now most likely to be?',
    options: cells.map((i) => ({
      text: cellName(i)[0].toUpperCase() + cellName(i).slice(1),
      correct: i === best,
      why: i === best ? `Largest posterior, ${num(sol.posterior[i])}.` : `Posterior ${num(sol.posterior[i])} < ${num(sol.posterior[best])}.`,
    })),
    marks: 1,
  };
  parts.push(pred, pz, post, bestPart);

  const lik = (i: number) => sol.lik[i];
  const h1 =
    '**Predict**, then **correct**. In the prediction each starting cell’s probability splits over the outcomes of the move (stay, one cell, two cells), and pieces that land on the same cell add; the belief spreads out. In the correction multiply each cell by the likelihood of the reading there (door or wall), add the products to get $P(z)$, and divide; the belief sharpens.';
  const h2 = [
    '$$\\overline{bel}(x_1) = \\sum_{x_0} p(x_1 \\mid u, x_0)\\,bel(x_0)$$',
    '$$P(z) = \\sum_{x_1} P(z \\mid x_1)\\,\\overline{bel}(x_1), \\qquad bel(x_1) = \\frac{P(z \\mid x_1)\\,\\overline{bel}(x_1)}{P(z)}$$',
    `Likelihood of ${zTxt}: ${z === 'door' ? `$P(\\text{door} \\mid \\text{door}) = ${num(sensor.hit)}$, $P(\\text{door} \\mid \\text{wall}) = ${num(sensor.falseAlarm)}$` : `$P(\\text{no door} \\mid \\text{door}) = 1 - ${num(sensor.hit)} = ${num(1 - sensor.hit)}$, $P(\\text{no door} \\mid \\text{wall}) = 1 - ${num(sensor.falseAlarm)} = ${num(1 - sensor.falseAlarm)}$`}.`,
  ].join('\n\n');
  // Contributions grouped by starting cell (one bullet each), and the sums for cells that two arrows reach.
  const byStart = startCells
    .map((s) => `- From ${cellName(s)} ($bel(x_0)$ = ${num(prior[s])}):${sol.contributions.filter((c) => c.from === s).map((c) => `${moveWord(c.d)} → ${cellName(c.to)}, ${num(c.p)} × ${num(prior[s])} = ${num(c.mass)}`).join('; ')}.`)
    .join('\n');
  const shared = cells.filter((i) => sol.contributions.filter((c) => c.to === i).length > 1);
  const sharedTxt = shared.length
    ? `Arrows into the same cell add: ${shared.map((i) => `$\\overline{bel}(${i + 1}) = ${sol.contributions.filter((c) => c.to === i).map((c) => num(c.mass)).join(' + ')} = ${num(sol.predicted[i])}$`).join(', ')}.`
    : '';
  const h3 = ['Prediction, arrow by arrow:', byStart, sharedTxt, `Correction: $P(z) = ${cells.map((i) => `${num(lik(i))}(${num(sol.predicted[i])})`).join(' + ')}$.`].filter(Boolean).join('\n\n');
  const predTab = `$$\\begin{array}{c|c|l|c|l} x_0 & bel(x_0) & \\text{outcome} & x_1 & p(x_1 \\mid u, x_0)\\,bel(x_0) \\\\ \\hline ${sol.contributions
    .map((c) => `${c.from + 1} & ${num(prior[c.from])} & \\text{${moveWord(c.d)}}\\ (${num(c.p)}) & ${c.to + 1} & ${num(c.p)} \\times ${num(prior[c.from])} = ${num(c.mass)}`)
    .join(' \\\\ ')} \\end{array}$$`;
  const tab = `$$\\begin{array}{c|c|c|c|c} x_1 & \\overline{bel} & P(z \\mid x_1) & \\text{product} & bel \\\\ \\hline ${cells
    .map((i) => `\\text{${i + 1} (${doors[i] ? 'door' : 'wall'})} & ${num(sol.predicted[i])} & ${num(lik(i))} & ${num(sol.product[i], 5)} & ${num(sol.posterior[i])}`)
    .join(' \\\\ ')} \\\\ \\hline & 1 & & ${num(sol.evidence, 5)} & 1 \\end{array}$$`;
  const h4 = [
    '**(a) Prediction** (move right): every starting cell splits over the outcomes.',
    predTab,
    `${sharedTxt ? `${sharedTxt} ` : ''}**${cells.map((i) => `${cellName(i)}: ${num(sol.predicted[i])}`).join(', ')}** (sum ${num(cells.reduce((a, i) => a + sol.predicted[i], 0))} ✓).`,
    `**(b), (c) Correction** with $z$ = ${zTxt}: prior × likelihood = product; the products sum to $P(z)$.`,
    tab,
    `**(b)** $P(z)$ = **${num(sol.evidence, 4)}**. **(c)** ${cells.map((i) => `${cellName(i)} **${num(sol.posterior[i])}**`).join(', ')}. **(d)** **${cellName(best)}**.`,
  ].join('\n\n');

  return {
    prompt,
    givens: [
      { sym: 'p(\\text{stay}), p(1), p(2)', value: `${num(motion.under)}, ${num(motion.exact)}, ${num(motion.over)}`, label: 'motion outcomes' },
      { sym: 'P(\\text{door} \\mid \\text{door})', value: num(sensor.hit), label: 'hit rate' },
      { sym: 'P(\\text{door} \\mid \\text{wall})', value: num(sensor.falseAlarm), label: 'false-alarm rate' },
    ],
    figure: makeCorridorFigure({ n, doors, prior }),
    parts,
    hints: [h1, h2, h3, h4],
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'bayes-predict-correct',
    title: 'Corridor: one predict and one correct step',
    summary: 'A short corridor with doors, a noisy move to the right and a door sensor: the predicted belief, $P(z)$, the posterior and the most likely cell.',
    tiers: [1, 2],
    source: 'Summary notes §1 steps 1–3 and 7; the 1-D form of 2024 Q28',
    cardId: 'bayes-filter',
    marks: 10,
    generate(rng, tier) {
      return build(randomCorridorSpec(rng, tier), tier);
    },
  },
];
