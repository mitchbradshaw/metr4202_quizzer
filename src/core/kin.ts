// Forward and inverse kinematics with the product of exponentials (summary notes §6; Modern Robotics).
//   Screw axis S = (ω, v): revolute v = −ω × q (q any point on the axis); prismatic ω = 0, v = unit direction.
//   Space form T(θ) = e^[S1]θ1 ⋯ e^[Sn]θn M;  body form T(θ) = M e^[B1]θ1 ⋯ e^[Bn]θn,  B_i = Ad_{M⁻¹} S_i.
// Also: the exam robots encoded symbolically (lengths L1, L2 … as linear forms), so M and the screw-axis
// tables can be produced exactly as the worked solutions print them, and checked cell by cell.

export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];
export type Mat4 = number[][]; // 4 × 4 homogeneous transform
export type Mat = number[][];

export interface Screw {
  w: Vec3;
  v: Vec3;
}

// ------------------------------------------------------------------ vectors and matrices

export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** [ω]: the 3 × 3 skew-symmetric matrix with [ω]x = ω × x. */
export function skew(w: Vec3): Mat3 {
  return [
    [0, -w[2], w[1]],
    [w[2], 0, -w[0]],
    [-w[1], w[0], 0],
  ];
}

export function matMul(A: Mat, B: Mat): Mat {
  const n = A.length;
  const m = B[0].length;
  const k = B.length;
  const C: Mat = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += A[i][t] * B[t][j];
      C[i][j] = s;
    }
  return C;
}

export const transpose = (A: Mat): Mat => A[0].map((_, j) => A.map((r) => r[j]));
export const identity = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

export function mat3Vec(R: Mat3 | Mat, v: Vec3): Vec3 {
  return [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
}

export function det3(R: Mat3 | Mat): number {
  return R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
}

/** Build a homogeneous transform from R (3 × 3) and p. */
export function rp(R: Mat3 | Mat, p: Vec3): Mat4 {
  return [
    [R[0][0], R[0][1], R[0][2], p[0]],
    [R[1][0], R[1][1], R[1][2], p[1]],
    [R[2][0], R[2][1], R[2][2], p[2]],
    [0, 0, 0, 1],
  ];
}

export const rotOf = (T: Mat4): Mat3 => [
  [T[0][0], T[0][1], T[0][2]],
  [T[1][0], T[1][1], T[1][2]],
  [T[2][0], T[2][1], T[2][2]],
];
export const posOf = (T: Mat4): Vec3 => [T[0][3], T[1][3], T[2][3]];

export function invT(T: Mat4): Mat4 {
  const R = rotOf(T);
  const Rt = transpose(R) as Mat3;
  const p = posOf(T);
  return rp(Rt, scale3(mat3Vec(Rt, p), -1));
}

/** Apply a transform to a point. */
export const applyT = (T: Mat4, x: Vec3): Vec3 => add3(mat3Vec(rotOf(T), x), posOf(T));

// ------------------------------------------------------------------ exponentials

/** Rodrigues: rotation about unit axis ŵ by θ: R = I + sinθ[ŵ] + (1 − cosθ)[ŵ]². */
export function rodrigues(w: Vec3, th: number): Mat3 {
  const K = skew(w);
  const K2 = matMul(K, K);
  const s = Math.sin(th);
  const c = 1 - Math.cos(th);
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + s * K[i][j] + c * K2[i][j])) as Mat3;
}

/** e^[S]θ for a unit screw axis (‖ω‖ = 1, or ω = 0 and ‖v‖ = 1). */
export function expScrew(S: Screw, th: number): Mat4 {
  if (norm3(S.w) < 1e-12) return rp(identity(3), scale3(S.v, th));
  const R = rodrigues(S.w, th);
  const K = skew(S.w);
  const K2 = matMul(K, K);
  const G = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? th : 0) + (1 - Math.cos(th)) * K[i][j] + (th - Math.sin(th)) * K2[i][j]));
  return rp(R, mat3Vec(G, S.v));
}

/** Screw axis of a revolute joint: S = (ω, −ω × q). */
export const screwR = (w: Vec3, q: Vec3): Screw => ({ w, v: scale3(cross3(w, q), -1) });
/** Screw axis of a prismatic joint: S = (0, v). */
export const screwP = (v: Vec3): Screw => ({ w: [0, 0, 0], v });

/** Adjoint map: Ad_T S = (Rω, [p]Rω + Rv). */
export function adjoint(T: Mat4, S: Screw): Screw {
  const R = rotOf(T);
  const p = posOf(T);
  const Rw = mat3Vec(R, S.w);
  return { w: Rw, v: add3(cross3(p, Rw), mat3Vec(R, S.v)) };
}

