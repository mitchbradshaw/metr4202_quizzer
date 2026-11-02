// Range-finder scan models on an occupancy-grid map (summary notes §3 "Sensor models"; Thrun, Burgard & Fox,
// Probabilistic Robotics §6.3-6.6):
//   - beam model: ray cast the map for each beam's expected range z*, then score the reading with the
//     four-part mixture (core/models_beam.ts);
//   - likelihood field (scan-based): project each beam's END POINT into the map and score it by its distance to
//     the nearest obstacle (a precomputed distance transform), ignoring what the ray passed through;
//   - landmark model: range and bearing to identified features, which needs data association.
// The map is a grid of square cells: cell (i, j) covers x ∈ [i·res, (i+1)·res), y ∈ [j·res, (j+1)·res), y up.
import { mixture, normPdf, type BeamParams } from './models_beam';
import { wrapAngle, type Pose } from './motion';

export interface GridMap {
  /** Columns (x) and rows (y). */
  w: number;
  h: number;
  /** Metres per cell. */
  res: number;
  /** 1 = occupied, row-major from the bottom row: occ[j * w + i]. */
  occ: Uint8Array;
}

export function makeMap(w: number, h: number, res: number): GridMap {
  return { w, h, res, occ: new Uint8Array(w * h) };
}

/** Mark every cell whose centre lies in the rectangle [x0, x1] × [y0, y1] (metres) as occupied. */
export function fillRect(m: GridMap, x0: number, y0: number, x1: number, y1: number, value = 1): void {
  const a = Math.max(0, Math.ceil(Math.min(x0, x1) / m.res - 0.5));
  const b = Math.min(m.w - 1, Math.floor(Math.max(x0, x1) / m.res - 0.5));
  const c = Math.max(0, Math.ceil(Math.min(y0, y1) / m.res - 0.5));
  const d = Math.min(m.h - 1, Math.floor(Math.max(y0, y1) / m.res - 0.5));
  for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) m.occ[j * m.w + i] = value;
}

/** Occupied disc of radius r (m) round (cx, cy). */
export function fillDisc(m: GridMap, cx: number, cy: number, r: number, value = 1): void {
  for (let j = 0; j < m.h; j++)
    for (let i = 0; i < m.w; i++) {
      const x = (i + 0.5) * m.res;
      const y = (j + 0.5) * m.res;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m.occ[j * m.w + i] = value;
    }
}

export function isOcc(m: GridMap, i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < m.w && j < m.h && m.occ[j * m.w + i] === 1;
}

/** Occupied at a point (outside the map counts as free). */
export function occAt(m: GridMap, x: number, y: number): boolean {
  return isOcc(m, Math.floor(x / m.res), Math.floor(y / m.res));
}

// ------------------------------------------------------------------ Euclidean distance transform

const BIG = 1e20;

/** 1-D squared distance transform of f (Felzenszwalb & Huttenlocher): d[q] = min_p (q − p)² + f[p]. */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * Exact Euclidean distance (m) from every cell centre to the nearest occupied cell centre (0 on obstacles).
 * Two passes of the 1-D transform, O(cells). A map with no obstacles gives a very large distance everywhere.
 */
export function distanceTransform(m: GridMap): Float32Array {
  const { w, h } = m;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float64Array(w * h);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) f[j] = m.occ[j * w + i] ? 0 : BIG;
    edt1d(f, h, d, v, z);
    for (let j = 0; j < h; j++) g[j * w + i] = d[j];
  }
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) f[i] = g[j * w + i];
    edt1d(f, w, d, v, z);
    for (let i = 0; i < w; i++) out[j * w + i] = Math.sqrt(Math.min(d[i], BIG)) * m.res;
  }
  return out;
}

/** Distance to the nearest obstacle at a point: the cell's value, plus how far the point lies outside the map. */
export function distAt(m: GridMap, dt: Float32Array, x: number, y: number): number {
  const i = Math.floor(x / m.res);
  const j = Math.floor(y / m.res);
  const ci = Math.max(0, Math.min(m.w - 1, i));
  const cj = Math.max(0, Math.min(m.h - 1, j));
  const base = dt[cj * m.w + ci];
  if (ci === i && cj === j) return base;
  const ox = Math.max(0, -x, x - m.w * m.res);
  const oy = Math.max(0, -y, y - m.h * m.res);
  return base + Math.hypot(ox, oy);
}

// ------------------------------------------------------------------ ray casting (the beam model's z*)

