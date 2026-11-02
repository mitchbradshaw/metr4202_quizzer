// Velocity motion model arc drawer (summary notes §3; review deck "velocity model" question; 2023 Q32(b)).
// Left: the world with the draggable start pose, the circular arc of each command (radius r = v/ω round its
// centre of rotation, straight when ω = 0), the end poses, an optional cloud of sampled end poses
// (Thrun Table 5.3, α1…α6) on a canvas layer, ghosts of the classic mistakes, and the formula with this
// command's numbers substituted. Right: the command chain (presets: review deck, 2023 Q32), sliders, noise.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { arcCentre, gaussian, velocityMotion, type Pose } from '../../../core/motion';
import { mulberry32 } from '../../../engine/rng';
import { useRaf } from '../../../anim/hooks';
import { useThemeColors } from '../../../ui/theme';
import { Button, More, NumField, Readout, Readouts, Segmented, Select, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { svgPoint } from '../../../ui/diagrams';
import { Key, RobotGlyph, WorldGrid, arcPathD, fitView, headD, makeFrame, rgba, useStageCanvas, type Frame, type View } from './modelsDraw';
import { DEG, fx, g, par, sig } from './modelsFmt';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'velocity',
  title: 'Velocity model: arcs of radius v/ω',
  summary:
    'Drag the start pose, set $(v, \\omega, \\Delta t)$ and watch the robot trace a circular arc of radius $r = v/\\omega$ round its centre of rotation, with the formula substituted live. Chain commands (2023 Q32 and the review-deck presets), see the classic mistakes as ghosts, then add noise with $\\alpha_1 \\dots \\alpha_6$ and watch the cloud of sampled end poses bend into a banana.',
  notice:
    'Constant $(v, \\omega)$ traces a circle of radius $v/\\omega$: negative means clockwise, infinite means straight. Noise on $v$ spreads the end poses along the arc, noise on $\\omega$ bends them across it.',
  minutes: 10,
};

// ------------------------------------------------------------------ model pieces

interface Cmd {
  v: number;
  w: number;
  dt: number;
  /** γ: the final rotation rate (rad/s), 0 in every exam question. */
  g: number;
}

type Alphas = [number, number, number, number, number, number];

/** Pose after a command (θ not wrapped, as in the papers: 0.3 − 0.4 = −0.1). */
const applyCmd = (p: Pose, c: Cmd): Pose => velocityMotion(p, c.v, c.w, c.dt, c.g);

function chainPoses(start: Pose, cmds: Cmd[]): Pose[] {
  const out = [start];
  for (const c of cmds) out.push(applyCmd(out[out.length - 1], c));
  return out;
}

/** Thrun Table 5.3: v̂ = v + ε(α1v² + α2ω²), ω̂ = ω + ε(α3v² + α4ω²), γ̂ = γ + ε(α5v² + α6ω²). */
function sampleCmd(p: Pose, c: Cmd, a: Alphas, next: () => number): Pose {
  const sd = (b2: number) => Math.sqrt(Math.max(0, b2));
  const v2 = c.v * c.v;
  const w2 = c.w * c.w;
  const vh = c.v + sd(a[0] * v2 + a[1] * w2) * gaussian(next);
  const wh = c.w + sd(a[2] * v2 + a[3] * w2) * gaussian(next);
  const gh = c.g + sd(a[4] * v2 + a[5] * w2) * gaussian(next);
  return velocityMotion(p, vh, wh, c.dt, gh);
}

/** Pose computed with the calculator in degrees (the angles here are radians). */
function degMode(p: Pose, c: Cmd): Pose {
  const s = (a: number) => Math.sin(a / DEG);
  const co = (a: number) => Math.cos(a / DEG);
  if (Math.abs(c.w) < 1e-9) return { x: p.x + c.v * c.dt * co(p.theta), y: p.y + c.v * c.dt * s(p.theta), theta: p.theta + c.g * c.dt };
  const r = c.v / c.w;
  const th = p.theta + c.w * c.dt;
  return { x: p.x - r * s(p.theta) + r * s(th), y: p.y + r * co(p.theta) - r * co(th), theta: th + c.g * c.dt };
}

// ------------------------------------------------------------------ presets

interface Preset {
  id: string;
  label: string;
  start: Pose;
  cmds: Cmd[];
  note: string;
}

const PRESETS: Preset[] = [
  {
    id: 'q32',
    label: '2023 Q32: two commands',
    start: { x: 1.1, y: -2.7, theta: 0 },
    cmds: [
      { v: 1.2, w: 0.15, dt: 2, g: 0 },
      { v: 0.5, w: -0.2, dt: 2, g: 0 },
    ],
    note: '2023 Q32(b): from $(1.1, -2.7)$ heading 0, $(1.2, 0.15)$ then $(0.5, -0.2)$, each for 2 s. Answer: $(3.4642, -2.3427, 0.3)$ then $(4.4525, -2.2435, -0.1)$. The second command has $\\omega < 0$, so $r = -2.5$ m: a clockwise arc with its centre on the robot’s right.',
  },
  {
    id: 'review',
    label: 'Review deck: (0.8, 0.03) for 2 s',
    start: { x: 0, y: 0, theta: 0 },
    cmds: [{ v: 0.8, w: 0.03, dt: 2, g: 0 }],
    note: 'Review deck: from $(0, 0, 0)$ with $v = 0.8$ m/s, $\\omega = 0.03$ rad/s for 2 s. Answer: $(1.5990, 0.04799, 0.06)$. The radius $r = 26.67$ m is huge, so the arc is almost straight: the centre is far off the top of the view.',
  },
  {
    id: 'turn',
    label: 'Tight left turn',
    start: { x: 0, y: 0, theta: 0 },
    cmds: [{ v: 1, w: 0.8, dt: 3, g: 0 }],
    note: '$r = 1/0.8 = 1.25$ m and $\\omega\\Delta t = 2.4$ rad (137°): the arc wraps well round its centre. The heading turns by exactly $\\omega\\Delta t$ whatever $v$ is.',
  },
  {
    id: 'sbend',
    label: 'S-bend: left then right',
    start: { x: 0, y: 0, theta: 0 },
    cmds: [
      { v: 1, w: 0.6, dt: 2, g: 0 },
      { v: 1, w: -0.6, dt: 2, g: 0 },
    ],
    note: 'Same speed and the opposite turn rate: the second arc has the same radius on the other side, so the heading comes back to 0 and the path is an S.',
  },
  {
    id: 'straight',
    label: 'ω = 0: straight line',
    start: { x: 0, y: 0, theta: 0.4 },
    cmds: [{ v: 1, w: 0, dt: 3, g: 0 }],
    note: 'With $\\omega = 0$ the arc formula divides by zero: the radius is infinite. Use $x\' = x + v\\Delta t\\cos\\theta$, $y\' = y + v\\Delta t\\sin\\theta$, $\\theta\' = \\theta$.',
  },
  {
    id: 'spin',
    label: 'v = 0: turn on the spot',
    start: { x: 0, y: 0, theta: 0 },
    cmds: [{ v: 0, w: 1, dt: 1.5, g: 0 }],
    note: 'With $v = 0$ the radius is 0: the robot turns on the spot by $\\omega\\Delta t = 1.5$ rad and its position does not change.',
  },
];

