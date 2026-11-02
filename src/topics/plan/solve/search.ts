// Search drills for exam mode (cards plan-search and plan-heuristics):
//   plan-search-order  which node BFS / DFS / Dijkstra / A* pops next (tier 1), whole expansion orders of two
//                      searches on the same graph (tier 2), a parent update in Dijkstra or A* (tier 3).
//   plan-admissible    the true cost to go h*(n) and one table entry (tier 1), a whole heuristic table with at most
//                      one overestimating entry (tier 2), Manhattan against the straight line in free space
//                      (2023 Q25) or against the octile cost on an 8-connected grid (tier 3).
//   plan-bfs-weighted  2024 Q29(a): the fewest-roads route is not the shortest, so BFS is the wrong tool.
//
// Every answer comes from core/graph.ts (graphSearch, costToGo). House rules, stated in every prompt: neighbours
// enter Open in alphabetical order, a node already in Open or Closed is not added again, BFS and DFS keep the
// first parent they find, Dijkstra and A* replace an Open entry when a cheaper g turns up, equal priorities go
// to the entry that entered Open first, and the goal test is made when the goal is POPPED. Instances never have a
// tie for the lowest priority, so the order is unambiguous by hand.
//
// Graphs are core/roadgen road maps (roads 1.0–1.4 × the straight line, rounded up to 0.1 km; h = straight-line
// distance rounded down, so h is admissible and consistent), relabelled S (start), G (goal) and A, B, … from west
// to east, and drawn by the A* activities' RoadGraph (solve/searchFigure.tsx).
import type { ChoicePart, CustomPart, NumericPart, SolveGenerator, SolveInstance, SolvePart } from '../../../engine/types';
import { makeRng, type Rng } from '../../../engine/rng';
import { costToGo, graphSearch, neighboursOf, type Algo, type Neighbours, type OpenEntry, type SearchResult, type SearchStep, type WeightedGraph } from '../../../core/graph';
import { roadMap, straightLineH, type RoadMap } from '../../../core/roadgen';
import { BRISBANE_2024 } from '../../../core/roadmaps';
import { brisbaneMap, mapFromRoad, type MapDef } from '../explore/astarMaps';
import { makeGraphFigure, makeManhattanFigure } from './searchFigure';
import { makeSequencePart } from './searchSeq';

const TOL = { tol: 0.01, absTol: 0.05 };
const LETTERS = 'ABCDEF';

export const ALGO_NAME: Record<Algo, string> = { bfs: 'BFS', dfs: 'DFS', dijkstra: 'Dijkstra', astar: 'A*', greedy: 'greedy best-first' };
/** The name in bold (A* needs its star escaped next to the closing **). */
const bold = (a: Algo) => (a === 'astar' ? '**A\\***' : `**${ALGO_NAME[a]}**`);

/** Road lengths for display: 7.800000000001 → "7.8". */
export function num(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  const s = String(Number(x.toFixed(4)));
  return s === '-0' ? '0' : s;
}
/** Four significant figures (irrational distances). */
const sig4 = (x: number) => String(Number(x.toPrecision(4)));
const round1 = (x: number) => Number(x.toFixed(1));
const arrow = (p: readonly string[]) => p.join(' → ');
const texRoute = (p: readonly string[]) => p.map((n) => `\\text{${n}}`).join(' \\to ');
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ------------------------------------------------------------------ instances

export interface Inst {
  graph: WeightedGraph;
  start: string;
  goal: string;
  /** Straight-line distance to the goal, rounded down to 0.1 km (admissible and consistent). */
  h: Record<string, number>;
  /** Neighbours in alphabetical order: the order they enter Open. */
  nb: Neighbours;
  /** Display order: start, the others alphabetically, goal. */
  ids: string[];
  /** Drawing of the graph (built on demand). */
  map: () => MapDef;
  exam?: 'brisbane';
}

/** Neighbours sorted alphabetically, so Open is filled in alphabetical order. */
export function alphaNeighbours(g: WeightedGraph): Neighbours {
  const nb = neighboursOf(g);
  const memo = new Map<string, (readonly [string, number])[]>();
  return (n) => {
    let v = memo.get(n);
    if (!v) {
      v = [...nb(n)].sort((a, b) => byId(a[0], b[0]));
      memo.set(n, v);
    }
    return v;
  };
}

/** Rename the towns of a road map: start → S, goal → G, the rest A, B, … from west to east. */
export function relabel(m: RoadMap, start: string, goal: string): Inst {
  const others = m.graph.nodes.filter((n) => n.id !== start && n.id !== goal).sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0));
  const to = new Map<string, string>([
    [start, 'S'],
    [goal, 'G'],
  ]);
  others.forEach((n, i) => to.set(n.id, LETTERS[i] ?? `N${i}`));
  const rn = (id: string) => to.get(id) ?? id;
  const graph: WeightedGraph = {
    nodes: m.graph.nodes.map((n) => ({ ...n, id: rn(n.id) })),
    edges: m.graph.edges.map(([a, b, w]) => [rn(a), rn(b), w] as [string, string, number]),
  };
  const h = straightLineH(graph, 'G');
  const road: RoadMap = { ...m, graph, start: 'S', goal: 'G', h };
  return { graph, start: 'S', goal: 'G', h, nb: alphaNeighbours(graph), ids: ['S', ...others.map((_, i) => LETTERS[i] ?? `N${i}`), 'G'], map: () => mapFromRoad(road) };
}

/** The 2024 Q29 Brisbane shuttle network with a chosen start and goal (no heuristic table). */
function brisbaneInst(start: string, goal: string): Inst {
  const rest = BRISBANE_2024.nodes
    .map((n) => n.id)
    .filter((n) => n !== start && n !== goal)
    .sort(byId);
  return { graph: BRISBANE_2024, start, goal, h: {}, nb: alphaNeighbours(BRISBANE_2024), ids: [start, ...rest, goal], map: () => ({ ...brisbaneMap(), start, goal }), exam: 'brisbane' };
}

export const runSearch = (x: Inst, algo: Algo): SearchResult => graphSearch(x.nb, x.start, x.goal, algo, { h: (n) => x.h[n] ?? 0 });

const cost = (x: Inst, a: string, b: string) => x.nb(a).find(([n]) => n === b)?.[1] ?? NaN;

function hopsFrom(nb: Neighbours, a: string): Map<string, number> {
  const d = new Map<string, number>([[a, 0]]);
  const q = [a];
  while (q.length) {
    const u = q.shift()!;
    for (const [v] of nb(u))
      if (!d.has(v)) {
        d.set(v, d.get(u)! + 1);
        q.push(v);
      }
  }
  return d;
}

/** True when, at some pop (within the first `upto` pops), two Open entries share the lowest priority. */
export function popTie(r: SearchResult, upto = Infinity): boolean {
  let before = r.initialOpen;
  for (let i = 0; i < r.steps.length && i < upto; i++) {
    if (before.length > 1 && Math.abs(before[0].f - before[1].f) < 1e-9) return true;
    before = r.steps[i].open;
  }
  return false;
}

/**
 * The first instance `accept` likes, over road maps seeded from `rng` and every start/goal pair at least
 * `minHops` roads apart (deterministic for a given rng state). Null if none of `tries` maps works.
 */
function pickInst(rng: Rng, n: [number, number], accept: (x: Inst) => boolean, minHops = 2, tries = 160): Inst | null {
  const seed0 = rng.int(1, 899999);
  for (let k = 0; k < tries; k++) {
    const local = makeRng(seed0 + 7919 * k);
    const raw = roadMap(seed0 + k, { n: local.int(n[0], n[1]) });
    const nb = neighboursOf(raw.graph);
    const pairs: [string, string][] = [];
    for (const a of raw.graph.nodes) {
      const hp = hopsFrom(nb, a.id);
      for (const b of raw.graph.nodes) if (b.id !== a.id && (hp.get(b.id) ?? 0) >= minHops) pairs.push([a.id, b.id]);
    }
    for (const [a, b] of local.shuffle(pairs)) {
      const x = relabel(raw, a, b);
      if (accept(x)) return x;
    }
  }
  return null;
}

/** Last resort (never needed in the self-tests): a fixed map, the first pair the relaxed test accepts. */
function anyInst(accept: (x: Inst) => boolean): Inst {
  const raw = roadMap(4202, { n: 7 });
  for (const a of raw.graph.nodes) for (const b of raw.graph.nodes) if (a.id !== b.id) {
    const x = relabel(raw, a.id, b.id);
    if (accept(x)) return x;
  }
  return relabel(raw, raw.start, raw.goal);
}

// ------------------------------------------------------------------ words and tables

function pathSum(x: Inst, p: readonly string[]): { total: number; text: string } {
  const terms: number[] = [];
  for (let i = 1; i < p.length; i++) terms.push(cost(x, p[i - 1], p[i]));
  const total = terms.reduce((a, b) => a + b, 0);
  return { total, text: terms.length > 1 ? `${terms.map(num).join(' + ')} = ${num(total)}` : num(total) };
}