/** 6 × 6 adjoint matrix [[R, 0], [[p]R, R]]. */
export function adjointMatrix(T: Mat4): Mat {
  const R = rotOf(T);
  const pR = matMul(skew(posOf(T)), R);
  const A: Mat = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      A[i][j] = R[i][j];
      A[i + 3][j + 3] = R[i][j];
      A[i + 3][j] = pR[i][j];
    }
  return A;
}

/** Space-form PoE: T(θ) = e^[S1]θ1 ⋯ e^[Sn]θn M. */
export function fkSpace(M: Mat4, S: readonly Screw[], th: readonly number[]): Mat4 {
  let T: Mat4 = identity(4);
  S.forEach((s, i) => (T = matMul(T, expScrew(s, th[i]))));
  return matMul(T, M);
}

/** Body-form PoE: T(θ) = M e^[B1]θ1 ⋯ e^[Bn]θn. */
export function fkBody(M: Mat4, B: readonly Screw[], th: readonly number[]): Mat4 {
  let T: Mat4 = M;
  B.forEach((b, i) => (T = matMul(T, expScrew(b, th[i]))));
  return T;
}

/** Partial products e^[S1]θ1 ⋯ e^[Sk]θk for k = 0 … n (k = 0 is I): where each link has moved. */
export function partialSpace(S: readonly Screw[], th: readonly number[]): Mat4[] {
  const out: Mat4[] = [identity(4)];
  S.forEach((s, i) => out.push(matMul(out[i], expScrew(s, th[i]))));
  return out;
}

/** B_i = Ad_{M⁻¹} S_i. */
export const spaceToBody = (M: Mat4, S: readonly Screw[]): Screw[] => S.map((s) => adjoint(invT(M), s));
/** S_i = Ad_M B_i. */
export const bodyToSpace = (M: Mat4, B: readonly Screw[]): Screw[] => B.map((b) => adjoint(M, b));

/** Space Jacobian: J_s1 = S1, J_si = Ad_{e^[S1]θ1⋯e^[S_{i−1}]θ_{i−1}} S_i (columns as screws). */
export function jacobianSpace(S: readonly Screw[], th: readonly number[]): Screw[] {
  const P = partialSpace(S, th);
  return S.map((s, i) => adjoint(P[i], s));
}

/** Body Jacobian: J_bn = B_n, J_bi = Ad_{e^−[B_n]θ_n ⋯ e^−[B_{i+1}]θ_{i+1}} B_i. */
export function jacobianBody(B: readonly Screw[], th: readonly number[]): Screw[] {
  const n = B.length;
  const out: Screw[] = new Array(n);
  let T: Mat4 = identity(4);
  for (let i = n - 1; i >= 0; i--) {
    out[i] = adjoint(T, B[i]);
    T = matMul(T, expScrew(B[i], -th[i]));
  }
  return out;
}

/** Jacobian columns as a 6 × n matrix (rows ωx ωy ωz vx vy vz). */
export const jacobianMatrix = (cols: readonly Screw[]): Mat => [0, 1, 2, 3, 4, 5].map((r) => cols.map((c) => (r < 3 ? c.w[r] : c.v[r - 3])));

// ------------------------------------------------------------------ matrix logarithm and IK

/** log of a rotation: returns ωθ (axis × angle), θ in [0, π]. */
export function logRot(R: Mat3): Vec3 {
  const c = Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2));
  const th = Math.acos(c);
  if (th < 1e-9) return [0, 0, 0];
  if (Math.PI - th < 1e-6) {
    // θ ≈ π: use the diagonal.
    let w: Vec3;
    if (R[2][2] > -1 + 1e-9) w = scale3([R[0][2], R[1][2], 1 + R[2][2]], 1 / Math.sqrt(2 * (1 + R[2][2])));
    else if (R[1][1] > -1 + 1e-9) w = scale3([R[0][1], 1 + R[1][1], R[2][1]], 1 / Math.sqrt(2 * (1 + R[1][1])));
    else w = scale3([1 + R[0][0], R[1][0], R[2][0]], 1 / Math.sqrt(2 * (1 + R[0][0])));
    return scale3(w, th);
  }
  const k = th / (2 * Math.sin(th));
  return [k * (R[2][1] - R[1][2]), k * (R[0][2] - R[2][0]), k * (R[1][0] - R[0][1])];
}

