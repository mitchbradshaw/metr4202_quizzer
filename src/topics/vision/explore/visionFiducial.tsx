// Fiducial markers: how many do you need? (summary notes §7 "Fiducials"; 2023 Q23).
//
// A camera (f = 800 px, 640 × 480) faces a wall of square markers. Every corner is detected with pixel noise σ and the
// camera pose is solved from all corners at once (planar PnP through the homography, core/vision.planarPose). 150
// noisy trials are drawn as a top-view scatter of estimated camera positions with their headings: one small, far marker
// gives a wide (and orientation-ambiguous) spread; more markers spread across the view pin the pose down.
import { memo, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { intrinsics } from '../../../core/camera';
import { mul, mv, planarPose, rotY, sub, tr, type Mat3, type V2, type V3 } from '../../../core/vision';
import { makeRng } from '../../../engine/rng';
import { Readout, Readouts, Segmented, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { fmt } from '../../../engine/format';
import { useTween } from './visionCommon';

const F = 800;
const K: Mat3 = intrinsics(F, F, 320, 240);
const TRIALS = 150;
const D2R = Math.PI / 180;

interface Cfg {
  n: number;
  size: number;
  dist: number;
  sigma: number;
  yaw: number;
}

/** Marker centres along the wall, spread to fit the view at this distance. */
export function markerXs(n: number, dist: number): number[] {
  if (n === 1) return [0];
  const half = 0.3 * dist;
  return Array.from({ length: n }, (_, i) => -half + (2 * half * i) / (n - 1));
}

function gauss(next: () => number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += next();
  return (s - 3) * Math.SQRT2;
}

export interface FidResult {
  est: { x: number; z: number; heading: number }[];
  posStd: number;
  headStd: number;
  failures: number;
}

/** Monte Carlo of the planar pose from noisy marker corners. Camera at (0, 0, −dist) in the wall frame, turned by yaw. */
export function fiducialTrials(c: Cfg, trials = TRIALS, seed = 7): FidResult {
  const xs = markerXs(c.n, c.dist);
  const h = c.size / 2;
  const target: V2[] = xs.flatMap((x) => [
    [x - h, -h],
    [x + h, -h],
    [x + h, h],
    [x - h, h],
  ]);
  const C: V3 = [0, 0, -c.dist];
  const Rwc = rotY(c.yaw * D2R); // camera axes in the wall frame
  const R = tr(Rwc); // wall → camera
  const clean: V2[] = target.map(([x, y]) => {
    const q = mv(R, sub([x, y, 0], C));
    return [F * (q[0] / q[2]) + 320, F * (q[1] / q[2]) + 240];
  });
  const rng = makeRng(seed);
  const est: FidResult['est'] = [];
  let failures = 0;
  for (let t = 0; t < trials; t++) {
    const obs = clean.map(([u, v]) => [u + c.sigma * gauss(rng.next), v + c.sigma * gauss(rng.next)] as V2);
    const p = planarPose(K, target, obs);
    if (!p || !p.C.every(Number.isFinite)) {
      failures++;
      continue;
    }
    // Optical axis in the wall frame = third row of R (wall → camera).
    const z = p.R[2];
    est.push({ x: p.C[0], z: p.C[2], heading: Math.atan2(z[0], z[2]) });
  }
  const mean = (f: (e: FidResult['est'][number]) => number) => est.reduce((a, e) => a + f(e), 0) / Math.max(1, est.length);
  const mx = mean((e) => e.x);
  const mz = mean((e) => e.z);
  const mh = mean((e) => e.heading);
  const posStd = Math.sqrt(mean((e) => (e.x - mx) ** 2 + (e.z - mz) ** 2));
  const headStd = Math.sqrt(mean((e) => (e.heading - mh) ** 2));
  return { est, posStd, headStd, failures };
}

// ------------------------------------------------------------------ top view

const W = 460;
const H = 330;

function TopView({ c, res }: { c: Cfg; res: FidResult }) {
  // World: x along the wall (right), z towards the wall (up on screen). Fit 1.25 × dist.
  const span = Math.max(1.2, c.dist * 1.35);
  const s = (H - 70) / span;
  const X = (x: number) => W / 2 + s * x;
  const Z = (z: number) => 40 - s * z; // wall (z = 0) near the top
  const xs = markerXs(c.n, c.dist);
  const Rwc = rotY(c.yaw * D2R);
  const ax = mul(Rwc, [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  const look: V2 = [ax[0][2], ax[2][2]];
  const half = Math.atan2(320, F);
  const fov = [-half, half].map((a) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return [look[0] * ca + look[1] * sa, -look[0] * sa + look[1] * ca] as V2;
  });
  const L = c.dist * 1.15;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="vision-svg" role="img" aria-label="Top view of the camera, the wall of markers and the scatter of estimated camera poses">
      <line x1={10} y1={Z(0)} x2={W - 10} y2={Z(0)} className="vision-wall" />
      <text x={12} y={Z(0) - 8} className="vision-small">
        wall
      </text>
      {xs.map((x, i) => (
        <line key={i} x1={X(x - c.size / 2)} y1={Z(0)} x2={X(x + c.size / 2)} y2={Z(0)} className="vision-marker" />
      ))}
      {fov.map((d, i) => (
        <line key={i} x1={X(0)} y1={Z(-c.dist)} x2={X(L * d[0])} y2={Z(-c.dist + L * d[1])} className="vision-fovline" />
      ))}
      {res.est.map((e, i) => (
        <g key={i}>
          <line x1={X(e.x)} y1={Z(e.z)} x2={X(e.x + 0.08 * span * Math.sin(e.heading))} y2={Z(e.z + 0.08 * span * Math.cos(e.heading))} className="vision-est-tick" />
          <circle cx={X(e.x)} cy={Z(e.z)} r={2.2} className="vision-est" />
        </g>
      ))}
      <polygon points={`${X(0)},${Z(-c.dist) + 9} ${X(0) - 8},${Z(-c.dist) + 22} ${X(0) + 8},${Z(-c.dist) + 22}`} className="vision-camtri" />
      <circle cx={X(0)} cy={Z(-c.dist)} r={4} className="vision-camdot" />
      <text x={X(0) + 12} y={Z(-c.dist) + 18} className="vision-small">
        true camera
      </text>
      <line x1={W - 110} y1={H - 16} x2={W - 110 + s * 0.5} y2={H - 16} className="vision-axis" />
      <text x={W - 110} y={H - 22} className="vision-tick">
        0.5 m
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ the panel

interface Api {
  more(): void;
  far(): void;
}

export function FiducialPanel() {
  const [c, setC] = useState<Cfg>({ n: 1, size: 0.1, dist: 2, sigma: 1, yaw: 0 });
  const [seed, setSeed] = useState(7);
  const res = useMemo(() => fiducialTrials(c, TRIALS, seed), [c, seed]);
  const tween = useTween();
  const api = useRef<Api>(null as unknown as Api);
  api.current = {
    more: () => setC({ n: 4, size: 0.1, dist: 2, sigma: 1, yaw: 0 }),
    far: () => {
      setC({ n: 1, size: 0.1, dist: 1, sigma: 1, yaw: 0 });
      tween({ from: [1], to: [3], ms: 1600 }, ([d]) => setC((q) => ({ ...q, dist: d })));
    },
  };
  const set = (k: keyof Cfg, v: number) => setC((q) => ({ ...q, [k]: v }));
  const pxSize = (F * c.size) / c.dist;
  return (
    <div className="vision-fid">
      <div className="vision-panels vision-panels-wide">
        <div>
          <TopView c={c} res={res} />
          <p className="vision-explain">
            Each dot is the camera position solved from one noisy photo ({TRIALS} photos); its tick is the estimated viewing direction. The marker is {fmt(pxSize, 3)} px wide in the image.
          </p>
        </div>
        <div className="vision-box">
          <div className="vision-row">
            <span className="vision-explain">Markers</span>
            <Segmented size="sm" label="Number of markers" value={c.n} onChange={(n) => set('n', n)} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
          </div>
          <Slider label="marker size" tex="s" tip="Side of each square marker" value={c.size * 100} min={4} max={40} step={1} unit="cm" onChange={(x) => set('size', x / 100)} />
          <Slider label="distance to wall" tex="d" tip="Camera distance from the wall" value={c.dist} min={0.5} max={5} step={0.05} unit="m" onChange={(x) => set('dist', x)} />
          <Slider label="corner noise" tex="\sigma" tip="Pixel noise of each detected corner (per axis)" value={c.sigma} min={0.1} max={3} step={0.05} unit="px" onChange={(x) => set('sigma', x)} />
          <Slider label="camera yaw" tex="\psi" tip="Camera turned away from facing the wall squarely" value={c.yaw} min={-15} max={15} step={0.5} unit="°" onChange={(x) => set('yaw', x)} />
          <Readouts min={120}>
            <Readout label="position spread" value={res.posStd * 100} sig={3} unit="cm" tip="RMS distance of the estimates from their mean" />
            <Readout label="heading spread" value={res.headStd / D2R} sig={3} unit="°" tip="Standard deviation of the estimated viewing direction" />
          </Readouts>
          <button type="button" className="btn btn-sm" onClick={() => setSeed((s) => s + 1)}>
            New noise
          </button>
        </div>
      </div>
      <Rich
        className="vision-explain"
        text="**2023 Q23.** In theory **one** marker is enough: its four corners are four known 3-D points with measured pixels, which fixes all six degrees of freedom of the camera pose (a perspective-n-point problem). In practice you observe several: each detection is noisy, a single small or distant marker gives a poorly conditioned pose (the tilt is ambiguous: two poses fit almost equally well), and more markers spread across the image average out the noise, widen the baseline and keep working when one is occluded or misdetected."
      />
      <FidPredicts api={api} />
    </div>
  );
}

const FidPredicts = memo(function FidPredicts({ api }: { api: MutableRefObject<Api> }) {
  return (
    <div className="vision-predicts">
      <PredictReveal
        id="vision-fid-more"
        question="One 10 cm marker at 2 m gives the scatter on the left. Use four markers spread across the view (same size, distance and noise). The scatter…"
        options={['shrinks a lot: more corners, spread wider, average out the noise', 'stays the same: one marker already fixes the pose', 'grows: more markers means more noise', 'shrinks only in heading, not in position']}
        answer={0}
        explain="Four markers give sixteen corners instead of four, and spread across the image they act like a wide baseline: a small pixel error now barely changes the pose that fits them all. One marker is enough in theory (it fixes all 6 DOF), but its pose is poorly conditioned, especially the distance and the tilt."
        tryIt="press Show me: the wall gets four markers."
        onApply={() => api.current.more()}
      />
      <PredictReveal
        id="vision-fid-far"
        question="One marker. The camera backs away from 1 m to 3 m. The position spread…"
        options={['grows much faster than the distance', 'grows in proportion to the distance', 'stays the same', 'shrinks, because the marker fits the view better']}
        answer={0}
        explain="At 3 m the marker is a third of the size in pixels, so the same pixel noise is a three times larger relative error in its apparent size and shape, and each pixel also spans three times more of the world. Depth error from a single marker grows roughly with the square of the distance; that is why a distant lone marker is unreliable."
        tryIt="press Show me: the camera backs away from 1 m to 3 m."
        onApply={() => api.current.far()}
      />
    </div>
  );
});
