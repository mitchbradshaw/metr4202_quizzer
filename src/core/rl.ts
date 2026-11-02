// Tabular reinforcement learning for the RL topic (summary notes §8). Pure functions, no React.
//
//   - A finite MDP (S, A, T, R, γ) stored as outcome lists: outcomes[s][a] = [{ p, s2, r, done }].
//   - A gridworld builder: N/E/S/W moves, walls, terminal cells with a reward (+1 goal, −1 pit), a step cost,
//     and a slip probability (the move goes 90° left or right of the intended one), which makes T stochastic.
//   - Value iteration (model-based: it needs T and R) as synchronous Bellman sweeps.
//   - Q-learning (model-free: it only sees sampled transitions), ε-greedy action choice with an injectable
//     random generator, and the update Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') − Q(s,a)].
//   - Discounted returns G_t = Σ_k γ^k r_{t+k+1}.
// Rewards are dimensionless. Gridworld cells are numbered row-major from the top-left corner.

/** Uniform random number in [0, 1). Inject a seeded generator for reproducible runs. */
export type Rand = () => number;

export interface Outcome {
  /** T(s, a, s'). */
  p: number;
  s2: number;
  /** R(s, a, s'): the reward received on this transition. */
  r: number;
  /** s2 is terminal: the episode ends and there is no future value. */
  done: boolean;
}

export interface TabularMDP {
  nS: number;
  nA: number;
  /** outcomes[s][a]: what can happen when a is taken in s (probabilities sum to 1). Empty for absorbing states. */
  outcomes: Outcome[][][];
  /** States where no action is taken (terminals and walls): their value is 0 and never updated. */
  absorbing: boolean[];
}

// ------------------------------------------------------------------ returns

/** G_0 = r_1 + γ r_2 + γ² r_3 + …  (rewards[k] is r_{k+1}). */
export function discountedReturn(rewards: readonly number[], gamma: number): number {
  let g = 0;
  for (let k = rewards.length - 1; k >= 0; k--) g = rewards[k] + gamma * g;
  return g;
}

/** G_t for t = 0 … T−1 by the backward recursion G_t = r_{t+1} + γ G_{t+1}, G_T = 0. */
export function returnsToGo(rewards: readonly number[], gamma: number): number[] {
  const out = new Array<number>(rewards.length);
  let g = 0;
  for (let k = rewards.length - 1; k >= 0; k--) {
    g = rewards[k] + gamma * g;
    out[k] = g;
  }
  return out;
}

// ------------------------------------------------------------------ Bellman backups and value iteration

/** Q(s,a) = Σ_s' T(s,a,s') [R(s,a,s') + γ V(s')] (no future value after a terminal transition). */
export function qFromV(mdp: TabularMDP, V: ArrayLike<number>, s: number, a: number, gamma: number): number {
  let q = 0;
  for (const o of mdp.outcomes[s][a]) q += o.p * (o.r + (o.done ? 0 : gamma * V[o.s2]));
  return q;
}

/** Indices of the largest entries of row[from … from+n−1] (all of them when tied within `tie`). */
export function argmaxAll(row: ArrayLike<number>, from: number, n: number, tie = 1e-9): number[] {
  let best = -Infinity;
  for (let a = 0; a < n; a++) best = Math.max(best, row[from + a]);
  const out: number[] = [];
  for (let a = 0; a < n; a++) if (row[from + a] >= best - tie) out.push(a);
  return out;
}

export interface Backup {
  /** Q(s,a) for every action, from the current V. */
  q: number[];
  /** max_a Q(s,a): the new V(s). */
  v: number;
  /** Actions achieving the max. */
  best: number[];
}

/** One Bellman optimality backup of state s: V(s) ← max_a Σ_s' T [R + γ V(s')]. */
export function bellmanBackup(mdp: TabularMDP, V: ArrayLike<number>, s: number, gamma: number): Backup {
  if (mdp.absorbing[s]) return { q: new Array(mdp.nA).fill(0), v: 0, best: [] };
  const q = Array.from({ length: mdp.nA }, (_, a) => qFromV(mdp, V, s, a, gamma));
  const v = Math.max(...q);
  return { q, v, best: argmaxAll(q, 0, q.length) };
}