/** "S → E → G, 6.4 + 4.5 = **10.9 km**" (the route, its sum and the bold total). */
function routeLine(x: Inst, p: readonly string[]): string {
  const terms: number[] = [];
  for (let i = 1; i < p.length; i++) terms.push(cost(x, p[i - 1], p[i]));
  const total = num(terms.reduce((a, b) => a + b, 0));
  return `**${arrow(p)}**, ${terms.length > 1 ? `$${terms.map(num).join(' + ')} =$ ` : ''}**${total} km**`;
}

function hTableTeX(x: Inst, h: Record<string, number>): string {
  return `$$\\begin{array}{c|${'c'.repeat(x.ids.length)}} n & ${x.ids.map((n) => `\\text{${n}}`).join(' & ')} \\\\ \\hline h(n) & ${x.ids.map((n) => num(h[n] ?? 0)).join(' & ')} \\end{array}$$`;
}

const RULES =
  'Neighbours enter Open in **alphabetical order**. A node already in Open or Closed is not added again: BFS and DFS keep the first parent they find, while Dijkstra and A* replace an Open entry (its $g$ and parent) when a cheaper route turns up. Equal priorities go to the entry that entered Open first. The goal test is made when G is **popped**.';

const RULE_SHORT: Record<Algo, string> = {
  bfs: 'BFS: the oldest entry',
  dfs: 'DFS: the newest entry',
  dijkstra: 'Dijkstra: the lowest $g$',
  astar: 'A*: the lowest $f = g + h$',
  greedy: 'greedy: the lowest $h$',
};

const unweighted = (a: Algo) => a === 'bfs' || a === 'dfs';
const prioOf = (e: Pick<OpenEntry, 'g' | 'h'>, a: Algo) => (a === 'astar' ? e.g + e.h : e.g);

function popWords(algo: Algo, before: readonly OpenEntry[], s: SearchStep): string {
  const e = before.find((o) => o.node === s.expanded) ?? before[0];
  const nx = before.find((o) => o.node !== s.expanded);
  let why: string;
  if (algo === 'bfs') why = 'the front of the queue (it entered Open first)';
  else if (algo === 'dfs') why = 'the top of the stack (it entered Open last)';
  else if (algo === 'dijkstra') why = `the lowest $g = ${num(e.g)}$${nx ? ` (next: ${nx.node} with $${num(nx.g)}$)` : ''}`;
  else why = `the lowest $f = ${num(e.g)} + ${num(e.h)} = ${num(e.g + e.h)}$${nx ? ` (next: ${nx.node} with $${num(nx.g + nx.h)}$)` : ''}`;
  return `Pop **${s.expanded}**, ${why}.${s.isGoal ? ' It is the goal, so the search **stops**.' : ''}`;
}

function updateWords(x: Inst, algo: Algo, s: SearchStep): string {
  const P = s.expanded;
  const out: string[] = [];
  for (const u of s.updates) {
    if (u.kind === 'closed') continue;
    const c = cost(x, P, u.node);
    const g = `$g = ${num(s.g)} + ${num(c)} = ${num(u.g)}$`;
    const f = algo === 'astar' ? `, $f = ${num(u.g)} + ${num(u.h)} = ${num(u.g + u.h)}$` : '';
    if (u.kind === 'add') out.push(unweighted(algo) ? `${u.node} joins Open (parent ${P})` : `${u.node} joins Open with ${g}${f}, parent ${P}`);
    else if (u.kind === 'improve') out.push(`${u.node} is in Open with $g = ${num(u.oldG ?? 0)}$, but ${g} is **cheaper**, so its parent becomes ${P}${f}`);
    else out.push(unweighted(algo) ? `${u.node} is already in Open and is left alone` : `${u.node}: ${g} is not below its $g = ${num(u.oldG ?? 0)}$, no change`);
  }
  return out.length ? `${out.join('; ')}.` : 'Nothing new: every neighbour is already in Open or Closed.';
}

/** Numbered step-by-step account of a run (first `upto` pops). */
function stepsWords(x: Inst, algo: Algo, r: SearchResult, upto = Infinity): string {
  const out: string[] = [];
  let before = r.initialOpen;
  for (let i = 0; i < r.steps.length && i < upto; i++) {
    const s = r.steps[i];
    out.push(`${i + 1}. ${popWords(algo, before, s)}${s.isGoal ? '' : ` ${updateWords(x, algo, s)}`}`);
    before = s.open;
  }
  return out.join('\n');
}

/** The run as a TeX table: step, node popped, Open after the step in pop order. */
function traceTeX(algo: Algo, r: SearchResult): string {
  const w = !unweighted(algo);
  const head =
    algo === 'bfs'
      ? '\\text{Open queue after the step (front first)}'
      : algo === 'dfs'
        ? '\\text{Open stack after the step (top first)}'
        : algo === 'dijkstra'
          ? '\\text{Open after the step: node }(g)\\text{, next pop first}'
          : '\\text{Open after the step: node }(f = g + h)\\text{, next pop first}';
  const ent = (e: Pick<OpenEntry, 'node' | 'g' | 'h'>, mark: boolean) => (w ? `\\text{${e.node}}\\,(${num(prioOf(e, algo))}${mark ? '{\\downarrow}' : ''})` : `\\text{${e.node}}`);
  let before = r.initialOpen;
  const rows = r.steps.map((s, i) => {
    const popped = before.find((e) => e.node === s.expanded) ?? before[0];
    const imp = new Set(s.updates.filter((u) => u.kind === 'improve').map((u) => u.node));
    const open = s.isGoal ? '\\text{goal popped: stop}' : s.open.length ? s.open.map((e) => ent(e, imp.has(e.node))).join(',\\ ') : '\\varnothing';
    before = s.open;
    return `${i + 1} & ${ent(popped, false)} & ${open}`;
  });
  return `$$\\begin{array}{c|c|l} \\text{step} & \\text{pop} & ${head} \\\\ \\hline ${rows.join(' \\\\ ')} \\end{array}$$`;
}

const caption = (x: Inst, withH: boolean) =>
  x.exam === 'brisbane'
    ? 'Road distances in km between Brisbane campuses (redrawn from the 2024 paper, not to scale).'
    : `Road lengths in km, drawn to scale.${withH ? ' Beside each node: h, the straight-line distance to G rounded down (also in the table).' : ''}`;

function figureOf(x: Inst, h?: Record<string, number>, cap?: string) {
  return makeGraphFigure(x.map(), x.start, x.goal, { h, caption: cap ?? caption(x, !!h) });
}

/** Traps list that skips values too close to the answer (they would be accepted) and duplicates. */
function trapList(answer: number, gap = 0.06) {
  const traps: NonNullable<NumericPart['traps']> = [];
  const add = (value: number, message: string, trapId?: string) => {
    if (!Number.isFinite(value) || Math.abs(value - answer) <= gap || traps.some((t) => Math.abs(t.value - value) <= gap)) return;
    traps.push(trapId ? { value, message, trapId } : { value, message });
  };
  return { traps, add };
}

// ================================================================== plan-search-order

const FOUR: Algo[] = ['bfs', 'dfs', 'dijkstra', 'astar'];
const ordinal = (k: number) => `${k}\\text{${k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th'}}`;

// ---------------------------------------------------------------- tier 1: one Open list, four rules

