// World → pixel, step by step (summary notes §7 "Image formation"; review deck slides 21-22; 2023 Q13, 2024 Q13,
// 2025 Q13 perspective effects).
//
// Left: a three.js view of the world with the camera's frustum, its virtual image plane and the ray from a draggable
// world point P to the camera centre. Right: the 640 × 480 image the camera makes. Below: the three stages with this
// point's numbers: X_c = R X_w + t (extrinsics), (x, y) = (X_c/Z_c, Y_c/Z_c) (perspective division, where depth is
// lost), (u, v, 1)ᵀ = K (x, y, 1)ᵀ (intrinsics). Toggles add perspective effects: parallel rails meeting at a vanishing
// point, a right angle that is not 90° in the image, near and far posts, and scale ambiguity (a big far cube and a
// small near one giving the same image).
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { intrinsics } from '../../../core/camera';
import { add, aimAt, angleAt, camLook, camT, clipFront, inv3, lerp3, mv, pixelOf, scale, sub, tr, vanishingPoint, type CamPose, type Mat3, type V2, type V3 } from '../../../core/vision';
import { useThemeColors } from '../../../ui/theme';
import { Button, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { fmt } from '../../../engine/format';
import { MatBox, Panel, useTween } from './visionCommon';
import { PIPE_COLOR_VARS, PipeRenderer, type Lbl, type PColor, type PipeSpec, type Quad, type Seg } from './pipelineScene';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'pipeline',
  title: 'World to pixel, step by step (3-D)',
  summary:
    'Drag a world point and follow it through the three stages of image formation: extrinsics (world to camera frame), perspective division, intrinsics (to pixels). Orbit the 3-D view; switch on perspective effects: vanishing points, angles, near and far objects, scale ambiguity.',
  notice:
    'Depth disappears in stage 2: every point on the ray through P gives the same $(x, y)$ and the same pixel. That is why one image gives directions and relative sizes but not absolute size or distance.',
  minutes: 12,
};

const IMG_W = 640;
const IMG_H = 480;
const D2R = Math.PI / 180;
const C0: V3 = [-4.2, -3.4, 2.2];
const AIM0 = aimAt(C0, [0.4, 0.4, 0.5]);

interface Fx {
  vp: boolean;
  angles: boolean;
  size: boolean;
  ambig: boolean;
}
interface St {
  P: V3;
  C: V3;
  yaw: number;
  pitch: number;
  ax: number;
  fx: Fx;
  k: number;
}
const START: St = { P: [0.9, 0.5, 0.9], C: C0, yaw: AIM0.yaw / D2R, pitch: AIM0.pitch / D2R, ax: 520, fx: { vp: false, angles: false, size: false, ambig: false }, k: 2.2 };

// ------------------------------------------------------------------ scene geometry (world, z up)

const RAILS: [V3, V3][] = [
  [
    [1.2, -1, 0],
    [1.2, 16, 0],
  ],
  [
    [2.0, -1, 0],
    [2.0, 16, 0],
  ],
];
const SQUARE: V3[] = [
  [-2.3, 0.5, 0],
  [-1.1, 0.5, 0],
  [-1.1, 1.7, 0],
  [-2.3, 1.7, 0],
];
const POSTS: [V3, V3][] = [
  [
    [-2.6, -1.2, 0],
    [-2.6, -1.2, 1],
  ],
  [
    [2.8, 3.4, 0],
    [2.8, 3.4, 1],
  ],
];
const AMB_T: V3 = [-0.5, -1.6, 1.2];
const AMB_S = 0.36;

function cubeEdges(c: V3, s: number): [V3, V3][] {
  const h = s / 2;
  const v = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => add(c, [i & 1 ? h : -h, i & 2 ? h : -h, i & 4 ? h : -h]));
  const E = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return E.map(([a, b]) => [v[a], v[b]]);
}
/** The two ambiguity cubes: the small one, and the same cube scaled by k about the original camera centre. */
function ambigCubes(k: number): { small: [V3, V3][]; big: [V3, V3][] } {
  const cs = lerp3(C0, AMB_T, 0.45);
  const cb = add(C0, scale(sub(cs, C0), k));
  return { small: cubeEdges(cs, AMB_S), big: cubeEdges(cb, AMB_S * k) };
}

