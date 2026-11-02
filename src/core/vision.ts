// Camera geometry for the perception topic (summary notes §7): small 3-vector / 3×3 algebra, camera poses,
// the world → pixel pipeline in its three stages, back-projection, vanishing points, homographies and the planar
// pose of a fiducial (PnP for a flat target), and a Levenberg–Marquardt camera calibration over checkerboard views.
//
// Conventions: SI units and radians. Camera frame x right, y down, z forward along the optical axis; pixels u to the
// right, v down. A pose R, t maps world to camera: X_c = R X_w + t, with the camera centre C = −Rᵀt (rows of R are
// the camera axes written in the world). World frames in the simulations are z-up.
import { projectPoint, type Mat3, type V3 } from './camera';

export type { Mat3, V3 };
export type V2 = [number, number];

// ------------------------------------------------------------------ vectors and 3×3 matrices

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
export const lerp3 = (a: V3, b: V3, s: number): V3 => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];

export const I3 = (): Mat3 => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function mul(A: Mat3, B: Mat3): Mat3 {
  const C = I3();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return C;
}
export const mv = (M: Mat3, v: V3): V3 => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];
export const tr = (M: Mat3): Mat3 => [
  [M[0][0], M[1][0], M[2][0]],
  [M[0][1], M[1][1], M[2][1]],
  [M[0][2], M[1][2], M[2][2]],
];
export const col = (M: Mat3, j: number): V3 => [M[0][j], M[1][j], M[2][j]];
export const fromCols = (a: V3, b: V3, c: V3): Mat3 => [
  [a[0], b[0], c[0]],
  [a[1], b[1], c[1]],
  [a[2], b[2], c[2]],
];

export function det3(M: Mat3): number {
  return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
}

export function inv3(M: Mat3): Mat3 {
  const d = det3(M);
  const a = M;
  const k = 1 / d;
  return [
    [(a[1][1] * a[2][2] - a[1][2] * a[2][1]) * k, (a[0][2] * a[2][1] - a[0][1] * a[2][2]) * k, (a[0][1] * a[1][2] - a[0][2] * a[1][1]) * k],
    [(a[1][2] * a[2][0] - a[1][0] * a[2][2]) * k, (a[0][0] * a[2][2] - a[0][2] * a[2][0]) * k, (a[0][2] * a[1][0] - a[0][0] * a[1][2]) * k],
    [(a[1][0] * a[2][1] - a[1][1] * a[2][0]) * k, (a[0][1] * a[2][0] - a[0][0] * a[2][1]) * k, (a[0][0] * a[1][1] - a[0][1] * a[1][0]) * k],
  ];
}