/**
 * Distance along the ray from (x0, y0) at angle `ang` to the first occupied cell (grid traversal, Amanatides &
 * Woo). Returns zMax if nothing is hit within zMax or the ray leaves the map; 0 if it starts inside an obstacle.
 */
export function rayCast(m: GridMap, x0: number, y0: number, ang: number, zMax: number): number {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  let i = Math.floor(x0 / m.res);
  let j = Math.floor(y0 / m.res);
  if (isOcc(m, i, j)) return 0;
  const stepI = dx > 0 ? 1 : -1;
  const stepJ = dy > 0 ? 1 : -1;
  const tdx = Math.abs(dx) > 1e-12 ? m.res / Math.abs(dx) : Infinity;
  const tdy = Math.abs(dy) > 1e-12 ? m.res / Math.abs(dy) : Infinity;
  let tx = Math.abs(dx) > 1e-12 ? ((dx > 0 ? (i + 1) * m.res : i * m.res) - x0) / dx : Infinity;
  let ty = Math.abs(dy) > 1e-12 ? ((dy > 0 ? (j + 1) * m.res : j * m.res) - y0) / dy : Infinity;
  for (let guard = 0; guard < 100000; guard++) {
    let t: number;
    if (tx < ty) {
      i += stepI;
      t = tx;
      tx += tdx;
    } else {
      j += stepJ;
      t = ty;
      ty += tdy;
    }
    if (t >= zMax) return zMax;
    if (i < 0 || j < 0 || i >= m.w || j >= m.h) return zMax;
    if (m.occ[j * m.w + i]) return t;
  }
  return zMax;
}

// ------------------------------------------------------------------ scans

export interface Scan {
  /** Beam angles relative to the robot's heading (rad). */
  angles: number[];
  /** Measured ranges (m); zMax means no return. */
  ranges: number[];
  zMax: number;
}

/** Evenly spaced beam angles over a field of view (rad), e.g. 360° with n beams. */
export function beamAngles(n: number, fov = 2 * Math.PI): number[] {
  const full = fov >= 2 * Math.PI - 1e-9;
  return Array.from({ length: n }, (_, k) => (full ? (k * fov) / n - Math.PI : -fov / 2 + (n > 1 ? (k * fov) / (n - 1) : 0)));
}

/** The noise-free scan the map predicts at a pose (each range is z*). */
export function expectedScan(m: GridMap, pose: Pose, angles: number[], zMax: number): Scan {
  return { angles, ranges: angles.map((a) => rayCast(m, pose.x, pose.y, pose.theta + a, zMax)), zMax };
}

/** Beam end point in the world for range z (the sensor sits at the robot's centre). */
export function endPoint(pose: Pose, angle: number, z: number): { x: number; y: number } {
  return { x: pose.x + z * Math.cos(pose.theta + angle), y: pose.y + z * Math.sin(pose.theta + angle) };
}

export interface FieldParams {
  /** Weight of the Gaussian on the distance to the nearest obstacle. */
  zHit: number;
  /** Weight of the uniform floor z_rand / z_max (keeps one bad end point from zeroing the product). */
  zRand: number;
  /** σ_hit (m). */
  sigma: number;
}

export interface BeamScore {
  /** ln of this beam's factor (0 for a skipped max-range reading). */
  logq: number;
  /** Likelihood field: end point and its distance to the nearest obstacle. */
  ex: number;
  ey: number;
  dist: number;
  skipped: boolean;
}

/** One beam's likelihood-field factor z_hit N(dist; 0, σ²) + z_rand / z_max. */
export function fieldFactor(dist: number, f: FieldParams, zMax: number): number {
  return f.zHit * normPdf(dist, 0, f.sigma) + f.zRand / zMax;
}

/**
 * Likelihood field (Thrun Table 6.3): q = Π_k [z_hit N(dist_k; 0, σ²) + z_rand / z_max] over the beams that
 * returned (max-range readings are skipped). Returned as ln q with the per-beam breakdown.
 */
export function likelihoodField(m: GridMap, dt: Float32Array, pose: Pose, scan: Scan, f: FieldParams): { logq: number; beams: BeamScore[] } {
  let logq = 0;
  const beams: BeamScore[] = [];
  for (let k = 0; k < scan.angles.length; k++) {
    const z = scan.ranges[k];
    if (z >= scan.zMax - 1e-9) {
      beams.push({ logq: 0, ex: NaN, ey: NaN, dist: NaN, skipped: true });
      continue;
    }
    const e = endPoint(pose, scan.angles[k], z);
    const dist = distAt(m, dt, e.x, e.y);
    const lq = Math.log(fieldFactor(dist, f, scan.zMax));
    logq += lq;
    beams.push({ logq: lq, ex: e.x, ey: e.y, dist, skipped: false });
  }
  return { logq, beams };
}

