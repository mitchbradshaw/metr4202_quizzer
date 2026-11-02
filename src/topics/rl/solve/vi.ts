// rl-vi: Bellman backups and value iteration by hand (model-based: needs T and R).
//   Tier 1: one backup of one state with two stochastic actions: Q(s,a) for each, then V(s) and the greedy action.
//   Tier 2: one synchronous sweep over a 3-state corridor with a terminal goal: V_{k+1} for every state, and π(s_2).
// All arithmetic comes from core/rl.ts (bellmanBackup on a TabularMDP).
import type { ChoicePart, Given, NumericPart, SolveGenerator, SolvePart } from '../../../engine/types';
import { bellmanBackup, type Outcome, type TabularMDP } from '../../../core/rl';
import { fx, n, pn, traps } from './common';

const V_TOL = { tol: 0.003, absTol: 0.01 };

const BELLMAN = '$$V_{k+1}(s) = \\max_a \\sum_{s\'} T(s,a,s\')\\,\\big[\\,R(s,a,s\') + \\gamma\\,V_k(s\')\\,\\big]$$';
const CONCEPT =
  'Value iteration is **model-based**: it uses the transition model $T$ and the reward $R$ directly, with no robot moving. A **Bellman backup** of a state looks one step ahead: for each action, average over where it can end up (weighting by $T$) the reward plus the discounted value there, then keep the best action. A **sweep** backs up every state once, using the values from the previous sweep.';

/** Σ p [r + γ V(s')] written out with numbers. */
function expandQ(list: Outcome[], V: number[], gamma: number, names: string[]): string {
  return list.map((o) => `${n(o.p)}\\,[\\,${n(o.r)} + ${n(gamma)} \\times ${o.done ? '0' : pn(V[o.s2], 3)}\\,]`).join(' + ') + (list.length ? '' : '0') + ` \\quad (${list.map((o) => names[o.s2]).join(', ')})`;
}

