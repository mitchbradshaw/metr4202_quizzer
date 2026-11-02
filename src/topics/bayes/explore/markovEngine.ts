// Engine behind the Markov-assumption demo (markov): a robot drives along a line of cells while a histogram
// (Bayes) filter tracks it from noisy position readings. In the "heat" world the sensor's noise grows as it warms
// up; in the "motor" world the motor wears out so the robot covers less ground each step. A filter whose state is
// the position alone keeps using the cold-sensor / new-motor model: its belief stays narrow while the truth drifts
// out of it (overconfident and wrong). Adding the hidden variable (temperature, motor health) to the state gives the
// filter the right model at every step and it stays consistent. In the "random" world all noise is memoryless and
// the position-only filter is already right. Pure and deterministic (seeded), so the self-tests can check it.
import { mulberry32 } from '../../../engine/rng';

export type MarkovMode = 'random' | 'heat' | 'motor';

export const N_CELLS = 90;
export const STEPS = 60;
export const START = 8;

/** p(stay), p(+1 cell), p(+2 cells) for one "move right" command. */
export type Kernel = [number, number, number];

const HEALTHY: Kernel = [0.1, 0.8, 0.1];
const GUSTY: Kernel = [0.15, 0.7, 0.15];
const TAU_HEAT = 15;
const TAU_WEAR = 30;
export const SIGMA_COLD = 1;
export const SIGMA_HOT = 7;
export const SIGMA_FIXED = 2.5;

/** Sensor temperature (°C) after t steps of running: warms from 20 °C towards 80 °C. */
export const temperature = (t: number) => 20 + 60 * (1 - Math.exp(-t / TAU_HEAT));
/** Motor health (fraction of the commanded motion actually delivered on average), wearing from 1 towards 0. */
export const health = (t: number) => Math.exp(-t / TAU_WEAR);

/** The world's true sensor noise at step t (cells). */
export function sigmaTrue(mode: MarkovMode, t: number): number {
  if (mode === 'heat') return SIGMA_COLD + ((SIGMA_HOT - SIGMA_COLD) * (temperature(t) - 20)) / 60;
  return SIGMA_FIXED;
}

/** The world's true motion at step t. A worn motor stalls (stays put) with probability 1 − health. */
export function kernelTrue(mode: MarkovMode, t: number): Kernel {
  if (mode === 'random') return GUSTY;
  if (mode === 'heat') return HEALTHY;
  const h = health(t);
  return [HEALTHY[0] * h + (1 - h), HEALTHY[1] * h, HEALTHY[2] * h];
}

/** The models a filter uses: position only (the hidden variable frozen at its starting value) or position + hidden. */
function filterModel(mode: MarkovMode, augmented: boolean, t: number): { kernel: Kernel; sigma: number } {
  if (augmented) return { kernel: kernelTrue(mode, t), sigma: sigmaTrue(mode, t) };
  return { kernel: kernelTrue(mode, 0), sigma: sigmaTrue(mode, 0) };
}

export function predict(bel: readonly number[], k: Kernel): number[] {
  const n = bel.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const b = bel[i];
    if (!b) continue;
    for (let d = 0; d < 3; d++) out[Math.min(n - 1, i + d)] += b * k[d];
  }
  return out;
}

/** Correction with a Gaussian position sensor, in log space so that a far-off reading cannot underflow to 0. */
export function correct(bel: readonly number[], z: number, sigma: number): number[] {
  const lw = bel.map((b, i) => (b > 0 ? Math.log(b) - ((z - i) * (z - i)) / (2 * sigma * sigma) : -Infinity));
  const m = Math.max(...lw);
  if (!Number.isFinite(m)) return bel.slice();
  const w = lw.map((v) => (Number.isFinite(v) ? Math.exp(v - m) : 0));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / s);
}