/** log of a transform: the twist V = (ωθ, vθ) with e^[V] = T. */
export function logT(T: Mat4): Screw {
  const R = rotOf(T);
  const p = posOf(T);
  const wt = logRot(R);
  const th = norm3(wt);
  if (th < 1e-9) return { w: [0, 0, 0], v: p };
  const w = scale3(wt, 1 / th);
  const K = skew(w);
  const K2 = matMul(K, K);
  const cot = 1 / Math.tan(th / 2);
  // G⁻¹(θ) = I/θ − [ω]/2 + (1/θ − cot(θ/2)/2)[ω]²
  const Gi = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 / th : 0) - K[i][j] / 2 + (1 / th - cot / 2) * K2[i][j]));
  return { w: wt, v: scale3(mat3Vec(Gi, p), th) };
}

/** Solve A x = b (small dense systems, partial pivoting). */
export function solve(A: Mat, b: number[]): number[] {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-14) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => (Math.abs(r[i]) < 1e-14 ? 0 : r[n] / r[i]));
}

/** Damped pseudoinverse step: Δθ = Jᵀ(JJᵀ + λ²I)⁻¹ e  (λ = 0 gives the right pseudoinverse for full-rank J). */
export function pinvStep(J: Mat, e: number[], lambda = 1e-6): number[] {
  const JJt = matMul(J, transpose(J));
  for (let i = 0; i < JJt.length; i++) JJt[i][i] += lambda * lambda;
  const y = solve(JJt, e);
  return transpose(J).map((row) => row.reduce((s, x, i) => s + x * y[i], 0));
}

export interface IkIterate {
  theta: number[];
  /** ‖ω_b‖ and ‖v_b‖ of the error twist. */
  errW: number;
  errV: number;
}

/**
 * Newton–Raphson IK in the body frame (Modern Robotics Alg. 6.2): V_b = log(T_sb(θ)⁻¹ T_sd);
 * θ ← θ + J_b(θ)† V_b until ‖ω_b‖ < εω and ‖v_b‖ < εv. Returns every iterate.
 */
export function ikNewtonRaphson(M: Mat4, B: readonly Screw[], Tsd: Mat4, theta0: readonly number[], o: { epsW?: number; epsV?: number; maxIter?: number; lambda?: number } = {}): { iterates: IkIterate[]; converged: boolean } {
  const epsW = o.epsW ?? 1e-4;
  const epsV = o.epsV ?? 1e-4;
  const maxIter = o.maxIter ?? 40;
  let th = theta0.slice();
  const iterates: IkIterate[] = [];
  for (let k = 0; k <= maxIter; k++) {
    const Vb = logT(matMul(invT(fkBody(M, B, th)), Tsd));
    const errW = norm3(Vb.w);
    const errV = norm3(Vb.v);
    iterates.push({ theta: th.slice(), errW, errV });
    if (errW < epsW && errV < epsV) return { iterates, converged: true };
    if (k === maxIter) break;
    const J = jacobianMatrix(jacobianBody(B, th));
    const d = pinvStep(J, [...Vb.w, ...Vb.v], o.lambda ?? 1e-6);
    th = th.map((t, i) => t + d[i]);
  }
  return { iterates, converged: false };
}

// ------------------------------------------------------------------ planar arms (IK viewer)

/** Joint positions of a planar serial arm (base at the origin), θ relative, angles from +x. */
export function planarFk(lengths: readonly number[], th: readonly number[]): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  let a = 0;
  let x = 0;
  let y = 0;
  lengths.forEach((L, i) => {
    a += th[i];
    x += L * Math.cos(a);
    y += L * Math.sin(a);
    pts.push([x, y]);
  });
  return pts;
}

/** 2 × n Jacobian of the tip position of a planar arm. */
export function planarJacobian(lengths: readonly number[], th: readonly number[]): Mat {
  const n = lengths.length;
  const J: Mat = [new Array<number>(n).fill(0), new Array<number>(n).fill(0)];
  const cum: number[] = [];
  th.reduce((s, t, i) => (cum[i] = s + t), 0);
  for (let j = 0; j < n; j++)
    for (let i = j; i < n; i++) {
      J[0][j] -= lengths[i] * Math.sin(cum[i]);
      J[1][j] += lengths[i] * Math.cos(cum[i]);
    }
  return J;
}

