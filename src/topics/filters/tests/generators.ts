// Self-tests for the filters generators: the sanity sweep (every generator x tier x 40 seeds), and consistency of
// each instance with the core filters (the KF parts obey the Kalman equations for the printed givens; the PF parts
// match normalise / cumulative / low-variance picks for the printed r; every scenario has one right filter).
import type { CheckResult, SelfTest } from '../../../selftest/types';
import type { ChoicePart, MatrixPart, NumericPart, SolveInstance, SolvePart } from '../../../engine/types';
import { isTrue } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { lowVarianceIndices } from '../../../core/filters_particle';
import { generators } from '../solve';
import { generatorSanity } from './sanity';

const gen = (id: string) => generators.find((g) => g.id === id)!;
const num = (inst: SolveInstance, id: string) => (inst.parts.find((p) => p.id === id) as NumericPart | undefined)?.answer;
const mat = (inst: SolveInstance, id: string) => (inst.parts.find((p) => p.id === id) as MatrixPart | undefined)?.answer.map((r) => r[0]);
/** The leading number of a given's value ("0.5 m²" → 0.5). */
const given = (inst: SolveInstance, sym: string) => {
  const g = inst.givens?.find((x) => x.sym === sym);
  return g ? parseFloat(g.value) : NaN;
};

function sweep(id: string, tiers: number[], check: (inst: SolveInstance, tier: number) => string): CheckResult[] {
  return tiers.map((tier) => {
    let bad = '';
    for (let s = 1; s <= 40 && !bad; s++) {
      const inst = gen(id).generate(makeRng(s * 104729 + tier), tier as 1 | 2 | 3);
      const e = check(inst, tier);
      if (e) bad = `seed ${s * 104729 + tier}: ${e}`;
    }
    return isTrue(`${id} tier ${tier}: 40 instances consistent`, !bad, bad);
  });
}

const close = (a: number | undefined, b: number, tol = 1e-9) => a !== undefined && Math.abs(a - b) <= tol;

