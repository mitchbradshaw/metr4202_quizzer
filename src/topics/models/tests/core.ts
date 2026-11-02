// Self-tests for the beam model (core/models_beam.ts) and the scan models on a grid map (core/models_field.ts).
import type { CheckResult, SelfTest } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { mulberry32 } from '../../../engine/rng';
import {
  BEAM_COMPS,
  components,
  emInitialGuess,
  fitBeam,
  hitNorm,
  logLikelihood,
  mixture,
  normCdf,
  sampleBeam,
  shortNorm,
  spikeWidth,
  truncExpLambda,
  type BeamComp,
  type BeamParams,
} from '../../../core/models_beam';
import { beamScan, distanceTransform, expectedScan, beamAngles, fillRect, likelihoodField, makeMap, rayCast, type GridMap } from '../../../core/models_field';

/** ∫ f over [a, b] by composite Simpson's rule, split at the given break points (where f jumps). */
export function integrate(f: (z: number) => number, breaks: number[], n = 4000): number {
  const pts = [...new Set(breaks)].sort((x, y) => x - y);
  let total = 0;
  for (let s = 0; s + 1 < pts.length; s++) {
    const a = pts[s];
    const b = pts[s + 1];
    if (b - a < 1e-12) continue;
    const h = (b - a) / n;
    // Evaluate just inside the ends so a jump exactly at a break point is not double counted.
    const at = (k: number) => f(k === 0 ? a + 1e-12 * (b - a) : k === n ? b - 1e-12 * (b - a) : a + k * h);
    let sum = at(0) + at(n);
    for (let k = 1; k < n; k++) sum += (k % 2 ? 4 : 2) * at(k);
    total += (sum * h) / 3;
  }
  return total;
}

const CASES: BeamParams[] = [
  { zStar: 4, zMax: 8, sigma: 0.2, lambda: 0.6, w: { hit: 0.7, short: 0.15, max: 0.05, rand: 0.1 } },
  { zStar: 1.2, zMax: 5, sigma: 0.4, lambda: 2.5, w: { hit: 0.5, short: 0.3, max: 0.1, rand: 0.1 } },
  // Truncated hit Gaussian: z* close to z_max with a wide σ (η_hit matters).
  { zStar: 9.6, zMax: 10, sigma: 0.8, lambda: 0.2, w: { hit: 0.6, short: 0.1, max: 0.2, rand: 0.1 } },
];

const breaksOf = (p: BeamParams) => [0, p.zStar, p.zMax - spikeWidth(p), p.zMax];

function emCheck(hidden: BeamParams, n: number, seed: number): CheckResult[] {
  const next = mulberry32(seed);
  const zs = new Float64Array(n);
  for (let i = 0; i < n; i++) zs[i] = sampleBeam(hidden, next).z;
  const fit = fitBeam(zs, emInitialGuess(hidden.zStar, hidden.zMax), { maxIter: 400 });
  const f = fit.params;
  return [
    nearAbs(`EM z_hit (hidden ${hidden.w.hit})`, f.w.hit, hidden.w.hit, 0.02),
    nearAbs(`EM z_short (hidden ${hidden.w.short})`, f.w.short, hidden.w.short, 0.02),
    nearAbs(`EM z_max (hidden ${hidden.w.max})`, f.w.max, hidden.w.max, 0.01),
    nearAbs(`EM z_rand (hidden ${hidden.w.rand})`, f.w.rand, hidden.w.rand, 0.02),
    near(`EM σ_hit (hidden ${hidden.sigma} m)`, f.sigma, hidden.sigma, 0.06),
    near(`EM λ_short (hidden ${hidden.lambda} /m)`, f.lambda, hidden.lambda, 0.2),
    isTrue('EM never lowers the log-likelihood', fit.history.every((h, i) => i === 0 || h.logL >= fit.history[i - 1].logL - 1e-6)),
    isTrue(`fitted log-likelihood ≥ the hidden parameters’ (${fit.logL.toFixed(1)} vs ${logLikelihood(zs, hidden).toFixed(1)})`, fit.logL >= logLikelihood(zs, hidden) - 1e-6),
  ];
}

/** A 6 × 4 m room at 0.05 m with a pillar, for the scan-model checks. */
export function testRoom(): GridMap {
  const m = makeMap(120, 80, 0.05);
  fillRect(m, 0, 0, 6, 0.1);
  fillRect(m, 0, 3.9, 6, 4);
  fillRect(m, 0, 0, 0.1, 4);
  fillRect(m, 5.9, 0, 6, 4);
  fillRect(m, 2.5, 1.5, 3.0, 2.2);
  return m;
}

