// Graph search with a full trace of every expansion, so the UI can replay the Open/Closed tables the
// exam asks for (summary notes §5; 2024 Q29). Works on any graph given as a neighbour function.
//
// Conventions (the lecture/exam version of each algorithm):
//   - every algorithm pops one node from Open per step and moves it to Closed;
//   - the goal test happens when the goal is POPPED, not when it is first added to Open;
//   - a node already in Closed is never reopened;
//   - for Dijkstra / A* / greedy, a node already in Open gets a new parent when the new g is lower.
//   BFS (FIFO) and DFS (LIFO) keep the first parent they find and ignore edge costs when ordering.

export type Algo = 'bfs' | 'dfs' | 'dijkstra' | 'astar' | 'greedy';

export const ALGO_LABEL: Record<Algo, string> = {
  bfs: 'Breadth-first (BFS)',
  dfs: 'Depth-first (DFS)',
  dijkstra: 'Dijkstra',
  astar: 'A*',
  greedy: 'Greedy best-first',
};

export type Neighbours = (node: string) => readonly (readonly [string, number])[];

export interface OpenEntry {
  node: string;
  /** Cost to arrive from the start along the current parent chain. */
  g: number;
  /** Heuristic estimate of the cost to go (0 for BFS/DFS/Dijkstra). */
  h: number;
  /** Priority used to pick the next node: g (Dijkstra), g + h (A*), h (greedy); insertion order for BFS/DFS. */
  f: number;
  parent: string | null;
  /** Insertion counter (FIFO/LIFO order and stable tie-breaks). */
  seq: number;
}

export interface ClosedEntry {
  node: string;
  g: number;
  parent: string | null;
}

export type UpdateKind = 'add' | 'improve' | 'worse' | 'closed';

export interface NeighbourUpdate {
  node: string;
  /** g through the expanded node. */
  g: number;
  h: number;
  f: number;
  /** add: new to Open; improve: parent changed (lower g); worse: already in Open with lower/equal g; closed: already expanded. */
  kind: UpdateKind;
  /** g it had before (for improve/worse/closed). */
  oldG?: number;
}

export interface SearchStep {
  /** Node popped from Open and moved to Closed this step. */
  expanded: string;
  g: number;
  /** What happened to each neighbour. Empty when the goal was popped (search stops). */
  updates: NeighbourUpdate[];
  /** Open and Closed AFTER this step (Open sorted in the order it would be popped). */
  open: OpenEntry[];
  closed: ClosedEntry[];
  isGoal: boolean;
}

export interface SearchResult {
  steps: SearchStep[];
  /** Open and Closed before the first pop (just the start node). */
  initialOpen: OpenEntry[];
  path: string[] | null;
  cost: number;
  expandedOrder: string[];
}

export interface SearchOptions {
  /** Heuristic for A* and greedy (default 0). */
  h?: (node: string) => number;
  /** Stop after this many expansions (safety for huge graphs). */
  maxSteps?: number;
  /** Tie-break between equal priorities: insertion order (default) or lower h first. */
  tieBreak?: 'fifo' | 'h';
}

function priority(algo: Algo, g: number, h: number, seq: number): number {
  switch (algo) {
    case 'bfs':
      return seq;
    case 'dfs':
      return -seq;
    case 'dijkstra':
      return g;
    case 'astar':
      return g + h;
    case 'greedy':
      return h;
  }
}

function openOrder(algo: Algo, tieBreak: 'fifo' | 'h') {
  return (a: OpenEntry, b: OpenEntry) => {
    const pa = priority(algo, a.g, a.h, a.seq);
    const pb = priority(algo, b.g, b.h, b.seq);
    if (Math.abs(pa - pb) > 1e-9) return pa - pb;
    if (tieBreak === 'h' && Math.abs(a.h - b.h) > 1e-9) return a.h - b.h;
    return algo === 'dfs' ? b.seq - a.seq : a.seq - b.seq;
  };
}

