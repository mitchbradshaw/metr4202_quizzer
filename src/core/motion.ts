// Motion models for a planar mobile robot (summary notes §3; Thrun's Probabilistic Robotics notation).
// Angles in radians; the pose is (x, y, θ) with θ measured anticlockwise from +x.

export interface Pose {
  x: number;
  y: number;
  theta: number;
}

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** Standard normal sample from a uniform generator (Box–Muller). */
export function gaussian(next: () => number): number {
  let u = 0;
  while (u <= 1e-12) u = next();
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const W_EPS = 1e-9;

/**
 * Velocity motion model with constant (v, ω) for Δt (exact arc of radius r = v/ω):
 *   x' = x − r sin θ + r sin(θ + ωΔt)
 *   y' = y + r cos θ − r cos(θ + ωΔt)
 *   θ' = θ + ωΔt + γΔt
 * ω = 0 is a straight line (the arc formula divides by zero). θ' is NOT wrapped, so multi-step
 * answers match the papers (e.g. 0.3 − 0.4 = −0.1).
 */
export function velocityMotion(p: Pose, v: number, w: number, dt: number, gamma = 0): Pose {
  if (Math.abs(w) < W_EPS) {
    return { x: p.x + v * dt * Math.cos(p.theta), y: p.y + v * dt * Math.sin(p.theta), theta: p.theta + gamma * dt };
  }
  const r = v / w;
  const th = p.theta + w * dt;
  return { x: p.x - r * Math.sin(p.theta) + r * Math.sin(th), y: p.y + r * Math.cos(p.theta) - r * Math.cos(th), theta: th + gamma * dt };
}

/** Points along the arc (n + 1 poses from t = 0 to Δt) for drawing or swept-path collision checks. */
export function velocityArc(p: Pose, v: number, w: number, dt: number, n = 32): Pose[] {
  const out: Pose[] = [];
  for (let i = 0; i <= n; i++) out.push(velocityMotion(p, v, w, (dt * i) / n));
  return out;
}

/** Centre of the instantaneous circle and its signed radius r = v/ω (null for a straight line). */
export function arcCentre(p: Pose, v: number, w: number): { cx: number; cy: number; r: number } | null {
  if (Math.abs(w) < W_EPS) return null;
  const r = v / w;
  return { cx: p.x - r * Math.sin(p.theta), cy: p.y + r * Math.cos(p.theta), r };
}

/**
 * Noise parameters of the sampled velocity model (Thrun Table 5.3):
 *   v̂ = v + ε(α1 v² + α2 ω²), ω̂ = ω + ε(α3 v² + α4 ω²), γ̂ = ε(α5 v² + α6 ω²); ε(b²) ~ N(0, b²).
 */
export type VelocityAlphas = [number, number, number, number, number, number];

export function sampleVelocityMotion(p: Pose, v: number, w: number, dt: number, a: VelocityAlphas, next: () => number): Pose {
  const sd = (b2: number) => Math.sqrt(Math.max(0, b2));
  const vh = v + sd(a[0] * v * v + a[1] * w * w) * gaussian(next);
  const wh = w + sd(a[2] * v * v + a[3] * w * w) * gaussian(next);
  const gh = sd(a[4] * v * v + a[5] * w * w) * gaussian(next);
  return velocityMotion(p, vh, wh, dt, gh);
}

/** Odometry motion u = (δrot1, δtrans, δrot2): rotate, translate, rotate (Thrun Table 5.5). */
export interface OdometryU {
  rot1: number;
  trans: number;
  rot2: number;
}

/** Recover (δrot1, δtrans, δrot2) from two odometry poses. */
export function odometryFromPoses(prev: Pose, curr: Pose): OdometryU {
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  const trans = Math.hypot(dx, dy);
  const rot1 = trans < 1e-12 ? 0 : wrapAngle(Math.atan2(dy, dx) - prev.theta);
  const rot2 = wrapAngle(curr.theta - prev.theta - rot1);
  return { rot1, trans, rot2 };
}

/** Apply (δrot1, δtrans, δrot2) to a pose. */
export function odometryMotion(p: Pose, u: OdometryU): Pose {
  const h = p.theta + u.rot1;
  return { x: p.x + u.trans * Math.cos(h), y: p.y + u.trans * Math.sin(h), theta: h + u.rot2 };
}

/** Noise of the sampled odometry model: rotation from rotation, rotation from translation, and so on. */
export type OdometryAlphas = [number, number, number, number];

export function sampleOdometryMotion(p: Pose, u: OdometryU, a: OdometryAlphas, next: () => number): Pose {
  const sd = (b2: number) => Math.sqrt(Math.max(0, b2));
  const r1 = u.rot1 - sd(a[0] * u.rot1 ** 2 + a[1] * u.trans ** 2) * gaussian(next);
  const tr = u.trans - sd(a[2] * u.trans ** 2 + a[3] * (u.rot1 ** 2 + u.rot2 ** 2)) * gaussian(next);
  const r2 = u.rot2 - sd(a[0] * u.rot2 ** 2 + a[1] * u.trans ** 2) * gaussian(next);
  return odometryMotion(p, { rot1: r1, trans: tr, rot2: r2 });
}
