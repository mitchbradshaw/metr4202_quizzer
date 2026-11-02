// Forward kinematics with the product of exponentials (kin-poe) and one column of the space Jacobian
// (kin-jacobian), at configurations simple enough to do by hand: revolute angles in multiples of π/2 and
// prismatic extensions in metres, on the exam robots (their paper lengths) or random axis-aligned arms.
//   kin-poe       tier 1: one joint moved: where is the {b} origin now, and which way does ẑ_b point?
//                 tier 2: two joints moved (outermost first);  tier 3: three joints moved, plus x̂_b.
//   kin-jacobian  tier 2: J_si with one earlier joint moved (and which angles J_si depends on);
//                 tier 3: two earlier joints moved and a later joint moved as a distractor.
// The by-hand method in the hints moves points and axes geometrically: a revolute joint turns everything
// outboard about its zero-configuration axis line (x → q + Rot(ω, θ)(x − q)); a prismatic joint shifts it by vθ.
import type { MatrixPart, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { armLinksAt, armM, armScrewsS, fkSpace, jacobianSpace, linVecEval, matMul, expScrew, identity, adjoint, posOf, rotOf, mat3Vec, type ArmSpec, type Mat4, type Screw, type Vec3 } from '../../../core/kin';
import { tex } from '../../../engine/format';
import { armFigure } from './kinfigArm';
import { ARM_PAPER, axisTeX, examArm, pickRandomArm, screwRow, type ViewKey } from './kinfigArms';
import { FRAMES_SENTENCE } from './m';
import { drawnAs } from './screws';
import { pickPart, type PickPart } from './kinfigPick';
import './kinfigTraps';

const VIEWS: ViewKey[] = ['xOut', 'yIn'];
export const POE_POOL = ['rprr-2023', 'prr-2024', 'rrrrr-2025', 'rrrp-2022'];

// ------------------------------------------------------------------ numbers and TeX

const nz = (x: number) => (Math.abs(x) < 1e-9 ? 0 : x);
const n4 = (x: number) => tex(nz(x), 4);
const v3 = (v: readonly number[]) => `(${v.map(n4).join(', ')})`;
const col = (T: Mat4, k: number): Vec3 => [nz(T[0][k]), nz(T[1][k]), nz(T[2][k])];
const DIRS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const sameDir = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6;
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** "joint 2", "joints 1 and 3", "joints 1, 2 and 4" (0-based indices in). */
const jointList = (idx: readonly number[]) =>
  idx.length === 1 ? `joint ${idx[0] + 1}` : `joints ${idx.slice(0, -1).map((k) => k + 1).join(', ')} and ${idx[idx.length - 1] + 1}`;
const distV = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((x, i) => x - b[i]));

/** θ as TeX: π/2, −π/2, π, or a prismatic extension in metres. */
export function thetaTeX(arm: ArmSpec, i: number, th: number): string {
  if (arm.joints[i].type === 'P') return `${n4(th)}\\ \\text{m}`;
  const k = Math.round((th / Math.PI) * 2);
  return k === 1 ? '\\tfrac{\\pi}{2}' : k === -1 ? '-\\tfrac{\\pi}{2}' : k === 2 ? '\\pi' : k === -2 ? '-\\pi' : n4(th);
}

/** A random value for joint i: ±π/2 or π (revolute), 0.1–0.5 m (prismatic). */
function drawTheta(rng: Rng, arm: ArmSpec, i: number): number {
  if (arm.joints[i].type === 'P') return rng.step(0.1, 0.5, 0.1);
  return rng.pick([Math.PI / 2, -Math.PI / 2, Math.PI / 2, Math.PI]);
}

/** Space-form FK with every screw evaluated at the arm's numbers. */
export function poe(arm: ArmSpec, th: readonly number[]): Mat4 {
  return fkSpace(armM(arm), armScrewsS(arm), th);
}

/** One step of the by-hand method: joint k moves the point x and the direction z. */
function moveBy(S: Screw, th: number, x: Vec3): Vec3 {
  const T = expScrew(S, th);
  return addv(mat3Vec(rotOf(T), x), posOf(T));
}
function turnBy(S: Screw, th: number, d: Vec3): Vec3 {
  return mat3Vec(rotOf(expScrew(S, th)), d);
}

