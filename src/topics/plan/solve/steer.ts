// RRT steering with the velocity motion model (plan-steer): the 2023 Q32 template with random commands.
// Each steering command (v, ω) is held for Δt, so every edge of the tree is a circular arc of radius v/ω
// (a straight segment when ω = 0). Parts: the segment shape, then r, ωΔt and the pose after every command
// (carrying θ forward, in radians), whether checking the final pose is enough, and why RRT is suboptimal.
import type { ChoicePart, Given, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { velocityMotion, type Pose } from '../../../core/motion';
import { steerFigure } from '../explore/rrtFigures';

export interface SteerCmd {
  v: number;
  w: number;
  dt: number;
}

export interface SteerStep {
  cmd: SteerCmd;
  from: Pose;
  to: Pose;
  /** ω = 0: a straight segment (the arc formula would divide by zero). */
  straight: boolean;
  /** Signed radius v/ω (Infinity when straight). */
  r: number;
  /** Heading change ωΔt (rad). */
  wdt: number;
}

/** The solver: apply each command in turn from the pose the previous one ended at (θ carried, not wrapped). */
export function steerChain(start: Pose, cmds: readonly SteerCmd[]): SteerStep[] {
  const out: SteerStep[] = [];
  let p = start;
  for (const c of cmds) {
    const to = velocityMotion(p, c.v, c.w, c.dt);
    const straight = c.w === 0;
    out.push({ cmd: c, from: p, to, straight, r: straight ? Infinity : c.v / c.w, wdt: c.w * c.dt });
    p = to;
  }
  return out;
}

// ------------------------------------------------------------------ formatting

const clean = (x: number) => (Math.abs(x) < 5e-12 ? 0 : x);
/** Up to `dp` decimals, trailing zeros dropped: 8, -2.5, 0.3, 7.3333. */
const g = (x: number, dp = 4) => String(Number(clean(x).toFixed(dp)));
/** Fixed decimals (for the worked solution): 3.4642. */
const fx = (x: number, dp = 4) => clean(x).toFixed(dp);
/** A number inside TeX with a parenthesis if negative: 8 \sin(0.3), (-2.5)\sin(0.3). */
const par = (x: number, dp = 4) => (x < 0 ? `(${g(x, dp)})` : g(x, dp));
const DEG = 180 / Math.PI;

// ------------------------------------------------------------------ random commands

/** A turning command with sign `sign`, preferring a "nice" radius v/ω (as on the paper: 8, −2.5). */
function arcCmd(rng: Rng, sign: 1 | -1, dt: number): SteerCmd {
  let fallback: SteerCmd | null = null;
  for (let k = 0; k < 60; k++) {
    const v = rng.step(0.4, 1.6, 0.1);
    const w = sign * rng.step(0.05, 0.5, 0.05);
    const turn = Math.abs(w * dt);
    if (turn > 1.2 || turn < 0.1 || Math.abs(v / w) > 12) continue;
    const c = { v, w, dt };
    const r100 = (v / w) * 100;
    if (Math.abs(r100 - Math.round(r100)) < 1e-6) return c;
    fallback ??= c;
  }
  return fallback ?? { v: 1.2, w: sign * 0.15, dt };
}

function straightCmd(rng: Rng, dt: number): SteerCmd {
  return { v: rng.step(0.4, 1.4, 0.1), w: 0, dt };
}

interface SteerInstance {
  start: Pose;
  cmds: SteerCmd[];
}

function makeInstance(rng: Rng, tier: Tier): SteerInstance {
  const start = { x: rng.step(-3, 3, 0.1), y: rng.step(-3, 3, 0.1), theta: 0 };
  if (tier === 1) {
    start.theta = rng.pick([0, 0, 0, 0.2, -0.3, 0.5]);
    const dt = rng.pick([1, 1.5, 2, 2.5, 3]);
    return { start, cmds: [arcCmd(rng, rng.pick([1, -1] as const), dt)] };
  }
  if (tier === 2) {
    start.theta = rng.pick([0, 0, 0, 0.1, -0.2, 0.3]);
    const dt = rng.pick([1, 1.5, 2, 2.5]);
    const first: 1 | -1 = rng.chance(0.7) ? 1 : -1;
    return { start, cmds: [arcCmd(rng, first, dt), arcCmd(rng, first === 1 ? -1 : 1, dt)] };
  }
  start.theta = rng.pick([0.4, -0.5, 0.8, 1, -0.9, 0.6, 1.2]);
  const dt = rng.pick([1, 1.5, 2]);
  if (rng.chance(0.5)) {
    // An ω = 0 command in the chain: a straight segment.
    const arc = arcCmd(rng, rng.pick([1, -1] as const), dt);
    return { start, cmds: rng.chance(0.5) ? [arc, straightCmd(rng, dt)] : [straightCmd(rng, dt), arc] };
  }
  const signs = rng.pick([
    [1, -1, 1],
    [-1, 1, -1],
    [1, 1, -1],
    [-1, -1, 1],
  ] as const);
  return { start, cmds: signs.map((s) => arcCmd(rng, s as 1 | -1, dt)) };
}

// ------------------------------------------------------------------ traps

type Trap = { value: number; message: string; trapId?: string };

/** Drop traps that are (nearly) equal to the answer or to each other. */
function keep(answer: number, list: Trap[]): Trap[] {
  const out: Trap[] = [];
  for (const t of list) {
    if (!Number.isFinite(t.value)) continue;
    if (Math.abs(t.value - answer) <= Math.max(0.01 * Math.abs(answer), 0.01)) continue;
    if (out.some((o) => Math.abs(o.value - t.value) < 1e-3)) continue;
    out.push(t);
  }
  return out;
}

/** Pose reached with the sin/cos of degrees instead of radians (calculator in DEG mode). */
function degMode(p: Pose, c: SteerCmd): Pose {
  const s = (a: number) => Math.sin(a / DEG);
  const co = (a: number) => Math.cos(a / DEG);
  if (c.w === 0) return { x: p.x + c.v * c.dt * co(p.theta), y: p.y + c.v * c.dt * s(p.theta), theta: p.theta };
  const r = c.v / c.w;
  const th = p.theta + c.w * c.dt;
  return { x: p.x - r * s(p.theta) + r * s(th), y: p.y + r * co(p.theta) - r * co(th), theta: th };
}

// ------------------------------------------------------------------ generator

const POS = { unit: 'm', tol: 0.002, absTol: 0.006 } as const;
const ANG = { unit: 'rad', tol: 0.002, absTol: 0.004 } as const;

function shapePart(): ChoicePart {
  return {
    kind: 'choice',
    id: 'shape',
    label: '(a) With the velocity motion model as the steering function, what shape is each path segment (tree edge)?',
    options: [
      {
        text: 'A circular arc of radius $r = v/\\omega$ (a straight segment when $\\omega = 0$)',
        correct: true,
        why: 'Holding $(v, \\omega)$ constant drives at a constant speed while turning at a constant rate: constant curvature $\\omega/v$, so a circle of radius $v/\\omega$.',
      },
      {
        text: 'A straight line from the tree node to the sample',
        correct: false,
        why: 'That is the point-robot RRT with a straight-line local planner. A differential-drive robot cannot move sideways; with the velocity model each edge curves.',
      },
      {
        text: 'A clothoid (curvature changing steadily along the segment)',
        correct: false,
        why: 'The curvature $\\omega/v$ stays fixed while a command is held, so the curve is a circular arc, not a clothoid.',
      },
      {
        text: 'A parabola',
        correct: false,
        why: 'Nothing accelerates sideways at a constant rate here; the heading turns at a constant rate, which traces a circle.',
      },
    ],
    marks: 1,
  };
}

function checkPart(): ChoicePart {
  return {
    kind: 'choice',
    id: 'check',
    label: '(c) Is it enough for the RRT to check for collisions only at the final pose after each steering command?',
    options: [
      {
        text: 'No: the robot sweeps the whole arc, so the swept path (with the robot’s footprint) must be checked, e.g. at poses sampled finely along it',
        correct: true,
        why: 'An obstacle can sit on the arc while both end poses are free; checking only the end lets the edge pass straight through it (2023 Q32c).',
      },
      {
        text: 'Yes: if the final pose is collision-free, so is every pose before it',
        correct: false,
        why: 'Free end points say nothing about the middle: a thin wall between them is missed.',
      },
      {
        text: 'Yes, provided the steering time $\\Delta t$ is short',
        correct: false,
        why: 'Shorter steps make a miss less likely, not impossible. Correctness needs the whole edge checked, at a resolution finer than the thinnest obstacle.',
      },
      {
        text: 'No: the start pose of every command must be checked as well',
        correct: false,
        why: 'The start pose is an existing tree node, already checked when it was added. The problem is the path between the poses.',
      },
    ],
    marks: 2,
  };
}

function suboptPart(): ChoicePart {
  return {
    kind: 'choice',
    id: 'subopt',
    label: '(d) RRT paths are generally suboptimal. Which is a reason?',
    options: [
      {
        text: 'Each sample is joined to the nearest node by distance, ignoring the cost-to-come from the root, and edges are never revised',
        correct: true,
        why: 'Early random branches are locked in, so the jagged first path never improves however many samples follow (RRT* fixes this with choose-parent and rewire).',
      },
      {
        text: 'The velocity model has no noise term, so the plan is too optimistic',
        correct: false,
        why: 'Noise affects whether the robot can follow the plan, not whether the plan is short.',
      },
      {
        text: 'Some random samples land inside obstacles',
        correct: false,
        why: 'Those samples are simply rejected: that costs time, not path quality.',
      },
      {
        text: 'It checks collisions only at the final pose of each command',
        correct: false,
        why: 'Doing that would make RRT unsafe (part c), not suboptimal. A correct RRT checks the whole edge.',
      },
    ],
    marks: 2,
  };
}

function rewirePart(): ChoicePart {
  return {
    kind: 'choice',
    id: 'rewire',
    label: '(e) RRT* adds a “to $x_{new}$” and a “from $x_{new}$” calculation over the neighbours $x_{near}$ of each new node. Which pair is right?',
    options: [
      {
        text: 'To: choose the parent minimising $c(x_{near}) + d(x_{near}, x_{new})$. From: rewire $x_{near}$ if $c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$',
        correct: true,
        why: 'Both use the cost-to-come $c$ from the root: first the cheapest way into $x_{new}$, then any neighbour that gets cheaper through $x_{new}$ (2023 Q32e, 2025 Q29).',
      },
      {
        text: 'To: connect to the nearest neighbour. From: rewire $x_{near}$ if $d(x_{new}, x_{near})$ is shorter than its current parent edge',
        correct: false,
        why: 'Both tests compare single edges. RRT* compares whole path costs from the root.',
      },
      {
        text: 'To: minimise $d(x_{near}, x_{new})$. From: rewire $x_{near}$ if $c(x_{new}) < c(x_{near})$',
        correct: false,
        why: 'The “to” step must include $c(x_{near})$, and the rewire test must include the new edge $d(x_{new}, x_{near})$.',
      },
      {
        text: 'To: minimise $c(x_{near}) + d(x_{near}, x_{new})$. From: rewire if $c(x_{near}) + d(x_{near}, x_{new}) < c(x_{new})$',
        correct: false,
        why: 'That re-runs the “to” step. Rewiring asks whether a neighbour gets cheaper by going through $x_{new}$.',
      },
    ],
    marks: 1,
  };
}

function straightPart(j: number, c: SteerCmd): ChoicePart {
  return {
    kind: 'choice',
    id: `straight${j}`,
    label: `Command ${j} has $\\omega_${j} = 0$. How do you move the pose?`,
    options: [
      {
        text: `In a straight line: $x' = x + v\\Delta t\\cos\\theta$, $y' = y + v\\Delta t\\sin\\theta$, $\\theta' = \\theta$`,
        correct: true,
        why: `With no turning the robot drives ${g(c.v * c.dt)} m along its current heading (the limit of the arc as $\\omega \\to 0$).`,
      },
      {
        text: 'Use the arc formula with $\\omega = 0$',
        correct: false,
        why: '$v/\\omega$ divides by zero: the radius is infinite, which is the straight line.',
      },
      {
        text: 'Rotate on the spot by $\\omega\\Delta t$',
        correct: false,
        why: 'Turning on the spot is $v = 0$. Here $\\omega = 0$: it drives straight without turning.',
      },
    ],
    marks: 1,
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'plan-steer',
    title: 'RRT steering with the velocity model',
    summary: 'Chain velocity-model arcs from a start pose (radius $v/\\omega$, heading carried forward), then say why end-pose collision checks are not enough and why RRT is suboptimal.',
    tiers: [1, 2, 3],
    source: 'Similar to 2023 Q32; summary notes §3 (velocity model) and §5',
    cardId: 'plan-rrtstar',
    marks: 12,
    sprint: false,
    generate(rng, tier) {
      const inst = makeInstance(rng, tier);
      const steps = steerChain(inst.start, inst.cmds);
      const n = steps.length;
      const s0 = inst.start;

      // ---------------------------------------------------------------- prompt and givens
      const cmdTeX = steps
        .map((s, i) => `(v_${i + 1}, \\omega_${i + 1}) = (${g(s.cmd.v)}\\ \\text{m/s},\\ ${g(s.cmd.w)}\\ \\text{rad/s})`)
        .join(',\\quad ');
      const prompt = [
        `A differential-drive robot plans its path to a waypoint with an RRT whose steering function is the velocity motion model (with $\\gamma = 0$). The robot starts at $(x_0, y_0)$ = $(${g(s0.x)}, ${g(s0.y)})$ m with heading $\\theta_0$ = ${g(s0.theta)} rad. ${n === 1 ? 'One steering command is' : `${n === 2 ? 'Two' : 'Three'} consecutive steering commands are`} executed, each for $\\Delta t$ = ${g(inst.cmds[0].dt)} s:`,
        `$$${cmdTeX}$$`,
        'Work in radians and start each command from the pose where the previous one ended.',
      ].join('\n\n');
      const givens: Given[] = [
        { sym: '(x_0, y_0)', value: `(${g(s0.x)}, ${g(s0.y)}) m`, label: 'start position' },
        { sym: '\\theta_0', value: `${g(s0.theta)} rad`, label: 'start heading (from +x, anticlockwise)' },
        { sym: '\\Delta t', value: `${g(inst.cmds[0].dt)} s`, label: 'each command is held this long' },
      ];

      // ---------------------------------------------------------------- parts
      const parts: SolvePart[] = [shapePart()];
      steps.forEach((s, i) => {
        const j = i + 1;
        const c = s.cmd;
        const prev = s.from;
        if (s.straight) {
          parts.push(straightPart(j, c));
          parts.push({
            kind: 'numeric',
            id: `dist${j}`,
            label: `Command ${j}: distance driven $v_${j}\\Delta t$`,
            answer: c.v * c.dt,
            unit: 'm',
            tol: 0.002,
            absTol: 0.004,
            marks: 0.5,
          });
        } else {
          parts.push({
            kind: 'numeric',
            id: `r${j}`,
            label: `Command ${j}: radius $r_${j} = v_${j}/\\omega_${j}$ (keep the sign)`,
            answer: s.r,
            unit: 'm',
            tol: 0.002,
            absTol: 0.004,
            traps: keep(s.r, [
              { value: -s.r, message: `Keep the sign: $\\omega_${j}$ ${c.w < 0 ? '< 0' : '> 0'}, so $r_${j}$ ${c.w < 0 ? '< 0 (a clockwise arc)' : '> 0 (anticlockwise)'}.`, trapId: 'vel-radius-sign' },
              { value: c.w / c.v, message: 'Upside down: $r = v/\\omega$ (speed over turn rate).' },
            ]),
            marks: 0.5,
          });
          parts.push({
            kind: 'numeric',
            id: `wdt${j}`,
            label: `Command ${j}: heading change $\\omega_${j}\\Delta t$`,
            answer: s.wdt,
            unit: 'rad',
            tol: 0.002,
            absTol: 0.002,
            traps: keep(s.wdt, [
              { value: s.wdt * DEG, message: 'That is in degrees. Keep angles in radians.', trapId: 'radians' },
              ...(c.dt !== 1 ? [{ value: c.w, message: `Multiply by $\\Delta t$ = ${g(c.dt)} s: the heading turns at $\\omega$ for the whole command.` }] : []),
            ]),
            marks: 0.5,
          });
        }
        // Wrong-but-plausible end poses.
        const deg = degMode(prev, c);
        const noCarry = i > 0 ? velocityMotion({ ...prev, theta: s0.theta }, c.v, c.w, c.dt) : null;
        const absR = !s.straight && c.w < 0 ? velocityMotion(prev, -c.v, c.w, c.dt) : null; // |r| used with ω < 0
        const swapX = s.straight ? prev.x + c.v * c.dt * Math.sin(prev.theta) : prev.x + (c.v / c.w) * Math.sin(prev.theta) - (c.v / c.w) * Math.sin(prev.theta + s.wdt);
        const swapY = s.straight ? prev.y + c.v * c.dt * Math.cos(prev.theta) : prev.y - (c.v / c.w) * Math.cos(prev.theta) + (c.v / c.w) * Math.cos(prev.theta + s.wdt);
        const carryMsg = `Carry the heading: command ${j} starts at $\\theta_${i}$ = ${g(prev.theta)} rad, not $\\theta_0$.`;
        const degMsg = 'Your calculator is in degrees: the angles here are radians.';
        parts.push({
          kind: 'numeric',
          id: `x${j}`,
          label: `Pose after command ${j}: $x_${j}$`,
          answer: s.to.x,
          ...POS,
          traps: keep(s.to.x, [
            { value: deg.x, message: degMsg, trapId: 'radians' },
            ...(noCarry ? [{ value: noCarry.x, message: carryMsg, trapId: 'vel-carry-theta' }] : []),
            ...(absR ? [{ value: absR.x, message: `Keep the sign of $r_${j}$ = ${g(s.r)}: with $\\omega < 0$ the arc bends clockwise.`, trapId: 'vel-radius-sign' }] : []),
            { value: swapX, message: s.straight ? 'Use $\\cos\\theta$ for the x step and $\\sin\\theta$ for y.' : 'Sign slip: $x\' = x - r\\sin\\theta + r\\sin(\\theta + \\omega\\Delta t)$.' },
          ]),
          marks: 1,
        });
        parts.push({
          kind: 'numeric',
          id: `y${j}`,
          label: `Pose after command ${j}: $y_${j}$`,
          answer: s.to.y,
          ...POS,
          traps: keep(s.to.y, [
            { value: deg.y, message: degMsg, trapId: 'radians' },
            ...(noCarry ? [{ value: noCarry.y, message: carryMsg, trapId: 'vel-carry-theta' }] : []),
            ...(absR ? [{ value: absR.y, message: `Keep the sign of $r_${j}$ = ${g(s.r)}: with $\\omega < 0$ the arc bends clockwise.`, trapId: 'vel-radius-sign' }] : []),
            { value: swapY, message: s.straight ? 'Use $\\sin\\theta$ for the y step and $\\cos\\theta$ for x.' : 'Sign slip: $y\' = y + r\\cos\\theta - r\\cos(\\theta + \\omega\\Delta t)$.' },
          ]),
          marks: 1,
        });
        parts.push({
          kind: 'numeric',
          id: `th${j}`,
          label: `Pose after command ${j}: $\\theta_${j}$`,
          answer: s.to.theta,
          ...ANG,
          traps: keep(s.to.theta, [
            ...(Math.abs(prev.theta) > 1e-9 ? [{ value: s.wdt, message: `$\\theta' = \\theta + \\omega\\Delta t$: add the previous heading ${g(prev.theta)} rad.`, trapId: 'vel-carry-theta' }] : []),
            { value: s.to.theta * DEG, message: 'That is in degrees. Keep the heading in radians.', trapId: 'radians' },
          ]),
          marks: 0.5,
        });
      });
      parts.push(checkPart());
      parts.push(suboptPart());
      if (tier >= 2) parts.push(rewirePart());

      // ---------------------------------------------------------------- hints
      const subst = steps
        .map((s, i) => {
          const j = i + 1;
          const th = s.from.theta;
          if (s.straight) return `Command ${j}: $\\omega_${j} = 0$, so drive $v\\Delta t$ = ${g(s.cmd.v)} × ${g(s.cmd.dt)} = ${g(s.cmd.v * s.cmd.dt)} m straight along $\\theta_${i}$ = ${g(th)}: $\\cos\\theta_${i}$ = ${fx(Math.cos(th), 5)}, $\\sin\\theta_${i}$ = ${fx(Math.sin(th), 5)}.`;
          const th2 = th + s.wdt;
          return `Command ${j}: $r_${j}$ = ${g(s.cmd.v)}/${par(s.cmd.w)} = ${g(s.r)} m, $\\omega_${j}\\Delta t$ = ${g(s.wdt)} rad, so $\\theta_${i} + \\omega_${j}\\Delta t$ = ${g(th)} + ${par(s.wdt)} = ${g(th2)}. $\\sin$: ${fx(Math.sin(th), 5)} → ${fx(Math.sin(th2), 5)}; $\\cos$: ${fx(Math.cos(th), 5)} → ${fx(Math.cos(th2), 5)}.`;
        })
        .join('\n\n');
      const worked = steps
        .map((s, i) => {
          const j = i + 1;
          const p = s.from;
          const q = s.to;
          if (s.straight) {
            const L = s.cmd.v * s.cmd.dt;
            return [
              `**Command ${j}** ($\\omega = 0$, straight, ${g(L)} m):`,
              `$$\\begin{aligned} x_${j} &= ${g(p.x)} + ${g(L)}\\cos(${g(p.theta)}) = \\mathbf{${fx(q.x)}}\\ \\text{m} \\\\ y_${j} &= ${g(p.y)} + ${g(L)}\\sin(${g(p.theta)}) = \\mathbf{${fx(q.y)}}\\ \\text{m} \\\\ \\theta_${j} &= \\mathbf{${g(q.theta)}}\\ \\text{rad} \\end{aligned}$$`,
            ].join('\n\n');
          }
          const r = s.r;
          const th2 = p.theta + s.wdt;
          return [
            `**Command ${j}**: $r_${j} = $ **${g(r)} m**, $\\omega_${j}\\Delta t = $ **${g(s.wdt)} rad**.`,
            `$$\\begin{aligned} x_${j} &= ${g(p.x)} - ${par(r)}\\sin(${g(p.theta)}) + ${par(r)}\\sin(${g(th2)}) = \\mathbf{${fx(q.x)}}\\ \\text{m} \\\\ y_${j} &= ${g(p.y)} + ${par(r)}\\cos(${g(p.theta)}) - ${par(r)}\\cos(${g(th2)}) = \\mathbf{${fx(q.y)}}\\ \\text{m} \\\\ \\theta_${j} &= ${g(p.theta)} + ${par(s.wdt)} = \\mathbf{${g(q.theta)}}\\ \\text{rad} \\end{aligned}$$`,
          ].join('\n\n');
        })
        .join('\n\n');
      const last = steps[n - 1].to;
      const hints: [string, string, string, string] = [
        'Holding $(v, \\omega)$ fixed for $\\Delta t$ drives the robot along a **circular arc** of radius $r = v/\\omega$ (clockwise when $\\omega < 0$, straight when $\\omega = 0$). Chain the commands: each starts from the pose, **including the heading**, where the previous one ended.',
        'Velocity motion model with $\\gamma = 0$ and $r = v/\\omega$: $$x\' = x - r\\sin\\theta + r\\sin(\\theta + \\omega\\Delta t)$$ $$y\' = y + r\\cos\\theta - r\\cos(\\theta + \\omega\\Delta t)$$ $$\\theta\' = \\theta + \\omega\\Delta t$$ If $\\omega = 0$: $x\' = x + v\\Delta t\\cos\\theta$, $y\' = y + v\\Delta t\\sin\\theta$, $\\theta\' = \\theta$. Compute $r$ and $\\omega\\Delta t$ first, keep the sign of $r$, use radians.',
        subst,
        [
          '(a) **Circular arcs** of radius $v/\\omega$ (straight when $\\omega = 0$).',
          worked,
          `So after ${g(n * inst.cmds[0].dt)} s the robot is at **(${fx(last.x, 2)}, ${fx(last.y, 2)}) m with heading ${g(last.theta)} rad**.`,
          '(c) **No**: the robot sweeps the whole arc, and an obstacle can lie on it even when both end poses are free. Check the swept path, e.g. poses sampled along the arc at a resolution finer than the smallest obstacle, with the robot’s footprint.',
          '(d) RRT joins each sample to the **nearest** node, ignoring the cost-to-come from the root, and never revises edges, so early jagged branches stay in the tree.',
          ...(tier >= 2 ? ['(e) To $x_{new}$: parent $= \\arg\\min c(x_{near}) + d(x_{near}, x_{new})$. From $x_{new}$: rewire $x_{near}$ if $c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$.'] : []),
        ].join('\n\n'),
      ];

      return {
        prompt,
        givens,
        figure: steerFigure(inst.start, steps.map((s) => ({ from: s.from, to: s.to, v: s.cmd.v, w: s.cmd.w, dt: s.cmd.dt }))),
        parts,
        hints,
      };
    },
  },
];

/** For the self-tests: the random instance behind a seed, and the degrees-mode trap. */
export const _internal = { degMode, makeInstance };
