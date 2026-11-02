// filters-kf: the 1-D Kalman filter by hand (summary notes §2; course notation: R = actuation noise variance,
// Q = sensor noise variance). Tier 1: the prediction and the gain. Tier 2: one full cycle (μ̄, Σ̄, K, μ, Σ).
// Tier 3: the full cycle and then either a second cycle, or the same update with a sensor twice as noisy
// (2024 Q5 / 2025 Q5: changing Q changes BOTH the mean and the variance of the update).
// All arithmetic comes from core/filters_kalman.ts (A = C = 1; B = 1, or B = Δt for a velocity command).
import type { ChoicePart, Given, NumericPart, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { registerTraps } from '../../../engine/traps';
import { kf1Predict, kf1Update, type Kf1Model } from '../../../core/filters_kalman';

registerTraps([
  {
    id: 'kf-gain-inverted',
    title: 'K is the weight on the measurement',
    detail: '$K = \\bar\\Sigma/(\\bar\\Sigma + Q)$: an uncertain prediction (large $\\bar\\Sigma$) gives $K \\to 1$ (trust $z$); a noisy sensor (large $Q$) gives $K \\to 0$. $Q/(\\bar\\Sigma + Q)$ is $1 - K$.',
  },
  {
    id: 'kf-old-variance',
    title: 'Predict before you correct',
    detail: 'The gain and the posterior use the predicted variance $\\bar\\Sigma_t = \\Sigma_{t-1} + R$, not $\\Sigma_{t-1}$.',
  },
  {
    id: 'kf-innovation',
    title: 'The innovation is z − μ̄',
    detail: '$\\mu_t = \\bar\\mu_t + K_t(z_t - \\bar\\mu_t)$: the reading is compared with the **predicted** mean, not the old one.',
  },
]);

/** A number as the paper would print it (no trailing zeros). */
const n = (x: number, d = 3) => String(Number(x.toFixed(d)));
const f2 = (x: number) => x.toFixed(2);
const f3 = (x: number) => x.toFixed(3);
const f4 = (x: number) => x.toFixed(4);

// Tolerances: means to ±0.02 m, variances and gains to ±0.005 (or 1 %), so 2–3 d.p. working is accepted.
const MEAN = { tol: 0.001, absTol: 0.02 };
const VAR = { tol: 0.01, absTol: 0.005 };

/** Keep the traps that are clearly different from the answer (and from each other). */
function traps(answer: number, list: { value: number; message: string; trapId?: string }[]) {
  const seen: number[] = [];
  return list.filter((t) => {
    if (!Number.isFinite(t.value)) return false;
    const gap = Math.abs(t.value - answer);
    if (gap < Math.max(0.03 * Math.abs(answer), 0.012)) return false;
    if (seen.some((s) => Math.abs(s - t.value) < 1e-6)) return false;
    seen.push(t.value);
    return true;
  });
}

interface Cycle {
  mu0: number;
  s0: number;
  u: number;
  z: number;
  muBar: number;
  s2Bar: number;
  K: number;
  mu: number;
  s2: number;
}

function cycle(mu0: number, s0: number, u: number, z: number, m: Kf1Model): Cycle {
  const p = kf1Predict(mu0, s0, u, m);
  const c = kf1Update(p.muBar, p.s2Bar, z, m);
  return { mu0, s0, u, z, muBar: p.muBar, s2Bar: p.s2Bar, K: c.K, mu: c.mu, s2: c.s2 };
}

/** A reading near the prediction: offset ±0.3 … 1.6 m, two decimals. */
const reading = (rng: Rng, muBar: number) => Number((muBar + (rng.chance(0.5) ? 1 : -1) * rng.step(0.3, 1.6, 0.1)).toFixed(2));

interface Setup {
  m: Kf1Model;
  /** Velocity form: u is a speed v (m/s) applied for dt seconds, so B = dt. */
  dt: number | null;
  c1: Cycle;
}

function setup(rng: Rng, tier: Tier): Setup {
  const mu0 = rng.step(0, 8, 0.5);
  const s0 = rng.pick([0.2, 0.25, 0.4, 0.5, 1, 1.5, 2]);
  const R = rng.pick([0.1, 0.2, 0.25, 0.5, 1]);
  const Q = rng.pick([0.2, 0.25, 0.4, 0.5, 1, 2]);
  const velocity = tier >= 2 && rng.chance(0.5);
  const dt = velocity ? rng.pick([0.5, 1, 2]) : null;
  const u = velocity ? rng.step(0.5, 2, 0.5) : rng.step(0.5, 3, 0.5);
  const m: Kf1Model = { a: 1, b: dt ?? 1, c: 1, R, Q };
  const muBar = mu0 + m.b * u;
  return { m, dt, c1: cycle(mu0, s0, u, reading(rng, muBar), m) };
}

// ------------------------------------------------------------------ parts

function predictParts(c: Cycle, m: Kf1Model, tag: string, sub: string, marks: number): NumericPart[] {
  const { R, Q } = m;
  return [
    {
      kind: 'numeric',
      id: `mubar${tag}`,
      label: `Predicted mean $\\bar\\mu_{${sub}}$`,
      answer: c.muBar,
      unit: 'm',
      ...MEAN,
      traps: traps(c.muBar, [{ value: c.mu0, message: 'That is the old mean. The prediction moves it by the command: $\\bar\\mu_t = \\mu_{t-1} + Bu_t$.' }]),
      marks,
    },
    {
      kind: 'numeric',
      id: `s2bar${tag}`,
      label: `Predicted variance $\\bar\\Sigma_{${sub}}$`,
      answer: c.s2Bar,
      unit: 'm²',
      ...VAR,
      traps: traps(c.s2Bar, [
        { value: c.s0 + Q, message: `You added the **sensor** noise $Q$. The prediction adds the **actuation** noise $R$ = ${n(R)} m²: $\\bar\\Sigma_t = \\Sigma_{t-1} + R$.`, trapId: 'r-vs-q' },
        { value: c.s0, message: 'Moving adds uncertainty: add the actuation noise variance $R$ to $\\Sigma_{t-1}$.' },
        { value: (Math.sqrt(c.s0) + Math.sqrt(R)) ** 2, message: 'Variances add, not standard deviations: $\\bar\\Sigma_t = \\Sigma_{t-1} + R$.', trapId: 'sqrt' },
      ]),
      marks,
    },
  ];
}

function gainPart(c: Cycle, m: Kf1Model, tag: string, sub: string, marks: number, Qused = m.Q, id = `K${tag}`): NumericPart {
  return {
    kind: 'numeric',
    id,
    label: `Kalman gain $K_{${sub}}$${Qused !== m.Q ? ` with $Q'$ = ${n(Qused)} m²` : ''}`,
    answer: c.s2Bar / (c.s2Bar + Qused),
    unit: '',
    ...VAR,
    traps: traps(c.s2Bar / (c.s2Bar + Qused), [
      { value: Qused / (c.s2Bar + Qused), message: 'That is $1 - K$. The gain is the **prediction’s** share of the total variance, $K = \\bar\\Sigma/(\\bar\\Sigma + Q)$: the weight given to the measurement.', trapId: 'kf-gain-inverted' },
      { value: c.s0 / (c.s0 + Qused), message: 'You used $\\Sigma_{t-1}$. Predict first: the gain uses $\\bar\\Sigma_t = \\Sigma_{t-1} + R$.', trapId: 'kf-old-variance' },
      { value: c.s2Bar / (c.s2Bar + m.R), message: 'You used the actuation noise $R$. The gain compares the prediction with the **sensor** noise $Q$.', trapId: 'r-vs-q' },
    ]),
    marks,
  };
}

function updateParts(c: Cycle, tag: string, sub: string, marks: number, Qused?: number, idSuffix = ''): NumericPart[] {
  const K = Qused === undefined ? c.K : c.s2Bar / (c.s2Bar + Qused);
  const mu = c.muBar + K * (c.z - c.muBar);
  const s2 = (1 - K) * c.s2Bar;
  const t = sub;
  const prime = idSuffix ? "'" : '';
  return [
    {
      kind: 'numeric',
      id: `mu${tag}${idSuffix}`,
      label: `Updated mean $\\mu_{${t}}${prime}$`,
      answer: mu,
      unit: 'm',
      ...MEAN,
      traps: traps(mu, [
        { value: c.muBar + (1 - K) * (c.z - c.muBar), message: 'You weighted the innovation by $1 - K$. It is $\\mu_t = \\bar\\mu_t + K(z_t - \\bar\\mu_t)$.', trapId: 'kf-gain-inverted' },
        { value: c.muBar + K * (c.z - c.mu0), message: 'The innovation compares $z$ with the **predicted** mean: $z_t - \\bar\\mu_t$, not $z_t - \\mu_{t-1}$.', trapId: 'kf-innovation' },
        { value: c.mu0 + K * (c.z - c.mu0), message: 'Predict first: start the update from $\\bar\\mu_t$, not $\\mu_{t-1}$.', trapId: 'kf-old-variance' },
      ]),
      marks,
    },
    {
      kind: 'numeric',
      id: `s2${tag}${idSuffix}`,
      label: `Updated variance $\\Sigma_{${t}}${prime}$`,
      answer: s2,
      unit: 'm²',
      ...VAR,
      traps: traps(s2, [
        { value: K * c.s2Bar, message: 'That is the amount removed, $K\\bar\\Sigma$. What is left is $\\Sigma_t = (1 - K)\\bar\\Sigma_t$.', trapId: 'kf-gain-inverted' },
        { value: c.s2Bar, message: 'A measurement always shrinks the variance: $\\Sigma_t = (1 - K)\\bar\\Sigma_t$.' },
        { value: (1 - K) * c.s0, message: 'Use the predicted variance: $\\Sigma_t = (1 - K)\\bar\\Sigma_t$ with $\\bar\\Sigma_t = \\Sigma_{t-1} + R$.', trapId: 'kf-old-variance' },
      ]),
      marks,
    },
  ];
}

/** "What did doubling Q do?" (2024 Q5 / 2025 Q5 in numbers). */
function doubleQChoice(c: Cycle, Q2: number): ChoicePart {
  const K2 = c.s2Bar / (c.s2Bar + Q2);
  const mu2 = c.muBar + K2 * (c.z - c.muBar);
  const s22 = (1 - K2) * c.s2Bar;
  return {
    kind: 'choice',
    id: 'effect',
    label: 'So what did the noisier sensor change?',
    options: [
      {
        text: '$K$ fell: the mean moved less towards $z$ **and** the variance came out larger',
        correct: true,
        why: `$K$ dropped from ${f3(c.K)} to ${f3(K2)}, so the mean moved only ${f2(Math.abs(mu2 - c.muBar))} m towards $z$ instead of ${f2(Math.abs(c.mu - c.muBar))} m, and $\\Sigma$ rose from ${f3(c.s2)} to ${f3(s22)} m². $Q$ sits inside $K$, and $K$ appears in both update equations.`,
      },
      { text: 'Only the variance changed; the mean is the same', correct: false, why: `The mean uses the same $K$: $\\mu$ went from ${f2(c.mu)} to ${f2(mu2)} m. Changing $Q$ changes both (2024 and 2025 MCQ).` },
      { text: 'Only the mean changed; the variance is the same', correct: false, why: `$\\Sigma = (1 - K)\\bar\\Sigma$ depends on $K$ too: it rose from ${f3(c.s2)} to ${f3(s22)} m².` },
      { text: '$K$ rose, so the mean moved further towards $z$', correct: false, why: `A noisier sensor deserves less trust: $K = \\bar\\Sigma/(\\bar\\Sigma + Q)$ falls as $Q$ grows (${f3(c.K)} → ${f3(K2)}).` },
      { text: 'The predicted variance $\\bar\\Sigma$ grew as well', correct: false, why: 'The prediction does not involve the sensor at all: $\\bar\\Sigma = \\Sigma + R$ uses the actuation noise $R$. $Q$ only enters the correction.' },
    ],
    marks: 1,
  };
}

// ------------------------------------------------------------------ text

function motionText(s: Setup, c: Cycle): string {
  return s.dt !== null
    ? `It is commanded to drive at $v_t$ = ${n(c.u)} m/s for $\\Delta t$ = ${n(s.dt)} s, so its motion model is $x_t = x_{t-1} + \\Delta t\\, v_t + \\varepsilon_t$ ($A = 1$, $B = \\Delta t$)`
    : `It is commanded to move $u_t$ = ${n(c.u)} m, so its motion model is $x_t = x_{t-1} + u_t + \\varepsilon_t$ ($A = B = 1$)`;
}

const bu = (s: Setup, c: Cycle) => (s.dt !== null ? `${n(s.dt)} \\times ${n(c.u)}` : n(c.u));

function workRows(s: Setup, c: Cycle, t: string, Q: number): string[] {
  return [
    `\\bar\\mu_{${t}} & = ${n(c.mu0, 4)} + ${bu(s, c)} = \\mathbf{${n(c.muBar, 4)}}\\ \\text{m}`,
    `\\bar\\Sigma_{${t}} & = ${n(c.s0, 4)} + ${n(s.m.R)} = \\mathbf{${n(c.s2Bar, 4)}}\\ \\text{m}^2`,
    `K_{${t}} & = \\dfrac{${n(c.s2Bar, 4)}}{${n(c.s2Bar, 4)} + ${n(Q)}} = \\mathbf{${f4(c.s2Bar / (c.s2Bar + Q))}}`,
  ];
}

function updateRows(c: Cycle, t: string, Q: number, prime = ''): string[] {
  const K = c.s2Bar / (c.s2Bar + Q);
  const mu = c.muBar + K * (c.z - c.muBar);
  const s2 = (1 - K) * c.s2Bar;
  return [
    `\\mu_{${t}}${prime} & = ${n(c.muBar, 4)} + ${f4(K)}\\,(${n(c.z)} - ${n(c.muBar, 4)}) = \\mathbf{${f3(mu)}}\\ \\text{m}`,
    `\\Sigma_{${t}}${prime} & = (1 - ${f4(K)}) \\times ${n(c.s2Bar, 4)} = \\mathbf{${f4(s2)}}\\ \\text{m}^2`,
  ];
}

const table = (rows: string[]) => `$$\\begin{aligned} ${rows.join(' \\\\[2pt] ')} \\end{aligned}$$`;

// ------------------------------------------------------------------ generator

export const generators: SolveGenerator[] = [
  {
    id: 'filters-kf',
    title: '1-D Kalman filter by hand',
    summary: 'Predict ($\\bar\\mu$, $\\bar\\Sigma$), then correct ($K$, $\\mu$, $\\Sigma$) for a robot on a line; the stretch tier adds a second cycle or a sensor twice as noisy.',
    tiers: [1, 2, 3],
    source: 'Summary notes §2 (Kalman equations); 2024 Q5 and 2025 Q5 (changing Q changes the mean and the variance); review deck Kalman slides',
    cardId: 'filters-kf',
    marks: 6,
    generate(rng, tier) {
      const s = setup(rng, tier);
      const { m } = s;
      const c1 = s.c1;
      const variant: 'two' | 'doubleQ' | null = tier === 3 ? (rng.chance(0.5) ? 'two' : 'doubleQ') : null;
      const c2 = variant === 'two' ? (() => {
        const u2 = s.dt !== null ? rng.step(0.5, 2, 0.5) : rng.step(0.5, 3, 0.5);
        const mb = c1.mu + m.b * u2;
        return cycle(c1.mu, c1.s2, u2, reading(rng, mb), m);
      })() : null;
      const Q2 = 2 * m.Q;

      // ---------------------------------------------------------------- prompt
      const belief = `$bel(x_{t-1}) = \\mathcal{N}(\\mu_{t-1}, \\Sigma_{t-1})$ with $\\mu_{t-1}$ = ${n(c1.mu0)} m and $\\Sigma_{t-1}$ = ${n(c1.s0)} m²`;
      const sensor = `It then measures its position directly, $z_t = x_t + \\delta_t$ ($C = 1$), with sensor noise variance $Q$ = ${n(m.Q)} m²`;
      const lines = [
        `A robot moves along a straight rail. Its belief about its position $x$ is Gaussian, ${belief}. ${motionText(s, c1)}, with actuation noise variance $R$ = ${n(m.R)} m². ${sensor}${tier >= 2 ? `, and reads $z_t$ = ${n(c1.z)} m.` : '.'}`,
        tier === 1
          ? 'Find the predicted belief and the Kalman gain for the next reading.'
          : variant === 'two'
            ? `Run one Kalman filter cycle. Then run the next cycle: ${s.dt !== null ? `$v_{t+1}$ = ${n(c2!.u)} m/s for the same $\\Delta t$` : `$u_{t+1}$ = ${n(c2!.u)} m`}, and the sensor reads $z_{t+1}$ = ${n(c2!.z)} m.`
            : variant === 'doubleQ'
              ? `Run one Kalman filter cycle. Then repeat the **update** as if the sensor were twice as noisy, $Q'$ = ${n(Q2)} m² (same prediction, same reading).`
              : 'Run one Kalman filter cycle: predict, then correct.',
      ];
      const prompt = lines.join('\n\n');

      // ---------------------------------------------------------------- parts
      const parts: SolvePart[] = [...predictParts(c1, m, '', 't', 1), gainPart(c1, m, '', 't', tier === 1 ? 1 : 1.5)];
      if (tier >= 2) parts.push(...updateParts(c1, '', 't', tier === 2 ? 1.25 : 1));
      if (c2) {
        parts.push(...predictParts(c2, m, '2', 't+1', 0.5).map((p) => ({ ...p, label: p.label.replace('Predicted', 'Next cycle: predicted') })));
        parts.push(gainPart(c2, m, '2', 't+1', 0.5));
        parts.push(...updateParts(c2, '2', 't+1', 0.5));
      }
      if (variant === 'doubleQ') {
        const K2 = gainPart(c1, m, '', 't', 1, Q2, 'Kq2');
        parts.push({ ...K2, label: `Gain with the noisier sensor, $K'$ ($Q'$ = ${n(Q2)} m²)` });
        parts.push(...updateParts(c1, '', 't', 1, Q2, 'q2'));
        parts.push(doubleQChoice(c1, Q2));
      }

      // ---------------------------------------------------------------- hints
      const B = s.dt !== null ? '\\Delta t\\, v_t' : 'u_t';
      const setupTex = `$$\\bar\\mu_t = \\mu_{t-1} + ${B}, \\qquad \\bar\\Sigma_t = \\Sigma_{t-1} + R$$${tier >= 2 ? '$$K_t = \\frac{\\bar\\Sigma_t}{\\bar\\Sigma_t + Q}, \\qquad \\mu_t = \\bar\\mu_t + K_t(z_t - \\bar\\mu_t), \\qquad \\Sigma_t = (1 - K_t)\\,\\bar\\Sigma_t$$' : '$$K_t = \\frac{\\bar\\Sigma_t}{\\bar\\Sigma_t + Q}$$'}`;
      const sub = [
        `$\\bar\\mu_t = ${n(c1.mu0)} + ${bu(s, c1)}$, $\\bar\\Sigma_t = ${n(c1.s0)} + ${n(m.R)}$ (the actuation noise $R$, not $Q$), then $K_t = \\bar\\Sigma_t/(\\bar\\Sigma_t + ${n(m.Q)})$.`,
        tier >= 2 ? `The innovation is $z_t - \\bar\\mu_t = ${n(c1.z)} - ${n(c1.muBar, 4)} = ${n(c1.z - c1.muBar, 4)}$ m; move $K_t$ of the way along it, and keep the fraction $1 - K_t$ of $\\bar\\Sigma_t$.` : '',
        c2 ? `Next cycle: start from $\\mu_t$ and $\\Sigma_t$ just found: $\\bar\\mu_{t+1} = \\mu_t + ${s.dt !== null ? `${n(s.dt)} \\times ${n(c2.u)}` : n(c2.u)}$, $\\bar\\Sigma_{t+1} = \\Sigma_t + ${n(m.R)}$, and the reading $z_{t+1}$ = ${n(c2.z)} m.` : '',
        variant === 'doubleQ' ? `With $Q'$ = ${n(Q2)} m² only the update changes: $K' = ${n(c1.s2Bar, 4)}/(${n(c1.s2Bar, 4)} + ${n(Q2)})$, then the same two update equations.` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const rows = [...workRows(s, c1, 't', m.Q), ...(tier >= 2 ? updateRows(c1, 't', m.Q) : [])];
      const worked = [table(rows)];
      if (tier >= 2)
        worked.push(
          `The reading pulled the mean ${f2(Math.abs(c1.mu - c1.muBar))} m towards $z$ (a fraction $K$ = ${f3(c1.K)} of the innovation) and cut the variance from ${n(c1.s2Bar, 4)} to ${f4(c1.s2)} m².`
        );
      else worked.push(`$K$ = ${f3(c1.K)}: the update will move the mean ${Math.round(100 * c1.K)} % of the way from $\\bar\\mu_t$ to whatever $z_t$ is read.`);
      if (c2) worked.push('Second cycle (starting from the posterior above):', table([...workRows(s, c2, 't+1', m.Q), ...updateRows(c2, 't+1', m.Q)]));
      if (variant === 'doubleQ') {
        const K2 = c1.s2Bar / (c1.s2Bar + Q2);
        worked.push(
          `With $Q'$ = ${n(Q2)} m² (same $\\bar\\mu_t$, $\\bar\\Sigma_t$ and $z_t$):`,
          table([`K' & = \\dfrac{${n(c1.s2Bar, 4)}}{${n(c1.s2Bar, 4)} + ${n(Q2)}} = \\mathbf{${f4(K2)}}`, ...updateRows(c1, 't', Q2, "'")]),
          `**Both** the mean and the variance changed: the noisier sensor is trusted less, so the mean stays nearer the prediction and the variance shrinks less.`
        );
      }

      const hints: [string, string, string, string] = [
        'A Kalman filter cycle has two steps. **Predict** (actuation): the mean moves with the command and the variance **grows** by the actuation noise $R$. **Correct** (measurement): the gain $K$ says how far to move from the prediction towards the reading, and the variance **shrinks**. Course notation: $R$ = actuation (process) noise, $Q$ = sensor (measurement) noise.',
        `With $A = C = 1$${s.dt !== null ? ' and $B = \\Delta t$' : ' and $B = 1$'} the matrix equations become scalar: ${setupTex}`,
        sub,
        worked.join('\n\n'),
      ];

      const givens: Given[] = [
        { sym: '\\mu_{t-1}', value: `${n(c1.mu0)} m`, label: 'previous mean' },
        { sym: '\\Sigma_{t-1}', value: `${n(c1.s0)} m²`, label: 'previous variance' },
        s.dt !== null ? { sym: 'v_t,\\ \\Delta t', value: `${n(c1.u)} m/s, ${n(s.dt)} s`, label: 'velocity command' } : { sym: 'u_t', value: `${n(c1.u)} m`, label: 'commanded move' },
        { sym: 'R', value: `${n(m.R)} m²`, label: 'actuation noise variance' },
        { sym: 'Q', value: `${n(m.Q)} m²`, label: 'sensor noise variance' },
        ...(tier >= 2 ? [{ sym: 'z_t', value: `${n(c1.z)} m`, label: 'reading' }] : []),
      ];

      return { prompt, givens, parts, hints };
    },
  },
];