function orderTier1(rng: Rng): SolveInstance {
  const strict = (x: Inst) => {
    const nbS = x.nb(x.start);
    if (nbS.length < 3 || nbS.length > 4) return false;
    const rs = FOUR.map((a) => runSearch(x, a));
    if (rs.some((r) => r.steps.length < 2 || popTie(r, 2))) return false;
    const p = rs.map((r) => r.steps[1].expanded);
    return new Set(p).size >= 3 && p[2] !== p[3];
  };
  const loose = (x: Inst) => x.nb(x.start).length >= 3 && x.nb(x.start).length <= 5 && FOUR.every((a) => !popTie(runSearch(x, a), 2));
  const x = pickInst(rng, [6, 8], strict) ?? pickInst(rng, [6, 8], loose) ?? anyInst(loose);
  const S = x.start;
  const names = x.nb(S).map(([n]) => n);
  const picks = FOUR.map((a) => runSearch(x, a).steps[1].expanded);
  const [pB, pD, pDij, pA] = picks;
  const g = (n: string) => cost(x, S, n);
  const f = (n: string) => g(n) + x.h[n];
  const first = names[0];
  const last = names[names.length - 1];

  const why = (a: Algo, n: string, key: string): string => {
    if (n === S) return 'S is in Closed: it was popped at step 1, and a Closed node is never popped again.';
    const right = n === key;
    switch (a) {
      case 'bfs':
        return right ? `${n} entered Open first (neighbours are added alphabetically), and BFS pops the oldest entry.` : `${n} entered Open after ${key}. BFS pops the oldest entry, whatever the road lengths.`;
      case 'dfs':
        return right ? `${n} entered Open last, and DFS pops the newest entry (the top of the stack).` : `${n} is older than ${key}, and DFS pops the newest entry.`;
      case 'dijkstra':
        return right
          ? `Lowest cost so far: $g(\\text{${n}}) = c(\\text{S}, \\text{${n}}) = ${num(g(n))}$ km.`
          : `$g(\\text{${n}}) = ${num(g(n))}$ is more than $g(\\text{${key}}) = ${num(g(key))}$.${n === first ? ' Entering Open first only matters for BFS (and for ties).' : ''}`;
      default:
        return right
          ? `Lowest $f = g + h = ${num(g(n))} + ${num(x.h[n])} = ${num(f(n))}$.${n !== pDij ? ` ${pDij} is cheaper to reach, but its $h$ says it is farther from G.` : ''}`
          : `$f = ${num(g(n))} + ${num(x.h[n])} = ${num(f(n))}$ is more than ${key}'s $${num(f(key))}$.${n === pDij ? ' It is the cheapest to reach, but A* adds the estimate still to go.' : ''}`;
    }
  };
  const parts: SolvePart[] = FOUR.map(
    (a, i): ChoicePart => ({
      kind: 'choice',
      id: a,
      label: `${bold(a)} pops at step 2:`,
      options: [...names, S].map((n) => ({ text: n, correct: n === picks[i], why: why(a, n, picks[i]) })),
      marks: 1,
    })
  );

  const table = `$$\\begin{array}{c|c|c|c|c} n & \\text{entered Open} & g = c(\\text{S}, n) & h(n) & f = g + h \\\\ \\hline ${names
    .map((n, i) => `\\text{${n}} & ${ordinal(i + 1)} & ${num(g(n))} & ${num(x.h[n])} & ${num(f(n))}`)
    .join(' \\\\ ')} \\end{array}$$`;
  return {
    prompt: `A robot plans a route from **S** to **G** on the road graph below (road lengths in km, drawn to scale). For A*, the table gives $h(n)$, the straight-line distance to G rounded down.\n\n${hTableTeX(x, x.h)}\n\nEvery search starts with Open $= \\{\\text{S}\\}$. Step 1 pops S, moves it to Closed and adds its neighbours in **alphabetical order**, so Open now holds ${names.join(', ')} (${first} entered first, ${last} last), each with $g = c(\\text{S}, n)$. Equal priorities would go to the entry that entered Open first.\n\n**Which node does each search pop at step 2?**`,
    figure: figureOf(x, x.h),
    parts,
    hints: [
      'All four searches keep an Open list (found, not yet expanded) and pop one entry per step; they differ **only** in which entry they pop. BFS treats Open as a queue (oldest first), DFS as a stack (newest first), Dijkstra pops the lowest cost so far $g$, and A* the lowest $f = g + h$: cost so far plus the estimate still to go. After step 1 all four have the same Open list (the neighbours of S), so this is purely a question about the rule.',
      '$$\\text{BFS: oldest} \\qquad \\text{DFS: newest} \\qquad \\text{Dijkstra: } \\min_n g(n) \\qquad \\text{A*: } \\min_n \\big(g(n) + h(n)\\big), \\qquad g(n) = c(\\text{S}, n)$$\n\nThe neighbours entered in alphabetical order, so the oldest entry is the first letter and the newest the last. S is in Closed and is never popped again.',
      `The Open list after step 1, with this graph's numbers:\n\n${table}`,
      `${table}\n\n- BFS pops **${pB}**: it entered Open first.\n- DFS pops **${pD}**: it entered Open last.\n- Dijkstra pops **${pDij}**: the lowest $g = ${num(g(pDij))}$ km.\n- A* pops **${pA}**: the lowest $f = ${num(g(pA))} + ${num(x.h[pA])} = ${num(f(pA))}$ km.${pA !== pDij ? ' The heuristic pulls A* towards G, while Dijkstra spreads out by cost alone.' : ''}`,
    ],
  };
}

// ---------------------------------------------------------------- tier 2: two searches, same graph

const PAIRS: [Algo, Algo][] = [
  ['bfs', 'dfs'],
  ['bfs', 'dijkstra'],
  ['dijkstra', 'astar'],
  ['bfs', 'astar'],
];

const PAIR_CONCEPT: Record<string, string> = {
  'bfs-dfs':
    'BFS and DFS both ignore road lengths; they differ only in which end of Open they pop. BFS (a queue) pops the oldest entry, so it expands in rings of road count around S and returns a route with the fewest roads. DFS (a stack) pops the newest entry, so it dives down the branch it has just opened and returns whatever route first reaches G.',
  'bfs-dijkstra':
    'BFS pops in arrival order, so it expands in rings of **road count** around S and returns the route with the fewest roads. Dijkstra pops the lowest cost so far $g$, so it expands in rings of **distance** and returns the shortest route. Only Dijkstra uses the road lengths.',
  'dijkstra-astar':
    'Dijkstra pops the lowest $g$, the distance already driven, so it spreads out evenly in every direction. A* pops the lowest $f = g + h$, so the straight-line estimate $h$ pulls it towards G. With an admissible $h$ both return the shortest route, but A* usually pops fewer nodes on the way.',
  'bfs-astar':
    'BFS pops in arrival order and ignores both the road lengths and where G is: it expands in rings of road count and returns a route with the fewest roads. A* pops the lowest $f = g + h$, distance driven plus the straight-line estimate still to go, so it heads for G and returns the shortest route.',
};

function setupLoop(algos: Algo[]): string {
  const usesH = algos.includes('astar');
  return `$$g(m) = g(n) + c(n, m)${usesH ? ', \\qquad f(m) = g(m) + h(m)' : ''}$$\n\n1. Open $= \\{\\text{S}\\}$, Closed empty.\n2. Pop by the rule (${algos.map((a) => RULE_SHORT[a]).join('; ')}) and move it to Closed. If it is G, stop.\n3. Add its neighbours that are not in Closed, in alphabetical order. A neighbour already in Open keeps its entry, unless (Dijkstra, A*) the new $g$ is lower.\n4. Repeat. At the end, follow the parents back from G.`;
}

/** The pop sequence as an answer: the student writes it out (nothing reveals which nodes get expanded). */
function orderPart(x: Inst, a: Algo, r: SearchResult, id: string, marks: number): CustomPart {
  return {
    kind: 'custom',
    id,
    label: `${bold(a)}: write down the nodes in the order it **pops** them, from S until G is popped (click them or type letters, e.g. \`S, …, G\`).`,
    render: makeSequencePart({ algo: a, run: r, ids: x.ids, start: x.start, goal: x.goal }),
    marks,
  };
}

function orderTier2(rng: Rng): SolveInstance {
  const [a1, a2] = rng.pick(PAIRS);
  const ok = (r: SearchResult) => !!r.path && !popTie(r) && r.expandedOrder.length >= 4;
  const strict = (x: Inst) => {
    const r1 = runSearch(x, a1);
    const r2 = runSearch(x, a2);
    if (!ok(r1) || !ok(r2) || r1.expandedOrder.join() === r2.expandedOrder.join()) return false;
    if (a1 === 'bfs' && a2 !== 'dfs') return r1.cost > r2.cost + 0.05;
    if (a1 === 'dijkstra') return r2.expandedOrder.length < r1.expandedOrder.length;
    return r1.path!.join() !== r2.path!.join();
  };
  const loose = (x: Inst) => ok(runSearch(x, a1)) && ok(runSearch(x, a2));
  const x = pickInst(rng, [6, 7], strict) ?? pickInst(rng, [6, 7], loose) ?? anyInst(loose);
  const r1 = runSearch(x, a1);
  const r2 = runSearch(x, a2);
  const usesH = a1 === 'astar' || a2 === 'astar';
  const bfs = runSearch(x, 'bfs');
  const best = runSearch(x, 'dijkstra');
  const { traps, add } = trapList(r2.cost);
  if (a2 === 'dfs') {
    add(bfs.cost, 'That is the length of the BFS route. DFS returns the first route by which it reaches G, diving down the newest branch.');
    add(best.cost, 'That is the shortest route (what Dijkstra or A* return). DFS makes no promise about length.');
  } else {
    add(bfs.cost, 'That is the length of the fewest-roads route, the one BFS returns. Dijkstra and A* rank Open by distance, so they return the shortest route.', 'bfs-weights');
  }
  const hops1 = r1.path!.length - 1;
  const hops2 = r2.path!.length - 1;
  const bfsNote =
    a1 === 'bfs' && a2 !== 'dfs'
      ? hops1 < hops2
        ? ` BFS's route ${arrow(r1.path!)} has fewer roads (${hops1}) but is ${num(r1.cost)} km.`
        : ` BFS's route ${arrow(r1.path!)} has just as few roads (${hops1}) but is ${num(r1.cost)} km: BFS keeps whichever route reaches G first.`
      : '';
  return {
    prompt: `A robot plans a route from **S** to **G** on the road graph below (road lengths in km, drawn to scale).${usesH ? ' For A*, $h(n)$ is the straight-line distance to G from the table (rounded down).' : ''}${usesH ? `\n\n${hTableTeX(x, x.h)}` : ''}\n\n${RULES}\n\nRun ${bold(a1)} and ${bold(a2)} from S until G is popped.`,
    figure: figureOf(x, usesH ? x.h : undefined),
    parts: [
      orderPart(x, a1, r1, 'order1', 1),
      orderPart(x, a2, r2, 'order2', 2),
      { kind: 'numeric', id: 'cost', label: `Length of the route ${ALGO_NAME[a2]} returns (follow the parents back from G)`, answer: r2.cost, unit: 'km', ...TOL, traps, marks: 1 },
    ],
    hints: [
      PAIR_CONCEPT[`${a1}-${a2}`],
      setupLoop([a1, a2]),
      `${ALGO_NAME[a1]}, first two steps:\n\n${stepsWords(x, a1, r1, 2)}\n\n${ALGO_NAME[a2]}, first two steps:\n\n${stepsWords(x, a2, r2, 2)}`,
      `${ALGO_NAME[a1]}:\n\n${traceTeX(a1, r1)}\n\n${ALGO_NAME[a2]}:\n\n${traceTeX(a2, r2)}\n\n**Answers**\n\n- ${ALGO_NAME[a1]} pops **${r1.expandedOrder.join(', ')}** (${r1.expandedOrder.length} pops).\n- ${ALGO_NAME[a2]} pops **${r2.expandedOrder.join(', ')}** (${r2.expandedOrder.length} pops).\n- ${ALGO_NAME[a2]}'s route, parents traced back from G: ${routeLine(x, r2.path!)}.${bfsNote}`,
    ],
  };
}

