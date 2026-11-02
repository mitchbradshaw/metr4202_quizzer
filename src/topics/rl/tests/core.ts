// Self-tests for core/rl.ts and core/rl_sim2real.ts, including the facts the RL simulations quote in their
// predictions (so a change to the maps or the learner cannot silently make an explanation wrong).
import type { SelfTest } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { mulberry32 } from '../../../engine/rng';
import {
  discountedReturn,
  epsGreedyProbs,
  greedyPath,
  gridMDP,
  gridPreset,
  newAgent,
  qAgentStep,
  qLearningUpdate,
  returnsToGo,
  valueIteration,
  withDynamics,
  type TabularMDP,
} from '../../../core/rl';
import { deploy, trainPolicy } from '../../../core/rl_sim2real';

/** Two states A (0) and B (1). In A: "stay" (r = 0.5, stay in A) or "go" (r = 1, to B). In B: "back" (r = 0, to A). */
function twoState(): TabularMDP {
  return {
    nS: 2,
    nA: 2,
    outcomes: [
      [[{ p: 1, s2: 0, r: 0.5, done: false }], [{ p: 1, s2: 1, r: 1, done: false }]],
      [[{ p: 1, s2: 0, r: 0, done: false }], [{ p: 1, s2: 0, r: 0, done: false }]],
    ],
    absorbing: [false, false],
  };
}

/** One state that repeats with probability p (reward 1) and otherwise ends (reward 0). */
function leaky(p: number): TabularMDP {
  return {
    nS: 2,
    nA: 1,
    outcomes: [[[{ p, s2: 0, r: 1, done: false }, { p: 1 - p, s2: 1, r: 0, done: true }]], [[]]],
    absorbing: [false, true],
  };
}

function exitOf(g: ReturnType<typeof gridPreset>, Q: ArrayLike<number>): number {
  const path = greedyPath(g, Q);
  const last = path.cells[path.cells.length - 1];
  return path.end === 'loop' ? NaN : g.termReward[last];
}

/** The gridworld's "Show me" for the exploration prediction: seed 2024, 300 episodes, then 300 more with ε = 0.8. */
function explorationDemo() {
  const g = gridPreset('tworeward');
  const ag = newAgent(g);
  const rand = mulberry32(2024);
  const run = (eps: number, episodes: number) => {
    const target = ag.episode + episodes;
    let guard = episodes * 120;
    while (ag.episode < target && guard-- > 0) qAgentStep(g, ag, { alpha: 0.5, gamma: 0.95, eps, maxSteps: 100 }, rand);
    return exitOf(g, ag.Q);
  };
  const first = run(0.1, 300);
  const after = run(0.8, 300);
  return { first, after };
}