/** Newton–Raphson for a planar arm's tip position: θ ← θ + J† (x_d − f(θ)). Returns every iterate. */
export function planarIk(lengths: readonly number[], target: [number, number], theta0: readonly number[], o: { maxIter?: number; tol?: number; lambda?: number; maxStep?: number } = {}): { iterates: { theta: number[]; tip: [number, number]; err: number }[]; converged: boolean } {
  const maxIter = o.maxIter ?? 30;
  const tol = o.tol ?? 1e-4;
  let th = theta0.slice();
  const iterates: { theta: number[]; tip: [number, number]; err: number }[] = [];
  for (let k = 0; k <= maxIter; k++) {
    const pts = planarFk(lengths, th);
    const tip = pts[pts.length - 1];
    const e = [target[0] - tip[0], target[1] - tip[1]];
    const err = Math.hypot(e[0], e[1]);
    iterates.push({ theta: th.slice(), tip, err });
    if (err < tol) return { iterates, converged: true };
    if (k === maxIter) break;
    let d = pinvStep(planarJacobian(lengths, th), e, o.lambda ?? 1e-6);
    const ms = o.maxStep ?? Infinity;
    const dn = Math.hypot(...d);
    if (dn > ms) d = d.map((x) => (x * ms) / dn);
    th = th.map((t, i) => t + d[i]);
  }
  return { iterates, converged: false };
}

// ------------------------------------------------------------------ symbolic lengths (linear forms)

/** A linear form in the length symbols: { L1: −1, L3: 1 } is −L1 + L3; the key '1' holds a constant. */
export type Lin = Record<string, number>;
export type LinVec = [Lin, Lin, Lin];

const clean = (a: Lin): Lin => Object.fromEntries(Object.entries(a).filter(([, c]) => Math.abs(c) > 1e-12));
export const L = (sym: string, c = 1): Lin => ({ [sym]: c });
export const C = (c: number): Lin => clean({ '1': c });
export const ZERO: Lin = {};
export function linAdd(...xs: Lin[]): Lin {
  const out: Lin = {};
  for (const x of xs) for (const [k, c] of Object.entries(x)) out[k] = (out[k] ?? 0) + c;
  return clean(out);
}
export const linScale = (a: Lin, s: number): Lin => clean(Object.fromEntries(Object.entries(a).map(([k, c]) => [k, c * s])));
export const linNeg = (a: Lin): Lin => linScale(a, -1);
export const linEval = (a: Lin, vals: Record<string, number>): number => Object.entries(a).reduce((t, [k, c]) => t + c * (k === '1' ? 1 : vals[k] ?? NaN), 0);
export const linVecEval = (v: LinVec, vals: Record<string, number>): Vec3 => [linEval(v[0], vals), linEval(v[1], vals), linEval(v[2], vals)];
export const linVecAdd = (a: LinVec, b: LinVec): LinVec => [linAdd(a[0], b[0]), linAdd(a[1], b[1]), linAdd(a[2], b[2])];
export const linVecSub = (a: LinVec, b: LinVec): LinVec => [linAdd(a[0], linNeg(b[0])), linAdd(a[1], linNeg(b[1])), linAdd(a[2], linNeg(b[2]))];
export const numVec = (v: Vec3): LinVec => [C(v[0]), C(v[1]), C(v[2])];

/** Numeric ω × symbolic q (linear in the symbols). */
export function crossNL(w: Vec3, q: LinVec): LinVec {
  return [linAdd(linScale(q[2], w[1]), linScale(q[1], -w[2])), linAdd(linScale(q[0], w[2]), linScale(q[2], -w[0])), linAdd(linScale(q[1], w[0]), linScale(q[0], -w[1]))];
}

/** Rᵀ q for numeric R and symbolic q. */
export function matTLin(R: Mat3, q: LinVec): LinVec {
  return [0, 1, 2].map((j) => linAdd(linScale(q[0], R[0][j]), linScale(q[1], R[1][j]), linScale(q[2], R[2][j]))) as LinVec;
}

const symOrder = (a: string, b: string) => (a === '1' ? 1 : b === '1' ? -1 : a.localeCompare(b, undefined, { numeric: true }));

/** '-L1+L3', '0', '2*L2', '0.5' — the form typed into answer boxes (parsed by src/engine/expr.ts). */
export function linStr(a: Lin): string {
  const ks = Object.keys(a).sort(symOrder);
  if (!ks.length) return '0';
  return ks
    .map((k, i) => {
      const c = a[k];
      const mag = Math.abs(c);
      const body = k === '1' ? `${+mag.toPrecision(10)}` : mag === 1 ? k : `${+mag.toPrecision(10)}*${k}`;
      return (c < 0 ? '-' : i ? '+' : '') + body;
    })
    .join('');
}

