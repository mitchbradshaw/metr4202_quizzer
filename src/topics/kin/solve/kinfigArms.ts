// Arm pools and symbolic helpers shared by the kinematics exam-mode generators (kin-m, kin-screws,
// kin-arm-camera, kin-poe, kin-jacobian): the exam robots from src/core/kin.ts, random axis-aligned arms that
// are tidied and checked so their drawing is unambiguous, re-labelled {s} frames (the twist where ŷ_s or ẑ_0
// points into the page), and the TeX / string forms the parts and hints print.
import {
  EXAM_ARMS,
  dot3,
  linAdd,
  linScale,
  linStr,
  linTeX,
  linVecEval,
  norm3,
  randomArm,
  scale3,
  sub3,
  symScrewB,
  symScrewS,
  ZERO,
  type ArmSpec,
  type Lin,
  type LinVec,
  type Mat3,
  type Vec3,
} from '../../../core/kin';
import type { Rng } from '../../../engine/rng';
import { drawValues, pointSegDist, projectUnit, segSegDist } from './kinfigLayout';

/**
 * Lengths for drawing (and for numeric parts) where the core values crowd the figure: the review deck's arm has
 * three short links after a long L3, which packs joints 4–6 into a corner.
 */
const FIG_VALUES: Record<string, Record<string, number>> = {
  'review-6dof': { L1: 0.6, L2: 0.4, L3: 0.6, L4: 0.45, L5: 0.4, L6: 0.35 },
};

export function examArm(id: string): ArmSpec {
  const a = EXAM_ARMS.find((x) => x.id === id);
  if (!a) throw new Error(`no exam arm ${id}`);
  return FIG_VALUES[id] ? { ...a, values: { ...FIG_VALUES[id] } } : a;
}

/** Where each exam robot comes from, for prompts and citations. */
export const ARM_PAPER: Record<string, string> = {
  'rprr-2023': '2023 Q33',
  'prr-2024': '2024 Q30',
  'rrrrr-2025': '2025 Q30',
  'review-6dof': 'review deck slide 20',
  'rrrp-2022': '2022 Q33',
  'rrrp-2022-q10': '2022 Q10',
};

// ------------------------------------------------------------------ views and re-labelled frames

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
const crossV = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** How a paper draws {s}: which {s} axes point screen-right and screen-up (out of the page = right × up). */
export const VIEWS = {
  /** 2023 Q33, 2024 Q30: x̂_s out of the page, ŷ_s right, ẑ_s up. */
  xOut: { right: Y, up: Z },
  /** 2025 Q30: x̂_s right, ŷ_s into the page, ẑ_s up. */
  yIn: { right: X, up: Z },
  /** Review deck: x̂_0 up, ŷ_0 right, ẑ_0 into the page. */
  xUp: { right: Y, up: X },
  /** x̂_s left, ŷ_s out of the page, ẑ_s up. */
  xLeft: { right: neg(X), up: Z },
  /** ŷ_s left, x̂_s into the page, ẑ_s up. */
  yLeft: { right: neg(Y), up: Z },
  /** x̂_s up, ẑ_s right, ŷ_s out of the page. */
  zRight: { right: Z, up: X },
} as const;
export type ViewKey = keyof typeof VIEWS;

function mapLin(T: number[][], v: LinVec): LinVec {
  return [0, 1, 2].map((r) => linAdd(...[0, 1, 2].map((c) => linScale(v[c], T[r][c])))) as LinVec;
}
function mapNum(T: number[][], v: Vec3): Vec3 {
  return [0, 1, 2].map((r) => T[r][0] * v[0] + T[r][1] * v[1] + T[r][2] * v[2]) as Vec3;
}

/**
 * The same physical arm and the same drawing, with {s} re-labelled so that the given axes point screen-right and
 * screen-up. randomArm builds arms in the xOut view; this maps old coordinates to new ones.
 */
export function reframe(arm: ArmSpec, key: ViewKey): ArmSpec {
  const { right, up } = VIEWS[key];
  const out = crossV(right as Vec3, up as Vec3);
  // old screen basis (right Y, up Z, out X) -> new: T·Y = right, T·Z = up, T·X = out
  const T = [0, 1, 2].map((r) => [out[r], right[r], up[r]]);
  return {
    ...arm,
    joints: arm.joints.map((j) => ({ type: j.type, axis: mapNum(T, j.axis), q: mapLin(T, j.q) })),
    R: [0, 1, 2].map((r) => [0, 1, 2].map((c) => T[r][0] * arm.R[0][c] + T[r][1] * arm.R[1][c] + T[r][2] * arm.R[2][c])) as Mat3,
    p: mapLin(T, arm.p),
    links: arm.links.map((l) => ({ after: l.after, pts: l.pts.map((p) => mapLin(T, p)) })),
    view: { right: mapNum(T, arm.view.right), up: mapNum(T, arm.view.up), out: mapNum(T, arm.view.out) },
  };
}

