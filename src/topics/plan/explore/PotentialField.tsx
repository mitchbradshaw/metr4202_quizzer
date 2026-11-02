// Potential fields and local minima (summary notes §5 "Global vs local planning"; review deck: reactive and
// hybrid planners). A 10 × 10 m world: the goal pulls (U_att), every obstacle pushes within its influence
// distance Q* (U_rep), and the robot takes fixed 5 cm steps along −∇U. The heat map (canvas ImageData) shows
// the pull in blue, the push in orange and contours of U; the robot's descent is precomputed by
// localField.runField and replayed per frame through refs. Escape modes: random walks, or a global A* plan
// followed through a moving sub-goal (why reactive planners sit under a global planner).
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { attractive, descend, potential, type FieldParams } from '../../../core/local';
import { distToShape, type Shape, type Vec2 } from '../../../core/geom2d';
import {
  DEFAULT_FIELD,
  FIELD_GOAL_TOL,
  FIELD_PRESETS,
  FIELD_SIZE,
  FIELD_STEP,
  basinRow,
  bowlRim,
  forceParts,
  insideAny,
  lineProfile,
  pathLength,
  runField,
  sampleField,
  type EscapeMode,
  type FieldPreset,
  type FieldRun,
  type FieldScene,
  type Profile,
} from './localField';
import { cumLength, pointAtS, projectOnPath } from './localGlobal';
import { useRaf } from '../../../anim/hooks';
import { mixRgb, rgbOf, useThemeColors } from '../../../ui/theme';
import { Button, Callout, More, Segmented, Select, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { Band, Dot, Line, Plot, usePlot } from '../../../plot/Plot';
import type { Scale } from '../../../plot/scale';
import { svgPoint } from '../../../ui/diagrams';
import { completeChallenge, useProgress } from '../../../app/store';
import { fmt, fmtSig } from '../../../engine/format';
import '../local.css';

const CHALLENGE = 'plan-potential-trap';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'potential',
  title: 'Potential fields and local minima',
  summary:
    'Drag the goal, the start and the obstacles; the robot slides down $U = U_{att} + U_{rep}$. Watch it stall in a U-shaped trap, in front of a gap that $Q^*$ closes and short of a goal next to a wall, then let a global planner lead it out.',
  notice: 'The robot only ever follows $-\\nabla U$: where the pull of the goal and the push of an obstacle cancel, it stops short of the goal, in a local minimum.',
  challenge: { id: CHALLENGE, title: 'Build a trap: with at most two obstacles, make plain descent stall more than 1.5 m from the goal' },
  minutes: 8,
};

// ------------------------------------------------------------------ geometry of the world view

const VB = 560;
const PAD = { l: 30, t: 10, r: 10, b: 30 };
const PW = VB - PAD.l - PAD.r; // 520 px for 10 m
const K = PW / FIELD_SIZE;
const X = (x: number) => PAD.l + x * K;
const Y = (y: number) => PAD.t + (FIELD_SIZE - y) * K;
const LEN = (d: number) => d * K;
const toWorld = (p: { x: number; y: number }): Vec2 => ({ x: (p.x - PAD.l) / K, y: FIELD_SIZE - (p.y - PAD.t) / K });

const N_REST = 320;
const N_DRAG = 110;
const N_BASIN = 40;
/** Playback speed along the path at ×1 (m/s); random-walk stretches play faster (they are long). */
const SPEED = 1.5;
const WALK_SPEEDUP = 6;
/** Same look-ahead as localField's followPlan (its CARROT constant). */
const CARROT = 1.2;

const clampW = (v: number) => Math.max(0.15, Math.min(FIELD_SIZE - 0.15, v));
const r2 = (x: number) => Math.round(x * 100) / 100;

const PRESETS: FieldPreset[] = [
  ...FIELD_PRESETS,
  { id: 'headon', label: 'Disc dead ahead', scene: { start: { x: 1.5, y: 5 }, goal: { x: 8.5, y: 5 }, obstacles: [{ kind: 'circle', x: 5, y: 5, r: 1 }] }, params: {} },
];
const presetOf = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
const cloneScene = (s: FieldScene): FieldScene => ({ start: { ...s.start }, goal: { ...s.goal }, obstacles: s.obstacles.map((o) => (o.kind === 'poly' ? { kind: 'poly', pts: o.pts.map((p) => ({ ...p })) } : { ...o })) });

function moveShape(s: Shape, c: Vec2): Shape {
  if (s.kind === 'circle') return { ...s, x: r2(c.x), y: r2(c.y) };
  if (s.kind === 'rect') return { ...s, x: r2(c.x - s.w / 2), y: r2(c.y - s.h / 2) };
  return s;
}
function centreOf(s: Shape): Vec2 {
  if (s.kind === 'circle') return { x: s.x, y: s.y };
  if (s.kind === 'rect') return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  const n = s.pts.length;
  return { x: s.pts.reduce((a, p) => a + p.x, 0) / n, y: s.pts.reduce((a, p) => a + p.y, 0) / n };
}

// ------------------------------------------------------------------ canvas painting

type RGB = [number, number, number];
interface Pal {
  lo: RGB;
  mid: RGB;
  hi: RGB;
  obs: RGB;
  line: RGB;
  bad: RGB;
  warn: RGB;
}

/**
 * Heat map: the attractive bowl from the surface colour to --m1 (√U, so the colour grows steadily with the
 * distance from G), the repulsive part as an --m2 tint (log scale, so the push shows across the whole
 * influence distance), and contour lines of the total U at levels evenly spaced in √U (a closed contour
 * away from G is a dip). The contours are anti-aliased: each pixel's distance to the nearest level crossing is
 * |s − round(s)| / |∇s| (s = level coordinate, ∇s by central differences), so they stay thin and smooth instead
 * of stair-stepping.
 */