/** TeX for a linear form: −L_1 + L_3. Symbols like 'L12' become L_{12}. */
export function linTeX(a: Lin): string {
  const ks = Object.keys(a).sort(symOrder);
  if (!ks.length) return '0';
  const sym = (k: string) => k.replace(/^([A-Za-z]+)(\d+)$/, (_m, s: string, d: string) => (d.length > 1 ? `${s}_{${d}}` : `${s}_${d}`));
  return ks
    .map((k, i) => {
      const c = a[k];
      const mag = Math.abs(c);
      const body = k === '1' ? `${+mag.toPrecision(10)}` : mag === 1 ? sym(k) : `${+mag.toPrecision(10)}${sym(k)}`;
      return (c < 0 ? (i ? ' - ' : '-') : i ? ' + ' : '') + body;
    })
    .join('');
}

export const linVecTeX = (v: LinVec) => `(${v.map(linTeX).join(', ')})`;
export const vecTeX = (v: Vec3) => `(${v.map((x) => (Math.abs(x) < 1e-12 ? '0' : `${+x.toPrecision(10)}`)).join(', ')})`;

// ------------------------------------------------------------------ robots

export interface JointSpec {
  type: 'R' | 'P';
  /** Revolute: unit axis ω in {s} (sign from the drawn arrow, right-hand rule). Prismatic: unit direction of travel. */
  axis: Vec3;
  /** A point on the joint axis in {s} at the zero configuration (where the joint is drawn). */
  q: LinVec;
}

export interface LinkPolyline {
  /** Number of joints before this piece of the arm (0 = fixed base; n = after the last joint). */
  after: number;
  pts: LinVec[];
}

export interface ArmSpec {
  id: string;
  name: string;
  source: string;
  /** Length symbols, e.g. ['L1', 'L2', 'L3']. */
  symbols: string[];
  /** Numbers used for drawing and numeric parts (the paper's values where it gives them). */
  values: Record<string, number>;
  joints: JointSpec[];
  /** {b} at the zero configuration: rotation (columns x̂_b, ŷ_b, ẑ_b in {s}) and origin, in {s}. */
  R: Mat3;
  p: LinVec;
  links: LinkPolyline[];
  /** How the paper draws {s}: which {s} directions point to screen-right, screen-up and out of the page. */
  view: { right: Vec3; up: Vec3; out: Vec3 };
  /** Frame names on the paper, e.g. { s: '{1}', b: '{4}' }. */
  frames?: { s: string; b: string };
  /** Screw axes asked in this frame on the paper. */
  askedIn: 's' | 'b';
}

export interface SymScrew {
  w: Vec3;
  v: LinVec;
  /** Point on the axis used (revolute), in the frame of the table; null for prismatic. */
  q: LinVec | null;
}

/** Screw axis of joint i in {s}, symbolically. */
export function symScrewS(arm: ArmSpec, i: number): SymScrew {
  const j = arm.joints[i];
  if (j.type === 'P') return { w: [0, 0, 0], v: numVec(j.axis), q: null };
  return { w: j.axis, v: crossNL(j.axis, j.q).map(linNeg) as LinVec, q: j.q };
}

/** Screw axis of joint i in {b}: ω_b = Rᵀω, q_b = Rᵀ(q − p), v_b = −ω_b × q_b. */
export function symScrewB(arm: ArmSpec, i: number): SymScrew {
  const j = arm.joints[i];
  const Rt = (v: Vec3): Vec3 => [arm.R[0][0] * v[0] + arm.R[1][0] * v[1] + arm.R[2][0] * v[2], arm.R[0][1] * v[0] + arm.R[1][1] * v[1] + arm.R[2][1] * v[2], arm.R[0][2] * v[0] + arm.R[1][2] * v[1] + arm.R[2][2] * v[2]];
  if (j.type === 'P') return { w: [0, 0, 0], v: numVec(Rt(j.axis)), q: null };
  const wb = Rt(j.axis);
  const qb = matTLin(arm.R, linVecSub(j.q, arm.p));
  return { w: wb, v: crossNL(wb, qb).map(linNeg) as LinVec, q: qb };
}

export const armM = (arm: ArmSpec, vals = arm.values): Mat4 => rp(arm.R, linVecEval(arm.p, vals));
export const armScrewsS = (arm: ArmSpec, vals = arm.values): Screw[] => arm.joints.map((_, i) => {
  const s = symScrewS(arm, i);
  return { w: s.w, v: linVecEval(s.v, vals) };
});
export const armScrewsB = (arm: ArmSpec, vals = arm.values): Screw[] => arm.joints.map((_, i) => {
  const s = symScrewB(arm, i);
  return { w: s.w, v: linVecEval(s.v, vals) };
});

