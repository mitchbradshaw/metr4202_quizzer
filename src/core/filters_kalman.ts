// Kalman and extended Kalman filters (summary notes §2), in the course's (Thrun / lecture) notation:
//   R = actuation (process) noise covariance, Q = sensor (measurement) noise covariance.
//   Predict:  μ̄_t = A μ_{t−1} + B u_t,            Σ̄_t = A Σ_{t−1} Aᵀ + R
//   Update:   K_t = Σ̄_t Cᵀ (C Σ̄_t Cᵀ + Q)⁻¹,     μ_t = μ̄_t + K_t (z_t − C μ̄_t),   Σ_t = (I − K_t C) Σ̄_t
// The EKF replaces A μ + B u by g(u, μ) and C μ̄ by h(μ̄), and uses the Jacobians G = ∂g/∂x and H = ∂h/∂x,
// evaluated at the current mean, in place of A and C.
// Pure functions (no React). Matrices are small and row-major (number[][]).

// ------------------------------------------------------------------ scalar (1-D) filter

/** A 1-D Gaussian belief: mean and variance. */
export interface Gauss1 {
  mu: number;
  /** Variance σ² (not the standard deviation). */
  s2: number;
}

/** Scalar linear-Gaussian model: x_t = a x_{t−1} + b u_t + ε (var R), z_t = c x_t + δ (var Q). */
export interface Kf1Model {
  a: number;
  b: number;
  c: number;
  /** Actuation (process) noise variance. */
  R: number;
  /** Sensor (measurement) noise variance. */
  Q: number;
}

export const KF1_IDENTITY: Kf1Model = { a: 1, b: 1, c: 1, R: 1, Q: 1 };

export interface Kf1Predict {
  muBar: number;
  s2Bar: number;
}

export interface Kf1Update {
  /** Kalman gain K = Σ̄ c / (c² Σ̄ + Q). */
  K: number;
  /** Innovation z − c μ̄. */
  innov: number;
  /** Innovation variance S = c² Σ̄ + Q. */
  S: number;
  mu: number;
  s2: number;
}

export type Kf1Step = Kf1Predict & Kf1Update;

/** Gaussian probability density N(x; μ, σ²). */
export function gaussPdf(x: number, mu: number, s2: number): number {
  const d = x - mu;
  return Math.exp((-d * d) / (2 * s2)) / Math.sqrt(2 * Math.PI * s2);
}

/** Prediction (actuation): μ̄ = a μ + b u, Σ̄ = a² Σ + R. The variance can only grow (for |a| ≥ 1). */
export function kf1Predict(mu: number, s2: number, u: number, m: Pick<Kf1Model, 'a' | 'b' | 'R'>): Kf1Predict {
  return { muBar: m.a * mu + m.b * u, s2Bar: m.a * m.a * s2 + m.R };
}

/** Correction (measurement): K = Σ̄ c/(c²Σ̄ + Q), μ = μ̄ + K(z − c μ̄), Σ = (1 − K c) Σ̄. */
export function kf1Update(muBar: number, s2Bar: number, z: number, m: Pick<Kf1Model, 'c' | 'Q'>): Kf1Update {
  const S = m.c * m.c * s2Bar + m.Q;
  const K = (s2Bar * m.c) / S;
  const innov = z - m.c * muBar;
  return { K, innov, S, mu: muBar + K * innov, s2: (1 - K * m.c) * s2Bar };
}

/** One full cycle: predict with u, then correct with z. */
export function kf1Step(mu: number, s2: number, u: number, z: number, m: Kf1Model): Kf1Step {
  const p = kf1Predict(mu, s2, u, m);
  return { ...p, ...kf1Update(p.muBar, p.s2Bar, z, m) };
}

/**
 * Steady state of the scalar Riccati recursion (the gain the filter settles to, whatever the data):
 * the predicted variance P solves c²P² + (Q(1 − a²) − Rc²)P − RQ = 0 (positive root).
 * For a = c = 1 (random walk): P = (R + √(R² + 4RQ))/2.
 */
export function kf1SteadyState(m: Pick<Kf1Model, 'a' | 'c' | 'R' | 'Q'>): { s2Bar: number; s2: number; K: number } {
  const { a, c, R, Q } = m;
  if (Math.abs(c) < 1e-15) {
    const s2Bar = Math.abs(a) < 1 ? R / (1 - a * a) : Infinity;
    return { s2Bar, s2: s2Bar, K: 0 };
  }
  const bq = Q * (1 - a * a) - R * c * c;
  const P = (-bq + Math.sqrt(bq * bq + 4 * c * c * R * Q)) / (2 * c * c);
  const K = (P * c) / (c * c * P + Q);
  return { s2Bar: P, s2: (1 - K * c) * P, K };
}

