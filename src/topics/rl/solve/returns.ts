// rl-return: discounted returns by hand (summary notes §8: G_t = Σ_k γ^k r_{t+k+1}; 2024 Q17 and 2025 Q17: the
// policy maximises the expected cumulative discounted reward).
//   Tier 1: G_0 of one reward sequence.
//   Tier 2: two routes (short with a small bonus, long with a big one): both returns, which the agent prefers, and
//           what changes as γ → 1.
//   Tier 3: the backward recursion G_t = r_{t+1} + γ G_{t+1} (G_2 then G_0), and a never-ending stream r/(1 − γ).
import type { ChoicePart, Given, NumericPart, SolveGenerator, SolvePart } from '../../../engine/types';
import { discountedReturn } from '../../../core/rl';
import { fx, n, pn, traps } from './common';

const TOL = { tol: 0.004, absTol: 0.01 };

function steps(len: number, cost: number, bonus: number): number[] {
  return [...Array(len - 1).fill(cost), bonus];
}

/** The working table k | r_{k+1} | γ^k | γ^k r_{k+1}. */
function workTable(r: number[], gamma: number, from = 0, label = 'G_0'): string {
  const rows = r.slice(from).map((x, j) => {
    const k = j;
    const w = Math.pow(gamma, k);
    return `${from + j + 1} & ${n(x)} & ${n(gamma)}^{${k}} = ${fx(w, 4)} & ${fx(w * x, 4)}`;
  });
  const G = discountedReturn(r.slice(from), gamma);
  return `$$\\begin{array}{c|r|r|r} \\text{step} & r & \\gamma^{k} & \\gamma^{k} r \\\\ \\hline ${rows.join(' \\\\ ')} \\\\ \\hline & & ${label} & \\mathbf{${fx(G, 3)}} \\end{array}$$`;
}

const seqTex = (r: number[]) => r.map((x) => n(x)).join(',\\ ');
const expand = (r: number[], gamma: number) =>
  r.map((x, k) => (k === 0 ? `${pn(x)}` : `${n(gamma)}${k > 1 ? `^{${k}}` : ''}\\,${pn(x)}`)).join(' + ');