/** One synchronous sweep: every V_{k+1}(s) is computed from the old V_k (the exam's convention). */
export function viSweep(mdp: TabularMDP, V: ArrayLike<number>, gamma: number): Float64Array {
  const out = new Float64Array(mdp.nS);
  for (let s = 0; s < mdp.nS; s++) out[s] = mdp.absorbing[s] ? 0 : bellmanBackup(mdp, V, s, gamma).v;
  return out;
}

export interface VIResult {
  /** V_0 (all zeros), V_1, …, V_K: the value after each sweep. */
  history: Float64Array[];
  V: Float64Array;
  /** Q*(s,a) from the final V, row-major (s * nA + a). */
  Q: Float64Array;
  /** Greedy action per state (−1 for absorbing states). */
  policy: Int8Array;
  sweeps: number;
  converged: boolean;
}

/** Value iteration from V_0 = 0 until max |V_{k+1} − V_k| < tol (or maxSweeps). */
export function valueIteration(mdp: TabularMDP, gamma: number, opts: { tol?: number; maxSweeps?: number } = {}): VIResult {
  const tol = opts.tol ?? 1e-6;
  const maxSweeps = opts.maxSweeps ?? 500;
  const history: Float64Array[] = [new Float64Array(mdp.nS)];
  let converged = false;
  for (let k = 0; k < maxSweeps; k++) {
    const prev = history[history.length - 1];
    const next = viSweep(mdp, prev, gamma);
    history.push(next);
    let delta = 0;
    for (let s = 0; s < mdp.nS; s++) delta = Math.max(delta, Math.abs(next[s] - prev[s]));
    if (delta < tol) {
      converged = true;
      break;
    }
  }
  const V = history[history.length - 1];
  const Q = qTableFromV(mdp, V, gamma);
  return { history, V, Q, policy: greedyPolicy(mdp, Q), sweeps: history.length - 1, converged };
}

/** Q(s,a) for every state and action from a value function (row-major). */
export function qTableFromV(mdp: TabularMDP, V: ArrayLike<number>, gamma: number): Float64Array {
  const Q = new Float64Array(mdp.nS * mdp.nA);
  for (let s = 0; s < mdp.nS; s++) {
    if (mdp.absorbing[s]) continue;
    for (let a = 0; a < mdp.nA; a++) Q[s * mdp.nA + a] = qFromV(mdp, V, s, a, gamma);
  }
  return Q;
}

/** π(s) = argmax_a Q(s,a), first index on ties; −1 for absorbing states. */
export function greedyPolicy(mdp: TabularMDP, Q: ArrayLike<number>): Int8Array {
  const pi = new Int8Array(mdp.nS).fill(-1);
  for (let s = 0; s < mdp.nS; s++) if (!mdp.absorbing[s]) pi[s] = argmaxAll(Q, s * mdp.nA, mdp.nA)[0];
  return pi;
}

// ------------------------------------------------------------------ Q-learning and ε-greedy

export function maxQ(Q: ArrayLike<number>, s: number, nA: number): number {
  let m = -Infinity;
  for (let a = 0; a < nA; a++) m = Math.max(m, Q[s * nA + a]);
  return m;
}

/**
 * ε-greedy (Sutton & Barto): with probability ε pick uniformly among ALL actions, otherwise a greedy one
 * (ties broken at random). `explored` is true when the random branch was taken.
 */
export function epsGreedy(Q: ArrayLike<number>, s: number, nA: number, eps: number, rand: Rand): { a: number; explored: boolean } {
  if (rand() < eps) return { a: Math.min(nA - 1, Math.floor(rand() * nA)), explored: true };
  const ties = argmaxAll(Q, s * nA, nA);
  return { a: ties[Math.min(ties.length - 1, Math.floor(rand() * ties.length))], explored: false };
}