const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

const NOISE: { id: string; label: string; a: Alphas; title: string }[] = [
  { id: 'mild', label: 'Mild', a: [0.004, 0.004, 0.004, 0.004, 0.002, 0.002], title: 'A little of everything' },
  { id: 'trans', label: 'Speed (α1, α2)', a: [0.03, 0.03, 0, 0, 0, 0], title: 'Noise on v only: spreads the end poses along the arc' },
  { id: 'rot', label: 'Turn rate (α3, α4)', a: [0, 0, 0.015, 0.015, 0, 0], title: 'Noise on ω only: bends the cloud across the arc (the banana)' },
  { id: 'gamma', label: 'Final turn (α5, α6)', a: [0, 0, 0, 0, 0.05, 0.05], title: 'Noise on γ only: rotates the final heading, positions unchanged' },
  { id: 'none', label: 'None', a: [0, 0, 0, 0, 0, 0], title: 'Perfect actuation' },
];

const W = 680;
const H = 470;
const ASPECT = W / H;

function viewFor(start: Pose, cmds: Cmd[]): View {
  const pts: { x: number; y: number }[] = [start];
  let p = start;
  for (const c of cmds) {
    const n = 24;
    for (let i = 1; i <= n; i++) pts.push(velocityMotion(p, c.v, c.w, (c.dt * i) / n));
    const ce = arcCentre(p, c.v, c.w);
    const ext = Math.max(1, Math.abs(c.v * c.dt));
    if (ce && Math.abs(ce.r) <= 1.6 * ext) pts.push({ x: ce.cx, y: ce.cy });
    p = applyCmd(p, c);
  }
  return fitView(pts, ASPECT, 0.6, 2.5);
}

// ------------------------------------------------------------------ component