export const tests: SelfTest[] = [
  {
    id: 'models-beam-normalised',
    topic: 'models',
    title: 'Beam model: each component and the weighted mixture integrate to 1 over [0, z_max] (three parameter sets)',
    source: 'Thrun et al., Probabilistic Robotics §6.3 (normalisers η); summary notes §3',
    run: () =>
      CASES.flatMap((p, k) => {
        const out: CheckResult[] = BEAM_COMPS.map((c: BeamComp) => nearAbs(`case ${k + 1}: ∫ p_${c} dz = 1`, integrate((z) => components(z, p)[c], breaksOf(p)), 1, 2e-4));
        out.push(nearAbs(`case ${k + 1}: ∫ p(z | x, m) dz = 1`, integrate((z) => mixture(z, p), breaksOf(p)), 1, 2e-4));
        return out;
      }),
  },
  {
    id: 'models-beam-pieces',
    topic: 'models',
    title: 'Beam model pieces: η_hit, η_short, Φ, p_short zero beyond z*, p_rand = 1/z_max, the spike at z_max',
    source: 'Thrun et al. Table 6.1',
    run: () => {
      const p = CASES[0];
      return [
        nearAbs('Φ(0) = 0.5', normCdf(0), 0.5, 1e-7),
        nearAbs('Φ(1.96) = 0.97500', normCdf(1.96), 0.9750021, 2e-7),
        nearAbs('η_hit ≈ 1 when z* is 20σ inside the range', hitNorm(4, 0.2, 8), 1, 1e-7),
        near('η_hit = 1/Φ(0.5) for z* 0.4 m below z_max = 10 with σ 0.8 (left tail negligible)', hitNorm(9.6, 0.8, 10), 1 / normCdf(0.5), 1e-6),
        near('η_short = 1/(1 − e^{−λz*}) = 1/(1 − e^{−2.4})', shortNorm(4, 0.6), 1 / (1 - Math.exp(-2.4)), 1e-12),
        nearAbs('p_short(z > z*) = 0', components(4.5, p).short, 0, 0),
        near('p_rand = 1/z_max', components(3, p).rand, 1 / 8, 1e-12),
        near('p_max(z_max) = 1/Δ (the point mass as a box)', components(8, p).max, 1 / spikeWidth(p), 1e-12),
        nearAbs('p_max just below the box = 0', components(8 - 2 * spikeWidth(p), p).max, 0, 0),
        near('truncated-exponential λ round trip (mean of λ = 0.6 on [0, 4])', truncExpLambda(1 / 0.6 - 4 / Math.expm1(2.4), 4), 0.6, 1e-6),
      ];
    },
  },
  {
    id: 'models-beam-em',
    topic: 'models',
    title: 'Characterising a sensor: EM recovers the hidden weights, σ_hit and λ_short from 20 000 simulated readings',
    source: 'Summary notes §3 (fit the mixture by maximum likelihood); Thrun et al. Table 6.2',
    run: () => [
      ...emCheck({ zStar: 4, zMax: 8, sigma: 0.15, lambda: 0.8, w: { hit: 0.7, short: 0.1, max: 0.05, rand: 0.15 } }, 20000, 11),
      ...emCheck({ zStar: 2.5, zMax: 6, sigma: 0.3, lambda: 1.5, w: { hit: 0.45, short: 0.35, max: 0.12, rand: 0.08 } }, 20000, 29),
    ],
  },
  {
    id: 'models-field-edt',
    topic: 'models',
    title: 'Distance transform equals brute force; ray casting hits the walls at the expected range',
    run: () => {
      const m = makeMap(23, 17, 0.1);
      const next = mulberry32(5);
      for (let k = 0; k < 40; k++) m.occ[Math.floor(next() * m.occ.length)] = 1;
      const dt = distanceTransform(m);
      let worst = 0;
      for (let j = 0; j < m.h; j++)
        for (let i = 0; i < m.w; i++) {
          let best = Infinity;
          for (let q = 0; q < m.h; q++) for (let p = 0; p < m.w; p++) if (m.occ[q * m.w + p]) best = Math.min(best, Math.hypot(p - i, q - j) * m.res);
          worst = Math.max(worst, Math.abs(best - dt[j * m.w + i]));
        }
      const room = testRoom();
      return [
        nearAbs('max |EDT − brute force| over a random 23 × 17 map', worst, 0, 1e-6),
        nearAbs('ray east from (1, 1) hits the wall at x = 5.9: 4.9 m', rayCast(room, 1, 1, 0, 8), 4.9, 1e-9),
        nearAbs('ray north from (1, 1) hits the wall at y = 3.9: 2.9 m', rayCast(room, 1, 1, Math.PI / 2, 8), 2.9, 1e-9),
        nearAbs('ray east from (1, 1.8) hits the pillar at x = 2.5: 1.5 m', rayCast(room, 1, 1.8, 0, 8), 1.5, 1e-9),
        nearAbs('a ray shorter than the wall returns z_max', rayCast(room, 1, 1, 0, 3), 3, 0),
      ];
    },
  },
  {
    id: 'models-field-scores',
    topic: 'models',
    title: 'Scan models peak at the true pose: likelihood field and beam model both prefer it to shifted or turned poses',
    run: () => {
      const room = testRoom();
      const dt = distanceTransform(room);
      const truth = { x: 1.6, y: 1.1, theta: 0.3 };
      const scan = expectedScan(room, truth, beamAngles(36), 8);
      const f = { zHit: 0.9, zRand: 0.1, sigma: 0.1 };
      const bp = { sigma: 0.1, lambda: 1, w: { hit: 0.8, short: 0.1, max: 0.05, rand: 0.05 } };
      const lf = (p: typeof truth) => likelihoodField(room, dt, p, scan, f).logq;
      const bm = (p: typeof truth) => beamScan(room, p, scan, bp).logq;
      const others = [
        { x: 1.9, y: 1.1, theta: 0.3 },
        { x: 1.6, y: 1.4, theta: 0.3 },
        { x: 1.6, y: 1.1, theta: 0.5 },
      ];
      return [
        isTrue('likelihood field: true pose beats 3 perturbed poses', others.every((o) => lf(truth) > lf(o)), others.map((o) => lf(o).toFixed(1)).join(', ') + ` vs ${lf(truth).toFixed(1)}`),
        isTrue('beam model: true pose beats 3 perturbed poses', others.every((o) => bm(truth) > bm(o)), others.map((o) => bm(o).toFixed(1)).join(', ') + ` vs ${bm(truth).toFixed(1)}`),
        isTrue('every end point of the true scan lies within one cell of an obstacle', likelihoodField(room, dt, truth, scan, f).beams.every((b) => b.skipped || b.dist <= 0.05 + 1e-9)),
      ];
    },
  },
];