/** P(a | s) under ε-greedy: ε/|A| for every action, plus (1 − ε) shared equally by the greedy (tied) actions. */
export function epsGreedyProbs(row: readonly number[], eps: number): number[] {
  const n = row.length;
  const ties = argmaxAll(row, 0, n);
  return row.map((_, a) => eps / n + (ties.includes(a) ? (1 - eps) / ties.length : 0));
}

export interface QUpdate {
  s: number;
  a: number;
  r: number;
  s2: number;
  done: boolean;
  /** Q(s,a) before the update. */
  qOld: number;
  /** max_a' Q(s',a') (0 when s' is terminal). */
  maxNext: number;
  /** TD target r + γ max_a' Q(s',a'). */
  target: number;
  /** TD error target − Q(s,a). */
  td: number;
  qNew: number;
}

/** The Q-learning update with the numbers it used; writes Q(s,a) in place. */
export function qLearningUpdate(Q: Float64Array, nA: number, s: number, a: number, r: number, s2: number, done: boolean, alpha: number, gamma: number): QUpdate {
  const qOld = Q[s * nA + a];
  const maxNext = done ? 0 : maxQ(Q, s2, nA);
  const target = r + gamma * maxNext;
  const td = target - qOld;
  const qNew = qOld + alpha * td;
  Q[s * nA + a] = qNew;
  return { s, a, r, s2, done, qOld, maxNext, target, td, qNew };
}

/** Draw one outcome from a list by its probabilities. */
export function sampleOutcome(list: readonly Outcome[], rand: Rand): Outcome {
  let u = rand();
  for (const o of list) {
    u -= o.p;
    if (u < 0) return o;
  }
  return list[list.length - 1];
}

// ------------------------------------------------------------------ gridworld

/** Actions in order N, E, S, W (up, right, down, left on screen). */
export const ACTION_NAMES = ['N', 'E', 'S', 'W'] as const;
export const ACTION_ARROWS = ['↑', '→', '↓', '←'] as const;
export const ACTION_WORDS = ['up', 'right', 'down', 'left'] as const;
const DC = [0, 1, 0, -1];
const DR = [-1, 0, 1, 0];

export const FREE = 0;
export const WALL = 1;
export const TERMINAL = 2;

export interface GridWorld {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** FREE, WALL or TERMINAL per cell (row-major). */
  kind: Uint8Array;
  /** Reward for entering each terminal cell (0 elsewhere). */
  termReward: Float64Array;
  start: number;
  /** Reward of every move that does not end in a terminal (≤ 0: a cost per step). */
  stepCost: number;
  /** Probability that a move slips 90° (half to each side of the intended direction). */
  slip: number;
}

export const cellCol = (g: Pick<GridWorld, 'cols'>, s: number) => s % g.cols;
export const cellRow = (g: Pick<GridWorld, 'cols'>, s: number) => Math.floor(s / g.cols);

/** Where a move in direction dir from s ends: blocked by walls and the edge (the robot stays put). */
export function gridMove(g: GridWorld, s: number, dir: number): number {
  const c = cellCol(g, s) + DC[dir];
  const r = cellRow(g, s) + DR[dir];
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return s;
  const s2 = r * g.cols + c;
  return g.kind[s2] === WALL ? s : s2;
}

/** Reward and terminal flag for arriving in s2. */
export function arrive(g: GridWorld, s2: number): { r: number; done: boolean } {
  return g.kind[s2] === TERMINAL ? { r: g.termReward[s2], done: true } : { r: g.stepCost, done: false };
}

/** The three directions a move can actually go: intended (1 − slip), then 90° right and left (slip/2 each). */
export function moveDirs(a: number, slip: number): { dir: number; p: number }[] {
  if (slip <= 0) return [{ dir: a, p: 1 }];
  return [
    { dir: a, p: 1 - slip },
    { dir: (a + 1) % 4, p: slip / 2 },
    { dir: (a + 3) % 4, p: slip / 2 },
  ];
}