// ---------------------------------------------------------------- tier 3: a parent update

function orderTier3(rng: Rng): SolveInstance {
  const algo: Algo = rng.chance(0.5) ? 'dijkstra' : 'astar';
  // Exactly one parent update in the whole run, so "which node gets a new parent" has one answer.
  const accept = (x: Inst) => {
    const r = runSearch(x, algo);
    if (!r.path || popTie(r) || r.expandedOrder.length < 4) return false;
    return r.steps.reduce((t, s) => t + s.updates.filter((u) => u.kind === 'improve').length, 0) === 1;
  };
  const x = pickInst(rng, [6, 8], accept, 2, 240);
  if (!x) return orderTier2(rng);
  const r = runSearch(x, algo);
  const k = r.steps.findIndex((s) => s.updates.some((u) => u.kind === 'improve'));
  const st = r.steps[k];
  const u = st.updates.find((v) => v.kind === 'improve')!;
  const Y = u.node;
  const P = st.expanded;
  const beforeOpen = k === 0 ? r.initialOpen : r.steps[k - 1].open;
  const A = beforeOpen.find((e) => e.node === Y)?.parent ?? 'S';
  const oldG = u.oldG ?? NaN;
  const c = cost(x, P, Y);
  const usesH = algo === 'astar';
  const bfs = runSearch(x, 'bfs');

  const opts: ChoicePart['options'] = [
    { text: `Step ${k + 1}: ${Y}'s parent changes from ${A} to ${P}`, correct: true, why: `Popping ${P} ($g = ${num(st.g)}$) gives ${Y} $g = ${num(st.g)} + ${num(c)} = ${num(u.g)}$, less than its $g = ${num(oldG)}$ via ${A}, so the entry is replaced.` },
    { text: `Step ${k + 1}: ${Y} keeps parent ${A}, because ${A} found it first`, correct: false, why: `Keeping the first parent is what BFS and DFS do. ${ALGO_NAME[algo]} replaces an Open entry whenever a cheaper $g$ turns up: $${num(u.g)} < ${num(oldG)}$.` },
    { text: 'No node ever changes parent: once a node is in Open its route is fixed', correct: false, why: `Open entries are tentative. ${Y} gets a cheaper parent at step ${k + 1}; only Closed entries are final.` },
  ];
  r.steps.forEach((s, j) => {
    for (const w of s.updates) {
      if (opts.length >= 5 || w.kind !== 'worse') continue;
      const prev = j === 0 ? r.initialOpen : r.steps[j - 1].open;
      const par = prev.find((e) => e.node === w.node)?.parent ?? 'S';
      const text = `Step ${j + 1}: ${w.node}'s parent changes from ${par} to ${s.expanded}`;
      if (opts.some((o) => o.text === text)) continue;
      opts.push({ text, correct: false, why: `Via ${s.expanded} the cost would be $${num(w.g)}$, not less than ${w.node}'s current $${num(w.oldG ?? 0)}$, so nothing changes.` });
    }
  });

  const gPart = (): NumericPart => {
    const { traps, add } = trapList(u.g);
    add(oldG, `That is ${Y}'s $g$ before the cheaper route through ${P} was found.`, 'plan-astar-missed-improve');
    add(c, `That is only the road ${P}–${Y}. $g$ is the whole distance from S: $g(${P}) + c(${P}, ${Y})$.`, 'plan-astar-g-edge');
    if (usesH) add(u.g + u.h, 'That is $f = g + h$. The question asks for $g$, the distance already driven.');
    return { kind: 'numeric', id: 'gnew', label: `$g$ of ${Y} just after the change`, answer: u.g, unit: 'km', ...TOL, traps, marks: 1 };
  };
  const goalPart = (): NumericPart => {
    const { traps, add } = trapList(oldG);
    add(u.g, `That is G's $g$ after the cheaper route was found. The question asks for its first entry.`);
    return { kind: 'numeric', id: 'gfirst', label: `$g$ that G had when it first entered Open (what a search that stopped at insertion would report)`, answer: oldG, unit: 'km', ...TOL, traps, marks: 1 };
  };
  const costTraps = trapList(r.cost);
  costTraps.add(bfs.cost, 'That is the fewest-roads route (BFS). Dijkstra and A* rank by distance.', 'bfs-weights');
  if (Y === x.goal) costTraps.add(oldG, `That is the $g$ G had when it first entered Open (step ${r.steps.findIndex((s) => s.updates.some((w) => w.node === x.goal && w.kind === 'add')) + 1}). A cheaper parent replaced it before G was popped: the goal test is at the pop.`, 'goal-on-insert');
  else if (r.path!.includes(Y)) costTraps.add(r.cost - u.g + oldG, `That is the route through ${Y}'s old parent ${A}. The cheaper parent ${P} replaced it at step ${k + 1}.`, 'plan-astar-missed-improve');

  const answers = [
    `- Order: **${r.expandedOrder.join(', ')}**`,
    `- At **step ${k + 1}**, **${Y}**'s parent changes from ${A} to **${P}**: $g$ goes from ${num(oldG)} to **${num(u.g)} km**.`,
    `- Route: ${routeLine(x, r.path!)}.`,
  ];
  return {
    prompt: `A robot plans a route from **S** to **G** with ${bold(algo)} on the road graph below (road lengths in km, drawn to scale).${usesH ? ' $h(n)$ is the straight-line distance to G from the table (rounded down).' : ''}${usesH ? `\n\n${hTableTeX(x, x.h)}` : ''}\n\n${RULES}\n\nPartway through the search, a node that is already in Open is reached by a **cheaper** route.`,
    figure: figureOf(x, usesH ? x.h : undefined),
    parts: [
      orderPart(x, algo, r, 'order', 1),
      { kind: 'choice', id: 'which', label: 'Which node gets a new parent, and at which step?', options: opts, marks: 1 },
      Y === x.goal ? goalPart() : gPart(),
      { kind: 'numeric', id: 'cost', label: `Length of the route ${ALGO_NAME[algo]} returns`, answer: r.cost, unit: 'km', ...TOL, traps: costTraps.traps, marks: 1 },
    ],
    hints: [
      `An Open entry is only **tentative**: when a later pop reaches the node more cheaply, Dijkstra and A* replace its $g$ and its parent (2024 Q29: St Lucia improves from 8.6 km via Herston to 7.8 km via South Bank at step 4). Closed entries are final. BFS and DFS never do this: they keep the first parent they find.${Y === x.goal ? ' Here it even happens to G itself, which is exactly why the goal test waits until G is popped.' : ''}`,
      `$$g_{\\text{via } P}(Y) = g(P) + c(P, Y), \\qquad \\text{replace } Y\\text{'s entry if } g_{\\text{via } P}(Y) < g_{\\text{old}}(Y)$$\n\n${setupLoop([algo]).split('\n\n').slice(1).join('\n\n')}`,
      `At step ${k + 1}, ${P} is popped with $g = ${num(st.g)}$. The road ${P}–${Y} is ${num(c)} km, so via ${P}: $g = ${num(st.g)} + ${num(c)} = ${num(u.g)}$, less than ${Y}'s $g = ${num(oldG)}$ via ${A}.${usesH ? ` Its new $f = ${num(u.g)} + ${num(u.h)} = ${num(u.g + u.h)}$.` : ''}`,
      `${stepsWords(x, algo, r)}\n\n${traceTeX(algo, r)}\n\n(↓ marks the entry that has just got a cheaper parent.)\n\n**Answers**\n\n${answers.join('\n')}`,
    ],
  };
}