export function rotX(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}
export function rotY(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}
export function rotZ(a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

/** Rodrigues: rotation vector θu → R = e^{[θu]}. */
export function expSO3(w: V3): Mat3 {
  const th = norm(w);
  if (th < 1e-12) return I3();
  const [x, y, z] = scale(w, 1 / th);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const C = 1 - c;
  return [
    [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
    [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
    [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
  ];
}

/** Inverse of expSO3: R → θu with θ ∈ [0, π]. */
export function logSO3(R: Mat3): V3 {
  const cth = Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2));
  const th = Math.acos(cth);
  if (th < 1e-9) return [0, 0, 0];
  if (Math.PI - th < 1e-6) {
    // θ ≈ π: axis from the diagonal of (R + I)/2 = u uᵀ.
    const xx = Math.sqrt(Math.max(0, (R[0][0] + 1) / 2));
    const yy = Math.sqrt(Math.max(0, (R[1][1] + 1) / 2));
    const zz = Math.sqrt(Math.max(0, (R[2][2] + 1) / 2));
    let u: V3 = xx >= yy && xx >= zz ? [xx, R[0][1] / (2 * xx), R[0][2] / (2 * xx)] : yy >= zz ? [R[0][1] / (2 * yy), yy, R[1][2] / (2 * yy)] : [R[0][2] / (2 * zz), R[1][2] / (2 * zz), zz];
    u = unit(u);
    return scale(u, th);
  }
  const k = th / (2 * Math.sin(th));
  return [(R[2][1] - R[1][2]) * k, (R[0][2] - R[2][0]) * k, (R[1][0] - R[0][1]) * k];
}

/** Nearest rotation to a nearly orthonormal matrix (Gram–Schmidt on the columns, keeping the first). */
export function orthonormalise(M: Mat3): Mat3 {
  const a = unit(col(M, 0));
  const b = unit(sub(col(M, 1), scale(a, dot(a, col(M, 1)))));
  return fromCols(a, b, cross(a, b));
}

// ------------------------------------------------------------------ camera poses and the pipeline

/** A camera pose: R maps world to camera (rows = the camera's x̂, ŷ, ẑ in the world), C is the camera centre. */
export interface CamPose {
  R: Mat3;
  C: V3;
}

/** t = −R C, so that X_c = R X_w + t. */
export const camT = (p: CamPose): V3 => scale(mv(p.R, p.C), -1);

/**
 * A camera at C in a z-up world, looking with yaw ψ (about world z, measured from +x) and pitch (positive looks up),
 * then rolled about its optical axis. Its x̂ points right in the image, ŷ down, ẑ along the view direction.
 */
export function camLook(C: V3, yaw: number, pitch: number, roll = 0): CamPose {
  const f: V3 = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  let r = unit(cross(f, [0, 0, 1]));
  if (norm(cross(f, [0, 0, 1])) < 1e-9) r = [Math.sin(yaw), -Math.cos(yaw), 0];
  let d = cross(f, r);
  if (roll) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const r2 = add(scale(r, c), scale(d, s));
    d = sub(scale(d, c), scale(r, s));
    r = r2;
  }
  return { R: [r, d, f], C };
}

/** Yaw and pitch that point a camera at C towards the point T. */
export function aimAt(C: V3, T: V3): { yaw: number; pitch: number } {
  const d = sub(T, C);
  return { yaw: Math.atan2(d[1], d[0]), pitch: Math.atan2(d[2], Math.hypot(d[0], d[1])) };
}

/** The three stages of image formation, with every intermediate value. */
export interface Stages {
  Xc: V3;
  /** Normalised image coordinates after the perspective division. */
  x: number;
  y: number;
  u: number;
  v: number;
  /** In front of the camera (Z_c > 0). */
  front: boolean;
}

/** World point → pixel: X_c = R X_w + t (extrinsics), (x, y) = (X_c/Z_c, Y_c/Z_c), (u, v, 1)ᵀ = K (x, y, 1)ᵀ. */
export function stages(K: Mat3, pose: CamPose, Xw: V3): Stages {
  const p = projectPoint(K, pose.R, camT(pose), Xw);
  return { Xc: p.Xc, x: p.x, y: p.y, u: p.u, v: p.v, front: p.visible };
}

/** Pixel of a camera-frame point (null if it is behind the camera). */
export function pixelOf(K: Mat3, Xc: V3): V2 | null {
  if (Xc[2] <= 1e-9) return null;
  const x = Xc[0] / Xc[2];
  const y = Xc[1] / Xc[2];
  return [K[0][0] * x + K[0][1] * y + K[0][2], K[1][1] * y + K[1][2]];
}

/** Back-projection: the unit direction (in the world) of the ray through pixel (u, v): d ∝ Rᵀ K⁻¹ (u, v, 1)ᵀ. */
export function pixelRay(K: Mat3, pose: CamPose, u: number, v: number): V3 {
  return unit(mv(tr(pose.R), mv(inv3(K), [u, v, 1])));
}

/** Normalised camera coordinates of a pixel: (x, y, 1)ᵀ = K⁻¹ (u, v, 1)ᵀ. */
export function normalised(K: Mat3, u: number, v: number): V2 {
  const p = mv(inv3(K), [u, v, 1]);
  return [p[0] / p[2], p[1] / p[2]];
}

/** Vanishing point of world direction d: the image of the point at infinity, K R d (null if d is parallel to the image plane). */
export function vanishingPoint(K: Mat3, pose: CamPose, d: V3): V2 | null {
  const dc = mv(pose.R, d);
  if (Math.abs(dc[2]) < 1e-9) return null;
  const p = mv(K, dc);
  return [p[0] / p[2], p[1] / p[2]];
}

/** Clip a camera-frame segment to Z_c ≥ zmin (so lines that pass behind the camera still draw their visible part). */
export function clipFront(a: V3, b: V3, zmin = 1e-3): [V3, V3] | null {
  if (a[2] < zmin && b[2] < zmin) return null;
  if (a[2] >= zmin && b[2] >= zmin) return [a, b];
  const s = (zmin - a[2]) / (b[2] - a[2]);
  const m = lerp3(a, b, s);
  return a[2] < zmin ? [m, b] : [a, m];
}

/** Angle (radians) at vertex b between image points a and c. */
export function angleAt(a: V2, b: V2, c: V2): number {
  const u = [a[0] - b[0], a[1] - b[1]];
  const v = [c[0] - b[0], c[1] - b[1]];
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1))));
}

