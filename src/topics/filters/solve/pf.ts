// filters-pf: one weight-and-resample step of a particle filter by hand (Thrun's Monte Carlo localisation; summary
// notes §2 "particle filter loop"; 2023 Q5: the weights are the sensor likelihood). A handful of particles on a
// corridor and either a table sensor model (door / pillar / wall) or a Gaussian range sensor: unnormalised weights,
// normalised weights, the expected number of copies, the cumulative weights and the low-variance sampler for a
// given r. Tier 3 adds multinomial resampling: the chance of losing a good particle, which the low-variance sampler
// never does. All the arithmetic comes from core/filters_particle.ts.
import type { ChoicePart, Given, MatrixPart, NumericPart, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { registerTraps } from '../../../engine/traps';
import { copyCounts, cumulativeWeights, lowVarianceIndices, normaliseWeights } from '../../../core/filters_particle';

registerTraps([
  {
    id: 'pf-pointer-start',
    title: 'The first pointer is r itself',
    detail: 'Low-variance resampling: $U_m = r + (m - 1)/M$ for $m = 1 \\dots M$, so the pointers are $r, r + 1/M, \\dots$; not starting at 0 and not at $r + 1/M$.',
  },
  {
    id: 'pf-times-m',
    title: 'Expected copies are M times the weight',
    detail: 'Drawing $M$ particles, each with probability $\\bar w_i$, gives particle $i$ on average $M\\bar w_i$ copies.',
  },
]);

type Feature = 'door' | 'pillar' | 'wall';
type Reading = 'door' | 'no door';

interface PfCase {
  model: 'table' | 'gauss';
  M: number;
  xs: number[];
  /** Table model: what the map shows at each particle, the sensor table p(z = door | feature), the reading. */
  feats: Feature[];
  pDoor: Record<Feature, number>;
  reading: Reading;
  /** Gaussian model: wall position, noise sd, reading (m), and each particle's offset z − ẑ in units of σ. */
  wall: number;
  sigma: number;
  z: number;
  /** Weights: unnormalised, normalised, cumulative. */
  w: number[];
  wn: number[];
  c: number[];
  r: number;
  /** Low-variance picks (0-based) and copies per particle. */
  idx: number[];
  copies: number[];
}

const n = (x: number, d = 3) => String(Number(x.toFixed(d)));
const f3 = (x: number) => x.toFixed(3);
const f4 = (x: number) => x.toFixed(4);
const sub = (i: number) => `x_{${i + 1}}`;
const setText = (idx: number[]) => `$${idx.map(sub).join(',\\ ')}$`;

/** Low-variance picks for given pointers (clamped to the last particle when a pointer passes 1). */
function picksFor(c: number[], pointers: number[]): number[] {
  return pointers.map((U) => {
    const i = c.findIndex((ci) => ci >= U - 1e-12);
    return i < 0 ? c.length - 1 : i;
  });
}

function makeCase(rng: Rng, tier: Tier): PfCase {
  const M = tier === 1 ? 4 : 5;
  for (let attempt = 0; attempt < 200; attempt++) {
    const model: 'table' | 'gauss' = tier === 1 ? 'table' : rng.chance(0.5) ? 'table' : 'gauss';
    const pDoor: Record<Feature, number> = { door: rng.pick([0.6, 0.7, 0.8, 0.9]), pillar: rng.pick([0.3, 0.4, 0.5]), wall: rng.pick([0.05, 0.1, 0.2]) };
    const reading: Reading = tier >= 2 && rng.chance(0.3) ? 'no door' : 'door';
    const sigma = rng.pick([0.5, 1]);
    const wall = rng.pick([10, 12, 15]);
    const z = rng.step(3, 7, 0.1);
    let xs: number[] = [];
    let feats: Feature[] = [];
    let w: number[] = [];
    if (model === 'table') {
      feats = Array.from({ length: M }, () => rng.pick<Feature>(['door', 'door', 'pillar', 'wall']));
      if (!feats.includes('door') || feats.every((f) => f === 'door')) continue;
      let x = rng.step(0.5, 2, 0.5);
      xs = feats.map(() => {
        const v = x;
        x += rng.step(1, 3, 0.5);
        return v;
      });
      w = feats.map((f) => (reading === 'door' ? pDoor[f] : Number((1 - pDoor[f]).toFixed(2))));
    } else {
      const ks = rng.shuffle([-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5]).slice(0, M);
      if (!ks.some((k) => Math.abs(k) <= 0.5)) continue;
      // x_i = x_w − z + offset_i (offset = z − ẑ_i), sorted left to right.
      const offs = ks.map((k) => k * sigma).sort((a, b) => a - b);
      xs = offs.map((d) => Number((wall - z + d).toFixed(2)));
      w = offs.map((d) => Math.exp((-d * d) / (2 * sigma * sigma)));
    }
    const wn = Array.from(normaliseWeights(w));
    const c = Array.from(cumulativeWeights(w));
    // One r in [0, 1/M) with every pointer at least 0.012 from every boundary (robust to 3-d.p. working).
    const rs = rng.shuffle(Array.from({ length: Math.round(100 / M) - 1 }, (_, i) => (i + 1) / 100));
    const r = rs.find((rr) => {
      for (let m = 0; m < M; m++) {
        const U = rr + m / M;
        if (c.slice(0, M - 1).some((ci) => Math.abs(ci - U) < 0.012)) return false;
      }
      return true;
    });
    if (r === undefined) continue;
    const idx = Array.from(lowVarianceIndices(wn, r, M));
    const copies = Array.from(copyCounts(idx, M));
    // Interesting: someone is lost and someone is duplicated.
    if (!copies.some((k) => k === 0) || !copies.some((k) => k >= 2)) continue;
    return { model, M, xs, feats, pDoor, reading, wall, sigma, z, w, wn, c, r, idx, copies };
  }
  throw new Error('filters-pf: no instance found');
}

// ------------------------------------------------------------------ parts

const col = (v: number[]) => v.map((x) => [x]);
const rowLabels = (M: number) => Array.from({ length: M }, (_, i) => `$${sub(i)}$`);

function weightPart(k: PfCase): MatrixPart {
  const wrongCol = k.model === 'table' ? k.feats.map((f) => (k.reading === 'door' ? 1 - k.pDoor[f] : k.pDoor[f])) : null;
  return {
    kind: 'matrix',
    id: 'w',
    label: 'Unnormalised weight $w_i = p(z \\mid x_i)$ of each particle',
    answer: col(k.w),
    rowLabels: rowLabels(k.M),
    colLabels: ['$w_i$'],
    absTol: 0.002,
    traps: wrongCol ? [{ value: col(wrongCol), message: `You read the other column. The reading was **${k.reading}**, so take $p(z = \\text{${k.reading}} \\mid \\text{feature at } x_i)$ for every particle.`, trapId: 'likelihood-column' }] : undefined,
    marks: 1,
  };
}

function normPart(k: PfCase): MatrixPart {
  const uniform = Array.from({ length: k.M }, () => 1 / k.M);
  return {
    kind: 'matrix',
    id: 'wn',
    label: 'Normalised weights $\\bar w_i = w_i / \\sum_j w_j$',
    answer: col(k.wn),
    rowLabels: rowLabels(k.M),
    colLabels: ['$\\bar w_i$'],
    absTol: 0.002,
    traps: [
      { value: col(k.w), message: `Those are the unnormalised weights. Divide each by their sum, $\\sum_j w_j$ = ${f4(k.w.reduce((a, b) => a + b, 0))}, so that they add up to 1.`, trapId: 'normalise' },
      { value: col(uniform), message: 'Equal weights $1/M$ are what the particles carry **after** resampling, not after weighting.' },
    ].filter((t) => t.value.some((row, i) => Math.abs(row[0] - k.wn[i]) > 0.01)),
    marks: 1,
  };
}

function copiesPart(k: PfCase, j: number): NumericPart {
  const ans = k.M * k.wn[j];
  const traps = [
    { value: k.wn[j], message: `That is the probability of one draw. With $M$ = ${k.M} draws, particle $${sub(j)}$ is expected $M\\bar w = ${k.M} \\times ${f3(k.wn[j])}$ times.`, trapId: 'pf-times-m' },
    { value: k.M * k.w[j], message: 'Use the **normalised** weight: $M\\bar w_i$.', trapId: 'normalise' },
  ].filter((t) => Math.abs(t.value - ans) > Math.max(0.05 * ans, 0.02));
  return {
    kind: 'numeric',
    id: 'copies',
    label: `Expected number of copies of $${sub(j)}$ when $M$ = ${k.M} particles are resampled`,
    answer: ans,
    unit: '',
    tol: 0.01,
    absTol: 0.01,
    traps,
    marks: 1,
  };
}

function cumPart(k: PfCase): MatrixPart {
  return {
    kind: 'matrix',
    id: 'c',
    label: 'Cumulative weights $c_i = \\bar w_1 + \\dots + \\bar w_i$',
    answer: col(k.c),
    rowLabels: rowLabels(k.M),
    colLabels: ['$c_i$'],
    absTol: 0.003,
    marks: 0.5,
  };
}

function lvPart(k: PfCase): ChoicePart {
  const M = k.M;
  const ptr = Array.from({ length: M }, (_, m) => k.r + m / M);
  const opts: { idx: number[]; why: string; correct: boolean }[] = [
    {
      idx: k.idx,
      correct: true,
      why: `Pointers $U$ = ${ptr.map((u) => u.toFixed(2)).join(', ')} against $c$ = ${k.c.map((x) => x.toFixed(3)).join(', ')}: each pointer picks the first particle whose $c_i \\geq U_m$.`,
    },
    {
      idx: picksFor(k.c, ptr.map((u) => u - k.r)),
      correct: false,
      why: `Those pointers start at 0. The sampler adds the random offset: $U_m = r + (m-1)/M$, starting at $r$ = ${n(k.r)}.`,
    },
    {
      idx: picksFor(k.c, ptr.map((u) => u + 1 / M)),
      correct: false,
      why: `Those pointers start at $r + 1/M$. For $m = 1$ the pointer is $r$ itself.`,
    },
    {
      idx: Array.from({ length: M }, (_, i) => i),
      correct: false,
      why: 'That is the old set unchanged. Resampling copies particles in proportion to their weights, so low-weight particles tend to vanish and high-weight ones are duplicated.',
    },
  ];
  const best = k.wn.indexOf(Math.max(...k.wn));
  opts.push({ idx: Array.from({ length: M }, () => best), correct: false, why: `Only the best particle $${sub(best)}$ survives? The pointers are spread evenly over $[0, 1)$, so every particle whose interval holds a pointer is copied.` });
  const seen = new Set<string>();
  const options = opts
    .filter((o) => {
      const key = o.idx.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4)
    .map((o) => ({ text: setText(o.idx), correct: o.correct, why: o.why }));
  return {
    kind: 'choice',
    id: 'lv',
    label: `Low-variance resampling with $r$ = ${n(k.r)}: which particles make up the new set (pointer $m = 1 \\dots ${M}$ in order)?`,
    options,
    marks: 1.5,
  };
}

function afterPart(k: PfCase): ChoicePart {
  return {
    kind: 'choice',
    id: 'after',
    label: 'After resampling, what weight does each new particle carry?',
    options: [
      { text: `$1/M$ = ${n(1 / k.M)} each: the weights now live in how many copies there are`, correct: true, why: 'Resampling turns weights into numbers of copies. Keeping the old weights as well would count the evidence twice.' },
      { text: 'Its old weight $\\bar w_i$, unchanged', correct: false, why: 'The copies already encode the weights; keeping $\\bar w_i$ too would apply the same reading twice.' },
      { text: '$\\bar w_i$ divided by its number of copies', correct: false, why: 'That still double-counts the reading. After resampling every particle is equally likely: $1/M$.' },
      { text: 'Zero, until the next reading arrives', correct: false, why: 'Zero weights cannot be normalised; the particles are simply equally weighted, $1/M$, until the next reading.' },
    ],
    marks: 0.5,
  };
}

function multinomialParts(k: PfCase, j: number): SolvePart[] {
  const p = Math.pow(1 - k.wn[j], k.M);
  const mw = k.M * k.wn[j];
  // "Exactly M w̄ times" is a fair distractor only when M w̄ is not a whole number (then it cannot be a copy count).
  const exact =
    Math.abs(mw - Math.round(mw)) > 0.05
      ? { text: `exactly $M\\bar w$ = ${n(mw, 2)} times`, correct: false, why: `$M\\bar w$ is the **expected** number of copies; actual copies are whole numbers (here ${k.copies[j]}).` }
      : { text: 'never: only the single best particle survives', correct: false, why: 'Every particle whose interval of the cumulative weights holds a pointer is copied, not just the best one.' };
  return [
    {
      kind: 'numeric',
      id: 'lose',
      label: `If instead the ${k.M} new particles were drawn independently (multinomial resampling), what is the probability that $${sub(j)}$ is not drawn at all?`,
      answer: p,
      unit: '',
      tol: 0.01,
      absTol: 0.002,
      traps: [
        { value: 1 - k.wn[j], message: `That is the chance that **one** draw misses it. All ${k.M} independent draws must miss: $(1 - \\bar w)^M$.` },
        { value: 1 - p, message: 'That is the probability it **is** drawn at least once.' },
      ].filter((t) => Math.abs(t.value - p) > 0.02),
      marks: 1,
    },
    {
      kind: 'choice',
      id: 'atleast',
      label: `And with the low-variance sampler, $${sub(j)}$ ($\\bar w$ = ${f3(k.wn[j])} $\\geq 1/M$ = ${n(1 / k.M)}) is copied …`,
      options: [
        { text: 'at least once, whatever $r$ is', correct: true, why: `Its interval of the cumulative weights is ${f3(k.wn[j])} wide, at least the pointer spacing $1/M$ = ${n(1 / k.M)}, so a pointer must land in it. That is why the low-variance sampler is preferred: it never loses a particle with $\\bar w \\geq 1/M$.` },
        { text: 'zero or more times, depending on $r$', correct: false, why: 'Pointers are exactly $1/M$ apart; an interval at least $1/M$ wide always holds one, whatever $r$ is.' },
        exact,
        { text: 'at most once', correct: false, why: 'A particle can be copied several times: an interval wider than $1/M$ can hold two or more pointers.' },
      ],
      marks: 1,
    },
  ];
}

// ------------------------------------------------------------------ text

function promptText(k: PfCase, tier: Tier): string {
  const head = `A robot localises in a corridor with a particle filter. After the motion (sample) step its $M$ = ${k.M} particles are at`;
  if (k.model === 'table') {
    const pts = `$$\\begin{array}{c|${'c'.repeat(k.M)}} \\text{particle} & ${k.xs.map((_, i) => sub(i)).join(' & ')} \\\\ \\hline \\text{position (m)} & ${k.xs.map((x) => n(x)).join(' & ')} \\\\ \\text{map shows} & ${k.feats.map((f) => `\\text{${f}}`).join(' & ')} \\end{array}$$`;
    const sens = `$$\\begin{array}{l|cc} \\text{true feature} & z = \\text{door} & z = \\text{no door} \\\\ \\hline \\text{door} & ${n(k.pDoor.door)} & ${n(1 - k.pDoor.door)} \\\\ \\text{pillar} & ${n(k.pDoor.pillar)} & ${n(1 - k.pDoor.pillar)} \\\\ \\text{wall} & ${n(k.pDoor.wall)} & ${n(1 - k.pDoor.wall)} \\end{array}$$`;
    return [head, pts, `Its door detector has the sensor model below (rows: what is really there; each row sums to 1). The detector now reports **${k.reading}**.`, sens, tier >= 2 ? `Then the filter resamples with the low-variance sampler: one random number $r$ = ${n(k.r)} and pointers $U_m = r + (m-1)/M$, $m = 1 \\dots ${k.M}$.` : ''].filter(Boolean).join('\n\n');
  }
  const pts = `$$\\begin{array}{c|${'c'.repeat(k.M)}} \\text{particle} & ${k.xs.map((_, i) => sub(i)).join(' & ')} \\\\ \\hline \\text{position (m)} & ${k.xs.map((x) => n(x)).join(' & ')} \\end{array}$$`;
  return [
    head,
    pts,
    `A range sensor measures the distance to the end wall at $x_w$ = ${n(k.wall)} m, $z = x_w - x + \\delta$ with $\\delta \\sim \\mathcal{N}(0, \\sigma^2)$, $\\sigma$ = ${n(k.sigma)} m. It reads $z$ = ${n(k.z)} m. Use the unnormalised weight $$w_i = \\exp\\!\\left(-\\frac{(z - \\hat z_i)^2}{2\\sigma^2}\\right), \\qquad \\hat z_i = x_w - x_i$$ (the factor $1/\\sqrt{2\\pi\\sigma^2}$ is the same for every particle and cancels when you normalise).`,
    tier >= 2 ? `Then the filter resamples with the low-variance sampler: one random number $r$ = ${n(k.r)} and pointers $U_m = r + (m-1)/M$, $m = 1 \\dots ${k.M}$.` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ------------------------------------------------------------------ generator

export const generators: SolveGenerator[] = [
  {
    id: 'filters-pf',
    title: 'Particle filter: weight and resample by hand',
    summary: 'A handful of particles and a table or Gaussian sensor model: weights, normalised weights, expected copies, then the low-variance sampler for a given $r$.',
    tiers: [1, 2, 3],
    source: 'Summary notes §2 (particle filter loop); 2023 Q5 (weights = sensor likelihood); Thrun Table 4.4 (low-variance sampler)',
    cardId: 'filters-pf',
    marks: 5,
    generate(rng, tier) {
      const k = makeCase(rng, tier);
      const M = k.M;
      const best = k.wn.indexOf(Math.max(...k.wn));
      // Tier 3 twist: a particle with w̄ ≥ 1/M, the smallest such (the one multinomial resampling is most likely to lose).
      const keepers = k.wn.map((v, i) => (v >= 1 / M ? i : -1)).filter((i) => i >= 0).sort((a, b) => k.wn[a] - k.wn[b]);
      const j = keepers[0] ?? best;

      const parts: SolvePart[] = [weightPart(k), normPart(k), copiesPart(k, best)];
      if (tier === 1) parts.push(afterPart(k));
      else parts.push(cumPart(k), lvPart(k));
      if (tier === 3) parts.push(...multinomialParts(k, j));

      // ---------------------------------------------------------------- hints
      const W = k.w.reduce((a, b) => a + b, 0);
      const ptr = Array.from({ length: M }, (_, m) => k.r + m / M);
      const wFormula =
        k.model === 'table'
          ? `$w_i = p(z = \\text{${k.reading}} \\mid \\text{feature at } x_i)$, read from the **${k.reading}** column of the table`
          : '$w_i = \\exp\\big(-(z - \\hat z_i)^2/(2\\sigma^2)\\big)$ with $\\hat z_i = x_w - x_i$';
      const wSub =
        k.model === 'table'
          ? k.feats.map((f, i) => `$w_{${i + 1}} = p(\\text{${k.reading}} \\mid \\text{${f}}) = ${n(k.w[i])}$`).join(', ')
          : k.xs.map((x, i) => `$\\hat z_{${i + 1}} = ${n(k.wall)} - ${n(x)} = ${n(k.wall - x)}$, $w_{${i + 1}} = e^{-(${n(k.z)} - ${n(k.wall - x)})^2/${n(2 * k.sigma * k.sigma)}} = ${f4(k.w[i])}$`).join('; ');
      const tableRows = k.xs
        .map((x, i) => `${sub(i)} & ${n(x)} & ${k.model === 'table' ? n(k.w[i]) : f4(k.w[i])} & ${f3(k.wn[i])} & ${tier >= 2 ? `${f3(k.c[i])} & ${k.copies[i]}` : n(M * k.wn[i], 2)}`)
        .join(' \\\\ ');
      const head = tier >= 2 ? 'i & x_i\\ (\\text{m}) & w_i & \\bar w_i & c_i & \\text{copies}' : 'i & x_i\\ (\\text{m}) & w_i & \\bar w_i & M\\bar w_i';
      const worked = [
        `$$\\begin{array}{c|c|c|c|c|c} ${head} \\\\ \\hline ${tableRows} \\end{array}$$`,
        `$\\sum w$ = ${f4(W)}. The best particle $${sub(best)}$ is expected **${n(M * k.wn[best], 3)} copies** ($M\\bar w = ${M} \\times ${f3(k.wn[best])}$).`,
        tier >= 2
          ? `Pointers $U$ = ${ptr.map((u) => u.toFixed(2)).join(', ')} pick ${setText(k.idx)}: the new set is **${setText(k.idx)}**, each with weight $1/M$. ${k.copies
              .map((cnt, i) => (cnt === 0 ? `$${sub(i)}$` : ''))
              .filter(Boolean)
              .join(' and ')} ${k.copies.filter((x) => x === 0).length === 1 ? 'is' : 'are'} lost.`
          : `After resampling every particle carries weight **$1/M$ = ${n(1 / M)}**: the weights now live in the number of copies.`,
        tier === 3
          ? `Multinomial: $P(${sub(j)}\\ \\text{never drawn}) = (1 - ${f3(k.wn[j])})^{${M}} = \\mathbf{${f4(Math.pow(1 - k.wn[j], M))}}$. The low-variance sampler copies $${sub(j)}$ **at least once** for any $r$, because its interval (${f3(k.wn[j])}) is at least the pointer spacing $1/M$.`
          : '',
      ].filter(Boolean);

      const hints: [string, string, string, string] = [
        'Each particle is one guess of the robot’s position. **Weight** each by how well it explains the reading: $w_i = p(z \\mid x_i)$, the sensor likelihood (not the prior or the control). **Normalise** so the weights sum to 1. **Resample**: draw $M$ new particles with probabilities $\\bar w_i$. The low-variance sampler uses **one** random number $r \\in [0, 1/M)$ and $M$ pointers spaced exactly $1/M$ apart.',
        `${wFormula}; $$\\bar w_i = \\frac{w_i}{\\sum_j w_j}, \\qquad E[\\text{copies of } i] = M\\bar w_i${tier >= 2 ? ', \\qquad c_i = \\sum_{j \\le i} \\bar w_j, \\qquad U_m = r + \\frac{m-1}{M}' : ''}$$${tier >= 2 ? ' Pointer $U_m$ picks the first particle with $c_i \\geq U_m$.' : ''}`,
        `${wSub}. Sum: $\\sum w$ = ${f4(W)}, so $\\bar w_i = w_i/${f4(W)}$.${tier >= 2 ? ` Pointers: $U$ = ${ptr.map((u) => u.toFixed(2)).join(', ')}.` : ''}`,
        worked.join('\n\n'),
      ];

      const givens: Given[] = [
        { sym: 'M', value: String(M), label: 'particles' },
        ...(k.model === 'gauss'
          ? [
              { sym: 'x_w', value: `${n(k.wall)} m`, label: 'wall position' },
              { sym: '\\sigma', value: `${n(k.sigma)} m`, label: 'range noise sd' },
              { sym: 'z', value: `${n(k.z)} m`, label: 'reading' },
            ]
          : [{ sym: 'z', value: k.reading, label: 'reading' }]),
        ...(tier >= 2 ? [{ sym: 'r', value: n(k.r), label: 'low-variance offset' }] : []),
      ];

      return { prompt: promptText(k, tier), givens, parts, hints };
    },
  },
];
