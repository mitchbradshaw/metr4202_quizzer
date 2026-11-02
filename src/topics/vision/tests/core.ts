// Self-tests for the vision maths (core/camera, core/vision, core/visionServo) and the models behind the simulations.
import type { SelfTest } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { depthFromImage, focalFromImage, imageSize, intrinsics, projectPoint } from '../../../core/camera';
import { I3, camLook, camT, det3, dot, homography, applyH, mul, mv, norm, pixelRay, planarPose, rotX, rotY, rotZ, stages, sub, tr, vanishingPoint, type Mat3, type V2, type V3 } from '../../../core/vision';
import { SERVO_PRESETS, simulateServo, type ServoTrace } from '../../../core/visionServo';
import { calibrateLM, calibResiduals } from '../../../core/vision';
import { initialGuess, makePhotos } from '../explore/visionCalib';
import { fiducialTrials } from '../explore/visionFiducial';

const BOARD: V3[] = [];
for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) BOARD.push([(i - 3) * 0.03, (j - 2) * 0.03, 0]);

export const tests: SelfTest[] = [
  {
    id: 'vision-pinhole-refs',
    topic: 'vision',
    title: 'Pinhole references: JWST 0.0309 m, 2024 Q30 78.95 m and 50.9 mm, 2023 Q33 18.48 mm, 2025 Q30 f = 80 mm',
    source: 'Review deck slide 24; 2023-2025 worked solutions (Q33(c), Q30(c)-(d), Q30(d))',
    run: () => {
      const Z = depthFromImage(0.05, 60, 0.038);
      return [
        nearAbs("JWST: h' = 131.4 × 2.82e8 / 1.2e12 = 0.0309 m", imageSize(131.4, 2.82e8, 1.2e12), 0.0309, 5e-5),
        nearAbs('2024 Q30(c): Z = 0.050 × 60 / 0.038 = 78.95 m', Z, 78.95, 0.005),
        nearAbs('2024 Q30(c): base 1.5 m further = 80.45 m', Z + 1.5, 80.45, 0.005),
        nearAbs("2024 Q30(d): 20 m closer, h'' = 50.9 mm", imageSize(0.05, 60, Z - 20) * 1000, 50.9, 0.05),
        nearAbs("2023 Q33(c): h' = 0.050 × 1.7 / 4.6 = 18.48 mm", imageSize(0.05, 1.7, 4.6) * 1000, 18.48, 0.005),
        nearAbs('2025 Q30(c): Z = √(2.1² − 1.0²) = 1.847 m', Math.sqrt(2.1 ** 2 - 1), 1.847, 0.0005),
        nearAbs('2025 Q30(d): f = 7.06 mm × 1.847 / 0.163 = 80 mm', focalFromImage(0.163, 0.00706, 1.847) * 1000, 80, 0.05),
      ];
    },
  },
  {
    id: 'vision-projection-identity',
    topic: 'vision',
    title: 'Projection with K = I and identity extrinsics gives (X/Z, Y/Z); the three stages agree with core/camera',
    source: 'Summary notes §7 image formation',
    run: () => {
      const pts: V3[] = [
        [0.3, -0.2, 2],
        [-1.5, 0.75, 5],
        [2, 1, 0.5],
      ];
      const pose = { R: I3(), C: [0, 0, 0] as V3 };
      const out = pts.flatMap((X) => {
        const s = stages(I3(), pose, X);
        return [nearAbs(`u = X/Z for (${X})`, s.u, X[0] / X[2], 1e-12), nearAbs(`v = Y/Z for (${X})`, s.v, X[1] / X[2], 1e-12)];
      });
      const K = intrinsics(800, 780, 320, 240, 3);
      const cam = camLook([1, -2, 1.5], 0.7, -0.3, 0.2);
      const X: V3 = [2, 1.5, 0.4];
      const s = stages(K, cam, X);
      const p = projectPoint(K, cam.R, camT(cam), X);
      const Xc = mv(cam.R, sub(X, cam.C));
      return [
        ...out,
        nearAbs('stages() X_c = R (X_w − C)', norm(sub(s.Xc, Xc)), 0, 1e-12),
        nearAbs('stages() u = core/camera projectPoint u', s.u, p.u, 1e-9),
        nearAbs('u = αx x + s y + u0 (skew included)', s.u, 800 * (Xc[0] / Xc[2]) + 3 * (Xc[1] / Xc[2]) + 320, 1e-9),
        nearAbs('camLook gives a rotation: det R = 1', det3(cam.R), 1, 1e-12),
        nearAbs('camLook: R Rᵀ = I', norm(sub(mul(cam.R, tr(cam.R))[0] as V3, [1, 0, 0])) + norm(sub(mul(cam.R, tr(cam.R))[1] as V3, [0, 1, 0])), 0, 1e-12),
        nearAbs('pixelRay points back at the world point', dot(pixelRay(K, cam, s.u, s.v), sub(X, cam.C)) / norm(sub(X, cam.C)), 1, 1e-9),
      ];
    },
  },
  {
    id: 'vision-vanishing-point',
    topic: 'vision',
    title: 'Vanishing point K R d is the limit of points far along parallel lines',
    source: 'Summary notes §7 (parallel lines meet at a vanishing point); 2024 Q13',
    run: () => {
      const K = intrinsics(520, 520, 320, 240);
      const cam = camLook([1.6, -4.2, 1.4], Math.PI / 2, -0.14);
      const vp = vanishingPoint(K, cam, [0, 1, 0])!;
      const far = (x: number) => stages(K, cam, [x, 5000, 0]);
      return [
        nearAbs('rail x = 1.2 at y = 5 km → VP (u)', far(1.2).u, vp[0], 0.5),
        nearAbs('rail x = 2.0 at y = 5 km → VP (v)', far(2.0).v, vp[1], 0.5),
        isTrue('direction parallel to the image plane has no finite VP', vanishingPoint(K, camLook([0, 0, 1], 0, 0), [0, 1, 0]) === null),
      ];
    },
  },
  {
    id: 'vision-homography-pose',
    topic: 'vision',
    title: 'Homography and planar PnP recover a known pose exactly from noiseless corners',
    source: 'Fiducial pose from four corners (2023 Q23)',
    run: () => {
      const K = intrinsics(800, 800, 320, 240);
      const R: Mat3 = mul(rotZ(0.2), mul(rotY(-0.35), rotX(0.25)));
      const t: V3 = [0.05, -0.03, 0.9];
      const tgt: V2[] = [
        [-0.05, -0.05],
        [0.05, -0.05],
        [0.05, 0.05],
        [-0.05, 0.05],
        [0.02, 0.01],
      ];
      const px = tgt.map(([x, y]) => {
        const p = projectPoint(K, R, t, [x, y, 0]);
        return [p.u, p.v] as V2;
      });
      const H = homography(tgt.slice(0, 4), px.slice(0, 4))!;
      const pose = planarPose(K, tgt, px)!;
      const Rerr = mul(tr(pose.R), R);
      return [
        nearAbs('H maps the fifth (unused) point', norm([...sub([...applyH(H, tgt[4]), 0] as V3, [...px[4], 0] as V3)] as V3), 0, 1e-6),
        nearAbs('t recovered', norm(sub(pose.t, t)), 0, 1e-9),
        nearAbs('R recovered (trace of RᵀR̂ = 3)', Rerr[0][0] + Rerr[1][1] + Rerr[2][2], 3, 1e-9),
        nearAbs('camera centre C = −Rᵀt', norm(sub(pose.C, mv(tr(R), t).map((x) => -x) as V3)), 0, 1e-9),
      ];
    },
  },
  {
    id: 'vision-calibration',
    topic: 'vision',
    title: 'Calibration (Levenberg–Marquardt): noiseless photos recover K; noisy ones stop at the noise floor √2 σ',
    source: 'Summary notes §7 calibration; review deck slide 22',
    run: () => {
      const clean = makePhotos(4202, 0);
      const h0 = calibrateLM(BOARD, clean.obs, initialGuess(clean.obs), 20);
      const p0 = h0[h0.length - 1].params;
      const noisy = makePhotos(4202, 0.5);
      const h1 = calibrateLM(BOARD, noisy.obs, initialGuess(noisy.obs), 20);
      const p1 = h1[h1.length - 1].params;
      const res0 = calibResiduals(clean.truth, BOARD, clean.obs);
      return [
        nearAbs('the true parameters reproduce the noiseless photos', Math.max(...res0.map(Math.abs)), 0, 1e-9),
        isTrue(`noiseless: RMS falls from ${h0[0].rms.toFixed(2)} px to < 0.01 px`, h0[h0.length - 1].rms < 0.01 && h0[0].rms > 1),
        near('noiseless αx → 820', p0[0], 820, 1e-3),
        near('noiseless αy → 800', p0[1], 800, 1e-3),
        near('noiseless u0 → 334', p0[2], 334, 1e-3),
        near('noiseless v0 → 228', p0[3], 228, 1e-3),
        isTrue(`σ = 0.5 px: final RMS ${h1[h1.length - 1].rms.toFixed(3)} px within 25 % of √2 σ = 0.707`, Math.abs(h1[h1.length - 1].rms - 0.707) < 0.18),
        near('σ = 0.5 px: αx within 2 %', p1[0], 820, 0.02),
        near('σ = 0.5 px: v0 within 2 %', p1[3], 228, 0.02),
      ];
    },
  },
  {
    id: 'vision-servo',
    topic: 'vision',
    title: 'Visual servoing: both laws converge; PBVS goes straight; IBVS retreats for a roll; calibration error only hurts PBVS',
    source: 'Summary notes §7 visual servoing; Chaumette & Hutchinson (2006)',
    run: () => {
      const run = (id: string, method: 'pbvs' | 'ibvs', calib = 0): ServoTrace => simulateServo(SERVO_PRESETS.find((p) => p.id === id)!.start, { method, calib });
      const checks = SERVO_PRESETS.flatMap((p) =>
        (['pbvs', 'ibvs'] as const).map((m) => {
          const tr0 = run(p.id, m);
          return isTrue(`${p.id} ${m}: converges (final error ${tr0.pixErr.toFixed(2)} px)`, tr0.pixErr < 1 && tr0.toolErr < 0.002);
        })
      );
      // PBVS straightness: distance of every camera centre from the start–goal line.
      const pb = run('approach', 'pbvs');
      const a = pb.C[0];
      const b = pb.C[pb.C.length - 1];
      const d = sub(b, a);
      const dev = Math.max(...pb.C.map((c) => norm(sub(sub(c, a), d.map((x) => (x * dot(sub(c, a), d)) / dot(d, d)) as V3))));
      const r90i = run('roll90', 'ibvs');
      const r90p = run('roll90', 'pbvs');
      const bp = run('approach', 'pbvs', 1);
      const bi = run('approach', 'ibvs', 1);
      const sw = run('swing', 'pbvs');
      const swi = run('swing', 'ibvs');
      return [
        ...checks,
        nearAbs('PBVS camera centre stays on the straight start–goal line', dev, 0, 1e-3),
        isTrue(`roll 90°: IBVS backs away to ${r90i.maxDist.toFixed(3)} m (> 0.6), PBVS stays at 0.5 m`, r90i.maxDist > 0.6 && r90p.maxDist < 0.505),
        isTrue(`calibration error 100 %: PBVS ends ${bp.pixErr.toFixed(1)} px / ${(bp.toolErr * 100).toFixed(1)} cm off`, bp.pixErr > 20 && bp.toolErr > 0.05),
        isTrue(`calibration error 100 %: IBVS still lands (${bi.pixErr.toFixed(2)} px, ${(bi.toolErr * 100).toFixed(2)} cm)`, bi.pixErr < 1 && bi.toolErr < 0.01),
        isTrue(`swing: PBVS loses the target (${sw.outSteps} steps out of view), IBVS never does`, sw.outSteps > 10 && swi.outSteps === 0),
      ];
    },
  },
  {
    id: 'vision-fiducials',
    topic: 'vision',
    title: 'Fiducial pose spread: four markers beat one; one marker gets much worse with distance',
    source: '2023 Q23 worked solution',
    run: () => {
      const one = fiducialTrials({ n: 1, size: 0.1, dist: 2, sigma: 1, yaw: 0 });
      const four = fiducialTrials({ n: 4, size: 0.1, dist: 2, sigma: 1, yaw: 0 });
      const near1 = fiducialTrials({ n: 1, size: 0.1, dist: 1, sigma: 1, yaw: 0 });
      const far3 = fiducialTrials({ n: 1, size: 0.1, dist: 3, sigma: 1, yaw: 0 });
      const exact = fiducialTrials({ n: 1, size: 0.1, dist: 2, sigma: 0, yaw: 5 }, 3);
      return [
        isTrue(`4 markers: ${(four.posStd * 100).toFixed(2)} cm vs 1 marker ${(one.posStd * 100).toFixed(1)} cm (≥ 4× smaller)`, four.posStd * 4 < one.posStd),
        isTrue(`1 marker at 3 m: ${(far3.posStd * 100).toFixed(1)} cm vs 1 m: ${(near1.posStd * 100).toFixed(2)} cm (> 5× worse)`, far3.posStd > 5 * near1.posStd),
        nearAbs('noise-free: the estimated camera sits exactly at z = −2 m', exact.est[0].z, -2, 1e-9),
        nearAbs('noise-free: heading recovered (5°)', (exact.est[0].heading * 180) / Math.PI, 5, 1e-6),
      ];
    },
  },
];