function paintHeat(cv: HTMLCanvasElement, n: number, U: Float32Array, scene: FieldScene, f: FieldParams, pal: Pal, lev: Float32Array) {
  if (cv.width !== n) {
    cv.width = n;
    cv.height = n;
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const rim = bowlRim(scene.goal, f);
  const kR = 1 / Math.log1p(30 / 0.02);
  const LEVELS = 16;
  const h = FIELD_SIZE / n;
  const p = { x: 0, y: 0 };
  for (let r = 0; r < n; r++) {
    p.y = FIELD_SIZE - (r + 0.5) * h;
    for (let c = 0; c < n; c++) {
      p.x = (c + 0.5) * h;
      const i = r * n + c;
      const u = U[i];
      const o = i * 4;
      if (!Number.isFinite(u)) {
        d[o] = pal.obs[0];
        d[o + 1] = pal.obs[1];
        d[o + 2] = pal.obs[2];
        d[o + 3] = 255;
        lev[i] = NaN;
        continue;
      }
      const ua = attractive(p, scene.goal, f);
      const ur = Math.max(0, u - ua);
      const ta = Math.min(1, Math.sqrt(ua / rim));
      const tr = Math.min(1, Math.log1p(ur / 0.02) * kR);
      const b0 = pal.lo[0] + (pal.mid[0] - pal.lo[0]) * ta;
      const b1 = pal.lo[1] + (pal.mid[1] - pal.lo[1]) * ta;
      const b2 = pal.lo[2] + (pal.mid[2] - pal.lo[2]) * ta;
      const a = 0.9 * tr;
      d[o] = b0 + (pal.hi[0] - b0) * a;
      d[o + 1] = b1 + (pal.hi[1] - b1) * a;
      d[o + 2] = b2 + (pal.hi[2] - b2) * a;
      d[o + 3] = 255;
      lev[i] = Math.sqrt(u / rim) * LEVELS;
    }
  }
  const sMax = 1.06 * LEVELS;
  const at = (k: number) => {
    const s = lev[k];
    return s <= sMax ? s : NaN; // NaN inside obstacles and on their steep rims
  };
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const s = at(i);
      if (!(s >= 0.5)) continue; // no dot at G, nothing inside or on the rim of an obstacle
      const sl = c > 0 ? at(i - 1) : NaN;
      const sr = c + 1 < n ? at(i + 1) : NaN;
      const su = r > 0 ? at(i - n) : NaN;
      const sd = r + 1 < n ? at(i + n) : NaN;
      const gx = sl === sl && sr === sr ? (sr - sl) / 2 : sr === sr ? sr - s : sl === sl ? s - sl : 0;
      const gy = su === su && sd === sd ? (sd - su) / 2 : sd === sd ? sd - s : su === su ? s - su : 0;
      const g = Math.hypot(gx, gy);
      if (g > 0.45) continue; // contours closer than ~2 px apart would merge into a smear: leave the tint alone
      const dist = Math.abs(s - Math.round(s)) / Math.max(g, 1e-6);
      const a = 0.36 * (1 - dist / 0.85);
      if (a <= 0) continue;
      const o = i * 4;
      d[o] += (pal.line[0] - d[o]) * a;
      d[o + 1] += (pal.line[1] - d[o + 1]) * a;
      d[o + 2] += (pal.line[2] - d[o + 2]) * a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function paintBasin(cv: HTMLCanvasElement, data: Uint8Array, rows: number, pal: Pal) {
  const n = N_BASIN;
  if (cv.width !== n) {
    cv.width = n;
    cv.height = n;
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(n, n);
  const d = img.data;
  for (let i = 0; i < rows * n; i++) {
    const v = data[i];
    const o = i * 4;
    if (v === 1) {
      d[o] = pal.bad[0];
      d[o + 1] = pal.bad[1];
      d[o + 2] = pal.bad[2];
      d[o + 3] = 105;
    } else if (v === 2) {
      d[o] = pal.warn[0];
      d[o + 1] = pal.warn[1];
      d[o + 2] = pal.warn[2];
      d[o + 3] = 95;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** −∇U directions on a coarse grid, as one SVG path of centred arrows (constant length: a direction field). */
function arrowField(scene: FieldScene, f: FieldParams): string {
  let s = '';
  const step = 0.5;
  const half = 0.17;
  for (let gx = step / 2; gx < FIELD_SIZE; gx += step)
    for (let gy = step / 2; gy < FIELD_SIZE; gy += step) {
      const p = { x: gx, y: gy };
      if (scene.obstacles.some((o) => distToShape(p, o) < 0.06)) continue;
      if (Math.hypot(p.x - scene.goal.x, p.y - scene.goal.y) < 0.2) continue;
      const F = forceParts(p, scene.goal, scene.obstacles, f).tot;
      const m = Math.hypot(F.x, F.y);
      if (m < 1e-9) continue;
      const ux = F.x / m;
      const uy = F.y / m;
      const ax = X(gx - ux * half);
      const ay = Y(gy - uy * half);
      const bx = X(gx + ux * half);
      const by = Y(gy + uy * half);
      // arrowhead in screen coordinates (y down)
      const sx = (bx - ax) / LEN(2 * half);
      const sy = (by - ay) / LEN(2 * half);
      const hl = 4.2;
      const c1x = bx - hl * (sx * 0.87 - sy * 0.5);
      const c1y = by - hl * (sy * 0.87 + sx * 0.5);
      const c2x = bx - hl * (sx * 0.87 + sy * 0.5);
      const c2y = by - hl * (sy * 0.87 - sx * 0.5);
      s += `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}M${c1x.toFixed(1)} ${c1y.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}L${c2x.toFixed(1)} ${c2y.toFixed(1)}`;
    }
  return s;
}

// ------------------------------------------------------------------ analysis of a run

interface Geo {
  path: Vec2[];
  cum: Float64Array;
  total: number;
  /** 1 where the path index lies inside a random walk. */
  walk: Uint8Array;
  /** Mode 'global': the sub-goal the field pulled toward at each path index. */
  carrots: Vec2[] | null;
  d: string;
  walkD: string[];
  planD: string;
}

function polyD(pts: readonly Vec2[], from = 0, to = pts.length - 1): string {
  let s = '';
  for (let i = from; i <= to; i++) s += `${i === from ? 'M' : 'L'}${X(pts[i].x).toFixed(1)} ${Y(pts[i].y).toFixed(1)}`;
  return s;
}

function geometry(run: FieldRun, goal: Vec2): Geo {
  const path = run.path;
  const cum = new Float64Array(path.length);
  for (let i = 1; i < path.length; i++) cum[i] = cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  const walk = new Uint8Array(path.length);
  for (const [a, b] of run.walks) for (let i = a; i < b; i++) walk[i] = 1;
  let carrots: Vec2[] | null = null;
  if (run.plan) {
    const plan = run.plan;
    const pc = cumLength(plan);
    const L = pc[pc.length - 1];
    let s = 0;
    carrots = path.map((p) => {
      s = projectOnPath(plan, pc, p, s);
      return s + CARROT >= L ? goal : pointAtS(plan, pc, s + CARROT);
    });
  }
  return {
    path,
    cum,
    total: path.length ? cum[path.length - 1] : 0,
    walk,
    carrots,
    d: path.length > 1 ? polyD(path) : '',
    walkD: run.walks.map(([a, b]) => polyD(path, a, b)),
    planD: run.plan ? polyD(run.plan) : '',
  };
}

/** Index i and fraction t with cum[i] + t·(cum[i+1] − cum[i]) = s. */
function locate(cum: Float64Array, s: number): { i: number; t: number } {
  const n = cum.length;
  if (n < 2 || s <= 0) return { i: 0, t: 0 };
  if (s >= cum[n - 1]) return { i: n - 1, t: 0 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m;
    else hi = m;
  }
  const seg = cum[lo + 1] - cum[lo] || 1;
  return { i: lo, t: (s - cum[lo]) / seg };
}

/** A stop that a 15 cm sideways nudge frees is a saddle (perfect balance on a ridge), not a dip. */
function isSaddle(stop: Vec2, scene: FieldScene, f: FieldParams): boolean {
  const dx = scene.goal.x - stop.x;
  const dy = scene.goal.y - stop.y;
  const d = Math.hypot(dx, dy) || 1;
  for (const sg of [1, -1]) {
    const q = { x: stop.x - (dy / d) * 0.15 * sg, y: stop.y + (dx / d) * 0.15 * sg };
    if (insideAny(q, scene.obstacles)) continue;
    if (descend(q, scene.goal, scene.obstacles, f, { step: FIELD_STEP, maxIter: 2500, goalTol: FIELD_GOAL_TOL }).status === 'goal') return true;
  }
  return false;
}

interface Verdict {
  kind: 'ok' | 'bad' | 'warn';
  title: string;
  text: string;
}

function verdict(run: FieldRun, scene: FieldScene, f: FieldParams, mode: EscapeMode, saddle: boolean): Verdict {
  const path = run.path;
  const end = path[path.length - 1];
  const L = pathLength(path);
  const dGoal = Math.hypot(end.x - scene.goal.x, end.y - scene.goal.y);
  if (path.length <= 1 && insideAny(scene.start, scene.obstacles)) return { kind: 'bad', title: 'S is inside an obstacle', text: 'Drag S out: $U = \\infty$ inside an obstacle, so there is no slope to follow.' };
  const U0 = potential(scene.start, scene.goal, scene.obstacles, f);
  if (run.status === 'goal') {
    if (mode === 'walk' && run.walks.length)
      return {
        kind: 'ok',
        title: `Reached the goal after ${run.walks.length} random walk${run.walks.length > 1 ? 's' : ''}`,
        text: `Descent stalled at (${fmt(run.firstStuck?.x ?? 0, 3)}, ${fmt(run.firstStuck?.y ?? 0, 3)}). Each walk (purple) ignores $U$, so it can climb out of the dip; this time a later descent started outside the trap’s basin and slid to G. Total ${fmt(L, 3)} m: escaping by luck is slow, and 🎲 another seed may not escape at all.`,
      };
    if (mode === 'global' && run.plan)
      return {
        kind: 'ok',
        title: 'Reached the goal by following the global plan',
        text: `A* on a 25 cm grid found the way round (${run.plan.length} waypoints, green). The field now pulls toward a sub-goal ${CARROT} m ahead on that plan, which is never hidden behind a wall, so no dip forms between the robot and its target. The global planner chooses **which way round**; the field handles the local details.`,
      };
    return {
      kind: 'ok',
      title: 'Reached the goal',
      text: `$U$ fell from ${fmt(U0, 3)} at S to ${fmt(potential(end, scene.goal, scene.obstacles, f), 2)} at G along ${fmt(L, 3)} m (${path.length - 1} steps of 5 cm). There was always a downhill direction, so following $-\\nabla U$ was enough.`,
    };
  }
  if (run.status === 'collision')
    return {
      kind: 'bad',
      title: 'Collision',
      text: 'A 5 cm step landed inside an obstacle: the push, which grows like $1/D^2$, was still too weak to turn the step in time. Raise $\\eta$ or $Q^*$.',
    };
  if (run.status === 'max-iter') return { kind: 'warn', title: 'Out of steps', text: 'The robot used its 4000 steps without settling or reaching G.' };
  // local minimum (or saddle)
  const fp = forceParts(end, scene.goal, scene.obstacles, f);
  const fa = Math.hypot(fp.att.x, fp.att.y);
  const fr = Math.hypot(fp.rep.x, fp.rep.y);
  const Uend = potential(end, scene.goal, scene.obstacles, f);
  const ft = Math.hypot(fp.tot.x, fp.tot.y);
  const where = `Stopped ${fmt(dGoal, 3)} m from G with $U$ = ${fmt(Uend, 3)} ($U$ = 0 at G).`;
  const balance = `Here the pull of G ($|F_{att}|$ = ${fmt(fa, 3)}) and the push of the obstacles ($|F_{rep}|$ = ${fmt(fr, 3)}) are equal and opposite, so their sum $-\\nabla U$ is almost zero ($|\\nabla U|$ = ${fmtSig(ft, 2)}): there is no downhill direction left, and gradient descent stays put.`;
  if (mode === 'walk')
    return {
      kind: 'bad',
      title: `Still stuck after ${run.walks.length} random walks`,
      text: `${where} None of the walks left the trap’s basin, so every descent slid back into the same dip. Random walks escape only by luck: try 🎲 another seed, or switch to the global plan.`,
    };
  if (saddle)
    return {
      kind: 'warn',
      title: 'Balanced on a saddle',
      text: `${where} ${balance} This is not a dip: S, the disc and G are exactly in line, so the forces are exactly opposite. Nudge S a few centimetres sideways and the robot slides round. A real trap is a dip that is uphill in every direction.`,
    };
  const goalObs = Math.min(...scene.obstacles.map((o) => distToShape(scene.goal, o)), Infinity);
  const near = scene.obstacles.filter((o) => distToShape(end, o) < f.d0).length;
  let why: string;
  if (goalObs < f.d0 && dGoal < f.d0 + 0.6)
    why = `This is the *goal near an obstacle* problem: G is only ${fmt(goalObs, 2)} m from an obstacle but $Q^*$ = ${fmt(f.d0, 3)} m, so the obstacle still pushes **at G** and the minimum of $U$ moves off the goal. Make $Q^*$ smaller than ${fmt(goalObs, 2)} m.`;
  else if (near >= 2)
    why = `${['', 'One', 'Two', 'Three', 'Four'][near] ?? near} obstacles push at once: their influence zones ($Q^*$ = ${fmt(f.d0, 3)} m) overlap and the pushes add up into a ridge across the way through. A smaller $Q^*$ opens it.`;
  else why = 'G lies behind the obstacle, so the pull points into it and the push points back out. Changing the gains only moves this balance point: the dip comes from the obstacle’s shape.';
  return {
    kind: 'bad',
    title: mode === 'global' ? 'Stuck in a local minimum, even with the plan' : 'Stuck in a local minimum',
    text: `${where} ${balance} ${why}${
      mode === 'global' ? ' The plan only moves the attractor: a sub-goal 1.2 m away pulls more weakly than the far goal, and the field here is too steep for it.' : ''
    }`,
  };
}

// ------------------------------------------------------------------ small pieces

function useRafCoalesce<T>(apply: (v: T) => void): (v: T) => void {
  const pending = useRef<{ v: T } | null>(null);
  const raf = useRef(0);
  const fn = useRef(apply);
  fn.current = apply;
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return useCallback((v: T) => {
    pending.current = { v };
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const p = pending.current;
      pending.current = null;
      if (p) fn.current(p.v);
    });
  }, []);
}

const Axes = memo(function Axes() {
  const ticks = [0, 2, 4, 6, 8, 10];
  return (
    <g pointerEvents="none">
      <rect x={PAD.l} y={PAD.t} width={PW} height={PW} className="plot-frame" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={Y(0)} y2={Y(0) + 4} stroke="var(--text-3)" />
          <text className="tick" x={X(t)} y={Y(0) + 16} textAnchor="middle">
            {t}
          </text>
          <line x1={X(0) - 4} x2={X(0)} y1={Y(t)} y2={Y(t)} stroke="var(--text-3)" />
          <text className="tick" x={X(0) - 7} y={Y(t) + 4} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      <text className="tick" x={X(FIELD_SIZE)} y={Y(0) + 27} textAnchor="end">
        x (m)
      </text>
    </g>
  );
});

function ShapeEl({ s, className }: { s: Shape; className: string }) {
  if (s.kind === 'circle') return <circle className={className} cx={X(s.x)} cy={Y(s.y)} r={LEN(s.r)} />;
  if (s.kind === 'rect') return <rect className={className} x={X(s.x)} y={Y(s.y + s.h)} width={LEN(s.w)} height={LEN(s.h)} />;
  return <polygon className={className} points={s.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} />;
}

function QRing({ s, q }: { s: Shape; q: number }) {
  if (s.kind === 'circle') return <circle className="plan-local-qring" cx={X(s.x)} cy={Y(s.y)} r={LEN(s.r + q)} />;
  if (s.kind === 'rect') return <rect className="plan-local-qring" x={X(s.x - q)} y={Y(s.y + s.h + q)} width={LEN(s.w + 2 * q)} height={LEN(s.h + 2 * q)} rx={LEN(q)} />;
  return null;
}

/** Hands a Plot's scales to per-frame drawing code, and tells it when they change (resize, new axes). */
function ScalesGrab({ to, onChange }: { to: MutableRefObject<{ sx: Scale; sy: Scale } | null>; onChange: () => void }) {
  const { sx, sy } = usePlot();
  to.current = { sx, sy };
  useEffect(() => {
    onChange();
  }, [sx, sy, onChange]);
  return null;
}

/** Arrow from p along F (length saturates with |F|); hidden when |F| is tiny. */
function setArrow(el: SVGLineElement | null, p: Vec2, F: Vec2) {
  if (!el) return;
  const m = Math.hypot(F.x, F.y);
  if (m < 1e-3) {
    el.setAttribute('visibility', 'hidden');
    return;
  }
  const len = (1.15 * m) / (m + 1.4);
  el.setAttribute('visibility', 'visible');
  el.setAttribute('x1', X(p.x).toFixed(1));
  el.setAttribute('y1', Y(p.y).toFixed(1));
  el.setAttribute('x2', X(p.x + (F.x / m) * len).toFixed(1));
  el.setAttribute('y2', Y(p.y + (F.y / m) * len).toFixed(1));
}

/** U along the robot's own path, split into descent and random-walk stretches (NaN breaks the lines). */
function pathSeries(geo: Geo, scene: FieldScene, f: FieldParams) {
  const n = geo.path.length;
  const stride = Math.max(1, Math.ceil(n / 500));
  const xs: number[] = [];
  const desc: number[] = [];
  const walk: number[] = [];
  // The y-range follows the descent only: a random walk can brush an obstacle (U → ∞), so its spikes are clipped.
  let top = n ? potential(geo.path[0], scene.goal, scene.obstacles, f) : 0;
  for (let i = 0; i < n; i += stride) {
    const u = potential(geo.path[i], scene.goal, scene.obstacles, f);
    xs.push(geo.cum[i]);
    const w = geo.walk[i] === 1;
    if (Number.isFinite(u) && !w) top = Math.max(top, u);
    desc.push(w ? NaN : u);
    walk.push(w || (i > 0 && geo.walk[i - stride] === 1) ? u : NaN);
  }
  if ((n - 1) % stride !== 0 && n > 0) {
    const u = potential(geo.path[n - 1], scene.goal, scene.obstacles, f);
    xs.push(geo.cum[n - 1]);
    desc.push(u);
    walk.push(NaN);
  }
  return { x: xs, desc, walk, top: Math.max(top, 0.5) };
}

// ------------------------------------------------------------------ the simulation

export default function PotentialField() {
  const uid = useId().replace(/:/g, '');
  const chalDone = !!useProgress().challenges[CHALLENGE];
  const [presetId, setPresetId] = useState('single');
  const [edited, setEdited] = useState(false);
  const [scene, setScene] = useState<FieldScene>(() => cloneScene(presetOf('single').scene));
  const [params, setParams] = useState<FieldParams>(() => ({ ...DEFAULT_FIELD, ...presetOf('single').params }));
  const [mode, setMode] = useState<EscapeMode>('none');
  const [seed, setSeed] = useState(7);
  const [sel, setSel] = useState<number | null>(null);
  const [showArrows, setShowArrows] = useState(false);
  const [showRings, setShowRings] = useState(true);
  const [showBasin, setShowBasin] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  const [speed, setSpeed] = useState(1);

  const theme = useThemeColors(['--surface', '--surface-3', '--m1', '--m2', '--text', '--bad', '--warn']);
  const pal = useMemo<Pal>(
    () => ({
      lo: rgbOf(theme['--surface']),
      mid: mixRgb(rgbOf(theme['--surface']), rgbOf(theme['--m1']), 0.72),
      hi: rgbOf(theme['--m2']),
      obs: rgbOf(theme['--surface-3']),
      line: rgbOf(theme['--text']),
      bad: rgbOf(theme['--bad']),
      warn: rgbOf(theme['--warn']),
    }),
    [theme]
  );

  // ---------------------------------------------------------------- derived
  const run = useMemo(() => runField(scene, params, mode, seed), [scene, params, mode, seed]);
  const geo = useMemo(() => geometry(run, scene.goal), [run, scene.goal]);
  const saddle = useMemo(() => run.status === 'local-min' && mode !== 'walk' && isSaddle(run.path[run.path.length - 1], scene, params), [run, mode, scene, params]);
  const v = useMemo(() => verdict(run, scene, params, mode, saddle), [run, scene, params, mode, saddle]);
  const lineProf = useMemo<Profile>(() => lineProfile(scene, params), [scene, params]);
  const pathSer = useMemo(() => pathSeries(geo, scene, params), [geo, scene, params]);
  const arrowsD = useMemo(() => (showArrows ? arrowField(scene, params) : ''), [showArrows, scene, params]);
  const end = run.path[run.path.length - 1];

  const latest = useRef({ geo, scene, params });
  latest.current = { geo, scene, params };

  // ---------------------------------------------------------------- heat map
  const heatRef = useRef<HTMLCanvasElement>(null);
  const bufRef = useRef<Float32Array | null>(null);
  const levRef = useRef<Float32Array | null>(null);
  useEffect(() => {
    const cv = heatRef.current;
    if (!cv) return;
    const n = dragging ? N_DRAG : N_REST;
    const U = sampleField(scene.goal, scene.obstacles, params, n, bufRef.current ?? undefined);
    bufRef.current = U;
    if (!levRef.current || levRef.current.length !== n * n) levRef.current = new Float32Array(n * n);
    paintHeat(cv, n, U, scene, params, pal, levRef.current);
  }, [scene, params, dragging, pal]);

  // ---------------------------------------------------------------- trap basins (progressive, a few rows per frame)
  const basinRef = useRef<HTMLCanvasElement>(null);
  const job = useRef({ row: 0, data: new Uint8Array(N_BASIN * N_BASIN), scene, params });
  const [basinRows, setBasinRows] = useState(0);
  useEffect(() => {
    job.current = { row: 0, data: new Uint8Array(N_BASIN * N_BASIN), scene, params };
    setBasinRows(0);
    const cv = basinRef.current;
    if (cv) cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
  }, [scene, params]);
  useRaf(() => {
    const j = job.current;
    const t0 = performance.now();
    while (j.row < N_BASIN && performance.now() - t0 < 6) {
      basinRow(j.scene, j.params, N_BASIN, j.row, j.data);
      j.row++;
    }
    if (basinRef.current) paintBasin(basinRef.current, j.data, j.row, pal);
    setBasinRows(j.row);
  }, showBasin && !dragging && basinRows < N_BASIN);
  useEffect(() => {
    if (showBasin && basinRef.current && job.current.row > 0) paintBasin(basinRef.current, job.current.data, job.current.row, pal);
  }, [showBasin, pal]);

  // ---------------------------------------------------------------- playback (refs, no re-render per frame)
  const sRef = useRef(Infinity);
  const pendingPlay = useRef(false);
  const robotRef = useRef<SVGCircleElement>(null);
  const travRef = useRef<SVGPathElement>(null);
  const attRef = useRef<SVGLineElement>(null);
  const repRef = useRef<SVGLineElement>(null);
  const totRef = useRef<SVGLineElement>(null);
  const carrotRef = useRef<SVGCircleElement>(null);
  const carrotLineRef = useRef<SVGLineElement>(null);
  const phRef = useRef<SVGCircleElement>(null);
  const scalesRef = useRef<{ sx: Scale; sy: Scale } | null>(null);
  const liveRef = useRef<HTMLSpanElement>(null);
  const roRef = useRef<(HTMLSpanElement | null)[]>([]);

  const drawAt = useCallback((s: number) => {
    const { geo: g, scene: sc, params: f } = latest.current;
    if (!g.path.length) return;
    const ss = Math.max(0, Math.min(g.total, s));
    const { i, t } = locate(g.cum, ss);
    const a = g.path[i];
    const b = g.path[Math.min(g.path.length - 1, i + 1)];
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const rob = robotRef.current;
    if (rob) {
      rob.setAttribute('cx', X(p.x).toFixed(1));
      rob.setAttribute('cy', Y(p.y).toFixed(1));
      rob.classList.toggle('is-walk', g.walk[i] === 1);
    }
    travRef.current?.setAttribute('stroke-dasharray', `${g.total > 0 ? (ss / g.total).toFixed(5) : 0} 3`);
    const target = g.carrots ? g.carrots[Math.min(g.carrots.length - 1, i)] : sc.goal;
    const fp = forceParts(p, target, sc.obstacles, f);
    const inWalk = g.walk[i] === 1;
    setArrow(attRef.current, p, inWalk ? { x: 0, y: 0 } : fp.att);
    setArrow(repRef.current, p, inWalk ? { x: 0, y: 0 } : fp.rep);
    setArrow(totRef.current, p, inWalk ? { x: 0, y: 0 } : fp.tot);
    if (g.carrots && carrotRef.current && carrotLineRef.current) {
      carrotRef.current.setAttribute('cx', X(target.x).toFixed(1));
      carrotRef.current.setAttribute('cy', Y(target.y).toFixed(1));
      carrotLineRef.current.setAttribute('x1', X(p.x).toFixed(1));
      carrotLineRef.current.setAttribute('y1', Y(p.y).toFixed(1));
      carrotLineRef.current.setAttribute('x2', X(target.x).toFixed(1));
      carrotLineRef.current.setAttribute('y2', Y(target.y).toFixed(1));
    }
    const U = potential(p, sc.goal, sc.obstacles, f);
    const fg = forceParts(p, sc.goal, sc.obstacles, f);
    const vals = [
      fmtSig(U, 3),
      fmtSig(Math.hypot(fg.att.x, fg.att.y), 3),
      fmtSig(Math.hypot(fg.rep.x, fg.rep.y), 3),
      fmtSig(Math.hypot(fg.tot.x, fg.tot.y), 3),
      `${fmtSig(Math.hypot(p.x - sc.goal.x, p.y - sc.goal.y), 3)} m`,
      `${fmtSig(ss, 3)} m`,
    ];
    vals.forEach((txt, k) => {
      const el = roRef.current[k];
      if (el && el.textContent !== txt) el.textContent = txt;
    });
    const sc2 = scalesRef.current;
    if (phRef.current && sc2 && Number.isFinite(U)) {
      phRef.current.setAttribute('cx', sc2.sx(ss).toFixed(1));
      phRef.current.setAttribute('cy', Math.max(-20, sc2.sy(U)).toFixed(1));
    }
    if (liveRef.current) {
      const walkNo = inWalk ? latestWalkNo(g, i) : 0;
      liveRef.current.textContent = inWalk ? `Random walk ${walkNo}: wandering uphill and down, ignoring U` : g.carrots ? 'Following the sub-goal (green) on the global plan' : `Descending: ${fmt(ss, 3)} m travelled, U = ${fmt(U, 3)}`;
    }
  }, []);

  // A new run (any edit): show the whole path, or play it from the start when asked to.
  useLayoutEffect(() => {
    if (pendingPlay.current) {
      pendingPlay.current = false;
      sRef.current = 0;
      setPlaying(true);
      setAtEnd(false);
    } else {
      sRef.current = geo.total;
      setPlaying(false);
      setAtEnd(true);
    }
    drawAt(sRef.current);
  }, [geo, drawAt]);

  useRaf((dt) => {
    const g = latest.current.geo;
    const { i } = locate(g.cum, sRef.current);
    sRef.current += dt * SPEED * speed * (g.walk[i] === 1 ? WALK_SPEEDUP : 1);
    if (sRef.current >= g.total) {
      sRef.current = g.total;
      setPlaying(false);
      setAtEnd(true);
    }
    drawAt(sRef.current);
  }, playing);

  const redraw = useCallback(() => drawAt(sRef.current), [drawAt]);
  const play = () => {
    if (atEnd || sRef.current >= geo.total) sRef.current = 0;
    setAtEnd(false);
    setPlaying(true);
  };
  const stepBy = (ds: number) => {
    setPlaying(false);
    if (sRef.current >= geo.total) sRef.current = 0;
    sRef.current = Math.min(geo.total, sRef.current + ds);
    setAtEnd(sRef.current >= geo.total);
    drawAt(sRef.current);
  };
  const toStart = () => {
    setPlaying(false);
    sRef.current = 0;
    setAtEnd(false);
    drawAt(0);
  };

  // ---------------------------------------------------------------- editing
  const markEdited = () => setEdited(true);
  const load = (id: string, o: { mode?: EscapeMode; params?: Partial<FieldParams>; play?: boolean; start?: Vec2 } = {}) => {
    const p = presetOf(id);
    setPresetId(id);
    setEdited(false);
    const sc = cloneScene(p.scene);
    if (o.start) sc.start = { ...o.start };
    setScene(sc);
    setParams({ ...DEFAULT_FIELD, ...p.params, ...o.params });
    setMode(o.mode ?? 'none');
    setSel(null);
    pendingPlay.current = !!o.play;
  };
  const setParam = (k: keyof FieldParams, val: number) => setParams((f) => ({ ...f, [k]: val }));
  // "Show me" lives below the simulation: bring the simulation into view so the answer is seen happening.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const reveal = (fn: () => void) => () => {
    fn();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    toolbarRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const svgRef = useRef<SVGSVGElement>(null);
  type Drag = { kind: 'start' } | { kind: 'goal' } | { kind: 'obs'; i: number; off: Vec2 };
  const drag = useRef<Drag | null>(null);
  const applyDrag = useRafCoalesce((w: Vec2) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'start') setScene((s) => ({ ...s, start: { x: r2(clampW(w.x)), y: r2(clampW(w.y)) } }));
    else if (d.kind === 'goal') setScene((s) => ({ ...s, goal: { x: r2(clampW(w.x)), y: r2(clampW(w.y)) } }));
    else
      setScene((s) => ({
        ...s,
        obstacles: s.obstacles.map((o, k) => (k === d.i ? moveShape(o, { x: Math.max(0, Math.min(FIELD_SIZE, w.x - d.off.x)), y: Math.max(0, Math.min(FIELD_SIZE, w.y - d.off.y)) }) : o)),
      }));
  });
  const worldOf = (e: { clientX: number; clientY: number }) => (svgRef.current ? toWorld(svgPoint(svgRef.current, e.clientX, e.clientY)) : { x: 0, y: 0 });
  const startDrag = (e: RPointerEvent, d: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = d;
    svgRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    setPlaying(false);
    markEdited();
    if (d.kind === 'obs') setSel(d.i);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    applyDrag(worldOf(e));
  };
  const endDrag = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    setDragging(false);
  };
  // Slider drags also use the coarse heat map (and pause the basin map) until the pointer is released.
  useEffect(() => {
    const up = () => {
      if (!drag.current) setDragging(false);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);
  const nudge = (e: RKeyboardEvent, what: 'start' | 'goal' | number) => {
    const step = e.shiftKey ? 0.5 : 0.1;
    const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, step] : e.key === 'ArrowDown' ? [0, -step] : null;
    if ((e.key === 'Delete' || e.key === 'Backspace') && typeof what === 'number') {
      e.preventDefault();
      removeObs(what);
      return;
    }
    if (!d) return;
    e.preventDefault();
    markEdited();
    if (what === 'start') setScene((s) => ({ ...s, start: { x: r2(clampW(s.start.x + d[0])), y: r2(clampW(s.start.y + d[1])) } }));
    else if (what === 'goal') setScene((s) => ({ ...s, goal: { x: r2(clampW(s.goal.x + d[0])), y: r2(clampW(s.goal.y + d[1])) } }));
    else {
      setSel(what);
      setScene((s) => ({ ...s, obstacles: s.obstacles.map((o, k) => (k === what ? moveShape(o, { x: centreOf(o).x + d[0], y: centreOf(o).y + d[1] }) : o)) }));
    }
  };
  const freeSpot = (r: number): Vec2 => {
    const cands: Vec2[] = [];
    for (let k = 0; k < 64; k++) cands.push({ x: 5 + 3.2 * Math.cos(k * 2.4) * Math.sqrt(k / 64), y: 5 + 3.2 * Math.sin(k * 2.4) * Math.sqrt(k / 64) });
    return (
      cands.find((c) => Math.hypot(c.x - scene.start.x, c.y - scene.start.y) > r + 0.8 && Math.hypot(c.x - scene.goal.x, c.y - scene.goal.y) > r + 0.8 && scene.obstacles.every((o) => distToShape(c, o) > r + 0.3)) ?? { x: 5, y: 5 }
    );
  };
  const addObs = (kind: 'circle' | 'rect') => {
    const c = freeSpot(kind === 'circle' ? 0.8 : 1.5);
    const s: Shape = kind === 'circle' ? { kind: 'circle', x: r2(c.x), y: r2(c.y), r: 0.8 } : { kind: 'rect', x: r2(c.x - 0.2), y: r2(c.y - 1.5), w: 0.4, h: 3 };
    markEdited();
    setScene((sc) => ({ ...sc, obstacles: [...sc.obstacles, s] }));
    setSel(scene.obstacles.length);
  };
  function removeObs(i: number) {
    markEdited();
    setScene((sc) => ({ ...sc, obstacles: sc.obstacles.filter((_, k) => k !== i) }));
    setSel(null);
  }
  const resize = (i: number, patch: Partial<{ r: number; w: number; h: number }>) => {
    markEdited();
    setScene((sc) => ({
      ...sc,
      obstacles: sc.obstacles.map((o, k) => {
        if (k !== i) return o;
        if (o.kind === 'circle' && patch.r !== undefined) return { ...o, r: patch.r };
        if (o.kind === 'rect') {
          const c = centreOf(o);
          const w = patch.w ?? o.w;
          const h = patch.h ?? o.h;
          return { ...o, w, h, x: r2(c.x - w / 2), y: r2(c.y - h / 2) };
        }
        return o;
      }),
    }));
  };
  const selShape = sel !== null ? scene.obstacles[sel] : undefined;

  // ---------------------------------------------------------------- challenge
  const challengeMet = edited && mode === 'none' && run.status === 'local-min' && !saddle && scene.obstacles.length <= 2 && Math.hypot(end.x - scene.goal.x, end.y - scene.goal.y) > 1.5;
  useEffect(() => {
    if (challengeMet && !chalDone) completeChallenge(CHALLENGE);
  }, [challengeMet, chalDone]);

  // ---------------------------------------------------------------- profile data
  const Lline = lineProf.s[lineProf.s.length - 1] || 1;
  const yLine = Math.max(0.6, 1.25 * attractive(scene.start, scene.goal, params));
  const dip = useMemo(() => {
    const { s, U } = lineProf;
    for (let i = 1; i < U.length - 1; i++)
      if (Number.isFinite(U[i - 1]) && Number.isFinite(U[i + 1]) && U[i] < U[i - 1] && U[i] <= U[i + 1] && s[i] < Lline - 0.3 && U[i] > 1e-3) return { s: s[i], U: U[i] };
    return null;
  }, [lineProf, Lline]);

  const stuckShown = atEnd && !playing && run.status === 'local-min';
  const basinPct = Math.round((basinRows / N_BASIN) * 100);
  const qShown = params.d0;

  return (
    <div className="plan-local">
      <div className="plan-local-toolbar" ref={toolbarRef}>
        <Select
          label="Scene"
          value={edited ? 'custom' : presetId}
          onChange={(id) => id !== 'custom' && load(id)}
          options={[...PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(edited ? [{ value: 'custom', label: 'Your map (edited)' }] : [])]}
        />
        <Button onClick={() => addObs('circle')} title="Add a disc obstacle">
          + Disc
        </Button>
        <Button onClick={() => addObs('rect')} title="Add a wall">
          + Wall
        </Button>
        <Button variant="danger" disabled={sel === null} onClick={() => sel !== null && removeObs(sel)} title="Remove the selected obstacle (or press Delete)">
          Remove
        </Button>
        <span className="plan-local-toolbar-sep" aria-hidden="true" />
        <span className="plan-local-tlabel">When it stalls:</span>
        <Segmented
          label="Escape strategy"
          value={mode}
          onChange={(m) => setMode(m)}
          options={[
            { value: 'none', label: 'Plain descent', title: 'Pure gradient descent: stop when −∇U ≈ 0' },
            { value: 'walk', label: 'Random walk', title: 'After a stall, walk randomly 140 steps of 0.3 m, then descend again (up to 12 times)' },
            { value: 'global', label: 'Global plan', title: 'A* on a 25 cm grid supplies waypoints; the field pulls toward a sub-goal 1.2 m ahead on them' },
          ]}
        />
        {mode === 'walk' && (
          <Button onClick={() => setSeed((s) => s + 1)} title="Draw different random walks">
            🎲 Another walk
          </Button>
        )}
      </div>

      <div className="plan-local-main">
        <section className="plan-local-panel" aria-label="World">
          <div className="plan-local-head">
            <h4>World (10 × 10 m)</h4>
            <span className="muted">drag S, G and the obstacles · arrow keys move the focused one</span>
          </div>
          <div className={`plan-local-world ${playing ? 'plan-local-playing' : ''}`}>
            <canvas ref={heatRef} aria-hidden="true" />
            <canvas ref={basinRef} className="plan-local-basin" aria-hidden="true" style={{ display: showBasin ? undefined : 'none' }} />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VB} ${VB}`}
              role="group"
              aria-label="Potential field world. Drag S, G and the obstacles."
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerDown={() => setSel(null)}
            >
              <defs>
                <marker id={`${uid}-att`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">
                  <path d="M0 0L10 5L0 10z" style={{ fill: 'var(--m1)' }} />
                </marker>
                <marker id={`${uid}-rep`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">
                  <path d="M0 0L10 5L0 10z" style={{ fill: 'var(--m2)' }} />
                </marker>
                <marker id={`${uid}-tot`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                  <path d="M0 0L10 5L0 10z" style={{ fill: 'var(--text)' }} />
                </marker>
              </defs>
              <Axes />
              {showRings && scene.obstacles.map((o, k) => <QRing key={`q${k}`} s={o} q={qShown} />)}
              {arrowsD && <path className="plan-local-arrows" d={arrowsD} />}
              <line className="plan-local-hide-play" x1={X(scene.start.x)} y1={Y(scene.start.y)} x2={X(scene.goal.x)} y2={Y(scene.goal.y)} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="2 5" pointerEvents="none" />
              {geo.planD && <path className="plan-local-plan" d={geo.planD} />}
              {run.plan && run.plan.map((p, k) => <circle key={`w${k}`} cx={X(p.x)} cy={Y(p.y)} r={3.5} fill="var(--m3)" pointerEvents="none" />)}
              {scene.obstacles.map((o, k) => (
                <g
                  key={`o${k}`}
                  className="plan-local-drag"
                  tabIndex={0}
                  role="button"
                  aria-label={`Obstacle ${k + 1} (${o.kind === 'circle' ? 'disc' : 'wall'}): drag it, move it with the arrow keys, Delete removes it`}
                  onPointerDown={(e) => {
                    const w = worldOf(e);
                    const c = centreOf(o);
                    startDrag(e, { kind: 'obs', i: k, off: { x: w.x - c.x, y: w.y - c.y } });
                  }}
                  onKeyDown={(e) => nudge(e, k)}
                  onFocus={() => setSel(k)}
                >
                  <ShapeEl s={o} className={`plan-local-obs ${sel === k ? 'is-sel' : ''}`} />
                </g>
              ))}
              {geo.d && <path className="plan-local-path-future" d={geo.d} />}
              {geo.d && <path ref={travRef} className="plan-local-path-done" d={geo.d} pathLength={1} strokeDasharray="0 3" />}
              {geo.walkD.map((d, k) => (
                <path key={`wk${k}`} className="plan-local-walk plan-local-hide-play" d={d} />
              ))}
              {geo.carrots && <line ref={carrotLineRef} stroke="var(--m3)" strokeWidth={1.5} strokeDasharray="3 3" pointerEvents="none" />}
              {geo.carrots && <circle ref={carrotRef} r={5} fill="var(--m3)" stroke="var(--surface)" strokeWidth={1.5} pointerEvents="none" />}
              {stuckShown && (
                <g pointerEvents="none">
                  <circle className="plan-local-stuck" cx={X(end.x)} cy={Y(end.y)} r={14} />
                  <text className="plan-local-note" x={X(end.x)} y={Y(end.y) - 19} textAnchor="middle" style={{ fill: 'var(--bad)', fontWeight: 700 }}>
                    {saddle ? 'balanced' : 'stuck'}
                  </text>
                </g>
              )}
              <line ref={repRef} stroke="var(--m2)" strokeWidth={3} markerEnd={`url(#${uid}-rep)`} pointerEvents="none" />
              <line ref={attRef} stroke="var(--m1)" strokeWidth={3} markerEnd={`url(#${uid}-att)`} pointerEvents="none" />
              <line ref={totRef} stroke="var(--text)" strokeWidth={2} markerEnd={`url(#${uid}-tot)`} pointerEvents="none" />
              <circle ref={robotRef} className="plan-local-robot" r={7} pointerEvents="none" />
              <g
                className="plan-local-drag"
                tabIndex={0}
                role="button"
                aria-label={`Start S at (${scene.start.x}, ${scene.start.y}) m: drag it or use the arrow keys`}
                onPointerDown={(e) => startDrag(e, { kind: 'start' })}
                onKeyDown={(e) => nudge(e, 'start')}
              >
                <circle cx={X(scene.start.x)} cy={Y(scene.start.y)} r={16} fill="transparent" />
                <circle className="plan-local-focus" cx={X(scene.start.x)} cy={Y(scene.start.y)} r={12} fill="none" />
                <circle cx={X(scene.start.x)} cy={Y(scene.start.y)} r={8} fill="var(--surface)" stroke="var(--text)" strokeWidth={2.5} />
                <text className="plan-local-label" x={X(scene.start.x)} y={Y(scene.start.y) + 25} textAnchor="middle">
                  S
                </text>
              </g>
              <g
                className="plan-local-drag"
                tabIndex={0}
                role="button"
                aria-label={`Goal G at (${scene.goal.x}, ${scene.goal.y}) m: drag it or use the arrow keys`}
                onPointerDown={(e) => startDrag(e, { kind: 'goal' })}
                onKeyDown={(e) => nudge(e, 'goal')}
              >
                <circle cx={X(scene.goal.x)} cy={Y(scene.goal.y)} r={16} fill="transparent" />
                <circle className="plan-local-focus" cx={X(scene.goal.x)} cy={Y(scene.goal.y)} r={13} fill="none" />
                <circle cx={X(scene.goal.x)} cy={Y(scene.goal.y)} r={9} fill="var(--surface)" stroke="var(--ok)" strokeWidth={2.5} />
                <circle cx={X(scene.goal.x)} cy={Y(scene.goal.y)} r={3.5} fill="var(--ok)" />
                <text className="plan-local-label" x={X(scene.goal.x)} y={Y(scene.goal.y) + 26} textAnchor="middle">
                  G
                </text>
              </g>
            </svg>
          </div>
          <div className="plan-local-bar">
            <Button size="sm" onClick={toStart} title="Back to S" aria-label="Back to the start">
              ⏮
            </Button>
            <Button size="sm" variant="primary" onClick={() => (playing ? setPlaying(false) : play())}>
              {playing ? '⏸ Pause' : atEnd ? '▶ Play from S' : '▶ Play'}
            </Button>
            <Button size="sm" onClick={() => stepBy(0.5)} disabled={!geo.total} title="Ten 5 cm steps" aria-label="Step forward 0.5 m">
              ▶| 0.5 m
            </Button>
            <Segmented size="sm" label="Playback speed" value={speed} onChange={setSpeed} options={[1, 2, 4].map((k) => ({ value: k, label: `×${k}` }))} />
            <span className="plan-local-pos mono small muted">{fmt(geo.total, 3)} m path</span>
          </div>
          <div className="plan-local-legend" aria-hidden="true">
            <span>
              <span className="plan-local-swatch" style={{ background: 'linear-gradient(90deg, var(--surface), var(--m1))' }} /> pull of G (bluer = higher U)
            </span>
            <span>
              <span className="plan-local-swatch" style={{ background: 'var(--m2)' }} /> push of obstacles
            </span>
            <span>
              <svg width="22" height="10">
                <line x1="1" y1="5" x2="21" y2="5" stroke="var(--m2)" strokeWidth="1.5" strokeDasharray="5 4" />
              </svg>
              Q* (influence)
            </span>
            {showBasin && (
              <span>
                <span className="plan-local-swatch" style={{ background: 'var(--bad)', opacity: 0.45 }} /> starts that get stuck
              </span>
            )}
          </div>
        </section>

        <section className="plan-local-panel" aria-label="Controls">
          <div className="plan-local-sliders" onPointerDown={(e) => (e.target as HTMLElement).tagName === 'INPUT' && setDragging(true)}>
            <Slider label="attractive gain" tex="\zeta" tip="ζ scales the pull of the goal: U_att = ½ζd² within d* = 2 m, then grows linearly" value={params.kAtt} min={0.2} max={5} log onChange={(x) => setParam('kAtt', x)} />
            <Slider label="repulsive gain" tex="\eta" tip="η scales the push of each obstacle: U_rep = ½η(1/D − 1/Q*)² inside Q*" value={params.kRep} min={0.1} max={10} log onChange={(x) => setParam('kRep', x)} />
            <Slider label="influence distance" tex="Q^*" tip="Q*: obstacles push only within this distance of their surface" value={params.d0} min={0.2} max={3} step={0.05} unit="m" onChange={(x) => setParam('d0', x)} />
          </div>
          <div className="plan-local-toggles">
            <Toggle checked={showRings} onChange={setShowRings} label="Q* rings" />
            <Toggle checked={showArrows} onChange={setShowArrows} label="−∇U arrows" />
            <Toggle checked={showBasin} onChange={setShowBasin} label={showBasin && basinRows < N_BASIN ? `Trap basins (${basinPct} %)` : 'Trap basins'} />
          </div>
          {selShape && sel !== null && (
            <div className="plan-local-sliders">
              {selShape.kind === 'circle' && <Slider label={`obstacle ${sel + 1} radius`} value={selShape.r} min={0.2} max={2.5} step={0.05} unit="m" onChange={(x) => resize(sel, { r: x })} />}
              {selShape.kind === 'rect' && (
                <>
                  <Slider label={`obstacle ${sel + 1} width`} value={selShape.w} min={0.2} max={6} step={0.1} unit="m" onChange={(x) => resize(sel, { w: x })} />
                  <Slider label={`obstacle ${sel + 1} height`} value={selShape.h} min={0.2} max={6} step={0.1} unit="m" onChange={(x) => resize(sel, { h: x })} />
                </>
              )}
            </div>
          )}
          <div className="plan-local-ro" aria-label="Values at the robot">
            {[
              ['U', 'potential at the robot (arbitrary units; 0 at G)'],
              ['|F_{att}|', 'pull of the goal (arbitrary units)'],
              ['|F_{rep}|', 'push of the obstacles (arbitrary units)'],
              ['|\\nabla U|', 'net force: the slope the robot follows'],
              ['d_G', 'distance to the goal'],
              ['s', 'distance travelled'],
            ].map(([t, tip], k) => (
              <div className="readout" key={t} title={tip}>
                <div className="readout-label">
                  <Rich text={`$${t}$`} inline />
                </div>
                <div className="readout-value mono">
                  <span
                    ref={(el) => {
                      roRef.current[k] = el;
                    }}
                  >
                    —
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Rich
            className="note"
            text="Arrows at the robot: $F_{att}$ (blue, toward G), $F_{rep}$ (orange, away from obstacles) and their sum $-\nabla U$ (thin arrow), the direction of the next 5 cm step."
          />
          <div className="plan-local-status" aria-live="polite">
            {playing || !atEnd ? (
              <p className="plan-local-live" style={{ margin: 0 }}>
                <span ref={liveRef} />
              </p>
            ) : (
              <Callout kind={v.kind === 'ok' ? 'ok' : v.kind === 'warn' ? 'warn' : 'bad'} title={v.title}>
                <Rich text={v.text} />
              </Callout>
            )}
          </div>
          <div>
            <div className="plan-local-head">
              <h4>U along the robot’s path</h4>
              <span className="muted">the dot follows the robot</span>
            </div>
            <Plot x={{ min: 0, max: Math.max(0.5, geo.total), label: 'distance travelled (m)' }} y={{ min: 0, max: pathSer.top * 1.12, label: 'U' }} height={170} ariaLabel="Potential along the robot's path">
              <ScalesGrab to={scalesRef} onChange={redraw} />
              <Line points={{ x: pathSer.x, y: pathSer.desc }} color="var(--accent)" width={2.2} />
              <Line points={{ x: pathSer.x, y: pathSer.walk }} color="var(--pred)" width={1.6} dash />
              <circle ref={phRef} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} cx={-50} cy={-50} />
            </Plot>
            <Rich
              className="plan-local-cap"
              text={
                mode === 'global' && run.plan
                  ? 'With the plan, $U$ (measured toward G) may rise: the robot is pulled toward the sub-goal, not G, which is how it gets round the obstacle.'
                  : mode === 'walk' && run.walks.length
                    ? 'Descent only goes downhill; the random walks (purple) climb, which is the only way out of a dip.'
                    : `Descent only ever goes **downhill**: $U$ never rises along the path. ${run.status === 'goal' ? 'It reaches 0 at G.' : 'It levels off above 0: that plateau is the local minimum.'}`
              }
            />
          </div>
          {mode === 'global' && (
            <Rich
              className="note"
              text={
                run.plan
                  ? '**Two layers.** The global planner (A* on the known map, slow, run once) decides which way round; the reactive field (fast, every step) follows a sub-goal 1.2 m ahead on its path and keeps clear of obstacles.'
                  : 'The global planner found no route on its 25 cm grid (obstacles grown by 0.45 m), so the robot falls back to plain descent.'
              }
            />
          )}
          {(challengeMet || chalDone) && (
            <Callout kind="ok" title="Challenge: trap built">
              <Rich text="A real trap needs a **concave** pocket (a U, a V or two obstacles side by side) facing S with G behind it: inside the pocket every direction is uphill, so the pull and the push balance in a dip." />
            </Callout>
          )}
        </section>
      </div>

      <div className="plan-local-profiles">
        <section className="plan-local-panel" aria-label="U along the straight line from S to G">
          <div className="plan-local-head">
            <h4>U along the straight line S → G</h4>
            <span className="muted">the dotted line on the map</span>
          </div>
          <Plot x={{ min: 0, max: Lline, label: 'distance from S along the line (m)' }} y={{ min: 0, max: yLine, label: 'U' }} height={210} ariaLabel="Potential along the straight line from S to G">
            {lineProf.inside.map(([a, b], k) => (
              <Band key={k} x0={a} x1={b} color="var(--text-3)" opacity={0.28} label={k === 0 ? 'inside' : undefined} />
            ))}
            <Line points={{ x: lineProf.s, y: lineProf.Uatt }} color="var(--m1)" dash width={1.6} />
            <Line points={{ x: lineProf.s, y: lineProf.U }} color="var(--text)" width={2.2} />
            {dip && <Dot x={dip.s} y={dip.U} color="var(--bad)" label="dip" labelPos="above" />}
          </Plot>
          <Rich
            className="plan-local-cap"
            text={`Solid: $U$; dashed: the pull alone, $U_{att}$. The gap between them is the push $U_{rep}$: a hill (clipped; $\\infty$ inside). ${
              dip ? 'A hill on the way makes a **dip** in front of it. If $U$ also rises sideways there, the dip is a local minimum and the robot stops in it; if not, it is a pass and the robot slides round.' : 'No dip on this line: it runs downhill all the way to G.'
            }`}
          />
        </section>
        <section className="plan-local-panel" aria-label="The potential field in formulas">
          <div className="plan-local-head">
            <h4>The field in formulas</h4>
            <span className="muted">what the sliders change</span>
          </div>
          <Rich
            text={`$$U = U_{att} + U_{rep}, \\qquad \\text{step along } -\\nabla U = F_{att} + F_{rep}$$
$$U_{att} = \\tfrac12 \\zeta\\, d^2 \\ \\ (d \\le d^*), \\qquad U_{rep} = \\sum_i \\tfrac12 \\eta \\left(\\frac{1}{D_i} - \\frac{1}{Q^*}\\right)^2 \\ \\ (D_i \\le Q^*)$$

- $d$: distance to G. The pull $|F_{att}| = \\zeta d$ **fades to zero at G**, so anything that still pushes there wins. Beyond $d^*$ = 2 m it stays at $\\zeta d^*$ (a conic bowl), so far-off goals do not pull ever harder.
- $D_i$: distance to obstacle $i$’s surface. Its push grows like $1/D_i^2$ near it and is **exactly 0 beyond $Q^*$**: $Q^*$ sets how far the orange zone reaches, $\\eta$ how hard it pushes. Pushes from different obstacles **add**.
- A **local minimum** is any point where $F_{att} + F_{rep} = 0$ but $U > 0$.`}
          />
        </section>
      </div>

      <div className="plan-local-predicts">
        <PredictReveal
          id="plan-potential-utrap"
          question="**U-shaped trap.** S faces the open side of a U; G is behind the U’s back wall. With plain gradient descent, where does the robot end up?"
          options={['It slides round the U and reaches G', 'It drives into the back wall', 'It stops inside the U, short of the back wall', 'It oscillates for ever between the arms']}
          answer={2}
          explain="Inside the U the pull of G points straight through the back wall and the wall pushes straight back. Where they balance, $-\nabla U = 0$ but $U > 0$: a **local minimum**. Every direction out of the pocket is uphill, and gradient descent never goes uphill, so the robot stops there (the red ring). It never touches the wall: the push grows like $1/D^2$."
          tryIt="load the U-shaped trap and play it from S."
          onApply={reveal(() => load('trap', { play: true }))}
        />
        <PredictReveal
          id="plan-potential-gain"
          question="Still in the U-trap: raise the attractive gain $\zeta$ from 1 to 4. Does the stronger pull get the robot out?"
          options={['No: it stops in the same pocket, a little deeper', 'Yes: it drags the robot round the arm', 'It crashes through the back wall']}
          answer={0}
          explain="Scaling the pull only moves the balance point: with $\zeta$ = 4 the robot stops about 0.2 m deeper in the U (where the wall pushes four times harder). The dip exists because G is **behind** the obstacle, a property of the geometry, so no choice of gains removes it. Changing gains tunes a potential field; it does not make it complete."
          tryIt="load the trap with ζ = 4 and play it."
          onApply={reveal(() => load('trap', { params: { kAtt: 4 }, play: true }))}
        />
        <PredictReveal
          id="plan-potential-gap"
          question="**Narrow gap.** Two discs leave a 1 m gap on the straight line. With $Q^*$ = 0.6 m the robot passes. What happens with $Q^*$ = 1.5 m?"
          options={['It still passes, just more slowly', 'It goes round the outside of a disc', 'It stops in front of the gap']}
          answer={2}
          explain="Each disc pushes out to $Q^*$ from its surface. With $Q^*$ = 1.5 m, more than half the gap (0.5 m), **both** discs push everywhere in the gap; the pushes add up into a ridge across it that the pull cannot climb, and the robot stops in front (watch the orange zones overlap). A large $Q^*$ is safe in the open but closes doorways."
          tryIt="load the narrow gap with Q* = 1.5 m and play it; then drag Q* back down."
          onApply={reveal(() => load('gap', { params: { d0: 1.5 }, play: true }))}
        />
        <PredictReveal
          id="plan-potential-gnron"
          question="**Goal next to a wall.** G is 0.4 m in front of a wall and $Q^*$ = 1.5 m. Where does the robot stop?"
          options={['Exactly at G: the pull vanishes there', 'Short of G: the wall still pushes at G', 'Against the wall, overshooting G']}
          answer={1}
          explain="The wall is closer to G than $Q^*$, so it still pushes **at G**. Near G the pull is weak (it vanishes at G), so the minimum of $U$ sits where the pull equals the push, about 0.5 m short of G. This is the *goal non-reachable with obstacles nearby* problem; the fix is a $Q^*$ smaller than the goal’s distance to the wall (try 0.3 m)."
          tryIt="load “Goal by a wall” and play it."
          onApply={reveal(() => load('near', { play: true }))}
        />
        <PredictReveal
          id="plan-potential-global"
          question="Back in the U-trap, switch the escape strategy to **Global plan**. What does the robot do?"
          options={['Follows the plan round the U and reaches G', 'Stops in the same local minimum', 'Wanders randomly until it finds the way out']}
          answer={0}
          explain="A* on a coarse grid of the known map finds the way round the U (green). The field is now attracted to a sub-goal 1.2 m ahead on that path; the sub-goal is never behind a wall, so no dip forms between the robot and it. This is the planning hierarchy: a slow global planner chooses **which way round**, a fast reactive planner handles the details and anything the map did not show."
          tryIt="load the trap with the global plan and play it."
          onApply={reveal(() => load('trap', { mode: 'global', play: true }))}
        />
        <PredictReveal
          id="plan-potential-saddle"
          question="A disc sits **exactly** on the straight line from S to G. What does plain descent do?"
          options={['Slides round the disc and reaches G', 'Stops in front of the disc', 'Hits the disc']}
          answer={1}
          explain="With S, the disc and G in one line, the pull and the push are exactly opposite, so the robot never gets a sideways component and stops in front of the disc. This is a **saddle**, not a dip: move S 10 cm sideways and it slides round. Real trap or saddle, a reactive planner cannot tell from the gradient alone."
          tryIt="load “Disc dead ahead” and play it; then nudge S up with the arrow key."
          onApply={reveal(() => load('headon', { play: true }))}
        />
      </div>

      <More label="The potential-field method, its failure modes and the fixes">
        <Rich
          text={`The robot moves along the negative gradient of an artificial potential (summary notes §5):
$$U(q) = U_{att}(q) + U_{rep}(q), \\qquad \\dot q \\propto -\\nabla U(q)$$
$$U_{att}(q) = \\begin{cases} \\tfrac12 \\zeta\\, d^2 & d \\le d^* \\\\ d^* \\zeta\\, d - \\tfrac12 \\zeta\\, d^{*2} & d > d^* \\end{cases} \\qquad U_{rep}(q) = \\sum_{\\text{obstacles}} \\begin{cases} \\tfrac12 \\eta \\left(\\dfrac{1}{D(q)} - \\dfrac{1}{Q^*}\\right)^2 & D(q) \\le Q^* \\\\ 0 & D(q) > Q^* \\end{cases}$$
where $d = \\lVert q - q_{goal} \\rVert$, $D(q)$ is the distance to the obstacle’s surface and $d^*$ = 2 m here (beyond it the pull stays bounded). This simulation takes fixed 5 cm steps along $-\\nabla U$ and calls it stuck when the robot stops making progress.

**Why use it:** it is cheap (one gradient per step), smooth and reactive, so it can run at the control rate and dodge things the map did not show.

**How it fails:**

- **Local minima**: a concave obstacle (a U, a V, two obstacles side by side) between S and G makes a dip where $\\nabla U = 0$ but $U > 0$. Gains only move the dip.
- **Closed passages**: when $Q^*$ is more than half a gap, both sides push in it and the gap disappears.
- **Goal near an obstacle**: an obstacle within $Q^*$ of G moves the minimum off G.
- **Saddles and oscillation**: perfectly symmetric cases stall on a ridge, and narrow corridors make it zig-zag.

**Fixes:** random walks to climb out (slow, by luck); a **global planner** whose waypoints become the attractor (the hierarchy: A*, PRM or RRT on the known map, the field locally); or a potential with no local minima by construction (navigation functions, harmonic potentials). A reactive method alone is not complete.`}
        />
      </More>
    </div>
  );
}

function latestWalkNo(g: Geo, i: number): number {
  let k = 0;
  for (let j = 1; j <= i; j++) if (g.walk[j] === 1 && g.walk[j - 1] !== 1) k++;
  return Math.max(1, k);
}