/** The smallest set of cells holding ≥ 95 % of the belief (most probable cells first). */
export function credibleSet(bel: readonly number[], mass = 0.95): Set<number> {
  const idx = bel.map((_, i) => i).sort((a, b) => bel[b] - bel[a]);
  const out = new Set<number>();
  let acc = 0;
  for (const i of idx) {
    if (acc >= mass) break;
    out.add(i);
    acc += bel[i];
  }
  return out;
}

export interface Track {
  /** Belief after each step (index 0 = start). */
  bel: number[][];
  mean: number[];
  sd: number[];
  /** Whether the true cell is inside the filter's 95 % set at each step. */
  inside: boolean[];
  /** The model noise the filter used at each step (cells). */
  sigma: number[];
}

export interface MarkovRun {
  mode: MarkovMode;
  seed: number;
  truth: number[];
  /** Reading at each step (index 0 has none). */
  z: number[];
  sTrue: number[];
  temp: number[];
  health: number[];
  naive: Track;
  aug: Track;
}

function stats(bel: readonly number[]) {
  let mean = 0;
  for (let i = 0; i < bel.length; i++) mean += i * bel[i];
  let v = 0;
  for (let i = 0; i < bel.length; i++) v += (i - mean) * (i - mean) * bel[i];
  return { mean, sd: Math.sqrt(v) };
}

function startBelief(): number[] {
  const b = Array.from({ length: N_CELLS }, (_, i) => Math.exp(-((i - START) ** 2) / 2));
  const s = b.reduce((a, x) => a + x, 0);
  return b.map((x) => x / s);
}

