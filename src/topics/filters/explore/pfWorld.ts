// The world behind the particle filter simulation (pf): a 10 m × 6 m room with four pillars and an optional unique
// beacon, a robot that drives a fixed loop, a range-bearing sensor, and the filter itself (SAMPLE / WEIGHT /
// RESAMPLE from core/filters_particle.ts). The four pillars are placed with 180° rotational symmetry about the
// room's centre, so when they all look alike a robot at (x, y, θ) and one at (10 − x, 6 − y, θ + π) see exactly the
// same thing: the belief has two peaks until the beacon (or distinguishable pillars) breaks the tie.
// Pure TypeScript: two seeded generators (world and particles) make every run reproducible.
import { initParticles, makeParticleSet, normaliseWeights, resampleParticles, sampleMotion, weightParticles, effectiveSampleSize, type ParticleSet2, type ResampleMethod, type TurnDrive } from '../../../core/filters_particle';
import { gaussian, wrapAngle } from '../../../core/motion';
import { mulberry32 } from '../../../engine/rng';

export const ROOM_W = 10;
export const ROOM_H = 6;
export const MAX_PARTICLES = 2000;

export interface Landmark {
  x: number;
  y: number;
}

/** 180° symmetric about (5, 3): P1 ↔ P3, P2 ↔ P4. */
export const PILLARS: Landmark[] = [
  { x: 2.0, y: 1.6 },
  { x: 4.2, y: 4.5 },
  { x: 8.0, y: 4.4 },
  { x: 5.8, y: 1.5 },
];
/** The one landmark that breaks the symmetry. */
export const BEACON: Landmark = { x: 9.3, y: 0.9 };
/** The robot's loop, itself symmetric under the same rotation. */
export const ROUTE: Landmark[] = [
  { x: 1.6, y: 3.0 },
  { x: 3.2, y: 5.0 },
  { x: 6.8, y: 5.0 },
  { x: 8.4, y: 3.0 },
  { x: 6.8, y: 1.0 },
  { x: 3.2, y: 1.0 },
];

/**
 * Range-bearing sensor. The real noise (trueR, trueB) is smaller than the noise the filter assumes (sR, sB): with
 * ~1000 particles spread over the whole room the nearest particle to the truth is typically 0.3 m and 0.3 rad away,
 * and a model as sharp as the real sensor would wipe it out. Widening the model is the standard fix.
 */
export const SENSOR = { range: 3.5, trueR: 0.12, trueB: 0.05, sR: 0.5, sB: 0.4, floor: 0.02 };
export const STEP = 0.35;
/** The robot's real actuation noise per step. */
export const MOTION_TRUE = { sTurn: 0.06, sDist: 0.06 };
/**
 * The noise the particles add per step (times `noiseScale`): deliberately twice the real noise, so each cluster keeps
 * enough spread to correct its heading (an over-confident motion model loses hypotheses).
 */
export const MOTION_MODEL = { sTurn: 0.12, sDist: 0.12 };

export interface Pose {
  x: number;
  y: number;
  th: number;
}

export interface Obs {
  kind: 'pillar' | 'beacon';
  /** Index into PILLARS (or 0 for the beacon). */
  id: number;
  /** Range (m) and bearing relative to the heading (rad). */
  r: number;
  b: number;
}

export interface PfConfig {
  M: number;
  /** Pillars carry an ID (known data association) instead of all looking alike. */
  distinguishable: boolean;
  beacon: boolean;
  /** Fraction of the particles replaced by uniform random ones at each resample. */
  inject: number;
  /** Multiplier on the particles' motion noise (0 = no noise: duplicates never separate). */
  noiseScale: number;
  init: 'global' | 'local';
  method: ResampleMethod;
}

export const PF_DEFAULT: PfConfig = { M: 2000, distinguishable: false, beacon: true, inject: 0, noiseScale: 1, init: 'global', method: 'low-variance' };

export type Phase = 'sample' | 'weight' | 'resample';

export interface PfStats {
  /** Effective sample size of the current weights. */
  neff: number;
  /** Distinct particle positions (after a resample, fewer than M). */
  distinct: number;
  /** Probability mass of each hypothesis (cluster), largest first. */
  clusters: number[];
  /** Weighted mean pose and its distance from the truth. */
  mean: Pose;
  err: number;
  /** Weight mass within 0.75 m of the true position. */
  nearTruth: number;
}

