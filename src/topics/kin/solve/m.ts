// Build M (kin-m): the end-effector frame at the zero configuration, read off an exam-style figure.
//   Tier 1: an exam robot, one reading at a time: x̂_b, ẑ_b, the right-hand check for ŷ_b, then p.
//   Tier 2: the full symbolic 4 × 4 M (an exam robot or a random arm drawn like the papers), plus a classmate's R
//           with the diagonal (out-of-page) axis read backwards: which column does det R = −1 point at?
//   Tier 3: a random arm with {s} drawn in an unfamiliar orientation (x̂ up, or an axis pointing left), the full
//           M, then a classmate who wrote the axes as rows (det Rᵀ = +1, so the determinant cannot catch it).
import type { ChoicePart, MatrixPart, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import { armM, det3, linScale, linStr, linTeX, type ArmSpec, type LinVec, type Mat3, type Vec3 } from '../../../core/kin';
import { armFigure } from './kinfigArm';
import { ARM_PAPER, axisIndex, axisTeX, bmatrix, examArm, linVecTeX3, mTeX, numStr, pathSentence, pickRandomArm, sAxesSentence, screenWord, vecTeX3, type ViewKey } from './kinfigArms';
import type { Rng } from '../../../engine/rng';
import './kinfigTraps';

export const M_POOL = ['rprr-2023', 'prr-2024', 'rrrrr-2025', 'review-6dof', 'rrrp-2022'];
const NAMES = ['x', 'y', 'z'];

const col = (R: Mat3 | number[][], k: number): Vec3 => [R[0][k], R[1][k], R[2][k]];
const transposeM = (R: Mat3): Mat3 => [0, 1, 2].map((i) => [R[0][i], R[1][i], R[2][i]]) as Mat3;
const isSym = (R: Mat3) => [0, 1, 2].every((i) => [0, 1, 2].every((j) => Math.abs(R[i][j] - R[j][i]) < 1e-12));
const bAxis = (k: number) => `\\hat ${NAMES[k]}_b`;

/** The six axis directions of {s}, as options. */
export const AXIS_DIRS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const sameDir = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-9;

/** M as typed strings (4 × 4), for any R and p. */
export function mCells(R: Mat3 | number[][], p: LinVec): string[][] {
  return [...[0, 1, 2].map((i) => [numStr(R[i][0]), numStr(R[i][1]), numStr(R[i][2]), linStr(p[i])]), ['0', '0', '0', '1']];
}

/** Index of the column of R that lies along the out-of-page direction (the diagonal on the figure). */
export function diagonalColumn(arm: ArmSpec): number {
  return [0, 1, 2].find((k) => Math.abs(col(arm.R, k)[0] * arm.view.out[0] + col(arm.R, k)[1] * arm.view.out[1] + col(arm.R, k)[2] * arm.view.out[2]) > 0.5) ?? 2;
}

/** The full 4 × 4 symbolic M part, with the known slips as traps. */
export function mMatrixPart(arm: ArmSpec, o: { labels: boolean; marks: number; id?: string; label?: string }): MatrixPart {
  const traps: NonNullable<MatrixPart['symbolic']>['traps'] = [];
  if (!isSym(arm.R))
    traps.push({
      answer: mCells(transposeM(arm.R), arm.p),
      message: 'You have written $\\hat x_b, \\hat y_b, \\hat z_b$ as the **rows** of $R$. Each one is a **column**: the first column of $R$ is $\\hat x_b$ written in $\\{s\\}$.',
      trapId: 'kin-r-rows',
    });
  const kd = diagonalColumn(arm);
  const flipped = arm.R.map((r) => r.map((x, j) => (j === kd ? -x : x)));
  traps.push({
    answer: mCells(flipped, arm.p),
    message: `The $${bAxis(kd)}$ column points the wrong way. It is the axis drawn diagonally: on this figure the diagonal drawn down-left is $${axisTeX(arm.view.out)}$ (out of the page). Check: $\\det R$ would be $-1$.`,
    trapId: 'diagonal-axis',
  });
  const ko = axisIndex(arm.view.out);
  if (Object.keys(arm.p[ko]).length) {
    const p2 = arm.p.map((c, i) => (i === ko ? linScale(c, -1) : c)) as LinVec;
    traps.push({
      answer: mCells(arm.R, p2),
      message: `$R$ is right, but $p_${NAMES[ko]}$ has the wrong sign. On this figure $${axisTeX(arm.view.out)}$ is drawn down-left (out of the page), so a link drawn up-right (into the page) runs along $${axisTeX(arm.view.out.map((x) => -x) as Vec3)}$.`,
      trapId: 'diagonal-axis',
    });
  }
  return {
    kind: 'matrix',
    id: o.id ?? 'M',
    label: o.label ?? '$M$, the configuration of $\\{b\\}$ in $\\{s\\}$ at the zero configuration (lengths as symbols)',
    answer: armM(arm),
    symbolic: { vars: arm.symbols, answer: mCells(arm.R, arm.p), traps },
    placeholder: '0',
    colLabels: o.labels ? ['$\\hat x_b$', '$\\hat y_b$', '$\\hat z_b$', '$p$'] : undefined,
    marks: o.marks,
  };
}

/** "Which way does x̂_b point?" with a why per direction that uses this figure's screen directions. */
function axisChoice(arm: ArmSpec, k: number, id: string, label: string, marks: number): ChoicePart {
  const truth = col(arm.R, k);
  return {
    kind: 'choice',
    id,
    label,
    options: AXIS_DIRS.map((d) => ({
      text: `$${axisTeX(d)}$`,
      correct: sameDir(d, truth),
      why: sameDir(d, truth)
        ? `$${bAxis(k)}$ is drawn pointing ${screenWord(truth, arm.view)}, and on this figure that is $${axisTeX(d)}$.`
        : sameDir(d, truth.map((x) => -x) as Vec3)
          ? `Opposite sign: $${axisTeX(d)}$ points ${screenWord(d, arm.view)}, but $${bAxis(k)}$ is drawn pointing ${screenWord(truth, arm.view)}.`
          : `$${axisTeX(d)}$ points ${screenWord(d, arm.view)} on this figure; $${bAxis(k)}$ is drawn pointing ${screenWord(truth, arm.view)}.`,
    })),
    marks,
  };
}

/** A classmate reads the diagonal axis backwards: which column of their R is wrong? */
export function classmateFlipPart(arm: ArmSpec, marks: number): ChoicePart {
  const kd = diagonalColumn(arm);
  const Rw = arm.R.map((r) => r.map((x, j) => (j === kd ? -x : x)));
  const wrongCol = col(Rw, kd);
  const rightCol = col(arm.R, kd);
  return {
    kind: 'choice',
    id: 'classmate',
    label: `A classmate writes $R' = ${bmatrix(Rw.map((r) => r.map(numStr)))}$ for this robot. Which column must they fix?`,
    options: [
      ...[0, 1, 2].map((k) => ({
        text: `The $${bAxis(k)}$ column`,
        correct: k === kd,
        why:
          k === kd
            ? `$\\det R' = -1$, so $R'$ is a reflection, not a rotation: one axis is reversed. Their $${bAxis(k)}$ column is $${axisTeX(wrongCol)}$ (${screenWord(wrongCol, arm.view)}), but $${bAxis(k)}$ is drawn ${screenWord(rightCol, arm.view)}, i.e. $${axisTeX(rightCol)}$. The diagonal axis is the one most often misread.`
            : `Their $${bAxis(k)}$ column, $${axisTeX(col(Rw, k))}$, matches the figure (drawn ${screenWord(col(Rw, k), arm.view)}). $\\det R' = -1$ only says that some column is reversed; compare each one with the figure.`,
      })),
      {
        text: "None: $R'$ is a valid rotation matrix",
        correct: false,
        why: `$\\det R' = -1$ (equivalently $\\hat x \\times \\hat y = -\\hat z$ for its columns), so $R'$ is not a rotation.`,
      },
    ],
    marks,
  };
}

/** A classmate writes Rᵀ and trusts det = +1. */
export function classmateTransposePart(arm: ArmSpec, marks: number): ChoicePart {
  const Rt = transposeM(arm.R);
  return {
    kind: 'choice',
    id: 'classmate',
    label: `A classmate writes $R' = ${bmatrix(Rt.map((r) => r.map(numStr)))}$, checks that $\\det R' = +1$, and concludes it is right. Are they right?`,
    options: [
      {
        text: "No: they wrote $\\hat x_b, \\hat y_b, \\hat z_b$ as rows, and $\\det R' = +1$ cannot catch that",
        correct: true,
        why: `$R' = R^T = R^{-1}$ is also a rotation (det $+1$), but it is the orientation of $\\{s\\}$ seen from $\\{b\\}$. Its first column is $${axisTeX(col(Rt, 0))}$, while $\\hat x_b$ is drawn ${screenWord(col(arm.R, 0), arm.view)}, i.e. $${axisTeX(col(arm.R, 0))}$.`,
      },
      {
        text: "Yes: $\\det R' = +1$ and its columns are orthonormal, so it is $R$",
        correct: false,
        why: 'Those checks are necessary, not sufficient: $R^T$ passes them too. Compare each column with the drawn axes.',
      },
      {
        text: "No: $\\det R' = -1$",
        correct: false,
        why: '$\\det R^T = \\det R = +1$. The slip is rows versus columns, which the determinant cannot see.',
      },
      {
        text: 'Yes: a rotation matrix is symmetric, so rows and columns are interchangeable',
        correct: false,
        why: 'Rotation matrices are generally not symmetric: $R = R^T$ only for rotations by $0$ or $\\pi$.',
      },
    ],
    marks,
  };
}

/** The screen dictionary of this figure: "right = +ŷ_s, left = −ŷ_s, …". */
export function screenDictionary(arm: ArmSpec): string {
  const v = arm.view;
  const neg = (d: Vec3) => d.map((x) => -x) as Vec3;
  return [
    `right $= ${axisTeX(v.right)}$`,
    `left $= ${axisTeX(neg(v.right))}$`,
    `up $= ${axisTeX(v.up)}$`,
    `down $= ${axisTeX(neg(v.up))}$`,
    `down-left (out of the page) $= ${axisTeX(v.out)}$`,
    `up-right (into the page) $= ${axisTeX(neg(v.out))}$`,
  ].join(', ');
}

/** "x̂_b is drawn down = −ẑ_s = (0, 0, −1)" for each column. */
export function columnReadings(arm: ArmSpec): string {
  return [0, 1, 2].map((k) => `$${bAxis(k)}$ is drawn ${screenWord(col(arm.R, k), arm.view)}: $${axisTeX(col(arm.R, k))} = ${vecTeX3(col(arm.R, k))}$`).join('; ');
}

export function rightHandCheck(arm: ArmSpec): string {
  const x = col(arm.R, 0);
  const y = col(arm.R, 1);
  const z = col(arm.R, 2);
  const c: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const ok = sameDir(c, z);
  return `$\\hat x_b \\times \\hat y_b = ${vecTeX3(x)} \\times ${vecTeX3(y)} = ${vecTeX3(c)}${ok ? ' = \\hat z_b' : ''}$${ok ? ' ✓' : ''}, so $\\det R = ${numStr(det3(arm.R))}$`;
}

export function robotIntro(arm: ArmSpec): string {
  const paper = ARM_PAPER[arm.id];
  const types = arm.joints.map((j) => j.type).join('');
  return paper
    ? `The figure shows the ${types} arm of ${paper} at its zero configuration.`
    : `The figure shows a ${types} arm at its zero configuration (joints $\\theta_1$ to $\\theta_${arm.joints.length}$ from the base).`;
}

export const FRAMES_SENTENCE =
  'The static frame $\\{s\\}$ is at the base and the body frame $\\{b\\}$ at the end effector; each is drawn as a labelled triad joined to its origin (the dot) by a thin leader. The drawing is not to scale: use the symbols.';

const VIEWS_T2: ViewKey[] = ['xOut', 'yIn'];
const VIEWS_T3: ViewKey[] = ['xUp', 'xLeft', 'yLeft', 'zRight'];

export function armForM(rng: Rng, tier: Tier): ArmSpec {
  if (tier === 1 || (tier === 2 && rng.chance(0.5))) return examArm(rng.pick(M_POOL));
  if (tier === 2) return pickRandomArm(rng, rng.int(3, 4), { views: VIEWS_T2 });
  return pickRandomArm(rng, rng.int(4, 5), { views: VIEWS_T3 });
}

export const generators: SolveGenerator[] = [
  {
    id: 'kin-m',
    title: 'Build M: the end-effector frame at the zero configuration',
    summary: 'Read $\\hat x_b, \\hat y_b, \\hat z_b$ and $p$ off an exam-style figure and assemble $M = \\begin{bmatrix} R & p \\\\ 0 & 1 \\end{bmatrix}$, then check that $R$ is right-handed.',
    tiers: [1, 2, 3],
    source: 'Similar to 2023 Q33(a), 2024 Q30(a), 2025 Q30(a) (4 marks each); review deck slide 20; summary notes §6 step 2',
    cardId: 'kin-m',
    marks: 4,
    generate(rng, tier) {
      const arm = armForM(rng, tier);
      const figure = armFigure(arm, { reveals: [{ id: 'p', label: 'p on the figure' }] });
      const parts: SolvePart[] = [];
      if (tier === 1) {
        parts.push(axisChoice(arm, 0, 'xb', '(a) Which way does $\\hat x_b$ point, written in $\\{s\\}$?', 0.5));
        parts.push(axisChoice(arm, 2, 'zb', '(b) Which way does $\\hat z_b$ point, written in $\\{s\\}$?', 0.5));
        const y = col(arm.R, 1);
        const z = col(arm.R, 2);
        const x = col(arm.R, 0);
        parts.push({
          kind: 'choice',
          id: 'yb',
          label: '(c) Right-hand check: what is $\\hat z_b \\times \\hat x_b$? (It must equal $\\hat y_b$ as drawn.)',
          options: AXIS_DIRS.map((d) => ({
            text: `$${axisTeX(d)}$`,
            correct: sameDir(d, y),
            why: sameDir(d, y)
              ? `$${vecTeX3(z)} \\times ${vecTeX3(x)} = ${vecTeX3(y)}$, and $\\hat y_b$ is indeed drawn ${screenWord(y, arm.view)}: the frame is right-handed.`
              : sameDir(d, y.map((t) => -t) as Vec3)
                ? `That is $\\hat x_b \\times \\hat z_b$: the order matters, since $a \\times b = -(b \\times a)$. In a right-handed frame $\\hat z \\times \\hat x = \\hat y$.`
                : `$${axisTeX(d)}$ is parallel to $\\hat x_b$ or $\\hat z_b$, and a cross product is perpendicular to both of its factors.`,
          })),
          marks: 1,
        });
        parts.push({
          kind: 'matrix',
          id: 'p',
          label: '(d) $p$: the position of the $\\{b\\}$ origin in $\\{s\\}$',
          answer: [[0], [0], [0]],
          symbolic: { vars: arm.symbols, answer: arm.p.map((c) => [linStr(c)]) },
          rowLabels: ['$p_x$', '$p_y$', '$p_z$'],
          placeholder: '0',
          marks: 2,
        });
      } else {
        parts.push(mMatrixPart(arm, { labels: tier === 2, marks: 3, label: '(a) $M$, the configuration of $\\{b\\}$ in $\\{s\\}$ at the zero configuration (lengths as symbols)' }));
        parts.push(tier === 3 && !isSym(arm.R) ? classmateTransposePart(arm, 1) : classmateFlipPart(arm, 1));
      }

      const prompt = [
        `${robotIntro(arm)} ${FRAMES_SENTENCE}`,
        tier === 1 ? 'Build the initial configuration $M$ of $\\{b\\}$ in $\\{s\\}$ one reading at a time.' : 'Compute the initial configuration $M$ of the body frame in the static frame.',
      ].join('\n\n');

      const moves = pathSentence(arm);
      const hints: [string, string, string, string] = [
        '$M$ is the pose of $\\{b\\}$ relative to $\\{s\\}$ with every joint at zero: $$M = \\begin{bmatrix} R & p \\\\ 0 & 1 \\end{bmatrix}, \\qquad R = \\begin{bmatrix} \\hat x_b & \\hat y_b & \\hat z_b \\end{bmatrix}.$$ Each **column** of $R$ is one axis of $\\{b\\}$ written in $\\{s\\}$ coordinates, read straight off the figure; $p$ is the vector from the $\\{s\\}$ origin to the $\\{b\\}$ origin, in $\\{s\\}$. Then check that $R$ is right-handed: $\\hat x_b \\times \\hat y_b = \\hat z_b$, $\\det R = +1$.',
        `On this figure ${sAxesSentence(arm.view)}. So every drawn direction is an $\\{s\\}$ axis: ${screenDictionary(arm)}. Translate each $\\{b\\}$ arrow with that dictionary, and for $p$ walk along the links from the base to $\\{b\\}$, adding each length with the sign of the axis it runs along.`,
        `${columnReadings(arm)}. ${moves ? `Walking to $\\{b\\}$: ${moves}, so $p = ${linVecTeX3(arm.p)}$.` : `$p = ${linVecTeX3(arm.p)}$.`}`,
        [
          `**Answer** (lengths in metres): $$M = ${mTeX(arm.R, arm.p)}$$`,
          `Check: ${rightHandCheck(arm)}.`,
          tier >= 2
            ? tier === 3 && !isSym(arm.R)
              ? 'The classmate’s $R^T$ also has $\\det = +1$, so the determinant cannot catch rows written for columns: only comparing the columns with the drawn axes can.'
              : `The classmate reversed the $${bAxis(diagonalColumn(arm))}$ column (the diagonal one), which makes $\\det R' = -1$; compare each column with the figure to find which.`
            : `Assembled: the columns of $R$ are $${vecTeX3(col(arm.R, 0))}$, $${vecTeX3(col(arm.R, 1))}$, $${vecTeX3(col(arm.R, 2))}$ and **$p = ${linVecTeX3(arm.p)}$**.`,
        ].join('\n\n'),
      ];

      return { prompt, figure, parts, hints };
    },
  },
];
