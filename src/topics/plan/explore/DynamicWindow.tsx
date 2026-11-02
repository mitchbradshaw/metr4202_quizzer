// Dynamic window approach (summary notes §5 "Global vs local planning"; review deck learning outcomes:
// collision avoidance with the dynamic window and velocity obstacles; Fox, Burgard & Thrun 1997).
// Left: a 10 × 7 m world with a differential-drive robot, static obstacles, a pedestrian, the candidate arcs of
// this control cycle (faint, coloured by score; rejected ones dashed) and the executed arc (bold). Right: the
// (v, ω) plane with the box V_s, the admissible region V_a (canvas, computed a few rows per frame), the dynamic
// window V_d and the sampled candidates. The engine is localDwa.ts; one dwaStep per control period, the motion
// in between is interpolated per frame through refs. Below: the velocity obstacle of the pedestrian (localVo).
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { ExploreItem } from '../../../engine/types';
import type { Shape, Vec2 } from '../../../core/geom2d';
import { velocityMotion, wrapAngle, type Pose } from '../../../core/motion';
import {
  DWA_DEFAULT,
  DWA_H,
  DWA_PRESETS,
  DWA_W,
  GOAL_RADIUS,
  dwaPlan,
  dwaStep,
  initState,
  moverState,
  staticClearance,
  velocityMap,
  type Cand,
  type DwaCfg,
  type DwaEval,
  type DwaPreset,
  type DwaState,
  type DwaWorld,
  type PlanFollow,
} from './localDwa';
import { contactTime, voChoose, voShape, type Disc } from './localVo';
import { useRaf } from '../../../anim/hooks';
import { rgbOf, useThemeColors } from '../../../ui/theme';
import { Button, Callout, More, Segmented, Select, Slider, Toggle } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { svgPoint } from '../../../ui/diagrams';
import { fmt, fmtSig, tex } from '../../../engine/format';
import '../local.css';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'dwa',
  title: 'Dynamic window approach',
  summary:
    'A differential-drive robot picks one $(v, \\omega)$ per control cycle: only velocities it can reach within $\\Delta t$ (the dynamic window), only arcs it could still stop on (admissible), and the best of those on heading, clearance and speed. With a crossing pedestrian, its velocity obstacle, and a U-trap that needs a global plan.',
  notice: 'Only velocities reachable within one control period are searched, and arcs the robot could not stop on are thrown out before the weights are even looked at.',
  minutes: 9,
};

// ------------------------------------------------------------------ world view geometry (10 × 7 m)

const WV = 640;
const WHT = 460;
const PL = 30;
const PT = 10;
const KW = 60; // px per metre
const WX = (x: number) => PL + x * KW;
const WY = (y: number) => PT + (DWA_H - y) * KW;
const toWorld = (p: { x: number; y: number }): Vec2 => ({ x: (p.x - PL) / KW, y: DWA_H - (p.y - PT) / KW });

// ------------------------------------------------------------------ velocity panel geometry

const VV = 420;
const VH = 330;
const VB = { l: 44, t: 22, w: 364, h: 266 };
const VM = 0.06; // margin around the box V_s (fraction of the range)
const VX = (w: number, wMax: number) => VB.l + ((w / wMax + 1 + VM) / (2 + 2 * VM)) * VB.w;
const VY = (v: number, vMax: number) => VB.t + ((1 + VM - v / vMax) / (1 + 2 * VM)) * VB.h;
const BOX = { x0: VX(-1, 1), x1: VX(1, 1), y0: VY(1, 1), y1: VY(0, 1) };
const NVM = 20;
const NWM = 36;

const r2 = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

const presetOf = (id: string): DwaPreset => DWA_PRESETS.find((p) => p.id === id) ?? DWA_PRESETS[0];
const cloneWorld = (w: DwaWorld): DwaWorld => ({
  obstacles: w.obstacles.map((o) => (o.kind === 'poly' ? { kind: 'poly', pts: o.pts.map((p) => ({ ...p })) } : { ...o })),
  movers: w.movers.map((m) => ({ ...m, a: { ...m.a }, b: { ...m.b } })),
});

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

// ------------------------------------------------------------------ control cycles

/** One control period: the state at its start, the evaluation made there, and the state at its end. */
interface Cycle {
  s: DwaState;
  ev: DwaEval;
  next: DwaState;
  trail: Vec2[];
}

function makeCycle(s: DwaState, world: DwaWorld, goal: Vec2, cfg: DwaCfg, plan: PlanFollow | null, trail: Vec2[]): Cycle {
  const { next, ev } = dwaStep(s, world, goal, cfg, plan);
  return { s, ev, next, trail };
}

/** The command dwaStep executes: the best admissible sample, or the hardest braking the window allows. */
function execOf(ev: DwaEval): { v: number; w: number } {
  return ev.best ? { v: ev.best.v, w: ev.best.w } : { v: ev.window.v0, w: clamp(0, ev.window.w0, ev.window.w1) };
}

function arcD(traj: readonly Pose[]): string {
  let s = '';
  for (let i = 0; i < traj.length; i++) s += `${i ? 'L' : 'M'}${WX(traj[i].x).toFixed(1)} ${WY(traj[i].y).toFixed(1)}`;
  return s;
}

const REASON: Record<Cand['reason'], string> = {
  ok: 'admissible',
  stop: 'cannot stop in time',
  moving: 'meets the pedestrian',
  contact: 'already touching',
};

// ------------------------------------------------------------------ verdict

function verdict(c: Cycle, cfg: DwaCfg, world: DwaWorld, usePlan: boolean): { kind: 'ok' | 'bad' | 'warn'; title: string; text: string } | null {
  const s = c.s;
  if (s.status === 'running') return null;
  if (s.status === 'goal')
    return {
      kind: 'ok',
      title: `Reached G in ${fmt(s.t, 3)} s`,
      text: `Every ${cfg.dt} s it searched the ${cfg.nv} × ${cfg.nw} samples of its dynamic window, threw out the arcs it could not stop on, and drove the best of the rest for one period.${usePlan ? ' The heading term aimed at the sub-goal on the global plan (green), so it went the way the planner chose.' : ''}`,
    };
  if (s.status === 'collision')
    return {
      kind: 'bad',
      title: 'Collision',
      text: 'Admissibility only guarantees that the robot itself can stop before what it predicts. A pedestrian who changes velocity (here: turns round at the end of the walk) can still walk into it.',
    };
  // stuck
  const clr = staticClearance(s.pose, world, cfg.radius);
  let why: string;
  if (cfg.wVel < 0.02)
    why = `With $w_v$ = 0 nothing in $G$ rewards moving. Facing G, standing still already has the best heading, so $v = 0$ wins every cycle: the velocity term is what makes a DWA robot go.`;
  else if (clr < 0.6 && cfg.wClear < 0.02)
    why = `With $w_c$ = 0 nothing rewarded keeping clear, so it drove straight at the obstacle at full speed until braking was forced. Now every arc toward G is inadmissible (it could not stop in time) and the admissible ones turn away and lose heading score, so stopping scores best. Give clearance some weight: the robot then starts turning while the obstacle is still far away.`;
  else if (clr < 0.6 && !usePlan)
    why = `Every arc toward G is inadmissible here (it could not stop before the obstacle), and the admissible ones turn away and lose heading score, so stopping scores best. DWA looks only ${fmt(cfg.horizon, 2)} s ahead and has no map of the way round: a local minimum, just like a potential field’s. Switch on the global plan.`;
  else why = 'No admissible arc makes progress toward G from here. Try other weights, a longer or shorter horizon, or the global plan.';
  return { kind: 'bad', title: `Stuck: no progress toward G for ${fmt(s.t - s.bestT, 2)} s`, text: why };
}

// ------------------------------------------------------------------ the simulation

