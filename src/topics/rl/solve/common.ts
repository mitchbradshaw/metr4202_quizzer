// Helpers shared by the RL exam-mode generators: number formatting for prompts and TeX, trap filtering, and TeX
// tables for Q tables and reward sequences.
import { registerTraps } from '../../../engine/traps';

registerTraps([
  { id: 'rl-undiscounted', title: 'Discount every reward after the first', detail: '$G_0 = r_1 + \\gamma r_2 + \\gamma^2 r_3 + \\dots$: the $k$-th reward is multiplied by $\\gamma^{k-1}$. The plain sum is the undiscounted return.' },
  { id: 'rl-gamma-offset', title: 'The first reward is not discounted', detail: '$G_0 = \\sum_k \\gamma^k r_{k+1}$ starts with $\\gamma^0 = 1$. Multiplying the first reward by $\\gamma$ gives $\\gamma G_0$.' },
  { id: 'rl-td-target', title: 'Q moves only a fraction α of the way to the target', detail: '$Q \\leftarrow Q + \\alpha[\\text{target} - Q]$. Writing the target itself is the $\\alpha = 1$ update; forgetting $-Q(s,a)$ adds the whole target.' },
  { id: 'rl-max-next', title: 'Bootstrap from the best action in s′', detail: 'Q-learning uses $\\max_{a\'} Q(s\',a\')$, not $Q(s\',a)$ for the same action and not the average over actions.' },
  { id: 'rl-terminal', title: 'A terminal state has no future value', detail: 'When $s\'$ ends the episode, $\\max_{a\'} Q(s\',a\') = 0$: the target is just $r$.' },
  { id: 'rl-stale-q', title: 'Use the table as it is now', detail: 'In a second update, any entry changed by the first update must be used with its new value.' },
  { id: 'rl-eps-convention', title: 'ε-greedy: the random action can be the greedy one', detail: 'With probability ε pick uniformly among all $|A|$ actions, so the greedy action gets $1 - \\varepsilon + \\varepsilon/|A|$ and each other action $\\varepsilon/|A|$.' },
  { id: 'rl-bellman-expectation', title: 'Average over outcomes, then maximise over actions', detail: '$V(s) = \\max_a \\sum_{s\'} T(s,a,s\')[r + \\gamma V(s\')]$: weight each outcome by its probability inside, take the best action outside.' },
  { id: 'rl-sync-sweep', title: 'One sweep uses the old values everywhere', detail: 'A synchronous sweep computes every $V_{k+1}(s)$ from $V_k$; do not feed new values into the same sweep.' },
]);

/** A number as a paper would print it (no trailing zeros), ASCII minus (safe in TeX). */
export const n = (x: number, d = 3) => {
  const v = Number(x.toFixed(d));
  return String(Object.is(v, -0) ? 0 : v);
};
/** Fixed decimals for TeX working. */
export const fx = (x: number, d = 3) => {
  const s = x.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
/** Negative numbers in parentheses (for products). */
export const pn = (x: number, d = 3) => (x < 0 ? `(${n(x, d)})` : n(x, d));

/** Keep only traps clearly different from the answer and from each other. */
export function traps(answer: number, list: { value: number; message: string; trapId?: string }[], minGap = 0.02) {
  const seen: number[] = [];
  return list.filter((t) => {
    if (!Number.isFinite(t.value)) return false;
    if (Math.abs(t.value - answer) < Math.max(minGap, 0.03 * Math.abs(answer))) return false;
    if (seen.some((s) => Math.abs(s - t.value) < 1e-6)) return false;
    seen.push(t.value);
    return true;
  });
}

export const ARROW_TEX = ['\\uparrow', '\\rightarrow', '\\downarrow', '\\leftarrow'];
export const ARROW_TXT = ['↑ (up)', '→ (right)', '↓ (down)', '← (left)'];

/** A Q table as display TeX: rows = states, columns = actions; `bold` marks [state, action] cells. */
export function qTableTex(states: string[], actions: string[], Q: number[][], bold: [number, number][] = [], d = 2): string {
  const isBold = (i: number, j: number) => bold.some(([a, b]) => a === i && b === j);
  const rows = states.map((s, i) => `${s} & ${Q[i].map((q, j) => (isBold(i, j) ? `\\mathbf{${fx(q, d)}}` : fx(q, d))).join(' & ')}`);
  return `$$\\begin{array}{c|${'c'.repeat(actions.length)}} Q(s,a) & ${actions.join(' & ')} \\\\ \\hline ${rows.join(' \\\\ ')} \\end{array}$$`;
}

/** Largest entry and every index achieving it. */
export function argmaxes(row: number[]): { max: number; idx: number[] } {
  const max = Math.max(...row);
  return { max, idx: row.map((q, i) => (Math.abs(q - max) < 1e-9 ? i : -1)).filter((i) => i >= 0) };
}