// ------------------------------------------------------------------ small dense linear algebra

/** Solve A x = b by Gaussian elimination with partial pivoting (null if singular). */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    if (p !== c) [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x.every(Number.isFinite) ? x : null;
}

/** AᵀA and Aᵀb for a tall system. */
function normalEq(A: number[][], b: number[]): { AtA: number[][]; Atb: number[] } {
  const n = A[0].length;
  const AtA = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const Atb = new Array<number>(n).fill(0);
  for (let r = 0; r < A.length; r++) {
    const row = A[r];
    for (let i = 0; i < n; i++) {
      const ri = row[i];
      if (!ri) continue;
      Atb[i] += ri * b[r];
      for (let j = i; j < n; j++) AtA[i][j] += ri * row[j];
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) AtA[i][j] = AtA[j][i];
  return { AtA, Atb };
}

/** Least squares min ‖A x − b‖ through the normal equations (the systems here are small and well scaled). */
export function lstsq(A: number[][], b: number[]): number[] | null {
  const { AtA, Atb } = normalEq(A, b);
  return solveLinear(AtA, Atb);
}

// ------------------------------------------------------------------ homographies and the pose of a flat target

function normalising(pts: V2[]): { T: Mat3; p: V2[] } {
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x;
    my += y;
  }
  mx /= pts.length;
  my /= pts.length;
  let d = 0;
  for (const [x, y] of pts) d += Math.hypot(x - mx, y - my);
  const s = Math.SQRT2 / (d / pts.length || 1);
  return {
    T: [
      [s, 0, -s * mx],
      [0, s, -s * my],
      [0, 0, 1],
    ],
    p: pts.map(([x, y]) => [s * (x - mx), s * (y - my)] as V2),
  };
}