/** The gains K_1 … K_n of a scalar filter started from variance s2_0 (they do not depend on the measurements). */
export function kf1GainSequence(s2_0: number, n: number, m: Kf1Model): { K: number[]; s2Bar: number[]; s2: number[] } {
  const K: number[] = [];
  const s2Bar: number[] = [];
  const s2: number[] = [];
  let v = s2_0;
  for (let k = 0; k < n; k++) {
    const pb = m.a * m.a * v + m.R;
    const S = m.c * m.c * pb + m.Q;
    const g = (pb * m.c) / S;
    v = (1 - g * m.c) * pb;
    K.push(g);
    s2Bar.push(pb);
    s2.push(v);
  }
  return { K, s2Bar, s2 };
}

// ------------------------------------------------------------------ small matrices

export type Vec = number[];
export type Mat = number[][];

export function identity(n: number): Mat {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

export function transpose(A: Mat): Mat {
  if (!A.length) return [];
  return A[0].map((_, j) => A.map((row) => row[j]));
}

export function matMul(A: Mat, B: Mat): Mat {
  const n = A.length;
  const k = B.length;
  const m = k ? B[0].length : 0;
  const out: Mat = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let p = 0; p < k; p++) {
      const a = A[i][p];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) out[i][j] += a * B[p][j];
    }
  return out;
}

export function matVec(A: Mat, x: Vec): Vec {
  return A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
}

export function matAdd(A: Mat, B: Mat): Mat {
  return A.map((row, i) => row.map((a, j) => a + B[i][j]));
}

export function matSub(A: Mat, B: Mat): Mat {
  return A.map((row, i) => row.map((a, j) => a - B[i][j]));
}

export function vecAdd(a: Vec, b: Vec): Vec {
  return a.map((x, i) => x + b[i]);
}

export function vecSub(a: Vec, b: Vec): Vec {
  return a.map((x, i) => x - b[i]);
}

/** Inverse by Gauss–Jordan elimination with partial pivoting. Throws on a singular matrix. */
export function inverse(A: Mat): Mat {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...identity(n)[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-14) throw new Error('singular matrix');
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}

/** Make a covariance exactly symmetric (round-off in (I − KC)Σ̄ breaks symmetry slowly). */
export function symmetrise(S: Mat): Mat {
  return S.map((row, i) => row.map((v, j) => (v + S[j][i]) / 2));
}

// ------------------------------------------------------------------ n-D Kalman filter

export interface KfPredict {
  muBar: Vec;
  SigmaBar: Mat;
}

export interface KfUpdate {
  K: Mat;
  innov: Vec;
  S: Mat;
  mu: Vec;
  Sigma: Mat;
}

/** μ̄ = A μ + B u, Σ̄ = A Σ Aᵀ + R (pass B = null for no control input). */
export function kfPredict(mu: Vec, Sigma: Mat, A: Mat, B: Mat | null, u: Vec | null, R: Mat): KfPredict {
  let muBar = matVec(A, mu);
  if (B && u) muBar = vecAdd(muBar, matVec(B, u));
  return { muBar, SigmaBar: symmetrise(matAdd(matMul(matMul(A, Sigma), transpose(A)), R)) };
}

/** K = Σ̄Cᵀ(CΣ̄Cᵀ + Q)⁻¹, μ = μ̄ + K(z − Cμ̄), Σ = (I − KC)Σ̄. */
export function kfUpdate(muBar: Vec, SigmaBar: Mat, C: Mat, z: Vec, Q: Mat): KfUpdate {
  const Ct = transpose(C);
  const S = matAdd(matMul(matMul(C, SigmaBar), Ct), Q);
  const K = matMul(matMul(SigmaBar, Ct), inverse(S));
  const innov = vecSub(z, matVec(C, muBar));
  const mu = vecAdd(muBar, matVec(K, innov));
  const Sigma = symmetrise(matMul(matSub(identity(muBar.length), matMul(K, C)), SigmaBar));
  return { K, innov, S, mu, Sigma };
}

/**
 * Iterate the Riccati recursion (predict, then update) until the gain stops changing. The gain sequence does not
 * depend on the measurements, so this is the steady-state gain any run of the filter converges to.
 */
export function kfSteadyGain(A: Mat, C: Mat, R: Mat, Q: Mat, Sigma0?: Mat, maxIter = 20000, tol = 1e-13): { K: Mat; SigmaBar: Mat; Sigma: Mat; iterations: number } {
  const n = A.length;
  let Sigma = Sigma0 ?? identity(n).map((row) => row.map((v) => v * 1e3));
  let K: Mat = Array.from({ length: n }, () => new Array<number>(C.length).fill(0));
  let SigmaBar = Sigma;
  const mu0 = new Array<number>(n).fill(0);
  for (let it = 1; it <= maxIter; it++) {
    const p = kfPredict(mu0, Sigma, A, null, null, R);
    const u = kfUpdate(p.muBar, p.SigmaBar, C, new Array<number>(C.length).fill(0), Q);
    let diff = 0;
    for (let i = 0; i < K.length; i++) for (let j = 0; j < K[i].length; j++) diff = Math.max(diff, Math.abs(u.K[i][j] - K[i][j]));
    K = u.K;
    SigmaBar = p.SigmaBar;
    Sigma = u.Sigma;
    if (diff < tol) return { K, SigmaBar, Sigma, iterations: it };
  }
  return { K, SigmaBar, Sigma, iterations: maxIter };
}

