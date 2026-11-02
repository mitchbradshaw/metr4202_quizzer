// Self-tests for the filters core (core/filters_kalman.ts, core/filters_particle.ts) and the which-filter model:
// reference numbers from the topic's worked examples, the closed-form steady-state gains, and the resampling
// properties the simulations and generators rely on.
import type { CheckResult, SelfTest } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import {
  alphaBetaSteadyGain,
  constantVelocityModel,
  ekfPredict,
  ekfUpdate,
  kf1GainSequence,
  kf1Step,
  kf1SteadyState,
  kfPredict,
  kfSteadyGain,
  kfUpdate,
  type Mat,
  type Vec,
} from '../../../core/filters_kalman';
import { copyCounts, cumulativeWeights, expectedCopies, lowVarianceIndices, normaliseWeights } from '../../../core/filters_particle';
import { SHAPES, drawParticles, findSeed, momentMatch, modeCounts, overlap, density } from '../explore/whichModel';

const KF1 = { a: 1, b: 1, c: 1 };

export const tests: SelfTest[] = [
  {
    id: 'filters-kf1d-reference',
    topic: 'filters',
    title: '1-D Kalman cycle: the worked numbers of the Kalman concept cards',
    source: 'Filters concept cards (worked example, checked by hand): N(2, 0.04), u = 1, R = 0.05, z = 3.3',
    run: () => {
      const a = kf1Step(2, 0.04, 1, 3.3, { ...KF1, R: 0.05, Q: 0.09 });
      const b = kf1Step(2, 0.04, 1, 3.3, { ...KF1, R: 0.05, Q: 0.36 });
      const c = kf1Step(2, 0.04, 1, 3.6, { ...KF1, R: 0.05, Q: 0.09 });
      return [
        nearAbs('μ̄ = 2 + 1', a.muBar, 3, 1e-12),
        nearAbs('Σ̄ = 0.04 + 0.05', a.s2Bar, 0.09, 1e-12),
        nearAbs('K = 0.09/(0.09 + 0.09)', a.K, 0.5, 1e-12),
        nearAbs('μ = 3 + 0.5 (0.3)', a.mu, 3.15, 1e-12),
        nearAbs('Σ = 0.5 × 0.09', a.s2, 0.045, 1e-12),
        nearAbs('Q = 0.36: K = 0.2', b.K, 0.2, 1e-12),
        nearAbs('Q = 0.36: μ = 3.06 (moves less)', b.mu, 3.06, 1e-12),
        nearAbs('Q = 0.36: Σ = 0.072 (shrinks less)', b.s2, 0.072, 1e-12),
        nearAbs('z = 3.6: μ = 3.3', c.mu, 3.3, 1e-12),
        nearAbs('z = 3.6: Σ unchanged (z only moves the mean)', c.s2, 0.045, 1e-12),
      ];
    },
  },
  {
    id: 'filters-kf1d-steady',
    topic: 'filters',
    title: 'Scalar steady-state gain: closed form = limit of the Riccati iteration',
    source: 'Random walk (a = c = 1): Σ̄∞ = (R + √(R² + 4RQ))/2; concept card value K∞ ≈ 0.518 for R = 0.05, Q = 0.09',
    run: () => {
      const out: CheckResult[] = [];
      const ss = kf1SteadyState({ a: 1, c: 1, R: 0.05, Q: 0.09 });
      out.push(nearAbs('K∞ (R 0.05, Q 0.09)', ss.K, 0.518, 0.0006));
      for (const [a, R, Q] of [
        [1, 0.05, 0.09],
        [1, 1, 4],
        [0.9, 0.5, 2],
        [1.05, 0.2, 1],
      ]) {
        const m = { a, b: 1, c: 1, R, Q };
        const seq = kf1GainSequence(10, 400, m);
        out.push(near(`a ${a}, R ${R}, Q ${Q}: closed form = iterated`, kf1SteadyState(m).K, seq.K[seq.K.length - 1], 1e-9));
      }
      return out;
    },
  },
  {
    id: 'filters-kf-cv-steady',
    topic: 'filters',
    title: 'Constant-velocity model: iterated steady-state gain = the α–β closed form',
    source: 'Kalata (1984) tracking index λ = σ_a Δt²/σ_z: α = −(λ² + 8λ − (λ + 4)√(λ² + 8λ))/8, β = (λ² + 4λ − λ√(λ² + 8λ))/4',
    run: () => {
      const out: CheckResult[] = [];
      for (const [dt, sa, sz] of [
        [1, 0.5, 2],
        [0.1, 3, 0.5],
        [0.5, 1, 1],
      ]) {
        const m = constantVelocityModel(dt, sa, sz);
        const it = kfSteadyGain(m.A, m.C, m.R, m.Q);
        const cf = alphaBetaSteadyGain(dt, sa, sz);
        out.push(near(`Δt ${dt}, σa ${sa}, σz ${sz}: K position (α)`, it.K[0][0], cf.K[0], 1e-6));
        out.push(near(`Δt ${dt}, σa ${sa}, σz ${sz}: K velocity (β/Δt)`, it.K[1][0], cf.K[1], 1e-6));
      }
      return out;
    },
  },
  {
    id: 'filters-kf-matrix-scalar',
    topic: 'filters',
    title: 'Matrix KF with 1 × 1 matrices = scalar KF; EKF with linear g, h = KF',
    source: 'Summary notes §2 Kalman equations (R actuation, Q sensor)',
    run: () => {
      const s = kf1Step(1.5, 0.7, 2, 3.1, { a: 1, b: 1, c: 1, R: 0.3, Q: 0.4 });
      const p = kfPredict([1.5], [[0.7]], [[1]], [[1]], [2], [[0.3]]);
      const u = kfUpdate(p.muBar, p.SigmaBar, [[1]], [3.1], [[0.4]]);
      const A: Mat = [
        [1, 0.5],
        [0, 1],
      ];
      const B: Mat = [[0.125], [0.5]];
      const C: Mat = [[1, 0]];
      const R: Mat = [
        [0.02, 0.01],
        [0.01, 0.05],
      ];
      const Q: Mat = [[0.3]];
      const mu: Vec = [2, 1];
      const S: Mat = [
        [0.5, 0.1],
        [0.1, 0.4],
      ];
      const kp = kfPredict(mu, S, A, B, [0.8], R);
      const ku = kfUpdate(kp.muBar, kp.SigmaBar, C, [2.9], Q);
      const ep = ekfPredict(mu, S, [0.8], (uu, x) => [x[0] + 0.5 * x[1] + 0.125 * uu[0], x[1] + 0.5 * uu[0]], () => A, R);
      const eu = ekfUpdate(ep.muBar, ep.SigmaBar, [2.9], (x) => [x[0]], () => C, Q);
      return [
        nearAbs('μ̄', p.muBar[0], s.muBar, 1e-12),
        nearAbs('Σ̄', p.SigmaBar[0][0], s.s2Bar, 1e-12),
        nearAbs('K', u.K[0][0], s.K, 1e-12),
        nearAbs('μ', u.mu[0], s.mu, 1e-12),
        nearAbs('Σ', u.Sigma[0][0], s.s2, 1e-12),
        nearAbs('EKF μ (position)', eu.mu[0], ku.mu[0], 1e-12),
        nearAbs('EKF μ (velocity)', eu.mu[1], ku.mu[1], 1e-12),
        nearAbs('EKF Σ₁₂', eu.Sigma[0][1], ku.Sigma[0][1], 1e-12),
        isTrue('posterior covariance symmetric', Math.abs(ku.Sigma[0][1] - ku.Sigma[1][0]) < 1e-12),
      ];
    },
  },
  {
    id: 'filters-pf-weights',
    topic: 'filters',
    title: 'Particle weights normalise; expected copies sum to M',
    source: 'Summary notes §2 particle filter loop (weight = sensor likelihood, then normalise)',
    run: () => {
      const w = [0.8, 0.8, 0.1, 0.8, 0.1];
      const wn = normaliseWeights(w);
      const sum = Array.from(wn).reduce((a, b) => a + b, 0);
      const z = normaliseWeights([0, 0, 0, 0]);
      const e = expectedCopies(w);
      const c = cumulativeWeights(w);
      return [
        nearAbs('Σ w̄ = 1', sum, 1, 1e-12),
        nearAbs('w̄₁ = 0.8/2.6', wn[0], 0.8 / 2.6, 1e-12),
        nearAbs('all-zero weights fall back to 1/M', z[2], 0.25, 1e-12),
        nearAbs('Σ M w̄ = M', Array.from(e).reduce((a, b) => a + b, 0), 5, 1e-12),
        nearAbs('c₃ = (0.8 + 0.8 + 0.1)/2.6', c[2], 1.7 / 2.6, 1e-12),
        nearAbs('last cumulative weight = 1', c[4], 1, 0),
      ];
    },
  },
  {
    id: 'filters-pf-lowvariance',
    topic: 'filters',
    title: 'Low-variance resampling: worked picks; weight 1/M copied exactly once; M w̄ copies on average over r',
    source: 'Thrun Table 4.4; filters concept card example (w = .8 .8 .1 .8 .1, r = 0.1 picks x1 x1 x2 x4 x4)',
    run: () => {
      const out: CheckResult[] = [];
      const w = [0.8, 0.8, 0.1, 0.8, 0.1];
      const idx = Array.from(lowVarianceIndices(w, 0.1));
      out.push(isTrue('r = 0.1 picks x1, x1, x2, x4, x4', idx.join(',') === '0,0,1,3,3', idx.map((i) => i + 1).join(',')));
      // A particle whose normalised weight is exactly 1/M: copied exactly once for every r in [0, 1/M).
      const v = [0.3, 0.2, 0.15, 0.35, 0.0];
      let once = true;
      for (let k = 0; k < 200; k++) {
        const r = (k + 0.5) / 200 / 5;
        if (copyCounts(lowVarianceIndices(v, r), 5)[1] !== 1) once = false;
      }
      out.push(isTrue('w̄ = 1/M is copied exactly once, for 200 values of r', once));
      // Averaged over r ∈ [0, 1/M), the copies equal M w̄ (the sampler is unbiased).
      const u = [0.05, 0.42, 0.13, 0.28, 0.12];
      const avg = new Float64Array(5);
      const N = 4000;
      let keeps = true;
      for (let k = 0; k < N; k++) {
        const r = (k + 0.5) / N / 5;
        const cc = copyCounts(lowVarianceIndices(u, r), 5);
        for (let i = 0; i < 5; i++) avg[i] += cc[i] / N;
        for (let i = 0; i < 5; i++) if (u[i] >= 0.2 && cc[i] < 1) keeps = false;
      }
      for (let i = 0; i < 5; i++) out.push(nearAbs(`mean copies of particle ${i + 1} = M w̄ = ${(5 * u[i]).toFixed(2)}`, avg[i], 5 * u[i], 0.002));
      out.push(isTrue('every particle with w̄ ≥ 1/M survives, for every r', keeps));
      return out;
    },
  },
  {
    id: 'filters-which-model',
    topic: 'filters',
    title: 'which-filter model: moment match, nested particle draws, overlap, deprivation seed',
    source: 'Mixture moments: μ = Σ wᵢμᵢ, σ² = Σ wᵢ(sᵢ² + μᵢ²) − μ²',
    run: () => {
      const two = momentMatch(SHAPES.two);
      const big = drawParticles(SHAPES.rare, 9, 2000);
      const small = drawParticles(SHAPES.rare, 9, 50);
      let nested = true;
      for (let i = 0; i < 50; i++) if (big[i] !== small[i]) nested = false;
      const self = overlap((x) => density(SHAPES.skew, x), (x) => density(SHAPES.skew, x));
      const s = findSeed(SHAPES.rare, 10, (c) => c[2] === 0 && c[0] > 0 && c[1] > 0, 11);
      const counts = modeCounts(SHAPES.rare, drawParticles(SHAPES.rare, s, 10), 10);
      return [
        nearAbs('two doors: μ = 5 m', two.mu, 5, 1e-12),
        nearAbs('two doors: σ² = 0.16 + 6.25', two.s2, 6.41, 1e-12),
        isTrue('the first 50 of 2000 draws = a 50-particle draw', nested),
        nearAbs('overlap of a belief with itself = 1', self, 1, 2e-3),
        isTrue('a seed exists where the 0.1 hypothesis gets no particle (M = 10)', counts[2] === 0 && counts[0] > 0, `seed ${s}: ${counts.join(',')}`),
      ];
    },
  },
];