/** Simulate one world and run both filters on the same readings. */
export function runMarkov(mode: MarkovMode, seed: number, steps = STEPS): MarkovRun {
  const rnd = mulberry32(seed >>> 0);
  const gauss = () => {
    const u = Math.max(1e-12, rnd());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const truth = [START];
  const z = [NaN];
  const sTrue = [sigmaTrue(mode, 0)];
  const temp = [temperature(0)];
  const hl = [health(0)];
  const mk = (): Track => {
    const b = startBelief();
    const s = stats(b);
    return { bel: [b], mean: [s.mean], sd: [s.sd], inside: [true], sigma: [NaN] };
  };
  const naive = mk();
  const aug = mk();
  for (let t = 1; t <= steps; t++) {
    const k = kernelTrue(mode, t);
    const u = rnd();
    const d = u < k[0] ? 0 : u < k[0] + k[1] ? 1 : 2;
    const x = Math.min(N_CELLS - 1, truth[t - 1] + d);
    const st = sigmaTrue(mode, t);
    const zt = Math.max(0, Math.min(N_CELLS - 1, Math.round(x + st * gauss())));
    truth.push(x);
    z.push(zt);
    sTrue.push(st);
    temp.push(temperature(t));
    hl.push(health(t));
    for (const [tr, isAug] of [
      [naive, false],
      [aug, true],
    ] as const) {
      const m = filterModel(mode, isAug, t);
      const b = correct(predict(tr.bel[t - 1], m.kernel), zt, m.sigma);
      const s = stats(b);
      tr.bel.push(b);
      tr.mean.push(s.mean);
      tr.sd.push(s.sd);
      tr.inside.push(credibleSet(b).has(x));
      tr.sigma.push(m.sigma);
    }
  }
  return { mode, seed, truth, z, sTrue, temp, health: hl, naive, aug };
}

/** Fraction of steps 1…upTo whose truth lies inside the 95 % set (a consistent filter: about 0.95). */
export function coverage(tr: Track, upTo = tr.inside.length - 1, from = 1): number {
  let k = 0;
  let n = 0;
  for (let t = from; t <= upTo; t++) {
    n++;
    if (tr.inside[t]) k++;
  }
  return n ? k / n : NaN;
}

/** Root-mean-square distance between the belief mean and the truth over steps from…upTo (cells). */
export function rmsError(tr: Track, truth: readonly number[], upTo = truth.length - 1, from = 1): number {
  let s = 0;
  let n = 0;
  for (let t = from; t <= upTo; t++) {
    s += (tr.mean[t] - truth[t]) ** 2;
    n++;
  }
  return n ? Math.sqrt(s / n) : NaN;
}

/** Mean of the filter's own standard deviation over steps from…upTo (cells): how sure it claims to be. */
export function meanSd(tr: Track, upTo = tr.sd.length - 1, from = 1): number {
  let s = 0;
  let n = 0;
  for (let t = from; t <= upTo; t++) {
    s += tr.sd[t];
    n++;
  }
  return n ? s / n : NaN;
}

// ------------------------------------------------------------------ scenario cards

export interface MarkovCard {
  id: string;
  title: string;
  text: string;
  breaks: boolean;
  why: string;
  /** The demo world that shows it (none for a card the demo cannot show). */
  demo?: MarkovMode;
  source?: string;
}

export const MARKOV_CARDS: MarkovCard[] = [
  {
    id: 'slip',
    title: 'Random wheel slip',
    text: 'Now and then a wheel slips and a move falls short, at random, independently of earlier moves.',
    breaks: false,
    why: 'Memoryless noise: the chance of a slip is the same at every step, so $p(x_t \\mid u_t, x_{t-1})$ already describes it. The Bayes filter is built for exactly this.',
    demo: 'random',
    source: '2023 Q2, 2024 Q2 options',
  },
  {
    id: 'noise',
    title: 'Random sensor noise',
    text: 'Every reading has fresh Gaussian noise of the same size, independent of the previous readings.',
    breaks: false,
    why: 'Each reading depends only on the current position plus independent noise: $p(z_t \\mid x_t)$ is fixed and the past adds nothing.',
    demo: 'random',
    source: '2023 Q2 options',
  },
  {
    id: 'gust',
    title: 'Random gusts of wind',
    text: 'Gusts push the robot sideways at random moments, each gust independent of the last.',
    breaks: false,
    why: 'Random, independent disturbances are just more motion noise: widen the motion model and the state still summarises the past.',
    demo: 'random',
    source: '2023 Q2, 2024 Q2 options',
  },
  {
    id: 'heat',
    title: 'Sensor noise grows as it heats up',
    text: 'The longer the sensor runs, the hotter it gets and the noisier its readings become.',
    breaks: true,
    why: 'The noise now depends on how long the sensor has been running, which is history not in $x_t$. So $p(z_t \\mid x_t)$ is no longer the same given only $x_t$. Fix: put the temperature in the state.',
    demo: 'heat',
    source: '2023 Q2 (answer d)',
  },
  {
    id: 'motor',
    title: 'Motor performance decays over time',
    text: 'The drive motor wears, so the same command moves the robot a little less each time.',
    breaks: true,
    why: 'The outcome of a command depends on how far the robot has already driven: $p(x_t \\mid u_t, x_{t-1})$ changes with the past. Fix: add motor health (wear) to the state and estimate it.',
    demo: 'motor',
    source: '2024 Q2 (answer c)',
  },
  {
    id: 'battery',
    title: 'An unmodelled battery level',
    text: 'Speed drops as the battery drains, but the state is only the robot’s position.',
    breaks: true,
    why: 'The battery level carries the effect of every past move into the future, yet it is not in the state, so the past still matters once $x_t$ is known. Fix: put the battery level in the state.',
    demo: 'motor',
    source: 'Summary notes §1',
  },
  {
    id: 'people',
    title: 'People blocking the laser for several scans',
    text: 'A person walks in front of the range sensor and blocks it for a few consecutive readings.',
    breaks: true,
    why: 'The errors are now correlated in time: if the last scan was blocked, the next one probably is too. The person is unmodelled dynamics of the world, missing from the state, so past readings predict future ones.',
    source: 'Thrun, Probabilistic Robotics §2.4.4 (unmodelled dynamics)',
  },
];