export const generators: SolveGenerator[] = [
  {
    id: 'rl-vi',
    title: 'Bellman backup and value-iteration sweep',
    summary: 'Back up one state (tier 1) or sweep a small corridor MDP once (tier 2): average over outcomes with $T$, add the discounted values, take the best action.',
    tiers: [1, 2],
    source: 'Summary notes §8 (V, Q, optimal policy); review deck RL learning outcomes (MDP, state and action value functions); practice in the style of the gridworld lab',
    cardId: 'rl-values',
    marks: 4,
    sprint: true,
    generate(rng, tier) {
      const gamma = rng.pick([0.9, 0.95, 0.8]);
      if (tier === 1) {
        // States: 0 = s (the one backed up), 1 = A (good), 2 = B (bad).
        const p = rng.pick([0.6, 0.7, 0.8]);
        const q = rng.pick([0.8, 0.9]);
        const cost = rng.pick([-1, -0.5]);
        let VA = 0;
        let VB = 0;
        let Vs = 0;
        let b = bellmanBackup(chain1(p, q, cost), [0, 0, 0], 0, gamma);
        for (let guard = 0; guard < 60; guard++) {
          VA = rng.step(3, 9, 0.5);
          VB = rng.step(-6, 1, 0.5);
          Vs = rng.step(0, 4, 0.5);
          b = bellmanBackup(chain1(p, q, cost), [Vs, VA, VB], 0, gamma);
          if (Math.abs(b.q[0] - b.q[1]) > 0.15) break;
        }
        const mdp = chain1(p, q, cost);
        const V = [Vs, VA, VB];
        const names = ['s', 's_A', 's_B'];
        const best = b.q[0] >= b.q[1] ? 0 : 1;
        const prompt = `A rover in state $s$ can **drive fast** or **drive carefully** towards a charging pad ($s_A$). Driving fast reaches $s_A$ with probability ${n(p)} but otherwise skids into a ditch ($s_B$). Driving carefully reaches $s_A$ with probability ${n(q)} and otherwise stays in $s$. Every move earns $R = ${n(cost)}$. After $k$ sweeps of value iteration the values are $V_k(s) = ${n(Vs)}$, $V_k(s_A) = ${n(VA)}$, $V_k(s_B) = ${n(VB)}$, and $\\gamma$ = ${n(gamma)}.

Back up state $s$: find $Q(s, \\text{fast})$, $Q(s, \\text{careful})$, $V_{k+1}(s)$ and the greedy action.`;
        const avgActions = (b.q[0] + b.q[1]) / 2;
        const parts: SolvePart[] = [
          qPart('qfast', '$Q(s, \\text{fast})$', b.q[0], [
            { value: cost + gamma * VA, message: 'Average over both outcomes: the skid into $s_B$ happens with probability ' + n(1 - p) + '.', trapId: 'rl-bellman-expectation' },
            { value: p * (cost + VA) + (1 - p) * (cost + VB), message: 'Discount the next state’s value by $\\gamma$.' },
          ]),
          qPart('qcareful', '$Q(s, \\text{careful})$', b.q[1], [
            { value: cost + gamma * VA, message: 'Average over both outcomes: it stays in $s$ with probability ' + n(1 - q) + ', and then $V_k(s)$ counts.', trapId: 'rl-bellman-expectation' },
            { value: q * (cost + gamma * VA) + (1 - q) * cost, message: 'Staying in $s$ is not worth 0: it is worth $R + \\gamma V_k(s)$.' },
          ]),
          {
            kind: 'numeric',
            id: 'v',
            label: '$V_{k+1}(s)$',
            answer: b.v,
            unit: '',
            ...V_TOL,
            traps: traps(b.v, [{ value: avgActions, message: 'Take the **best** action’s value, not the average over actions.', trapId: 'rl-bellman-expectation' }]),
          },
          {
            kind: 'choice',
            id: 'act',
            label: 'Greedy action in $s$ after this backup',
            fixedOrder: true,
            compact: true,
            options: [
              { text: 'Drive fast', correct: best === 0, why: `$Q(s, \\text{fast}) = ${fx(b.q[0], 3)}$ ${best === 0 ? '>' : '<'} $Q(s, \\text{careful}) = ${fx(b.q[1], 3)}$.` },
              { text: 'Drive carefully', correct: best === 1, why: `$Q(s, \\text{careful}) = ${fx(b.q[1], 3)}$ ${best === 1 ? '>' : '<'} $Q(s, \\text{fast}) = ${fx(b.q[0], 3)}$.` },
            ],
          } as ChoicePart,
        ];
        const hints: [string, string, string, string] = [
          CONCEPT,
          `${BELLMAN} Here: fast $\\to$ $s_A$ (${n(p)}) or $s_B$ (${n(1 - p)}); careful $\\to$ $s_A$ (${n(q)}) or stays in $s$ (${n(1 - q)}); every outcome earns $R = ${n(cost)}$.`,
          `$$\\begin{aligned} Q(s,\\text{fast}) &= ${expandQ(mdp.outcomes[0][0], V, gamma, names)} \\\\ Q(s,\\text{careful}) &= ${expandQ(mdp.outcomes[0][1], V, gamma, names)} \\end{aligned}$$`,
          `$$\\begin{array}{l|r} a & Q(s,a) \\\\ \\hline \\text{fast} & ${best === 0 ? `\\mathbf{${fx(b.q[0], 3)}}` : fx(b.q[0], 3)} \\\\ \\text{careful} & ${best === 1 ? `\\mathbf{${fx(b.q[1], 3)}}` : fx(b.q[1], 3)} \\end{array}$$ $V_{k+1}(s) = \\max$ = **${fx(b.v, 3)}**, greedy action **${best === 0 ? 'drive fast' : 'drive carefully'}**. ${best === 1 ? 'The ditch risk outweighs the speed.' : 'The faster route is worth the risk of the ditch here.'}`,
        ];
        const givens: Given[] = [
          { sym: 'V_k(s),\\ V_k(s_A),\\ V_k(s_B)', value: `${n(Vs)}, ${n(VA)}, ${n(VB)}`, label: 'values after k sweeps' },
          { sym: 'R', value: n(cost), label: 'reward per move' },
          { sym: '\\gamma', value: n(gamma), label: 'discount factor' },
        ];
        return { prompt, givens, parts, hints };
      }

      // Tier 2: corridor s1 – s2 – s3 – G with "step" and "leap".
      const p = rng.pick([0.8, 0.9]);
      const q = rng.pick([0.5, 0.6, 0.7]);
      const RG = rng.pick([10, 5, 8]);
      let V: number[] = [0, 0, 0, 0];
      let mdp = corridor(p, q, RG);
      let backs = [0, 1, 2].map((s) => bellmanBackup(mdp, V, s, gamma));
      for (let guard = 0; guard < 80; guard++) {
        V = [rng.step(0, 3, 0.5), rng.step(2, 5, 0.5), rng.step(4, 7.5, 0.5), 0];
        mdp = corridor(p, q, RG);
        backs = [0, 1, 2].map((s) => bellmanBackup(mdp, V, s, gamma));
        if (backs.every((b) => Math.abs(b.q[0] - b.q[1]) > 0.12)) break;
      }
      const names = ['s_1', 's_2', 's_3', 'G'];
      // In-place (Gauss–Seidel) sweep in the order s1, s2, s3: the trap of feeding new values into the same sweep.
      const Vgs = [...V];
      for (let s = 0; s < 3; s++) Vgs[s] = bellmanBackup(mdp, Vgs, s, gamma).v;
      const prompt = `A robot moves along a corridor $s_1 \\to s_2 \\to s_3 \\to G$, where $G$ is a terminal goal. In each state it can **step** (moves one cell forward with probability ${n(p)}, otherwise stays put) or **leap** (moves two cells forward with probability ${n(q)}, landing on $G$ if that passes it; otherwise it falls back to $s_1$). Every move earns $-1$, except a move that enters $G$, which earns $+${RG}$. The values after the last sweep were $$V_k = (${n(V[0])},\\ ${n(V[1])},\\ ${n(V[2])})\\ \\text{for}\\ (s_1, s_2, s_3), \\qquad V(G) = 0,$$ and $\\gamma$ = ${n(gamma)}. Do one synchronous sweep of value iteration.`;
      const parts: SolvePart[] = [0, 1, 2].map((s): NumericPart => ({
        kind: 'numeric',
        id: `v${s + 1}`,
        label: `$V_{k+1}(s_${s + 1})$`,
        answer: backs[s].v,
        unit: '',
        ...V_TOL,
        traps: traps(backs[s].v, [
          { value: Vgs[s], message: 'You used a value already updated in this sweep. A synchronous sweep computes every $V_{k+1}$ from the old $V_k$.', trapId: 'rl-sync-sweep' },
          { value: (backs[s].q[0] + backs[s].q[1]) / 2, message: 'Take the best action’s value, not the average of the two.', trapId: 'rl-bellman-expectation' },
          { value: Math.min(backs[s].q[0], backs[s].q[1]), message: 'That is the worse action. $V$ keeps the maximum.' },
        ]),
      }));
      const b2 = backs[1];
      const best2 = b2.q[0] >= b2.q[1] ? 0 : 1;
      parts.push({
        kind: 'choice',
        id: 'pi2',
        label: 'Greedy action in $s_2$ after this sweep',
        fixedOrder: true,
        compact: true,
        options: [
          { text: 'Step', correct: best2 === 0, why: `$Q(s_2, \\text{step}) = ${fx(b2.q[0], 3)}$ ${best2 === 0 ? '>' : '<'} $Q(s_2, \\text{leap}) = ${fx(b2.q[1], 3)}$.` },
          { text: 'Leap', correct: best2 === 1, why: `$Q(s_2, \\text{leap}) = ${fx(b2.q[1], 3)}$ ${best2 === 1 ? '>' : '<'} $Q(s_2, \\text{step}) = ${fx(b2.q[0], 3)}$.` },
        ],
      });
      const rows = [0, 1, 2].map((s) => {
        const b = backs[s];
        const bi = b.q[0] >= b.q[1] ? 0 : 1;
        return `s_${s + 1} & ${bi === 0 ? `\\mathbf{${fx(b.q[0], 3)}}` : fx(b.q[0], 3)} & ${bi === 1 ? `\\mathbf{${fx(b.q[1], 3)}}` : fx(b.q[1], 3)} & ${fx(b.v, 3)} & \\text{${bi === 0 ? 'step' : 'leap'}}`;
      });
      const hints: [string, string, string, string] = [
        CONCEPT,
        `${BELLMAN} Step from $s_i$: $s_{i+1}$ (${n(p)}) or stay (${n(1 - p)}). Leap: two cells on (${n(q)}) or back to $s_1$ (${n(1 - q)}). Use $V_k$ on the right-hand side for **every** state, and $V(G) = 0$ (terminal).`,
        [0, 1, 2]
          .map((s) => `$$\\begin{aligned} Q(s_${s + 1},\\text{step}) &= ${expandQ(mdp.outcomes[s][0], V, gamma, names)} \\\\ Q(s_${s + 1},\\text{leap}) &= ${expandQ(mdp.outcomes[s][1], V, gamma, names)} \\end{aligned}$$`)
          .join(''),
        `$$\\begin{array}{c|r|r|r|c} s & Q(s,\\text{step}) & Q(s,\\text{leap}) & V_{k+1}(s) & \\pi(s) \\\\ \\hline ${rows.join(' \\\\ ')} \\end{array}$$ $V_{k+1}$ = (**${fx(backs[0].v, 3)}**, **${fx(backs[1].v, 3)}**, **${fx(backs[2].v, 3)}**); greedy in $s_2$: **${best2 === 0 ? 'step' : 'leap'}**. Repeating sweeps until nothing changes gives $V^*$, and the greedy actions then form $\\pi^*$.`,
      ];
      const givens: Given[] = [
        { sym: 'V_k(s_1, s_2, s_3)', value: `${n(V[0])}, ${n(V[1])}, ${n(V[2])}`, label: 'values after the last sweep' },
        { sym: 'p,\\ q', value: `${n(p)}, ${n(q)}`, label: 'step and leap success probabilities' },
        { sym: 'R', value: `−1 per move, +${RG} entering G`, label: 'rewards' },
        { sym: '\\gamma', value: n(gamma), label: 'discount factor' },
      ];
      return { prompt, givens, parts, hints, layout: 'side' };
    },
  },
];

