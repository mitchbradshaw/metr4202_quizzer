// Ground-truth tests: the core module must reproduce these worked values from the review deck and the
// 2023-2025 worked solutions (METR4202_study_game_prompt.md, "Ground-truth tests"). They must always pass.
import type { SelfTest } from './types';
import { near, nearAbs, isTrue } from './assert';
import { bayesSequence, expectation, occupancySequence, inverseSensor, logOddsUpdate, fromLogOdds } from '../core/prob';
import { velocityMotion } from '../core/motion';
import { MAP_2024_Q28, correctGrid, emptyBelief, nonZero, parseCell, predictGrid } from '../core/gridloc';
import { graphSearch, neighboursOf } from '../core/graph';
import { BRISBANE_2024, BRISBANE_H, AUSTRALIA_REVIEW, AUSTRALIA_H } from '../core/roadmaps';
import { rrtParentByHand, rrtStarParentByHand, rrtStarRewireByHand } from '../core/sampling';
import { depthFromImage, imageSize } from '../core/camera';

export const tests: SelfTest[] = [
  {
    id: 'gt-occupancy-review',
    topic: 'core',
    title: 'Occupancy update, TP 0.85, TN 0.99: OCCUPIED → 0.9884, then FREE → 0.9281',
    source: 'Review deck slides 10–13',
    run: () => {
      const s = { tp: 0.85, tn: 0.99 };
      const seq = occupancySequence(0.5, ['occ', 'free'], s);
      const l1 = logOddsUpdate(0, 'occ', s);
      const l2 = logOddsUpdate(l1, 'free', s);
      // The slides carry the intermediate rounded to 4 d.p. (0.9884, 0.0116); exact arithmetic gives 0.92795.
      const slideFree = (0.15 * 0.9884) / (0.15 * 0.9884 + 0.99 * (1 - 0.9884));
      return [
        nearAbs('after OCCUPIED', seq[1], 0.9884, 5e-5),
        nearAbs('after FREE (exact 0.92795; slide 0.9281)', seq[2], 0.9281, 2e-4),
        nearAbs('slide working with the rounded 0.9884 gives 0.9281', slideFree, 0.9281, 5e-5),
        nearAbs('inverse model p(m | occ) = 0.9884', inverseSensor('occ', s), 0.9884, 5e-5),
        nearAbs('inverse model p(m | free) = 0.1316', inverseSensor('free', s), 0.1316, 5e-5),
        nearAbs('log-odds after OCCUPIED: exact ln 85 = 4.4427 (slide 4.4451 from rounded p)', l1, Math.log(85), 1e-9),
        nearAbs('slide log-odds ln(0.9884 / 0.0116) = 4.4451', Math.log(0.9884 / 0.0116), 4.4451, 5e-5),
        nearAbs('log-odds form agrees with Bayes form', fromLogOdds(l2), seq[2], 1e-12),
      ];
    },
  },
  {
    id: 'gt-occupancy-2023',
    topic: 'core',
    title: '2023 Q31, TP 0.70, TN 0.95: 0.9333, then 0.8155',
    source: '2023 worked solutions Q31',
    run: () => {
      const seq = occupancySequence(0.5, ['occ', 'free'], { tp: 0.7, tn: 0.95 });
      return [nearAbs('after "occupied"', seq[1], 0.9333, 5e-5), nearAbs('after "free"', seq[2], 0.8155, 5e-5)];
    },
  },
  {
    id: 'gt-velocity-review',
    topic: 'core',
    title: 'Velocity model from (0, 0, 0), v 0.8, ω 0.03, 2 s: (1.5990, 0.04799, 0.06)',
    source: 'Review deck slide 7',
    run: () => {
      const p = velocityMotion({ x: 0, y: 0, theta: 0 }, 0.8, 0.03, 2);
      return [nearAbs('x′', p.x, 1.599, 5e-5), nearAbs('y′', p.y, 0.04799, 5e-6), nearAbs('θ′', p.theta, 0.06, 1e-9)];
    },
  },
  {
    id: 'gt-velocity-2023',
    topic: 'core',
    title: '2023 Q32 two-step motion: (3.4642, −2.3427, 0.3) → (4.4525, −2.2435, −0.1)',
    source: '2023 worked solutions Q32(b)',
    run: () => {
      const p1 = velocityMotion({ x: 1.1, y: -2.7, theta: 0 }, 1.2, 0.15, 2);
      const p2 = velocityMotion(p1, 0.5, -0.2, 2);
      return [
        nearAbs('x₁', p1.x, 3.4642, 5e-5),
        nearAbs('y₁', p1.y, -2.3427, 5e-5),
        nearAbs('θ₁', p1.theta, 0.3, 1e-9),
        nearAbs('x₂', p2.x, 4.4525, 5e-5),
        nearAbs('y₂', p2.y, -2.2435, 5e-5),
        nearAbs('θ₂', p2.theta, -0.1, 1e-9),
      ];
    },
  },
  {
    id: 'gt-gridloc-2024',
    topic: 'core',
    title: '2024 Q28 grid localisation: P(white) = 0.535; C2 0.1271, B2 0.0318, G3 0.6729, F3 0.1682',
    source: '2024 worked solutions Q28',
    run: () => {
      const m = MAP_2024_Q28;
      const b0 = emptyBelief(m);
      for (const [lab, p] of [
        ['C3', 0.5],
        ['G4', 0.5],
      ] as const) {
        const { c, r } = parseCell(lab);
        b0[r][c] = p;
      }
      const prior = predictGrid(m, b0, [
        { dc: 0, dr: -1, p: 0.8 },
        { dc: -1, dr: -1, p: 0.2 },
      ]);
      const pr = Object.fromEntries(nonZero(prior).map((e) => [e.label, e.p]));
      const { evidence, posterior } = correctGrid(m, prior, 0, { pBlackGivenBlack: 0.83, pWhiteGivenWhite: 0.9 });
      const po = Object.fromEntries(nonZero(posterior).map((e) => [e.label, e.p]));
      return [
        nearAbs('prior C2 = 0.40', pr.C2 ?? NaN, 0.4, 1e-12),
        nearAbs('prior B2 = 0.10', pr.B2 ?? NaN, 0.1, 1e-12),
        nearAbs('prior G3 = 0.40', pr.G3 ?? NaN, 0.4, 1e-12),
        nearAbs('prior F3 = 0.10', pr.F3 ?? NaN, 0.1, 1e-12),
        isTrue('exactly four non-zero cells after the prediction', nonZero(prior).length === 4, `${nonZero(prior).length}`),
        nearAbs('P(z = white) = 0.535', evidence, 0.535, 1e-9),
        nearAbs('posterior C2', po.C2, 0.1271, 5e-5),
        nearAbs('posterior B2', po.B2, 0.0318, 5e-5),
        nearAbs('posterior G3', po.G3, 0.6729, 5e-5),
        nearAbs('posterior F3', po.F3, 0.1682, 5e-5),
      ];
    },
  },
  {
    id: 'gt-astar-2024',
    topic: 'core',
    title: '2024 Q29 A*: KG → GP → SB → MG, 13.8 km',
    source: '2024 worked solutions Q29(c)',
    run: () => {
      const res = graphSearch(neighboursOf(BRISBANE_2024), 'KG', 'MG', 'astar', { h: (n) => BRISBANE_H[n] });
      return [
        isTrue('path KG → GP → SB → MG', (res.path ?? []).join('→') === 'KG→GP→SB→MG', (res.path ?? []).join('→')),
        near('length 13.8 km', res.cost, 13.8, 1e-9),
        isTrue('expansion order KG, GP, H, SB, MG', res.expandedOrder.join(',') === 'KG,GP,H,SB,MG', res.expandedOrder.join(',')),
        isTrue('SL re-parented to SB at step 4 (8.6 → 7.8)', res.steps[3].updates.some((u) => u.node === 'SL' && u.kind === 'improve' && Math.abs(u.g - 7.8) < 1e-9)),
      ];
    },
  },
  {
    id: 'gt-astar-review',
    topic: 'core',
    title: 'Review deck A*: Hobart → Melbourne → Broken Hill → Alice Springs, 2600 km',
    source: 'Review deck slide 17 (edges read from the map)',
    run: () => {
      const res = graphSearch(neighboursOf(AUSTRALIA_REVIEW), 'Hobart', 'Alice Springs', 'astar', { h: (n) => AUSTRALIA_H[n] });
      return [
        isTrue('path Hobart → Melbourne → Broken Hill → Alice Springs', (res.path ?? []).join('→') === 'Hobart→Melbourne→Broken Hill→Alice Springs', (res.path ?? []).join('→')),
        near('length 2600 km', res.cost, 2600, 1e-9),
      ];
    },
  },
  {
    id: 'gt-fruit-2025',
    topic: 'core',
    title: '2025 Q28 fruit classifier and gripper choice',
    source: '2025 worked solutions Q28',
    run: () => {
      // Rows = true state (A, B, N); columns = detected (A, B, N).
      const T = [
        [0.6, 0.1, 0.3],
        [0.05, 0.75, 0.2],
        [0.05, 0.05, 0.9],
      ];
      const col = (k: number) => T.map((r) => r[k]);
      const [afterB, afterA] = bayesSequence([0.3, 0.5, 0.2], [col(1), col(0)]);
      const suction = expectation(afterA.posterior, [0.95, 0.7, 0]);
      const pinch = expectation(afterA.posterior, [0.6, 0.9, 0]);
      return [
        nearAbs('after B: P(A)', afterB.posterior[0], 0.0723, 5e-5),
        nearAbs('after B: P(B)', afterB.posterior[1], 0.9036, 5e-5),
        nearAbs('after B: P(N)', afterB.posterior[2], 0.0241, 5e-5),
        nearAbs('P(z = B) = 0.415', afterB.evidence, 0.415, 1e-9),
        nearAbs('after A: P(A)', afterA.posterior[0], 0.4832, 5e-5),
        nearAbs('after A: P(B)', afterA.posterior[1], 0.5034, 5e-5),
        nearAbs('after A: P(N)', afterA.posterior[2], 0.0134, 5e-5),
        nearAbs('suction 0.811', suction, 0.811, 5e-4),
        nearAbs('pinch 0.743', pinch, 0.743, 5e-4),
        isTrue('suction beats pinch', suction > pinch),
      ];
    },
  },
  {
    id: 'gt-rrtstar-2025',
    topic: 'core',
    title: '2025 Q29 RRT*: parent x_b, cost 5.0; rewire x_d to 8.5',
    source: '2025 worked solutions Q29',
    run: () => {
      // Cost-to-come along existing edges: c(xb) = 2.8, c(xa) = 6.0, c(xc) = 5.8, c(xd) = 9.9.
      const nbs = [
        { id: 'xa', cost: 2.8 + 3.2, d: 1.5 },
        { id: 'xb', cost: 2.8, d: 2.2 },
        { id: 'xc', cost: 2.8 + 3.0, d: 2.8 },
        { id: 'xd', cost: 2.8 + 3.0 + 4.1, d: 3.5 },
      ];
      const choose = rrtStarParentByHand(nbs);
      const rew = rrtStarRewireByHand(nbs, choose.parent, choose.cost);
      const xd = rew.find((r) => r.id === 'xd')!;
      return [
        isTrue('RRT connects to x_a (nearest)', rrtParentByHand(nbs) === 'xa', rrtParentByHand(nbs)),
        isTrue('RRT* parent is x_b', choose.parent === 'xb', choose.parent),
        near('cost-to-come of x_new = 5.0', choose.cost, 5.0, 1e-9),
        isTrue('x_d is rewired', xd.rewire),
        near('x_d new cost 8.5', xd.via, 8.5, 1e-9),
        isTrue('x_a and x_c are not rewired', rew.filter((r) => r.id !== 'xd').every((r) => !r.rewire)),
      ];
    },
  },
  {
    id: 'gt-pinhole',
    topic: 'core',
    title: 'Pinhole: JWST rings 0.0309 m; 2024 Q30 depth Z = 78.95 m',
    source: 'Review deck slide 24; 2024 worked solutions Q30(c, d)',
    run: () => [
      near('JWST image of Saturn’s rings', imageSize(131.4, 282e6, 1.2e12), 0.0309, 2e-3),
      near('2024 Q30: Z = 0.050 × 60 / 0.038', depthFromImage(0.05, 60, 0.038), 78.95, 1e-4),
      near('2024 Q30(d): 20 m closer → 50.9 mm', imageSize(0.05, 60, depthFromImage(0.05, 60, 0.038) - 20) * 1000, 50.9, 1e-3),
    ],
  },
];
