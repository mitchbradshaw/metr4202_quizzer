// Kinematics core checks: the exam robots reproduce the worked solutions' M and screw-axis tables, PoE space
// and body forms agree, Jacobians match finite differences, and Newton–Raphson IK converges.
import type { SelfTest, CheckResult } from './types';
import { near, nearAbs, isTrue } from './assert';
import {
  EXAM_ARMS,
  armM,
  armScrewsS,
  armScrewsB,
  screwStrings,
  mStrings,
  fkSpace,
  fkBody,
  jacobianSpace,
  jacobianBody,
  expScrew,
  logT,
  invT,
  matMul,
  det3,
  rotOf,
  posOf,
  screwR,
  ikNewtonRaphson,
  planarIk,
  randomArm,
  symScrewB,
  linVecEval,
  type Mat4,
  type Screw,
} from '../core/kin';
import { evaluate } from '../engine/expr';
import { makeRng } from '../engine/rng';

const arm = (id: string) => EXAM_ARMS.find((a) => a.id === id)!;

/** Compare a table of expression strings with the expected one by evaluating both at generic symbol values. */
function sameTable(label: string, got: string[][], want: string[][], syms: string[]): CheckResult {
  const vals = Object.fromEntries(syms.map((s, i) => [s, 0.731 + 0.417 * i * i + 0.113 * i]));
  const bad: string[] = [];
  want.forEach((row, i) =>
    row.forEach((w, j) => {
      const a = evaluate(got[i]?.[j] ?? 'NaN', vals);
      const b = evaluate(w, vals);
      if (!(Math.abs(a - b) < 1e-9)) bad.push(`row ${i + 1} col ${j + 1}: ${got[i]?.[j]} vs ${w}`);
    })
  );
  return isTrue(label, bad.length === 0, bad.slice(0, 3).join('; '));
}

function maxDiff(A: Mat4, B: Mat4): number {
  let m = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) m = Math.max(m, Math.abs(A[i][j] - B[i][j]));
  return m;
}