// ------------------------------------------------------------------ random arms

/** A prismatic joint slides along the link that follows it (as on every paper), arrow pointing outwards. */
function tidy(arm: ArmSpec): ArmSpec {
  const joints = arm.joints.map((j, i) => {
    if (j.type !== 'P') return j;
    const link = arm.links.find((l) => l.after === i + 1);
    if (!link || link.pts.length < 2) return j;
    const d = sub3(linVecEval(link.pts[1], arm.values), linVecEval(link.pts[0], arm.values));
    return { ...j, axis: scale3(d, 1 / norm3(d)).map((x) => Math.round(x)) as Vec3 };
  });
  return { ...arm, joints };
}

/** Is the drawing unambiguous? Distinct points project apart; no link crosses or grazes another. */
export function armLooksClear(arm: ArmSpec): boolean {
  const dv = drawValues(arm);
  const Lmax = Math.max(...Object.values(dv));
  const P = (v: Vec3) => projectUnit(arm.view, v);
  // no two revolute joints on the same axis line (a redundant, confusing pair)
  for (let i = 0; i < arm.joints.length; i++)
    for (let j = i + 1; j < arm.joints.length; j++) {
      const a = arm.joints[i];
      const b = arm.joints[j];
      if (a.type !== 'R' || b.type !== 'R' || Math.abs(Math.abs(dot3(a.axis, b.axis)) - 1) > 1e-9) continue;
      const d = sub3(linVecEval(b.q, dv), linVecEval(a.q, dv));
      if (norm3(crossV(d, a.axis)) < 1e-9) return false;
    }
  const pts3: Vec3[] = [];
  for (const l of arm.links)
    for (const p of l.pts) {
      const v = linVecEval(p, dv);
      if (!pts3.some((u) => norm3(sub3(u, v)) < 1e-9)) pts3.push(v);
    }
  for (let i = 0; i < pts3.length; i++)
    for (let j = i + 1; j < pts3.length; j++) {
      const a = P(pts3[i]);
      const b = P(pts3[j]);
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.22 * Lmax) return false;
    }
  const segs: [Vec3, Vec3][] = [];
  for (const l of arm.links)
    for (let k = 0; k + 1 < l.pts.length; k++) segs.push([linVecEval(l.pts[k], dv), linVecEval(l.pts[k + 1], dv)]);
  const same = (u: Vec3, v: Vec3) => norm3(sub3(u, v)) < 1e-9;
  // every link long enough on screen to carry a joint glyph and a dimension
  for (const [a, b] of segs) {
    const pa = P(a);
    const pb = P(b);
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 0.3 * Lmax) return false;
  }
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b] = segs[i];
      const [c, d] = segs[j];
      if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) continue;
      if (segSegDist(P(a), P(b), P(c), P(d)) < 0.12 * Lmax) return false;
    }
  for (const v of pts3)
    for (const [a, b] of segs) {
      if (same(v, a) || same(v, b)) continue;
      if (pointSegDist(P(v), P(a), P(b)) < 0.16 * Lmax) return false;
    }
  return true;
}

/**
 * A random arm of n joints (core randomArm), tidied and redrawn until its figure is unambiguous, then shown in
 * one of the given views (default: the 2023/2024 one).
 */
export function pickRandomArm(rng: Rng, n: number, o: { views?: ViewKey[]; prismatic?: boolean } = {}): ArmSpec {
  let arm: ArmSpec | null = null;
  for (let k = 0; k < 120; k++) {
    arm = tidy(randomArm(rng.next, n, { prismatic: o.prismatic }));
    if (armLooksClear(arm)) break;
  }
  const key = o.views ? rng.pick(o.views) : 'xOut';
  const a = key === 'xOut' ? arm! : reframe(arm!, key);
  return { ...a, id: `random-${n}`, name: `${a.joints.map((j) => j.type).join('')} arm` };
}

// ------------------------------------------------------------------ symbolic rows and TeX

export const axisIndex = (w: Vec3) => w.findIndex((x) => Math.abs(x) > 0.5);

/** The point on an axis-aligned joint axis closest to the frame origin: q with its component along ω zeroed. */
export function canonQ(q: LinVec, w: Vec3): LinVec {
  const k = axisIndex(w);
  return q.map((c, i) => (i === k ? ZERO : c)) as LinVec;
}

export const numStr = (x: number) => (Math.abs(x) < 1e-12 ? '0' : `${+x.toPrecision(10)}`);
export const numTeX = numStr;

export interface ScrewRow {
  type: 'R' | 'P';
  w: Vec3;
  v: LinVec;
  /** The q the hints print (closest point on the axis to the frame origin); null for prismatic joints. */
  q: LinVec | null;
  /** Cells as typed: ωx ωy ωz vx vy vz. */
  cells: string[];
}

