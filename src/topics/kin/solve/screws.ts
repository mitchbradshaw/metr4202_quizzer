// Screw-axis tables (kin-screws): S_i = (ω_i, v_i) for each joint, read off an exam-style figure.
//   Tier 1: one joint (an exam robot or a random arm): which way ω points (right-hand rule on the drawn arrow),
//           then that joint's whole row.
//   Tier 2: the whole table in {s}, one row per joint, as in 2023 Q33(b), 2024 Q30(b), 2025 Q30(b) and 2022 Q33.
//   Tier 3: the whole table in {b} (review deck slide 20, 2022 Q10, random arms): ω_b = Rᵀω, q_b = Rᵀ(q − p).
// Each row is its own symbolic part, so a slip is named row by row: ω × q instead of −ω × q, ω flipped without v,
// the arrow read backwards (ω and v both flipped), a prismatic joint given an ω, and {s} values in a {b} table.
import type { MatrixPart, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { crossNL, linNeg, linStr, linTeX, linVecEval, linVecSub, matTLin, type ArmSpec, type LinVec, type Vec3 } from '../../../core/kin';
import { armFigure } from './kinfigArm';
import { ARM_PAPER, axisTeX, canonQ, examArm, linVecTeX3, mTeX, numStr, pickRandomArm, sAxesSentence, screenWord, screwRow, vecTeX3, type ScrewRow, type ViewKey } from './kinfigArms';
import { columnReadings, FRAMES_SENTENCE } from './m';
import type { OverlayId } from './kinfigLayout';
import { pickPart, type PickOption, type PickPart } from './kinfigPick';
import './kinfigTraps';

export const S_POOL = ['rprr-2023', 'prr-2024', 'rrrrr-2025', 'rrrp-2022'];
export const B_POOL = ['review-6dof', 'rrrp-2022-q10'];
const VIEWS: ViewKey[] = ['xOut', 'yIn'];

export const SCREW_COLS = ['$\\omega_x$', '$\\omega_y$', '$\\omega_z$', '$v_x$', '$v_y$', '$v_z$'];
const NAMES = ['x', 'y', 'z'];

const negW = (w: Vec3): Vec3 => w.map((x) => (Math.abs(x) < 1e-12 ? 0 : -x)) as Vec3;
const cellsOf = (w: Vec3, v: LinVec): string[] => [...w.map(numStr), ...v.map(linStr)];
const sameCells = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const isZeroVec = (v: LinVec) => v.every((c) => Object.keys(c).length === 0);
const col = (R: ArmSpec['R'], k: number): Vec3 => [R[0][k], R[1][k], R[2][k]];
/** A row as TeX: 0, 0, 1, -L_1, 0, 0. */
export const rowTeX = (r: ScrewRow) => [...r.w.map(numStr), ...r.v.map(linTeX)].join(', ');

/** '+\hat x_b' for a direction given in {s}: which {b} axis it is. */
export function bAxisTeX(arm: ArmSpec, d: Vec3): string {
  for (let k = 0; k < 3; k++) {
    const c = col(arm.R, k);
    const dp = c[0] * d[0] + c[1] * d[1] + c[2] * d[2];
    if (Math.abs(dp) > 0.5) return `${dp < 0 ? '-' : '+'}\\hat ${NAMES[k]}_b`;
  }
  return '0';
}

/** The shortcut v = −ω × q for each axis-aligned ω (with q = (q_x, q_y, q_z)). */
export const SHORTCUT_TABLE =
  '$$\\begin{array}{c|c} \\omega & v = -\\omega \\times q \\\\ \\hline (1, 0, 0) & (0,\\ q_z,\\ -q_y) \\\\ (0, 1, 0) & (-q_z,\\ 0,\\ q_x) \\\\ (0, 0, 1) & (q_y,\\ -q_x,\\ 0) \\end{array} \\qquad \\text{(a negative } \\omega \\text{ negates } v\\text{)}$$';

/** How a direction is drawn: 'up', 'right', 'down-left, out of the page', 'up-right, into the page' … */
export const drawnAs = (d: Vec3, view: ArmSpec['view']): string => screenWord(d, view);

/** "joint 2 is revolute (axis drawn up; right-hand rule on its arrow): ω₂ along +ẑ_s" (or the prismatic version). */
function jointReading(arm: ArmSpec, i: number, frame: 's' | 'b'): string {
  const J = arm.joints[i];
  const n = i + 1;
  const inB = frame === 'b' ? `, which is $${bAxisTeX(arm, J.axis)}$ in $\\{b\\}$` : '';
  if (J.type === 'P') return `joint ${n} is **prismatic** (a box whose straight arrow is drawn ${drawnAs(J.axis, arm.view)}): $\\omega_${n} = 0$, $v_${n}$ along $${axisTeX(J.axis)}$${inB}`;
  return `joint ${n} is **revolute** (axis drawn ${drawnAs(J.axis, arm.view)}; right-hand rule on its arrow): $\\omega_${n}$ along $${axisTeX(J.axis)}$${inB}`;
}

/** One substitution line: q_i (and q_b), then v_i = −ω_i × q_i. */
function rowWorking(arm: ArmSpec, i: number, frame: 's' | 'b'): string {
  const r = screwRow(arm, i, frame);
  const n = i + 1;
  if (r.type === 'P') return `Joint ${n} (P): $\\omega_${n} = (0, 0, 0)$, $v_${n} = ${vecTeX3(linVecEval(r.v, {}))}$, the unit direction of its arrow${frame === 'b' ? ' written in $\\{b\\}$ axes' : ''}.`;
  const q = r.q!;
  const qs = canonQ(arm.joints[i].q, arm.joints[i].axis);
  let pre = `$q_${n} = ${linVecTeX3(q)}$; `;
  if (frame === 'b') {
    // R^T(q − p) exactly as computed, then (if it has one) drop its component along ω_b, which does not change v
    const qbFull = matTLin(arm.R, linVecSub(qs, arm.p));
    const same = qbFull.every((c, k) => linStr(c) === linStr(q[k]));
    pre =
      `$q_${n} - p = ${linVecTeX3(linVecSub(qs, arm.p))}$ in $\\{s\\}$, so in $\\{b\\}$ axes ` +
      (same
        ? `$q_{b,${n}} = R^T(q_${n} - p) = ${linVecTeX3(qbFull)}$; `
        : `$R^T(q_${n} - p) = ${linVecTeX3(qbFull)}$; its component along $\\omega_{b,${n}}$ does not change $v$, so take $q_{b,${n}} = ${linVecTeX3(q)}$; `);
  }
  return `Joint ${n} (R): ${pre}$v_${n} = -${vecTeX3(r.w)} \\times ${linVecTeX3(q)} = ${linVecTeX3(r.v)}$.`;
}

/** The worked table: i, type, ω_i, q_i, v_i (bold), in {s} or {b}. */
export function screwTableTeX(arm: ArmSpec, frame: 's' | 'b', only?: number): string {
  const rows = arm.joints
    .map((_, i) => i)
    .filter((i) => only === undefined || i === only)
    .map((i) => {
      const r = screwRow(arm, i, frame);
      return `${i + 1} & ${r.type} & ${vecTeX3(r.w)} & ${r.q ? linVecTeX3(r.q) : '\\text{—}'} & \\boldsymbol{${linVecTeX3(r.v)}}`;
    });
  const qh = frame === 'b' ? 'q_{b,i}' : 'q_i';
  return `$$\\begin{array}{c|c|c|c|c} i & & \\omega_i & ${qh} & v_i \\\\ \\hline ${rows.join(' \\\\ ')} \\end{array}$$`;
}

interface Slip {
  cells: string[];
  message: string;
  trapId: string;
}

/** The known slips for joint i's row (each a whole wrong row), never equal to the right row. */
function rowSlips(arm: ArmSpec, i: number, frame: 's' | 'b'): Slip[] {
  const r: ScrewRow = screwRow(arm, i, frame);
  const J = arm.joints[i];
  const n = i + 1;
  const ans = r.cells;
  const traps: Slip[] = [];
  const add = (cells: string[], message: string, trapId: string) => {
    if (sameCells(cells, ans) || traps.some((t) => sameCells(t.cells, cells))) return;
    traps.push({ cells, message, trapId });
  };
  if (J.type === 'R') {
    const wTeX = frame === 's' ? axisTeX(r.w) : bAxisTeX(arm, J.axis);
    if (!isZeroVec(r.v)) {
      add(
        cellsOf(r.w, r.v.map(linNeg) as LinVec),
        `$\\omega_${n}$ is right, but every sign of $v_${n}$ is reversed: that is $\\omega \\times q$. The screw axis uses $v = -\\omega \\times q$ (equivalently $q \\times \\omega$).`,
        'v-cross-sign'
      );
      add(
        cellsOf(negW(r.w), r.v),
        `You reversed $\\omega_${n}$ but kept $v_${n}$. $v = -\\omega \\times q$ is linear in $\\omega$, so the two always flip together, and on this figure the arrow gives $\\omega_${n}$ along $${wTeX}$.`,
        'kin-omega-flip-only'
      );
    }
    add(
      cellsOf(negW(r.w), r.v.map(linNeg) as LinVec),
      `This row is self-consistent, but for the opposite rotation sense. Curl the fingers of your right hand along the drawn arrow of joint ${n}: your thumb points along $${wTeX}$${frame === 'b' ? '' : ` (drawn ${drawnAs(J.axis, arm.view)})`}.`,
      'kin-arrow-sense'
    );
    if (frame === 'b') {
      const sRow = screwRow(arm, i, 's');
      add(
        sRow.cells,
        `That is joint ${n}’s screw axis in $\\{s\\}$. In a $\\{b\\}$ table both vectors are written from $\\{b\\}$: $\\omega_b = R^T\\omega$ (here $${vecTeX3(r.w)}$) and $q$ is measured from the $\\{b\\}$ origin, $q_b = R^T(q - p)$.`,
        'b-frame-q'
      );
      const qFromS = matTLin(arm.R, canonQ(J.q, J.axis));
      add(
        cellsOf(r.w, crossNL(r.w, qFromS).map(linNeg) as LinVec),
        `$\\omega_{b}$ is right, but $q$ was measured from the $\\{s\\}$ origin. In $\\{b\\}$, measure it from the $\\{b\\}$ origin: $q_b = R^T(q - p)$, i.e. subtract $p$ before rotating.`,
        'b-frame-q'
      );
    }
  } else {
    const dir = r.v;
    add(
      [...dir.map(linStr), '0', '0', '0'],
      `A prismatic joint does not rotate, so $\\omega_${n} = 0$; the direction of travel goes in $v_${n}$.`,
      'kin-prismatic-omega'
    );
    add(cellsOf([0, 0, 0], dir.map(linNeg) as LinVec), `Right axis, wrong direction: $v_${n}$ points the way the straight arrow points (positive $\\theta_${n}$ extends the joint that way).`, 'sign');
    if (frame === 'b') {
      const sRow = screwRow(arm, i, 's');
      add(sRow.cells, `That is the direction of travel in $\\{s\\}$ axes. In the $\\{b\\}$ table write it in $\\{b\\}$ axes: $v_b = R^T v = ${vecTeX3(linVecEval(r.v, {}))}$.`, 'b-frame-q');
    }
  }
  return traps;
}

/** "S" or "B": the screw-axis letter for a frame. */
const screwSym = (frame: 's' | 'b', n: number) => `\\mathcal{${frame === 's' ? 'S' : 'B'}}_${n}`;

/** One joint's row S_i = (ω_i, v_i) as a 1 × 6 symbolic part, with the row-level slips as traps. */
export function screwRowPart(arm: ArmSpec, i: number, frame: 's' | 'b', o: { marks: number; id?: string; label?: string }): MatrixPart {
  const r = screwRow(arm, i, frame);
  const J = arm.joints[i];
  const n = i + 1;
  return {
    kind: 'matrix',
    id: o.id ?? `S${n}`,
    label: o.label ?? `Joint ${n} (${J.type === 'R' ? 'revolute' : 'prismatic'}): $${screwSym(frame, n)} = (\\omega_${n}, v_${n})$ in $\\{${frame}\\}$`,
    answer: [[...r.w, ...linVecEval(r.v, arm.values)]],
    symbolic: { vars: arm.symbols, answer: [r.cells], traps: rowSlips(arm, i, frame).map((s) => ({ answer: [s.cells], message: s.message, trapId: s.trapId })) },
    rowLabels: [`$${screwSym(frame, n)}$`],
    colLabels: SCREW_COLS,
    placeholder: '0',
    marks: o.marks,
  };
}

/**
 * The whole screw-axis table (one row per joint, as on the paper) as one symbolic part. Its traps are the table
 * with ONE row slipped (so a single slip is still named precisely, row by row), plus the systematic slips:
 * every revolute v negated (ω × q throughout) and, in {b}, the {s} table or q measured from the {s} origin.
 */
export function screwTablePart(arm: ArmSpec, frame: 's' | 'b', o: { marks: number; id?: string; label?: string }): MatrixPart {
  const rows = arm.joints.map((_, i) => screwRow(arm, i, frame));
  const ans = rows.map((r) => r.cells);
  const traps: { answer: string[][]; message: string; trapId: string }[] = [];
  const sameTable = (a: string[][], b: string[][]) => a.every((r, i) => sameCells(r, b[i]));
  const add = (answer: string[][], message: string, trapId: string) => {
    if (sameTable(answer, ans) || traps.some((t) => sameTable(t.answer, answer))) return;
    traps.push({ answer, message, trapId });
  };
  // systematic slips first (they would otherwise be shadowed by nothing, but read better when they apply)
  const revV = rows.map((r, i) => (r.type === 'R' && !isZeroVec(r.v) ? i : -1)).filter((i) => i >= 0);
  if (revV.length >= 2)
    add(
      rows.map((r, i) => (revV.includes(i) ? cellsOf(r.w, r.v.map(linNeg) as LinVec) : r.cells)),
      'Every revolute $v$ has the wrong sign: you computed $\\omega \\times q$. The screw axis uses $v = -\\omega \\times q$ (equivalently $q \\times \\omega$); the $\\omega$ columns are right.',
      'v-cross-sign'
    );
  if (frame === 'b') {
    add(
      arm.joints.map((_, i) => screwRow(arm, i, 's').cells),
      'That is the screw-axis table in $\\{s\\}$. In $\\{b\\}$ every vector is written in $\\{b\\}$ axes ($\\omega_b = R^T\\omega$) and every $q$ is measured from the $\\{b\\}$ origin: $q_b = R^T(q - p)$.',
      'b-frame-q'
    );
    add(
      rows.map((r, i) => (r.type === 'R' ? cellsOf(r.w, crossNL(r.w, matTLin(arm.R, canonQ(arm.joints[i].q, arm.joints[i].axis))).map(linNeg) as LinVec) : r.cells)),
      'The $\\omega_b$ columns are right, but every $q$ was measured from the $\\{s\\}$ origin. In $\\{b\\}$, measure from the $\\{b\\}$ origin: $q_b = R^T(q - p)$ (subtract $p$ before rotating).',
      'b-frame-q'
    );
  }
  rows.forEach((_, i) => {
    for (const s of rowSlips(arm, i, frame)) add(ans.map((r, k) => (k === i ? s.cells : r)), `Row ${i + 1} (joint ${i + 1}): ${s.message}`, s.trapId);
  });
  return {
    kind: 'matrix',
    id: o.id ?? 'table',
    label: o.label ?? `The screw-axis table in $\\{${frame}\\}$: one row $${screwSym(frame, 0).replace(/_0$/, '_i')} = (\\omega_i, v_i)$ per joint`,
    answer: rows.map((r) => [...r.w, ...linVecEval(r.v, arm.values)]),
    symbolic: { vars: arm.symbols, answer: ans, traps },
    rowLabels: rows.map((r, i) => `$${screwSym(frame, i + 1)}$ (${r.type})`),
    colLabels: SCREW_COLS,
    placeholder: '0',
    marks: o.marks,
  };
}

/** "Which way does ω_k point?" (seven options: the six axis directions and 0), as a compact grid in a fixed order. */
function omegaChoice(arm: ArmSpec, i: number): PickPart {
  const J = arm.joints[i];
  const n = i + 1;
  const truth: Vec3 = J.type === 'R' ? J.axis : [0, 0, 0];
  const dirs: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const same = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-9;
  const opts: PickOption[] = dirs.map((d) => {
    const ok = same(d, truth);
    let why: string;
    let trapId: string | undefined;
    if (J.type === 'P') {
      why = `Joint ${n} is a box with a straight arrow: it slides, so it has no rotation at all. $${axisTeX(J.axis)}$ is its direction of travel, which goes in $v_${n}$, not $\\omega_${n}$.`;
      trapId = 'kin-prismatic-omega';
    } else if (ok) why = `The joint’s axis is drawn ${drawnAs(d, arm.view)}, and curling your right hand along the drawn arrow puts your thumb along $${axisTeX(d)}$.`;
    else if (same(d, negW(truth))) {
      why = `Right axis, opposite sense. Curl the fingers of your right hand along the drawn arrow: your thumb points ${drawnAs(truth, arm.view)}, i.e. $${axisTeX(truth)}$.`;
      trapId = 'kin-arrow-sense';
    } else why = `$${axisTeX(d)}$ is drawn ${drawnAs(d, arm.view)}, but joint ${n}’s axis (the cylinder’s centre line) is drawn ${drawnAs(truth, arm.view)}.`;
    return { text: `$\\omega_${n} = ${vecTeX3(d)}$`, correct: ok, why, trapId };
  });
  opts.push({
    text: `$\\omega_${n} = (0, 0, 0)$`,
    correct: J.type === 'P',
    why:
      J.type === 'P'
        ? `A prismatic joint only translates, so $\\omega_${n} = 0$ and $v_${n}$ is the unit direction of its arrow, $${axisTeX(J.axis)}$.`
        : `Only a prismatic joint has $\\omega = 0$. Joint ${n} is a cylinder with a curved arrow: it rotates.`,
  });
  return pickPart({ id: 'w', label: `(a) Which is $\\omega_${n}$, written in $\\{s\\}$?`, options: opts, marks: 1, colWidth: 176 });
}

export function pickArm(rng: Rng, tier: Tier): ArmSpec {
  if (tier === 3) return rng.chance(0.5) ? examArm(rng.pick(B_POOL)) : pickRandomArm(rng, rng.int(3, 4), { views: VIEWS });
  return rng.chance(0.5) ? examArm(rng.pick(S_POOL)) : pickRandomArm(rng, rng.int(3, 4), { views: VIEWS });
}

/** A joint worth asking about on its own: prismatic, or revolute with v ≠ 0 (an axis off the origin). */
function interestingJoint(rng: Rng, arm: ArmSpec): number {
  const good = arm.joints.map((_, i) => i).filter((i) => arm.joints[i].type === 'P' || !isZeroVec(screwRow(arm, i, 's').v));
  const rev = good.filter((i) => arm.joints[i].type === 'R');
  if (rev.length && rng.chance(0.75)) return rng.pick(rev);
  return good.length ? rng.pick(good) : rng.int(0, arm.joints.length - 1);
}

export function robotIntroS(arm: ArmSpec): string {
  const paper = ARM_PAPER[arm.id];
  const types = arm.joints.map((j) => j.type).join('');
  return paper
    ? `The figure shows the ${types} arm of ${paper} at its zero configuration.`
    : `The figure shows a ${types} arm at its zero configuration (joints $\\theta_1$ to $\\theta_${arm.joints.length}$ from the base).`;
}

const CONCEPT =
  'Each joint contributes one screw axis $\\mathcal{S}_i = (\\omega_i, v_i)$, written at the zero configuration. **Revolute** (a cylinder with a curved arrow): $\\omega_i$ is the unit vector along the joint axis, its sign from the right-hand rule (curl your fingers along the drawn arrow; your thumb is $+\\omega_i$), and $v_i = -\\omega_i \\times q_i$ for **any** point $q_i$ on the axis. **Prismatic** (a box with a straight arrow): $\\omega_i = 0$ and $v_i$ is the unit direction of the arrow. Why $-\\omega \\times q$: $v_i$ is the velocity of the point at the frame origin when the joint turns at 1 rad/s, $\\omega \\times (0 - q)$, so it depends on where the axis is but not on which point of it you pick.';

export const generators: SolveGenerator[] = [
  {
    id: 'kin-screws',
    title: 'Screw-axis table: S = (ω, v) for every joint',
    summary: 'Read each joint’s axis and rotation sense off an exam-style figure, pick a point $q$ on it and compute $v = -\\omega \\times q$; prismatic joints get $\\omega = 0$. Tier 3 writes the table in $\\{b\\}$.',
    tiers: [1, 2, 3],
    source: 'Similar to 2023 Q33(b) (8 marks), 2024 Q30(b) (6), 2025 Q30(b) (5), 2022 Q33; review deck slide 20 ({b} table); summary notes §6 steps 3–5',
    cardId: 'kin-screws',
    marks: 6,
    generate(rng, tier) {
      const arm = pickArm(rng, tier);
      const frame: 's' | 'b' = tier === 3 ? 'b' : 's';
      const fr = `\\{${frame}\\}`;
      const n = arm.joints.length;
      const parts: SolvePart[] = [];
      let only: number | undefined;
      if (tier === 1) {
        only = interestingJoint(rng, arm);
        parts.push(omegaChoice(arm, only));
        parts.push(screwRowPart(arm, only, 's', { marks: 2, id: 'row', label: `(b) The whole row for joint ${only + 1}: $\\mathcal{S}_${only + 1} = (\\omega_${only + 1}, v_${only + 1})$ in $\\{s\\}$` }));
      } else {
        parts.push(screwTablePart(arm, frame, { marks: Math.max(5, Math.min(8, 2 * n)) }));
      }

      const reveals: { id: OverlayId; label: string }[] = [{ id: frame === 's' ? 'screws-s' : 'screws-b', label: 'ω and q on the figure' }];
      if (frame === 'b') reveals.push({ id: 'p', label: 'p on the figure' });
      const figure = armFigure(arm, { reveals });

      const fname = (f: string) => f.replace(/[{}]/g, (c) => `\\${c}`);
      const paperName =
        arm.frames && ARM_PAPER[arm.id] && (arm.frames.s !== '{s}' || arm.frames.b !== '{b}') ? ` The paper calls these $${fname(arm.frames.s)}$ and $${fname(arm.frames.b)}$.` : '';
      const task =
        tier === 1
          ? `Find the screw axis of **joint ${only! + 1}** in $\\{s\\}$: first its $\\omega_${only! + 1}$, then the whole row $\\mathcal{S}_${only! + 1} = (\\omega_${only! + 1}, v_${only! + 1})$.`
          : tier === 2
            ? `With the screw axes defined in frame $\\{s\\}$, fill in $\\mathcal{S}_i = (\\omega_i, v_i)$ for every joint, one row per joint. Keep the lengths as symbols.`
            : `With the screw axes defined in the **body frame** $\\{b\\}$, fill in $\\mathcal{B}_i = (\\omega_{b,i}, v_{b,i})$ for every joint. For reference, $$M = ${mTeX(arm.R, arm.p)}.$$`;
      const prompt = `${robotIntroS(arm)} ${FRAMES_SENTENCE}${paperName}\n\n${task}`;

      const idx = only === undefined ? arm.joints.map((_, i) => i) : [only];
      const readings = idx.map((i) => jointReading(arm, i, frame)).join('; ');
      const setup =
        frame === 's'
          ? `On this figure ${sAxesSentence(arm.view)}. Reading the joints: ${readings}. Then $v = -\\omega \\times q$ with the shortcuts ${SHORTCUT_TABLE} Choose each $q_i$ as the simplest point on the axis, usually a corner you can reach by walking along the links.`
          : `First read $\\{b\\}$: ${columnReadings(arm)}, and $p = ${linVecTeX3(arm.p)}$. Then for each joint: $\\omega_b = R^T\\omega$ (just say which $\\{b\\}$ axis the joint axis lies along), $q_b = R^T(q - p)$ (the point on the axis, measured from the $\\{b\\}$ origin and written in $\\{b\\}$ axes), and $v_b = -\\omega_b \\times q_b$. Reading the joints: ${readings}. Shortcuts: ${SHORTCUT_TABLE}`;
      const subs = idx.map((i) => rowWorking(arm, i, frame)).join('\n\n');
      const checks =
        'Checks: every revolute row has $\\|\\omega\\| = 1$ and $\\omega \\cdot v = 0$; an axis through the frame origin has $v = 0$; parallel axes share $\\omega$ and differ only in $v$. Reversing an arrow reverses $\\omega$ **and** $v$ together.';
      const worked = [
        `**Answer** (each row $${frame === 's' ? '\\mathcal{S}' : '\\mathcal{B}'}_i = (\\omega_i, v_i)$ in $${fr}$; $v$ in bold):`,
        screwTableTeX(arm, frame, only),
        tier === 1 ? `So **$\\mathcal{S}_${only! + 1} = (${rowTeX(screwRow(arm, only!, 's'))})$**.` : checks,
      ].join('\n\n');
      const hints: [string, string, string, string] = [
        tier === 3
          ? `${CONCEPT} In the **body** form the same rule is applied from $\\{b\\}$: $\\mathcal{B}_i = [\\mathrm{Ad}_{M^{-1}}]\\mathcal{S}_i$, i.e. write $\\omega$ in $\\{b\\}$ axes and measure $q$ from the $\\{b\\}$ origin.`
          : CONCEPT,
        setup,
        subs,
        worked,
      ];
      return { prompt, figure, parts, hints };
    },
  },
];
