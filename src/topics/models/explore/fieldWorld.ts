// The world behind the "scan models" simulation: a 12 × 8 m two-room map at 5 cm, its distance transform, the
// true robot's lidar scan (optionally with a person who is not in the map), four landmarks, and the score
// helpers the simulation and the self-tests share (core/models_field.ts does the maths).
import {
  beamAngles,
  beamScan,
  distanceTransform,
  expectedScan,
  fillDisc,
  fillRect,
  likelihoodField,
  likelihoodFieldLog,
  landmarkScore,
  makeMap,
  predictRB,
  type FieldParams,
  type GridMap,
  type Landmark,
  type RangeBearing,
  type Scan,
} from '../../../core/models_field';
import { gaussian, wrapAngle, type Pose } from '../../../core/motion';
import { mulberry32 } from '../../../engine/rng';

export const MAP_W = 12;
export const MAP_H = 8;
export const RES = 0.05;
export const Z_MAX = 8;

/** The mapped world (what the robot knows). */
export function buildMap(): GridMap {
  const m = makeMap(Math.round(MAP_W / RES), Math.round(MAP_H / RES), RES);
  // outer walls
  fillRect(m, 0, 0, MAP_W, 0.1);
  fillRect(m, 0, MAP_H - 0.1, MAP_W, MAP_H);
  fillRect(m, 0, 0, 0.1, MAP_H);
  fillRect(m, MAP_W - 0.1, 0, MAP_W, MAP_H);
  // thin inner wall with a doorway between y = 3.0 and 4.2
  fillRect(m, 7.0, 0, 7.1, 3.0);
  fillRect(m, 7.0, 4.2, 7.1, MAP_H);
  // left room: a pillar and a round table
  fillRect(m, 3.0, 5.0, 3.6, 5.6);
  fillDisc(m, 4.6, 2.2, 0.45);
  // right room: a counter and a box
  fillRect(m, 9.2, 1.2, 10.8, 1.6);
  fillRect(m, 9.6, 4.8, 10.2, 5.4);
  return m;
}

/** The person standing in the real world but not in the map (the "unexpected obstacle"). */
export const PERSON = { x: 5.0, y: 4.75, r: 0.22 };

export const TRUE_POSE: Pose = { x: 3.9, y: 4.6, theta: 0 };

export interface World {
  map: GridMap;
  dt: Float32Array;
  /** The real world used to simulate the scan (map + person when present). */
  real: GridMap;
}

let cache: { map: GridMap; dt: Float32Array } | null = null;
export function mapAndField(): { map: GridMap; dt: Float32Array } {
  if (!cache) {
    const map = buildMap();
    cache = { map, dt: distanceTransform(map) };
  }
  return cache;
}

/** Simulated lidar scan from the true pose: ray cast the real world, add Gaussian range noise (fixed seed). */
export function simulateScan(truth: Pose, nBeams: number, noise: number, person: boolean, seed = 5): Scan {
  const { map } = mapAndField();
  let real = map;
  if (person) {
    real = { ...map, occ: map.occ.slice() };
    fillDisc(real, PERSON.x, PERSON.y, PERSON.r);
  }
  const ideal = expectedScan(real, truth, beamAngles(nBeams), Z_MAX);
  const next = mulberry32(seed);
  return { ...ideal, ranges: ideal.ranges.map((z) => (z >= Z_MAX - 1e-9 ? Z_MAX : Math.max(0, Math.min(Z_MAX - 1e-6, z + noise * gaussian(next))))) };
}

export interface ScoreParams {
  field: FieldParams;
  beam: { sigma: number; lambda: number; w: { hit: number; short: number; max: number; rand: number } };
}

export function scoreParams(sigma: number): ScoreParams {
  return {
    field: { zHit: 0.9, zRand: 0.1, sigma },
    beam: { sigma, lambda: 0.5, w: { hit: 0.8, short: 0.1, max: 0.05, rand: 0.05 } },
  };
}

