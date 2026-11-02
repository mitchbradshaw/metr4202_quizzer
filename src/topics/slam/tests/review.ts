// Regression tests from the slam review: "how many readings to cross 0.5" questions are never on a knife edge
// (a symmetric sensor used to land exactly on 0.5), and the "why" / "prior" choices cannot be answered by picking
// the longest or the only instance-specific option.
import type { SelfTest } from '../../../selftest/types';
import { isTrue } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import type { ChoicePart, NumericPart, SolveInstance } from '../../../engine/types';
import { generators } from '../solve/occupancy';

const gen = (id: string) => generators.find((g) => g.id === id)!;
const num = (inst: SolveInstance, id: string) => inst.parts.find((p) => p.id === id && p.kind === 'numeric') as NumericPart | undefined;

/** Log-odds after k more steps of `step` from l: how far it sits from 0 on each side of the answer. */
function margins(l: number, step: number, need: number): { before: number; after: number } {
  const before = (l + (need - 1) * step) * Math.sign(l); // > 0: still on the starting side
  const after = -(l + need * step) * Math.sign(l); // > 0: across 0
  return { before, after };
}

export const tests: SelfTest[] = [
  {
    id: 'slam-review-knife-edge',
    topic: 'slam',
    title: '“How many more readings to cross 0.5?” is never a knife edge (slam-logodds tier 2, slam-occupancy tier 3 log-odds form; 300 seeds each)',
    source: 'Review fix: p(m|hit) = 1 − p(m|pass) used to land exactly on 0.5',
    run: () => {
      let worst2 = Infinity;
      let bad2 = '';
      for (let seed = 1; seed <= 300; seed++) {
        const inst = gen('slam-logodds').generate(makeRng(seed), 2);
        const l = num(inst, 'l')!.answer;
        const lH = num(inst, 'lh')!.answer;
        const lP = num(inst, 'lp')!.answer;
        const need = num(inst, 'need')!.answer;
        const m = margins(l, l > 0 ? lP : lH, need);
        const w = Math.min(m.before, m.after);
        if (w < worst2) {
          worst2 = w;
          bad2 = `seed ${seed}: l = ${l.toFixed(3)}, need ${need}, margins ${m.before.toFixed(3)} / ${m.after.toFixed(3)}`;
        }
      }
      let worst3 = Infinity;
      let bad3 = '';
      let n3 = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const inst = gen('slam-occupancy').generate(makeRng(seed), 3);
        const needP = num(inst, 'need');
        if (!needP) continue;
        n3++;
        const lOcc = num(inst, 'locc')!.answer;
        const lFree = num(inst, 'lfree')!.answer;
        const l = num(inst, 'l4')!.answer;
        const m = margins(l, l > 0 ? lFree : lOcc, needP.answer);
        const w = Math.min(m.before, m.after);
        if (w < worst3) {
          worst3 = w;
          bad3 = `seed ${seed}: l = ${l.toFixed(3)}, need ${needP.answer}, margins ${m.before.toFixed(3)} / ${m.after.toFixed(3)}`;
        }
      }
      return [
        isTrue('slam-logodds t2: one step short is still ≥ 0.05 on the starting side, and the answer is ≥ 0.05 across 0', worst2 >= 0.05, bad2),
        isTrue('slam-occupancy t3 (log-odds form) occurs', n3 > 50, `${n3} of 300`),
        isTrue('slam-occupancy t3: the same margins hold', worst3 >= 0.05, bad3),
      ];
    },
  },
  {
    id: 'slam-review-why-options',
    topic: 'slam',
    title: 'slam-occupancy tier 2: every “why” option quotes this instance’s numbers and the key is not the giveaway long one; the prior choice has a right-number-wrong-reason option',
    source: 'Review fix: the key used to be the only specific, longest option',
    run: () => {
      let noDigit = '';
      let ratioMax = 0;
      let ratioSeed = 0;
      let priorOk = true;
      for (let seed = 1; seed <= 200; seed++) {
        const inst = gen('slam-occupancy').generate(makeRng(seed), 2);
        const why = inst.parts.find((p) => p.id === 'why') as ChoicePart;
        for (const o of why.options) if (!/\d/.test(o.text)) noDigit = `seed ${seed}: “${o.text.slice(0, 50)}”`;
        const key = why.options.find((o) => o.correct)!.text.length;
        const others = why.options.filter((o) => !o.correct).map((o) => o.text.length);
        const r = key / Math.max(...others);
        if (r > ratioMax) {
          ratioMax = r;
          ratioSeed = seed;
        }
        const prior = inst.parts.find((p) => p.id === 'prior') as ChoicePart;
        const fives = prior.options.filter((o) => o.text.startsWith('0.5'));
        if (fives.length !== 2 || fives.filter((o) => o.correct).length !== 1) priorOk = false;
      }
      return [
        isTrue('every “why” option contains a number from the instance', !noDigit, noDigit),
        isTrue('key at most 1.35× the longest distractor', ratioMax <= 1.35, `max ${ratioMax.toFixed(2)} (seed ${ratioSeed})`),
        isTrue('prior: two “0.5” options, only one with the right reason', priorOk),
      ];
    },
  },
];
