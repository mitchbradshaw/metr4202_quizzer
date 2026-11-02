// The world and the drive for the loop-closure simulation (data and pure helpers, no React). A ring corridor round
// a building block; the robot starts in the bottom corridor heading east, drives once round (≈ 46 m) and on into the
// bottom corridor again. Two identical alcove + pillar places sit 5 m apart in the bottom corridor: the perceptual
// aliasing that produces the false loop closure. Metres, radians, y up, origin bottom-left.
import { between, compose, deadReckon, type Pose2, type PoseEdge } from '../../../core/slamgraph';
import { castTrue, type MapWorld, type Seg } from '../../../core/slamgrid';
import { gaussian } from '../../../core/motion';
import { mulberry32 } from '../../../engine/rng';

export const LW = 20;
export const LH = 12;
/** Distance between poses (m). */
export const STEP = 0.8;
/** Where the second, identical alcove + pillar is: 5 m further along the bottom corridor. */
export const ALIAS_SHIFT = 5;

const seg = (ax: number, ay: number, bx: number, by: number): Seg => ({ ax, ay, bx, by, kind: 'wall' });
const rect = (x0: number, y0: number, x1: number, y1: number): Seg[] => [seg(x0, y0, x1, y0), seg(x1, y0, x1, y1), seg(x1, y1, x0, y1), seg(x0, y1, x0, y0)];

/** An alcove in the bottom outer wall at x ∈ [a, a + 1] plus a pillar on the block opposite: the look-alike place. */
const lookalike = (a: number): Seg[] => [seg(a, 0.8, a, 0.2), seg(a, 0.2, a + 1, 0.2), seg(a + 1, 0.2, a + 1, 0.8), ...rect(a + 0.3, 3.2, a + 0.7, 3.6)];

const A1 = 4.4;
const A2 = A1 + ALIAS_SHIFT;

export const RING: MapWorld = {
  w: LW,
  h: LH,
  segs: [
    // bottom outer wall with two alcoves
    seg(0.8, 0.8, A1, 0.8),
    seg(A1 + 1, 0.8, A2, 0.8),
    seg(A2 + 1, 0.8, 18.4, 0.8),
    seg(18.4, 0.8, 19.2, 1.6), // chamfered corner
    ...lookalike(A1),
    ...lookalike(A2),
    // right outer wall with an alcove
    seg(19.2, 1.6, 19.2, 5.0),
    seg(19.2, 5.0, 19.8, 5.0),
    seg(19.8, 5.0, 19.8, 6.6),
    seg(19.8, 6.6, 19.2, 6.6),
    seg(19.2, 6.6, 19.2, 11.2),
    // top and left outer walls
    seg(19.2, 11.2, 0.8, 11.2),
    seg(0.8, 11.2, 0.8, 0.8),
    // the block in the middle
    ...rect(3.2, 3.2, 16.8, 8.8),
    // distinct furniture so the rest of the ring does not look alike
    ...rect(6.0, 10.7, 6.5, 11.2),
    ...rect(12.4, 8.8, 12.9, 9.3),
    ...rect(0.8, 5.4, 1.25, 7.2),
    ...rect(16.8, 4.0, 17.15, 4.5),
  ],
};

// ------------------------------------------------------------------ the route

type Piece = { kind: 'line'; ax: number; ay: number; bx: number; by: number } | { kind: 'arc'; cx: number; cy: number; a0: number; a1: number };
const R = 1;
const PIECES: Piece[] = [
  { kind: 'line', ax: 4, ay: 2, bx: 17, by: 2 },
  { kind: 'arc', cx: 17, cy: 3, a0: -Math.PI / 2, a1: 0 },
  { kind: 'line', ax: 18, ay: 3, bx: 18, by: 9 },
  { kind: 'arc', cx: 17, cy: 9, a0: 0, a1: Math.PI / 2 },
  { kind: 'line', ax: 17, ay: 10, bx: 3, by: 10 },
  { kind: 'arc', cx: 3, cy: 9, a0: Math.PI / 2, a1: Math.PI },
  { kind: 'line', ax: 2, ay: 9, bx: 2, by: 3 },
  { kind: 'arc', cx: 3, cy: 3, a0: Math.PI, a1: (3 * Math.PI) / 2 },
  { kind: 'line', ax: 3, ay: 2, bx: 10.6, by: 2 },
];
const pieceLen = (p: Piece) => (p.kind === 'line' ? Math.hypot(p.bx - p.ax, p.by - p.ay) : R * Math.abs(p.a1 - p.a0));
/** Length of one lap (back to the start pose). */
export const LOOP_LEN = PIECES.slice(0, 8).reduce((s, p) => s + pieceLen(p), 0) + 1;
export const ROUTE_LEN = PIECES.reduce((s, p) => s + pieceLen(p), 0);

export function routePose(s: number): Pose2 {
  let t = Math.max(0, Math.min(ROUTE_LEN, s));
  for (const p of PIECES) {
    const L = pieceLen(p);
    if (t <= L + 1e-9 || p === PIECES[PIECES.length - 1]) {
      const f = Math.min(1, t / L);
      if (p.kind === 'line') return { x: p.ax + (p.bx - p.ax) * f, y: p.ay + (p.by - p.ay) * f, th: Math.atan2(p.by - p.ay, p.bx - p.ax) };
      const a = p.a0 + (p.a1 - p.a0) * f;
      return { x: p.cx + R * Math.cos(a), y: p.cy + R * Math.sin(a), th: a + Math.PI / 2 };
    }
    t -= L;
  }
  return { x: 4, y: 2, th: 0 };
}

