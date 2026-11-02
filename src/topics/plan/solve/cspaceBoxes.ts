// C-space labelling problems (plan-cspace): which C-space regions the numbered boxes point at, where the
// boxes sit on the figure (on free space, leaders that cross no other obstacle's region or box), and why
// each answer is what it is. Summary notes §5 "Reading a 2-link arm C-space plot"; 2023 Q26, 2024 Q24,
// 2025 Q25; review deck slide 16. Pure (no React components), so the self-tests can check every instance.
import type { Rng } from '../../../engine/rng';
import { TAU, wrap, type CGrid } from '../../../core/cspace';
import { distToShape, segSeg, shapeCentre, type Shape, type Vec2 } from '../../../core/geom2d';
import {
  EXAM_2023,
  EXAM_2023_BOXES,
  EXAM_2024,
  EXAM_2024_BOXES,
  EXAM_2025,
  EXAM_2025_BOXES,
  REVIEW_A,
  REVIEW_B,
  REVIEW_C,
  analyseRegions,
  armOf,
  cellOf,
  collisionsAt,
  makeCollider,
  obstacleInfo,
  randomWorkspace,
  regionsClean,
  segHits,
  shapeGap,
  tipInside,
  workspaceGrid,
  type Collider,
  type CWorkspace,
  type ObstacleInfo,
  type PaperBox,
  type RegionAnalysis,
} from '../../../core/cspacegen';
import { FR } from '../explore/cspaceDraw';

const P = Math.PI;
/** C-space cells per joint in the labelling figures (2° cells). */
export const NG = 180;
/** Answer box size in SVG units of the C-space frame (the plot itself is FR.S = 312 units wide). */
export const BOX_W = 26;
export const BOX_H = 22;

// ------------------------------------------------------------------ text helpers

/** Angle in units of π, exam style: 0.85\pi, 0.5\pi, \pi, 2\pi, 0. */
export function pt(a: number, dp = 2): string {
  const v = Number((a / P).toFixed(dp));
  if (v === 0) return '0';
  if (v === 1) return '\\pi';
  return `${v}\\pi`;
}
/** Metres to 2 dp. */
export const m2 = (x: number) => x.toFixed(2);
/** Round an angle to 0.01π (the precision the worked solutions quote). */
export const r01 = (a: number) => (Math.round((a / P) * 100) / 100) * P;
/** An interval [a, b] of θ1 (b may exceed 2π when it runs through 0) as TeX. */
export function arcTeX(a: number, b: number): string {
  if (b > TAU + 1e-6) return `[${pt(a)}, 2\\pi] \\cup [0, ${pt(b - TAU)}]`;
  return `[${pt(a)}, ${pt(b)}]`;
}
/** Directions [a, b] from the base (b may exceed 2π) as words with inline TeX. */
export function dirText(d: [number, number]): string {
  if (d[1] > TAU + 1e-6) return `$${pt(d[0])}$ to $${pt(d[1] - TAU)}$ (through $0$)`;
  return `$${pt(d[0])}$ to $${pt(d[1])}$`;
}
export const letterOf = (ws: CWorkspace, o: number) => ws.obstacles[o].label;

// ------------------------------------------------------------------ grid geometry (SVG units of the C-space frame)

/** SVG point of a configuration on the C-space plot. */
export const cfgPx = (t1: number, t2: number): Vec2 => ({ x: FR.L + (wrap(t1) / TAU) * FR.S, y: FR.T + FR.S - (wrap(t2) / TAU) * FR.S });

function cellAtPx(n: number, x: number, y: number): number {
  const i = Math.floor(((x - FR.L) / FR.S) * n);
  const j = Math.floor(((FR.T + FR.S - y) / FR.S) * n);
  if (i < 0 || j < 0 || i >= n || j >= n) return -1;
  return j * n + i;
}

/** Chessboard depth of each cell of a set (distance to the outside; the plot edge counts as outside). */
function depthMap(n: number, cells: readonly number[], inSet: (k: number) => boolean): Int32Array {
  const depth = new Int32Array(n * n);
  const q = new Int32Array(cells.length);
  let t = 0;
  for (const k of cells) {
    const i = k % n;
    const j = (k - i) / n;
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1 || !inSet(k - 1) || !inSet(k + 1) || !inSet(k - n) || !inSet(k + n)) {
      depth[k] = 1;
      q[t++] = k;
    }
  }
  for (let h = 0; h < t; h++) {
    const k = q[h];
    const i = k % n;
    const j = (k - i) / n;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (depth[nk] === 0 && inSet(nk) && t < q.length) {
          depth[nk] = depth[k] + 1;
          q[t++] = nk;
        }
      }
  }
  return depth;
}

/** 8-connected components of a cell predicate on the flat plot (no wrap). */
function flatComponents(n: number, inSet: (k: number) => boolean): number[][] {
  const N = n * n;
  const seen = new Uint8Array(N);
  const out: number[][] = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !inSet(s)) continue;
    const cells = [s];
    seen[s] = 1;
    for (let h = 0; h < cells.length; h++) {
      const k = cells[h];
      const i = k % n;
      const j = (k - i) / n;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const nk = nj * n + ni;
          if (!seen[nk] && inSet(nk)) {
            seen[nk] = 1;
            cells.push(nk);
          }
        }
    }
    out.push(cells);
  }
  return out;
}

/** The smallest arc of columns (or rows) that holds every `on` index, as [start, end] radians (end may exceed 2π). */
export function arcOf(on: readonly boolean[]): [number, number] | null {
  const n = on.length;
  const d = TAU / n;
  if (!on.some(Boolean)) return null;
  if (on.every(Boolean)) return [0, TAU];
  let bestLen = 0;
  let bestEnd = 0;
  for (let s = 0; s < n; s++) {
    if (on[s] || !on[(s - 1 + n) % n]) continue; // s starts a run of empty indices
    let len = 0;
    while (!on[(s + len) % n]) len++;
    if (len > bestLen) {
      bestLen = len;
      bestEnd = (s + len - 1) % n;
    }
  }
  const start = (bestEnd + 1) % n;
  return [start * d, (start + n - bestLen) * d];
}

// ------------------------------------------------------------------ exact checks

/** Obstacles each link touches at (θ1, θ2), from the exact geometry (not the grid). */
export function touching(ws: CWorkspace, cols: readonly Collider[], t1: number, t2: number) {
  const c = collisionsAt(armOf(ws), cols, t1, t2);
  return { link1: c.link1, link2: c.link2, any: [...new Set([...c.link1, ...c.link2])] };
}

