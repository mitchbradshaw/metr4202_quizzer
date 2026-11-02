// Pose-graph SLAM in SE(2) (summary notes §4: data association and loop closure; "graph SLAM: poses are nodes,
// measurements are edges, optimise all of it at once; solves full SLAM"). Pure functions, metres and radians.
//
// Nodes x_0 … x_N are robot poses (x, y, θ). An edge (i, j, z_ij, Ω_ij) says "pose j seen from pose i is z_ij",
// with information Ω_ij (inverse covariance, diagonal here). Odometry links consecutive poses; a loop closure links
// the current pose to an old one. Gauss–Newton (with Levenberg–Marquardt damping when a step fails) minimises
//     χ² = Σ e_ijᵀ Ω_ij e_ij,     e_ij = (x_i⁻¹ ⊕ x_j) − z_ij   (angle wrapped),
// with x_0 anchored. Each iteration solves H Δx = −b for ALL poses at once. The marginal covariance of every pose
// is the matching 3×3 block of H⁻¹ at the solution (Grisetti et al., "A tutorial on graph-based SLAM", 2010).

export interface Pose2 {
  x: number;
  y: number;
  th: number;
}

export interface PoseEdge {
  i: number;
  j: number;
  /** Measured pose of j in i's frame. */
  z: Pose2;
  /** Diagonal information (1/σ²) for the x, y (in i's frame) and θ components. */
  info: [number, number, number];
  kind: 'odo' | 'loop';
}

/** 3×3 covariance, row-major. */
export type Cov3 = Float64Array;

export function wrapPi(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** a ⊕ b: apply the relative motion b in a's frame. */
export function compose(a: Pose2, b: Pose2): Pose2 {
  const c = Math.cos(a.th);
  const s = Math.sin(a.th);
  return { x: a.x + c * b.x - s * b.y, y: a.y + s * b.x + c * b.y, th: wrapPi(a.th + b.th) };
}

/** a⁻¹ ⊕ b: where b is, seen from a. */
export function between(a: Pose2, b: Pose2): Pose2 {
  const c = Math.cos(a.th);
  const s = Math.sin(a.th);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: c * dx + s * dy, y: -s * dx + c * dy, th: wrapPi(b.th - a.th) };
}

export function edgeError(xi: Pose2, xj: Pose2, z: Pose2): [number, number, number] {
  const h = between(xi, xj);
  return [h.x - z.x, h.y - z.y, wrapPi(h.th - z.th)];
}

/** χ² of one edge: eᵀ Ω e. */
export function edgeChi2(xi: Pose2, xj: Pose2, e: PoseEdge): number {
  const r = edgeError(xi, xj, e.z);
  return r[0] * r[0] * e.info[0] + r[1] * r[1] * e.info[1] + r[2] * r[2] * e.info[2];
}

export function chi2(poses: readonly Pose2[], edges: readonly PoseEdge[]): number {
  let s = 0;
  for (const e of edges) s += edgeChi2(poses[e.i], poses[e.j], e);
  return s;
}

/** x_0, x_0 ⊕ u_1, (x_0 ⊕ u_1) ⊕ u_2, …: dead reckoning from relative motions. */
export function deadReckon(x0: Pose2, us: readonly Pose2[]): Pose2[] {
  const out = [x0];
  for (const u of us) out.push(compose(out[out.length - 1], u));
  return out;
}

const zero3 = () => new Float64Array(9);

/**
 * First-order covariance of dead reckoning: Σ_k = J_x Σ_{k−1} J_xᵀ + J_u Q_k J_uᵀ, with
 * J_x = ∂(x ⊕ u)/∂x and J_u = ∂(x ⊕ u)/∂u at the estimate. Q_k = diag(1/info) of edge k. Starts from Σ0 (default 0).
 */
