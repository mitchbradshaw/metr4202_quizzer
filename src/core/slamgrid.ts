// Occupancy-grid mapping with KNOWN poses from a 2D lidar (summary notes §4 "practical mapping issues";
// Probabilistic Robotics Table 9.1 occupancy_grid_mapping and Table 9.2 inverse_range_sensor_model).
// Pure functions, SI units (m, rad). The grid stores the log-odds l of every cell (0 = p 0.5 = unknown) and
// each beam updates it with the course's additive rule l ← l + ln[p(m|z)/(1 − p(m|z))] − l0 (l0 = 0):
//   cells the beam passed through  + l_free  (p(m | pass) < 0.5, so l_free < 0)
//   the cell where it returned     + l_occ   (p(m | hit)  > 0.5, so l_occ > 0)
//   cells beyond the return        nothing   (occluded: the beam says nothing about them)
import { gaussian } from './motion';

export type SegKind = 'wall' | 'glass';
/** A wall or glass pane from a to b (metres, world frame, y up). */
export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  kind: SegKind;
}
/** A moving person (or any round dynamic object) the static map does not contain. */
export interface Disc {
  x: number;
  y: number;
  r: number;
}
export interface MapWorld {
  /** Extent of the mapped area [0, w] × [0, h] in metres. */
  w: number;
  h: number;
  segs: Seg[];
}

export type HitKind = 'wall' | 'glass' | 'person' | 'max';

export interface LidarSpec {
  /** Beams spread evenly over 360°. */
  beams: number;
  /** Largest range the sensor reports (m); no return within it gives a max-range reading. */
  maxRange: number;
  /** Range noise standard deviation (m). */
  sigma: number;
  /**
   * Glass only returns a beam that meets it almost head-on: |cos(incidence)| ≥ glassCos. Otherwise the beam goes
   * straight through. Use a value > 1 for perfectly transparent glass.
   */
  glassCos: number;
}

/** One scan: the robot pose it was taken from, and the measured range of every beam. */
export interface Scan {
  x: number;
  y: number;
  /** Angle of beam 0 (rad); beam k points at angle0 + 2πk / ranges.length. */
  angle0: number;
  ranges: Float32Array;
  /** What each beam truly hit (for drawing only: the mapper never sees this). */
  kinds: HitKind[];
  maxRange: number;
}

/** The inverse sensor model in log-odds, and what to do with max-range readings. */
export interface InverseSensor {
  /** ln[p(m | hit) / (1 − p(m | hit))] > 0. */
  lOcc: number;
  /** ln[p(m | pass) / (1 − p(m | pass))] < 0. */
  lFree: number;
  /** Clamp bounds for l (−∞ / +∞ for none). Clamping keeps cells able to change when the world changes. */
  lMin: number;
  lMax: number;
  /**
   * 'clear': a max-range reading frees every cell along the beam (Table 9.2: r ≤ z_max ⇒ l_free, never l_occ).
   * 'ignore': discard max-range readings (they may be glass, black surfaces or dropouts, not free space).
   */
  maxPolicy: 'clear' | 'ignore';
}

export interface OccGrid {
  res: number;
  nx: number;
  ny: number;
  /** Log-odds per cell, row-major from the bottom-left: index = iy·nx + ix. */
  l: Float32Array;
  /** 1 once any beam has touched the cell. */
  seen: Uint8Array;
}

// ------------------------------------------------------------------ ray casting in the true world

/** Distance t > 0 along the unit ray (ox, oy) + t (dx, dy) to segment s, or Infinity. Also the |cos| of incidence. */
export function raySeg(ox: number, oy: number, dx: number, dy: number, s: Seg): { t: number; cos: number } {
  const ex = s.bx - s.ax;
  const ey = s.by - s.ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return { t: Infinity, cos: 0 };
  const qx = s.ax - ox;
  const qy = s.ay - oy;
  const t = (qx * ey - qy * ex) / den;
  const u = (qx * dy - qy * dx) / den;
  if (t <= 1e-9 || u < 0 || u > 1) return { t: Infinity, cos: 0 };
  return { t, cos: Math.abs(den) / Math.hypot(ex, ey) };
}

/** Distance t > 0 along the unit ray to the circle, or Infinity (a ray starting inside sees the far side). */
export function rayDisc(ox: number, oy: number, dx: number, dy: number, c: Disc): number {
  const fx = ox - c.x;
  const fy = oy - c.y;
  const b = dx * fx + dy * fy;
  const cc = fx * fx + fy * fy - c.r * c.r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  const t1 = -b - sq;
  if (t1 > 1e-9) return t1;
  const t2 = -b + sq;
  return t2 > 1e-9 ? t2 : Infinity;
}