// ================================================================== plan-admissible

/** h*(n) for every node (Dijkstra outwards from the goal; road graphs are undirected). */
const hStarOf = (x: Inst) => costToGo(x.nb, x.ids, x.goal);

/** Exact straight-line distance to the goal (km). */
function sldExact(x: Inst, n: string): number {
  const a = x.graph.nodes.find((v) => v.id === n);
  const g = x.graph.nodes.find((v) => v.id === x.goal);
  return Math.hypot((a?.x ?? 0) - (g?.x ?? 0), (a?.y ?? 0) - (g?.y ?? 0));
}

/** Simple routes from `from` to `to`, cheapest first. */
function routesBetween(x: Inst, from: string, to: string, limit = 400): { path: string[]; cost: number }[] {
  const out: { path: string[]; cost: number }[] = [];
  const seen = new Set([from]);
  const path = [from];
  const dfs = (u: string, c: number) => {
    if (out.length >= limit) return;
    if (u === to) {
      out.push({ path: path.slice(), cost: c });
      return;
    }
    for (const [v, w] of x.nb(u)) {
      if (seen.has(v)) continue;
      seen.add(v);
      path.push(v);
      dfs(v, c + w);
      path.pop();
      seen.delete(v);
    }
  };
  dfs(from, 0);
  return out.sort((a, b) => a.cost - b.cost || a.path.length - b.path.length);
}

function routesTeX(x: Inst, rs: { path: string[]; cost: number }[]): string {
  return `$$\\begin{array}{l|l} \\text{route} & \\text{length (km)} \\\\ \\hline ${rs.map((r) => `${texRoute(r.path)} & ${pathSum(x, r.path).text}`).join(' \\\\ ')} \\end{array}$$`;
}

/** Nodes whose true cost to go leaves room above the straight-line value (≥ 0.3 km) and needs ≥ 2 roads. */
function roomy(x: Inst, hs: Map<string, number>): string[] {
  return x.ids.filter((n) => {
    if (n === x.goal) return false;
    const v = hs.get(n) ?? Infinity;
    if (!Number.isFinite(v) || v - x.h[n] < 0.3) return false;
    const rs = routesBetween(x, n, x.goal, 60);
    return rs.length >= 2 && rs[0].path.length >= 3;
  });
}

/** Wrong values a student might give for h*(n), as traps. */
function hStarTraps(x: Inst, n: string, hs: number, table?: number) {
  const t = trapList(hs);
  t.add(x.h[n], `That is the straight-line distance. $h^*(\\text{${n}})$ is the shortest distance along the **roads**.`, 'plan-hstar-straight-line');
  if (table !== undefined) t.add(table, `That is the table's value $h(\\text{${n}})$. $h^*$ is the true shortest road distance, worked out from the map.`);
  const direct = cost(x, n, x.goal);
  if (Number.isFinite(direct)) t.add(direct, `That is the direct road ${n}–G, but a route with more roads is shorter.`);
  const fewest = graphSearch(x.nb, n, x.goal, 'bfs');
  if (fewest.path) t.add(fewest.cost, `That is the route with the fewest roads (${arrow(fewest.path)}), not the shortest.`, 'bfs-weights');
  return t.traps;
}

const ADM_CONCEPT =
  'A heuristic is **admissible** when it never overestimates: $h(n) \\le h^*(n)$ for every node, where $h^*(n)$ is the true cost of the cheapest route from $n$ to the goal. The straight-line distance is admissible because no road is shorter than a straight line, but it is not the only admissible choice: anything from 0 up to $h^*(n)$ works. So judge an entry against $h^*$, not against the straight line.';

// ---------------------------------------------------------------- tier 1: one entry

function admTier1(rng: Rng): SolveInstance {
  const accept = (x: Inst) => roomy(x, hStarOf(x)).length > 0;
  const x = pickInst(rng, [5, 7], accept, 2) ?? anyInst(accept);
  const hs = hStarOf(x);
  const cands = roomy(x, hs);
  const X = cands.length ? rng.pick(cands) : x.ids.find((n) => n !== x.goal && n !== x.start) ?? x.start;
  const hX = round1(hs.get(X) ?? 0);
  const d = x.h[X];
  const over = rng.chance(0.5);
  const room = Math.max(1, Math.round((hX - d) * 10));
  const v = over ? round1(hX + rng.step(0.2, 1.4, 0.1)) : round1(d + 0.1 * rng.int(1, room));
  const table = { ...x.h, [X]: v };
  const rs = routesBetween(x, X, x.goal).slice(0, 3);
  const best = rs[0];
  const cmp = over ? '>' : '\\le';
  return {
    prompt: `A robot will run A* to **G** on the road graph below (road lengths in km, drawn to scale). Its heuristic table (also printed beside each node) is:\n\n${hTableTeX(x, table)}\n\nThe straight-line distance from **${X}** to G is ${num(d)} km (rounded down).`,
    figure: figureOf(x, table, 'Road lengths in km, drawn to scale. Beside each node: h from the table.'),
    parts: [
      { kind: 'numeric', id: 'hstar', label: `The true cost to go $h^*(\\text{${X}})$: the shortest road distance from ${X} to G`, answer: hX, unit: 'km', ...TOL, traps: hStarTraps(x, X, hX), marks: 1 },
      {
        kind: 'choice',
        id: 'adm',
        label: `Is the table entry $h(\\text{${X}}) = ${num(v)}$ km admissible?`,
        options: [
          { text: `Yes: ${num(v)} km does not exceed the true cost to go $h^*(\\text{${X}})$`, correct: !over, why: over ? `$h^*(\\text{${X}}) = ${num(hX)}$ km (${arrow(best.path)}), and $${num(v)} > ${num(hX)}$.` : `$h^*(\\text{${X}}) = ${num(hX)}$ km (${arrow(best.path)}), and $${num(v)} \\le ${num(hX)}$: it never overestimates here.` },
          { text: `No: ${num(v)} km is more than the true cost to go $h^*(\\text{${X}})$`, correct: over, why: over ? `Right: the shortest road route ${arrow(best.path)} is only ${num(hX)} km.` : `The shortest road route ${arrow(best.path)} is ${num(hX)} km, which is at least ${num(v)} km.` },
          {
            text: `No: it is more than the straight-line distance (${num(d)} km), and an admissible $h$ never is`,
            correct: false,
            why: `Admissible means $h \\le h^*$, the shortest **road** distance (${num(hX)} km). The straight line is one admissible choice, but any value up to $h^*$ is admissible too.${over ? ' This entry does fail, but because it exceeds $h^*$.' : ''}`,
          },
          { text: 'Yes: $h(\\text{G}) = 0$, and that is all admissibility needs', correct: false, why: `$h(\\text{G}) = 0$ is necessary but not enough: every node needs $h(n) \\le h^*(n)$.${over ? ` Here $h(\\text{${X}}) = ${num(v)} > ${num(hX)}$.` : ''}` },
        ],
        marks: 1,
      },
    ],
    hints: [
      ADM_CONCEPT,
      `$$h^*(\\text{${X}}) = \\min_{\\text{routes } \\text{${X}} \\to \\text{G}} \\sum c(\\text{road}), \\qquad h(\\text{${X}}) \\text{ is admissible} \\iff h(\\text{${X}}) \\le h^*(\\text{${X}})$$\n\nList the routes from ${X} to G and take the cheapest (or work backwards from G: $h^*(\\text{G}) = 0$, $h^*(n) = \\min_m [\\,c(n, m) + h^*(m)\\,]$).`,
      `The cheapest routes from ${X} to G:\n\n${routesTeX(x, rs)}`,
      `${routesTeX(x, rs)}\n\n$h^*(\\text{${X}}) = ${num(hX)}$ km via ${arrow(best.path)}, so $h(\\text{${X}}) = ${num(v)} ${cmp} ${num(hX)} = h^*(\\text{${X}})$: ${over ? 'it **overestimates**, and A* could leave the route through ' + X + ' in Open while it pops G by a longer route.' : `it is **admissible** at ${X}. That it is larger than the straight-line ${num(d)} km does not matter: only $h \\le h^*$ counts.`}\n\n**Answers:** $h^*(\\text{${X}})$ = **${num(hX)} km**; **${over ? 'No' : 'Yes'}**.`,
    ],
  };
}

// ---------------------------------------------------------------- tier 2: a whole table