function returnPart(id: string, label: string, r: number[], gamma: number, marks = 1): NumericPart {
  const G = discountedReturn(r, gamma);
  const sum = r.reduce((a, b) => a + b, 0);
  return {
    kind: 'numeric',
    id,
    label,
    answer: G,
    unit: '',
    ...TOL,
    marks,
    traps: traps(G, [
      { value: sum, message: 'That is the plain sum of the rewards. Each reward $k$ steps ahead must be multiplied by $\\gamma^k$.', trapId: 'rl-undiscounted' },
      { value: gamma * G, message: 'You discounted the first reward too. $G_0 = r_1 + \\gamma r_2 + \\dots$ starts with $\\gamma^0 = 1$.', trapId: 'rl-gamma-offset' },
      { value: Math.pow(gamma, r.length - 1) * r[r.length - 1], message: 'Only the final reward counted. Every reward along the way (including the step costs) is part of the return.' },
    ]),
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'rl-return',
    title: 'Discounted return by hand',
    summary: 'Add up $G_0 = r_1 + \\gamma r_2 + \\gamma^2 r_3 + \\dots$ for a robot’s rewards, compare two routes, and see what $\\gamma$ does.',
    tiers: [1, 2, 3],
    source: 'Summary notes §8 (return, discount); 2024 Q17 and 2025 Q17 (the policy maximises the expected cumulative discounted reward)',
    cardId: 'rl-returns',
    marks: 3,
    generate(rng, tier) {
      const concept =
        'The **return** is the discounted sum of the rewards still to come: a reward $k$ steps ahead is multiplied by $\\gamma^k$. A small $\\gamma$ makes the robot short-sighted, $\\gamma \\to 1$ far-sighted, and $\\gamma < 1$ keeps an endless stream of rewards finite. RL trains the policy to maximise the **expected** return (not the immediate, final, average or plain total reward: 2024 Q17, 2025 Q17).';

      if (tier === 1) {
        const len = rng.int(3, 4);
        const gamma = rng.pick([0.5, 0.8, 0.9]);
        const r: number[] = rng.chance(0.5) ? steps(len, rng.pick([-1, -0.5, -2]), rng.pick([5, 8, 10, 12])) : Array.from({ length: len }, () => rng.pick([-2, -1, 0, 1, 2, 3, 4]));
        if (!r.some((x) => x !== 0)) r[len - 1] = 5;
        const G = discountedReturn(r, gamma);
        const prompt = `A delivery robot receives the rewards $r_1, \\dots, r_${len} = ${seqTex(r)}$ during an episode, which then ends. The discount factor is $\\gamma$ = ${n(gamma)}. What is the return $G_0$?`;
        const parts: SolvePart[] = [returnPart('G0', 'Return $G_0$', r, gamma, 2)];
        const hints: [string, string, string, string] = [
          concept,
          `$$G_0 = \\sum_{k=0}^{${len - 1}} \\gamma^k r_{k+1} = r_1 + \\gamma r_2 + ${len === 3 ? '\\gamma^2 r_3' : '\\gamma^2 r_3 + \\gamma^3 r_4'}$$ The first reward is not discounted ($\\gamma^0 = 1$).`,
          `$$G_0 = ${expand(r, gamma)}$$`,
          `${workTable(r, gamma)} $G_0$ = **${fx(G, 3)}** (dimensionless). The undiscounted sum would be ${n(r.reduce((a, b) => a + b, 0))}.`,
        ];
        const givens: Given[] = [
          { sym: 'r_1 \\dots r_' + len, value: r.map((x) => n(x)).join(', '), label: 'rewards in order' },
          { sym: '\\gamma', value: n(gamma), label: 'discount factor' },
        ];
        return { prompt, givens, parts, hints };
      }

      if (tier === 2) {
        // Short route with a small bonus vs long route with a bigger one; γ chosen so the preference is clear.
        let a = 0;
        let b = 0;
        let cost = 0;
        let RA = 0;
        let RB = 0;
        let gamma = 0;
        let GA = 0;
        let GB = 0;
        for (let guard = 0; guard < 60; guard++) {
          a = rng.int(2, 3);
          b = a + rng.int(2, 3);
          cost = rng.pick([-1, -0.5]);
          RA = rng.pick([4, 5, 6, 8]);
          RB = RA + rng.pick([3, 4, 6, 8]);
          gamma = rng.pick([0.5, 0.6, 0.7, 0.8, 0.9, 0.95]);
          const rA = steps(a, cost, RA);
          const rB = steps(b, cost, RB);
          GA = discountedReturn(rA, gamma);
          GB = discountedReturn(rB, gamma);
          const sumA = rA.reduce((x, y) => x + y, 0);
          const sumB = rB.reduce((x, y) => x + y, 0);
          if (Math.abs(GA - GB) > 0.25 && Math.abs(sumA - sumB) >= 1) break;
        }
        const rA = steps(a, cost, RA);
        const rB = steps(b, cost, RB);
        const sumA = rA.reduce((x, y) => x + y, 0);
        const sumB = rB.reduce((x, y) => x + y, 0);
        const pickA = GA > GB;
        const farA = sumA > sumB;
        const prompt = `A warehouse robot can reach the dock by two routes. **Route A** takes ${a} moves: rewards $${seqTex(rA)}$. **Route B** takes ${b} moves past a charging bonus: rewards $${seqTex(rB)}$. The discount factor is $\\gamma$ = ${n(gamma)}.

Find the return $G_0$ of each route, then say which route a policy trained by reinforcement learning prefers.`;
        const prefer: ChoicePart = {
          kind: 'choice',
          id: 'prefer',
          label: 'Which route does the trained policy prefer?',
          fixedOrder: true,
          options: [
            { text: 'Route A', correct: pickA, why: pickA ? `It has the larger discounted return (${fx(GA, 3)} vs ${fx(GB, 3)}), which is what RL maximises.` : `Its discounted return is smaller (${fx(GA, 3)} vs ${fx(GB, 3)}).` },
            { text: 'Route B', correct: !pickA, why: !pickA ? `It has the larger discounted return (${fx(GB, 3)} vs ${fx(GA, 3)}), which is what RL maximises.` : `Its discounted return is smaller (${fx(GB, 3)} vs ${fx(GA, 3)}), even though its bonus is bigger.` },
          ],
          marks: 1,
        };
        const far: ChoicePart = {
          kind: 'choice',
          id: 'far',
          label: 'If $\\gamma$ were raised towards 1 (a far-sighted robot), which route would have the larger return?',
          fixedOrder: true,
          options: [
            { text: 'Route A', correct: farA, why: farA ? `As $\\gamma \\to 1$ the return tends to the plain sum: A ${n(sumA)} vs B ${n(sumB)}.` : `As $\\gamma \\to 1$ the return tends to the plain sum, and A's (${n(sumA)}) is smaller than B's (${n(sumB)}).` },
            { text: 'Route B', correct: !farA, why: !farA ? `As $\\gamma \\to 1$ the return tends to the plain sum: B ${n(sumB)} vs A ${n(sumA)}.` : `As $\\gamma \\to 1$ the return tends to the plain sum, and B's (${n(sumB)}) is smaller than A's (${n(sumA)}).` },
          ],
          marks: 1,
        };
        const parts: SolvePart[] = [returnPart('GA', 'Return of route A, $G_0^A$', rA, gamma), returnPart('GB', 'Return of route B, $G_0^B$', rB, gamma), prefer, far];
        const hints: [string, string, string, string] = [
          concept,
          `For each route $$G_0 = r_1 + \\gamma r_2 + \\gamma^2 r_3 + \\dots$$ The route with the larger $G_0$ is preferred. As $\\gamma \\to 1$ every $\\gamma^k \\to 1$, so $G_0$ tends to the plain sum of the rewards.`,
          `$$G_0^A = ${expand(rA, gamma)}, \\qquad G_0^B = ${expand(rB, gamma)}$$`,
          `Route A: ${workTable(rA, gamma, 0, 'G_0^A')} Route B: ${workTable(rB, gamma, 0, 'G_0^B')} The policy prefers **route ${pickA ? 'A' : 'B'}** at $\\gamma$ = ${n(gamma)}. Far-sighted ($\\gamma \\to 1$): the sums are A = ${n(sumA)}, B = ${n(sumB)}, so **route ${farA ? 'A' : 'B'}** would have the larger return.${pickA !== farA ? ' The preference flips with $\\gamma$: that is the short-sighted vs far-sighted trade-off.' : ''}`,
        ];
        const givens: Given[] = [
          { sym: 'r^A', value: rA.map((x) => n(x)).join(', '), label: 'route A rewards' },
          { sym: 'r^B', value: rB.map((x) => n(x)).join(', '), label: 'route B rewards' },
          { sym: '\\gamma', value: n(gamma), label: 'discount factor' },
        ];
        return { prompt, givens, parts, hints };
      }

      // Tier 3: backward recursion and an endless stream.
      const gamma = rng.pick([0.5, 0.8, 0.9]);
      const r = [rng.pick([-1, 0, 1]), rng.pick([-1, 0, 2]), rng.pick([-1, 1, 2]), rng.pick([0, 1, 3]), rng.pick([5, 8, 10])];
      const G2 = discountedReturn(r.slice(2), gamma);
      const G0 = r[0] + gamma * r[1] + gamma * gamma * G2;
      const c = rng.pick([-1, -0.5, 0.5, 1, 2]);
      const Ginf = c / (1 - gamma);
      const prompt = `A robot's episode gives the rewards $r_1, \\dots, r_5 = ${seqTex(r)}$, with $\\gamma$ = ${n(gamma)}.

(a) Find $G_2$, the return from time step 2 (the rewards still to come after two moves).
(b) Use the recursion $G_t = r_{t+1} + \\gamma G_{t+1}$ to find $G_0$.
(c) A faulty robot instead never finishes: it receives $r = ${n(c)}$ on every step, forever. What is its return?`;
      const parts: SolvePart[] = [
        {
          kind: 'numeric',
          id: 'G2',
          label: '(a) $G_2 = r_3 + \\gamma r_4 + \\gamma^2 r_5$',
          answer: G2,
          unit: '',
          ...TOL,
          traps: traps(G2, [
            { value: discountedReturn(r, gamma), message: 'That is $G_0$. $G_2$ starts at $r_3$: only the rewards after two moves.' },
            { value: r[2] + r[3] + r[4], message: 'Discount the later rewards: $G_2 = r_3 + \\gamma r_4 + \\gamma^2 r_5$.', trapId: 'rl-undiscounted' },
            { value: discountedReturn([0, 0, ...r.slice(2)], gamma), message: 'Inside $G_2$ the discounting restarts: $r_3$ gets $\\gamma^0 = 1$.', trapId: 'rl-gamma-offset' },
          ]),
          marks: 1,
        },
        {
          kind: 'numeric',
          id: 'G0',
          label: '(b) $G_0 = r_1 + \\gamma r_2 + \\gamma^2 G_2$',
          answer: G0,
          unit: '',
          ...TOL,
          traps: traps(G0, [
            { value: r[0] + r[1] + G2, message: 'Each step back multiplies what follows by $\\gamma$: $G_1 = r_2 + \\gamma G_2$, $G_0 = r_1 + \\gamma G_1$.' },
            { value: r.reduce((a, b) => a + b, 0), message: 'That is the undiscounted sum.', trapId: 'rl-undiscounted' },
          ]),
          marks: 1,
        },
        {
          kind: 'numeric',
          id: 'Ginf',
          label: '(c) Return of the endless stream',
          answer: Ginf,
          unit: '',
          ...TOL,
          traps: traps(Ginf, [
            { value: (c * gamma) / (1 - gamma), message: 'The first reward is not discounted: $G = r(1 + \\gamma + \\gamma^2 + \\dots) = r/(1 - \\gamma)$.', trapId: 'rl-gamma-offset' },
            { value: c / gamma, message: 'The geometric series $1 + \\gamma + \\gamma^2 + \\dots$ sums to $1/(1 - \\gamma)$, not $1/\\gamma$.' },
            { value: c * (1 - gamma), message: 'Divide by $(1 - \\gamma)$, do not multiply.' },
          ]),
          marks: 1,
        },
      ];
      const G1 = r[1] + gamma * G2;
      const hints: [string, string, string, string] = [
        concept,
        `$$G_2 = r_3 + \\gamma r_4 + \\gamma^2 r_5, \\qquad G_t = r_{t+1} + \\gamma\\,G_{t+1}, \\qquad \\sum_{k=0}^{\\infty} \\gamma^k r = \\frac{r}{1-\\gamma}$$ Work backwards from the end: it saves multiplications, and the discounting restarts at each $G_t$.`,
        `$$G_2 = ${expand(r.slice(2), gamma)}, \\quad G_1 = ${pn(r[1])} + ${n(gamma)}\\,G_2, \\quad G_0 = ${pn(r[0])} + ${n(gamma)}\\,G_1, \\quad G_\\infty = \\frac{${n(c)}}{1 - ${n(gamma)}}$$`,
        `${workTable(r, gamma, 2, 'G_2')} $$G_1 = ${pn(r[1])} + ${n(gamma)}(${fx(G2, 4)}) = ${fx(G1, 4)}, \\qquad G_0 = ${pn(r[0])} + ${n(gamma)}(${fx(G1, 4)}) = \\mathbf{${fx(G0, 3)}}$$ So (a) $G_2$ = **${fx(G2, 3)}**, (b) $G_0$ = **${fx(G0, 3)}** (the same as summing $\\gamma^k r_{k+1}$ directly). (c) $G = ${n(c)}(1 + ${n(gamma)} + ${n(gamma)}^2 + \\dots) = ${n(c)}/(1 - ${n(gamma)})$ = **${fx(Ginf, 3)}**: finite only because $\\gamma < 1$.`,
      ];
      const givens: Given[] = [
        { sym: 'r_1 \\dots r_5', value: r.map((x) => n(x)).join(', '), label: 'rewards in order' },
        { sym: '\\gamma', value: n(gamma), label: 'discount factor' },
        { sym: 'r', value: n(c), label: 'reward per step of the endless stream' },
      ];
      return { prompt, givens, parts, hints };
    },
  },
];