/** The true range and what the beam hits first (walls, glass met head-on, people), capped at maxRange. */
export function castTrue(world: MapWorld, people: readonly Disc[], ox: number, oy: number, angle: number, spec: Pick<LidarSpec, 'maxRange' | 'glassCos'>): { range: number; kind: HitKind } {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = spec.maxRange;
  let kind: HitKind = 'max';
  for (const s of world.segs) {
    const h = raySeg(ox, oy, dx, dy, s);
    if (h.t >= best) continue;
    if (s.kind === 'glass' && h.cos < spec.glassCos) continue; // oblique beams pass straight through glass
    best = h.t;
    kind = s.kind;
  }
  for (const p of people) {
    const t = rayDisc(ox, oy, dx, dy, p);
    if (t < best) {
      best = t;
      kind = 'person';
    }
  }
  return { range: best, kind };
}

/**
 * Simulate one 360° scan from (x, y): true range per beam plus Gaussian noise (σ), clipped to [0, maxRange].
 * A beam with no return inside maxRange reads exactly maxRange. `next` is a uniform [0, 1) generator.
 */
export function takeScan(world: MapWorld, people: readonly Disc[], x: number, y: number, spec: LidarSpec, next: () => number, angle0 = 0): Scan {
  const n = Math.max(1, Math.round(spec.beams));
  const ranges = new Float32Array(n);
  const kinds: HitKind[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const a = angle0 + (2 * Math.PI * k) / n;
    const hit = castTrue(world, people, x, y, a, spec);
    let r = hit.range;
    if (hit.kind !== 'max' && spec.sigma > 0) r += spec.sigma * gaussian(next);
    r = Math.max(0.01, Math.min(spec.maxRange, r));
    ranges[k] = r;
    kinds[k] = hit.kind !== 'max' && r >= spec.maxRange ? 'max' : hit.kind;
  }
  return { x, y, angle0, ranges, kinds, maxRange: spec.maxRange };
}

// ------------------------------------------------------------------ the grid

export function makeGrid(w: number, h: number, res: number): OccGrid {
  const nx = Math.max(1, Math.ceil(w / res - 1e-9));
  const ny = Math.max(1, Math.ceil(h / res - 1e-9));
  return { res, nx, ny, l: new Float32Array(nx * ny), seen: new Uint8Array(nx * ny) };
}

/** 4 bytes per cell (a float32 log-odds), the usual in-memory form. */
export function gridBytes(nx: number, ny: number, bytesPerCell = 4): number {
  return nx * ny * bytesPerCell;
}

/**
 * Amanatides–Woo traversal: visit every cell the segment (x0, y0) → (x1, y1) crosses, in order, from the cell of
 * (x0, y0) to the cell of (x1, y1) inclusive; `last` is true for the end cell. Cells outside the grid are skipped.
 */
export function traverse(g: Pick<OccGrid, 'res' | 'nx' | 'ny'>, x0: number, y0: number, x1: number, y1: number, visit: (idx: number, last: boolean) => void): void {
  const { res, nx, ny } = g;
  let ix = Math.floor(x0 / res);
  let iy = Math.floor(y0 / res);
  const ex = Math.floor(x1 / res);
  const ey = Math.floor(y1 / res);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tdx = sx ? res / Math.abs(dx) : Infinity;
  const tdy = sy ? res / Math.abs(dy) : Infinity;
  let tmx = sx > 0 ? ((ix + 1) * res - x0) / dx : sx < 0 ? (ix * res - x0) / dx : Infinity;
  let tmy = sy > 0 ? ((iy + 1) * res - y0) / dy : sy < 0 ? (iy * res - y0) / dy : Infinity;
  const n = Math.abs(ex - ix) + Math.abs(ey - iy);
  let wasIn = false;
  for (let k = 0; k <= n; k++) {
    const inside = ix >= 0 && iy >= 0 && ix < nx && iy < ny;
    if (inside) {
      wasIn = true;
      visit(iy * nx + ix, k === n);
    } else if (wasIn) return; // a straight beam never comes back in
    if (k === n) return;
    // Guards keep the walk on the line's own cells even when rounding ties at a corner.
    const stepX = ix === ex ? false : iy === ey ? true : tmx < tmy;
    if (stepX) {
      tmx += tdx;
      ix += sx;
    } else {
      tmy += tdy;
      iy += sy;
    }
  }
}