/** Run one search to completion and record every step. */
export function graphSearch(neighbours: Neighbours, start: string, goal: string, algo: Algo, opts: SearchOptions = {}): SearchResult {
  const hf = algo === 'astar' || algo === 'greedy' ? opts.h ?? (() => 0) : () => 0;
  const tie = opts.tieBreak ?? 'fifo';
  const order = openOrder(algo, tie);
  const maxSteps = opts.maxSteps ?? 100000;
  let seq = 0;
  const open = new Map<string, OpenEntry>();
  const closed = new Map<string, ClosedEntry>();
  const h0 = hf(start);
  open.set(start, { node: start, g: 0, h: h0, f: priority(algo, 0, h0, 0), parent: null, seq: seq++ });
  const snapOpen = () => [...open.values()].sort(order).map((e) => ({ ...e }));
  const snapClosed = () => [...closed.values()].map((e) => ({ ...e }));
  const initialOpen = snapOpen();
  const steps: SearchStep[] = [];
  const expandedOrder: string[] = [];

  while (open.size && steps.length < maxSteps) {
    const cur = [...open.values()].sort(order)[0];
    open.delete(cur.node);
    closed.set(cur.node, { node: cur.node, g: cur.g, parent: cur.parent });
    expandedOrder.push(cur.node);
    if (cur.node === goal) {
      steps.push({ expanded: cur.node, g: cur.g, updates: [], open: snapOpen(), closed: snapClosed(), isGoal: true });
      break;
    }
    const updates: NeighbourUpdate[] = [];
    for (const [nb, w] of neighbours(cur.node)) {
      const g = cur.g + w;
      const h = hf(nb);
      const c = closed.get(nb);
      if (c) {
        updates.push({ node: nb, g, h, f: g + h, kind: 'closed', oldG: c.g });
        continue;
      }
      const o = open.get(nb);
      if (!o) {
        const s = seq++;
        open.set(nb, { node: nb, g, h, f: priority(algo, g, h, s), parent: cur.node, seq: s });
        updates.push({ node: nb, g, h, f: g + h, kind: 'add' });
      } else if ((algo === 'dijkstra' || algo === 'astar' || algo === 'greedy') && g < o.g - 1e-12) {
        updates.push({ node: nb, g, h, f: g + h, kind: 'improve', oldG: o.g });
        o.g = g;
        o.parent = cur.node;
        o.f = priority(algo, g, o.h, o.seq);
      } else {
        updates.push({ node: nb, g, h, f: g + h, kind: 'worse', oldG: o.g });
      }
    }
    steps.push({ expanded: cur.node, g: cur.g, updates, open: snapOpen(), closed: snapClosed(), isGoal: false });
  }

  const goalClosed = closed.get(goal);
  let path: string[] | null = null;
  if (goalClosed) {
    path = [];
    let n: string | null = goal;
    while (n !== null) {
      path.unshift(n);
      n = closed.get(n)?.parent ?? null;
    }
  }
  return { steps, initialOpen, path, cost: goalClosed ? goalClosed.g : Infinity, expandedOrder };
}

// ------------------------------------------------------------------ explicit graphs (road maps)

export interface WeightedGraph {
  nodes: { id: string; label?: string; x?: number; y?: number }[];
  /** Undirected edges [a, b, cost]. */
  edges: [string, string, number][];
}

export function neighboursOf(g: WeightedGraph): Neighbours {
  const adj = new Map<string, [string, number][]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const [a, b, w] of g.edges) {
    adj.get(a)!.push([b, w]);
    adj.get(b)!.push([a, w]);
  }
  return (n) => adj.get(n) ?? [];
}

/** True cost-to-go h*(n) from every node to `goal` (Dijkstra from the goal; graph is undirected). */
export function costToGo(neighbours: Neighbours, nodes: readonly string[], goal: string): Map<string, number> {
  const dist = new Map<string, number>(nodes.map((n) => [n, Infinity]));
  dist.set(goal, 0);
  const done = new Set<string>();
  for (;;) {
    let best: string | null = null;
    let bd = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < bd) {
      bd = d;
      best = n;
    }
    if (best === null) break;
    done.add(best);
    for (const [nb, w] of neighbours(best)) {
      if (bd + w < (dist.get(nb) ?? Infinity)) dist.set(nb, bd + w);
    }
  }
  return dist;
}