/** The M matrix as strings for a symbolic answer table (4 × 4). */
export function mStrings(arm: ArmSpec): string[][] {
  const num = (x: number) => (Math.abs(x) < 1e-12 ? '0' : `${x}`);
  return [0, 1, 2].map((i) => [num(arm.R[i][0]), num(arm.R[i][1]), num(arm.R[i][2]), linStr(arm.p[i])]).concat([['0', '0', '0', '1']]);
}

/** Screw table rows (ωx ωy ωz vx vy vz) as strings, in {s} or {b}. */
export function screwStrings(arm: ArmSpec, frame: 's' | 'b'): string[][] {
  return arm.joints.map((_, i) => {
    const s = frame === 's' ? symScrewS(arm, i) : symScrewB(arm, i);
    return [...s.w.map((x) => (Math.abs(x) < 1e-12 ? '0' : `${x}`)), ...s.v.map(linStr)];
  });
}

/** Where each link polyline is at configuration θ (space-form partial products). */
export function armLinksAt(arm: ArmSpec, th: readonly number[], vals = arm.values): Vec3[][] {
  const P = partialSpace(armScrewsS(arm, vals), th);
  return arm.links.map((l) => l.pts.map((p) => applyT(P[l.after], linVecEval(p, vals))));
}

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
const NX: Vec3 = [-1, 0, 0];
const v = (a: Lin, b: Lin, c: Lin): LinVec => [a, b, c];
const O = ZERO;

/**
 * The exam robots. Joint axes, points and frames follow the worked solutions' reading of each figure
 * (2023 Q33, 2024 Q30, 2025 Q30, the review deck's {b}-frame example and the 2022 kinematics questions).
 */