/**
 * The 1-D constant-velocity (discrete white-noise acceleration) tracking model: state (position, velocity),
 * x_t = A x_{t−1} + Γ a with a ~ N(0, σ_a²), z = position + δ with δ ~ N(0, σ_z²).
 * A = [[1, Δt], [0, 1]], C = [1, 0], R = ΓΓᵀσ_a² with Γ = (Δt²/2, Δt), Q = σ_z².
 */
export function constantVelocityModel(dt: number, sigmaA: number, sigmaZ: number): { A: Mat; C: Mat; R: Mat; Q: Mat } {
  const g = [(dt * dt) / 2, dt];
  const sa2 = sigmaA * sigmaA;
  return {
    A: [
      [1, dt],
      [0, 1],
    ],
    C: [[1, 0]],
    R: [
      [g[0] * g[0] * sa2, g[0] * g[1] * sa2],
      [g[1] * g[0] * sa2, g[1] * g[1] * sa2],
    ],
    Q: [[sigmaZ * sigmaZ]],
  };
}

/**
 * Closed-form steady-state gains of that constant-velocity model (the α–β filter, Kalata's tracking index
 * λ = σ_a Δt² / σ_z): α = −(λ² + 8λ − (λ + 4)√(λ² + 8λ))/8, β = (λ² + 4λ − λ√(λ² + 8λ))/4, K = (α, β/Δt).
 */
export function alphaBetaSteadyGain(dt: number, sigmaA: number, sigmaZ: number): { alpha: number; beta: number; lambda: number; K: [number, number] } {
  const lambda = (sigmaA * dt * dt) / sigmaZ;
  const r = Math.sqrt(lambda * lambda + 8 * lambda);
  const alpha = -(lambda * lambda + 8 * lambda - (lambda + 4) * r) / 8;
  const beta = (lambda * lambda + 4 * lambda - lambda * r) / 4;
  return { alpha, beta, lambda, K: [alpha, beta / dt] };
}

// ------------------------------------------------------------------ extended Kalman filter

export interface EkfPredict extends KfPredict {
  /** Jacobian G = ∂g/∂x at the previous mean. */
  G: Mat;
}

export interface EkfUpdate extends KfUpdate {
  /** Jacobian H = ∂h/∂x at the predicted mean. */
  H: Mat;
}

/** EKF prediction: μ̄ = g(u, μ), Σ̄ = G Σ Gᵀ + R with G = ∂g/∂x at μ. */
export function ekfPredict(mu: Vec, Sigma: Mat, u: Vec, g: (u: Vec, x: Vec) => Vec, Gj: (u: Vec, x: Vec) => Mat, R: Mat): EkfPredict {
  const G = Gj(u, mu);
  return { muBar: g(u, mu), SigmaBar: symmetrise(matAdd(matMul(matMul(G, Sigma), transpose(G)), R)), G };
}

/**
 * EKF correction: H = ∂h/∂x at μ̄, K = Σ̄Hᵀ(HΣ̄Hᵀ + Q)⁻¹, μ = μ̄ + K(z − h(μ̄)), Σ = (I − KH)Σ̄.
 * `wrapInnov` lets bearing measurements wrap the innovation to (−π, π].
 */
export function ekfUpdate(muBar: Vec, SigmaBar: Mat, z: Vec, h: (x: Vec) => Vec, Hj: (x: Vec) => Mat, Q: Mat, wrapInnov?: (v: Vec) => Vec): EkfUpdate {
  const H = Hj(muBar);
  const Ht = transpose(H);
  const S = matAdd(matMul(matMul(H, SigmaBar), Ht), Q);
  const K = matMul(matMul(SigmaBar, Ht), inverse(S));
  let innov = vecSub(z, h(muBar));
  if (wrapInnov) innov = wrapInnov(innov);
  const mu = vecAdd(muBar, matVec(K, innov));
  const Sigma = symmetrise(matMul(matSub(identity(muBar.length), matMul(K, H)), SigmaBar));
  return { K, innov, S, mu, Sigma, H };
}

/** Scalar EKF correction with a nonlinear h and its derivative (used by the 1-D linearisation demos). */
export function ekf1Update(muBar: number, s2Bar: number, z: number, h: (x: number) => number, dh: (x: number) => number, Q: number): Kf1Update & { H: number } {
  const H = dh(muBar);
  const S = H * H * s2Bar + Q;
  const K = (s2Bar * H) / S;
  const innov = z - h(muBar);
  return { K, innov, S, mu: muBar + K * innov, s2: (1 - K * H) * s2Bar, H };
}
