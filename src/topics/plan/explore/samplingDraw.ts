// Canvas drawing for the "PRM, RRT and RRT*" simulation: obstacles, the tree or roadmap (hundreds to thousands of
// edges, so one canvas path per colour instead of SVG elements) and paths. Everything is drawn in a fixed logical
// square of VIEW units (the SVG overlay above it uses the same numbers as its viewBox); the caller scales the
// context to the canvas' real pixel size.
import type { Vec2 } from '../../../core/geom2d';
import { segmentFree, type World } from '../../../core/sampling';
import type { GrowRun } from './samplingEngine';
import type { PrmRun } from './samplingPrm';

/** Logical size of the square view (canvas units and SVG viewBox). */
export const VIEW = 600;
export const PAD = 14;
/** Logical units per metre for a 10 m × 10 m world. */
export const SCALE = (VIEW - 2 * PAD) / 10;
export const sx = (x: number) => PAD + x * SCALE;
export const sy = (y: number) => VIEW - PAD - y * SCALE;
/** Inverse map (logical view units → world metres). */
export const wx = (X: number) => (X - PAD) / SCALE;
export const wy = (Y: number) => (VIEW - PAD - Y) / SCALE;

export interface Palette {
  surface: string;
  text: string;
  text2: string;
  text3: string;
  grid: string;
  obstacle: string;
  m1: string;
  m2: string;
  m3: string;
  m4: string;
  bad: string;
  accent: string;
}