/** Text for one by-hand step on the point p and the direction(s). */
function stepText(arm: ArmSpec, k: number, th: number, p: Vec3, dirs: { name: string; d: Vec3 }[]): { text: string; p: Vec3; dirs: { name: string; d: Vec3 }[] } {
  const S = armScrewsS(arm)[k];
  const J = arm.joints[k];
  const n = k + 1;
  const p2 = moveBy(S, th, p).map(nz) as Vec3;
  const d2 = dirs.map((o) => ({ name: o.name, d: turnBy(S, th, o.d).map((x) => Math.round(x)) as Vec3 }));
  const turned = d2.map((o, i) => `$${o.name}$: $${axisTeX(dirs[i].d)} \\to ${axisTeX(o.d)}$`).join(', ');
  if (J.type === 'P') return { text: `Joint ${n} (prismatic, $\\theta_${n} = ${thetaTeX(arm, k, th)}$ along $${axisTeX(J.axis)}$): shift by $v\\theta = ${v3(S.v.map((x) => x * th))}$, so $p \\to ${v3(p)} + ${v3(S.v.map((x) => x * th))} = ${v3(p2)}$; directions unchanged.`, p: p2, dirs: d2 };
  const q = screwRow(arm, k, 's').q!;
  const qn = linVecEval(q, arm.values).map(nz) as Vec3;
  const rel = sub(p, qn).map(nz) as Vec3;
  const rel2 = sub(p2, qn).map(nz) as Vec3;
  return {
    text: `Joint ${n} (revolute, $\\theta_${n} = ${thetaTeX(arm, k, th)}$ about $${axisTeX(J.axis)}$ through $q_${n} = ${v3(qn)}$): $p - q_${n} = ${v3(rel)}$ turns to $${v3(rel2)}$, so $p \\to ${v3(p2)}$; ${turned}.`,
    p: p2,
    dirs: d2,
  };
}

/** Direction choice ("which way does ẑ_b point now?") as a compact grid, with a why for each option. */
function dirChoice(id: string, label: string, name: string, truth: Vec3, home: Vec3, wrongSense: Vec3 | null, view: ArmSpec['view']): PickPart {
  return pickPart({
    id,
    label,
    options: DIRS.map((d) => {
      const ok = sameDir(d, truth);
      let why: string;
      let trapId: string | undefined;
      if (ok)
        why = sameDir(truth, home)
          ? `$${name}$ starts along $${axisTeX(home)}$ (drawn ${drawnAs(home, view)}) and stays there: a prismatic joint only translates, and a rotation about an axis parallel to $${name}$ leaves it unchanged.`
          : `$${name}$ starts along $${axisTeX(home)}$ (drawn ${drawnAs(home, view)}) and the moved joints turn it to $${axisTeX(truth)}$.`;
      else if (wrongSense && sameDir(d, wrongSense)) {
        why = 'That is where it ends up if the joints turn the other way. Positive $\\theta$ turns by the right-hand rule about $+\\omega$ (thumb along $\\omega$, fingers curl the positive way).';
        trapId = 'kin-arrow-sense';
      } else if (sameDir(d, home)) why = `That is where $${name}$ points at the zero configuration (the matching column of $M$). At least one moved joint’s axis is not parallel to it, so it turns.`;
      else if (sameDir(d, neg(truth))) why = `Right line, opposite sense: apply each rotation to $${name}$ in turn, outermost joint first, and keep track of the sign.`;
      else why = `Apply the rotations one at a time (outermost moved joint first): $${name}$ ends along $${axisTeX(truth)}$.`;
      return { text: `$${axisTeX(d)}$`, correct: ok, why, trapId };
    }),
    marks: 1,
  });
}

function pickArm(rng: Rng, tier: Tier, minJoints = 3): ArmSpec {
  if (tier === 1 || rng.chance(tier === 2 ? 0.6 : 0.3)) {
    const id = rng.pick(POE_POOL);
    const a = examArm(id);
    if (a.joints.length >= minJoints) return a;
  }
  return pickRandomArm(rng, tier === 3 ? 4 : rng.int(3, 4), { views: VIEWS });
}

