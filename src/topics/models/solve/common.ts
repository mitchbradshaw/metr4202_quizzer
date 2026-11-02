// Shared pieces for the models exam-mode generators: the topic's named traps, a trap filter and tolerances.
import { registerTraps } from '../../../engine/traps';

registerTraps([
  { id: 'models-gamma', title: 'γ adds a final rotation: θ′ = θ + ωΔt + γΔt', detail: 'The final rotation $\\gamma$ changes only the heading, never $x\'$ or $y\'$.' },
  { id: 'models-spin', title: 'v = 0 is a turn on the spot', detail: 'With $v = 0$ the radius $r = v/\\omega = 0$: the position stays put and only $\\theta$ changes by $\\omega\\Delta t$.' },
  { id: 'odo-rot1-heading', title: 'δrot1 is measured from the old heading', detail: '$\\delta_{rot1} = \\operatorname{atan2}(\\bar y\' - \\bar y, \\bar x\' - \\bar x) - \\bar\\theta$: subtract the heading the robot had before it moved.' },
  { id: 'odo-rot2', title: 'δrot2 = θ̄′ − θ̄ − δrot1', detail: 'The two rotations together make up the whole change of heading, so subtract $\\delta_{rot1}$.' },
  { id: 'angle-wrap', title: 'Wrap angle differences to (−π, π]', detail: 'A heading change from 3.0 to −3.0 rad is +0.28 rad, not −6.0 rad: add or subtract $2\\pi$.' },
  { id: 'atan-quadrant', title: 'Use atan2, not atan(dy/dx)', detail: 'atan(dy/dx) loses the quadrant when $dx < 0$: it is off by $\\pi$.' },
  { id: 'odo-frame', title: 'Apply the increments from the robot’s own pose', detail: 'The odometry increments are relative: rotate by $\\delta_{rot1}$ from the NEW start heading $\\theta$, not the odometry frame’s $\\bar\\theta$.' },
  { id: 'beam-normaliser', title: 'p_short needs its normaliser η = 1/(1 − e^{−λz*})', detail: 'The exponential is cut off at $z^*$, so it must be rescaled to integrate to 1.' },
  { id: 'beam-weights', title: 'Weight each part before adding', detail: '$p(z) = z_{hit}p_{hit} + z_{short}p_{short} + z_{max}p_{max} + z_{rand}p_{rand}$: multiply each density by its weight.' },
  { id: 'beam-short-range', title: 'p_short is zero beyond z*', detail: 'An unexpected object can only be in front of the mapped obstacle: $p_{short}(z) = 0$ for $z > z^*$.' },
]);

export type Trap = { value: number; message: string; trapId?: string };

/** Drop traps that are (nearly) equal to the answer or to each other, so a rounded right answer is never refused. */
export function keep(answer: number, list: Trap[], rel = 0.012, abs = 0.008): Trap[] {
  const out: Trap[] = [];
  for (const t of list) {
    if (!Number.isFinite(t.value)) continue;
    if (Math.abs(t.value - answer) <= Math.max(rel * Math.abs(answer), abs)) continue;
    if (out.some((o) => Math.abs(o.value - t.value) <= Math.max(1e-3, 1e-3 * Math.abs(t.value)))) continue;
    out.push(t);
  }
  return out;
}

/** Lengths and positions: ±1 % or ±0.005 m (accepts the 2-decimal rounding the papers use). */
export const POS = { unit: 'm', tol: 0.01, absTol: 0.005 } as const;
/** Angles in radians: ±1 % or ±0.005 rad. */
export const ANG = { unit: 'rad', tol: 0.01, absTol: 0.005 } as const;
