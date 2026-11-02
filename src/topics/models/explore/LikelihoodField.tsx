// Scan-based (likelihood field) vs beam vs landmark sensor models (summary notes §3 "Sensor models"; review
// deck learning outcome "describe the properties of beam-based, scan-based and landmark-based measurement models
// and analyse their differences"; Thrun et al. §6.4 and §6.6). A two-room map with its distance transform as a
// heat map, the true robot's lidar scan, and a draggable hypothesised pose whose scan end points are scored by
// their distance to the nearest obstacle. The beam model ray-casts every beam for comparison (scores, a slice
// through the pose, a per-beam inspector), and a landmark mode shows range-bearing features and data association.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { wrapAngle, type Pose } from '../../../core/motion';
import { endPoint, predictRB, rayCast } from '../../../core/models_field';
import { mixture, normPdf } from '../../../core/models_beam';
import { mixRgb, rgbOf, useThemeColors } from '../../../ui/theme';
import { Button, Callout, More, Readout, Readouts, Segmented, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { svgPoint } from '../../../ui/diagrams';
import { Line, Plot, VLine } from '../../../plot/Plot';
import { completeChallenge, useProgress } from '../../../app/store';
import { RobotGlyph, Key, useStageCanvas, type Frame } from './modelsDraw';
import { DEG, fx, g } from './modelsFmt';
import {
  LANDMARKS,
  MAP_H,
  MAP_W,
  PERSON,
  RES,
  TRUE_POSE,
  Z_MAX,
  fieldPoseGrid,
  halfTurn,
  landmarkLog,
  landmarkPoseGrid,
  landmarkReadings,
  mapAndField,
  scoreParams,
  scoresAt,
  simulateScan,
  slice,
} from './fieldWorld';

const CHALLENGE = 'models-lf-find';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'likelihood-field',
  title: 'Scan models: likelihood field, beam and landmarks',
  summary:
    'Drag a hypothesised pose over a mapped room and watch the lidar scan’s end points land on the distance-to-nearest-obstacle heat map: the likelihood field scores each end point by how close it falls to an obstacle. Compare with the beam model (a ray cast per beam) on a slice through the pose and beam by beam, add a person who is not in the map, then switch to landmarks, where identical features need data association.',
  notice:
    'The likelihood field only asks “is each end point near some obstacle?”: one lookup per beam, smooth as the pose moves, but blind to what the ray passed through. The beam model ray-casts every beam: it knows about walls in the way, but its score jumps.',
  challenge: { id: CHALLENGE, title: 'Hide the true pose and find the robot to within 0.25 m and 0.15 rad using the score alone' },
  minutes: 10,
};

// ------------------------------------------------------------------ frame: the whole SVG is the 12 × 8 m map

const W = 690;
const H = 460;
const K = W / MAP_W;
const F: Frame = {
  W,
  H,
  k: K,
  sx: (x) => x * K,
  sy: (y) => H - y * K,
  toWorld: (px, py) => ({ x: px / K, y: (H - py) / K }),
  vis: { x0: 0, y0: 0, w: MAP_W, h: MAP_H },
};

type Mode = 'scan' | 'landmark';
type Heat = 'field' | 'pose';
type Axis = 'x' | 'y' | 'theta';

const LM_COLOR = ['var(--m1)', 'var(--m2)', 'var(--m3)', 'var(--m4)'];

function randomFreePose(seed: number): Pose {
  const { map, dt } = mapAndField();
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  for (let k = 0; k < 400; k++) {
    const x = 0.6 + rnd() * (MAP_W - 1.2);
    const y = 0.6 + rnd() * (MAP_H - 1.2);
    const i = Math.floor(x / RES);
    const j = Math.floor(y / RES);
    if (dt[j * map.w + i] >= 0.45) return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), theta: Number(wrapAngle(rnd() * 2 * Math.PI).toFixed(2)) };
  }
  return TRUE_POSE;
}

/** Index of the beam pointing along the heading (angle 0) for n beams over 360°. */
const forwardBeam = (n: number) => Math.round(n / 2);

// ------------------------------------------------------------------ component