/**
 * Is the arm drawable at this pose? No link folds back onto the one before it and no two links touch, so the
 * dashed "arm at this configuration" reveal reads clearly (a fold-back would also be a self-collision).
 */
export function poseIsClean(arm: ArmSpec, th: readonly number[]): boolean {
  const segs: [Vec3, Vec3][] = [];
  for (const pl of armLinksAt(arm, th)) for (let k = 0; k + 1 < pl.length; k++) if (distV(pl[k], pl[k + 1]) > 1e-9) segs.push([pl[k], pl[k + 1]]);
  const Lmax = Math.max(...segs.map(([a, b]) => distV(a, b)));
  const at = (s: [Vec3, Vec3], t: number): Vec3 => addv(s[0], sub(s[1], s[0]).map((x) => x * t) as Vec3);
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      let corner: [Vec3, Vec3, Vec3] | null = null; // shared point, far end of i, far end of j
      for (const [pi, oi] of [[0, 1], [1, 0]])
        for (const [pj, oj] of [[0, 1], [1, 0]]) if (!corner && distV(segs[i][pi], segs[j][pj]) < 1e-9) corner = [segs[i][pi], segs[i][oi], segs[j][oj]];
      if (corner) {
        // two links meeting at a corner: a fold-back leaves them (nearly) on top of each other
        const u = sub(corner[1], corner[0]);
        const w = sub(corner[2], corner[0]);
        const c = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (Math.hypot(...u) * Math.hypot(...w));
        if (c > 0.9) return false;
        continue;
      }
      let min = Infinity;
      for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20; b++) min = Math.min(min, distV(at(segs[i], a / 20), at(segs[j], b / 20)));
      if (min < 0.06 * Lmax) return false;
    }
  return true;
}

/** Moved joints for kin-poe: `count` distinct joints, at least one of which moves the {b} origin, at a clean pose. */
function pickConfig(rng: Rng, arm: ArmSpec, count: number): number[] {
  const n = arm.joints.length;
  const revolute = arm.joints.map((_, i) => i).filter((i) => arm.joints[i].type === 'R');
  for (let attempt = 0; attempt < 80; attempt++) {
    // one moved joint (tier 1): usually a revolute one, since a lone prismatic shift teaches little about PoE
    const idx = count === 1 && revolute.length && rng.chance(0.85) ? [rng.pick(revolute)] : rng.shuffle(arm.joints.map((_, i) => i)).slice(0, Math.min(count, n));
    const th = new Array<number>(n).fill(0);
    idx.forEach((i) => (th[i] = drawTheta(rng, arm, i)));
    const home = posOf(armM(arm));
    const T = poe(arm, th);
    if (distV(posOf(T), home) > 0.05 && (attempt > 60 || poseIsClean(arm, th))) return th;
  }
  const th = new Array<number>(n).fill(0);
  th[0] = arm.joints[0].type === 'P' ? 0.3 : Math.PI / 2;
  return th;
}

function configSentence(arm: ArmSpec, th: readonly number[]): string {
  const moved = th.map((t, i) => (Math.abs(t) > 1e-12 ? `$\\theta_${i + 1} = ${thetaTeX(arm, i, t)}$` : '')).filter(Boolean);
  const rest = th.length - moved.length;
  return `${moved.join(', ')}${rest ? `, and every other joint at $0$` : ''}`;
}

function lengthsSentence(arm: ArmSpec): string {
  return arm.symbols.map((s) => `$${s.replace(/^([A-Za-z]+)(\d+)$/, '$1_$2')}$ = ${n4(arm.values[s])} m`).join(', ');
}

function intro(arm: ArmSpec): string {
  const paper = ARM_PAPER[arm.id];
  const types = arm.joints.map((j) => j.type).join('');
  return paper ? `The figure shows the ${types} arm of ${paper} at its zero configuration.` : `The figure shows a ${types} arm at its zero configuration (joints $\\theta_1$ to $\\theta_${arm.joints.length}$ from the base).`;
}