/** Nodes where h overestimates the true cost to go (h(n) > h*(n)): an inadmissible heuristic. */
export function admissibilityViolations(h: (n: string) => number, hStar: Map<string, number>, eps = 1e-9): { node: string; h: number; hStar: number }[] {
  const out: { node: string; h: number; hStar: number }[] = [];
  for (const [n, hs] of hStar) if (Number.isFinite(hs) && h(n) > hs + eps) out.push({ node: n, h: h(n), hStar: hs });
  return out;
}

/** Edges where h(a) > c(a, b) + h(b): an inconsistent heuristic (can cause re-expansions in textbook A*). */
export function consistencyViolations(g: WeightedGraph, h: (n: string) => number, eps = 1e-9): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const [a, b, w] of g.edges) {
    if (h(a) > w + h(b) + eps) out.push({ from: a, to: b });
    if (h(b) > w + h(a) + eps) out.push({ from: b, to: a });
  }
  return out;
}

// ------------------------------------------------------------------ occupancy grids

export interface GridMap {
  cols: number;
  rows: number;
  /** blocked[r][c]. */
  blocked: boolean[][];
  /** Optional per-cell traversal cost multiplier (≥ 1; e.g. mud = 5). Entering a cell costs step × cost. */
  cost?: number[][];
}

export const cellId = (c: number, r: number) => `${c},${r}`;
export const parseCellId = (id: string): [number, number] => {
  const [c, r] = id.split(',').map(Number);
  return [c, r];
};

/** 4- or 8-connected neighbours. Diagonal steps cost √2 and may not cut a blocked corner. */
export function gridNeighbours(m: GridMap, diagonal: boolean): Neighbours {
  const dirs4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const dirs8 = [...dirs4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const dirs = diagonal ? dirs8 : dirs4;
  return (id) => {
    const [c, r] = parseCellId(id);
    const out: [string, number][] = [];
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= m.cols || nr >= m.rows || m.blocked[nr][nc]) continue;
      if (dc && dr && (m.blocked[r][nc] || m.blocked[nr][c])) continue;
      const step = dc && dr ? Math.SQRT2 : 1;
      out.push([cellId(nc, nr), step * (m.cost ? m.cost[nr][nc] : 1)]);
    }
    return out;
  };
}

export type HeuristicKind = 'zero' | 'euclidean' | 'manhattan' | 'octile' | 'inflated';

export const HEURISTIC_LABEL: Record<HeuristicKind, string> = {
  zero: 'h = 0 (Dijkstra)',
  euclidean: 'Euclidean',
  manhattan: 'Manhattan',
  octile: 'Octile',
  inflated: 'Inflated Euclidean (ε·h)',
};

/** Grid heuristic towards `goal`. `eps` scales the inflated heuristic. */
export function gridHeuristic(kind: HeuristicKind, goal: string, eps = 2): (id: string) => number {
  const [gc, gr] = parseCellId(goal);
  return (id) => {
    const [c, r] = parseCellId(id);
    const dx = Math.abs(c - gc);
    const dy = Math.abs(r - gr);
    switch (kind) {
      case 'zero':
        return 0;
      case 'euclidean':
        return Math.hypot(dx, dy);
      case 'manhattan':
        return dx + dy;
      case 'octile':
        return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
      case 'inflated':
        return eps * Math.hypot(dx, dy);
    }
  };
}

/** Sum of edge costs along a path. */
export function pathCost(neighbours: Neighbours, path: readonly string[]): number {
  let t = 0;
  for (let i = 1; i < path.length; i++) {
    const e = neighbours(path[i - 1]).find(([n]) => n === path[i]);
    t += e ? e[1] : Infinity;
  }
  return t;
}
