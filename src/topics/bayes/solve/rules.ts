// Probability rules from a joint table (bayes-rules): marginalisation, the product rule (and its 2024 MCQ trap
// P(x | y)P(x)), Bayes' rule, independence vs conditional independence. The MCQ facts of every paper
// (2023 Q3, 2024 Q3, 2025 Q2–Q3, review deck slide 4), turned into numbers you compute.
import type { ChoicePart, NumericPart, SolveGenerator, SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { num, numericTraps } from './common';

interface Story {
  x: string;
  notX: string;
  y: string;
  notY: string;
  /** Symbols used in the maths. */
  sx: string;
  sy: string;
  scene: string;
  /** True when y is a sensor reading of x, so P(y | x) is a sensor model. */
  sensor: boolean;
}

const STORIES: Story[] = [
  { x: 'door', notX: 'wall', y: 'sensor reads “door”', notY: 'sensor reads “wall”', sx: 'd', sy: 's', sensor: true, scene: 'A robot drives along a corridor. At each cell it is either beside a door or a plain wall, and its door sensor reports “door” or “wall”' },
  { x: 'occupied', notX: 'free', y: 'lidar returns a hit', notY: 'no hit', sx: 'm', sy: 'h', sensor: true, scene: 'An occupancy-mapping robot looks at one grid cell, which is occupied or free; its lidar either returns a hit there or not' },
  { x: 'wet floor', notX: 'dry floor', y: 'wheels slip', notY: 'no slip', sx: 'w', sy: 'k', sensor: false, scene: 'A cleaning robot logs whether the floor is wet and whether its wheels slipped on each run' },
  { x: 'battery low', notX: 'battery fine', y: 'motor slow', notY: 'motor normal', sx: 'b', sy: 'v', sensor: false, scene: 'A delivery robot logs its battery state and whether its drive motor ran slow on each trip' },
];

interface CondStmt {
  given: string;
  question: string;
  a: string;
  b: string;
  c: string;
}

const COND: CondStmt[] = [
  { given: 'P(x_t \\mid x_{t-1}, x_{t-2}, u_t) = P(x_t \\mid x_{t-1}, u_t)', question: 'Then $x_t$ and $x_{t-2}$ are', a: 'x_t', b: 'x_{t-2}', c: 'x_{t-1}, u_t' },
  { given: 'P(z_t \\mid x_t, z_{t-1}) = P(z_t \\mid x_t)', question: 'Then $z_t$ and $z_{t-1}$ are', a: 'z_t', b: 'z_{t-1}', c: 'x_t' },
  { given: 'P(x_1 \\mid u, x_0) = P(x_1 \\mid u)', question: 'Then $x_1$ and $x_0$ are', a: 'x_1', b: 'x_0', c: 'u' },
];

interface RulesSpec {
  story: Story;
  /** Joint table, rounded to 3 decimals and summing to 1: [P(x,y), P(x,¬y), P(¬x,y), P(¬x,¬y)]. */
  joint: [number, number, number, number];
  independent: boolean;
  cond: CondStmt;
}

function randomSpec(rng: Rng, tier: Tier): RulesSpec {
  for (let k = 0; k < 200; k++) {
    const story = rng.pick(STORIES);
    const px = rng.step(0.15, 0.6, 0.05);
    const independent = tier === 2 && rng.chance(0.25);
    const pyx = rng.step(0.6, 0.95, 0.05);
    const pynx = independent ? pyx : rng.step(0.05, 0.4, 0.05);
    const raw = [pyx * px, (1 - pyx) * px, pynx * (1 - px), (1 - pynx) * (1 - px)];
    const r = raw.map((v) => Number(v.toFixed(4)));
    r[3] = Number((1 - r[0] - r[1] - r[2]).toFixed(4));
    if (r.some((v) => v <= 0.005)) continue;
    // With rounding, "independent" must still hold to the printed precision.
    const Px = r[0] + r[1];
    const Py = r[0] + r[2];
    const indepNow = Math.abs(r[0] - Px * Py) < 5e-4;
    if (independent !== indepNow) continue;
    return { story, joint: r as [number, number, number, number], independent, cond: rng.pick(COND) };
  }
  return { story: STORIES[0], joint: [0.24, 0.06, 0.07, 0.63], independent: false, cond: COND[0] };
}

const tx = (s: string) => `\\text{${s}}`;

function buildRules(spec: RulesSpec, tier: Tier): SolveInstance {
  const { story: s, joint } = spec;
  const [xy, xny, nxy, nxny] = joint;
  const Px = xy + xny;
  const Py = xy + nxy;
  const PyGx = xy / Px;
  const PxGy = xy / Py;
  const X = s.sx;
  const Y = s.sy;
  const nX = `\\neg ${X}`;
  const nY = `\\neg ${Y}`;
  const table = `$$\\begin{array}{c|cc} & ${Y}\\ (${tx(s.y)}) & ${nY}\\ (${tx(s.notY)}) \\\\ \\hline ${X}\\ (${tx(s.x)}) & ${num(xy)} & ${num(xny)} \\\\ ${nX}\\ (${tx(s.notX)}) & ${num(nxy)} & ${num(nxny)} \\end{array}$$`;
  const prompt = [`${s.scene}. Over many trials the joint probabilities are:`, table, `Here $${X}$ = ${s.x} and $${Y}$ = ${s.y}; $\\neg$ means “not”.`].join('\n\n');

  const parts: SolvePart[] = [];
  const pxPart: NumericPart = {
    kind: 'numeric',
    id: 'px',
    label: `Marginalise: $P(${X})$`,
    answer: Px,
    unit: '',
    tol: 0.004,
    absTol: 0.001,
    traps: numericTraps(Px, [
      { value: xy, message: `That is the joint $P(${X}, ${Y})$ only. Sum over both values of $${Y}$: $P(${X}) = P(${X}, ${Y}) + P(${X}, ${nY})$.` },
      { value: Py, message: `That is $P(${Y})$ (a column sum). $P(${X})$ is the **row** sum for $${X}$.` },
    ]),
    marks: 1,
  };
  const pyxPart: NumericPart = {
    kind: 'numeric',
    id: 'pygx',
    label: s.sensor ? `Condition: the sensor model $P(${Y} \\mid ${X})$` : `Condition: $P(${Y} \\mid ${X})$, the probability of “${s.y}” given “${s.x}”`,
    answer: PyGx,
    unit: '',
    tol: 0.004,
    absTol: 0.001,
    traps: numericTraps(PyGx, [
      { value: xy / Py, message: `That divides by $P(${Y})$, which gives $P(${X} \\mid ${Y})$. To condition on $${X}$, divide by $P(${X})$.`, trapId: 'bayes-wrong-denominator' },
      { value: xy, message: `That is the joint $P(${X}, ${Y})$. Divide it by $P(${X})$: $P(${Y} \\mid ${X}) = P(${X}, ${Y}) / P(${X})$.` },
    ]),
    marks: 1,
  };
  const productRule: ChoicePart = {
    kind: 'choice',
    id: 'product',
    label: `Which expression is always equal to $P(${X}, ${Y})$?`,
    options: [
      { text: `$P(${X} \\mid ${Y})\\,P(${Y})$`, correct: true, why: `The product rule: condition on $${Y}$, then multiply by the probability of $${Y}$. Here ${num(PxGy)} × ${num(Py)} = ${num(xy)}.` },
      { text: `$P(${X} \\mid ${Y})\\,P(${X})$`, correct: false, why: `The 2024 MCQ distractor. Multiplying a probability conditioned on $${Y}$ by $P(${X})$ mixes the two: ${num(PxGy)} × ${num(Px)} = ${num(PxGy * Px)}, not ${num(xy)}.` },
      { text: `$P(${X})\\,P(${Y})$`, correct: false, why: spec.independent ? `True **here** (these variables happen to be independent), but not always: it is the definition of independence, not a rule.` : `Only for independent variables. Here ${num(Px)} × ${num(Py)} = ${num(Px * Py)} ≠ ${num(xy)}.` },
      { text: `$P(${X} \\mid ${Y}) / P(${Y})$`, correct: false, why: `Dividing goes the wrong way: $P(${X} \\mid ${Y}) = P(${X}, ${Y}) / P(${Y})$, so the joint is the product, not the quotient.` },
    ],
    marks: 1,
  };
  parts.push(pxPart, pyxPart, productRule);

  if (tier >= 2) {
    parts.push({
      kind: 'numeric',
      id: 'py',
      label: `Marginalise: $P(${Y})$, the evidence`,
      answer: Py,
      unit: '',
      tol: 0.004,
      absTol: 0.001,
      traps: numericTraps(Py, [{ value: Px, message: `That is $P(${X})$ (a row sum). $P(${Y})$ is the column sum for $${Y}$.` }]),
      marks: 1,
    });
    parts.push({
      kind: 'numeric',
      id: 'pxgy',
      label: `Bayes’ rule: $P(${X} \\mid ${Y}) = \\dfrac{P(${Y} \\mid ${X})\\,P(${X})}{P(${Y})}$`,
      answer: PxGy,
      unit: '',
      tol: 0.004,
      absTol: 0.001,
      traps: numericTraps(PxGy, [
        { value: PyGx, message: `That is $P(${Y} \\mid ${X})$, the sensor model. Bayes’ rule turns it round using the prior $P(${X})$ and the evidence $P(${Y})$.`, trapId: 'bayes-inverse' },
        { value: PyGx * Px, message: `That is the numerator $P(${Y} \\mid ${X})P(${X}) = P(${X}, ${Y})$. Divide by the evidence $P(${Y})$ = ${num(Py)}.`, trapId: 'normalise' },
      ]),
      marks: 2,
    });
    parts.push({
      kind: 'choice',
      id: 'indep',
      label: `Are $${X}$ and $${Y}$ independent?`,
      options: [
        {
          text: `Yes: $P(${X}, ${Y}) = P(${X})P(${Y})$`,
          correct: spec.independent,
          why: spec.independent
            ? `${num(Px)} × ${num(Py)} = ${num(Px * Py)} = $P(${X}, ${Y})$, so knowing $${Y}$ tells you nothing about $${X}$: $P(${X} \\mid ${Y}) = P(${X})$ = ${num(Px)}.`
            : `${num(Px)} × ${num(Py)} = ${num(Px * Py)} ≠ ${num(xy)}.`,
        },
        {
          text: `No: $P(${X}, ${Y}) \\ne P(${X})P(${Y})$`,
          correct: !spec.independent,
          why: spec.independent
            ? `Check the product: ${num(Px)} × ${num(Py)} = ${num(Px * Py)}, equal to the joint ${num(xy)}.`
            : `${num(Px)} × ${num(Py)} = ${num(Px * Py)} ≠ ${num(xy)}: seeing $${Y}$ changes the belief in $${X}$ from ${num(Px)} to ${num(PxGy)}.`,
        },
      ],
      marks: 1,
    });
    const c = spec.cond;
    parts.push({
      kind: 'choice',
      id: 'cond',
      label: `Suppose $${c.given}$. ${c.question}`,
      options: [
        { text: 'dependent', correct: false, why: `Without knowing $${c.c}$ they usually are dependent, but that is not what the equation states. It says that once $${c.c}$ is known, $${c.b}$ adds nothing about $${c.a}$: a statement of conditional independence.` },
        { text: 'independent', correct: false, why: `Independence would be $P(${c.a} \\mid ${c.b}) = P(${c.a})$ with nothing else given. Here $${c.c}$ stays on both sides: they may well be dependent when $${c.c}$ is unknown.` },
        { text: `conditionally independent given $${c.c}$`, correct: true, why: `$P(a \\mid b, c) = P(a \\mid c)$ is the definition: once $${c.c}$ is known, $${c.b}$ tells you nothing more about $${c.a}$. This is exactly what the Markov assumption claims.` },
      ],
      marks: 1,
    });
  }

  const h1 =
    'A joint table holds everything. **Marginalise** (add along a row or a column) to get a single variable’s probability. **Condition** by dividing a joint entry by the probability of what you condition on. **Bayes’ rule** turns the sensor model $P(z \\mid x)$ into the posterior $P(x \\mid z)$ using the prior and the evidence.';
  const h2 = [
    `$$P(${X}) = P(${X}, ${Y}) + P(${X}, ${nY}), \\qquad P(${Y} \\mid ${X}) = \\frac{P(${X}, ${Y})}{P(${X})}$$`,
    `$$P(${X}, ${Y}) = P(${X} \\mid ${Y})\\,P(${Y}) = P(${Y} \\mid ${X})\\,P(${X})$$`,
    ...(tier >= 2 ? [`$$P(${X} \\mid ${Y}) = \\frac{P(${Y} \\mid ${X})\\,P(${X})}{P(${Y})}, \\qquad \\text{independent} \\iff P(${X}, ${Y}) = P(${X})P(${Y})$$`] : []),
  ].join('\n\n');
  const h3 = [
    `$P(${X}) = ${num(xy)} + ${num(xny)}$, and $P(${Y} \\mid ${X}) = ${num(xy)} / P(${X})$.`,
    ...(tier >= 2 ? [`$P(${Y}) = ${num(xy)} + ${num(nxy)}$, and $P(${X} \\mid ${Y}) = P(${Y} \\mid ${X}) \\times P(${X}) / P(${Y})$. For independence compare $P(${X})P(${Y})$ with ${num(xy)}.`] : []),
  ].join('\n\n');
  const w = [
    `$P(${X}) = ${num(xy)} + ${num(xny)} =$ **${num(Px)}**; $P(${Y} \\mid ${X}) = ${num(xy)} / ${num(Px)} =$ **${num(PyGx)}**.`,
    `Product rule: **$P(${X}, ${Y}) = P(${X} \\mid ${Y})P(${Y})$** (not $P(${X} \\mid ${Y})P(${X})$).`,
  ];
  if (tier >= 2) {
    w.push(
      `$P(${Y}) = ${num(xy)} + ${num(nxy)} =$ **${num(Py)}**; $P(${X} \\mid ${Y}) = ${num(PyGx)} \\times ${num(Px)} / ${num(Py)} =$ **${num(PxGy)}** (prior ${num(Px)} → posterior ${num(PxGy)}).`,
      `$P(${X})P(${Y}) = ${num(Px * Py)}$ ${spec.independent ? '=' : '\\ne'} ${num(xy)}: **${spec.independent ? 'independent' : 'not independent'}**.`,
      `$${spec.cond.given}$: **conditionally independent given $${spec.cond.c}$**.`
    );
  }
  return {
    prompt,
    givens: [
      { sym: `P(${X}, ${Y})`, value: num(xy), label: `${s.x} and ${s.y}` },
      { sym: `P(${X}, ${nY})`, value: num(xny) },
      { sym: `P(${nX}, ${Y})`, value: num(nxy) },
      { sym: `P(${nX}, ${nY})`, value: num(nxny) },
    ],
    parts,
    hints: [h1, h2, h3, w.join('\n\n')],
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'bayes-rules',
    title: 'Probability rules from a joint table',
    summary: 'Marginalise, condition, apply the product rule and Bayes’ rule, and tell independence from conditional independence, on one joint table.',
    tiers: [1, 2],
    source: 'Similar to 2023 Q3, 2024 Q3, 2025 Q2–Q3 (MCQ); review deck slide 4',
    cardId: 'bayes-rules',
    marks: 4,
    generate(rng, tier) {
      return buildRules(randomSpec(rng, tier), tier);
    },
  },
];
