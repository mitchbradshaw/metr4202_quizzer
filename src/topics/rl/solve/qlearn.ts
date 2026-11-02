// rl-qupdate: the Q-learning update with numbers (summary notes §8:
//   Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') − Q(s,a)]).
//   Tier 1: one update with max_a' Q(s',a') given.  Tier 2: read max_a' Q(s',a') from a Q table, then the TD target,
//   the TD error and the new value (sometimes s' is terminal).  Tier 3: two updates in a row, where the second
//   bootstraps from the entry the first one changed.
// rl-policy: greedy policy from a Q table (π(s) = argmax_a Q(s,a), V(s) = max_a Q(s,a); 2025 Q18) and ε-greedy
// action probabilities.
import type { ChoicePart, Given, NumericPart, SolveGenerator, SolvePart } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { epsGreedyProbs } from '../../../core/rl';
import { ARROW_TEX, ARROW_TXT, argmaxes, fx, n, pn, qTableTex, traps } from './common';

const Q_TOL = { tol: 0.003, absTol: 0.006 };
const P_TOL = { tol: 0.003, absTol: 0.003 };
const ACTS = ARROW_TEX;
const STATES = ['s_1', 's_2', 's_3'];

const UPDATE_TEX = '$$Q(s,a) \\leftarrow Q(s,a) + \\alpha\\big[\\,\\underbrace{r + \\gamma \\max_{a\'} Q(s\',a\')}_{\\text{TD target}} - Q(s,a)\\,\\big]$$';
const CONCEPT =
  'Q-learning is **model-free**: it never uses $T$. From one experienced transition $(s, a, r, s\')$ it builds a **TD target**, the reward plus the discounted value of the best action in the next state, and moves $Q(s,a)$ a fraction $\\alpha$ of the way towards it. Because the target uses $\\max_{a\'}$ (not the action actually taken next), it learns the optimal $Q^*$ whatever exploration it does (off-policy).';

function qRow(rng: Rng): number[] {
  // Four values, no ties, two decimals, between −0.5 and 2.
  for (;;) {
    const row = [0, 1, 2, 3].map(() => rng.step(-0.5, 2, 0.05));
    if (new Set(row.map((x) => x.toFixed(2))).size === 4) return row;
  }
}

interface Upd {
  q: number;
  r: number;
  gamma: number;
  alpha: number;
  maxNext: number;
  target: number;
  td: number;
  qNew: number;
}
function upd(q: number, r: number, gamma: number, alpha: number, maxNext: number): Upd {
  const target = r + gamma * maxNext;
  const td = target - q;
  return { q, r, gamma, alpha, maxNext, target, td, qNew: q + alpha * td };
}

function newQPart(id: string, label: string, u: Upd, extra: { value: number; message: string; trapId?: string }[] = []): NumericPart {
  return {
    kind: 'numeric',
    id,
    label,
    answer: u.qNew,
    unit: '',
    ...Q_TOL,
    traps: traps(
      u.qNew,
      [
        { value: u.target, message: 'That is the TD target itself (an update with $\\alpha = 1$). Move only a fraction $\\alpha$ of the way: $Q + \\alpha(\\text{target} - Q)$.', trapId: 'rl-td-target' },
        { value: u.q + u.alpha * u.target, message: 'You left out $-Q(s,a)$ inside the bracket: the update adds $\\alpha$ times the TD **error**, target minus current value.', trapId: 'rl-td-target' },
        { value: u.q + u.alpha * (u.r + u.maxNext - u.q), message: 'Discount the next state’s value: $\\gamma \\max_{a\'} Q(s\',a\')$.' },
        { value: u.q - u.alpha * u.td, message: 'Sign: the update moves $Q$ **towards** the target, $Q + \\alpha(\\text{target} - Q)$.', trapId: 'sign' },
        ...extra,
      ],
      0.01
    ),
  };
}

function updLine(u: Upd, s: string, a: string, s2: string, terminal: boolean): string {
  return `$$\\begin{aligned} \\max_{a'} Q(${s2},a') &= ${terminal ? '0 \\quad (\\text{terminal})' : fx(u.maxNext, 2)} \\\\ \\text{target} &= ${n(u.r)} + ${n(u.gamma)} \\times ${pn(u.maxNext, 3)} = ${fx(u.target, 3)} \\\\ \\text{TD error} &= ${fx(u.target, 3)} - ${pn(u.q, 3)} = ${fx(u.td, 3)} \\\\ Q(${s},${a}) &\\leftarrow ${fx(u.q, 2)} + ${n(u.alpha)} \\times ${pn(u.td, 3)} = \\mathbf{${fx(u.qNew, 3)}} \\end{aligned}$$`;
}

