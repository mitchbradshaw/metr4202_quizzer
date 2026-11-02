// Self-tests for the bayes exam-mode generators: the paper instances reproduced through the generators' own
// solvers (2024 Q28 and 2025 Q28 worked solutions), and a sanity sweep of every generator.
import type { SelfTest } from '../../../selftest/types';
import { isTrue, nearAbs } from '../../../selftest/assert';
import { checkMatrix, checkNumeric } from '../../../engine/check';
import type { MatrixPart, NumericPart, SolveInstance } from '../../../engine/types';
import { EXAM_2024, buildGridInstance, solveGrid } from '../solve/grid';
import { generators as gridGens } from '../solve/grid';
import { EXAM_2025, buildClassifierInstance, generators as classifierGens, solveClassifier } from '../solve/classifier';
import { generators as rulesGens } from '../solve/rules';
import { generators as corridorGens } from '../solve/corridor';
import { generatorSanity } from './sanity';

const part = <T>(inst: SolveInstance, id: string) => inst.parts.find((p) => p.id === id) as T;

export const tests: SelfTest[] = [
  {
    id: 'bayes-grid-2024q28',
    topic: 'bayes',
    title: '2024 Q28 through the bayes-grid solver: C2 0.40, B2 0.10, G3 0.40, F3 0.10; P(white) = 0.535; C2 0.1271, B2 0.0318, G3 0.6729, F3 0.1682',
    source: '2024 worked solutions Q28 (a)–(c)',
    run: () => {
      const res = solveGrid(EXAM_2024);
      const pred = res[0].predict!;
      const corr = res[1].correct!;
      const p = (l: string) => pred.cells.find((c) => c.label === l)?.p ?? NaN;
      const q = (l: string) => corr.rows.find((c) => c.label === l)?.post ?? NaN;
      const inst = buildGridInstance(EXAM_2024, 2);
      const predPart = part<MatrixPart>(inst, 'pred1');
      const pz = part<NumericPart>(inst, 'pz1');
      const post = part<MatrixPart>(inst, 'post1');
      const best = inst.parts.find((x) => x.id === 'best');
      return [
        isTrue('predicted cells in the worked order C2, B2, G3, F3', pred.cells.map((c) => c.label).join(',') === 'C2,B2,G3,F3', pred.cells.map((c) => c.label).join(',')),
        nearAbs('P(C2) = 0.40', p('C2'), 0.4, 1e-12),
        nearAbs('P(B2) = 0.10', p('B2'), 0.1, 1e-12),
        nearAbs('P(G3) = 0.40', p('G3'), 0.4, 1e-12),
        nearAbs('P(F3) = 0.10', p('F3'), 0.1, 1e-12),
        nearAbs('P(z = white) = 0.535', corr.evidence, 0.535, 1e-12),
        nearAbs('P(C2 | white) = 0.1271', q('C2'), 0.1271, 5e-5),
        nearAbs('P(B2 | white) = 0.0318', q('B2'), 0.0318, 5e-5),
        nearAbs('P(G3 | white) = 0.6729', q('G3'), 0.6729, 5e-5),
        nearAbs('P(F3 | white) = 0.1682', q('F3'), 0.1682, 5e-5),
        isTrue('the paper’s rounded table is accepted (0.40 0.10 0.40 0.10)', checkMatrix(predPart, [['0.40'], ['0.10'], ['0.40'], ['0.10']]).correct),
        isTrue('the paper’s P(white) 0.535 is accepted', checkNumeric(pz, '0.535').correct),
        isTrue('the paper’s posteriors 0.1271 0.0318 0.6729 0.1682 are accepted', checkMatrix(post, [['0.1271'], ['0.0318'], ['0.6729'], ['0.1682']]).correct),
        isTrue('the products 0.068 … (not normalised) are named as the normalise trap', checkMatrix(post, [['0.068'], ['0.017'], ['0.36'], ['0.09']]).trapId === 'normalise'),
        isTrue('P(white) with P(white | black) read as 0.83 is named (likelihood-column)', checkNumeric(pz, String(0.83 * 0.5 + 0.9 * 0.5)).trapId === 'likelihood-column'),
        isTrue('most likely tile is G3', !!best && best.kind === 'choice' && best.options.find((o) => o.correct)?.text === 'G3'),
        isTrue('parts sum to 15 marks', inst.parts.reduce((t, x) => t + (x.marks ?? 0), 0) === 15, String(inst.parts.reduce((t, x) => t + (x.marks ?? 0), 0))),
      ];
    },
  },
  {
    id: 'bayes-classifier-2025q28',
    topic: 'bayes',
    title: '2025 Q28 through the bayes-classifier solver: after B 0.0723/0.9036/0.0241, after A 0.4832/0.5034/0.0134; suction 0.811 vs pinch 0.743',
    source: '2025 worked solutions Q28 (a)–(c)',
    run: () => {
      const sol = solveClassifier(EXAM_2025);
      const [t1, t2] = sol.tables;
      const inst = buildClassifierInstance(EXAM_2025, 2);
      const g = inst.parts.find((p) => p.id === 'gripper');
      return [
        nearAbs('P(z = B) = 0.415', t1.evidence, 0.415, 1e-12),
        nearAbs('after B: P(A) = 0.0723', t1.posterior[0], 0.0723, 5e-5),
        nearAbs('after B: P(B) = 0.9036', t1.posterior[1], 0.9036, 5e-5),
        nearAbs('after B: P(N) = 0.0241', t1.posterior[2], 0.0241, 5e-5),
        nearAbs('P(z = A | after B) = 0.08976', t2.evidence, 0.08976, 5e-6),
        nearAbs('after A: P(A) = 0.4832', t2.posterior[0], 0.4832, 5e-5),
        nearAbs('after A: P(B) = 0.5034', t2.posterior[1], 0.5034, 5e-5),
        nearAbs('after A: P(N) = 0.0134', t2.posterior[2], 0.0134, 5e-5),
        nearAbs('expected success, suction = 0.811', sol.expected[0], 0.811, 5e-4),
        nearAbs('expected success, pinch = 0.743', sol.expected[1], 0.743, 5e-4),
        isTrue('suction is chosen', sol.best === 0),
        nearAbs('(c) P(success) with suction = 0.811', sol.pc, 0.811, 5e-4),
        isTrue('the paper’s rounded beliefs are accepted', checkMatrix(part<MatrixPart>(inst, 'post2'), [['0.4832'], ['0.5034'], ['0.0134']]).correct),
        isTrue('the paper’s 0.415 is accepted', checkNumeric(part<NumericPart>(inst, 'pz1'), '0.415').correct),
        isTrue('reading the B row instead of the B column is named (likelihood-column)', checkNumeric(part<NumericPart>(inst, 'pz1'), String(0.3 * 0.05 + 0.5 * 0.75 + 0.2 * 0.2)).trapId === 'likelihood-column'),
        isTrue('gripper key is suction', !!g && g.kind === 'choice' && g.options.findIndex((o) => o.correct) === 0),
        isTrue('parts sum to 15 marks', inst.parts.reduce((t, x) => t + (x.marks ?? 0), 0) === 15, String(inst.parts.reduce((t, x) => t + (x.marks ?? 0), 0))),
      ];
    },
  },
  {
    id: 'bayes-generators-sanity',
    topic: 'bayes',
    title: 'Every bayes generator x tier x 40 seeds: generates, finite, 4 hints, own answers accepted, traps rejected, TeX parses, beliefs sum to 1',
    run: () => [
      ...generatorSanity(gridGens[0], 40, ['pred1', 'post1', 'pred2', 'post2']),
      ...generatorSanity(classifierGens[0], 40, ['post1', 'post2', 'post3']),
      ...generatorSanity(rulesGens[0], 40),
      ...generatorSanity(corridorGens[0], 40, ['pred', 'post']),
    ],
  },
];