function admTier2(rng: Rng): SolveInstance {
  const bad = rng.chance(0.75);
  const accept = (x: Inst) => roomy(x, hStarOf(x)).length >= 2;
  const x = pickInst(rng, [6, 7], accept, 2) ?? anyInst(accept);
  const hs = hStarOf(x);
  const room = rng.shuffle(roomy(x, hs));
  const B = bad ? room[0] : null;
  const tight = room.filter((n) => n !== B).slice(0, bad ? 1 : 2);
  const table: Record<string, number> = { ...x.h };
  const H = (n: string) => round1(hs.get(n) ?? 0);
  for (const n of tight) table[n] = round1(x.h[n] + 0.1 * rng.int(1, Math.max(1, Math.round((H(n) - x.h[n]) * 10))));
  if (B) table[B] = round1(H(B) + rng.step(0.2, 1.0, 0.1));
  const okAt = (n: string) => table[n] <= H(n) + 1e-9;

  // "Which entry overestimates?": the bad one (if any), the raised ones, then plain ones.
  const plain = rng.shuffle(x.ids.filter((n) => n !== x.goal && n !== B && !tight.includes(n)));
  const shown = [...(B ? [B] : []), ...tight, ...plain].slice(0, 3);
  const route = (n: string) => routesBetween(x, n, x.goal, 60)[0];
  const whichOpts: ChoicePart['options'] = shown.map((n) => ({
    text: `$h(\\text{${n}}) = ${num(table[n])}$`,
    correct: n === B,
    why: `$h^*(\\text{${n}}) = ${num(H(n))}$ (${arrow(route(n).path)}), so $${num(table[n])} ${okAt(n) ? '\\le' : '>'} ${num(H(n))}$: ${okAt(n) ? 'admissible' : '**overestimates**'}.`,
  }));
  whichOpts.push({ text: 'None of them: every entry is at most its true cost to go', correct: !B, why: B ? `$h(\\text{${B}}) = ${num(table[B])}$ is more than $h^*(\\text{${B}}) = ${num(H(B))}$.` : 'Every entry satisfies $h(n) \\le h^*(n)$ (check the full table in the worked solution).' });

  const Q = B && rng.chance(0.6) ? B : rng.pick(tight.length ? tight : room);
  const all = x.ids.filter((n) => n !== x.goal);
  const fullTable = `$$\\begin{array}{c|${'c'.repeat(all.length + 1)}} n & ${[...all, x.goal].map((n) => `\\text{${n}}`).join(' & ')} \\\\ \\hline h(n) & ${[...all, x.goal].map((n) => num(table[n])).join(' & ')} \\\\ h^*(n) & ${[...all, x.goal].map((n) => num(H(n))).join(' & ')} \\\\ h \\le h^*? & ${[...all, x.goal].map((n) => (okAt(n) ? '\\checkmark' : '\\times')).join(' & ')} \\end{array}$$`;
  // Dijkstra outwards from G: the first few settled nodes, for the substitution hint.
  const fromG = graphSearch(x.nb, x.goal, '\u0000', 'dijkstra');
  const settle = fromG.steps
    .slice(1, 4)
    .map((s) => {
      const par = s.closed.find((c) => c.node === s.expanded)?.parent ?? x.goal;
      return `$h^*(\\text{${s.expanded}}) = c(\\text{${s.expanded}}, \\text{${par}}) + h^*(\\text{${par}}) = ${num(cost(x, s.expanded, par))} + ${num(H(par))} = ${num(s.g)}$`;
    })
    .join('\n- ');
  return {
    prompt: `A robot will use A* to plan from **S** to **G** on the road graph below (road lengths in km, drawn to scale). A student has typed in this heuristic table (also printed beside each node):\n\n${hTableTeX(x, table)}`,
    figure: figureOf(x, table, 'Road lengths in km, drawn to scale. Beside each node: h from the student’s table.'),
    parts: [
      {
        kind: 'choice',
        id: 'guarantee',
        label: 'With this table, is A* guaranteed to return the shortest route?',
        options: [
          { text: 'Yes: every entry is at most its true cost to go, so $h$ is admissible', correct: !B, why: B ? `No: $h(\\text{${B}}) = ${num(table[B])} > h^*(\\text{${B}}) = ${num(H(B))}$.` : 'Every entry satisfies $h(n) \\le h^*(n)$, so popping G proves its route is the shortest.' },
          { text: 'Not guaranteed: one entry overestimates, so A* may pop G by a longer route', correct: !!B, why: B ? `$h(\\text{${B}}) = ${num(table[B])}$ but the shortest road route from ${B} is ${num(H(B))} km. An inflated $f$ can keep the better route in Open while G is popped.` : 'No entry overestimates: every $h(n) \\le h^*(n)$.' },
          { text: 'Yes: $h(\\text{G}) = 0$, and that is all A* needs', correct: false, why: '$h(\\text{G}) = 0$ is necessary but not enough: every node needs $h(n) \\le h^*(n)$.' },
          { text: 'No: A* is only guaranteed to be optimal when $h = 0$', correct: false, why: 'Any admissible $h$ keeps A* optimal; $h = 0$ is the weakest admissible choice (it turns A* into Dijkstra).' },
        ],
        marks: 1,
      },
      { kind: 'choice', id: 'which', label: 'Which entry overestimates its true cost to go?', options: whichOpts, marks: 1 },
      { kind: 'numeric', id: 'hstar', label: `The true cost to go $h^*(\\text{${Q}})$`, answer: H(Q), unit: 'km', ...TOL, traps: hStarTraps(x, Q, H(Q), table[Q]), marks: 1 },
    ],
    hints: [
      `${ADM_CONCEPT} One overestimating entry is enough to lose A*'s guarantee.`,
      '$$h^*(\\text{G}) = 0, \\qquad h^*(n) = \\min_{m} \\big[\\, c(n, m) + h^*(m) \\,\\big], \\qquad \\text{admissible} \\iff h(n) \\le h^*(n) \\ \\ \\forall n$$\n\nWork outwards from G like Dijkstra (always settle the unsettled node with the smallest tentative $h^*$), then compare the table entry by entry.',
      `Settling outwards from G:\n\n- ${settle}\n- … and so on for the rest.`,
      `${fullTable}\n\n**Answers:** ${B ? `**Not guaranteed**: $h(\\text{${B}}) = ${num(table[B])}$ is more than $h^*(\\text{${B}}) = ${num(H(B))}$, so **${B}** overestimates.` : '**Yes**: every entry is at most $h^*$, so the table is admissible (**none** overestimates), even where it is above the straight-line distance.'} $h^*(\\text{${Q}})$ = **${num(H(Q))} km** (${arrow(route(Q).path)}).`,
    ],
  };
}

// ---------------------------------------------------------------- tier 3: Manhattan in Euclidean space (2023 Q25)

