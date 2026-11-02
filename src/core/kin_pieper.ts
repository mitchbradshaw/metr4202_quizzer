// Pieper's criterion for closed-form inverse kinematics of 6-DOF arms (summary notes §6 "Closed-form IK";
// 2023 Q12 and its worked solution; review deck slide 19).
//
//   A 6-DOF arm has an analytic (closed-form) IK solution if three CONSECUTIVE revolute axes intersect at one
//   point (a spherical wrist, or a "spherical shoulder") or three consecutive revolute axes are parallel.
//   Position and orientation then decouple: e.g. with a spherical wrist the wrist centre W is fixed by the
//   desired pose, joints 1-3 place W (a 3-joint position problem), joints 4-6 give the orientation.
//
// Each layout is a 6-joint arm in its home configuration: joint type, axis direction and a point on the axis
// (where the joint body is drawn). `pieperCheck` tests every consecutive revolute triple automatically; the
// self-tests prove that every hand-written label in LAYOUTS agrees with it. Both properties it tests are
// configuration-invariant: rotating about axis i keeps where axis i+1 meets it, so "meet at one point" and
// "parallel" are the same in every pose (which is why reading them off the home pose is enough).
import { cross3, dot3, jacobianSpace, norm3, screwP, screwR, sub3, add3, scale3, type Screw, type Vec3 } from './kin';

export type JointType = 'R' | 'P';

export interface PJoint {
  type: JointType;
  /** Unit axis: revolute = rotation axis (right-hand rule), prismatic = direction of travel. */
  axis: Vec3;
  /** A point on the axis, which is also where the joint body is drawn (home configuration). */
  at: Vec3;
}

export interface PLink {
  /** 0 = base (never moves); k = 1…6 moves with joints 1…k. */
  link: number;
  pts: Vec3[];
}

export type PieperReason = 'meet' | 'parallel' | 'none' | 'orientation';

export interface PLayout {
  id: string;
  name: string;
  /** Short description for the card. */
  blurb: string;
  /** Past paper / robot it mirrors. */
  source?: string;
  joints: PJoint[];
  links: PLink[];
  /** Gripper at `at` pointing along `dir`, fingers spread along `side` (moves with link 6). */
  tool: { at: Vec3; dir: Vec3; side: Vec3 };
  /** Draw a ground hatch under joint 1 (false for a gantry hung from a rail). */
  ground?: boolean;
  /** Hand-written label (checked against pieperCheck by the self-tests). */
  closedForm: boolean;
  reason: PieperReason;
  /** 0-based indices of the consecutive triple that satisfies (or, for a "no" layout, nearly satisfies) the criterion. */
  triple?: [number, number, number];
  /** Why, in the exam's words (Rich). */
  why: string;
  /** One short line used in quiz options ("why" of the correct answer). */
  short: string;
}

// ------------------------------------------------------------------ geometry

const EPS = 1e-6;

/** Closest points of two lines p1 + s d1 and p2 + t d2 (d unit). null when parallel. */
export function closestPoints(p1: Vec3, d1: Vec3, p2: Vec3, d2: Vec3): { a: Vec3; b: Vec3; dist: number } | null {
  const n = cross3(d1, d2);
  const nn = dot3(n, n);
  if (nn < 1e-12) return null;
  const r = sub3(p2, p1);
  const s = dot3(cross3(r, d2), n) / nn;
  const t = dot3(cross3(r, d1), n) / nn;
  const a = add3(p1, scale3(d1, s));
  const b = add3(p2, scale3(d2, t));
  return { a, b, dist: norm3(sub3(a, b)) };
}

/** Distance from point x to the line p + s d (d unit). */
export function pointLineDistance(x: Vec3, p: Vec3, d: Vec3): number {
  return norm3(cross3(sub3(x, p), d));
}

export const isParallel = (d1: Vec3, d2: Vec3) => norm3(cross3(d1, d2)) < EPS;

/** Where two axes meet, or null (parallel or skew). */
export function axesMeet(p1: Vec3, d1: Vec3, p2: Vec3, d2: Vec3): Vec3 | null {
  const c = closestPoints(p1, d1, p2, d2);
  if (!c || c.dist > EPS) return null;
  return scale3(add3(c.a, c.b), 0.5);
}

