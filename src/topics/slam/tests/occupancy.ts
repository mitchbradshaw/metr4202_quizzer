// Self-tests for one occupancy cell (core/slam.ts, used by the occupancy simulation and the slam-occupancy /
// slam-logodds generators): the review deck and 2023 Q31 numbers, log-odds form = Bayes form for any prior,
// priors of 0 and 1, order invariance, and the generators' paper instances.
import type { SelfTest } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { afterCounts, fromLogOdds, logOdds, logOddsStep, occupancyTable, probabilityTrace, readingLR, readingStep, readingsToCancel, type BinaryReading } from '../../../core/slam';
import { occupancySequence } from '../../../core/prob';
import { makeRng } from '../../../engine/rng';
import { checkNumeric } from '../../../engine/check';
import type { NumericPart } from '../../../engine/types';
import { generators } from '../solve/occupancy';

const REVIEW = { tp: 0.85, tn: 0.99 };
const Q31 = { tp: 0.7, tn: 0.95 };

export const tests: SelfTest[] = [
  {
    id: 'slam-occ-review',
    topic: 'slam',
    title: 'Review deck (TP 0.85, TN 0.99): OCC → 0.9884, then FREE → 0.92795 exact (slide 0.9281 from the rounded 0.9884)',
    source: 'Review deck slides 10-13',
    run: () => {
      const rows = occupancyTable(0.5, ['occ', 'free'], REVIEW);
      const slide = (0.15 * 0.9884) / (0.15 * 0.9884 + 0.99 * (1 - 0.9884));
      return [
        nearAbs('p after OCC = 0.9884', rows[0].post, 0.9884, 5e-5),
        nearAbs('p after FREE = 0.92795 (exact)', rows[1].post, 0.92795, 5e-6),
        nearAbs('slide value 0.9281 = carrying the rounded 0.9884', slide, 0.9281, 5e-5),
        isTrue('exact and slide values within the exam tolerance 0.0005', Math.abs(rows[1].post - 0.9281) < 0.0005),
        nearAbs('l1 = ln 85 = 4.4427 (slide 4.4451 from rounded p)', rows[0].l, Math.log(85), 1e-12),
        nearAbs('slide l1 = ln(0.9884 / 0.0116) = 4.4451', logOdds(0.9884), 4.4451, 5e-5),
        nearAbs('FREE step ln(0.15 / 0.99) = −1.8871 (slide −1.8869 from 0.1316)', rows[1].dl, Math.log(0.15 / 0.99), 1e-12),
        nearAbs('inverse sensor model p(m | occ) = 0.9884', rows[0].ism, 0.9884, 5e-5),
        nearAbs('inverse sensor model p(m | free) = 0.1316', rows[1].ism, 0.1316, 5e-5),
        nearAbs('log-odds form = Bayes form', fromLogOdds(rows[1].l), rows[1].post, 1e-12),
        nearAbs('same as core/prob occupancySequence', rows[1].post, occupancySequence(0.5, ['occ', 'free'], REVIEW)[2], 1e-15),
      ];
    },
  },
  {
    id: 'slam-occ-2023q31',
    topic: 'slam',
    title: '2023 Q31 (TP 0.70, TN 0.95): 0.9333 then 0.8155; LR 14 vs about 3.2; 3 FREE to undo one OCC',
    source: '2023 worked solutions Q31 (a)-(d)',
    run: () => {
      const rows = occupancyTable(0.5, ['occ', 'free'], Q31);
      return [
        nearAbs('p after OCC = 0.9333', rows[0].post, 0.9333, 5e-5),
        nearAbs('p after FREE = 0.8155', rows[1].post, 0.8155, 5e-5),
        nearAbs('l1 = ln 14 = 2.639', rows[0].l, 2.639, 5e-4),
        nearAbs('l2 = 2.639 − 1.153 = 1.486', rows[1].l, 1.486, 5e-4),
        near('LR(OCC) = 0.70 / 0.05 = 14', readingLR('occ', Q31), 14, 1e-9),
        near('1 / LR(FREE) = 0.95 / 0.30 = 3.17', 1 / readingLR('free', Q31), 0.95 / 0.3, 1e-9),
        isTrue('one FREE takes 3 readings to undo one OCC (2.639 / 1.153 = 2.29)', readingsToCancel('occ', 'free', Q31) === 3, String(readingsToCancel('occ', 'free', Q31))),
        nearAbs('after OCC + 2 FREE: p = 0.58 (still above 0.5)', afterCounts(0.5, 1, 2, Q31), fromLogOdds(Math.log(14) + 2 * Math.log(0.3 / 0.95)), 1e-12),
        isTrue('after OCC + 3 FREE: below 0.5', afterCounts(0.5, 1, 3, Q31) < 0.5),
        nearAbs('FREE then OCC ends at the same 0.8155 (order does not matter)', probabilityTrace(0.5, ['free', 'occ'], Q31)[2], rows[1].post, 1e-12),
        nearAbs('FREE first dips to 0.24', probabilityTrace(0.5, ['free'], Q31)[1], 0.24, 1e-12),
      ];
    },
  },
  {
    id: 'slam-occ-logodds-bayes',
    topic: 'slam',
    title: 'Log-odds form = Bayes form for random sensors, priors (incl. ≠ 0.5) and reading sequences; course form with −l0',
    source: 'Summary notes §4; review deck slide 12',
    run: () => {
      const rng = makeRng(4202);
      let worst = 0;
      let worstCourse = 0;
      for (let k = 0; k < 400; k++) {
        const s = { tp: rng.uniform(0.51, 0.99), tn: rng.uniform(0.51, 0.99) };
        const p0 = rng.uniform(0.05, 0.95);
        const zs: BinaryReading[] = Array.from({ length: rng.int(1, 8) }, () => (rng.chance(0.5) ? 'occ' : 'free'));
        const rows = occupancyTable(p0, zs, s);
        let lc = logOdds(p0);
        rows.forEach((r) => {
          worst = Math.max(worst, Math.abs(fromLogOdds(r.l) - r.post));
          lc = logOddsStep(lc, r.z, s, p0);
          worstCourse = Math.max(worstCourse, Math.abs(lc - r.l));
        });
      }
      return [
        nearAbs('max |p(log-odds) − p(Bayes)| over 400 random runs', worst, 0, 1e-12),
        nearAbs('course form l + ln(ism/(1−ism)) − l0 (ism with the same prior) = l + ln LR', worstCourse, 0, 1e-10),
      ];
    },
  },
  {
    id: 'slam-occ-prior-certain',
    topic: 'slam',
    title: 'Priors of 0 and 1 never move (2025 Q22); OCC-then-FREE ends below 0.5 exactly when TP > TN',
    source: '2025 worked solutions Q22; derived from l = ln[TP(1 − TP) / (TN(1 − TN))]',
    run: () => {
      const ten: BinaryReading[] = Array(10).fill('occ');
      const r0 = occupancyTable(0, ten, REVIEW);
      const r1 = occupancyTable(1, Array<BinaryReading>(10).fill('free'), REVIEW);
      let ok = true;
      let bad = '';
      for (let tp = 0.52; tp < 0.995; tp += 0.03)
        for (let tn = 0.52; tn < 0.995; tn += 0.03) {
          if (Math.abs(tp - tn) < 1e-6) continue;
          const p = probabilityTrace(0.5, ['occ', 'free'], { tp, tn })[2];
          if (p < 0.5 !== tp > tn) {
            ok = false;
            bad = `tp ${tp.toFixed(2)}, tn ${tn.toFixed(2)}: ${p}`;
          }
        }
      return [
        isTrue('prior 0 + ten OCC (85× each) stays exactly 0', r0.every((r) => r.post === 0)),
        isTrue('prior 0: log-odds stays −∞', r0.every((r) => r.l === -Infinity)),
        isTrue('prior 1 + ten FREE stays exactly 1', r1.every((r) => r.post === 1)),
        isTrue('OCC-then-FREE < 0.5 ⇔ TP > TN (sweep)', ok, bad),
        nearAbs('symmetric sensor (0.9, 0.9): OCC then FREE = 0.5 exactly', probabilityTrace(0.5, ['occ', 'free'], { tp: 0.9, tn: 0.9 })[2], 0.5, 1e-12),
        nearAbs('ln LR(OCC) at (0.9, 0.9) = ln 9', readingStep('occ', { tp: 0.9, tn: 0.9 }), Math.log(9), 1e-12),
      ];
    },
  },
  {
    id: 'slam-occ-generator-paper',
    topic: 'slam',
    title: 'slam-occupancy tier 2: the review-deck instance accepts both 0.92795 and the slide’s 0.9281; parts total 10 marks',
    source: 'Generator slam-occupancy; review deck slide 12',
    run: () => {
      const gen = generators.find((g) => g.id === 'slam-occupancy')!;
      let found: NumericPart | null = null;
      let marksOk = true;
      let marksBad = '';
      for (let seed = 1; seed <= 3000; seed++) {
        const inst = gen.generate(makeRng(seed), 2);
        const total = inst.parts.reduce((t, p) => t + (p.marks ?? 0), 0);
        if (Math.abs(total - 10) > 1e-9) {
          marksOk = false;
          marksBad = `seed ${seed}: ${total}`;
        }
        const tp = inst.givens?.find((g) => g.sym === '\\text{TP}')?.value;
        const tn = inst.givens?.find((g) => g.sym === '\\text{TN}')?.value;
        const zs = inst.givens?.find((g) => g.sym.startsWith('z_'))?.value;
        if (!found && tp === '0.85' && tn === '0.99' && zs === 'occ, free') found = inst.parts.find((p) => p.id === 'p2') as NumericPart;
      }
      const f = found as NumericPart | null;
      return [
        isTrue('tier-2 parts always total 10 marks (2023 Q31)', marksOk, marksBad),
        isTrue('the review-deck instance (0.85, 0.99; occ, free) occurs', !!f),
        isTrue('exact 0.92795 accepted', !!f && checkNumeric(f, '0.92795').correct),
        isTrue('slide 0.9281 accepted', !!f && checkNumeric(f, '0.9281').correct),
        isTrue('0.9884 (forgot the FREE reading) rejected', !!f && !checkNumeric(f, '0.9884').correct),
        isTrue('0.1316 (started from 0.5 again) rejected', !!f && !checkNumeric(f, '0.1316').correct),
      ];
    },
  },
];