export const tests: SelfTest[] = [
  {
    id: 'rl-vi-two-state',
    topic: 'rl',
    title: 'Value iteration on a 2-state MDP matches the closed form: V(A) = 1/(1 − γ²), V(B) = γ/(1 − γ²); stochastic V = p/(1 − γp)',
    source: 'Bellman optimality equation solved by hand',
    run: () => {
      const g = 0.9;
      const vi = valueIteration(twoState(), g, { tol: 1e-12, maxSweeps: 2000 });
      const lk = valueIteration(leaky(0.7), g, { tol: 1e-12, maxSweeps: 2000 });
      return [
        near('V*(A) = 1/(1 − 0.81) = 5.2632', vi.V[0], 1 / (1 - g * g), 1e-6),
        near('V*(B) = 0.9/(1 − 0.81) = 4.7368', vi.V[1], g / (1 - g * g), 1e-6),
        isTrue('π*(A) = go (the cycle beats staying: 5.26 > 0.5/(1 − 0.9) = 5)', vi.policy[0] === 1, String(vi.policy[0])),
        near('leaky state: V = p/(1 − γp) = 0.7/(1 − 0.63) = 1.8919', lk.V[0], 0.7 / (1 - 0.9 * 0.7), 1e-6),
        isTrue('value iteration reported convergence', vi.converged && lk.converged),
      ];
    },
  },
  {
    id: 'rl-q-update-hand',
    topic: 'rl',
    title: 'One Q-learning update matches hand arithmetic: 0.5 + 0.3[−0.04 + 0.9 × 0.8 − 0.5] = 0.554; terminal target = r',
    source: 'Summary notes §8 update rule',
    run: () => {
      const Q = new Float64Array(8);
      Q[0 * 4 + 1] = 0.5;
      Q[1 * 4 + 2] = 0.8;
      Q[1 * 4 + 0] = 0.3;
      const u = qLearningUpdate(Q, 4, 0, 1, -0.04, 1, false, 0.3, 0.9);
      const Q2 = new Float64Array(8);
      Q2[1] = 0.2;
      Q2[4] = 5;
      const t = qLearningUpdate(Q2, 4, 0, 1, 1, 1, true, 0.5, 0.9);
      return [
        nearAbs('max_a′ Q(s′,a′) = 0.8', u.maxNext, 0.8, 1e-12),
        nearAbs('TD target = −0.04 + 0.72 = 0.68', u.target, 0.68, 1e-12),
        nearAbs('TD error = 0.18', u.td, 0.18, 1e-12),
        nearAbs('new Q = 0.554 (and written into the table)', Q[1], 0.554, 1e-12),
        nearAbs('terminal s′: target = r = 1, new Q = 0.2 + 0.5(0.8) = 0.6', t.qNew, 0.6, 1e-12),
      ];
    },
  },
  {
    id: 'rl-returns',
    topic: 'rl',
    title: 'Discounted returns: the MDP explorer’s routes (γ = 0.8: 4.60 vs 1.23) and the backward recursion',
    source: 'G_t = Σ γ^k r_{t+k+1}; MDP tuple simulation, prediction rl-mdp-objective',
    run: () => {
      const short = discountedReturn([-1, -1, 10], 0.8);
      const long = discountedReturn([-1, -1, -1, -1, -1, 14], 0.8);
      const r = [1, -1, 2, 0, 5];
      const togo = returnsToGo(r, 0.9);
      return [
        nearAbs('short route G₀ = −1 − 0.8 + 0.64 × 10 = 4.60', short, 4.6, 1e-9),
        nearAbs('long route G₀ = 1.2347', long, -1 - 0.8 - 0.64 - 0.512 - 0.4096 + 0.32768 * 14, 1e-9),
        isTrue('the short route wins at γ = 0.8 although its total (8) is smaller than the long one’s (9)', short > long),
        isTrue('the long route wins at γ = 0.98 (the prediction’s “drag γ to about 0.98”)', discountedReturn([-1, -1, -1, -1, -1, 14], 0.98) > discountedReturn([-1, -1, 10], 0.98)),
        nearAbs('G₀ from returnsToGo equals the direct sum', togo[0], discountedReturn(r, 0.9), 1e-12),
        nearAbs('G₂ = r₃ + γ r₄ + γ² r₅ = 2 + 0 + 0.81 × 5 = 6.05', togo[2], 6.05, 1e-12),
      ];
    },
  },
  {
    id: 'rl-eps-greedy',
    topic: 'rl',
    title: 'ε-greedy probabilities: ε/|A| each, plus (1 − ε) shared by the tied greedy actions',
    source: 'Summary notes §8 (ε-greedy); Sutton and Barto convention',
    run: () => {
      const p = epsGreedyProbs([1, 2, 0, 2], 0.2);
      const q = epsGreedyProbs([0.3, 0.9, 0.1, 0.4], 0.1);
      return [
        nearAbs('tie: P(→) = 0.05 + 0.4 = 0.45', p[1], 0.45, 1e-12),
        nearAbs('tie: P(↑) = 0.05', p[0], 0.05, 1e-12),
        nearAbs('single greedy: 1 − ε + ε/4 = 0.925', q[1], 0.925, 1e-12),
        nearAbs('probabilities sum to 1', p.reduce((a, b) => a + b, 0), 1, 1e-12),
      ];
    },
  },
  {
    id: 'rl-grid-greedy-reaches-goal',
    topic: 'rl',
    title: 'Gridworld: the greedy policy after value iteration reaches the goal on every map',
    source: 'GridWorld simulation (maps classic, cliff, two exits)',
    run: () => {
      const out = [];
      for (const id of ['classic', 'cliff'] as const) {
        for (const slip of [0, 0.2]) {
          const g = withDynamics(gridPreset(id), { slip });
          const vi = valueIteration(gridMDP(g), 0.9);
          const p = greedyPath(g, vi.Q);
          out.push(isTrue(`${id}, slip ${slip}: greedy path ends at the +1 goal`, p.end === 'goal', `${p.end} after ${p.cells.length - 1} moves`));
        }
      }
      const g2 = gridPreset('tworeward');
      for (const gamma of [0.5, 0.95]) {
        const vi = valueIteration(gridMDP(g2), gamma);
        out.push(isTrue(`two exits, γ = ${gamma}: greedy path ends at a rewarding exit`, greedyPath(g2, vi.Q).end === 'goal'));
      }
      return out;
    },
  },
  {
    id: 'rl-grid-prediction-facts',
    topic: 'rl',
    title: 'Gridworld predictions: γ flips the exit at 0.5^(1/4) ≈ 0.841; slip moves the cliff route one row up; low ε gets stuck at +0.5',
    source: 'GridWorld simulation, predictions rl-grid-gamma, rl-grid-slip, rl-grid-explore',
    run: () => {
      const two = gridPreset('tworeward');
      const exitAt = (gamma: number) => exitOf(two, valueIteration(gridMDP(two), gamma).Q);
      const v05 = valueIteration(gridMDP(two), 0.5);
      const cliff = gridPreset('cliff');
      const len = (slip: number) => greedyPath(withDynamics(cliff, { slip }), valueIteration(gridMDP(withDynamics(cliff, { slip })), 0.9).Q).cells.length - 1;
      const demo = explorationDemo();
      return [
        nearAbs('γ = 0.5: V*(S) = 0.5γ = 0.25', v05.V[two.start], 0.25, 1e-6),
        isTrue('γ = 0.5 and 0.83: S heads for the near +0.5', exitAt(0.5) === 0.5 && exitAt(0.83) === 0.5, `${exitAt(0.5)}, ${exitAt(0.83)}`),
        isTrue('γ = 0.85 and 0.95: S heads for the far +1', exitAt(0.85) === 1 && exitAt(0.95) === 1, `${exitAt(0.85)}, ${exitAt(0.95)}`),
        isTrue('cliff, slip 0.2: the optimal route takes 9 moves (one row above the edge)', len(0.2) === 9, String(len(0.2))),
        isTrue('cliff, slip 0: the optimal route takes 7 moves (along the edge)', len(0) === 7, String(len(0))),
        isTrue('Q-learning, γ = 0.95, ε = 0.1, 300 episodes (seed 2024): greedy policy heads for the near +0.5', demo.first === 0.5, String(demo.first)),
        isTrue('then 300 more episodes with ε = 0.8: it heads for the far +1', demo.after === 1, String(demo.after)),
      ];
    },
  },
  {
    id: 'rl-sim2real-facts',
    topic: 'rl',
    title: 'Sim-to-real toy: overshoot 1.33 m at μ_real = 0.3; randomisation trades nominal score for robustness; identification moves the peak',
    source: 'Sim-to-real simulation, predictions rl-s2r-overshoot, rl-s2r-dr, rl-s2r-sysid',
    run: () => {
      const spec = trainPolicy(0.5, 0);
      const dr = trainPolicy(0.5, 0.5);
      const id = trainPolicy(0.3 * 1.04, 0);
      return [
        isTrue('without randomisation the policy is one full push', spec.taps === 1 && Math.abs(spec.aim - 1) < 1e-9, `${spec.taps} taps, aim ${spec.aim}`),
        nearAbs('μ_real = 0.3: travel 2 × 0.5/0.3 → miss +1.333 m (overshoot)', deploy(spec, 0.3).miss, (2 * 0.5) / 0.3 - 2, 1e-9),
        isTrue('specialist scores 100 % at 0.5 and 0 % at 0.3', deploy(spec, 0.5).score > 0.999 && deploy(spec, 0.3).score === 0),
        isTrue('±50 % randomisation: lower at the nominal μ (< 100 %)', deploy(dr, 0.5).score < 0.95, `${deploy(dr, 0.5).score.toFixed(3)}`),
        isTrue('±50 % randomisation: much better at μ = 0.3 (> 60 %)', deploy(dr, 0.3).score > 0.6, `${deploy(dr, 0.3).score.toFixed(3)}`),
        nearAbs('±50 % randomisation: about 83 % at 0.5 (quoted)', deploy(dr, 0.5).score, 0.83, 0.02),
        nearAbs('system identification (4 % error): about 84 % at μ_real = 0.3 (quoted)', deploy(id, 0.3).score, 0.84, 0.01),
      ];
    },
  },
];