export type RegionKind = 'band' | 'bulge' | 'blob';

/** Exactly obstacle o is touched at (t1, t2), by link 1 for a band and by link 2 only otherwise. */
function configOk(ws: CWorkspace, cols: readonly Collider[], t1: number, t2: number, o: number, kind: RegionKind): boolean {
  const c = touching(ws, cols, t1, t2);
  if (c.any.length !== 1 || c.any[0] !== o) return false;
  return kind === 'band' ? c.link1.includes(o) : !c.link1.includes(o) && c.link2.includes(o);
}

// ------------------------------------------------------------------ problems

export interface LabelBox {
  /** Box number on the figure (1-based, left to right). */
  num: number;
  /** Where the pointer touches the region (radians, rounded to 0.01π). */
  t1: number;
  t2: number;
  /** The answer: obstacle index. */
  answer: number;
  kind: RegionKind;
  /** Flat piece (ra.pieces) and torus component (ra.comps) the pointer is on. */
  piece: number;
  comp: number;
  /** Box centre and leader from the pointer tip P to the box edge Q (SVG units of the C-space frame). */
  cx: number;
  cy: number;
  P: Vec2;
  Q: Vec2;
  marks: number;
}

export interface CsProblem {
  ws: CWorkspace;
  g: CGrid;
  ra: RegionAnalysis;
  infos: ObstacleInfo[];
  boxes: LabelBox[];
  /** Arm pose drawn on the workspace (free, like the papers). */
  pose: [number, number];
  exam?: 2023 | 2024 | 2025;
}

interface Tip {
  t1: number;
  t2: number;
}

interface Target {
  o: number;
  kind: RegionKind;
  tips: Tip[];
  main: boolean;
  size: number;
}

const hasLink1 = (g: CGrid, o: number) => {
  for (let i = 0; i < g.n; i++) if (g.link1[i] & (1 << o)) return true;
  return false;
};

/** Up to `max` well-separated deep cells of a set that pass `ok` (as rounded configurations). */
function deepTips(n: number, cells: readonly number[], depth: Int32Array, minDepth: number, ok: (t: Tip, k: number) => boolean, max = 4): Tip[] {
  let ci = 0;
  let cj = 0;
  for (const k of cells) {
    ci += k % n;
    cj += Math.floor(k / n);
  }
  ci /= cells.length;
  cj /= cells.length;
  const d2 = (k: number) => (k % n - ci) ** 2 + (Math.floor(k / n) - cj) ** 2;
  const sorted = cells.filter((k) => depth[k] >= minDepth).sort((a, b) => depth[b] - depth[a] || d2(a) - d2(b));
  if (!sorted.length) return [];
  const floor = Math.max(minDepth, depth[sorted[0]] - 2);
  const out: { t: Tip; k: number }[] = [];
  for (const k of sorted) {
    if (out.length >= max || depth[k] < floor) break;
    if (out.some((q) => Math.max(Math.abs((q.k % n) - (k % n)), Math.abs(Math.floor(q.k / n) - Math.floor(k / n))) < 8)) continue;
    const t = { t1: r01(((k % n) + 0.5) * (TAU / n)), t2: r01((Math.floor(k / n) + 0.5) * (TAU / n)) };
    if (ok(t, k)) out.push({ t, k });
  }
  return out.map((x) => x.t);
}

/** Every region an answer box could point at: bands, link-2 bulges of band obstacles, and blob pieces. */
function findTargets(ws: CWorkspace, g: CGrid, ra: RegionAnalysis, cols: readonly Collider[]): Target[] {
  const n = g.n;
  const N = n * n;
  const out: Target[] = [];
  for (let o = 0; o < ws.obstacles.length; o++) {
    const b = 1 << o;
    const fl = ra.flat[o];
    const cellsOf = new Map<number, number[]>();
    for (let k = 0; k < N; k++) {
      const id = fl[k];
      if (id < 0) continue;
      let a = cellsOf.get(id);
      if (!a) cellsOf.set(id, (a = []));
      a.push(k);
    }
    const pieces = ra.pieces.map((p, id) => ({ p, id })).filter((x) => x.p.obstacle === o);
    const mine: Target[] = [];
    // pure cells at least 2 deep, rounded configuration still touching only this obstacle the right way
    const okFor = (kind: RegionKind) => (t: Tip, k: number) => g.hit[k] === b && g.hit[cellOf(n, t.t1, t.t2)] === b && configOk(ws, cols, t.t1, t.t2, o, kind);
    if (hasLink1(g, o)) {
      // bands: pointers down the middle column of each band piece, at several heights
      for (const { p, id } of pieces.filter((x) => x.p.link1).sort((x, y) => y.p.cells - x.p.cells)) {
        const colsOn: number[] = [];
        for (let i = p.i0; i <= p.i1; i++) if (g.link1[i] & b && fl[i] === id) colsOn.push(i);
        if (colsOn.length < 4) continue;
        const mid = colsOn[Math.floor(colsOn.length / 2)];
        const tips: Tip[] = [];
        for (const f of [0.5, 0.32, 0.68, 0.18, 0.82, 0.42, 0.58, 0.1, 0.9]) {
          const j = Math.min(n - 3, Math.max(2, Math.floor(f * n)));
          const k = j * n + mid;
          const t = { t1: r01((mid + 0.5) * (TAU / n)), t2: r01((j + 0.5) * (TAU / n)) };
          if (okFor('band')(t, k)) tips.push(t);
        }
        if (tips.length) mine.push({ o, kind: 'band', tips, main: false, size: p.cells });
      }
      // link-2 regions of a band obstacle: bulges beside the band, or its continuation through a wrap
      const inB2 = (k: number) => g.hit[k] === b && !(g.link1[k] & b);
      for (const cells of flatComponents(n, inB2)) {
        if (cells.length < 0.0025 * N) continue;
        const depth = depthMap(n, cells, inB2);
        const tips = deepTips(n, cells, depth, 3, okFor('bulge'));
        if (tips.length) mine.push({ o, kind: 'bulge', tips, main: false, size: cells.length });
      }
      const band = mine.find((t) => t.kind === 'band');
      if (band) band.main = true;
    } else {
      for (const { p, id } of pieces.sort((x, y) => y.p.cells - x.p.cells)) {
        if (p.cells < 0.002 * N) continue;
        const cells = cellsOf.get(id)!;
        const depth = depthMap(n, cells, (k) => fl[k] === id);
        const tips = deepTips(n, cells, depth, 3, okFor('blob'));
        if (tips.length) mine.push({ o, kind: 'blob', tips, main: false, size: p.cells });
      }
      if (mine.length) mine[0].main = true;
    }
    if (!mine.some((t) => t.main) && mine.length) mine.sort((x, y) => y.size - x.size)[0].main = true;
    out.push(...mine);
  }
  return out;
}

