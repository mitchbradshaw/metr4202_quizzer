// PBVS vs IBVS (summary notes §7 "Visual servoing"; 2023 Q15, 2024 Q15, 2025 Q15; review deck slide 21).
//
// An eye-in-hand camera servos to a pose 0.5 m in front of a square target with four feature points. Both laws run
// on the same start (core/visionServo): position-based (estimate the pose, move on a straight 3-D line) and
// image-based (drive the feature error with the image Jacobian). Left: the camera image with every feature's
// trail. Right: an orbitable 3-D view of the two camera paths. Below: distance to the target over time.
// Playback is drawn through refs in a requestAnimationFrame loop; the trails are static and memoised.
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { SERVO_CAM, SERVO_GOAL, SERVO_PRESETS, SERVO_TARGET, simulateServo, type ServoTrace } from '../../../core/visionServo';
import { add, mv, type Mat3, type V3 } from '../../../core/vision';
import { useRaf } from '../../../anim/hooks';
import { Button, Readout, Readouts, Segmented, Select, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { fmt } from '../../../engine/format';
import { Panel, orbitProject, useOrbit, type Orbit } from './visionCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'servoing',
  title: 'Visual servoing: PBVS vs IBVS',
  summary:
    'An eye-in-hand camera homes in on a target with four feature points. Position-based servoing estimates the 3-D pose and drives it straight; image-based servoing drives the image error through the image Jacobian. Compare their image trails and 3-D paths, then add calibration error.',
  notice:
    'PBVS moves the camera on a **straight 3-D line** but needs an accurate pose estimate (calibration, camera-to-end-effector transform): add error and it stops in the wrong place. IBVS moves the **features on straight image lines** and still lands exactly with a bad calibration, but its 3-D path can be odd: it backs away when it must rotate about the optical axis.',
  minutes: 10,
};

const DT = 0.02;
const STEPS = 400;

const PRESETS = SERVO_PRESETS;

const METHODS = ['pbvs', 'ibvs'] as const;
type Method = (typeof METHODS)[number];
const MCOL: Record<Method, string> = { pbvs: 'var(--m1)', ibvs: 'var(--m2)' };
const MNAME: Record<Method, string> = { pbvs: 'PBVS', ibvs: 'IBVS' };

// ------------------------------------------------------------------ geometry helpers

const IMG_PAD = 70;
const FR_D = 0.1;
function frustumPts(C: V3, R: Mat3): V3[] {
  const { f, u0, v0, w, h } = SERVO_CAM;
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([u, v]) => add(C, mv(R, [(FR_D * (u - u0)) / f, (FR_D * (v - v0)) / f, FR_D])));
  return [C, ...corners];
}

type Proj = (p: V3) => [number, number];

function frustumD(proj: Proj, C: V3, R: Mat3): string {
  const q = frustumPts(C, R).map(proj);
  const [a, b, c, d, e] = q;
  return `M${a[0]},${a[1]}L${b[0]},${b[1]}M${a[0]},${a[1]}L${c[0]},${c[1]}M${a[0]},${a[1]}L${d[0]},${d[1]}M${a[0]},${a[1]}L${e[0]},${e[1]}M${b[0]},${b[1]}L${c[0]},${c[1]}L${d[0]},${d[1]}L${e[0]},${e[1]}Z`;
}

const VIEW_W = 460;
const VIEW_H = 380;

/** Orthographic orbit projection scaled to fit every camera position of both runs. */
function fitProjection(o: Orbit, traces: ServoTrace[]): Proj {
  const pts: V3[] = [...SERVO_TARGET, ...frustumPts(SERVO_GOAL.C, SERVO_GOAL.Rwc)];
  for (const t of traces) for (let i = 0; i < t.C.length; i += 8) pts.push(...frustumPts(t.C[i], t.Rwc[i]));
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    const q = orbitProject(o, p, '-y');
    x0 = Math.min(x0, q.x);
    x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y);
    y1 = Math.max(y1, q.y);
  }
  const s = Math.min((VIEW_W - 50) / (x1 - x0 || 1), (VIEW_H - 50) / (y1 - y0 || 1));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return (p) => {
    const q = orbitProject(o, p, '-y');
    return [VIEW_W / 2 + s * (q.x - cx), VIEW_H / 2 + s * (q.y - cy)];
  };
}