const uniformPose = (next: () => number): Pose => ({ x: 0.2 + next() * (ROOM_W - 0.4), y: 0.2 + next() * (ROOM_H - 0.4), th: (next() * 2 - 1) * Math.PI });

export function inRoom(x: number, y: number): boolean {
  return x > 0.05 && x < ROOM_W - 0.05 && y > 0.05 && y < ROOM_H - 0.05;
}

/** What a robot at pose p would measure (noise-free), for every landmark in range. */
export function expectedObs(p: Pose, beacon: boolean): Obs[] {
  const out: Obs[] = [];
  const add = (kind: Obs['kind'], id: number, l: Landmark) => {
    const dx = l.x - p.x;
    const dy = l.y - p.y;
    const r = Math.hypot(dx, dy);
    if (r <= SENSOR.range) out.push({ kind, id, r, b: wrapAngle(Math.atan2(dy, dx) - p.th) });
  };
  PILLARS.forEach((l, i) => add('pillar', i, l));
  if (beacon) add('beacon', 0, BEACON);
  return out;
}

/** Gaussian agreement (0 … 1] between a measured (r, b) and a landmark seen from pose (x, y, θ). */
function agree(o: Obs, l: Landmark, x: number, y: number, th: number): number {
  const dx = l.x - x;
  const dy = l.y - y;
  const r = Math.sqrt(dx * dx + dy * dy);
  const dr = (o.r - r) / SENSOR.sR;
  const db = wrapAngle(o.b - (Math.atan2(dy, dx) - th)) / SENSOR.sB;
  return Math.exp(-0.5 * (dr * dr + db * db));
}

/**
 * The sensor model p(z | x) up to a constant: a product over the observations of (floor + agreement). With
 * look-alike pillars the robot does not know WHICH pillar it saw, so each particle uses the pillar that fits it best
 * (maximum-likelihood data association). A pose outside the room is impossible (weight 0).
 */
export function likelihood(obs: readonly Obs[], distinguishable: boolean, x: number, y: number, th: number): number {
  if (!inRoom(x, y)) return 0;
  let p = 1;
  for (const o of obs) {
    let a: number;
    if (o.kind === 'beacon') a = agree(o, BEACON, x, y, th);
    else if (distinguishable) a = agree(o, PILLARS[o.id], x, y, th);
    else {
      a = 0;
      for (const l of PILLARS) a = Math.max(a, agree(o, l, x, y, th));
    }
    p *= SENSOR.floor + a;
  }
  return p;
}

/** The best possible likelihood for this many observations (a perfect particle). */
export const perfectLik = (nObs: number) => Math.pow(1 + SENSOR.floor, nObs);

export class PfSim {
  cfg: PfConfig;
  seed: number;
  set: ParticleSet2;
  /** Positions before the last SAMPLE (for the glide animation). */
  prevX = new Float64Array(MAX_PARTICLES);
  prevY = new Float64Array(MAX_PARTICLES);
  prevTh = new Float64Array(MAX_PARTICLES);
  /** For the particles of the current set: how many copies of its source the last resample made (0 = not resampled). */
  copies = new Int32Array(MAX_PARTICLES);
  /** Old particles that the last resample dropped (drawn fading out). */
  deadX: number[] = [];
  deadY: number[] = [];
  robot: Pose = { x: ROUTE[0].x, y: ROUTE[0].y, th: Math.PI / 2 };
  wp = 1;
  t = 0;
  next: Phase = 'sample';
  obs: Obs[] = [];
  lastU: TurnDrive = { turn: 0, dist: 0 };
  /** Mean likelihood as a fraction of a perfect fit, per WEIGHT step (NaN when nothing was in range). */
  fit: number[] = [];
  lastResampleDistinct = 0;
  private worldRng: () => number;
  private pfRng: () => number;

  constructor(cfg: PfConfig, seed = 7) {
    this.cfg = { ...cfg };
    this.seed = seed;
    this.set = makeParticleSet(MAX_PARTICLES);
    this.worldRng = mulberry32(seed);
    this.pfRng = mulberry32(seed ^ 0x9e3779b9);
    this.reset(seed);
  }

