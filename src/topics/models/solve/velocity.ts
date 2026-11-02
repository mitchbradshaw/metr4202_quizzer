// models-velocity: the velocity motion model by hand (review deck question; 2023 Q32(b); summary notes §3).
// Tier 1: one arc (review-deck style). Tier 2: one arc from a turned start, or two arcs of opposite turn
// (2023 style). Tier 3: a twist: an ω = 0 straight leg, a final rotation γ ≠ 0, two clockwise arcs, or a turn on
// the spot (v = 0) before an arc. Parts: r = v/ω and ωΔt first, then x′, y′, θ′ for every command.
import type { ChoicePart, Given, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { velocityMotion, type Pose } from '../../../core/motion';
import { ANG, POS, keep, type Trap } from './common';
import { velocityFigure } from './figures';
import { DEG, fx, g, par } from '../explore/modelsFmt';

export interface VCmd {
  v: number;
  w: number;
  dt: number;
  /** γ, the final rotation rate (rad/s). */
  g: number;
}

export interface VStep {
  cmd: VCmd;
  from: Pose;
  to: Pose;
  kind: 'arc' | 'straight' | 'spin';
  /** Signed radius v/ω (Infinity when ω = 0). */
  r: number;
  /** Heading change ωΔt (rad). */
  wdt: number;
}

/** The solver: apply each command from the pose (heading included) where the previous one ended. */
export function velocitySteps(start: Pose, cmds: readonly VCmd[]): VStep[] {
  const out: VStep[] = [];
  let p = start;
  for (const c of cmds) {
    const to = velocityMotion(p, c.v, c.w, c.dt, c.g);
    const kind = c.w === 0 ? 'straight' : c.v === 0 ? 'spin' : 'arc';
    out.push({ cmd: c, from: p, to, kind, r: c.w === 0 ? Infinity : c.v / c.w, wdt: c.w * c.dt });
    p = to;
  }
  return out;
}

// ------------------------------------------------------------------ random instances

const VS = [0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5];
const WS = [0.02, 0.03, 0.04, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5];
const DTS = [1, 1.5, 2, 2.5, 3, 4];
const TH0 = [0.2, 0.3, 0.5, -0.4, 0.6, 1, -0.8, 0.25];

function arcCmd(rng: Rng, sign: 1 | -1, dt?: number): VCmd {
  let fallback: VCmd | null = null;
  for (let k = 0; k < 80; k++) {
    const v = rng.pick(VS);
    const w = sign * rng.pick(WS);
    const d = dt ?? rng.pick(DTS);
    const turn = Math.abs(w * d);
    if (turn < 0.05 || turn > 1.3 || Math.abs(v / w) > 30) continue;
    const c = { v, w, dt: d, g: 0 };
    const r100 = (v / w) * 100;
    if (Math.abs(r100 - Math.round(r100)) < 1e-6) return c;
    fallback ??= c;
  }
  return fallback ?? { v: 1, w: sign * 0.2, dt: dt ?? 2, g: 0 };
}

export type VTwist = 'none' | 'zero' | 'gamma' | 'neg' | 'spin';

export interface VInstance {
  start: Pose;
  cmds: VCmd[];
  twist: VTwist;
}

export function makeVelocity(rng: Rng, tier: Tier): VInstance {
  const xy = () => ({ x: rng.step(-3, 3, 0.1), y: rng.step(-3, 3, 0.1) });
  if (tier === 1) {
    const start = rng.chance(0.65) ? { x: 0, y: 0, theta: 0 } : { ...xy(), theta: 0 };
    return { start, cmds: [arcCmd(rng, rng.chance(0.75) ? 1 : -1)], twist: 'none' };
  }
  if (tier === 2) {
    if (rng.chance(0.5)) return { start: { ...xy(), theta: rng.pick(TH0) }, cmds: [arcCmd(rng, rng.chance(0.6) ? 1 : -1)], twist: 'none' };
    const dt = rng.pick([1, 1.5, 2, 2.5]);
    const s: 1 | -1 = rng.chance(0.7) ? 1 : -1;
    return { start: { ...xy(), theta: 0 }, cmds: [arcCmd(rng, s, dt), arcCmd(rng, s === 1 ? -1 : 1, dt)], twist: 'none' };
  }
  const twist = rng.pick(['zero', 'gamma', 'neg', 'spin'] as const);
  const start = { ...xy(), theta: rng.pick(TH0) };
  const dt = rng.pick([1, 1.5, 2, 2.5]);
  if (twist === 'zero') {
    const line: VCmd = { v: rng.pick([0.4, 0.5, 0.6, 0.8, 1, 1.2]), w: 0, dt, g: 0 };
    const arc = arcCmd(rng, rng.chance(0.5) ? 1 : -1, dt);
    return { start, cmds: rng.chance(0.5) ? [arc, line] : [line, arc], twist };
  }
  if (twist === 'gamma') {
    const c = arcCmd(rng, rng.chance(0.5) ? 1 : -1, dt);
    return { start, cmds: [{ ...c, g: (rng.chance(0.5) ? 1 : -1) * rng.pick([0.05, 0.1, 0.15, 0.2]) }], twist };
  }
  if (twist === 'neg') return { start, cmds: [arcCmd(rng, -1, dt), arcCmd(rng, -1, dt)], twist };
  const spin: VCmd = { v: 0, w: (rng.chance(0.5) ? 1 : -1) * rng.pick([0.3, 0.4, 0.5, 0.6, 0.8]), dt, g: 0 };
  return { start, cmds: [spin, arcCmd(rng, rng.chance(0.5) ? 1 : -1, dt)], twist };
}

// ------------------------------------------------------------------ wrong-but-plausible poses

function degMode(p: Pose, c: VCmd): Pose {
  const s = (a: number) => Math.sin(a / DEG);
  const co = (a: number) => Math.cos(a / DEG);
  if (c.w === 0) return { x: p.x + c.v * c.dt * co(p.theta), y: p.y + c.v * c.dt * s(p.theta), theta: p.theta + c.g * c.dt };
  const r = c.v / c.w;
  const th = p.theta + c.w * c.dt;
  return { x: p.x - r * s(p.theta) + r * s(th), y: p.y + r * co(p.theta) - r * co(th), theta: th + c.g * c.dt };
}

// ------------------------------------------------------------------ parts

function straightChoice(j: number, label: string, c: VCmd): ChoicePart {
  return {
    kind: 'choice',
    id: `straight${j}`,
    label: `${label}$\\omega = 0$. How does the pose change?`,
    options: [
      {
        text: "In a straight line: $x' = x + v\\Delta t\\cos\\theta$, $y' = y + v\\Delta t\\sin\\theta$, $\\theta' = \\theta$",
        correct: true,
        why: `With no turning the robot drives ${g(c.v * c.dt)} m along its heading: the limit of the arc as $r = v/\\omega \\to \\infty$.`,
      },
      { text: 'Use the arc formula with $\\omega = 0$', correct: false, why: '$v/\\omega$ divides by zero: the radius is infinite, which is the straight line.' },
      { text: 'It turns on the spot by $\\omega\\Delta t$', correct: false, why: 'Turning on the spot is $v = 0$. Here $\\omega = 0$: it drives straight without turning.' },
      { text: 'It does not move', correct: false, why: 'Only $v = 0$ and $\\omega = 0$ together keep it still; here $v$ = ' + g(c.v) + ' m/s.' },
    ],
    marks: 0.5,
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'models-velocity',
    title: 'Velocity motion model by hand',
    summary: 'Find $r = v/\\omega$ and $\\omega\\Delta t$, then the pose $(x\', y\', \\theta\')$ after one or two velocity commands, carrying the heading and keeping the sign of $r$.',
    tiers: [1, 2, 3],
    source: 'Similar to the review deck’s velocity-model question and 2023 Q32(b); summary notes §3',
    cardId: 'models-velocity',
    marks: 6,
    generate(rng, tier) {
      const inst = makeVelocity(rng, tier);
      const steps = velocitySteps(inst.start, inst.cmds);
      const n = steps.length;
      const s0 = inst.start;
      const cmdTeX = steps
        .map((s, i) => {
          const c = s.cmd;
          const sub = n > 1 ? `_${i + 1}` : '';
          return `(v${sub}, \\omega${sub}, \\gamma${sub}) = (${g(c.v)}\\ \\text{m/s},\\ ${g(c.w)}\\ \\text{rad/s},\\ ${g(c.g)}\\ \\text{rad/s})`;
        })
        .join(',\\quad ');
      const prompt = [
        `A differential-drive robot moves with the velocity motion model (perfect actuation). It starts at $(x, y)$ = $(${g(s0.x)}, ${g(s0.y)})$ m with heading $\\theta$ = ${g(s0.theta)} rad. ${n === 1 ? 'It is commanded' : 'Two commands are executed one after the other'}${n === 1 ? '' : ', each'} for $\\Delta t$ = ${g(inst.cmds[0].dt)} s:`,
        `$$${cmdTeX}$$`,
        `Work in radians${n > 1 ? ' and start the second command from the pose where the first ended' : ''}. Give lengths to 3 decimal places.`,
      ].join('\n\n');
      const givens: Given[] = [
        { sym: '(x, y, \\theta)', value: `(${g(s0.x)} m, ${g(s0.y)} m, ${g(s0.theta)} rad)`, label: 'start pose' },
        { sym: '\\Delta t', value: `${g(inst.cmds[0].dt)} s`, label: n > 1 ? 'each command is held this long' : 'how long the command is held' },
      ];

      const parts: SolvePart[] = [];
      steps.forEach((s, i) => {
        const j = i + 1;
        const c = s.cmd;
        const prev = s.from;
        const L = n > 1 ? `Command ${j}: ` : '';
        const sub = n > 1 ? `_${j}` : '';
        if (s.kind === 'straight') parts.push(straightChoice(j, L, c));
        else {
          parts.push({
            kind: 'numeric',
            id: `r${j}`,
            label: `${L}radius $r${sub} = v${sub}/\\omega${sub}$ (keep the sign)`,
            answer: s.r,
            ...POS,
            traps: keep(s.r, [
              ...(s.r !== 0 ? [{ value: -s.r, message: `Keep the sign: $\\omega${sub}$ ${c.w < 0 ? '< 0, so r < 0 (a clockwise arc)' : '> 0, so r > 0'}.`, trapId: 'radius-sign' }] : []),
              ...(c.v !== 0 ? [{ value: c.w / c.v, message: 'Upside down: $r = v/\\omega$ (speed over turn rate).' }] : []),
            ]),
            marks: 0.5,
          });
          parts.push({
            kind: 'numeric',
            id: `wdt${j}`,
            label: `${L}heading change $\\omega${sub}\\Delta t$`,
            answer: s.wdt,
            ...ANG,
            traps: keep(s.wdt, [
              { value: s.wdt * DEG, message: 'That is in degrees. Keep angles in radians.', trapId: 'radians' },
              ...(c.dt !== 1 ? [{ value: c.w, message: `Multiply by $\\Delta t$ = ${g(c.dt)} s: the heading turns at $\\omega$ for the whole command.` }] : []),
            ]),
            marks: 0.5,
          });
        }
        const deg = degMode(prev, c);
        const noCarry = i > 0 && Math.abs(prev.theta - s0.theta) > 1e-9 ? velocityMotion({ ...prev, theta: s0.theta }, c.v, c.w, c.dt, c.g) : null;
        const absR = s.kind === 'arc' && c.w < 0 ? velocityMotion(prev, -c.v, c.w, c.dt, c.g) : null;
        const gammaIn = c.g !== 0 && s.kind !== 'straight' ? velocityMotion(prev, c.v, c.w + c.g, c.dt) : null;
        const mirror = s.kind === 'arc' ? { x: prev.x + s.r * Math.sin(prev.theta) - s.r * Math.sin(prev.theta + s.wdt), y: prev.y - s.r * Math.cos(prev.theta) + s.r * Math.cos(prev.theta + s.wdt) } : null;
        const swapped = s.kind === 'straight' ? { x: prev.x + c.v * c.dt * Math.sin(prev.theta), y: prev.y + c.v * c.dt * Math.cos(prev.theta) } : null;
        const carryMsg = `Carry the heading: command ${j} starts at $\\theta_${i}$ = ${g(prev.theta)} rad, not $\\theta_0$.`;
        const degMsg = 'Your calculator is in degrees: the angles here are radians.';
        const xTraps: Trap[] = [
          { value: deg.x, message: degMsg, trapId: 'radians' },
          ...(noCarry ? [{ value: noCarry.x, message: carryMsg, trapId: 'carry-theta' }] : []),
          ...(absR ? [{ value: absR.x, message: `Keep the sign of $r${sub}$ = ${g(s.r)}: with $\\omega < 0$ the arc bends clockwise.`, trapId: 'radius-sign' }] : []),
          ...(gammaIn ? [{ value: gammaIn.x, message: '$\\gamma$ does not bend the arc: it is a final rotation, added to $\\theta\'$ only.', trapId: 'models-gamma' }] : []),
          ...(mirror ? [{ value: mirror.x, message: "Sign slip: $x' = x - r\\sin\\theta + r\\sin(\\theta + \\omega\\Delta t)$." }] : []),
          ...(swapped ? [{ value: swapped.x, message: 'Use $\\cos\\theta$ for the x step and $\\sin\\theta$ for y.' }] : []),
        ];
        const yTraps: Trap[] = [
          { value: deg.y, message: degMsg, trapId: 'radians' },
          ...(noCarry ? [{ value: noCarry.y, message: carryMsg, trapId: 'carry-theta' }] : []),
          ...(absR ? [{ value: absR.y, message: `Keep the sign of $r${sub}$ = ${g(s.r)}: with $\\omega < 0$ the arc bends clockwise.`, trapId: 'radius-sign' }] : []),
          ...(gammaIn ? [{ value: gammaIn.y, message: '$\\gamma$ does not bend the arc: it is a final rotation, added to $\\theta\'$ only.', trapId: 'models-gamma' }] : []),
          ...(mirror ? [{ value: mirror.y, message: "Sign slip: $y' = y + r\\cos\\theta - r\\cos(\\theta + \\omega\\Delta t)$." }] : []),
          ...(swapped ? [{ value: swapped.y, message: 'Use $\\sin\\theta$ for the y step and $\\cos\\theta$ for x.' }] : []),
        ];
        if (s.kind === 'spin') {
          const spinMsg = 'With $v = 0$ the robot turns on the spot: its position does not change.';
          xTraps.push({ value: prev.x + c.w * c.dt, message: spinMsg, trapId: 'models-spin' });
          yTraps.push({ value: prev.y + c.w * c.dt, message: spinMsg, trapId: 'models-spin' });
        }
        parts.push({ kind: 'numeric', id: `x${j}`, label: `${L}$x'${sub}$`, answer: s.to.x, ...POS, traps: keep(s.to.x, xTraps), marks: 1 });
        parts.push({ kind: 'numeric', id: `y${j}`, label: `${L}$y'${sub}$`, answer: s.to.y, ...POS, traps: keep(s.to.y, yTraps), marks: 1 });
        parts.push({
          kind: 'numeric',
          id: `th${j}`,
          label: `${L}$\\theta'${sub}$ (radians, not wrapped)`,
          answer: s.to.theta,
          ...ANG,
          traps: keep(s.to.theta, [
            ...(Math.abs(prev.theta) > 1e-9 && s.kind !== 'straight' ? [{ value: s.wdt + c.g * c.dt, message: `$\\theta' = \\theta + \\omega\\Delta t + \\gamma\\Delta t$: add the previous heading ${g(prev.theta)} rad.`, trapId: 'carry-theta' }] : []),
            ...(c.g !== 0 ? [{ value: prev.theta + s.wdt, message: `Add the final rotation $\\gamma\\Delta t$ = ${g(c.g * c.dt)} rad.`, trapId: 'models-gamma' }] : []),
            { value: s.to.theta * DEG, message: 'That is in degrees. Keep the heading in radians.', trapId: 'radians' },
          ]),
          marks: 0.5,
        });
      });

      // ---------------------------------------------------------------- hints
      const subst = steps
        .map((s, i) => {
          const j = i + 1;
          const c = s.cmd;
          const th = s.from.theta;
          const pre = n > 1 ? `Command ${j}: ` : '';
          if (s.kind === 'straight')
            return `${pre}$\\omega = 0$, so drive $v\\Delta t$ = ${g(c.v)} × ${g(c.dt)} = ${g(c.v * c.dt)} m straight along $\\theta$ = ${g(th)} rad: $\\cos\\theta$ = ${fx(Math.cos(th), 5)}, $\\sin\\theta$ = ${fx(Math.sin(th), 5)}.`;
          if (s.kind === 'spin') return `${pre}$v = 0$, so $r$ = 0: the position stays at (${g(s.from.x)}, ${g(s.from.y)}) and the heading turns by $\\omega\\Delta t$ = ${par(c.w)} × ${g(c.dt)} = ${g(s.wdt)} rad.`;
          const th2 = th + s.wdt;
          return `${pre}$r$ = ${g(c.v)}/${par(c.w)} = ${g(s.r)} m, $\\omega\\Delta t$ = ${par(c.w)} × ${g(c.dt)} = ${g(s.wdt)} rad, so $\\theta + \\omega\\Delta t$ = ${g(th)} + ${par(s.wdt)} = ${g(th2)} rad. $\\sin$: ${fx(Math.sin(th), 5)} → ${fx(Math.sin(th2), 5)}; $\\cos$: ${fx(Math.cos(th), 5)} → ${fx(Math.cos(th2), 5)}.${c.g ? ` Final rotation $\\gamma\\Delta t$ = ${par(c.g)} × ${g(c.dt)} = ${g(c.g * c.dt)} rad (heading only).` : ''}`;
        })
        .join('\n\n');
      const worked = steps
        .map((s, i) => {
          const j = i + 1;
          const p = s.from;
          const q = s.to;
          const c = s.cmd;
          const pre = n > 1 ? `**Command ${j}**` : '**The command**';
          if (s.kind === 'straight') {
            const L = c.v * c.dt;
            return [
              `${pre} ($\\omega = 0$: straight, ${g(L)} m):`,
              `$$\\begin{aligned} x' &= ${g(p.x)} + ${g(L)}\\cos(${g(p.theta)}) = \\mathbf{${fx(q.x)}}\\ \\text{m} \\\\ y' &= ${g(p.y)} + ${g(L)}\\sin(${g(p.theta)}) = \\mathbf{${fx(q.y)}}\\ \\text{m} \\\\ \\theta' &= \\mathbf{${g(q.theta)}}\\ \\text{rad} \\end{aligned}$$`,
            ].join('\n\n');
          }
          if (s.kind === 'spin')
            return [
              `${pre} ($v = 0$: $r = 0$, a turn on the spot):`,
              `$$\\begin{aligned} x' &= ${g(p.x)} - 0 + 0 = \\mathbf{${fx(q.x)}}\\ \\text{m} \\\\ y' &= \\mathbf{${fx(q.y)}}\\ \\text{m} \\\\ \\theta' &= ${g(p.theta)} + ${par(s.wdt)} = \\mathbf{${g(q.theta)}}\\ \\text{rad} \\end{aligned}$$`,
            ].join('\n\n');
          const r = s.r;
          const th2 = p.theta + s.wdt;
          return [
            `${pre}: $r$ = **${g(r)} m**, $\\omega\\Delta t$ = **${g(s.wdt)} rad**.`,
            `$$\\begin{aligned} x' &= ${g(p.x)} - ${par(r)}\\sin(${g(p.theta)}) + ${par(r)}\\sin(${g(th2)}) = \\mathbf{${fx(q.x)}}\\ \\text{m} \\\\ y' &= ${g(p.y)} + ${par(r)}\\cos(${g(p.theta)}) - ${par(r)}\\cos(${g(th2)}) = \\mathbf{${fx(q.y)}}\\ \\text{m} \\\\ \\theta' &= ${g(p.theta)} + ${par(s.wdt)}${c.g ? ` + ${par(c.g * c.dt)}` : ''} = \\mathbf{${g(q.theta)}}\\ \\text{rad} \\end{aligned}$$`,
          ].join('\n\n');
        })
        .join('\n\n');
      const last = steps[n - 1].to;
      const twistNote: Record<VTwist, string> = {
        none: '',
        zero: ' One command has $\\omega = 0$: that is a straight line, not the arc formula.',
        gamma: ' Here $\\gamma \\neq 0$: it adds $\\gamma\\Delta t$ to the heading only.',
        neg: ' Both commands turn clockwise ($\\omega < 0$), so both radii are negative.',
        spin: ' The first command has $v = 0$: a turn on the spot ($r = 0$).',
      };
      const hints: [string, string, string, string] = [
        `Holding $(v, \\omega)$ for $\\Delta t$ drives the robot along a **circular arc** of radius $r = v/\\omega$ round the centre $(x - r\\sin\\theta,\\ y + r\\cos\\theta)$; the heading turns by exactly $\\omega\\Delta t$. Negative $\\omega$ means a clockwise arc and a negative $r$; $\\omega = 0$ is a straight line; $v = 0$ is a turn on the spot.${twistNote[inst.twist]}`,
        `Velocity motion model with $r = v/\\omega$: $$x' = x - r\\sin\\theta + r\\sin(\\theta + \\omega\\Delta t)$$ $$y' = y + r\\cos\\theta - r\\cos(\\theta + \\omega\\Delta t)$$ $$\\theta' = \\theta + \\omega\\Delta t + \\gamma\\Delta t$$ If $\\omega = 0$: $x' = x + v\\Delta t\\cos\\theta$, $y' = y + v\\Delta t\\sin\\theta$. Compute $r$ and $\\omega\\Delta t$ first, keep the sign of $r$, use radians${n > 1 ? ', and carry each end heading into the next command' : ''}.`,
        subst,
        [worked, `So the robot ends at **(${fx(last.x, 3)}, ${fx(last.y, 3)}) m with heading ${g(last.theta)} rad**.`].join('\n\n'),
      ];

      return { prompt, givens, figure: velocityFigure(inst.start, inst.cmds), parts, hints };
    },
  },
];

/** For the self-tests. */
export const _internal = { degMode, makeVelocity };
