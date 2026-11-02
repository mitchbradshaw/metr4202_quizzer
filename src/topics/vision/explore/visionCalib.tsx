// Camera calibration explainer (summary notes §7 "Calibration"; review deck slide 22: "What parameters are you
// solving for when calibrating your camera?").
//
// Six simulated photos of a 7 × 5-corner checkerboard taken by a camera whose K we pretend not to know. The corners
// are "detected" with pixel noise σ. Start from a guessed K, get each photo's pose from its homography (planar PnP),
// then Levenberg–Marquardt adjusts K and all six poses together to minimise the reprojection error. Step through the
// iterations: the reprojected corners (circles) slide onto the detected ones (crosses) and the RMS error falls to the
// noise floor (≈ √2 σ per corner), never below it.
import { useDeferredValue, useMemo, useState } from 'react';
import { intrinsics } from '../../../core/camera';
import { calibResiduals, calibrateLM, logSO3, mul, planarPose, rotX, rotY, rotZ, type V2, type V3 } from '../../../core/vision';
import { makeRng, freshSeed } from '../../../engine/rng';
import { useStepper, StepControls } from '../../../ui/stepper';
import { Dot, Line, Plot } from '../../../plot/Plot';
import { Button, Readout, Readouts, Slider } from '../../../ui/kit';
import { Rich } from '../../../ui/Rich';
import { fmt } from '../../../engine/format';

const TRUE_K = [820, 800, 334, 228];
const GUESS_K = [600, 600, 320, 240];
const BOARD: V3[] = [];
for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) BOARD.push([(i - 3) * 0.03, (j - 2) * 0.03, 0]);
const BOARD2: V2[] = BOARD.map((b) => [b[0], b[1]]);
const NV = 6;
/** Reprojection offsets are drawn magnified, as calibration tools do, so a few pixels are visible in a thumbnail. */
const MAG = 8;

function gauss(next: () => number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += next();
  return (s - 3) * Math.SQRT2;
}

/** Six board poses whose corners all land inside the 640 × 480 image, and their noisy detections. */
export function makePhotos(seed: number, sigma: number): { obs: V2[][]; truth: number[] } {
  const rng = makeRng(seed);
  const poses: number[] = [];
  const clean: V2[][] = [];
  for (let k = 0; k < NV; k++) {
    for (let tries = 0; tries < 50; tries++) {
      const R = mul(rotZ(rng.uniform(-0.5, 0.5)), mul(rotY(rng.uniform(-0.65, 0.65)), rotX(rng.uniform(-0.65, 0.65))));
      const pv = [...logSO3(R), rng.uniform(-0.06, 0.06), rng.uniform(-0.05, 0.05), rng.uniform(0.32, 0.6)];
      const zero = calibResiduals([...TRUE_K, ...pv], BOARD, [BOARD.map(() => [0, 0] as V2)]);
      const px: V2[] = BOARD.map((_, i) => [zero[2 * i], zero[2 * i + 1]]);
      if (px.every(([u, v]) => u > 15 && u < 625 && v > 15 && v < 465) || tries === 49) {
        poses.push(...pv);
        clean.push(px);
        break;
      }
    }
  }
  const noise = makeRng(seed ^ 0x5bd1e995);
  const obs = clean.map((v) => v.map(([u, w]) => [u + sigma * gauss(noise.next), w + sigma * gauss(noise.next)] as V2));
  return { obs, truth: [...TRUE_K, ...poses] };
}

/** Initial guess: the nominal K, and each view's pose from its homography with that K. */
export function initialGuess(obs: V2[][]): number[] {
  const K0 = intrinsics(GUESS_K[0], GUESS_K[1], GUESS_K[2], GUESS_K[3]);
  const p = [...GUESS_K];
  for (const o of obs) {
    const pose = planarPose(K0, BOARD2, o);
    p.push(...(pose ? [...logSO3(pose.R), ...pose.t] : [0, 0, 0, 0, 0, 0.5]));
  }
  return p;
}

function Thumb({ obs, proj, k }: { obs: V2[]; proj: V2[]; k: number }) {
  return (
    <svg viewBox="0 0 640 480" className="vision-svg vision-thumb" role="img" aria-label={`Photo ${k + 1}: detected corners and reprojected corners`}>
      <rect x={0} y={0} width={640} height={480} className="vision-imgbg" />
      <polygon points={[0, 6, 34, 28].map((i) => obs[i].map((x) => x.toFixed(1)).join(',')).join(' ')} className="vision-calib-board" />
      {obs.map((o, i) => (
        <line key={`e${i}`} x1={o[0]} y1={o[1]} x2={proj[i][0]} y2={proj[i][1]} className="vision-calib-err" />
      ))}
      {obs.map((o, i) => (
        <path key={`x${i}`} d={`M${o[0] - 6},${o[1] - 6} l12,12 m0,-12 l-12,12`} className="vision-calib-det" />
      ))}
      {proj.map((q, i) => (
        <circle key={`p${i}`} cx={q[0]} cy={q[1]} r={7} className="vision-calib-proj" />
      ))}
      <rect x={0} y={0} width={640} height={480} className="vision-imgframe" />
      <text x={14} y={40} className="vision-thumb-label">
        {k + 1}
      </text>
    </svg>
  );
}