  /** Start over: robot at the start of the loop, particles spread (global) or around the truth (local). */
  reset(seed = this.seed, cfg: Partial<PfConfig> = {}): void {
    this.cfg = { ...this.cfg, ...cfg };
    this.seed = seed;
    this.worldRng = mulberry32(seed);
    this.pfRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.robot = { x: ROUTE[0].x, y: ROUTE[0].y, th: Math.PI / 2 };
    this.wp = 1;
    this.t = 0;
    this.next = 'sample';
    this.obs = [];
    this.fit = [];
    this.deadX = [];
    this.deadY = [];
    this.lastU = { turn: 0, dist: 0 };
    const M = Math.max(10, Math.min(MAX_PARTICLES, Math.round(this.cfg.M)));
    const r = this.robot;
    const sampler =
      this.cfg.init === 'global'
        ? uniformPose
        : (next: () => number): Pose => ({ x: r.x + 0.3 * gaussian(next), y: r.y + 0.3 * gaussian(next), th: r.th + 0.15 * gaussian(next) });
    initParticles(this.set, M, sampler, this.pfRng);
    this.copies.fill(0);
    this.snapshotPrev();
  }

  private snapshotPrev() {
    this.prevX.set(this.set.x.subarray(0, this.set.n));
    this.prevY.set(this.set.y.subarray(0, this.set.n));
    this.prevTh.set(this.set.th.subarray(0, this.set.n));
  }

  /** The command towards the next waypoint of the loop (computed from the true pose: the route is fixed). */
  private command(): TurnDrive {
    let w = ROUTE[this.wp];
    if (Math.hypot(w.x - this.robot.x, w.y - this.robot.y) < 0.45) {
      this.wp = (this.wp + 1) % ROUTE.length;
      w = ROUTE[this.wp];
    }
    const want = Math.atan2(w.y - this.robot.y, w.x - this.robot.x);
    const turn = Math.max(-0.7, Math.min(0.7, wrapAngle(want - this.robot.th)));
    return { turn, dist: STEP };
  }

  /** SAMPLE: the robot executes one command (with real actuation noise) and every particle draws its own noisy copy. */
  sample(): void {
    this.snapshotPrev();
    this.copies.fill(0);
    this.deadX = [];
    this.deadY = [];
    const u = this.command();
    this.lastU = u;
    const g = this.worldRng;
    const th = this.robot.th + u.turn + MOTION_TRUE.sTurn * gaussian(g);
    const d = u.dist + MOTION_TRUE.sDist * gaussian(g);
    this.robot = {
      x: Math.max(0.15, Math.min(ROOM_W - 0.15, this.robot.x + d * Math.cos(th))),
      y: Math.max(0.15, Math.min(ROOM_H - 0.15, this.robot.y + d * Math.sin(th))),
      th: wrapAngle(th),
    };
    const k = this.cfg.noiseScale;
    sampleMotion(this.set, u, { sTurn: MOTION_MODEL.sTurn * k, sDist: MOTION_MODEL.sDist * k }, this.pfRng);
    this.obs = [];
    this.t++;
    this.next = 'weight';
  }

  /** WEIGHT: the robot senses (noisy range and bearing to every landmark in range); w ← w · p(z | x). */
  weight(): void {
    const g = this.worldRng;
    this.obs = expectedObs(this.robot, this.cfg.beacon).map((o) => ({ ...o, r: Math.max(0.05, o.r + SENSOR.trueR * gaussian(g)), b: wrapAngle(o.b + SENSOR.trueB * gaussian(g)) }));
    const dist = this.cfg.distinguishable;
    const obs = this.obs;
    const res = weightParticles(this.set, (x, y, th) => likelihood(obs, dist, x, y, th));
    this.fit.push(obs.length ? res.likSum / this.set.n / perfectLik(obs.length) : NaN);
    if (this.fit.length > 200) this.fit.shift();
    this.next = 'resample';
  }