export default function VelocityArc() {
  const [presetId, setPresetId] = useState('q32');
  const [start, setStart] = useState<Pose>(PRESETS[0].start);
  const [cmds, setCmds] = useState<Cmd[]>(PRESETS[0].cmds);
  const [sel, setSel] = useState(0);
  const [view, setView] = useState<View>(() => viewFor(PRESETS[0].start, PRESETS[0].cmds));
  const [alphas, setAlphas] = useState<Alphas>(NOISE[0].a);
  const [cloud, setCloud] = useState(false);
  const [headings, setHeadings] = useState(false);
  const [nSamples, setNSamples] = useState(500);
  const [seed, setSeed] = useState(7);
  const [ghostDeg, setGhostDeg] = useState(false);
  const [ghostCarry, setGhostCarry] = useState(false);
  const [ghostAbs, setGhostAbs] = useState(false);
  const [showCircle, setShowCircle] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const col = useThemeColors(['--m4', '--m2', '--text-3']);

  const f = useMemo(() => makeFrame(view, W, H), [view]);
  const poses = useMemo(() => chainPoses(start, cmds), [start, cmds]);
  const j = Math.min(sel, cmds.length - 1);
  const cmd = cmds[j];
  const from = poses[j];
  const to = poses[j + 1];
  const ce = arcCentre(from, cmd.v, cmd.w);

  const load = (id: string) => {
    const p = presetById(id);
    setPresetId(id);
    setStart(p.start);
    setCmds(p.cmds.map((c) => ({ ...c })));
    setSel(0);
    setView(viewFor(p.start, p.cmds));
  };
  const editCmd = (k: number, patch: Partial<Cmd>) => {
    setCmds((cs) => cs.map((c, i) => (i === k ? { ...c, ...patch } : c)));
    setPresetId('custom');
  };
  const fit = () => setView(viewFor(start, cmds));

  // ---------------------------------------------------------------- noise cloud (deferred, fixed seed so it deforms smoothly)
  const dStart = useDeferredValue(start);
  const dCmds = useDeferredValue(cmds);
  const dAlphas = useDeferredValue(alphas);
  const samples = useMemo(() => {
    if (!cloud) return null;
    const next = mulberry32(seed * 7919 + 13);
    const steps: Pose[][] = dCmds.map(() => []);
    for (let i = 0; i < nSamples; i++) {
      let p = dStart;
      dCmds.forEach((c, k) => {
        p = sampleCmd(p, c, dAlphas, next);
        steps[k].push(p);
      });
    }
    return steps;
  }, [cloud, seed, nSamples, dStart, dCmds, dAlphas]);

  const canvasRef = useStageCanvas(
    W,
    H,
    (ctx) => {
      if (!samples) return;
      const last = samples.length - 1;
      samples.forEach((pts, k) => {
        ctx.fillStyle = rgba(col['--m4'], k === last ? 0.5 : 0.22);
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(f.sx(p.x), f.sy(p.y), k === last ? 1.9 : 1.5, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
      if (headings && last >= 0) {
        ctx.strokeStyle = rgba(col['--m4'], 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const p of samples[last].slice(0, 260)) {
          const x = f.sx(p.x);
          const y = f.sy(p.y);
          ctx.moveTo(x, y);
          ctx.lineTo(x + 13 * Math.cos(p.theta), y - 13 * Math.sin(p.theta));
        }
        ctx.stroke();
      }
    },
    [samples, f, headings, col]
  );

  // ---------------------------------------------------------------- dragging the start pose
  const drag = useRef<'move' | 'turn' | null>(null);
  const onDown = (mode: 'move' | 'turn') => (e: RPointerEvent<SVGGElement>) => {
    drag.current = mode;
    (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: RPointerEvent<SVGGElement>) => {
    if (!drag.current || !svgRef.current) return;
    const pt = svgPoint(svgRef.current, e.clientX, e.clientY);
    const wpt = f.toWorld(pt.x, pt.y);
    const snap = (x: number, s: number) => Math.round(x / s) * s;
    if (drag.current === 'move') setStart((s) => ({ ...s, x: snap(wpt.x, 0.05), y: snap(wpt.y, 0.05) }));
    else setStart((s) => ({ ...s, theta: snap(Math.atan2(wpt.y - s.y, wpt.x - s.x), 0.05) }));
    setPresetId('custom');
  };
  const onUp = (e: RPointerEvent<SVGGElement>) => {
    drag.current = null;
    (e.currentTarget as SVGGElement).releasePointerCapture(e.pointerId);
  };
  const onKeyMove = (e: RKeyboardEvent<SVGGElement>) => {
    const d = e.shiftKey ? 0.5 : 0.05;
    const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const mv = m[e.key];
    if (!mv) return;
    e.preventDefault();
    setStart((s) => ({ ...s, x: Number((s.x + mv[0]).toFixed(3)), y: Number((s.y + mv[1]).toFixed(3)) }));
    setPresetId('custom');
  };
  const onKeyTurn = (e: RKeyboardEvent<SVGGElement>) => {
    const d = e.shiftKey ? 0.25 : 0.05;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const s = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 1 : -1;
    setStart((p) => ({ ...p, theta: Number((p.theta + s * d).toFixed(3)) }));
    setPresetId('custom');
  };

  // ---------------------------------------------------------------- drive animation (refs, no re-render per frame)
  const [driving, setDriving] = useState(false);
  const tRef = useRef(0);
  const driveRef = useRef<SVGGElement>(null);
  const total = cmds.reduce((a, c) => a + c.dt, 0);
  const speedUp = total > 6 ? total / 6 : 1;
  useRaf(
    (dt) => {
      tRef.current += dt * speedUp;
      let t = tRef.current;
      let p = start;
      let done = true;
      for (const c of cmds) {
        if (t <= c.dt) {
          p = velocityMotion(p, c.v, c.w, t, c.g);
          done = false;
          break;
        }
        t -= c.dt;
        p = applyCmd(p, c);
      }
      const el = driveRef.current;
      if (el) el.setAttribute('transform', `translate(${f.sx(p.x).toFixed(1)} ${f.sy(p.y).toFixed(1)}) rotate(${(-p.theta * DEG).toFixed(2)})`);
      if (done) setDriving(false);
    },
    driving
  );
  useEffect(() => {
    if (!driving && driveRef.current) driveRef.current.setAttribute('transform', 'translate(-100 -100)');
  }, [driving]);

  // ---------------------------------------------------------------- ghosts of the classic mistakes
  const ghosts = useMemo(() => {
    const out: { p: Pose; label: string }[] = [];
    if (ghostDeg) {
      let p = start;
      for (const c of cmds) p = degMode(p, c);
      out.push({ p, label: 'calculator in DEG' });
    }
    if (ghostCarry && cmds.length > 1) {
      let p = start;
      cmds.forEach((c, k) => {
        p = applyCmd(k === 0 ? p : { ...p, theta: start.theta }, c);
      });
      out.push({ p, label: 'θ not carried' });
    }
    if (ghostAbs && cmds.some((c) => c.w < 0)) {
      let p = start;
      for (const c of cmds) p = c.w < 0 ? velocityMotion(p, -c.v, c.w, c.dt, c.g) : applyCmd(p, c);
      out.push({ p, label: 'sign of r dropped' });
    }
    return out;
  }, [ghostDeg, ghostCarry, ghostAbs, start, cmds]);

  // ---------------------------------------------------------------- the selected command's geometry
  const straight = Math.abs(cmd.w) < 1e-9;
  const r = straight ? Infinity : cmd.v / cmd.w;
  const wdt = cmd.w * cmd.dt;
  const centreVisible = ce !== null && Math.abs(ce.r) * f.k < 4 * W && ce.cx >= f.vis.x0 - 0.2 && ce.cx <= f.vis.x0 + f.vis.w + 0.2 && ce.cy >= f.vis.y0 - 0.2 && ce.cy <= f.vis.y0 + f.vis.h + 0.2;

  const geometry = (() => {
    if (!ce || Math.abs(ce.r) < 1e-9) return null;
    const cx = f.sx(ce.cx);
    const cy = f.sy(ce.cy);
    const R = Math.abs(ce.r) * f.k;
    const a0 = Math.atan2(from.y - ce.cy, from.x - ce.cx);
    if (!centreVisible) {
      // Point from the start towards the far-away centre.
      const ux = (ce.cx - from.x) / Math.abs(ce.r);
      const uy = (ce.cy - from.y) / Math.abs(ce.r);
      const L = 70;
      const x1 = f.sx(from.x) + ux * 16;
      const y1 = f.sy(from.y) - uy * 16;
      const x2 = f.sx(from.x) + ux * L;
      const y2 = f.sy(from.y) - uy * L;
      return (
        <g pointerEvents="none">
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-3)" strokeWidth={1.4} strokeDasharray="4 3" />
          <path d={headD(x1, y1, x2, y2, 7)} fill="var(--text-3)" />
          <text className="models-note" x={x2 + (ux >= 0 ? 6 : -6)} y={y2 + (uy >= 0 ? -4 : 12)} textAnchor={ux >= 0 ? 'start' : 'end'}>
            centre {sig(Math.abs(ce.r), 4)} m this way
          </text>
        </g>
      );
    }
    const sweep = Math.abs(wdt);
    const rad = Math.min(R * 0.42, 34);
    const n = Math.max(2, Math.ceil(sweep / 0.05));
    let wedge = `M${cx.toFixed(1)} ${cy.toFixed(1)}`;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (wdt * i) / n;
      wedge += `L${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy - rad * Math.sin(a)).toFixed(1)}`;
    }
    wedge += 'Z';
    const amid = a0 + wdt / 2;
    return (
      <g pointerEvents="none">
        {showCircle && <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--text-3)" strokeWidth={1} strokeDasharray="2 4" />}
        <line x1={cx} y1={cy} x2={f.sx(from.x)} y2={f.sy(from.y)} stroke="var(--text-3)" strokeWidth={1.3} strokeDasharray="5 4" />
        <line x1={cx} y1={cy} x2={f.sx(to.x)} y2={f.sy(to.y)} stroke="var(--text-3)" strokeWidth={1.3} strokeDasharray="5 4" />
        {sweep > 0.02 && <path d={wedge} fill="var(--m1)" opacity={0.13} />}
        <circle cx={cx} cy={cy} r={4} fill="var(--text-2)" />
        <text className="models-note" x={cx + 8} y={cy + 15}>
          centre ({sig(ce.cx, 3)}, {sig(ce.cy, 3)})
        </text>
        {sweep > 0.05 && (
          <text className="models-note is-strong" x={cx + (rad + 14) * Math.cos(amid)} y={cy - (rad + 14) * Math.sin(amid) + 4} textAnchor="middle" fill="var(--m1)">
            ωΔt = {g(wdt, 3)}
          </text>
        )}
        <text
          className="models-note"
          x={(cx + f.sx(from.x)) / 2 + 6}
          y={(cy + f.sy(from.y)) / 2 - 4}
        >
          |r| = {sig(Math.abs(ce.r), 4)} m
        </text>
      </g>
    );
  })();

  const pathOff = (p: Pose) => p.x < f.vis.x0 || p.x > f.vis.x0 + f.vis.w || p.y < f.vis.y0 || p.y > f.vis.y0 + f.vis.h;
  const offScreen = poses.some(pathOff);

  // ---------------------------------------------------------------- the world view
  const world = (
    <div className="models-panel">
      <div className="models-head">
        <h4 style={{ margin: 0 }}>World</h4>
        <span className="models-hint">drag the robot to move the start, the small knob to turn it</span>
      </div>
      <div className="models-stage">
        <canvas ref={canvasRef} className="models-stage-under" aria-hidden="true" />
        <svg
          ref={svgRef}
          className="models-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Velocity model: ${cmds.length} command${cmds.length > 1 ? 's' : ''} from (${g(start.x, 2)}, ${g(start.y, 2)}) heading ${g(start.theta, 2)} rad, ending at (${g(poses[poses.length - 1].x, 3)}, ${g(poses[poses.length - 1].y, 3)}) heading ${g(poses[poses.length - 1].theta, 3)} rad.`}
        >
          <WorldGrid f={f} />
          {geometry}
          {cmds.map((c, k) => (
            <path
              key={k}
              d={arcPathD(poses[k], c.v, c.w, c.dt, f)}
              fill="none"
              stroke="var(--m1)"
              strokeWidth={k === j ? 4 : 2.4}
              opacity={k === j ? 1 : 0.55}
              strokeLinecap="round"
              pointerEvents="none"
            />
          ))}
          {ghosts.map((gh, k) => (
            <RobotGlyph key={`gh${k}`} pose={gh.p} f={f} color="var(--bad)" dashed opacity={0.85} label={gh.label} r={0.12} minPx={7} labelBelow />
          ))}
          {poses.slice(1).map((p, k) => (
            <RobotGlyph key={`e${k}`} pose={p} f={f} color="var(--m1)" r={0.14} minPx={8} label={cmds.length > 1 ? `${k + 1}` : 'end'} />
          ))}
          <g ref={driveRef} transform="translate(-100 -100)" pointerEvents="none">
            <circle r={11} fill="var(--m2)" opacity={0.9} />
            <line x1={0} y1={0} x2={17} y2={0} stroke="var(--m2)" strokeWidth={3} strokeLinecap="round" />
          </g>
          {/* start pose: drag to move; the knob turns it */}
          <g
            className="models-drag"
            tabIndex={0}
            role="slider"
            aria-label={`Start position (${g(start.x, 2)}, ${g(start.y, 2)}) m. Arrow keys move it.`}
            aria-valuenow={start.x}
            onPointerDown={onDown('move')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onKeyDown={onKeyMove}
          >
            <circle cx={f.sx(start.x)} cy={f.sy(start.y)} r={22} fill="transparent" className="models-focus-ring" />
            <RobotGlyph pose={start} f={f} color="var(--accent)" fill="var(--accent-soft)" r={0.16} minPx={11} label="start" />
          </g>
          <g
            className="models-drag"
            tabIndex={0}
            role="slider"
            aria-label={`Start heading θ = ${g(start.theta, 2)} rad. Arrow keys turn it.`}
            aria-valuenow={start.theta}
            onPointerDown={onDown('turn')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onKeyDown={onKeyTurn}
          >
            {(() => {
              const kx = f.sx(start.x) + 40 * Math.cos(start.theta);
              const ky = f.sy(start.y) - 40 * Math.sin(start.theta);
              return (
                <>
                  <line x1={f.sx(start.x)} y1={f.sy(start.y)} x2={kx} y2={ky} stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="3 3" pointerEvents="none" />
                  <circle cx={kx} cy={ky} r={14} fill="transparent" className="models-focus-ring" />
                  <circle cx={kx} cy={ky} r={6} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.5} />
                </>
              );
            })()}
          </g>
        </svg>
      </div>
      <div className="models-bar">
        <Button size="sm" variant="primary" onClick={() => ((tRef.current = 0), setDriving(true))} disabled={driving || total <= 0}>
          ▶ Drive the chain
        </Button>
        <Button size="sm" onClick={fit} title="Zoom so the whole chain fits">
          Fit view
        </Button>
        <Toggle checked={showCircle} onChange={setShowCircle} label="Full circle" />
        {offScreen && <span className="small models-bad">Part of the path is off screen: press Fit view.</span>}
      </div>
      <Key
        items={[
          { label: 'arc of each command', color: 'var(--m1)' },
          { label: 'radius and centre', color: 'var(--text-3)', kind: 'dash' },
          ...(cloud ? [{ label: 'sampled end poses', color: 'var(--m4)', kind: 'dot' as const }] : []),
          ...(ghosts.length ? [{ label: 'a classic mistake', color: 'var(--bad)', kind: 'dash' as const }] : []),
        ]}
      />
    </div>
  );

  // ---------------------------------------------------------------- the substituted formula
  const th = from.theta;
  const th2 = th + wdt;
  const formula = (() => {
    const head = `\\text{Command ${j + 1}: } v = ${g(cmd.v)}\\ \\text{m/s},\\ \\omega = ${g(cmd.w)}\\ \\text{rad/s},\\ \\Delta t = ${g(cmd.dt)}\\ \\text{s}${cmd.g !== 0 ? `,\\ \\gamma = ${g(cmd.g)}\\ \\text{rad/s}` : ''}`;
    if (straight)
      return [
        head,
        `\\omega = 0:\\ r = v/\\omega \\to \\infty \\text{ (straight line; the arc formula would divide by zero)}`,
        `x' = x + v\\Delta t\\cos\\theta = ${g(from.x)} + ${par(cmd.v * cmd.dt)}\\cos(${g(th)}) = \\mathbf{${fx(to.x)}}\\ \\text{m}`,
        `y' = y + v\\Delta t\\sin\\theta = ${g(from.y)} + ${par(cmd.v * cmd.dt)}\\sin(${g(th)}) = \\mathbf{${fx(to.y)}}\\ \\text{m}`,
        `\\theta' = \\theta + \\gamma\\Delta t = ${g(th)} + ${par(cmd.g * cmd.dt)} = \\mathbf{${g(to.theta)}}\\ \\text{rad}`,
      ];
    return [
      head,
      `r = \\frac{v}{\\omega} = \\frac{${g(cmd.v)}}{${g(cmd.w)}} = ${g(r)}\\ \\text{m}, \\qquad \\omega\\Delta t = ${par(cmd.w)} \\times ${g(cmd.dt)} = ${g(wdt)}\\ \\text{rad}, \\qquad \\theta + \\omega\\Delta t = ${g(th2)}`,
      `x' = x - r\\sin\\theta + r\\sin(\\theta + \\omega\\Delta t) = ${g(from.x)} - ${par(r)}\\sin(${g(th)}) + ${par(r)}\\sin(${g(th2)}) = \\mathbf{${fx(to.x)}}\\ \\text{m}`,
      `y' = y + r\\cos\\theta - r\\cos(\\theta + \\omega\\Delta t) = ${g(from.y)} + ${par(r)}\\cos(${g(th)}) - ${par(r)}\\cos(${g(th2)}) = \\mathbf{${fx(to.y)}}\\ \\text{m}`,
      `\\theta' = \\theta + \\omega\\Delta t + \\gamma\\Delta t = ${g(th)} ${wdt < 0 ? '-' : '+'} ${g(Math.abs(wdt))} ${cmd.g * cmd.dt < 0 ? '-' : '+'} ${g(Math.abs(cmd.g * cmd.dt))} = \\mathbf{${g(to.theta)}}\\ \\text{rad}`,
    ];
  })();
  const dFormula = useDeferredValue(formula.join('\u0001'));

  const formulaCard = (
    <div className="models-panel">
      <div className="models-head">
        <h4 style={{ margin: 0 }}>Command {j + 1} by hand</h4>
        <span className="models-hint">{j === 0 ? 'from the start pose' : `from the pose where command ${j} ended`}: θ = {g(th, 4)} rad</span>
      </div>
      <div className="models-formula">
        {dFormula.split('\u0001').map((t, i) => (
          <div key={i} className="models-formula-row">
            <TeX display={i > 0}>{t}</TeX>
          </div>
        ))}
      </div>
      {cmd.v === 0 && !straight && <Rich className="note" text="$v = 0$ gives $r = 0$: the two sine (and cosine) terms vanish and only the heading changes: a turn on the spot." />}
    </div>
  );

  // ---------------------------------------------------------------- controls
  const sigmaV = Math.sqrt(alphas[0] * cmd.v ** 2 + alphas[1] * cmd.w ** 2);
  const sigmaW = Math.sqrt(alphas[2] * cmd.v ** 2 + alphas[3] * cmd.w ** 2);
  const sigmaG = Math.sqrt(alphas[4] * cmd.v ** 2 + alphas[5] * cmd.w ** 2);
  const setAlpha = (k: number, v: number) => setAlphas((a) => a.map((x, i) => (i === k ? v : x)) as Alphas);
  const preset = PRESETS.find((p) => p.id === presetId);

  const chainPanel = (
    <section className="models-panel">
      <div className="models-head">
        <h4 style={{ margin: 0 }}>Commands</h4>
        <Select
          label="Preset"
          value={presetId === 'custom' ? 'custom' : presetId}
          onChange={(v) => v !== 'custom' && load(v)}
          options={[...PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(presetId === 'custom' ? [{ value: 'custom', label: 'Your own' }] : [])]}
        />
      </div>
      <div className="models-bar small">
        <span className="models-label">start</span>
        <label className="models-bar" style={{ gap: 4 }}>
          x <NumField label="start x (m)" value={start.x} step={0.1} onChange={(x) => (setStart((s) => ({ ...s, x })), setPresetId('custom'))} />
        </label>
        <label className="models-bar" style={{ gap: 4 }}>
          y <NumField label="start y (m)" value={start.y} step={0.1} onChange={(y) => (setStart((s) => ({ ...s, y })), setPresetId('custom'))} />
        </label>
        <label className="models-bar" style={{ gap: 4 }}>
          θ <NumField label="start heading (rad)" value={start.theta} step={0.05} onChange={(t) => (setStart((s) => ({ ...s, theta: t })), setPresetId('custom'))} />
        </label>
      </div>
      <div className="models-table-wrap">
        <table className="models-table">
          <thead>
            <tr>
              <th>#</th>
              <th title="Forward speed (m/s)">v</th>
              <th title="Turn rate (rad/s), + is anticlockwise">ω</th>
              <th title="How long the command is held (s)">Δt</th>
              <th title="Final rotation rate γ (rad/s); 0 in the exam">γ</th>
              <th title="Signed radius v/ω (m)">r</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cmds.map((c, k) => (
              <tr key={k} className={`is-click ${k === j ? 'is-sel' : ''}`} onClick={() => setSel(k)}>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => (e.stopPropagation(), setSel(k))} aria-label={`Select command ${k + 1}`}>
                    {k + 1}
                  </button>
                </td>
                <td>
                  <NumField label={`v of command ${k + 1}`} value={c.v} step={0.1} min={-3} max={3} onChange={(v) => editCmd(k, { v })} />
                </td>
                <td>
                  <NumField label={`ω of command ${k + 1}`} value={c.w} step={0.05} min={-3} max={3} onChange={(w) => editCmd(k, { w })} />
                </td>
                <td>
                  <NumField label={`Δt of command ${k + 1}`} value={c.dt} step={0.5} min={0} max={20} onChange={(dt) => editCmd(k, { dt })} />
                </td>
                <td>
                  <NumField label={`γ of command ${k + 1}`} value={c.g} step={0.05} min={-2} max={2} onChange={(gm) => editCmd(k, { g: gm })} />
                </td>
                <td>{Math.abs(c.w) < 1e-9 ? '∞' : sig(c.v / c.w, 3)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={cmds.length <= 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCmds((cs) => cs.filter((_, i) => i !== k));
                      setSel((s) => Math.max(0, Math.min(s, cmds.length - 2)));
                      setPresetId('custom');
                    }}
                    aria-label={`Remove command ${k + 1}`}
                    title="Remove"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="models-bar">
        <Button
          size="sm"
          disabled={cmds.length >= 5}
          onClick={() => {
            setCmds((cs) => [...cs, { v: 1, w: cs.length % 2 ? 0.4 : -0.4, dt: 2, g: 0 }]);
            setSel(cmds.length);
            setPresetId('custom');
          }}
        >
          + Add a command
        </Button>
        <span className="small muted">Click a row to edit it with the sliders and see its working.</span>
      </div>
      <div className="small models-mono" style={{ lineHeight: 1.6 }}>
        {poses.map((p, k) => (
          <div key={k} style={k === j + 1 ? { fontWeight: 700 } : undefined}>
            {k === 0 ? 'start   ' : `after ${k} `}({fx(p.x)}, {fx(p.y)}) m, θ = {fx(p.theta)} rad
          </div>
        ))}
      </div>
      {preset && <Rich className="note" text={preset.note} />}
    </section>
  );

  const sliderPanel = (
    <section className="models-panel">
      <h4>Command {j + 1}</h4>
      <div className="models-sliders">
        <Slider label="forward speed" tex="v" tip="Commanded forward speed (m/s)" value={cmd.v} min={0} max={2} step={0.05} unit="m/s" onChange={(v) => editCmd(j, { v })} />
        <Slider label="turn rate" tex="\omega" tip="Commanded turn rate (rad/s); positive turns left (anticlockwise)" value={cmd.w} min={-1.5} max={1.5} step={0.01} unit="rad/s" onChange={(w) => editCmd(j, { w: Math.abs(w) < 0.005 ? 0 : w })} />
        <Slider label="duration" tex="\Delta t" tip="How long the command is held (s)" value={cmd.dt} min={0.1} max={8} step={0.1} unit="s" onChange={(dt) => editCmd(j, { dt })} />
        <Slider label="final rotation" tex="\gamma" tip="Extra rotation rate applied at the end (rad/s). It changes only the heading; 0 in the exam questions." value={cmd.g} min={-0.5} max={0.5} step={0.01} unit="rad/s" onChange={(gm) => editCmd(j, { g: gm })} />
      </div>
      <Readouts min={120}>
        <Readout tex="r = v/\omega" value={straight ? undefined : r} text={straight ? '∞ (straight)' : undefined} unit="m" tip="Signed radius: negative means the arc bends clockwise" tone="m1" />
        <Readout tex="\omega\Delta t" value={wdt} unit="rad" tip="Heading change over the command" />
        <Readout label="in degrees" value={wdt * DEG} unit="°" tip="Only for intuition: the formulas need radians" />
        <Readout tex="v\Delta t" value={cmd.v * cmd.dt} unit="m" tip="Distance driven along the arc" />
        <Readout label="chord" value={Math.hypot(to.x - from.x, to.y - from.y)} unit="m" tip="Straight-line distance from start to end: shorter than vΔt on a curve" />
        <Readout tex="\theta'" value={to.theta} unit="rad" tip="End heading (not wrapped, as in the papers)" />
      </Readouts>
    </section>
  );

  const noisePanel = (
    <section className="models-panel">
      <div className="models-head">
        <h4 style={{ margin: 0 }}>Noise: sampled end poses</h4>
        <Toggle checked={cloud} onChange={setCloud} label="Show the cloud" />
      </div>
      <div className="models-bar">
        <Segmented
          size="sm"
          label="Noise preset"
          value={NOISE.find((n) => n.a.every((x, i) => x === alphas[i]))?.id ?? ''}
          onChange={(id) => {
            const n = NOISE.find((q) => q.id === id);
            if (n) setAlphas(n.a);
            setCloud(true);
          }}
          options={NOISE.map((n) => ({ value: n.id, label: n.label, title: n.title }))}
        />
      </div>
      <div className="models-sliders">
        {(['\\alpha_1', '\\alpha_2', '\\alpha_3', '\\alpha_4', '\\alpha_5', '\\alpha_6'] as const).map((t, k) => (
          <Slider
            key={k}
            label=""
            tex={t}
            tip={
              [
                'α1: speed noise that grows with v² (spreads poses ALONG the arc)',
                'α2: speed noise that grows with ω²',
                'α3: turn-rate noise that grows with v² (bends poses ACROSS the arc)',
                'α4: turn-rate noise that grows with ω²',
                'α5: final-rotation (γ) noise from v²: changes only the heading',
                'α6: final-rotation (γ) noise from ω²: changes only the heading',
              ][k]
            }
            value={alphas[k]}
            min={0}
            max={0.1}
            step={0.001}
            format={(v) => v.toFixed(3)}
            onChange={(v) => (setAlpha(k, v), setCloud(true))}
          />
        ))}
      </div>
      <div className="models-sd">
        <TeX>{`\\sigma_{\\hat v} = \\sqrt{\\alpha_1 v^2 + \\alpha_2\\omega^2} = ${fx(sigmaV, 3)}\\ \\text{m/s},\\ \\ \\sigma_{\\hat\\omega} = ${fx(sigmaW, 3)}\\ \\text{rad/s},\\ \\ \\sigma_{\\hat\\gamma} = ${fx(sigmaG, 3)}\\ \\text{rad/s}`}</TeX>
      </div>
      <div className="models-bar">
        <Segmented size="sm" label="Samples" value={nSamples} onChange={setNSamples} options={[200, 500, 1500].map((n) => ({ value: n, label: `${n}` }))} />
        <Button size="sm" onClick={() => (setSeed((s) => s + 1), setCloud(true))}>
          Resample
        </Button>
        <Toggle checked={headings} onChange={setHeadings} label="Headings" />
      </div>
      <Rich
        className="note"
        text="Each sample draws its own $\hat v$, $\hat\omega$ and $\hat\gamma$ and drives the exact arc (Thrun Table 5.3). This is how a particle filter’s prediction step moves its particles: the cloud is $p(x_t \mid u_t, x_{t-1})$, and it grows with every command."
      />
    </section>
  );

  const mistakesPanel = (
    <section className="models-panel">
      <h4>Classic mistakes, drawn</h4>
      <div className="models-bar">
        <Toggle checked={ghostDeg} onChange={setGhostDeg} label="Calculator in degrees" />
        <Toggle checked={ghostCarry} onChange={setGhostCarry} label="θ not carried to the next command" />
        <Toggle checked={ghostAbs} onChange={setGhostAbs} label="Sign of r dropped when ω < 0" />
      </div>
      <Rich
        className="note"
        text={`Each ghost is where that slip puts the robot. ${cmds.length < 2 ? '“θ not carried” needs two or more commands. ' : ''}${cmds.some((c) => c.w < 0) ? '' : '“Sign of r” needs a command with $\\omega < 0$. '}Load **2023 Q32** to see all three.`}
      />
    </section>
  );

  const q32 = chainPoses(PRESETS[0].start, PRESETS[0].cmds);
  const predictions = (
    <section className="models-panel">
      <h4>Predict, then check</h4>
      <PredictReveal
        id="models-vel-flip-omega"
        question="Tight left turn ($v = 1$ m/s, $\omega = 0.8$ rad/s, 3 s). You flip the sign of $\omega$ to $-0.8$ rad/s. What happens to the arc?"
        options={[
          'It mirrors: the same 1.25 m radius, but it bends clockwise round a centre on the robot’s right',
          'The robot drives backwards round the same circle',
          'The radius becomes −1.25 m, so the robot reverses along a straight line',
          'Nothing: the radius depends only on |ω|',
        ]}
        answer={0}
        explain="$r = v/\omega = -1.25$ m: the size is the same, the sign puts the centre on the other side ($x_c = x - r\sin\theta$, $y_c = y + r\cos\theta$), so the robot still drives forwards but turns right. Keep that sign in the formula: dropping it is the “sign of r” ghost."
        tryIt="load the tight left turn, then drag ω to −0.8."
        onApply={() => {
          const p = presetById('turn');
          setPresetId('custom');
          setStart(p.start);
          setCmds([{ v: 1, w: -0.8, dt: 3, g: 0 }]);
          setSel(0);
          setView(fitView([{ x: -1.4, y: -2.6 }, { x: 1.4, y: 2.6 }], ASPECT, 0.4, 3));
        }}
      />
      <PredictReveal
        id="models-vel-omega-zero"
        question="Keep $v$ fixed and slide $\omega$ down to 0. What happens to the centre of rotation?"
        options={[
          'It runs off to infinity: r = v/ω grows without bound and the arc straightens into a line',
          'It moves onto the robot: the robot spins on the spot',
          'It stays where it is and the arc just gets shorter',
        ]}
        answer={0}
        explain="$r = v/\omega \to \infty$ as $\omega \to 0$, so the circle flattens into a straight line. The arc formula then divides by zero: use $x' = x + v\Delta t\cos\theta$, $y' = y + v\Delta t\sin\theta$ instead (summary notes §3). Spinning on the spot is the other limit, $v = 0$ ($r = 0$)."
        tryIt="drag ω slowly towards 0 and watch the centre leave the view."
        onApply={() => {
          const p = presetById('straight');
          setPresetId('straight');
          setStart(p.start);
          setCmds(p.cmds.map((c) => ({ ...c })));
          setSel(0);
          setView(viewFor(p.start, p.cmds));
        }}
      />
      <PredictReveal
        id="models-vel-review"
        question="Review deck: from $(0, 0, 0)$, $v = 0.8$ m/s and $\omega = 0.03$ rad/s for 2 s. Where does the robot end up?"
        options={['(1.599, 0.048) m, heading 0.06 rad: almost straight ahead', '(1.6, 0) m, heading 0: exactly straight', '(0.048, 1.599) m, heading 0.06 rad', '(26.67, 0) m, heading 0.06 rad']}
        answer={0}
        explain="$r = 0.8/0.03 = 26.67$ m and $\omega\Delta t = 0.06$ rad. $x' = 26.67\sin 0.06 = 1.5990$ m, $y' = 26.67(1 - \cos 0.06) = 0.04799$ m, $\theta' = 0.06$ rad. The huge radius makes it a gentle curve: 1.6 m forward and under 5 cm to the left."
        tryIt="load the review-deck preset and read the formula card."
        onApply={() => load('review')}
      />
      <PredictReveal
        id="models-vel-gamma-noise"
        question="Turn up only $\alpha_5$ and $\alpha_6$ (noise on the final rotation $\gamma$). What happens to the cloud of end **positions**?"
        options={['Nothing: only the end headings fan out', 'It stretches along the arc', 'It bends into a banana across the arc', 'It grows into a round blob']}
        answer={0}
        explain="$\gamma$ is applied after the arc ($\theta' = \theta + \omega\Delta t + \gamma\Delta t$) and does not move the robot: the positions stay on the noise-free end point while the heading ticks spread. $\gamma$ exists so that the three noisy controls can reach any $(x', y', \theta')$; without it every end pose would lie on a 2-D surface in pose space."
        tryIt="pick the “Final turn (α5, α6)” noise preset with headings on."
        onApply={() => {
          setAlphas(NOISE.find((n) => n.id === 'gamma')!.a);
          setCloud(true);
          setHeadings(true);
        }}
      />
      <PredictReveal
        id="models-vel-banana"
        question="Which noise turns the cloud of end poses into a curved **banana** across the direction of travel?"
        options={['Noise on the turn rate ω (α3, α4)', 'Noise on the speed v (α1, α2)', 'Noise on the final rotation γ (α5, α6)']}
        answer={0}
        explain="A sample with a slightly larger $\hat\omega$ curls further round; a smaller one runs wider. The end points spread sideways along a curve, and further on the longer the command lasts. Speed noise only slides the end point forwards and backwards along the same arc; $\gamma$ noise only turns the heading."
        tryIt="pick “Turn rate (α3, α4)”, then compare with “Speed (α1, α2)”."
        onApply={() => {
          load('sbend');
          setAlphas(NOISE.find((n) => n.id === 'rot')!.a);
          setCloud(true);
        }}
      />
      <PredictReveal
        id="models-vel-carry"
        question={`2023 Q32: if you start command 2 with $\\theta = 0$ instead of carrying $\\theta_1 = 0.3$ rad, where does the robot end up?`}
        options={['Clearly off: the second arc starts pointing the wrong way', 'Exactly the same place: the heading cancels out', 'The same position with a different heading']}
        answer={0}
        explain={`Command 2 starts at the end of command 1, **including its heading**. Restarting it at $\\theta = 0$ rotates the whole second arc by 0.3 rad, ending at (${fx(applyCmd({ ...q32[1], theta: 0 }, PRESETS[0].cmds[1]).x, 3)}, ${fx(applyCmd({ ...q32[1], theta: 0 }, PRESETS[0].cmds[1]).y, 3)}) instead of (${fx(q32[2].x, 3)}, ${fx(q32[2].y, 3)}).`}
        tryIt="load 2023 Q32 and switch on “θ not carried”."
        onApply={() => {
          load('q32');
          setGhostCarry(true);
        }}
      />
    </section>
  );

  return (
    <div className="models-sim">
      <div className="models-layout">
        <div className="models-left">
          {world}
          <div style={{ marginTop: 12 }}>{formulaCard}</div>
        </div>
        <div className="models-right">
          {chainPanel}
          {sliderPanel}
          {noisePanel}
          {mistakesPanel}
          {predictions}
        </div>
      </div>
      <More label="Conventions used here (the course’s)">
        <Rich
          text={`- Pose $(x, y, \\theta)$ with $\\theta$ anticlockwise from $+x$ in **radians**; $\\omega > 0$ turns left. The heading is **not wrapped**, so chained answers match the papers ($0.3 - 0.4 = -0.1$).
- $x' = x - \\frac{v}{\\omega}\\sin\\theta + \\frac{v}{\\omega}\\sin(\\theta + \\omega\\Delta t)$, $y' = y + \\frac{v}{\\omega}\\cos\\theta - \\frac{v}{\\omega}\\cos(\\theta + \\omega\\Delta t)$, $\\theta' = \\theta + \\omega\\Delta t + \\gamma\\Delta t$. The centre of rotation is $(x - r\\sin\\theta,\\ y + r\\cos\\theta)$ with $r = v/\\omega$.
- Multi-step: compute $r$ and $\\omega\\Delta t$ first, keep the sign of $r$, and start each command from the pose (heading included) where the last one ended.
- Noise (Thrun Table 5.3): $\\hat v = v + \\varepsilon(\\alpha_1 v^2 + \\alpha_2\\omega^2)$, $\\hat\\omega = \\omega + \\varepsilon(\\alpha_3 v^2 + \\alpha_4\\omega^2)$, $\\hat\\gamma = \\varepsilon(\\alpha_5 v^2 + \\alpha_6\\omega^2)$, where $\\varepsilon(b^2)$ is zero-mean noise with variance $b^2$.`}
        />
      </More>
    </div>
  );
}

/** For the self-tests. */
export const _velocity = { chainPoses, degMode, PRESETS, sampleCmd, viewFor };
export type { Cmd as VelocityCmd };