export function CalibPanel() {
  const [seed, setSeed] = useState(4202);
  const [sigma, setSigma] = useState(0.5);
  const dSigma = useDeferredValue(sigma);
  const { obs, hist } = useMemo(() => {
    const ph = makePhotos(seed, dSigma);
    return { obs: ph.obs, hist: calibrateLM(BOARD, ph.obs, initialGuess(ph.obs), 14) };
  }, [seed, dSigma]);
  const st = useStepper(hist.length - 1, { speed: 2 });
  const it = hist[Math.min(st.i, hist.length - 1)];
  const proj = useMemo(() => {
    const r = calibResiduals(it.params, BOARD, obs);
    return obs.map((o, k) => o.map(([u, v], i) => [u + MAG * r[2 * (k * BOARD.length + i)], v + MAG * r[2 * (k * BOARD.length + i) + 1]] as V2));
  }, [it, obs]);
  const pts = hist.map((h, i) => [i, Math.max(0.01, h.rms)] as [number, number]);
  const floor = Math.SQRT2 * dSigma;
  const [ax, ay, u0, v0] = it.params;
  return (
    <div className="vision-calib">
      <div className="vision-calib-grid">
        <div className="vision-thumbs">
          {obs.map((o, k) => (
            <Thumb key={k} obs={o} proj={proj[k]} k={k} />
          ))}
        </div>
        <div className="vision-calib-side">
          <StepControls st={st} label="iteration" speeds={[1, 2, 4]} />
          <Plot x={{ min: 0, max: Math.max(1, hist.length - 1), label: 'iteration' }} y={{ min: 0.01, max: 200, log: true, label: 'RMS error (px)' }} height={170} ariaLabel="Reprojection error against iteration" cursorX={st.i}>
            <Line points={pts} color="var(--m1)" />
            {dSigma > 0 && <Line points={[[0, floor], [Math.max(1, hist.length - 1), floor]]} color="var(--text-3)" dash />}
            <Dot x={st.i} y={Math.max(0.01, it.rms)} color="var(--m1)" />
          </Plot>
          <Readouts min={112}>
            <Readout tex="\alpha_x" value={ax} sig={4} unit="px" tip={`Estimated focal length in pixel widths (true ${TRUE_K[0]})`} />
            <Readout tex="\alpha_y" value={ay} sig={4} unit="px" tip={`Estimated focal length in pixel heights (true ${TRUE_K[1]})`} />
            <Readout tex="u_0" value={u0} sig={4} unit="px" tip={`Estimated principal point column (true ${TRUE_K[2]})`} />
            <Readout tex="v_0" value={v0} sig={4} unit="px" tip={`Estimated principal point row (true ${TRUE_K[3]})`} />
            <Readout label="RMS error" value={it.rms} sig={3} unit="px" tip="Root-mean-square distance between each detected corner and where the current estimate reprojects it" tone={it.rms < 1.5 * floor + 0.05 ? 'ok' : undefined} />
          </Readouts>
          <Slider label="corner noise" tex="\sigma" tip="Standard deviation of the corner detector's pixel error (per axis)" value={sigma} min={0} max={2} step={0.05} unit="px" onChange={setSigma} />
          <div className="vision-row">
            <Button size="sm" onClick={() => setSeed(freshSeed())}>
              New photos
            </Button>
            <span className="muted vision-hint">
              true K: αx {TRUE_K[0]}, αy {TRUE_K[1]}, (u₀, v₀) = ({TRUE_K[2]}, {TRUE_K[3]})
            </span>
          </div>
        </div>
      </div>
      <Rich
        className="vision-explain"
        text={`**Crosses**: corners found in each photo. **Circles**: where the current estimate of $K$ and of that photo's pose $(R, t)$ puts them, with the offset magnified ×${MAG}; **red lines**: the reprojection errors. Calibration solves for the intrinsics (and lens distortion, ignored here) **and** every photo's extrinsics by minimising the sum of squared red lines:

1. Photograph a known pattern (a checkerboard) at many poses.
2. Detect its corners in every photo.
3. Guess $K$ (here $\\alpha_x = \\alpha_y = 600$ px, centre of the image) and get each photo's pose from its homography.
4. Adjust everything together (Levenberg–Marquardt) to minimise the reprojection error.

The error falls from ${fmt(hist[0].rms, 3)} px to ${fmt(hist[hist.length - 1].rms, 3)} px and stops at the noise floor (dashed, $\\sqrt{2}\\,\\sigma$ per corner): no $K$ can fit noisy corners better than they were measured. More photos at more varied poses pin $K$ down better.`}
      />
    </div>
  );
}
