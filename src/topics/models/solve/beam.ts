// models-beam: the beam-model mixture at a reading (summary notes §3 "beam-based: a mixture of four parts"; review
// deck "What are the components that make up the beam-based sensor model?"; Thrun Table 6.1).
// Tier 1: the components and the weighted mixture at one reading. Tier 2: the same, plus which part explains
// this reading and which explains a max-range reading, each with the reason.
import type { ChoicePart, Given, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { components, hitNorm, mixture, normPdf, responsibilities, shortNorm, type BeamComp, type BeamParams } from '../../../core/models_beam';
import { keep, type Trap } from './common';
import { fx, g } from '../explore/modelsFmt';

export type BeamCase = 'hit' | 'short' | 'rand';

export interface BInstance {
  p: BeamParams;
  z: number;
  kase: BeamCase;
}

const WEIGHTS: [number, number, number, number][] = [
  [0.7, 0.15, 0.05, 0.1],
  [0.6, 0.2, 0.1, 0.1],
  [0.75, 0.1, 0.05, 0.1],
  [0.65, 0.2, 0.05, 0.1],
  [0.8, 0.1, 0.04, 0.06],
  [0.5, 0.3, 0.1, 0.1],
  [0.7, 0.1, 0.1, 0.1],
];

export function makeBeam(rng: Rng, tier: Tier): BInstance {
  const kase: BeamCase = tier === 1 ? rng.pick(['hit', 'short'] as const) : rng.pick(['hit', 'short', 'rand'] as const);
  let last: BInstance | null = null;
  // Retry until the intended part clearly explains the reading (at least 60 % of p(z)), so the story fits.
  for (let k = 0; k < 60; k++) {
    const zMax = rng.pick([8, 10]);
    const zStar = rng.step(3, 6, 0.5);
    const sigma = rng.pick([0.1, 0.15, 0.2, 0.25, 0.3]);
    const lambda = rng.pick([0.2, 0.25, 0.4, 0.5, 0.8, 1]);
    const [hit, short, max, rand] = rng.pick(WEIGHTS);
    const p: BeamParams = { zStar, zMax, sigma, lambda, w: { hit, short, max, rand } };
    let z: number;
    if (kase === 'hit') z = Number((zStar + rng.pick([-1, -0.5, 0.5, 1]) * sigma).toFixed(3));
    else if (kase === 'short') z = rng.step(0.5, zStar - 1.5, 0.1);
    else z = rng.step(zStar + 1.2, zMax - 0.5, 0.1);
    last = { p, z, kase };
    if (responsibilities(z, p)[kase] >= 0.6) return last;
  }
  return last!;
}

const NAME: Record<BeamComp, string> = { hit: 'p_{hit}', short: 'p_{short}', max: 'p_{max}', rand: 'p_{rand}' };

function explainChoice(id: string, label: string, best: BeamComp, z: number, p: BeamParams): ChoicePart {
  const why: Record<BeamComp, string> = {
    hit: `the reading is within a few $\\sigma_{hit}$ of $z^*$ = ${g(p.zStar)} m: the beam reached the mapped obstacle and came back with ordinary measurement noise.`,
    short: `the reading is well short of $z^*$ = ${g(p.zStar)} m: something not in the map (a person, clutter) blocked the beam first.`,
    max: 'nothing came back (glass, a black or shiny surface, or nothing in range), so the sensor reports its maximum range.',
    rand: `the reading lies beyond $z^*$ = ${g(p.zStar)} m, where $p_{short}$ is zero and the hit Gaussian has died away: only unexplained noise is left.`,
  };
  const comps: BeamComp[] = ['hit', 'short', 'max', 'rand'];
  return {
    kind: 'choice',
    id,
    label,
    options: comps.map((c) => ({
      text: `$${NAME[c]}$`,
      correct: c === best,
      why: c === best ? `Yes: ${why[c]}` : `No: ${c === 'max' ? (z >= p.zMax ? why.max : `$p_{max}$ only explains readings of exactly $z_{max}$ = ${g(p.zMax)} m.`) : c === 'short' && z > p.zStar ? '$p_{short}$ is zero beyond $z^*$: an unexpected object can only be in front of the mapped one.' : c === 'hit' && Math.abs(z - p.zStar) > 3 * p.sigma ? `the reading is ${g(Math.abs(z - p.zStar) / p.sigma, 2)} σ from $z^*$, where the Gaussian is negligible.` : `its weighted density at this reading is smaller than that of $${NAME[best]}$.`}`,
    })),
    fixedOrder: true,
    compact: true,
    marks: 1,
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'models-beam',
    title: 'Beam model: the mixture at a reading',
    summary: 'Evaluate $p_{hit}$, $p_{short}$ (with its normaliser) and $p_{rand}$ at a reading, combine them with the weights, and say which part explains a reading.',
    tiers: [1, 2],
    source: 'Summary notes §3 (beam-based model); review deck “components of the beam-based sensor model”; Thrun Table 6.1',
    cardId: 'models-beam',
    marks: 5,
    generate(rng, tier) {
      const { p, z } = makeBeam(rng, tier);
      const c = components(z, p);
      const w = p.w;
      const etaS = shortNorm(p.zStar, p.lambda);
      const etaH = hitNorm(p.zStar, p.sigma, p.zMax);
      const total = mixture(z, p);
      const resp = responsibilities(z, p);
      const best = (['hit', 'short', 'max', 'rand'] as BeamComp[]).reduce((a, k) => (resp[k] > resp[a] ? k : a), 'hit' as BeamComp);
      const gauss = normPdf(z, p.zStar, p.sigma);
      const expS = p.lambda * Math.exp(-p.lambda * z);

      const prompt = [
        `A laser range finder uses the beam model. At the robot’s pose the map predicts the range $z^*$ = ${g(p.zStar)} m; the maximum range is $z_{max}$ = ${g(p.zMax)} m. The model parameters are $\\sigma_{hit}$ = ${g(p.sigma)} m, $\\lambda_{short}$ = ${g(p.lambda)} m⁻¹ and weights $(z_{hit}, z_{short}, z_{max}, z_{rand})$ = $(${g(w.hit)}, ${g(w.short)}, ${g(w.max)}, ${g(w.rand)})$.`,
        `A reading of $z$ = ${g(z, 3)} m arrives. The hit Gaussian lies well inside $[0, z_{max}]$, so take its normaliser as $\\eta_{hit} = 1$. Give densities in m⁻¹ to 4 significant figures.`,
      ].join('\n\n');
      const givens: Given[] = [
        { sym: 'z^*', value: `${g(p.zStar)} m`, label: 'expected range (ray cast in the map)' },
        { sym: 'z_{max}', value: `${g(p.zMax)} m`, label: 'maximum range' },
        { sym: '\\sigma_{hit},\\ \\lambda_{short}', value: `${g(p.sigma)} m, ${g(p.lambda)} m⁻¹`, label: 'hit spread, short decay rate' },
        { sym: 'z', value: `${g(z, 3)} m`, label: 'the reading' },
      ];
      const dens = { unit: '1/m', tol: 0.01, absTol: 0.0005 } as const;
      const parts: SolvePart[] = [
        {
          kind: 'numeric',
          id: 'phit',
          label: `$p_{hit}(z) = \\eta_{hit}\\,\\mathcal N(z; z^*, \\sigma_{hit}^2)$`,
          answer: c.hit,
          ...dens,
          traps: keep(c.hit, [
            { value: Math.exp(-0.5 * ((z - p.zStar) / p.sigma) ** 2), message: 'Include the Gaussian’s normalising factor $1/(\\sigma\\sqrt{2\\pi})$.' },
            { value: normPdf(z, p.zStar, p.sigma * p.sigma), message: 'Use $\\sigma$ = ' + g(p.sigma) + ' m in $\\mathcal N(z; z^*, \\sigma^2)$, not $\\sigma^2$ in place of $\\sigma$.', trapId: 'sqrt' },
            { value: w.hit * c.hit, message: 'That is already weighted: this part asks for $p_{hit}$ before multiplying by $z_{hit}$.', trapId: 'beam-weights' },
          ]),
          marks: 1,
        },
        {
          kind: 'numeric',
          id: 'eta',
          label: `$\\eta_{short} = 1/(1 - e^{-\\lambda_{short} z^*})$`,
          answer: etaS,
          unit: '',
          tol: 0.005,
          traps: keep(etaS, [{ value: 1 - Math.exp(-p.lambda * p.zStar), message: 'Upside down: $\\eta$ is one over the area $1 - e^{-\\lambda z^*}$.' }], 0.006, 1e-4),
          marks: 0.5,
        },
        {
          kind: 'numeric',
          id: 'pshort',
          label: `$p_{short}(z)$`,
          answer: c.short,
          ...dens,
          traps: keep(c.short, [
            ...(z <= p.zStar ? [{ value: expS, message: 'Multiply by $\\eta_{short}$: the exponential is cut off at $z^*$, so it must be rescaled.', trapId: 'beam-normaliser' }] : []),
            ...(z > p.zStar ? [{ value: etaS * expS, message: '$p_{short}$ is zero beyond $z^*$: an unexpected object can only be in front of the mapped one.', trapId: 'beam-short-range' }] : []),
          ]),
          marks: 1,
        },
        {
          kind: 'numeric',
          id: 'prand',
          label: `$p_{rand}(z)$`,
          answer: c.rand,
          ...dens,
          traps: keep(c.rand, [{ value: p.zMax, message: 'Upside down: the uniform density is $1/z_{max}$.' }]),
          marks: 0.5,
        },
        {
          kind: 'numeric',
          id: 'p',
          label: `$p(z \\mid x, m) = z_{hit}p_{hit} + z_{short}p_{short} + z_{max}p_{max} + z_{rand}p_{rand}$`,
          answer: total,
          ...dens,
          traps: keep(total, [
            { value: c.hit + c.short + c.rand, message: 'Weight each part before adding.', trapId: 'beam-weights' },
            ...(z <= p.zStar ? [{ value: w.hit * c.hit + w.short * expS + w.rand * c.rand, message: 'Include $\\eta_{short}$ in $p_{short}$.', trapId: 'beam-normaliser' }] : []),
            ...(z > p.zStar ? [{ value: w.hit * c.hit + w.short * etaS * expS + w.rand * c.rand, message: '$p_{short}$ is zero beyond $z^*$.', trapId: 'beam-short-range' }] : []),
          ]),
          marks: 1,
        },
      ];
      if (tier >= 2) {
        parts.push(explainChoice('which', `Which part of the model explains this reading of ${g(z, 3)} m best?`, best, z, p));
        parts.push(explainChoice('which-max', `A later reading is exactly $z_{max}$ = ${g(p.zMax)} m. Which part explains it?`, 'max', p.zMax, p));
      }

      const hints: [string, string, string, string] = [
        `The beam model mixes four densities: $p_{hit}$ (a Gaussian round the true range: measurement noise), $p_{short}$ (an exponential on $[0, z^*]$: unexpected objects in front), $p_{max}$ (a point mass at $z_{max}$: missed returns) and $p_{rand}$ (uniform: unexplained noise). Each is normalised on its own support, then weighted.`,
        `$$p_{hit} = \\eta_{hit}\\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{(z - z^*)^2}{2\\sigma^2}}, \\quad p_{short} = \\begin{cases}\\eta_{short}\\lambda e^{-\\lambda z} & 0 \\le z \\le z^* \\\\ 0 & \\text{otherwise}\\end{cases}, \\quad \\eta_{short} = \\frac{1}{1 - e^{-\\lambda z^*}}$$ $$p_{rand} = \\frac{1}{z_{max}}, \\quad p_{max} = 0 \\text{ unless } z = z_{max}, \\quad p(z) = z_{hit}p_{hit} + z_{short}p_{short} + z_{max}p_{max} + z_{rand}p_{rand}$$`,
        `$(z - z^*)/\\sigma$ = (${g(z, 3)} − ${g(p.zStar)})/${g(p.sigma)} = ${fx((z - p.zStar) / p.sigma, 3)}, so $\\mathcal N$ = $e^{-${fx(0.5 * ((z - p.zStar) / p.sigma) ** 2, 4)}}/(${g(p.sigma)}\\sqrt{2\\pi})$. $\\lambda z^*$ = ${fx(p.lambda * p.zStar, 3)}, so $\\eta_{short}$ = 1/(1 − ${fx(Math.exp(-p.lambda * p.zStar), 5)}). ${z <= p.zStar ? `$\\lambda e^{-\\lambda z}$ = ${g(p.lambda)} × $e^{-${fx(p.lambda * z, 3)}}$ = ${fx(expS, 5)}.` : `$z > z^*$, so $p_{short}$ = 0.`} $1/z_{max}$ = 1/${g(p.zMax)}.`,
        [
          `$$\\begin{array}{l|c|c|c} \\text{part} & \\text{density at } z & \\text{weight} & \\text{weighted} \\\\ \\hline p_{hit} & ${fx(c.hit, 5)} & ${g(w.hit)} & ${fx(w.hit * c.hit, 5)} \\\\ p_{short} & ${fx(c.short, 5)} & ${g(w.short)} & ${fx(w.short * c.short, 5)} \\\\ p_{max} & 0 & ${g(w.max)} & 0 \\\\ p_{rand} & ${fx(c.rand, 5)} & ${g(w.rand)} & ${fx(w.rand * c.rand, 5)} \\\\ \\hline & & & ${fx(total, 5)} \\end{array}$$`,
          `$p_{hit}$ = **${fx(c.hit, 4)} m⁻¹**${Math.abs(etaH - 1) > 1e-6 ? ` (with $\\eta_{hit}$ = ${fx(etaH, 5)})` : ''}, $\\eta_{short}$ = **${fx(etaS, 4)}**, $p_{short}$ = **${fx(c.short, 4)} m⁻¹**, $p_{rand}$ = **${fx(c.rand, 4)} m⁻¹**, so $p(z \\mid x, m)$ = **${fx(total, 4)} m⁻¹**.`,
          ...(tier >= 2
            ? [
                `Shares of $p(z)$: hit ${fx(resp.hit * 100, 1)} %, short ${fx(resp.short * 100, 1)} %, random ${fx(resp.rand * 100, 1)} %: **$${NAME[best]}$** explains this reading. A reading of exactly $z_{max}$ is explained by **$p_{max}$** (no return).`,
              ]
            : []),
        ].join('\n\n'),
      ];

      return { prompt, givens, parts, hints };
    },
  },
];

/** For the self-tests. */
export const _internal = { makeBeam };