// ------------------------------------------------------------------ static layers (memoised)

const ImageTrails = memo(function ImageTrails({ traces, show }: { traces: Record<Method, ServoTrace>; show: Record<Method, boolean> }) {
  const { w, h } = SERVO_CAM;
  const star = traces.pbvs.uv[0] ? simulateStar() : [];
  return (
    <g>
      <rect x={-IMG_PAD} y={-IMG_PAD} width={w + 2 * IMG_PAD} height={h + 2 * IMG_PAD} className="vision-outside" />
      <rect x={0} y={0} width={w} height={h} className="vision-imgbg" />
      {METHODS.filter((m) => show[m]).map((m) =>
        [0, 1, 2, 3].map((k) => (
          <polyline
            key={`${m}${k}`}
            points={traces[m].uv
              .filter((_, i) => i % 2 === 0)
              .map((q) => `${Math.max(-IMG_PAD, Math.min(w + IMG_PAD, q[k][0])).toFixed(1)},${Math.max(-IMG_PAD, Math.min(h + IMG_PAD, q[k][1])).toFixed(1)}`)
              .join(' ')}
            className="vision-trail"
            style={{ stroke: MCOL[m] }}
          />
        ))
      )}
      {star.map((q, k) => (
        <rect key={k} x={q[0] - 9} y={q[1] - 9} width={18} height={18} className="vision-desired" />
      ))}
      <rect x={0} y={0} width={w} height={h} className="vision-imgframe" />
      <text x={6} y={h + 18} className="vision-small">
        outside the image (the camera cannot see features here)
      </text>
    </g>
  );
});

function simulateStar(): [number, number][] {
  const { f, u0, v0 } = SERVO_CAM;
  return SERVO_TARGET.map((X) => {
    const c = [X[0] - SERVO_GOAL.C[0], X[1] - SERVO_GOAL.C[1], X[2] - SERVO_GOAL.C[2]];
    return [f * (c[0] / c[2]) + u0, f * (c[1] / c[2]) + v0];
  });
}

const PathLayer = memo(function PathLayer({ proj, traces, show }: { proj: Proj; traces: Record<Method, ServoTrace>; show: Record<Method, boolean> }) {
  const tq = SERVO_TARGET.map(proj);
  const o = proj([0, 0, 0]);
  const axes: [V3, string, string][] = [
    [[0.15, 0, 0], 'var(--m2)', 'x'],
    [[0, 0.15, 0], 'var(--m3)', 'y'],
    [[0, 0, 0.15], 'var(--m1)', 'z'],
  ];
  return (
    <g>
      <polygon points={tq.map((q) => q.join(',')).join(' ')} className="vision-target" />
      {tq.map((q, i) => (
        <circle key={i} cx={q[0]} cy={q[1]} r={3.5} className="vision-target-pt" />
      ))}
      {axes.map(([d, c, l]) => {
        const e = proj(d);
        return (
          <g key={l}>
            <line x1={o[0]} y1={o[1]} x2={e[0]} y2={e[1]} style={{ stroke: c }} className="vision-axis3" />
            <text x={e[0] + 3} y={e[1] - 3} className="vision-small" style={{ fill: c }}>
              {l}
            </text>
          </g>
        );
      })}
      <path d={frustumD(proj, SERVO_GOAL.C, SERVO_GOAL.Rwc)} className="vision-frustum is-goal" />
      {METHODS.filter((m) => show[m]).map((m) => (
        <g key={m}>
          <polyline points={traces[m].C.map((c) => proj(c).map((x) => x.toFixed(1)).join(',')).join(' ')} className="vision-path" style={{ stroke: MCOL[m] }} />
        </g>
      ))}
      <path d={frustumD(proj, traces.pbvs.C[0], traces.pbvs.Rwc[0])} className="vision-frustum is-start" />
    </g>
  );
});

// ------------------------------------------------------------------ the simulation

