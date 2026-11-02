// Intrinsics vs extrinsics (summary notes §7 "Image formation"; 2023 Q14, 2024 Q14, 2025 Q14; review deck slide 22).
//
// A cube on a checkerboard, imaged by a 640 × 480 camera. Intrinsic sliders (focal length in pixels, pixel aspect,
// principal point, skew) live inside the camera, in K; extrinsic sliders (position and orientation) say where the
// camera is in the world, in R and t = −RC. Every change is classified as it happens, with the matrix entries it
// touched highlighted. Below: calibration, estimating K from several checkerboard photos (visionCalib.tsx).
import { memo, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { intrinsics } from '../../../core/camera';
import { aimAt, camLook, camT, dot, mv, pixelOf, sub, type Mat3, type V2, type V3 } from '../../../core/vision';
import { Badge, Button, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { LazyMount, MatBox, Panel, useTween } from './visionCommon';
import { CalibPanel } from './visionCalib';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'intrinsics',
  title: 'Intrinsics vs extrinsics',
  summary:
    'Image a cube on a checkerboard. Turn the camera’s internal knobs (focal length in pixels, principal point, skew, pixel aspect) or move and rotate the camera, and see which matrix each change lives in. Then calibrate: estimate K from photos of a checkerboard as the reprojection error falls.',
  notice:
    'Changing $K$ only zooms, slides, stretches or shears the picture you already had; moving or turning the camera ($R$, $t$) changes **what** it sees and the perspective. So 3-D position and orientation are **extrinsic**: the Q14 trap of 2023, 2024 and 2025.',
  minutes: 10,
};

const IMG_W = 640;
const IMG_H = 480;
const D2R = Math.PI / 180;
const CUBE_C: V3 = [0, 0, 0.25];

interface Params {
  ax: number;
  aspect: number;
  u0: number;
  v0: number;
  skew: number;
  X: number;
  Y: number;
  Z: number;
  yaw: number;
  pitch: number;
  roll: number;
}
type Key = keyof Params;
const INTRINSIC: Key[] = ['ax', 'aspect', 'u0', 'v0', 'skew'];

const START_C: V3 = [-2.4, -2.0, 1.6];
const startAim = aimAt(START_C, CUBE_C);
const START: Params = { ax: 600, aspect: 1, u0: 320, v0: 240, skew: 0, X: START_C[0], Y: START_C[1], Z: START_C[2], yaw: startAim.yaw / D2R, pitch: startAim.pitch / D2R, roll: 0 };

const NAMES: Record<Key, { name: string; why: string }> = {
  ax: { name: 'focal length αx (pixels)', why: '$\\alpha_x = f/\\rho_w$, the focal length measured in pixel widths. It scales the whole image about the principal point, like a zoom lens. The camera has not moved, so nothing about the perspective changes.' },
  aspect: { name: 'pixel aspect αy/αx', why: '$\\alpha_y/\\alpha_x = \\rho_w/\\rho_h$: non-square pixels stretch the image vertically. It is a property of the sensor, so it lives in $K$.' },
  u0: { name: 'principal point u0', why: 'The principal point $(u_0, v_0)$ is where the optical axis meets the sensor. Moving it slides the whole picture sideways; nothing in the world moved.' },
  v0: { name: 'principal point v0', why: 'The principal point $(u_0, v_0)$ is where the optical axis meets the sensor. Moving it slides the whole picture up or down; nothing in the world moved.' },
  skew: { name: 'skew s', why: 'Skew is the coupling between pixel rows and columns (non-perpendicular axes). It shears the image; modern sensors have $s \\approx 0$.' },
  X: { name: 'camera position X', why: 'Where the camera is in the world: $t = -RC$. Moving it changes the perspective: near parts shift more than far parts (parallax). $K$ is untouched.' },
  Y: { name: 'camera position Y', why: 'Where the camera is in the world: $t = -RC$. Moving it changes the perspective: near parts shift more than far parts (parallax). $K$ is untouched.' },
  Z: { name: 'camera height Z', why: 'Where the camera is in the world: $t = -RC$. Raising it looks down on the cube from a steeper angle. $K$ is untouched.' },
  yaw: { name: 'camera yaw (pan)', why: 'How the camera is turned in the world: the rotation $R$ (and $t = -RC$ with it). The view sweeps across the scene; $K$ is untouched.' },
  pitch: { name: 'camera pitch (tilt)', why: 'How the camera is tilted in the world: the rotation $R$ (and $t = -RC$). Tilting makes vertical edges converge (keystone); $K$ is untouched.' },
  roll: { name: 'camera roll', why: 'Rotation about the optical axis: part of $R$ (and $t = -RC$). The picture rotates; $K$ is untouched.' },
};

const DOLLY = {
  name: 'dolly zoom',
  why: 'Two changes at once: the camera walks towards the cube (extrinsic, $t$) while $\\alpha_x$ and $\\alpha_y$ shrink in proportion (intrinsic, $K$). The cube keeps its size, but the board behind it stretches away: only moving the camera changes the perspective.',
};

function cameraOf(p: Params) {
  const K: Mat3 = intrinsics(p.ax, p.ax * p.aspect, p.u0, p.v0, p.skew);
  const pose = camLook([p.X, p.Y, p.Z], p.yaw * D2R, p.pitch * D2R, p.roll * D2R);
  return { K, pose };
}

// ------------------------------------------------------------------ the image

const CUBE_V: V3[] = [
  [-0.25, -0.25, 0],
  [0.25, -0.25, 0],
  [0.25, 0.25, 0],
  [-0.25, 0.25, 0],
  [-0.25, -0.25, 0.5],
  [0.25, -0.25, 0.5],
  [0.25, 0.25, 0.5],
  [-0.25, 0.25, 0.5],
];
const CUBE_F: { v: number[]; n: V3; shade: number }[] = [
  { v: [4, 5, 6, 7], n: [0, 0, 1], shade: 0.55 },
  { v: [0, 1, 5, 4], n: [0, -1, 0], shade: 0.8 },
  { v: [1, 2, 6, 5], n: [1, 0, 0], shade: 0.35 },
  { v: [2, 3, 7, 6], n: [0, 1, 0], shade: 0.8 },
  { v: [3, 0, 4, 7], n: [-1, 0, 0], shade: 0.35 },
];

const ptsAttr = (ps: V2[]) => ps.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');

function SceneImage({ p, label }: { p: Params; label?: string }) {
  const { K, pose } = cameraOf(p);
  const proj = (X: V3) => pixelOf(K, mv(pose.R, sub(X, pose.C)));
  const squares: { pts: V2[]; dark: boolean }[] = [];
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 6; j++) {
      const x0 = -1 + 0.25 * i;
      const y0 = -0.75 + 0.25 * j;
      const q = [proj([x0, y0, 0]), proj([x0 + 0.25, y0, 0]), proj([x0 + 0.25, y0 + 0.25, 0]), proj([x0, y0 + 0.25, 0])];
      if (q.every(Boolean)) squares.push({ pts: q as V2[], dark: (i + j) % 2 === 0 });
    }
  const cv = CUBE_V.map(proj);
  const faces = CUBE_F.filter((f) => {
    const c = CUBE_V[f.v[0]];
    return dot(f.n, sub(pose.C, c)) > 0 && f.v.every((k) => cv[k]);
  });
  return (
    <svg viewBox={`-6 -6 ${IMG_W + 12} ${IMG_H + 12}`} className="vision-svg" role="img" aria-label={label ?? 'Camera image of a cube on a checkerboard'}>
      <defs>
        <clipPath id="vision-intr-clip">
          <rect x={0} y={0} width={IMG_W} height={IMG_H} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={IMG_W} height={IMG_H} className="vision-imgbg" />
      <g clipPath="url(#vision-intr-clip)">
        {squares.map((s, i) => (
          <polygon key={i} points={ptsAttr(s.pts)} className={s.dark ? 'vision-sq-dark' : 'vision-sq-light'} />
        ))}
        {faces.map((f, i) => (
          <polygon key={i} points={ptsAttr(f.v.map((k) => cv[k]!))} className="vision-cubeface" style={{ fill: `color-mix(in srgb, var(--m1) ${Math.round(f.shade * 100)}%, var(--surface))` }} />
        ))}
        <line x1={p.u0 - 14} y1={p.v0} x2={p.u0 + 14} y2={p.v0} className="vision-pp" />
        <line x1={p.u0} y1={p.v0 - 14} x2={p.u0} y2={p.v0 + 14} className="vision-pp" />
      </g>
      <rect x={0} y={0} width={IMG_W} height={IMG_H} className="vision-imgframe" />
      <text x={8} y={18} className="vision-small">
        (0, 0) → u
      </text>
      <text x={8} y={34} className="vision-small">
        ↓ v
      </text>
      <text x={p.u0 + 16} y={p.v0 - 8} className="vision-small is-accent">
        (u₀, v₀)
      </text>
    </svg>
  );
}

