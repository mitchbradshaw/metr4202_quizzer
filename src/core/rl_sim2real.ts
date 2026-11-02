// Sim-to-real toy (summary notes §8, 2025 Q26): a robot taps a puck so that it stops on a mark 2 m away. The puck
// slides with Coulomb friction, so a push at speed v travels d = v² / (2 μ g). A policy is trained in a simulator
// with friction μ_sim and deployed on a floor with μ_real.
//
// Policy family: up to `taps` pushes. Before each push the robot sees how far the puck still has to go (r) and pushes
// it to cover a fraction `aim` of r according to its internal friction model μ_model:
//   v = sqrt(2 μ_model g · aim · |r|)  ⇒  actual travel = aim · |r| · μ_model / μ_real,  r ← r (1 − aim · ρ),  ρ = μ_model / μ_real.
// One full-strength push (taps 1, aim 1) is perfect in the simulator and fast; several cautious pushes are slower but
// tolerate a wrong μ. "Training" picks the policy with the best mean score over the training frictions (what RL
// would converge to): a single μ_sim without domain randomisation, a band of μ with it.
// Units: metres, seconds. Pure module, no React.

export const G_ACC = 9.81;
/** Distance to the mark, m. */
export const TARGET = 2;
/** A miss of this size or more scores 0, m. */
export const TOL = 0.5;
/** Score lost for every push after the first (the task also rewards being quick). */
export const TAP_COST = 0.06;
/** The robot stops pushing once the puck is this close to the mark, m. */
export const CLOSE_ENOUGH = 0.03;

export interface PushPolicy {
  /** Maximum number of pushes. */
  taps: number;
  /** Fraction of the remaining distance each push aims to cover. */
  aim: number;
  /** Friction the policy believes in (μ_sim, or the identified μ). */
  muModel: number;
}

export interface Push {
  /** Puck position before the push, m. */
  x0: number;
  /** Launch speed, m/s (signed: + towards the far end). */
  v: number;
  /** Puck position when it stops, m. */
  x1: number;
  /** Sliding time, s. */
  T: number;
}

export interface Deployment {
  pushes: Push[];
  /** Final puck position minus the mark, m (+ overshoot, − short). */
  miss: number;
  score: number;
}

/** Run the policy on a floor with friction muReal. */
export function deploy(p: PushPolicy, muReal: number): Deployment {
  const pushes: Push[] = [];
  let x = 0;
  for (let k = 0; k < p.taps; k++) {
    const r = TARGET - x;
    if (Math.abs(r) < CLOSE_ENOUGH && k > 0) break;
    const dir = Math.sign(r) || 1;
    const v = dir * Math.sqrt(2 * p.muModel * G_ACC * p.aim * Math.abs(r));
    const travel = (v * v) / (2 * muReal * G_ACC);
    const x1 = x + dir * travel;
    pushes.push({ x0: x, v, x1, T: Math.abs(v) / (muReal * G_ACC) });
    x = x1;
  }
  const miss = x - TARGET;
  const score = Math.max(0, Math.max(0, 1 - Math.abs(miss) / TOL) - TAP_COST * (pushes.length - 1));
  return { pushes, miss, score };
}

/** Training frictions: n evenly spaced values over μ0 (1 ± width). */
export function trainingSet(mu0: number, width: number, n = 41): number[] {
  if (width <= 0) return [mu0];
  return Array.from({ length: n }, (_, i) => mu0 * (1 - width + (2 * width * i) / (n - 1)));
}

/** The policy with the best mean score over the training frictions (ties: fewer taps, then aim closer to 1). */
export function trainPolicy(mu0: number, width: number): PushPolicy & { trainScore: number } {
  const mus = trainingSet(mu0, width);
  let best: PushPolicy & { trainScore: number } = { taps: 1, aim: 1, muModel: mu0, trainScore: -1 };
  for (let taps = 1; taps <= 4; taps++) {
    for (let k = 0; k <= 24; k++) {
      const aim = 1 - k * 0.025;
      const p = { taps, aim, muModel: mu0 };
      let s = 0;
      for (const mu of mus) s += deploy(p, mu).score;
      s /= mus.length;
      if (s > best.trainScore + 1e-9) best = { ...p, trainScore: s };
    }
  }
  return best;
}

/** Score of a policy over a range of real frictions (for the performance curve). */
export function scoreCurve(p: PushPolicy, muMin: number, muMax: number, n = 120): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const mu = muMin + ((muMax - muMin) * i) / n;
    return [mu, deploy(p, mu).score * 100] as [number, number];
  });
}

/** Puck position at time t (s) during a deployment, including a pause of `gap` s between pushes. */
export function puckAt(d: Deployment, muReal: number, t: number, gap = 0.45): { x: number; push: number; done: boolean } {
  let t0 = 0;
  const a = muReal * G_ACC;
  for (let k = 0; k < d.pushes.length; k++) {
    const p = d.pushes[k];
    if (t < t0 + gap) return { x: p.x0, push: k, done: false };
    const u = t - t0 - gap;
    if (u < p.T) {
      const dir = Math.sign(p.v) || 1;
      const s = Math.abs(p.v) * u - 0.5 * a * u * u;
      return { x: p.x0 + dir * s, push: k, done: false };
    }
    t0 += gap + p.T;
  }
  const last = d.pushes[d.pushes.length - 1];
  return { x: last ? last.x1 : 0, push: d.pushes.length - 1, done: true };
}

/** Total duration of a deployment's animation, s. */
export function deploymentTime(d: Deployment, gap = 0.45): number {
  return d.pushes.reduce((s, p) => s + gap + p.T, 0);
}
