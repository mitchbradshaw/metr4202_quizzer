// models-odometry: the odometry motion model by hand (summary notes §3: rotate, translate, rotate; review deck
// learning outcome "derive the velocity and odometry motion models"; Thrun Table 5.6). From two odometry poses
// compute (δrot1, δtrans, δrot2); from tier 2 on, apply them to the filter's own pose estimate.
// Tier 3 twists: a heading change across ±π (wrap), a move backwards (δrot1 near ±π), or a move into the
// second or third quadrant (atan(dy/dx) loses the quadrant).
import type { Given, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { odometryFromPoses, odometryMotion, wrapAngle, type OdometryU, type Pose } from '../../../core/motion';
import { ANG, POS, keep, type Trap } from './common';
import { odometryFigure } from './figures';
import { DEG, fx, g, par } from '../explore/modelsFmt';

export type OTwist = 'none' | 'wrap' | 'back' | 'quadrant';

export interface OInstance {
  /** Odometry poses at t−1 and t (as printed: 2 decimals). */
  a: Pose;
  b: Pose;
  /** The filter's pose estimate at t−1 that the increments are applied to (tier ≥ 2). */
  start: Pose | null;
  twist: OTwist;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const roundPose = (p: Pose): Pose => ({ x: r2(p.x), y: r2(p.y), theta: r2(p.theta) });

/** The solver: increments from the two odometry poses (wrapped to (−π, π]), and the pose they move `start` to. */
export function odometrySolve(a: Pose, b: Pose, start: Pose | null): { u: OdometryU; to: Pose | null } {
  const u = odometryFromPoses(a, b);
  return { u, to: start ? odometryMotion(start, u) : null };
}

export function makeOdometry(rng: Rng, tier: Tier): OInstance {
  const twist: OTwist = tier === 3 ? rng.pick(['wrap', 'back', 'quadrant'] as const) : 'none';
  for (let k = 0; k < 200; k++) {
    let th = rng.pick([0, 0.2, 0.4, -0.3, 0.5, 0.8, -0.6, 1.0]);
    let rot1 = (rng.chance(0.5) ? 1 : -1) * rng.step(0.1, 0.8, 0.05);
    const trans = rng.step(0.5, 2.5, 0.1);
    let rot2 = (rng.chance(0.5) ? 1 : -1) * rng.step(0.05, 0.6, 0.05);
    if (twist === 'wrap') {
      th = (rng.chance(0.5) ? 1 : -1) * rng.step(2.75, 3.05, 0.05);
      rot1 = Math.sign(th) * rng.step(0.1, 0.35, 0.05);
      rot2 = Math.sign(th) * rng.step(0.1, 0.35, 0.05);
    } else if (twist === 'back') {
      rot1 = (rng.chance(0.5) ? 1 : -1) * rng.step(2.85, 3.1, 0.05);
      rot2 = -Math.sign(rot1) * rng.step(2.85, 3.1, 0.05);
    } else if (twist === 'quadrant') {
      th = (rng.chance(0.5) ? 1 : -1) * rng.step(1.9, 2.6, 0.1);
    }
    const a = roundPose({ x: rng.step(-2, 3, 0.1), y: rng.step(-2, 3, 0.1), theta: th });
    const b = roundPose(odometryMotion(a, { rot1, trans, rot2 }));
    b.theta = r2(wrapAngle(b.theta));
    const u = odometryFromPoses(a, b);
    if (u.trans < 0.3) continue;
    if (twist === 'wrap' && Math.abs(b.theta - a.theta) < Math.PI) continue; // the printed headings must straddle ±π
    if (twist === 'quadrant' && b.x - a.x >= -0.05) continue;
    if (twist === 'back' && Math.abs(u.rot1) < 2.5) continue;
    let start: Pose | null = null;
    if (tier >= 2) {
      start = { x: rng.step(-3, 3, 0.1), y: rng.step(-3, 3, 0.1), theta: rng.pick([0, 0.3, -0.5, 0.7, 1.2, -1.0, 2.0]) };
      if (Math.abs(wrapAngle(start.theta - a.theta)) < 0.2) start.theta = r2(wrapAngle(start.theta + 0.6));
    }
    return { a, b, start, twist };
  }
  return { a: { x: 1, y: 2, theta: 0.3 }, b: { x: 2.2, y: 2.9, theta: 0.8 }, start: tier >= 2 ? { x: 0, y: 0, theta: 0 } : null, twist: 'none' };
}

export const generators: SolveGenerator[] = [
  {
    id: 'models-odometry',
    title: 'Odometry motion model: rotate, translate, rotate',
    summary: 'Turn two odometry poses into $(\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$, then apply them to the robot’s own pose estimate.',
    tiers: [1, 2, 3],
    source: 'Summary notes §3 (odometry model); review deck learning outcomes (derive the odometry motion model); Thrun Table 5.6',
    cardId: 'models-odometry',
    marks: 6,
    generate(rng, tier) {
      const inst = makeOdometry(rng, tier);
      const { a, b, start } = inst;
      const { u, to } = odometrySolve(a, b, start);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dir = Math.atan2(dy, dx);
      const rawRot1 = dir - a.theta;
      const rawRot2 = b.theta - a.theta - u.rot1;
      const atanDir = Math.atan(dy / dx);

      const prompt = [
        `A robot’s wheel odometry reported the pose $(\\bar x, \\bar y, \\bar\\theta)$ = $(${g(a.x)}\\ \\text{m},\\ ${g(a.y)}\\ \\text{m},\\ ${g(a.theta)}\\ \\text{rad})$ at time $t-1$ and $(\\bar x', \\bar y', \\bar\\theta')$ = $(${g(b.x)}\\ \\text{m},\\ ${g(b.y)}\\ \\text{m},\\ ${g(b.theta)}\\ \\text{rad})$ at time $t$.`,
        `(a) Find the odometry motion $u_t = (\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$: rotate, translate, rotate. Give angles in radians in $(-\\pi, \\pi]$.`,
        ...(start
          ? [
              `(b) The filter’s estimate of the pose at $t-1$ is $(x, y, \\theta)$ = $(${g(start.x)}\\ \\text{m},\\ ${g(start.y)}\\ \\text{m},\\ ${g(start.theta)}\\ \\text{rad})$ (odometry drifts, so its frame differs from the filter’s). Apply $u_t$ without noise to predict the pose at $t$. Give $\\theta'$ as $\\theta + \\delta_{rot1} + \\delta_{rot2}$ without wrapping.`,
            ]
          : []),
      ].join('\n\n');
      const givens: Given[] = [
        { sym: '(\\bar x, \\bar y, \\bar\\theta)', value: `(${g(a.x)}, ${g(a.y)}, ${g(a.theta)})`, label: 'odometry pose at t − 1 (m, m, rad)' },
        { sym: "(\\bar x', \\bar y', \\bar\\theta')", value: `(${g(b.x)}, ${g(b.y)}, ${g(b.theta)})`, label: 'odometry pose at t' },
        ...(start ? [{ sym: '(x, y, \\theta)', value: `(${g(start.x)}, ${g(start.y)}, ${g(start.theta)})`, label: 'filter’s pose estimate at t − 1' }] : []),
      ];

      const rot1Traps: Trap[] = [
        { value: wrapAngle(dir), message: 'Subtract the old heading: $\\delta_{rot1} = \\operatorname{atan2}(\\bar y\' - \\bar y, \\bar x\' - \\bar x) - \\bar\\theta$.', trapId: 'odo-rot1-heading' },
        { value: u.rot1 * DEG, message: 'That is in degrees. Keep angles in radians.', trapId: 'radians' },
        ...(Math.abs(rawRot1 - u.rot1) > 1 ? [{ value: rawRot1, message: 'Wrap it into $(-\\pi, \\pi]$ by adding or subtracting $2\\pi$.', trapId: 'angle-wrap' }] : []),
        ...(dx < 0 ? [{ value: wrapAngle(atanDir - a.theta), message: 'atan(dy/dx) lost the quadrant (dx < 0): use atan2, which differs by π here.', trapId: 'atan-quadrant' }] : []),
      ];
      const transTraps: Trap[] = [
        { value: Math.abs(dx) + Math.abs(dy), message: '$\\delta_{trans}$ is the straight-line distance $\\sqrt{\\Delta x^2 + \\Delta y^2}$, not $|\\Delta x| + |\\Delta y|$.' },
        { value: dx * dx + dy * dy, message: 'Take the square root: $\\delta_{trans} = \\sqrt{\\Delta x^2 + \\Delta y^2}$.', trapId: 'sqrt' },
      ];
      const rot2Traps: Trap[] = [
        { value: wrapAngle(b.theta - a.theta), message: 'Subtract $\\delta_{rot1}$ too: $\\delta_{rot2} = \\bar\\theta\' - \\bar\\theta - \\delta_{rot1}$.', trapId: 'odo-rot2' },
        { value: u.rot2 * DEG, message: 'That is in degrees. Keep angles in radians.', trapId: 'radians' },
        ...(Math.abs(rawRot2 - u.rot2) > 1 ? [{ value: rawRot2, message: 'Wrap it into $(-\\pi, \\pi]$: add or subtract $2\\pi$.', trapId: 'angle-wrap' }] : []),
      ];
      const parts: SolvePart[] = [
        { kind: 'numeric', id: 'rot1', label: '$\\delta_{rot1}$', answer: u.rot1, ...ANG, traps: keep(u.rot1, rot1Traps), marks: 1 },
        { kind: 'numeric', id: 'trans', label: '$\\delta_{trans}$', answer: u.trans, ...POS, traps: keep(u.trans, transTraps), marks: 1 },
        { kind: 'numeric', id: 'rot2', label: '$\\delta_{rot2}$', answer: u.rot2, ...ANG, traps: keep(u.rot2, rot2Traps), marks: 1 },
      ];
      if (start && to) {
        const h = start.theta + u.rot1;
        const frameH = a.theta + u.rot1;
        parts.push(
          {
            kind: 'numeric',
            id: 'x',
            label: "(b) $x' = x + \\delta_{trans}\\cos(\\theta + \\delta_{rot1})$",
            answer: to.x,
            ...POS,
            traps: keep(to.x, [
              { value: start.x + u.trans * Math.cos(frameH), message: 'Rotate from the filter’s heading $\\theta$, not the odometry heading $\\bar\\theta$: the increments are relative.', trapId: 'odo-frame' },
              { value: start.x + dx, message: 'Adding the odometry displacement only works if both frames point the same way: apply the increments from $\\theta$.', trapId: 'odo-frame' },
              { value: start.x + u.trans * Math.cos(h / DEG), message: 'Your calculator is in degrees.', trapId: 'radians' },
            ]),
            marks: 1,
          },
          {
            kind: 'numeric',
            id: 'y',
            label: "(b) $y' = y + \\delta_{trans}\\sin(\\theta + \\delta_{rot1})$",
            answer: to.y,
            ...POS,
            traps: keep(to.y, [
              { value: start.y + u.trans * Math.sin(frameH), message: 'Rotate from the filter’s heading $\\theta$, not the odometry heading $\\bar\\theta$.', trapId: 'odo-frame' },
              { value: start.y + dy, message: 'Adding the odometry displacement only works if both frames point the same way.', trapId: 'odo-frame' },
              { value: start.y + u.trans * Math.sin(h / DEG), message: 'Your calculator is in degrees.', trapId: 'radians' },
            ]),
            marks: 1,
          },
          {
            kind: 'numeric',
            id: 'th',
            label: "(b) $\\theta' = \\theta + \\delta_{rot1} + \\delta_{rot2}$",
            answer: to.theta,
            ...ANG,
            traps: keep(to.theta, [
              { value: b.theta, message: 'That is the odometry heading $\\bar\\theta\'$. Add both rotations to the filter’s $\\theta$ instead.', trapId: 'odo-frame' },
              { value: start.theta + u.rot1, message: 'Add $\\delta_{rot2}$ as well: the robot turns again after translating.' },
            ]),
            marks: 1,
          }
        );
      }

      // ---------------------------------------------------------------- hints
      const twistNote: Record<OTwist, string> = {
        none: '',
        wrap: ' The headings straddle $\\pm\\pi$: wrap every angle difference into $(-\\pi, \\pi]$.',
        back: ' The robot moved roughly backwards, so $\\delta_{rot1}$ is close to $\\pm\\pi$ (turn round, drive, turn round again).',
        quadrant: ' The move has $\\Delta x < 0$: atan(Δy/Δx) would land in the wrong quadrant, so use atan2.',
      };
      const hints: [string, string, string, string] = [
        `The odometry model describes the measured move between two odometry poses as **rotate** by $\\delta_{rot1}$ (to face the direction of travel), **translate** $\\delta_{trans}$ in a straight line, then **rotate** by $\\delta_{rot2}$ (to the final heading). The increments are relative, so they can be applied to any pose estimate, whatever frame the odometry drifted into.${twistNote[inst.twist]}`,
        `$$\\delta_{rot1} = \\operatorname{atan2}(\\bar y' - \\bar y,\\ \\bar x' - \\bar x) - \\bar\\theta, \\qquad \\delta_{trans} = \\sqrt{(\\bar x' - \\bar x)^2 + (\\bar y' - \\bar y)^2}, \\qquad \\delta_{rot2} = \\bar\\theta' - \\bar\\theta - \\delta_{rot1}$$${start ? " Then $x' = x + \\delta_{trans}\\cos(\\theta + \\delta_{rot1})$, $y' = y + \\delta_{trans}\\sin(\\theta + \\delta_{rot1})$, $\\theta' = \\theta + \\delta_{rot1} + \\delta_{rot2}$." : ''} Wrap the rotations into $(-\\pi, \\pi]$.`,
        `$\\Delta x$ = ${g(b.x)} − ${par(a.x)} = ${g(dx)} m, $\\Delta y$ = ${g(b.y)} − ${par(a.y)} = ${g(dy)} m, so $\\operatorname{atan2}(\\Delta y, \\Delta x)$ = ${fx(dir)} rad and $\\delta_{trans} = \\sqrt{${g(dx)}^2 + ${g(dy)}^2}$.${start ? ` For (b): $\\theta + \\delta_{rot1}$ = ${g(start.theta)} + ${par(u.rot1)}.` : ''}`,
        [
          `$$\\begin{aligned} \\delta_{rot1} &= ${fx(dir)} - ${par(a.theta)}${Math.abs(rawRot1 - u.rot1) > 1 ? ` = ${fx(rawRot1)} \\to` : ' ='} \\mathbf{${fx(u.rot1)}}\\ \\text{rad} \\\\ \\delta_{trans} &= \\sqrt{${g(dx)}^2 + ${g(dy)}^2} = \\mathbf{${fx(u.trans)}}\\ \\text{m} \\\\ \\delta_{rot2} &= ${g(b.theta)} - ${par(a.theta)} - ${par(u.rot1)}${Math.abs(rawRot2 - u.rot2) > 1 ? ` = ${fx(rawRot2)} \\to` : ' ='} \\mathbf{${fx(u.rot2)}}\\ \\text{rad} \\end{aligned}$$`,
          ...(start && to
            ? [
                `(b) From the filter’s pose: $\\theta + \\delta_{rot1}$ = ${fx(start.theta + u.rot1)} rad.`,
                `$$\\begin{aligned} x' &= ${g(start.x)} + ${fx(u.trans)}\\cos(${fx(start.theta + u.rot1)}) = \\mathbf{${fx(to.x)}}\\ \\text{m} \\\\ y' &= ${g(start.y)} + ${fx(u.trans)}\\sin(${fx(start.theta + u.rot1)}) = \\mathbf{${fx(to.y)}}\\ \\text{m} \\\\ \\theta' &= ${g(start.theta)} + ${par(Number(fx(u.rot1)))} + ${par(Number(fx(u.rot2)))} = \\mathbf{${fx(to.theta)}}\\ \\text{rad} \\end{aligned}$$`,
              ]
            : []),
        ].join('\n\n'),
      ];

      return { prompt, givens, figure: odometryFigure(a, b, start), layout: start ? 'side' : 'stack', parts, hints };
    },
  },
];

/** For the self-tests. */
export const _internal = { makeOdometry };