function camOf(s: St): { K: Mat3; pose: CamPose } {
  return { K: intrinsics(s.ax, s.ax, IMG_W / 2, IMG_H / 2), pose: camLook(s.C, s.yaw * D2R, s.pitch * D2R) };
}

/** World point at camera-frame position Xc. */
const toWorld = (pose: CamPose, Xc: V3): V3 => add(pose.C, mv(tr(pose.R), Xc));

const PLANE_D = 0.9; // depth of the drawn (virtual) image plane, m

function buildSpec(s: St): PipeSpec {
  const { K, pose } = camOf(s);
  const Ki = inv3(K);
  const segs: Seg[] = [];
  const quads: Quad[] = [];
  const labels: Lbl[] = [];
  const pts: PipeSpec['pts'] = [];
  // World axes.
  const AX: [V3, PColor, string][] = [
    [[1, 0, 0], '--m2', 'x_w'],
    [[0, 1, 0], '--m3', 'y_w'],
    [[0, 0, 1], '--m1', 'z_w'],
  ];
  for (const [d, c, t] of AX) {
    segs.push({ a: [0, 0, 0], b: d, color: c });
    labels.push({ key: t, text: t, at: scale(d, 1.15), color: `var(${c})` });
  }
  // Camera axes, frustum and virtual image plane.
  const corners = [
    [0, 0],
    [IMG_W, 0],
    [IMG_W, IMG_H],
    [0, IMG_H],
  ].map(([u, v]) => toWorld(pose, scale(mv(Ki, [u, v, 1]), PLANE_D)));
  corners.forEach((c, i) => {
    segs.push({ a: pose.C, b: c, color: '--text-2', opacity: 0.7 });
    segs.push({ a: c, b: corners[(i + 1) % 4], color: '--text', opacity: 0.9 });
  });
  quads.push({ pts: corners, color: '--m1', opacity: 0.08 });
  const CA: [V3, PColor, string][] = [
    [[0.45, 0, 0], '--m2', 'x_c'],
    [[0, 0.45, 0], '--m3', 'y_c'],
    [[0, 0, 0.45], '--m1', 'z_c'],
  ];
  for (const [d, c, t] of CA) {
    const e = toWorld(pose, d);
    segs.push({ a: pose.C, b: e, color: c });
    labels.push({ key: t, text: t, at: toWorld(pose, scale(d, 1.3)), color: `var(${c})` });
  }
  pts.push({ at: pose.C, color: '--text', r: 0.06 });
  labels.push({ key: 'C', text: 'camera centre C', at: add(pose.C, [0, 0, 0.32]) });
  labels.push({ key: 'plane', text: 'image plane', at: corners[0] });
  // The point P and its ray.
  const Xc = mv(pose.R, sub(s.P, pose.C));
  pts.push({ at: s.P, color: '--accent', r: 0.11, id: 'P' });
  segs.push({ a: s.P, b: [s.P[0], s.P[1], 0], color: '--text-3', dashed: true });
  labels.push({ key: 'P', text: 'P (drag me)', at: add(s.P, [0, 0, 0.32]), color: 'var(--accent)' });
  if (Xc[2] > 0.05) {
    segs.push({ a: s.P, b: pose.C, color: '--accent', dashed: true });
    const onPlane = toWorld(pose, scale(Xc, PLANE_D / Xc[2]));
    pts.push({ at: onPlane, color: '--accent', r: 0.045 });
  }
  // Effects.
  if (s.fx.vp) RAILS.forEach(([a, b]) => segs.push({ a, b, color: '--m4' }));
  if (s.fx.angles) SQUARE.forEach((a, i) => segs.push({ a, b: SQUARE[(i + 1) % 4], color: '--m3' }));
  if (s.fx.size) POSTS.forEach(([a, b]) => segs.push({ a, b, color: '--m2' }));
  if (s.fx.ambig) {
    const { small, big } = ambigCubes(s.k);
    small.forEach(([a, b]) => segs.push({ a, b, color: '--m1' }));
    big.forEach(([a, b]) => segs.push({ a, b, color: '--m2' }));
    const cs = lerp3(C0, AMB_T, 0.45);
    segs.push({ a: C0, b: add(C0, scale(sub(cs, C0), 3.4)), color: '--text-3', dashed: true });
  }
  return { segs, pts, quads, labels };
}