/** The axes the hints need: ω and q (or v) of each listed joint, with numbers. */
function axesList(arm: ArmSpec, idx: number[]): string {
  return idx
    .map((k) => {
      const J = arm.joints[k];
      const S = armScrewsS(arm)[k];
      if (J.type === 'P') return `joint ${k + 1}: prismatic, $v_${k + 1} = ${v3(S.v)}$`;
      const q = linVecEval(screwRow(arm, k, 's').q!, arm.values);
      return `joint ${k + 1}: $\\omega_${k + 1} = ${v3(J.axis)}$ through $q_${k + 1} = ${v3(q)}$`;
    })
    .join('; ');
}

const ROT_SHORTCUTS =
  '$$\\text{Rot}(\\omega, \\tfrac{\\pi}{2})\\,x = \\omega \\times x + (\\omega\\cdot x)\\,\\omega, \\qquad \\text{Rot}(\\omega, \\pi)\\,x = 2(\\omega\\cdot x)\\,\\omega - x, \\qquad \\text{Rot}(\\omega, -\\tfrac{\\pi}{2})\\,x = -\\omega \\times x + (\\omega\\cdot x)\\,\\omega$$';

// ------------------------------------------------------------------ kin-poe

function poeInstance(rng: Rng, tier: Tier) {
  const arm = pickArm(rng, tier);
  const n = arm.joints.length;
  const th = pickConfig(rng, arm, tier === 1 ? 1 : tier === 2 ? 2 : 3);
  const S = armScrewsS(arm);
  const M = armM(arm);
  const T = poe(arm, th);
  const p = posOf(T).map(nz) as Vec3;
  const moved = th.map((t, i) => (Math.abs(t) > 1e-12 ? i : -1)).filter((i) => i >= 0);

  // traps: the classic slips, each a whole wrong position
  const negTh = th.map((t, i) => (arm.joints[i].type === 'R' ? -t : t));
  const Tneg = poe(arm, negTh);
  let Trev: Mat4 = identity(4);
  for (let i = n - 1; i >= 0; i--) Trev = matMul(Trev, expScrew(S[i], th[i]));
  Trev = matMul(Trev, M);
  const S0 = S.map((s, i) => (arm.joints[i].type === 'R' ? { w: s.w, v: [0, 0, 0] as Vec3 } : s));
  const Torigin = fkSpace(M, S0, th);
  let Tright: Mat4 = M;
  S.forEach((s, i) => (Tright = matMul(Tright, expScrew(s, th[i]))));
  const trapsRaw: { value: number[][]; message: string; trapId: string }[] = [
    { value: posOf(Tneg).map((x) => [nz(x)]), message: 'That is the pose for the opposite rotations. Positive $\\theta$ turns by the right-hand rule about $+\\omega$: thumb along $\\omega$, fingers curl the positive way.', trapId: 'kin-arrow-sense' },
    { value: posOf(Torigin).map((x) => [nz(x)]), message: 'You rotated about parallel axes through the origin. Each joint turns the arm about its **own** axis line, through $q_i$: $x \\to q_i + \\text{Rot}(\\omega_i, \\theta_i)(x - q_i)$ (that is what $v_i$ encodes).', trapId: 'kin-poe-axis-origin' },
    { value: posOf(Trev).map((x) => [nz(x)]), message: 'The exponentials were applied in the wrong order. In $e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_n]\\theta_n} M$ the **outermost** moved joint acts on $M$ first, then you work inwards to joint 1.', trapId: 'kin-poe-order' },
    { value: posOf(Tright).map((x) => [nz(x)]), message: 'You put $M$ on the left with $\\{s\\}$-frame screw axes. Space form: $M$ goes last, on the right; $M e^{[\\mathcal{B}_1]\\theta_1}\\cdots$ needs body-frame axes.', trapId: 'kin-poe-order' },
  ];
  const traps: typeof trapsRaw = [];
  for (const t of trapsRaw) {
    const tv = t.value.map((r) => r[0]);
    if (distV(tv, p) > 0.03 && !traps.some((o) => distV(o.value.map((r) => r[0]), tv) < 0.03)) traps.push(t);
  }

  const pPart: MatrixPart = {
    kind: 'matrix',
    id: 'p',
    label: `(a) The position of the $\\{b\\}$ origin at this configuration, in $\\{s\\}$`,
    answer: p.map((x) => [x]),
    rowLabels: ['$x$', '$y$', '$z$'],
    unit: 'm',
    absTol: 0.01,
    traps,
    marks: tier === 1 ? 2 : 3,
  };
  const zHome = col(M, 2);
  const xHome = col(M, 0);
  const zNow = col(T, 2).map((x) => Math.round(x)) as Vec3;
  const xNow = col(T, 0).map((x) => Math.round(x)) as Vec3;
  const zNeg = col(Tneg, 2).map((x) => Math.round(x)) as Vec3;
  const xNeg = col(Tneg, 0).map((x) => Math.round(x)) as Vec3;
  const parts: SolvePart[] = [pPart, dirChoice('zb', '(b) Which way does $\\hat z_b$ point now (in $\\{s\\}$)?', '\\hat z_b', zNow, zHome, sameDir(zNeg, zNow) ? null : zNeg, arm.view)];
  if (tier === 3) parts.push(dirChoice('xb', '(c) And $\\hat x_b$?', '\\hat x_b', xNow, xHome, sameDir(xNeg, xNow) ? null : xNeg, arm.view));

  // the by-hand walk: outermost moved joint first
  let cur = posOf(M).map(nz) as Vec3;
  let dirs = [
    { name: '\\hat z_b', d: zHome },
    ...(tier === 3 ? [{ name: '\\hat x_b', d: xHome }] : []),
  ];
  const steps: string[] = [];
  for (const k of [...moved].reverse()) {
    const st = stepText(arm, k, th[k], cur, dirs);
    steps.push(st.text);
    cur = st.p;
    dirs = st.dirs;
  }
  const productTeX = `T(\\theta) = ${moved.map((k) => `e^{[\\mathcal{S}_${k + 1}]\\theta_${k + 1}}`).join(' ')}\\, M`;
  const figure = armFigure(arm, {
    reveals: [
      { id: 'screws-s', label: 'the joint axes (ω, q)' },
      { id: 'pose', label: 'the arm at this configuration' },
    ],
    pose: th,
  });
  const prompt = `${intro(arm)} ${FRAMES_SENTENCE}\n\nWith ${lengthsSentence(arm)}, the joints are set to ${configSentence(arm, th)}. Use the product of exponentials $T(\\theta) = e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_${n}]\\theta_${n}} M$ to find the new pose of $\\{b\\}$.`;
  const hints: [string, string, string, string] = [
    'Read $T(\\theta) = e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_n]\\theta_n} M$ from the right: start with $\\{b\\}$ at its home pose $M$, then apply the motion of the **outermost** moved joint, then work inwards. Every $e^{[\\mathcal{S}_k]\\theta_k}$ uses joint $k$’s axis at the **zero** configuration, which is exactly where that axis still is, because nothing inboard of it has moved yet. A joint at $\\theta_k = 0$ contributes $I$ and can be skipped. A revolute joint turns points about its axis line, $x \\to q + \\text{Rot}(\\omega, \\theta)(x - q)$, and turns directions by $\\text{Rot}(\\omega, \\theta)$; a prismatic joint shifts points by $v\\theta$.',
    `Only ${jointList(moved)} move${moved.length === 1 ? 's' : ''}: $${productTeX}$. Their axes at $\\theta = 0$: ${axesList(arm, moved)}. Home pose from $M$: $p = ${v3(posOf(M))}$, $\\hat z_b = ${axisTeX(zHome)}$${tier === 3 ? `, $\\hat x_b = ${axisTeX(xHome)}$` : ''}. Quarter and half turns about a unit axis $\\omega$: ${ROT_SHORTCUTS}`,
    steps.join('\n\n'),
    [
      `**Answer:** $\\{b\\}$ is now at **$p = ${v3(p)}$ m**, with **$\\hat z_b = ${axisTeX(zNow)}$**${tier === 3 ? ` and **$\\hat x_b = ${axisTeX(xNow)}$**` : ''}.`,
      `The whole transform: $$T(\\theta) = \\begin{bmatrix} ${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => n4(T[r][c])).join(' & ')).join(' \\\\ ')} \\\\ 0 & 0 & 0 & 1 \\end{bmatrix}$$ (its columns: $\\hat x_b, \\hat y_b, \\hat z_b$ and $p$ in $\\{s\\}$). Check: with every $\\theta_i = 0$ it collapses to $M$.`,
    ].join('\n\n'),
  ];
  return { prompt, figure, parts, hints, arm, th, T };
}

