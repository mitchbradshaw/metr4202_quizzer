// Self-tests for the mapping and SLAM simulation cores: the ray-cast occupancy grid (core/slamgrid.ts) and the SE(2)
// pose graph (core/slamgraph.ts), plus the claims the simulations' predict-then-reveal answers make.
import type { CheckResult, SelfTest } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { BELIEF_L, castTrue, gridBytes, integrateBeam, integrateScan, lo, makeGrid, rayDisc, raySeg, takeScan, traverse, truthGrid, type InverseSensor, type MapWorld } from '../../../core/slamgrid';
import { between, cholSolve, cholesky, compose, deadReckon, ellipseOf, mahal2, marginals, optimise, propagate, type Pose2, type PoseEdge } from '../../../core/slamgraph';
import { mulberry32 } from '../../../engine/rng';
import { GLASS_ROUTE, OFFICE, personAt, routeAt } from '../explore/raycastScenes';
import { J_FALSE, K_CLOSE, TRUTH, DEFAULT_SEED, makeDrive } from '../explore/loopWorld';

const ISM: InverseSensor = { lOcc: lo(0.7), lFree: lo(0.4), lMin: -Infinity, lMax: Infinity, maxPolicy: 'clear' };
const LIDAR = { beams: 180, maxRange: 8, sigma: 0.03, glassCos: Math.cos((8 * Math.PI) / 180) };
const seedOf = (k: number) => (Math.imul(k + 1, 2654435761) ^ 0x5bd1e995) >>> 0;

/** The person scene as the simulation runs it: parked at (8.4, 2.6), 5 Hz, jittered lidar start angle. */
function personScene(seconds: number, clamp: boolean) {
  const g = makeGrid(16, 10, 0.1);
  const ism = { ...ISM, lMin: clamp ? lo(0.12) : -Infinity, lMax: clamp ? lo(0.97) : Infinity };
  for (let k = 0; k < Math.round(seconds * 5); k++) {
    const rng = mulberry32(seedOf(k));
    const jit = (rng() - 0.5) * ((2 * Math.PI) / LIDAR.beams);
    integrateScan(g, ism, takeScan(OFFICE, [personAt(k / 5)], 8.4, 2.6, LIDAR, rng, Math.PI / 2 + jit));
  }
  let peak = -Infinity;
  for (let iy = 40; iy <= 46; iy++) for (let ix = 80; ix <= 88; ix++) peak = Math.max(peak, g.l[iy * g.nx + ix]);
  return peak;
}

/** Drive a route at 1.2 m/s scanning at 5 Hz, as the simulation does. */
function driveRoute(route: typeof GLASS_ROUTE) {
  const g = makeGrid(16, 10, 0.1);
  for (let k = 0, s = 0; s <= route.length + 1e-9; k++, s += 1.2 / 5) {
    const p = routeAt(route, s);
    const rng = mulberry32(seedOf(k));
    const jit = (rng() - 0.5) * ((2 * Math.PI) / LIDAR.beams);
    integrateScan(g, ISM, takeScan(OFFICE, [], p.x, p.y, LIDAR, rng, p.th + jit));
  }
  return g;
}

const r95 = (S: Float64Array) => ellipseOf(S).a;
const errAt = (p: Pose2, k: number) => Math.hypot(p.x - TRUTH[k].x, p.y - TRUTH[k].y);
const det3 = (S: Float64Array) => S[0] * (S[4] * S[8] - S[5] * S[7]) - S[1] * (S[3] * S[8] - S[5] * S[6]) + S[2] * (S[3] * S[7] - S[4] * S[6]);
/** Mean distance between each re-traversed pose (after the return) and the first-pass pose at the same place. */
const secondPass = (est: Pose2[]) => {
  let s = 0;
  let n = 0;
  for (let k = K_CLOSE + 1; k < est.length; k++, n++) s += Math.hypot(est[k].x - est[k - K_CLOSE].x, est[k].y - est[k - K_CLOSE].y);
  return s / Math.max(1, n);
};