/** Homography H (h₃₃ = 1) with dst ∝ H src, from ≥ 4 correspondences (normalised DLT, least squares). */
export function homography(src: V2[], dst: V2[]): Mat3 | null {
  if (src.length < 4 || src.length !== dst.length) return null;
  const a = normalising(src);
  const b = normalising(dst);
  const A: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const [x, y] = a.p[i];
    const [u, v] = b.p[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }
  const h = lstsq(A, rhs);
  if (!h) return null;
  const Hn: Mat3 = [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
  return mul(inv3(b.T), mul(Hn, a.T));
}

export const applyH = (H: Mat3, p: V2): V2 => {
  const q = mv(H, [p[0], p[1], 1]);
  return [q[0] / q[2], q[1] / q[2]];
};

/**
 * Pose of a flat target (points (X, Y, 0) in its own frame) from its homography to the image: K⁻¹H ∝ [r₁ r₂ t].
 * Returns R, t (target → camera) and the camera centre C in the target frame.
 */
export function poseFromHomography(K: Mat3, H: Mat3): { R: Mat3; t: V3; C: V3 } {
  const M = mul(inv3(K), H);
  const h1 = col(M, 0);
  const h2 = col(M, 1);
  const h3 = col(M, 2);
  let lam = 2 / (norm(h1) + norm(h2));
  if (h3[2] * lam < 0) lam = -lam; // the target is in front of the camera
  const R = orthonormalise(fromCols(scale(h1, lam), scale(h2, lam), cross(h1, h2)));
  const t = scale(h3, lam);
  return { R, t, C: scale(mv(tr(R), t), -1) };
}

/** Planar PnP: the camera pose from ≥ 4 coplanar target points (target z = 0) and their pixels. */
export function planarPose(K: Mat3, target: V2[], pixels: V2[]): { R: Mat3; t: V3; C: V3 } | null {
  const H = homography(target, pixels);
  return H ? poseFromHomography(K, H) : null;
}

// ------------------------------------------------------------------ calibration (Levenberg–Marquardt)

/**
 * Parameters: [αx, αy, u0, v0, then per view rx, ry, rz (rotation vector), tx, ty, tz]. Zero skew, no distortion.
 * Residuals: reprojected minus detected pixel, u then v, for every corner of every view.
 */
export function calibResiduals(p: number[], board: V3[], obs: V2[][]): number[] {
  const out = new Array<number>(2 * board.length * obs.length);
  for (let k = 0; k < obs.length; k++) viewResiduals(p, k, board, obs[k], out, 2 * k * board.length);
  return out;
}

/** Residuals of view k only, written into out from index `at` (its pose parameters touch nothing else). */
function viewResiduals(p: number[], k: number, board: V3[], obs: V2[], out: number[], at: number) {
  const [ax, ay, u0, v0] = p;
  const o = 4 + 6 * k;
  const R = expSO3([p[o], p[o + 1], p[o + 2]]);
  const tx = p[o + 3];
  const ty = p[o + 4];
  const tz = p[o + 5];
  for (let i = 0; i < board.length; i++) {
    const b = board[i];
    const X = R[0][0] * b[0] + R[0][1] * b[1] + R[0][2] * b[2] + tx;
    const Y = R[1][0] * b[0] + R[1][1] * b[1] + R[1][2] * b[2] + ty;
    const Zr = R[2][0] * b[0] + R[2][1] * b[1] + R[2][2] * b[2] + tz;
    const z = Zr > 1e-6 ? Zr : 1e-6;
    out[at + 2 * i] = ax * (X / z) + u0 - obs[i][0];
    out[at + 2 * i + 1] = ay * (Y / z) + v0 - obs[i][1];
  }
}

export const rmsOf = (r: number[]) => Math.sqrt(r.reduce((s, x) => s + x * x, 0) / Math.max(1, r.length / 2));

export interface CalibIter {
  params: number[];
  /** RMS reprojection error per corner (pixels). */
  rms: number;
  lambda: number;
}

/** Levenberg–Marquardt over intrinsics and every view's pose; returns the history, starting with the initial guess. */
export function calibrateLM(board: V3[], obs: V2[][], init: number[], iters = 12): CalibIter[] {
  let p = init.slice();
  let r = calibResiduals(p, board, obs);
  let cost = r.reduce((s, x) => s + x * x, 0);
  let lam = 1e-2;
  const hist: CalibIter[] = [{ params: p.slice(), rms: rmsOf(r), lambda: lam }];
  const n = p.length;
  for (let it = 0; it < iters; it++) {
    // Forward-difference Jacobian.
    // Intrinsic columns touch every view; a view's pose columns touch only that view's rows (sparse).
    const J: number[][] = r.map(() => new Array<number>(n).fill(0));
    const nb = 2 * board.length;
    const tmp = new Array<number>(nb);
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(p[j]));
      const q = p.slice();
      q[j] += h;
      if (j < 4) {
        const rq = calibResiduals(q, board, obs);
        for (let i = 0; i < r.length; i++) J[i][j] = (rq[i] - r[i]) / h;
      } else {
        const k = Math.floor((j - 4) / 6);
        viewResiduals(q, k, board, obs[k], tmp, 0);
        for (let i = 0; i < nb; i++) J[k * nb + i][j] = (tmp[i] - r[k * nb + i]) / h;
      }
    }
    const { AtA, Atb } = normalEq(
      J,
      r.map((x) => -x)
    );
    let accepted = false;
    for (let tries = 0; tries < 8 && !accepted; tries++) {
      const A = AtA.map((row, i) => row.map((x, j) => (i === j ? x + lam * Math.max(x, 1e-9) : x)));
      const d = solveLinear(A, Atb);
      if (d) {
        const q = p.map((x, i) => x + d[i]);
        const rq = calibResiduals(q, board, obs);
        const c = rq.reduce((s, x) => s + x * x, 0);
        if (c < cost) {
          p = q;
          r = rq;
          cost = c;
          lam = Math.max(1e-7, lam / 5);
          accepted = true;
        }
      }
      if (!accepted) lam *= 8;
    }
    hist.push({ params: p.slice(), rms: rmsOf(r), lambda: lam });
    if (!accepted) break;
  }
  return hist;
}