// ------------------------------------------------------------------ box placement

interface Cand {
  tip: Tip;
  P: Vec2;
  cx: number;
  cy: number;
  Q: Vec2;
  score: number;
}

function rectFree(g: CGrid, x0: number, y0: number, x1: number, y1: number): boolean {
  const n = g.n;
  const i0 = Math.max(0, Math.floor(((x0 - FR.L) / FR.S) * n));
  const i1 = Math.min(n - 1, Math.floor(((x1 - FR.L) / FR.S) * n));
  const j0 = Math.max(0, Math.floor(((FR.T + FR.S - y1) / FR.S) * n));
  const j1 = Math.min(n - 1, Math.floor(((FR.T + FR.S - y0) / FR.S) * n));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (g.hit[j * n + i]) return false;
  return true;
}

/** The leader crosses no cell of another obstacle. */
function leaderOk(g: CGrid, A: Vec2, B: Vec2, own: number): boolean {
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  const steps = Math.max(1, Math.ceil(L / ((FR.S / g.n) * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const k = cellAtPx(g.n, A.x + ((B.x - A.x) * s) / steps, A.y + ((B.y - A.y) * s) / steps);
    if (k >= 0 && g.hit[k] & ~own) return false;
  }
  return true;
}

/** Does segment AB pass within `pad` of the box centred at (cx, cy)? (Liang–Barsky clip.) */
function segHitsBox(A: Vec2, B: Vec2, cx: number, cy: number, pad: number): boolean {
  const x0 = cx - BOX_W / 2 - pad;
  const x1 = cx + BOX_W / 2 + pad;
  const y0 = cy - BOX_H / 2 - pad;
  const y1 = cy + BOX_H / 2 + pad;
  let t0 = 0;
  let t1 = 1;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, A.x - x0) && clip(dx, x1 - A.x) && clip(-dy, A.y - y0) && clip(dy, y1 - A.y) && t0 <= t1;
}

function candidatesFor(g: CGrid, t: Target): Cand[] {
  const own = 1 << t.o;
  const out: Cand[] = [];
  t.tips.forEach((tip, ti) => {
    const A = cfgPx(tip.t1, tip.t2);
    for (let ai = 0; ai < 24; ai++) {
      const a = (ai * P) / 12;
      let found = 0;
      for (const r of [27, 34, 43, 54, 67, 82, 100]) {
        const cx = A.x + r * Math.cos(a);
        const cy = A.y + r * Math.sin(a);
        const x0 = cx - BOX_W / 2;
        const x1 = cx + BOX_W / 2;
        const y0 = cy - BOX_H / 2;
        const y1 = cy + BOX_H / 2;
        if (x0 < FR.L + 2 || x1 > FR.L + FR.S - 2 || y0 < FR.T + 2 || y1 > FR.T + FR.S - 2) continue;
        if (!rectFree(g, x0 - 3, y0 - 3, x1 + 3, y1 + 3)) continue;
        const Q = { x: Math.min(x1, Math.max(x0, A.x)), y: Math.min(y1, Math.max(y0, A.y)) };
        if (!leaderOk(g, A, Q, own)) continue;
        // short leaders first; slightly prefer the first (deepest / middle) tip and level leaders, like the papers
        const len = Math.hypot(Q.x - A.x, Q.y - A.y);
        out.push({ tip, P: A, cx, cy, Q, score: len + 5 * ti + 4 * Math.abs(Math.sin(a)) });
        if (++found >= 2) break;
      }
    }
  });
  return out.sort((x, y) => x.score - y.score).slice(0, 48);
}

function compatible(a: Cand, b: Cand): boolean {
  if (Math.abs(a.cx - b.cx) < BOX_W + 6 && Math.abs(a.cy - b.cy) < BOX_H + 6) return false;
  if (segHitsBox(a.P, a.Q, b.cx, b.cy, 3) || segHitsBox(b.P, b.Q, a.cx, a.cy, 3)) return false;
  if (segSeg(a.P, a.Q, b.P, b.Q)) return false;
  return Math.hypot(a.P.x - b.P.x, a.P.y - b.P.y) >= 14;
}

/** One box per target, all compatible (depth-first over the best candidates, most constrained first). */
function placeBoxes(g: CGrid, targets: readonly Target[]): Cand[] | null {
  const lists = targets.map((t) => candidatesFor(g, t));
  if (lists.some((l) => !l.length)) return null;
  const order = targets.map((_, i) => i).sort((a, b) => lists[a].length - lists[b].length);
  const chosen: (Cand | null)[] = targets.map(() => null);
  let budget = 6000;
  const dfs = (d: number): boolean => {
    if (d === order.length) return true;
    const ti = order[d];
    for (const c of lists[ti]) {
      if (--budget < 0) return false;
      let ok = true;
      for (let e = 0; e < d && ok; e++) ok = compatible(chosen[order[e]]!, c);
      if (!ok) continue;
      chosen[ti] = c;
      if (dfs(d + 1)) return true;
      chosen[ti] = null;
    }
    return false;
  };
  return dfs(0) ? (chosen as Cand[]) : null;
}

// ------------------------------------------------------------------ building problems

const POSES: [number, number][] = [
  [0.38, 0.1],
  [0.3, 0.12],
  [0.45, 0.1],
  [0.55, 0.12],
  [0.22, 0.15],
  [0.65, 0.1],
  [1.1, 0.12],
  [1.35, 0.1],
  [1.6, 0.12],
  [1.85, 0.1],
  [0.38, 1.88],
  [0.8, 0.15],
  [0.05, 0.2],
];

/** A collision-free arm pose (with a margin) to draw on the workspace, shared by every workspace given. */
export function freePose(...wss: CWorkspace[]): [number, number] {
  const sets = wss.map((ws) => ({ arm: armOf(ws), cols: ws.obstacles.map((o) => makeCollider(o.shape)) }));
  for (const [a, b] of POSES) {
    const t1 = a * P;
    const t2 = b * P;
    let ok = true;
    for (const { arm, cols } of sets)
      for (const d1 of [-0.07, 0, 0.07])
        for (const d2 of [-0.1, 0, 0.1]) {
          const c = collisionsAt(arm, cols, t1 + d1, t2 + d2);
          if (c.link1.length || c.link2.length) ok = false;
        }
    if (ok) return [t1, t2];
  }
  return [0.38 * P, 0.1 * P];
}

function assemble(ws: CWorkspace, g: CGrid, ra: RegionAnalysis, targets: readonly Target[], cands: readonly Cand[], marks: number[], exam?: 2023 | 2024 | 2025): CsProblem {
  const n = g.n;
  const boxes: LabelBox[] = targets.map((t, i) => {
    const c = cands[i];
    const k = cellOf(n, c.tip.t1, c.tip.t2);
    return { num: 0, t1: c.tip.t1, t2: c.tip.t2, answer: t.o, kind: t.kind, piece: ra.flat[t.o][k], comp: ra.torus[t.o][k], cx: c.cx, cy: c.cy, P: c.P, Q: c.Q, marks: marks[i] };
  });
  // number left to right (then top to bottom), like reading the figure
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].cx - boxes[b].cx || boxes[a].cy - boxes[b].cy);
  const sorted = order.map((i, r) => ({ ...boxes[i], num: r + 1 }));
  return { ws, g, ra, infos: ws.obstacles.map((o) => obstacleInfo(ws, o.shape)), boxes: sorted, pose: freePose(ws), exam };
}