// ------------------------------------------------------------------ the 2-D image

interface ImgLine {
  a: V2;
  b: V2;
  cls: string;
}

function projSeg(K: Mat3, pose: CamPose, a: V3, b: V3): [V2, V2] | null {
  const c = clipFront(mv(pose.R, sub(a, pose.C)), mv(pose.R, sub(b, pose.C)), 0.05);
  if (!c) return null;
  const pa = pixelOf(K, c[0]);
  const pb = pixelOf(K, c[1]);
  return pa && pb ? [pa, pb] : null;
}

function CameraImage({ s }: { s: St }) {
  const { K, pose } = camOf(s);
  const lines: ImgLine[] = [];
  const add2 = (a: V3, b: V3, cls: string) => {
    const p = projSeg(K, pose, a, b);
    if (p) lines.push({ a: p[0], b: p[1], cls });
  };
  for (let i = -4; i <= 4; i++) {
    add2([i, -4, 0], [i, 4, 0], 'vision-img-grid');
    add2([-4, i, 0], [4, i, 0], 'vision-img-grid');
  }
  add2(s.P, [s.P[0], s.P[1], 0], 'vision-img-stem');
  add2([0, 0, 0], [1, 0, 0], 'vision-img-ax is-x');
  add2([0, 0, 0], [0, 1, 0], 'vision-img-ax is-y');
  add2([0, 0, 0], [0, 0, 1], 'vision-img-ax is-z');
  if (s.fx.vp) RAILS.forEach(([a, b]) => add2(a, b, 'vision-img-rail'));
  if (s.fx.angles) SQUARE.forEach((a, i) => add2(a, SQUARE[(i + 1) % 4], 'vision-img-square'));
  if (s.fx.size) POSTS.forEach(([a, b]) => add2(a, b, 'vision-img-post'));
  if (s.fx.ambig) {
    const { small, big } = ambigCubes(s.k);
    small.forEach(([a, b]) => add2(a, b, 'vision-img-small'));
    big.forEach(([a, b]) => add2(a, b, 'vision-img-big'));
  }
  const Xc = mv(pose.R, sub(s.P, pose.C));
  const pP = pixelOf(K, Xc);
  // Vanishing point of the rails (direction +y).
  const vp = s.fx.vp ? vanishingPoint(K, pose, [0, 1, 0]) : null;
  const vpIn = vp && vp[0] >= 0 && vp[0] <= IMG_W && vp[1] >= 0 && vp[1] <= IMG_H;
  const railNear = s.fx.vp ? RAILS.map(([a]) => pixelOf(K, mv(pose.R, sub(a, pose.C)))) : [];
  // Angles of the square in the image.
  const sq = s.fx.angles ? SQUARE.map((p) => pixelOf(K, mv(pose.R, sub(p, pose.C)))) : [];
  const sqAngles = sq.length === 4 && sq.every(Boolean) ? sq.map((b, i) => angleAt(sq[(i + 3) % 4]!, b!, sq[(i + 1) % 4]!) / D2R) : null;
  const posts = s.fx.size ? POSTS.map(([a, b]) => [pixelOf(K, mv(pose.R, sub(a, pose.C))), pixelOf(K, mv(pose.R, sub(b, pose.C)))] as const) : [];
  const edgeArrow = (q: V2) => {
    const cx = IMG_W / 2;
    const cy = IMG_H / 2;
    const dx = q[0] - cx;
    const dy = q[1] - cy;
    const t = Math.min(Math.abs((IMG_W / 2 - 16) / (dx || 1e-9)), Math.abs((IMG_H / 2 - 16) / (dy || 1e-9)));
    return [cx + dx * t, cy + dy * t] as V2;
  };
  return (
    <svg viewBox={`-4 -4 ${IMG_W + 8} ${IMG_H + 8}`} className="vision-svg" role="img" aria-label="The camera's image">
      <defs>
        <clipPath id="vision-pipe-clip">
          <rect x={0} y={0} width={IMG_W} height={IMG_H} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={IMG_W} height={IMG_H} className="vision-imgbg" />
      <g clipPath="url(#vision-pipe-clip)">
        {lines.map((l, i) => (
          <line key={i} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} className={l.cls} />
        ))}
        {vp &&
          railNear.map((p, i) => p && <line key={`vx${i}`} x1={p[0]} y1={p[1]} x2={vp[0]} y2={vp[1]} className="vision-img-vpline" />)}
        {vp && vpIn && <circle cx={vp[0]} cy={vp[1]} r={6} className="vision-img-vp" />}
        {sqAngles &&
          sq.map((p, i) => (
            <text key={`a${i}`} x={p![0] + 6} y={p![1] - 6} className="vision-label is-small">
              {fmt(sqAngles[i], 3)}°
            </text>
          ))}
        {posts.map(([a, b], i) =>
          a && b ? (
            <text key={`p${i}`} x={b[0] + 6} y={(a[1] + b[1]) / 2} className="vision-label is-small">
              {fmt(Math.hypot(a[0] - b[0], a[1] - b[1]), 3)} px
            </text>
          ) : null
        )}
        {pP && (
          <>
            <circle cx={pP[0]} cy={pP[1]} r={7} className="vision-img-p" />
            <text x={pP[0] + 10} y={pP[1] - 9} className="vision-label">
              p = ({fmt(pP[0], 4)}, {fmt(pP[1], 4)})
            </text>
          </>
        )}
      </g>
      {vp && !vpIn && (
        <g>
          {(() => {
            const e = edgeArrow(vp);
            return (
              <>
                <circle cx={e[0]} cy={e[1]} r={5} className="vision-img-vp" />
                <text x={Math.min(IMG_W - 170, Math.max(6, e[0] - 60))} y={Math.min(IMG_H - 8, Math.max(16, e[1] + (e[1] < IMG_H / 2 ? 18 : -10)))} className="vision-label is-small">
                  vanishing point off the frame →
                </text>
              </>
            );
          })()}
        </g>
      )}
      <rect x={0} y={0} width={IMG_W} height={IMG_H} className="vision-imgframe" />
      {!pP && (
        <text x={IMG_W / 2} y={IMG_H / 2} textAnchor="middle" className="vision-label">
          P is behind the camera: not imaged
        </text>
      )}
      {sqAngles && (
        <text x={8} y={IMG_H - 10} className="vision-label is-small">
          The square’s corners are all 90° on the ground; in the image they are {sqAngles.map((a) => `${fmt(a, 3)}°`).join(', ')} (sum 360°).
        </text>
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ the simulation

interface Api {
  vp(): void;
  ambig(): void;
  slide(): void;
}

export default function Pipeline3D() {
  const [s, setS] = useState<St>(START);
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rendRef = useRef<PipeRenderer | null>(null);
  const colors = useThemeColors(PIPE_COLOR_VARS);
  const tween = useTween();
  const spec = useMemo(() => buildSpec(s), [s]);

  useEffect(() => {
    if (!hostRef.current || !overlayRef.current) return;
    let r: PipeRenderer;
    try {
      r = new PipeRenderer(hostRef.current, overlayRef.current, colors);
    } catch {
      return; // no WebGL: the image and the stages still work
    }
    rendRef.current = r;
    r.onDrag = (_id, p) => setS((q) => ({ ...q, P: p }));
    return () => {
      r.dispose();
      rendRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => rendRef.current?.setColors(colors), [colors]);
  useEffect(() => rendRef.current?.setScene(spec), [spec]);

  const { K, pose } = camOf(s);
  const t = camT(pose);
  const Xc = mv(pose.R, sub(s.P, pose.C));
  const front = Xc[2] > 1e-6;
  const x = Xc[0] / Xc[2];
  const y = Xc[1] / Xc[2];
  const u = s.ax * x + IMG_W / 2;
  const v = s.ax * y + IMG_H / 2;
  const inImg = front && u >= 0 && u <= IMG_W && v >= 0 && v <= IMG_H;

  const setP = (i: number, val: number) => setS((q) => ({ ...q, P: q.P.map((c, j) => (j === i ? val : c)) as V3 }));
  const setC = (i: number, val: number) => setS((q) => ({ ...q, C: q.C.map((c, j) => (j === i ? val : c)) as V3 }));
  const setFx = (k: keyof Fx, on: boolean) => setS((q) => ({ ...q, fx: { ...q.fx, [k]: on } }));
  const aimP = () => {
    const a = aimAt(s.C, s.P);
    setS({ ...s, yaw: a.yaw / D2R, pitch: a.pitch / D2R });
  };

  const api = useRef<Api>(null as unknown as Api);
  api.current = {
    vp: () => {
      const C: V3 = [1.6, -4.2, 1.4];
      setS((q) => ({ ...q, fx: { ...q.fx, vp: true } }));
      tween({ from: [...s.C, s.yaw, s.pitch], to: [...C, 90, -8], ms: 1400 }, (a) => setS((q) => ({ ...q, C: [a[0], a[1], a[2]], yaw: a[3], pitch: a[4] })));
    },
    ambig: () => {
      setS((q) => ({ ...q, C: C0, yaw: START.yaw, pitch: START.pitch, ax: START.ax, k: 1, fx: { ...q.fx, ambig: true } }));
      tween({ from: [1], to: [3], ms: 2000 }, ([k]) => setS((q) => ({ ...q, k })));
    },
    slide: () => {
      // Slide P along its own ray towards the camera: X_c changes, (x, y) and (u, v) do not.
      const P0 = s.P;
      const C = s.C;
      tween({ from: [1], to: [0.45], ms: 1600 }, ([k]) => setS((q) => ({ ...q, P: add(C, scale(sub(P0, C), k)) })));
    },
  };

  const sl = (label: string, tex: string, tip: string, value: number, min: number, max: number, step: number, unit: string, on: (x: number) => void) => (
    <Slider label={label} tex={tex} tip={tip} value={value} min={min} max={max} step={step} unit={unit} onChange={on} />
  );

  return (
    <div className="vision-sim">
      <div className="vision-panels">
        <Panel title="3-D world" hint="drag to orbit · drag P to move it · scroll to zoom">
          <div className="vision-3d" ref={hostRef}>
            <div className="vision-3doverlay" ref={overlayRef} />
          </div>
        </Panel>
        <Panel title="Camera image" hint="640 × 480 px, principal point at the centre">
          <CameraImage s={s} />
        </Panel>
      </div>

      <div className="vision-stages">
        <div className="vision-box vision-stage">
          <h4>1 · Extrinsics: world → camera frame</h4>
          <Rich text="$$X_c = R\,X_w + t$$" />
          <div className="vision-matrow">
            <MatBox rows={pose.R.map((r) => r.slice())} sig={3} />
            <MatBox rows={s.P.map((c) => [c])} sig={3} />
            <span>+</span>
            <MatBox rows={t.map((c) => [c])} sig={3} />
            <span>=</span>
            <MatBox rows={Xc.map((c) => [c])} sig={4} cls="is-result" />
          </div>
          <Rich className="vision-explain" text="Where P is relative to the camera, in metres. $R$ and $t = -RC$ describe where the camera is and how it is turned: **extrinsic**." />
        </div>
        <div className="vision-box vision-stage">
          <h4>2 · Perspective division</h4>
          <Rich text="$$x = \frac{X_c}{Z_c}, \qquad y = \frac{Y_c}{Z_c}$$" />
          {front ? (
            <div className="vision-matrow">
              <span className="mono">
                x = {fmt(Xc[0], 4)} / {fmt(Xc[2], 4)} = <b>{fmt(x, 4)}</b>
              </span>
              <span className="mono">
                y = {fmt(Xc[1], 4)} / {fmt(Xc[2], 4)} = <b>{fmt(y, 4)}</b>
              </span>
            </div>
          ) : (
            <p className="vision-explain">
              <b>Z_c ≤ 0</b>: P is behind the camera, so it is not imaged.
            </p>
          )}
          <Rich className="vision-explain" text={`Dividing by the depth $Z_c$ = ${fmt(Xc[2], 3)} m is where the distance is lost: every point on the ray through P has the same $(x, y)$.`} />
        </div>
        <div className="vision-box vision-stage">
          <h4>3 · Intrinsics: to pixels</h4>
          <Rich text="$$\begin{bmatrix} u \\ v \\ 1 \end{bmatrix} = K \begin{bmatrix} x \\ y \\ 1 \end{bmatrix}$$" />
          <div className="vision-matrow">
            <MatBox rows={K.map((r) => r.slice())} sig={4} />
            <MatBox rows={front ? [[x], [y], [1]] : [['—'], ['—'], [1]]} sig={4} />
            <span>=</span>
            <MatBox rows={front ? [[u], [v], [1]] : [['—'], ['—'], [1]]} sig={4} cls="is-result" />
          </div>
          <p className="vision-explain">
            {front ? (inImg ? `Pixel (${fmt(u, 4)}, ${fmt(v, 4)}): inside the image.` : `Pixel (${fmt(u, 4)}, ${fmt(v, 4)}): outside the 640 × 480 sensor, so it is not seen.`) : 'No pixel.'}
          </p>
        </div>
      </div>

      <div className="vision-controls">
        <div className="vision-box">
          <h4>World point P</h4>
          {sl('x', 'X_w', 'World x of P', s.P[0], -4, 4, 0.01, 'm', (val) => setP(0, val))}
          {sl('y', 'Y_w', 'World y of P', s.P[1], -4, 4, 0.01, 'm', (val) => setP(1, val))}
          {sl('height', 'Z_w', 'Height of P above the ground', s.P[2], 0, 3, 0.01, 'm', (val) => setP(2, val))}
          <div className="vision-row">
            <Button size="sm" onClick={() => api.current.slide()}>
              Slide P along its ray
            </Button>
          </div>
        </div>
        <div className="vision-box">
          <h4>Camera: extrinsics and K</h4>
          {sl('x', 'C_x', 'Camera centre, world x', s.C[0], -6, 6, 0.01, 'm', (val) => setC(0, val))}
          {sl('y', 'C_y', 'Camera centre, world y', s.C[1], -6, 6, 0.01, 'm', (val) => setC(1, val))}
          {sl('height', 'C_z', 'Camera height', s.C[2], 0.2, 5, 0.01, 'm', (val) => setC(2, val))}
          {sl('yaw', '\\psi', 'Pan about the vertical', s.yaw, -180, 180, 0.5, '°', (val) => setS((q) => ({ ...q, yaw: val })))}
          {sl('pitch', '\\phi', 'Tilt (up +)', s.pitch, -80, 80, 0.5, '°', (val) => setS((q) => ({ ...q, pitch: val })))}
          {sl('focal length', '\\alpha', 'Focal length in pixels (intrinsic); principal point fixed at the centre', s.ax, 150, 1600, 1, 'px', (val) => setS((q) => ({ ...q, ax: val })))}
          <div className="vision-row">
            <Button size="sm" onClick={aimP}>
              Aim at P
            </Button>
            <Button size="sm" onClick={() => setS(START)}>
              Reset
            </Button>
          </div>
        </div>
        <div className="vision-box">
          <h4>Perspective effects</h4>
          <Toggle checked={s.fx.vp} onChange={(on) => setFx('vp', on)} label="Parallel rails → vanishing point" />
          <Toggle checked={s.fx.angles} onChange={(on) => setFx('angles', on)} label="A square on the ground: angles" />
          <Toggle checked={s.fx.size} onChange={(on) => setFx('size', on)} label="Two 1 m posts: near and far" />
          <Toggle checked={s.fx.ambig} onChange={(on) => setFx('ambig', on)} label="Scale ambiguity: small near cube, big far cube" />
          {s.fx.ambig && sl('big cube scale', 'k', 'The big cube is the small one scaled by k about the camera centre: k times bigger, k times farther', s.k, 1, 3, 0.01, '×', (val) => setS((q) => ({ ...q, k: val })))}
          <Rich
            className="vision-explain"
            text="Perspective keeps straight lines straight (and conics conics) but not lengths, angles or parallelism. Move the camera with the cubes switched on: from any other viewpoint they come apart, which is how stereo and motion recover depth."
          />
        </div>
      </div>

      <PredictBlock api={api} />
    </div>
  );
}

const PredictBlock = memo(function PredictBlock({ api }: { api: MutableRefObject<Api> }) {
  return (
    <div className="vision-predicts">
      <PredictReveal
        id="vision-pipe-vp"
        question="Two rails are parallel on the ground and run away from the camera. In the image they…"
        options={['meet at a vanishing point', 'stay parallel, the same distance apart', 'diverge as they recede', 'bend into curves']}
        answer={0}
        explain="Points far along a rail have large $Z_c$, so the perspective division squeezes them towards one image point: the vanishing point $K R d$ of the rails' direction $d$, shared by **every** line with that direction. Lines stay straight; parallelism, lengths and angles are not preserved (2024 Q13). The rails' spacing in pixels shrinks as $1/Z_c$, like everything else."
        tryIt="press Show me: the rails appear and the camera turns to look along them."
        onApply={() => api.current.vp()}
      />
      <PredictReveal
        id="vision-pipe-ambig"
        question="A cube $k$ = 3 times bigger sits 3 times farther away, along the same rays from the camera. In the image it looks…"
        options={['exactly like the small cube', 'one third the size of the small cube', 'three times bigger than the small cube', 'one ninth the size of the small cube']}
        answer={0}
        explain="Every corner is $k$ times farther along its own ray, so $X_c$, $Y_c$ and $Z_c$ all scale by $k$ and $X_c/Z_c$, $Y_c/Z_c$ do not change: identical pixels. One image cannot tell a big far object from a small near one (scale ambiguity), so absolute size and depth need extra information: a known size, stereo, motion or a range sensor (2025 Q13)."
        tryIt="press Show me: the big cube grows and recedes from k = 1 to 3; its outline never leaves the small one's."
        onApply={() => api.current.ambig()}
      />
      <PredictReveal
        id="vision-pipe-slide"
        question="Slide P halfway along its ray towards the camera. Which stages' numbers change?"
        options={['Only stage 1 ($X_c$); $(x, y)$ and $(u, v)$ stay the same', 'All three stages', 'Only stage 3 (the pixel)', 'Stages 2 and 3, but not stage 1']}
        answer={0}
        explain="Moving along the ray scales $X_c = (X_c, Y_c, Z_c)$ by the same factor, so the ratios $X_c/Z_c$ and $Y_c/Z_c$ are unchanged, and so is the pixel. The perspective division throws the depth away; that is why a single image measures bearings but not range."
        tryIt="press Show me: P slides towards the camera; watch the three cards."
        onApply={() => api.current.slide()}
      />
    </div>
  );
});