export function propagate(est: readonly Pose2[], us: readonly Pose2[], infos: readonly [number, number, number][], sigma0: Cov3 = zero3()): Cov3[] {
  const out: Cov3[] = [sigma0];
  for (let k = 0; k < us.length; k++) {
    const P = out[k];
    const th = est[k].th;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const u = us[k];
    const Jx = [1, 0, -s * u.x - c * u.y, 0, 1, c * u.x - s * u.y, 0, 0, 1];
    const Ju = [c, -s, 0, s, c, 0, 0, 0, 1];
    const q = [1 / infos[k][0], 1 / infos[k][1], 1 / infos[k][2]];
    const N = new Float64Array(9);
    // Jx P Jxᵀ
    const T = new Float64Array(9);
    for (let r = 0; r < 3; r++) for (let cI = 0; cI < 3; cI++) {
      let a = 0;
      for (let m = 0; m < 3; m++) a += Jx[r * 3 + m] * P[m * 3 + cI];
      T[r * 3 + cI] = a;
    }
    for (let r = 0; r < 3; r++) for (let cI = 0; cI < 3; cI++) {
      let a = 0;
      for (let m = 0; m < 3; m++) a += T[r * 3 + m] * Jx[cI * 3 + m];
      // + Ju Q Juᵀ (Q diagonal)
      for (let m = 0; m < 3; m++) a += Ju[r * 3 + m] * q[m] * Ju[cI * 3 + m];
      N[r * 3 + cI] = a;
    }
    out.push(N);
  }
  return out;
}

// ------------------------------------------------------------------ the linear system

const ANCHOR = 1e9;

/** H (dense, n×n with n = 3N) and b of the linearised problem at `poses`, node 0 anchored by a stiff prior. */
export function buildSystem(poses: readonly Pose2[], edges: readonly PoseEdge[]): { H: Float64Array; b: Float64Array; n: number } {
  const n = 3 * poses.length;
  const H = new Float64Array(n * n);
  const b = new Float64Array(n);
  const A = new Float64Array(9);
  const B = new Float64Array(9);
  for (const e of edges) {
    const xi = poses[e.i];
    const xj = poses[e.j];
    const c = Math.cos(xi.th);
    const s = Math.sin(xi.th);
    const dx = xj.x - xi.x;
    const dy = xj.y - xi.y;
    const err = [c * dx + s * dy - e.z.x, -s * dx + c * dy - e.z.y, wrapPi(xj.th - xi.th - e.z.th)];
    A.set([-c, -s, -s * dx + c * dy, s, -c, -c * dx - s * dy, 0, 0, -1]);
    B.set([c, s, 0, -s, c, 0, 0, 0, 1]);
    const w = e.info;
    const blocks: [Float64Array, number][] = [
      [A, 3 * e.i],
      [B, 3 * e.j],
    ];
    for (const [P, pi] of blocks) {
      for (let r = 0; r < 3; r++) {
        // b_p += Pᵀ Ω e
        let acc = 0;
        for (let m = 0; m < 3; m++) acc += P[m * 3 + r] * w[m] * err[m];
        b[pi + r] += acc;
      }
      for (const [Q, qi] of blocks) {
        // H_pq += Pᵀ Ω Q
        for (let r = 0; r < 3; r++)
          for (let cI = 0; cI < 3; cI++) {
            let acc = 0;
            for (let m = 0; m < 3; m++) acc += P[m * 3 + r] * w[m] * Q[m * 3 + cI];
            H[(pi + r) * n + qi + cI] += acc;
          }
      }
    }
  }
  for (let d = 0; d < 3; d++) H[d * n + d] += ANCHOR;
  return { H, b, n };
}

/** In-place Cholesky (lower triangle holds L). Returns false if the matrix is not positive definite. */
export function cholesky(A: Float64Array, n: number): boolean {
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j];
    for (let k = 0; k < j; k++) d -= A[j * n + k] * A[j * n + k];
    if (!(d > 0)) return false;
    const L = Math.sqrt(d);
    A[j * n + j] = L;
    for (let i = j + 1; i < n; i++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = s / L;
    }
  }
  return true;
}