  /** RESAMPLE: low-variance (or multinomial) draw in proportion to the weights, plus optional random injection. */
  resample(): void {
    const n = this.set.n;
    const oldX = this.set.x.slice(0, n);
    const oldY = this.set.y.slice(0, n);
    const M = Math.max(10, Math.min(MAX_PARTICLES, Math.round(this.cfg.M)));
    const counts = resampleParticles(this.set, this.cfg.method, this.pfRng, { m: M, inject: this.cfg.inject, sampler: uniformPose });
    // Which old particle each survivor came from: rebuild from the counts (the resampler keeps the old order).
    this.copies.fill(0);
    let m = 0;
    let distinct = 0;
    this.deadX = [];
    this.deadY = [];
    for (let i = 0; i < n; i++) {
      const k = counts[i];
      if (k > 0) distinct++;
      else if (this.deadX.length < 800) {
        this.deadX.push(oldX[i]);
        this.deadY.push(oldY[i]);
      }
      for (let c = 0; c < k; c++) this.copies[m++] = k;
    }
    this.lastResampleDistinct = distinct + (this.set.n - m);
    this.snapshotPrev();
    this.next = 'sample';
  }

  /** Run the next phase. */
  step(): Phase {
    const ph = this.next;
    if (ph === 'sample') this.sample();
    else if (ph === 'weight') this.weight();
    else this.resample();
    return ph;
  }

  /** Finish the current cycle and run `n` more full cycles. */
  cycles(n: number): void {
    while (this.next !== 'sample') this.step();
    for (let i = 0; i < n; i++) {
      this.sample();
      this.weight();
      this.resample();
    }
  }

  /** Move the robot somewhere else without telling the filter (two waypoints further round the loop). */
  kidnap(): void {
    const j = (this.wp + 2) % ROUTE.length;
    const w = ROUTE[j];
    const nx = ROUTE[(j + 1) % ROUTE.length];
    this.robot = { x: w.x, y: w.y, th: Math.atan2(nx.y - w.y, nx.x - w.x) };
    this.wp = (j + 1) % ROUTE.length;
  }

  setM(M: number): void {
    this.cfg.M = M;
  }

  stats(): PfStats {
    const s = this.set;
    const n = s.n;
    const w = normaliseWeights(s.w, new Float64Array(n), n);
    // Distinct positions (exact duplicates appear after a resample and only separate again through motion noise).
    const keys = new Set<number>();
    for (let i = 0; i < n; i++) keys.add(Math.round(s.x[i] * 1e4) * 131071 + Math.round(s.y[i] * 1e4));
    const distinct = keys.size;
    // Hypotheses: weight mass on a 0.5 m grid, 8-connected cells with ≥ 2 % of the mass.
    const CX = 20;
    const CY = 12;
    const mass = new Float64Array(CX * CY);
    let mx = 0;
    let my = 0;
    let c = 0;
    let sn = 0;
    let near = 0;
    for (let i = 0; i < n; i++) {
      const ix = Math.min(CX - 1, Math.max(0, Math.floor((s.x[i] / ROOM_W) * CX)));
      const iy = Math.min(CY - 1, Math.max(0, Math.floor((s.y[i] / ROOM_H) * CY)));
      mass[iy * CX + ix] += w[i];
      mx += w[i] * s.x[i];
      my += w[i] * s.y[i];
      c += w[i] * Math.cos(s.th[i]);
      sn += w[i] * Math.sin(s.th[i]);
      if (Math.hypot(s.x[i] - this.robot.x, s.y[i] - this.robot.y) < 0.75) near += w[i];
    }
    const seen = new Uint8Array(CX * CY);
    const clusters: number[] = [];
    for (let k = 0; k < CX * CY; k++) {
      if (seen[k] || mass[k] < 0.02) continue;
      let total = 0;
      const stack = [k];
      seen[k] = 1;
      while (stack.length) {
        const q = stack.pop()!;
        total += mass[q];
        const qx = q % CX;
        const qy = (q - qx) / CX;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const ax = qx + dx;
            const ay = qy + dy;
            if (ax < 0 || ay < 0 || ax >= CX || ay >= CY) continue;
            const a = ay * CX + ax;
            if (!seen[a] && mass[a] >= 0.02) {
              seen[a] = 1;
              stack.push(a);
            }
          }
      }
      clusters.push(total);
    }
    clusters.sort((a, b) => b - a);
    const mean = { x: mx, y: my, th: Math.atan2(sn, c) };
    return { neff: effectiveSampleSize(s.w, n), distinct, clusters, mean, err: Math.hypot(mx - this.robot.x, my - this.robot.y), nearTruth: near };
  }
}
