// Classifier sequence + decision (bayes-classifier): the 2025 Q28 template with a random confusion table, prior
// and detection sequence. Each detection's likelihood is a COLUMN of the table; each posterior is the next prior
// (no prediction step: the object does not change between frames). Then the gripper choice by expected success
// Σ_x P(success | g, x) P(x), and P(success) by total probability. One solver (core/bayestables.ts) answers every
// part and is checked against the 2025 worked solution in tests/generators.ts.
import type { ChoicePart, MatrixPart, NumericPart, SolveGenerator, SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { classifierRun, decide } from '../../../core/bayestables';
import type { BayesTable } from '../../../core/prob';
import { col, matrixTraps, num, numericTraps } from './common';

export interface Theme {
  id: string;
  /** Sentence that sets the scene. */
  scene: string;
  /** Class names (the last one is "nothing there"), their letters, and the plural object word. */
  names: [string, string, string];
  letters: [string, string, string];
  objects: string;
  grippers: [string, string];
}

export const THEMES: Theme[] = [
  {
    id: 'fruit',
    scene: 'An automated fruit-packing system processes apples and bananas. The fruit pass one at a time under a camera that classifies what it sees',
    names: ['Apple', 'Banana', 'None'],
    letters: ['A', 'B', 'N'],
    objects: 'fruit',
    grippers: ['suction', 'pinch'],
  },
  {
    id: 'parts',
    scene: 'A bin-picking cell sorts bolts and washers from a conveyor. A camera classifies each slot as it arrives',
    names: ['Bolt', 'Washer', 'Empty'],
    letters: ['B', 'W', 'E'],
    objects: 'part',
    grippers: ['magnetic', 'parallel-jaw'],
  },
  {
    id: 'recycling',
    scene: 'A recycling robot picks cans and bottles off a belt. A camera classifies each object under the arm',
    names: ['Can', 'Bottle', 'Nothing'],
    letters: ['C', 'B', 'N'],
    objects: 'item',
    grippers: ['suction-cup', 'two-finger'],
  },
  {
    id: 'parcels',
    scene: 'A warehouse robot unloads boxes and sacks from a chute. A camera classifies each slot before the grasp',
    names: ['Box', 'Sack', 'Empty'],
    letters: ['X', 'S', 'E'],
    objects: 'package',
    grippers: ['vacuum', 'clamp'],
  },
];

/** "a part", "an item". */
const an = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

export interface ClassifierSpec {
  theme: Theme;
  /** table[true][detected] = P(detected | true); each row sums to 1. */
  table: number[][];
  prior: number[];
  detections: number[];
  /** success[g][x] = P(success | gripper g, true class x); 0 for the empty class. */
  success: number[][];
  /** Gripper used in part (c). */
  use: number;
  /** Tier 3: part (c) asks P(success | an object is present). */
  conditional?: boolean;
}

/** 2025 Q28 exactly as set (detections B then A; suction 95 % / 70 %, pinch 60 % / 90 %; suction used). */
export const EXAM_2025: ClassifierSpec = {
  theme: THEMES[0],
  table: [
    [0.6, 0.1, 0.3],
    [0.05, 0.75, 0.2],
    [0.05, 0.05, 0.9],
  ],
  prior: [0.3, 0.5, 0.2],
  detections: [1, 0],
  success: [
    [0.95, 0.7, 0],
    [0.6, 0.9, 0],
  ],
  use: 0,
};

export interface ClassifierSolution {
  tables: BayesTable[];
  /** Belief after every detection. */
  final: number[];
  expected: number[];
  best: number;
  /** Part (c): P(success) with the gripper used (conditional on an object being present in tier 3). */
  pc: number;
}

export function solveClassifier(spec: ClassifierSpec): ClassifierSolution {
  const tables = classifierRun(spec.prior, spec.table, spec.detections);
  const final = tables[tables.length - 1].posterior;
  const { expected, best } = decide(final, spec.success);
  const pc = spec.conditional ? expected[spec.use] / (1 - final[2]) : expected[spec.use];
  return { tables, final, expected, best, pc };
}

// ------------------------------------------------------------------ random instances

const PRIORS: number[][] = [
  [0.3, 0.5, 0.2],
  [0.5, 0.3, 0.2],
  [0.4, 0.4, 0.2],
  [0.45, 0.45, 0.1],
  [0.25, 0.6, 0.15],
  [0.6, 0.25, 0.15],
  [0.35, 0.5, 0.15],
  [0.5, 0.35, 0.15],
];

function randomRow(rng: Rng, i: number): number[] {
  // Mostly right on the diagonal; the empty class is easy to recognise.
  const d = i === 2 ? rng.step(0.8, 0.95, 0.05) : rng.step(0.6, 0.85, 0.05);
  const rest = Number((1 - d).toFixed(2));
  const others = [0, 1, 2].filter((j) => j !== i);
  const a = rng.step(0.05, Math.max(0.05, rest - 0.05), 0.05);
  const row = [0, 0, 0];
  row[i] = d;
  row[others[0]] = Number(a.toFixed(2));
  row[others[1]] = Number((rest - a).toFixed(2));
  return row;
}

function tryRandom(rng: Rng, tier: Tier): ClassifierSpec | null {
  const theme = rng.pick(THEMES);
  const table = [0, 1, 2].map((i) => randomRow(rng, i));
  if (table.some((row) => row.some((x) => x <= 0))) return null;
  const prior = rng.pick(PRIORS);
  const n = tier === 3 ? 3 : 2;
  const first = rng.pick([0, 1]);
  const detections = [first];
  for (let k = 1; k < n; k++) detections.push(rng.chance(0.65) ? 1 - detections[k - 1] : rng.chance(0.6) ? detections[k - 1] : 2);
  const g0 = [rng.step(0.85, 0.95, 0.05), rng.step(0.55, 0.75, 0.05), 0];
  const g1 = [rng.step(0.5, 0.7, 0.05), rng.step(0.8, 0.95, 0.05), 0];
  const spec: ClassifierSpec = {
    theme,
    table,
    prior,
    detections,
    success: [g0, g1],
    use: tier === 3 ? rng.int(0, 1) : rng.chance(0.6) ? -1 : rng.int(0, 1),
    conditional: tier === 3,
  };
  const sol0 = solveClassifier({ ...spec, use: 0 });
  if (spec.use < 0) spec.use = sol0.best;
  const sol = solveClassifier(spec);
  if (Math.abs(sol.expected[0] - sol.expected[1]) < 0.012) return null;
  // Every update should move the belief noticeably, and nothing should collapse to ~0 or ~1 too early.
  if (sol.tables.some((t) => t.evidence < 0.03)) return null;
  if (sol.final.some((p) => !(p > 0.002))) return null;
  return spec;
}

export function randomClassifierSpec(rng: Rng, tier: Tier): ClassifierSpec {
  for (let k = 0; k < 300; k++) {
    const s = tryRandom(rng, tier);
    if (s) return s;
  }
  return tier === 3 ? { ...EXAM_2025, detections: [1, 0, 1], conditional: true } : EXAM_2025;
}

// ------------------------------------------------------------------ the instance

const tx = (s: string) => `\\text{${s}}`;

export function buildClassifierInstance(spec: ClassifierSpec, tier: Tier): SolveInstance {
  const { theme, table, prior, detections, success } = spec;
  const sol = solveClassifier(spec);
  const Lt = theme.letters;
  const nm = (i: number) => `${theme.names[i]} (${Lt[i]})`;
  const zName = (d: number) => Lt[d];
  const G = theme.grippers;
  const ord = ['first', 'second', 'third'];

  // ---------------------------------------------------------------- prompt
  const tableTex = `$$\\begin{array}{c|ccc} \\text{true} \\backslash \\text{detected} & ${Lt.map(tx).join(' & ')} \\\\ \\hline ${table
    .map((row, i) => `${tx(Lt[i])} & ${row.map((x) => num(x)).join(' & ')}`)
    .join(' \\\\ ')} \\end{array}$$`;
  const seq = detections.map((d) => `**${zName(d)}**`).join(', then ');
  const succ = (g: number) => `${num(success[g][0] * 100)} % for ${theme.names[0].toLowerCase()}s and ${num(success[g][1] * 100)} % for ${theme.names[1].toLowerCase()}s`;
  const scaffold =
    tier === 1
      ? ` (The likelihood of a detection is its **column** of the table: for a ${zName(detections[0])} detection, $P(z = ${tx(zName(detections[0]))} \\mid x)$ = ${table.map((row) => num(row[detections[0]])).join(', ')} for ${Lt.join(', ')}.)`
      : '';
  const prompt = [
    `${theme.scene}: ${Lt.map((l, i) => `${theme.names[i]} (${l})`).join(', ')}. The detector’s sensor model $P(\\text{detected} \\mid \\text{true})$ is (rows: true state, columns: what is reported; each row sums to 1):`,
    tableTex,
    `After earlier frames the current belief is ${Lt.map((l, i) => `$P(${tx(l)}) = ${num(prior[i])}$`).join(', ')}. The next ${detections.length} frames report ${seq}. Assume the object does not change between frames and the detections are conditionally independent given the true state.${scaffold}`,
    `The arm has two grippers. The ${G[0]} gripper succeeds ${succ(0)}; the ${G[1]} gripper succeeds ${succ(1)}. With no ${theme.objects} present (${Lt[2]}) there is nothing to grasp, so neither succeeds.`,
  ].join('\n\n');

  // ---------------------------------------------------------------- parts
  const parts: SolvePart[] = [];
  const mk: number[][] = tier === 3 ? [[1, 3], [1, 2], [1, 2]] : [[2, 3], [2, 3]];
  sol.tables.forEach((t, k) => {
    const d = detections[k];
    const priorK = k === 0 ? prior : sol.tables[k - 1].posterior;
    const rowRead = priorK.reduce((a, p, x) => a + p * table[d][x], 0);
    const fromStart = classifierRun(prior, table, [d])[0];
    const pzTraps = numericTraps(t.evidence, [
      { value: rowRead, message: `That reads the **row** for ${zName(d)}. The likelihood is the **column**: $P(z = ${tx(zName(d))} \\mid x)$ = ${table.map((row) => num(row[d])).join(', ')}.`, trapId: 'likelihood-column' },
      ...(k > 0 ? [{ value: fromStart.evidence, message: 'Use the belief after the previous detection as the prior, not the original belief.', trapId: 'bayes-chain-prior' }] : []),
    ]);
    const pz: NumericPart = {
      kind: 'numeric',
      id: `pz${k + 1}`,
      label:
        k === 0
          ? `(a) First detection (${zName(d)}): the total probability $P(z_1 = ${tx(zName(d))})$`
          : `(a) ${ord[k][0].toUpperCase()}${ord[k].slice(1)} detection (${zName(d)}): the total probability given the earlier frames, $P(z_${k + 1} = ${tx(zName(d))} \\mid ${k === 1 ? 'z_1' : `z_{1:${k}}`})$`,
      answer: t.evidence,
      unit: '',
      tol: 0.004,
      absTol: 0.002,
      traps: pzTraps,
      marks: mk[k][0],
    };
    const answer = col(t.posterior);
    const rowPost = (() => {
      const lik = table[d];
      const prod = priorK.map((p, x) => p * lik[x]);
      const s = prod.reduce((a, b) => a + b, 0);
      return col(prod.map((x) => x / s));
    })();
    const post: MatrixPart = {
      kind: 'matrix',
      id: `post${k + 1}`,
      label: `(a) The updated belief after the ${ord[k]} detection, $P(x \\mid z_{1${k > 0 ? `:${k + 1}` : ''}})$`,
      answer,
      rowLabels: Lt.slice(),
      colLabels: ['posterior'],
      absTol: 0.002,
      traps: matrixTraps(answer, [
        { value: col(t.product), message: `Those are the products $P(z \\mid x)P(x)$; divide each by $P(z_${k + 1})$ = ${num(t.evidence, 5)}.`, trapId: 'normalise' },
        { value: rowPost, message: `Use the **column** of the detected class as the likelihood: ${table.map((row, i) => `$P(${tx(zName(d))} \\mid ${tx(Lt[i])}) = ${num(row[d])}$`).join(', ')}.`, trapId: 'likelihood-column' },
        ...(k > 0 ? [{ value: col(fromStart.posterior), message: 'Each posterior is the next prior: start this update from the belief after the previous detection.', trapId: 'bayes-chain-prior' }] : []),
      ]),
      marks: mk[k][1],
    };
    parts.push(pz, post);
  });

  const fin = sol.final;
  const top = fin[0] >= fin[1] ? 0 : 1;
  const eTraps = (g: number) =>
    numericTraps(sol.expected[g], [
      { value: success[g][top], message: `That is only the success rate on the most likely class (${theme.names[top].toLowerCase()}). Weight **every** class by its probability: $\\sum_x P(\\text{success} \\mid ${tx(G[g])}, x)\\,P(x)$.`, trapId: 'bayes-decision' },
      { value: success[g][0] * prior[0] + success[g][1] * prior[1], message: 'Use the belief **after** the detections, not the starting belief.', trapId: 'bayes-chain-prior' },
    ]);
  for (const g of [0, 1]) {
    parts.push({
      kind: 'numeric',
      id: `e${g}`,
      label: `(b) Expected grasp success with the ${G[g]} gripper, $\\sum_x P(\\text{success} \\mid ${tx(G[g])}, x)\\,P(x)$`,
      answer: sol.expected[g],
      unit: '',
      tol: 0.004,
      absTol: 0.002,
      traps: eTraps(g),
      marks: 0.5,
    });
  }
  const best = sol.best;
  const choose: ChoicePart = {
    kind: 'choice',
    id: 'gripper',
    label: '(b) Which gripper should the system use?',
    options: [0, 1].map((g) => ({
      text: `The ${G[g]} gripper`,
      correct: g === best,
      why:
        g === best
          ? `Higher expected success: ${num(sol.expected[g], 3)} vs ${num(sol.expected[1 - g], 3)}.${top !== g && success[g][top] < success[1 - g][top] ? ` Even though ${theme.names[top].toLowerCase()} is (slightly) more likely, this gripper is much better on the other class, so it wins on average.` : ''}`
          : `Expected success ${num(sol.expected[g], 3)} < ${num(sol.expected[1 - g], 3)}.${top === g ? ` Choosing by the most likely class alone ignores how likely the others still are.` : ''}`,
    })),
    marks: 1,
  };
  parts.push(choose);

  if (tier >= 2) {
    const u = spec.use;
    const pcLabel = spec.conditional
      ? `(c) The system uses the ${G[u]} gripper. Given that ${an(theme.objects)} **is** present (not ${Lt[2]}), what is the probability that the grasp succeeds?`
      : `(c) The system uses the ${G[u]} gripper. What is the probability that it successfully retrieves ${an(theme.objects)}?`;
    parts.push({
      kind: 'numeric',
      id: 'pc',
      label: pcLabel,
      answer: sol.pc,
      unit: '',
      tol: 0.004,
      absTol: 0.002,
      traps: numericTraps(sol.pc, [
        ...(spec.conditional ? [{ value: sol.expected[u], message: `That is $P(\\text{success})$ over all states. Condition on an object being present: divide by $P(\\neg ${tx(Lt[2])}) = 1 - ${num(fin[2])}$.`, trapId: 'bayes-wrong-denominator' }] : []),
        { value: sol.expected[1 - u], message: `That is the other gripper (${G[1 - u]}).` },
        { value: success[u][top], message: 'Use total probability over every class, not just the most likely one.', trapId: 'bayes-decision' },
      ]),
      marks: 3,
    });
  }

  // ---------------------------------------------------------------- hints
  const h1 =
    'Each frame is one **correction** step (the object does not change, so there is no prediction step). The likelihood of a detection is that detection’s **column** of the table, one entry per true class. Multiply by the current belief, add the products to get $P(z)$, divide each product by it. The posterior becomes the prior for the next frame. To choose an action, weight each option’s success rate by the belief and add: the expected outcome, not the most likely class, decides.';
  const h2 = [
    '$$P(x \\mid z) = \\frac{P(z \\mid x)\\,P(x)}{P(z)}, \\qquad P(z) = \\sum_x P(z \\mid x)\\,P(x)$$',
    '$$E[\\text{success} \\mid g] = \\sum_x P(\\text{success} \\mid g, x)\\,P(x)$$',
    ...(spec.conditional ? [`$$P(\\text{success} \\mid \\text{present}) = \\frac{\\sum_{x \\ne ${tx(Lt[2])}} P(\\text{success} \\mid g, x)\\,P(x)}{1 - P(${tx(Lt[2])})}$$`] : []),
    `Likelihood columns: ${[...new Set(detections)].map((d) => `$P(${tx(zName(d))} \\mid x)$ = (${table.map((row) => num(row[d])).join(', ')})`).join('; ')} for (${Lt.join(', ')}).`,
  ].join('\n\n');
  const subst = sol.tables.map((t, k) => {
    const d = detections[k];
    return `Detection ${k + 1} (${zName(d)}): $P(z) = ${t.likelihood.map((l, x) => `${num(l)}(${num(t.prior[x])})`).join(' + ')} = ${num(t.evidence, 5)}$.`;
  });
  const h3 = [
    ...subst,
    `Expected success: ${G[0]} $= ${num(success[0][0])}(${num(fin[0])}) + ${num(success[0][1])}(${num(fin[1])})$; ${G[1]} $= ${num(success[1][0])}(${num(fin[0])}) + ${num(success[1][1])}(${num(fin[1])})$ (the empty class adds 0).`,
  ].join('\n\n');
  const tableOf = (t: BayesTable, k: number) => {
    const d = detections[k];
    return `$$\\begin{array}{c|c|c|c|c} x & P(${tx(zName(d))} \\mid x) & P(x) & \\text{product} & P(x \\mid z) \\\\ \\hline ${Lt.map(
      (l, x) => `${tx(l)} & ${num(t.likelihood[x])} & ${num(t.prior[x])} & ${num(t.product[x], 5)} & ${num(t.posterior[x])}`
    ).join(' \\\\ ')} \\\\ \\hline & & & ${num(t.evidence, 5)} & 1 \\end{array}$$`;
  };
  const w: string[] = [];
  sol.tables.forEach((t, k) => {
    w.push(`**Detection ${k + 1}** ($z_${k + 1}$ = ${zName(detections[k])}):`, tableOf(t, k), `**$P(z_${k + 1})$ = ${num(t.evidence, 4)}**; belief **${Lt.map((l, x) => `${l} ${num(t.posterior[x])}`).join(', ')}**.`);
  });
  w.push(
    `**Gripper choice:** ${G[0]} $= ${num(success[0][0])}(${num(fin[0])}) + ${num(success[0][1])}(${num(fin[1])}) = ${num(sol.expected[0], 4)}$; ${G[1]} $= ${num(success[1][0])}(${num(fin[0])}) + ${num(success[1][1])}(${num(fin[1])}) = ${num(sol.expected[1], 4)}$. Use the **${G[best]}** gripper.`
  );
  if (tier >= 2) {
    const u = spec.use;
    w.push(
      spec.conditional
        ? `**(c)** $P(\\text{success} \\mid \\text{present}) = ${num(sol.expected[u], 4)} / (1 - ${num(fin[2])}) =$ **${num(sol.pc, 4)}**.`
        : `**(c)** By total probability, $P(\\text{success}) = ${num(success[u][0])}(${num(fin[0])}) + ${num(success[u][1])}(${num(fin[1])}) + 0(${num(fin[2])}) =$ **${num(sol.pc, 4)}**.`
    );
  }
  const h4 = w.join('\n\n');

  return {
    prompt,
    givens: [
      { sym: 'P(x_0)', value: Lt.map((l, i) => `${l} ${num(prior[i])}`).join(', '), label: 'current belief' },
      { sym: 'z_{1:n}', value: detections.map(zName).join(', '), label: 'detections, in order' },
      ...[0, 1].map((g) => ({ sym: `P(\\text{success} \\mid ${tx(G[g])})`, value: `${Lt[0]} ${num(success[g][0])}, ${Lt[1]} ${num(success[g][1])}, ${Lt[2]} 0`, label: `${G[g]} gripper` })),
    ],
    parts,
    hints: [h1, h2, h3, h4],
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'bayes-classifier',
    title: 'Classifier updates and a gripper decision',
    summary: 'A confusion table, a belief and a sequence of detections: $P(z)$ and the posterior after each, then the gripper with the higher expected success and $P(\\text{success})$ by total probability.',
    tiers: [1, 2, 3],
    source: 'Similar to 2025 Q28 (15 marks); summary notes §1 steps 3–6',
    cardId: 'bayes-decisions',
    marks: 15,
    sprint: false,
    generate(rng, tier) {
      return buildClassifierInstance(randomClassifierSpec(rng, tier), tier);
    },
  },
];