export const EXAM_ARMS: ArmSpec[] = [
  {
    id: 'rprr-2023',
    name: '2023 Q33: RPRR arm',
    source: '2023 Q33; worked solutions',
    symbols: ['L1', 'L2', 'L3'],
    values: { L1: 1.5, L2: 0.2, L3: 0.4 },
    // x̂s out of the page (drawn down-left), ŷs right, ẑs up.
    joints: [
      { type: 'R', axis: Z, q: v(O, O, O) },
      { type: 'P', axis: Z, q: v(O, O, C(0.5)) },
      { type: 'R', axis: X, q: v(O, O, L('L1')) },
      { type: 'R', axis: Y, q: v(L('L2', -1), L('L3'), L('L1')) },
    ],
    R: [
      [0, -1, 0],
      [0, 0, 1],
      [-1, 0, 0],
    ],
    p: v(L('L2', -1), L('L3'), L('L1')),
    links: [
      { after: 1, pts: [v(O, O, O), v(O, O, C(0.35))] },
      { after: 2, pts: [v(O, O, C(0.35)), v(O, O, L('L1')), v(L('L2', -1), O, L('L1'))] },
      { after: 3, pts: [v(L('L2', -1), O, L('L1')), v(L('L2', -1), L('L3'), L('L1'))] },
    ],
    view: { right: Y, up: Z, out: X },
    frames: { s: '{1}', b: '{4}' },
    askedIn: 's',
  },
  {
    id: 'prr-2024',
    name: '2024 Q30: PRR camera boom',
    source: '2024 Q30; worked solutions',
    symbols: ['L1', 'L2', 'L3'],
    values: { L1: 1.5, L2: 0.1, L3: 1.5 },
    // x̂s out of the page (drawn down-left), ŷs right, ẑs up.
    joints: [
      { type: 'P', axis: Z, q: v(O, O, C(0.3)) },
      { type: 'R', axis: Y, q: v(O, O, L('L1')) },
      { type: 'R', axis: NX, q: v(O, L('L2'), L('L1')) },
    ],
    R: [
      [0, 0, -1],
      [0, 1, 0],
      [1, 0, 0],
    ],
    p: v(L('L3', -1), L('L2'), L('L1')),
    links: [
      { after: 1, pts: [v(O, O, O), v(O, O, L('L1'))] },
      { after: 2, pts: [v(O, O, L('L1')), v(O, L('L2'), L('L1'))] },
      { after: 3, pts: [v(O, L('L2'), L('L1')), v(L('L3', -1), L('L2'), L('L1'))] },
    ],
    view: { right: Y, up: Z, out: X },
    frames: { s: '{1}', b: '{3}' },
    askedIn: 's',
  },
  {
    id: 'rrrrr-2025',
    name: '2025 Q30: Perseverance RRRRR arm',
    source: '2025 Q30; worked solutions',
    symbols: ['L1', 'L2', 'L3', 'L4'],
    values: { L1: 0.1, L2: 0.9, L3: 1.0, L4: 0.2 },
    // x̂s right, ŷs into the page (drawn up-right), ẑs up.
    joints: [
      { type: 'R', axis: Z, q: v(O, O, O) },
      { type: 'R', axis: Y, q: v(O, O, L('L1')) },
      { type: 'R', axis: Y, q: v(L('L2'), O, L('L1')) },
      { type: 'R', axis: Y, q: v(linAdd(L('L2'), L('L3')), O, L('L1')) },
      { type: 'R', axis: X, q: v(linAdd(L('L2'), L('L3'), L('L4')), O, L('L1')) },
    ],
    R: [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    p: v(linAdd(L('L2'), L('L3'), L('L4')), O, L('L1')),
    links: [
      { after: 1, pts: [v(O, O, O), v(O, O, L('L1'))] },
      { after: 2, pts: [v(O, O, L('L1')), v(L('L2'), O, L('L1'))] },
      { after: 3, pts: [v(L('L2'), O, L('L1')), v(linAdd(L('L2'), L('L3')), O, L('L1'))] },
      { after: 4, pts: [v(linAdd(L('L2'), L('L3')), O, L('L1')), v(linAdd(L('L2'), L('L3'), L('L4')), O, L('L1'))] },
    ],
    view: { right: X, up: Z, out: [0, -1, 0] },
    frames: { s: '{1}', b: '{5}' },
    askedIn: 's',
  },
  {
    id: 'review-6dof',
    name: 'Review deck: 6-DOF arm, screw axes in {b}',
    source: 'Review deck slide 20 (Modern Robotics example)',
    symbols: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'],
    values: { L1: 0.6, L2: 0.35, L3: 0.7, L4: 0.4, L5: 0.3, L6: 0.25 },
    // x̂0 up, ŷ0 right, ẑ0 into the page (drawn up-right); {b} has the same orientation as {0}.
    joints: [
      { type: 'R', axis: X, q: v(O, O, O) },
      { type: 'R', axis: [0, 0, -1], q: v(L('L1'), O, O) },
      { type: 'R', axis: Y, q: v(L('L1'), C(0.35), L('L2')) },
      { type: 'R', axis: X, q: v(L('L1'), L('L3'), O) },
      { type: 'P', axis: Y, q: v(L('L1'), linAdd(L('L3'), L('L4')), O) },
      { type: 'R', axis: Y, q: v(L('L1'), linAdd(L('L3'), L('L4')), L('L5', -1)) },
    ],
    R: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    p: v(L('L1'), linAdd(L('L3'), L('L4')), linAdd(L('L5', -1), L('L6', -1))),
    links: [
      { after: 1, pts: [v(O, O, O), v(L('L1'), O, O)] },
      { after: 2, pts: [v(L('L1'), O, O), v(L('L1'), O, L('L2'))] },
      { after: 3, pts: [v(L('L1'), O, L('L2')), v(L('L1'), L('L3'), L('L2')), v(L('L1'), L('L3'), O)] },
      { after: 4, pts: [v(L('L1'), L('L3'), O), v(L('L1'), linAdd(L('L3'), L('L4')), O)] },
      { after: 5, pts: [v(L('L1'), linAdd(L('L3'), L('L4')), O), v(L('L1'), linAdd(L('L3'), L('L4')), L('L5', -1))] },
      { after: 6, pts: [v(L('L1'), linAdd(L('L3'), L('L4')), L('L5', -1)), v(L('L1'), linAdd(L('L3'), L('L4')), linAdd(L('L5', -1), L('L6', -1)))] },
    ],
    view: { right: Y, up: X, out: [0, 0, -1] },
    frames: { s: '{0}', b: '{b}' },
    askedIn: 'b',
  },
  {
    id: 'rrrp-2022',
    name: '2022 Q33–34: RRRP (SCARA-like) arm',
    source: '2022 Q33–Q34; worked solutions',
    symbols: ['L0', 'L1', 'L2'],
    values: { L0: 0.8, L1: 0.6, L2: 0.5 },
    // ẑ up, links along +ŷ0.
    joints: [
      { type: 'R', axis: Z, q: v(O, O, O) },
      { type: 'R', axis: Z, q: v(O, L('L1'), O) },
      { type: 'R', axis: Z, q: v(O, linAdd(L('L1'), L('L2')), O) },
      { type: 'P', axis: Z, q: v(O, linAdd(L('L1'), L('L2')), L('L0')) },
    ],
    R: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    p: v(O, linAdd(L('L1'), L('L2')), L('L0')),
    links: [
      { after: 0, pts: [v(O, O, O), v(O, O, L('L0'))] },
      { after: 1, pts: [v(O, O, L('L0')), v(O, L('L1'), L('L0'))] },
      { after: 2, pts: [v(O, L('L1'), L('L0')), v(O, linAdd(L('L1'), L('L2')), L('L0'))] },
      { after: 4, pts: [v(O, linAdd(L('L1'), L('L2')), L('L0')), v(O, linAdd(L('L1'), L('L2')), linAdd(L('L0'), C(-0.3)))] },
    ],
    view: { right: Y, up: Z, out: X },
    frames: { s: '{0}', b: '{b}' },
    askedIn: 's',
  },
  {
    id: 'rrrp-2022-q10',
    name: '2022 Q10: RRRP arm, body Jacobian',
    source: '2022 Q10; worked solutions',
    symbols: ['L'],
    values: { L: 1 },
    // {s} and {b} share orientation: x̂ out of the page, ŷ right, ẑ up.
    joints: [
      { type: 'R', axis: Z, q: v(O, O, O) },
      { type: 'R', axis: X, q: v(O, O, L('L')) },
      { type: 'R', axis: Z, q: v(O, L('L'), L('L')) },
      { type: 'P', axis: Y, q: v(O, L('L'), L('L')) },
    ],
    R: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    p: v(O, L('L'), L('L')),
    links: [
      { after: 1, pts: [v(O, O, O), v(O, O, L('L'))] },
      { after: 2, pts: [v(O, O, L('L')), v(O, L('L'), L('L'))] },
      { after: 4, pts: [v(O, L('L'), L('L')), v(O, linAdd(L('L'), C(0.15)), L('L'))] },
    ],
    view: { right: Y, up: Z, out: X },
    frames: { s: '{s}', b: '{b}' },
    askedIn: 'b',
  },
];

// ------------------------------------------------------------------ random axis-aligned arms (exam mode)

/** The 24 right-handed axis-aligned rotations (columns are ±unit vectors). */
export const AXIS_ROTATIONS: Mat3[] = (() => {
  const units: Vec3[] = [X, Y, Z, NX, [0, -1, 0], [0, 0, -1]];
  const out: Mat3[] = [];
  for (const a of units)
    for (const b of units) {
      if (Math.abs(dot3(a, b)) > 0.5) continue;
      const c = cross3(a, b);
      out.push([
        [a[0], b[0], c[0]],
        [a[1], b[1], c[1]],
        [a[2], b[2], c[2]],
      ]);
    }
  return out;
})();

/**
 * A random axis-aligned arm: n joints (R or P along ±x̂, ±ŷ, ±ẑ), links of symbolic lengths L1 … along axis
 * directions, and an axis-aligned {b} at the tip. `next()` is uniform in [0, 1). The first joint sits at the
 * origin of {s}; the view is the papers' (x̂ out of the page, ŷ right, ẑ up).
 */
export function randomArm(next: () => number, n: number, opts: { prismatic?: boolean } = {}): ArmSpec {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  const dirs: Vec3[] = [X, Y, Z, NX, [0, -1, 0], [0, 0, -1]];
  const symbols: string[] = [];
  const values: Record<string, number> = {};
  const joints: JointSpec[] = [];
  const links: LinkPolyline[] = [];
  let pos: LinVec = [O, O, O];
  let lastDir: Vec3 = Z;
  for (let i = 0; i < n; i++) {
    const type: 'R' | 'P' = opts.prismatic !== false && next() < 0.2 && i > 0 ? 'P' : 'R';
    const axis = i === 0 ? Z : pick(dirs);
    joints.push({ type, axis, q: pos });
    // a link after the joint, along a direction that does not double back
    const choices = dirs.filter((d) => dot3(d, lastDir) > -0.5);
    const dir = i === 0 ? Z : pick(choices);
    const sym = `L${symbols.length + 1}`;
    symbols.push(sym);
    values[sym] = Math.round((0.3 + next() * 1.2) * 10) / 10;
    const end: LinVec = [linAdd(pos[0], L(sym, dir[0])), linAdd(pos[1], L(sym, dir[1])), linAdd(pos[2], L(sym, dir[2]))];
    links.push({ after: i + 1, pts: [pos, end] });
    pos = end;
    lastDir = dir;
  }
  return {
    id: `random-${n}`,
    name: `Random ${joints.map((j) => j.type).join('')} arm`,
    source: 'Randomised, in the style of 2023 Q33 / 2024 Q30 / 2025 Q30',
    symbols,
    values,
    joints,
    R: pick(AXIS_ROTATIONS),
    p: pos,
    links,
    view: { right: Y, up: Z, out: X },
    askedIn: next() < 0.5 ? 's' : 'b',
  };
}