/** The gridworld as a TabularMDP (outcomes that land in the same cell are merged). */
export function gridMDP(g: GridWorld): TabularMDP {
  const nS = g.cols * g.rows;
  const nA = 4;
  const outcomes: Outcome[][][] = [];
  const absorbing: boolean[] = [];
  for (let s = 0; s < nS; s++) {
    const abs = g.kind[s] !== FREE;
    absorbing.push(abs);
    const row: Outcome[][] = [];
    for (let a = 0; a < nA; a++) {
      if (abs) {
        row.push([]);
        continue;
      }
      const list: Outcome[] = [];
      for (const { dir, p } of moveDirs(a, g.slip)) {
        if (p <= 0) continue;
        const s2 = gridMove(g, s, dir);
        const hit = list.find((o) => o.s2 === s2);
        if (hit) hit.p += p;
        else list.push({ p, s2, ...arrive(g, s2) });
      }
      row.push(list);
    }
    outcomes.push(row);
  }
  return { nS, nA, outcomes, absorbing };
}

/** Sample the direction a move actually goes (intended, or slipped 90° to one side). */
export function sampleDir(a: number, slip: number, rand: Rand): number {
  if (slip <= 0) return a;
  const u = rand();
  if (u < 1 - slip) return a;
  return u < 1 - slip / 2 ? (a + 1) % 4 : (a + 3) % 4;
}

/** Follow the greedy policy's intended moves (no slips) from `from`: where does it end up? */
export function greedyPath(g: GridWorld, Q: ArrayLike<number>, from = g.start, maxSteps = 4 * g.cols * g.rows): { cells: number[]; end: 'goal' | 'pit' | 'loop' } {
  const cells = [from];
  const seen = new Set<number>([from]);
  let s = from;
  for (let k = 0; k < maxSteps; k++) {
    if (g.kind[s] === TERMINAL) return { cells, end: g.termReward[s] > 0 ? 'goal' : 'pit' };
    const a = argmaxAll(Q, s * 4, 4)[0];
    const s2 = gridMove(g, s, a);
    cells.push(s2);
    if (seen.has(s2) && g.kind[s2] !== TERMINAL) return { cells, end: 'loop' };
    seen.add(s2);
    s = s2;
  }
  return { cells, end: 'loop' };
}

// ------------------------------------------------------------------ a Q-learning agent living in a gridworld

export interface QAgent {
  Q: Float64Array;
  s: number;
  /** Steps taken in the current episode. */
  t: number;
  /** Episodes finished so far. */
  episode: number;
  /** Discounted return of the current episode so far, and γ^t. */
  G: number;
  disc: number;
  /** Rewards of the current episode (for showing G_0). */
  rewards: number[];
}

export function newAgent(g: GridWorld): QAgent {
  return { Q: new Float64Array(g.cols * g.rows * 4), s: g.start, t: 0, episode: 0, G: 0, disc: 1, rewards: [] };
}

export interface QStepParams {
  alpha: number;
  gamma: number;
  eps: number;
  /** Episodes are cut off after this many steps (no terminal reward; the update still bootstraps). */
  maxSteps: number;
}

export interface QStep extends QUpdate {
  /** Action chosen (the intended move). */
  intended: number;
  /** Direction actually moved (differs from `intended` when the robot slipped). */
  moved: number;
  explored: boolean;
  slipped: boolean;
  /** Step index within the episode (1 for the first move). */
  t: number;
  episode: number;
  /** The episode ended on this step (terminal reached or step limit). */
  episodeEnd: boolean;
  timeout: boolean;
  /** Discounted return G_0 of the episode that just ended. */
  G?: number;
  rewards?: number[];
}

