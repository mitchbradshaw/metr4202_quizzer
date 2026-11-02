// Pure helpers behind the 3-D kinematics simulations (Viewer3D, BuildM, ScrewTable, PoeStepper).
// No React and no three.js here: every function is checked by tests/threed.ts.
//
//   - the paper's oblique "exam view" (summary notes §6 step 1: which arrow points out of the page),
//   - signed {s} axes for building R column by column (step 2: the columns of R are x̂_b, ŷ_b, ẑ_b in {s}),
//   - the notes' cross-product shortcut table for v = −ω × q (step 3) and q sliding along its axis,
//   - {b}-frame readings (step 4: ω and q in {b}, measured from the {b} origin),
//   - the product of exponentials applied one factor at a time, in space and in body form.
import {
  ZERO,
  C,
  applyT,
  identity,
  cross3,
  crossNL,
  dot3,
  expScrew,
  linAdd,
  linEval,
  linNeg,
  linScale,
  linTeX,
  linVecEval,
  linVecSub,
  matMul,
  matTLin,
  randomArm,
  spaceToBody,
  symScrewB,
  symScrewS,
  type ArmSpec,
  type Lin,
  type LinVec,
  type Mat3,
  type Mat4,
  type Screw,
  type Vec3,
} from '../../../core/kin';
import { evaluate, usesSymbols } from '../../../engine/expr';
import { symbolSets } from '../../../engine/check';
import { mulberry32 } from '../../../engine/rng';

export type View = ArmSpec['view'];
export type Frame = 's' | 'b';

// ------------------------------------------------------------------ signed axes

export interface SignedAxis {
  id: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
  v: Vec3;
  axis: 0 | 1 | 2;
  sign: 1 | -1;
}

export const SIGNED_AXES: readonly SignedAxis[] = [
  { id: '+x', v: [1, 0, 0], axis: 0, sign: 1 },
  { id: '-x', v: [-1, 0, 0], axis: 0, sign: -1 },
  { id: '+y', v: [0, 1, 0], axis: 1, sign: 1 },
  { id: '-y', v: [0, -1, 0], axis: 1, sign: -1 },
  { id: '+z', v: [0, 0, 1], axis: 2, sign: 1 },
  { id: '-z', v: [0, 0, -1], axis: 2, sign: -1 },
];

export const axisById = (id: string): SignedAxis | undefined => SIGNED_AXES.find((a) => a.id === id);

/** x̂ orange, ŷ green, ẑ blue (RGB order with orange for red, because red means "wrong"). */
export const AXIS_VARS = ['--m2', '--m3', '--m1'] as const;
export const AXIS_LETTERS = ['x', 'y', 'z'] as const;

/** The signed unit axis equal to v, or null when v is not axis-aligned. */
export function signedAxisOf(v: Vec3, tol = 1e-9): SignedAxis | null {
  return SIGNED_AXES.find((a) => Math.abs(a.v[0] - v[0]) < tol && Math.abs(a.v[1] - v[1]) < tol && Math.abs(a.v[2] - v[2]) < tol) ?? null;
}

/** Index (0, 1, 2) of the largest component: the colour family of a direction. */
export const dominantAxis = (v: Vec3): 0 | 1 | 2 => {
  const a = v.map(Math.abs);
  return (a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2) as 0 | 1 | 2;
};

export const hatTeX = (axis: 0 | 1 | 2, sub: string) => `\\hat{${AXIS_LETTERS[axis]}}_{${sub}}`;

/** '+\hat{x}_{s}', '-\hat{z}_{b}', '\mathbf{0}', or the components for a general vector. */
export function signedAxisTeX(v: Vec3, sub = 's', plus = true): string {
  if (Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]) < 1e-12) return '\\mathbf{0}';
  const a = signedAxisOf(v);
  if (!a) return vecNumTeX(v);
  return `${a.sign < 0 ? '-' : plus ? '+' : ''}${hatTeX(a.axis, sub)}`;
}

// ------------------------------------------------------------------ number and matrix formatting