export function scoresAt(pose: Pose, scan: Scan, sp: ScoreParams) {
  const { map, dt } = mapAndField();
  return { field: likelihoodField(map, dt, pose, scan, sp.field), beam: beamScan(map, pose, scan, sp.beam) };
}

/** ln q of each model along a slice through `pose` (offset in x, y or θ). */
export function slice(pose: Pose, axis: 'x' | 'y' | 'theta', scan: Scan, sp: ScoreParams, n = 81): { off: number[]; field: number[]; beam: number[] } {
  const { map, dt } = mapAndField();
  const span = axis === 'theta' ? 0.6 : 1;
  const off: number[] = [];
  const field: number[] = [];
  const beam: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = -span + (2 * span * i) / (n - 1);
    const p = axis === 'x' ? { ...pose, x: pose.x + o } : axis === 'y' ? { ...pose, y: pose.y + o } : { ...pose, theta: pose.theta + o };
    off.push(o);
    field.push(likelihoodFieldLog(map, dt, p, scan, sp.field));
    beam.push(beamScan(map, p, scan, sp.beam).logq);
  }
  return { off, field, beam };
}

/** Likelihood-field ln q at every position on a coarse grid (heading fixed): the pose score map. */
export function fieldPoseGrid(theta: number, scan: Scan, sp: ScoreParams, step = 0.1): { nx: number; ny: number; step: number; v: Float32Array } {
  const { map, dt } = mapAndField();
  const nx = Math.round(MAP_W / step);
  const ny = Math.round(MAP_H / step);
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * step;
      const y = (j + 0.5) * step;
      v[j * nx + i] = map.occ[Math.floor(y / RES) * map.w + Math.floor(x / RES)] ? NaN : likelihoodFieldLog(map, dt, { x, y, theta }, scan, sp.field);
    }
  return { nx, ny, step, v };
}

// ------------------------------------------------------------------ landmarks

/** Four beacons at the corners of a rectangle centred on the map: symmetric under a half turn. */
export const LANDMARKS: Landmark[] = [
  { x: 2.0, y: 1.5, sig: 0, label: 'A' },
  { x: 10.0, y: 1.5, sig: 1, label: 'B' },
  { x: 10.0, y: 6.5, sig: 2, label: 'C' },
  { x: 2.0, y: 6.5, sig: 3, label: 'D' },
];

export const SIG_R = 0.08;
export const SIG_PHI = 0.04;

/** Range-bearing measurements of every landmark from the true pose (fixed seed). Identical posts report sig −1. */
export function landmarkReadings(truth: Pose, identical: boolean, seed = 9): RangeBearing[] {
  const next = mulberry32(seed);
  return LANDMARKS.map((l) => {
    const p = predictRB(truth, l);
    return { r: p.r + 0.02 * gaussian(next), phi: wrapAngle(p.phi + 0.01 * gaussian(next)), sig: identical ? -1 : l.sig };
  });
}

export function landmarkLog(pose: Pose, zs: RangeBearing[], identical: boolean) {
  return landmarkScore(pose, zs, LANDMARKS, SIG_R, SIG_PHI, identical ? { known: false } : { known: true, truth: LANDMARKS.map((_, i) => i) });
}

/** The pose a half turn about the map centre: indistinguishable from `p` with identical landmarks. */
export const halfTurn = (p: Pose): Pose => ({ x: MAP_W - p.x, y: MAP_H - p.y, theta: wrapAngle(p.theta + Math.PI) });

/** Landmark ln q at every position on a coarse grid (heading fixed). */
export function landmarkPoseGrid(theta: number, zs: RangeBearing[], identical: boolean, step = 0.1): { nx: number; ny: number; step: number; v: Float32Array } {
  const nx = Math.round(MAP_W / step);
  const ny = Math.round(MAP_H / step);
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) v[j * nx + i] = landmarkLog({ x: (i + 0.5) * step, y: (j + 0.5) * step, theta }, zs, identical).logq;
  return { nx, ny, step, v };
}
