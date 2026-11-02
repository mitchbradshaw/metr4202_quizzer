// PRM, RRT and RRT*: watch them grow (sim "sampling").
//
// One 10 m × 10 m world, three planners:
//   - RRT and RRT* always run side by side on the SAME random samples (same seed), so the cost plot shows the
//     difference the algorithm makes: RRT's first path stays put, RRT* keeps shortening it towards the
//     shortest possible path (a visibility-graph reference, samplingOptimal.ts).
//   - Played slowly (or stepped), each RRT* iteration is drawn in order: sample → nearest → steer →
//     neighbourhood → choose parent (c + d on every candidate) → rewire (old edge crossed out, new edge flashed),
//     with the exam's two tables underneath. Played fast, the newest growth and every rewire flash on the canvas.
//   - PRM builds a roadmap vertex by vertex; dragging start or goal re-queries it instantly (multi-query), while
//     moving them under RRT throws the tree away and regrows it (single-query).
//   - "Check collisions only at the new node" reproduces the 2023 Q32c mistake: edges through obstacles.
// The trees and roadmaps are computed a few milliseconds per frame (samplingEngine.ts, samplingPrm.ts) and drawn
// on a canvas; React re-renders the text, tables and plot at most ~12 times a second while playing fast.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Button, Callout, Legend, More, Readout, Readouts, Segmented, SimLayout, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { Dot, HLine, Line, Plot } from '../../../plot/Plot';
import { useRaf, useWidth } from '../../../anim/hooks';
import { mixRgb, rgbOf, useThemeColors } from '../../../ui/theme';
import { svgPoint } from '../../../ui/diagrams';
import { dist, type Vec2 } from '../../../core/geom2d';
import { makeRng } from '../../../engine/rng';
import { GrowRun, WORLDS, WORLD_KEYS, nearestFree, type CheckMode, type WorldKey } from './samplingEngine';
import { PrmCurve, PrmRun, type PrmConnect, type PrmQuery } from './samplingPrm';
import { shortestFreePath } from './samplingOptimal';
import { VIEW, crossingSegments, paintCircle, paintPath, paintRoadmap, paintTree, paintWorld, sx, sy, wx, wy, type Palette } from './samplingDraw';
import { PrmStepOverlay, StarTables, TreeStepOverlay, V, candRows, f2, fromTo } from './samplingOverlay';
import '../sampling.css';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'sampling',
  title: 'PRM, RRT and RRT*: watch them grow',
  summary:
    'Grow a roadmap or a tree step by step or at speed. RRT* shows its neighbourhood, choose-parent and every rewire; the cost plot runs RRT and RRT* on the same samples; drag start and goal to see why a PRM is multi-query and an RRT is not.',
  notice:
    'On the same samples, RRT’s first path barely changes however long it runs, while RRT* keeps shortening it towards the shortest possible path: choose-parent and rewire repair early jagged branches, at the price of many more collision checks.',
  minutes: 10,
};

type Planner = 'prm' | 'rrt' | 'star';
type End = 'start' | 'goal';

interface Cfg {
  planner: Planner;
  world: WorldKey;
  start: Vec2;
  goal: Vec2;
  /** RRT / RRT*: step size η, goal bias, RRT* neighbourhood radius. */
  step: number;
  bias: number;
  radius: number;
  /** PRM: samples, connection rule, radius, k. */
  prmN: number;
  prmConnect: PrmConnect;
  prmR: number;
  prmK: number;
  check: CheckMode;
  seed: number;
}

const N_IT = 2000;
const SPEEDS = [1, 2, 10, 50, 200, 1000];
const THEME = ['--surface', '--text', '--text-2', '--text-3', '--grid', '--m1', '--m2', '--m3', '--m4', '--bad', '--accent'] as const;

const DEFAULT: Cfg = {
  planner: 'star',
  world: 'cluttered',
  start: WORLDS.cluttered.start,
  goal: WORLDS.cluttered.goal,
  step: 0.6,
  bias: 0.05,
  radius: 1.5,
  prmN: 200,
  prmConnect: 'radius',
  prmR: 1.5,
  prmK: 6,
  check: 'edge',
  seed: 1,
};

const NAME: Record<Planner, string> = { prm: 'PRM', rrt: 'RRT', star: 'RRT*' };
const COLOR: Record<Planner, string> = { prm: 'var(--m2)', rrt: 'var(--m1)', star: 'var(--m3)' };
const int = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-AU') : '–');
const pctAbove = (c: number, opt: number) => (Number.isFinite(c) && Number.isFinite(opt) && opt > 0 ? `${c < opt - 1e-9 ? '−' : '+'}${Math.abs((c / opt - 1) * 100).toFixed(1)} %` : '–');
const xy = (p: Vec2) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
/** A query time; browsers round performance.now(), so anything this fast reads "under 0.1". */
const msText = (ms: number) => (ms < 0.1 ? 'under 0.1' : ms.toFixed(1));

/** Step-line points of best-cost-so-far (NaN until the first path), iterations 0 … upto. */
function costSteps(best: readonly number[], upto: number): [number, number][] {
  const pts: [number, number][] = [];
  let prev = NaN;
  for (let k = 0; k <= upto && k < best.length; k++) {
    const c = best[k];
    if (!Number.isFinite(c)) {
      prev = NaN;
      continue;
    }
    if (!Number.isFinite(prev)) pts.push([k, c]);
    else if (c !== prev) pts.push([k, prev], [k, c]);
    prev = c;
  }
  if (pts.length && Number.isFinite(prev)) pts.push([Math.min(upto, best.length - 1), prev]);
  return pts;
}

/** Size of the subtree below each of `ids` (excluding the node itself), from a parent array. */
function subtreeSizes(par: Int32Array, ids: number[]): number[] {
  if (!ids.length) return [];
  const kids: number[][] = Array.from({ length: par.length }, () => []);
  for (let k = 1; k < par.length; k++) if (par[k] >= 0) kids[par[k]].push(k);
  return ids.map((id) => {
    let n = 0;
    const st = [...(kids[id] ?? [])];
    while (st.length) {
      const k = st.pop()!;
      n++;
      for (const c of kids[k]) st.push(c);
    }
    return n;
  });
}

type Scenario = 'rrt-flat' | 'prm-multi' | 'endpoint' | 'radius' | 'prm-sparse';