/** A small top view: the board, the cube and the camera with its field of view. */
function TopView({ p }: { p: Params }) {
  const s = 26;
  const ox = 120;
  const oy = 84;
  const X = (x: number) => ox + s * x;
  const Y = (y: number) => oy - s * y;
  const yaw = p.yaw * D2R;
  const half = Math.atan2(IMG_W / 2, p.ax);
  const L = 2.2;
  const a = [yaw + half, yaw - half].map((t) => [X(p.X + L * Math.cos(t)), Y(p.Y + L * Math.sin(t))]);
  return (
    <svg viewBox="0 0 240 168" className="vision-svg vision-topview" role="img" aria-label="Top view of the camera, the board and the cube">
      <rect x={X(-1)} y={Y(0.75)} width={2 * s} height={1.5 * s} className="vision-sq-light vision-boardtop" />
      <rect x={X(-0.25)} y={Y(0.25)} width={0.5 * s} height={0.5 * s} className="vision-cubeface" />
      <polygon points={`${X(p.X)},${Y(p.Y)} ${a[0][0]},${a[0][1]} ${a[1][0]},${a[1][1]}`} className="vision-fov" />
      <circle cx={X(p.X)} cy={Y(p.Y)} r={5} className="vision-camdot" />
      <text x={6} y={14} className="vision-small">
        top view (x right, y up)
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ the simulation

interface Api {
  dolly(): void;
  pan(): void;
  pp(): void;
}

export default function IntrinsicsLab() {
  const [p, setP] = useState<Params>(START);
  const [last, setLast] = useState<Key | 'dolly' | null>(null);
  const [log, setLog] = useState<Key[]>([]);
  const tween = useTween();

  const change = (k: Key, x: number) => {
    setP((q) => ({ ...q, [k]: x }));
    setLast(k);
    setLog((l) => (l[0] === k ? l : [k, ...l].slice(0, 6)));
  };
  const aim = () => {
    const a = aimAt([p.X, p.Y, p.Z], CUBE_C);
    setP({ ...p, yaw: a.yaw / D2R, pitch: a.pitch / D2R, roll: 0 });
    setLast('yaw');
    setLog((l) => (l[0] === 'yaw' ? l : (['yaw', ...l] as Key[]).slice(0, 6)));
  };

  const api = useRef<Api>(null as unknown as Api);
  api.current = {
    dolly: () => {
      // Move towards the cube while zooming out so the cube keeps its size: only the perspective changes.
      const a = aimAt(START_C, CUBE_C);
      const p0: Params = { ...START, yaw: a.yaw / D2R, pitch: a.pitch / D2R };
      setP(p0);
      setLast('dolly');
      tween({ from: [1], to: [0.42], ms: 2200 }, ([k]) => {
        const C = CUBE_C.map((c, i) => c + (START_C[i] - c) * k) as V3;
        setP({ ...p0, X: C[0], Y: C[1], Z: C[2], ax: START.ax * k });
      });
    },
    pan: () => {
      setP(START);
      setLast('yaw');
      setLog((l) => (['yaw', ...l.filter((x) => x !== 'yaw')] as Key[]).slice(0, 6));
      tween({ from: [START.yaw], to: [START.yaw + 20] }, ([y]) => setP({ ...START, yaw: y }));
    },
    pp: () => {
      setP(START);
      setLast('u0');
      setLog((l) => (['u0', ...l.filter((x) => x !== 'u0')] as Key[]).slice(0, 6));
      tween({ from: [320], to: [400] }, ([u]) => setP({ ...START, u0: u }));
    },
  };

  const { K, pose } = cameraOf(p);
  const t = camT(pose);
  const intr = last && last !== 'dolly' ? INTRINSIC.includes(last) : null;
  const info = last === 'dolly' ? DOLLY : last ? NAMES[last] : null;
  const kHi = useMemo(() => {
    const m = [
      [false, false, false],
      [false, false, false],
      [false, false, false],
    ];
    if (last === 'ax' || last === 'dolly') m[0][0] = m[1][1] = true;
    if (last === 'aspect') m[1][1] = true;
    if (last === 'u0') m[0][2] = true;
    if (last === 'v0') m[1][2] = true;
    if (last === 'skew') m[0][1] = true;
    return m;
  }, [last]);
  const rtHi = useMemo(() => {
    const rot = last === 'yaw' || last === 'pitch' || last === 'roll';
    const pos = last === 'X' || last === 'Y' || last === 'Z' || last === 'dolly';
    return [0, 1, 2].map(() => [rot, rot, rot, rot || pos]);
  }, [last]);

  const sl = (k: Key, label: string, tex: string, tip: string, min: number, max: number, step: number, unit: string) => (
    <Slider label={label} tex={tex} tip={tip} value={p[k]} min={min} max={max} step={step} unit={unit} onChange={(x) => change(k, x)} />
  );

  return (
    <div className="vision-sim">
      <div className="vision-toolbar">
        <Button onClick={() => (setP(START), setLast(null), setLog([]))}>Reset</Button>
        <Button onClick={aim}>Aim at the cube</Button>
        <Button onClick={() => api.current.dolly()}>Dolly zoom</Button>
        <span className="muted vision-hint">Dolly zoom: walk in while zooming out. The cube keeps its size, the board behind it does not.</span>
      </div>
      <div className="vision-panels vision-panels-wide">
        <Panel title="Camera image" hint="640 × 480 px · + is the principal point">
          <SceneImage p={p} />
        </Panel>
        <div className="vision-box">
          <h4>What you just changed</h4>
          {info ? (
            <>
              <div className="vision-row">
                {last === 'dolly' ? <Badge tone="warn">BOTH · position in t, αx in K</Badge> : <Badge tone={intr ? 'm1' : 'm2'}>{intr ? 'INTRINSIC · in K' : 'EXTRINSIC · in R, t'}</Badge>}
                <strong>{info.name}</strong>
              </div>
              <Rich className="vision-explain" text={info.why} />
            </>
          ) : (
            <p className="vision-explain">Move any slider. Each change is sorted into intrinsic (inside the camera) or extrinsic (where the camera is).</p>
          )}
          <div className="vision-mats">
            <MatBox label={<Rich inline text="$K =$" />} rows={K.map((r) => r.slice())} hi={kHi} sig={4} cls="is-k" />
            <MatBox label={<Rich inline text="$[R \mid t] =$" />} rows={pose.R.map((r, i) => [...r, t[i]])} hi={rtHi} sig={3} cls="is-rt" />
          </div>
          {log.length > 0 && (
            <div className="vision-log" aria-label="Recent changes">
              {log.map((k, i) => (
                <span key={`${k}-${i}`} className={`vision-chip ${INTRINSIC.includes(k) ? 'is-intr' : 'is-extr'}`}>
                  {NAMES[k].name.replace(/ \(.*\)/, '')}
                </span>
              ))}
            </div>
          )}
          <TopView p={p} />
        </div>
      </div>

      <div className="vision-controls">
        <div className="vision-box vision-intr-box">
          <h4>Intrinsics K: inside the camera</h4>
          {sl('ax', 'focal length', '\\alpha_x', 'Focal length in pixels: f divided by the pixel width', 150, 2000, 1, 'px')}
          {sl('aspect', 'pixel aspect', '\\alpha_y/\\alpha_x', 'Ratio of the pixel width to the pixel height (1 = square pixels)', 0.5, 2, 0.01, '')}
          {sl('u0', 'principal point', 'u_0', 'Column where the optical axis meets the sensor', 0, IMG_W, 1, 'px')}
          {sl('v0', 'principal point', 'v_0', 'Row where the optical axis meets the sensor', 0, IMG_H, 1, 'px')}
          {sl('skew', 'skew', 's', 'Shear between the pixel axes (0 for square, perpendicular pixels)', -400, 400, 1, 'px')}
        </div>
        <div className="vision-box vision-extr-box">
          <h4>Extrinsics R, t: the camera in the world</h4>
          {sl('X', 'position', 'X', 'Camera centre, world x', -4, 4, 0.01, 'm')}
          {sl('Y', 'position', 'Y', 'Camera centre, world y', -4, 4, 0.01, 'm')}
          {sl('Z', 'height', 'Z', 'Camera centre height above the board', 0.2, 4, 0.01, 'm')}
          {sl('yaw', 'pan (yaw)', '\\psi', 'Turn about the vertical world axis', -180, 180, 0.5, '°')}
          {sl('pitch', 'tilt (pitch)', '\\phi', 'Tilt up (+) or down (−)', -80, 80, 0.5, '°')}
          {sl('roll', 'roll', '\\gamma', 'Rotation about the optical axis', -180, 180, 0.5, '°')}
        </div>
      </div>

      <PredictBlock api={api} />

      <Panel title="Calibration: estimating K from checkerboard photos" hint="Levenberg–Marquardt on the reprojection error">
        <LazyMount minHeight={520}>
          <CalibPanel />
        </LazyMount>
      </Panel>
    </div>
  );
}

const PredictBlock = memo(function PredictBlock({ api }: { api: MutableRefObject<Api> }) {
  return (
    <div className="vision-predicts">
      <PredictReveal
        id="vision-intr-dolly"
        question="Two ways to make the cube twice as big in the image: double $\alpha_x$ (zoom), or walk the camera in to half the distance. Do the two pictures look the same?"
        options={[
          'No: walking in (extrinsic) also changes the perspective; zooming (intrinsic) only magnifies',
          'Yes: both double every length in the image',
          'No: zooming changes the perspective, walking in does not',
          'Yes, as long as the principal point stays at the image centre',
        ]}
        answer={0}
        explain="Zooming scales the image about the principal point: every ray is kept, so the relative layout is identical, just bigger. Walking in changes the rays themselves: the near face grows faster than the far edge of the board, so the perspective changes. The dolly zoom (walk in while zooming out to keep the cube's size) makes that visible: the cube stays put while the board behind it stretches away. Position is extrinsic; $\alpha_x$ is intrinsic."
        tryIt="press Show me: the camera walks in while α_x shrinks in proportion."
        onApply={() => api.current.dolly()}
      />
      <PredictReveal
        id="vision-intr-pan"
        question="You pan the camera 20° to the left without moving it. Which parameters change?"
        options={['Only the extrinsics: $R$, and $t = -RC$ with it', 'Only the intrinsics $K$', 'Both $K$ and $R$', 'None: the image just shifts sideways']}
        answer={0}
        explain="Orientation in the world is extrinsic: it is the rotation $R$. Because $t = -RC$, $t$ changes too even though the centre $C$ did not move. $K$ describes the inside of the camera (focal length in pixels, principal point, skew) and is untouched. This is the Q14 trap: 3-D position **and** 3-D orientation are both extrinsic."
        tryIt="press Show me: the yaw turns by 20°; watch which matrix entries light up."
        onApply={() => api.current.pan()}
      />
      <PredictReveal
        id="vision-intr-pp"
        question="Shift the principal point $u_0$ from 320 px to 400 px. What happens to the picture?"
        options={['Everything slides 80 px to the right, with no change of shape', 'The cube turns, as if the camera had panned', 'The perspective changes, as if the camera had moved left', 'Nothing: only the crosshair moves']}
        answer={0}
        explain="$u = \alpha_x x + s y + u_0$: adding 80 to $u_0$ adds 80 px to every $u$. No ray changed, so the shapes are identical; the whole image is translated. (A pan looks similar at first, but it is a rotation: the far and near parts shift differently and the board's edges tilt.)"
        tryIt="press Show me: u₀ slides from 320 to 400 px."
        onApply={() => api.current.pp()}
      />
    </div>
  );
});