export const tests: SelfTest[] = [
  {
    id: 'kin-exam-tables',
    topic: 'core',
    title: 'Exam robots: M and screw-axis tables match the worked solutions (2022–2025, review deck)',
    source: '2023 Q33, 2024 Q30, 2025 Q30 worked solutions; review deck slide 20; 2022 Q10, Q33',
    run: () => {
      const a23 = arm('rprr-2023');
      const a24 = arm('prr-2024');
      const a25 = arm('rrrrr-2025');
      const rev = arm('review-6dof');
      const a22 = arm('rrrp-2022');
      const q10 = arm('rrrp-2022-q10');
      return [
        sameTable('2023 Q33 S table', screwStrings(a23, 's'), [
          ['0', '0', '1', '0', '0', '0'],
          ['0', '0', '0', '0', '0', '1'],
          ['1', '0', '0', '0', 'L1', '0'],
          ['0', '1', '0', '-L1', '0', '-L2'],
        ], a23.symbols),
        sameTable('2023 Q33 M', mStrings(a23), [
          ['0', '-1', '0', '-L2'],
          ['0', '0', '1', 'L3'],
          ['-1', '0', '0', 'L1'],
          ['0', '0', '0', '1'],
        ], a23.symbols),
        sameTable('2024 Q30 S table', screwStrings(a24, 's'), [
          ['0', '0', '0', '0', '0', '1'],
          ['0', '1', '0', '-L1', '0', '0'],
          ['-1', '0', '0', '0', '-L1', 'L2'],
        ], a24.symbols),
        sameTable('2024 Q30 M', mStrings(a24), [
          ['0', '0', '-1', '-L3'],
          ['0', '1', '0', 'L2'],
          ['1', '0', '0', 'L1'],
          ['0', '0', '0', '1'],
        ], a24.symbols),
        sameTable('2025 Q30 S table', screwStrings(a25, 's'), [
          ['0', '0', '1', '0', '0', '0'],
          ['0', '1', '0', '-L1', '0', '0'],
          ['0', '1', '0', '-L1', '0', 'L2'],
          ['0', '1', '0', '-L1', '0', 'L2+L3'],
          ['1', '0', '0', '0', 'L1', '0'],
        ], a25.symbols),
        sameTable('2025 Q30 M', mStrings(a25), [
          ['0', '0', '1', 'L2+L3+L4'],
          ['1', '0', '0', '0'],
          ['0', '1', '0', 'L1'],
          ['0', '0', '0', '1'],
        ], a25.symbols),
        sameTable('review deck B table', screwStrings(rev, 'b'), [
          ['1', '0', '0', '0', 'L5+L6', 'L3+L4'],
          ['0', '0', '-1', 'L3+L4', '0', '0'],
          ['0', '1', '0', '-L2-L5-L6', '0', '0'],
          ['1', '0', '0', '0', 'L5+L6', 'L4'],
          ['0', '0', '0', '0', '1', '0'],
          ['0', '1', '0', '-L6', '0', '0'],
        ], rev.symbols),
        sameTable('review deck M', mStrings(rev), [
          ['1', '0', '0', 'L1'],
          ['0', '1', '0', 'L3+L4'],
          ['0', '0', '1', '-L5-L6'],
          ['0', '0', '0', '1'],
        ], rev.symbols),
        sameTable('2022 Q33 S table', screwStrings(a22, 's'), [
          ['0', '0', '1', '0', '0', '0'],
          ['0', '0', '1', 'L1', '0', '0'],
          ['0', '0', '1', 'L1+L2', '0', '0'],
          ['0', '0', '0', '0', '0', '1'],
        ], a22.symbols),
        sameTable('2022 Q10 B table', screwStrings(q10, 'b'), [
          ['0', '0', '1', '-L', '0', '0'],
          ['1', '0', '0', '0', '0', 'L'],
          ['0', '0', '1', '0', '0', '0'],
          ['0', '0', '0', '0', '1', '0'],
        ], q10.symbols),
        isTrue('every exam R is right-handed (det R = +1)', EXAM_ARMS.every((a) => Math.abs(det3(a.R) - 1) < 1e-12)),
      ];
    },
  },
  {
    id: 'kin-poe',
    topic: 'core',
    title: 'PoE: T(0) = M, space form = body form, logT inverts expScrew, 2022 Q34 pose, 2022 Q35 screw',
    source: 'Modern Robotics ch. 4; 2022 Q34–Q35 worked solutions',
    run: () => {
      const out: CheckResult[] = [];
      const rng = makeRng(11);
      for (const a of EXAM_ARMS) {
        const M = armM(a);
        const S = armScrewsS(a);
        const B = armScrewsB(a);
        const zero = a.joints.map(() => 0);
        const th = a.joints.map(() => rng.uniform(-1.5, 1.5));
        out.push(nearAbs(`${a.id}: T(0) = M`, maxDiff(fkSpace(M, S, zero), M), 0, 1e-12));
        out.push(nearAbs(`${a.id}: space form = body form at random θ`, maxDiff(fkSpace(M, S, th), fkBody(M, B, th)), 0, 1e-9));
      }
      const S: Screw = screwR([0, 0.6, 0.8], [0.3, -0.2, 0.5]);
      const V = logT(expScrew(S, 1.1));
      out.push(nearAbs('log(e^[S]θ) = Sθ (ω part)', Math.hypot(V.w[0] - 0, V.w[1] - 0.66, V.w[2] - 0.88), 0, 1e-9));
      out.push(nearAbs('log(e^[S]θ) = Sθ (v part)', Math.hypot(V.v[0] - S.v[0] * 1.1, V.v[1] - S.v[1] * 1.1, V.v[2] - S.v[2] * 1.1), 0, 1e-9));
      // 2022 Q34: θ = (−π/2, π, π/2, −h) gives R = Rot(z, π), p = (ℓ1 − ℓ2, 0, ℓ0 − h).
      const a22 = arm('rrrp-2022');
      const h = 0.2;
      const T = fkSpace(armM(a22), armScrewsS(a22), [-Math.PI / 2, Math.PI, Math.PI / 2, -h]);
      const { L0, L1, L2 } = a22.values;
      out.push(nearAbs('2022 Q34: R = diag(−1, −1, 1)', Math.abs(T[0][0] + 1) + Math.abs(T[1][1] + 1) + Math.abs(T[2][2] - 1), 0, 1e-9));
      out.push(nearAbs('2022 Q34: p = (ℓ1 − ℓ2, 0, ℓ0 − h)', Math.hypot(T[0][3] - (L1 - L2), T[1][3], T[2][3] - (L0 - h)), 0, 1e-9));
      // 2022 Q35: ω5 = (−1, 0, 1)/√2 through q = (−2, 0, 0) relative to {b} gives v5 = (0, √2, 0).
      const s35 = screwR([-Math.SQRT1_2, 0, Math.SQRT1_2], [-2, 0, 0]);
      out.push(nearAbs('2022 Q35: v5 = (0, √2, 0)', Math.hypot(s35.v[0], s35.v[1] - Math.SQRT2, s35.v[2]), 0, 1e-12));
      return out;
    },
  },
  {
    id: 'kin-jacobian',
    topic: 'core',
    title: 'Jacobians: 2022 Q10 body Jacobian; space Jacobian matches finite differences',
    source: '2022 Q10 worked solutions',
    run: () => {
      const q10 = arm('rrrp-2022-q10');
      const Lv = 1;
      const Jb = jacobianBody(armScrewsB(q10), [0, 0, Math.PI / 2, Lv]);
      const want = [
        [0, 0, 1, -Lv, Lv, 0],
        [0, -1, 0, 0, 0, Lv],
        [0, 0, 1, -Lv, 0, 0],
        [0, 0, 0, 0, 1, 0],
      ];
      let err = 0;
      Jb.forEach((c, i) => [...c.w, ...c.v].forEach((x, k) => (err = Math.max(err, Math.abs(x - want[i][k])))));
      // finite differences of the space-form FK: column i ≈ (dT/dθi) T⁻¹ as a twist
      const a = arm('rrrrr-2025');
      const M = armM(a);
      const S = armScrewsS(a);
      const th = [0.3, -0.4, 0.7, 0.2, -0.5];
      const Js = jacobianSpace(S, th);
      let fd = 0;
      const hh = 1e-6;
      for (let i = 0; i < th.length; i++) {
        const tp = th.slice();
        tp[i] += hh;
        const D = matMul(fkSpace(M, S, tp), invT(fkSpace(M, S, th)));
        const wv = [(D[2][1] - D[1][2]) / 2 / hh, (D[0][2] - D[2][0]) / 2 / hh, (D[1][0] - D[0][1]) / 2 / hh, D[0][3] / hh, D[1][3] / hh, D[2][3] / hh];
        const col = [...Js[i].w, ...Js[i].v];
        fd = Math.max(fd, ...col.map((x, k) => Math.abs(x - wv[k])));
      }
      return [nearAbs('2022 Q10: J_b(0, 0, π/2, L) with L = 1', err, 0, 1e-9), nearAbs('space Jacobian = finite differences (2025 arm)', fd, 0, 1e-4)];
    },
  },
  {
    id: 'kin-ik',
    topic: 'core',
    title: 'Newton–Raphson IK converges from a good guess; planar IK finds both elbow branches',
    source: 'Summary notes §6 (numerical IK)',
    run: () => {
      const a = arm('rrrrr-2025');
      const M = armM(a);
      const B = armScrewsB(a);
      const target = [0.4, -0.3, 0.5, 0.2, 0.1];
      const Tsd = fkBody(M, B, target);
      const res = ikNewtonRaphson(M, B, Tsd, target.map((t) => t + 0.15));
      const last = res.iterates[res.iterates.length - 1];
      const reached = maxDiff(fkBody(M, B, last.theta), Tsd);
      const up = planarIk([1, 0.8], [1.2, 0.6], [0.2, 0.9]);
      const down = planarIk([1, 0.8], [1.2, 0.6], [1.2, -0.9]);
      const t2u = up.iterates[up.iterates.length - 1].theta[1];
      const t2d = down.iterates[down.iterates.length - 1].theta[1];
      const far = planarIk([1, 0.8], [3, 0], [0.3, 0.3], { maxIter: 25 });
      return [
        isTrue('NR IK converges (5-DOF arm, nearby guess)', res.converged, `${res.iterates.length} iterates`),
        nearAbs('the found θ reproduces T_sd', reached, 0, 1e-4),
        isTrue('planar IK converges from an elbow-up guess', up.converged),
        isTrue('…and from an elbow-down guess, to the other branch', down.converged && Math.sign(t2u) !== Math.sign(t2d), `${t2u.toFixed(3)} vs ${t2d.toFixed(3)}`),
        isTrue('a target outside the workspace never converges', !far.converged),
      ];
    },
  },
  {
    id: 'kin-random-arms',
    topic: 'core',
    title: 'Random axis-aligned arms: right-handed {b}, PoE consistent, symbolic {b} screws agree with Ad_{M⁻¹}',
    run: () => {
      const rng = makeRng(5);
      let ok = 0;
      let consistent = 0;
      let symb = 0;
      const N = 60;
      for (let k = 0; k < N; k++) {
        const a = randomArm(rng.next, 2 + (k % 4));
        if (Math.abs(det3(a.R) - 1) < 1e-12) ok++;
        const M = armM(a);
        const th = a.joints.map(() => rng.uniform(-1, 1));
        if (maxDiff(fkSpace(M, armScrewsS(a), th), fkBody(M, armScrewsB(a), th)) < 1e-9) consistent++;
        // symbolic body screws equal the numeric adjoint at the drawing values
        const Minv = invT(M);
        const good = a.joints.every((_, i) => {
          const sb = symScrewB(a, i);
          const sS = armScrewsS(a)[i];
          const R = rotOf(Minv);
          const p = posOf(Minv);
          const w = [R[0][0] * sS.w[0] + R[0][1] * sS.w[1] + R[0][2] * sS.w[2], R[1][0] * sS.w[0] + R[1][1] * sS.w[1] + R[1][2] * sS.w[2], R[2][0] * sS.w[0] + R[2][1] * sS.w[1] + R[2][2] * sS.w[2]];
          const Rv = [R[0][0] * sS.v[0] + R[0][1] * sS.v[1] + R[0][2] * sS.v[2], R[1][0] * sS.v[0] + R[1][1] * sS.v[1] + R[1][2] * sS.v[2], R[2][0] * sS.v[0] + R[2][1] * sS.v[1] + R[2][2] * sS.v[2]];
          const pxw = [p[1] * w[2] - p[2] * w[1], p[2] * w[0] - p[0] * w[2], p[0] * w[1] - p[1] * w[0]];
          const vb = linVecEval(sb.v, a.values);
          return [0, 1, 2].every((j) => Math.abs(sb.w[j] - w[j]) < 1e-9 && Math.abs(vb[j] - (pxw[j] + Rv[j])) < 1e-9);
        });
        if (good) symb++;
      }
      return [
        isTrue(`{b} right-handed in ${ok}/${N}`, ok === N),
        isTrue(`space = body PoE in ${consistent}/${N}`, consistent === N),
        isTrue(`symbolic {b} screws = Ad_{M⁻¹} S in ${symb}/${N}`, symb === N),
        near('expScrew of a prismatic axis translates by θ', expScrew({ w: [0, 0, 0], v: [0, 1, 0] }, 0.7)[1][3], 0.7, 1e-12),
      ];
    },
  },
];