/** A labelling problem on a given workspace with `want` boxes (at least `min`), or null if the boxes do not fit. */
export function labelProblemFor(rng: Rng, ws: CWorkspace, want: number, min: number): CsProblem | null {
  const g = workspaceGrid(ws, NG);
  const ra = analyseRegions(g, ws.obstacles.length);
  const cols = ws.obstacles.map((o) => makeCollider(o.shape));
  const targets = findTargets(ws, g, ra, cols);
  const mains = ws.obstacles.map((_, o) => targets.find((t) => t.o === o && t.main));
  if (mains.some((t) => !t)) return null;
  const extras = targets.filter((t) => !t.main);
  for (let k = want; k >= min; k--) {
    for (let tries = 0; tries < 3; tries++) {
      const chosen: Target[] = mains.map((t) => t!);
      for (const t of rng.shuffle(extras)) {
        if (chosen.length >= k) break;
        if (chosen.filter((c) => c.o === t.o).length >= 2) continue;
        chosen.push(t);
      }
      if (chosen.length < min) return null;
      const cands = placeBoxes(g, chosen);
      if (cands) return assemble(ws, g, ra, chosen, cands, chosen.map(() => 1));
      if (chosen.length < k) break; // nothing else to vary
    }
  }
  return null;
}

/** Random exam-like labelling problem: tier 1 two obstacles (a band and a blob), tier 2 three like the papers. */
export function randomLabelProblem(rng: Rng, tier: 1 | 2): CsProblem {
  for (let attempt = 0; attempt < 30; attempt++) {
    const ws =
      tier === 1
        ? randomWorkspace(rng, { count: 2, inside: 1 })
        : randomWorkspace(rng, { count: 3, inside: rng.pick([0, 1, 1, 2, 2, 2]) });
    const want = tier === 1 ? 4 : rng.pick([4, 5]);
    const pr = labelProblemFor(rng, ws, want, tier === 1 ? 3 : 4);
    if (pr) return pr;
  }
  return examLabelProblem(2024);
}

// ------------------------------------------------------------------ the papers' own figures

export const EXAM_SETS = {
  2023: { ws: EXAM_2023, boxes: EXAM_2023_BOXES, marks: 5, q: 'Q26' },
  2024: { ws: EXAM_2024, boxes: EXAM_2024_BOXES, marks: 4, q: 'Q24' },
  2025: { ws: EXAM_2025, boxes: EXAM_2025_BOXES, marks: 3, q: 'Q25' },
} as const;

/**
 * Move a paper pointer (read off the printed figure) to the nearest cell that is unambiguously the keyed
 * obstacle (pure, one cell deep, exact geometry agrees), so a slightly misread pointer cannot mislead.
 */
export function snapPaperBox(ws: CWorkspace, g: CGrid, cols: readonly Collider[], b: PaperBox): { o: number; kind: RegionKind; tip: Tip; moved: number } | null {
  const n = g.n;
  const o = ws.obstacles.findIndex((x) => x.label === b.answer);
  if (o < 0) return null;
  const bit = 1 << o;
  const band1 = hasLink1(g, o);
  const k0 = cellOf(n, b.t1 * P, b.t2 * P);
  const i0 = k0 % n;
  const j0 = (k0 - i0) / n;
  let best: { o: number; kind: RegionKind; tip: Tip; moved: number } | null = null;
  for (let dj = -10; dj <= 10; dj++)
    for (let di = -10; di <= 10; di++) {
      const i = i0 + di;
      const j = j0 + dj;
      if (i < 1 || j < 1 || i > n - 2 || j > n - 2) continue;
      const k = j * n + i;
      if (g.hit[k] !== bit) continue;
      let pure = true;
      for (let a = -1; a <= 1 && pure; a++) for (let c = -1; c <= 1 && pure; c++) pure = g.hit[k + a * n + c] === bit;
      if (!pure) continue;
      const kind: RegionKind = g.link1[k] & bit ? 'band' : band1 ? 'bulge' : 'blob';
      const tip = { t1: r01((i + 0.5) * (TAU / n)), t2: r01((j + 0.5) * (TAU / n)) };
      if (g.hit[cellOf(n, tip.t1, tip.t2)] !== bit || !configOk(ws, cols, tip.t1, tip.t2, o, kind)) continue;
      const moved = Math.hypot(di, dj);
      if (!best || moved < best.moved) best = { o, kind, tip, moved };
    }
  return best;
}

const examCache = new Map<number, CsProblem>();

/** The 2023 / 2024 / 2025 paper question, with the paper's own boxes. */
export function examLabelProblem(year: 2023 | 2024 | 2025): CsProblem {
  const hit = examCache.get(year);
  if (hit) return hit;
  const set = EXAM_SETS[year];
  const ws = set.ws;
  const g = workspaceGrid(ws, NG);
  const ra = analyseRegions(g, ws.obstacles.length);
  const cols = ws.obstacles.map((o) => makeCollider(o.shape));
  const targets: Target[] = set.boxes.map((b) => {
    const s = snapPaperBox(ws, g, cols, b);
    if (!s) throw new Error(`plan-cspace: ${year} box ${b.where} is not on ${b.answer}`);
    return { o: s.o, kind: s.kind, tips: [s.tip], main: false, size: 0 };
  });
  const cands = placeBoxes(g, targets);
  if (!cands) throw new Error(`plan-cspace: the ${year} boxes do not fit`);
  const each = set.marks / set.boxes.length;
  const pr = assemble(ws, g, ra, targets, cands, targets.map(() => each), year);
  examCache.set(year, pr);
  return pr;
}

