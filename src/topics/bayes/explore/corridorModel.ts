// Model behind the corridor simulation (grid1d): corridor presets, a hidden robot, and one snapshot per step of
// the Bayes filter (predict or correct), each holding the pieces the simulation animates. Pure (no React), so the
// self-tests can check every claim the simulation's predictions make.
import {
  correctCorridor,
  predictCorridor,
  sampleMove,
  sampleReading,
  shiftCell,
  shiftsOf,
  uniform,
  type CorridorEnds,
  type DoorReading,
  type DoorSensor,
  type MotionNoise,
  type Shift,
} from '../../../core/bayes1d';

export interface CorridorPreset {
  id: string;
  label: string;
  n: number;
  doors: number[];
  note: string;
}

export const CORRIDOR_PRESETS: CorridorPreset[] = [
  { id: 'classic', label: 'Three doors', n: 30, doors: [3, 7, 18], note: 'Three doors with different gaps between them (4, 11 and 15 cells round the loop), so a run of readings can only fit one place.' },
  { id: 'even', label: 'Evenly spaced doors', n: 30, doors: [2, 12, 22], note: 'Three identical doors exactly 10 cells apart round the loop: every door looks the same and so does every gap.' },
  { id: 'one', label: 'One door', n: 30, doors: [9], note: 'One door: the first “door” reading pins the robot down; between doors it can only count steps.' },
  { id: 'many', label: 'Many doors', n: 30, doors: [1, 2, 6, 9, 10, 15, 21, 22, 23, 27], note: 'Ten doors in an irregular pattern: each reading is less surprising, but the pattern of doors and walls is distinctive.' },
];

export function doorsOf(p: CorridorPreset): boolean[] {
  const d = new Array<boolean>(p.n).fill(false);
  for (const i of p.doors) d[i] = true;
  return d;
}

export interface Params {
  motion: MotionNoise;
  sensor: DoorSensor;
  ends: CorridorEnds;
}

// A good sensor and modest slip: with these the robot usually localises within one lap of the three-door loop
// (the self-tests measure it), while the motion noise still visibly blurs the belief at every prediction.
export const DEFAULT_PARAMS: Params = {
  motion: { under: 0.05, exact: 0.9, over: 0.05 },
  sensor: { hit: 0.9, falseAlarm: 0.05 },
  ends: 'loop',
};

export interface PredictRec {
  kind: 'predict';
  before: number[];
  after: number[];
  shifts: Shift[];
  layers: number[][];
  dest: number[][];
  /** Cells the hidden robot really moved. */
  moved: number;
}

export interface CorrectRec {
  kind: 'correct';
  before: number[];
  lik: number[];
  /** P(z | door) and P(z | wall) as used in this step (the sliders may change later). */
  likDoor: number;
  likWall: number;
  product: number[];
  evidence: number;
  after: number[];
  z: DoorReading;
  /** Whether z was the robot's own reading (false when the student forced the other one). */
  fromRobot: boolean;
}

export type StepRec = PredictRec | CorrectRec;

export interface Snap {
  bel: number[];
  /** The hidden robot's true cell. */
  robot: number;
  /** What the robot's sensor reports in this cell (sampled when it arrived). */
  reading: DoorReading;
  step: StepRec | null;
  /** Number of steps taken. */
  t: number;
}

/** Normalise motion probabilities so they sum to 1 (sliders may leave them a hair off). */
export function cleanMotion(m: MotionNoise): MotionNoise {
  const s = m.under + m.exact + m.over;
  return s > 0 ? { under: m.under / s, exact: m.exact / s, over: m.over / s } : { under: 0, exact: 1, over: 0 };
}

export function initSnap(doors: readonly boolean[], robot: number, sensor: DoorSensor, rand: () => number): Snap {
  return { bel: uniform(doors.length), robot, reading: sampleReading(rand(), doors[robot], sensor), step: null, t: 0 };
}

export function doPredict(s: Snap, doors: readonly boolean[], p: Params, rand: () => number): Snap {
  const motion = cleanMotion(p.motion);
  const shifts = shiftsOf(motion);
  const pr = predictCorridor(s.bel, shifts, p.ends);
  const moved = sampleMove(rand(), motion);
  const robot = shiftCell(s.robot, moved, doors.length, p.ends);
  return {
    bel: pr.bel,
    robot,
    reading: sampleReading(rand(), doors[robot], p.sensor),
    step: { kind: 'predict', before: s.bel, after: pr.bel, shifts, layers: pr.layers, dest: pr.dest, moved },
    t: s.t + 1,
  };
}

export function doCorrect(s: Snap, doors: readonly boolean[], z: DoorReading, p: Params, rand: () => number): Snap {
  const t = correctCorridor(s.bel, doors, z, p.sensor);
  // A degenerate reading (P(z) = 0, e.g. a perfect sensor contradicted) leaves the belief unchanged.
  const after = t.evidence > 0 ? t.posterior : s.bel.slice();
  return {
    bel: after,
    robot: s.robot,
    // A new look at the same cell gives a fresh, independent reading.
    reading: sampleReading(rand(), doors[s.robot], p.sensor),
    step: {
      kind: 'correct',
      before: s.bel,
      lik: t.likelihood,
      likDoor: z === 'door' ? p.sensor.hit : 1 - p.sensor.hit,
      likWall: z === 'door' ? p.sensor.falseAlarm : 1 - p.sensor.falseAlarm,
      product: t.product,
      evidence: t.evidence,
      after,
      z,
      fromRobot: z === s.reading,
    },
    t: s.t + 1,
  };
}

/** Run predict-then-correct cycles with the robot's own readings (for auto-play and the self-tests). */
export function runCycles(s0: Snap, doors: readonly boolean[], p: Params, cycles: number, rand: () => number): Snap[] {
  const out: Snap[] = [];
  let s = s0;
  for (let k = 0; k < cycles; k++) {
    s = doPredict(s, doors, p, rand);
    out.push(s);
    s = doCorrect(s, doors, s.reading, p, rand);
    out.push(s);
  }
  return out;
}