// ------------------------------------------------------------------ kin-jacobian

/** "joint 1", "joints 1 and 2", "joints 1 to 3": the i joints before joint i + 1. */
const jointsBefore = (i: number) => (i === 1 ? 'joint 1' : i === 2 ? 'joints 1 and 2' : `joints 1 to ${i}`);

function jacInstance(rng: Rng, tier: Tier) {
  let arm = pickArm(rng, tier, 3);
  for (let k = 0; k < 10 && arm.joints.length < 3; k++) arm = pickArm(rng, tier, 3);
  const n = arm.joints.length;
  const S = armScrewsS(arm);
  // column i (0-based) with at least `before` earlier joints, and the earlier motion must change it
  let i = 1;
  let th: number[] = new Array<number>(n).fill(0);
  for (let attempt = 0; attempt < 80; attempt++) {
    const before = tier === 2 ? 1 : 2;
    i = rng.int(before, n - 1);
    th = new Array<number>(n).fill(0);
    const earlier = rng.shuffle(Array.from({ length: i }, (_, k) => k)).slice(0, before);
    earlier.forEach((k) => (th[k] = drawTheta(rng, arm, k)));
    if (tier === 3 && i < n - 1) {
      const later = rng.int(i, n - 1);
      th[later] = drawTheta(rng, arm, later);
    }
    const J = jacobianSpace(S, th)[i];
    const moved = distV([...J.w, ...J.v], [...S[i].w, ...S[i].v]) > 0.05;
    if (moved && (attempt > 60 || poseIsClean(arm, th))) break;
  }
  const J = jacobianSpace(S, th)[i];
  const ans = [...J.w, ...J.v].map(nz);
  // traps
  let Tall: Mat4 = identity(4);
  S.forEach((s, k) => (Tall = matMul(Tall, expScrew(s, th[k]))));
  const Jall = adjoint(Tall, S[i]);
  const negTh = th.map((t, k) => (arm.joints[k].type === 'R' ? -t : t));
  const Jneg = jacobianSpace(S, negTh)[i];
  const raw = [
    { value: [[...S[i].w, ...S[i].v].map(nz)], message: `That is $\\mathcal{S}_${i + 1}$ at the zero configuration. Column $${i + 1}$ of $J_s(\\theta)$ is joint ${i + 1}’s screw axis **where the joints before it have moved it**: $J_{s${i + 1}} = [\\mathrm{Ad}_{T_{${i}}}]\\mathcal{S}_${i + 1}$.`, trapId: 'kin-jacobian-moved' },
    { value: [[...Jall.w, ...Jall.v].map(nz)], message: `Only ${jointsBefore(i)} can move joint ${i + 1}’s axis. Joint ${i + 1} itself and the joints after it are outboard: they cannot move the axis of joint ${i + 1}.`, trapId: 'kin-jacobian-moved' },
    { value: [[...Jneg.w, ...Jneg.v].map(nz)], message: 'That axis was moved by the opposite rotations: positive $\\theta$ turns by the right-hand rule about $+\\omega$.', trapId: 'kin-arrow-sense' },
  ];
  const traps: { value: number[][]; message: string; trapId: string }[] = [];
  for (const t of raw) if (distV(t.value[0], ans) > 0.03 && !traps.some((o) => distV(o.value[0], t.value[0]) < 0.03)) traps.push(t);

  const part: MatrixPart = {
    kind: 'matrix',
    id: 'J',
    label: `${tier === 2 ? '(b)' : '(a)'} Column ${i + 1} of the space Jacobian, $J_{s${i + 1}}(\\theta) = (\\omega, v)$`,
    answer: [ans],
    colLabels: ['$\\omega_x$', '$\\omega_y$', '$\\omega_z$', '$v_x$', '$v_y$', '$v_z$'],
    unit: '',
    absTol: 0.01,
    traps,
    marks: 3,
  };
  const parts: SolvePart[] = [];
  if (tier === 2)
    parts.push({
      kind: 'choice',
      id: 'depends',
      label: `(a) Which joint values can change $J_{s${i + 1}}(\\theta)$?`,
      options: [
        { text: `Only ${i === 1 ? '$\\theta_1$' : i === 2 ? '$\\theta_1$ and $\\theta_2$' : `$\\theta_1$ to $\\theta_${i}$`} (the joints before joint ${i + 1})`, correct: true, why: `$J_{s${i + 1}} = [\\mathrm{Ad}_{e^{[\\mathcal{S}_1]\\theta_1}\\cdots e^{[\\mathcal{S}_{${i}}]\\theta_{${i}}}}]\\mathcal{S}_${i + 1}$: only the joints inboard of joint ${i + 1} carry its axis around.` },
        {
          text: 'Every joint value $\\theta_1, \\dots, \\theta_n$',
          correct: false,
          why:
            i + 1 === n
              ? `Joint ${n} is the last joint, and turning a joint never moves its own axis; only the joints before it can.`
              : `Joint ${i + 1} itself and joints ${i + 2} to ${n} (outboard of it) cannot move joint ${i + 1}’s axis in $\\{s\\}$; only the joints before it can.`,
        },
        { text: `Only $\\theta_{${i + 1}}$`, correct: false, why: 'Turning a joint never moves its own axis (a screw is unchanged by its own exponential); it is the joints before it that do.' },
        { text: 'None: the space Jacobian is constant', correct: false, why: 'Only its first column, $J_{s1} = \\mathcal{S}_1$, is constant. Later columns move with the configuration.' },
      ],
      marks: 1,
    });
  parts.push(part);

  // the by-hand walk: move ω_i and q_i with the earlier moved joints, outermost first, then v = −ω × q
  const earlierMoved = th.map((t, k) => (k < i && Math.abs(t) > 1e-12 ? k : -1)).filter((k) => k >= 0);
  const Ji = arm.joints[i];
  const lines: string[] = [];
  let w = Ji.type === 'R' ? (Ji.axis.slice() as Vec3) : ([0, 0, 0] as Vec3);
  let dir = Ji.type === 'P' ? (S[i].v.slice() as Vec3) : ([0, 0, 0] as Vec3);
  let q: Vec3 = Ji.type === 'R' ? (linVecEval(screwRow(arm, i, 's').q!, arm.values).map(nz) as Vec3) : [0, 0, 0];
  for (const k of [...earlierMoved].reverse()) {
    const Sk = S[k];
    const Jk = arm.joints[k];
    if (Jk.type === 'P') {
      const shift = Sk.v.map((x) => nz(x * th[k])) as Vec3;
      const q2 = addv(q, shift).map(nz) as Vec3;
      lines.push(`Joint ${k + 1} (prismatic, $${thetaTeX(arm, k, th[k])}$): it only translates the axis${Ji.type === 'R' ? `: $q \\to ${v3(q)} + ${v3(shift)} = ${v3(q2)}$, $\\omega$ unchanged` : ', and a direction of travel is unchanged by a translation'}.`);
      q = q2;
    } else {
      const w2 = turnBy(Sk, th[k], w).map(nz) as Vec3;
      const d2 = turnBy(Sk, th[k], dir).map(nz) as Vec3;
      const q2 = moveBy(Sk, th[k], q).map(nz) as Vec3;
      lines.push(
        Ji.type === 'R'
          ? `Joint ${k + 1} ($\\theta_${k + 1} = ${thetaTeX(arm, k, th[k])}$ about $${axisTeX(Jk.axis)}$ through $q_${k + 1} = ${v3(linVecEval(screwRow(arm, k, 's').q!, arm.values))}$): $\\omega \\to ${v3(w2)}$ and the point $q \\to ${v3(q2)}$.`
          : `Joint ${k + 1} ($\\theta_${k + 1} = ${thetaTeX(arm, k, th[k])}$ about $${axisTeX(Jk.axis)}$): the direction of travel turns to $${v3(d2)}$.`
      );
      w = w2;
      dir = d2;
      q = q2;
    }
  }
  const finalLine =
    Ji.type === 'R'
      ? `Then $v = -\\omega \\times q = -${v3(w)} \\times ${v3(q)} = ${v3(J.v)}$.`
      : `A prismatic column is $(0, v)$ with $v$ the current direction of travel: $${v3(J.v)}$.`;
  const later = th.map((t, k) => (k > i && Math.abs(t) > 1e-12 ? k + 1 : -1)).filter((k) => k > 0);
  const figure = armFigure(arm, {
    reveals: [
      { id: 'screws-s', label: 'the joint axes at θ = 0 (ω, q)' },
      { id: 'pose', label: 'the arm at this configuration' },
    ],
    pose: th,
  });
  const prompt = `${intro(arm)} ${FRAMES_SENTENCE}\n\nWith ${lengthsSentence(arm)}, the joints are set to ${configSentence(arm, th)}. Find column ${i + 1} of the space Jacobian $J_s(\\theta)$, the screw axis of joint ${i + 1} at this configuration, written in $\\{s\\}$ as $(\\omega_x, \\omega_y, \\omega_z, v_x, v_y, v_z)$.`;
  const hints: [string, string, string, string] = [
    `Column $i$ of the space Jacobian is joint $i$’s screw axis **at the current configuration**, in $\\{s\\}$: $J_{s1} = \\mathcal{S}_1$ and $J_{si} = [\\mathrm{Ad}_{e^{[\\mathcal{S}_1]\\theta_1}\\cdots e^{[\\mathcal{S}_{i-1}]\\theta_{i-1}}}]\\,\\mathcal{S}_i$. Only the joints **before** joint $i$ can move its axis. By hand, move the axis geometrically: the earlier joints carry the direction $\\omega_i$ and a point $q_i$ on the axis to new places; then $v = -\\omega \\times q$ as usual (a prismatic column is $(0, v)$ with $v$ its current direction).`,
    `At $\\theta = 0$, ${axesList(arm, [i])}. The joints before it that move: ${earlierMoved.length ? axesList(arm, earlierMoved) : 'none'}.${later.length ? ` (Joint${later.length > 1 ? 's' : ''} ${later.join(', ')} also move${later.length > 1 ? '' : 's'}, but ${later.length > 1 ? 'they are' : 'it is'} outboard of joint ${i + 1} and cannot move its axis.)` : ''} Apply the outermost of those first. Quarter and half turns: ${ROT_SHORTCUTS}`,
    [...lines, finalLine].join('\n\n'),
    `**Answer:** $$J_{s${i + 1}}(\\theta) = \\boldsymbol{${v3(ans)}}$$ (rows $\\omega_x, \\omega_y, \\omega_z, v_x, v_y, v_z$). Compare $\\mathcal{S}_${i + 1} = ${v3([...S[i].w, ...S[i].v])}$ at the zero configuration: ${jointList(earlierMoved)} carried the axis to its new place.${Ji.type === 'R' ? ' Check: $\\|\\omega\\| = 1$ and $\\omega \\cdot v = 0$.' : ''}`,
  ];
  return { prompt, figure, parts, hints, arm, th, i, J };
}