/** ln q of the likelihood field only (no breakdown): fast enough for a whole grid of poses. */
export function likelihoodFieldLog(m: GridMap, dt: Float32Array, pose: Pose, scan: Scan, f: FieldParams): number {
  let logq = 0;
  const floor = f.zRand / scan.zMax;
  const c = f.zHit / (f.sigma * Math.sqrt(2 * Math.PI));
  const k2 = -0.5 / (f.sigma * f.sigma);
  for (let k = 0; k < scan.angles.length; k++) {
    const z = scan.ranges[k];
    if (z >= scan.zMax - 1e-9) continue;
    const a = pose.theta + scan.angles[k];
    const d = distAt(m, dt, pose.x + z * Math.cos(a), pose.y + z * Math.sin(a));
    logq += Math.log(c * Math.exp(k2 * d * d) + floor);
  }
  return logq;
}

/** Beam model over a scan: ray cast z*_k at the pose, then ln Π_k p(z_k | z*_k) with the four-part mixture. */
export function beamScan(m: GridMap, pose: Pose, scan: Scan, p: Omit<BeamParams, 'zStar' | 'zMax'>): { logq: number; zStar: number[]; logs: number[] } {
  let logq = 0;
  const zStar: number[] = [];
  const logs: number[] = [];
  for (let k = 0; k < scan.angles.length; k++) {
    const zs = rayCast(m, pose.x, pose.y, pose.theta + scan.angles[k], scan.zMax);
    const l = Math.log(Math.max(1e-300, mixture(scan.ranges[k], { ...p, zStar: zs, zMax: scan.zMax })));
    zStar.push(zs);
    logs.push(l);
    logq += l;
  }
  return { logq, zStar, logs };
}

// ------------------------------------------------------------------ landmark (feature-based) model

export interface Landmark {
  x: number;
  y: number;
  /** Signature (id); identical-looking landmarks share one. */
  sig: number;
  label: string;
}

export interface RangeBearing {
  r: number;
  phi: number;
  /** Signature the sensor reports (−1 if it cannot tell landmarks apart). */
  sig: number;
}

/** Predicted range and bearing from a pose to a landmark: r̂ = ‖m − p‖, φ̂ = atan2(m_y − y, m_x − x) − θ. */
export function predictRB(pose: Pose, l: { x: number; y: number }): { r: number; phi: number } {
  return { r: Math.hypot(l.x - pose.x, l.y - pose.y), phi: wrapAngle(Math.atan2(l.y - pose.y, l.x - pose.x) - pose.theta) };
}

/** ln N(r − r̂; 0, σ_r²) + ln N(φ − φ̂; 0, σ_φ²) for one measurement against one landmark. */
export function rbLog(z: RangeBearing, pose: Pose, l: { x: number; y: number }, sigR: number, sigPhi: number): number {
  const p = predictRB(pose, l);
  const dr = z.r - p.r;
  const dp = wrapAngle(z.phi - p.phi);
  return -0.5 * (dr * dr) / (sigR * sigR) - 0.5 * (dp * dp) / (sigPhi * sigPhi) - Math.log(2 * Math.PI * sigR * sigPhi);
}

/**
 * Landmark likelihood of a set of range-bearing measurements at a hypothesised pose. With `known` the i-th
 * measurement belongs to landmark `truth[i]`; otherwise each is associated with the landmark (of a matching
 * signature) that explains it best (maximum-likelihood / nearest-neighbour data association).
 */
export function landmarkScore(
  pose: Pose,
  zs: RangeBearing[],
  lms: Landmark[],
  sigR: number,
  sigPhi: number,
  assoc: { known: true; truth: number[] } | { known: false }
): { logq: number; chosen: number[] } {
  let logq = 0;
  const chosen: number[] = [];
  zs.forEach((z, i) => {
    if (assoc.known) {
      const j = assoc.truth[i];
      chosen.push(j);
      logq += rbLog(z, pose, lms[j], sigR, sigPhi);
      return;
    }
    let best = -Infinity;
    let bj = -1;
    lms.forEach((l, j) => {
      if (z.sig >= 0 && l.sig !== z.sig) return;
      const v = rbLog(z, pose, l, sigR, sigPhi);
      if (v > best) {
        best = v;
        bj = j;
      }
    });
    chosen.push(bj);
    logq += best;
  });
  return { logq, chosen };
}