// ------------------------------------------------------------------ describing regions

export interface ObstacleRegion {
  /** Link 1 can hit it (crosses the dashed circle): full-height band(s). */
  band: boolean;
  /** θ1 ranges of the band(s) (end may exceed 2π). */
  bands: [number, number][];
  /** θ1 extent of the whole region (end may exceed 2π). */
  t1: [number, number];
  /** θ2 extent of the whole region (end may exceed 2π: it wraps through θ2 = 0). */
  t2: [number, number];
  /** The region runs off the top edge and continues at the bottom (θ2 = 2π ≡ 0). */
  wrapsT2: boolean;
  /** The region runs off the right edge and continues at the left (θ1 = 2π ≡ 0). */
  wrapsT1: boolean;
}

/** Circular runs of `on` as [start, end] radians (end may exceed 2π for a run through 0). */
function runsOf(on: readonly boolean[]): [number, number][] {
  const n = on.length;
  const d = TAU / n;
  if (!on.some(Boolean)) return [];
  if (on.every(Boolean)) return [[0, TAU]];
  let s0 = 0;
  while (on[s0]) s0++; // start scanning at an empty index so a run through 0 comes out whole
  const out: [number, number][] = [];
  let start = -1;
  for (let q = 1; q <= n; q++) {
    const i = (s0 + q) % n;
    if (on[i] && start < 0) start = s0 + q;
    if (!on[i] && start >= 0) {
      const a = (start % n) * d;
      out.push([a, a + (s0 + q - start) * d]);
      start = -1;
    }
  }
  return out;
}

/** θ1 samples for the exact extents (0.001π apart, so quoted ranges are not off by a grid cell). */
const EXACT_SAMPLES = 2000;
const regionCache = new WeakMap<CGrid, Map<number, ObstacleRegion>>();

/**
 * The region of obstacle o. θ1 extents are exact: a θ1 column is blocked by link 1 when the segment
 * base → elbow touches the obstacle, and holds some collision at all when, in addition, the disc of radius
 * L2 round the elbow reaches it (link 2 sweeps that disc as θ2 turns). Wrap flags come from the grid.
 */
export function obstacleRegion(ws: CWorkspace, g: CGrid, ra: RegionAnalysis, o: number): ObstacleRegion {
  let per = regionCache.get(g);
  if (!per) regionCache.set(g, (per = new Map()));
  const hit = per.get(o);
  if (hit) return hit;
  const arm = armOf(ws);
  const s = ws.obstacles[o].shape;
  const c = makeCollider(s);
  const l1On: boolean[] = [];
  const anyOn: boolean[] = [];
  for (let k = 0; k < EXACT_SAMPLES; k++) {
    const t = ((k + 0.5) / EXACT_SAMPLES) * TAU;
    const ex = arm.base.x + arm.l1 * Math.cos(t);
    const ey = arm.base.y + arm.l1 * Math.sin(t);
    const h1 = segHits(arm.base.x, arm.base.y, ex, ey, c);
    l1On.push(h1);
    anyOn.push(h1 || distToShape({ x: ex, y: ey }, s) <= arm.l2);
  }
  const n = g.n;
  const b = 1 << o;
  const rowOn = new Array<boolean>(n).fill(false);
  for (let k = 0; k < n * n; k++) if (g.hit[k] & b) rowOn[Math.floor(k / n)] = true;
  const comps = ra.comps.filter((q) => q.obstacle === o);
  const pcs = (q: (typeof comps)[number]) => q.pieces.map((id) => ra.pieces[id]);
  const wrapsT2 = comps.some((q) => pcs(q).some((p) => p.touches.top) && pcs(q).some((p) => p.touches.bottom));
  const wrapsT1 = comps.some((q) => pcs(q).some((p) => p.touches.left) && pcs(q).some((p) => p.touches.right));
  const bands = runsOf(l1On);
  const r: ObstacleRegion = { band: bands.length > 0, bands, t1: arcOf(anyOn) ?? [0, 0], t2: arcOf(rowOn) ?? [0, 0], wrapsT2, wrapsT1 };
  per.set(o, r);
  return r;
}

/** Short phrase for an obstacle's region, e.g. "a full-height band, θ1 ∈ [1.25π, 1.5π]". */
export function regionPhrase(ws: CWorkspace, g: CGrid, ra: RegionAnalysis, o: number): string {
  const r = obstacleRegion(ws, g, ra, o);
  if (r.band) return `a full-height band, ${r.bands.map(([a, b]) => `$\\theta_1 \\in ${arcTeX(a, b)}$`).join(' and ')}`;
  return `an isolated link-2 blob at $\\theta_1 \\in ${arcTeX(r.t1[0], r.t1[1])}$`;
}

/** Circular distance from θ1 to an interval (0 inside it). */
function arcDist(t: number, [a, b]: [number, number]): number {
  if ((t >= a && t <= b) || (t + TAU >= a && t + TAU <= b)) return 0;
  const d = (x: number, y: number) => Math.abs(((x - y + 3 * P) % TAU) - P);
  return Math.min(d(t, a), d(t, b));
}
/** " This piece runs off the right edge and continues at the left edge (θ1 = 2π ≡ 0)." when the box's piece is cut by a plot edge. */
export function wrapNote(p: CsProblem, b: LabelBox): string {
  const piece = p.ra.pieces[b.piece];
  const comp = p.ra.comps[b.comp];
  if (!piece || !comp || comp.pieces.length < 2) return '';
  const others = comp.pieces.filter((id) => id !== b.piece).map((id) => p.ra.pieces[id]);
  const t = piece.touches;
  if ((t.left && others.some((q) => q.touches.right)) || (t.right && others.some((q) => q.touches.left))) {
    const [from, to] = t.right && others.some((q) => q.touches.left) ? ['right', 'left'] : ['left', 'right'];
    return ` This piece runs off the ${from} edge and continues at the ${to} edge ($\\theta_1 = 2\\pi \\equiv 0$): one region.`;
  }
  if ((t.top && others.some((q) => q.touches.bottom)) || (t.bottom && others.some((q) => q.touches.top))) {
    const [from, to] = t.top && others.some((q) => q.touches.bottom) ? ['top', 'bottom'] : ['bottom', 'top'];
    return ` This piece runs off the ${from} edge and continues at the ${to} edge ($\\theta_2 = 2\\pi \\equiv 0$): one region, two pieces.`;
  }
  return '';
}