export interface TripleCheck {
  /** 0-based index of the first joint of the triple. */
  start: number;
  kind: 'meet' | 'parallel' | 'prismatic' | 'none';
  /** The common point (kind 'meet'). */
  point?: Vec3;
  /** Pairwise facts for the explanation table: does i meet i+1, i+1 meet i+2, i meet i+2, parallel pairs. */
  pairs: { a: number; b: number; rel: 'meet' | 'parallel' | 'skew' }[];
  /** For 'none': the two different points where the pairs meet (an "almost wrist"), if both pairs meet. */
  near?: [Vec3, Vec3];
}

function pairRel(J: readonly PJoint[], a: number, b: number): 'meet' | 'parallel' | 'skew' {
  if (isParallel(J[a].axis, J[b].axis)) return 'parallel';
  return axesMeet(J[a].at, J[a].axis, J[b].at, J[b].axis) ? 'meet' : 'skew';
}

/** Check one consecutive triple (start, start+1, start+2). */
export function tripleCheck(J: readonly PJoint[], start: number): TripleCheck {
  const [i, j, k] = [start, start + 1, start + 2];
  const pairs = [
    { a: i, b: j, rel: pairRel(J, i, j) },
    { a: j, b: k, rel: pairRel(J, j, k) },
    { a: i, b: k, rel: pairRel(J, i, k) },
  ];
  if (J[i].type !== 'R' || J[j].type !== 'R' || J[k].type !== 'R') return { start, kind: 'prismatic', pairs };
  if (pairs.every((p) => p.rel === 'parallel')) return { start, kind: 'parallel', pairs };
  const pij = axesMeet(J[i].at, J[i].axis, J[j].at, J[j].axis);
  const pjk = axesMeet(J[j].at, J[j].axis, J[k].at, J[k].axis);
  if (pij && pjk && norm3(sub3(pij, pjk)) < 1e-5 && pointLineDistance(pij, J[k].at, J[k].axis) < 1e-5) return { start, kind: 'meet', point: pij, pairs };
  return { start, kind: 'none', pairs, near: pij && pjk ? [pij, pjk] : undefined };
}

// ------------------------------------------------------------------ rank (generic configuration)

/** Numerical rank of a small dense matrix (Gaussian elimination, full pivoting). */
export function matRank(A: readonly (readonly number[])[], tol = 1e-8): number {
  const M = A.map((r) => r.slice());
  const rows = M.length;
  const cols = rows ? M[0].length : 0;
  const scale = Math.max(1e-300, ...M.flat().map(Math.abs));
  let rank = 0;
  const usedCol = new Array<boolean>(cols).fill(false);
  for (let r = 0; r < rows && rank < cols; r++) {
    // pick the largest remaining entry
    let bi = -1;
    let bj = -1;
    let bv = 0;
    for (let i = rank; i < rows; i++)
      for (let j = 0; j < cols; j++)
        if (!usedCol[j] && Math.abs(M[i][j]) > bv) {
          bv = Math.abs(M[i][j]);
          bi = i;
          bj = j;
        }
    if (bv <= tol * scale) break;
    [M[rank], M[bi]] = [M[bi], M[rank]];
    usedCol[bj] = true;
    for (let i = 0; i < rows; i++) {
      if (i === rank) continue;
      const f = M[i][bj] / M[rank][bj];
      if (f) for (let j = 0; j < cols; j++) M[i][j] -= f * M[rank][j];
    }
    rank++;
  }
  return rank;
}

/** Screw axes of the layout in {s} (home configuration). */
export const layoutScrews = (J: readonly PJoint[]): Screw[] => J.map((j) => (j.type === 'R' ? screwR(j.axis, j.at) : screwP(j.axis)));

/** Deterministic "generic" configurations (no special angles), for rank tests. */
const GENERIC: number[][] = [
  [0.37, -0.61, 0.83, -1.07, 0.52, 0.29],
  [1.21, 0.44, -0.73, 0.66, -0.91, 1.37],
  [-0.58, 1.02, 0.19, -0.34, 1.18, -0.77],
];