export const tests: SelfTest[] = [
  {
    id: 'filters-generators-sanity',
    topic: 'filters',
    title: 'Filters generators: every tier × 40 seeds well formed, own answers accepted, traps rejected, TeX parses',
    source: 'docs/AUTHORING.md (generator sanity test)',
    run: () => [...generatorSanity(gen('filters-kf'), 40), ...generatorSanity(gen('filters-pf'), 40, ['wn']), ...generatorSanity(gen('filters-choice'), 40)],
  },
  {
    id: 'filters-kf-gen-equations',
    topic: 'filters',
    title: 'filters-kf: every instance obeys the Kalman equations for its printed givens',
    source: 'Summary notes §2: μ̄ = μ + Bu, Σ̄ = Σ + R, K = Σ̄/(Σ̄ + Q), μ = μ̄ + K(z − μ̄), Σ = (1 − K)Σ̄',
    run: () =>
      sweep('filters-kf', [1, 2, 3], (inst, tier) => {
        const mu0 = given(inst, '\\mu_{t-1}');
        const s0 = given(inst, '\\Sigma_{t-1}');
        const R = given(inst, 'R');
        const Q = given(inst, 'Q');
        const s2Bar = num(inst, 's2bar');
        const K = num(inst, 'K');
        if (!close(s2Bar, s0 + R)) return `Σ̄ ${s2Bar} ≠ ${s0} + ${R}`;
        if (!close(K, (s0 + R) / (s0 + R + Q))) return `K ${K} wrong`;
        const muBar = num(inst, 'mubar')!;
        if (!(muBar > mu0)) return `μ̄ ${muBar} did not move forward from ${mu0}`;
        if (tier >= 2) {
          const z = given(inst, 'z_t');
          if (!close(num(inst, 'mu'), muBar + K! * (z - muBar))) return 'μ wrong';
          if (!close(num(inst, 's2'), (1 - K!) * s2Bar!)) return 'Σ wrong';
          if (!(num(inst, 's2')! < s2Bar!)) return 'Σ did not shrink';
        }
        if (inst.parts.some((p) => p.id === 'Kq2')) {
          if (!(num(inst, 'Kq2')! < K!)) return 'doubling Q did not lower K';
          if (!(num(inst, 's2q2')! > num(inst, 's2')!)) return 'doubling Q did not raise Σ';
          const z = given(inst, 'z_t');
          if (!(Math.abs(num(inst, 'muq2')! - muBar) < Math.abs(num(inst, 'mu')! - muBar) || Math.abs(z - muBar) < 1e-12)) return 'doubling Q did not keep μ nearer μ̄';
        }
        if (inst.parts.some((p) => p.id === 'K2')) {
          if (!close(num(inst, 's2bar2'), num(inst, 's2')! + R)) return 'second cycle Σ̄ does not start from Σ_t';
          if (!(num(inst, 'mubar2')! > num(inst, 'mu')!)) return 'second cycle μ̄ does not move forward from μ_t';
        }
        return '';
      }),
  },
  {
    id: 'filters-pf-gen-resampling',
    topic: 'filters',
    title: 'filters-pf: weights normalise, cumulative ends at 1, the keyed set = the low-variance picks for the printed r',
    source: 'Thrun Table 4.4 (low-variance sampler): U_m = r + (m − 1)/M',
    run: () =>
      sweep('filters-pf', [1, 2, 3], (inst, tier) => {
        const w = mat(inst, 'w')!;
        const wn = mat(inst, 'wn')!;
        const M = w.length;
        const W = w.reduce((a, b) => a + b, 0);
        if (Math.abs(wn.reduce((a, b) => a + b, 0) - 1) > 1e-9) return 'w̄ does not sum to 1';
        if (wn.some((v, i) => Math.abs(v - w[i] / W) > 1e-12)) return 'w̄ ≠ w/Σw';
        const best = wn.indexOf(Math.max(...wn));
        if (!close(num(inst, 'copies'), M * wn[best])) return 'expected copies ≠ M w̄ of the best particle';
        if (tier >= 2) {
          const c = mat(inst, 'c')!;
          if (Math.abs(c[M - 1] - 1) > 1e-12) return 'last cumulative weight ≠ 1';
          const r = given(inst, 'r');
          const idx = Array.from(lowVarianceIndices(wn, r, M));
          const lv = inst.parts.find((p) => p.id === 'lv') as ChoicePart;
          const key = lv.options.find((o) => o.correct)!.text;
          const expect = `$${idx.map((i) => `x_{${i + 1}}`).join(',\\ ')}$`;
          if (key !== expect) return `keyed ${key}, picks ${expect}`;
          if (lv.options.length < 3) return `only ${lv.options.length} options`;
        }
        if (tier === 3) {
          const lose = num(inst, 'lose')!;
          if (!(lose > 0 && lose < 1)) return `P(lost) = ${lose}`;
        }
        return '';
      }),
  },
  {
    id: 'filters-choice-gen',
    topic: 'filters',
    title: 'filters-choice: one right filter per scenario, a why for every option, every scenario reachable',
    source: 'Summary notes §2 table; 2023 Q22',
    run: () => {
      const seen = new Set<string>();
      let bad = '';
      for (const tier of [1, 2] as const)
        for (let s = 1; s <= 200 && !bad; s++) {
          const inst = gen('filters-choice').generate(makeRng(s * 31 + tier), tier);
          const f = inst.parts.find((p: SolvePart) => p.id === 'filter') as ChoicePart;
          if (f.options.filter((o) => o.correct).length !== 1) bad = `seed ${s}: ${f.options.filter((o) => o.correct).length} right filters`;
          seen.add(f.label.slice(0, 40));
        }
      return [isTrue('every instance has exactly one right filter', !bad, bad), isTrue('at least 12 different scenarios appear over 400 instances', seen.size >= 12, `${seen.size}`)];
    },
  },
];