/** Apply one beam to the grid (the inverse sensor model in log-odds). Returns the number of cells changed. */
export function integrateBeam(g: OccGrid, ism: InverseSensor, ox: number, oy: number, angle: number, range: number, maxRange: number): number {
  const noReturn = range >= maxRange - 1e-6;
  if (noReturn && ism.maxPolicy === 'ignore') return 0;
  // A hair past the surface, so the hit lands in the cell on the far side of the boundary the beam crossed.
  const r = noReturn ? maxRange : range + 1e-4;
  const x1 = ox + r * Math.cos(angle);
  const y1 = oy + r * Math.sin(angle);
  const { l, seen } = g;
  const { lOcc, lFree, lMin, lMax } = ism;
  let count = 0;
  traverse(g, ox, oy, x1, y1, (idx, last) => {
    const v = l[idx] + (last && !noReturn ? lOcc : lFree);
    l[idx] = v < lMin ? lMin : v > lMax ? lMax : v;
    seen[idx] = 1;
    count++;
  });
  return count;
}

export function integrateScan(g: OccGrid, ism: InverseSensor, s: Scan): void {
  const n = s.ranges.length;
  for (let k = 0; k < n; k++) integrateBeam(g, ism, s.x, s.y, s.angle0 + (2 * Math.PI * k) / n, s.ranges[k], s.maxRange);
}

// ------------------------------------------------------------------ comparing with the truth

/** 1 where a wall passes through the cell, 2 for glass, 0 free (walls on a cell boundary mark both sides). */
export function truthGrid(world: MapWorld, g: Pick<OccGrid, 'res' | 'nx' | 'ny'>): Uint8Array {
  const { res, nx, ny } = g;
  const out = new Uint8Array(nx * ny);
  const mark = (x: number, y: number, v: number) => {
    const ix = Math.floor(x / res);
    const iy = Math.floor(y / res);
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return;
    const k = iy * nx + ix;
    if (out[k] !== 1) out[k] = v; // a wall wins over glass in a shared cell
  };
  for (const s of world.segs) {
    const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const steps = Math.max(1, Math.ceil(len / (res / 4)));
    const nxu = -(s.by - s.ay) / (len || 1);
    const nyu = (s.bx - s.ax) / (len || 1);
    const v = s.kind === 'glass' ? 2 : 1;
    for (let i = 0; i <= steps; i++) {
      const x = s.ax + ((s.bx - s.ax) * i) / steps;
      const y = s.ay + ((s.by - s.ay) * i) / steps;
      mark(x + nxu * 1e-3, y + nyu * 1e-3, v);
      mark(x - nxu * 1e-3, y - nyu * 1e-3, v);
    }
  }
  return out;
}

export interface MapStats {
  cells: number;
  seen: number;
  /** Cells the map believes occupied / free (|l| above the threshold). */
  occ: number;
  free: number;
  /** Believed occupied with no static obstacle within about 0.1 m (people's trails, not wall noise). */
  ghosts: number;
  /** Believed free where glass is. */
  glassFree: number;
  /** Believed free where a wall is (noise eroding walls). */
  wallFree: number;
}

/** Default "believed" threshold: p 0.65 / 0.35. */
export const BELIEF_L = Math.log(0.65 / 0.35);

/**
 * True when cell k is believed occupied but no static obstacle lies within about 0.1 m of it (at least one cell), so
 * range noise next to a wall does not count as a ghost.
 */
export function isGhost(g: OccGrid, truth: Uint8Array, k: number, thresh = BELIEF_L): boolean {
  if (!(g.l[k] > thresh) || truth[k]) return false;
  const { nx, ny } = g;
  const ix = k % nx;
  const iy = (k - ix) / nx;
  const r = Math.max(1, Math.round(0.1 / g.res));
  for (let dy = -r; dy <= r; dy++) {
    const y = iy + dy;
    if (y < 0 || y >= ny) continue;
    for (let dx = -r; dx <= r; dx++) {
      const x = ix + dx;
      if (x >= 0 && x < nx && truth[y * nx + x]) return false;
    }
  }
  return true;
}

/** Counts against the true static map. A cell is "believed" occupied/free when |l| > thresh. */
export function mapStats(g: OccGrid, truth: Uint8Array, thresh = BELIEF_L): MapStats {
  const { l, seen } = g;
  const st: MapStats = { cells: l.length, seen: 0, occ: 0, free: 0, ghosts: 0, glassFree: 0, wallFree: 0 };
  for (let k = 0; k < l.length; k++) {
    if (seen[k]) st.seen++;
    const v = l[k];
    if (v > thresh) {
      st.occ++;
      if (isGhost(g, truth, k, thresh)) st.ghosts++;
    } else if (v < -thresh) {
      st.free++;
      if (truth[k] === 2) st.glassFree++;
      else if (truth[k] === 1) st.wallFree++;
    }
  }
  return st;
}

/** Log-odds of a probability (finite inputs only). */
export const lo = (p: number) => Math.log(p / (1 - p));
/** Probability of a log-odds. */
export const pOf = (l: number) => 1 / (1 + Math.exp(-l));
