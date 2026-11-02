// Occupancy exam templates.
//   slam-occupancy: the 2023 Q31 / review-deck long answer (prior, sensor table, posterior and log-odds after
//                   each reading, why it stays high). Tier 1 one reading; tier 2 the paper; tier 3 a non-0.5
//                   prior, or the log-odds form only from a given inverse sensor model.
//   slam-logodds:   log-odds arithmetic and conversion back to probability (tier 1), and a lidar inverse
//                   sensor model with hit / pass counts (tier 2).
// Every number comes from core/slam.ts (the same code as the simulation).
import type { ChoicePart, MatrixPart, NumericPart, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { fromLogOdds, logOdds, occupancyTable, readingStep, type BinaryReading, type BinarySensor, type OccRow } from '../../../core/slam';
import { occupancyUpdate } from '../../../core/prob';
import { registerTraps } from '../../../engine/traps';

registerTraps([
  { id: 'slam-log10', title: 'Log-odds use the natural log', detail: '$l = \\ln\\frac{p}{1-p}$. The review deck’s 4.4451 is $\\ln(0.9884/0.0116)$; $\\log_{10}$ gives 1.93.' },
  { id: 'slam-prior-reuse', title: 'The previous posterior is the next prior', detail: 'For reading $t$, use $p(m \\mid z_{1:t-1})$ as the prior, not the starting 0.5 again.' },
  { id: 'slam-accumulate', title: 'Log-odds accumulate', detail: '$l_t = l_{t-1} + \\ln\\text{LR}(z_t)$: add each reading’s step to the running total.' },
  { id: 'slam-odds-not-prob', title: 'Odds are not probabilities', detail: '$e^{l} = p/(1-p)$ is the odds. Convert back with $p = 1 - \\frac{1}{1+e^{l}}$.' },
]);

/** Probabilities: ±0.002 (the checker's 0.3 % floor applies above 0.67). */
const P = { tol: 0.001, absTol: 0.002 };
/** Log-odds: carrying 4-d.p. probabilities shifts the 3rd decimal (review deck: 4.4451 vs exact 4.4427). */
const LO = { tol: 0.006, absTol: 0.012 };

const f2 = (x: number) => x.toFixed(2);
const f3 = (x: number) => x.toFixed(3);
const f4 = (x: number) => x.toFixed(4);
/** Signed, TeX-safe: +2.639 / -1.153. */
const sg = (x: number, d = 3) => (x >= 0 ? `+${x.toFixed(d)}` : `-${Math.abs(x).toFixed(d)}`);
const ZN: Record<BinaryReading, string> = { occ: 'OCCUPIED', free: 'FREE' };
const ZT: Record<BinaryReading, string> = { occ: '\\text{occ}', free: '\\text{free}' };

type Trap = { value: number; message: string; trapId?: string };

/** Keep the traps that cannot be confused with the answer (and drop duplicates / nulls). */
function keepTraps(answer: number, absTol: number, list: (Trap | null)[]): Trap[] {
  const seen = new Set<string>();
  const gap = Math.max(3 * absTol, 0.012 * Math.abs(answer));
  return list.filter((t): t is Trap => {
    if (!t || !Number.isFinite(t.value) || Math.abs(t.value - answer) <= gap) return false;
    const k = t.value.toFixed(4);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ------------------------------------------------------------------ random sensors and readings

/** A sensor whose two readings clearly differ in strength (|ln LR_occ + ln LR_free| ≥ 0.4). */
function randomSensor(rng: Rng, opts: { paper?: boolean; flipShare?: number } = {}): BinarySensor {
  if (opts.paper && rng.chance(0.25)) return rng.pick([{ tp: 0.85, tn: 0.99 }, { tp: 0.7, tn: 0.95 }]);
  const flip = rng.chance(opts.flipShare ?? 0.25);
  for (let k = 0; k < 60; k++) {
    const s = flip ? { tp: rng.step(0.9, 0.99, 0.01), tn: rng.step(0.6, 0.85, 0.05) } : { tp: rng.step(0.6, 0.9, 0.05), tn: rng.step(0.9, 0.99, 0.01) };
    if (Math.abs(s.tp - s.tn) < 0.05) continue;
    if (Math.abs(readingStep('occ', s) + readingStep('free', s)) < 0.4) continue;
    return s;
  }
  return { tp: 0.7, tn: 0.95 };
}

const SEQS2: BinaryReading[][] = [
  ['occ', 'free'],
  ['occ', 'free'],
  ['occ', 'free'],
  ['occ', 'free'],
  ['free', 'occ'],
  ['free', 'occ'],
  ['occ', 'free', 'free'],
  ['occ', 'occ', 'free'],
];

// ------------------------------------------------------------------ parts

/** (a) The prior and WHY: one option has the right number for the wrong reason, so the reason earns the mark. */
function priorPart(s: BinarySensor, marks: number): ChoicePart {
  const pOcc = 0.5 * s.tp + 0.5 * (1 - s.tn);
  return {
    kind: 'choice',
    id: 'prior',
    label: '(a) What is an appropriate prior occupancy probability $p(m)$, and why?',
    options: [
      {
        text: '0.5: with no information, occupied and free are equally likely, so its log-odds is 0 and it adds no bias',
        correct: true,
        why: 'The uninformative (maximum-entropy) prior. In log-odds $l_0 = \\ln(0.5/0.5) = 0$, so the map is built from the readings alone (2023 Q31a).',
      },
      {
        text: '0.5: before any reading the sensor is equally likely to report OCCUPIED or FREE',
        correct: false,
        why: `Right number, wrong reason. The prior is a belief about the **cell**, not about the sensor’s output, and the sensor is not even: $p(z = \\text{occ}) = 0.5 \\times ${f2(s.tp)} + 0.5 \\times ${f2(1 - s.tn)} = ${f3(pOcc)}$. The reason for 0.5 is that, with no information, occupied and free are equally likely.`,
      },
      {
        text: '0: unexplored space should count as free until a reading says otherwise',
        correct: false,
        why: 'A prior of 0 is certainty: $l_0 = -\\infty$ and Bayes’ rule multiplies by $p(m) = 0$, so no reading could ever mark the cell occupied (2025 Q22).',
      },
      {
        text: '1: treat every unknown cell as occupied, to be safe',
        correct: false,
        why: 'Also certainty ($l_0 = +\\infty$): the cell could never be cleared, however many FREE readings arrive (2025 Q22).',
      },
      {
        text: `${f2(s.tp)}, the true-positive rate: how often the sensor detects an obstacle`,
        correct: false,
        why: 'TP is a property of the sensor, $p(z = \\text{occ} \\mid m)$, not of the cell. The prior describes the cell before any reading.',
      },
    ],
    marks,
  };
}

function tablePart(s: BinarySensor, marks: number, tag = ''): MatrixPart {
  return {
    kind: 'matrix',
    id: 'table',
    label: `${tag}Set up the sensor model $p(z \\mid \\text{state})$: rows are the true state of the cell, columns the reading.`,
    answer: [
      [s.tp, 1 - s.tp],
      [1 - s.tn, s.tn],
    ],
    rowLabels: ['$m$ (occupied)', '$\\neg m$ (free)'],
    colLabels: ['$z = \\text{occ}$', '$z = \\text{free}$'],
    absTol: 0.002,
    traps: [
      {
        value: [
          [s.tp, 1 - s.tp],
          [s.tn, 1 - s.tn],
        ],
        message: `In the $\\neg m$ row a free cell reads FREE with probability TN, so $p(\\text{occ} \\mid \\neg m) = 1 - \\text{TN}$ = ${f2(1 - s.tn)} (the false-positive rate) and $p(\\text{free} \\mid \\neg m)$ = ${f2(s.tn)}.`,
        trapId: 'false-positive',
      },
      {
        value: [
          [s.tp, 1 - s.tn],
          [1 - s.tp, s.tn],
        ],
        message: 'Rows are the TRUE state and each row sums to 1: the $m$ row is $(\\text{TP}, 1-\\text{TP})$, the $\\neg m$ row $(1-\\text{TN}, \\text{TN})$.',
        trapId: 'likelihood-column',
      },
    ],
    marks,
  };
}

/** p(m | z_1:t) for one reading, with the instance's known wrong answers. */
function probPart(r: OccRow, s: BinarySensor, p0: number, label: string, marks: number): NumericPart {
  const wrongCol = r.z === 'occ' ? (s.tp * r.prior) / (s.tp * r.prior + s.tn * (1 - r.prior)) : ((1 - s.tp) * r.prior) / ((1 - s.tp) * r.prior + (1 - s.tn) * (1 - r.prior));
  return {
    kind: 'numeric',
    id: `p${r.t}`,
    label,
    answer: r.post,
    unit: '',
    ...P,
    traps: keepTraps(r.post, P.absTol, [
      r.t > 1
        ? { value: occupancyUpdate(p0, r.z, s), message: `You started from the prior ${p0} again. The posterior after reading ${r.t - 1}, ${f4(r.prior)}, is the prior for reading ${r.t}.`, trapId: 'slam-prior-reuse' }
        : null,
      { value: r.num, message: `That is only the numerator $p(z_${r.t} \\mid m)\\,p(m)$ = ${f4(r.num)}. Divide by the evidence $p(z_${r.t}) = ${f4(r.num)} + ${f4(r.den - r.num)} = ${f4(r.den)}$.`, trapId: 'normalise' },
      {
        value: wrongCol,
        message:
          r.z === 'occ'
            ? `For an OCCUPIED reading, $p(\\text{occ} \\mid \\neg m)$ is the false-positive rate $1 - \\text{TN}$ = ${f2(1 - s.tn)}, not TN.`
            : `For a FREE reading, $p(\\text{free} \\mid \\neg m)$ is TN = ${f2(s.tn)} and $p(\\text{free} \\mid m)$ is the miss rate $1 - \\text{TP}$ = ${f2(1 - s.tp)}.`,
        trapId: 'false-positive',
      },
      { value: 1 - r.post, message: 'That is $p(\\neg m)$, the probability the cell is FREE. The question asks for $p(m)$.', trapId: 'sign' },
    ]),
    marks,
  };
}

/** Log-odds l_t, with the log10 and "forgot to accumulate" traps. */
function logOddsPart(id: string, answer: number, step: number | null, prev: number | null, label: string, marks: number): NumericPart {
  return {
    kind: 'numeric',
    id,
    label,
    answer,
    unit: '',
    ...LO,
    traps: keepTraps(answer, LO.absTol, [
      { value: answer / Math.LN10, message: 'That is $\\log_{10}$. Log-odds use the natural log: $l = \\ln\\frac{p}{1-p}$.', trapId: 'slam-log10' },
      step !== null && prev !== null && Math.abs(prev) > 1e-9
        ? { value: step, message: `That is only this reading’s step $\\ln\\text{LR} = ${sg(step)}$. Log-odds accumulate: add it to the previous $l = ${sg(prev)}$.`, trapId: 'slam-accumulate' }
        : null,
      { value: Math.exp(answer), message: 'That is the odds $e^{l} = p/(1-p)$. The log-odds is its natural log.', trapId: 'slam-odds-not-prob' },
    ]),
    marks,
  };
}

/**
 * "Why does it end high / low?" built from this instance's likelihood ratios. Every option quotes this instance's
 * numbers, so the key cannot be spotted as the only specific one: the distractors are the row-ratio slip (strength
 * read along the m row), "the first reading sets the answer" and "the filter discounts a contradicting reading".
 */
function whyPart(s: BinarySensor, rows: OccRow[], label: string, marks: number): ChoicePart {
  const dO = readingStep('occ', s);
  const dF = readingStep('free', s);
  const nO = rows.filter((r) => r.z === 'occ').length;
  const nF = rows.length - nO;
  const last = rows[rows.length - 1];
  const high = last.post > 0.5;
  const lrO = s.tp / (1 - s.tn);
  const lrF = s.tn / (1 - s.tp);
  const sum = `${nO > 1 ? `${nO} \\times ` : ''}(${sg(dO, 2)}) ${nF > 1 ? `+ ${nF} \\times ` : '+ '}(${sg(dF, 2)}) = ${sg(last.l, 2)}`;
  const strongOcc = dO > -dF;
  const correct = strongOcc
    ? `OCC is the stronger evidence: false alarms are rare ($1 - \\text{TN}$ = ${f2(1 - s.tn)}) and misses common ($1 - \\text{TP}$ = ${f2(1 - s.tp)}), so OCC is ${lrO.toFixed(1)}× evidence and FREE only ${lrF.toFixed(1)}×: $${sum}$`
    : `FREE is the stronger evidence: misses are rare ($1 - \\text{TP}$ = ${f2(1 - s.tp)}) and false alarms common ($1 - \\text{TN}$ = ${f2(1 - s.tn)}), so FREE is ${lrF.toFixed(1)}× evidence and OCC only ${lrO.toFixed(1)}×: $${sum}$`;
  const doubt = high ? 'FREE' : 'OCC';
  const other = high ? 'OCC' : 'FREE';
  const plural = (high ? nF : nO) > 1;
  const rowStep = Math.log(s.tp / (1 - s.tp));
  return {
    kind: 'choice',
    id: 'why',
    label,
    options: [
      {
        text: correct,
        correct: true,
        why: `Each reading adds its own fixed $\\ln\\text{LR}$ whatever the current belief (${f2(s.tp)}/${f2(1 - s.tn)} for OCC, ${f2(1 - s.tp)}/${f2(s.tn)} for FREE), so the total decides: $${sum}$, $p = ${f4(last.post)}$.`,
      },
      {
        text: `An occupied cell reads OCC much more often than FREE (${f2(s.tp)} against ${f2(1 - s.tp)} in the $m$ row), so each OCC reading outweighs each FREE one by $\\ln(${f2(s.tp)}/${f2(1 - s.tp)}) = ${sg(rowStep, 2)}$`,
        correct: false,
        why: `That ratio runs along the $m$ row and ignores the free cell. A reading’s strength compares the same reading under both states, down its column: OCC $${f2(s.tp)}/${f2(1 - s.tn)}$, FREE $${f2(1 - s.tp)}/${f2(s.tn)}$. The false-positive rate $1 - \\text{TN}$ is what makes an OCC reading convincing.`,
      },
      {
        text: `The first reading set the prior for the rest: once the cell was at ${f4(rows[0].post)}, later readings could only fine-tune it, so the order of the readings decided the result`,
        correct: false,
        why: `Order does not matter: the log-odds just add ($${sum}$), so the same readings in any order give ${f4(last.post)}. Each reading moves the log-odds by its own fixed $\\ln\\text{LR}$, whatever the cell already believes.`,
      },
      {
        text: `The filter treats the ${doubt} reading${plural ? 's' : ''} as ${plural ? 'probable sensor errors' : 'a probable sensor error'}, because ${plural ? 'they contradict' : 'it contradicts'} the ${other} evidence, and gives ${plural ? 'them' : 'it'} less than the usual $${sg(doubt === 'FREE' ? dF : dO, 2)}$ in log-odds`,
        correct: false,
        why: `The filter never judges a reading wrong: every ${doubt} reading is weighed by the same likelihood ratio and moves the log-odds by the full $${sg(doubt === 'FREE' ? dF : dO, 2)}$. It is simply outweighed by the ${other} evidence: $${sum}$.`,
      },
    ],
    marks,
  };
}

// ------------------------------------------------------------------ worked tables

function stepTable(rows: OccRow[], bold: boolean): string {
  const b = (x: string) => (bold ? `\\mathbf{${x}}` : x);
  const head = 't & z_t & p(z_t \\mid m) & p(z_t \\mid \\neg m) & p(m)\\ \\text{before} & p(m)\\ \\text{after} & \\ln\\text{LR} & l_t';
  const body = rows
    .map((r) => `${r.t} & ${ZT[r.z]} & ${f2(r.pzm)} & ${f2(r.pznm)} & ${f4(r.prior)} & ${b(f4(r.post))} & ${sg(r.dl)} & ${b(sg(r.l))}`)
    .join(' \\\\ ');
  return `$$\\begin{array}{c|c|cc|cc|cc} ${head} \\\\ \\hline ${body} \\end{array}$$`;
}

function sensorTex(s: BinarySensor): string {
  return `$$\\begin{array}{c|cc|c} & z = \\text{occ} & z = \\text{free} & \\Sigma \\\\ \\hline m & ${f2(s.tp)} & ${f2(1 - s.tp)} & 1 \\\\ \\neg m & ${f2(1 - s.tn)} & ${f2(s.tn)} & 1 \\end{array}$$`;
}

function bayesLine(r: OccRow): string {
  return `$$p(m \\mid z_{1:${r.t}}) = \\frac{${f2(r.pzm)} \\times ${f4(r.prior)}}{${f2(r.pzm)} \\times ${f4(r.prior)} + ${f2(r.pznm)} \\times ${f4(1 - r.prior)}} = \\frac{${f4(r.num)}}{${f4(r.den)}} = ${f4(r.post)}$$`;
}

const BAYES_SYM =
  '$$p(m \\mid z_{1:t}) = \\frac{p(z_t \\mid m)\\,p(m \\mid z_{1:t-1})}{p(z_t \\mid m)\\,p(m \\mid z_{1:t-1}) + p(z_t \\mid \\neg m)\\,\\big(1 - p(m \\mid z_{1:t-1})\\big)}$$';
const LOG_SYM = '$$l_t = l_{t-1} + \\ln\\frac{p(m \\mid z_t)}{1 - p(m \\mid z_t)} - l_0 = l_{t-1} + \\ln\\frac{p(z_t \\mid m)}{p(z_t \\mid \\neg m)}, \\qquad p = 1 - \\frac{1}{1 + e^{l_t}}$$';
const TABLE_SYM =
  '$$\\begin{array}{c|cc|c} & z = \\text{occ} & z = \\text{free} & \\Sigma \\\\ \\hline m & \\text{TP} & 1 - \\text{TP} & 1 \\\\ \\neg m & 1 - \\text{TN} & \\text{TN} & 1 \\end{array}$$';

const isReview = (s: BinarySensor, zs: readonly BinaryReading[]) => Math.abs(s.tp - 0.85) < 1e-9 && Math.abs(s.tn - 0.99) < 1e-9 && zs[0] === 'occ' && zs[1] === 'free';

function seqText(zs: readonly BinaryReading[]): string {
  return zs.map((z) => ZN[z]).join(', then ');
}

// ------------------------------------------------------------------ slam-occupancy

function occTier1(rng: Rng) {
  const s = randomSensor(rng, { paper: true });
  const z: BinaryReading = rng.chance(0.7) ? 'occ' : 'free';
  const rows = occupancyTable(0.5, [z], s);
  const r = rows[0];
  const prompt = `A robot is building an occupancy grid. Its range sensor has a probability of true positive of ${f2(s.tp)} and a probability of true negative of ${f2(s.tn)}. One grid cell starts at the uninformative prior $p(m) = 0.5$, and the sensor then reports it as **${ZN[z]}**.`;
  const parts: SolvePart[] = [
    tablePart(s, 1),
    probPart(r, s, 0.5, `Occupancy probability $p(m \\mid z_1)$ after the ${ZN[z]} reading`, 2),
    logOddsPart('l1', r.l, null, null, 'Log-odds $l_1 = \\ln\\frac{p}{1-p}$ after the reading', 1),
  ];
  const hints: [string, string, string, string] = [
    'The cell is one binary variable $m$ (occupied or not). Bayes’ rule: posterior ∝ likelihood × prior. The likelihood is the column of the sensor table for the reading you got, one entry per true state. Each row of the table sums to 1.',
    `${TABLE_SYM}${BAYES_SYM}and in log-odds, starting from $l_0 = 0$: ${LOG_SYM}`,
    `${sensorTex({ tp: s.tp, tn: s.tn })}The reading is ${ZN[z]}, so the likelihoods are $p(${ZT[z]} \\mid m)$ = ${f2(r.pzm)} and $p(${ZT[z]} \\mid \\neg m)$ = ${f2(r.pznm)}: $$p(m \\mid z_1) = \\frac{${f2(r.pzm)} \\times 0.5}{${f2(r.pzm)} \\times 0.5 + ${f2(r.pznm)} \\times 0.5}$$`,
    [
      sensorTex(s),
      bayesLine(r),
      `$$l_1 = 0 + \\ln\\frac{${f2(r.pzm)}}{${f2(r.pznm)}} = ${sg(r.l)}, \\qquad 1 - \\frac{1}{1 + e^{${sg(r.l)}}} = ${f4(r.post)}\\ \\checkmark$$`,
      `$\\mathbf{p(m \\mid z_1) = ${f4(r.post)}}$, $\\mathbf{l_1 = ${sg(r.l)}}$ (dimensionless). ${z === 'occ' ? 'One OCC reading' : 'One FREE reading'} is $\\text{LR} = ${f2(r.pzm)}/${f2(r.pznm)} = ${(r.pzm / r.pznm).toFixed(r.lr >= 1 ? 1 : 3)}$ times evidence.`,
    ].join('\n\n'),
  ];
  return { prompt, givens: givensOf(s, [z], 0.5), parts, hints };
}

function givensOf(s: BinarySensor, zs: readonly BinaryReading[], p0: number) {
  return [
    { sym: '\\text{TP}', value: f2(s.tp), label: 'p(z = occ | m)' },
    { sym: '\\text{TN}', value: f2(s.tn), label: 'p(z = free | ¬m)' },
    { sym: 'p_0', value: String(p0), label: 'prior occupancy' },
    { sym: 'z_{1:' + zs.length + '}', value: zs.map((z) => (z === 'occ' ? 'occ' : 'free')).join(', '), label: 'readings, in order' },
  ];
}

function occTier2(rng: Rng) {
  const s = randomSensor(rng, { paper: true });
  const zs = rng.pick(SEQS2);
  const rows = occupancyTable(0.5, zs, s);
  const n = rows.length;
  const last = rows[n - 1];
  const prompt = `A robot is attempting to determine the occupancy of a grid cell. It is equipped with a sensor with:\n\n- probability of true positive: ${f2(s.tp)}\n- probability of true negative: ${f2(s.tn)}\n\nInitially the robot has no knowledge about the occupancy of the cell. The sensor then returns ${n} readings of the cell: **${seqText(zs)}**. Show the probability and the log-odds after each reading.`;
  const parts: SolvePart[] = [priorPart(s, 2), tablePart(s, 1, '(b) ')];
  const pm = n === 2 ? [1.5, 2] : [1, 1, 1];
  const lm = n === 2 ? [0.5, 1] : [0.5, 0.5, 1];
  rows.forEach((r, k) => {
    const tag = k === 0 ? '(b)' : n === 2 ? '(c)' : `(${String.fromCharCode(99 + k - 1)})`;
    parts.push(probPart(r, s, 0.5, `${tag} Occupancy probability after reading ${r.t} ($z_${r.t}$ = ${ZN[r.z]})`, pm[k]));
    parts.push(logOddsPart(`l${r.t}`, r.l, r.dl, r.lPrev, `Log-odds $l_${r.t}$ after reading ${r.t}`, lm[k]));
  });
  const whyLabel =
    n === 2 && zs[0] === 'occ' && last.post > 0.5
      ? `(d) Explain why the occupancy probability does not fall much after the FREE reading (it is still ${f4(last.post)}).`
      : `(${n === 2 ? 'd' : 'e'}) Explain the final value: why is the cell ${last.post > 0.5 ? 'still more likely occupied' : 'more likely free'} ($p$ = ${f4(last.post)}) after these readings?`;
  parts.push(whyPart(s, rows, whyLabel, 2));

  const dO = readingStep('occ', s);
  const dF = readingStep('free', s);
  const review = isReview(s, zs);
  const note = review
    ? '\n\nThe review deck’s slide gives 0.9281 because it carries the rounded 0.9884 (and 4.4451 for $l_1$ from the rounded inverse sensor model); exact arithmetic gives 0.92795 and $\\ln 85 = 4.4427$. Both are accepted.'
    : '\n\nCarrying 4-d.p. intermediate values can move the last digit; answers within ±0.002 (probabilities) are accepted.';
  const hints: [string, string, string, string] = [
    'Each grid cell holds one binary variable $m$ with its own Bayes filter. With no knowledge, start from 0.5 (log-odds 0), never 0 or 1. Each reading: posterior ∝ likelihood × prior, and **the previous posterior becomes the next prior**. In log-odds each reading simply adds $\\ln\\text{LR}$, its likelihood ratio, so a strong reading outweighs a weak one whatever the order.',
    `Sensor table (rows = true state, each row sums to 1):${TABLE_SYM}${BAYES_SYM}${LOG_SYM}`,
    [
      sensorTex(s),
      `Reading 1 (${ZN[rows[0].z]}):${bayesLine(rows[0])}`,
      `Then reading 2 uses ${f4(rows[0].post)} as its prior, with likelihoods ${f2(rows[1].pzm)} and ${f2(rows[1].pznm)}. Log-odds steps: OCC adds $\\ln\\frac{${f2(s.tp)}}{${f2(1 - s.tn)}} = ${sg(dO)}$, FREE adds $\\ln\\frac{${f2(1 - s.tp)}}{${f2(s.tn)}} = ${sg(dF)}$.`,
    ].join('\n\n'),
    [
      stepTable(rows, true),
      ...rows.slice(1).map((r) => `Reading ${r.t}:${bayesLine(r)}`),
      `(a) **0.5**: no information, so occupied and free are equally likely; $l_0 = 0$ adds no bias, and 0 or 1 could never be updated. ${rows.map((r) => `$p_${r.t} =$ **${f4(r.post)}**, $l_${r.t} =$ $\\mathbf{${sg(r.l)}}$`).join('; ')} (probabilities and log-odds are dimensionless). Check: $1 - 1/(1 + e^{${sg(last.l)}}) = ${f4(last.post)}$.`,
      `Why: OCC is $\\text{LR} = ${f2(s.tp)}/${f2(1 - s.tn)} = ${(s.tp / (1 - s.tn)).toFixed(2)}$ times evidence, FREE is $${f2(s.tn)}/${f2(1 - s.tp)} = ${(s.tn / (1 - s.tp)).toFixed(2)}$ times evidence the other way. In log-odds $${sg(dO, 2)}$ against $${sg(dF, 2)}$, so ${dO > -dF ? 'one FREE cannot cancel one OCC' : 'one OCC cannot cancel one FREE'}: $l_${n} = ${sg(last.l, 2)}$.${note}`,
    ].join('\n\n'),
  ];
  return { prompt, givens: givensOf(s, zs, 0.5), parts, hints };
}

/** Tier 3a: a prior other than 0.5 (from an old floor plan). */
function occTier3Prior(rng: Rng) {
  const s = randomSensor(rng, { flipShare: 0.2 });
  const p0 = rng.pick([0.2, 0.3, 0.4, 0.6, 0.7, 0.8]);
  const zs: BinaryReading[] = p0 < 0.5 ? rng.pick([['occ', 'occ', 'free'], ['occ', 'free', 'occ'], ['free', 'occ', 'occ']]) : rng.pick([['free', 'free', 'occ'], ['free', 'occ', 'free'], ['occ', 'free', 'free']]);
  const rows = occupancyTable(p0, zs, s);
  const l0 = logOdds(p0);
  const base = occupancyTable(0.5, zs, s);
  const last = rows[rows.length - 1];
  const prompt = `A robot updates an old occupancy map. For one cell the old floor plan suggests ${p0 < 0.5 ? 'it is probably free' : 'it is probably occupied'}, so the cell starts at $p(m) = ${p0}$ instead of the uninformative 0.5. The sensor has a probability of true positive of ${f2(s.tp)} and of true negative of ${f2(s.tn)}. It reports **${seqText(zs)}**.`;
  const parts: SolvePart[] = [
    logOddsPart('l0', l0, null, null, '(a) The prior in log-odds, $l_0$', 1),
    tablePart(s, 1, '(b) '),
  ];
  rows.forEach((r) => {
    const pp = probPart(r, s, p0, `(c) $p(m \\mid z_{1:${r.t}})$ after reading ${r.t} ($z_${r.t}$ = ${ZN[r.z]})`, 1);
    pp.traps = keepTraps(r.post, P.absTol, [
      ...(pp.traps ?? []),
      { value: base[r.t - 1].post, message: `That is the answer for a 0.5 prior. This cell starts at ${p0}: use it (and then each posterior) as the prior.`, trapId: 'slam-prior-reuse' },
    ]);
    parts.push(pp);
    const lp = logOddsPart(`l${r.t}`, r.l, r.dl, r.lPrev, `(c) Log-odds $l_${r.t}$`, 1);
    lp.traps = keepTraps(r.l, LO.absTol, [
      ...(lp.traps ?? []),
      { value: base[r.t - 1].l, message: `That ignores the prior. With $p_0 = ${p0}$ the running total starts at $l_0 = ${sg(l0)}$, not 0.`, trapId: 'slam-prior-reuse' },
      {
        value: base[r.t - 1].l - (r.t - 1) * l0,
        message: `You subtracted $l_0$ at every step from an inverse sensor model built with the 0.5 prior, which removes the prior again and again. Each step is just $\\ln\\text{LR}$: the $-l_0$ in the course form only cancels the $l_0$ that is inside $p(m \\mid z_t)$ when that is computed with this prior (${p0}).`,
        trapId: 'slam-prior-reuse',
      },
    ]);
    parts.push(lp);
  });
  parts.push({
    kind: 'choice',
    id: 'zero',
    label: `(d) Had the floor plan put this cell at exactly $p(m) = ${p0 < 0.5 ? 0 : 1}$, what would $p(m)$ be after the same three readings?`,
    options: [
      { text: `Exactly ${p0 < 0.5 ? 0 : 1}`, correct: true, why: `$l_0 = ${p0 < 0.5 ? '-' : '+'}\\infty$: adding finite steps leaves it there, and in Bayes form every numerator carries the factor $p(${p0 < 0.5 ? 'm' : '\\neg m'}) = 0$. The cell can never change, so a wrong prior becomes a permanent map error (2025 Q22).` },
      { text: `The same as now, ${f4(last.post)}`, correct: false, why: 'The prior matters: it sets the starting log-odds, and 0 or 1 is an infinite start that no finite reading can move.' },
      { text: `${f4(base[base.length - 1].post)}, the answer from the 0.5 prior`, correct: false, why: 'That is what you get starting from 0.5 ($l_0 = 0$). A prior of 0 or 1 is not “no information”; it is certainty.' },
      { text: `Slightly ${p0 < 0.5 ? 'below' : 'above'} ${f4(last.post)}: the readings still dominate`, correct: false, why: `Readings dominate any prior strictly between 0 and 1, but not ${p0 < 0.5 ? 0 : 1}: there $l_0$ is infinite.` },
    ],
    marks: 2,
  });
  const hints: [string, string, string, string] = [
    'A non-0.5 prior is just a starting offset in log-odds, $l_0 = \\ln\\frac{p_0}{1-p_0}$; every reading still adds its own $\\ln\\text{LR}$. In Bayes form, the first reading uses $p_0$ as its prior, and each posterior becomes the next prior. (Priors of exactly 0 or 1 are infinite offsets: nothing moves them.)',
    `$$l_0 = \\ln\\frac{p_0}{1 - p_0}$$${BAYES_SYM}${LOG_SYM}In the course form the inverse sensor model $p(m \\mid z_t)$ is computed **with this prior**, so its log-odds is $\\ln\\text{LR} + l_0$ and the $-l_0$ cancels it.`,
    `$$l_0 = \\ln\\frac{${p0}}{${f2(1 - p0)}} = ${sg(l0)}$$${sensorTex(s)}Reading 1:${bayesLine(rows[0])}Steps: OCC $\\ln\\frac{${f2(s.tp)}}{${f2(1 - s.tn)}} = ${sg(readingStep('occ', s))}$, FREE $\\ln\\frac{${f2(1 - s.tp)}}{${f2(s.tn)}} = ${sg(readingStep('free', s))}$.`,
    [
      stepTable(rows, true),
      `(a) $\\mathbf{l_0 = ${sg(l0)}}$. ${rows.map((r) => `$p_${r.t} =$ **${f4(r.post)}**, $l_${r.t} =$ $\\mathbf{${sg(r.l)}}$`).join('; ')}. Check: $1 - 1/(1 + e^{${sg(last.l)}}) = ${f4(last.post)}$. From a 0.5 prior the same readings would give ${f4(base[base.length - 1].post)}: the prior only shifts the start by $${sg(l0)}$.`,
      `(d) **${p0 < 0.5 ? 0 : 1}**: a prior of exactly ${p0 < 0.5 ? 0 : 1} is log-odds ${p0 < 0.5 ? '$-\\infty$' : '$+\\infty$'}, so no reading can ever change the cell (2025 Q22).`,
    ].join('\n\n'),
  ];
  return { prompt, givens: givensOf(s, zs, p0), parts, hints };
}

/** Tier 3b: the log-odds form only, from a given inverse sensor model (review deck slides 11-13). */
/**
 * True when "how many readings of the other kind bring p(m) back across 0.5?" is on a knife edge: the total is
 * near 0, or it is (nearly) a whole number of opposing steps, so the cell would land on, or within rounding of,
 * exactly 0.5. Re-pick the sensor as well as the counts: with a symmetric sensor (or steps in a 2 : 1 ratio) every
 * count lands on a whole number.
 */
function knifeEdge(total: number, lUp: number, lDown: number): boolean {
  const step = Math.abs(total > 0 ? lDown : lUp);
  const a = Math.abs(total) / step;
  const frac = a - Math.floor(a);
  // One step short must still be clearly on the starting side, and the answer clearly across (in log-odds).
  const margin = Math.max(0.06, 0.1 * step);
  return Math.abs(total) < 0.3 || frac * step < margin || (1 - frac) * step < margin;
}

function occTier3LogOdds(rng: Rng) {
  const SEQS4: BinaryReading[][] = [
    ['occ', 'occ', 'free', 'free'],
    ['occ', 'free', 'occ', 'free'],
    ['free', 'occ', 'free', 'occ'],
    ['occ', 'free', 'free', 'occ'],
    ['occ', 'occ', 'free', 'occ'],
    ['free', 'free', 'occ', 'free'],
  ];
  // Pick a sensor and a sequence whose "how many to cross 0.5" answer is not on a knife edge (rounding could flip it).
  // Fallback: the 2023 Q31 sensor, OCC OCC FREE FREE (l = 2.97, 2.58 FREE steps: clear of the edge).
  let zs: BinaryReading[] = ['occ', 'occ', 'free', 'free'];
  let ismOcc = 0.9333;
  let ismFree = 0.24;
  for (let k = 0; k < 40; k++) {
    const s1 = randomSensor(rng, { paper: true, flipShare: 0.2 });
    const z1 = rng.pick(SEQS4);
    const io = Number(occupancyUpdate(0.5, 'occ', s1).toFixed(4));
    const iff = Number(occupancyUpdate(0.5, 'free', s1).toFixed(4));
    const total = z1.reduce((t, z) => t + (z === 'occ' ? logOdds(io) : logOdds(iff)), 0);
    if (!knifeEdge(total, logOdds(io), logOdds(iff))) {
      zs = z1;
      ismOcc = io;
      ismFree = iff;
      break;
    }
  }
  const lOcc = logOdds(ismOcc);
  const lFree = logOdds(ismFree);
  const ls: number[] = [];
  let l = 0;
  for (const z of zs) {
    l += z === 'occ' ? lOcc : lFree;
    ls.push(l);
  }
  const pEnd = fromLogOdds(l);
  // Readings of the other kind needed to cross 0.5.
  const against: BinaryReading = l > 0 ? 'free' : 'occ';
  const stepA = against === 'free' ? lFree : lOcc;
  const need = Math.floor(Math.abs(l) / Math.abs(stepA) + 1e-9) + 1;
  const prompt = `A mapping robot stores every grid cell as log-odds and uses the course’s update $l_t = l_{t-1} + \\ln\\frac{p(m \\mid z_t)}{1 - p(m \\mid z_t)} - l_0$. Its inverse sensor model, computed with the uninformative prior 0.5, is $$p(m \\mid z = \\text{occ}) = ${f4(ismOcc)}, \\qquad p(m \\mid z = \\text{free}) = ${f4(ismFree)}.$$ A cell starts at $p(m) = 0.5$ and receives **${seqText(zs)}**. Work in log-odds only.`;
  const parts: SolvePart[] = [
    logOddsPart('locc', lOcc, null, null, '(a) The log-odds of the inverse sensor model for an OCCUPIED reading, $\\ln\\frac{p(m \\mid \\text{occ})}{1 - p(m \\mid \\text{occ})}$', 1),
    logOddsPart('lfree', lFree, null, null, '(a) …and for a FREE reading', 1),
  ];
  zs.forEach((z, k) => parts.push(logOddsPart(`l${k + 1}`, ls[k], z === 'occ' ? lOcc : lFree, k ? ls[k - 1] : null, `(b) $l_${k + 1}$ after reading ${k + 1} (${ZN[z]})`, 1)));
  parts.push({
    kind: 'numeric',
    id: 'pend',
    label: `(c) Convert back: $p(m \\mid z_{1:${zs.length}})$`,
    answer: pEnd,
    unit: '',
    ...P,
    traps: keepTraps(pEnd, P.absTol, [
      { value: Math.exp(l), message: 'That is the odds $e^{l}$. Use $p = 1 - \\frac{1}{1 + e^{l}}$.', trapId: 'slam-odds-not-prob' },
      { value: 1 - pEnd, message: 'That is $1/(1 + e^{l})$ = $p(\\neg m)$. Subtract it from 1.', trapId: 'sign' },
    ]),
    marks: 2,
  });
  parts.push({
    kind: 'numeric',
    id: 'need',
    label: `(d) From here, how many ${ZN[against]} readings in a row would it take to bring $p(m)$ ${against === 'free' ? 'below' : 'above'} 0.5?`,
    answer: need,
    unit: 'readings',
    absTol: 0.4,
    traps: keepTraps(need, 0.4, [
      need > 1 ? { value: need - 1, message: `After ${need - 1} the log-odds is $${sg(l + (need - 1) * stepA, 2)}$: still on the ${l > 0 ? 'occupied' : 'free'} side of 0.` } : null,
    ]),
    marks: 2,
  });
  const hints: [string, string, string, string] = [
    'Log-odds turn Bayes’ rule into addition. With the 0.5 prior, $l_0 = 0$, so each reading adds the log-odds of the inverse sensor model for that reading, and you only convert back to a probability at the end.',
    '$$l(z) = \\ln\\frac{p(m \\mid z)}{1 - p(m \\mid z)}, \\qquad l_t = l_{t-1} + l(z_t) - l_0, \\qquad p = 1 - \\frac{1}{1 + e^{l_t}}$$ To cross 0.5 the log-odds must change sign: divide the current $|l|$ by the size of one opposing step and round **up** past it.',
    `$$l(\\text{occ}) = \\ln\\frac{${f4(ismOcc)}}{${f4(1 - ismOcc)}} = ${sg(lOcc, 4)}, \\qquad l(\\text{free}) = \\ln\\frac{${f4(ismFree)}}{${f4(1 - ismFree)}} = ${sg(lFree, 4)}$$ Running total from $l_0 = 0$: $0 ${zs.map((z) => (z === 'occ' ? sg(lOcc) : sg(lFree))).join(' ')}$.`,
    [
      `$$\\begin{array}{c|c|c|c} t & z_t & \\text{step} & l_t \\\\ \\hline ${zs.map((z, k) => `${k + 1} & ${ZT[z]} & ${sg(z === 'occ' ? lOcc : lFree)} & \\mathbf{${sg(ls[k])}}`).join(' \\\\ ')} \\end{array}$$`,
      `(a) $\\mathbf{${sg(lOcc, 4)}}$ and $\\mathbf{${sg(lFree, 4)}}$. (b) ${ls.map((v, k) => `$l_${k + 1} =$ $\\mathbf{${sg(v)}}$`).join(', ')}. (c) $p = 1 - 1/(1 + e^{${sg(l)}}) =$ **${f4(pEnd)}**.`,
      `(d) Each ${ZN[against]} adds $${sg(stepA)}$: $${f3(Math.abs(l))} / ${f3(Math.abs(stepA))} = ${(Math.abs(l) / Math.abs(stepA)).toFixed(2)}$, so **${need} ${need === 1 ? 'reading' : 'readings'}** (after ${need} the log-odds is $${sg(l + need * stepA, 2)}$${need > 1 ? `; after ${need - 1} it is still $${sg(l + (need - 1) * stepA, 2)}$` : ''}).`,
      'These inverse sensor model values are rounded to 4 d.p. (as on the review slides, where $\\ln(0.9884/0.0116) = 4.4451$ against the exact $\\ln 85 = 4.4427$); answers within the rounding are accepted.',
    ].join('\n\n'),
  ];
  return {
    prompt,
    givens: [
      { sym: 'p(m \\mid \\text{occ})', value: f4(ismOcc), label: 'inverse sensor model, OCC' },
      { sym: 'p(m \\mid \\text{free})', value: f4(ismFree), label: 'inverse sensor model, FREE' },
      { sym: 'l_0', value: '0', label: 'prior 0.5' },
    ],
    parts,
    hints,
  };
}

// ------------------------------------------------------------------ slam-logodds

function logTier1(rng: Rng) {
  const p = rng.pick([0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.3, 0.25, 0.2, 0.1, 0.05]);
  const lA = logOdds(p);
  let lB = rng.step(-3, 3, 0.1);
  if (Math.abs(lB) < 0.4) lB = lB < 0 ? -1.2 : 1.6;
  const pB = fromLogOdds(lB);
  const s = randomSensor(rng, { paper: true });
  const z: BinaryReading = rng.chance(0.6) ? 'occ' : 'free';
  const step = readingStep(z, s);
  const lr = z === 'occ' ? s.tp / (1 - s.tn) : (1 - s.tp) / s.tn;
  const prompt = `Occupancy grids store each cell as log-odds $l = \\ln\\frac{p}{1-p}$ instead of the probability $p = p(m)$, so that each reading is one addition.`;
  const parts: SolvePart[] = [
    logOddsPart('la', lA, null, null, `(a) A cell has $p(m) = ${p}$. What is its log-odds?`, 1),
    {
      kind: 'numeric',
      id: 'pb',
      label: `(b) Another cell has $l = ${lB.toFixed(1)}$. What is $p(m)$?`,
      answer: pB,
      unit: '',
      ...P,
      traps: keepTraps(pB, P.absTol, [
        { value: Math.exp(lB), message: 'That is the odds $e^{l}$. Use $p = 1 - \\frac{1}{1 + e^{l}}$.', trapId: 'slam-odds-not-prob' },
        { value: 1 - pB, message: 'That is $1/(1 + e^{l})$ = $p(\\neg m)$. Subtract it from 1.', trapId: 'sign' },
      ]),
      marks: 1,
    },
    {
      kind: 'numeric',
      id: 'step',
      label: `(c) A sensor has TP = ${f2(s.tp)} and TN = ${f2(s.tn)}. By how much does one **${ZN[z]}** reading change a cell’s log-odds?`,
      answer: step,
      unit: '',
      ...LO,
      traps: keepTraps(step, LO.absTol, [
        { value: lr, message: 'That is the likelihood ratio itself. The log-odds change is its natural log.', trapId: 'slam-odds-not-prob' },
        { value: step / Math.LN10, message: 'That is $\\log_{10}$. Use the natural log.', trapId: 'slam-log10' },
        z === 'occ'
          ? { value: Math.log(s.tp / s.tn), message: '$p(\\text{occ} \\mid \\neg m)$ is the false-positive rate $1 - \\text{TN}$, not TN.', trapId: 'false-positive' }
          : { value: Math.log((1 - s.tp) / (1 - s.tn)), message: '$p(\\text{free} \\mid \\neg m)$ is TN; $1 - \\text{TN}$ is the false-positive rate.', trapId: 'false-positive' },
      ]),
      marks: 1,
    },
  ];
  const hints: [string, string, string, string] = [
    'Log-odds map $p \\in (0, 1)$ onto the whole real line: 0.5 is 0, “probably occupied” is positive, “probably free” negative, and 0 or 1 are $\\mp\\infty$. A reading multiplies the odds by its likelihood ratio, so it **adds** $\\ln\\text{LR}$ to the log-odds.',
    '$$l = \\ln\\frac{p}{1 - p}, \\qquad p = 1 - \\frac{1}{1 + e^{l}}, \\qquad \\Delta l = \\ln\\frac{p(z \\mid m)}{p(z \\mid \\neg m)}$$ with $p(\\text{occ} \\mid m) = \\text{TP}$, $p(\\text{occ} \\mid \\neg m) = 1 - \\text{TN}$, $p(\\text{free} \\mid m) = 1 - \\text{TP}$, $p(\\text{free} \\mid \\neg m) = \\text{TN}$.',
    `(a) $\\ln\\frac{${p}}{${f2(1 - p)}}$. (b) $1 - \\frac{1}{1 + e^{${lB.toFixed(1)}}}$. (c) $\\ln\\frac{${z === 'occ' ? f2(s.tp) : f2(1 - s.tp)}}{${z === 'occ' ? f2(1 - s.tn) : f2(s.tn)}}$.`,
    `(a) $\\ln(${p}/${f2(1 - p)}) = \\ln ${(p / (1 - p)).toFixed(4)} =$ $\\mathbf{${sg(lA)}}$. (b) $e^{${lB.toFixed(1)}} = ${Math.exp(lB).toFixed(4)}$, so $p = 1 - 1/${(1 + Math.exp(lB)).toFixed(4)} =$ **${f4(pB)}**. (c) $\\text{LR} = ${lr.toFixed(4)}$, so one ${ZN[z]} reading adds $\\mathbf{${sg(step)}}$ to the log-odds (dimensionless), whatever the cell’s current belief.`,
  ];
  return { prompt, parts, hints };
}

function logTier2(rng: Rng) {
  // An inverse sensor model and hit / pass counts whose answer to (e) is not on a knife edge. The sensor is re-picked
  // too: with p(m | hit) = 1 − p(m | pass) (0.8 / 0.2) or steps in a 2 : 1 ratio (0.9 / 0.25) every count lands on a
  // whole number of steps, i.e. exactly back at 0.5.
  let pHit = 0.7;
  let pPass = 0.35;
  let k = 4;
  let j = 2; // fallback: l = 2.15, 3.47 passes to clear: clear of the edge
  for (let g = 0; g < 60; g++) {
    const ph = rng.step(0.6, 0.9, 0.05);
    const pp = rng.step(0.2, 0.45, 0.05);
    const a = rng.int(2, 6);
    const b = rng.int(1, 6);
    if (!knifeEdge(a * logOdds(ph) + b * logOdds(pp), logOdds(ph), logOdds(pp))) {
      pHit = ph;
      pPass = pp;
      k = a;
      j = b;
      break;
    }
  }
  const lH = logOdds(pHit);
  const lP = logOdds(pPass);
  const l = k * lH + j * lP;
  const p = fromLogOdds(l);
  const against = l > 0 ? lP : lH;
  const need = Math.floor(Math.abs(l) / Math.abs(against) + 1e-9) + 1;
  const prompt = `A lidar mapper updates each cell it observes with an inverse sensor model built from the 0.5 prior: a cell where a beam ends (a **hit**) has $p(m \\mid \\text{hit}) = ${f2(pHit)}$, a cell a beam passes through (a **pass**) has $p(m \\mid \\text{pass}) = ${f2(pPass)}$. Cells beyond the hit are not updated. One cell, starting at $p(m) = 0.5$, has so far been hit ${k} times and passed through ${j} ${j === 1 ? 'time' : 'times'}.`;
  const parts: SolvePart[] = [
    logOddsPart('lh', lH, null, null, '(a) $l_{occ}$: the log-odds added by one hit', 1),
    logOddsPart('lp', lP, null, null, '(b) $l_{free}$: the log-odds added by one pass', 1),
    {
      ...logOddsPart('l', l, null, null, `(c) The cell’s log-odds now (${k} hits, ${j} passes)`, 1),
      traps: keepTraps(l, LO.absTol, [
        { value: k * lH, message: `That counts only the hits. Add the ${j} passes, each $${sg(lP)}$.`, trapId: 'slam-accumulate' },
        { value: (k * lH + j * lP) / (k + j), message: 'That is the average step. Log-odds add: $k\\,l_{occ} + j\\,l_{free}$.', trapId: 'slam-accumulate' },
        { value: l / Math.LN10, message: 'That is $\\log_{10}$. Use the natural log.', trapId: 'slam-log10' },
      ]),
    },
    {
      kind: 'numeric',
      id: 'p',
      label: '(d) Its occupancy probability now',
      answer: p,
      unit: '',
      ...P,
      traps: keepTraps(p, P.absTol, [
        { value: Math.exp(l), message: 'That is the odds $e^{l}$. Use $p = 1 - \\frac{1}{1 + e^{l}}$.', trapId: 'slam-odds-not-prob' },
        { value: 1 - p, message: 'That is $p(\\neg m)$. Subtract it from 1.', trapId: 'sign' },
      ]),
      marks: 1,
    },
    {
      kind: 'numeric',
      id: 'need',
      label: `(e) How many more ${l > 0 ? 'passes' : 'hits'} in a row would bring $p(m)$ ${l > 0 ? 'below' : 'above'} 0.5?`,
      answer: need,
      unit: l > 0 ? 'passes' : 'hits',
      absTol: 0.4,
      traps: keepTraps(need, 0.4, [need > 1 ? { value: need - 1, message: `After ${need - 1} the log-odds is still $${sg(l + (need - 1) * against, 2)}$: not yet across 0.` } : null]),
      marks: 1,
    },
    {
      kind: 'choice',
      id: 'clamp',
      label: '(f) Real mappers clamp every cell to, say, $-2 \\le l \\le 3.5$. Why?',
      options: [
        { text: 'So a cell that has been seen many times can still change quickly when the world changes (a door opens, a person walks away)', correct: true, why: 'Without a clamp, a cell hit 200 times needs about as many passes to clear. The clamp bounds the evidence, so maps of a changing world stay up to date.' },
        { text: 'Because Bayes’ rule is only valid while $|l| < 3.5$', correct: false, why: 'The log-odds update is exact for any finite $l$; the clamp deliberately gives up some of that to stay responsive.' },
        { text: 'To stop the probabilities from adding up to more than 1', correct: false, why: 'Log-odds can never give $p > 1$: $p = 1 - 1/(1 + e^{l})$ is always in (0, 1).' },
        { text: 'So that the order of the readings no longer matters', correct: false, why: 'It is the other way round: without a clamp the order never matters (the log-odds just add); with a clamp it can.' },
      ],
      marks: 1,
    },
  ];
  const hints: [string, string, string, string] = [
    'In log-odds every observation of a cell adds a constant: $l_{occ} > 0$ for a hit and $l_{free} < 0$ for a pass, so a cell’s log-odds is just a weighted count of its hits and passes. Convert to a probability only when you need one.',
    '$$l_{occ} = \\ln\\frac{p(m \\mid \\text{hit})}{1 - p(m \\mid \\text{hit})}, \\quad l_{free} = \\ln\\frac{p(m \\mid \\text{pass})}{1 - p(m \\mid \\text{pass})}, \\quad l = l_0 + k\\,l_{occ} + j\\,l_{free}, \\quad p = 1 - \\frac{1}{1 + e^{l}}$$',
    `$$l_{occ} = \\ln\\frac{${f2(pHit)}}{${f2(1 - pHit)}}, \\qquad l_{free} = \\ln\\frac{${f2(pPass)}}{${f2(1 - pPass)}}, \\qquad l = 0 + ${k}\\,l_{occ} + ${j}\\,l_{free}$$`,
    [
      `(a) $\\mathbf{${sg(lH)}}$, (b) $\\mathbf{${sg(lP)}}$. (c) $l = ${k} \\times (${sg(lH)}) + ${j} \\times (${sg(lP)}) =$ $\\mathbf{${sg(l)}}$. (d) $p = 1 - 1/(1 + e^{${sg(l)}}) =$ **${f4(p)}**.`,
      `(e) Each ${l > 0 ? 'pass' : 'hit'} adds $${sg(against)}$: $${f3(Math.abs(l))} / ${f3(Math.abs(against))} = ${(Math.abs(l) / Math.abs(against)).toFixed(2)}$, so **${need}** more (then $l = ${sg(l + need * against, 2)}$${need > 1 ? `; after ${need - 1}, $l = ${sg(l + (need - 1) * against, 2)}$ is still on the same side` : ''}).`,
      '(f) **So the map can still change**: a clamp bounds how much evidence a cell can bank, so a moved obstacle clears after a few passes instead of hundreds.',
    ].join('\n\n'),
  ];
  return {
    prompt,
    givens: [
      { sym: 'p(m \\mid \\text{hit})', value: f2(pHit), label: 'inverse sensor model, hit' },
      { sym: 'p(m \\mid \\text{pass})', value: f2(pPass), label: 'inverse sensor model, pass' },
      { sym: 'k, j', value: `${k}, ${j}`, label: 'hits, passes' },
    ],
    parts,
    hints,
  };
}

// ------------------------------------------------------------------ generators

export const generators: SolveGenerator[] = [
  {
    id: 'slam-occupancy',
    title: 'Occupancy cell: Bayes and log-odds, reading by reading',
    summary: 'The 2023 Q31 template: the prior and why, the sensor table, $p(m)$ and log-odds after each reading, and why the result stays high (likelihood ratios).',
    tiers: [1, 2, 3],
    source: 'Similar to 2023 Q31; review deck slides 9-13; 2025 Q22; summary notes §4',
    cardId: 'slam-occupancy',
    marks: 10,
    sprint: false,
    generate(rng, tier: Tier) {
      if (tier === 1) return occTier1(rng);
      if (tier === 2) return occTier2(rng);
      return rng.chance(0.5) ? occTier3Prior(rng) : occTier3LogOdds(rng);
    },
  },
  {
    id: 'slam-logodds',
    title: 'Log-odds arithmetic',
    summary: 'Probability ↔ log-odds, the step one reading adds ($\\ln\\text{LR}$), and a lidar cell with hit and pass counts.',
    tiers: [1, 2],
    source: 'Review deck slides 11-13 (log-odds update); summary notes §4',
    cardId: 'slam-logodds',
    marks: 6,
    generate(rng, tier: Tier) {
      return tier === 1 ? logTier1(rng) : logTier2(rng);
    },
  },
];