export default function SamplingPlanners() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT);
  const [showOpt, setShowOpt] = useState(true);
  const [showOther, setShowOther] = useState(true);
  const [iter, setIter] = useState(0);
  const [playing, setPlayingS] = useState(true);
  const [speed, setSpeedS] = useState(50);
  const [drag, setDrag] = useState<{ which: End; p: Vec2 } | null>(null);
  const [tally, setTally] = useState({ prmQueries: 1, trees: 1 });
  const [tour, setTour] = useState<{ k: number; of: number } | null>(null);
  const [doneTick, setDoneTick] = useState(0);
  /** Finished RRT* runs (2000 iterations) on the same samples and settings, one row per neighbourhood radius. */
  const [radiusRuns, setRadiusRuns] = useState<{ key: string; rows: { r: number; cost: number; checks: number }[] }>({ key: '', rows: [] });
  /** Radii still to run in the "Show me" for the radius prediction. */
  const pendingRadii = useRef<number[]>([]);
  /** Bumped by that "Show me", so the sequence also starts when the first run was already finished. */
  const [radiusDemo, setRadiusDemo] = useState(0);

  const W = WORLDS[cfg.world];
  const world = W.world;
  const tree = cfg.planner !== 'prm';
  const star = cfg.planner === 'star';
  const N = tree ? N_IT : cfg.prmN;

  // ---------------------------------------------------------------- the runs (computed lazily in the frame loop)
  const growKey = [cfg.world, cfg.start.x, cfg.start.y, cfg.goal.x, cfg.goal.y, cfg.step, cfg.bias, cfg.radius, cfg.check, cfg.seed].join('|');
  const grow = useMemo(() => {
    const base = { world, start: cfg.start, goal: cfg.goal, step: cfg.step, goalBias: cfg.bias, radius: cfg.radius, check: cfg.check, seed: cfg.seed, maxIt: N_IT };
    return { rrt: new GrowRun({ ...base, star: false }), star: new GrowRun({ ...base, star: true }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growKey]);
  const prmKey = [cfg.world, cfg.prmN, cfg.prmConnect, cfg.prmR, cfg.prmK, cfg.check, cfg.seed].join('|');
  const prm = useMemo(
    () => new PrmRun({ world, n: cfg.prmN, connect: cfg.prmConnect, radius: cfg.prmR, k: cfg.prmK, check: cfg.check, seed: cfg.seed }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prmKey]
  );
  const curve = useMemo(() => new PrmCurve(prm, cfg.start, cfg.goal), [prm, cfg.start, cfg.goal]);
  const optimal = useMemo(() => shortestFreePath(world, cfg.start, cfg.goal), [world, cfg.start, cfg.goal]);
  const shown = star ? grow.star : grow.rrt;
  const other = star ? grow.rrt : grow.star;
  const sameSamplesKey = [cfg.world, cfg.start.x, cfg.start.y, cfg.goal.x, cfg.goal.y, cfg.step, cfg.bias, cfg.check, cfg.seed].join('|');

  // PRM query and pieces, cached (the frame loop and the render share them).
  const qCache = useRef<{ prm: PrmRun | null; m: number; s: Vec2 | null; g: Vec2 | null; q: PrmQuery | null; ms: number }>({ prm: null, m: -1, s: null, g: null, q: null, ms: 0 });
  const queryAt = (m: number) => {
    const c = qCache.current;
    if (c.q && c.prm === prm && c.m === m && c.s === cfg.start && c.g === cfg.goal) return c;
    const t = performance.now();
    const q = prm.query(m, cfg.start, cfg.goal);
    qCache.current = { prm, m, s: cfg.start, g: cfg.goal, q, ms: performance.now() - t };
    return qCache.current;
  };
  const pCache = useRef<{ prm: PrmRun | null; m: number; v: { count: number; of: Int32Array } | null }>({ prm: null, m: -1, v: null });
  const piecesAt = (m: number) => {
    const c = pCache.current;
    if (c.v && c.prm === prm && c.m === m) return c.v;
    const v = prm.components(m);
    pCache.current = { prm, m, v };
    return v;
  };

  // ---------------------------------------------------------------- display state (refs for the frame loop)
  const target = useRef(0);
  const playRef = useRef(true);
  const speedRef = useRef(50);
  const stopAtFirst = useRef(false);
  const committed = useRef(0);
  const lastCommit = useRef(0);
  const drawnSig = useRef('');
  const dirty = useRef(true);
  /** The runs (or PRM curve) whose finished computation has already refreshed the plot. */
  const doneFor = useRef<unknown>(null);
  const setPlaying = useCallback((p: boolean) => {
    playRef.current = p;
    setPlayingS(p);
  }, []);
  const setSpeed = useCallback((s: number) => {
    speedRef.current = s;
    setSpeedS(s);
  }, []);
  const detail = !playing || speed <= 2;
  const computedNow = tree ? shown.it : prm.count;
  const vi = Math.max(0, Math.min(iter, computedNow));

  useEffect(() => {
    dirty.current = true;
  });

  // ---------------------------------------------------------------- canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boxRef, boxW] = useWidth<HTMLDivElement>(600);
  const theme = useThemeColors(THEME);
  const pal = useMemo<Palette>(() => {
    const ob = mixRgb(rgbOf(theme['--text']), rgbOf(theme['--surface']), 0.74).map(Math.round);
    return {
      surface: theme['--surface'],
      text: theme['--text'],
      text2: theme['--text-2'],
      text3: theme['--text-3'],
      grid: theme['--grid'],
      obstacle: `rgb(${ob.join(',')})`,
      m1: theme['--m1'],
      m2: theme['--m2'],
      m3: theme['--m3'],
      m4: theme['--m4'],
      bad: theme['--bad'],
      accent: theme['--accent'],
    };
  }, [theme]);

  const paint = (i: number, det: boolean) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(200, Math.round(boxW * dpr));
    if (cv.width !== px || cv.height !== px) {
      cv.width = px;
      cv.height = px;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(px / VIEW, 0, 0, px / VIEW, 0, 0);
    paintWorld(ctx, world, pal);
    if (showOpt && optimal.path) paintPath(ctx, optimal.path, { color: pal.text3, width: 2.2, dash: [8, 6] });
    const win = Math.max(2, Math.min(80, Math.round(speedRef.current * 0.4)));
    if (tree) {
      const fade = drag ? 0.25 : 1;
      const before = det && i > 0 ? i - 1 : i;
      const par = shown.parentsAt(before);
      const bad = shown.badAt(before);
      let flash: { id: number; to: number; age: number }[] | undefined;
      let newFrom: number | undefined;
      if (!det) {
        newFrom = shown.nodesAt[Math.max(0, i - win)];
        if (star) {
          flash = [];
          for (let k = Math.max(1, i - win + 1); k <= i; k++) for (const r of shown.rewiresIn(k)) flash.push({ id: r.id, to: r.to, age: (i - k) / win });
        }
      }
      paintTree(ctx, shown, { par, bad, edgeColor: pal.text3, nodeColor: pal.text2, dots: det || par.length <= 400, newFrom, newColor: pal.m2, flash, flashColor: pal.m4, badColor: pal.bad, alpha: fade });
      paintCircle(ctx, cfg.goal, cfg.step, pal.accent, 0.6 * fade);
      if (showOther) {
        const op = other.pathAt(Math.min(i, other.it));
        if (op) paintPath(ctx, op, { color: star ? pal.m1 : pal.m3, width: 2, dash: [6, 5], alpha: 0.9 * fade });
      }
      const path = shown.pathAt(i, before === i ? par : undefined);
      if (path) paintPath(ctx, path, { color: star ? pal.m3 : pal.m1, width: 3.6, halo: pal.surface, alpha: fade, bad: cfg.check === 'endpoint' ? crossingSegments(world, path) : undefined, badColor: pal.bad });
    } else {
      const m = det && i > 0 ? i - 1 : i;
      const { q } = queryAt(i);
      const pieces = piecesAt(i);
      let strong: Set<number> | undefined;
      if (q && q.ids) strong = new Set(q.ids.filter((v) => v >= 0).map((v) => pieces.of[v]));
      else if (q && (q.startLinks.length || q.goalLinks.length)) strong = new Set([...q.startLinks, ...q.goalLinks].map((v) => pieces.of[v]));
      paintRoadmap(ctx, prm, { m, edgeColor: pal.text3, nodeColor: pal.text2, badColor: pal.bad, newFrom: det ? undefined : Math.max(0, i - win), newColor: pal.m2, piece: pieces.of, strong });
      if (q) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = pal.text2;
        ctx.lineWidth = 1.3;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        for (const [end, links] of [
          [cfg.start, q.startLinks],
          [cfg.goal, q.goalLinks],
        ] as const)
          for (const v of links) {
            ctx.moveTo(sx(end.x), sy(end.y));
            ctx.lineTo(sx(prm.px[v]), sy(prm.py[v]));
          }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (q.path) paintPath(ctx, q.path, { color: pal.m2, width: 3.6, halo: pal.surface, bad: q.bad, badColor: pal.bad });
      }
    }
  };

  // ---------------------------------------------------------------- frame loop: compute ahead, play, draw, commit
  useRaf(
    (dt) => {
      const now = performance.now();
      if (tree) {
        if (!shown.done) shown.advanceFor(4);
        if (!other.done) other.advanceFor(shown.done ? 6 : 2);
      } else {
        if (!prm.done) prm.advanceFor(4);
        curve.advanceFor(prm.done ? 5 : 2);
      }
      const done = tree ? shown.done && other.done : prm.done && curve.filled > prm.count;
      const doneKey = tree ? grow : curve;
      if (done && doneFor.current !== doneKey) {
        doneFor.current = doneKey;
        setDoneTick((t) => t + 1);
      }
      const comp = tree ? shown.it : prm.count;
      if (playRef.current && !drag) {
        let t = target.current + dt * speedRef.current;
        if (stopAtFirst.current && tree && shown.firstIt >= 0 && t >= shown.firstIt) {
          t = shown.firstIt;
          stopAtFirst.current = false;
          setPlaying(false);
        }
        if (t >= N) {
          t = N;
          setPlaying(false);
        }
        target.current = Math.min(t, comp + 0.999);
      }
      const i = Math.max(0, Math.min(Math.floor(target.current), comp));
      const det = !playRef.current || speedRef.current <= 2;
      const sig = `${i}|${det}`;
      if (sig !== drawnSig.current || dirty.current || (!det && playRef.current)) {
        paint(i, det);
        drawnSig.current = sig;
        dirty.current = false;
      }
      if (i !== committed.current && (det || now - lastCommit.current > 80)) {
        committed.current = i;
        lastCommit.current = now;
        setIter(i);
      }
    },
    true,
    boxRef
  );

  // ---------------------------------------------------------------- actions
  const jump = (k: number) => {
    stopAtFirst.current = false;
    setPlaying(false);
    target.current = Math.max(0, Math.min(N, k));
  };
  const restart = (sp: number, stopFirst: boolean) => {
    target.current = 0;
    committed.current = -1;
    stopAtFirst.current = stopFirst;
    setSpeed(sp);
    setPlaying(true);
  };
  const toggle = () => {
    stopAtFirst.current = false;
    if (playing) setPlaying(false);
    else {
      if (target.current >= N) target.current = 0;
      setPlaying(true);
    }
  };

  const tourTimer = useRef<number | null>(null);
  const stopTour = () => {
    if (tourTimer.current !== null) window.clearTimeout(tourTimer.current);
    tourTimer.current = null;
    setTour(null);
  };
  useEffect(
    () => () => {
      if (tourTimer.current !== null) window.clearTimeout(tourTimer.current);
    },
    []
  );
  const queryRng = useRef(makeRng(4202));
  const randomQuery = (wk: WorldKey = cfg.world): { s: Vec2; g: Vec2 } => {
    const r = queryRng.current;
    const wd = WORLDS[wk].world;
    let best = { s: WORLDS[wk].start, g: WORLDS[wk].goal };
    for (let k = 0; k < 60; k++) {
      const s = nearestFree(wd, { x: r.uniform(0.4, 9.6), y: r.uniform(0.4, 9.6) });
      const g = nearestFree(wd, { x: r.uniform(0.4, 9.6), y: r.uniform(0.4, 9.6) });
      best = { s, g };
      if (dist(s, g) >= 6) break;
    }
    return best;
  };
  /** A new start/goal: PRM answers on its roadmap; RRT throws its tree away and regrows it. */
  const newEnds = (s: Vec2, g: Vec2) => {
    setCfg((c) => ({ ...c, start: s, goal: g }));
    if (tree) {
      setTally((t) => ({ ...t, trees: t.trees + 1 }));
      restart(Math.max(speedRef.current, 200), true);
    } else setTally((t) => ({ ...t, prmQueries: t.prmQueries + 1 }));
  };
  const newQuery = () => {
    stopTour();
    const r = randomQuery();
    newEnds(r.s, r.g);
  };
  const runTour = (k: number, of: number) => {
    const { s, g } = randomQuery();
    setCfg((c) => ({ ...c, start: s, goal: g }));
    setTally((t) => ({ ...t, prmQueries: t.prmQueries + 1 }));
    setTour({ k, of });
    tourTimer.current = window.setTimeout(() => {
      if (k < of) runTour(k + 1, of);
      else {
        tourTimer.current = null;
        setTour(null);
      }
    }, 1400);
  };

  const setPlanner = (p: Planner) => {
    stopTour();
    if ((p === 'prm') !== (cfg.planner === 'prm')) restart(speedRef.current <= 2 ? 50 : speedRef.current, false);
    setCfg((c) => ({ ...c, planner: p }));
  };
  const setWorld = (k: WorldKey) => {
    stopTour();
    setCfg((c) => ({ ...c, world: k, start: WORLDS[k].start, goal: WORLDS[k].goal }));
    restart(speedRef.current <= 2 ? 50 : speedRef.current, false);
  };
  const patch = (p: Partial<Cfg>) => {
    stopTour();
    pendingRadii.current = [];
    setCfg((c) => ({ ...c, ...p }));
    if (p.prmN !== undefined) target.current = Math.min(target.current, p.prmN);
  };

  const apply = (s: Scenario) => {
    stopTour();
    pendingRadii.current = [];
    // The answer happens in the simulation, which is above the prediction boxes: bring it into view.
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const preset = (k: WorldKey) => ({ world: k, start: WORLDS[k].start, goal: WORLDS[k].goal });
    if (s === 'rrt-flat') {
      setCfg((c) => ({ ...c, ...preset('open'), planner: 'rrt', step: 0.6, bias: 0.05, radius: 1.5, check: 'edge', seed: 9 }));
      setShowOther(true);
      restart(200, false);
    } else if (s === 'prm-multi') {
      setCfg((c) => ({ ...c, planner: 'prm', check: 'edge' }));
      jump(cfg.prmN);
      tourTimer.current = window.setTimeout(() => runTour(1, 4), 900);
    } else if (s === 'endpoint') {
      setCfg((c) => ({ ...c, ...preset('narrow'), planner: 'rrt', step: 0.6, bias: 0.05, check: 'endpoint', seed: 1 }));
      restart(200, true);
    } else if (s === 'radius') {
      // Three radii on the same samples, each run to 2000 iterations; the table under the plot fills row by row.
      setCfg((c) => ({ ...c, ...preset('cluttered'), planner: 'star', step: 0.6, bias: 0.05, radius: 1.5, check: 'edge', seed: 1 }));
      pendingRadii.current = [2.5, 0.6];
      setRadiusDemo((k) => k + 1);
      target.current = N_IT;
      stopAtFirst.current = false;
      setPlaying(false);
    } else if (s === 'prm-sparse') {
      setCfg((c) => ({ ...c, ...preset('open'), planner: 'prm', prmN: 60, prmConnect: 'radius', prmR: 0.6, check: 'edge', seed: 1 }));
      target.current = 60;
      stopAtFirst.current = false;
      setPlaying(false);
    }
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const act = useCallback((s: Scenario) => applyRef.current(s), []);

  // ---------------------------------------------------------------- dragging start and goal
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ which: End; p: Vec2; moved: boolean } | null>(null);
  const toWorld = (e: RPointerEvent) => {
    const q = svgPoint(svgRef.current!, e.clientX, e.clientY);
    return nearestFree(world, { x: wx(q.x), y: wy(q.y) });
  };
  const onPointer = (which: End, kind: 'down' | 'move' | 'up') => (e: RPointerEvent<SVGGElement>) => {
    if (kind === 'down') {
      stopTour();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = { which, p: cfg[which], moved: false };
      if (tree) setDrag({ which, p: cfg[which] });
      return;
    }
    const d = dragging.current;
    if (!d || d.which !== which) return;
    if (kind === 'move') {
      const p = toWorld(e);
      if (dist(p, d.p) < 1e-9) return;
      d.p = p;
      d.moved = true;
      if (tree) setDrag({ which, p });
      else setCfg((c) => ({ ...c, [which]: p }));
      return;
    }
    dragging.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
    if (!d.moved) return;
    if (tree) newEnds(which === 'start' ? d.p : cfg.start, which === 'goal' ? d.p : cfg.goal);
    else setTally((t) => ({ ...t, prmQueries: t.prmQueries + 1 }));
  };
  const onKey = (which: End) => (e: RKeyboardEvent<SVGGElement>) => {
    const s = e.shiftKey ? 0.5 : 0.1;
    const k: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
    if (!k[e.key]) return;
    e.preventDefault();
    stopTour();
    const p = nearestFree(world, { x: cfg[which].x + k[e.key][0], y: cfg[which].y + k[e.key][1] });
    newEnds(which === 'start' ? p : cfg.start, which === 'goal' ? p : cfg.goal);
  };

  // ---------------------------------------------------------------- derived for the text, tables and plot
  const opt = optimal.cost;

  // Log each finished RRT* run by its radius (same samples, same everything else), then run the next radius of
  // the "Show me" sequence, if any.
  useEffect(() => {
    if (!tree || !grow.star.done) return;
    const row = { r: cfg.radius, cost: grow.star.best[N_IT], checks: grow.star.checksAt[N_IT] };
    setRadiusRuns((prev) => {
      const keep = prev.key === sameSamplesKey ? prev.rows.filter((x) => Math.abs(x.r - row.r) > 1e-9) : [];
      return { key: sameSamplesKey, rows: [...keep, row].sort((a, b) => a.r - b.r) };
    });
    const next = pendingRadii.current.shift();
    if (next !== undefined) {
      setCfg((c) => ({ ...c, radius: next }));
      target.current = N_IT;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneTick, grow, radiusDemo]);
  const radiusRows = radiusRuns.key === sameSamplesKey ? radiusRuns.rows : [];
  const pq = !tree ? queryAt(vi) : null;
  const q = pq?.q ?? null;
  const pieces = !tree ? piecesAt(vi) : null;
  const cost = tree ? shown.best[vi] : q ? q.cost : NaN;
  const firstIt = tree ? shown.firstIt : -1;
  const endpoint = cfg.check === 'endpoint';
  const badEdges = useMemo(() => (tree && endpoint ? shown.badAt(vi).reduce((s, b) => s + b, 0) : 0), [tree, endpoint, shown, vi]);
  const st = speed <= 1 && playing ? 0.15 : speed <= 2 && playing ? 0.075 : 0.11;
  /** The roadmap is complete and on show: the build is over, only queries remain. */
  const prmDone = !tree && prm.done && vi >= prm.count && vi > 0;

  // Plot data (only up to the iteration on show) and a stable y range (from everything computed so far).
  const plot = useMemo(() => {
    let lo = Number.isFinite(opt) ? opt : Infinity;
    let hi = Number.isFinite(opt) ? opt : -Infinity;
    const take = (c: number) => {
      if (!Number.isFinite(c)) return;
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    };
    let lines: { pts: [number, number][]; color: string; label: string; strong: boolean; first?: [number, number] }[] = [];
    if (tree) {
      for (const run of [grow.rrt, grow.star]) for (let k = 0; k <= run.it; k++) take(run.best[k]);
      lines = (['rrt', 'star'] as const).map((p) => {
        const run = grow[p];
        const upto = Math.min(vi, run.it);
        return { pts: costSteps(run.best, upto), color: COLOR[p], label: NAME[p], strong: cfg.planner === p, first: run.firstIt >= 0 && run.firstIt <= upto ? ([run.firstIt, run.best[run.firstIt]] as [number, number]) : undefined };
      });
    } else {
      const pts: [number, number][] = [];
      for (let k = 0; k < curve.filled; k++) take(curve.cost[k]);
      for (let k = 0; k <= Math.min(vi, curve.filled - 1); k++) pts.push([k, curve.cost[k]]);
      lines = [{ pts, color: COLOR.prm, label: 'PRM', strong: true }];
    }
    if (!Number.isFinite(lo)) {
      lo = 8;
      hi = 16;
    }
    const y0 = Math.max(0, Math.floor(lo * 0.96));
    const y1 = Math.max(y0 + 2, Math.ceil(hi * 1.04));
    return { lines, y0, y1 };
    // doneTick refreshes the range once the background computation finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, grow, curve, vi, opt, cfg.planner, doneTick]);

  // ---------------------------------------------------------------- narration
  let say: ReactNode;
  const ev = tree && vi > 0 ? shown.log[vi - 1] : undefined;
  if (drag && tree)
    say = (
      <>
        <b>This tree cannot answer the new query.</b> It is rooted at the old start and was grown towards the old goal. Release, and {NAME[cfg.planner]} throws it away and grows a new one from scratch.
      </>
    );
  else if (tour && !tree)
    say = (
      <>
        <b>
          Query {tour.k} of {tour.of}:
        </b>{' '}
        new start and goal, the <b>same roadmap</b>. Only the start and goal links were checked ({q?.checks ?? 0} checks) and A* ran in {pq ? msText(pq.ms) : '–'} ms.
      </>
    );
  else if (!detail) {
    if (tree) {
      const since = firstIt >= 0 && vi >= firstIt ? (Math.abs(shown.best[vi] - shown.best[firstIt]) < 1e-9 ? `, unchanged since iteration ${firstIt}` : `, down from ${f2(shown.best[firstIt])} m at iteration ${firstIt}`) : '';
      say = (
        <>
          <b>
            {NAME[cfg.planner]}, iteration {vi}:
          </b>{' '}
          {int(shown.nodesAt[vi])} nodes, {Number.isFinite(cost) ? `path ${f2(cost)} m${since}` : 'no path yet'}. {star ? 'Orange: the newest growth; purple flashes: rewires.' : 'Orange: the newest growth.'} Choose 1/s or 2/s, or pause, to see one iteration at a time.
        </>
      );
    } else
      say = (
        <>
          <b>PRM, {vi} vertices:</b> {int(prm.edgesAt[vi])} edges in {pieces?.count ?? 0} {pieces?.count === 1 ? 'piece' : 'pieces'}, {q && Number.isFinite(q.cost) ? `path ${f2(q.cost)} m` : 'no path yet'}. Drag the start or the goal at any time: the query is answered on the roadmap as it stands.
        </>
      );
  } else if (tree) {
    if (vi === 0)
      say = (
        <>
          The tree is just the start node <V id={0} />. Press <b>▶ Play</b>, or <b>▶|</b> for one iteration at a time.
        </>
      );
    else if (ev) {
      const sampleTxt = ev.goalSample ? (
        <>the goal itself is sampled (goal bias, probability {cfg.bias.toFixed(2)})</>
      ) : (
        <>a random point {xy(ev.sample)} m is sampled</>
      );
      const dN = dist({ x: shown.px[ev.nearest], y: shown.py[ev.nearest] }, ev.sample);
      const pathNote = (() => {
        const before = shown.best[vi - 1];
        const after = shown.best[vi];
        if (!Number.isFinite(after) || (Number.isFinite(before) && Math.abs(before - after) < 1e-9)) return null;
        return Number.isFinite(before) ? (
          <>
            {' '}
            The best path drops from {f2(before)} m to <b>{f2(after)} m</b>.
          </>
        ) : (
          <>
            {' '}
            <b>First path: {f2(after)} m.</b>
          </>
        );
      })();
      if (ev.dup)
        say = (
          <>
            <b>Iteration {vi}:</b> {sampleTxt}, but a node already sits exactly on it (<V id={ev.nearest} />), so there is nothing new to add. Goal samples only help until the tree reaches the goal; after that they are wasted iterations.
          </>
        );
      else if (ev.added < 0)
        say = (
          <>
            <b>Iteration {vi}:</b> {sampleTxt}. Its nearest node is <V id={ev.nearest} />, but the step of η = {cfg.step} m towards it would cross an obstacle, so the sample is thrown away (one collision check spent, nothing added).
          </>
        );
      else if (!star)
        say = (
          <>
            <b>Iteration {vi}:</b> {sampleTxt}. The nearest node is <V id={ev.nearest} /> ({f2(dN)} m away);{' '}
            {dN <= cfg.step + 1e-9 ? <>that is within η = {cfg.step} m, so the sample itself becomes <V id={ev.added} /></> : <>step η = {cfg.step} m towards the sample and add <V id={ev.added} /></>}. RRT always connects to the <b>nearest</b> node and never compares cost-to-come: <i>c</i>(<V id={ev.added} />) = {f2(ev.cost)} m.
            {ev.badEdge && <b className="plan-sampling-no"> Only the new node was checked: this edge passes through an obstacle.</b>}
            {pathNote}
          </>
        );
      else {
        const rows = candRows(shown, ev);
        const done = ev.rewires.filter((w) => w.done);
        const sizes = done.length ? subtreeSizes(shown.parentsAt(vi), done.map((w) => w.id)) : [];
        const below = sizes.reduce((s, n) => s + n, 0);
        say = (
          <>
            <b>Iteration {vi}:</b> {sampleTxt};{' '}
            {dN <= cfg.step + 1e-9 ? (
              <>
                it is within η = {cfg.step} m of the nearest node <V id={ev.nearest} />, so it becomes <V id="new" /> itself.
              </>
            ) : (
              <>
                steer η = {cfg.step} m from the nearest node <V id={ev.nearest} /> towards it: <V id="new" />.
              </>
            )}{' '}
            {rows.length} {rows.length === 1 ? 'node lies' : 'nodes lie'} within r = {cfg.radius} m.{' '}
            <b>Choose parent:</b>{' '}
            {ev.parent === ev.nearest ? (
              <>the nearest node is also the cheapest, <i>c</i> + <i>d</i> = {f2(ev.cost)} m.</>
            ) : (
              <>
                the cheapest <i>c</i> + <i>d</i> is <V id={ev.parent} /> at {f2(ev.cost)} m, not the nearest node ({f2(ev.nearestTotal)} m).
              </>
            )}{' '}
            <b>Rewire:</b>{' '}
            {done.length ? (
              <>
                {done.length} {done.length === 1 ? 'neighbour is' : 'neighbours are'} cheaper through <V id="new" /> ({done.map((w) => fromTo(w.current, w.via)).join(', ')}){below ? `, and the ${below} ${below === 1 ? 'node' : 'nodes'} below get cheaper by the same amount` : ''}.
              </>
            ) : (
              <>no neighbour is cheaper through <V id="new" />.</>
            )}
            {ev.badEdge && <b className="plan-sampling-no"> Only the new node was checked: its edge passes through an obstacle.</b>}
            {pathNote}
          </>
        );
      }
    }
  } else {
    if (vi === 0) say = <>The roadmap is empty. Press <b>▶ Play</b>, or <b>▶|</b> to add one vertex at a time.</>;
    else if (prmDone)
      say = (
        <>
          <b>Roadmap built:</b> {vi} vertices, {int(prm.edgesAt[vi])} edges in {pieces?.count === 1 ? 'one piece' : `${pieces?.count ?? 0} pieces`} ({int(prm.checksAt[vi])} collision checks, once).{' '}
          {q && Number.isFinite(q.cost) ? (
            <>
              The query links start and goal to it ({q.checks} checks) and A* finds a <b>{f2(q.cost)} m</b> path in {pq ? msText(pq.ms) : '–'} ms.
            </>
          ) : (
            <>The query cannot join start and goal through it: they link into different pieces (or into none).</>
          )}{' '}
          Drag the start or the goal: only the query is repeated.
        </>
      );
    else {
      const lg = prm.log[vi - 1];
      const ok = lg ? lg.ok.reduce((s, b) => s + b, 0) : 0;
      const tried = lg ? lg.cand.length : 0;
      say = (
        <>
          <b>Vertex {vi - 1}</b> at {xy({ x: prm.px[vi - 1], y: prm.py[vi - 1] })} m
          {lg && lg.rejected.length ? `, after ${lg.rejected.length} ${lg.rejected.length === 1 ? 'sample' : 'samples'} inside obstacles ${lg.rejected.length === 1 ? 'was' : 'were'} discarded` : ''}.{' '}
          {cfg.prmConnect === 'radius' ? `${tried} earlier ${tried === 1 ? 'vertex lies' : 'vertices lie'} within r = ${cfg.prmR} m` : `It tries its ${tried} nearest earlier vertices`}: {ok} {ok === 1 ? 'edge is' : 'edges are'} free{tried - ok ? `, ${tried - ok} blocked` : ''}
          {endpoint ? ' (checked only at the end points!)' : ''}. The roadmap is {pieces?.count === 1 ? 'one piece' : `${pieces?.count ?? 0} pieces`};{' '}
          {q && Number.isFinite(q.cost) ? `the query finds a ${f2(q.cost)} m path.` : 'start and goal are not connected yet.'}
        </>
      );
    }
  }

  // Step details (fixed height so the page does not jump between playing and stepping).
  let details: ReactNode;
  if ((!detail || drag) && tree) {
    // Playing fast: RRT against RRT* on the same samples, at the same iteration.
    const col = (p: 'rrt' | 'star') => {
      const run = grow[p];
      const k = Math.min(vi, run.it);
      const c = run.best[k];
      const f = run.firstIt >= 0 && run.firstIt <= k ? run.firstIt : -1;
      const gain = f >= 0 ? run.best[f] - c : NaN;
      return {
        cost: Number.isFinite(c) ? `${f2(c)} m` : 'no path yet',
        vs: pctAbove(c, opt),
        first: f >= 0 ? `it ${f}` : '—',
        since: f < 0 ? '—' : gain > 1e-9 ? `−${f2(gain)} m` : 'none',
        checks: int(run.checksAt[k]),
        rewires: p === 'rrt' ? 'never' : int(run.rewiresAt[k]),
      };
    };
    const a = col('rrt');
    const b = col('star');
    const rows: [ReactNode, string, string][] = [
      ['path cost', a.cost, b.cost],
      ['above the shortest', a.vs, b.vs],
      ['first path found at', a.first, b.first],
      ['shortened since then by', a.since, b.since],
      ['collision checks', a.checks, b.checks],
      ['rewires', a.rewires, b.rewires],
    ];
    details = (
      <table className="table plan-sampling-table plan-sampling-onetable" aria-label="RRT against RRT* on the same samples">
        <thead>
          <tr>
            <th>same samples, iteration {vi}</th>
            <th className={star ? undefined : 'plan-sampling-thsel'}>
              <span className="plan-sampling-key" style={{ background: COLOR.rrt }} /> RRT
            </th>
            <th className={star ? 'plan-sampling-thsel' : undefined}>
              <span className="plan-sampling-key" style={{ background: COLOR.star }} /> RRT*
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, x, y], k) => (
            <tr key={k}>
              <td>{label}</td>
              <td className="mono">{x}</td>
              <td className="mono">{y}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (!tree && (!detail || prmDone)) {
    // Playing fast: what the build cost against what one query costs.
    const lgRej = prm.rejectedAt[vi];
    details = (
      <table className="table plan-sampling-table plan-sampling-onetable" aria-label="PRM build against one query">
        <thead>
          <tr>
            <th />
            <th>build the roadmap (once)</th>
            <th>answer this query</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>new samples</td>
            <td className="mono">
              {vi}
              {lgRej ? ` (+${lgRej} discarded)` : ''}
            </td>
            <td className="mono">0</td>
          </tr>
          <tr>
            <td>collision checks</td>
            <td className="mono">{int(prm.checksAt[vi])}</td>
            <td className="mono">{q ? q.checks : 0}</td>
          </tr>
          <tr>
            <td>graph</td>
            <td className="mono">
              {int(prm.edgesAt[vi])} edges, {pieces?.count ?? 0} {pieces?.count === 1 ? 'piece' : 'pieces'}
            </td>
            <td className="mono">A* expands {q ? q.expanded : 0}</td>
          </tr>
          <tr>
            <td>result</td>
            <td className="mono">reused by every query</td>
            <td className="mono">{q && Number.isFinite(q.cost) ? `${f2(q.cost)} m path` : 'no path'}</td>
          </tr>
        </tbody>
      </table>
    );
  } else if (tree && ev && ev.added >= 0 && star) details = <StarTables run={shown} i={vi} />;
  else if (tree && ev && ev.added >= 0)
    details = (
      <table className="table plan-sampling-table plan-sampling-onetable" aria-label="RRT connection for this iteration">
        <thead>
          <tr>
            <th>
              to <V id="new" />
            </th>
            <th>
              <i>c</i>(<i>x</i>)
            </th>
            <th>
              <i>d</i>
            </th>
            <th>
              <i>c</i>(<V id="new" />) = <i>c</i> + <i>d</i>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="plan-sampling-rownear">
            <td>
              <V id={ev.nearest} /> <span className="plan-sampling-flag plan-sampling-flag-m1">nearest</span>
            </td>
            <td className="mono">{f2(ev.cost - dist({ x: shown.px[ev.nearest], y: shown.py[ev.nearest] }, ev.steered))}</td>
            <td className="mono">{f2(dist({ x: shown.px[ev.nearest], y: shown.py[ev.nearest] }, ev.steered))}</td>
            <td className="mono">
              <b>{f2(ev.cost)}</b>
            </td>
          </tr>
          <tr>
            <td colSpan={4} className="muted small">
              RRT looks at no other node: there is no neighbourhood, no choose-parent and no rewire.
            </td>
          </tr>
        </tbody>
      </table>
    );
  else if (!tree && vi > 0 && prm.log[vi - 1]) {
    const lg = prm.log[vi - 1];
    const rows = Array.from(lg.cand).slice(0, 6);
    details = (
      <table className="table plan-sampling-table plan-sampling-onetable" aria-label="PRM connections for this vertex">
        <thead>
          <tr>
            <th>
              to <V id={vi - 1} />
            </th>
            <th>
              <i>d</i>
            </th>
            <th>edge</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j, k) => (
            <tr key={j}>
              <td>
                <V id={j} />
              </td>
              <td className="mono">{f2(Math.hypot(prm.px[j] - prm.px[vi - 1], prm.py[j] - prm.py[vi - 1]))}</td>
              <td>{lg.ok[k] ? <span className="plan-sampling-ok">✓ free, added</span> : <span className="plan-sampling-no">✗ blocked</span>}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={3} className="muted small">
                No earlier vertex {cfg.prmConnect === 'radius' ? `within r = ${cfg.prmR} m` : 'yet'}: this vertex starts a new piece.
              </td>
            </tr>
          )}
          {lg.cand.length > rows.length && (
            <tr>
              <td colSpan={3} className="muted small">
                + {lg.cand.length - rows.length} more
              </td>
            </tr>
          )}
        </tbody>
      </table>
    );
  } else details = <p className="muted small plan-sampling-hint">{tree && ev && ev.added < 0 ? 'Rejected sample: no node, no tables. Step on.' : 'Step forward to see the first step.'}</p>;

  const legend = tree
    ? [
        { label: 'tree', color: 'var(--text-3)' },
        { label: `${NAME[cfg.planner]} path`, color: COLOR[cfg.planner] },
        ...(showOther ? [{ label: `${star ? 'RRT' : 'RRT*'} path, same samples`, color: star ? COLOR.rrt : COLOR.star, dash: true }] : []),
        ...(showOpt ? [{ label: 'shortest possible', color: 'var(--text-3)', dash: '8 5' }] : []),
        { label: 'nearest → x_new', color: 'var(--m1)', dash: '6 4' },
        ...(star
          ? [
              { label: 'neighbourhood r', color: 'var(--m2)', dash: '5 4' },
              { label: 'rewired', color: 'var(--m4)' },
              { label: 'removed edge', color: 'var(--bad)', dash: '3 3' },
            ]
          : []),
        { label: 'goal region (η)', color: 'var(--accent)', dash: '5 4' },
        ...(endpoint ? [{ label: 'edge through an obstacle', color: 'var(--bad)' }] : []),
      ]
    : [
        { label: 'roadmap', color: 'var(--text-3)' },
        { label: 'PRM path', color: COLOR.prm },
        ...(showOpt ? [{ label: 'shortest possible', color: 'var(--text-3)', dash: '8 5' }] : []),
        { label: 'start / goal links', color: 'var(--text-2)', dash: '4 4' },
        { label: 'connection radius', color: 'var(--m2)', dash: '5 4' },
        { label: 'new edge (free)', color: 'var(--ok)' },
        { label: 'blocked edge', color: 'var(--bad)', dash: '2 3' },
      ];

  const handle = (which: End) => {
    const p = drag && drag.which === which ? drag.p : cfg[which];
    const X = sx(p.x);
    const Y = sy(p.y);
    return (
      <g
        key={which}
        className="plan-sampling-drag"
        tabIndex={0}
        role="slider"
        aria-label={`${which}: drag it, or use the arrow keys (Shift for bigger steps)`}
        aria-valuetext={`${which} at ${xy(p)} m`}
        onPointerDown={onPointer(which, 'down')}
        onPointerMove={onPointer(which, 'move')}
        onPointerUp={onPointer(which, 'up')}
        onPointerCancel={onPointer(which, 'up')}
        onKeyDown={onKey(which)}
      >
        <circle cx={X} cy={Y} r={20} fill="transparent" />
        {which === 'start' ? (
          <circle cx={X} cy={Y} r={9} className="plan-sampling-handle plan-sampling-start" />
        ) : (
          <>
            <circle cx={X} cy={Y} r={10} className="plan-sampling-handle" />
            <circle cx={X} cy={Y} r={4} className="plan-sampling-goaldot" />
          </>
        )}
        <text x={X} y={Y + (p.y < 1 ? -15 : 25)} textAnchor="middle" className="plan-sampling-svglabel plan-sampling-endlabel plan-sampling-halo">
          {which}
        </text>
      </g>
    );
  };

  const shownCost = Number.isFinite(cost) ? `${f2(cost)} m` : (tree ? shown.done && vi >= N_IT : prm.done && vi >= prm.count) ? 'no path' : 'none yet';
  const plannerSeg = (
    <Segmented
      label="Planner"
      value={cfg.planner}
      onChange={setPlanner}
      options={[
        { value: 'prm', label: 'PRM', title: 'Probabilistic roadmap: build once, query many times' },
        { value: 'rrt', label: 'RRT', title: 'Rapidly-exploring random tree: connect to the nearest node' },
        { value: 'star', label: 'RRT*', title: 'RRT with choose-parent and rewire: asymptotically optimal' },
      ]}
    />
  );

  return (
    <div>
      <SimLayout
        visual={
          <>
            <div ref={boxRef} className="plan-sampling-stage" style={{ height: boxW }}>
              <canvas ref={canvasRef} className="plan-sampling-canvas" aria-hidden="true" />
              <svg
                ref={svgRef}
                className="plan-sampling-over"
                viewBox={`0 0 ${VIEW} ${VIEW}`}
                role="img"
                aria-label={`${NAME[cfg.planner]} in the ${W.label.toLowerCase()} world, ${tree ? `iteration ${vi} of ${N_IT}, ${shown.nodesAt[vi]} nodes` : `${vi} roadmap vertices`}, path ${shownCost}.`}
              >
                {detail && tree && !drag && vi > 0 && <TreeStepOverlay key={`${growKey}|${cfg.planner}|${vi}`} run={shown} i={vi} star={star} st={st} />}
                {detail && !tree && vi > 0 && !prmDone && <PrmStepOverlay key={`${prmKey}|${vi}`} prm={prm} i={vi} st={st} />}
                {handle('goal')}
                {handle('start')}
              </svg>
            </div>
            <div className="stepper" role="group" aria-label="Step controls">
              <Button size="sm" onClick={() => jump(0)} aria-label="Back to the start" title="Back to the start">
                ⏮
              </Button>
              <Button size="sm" onClick={() => jump(vi - 1)} disabled={vi <= 0} aria-label={`Back one ${tree ? 'iteration' : 'vertex'}`} title={`Back one ${tree ? 'iteration' : 'vertex'}`}>
                ◀
              </Button>
              <Button size="sm" variant="primary" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? '⏸ Pause' : vi >= N ? '↻ Replay' : '▶ Play'}
              </Button>
              <Button size="sm" onClick={() => jump(vi + 1)} disabled={vi >= N} aria-label={`Forward one ${tree ? 'iteration' : 'vertex'}`} title={`Forward one ${tree ? 'iteration' : 'vertex'}`}>
                ▶|
              </Button>
              <Button size="sm" onClick={() => jump(N)} disabled={vi >= N} aria-label="Jump to the end" title="Jump to the end">
                ⏭
              </Button>
              <Segmented size="sm" label="Speed" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: `${s}/s`, title: `${s} ${tree ? 'iterations' : 'vertices'} per second` }))} />
              <span className="mono small muted stepper-pos">
                {tree ? 'it' : 'vertex'} {vi} / {N}
              </span>
            </div>
            <p className="plan-sampling-say" aria-live={detail ? 'polite' : 'off'}>
              {say}
            </p>
            <div className="plan-sampling-details">{details}</div>
            <Legend items={legend} />
          </>
        }
        controls={
          <>
            {plannerSeg}
            <Segmented size="sm" label="World" value={cfg.world} onChange={setWorld} options={WORLD_KEYS.map((k) => ({ value: k, label: WORLDS[k].label }))} />
            <p className="muted small plan-sampling-tight">{W.blurb}</p>
            {tree ? (
              <>
                <Slider label="step size" tex="\eta" tip="Maximum edge length: steer at most η from the nearest node towards the sample" value={cfg.step} min={0.2} max={2} step={0.1} format={(v) => `${v.toFixed(1)} m`} onChange={(v) => patch({ step: Math.round(v * 10) / 10 })} />
                <Slider label="goal bias" tex="p_{goal}" tip="Probability of sampling the goal itself instead of a random point" value={cfg.bias} min={0} max={0.5} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => patch({ bias: Math.round(v * 100) / 100 })} />
                <Slider label="RRT* neighbourhood" tex="r" tip="RRT* compares (choose parent) and rewires the nodes within r of x_new; RRT ignores it" value={cfg.radius} min={0.5} max={3} step={0.1} format={(v) => `${v.toFixed(1)} m`} onChange={(v) => patch({ radius: Math.round(v * 10) / 10 })} />
              </>
            ) : (
              <>
                <Slider label="samples" tex="n" tip="Free configurations in the roadmap (samples inside obstacles are discarded)" value={cfg.prmN} min={20} max={500} step={10} format={(v) => String(Math.round(v))} onChange={(v) => patch({ prmN: Math.round(v / 10) * 10 })} />
                <Segmented
                  size="sm"
                  label="Connect each new vertex to"
                  value={cfg.prmConnect}
                  onChange={(v) => patch({ prmConnect: v })}
                  options={[
                    { value: 'radius', label: 'all within r' },
                    { value: 'k', label: 'its k nearest' },
                  ]}
                />
                {cfg.prmConnect === 'radius' ? (
                  <Slider label="connection radius" tex="r" tip="A new vertex tries an edge to every earlier vertex closer than r" value={cfg.prmR} min={0.3} max={3} step={0.1} format={(v) => `${v.toFixed(1)} m`} onChange={(v) => patch({ prmR: Math.round(v * 10) / 10 })} />
                ) : (
                  <Slider label="neighbours" tex="k" tip="A new vertex tries an edge to its k nearest earlier vertices" value={cfg.prmK} min={1} max={15} step={1} format={(v) => String(Math.round(v))} onChange={(v) => patch({ prmK: Math.round(v) })} />
                )}
              </>
            )}
            <div className="plan-sampling-toggles">
              <Toggle checked={endpoint} onChange={(v) => patch({ check: v ? 'endpoint' : 'edge' })} label="Check collisions only at the new node (not along the edge)" />
              <Toggle checked={showOpt} onChange={setShowOpt} label="Show the shortest possible path" />
              {tree && <Toggle checked={showOther} onChange={setShowOther} label={`Show ${star ? 'RRT' : 'RRT*'}’s path on the same samples`} />}
            </div>
            <div className="row gap-s wrap">
              <Button size="sm" onClick={newQuery} title={tree ? 'Random start and goal: the tree must be regrown' : 'Random start and goal: answered on the same roadmap'}>
                New query
              </Button>
              <Button size="sm" onClick={() => patch({ seed: (cfg.seed * 7919 + 13) % 100003 })} title="A different random sample sequence">
                New samples
              </Button>
              {tree && (
                <Button size="sm" onClick={() => jump(shown.firstIt)} disabled={shown.firstIt < 0} title="Jump to the iteration where the first path appeared">
                  First path
                </Button>
              )}
            </div>
            <h4 className="plan-sampling-h">{tree ? 'Path cost on the same samples' : 'Path cost as the roadmap grows'}</h4>
            <Plot x={{ min: 0, max: N, label: tree ? 'iteration' : 'vertices in the roadmap' }} y={{ min: plot.y0, max: plot.y1, label: 'path cost (m)' }} height={190} cursorX={vi} ariaLabel={tree ? 'Best path cost against iteration for RRT and RRT* on the same samples' : 'PRM path cost against the number of roadmap vertices'}>
              {Number.isFinite(opt) && <HLine y={opt} color="var(--text-3)" label={`shortest ≈ ${f2(opt)} m`} />}
              {plot.lines.map((l) => (
                <Line key={l.label} points={l.pts} color={l.color} width={l.strong ? 2.8 : 1.8} opacity={l.strong ? 1 : 0.85} />
              ))}
              {plot.lines.map((l) => (l.first ? <Dot key={`f${l.label}`} x={l.first[0]} y={l.first[1]} r={3.5} color={l.color} hollow /> : null))}
            </Plot>
            <Legend
              items={
                tree
                  ? [
                      { label: 'RRT', color: COLOR.rrt },
                      { label: 'RRT*', color: COLOR.star },
                      { label: 'shortest possible', color: 'var(--text-3)', dash: true },
                    ]
                  : [
                      { label: 'PRM query', color: COLOR.prm },
                      { label: 'shortest possible', color: 'var(--text-3)', dash: true },
                    ]
              }
            />
            {tree ? (
              <Readouts min={112}>
                <Readout label="nodes" text={int(shown.nodesAt[vi])} tip="Tree nodes after this iteration (rejected samples add none)" />
                <Readout label="collision checks" text={int(shown.checksAt[vi])} tip="Edges checked so far: RRT one per iteration; RRT* one per neighbour, plus one per rewire candidate" />
                <Readout label="path cost" text={shownCost} tone={star ? 'm3' : 'm1'} tip="Length of the best path from start to goal in the tree" />
                <Readout label="vs shortest" text={pctAbove(cost, opt)} tip="How much longer than the shortest possible path" />
                <Readout label="first path" text={firstIt >= 0 && firstIt <= vi ? `it ${firstIt}` : '—'} tip="Iteration at which the tree first reached the goal region" />
                {star ? <Readout label="rewires" text={int(shown.rewiresAt[vi])} tip="Edges replaced by a cheaper connection through a new node" /> : <Readout label="RRT* checks" text={int(other.checksAt[Math.min(vi, other.it)])} tip="Collision checks RRT* needed on the same samples" />}
                {endpoint && <Readout label="edges through obstacles" text={int(badEdges)} tone="bad" tip="Accepted edges that cross an obstacle, because only their end node was checked" />}
              </Readouts>
            ) : (
              <Readouts min={112}>
                <Readout label="vertices" text={`${vi} / ${cfg.prmN}`} />
                <Readout label="edges" text={int(prm.edgesAt[vi])} />
                <Readout label="pieces" text={int(pieces?.count ?? 0)} tip="Connected components of the roadmap: start and goal must link into the same one" />
                <Readout label="collision checks" text={int(prm.checksAt[vi])} tip="Build cost: one point check per sample plus one per edge tried" />
                <Readout label="path cost" text={shownCost} tone="m2" />
                <Readout label="vs shortest" text={pctAbove(cost, opt)} />
                <Readout label="query" text={pq ? `${pq.ms < 0.1 ? '<0.1' : pq.ms.toFixed(1)} ms` : '–'} tip="Time to join start and goal to the roadmap and run A*: no new samples, no new roadmap edges" />
              </Readouts>
            )}
            {tree && radiusRows.length > 0 && (star || radiusRows.length > 1) && (
              <div className="plan-sampling-radiusbox">
                <h4 className="plan-sampling-h">RRT* radius trade-off (same samples, {N_IT} iterations)</h4>
                <table className="table plan-sampling-table" aria-label="RRT* after 2000 iterations for each neighbourhood radius tried on these samples">
                  <thead>
                    <tr>
                      <th>radius r</th>
                      <th>path</th>
                      <th>vs shortest</th>
                      <th>collision checks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radiusRows.map((row) => (
                      <tr key={row.r} className={Math.abs(row.r - cfg.radius) < 1e-9 ? 'plan-sampling-rowpick' : undefined}>
                        <td className="mono">{row.r.toFixed(1)} m</td>
                        <td className="mono">{Number.isFinite(row.cost) ? `${f2(row.cost)} m` : 'no path'}</td>
                        <td className="mono">{pctAbove(row.cost, opt)}</td>
                        <td className="mono">{int(row.checks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="plan-sampling-note">
                  {pendingRadii.current.length > 0 || !grow.star.done
                    ? `Running r = ${cfg.radius.toFixed(1)} m on the same samples…`
                    : radiusRows.length < 2
                      ? 'Change the RRT* neighbourhood r: each finished run adds a row, so you can compare radii on the same samples.'
                      : 'A bigger neighbourhood gives choose-parent and rewire more to work with (shorter path) but checks far more edges.'}
                </p>
              </div>
            )}
            {tree ? (
              <Callout kind="note" title="Single-query: one tree per start and goal">
                This tree is rooted at the start and grew towards this goal
                {firstIt >= 0 ? ` (${firstIt} iterations and ${int(shown.checksAt[firstIt])} collision checks to its first path)` : ''}. Trees grown so far: <b>{tally.trees}</b>. Drag the start or the goal, or press New query: the tree is thrown away and regrown from scratch.
              </Callout>
            ) : (
              <Callout kind="info" title="Multi-query: the roadmap is reused">
                Queries answered on this roadmap: <b>{tally.prmQueries}</b>. Each new start and goal only adds links to nearby vertices ({q?.checks ?? 0} checks) and one A* search; the {int(prm.checksAt[prm.count])} checks that built the roadmap are not repeated. Drag the start or the goal.
              </Callout>
            )}
            {endpoint && (
              <Callout kind="trap" title="Only the new node is checked (2023 Q32c)">
                Both ends of an edge can be free while the edge itself crosses an obstacle. Red edges and path segments go straight through walls. Check every edge along its whole length (or the swept arc of a steering manoeuvre), finer than the thinnest obstacle.
              </Callout>
            )}
          </>
        }
      />
      <Predictions act={act} />
      <More label="How PRM, RRT and RRT* work, and when to use which">
        <Rich text={MORE} />
      </More>
    </div>
  );
}

const MORE = [
  'All three only need a **sampler**, a **distance**, a **local planner** (here: a straight edge, at most $\\eta$ long for the trees) and a **collision checker**; none of them builds the C-space explicitly, which is why they scale to many-joint arms (notes §5).',
  '$$\\begin{array}{l|ccc} & \\text{PRM} & \\text{RRT} & \\text{RRT*} \\\\ \\hline \\text{queries} & \\text{multi (reuse the roadmap)} & \\text{single} & \\text{single} \\\\ \\text{a new vertex joins} & \\text{all within } r \\text{ (or } k \\text{ nearest)} & \\text{the nearest node} & \\text{cheapest } c + d \\text{ within } r \\\\ \\text{existing edges changed?} & \\text{no} & \\text{no} & \\text{yes: rewire} \\\\ \\text{asymptotically optimal?} & \\text{PRM*: yes} & \\text{no} & \\text{yes} \\\\ \\text{collision checks} & \\text{many, once} & \\text{one per iteration} & \\text{one per neighbour} \\end{array}$$',
  '**One RRT* iteration** (2025 Q29 by hand):',
  '1. Sample $x_{rand}$ (the goal itself with probability $p_{goal}$).\n2. Find the nearest node and steer at most $\\eta$ towards $x_{rand}$: that is $x_{new}$. Discard it if the edge collides.\n3. **Choose parent**: among the nodes within $r$, connect to the one with the smallest $c(x_{near}) + d(x_{near}, x_{new})$ whose edge is free (basic RRT simply takes the nearest).\n4. **Rewire**: for every other neighbour, if $c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$ and the edge is free, make $x_{new}$ its parent; its whole subtree gets cheaper by the same amount.',
  '**Which one?** Many queries in a map that does not change (a factory cell, a warehouse): build a PRM once. One query, fast (replanning on the fly): RRT. Path quality matters and you can afford the collision checks: RRT* (its radius shrinks like $\\gamma(\\log n / n)^{1/2}$ so the checks per step stay small). Every one of them must check each edge along its **whole length** (2023 Q32c).',
].join('\n\n');

const Predictions = memo(function Predictions({ act }: { act: (s: Scenario) => void }) {
  return (
    <>
      <PredictReveal
        id="plan-sampling-rrt-flat"
        question="Open world, plain **RRT**. After its first path is found the tree keeps growing for another 1900 iterations. What happens to the path cost?"
        options={['It keeps falling towards the straight line, just more slowly than RRT*', 'It stays (almost) where it is: edges already in the tree are never changed', 'It gets longer, because new branches crowd the tree and push the path sideways']}
        answer={1}
        explain="RRT never revisits an edge: once a node is in the tree its route back to the start is fixed, so the first path's detours stay. The best path can only change if a *different* branch happens to reach the goal region more cheaply, which is rare (2023 Q32d). On the same samples RRT* keeps falling, here to within about 0.1 % of the straight line: choose-parent and rewire repair the tree at every step, which is what **asymptotic optimality** means."
        tryIt="press Show me: RRT runs at 200 iterations/s. Watch the blue line in the cost plot stay flat while the green RRT* line keeps dropping."
        onApply={() => act('rrt-flat')}
      />
      <PredictReveal
        id="plan-sampling-multi-query"
        question="You need paths for many different start and goal pairs in the same map. Which planner answers a new pair without building anything new?"
        options={['RRT: after a few thousand samples its tree already covers most of the map', 'PRM: build the roadmap once, then each query only links start and goal to it and runs A*', 'RRT*: rewiring keeps re-attaching the tree to whatever the new goal is', 'None of them: every sampling-based planner has to start again from scratch']}
        answer={1}
        explain="A PRM splits the work into a slow **build** (sample, collision-check edges) and a fast **query** (link start and goal, graph search), so it is **multi-query**. An RRT is rooted at one start and grown towards one goal, so it is **single-query**: a new start or goal means a new tree. 'RRTs can be used for multi-query problems' is the false statement in 2023 Q10 and 2024 Q11."
        tryIt="press Show me: four new queries on the same roadmap, each answered at once. Then switch to RRT and press New query: the tree is regrown from nothing."
        onApply={() => act('prm-multi')}
      />
      <PredictReveal
        id="plan-sampling-endpoint"
        question="Narrow passage, RRT, but the planner only checks that the **new node** is free, not the edge to it. What goes wrong?"
        options={['Nothing: if both ends of an edge are free, so is the edge', 'Edges jump straight through the thin wall, so the path crashes', 'The planner can no longer find any path through the narrow gap', 'Only RRT* is affected, because rewiring adds edges that were never checked']}
        answer={1}
        explain="Both end points can be free while the segment between them crosses an obstacle, and a thin wall is the extreme case. The tree 'finds' a path through the wall within a few dozen iterations, far shorter than any real path, and a robot following it would crash. Every edge, or the swept arc of a steering manoeuvre, must be checked along its whole length at a resolution finer than the thinnest obstacle (2023 Q32c)."
        tryIt="press Show me: the first path appears early and crosses the wall (red)."
        onApply={() => act('endpoint')}
      />
      <PredictReveal
        id="plan-sampling-radius"
        question="RRT* in the cluttered world. Shrink the neighbourhood from $r$ = 1.5 m to 0.6 m (the step size). After 2000 iterations, compared with $r$ = 1.5 m:"
        options={['Shorter path and fewer collision checks, since there is less to compare', 'Longer path, but only about a fifth of the collision checks', 'The same path: r only changes how fast it is found, not where it ends', 'No path at all: with r equal to the step size RRT* cannot connect']}
        answer={1}
        explain="With $r = \eta$ only a few nodes are in the neighbourhood, so choose-parent and rewire have little to choose from and RRT* behaves more like RRT: the path ends about 3 % above the shortest instead of about 0.4 %. But each insertion tests far fewer edges: about 17 000 collision checks instead of 80 000 (and 193 000 for $r$ = 2.5 m). That is the radius trade-off; RRT* shrinks $r$ like $\gamma(\log n / n)^{1/2}$ to keep both under control."
        tryIt="press Show me: RRT* runs 2000 iterations on the same samples with $r$ = 1.5, 2.5 and then 0.6 m, and the table under the cost plot compares the three."
        onApply={() => act('radius')}
      />
      <PredictReveal
        id="plan-sampling-sparse"
        question="PRM in the open world (no obstacles at all) with only 60 samples and a connection radius of 0.6 m. What does the query return?"
        options={['A path, but a jagged one, because only a few vertices are there to choose from', 'No path: the roadmap falls apart into small pieces, so start and goal are not connected', 'A straight line from start to goal, since there are no obstacles in the way']}
        answer={1}
        explain="Edges only join vertices closer than $r$. With 60 vertices in 100 m² a vertex has on average $60 \cdot \pi (0.6)^2 / 100 \approx 0.7$ others within 0.6 m, so the roadmap is many separate pieces and the query fails even though free space is wide open. More samples or a bigger radius join the pieces, at the price of more collision checks: a PRM is only *probabilistically* complete."
        tryIt="press Show me, then raise $n$ or $r$ until the pieces join and a path appears."
        onApply={() => act('prm-sparse')}
      />
    </>
  );
});