/** The band nearest to θ1 (the one a box on it, or on its bulge, belongs to). */
const nearestBand = (bands: [number, number][], t1: number) => bands.slice().sort((x, y) => arcDist(t1, x) - arcDist(t1, y))[0];

/** Forward kinematics at a configuration, worded like the worked solutions' "check one point". */
export function fkCheck(ws: CWorkspace, t1: number, t2: number, o: number): string {
  const arm = armOf(ws);
  const cols = ws.obstacles.map((x) => makeCollider(x.shape));
  const ex = arm.base.x + arm.l1 * Math.cos(t1);
  const ey = arm.base.y + arm.l1 * Math.sin(t1);
  const tx = ex + arm.l2 * Math.cos(t1 + t2);
  const ty = ey + arm.l2 * Math.sin(t1 + t2);
  const X = letterOf(ws, o);
  const c = touching(ws, cols, t1, t2);
  const head = `At $(\\theta_1, \\theta_2) = (${pt(t1)}, ${pt(t2)})$ the elbow is at $(${arm.base.x}, ${arm.base.y}) + ${m2(arm.l1)}(\\cos ${pt(t1)}, \\sin ${pt(t1)}) = (${m2(ex)}, ${m2(ey)})$`;
  if (c.link1.includes(o)) return `${head}, so link 1 (base to elbow) runs through ${X}.`;
  const abs = `link 2 points at $\\theta_1 + \\theta_2 = ${pt(wrap(t1 + t2))}$`;
  if (tipInside(arm, ws.obstacles[o].shape, t1, t2, 0)) return `${head}; ${abs}, so the tip is at $(${m2(tx)}, ${m2(ty)})$, inside ${X}.`;
  return `${head}; ${abs} and runs to the tip at $(${m2(tx)}, ${m2(ty)})$, through ${X}.`;
}

/** Why box b is obstacle b.answer (Rich, this instance's numbers). */
export function boxWhy(p: CsProblem, b: LabelBox): string {
  const X = letterOf(p.ws, b.answer);
  const inf = p.infos[b.answer];
  const reg = obstacleRegion(p.ws, p.g, p.ra, b.answer);
  const L1 = m2(p.ws.l1);
  let s: string;
  if (b.kind === 'band') {
    const band = nearestBand(reg.bands, b.t1);
    s = `Box ${b.num} is on a full-height band, $\\theta_1 \\in ${arcTeX(band[0], band[1])}$. ${X} crosses the dashed circle (nearest point ${m2(inf.dNear)} m from the base, less than $L_1$ = ${L1} m) in directions ${dirText(inf.dir)}, so with link 1 pointing that way the arm hits ${X} whatever $\\theta_2$ is.`;
  } else if (b.kind === 'bulge') {
    const piece = p.ra.pieces[b.piece];
    const comp = p.ra.comps[b.comp];
    const nb = nearestBand(reg.bands, b.t1);
    const bandText = nb ? `$${arcTeX(nb[0], nb[1])}$` : '';
    if (piece && piece.link1)
      s = `Box ${b.num} is on a bulge beside ${X}'s band ($\\theta_1 \\in$ ${bandText}): at $\\theta_1 = ${pt(b.t1)}$ link 1 just misses ${X}, but link 2, bent by $\\theta_2 = ${pt(b.t2)}$, swings into it. A bulge belongs to the band it is attached to.`;
    else if (comp && comp.link1)
      s = `Box ${b.num} is on ${X}'s region where it continues past the edge of the plot ($\\theta = 2\\pi \\equiv 0$): it joins ${X}'s band ($\\theta_1 \\in$ ${bandText}) on the torus. Link 1 misses ${X} at $\\theta_1 = ${pt(b.t1)}$, but link 2, bent by $\\theta_2 = ${pt(b.t2)}$, folds back into it.`;
    else
      s = `Box ${b.num} is on a link-2 region of ${X}: at $\\theta_1 = ${pt(b.t1)}$ link 1 misses ${X}, but link 2, bent by $\\theta_2 = ${pt(b.t2)}$, reaches it.`;
  } else {
    const near0 = Math.min(b.t2, TAU - b.t2) < 0.3 * P;
    const aim =
      arcDist(b.t1, inf.dir) < 0.12 * P
        ? `with link 1 pointing roughly at it: $\\theta_1 = ${pt(b.t1)}$, and ${X} lies in directions ${dirText(inf.dir)}`
        : `here link 1 points at $\\theta_1 = ${pt(b.t1)}$, off to the side of ${X} (directions ${dirText(inf.dir)}), and link 2, bent by $\\theta_2 = ${pt(b.t2)}$, swings into it`;
    s = `Box ${b.num} is on an isolated blob${near0 ? ' near $\\theta_2 \\approx 0 \\equiv 2\\pi$ (arm nearly straight)' : ''}. ${X} is outside the dashed circle (nearest point ${m2(inf.dNear)} m from the base, more than $L_1$ = ${L1} m), so only link 2 can reach it, ${aim}.${wrapNote(p, b)}`;
  }
  return `${s} Check: ${fkCheck(p.ws, b.t1, b.t2, b.answer)}`;
}

/** What a box points at, in a few words (worked-solution list). */
export function kindLabel(p: CsProblem, b: LabelBox): string {
  if (b.kind === 'band') return 'full-height band';
  if (b.kind === 'blob') return 'isolated blob';
  const piece = p.ra.pieces[b.piece];
  const comp = p.ra.comps[b.comp];
  if (piece && piece.link1) return 'bulge on the side of a band';
  if (comp && comp.link1) return 'a band’s region continued across the plot edge';
  return 'link-2 region of a band obstacle';
}