/** One transition of Q-learning: choose ε-greedily, move (maybe slip), observe r and s', update Q(s,a). */
export function qAgentStep(g: GridWorld, ag: QAgent, p: QStepParams, rand: Rand): QStep {
  const s = ag.s;
  const { a, explored } = epsGreedy(ag.Q, s, 4, p.eps, rand);
  const moved = sampleDir(a, g.slip, rand);
  const s2 = gridMove(g, s, moved);
  const { r, done } = arrive(g, s2);
  const upd = qLearningUpdate(ag.Q, 4, s, a, r, s2, done, p.alpha, p.gamma);
  ag.G += ag.disc * r;
  ag.disc *= p.gamma;
  ag.rewards.push(r);
  ag.t += 1;
  const t = ag.t;
  const episode = ag.episode;
  const timeout = !done && ag.t >= p.maxSteps;
  const out: QStep = { ...upd, intended: a, moved, explored, slipped: moved !== a, t, episode, episodeEnd: done || timeout, timeout };
  if (done || timeout) {
    out.G = ag.G;
    out.rewards = ag.rewards;
    ag.episode += 1;
    ag.s = g.start;
    ag.t = 0;
    ag.G = 0;
    ag.disc = 1;
    ag.rewards = [];
  } else ag.s = s2;
  return out;
}

/** Run whole episodes; returns each episode's discounted return G_0. */
export function runEpisodes(g: GridWorld, ag: QAgent, p: QStepParams, n: number, rand: Rand): number[] {
  const out: number[] = [];
  let guard = n * (p.maxSteps + 1) + 10;
  while (out.length < n && guard-- > 0) {
    const st = qAgentStep(g, ag, p, rand);
    if (st.episodeEnd) out.push(st.G ?? 0);
  }
  return out;
}

// ------------------------------------------------------------------ preset worlds

export type GridPresetId = 'classic' | 'cliff' | 'tworeward';

function build(id: GridPresetId, name: string, rows: string[], o: { stepCost: number; slip: number; rewards: Record<string, number> }): GridWorld {
  const cols = rows[0].length;
  const kind = new Uint8Array(cols * rows.length);
  const termReward = new Float64Array(cols * rows.length);
  let start = 0;
  rows.forEach((line, r) =>
    [...line].forEach((ch, c) => {
      const s = r * cols + c;
      if (ch === '#') kind[s] = WALL;
      else if (ch === 'S') start = s;
      else if (ch in o.rewards) {
        kind[s] = TERMINAL;
        termReward[s] = o.rewards[ch];
      }
    })
  );
  return { id, name, cols, rows: rows.length, kind, termReward, start, stepCost: o.stepCost, slip: o.slip };
}

/**
 * classic: Russell & Norvig's 4 × 3 world (+1 goal, −1 pit, one wall, step reward −0.04, 20 % slip).
 * cliff: a cliff edge of −1 pits between start and goal; a slip next to the edge can be fatal.
 * tworeward: a near exit worth +0.5 (2 moves) and a far one worth +1 (6 moves); γ decides which is worth it.
 */
export function gridPreset(id: GridPresetId): GridWorld {
  switch (id) {
    case 'classic':
      return build('classic', '4 × 3 world', ['...G', '.#.P', 'S...'], { stepCost: -0.04, slip: 0.2, rewards: { G: 1, P: -1 } });
    case 'cliff':
      return build('cliff', 'Cliff edge', ['......', '......', '......', 'SPPPPG'], { stepCost: -0.04, slip: 0.2, rewards: { G: 1, P: -1 } });
    case 'tworeward':
      return build('tworeward', 'Near +0.5, far +1', ['......F', '.S.....', 'N......'], { stepCost: 0, slip: 0, rewards: { F: 1, N: 0.5 } });
  }
}

/** Copy of a world with a different step cost and/or slip. */
export function withDynamics(g: GridWorld, o: { stepCost?: number; slip?: number }): GridWorld {
  return { ...g, stepCost: o.stepCost ?? g.stepCost, slip: o.slip ?? g.slip };
}