export const tests: SelfTest[] = [
  {
    id: 'slam-grid-beam',
    topic: 'slam',
    title: 'Ray-cast inverse sensor model: free along the beam, occupied at the return, nothing beyond; max-range readings; clamping',
    source: 'Probabilistic Robotics Table 9.2; summary notes §4',
    run: () => {
      const out: CheckResult[] = [];
      const g = makeGrid(10, 10, 1);
      integrateBeam(g, ISM, 0.5, 5.5, 0, 5.2, 8);
      const row = Array.from({ length: 10 }, (_, ix) => g.l[5 * 10 + ix]);
      out.push(isTrue('cells 0-4 (crossed) get l_free = ln(0.4/0.6)', row.slice(0, 5).every((v) => Math.abs(v - lo(0.4)) < 1e-6), row.map((v) => v.toFixed(2)).join(' ')));
      out.push(nearAbs('cell 5 (the return) gets l_occ = ln(0.7/0.3) = 0.847', row[5], lo(0.7), 1e-6));
      out.push(isTrue('cells 6-9 (behind the return) unchanged', row.slice(6).every((v) => v === 0)));
      const gm = makeGrid(10, 10, 1);
      integrateBeam(gm, ISM, 0.5, 5.5, 0, 8, 8);
      const rowm = Array.from({ length: 10 }, (_, ix) => gm.l[5 * 10 + ix]);
      out.push(isTrue("max-range reading, 'clear': cells 0-8 free, none occupied", rowm.slice(0, 9).every((v) => v < 0) && rowm.every((v) => v <= 0), rowm.map((v) => v.toFixed(2)).join(' ')));
      const gi = makeGrid(10, 10, 1);
      integrateBeam(gi, { ...ISM, maxPolicy: 'ignore' }, 0.5, 5.5, 0, 8, 8);
      out.push(isTrue("max-range reading, 'ignore': nothing changes", gi.l.every((v) => v === 0)));
      const gc = makeGrid(10, 10, 1);
      const cl = { ...ISM, lMin: lo(0.12), lMax: lo(0.97) };
      for (let k = 0; k < 30; k++) integrateBeam(gc, cl, 0.5, 5.5, 0, 5.2, 8);
      out.push(nearAbs('30 hits with clamping stop at l_max = ln(0.97/0.03) = 3.476', gc.l[55], lo(0.97), 1e-5));
      out.push(nearAbs('30 passes with clamping stop at l_min = ln(0.12/0.88) = −1.992', gc.l[54], lo(0.12), 1e-5));
      const cells: number[] = [];
      traverse({ res: 1, nx: 10, ny: 10 }, 0.5, 0.5, 3.5, 2.5, (idx) => cells.push(idx));
      out.push(isTrue('diagonal traversal (0.5, 0.5) → (3.5, 2.5) visits 6 connected cells ending in (3, 2)', cells.length === 6 && cells[0] === 0 && cells[5] === 23, cells.join(',')));
      return out;
    },
  },
  {
    id: 'slam-grid-world',
    topic: 'slam',
    title: 'Lidar in the office: ray-segment / ray-disc distances, glass passes oblique beams, memory ×4 when the cell size halves',
    source: 'Summary notes §4 practical mapping issues; 2024 Q22 worked solution (lidar on glass)',
    run: () => {
      const wall = { ax: 5, ay: 0, bx: 5, by: 10, kind: 'wall' as const };
      const glass: MapWorld = { w: 10, h: 10, segs: [{ ...wall, kind: 'glass' }] };
      const head = castTrue(glass, [], 0, 5, 0, { maxRange: 9, glassCos: Math.cos((8 * Math.PI) / 180) });
      const oblique = castTrue(glass, [], 0, 5, Math.PI / 6, { maxRange: 9, glassCos: Math.cos((8 * Math.PI) / 180) });
      const g05 = makeGrid(16, 10, 0.05);
      const g10 = makeGrid(16, 10, 0.1);
      return [
        nearAbs('ray from (0, 5) along +x meets x = 5 at t = 5', raySeg(0, 5, 1, 0, wall).t, 5, 1e-12),
        nearAbs('ray at 60° from the wall normal: |cos| = 0.5', raySeg(0, 0, Math.cos(Math.PI / 3), Math.sin(Math.PI / 3), wall).cos, 0.5, 1e-12),
        nearAbs('ray along +x meets a 0.3 m disc at (4, 0) at t = 3.7', rayDisc(0, 0, 1, 0, { x: 4, y: 0, r: 0.3 }), 3.7, 1e-12),
        isTrue('glass met head-on returns the beam', head.kind === 'glass' && Math.abs(head.range - 5) < 1e-9),
        isTrue('glass met at 30° is invisible: max-range reading', oblique.kind === 'max'),
        isTrue('office at 0.1 m: 160 × 100 cells, 62.5 kB of float32', g10.nx === 160 && g10.ny === 100 && gridBytes(g10.nx, g10.ny) === 64000),
        near('halving the cell size multiplies the 2D memory by 4', gridBytes(g05.nx, g05.ny) / gridBytes(g10.nx, g10.ny), 4, 1e-12),
        isTrue('truth raster marks the glass pane as 2 and walls as 1', (() => {
          const t = truthGrid(OFFICE, g10);
          return t[50 * 160 + 120] === 2 || t[49 * 160 + 120] === 2 ? t.some((v) => v === 1) : false;
        })()),
      ];
    },
  },
  {
    id: 'slam-grid-scenes',
    topic: 'slam',
    title: 'Ray-cast scenes behave as the predictions say: a stopped person leaves a ghost that clamping clears; glass maps as free',
    source: 'Explore raycast: predictions slam-rc-person, slam-rc-glass',
    run: () => {
      const off = personScene(9, false);
      const on = personScene(9, true);
      const peakStop = personScene(6.2, false);
      const g = driveRoute(GLASS_ROUTE);
      const t = truthGrid(OFFICE, g);
      let glassFree = 0;
      let glassOcc = 0;
      for (let k = 0; k < t.length; k++) {
        if (t[k] !== 2) continue;
        if (g.l[k] < -BELIEF_L) glassFree++;
        else if (g.l[k] > BELIEF_L) glassOcc++;
      }
      return [
        isTrue('after the 4 s stop the spot holds l > +8 without clamping (about 16 hits)', peakStop > 8, `peak ${peakStop.toFixed(2)}`),
        isTrue('2.8 s after the person leaves, still a ghost without clamping (l > 0.62)', off > BELIEF_L, `peak ${off.toFixed(2)}`),
        isTrue('with clamping at l_max = 3.48 the same spot already reads free (l < 0)', on < 0, `peak ${on.toFixed(2)}`),
        isTrue('driving along the glass: more glass cells believed free than occupied', glassFree > glassOcc && glassFree > 10, `free ${glassFree}, occupied ${glassOcc}`),
      ];
    },
  },
  {
    id: 'slam-graph-basics',
    topic: 'slam',
    title: 'SE(2) pose graph: ⊕ / ⊖ round trip, Cholesky solve, noise-free graph converges to the truth, chain marginals = propagated covariance',
    source: 'Grisetti et al. 2010 (graph-based SLAM tutorial); summary notes §4 graph SLAM',
    run: () => {
      const a: Pose2 = { x: 1, y: 2, th: 0.7 };
      const b: Pose2 = { x: -0.4, y: 0.9, th: -1.2 };
      const rt = between(a, compose(a, b));
      const A = new Float64Array([4, 2, 0.6, 2, 5, 1, 0.6, 1, 3]);
      const L = A.slice();
      cholesky(L, 3);
      const x = cholSolve(L, 3, new Float64Array([1, 2, 3]));
      const back = [0, 1, 2].map((r) => A[r * 3] * x[0] + A[r * 3 + 1] * x[1] + A[r * 3 + 2] * x[2]);
      // noise-free square with a loop edge, started from a distorted guess
      const truth: Pose2[] = [
        { x: 0, y: 0, th: 0 },
        { x: 2, y: 0, th: Math.PI / 2 },
        { x: 2, y: 2, th: Math.PI },
        { x: 0, y: 2, th: -Math.PI / 2 },
      ];
      const info: [number, number, number] = [100, 100, 400];
      const edges: PoseEdge[] = [
        ...[1, 2, 3].map((j) => ({ i: j - 1, j, z: between(truth[j - 1], truth[j]), info, kind: 'odo' as const })),
        { i: 3, j: 0, z: between(truth[3], truth[0]), info, kind: 'loop' as const },
      ];
      const guess = truth.map((p, k) => ({ x: p.x + 0.3 * k, y: p.y - 0.2 * k, th: p.th + 0.1 * k }));
      guess[0] = { ...truth[0] };
      const r = optimise(guess, edges);
      const maxErr = Math.max(...r.poses.map((p, k) => Math.hypot(p.x - truth[k].x, p.y - truth[k].y)));
      // chain only: H⁻¹ blocks equal dead-reckoning propagation
      const d = makeDrive({ rot: Math.PI / 180, trans: 0.02, seed: DEFAULT_SEED });
      const M = marginals(d.dr, d.odoEdges);
      const P = propagate(d.dr, d.us, d.infos);
      const last = d.dr.length - 1;
      return [
        nearAbs('x_a⁻¹ ⊕ (x_a ⊕ b) = b (x)', rt.x, b.x, 1e-12),
        nearAbs('x_a⁻¹ ⊕ (x_a ⊕ b) = b (θ)', rt.th, b.th, 1e-12),
        isTrue('Cholesky solve: A x = b', back.every((v, k) => Math.abs(v - (k + 1)) < 1e-12), back.map((v) => v.toFixed(6)).join(', ')),
        isTrue('noise-free square: Gauss–Newton returns the true poses', maxErr < 1e-6, `max error ${maxErr.toExponential(2)} m`),
        nearAbs('noise-free square: χ² → 0', r.chi2[r.chi2.length - 1], 0, 1e-9),
        near('chain: marginal σ²_x at the last node = propagated', M[last][0], P[last][0], 1e-4),
        near('chain: marginal σ²_θ at the last node = propagated', M[last][8], P[last][8], 1e-4),
        nearAbs('anchored node 0 has (almost) zero covariance', M[0][0], 0, 1e-8),
      ];
    },
  },
  {
    id: 'slam-graph-loop',
    topic: 'slam',
    title: 'Loop closure on the ring corridor: correct closure shrinks error and uncertainty (χ² ≈ 3); false closure warps it and is overconfident (χ² ≫ 3); missed closure maps the corridor twice',
    source: 'Summary notes §4; 2024 Q23 and 2025 Q23 worked solutions',
    run: () => {
      const d = makeDrive({ rot: Math.PI / 180, trans: 0.02, seed: DEFAULT_SEED });
      const odo = d.odoEdges.slice(0, K_CLOSE);
      const dr = d.dr.slice(0, K_CLOSE + 1);
      const P = propagate(d.dr, d.us, d.infos);
      const solve = (edge: PoseEdge) => {
        const edges = [...odo, edge];
        const r = optimise(dr, edges);
        const M = marginals(r.poses, edges);
        let inside = 0;
        let rms = 0;
        r.poses.forEach((p, k) => {
          rms += errAt(p, k) ** 2;
          if (k > 0 && mahal2(M[k], p.x - TRUTH[k].x, p.y - TRUTH[k].y) < 5.991) inside++;
        });
        const radii = M.map(r95);
        const argmax = radii.indexOf(Math.max(...radii));
        return { chi2: r.chi2[r.chi2.length - 1], rms: Math.sqrt(rms / r.poses.length), inside, maxR: Math.max(...radii), argmax, end: errAt(r.poses[K_CLOSE], K_CLOSE) };
      };
      const good = solve(d.trueClosure);
      const bad = solve(d.falseClosure);
      const drRms = Math.sqrt(dr.reduce((s, p, k) => s + errAt(p, k) ** 2, 0) / dr.length);
      const drift = errAt(d.dr[K_CLOSE], K_CLOSE);
      const d2 = makeDrive({ rot: (2 * Math.PI) / 180, trans: 0.02, seed: DEFAULT_SEED });
      const drift2 = errAt(d2.dr[K_CLOSE], K_CLOSE);
      return [
        isTrue('the return node is back at the start (< 0.2 m) and the look-alike node is 5 m on', errAt(TRUTH[K_CLOSE], 0) < 0.2 && Math.abs(TRUTH[J_FALSE].x - TRUTH[K_CLOSE].x - 5) < 0.5),
        isTrue('dead-reckoning drift at the return is clearly visible (1.5-3.5 m)', drift > 1.5 && drift < 3.5, `${drift.toFixed(2)} m`),
        isTrue('before closing, the return node (0.1 m from node 0) has a 95 % radius over 2 m, node 0 has none', r95(P[K_CLOSE]) > 2 && r95(P[0]) < 1e-6, `${r95(P[K_CLOSE]).toFixed(2)} m`),
        isTrue('dead reckoning: heading variance and det Σ (the full x, y, θ uncertainty volume) never decrease', P.every((S, k) => k === 0 || (S[8] >= P[k - 1][8] && det3(S) >= det3(P[k - 1]) * (1 - 1e-9)))),
        isTrue('dead reckoning: the 95 % radius at the return is over 2× the quarter-loop one', r95(P[K_CLOSE]) > 2 * r95(P[Math.round(K_CLOSE / 4)]), `${r95(P[Math.round(K_CLOSE / 4)]).toFixed(2)} → ${r95(P[K_CLOSE]).toFixed(2)} m`),
        isTrue('correct closure: χ² within the 95 % range of χ²(3) (< 7.81)', good.chi2 < 7.81, good.chi2.toFixed(2)),
        isTrue('correct closure: RMS error drops by more than half', good.rms < 0.5 * drRms, `${good.rms.toFixed(3)} vs ${drRms.toFixed(3)} m`),
        isTrue('correct closure: at least 95 % of true poses inside their 95 % ellipse', good.inside >= 0.95 * K_CLOSE, `${good.inside} / ${K_CLOSE}`),
        isTrue('correct closure: largest uncertainty now about half-way round (30-70 % of the loop)', good.argmax > 0.3 * K_CLOSE && good.argmax < 0.7 * K_CLOSE, `node ${good.argmax}`),
        isTrue('correct closure: largest 95 % radius under half the dead-reckoning one at the return', good.maxR < 0.5 * r95(P[K_CLOSE]), `${good.maxR.toFixed(2)} vs ${r95(P[K_CLOSE]).toFixed(2)} m`),
        isTrue('false closure: χ² far above 3 (> 50)', bad.chi2 > 50, bad.chi2.toFixed(0)),
        isTrue('false closure: the return node ends about 5 m from the truth', bad.end > 4, `${bad.end.toFixed(2)} m`),
        isTrue('false closure: ellipses shrink anyway (max radius below the dead-reckoning one)', bad.maxR < r95(P[K_CLOSE]), `${bad.maxR.toFixed(2)} m`),
        isTrue('false closure: overconfident, under half the true poses inside their ellipse', bad.inside < 0.5 * K_CLOSE, `${bad.inside} / ${K_CLOSE}`),
        isTrue('missed closure: the second pass of the corridor sits over 1 m from the first (mapped twice)', secondPass(d.dr) > 1, `${secondPass(d.dr).toFixed(2)} m on average`),
        isTrue('missed closure: heading uncertainty keeps growing into the second pass', P[P.length - 1][8] > P[K_CLOSE][8]),
        isTrue('double the heading noise: the drift roughly doubles (×1.6-2.4)', drift2 / drift > 1.6 && drift2 / drift < 2.4, `×${(drift2 / drift).toFixed(2)}`),
        isTrue('dead reckoning composes the noisy odometry', Math.abs(deadReckon(TRUTH[0], d.us)[5].x - d.dr[5].x) < 1e-12),
      ];
    },
  },
];