/** Why a wrong pick is wrong, then why the answer is right. The trap applies when the pick makes the other kind of region. */
export function boxWrong(p: CsProblem, b: LabelBox, pick: number): { text: string; trapId?: string } {
  const Y = letterOf(p.ws, pick);
  const iy = obstacleRegion(p.ws, p.g, p.ra, pick);
  const yText = iy.band
    ? `${Y} crosses the dashed circle, so its region is ${regionPhrase(p.ws, p.g, p.ra, pick)}`
    : `${Y} is outside the dashed circle, so its region is ${regionPhrase(p.ws, p.g, p.ra, pick)}`;
  const confused = b.kind === 'blob' ? iy.band : !iy.band;
  return { text: `Not ${Y}: ${yText}, which does not reach this box's pointer at $(${pt(b.t1)}, ${pt(b.t2)})$. ${boxWhy(p, b)}`, trapId: confused ? 'cspace-band-blob' : undefined };
}

/** Exam-style summary line per obstacle (worked solutions). */
export function obstacleLine(p: CsProblem, o: number): string {
  const X = letterOf(p.ws, o);
  const inf = p.infos[o];
  const r = obstacleRegion(p.ws, p.g, p.ra, o);
  if (r.band)
    return `**${X}**: nearest point ${m2(inf.dNear)} m from the base $< L_1$, directions ${dirText(inf.dir)}. Link 1 hits it: a full-height band, ${r.bands.map(([a, b]) => `$\\theta_1 \\in ${arcTeX(a, b)}$`).join(' and ')}, with link-2 bulges at its sides.`;
  return `**${X}**: nearest point ${m2(inf.dNear)} m from the base $> L_1$, directions ${dirText(inf.dir)}. Only link 2 reaches it: an isolated blob at $\\theta_1 \\in ${arcTeX(r.t1[0], r.t1[1])}$${r.wrapsT2 ? ', running off the top edge and back in at the bottom (one region)' : ''}.`;
}

/** Where a box points, without the answer (substitution hint). */
export function boxClue(p: CsProblem, b: LabelBox): string {
  const at = `$(\\theta_1, \\theta_2) \\approx (${pt(b.t1)}, ${pt(b.t2)})$`;
  const reg = obstacleRegion(p.ws, p.g, p.ra, b.answer);
  if (b.kind === 'band') {
    const band = nearestBand(reg.bands, b.t1);
    return `Box ${b.num} at ${at}: a full-height band over $\\theta_1 \\in ${arcTeX(band[0], band[1])}$, so an obstacle that crosses the circle in those directions.`;
  }
  if (b.kind === 'bulge') {
    const nb = nearestBand(reg.bands, b.t1);
    const band = `the full-height band over $\\theta_1 \\in ${arcTeX(nb[0], nb[1])}$`;
    const piece = p.ra.pieces[b.piece];
    const comp = p.ra.comps[b.comp];
    if (piece && piece.link1) return `Box ${b.num} at ${at}: not full height, but attached to the side of ${band}: a link-2 bulge, so the same obstacle as that band.`;
    if (piece && comp && comp.link1) {
      const t = piece.touches;
      const edge = t.left ? 'left' : t.right ? 'right' : t.top ? 'top' : 'bottom';
      const glue = edge === 'left' || edge === 'right' ? '$\\theta_1 = 0 \\equiv 2\\pi$' : '$\\theta_2 = 0 \\equiv 2\\pi$';
      return `Box ${b.num} at ${at}: looks isolated, but it runs off the ${edge} edge of the plot, and ${glue}: follow it across to ${band}. Same region, so the same obstacle.`;
    }
    return `Box ${b.num} at ${at}: not full height, so link 2 hits here; link 1 points at $\\theta_1 \\approx ${pt(b.t1)}$, just past an obstacle that also makes ${band}.`;
  }
  const wrap = wrapNote(p, b);
  if (wrap.includes('\\theta_1'))
    return `Box ${b.num} at ${at}: an isolated region, not full height, so an obstacle outside the circle.${wrap} Read its $\\theta_1$ from the whole region (both edges) and look for an obstacle in that direction from the base.`;
  return `Box ${b.num} at ${at}: an isolated region, not full height, so an obstacle outside the circle; link 1 points roughly at it, so look for an obstacle in the direction $\\theta_1 \\approx ${pt(b.t1)}$ from the base.${wrap}`;
}

// ------------------------------------------------------------------ tier 3: match workspaces to C-space plots

export interface MatchProblem {
  /** Workspaces A, B, C in display order. */
  wss: CWorkspace[];
  grids: CGrid[];
  ras: RegionAnalysis[];
  /** Plain-word name of every obstacle (no letters on these figures). */
  names: string[][];
  /** Workspace w is drawn as C-space plot plotOf[w] (0-based). */
  plotOf: number[];
  pose: [number, number];
  deck: boolean;
}

const COMPASS = ['to the right of', 'to the upper right of', 'above', 'to the upper left of', 'to the left of', 'to the lower left of', 'below', 'to the lower right of'];

/** "the block below the base", from the direction of the obstacle's centre. */
export function obstacleName(ws: CWorkspace, s: Shape): string {
  const c = shapeCentre(s);
  const a = wrap(Math.atan2(c.y - ws.base.y, c.x - ws.base.x));
  return `the block ${COMPASS[Math.round(a / (P / 4)) % 8]} the base`;
}

const snapHalf = (v: number) => Math.round(v * 2) / 2;
type Rect = { kind: 'rect'; x: number; y: number; w: number; h: number };

/** Axis-aligned block whose near side faces the base at distance ≈ dn in direction phi. */
function blockToward(phi: number, dn: number, w: number, h: number): Rect {
  const qx = 5 + dn * Math.cos(phi);
  const qy = 5 + dn * Math.sin(phi);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  if (Math.abs(c) >= Math.abs(s)) return { kind: 'rect', x: snapHalf(c > 0 ? qx : qx - w), y: snapHalf(qy - h / 2), w, h };
  return { kind: 'rect', x: snapHalf(qx - w / 2), y: snapHalf(s > 0 ? qy : qy - h), w, h };
}

/** The same block stretched towards the base by `by` metres. */
function stretchToBase(r: Rect, phi: number, by: number): Rect {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  if (Math.abs(c) >= Math.abs(s)) return c > 0 ? { ...r, x: r.x - by, w: r.w + by } : { ...r, w: r.w + by };
  return s > 0 ? { ...r, y: r.y - by, h: r.h + by } : { ...r, h: r.h + by };
}

const inBounds = (s: Rect) => s.x >= 0 && s.y >= 0 && s.x + s.w <= 10 && s.y + s.h <= 10;
const BASE: Vec2 = { x: 5, y: 5 };

