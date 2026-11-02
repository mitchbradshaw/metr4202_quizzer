// Pure helpers for the grid search lab and the heuristic lab (no React).
//
// - `Grid`: a 24 × 15 occupancy grid (free / wall / mud ×5) with a start and a goal, stored row-major.
// - `fastSearch`: the same algorithm as core/graph.ts `graphSearch` (identical pop order, tie-breaks, goal test
//   on pop, no re-opening of Closed, parent update in Open for Dijkstra / A* / greedy), but on typed arrays with a
//   binary heap and no per-step snapshots, so the "compare every algorithm" tables can be recomputed on every
//   edit. A self-test (tests/search.ts) checks that it returns exactly what graphSearch returns.
// - `costToGoGrid`: the true cost to go h*(n) with DIRECTED step costs (entering a mud cell costs ×5, so the
//   cost of a → b is not the cost of b → a). core/graph.ts `costToGo` treats the graph as undirected, which is
//   right for road maps but not for a grid with mud.
// - Presets for both labs, and the 'A1'-style cell labels used in the tables.
import { makeRng } from '../../../engine/rng';
import { cellId, parseCellId, type Algo, type GridMap, type HeuristicKind } from '../../../core/graph';

export const COLS = 24;
export const ROWS = 15;
/** Traversal-cost multiplier of a mud cell: entering it costs 5 × the step length. */
export const MUD_COST = 5;

export const FREE = 0;
export const WALL = 1;
export const MUD = 2;

export interface Grid {
  cols: number;
  rows: number;
  /** Row-major cell kinds: 0 free, 1 wall, 2 mud. */
  cells: Uint8Array;
  /** Cell indices (r * cols + c). */
  start: number;
  goal: number;
}

export const cellIndex = (g: { cols: number }, c: number, r: number) => r * g.cols + c;
export const colOf = (g: { cols: number }, k: number) => k % g.cols;
export const rowOf = (g: { cols: number }, k: number) => Math.floor(k / g.cols);

/** Spreadsheet-style label: column letter A, B, … then row number from 1 (top row is 1). */
export function colLetter(c: number): string {
  return c < 26 ? String.fromCharCode(65 + c) : `${String.fromCharCode(64 + Math.floor(c / 26))}${String.fromCharCode(65 + (c % 26))}`;
}
export const cellLabel = (g: { cols: number }, k: number) => `${colLetter(colOf(g, k))}${rowOf(g, k) + 1}`;

/** core/graph.ts node id ("c,r") of a cell index, and back. */
export const idOfCell = (g: { cols: number }, k: number) => cellId(colOf(g, k), rowOf(g, k));
export function cellOfId(g: { cols: number }, id: string): number {
  const [c, r] = parseCellId(id);
  return r * g.cols + c;
}

export function emptyGrid(cols = COLS, rows = ROWS, start?: number, goal?: number): Grid {
  const r = Math.floor(rows / 2);
  return { cols, rows, cells: new Uint8Array(cols * rows), start: start ?? r * cols + 3, goal: goal ?? r * cols + cols - 4 };
}

export function cloneGrid(g: Grid): Grid {
  return { ...g, cells: g.cells.slice() };
}

export const hasMud = (g: Grid) => g.cells.includes(MUD);

/** The GridMap that core/graph.ts gridNeighbours expects (blocked[r][c], cost[r][c]). */
export function toGridMap(g: Grid): GridMap {
  const blocked: boolean[][] = [];
  const cost: number[][] = [];
  for (let r = 0; r < g.rows; r++) {
    const b: boolean[] = [];
    const c: number[] = [];
    for (let col = 0; col < g.cols; col++) {
      const v = g.cells[r * g.cols + col];
      b.push(v === WALL);
      c.push(v === MUD ? MUD_COST : 1);
    }
    blocked.push(b);
    cost.push(c);
  }
  return hasMud(g) ? { cols: g.cols, rows: g.rows, blocked, cost } : { cols: g.cols, rows: g.rows, blocked };
}