/** True poses every STEP metres along the route. */
export const TRUTH: Pose2[] = (() => {
  const out: Pose2[] = [];
  for (let s = 0; s <= ROUTE_LEN + 1e-9; s += STEP) out.push(routePose(s));
  return out;
})();
/** The node where the robot is back at the start (closest to node 0 after a lap). */
export const K_CLOSE = Math.round(LOOP_LEN / STEP);
/** The node at the look-alike place 5 m on, which the false closure matches instead of node 0. */
export const J_FALSE = (() => {
  const target = TRUTH[K_CLOSE].x + ALIAS_SHIFT;
  let best = 1;
  for (let k = 1; k < K_CLOSE / 2; k++) if (Math.abs(TRUTH[k].x - target) < Math.abs(TRUTH[best].x - target)) best = k;
  return best;
})();

// ------------------------------------------------------------------ scans (robot frame)

const SCAN_BEAMS = 48;
const SCAN_RANGE = 5;

/** Wall points seen from every true pose, in that pose's own frame (what the robot stores with each node). */
export const SCANS: Float32Array[] = TRUTH.map((p, k) => {
  const rnd = mulberry32(9000 + k);
  const pts: number[] = [];
  for (let b = 0; b < SCAN_BEAMS; b++) {
    const a = (2 * Math.PI * b) / SCAN_BEAMS;
    const hit = castTrue(RING, [], p.x, p.y, p.th + a, { maxRange: SCAN_RANGE, glassCos: 2 });
    if (hit.kind === 'max') continue;
    const r = hit.range + 0.015 * gaussian(rnd);
    pts.push(r * Math.cos(a), r * Math.sin(a));
  }
  return new Float32Array(pts);
});

// ------------------------------------------------------------------ odometry and closures for a noise setting

export interface Noise {
  /** Heading noise per step (rad). */
  rot: number;
  /** Distance noise as a fraction of the step. */
  trans: number;
  seed: number;
}

export interface Drive {
  /** Measured relative motions u_1 … u_K. */
  us: Pose2[];
  infos: [number, number, number][];
  /** Dead-reckoned estimate x_0 … x_K. */
  dr: Pose2[];
  odoEdges: PoseEdge[];
  /** The two place-recognition outcomes at K_CLOSE. */
  trueClosure: PoseEdge;
  falseClosure: PoseEdge;
}

const LC_SIGMA: [number, number, number] = [0.05, 0.05, (1 * Math.PI) / 180];

/** Odometry with Gaussian noise (fixed standard-normal draws per seed, scaled by the noise level). */
export function makeDrive(n: Noise): Drive {
  const rnd = mulberry32(n.seed);
  const us: Pose2[] = [];
  const infos: [number, number, number][] = [];
  const odoEdges: PoseEdge[] = [];
  for (let k = 1; k < TRUTH.length; k++) {
    const u = between(TRUTH[k - 1], TRUTH[k]);
    const sx = Math.max(1e-3, n.trans * STEP);
    const sy = Math.max(5e-4, 0.5 * n.trans * STEP);
    const st = Math.max(1e-3, n.rot);
    const g1 = gaussian(rnd);
    const g2 = gaussian(rnd);
    const g3 = gaussian(rnd);
    const m: Pose2 = { x: u.x + sx * g1, y: u.y + sy * g2, th: u.th + st * g3 };
    const info: [number, number, number] = [1 / (sx * sx), 1 / (sy * sy), 1 / (st * st)];
    us.push(m);
    infos.push(info);
    odoEdges.push({ i: k - 1, j: k, z: m, info, kind: 'odo' });
  }
  const dr = deadReckon(TRUTH[0], us);
  const lc = mulberry32(n.seed ^ 0x9e3779b9);
  const lcNoise = (z: Pose2): Pose2 => ({ x: z.x + LC_SIGMA[0] * gaussian(lc), y: z.y + LC_SIGMA[1] * gaussian(lc), th: z.th + LC_SIGMA[2] * gaussian(lc) });
  const lcInfo: [number, number, number] = [1 / LC_SIGMA[0] ** 2, 1 / LC_SIGMA[1] ** 2, 1 / LC_SIGMA[2] ** 2];
  const trueClosure: PoseEdge = { i: 0, j: K_CLOSE, z: lcNoise(between(TRUTH[0], TRUTH[K_CLOSE])), info: lcInfo, kind: 'loop' };
  // The aliased match: the scan at K_CLOSE is registered against node J_FALSE as if the robot stood in the second alcove.
  const shifted = compose(TRUTH[K_CLOSE], { x: 0, y: 0, th: 0 });
  shifted.x += ALIAS_SHIFT;
  const falseClosure: PoseEdge = { i: J_FALSE, j: K_CLOSE, z: lcNoise(between(TRUTH[J_FALSE], shifted)), info: lcInfo, kind: 'loop' };
  return { us, infos, dr, odoEdges, trueClosure, falseClosure };
}

/**
 * Default noise sample: chosen (scratch probe over seeds 1-24 at 1°/step, 2 %) so the drift at the return is clearly
 * visible (2.3 m), every true pose sits inside its dead-reckoning 95 % ellipse, the correct closure ends with
 * χ² ≈ 4 (3 expected) and the false one with χ² ≈ 140.
 */
export const DEFAULT_SEED = 10;
