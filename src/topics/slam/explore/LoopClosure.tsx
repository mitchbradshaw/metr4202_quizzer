// Drift and loop closure (summary notes §4 "data association and loop closure"; 2024 Q23, 2025 Q23 worked solutions;
// review deck learning outcomes). A robot drives round a ring corridor on noisy odometry. Its pose graph (nodes =
// poses, edges = odometry) drifts from the truth and the 95 % ellipses grow. Back at the start, place recognition
// either adds the right constraint (Gauss–Newton pulls every pose back, the map snaps), misses it (drift keeps
// growing, the corridor is mapped twice) or matches a look-alike place (the map warps and the ellipses shrink round
// the wrong answer: overconfident). Optimisation and marginals come from core/slamgraph.ts.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { deadReckon, ellipseOf, lerpCov, lerpPose, mahal2, marginals, optimise, propagate, type Cov3, type Pose2, type PoseEdge } from '../../../core/slamgraph';
import { Button, More, Readout, Readouts, Segmented, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { StepControls, useStepper } from '../../../ui/stepper';
import { Area, Line, Plot, VLine } from '../../../plot/Plot';
import { useRaf, useWidth } from '../../../anim/hooks';
import { useThemeColors } from '../../../ui/theme';
import { revealEl, useStickyFit } from './slamCommon';
import { DEFAULT_SEED, J_FALSE, K_CLOSE, LH, LW, RING, SCANS, STEP, TRUTH, makeDrive } from './loopWorld';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'loop',
  title: 'Drift and loop closure',
  summary:
    'A robot drives round a ring corridor on noisy odometry. Its pose graph (nodes are poses, edges are odometry) drifts from the truth while the uncertainty grows. Back at the start, a loop-closure edge and a Gauss–Newton solve pull every pose back and the map snaps into shape. Then miss the closure, or accept a false one at a look-alike place.',
  notice:
    'On odometry alone the estimate drifts and its uncertainty builds up; a correct loop closure pulls every pose back and shrinks the ellipses, but a false closure shrinks them too, round a warped map: overconfident.',
  minutes: 10,
};

type Mode = 'correct' | 'missed' | 'false';
const MODES: { value: Mode; label: string; title: string }[] = [
  { value: 'correct', label: 'Correct closure', title: 'Back at the start, the scan is matched with node 0' },
  { value: 'missed', label: 'Missed closure', title: 'Back at the start, the place is not recognised' },
  { value: 'false', label: 'False closure', title: 'The scan is matched with a look-alike place 5 m further on' },
];
const K = TRUTH.length - 1;
const ANIM_S = 1.9;
const CHI95 = 5.991;
const START_AT = 36;

interface Opt {
  iterates: Pose2[][];
  chi2: number[];
  poses: Pose2[];
  covs: Cov3[];
  edge: PoseEdge;
}

const COLOR_VARS = ['--text', '--text-2', '--text-3', '--m2', '--m3', '--m4', '--ok', '--bad', '--surface'] as const;
type Colors = Record<(typeof COLOR_VARS)[number], string>;

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const errOf = (p: Pose2, k: number) => Math.hypot(p.x - TRUTH[k].x, p.y - TRUTH[k].y);