function admTier3(rng: Rng): SolveInstance {
  const grid8 = rng.chance(0.4);
  let x0 = 1;
  let y0 = 1;
  let x1 = 5;
  let y1 = 4;
  for (let k = 0; k < 60; k++) {
    const a = rng.int(0, 8);
    const b = rng.int(0, 5);
    const c = rng.int(0, 8);
    const d = rng.int(0, 5);
    if (a !== c && b !== d && Math.abs(a - c) + Math.abs(b - d) >= 4) {
      [x0, y0, x1, y1] = [a, b, c, d];
      break;
    }
  }
  const dx = x1 - x0;
  const dy = y1 - y0;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const man = ax + ay;
  const euc = Math.hypot(dx, dy);
  const oct = Math.max(ax, ay) + (Math.SQRT2 - 1) * Math.min(ax, ay);
  const hs = grid8 ? oct : euc;
  const nDiag = Math.min(ax, ay);
  const nStraight = Math.max(ax, ay) - nDiag;

  const manTraps = trapList(man, 0.01);
  manTraps.add(hs, `That is the true cost. Manhattan adds the two legs: $|\\Delta x| + |\\Delta y|$.`);
  manTraps.add(Math.abs(dx + dy), 'Use absolute values: $|\\Delta x| + |\\Delta y|$, not $\\Delta x + \\Delta y$.', 'sign');
  const hsTraps = trapList(hs, 0.005 * hs);
  hsTraps.add(man, `That is Manhattan, the cost of driving along x and then along y. The robot can do better${grid8 ? ' with diagonal steps' : ' along the straight line'}.`, 'manhattan-diagonal');
  if (grid8) {
    hsTraps.add(euc, 'That is the straight line, but on the grid the robot can only move in 8 directions: diagonal steps first, then straight ones.');
    hsTraps.add(Math.max(ax, ay), 'That prices a diagonal step at 1. It covers one cell in x and one in y for $\\sqrt2$.');
  } else hsTraps.add(dx * dx + dy * dy, 'Take the square root: $\\sqrt{\\Delta x^2 + \\Delta y^2}$.', 'sqrt');

  const whyOpts: ChoicePart['options'] = grid8
    ? [
        { text: 'No: it charges 2 m for a diagonal step that costs only $\\sqrt2$ m', correct: true, why: `With ${nDiag} diagonal step${nDiag === 1 ? '' : 's'} and ${nStraight} straight, $h^* = ${sig4(oct)}$ m, but $h_{\\text{Man}} = ${man}$ m: it overestimates. An overestimate can make A* pop G by a longer route.` },
        { text: 'Yes: with no obstacles Manhattan is the exact cost on any grid', correct: false, why: 'Only on a 4-connected grid (no diagonal moves). With diagonals, one $\\sqrt2$ step covers a cell of $\\Delta x$ and a cell of $\\Delta y$.' },
        { text: 'Yes: it ignores obstacles, so it can never be more than the true cost', correct: false, why: `Ignoring obstacles is needed, but Manhattan also prices the trip as if there were no diagonal steps. Even on the empty grid it gives $${man} > ${sig4(oct)}$ m.` },
        { text: 'No: it underestimates, so A* returns a longer path', correct: false, why: `It overestimates (${man} > ${sig4(oct)}). Underestimating is fine: never overestimating is what admissible means.` },
      ]
    : [
        { text: `No: it overestimates; the robot can drive the straight line, which is shorter than ${man} m`, correct: true, why: `$|\\Delta x| + |\\Delta y| \\ge \\sqrt{\\Delta x^2 + \\Delta y^2}$ (two sides of a right triangle against its hypotenuse), equal only when $\\Delta x$ or $\\Delta y$ is 0. Here $${man} > ${sig4(euc)}$ m, and an overestimate can make A* return a suboptimal path.` },
        { text: 'Yes: it ignores obstacles, so it can never be more than the true cost', correct: false, why: `Ignoring obstacles is needed, but Manhattan also assumes the robot moves along x and then along y. In free space the obstacle-free cost is the straight line, ${sig4(euc)} m < ${man} m.` },
        { text: 'Yes: it is the exact cost of driving along x and then along y', correct: false, why: 'The robot does not have to follow the axes. $h$ must not exceed the cheapest possible motion, and in Euclidean space that is the straight line.' },
        { text: 'No: it underestimates, so A* returns a longer path', correct: false, why: `It overestimates (${man} > ${sig4(euc)}). Underestimating is fine: never overestimating is what admissible means.` },
      ];

  const hsLabel = grid8 ? 'The true cheapest cost $h^*$ on the 8-connected grid' : 'The true cheapest cost $h^*$ (the straight-line distance)';
  const sq = (v: number) => (v < 0 ? `(${v})^2` : `${v}^2`);
  const sub = grid8
    ? `$h^* = \\max(${ax}, ${ay}) + (\\sqrt2 - 1)\\min(${ax}, ${ay}) = ${Math.max(ax, ay)} + 0.4142 \\times ${nDiag}$`
    : `$h^* = \\sqrt{${sq(dx)} + ${sq(dy)}} = \\sqrt{${dx * dx + dy * dy}}$`;
  return {
    prompt: grid8
      ? `A robot uses A* on an **8-connected grid** of 1 m cells: it may step to any of its 8 neighbours, a straight step costing 1 m and a diagonal step $\\sqrt2$ m. It is in cell (${x0}, ${y0}) and the goal is in cell (${x1}, ${y1}), with no obstacles in between. A student proposes the Manhattan distance as the heuristic.`
      : `A robot uses A* to plan in **Euclidean space**: on an open floor it can drive in any direction. It is at (${x0}, ${y0}) m and the goal is at (${x1}, ${y1}) m, with no obstacles in between. A student proposes the Manhattan distance as the heuristic (2023 Q25).`,
    figure: makeManhattanFigure({ x0, y0, x1, y1, grid8 }),
    parts: [
      { kind: 'numeric', id: 'man', label: 'Manhattan distance $h_{\\text{Man}} = |\\Delta x| + |\\Delta y|$ from the robot to the goal', answer: man, unit: 'm', absTol: 0.01, traps: manTraps.traps, marks: 1 },
      { kind: 'numeric', id: 'hstar', label: hsLabel, answer: hs, unit: 'm', tol: 0.005, traps: hsTraps.traps, marks: 1 },
      { kind: 'choice', id: 'why', label: 'Is Manhattan an admissible heuristic for this robot?', options: whyOpts, marks: 1 },
    ],
    hints: [
      `A heuristic is admissible when $h(n) \\le h^*(n)$ everywhere. With no obstacles, $h^*$ is the cost of the cheapest **motion** the robot can make: in free (Euclidean) space the straight line; on an 8-connected grid, diagonal steps first and then straight ones. Manhattan prices the trip as if the robot had to move along x and then along y, which is the cheapest motion only on a 4-connected grid.`,
      grid8
        ? '$$h_{\\text{Man}} = |\\Delta x| + |\\Delta y|, \\qquad h^* = h_{\\text{oct}} = \\max(|\\Delta x|, |\\Delta y|) + (\\sqrt2 - 1)\\min(|\\Delta x|, |\\Delta y|)$$\n\nEach diagonal step covers one cell of $\\Delta x$ and one of $\\Delta y$ for $\\sqrt2 \\approx 1.414$ m; Manhattan charges 2 m for the same progress.'
        : '$$h_{\\text{Man}} = |\\Delta x| + |\\Delta y|, \\qquad h^* = \\sqrt{\\Delta x^2 + \\Delta y^2} \\;\\le\\; h_{\\text{Man}}$$\n\nThe two legs of a right triangle are together longer than its hypotenuse (equal only when one leg is 0).',
      `$\\Delta x = ${x1} - ${x0} = ${dx}$ m and $\\Delta y = ${y1} - ${y0} = ${dy}$ m, so $h_{\\text{Man}} = ${ax} + ${ay}$ and ${sub}.`,
      `$$h_{\\text{Man}} = ${ax} + ${ay} = ${man}\\text{ m}, \\qquad h^* = ${sig4(hs)}\\text{ m}$$\n\n${grid8 ? `(${nDiag} diagonal step${nDiag === 1 ? '' : 's'} of $\\sqrt2$ m and ${nStraight} straight step${nStraight === 1 ? '' : 's'} of 1 m.) ` : ''}$h_{\\text{Man}} = ${man} > ${sig4(hs)} = h^*$, so Manhattan **overestimates** and is **not admissible** for this robot: A* may pop the goal by a suboptimal route. The overestimate is worst at 45°, where it reaches ${grid8 ? '$2/\\sqrt2 = \\sqrt2$ times the true cost' : '$\\sqrt2 \\approx 1.41$ times the straight line'}. (On a 4-connected grid Manhattan would be exact, and admissible.)\n\n**Answers:** $h_{\\text{Man}}$ = **${man} m**; $h^*$ = **${sig4(hs)} m**; **not admissible**.`,
    ],
  };
}

// ================================================================== plan-bfs-weighted

function bfsAccept(n: [number, number]) {
  return (x: Inst) => {
    if (x.graph.nodes.length < n[0] || x.graph.nodes.length > n[1]) return false;
    const b = runSearch(x, 'bfs');
    const d = runSearch(x, 'dijkstra');
    return !!b.path && !!d.path && b.cost >= d.cost + 0.3 && b.path.length < d.path.length;
  };
}

function bfsWhy(x: Inst, b: SearchResult, d: SearchResult): ChoicePart {
  const bh = b.path!.length - 1;
  const dh = d.path!.length - 1;
  return {
    kind: 'choice',
    id: 'why',
    label: 'Why is BFS not appropriate for finding the shortest route on this graph?',
    options: [
      { text: 'It minimises the number of roads, not their total length, and these roads differ a lot in length', correct: true, why: `BFS returns ${arrow(b.path!)} (${bh} roads, ${num(b.cost)} km), but ${arrow(d.path!)} is shorter (${dh} roads, ${num(d.cost)} km). Dijkstra or A* rank Open by distance and find it.` },
      { text: 'It is not complete: on a graph with loops like this one it can circle forever without reaching G', correct: false, why: 'BFS is complete on any finite graph (it never adds a node twice), and it does reach G here. The trouble is which route it returns.' },
      { text: 'It dives down the newest branch before trying the others, so it can end up far from G', correct: false, why: 'That describes depth-first search (a stack). BFS expands ring by ring of road count.' },
      { text: 'It needs an admissible heuristic to rank the roads, and this map does not give one', correct: false, why: 'BFS uses no heuristic at all; A* is the search that needs an admissible $h$.' },
    ],
    marks: 1,
  };
}

const BFS_CONCEPT =
  'BFS pops Open in arrival order (first in, first out), so it expands the graph in rings of **road count** around the start: everything one road away, then two roads, and so on. It returns a route with the **fewest roads** and never looks at their lengths. When road lengths differ a lot (0.9 km to 11.2 km on the 2024 map) the fewest-roads route need not be the shortest; Dijkstra or A* rank Open by distance instead.';

function bfsCostPart(x: Inst, b: SearchResult, d: SearchResult, id: string, label: string): NumericPart {
  const t = trapList(b.cost);
  t.add(d.cost, 'That is the shortest route, which Dijkstra or A* would return. BFS returns the fewest-roads route.');
  return { kind: 'numeric', id, label, answer: b.cost, unit: 'km', ...TOL, traps: t.traps, marks: 1 };
}