/** Joint i's screw axis in {s} or {b}, symbolically. */
export function screwRow(arm: ArmSpec, i: number, frame: 's' | 'b'): ScrewRow {
  const s = frame === 's' ? symScrewS(arm, i) : symScrewB(arm, i);
  const w = s.w.map((x) => (Math.abs(x) < 1e-12 ? 0 : x)) as Vec3;
  return { type: arm.joints[i].type, w, v: s.v, q: s.q ? canonQ(s.q, w) : null, cells: [...w.map(numStr), ...s.v.map(linStr)] };
}

export const vecTeX3 = (v: Vec3) => `(${v.map(numTeX).join(', ')})`;
export const linVecTeX3 = (v: LinVec) => `(${v.map(linTeX).join(', ')})`;

/** '+\hat y_s' for an axis-aligned unit vector. */
export function axisTeX(d: Vec3, sub = 's'): string {
  const k = axisIndex(d);
  return `${d[k] < 0 ? '-' : '+'}\\hat ${'xyz'[k]}_${sub}`;
}

/** How an {s} direction is drawn on this figure. */
export function screenWord(d: Vec3, view: ArmSpec['view']): string {
  if (dot3(d, view.right) > 0.5) return 'right';
  if (dot3(d, view.right) < -0.5) return 'left';
  if (dot3(d, view.up) > 0.5) return 'up';
  if (dot3(d, view.up) < -0.5) return 'down';
  if (dot3(d, view.out) > 0.5) return 'down-left, out of the page';
  return 'up-right, into the page';
}

/** "x̂_s points down-left, out of the page, ŷ_s right, ẑ_s up" for this figure. */
export function sAxesSentence(view: ArmSpec['view'], sub = 's'): string {
  return ['x', 'y', 'z']
    .map((n, k) => {
      const e: Vec3 = [0, 0, 0];
      e[k] = 1;
      return `$\\hat ${n}_${sub}$ points ${screenWord(e, view)}`;
    })
    .join('; ');
}

export function bmatrix(rows: string[][]): string {
  return `\\begin{bmatrix} ${rows.map((r) => r.join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
}

/** M = [R p; 0 1] as TeX. */
export function mTeX(R: Mat3 | number[][], p: LinVec): string {
  return bmatrix([...[0, 1, 2].map((i) => [numTeX(R[i][0]), numTeX(R[i][1]), numTeX(R[i][2]), linTeX(p[i])]), ['0', '0', '0', '1']]);
}

const linEq = (a: Lin, b: Lin) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 1e-12) return false;
  return true;
};
export const linVecEq = (a: LinVec, b: LinVec) => linEq(a[0], b[0]) && linEq(a[1], b[1]) && linEq(a[2], b[2]);

/** The walk from the {s} origin to the {b} origin along the links, one axis move at a time (merged). */
export function pathMoves(arm: ArmSpec): { axis: number; amount: Lin }[] | null {
  const pts: LinVec[] = [[ZERO, ZERO, ZERO]];
  for (const l of arm.links) for (const pt of l.pts) if (!linVecEq(pts[pts.length - 1], pt)) pts.push(pt);
  const end = pts.findIndex((pt) => linVecEq(pt, arm.p));
  if (end < 0) return null;
  const moves: { axis: number; amount: Lin }[] = [];
  for (let k = 0; k < end; k++) {
    const d = [0, 1, 2].map((c) => linAdd(pts[k + 1][c], linScale(pts[k][c], -1)));
    const nz = d.map((x, c) => (Object.keys(x).length ? c : -1)).filter((c) => c >= 0);
    if (nz.length !== 1) return null;
    const prev = moves[moves.length - 1];
    if (prev && prev.axis === nz[0]) prev.amount = linAdd(prev.amount, d[nz[0]]);
    else moves.push({ axis: nz[0], amount: d[nz[0]] });
  }
  return moves.filter((m) => Object.keys(m.amount).length > 0);
}

/** "L_1 along +ẑ_s (up), then L_2 along −x̂_s (into the page …)" for p. */
export function pathSentence(arm: ArmSpec): string {
  const moves = pathMoves(arm);
  if (!moves) return '';
  return moves
    .map((m) => {
      const e: Vec3 = [0, 0, 0];
      e[m.axis] = 1;
      const c = m.amount;
      // a move of −L along +x̂ reads better as L along −x̂
      const allNeg = Object.values(c).every((x) => x < 0);
      const amt = allNeg ? linScale(c, -1) : c;
      const dir: Vec3 = allNeg ? (e.map((x) => -x) as Vec3) : e;
      return `$${linTeX(amt)}$ along $${axisTeX(dir)}$ (${screenWord(dir, arm.view)})`;
    })
    .join(', then ');
}