// ------------------------------------------------------------------ neighbours (same order as gridNeighbours)

const DIRS4: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIRS8: readonly [number, number][] = [...DIRS4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Calls visit(nb, cost) for every neighbour of cell k in the order core/graph.ts gridNeighbours uses:
 * right, left, down, up, then the diagonals. Diagonal steps cost √2 and may not cut a wall corner.
 * Entering a cell costs step × (5 for mud, 1 otherwise).
 */
export function forNeighbours(g: Grid, diag: boolean, k: number, visit: (nb: number, cost: number) => void) {
  const c = k % g.cols;
  const r = (k - c) / g.cols;
  const dirs = diag ? DIRS8 : DIRS4;
  for (let i = 0; i < dirs.length; i++) {
    const dc = dirs[i][0];
    const dr = dirs[i][1];
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
    const nb = nr * g.cols + nc;
    if (g.cells[nb] === WALL) continue;
    if (dc && dr && (g.cells[r * g.cols + nc] === WALL || g.cells[nr * g.cols + c] === WALL)) continue;
    const step = dc && dr ? Math.SQRT2 : 1;
    visit(nb, step * (g.cells[nb] === MUD ? MUD_COST : 1));
  }
}

// ------------------------------------------------------------------ heuristics

export type GridHeuristic = HeuristicKind;

/** h(n) towards the goal for every cell (same formulas as core/graph.ts gridHeuristic). */
export function heuristicArray(g: Grid, kind: GridHeuristic, eps = 2): Float64Array {
  const out = new Float64Array(g.cols * g.rows);
  const gc = g.goal % g.cols;
  const gr = Math.floor(g.goal / g.cols);
  for (let k = 0; k < out.length; k++) {
    const dx = Math.abs((k % g.cols) - gc);
    const dy = Math.abs(Math.floor(k / g.cols) - gr);
    out[k] =
      kind === 'zero'
        ? 0
        : kind === 'euclidean'
          ? Math.hypot(dx, dy)
          : kind === 'manhattan'
            ? dx + dy
            : kind === 'octile'
              ? Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
              : eps * Math.hypot(dx, dy);
  }
  return out;
}

// ------------------------------------------------------------------ binary heap with graphSearch's ordering

class Heap {
  node: number[] = [];
  pri: number[] = [];
  hv: number[] = [];
  seq: number[] = [];
  constructor(
    private tieH: boolean,
    private lifo: boolean
  ) {}
  get size() {
    return this.node.length;
  }
  /** a before b? Same comparator as graphSearch's openOrder: priority (±1e-9), then h (if tieBreak 'h'), then seq. */
  private less(a: number, b: number): boolean {
    const d = this.pri[a] - this.pri[b];
    if (Math.abs(d) > 1e-9) return d < 0;
    if (this.tieH) {
      const dh = this.hv[a] - this.hv[b];
      if (Math.abs(dh) > 1e-9) return dh < 0;
    }
    return this.lifo ? this.seq[a] > this.seq[b] : this.seq[a] < this.seq[b];
  }
  private swap(a: number, b: number) {
    const s = (arr: number[]) => {
      const t = arr[a];
      arr[a] = arr[b];
      arr[b] = t;
    };
    s(this.node);
    s(this.pri);
    s(this.hv);
    s(this.seq);
  }
  push(node: number, pri: number, hv: number, seq: number) {
    this.node.push(node);
    this.pri.push(pri);
    this.hv.push(hv);
    this.seq.push(seq);
    let i = this.node.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.node[0];
    const last = this.node.length - 1;
    this.swap(0, last);
    this.node.pop();
    this.pri.pop();
    this.hv.pop();
    this.seq.pop();
    let i = 0;
    const n = this.node.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

// ------------------------------------------------------------------ fast search

export interface FastResult {
  /** Cells in the order they were popped (expanded); the last one is the goal when it was reached. */
  order: Int32Array;
  /** Cost of the returned path (Infinity if the goal is unreachable). */
  cost: number;
  /** Cell indices from start to goal, or null. */
  path: number[] | null;
  /** Largest number of cells in Open at any time (after each expansion). */
  peakOpen: number;
  /** g of every cell reached (Infinity otherwise) and its parent (-1 for none), as left when the search stopped. */
  g: Float64Array;
  parent: Int32Array;
  /** 0 never reached, 1 in Open, 2 in Closed, when the search stopped. */
  state: Uint8Array;
}

export interface FastOptions {
  /** h per cell (used by A* and greedy only, like graphSearch). */
  h?: Float64Array;
  /** Tie-break between equal priorities (default 'fifo', as graphSearch). */
  tieBreak?: 'fifo' | 'h';
}

/** graphSearch on a Grid, without the per-step snapshots. */
export function fastSearch(g: Grid, algo: Algo, diag: boolean, opts: FastOptions = {}): FastResult {
  const n = g.cols * g.rows;
  const useH = algo === 'astar' || algo === 'greedy';
  const H = opts.h;
  const hOf = (k: number) => (useH && H ? H[k] : 0);
  const heap = new Heap(opts.tieBreak === 'h', algo === 'dfs');
  const G = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const state = new Uint8Array(n);
  const seqOf = new Int32Array(n).fill(-1);
  const pri = (gv: number, hv: number, s: number) =>
    algo === 'bfs' ? s : algo === 'dfs' ? -s : algo === 'dijkstra' ? gv : algo === 'astar' ? gv + hv : hv;
  let seq = 0;
  let openCount = 0;
  let peak = 1;
  const order: number[] = [];
  const start = g.start;
  const goal = g.goal;
  G[start] = 0;
  state[start] = 1;
  seqOf[start] = seq;
  heap.push(start, pri(0, hOf(start), seq), hOf(start), seq);
  seq++;
  openCount = 1;
  const improves = algo === 'dijkstra' || algo === 'astar' || algo === 'greedy';
  let reached = false;
  while (heap.size) {
    const cur = heap.pop();
    if (state[cur] !== 1) continue; // stale entry (already expanded)
    state[cur] = 2;
    openCount--;
    order.push(cur);
    if (cur === goal) {
      reached = true;
      break;
    }
    const gc = G[cur];
    forNeighbours(g, diag, cur, (nb, w) => {
      if (state[nb] === 2) return;
      const gn = gc + w;
      if (state[nb] === 0) {
        state[nb] = 1;
        G[nb] = gn;
        parent[nb] = cur;
        seqOf[nb] = seq;
        heap.push(nb, pri(gn, hOf(nb), seq), hOf(nb), seq);
        seq++;
        openCount++;
      } else if (improves && gn < G[nb] - 1e-12) {
        G[nb] = gn;
        parent[nb] = cur;
        // Same seq as before (graphSearch keeps the entry's insertion counter); the stale entry is skipped later.
        heap.push(nb, pri(gn, hOf(nb), seqOf[nb]), hOf(nb), seqOf[nb]);
      }
    });
    if (openCount > peak) peak = openCount;
  }
  let path: number[] | null = null;
  if (reached) {
    path = [];
    for (let k = goal; k !== -1; k = parent[k]) path.unshift(k);
  }
  return { order: Int32Array.from(order), cost: reached ? G[goal] : Infinity, path, peakOpen: peak, g: G, parent, state };
}

/** Number of edges in a path. */
export const pathSteps = (path: number[] | null) => (path ? path.length - 1 : 0);

export function sameOrder(a: Int32Array, b: Int32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ------------------------------------------------------------------ true cost to go

/**
 * h*(n): the cheapest cost from every cell to the goal (Infinity if it cannot reach the goal).
 * Dijkstra outwards from the goal over REVERSED edges: moving v → u costs step × cost(u), so
 * h*(v) = min over u of step(v, u) · cost(u) + h*(u). Walls get Infinity.
 */
export function costToGoGrid(g: Grid, diag: boolean): Float64Array {
  const n = g.cols * g.rows;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  if (g.cells[g.goal] === WALL) return dist;
  dist[g.goal] = 0;
  const heap = new Heap(false, false);
  let seq = 0;
  heap.push(g.goal, 0, 0, seq++);
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    const du = dist[u];
    // The neighbour relation is symmetric (same corner rule both ways); only the cost is directed.
    const enterU = g.cells[u] === MUD ? MUD_COST : 1;
    forNeighbours(g, diag, u, (v, wUV) => {
      if (done[v]) return;
      const enterV = g.cells[v] === MUD ? MUD_COST : 1;
      const step = wUV / enterV; // 1 or √2
      const dv = du + step * enterU;
      if (dv < dist[v] - 1e-12) {
        dist[v] = dv;
        heap.push(v, dv, 0, seq++);
      }
    });
  }
  return dist;
}

// ------------------------------------------------------------------ presets

export type PresetId = 'open' | 'wallgap' | 'maze' | 'mud' | 'dfs' | 'q25' | 'block' | 'blank';

export interface Preset {
  id: PresetId;
  label: string;
  /** One line shown under the map when the preset is loaded. */
  note: string;
  build: () => Grid;
}

function paint(g: Grid, c0: number, r0: number, c1: number, r1: number, v: number) {
  for (let r = Math.max(0, r0); r <= Math.min(g.rows - 1, r1); r++)
    for (let c = Math.max(0, c0); c <= Math.min(g.cols - 1, c1); c++) g.cells[r * g.cols + c] = v;
}

/** A maze carved by a seeded depth-first walk on the even cells, with a few extra openings so routes can differ. */
function mazeGrid(seed = 4202): Grid {
  const g = emptyGrid();
  g.cells.fill(WALL);
  const rng = makeRng(seed);
  const mc = Math.floor((g.cols + 1) / 2); // maze cells on even columns 0..22
  const mr = Math.floor((g.rows + 1) / 2); // and even rows 0..14
  const seen = new Uint8Array(mc * mr);
  const open = (c: number, r: number) => (g.cells[r * g.cols + c] = FREE);
  const stack: [number, number][] = [[0, mr - 1]];
  seen[(mr - 1) * mc] = 1;
  open(0, 2 * (mr - 1));
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as [number, number][]
    ).filter(([dx, dy]) => {
      const nx = cx + dx;
      const ny = cy + dy;
      return nx >= 0 && ny >= 0 && nx < mc && ny < mr && !seen[ny * mc + nx];
    });
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = rng.pick(opts);
    const nx = cx + dx;
    const ny = cy + dy;
    seen[ny * mc + nx] = 1;
    open(2 * cx + dx, 2 * cy + dy);
    open(2 * nx, 2 * ny);
    stack.push([nx, ny]);
  }
  // Knock out some interior walls between two corridors (loops make BFS, A* and DFS differ).
  let knocked = 0;
  for (let tries = 0; tries < 400 && knocked < 9; tries++) {
    const c = rng.int(1, g.cols - 3);
    const r = rng.int(1, g.rows - 2);
    const k = r * g.cols + c;
    if (g.cells[k] !== WALL) continue;
    const horiz = c % 2 === 1 && r % 2 === 0 && g.cells[k - 1] === FREE && g.cells[k + 1] === FREE;
    const vert = r % 2 === 1 && c % 2 === 0 && g.cells[k - g.cols] === FREE && g.cells[k + g.cols] === FREE;
    if (horiz || vert) {
      g.cells[k] = FREE;
      knocked++;
    }
  }
  g.start = (g.rows - 1) * g.cols + 0;
  g.goal = 0 * g.cols + 22;
  return g;
}

export const PRESETS: Preset[] = [
  {
    id: 'wallgap',
    label: 'Wall with a gap',
    note: 'The only way through the wall is the gap at the bottom; a shelf sticks out of the wall at the height of G.',
    build: () => {
      const g = emptyGrid();
      paint(g, 11, 0, 11, 12, WALL); // the wall; the gap is rows 14-15 (bottom)
      paint(g, 5, 7, 11, 7, WALL); // a shelf at G's height: heading straight for G leads into a pocket
      g.start = cellIndex(g, 3, 1);
      g.goal = cellIndex(g, 20, 7);
      return g;
    },
  },
  {
    id: 'mud',
    label: 'Mud across the straight route',
    note: 'A band of mud (×5 cost to enter) across the straight route; going round costs 12 extra steps, wading through costs 16 extra.',
    build: () => {
      const g = emptyGrid();
      paint(g, 10, 2, 13, 12, MUD);
      g.start = cellIndex(g, 3, 7);
      g.goal = cellIndex(g, 20, 7);
      return g;
    },
  },
  {
    id: 'open',
    label: 'Open field',
    note: 'No obstacles: every algorithm finds a path; watch how many cells each one opens to do it.',
    build: () => {
      const g = emptyGrid();
      g.start = cellIndex(g, 3, 11);
      g.goal = cellIndex(g, 20, 3);
      return g;
    },
  },
  {
    id: 'maze',
    label: 'Maze',
    note: 'Corridors with a few loops: the straight-line heuristic is a poor guide here.',
    build: () => mazeGrid(),
  },
  {
    id: 'dfs',
    label: 'DFS wanders',
    note: 'G is three cells to the right of S on an empty map.',
    build: () => {
      const g = emptyGrid();
      g.start = cellIndex(g, 10, 7);
      g.goal = cellIndex(g, 13, 7);
      return g;
    },
  },
  {
    id: 'q25',
    label: '2023 Q25: one diagonal step',
    note: 'G is one diagonal step from the marked cell: Manhattan says 2, the true cost of the diagonal move is √2.',
    build: () => {
      const g = emptyGrid();
      g.start = cellIndex(g, 4, 11);
      g.goal = cellIndex(g, 15, 5);
      return g;
    },
  },
  {
    id: 'block',
    label: 'Block with a diagonal way round',
    note: 'The cheapest route cuts diagonally past the corner of the block. Manhattan prices each diagonal step at 2 instead of √2.',
    build: () => {
      const g = emptyGrid();
      paint(g, 6, 2, 8, 9, WALL);
      g.start = cellIndex(g, 2, 12);
      g.goal = cellIndex(g, 18, 1);
      return g;
    },
  },
  {
    id: 'blank',
    label: 'Blank (draw your own)',
    note: 'An empty map: paint walls and mud, and drag S and G.',
    build: () => emptyGrid(),
  },
];

export const presetById = (id: PresetId) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

/** The probe cell of the 2023 Q25 preset: one diagonal step from G. */
export const Q25_PROBE = (g: Grid) => cellIndex(g, colOf(g, g.goal) - 1, rowOf(g, g.goal) + 1);

// ------------------------------------------------------------------ painting helpers

/** Cells on the straight segment between two cells (Bresenham), so fast drags do not skip cells. */
export function cellsBetween(g: Grid, a: number, b: number): number[] {
  let x0 = colOf(g, a);
  let y0 = rowOf(g, a);
  const x1 = colOf(g, b);
  const y1 = rowOf(g, b);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out: number[] = [];
  for (let guard = 0; guard < 200; guard++) {
    out.push(y0 * g.cols + x0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

/** Round for display: integers stay integers, otherwise one decimal. */
export function fmtCost(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '∞';
  const r = Math.round(x);
  if (Math.abs(x - r) < 1e-9) return String(r);
  return x.toFixed(digits);
}