/** Solve (L Lᵀ) x = rhs with the factor from cholesky(); overwrites rhs. */
export function cholSolve(L: Float64Array, n: number, rhs: Float64Array): Float64Array {
  for (let i = 0; i < n; i++) {
    let s = rhs[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * rhs[k];
    rhs[i] = s / L[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = rhs[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * rhs[k];
    rhs[i] = s / L[i * n + i];
  }
  return rhs;
}

export interface OptimiseResult {
  /** Accepted iterates, starting with the initial guess. */
  iterates: Pose2[][];
  /** χ² of each iterate. */
  chi2: number[];
  poses: Pose2[];
}

/** Gauss–Newton with Levenberg–Marquardt damping (λ only switched on when a full step fails to lower χ²). */
export function optimise(poses0: readonly Pose2[], edges: readonly PoseEdge[], opts: { maxIter?: number; tol?: number } = {}): OptimiseResult {
  const maxIter = opts.maxIter ?? 30;
  const tol = opts.tol ?? 1e-7;
  let x = poses0.map((p) => ({ ...p }));
  let cur = chi2(x, edges);
  const iterates = [x];
  const chis = [cur];
  let lambda = 0;
  for (let it = 0; it < maxIter; it++) {
    const { H, b, n } = buildSystem(x, edges);
    if (lambda > 0) for (let d = 0; d < n; d++) H[d * n + d] *= 1 + lambda;
    if (!cholesky(H, n)) {
      lambda = lambda ? lambda * 10 : 1e-3;
      continue;
    }
    const dx = cholSolve(H, n, b.map((v) => -v));
    const xn = x.map((p, i) => ({ x: p.x + dx[3 * i], y: p.y + dx[3 * i + 1], th: wrapPi(p.th + dx[3 * i + 2]) }));
    const nc = chi2(xn, edges);
    if (nc <= cur) {
      let step = 0;
      for (let k = 0; k < n; k++) step = Math.max(step, Math.abs(dx[k]));
      x = xn;
      const drop = cur - nc;
      cur = nc;
      iterates.push(x);
      chis.push(cur);
      lambda = lambda > 1e-6 ? lambda / 10 : 0;
      if (step < tol || drop < 1e-10 * Math.max(1, cur)) break;
    } else {
      lambda = lambda ? lambda * 10 : 1e-3;
      if (lambda > 1e10) break;
    }
  }
  return { iterates, chi2: chis, poses: x };
}

/** Marginal covariance of every pose: the 3×3 diagonal blocks of H⁻¹ (node 0 anchored, so its block is ≈ 0). */
export function marginals(poses: readonly Pose2[], edges: readonly PoseEdge[]): Cov3[] {
  const { H, n } = buildSystem(poses, edges);
  if (!cholesky(H, n)) return poses.map(() => zero3());
  const out: Cov3[] = [];
  const col = new Float64Array(n);
  for (let i = 0; i < poses.length; i++) {
    const S = new Float64Array(9);
    for (let c = 0; c < 3; c++) {
      col.fill(0);
      col[3 * i + c] = 1;
      cholSolve(H, n, col);
      for (let r = 0; r < 3; r++) S[r * 3 + c] = col[3 * i + r];
    }
    // symmetrise
    for (let r = 0; r < 3; r++) for (let c = r + 1; c < 3; c++) S[r * 3 + c] = S[c * 3 + r] = 0.5 * (S[r * 3 + c] + S[c * 3 + r]);
    out.push(S);
  }
  return out;
}

/** Ellipse of the x–y block: semi-axes for the confidence scale k (√5.991 = 2.448 for 95 % in 2D) and the major-axis angle. */
export function ellipseOf(S: Cov3, k = Math.sqrt(5.991)): { a: number; b: number; angle: number } {
  const sxx = S[0];
  const sxy = S[1];
  const syy = S[4];
  const m = (sxx + syy) / 2;
  const d = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
  const l1 = Math.max(0, m + d);
  const l2 = Math.max(0, m - d);
  return { a: k * Math.sqrt(l1), b: k * Math.sqrt(l2), angle: 0.5 * Math.atan2(2 * sxy, sxx - syy) };
}

/** Squared Mahalanobis distance of a position error under the x–y block (Infinity if singular). */
export function mahal2(S: Cov3, ex: number, ey: number): number {
  const a = S[0];
  const b = S[1];
  const d = S[4];
  const det = a * d - b * b;
  if (!(det > 1e-18)) return ex * ex + ey * ey < 1e-12 ? 0 : Infinity;
  return (d * ex * ex - 2 * b * ex * ey + a * ey * ey) / det;
}

/** Element-wise blend of two covariances (a convex combination of PSD matrices is PSD). */
export function lerpCov(a: Cov3, b: Cov3, t: number): Cov3 {
  const out = new Float64Array(9);
  for (let k = 0; k < 9; k++) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export function lerpPose(a: Pose2, b: Pose2, t: number): Pose2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, th: a.th + wrapPi(b.th - a.th) * t };
}