function bestCostPart(x: Inst, b: SearchResult, d: SearchResult): NumericPart {
  const t = trapList(d.cost);
  t.add(b.cost, 'That is the fewest-roads route BFS returns. A route with more roads is shorter here.', 'bfs-weights');
  const second = routesBetween(x, x.start, x.goal).find((r) => r.cost > d.cost + 0.06);
  if (second) t.add(second.cost, `That is ${arrow(second.path)}, not the shortest route.`);
  return { kind: 'numeric', id: 'best', label: 'Length of the shortest route', answer: d.cost, unit: 'km', ...TOL, traps: t.traps, marks: 1 };
}

function bfsTier1(rng: Rng): SolveInstance {
  const accept = bfsAccept([5, 6]);
  const x = pickInst(rng, [5, 6], accept, 2) ?? pickInst(rng, [5, 7], bfsAccept([5, 7]), 2, 300) ?? anyInst(bfsAccept([5, 8]));
  const b = runSearch(x, 'bfs');
  const d = runSearch(x, 'dijkstra');
  const bs = pathSum(x, b.path!);
  const ds = pathSum(x, d.path!);
  // The candidate routes: the shortest, the BFS one, and the next cheapest (cheapest first).
  const key = (p: readonly string[]) => p.join('>');
  const others: { path: string[]; cost: number }[] = [];
  for (const r of [{ path: d.path!, cost: d.cost }, { path: b.path!, cost: b.cost }, ...routesBetween(x, x.start, x.goal)])
    if (others.length < 4 && !others.some((o) => key(o.path) === key(r.path))) others.push(r);
  others.sort((p, q) => p.cost - q.cost);
  return {
    prompt: `A delivery robot must get from **S** to **G** on the road graph below (road lengths in km, drawn to scale). Breadth-first search (BFS) returns **${arrow(b.path!)}**: a route with the fewest roads (${b.path!.length - 1}).`,
    figure: figureOf(x),
    parts: [bfsCostPart(x, b, d, 'bfs', 'Length of the route BFS returns'), bestCostPart(x, b, d), bfsWhy(x, b, d)],
    hints: [
      BFS_CONCEPT,
      '$$L(\\text{route}) = \\sum_{\\text{roads}} c(\\text{road})$$\n\nAdd up the roads of the BFS route, then compare it with the other routes from S to G (or run Dijkstra) to find the shortest.',
      `BFS route ${arrow(b.path!)}: $${bs.text}$ km. The candidate routes, cheapest first:\n\n${routesTeX(x, others)}`,
      `${routesTeX(x, others)}\n\nBFS: ${arrow(b.path!)}, $${bs.text}$ km. Shortest: ${arrow(d.path!)}, $${ds.text}$ km, with more roads (${d.path!.length - 1} against ${b.path!.length - 1}).\n\n**Answers:** BFS route **${num(b.cost)} km**; shortest **${num(d.cost)} km**; BFS minimises the **number of roads**, not their length, so it is the wrong tool when road lengths differ.`,
    ],
  };
}

function bfsTier2(rng: Rng): SolveInstance {
  const exam = rng.chance(0.25);
  const x = exam ? brisbaneInst('KG', 'SL') : pickInst(rng, [6, 8], bfsAccept([6, 8]), 2) ?? anyInst(bfsAccept([5, 8]));
  const b = runSearch(x, 'bfs');
  const d = runSearch(x, 'dijkstra');
  const bh = b.path!.length - 1;
  const key = (p: readonly string[]) => p.join('>');
  const gParent = b.path![b.path!.length - 2];
  const opts: ChoicePart['options'] = [
    { text: arrow(b.path!), correct: true, why: `BFS pops ${b.expandedOrder.join(', ')}. ${x.goal} first joins the queue from ${gParent}, and following the parents back gives this route (${bh} roads, ${num(b.cost)} km).` },
    { text: arrow(d.path!), correct: false, why: `That is the shortest route (${num(d.cost)} km), which Dijkstra or A* return. It has ${d.path!.length - 1} roads, more than BFS needs, so BFS never picks it.` },
  ];
  const used = new Set([key(b.path!), key(d.path!)]);
  for (const r of routesBetween(x, x.start, x.goal)) {
    if (opts.length >= 4) break;
    if (used.has(key(r.path))) continue;
    used.add(key(r.path));
    const hp = r.path.length - 1;
    const last = r.path[r.path.length - 2];
    opts.push({
      text: arrow(r.path),
      correct: false,
      why:
        hp === bh
          ? `Also ${hp} roads, but BFS reaches ${x.goal} first from ${gParent}: ${gParent} is popped before ${last}, because it entered the queue earlier (alphabetical order, first in first out).`
          : hp > bh
            ? `${hp} roads: BFS reaches ${x.goal} with fewer (${bh}) before it gets this deep.`
            : `${hp} roads; BFS returns ${arrow(b.path!)}.`,
    });
  }
  const bs = pathSum(x, b.path!);
  const ds = pathSum(x, d.path!);
  const name = (n: string) => (x.exam === 'brisbane' ? `${n} (${BRISBANE_2024.nodes.find((v) => v.id === n)?.label ?? n})` : n);
  const prompt =
    x.exam === 'brisbane'
      ? `The 2024 exam's shuttle network: road distances (km) between Brisbane campuses, below (not to scale). A student proposes breadth-first search (BFS) to find the shortest route from **${name(x.start)}** to **${name(x.goal)}** (2024 Q29(a)).`
      : `A delivery robot must get from **S** to **G** on the road graph below (road lengths in km, drawn to scale). A student proposes breadth-first search (BFS) to find the shortest route.`;
  return {
    prompt: `${prompt}\n\nBFS adds neighbours to its queue in **alphabetical order**, never adds a node twice, and stops when ${x.goal} is **popped**.`,
    figure: figureOf(x),
    parts: [
      { kind: 'choice', id: 'route', label: 'Which route does BFS return?', options: opts, marks: 1 },
      bfsCostPart(x, b, d, 'bfs', 'Its length'),
      bestCostPart(x, b, d),
      bfsWhy(x, b, d),
    ],
    hints: [
      BFS_CONCEPT,
      `Run the queue: pop the front, add its new neighbours (alphabetical) at the back, stop when ${x.goal} is popped, then follow the parents back. Then compare route lengths $L = \\sum c(\\text{road})$ to find the shortest (or run Dijkstra).`,
      `The BFS queue, first three pops:\n\n${stepsWords(x, 'bfs', b, 3)}`,
      `${traceTeX('bfs', b)}\n\nBFS route: ${arrow(b.path!)}, $${bs.text}$ km (${bh} roads). Shortest: ${arrow(d.path!)}, $${ds.text}$ km (${d.path!.length - 1} roads).\n\n**Answers:** **${arrow(b.path!)}**; **${num(b.cost)} km**; shortest **${num(d.cost)} km**; BFS minimises the **number of roads**, not their length.`,
    ],
  };
}

// ================================================================== generators

export const generators: SolveGenerator[] = [
  {
    id: 'plan-search-order',
    title: 'Which node next? BFS, DFS, Dijkstra and A* by hand',
    summary: 'Warm-up: one Open list, four pop rules. Exam: the whole expansion order of two searches on the same graph. Stretch: a node in Open gets a cheaper parent.',
    tiers: [1, 2, 3],
    source: 'Review deck slide 15; 2023 Q9, 2024 Q9, 2025 Q9; parent update as in 2024 Q29(c)',
    cardId: 'plan-search',
    marks: 4,
    generate(rng, tier) {
      if (tier === 1) return orderTier1(rng);
      if (tier === 2) return orderTier2(rng);
      return orderTier3(rng);
    },
  },
  {
    id: 'plan-admissible',
    title: 'Is this heuristic admissible?',
    summary: 'Warm-up: the true cost to go of one node. Exam: find the overestimating entry in a table. Stretch: Manhattan against the straight line (2023 Q25) or the 8-connected grid.',
    tiers: [1, 2, 3],
    source: 'Similar to 2023 Q25 and 2024 Q29(b)',
    cardId: 'plan-heuristics',
    marks: 3,
    generate(rng, tier) {
      if (tier === 1) return admTier1(rng);
      if (tier === 2) return admTier2(rng);
      return admTier3(rng);
    },
  },
  {
    id: 'plan-bfs-weighted',
    title: 'Why not BFS? Fewest roads against shortest',
    summary: 'The 2024 Q29(a) argument with numbers: the route BFS returns, its length, the shortest length, and why BFS is the wrong tool on a weighted graph.',
    tiers: [1, 2],
    source: 'Similar to 2024 Q29(a)',
    cardId: 'plan-search',
    marks: 3,
    generate(rng, tier) {
      return tier === 1 ? bfsTier1(rng) : bfsTier2(rng);
    },
  },
];