function qPart(id: string, label: string, answer: number, tr: { value: number; message: string; trapId?: string }[]): NumericPart {
  return { kind: 'numeric', id, label, answer, unit: '', ...V_TOL, traps: traps(answer, tr) };
}

/** Tier 1 MDP: states 0 = s, 1 = s_A, 2 = s_B (only s has actions here). */
function chain1(p: number, q: number, cost: number): TabularMDP {
  const fast: Outcome[] = [
    { p, s2: 1, r: cost, done: false },
    { p: 1 - p, s2: 2, r: cost, done: false },
  ];
  const careful: Outcome[] = [
    { p: q, s2: 1, r: cost, done: false },
    { p: 1 - q, s2: 0, r: cost, done: false },
  ];
  return { nS: 3, nA: 2, outcomes: [[fast, careful], [[], []], [[], []]], absorbing: [false, true, true] };
}

/** Tier 2 corridor: 0..2 = s1..s3, 3 = G (terminal). Actions: 0 step, 1 leap. */
export function corridor(p: number, q: number, RG: number): TabularMDP {
  const enter = (s2: number) => (s2 === 3 ? { r: RG, done: true } : { r: -1, done: false });
  const outcomes: Outcome[][][] = [];
  for (let s = 0; s < 3; s++) {
    const fwd = Math.min(3, s + 1);
    const fwd2 = Math.min(3, s + 2);
    const step: Outcome[] = [
      { p, s2: fwd, ...enter(fwd) },
      { p: 1 - p, s2: s, ...enter(s) },
    ];
    const leap: Outcome[] = [
      { p: q, s2: fwd2, ...enter(fwd2) },
      { p: 1 - q, s2: 0, ...enter(0) },
    ];
    outcomes.push([step, leap]);
  }
  outcomes.push([[], []]);
  return { nS: 4, nA: 2, outcomes, absorbing: [false, false, false, true] };
}
