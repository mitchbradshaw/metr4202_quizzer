// Inverse-kinematics exam-mode generators (summary notes §6 "Forward and inverse kinematics"; 2023 Q11–Q12, 2024 Q12,
// 2025 Q12; 2022 Q4, Q12, Q18, Q21, Q29; review deck slides 18–19):
//   kin-fk-or-ik      forward or inverse kinematics? arm and mobile-robot problems (tiers 1–2)
//   kin-ik-solutions  none / one / two / infinitely many solutions: the reach of a 2-link arm, redundancy,
//                     singularities and the 2022 true/false facts (tiers 1–2)
//   kin-pieper        which 6-DOF layout has closed-form IK and why, drawn like 2023 Q12 (tiers 1–2)
//   kin-nr-step       one Newton–Raphson step for a 2-link planar arm by hand (tiers 1–3); tests/ik.ts checks that its
//                     answers equal the first iterate of core/kin planarIk
import type { ChoicePart, MatrixPart, NumericPart, SolveGenerator, SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { registerTraps } from '../../../engine/traps';
import { fmt, tex } from '../../../engine/format';
import { planarFk, planarJacobian } from '../../../core/kin';
import { EXAM_2023_Q12, LAYOUTS, layoutById, pieperCheck, sameLine, tripleCheck, type PLayout } from '../../../core/kin_pieper';
import { pieperFigure } from '../explore/kinikPieperDraw';
import { nrFigure } from '../explore/kinikNrFigure';

registerTraps([
  {
    id: 'kin-ik-relative-angle',
    title: 'Link 2 points at θ1 + θ2',
    detail: '$\\theta_2$ is measured from link 1, so link 2 makes $\\theta_1 + \\theta_2$ with the $x$-axis: $x = L_1\\cos\\theta_1 + L_2\\cos(\\theta_1 + \\theta_2)$. The same angle sum appears in every Jacobian entry.',
  },
  {
    id: 'kin-nr-transpose',
    title: 'Newton–Raphson uses J⁻¹, not Jᵀ',
    detail: '$J^Te$ is a gradient (Jacobian-transpose) step: a sensible direction but the wrong size. Newton–Raphson solves $J\\Delta\\theta = e$, so $\\Delta\\theta = J^{-1}e$.',
  },
  {
    id: 'kin-nr-adjugate',
    title: 'Divide by det J',
    detail: '$J^{-1} = \\frac{1}{\\det J}\\begin{bmatrix} J_{22} & -J_{12} \\\\ -J_{21} & J_{11} \\end{bmatrix}$: leaving out $1/\\det J$ scales the whole step.',
  },
  { id: 'kin-redundant-reach', title: 'Redundancy does not add reach', detail: 'A redundant arm has infinitely many solutions **inside** its workspace and none outside it (2022 Q4, Q18).' },
  { id: 'kin-nr-converges', title: '“Newton–Raphson always converges”', detail: 'Only from a good enough initial guess; it can diverge, oscillate or stall near singularities (2022 Q12).' },
]);

// ------------------------------------------------------------------ helpers

const round2 = (x: number) => Math.round(x * 100) / 100;
/** 4 significant figures, as TeX and as text (tiny values shown as 0). */
const n4 = (x: number) => tex(Math.abs(x) < 5e-6 ? 0 : x, 4);
const t4 = (x: number) => fmt(Math.abs(x) < 5e-6 ? 0 : x, 4);
const bvec = (a: readonly number[]) => `\\begin{bmatrix} ${a.map(n4).join(' \\\\ ')} \\end{bmatrix}`;
const bmat = (A: readonly (readonly number[])[]) => `\\begin{bmatrix} ${A.map((r) => r.map(n4).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
const letter = (k: number) => String.fromCharCode(97 + k);
/** A number to be squared in TeX: negative values in brackets. */
const sq = (x: number) => (x < 0 ? `(${tex(x, 4)})^2` : `${tex(x, 4)}^2`);

type TrapIn = { value: number; message: string; trapId?: string };

/** Keep the traps that are clearly different from the answer (and from each other). */
function keepTraps(answer: number, list: TrapIn[], minGap = 0.012): TrapIn[] {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = t.value.toFixed(4);
    if (!Number.isFinite(t.value) || Math.abs(t.value - answer) < Math.max(minGap, 0.03 * Math.abs(answer)) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

type MatTrap = { value: number[][]; message: string; trapId?: string };
function keepMatTraps(answer: number[][], list: MatTrap[], minGap = 0.02): MatTrap[] {
  return list.filter((t) => t.value.every((r) => r.every(Number.isFinite)) && Math.max(...t.value.flatMap((r, i) => r.map((x, j) => Math.abs(x - answer[i][j])))) > minGap);
}

// ================================================================== kin-fk-or-ik

type Kind = 'fk' | 'ik' | 'none';

interface Scen {
  id: string;
  /** A few plain words naming the problem (hint tables, so also inside TeX text: no special characters). */
  short: string;
  kind: Kind;
  text: string;
  /** Plain words (also used inside TeX \text{}: no $, quotes or special characters). */
  given: string;
  unknown: string;
  why: string;
  mobile?: boolean;
  /** Inverse in direction but arguably a control problem: never the key of "which is IK?". */
  contested?: boolean;
}

const SCEN: Scen[] = [
  { id: 'fk-arm', short: 'arm pose from joint angles', kind: 'fk', text: 'Solving for a robot arm’s end-effector pose given its joint angles', given: 'joint angles', unknown: 'end-effector pose', why: 'Joint values in, pose out: the definition of forward kinematics (2024 Q12 (a); 2023 Q11 (c)).' },
  { id: 'fk-joint', short: 'pose of any joint', kind: 'fk', text: 'Solving for the pose of any joint of a robot arm given its joint angles', given: 'joint angles', unknown: 'pose of an intermediate joint', why: 'Still forward kinematics: FK gives the pose of every link frame, not only the end-effector. Stop the product of exponentials after that joint (2023 Q11 (b)).' },
  { id: 'fk-wheels', short: 'mobile robot, wheel velocities', kind: 'fk', mobile: true, text: 'Solving for a mobile robot’s final pose given its wheel velocities', given: 'wheel velocities', unknown: 'final pose', why: 'Known inputs, unknown pose: the forward direction for a mobile robot (the key of 2025 Q12; 2023 Q11 (d)).' },
  { id: 'fk-commands', short: 'ground robot, velocity commands', kind: 'fk', mobile: true, text: 'Working out where a ground robot ends up after it executes a sequence of velocity commands', given: 'velocity commands', unknown: 'final pose', why: 'The commands are known and the pose follows by integrating them: forward kinematics (review deck slide 19).' },
  { id: 'fk-encoders', short: 'wrist camera from encoders', kind: 'fk', text: 'Finding where an arm’s wrist camera is from its joint encoder readings', given: 'encoder readings (joint values)', unknown: 'camera pose', why: 'Encoder readings are joint values, so the camera pose follows directly from the product of exponentials.' },
  { id: 'fk-odometry', short: 'differential drive for 2 s', kind: 'fk', mobile: true, text: 'Predicting a differential-drive robot’s position and heading after it drives its wheels at measured speeds for 2 s', given: 'wheel speeds and time', unknown: 'position and heading', why: 'Integrating known wheel speeds through the motion model (dead reckoning) is forward kinematics.' },
  { id: 'fk-elbow', short: 'elbow of a 2-link arm', kind: 'fk', text: 'Finding where a 2-link arm’s elbow is for given values of $\\theta_1$ and $\\theta_2$', given: 'both joint angles', unknown: 'elbow position', why: 'Joint angles in, a link position out: forward kinematics (the elbow is at $L_1(\\cos\\theta_1, \\sin\\theta_1)$).' },
  { id: 'ik-arm', short: 'joint angles for a pose', kind: 'ik', text: 'Solving for a robot arm’s joint angles given a desired end-effector pose', given: 'desired end-effector pose', unknown: 'joint angles', why: 'Pose in, joint values out: the definition of inverse kinematics (the key of 2024 Q12; the odd one out in 2023 Q11).' },
  { id: 'ik-door', short: 'reaching a door handle', kind: 'ik', text: 'Finding the arm configuration that lets a robot reach a door handle', given: 'gripper pose at the handle', unknown: 'joint configuration', why: 'The gripper pose is specified and the joints are unknown: inverse kinematics (review deck slide 19).' },
  { id: 'ik-goal', short: 'wheel speeds to a goal pose', kind: 'ik', mobile: true, text: 'Choosing the wheel speeds that bring a mobile robot to a goal pose in 3 s', given: 'goal pose', unknown: 'wheel speeds', why: 'The pose you want is given and the inputs are found: the inverse direction for a mobile robot.' },
  { id: 'ik-torch', short: 'welding torch pose', kind: 'ik', text: 'Finding joint angles that put a welding torch at a given position and orientation', given: 'desired torch pose', unknown: 'joint angles', why: 'Desired pose in, joint values out: inverse kinematics.' },
  { id: 'ik-2link', short: '2-link tip at (x, y)', kind: 'ik', text: 'Finding $\\theta_1$ and $\\theta_2$ so that a 2-link arm’s tip reaches the point $(x, y)$', given: 'tip position', unknown: 'both joint angles', why: 'The tip position is given and the joint angles are unknown: inverse kinematics (two solutions, elbow up and elbow down).' },
  { id: 'ik-nr', short: 'iterating with the pseudoinverse', kind: 'ik', text: 'Iterating $\\theta \\leftarrow \\theta + J^{\\dagger}e$ until the gripper reaches a target pose', given: 'target pose', unknown: 'joint values', why: 'Newton–Raphson is a numerical method for inverse kinematics.' },
  { id: 'ik-steer', short: 'steering to track a path', kind: 'ik', mobile: true, contested: true, text: 'Solving for the steering commands a mobile robot needs to track a path', given: 'desired path', unknown: 'steering commands', why: 'The motion you want is given and the inputs are found: the inverse direction (a 2025 Q12 distractor), not forward kinematics.' },
  { id: 'none-forces', short: 'end-effector forces', kind: 'none', text: 'Solving for the forces and torques at the end-effector of a robot arm', given: 'joint torques or loads', unknown: 'end-effector forces and torques', why: 'Forces and torques belong to statics or dynamics, not kinematics (a 2025 Q12 distractor).' },
  { id: 'none-torques', short: 'torques along a trajectory', kind: 'none', text: 'Computing the joint torques that accelerate an arm along a planned trajectory', given: 'trajectory and accelerations', unknown: 'joint torques', why: 'Torques from motion is inverse **dynamics** (Newton–Euler), not inverse kinematics.' },
];

const KIND_TEXT: Record<Kind, string> = { fk: 'Forward kinematics', ik: 'Inverse kinematics', none: 'Neither: statics or dynamics, not kinematics' };
const KIND_WORD: Record<Kind, string> = { fk: 'forward', ik: 'inverse', none: 'neither' };

function kindWhy(s: Scen, k: Kind): string {
  const kw = `Known: ${s.given}; wanted: ${s.unknown}.`;
  if (k === s.kind) return `${kw} ${s.why}`;
  if (s.kind === 'none') return `${kw} Forces and torques are a statics or dynamics question, so it is neither kinematics problem.`;
  if (k === 'none') return `It is kinematics: only joint values (or wheel inputs) and poses are involved, no forces. ${kw} So it is ${KIND_WORD[s.kind]} kinematics.`;
  return `${kw} Inputs to pose is forward, pose to inputs is inverse, so this one is ${KIND_WORD[s.kind]}.`;
}

function classifyPart(s: Scen, id: string, label: string): ChoicePart {
  return {
    kind: 'choice',
    id,
    label,
    options: (['fk', 'ik', 'none'] as Kind[]).map((k) => ({ text: KIND_TEXT[k], correct: k === s.kind, why: kindWhy(s, k) })),
    marks: 1,
  };
}

const FKIK_CONCEPT =
  '**Forward kinematics**: the joint values (for a mobile robot, the wheel speeds or velocity commands) are known, and the pose they produce is computed: direct substitution, exactly one answer. **Inverse kinematics**: a desired pose (or motion) is given, and the joint values or inputs that achieve it are unknown: equations to solve, with no solution, a few or infinitely many. Forces and torques are statics or dynamics, not kinematics.';

function fkTable(rows: { tag: string; s: Scen }[]): string {
  return `$$\\begin{array}{c|l|l|l} & \\text{known} & \\text{wanted} & \\text{type} \\\\ \\hline ${rows
    .map((r) => `\\text{${r.tag}} & \\text{${r.s.given}} & \\text{${r.s.unknown}} & \\textbf{${KIND_WORD[r.s.kind]}}`)
    .join(' \\\\ ')} \\end{array}$$`;
}

const STEMS: { id: string; text: string; key: Kind; distract: Kind[]; not?: boolean }[] = [
  { id: 'is-fk', text: 'Which of the following describes a **forward** kinematics problem?', key: 'fk', distract: ['ik', 'ik', 'none'] },
  { id: 'is-ik', text: 'Which of the following describes an **inverse** kinematics problem?', key: 'ik', distract: ['fk', 'fk', 'none'] },
  { id: 'not-fk', text: 'Which of the following does **NOT** describe a forward kinematics problem?', key: 'ik', distract: ['fk', 'fk', 'fk'], not: true },
];

function genFkIk(rng: Rng, tier: Tier): SolveInstance {
  const pool = (k: Kind, allowContested: boolean) => SCEN.filter((s) => s.kind === k && (allowContested || !s.contested));
  if (tier === 1) {
    let picks: Scen[] = [];
    for (let tries = 0; tries < 200; tries++) {
      picks = [rng.pick(pool('fk', false)), rng.pick(pool('ik', false)), rng.pick(SCEN.filter((s) => !s.contested))];
      if (new Set(picks.map((p) => p.id)).size === 3 && picks.some((p) => p.mobile)) break;
    }
    picks = rng.shuffle(picks);
    const tags = picks.map((_, k) => `(${letter(k)})`);
    const parts: SolvePart[] = picks.map((s, k) => classifyPart(s, `c${k}`, `${tags[k]} ${s.text}`));
    return {
      prompt: 'Is each of these a **forward** kinematics problem, an **inverse** kinematics problem, or neither?',
      parts,
      hints: [
        FKIK_CONCEPT,
        'For each one, write down what is **known** and what is **wanted**. Known joint values (or wheel inputs), wanted pose: forward. Known (desired) pose or motion, wanted joint values (or inputs): inverse. Wanted forces or torques: neither.',
        picks.map((s, k) => `${tags[k]} known: ${s.given}; wanted: ${s.unknown}.`).join('\n\n'),
        `${fkTable(picks.map((s, k) => ({ tag: tags[k], s })))}\n\n**${picks.map((s, k) => `${tags[k]} ${KIND_WORD[s.kind]}`).join(', ')}.**`,
      ] as [string, string, string, string],
    };
  }
  // tier 2: the paper's multiple choice, then one more to classify
  const stem = rng.pick(STEMS);
  const noContested = stem.id === 'is-ik';
  let opts: Scen[] = [];
  for (let tries = 0; tries < 200; tries++) {
    const key = rng.pick(pool(stem.key, !noContested));
    const ds = stem.distract.map((k) => rng.pick(pool(k, !noContested)));
    opts = [key, ...ds];
    if (new Set(opts.map((o) => o.id)).size === 4) break;
  }
  const key = opts[0];
  const shown = rng.shuffle(opts);
  const extra = rng.pick(SCEN.filter((s) => !s.contested && !opts.some((o) => o.id === s.id) && (s.mobile || s.id === 'ik-door')));
  const mcq: ChoicePart = {
    kind: 'choice',
    id: 'mcq',
    label: `(a) ${stem.text}`,
    options: shown.map((s) => ({
      text: s.text,
      correct: s.id === key.id,
      why: stem.not
        ? s.id === key.id
          ? `${kindWhy(s, s.kind)} So it is **not** forward kinematics.`
          : `It **is** forward kinematics. ${kindWhy(s, s.kind)}`
        : kindWhy(s, s.kind),
    })),
    marks: 1,
  };
  const rows = shown.map((s) => ({ tag: s.short, s }));
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return {
    prompt: 'One multiple-choice question in the style of the papers (the same four kinds of statement rotate between key and distractor from year to year), then one more problem to classify. Read the instruction carefully.',
    parts: [mcq, classifyPart(extra, 'extra', `(b) ${extra.text}: forward, inverse or neither?`)],
    hints: [
      FKIK_CONCEPT,
      `Underline the instruction first (${stem.not ? 'does **NOT** describe' : 'describes'} a${stem.key === 'ik' && !stem.not ? 'n inverse' : ' forward'} kinematics problem). Then, for each option, write down what is known and what is wanted.`,
      [...shown.map((s) => `*${cap(s.short)}*: known ${s.given}; wanted ${s.unknown}.`), `(b) *${cap(extra.short)}*: known ${extra.given}; wanted ${extra.unknown}.`].join('\n\n'),
      `${fkTable([...rows, { tag: `(b) ${extra.short}`, s: extra }])}\n\n(a) **${key.text}** (${stem.not ? 'the only one that is not forward kinematics' : `the only ${KIND_WORD[stem.key]} one`}). (b) **${KIND_WORD[extra.kind]}${extra.kind === 'none' ? '' : ' kinematics'}**.`,
    ] as [string, string, string, string],
  };
}

// ================================================================== kin-ik-solutions

type ReachKind = 'two' | 'one' | 'out' | 'hole';
interface ReachCase {
  L1: number;
  L2: number;
  x: number;
  y: number;
  r: number;
  c2: number;
  kind: ReachKind;
}

const DIRS: [number, number][] = [
  [0.6, 0.8],
  [0.8, 0.6],
  [-0.6, 0.8],
  [0.8, -0.6],
  [0, 1],
  [-0.8, 0.6],
  [1, 0],
];

function reachCase(rng: Rng, tier: Tier): ReachCase {
  const L1 = rng.step(0.5, 1.0, 0.1);
  let L2 = rng.step(0.3, 0.8, 0.1);
  if (Math.abs(L2 - L1) < 1e-9) L2 = Math.round((L1 - 0.2) * 10) / 10;
  let kind: ReachKind = rng.pick(tier === 1 ? (['two', 'two', 'out', 'one', 'hole'] as const) : (['two', 'out', 'one', 'hole'] as const));
  if (kind === 'hole' && Math.abs(L1 - L2) < 0.3) kind = 'out';
  const lo = Math.abs(L1 - L2);
  const hi = L1 + L2;
  for (let tries = 0; tries < 200; tries++) {
    let x: number;
    let y: number;
    if (kind === 'one') {
      const d = rng.pick(DIRS);
      x = round2(hi * d[0]);
      y = round2(hi * d[1]);
    } else {
      const want = kind === 'two' ? rng.uniform(lo + 0.15, hi - 0.12) : kind === 'out' ? hi + rng.uniform(0.1, 0.4) : rng.uniform(0.06, lo - 0.1);
      const phi = rng.uniform(-0.4, 2.5);
      x = round2(want * Math.cos(phi));
      y = round2(want * Math.sin(phi));
    }
    const r = Math.hypot(x, y);
    const ok = kind === 'one' ? Math.abs(r - hi) < 1e-9 : kind === 'two' ? r > lo + 0.05 && r < hi - 0.05 : kind === 'out' ? r > hi + 0.05 : r < lo - 0.05 && r > 0.03;
    if (ok) return { L1, L2, x, y, r, c2: (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2), kind };
  }
  const x = round2(0.6 * hi);
  const y = round2(0.8 * hi);
  return { L1, L2, x, y, r: Math.hypot(x, y), c2: 1, kind: 'one' };
}

type Count = 'none' | 'fin' | 'inf';
const COUNT_TEXT: Record<Count, string> = { none: 'None', fin: 'Finitely many', inf: 'Infinitely many' };
const COUNT_POOL: { id: string; text: string; ans: Count; why: string }[] = [
  { id: '7dof-in', text: 'A 7-DOF arm must put its gripper at a reachable position **and** orientation (six numbers).', ans: 'inf', why: 'Seven joints for six task coordinates leaves one spare degree of freedom, so the solutions form a continuum: the elbow can swing while the gripper stays put. A redundant arm has infinitely many IK solutions inside its workspace (2022 Q18).' },
  { id: '7dof-out', text: 'A 7-DOF arm is asked to reach a point 0.3 m beyond its full stretch.', ans: 'none', why: 'Redundancy adds ways of reaching a pose, not reach: outside the workspace there is no solution at all (2022 Q4).' },
  { id: '6dof-wrist', text: 'A 6-DOF industrial arm with a spherical wrist must reach a generic pose inside its workspace.', ans: 'fin', why: 'Six joints for six task coordinates: the solutions are isolated, up to 8 for this layout (shoulder left or right × elbow up or down × wrist flipped or not).' },
  { id: '3link-pos', text: 'A planar 3-link arm must put its tip at a reachable point; the tool angle does not matter.', ans: 'inf', why: 'Three joints for two task coordinates $(x, y)$: one spare, so a whole curve of solutions (self-motion).' },
  { id: '3link-pose', text: 'A planar 3-link arm must put its tip at a reachable point with the tool at a given angle $\\phi$.', ans: 'fin', why: 'Three joints for three task coordinates $(x, y, \\phi)$: not redundant. $\\phi$ fixes where the wrist must be, which leaves a 2-link problem with at most two solutions.' },
  { id: 'parallel-orient', text: 'An arm whose revolute axes are all parallel to $y$ (like 2023 Q12 (d)) is asked to tilt its gripper about $x$.', ans: 'none', why: 'Every rotation it can make is about $y$, so an orientation tilted about $x$ is unreachable: no solution, closed form or numerical.' },
];

function countPart(item: (typeof COUNT_POOL)[number], id: string, label: string): ChoicePart {
  const wrong: Record<Count, string> = {
    none: 'The pose is reachable, so there is at least one solution.',
    fin: item.ans === 'inf' ? 'With more joints than task coordinates the solutions are not isolated points: they form a continuum.' : 'The pose cannot be reached at all, so there is not even one solution.',
    inf: item.ans === 'fin' ? 'Joints and task coordinates are equal in number, so the solutions are isolated: finitely many.' : 'No solution exists, so there cannot be infinitely many.',
  };
  return {
    kind: 'choice',
    id,
    label,
    options: (['none', 'fin', 'inf'] as Count[]).map((c) => ({ text: COUNT_TEXT[c], correct: c === item.ans, why: c === item.ans ? item.why : `${wrong[c]} ${item.why}` })),
    marks: 1,
  };
}

const TF_POOL: { text: string; truth: boolean; why: string }[] = [
  { text: 'There is always an inverse kinematics solution for a redundant (over-actuated) serial arm, because it is redundant.', truth: false, why: 'False (2022 Q4). Redundancy gives infinitely many solutions **inside** the workspace, but a pose out of reach, or an orientation the wrist cannot make, has none.' },
  { text: 'A redundant (over-actuated) serial arm has infinitely many IK solutions for a pose inside its workspace.', truth: true, why: 'True (2022 Q18): the spare joints give a continuum of configurations with the same end-effector pose (self-motion).' },
  { text: 'An advantage of Newton–Raphson IK is that it always converges to a solution.', truth: false, why: 'False (2022 Q12). It converges only from an initial guess close enough to a solution; otherwise it can diverge, oscillate or stall near a singularity.' },
  { text: 'A singularity is a configuration where the Jacobian matrix loses rank.', truth: true, why: 'True (2022 Q21): some end-effector velocity can then not be produced by any joint velocities.' },
  { text: 'Kinematic singularities can be removed by choosing suitable base and end-effector frames.', truth: false, why: 'False (2022 Q29). Changing frames multiplies $J$ by an invertible adjoint, which cannot change its rank: singularities belong to the configuration of the mechanism.' },
  { text: 'Started from different initial guesses, Newton–Raphson can converge to different IK solutions.', truth: true, why: 'True: each guess converges to the solution whose basin of attraction it starts in (elbow up or elbow down).' },
];

function genSolutions(rng: Rng, tier: Tier): SolveInstance {
  const rc = reachCase(rng, tier);
  const { L1, L2, x, y, r, c2, kind } = rc;
  const lo = Math.abs(L1 - L2);
  const hi = L1 + L2;
  const item = rng.pick(COUNT_POOL);
  const tf = rng.pick(TF_POOL);
  const t2 = kind === 'two' ? Math.acos(c2) : 0;
  const letters = tier === 1 ? ['(a)', '(b)', '(c)'] : ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)', '(g)'];
  let li = 0;
  const nx = () => letters[li++];

  const parts: SolvePart[] = [];
  parts.push({
    kind: 'numeric',
    id: 'r',
    label: `${nx()} Distance from the base to the target, $r = \\sqrt{x^2 + y^2}$`,
    answer: r,
    unit: 'm',
    tol: 0.01,
    traps: keepTraps(r, [{ value: x * x + y * y, message: 'That is $r^2$: take the square root.', trapId: 'sqrt' }]),
    marks: 1,
  });
  if (tier >= 2)
    parts.push({
      kind: 'numeric',
      id: 'c2',
      label: `${nx()} Law of cosines: $\\cos\\theta_2 = \\dfrac{r^2 - L_1^2 - L_2^2}{2L_1L_2}$`,
      answer: c2,
      unit: '',
      tol: 0.01,
      absTol: 0.005,
      traps: keepTraps(c2, [{ value: (r - L1 * L1 - L2 * L2) / (2 * L1 * L2), message: 'Use $r^2 = x^2 + y^2$ in the numerator, not $r$.' }], 0.02),
      marks: 1,
    });
  const countWhy: Record<ReachKind, string> = {
    two: `$|L_1 - L_2|$ = ${fmt(lo, 3)} m < $r$ = ${fmt(r, 4)} m < $L_1 + L_2$ = ${fmt(hi, 3)} m, so $\\cos\\theta_2$ = ${fmt(c2, 4)} lies strictly between −1 and 1: $\\theta_2 = \\pm\\arccos(\\cdot)$ gives elbow up and elbow down.`,
    one: `$r = L_1 + L_2$ = ${fmt(hi, 3)} m, so $\\cos\\theta_2 = 1$: only the fully stretched arm ($\\theta_2 = 0$) reaches it. The elbow-up and elbow-down solutions merge there, at a singular configuration.`,
    out: `$r$ = ${fmt(r, 4)} m > $L_1 + L_2$ = ${fmt(hi, 3)} m: beyond full stretch ($\\cos\\theta_2$ = ${fmt(c2, 4)} > 1), so no joint angles reach it.`,
    hole: `$r$ = ${fmt(r, 4)} m < $|L_1 - L_2|$ = ${fmt(lo, 3)} m: inside the hole the arm cannot fold tightly enough ($\\cos\\theta_2$ = ${fmt(c2, 4)} < −1), so no joint angles reach it.`,
  };
  const ansOpt: Record<ReachKind, number> = { out: 0, hole: 0, one: 1, two: 2 };
  const notWhy = [
    `The target is within reach: $|L_1 - L_2| \\le r \\le L_1 + L_2$.`,
    kind === 'two' ? 'The target is strictly inside the workspace, so both elbow configurations reach it.' : 'Exactly one only happens on the edge of the workspace, with the arm fully stretched (or folded).',
    kind === 'one' ? 'On the edge of the workspace the two elbow solutions coincide: there is only one.' : 'Two solutions need the target strictly inside the workspace.',
    'Two joints, two tip coordinates: not redundant, so the solutions are isolated points, never a continuum.',
  ];
  parts.push({
    kind: 'choice',
    id: 'count',
    label: `${nx()} How many joint solutions $(\\theta_1, \\theta_2)$ put the tip on the target?`,
    options: ['None: no joint angles put the tip there', 'Exactly one', 'Two (elbow up and elbow down)', 'Infinitely many'].map((text, k) => ({
      text,
      correct: k === ansOpt[kind],
      why: k === ansOpt[kind] ? countWhy[kind] : `${notWhy[k]} ${countWhy[kind]}`,
    })),
    marks: 1,
  });
  if (tier >= 2 && kind === 'two')
    parts.push({
      kind: 'numeric',
      id: 't2',
      label: `${nx()} The elbow angle of the solution with $\\theta_2 > 0$, $\\theta_2 = \\arccos(\\cos\\theta_2)$`,
      answer: t2,
      unit: 'rad',
      tol: 0.01,
      absTol: 0.005,
      marks: 1,
    });
  parts.push(countPart(item, 'pool', `${nx()} ${item.text} How many IK solutions?`));
  if (tier >= 2) {
    parts.push({
      kind: 'choice',
      id: 'tf',
      label: `${nx()} True or false: ${tf.text}`,
      options: [
        { text: 'True', correct: tf.truth, why: tf.why },
        { text: 'False', correct: !tf.truth, why: tf.why },
      ],
      marks: 1,
    });
    const LL = L1 * L2;
    parts.push({
      kind: 'choice',
      id: 'sing',
      label: `${nx()} For which configurations is this arm singular ($\\det J = 0$)?`,
      options: [
        { text: '$\\theta_2 = 0$ or $\\theta_2 = \\pi$: fully stretched or folded back', correct: true, why: `$\\det J = L_1L_2\\sin\\theta_2 = ${tex(LL, 3)}\\sin\\theta_2$ m², zero exactly when $\\sin\\theta_2 = 0$. Stretched or folded, the tip cannot move along the arm: the Jacobian loses rank, and the elbow-up and elbow-down solutions merge (the edges of the workspace).` },
        { text: '$\\theta_1 = 0$ or $\\theta_1 = \\pi$: link 1 along the $x$-axis', correct: false, why: '$\\theta_1$ only turns the whole arm about its base; $\\det J = L_1L_2\\sin\\theta_2$ does not depend on it.' },
        { text: 'Whenever the tip lies on the $x$-axis', correct: false, why: 'Where the tip sits relative to the axes depends on $\\theta_1$; singularity depends only on the shape of the arm, $\\theta_2$.' },
        { text: 'Never: a planar 2-link arm has no singular configurations', correct: false, why: 'It has two: $\\theta_2 = 0$ (stretched, on the outer edge of the workspace) and $\\theta_2 = \\pi$ (folded, on the inner edge).' },
      ],
      marks: 1,
    });
  }

  const prompt = `A planar 2-link arm has $L_1$ = ${L1} m and $L_2$ = ${L2} m (base at the origin, $\\theta_1$ from the $x$-axis, $\\theta_2$ relative to link 1). Its tip must reach the target $(x, y)$ = (${x}, ${y}) m.${tier >= 2 ? ' Then two facts about IK solutions and singularities in general.' : ' Then one more arm.'}`;
  const table = `$$\\begin{array}{l|l} r = \\sqrt{x^2 + y^2} & \\sqrt{${sq(x)} + ${sq(y)}} = ${n4(r)}\\text{ m} \\\\ \\text{reach} & |L_1 - L_2| = ${tex(lo, 3)} \\text{ m} \\le r \\le L_1 + L_2 = ${tex(hi, 3)}\\text{ m?} \\\\ \\cos\\theta_2 & \\dfrac{${n4(r * r)} - ${tex(L1 * L1, 3)} - ${tex(L2 * L2, 3)}}{2(${L1})(${L2})} = ${n4(c2)}${kind === 'two' ? ` \\\\ \\theta_2 & \\pm\\arccos(${n4(c2)}) = \\pm ${n4(t2)}\\text{ rad}` : ''} \\end{array}$$`;
  const countSentence = [
    'So there is **no solution**: no joint angles put the tip on the target.',
    'So there is **exactly one** solution, the fully stretched arm (a singular configuration).',
    'So there are **two** solutions, elbow up and elbow down',
  ][ansOpt[kind]];
  return {
    prompt,
    givens: [
      { sym: 'L_1', value: `${L1} m`, label: 'link 1' },
      { sym: 'L_2', value: `${L2} m`, label: 'link 2' },
      { sym: '(x, y)', value: `(${x}, ${y}) m`, label: 'target' },
    ],
    parts,
    hints: [
      'Count before you solve. Outside the workspace there is **no** solution; a non-redundant arm (as many joints as task coordinates) has **finitely many** (a 2-link arm: elbow up and elbow down); a redundant arm (more joints than task coordinates) has **infinitely many** inside its workspace. On the edge of the workspace the two elbow solutions merge into one: a singular configuration.',
      'A 2-link arm reaches a point at distance $r = \\sqrt{x^2 + y^2}$ from its base if and only if $|L_1 - L_2| \\le r \\le L_1 + L_2$. The law of cosines gives $$\\cos\\theta_2 = \\frac{r^2 - L_1^2 - L_2^2}{2L_1L_2}$$ $|\\cos\\theta_2| > 1$: no solution; $\\cos\\theta_2 = \\pm 1$: one; otherwise two, $\\theta_2 = \\pm\\arccos(\\cdot)$. Singular where $\\det J = L_1L_2\\sin\\theta_2 = 0$.',
      `$r = \\sqrt{${sq(x)} + ${sq(y)}}$ = ${t4(r)} m; the reach is from $|L_1 - L_2|$ = ${fmt(lo, 3)} m to $L_1 + L_2$ = ${fmt(hi, 3)} m.${tier >= 2 ? ` $\\cos\\theta_2 = (${n4(r * r)} - ${tex(L1 * L1, 3)} - ${tex(L2 * L2, 3)}) / (2 \\cdot ${L1} \\cdot ${L2})$ = ${t4(c2)}.` : ''} For the other arm: count its joints against the task coordinates, and check the pose is reachable at all.`,
      [
        table,
        `${countSentence}${kind === 'two' ? (tier >= 2 ? `, with $\\theta_2$ = **±${t4(t2)} rad**.` : '.') : ''} $r$ = **${t4(r)} m**${tier >= 2 ? `, $\\cos\\theta_2$ = **${t4(c2)}**` : ''}.`,
        `The other arm: **${COUNT_TEXT[item.ans].toLowerCase()}**. ${item.why}`,
        ...(tier >= 2 ? [`True or false: ${tf.why.replace(/^(True|False)/, '**$1**')}`,'Singular at **$\\theta_2 = 0$ or $\\pi$** (stretched or folded), where $\\det J = L_1L_2\\sin\\theta_2 = 0$.'] : []),
      ].join('\n\n'),
    ] as [string, string, string, string],
  };
}

// ================================================================== kin-pieper

const YES_IDS = LAYOUTS.filter((l) => l.closedForm).map((l) => l.id);
const NO_IDS = LAYOUTS.filter((l) => !l.closedForm).map((l) => l.id);

/** What exactly rules a "no" layout out (one sentence each, true of that layout only). */
const DEFECT: Record<string, string> = {
  q12a: 'Joint 6 hangs from the far end of joint 5, so axes 4–5 and 5–6 meet at two different points: no spherical wrist',
  q12b: 'Axes 3 and 4 are parallel but axis 5 is not, and axis 4 misses the point where axes 5 and 6 meet',
  q12d: 'Every revolute axis is parallel to $y$, so the gripper can only turn about $y$ and cannot reach arbitrary orientations',
  skew: 'The forearm doglegs, so axis 4 passes above the point where axes 5 and 6 meet: no spherical wrist',
};

/** The qualifying triple of a "yes" layout and how it decouples. */
const REASON: Record<string, string> = {
  meetWrist: 'Axes 4, 5 and 6 meet at one point, so the wrist centre depends on joints 1–3 only',
  parallel: 'Axes 2, 3 and 4 are parallel, so joints 2–4 form a planar 3R arm',
  meetShoulder: 'Axes 1, 2 and 3 meet at one point: read from the tool back, that is a spherical wrist',
};
const reasonKey = (L: PLayout) => (L.reason === 'parallel' ? 'parallel' : L.triple?.[0] === 0 ? 'meetShoulder' : 'meetWrist');

/** A statement about a layout, with a test of whether it is true for that layout. */
interface Claim {
  text: string;
  holds: (L: PLayout) => boolean;
  why: (L: PLayout) => string;
}

/** "4–5 meet, 5–6 meet, 4–6 are skew" for the triple starting at `start`. */
function relText(L: PLayout, start: number): string {
  return tripleCheck(L.joints, start)
    .pairs.map((p) => `${p.a + 1}–${p.b + 1} ${p.rel === 'parallel' ? (sameLine(L.joints, p.a, p.b) ? 'lie on one line' : 'are parallel') : p.rel === 'meet' ? 'meet' : 'are skew'}`)
    .join(', ');
}

function pairsText(L: PLayout, start: number): string {
  const t = tripleCheck(L.joints, start);
  const name = `Axes ${start + 1}, ${start + 2} and ${start + 3}`;
  if (t.kind === 'prismatic') return `${name} include a prismatic joint, so they cannot qualify.`;
  return `${name}: ${relText(L, start)}.${t.kind === 'meet' ? ' They share one point.' : t.kind === 'parallel' ? ' All three are parallel.' : ' No common point, and not all parallel.'}`;
}

const CLAIMS: Claim[] = [
  { text: 'Yes: axes 4, 5 and 6 meet at one point (a spherical wrist)', holds: (L) => tripleCheck(L.joints, 3).kind === 'meet', why: (L) => pairsText(L, 3) },
  { text: 'Yes: axes 2, 3 and 4 are parallel', holds: (L) => tripleCheck(L.joints, 1).kind === 'parallel', why: (L) => pairsText(L, 1) },
  { text: 'Yes: axes 1, 2 and 3 meet at one point', holds: (L) => tripleCheck(L.joints, 0).kind === 'meet', why: (L) => pairsText(L, 0) },
  {
    text: 'No: no three consecutive revolute axes meet at one point or are parallel',
    holds: (L) => !pieperCheck(L.joints).triples.some((t) => t.kind === 'meet' || t.kind === 'parallel'),
    why: (L) => (L.closedForm ? `${L.short}: that triple qualifies.` : L.why),
  },
  { text: 'No: a prismatic joint anywhere in the chain rules out a closed form', holds: () => false, why: () => 'Slides are fine: the Stanford arm (R–R–P, then a spherical wrist) has a closed form. The criterion is about three consecutive **revolute** axes.' },
  { text: 'Yes: every 6-DOF arm has a closed-form IK solution', holds: () => false, why: () => 'Only arms that satisfy Pieper’s criterion (or have other special geometry). A general 6R arm needs numerical IK.' },
  { text: 'No: a closed form needs at least seven joints', holds: () => false, why: () => 'Redundancy has nothing to do with it: six joints with a spherical wrist (or three parallel axes) is the classic closed-form case.' },
];

const DECOUPLE_STEPS = [
  'Find the wrist centre: step back from the desired tool position along the approach axis, $p_w = p_d - d\\,\\hat z_d$',
  'Solve joints 1–3 so that the arm puts the wrist centre at $p_w$ (planar geometry: law of cosines, atan2)',
  'Work out the rotation the wrist must still supply, $R_{\\text{wrist}} = R_{\\text{arm}}(\\theta_1, \\theta_2, \\theta_3)^T R_d$',
  'Solve joints 4–6 from $R_{\\text{wrist}}$, like a set of Euler angles',
];

function layoutFact(L: PLayout): string {
  const types = L.joints.map((j) => j.type).join(' ');
  if (L.closedForm) return `${types}: ${L.short.toLowerCase()}`;
  if (L.reason === 'orientation') return `${types}: every revolute axis parallel to y`;
  const s0 = L.triple![0];
  return `${types}: axes ${s0 + 1}, ${s0 + 2} and ${s0 + 3}: ${relText(L, s0)}, so no common point`;
}

function texSafe(s: string): string {
  return s.replace(/–/g, '-').replace(/[$’]/g, '');
}

function followUp(L: PLayout): SolvePart {
  if (L.closedForm && reasonKey(L) === 'meetWrist')
    return { kind: 'order', id: 'steps', label: '(b) Put the steps of its closed-form (decoupled) solution in order', steps: DECOUPLE_STEPS, marks: 2 };
  if (L.closedForm && reasonKey(L) === 'parallel')
    return {
      kind: 'choice',
      id: 'how',
      label: '(b) How do the three parallel axes make a closed form possible?',
      options: [
        { text: 'Joints 2–4 move their links in one plane: a planar 3R arm, solved with the law of cosines', correct: true, why: 'Parallel revolute axes keep the links they move in one plane, so the position follows from a triangle and the in-plane angle is $\\theta_2 + \\theta_3 + \\theta_4$.' },
        { text: 'Parallel axes are a singularity, so this arm has no IK solutions', correct: false, why: 'Parallel axes are a property of the layout, not a lost Jacobian rank: the generic rank is still 6, and reachable poses have solutions.' },
        { text: 'They do not: only axes that meet at a point give a closed form', correct: false, why: 'Pieper’s criterion has two cases, axes that meet at a point or three consecutive parallel axes (they meet “at infinity”).' },
      ],
      marks: 1,
    };
  if (L.closedForm)
    return {
      kind: 'choice',
      id: 'how',
      label: '(b) How does a meeting triple at the shoulder help?',
      options: [
        { text: 'Read the chain from the tool back: the three meeting axes act as a wrist, so position and orientation decouple', correct: true, why: 'Pieper asks for **any** three consecutive axes. The inverse chain has the shoulder at its end, where it behaves exactly like a spherical wrist.' },
        { text: 'It does not: only the last three axes can form a spherical wrist', correct: false, why: 'Any three consecutive revolute axes count; inverting the chain turns the shoulder into a wrist.' },
        { text: 'It makes the arm redundant, so any solution will do', correct: false, why: 'The arm still has six joints for six task coordinates: finitely many solutions.' },
      ],
      marks: 1,
    };
  if (L.reason === 'orientation')
    return {
      kind: 'choice',
      id: 'how',
      label: '(b) What does that mean for its inverse kinematics?',
      options: [
        { text: 'Most target poses have no solution at all: the gripper can only turn about $y$', correct: true, why: 'Slides change position, never orientation, and every rotation is about $y$. A pose tilted about $x$ or $z$ is out of reach, whatever method you use.' },
        { text: 'Newton–Raphson always finds a solution, just more slowly', correct: false, why: 'No method can find a solution that does not exist; Newton–Raphson would stall with a residual orientation error.' },
        { text: 'Every pose has infinitely many solutions because of the three slides', correct: false, why: 'Six joints but only four independent motions (the Jacobian has generic rank 4): most poses are unreachable, not over-solved.' },
      ],
      marks: 1,
    };
  return {
    kind: 'choice',
    id: 'how',
    label: '(b) So how would you solve its inverse kinematics?',
    options: [
      { text: 'Numerically: Newton–Raphson from a good initial guess, such as the current pose', correct: true, why: 'With no decoupling there is no general closed form; numerical IK still finds the solution near the guess for any reachable pose.' },
      { text: 'It has no IK solutions at all', correct: false, why: 'No closed form is not the same as no solution: reachable poses still have solutions, found numerically.' },
      { text: 'With the spherical-wrist recipe: step back from the tool to the wrist centre', correct: false, why: 'That recipe needs three axes meeting at a wrist centre, and this arm has none.' },
    ],
    marks: 1,
  };
}

function genPieper(rng: Rng, tier: Tier): SolveInstance {
  const concept =
    'Pieper’s criterion: a 6-DOF arm has a closed-form (analytic) IK solution if three **consecutive** revolute axes intersect at one point (a spherical wrist) or are parallel. Then the problem decouples: with a spherical wrist, joints 4–6 cannot move the wrist centre, so joints 1–3 solve for its position and joints 4–6 for the orientation.';
  const setup =
    'Number the joints from the base and mark each R or P (a cylinder turns about its long axis; a box with an arrow slides). Extend every revolute axis. Check each consecutive revolute triple (1–2–3, 2–3–4, 3–4–5, 4–5–6): do all three axes pass through one point, or are all three parallel? Watch for offsets between wrist cylinders.';
  if (tier === 1) {
    const L = layoutById(rng.pick(LAYOUTS).id);
    const correctText = `${L.closedForm ? 'Yes' : 'No'}: ${L.short.charAt(0).toLowerCase()}${L.short.slice(1)}`;
    const wrongs = rng.shuffle(CLAIMS.filter((c) => !c.holds(L) && c.text !== correctText && (!c.text.includes('prismatic') || L.joints.some((j) => j.type === 'P')))).slice(0, 3);
    const options = [{ text: correctText, correct: true, why: L.why }, ...wrongs.map((c) => ({ text: c.text, correct: false, why: c.why(L) }))];
    const fact = layoutFact(L);
    const fu = followUp(L);
    return {
      prompt: 'The figure shows a 6-DOF arm in the style of the 2023 paper (joints numbered from the base, axes extended as dash-dot lines). Does it have a closed-form inverse kinematics solution?',
      figure: pieperFigure([L.id], { axes: true }),
      parts: [{ kind: 'choice', id: 'cf', label: '(a) Closed-form IK? Pick the statement that is true for this arm.', options, marks: 1 } as ChoicePart, fu],
      hints: [
        concept,
        setup,
        `This arm, joint by joint: ${L.joints.map((j, i) => `${i + 1} ${j.type === 'R' ? 'revolute' : 'prismatic'}`).join(', ')}. ${L.triple ? pairsText(L, L.triple[0]) : ''}`,
        `$$\\begin{array}{c|l} \\text{triple} & \\text{relation} \\\\ \\hline ${pieperCheck(L.joints)
          .triples.map((t) => `${t.start + 1}\\text{-}${t.start + 2}\\text{-}${t.start + 3} & \\text{${t.kind === 'meet' ? 'meet at one point' : t.kind === 'parallel' ? 'all parallel' : t.kind === 'prismatic' ? 'includes a slide' : 'no'}}`)
          .join(' \\\\ ')} \\end{array}$$\n\n(a) **${correctText}.** ${L.why}\n\n(b) ${fu.kind === 'order' ? `**${DECOUPLE_STEPS.map((s, k) => `${k + 1}) ${s}`).join('; ')}.**` : `**${(fu as ChoicePart).options.find((o) => o.correct)!.text}.**`}`,
      ] as [string, string, string, string],
    };
  }
  // tier 2: four arms, one with a closed form (2023 Q12 style)
  const ids: string[] = rng.chance(0.3) ? [...EXAM_2023_Q12] : rng.shuffle([rng.pick(YES_IDS), ...rng.shuffle(NO_IDS).slice(0, 3)]);
  const Ls = ids.map(layoutById);
  const keyIdx = Ls.findIndex((l) => l.closedForm);
  const K = Ls[keyIdx];
  const tag = (k: number) => `(${letter(k)})`;
  const noIdxs = Ls.map((l, k) => (l.closedForm ? -1 : k)).filter((k) => k >= 0);
  const askIdx = rng.pick(noIdxs);
  const A = Ls[askIdx];
  const reasonTrue = REASON[reasonKey(K)];
  const reasonOpts = rng.shuffle(
    [
      { text: reasonTrue, correct: true, why: K.why },
      ...Object.entries(REASON)
        .filter(([k]) => k !== reasonKey(K))
        .map(([k, text]) => ({
          text,
          correct: false,
          why: k === 'parallel' ? pairsText(K, 1) : k === 'meetShoulder' ? pairsText(K, 0) : pairsText(K, 3),
        })),
      { text: 'It has six joints, and every 6-DOF arm has a closed form', correct: false, why: 'Most of the other arms here have six joints too and no closed form; the criterion is about the geometry of three consecutive axes.' },
    ].slice(0, 4)
  );
  const defectOpts = [
    { text: DEFECT[A.id], correct: true, why: A.why },
    ...rng
      .shuffle(NO_IDS.filter((id) => id !== A.id))
      .slice(0, 2)
      .map((id) => ({ text: DEFECT[id], correct: false, why: `That describes a different arm. Here: ${DEFECT[A.id].charAt(0).toLowerCase()}${DEFECT[A.id].slice(1)}.` })),
    { text: 'It has a prismatic joint', correct: false, why: A.joints.some((j) => j.type === 'P') ? 'Slides do not rule out a closed form (the Stanford arm has one). The trouble is the revolute axes.' : 'It has no prismatic joint at all; the trouble is the revolute axes.' },
  ];
  const rows = Ls.map((L, k) => `\\text{${tag(k)}} & \\text{${L.joints.map((j) => j.type).join(' ')}} & \\text{${texSafe(L.closedForm ? L.short : L.reason === 'orientation' ? 'every revolute axis parallel to y' : 'no qualifying triple')}} & ${L.closedForm ? '\\textbf{yes}' : '\\text{no}'}`);
  return {
    prompt: 'Which of the following 6DOF robot arm configurations has a closed-form inverse kinematics solution? (Joints are numbered from the base; cylinders are revolute joints turning about their long axis, boxes with an arrow are prismatic.)',
    figure: pieperFigure(ids, { axes: false }),
    parts: [
      {
        kind: 'choice',
        id: 'which',
        label: '(a) Which arm has a closed-form IK solution?',
        options: Ls.map((L, k) => ({ text: `Arm ${tag(k)}`, correct: k === keyIdx, why: L.closedForm ? L.why : `${DEFECT[L.id]}.` })),
        marks: 1,
      },
      { kind: 'choice', id: 'why', label: `(b) Why does arm ${tag(keyIdx)} have one?`, options: reasonOpts, marks: 1 },
      { kind: 'choice', id: 'defect', label: `(c) What rules out a closed form for arm ${tag(askIdx)}?`, options: defectOpts, marks: 1 },
    ],
    hints: [
      concept,
      setup,
      Ls.map((L, k) => `${tag(k)} ${layoutFact(L)}.`).join('\n\n'),
      `$$\\begin{array}{c|l|l|c} \\text{arm} & \\text{joints} & \\text{consecutive axes} & \\text{closed form?} \\\\ \\hline ${rows.join(' \\\\ ')} \\end{array}$$\n\n(a) **Arm ${tag(keyIdx)}.** (b) **${reasonTrue}.** ${K.why}\n\n(c) **${DEFECT[A.id]}.**`,
    ] as [string, string, string, string],
  };
}

// ================================================================== kin-nr-step

export type NrVariant = 'plain' | 'degrees' | 'check' | 'singular';

export interface NrStepData {
  L: [number, number];
  th0: [number, number];
  xd: [number, number];
  tip: [number, number];
  e: [number, number];
  err0: number;
  J: number[][];
  det: number;
  Jinv: number[][];
  dth: [number, number];
  th1: [number, number];
  tip1: [number, number];
  err1: number;
}

export interface NrInstance extends NrStepData {
  variant: NrVariant;
  /** The guess as printed in degrees (variant 'degrees'). */
  deg: [number, number] | null;
}

/** One Newton–Raphson step for a planar 2-link arm, with the exact 2 × 2 inverse (what the hand method does). */
export function nrStep(L: readonly [number, number], th0: readonly [number, number], xd: readonly [number, number]): NrStepData {
  const tip = planarFk(L, th0)[2];
  const e: [number, number] = [xd[0] - tip[0], xd[1] - tip[1]];
  const J = planarJacobian(L, th0);
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const Jinv = [
    [J[1][1] / det, -J[0][1] / det],
    [-J[1][0] / det, J[0][0] / det],
  ];
  const dth: [number, number] = [Jinv[0][0] * e[0] + Jinv[0][1] * e[1], Jinv[1][0] * e[0] + Jinv[1][1] * e[1]];
  const th1: [number, number] = [th0[0] + dth[0], th0[1] + dth[1]];
  const tip1 = planarFk(L, th1)[2];
  return {
    L: [L[0], L[1]],
    th0: [th0[0], th0[1]],
    xd: [xd[0], xd[1]],
    tip,
    e,
    err0: Math.hypot(e[0], e[1]),
    J,
    det,
    Jinv,
    dth,
    th1,
    tip1,
    err1: Math.hypot(xd[0] - tip1[0], xd[1] - tip1[1]),
  };
}

/** The random instance behind kin-nr-step (the generator calls this first, so tests can rebuild it from the seed). */
export function nrInstance(rng: Rng, tier: Tier): NrInstance {
  const variant: NrVariant = tier === 3 ? rng.pick(['degrees', 'check', 'singular'] as const) : 'plain';
  const sgn = () => rng.pick([1, -1] as const);
  for (let attempt = 0; attempt < 300; attempt++) {
    const L: [number, number] = [rng.step(0.5, 1.0, 0.1), rng.step(0.3, 0.8, 0.1)];
    let deg: [number, number] | null = null;
    let th0: [number, number];
    if (variant === 'degrees') {
      deg = [rng.step(10, 75, 5), sgn() * rng.step(30, 120, 5)];
      th0 = [(deg[0] * Math.PI) / 180, (deg[1] * Math.PI) / 180];
    } else if (variant === 'singular') th0 = [rng.step(0.2, 1.2, 0.05), sgn() * rng.step(0.06, 0.12, 0.02)];
    else th0 = [rng.step(0.2, 1.3, 0.05), sgn() * rng.step(0.6, 2.2, 0.05)];
    const ts = variant === 'singular' ? [th0[0] + sgn() * rng.uniform(0.1, 0.3), th0[1] + Math.sign(th0[1]) * rng.uniform(0.8, 1.2)] : [th0[0] + sgn() * rng.uniform(0.15, 0.4), th0[1] + sgn() * rng.uniform(0.15, 0.4)];
    if (Math.abs(Math.sin(ts[1])) < 0.25) continue;
    const t = planarFk(L, ts)[2];
    const xd: [number, number] = [round2(t[0]), round2(t[1])];
    const d = nrStep(L, th0, xd);
    if (d.err0 < 0.08 || Math.abs(d.e[0]) < 0.02 || Math.abs(d.e[1]) < 0.02) continue;
    if (variant === 'singular' ? Math.hypot(...d.dth) < 3 : d.err1 > 0.5 * d.err0) continue;
    return { variant, deg, ...d };
  }
  const L: [number, number] = [0.8, 0.6];
  const th0: [number, number] = [0.45, 1.2];
  const t = planarFk(L, [0.7, 0.9])[2];
  return { variant: 'plain', deg: null, ...nrStep(L, th0, [round2(t[0]), round2(t[1])]) };
}

const NUM = { tol: 0.01, absTol: 0.005 };

function genNr(rng: Rng, tier: Tier): SolveInstance {
  const d = nrInstance(rng, tier);
  const { L, th0, xd, tip, e, J, det, Jinv, dth, th1, deg, variant } = d;
  const [L1, L2] = L;
  const c1 = Math.cos(th0[0]);
  const s1 = Math.sin(th0[0]);
  const a12 = th0[0] + th0[1];
  const c12 = Math.cos(a12);
  const s12 = Math.sin(a12);
  const full = tier >= 2 && variant !== 'singular';
  const thTxt = deg ? [`${deg[0]}°`, `${deg[1]}°`] : [th0[0].toFixed(2), th0[1].toFixed(2)];
  const guessTxt = deg ? `$\\theta^{(0)} = (${deg[0]}^\\circ, ${deg[1]}^\\circ)$` : `$\\theta^{(0)}$ = (${thTxt[0]}, ${thTxt[1]}) rad`;

  // ------------------------------------------------ traps
  // degrees typed into a radian-mode calculator, or radians into a degree-mode one
  const degMode = (f: (a: number) => number) => {
    const a = deg ? deg[0] : (th0[0] * Math.PI) / 180;
    const b = deg ? deg[0] + deg[1] : (a12 * Math.PI) / 180;
    return L1 * f(a) + L2 * f(b);
  };
  const radMsg = deg ? 'Your calculator treated the degrees as radians. Convert $\\theta^{(0)}$ to radians first (or use degree mode for the trig only).' : 'Calculator in degree mode? $\\theta$ is in radians here.';
  const relMsg = '$\\theta_2$ is measured from link 1, so link 2 points at $\\theta_1 + \\theta_2$ from the $x$-axis.';
  const tipTraps = (k: 0 | 1): TrapIn[] => [
    { value: k === 0 ? L1 * c1 + L2 * Math.cos(th0[1]) : L1 * s1 + L2 * Math.sin(th0[1]), message: relMsg, trapId: 'kin-ik-relative-angle' },
    { value: degMode(k === 0 ? Math.cos : Math.sin), message: radMsg, trapId: 'radians' },
  ];
  const Jrel = [
    [-L1 * s1 - L2 * Math.sin(th0[1]), -L2 * Math.sin(th0[1])],
    [L1 * c1 + L2 * Math.cos(th0[1]), L2 * Math.cos(th0[1])],
  ];
  const Jswap = [J[1].slice(), J[0].slice()];
  const JTe: [number, number] = [J[0][0] * e[0] + J[1][0] * e[1], J[0][1] * e[0] + J[1][1] * e[1]];
  const adjE: [number, number] = [dth[0] * det, dth[1] * det];

  // ------------------------------------------------ parts
  const parts: SolvePart[] = [];
  const num = (id: string, label: string, answer: number, unit: string, traps: TrapIn[] = [], extra: Partial<NumericPart> = {}): NumericPart => ({
    kind: 'numeric',
    id,
    label,
    answer,
    unit,
    ...NUM,
    traps: keepTraps(answer, traps),
    marks: 0.5,
    ...extra,
  });
  if (deg) {
    parts.push(num('th0-1', 'First convert the guess to radians: $\\theta^{(0)}_1$', th0[0], 'rad'));
    parts.push(num('th0-2', '$\\theta^{(0)}_2$ in radians', th0[1], 'rad'));
  }
  parts.push(num('tip-x', 'Tip position at the guess, $x(\\theta^{(0)})$: the $x$-coordinate', tip[0], 'm', tipTraps(0)));
  parts.push(num('tip-y', 'and the $y$-coordinate', tip[1], 'm', tipTraps(1)));
  const eSign = 'The error is target minus current, $e = x_d - x(\\theta^{(0)})$: it points from the tip to the target.';
  parts.push(num('e-x', 'Error $e = x_d - x(\\theta^{(0)})$: $e_x$', e[0], 'm', [{ value: -e[0], message: eSign, trapId: 'sign' }]));
  parts.push(num('e-y', '$e_y$', e[1], 'm', [{ value: -e[1], message: eSign, trapId: 'sign' }]));
  const Jpart: MatrixPart = {
    kind: 'matrix',
    id: 'J',
    label: 'The Jacobian $J(\\theta^{(0)})$ (rows: $x$, $y$; columns: $\\theta_1$, $\\theta_2$)',
    answer: J,
    rowLabels: ['$x$', '$y$'],
    colLabels: ['$\\partial/\\partial\\theta_1$', '$\\partial/\\partial\\theta_2$'],
    unit: 'm/rad',
    absTol: 0.005,
    traps: keepMatTraps(J, [
      { value: Jrel, message: `${relMsg} Every entry uses $\\sin(\\theta_1 + \\theta_2)$ or $\\cos(\\theta_1 + \\theta_2)$.`, trapId: 'kin-ik-relative-angle' },
      { value: Jswap, message: 'The first row is $\\partial x/\\partial\\theta$ (the derivative of $\\cos$ is $-\\sin$), the second $\\partial y/\\partial\\theta$.' },
    ]),
    marks: 1,
  };
  parts.push(Jpart);
  parts.push(
    num('det', '$\\det J$ (check: $L_1L_2\\sin\\theta_2$)', det, 'm²', [
      { value: J[0][0] * J[1][1] + J[0][1] * J[1][0], message: '$\\det J = J_{11}J_{22} - J_{12}J_{21}$: subtract the second product.' },
      { value: L1 * L2 * Math.cos(th0[1]), message: '$\\det J = L_1L_2\\sin\\theta_2$ (sine, not cosine).' },
    ], { absTol: 0.002 })
  );
  if (full) {
    parts.push({
      kind: 'matrix',
      id: 'Jinv',
      label: '$J^{-1} = \\dfrac{1}{\\det J}\\begin{bmatrix} J_{22} & -J_{12} \\\\ -J_{21} & J_{11} \\end{bmatrix}$',
      answer: Jinv,
      unit: 'rad/m',
      tol: 0.01,
      traps: keepMatTraps(Jinv, [
        { value: Jinv.map((r) => r.map((x) => x * det)), message: 'That is the adjugate: divide every entry by $\\det J$.', trapId: 'kin-nr-adjugate' },
        { value: [[J[1][1] / det, J[0][1] / det], [J[1][0] / det, J[0][0] / det]], message: 'Swap the diagonal entries and **negate** the off-diagonal ones.' },
      ]),
      marks: 1,
    });
  }
  if (tier >= 2) {
    const dTraps = (k: 0 | 1): TrapIn[] => [
      { value: JTe[k], message: 'That is $J^Te$, a gradient step. Newton–Raphson uses $J^{-1}e$.', trapId: 'kin-nr-transpose' },
      { value: adjE[k], message: 'You left out the $1/\\det J$.', trapId: 'kin-nr-adjugate' },
    ];
    const sx = variant === 'singular' ? { tol: 0.03, absTol: 0.05 } : {};
    parts.push(num('dth-1', 'The step $\\Delta\\theta = J^{-1}e$: $\\Delta\\theta_1$', dth[0], 'rad', dTraps(0), sx));
    parts.push(num('dth-2', '$\\Delta\\theta_2$', dth[1], 'rad', dTraps(1), sx));
  }
  if (full) {
    const upTraps = (k: 0 | 1): TrapIn[] => [
      { value: th0[k] - dth[k], message: 'Add the step: $\\theta^{(1)} = \\theta^{(0)} + \\Delta\\theta$.', trapId: 'sign' },
      ...(deg ? [{ value: deg[k] + dth[k], message: 'You added a step in radians to an angle in degrees. Work in radians: $\\Delta\\theta$ is in rad because $J$ is in m/rad.', trapId: 'radians' }] : []),
    ];
    parts.push(num('th1-1', 'The new guess $\\theta^{(1)} = \\theta^{(0)} + \\Delta\\theta$: $\\theta^{(1)}_1$', th1[0], 'rad', upTraps(0)));
    parts.push(num('th1-2', '$\\theta^{(1)}_2$', th1[1], 'rad', upTraps(1)));
  }
  if (variant === 'check') {
    parts.push(num('err1', 'Check the step: the error left after it, $\\|x_d - x(\\theta^{(1)})\\|$', d.err1, 'm', [{ value: d.err0, message: 'That is the error **before** the step. Evaluate $x(\\theta^{(1)})$ with the new angles.' }], { tol: 0.03, absTol: 0.002 }));
    const shrank = d.err1 < 0.5 * d.err0;
    parts.push({
      kind: 'choice',
      id: 'verdict',
      label: `The error went from ${t4(d.err0)} m to ${t4(d.err1)} m. Why not to zero in one step?`,
      options: [
        { text: 'The step solves the linearised arm exactly, but the real arm is nonlinear (the tip moves on arcs), so it lands a little off; the next steps shrink the error very fast', correct: shrank, why: 'Newton–Raphson’s linear model $x(\\theta + \\Delta\\theta) \\approx x(\\theta) + J\\Delta\\theta$ is only exact for small steps. Near a solution the miss shrinks roughly quadratically: the next error is about the square of this one.' },
        { text: 'A rounding error: with exact arithmetic one Newton–Raphson step always lands on the target', correct: false, why: 'Even exact arithmetic misses: the step is exact for the **linearised** arm, not the real one.' },
        { text: 'The guess was in the wrong basin, so the iteration is diverging', correct: !shrank, why: shrank ? `The error shrank (${t4(d.err0)} → ${t4(d.err1)} m): it is converging.` : 'The error did not drop much, so this guess is far from where the linear model is good.' },
      ],
      marks: 1,
    });
  }
  if (variant === 'singular') {
    parts.push({
      kind: 'choice',
      id: 'verdict',
      label: `The step is huge ($\\|\\Delta\\theta\\|$ ≈ ${fmt(Math.hypot(...dth), 2)} rad). Why, and what would you do?`,
      options: [
        { text: 'The arm is nearly straight, so $\\det J$ is almost 0 (a singularity) and $J^{-1}$ is huge. Damp the step ($\\lambda$) or start from a guess with the elbow bent', correct: true, why: `$\\det J = L_1L_2\\sin\\theta_2$ = ${t4(det)} m² with $\\theta_2$ = ${fmt(th0[1], 2)} rad. A straight arm can hardly move its tip along itself, so an error with a component in that direction demands an enormous joint change. Damped least squares $J^T(JJ^T + \\lambda^2I)^{-1}e$ keeps the step bounded.` },
        { text: 'A calculator slip: Newton–Raphson steps are always small', correct: false, why: 'The arithmetic is right. Steps are only small when $J$ is well conditioned; near a singularity they blow up.' },
        { text: 'The target is out of reach, so the step is meaningless', correct: false, why: `The target is within reach: $|x_d|$ = ${fmt(Math.hypot(xd[0], xd[1]), 3)} m < $L_1 + L_2$ = ${fmt(L1 + L2, 2)} m. The problem is the guess, not the target.` },
        { text: 'Nothing is wrong: take the full step', correct: false, why: 'The joints would spin through several turns and the next tip position is essentially random: the linear model is useless that far out.' },
      ],
      marks: 1,
    });
  }

  // ------------------------------------------------ prompt and hints
  const what =
    tier === 1
      ? 'Work out the ingredients of the first Newton–Raphson iteration: the tip position at the guess, the error, the Jacobian and its determinant.'
      : variant === 'singular'
        ? 'Carry out the first Newton–Raphson iteration up to the step $\\Delta\\theta$, and explain what you get.'
        : `Carry out **one** Newton–Raphson iteration by hand${variant === 'check' ? ', then check how much it helped' : ''}.`;
  const prompt = `A planar 2-link arm has $L_1$ = ${L1} m and $L_2$ = ${L2} m, with $\\theta_1$ measured from the $x$-axis and $\\theta_2$ from link 1 (anticlockwise positive). Newton–Raphson IK is used to bring its tip to $x_d$ = (${xd[0]}, ${xd[1]}) m from the initial guess ${guessTxt}. ${what} Work in radians and keep 4 significant figures.`;
  const setup = `$$x(\\theta) = \\begin{bmatrix} L_1c_1 + L_2c_{12} \\\\ L_1s_1 + L_2s_{12} \\end{bmatrix}, \\qquad J(\\theta) = \\begin{bmatrix} -L_1s_1 - L_2s_{12} & -L_2s_{12} \\\\ L_1c_1 + L_2c_{12} & L_2c_{12} \\end{bmatrix}$$ with $c_1 = \\cos\\theta_1$, $s_{12} = \\sin(\\theta_1 + \\theta_2)$ and so on. $\\det J = L_1L_2\\sin\\theta_2$${tier >= 2 ? ', $$J^{-1} = \\frac{1}{\\det J}\\begin{bmatrix} J_{22} & -J_{12} \\\\ -J_{21} & J_{11} \\end{bmatrix}, \\qquad \\Delta\\theta = J^{-1}e, \\qquad \\theta^{(1)} = \\theta^{(0)} + \\Delta\\theta$$' : '.'}`;
  const subst = [
    `${deg ? `$\\theta^{(0)}$ = (${deg[0]}°, ${deg[1]}°) = (${t4(th0[0])}, ${t4(th0[1])}) rad. ` : ''}$\\theta_1 + \\theta_2$ = ${t4(a12)} rad: $c_1$ = ${t4(c1)}, $s_1$ = ${t4(s1)}, $c_{12}$ = ${t4(c12)}, $s_{12}$ = ${t4(s12)}.`,
    `$x = ${L1}(${n4(c1)}) + ${L2}(${n4(c12)})$ = ${t4(tip[0])} m, $y = ${L1}(${n4(s1)}) + ${L2}(${n4(s12)})$ = ${t4(tip[1])} m, so $e$ = (${xd[0]} − ${t4(tip[0])}, ${xd[1]} − ${t4(tip[1])}) = (${t4(e[0])}, ${t4(e[1])}) m.`,
    `$J_{11} = -${L1}(${n4(s1)}) - ${L2}(${n4(s12)})$ = ${t4(J[0][0])}, $J_{12} = -${L2}(${n4(s12)})$ = ${t4(J[0][1])}, $J_{21}$ = ${t4(J[1][0])}, $J_{22}$ = ${t4(J[1][1])}; $\\det J = ${L1}(${L2})\\sin(${n4(th0[1])})$ = ${t4(det)} m².`,
  ].join('\n\n');
  const rowsTeX = [
    ...(deg ? [`\\theta^{(0)} & ${bvec(th0)}\\ \\text{rad}`] : []),
    `x(\\theta^{(0)}) & ${bvec(tip)}\\ \\text{m}`,
    `e = x_d - x(\\theta^{(0)}) & ${bvec(e)}\\ \\text{m}`,
    `J(\\theta^{(0)}) & ${bmat(J)}\\ \\text{m/rad}`,
    `\\det J & ${n4(det)}\\ \\text{m}^2`,
    ...(full ? [`J^{-1} & ${bmat(Jinv)}\\ \\text{rad/m}`] : []),
    ...(tier >= 2 ? [`\\Delta\\theta = J^{-1}e & ${bvec(dth)}\\ \\text{rad}`] : []),
    ...(full ? [`\\theta^{(1)} = \\theta^{(0)} + \\Delta\\theta & ${bvec(th1)}\\ \\text{rad}`] : []),
    ...(variant === 'check' ? [`x(\\theta^{(1)}) & ${bvec(d.tip1)}\\ \\text{m}`, `\\|x_d - x(\\theta^{(1)})\\| & ${n4(d.err1)}\\ \\text{m}`] : []),
  ];
  const finale =
    tier === 1
      ? `**$e$ = (${t4(e[0])}, ${t4(e[1])}) m, $\\det J$ = ${t4(det)} m²**: not near 0, so the step $J^{-1}e$ will be well behaved.`
      : variant === 'singular'
        ? `**$\\Delta\\theta$ = (${t4(dth[0])}, ${t4(dth[1])}) rad**: tens of radians, because $\\det J$ = ${t4(det)} m² is nearly 0 (the arm is almost straight). Damp the step or restart from a bent-elbow guess.`
        : `**$\\theta^{(1)}$ = (${t4(th1[0])}, ${t4(th1[1])}) rad**${variant === 'check' ? `, leaving an error of **${t4(d.err1)} m** (down from ${t4(d.err0)} m)` : ''}.`;
  const hints: [string, string, string, string] = [
    'Newton–Raphson replaces the arm by its linearisation at the current guess, $x(\\theta^{(0)} + \\Delta\\theta) \\approx x(\\theta^{(0)}) + J\\,\\Delta\\theta$. Asking that to equal the target gives $J\\Delta\\theta = e$ with the error $e = x_d - x(\\theta^{(0)})$, so one iteration is $\\Delta\\theta = J^{-1}e$ and $\\theta^{(1)} = \\theta^{(0)} + \\Delta\\theta$. Angles in radians throughout: $J$ is in m/rad.',
    setup,
    subst,
    `$$\\begin{array}{l|l} ${rowsTeX.join(' \\\\[4pt] ')} \\end{array}$$\n\n${finale}`,
  ];
  const figure = nrFigure({
    L: [L1, L2],
    th: th0,
    xd,
    labels: deg ? [`θ₁ = ${deg[0]}°`, `θ₂ = ${deg[1]}°`] : [`θ₁ = ${thTxt[0]} rad`, `θ₂ = ${thTxt[1]} rad`],
    target: 'x_d',
  });
  return {
    prompt,
    givens: [
      { sym: 'L_1', value: `${L1} m`, label: 'link 1' },
      { sym: 'L_2', value: `${L2} m`, label: 'link 2' },
      { sym: 'x_d', value: `(${xd[0]}, ${xd[1]}) m`, label: 'target' },
      { sym: '\\theta^{(0)}', value: deg ? `(${deg[0]}°, ${deg[1]}°)` : `(${thTxt[0]}, ${thTxt[1]}) rad`, label: 'initial guess' },
    ],
    figure,
    parts,
    hints,
  };
}

// ================================================================== the generators

export const generators: SolveGenerator[] = [
  {
    id: 'kin-fk-or-ik',
    title: 'Forward or inverse kinematics?',
    summary: 'Arm and mobile-robot problems: what is known, what is wanted, and which direction that is. Includes the paper’s “which describes / which does NOT describe” multiple choice.',
    tiers: [1, 2],
    source: 'Similar to 2023 Q11, 2024 Q12, 2025 Q12; review deck slide 19',
    cardId: 'kin-fk-ik',
    marks: 1,
    generate: (rng, tier) => genFkIk(rng, tier),
  },
  {
    id: 'kin-ik-solutions',
    title: 'How many IK solutions? Reach, redundancy and singularities',
    summary: 'Reach of a 2-link arm (none, one or two solutions), redundant arms (infinitely many), and the true/false facts about Newton–Raphson and singularities.',
    tiers: [1, 2],
    source: 'Similar to 2022 Q4, Q12, Q18, Q21, Q29; summary notes §6 (number of IK solutions)',
    cardId: 'kin-numerical-ik',
    marks: 2,
    generate: (rng, tier) => genSolutions(rng, tier),
  },
  {
    id: 'kin-pieper',
    title: 'Closed-form IK? (Pieper’s criterion)',
    summary: 'Six-axis arms drawn like the 2023 paper: does three consecutive revolute axes meeting at a point (or parallel) give a closed form, and what rules the others out?',
    tiers: [1, 2],
    source: 'Similar to 2023 Q12; review deck slide 19; summary notes §6',
    cardId: 'kin-pieper',
    marks: 1,
    generate: (rng, tier) => genPieper(rng, tier),
  },
  {
    id: 'kin-nr-step',
    title: 'One Newton–Raphson IK step by hand',
    summary: 'A 2-link planar arm: tip position, error, Jacobian, $J^{-1}$, $\\Delta\\theta$ and the new guess. Stretch: a guess in degrees, checking the step, or a nearly straight (singular) start.',
    tiers: [1, 2, 3],
    source: 'Summary notes §6 (numerical IK); review deck slide 18 learning outcome; 2022 Q12',
    cardId: 'kin-numerical-ik',
    marks: 6,
    sprint: false,
    generate: (rng, tier) => genNr(rng, tier),
  },
];