/** Generic rank of the space Jacobian (6 × 6) and of its angular rows (3 × 6). */
export function genericRanks(J: readonly PJoint[]): { rank: number; wRank: number } {
  const S = layoutScrews(J);
  let rank = 0;
  let wRank = 0;
  for (const th0 of GENERIC) {
    const th = J.map((j, i) => (j.type === 'P' ? th0[i] * 0.4 : th0[i]));
    const cols = jacobianSpace(S, th);
    const full = [0, 1, 2, 3, 4, 5].map((r) => cols.map((c) => (r < 3 ? c.w[r] : c.v[r - 3])));
    rank = Math.max(rank, matRank(full));
    wRank = Math.max(wRank, matRank(full.slice(0, 3)));
  }
  return { rank, wRank };
}

export interface PieperResult {
  triples: TripleCheck[];
  rank: number;
  wRank: number;
  closedForm: boolean;
  reason: PieperReason;
  /** The first satisfying triple (closed form), as 0-based indices. */
  triple?: [number, number, number];
  point?: Vec3;
}

/** Pieper's criterion, checked automatically on a 6-joint layout. */
export function pieperCheck(J: readonly PJoint[]): PieperResult {
  const triples = [0, 1, 2, 3].filter((s) => s + 2 < J.length).map((s) => tripleCheck(J, s));
  const { rank, wRank } = genericRanks(J);
  const hit = triples.find((t) => t.kind === 'meet' || t.kind === 'parallel');
  if (wRank < 3) return { triples, rank, wRank, closedForm: false, reason: 'orientation' };
  if (rank === 6 && hit) {
    const s = hit.start;
    return { triples, rank, wRank, closedForm: true, reason: hit.kind === 'meet' ? 'meet' : 'parallel', triple: [s, s + 1, s + 2], point: hit.point };
  }
  return { triples, rank, wRank, closedForm: false, reason: 'none' };
}

// ------------------------------------------------------------------ the deck

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
const NX: Vec3 = [-1, 0, 0];
const NY: Vec3 = [0, -1, 0];
const NZ: Vec3 = [0, 0, -1];
const R = (axis: Vec3, at: Vec3): PJoint => ({ type: 'R', axis, at });
const P = (axis: Vec3, at: Vec3): PJoint => ({ type: 'P', axis, at });
const lk = (link: number, ...pts: Vec3[]): PLink => ({ link, pts });

/**
 * x to the right, y into the page, z up (the papers' oblique drawings recede up and to the right).
 * Cylinder bodies are about 0.8 long and 0.56 across; links are drawn between body centres.
 */