export default function LoopClosure() {
  const [mode, setMode] = useState<Mode>('correct');
  const [rotDeg, setRotDeg] = useState(1);
  const [transPct, setTransPct] = useState(2);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [applied, setApplied] = useState(false);
  const [showTruth, setShowTruth] = useState(true);
  const [showEll, setShowEll] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [animating, setAnimating] = useState(false);
  const anim = useRef(0);
  const st = useStepper(K, { speed: 8, start: START_AT });
  const rootRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [wrapRef, cssW] = useWidth<HTMLDivElement>(700);
  const colors = useThemeColors(COLOR_VARS) as Colors;
  const unstuck = useStickyFit(leftRef);

  // ---------------------------------------------------------------- the estimate
  const drive = useMemo(() => makeDrive({ rot: (rotDeg * Math.PI) / 180, trans: transPct / 100, seed }), [rotDeg, transPct, seed]);
  // Drift at the return for 1° and 2° of heading noise on the default sample (quoted by the noise prediction).
  const drift12 = useMemo(() => [1, 2].map((deg) => errOf(makeDrive({ rot: (deg * Math.PI) / 180, trans: 0.02, seed: DEFAULT_SEED }).dr[K_CLOSE], K_CLOSE)), []);
  const drCov = useMemo(() => propagate(drive.dr, drive.us, drive.infos), [drive]);
  const opt = useMemo<Opt | null>(() => {
    if (!applied || mode === 'missed') return null;
    const edge = mode === 'correct' ? drive.trueClosure : drive.falseClosure;
    const edges = [...drive.odoEdges.slice(0, K_CLOSE), edge];
    const r = optimise(drive.dr.slice(0, K_CLOSE + 1), edges);
    const M = marginals(r.poses, edges);
    const tailU = drive.us.slice(K_CLOSE);
    const cont = deadReckon(r.poses[K_CLOSE], tailU);
    const contCov = propagate(cont, tailU, drive.infos.slice(K_CLOSE), M[K_CLOSE]);
    return { iterates: r.iterates, chi2: r.chi2, poses: [...r.poses, ...cont.slice(1)], covs: [...M, ...contCov.slice(1)], edge };
  }, [applied, mode, drive]);
  // The tween follows the Gauss–Newton iterates, timed by how far the poses move in each.
  const tween = useMemo(() => {
    if (!opt) return null;
    const its = opt.iterates;
    const lens: number[] = [];
    for (let k = 1; k < its.length; k++) {
      let d = 0;
      for (let n = 0; n < its[k].length; n++) d += (its[k][n].x - its[k - 1][n].x) ** 2 + (its[k][n].y - its[k - 1][n].y) ** 2;
      lens.push(Math.sqrt(d) + 1e-9);
    }
    return { its, lens, total: lens.reduce((a, b) => a + b, 0) };
  }, [opt]);

  const i = st.i;
  const closedNow = !!opt && i >= K_CLOSE;
  const est = closedNow && opt ? opt.poses : drive.dr;
  const cov = closedNow && opt ? opt.covs : drCov;

  // Pause at the return so the closure decision is the student's.
  const prevI = useRef(i);
  useEffect(() => {
    const was = prevI.current;
    prevI.current = i;
    if (mode !== 'missed' && !applied && was < K_CLOSE && i >= K_CLOSE) {
      st.pause();
      st.setI(K_CLOSE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // "Show me" that should start playing after a jump: play() reads the step index of the render it was made in.
  const pendingPlay = useRef(false);
  useEffect(() => {
    if (pendingPlay.current) {
      pendingPlay.current = false;
      st.play();
    }
  });

  const resetClosure = () => {
    setApplied(false);
    setAnimating(false);
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    resetClosure();
  };
  /** "Show me" quotes numbers for the default noise and sample, so it puts those back first. */
  const defaults = () => {
    setRotDeg(1);
    setTransPct(2);
    setSeed(DEFAULT_SEED);
  };
  const apply = () => {
    st.pause();
    st.setI(K_CLOSE);
    setApplied(true);
    anim.current = 0;
    setAnimating(true);
    revealEl(leftRef.current, '.slam-lc-map');
  };

  // ---------------------------------------------------------------- drawing
  const view = useRef({ i, est, cov, closedNow, opt, showTruth, showEll, showMap, colors, cssW, drive, drCov, tween });
  view.current = { i, est, cov, closedNow, opt, showTruth, showEll, showMap, colors, cssW, drive, drCov, tween };

  const draw = (u: number | null) => {
    const c = cv.current;
    if (!c) return;
    const v = view.current;
    const W = v.cssW;
    const H = Math.round((W * LH) / LW);
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const k = W / LW;
    const X = (x: number) => x * k;
    const Y = (y: number) => H - y * k;
    const col = v.colors;
    const n = v.i;
    // Poses and covariances to show (mid-animation: along the Gauss–Newton iterates).
    let poses = v.est;
    let covs = v.cov;
    const animOn = u !== null && v.opt && v.tween;
    if (animOn && v.opt && v.tween) {
      const tw = v.tween;
      let s = ease(u) * tw.total;
      let seg = 0;
      while (seg < tw.lens.length - 1 && s > tw.lens[seg]) {
        s -= tw.lens[seg];
        seg++;
      }
      const f = tw.lens.length ? Math.min(1, s / tw.lens[seg]) : 1;
      const A = tw.its[seg];
      const B = tw.its[Math.min(tw.its.length - 1, seg + 1)];
      const mid = A.map((p, q) => lerpPose(p, B[q], f));
      poses = [...mid, ...v.drive.dr.slice(mid.length)];
      const e = ease(u);
      covs = v.drCov.map((S, q) => (q < v.opt!.covs.length ? lerpCov(S, v.opt!.covs[q], e) : S));
    }
    const showClosure = (v.closedNow || animOn) && v.opt;
    // truth: walls and path
    if (v.showTruth) {
      ctx.strokeStyle = col['--text-3'];
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const g of RING.segs) {
        ctx.moveTo(X(g.ax), Y(g.ay));
        ctx.lineTo(X(g.bx), Y(g.by));
      }
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let q = 0; q <= n; q++) (q ? ctx.lineTo : ctx.moveTo).call(ctx, X(TRUTH[q].x), Y(TRUTH[q].y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // the map: every node's scan placed at its ESTIMATED pose
    if (v.showMap) {
      for (let q = 0; q <= n; q++) {
        const p = poses[q];
        const pts = SCANS[q];
        const cth = Math.cos(p.th);
        const sth = Math.sin(p.th);
        ctx.fillStyle = q >= K_CLOSE ? col['--m2'] : col['--text-2'];
        ctx.globalAlpha = q >= K_CLOSE ? 0.95 : 0.6;
        for (let m = 0; m < pts.length; m += 2) {
          const wx = p.x + cth * pts[m] - sth * pts[m + 1];
          const wy = p.y + sth * pts[m] + cth * pts[m + 1];
          ctx.fillRect(X(wx) - 1, Y(wy) - 1, 2.2, 2.2);
        }
      }
      ctx.globalAlpha = 1;
    }
    // the estimate before the closure, and how far each pose moved
    if (showClosure) {
      const dr = v.drive.dr;
      ctx.strokeStyle = col['--m3'];
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let q = 0; q <= Math.min(n, K_CLOSE); q++) (q ? ctx.lineTo : ctx.moveTo).call(ctx, X(dr[q].x), Y(dr[q].y));
      ctx.stroke();
      ctx.setLineDash([]);
      // how far each pose moved: only while the closure is being solved and while the robot waits at the return
      if (animOn || n === K_CLOSE) {
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let q = 1; q <= Math.min(n, K_CLOSE); q++) {
          ctx.moveTo(X(dr[q].x), Y(dr[q].y));
          ctx.lineTo(X(poses[q].x), Y(poses[q].y));
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 95 % ellipses
    if (v.showEll) {
      ctx.strokeStyle = col['--m3'];
      ctx.fillStyle = col['--m3'];
      ctx.lineWidth = 1;
      for (let q = 2; q <= n; q += 2) {
        const e = ellipseOf(covs[q]);
        if (e.a * k < 0.8) continue;
        ctx.beginPath();
        ctx.ellipse(X(poses[q].x), Y(poses[q].y), e.a * k, Math.max(0.5, e.b * k), -e.angle, 0, 2 * Math.PI);
        ctx.globalAlpha = 0.06;
        ctx.fill();
        ctx.globalAlpha = q === n ? 0.95 : 0.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // the estimated trajectory: nodes and odometry edges
    ctx.strokeStyle = col['--m3'];
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let q = 0; q <= n; q++) (q ? ctx.lineTo : ctx.moveTo).call(ctx, X(poses[q].x), Y(poses[q].y));
    ctx.stroke();
    ctx.fillStyle = col['--m3'];
    for (let q = 0; q <= n; q++) {
      ctx.beginPath();
      ctx.arc(X(poses[q].x), Y(poses[q].y), 2.4, 0, 2 * Math.PI);
      ctx.fill();
    }
    // the loop-closure edge
    if (showClosure && v.opt) {
      const ed = v.opt.edge;
      const ok = ed.i === 0;
      const a = poses[ed.i];
      const b = poses[ed.j];
      ctx.strokeStyle = ok ? col['--ok'] : col['--bad'];
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(X(a.x), Y(a.y));
      ctx.lineTo(X(b.x), Y(b.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ok ? `✓ loop closure (node ${ed.j} ↔ node 0)` : `✗ false closure (node ${ed.j} ↔ node ${ed.i})`, X((a.x + b.x) / 2), Y(Math.max(a.y, b.y)) - 24);
    }
    // start (anchor), true robot and estimated robot
    ctx.fillStyle = col['--text'];
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillRect(X(TRUTH[0].x) - 3.5, Y(TRUTH[0].y) - 3.5, 7, 7);
    ctx.fillText('start: node 0 (anchored)', X(TRUTH[0].x) + 7, Y(TRUTH[0].y) + 16);
    if (v.showTruth) tri(ctx, X(TRUTH[n].x), Y(TRUTH[n].y), TRUTH[n].th, 9, col['--text-3'], false);
    tri(ctx, X(poses[n].x), Y(poses[n].y), poses[n].th, 10, col['--m3'], true, col['--surface']);
  };

  useLayoutEffect(() => {
    if (!animating) draw(null);
  });
  useRaf(
    (dt) => {
      anim.current = Math.min(1, anim.current + dt / ANIM_S);
      draw(anim.current);
      if (anim.current >= 1) setAnimating(false);
    },
    animating,
    rootRef
  );

  // ---------------------------------------------------------------- numbers for node i
  const err = errOf(est[i], i);
  const hErr = Math.abs(((est[i].th - TRUTH[i].th + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
  const r95 = ellipseOf(cov[i]).a;
  let inside = 0;
  for (let q = 1; q <= i; q++) if (mahal2(cov[q], est[q].x - TRUTH[q].x, est[q].y - TRUTH[q].y) < CHI95) inside++;
  const chiNow = closedNow && opt ? opt.chi2[opt.chi2.length - 1] : null;
  const driftAtReturn = errOf(drive.dr[K_CLOSE], K_CLOSE);

  const plot = useMemo(() => {
    const e: [number, number][] = [];
    const r: [number, number][] = [];
    const e0: [number, number][] = [];
    const r0: [number, number][] = [];
    for (let q = 0; q <= i; q++) {
      const d = q * STEP;
      e.push([d, errOf(est[q], q)]);
      r.push([d, ellipseOf(cov[q]).a]);
      if (closedNow) {
        e0.push([d, errOf(drive.dr[q], q)]);
        r0.push([d, ellipseOf(drCov[q]).a]);
      }
    }
    let top = 1;
    for (const s of [e, r, e0, r0]) for (const p of s) top = Math.max(top, p[1]);
    return { e, r, e0, r0, ymax: Math.ceil(top * 2 + 0.2) / 2 };
  }, [i, est, cov, closedNow, drive, drCov]);

  // ---------------------------------------------------------------- the event at the return
  const atReturn = i >= K_CLOSE;
  let event: { kind: 'info' | 'ok' | 'false' | 'missed'; title: string; text: string; action?: { label: string; run: () => void } };
  if (!atReturn)
    event = {
      kind: 'info',
      title: `Driving on odometry alone: node ${i} of ${K_CLOSE} round the loop`,
      text: `Every odometry edge adds a little noise and nothing takes it away, so the estimate (green) drifts from the truth (dashed) and the 95 % ellipses build up. Heading errors matter most: each one swings everything after it. Play on to the start.`,
    };
  else if (mode === 'missed')
    event = {
      kind: 'missed',
      title: 'Back at the start, but the place is not recognised',
      text: `The scan at node ${K_CLOSE} is not matched with node 0 (lighting changed, seen from a new angle, or the matcher’s threshold was too strict). No constraint is added, so nothing corrects the drift of **${driftAtReturn.toFixed(2)} m**: the heading uncertainty keeps growing, and the bottom corridor is mapped a second time (orange) beside the first.`,
    };
  else if (mode === 'correct' && !applied)
    event = {
      kind: 'info',
      title: 'Back at the start: place recognised',
      text: `The scan at node ${K_CLOSE} matches the scan stored with node 0. That gives one new edge: “node ${K_CLOSE} is ${drive.trueClosure.z.x.toFixed(2)} m ahead of node 0”, with σ = 5 cm. Dead reckoning says it is **${driftAtReturn.toFixed(2)} m** away.`,
      action: { label: 'Add the loop closure and optimise', run: apply },
    };
  else if (mode === 'correct')
    event = {
      kind: 'ok',
      title: 'Loop closed',
      text: `${opt ? opt.iterates.length - 1 : 0} Gauss–Newton iterations: $\\chi^2$ went from ${opt ? opt.chi2[0].toFixed(0) : '—'} to **${chiNow !== null ? chiNow.toFixed(2) : '—'}**, close to the 3 expected from one redundant 3-D constraint. Every pose moved (thin lines), the most near the end; the ellipses shrank, most at the end, least half-way round.`,
      action: { label: 'Undo the closure', run: resetClosure },
    };
  else if (!applied)
    event = {
      kind: 'false',
      title: 'Place recognised… at the wrong place',
      text: `The scan at node ${K_CLOSE} (alcove + pillar) matches node ${J_FALSE} best: the identical alcove and pillar **5 m further along** the corridor (perceptual aliasing). The robot cannot tell them apart.`,
      action: { label: 'Accept the match and optimise', run: apply },
    };
  else
    event = {
      kind: 'false',
      title: 'False closure accepted: the map warps',
      text: `The optimiser forced node ${K_CLOSE} onto node ${J_FALSE}’s place. The trajectory bends to fit, the corridor walls no longer line up, and the ellipses shrank anyway: only **${inside} of ${i}** true poses are inside them (overconfident). $\\chi^2 =$ **${chiNow !== null ? chiNow.toFixed(0) : '—'}**, far above the 3 expected: the warning a robust back-end uses to reject a closure.`,
      action: { label: 'Remove the false closure', run: resetClosure },
    };

  const H = Math.round((cssW * LH) / LW);

  // ---------------------------------------------------------------- layout
  const left = (
    <div className={`slam-left slam-panel${unstuck ? ' is-unstuck' : ''}`} ref={leftRef}>
      <div ref={wrapRef} className="slam-lc-map">
        <canvas ref={cv} className="slam-lc-canvas" style={{ width: cssW, height: H }} role="img" aria-label={`Pose graph after ${i} of ${K} steps: position error ${err.toFixed(2)} m, 95 % radius ${r95.toFixed(2)} m${closedNow ? ', loop closed' : ''}`} />
      </div>
      <div className="slam-legend small">
        <span>
          <i className="slam-sw is-line" style={{ background: 'var(--m3)' }} /> estimate, 95 % ellipses
        </span>
        <span>
          <i className="slam-sw is-dash" style={{ color: 'var(--text-3)' }} /> true path
        </span>
        <span>
          <i className="slam-sw" style={{ background: 'var(--text-2)', width: 6, height: 6 }} /> walls from scans
        </span>
        <span>
          <i className="slam-sw" style={{ background: 'var(--m2)', width: 6, height: 6 }} /> seen again after the loop
        </span>
        <span>
          <i className="slam-sw is-dash" style={{ color: 'var(--ok)' }} /> loop closure
        </span>
        <span>
          <i className="slam-sw is-dash" style={{ color: 'var(--bad)' }} /> false closure
        </span>
      </div>
      <StepControls st={st} label="pose" speeds={[2, 4, 8, 16]} />
      <Plot x={{ min: 0, max: K * STEP, label: 'distance driven (m)' }} y={{ min: 0, max: plot.ymax, label: 'metres' }} height={150} ariaLabel="95 % uncertainty radius and true position error against distance driven">
        <Area points={plot.r} color="var(--m3)" opacity={0.14} />
        <Line points={plot.r} color="var(--m3)" width={2} label="95 % radius" />
        <Line points={plot.e} color="var(--m4)" width={2.2} label="true error" />
        {closedNow && <Line points={plot.r0} color="var(--m3)" width={1.4} dash opacity={0.6} />}
        {closedNow && <Line points={plot.e0} color="var(--m4)" width={1.4} dash opacity={0.6} />}
        <VLine x={K_CLOSE * STEP} label="back at the start" />
      </Plot>
      <div className="slam-legend small">
        <span>
          <i className="slam-sw" style={{ background: 'var(--m3)', opacity: 0.5 }} /> 95 % uncertainty radius (from Σ)
        </span>
        <span>
          <i className="slam-sw is-line" style={{ background: 'var(--m4)' }} /> true position error
        </span>
        {closedNow && (
          <span>
            <i className="slam-sw is-dash" style={{ color: 'var(--text-3)' }} /> without the closure
          </span>
        )}
      </div>
    </div>
  );

  const right = (
    <div className="slam-right">
      <section className={`slam-lc-event ${event.kind === 'false' ? 'is-false' : event.kind === 'missed' ? 'is-missed' : ''}`} aria-live="polite">
        <strong>{event.title}</strong>
        <Rich text={event.text} />
        {event.action && (
          <Button size="sm" variant={event.kind === 'false' && !applied ? 'danger' : 'primary'} onClick={event.action.run}>
            {event.action.label}
          </Button>
        )}
      </section>

      <section className="slam-panel">
        <h4>What happens back at the start</h4>
        <div className="slam-lc-modes">
          <Segmented size="sm" label="Loop closure outcome" value={mode} onChange={changeMode} options={MODES} />
        </div>
        <Rich
          className="note"
          text={
            mode === 'correct'
              ? 'Place recognition matches the right old pose: one extra edge between the newest node and node 0.'
              : mode === 'missed'
                ? 'No match: the graph stays a chain, so nothing can undo the drift.'
                : 'Data association picks the wrong old pose: the alcove and pillar at the start appear again 5 m further on.'
          }
        />
      </section>

      <section className="slam-panel">
        <h4>Odometry noise (per 0.8 m step)</h4>
        <Slider label="heading" tex="\sigma_\theta" tip="Standard deviation of the heading error added at every step. Heading errors swing everything after them, so they dominate drift." value={rotDeg} min={0.2} max={3} step={0.1} unit="°" onChange={(v) => (setRotDeg(v), resetClosure())} format={(v) => `${v.toFixed(1)}°`} />
        <Slider label="distance" tex="\sigma_d" tip="Standard deviation of the distance error, as a percentage of the step (sideways error is half of it)." value={transPct} min={0.5} max={6} step={0.5} unit="%" onChange={(v) => (setTransPct(v), resetClosure())} format={(v) => `${v.toFixed(1)} %`} />
        <div className="slam-bar">
          <Button size="sm" onClick={() => (setSeed((s) => s + 1), resetClosure())} title="Draw a new set of odometry errors with the same standard deviations">
            New noise sample
          </Button>
          {seed !== DEFAULT_SEED && (
            <Button size="sm" variant="ghost" onClick={() => (setSeed(DEFAULT_SEED), resetClosure())}>
              Back to the default sample
            </Button>
          )}
        </div>
        <Rich className="note" text="The graph’s edges carry exactly these standard deviations as their information $\Omega = \text{diag}(1/\sigma^2)$, so the ellipses are honest about odometry." />
      </section>

      <section className="slam-panel">
        <h4>{`Node ${i}${i === K_CLOSE ? ' (back at the start)' : ''}`}</h4>
        <Readouts min={122}>
          <Readout label="distance driven" value={i * STEP} sig={3} unit="m" tip="Odometry steps of 0.8 m so far" />
          <Readout label="position error" value={err} sig={3} unit="m" tip="Distance between the estimate and the true pose (the robot cannot see this)" tone="m4" />
          <Readout label="heading error" value={hErr} sig={2} unit="°" tip="Difference between the estimated and true heading" />
          <Readout label="95 % radius" value={r95} sig={3} unit="m" tip="Semi-major axis of the 95 % ellipse: √(5.991 λmax) of the position covariance" tone="m3" />
          <Readout label="truth inside 95 %" text={i ? `${inside} / ${i}` : '—'} tip="Poses whose true position lies inside their own 95 % ellipse. Honest uncertainty keeps this near 95 %." tone={i > 4 && inside < 0.8 * i ? 'bad' : undefined} />
          <Readout label="χ² after optimising" text={chiNow !== null ? chiNow.toFixed(chiNow < 100 ? 2 : 0) : '—'} tip="Sum of eᵀΩe over all edges at the solution. One loop gives 3 redundant dimensions, so about 3 is expected when every constraint is right." tone={chiNow !== null && chiNow > 15 ? 'bad' : undefined} />
        </Readouts>
        <div className="slam-bar">
          <Toggle checked={showEll} onChange={setShowEll} label="ellipses" />
          <Toggle checked={showMap} onChange={setShowMap} label="map points" />
          <Toggle checked={showTruth} onChange={setShowTruth} label="truth" />
        </div>
      </section>

      <section className="slam-panel">
        <h4>What the optimiser does (graph SLAM)</h4>
        <Rich
          text={`Every edge says where one pose sits relative to another. The optimiser finds the poses that disagree least with all of them at once:
$$\\min_{\\mathbf{x}_{0:t}} \\; \\chi^2 = \\sum_{\\text{edges}} \\mathbf{e}_{ij}^{T}\\,\\Omega_{ij}\\,\\mathbf{e}_{ij}, \\qquad \\mathbf{e}_{ij} = \\big(\\mathbf{x}_i^{-1}\\oplus\\mathbf{x}_j\\big) - \\mathbf{z}_{ij}$$
Gauss–Newton linearises every edge and solves $H\\,\\Delta\\mathbf{x} = -\\mathbf{b}$ for **all** poses together ($H = \\sum J^{T}\\Omega J$). The loop edge touches only two nodes, but the odometry chain couples them all, so the correction is shared out along the chain in proportion to each link’s uncertainty. Each pose’s covariance is its block of $H^{-1}$.

This estimates the whole trajectory, $p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})$: **full SLAM**. A filter that keeps only the latest pose, $p(x_t, m \\mid z_{1:t}, u_{1:t})$, solves online SLAM.`}
        />
      </section>

      <section className="slam-panel slam-predicts">
        <h4>Predict, then check</h4>
        <PredictReveal
          id="slam-lc-unc-before"
          question="Just before the loop is closed, the robot is physically 0.1 m from where it started (node 0, which is anchored). How does the newest pose’s uncertainty compare with node 0’s?"
          options={['About the same: they are in the same place', 'Far larger: 46 m of noisy odometry separate them', 'Smaller: it has had more measurements']}
          answer={1}
          explain="Dead reckoning composes every step’s noise and nothing removes it, so uncertainty grows with the distance **driven**, not with the distance from the start. Node 0 has zero uncertainty; the newest pose is 58 noisy steps away, with a 95 % radius of about 3 m at the default noise (the biggest ellipses are in the last third of the loop), even though it is physically right next to node 0."
          tryIt="step to node 58 without closing the loop and compare the ellipses at the two ends of the bottom corridor."
          onApply={() => {
            changeMode('correct');
            defaults();
            setShowEll(true);
            st.pause();
            st.setI(K_CLOSE);
            revealEl(leftRef.current, '.slam-lc-map');
          }}
        />
        <PredictReveal
          id="slam-lc-who-moves"
          question="The loop-closure edge connects only node 58 and node 0. When the graph is optimised, which poses move?"
          options={['Only node 58', 'Only the nodes near the start', 'Every pose, by more the further along the loop', 'None: only the map is redrawn']}
          answer={2}
          explain="Node 58 cannot move without stretching its odometry edge to node 57, which pulls node 57, and so on: the whole chain bends. Gauss–Newton solves for all poses at once, and the correction grows from zero at the anchored start to the full drift at the end. The map moves with the poses, so it snaps into shape."
          tryIt="close the loop and watch the thin lines from each old pose to its new place."
          onApply={() => {
            changeMode('correct');
            defaults();
            window.setTimeout(apply, 0);
          }}
        />
        <PredictReveal
          id="slam-lc-unc-after"
          question="After the correct closure, where is the uncertainty largest now?"
          options={['Still at the newest pose', 'About half-way round the loop', 'At node 0']}
          answer={1}
          explain="Each pose is now tied to the anchor through **two** chains: the odometry behind it and, via the closure, the odometry ahead of it. Poses near either end have one short chain; half-way round both chains are long, so the ellipses there stay biggest (about 1.1 m at the default noise, down from about 3 m at the end before the closure)."
          tryIt="close the loop and compare the ellipses round the loop, or read the 95 % radius curve."
          onApply={() => {
            changeMode('correct');
            defaults();
            setShowEll(true);
            window.setTimeout(apply, 0);
          }}
        />
        <PredictReveal
          id="slam-lc-missed"
          question="The robot does not recognise the start and drives on into the first corridor. What does the map show?"
          options={['The corridor once, slightly blurred', 'The corridor twice, offset by the drift', 'Nothing new: it has mapped that corridor already']}
          answer={1}
          explain="Without the closure, the new scans are placed at the drifted poses, so the corridor’s walls appear a second time beside the first (orange vs grey), offset by the drift, and nothing will ever pull them together. Duplicated places are the signature of a missed loop closure (2024 Q23)."
          tryIt="choose Missed closure and play to the end."
          onApply={() => {
            changeMode('missed');
            st.pause();
            st.setI(K_CLOSE - 1);
            pendingPlay.current = true;
            revealEl(leftRef.current, '.slam-lc-map');
          }}
        />
        <PredictReveal
          id="slam-lc-false"
          question="The robot matches its scan with the look-alike place 5 m further on and optimises. Afterwards, the 95 % ellipses are…"
          options={['Bigger, and the truth is inside them', 'Smaller, and the truth is inside them', 'Smaller, and the truth is outside them', 'Unchanged']}
          answer={2}
          explain="Any added constraint shrinks the covariance ($H$ only gains information), right or wrong. Here the constraint is wrong, so the map warps and the true poses fall outside their shrunken ellipses: the estimator is **overconfident** and will reject correct measurements later. That is why a false closure is the worst case and hard to undo (2024 Q23, 2025 Q23). The huge $\chi^2$ is the clue robust back-ends use."
          tryIt="choose False closure, accept the match and read 'truth inside 95 %'."
          onApply={() => {
            changeMode('false');
            defaults();
            window.setTimeout(apply, 0);
          }}
        />
        <PredictReveal
          id="slam-lc-noise"
          question="Double the heading noise from 1° to 2° per step. The drift when the robot gets back to the start roughly…"
          options={['Stays the same', 'Doubles', 'Quadruples']}
          answer={1}
          explain={`For small errors the drift is a sum of the step errors, each scaled by $\\sigma_\\theta$, so it scales linearly: **double**. On the default noise sample the drift at node 58 goes from ${drift12[0].toFixed(2)} m at 1° to ${drift12[1].toFixed(2)} m at 2°. (The variance quadruples.) The ellipses double too, and the closure still pulls it back.`}
          tryIt="set the heading noise to 2° and compare the drift at node 58."
          onApply={() => {
            changeMode('correct');
            defaults();
            setRotDeg(2);
            st.pause();
            st.setI(K_CLOSE);
            revealEl(leftRef.current, '.slam-lc-map');
          }}
        />
      </section>

      <More label="Conventions and what is simplified">
        <Rich
          text={`- A pose is $\\mathbf{x} = (x, y, \\theta)$; $\\mathbf{x}_i^{-1}\\oplus\\mathbf{x}_j$ is pose $j$ seen from pose $i$. Odometry edges come from the wheel encoders, the loop edge from matching two scans.
- Node 0 is anchored (known start), so its uncertainty is zero and everything is relative to it.
- On odometry alone the heading variance, and the volume $\\det\\Sigma$ of the full $(x, y, \\theta)$ uncertainty, never decrease. The position ellipse alone can shrink a little as the robot comes back towards where it made earlier heading errors, because a heading error at a point shifts later positions in proportion to the distance from that point: that is the dip at the end of the 95 % radius curve.
- The scans are stored with their nodes and drawn at the estimated poses, which is why the map moves when the poses do.
- Real systems use sparse solvers (g2o, GTSAM, iSAM) and robust kernels or switchable constraints that can down-weight an edge with a huge residual, the usual defence against false closures.`}
        />
      </More>
    </div>
  );

  return (
    <div className="slam-sim" ref={rootRef}>
      <div className="slam-layout">
        {left}
        {right}
      </div>
    </div>
  );
}

/** A pose triangle pointing along th (canvas y down). */
function tri(ctx: CanvasRenderingContext2D, x: number, y: number, th: number, size: number, color: string, fill: boolean, outline?: string) {
  const c = Math.cos(th);
  const s = -Math.sin(th);
  ctx.beginPath();
  ctx.moveTo(x + c * size, y + s * size);
  ctx.lineTo(x - c * size * 0.6 - s * size * 0.55, y - s * size * 0.6 + c * size * 0.55);
  ctx.lineTo(x - c * size * 0.6 + s * size * 0.55, y - s * size * 0.6 - c * size * 0.55);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}