export const generators: SolveGenerator[] = [
  {
    id: 'rl-qupdate',
    title: 'One Q-learning update (or two)',
    summary: 'Read $\\max_{a\'} Q(s\',a\')$, build the TD target and move $Q(s,a)$ a fraction $\\alpha$ of the way; the stretch tier chains two updates through the same table.',
    tiers: [1, 2, 3],
    source: 'Summary notes §8 (Q-learning update, temporal difference); review deck RL learning outcomes (“computation of an optimal policy via temporal difference”)',
    cardId: 'rl-qlearning',
    marks: 3,
    generate(rng, tier) {
      const alpha = rng.pick([0.1, 0.2, 0.25, 0.5]);
      const gamma = rng.pick([0.8, 0.9, 0.95]);

      if (tier === 1) {
        const q = rng.step(-0.5, 1.5, 0.05);
        const r = rng.pick([-1, -0.1, 0, 0.5, 1, 2]);
        const maxNext = rng.step(0, 2, 0.05);
        const u = upd(q, r, gamma, alpha, maxNext);
        const prompt = `A robot in state $s$ takes action $a$, receives the reward $r = ${n(r)}$ and lands in $s'$. Its current estimates are $Q(s,a) = ${fx(q, 2)}$ and $\\max_{a'} Q(s',a') = ${fx(maxNext, 2)}$. With learning rate $\\alpha$ = ${n(alpha)} and discount $\\gamma$ = ${n(gamma)}, what is $Q(s,a)$ after one Q-learning update?`;
        const parts: SolvePart[] = [newQPart('qnew', 'Updated $Q(s,a)$', u)];
        const hints: [string, string, string, string] = [
          CONCEPT,
          UPDATE_TEX,
          `$$Q(s,a) \\leftarrow ${fx(q, 2)} + ${n(alpha)}\\,\\big[\\,${n(r)} + ${n(gamma)} \\times ${fx(maxNext, 2)} - ${pn(q, 2)}\\,\\big]$$`,
          `${updLine(u, 's', 'a', "s'", false)} The new value is **${fx(u.qNew, 3)}**: it moved ${fx(Math.abs(alpha * u.td), 3)} ${u.td >= 0 ? 'up' : 'down'}, a fraction $\\alpha$ = ${n(alpha)} of the TD error.`,
        ];
        const givens: Given[] = [
          { sym: 'Q(s,a)', value: fx(q, 2), label: 'current estimate' },
          { sym: 'r', value: n(r), label: 'reward received' },
          { sym: "\\max_{a'} Q(s',a')", value: fx(maxNext, 2), label: 'best value in the next state' },
          { sym: '\\alpha,\\ \\gamma', value: `${n(alpha)}, ${n(gamma)}`, label: 'learning rate, discount' },
        ];
        return { prompt, givens, parts, hints };
      }

      // Tier 2 and 3: a Q table over three states and four actions (up, right, down, left).
      const Q = STATES.map(() => qRow(rng));
      const i = rng.int(0, 2);
      const j = rng.int(0, 3);

      if (tier === 2) {
        const terminal = rng.chance(0.25);
        const k = terminal ? -1 : (i + rng.int(1, 2)) % 3;
        const r = terminal ? rng.pick([1, 5, 10, -1, -5]) : rng.pick([-1, -0.1, 0, 0.5, 1]);
        const maxNext = terminal ? 0 : argmaxes(Q[k]).max;
        const u = upd(Q[i][j], r, gamma, alpha, maxNext);
        const s2 = terminal ? 'G' : STATES[k];
        const prompt = `A robot learns with Q-learning ($\\alpha$ = ${n(alpha)}, $\\gamma$ = ${n(gamma)}). Its Q table is ${qTableTex(STATES, ACTS, Q)} In state $${STATES[i]}$ it moves $${ACTS[j]}$, receives $r = ${n(r)}$ and lands in ${terminal ? 'the goal $G$, a **terminal** state (the episode ends)' : `$${s2}$`}. Work through the update step by step.`;
        const rowMean = terminal ? 0 : Q[k].reduce((a, b) => a + b, 0) / 4;
        const parts: SolvePart[] = [
          {
            kind: 'numeric',
            id: 'max',
            label: `$\\max_{a'} Q(${s2}, a')$`,
            answer: maxNext,
            unit: '',
            ...Q_TOL,
            traps: traps(maxNext, [
              ...(terminal ? [{ value: Math.max(...Q[(i + 1) % 3]), message: 'The goal is terminal: there are no further actions, so its value is 0.', trapId: 'rl-terminal' }] : []),
              ...(!terminal ? [{ value: Q[k][j], message: `That is $Q(${s2}, ${ACTS[j]})$, the same action again. Q-learning bootstraps from the **best** action in $s'$.`, trapId: 'rl-max-next' }] : []),
              ...(!terminal ? [{ value: rowMean, message: 'That is the average over the actions (SARSA-like/expected). Q-learning takes the maximum.', trapId: 'rl-max-next' }] : []),
              { value: argmaxes(Q[i]).max, message: `That is the best value in $${STATES[i]}$ (the state you left). Look at the row of $s'$.` },
            ]),
            marks: 0.5,
          },
          {
            kind: 'numeric',
            id: 'target',
            label: 'TD target $r + \\gamma \\max_{a\'} Q(s\',a\')$',
            answer: u.target,
            unit: '',
            ...Q_TOL,
            traps: traps(u.target, [{ value: r + maxNext, message: 'Multiply the next value by $\\gamma$.' }]),
            marks: 0.5,
          },
          {
            kind: 'numeric',
            id: 'td',
            label: 'TD error (target $- Q(s,a)$)',
            answer: u.td,
            unit: '',
            ...Q_TOL,
            traps: traps(u.td, [{ value: -u.td, message: 'Target minus the current value, not the other way round.', trapId: 'sign' }]),
            marks: 0.5,
          },
          newQPart('qnew', `New $Q(${STATES[i]}, ${ACTS[j]})$`, u),
        ];
        const hints: [string, string, string, string] = [
          CONCEPT,
          `${UPDATE_TEX} Here $s = ${STATES[i]}$, $a = ${ACTS[j]}$, $s' = ${s2}$. ${terminal ? 'A terminal state has no actions, so $\\max_{a\'} Q(s\',a\') = 0$ and the target is just $r$.' : `Read the **row** of $${s2}$ and take its largest entry.`}`,
          `$$Q(${STATES[i]},${ACTS[j]}) \\leftarrow ${fx(u.q, 2)} + ${n(alpha)}\\,\\big[\\,${n(r)} + ${n(gamma)} \\times ${fx(maxNext, 2)} - ${pn(u.q, 2)}\\,\\big]$$`,
          `${updLine(u, STATES[i], ACTS[j], s2, terminal)} Only this one entry changes; every other value in the table stays as it was.`,
        ];
        const givens: Given[] = [
          { sym: '(s, a, r, s\')', value: `(${STATES[i].replace('_', '')}, ${ARROW_TXT[j].split(' ')[0]}, ${n(r)}, ${terminal ? 'G' : STATES[k].replace('_', '')})`, label: 'the transition' },
          { sym: '\\alpha,\\ \\gamma', value: `${n(alpha)}, ${n(gamma)}`, label: 'learning rate, discount' },
        ];
        return { prompt, givens, parts, hints, layout: 'side' };
      }

      // Tier 3: (s_i, a_j, r1, s_k) then (s_k, a_m, r2, s_i). The first update makes Q(s_i, a_j) the row's max.
      let k = (i + rng.int(1, 2)) % 3;
      let r1 = 0;
      let u1 = upd(0, 0, gamma, alpha, 0);
      let m = 0;
      let r2 = 0;
      let u2 = u1;
      let oldMax = 0;
      for (let guard = 0; guard < 80; guard++) {
        k = (i + rng.int(1, 2)) % 3;
        r1 = rng.pick([1, 2, 3, -1, -2]);
        u1 = upd(Q[i][j], r1, gamma, alpha, argmaxes(Q[k]).max);
        m = rng.int(0, 3);
        r2 = rng.pick([-1, -0.1, 0, 0.5]);
        oldMax = argmaxes(Q[i]).max;
        const newRow = Q[i].map((q, a) => (a === j ? u1.qNew : q));
        u2 = upd(Q[k][m], r2, gamma, alpha, Math.max(...newRow));
        const stale = upd(Q[k][m], r2, gamma, alpha, oldMax);
        if (Math.abs(u2.qNew - stale.qNew) >= 0.03 && Math.abs(u2.maxNext - oldMax) >= 0.05) break;
      }
      const stale = upd(Q[k][m], r2, gamma, alpha, oldMax);
      const prompt = `A robot learns with Q-learning ($\\alpha$ = ${n(alpha)}, $\\gamma$ = ${n(gamma)}) from this Q table: ${qTableTex(STATES, ACTS, Q)} It experiences two transitions, one after the other:

1. In $${STATES[i]}$ it moves $${ACTS[j]}$, receives $r = ${n(r1)}$ and lands in $${STATES[k]}$.
2. In $${STATES[k]}$ it moves $${ACTS[m]}$, receives $r = ${n(r2)}$ and lands back in $${STATES[i]}$.

Apply both updates in order.`;
      const parts: SolvePart[] = [
        newQPart('q1', `After update 1: $Q(${STATES[i]}, ${ACTS[j]})$`, u1),
        {
          kind: 'numeric',
          id: 'max2',
          label: `Update 2: $\\max_{a'} Q(${STATES[i]}, a')$ (the table **after** update 1)`,
          answer: u2.maxNext,
          unit: '',
          ...Q_TOL,
          traps: traps(u2.maxNext, [{ value: oldMax, message: `That is the maximum of the **old** row of $${STATES[i]}$. Update 1 changed $Q(${STATES[i]}, ${ACTS[j]})$ to ${fx(u1.qNew, 3)}; use it.`, trapId: 'rl-stale-q' }]),
          marks: 0.5,
        },
        newQPart('q2', `After update 2: $Q(${STATES[k]}, ${ACTS[m]})$`, u2, [{ value: stale.qNew, message: `You bootstrapped from the old row of $${STATES[i]}$. After update 1 its best value is ${fx(u2.maxNext, 3)}, not ${fx(oldMax, 2)}.`, trapId: 'rl-stale-q' }]),
      ];
      const hints: [string, string, string, string] = [
        CONCEPT,
        `${UPDATE_TEX} Apply it twice, in order. The second update reads the row of $${STATES[i]}$, which now contains the value written by the first.`,
        `$$\\begin{aligned} Q(${STATES[i]},${ACTS[j]}) &\\leftarrow ${fx(u1.q, 2)} + ${n(alpha)}\\,[\\,${n(r1)} + ${n(gamma)} \\times ${fx(u1.maxNext, 2)} - ${pn(u1.q, 2)}\\,] \\\\ Q(${STATES[k]},${ACTS[m]}) &\\leftarrow ${fx(u2.q, 2)} + ${n(alpha)}\\,[\\,${n(r2)} + ${n(gamma)} \\max_{a'} Q(${STATES[i]},a') - ${pn(u2.q, 2)}\\,] \\end{aligned}$$`,
        `Update 1: ${updLine(u1, STATES[i], ACTS[j], STATES[k], false)} The row of $${STATES[i]}$ is now ${qTableTex([STATES[i]], ACTS, [Q[i].map((q, a) => (a === j ? u1.qNew : q))], [[0, j]], 3)} Update 2: ${updLine(u2, STATES[k], ACTS[m], STATES[i], false)} Using the old row would have given ${fx(stale.qNew, 3)}: experience propagates value backwards one update at a time.`,
      ];
      const givens: Given[] = [{ sym: '\\alpha,\\ \\gamma', value: `${n(alpha)}, ${n(gamma)}`, label: 'learning rate, discount' }];
      return { prompt, givens, parts, hints, layout: 'side', };
    },
  },
  {
    id: 'rl-policy',
    title: 'Greedy and ε-greedy policies from a Q table',
    summary: 'Read $\\pi(s) = \\arg\\max_a Q(s,a)$ and $V(s) = \\max_a Q(s,a)$ off a table, then work out ε-greedy action probabilities.',
    tiers: [1, 2],
    source: 'Summary notes §8 (π* = argmax Q*, ε-greedy exploration); 2025 Q18 (relationship between π* and Q*)',
    cardId: 'rl-values',
    marks: 2,
    generate(rng, tier) {
      if (tier === 1) {
        const Q = STATES.map(() => qRow(rng));
        const which = rng.int(0, 2);
        const best = Q.map((row) => argmaxes(row).idx[0]);
        const prompt = `The optimal action values of a small gridworld are ${qTableTex(STATES, ACTS, Q)} Give the optimal policy $\\pi^*(s)$ in each state and the optimal value $V^*(${STATES[which]})$.`;
        const parts: SolvePart[] = Q.map((row, s): ChoicePart => ({
          kind: 'choice',
          id: `pi${s}`,
          label: `$\\pi^*(${STATES[s]})$`,
          compact: true,
          fixedOrder: true,
          options: ARROW_TXT.map((txt, a) => ({
            text: txt,
            correct: a === best[s],
            why: a === best[s] ? `$Q^*(${STATES[s]}, ${ACTS[a]}) = ${fx(row[a], 2)}$ is the largest in the row.` : `$Q^*(${STATES[s]}, ${ACTS[a]}) = ${fx(row[a], 2)}$ is less than ${fx(row[best[s]], 2)}.`,
          })),
          marks: 0.5,
        }));
        const vstar = Math.max(...Q[which]);
        const mean = Q[which].reduce((a, b) => a + b, 0) / 4;
        parts.push({
          kind: 'numeric',
          id: 'v',
          label: `$V^*(${STATES[which]})$`,
          answer: vstar,
          unit: '',
          ...Q_TOL,
          traps: traps(vstar, [
            { value: mean, message: '$V^*$ is the **maximum** over actions (the value of acting optimally), not the average.' },
            { value: Q[which].reduce((a, b) => a + b, 0), message: '$V^*(s) = \\max_a Q^*(s,a)$, not the sum of the row.' },
          ]),
          marks: 0.5,
        });
        const hints: [string, string, string, string] = [
          '$Q^*(s,a)$ is the expected return for taking $a$ in $s$ and acting optimally afterwards. The optimal policy simply picks, in every state, the action with the largest $Q^*$, and the state’s optimal value is that largest $Q^*$ (2025 Q18).',
          '$$\\pi^*(s) = \\arg\\max_a Q^*(s,a), \\qquad V^*(s) = \\max_a Q^*(s,a)$$ Work row by row.',
          Q.map((row, s) => `$\\max(${row.map((q) => fx(q, 2)).join(', ')})$ in $${STATES[s]}$`).join('; ') + '.',
          `${qTableTex(STATES, ACTS, Q, best.map((b, s) => [s, b] as [number, number]))} $$\\pi^*(s_1) = ${ACTS[best[0]]}, \\quad \\pi^*(s_2) = ${ACTS[best[1]]}, \\quad \\pi^*(s_3) = ${ACTS[best[2]]}$$ **${best.map((b, s) => `π*(s${s + 1}) = ${ARROW_TXT[b].split(' ')[0]}`).join(', ')}** and $V^*(${STATES[which]})$ = **${fx(vstar, 2)}**.`,
        ];
        return { prompt, parts, hints };
      }

      // Tier 2: ε-greedy probabilities (sometimes with a tie for the best action).
      const eps = rng.pick([0.1, 0.2, 0.3, 0.4]);
      const tie = rng.chance(0.35);
      const row = qRow(rng);
      const b = argmaxes(row).idx[0];
      let b2 = -1;
      if (tie) {
        b2 = (b + rng.int(1, 3)) % 4;
        row[b2] = row[b];
      }
      const probs = epsGreedyProbs(row, eps);
      const other = [0, 1, 2, 3].find((a) => a !== b && a !== b2)!;
      const nTie = tie ? 2 : 1;
      const prompt = `A robot explores with ε-greedy action selection, $\\varepsilon$ = ${n(eps)}: with probability $\\varepsilon$ it picks one of its four actions uniformly at random (any of them, the greedy one included); otherwise it takes the greedy action${tie ? ', breaking ties between equally good actions at random' : ''}. In state $s$ its Q values are $$\\begin{array}{c|cccc} a & ${ACTS.join(' & ')} \\\\ \\hline Q(s,a) & ${row.map((q) => fx(q, 2)).join(' & ')} \\end{array}$$`;
      const greedyChoice: ChoicePart = {
        kind: 'choice',
        id: 'greedy',
        label: tie ? 'Which actions are greedy?' : 'Which action is greedy?',
        compact: true,
        fixedOrder: true,
        multi: tie,
        options: ARROW_TXT.map((txt, a) => ({
          text: txt,
          correct: a === b || a === b2,
          why: a === b || a === b2 ? `$Q(s, ${ACTS[a]}) = ${fx(row[a], 2)}$ is the largest${tie ? ' (tied)' : ''}.` : `$Q(s, ${ACTS[a]}) = ${fx(row[a], 2)}$ is smaller than ${fx(row[b], 2)}.`,
        })),
        marks: 0.5,
      };
      const pGreedy = probs[b];
      const pOther = probs[other];
      const parts: SolvePart[] = [
        greedyChoice,
        {
          kind: 'numeric',
          id: 'pgreedy',
          label: tie ? `$P(${ACTS[b]})$ (one of the two tied actions)` : `$P(${ACTS[b]})$, the greedy action`,
          answer: pGreedy,
          unit: '',
          ...P_TOL,
          traps: traps(
            pGreedy,
            [
              { value: 1 - eps, message: 'The random choice can also land on the greedy action: add $\\varepsilon/|A|$ to $1 - \\varepsilon$.', trapId: 'rl-eps-convention' },
              { value: (1 - eps) / nTie, message: 'Add the exploration share: the random branch picks this action with probability $\\varepsilon/4$ too.', trapId: 'rl-eps-convention' },
              { value: 1 - eps + eps / 4, message: 'Two actions are tied for the best: they share the greedy probability $1 - \\varepsilon$ equally.' },
              { value: 1 - eps / 4, message: 'Only a fraction $\\varepsilon$ of choices are random, and they are spread over all four actions.' },
            ],
            0.004
          ),
          marks: 0.75,
        },
        {
          kind: 'numeric',
          id: 'pother',
          label: `$P(${ACTS[other]})$, a non-greedy action`,
          answer: pOther,
          unit: '',
          ...P_TOL,
          traps: traps(
            pOther,
            [
              { value: eps / 3, message: 'The random branch chooses among **all four** actions (greedy included), so each gets $\\varepsilon/4$.', trapId: 'rl-eps-convention' },
              { value: eps, message: 'That is the probability of exploring at all; it is shared among the four actions.', trapId: 'rl-eps-convention' },
            ],
            0.004
          ),
          marks: 0.75,
        },
      ];
      const hints: [string, string, string, string] = [
        'ε-greedy balances **exploitation** (take the best-looking action) with **exploration** (sometimes try something else, so that every action keeps being tried and Q-learning can still discover better ones). With this convention the random branch can pick any action, the greedy one included.',
        `$$P(a) = \\frac{\\varepsilon}{|A|} + \\begin{cases} \\dfrac{1 - \\varepsilon}{n_{\\text{greedy}}} & a \\text{ greedy} \\\\ 0 & \\text{otherwise} \\end{cases}$$ with $|A| = 4$ and $n_{\\text{greedy}}$ the number of actions tied for the largest $Q$.`,
        `Greedy: ${tie ? `$${ACTS[b]}$ and $${ACTS[b2]}$ (tied at ${fx(row[b], 2)})` : `$${ACTS[b]}$ (${fx(row[b], 2)})`}. $$P(\\text{greedy}) = \\frac{${n(eps)}}{4} + \\frac{1 - ${n(eps)}}{${nTie}}, \\qquad P(\\text{other}) = \\frac{${n(eps)}}{4}$$`,
        `$$P(${ACTS[b]}) = ${fx(eps / 4, 3)} + ${fx((1 - eps) / nTie, 3)} = \\mathbf{${fx(pGreedy, 3)}}, \\qquad P(${ACTS[other]}) = \\mathbf{${fx(pOther, 3)}}$$ Check: the four probabilities ${probs.map((p) => fx(p, 3)).join(' + ')} sum to 1.`,
      ];
      const givens: Given[] = [{ sym: '\\varepsilon', value: n(eps), label: 'exploration probability' }];
      return { prompt, givens, parts, hints };
    },
  },
];