interface Api {
  roll(): void;
  calib(): void;
  fov(): void;
}

const PLOT_W = 460;
const PLOT_H = 150;

export default function Servoing() {
  const [preset, setPreset] = useState('approach');
  const [calib, setCalib] = useState(0);
  const [depth, setDepth] = useState<'current' | 'desired'>('current');
  const [showSel, setShowSel] = useState<'both' | Method>('both');
  const [playing, setPlaying] = useState(false);
  const [orbit, , orbitHandlers] = useOrbit({ az: 1.05, el: 0.38 });
  const pr = PRESETS.find((p) => p.id === preset) ?? PRESETS[0];

  const traces = useMemo(
    () => ({
      pbvs: simulateServo(pr.start, { method: 'pbvs', calib, dt: DT, steps: STEPS }),
      ibvs: simulateServo(pr.start, { method: 'ibvs', calib, depth, dt: DT, steps: STEPS }),
    }),
    [pr, calib, depth]
  );
  const show = useMemo(() => ({ pbvs: showSel !== 'ibvs', ibvs: showSel !== 'pbvs' }), [showSel]);
  const proj = useMemo(() => fitProjection(orbit, [traces.pbvs, traces.ibvs]), [orbit, traces]);
  const dMax = Math.max(1.2, traces.pbvs.maxDist, traces.ibvs.maxDist) * 1.08;

  // ---------------- per-frame drawing through refs
  const tRef = useRef(0);
  const feat = useRef<Record<Method, (SVGCircleElement | null)[]>>({ pbvs: [], ibvs: [] });
  const quad = useRef<Record<Method, SVGPolygonElement | null>>({ pbvs: null, ibvs: null });
  const fr = useRef<Record<Method, SVGPathElement | null>>({ pbvs: null, ibvs: null });
  const cursor = useRef<SVGLineElement | null>(null);
  const scrub = useRef<HTMLInputElement | null>(null);
  const txt = useRef<Record<string, HTMLElement | null>>({});
  const live = useRef({ traces, proj, show, dMax });
  live.current = { traces, proj, show, dMax };

  const draw = (i: number) => {
    const { traces: T, proj: pj, show: sh } = live.current;
    const k = Math.max(0, Math.min(STEPS, Math.round(i)));
    for (const m of METHODS) {
      const uv = T[m].uv[k];
      feat.current[m].forEach((c, j) => {
        if (!c) return;
        c.setAttribute('cx', uv[j][0].toFixed(1));
        c.setAttribute('cy', uv[j][1].toFixed(1));
        c.style.display = sh[m] ? '' : 'none';
      });
      const q = quad.current[m];
      if (q) {
        q.setAttribute('points', uv.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
        q.style.display = sh[m] ? '' : 'none';
      }
      const f = fr.current[m];
      if (f) {
        f.setAttribute('d', frustumD(pj, T[m].C[k], T[m].Rwc[k]));
        f.style.display = sh[m] ? '' : 'none';
      }
      const out = uv.some(([u, v]) => u < 0 || u > SERVO_CAM.w || v < 0 || v > SERVO_CAM.h);
      const el = txt.current[`${m}-d`];
      if (el) el.textContent = `${fmt(T[m].dist[k], 3)} m`;
      const ee = txt.current[`${m}-e`];
      if (ee) ee.textContent = `${fmt(T[m].err[k], 3)} px${out ? ' · target out of view' : ''}`;
    }
    const x = 40 + ((PLOT_W - 50) * k) / STEPS;
    cursor.current?.setAttribute('x1', String(x));
    cursor.current?.setAttribute('x2', String(x));
    if (scrub.current) scrub.current.value = String(k);
    const te = txt.current.t;
    if (te) te.textContent = `t = ${(k * DT).toFixed(2)} s`;
  };
  // Redraw whenever the inputs change (new traces or view).
  useEffect(() => {
    draw(tRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traces, proj, show]);
  useRaf(
    (dt) => {
      tRef.current = Math.min(STEPS, tRef.current + (dt / DT) * 0.75);
      draw(tRef.current);
      if (tRef.current >= STEPS) setPlaying(false);
    },
    playing
  );
  const play = () => {
    if (tRef.current >= STEPS) tRef.current = 0;
    setPlaying(true);
  };
  const restart = () => {
    tRef.current = 0;
    draw(0);
    setPlaying(true);
  };

  const api = useRef<Api>(null as unknown as Api);
  api.current = {
    roll: () => {
      setPreset('roll90');
      setCalib(0);
      setShowSel('both');
      tRef.current = 0;
      setPlaying(true);
    },
    calib: () => {
      setPreset('approach');
      setCalib(1);
      setShowSel('both');
      tRef.current = 0;
      setPlaying(true);
    },
    fov: () => {
      setPreset('swing');
      setCalib(0);
      setShowSel('both');
      tRef.current = 0;
      setPlaying(true);
    },
  };

  const plotPts = (m: Method) => traces[m].dist.map((d, i) => `${(40 + ((PLOT_W - 50) * i) / STEPS).toFixed(1)},${(PLOT_H - 26 - ((PLOT_H - 40) * d) / dMax).toFixed(1)}`).join(' ');
  const yOf = (d: number) => PLOT_H - 26 - ((PLOT_H - 40) * d) / dMax;
  const resLine = (m: Method) => {
    const T = traces[m];
    const lost = T.outSteps ? ` Target out of view for ${fmt((100 * T.outSteps) / (STEPS + 1), 2)} % of the run.` : ' Target in view throughout.';
    return `**${MNAME[m]}**: farthest ${fmt(T.maxDist, 3)} m; ends with image error ${fmt(T.pixErr, 2)} px and gripper error ${fmt(T.toolErr * 100, 2)} cm.${lost}`;
  };

  return (
    <div className="vision-sim">
      <div className="vision-toolbar">
        <Select label="Start pose" value={preset} onChange={(id) => (setPreset(id), (tRef.current = 0))} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
        <Segmented
          label="Show"
          value={showSel}
          onChange={setShowSel}
          options={[
            { value: 'both', label: 'Both' },
            { value: 'pbvs', label: 'PBVS' },
            { value: 'ibvs', label: 'IBVS' },
          ]}
        />
        <Button variant="primary" onClick={playing ? () => setPlaying(false) : play}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </Button>
        <Button onClick={restart}>↻ Restart</Button>
        <input
          ref={scrub}
          type="range"
          min={0}
          max={STEPS}
          step={1}
          defaultValue={0}
          aria-label="Time"
          className="vision-scrub"
          onChange={(e) => {
            setPlaying(false);
            tRef.current = Number(e.target.value);
            draw(tRef.current);
          }}
        />
        <span className="mono" ref={(el) => (txt.current.t = el)}>
          t = 0.00 s
        </span>
      </div>

      <div className="vision-panels">
        <Panel title="Camera image" hint="□ desired features · trails: blue PBVS, orange IBVS">
          <svg viewBox={`${-IMG_PAD} ${-IMG_PAD} ${SERVO_CAM.w + 2 * IMG_PAD} ${SERVO_CAM.h + 2 * IMG_PAD}`} className="vision-svg" role="img" aria-label="Feature trajectories in the image">
            <ImageTrails traces={traces} show={show} />
            {METHODS.map((m) => (
              <g key={m}>
                <polygon ref={(el) => (quad.current[m] = el)} className="vision-featquad" style={{ stroke: MCOL[m] }} />
                {[0, 1, 2, 3].map((j) => (
                  <circle key={j} ref={(el) => (feat.current[m][j] = el)} r={7} className="vision-feat" style={{ fill: MCOL[m] }} />
                ))}
              </g>
            ))}
          </svg>
        </Panel>
        <Panel title="3-D paths of the camera" hint="drag or use arrow keys to orbit · dashed: goal pose">
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="vision-svg vision-orbit" role="img" aria-label="Camera paths in 3-D; drag to orbit" {...orbitHandlers}>
            <PathLayer proj={proj} traces={traces} show={show} />
            {METHODS.map((m) => (
              <path key={m} ref={(el) => (fr.current[m] = el)} className="vision-frustum" style={{ stroke: MCOL[m] }} />
            ))}
          </svg>
        </Panel>
      </div>

      <div className="vision-panels">
        <Panel title="Distance from the camera to the target" hint="desired: 0.5 m">
          <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} className="vision-svg" role="img" aria-label="Distance to the target against time for both methods">
            <line x1={40} y1={PLOT_H - 26} x2={PLOT_W - 10} y2={PLOT_H - 26} className="vision-axis" />
            <line x1={40} y1={10} x2={40} y2={PLOT_H - 26} className="vision-axis" />
            {[0, 0.5, 1, 1.5, 2, 2.5, 3].filter((d) => d <= dMax).map((d) => (
              <g key={d}>
                <line x1={36} y1={yOf(d)} x2={PLOT_W - 10} y2={yOf(d)} className="vision-gridline" />
                <text x={32} y={yOf(d) + 4} textAnchor="end" className="vision-tick">
                  {d}
                </text>
              </g>
            ))}
            {[0, 2, 4, 6, 8].map((t) => (
              <text key={t} x={40 + ((PLOT_W - 50) * t) / (STEPS * DT)} y={PLOT_H - 10} textAnchor="middle" className="vision-tick">
                {t} s
              </text>
            ))}
            <text x={8} y={12} className="vision-tick">
              m
            </text>
            {METHODS.filter((m) => show[m]).map((m) => (
              <polyline key={m} points={plotPts(m)} className="vision-plotline" style={{ stroke: MCOL[m] }} />
            ))}
            <line ref={cursor} x1={40} y1={10} x2={40} y2={PLOT_H - 26} className="vision-cursor" />
          </svg>
          <Readouts min={150}>
            {METHODS.map((m) => (
              <div className="readout" key={m}>
                <div className="readout-label">
                  <span className="readout-text" style={{ color: MCOL[m] }}>
                    {MNAME[m]} now
                  </span>
                </div>
                <div className="readout-value vision-live">
                  <span ref={(el) => (txt.current[`${m}-d`] = el)}>—</span>
                  <br />
                  <span ref={(el) => (txt.current[`${m}-e`] = el)} className="vision-live-sub">
                    —
                  </span>
                </div>
              </div>
            ))}
          </Readouts>
        </Panel>
        <div className="vision-box">
          <h4>Settings and results</h4>
          <Slider
            label="calibration error"
            tex="e"
            tip="0 = perfect. At 100 %: focal length overestimated by 30 % (so estimated depths are 30 % long) and the camera-to-end-effector transform off by about 6 cm and 9°"
            value={calib * 100}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(x) => setCalib(x / 100)}
          />
          <div className="vision-row">
            <span className="vision-explain">IBVS depth estimate</span>
            <Segmented
              size="sm"
              label="IBVS depth estimate"
              value={depth}
              onChange={setDepth}
              options={[
                { value: 'current', label: 'current Z', title: 'estimated from the known target size at every step' },
                { value: 'desired', label: 'constant Z*', title: 'the desired depth, 0.5 m, throughout' },
              ]}
            />
          </div>
          <Rich className="vision-explain" text={pr.note} />
          <Rich className="vision-explain" text={`${resLine('pbvs')}\n\n${resLine('ibvs')}`} />
          <Readouts min={120}>
            <Readout label="PBVS final error" value={traces.pbvs.pixErr} sig={3} unit="px" tone={traces.pbvs.pixErr > 2 ? 'bad' : 'ok'} tip="RMS distance of the final features from the desired ones" />
            <Readout label="IBVS final error" value={traces.ibvs.pixErr} sig={3} unit="px" tone={traces.ibvs.pixErr > 2 ? 'bad' : 'ok'} tip="RMS distance of the final features from the desired ones" />
          </Readouts>
        </div>
      </div>

      <div className="vision-controls">
        <div className="vision-box">
          <h4>The two control laws</h4>
          <Rich
            text={`**IBVS**: the error is in the image, $e = s - s^*$ (feature positions). Each feature moves as $\\dot{s} = L\\,v_c$ with the image Jacobian (interaction matrix)

$$L = \\begin{bmatrix} -\\frac{1}{Z} & 0 & \\frac{x}{Z} & xy & -(1+x^2) & y \\\\ 0 & -\\frac{1}{Z} & \\frac{y}{Z} & 1+y^2 & -xy & -x \\end{bmatrix}, \\qquad v_c = -\\lambda\\, L^{+} e$$

so it needs a depth estimate $Z$ but no 3-D model or pose.

**PBVS**: the error is the camera's pose relative to the goal, $({}^{c^*}t_c, \\theta u)$, estimated from the image with a calibrated camera:

$$v = -\\lambda\\, {}^{c^*}R_c^{T}\\, {}^{c^*}t_c, \\qquad \\omega = -\\lambda\\, \\theta u$$

so the camera centre moves on a straight line in 3-D.`}
          />
        </div>
        <div className="vision-box">
          <h4>Which to use, and the exam answers</h4>
          <Rich
            text={`$$\\begin{array}{l|l|l} & \\text{PBVS} & \\text{IBVS} \\\\ \\hline \\text{error in} & \\text{3-D pose} & \\text{image features} \\\\ \\text{3-D path} & \\text{straight line} & \\text{can be odd (retreat)} \\\\ \\text{image path} & \\text{features may leave} & \\text{straight lines, stay in view} \\\\ \\text{calibration} & \\text{needs it accurate} & \\text{robust to errors} \\\\ \\text{needs} & \\text{3-D model, known } {}^{e}T_c & \\text{depth estimate } Z \\end{array}$$

- Aligning the features in an eye-in-hand camera with a desired view is **IBVS** (2023 Q15).
- PBVS requires a **known** transform between the camera and the end-effector (2024 Q15): it turns the estimated pose into end-effector motion.
- IBVS requires only a **fixed** camera-to-end-effector transform (2025 Q15): the desired image was taught with the same mounting, so any rigid offset is absorbed.`}
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
        id="vision-servo-roll"
        question="The camera starts at the right distance but rotated 90° about its optical axis. How does the **IBVS** camera move to fix it?"
        options={['It backs away from the target while it turns, then comes back in', 'It rotates in place about the optical axis', 'It moves sideways first, then rotates', 'It cannot correct a rotation: the error stays']}
        answer={0}
        explain="IBVS pulls each feature along a straight line to its goal. For a rotation about the optical axis those straight chords cut inside the circle the features would follow, so the square in the image shrinks part-way, and the only way to make it smaller is to move back. PBVS controls the pose directly and simply rotates in place (both reach the goal)."
        tryIt="press Show me, then watch the orange path in 3-D and the distance plot."
        onApply={() => api.current.roll()}
      />
      <PredictReveal
        id="vision-servo-calib"
        question="Now the camera is badly calibrated: its focal length is 30 % off and the camera-to-end-effector transform is wrong. Which method still finishes with the features exactly on their desired positions?"
        options={['IBVS', 'PBVS', 'Both', 'Neither']}
        answer={0}
        explain="IBVS defines its error **in the image**: it keeps moving until $s = s^*$, so a wrong $K$ or hand-eye transform only bends the path (the Jacobian is a little off). PBVS trusts its 3-D pose estimate: with the focal length overestimated it believes it is farther than it is and stops too close, and the hand-eye error puts the gripper several centimetres off. The final image error is large even though PBVS thinks it has arrived."
        tryIt="press Show me: calibration error 100 %. Compare the final features with the squares."
        onApply={() => api.current.calib()}
      />
      <PredictReveal
        id="vision-servo-fov"
        question="The camera starts beside the target, turned towards it and rolled. Which method can lose the target out of the image on the way?"
        options={['PBVS', 'IBVS', 'Neither: both keep the target in view', 'Both']}
        answer={0}
        explain="PBVS moves on a straight 3-D line and turns at a steady rate, paying no attention to where the features are in the image, so midway the target can slide out of the field of view (and a real system would lose track). IBVS moves the features along straight image lines from where they are to where they should be, so they stay inside the image."
        tryIt="press Show me and watch the blue trails leave the image frame."
        onApply={() => api.current.fov()}
      />
    </div>
  );
});