function insideOk(s: Rect, l1: number) {
  const d = distToShape(BASE, s);
  return inBounds(s) && d >= 0.7 && d <= l1 - 0.4;
}
function outsideOk(s: Rect, l1: number, l2: number) {
  const d = distToShape(BASE, s);
  return inBounds(s) && d >= l1 + 0.35 && d <= l1 + l2 - 0.55;
}

/** The deck's triple (slide 16): workspace A ↔ plot 1, B ↔ plot 3, C ↔ plot 2. */
function deckMatch(): MatchProblem {
  const wss = [REVIEW_A, REVIEW_B, REVIEW_C];
  return finishMatch(wss, [0, 2, 1], true);
}

function finishMatch(wss: CWorkspace[], plotOf: number[], deck: boolean): MatchProblem {
  const grids = wss.map((ws) => workspaceGrid(ws, NG));
  return {
    wss,
    grids,
    ras: grids.map((g, w) => analyseRegions(g, wss[w].obstacles.length)),
    names: wss.map((ws) => ws.obstacles.map((o) => obstacleName(ws, o.shape))),
    plotOf,
    pose: freePose(...wss),
    deck,
  };
}

/**
 * A deck-style triple: a shared block S inside the circle (a band in every plot), a probe block P that is
 * out of reach of link 1 in two workspaces (a blob) and stretched across the circle in the third (a band),
 * and an extra block E in one workspace. Telling them apart needs exactly the band/blob rule.
 */
export function randomMatch(rng: Rng): MatchProblem {
  for (let attempt = 0; attempt < 120; attempt++) {
    const [l1, l2] = rng.pick([
      [2.5, 2],
      [3, 1.5],
      [2 * Math.SQRT2, 2],
      [3, 2],
    ] as [number, number][]);
    const phiS = rng.uniform(0, TAU);
    const sgn = rng.chance(0.5) ? 1 : -1;
    const phiP = phiS + sgn * ((2 * P) / 3 + rng.uniform(-0.12, 0.12) * P);
    const phiE = phiS - sgn * ((2 * P) / 3 + rng.uniform(-0.12, 0.12) * P);
    const S = blockToward(phiS, rng.uniform(0.9, l1 - 0.6), rng.pick([1, 1.5]), rng.pick([1, 1.5]));
    const Pout = blockToward(phiP, rng.uniform(l1 + 0.45, l1 + l2 - 0.7), rng.pick([1.5, 2]), rng.pick([1, 1.5]));
    const eInside = rng.chance(0.6);
    const E = eInside
      ? blockToward(phiE, rng.uniform(0.9, l1 - 0.6), rng.pick([1, 1.5]), rng.pick([1, 1.5]))
      : blockToward(phiE, rng.uniform(l1 + 0.45, l1 + l2 - 0.7), rng.pick([1, 1.5]), rng.pick([1, 1.5]));
    if (!insideOk(S, l1) || !outsideOk(Pout, l1, l2) || !(eInside ? insideOk(E, l1) : outsideOk(E, l1, l2))) continue;
    let Pin: Rect | null = null;
    for (let by = 0.5; by <= 3 && !Pin; by += 0.5) {
      const s = stretchToBase(Pout, phiP, by);
      const d = distToShape(BASE, s);
      if (inBounds(s) && d >= Math.max(0.8, l1 - 1.4) && d <= l1 - 0.45) Pin = s;
    }
    if (!Pin) continue;
    if (shapeGap(S, E) < 0.6 || shapeGap(S, Pin) < 0.6 || shapeGap(E, Pout) < 0.6) continue;
    const mk = (shapes: Shape[]): CWorkspace => ({ base: { ...BASE }, l1, l2, obstacles: shapes.map((shape, i) => ({ label: 'ABCD'[i], shape })) });
    const X = mk([S, E, Pout]);
    const Y = mk([S, Pin]);
    const Z = mk([S, Pout]);
    const needs = [
      [true, eInside, false],
      [true, true],
      [true, false],
    ];
    const all = [X, Y, Z];
    if (!all.every((ws, w) => regionsClean(ws, workspaceGrid(ws, 144), needs[w]))) continue;
    const order = rng.shuffle([0, 1, 2]);
    const plots = rng.shuffle([0, 1, 2]);
    return finishMatch(
      order.map((i) => all[i]),
      plots,
      false
    );
  }
  return deckMatch();
}

export function matchProblem(rng: Rng): MatchProblem {
  return rng.chance(0.3) ? deckMatch() : randomMatch(rng);
}

/** Count of bands and blobs in a workspace's C-space, with their θ1 positions. */
export function matchSignature(mp: MatchProblem, w: number) {
  const ws = mp.wss[w];
  const regs = ws.obstacles.map((_, o) => obstacleRegion(ws, mp.grids[w], mp.ras[w], o));
  return { bands: regs.filter((r) => r.band).length, blobs: regs.filter((r) => !r.band).length, regs };
}

/** What workspace w's obstacles make, in words (Rich). */
export function workspaceStory(mp: MatchProblem, w: number): string {
  const ws = mp.wss[w];
  return ws.obstacles
    .map((ob, o) => {
      const inf = obstacleInfo(ws, ob.shape);
      const name = mp.names[w][o];
      return inf.band
        ? `${name} crosses the dashed circle (nearest point ${m2(inf.dNear)} m $< L_1$), so it makes ${regionPhrase(ws, mp.grids[w], mp.ras[w], o)}`
        : `${name} is outside the circle (nearest point ${m2(inf.dNear)} m $> L_1$), so it makes ${regionPhrase(ws, mp.grids[w], mp.ras[w], o)}`;
    })
    .join('; ');
}

const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** What a plot shows (Rich), for plot index k. */
export function plotStory(mp: MatchProblem, k: number): string {
  const w = mp.plotOf.indexOf(k);
  const sig = matchSignature(mp, w);
  const bands = sig.regs.filter((r) => r.band).flatMap((r) => r.bands.map(([a, b]) => `$\\theta_1 \\in ${arcTeX(a, b)}$`));
  const blobs = sig.regs.filter((r) => !r.band).map((r) => `$\\theta_1 \\in ${arcTeX(r.t1[0], r.t1[1])}$`);
  const parts = [`${plural(sig.bands, 'full-height band', 'full-height bands')}${bands.length ? ` (${bands.join(', ')})` : ''}`];
  parts.push(sig.blobs ? `${plural(sig.blobs, 'isolated blob', 'isolated blobs')} (${blobs.join(', ')})` : 'no isolated blobs');
  return `Plot ${k + 1} has ${parts.join(' and ')}.`;
}