export const generators: SolveGenerator[] = [
  {
    id: 'kin-poe',
    title: 'Forward kinematics by the product of exponentials',
    summary: 'Set a few joints to quarter or half turns (or extend a prismatic joint) and find where $\\{b\\}$ goes: apply $e^{[\\mathcal{S}_k]\\theta_k}$ to $M$, outermost joint first, each about its zero-configuration axis.',
    tiers: [1, 2, 3],
    source: 'Similar to 2022 Q34 (PoE at a configuration); review deck slide 20; summary notes §6',
    cardId: 'kin-poe',
    marks: 4,
    generate(rng, tier) {
      const { prompt, figure, parts, hints } = poeInstance(rng, tier);
      return { prompt, figure, parts, hints };
    },
  },
  {
    id: 'kin-jacobian',
    title: 'One column of the space Jacobian',
    summary: '$J_{si}(\\theta)$ is joint $i$’s screw axis after the joints before it have moved it: carry $\\omega_i$ and a point $q_i$ along, then $v = -\\omega \\times q$.',
    tiers: [2, 3],
    source: 'Similar to 2022 Q10 and Q27 (Jacobians from the PoE); summary notes §6',
    cardId: 'kin-poe',
    marks: 4,
    generate(rng, tier) {
      const { prompt, figure, parts, hints } = jacInstance(rng, tier);
      return { prompt, figure, parts, hints };
    },
  },
];

export { poeInstance, jacInstance };