/** A number for TeX: 3 significant figures, tiny values shown as 0. */
export function numTeX(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return '?';
  if (Math.abs(x) < 5e-4) return '0';
  return String(Number(x.toPrecision(sig)));
}

export const vecNumTeX = (v: readonly number[], sig = 3) => `(${v.map((x) => numTeX(x, sig)).join(',\\ ')})`;
export const linVecTeXs = (v: LinVec) => `(${v.map(linTeX).join(',\\ ')})`;

/** A matrix as a TeX bmatrix; null entries show as a placeholder. */
export function matTeX(A: readonly (readonly (number | null | string)[])[], sig = 3, blank = '\\square'): string {
  const rows = A.map((r) => r.map((x) => (x === null ? blank : typeof x === 'string' ? x : numTeX(x, sig))).join(' & '));
  return `\\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
}

// ------------------------------------------------------------------ the paper's oblique drawing

/** On the papers, the out-of-page axis is drawn at half length, 45° down and to the left (cabinet oblique). */
export const OBLIQUE_K = 0.5;
export const OBLIQUE_ANGLE = Math.PI / 4;

/** Where a 3-D point (in {s}) lands on the paper's drawing: (screen right, screen up). */
export function paperXY(p: Vec3, view: View): [number, number] {
  const o = dot3(p, view.out);
  return [dot3(p, view.right) - OBLIQUE_K * Math.cos(OBLIQUE_ANGLE) * o, dot3(p, view.up) - OBLIQUE_K * Math.sin(OBLIQUE_ANGLE) * o];
}

const same = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-9;
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];

/** How the paper draws a unit direction: 'right', 'down', 'into the page (drawn up-right)' … */
export function paperWords(d: Vec3, view: View): string {
  if (same(d, view.right)) return 'right';
  if (same(d, neg(view.right))) return 'left';
  if (same(d, view.up)) return 'up';
  if (same(d, neg(view.up))) return 'down';
  if (same(d, view.out)) return 'out of the page (drawn down-left)';
  if (same(d, neg(view.out))) return 'into the page (drawn up-right)';
  return 'at an angle';
}

/** True when the paper draws this direction diagonally, i.e. it points into or out of the page. */
export const drawnDiagonally = (d: Vec3, view: View) => Math.abs(dot3(d, view.out)) > 0.5;

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

/** Where the free-orbit camera starts so that it resembles the exam view: in front, a little right and up. */
export function examOrbitDir(view: View): Vec3 {
  return unit([view.out[0] + 0.62 * view.right[0] + 0.5 * view.up[0], view.out[1] + 0.62 * view.right[1] + 0.5 * view.up[1], view.out[2] + 0.62 * view.right[2] + 0.5 * view.up[2]]);
}

/** Camera directions for the quick views: from above (out of the page points down the screen) and from the right. */
export function topDir(view: View): Vec3 {
  return unit([view.up[0] + 0.06 * view.out[0], view.up[1] + 0.06 * view.out[1], view.up[2] + 0.06 * view.out[2]]);
}
export function sideDir(view: View): Vec3 {
  return unit([view.right[0] + 0.18 * view.up[0] + 0.04 * view.out[0], view.right[1] + 0.18 * view.up[1] + 0.04 * view.out[1], view.right[2] + 0.18 * view.up[2] + 0.04 * view.out[2]]);
}
export function frontDir(view: View): Vec3 {
  return unit([view.out[0] + 0.04 * view.up[0], view.out[1] + 0.04 * view.up[1], view.out[2] + 0.04 * view.up[2]]);
}

// ------------------------------------------------------------------ R from axis picks

/** R with the picked columns (null = not picked yet). */
export function rFromColumns(cols: readonly (Vec3 | null)[]): (number | null)[][] {
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (cols[j] ? (cols[j] as Vec3)[i] : null)));
}

export type Handed = 'right' | 'left' | 'degenerate';
/** det [a b c] = (a × b) · c. */
export const detCols = (a: Vec3, b: Vec3, c: Vec3) => dot3(cross3(a, b), c);
export function handedness(a: Vec3, b: Vec3, c: Vec3): Handed {
  const d = detCols(a, b, c);
  return d > 0.5 ? 'right' : d < -0.5 ? 'left' : 'degenerate';
}

/** The signed {s} axis of each column of R (what a student must pick), or null for a non-axis-aligned column. */
export const columnsOf = (R: Mat3): (SignedAxis | null)[] => [0, 1, 2].map((j) => signedAxisOf([R[0][j], R[1][j], R[2][j]]));

// ------------------------------------------------------------------ cross-product shortcuts (notes §6)

/** The notes' table: v = −ω × q for ω = x̂, ŷ, ẑ (negate for −ω). */
export const SHORTCUT_TEX = ['(0,\\ q_z,\\ -q_y)', '(-q_z,\\ 0,\\ q_x)', '(q_y,\\ -q_x,\\ 0)'] as const;

/**
 * The notes' shortcut row for a joint axis, with the sign of ω as used: e.g. the 2024 arm's joint 3 (axis −x̂):
 * 'ω = −x̂: v = −(0, q_z, −q_y)'. `flipped` reverses ω (the student read the arrow the other way). '' if not axis-aligned.
 */
export function shortcutNoteTeX(dir: Vec3, flipped = false): string {
  const a = signedAxisOf(dir);
  if (!a) return '';
  const neg = (a.sign < 0) !== flipped ? '-' : '';
  return `\\omega = ${neg}\\hat{${AXIS_LETTERS[a.axis]}}:\\ v = ${neg}${SHORTCUT_TEX[a.axis]}`;
}

/** v = −ω × q by the shortcut table (exact for ±x̂, ±ŷ, ±ẑ; a general ω falls back to the cross product). */
export function shortcutV(w: Vec3, q: LinVec): LinVec {
  const a = signedAxisOf(w);
  if (!a) return crossNL(w, q).map(linNeg) as LinVec;
  const [qx, qy, qz] = q;
  const row: LinVec = a.axis === 0 ? [ZERO, qz, linNeg(qy)] : a.axis === 1 ? [linNeg(qz), ZERO, qx] : [qy, linNeg(qx), ZERO];
  return row.map((x) => linScale(x, a.sign)) as LinVec;
}

/** The same row with this q substituted, as TeX: e.g. ω = −ŷ, q = (L_2, 0, L_1): −(−L_1, 0, L_2). */
export function shortcutWorkTeX(w: Vec3, q: LinVec): string {
  const a = signedAxisOf(w);
  if (!a) return '';
  const pos = shortcutV(a.v.map((x) => Math.abs(x)) as Vec3, q);
  const inner = linVecTeXs(pos);
  return a.sign > 0 ? inner : `-${inner}`;
}

/** q + tω: another point on the same axis. */
export const qShift = (q: LinVec, w: Vec3, t: number): LinVec => [linAdd(q[0], C(t * w[0])), linAdd(q[1], C(t * w[1])), linAdd(q[2], C(t * w[2]))];

/**
 * The slide t (along an axis-aligned joint direction) that takes the plain number out of q's coordinate along the
 * axis. That number only says where along its own axis the joint happens to be drawn (the review deck's joint 3 at
 * 0.35 m), so qShift(q, dir, tidyT(q, dir)) is a point on the same axis written with the figure's lengths only.
 * 0 when there is nothing to remove (or the axis is not along x̂, ŷ or ẑ).
 */
export function tidyT(q: LinVec, dir: Vec3): number {
  const a = signedAxisOf(dir);
  if (!a) return 0;
  const c = q[a.axis]['1'] ?? 0;
  return Math.abs(c) < 1e-12 ? 0 : -a.sign * c;
}

/** The point of the axis nearest the frame origin, q − (q·ω)ω: its along-axis coordinate is 0 (the simplest q). */
export function qFoot(q: LinVec, w: Vec3): LinVec {
  const qw = linAdd(linScale(q[0], w[0]), linScale(q[1], w[1]), linScale(q[2], w[2]));
  return [0, 1, 2].map((k) => linAdd(q[k], linScale(qw, -w[k]))) as LinVec;
}

/** Numeric t that moves q to the foot of the perpendicular from the origin (for animating the slide). */
export const tToFoot = (q: LinVec, w: Vec3, vals: Record<string, number>) => -dot3(linVecEval(q, vals), w);

// ------------------------------------------------------------------ joints read in {s} or {b}

export interface JointRead {
  type: 'R' | 'P';
  /** ω in the table's frame (0 for prismatic). */
  w: Vec3;
  /** v in the table's frame. */
  v: LinVec;
  /** The point on the axis used, in the table's frame (prismatic: where the joint is drawn). */
  q: LinVec;
  /** Joint axis direction in the table's frame (revolute: ω; prismatic: the direction of travel). */
  dir: Vec3;
  /** The same joint in {s} coordinates (for drawing). */
  qS: LinVec;
  dirS: Vec3;
}

/** R v for numeric R and a symbolic vector. */
export function matLin(R: Mat3, q: LinVec): LinVec {
  return [0, 1, 2].map((i) => linAdd(linScale(q[0], R[i][0]), linScale(q[1], R[i][1]), linScale(q[2], R[i][2]))) as LinVec;
}
export const rtVec = (R: Mat3, v: Vec3): Vec3 => [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];
/** A {s} point written in {b}: q_b = Rᵀ(q_s − p). */
export const toBodyPoint = (arm: ArmSpec, q: LinVec): LinVec => matTLin(arm.R, linVecSub(q, arm.p));
/** A {b} point written in {s}: q_s = p + R q_b. */
export const fromBodyPoint = (arm: ArmSpec, qb: LinVec): LinVec => {
  const r = matLin(arm.R, qb);
  return [linAdd(arm.p[0], r[0]), linAdd(arm.p[1], r[1]), linAdd(arm.p[2], r[2])];
};

export function readJoint(arm: ArmSpec, i: number, frame: Frame): JointRead {
  const j = arm.joints[i];
  const sym = frame === 's' ? symScrewS(arm, i) : symScrewB(arm, i);
  const dir = frame === 's' ? j.axis : rtVec(arm.R, j.axis);
  const q = j.type === 'R' ? (sym.q as LinVec) : frame === 's' ? j.q : toBodyPoint(arm, j.q);
  return { type: j.type, w: sym.w, v: sym.v, q, dir, qS: j.q, dirS: j.axis };
}

// ------------------------------------------------------------------ checking typed cells

export type CellState = 'empty' | 'invalid' | 'ok' | 'neg' | 'bad';

/** Compare a typed cell with a linear form by evaluating both at three hidden sets of symbol values. */
export function checkLinCell(typed: string, ans: Lin, symbols: readonly string[]): CellState {
  if (!typed.trim()) return 'empty';
  const sets = symbolSets(symbols);
  const xs = sets.map((s) => evaluate(typed, s));
  if (xs.some((x) => !Number.isFinite(x))) return 'invalid';
  const ys = sets.map((s) => linEval(ans, s));
  const eq = (sg: number) => xs.every((x, k) => Math.abs(x - sg * ys[k]) <= 1e-6 * Math.max(1, Math.abs(ys[k])));
  if (eq(1)) return 'ok';
  if (eq(-1)) return 'neg';
  return 'bad';
}

/** Like checkLinCell, but a plain number is compared with the drawn lengths (±0.01 m). */
export function checkLenCell(typed: string, ans: Lin, symbols: readonly string[], vals: Record<string, number>): CellState {
  if (!typed.trim()) return 'empty';
  if (usesSymbols(typed)) return checkLinCell(typed, ans, symbols);
  const x = evaluate(typed);
  if (!Number.isFinite(x)) return 'invalid';
  const y = linEval(ans, vals);
  if (Math.abs(x - y) <= 0.01) return 'ok';
  if (Math.abs(x + y) <= 0.01) return 'neg';
  return 'bad';
}

// ------------------------------------------------------------------ lengths used for drawing

/**
 * Lengths used to draw the exam robots. The papers' figures are not to scale and some of the given numbers
 * (2025: L1 = 0.1 m, 2024: L2 = 0.1 m) would make joints overlap, so these follow the figures' proportions.
 * M and the screw axes are symbolic, so nothing the exam asks depends on them.
 */
const DRAW: Record<string, Record<string, number>> = {
  'rprr-2023': { L1: 1.2, L2: 0.5, L3: 0.6 },
  'prr-2024': { L1: 1.2, L2: 0.45, L3: 0.9 },
  'rrrrr-2025': { L1: 0.35, L2: 0.8, L3: 0.8, L4: 0.4 },
};
export const drawValues = (arm: ArmSpec): Record<string, number> => DRAW[arm.id] ?? arm.values;

/** "L1 = 1.2 m, L2 = 0.5 m" */
export const valuesText = (arm: ArmSpec, vals: Record<string, number>) => arm.symbols.map((s) => `${s} = ${vals[s]} m`).join(', ');

/** A random axis-aligned arm (3 to 5 joints) from a seed, as in the exam's figures. */
export function randomArmFor(seed: number): ArmSpec {
  const next = mulberry32(seed);
  const n = 3 + Math.floor(next() * 3);
  return { ...randomArm(next, n), id: `random-${seed}` };
}

/** Points that bound the robot at the zero configuration (links, joints, both frame origins). */
export function armBounds(arm: ArmSpec, vals: Record<string, number>): { center: Vec3; radius: number; size: number; pts: Vec3[] } {
  const pts: Vec3[] = [[0, 0, 0], linVecEval(arm.p, vals)];
  arm.links.forEach((l) => l.pts.forEach((p) => pts.push(linVecEval(p, vals))));
  arm.joints.forEach((j) => pts.push(linVecEval(j.q, vals)));
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  const center: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const size = Math.max(0.6, hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const radius = Math.max(...pts.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])));
  return { center, radius: radius + 0.3 * size, size, pts };
}

/** Tips of the {s} triad and of the {b} triad (at the zero configuration), where their axis labels sit. */
export function triadTips(arm: ArmSpec, vals: Record<string, number>, len: number): Vec3[] {
  const p = linVecEval(arm.p, vals);
  const out: Vec3[] = [];
  for (let k = 0; k < 3; k++) {
    const e: Vec3 = [0, 0, 0];
    e[k] = len;
    out.push(e, [p[0] + len * arm.R[0][k], p[1] + len * arm.R[1][k], p[2] + len * arm.R[2][k]]);
  }
  return out;
}

/**
 * Where to put a screw axis's tag: just past the arrowhead, unless a frame label already sits there (an axis
 * through the {b} origin along one of {b}'s axes, say), in which case at the tail end of the line.
 */
export function axisTagAt(q: Vec3, w: Vec3, span: readonly [number, number], avoid: readonly Vec3[], minDist: number, ext: number): Vec3 {
  const at = (t: number): Vec3 => [q[0] + w[0] * t, q[1] + w[1] * t, q[2] + w[2] * t];
  const head = at(span[1] + ext);
  const clash = avoid.some((a) => Math.hypot(a[0] - head[0], a[1] - head[1], a[2] - head[2]) < minDist);
  return clash ? at(span[0] - ext * 0.6) : head;
}

/** How far a line through q along w must run (in units of w, both ways) to poke out of the robot by `margin`. */
export function axisSpan(pts: readonly Vec3[], q: Vec3, w: Vec3, margin: number): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const p of pts) {
    const s = (p[0] - q[0]) * w[0] + (p[1] - q[1]) * w[1] + (p[2] - q[2]) * w[2];
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  return [lo - margin, hi + margin];
}

// ------------------------------------------------------------------ product of exponentials, one factor at a time

export type PoeForm = 's' | 'b';

/**
 * The joint applied by factor number k (1 … n) in build order. Space form, built from M leftwards:
 * e^[Sn]θn first, e^[S1]θ1 last. Body form, built from M rightwards: e^[B1]θ1 first. Returns a 0-based index.
 */
export const poeJointAt = (n: number, k: number, form: PoeForm) => (form === 's' ? n - k : k - 1);

/**
 * The configuration after s factors (s continuous in [0, n]; a fraction is mid-animation). Space form moves the
 * distal joints first, (0, …, 0, θk, …, θn); body form the proximal ones, (θ1, …, θk, 0, …, 0).
 */
export function poePose(theta: readonly number[], s: number, form: PoeForm): number[] {
  const n = theta.length;
  return theta.map((th, j) => th * Math.max(0, Math.min(1, form === 's' ? s - (n - 1 - j) : s - j)));
}

/** Factor matrices in build order, and the running product after k = 0 … n factors (running[0] = M). */
export function poeSteps(M: Mat4, S: readonly Screw[], theta: readonly number[], form: PoeForm): { joint: number[]; factor: Mat4[]; running: Mat4[]; B: Screw[] } {
  const n = S.length;
  const B = spaceToBody(M, S);
  const running: Mat4[] = [M];
  const factor: Mat4[] = [];
  const joint: number[] = [];
  for (let k = 1; k <= n; k++) {
    const j = poeJointAt(n, k, form);
    const E = expScrew(form === 's' ? S[j] : B[j], theta[j]);
    factor.push(E);
    joint.push(j);
    running.push(form === 's' ? matMul(E, running[k - 1]) : matMul(running[k - 1], E));
  }
  return { joint, factor, running, B };
}

/** What you get if the space-form factors are applied in the wrong order (e^[S1]θ1 first): e^[Sn]θn ⋯ e^[S1]θ1 M. */
export function poeWrongOrder(M: Mat4, S: readonly Screw[], theta: readonly number[]): Mat4 {
  let T: Mat4 = M;
  S.forEach((s, i) => (T = matMul(expScrew(s, theta[i]), T)));
  return T;
}

/** Build step (1 … n) at which joint j (0-based) is applied: the inverse of poeJointAt. */
export const poeStepOf = (n: number, j: number, form: PoeForm) => (form === 's' ? n - j : j + 1);

/**
 * Body transforms when the space-form factors are applied in the WRONG order: e^[S1]θ1 first, every factor about
 * its axis fixed in {s}. Body a gets W_a = e^[Sa]θa' ⋯ e^[S1]θ1' (θ' = the proximal-first schedule at s), so at
 * s = n the end-effector is at W_n M = e^[Sn]θn ⋯ e^[S1]θ1 M (poeWrongOrder), not T(θ).
 */
export function wrongOrderBodies(S: readonly Screw[], theta: readonly number[], s: number): Mat4[] {
  const th = poePose(theta, s, 'b');
  const out: Mat4[] = [identity(4)];
  S.forEach((sc, a) => out.push(matMul(expScrew(sc, th[a]), out[a])));
  return out;
}

export interface Tear {
  joint: number;
  /** Where the distal side of the joint should be (carried by the proximal body). */
  at: Vec3;
  /** Where it is. */
  to: Vec3;
  gap: number;
}

/**
 * Where body transforms W tear the arm apart. Joint j's distal side should sit at W_j e^[Sj]θj q_j (the joint's own
 * motion, seen from the proximal body); it sits at W_{j+1} q_j. A real pose (partial products) has every gap 0.
 */
export function bodyTears(W: readonly Mat4[], S: readonly Screw[], th: readonly number[], qs: readonly Vec3[]): Tear[] {
  return qs.map((q, j) => {
    const at = applyT(matMul(W[j], expScrew(S[j], th[j])), q);
    const to = applyT(W[j + 1], q);
    return { joint: j, at, to, gap: Math.hypot(to[0] - at[0], to[1] - at[1], to[2] - at[2]) };
  });
}

/**
 * The wrong order, just before factor j + 1 (joint j, 0-based) is applied about its fixed axis: 'fine' if the earlier
 * factors left joint j where S_j says, 'off' if they carried a revolute joint off its fixed axis line (the arm tears
 * there), 'tilted' if the joint is still on the line (or is prismatic) but its axis now points another way.
 */
export function wrongStepStatus(S: readonly Screw[], theta: readonly number[], qs: readonly Vec3[], j: number, tol: number): 'fine' | 'off' | 'tilted' {
  if (j <= 0) return 'fine';
  const W = wrongOrderBodies(S, theta, j)[j];
  const isR = Math.hypot(S[j].w[0], S[j].w[1], S[j].w[2]) > 0.5;
  const ax: Vec3 = isR ? S[j].w : S[j].v;
  const q = applyT(W, qs[j]);
  const d: Vec3 = [q[0] - qs[j][0], q[1] - qs[j][1], q[2] - qs[j][2]];
  const along = dot3(d, ax);
  if (isR && Math.hypot(d[0] - along * ax[0], d[1] - along * ax[1], d[2] - along * ax[2]) > tol) return 'off';
  const R = [0, 1, 2].map((r) => [W[r][0], W[r][1], W[r][2]]);
  const now: Vec3 = [0, 1, 2].map((r) => R[r][0] * ax[0] + R[r][1] * ax[1] + R[r][2] * ax[2]) as Vec3;
  return Math.hypot(now[0] - ax[0], now[1] - ax[1], now[2] - ax[2]) > 1e-3 ? 'tilted' : 'fine';
}

/**
 * Animation segments from s0 to target, split at whole steps so that each factor eases in and out on its own:
 * poeSegments(0.4, 2) = [[0.4, 1], [1, 2]].
 */
export function poeSegments(s0: number, target: number): [number, number][] {
  const segs: [number, number][] = [];
  const dir = Math.sign(target - s0);
  let a = s0;
  for (let guard = 0; dir !== 0 && Math.abs(target - a) > 1e-9 && guard < 64; guard++) {
    let b = dir > 0 ? Math.floor(a + 1e-9) + 1 : Math.ceil(a - 1e-9) - 1;
    if (dir > 0 ? b > target : b < target) b = target;
    segs.push([a, b]);
    a = b;
  }
  return segs;
}

/** A starting pose that shows every factor clearly: revolute joints 35–55° (alternating sign), prismatic 0.25 m. */
export function defaultPoeTheta(arm: ArmSpec): number[] {
  const deg = [40, -35, 50, 45, -55, 30, 40];
  return arm.joints.map((j, i) => (j.type === 'R' ? deg[i % deg.length] * DEG : 0.25));
}

/** e^{[S_3]\theta_3} (space) or e^{[B_3]\theta_3} (body) for joint j (0-based). */
export const factorTeX = (form: PoeForm, j: number) => `e^{[${form === 's' ? 'S' : 'B'}_{${j + 1}}]\\theta_{${j + 1}}}`;

/** The running product after k factors, e.g. space n = 4, k = 2: e^{[S_3]θ_3} e^{[S_4]θ_4} M. wrong: e^{[S_2]θ_2} e^{[S_1]θ_1} M. */
export function productTeX(n: number, k: number, form: PoeForm, wrong = false): string {
  if (k <= 0) return 'M';
  if (wrong) return `${Array.from({ length: k }, (_, i) => factorTeX('s', k - 1 - i)).join('')} M`;
  if (form === 's') return `${Array.from({ length: k }, (_, i) => factorTeX('s', n - k + i)).join('')} M`;
  return `M ${Array.from({ length: k }, (_, i) => factorTeX('b', i)).join('')}`;
}

/** Largest absolute difference between two matrices. */
export const maxDiff = (A: readonly (readonly number[])[], B: readonly (readonly number[])[]) => Math.max(...A.map((r, i) => Math.max(...r.map((x, j) => Math.abs(x - B[i][j])))));

/** Degrees ↔ radians for sliders. */
export const DEG = Math.PI / 180;