export const LAYOUTS: PLayout[] = [
  {
    id: 'puma',
    name: 'Elbow arm + spherical wrist (PUMA-like)',
    blurb: 'Waist, shoulder and elbow, then roll–pitch–roll at the end of the forearm.',
    source: 'Summary notes §6; review deck slide 19',
    joints: [R(Z, [0, 0, 0.45]), R(Y, [0, 0, 1.75]), R(Y, [2.0, 0, 1.75]), R(X, [3.25, 0, 1.75]), R(Y, [4.35, 0, 1.75]), R(X, [5.3, 0, 1.75])],
    links: [lk(1, [0, 0, 0.85], [0, 0, 1.75]), lk(2, [0, 0, 1.75], [2.0, 0, 1.75]), lk(3, [2.0, 0, 1.75], [3.25, 0, 1.75]), lk(4, [3.25, 0, 1.75], [4.35, 0, 1.75]), lk(5, [4.35, 0, 1.75], [5.3, 0, 1.75])],
    tool: { at: [5.95, 0, 1.75], dir: X, side: Z },
    ground: true,
    closedForm: true,
    reason: 'meet',
    triple: [3, 4, 5],
    why: 'Axes **4, 5 and 6 meet at one point**, the wrist centre $W$: a spherical wrist. The desired pose fixes $W$ (it sits a fixed distance back from the tool along its approach axis), so joints 1–3 solve a position problem for $W$ and joints 4–6 then supply the orientation. Position and orientation decouple, so the IK is closed form.',
    short: 'Axes 4, 5 and 6 meet at one point (a spherical wrist)',
  },
  {
    id: 'stanford',
    name: 'Stanford arm (R–R–P + spherical wrist)',
    blurb: 'Waist and shoulder, a sliding (prismatic) forearm, then a three-axis wrist with the gripper pointing down.',
    source: '2023 Q12 (c)',
    joints: [R(Z, [0, 0, 0.45]), R(Y, [0.9, 0, 1.9]), P(X, [2.1, 0, 1.9]), R(X, [3.3, 0, 1.9]), R(Y, [4.4, 0, 1.9]), R(Z, [4.4, 0, 0.9])],
    links: [lk(1, [0, 0, 0.85], [0, 0, 1.9], [0.9, 0, 1.9]), lk(2, [0.9, 0, 1.9], [2.1, 0, 1.9]), lk(3, [2.1, 0, 1.9], [3.3, 0, 1.9]), lk(4, [3.3, 0, 1.9], [4.4, 0, 1.9]), lk(5, [4.4, 0, 1.9], [4.4, 0, 0.9])],
    tool: { at: [4.4, 0, 0.25], dir: NZ, side: X },
    ground: true,
    closedForm: true,
    reason: 'meet',
    triple: [3, 4, 5],
    why: 'The Stanford layout of 2023 Q12 (c): R–R–P positions the wrist, then three revolute axes (4 along the forearm, 5 across it, 6 hanging down through the centre of 5) **meet at one point**. A spherical wrist, so position and orientation decouple: closed form.',
    short: 'Axes 4, 5 and 6 meet at one point (a spherical wrist)',
  },
  {
    id: 'ur',
    name: 'Three parallel axes (UR-like)',
    blurb: 'Shoulder, elbow and first wrist joint all turn about parallel axes; the wrist does not meet at a point.',
    source: 'Summary notes §6 (the "three parallel axes" case)',
    joints: [R(Z, [0, 0, 0.45]), R(Y, [0, 0, 1.6]), R(Y, [2.0, 0, 1.6]), R(Y, [3.7, 0, 1.6]), R(Z, [4.75, 0, 1.6]), R(Y, [4.75, 0, 0.6])],
    links: [lk(1, [0, 0, 0.85], [0, 0, 1.6]), lk(2, [0, 0, 1.6], [2.0, 0, 1.6]), lk(3, [2.0, 0, 1.6], [3.7, 0, 1.6]), lk(4, [3.7, 0, 1.6], [4.75, 0, 1.6]), lk(5, [4.75, 0, 1.6], [4.75, 0, 0.6])],
    tool: { at: [4.75, -0.85, 0.6], dir: NY, side: X },
    ground: true,
    closedForm: true,
    reason: 'parallel',
    triple: [1, 2, 3],
    why: 'No spherical wrist here, but axes **2, 3 and 4 are parallel**: they form a planar 3R chain that only moves in one plane. Pieper’s criterion also counts three consecutive parallel axes (they meet "at infinity"), so the IK still decouples and has a closed form. This is the layout of the UR family of cobots.',
    short: 'Axes 2, 3 and 4 are parallel',
  },
  {
    id: 'gantry',
    name: 'Gantry (P–P–P) + spherical wrist',
    blurb: 'Three slides along x, y and z carry a three-axis wrist.',
    source: 'Summary notes §6 (decoupling)',
    joints: [P(X, [0.6, 0, 2.5]), P(Y, [1.8, 0, 2.5]), P(NZ, [1.8, 0, 1.55]), R(Z, [1.8, 0, 0.8]), R(Y, [1.8, 0, 0]), R(Z, [1.8, 0, -0.8])],
    links: [lk(0, [-0.6, 0, 2.5], [0.6, 0, 2.5]), lk(1, [0.6, 0, 2.5], [1.8, 0, 2.5]), lk(2, [1.8, 0, 2.5], [1.8, 0, 1.55]), lk(3, [1.8, 0, 1.55], [1.8, 0, 0.8]), lk(4, [1.8, 0, 0.8], [1.8, 0, 0]), lk(5, [1.8, 0, 0], [1.8, 0, -0.8])],
    tool: { at: [1.8, 0, -1.45], dir: NZ, side: X },
    ground: false,
    closedForm: true,
    reason: 'meet',
    triple: [3, 4, 5],
    why: 'Three prismatic joints place the wrist anywhere in a box, and axes **4, 5 and 6 meet at one point**. A spherical wrist on a Cartesian base is the easiest decoupling of all: the slides give $W$ directly, the wrist gives the orientation.',
    short: 'Axes 4, 5 and 6 meet at one point (a spherical wrist)',
  },
  {
    id: 'shoulder',
    name: 'Spherical shoulder (axes 1–2–3 meet)',
    blurb: 'Three revolute axes cross at the shoulder; the wrist further out is offset.',
    source: 'Summary notes §6 (any three consecutive axes)',
    joints: [R(Z, [0, 0, 0.45]), R(Y, [0, 0, 1.7]), R(X, [1.0, 0, 1.7]), R(Y, [2.5, 0, 1.7]), R(Z, [3.8, 0, 1.7]), R(Y, [3.8, 0, 0.7])],
    links: [lk(1, [0, 0, 0.85], [0, 0, 1.7]), lk(2, [0, 0, 1.7], [1.0, 0, 1.7]), lk(3, [1.0, 0, 1.7], [2.5, 0, 1.7]), lk(4, [2.5, 0, 1.7], [3.8, 0, 1.7]), lk(5, [3.8, 0, 1.7], [3.8, 0, 0.7])],
    tool: { at: [3.8, -0.85, 0.7], dir: NY, side: X },
    ground: true,
    closedForm: true,
    reason: 'meet',
    triple: [0, 1, 2],
    why: 'The criterion asks for **any** three consecutive revolute axes: here axes **1, 2 and 3 meet at one point** at the shoulder. Read the chain backwards from the tool and the shoulder becomes a "wrist", so the same decoupling works and the IK is closed form.',
    short: 'Axes 1, 2 and 3 meet at one point',
  },
  {
    id: 'q12a',
    name: 'Offset wrist (2023 Q12 (a))',
    blurb: 'Like a PUMA, but the last joint hangs from the far end of joint 5.',
    source: '2023 Q12 (a)',
    joints: [R(Z, [0, 0, 0.45]), R(Y, [0, 0, 1.9]), R(Y, [1.7, 0, 1.9]), R(X, [2.9, 0, 1.9]), R(Y, [4.0, 0, 1.9]), R(Z, [4.0, 0.75, 0.85])],
    links: [lk(1, [0, 0, 0.85], [0, 0, 1.9]), lk(2, [0, 0, 1.9], [1.7, 0, 1.9]), lk(3, [1.7, 0, 1.9], [2.9, 0, 1.9]), lk(4, [2.9, 0, 1.9], [4.0, 0, 1.9]), lk(5, [4.0, 0, 1.9], [4.0, 0.75, 1.9], [4.0, 0.75, 0.85])],
    tool: { at: [4.0, 0.75, 0.2], dir: NZ, side: X },
    ground: true,
    closedForm: false,
    reason: 'none',
    triple: [3, 4, 5],
    why: 'The last link is **offset along joint 5’s axis**, so axis 6 meets axis 5 at a different point from axis 4: axes 4, 5 and 6 do not meet at one point (2023 worked solutions). Axes 2, 3 and 5 are parallel, but they are not consecutive. No triple qualifies, so no closed form: this arm needs numerical IK.',
    short: 'No three consecutive revolute axes meet at one point or are parallel',
  },
  {
    id: 'q12b',
    name: 'Prismatic base, no qualifying triple (2023 Q12 (b))',
    blurb: 'A vertical slide, a waist, two parallel axes, then two wrist axes that meet each other but not axis 4.',
    source: '2023 Q12 (b)',
    joints: [P(Z, [0, 0, 0.45]), R(Z, [0, 0, 1.35]), R(Y, [0.9, 0, 2.3]), R(Y, [2.5, 0, 2.3]), R(Z, [3.9, 0, 2.3]), R(X, [3.9, 0, 1.25])],
    links: [lk(1, [0, 0, 0.45], [0, 0, 1.35]), lk(2, [0, 0, 1.35], [0, 0, 2.3], [0.9, 0, 2.3]), lk(3, [0.9, 0, 2.3], [2.5, 0, 2.3]), lk(4, [2.5, 0, 2.3], [3.9, 0, 2.3]), lk(5, [3.9, 0, 2.3], [3.9, 0, 1.25])],
    tool: { at: [4.6, 0, 1.25], dir: X, side: Z },
    ground: true,
    closedForm: false,
    reason: 'none',
    triple: [3, 4, 5],
    why: 'Axes 3 and 4 are parallel, but axis 5 is not; axes 5 and 6 meet, but axis 4 misses that point. **No three consecutive revolute axes meet at one point or are parallel** (2023 worked solutions), so there is no closed form.',
    short: 'No three consecutive revolute axes meet at one point or are parallel',
  },
  {
    id: 'q12d',
    name: 'Every revolute axis parallel (2023 Q12 (d))',
    blurb: 'Three slides and three revolute joints, all turning about the same direction.',
    source: '2023 Q12 (d)',
    joints: [P(Z, [0, 0, 0.45]), R(Y, [0, 0, 1.9]), R(Y, [1.6, 0, 1.9]), P(X, [2.9, 0, 1.9]), P(Y, [4.1, 0, 1.9]), R(Y, [4.1, 0, 0.85])],
    links: [lk(1, [0, 0, 0.45], [0, 0, 1.9]), lk(2, [0, 0, 1.9], [1.6, 0, 1.9]), lk(3, [1.6, 0, 1.9], [2.9, 0, 1.9]), lk(4, [2.9, 0, 1.9], [4.1, 0, 1.9]), lk(5, [4.1, 0, 1.9], [4.1, 0, 0.85])],
    tool: { at: [4.1, -0.85, 0.85], dir: NY, side: X },
    ground: true,
    closedForm: false,
    reason: 'orientation',
    triple: [1, 2, 5],
    why: '**Every revolute axis is parallel** to the same direction, so the gripper can only ever rotate about that one direction: it **cannot reach arbitrary orientations**, whatever the joint values (the angular rows of the Jacobian have rank 1). The three parallel axes are not even consecutive (slides sit between them). No general IK solution, closed form or otherwise.',
    short: 'All revolute axes are parallel, so it cannot reach arbitrary orientations',
  },
  {
    id: 'skew',
    name: 'Elbow arm, skewed wrist',
    blurb: 'Like a PUMA, but the forearm doglegs down, so the wrist pitch axis passes below the roll axis.',
    source: 'Summary notes §6 (a near-miss)',
    joints: [R(Z, [0, 0, 0.45]), R(Y, [0, 0, 1.8]), R(Y, [1.9, 0, 1.8]), R(X, [3.1, 0, 1.8]), R(Y, [4.2, 0, 1.2]), R(X, [5.1, 0, 1.2])],
    links: [lk(1, [0, 0, 0.85], [0, 0, 1.8]), lk(2, [0, 0, 1.8], [1.9, 0, 1.8]), lk(3, [1.9, 0, 1.8], [3.1, 0, 1.8]), lk(4, [3.1, 0, 1.8], [3.75, 0, 1.8], [3.75, 0, 1.2], [4.2, 0, 1.2]), lk(5, [4.2, 0, 1.2], [5.1, 0, 1.2])],
    tool: { at: [5.75, 0, 1.2], dir: X, side: Z },
    ground: true,
    closedForm: false,
    reason: 'none',
    triple: [3, 4, 5],
    why: 'Axes 5 and 6 meet, but **axis 4 passes above that point**: the dogleg makes axes 4 and 5 skew (they never meet). Axes 4 and 6 are parallel, but axis 5 between them is not. No consecutive triple qualifies, so no closed form, even though it looks almost like a PUMA.',
    short: 'No three consecutive revolute axes meet at one point or are parallel',
  },
];

export const layoutById = (id: string) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];

/** The 2023 Q12 set in the paper's order (a), (b), (c), (d). */
export const EXAM_2023_Q12 = ['q12a', 'q12b', 'stanford', 'q12d'] as const;

/** "1-2-3" for 0-based [0, 1, 2]. */
export const tripleName = (t: readonly number[]) => t.map((i) => i + 1).join('–');