export default function LikelihoodField() {
  const [mode, setMode] = useState<Mode>('scan');
  const [heat, setHeat] = useState<Heat>('field');
  const [truth, setTruth] = useState<Pose>(TRUE_POSE);
  const [hyp, setHyp] = useState<Pose>({ x: TRUE_POSE.x + 0.6, y: TRUE_POSE.y - 0.55, theta: 0.15 });
  const [sigma, setSigma] = useState(0.1);
  const [nBeams, setNBeams] = useState(60);
  const [noise, setNoise] = useState(0.02);
  const [person, setPerson] = useState(false);
  const [rays, setRays] = useState(true);
  const [through, setThrough] = useState(true);
  const [hideTruth, setHideTruth] = useState(false);
  const [identical, setIdentical] = useState(false);
  const [axis, setAxis] = useState<Axis>('x');
  const [selBeam, setSelBeam] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const challengeDone = !!useProgress().challenges[CHALLENGE];
  const col = useThemeColors(['--surface', '--text', '--m1', '--m4', '--text-3']);

  const { map, dt } = mapAndField();
  const sp = useMemo(() => scoreParams(sigma), [sigma]);
  const scan = useMemo(() => simulateScan(truth, nBeams, noise, person), [truth, nBeams, noise, person]);
  const zs = useMemo(() => landmarkReadings(truth, identical), [truth, identical]);

  // Scores at the hypothesis and at the truth.
  const sc = useMemo(() => scoresAt(hyp, scan, sp), [hyp, scan, sp]);
  const scTrue = useMemo(() => scoresAt(truth, scan, sp), [truth, scan, sp]);
  const lmH = useMemo(() => landmarkLog(hyp, zs, identical), [hyp, zs, identical]);
  const lmT = useMemo(() => landmarkLog(truth, zs, identical), [truth, zs, identical]);
  const nRet = scan.ranges.filter((z) => z < Z_MAX - 1e-9).length;

  // Heavy work follows deferred copies, so dragging stays smooth.
  const dHyp = useDeferredValue(hyp);
  const dAxis = useDeferredValue(axis);
  const sl = useMemo(() => (mode === 'scan' ? slice(dHyp, dAxis, scan, sp) : null), [mode, dHyp, dAxis, scan, sp]);
  const dTheta = useDeferredValue(hyp.theta);
  const poseGrid = useMemo(() => {
    if (heat !== 'pose') return null;
    return mode === 'scan' ? fieldPoseGrid(dTheta, scan, sp) : landmarkPoseGrid(dTheta, zs, identical);
  }, [heat, mode, dTheta, scan, sp, zs, identical]);

  // ---------------------------------------------------------------- the heat map (ImageData, drawn scaled)
  const fieldImage = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = map.w;
    c.height = map.h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(map.w, map.h);
    const bg = rgbOf(col['--surface']);
    const ink = rgbOf(col['--text']);
    const hot = rgbOf(col['--m1']);
    const q0 = sp.field.zHit * normPdf(0, 0, sigma) + sp.field.zRand / Z_MAX;
    for (let j = 0; j < map.h; j++)
      for (let i = 0; i < map.w; i++) {
        const k = j * map.w + i;
        const o = ((map.h - 1 - j) * map.w + i) * 4;
        let c3: [number, number, number];
        if (map.occ[k]) c3 = ink;
        else if (mode === 'landmark') c3 = bg;
        else {
          const d = dt[k];
          const q = (sp.field.zHit * normPdf(d, 0, sigma) + sp.field.zRand / Z_MAX) / q0;
          c3 = mixRgb(bg, hot, Math.pow(q, 0.6) * 0.85);
        }
        img.data[o] = c3[0];
        img.data[o + 1] = c3[1];
        img.data[o + 2] = c3[2];
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [map, dt, sigma, sp, col, mode]);

  const poseImage = useMemo(() => {
    if (!poseGrid || typeof document === 'undefined') return null;
    const { nx, ny, v } = poseGrid;
    const c = document.createElement('canvas');
    c.width = nx;
    c.height = ny;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(nx, ny);
    let vmax = -Infinity;
    for (const x of v) if (Number.isFinite(x)) vmax = Math.max(vmax, x);
    const bg = rgbOf(col['--surface']);
    const ink = rgbOf(col['--text']);
    const hot = rgbOf(col['--m4']);
    const per = mode === 'scan' ? Math.max(1, nRet) : LANDMARKS.length;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const val = v[j * nx + i];
        const o = ((ny - 1 - j) * nx + i) * 4;
        const t = Number.isFinite(val) ? Math.exp((val - vmax) / per / (mode === 'scan' ? 0.35 : 2.5)) : -1;
        const c3 = t < 0 ? ink : mixRgb(bg, hot, Math.min(1, t) * 0.9);
        img.data[o] = c3[0];
        img.data[o + 1] = c3[1];
        img.data[o + 2] = c3[2];
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [poseGrid, col, mode, nRet]);

  const canvasRef = useStageCanvas(
    W,
    H,
    (ctx) => {
      const img = heat === 'pose' && poseImage ? poseImage : fieldImage;
      if (!img) return;
      ctx.imageSmoothingEnabled = heat === 'pose';
      ctx.drawImage(img, 0, 0, W, H);
      if (heat === 'pose' && fieldImage) {
        // keep the walls crisp on top of the coarse score map
        ctx.globalAlpha = 1;
      }
    },
    [heat, poseImage, fieldImage]
  );

  // ---------------------------------------------------------------- dragging the hypothesis
  const drag = useRef<'move' | 'turn' | null>(null);
  const onDown = (m: 'move' | 'turn') => (e: RPointerEvent<SVGGElement>) => {
    drag.current = m;
    (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: RPointerEvent<SVGGElement>) => {
    if (!drag.current || !svgRef.current) return;
    const pt = svgPoint(svgRef.current, e.clientX, e.clientY);
    const w = F.toWorld(pt.x, pt.y);
    if (drag.current === 'move') setHyp((h) => ({ ...h, x: Math.max(0.15, Math.min(MAP_W - 0.15, Math.round(w.x / 0.025) * 0.025)), y: Math.max(0.15, Math.min(MAP_H - 0.15, Math.round(w.y / 0.025) * 0.025)) }));
    else setHyp((h) => ({ ...h, theta: Math.round(Math.atan2(w.y - h.y, w.x - h.x) / 0.01) * 0.01 }));
  };
  const onUp = (e: RPointerEvent<SVGGElement>) => {
    drag.current = null;
    (e.currentTarget as SVGGElement).releasePointerCapture(e.pointerId);
  };
  const onKeyMove = (e: RKeyboardEvent<SVGGElement>) => {
    const d = e.shiftKey ? 0.25 : 0.025;
    const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const mv = m[e.key];
    if (!mv) return;
    e.preventDefault();
    setHyp((h) => ({ ...h, x: Number((h.x + mv[0]).toFixed(3)), y: Number((h.y + mv[1]).toFixed(3)) }));
  };
  const onKeyTurn = (e: RKeyboardEvent<SVGGElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const s = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 1 : -1;
    setHyp((h) => ({ ...h, theta: Number(wrapAngle(h.theta + s * (e.shiftKey ? 0.2 : 0.02)).toFixed(3)) }));
  };

  // ---------------------------------------------------------------- the challenge: find the hidden robot
  const posErr = Math.hypot(hyp.x - truth.x, hyp.y - truth.y);
  const angErr = Math.abs(wrapAngle(hyp.theta - truth.theta));
  const found = hideTruth && posErr <= 0.25 && angErr <= 0.15;
  useEffect(() => {
    if (found && !challengeDone) completeChallenge(CHALLENGE);
  }, [found, challengeDone]);

  // ---------------------------------------------------------------- overlay
  const zStars = sc.beam.zStar;
  const overlay: ReactNode[] = [];
  if (mode === 'scan') {
    scan.angles.forEach((a, k) => {
      const z = scan.ranges[k];
      const max = z >= Z_MAX - 1e-9;
      const b = sc.field.beams[k];
      const hx = F.sx(hyp.x);
      const hy = F.sy(hyp.y);
      const e = endPoint(hyp, a, max ? Z_MAX : z);
      const ex = F.sx(e.x);
      const ey = F.sy(e.y);
      const sel = selBeam === k;
      if (rays || sel) overlay.push(<line key={`ray${k}`} x1={hx} y1={hy} x2={ex} y2={ey} stroke={sel ? 'var(--text)' : 'var(--text-3)'} strokeWidth={sel ? 2 : 0.8} opacity={sel ? 1 : max ? 0.18 : 0.4} strokeDasharray={max ? '3 4' : undefined} />);
      if (!max && through && zStars[k] < z - 3 * sigma) {
        const s = endPoint(hyp, a, zStars[k]);
        overlay.push(<line key={`th${k}`} x1={F.sx(s.x)} y1={F.sy(s.y)} x2={ex} y2={ey} stroke="var(--bad)" strokeWidth={sel ? 3 : 1.8} strokeDasharray="4 3" opacity={0.85} />);
      }
      if (max) return;
      const c = b.dist <= sigma ? 'var(--m3)' : b.dist <= 3 * sigma ? 'var(--m2)' : 'var(--bad)';
      overlay.push(
        <g key={`ep${k}`} style={{ cursor: 'pointer' }} onClick={() => setSelBeam(sel ? null : k)}>
          <circle cx={ex} cy={ey} r={9} fill="transparent" />
          <circle cx={ex} cy={ey} r={sel ? 5 : 3.4} fill={c} stroke={sel ? 'var(--text)' : 'var(--surface)'} strokeWidth={sel ? 2 : 0.8} />
        </g>
      );
    });
    if (selBeam !== null && selBeam < scan.angles.length) {
      const k = selBeam;
      const z = scan.ranges[k];
      const b = sc.field.beams[k];
      if (z < Z_MAX - 1e-9) {
        const e = endPoint(hyp, scan.angles[k], z);
        overlay.push(<circle key="dcirc" cx={F.sx(e.x)} cy={F.sy(e.y)} r={Math.max(2, b.dist * K)} fill="none" stroke="var(--m2)" strokeWidth={1.6} strokeDasharray="4 3" pointerEvents="none" />);
        overlay.push(
          <text key="dtxt" className="models-note is-strong" x={F.sx(e.x) + Math.max(2, b.dist * K) + 4} y={F.sy(e.y) - 4} fill="var(--m2)" pointerEvents="none">
            d = {fx(b.dist, 2)} m
          </text>
        );
      }
      const s = endPoint(hyp, scan.angles[k], zStars[k]);
      overlay.push(
        <g key="zstar" pointerEvents="none">
          <rect x={F.sx(s.x) - 5} y={F.sy(s.y) - 5} width={10} height={10} fill="var(--m1)" stroke="var(--surface)" strokeWidth={1.2} transform={`rotate(45 ${F.sx(s.x)} ${F.sy(s.y)})`} />
          <text className="models-note is-strong" x={F.sx(s.x) + 8} y={F.sy(s.y) + 15} fill="var(--m1)">
            z* = {fx(zStars[k], 2)} m
          </text>
        </g>
      );
    }
    if (person)
      overlay.push(
        <g key="person" pointerEvents="none">
          <circle cx={F.sx(PERSON.x)} cy={F.sy(PERSON.y)} r={PERSON.r * K} fill="none" stroke="var(--m2)" strokeWidth={2} strokeDasharray="3 2" />
          <text className="models-note" x={F.sx(PERSON.x)} y={F.sy(PERSON.y) - PERSON.r * K - 5} textAnchor="middle" fill="var(--m2)">
            person (not in the map)
          </text>
        </g>
      );
  } else {
    LANDMARKS.forEach((l, i) => {
      const x = F.sx(l.x);
      const y = F.sy(l.y);
      const c = identical ? 'var(--text-2)' : LM_COLOR[i];
      overlay.push(
        <g key={`lm${i}`} pointerEvents="none">
          <path d={`M${x} ${y - 10}L${x + 10} ${y}L${x} ${y + 10}L${x - 10} ${y}Z`} fill={c} stroke="var(--surface)" strokeWidth={1.5} />
          {!identical && (
            <text className="models-note is-strong" x={x + 13} y={y + 4} fill={c}>
              {l.label}
            </text>
          )}
        </g>
      );
    });
    zs.forEach((z, i) => {
      const a = hyp.theta + z.phi;
      const ex = hyp.x + z.r * Math.cos(a);
      const ey = hyp.y + z.r * Math.sin(a);
      const j = lmH.chosen[i];
      const l = LANDMARKS[j];
      const res = Math.hypot(ex - l.x, ey - l.y);
      const c = identical ? 'var(--text-2)' : LM_COLOR[i];
      overlay.push(
        <g key={`m${i}`} pointerEvents="none">
          <line x1={F.sx(hyp.x)} y1={F.sy(hyp.y)} x2={F.sx(ex)} y2={F.sy(ey)} stroke={c} strokeWidth={1.4} strokeDasharray="6 4" opacity={0.85} />
          <path d={`M${F.sx(ex) - 6} ${F.sy(ey) - 6}L${F.sx(ex) + 6} ${F.sy(ey) + 6}M${F.sx(ex) - 6} ${F.sy(ey) + 6}L${F.sx(ex) + 6} ${F.sy(ey) - 6}`} stroke={c} strokeWidth={2.4} />
          <line x1={F.sx(ex)} y1={F.sy(ey)} x2={F.sx(l.x)} y2={F.sy(l.y)} stroke={res < 0.3 ? 'var(--m3)' : 'var(--bad)'} strokeWidth={2.2} />
          {identical && (
            <text className="models-note" x={F.sx(ex) + 8} y={F.sy(ey) - 6}>
              → {l.label}
            </text>
          )}
        </g>
      );
    });
    if (identical)
      LANDMARKS.forEach((l, i) =>
        overlay.push(
          <text key={`lml${i}`} className="models-note is-strong" x={F.sx(l.x) + 13} y={F.sy(l.y) + 4} pointerEvents="none">
            {l.label}
          </text>
        )
      );
  }

  // ---------------------------------------------------------------- numbers
  const perBeamRatio = (h: number, t: number, n: number) => Math.exp((h - t) / Math.max(1, n));
  const fieldRatio = perBeamRatio(sc.field.logq, scTrue.field.logq, nRet);
  const beamRatio = perBeamRatio(sc.beam.logq, scTrue.beam.logq, scan.angles.length);
  const lmRatio = perBeamRatio(lmH.logq, lmT.logq, LANDMARKS.length);
  const farPts = sc.field.beams.filter((b) => !b.skipped && b.dist > 3 * sigma).length;
  const thru = scan.ranges.filter((z, k) => z < Z_MAX - 1e-9 && zStars[k] < z - 3 * sigma).length;

  const mapPanel = (
    <div className="models-panel">
      <div className="models-head">
        <h4 style={{ margin: 0 }}>{mode === 'scan' ? 'Map, distance field and the scan from the hypothesis' : 'Landmarks and range-bearing readings from the hypothesis'}</h4>
        <Segmented
          size="sm"
          label="Background"
          value={heat}
          onChange={setHeat}
          options={[
            { value: 'field', label: mode === 'scan' ? 'Likelihood field' : 'Map', title: 'z_hit N(d; 0, σ²) + z_rand/z_max at every point: bright = near an obstacle' },
            { value: 'pose', label: 'Score at every position', title: 'ln q of the whole scan if the robot stood at each position with the current heading' },
          ]}
        />
      </div>
      <div className="models-stage">
        <canvas ref={canvasRef} className="models-stage-under" aria-hidden="true" />
        <svg
          ref={svgRef}
          className="models-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Map 12 by 8 m. Hypothesis at (${fx(hyp.x, 2)}, ${fx(hyp.y, 2)}) heading ${fx(hyp.theta, 2)} rad. ${mode === 'scan' ? `Likelihood field ln q ${fx(sc.field.logq, 1)}, beam model ln q ${fx(sc.beam.logq, 1)}.` : `Landmark ln q ${fx(lmH.logq, 1)}.`}`}
        >
          {overlay}
          {!hideTruth && <RobotGlyph pose={truth} f={F} r={0.2} color="var(--text-2)" fill="transparent" dashed label="true pose" labelBelow minPx={10} />}
          <g className="models-drag" tabIndex={0} role="slider" aria-label={`Hypothesised position (${fx(hyp.x, 2)}, ${fx(hyp.y, 2)}) m. Arrow keys move it.`} aria-valuenow={hyp.x} onPointerDown={onDown('move')} onPointerMove={onMove} onPointerUp={onUp} onKeyDown={onKeyMove}>
            <circle cx={F.sx(hyp.x)} cy={F.sy(hyp.y)} r={20} fill="transparent" className="models-focus-ring" />
            <RobotGlyph pose={hyp} f={F} r={0.2} color="var(--accent)" fill="var(--accent-soft)" label="hypothesis" minPx={11} />
          </g>
          <g className="models-drag" tabIndex={0} role="slider" aria-label={`Hypothesised heading ${fx(hyp.theta, 2)} rad. Arrow keys turn it.`} aria-valuenow={hyp.theta} onPointerDown={onDown('turn')} onPointerMove={onMove} onPointerUp={onUp} onKeyDown={onKeyTurn}>
            {(() => {
              const kx = F.sx(hyp.x) + 42 * Math.cos(hyp.theta);
              const ky = F.sy(hyp.y) - 42 * Math.sin(hyp.theta);
              return (
                <>
                  <line x1={F.sx(hyp.x)} y1={F.sy(hyp.y)} x2={kx} y2={ky} stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="3 3" pointerEvents="none" />
                  <circle cx={kx} cy={ky} r={13} fill="transparent" className="models-focus-ring" />
                  <circle cx={kx} cy={ky} r={6} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.5} />
                </>
              );
            })()}
          </g>
        </svg>
      </div>
      <Key
        items={
          mode === 'scan'
            ? [
                { label: 'end point near an obstacle (d ≤ σ)', color: 'var(--m3)', kind: 'dot' },
                { label: 'within 3σ', color: 'var(--m2)', kind: 'dot' },
                { label: 'far from every obstacle', color: 'var(--bad)', kind: 'dot' },
                ...(through ? [{ label: 'ray passes through a mapped obstacle', color: 'var(--bad)', kind: 'dash' as const }] : []),
                { label: 'true pose', color: 'var(--text-2)', kind: 'dash' },
              ]
            : [
                { label: 'measured range and bearing (×)', color: 'var(--text-2)', kind: 'dash' },
                { label: 'association fits', color: 'var(--m3)' },
                { label: 'association misfits', color: 'var(--bad)' },
              ]
        }
      />
      {mode === 'scan' && sl && (
        <div>
          <div className="models-head">
            <span className="models-label">nudge the hypothesis along</span>
            <Segmented
              size="sm"
              label="Slice axis"
              value={axis}
              onChange={setAxis}
              options={[
                { value: 'x', label: 'x' },
                { value: 'y', label: 'y' },
                { value: 'theta', label: 'θ' },
              ]}
            />
          </div>
          <SlicePlot sl={sl} axis={dAxis} hyp={dHyp} truth={hideTruth ? null : truth} />
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------- right column
  const scorePanel = (
    <section className="models-panel">
      <h4>Score of the hypothesis</h4>
      {mode === 'scan' ? (
        <>
          <ScoreRow label="Likelihood field" color="var(--m1)" lnq={sc.field.logq} lnqTrue={hideTruth ? null : scTrue.field.logq} ratio={fieldRatio} />
          <ScoreRow label="Beam model" color="var(--m2)" lnq={sc.beam.logq} lnqTrue={hideTruth ? null : scTrue.beam.logq} ratio={beamRatio} />
          <Rich
            className="note"
            text={`${nRet} of ${scan.angles.length} beams returned (the rest read $z_{max}$, which the likelihood field skips). End points far from every obstacle: **${farPts}**. Rays that pass through a mapped obstacle: **${thru}**${thru ? ' (the likelihood field does not notice them; the beam model does)' : ''}.`}
          />
        </>
      ) : (
        <>
          <ScoreRow label="Landmark model" color="var(--m4)" lnq={lmH.logq} lnqTrue={hideTruth ? null : lmT.logq} ratio={lmRatio} />
          <Rich
            className="note"
            text={`Each reading is a range and a bearing, $(r, \\phi)$, to one landmark: $\\hat r = \\sqrt{(m_x - x)^2 + (m_y - y)^2}$, $\\hat\\phi = \\operatorname{atan2}(m_y - y, m_x - x) - \\theta$, scored with Gaussians ($\\sigma_r$ = 0.08 m, $\\sigma_\\phi$ = 0.04 rad). ${identical ? 'The posts look identical, so each reading is matched to the landmark that fits it best (maximum-likelihood data association).' : 'Each landmark has its own colour, so every reading knows which landmark it came from (known correspondence).'}`}
          />
        </>
      )}
      {hideTruth && (
        <Callout kind={found ? 'ok' : 'note'} title={found ? 'Found it' : 'Find the robot'}>
          <Rich
            text={
              found
                ? `Within ${fx(posErr, 2)} m and ${fx(angErr, 2)} rad of the hidden pose, using only how well the scan fits. That is localisation by maximising $p(z \\mid x, m)$.`
                : 'The true pose is hidden. Move and turn the hypothesis until the score is as high as you can make it (the “score at every position” background helps). Get within 0.25 m and 0.15 rad.'
            }
          />
        </Callout>
      )}
    </section>
  );

  const inspector =
    mode === 'scan' ? (
      <section className="models-panel">
        <h4>Inspect one beam</h4>
        {selBeam === null || selBeam >= scan.angles.length ? (
          <p className="small muted" style={{ margin: 0 }}>
            Click an end point on the map to compare how the two models score that beam.
          </p>
        ) : (
          <BeamInspect k={selBeam} hyp={hyp} scanZ={scan.ranges[selBeam]} angle={scan.angles[selBeam]} sigma={sigma} sp={sp} />
        )}
      </section>
    ) : (
      <section className="models-panel">
        <h4>Readings and associations</h4>
        <div className="models-table-wrap">
          <table className="models-table">
            <thead>
              <tr>
                <th className="models-txt">reading</th>
                <th>r (m)</th>
                <th>φ (rad)</th>
                <th className="models-txt">matched to</th>
                <th>r̂ from hyp.</th>
                <th>φ̂ from hyp.</th>
              </tr>
            </thead>
            <tbody>
              {zs.map((z, i) => {
                const j = lmH.chosen[i];
                const p = predictRB(hyp, LANDMARKS[j]);
                return (
                  <tr key={i}>
                    <td className="models-txt">{i + 1}</td>
                    <td>{fx(z.r, 2)}</td>
                    <td>{fx(z.phi, 3)}</td>
                    <td className="models-txt">
                      {LANDMARKS[j].label}
                      {identical && j !== i ? <span className="models-bad"> (really {LANDMARKS[i].label})</span> : null}
                    </td>
                    <td>{fx(p.r, 2)}</td>
                    <td>{fx(p.phi, 3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );

  const controls = (
    <section className="models-panel">
      <h4>Settings</h4>
      {mode === 'scan' ? (
        <>
          <div className="models-sliders">
            <Slider label="field width" tex="\sigma_{hit}" tip="How far (m) an end point may land from an obstacle and still count as a good fit; also the beam model's hit spread" value={sigma} min={0.04} max={0.5} step={0.01} unit="m" onChange={setSigma} />
            <Slider label="range noise" tip="Standard deviation of the simulated lidar's range noise (m)" value={noise} min={0} max={0.15} step={0.005} unit="m" onChange={setNoise} />
          </div>
          <div className="models-bar">
            <span className="models-label">beams</span>
            <Segmented size="sm" label="Number of beams" value={nBeams} onChange={(n) => (setNBeams(n), setSelBeam(null))} options={[24, 60, 120].map((n) => ({ value: n, label: `${n}` }))} />
          </div>
          <div className="models-bar">
            <Toggle checked={person} onChange={setPerson} label="A person (not in the map)" />
            <Toggle checked={rays} onChange={setRays} label="Rays" />
            <Toggle checked={through} onChange={setThrough} label="Mark rays through walls" />
          </div>
        </>
      ) : (
        <div className="models-bar">
          <Toggle checked={identical} onChange={setIdentical} label="Landmarks look identical (unknown correspondence)" />
        </div>
      )}
      <div className="models-bar">
        <Toggle checked={hideTruth} onChange={setHideTruth} label="Hide the true pose" />
        <Button
          size="sm"
          onClick={() => {
            setTruth(randomFreePose(Math.floor(Math.random() * 1e6)));
            setHideTruth(true);
            setSelBeam(null);
          }}
        >
          New hidden pose
        </Button>
        <Button size="sm" variant="ghost" onClick={() => (setTruth(TRUE_POSE), setHideTruth(false))}>
          Reset the robot
        </Button>
      </div>
    </section>
  );

  const fwd = forwardBeam(60);
  const predictions = (
    <section className="models-panel">
      <h4>Predict, then check</h4>
      <PredictReveal
        id="models-lf-smooth"
        question="Nudge the hypothesis along $x$ through the true pose. Which model’s score changes in **jumps** rather than smoothly?"
        options={['The beam model’s', 'The likelihood field’s', 'Neither: both are smooth', 'Both, equally']}
        answer={0}
        explain="Each beam’s expected range $z^*$ comes from a ray cast. When a ray slides past a corner or the edge of the table, $z^*$ jumps by metres and so does that beam’s term. The likelihood field looks up the distance at the end point, which changes continuously as the pose moves: a smoother score that a filter or optimiser can climb, and one table lookup per beam instead of a ray cast."
        tryIt="watch the slice plot below the map with the x axis selected."
        onApply={() => {
          setMode('scan');
          setTruth(TRUE_POSE);
          setHideTruth(false);
          setHyp({ ...TRUE_POSE, x: TRUE_POSE.x + 0.2 });
          setAxis('x');
          setNBeams(60);
          setSelBeam(null);
        }}
      />
      <PredictReveal
        id="models-lf-through"
        question="From this hypothesis the 0° beam passes **through the thin wall** and ends on the box behind it. How do the two models score that beam?"
        options={[
          'Likelihood field: well (its end point is on an obstacle). Beam model: badly (the wall should have stopped it)',
          'Both well: the end point is on an obstacle',
          'Both badly: the ray crosses a wall',
          'Likelihood field badly, beam model well',
        ]}
        answer={0}
        explain="The likelihood field only looks at the end point’s distance to the nearest obstacle, which here is a few centimetres: a good factor. It never asks what the ray passed through (summary notes §3). The beam model ray-casts from the hypothesis, finds the wall at $z^* \approx 0.5$ m, and a reading 2.6 m beyond it can only be explained by the random part: a tiny factor."
        tryIt="the inspector compares the two factors for the selected beam."
        onApply={() => {
          setMode('scan');
          setTruth(TRUE_POSE);
          setHideTruth(false);
          setNBeams(60);
          setPerson(false);
          setHyp({ x: 6.5, y: 5.1, theta: 0 });
          setSelBeam(fwd);
          setThrough(true);
        }}
      />
      <PredictReveal
        id="models-lf-person"
        question="A person who is **not in the map** stands about 1 m in front of the robot. What does the likelihood field do with the beams that hit the person (at the true pose)?"
        options={['Each gets only the floor $z_{rand}/z_{max}$: a small cost, not a zero', 'It skips them, like max-range readings', 'The whole scan scores zero', 'It scores them as well as any other beam']}
        answer={0}
        explain={`Those end points are far from every mapped obstacle, so the Gaussian term is about 0 and each factor falls to $z_{rand}/z_{max}$ = ${fx(0.1 / Z_MAX, 4)}. Multiplying in a few small factors lowers the score but cannot zero it, so the true pose still wins. The beam model handles the same readings with its $p_{short}$ part.`}
        tryIt="switch the person on and inspect a red end point near the robot."
        onApply={() => {
          setMode('scan');
          setTruth(TRUE_POSE);
          setHideTruth(false);
          setNBeams(60);
          setPerson(true);
          setHyp(TRUE_POSE);
          setSelBeam(fwd);
        }}
      />
      <PredictReveal
        id="models-lf-landmarks"
        question="Four **identical** posts at the corners of a rectangle centred on the room. Turn the hypothesis half a turn about the room centre. How does its landmark score compare with the true pose’s?"
        options={['Exactly the same', 'Much lower', 'Slightly lower', 'Higher']}
        answer={0}
        explain="From the half-turned pose every post is seen at exactly the range and bearing of its opposite partner, and with identical posts the model cannot tell which is which: data association matches each reading to the wrong post and fits perfectly. Distinct landmarks (or a motion history) break the tie. This is why data association is the hard part of landmark-based localisation and SLAM (2025 Q23)."
        tryIt="switch to Landmarks, tick “identical”, and compare the half-turned hypothesis with the truth."
        onApply={() => {
          setMode('landmark');
          setTruth(TRUE_POSE);
          setHideTruth(false);
          setIdentical(true);
          setHyp(halfTurn(TRUE_POSE));
        }}
      />
    </section>
  );

  return (
    <div className="models-sim">
      <div className="models-bar" style={{ marginBottom: 10 }}>
        <Segmented
          label="Sensor model"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setSelBeam(null);
          }}
          options={[
            { value: 'scan', label: 'Range scan: likelihood field vs beam' },
            { value: 'landmark', label: 'Landmarks: range and bearing' },
          ]}
        />
      </div>
      <div className="models-layout">
        <div className="models-left">{mapPanel}</div>
        <div className="models-right">
          {scorePanel}
          {inspector}
          {controls}
          {predictions}
        </div>
      </div>
      <More label="The three models side by side">
        <Rich
          text={`$$\\begin{array}{l|l|l|l} & \\text{beam model} & \\text{likelihood field (scan-based)} & \\text{landmark model} \\\\ \\hline \\text{scores} & \\text{each range against the ray-cast } z^* & \\text{each end point's distance to the nearest obstacle} & \\text{range and bearing to known features} \\\\ \\text{per beam} & \\text{a ray cast} & \\text{one table lookup} & \\text{one Gaussian per feature} \\\\ \\text{smooth in the pose?} & \\text{no: jumps at edges} & \\text{yes} & \\text{yes} \\\\ \\text{knows what the ray passed?} & \\text{yes} & \\text{no} & \\text{n/a} \\\\ \\text{needs} & \\text{the map} & \\text{the distance transform of the map} & \\text{data association} \\end{array}$$
- Likelihood field (Thrun Table 6.3): $q = \\prod_k \\left[z_{hit}\\,\\mathcal N(d_k; 0, \\sigma_{hit}^2) + z_{rand}/z_{max}\\right]$ over the beams that returned, where $d_k$ is the distance from beam $k$'s end point to the nearest obstacle. Max-range readings are skipped.
- The heat map is that bracket at every point; the distance transform is computed once per map, so scoring a pose costs one lookup per beam.
- Compact maps of landmarks are cheap to store and score, but each reading must first be matched to a landmark (data association); a wrong match gives a confident wrong pose.`}
        />
      </More>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function ScoreRow({ label, color, lnq, lnqTrue, ratio }: { label: string; color: string; lnq: number; lnqTrue: number | null; ratio: number }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="models-head">
        <span className="small" style={{ color, fontWeight: 650 }}>
          {label}
        </span>
        <span className="models-mono small">
          ln q = {fx(lnq, 1)}
          {lnqTrue !== null ? ` (true pose ${fx(lnqTrue, 1)})` : ''}
        </span>
      </div>
      {lnqTrue !== null && (
        <>
          <div className="models-scorebar" title="Per-reading likelihood ratio of the hypothesis to the true pose">
            <span style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%`, background: color }} />
          </div>
          <div className="small muted">per-reading likelihood vs the true pose: {ratio >= 0.995 ? 'as good' : `${fx(ratio * 100, 1)} %`}</div>
        </>
      )}
    </div>
  );
}

function BeamInspect({ k, hyp, scanZ, angle, sigma, sp }: { k: number; hyp: Pose; scanZ: number; angle: number; sigma: number; sp: ReturnType<typeof scoreParams> }) {
  const { map, dt } = mapAndField();
  const max = scanZ >= Z_MAX - 1e-9;
  const e = endPoint(hyp, angle, scanZ);
  const i = Math.max(0, Math.min(map.w - 1, Math.floor(e.x / RES)));
  const j = Math.max(0, Math.min(map.h - 1, Math.floor(e.y / RES)));
  const d = dt[j * map.w + i];
  const fFactor = sp.field.zHit * normPdf(d, 0, sigma) + sp.field.zRand / Z_MAX;
  const zStar = rayCast(map, hyp.x, hyp.y, hyp.theta + angle, Z_MAX);
  const bp = mixture(scanZ, { ...sp.beam, zStar, zMax: Z_MAX });
  const through = !max && zStar < scanZ - 3 * sigma;
  const short = !max && scanZ < zStar - 3 * sigma;
  return (
    <div>
      <p className="small" style={{ margin: '0 0 6px' }}>
        Beam {k + 1} at {g(angle * DEG, 1)}° from the heading; measured <strong className="models-mono">z = {max ? 'z_max (no return)' : `${fx(scanZ, 2)} m`}</strong>.
      </p>
      <Readouts min={150}>
        <Readout label="field: end-point distance" text={max ? 'skipped' : `${fx(d, 3)} m`} tip="Distance from the end point to the nearest mapped obstacle" tone="m1" />
        <Readout label="field factor" text={max ? '1 (skipped)' : fx(fFactor, 3)} tip="z_hit N(d; 0, σ²) + z_rand/z_max" tone="m1" />
        <Readout label="beam: ray-cast z*" text={`${fx(zStar, 2)} m`} tip="Where the ray from the hypothesis first meets the map" tone="m2" />
        <Readout label="beam factor p(z | z*)" text={fx(bp, 4)} tip="The four-part mixture at the measured range" tone="m2" />
      </Readouts>
      <Rich
        className="note"
        text={
          max
            ? 'A max-range reading: the likelihood field skips it; the beam model scores it with $p_{max}$ (good only if the ray really escapes to $z_{max}$).'
            : through
              ? `The ray from the hypothesis meets the map at ${fx(zStar, 2)} m but the reading is ${fx(scanZ, 2)} m: it would have to pass **through** an obstacle. The likelihood field cannot tell (its end point is ${fx(d, 2)} m from an obstacle); the beam model can only call it a random reading.`
              : short
                ? `The reading stops ${fx(zStar - scanZ, 2)} m before the mapped obstacle: something unexpected is in the way (or the pose is wrong). The beam model explains it with $p_{short}$; the likelihood field just sees an end point ${fx(d, 2)} m from the map.`
                : `The reading agrees with the ray cast to within ${fx(Math.abs(scanZ - zStar), 2)} m, and the end point is ${fx(d, 2)} m from an obstacle: both models like this beam.`
        }
      />
    </div>
  );
}

function SlicePlot({ sl, axis, hyp, truth }: { sl: { off: number[]; field: number[]; beam: number[] }; axis: Axis; hyp: Pose; truth: Pose | null }) {
  const mf = Math.max(...sl.field);
  const mb = Math.max(...sl.beam);
  const f = sl.off.map((o, i) => [o, sl.field[i] - mf] as const);
  const b = sl.off.map((o, i) => [o, sl.beam[i] - mb] as const);
  const span = axis === 'theta' ? 0.6 : 1;
  let tOff: number | null = null;
  if (truth) {
    if (axis === 'x' && Math.abs(truth.y - hyp.y) < 0.05 && Math.abs(wrapAngle(truth.theta - hyp.theta)) < 0.05) tOff = truth.x - hyp.x;
    if (axis === 'y' && Math.abs(truth.x - hyp.x) < 0.05 && Math.abs(wrapAngle(truth.theta - hyp.theta)) < 0.05) tOff = truth.y - hyp.y;
    if (axis === 'theta' && Math.hypot(truth.x - hyp.x, truth.y - hyp.y) < 0.05) tOff = wrapAngle(truth.theta - hyp.theta);
    if (tOff !== null && Math.abs(tOff) > span) tOff = null;
  }
  return (
    <>
      <Plot
        x={{ min: -span, max: span, label: axis === 'theta' ? 'change in θ (rad)' : `change in ${axis} (m)` }}
        y={{ min: -80, max: 5, label: 'ln q − its max' }}
        height={200}
        ariaLabel="Log-likelihood of both models along a slice through the hypothesis"
      >
        <Line points={f} color="var(--m1)" width={2.2} />
        <Line points={b} color="var(--m2)" width={2.2} />
        <VLine x={0} label="hypothesis" color="var(--accent)" />
        {tOff !== null && <VLine x={tOff} label="truth" labelY="bottom" color="var(--text-2)" />}
      </Plot>
      <Key
        items={[
          { label: 'likelihood field', color: 'var(--m1)' },
          { label: 'beam model', color: 'var(--m2)' },
        ]}
      />
    </>
  );
}