/** Background, 1 m grid, world border and obstacles. */
export function paintWorld(ctx: CanvasRenderingContext2D, world: World, pal: Palette) {
  ctx.fillStyle = pal.surface;
  ctx.fillRect(0, 0, VIEW, VIEW);
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k <= world.w; k++) {
    ctx.moveTo(sx(k), sy(0));
    ctx.lineTo(sx(k), sy(world.h));
  }
  for (let k = 0; k <= world.h; k++) {
    ctx.moveTo(sx(0), sy(k));
    ctx.lineTo(sx(world.w), sy(k));
  }
  ctx.stroke();
  ctx.strokeStyle = pal.text3;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(sx(0), sy(world.h), world.w * SCALE, world.h * SCALE);
  ctx.fillStyle = pal.obstacle;
  ctx.strokeStyle = pal.text2;
  ctx.lineWidth = 1;
  for (const o of world.obstacles) {
    ctx.beginPath();
    if (o.kind === 'rect') ctx.rect(sx(o.x), sy(o.y + o.h), o.w * SCALE, o.h * SCALE);
    else if (o.kind === 'circle') ctx.arc(sx(o.x), sy(o.y), o.r * SCALE, 0, 2 * Math.PI);
    else {
      o.pts.forEach((p, k) => (k ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
      ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

const BUCKETS = 5;
/** Freshness 0 (old) … 1 (new) → bucket 0 … BUCKETS-1. */
const bucketOf = (fresh: number) => Math.max(0, Math.min(BUCKETS - 1, Math.floor(fresh * BUCKETS)));
const bucketAlpha = (b: number) => 0.15 + (0.85 * (b + 1)) / BUCKETS;

/** Line width (in the current logical units) of one device pixel. */
export const hairline = (ctx: CanvasRenderingContext2D) => 1 / (ctx.getTransform().a || 1);

export interface TreePaint {
  /** Parents after the iteration being drawn (length = node count). */
  par: Int32Array;
  /** Edge into each node crosses an obstacle (end-point checking only). */
  bad: Uint8Array;
  edgeColor: string;
  nodeColor: string;
  /** Nodes with id ≥ this are highlighted in `newColor` (the newest growth while playing fast). */
  newFrom?: number;
  newColor?: string;
  /** Draw a dot on every node (skipped for big trees while playing fast). */
  dots?: boolean;
  /** Recently rewired edges (child ids and their new parents) to flash. */
  flash?: { id: number; to: number; age: number }[];
  flashColor?: string;
  badColor: string;
  alpha?: number;
}

/** The tree: every edge in one path, crossing edges in the "bad" colour, nodes as small dots. */
export function paintTree(ctx: CanvasRenderingContext2D, run: GrowRun, t: TreePaint) {
  const { par, bad } = t;
  const n = par.length;
  const px = run.px;
  const py = run.py;
  const a = t.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.8 * a;
  ctx.strokeStyle = t.edgeColor;
  // One device pixel: drawn as a hairline, far cheaper than a thicker stroke for thousands of edges.
  ctx.lineWidth = hairline(ctx);
  ctx.beginPath();
  let anyBad = false;
  for (let k = 1; k < n; k++) {
    const p = par[k];
    if (p < 0) continue;
    if (bad[k]) {
      anyBad = true;
      continue;
    }
    ctx.moveTo(sx(px[k]), sy(py[k]));
    ctx.lineTo(sx(px[p]), sy(py[p]));
  }
  ctx.stroke();
  if (anyBad) {
    ctx.globalAlpha = a;
    ctx.strokeStyle = t.badColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 1; k < n; k++) {
      if (!bad[k] || par[k] < 0) continue;
      ctx.moveTo(sx(px[k]), sy(py[k]));
      ctx.lineTo(sx(px[par[k]]), sy(py[par[k]]));
    }
    ctx.stroke();
  }
  if (t.flash && t.flash.length && t.flashColor) {
    // Fading by age, in a few alpha buckets (one stroke each: hundreds of separate strokes cost frames).
    ctx.strokeStyle = t.flashColor;
    ctx.lineWidth = 2.2;
    for (let b = 0; b < BUCKETS; b++) {
      ctx.beginPath();
      let any = false;
      for (const f of t.flash) {
        if (f.id >= n || f.to >= n || bucketOf(1 - f.age) !== b) continue;
        ctx.moveTo(sx(px[f.id]), sy(py[f.id]));
        ctx.lineTo(sx(px[f.to]), sy(py[f.to]));
        any = true;
      }
      if (!any) continue;
      ctx.globalAlpha = a * bucketAlpha(b);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = a;
  ctx.fillStyle = t.nodeColor;
  const newFrom = t.newFrom ?? n;
  if (t.dots !== false) {
    // One path of tiny squares, one fill (thousands of separate fillRect calls cost frames).
    ctx.beginPath();
    for (let k = 1; k < Math.min(n, newFrom); k++) ctx.rect(sx(px[k]) - 1.3, sy(py[k]) - 1.3, 2.6, 2.6);
    ctx.fill();
  }
  if (newFrom < n && t.newColor) {
    // Newest growth, fading with age (the newest node is fully coloured), bucketed like the flashes.
    ctx.strokeStyle = t.newColor;
    ctx.fillStyle = t.newColor;
    ctx.lineWidth = 2;
    const span = Math.max(1, n - newFrom);
    const lo = Math.max(1, newFrom);
    for (let b = 0; b < BUCKETS; b++) {
      ctx.globalAlpha = a * bucketAlpha(b);
      ctx.beginPath();
      for (let k = lo; k < n; k++) {
        if (bucketOf(1 - (n - 1 - k) / span) !== b || par[k] < 0) continue;
        ctx.moveTo(sx(px[k]), sy(py[k]));
        ctx.lineTo(sx(px[par[k]]), sy(py[par[k]]));
      }
      ctx.stroke();
      for (let k = lo; k < n; k++) if (bucketOf(1 - (n - 1 - k) / span) === b) ctx.fillRect(sx(px[k]) - 2, sy(py[k]) - 2, 4, 4);
    }
  }
  ctx.globalAlpha = 1;
}

export interface RoadmapPaint {
  /** Vertices drawn (the first m). */
  m: number;
  edgeColor: string;
  nodeColor: string;
  badColor: string;
  /** Vertices with id ≥ this are highlighted (newest growth while playing fast). */
  newFrom?: number;
  newColor?: string;
  /** Piece (connected component) of each vertex and the pieces to draw in full colour (others are faded). */
  piece?: Int32Array;
  strong?: Set<number>;
}

export function paintRoadmap(ctx: CanvasRenderingContext2D, prm: PrmRun, r: RoadmapPaint) {
  const m = Math.min(r.m, prm.count);
  const E = prm.edgesAt[m];
  const { px, py, ea, eb, ebad } = prm;
  const strong = (v: number) => !r.piece || !r.strong || r.strong.has(r.piece[v]);
  ctx.lineCap = 'round';
  for (const pass of [0, 1] as const) {
    // pass 0: faded pieces, pass 1: strong pieces.
    ctx.globalAlpha = pass ? 0.75 : 0.28;
    ctx.strokeStyle = r.edgeColor;
    ctx.lineWidth = hairline(ctx);
    ctx.beginPath();
    for (let e = 0; e < E; e++) {
      if (ebad[e] || (strong(ea[e]) ? 1 : 0) !== pass) continue;
      ctx.moveTo(sx(px[ea[e]]), sy(py[ea[e]]));
      ctx.lineTo(sx(px[eb[e]]), sy(py[eb[e]]));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = r.badColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let e = 0; e < E; e++) {
    if (!ebad[e]) continue;
    ctx.moveTo(sx(px[ea[e]]), sy(py[ea[e]]));
    ctx.lineTo(sx(px[eb[e]]), sy(py[eb[e]]));
  }
  ctx.stroke();
  const newFrom = r.newFrom ?? m;
  for (let k = 0; k < m; k++) {
    const isNew = k >= newFrom;
    ctx.globalAlpha = strong(k) || isNew ? 1 : 0.35;
    ctx.fillStyle = isNew && r.newColor ? r.newColor : r.nodeColor;
    const s = isNew ? 4.4 : 3.2;
    ctx.fillRect(sx(px[k]) - s / 2, sy(py[k]) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

/** A polyline in world metres; segments flagged in `bad` are drawn in `badColor` on top. */
export function paintPath(ctx: CanvasRenderingContext2D, pts: readonly Vec2[], o: { color: string; width: number; dash?: number[]; alpha?: number; halo?: string; bad?: readonly boolean[]; badColor?: string }) {
  if (pts.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = () => {
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
  };
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.halo) {
    ctx.setLineDash([]);
    ctx.strokeStyle = o.halo;
    ctx.lineWidth = o.width + 3;
    trace();
    ctx.stroke();
  }
  ctx.setLineDash(o.dash ?? []);
  ctx.strokeStyle = o.color;
  ctx.lineWidth = o.width;
  trace();
  ctx.stroke();
  ctx.setLineDash([]);
  if (o.bad && o.badColor) {
    ctx.strokeStyle = o.badColor;
    ctx.lineWidth = o.width + 0.5;
    for (let k = 1; k < pts.length; k++) {
      if (!o.bad[k - 1]) continue;
      ctx.beginPath();
      ctx.moveTo(sx(pts[k - 1].x), sy(pts[k - 1].y));
      ctx.lineTo(sx(pts[k].x), sy(pts[k].y));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Which segments of a path cross an obstacle. */
export function crossingSegments(world: World, pts: readonly Vec2[] | null): boolean[] {
  if (!pts) return [];
  const out: boolean[] = [];
  for (let k = 1; k < pts.length; k++) out.push(!segmentFree(world, pts[k - 1], pts[k]));
  return out;
}

/** Dashed circle (goal region, connection radius) in world metres. */
export function paintCircle(ctx: CanvasRenderingContext2D, c: Vec2, r: number, color: string, alpha = 0.6, fill = 0) {
  ctx.beginPath();
  ctx.arc(sx(c.x), sy(c.y), r * SCALE, 0, 2 * Math.PI);
  if (fill > 0) {
    ctx.globalAlpha = fill;
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.globalAlpha = alpha;
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