export default function DynamicWindow() {
  const uid = useId().replace(/:/g, '');
  const [presetId, setPresetId] = useState('open');
  const [world, setWorld] = useState<DwaWorld>(() => cloneWorld(presetOf('open').world));
  const [goal, setGoal] = useState<Vec2>(() => ({ ...presetOf('open').goal }));
  const [start, setStart] = useState<Pose>(() => ({ ...presetOf('open').start }));
  const [cfg, setCfg] = useState<DwaCfg>(() => ({ ...DWA_DEFAULT, ...presetOf('open').cfg }));
  const [usePlan, setUsePlan] = useState(false);
  const [plan, setPlan] = useState<PlanFollow | null>(null);
  const [showArcs, setShowArcs] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [cyc, setCyc] = useState<Cycle>(() => makeCycle(initState(presetOf('open').start, presetOf('open').goal), cloneWorld(presetOf('open').world), presetOf('open').goal, { ...DWA_DEFAULT }, null, [{ ...presetOf('open').start }]));
  const [inspect, setInspect] = useState<number | null>(null);
  const [voTau, setVoTau] = useState(3);
  const [probe, setProbe] = useState<Vec2>({ x: 0.6, y: 0.4 });
  const [flashWin, setFlashWin] = useState(false);

  const theme = useThemeColors(['--bad', '--m4']);
  const pal = useMemo(() => ({ bad: rgbOf(theme['--bad']), mov: rgbOf(theme['--m4']) }), [theme]);

  // Refs read by the animation loop (the latest values, without re-subscribing every render).
  const cycRef = useRef(cyc);
  const worldRef = useRef(world);
  const goalRef = useRef(goal);
  const cfgRef = useRef(cfg);
  const planRef = useRef(plan);
  const speedRef = useRef(speed);
  const voTauRef = useRef(voTau);
  const probeRef = useRef(probe);
  worldRef.current = world;
  goalRef.current = goal;
  cfgRef.current = cfg;
  planRef.current = plan;
  speedRef.current = speed;
  voTauRef.current = voTau;
  probeRef.current = probe;
  const tauRef = useRef(0);
  const pauseReq = useRef(false);

  const commit = useCallback((c: Cycle) => {
    cycRef.current = c;
    setCyc(c);
  }, []);

  // ---------------------------------------------------------------- global plan (re-planned when the map or goal changes)
  useEffect(() => {
    if (!usePlan) {
      setPlan(null);
      return;
    }
    const p = cycRef.current.s.pose;
    setPlan(dwaPlan(world, { x: p.x, y: p.y }, goal, cfg));
  }, [usePlan, world, goal, cfg.radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paused: any change of map, goal, weights or plan re-evaluates the current cycle at once.
  // Playing: the loop picks the new values up at the next control period.
  const prevPlan = useRef(plan);
  useEffect(() => {
    const fresh = plan !== prevPlan.current;
    prevPlan.current = plan;
    if (playing) return;
    const c = cycRef.current;
    commit(makeCycle({ ...c.s, planS: fresh ? 0 : c.s.planS }, world, goal, cfg, plan, c.trail));
  }, [world, goal, cfg, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- per-frame drawing
  const robotRef = useRef<SVGGElement>(null);
  const moverRefs = useRef<(SVGCircleElement | null)[]>([]);
  const moverArrowRefs = useRef<(SVGLineElement | null)[]>([]);
  const liveRef = useRef<HTMLSpanElement>(null);
  const vo = {
    cone: useRef<SVGPolygonElement>(null),
    cut: useRef<SVGCircleElement>(null),
    apex: useRef<SVGCircleElement>(null),
    apexTxt: useRef<SVGTextElement>(null),
    va: useRef<SVGLineElement>(null),
    vaDot: useRef<SVGCircleElement>(null),
    pref: useRef<SVGLineElement>(null),
    choice: useRef<SVGCircleElement>(null),
    txtA: useRef<HTMLSpanElement>(null),
    txtP: useRef<HTMLSpanElement>(null),
    probe: useRef<SVGCircleElement>(null),
  };

  const drawFrame = useCallback(() => {
    const c = cycRef.current;
    const tau = tauRef.current;
    const ex = execOf(c.ev);
    const running = c.s.status === 'running';
    const pose = running ? velocityMotion(c.s.pose, ex.v, ex.w, tau) : c.s.pose;
    robotRef.current?.setAttribute('transform', `translate(${WX(pose.x).toFixed(1)} ${WY(pose.y).toFixed(1)}) rotate(${((-pose.theta * 180) / Math.PI).toFixed(1)})`);
    const t = c.s.t + (running ? tau : 0);
    const w = worldRef.current;
    w.movers.forEach((m, k) => {
      const st = moverState(m, t);
      const el = moverRefs.current[k];
      if (el) {
        el.setAttribute('cx', WX(st.p.x).toFixed(1));
        el.setAttribute('cy', WY(st.p.y).toFixed(1));
      }
      const ar = moverArrowRefs.current[k];
      if (ar) {
        ar.setAttribute('x1', WX(st.p.x).toFixed(1));
        ar.setAttribute('y1', WY(st.p.y).toFixed(1));
        ar.setAttribute('x2', WX(st.p.x + st.v.x).toFixed(1));
        ar.setAttribute('y2', WY(st.p.y + st.v.y).toFixed(1));
      }
    });
    if (liveRef.current) {
      const v = running ? ex.v : 0;
      const om = running ? ex.w : 0;
      const idle = c.s.t - c.s.bestT;
      liveRef.current.textContent = `t = ${fmtSig(t, 3)} s · this period: v = ${fmtSig(v, 3)} m/s, ω = ${fmtSig(om, 3)} rad/s${!c.ev.best && running ? ' · no admissible arc: braking' : ''}${running && idle > 1.5 ? ` · no progress for ${fmt(idle, 2)} s (stuck after 8 s)` : ''}`;
    }
    // velocity obstacle of the first pedestrian
    const m0 = w.movers[0];
    if (m0 && vo.cone.current) {
      const cf = cfgRef.current;
      const st = moverState(m0, t);
      const b: Disc = { p: st.p, r: m0.r, v: st.v };
      const pA = { x: pose.x, y: pose.y };
      const T = voTauRef.current;
      const R = voRange(cf.vMax);
      const shp = voShape(pA, cf.radius, b, T, 4 * R);
      vo.cone.current.setAttribute('points', shp.inside ? '' : shp.poly.map((q) => `${VOX(q.x, R).toFixed(1)},${VOY(q.y, R).toFixed(1)}`).join(' '));
      vo.cut.current?.setAttribute('cx', VOX(shp.cut.c.x, R).toFixed(1));
      vo.cut.current?.setAttribute('cy', VOY(shp.cut.c.y, R).toFixed(1));
      vo.cut.current?.setAttribute('r', ((shp.cut.r / R) * VOS).toFixed(1));
      vo.apex.current?.setAttribute('cx', VOX(st.v.x, R).toFixed(1));
      vo.apex.current?.setAttribute('cy', VOY(st.v.y, R).toFixed(1));
      vo.apexTxt.current?.setAttribute('x', (VOX(st.v.x, R) + 8).toFixed(1));
      vo.apexTxt.current?.setAttribute('y', (VOY(st.v.y, R) - 6).toFixed(1));
      const vA = { x: (running ? ex.v : 0) * Math.cos(pose.theta), y: (running ? ex.v : 0) * Math.sin(pose.theta) };
      const tA = contactTime(pA, cf.radius, vA, b, T);
      const hitA = tA !== null;
      for (const el of [vo.va.current, vo.vaDot.current]) el?.setAttribute('style', `stroke: var(${hitA ? '--bad' : '--ok'}); fill: var(${hitA ? '--bad' : '--ok'})`);
      vo.va.current?.setAttribute('x2', VOX(vA.x, R).toFixed(1));
      vo.va.current?.setAttribute('y2', VOY(vA.y, R).toFixed(1));
      vo.vaDot.current?.setAttribute('cx', VOX(vA.x, R).toFixed(1));
      vo.vaDot.current?.setAttribute('cy', VOY(vA.y, R).toFixed(1));
      const g = goalRef.current;
      const dg = Math.hypot(g.x - pA.x, g.y - pA.y) || 1;
      const pref = { x: (cf.vMax * (g.x - pA.x)) / dg, y: (cf.vMax * (g.y - pA.y)) / dg };
      vo.pref.current?.setAttribute('x2', VOX(pref.x, R).toFixed(1));
      vo.pref.current?.setAttribute('y2', VOY(pref.y, R).toFixed(1));
      const ch = voChoose(pA, cf.radius, pref, cf.vMax, [b], T, 10, 36);
      vo.choice.current?.setAttribute('cx', VOX(ch.v.x, R).toFixed(1));
      vo.choice.current?.setAttribute('cy', VOY(ch.v.y, R).toFixed(1));
      if (vo.txtA.current) vo.txtA.current.textContent = hitA ? `on a collision course: contact in ${fmt(tA as number, 3)} s` : `clear for the next ${fmt(T, 2)} s`;
      const pr = probeRef.current;
      const tP = contactTime(pA, cf.radius, pr, b, T);
      if (vo.txtP.current) vo.txtP.current.textContent = tP !== null ? `inside the cone: contact in ${fmt(tP, 3)} s` : `outside the cone: no contact within ${fmt(T, 2)} s`;
      vo.probe.current?.setAttribute('style', `stroke: var(--accent); fill: ${tP !== null ? 'var(--bad)' : 'var(--surface)'}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    drawFrame();
  });

  // ---------------------------------------------------------------- the loop: one dwaStep per control period
  useRaf((dt) => {
    const c0 = cycRef.current;
    let c = c0;
    tauRef.current += dt * speedRef.current;
    const dtc = cfgRef.current.dt;
    while (tauRef.current >= dtc) {
      tauRef.current -= dtc;
      if (c.s.status !== 'running') {
        tauRef.current = 0;
        break;
      }
      const nx = c.next;
      c = makeCycle(nx, worldRef.current, goalRef.current, cfgRef.current, planRef.current, [...c.trail, { x: nx.pose.x, y: nx.pose.y }]);
      if (c.s.status !== 'running' || pauseReq.current) {
        tauRef.current = 0;
        pauseReq.current = false;
        setPlaying(false);
        break;
      }
    }
    if (c !== c0) {
      commit(c);
      setInspect(null);
    }
    drawFrame();
  }, playing);

  const play = () => {
    if (cycRef.current.s.status !== 'running') resetRun();
    pauseReq.current = false;
    setPlaying(true);
  };
  const pause = () => {
    // Stop at the end of this control period, so the picture always shows one whole cycle.
    if (tauRef.current < 0.02) {
      setPlaying(false);
      tauRef.current = 0;
    } else pauseReq.current = true;
  };
  const stepCycle = () => {
    if (playing) return;
    if (cycRef.current.s.status !== 'running') return;
    pauseReq.current = true;
    setPlaying(true);
  };
  function resetRun(o: { start?: Pose; goal?: Vec2; world?: DwaWorld; cfg?: DwaCfg; plan?: PlanFollow | null; v?: number; w?: number } = {}) {
    const st = o.start ?? start;
    const g = o.goal ?? goal;
    const w = o.world ?? worldRef.current;
    const cf = o.cfg ?? cfgRef.current;
    const s0: DwaState = { ...initState(st, g), v: o.v ?? 0, w: o.w ?? 0 };
    // The global plan always starts where the robot starts (it may have been made mid-run).
    let pl = o.plan !== undefined ? o.plan : planRef.current;
    if (o.plan === undefined && usePlan) {
      pl = dwaPlan(w, { x: st.x, y: st.y }, g, cf);
      planRef.current = pl;
      setPlan(pl);
    }
    tauRef.current = 0;
    pauseReq.current = false;
    setInspect(null);
    commit(makeCycle(s0, w, g, cf, pl, [{ x: st.x, y: st.y }]));
  }
  const load = (id: string, o: { cfg?: Partial<DwaCfg>; plan?: boolean; play?: boolean; v?: number; w?: number; flash?: boolean } = {}) => {
    const p = presetOf(id);
    const w = cloneWorld(p.world);
    const g = { ...p.goal };
    const st = { ...p.start };
    const c = { ...DWA_DEFAULT, ...p.cfg, ...o.cfg };
    const pl = o.plan ? dwaPlan(w, st, g, c) : null;
    setPresetId(id);
    setWorld(w);
    setGoal(g);
    setStart(st);
    setCfg(c);
    setUsePlan(!!o.plan);
    setPlan(pl);
    worldRef.current = w;
    cfgRef.current = c;
    planRef.current = pl;
    resetRun({ start: st, goal: g, world: w, cfg: c, plan: pl, v: o.v, w: o.w });
    setFlashWin(!!o.flash);
    setPlaying(!!o.play);
  };
  const setK = (k: keyof DwaCfg, v: number) => setCfg((c) => ({ ...c, [k]: v }));
  // "Show me" lives below the simulation: bring the simulation (or the VO plot) into view so the answer is seen happening.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const voRef = useRef<HTMLElement>(null);
  const reveal = (fn: () => void, to: 'sim' | 'vo' = 'sim') => () => {
    fn();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // the VO section only exists once the pedestrian scene has rendered
    window.setTimeout(() => (to === 'vo' ? voRef.current : toolbarRef.current)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), to === 'vo' ? 60 : 0);
  };

  // ---------------------------------------------------------------- admissibility map of the whole box (progressive)
  const mapRef = useRef<HTMLCanvasElement>(null);
  const job = useRef({ c: cyc, cfg, row: 0, data: new Uint8Array(NVM * NWM) });
  useEffect(() => {
    job.current = { c: cyc, cfg, row: 0, data: new Uint8Array(NVM * NWM) };
  }, [cyc, cfg]);
  // A few rows per frame (≈ 3 ms), so a new cycle never costs a dropped frame; idle once the map is complete.
  useRaf(() => {
    const j = job.current;
    if (j.row >= NVM) return;
    const t0 = performance.now();
    const w = worldRef.current;
    while (j.row < NVM && performance.now() - t0 < 3) {
      // velocityMap samples v at (i + ½)/nV · vMax; asking for one row with vMax' = 2v gives exactly row i.
      const v = ((j.row + 0.5) / NVM) * j.cfg.vMax;
      const row = velocityMap(w, j.c.s.pose, { ...j.cfg, vMax: 2 * v }, 1, NWM, j.c.s.t);
      j.data.set(row, j.row * NWM);
      j.row++;
    }
    paintMap(mapRef.current, j.data, j.row, pal);
  });
  useEffect(() => {
    paintMap(mapRef.current, job.current.data, job.current.row, pal);
  }, [pal]);

  // ---------------------------------------------------------------- dragging in the world
  const svgRef = useRef<SVGSVGElement>(null);
  type Drag = { kind: 'goal' } | { kind: 'obs'; i: number; off: Vec2 } | { kind: 'robot'; off: Vec2 } | { kind: 'heading' };
  const drag = useRef<Drag | null>(null);
  const worldOf = (e: { clientX: number; clientY: number }) => (svgRef.current ? toWorld(svgPoint(svgRef.current, e.clientX, e.clientY)) : { x: 0, y: 0 });
  const startDrag = (e: RPointerEvent, d: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = d;
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const editRobot = (f: (s: DwaState) => DwaState) => {
    const c = cycRef.current;
    const s = f(c.s);
    const nc = makeCycle({ ...s, status: 'running', bestD: Math.hypot(goal.x - s.pose.x, goal.y - s.pose.y), bestT: s.t, planS: 0 }, world, goal, cfg, plan, c.s.t === 0 ? [{ x: s.pose.x, y: s.pose.y }] : c.trail);
    if (c.s.t === 0) setStart({ ...s.pose });
    commit(nc);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = worldOf(e);
    if (d.kind === 'goal') setGoal({ x: r2(clamp(p.x, 0.2, DWA_W - 0.2)), y: r2(clamp(p.y, 0.2, DWA_H - 0.2)) });
    else if (d.kind === 'obs') setWorld((w) => ({ ...w, obstacles: w.obstacles.map((o, k) => (k === d.i ? moveShape(o, { x: clamp(p.x - d.off.x, 0, DWA_W), y: clamp(p.y - d.off.y, 0, DWA_H) }) : o)) }));
    else if (d.kind === 'robot') editRobot((s) => ({ ...s, pose: { ...s.pose, x: r2(clamp(p.x - d.off.x, 0.3, DWA_W - 0.3)), y: r2(clamp(p.y - d.off.y, 0.3, DWA_H - 0.3)) } }));
    else editRobot((s) => ({ ...s, pose: { ...s.pose, theta: Math.atan2(p.y - s.pose.y, p.x - s.pose.x) } }));
  };
  const endDrag = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
  };

  // ---------------------------------------------------------------- dragging the current (v, ω) in the velocity panel
  const vSvgRef = useRef<SVGSVGElement>(null);
  const vDrag = useRef(false);
  const vAt = (e: { clientX: number; clientY: number }) => {
    if (!vSvgRef.current) return null;
    const q = svgPoint(vSvgRef.current, e.clientX, e.clientY);
    const om = ((q.x - VB.l) / VB.w) * (2 + 2 * VM) - 1 - VM;
    const vv = 1 + VM - ((q.y - VB.t) / VB.h) * (1 + 2 * VM);
    return { v: r2(clamp(vv, 0, 1) * cfg.vMax), w: r2(clamp(om, -1, 1) * cfg.wMax) };
  };

  // ---------------------------------------------------------------- derived for rendering
  const c = cyc;
  const ev = c.ev;
  const adm = ev.cands.filter((k) => k.admissible);
  const gMin = adm.length ? Math.min(...adm.map((k) => k.score)) : 0;
  const gMax = adm.length ? Math.max(...adm.map((k) => k.score)) : 1;
  const counts = { ok: adm.length, stop: 0, moving: 0, contact: 0 };
  for (const k of ev.cands) if (!k.admissible) counts[k.reason]++;
  const bestIdx = ev.best ? ev.cands.indexOf(ev.best) : -1;
  const insIdx = inspect !== null && inspect < ev.cands.length ? inspect : bestIdx;
  const ins = insIdx >= 0 ? ev.cands[insIdx] : null;
  const vrd = verdict(c, cfg, world, usePlan);
  const running = c.s.status === 'running';

  const arcs = useMemo(() => {
    if (!showArcs) return null;
    return ev.cands.map((k, i) => {
      if (k === ev.best) return null;
      if (k.admissible) {
        const t = gMax > gMin ? (k.score - gMin) / (gMax - gMin) : 1;
        return <path key={i} className="plan-local-arc" d={arcD(k.traj)} style={{ stroke: 'var(--m1)', opacity: 0.12 + 0.55 * t * t }} />;
      }
      return <path key={i} className="plan-local-arc is-bad" d={arcD(k.traj)} style={k.reason === 'moving' ? { stroke: 'var(--m4)' } : undefined} />;
    });
  }, [ev, showArcs, gMin, gMax]);

  const winRect = { x: VX(ev.window.w0, cfg.wMax), y: VY(ev.window.v1, cfg.vMax), w: VX(ev.window.w1, cfg.wMax) - VX(ev.window.w0, cfg.wMax), h: VY(ev.window.v0, cfg.vMax) - VY(ev.window.v1, cfg.vMax) };
  const hasMovers = world.movers.length > 0;
  const R = voRange(cfg.vMax);

  return (
    <div className="plan-local">
      <div className="plan-local-toolbar" ref={toolbarRef}>
        <Select label="Scene" value={presetId} onChange={(id) => load(id)} options={DWA_PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
        <Button variant="primary" onClick={() => (playing ? pause() : play())} title={playing ? 'Pause at the end of this control period' : 'Run DWA cycles'}>
          {playing ? '⏸ Pause' : running ? '▶ Play' : '↻ Replay'}
        </Button>
        <Button onClick={stepCycle} disabled={playing || !running} title="Run exactly one control cycle (Δt)">
          ▶| One cycle
        </Button>
        <Button onClick={() => { setPlaying(false); resetRun(); }} title="Back to the start pose">
          ⏮ Reset
        </Button>
        <Segmented size="sm" label="Playback speed" value={speed} onChange={setSpeed} options={[0.5, 1, 2, 4].map((k) => ({ value: k, label: `×${k}` }))} />
        <span className="plan-local-toolbar-sep" aria-hidden="true" />
        <Toggle checked={usePlan} onChange={setUsePlan} label="Global plan (A*)" />
        <Toggle checked={showArcs} onChange={setShowArcs} label="All candidate arcs" />
      </div>

      <div className="plan-local-main is-dwa">
        <section className="plan-local-panel" aria-label="World">
          <div className="plan-local-head">
            <h4>World (10 × 7 m)</h4>
            <span className="muted">drag G, the obstacles, the robot or its heading knob</span>
          </div>
          <div className="plan-local-world is-dwa">
            <svg ref={svgRef} viewBox={`0 0 ${WV} ${WHT}`} role="group" aria-label="Dynamic window world: drag the goal, the obstacles and the robot" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
              <defs>
                <marker id={`${uid}-mv`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">
                  <path d="M0 0L10 5L0 10z" style={{ fill: 'var(--m4)' }} />
                </marker>
              </defs>
              <rect x={PL} y={PT} width={DWA_W * KW} height={DWA_H * KW} className="plot-frame" style={{ fill: 'var(--surface-2)' }} />
              {Array.from({ length: DWA_W + 1 }, (_, i) => (
                <g key={`gx${i}`} pointerEvents="none">
                  <line x1={WX(i)} x2={WX(i)} y1={WY(0)} y2={WY(DWA_H)} className="grid" />
                  {i % 2 === 0 && (
                    <text className="tick" x={WX(i)} y={WY(0) + 15} textAnchor="middle">
                      {i}
                    </text>
                  )}
                </g>
              ))}
              {Array.from({ length: DWA_H + 1 }, (_, i) => (
                <g key={`gy${i}`} pointerEvents="none">
                  <line x1={WX(0)} x2={WX(DWA_W)} y1={WY(i)} y2={WY(i)} className="grid" />
                  {i % 2 === 1 && (
                    <text className="tick" x={WX(0) - 6} y={WY(i) + 4} textAnchor="end">
                      {i}
                    </text>
                  )}
                </g>
              ))}
              <text className="tick" x={WX(DWA_W)} y={WY(0) + 27} textAnchor="end">
                x (m)
              </text>
              {plan && <path className="plan-local-plan" d={plan.pts.map((p, i) => `${i ? 'L' : 'M'}${WX(p.x).toFixed(1)} ${WY(p.y).toFixed(1)}`).join('')} />}
              {world.movers.map((m, k) => (
                <g key={`mp${k}`} pointerEvents="none">
                  <line x1={WX(m.a.x)} y1={WY(m.a.y)} x2={WX(m.b.x)} y2={WY(m.b.y)} stroke="var(--m4)" strokeWidth={1} strokeDasharray="3 5" opacity={0.6} />
                  {(() => {
                    const st = moverState(m, c.s.t);
                    const T = cfg.horizon;
                    return <circle cx={WX(st.p.x + st.v.x * T)} cy={WY(st.p.y + st.v.y * T)} r={m.r * KW} fill="none" stroke="var(--m4)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.75} />;
                  })()}
                </g>
              ))}
              {world.obstacles.map((o, k) => (
                <g
                  key={`o${k}`}
                  className="plan-local-drag"
                  tabIndex={0}
                  role="button"
                  aria-label={`Obstacle ${k + 1}: drag it or use the arrow keys`}
                  onPointerDown={(e) => {
                    const p = worldOf(e);
                    const cc = centreOf(o);
                    startDrag(e, { kind: 'obs', i: k, off: { x: p.x - cc.x, y: p.y - cc.y } });
                  }}
                  onKeyDown={(e) => {
                    const st = e.shiftKey ? 0.5 : 0.1;
                    const d = e.key === 'ArrowLeft' ? [-st, 0] : e.key === 'ArrowRight' ? [st, 0] : e.key === 'ArrowUp' ? [0, st] : e.key === 'ArrowDown' ? [0, -st] : null;
                    if (!d) return;
                    e.preventDefault();
                    setWorld((w) => ({ ...w, obstacles: w.obstacles.map((ob, j) => (j === k ? moveShape(ob, { x: centreOf(ob).x + d[0], y: centreOf(ob).y + d[1] }) : ob)) }));
                  }}
                >
                  {o.kind === 'circle' ? (
                    <circle className="plan-local-obs" cx={WX(o.x)} cy={WY(o.y)} r={o.r * KW} />
                  ) : o.kind === 'rect' ? (
                    <rect className="plan-local-obs" x={WX(o.x)} y={WY(o.y + o.h)} width={o.w * KW} height={o.h * KW} />
                  ) : (
                    <polygon className="plan-local-obs" points={o.pts.map((p) => `${WX(p.x)},${WY(p.y)}`).join(' ')} />
                  )}
                </g>
              ))}
              {c.trail.length > 1 && <polyline className="plan-local-trail" points={c.trail.map((p) => `${WX(p.x).toFixed(1)},${WY(p.y).toFixed(1)}`).join(' ')} />}
              {arcs}
              {ins && ins !== ev.best && <path className="plan-local-arc" d={arcD(ins.traj)} style={{ stroke: ins.admissible ? 'var(--accent)' : 'var(--bad)', strokeWidth: 2.6, strokeDasharray: '6 3', opacity: 1 }} />}
              {ev.best && <path className="plan-local-arc is-best" d={arcD(ev.best.traj)} />}
              {/* heading target (the goal, or the carrot on the plan) */}
              {plan && (
                <g pointerEvents="none">
                  <circle cx={WX(ev.target.x)} cy={WY(ev.target.y)} r={5} fill="var(--m3)" stroke="var(--surface)" strokeWidth={1.5} />
                </g>
              )}
              {world.movers.map((m, k) => (
                <g key={`mv${k}`} pointerEvents="none">
                  <circle
                    ref={(el) => {
                      moverRefs.current[k] = el;
                    }}
                    className="plan-local-mover"
                    r={m.r * KW}
                  />
                  <line
                    ref={(el) => {
                      moverArrowRefs.current[k] = el;
                    }}
                    stroke="var(--m4)"
                    strokeWidth={2}
                    markerEnd={`url(#${uid}-mv)`}
                  />
                </g>
              ))}
              <g
                className="plan-local-drag"
                tabIndex={0}
                role="button"
                aria-label={`Goal G at (${goal.x}, ${goal.y}) m: drag it or use the arrow keys`}
                onPointerDown={(e) => startDrag(e, { kind: 'goal' })}
                onKeyDown={(e) => {
                  const st = e.shiftKey ? 0.5 : 0.1;
                  const d = e.key === 'ArrowLeft' ? [-st, 0] : e.key === 'ArrowRight' ? [st, 0] : e.key === 'ArrowUp' ? [0, st] : e.key === 'ArrowDown' ? [0, -st] : null;
                  if (!d) return;
                  e.preventDefault();
                  setGoal((g) => ({ x: r2(clamp(g.x + d[0], 0.2, DWA_W - 0.2)), y: r2(clamp(g.y + d[1], 0.2, DWA_H - 0.2)) }));
                }}
              >
                <circle cx={WX(goal.x)} cy={WY(goal.y)} r={GOAL_RADIUS * KW + 6} fill="transparent" />
                <circle className="plan-local-focus" cx={WX(goal.x)} cy={WY(goal.y)} r={GOAL_RADIUS * KW + 4} fill="none" />
                <circle cx={WX(goal.x)} cy={WY(goal.y)} r={GOAL_RADIUS * KW} fill="none" stroke="var(--ok)" strokeWidth={2} strokeDasharray="4 3" />
                <circle cx={WX(goal.x)} cy={WY(goal.y)} r={4} fill="var(--ok)" />
                <text className="plan-local-label" x={WX(goal.x)} y={WY(goal.y) - GOAL_RADIUS * KW - 6} textAnchor="middle">
                  G
                </text>
              </g>
              <g ref={robotRef}>
                <g
                  className="plan-local-drag"
                  tabIndex={0}
                  role="button"
                  aria-label={`Robot at (${fmt(c.s.pose.x, 3)}, ${fmt(c.s.pose.y, 3)}) m: drag it, or use the arrow keys to move it and , . to turn it (while paused)`}
                  onPointerDown={(e) => !playing && startDrag(e, { kind: 'robot', off: { x: worldOf(e).x - c.s.pose.x, y: worldOf(e).y - c.s.pose.y } })}
                  onKeyDown={(e) => {
                    if (playing) return;
                    const st = e.shiftKey ? 0.5 : 0.1;
                    const d = e.key === 'ArrowLeft' ? [-st, 0] : e.key === 'ArrowRight' ? [st, 0] : e.key === 'ArrowUp' ? [0, st] : e.key === 'ArrowDown' ? [0, -st] : null;
                    const turn = e.key === ',' ? Math.PI / 12 : e.key === '.' ? -Math.PI / 12 : 0;
                    if (!d && !turn) return;
                    e.preventDefault();
                    editRobot((s) => ({
                      ...s,
                      pose: d
                        ? { ...s.pose, x: r2(clamp(s.pose.x + d[0], 0.3, DWA_W - 0.3)), y: r2(clamp(s.pose.y + d[1], 0.3, DWA_H - 0.3)) }
                        : { ...s.pose, theta: wrapAngle(s.pose.theta + turn) },
                    }));
                  }}
                  style={{ cursor: playing ? 'default' : undefined }}
                >
                  <circle className="plan-local-focus" r={cfg.radius * KW + 5} fill="none" />
                  <circle r={cfg.radius * KW} className="plan-local-robot" />
                  <line x1={0} y1={0} x2={cfg.radius * KW} y2={0} stroke="var(--surface)" strokeWidth={2.5} />
                </g>
                {!playing && (
                  <g className="plan-local-drag" onPointerDown={(e) => startDrag(e, { kind: 'heading' })}>
                    <line x1={cfg.radius * KW} y1={0} x2={cfg.radius * KW + 16} y2={0} stroke="var(--accent)" strokeWidth={2} />
                    <circle cx={cfg.radius * KW + 20} cy={0} r={5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
                  </g>
                )}
              </g>
            </svg>
          </div>
          <div className="plan-local-legend" aria-hidden="true">
            <span>
              <svg width="22" height="10">
                <line x1="1" y1="5" x2="21" y2="5" stroke="var(--text)" strokeWidth="3" />
              </svg>
              executed arc
            </span>
            <span>
              <svg width="22" height="10">
                <line x1="1" y1="5" x2="21" y2="5" stroke="var(--m1)" strokeWidth="2" opacity="0.6" />
              </svg>
              admissible (darker = higher G)
            </span>
            <span>
              <svg width="22" height="10">
                <line x1="1" y1="5" x2="21" y2="5" stroke="var(--bad)" strokeWidth="1.5" strokeDasharray="3 3" />
              </svg>
              cannot stop
            </span>
            {hasMovers && (
              <span>
                <svg width="22" height="10">
                  <line x1="1" y1="5" x2="21" y2="5" stroke="var(--m4)" strokeWidth="1.5" strokeDasharray="3 3" />
                </svg>
                meets the pedestrian (dashed ring: where DWA predicts it in {fmt(cfg.horizon, 2)} s)
              </span>
            )}
            {plan && (
              <span>
                <svg width="22" height="10">
                  <line x1="1" y1="5" x2="21" y2="5" stroke="var(--m3)" strokeWidth="2" strokeDasharray="6 4" />
                </svg>
                global plan and the sub-goal it aims at
              </span>
            )}
          </div>
          <div className="plan-local-status" aria-live="polite">
            {vrd ? (
              <Callout kind={vrd.kind === 'ok' ? 'ok' : vrd.kind === 'warn' ? 'warn' : 'bad'} title={vrd.title}>
                <Rich text={vrd.text} />
              </Callout>
            ) : (
              <p className="plan-local-live" style={{ margin: 0 }}>
                <span ref={liveRef} />
              </p>
            )}
          </div>
          {usePlan && !plan && <Rich className="note" text="The global planner found no route on its 20 cm grid (obstacles grown by the robot radius + 0.25 m), so DWA aims straight at G." />}
          {running && c.s.t === 0 && c.s.v < 1e-6 && (
            <Rich
              className="note"
              text={`At rest the window only reaches $v \\le \\dot v_{max}\\Delta t$ = ${fmt(cfg.aMax * cfg.dt, 2)} m/s, so this cycle’s arcs are short. Press **Play** or **One cycle** and watch the window climb the box.`}
            />
          )}
          <div className="plan-local-sample">
            <div className="plan-local-head">
              <h4>{ins ? (ins === ev.best ? 'The chosen sample' : 'Inspected sample') : 'No admissible sample: braking'}</h4>
              <span className="row gap-s">
                <Button size="sm" onClick={() => setInspect(((insIdx < 0 ? 0 : insIdx) + ev.cands.length - 1) % ev.cands.length)} aria-label="Previous sample">
                  ◀
                </Button>
                <Button size="sm" onClick={() => setInspect(null)} disabled={inspect === null}>
                  best
                </Button>
                <Button size="sm" onClick={() => setInspect(((insIdx < 0 ? -1 : insIdx) + 1) % ev.cands.length)} aria-label="Next sample">
                  ▶
                </Button>
              </span>
            </div>
            {ins ? <SampleDetails k={ins} cfg={cfg} best={ins === ev.best} /> : <Rich text={`Every sample in the window is inadmissible, so DWA brakes as hard as it can: $v$ = ${fmt(ev.window.v0, 3)} m/s next period.`} />}
          </div>
        </section>

        <section className="plan-local-panel" aria-label="Velocity space">
          <div className="plan-local-head">
            <h4>Velocity space: this cycle’s choice</h4>
            <span className="muted">box = every velocity the motors allow · {playing ? 'pause to drag “now”' : 'drag “now” · click a sample'}</span>
          </div>
          <div className="plan-local-vbox">
            <canvas
              ref={mapRef}
              aria-hidden="true"
              style={{ left: `${(BOX.x0 / VV) * 100}%`, top: `${(BOX.y0 / VH) * 100}%`, width: `${((BOX.x1 - BOX.x0) / VV) * 100}%`, height: `${((BOX.y1 - BOX.y0) / VH) * 100}%` }}
            />
            <svg
              ref={vSvgRef}
              viewBox={`0 0 ${VV} ${VH}`}
              role="group"
              aria-label="Velocity space: the box of all velocities, the admissible region, the dynamic window and the sampled candidates"
              onPointerMove={(e) => {
                if (!vDrag.current) return;
                const q = vAt(e);
                if (q) editRobot((s) => ({ ...s, v: q.v, w: q.w }));
              }}
              onPointerUp={(e) => {
                vDrag.current = false;
                if (vSvgRef.current?.hasPointerCapture(e.pointerId)) vSvgRef.current.releasePointerCapture(e.pointerId);
              }}
            >
              <rect x={BOX.x0} y={BOX.y0} width={BOX.x1 - BOX.x0} height={BOX.y1 - BOX.y0} className="plan-local-box" />
              <line x1={VX(0, 1)} x2={VX(0, 1)} y1={BOX.y0} y2={BOX.y1} className="grid" />
              {[-1, -0.5, 0, 0.5, 1].map((f) => (
                <text key={`tw${f}`} className="tick" x={VX(f, 1)} y={BOX.y1 + 15} textAnchor="middle">
                  {fmt(f * cfg.wMax, 2)}
                </text>
              ))}
              {[0, 0.5, 1].map((f) => (
                <text key={`tv${f}`} className="tick" x={BOX.x0 - 6} y={VY(f, 1) + 4} textAnchor="end">
                  {fmt(f * cfg.vMax, 2)}
                </text>
              ))}
              <text className="axis-label" x={(BOX.x0 + BOX.x1) / 2} y={VH - 6} textAnchor="middle">
                ω (rad/s): left turn +
              </text>
              <text className="axis-label" transform={`translate(12 ${(BOX.y0 + BOX.y1) / 2}) rotate(-90)`} textAnchor="middle">
                v (m/s)
              </text>
              <rect className="plan-local-win" x={winRect.x} y={winRect.y} width={Math.max(1, winRect.w)} height={Math.max(1, winRect.h)} style={flashWin ? { strokeWidth: 3.5 } : undefined} />
              {/* 9 px above the window: clear of the "best" ring (r = 8) and label even when the best sample is on the top row */}
              <text
                className="plan-local-note"
                x={winRect.x > VV - 110 ? winRect.x + winRect.w : winRect.x}
                y={winRect.y - 9}
                textAnchor={winRect.x > VV - 110 ? 'end' : 'start'}
                style={{ fill: 'var(--accent)', fontWeight: 600 }}
              >
                window V_d
              </text>
              {ev.cands.map((k, i) => {
                const x = VX(k.w, cfg.wMax);
                const y = VY(k.v, cfg.vMax);
                const sel = i === insIdx;
                const onClick = () => setInspect(i);
                if (!k.admissible)
                  return (
                    <g key={i} onClick={onClick} style={{ cursor: 'pointer' }}>
                      <circle cx={x} cy={y} r={5} fill="transparent" />
                      <path d={`M${x - 3} ${y - 3}L${x + 3} ${y + 3}M${x - 3} ${y + 3}L${x + 3} ${y - 3}`} className="plan-local-cand-x" style={k.reason === 'moving' ? { stroke: 'var(--m4)' } : undefined} />
                      {sel && <circle cx={x} cy={y} r={7} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
                    </g>
                  );
                const t = gMax > gMin ? (k.score - gMin) / (gMax - gMin) : 1;
                return (
                  <g key={i} onClick={onClick} style={{ cursor: 'pointer' }}>
                    <circle cx={x} cy={y} r={5} fill="transparent" />
                    <circle cx={x} cy={y} r={2.2 + 2 * t} fill="var(--m1)" opacity={0.3 + 0.7 * t} />
                    {sel && <circle cx={x} cy={y} r={7} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
                  </g>
                );
              })}
              {ev.best && (
                <g pointerEvents="none">
                  <circle cx={VX(ev.best.w, cfg.wMax)} cy={VY(ev.best.v, cfg.vMax)} r={8} className="plan-local-best" />
                  <text className="plan-local-note" x={VX(ev.best.w, cfg.wMax) + 11} y={VY(ev.best.v, cfg.vMax) + 4} style={{ fontWeight: 700, fill: 'var(--text)' }}>
                    best
                  </text>
                </g>
              )}
              <g
                className="plan-local-drag"
                tabIndex={0}
                role="button"
                aria-label={`Current velocity v = ${fmt(c.s.v, 3)} m/s, ω = ${fmt(c.s.w, 3)} rad/s: drag it, or Up/Down change v and Left/Right change ω (while paused)`}
                onPointerDown={(e) => {
                  if (playing) return;
                  e.preventDefault();
                  vDrag.current = true;
                  vSvgRef.current?.setPointerCapture(e.pointerId);
                }}
                onKeyDown={(e) => {
                  if (playing) return;
                  const dv = e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowDown' ? -0.05 : 0;
                  const dw = e.key === 'ArrowRight' ? 0.05 : e.key === 'ArrowLeft' ? -0.05 : 0;
                  if (!dv && !dw) return;
                  e.preventDefault();
                  editRobot((s) => ({ ...s, v: r2(clamp(s.v + dv * cfg.vMax, 0, cfg.vMax)), w: r2(clamp(s.w + dw * cfg.wMax, -cfg.wMax, cfg.wMax)) }));
                }}
                style={{ cursor: playing ? 'default' : undefined }}
              >
                <circle cx={VX(c.s.w, cfg.wMax)} cy={VY(c.s.v, cfg.vMax)} r={11} fill="transparent" />
                <circle className="plan-local-focus" cx={VX(c.s.w, cfg.wMax)} cy={VY(c.s.v, cfg.vMax)} r={9} fill="none" />
                <circle cx={VX(c.s.w, cfg.wMax)} cy={VY(c.s.v, cfg.vMax)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
                <text className="plan-local-note" x={VX(c.s.w, cfg.wMax)} y={VY(c.s.v, cfg.vMax) + 17} textAnchor="middle" style={{ fill: 'var(--accent)', fontWeight: 700 }}>
                  now
                </text>
              </g>
            </svg>
          </div>
          <div className="plan-local-reasons">
            <span>
              {ev.cands.length} samples ({cfg.nv} × {cfg.nw}):
            </span>
            <span style={{ color: 'var(--m1)' }}>● {counts.ok} admissible</span>
            <span style={{ color: 'var(--bad)' }}>× {counts.stop + counts.contact} cannot stop</span>
            {hasMovers && <span style={{ color: 'var(--m4)' }}>× {counts.moving} meet the pedestrian</span>}
          </div>
          <Rich
            className="small"
            text={`Window now: $v \\in [${tex(c.s.v, 3)} \\pm ${tex(cfg.aMax * cfg.dt, 3)}] \\cap [0, ${tex(cfg.vMax, 3)}] = [\\mathbf{${tex(ev.window.v0, 3)}}, \\mathbf{${tex(ev.window.v1, 3)}}]$ m/s, $\\ \\omega \\in [${tex(c.s.w, 3)} \\pm ${tex(cfg.alphaMax * cfg.dt, 3)}] \\cap [\\pm ${tex(cfg.wMax, 3)}] = [\\mathbf{${tex(ev.window.w0, 3)}}, \\mathbf{${tex(ev.window.w1, 3)}}]$ rad/s`}
          />
          <Rich
            className="note"
            text="Shading over the whole box: red = could not stop before a static obstacle from here, purple = would meet the pedestrian within the horizon. Only the samples inside the window are actually tried."
          />
          <div className="plan-local-sliders" aria-label="DWA parameters">
            <Slider label="heading weight" tex="w_h" tip="Weight of the heading term: 1 − |angle to G at the end of the arc| / π" value={cfg.wHeading} min={0} max={1} step={0.05} onChange={(x) => setK('wHeading', x)} />
            <Slider label="clearance weight" tex="w_c" tip="Weight of the clearance term: free distance along the arc / 2 m (capped at 1)" value={cfg.wClear} min={0} max={1} step={0.05} onChange={(x) => setK('wClear', x)} />
            <Slider label="velocity weight" tex="w_v" tip="Weight of the velocity term: v / v_max" value={cfg.wVel} min={0} max={1} step={0.05} onChange={(x) => setK('wVel', x)} />
            <Slider label="max speed" tex="v_{max}" tip="Top of the box V_s" value={cfg.vMax} min={0.3} max={2} step={0.05} unit="m/s" onChange={(x) => setK('vMax', x)} />
            <Slider label="acceleration" tex="\dot v_{max}" tip="Translational acceleration (and braking) limit: the window is v ± v̇_max Δt" value={cfg.aMax} min={0.2} max={3} step={0.05} unit="m/s²" onChange={(x) => setK('aMax', x)} />
            <Slider label="angular accel." tex="\dot\omega_{max}" tip="Angular acceleration limit: the window is ω ± ω̇_max Δt" value={cfg.alphaMax} min={0.5} max={8} step={0.1} unit="rad/s²" onChange={(x) => setK('alphaMax', x)} />
            <Slider label="horizon" tex="T" tip="How far ahead each candidate arc is simulated (heading is judged at its end; the pedestrian is checked over it)" value={cfg.horizon} min={0.4} max={3} step={0.1} unit="s" onChange={(x) => setK('horizon', x)} />
            <Slider label="control period" tex="\Delta t" tip="How long each chosen (v, ω) is driven before the next cycle; the window is what Δt of acceleration can reach" value={cfg.dt} min={0.1} max={0.5} step={0.05} unit="s" onChange={(x) => setK('dt', x)} />
          </div>
        </section>
      </div>

      <section className="plan-local-panel plan-local-section" aria-label="Velocity obstacle" ref={voRef}>
        <div className="plan-local-head">
          <h4>Velocity obstacle of the pedestrian</h4>
          <span className="muted">the same test in the robot’s (v_x, v_y) plane</span>
        </div>
        {hasMovers ? (
          <div className="plan-local-vo">
            <div className="plan-local-vo-box">
              <svg
                viewBox={`0 0 ${VOW} ${VOW}`}
                role="group"
                aria-label="Velocity obstacle: the cone of robot velocities that hit the pedestrian within tau"
                onPointerDown={(e) => {
                  const svg = e.currentTarget;
                  svg.setPointerCapture(e.pointerId);
                  const q = svgPoint(svg, e.clientX, e.clientY);
                  setProbe(voFromPx(q, R, cfg.vMax));
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const q = svgPoint(e.currentTarget, e.clientX, e.clientY);
                  setProbe(voFromPx(q, R, cfg.vMax));
                }}
                onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
              >
                <defs>
                  <clipPath id={`${uid}-voclip`}>
                    <rect x={VOP} y={VOP} width={VOW - 2 * VOP} height={VOW - 2 * VOP} />
                  </clipPath>
                </defs>
                <rect x={VOP} y={VOP} width={VOW - 2 * VOP} height={VOW - 2 * VOP} className="plot-frame" />
                <line x1={VOX(-R, R)} x2={VOX(R, R)} y1={VOY(0, R)} y2={VOY(0, R)} className="grid" />
                <line x1={VOX(0, R)} x2={VOX(0, R)} y1={VOY(-R, R)} y2={VOY(R, R)} className="grid" />
                <circle cx={VOX(0, R)} cy={VOY(0, R)} r={(cfg.vMax / R) * VOS} fill="none" stroke="var(--text-3)" strokeDasharray="4 4" />
                <text className="tick" x={VOX(-0.71 * cfg.vMax, R) - 4} y={VOY(0.71 * cfg.vMax, R) - 4} textAnchor="end">
                  |v| = v_max
                </text>
                <g clipPath={`url(#${uid}-voclip)`}>
                  <polygon ref={vo.cone} className="plan-local-cone" />
                  <circle ref={vo.cut} fill="none" stroke="var(--bad)" strokeDasharray="2 3" />
                </g>
                <circle ref={vo.apex} r={4} fill="var(--m4)" />
                <text ref={vo.apexTxt} className="plan-local-note" style={{ fill: 'var(--m4)', fontWeight: 600 }}>
                  v_B (pedestrian)
                </text>
                <line ref={vo.pref} x1={VOX(0, R)} y1={VOY(0, R)} stroke="var(--ok)" strokeWidth={1.5} strokeDasharray="5 4" />
                <circle ref={vo.choice} r={5} fill="none" stroke="var(--ok)" strokeWidth={2} />
                <line ref={vo.va} x1={VOX(0, R)} y1={VOY(0, R)} strokeWidth={2.5} />
                <circle ref={vo.vaDot} r={4} />
                <circle ref={vo.probe} cx={VOX(probe.x, R)} cy={VOY(probe.y, R)} r={6} strokeWidth={2} />
                <text className="tick" x={VOW - VOP - 4} y={VOY(0, R) + 14} textAnchor="end">
                  v_x (m/s)
                </text>
                <text className="tick" x={VOX(0, R) + 5} y={VOP + 12}>
                  v_y
                </text>
              </svg>
            </div>
            <div>
              <Rich
                text={`Each velocity $v_A$ of the robot is a point. It is in the **velocity obstacle** $VO^{\\tau}$ (red) if, holding $v_A$ while the pedestrian holds $v_B$, the two discs would touch within $\\tau$:
$$VO^{\\tau}_{A|B} = \\{\\, v_A : \\lVert (p_A + v_A t) - (p_B + v_B t) \\rVert < r_A + r_B \\ \\text{for some}\\ t \\in [0, \\tau] \\,\\}$$
The cone’s apex is $v_B$ and it points at the pedestrian; the round end is the disc of radius $(r_A + r_B)/\\tau$, so a **longer** $\\tau$ reaches **closer** to the apex (more velocities count as collisions).`}
              />
              <div className="plan-local-live">
                <Rich inline text="**Robot now** (solid arrow, $v_A = v(\cos\theta, \sin\theta)$): " />
                <span ref={vo.txtA} />
              </div>
              <div className="plan-local-live">
                <b>Your probe</b> (click or drag in the plot): <span ref={vo.txtP} />
              </div>
              <Rich className="note" text="Dashed green: the preferred velocity (straight at G at $v_{max}$); green ring: the velocity closest to it that is outside the cone, which is what a VO planner would pick. DWA reaches the same verdict by simulating each arc against the pedestrian’s predicted position (purple × in velocity space)." />
              <Slider label="time horizon" tex="\tau" tip="Velocities that collide only after τ seconds are allowed" value={voTau} min={0.5} max={8} step={0.1} unit="s" onChange={setVoTau} />
            </div>
          </div>
        ) : (
          <div className="row gap-s" style={{ alignItems: 'center' }}>
            <span className="muted small">No moving obstacle in this scene.</span>
            <Button size="sm" onClick={() => load('cross')}>
              Load the crossing pedestrian
            </Button>
          </div>
        )}
      </section>

      <div className="plan-local-predicts">
        <PredictReveal
          id="plan-dwa-window"
          question="The robot drives at $v$ = 0.8 m/s, $\omega$ = 0 with $\dot v_{max}$ = 1 m/s², $\dot\omega_{max}$ = 4 rad/s², $\Delta t$ = 0.25 s and $v_{max}$ = 1 m/s. Which velocities can DWA choose for the next period?"
          options={['Only $v$ = 0.8 m/s, with any $\\omega$', 'Any $(v, \\omega)$ in the box: 0 to 1 m/s and ±2 rad/s', 'Only $v$ from 0.55 to 1.0 m/s and $\\omega$ from −1 to +1 rad/s']}
          answer={2}
          explain="In one period the motors can change $v$ by at most $\dot v_{max}\Delta t$ = 0.25 m/s and $\omega$ by $\dot\omega_{max}\Delta t$ = 1 rad/s, so $V_d = [0.55, 1.05] \times [-1, 1]$, cut by the box to $v \le 1$. Anything else (stopping dead, spinning at 2 rad/s) cannot be reached in 0.25 s, so it is not a real option. That is also why DWA is cheap: it scores 91 samples of a small rectangle, not the whole box."
          tryIt="the robot is set to 0.8 m/s, ω = 0; compare the window (teal) with the box."
          onApply={reveal(() => load('open', { v: 0.8, w: 0, flash: true }))}
        />
        <PredictReveal
          id="plan-dwa-speed"
          question="Obstacle ahead. Set the clearance weight $w_c$ to 0 and raise the velocity weight $w_v$ to 0.6. What happens at the first obstacle?"
          options={['It drives straight at it and stalls in front', 'It swerves round it, earlier and faster', 'It crashes into it at full speed']}
          answer={0}
          explain="With nothing rewarding clearance, the straight full-speed arc scores best (heading and speed) until it becomes **inadmissible**: it could no longer stop in the free distance. Then the robot has to brake, and once slow, the arcs that turn away lose heading score while creeping straight on is blocked, so it stops about 0.15 m short and stays. It never crashes: admissibility is a hard constraint; the weights only rank what is admissible."
          tryIt="load “Obstacle ahead” with w_c = 0, w_v = 0.6 and play."
          onApply={reveal(() => load('open', { cfg: { wClear: 0, wVel: 0.6 }, play: true }))}
        />
        <PredictReveal
          id="plan-dwa-trap"
          question="**U-trap**: G is behind a U-shaped wall that opens toward the robot. With no global plan, what does DWA do?"
          options={['It drives round the U and reaches G', 'It crashes into the back wall', 'It drives into the U and stops at the back wall']}
          answer={2}
          explain="Each arc is judged by where it leaves the robot after $T$ = 1 s, and pointing at G is best straight into the U. At the back wall every arc toward G is inadmissible and every admissible arc turns away and loses heading, so stopping wins. DWA sees 1 s ahead and has no map of the way round: a **local minimum**, like a potential field’s. Switch on **Global plan (A\*)**: the heading term then aims at a sub-goal on the A* path, and it drives round."
          tryIt="load the U-trap without the plan and play; then switch the plan on and replay."
          onApply={reveal(() => load('trap', { play: true }))}
        />
        <PredictReveal
          id="plan-dwa-novel"
          question="Set the velocity weight $w_v$ to 0 (heading and clearance only). What does the robot do from rest, facing G?"
          options={['Stays where it is', 'Drives to G more carefully', 'Drives in circles']}
          answer={0}
          explain="$G = w_h\,\text{heading} + w_c\,\text{clearance}$ no longer rewards motion. Facing G, standing still already has the best heading (moving forward does not improve it), and its clearance score is no worse, so $v = 0$ wins every cycle and the robot never leaves. The velocity term is what makes a DWA robot go."
          tryIt="load “Obstacle ahead” with w_v = 0 and play."
          onApply={reveal(() => load('open', { cfg: { wVel: 0 }, play: true }))}
        />
        <PredictReveal
          id="plan-dwa-pedestrian"
          question="A pedestrian walks across the robot’s path at 0.7 m/s. With the default weights, what does DWA do?"
          options={['Swerves round in front of the pedestrian', 'Slows down and lets the pedestrian cross first', 'Keeps its speed and collides']}
          answer={1}
          explain="DWA predicts the pedestrian at constant velocity and rejects every arc that would meet it within the 1 s horizon (purple ×). The fast straight arcs go first, so the robot drops to about 0.5 m/s; once the pedestrian has crossed, the full-speed arc is admissible again and it accelerates. Watch the purple region in velocity space appear and vanish."
          tryIt="load the crossing pedestrian and play."
          onApply={reveal(() => load('cross', { play: true }))}
        />
        <PredictReveal
          id="plan-dwa-vo-tau"
          question="In the velocity-obstacle plot, raise the horizon $\tau$ from 3 s to 8 s. What happens to the red cone?"
          options={['It grows toward its apex: more velocities are dangerous', 'It shrinks: fewer velocities are dangerous', 'Nothing changes: $\\tau$ only sets the colours']}
          answer={0}
          explain="The cone is cut off by the disc of radius $(r_A + r_B)/\tau$ centred at $v_B + (p_B - p_A)/\tau$. A longer $\tau$ shrinks that disc and pulls it toward the apex $v_B$, so slow approaches that would only touch after 3 s now count too. Too long a $\tau$ makes a crowded room look blocked; too short reacts late."
          tryIt="load the crossing pedestrian and set τ = 8 s."
          onApply={reveal(() => {
            load('cross');
            setVoTau(8);
          }, 'vo')}
        />
      </div>

      <More label="The dynamic window approach, step by step (Fox, Burgard & Thrun)">
        <Rich
          text={`Every control period $\\Delta t$:

1. **Window.** Velocities reachable from the current $(v, \\omega)$ within $\\Delta t$: $$V_d = [v - \\dot v_{max}\\Delta t,\\ v + \\dot v_{max}\\Delta t] \\times [\\omega - \\dot\\omega_{max}\\Delta t,\\ \\omega + \\dot\\omega_{max}\\Delta t],$$ intersected with the box $V_s = [0, v_{max}] \\times [-\\omega_{max}, \\omega_{max}]$.
2. **Sample** it (here ${cfg.nv} × ${cfg.nw}) and **simulate** each constant-$(v, \\omega)$ arc for the horizon $T$ (radius $r = v/\\omega$).
3. **Admissible?** Keep a sample only if the robot could still stop before the nearest obstacle on its arc: $$\\frac{v^2}{2\\dot v_{max}} \\le \\mathrm{dist}(v, \\omega)$$ This is the test to use by hand. The simulation is a little stricter: it adds $v\\Delta t/2$ (the chosen command is held for one period before braking can start) and a 2 cm margin, and it also rejects arcs that meet the pedestrian’s predicted position within $T$.
4. **Score** the admissible ones: $$G(v, \\omega) = w_h\\,\\text{heading} + w_c\\,\\text{clearance} + w_v\\,\\text{velocity}$$ with heading $= 1 - |\\text{angle to G at the end of the arc}|/\\pi$, clearance $= \\mathrm{dist}/2\\ \\text{m}$ (capped at 1), velocity $= v/v_{max}$.
5. **Execute** the best for $\\Delta t$ (none admissible: brake), then repeat from the new state.

**Strengths:** respects the robot’s dynamics, cheap, reacts to moving obstacles. **Weaknesses:** it only looks $T$ ahead, so U-shaped obstacles trap it (it needs a global planner above it), and its behaviour depends on hand-tuned weights.`}
        />
      </More>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function SampleDetails({ k, cfg, best }: { k: Cand; cfg: DwaCfg; best: boolean }) {
  const rows: [string, number, number][] = [
    ['heading', k.sHeading, cfg.wHeading],
    ['clearance', k.sClear, cfg.wClear],
    ['velocity', k.sVel, cfg.wVel],
  ];
  const free = Number.isFinite(k.hitDist) ? `${fmt(k.hitDist, 3)} m` : `more than ${fmt(Math.max(cfg.clearCap, k.needDist + 0.1), 2)} m`;
  // needDist = v²/(2v̇) + vΔt/2 + 2 cm: the braking distance, the extra from holding the command for one period
  // before braking can start (exact for piecewise-constant commands), and a safety margin.
  const need = `${fmt(k.needDist, 3)} m to stop ($v^2/2\\dot v_{max}$ = ${fmt(k.stopDist, 3)} m of braking, $+\\ v\\Delta t/2$ = ${fmt((k.v * cfg.dt) / 2, 3)} m because the command is held for one period before braking can start, + 2 cm margin)`;
  return (
    <div className="plan-local-twocol">
      <div>
        <Rich
          className="small"
          text={`**$v$ = ${fmt(k.v, 3)} m/s, $\\omega$ = ${fmt(Math.abs(k.w) < 1e-6 ? 0 : k.w, 3)} rad/s** ${
            Math.abs(k.w) < 1e-6 ? '(straight)' : k.v < 1e-6 ? '(turning on the spot)' : `(radius $r = v/\\omega$ = ${fmt(Math.abs(k.v / k.w), 3)} m, turning ${k.w > 0 ? 'left' : 'right'})`
          }`}
        />
        <table className="plan-local-table">
          <thead>
            <tr>
              <th>term</th>
              <th>score</th>
              <th>× weight</th>
              <th>= part of G</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([n, s, w]) => (
              <tr key={n}>
                <td>{n}</td>
                <td>{s.toFixed(2)}</td>
                <td>{w.toFixed(2)}</td>
                <td>{(s * w).toFixed(3)}</td>
              </tr>
            ))}
            <tr className="is-best">
              <td>G</td>
              <td />
              <td />
              <td>{k.score.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <Rich
          className="small"
          text={
            k.reason === 'contact'
              ? '✗ The robot already touches an obstacle (it was dragged there): every sample is rejected.'
              : k.admissible && k.v < 1e-9
                ? `✓ **Admissible**: with $v$ = 0 the robot stands still (or turns on the spot), which is always safe.${best ? ' It has the highest $G$ of the admissible samples, so the robot does not move this period.' : ''}`
              : k.reason === 'moving'
                ? `✗ **Rejected**: on this arc the robot would meet the pedestrian’s predicted position within $T$ = ${fmt(cfg.horizon, 2)} s, whatever its score ($G$ would be ${k.score.toFixed(3)}).`
                : k.admissible
                  ? `✓ **Admissible**: it needs ${need}, and ${free} is free along its arc.${best ? ' Highest $G$ of the admissible samples, so it is executed for the next $\\Delta t$.' : ''}`
                  : `✗ **Rejected**: it needs ${need}, but only ${free} is free along its arc. Its score does not matter ($G$ would be ${k.score.toFixed(3)}).`
          }
        />
        <Rich className="note" text={`The scores are scaled to [0, 1]: heading $= 1 - |\\text{angle to G after } T|/\\pi$, clearance $= \\min(1, \\text{free distance}/2\\ \\text{m})$, velocity $= v/v_{max}$.`} />
      </div>
    </div>
  );
}

function paintMap(cv: HTMLCanvasElement | null, data: Uint8Array, rows: number, pal: { bad: [number, number, number]; mov: [number, number, number] }) {
  if (!cv) return;
  if (cv.width !== NWM || cv.height !== NVM) {
    cv.width = NWM;
    cv.height = NVM;
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(NWM, NVM);
  const d = img.data;
  for (let i = 0; i < rows; i++) {
    const r = NVM - 1 - i; // row 0 of the data is the lowest v: the bottom of the canvas
    for (let j = 0; j < NWM; j++) {
      const v = data[i * NWM + j];
      if (!v) continue;
      const o = (r * NWM + j) * 4;
      const c = v === 2 ? pal.mov : pal.bad;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = v === 2 ? 92 : 64;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// velocity-obstacle plot geometry (square, the origin in the middle)
const VOW = 300;
const VOP = 8;
const VOS = (VOW - 2 * VOP) / 2;
const voRange = (vMax: number) => Math.max(1.4, vMax * 1.35);
const VOX = (x: number, R: number) => VOW / 2 + (x / R) * VOS;
const VOY = (y: number, R: number) => VOW / 2 - (y / R) * VOS;
function voFromPx(q: { x: number; y: number }, R: number, vMax: number): Vec2 {
  let x = ((q.x - VOW / 2) / VOS) * R;
  let y = (-(q.y - VOW / 2) / VOS) * R;
  const s = Math.hypot(x, y);
  const lim = Math.max(vMax, R * 0.98);
  if (s > lim) {
    x = (x * lim) / s;
    y = (y * lim) / s;
  }
  return { x: r2(x), y: r2(y) };
}
